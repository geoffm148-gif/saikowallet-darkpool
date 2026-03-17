/**
 * Saiko Wallet — Combined Theme Export
 *
 * Single import point for all design tokens:
 *   import { theme, COLORS, SPACING, FONT_SIZE } from '@saiko-wallet/ui-kit/themes'
 */

export { COLORS } from './colors.js';
export type { ColorToken } from './colors.js';

export {
  FONT_FAMILY,
  FONT_SIZE,
  FONT_WEIGHT,
  LINE_HEIGHT,
  LETTER_SPACING,
  TEXT_STYLES,
} from './typography.js';
export type { FontFamily, FontSize, FontWeight } from './typography.js';

export { SPACING, SPACING_PX, RADIUS } from './spacing.js';
export type { SpacingKey, RadiusKey } from './spacing.js';

import { COLORS } from './colors.js';
import { FONT_FAMILY, FONT_SIZE, FONT_WEIGHT, LINE_HEIGHT } from './typography.js';
import { SPACING, RADIUS } from './spacing.js';

/**
 * Convenience theme object — same tokens, nested for IDE discovery.
 * Use named exports above when possible; this is for component prop drilling.
 */
export const theme = {
  colors: COLORS,
  fontFamily: FONT_FAMILY,
  fontSize: FONT_SIZE,
  fontWeight: FONT_WEIGHT,
  lineHeight: LINE_HEIGHT,
  spacing: SPACING,
  radius: RADIUS,
} as const;

export type Theme = typeof theme;
