/**
 * DarkPool Deposit Screen — Multi-step deposit flow (extension popup, 360x600).
 *
 * Adapted from desktop DarkPoolDepositScreen with compact layout.
 * Deposits directly from popup using sessionMnemonic + rpc:call through service worker.
 */
import React, { useContext, useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { ethers, HDNodeWallet, Mnemonic } from 'ethers';
import { IconArrowLeft, IconShield, IconAlertTriangle } from '../icons';
import {
  Card, Button, COLORS, FONT_FAMILY, FONT_SIZE, FONT_WEIGHT, SPACING, RADIUS,
} from '@saiko-wallet/ui-kit';
import {
  DARKPOOL_TIERS, TIER_LABELS, DARK_POOL_ADDRESS, SAIKO_TOKEN_ADDRESS,
  formatDarkPoolFeeBreakdown,
  generateSecret, generateNullifier, computeCommitment,
  deriveViewingKey, calculateAmountAfterFee, saveNote,
} from '@saiko-wallet/wallet-core';
import type { DarkPoolNote } from '@saiko-wallet/wallet-core';
import { AppCtx } from '../context';
import { getNetworkById } from '../utils/network';

const SCREEN: CSSProperties = {
  minHeight: '600px', display: 'flex', flexDirection: 'column',
  backgroundColor: COLORS.background, padding: SPACING[4],
};

/** RPC call through service worker. */
async function rpcCall<T>(rpcUrl: string, method: string, params: unknown[]): Promise<T> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ action: 'rpc:call', rpcUrl, method, params }, (resp: any) => {
      if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
      if (resp?.error) return reject(new Error(resp.error.message ?? JSON.stringify(resp.error)));
      resolve(resp?.result as T);
    });
  });
}

async function waitForTx(rpcUrl: string, hash: string, timeout = 120_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const receipt = await rpcCall<any>(rpcUrl, 'eth_getTransactionReceipt', [hash]);
    if (receipt?.blockNumber) {
      if (BigInt(receipt.status) === 0n) throw new Error('Transaction reverted');
      return;
    }
    await new Promise(r => setTimeout(r, 3000));
  }
  throw new Error('Transaction confirmation timeout');
}

function formatBigInt(val: bigint): string {
  return val.toLocaleString('en-US');
}

export function DarkPoolDepositScreen(): React.ReactElement {
  const navigate = useNavigate();
  const { sessionMnemonic, addToast, walletAddress, activeNetworkId } = useContext(AppCtx);
  const rpcUrl = getNetworkById(activeNetworkId).rpcUrl;

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [selectedTier, setSelectedTier] = useState<number | null>(null);
  const [depositStatus, setDepositStatus] = useState('');

  const tierAmount = selectedTier !== null ? (DARKPOOL_TIERS[selectedTier] ?? 0n) : 0n;
  const breakdown = selectedTier !== null ? formatDarkPoolFeeBreakdown(tierAmount) : null;

  async function handleConfirm(): Promise<void> {
    if (selectedTier === null || !sessionMnemonic) {
      addToast({ type: 'error', message: 'Wallet is locked.' });
      return;
    }
    setStep(3);

    try {
      setDepositStatus('Generating commitment...');
      const secret = generateSecret();
      const nullifier = generateNullifier();
      const commitment = await computeCommitment(secret, nullifier);
      setDepositStatus('Deriving viewing key...');
      const viewingKey = await deriveViewingKey(secret);
      const amountAfterFee = calculateAmountAfterFee(tierAmount);

      const hdWallet = HDNodeWallet.fromMnemonic(
        Mnemonic.fromPhrase(sessionMnemonic), `m/44'/60'/0'/0/0`,
      );
      const walletAddr = hdWallet.address;
      const tierAmountWei = tierAmount * 10n ** 18n;

      // Check SAIKO balance
      setDepositStatus('Checking SAIKO balance...');
      const balanceOfData = '0x70a08231' +
        ethers.AbiCoder.defaultAbiCoder().encode(['address'], [walletAddr]).slice(2);
      const balResult = await rpcCall<string>(rpcUrl, 'eth_call', [
        { to: SAIKO_TOKEN_ADDRESS, data: balanceOfData }, 'latest',
      ]);
      const safeBalance = balResult && balResult !== '0x' ? BigInt(balResult) : 0n;
      if (safeBalance < tierAmountWei) {
        const humanBalance = (Number(safeBalance / 10n ** 15n) / 1000).toLocaleString();
        const humanNeeded = Number(tierAmountWei / 10n ** 18n).toLocaleString();
        throw new Error(`Insufficient SAIKO. Have ${humanBalance}, need ${humanNeeded}.`);
      }

      // Check ETH balance for gas
      setDepositStatus('Checking ETH balance...');
      const [nonceHex, gasPriceHex, ethBalHex] = await Promise.all([
        rpcCall<string>(rpcUrl, 'eth_getTransactionCount', [walletAddr, 'latest']),
        rpcCall<string>(rpcUrl, 'eth_gasPrice', []),
        rpcCall<string>(rpcUrl, 'eth_getBalance', [walletAddr, 'latest']),
      ]);

      const ethBalance = BigInt(ethBalHex);
      const gasPrice = BigInt(gasPriceHex);
      const maxFee = gasPrice * 2n;
      const maxTip = 1_500_000_000n; // 1.5 gwei
      const APPROVE_GAS = 65_000n;
      const DEPOSIT_GAS = 1_300_000n;
      const requiredEth = (APPROVE_GAS + DEPOSIT_GAS) * maxFee;

      if (ethBalance < requiredEth) {
        const haveEth = (Number(ethBalance) / 1e18).toFixed(6);
        const needEth = (Number(requiredEth) / 1e18).toFixed(6);
        throw new Error(`Not enough ETH for gas. Have: ${haveEth}, Need: ~${needEth}`);
      }

      let nonce = Number(BigInt(nonceHex));
      const chainId = BigInt(getNetworkById(activeNetworkId).chainId);

      // 1. Approve
      setDepositStatus('Approving SAIKO spend...');
      const approveIface = new ethers.Interface(['function approve(address,uint256) returns (bool)']);
      const approveTx = ethers.Transaction.from({
        to: SAIKO_TOKEN_ADDRESS,
        data: approveIface.encodeFunctionData('approve', [DARK_POOL_ADDRESS, tierAmountWei]),
        value: 0n, nonce, gasLimit: APPROVE_GAS,
        maxFeePerGas: maxFee, maxPriorityFeePerGas: maxTip,
        chainId, type: 2,
      });
      const signedApprove = await hdWallet.signTransaction(approveTx);
      const approveHash = await rpcCall<string>(rpcUrl, 'eth_sendRawTransaction', [signedApprove]);
      setDepositStatus('Waiting for approval...');
      await waitForTx(rpcUrl, approveHash);
      nonce++;

      // 2. Deposit
      setDepositStatus('Sending deposit...');
      const depositIface = new ethers.Interface(['function deposit(bytes32 commitment, uint256 amount) external']);
      const depositTx = ethers.Transaction.from({
        to: DARK_POOL_ADDRESS,
        data: depositIface.encodeFunctionData('deposit', [commitment, tierAmountWei]),
        value: 0n, nonce, gasLimit: DEPOSIT_GAS,
        maxFeePerGas: maxFee, maxPriorityFeePerGas: maxTip,
        chainId, type: 2,
      });
      const signedDeposit = await hdWallet.signTransaction(depositTx);
      const depositHash = await rpcCall<string>(rpcUrl, 'eth_sendRawTransaction', [signedDeposit]);
      setDepositStatus(`Confirming deposit... (${depositHash.slice(0, 10)})`);
      await waitForTx(rpcUrl, depositHash);

      // Save note
      const note: DarkPoolNote = {
        secret, nullifier, commitment,
        amount: tierAmountWei,
        tier: selectedTier,
        timestamp: Date.now(),
        txHash: depositHash,
        viewingKey,
        isSpent: false,
      };

      try {
        const notesKey = walletAddress.toLowerCase() + ':saiko-darkpool-notes-v1';
        await saveNote(note, notesKey);
      } catch { /* non-critical */ }

      addToast({ type: 'success', message: `Deposit confirmed! Tx: ${depositHash.slice(0, 14)}...` });
      void navigate('/darkpool');
    } catch (err) {
      addToast({ type: 'error', message: `Deposit failed: ${err instanceof Error ? err.message : 'unknown'}` });
      setStep(2);
    }
  }

  return (
    <div style={SCREEN}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: SPACING[3], marginBottom: SPACING[4] }}>
        <button
          onClick={() => step === 1 ? void navigate('/darkpool') : setStep((step - 1) as 1 | 2)}
          style={{
            background: 'none', border: `1px solid ${COLORS.border}`, borderRadius: RADIUS.md,
            color: COLORS.textSecondary, cursor: 'pointer', padding: `${SPACING[2]} ${SPACING[3]}`,
            display: 'flex', alignItems: 'center',
          }}
        >
          <IconArrowLeft size={16} />
        </button>
        <div style={{ flex: 1 }}>
          <div style={{
            fontFamily: FONT_FAMILY.sans, fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.bold,
            color: COLORS.textPrimary, display: 'flex', alignItems: 'center', gap: SPACING[2],
          }}>
            <IconShield size={18} /> Deposit
          </div>
          <div style={{ fontFamily: FONT_FAMILY.sans, fontSize: FONT_SIZE.xs, color: COLORS.textMuted }}>
            Step {step} of 3
          </div>
        </div>
      </div>

      {/* Step 1: Tier Selection */}
      {step === 1 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: SPACING[3], flex: 1 }}>
          <div style={{
            fontFamily: FONT_FAMILY.sans, fontSize: FONT_SIZE.xs, color: COLORS.textMuted,
            textAlign: 'center', padding: SPACING[2], backgroundColor: COLORS.surface,
            borderRadius: RADIUS.md, border: `1px solid ${COLORS.border}`,
          }}>
            FIXED AMOUNTS — uniformity creates your anonymity set.
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: SPACING[3] }}>
            {DARKPOOL_TIERS.map((tier, i) => {
              const bd = formatDarkPoolFeeBreakdown(tier);
              const isSelected = selectedTier === i;
              return (
                <button
                  key={tier.toString()}
                  onClick={() => setSelectedTier(i)}
                  style={{
                    padding: SPACING[4],
                    backgroundColor: isSelected ? 'rgba(227,27,35,0.1)' : COLORS.surface,
                    border: `2px solid ${isSelected ? COLORS.primary : COLORS.border}`,
                    borderRadius: RADIUS.lg, cursor: 'pointer', textAlign: 'left',
                    display: 'flex', flexDirection: 'column', gap: SPACING[1],
                  }}
                >
                  <span style={{
                    fontFamily: FONT_FAMILY.mono, fontSize: FONT_SIZE.md,
                    fontWeight: FONT_WEIGHT.bold, color: COLORS.textPrimary,
                  }}>{TIER_LABELS[tier.toString()]}</span>
                  <span style={{
                    fontFamily: FONT_FAMILY.sans, fontSize: '10px', color: COLORS.textMuted,
                  }}>Fee: {formatBigInt(bd.fee)} SAIKO</span>
                </button>
              );
            })}
          </div>

          <div style={{ flex: 1 }} />
          <Button variant="primary" fullWidth disabled={selectedTier === null} onClick={() => setStep(2)}>
            Continue
          </Button>
        </div>
      )}

      {/* Step 2: Confirm */}
      {step === 2 && breakdown && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: SPACING[3], flex: 1 }}>
          <Card bordered>
            {[
              { label: 'Deposit Amount', value: `${formatBigInt(breakdown.tier)} SAIKO` },
              { label: 'Service Fee (0.5%)', value: `${formatBigInt(breakdown.fee)} SAIKO` },
              { label: 'Enters Pool', value: `${formatBigInt(breakdown.amountAfterFee)} SAIKO` },
            ].map(({ label, value }) => (
              <div key={label} style={{
                display: 'flex', justifyContent: 'space-between',
                padding: `${SPACING[2]} ${SPACING[3]}`, borderBottom: `1px solid ${COLORS.divider}`,
              }}>
                <span style={{ fontFamily: FONT_FAMILY.sans, fontSize: FONT_SIZE.xs, color: COLORS.textSecondary }}>
                  {label}
                </span>
                <span style={{
                  fontFamily: FONT_FAMILY.mono, fontSize: FONT_SIZE.xs,
                  fontWeight: FONT_WEIGHT.medium, color: COLORS.textPrimary,
                }}>{value}</span>
              </div>
            ))}
          </Card>

          <div style={{
            backgroundColor: 'rgba(227,27,35,0.08)', border: '1px solid rgba(227,27,35,0.3)',
            borderRadius: RADIUS.md, padding: SPACING[3],
            display: 'flex', alignItems: 'flex-start', gap: SPACING[2],
          }}>
            <IconAlertTriangle size={16} color={COLORS.error} style={{ flexShrink: 0, marginTop: '2px' }} />
            <span style={{
              fontFamily: FONT_FAMILY.sans, fontSize: FONT_SIZE.xs, color: COLORS.error, lineHeight: '1.4',
            }}>
              Back up your note immediately after deposit or funds are permanently lost.
            </span>
          </div>

          <div style={{ flex: 1 }} />
          <Button variant="primary" fullWidth onClick={() => void handleConfirm()}>
            Confirm Deposit
          </Button>
        </div>
      )}

      {/* Step 3: Processing */}
      {step === 3 && (
        <div style={{
          flex: 1, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: SPACING[4],
        }}>
          <div style={{
            width: 48, height: 48, borderRadius: '50%',
            border: `2px solid ${COLORS.primary}`,
            borderTopColor: 'transparent',
            animation: 'spin 1s linear infinite',
          }} />
          <div style={{ textAlign: 'center' }}>
            <div style={{
              fontFamily: FONT_FAMILY.sans, fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.bold,
              color: COLORS.textPrimary, marginBottom: SPACING[2],
            }}>Generating Private Note</div>
            <div style={{
              fontFamily: FONT_FAMILY.sans, fontSize: FONT_SIZE.xs, color: COLORS.textMuted,
            }}>{depositStatus || 'Preparing...'}</div>
          </div>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}
    </div>
  );
}
