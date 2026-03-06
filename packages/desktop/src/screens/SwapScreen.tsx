/**
 * Swap Screen — In-app DEX swap, Phantom Wallet style.
 *
 * Flow: compose → review → confirm → success toast
 *
 * Features:
 * - Token selection modal with search
 * - Real-time mock quote calculation
 * - Slippage tolerance selector
 * - Price impact warnings (orange >2%, red >5%)
 * - Transaction review before execution
 * - Swap history
 */
import React, { useCallback, useContext, useEffect, useRef, useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  IconArrowLeft,
  IconArrowLeftRight,
  IconSearch,
  IconX,
} from '../icons.js';
import {
  SwapCard,
  Modal,
  Card,
  Button,
  COLORS,
  FONT_FAMILY,
  FONT_SIZE,
  FONT_WEIGHT,
  SPACING,
  RADIUS,
  type SwapTokenInfo,
  type SwapQuoteInfo,
} from '@saiko-wallet/ui-kit';
import {
  getSwapTokens,
  buildSwapQuote,
  fetchSwapQuote,
  buildSwapTransaction,
  type SwapToken,
} from '@saiko-wallet/wallet-core';
import { AppCtx } from '../context.js';
import { executeDesktopSwap, checkApprovalNeeded } from '../utils/swap.js';
import { useSwapBalances } from '../hooks/useSwapBalances.js';
import {
  type SwapHistoryItem as PersistedSwapItem,
  loadSwapHistory,
  prependSwap,
  formatSwapDate,
} from '../utils/swapHistory.js';
import { fetchTokenMetadata } from '../utils/tokens.js';
import { getTokenLogoUrl, fetchTokenInfo } from '../utils/coingecko.js';

// ─── Types ────────────────────────────────────────────────────────────────────

// Re-export for local use; we use PersistedSwapItem from swapHistory.ts
type SwapHistoryItem = PersistedSwapItem;

// ─── Mock data ────────────────────────────────────────────────────────────────

// Balances fetched live via useSwapBalances hook (see SwapScreen component)

// SwapHistoryItem is aliased from PersistedSwapItem (see top of file)

// ─── Layout constants ─────────────────────────────────────────────────────────

const PAGE_STYLE: CSSProperties = {
  minHeight: '100vh',
  backgroundColor: COLORS.background,
  display: 'flex',
  flexDirection: 'column',
};

const CONTENT_STYLE: CSSProperties = {
  maxWidth: '560px',
  width: '100%',
  margin: '0 auto',
  padding: `${SPACING[6]} ${SPACING[6]}`,
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  gap: SPACING[6],
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Convert SwapToken (wallet-core) → SwapTokenInfo (ui-kit) */
function toSwapTokenInfo(token: SwapToken): SwapTokenInfo {
  return token;
}

function parseRawBalance(raw: bigint, decimals: number): number {
  // Convert bigint wei → float for comparison (sufficient precision for UI checks)
  return Number(raw) / Math.pow(10, decimals);
}

// ─── Token Select Modal ───────────────────────────────────────────────────────

interface TokenSelectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (token: SwapToken) => void;
  excludeSymbol?: string;
  title: string;
  balanceDisplay: Map<string, string>;
}

function isAddress(s: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(s.trim());
}

function TokenSelectModal({
  isOpen,
  onClose,
  onSelect,
  excludeSymbol,
  title,
  balanceDisplay,
}: TokenSelectModalProps): React.ReactElement {
  const [search, setSearch] = useState('');
  const [lookupToken, setLookupToken] = useState<SwapToken | null>(null);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const tokens = getSwapTokens();

  // Address lookup — fires when search looks like a contract address
  useEffect(() => {
    const trimmed = search.trim();
    if (!isAddress(trimmed)) {
      setLookupToken(null);
      setLookupError(null);
      return;
    }

    // Check if it's already in the static list
    const existing = tokens.find((t) => t.address.toLowerCase() === trimmed.toLowerCase());
    if (existing) {
      setLookupToken(existing);
      setLookupError(null);
      return;
    }

    let cancelled = false;
    setLookupLoading(true);
    setLookupToken(null);
    setLookupError(null);

    (async () => {
      try {
        // 1. Try CoinGecko first — has name, symbol, decimals, logo in one call
        const cgInfo = await fetchTokenInfo(trimmed).catch(() => null);
        if (!cancelled && cgInfo) {
          setLookupToken({
            address: trimmed,
            symbol: cgInfo.symbol,
            name: cgInfo.name,
            decimals: cgInfo.decimals,
            logoUrl: cgInfo.logoUrl,
            featured: false,
          });
          setLookupLoading(false);
          return;
        }

        // 2. Fall back to on-chain RPC for tokens CoinGecko doesn't list
        const meta = await fetchTokenMetadata(trimmed);
        const logoUrl = await getTokenLogoUrl(trimmed).catch(() => null);
        if (cancelled) return;
        setLookupToken({
          address: trimmed,
          symbol: meta.symbol,
          name: meta.name,
          decimals: meta.decimals,
          logoUrl: logoUrl ?? '',
          featured: false,
        });
      } catch {
        if (!cancelled) setLookupError('Token not found. Check the address and try again.');
      } finally {
        if (!cancelled) setLookupLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [search]);

  const filtered = isAddress(search.trim())
    ? []
    : tokens.filter((t) => {
        if (t.symbol === excludeSymbol) return false;
        if (!search) return true;
        const q = search.toLowerCase();
        return t.symbol.toLowerCase().includes(q) || t.name.toLowerCase().includes(q);
      });

  const handleSelect = (token: SwapToken): void => {
    onSelect(token);
    onClose();
    setSearch('');
    setLookupToken(null);
  };

  const handleClose = (): void => {
    onClose();
    setSearch('');
    setLookupToken(null);
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title={title} width={420}>
      {/* Search */}
      <div style={{
        position: 'relative',
        marginBottom: SPACING[4],
      }}>
        <div style={{
          position: 'absolute',
          left: SPACING[3],
          top: '50%',
          transform: 'translateY(-50%)',
          color: COLORS.textMuted,
          display: 'flex',
          alignItems: 'center',
          pointerEvents: 'none',
        }}>
          <IconSearch size={16} />
        </div>
        <input
          type="text"
          placeholder="Search or paste contract address…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          autoFocus
          style={{
            width: '100%',
            backgroundColor: COLORS.surface,
            border: `1px solid ${COLORS.border}`,
            borderRadius: RADIUS.md,
            color: COLORS.textPrimary,
            fontFamily: FONT_FAMILY.sans,
            fontSize: FONT_SIZE.base,
            padding: `${SPACING[3]} ${SPACING[4]} ${SPACING[3]} ${SPACING[10]}`,
            outline: 'none',
            boxSizing: 'border-box',
          }}
          aria-label="Search tokens"
        />
        {search && (
          <button
            onClick={() => { setSearch(''); setLookupToken(null); setLookupError(null); }}
            style={{
              position: 'absolute',
              right: SPACING[3],
              top: '50%',
              transform: 'translateY(-50%)',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: COLORS.textMuted,
              display: 'flex',
              alignItems: 'center',
              padding: 0,
            }}
            aria-label="Clear search"
          >
            <IconX size={16} />
          </button>
        )}
      </div>

      {/* Token list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: SPACING[1] }}>

        {/* Address lookup states */}
        {isAddress(search.trim()) && lookupLoading && (
          <div style={{ textAlign: 'center', padding: SPACING[8], color: COLORS.textMuted, fontFamily: FONT_FAMILY.sans, fontSize: FONT_SIZE.md }}>
            Looking up token…
          </div>
        )}
        {isAddress(search.trim()) && lookupError && !lookupLoading && (
          <div style={{ textAlign: 'center', padding: SPACING[8], color: COLORS.error, fontFamily: FONT_FAMILY.sans, fontSize: FONT_SIZE.md }}>
            {lookupError}
          </div>
        )}
        {isAddress(search.trim()) && lookupToken && !lookupLoading && (
          <motion.button
            key={lookupToken.address}
            onClick={() => handleSelect(lookupToken)}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            style={{
              display: 'flex', alignItems: 'center', gap: SPACING[3],
              padding: `${SPACING[3]} ${SPACING[4]}`,
              backgroundColor: 'rgba(67,160,71,0.06)',
              border: `1px solid rgba(67,160,71,0.3)`,
              borderRadius: RADIUS.md, cursor: 'pointer', outline: 'none',
              width: '100%', textAlign: 'left',
            }}
            whileHover={{ backgroundColor: 'rgba(67,160,71,0.12)' }}
            whileTap={{ scale: 0.99 }}
            aria-label={`Select ${lookupToken.name}`}
          >
            <TokenLogoInModal token={lookupToken} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: SPACING[2] }}>
                <span style={{ fontFamily: FONT_FAMILY.sans, fontSize: FONT_SIZE.base, fontWeight: FONT_WEIGHT.semibold, color: COLORS.textPrimary }}>
                  {lookupToken.symbol}
                </span>
                <span style={{ backgroundColor: 'rgba(67,160,71,0.15)', color: COLORS.success, fontFamily: FONT_FAMILY.sans, fontSize: '10px', fontWeight: FONT_WEIGHT.bold, padding: '1px 6px', borderRadius: RADIUS.full, letterSpacing: '0.06em' }}>
                  FOUND
                </span>
              </div>
              <div style={{ fontFamily: FONT_FAMILY.sans, fontSize: FONT_SIZE.sm, color: COLORS.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {lookupToken.name}
              </div>
            </div>
            <div style={{ fontFamily: FONT_FAMILY.mono, fontSize: FONT_SIZE.xs, color: COLORS.textMuted, textAlign: 'right', flexShrink: 0 }}>
              {lookupToken.address.slice(0, 6)}…{lookupToken.address.slice(-4)}
            </div>
          </motion.button>
        )}

        {/* Normal filtered list */}
        {!isAddress(search.trim()) && filtered.length === 0 && (
          <div style={{
            textAlign: 'center',
            padding: SPACING[8],
            color: COLORS.textMuted,
            fontFamily: FONT_FAMILY.sans,
            fontSize: FONT_SIZE.md,
          }}>
            No tokens found — try pasting a contract address
          </div>
        )}
        {filtered.map((token) => {
          const balance = balanceDisplay.get(token.symbol) ?? `0 ${token.symbol}`;
          const isFeatured = token.featured;

          return (
            <motion.button
              key={token.address}
              onClick={() => handleSelect(token)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: SPACING[3],
                padding: `${SPACING[3]} ${SPACING[4]}`,
                backgroundColor: 'transparent',
                border: `1px solid ${isFeatured ? 'rgba(227,27,35,0.3)' : 'transparent'}`,
                borderRadius: RADIUS.md,
                cursor: 'pointer',
                outline: 'none',
                width: '100%',
                textAlign: 'left',
                transition: 'background-color 0.12s ease',
              }}
              whileHover={{ backgroundColor: COLORS.hoverOverlay }}
              whileTap={{ scale: 0.99 }}
              aria-label={`Select ${token.name}`}
            >
              {/* Logo */}
              <TokenLogoInModal token={token} />

              {/* Name + symbol */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: SPACING[2] }}>
                  <span style={{
                    fontFamily: FONT_FAMILY.sans,
                    fontSize: FONT_SIZE.base,
                    fontWeight: FONT_WEIGHT.semibold,
                    color: COLORS.textPrimary,
                  }}>
                    {token.symbol}
                  </span>
                  {isFeatured && (
                    <span style={{
                      backgroundColor: 'rgba(227,27,35,0.15)',
                      color: COLORS.primary,
                      fontFamily: FONT_FAMILY.sans,
                      fontSize: '10px',
                      fontWeight: FONT_WEIGHT.bold,
                      padding: `1px 6px`,
                      borderRadius: RADIUS.full,
                      letterSpacing: '0.06em',
                    }}>
                      FEATURED
                    </span>
                  )}
                </div>
                <div style={{
                  fontFamily: FONT_FAMILY.sans,
                  fontSize: FONT_SIZE.sm,
                  color: COLORS.textMuted,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}>
                  {token.name}
                </div>
              </div>

              {/* Balance */}
              <div style={{
                fontFamily: FONT_FAMILY.mono,
                fontSize: FONT_SIZE.sm,
                color: COLORS.textSecondary,
                textAlign: 'right',
                flexShrink: 0,
              }}>
                {balance}
              </div>
            </motion.button>
          );
        })}
      </div>
    </Modal>
  );
}

/** Small logo for the token select list */
function TokenLogoInModal({ token }: { token: SwapToken }): React.ReactElement {
  const [failed, setFailed] = useState(false);
  const style: CSSProperties = {
    width: 36,
    height: 36,
    borderRadius: '50%',
    backgroundColor: token.featured ? COLORS.primary : COLORS.border,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    overflow: 'hidden',
  };
  if (failed) {
    return (
      <div style={style}>
        <span style={{ fontFamily: FONT_FAMILY.sans, fontSize: '11px', fontWeight: FONT_WEIGHT.bold, color: COLORS.textPrimary }}>
          {token.symbol.slice(0, 2)}
        </span>
      </div>
    );
  }
  return (
    <div style={style}>
      <img src={token.logoUrl} alt={token.symbol} style={{ width: 36, height: 36, objectFit: 'cover' }} onError={() => setFailed(true)} />
    </div>
  );
}

// ─── Transaction Review Modal ─────────────────────────────────────────────────

interface ReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  inputToken: SwapToken;
  outputToken: SwapToken;
  inputAmount: string;
  outputAmount: string;
  quote: SwapQuoteInfo;
  slippageTolerance: number;
  isConfirming: boolean;
}

function ReviewModal({
  isOpen,
  onClose,
  onConfirm,
  inputToken,
  outputToken,
  inputAmount,
  outputAmount,
  quote,
  slippageTolerance,
  isConfirming,
}: ReviewModalProps): React.ReactElement {
  const priceImpact = quote.priceImpact;
  const isDanger = priceImpact > 5;
  const isWarning = priceImpact > 2;

  const rowStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: `${SPACING[3]} 0`,
    borderBottom: `1px solid ${COLORS.divider}`,
  };

  const labelStyle: CSSProperties = {
    fontFamily: FONT_FAMILY.sans,
    fontSize: FONT_SIZE.sm,
    color: COLORS.textMuted,
  };

  const valueStyle: CSSProperties = {
    fontFamily: FONT_FAMILY.mono,
    fontSize: FONT_SIZE.sm,
    color: COLORS.textSecondary,
    textAlign: 'right',
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={isConfirming ? undefined! : onClose}
      title="REVIEW SWAP"
      width={440}
      footer={
        <div style={{ width: '100%' }}>
          <Button
            variant="primary"
            size="lg"
            fullWidth
            isLoading={isConfirming}
            onClick={onConfirm}
          >
            {isConfirming ? 'Confirming...' : 'CONFIRM SWAP'}
          </Button>
          <p style={{
            textAlign: 'center',
            fontFamily: FONT_FAMILY.sans,
            fontSize: FONT_SIZE.xs,
            color: COLORS.textMuted,
            margin: `${SPACING[3]} 0 0`,
            lineHeight: '1.5',
          }}>
            Transaction is final. Verify all details.
          </p>
        </div>
      }
    >
      {/* You pay */}
      <div style={{
        backgroundColor: COLORS.surface,
        borderRadius: RADIUS.lg,
        padding: SPACING[4],
        marginBottom: SPACING[3],
      }}>
        <div style={{ ...labelStyle, marginBottom: SPACING[2] }}>YOU PAY</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: SPACING[3] }}>
          <div style={{ width: 40, height: 40, borderRadius: '50%', backgroundColor: COLORS.border, flexShrink: 0 }} />
          <div>
            <div style={{
              fontFamily: FONT_FAMILY.mono,
              fontSize: FONT_SIZE['2xl'],
              fontWeight: FONT_WEIGHT.bold,
              color: COLORS.textPrimary,
            }}>
              {inputAmount}
            </div>
            <div style={{ fontFamily: FONT_FAMILY.sans, fontSize: FONT_SIZE.sm, color: COLORS.textSecondary }}>
              {inputToken.symbol} · {inputToken.name}
            </div>
          </div>
        </div>
      </div>

      {/* You receive */}
      <div style={{
        backgroundColor: COLORS.surface,
        borderRadius: RADIUS.lg,
        padding: SPACING[4],
        marginBottom: SPACING[4],
        border: `1px solid rgba(67,160,71,0.2)`,
      }}>
        <div style={{ ...labelStyle, marginBottom: SPACING[2] }}>YOU RECEIVE (MINIMUM)</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: SPACING[3] }}>
          <div style={{ width: 40, height: 40, borderRadius: '50%', backgroundColor: outputToken.featured ? COLORS.primary : COLORS.border, flexShrink: 0 }} />
          <div>
            <div style={{
              fontFamily: FONT_FAMILY.mono,
              fontSize: FONT_SIZE['2xl'],
              fontWeight: FONT_WEIGHT.bold,
              color: COLORS.success,
            }}>
              {quote.minimumReceived}
            </div>
            <div style={{ fontFamily: FONT_FAMILY.sans, fontSize: FONT_SIZE.sm, color: COLORS.textSecondary }}>
              {outputToken.symbol} · {outputToken.name}
            </div>
          </div>
        </div>
      </div>

      {/* Fee + Details */}
      <div>
        {/* Saiko fee — always visible */}
        <div style={{ ...rowStyle, backgroundColor: 'rgba(227,27,35,0.05)', margin: `0 -${SPACING[1]}`, padding: `${SPACING[3]} ${SPACING[1]}`, borderRadius: RADIUS.sm }}>
          <span style={{ ...labelStyle, color: COLORS.textSecondary }}>
            Saiko Wallet Fee ({quote.feeRate})
          </span>
          <span style={{ ...valueStyle, color: COLORS.error }}>
            -{quote.feeAmount} {inputToken.symbol}
          </span>
        </div>
        <div style={{ padding: `0 ${SPACING[1]}`, marginTop: `-${SPACING[2]}`, marginBottom: SPACING[2] }}>
          <span style={{
            fontFamily: FONT_FAMILY.sans,
            fontSize: FONT_SIZE.xs,
            color: COLORS.textMuted,
            fontStyle: 'italic',
          }}>
            10% of this fee goes to Shield staking rewards
          </span>
        </div>
        <div style={rowStyle}>
          <span style={labelStyle}>Amount swapped</span>
          <span style={valueStyle}>{quote.amountSwapped} {inputToken.symbol}</span>
        </div>
        <div style={rowStyle}>
          <span style={labelStyle}>Exchange rate</span>
          <span style={valueStyle}>
            1 {inputToken.symbol} ≈ {formatRate(outputAmount, inputAmount)} {outputToken.symbol}
          </span>
        </div>
        <div style={rowStyle}>
          <span style={labelStyle}>Price impact</span>
          <span style={{
            ...valueStyle,
            color: isDanger ? COLORS.error : isWarning ? COLORS.warning : COLORS.textSecondary,
          }}>
            {priceImpact.toFixed(2)}%
          </span>
        </div>
        <div style={rowStyle}>
          <span style={labelStyle}>Slippage tolerance</span>
          <span style={valueStyle}>{slippageTolerance}%</span>
        </div>
        <div style={{ ...rowStyle, borderBottom: 'none' }}>
          <span style={labelStyle}>Network fee</span>
          <span style={valueStyle}>~{quote.gasEstimate} ETH</span>
        </div>
      </div>
    </Modal>
  );
}

// ─── Swap History ─────────────────────────────────────────────────────────────

function SwapHistory({ items }: { items: SwapHistoryItem[] }): React.ReactElement {
  return (
    <Card title="Recent Swaps">
      {items.length === 0 ? (
        <div style={{
          textAlign: 'center',
          padding: SPACING[8],
          color: COLORS.textMuted,
          fontFamily: FONT_FAMILY.sans,
          fontSize: FONT_SIZE.md,
        }}>
          No swaps yet
        </div>
      ) : (
        items.map((item, i) => (
          <motion.div
            key={item.id}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.2, delay: i * 0.05, ease: 'easeOut' }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: SPACING[3],
              padding: `${SPACING[4]} 0`,
              borderBottom: i < items.length - 1 ? `1px solid ${COLORS.divider}` : 'none',
            }}
          >
            <div style={{
              width: 36,
              height: 36,
              borderRadius: '50%',
              backgroundColor: 'rgba(67,160,71,0.12)',
              color: COLORS.success,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}>
              <IconArrowLeftRight size={16} />
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontFamily: FONT_FAMILY.sans,
                fontSize: FONT_SIZE.md,
                fontWeight: FONT_WEIGHT.medium,
                color: COLORS.textPrimary,
              }}>
                {item.fromToken} → {item.toToken}
              </div>
              <div style={{ fontFamily: FONT_FAMILY.sans, fontSize: FONT_SIZE.sm, color: COLORS.textMuted }}>
                {formatSwapDate(item.timestamp)}
              </div>
            </div>

            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <div style={{ fontFamily: FONT_FAMILY.mono, fontSize: FONT_SIZE.sm, color: COLORS.textSecondary }}>
                {item.fromAmount}
              </div>
              <div style={{ fontFamily: FONT_FAMILY.mono, fontSize: FONT_SIZE.sm, color: COLORS.success }}>
                +{item.toAmount}
              </div>
            </div>
          </motion.div>
        ))
      )}
    </Card>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export function SwapScreen(): React.ReactElement {
  const navigate = useNavigate();
  const { addToast, sessionMnemonic, walletAddress } = useContext(AppCtx);

  // All tokens
  const allTokens = getSwapTokens();
  const saikoToken = allTokens.find((t) => t.symbol === 'SAIKO') ?? allTokens[0]!;
  const ethToken = allTokens.find((t) => t.symbol === 'ETH') ?? allTokens[1]!;

  // Live on-chain balances
  const balances = useSwapBalances(walletAddress, allTokens);

  // State
  const [inputToken, setInputToken] = useState<SwapToken>(ethToken);
  const [outputToken, setOutputToken] = useState<SwapToken>(saikoToken);
  const [inputAmount, setInputAmount] = useState('');
  const [outputAmount, setOutputAmount] = useState('');
  const [quote, setQuote] = useState<SwapQuoteInfo | null>(null);
  const [isLoadingQuote, setIsLoadingQuote] = useState(false);
  const [slippageTolerance, setSlippageTolerance] = useState(0.5);
  const [showTokenSelectFor, setShowTokenSelectFor] = useState<'input' | 'output' | null>(null);
  const [showReview, setShowReview] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [swapHistory, setSwapHistory] = useState<SwapHistoryItem[]>([]);

  // Load persisted history when wallet address is known (or changes on account switch)
  useEffect(() => {
    setSwapHistory(loadSwapHistory(walletAddress));
  }, [walletAddress]);

  // Quote debounce timer
  const quoteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Compute quote whenever amount/tokens change — uses live on-chain data
  const computeQuote = useCallback(
    (amount: string, from: SwapToken, to: SwapToken, slippage: number): void => {
      if (!amount || parseFloat(amount) <= 0) {
        setOutputAmount('');
        setQuote(null);
        setIsLoadingQuote(false);
        return;
      }

      setIsLoadingQuote(true);

      if (quoteTimer.current) clearTimeout(quoteTimer.current);
      quoteTimer.current = setTimeout(async () => {
        try {
          const result = await fetchSwapQuote({
            inputToken: from,
            outputToken: to,
            inputAmount: amount,
            slippageTolerance: slippage,
          });

          setOutputAmount(result.outputAmount);
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
      }, 400); // 400ms debounce
    },
    [],
  );

  // Recompute on changes
  useEffect(() => {
    computeQuote(inputAmount, inputToken, outputToken, slippageTolerance);
    return () => {
      if (quoteTimer.current) clearTimeout(quoteTimer.current);
    };
  }, [inputAmount, inputToken, outputToken, slippageTolerance, computeQuote]);

  const handleInputAmountChange = (val: string): void => {
    // Only allow valid numeric input
    if (val !== '' && !/^\d*\.?\d*$/.test(val)) return;
    setInputAmount(val);
  };

  const handleFlipTokens = (): void => {
    setInputToken(outputToken);
    setOutputToken(inputToken);
    setInputAmount(outputAmount);
    setOutputAmount('');
    setQuote(null);
  };

  const handleSelectInputToken = (): void => setShowTokenSelectFor('input');
  const handleSelectOutputToken = (): void => setShowTokenSelectFor('output');

  const handleTokenSelected = (token: SwapToken): void => {
    if (showTokenSelectFor === 'input') {
      if (token.symbol === outputToken.symbol) {
        // Swap them
        setOutputToken(inputToken);
      }
      setInputToken(token);
    } else {
      if (token.symbol === inputToken.symbol) {
        setInputToken(outputToken);
      }
      setOutputToken(token);
    }
    setInputAmount('');
    setOutputAmount('');
    setQuote(null);
    setShowTokenSelectFor(null);
  };

  const handleMaxClick = (): void => {
    const rawBal = balances.raw.get(inputToken.symbol) ?? 0n;
    const divisor = 10n ** BigInt(inputToken.decimals);
    const whole = rawBal / divisor;
    const frac = rawBal % divisor;
    const fracStr = frac.toString().padStart(inputToken.decimals, '0').slice(0, 6).replace(/0+$/, '');
    const amount = fracStr ? `${whole}.${fracStr}` : whole.toString();
    setInputAmount(amount);
  };

  const handleSwap = (): void => {
    if (quote) setShowReview(true);
  };

  const handleConfirmSwap = async (): Promise<void> => {
    if (!quote) return;
    setIsConfirming(true);
    try {
      if (!sessionMnemonic) throw new Error('Wallet not unlocked');
      const result = await executeDesktopSwap({
        inputSymbol: inputToken.symbol,
        outputSymbol: outputToken.symbol,
        inputAmount,
        minimumReceived: quote.minimumReceived,
        inputDecimals: inputToken.decimals,
        outputDecimals: outputToken.decimals,
        mnemonic: sessionMnemonic,
      });

      setIsConfirming(false);
      setShowReview(false);

      // Persist swap to localStorage and update state
      const newEntry: SwapHistoryItem = {
        id: result.swapTxHash,
        fromToken: inputToken.symbol,
        toToken: outputToken.symbol,
        fromAmount: `${inputAmount} ${inputToken.symbol}`,
        toAmount: `${outputAmount} ${outputToken.symbol}`,
        timestamp: Date.now(),
        status: 'confirmed',
      };
      setSwapHistory(prependSwap(walletAddress, newEntry));

      setInputAmount('');
      setOutputAmount('');
      setQuote(null);

      const msg = result.approvalTxHash
        ? `Approved (${result.approvalTxHash.slice(0, 10)}...) then swapped. Tx: ${result.swapTxHash.slice(0, 14)}...`
        : `Tx: ${result.swapTxHash.slice(0, 14)}...`;

      addToast({
        type: 'success',
        title: 'Swap submitted!',
        message: msg,
      });
    } catch (err: any) {
      setIsConfirming(false);
      addToast({
        type: 'error',
        title: 'Swap failed',
        message: err?.message || 'Unknown error',
      });
    }
  };

  // Check balance
  const inputRaw = balances.raw.get(inputToken.symbol) ?? 0n;
  const inputBalance = parseRawBalance(inputRaw, inputToken.decimals);
  const inputAmountNum = parseFloat(inputAmount) || 0;
  const insufficientBalance = inputAmountNum > 0 && inputAmountNum > inputBalance;

  // Header styles
  const headerStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: SPACING[4],
    padding: `${SPACING[4]} ${SPACING[6]}`,
    backgroundColor: COLORS.surface,
    borderBottom: `1px solid ${COLORS.border}`,
  };

  return (
    <div style={PAGE_STYLE}>
      {/* Header */}
      <header style={headerStyle}>
        <motion.button
          onClick={() => void navigate('/dashboard')}
          style={{
            background: 'none',
            border: `1px solid ${COLORS.border}`,
            borderRadius: RADIUS.md,
            color: COLORS.textSecondary,
            cursor: 'pointer',
            padding: `${SPACING[2]} ${SPACING[3]}`,
            display: 'flex',
            alignItems: 'center',
            gap: SPACING[2],
            outline: 'none',
            transition: 'color 0.15s ease, border-color 0.15s ease',
          }}
          whileHover={{ borderColor: COLORS.primary, color: COLORS.textPrimary }}
          whileTap={{ scale: 0.95 }}
          aria-label="Back to dashboard"
        >
          <IconArrowLeft size={16} />
        </motion.button>

        <h1 style={{
          fontFamily: FONT_FAMILY.sans,
          fontSize: FONT_SIZE.xl,
          fontWeight: FONT_WEIGHT.bold,
          color: COLORS.textPrimary,
          margin: 0,
          letterSpacing: '0.06em',
          flex: 1,
          textAlign: 'center',
        }}>
          SWAP
        </h1>

        {/* Spacer for alignment */}
        <div style={{ width: '68px' }} />
      </header>

      {/* Content */}
      <div style={CONTENT_STYLE}>
        {/* Swap Card */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          style={{ maxWidth: '480px', width: '100%', margin: '0 auto', alignSelf: 'center' }}
        >
          <SwapCard
            inputToken={toSwapTokenInfo(inputToken)}
            outputToken={toSwapTokenInfo(outputToken)}
            inputAmount={inputAmount}
            outputAmount={outputAmount}
            quote={quote}
            isLoadingQuote={isLoadingQuote}
            slippageTolerance={slippageTolerance}
            inputBalance={balances.display.get(inputToken.symbol) ?? (balances.loading ? '…' : `0 ${inputToken.symbol}`)}
            outputBalance={balances.display.get(outputToken.symbol) ?? (balances.loading ? '…' : `0 ${outputToken.symbol}`)}
            insufficientBalance={insufficientBalance}
            onInputAmountChange={handleInputAmountChange}
            onFlipTokens={handleFlipTokens}
            onSelectInputToken={handleSelectInputToken}
            onSelectOutputToken={handleSelectOutputToken}
            onSlippageChange={setSlippageTolerance}
            onMaxClick={handleMaxClick}
            onSwap={handleSwap}
          />
        </motion.div>

        {/* Swap History */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, delay: 0.1, ease: 'easeOut' }}
          style={{ maxWidth: '480px', width: '100%', margin: '0 auto', alignSelf: 'center' }}
        >
          <SwapHistory items={swapHistory} />
        </motion.div>
      </div>

      {/* Token Select Modal */}
      <TokenSelectModal
        isOpen={showTokenSelectFor !== null}
        onClose={() => setShowTokenSelectFor(null)}
        onSelect={handleTokenSelected}
        excludeSymbol={showTokenSelectFor === 'input' ? outputToken.symbol : inputToken.symbol}
        title={showTokenSelectFor === 'input' ? 'SELECT INPUT TOKEN' : 'SELECT OUTPUT TOKEN'}
        balanceDisplay={balances.display}
      />

      {/* Transaction Review Modal */}
      {quote !== null && (
        <ReviewModal
          isOpen={showReview}
          onClose={() => setShowReview(false)}
          onConfirm={handleConfirmSwap}
          inputToken={inputToken}
          outputToken={outputToken}
          inputAmount={inputAmount}
          outputAmount={outputAmount}
          quote={quote}
          slippageTolerance={slippageTolerance}
          isConfirming={isConfirming}
        />
      )}
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatRate(outputAmount: string, inputAmount: string): string {
  const input = parseFloat(inputAmount) || 0;
  const output = parseFloat(outputAmount) || 0;
  if (input === 0) return '—';
  const rate = output / input;
  if (rate >= 1_000_000) return rate.toFixed(0);
  if (rate >= 1_000) return rate.toFixed(2);
  if (rate >= 1) return rate.toFixed(4);
  return rate.toFixed(8);
}
