/**
 * Swap Screen — Simplified DEX swap for extension popup (360x600).
 *
 * ETH <-> SAIKO toggle, amount input, live quotes via Uniswap V2.
 * Token pickers show held tokens (ETH, SAIKO, custom) with balances.
 */
import React, { useCallback, useContext, useEffect, useRef, useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { ethers, HDNodeWallet, Mnemonic } from 'ethers';
import { IconArrowLeft, IconArrowLeftRight, IconRefreshCw, IconSettings } from '../icons';
import {
  Button, Card, Input, COLORS, FONT_FAMILY, FONT_SIZE, FONT_WEIGHT, SPACING, RADIUS,
} from '@saiko-wallet/ui-kit';
import {
  getSwapTokens, fetchSwapQuote, buildSwapTransaction,
  SAIKO_TOKEN_ADDRESS, UNISWAP_V2_ROUTER,
  type SwapToken, type SwapQuote,
} from '@saiko-wallet/wallet-core';

/** Saiko Wallet treasury — receives 0.5% of all swap input */
const FEE_RECIPIENT = '0xbB54d3350e256D3660Ec35dc87FF52c18f541d6A';
import type { SwapQuoteInfo } from '@saiko-wallet/ui-kit';
import { AppCtx } from '../context';
import { getNetworkById } from '../utils/network';
import { loadCustomTokens, type StoredToken } from '../utils/tokens';
import { getKnownLogoUrl } from '../utils/coingecko';

const SCREEN: CSSProperties = {
  minHeight: '600px', display: 'flex', flexDirection: 'column',
  backgroundColor: COLORS.background, padding: SPACING[4],
};

/** Simple RPC call through service worker. */
async function rpcCall<T>(rpcUrl: string, method: string, params: unknown[]): Promise<T> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ action: 'rpc:call', rpcUrl, method, params }, (resp: any) => {
      if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
      if (resp?.error) return reject(new Error(resp.error.message ?? JSON.stringify(resp.error)));
      resolve(resp?.result as T);
    });
  });
}

interface HeldToken {
  symbol: string;
  name: string;
  address: string;
  decimals: number;
  balance: string;
  isNative: boolean;
}

export function SwapScreen(): React.ReactElement {
  const navigate = useNavigate();
  const ctx = useContext(AppCtx);
  const { addToast, sessionMnemonic, walletAddress, activeNetworkId } = ctx;
  const network = getNetworkById(activeNetworkId);
  const rpcUrl = network.rpcUrl;

  const allTokens = getSwapTokens();
  const ethToken = allTokens.find(t => t.symbol === 'ETH')!;
  const saikoToken = allTokens.find(t => t.symbol === 'SAIKO')!;

  const [inputToken, setInputToken] = useState<SwapToken>(ethToken);
  const [outputToken, setOutputToken] = useState<SwapToken>(saikoToken);
  const [inputAmount, setInputAmount] = useState('');
  const [outputAmount, setOutputAmount] = useState('');
  const [quote, setQuote] = useState<SwapQuoteInfo | null>(null);
  const [fullQuote, setFullQuote] = useState<SwapQuote | null>(null);
  const [isLoadingQuote, setIsLoadingQuote] = useState(false);
  const [isSwapping, setIsSwapping] = useState(false);
  const [ethBalance, setEthBalance] = useState<string | null>(null);
  const [saikoBalance, setSaikoBalance] = useState<string | null>(null);
  const [swapStatus, setSwapStatus] = useState('');
  const [impactAcknowledged, setImpactAcknowledged] = useState(false);
  const [customPct, setCustomPct] = useState('');
  const [showCustomPct, setShowCustomPct] = useState(false);
  const [slippage, setSlippage] = useState(0.5);
  const [showSlippage, setShowSlippage] = useState(false);
  const [customSlippage, setCustomSlippage] = useState('');

  // Token picker state
  const [heldTokens, setHeldTokens] = useState<HeldToken[]>([]);
  const [showInputPicker, setShowInputPicker] = useState(false);
  const [showOutputPicker, setShowOutputPicker] = useState(false);
  const [tokenSearch, setTokenSearch] = useState('');

  const quoteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fetch balances for all held tokens
  const fetchBalances = useCallback(async () => {
    if (!walletAddress) return;

    // ETH balance
    let ethBal = '0';
    try {
      const ethHex = await rpcCall<string>(rpcUrl, 'eth_getBalance', [walletAddress, 'latest']);
      ethBal = (Number(BigInt(ethHex)) / 1e18).toFixed(4);
      setEthBalance(ethBal);
    } catch { setEthBalance('0'); }

    // SAIKO balance
    let saikoBal = '0';
    try {
      const data = '0x70a08231' + ethers.AbiCoder.defaultAbiCoder().encode(['address'], [walletAddress]).slice(2);
      const result = await rpcCall<string>(rpcUrl, 'eth_call', [{ to: SAIKO_TOKEN_ADDRESS, data }, 'latest']);
      const raw = result && result !== '0x' ? BigInt(result) : 0n;
      saikoBal = (Number(raw) / 1e18).toFixed(0);
      setSaikoBalance(saikoBal);
    } catch { setSaikoBalance('0'); }

    // Build held tokens list
    const held: HeldToken[] = [
      { symbol: 'ETH', name: 'Ethereum', address: '', decimals: 18, balance: ethBal, isNative: true },
      { symbol: 'SAIKO', name: 'Saiko', address: SAIKO_TOKEN_ADDRESS, decimals: 18, balance: saikoBal, isNative: false },
    ];

    // Custom tokens
    const customTokens = await loadCustomTokens();
    for (const t of customTokens) {
      let balance = '0';
      try {
        const data = '0x70a08231' + ethers.AbiCoder.defaultAbiCoder().encode(['address'], [walletAddress]).slice(2);
        const hex = await rpcCall<string>(rpcUrl, 'eth_call', [{ to: t.address, data }, 'latest']);
        const raw = hex && hex !== '0x' ? BigInt(hex) : 0n;
        balance = (Number(raw) / 10 ** t.decimals).toFixed(t.decimals <= 8 ? t.decimals : 4);
      } catch { /* keep 0 */ }
      held.push({
        symbol: t.symbol, name: t.name, address: t.address,
        decimals: t.decimals, balance, isNative: false,
      });
    }
    setHeldTokens(held);
  }, [walletAddress, rpcUrl]);

  useEffect(() => { void fetchBalances(); }, [fetchBalances]);

  // Compute quote with debounce
  useEffect(() => {
    if (!inputAmount || parseFloat(inputAmount) <= 0) {
      setOutputAmount('');
      setQuote(null);
      return;
    }
    setIsLoadingQuote(true);
    if (quoteTimer.current) clearTimeout(quoteTimer.current);
    quoteTimer.current = setTimeout(async () => {
      try {
        const result = await fetchSwapQuote({
          inputToken, outputToken, inputAmount,
          slippageTolerance: slippage, rpcUrl,
        });
        setOutputAmount(result.outputAmount);
        setFullQuote(result);
        setImpactAcknowledged(false);
        setQuote({
          inputAmount: result.inputAmount,
          feeAmount: result.feeAmount,
          feeRate: result.feeRate,
          amountSwapped: result.amountSwapped,
          outputAmount: result.outputAmount,
          priceImpact: result.priceImpact,
          minimumReceived: result.minimumReceived,
          gasEstimate: result.gasEstimate,
          expiresAt: result.expiresAt,
        });
      } catch (err) {
        setOutputAmount('');
        setQuote(null);
        const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
        const friendly = msg.includes('liquidity') || msg.includes('insufficient')
          ? 'Insufficient liquidity for this amount — try a smaller trade'
          : 'Unable to get quote — try a smaller amount';
        addToast({ type: 'error', message: friendly });
      }
      setIsLoadingQuote(false);
    }, 500);
    return () => { if (quoteTimer.current) clearTimeout(quoteTimer.current); };
  }, [inputAmount, inputToken, outputToken, rpcUrl, slippage]);

  const handleFlip = () => {
    setInputToken(outputToken);
    setOutputToken(inputToken);
    setInputAmount('');
    setOutputAmount('');
    setQuote(null);
  };

  const handleAmountChange = (val: string) => {
    if (val !== '' && !/^\d*\.?\d*$/.test(val)) return;
    setInputAmount(val);
  };

  const selectInputToken = (held: HeldToken) => {
    // Find matching SwapToken or create one
    const match = allTokens.find(t => t.symbol === held.symbol) ??
      { symbol: held.symbol, name: held.name, address: held.address, decimals: held.decimals, logoUrl: '', featured: false };
    setInputToken(match);
    if (match.symbol === outputToken.symbol) {
      setOutputToken(inputToken);
    }
    setShowInputPicker(false);
    setTokenSearch('');
    setInputAmount('');
    setOutputAmount('');
    setQuote(null);
  };

  const selectOutputToken = (held: HeldToken) => {
    const match = allTokens.find(t => t.symbol === held.symbol) ??
      { symbol: held.symbol, name: held.name, address: held.address, decimals: held.decimals, logoUrl: '', featured: false };
    setOutputToken(match);
    if (match.symbol === inputToken.symbol) {
      setInputToken(outputToken);
    }
    setShowOutputPicker(false);
    setTokenSearch('');
    setInputAmount('');
    setOutputAmount('');
    setQuote(null);
  };

  const handleSwap = async () => {
    if (!quote || !fullQuote || !sessionMnemonic) return;
    setIsSwapping(true);
    try {
      const { activeAccountIndex } = ctx;
      const hdWallet = HDNodeWallet.fromMnemonic(
        Mnemonic.fromPhrase(sessionMnemonic), `m/44'/60'/0'/0/${activeAccountIndex}`,
      );

      const [nonceHex, feeHex] = await Promise.all([
        rpcCall<string>(rpcUrl, 'eth_getTransactionCount', [hdWallet.address, 'pending']),
        rpcCall<string>(rpcUrl, 'eth_gasPrice', []),
      ]);
      let nonce = Number(BigInt(nonceHex));
      const gasPrice = BigInt(feeHex);
      const desiredTip = 1_500_000_000n;
      const maxTip = desiredTip < gasPrice ? desiredTip : gasPrice;
      const maxFee = gasPrice + maxTip;

      // ── Fee collection ────────────────────────────────────────────────────
      const feeAmount = fullQuote.feeAmount && fullQuote.feeAmount !== '0'
        ? ethers.parseUnits(fullQuote.feeAmount, inputToken.decimals)
        : 0n;

      if (feeAmount > 0n) {
        if (inputToken.symbol === 'ETH') {
          // Send fee ETH to treasury
          setSwapStatus('Collecting fee...');
          const feeTx = ethers.Transaction.from({
            to: FEE_RECIPIENT,
            value: feeAmount,
            nonce, gasLimit: 21_000n,
            maxFeePerGas: maxFee, maxPriorityFeePerGas: maxTip,
            chainId: BigInt(network.chainId), type: 2,
          });
          const signedFee = await hdWallet.signTransaction(feeTx);
          const feeHash = await rpcCall<string>(rpcUrl, 'eth_sendRawTransaction', [signedFee]);
          setSwapStatus('Waiting for fee tx...');
          await waitForTx(rpcUrl, feeHash);
          nonce++;
        } else {
          // Transfer fee tokens to treasury
          setSwapStatus('Collecting fee...');
          const transferIface = new ethers.Interface(['function transfer(address,uint256) returns (bool)']);
          const feeTx = ethers.Transaction.from({
            to: inputToken.address,
            data: transferIface.encodeFunctionData('transfer', [FEE_RECIPIENT, feeAmount]),
            value: 0n, nonce, gasLimit: 65_000n,
            maxFeePerGas: maxFee, maxPriorityFeePerGas: maxTip,
            chainId: BigInt(network.chainId), type: 2,
          });
          const signedFee = await hdWallet.signTransaction(feeTx);
          const feeHash = await rpcCall<string>(rpcUrl, 'eth_sendRawTransaction', [signedFee]);
          setSwapStatus('Waiting for fee tx...');
          await waitForTx(rpcUrl, feeHash);
          nonce++;
        }
      }

      // ── Token approval (post-fee swap amount) ─────────────────────────────
      if (inputToken.symbol !== 'ETH') {
        setSwapStatus('Checking approval...');
        const swapAmount = ethers.parseUnits(fullQuote.amountSwapped, inputToken.decimals);
        const allowanceData = '0xdd62ed3e' + ethers.AbiCoder.defaultAbiCoder()
          .encode(['address', 'address'], [hdWallet.address, UNISWAP_V2_ROUTER]).slice(2);
        const allowanceHex = await rpcCall<string>(rpcUrl, 'eth_call', [
          { to: inputToken.address, data: allowanceData }, 'latest',
        ]);
        const allowance = allowanceHex && allowanceHex !== '0x' ? BigInt(allowanceHex) : 0n;

        if (allowance < swapAmount) {
          setSwapStatus('Approving token...');
          const approveIface = new ethers.Interface(['function approve(address,uint256) returns (bool)']);
          const approveTx = ethers.Transaction.from({
            to: inputToken.address,
            data: approveIface.encodeFunctionData('approve', [UNISWAP_V2_ROUTER, swapAmount]),
            value: 0n, nonce, gasLimit: 65_000n,
            maxFeePerGas: maxFee, maxPriorityFeePerGas: maxTip,
            chainId: BigInt(network.chainId), type: 2,
          });
          const signedApprove = await hdWallet.signTransaction(approveTx);
          const approveHash = await rpcCall<string>(rpcUrl, 'eth_sendRawTransaction', [signedApprove]);
          setSwapStatus('Waiting for approval...');
          await waitForTx(rpcUrl, approveHash);
          nonce++;
        }
      }

      setSwapStatus('Sending swap...');
      const swapTx = buildSwapTransaction(fullQuote, hdWallet.address);

      const tx = ethers.Transaction.from({
        to: swapTx.to,
        data: swapTx.data,
        value: BigInt(swapTx.value ?? '0'),
        nonce, gasLimit: 300_000n,
        maxFeePerGas: maxFee, maxPriorityFeePerGas: maxTip,
        chainId: BigInt(network.chainId), type: 2,
      });
      const signed = await hdWallet.signTransaction(tx);
      const txHash = await rpcCall<string>(rpcUrl, 'eth_sendRawTransaction', [signed]);
      setSwapStatus('Confirming...');
      await waitForTx(rpcUrl, txHash);

      addToast({ type: 'success', message: `Swap confirmed! ${txHash.slice(0, 14)}...` });
      setInputAmount('');
      setOutputAmount('');
      setQuote(null);
      setSwapStatus('');
      void fetchBalances();
    } catch (err) {
      addToast({ type: 'error', message: `Swap failed: ${(err instanceof Error ? err.message : 'Unknown').slice(0, 200)}` });
      setSwapStatus('');
    }
    setIsSwapping(false);
  };

  // Get balance for any token (ETH, SAIKO, or custom) from heldTokens list
  const getTokenBalance = (token: SwapToken): string | null => {
    const held = heldTokens.find(t =>
      token.address === '' || token.address === '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE'
        ? t.isNative
        : t.address.toLowerCase() === token.address.toLowerCase(),
    );
    return held?.balance ?? (token.symbol === 'ETH' ? ethBalance : token.symbol === 'SAIKO' ? saikoBalance : null);
  };
  const currentBalance = getTokenBalance(inputToken);
  const outputBalanceDisplay = getTokenBalance(outputToken);

  // Filter held tokens for search
  const filteredTokens = heldTokens.filter(t =>
    tokenSearch === '' ||
    t.symbol.toLowerCase().includes(tokenSearch.toLowerCase()) ||
    t.name.toLowerCase().includes(tokenSearch.toLowerCase()),
  );

  const tokenPickerModal = (
    side: 'input' | 'output',
    show: boolean,
    onClose: () => void,
    onSelect: (t: HeldToken) => void,
  ) => {
    if (!show) return null;
    return (
      <div style={{
        position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 100,
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      }} onClick={onClose}>
        <div
          onClick={e => e.stopPropagation()}
          style={{
            width: '100%', maxWidth: 360, maxHeight: '75%', backgroundColor: COLORS.background,
            borderRadius: `${RADIUS.lg} ${RADIUS.lg} 0 0`, padding: SPACING[4],
            display: 'flex', flexDirection: 'column', gap: SPACING[2],
          }}
        >
          <div style={{
            fontFamily: FONT_FAMILY.sans, fontSize: FONT_SIZE.base, fontWeight: FONT_WEIGHT.bold,
            color: COLORS.textPrimary, marginBottom: SPACING[1],
          }}>
            Select {side === 'input' ? 'Input' : 'Output'} Token
          </div>
          <input
            type="text"
            placeholder="Search tokens..."
            value={tokenSearch}
            onChange={e => setTokenSearch(e.target.value)}
            autoFocus
            style={{
              width: '100%', padding: `${SPACING[2]} ${SPACING[3]}`,
              backgroundColor: COLORS.surface, border: `1px solid ${COLORS.border}`,
              borderRadius: RADIUS.md, outline: 'none', color: COLORS.textPrimary,
              fontFamily: FONT_FAMILY.sans, fontSize: FONT_SIZE.sm,
            }}
          />
          <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: SPACING[1] }}>
            {filteredTokens.map(t => {
              const addr = t.isNative ? '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee' : t.address.toLowerCase();
              const logo = getKnownLogoUrl(addr);
              return (
                <button
                  key={t.isNative ? 'ETH' : t.address}
                  onClick={() => onSelect(t)}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: SPACING[3],
                    justifyContent: 'space-between',
                    padding: `${SPACING[3]} ${SPACING[3]}`, backgroundColor: COLORS.surface,
                    border: `1px solid ${COLORS.border}`, borderRadius: RADIUS.md, cursor: 'pointer',
                    fontFamily: FONT_FAMILY.sans, color: COLORS.textPrimary,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: SPACING[3] }}>
                    {logo ? (
                      <img src={logo} alt={t.symbol} style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                    ) : (
                      <div style={{
                        width: 28, height: 28, borderRadius: '50%', backgroundColor: `${COLORS.primary}22`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                        fontSize: '10px', fontWeight: 700, color: COLORS.primary,
                      }}>
                        {t.symbol.slice(0, 2)}
                      </div>
                    )}
                    <div>
                      <div style={{ fontWeight: FONT_WEIGHT.semibold, fontSize: FONT_SIZE.sm }}>{t.symbol}</div>
                      <div style={{ fontSize: '11px', color: COLORS.textMuted }}>{t.name}</div>
                    </div>
                  </div>
                  <div style={{ fontFamily: FONT_FAMILY.mono, fontSize: FONT_SIZE.xs, color: COLORS.textSecondary }}>
                    {t.balance}
                  </div>
                </button>
              );
            })}
            {filteredTokens.length === 0 && (
              <div style={{
                padding: SPACING[4], textAlign: 'center',
                fontFamily: FONT_FAMILY.sans, fontSize: FONT_SIZE.sm, color: COLORS.textMuted,
              }}>
                No tokens found
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  /** Token selector pill — logo + symbol + chevron */
  const TokenSelectorButton = ({ token, onClick }: { token: SwapToken; onClick: () => void }) => {
    const logoAddr = token.address === '' || token.address === '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE'
      ? '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'
      : token.address.toLowerCase();
    const logo = getKnownLogoUrl(logoAddr);

    return (
      <button
        onClick={onClick}
        style={{
          padding: `${SPACING[2]} ${SPACING[3]}`,
          backgroundColor: COLORS.surface,
          border: `1px solid ${COLORS.border}`,
          borderRadius: RADIUS.full,
          fontFamily: FONT_FAMILY.sans, fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.semibold,
          color: COLORS.textPrimary, cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: SPACING[2],
          whiteSpace: 'nowrap',
        }}
      >
        {logo ? (
          <img src={logo} alt={token.symbol} style={{ width: 20, height: 20, borderRadius: '50%', objectFit: 'cover' }}
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
        ) : (
          <div style={{
            width: 20, height: 20, borderRadius: '50%',
            backgroundColor: `${COLORS.primary}22`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '9px', fontWeight: 700, color: COLORS.primary,
          }}>
            {token.symbol.slice(0, 2)}
          </div>
        )}
        {token.symbol}
        <span style={{ fontSize: '10px', color: COLORS.textMuted }}>▼</span>
      </button>
    );
  };

  return (
    <div style={SCREEN}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: SPACING[3], marginBottom: SPACING[3] }}>
        <button onClick={() => void navigate('/dashboard')} style={{
          background: 'none', border: `1px solid ${COLORS.border}`, borderRadius: RADIUS.md,
          color: COLORS.textSecondary, cursor: 'pointer', padding: `${SPACING[2]} ${SPACING[3]}`,
          display: 'flex', alignItems: 'center',
        }}>
          <IconArrowLeft size={16} />
        </button>
        <span style={{
          fontFamily: FONT_FAMILY.sans, fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.bold,
          color: COLORS.textPrimary, flex: 1, textAlign: 'center',
        }}>SWAP</span>
        <button
          onClick={() => setShowSlippage(v => !v)}
          title="Slippage settings"
          style={{
            background: 'none', border: `1px solid ${showSlippage ? COLORS.primary : COLORS.border}`,
            borderRadius: RADIUS.md, color: showSlippage ? COLORS.primary : COLORS.textMuted,
            cursor: 'pointer', padding: `${SPACING[2]} ${SPACING[2]}`,
            display: 'flex', alignItems: 'center', gap: '4px',
            fontFamily: FONT_FAMILY.sans, fontSize: '11px',
          }}
        >
          <IconSettings size={14} />
          {slippage}%
        </button>
      </div>

      {/* Slippage panel */}
      {showSlippage && (
        <div style={{
          backgroundColor: COLORS.surface, border: `1px solid ${COLORS.border}`,
          borderRadius: RADIUS.md, padding: SPACING[3], marginBottom: SPACING[3],
        }}>
          <div style={{
            fontFamily: FONT_FAMILY.sans, fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.semibold,
            color: COLORS.textSecondary, marginBottom: SPACING[2], textTransform: 'uppercase',
            letterSpacing: '0.06em',
          }}>
            Slippage Tolerance
          </div>
          <div style={{ display: 'flex', gap: SPACING[2], flexWrap: 'wrap', marginBottom: SPACING[2] }}>
            {[0.1, 0.5, 1, 2, 5].map(pct => (
              <button
                key={pct}
                onClick={() => { setSlippage(pct); setCustomSlippage(''); }}
                style={{
                  padding: '4px 12px',
                  backgroundColor: slippage === pct && !customSlippage ? `${COLORS.primary}22` : COLORS.background,
                  border: `1px solid ${slippage === pct && !customSlippage ? COLORS.primary : COLORS.border}`,
                  borderRadius: RADIUS.full,
                  fontFamily: FONT_FAMILY.sans, fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.medium,
                  color: slippage === pct && !customSlippage ? COLORS.primary : COLORS.textSecondary,
                  cursor: 'pointer',
                }}
              >
                {pct}%
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: SPACING[2] }}>
            <input
              type="number" min="0.01" max="50" step="0.1"
              placeholder="Custom"
              value={customSlippage}
              onChange={e => {
                setCustomSlippage(e.target.value);
                const v = parseFloat(e.target.value);
                if (!isNaN(v) && v > 0 && v <= 50) setSlippage(v);
              }}
              style={{
                flex: 1, padding: `${SPACING[1]} ${SPACING[2]}`,
                backgroundColor: COLORS.background, border: `1px solid ${customSlippage ? COLORS.primary : COLORS.border}`,
                borderRadius: RADIUS.md, outline: 'none',
                fontFamily: FONT_FAMILY.mono, fontSize: FONT_SIZE.sm, color: COLORS.textPrimary,
              }}
            />
            <span style={{ fontFamily: FONT_FAMILY.sans, fontSize: FONT_SIZE.sm, color: COLORS.textMuted }}>%</span>
          </div>
          {slippage > 5 && (
            <div style={{
              marginTop: SPACING[2], fontFamily: FONT_FAMILY.sans, fontSize: '11px',
              color: COLORS.warning,
            }}>
              ⚠ High slippage — you may receive significantly less
            </div>
          )}
          {slippage < 0.1 && (
            <div style={{
              marginTop: SPACING[2], fontFamily: FONT_FAMILY.sans, fontSize: '11px',
              color: COLORS.warning,
            }}>
              ⚠ Very low slippage — transaction may fail
            </div>
          )}
        </div>
      )}

      {/* Input section */}
      <Card bordered style={{ padding: SPACING[4], marginBottom: SPACING[2] }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: SPACING[2] }}>
          <span style={{ fontFamily: FONT_FAMILY.sans, fontSize: FONT_SIZE.xs, color: COLORS.textMuted }}>You pay</span>
          <span style={{ fontFamily: FONT_FAMILY.sans, fontSize: FONT_SIZE.xs, color: COLORS.textMuted }}>
            Balance: {currentBalance ?? '...'} {inputToken.symbol}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: SPACING[3] }}>
          <input
            type="text" inputMode="decimal" placeholder="0"
            value={inputAmount} onChange={e => handleAmountChange(e.target.value)}
            style={{
              flex: 1, background: 'none', border: 'none', outline: 'none',
              fontFamily: FONT_FAMILY.mono, fontSize: '24px', fontWeight: FONT_WEIGHT.bold,
              color: COLORS.textPrimary, width: 0,
            }}
          />
          <TokenSelectorButton token={inputToken} onClick={() => { setTokenSearch(''); setShowInputPicker(true); }} />
        </div>
        {/* % quick-fill buttons */}
        {currentBalance && parseFloat(currentBalance) > 0 && (
          <div style={{ marginTop: SPACING[2] }}>
            <div style={{ display: 'flex', gap: SPACING[1], flexWrap: 'wrap' }}>
              {[25, 50, 75].map(pct => (
                <button
                  key={pct}
                  onClick={() => {
                    setShowCustomPct(false);
                    const bal = parseFloat(currentBalance);
                    handleAmountChange((bal * pct / 100).toFixed(inputToken.decimals <= 6 ? inputToken.decimals : 6));
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
                  setShowCustomPct(false);
                  const bal = parseFloat(currentBalance);
                  const max = (inputToken.symbol === 'ETH' && bal > 0.001)
                    ? (bal - 0.001).toFixed(6)
                    : currentBalance;
                  handleAmountChange(max);
                }}
                style={{
                  padding: '3px 10px', backgroundColor: COLORS.surface,
                  border: `1px solid ${COLORS.primary}44`, borderRadius: RADIUS.full,
                  fontFamily: FONT_FAMILY.sans, fontSize: '11px', fontWeight: FONT_WEIGHT.medium,
                  color: COLORS.primary, cursor: 'pointer',
                }}
              >Max</button>
              <button
                onClick={() => setShowCustomPct(v => !v)}
                style={{
                  padding: '3px 10px', backgroundColor: showCustomPct ? `${COLORS.primary}14` : COLORS.surface,
                  border: `1px solid ${showCustomPct ? COLORS.primary : COLORS.border}`, borderRadius: RADIUS.full,
                  fontFamily: FONT_FAMILY.sans, fontSize: '11px', fontWeight: FONT_WEIGHT.medium,
                  color: showCustomPct ? COLORS.primary : COLORS.textMuted, cursor: 'pointer',
                }}
              >%</button>
            </div>
            {showCustomPct && (
              <div style={{ display: 'flex', alignItems: 'center', gap: SPACING[2], marginTop: SPACING[2] }}>
                <input
                  type="number" min="1" max="100" placeholder="e.g. 33"
                  value={customPct}
                  onChange={e => setCustomPct(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      const pct = parseFloat(customPct);
                      if (pct > 0 && pct <= 100) {
                        const bal = parseFloat(currentBalance);
                        handleAmountChange((bal * pct / 100).toFixed(inputToken.decimals <= 6 ? inputToken.decimals : 6));
                        setShowCustomPct(false);
                        setCustomPct('');
                      }
                    }
                  }}
                  style={{
                    flex: 1, padding: `${SPACING[1]} ${SPACING[2]}`,
                    backgroundColor: COLORS.surface, border: `1px solid ${COLORS.border}`,
                    borderRadius: RADIUS.md, outline: 'none',
                    fontFamily: FONT_FAMILY.mono, fontSize: FONT_SIZE.sm, color: COLORS.textPrimary,
                  }}
                />
                <span style={{ fontFamily: FONT_FAMILY.sans, fontSize: FONT_SIZE.sm, color: COLORS.textMuted }}>%</span>
                <button
                  onClick={() => {
                    const pct = parseFloat(customPct);
                    if (pct > 0 && pct <= 100) {
                      const bal = parseFloat(currentBalance);
                      handleAmountChange((bal * pct / 100).toFixed(inputToken.decimals <= 6 ? inputToken.decimals : 6));
                      setShowCustomPct(false);
                      setCustomPct('');
                    }
                  }}
                  style={{
                    padding: `${SPACING[1]} ${SPACING[3]}`, backgroundColor: COLORS.primary,
                    border: 'none', borderRadius: RADIUS.md,
                    fontFamily: FONT_FAMILY.sans, fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.medium,
                    color: '#fff', cursor: 'pointer',
                  }}
                >Apply</button>
              </div>
            )}
          </div>
        )}
      </Card>

      {/* Flip button */}
      <div style={{ display: 'flex', justifyContent: 'center', margin: `${SPACING[1]} 0` }}>
        <button onClick={handleFlip} style={{
          width: 36, height: 36, borderRadius: '50%', border: `1px solid ${COLORS.border}`,
          backgroundColor: COLORS.surface, color: COLORS.textSecondary, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <IconArrowLeftRight size={16} />
        </button>
      </div>

      {/* Output section */}
      <Card bordered style={{ padding: SPACING[4], marginBottom: SPACING[4] }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: SPACING[2] }}>
          <span style={{ fontFamily: FONT_FAMILY.sans, fontSize: FONT_SIZE.xs, color: COLORS.textMuted }}>
            You receive
          </span>
          <span style={{ fontFamily: FONT_FAMILY.sans, fontSize: FONT_SIZE.xs, color: COLORS.textMuted }}>
            Balance: {outputBalanceDisplay ?? '...'} {outputToken.symbol}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: SPACING[3] }}>
          <div style={{
            flex: 1, fontFamily: FONT_FAMILY.mono, fontSize: '24px', fontWeight: FONT_WEIGHT.bold,
            color: outputAmount ? COLORS.success : COLORS.textMuted,
          }}>
            {isLoadingQuote ? '...' : outputAmount || '0'}
          </div>
          <TokenSelectorButton token={outputToken} onClick={() => { setTokenSearch(''); setShowOutputPicker(true); }} />
        </div>
      </Card>

      {/* Quote details */}
      {quote && (
        <div style={{
          padding: SPACING[3], marginBottom: SPACING[4],
          fontFamily: FONT_FAMILY.sans, fontSize: FONT_SIZE.xs, color: COLORS.textMuted,
          display: 'flex', flexDirection: 'column', gap: SPACING[1],
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Rate</span>
            <span style={{ color: COLORS.textSecondary }}>
              1 {inputToken.symbol} = {formatRate(outputAmount, inputAmount)} {outputToken.symbol}
            </span>
          </div>
          {quote.feeAmount !== '0' && (
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Fee ({quote.feeRate})</span>
              <span style={{ color: COLORS.textSecondary }}>{quote.feeAmount} {inputToken.symbol}</span>
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Price impact</span>
            <span style={{
              color: quote.priceImpact > 5 ? COLORS.error : quote.priceImpact > 2 ? COLORS.warning : COLORS.textSecondary,
              fontWeight: quote.priceImpact > 3 ? FONT_WEIGHT.bold : undefined,
            }}>{quote.priceImpact.toFixed(2)}%</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Min. received ({slippage}% slippage)</span>
            <span style={{ color: COLORS.textSecondary }}>{quote.minimumReceived} {outputToken.symbol}</span>
          </div>
        </div>
      )}

      {/* Price impact warning */}
      {quote && quote.priceImpact > 3 && (
        <div style={{
          marginBottom: SPACING[3], padding: SPACING[3], borderRadius: RADIUS.md,
          backgroundColor: quote.priceImpact > 15 ? `${COLORS.error}18` : `${COLORS.warning}18`,
          border: `1px solid ${quote.priceImpact > 15 ? COLORS.error : COLORS.warning}44`,
        }}>
          <div style={{
            fontFamily: FONT_FAMILY.sans, fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.semibold,
            color: quote.priceImpact > 15 ? COLORS.error : COLORS.warning,
            marginBottom: SPACING[1],
          }}>
            {quote.priceImpact > 15 ? 'Very high price impact' : 'High price impact'}
          </div>
          <div style={{
            fontFamily: FONT_FAMILY.sans, fontSize: '11px', color: COLORS.textMuted, lineHeight: 1.5,
          }}>
            {quote.priceImpact > 15
              ? `${quote.priceImpact.toFixed(1)}% of your value will be lost. Consider a smaller trade.`
              : `${quote.priceImpact.toFixed(1)}% price impact — you'll receive less than the market rate.`}
          </div>
          {quote.priceImpact > 15 && (
            <label style={{
              display: 'flex', alignItems: 'flex-start', gap: SPACING[2],
              marginTop: SPACING[2], cursor: 'pointer',
            }}>
              <input
                type="checkbox"
                checked={impactAcknowledged}
                onChange={e => setImpactAcknowledged(e.target.checked)}
                style={{ marginTop: 1, accentColor: COLORS.error, flexShrink: 0 }}
              />
              <span style={{ fontFamily: FONT_FAMILY.sans, fontSize: '11px', color: COLORS.textSecondary }}>
                I understand I may lose significant value
              </span>
            </label>
          )}
        </div>
      )}

      {/* Swap button */}
      <Button
        variant="primary" fullWidth
        disabled={!quote || isSwapping || isLoadingQuote || (!!quote && quote.priceImpact > 15 && !impactAcknowledged)}
        isLoading={isSwapping}
        onClick={() => void handleSwap()}
      >
        {isSwapping
          ? (swapStatus || 'Swapping...')
          : !inputAmount
            ? 'Enter amount'
            : isLoadingQuote
              ? 'Getting quote...'
              : !quote
                ? 'No quote — try smaller amount'
                : (quote.priceImpact > 15 && !impactAcknowledged)
                  ? '⚠ Acknowledge high impact above'
                  : 'Swap'
        }
      </Button>

      {/* Spacer */}
      <div style={{ flex: 1 }} />
      <div style={{
        fontFamily: FONT_FAMILY.sans, fontSize: '11px', color: COLORS.textMuted,
        textAlign: 'center', paddingTop: SPACING[2],
      }}>
        Powered by Uniswap V2
      </div>

      {/* Token picker modals */}
      {tokenPickerModal('input', showInputPicker, () => { setShowInputPicker(false); setTokenSearch(''); }, selectInputToken)}
      {tokenPickerModal('output', showOutputPicker, () => { setShowOutputPicker(false); setTokenSearch(''); }, selectOutputToken)}
    </div>
  );
}

function formatRate(output: string, input: string): string {
  const i = parseFloat(input) || 0;
  const o = parseFloat(output) || 0;
  if (i === 0) return '—';
  const r = o / i;
  if (r >= 1_000_000) return r.toFixed(0);
  if (r >= 1_000) return r.toFixed(2);
  if (r >= 1) return r.toFixed(4);
  return r.toFixed(8);
}

async function waitForTx(rpcUrl: string, hash: string, timeout = 60_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const receipt = await rpcCall<any>(rpcUrl, 'eth_getTransactionReceipt', [hash]);
    if (receipt?.blockNumber) {
      if (BigInt(receipt.status) === 0n) throw new Error('Transaction reverted');
      return;
    }
    await new Promise(r => setTimeout(r, 2000));
  }
  throw new Error('Transaction confirmation timeout');
}
