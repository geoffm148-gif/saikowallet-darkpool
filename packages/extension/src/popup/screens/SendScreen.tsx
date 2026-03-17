/**
 * Send Screen — Transfer ETH or ERC-20 tokens (extension popup).
 */
import React, { useContext, useState, useCallback, useEffect, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { IconArrowLeft, IconArrowUpRight } from '../icons';
import {
  Button, Input, COLORS, FONT_FAMILY, FONT_SIZE, FONT_WEIGHT, SPACING, RADIUS,
} from '@saiko-wallet/ui-kit';
import { AppCtx } from '../context';
import { getNetworkById } from '../utils/network';
import { HDNodeWallet, Mnemonic, parseEther, getAddress, ethers } from 'ethers';
import { type StoredToken, loadCustomTokens, addCustomToken, SAIKO_BUILTIN } from '../utils/tokens';
import { fetchEthPrice, fetchTokenPrices } from '../utils/coingecko';

const SCREEN: CSSProperties = {
  minHeight: '600px',
  display: 'flex',
  flexDirection: 'column',
  backgroundColor: COLORS.background,
  padding: SPACING[4],
};

/** RPC call through service worker. */
async function rpcCall<T>(rpcUrl: string, method: string, params: unknown[]): Promise<T> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ action: 'rpc:call', rpcUrl, method, params }, (resp: any) => {
      if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
      if (resp?.error) return reject(new Error(typeof resp.error === 'string' ? resp.error : resp.error.message ?? JSON.stringify(resp.error)));
      resolve(resp?.result as T);
    });
  });
}

interface TokenOption {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  isNative: boolean;
  balance: string | null;
}

const ETH_NATIVE: TokenOption = {
  address: '', symbol: 'ETH', name: 'Ethereum', decimals: 18, isNative: true, balance: null,
};

/** Encode ERC-20 balanceOf(address) call. */
function encodeBalanceOf(owner: string): string {
  const addr = owner.toLowerCase().replace('0x', '').padStart(64, '0');
  return '0x70a08231' + addr;
}

/** Encode ERC-20 transfer(address,uint256) call data. */
function encodeTransfer(to: string, amount: bigint): string {
  const addr = to.toLowerCase().replace('0x', '').padStart(64, '0');
  const amt = amount.toString(16).padStart(64, '0');
  return '0xa9059cbb' + addr + amt;
}

/** Decode a uint256 hex result. */
function decodeUint256(hex: string): bigint {
  if (!hex || hex === '0x') return 0n;
  return BigInt(hex);
}

/** Decode a string result from ERC-20 name()/symbol(). */
function decodeString(hex: string): string {
  if (!hex || hex === '0x' || hex.length < 130) return '';
  try {
    const offset = parseInt(hex.slice(2, 66), 16) * 2;
    const len = parseInt(hex.slice(2 + offset, 2 + offset + 64), 16);
    const strHex = hex.slice(2 + offset + 64, 2 + offset + 64 + len * 2);
    const bytes = [];
    for (let i = 0; i < strHex.length; i += 2) {
      bytes.push(parseInt(strHex.slice(i, i + 2), 16));
    }
    return new TextDecoder().decode(new Uint8Array(bytes));
  } catch {
    return '';
  }
}

export function SendScreen(): React.ReactElement {
  const navigate = useNavigate();
  const { walletAddress, sessionMnemonic, activeNetworkId, activeAccountIndex, addToast } = useContext(AppCtx);

  const [to, setTo] = useState('');
  const [amount, setAmount] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [errors, setErrors] = useState<{ to?: string; amount?: string }>({});

  // Token selector state
  const [tokens, setTokens] = useState<TokenOption[]>([ETH_NATIVE]);
  const [selectedToken, setSelectedToken] = useState<TokenOption>(ETH_NATIVE);
  const [showTokenPicker, setShowTokenPicker] = useState(false);
  const [showAddToken, setShowAddToken] = useState(false);
  const [newTokenAddress, setNewTokenAddress] = useState('');
  const [addingToken, setAddingToken] = useState(false);
  const [tokenUsdPrice, setTokenUsdPrice] = useState<number | null>(null);
  const [ethGasBuffer, setEthGasBuffer] = useState(0.0001); // ETH to reserve for gas on Max

  const network = getNetworkById(activeNetworkId);

  // Load tokens and fetch balances
  const loadTokens = useCallback(async () => {
    if (!walletAddress) return;
    const rpcUrl = network.rpcUrl;
    const customTokens = await loadCustomTokens();

    const allStored: Array<StoredToken & { isNative?: boolean }> = [
      { address: '', symbol: 'ETH', name: 'Ethereum', decimals: 18, isNative: true },
      SAIKO_BUILTIN,
      ...customTokens,
    ];

    const withBalances: TokenOption[] = await Promise.all(
      allStored.map(async (t) => {
        let balance: string | null = null;
        try {
          if (t.isNative) {
            const hex = await rpcCall<string>(rpcUrl, 'eth_getBalance', [walletAddress, 'latest']);
            balance = (Number(BigInt(hex)) / 1e18).toFixed(4);
          } else {
            const data = encodeBalanceOf(walletAddress);
            const hex = await rpcCall<string>(rpcUrl, 'eth_call', [{ to: t.address, data }, 'latest']);
            const raw = decodeUint256(hex);
            balance = (Number(raw) / 10 ** t.decimals).toFixed(t.decimals <= 8 ? t.decimals : 4);
          }
        } catch {
          balance = '0';
        }
        return {
          address: t.address,
          symbol: t.symbol,
          name: t.name,
          decimals: t.decimals,
          isNative: !!t.isNative,
          balance,
        };
      }),
    );

    setTokens(withBalances);
    // Update selected token's balance
    const updated = withBalances.find(t => t.address.toLowerCase() === selectedToken.address.toLowerCase() && t.isNative === selectedToken.isNative);
    if (updated) setSelectedToken(updated);
  }, [walletAddress, network.rpcUrl, selectedToken.address, selectedToken.isNative]);

  useEffect(() => { void loadTokens(); }, [loadTokens]);

  // Fetch current gas price to compute accurate ETH gas buffer for Max button
  useEffect(() => {
    const fetchGasBuffer = async () => {
      try {
        const feeHex = await rpcCall<string>(network.rpcUrl, 'eth_gasPrice', []);
        const gasPrice = BigInt(feeHex);
        // gasPrice * 21000 * 2 (2x safety buffer), converted to ETH
        const bufferWei = gasPrice * 21_000n * 2n;
        const bufferEth = Number(bufferWei) / 1e18;
        // Clamp: min 0.000005 ETH (~1 gwei), max 0.01 ETH (emergency high gas)
        setEthGasBuffer(Math.max(0.000005, Math.min(0.01, bufferEth)));
      } catch { /* keep default */ }
    };
    void fetchGasBuffer();
  }, [network.rpcUrl]);

  // Fetch USD price for the selected token
  useEffect(() => {
    let cancelled = false;
    const fetch = async () => {
      try {
        if (selectedToken.isNative) {
          const price = await fetchEthPrice();
          if (!cancelled) setTokenUsdPrice(price);
        } else {
          const prices = await fetchTokenPrices([selectedToken.address]);
          const price = prices[selectedToken.address.toLowerCase()] ?? null;
          if (!cancelled) setTokenUsdPrice(price);
        }
      } catch {
        if (!cancelled) setTokenUsdPrice(null);
      }
    };
    void fetch();
    return () => { cancelled = true; };
  }, [selectedToken.address, selectedToken.isNative]);

  // Add custom token by contract address
  const handleAddToken = useCallback(async () => {
    if (!newTokenAddress) return;
    setAddingToken(true);
    try {
      const addr = getAddress(newTokenAddress);
      const rpcUrl = network.rpcUrl;

      // Fetch name, symbol, decimals via eth_call
      const [nameHex, symbolHex, decimalsHex] = await Promise.all([
        rpcCall<string>(rpcUrl, 'eth_call', [{ to: addr, data: '0x06fdde03' }, 'latest']),
        rpcCall<string>(rpcUrl, 'eth_call', [{ to: addr, data: '0x95d89b41' }, 'latest']),
        rpcCall<string>(rpcUrl, 'eth_call', [{ to: addr, data: '0x313ce567' }, 'latest']),
      ]);

      const name = decodeString(nameHex) || 'Unknown';
      const symbol = decodeString(symbolHex) || '???';
      const decimals = Number(decodeUint256(decimalsHex));

      await addCustomToken({ address: addr, symbol, name, decimals });
      addToast({ type: 'success', message: `Added ${symbol}` });
      setNewTokenAddress('');
      setShowAddToken(false);
      void loadTokens();
    } catch (err) {
      addToast({ type: 'error', message: (err as Error).message || 'Failed to add token' });
    } finally {
      setAddingToken(false);
    }
  }, [newTokenAddress, network.rpcUrl, addToast, loadTokens]);

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
      const rpcUrl = network.rpcUrl;
      const nonceHex = await rpcCall<string>(rpcUrl, 'eth_getTransactionCount', [walletAddress, 'pending']);
      const nonce = parseInt(nonceHex, 16);

      const feeHex = await rpcCall<string>(rpcUrl, 'eth_gasPrice', []);
      const baseFee = BigInt(feeHex);
      const maxPriorityFeePerGas = baseFee / 10n || 1n;
      const maxFeePerGas = baseFee * 2n + maxPriorityFeePerGas;

      const path = `m/44'/60'/0'/0/${activeAccountIndex}`;
      const hdWallet = HDNodeWallet.fromMnemonic(Mnemonic.fromPhrase(sessionMnemonic), path);

      let tx: ethers.Transaction;

      if (selectedToken.isNative) {
        // Native ETH transfer — estimate gas with 20% buffer
        let gasLimit = 21_000n;
        try {
          const estimated = await rpcCall<string>(rpcUrl, 'eth_estimateGas', [{
            from: walletAddress, to: getAddress(to), value: `0x${parseEther(amount).toString(16)}`,
          }]);
          gasLimit = BigInt(estimated) * 12n / 10n;
        } catch { /* use default */ }

        tx = ethers.Transaction.from({
          to: getAddress(to),
          value: parseEther(amount),
          nonce,
          maxFeePerGas,
          maxPriorityFeePerGas,
          gasLimit,
          chainId: BigInt(network.chainId),
          type: 2,
        });
      } else {
        // ERC-20 transfer — estimate gas with 30% buffer (tokens can be complex)
        const amountWei = ethers.parseUnits(amount, selectedToken.decimals);
        const data = encodeTransfer(getAddress(to), amountWei);
        let gasLimit = 120_000n;
        try {
          const estimated = await rpcCall<string>(rpcUrl, 'eth_estimateGas', [{
            from: walletAddress, to: getAddress(selectedToken.address), data, value: '0x0',
          }]);
          gasLimit = BigInt(estimated) * 13n / 10n;
        } catch { /* use default */ }

        tx = ethers.Transaction.from({
          to: getAddress(selectedToken.address),
          value: 0n,
          data,
          nonce,
          maxFeePerGas,
          maxPriorityFeePerGas,
          gasLimit,
          chainId: BigInt(network.chainId),
          type: 2,
        });
      }

      const signed = await hdWallet.signTransaction(tx);
      const hash = await rpcCall<string>(rpcUrl, 'eth_sendRawTransaction', [signed]);

      setTxHash(hash);
      addToast({ type: 'success', message: 'Transaction sent!' });
    } catch (err) {
      addToast({ type: 'error', message: (err as Error).message || 'Transaction failed' });
    } finally {
      setIsSending(false);
    }
  }, [validate, sessionMnemonic, walletAddress, to, amount, network, activeAccountIndex, addToast, selectedToken]);

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
      <div style={{ display: 'flex', alignItems: 'center', gap: SPACING[3], marginBottom: SPACING[4] }}>
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
          SEND {selectedToken.symbol}
        </h1>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: SPACING[3], flex: 1 }}>
        {/* Token Selector */}
        <div>
          <div style={{
            fontFamily: FONT_FAMILY.sans, fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.medium,
            color: COLORS.textSecondary, marginBottom: SPACING[2], letterSpacing: '0.04em',
          }}>
            Token
          </div>
          <button
            onClick={() => setShowTokenPicker(true)}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: `${SPACING[3]} ${SPACING[4]}`, backgroundColor: COLORS.surface,
              border: `1px solid ${COLORS.border}`, borderRadius: RADIUS.md, cursor: 'pointer',
              fontFamily: FONT_FAMILY.sans, fontSize: FONT_SIZE.base, color: COLORS.textPrimary,
            }}
          >
            <span style={{ fontWeight: FONT_WEIGHT.semibold }}>{selectedToken.symbol}</span>
            <span style={{ fontSize: FONT_SIZE.xs, color: COLORS.textMuted }}>
              Balance: {selectedToken.balance ?? '...'} ▼
            </span>
          </button>
        </div>

        <Input
          label="Recipient Address"
          value={to}
          onChange={setTo}
          placeholder="0x..."
          monospace
          {...(errors.to ? { error: errors.to } : {})}
        />
        <div>
          <Input
            label={`Amount (${selectedToken.symbol})`}
            value={amount}
            onChange={setAmount}
            placeholder="0.01"
            {...(errors.amount ? { error: errors.amount } : {})}
          />
          {/* % quick-fill buttons */}
          {selectedToken.balance && parseFloat(selectedToken.balance) > 0 && (
            <div style={{ display: 'flex', gap: SPACING[1], marginTop: SPACING[2], flexWrap: 'wrap' }}>
              {[25, 50, 75].map(pct => (
                <button
                  key={pct}
                  onClick={() => {
                    const bal = parseFloat(selectedToken.balance!);
                    const val = (bal * pct / 100).toFixed(selectedToken.decimals <= 6 ? selectedToken.decimals : 6);
                    setAmount(val);
                    setErrors({});
                  }}
                  style={{
                    padding: '3px 10px', backgroundColor: COLORS.surface,
                    border: `1px solid ${COLORS.border}`, borderRadius: RADIUS.full,
                    fontFamily: FONT_FAMILY.sans, fontSize: '11px', fontWeight: FONT_WEIGHT.medium,
                    color: COLORS.textMuted, cursor: 'pointer',
                  }}
                >{pct}%</button>
              ))}
              <button
                onClick={() => {
                  const bal = parseFloat(selectedToken.balance!);
                  const val = selectedToken.isNative && bal > ethGasBuffer
                    ? (bal - ethGasBuffer).toFixed(6)
                    : selectedToken.balance!;
                  setAmount(val);
                  setErrors({});
                }}
                style={{
                  padding: '3px 10px', backgroundColor: COLORS.surface,
                  border: `1px solid ${COLORS.primary}44`, borderRadius: RADIUS.full,
                  fontFamily: FONT_FAMILY.sans, fontSize: '11px', fontWeight: FONT_WEIGHT.medium,
                  color: COLORS.primary, cursor: 'pointer',
                }}
              >Max</button>
            </div>
          )}
          {/* USD value */}
          {amount && tokenUsdPrice && parseFloat(amount) > 0 && (
            <div style={{
              marginTop: SPACING[1],
              fontFamily: FONT_FAMILY.sans, fontSize: '11px', color: COLORS.textMuted,
            }}>
              ≈ ${(parseFloat(amount) * tokenUsdPrice).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD
            </div>
          )}
        </div>

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
            <IconArrowUpRight size={18} /> Send {selectedToken.symbol}
          </span>
        </Button>
      </div>

      {/* Token Picker Modal */}
      {showTokenPicker && (
        <div style={{
          position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 100,
          display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
        }} onClick={() => setShowTokenPicker(false)}>
          <div
            onClick={e => e.stopPropagation()}
            style={{
              width: '100%', maxWidth: 360, maxHeight: '70%', backgroundColor: COLORS.background,
              borderRadius: `${RADIUS.lg} ${RADIUS.lg} 0 0`, padding: SPACING[4],
              display: 'flex', flexDirection: 'column', gap: SPACING[2],
              overflowY: 'auto',
            }}
          >
            <div style={{
              fontFamily: FONT_FAMILY.sans, fontSize: FONT_SIZE.base, fontWeight: FONT_WEIGHT.bold,
              color: COLORS.textPrimary, marginBottom: SPACING[2],
            }}>
              Select Token
            </div>
            {tokens.map(t => (
              <button
                key={t.isNative ? 'ETH' : t.address}
                onClick={() => { setSelectedToken(t); setShowTokenPicker(false); }}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: `${SPACING[3]} ${SPACING[3]}`, backgroundColor:
                    (t.address === selectedToken.address && t.isNative === selectedToken.isNative)
                      ? `${COLORS.primary}14` : COLORS.surface,
                  border: `1px solid ${COLORS.border}`, borderRadius: RADIUS.md, cursor: 'pointer',
                  fontFamily: FONT_FAMILY.sans, color: COLORS.textPrimary,
                }}
              >
                <div>
                  <div style={{ fontWeight: FONT_WEIGHT.semibold, fontSize: FONT_SIZE.sm }}>{t.symbol}</div>
                  <div style={{ fontSize: '11px', color: COLORS.textMuted }}>{t.name}</div>
                </div>
                <div style={{ fontFamily: FONT_FAMILY.mono, fontSize: FONT_SIZE.xs, color: COLORS.textSecondary }}>
                  {t.balance ?? '...'}
                </div>
              </button>
            ))}
            <button
              onClick={() => { setShowTokenPicker(false); setShowAddToken(true); }}
              style={{
                width: '100%', padding: `${SPACING[2]} ${SPACING[3]}`, border: `1px dashed ${COLORS.border}`,
                borderRadius: RADIUS.md, cursor: 'pointer', backgroundColor: 'transparent',
                fontFamily: FONT_FAMILY.sans, fontSize: FONT_SIZE.sm, color: COLORS.primary,
                textAlign: 'center',
              }}
            >
              + Add Custom Token
            </button>
          </div>
        </div>
      )}

      {/* Add Token Modal */}
      {showAddToken && (
        <div style={{
          position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 100,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: SPACING[4],
        }} onClick={() => setShowAddToken(false)}>
          <div
            onClick={e => e.stopPropagation()}
            style={{
              width: '100%', maxWidth: 340, backgroundColor: COLORS.background,
              borderRadius: RADIUS.lg, padding: SPACING[4],
              display: 'flex', flexDirection: 'column', gap: SPACING[3],
            }}
          >
            <div style={{
              fontFamily: FONT_FAMILY.sans, fontSize: FONT_SIZE.base, fontWeight: FONT_WEIGHT.bold,
              color: COLORS.textPrimary,
            }}>
              Add Custom Token
            </div>
            <Input
              label="Contract Address"
              value={newTokenAddress}
              onChange={setNewTokenAddress}
              placeholder="0x..."
              monospace
            />
            <div style={{ display: 'flex', gap: SPACING[2] }}>
              <Button variant="secondary" fullWidth onClick={() => setShowAddToken(false)}>
                Cancel
              </Button>
              <Button
                variant="primary" fullWidth isLoading={addingToken}
                disabled={newTokenAddress.length < 42}
                onClick={() => void handleAddToken()}
              >
                Add
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
