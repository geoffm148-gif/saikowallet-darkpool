/**
 * Saiko Wallet — Brand Color Tokens
 *
 * WHY: Derived from the Saiko Inu logo (aggressive wolf/husky with red eyes
 * on a near-black background). All colors must reference these constants so
 * any future rebrand is a single-file change.
 */

export const COLORS = {
  // ── Backgrounds ──────────────────────────────────────────────────────────
  /** App background — near-black, matching logo background */
  background: '#0A0A0A',
  /** Card/surface background */
  surface: '#141414',
  /** Elevated surfaces: modals, dropdowns, tooltips */
  surfaceElevated: '#1E1E1E',

  // ── Primary Accent (Red — wolf's eye color) ───────────────────────────────
  primary: '#E31B23',
  primaryHover: '#8B0000',
  primaryMuted: '#8B0000',

  // ── Semantic Colors ───────────────────────────────────────────────────────
  success: '#43A047',
  successMuted: '#2E7D32',
  warning: '#FB8C00',
  warningMuted: '#E65100',
  error: '#E31B23',
  errorMuted: '#8B0000',

  // ── Text ─────────────────────────────────────────────────────────────────
  textPrimary: '#FFFFFF',
  textSecondary: '#9E9E9E',
  textMuted: '#616161',
  textDisabled: '#424242',

  // ── Borders & Dividers ────────────────────────────────────────────────────
  border: '#2A2A2A',
  borderFocus: '#E31B23',
  divider: '#1A1A1A',

  // ── Interactive States ────────────────────────────────────────────────────
  hoverOverlay: 'rgba(255,255,255,0.05)',
  activeOverlay: 'rgba(255,255,255,0.10)',
  disabledOverlay: 'rgba(255,255,255,0.03)',

  // ── Token-Specific ────────────────────────────────────────────────────────
  /** SAIKO brand accent — same as primary red */
  saiko: '#E31B23',
  /** ETH brand blue */
  eth: '#627EEA',

  // ── Status Badges ─────────────────────────────────────────────────────────
  connected: '#43A047',
  locked: '#E31B23',
  testnet: '#FB8C00',

  // ── Misc ──────────────────────────────────────────────────────────────────
  transparent: 'transparent',
  white: '#FFFFFF',
  black: '#000000',
} as const;

export type ColorToken = keyof typeof COLORS;

