/**
 * Send Screen — Transfer ETH (extension popup).
 */
import React, { useContext, useState, useCallback, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { IconArrowLeft, IconArrowUpRight } from '../icons';
import {
  Button, Input, COLORS, FONT_FAMILY, FONT_SIZE, FONT_WEIGHT, SPACING, RADIUS,
} from '@saiko-wallet/ui-kit';
import {
  buildEthTransferEip1559, signTransaction,
  createRpcClient, createProviderConfig, DEFAULT_MAINNET_PROVIDERS,
} from '@saiko-wallet/wallet-core';
import { AppCtx } from '../context';
import { getNetworkById } from '../utils/network';
import { HDNodeWallet, Mnemonic, parseEther, getAddress } from 'ethers';

const SCREEN: CSSProperties = {
  minHeight: '600px',
  display: 'flex',
  flexDirection: 'column',
  backgroundColor: COLORS.background,
  padding: SPACING[4],
};

export function SendScreen(): React.ReactElement {
  const navigate = useNavigate();
  const { walletAddress, sessionMnemonic, activeNetworkId, activeAccountIndex, addToast } = useContext(AppCtx);

  const [to, setTo] = useState('');
  const [amount, setAmount] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [errors, setErrors] = useState<{ to?: string; amount?: string }>({});

  const network = getNetworkById(activeNetworkId);

  const validate = useCallback((): boolean => {
    const errs: typeof errors = {};
    try { getAddress(to); } catch { errs.to = 'Invalid Ethereum address'; }
    const parsed = parseFloat(amount);
    if (isNaN(parsed) || parsed <= 0) errs.amount = 'Enter a valid amount';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }, [to, amount]);

  const handleSend = useCallback(async (): Promise<void> => {
    if (!validate() || !sessionMnemonic) return;
    setIsSending(true);
    try {
      const providers = network.chainId === 1
        ? [createProviderConfig(network.rpcUrl), ...DEFAULT_MAINNET_PROVIDERS]
        : [createProviderConfig(network.rpcUrl)];
      const rpc = createRpcClient({ providers, maxRetries: 3, chainId: network.chainId });

      const nonceHex = await rpc.send<string>({ method: 'eth_getTransactionCount', params: [walletAddress, 'latest'] });
      const nonce = parseInt(nonceHex, 16);

      const value = parseEther(amount);

      // Fetch current gas prices
      const feeHex = await rpc.send<string>({ method: 'eth_gasPrice', params: [] });
      const baseFee = BigInt(feeHex);
      const maxPriorityFeePerGas = baseFee / 10n || 1n; // ~10% tip
      const maxFeePerGas = baseFee * 2n + maxPriorityFeePerGas;

      const tx = buildEthTransferEip1559({
        from: walletAddress,
        to: getAddress(to),
        value,
        nonce,
        maxFeePerGas,
        maxPriorityFeePerGas,
        chainId: network.chainId,
      });

      const path = `m/44'/60'/0'/0/${activeAccountIndex}`;
      const wallet = HDNodeWallet.fromMnemonic(Mnemonic.fromPhrase(sessionMnemonic), path);

      const signed = await signTransaction(tx, wallet.privateKey);
      const hash = await rpc.send<string>({ method: 'eth_sendRawTransaction', params: [signed.serialized] });

      setTxHash(hash);
      addToast({ type: 'success', message: 'Transaction sent!' });
    } catch (err) {
      addToast({ type: 'error', message: (err as Error).message || 'Transaction failed' });
    } finally {
      setIsSending(false);
    }
  }, [validate, sessionMnemonic, walletAddress, to, amount, network, activeAccountIndex, addToast]);

  if (txHash) {
    return (
      <div style={{ ...SCREEN, alignItems: 'center', justifyContent: 'center', gap: SPACING[4] }}>
        <div style={{
          width: '56px', height: '56px', borderRadius: '50%',
          backgroundColor: `${COLORS.success}1A`, display: 'flex',
          alignItems: 'center', justifyContent: 'center',
        }}>
          <IconArrowUpRight size={28} color={COLORS.success} />
        </div>
        <h2 style={{
          fontFamily: FONT_FAMILY.sans, fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.bold,
          color: COLORS.textPrimary,
        }}>
          Transaction Sent
        </h2>
        <div style={{
          fontFamily: FONT_FAMILY.mono, fontSize: '11px', color: COLORS.textMuted,
          backgroundColor: COLORS.surface, borderRadius: RADIUS.md, padding: SPACING[3],
          wordBreak: 'break-all', width: '100%', textAlign: 'center',
        }}>
          {txHash}
        </div>
        <div style={{ display: 'flex', gap: SPACING[3], width: '100%' }}>
          <Button variant="secondary" fullWidth onClick={() => window.open(`${network.explorerUrl}/tx/${txHash}`, '_blank', 'noopener,noreferrer')}>
            View on Explorer
          </Button>
          <Button variant="primary" fullWidth onClick={() => void navigate('/dashboard')}>
            Done
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div style={SCREEN}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: SPACING[3], marginBottom: SPACING[6] }}>
        <button onClick={() => void navigate(-1)} style={{
          background: 'none', border: 'none', color: COLORS.textMuted, cursor: 'pointer',
          padding: SPACING[1], display: 'flex',
        }}>
          <IconArrowLeft size={20} />
        </button>
        <h1 style={{
          fontFamily: FONT_FAMILY.sans, fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.bold,
          color: COLORS.textPrimary, textTransform: 'uppercase',
        }}>
          SEND ETH
        </h1>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: SPACING[4], flex: 1 }}>
        <Input
          label="Recipient Address"
          value={to}
          onChange={setTo}
          placeholder="0x..."
          monospace
          {...(errors.to ? { error: errors.to } : {})}
        />
        <Input
          label="Amount (ETH)"
          value={amount}
          onChange={setAmount}
          placeholder="0.01"
          {...(errors.amount ? { error: errors.amount } : {})}
        />

        <div style={{
          fontFamily: FONT_FAMILY.sans, fontSize: '11px', color: COLORS.textMuted,
          textAlign: 'center',
        }}>
          From: {walletAddress.slice(0, 8)}...{walletAddress.slice(-6)}
        </div>
      </div>

      <div style={{ marginTop: 'auto', paddingTop: SPACING[4] }}>
        <Button
          variant="primary" fullWidth size="lg"
          isLoading={isSending}
          disabled={to.length === 0 || amount.length === 0 || !sessionMnemonic}
          onClick={() => void handleSend()}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: '6px', justifyContent: 'center' }}>
            <IconArrowUpRight size={18} /> Send
          </span>
        </Button>
      </div>
    </div>
  );
}
