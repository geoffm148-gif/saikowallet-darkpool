/**
 * SwapCard — Phantom-style in-app DEX swap UI component.
 *
 * WHY: A self-contained, controlled swap widget that handles display logic
 * while delegating all state management and token selection to the parent.
 * Framer Motion provides the flip button rotation and amount change animations.
 *
 * Design: dark card, #E31B23 red accents, no gradients. UPPERCASE headings.
 */

import React, { type CSSProperties } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { COLORS } from '../themes/colors.js';
import { FONT_FAMILY, FONT_SIZE, FONT_WEIGHT } from '../themes/typography.js';
import { SPACING, RADIUS } from '../themes/spacing.js';

// ─── Token shape (matches wallet-core SwapToken, no hard dependency) ──────────

export interface SwapTokenInfo {
  readonly address: string;
  readonly symbol: string;
  readonly name: string;
  readonly decimals: number;
  readonly logoUrl: string;
  readonly featured: boolean;
}

export interface SwapQuoteInfo {
  readonly inputAmount: string;
  /** Saiko Wallet fee in input token units (human-readable) */
  readonly feeAmount: string;
  /** Fee rate display string, e.g. "0.5%" */
  readonly feeRate: string;
  /** Amount routed to DEX after fee (human-readable) */
  readonly amountSwapped: string;
  readonly outputAmount: string;
  readonly priceImpact: number;
  readonly minimumReceived: string;
  readonly gasEstimate: string;
  readonly expiresAt: number;
}

// ─── Props ────────────────────────────────────────────────────────────────────

export interface SwapCardProps {
  /** Token being sold */
  inputToken: SwapTokenInfo;
  /** Token being bought */
  outputToken: SwapTokenInfo;
  /** User-entered pay amount */
  inputAmount: string;
  /** Calculated receive amount */
  outputAmount: string;
  /** Current quote data, null if not yet fetched */
  quote: SwapQuoteInfo | null;
  /** True while quote is being fetched */
  isLoadingQuote?: boolean;
  /** Current slippage tolerance (e.g. 0.5 = 0.5%) */
  slippageTolerance: number;
  /** Balance string for input token */
  inputBalance?: string;
  /** Balance string for output token */
  outputBalance?: string;
  /** True if user doesn't have enough input token */
  insufficientBalance?: boolean;
  /** Disable all interaction */
  disabled?: boolean;
  /** Called when the user changes the pay amount */
  onInputAmountChange: (value: string) => void;
  /** Called when the user clicks the flip button */
  onFlipTokens: () => void;
  /** Called when user clicks the input token selector */
  onSelectInputToken: () => void;
  /** Called when user clicks the output token selector */
  onSelectOutputToken: () => void;
  /** Called when slippage tolerance changes */
  onSlippageChange: (value: number) => void;
  /** Called when MAX button is clicked */
  onMaxClick?: () => void;
  /** Called when SWAP button is clicked */
  onSwap: () => void;
}

// ─── Inline SVG Icons ─────────────────────────────────────────────────────────

function IconArrowsUpDown(): React.ReactElement {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 3v18M7 3L3 7M7 3l4 4M17 21V3M17 21l4-4M17 21l-4-4" />
    </svg>
  );
}

function IconChevronDown(): React.ReactElement {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function IconLoader(): React.ReactElement {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      style={{ animation: 'saiko-spin 0.8s linear infinite' }}
    >
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeDasharray="28" strokeDashoffset="10" opacity="0.3" />
      <path d="M8 2a6 6 0 0 1 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function IconAlertTriangle(): React.ReactElement {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
      <path d="M12 9v4M12 17h.01" />
    </svg>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

/** Token logo — shows initials if image fails */
function TokenLogo({
  token,
  size = 28,
}: {
  token: SwapTokenInfo;
  size?: number;
}): React.ReactElement {
  const [imgFailed, setImgFailed] = React.useState(false);

  const style: CSSProperties = {
    width: size,
    height: size,
    borderRadius: '50%',
    backgroundColor: token.featured ? COLORS.primary : COLORS.border,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    overflow: 'hidden',
  };

  if (imgFailed) {
    return (
      <div style={style}>
        <span style={{
          fontFamily: FONT_FAMILY.sans,
          fontSize: size <= 24 ? '9px' : '11px',
          fontWeight: FONT_WEIGHT.bold,
          color: COLORS.textPrimary,
        }}>
          {token.symbol.slice(0, 2)}
        </span>
      </div>
    );
  }

  return (
    <div style={style}>
      <img
        src={token.logoUrl}
        alt={token.symbol}
        style={{ width: size, height: size, objectFit: 'cover' }}
        onError={() => setImgFailed(true)}
      />
    </div>
  );
}

/** Token selector button */
function TokenSelector({
  token,
  onClick,
}: {
  token: SwapTokenInfo;
  onClick: () => void;
}): React.ReactElement {
  const [hovered, setHovered] = React.useState(false);

  const style: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: SPACING[2],
    backgroundColor: hovered ? COLORS.surfaceElevated : COLORS.surface,
    border: `1px solid ${hovered ? COLORS.border : 'transparent'}`,
    borderRadius: RADIUS.full,
    padding: `${SPACING[2]} ${SPACING[3]}`,
    cursor: 'pointer',
    outline: 'none',
    transition: 'background-color 0.15s ease, border-color 0.15s ease',
    flexShrink: 0,
  };

  return (
    <motion.button
      style={style}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      whileTap={{ scale: 0.97 }}
      aria-label={`Select token, currently ${token.symbol}`}
    >
      <TokenLogo token={token} size={22} />
      <span style={{
        fontFamily: FONT_FAMILY.sans,
        fontSize: FONT_SIZE.base,
        fontWeight: FONT_WEIGHT.semibold,
        color: COLORS.textPrimary,
      }}>
        {token.symbol}
      </span>
      <span style={{ color: COLORS.textSecondary }}>
        <IconChevronDown />
      </span>
    </motion.button>
  );
}

/** Slippage option pill */
function SlippagePill({
  value,
  label,
  selected,
  onClick,
}: {
  value: number;
  label: string;
  selected: boolean;
  onClick: () => void;
}): React.ReactElement {
  const style: CSSProperties = {
    padding: `${SPACING[1]} ${SPACING[3]}`,
    borderRadius: RADIUS.full,
    border: `1px solid ${selected ? COLORS.primary : COLORS.border}`,
    backgroundColor: selected ? 'rgba(227,27,35,0.12)' : 'transparent',
    color: selected ? COLORS.primary : COLORS.textSecondary,
    fontFamily: FONT_FAMILY.sans,
    fontSize: FONT_SIZE.xs,
    fontWeight: FONT_WEIGHT.medium,
    cursor: 'pointer',
    outline: 'none',
    transition: 'all 0.15s ease',
  };

  return (
    <motion.button
      style={style}
      onClick={onClick}
      whileTap={{ scale: 0.95 }}
      aria-label={`Set slippage to ${label}`}
      aria-pressed={selected}
    >
      {label}
    </motion.button>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

const SLIPPAGE_OPTIONS = [
  { value: 0.1, label: '0.1%' },
  { value: 0.5, label: '0.5%' },
  { value: 1, label: '1%' },
];

export function SwapCard({
  inputToken,
  outputToken,
  inputAmount,
  outputAmount,
  quote,
  isLoadingQuote = false,
  slippageTolerance,
  inputBalance,
  outputBalance,
  insufficientBalance = false,
  disabled = false,
  onInputAmountChange,
  onFlipTokens,
  onSelectInputToken,
  onSelectOutputToken,
  onSlippageChange,
  onMaxClick,
  onSwap,
}: SwapCardProps): React.ReactElement {
  const [flipRotation, setFlipRotation] = React.useState(0);
  const [customSlippage, setCustomSlippage] = React.useState('');
  const [showCustomSlippage, setShowCustomSlippage] = React.useState(false);
  const [inputFocused, setInputFocused] = React.useState(false);

  const isPreset = SLIPPAGE_OPTIONS.some((o) => o.value === slippageTolerance);

  const handleFlip = (): void => {
    setFlipRotation((r) => r + 180);
    onFlipTokens();
  };

  const handleCustomSlippage = (val: string): void => {
    setCustomSlippage(val);
    const num = parseFloat(val);
    if (!isNaN(num) && num > 0 && num <= 50) {
      onSlippageChange(num);
    }
  };

  const priceImpact = quote?.priceImpact ?? 0;
  const isHighImpact = priceImpact > 2;
  const isDangerImpact = priceImpact > 5;

  const impactColor = isDangerImpact
    ? COLORS.error
    : isHighImpact
    ? COLORS.warning
    : COLORS.textSecondary;

  const canSwap =
    !disabled &&
    !insufficientBalance &&
    inputAmount.length > 0 &&
    parseFloat(inputAmount) > 0 &&
    !isLoadingQuote;

  // ── Styles ─────────────────────────────────────────────────────────────────

  const cardStyle: CSSProperties = {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.xl,
    border: `1px solid ${COLORS.border}`,
    overflow: 'visible',
    width: '100%',
  };

  const sectionStyle: CSSProperties = {
    padding: SPACING[5],
    backgroundColor: COLORS.surfaceElevated,
    borderRadius: RADIUS.lg,
    position: 'relative',
  };

  const sectionLabelStyle: CSSProperties = {
    fontFamily: FONT_FAMILY.sans,
    fontSize: FONT_SIZE.xs,
    fontWeight: FONT_WEIGHT.semibold,
    color: COLORS.textSecondary,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.08em',
    marginBottom: SPACING[3],
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  };

  const amountInputStyle: CSSProperties = {
    background: 'transparent',
    border: 'none',
    outline: 'none',
    color: inputFocused ? COLORS.textPrimary : inputAmount ? COLORS.textPrimary : COLORS.textMuted,
    fontFamily: FONT_FAMILY.mono,
    fontSize: FONT_SIZE.xl,
    fontWeight: FONT_WEIGHT.bold,
    width: '100%',
    padding: 0,
    letterSpacing: '-0.01em',
  };

  const amountDisplayStyle: CSSProperties = {
    fontFamily: FONT_FAMILY.mono,
    fontSize: FONT_SIZE.xl,
    fontWeight: FONT_WEIGHT.bold,
    color: outputAmount ? COLORS.textPrimary : COLORS.textMuted,
    letterSpacing: '-0.01em',
    minHeight: '32px',
    display: 'flex',
    alignItems: 'center',
  };

  const flipButtonStyle: CSSProperties = {
    background: COLORS.surface,
    border: `2px solid ${COLORS.border}`,
    borderRadius: '50%',
    width: '36px',
    height: '36px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    outline: 'none',
    color: COLORS.textSecondary,
    zIndex: 1,
    flexShrink: 0,
    transition: 'border-color 0.15s ease, color 0.15s ease',
  };

  const dividerStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: `${SPACING[2]} 0`,
    position: 'relative',
  };

  const infoRowStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: `${SPACING[2]} 0`,
  };

  const infoLabelStyle: CSSProperties = {
    fontFamily: FONT_FAMILY.sans,
    fontSize: FONT_SIZE.sm,
    color: COLORS.textMuted,
  };

  const infoValueStyle: CSSProperties = {
    fontFamily: FONT_FAMILY.mono,
    fontSize: FONT_SIZE.sm,
    color: COLORS.textSecondary,
  };

  return (
    <>
      <style>{`
        @keyframes saiko-spin { to { transform: rotate(360deg); } }
      `}</style>

      <div style={cardStyle}>
        <div style={{ padding: SPACING[4], display: 'flex', flexDirection: 'column', gap: 0 }}>

          {/* ── YOU PAY ── */}
          <div style={sectionStyle}>
            <div style={sectionLabelStyle}>
              <span>You pay</span>
              {inputBalance !== undefined && (
                <span style={{ color: COLORS.textMuted, fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.regular }}>
                  Balance: {inputBalance}
                </span>
              )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: SPACING[3] }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="0"
                  value={inputAmount}
                  onChange={(e) => onInputAmountChange(e.target.value)}
                  onFocus={() => setInputFocused(true)}
                  onBlur={() => setInputFocused(false)}
                  disabled={disabled}
                  aria-label="Amount to pay"
                  style={amountInputStyle}
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: SPACING[2], flexShrink: 0 }}>
                {onMaxClick !== undefined && inputBalance !== undefined && (
                  <motion.button
                    style={{
                      background: 'rgba(227,27,35,0.12)',
                      border: `1px solid rgba(227,27,35,0.3)`,
                      borderRadius: RADIUS.sm,
                      color: COLORS.primary,
                      fontFamily: FONT_FAMILY.sans,
                      fontSize: FONT_SIZE.xs,
                      fontWeight: FONT_WEIGHT.bold,
                      padding: `${SPACING[1]} ${SPACING[2]}`,
                      cursor: 'pointer',
                      outline: 'none',
                      letterSpacing: '0.06em',
                    }}
                    onClick={onMaxClick}
                    whileTap={{ scale: 0.95 }}
                    aria-label="Use maximum balance"
                  >
                    MAX
                  </motion.button>
                )}
                <TokenSelector token={inputToken} onClick={onSelectInputToken} />
              </div>
            </div>
          </div>

          {/* ── FLIP BUTTON ── */}
          <div style={dividerStyle}>
            <motion.button
              style={flipButtonStyle}
              onClick={handleFlip}
              aria-label="Flip tokens"
              animate={{ rotate: flipRotation }}
              transition={{ type: 'spring', stiffness: 260, damping: 20 }}
              whileHover={{ borderColor: COLORS.primary, color: COLORS.primary }}
              whileTap={{ scale: 0.9 }}
            >
              <IconArrowsUpDown />
            </motion.button>
          </div>

          {/* ── YOU RECEIVE ── */}
          <div style={sectionStyle}>
            <div style={sectionLabelStyle}>
              <span>You receive</span>
              {outputBalance !== undefined && (
                <span style={{ color: COLORS.textMuted, fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.regular }}>
                  Balance: {outputBalance}
                </span>
              )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: SPACING[3] }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <AnimatePresence mode="wait">
                  {isLoadingQuote ? (
                    <motion.div
                      key="loading"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      style={{ ...amountDisplayStyle, color: COLORS.textMuted, gap: SPACING[2] }}
                    >
                      <IconLoader />
                      <span style={{ fontSize: FONT_SIZE.base }}>Fetching quote...</span>
                    </motion.div>
                  ) : (
                    <motion.div
                      key={outputAmount || 'empty'}
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      transition={{ duration: 0.15 }}
                      style={amountDisplayStyle}
                    >
                      {outputAmount || '0'}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <TokenSelector token={outputToken} onClick={onSelectOutputToken} />
            </div>
          </div>

          {/* ── PRICE INFO ── */}
          {quote !== null && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              style={{
                marginTop: SPACING[3],
                padding: `${SPACING[3]} ${SPACING[4]}`,
                backgroundColor: COLORS.surfaceElevated,
                borderRadius: RADIUS.md,
                border: `1px solid ${COLORS.border}`,
                display: 'flex',
                flexDirection: 'column',
                gap: 0,
              }}
            >
              <div style={infoRowStyle}>
                <span style={infoLabelStyle}>Rate</span>
                <span style={infoValueStyle}>
                  1 {inputToken.symbol} = {formatRate(quote.outputAmount, quote.inputAmount)} {outputToken.symbol}
                </span>
              </div>
              <div style={{ ...infoRowStyle, borderTop: `1px solid ${COLORS.divider}` }}>
                <span style={infoLabelStyle}>Price impact</span>
                <span style={{ ...infoValueStyle, color: impactColor, display: 'flex', alignItems: 'center', gap: SPACING[1] }}>
                  {isHighImpact && <IconAlertTriangle />}
                  {quote.priceImpact.toFixed(2)}%
                </span>
              </div>
              <div style={{ ...infoRowStyle, borderTop: `1px solid ${COLORS.divider}` }}>
                <span style={infoLabelStyle}>Min received</span>
                <span style={infoValueStyle}>{quote.minimumReceived} {outputToken.symbol}</span>
              </div>
              <div style={{ ...infoRowStyle, borderTop: `1px solid ${COLORS.divider}` }}>
                <span style={infoLabelStyle}>Network fee</span>
                <span style={infoValueStyle}>~{quote.gasEstimate} ETH</span>
              </div>
            </motion.div>
          )}

          {/* ── SLIPPAGE ── */}
          <div style={{
            marginTop: SPACING[3],
            display: 'flex',
            alignItems: 'center',
            gap: SPACING[2],
            flexWrap: 'wrap' as const,
          }}>
            <span style={{ ...infoLabelStyle, fontSize: FONT_SIZE.xs }}>Slippage:</span>
            {SLIPPAGE_OPTIONS.map((opt) => (
              <SlippagePill
                key={opt.value}
                value={opt.value}
                label={opt.label}
                selected={slippageTolerance === opt.value && !showCustomSlippage}
                onClick={() => {
                  setShowCustomSlippage(false);
                  onSlippageChange(opt.value);
                }}
              />
            ))}
            <motion.button
              style={{
                padding: `${SPACING[1]} ${SPACING[3]}`,
                borderRadius: RADIUS.full,
                border: `1px solid ${showCustomSlippage || !isPreset ? COLORS.primary : COLORS.border}`,
                backgroundColor: showCustomSlippage || !isPreset ? 'rgba(227,27,35,0.12)' : 'transparent',
                color: showCustomSlippage || !isPreset ? COLORS.primary : COLORS.textSecondary,
                fontFamily: FONT_FAMILY.sans,
                fontSize: FONT_SIZE.xs,
                fontWeight: FONT_WEIGHT.medium,
                cursor: 'pointer',
                outline: 'none',
                display: 'flex',
                alignItems: 'center',
                gap: SPACING[1],
              }}
              onClick={() => setShowCustomSlippage((v) => !v)}
              whileTap={{ scale: 0.95 }}
            >
              Custom
            </motion.button>
            {showCustomSlippage && (
              <motion.div
                initial={{ opacity: 0, width: 0 }}
                animate={{ opacity: 1, width: 'auto' }}
                style={{ display: 'flex', alignItems: 'center', gap: SPACING[1] }}
              >
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="0.5"
                  value={customSlippage}
                  onChange={(e) => handleCustomSlippage(e.target.value)}
                  style={{
                    width: '60px',
                    background: COLORS.surfaceElevated,
                    border: `1px solid ${COLORS.border}`,
                    borderRadius: RADIUS.sm,
                    color: COLORS.textPrimary,
                    fontFamily: FONT_FAMILY.mono,
                    fontSize: FONT_SIZE.sm,
                    padding: `${SPACING[1]} ${SPACING[2]}`,
                    outline: 'none',
                    textAlign: 'right' as const,
                  }}
                  aria-label="Custom slippage percentage"
                />
                <span style={{ color: COLORS.textMuted, fontSize: FONT_SIZE.xs }}>%</span>
              </motion.div>
            )}
          </div>

          {/* ── WARNINGS ── */}
          <AnimatePresence>
            {insufficientBalance && (
              <motion.div
                key="insufficient"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                style={{
                  marginTop: SPACING[3],
                  padding: SPACING[3],
                  backgroundColor: 'rgba(227,27,35,0.1)',
                  border: `1px solid rgba(227,27,35,0.3)`,
                  borderRadius: RADIUS.md,
                  display: 'flex',
                  alignItems: 'center',
                  gap: SPACING[2],
                  color: COLORS.error,
                }}
              >
                <IconAlertTriangle />
                <span style={{ fontFamily: FONT_FAMILY.sans, fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.medium }}>
                  Insufficient {inputToken.symbol} balance
                </span>
              </motion.div>
            )}
            {isDangerImpact && !insufficientBalance && (
              <motion.div
                key="high-impact"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                style={{
                  marginTop: SPACING[3],
                  padding: SPACING[3],
                  backgroundColor: 'rgba(227,27,35,0.1)',
                  border: `1px solid rgba(227,27,35,0.3)`,
                  borderRadius: RADIUS.md,
                  display: 'flex',
                  alignItems: 'center',
                  gap: SPACING[2],
                  color: COLORS.error,
                }}
              >
                <IconAlertTriangle />
                <span style={{ fontFamily: FONT_FAMILY.sans, fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.medium }}>
                  High price impact ({priceImpact.toFixed(1)}%) — proceed with caution
                </span>
              </motion.div>
            )}
            {isHighImpact && !isDangerImpact && !insufficientBalance && (
              <motion.div
                key="medium-impact"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                style={{
                  marginTop: SPACING[3],
                  padding: SPACING[3],
                  backgroundColor: 'rgba(251,140,0,0.1)',
                  border: `1px solid rgba(251,140,0,0.3)`,
                  borderRadius: RADIUS.md,
                  display: 'flex',
                  alignItems: 'center',
                  gap: SPACING[2],
                  color: COLORS.warning,
                }}
              >
                <IconAlertTriangle />
                <span style={{ fontFamily: FONT_FAMILY.sans, fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.medium }}>
                  Price impact {priceImpact.toFixed(1)}% — larger than expected
                </span>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── SWAP BUTTON ── */}
          <motion.button
            onClick={onSwap}
            disabled={!canSwap}
            aria-label="Swap tokens"
            style={{
              marginTop: SPACING[4],
              width: '100%',
              padding: `${SPACING[4]} ${SPACING[6]}`,
              backgroundColor: canSwap ? COLORS.primary : COLORS.surfaceElevated,
              border: 'none',
              borderRadius: RADIUS.md,
              color: canSwap ? COLORS.textPrimary : COLORS.textDisabled,
              fontFamily: FONT_FAMILY.sans,
              fontSize: FONT_SIZE.base,
              fontWeight: FONT_WEIGHT.bold,
              letterSpacing: '0.08em',
              textTransform: 'uppercase' as const,
              cursor: canSwap ? 'pointer' : 'not-allowed',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: SPACING[2],
              transition: 'background-color 0.15s ease',
              outline: 'none',
            }}
            whileHover={canSwap ? { backgroundColor: COLORS.primaryHover } : {}}
            whileTap={canSwap ? { scale: 0.99 } : {}}
          >
            {isLoadingQuote ? (
              <>
                <IconLoader />
                <span>Getting quote...</span>
              </>
            ) : insufficientBalance ? (
              'Insufficient balance'
            ) : !inputAmount || parseFloat(inputAmount) === 0 ? (
              'Enter an amount'
            ) : (
              'Swap'
            )}
          </motion.button>

        </div>
      </div>
    </>
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

// end of SwapCard
