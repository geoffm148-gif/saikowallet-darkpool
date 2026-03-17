/**
 * Saiko Wallet — UI Kit Public API
 *
 * Single import point for all design tokens and components:
 *   import { Button, COLORS, theme } from '@saiko-wallet/ui-kit'
 */

// ── Design Tokens ─────────────────────────────────────────────────────────────
export { COLORS } from './themes/colors.js';
export type { ColorToken } from './themes/colors.js';

export {
  FONT_FAMILY,
  FONT_SIZE,
  FONT_WEIGHT,
  LINE_HEIGHT,
  LETTER_SPACING,
  TEXT_STYLES,
} from './themes/typography.js';
export type { FontFamily, FontSize, FontWeight } from './themes/typography.js';

export { SPACING, SPACING_PX, RADIUS } from './themes/spacing.js';
export type { SpacingKey, RadiusKey } from './themes/spacing.js';

export { theme } from './themes/index.js';
export type { Theme } from './themes/index.js';

// ── Components ────────────────────────────────────────────────────────────────
export { Button } from './components/Button.js';
export type { ButtonProps, ButtonVariant, ButtonSize } from './components/Button.js';

export { Card } from './components/Card.js';
export type { CardProps } from './components/Card.js';

export { Input } from './components/Input.js';
export type { InputProps } from './components/Input.js';

export { Modal } from './components/Modal.js';
export type { ModalProps } from './components/Modal.js';

export { Badge } from './components/Badge.js';
export type { BadgeProps, BadgeVariant } from './components/Badge.js';

export { Toast, ToastContainer, useToasts } from './components/Toast.js';
export type { ToastProps, ToastContainerProps, ToastMessage, ToastType } from './components/Toast.js';

export { TokenBalance } from './components/TokenBalance.js';
export type { TokenBalanceProps } from './components/TokenBalance.js';

export { AddressDisplay } from './components/AddressDisplay.js';
export type { AddressDisplayProps } from './components/AddressDisplay.js';

export { SeedPhraseGrid } from './components/SeedPhraseGrid.js';
export type { SeedPhraseGridProps } from './components/SeedPhraseGrid.js';

export { TransactionReview } from './components/TransactionReview.js';
export type { TransactionReviewProps } from './components/TransactionReview.js';

export { GasSelector, DEFAULT_GAS_OPTIONS } from './components/GasSelector.js';
export type { GasSelectorProps, GasOption, GasSpeed } from './components/GasSelector.js';

export { SecurityBadge } from './components/SecurityBadge.js';
export type { SecurityBadgeProps, SecurityStatus } from './components/SecurityBadge.js';

export { SwapCard } from './components/SwapCard.js';
export type { SwapCardProps, SwapTokenInfo, SwapQuoteInfo } from './components/SwapCard.js';
