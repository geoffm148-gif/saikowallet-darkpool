/**
 * Saiko Wallet — Typography Tokens
 *
 * WHY: Consistent type scale ensures visual hierarchy across all screens.
 * Inter for UI text (clean, modern), JetBrains Mono for crypto data
 * (addresses, hashes, amounts) where character precision matters.
 */

export const FONT_FAMILY = {
  /** UI text — Inter with system font fallbacks */
  sans: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  /** Crypto data — addresses, hashes, seeds, amounts */
  mono: '"JetBrains Mono", "Fira Code", "Cascadia Code", "Roboto Mono", "Courier New", monospace',
} as const;

export const FONT_SIZE = {
  /** 10px — labels, tiny captions */
  xs: '0.625rem',
  /** 12px — captions, helper text */
  sm: '0.75rem',
  /** 14px — body small */
  md: '0.875rem',
  /** 16px — body default */
  base: '1rem',
  /** 18px — body large, subheadings */
  lg: '1.125rem',
  /** 20px — heading small */
  xl: '1.25rem',
  /** 24px — heading medium */
  '2xl': '1.5rem',
  /** 30px — heading large */
  '3xl': '1.875rem',
  /** 36px — display */
  '4xl': '2.25rem',
  /** 48px — hero balance display */
  '5xl': '3rem',
} as const;

export const FONT_WEIGHT = {
  regular: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
  extrabold: '800',
} as const;

export const LINE_HEIGHT = {
  tight: '1.2',
  snug: '1.375',
  normal: '1.5',
  relaxed: '1.625',
  loose: '2',
} as const;

export const LETTER_SPACING = {
  tight: '-0.025em',
  normal: '0em',
  wide: '0.025em',
  wider: '0.05em',
  /** Use for address display — slightly wider for legibility */
  address: '0.04em',
} as const;

/** Pre-built text style presets for common UI patterns */
export const TEXT_STYLES = {
  /** Large balance display (e.g., SAIKO amount on dashboard) */
  balanceHero: {
    fontFamily: FONT_FAMILY.mono,
    fontSize: FONT_SIZE['5xl'],
    fontWeight: FONT_WEIGHT.bold,
    lineHeight: LINE_HEIGHT.tight,
    letterSpacing: LETTER_SPACING.tight,
  },
  /** H1 — 48px per brand guide. UPPERCASE in UI. */
  heading1: {
    fontFamily: FONT_FAMILY.sans,
    fontSize: FONT_SIZE['5xl'],
    fontWeight: FONT_WEIGHT.extrabold,
    lineHeight: LINE_HEIGHT.tight,
    textTransform: 'uppercase' as const,
  },
  /** H2 — 36px per brand guide */
  heading2: {
    fontFamily: FONT_FAMILY.sans,
    fontSize: FONT_SIZE['4xl'],
    fontWeight: FONT_WEIGHT.bold,
    lineHeight: LINE_HEIGHT.tight,
  },
  /** H3 — 24px per brand guide */
  heading3: {
    fontFamily: FONT_FAMILY.sans,
    fontSize: FONT_SIZE['2xl'],
    fontWeight: FONT_WEIGHT.semibold,
    lineHeight: LINE_HEIGHT.snug,
  },
  /** H4 — 18px per brand guide */
  heading4: {
    fontFamily: FONT_FAMILY.sans,
    fontSize: FONT_SIZE.lg,
    fontWeight: FONT_WEIGHT.semibold,
    lineHeight: LINE_HEIGHT.snug,
  },
  /** Default body */
  body: {
    fontFamily: FONT_FAMILY.sans,
    fontSize: FONT_SIZE.base,
    fontWeight: FONT_WEIGHT.regular,
    lineHeight: LINE_HEIGHT.normal,
  },
  /** Small body */
  bodySmall: {
    fontFamily: FONT_FAMILY.sans,
    fontSize: FONT_SIZE.md,
    fontWeight: FONT_WEIGHT.regular,
    lineHeight: LINE_HEIGHT.normal,
  },
  /** Crypto address (truncated) */
  address: {
    fontFamily: FONT_FAMILY.mono,
    fontSize: FONT_SIZE.md,
    fontWeight: FONT_WEIGHT.regular,
    lineHeight: LINE_HEIGHT.normal,
    letterSpacing: LETTER_SPACING.address,
  },
  /** Seed phrase word */
  seedWord: {
    fontFamily: FONT_FAMILY.mono,
    fontSize: FONT_SIZE.base,
    fontWeight: FONT_WEIGHT.medium,
    lineHeight: LINE_HEIGHT.normal,
  },
  /** Label / caption */
  label: {
    fontFamily: FONT_FAMILY.sans,
    fontSize: FONT_SIZE.sm,
    fontWeight: FONT_WEIGHT.medium,
    lineHeight: LINE_HEIGHT.normal,
  },
  /** Helper / error text */
  helper: {
    fontFamily: FONT_FAMILY.sans,
    fontSize: FONT_SIZE.sm,
    fontWeight: FONT_WEIGHT.regular,
    lineHeight: LINE_HEIGHT.normal,
  },
} as const;

export type FontFamily = keyof typeof FONT_FAMILY;
export type FontSize = keyof typeof FONT_SIZE;
export type FontWeight = keyof typeof FONT_WEIGHT;
