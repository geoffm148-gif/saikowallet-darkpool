/**
 * Saiko Wallet — Spacing Tokens
 *
 * WHY: A consistent 4px base grid prevents one-off spacing decisions
 * that accumulate into visual inconsistency over time.
 * All layout spacing must reference these tokens.
 */

/** Base unit in pixels — 4px grid */
const BASE = 4;

/**
 * Spacing scale in pixels.
 * Usage: `padding: SPACING[4]` → '16px'
 */
export const SPACING = {
  /** 4px */
  1: `${BASE * 1}px`,
  /** 8px */
  2: `${BASE * 2}px`,
  /** 12px */
  3: `${BASE * 3}px`,
  /** 16px */
  4: `${BASE * 4}px`,
  /** 20px */
  5: `${BASE * 5}px`,
  /** 24px */
  6: `${BASE * 6}px`,
  /** 32px */
  8: `${BASE * 8}px`,
  /** 40px */
  10: `${BASE * 10}px`,
  /** 48px */
  12: `${BASE * 12}px`,
  /** 64px */
  16: `${BASE * 16}px`,
  /** 80px */
  20: `${BASE * 20}px`,
  /** 96px */
  24: `${BASE * 24}px`,
  /** 128px */
  32: `${BASE * 32}px`,
  /** 0px — explicit zero, for overrides */
  0: '0px',
} as const;

/** Raw number values (px) — for calculations, SVG, or canvas */
export const SPACING_PX = {
  1: BASE * 1,
  2: BASE * 2,
  3: BASE * 3,
  4: BASE * 4,
  5: BASE * 5,
  6: BASE * 6,
  8: BASE * 8,
  10: BASE * 10,
  12: BASE * 12,
  16: BASE * 16,
  20: BASE * 20,
  24: BASE * 24,
  32: BASE * 32,
  0: 0,
} as const;

/** Border radii — also on the 4px grid */
export const RADIUS = {
  /** 4px — buttons, inputs */
  sm: '4px',
  /** 8px — cards */
  md: '8px',
  /** 12px — modals */
  lg: '12px',
  /** 16px — large cards */
  xl: '16px',
  /** 9999px — pills, badges */
  full: '9999px',
  /** 0 — square */
  none: '0px',
} as const;

export type SpacingKey = keyof typeof SPACING;
export type RadiusKey = keyof typeof RADIUS;
