import React, { type CSSProperties } from 'react';
import { COLORS } from '../themes/colors.js';
import { FONT_FAMILY, FONT_SIZE, FONT_WEIGHT } from '../themes/typography.js';
import { SPACING, RADIUS } from '../themes/spacing.js';

export type BadgeVariant = 'connected' | 'locked' | 'testnet' | 'success' | 'warning' | 'error' | 'default';

export interface BadgeProps {
  variant?: BadgeVariant;
  children: React.ReactNode;
  /** Show a status dot before the text */
  dot?: boolean;
  style?: CSSProperties;
}

interface BadgeStyle {
  backgroundColor: string;
  color: string;
  dotColor: string;
}

const BADGE_STYLES: Record<BadgeVariant, BadgeStyle> = {
  connected: {
    backgroundColor: 'rgba(67,160,71,0.15)',
    color: COLORS.connected,
    dotColor: COLORS.connected,
  },
  locked: {
    backgroundColor: 'rgba(229,57,53,0.15)',
    color: COLORS.locked,
    dotColor: COLORS.locked,
  },
  testnet: {
    backgroundColor: 'rgba(251,140,0,0.15)',
    color: COLORS.testnet,
    dotColor: COLORS.testnet,
  },
  success: {
    backgroundColor: 'rgba(67,160,71,0.15)',
    color: COLORS.success,
    dotColor: COLORS.success,
  },
  warning: {
    backgroundColor: 'rgba(251,140,0,0.15)',
    color: COLORS.warning,
    dotColor: COLORS.warning,
  },
  error: {
    backgroundColor: 'rgba(229,57,53,0.15)',
    color: COLORS.error,
    dotColor: COLORS.error,
  },
  default: {
    backgroundColor: COLORS.surfaceElevated,
    color: COLORS.textSecondary,
    dotColor: COLORS.textSecondary,
  },
};

/** Status badge component — connected, locked, testnet, etc. */
export function Badge({
  variant = 'default',
  children,
  dot = false,
  style,
}: BadgeProps): React.ReactElement {
  const { backgroundColor, color, dotColor } = BADGE_STYLES[variant];

  const badgeStyle: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: SPACING[2],
    backgroundColor,
    color,
    fontFamily: FONT_FAMILY.sans,
    fontSize: FONT_SIZE.sm,
    fontWeight: FONT_WEIGHT.medium,
    padding: `${SPACING[1]} ${SPACING[3]}`,
    borderRadius: RADIUS.full,
    lineHeight: '1.4',
    whiteSpace: 'nowrap',
    letterSpacing: '0.02em',
    ...style,
  };

  const dotStyle: CSSProperties = {
    width: '6px',
    height: '6px',
    borderRadius: '50%',
    backgroundColor: dotColor,
    flexShrink: 0,
  };

  return (
    <span style={badgeStyle}>
      {dot && <span style={dotStyle} aria-hidden="true" />}
      {children}
    </span>
  );
}
