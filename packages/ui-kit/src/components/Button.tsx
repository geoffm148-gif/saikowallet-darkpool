import React, { type CSSProperties } from 'react';
import { COLORS } from '../themes/colors.js';
import { FONT_FAMILY, FONT_SIZE, FONT_WEIGHT } from '../themes/typography.js';
import { SPACING, RADIUS } from '../themes/spacing.js';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps {
  /** Visual style */
  variant?: ButtonVariant;
  /** Size */
  size?: ButtonSize;
  /** Disables the button and prevents interaction */
  disabled?: boolean;
  /** Shows a spinner and disables the button */
  isLoading?: boolean;
  /** Full-width button */
  fullWidth?: boolean;
  /** Button label / children */
  children: React.ReactNode;
  onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void;
  type?: 'button' | 'submit' | 'reset';
  style?: CSSProperties;
  'aria-label'?: string;
}

const VARIANT_STYLES: Record<ButtonVariant, CSSProperties> = {
  primary: {
    backgroundColor: COLORS.primary,
    color: COLORS.textPrimary,
    border: 'none',
  },
  secondary: {
    backgroundColor: COLORS.surface,
    color: COLORS.textPrimary,
    border: `1px solid ${COLORS.border}`,
  },
  danger: {
    backgroundColor: COLORS.errorMuted,
    color: COLORS.textPrimary,
    border: 'none',
  },
  ghost: {
    backgroundColor: COLORS.transparent,
    color: COLORS.textSecondary,
    border: `1px solid ${COLORS.border}`,
  },
};

const VARIANT_HOVER_BG: Record<ButtonVariant, string> = {
  primary: COLORS.primaryHover,
  secondary: COLORS.surfaceElevated,
  danger: COLORS.primary,
  ghost: COLORS.surfaceElevated,
};

const SIZE_STYLES: Record<ButtonSize, CSSProperties> = {
  sm: {
    padding: `${SPACING[2]} ${SPACING[4]}`,
    fontSize: FONT_SIZE.sm,
    minHeight: '32px',
  },
  md: {
    padding: `${SPACING[3]} ${SPACING[6]}`,
    fontSize: FONT_SIZE.base,
    minHeight: '44px',
  },
  lg: {
    padding: `${SPACING[4]} ${SPACING[8]}`,
    fontSize: FONT_SIZE.lg,
    minHeight: '52px',
  },
};

/** Accessible spinner SVG — inline to avoid external dependencies */
function Spinner(): React.ReactElement {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      style={{
        animation: 'saiko-spin 0.8s linear infinite',
        marginRight: SPACING[2],
        flexShrink: 0,
      }}
    >
      <circle
        cx="8"
        cy="8"
        r="6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeDasharray="28"
        strokeDashoffset="10"
        opacity="0.3"
      />
      <path
        d="M8 2a6 6 0 0 1 6 6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Saiko Wallet primary button component */
export function Button({
  variant = 'primary',
  size = 'md',
  disabled = false,
  isLoading = false,
  fullWidth = false,
  children,
  onClick,
  type = 'button',
  style,
  'aria-label': ariaLabel,
}: ButtonProps): React.ReactElement {
  const [isHovered, setIsHovered] = React.useState(false);
  const isDisabled = disabled || isLoading;

  const baseStyle: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: FONT_FAMILY.sans,
    fontWeight: FONT_WEIGHT.semibold,
    borderRadius: RADIUS.md,
    cursor: isDisabled ? 'not-allowed' : 'pointer',
    opacity: isDisabled ? 0.5 : 1,
    transition: 'background-color 0.15s ease, opacity 0.15s ease',
    outline: 'none',
    userSelect: 'none',
    width: fullWidth ? '100%' : 'auto',
    textDecoration: 'none',
    letterSpacing: '0.01em',
    ...VARIANT_STYLES[variant],
    ...SIZE_STYLES[size],
    ...(isHovered && !isDisabled
      ? { backgroundColor: VARIANT_HOVER_BG[variant] }
      : {}),
    ...style,
  };

  return (
    <>
      <style>{`@keyframes saiko-spin { to { transform: rotate(360deg); } }`}</style>
      <button
        type={type}
        disabled={isDisabled}
        onClick={isDisabled ? undefined : onClick}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        aria-label={ariaLabel}
        aria-busy={isLoading}
        style={baseStyle}
      >
        {isLoading && <Spinner />}
        {children}
      </button>
    </>
  );
}
