/**
 * Approval Screen — shown in a popup window when a dApp requests connection, signing, or transaction.
 * Reads request details from URL params. On approve, performs the actual signing/tx in this context
 * (has access to ethers + session mnemonic), then sends the result back to the service worker.
 */
import React, { useState, useEffect, type CSSProperties } from 'react';
import {
  Button, COLORS, FONT_FAMILY, FONT_SIZE, FONT_WEIGHT, SPACING, RADIUS,
} from '@saiko-wallet/ui-kit';
import { HDNodeWallet, Mnemonic, getAddress, hashMessage, SigningKey, Transaction } from 'ethers';
import { IconAlertTriangle, IconCheckCircle2, IconGlobe } from '../icons';

const SCREEN: CSSProperties = {
  minHeight: '100vh',
  display: 'flex',
  flexDirection: 'column',
  backgroundColor: COLORS.background,
  padding: SPACING[4],
};

const BASE_PATH = "m/44'/60'/0'/0";

function deriveWallet(mnemonic: string, index: number): HDNodeWallet {
  return HDNodeWallet.fromMnemonic(Mnemonic.fromPhrase(mnemonic), `${BASE_PATH}/${index}`);
}

async function getRpcUrl(): Promise<string> {
  return new Promise((resolve) => {
    chrome.storage.local.get('saiko:state', (result) => {
      const state = result['saiko:state'] as Record<string, unknown> | undefined;
      const networkId = (state?.networkId as string) ?? 'mainnet';
      resolve(networkId === 'sepolia'
        ? 'https://ethereum-sepolia-rpc.publicnode.com'
        : 'https://ethereum.publicnode.com');
    });
  });
}

async function rpcCall(rpcUrl: string, method: string, params: unknown[]): Promise<unknown> {
  const resp = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  const json = await resp.json() as { result?: unknown; error?: { message: string } };
  if (json.error) throw new Error(json.error.message);
  return json.result;
}

export function ApprovalScreen(): React.ReactElement {
  const urlParams = new URLSearchParams(window.location.search);
  const requestId = urlParams.get('requestId') ?? '';
  const type = urlParams.get('type') as 'connect' | 'sign' | 'sendTx';
  const origin = urlParams.get('origin') ?? '';
  const paramsRaw = urlParams.get('params');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let params: any = null;
  try { params = paramsRaw ? JSON.parse(paramsRaw) : null; } catch { /* malformed */ }

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [walletAddress, setWalletAddress] = useState('');

  useEffect(() => {
    chrome.storage.local.get('saiko:state', (result) => {
      const state = result['saiko:state'] as Record<string, unknown> | undefined;
      setWalletAddress((state?.address as string) ?? '');
    });
  }, []);

  const handleApprove = async () => {
    setLoading(true);
    setError('');
    try {
      if (type === 'connect') {
        await chrome.runtime.sendMessage({ action: 'wallet:approveRequest', requestId, result: null });
        window.close();
        return;
      }

      // Get mnemonic + active account index from session/storage
      const session = await chrome.storage.session.get('mnemonic');
      const mnemonic = session.mnemonic as string | undefined;
      if (!mnemonic) { setError('Wallet is locked'); setLoading(false); return; }

      const acctResult = await chrome.storage.local.get('saiko:accounts');
      const acctData = acctResult['saiko:accounts'] as { activeIndex?: number } | undefined;
      const activeIndex = acctData?.activeIndex ?? 0;
      const wallet = deriveWallet(mnemonic, activeIndex);

      if (type === 'sign') {
        const signMethod = params?.method as string;
        let signedResult: string;

        if (signMethod === 'personal_sign') {
          const msgParam = params?.params?.[0] as string;
          // personal_sign: first param is hex-encoded message
          let messageBytes: Uint8Array;
          if (msgParam?.startsWith('0x')) {
            messageBytes = new Uint8Array(msgParam.slice(2).match(/.{2}/g)!.map((b: string) => parseInt(b, 16)));
          } else {
            messageBytes = new TextEncoder().encode(msgParam ?? '');
          }
          const digest = hashMessage(messageBytes);
          const signingKey = new SigningKey(wallet.privateKey);
          const sig = signingKey.sign(digest);
          signedResult = sig.serialized;
        } else {
          // eth_signTypedData_v4 — sign the structured data hash
          // For now, use wallet.signMessage as a fallback
          const typedData = params?.params?.[1] as string;
          signedResult = await wallet.signMessage(typedData ?? '');
        }

        await chrome.runtime.sendMessage({ action: 'wallet:approveRequest', requestId, result: signedResult });
        window.close();
        return;
      }

      if (type === 'sendTx') {
        // Build, sign, and broadcast the transaction
        const rpcUrl = await getRpcUrl();
        const txParams = params as Record<string, unknown> ?? {};

        const from = getAddress(wallet.address);
        const to = txParams.to as string | undefined;
        const value = txParams.value as string ?? '0x0';
        const data = txParams.data as string ?? '0x';

        // Get nonce and chain info
        const nonce = await rpcCall(rpcUrl, 'eth_getTransactionCount', [from, 'latest']) as string;
        const chainIdHex = await rpcCall(rpcUrl, 'eth_chainId', []) as string;

        // Get gas estimate
        let gasLimit = txParams.gas as string | undefined ?? txParams.gasLimit as string | undefined;
        if (!gasLimit) {
          gasLimit = await rpcCall(rpcUrl, 'eth_estimateGas', [{ from, to, value, data }]) as string;
        }

        // Get fee data
        const feeHistory = await rpcCall(rpcUrl, 'eth_feeHistory', ['0x1', 'latest', [50]]) as {
          baseFeePerGas: string[]; reward: string[][];
        };
        const baseFee = BigInt(feeHistory.baseFeePerGas[0] ?? '0x0');
        const priorityFee = BigInt(feeHistory.reward?.[0]?.[0] ?? '0x59682f00'); // 1.5 gwei fallback
        const maxPriorityFeePerGas = priorityFee;
        const maxFeePerGas = baseFee * 2n + priorityFee;

        const tx = Transaction.from({
          type: 2,
          to,
          value: BigInt(value),
          data,
          nonce: Number(nonce),
          gasLimit: BigInt(gasLimit),
          maxFeePerGas,
          maxPriorityFeePerGas,
          chainId: BigInt(chainIdHex),
        });

        const signingKey = new SigningKey(wallet.privateKey);
        const sig = signingKey.sign(tx.unsignedHash);
        const signedTx = tx.clone();
        signedTx.signature = sig;
        const serialized = signedTx.serialized;

        const txHash = await rpcCall(rpcUrl, 'eth_sendRawTransaction', [serialized]) as string;
        await chrome.runtime.sendMessage({ action: 'wallet:approveRequest', requestId, result: txHash });
        window.close();
        return;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to process request');
      setLoading(false);
    }
  };

  const handleReject = async () => {
    await chrome.runtime.sendMessage({ action: 'wallet:rejectRequest', requestId });
    window.close();
  };

  const shortAddr = walletAddress
    ? `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`
    : '';

  return (
    <div style={SCREEN}>
      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: SPACING[4] }}>
        <div style={{
          width: '48px', height: '48px', borderRadius: '50%',
          backgroundColor: COLORS.surface, display: 'flex',
          alignItems: 'center', justifyContent: 'center',
          margin: '0 auto', marginBottom: SPACING[3],
        }}>
          {type === 'connect'
            ? <IconGlobe size={24} color={COLORS.primary} />
            : <IconAlertTriangle size={24} color={COLORS.warning} />}
        </div>
        <h2 style={{
          fontFamily: FONT_FAMILY.sans, fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.bold,
          color: COLORS.textPrimary, margin: 0,
        }}>
          {type === 'connect' && 'Connection Request'}
          {type === 'sign' && 'Signature Request'}
          {type === 'sendTx' && 'Transaction Request'}
        </h2>
      </div>

      {/* Origin */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: SPACING[2],
        padding: SPACING[3], backgroundColor: COLORS.surface,
        borderRadius: RADIUS.md, marginBottom: SPACING[3],
      }}>
        <img
          src={`${origin}/favicon.ico`}
          width={20} height={20}
          style={{ borderRadius: '4px' }}
          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          alt=""
        />
        <div style={{
          fontFamily: FONT_FAMILY.mono, fontSize: FONT_SIZE.xs,
          color: COLORS.textPrimary, wordBreak: 'break-all',
        }}>
          {origin}
        </div>
      </div>

      {/* Wallet info */}
      {shortAddr && (
        <div style={{
          fontFamily: FONT_FAMILY.mono, fontSize: '11px', color: COLORS.textMuted,
          textAlign: 'center', marginBottom: SPACING[3],
        }}>
          Wallet: {shortAddr}
        </div>
      )}

      {/* Request details */}
      <div style={{ flex: 1, marginBottom: SPACING[4] }}>
        {type === 'connect' && (
          <div style={{
            padding: SPACING[3], backgroundColor: COLORS.surface,
            borderRadius: RADIUS.md,
          }}>
            <div style={{
              fontFamily: FONT_FAMILY.sans, fontSize: FONT_SIZE.sm,
              color: COLORS.textSecondary, marginBottom: SPACING[2],
            }}>
              This site wants to:
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: SPACING[2], marginBottom: SPACING[1] }}>
              <IconCheckCircle2 size={14} color={COLORS.success} />
              <span style={{ fontFamily: FONT_FAMILY.sans, fontSize: FONT_SIZE.xs, color: COLORS.textPrimary }}>
                View your wallet address
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: SPACING[2] }}>
              <IconCheckCircle2 size={14} color={COLORS.success} />
              <span style={{ fontFamily: FONT_FAMILY.sans, fontSize: FONT_SIZE.xs, color: COLORS.textPrimary }}>
                Request transaction approval
              </span>
            </div>
          </div>
        )}

        {type === 'sign' && (
          <div style={{
            padding: SPACING[3], backgroundColor: COLORS.surface,
            borderRadius: RADIUS.md,
          }}>
            <div style={{
              fontFamily: FONT_FAMILY.sans, fontSize: FONT_SIZE.sm,
              color: COLORS.textSecondary, marginBottom: SPACING[2],
            }}>
              Message to sign:
            </div>
            <div style={{
              fontFamily: FONT_FAMILY.mono, fontSize: FONT_SIZE.xs,
              color: COLORS.textPrimary, backgroundColor: COLORS.background,
              borderRadius: RADIUS.sm, padding: SPACING[2],
              maxHeight: '200px', overflowY: 'auto', wordBreak: 'break-word',
            }}>
              {params?.displayMessage ?? '(binary data)'}
            </div>
          </div>
        )}

        {type === 'sendTx' && (
          <div style={{
            padding: SPACING[3], backgroundColor: COLORS.surface,
            borderRadius: RADIUS.md, display: 'flex', flexDirection: 'column', gap: SPACING[2],
          }}>
            {params?.to && (
              <div>
                <div style={{ fontFamily: FONT_FAMILY.sans, fontSize: '11px', color: COLORS.textMuted }}>To</div>
                <div style={{
                  fontFamily: FONT_FAMILY.mono, fontSize: FONT_SIZE.xs,
                  color: COLORS.textPrimary, wordBreak: 'break-all',
                }}>
                  {params.to as string}
                </div>
              </div>
            )}
            {params?.value && params.value !== '0x0' && params.value !== '0x' && (
              <div>
                <div style={{ fontFamily: FONT_FAMILY.sans, fontSize: '11px', color: COLORS.textMuted }}>Value</div>
                <div style={{ fontFamily: FONT_FAMILY.mono, fontSize: FONT_SIZE.xs, color: COLORS.textPrimary }}>
                  {params.value as string}
                </div>
              </div>
            )}
            {params?.data && params.data !== '0x' && (
              <div>
                <div style={{ fontFamily: FONT_FAMILY.sans, fontSize: '11px', color: COLORS.textMuted }}>Data</div>
                <div style={{
                  fontFamily: FONT_FAMILY.mono, fontSize: '10px', color: COLORS.textSecondary,
                  maxHeight: '80px', overflowY: 'auto', wordBreak: 'break-all',
                }}>
                  {(params.data as string).slice(0, 200)}{(params.data as string).length > 200 ? '...' : ''}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div style={{
          fontFamily: FONT_FAMILY.sans, fontSize: FONT_SIZE.xs, color: COLORS.error,
          marginBottom: SPACING[3], textAlign: 'center',
        }}>
          {error}
        </div>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', gap: SPACING[3] }}>
        <Button variant="ghost" fullWidth onClick={() => void handleReject()} disabled={loading}>
          Reject
        </Button>
        <Button variant="primary" fullWidth onClick={() => void handleApprove()} isLoading={loading}>
          {type === 'connect' ? 'Connect' : 'Approve'}
        </Button>
      </div>
    </div>
  );
}
