/**
 * Swap Screen — Simplified DEX swap for extension popup (360x600).
 *
 * ETH <-> SAIKO toggle, amount input, live quotes via Uniswap V2.
 */
import React, { useCallback, useContext, useEffect, useRef, useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { ethers, HDNodeWallet, Mnemonic } from 'ethers';
import { IconArrowLeft, IconArrowLeftRight, IconRefreshCw } from '../icons';
import {
  Button, Card, COLORS, FONT_FAMILY, FONT_SIZE, FONT_WEIGHT, SPACING, RADIUS,
} from '@saiko-wallet/ui-kit';
import {
  getSwapTokens, fetchSwapQuote, buildSwapTransaction,
  SAIKO_TOKEN_ADDRESS, UNISWAP_V2_ROUTER,
  type SwapToken, type SwapQuote,
} from '@saiko-wallet/wallet-core';
import type { SwapQuoteInfo } from '@saiko-wallet/ui-kit';
import { AppCtx } from '../context';
import { getNetworkById } from '../utils/network';

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

export function SwapScreen(): React.ReactElement {
  const navigate = useNavigate();
  const { addToast, sessionMnemonic, walletAddress, activeNetworkId } = useContext(AppCtx);
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

  const quoteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fetch balances
  const fetchBalances = useCallback(async () => {
    if (!walletAddress) return;
    try {
      const ethHex = await rpcCall<string>(rpcUrl, 'eth_getBalance', [walletAddress, 'latest']);
      setEthBalance((Number(BigInt(ethHex)) / 1e18).toFixed(4));
    } catch { setEthBalance('0'); }
    try {
      const data = '0x70a08231' + ethers.AbiCoder.defaultAbiCoder().encode(['address'], [walletAddress]).slice(2);
      const result = await rpcCall<string>(rpcUrl, 'eth_call', [{ to: SAIKO_TOKEN_ADDRESS, data }, 'latest']);
      const raw = result && result !== '0x' ? BigInt(result) : 0n;
      setSaikoBalance((Number(raw) / 1e18).toFixed(0));
    } catch { setSaikoBalance('0'); }
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
          slippageTolerance: 0.5, rpcUrl,
        });
        setOutputAmount(result.outputAmount);
        setFullQuote(result);
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
      } catch {
        setOutputAmount('');
        setQuote(null);
      }
      setIsLoadingQuote(false);
    }, 500);
    return () => { if (quoteTimer.current) clearTimeout(quoteTimer.current); };
  }, [inputAmount, inputToken, outputToken, rpcUrl]);

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

  const handleSwap = async () => {
    if (!quote || !fullQuote || !sessionMnemonic) return;
    setIsSwapping(true);
    try {
      const hdWallet = HDNodeWallet.fromMnemonic(
        Mnemonic.fromPhrase(sessionMnemonic), `m/44'/60'/0'/0/0`,
      );

      // Get nonce and gas params
      const [nonceHex, feeHex, tipHex] = await Promise.all([
        rpcCall<string>(rpcUrl, 'eth_getTransactionCount', [hdWallet.address, 'latest']),
        rpcCall<string>(rpcUrl, 'eth_gasPrice', []),
        Promise.resolve('0x59682F00'), // 1.5 gwei tip
      ]);
      let nonce = Number(BigInt(nonceHex));
      const gasPrice = BigInt(feeHex);
      const maxFee = gasPrice * 2n;
      const maxTip = BigInt(tipHex);

      // Check if approval needed for non-ETH input
      if (inputToken.symbol !== 'ETH') {
        setSwapStatus('Checking approval...');
        const allowanceData = '0xdd62ed3e' + ethers.AbiCoder.defaultAbiCoder()
          .encode(['address', 'address'], [hdWallet.address, UNISWAP_V2_ROUTER]).slice(2);
        const allowanceHex = await rpcCall<string>(rpcUrl, 'eth_call', [
          { to: inputToken.address, data: allowanceData }, 'latest',
        ]);
        const allowance = allowanceHex && allowanceHex !== '0x' ? BigInt(allowanceHex) : 0n;
        const amountWei = ethers.parseUnits(inputAmount, inputToken.decimals);

        if (allowance < amountWei) {
          setSwapStatus('Approving token...');
          const approveIface = new ethers.Interface(['function approve(address,uint256) returns (bool)']);
          const approveTx = ethers.Transaction.from({
            to: inputToken.address,
            data: approveIface.encodeFunctionData('approve', [UNISWAP_V2_ROUTER, amountWei]),
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

      // Build and send swap tx
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
    } catch (err: any) {
      addToast({ type: 'error', message: `Swap failed: ${(err?.message ?? 'Unknown').slice(0, 200)}` });
      setSwapStatus('');
    }
    setIsSwapping(false);
  };

  const currentBalance = inputToken.symbol === 'ETH' ? ethBalance : saikoBalance;
  const outputBalanceDisplay = outputToken.symbol === 'ETH' ? ethBalance : saikoBalance;

  return (
    <div style={SCREEN}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: SPACING[3], marginBottom: SPACING[4] }}>
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
        <div style={{ width: 32 }} />
      </div>

      {/* Input section */}
      <Card bordered style={{ padding: SPACING[4], marginBottom: SPACING[2] }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: SPACING[2] }}>
          <span style={{ fontFamily: FONT_FAMILY.sans, fontSize: FONT_SIZE.xs, color: COLORS.textMuted }}>
            You pay
          </span>
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
          <div style={{
            padding: `${SPACING[2]} ${SPACING[3]}`, backgroundColor: COLORS.surface,
            border: `1px solid ${COLORS.border}`, borderRadius: RADIUS.md,
            fontFamily: FONT_FAMILY.sans, fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.semibold,
            color: COLORS.textPrimary,
          }}>
            {inputToken.symbol}
          </div>
        </div>
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
          <div style={{
            padding: `${SPACING[2]} ${SPACING[3]}`, backgroundColor: COLORS.surface,
            border: `1px solid ${COLORS.border}`, borderRadius: RADIUS.md,
            fontFamily: FONT_FAMILY.sans, fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.semibold,
            color: COLORS.textPrimary,
          }}>
            {outputToken.symbol}
          </div>
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
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Fee ({quote.feeRate})</span>
            <span style={{ color: COLORS.textSecondary }}>{quote.feeAmount} {inputToken.symbol}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Price impact</span>
            <span style={{
              color: quote.priceImpact > 5 ? COLORS.error : quote.priceImpact > 2 ? COLORS.warning : COLORS.textSecondary,
            }}>{quote.priceImpact.toFixed(2)}%</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Min. received</span>
            <span style={{ color: COLORS.textSecondary }}>{quote.minimumReceived} {outputToken.symbol}</span>
          </div>
        </div>
      )}

      {/* Swap button */}
      <Button
        variant="primary" fullWidth
        disabled={!quote || isSwapping || isLoadingQuote}
        isLoading={isSwapping}
        onClick={() => void handleSwap()}
      >
        {isSwapping ? (swapStatus || 'Swapping...') : !inputAmount ? 'Enter amount' : isLoadingQuote ? 'Getting quote...' : !quote ? 'Enter amount' : 'Swap'}
      </Button>

      {/* Spacer */}
      <div style={{ flex: 1 }} />
      <div style={{
        fontFamily: FONT_FAMILY.sans, fontSize: '11px', color: COLORS.textMuted,
        textAlign: 'center', paddingTop: SPACING[2],
      }}>
        Powered by Uniswap V2
      </div>
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
