import React, { type CSSProperties } from 'react';
import { COLORS } from '../themes/colors.js';
import { FONT_FAMILY, FONT_SIZE, FONT_WEIGHT } from '../themes/typography.js';
import { SPACING, RADIUS } from '../themes/spacing.js';

export interface CardProps {
  /** Optional card title — renders in a header section */
  title?: string;
  /** Optional right-side header element (e.g., a badge or action) */
  headerAction?: React.ReactNode;
  /** Show a 1px border around the card */
  bordered?: boolean;
  /** Extra padding variant */
  padding?: 'sm' | 'md' | 'lg' | 'none';
  /** Elevated (lighter background) */
  elevated?: boolean;
  children: React.ReactNode;
  style?: CSSProperties;
  onClick?: () => void;
}

const PADDING_MAP = {
  none: '0px',
  sm: SPACING[4],
  md: SPACING[6],
  lg: SPACING[8],
} as const;

/** Surface card — core layout primitive for wallet UI */
export function Card({
  title,
  headerAction,
  bordered = true,
  padding = 'md',
  elevated = false,
  children,
  style,
  onClick,
}: CardProps): React.ReactElement {
  const cardStyle: CSSProperties = {
    backgroundColor: elevated ? COLORS.surfaceElevated : COLORS.surface,
    borderRadius: RADIUS.lg,
    border: bordered ? `1px solid ${COLORS.border}` : 'none',
    overflow: 'hidden',
    cursor: onClick ? 'pointer' : 'default',
    transition: onClick ? 'border-color 0.15s ease' : 'none',
    ...style,
  };

  const headerStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: `${SPACING[4]} ${PADDING_MAP[padding]}`,
    borderBottom: `1px solid ${COLORS.border}`,
  };

  const titleStyle: CSSProperties = {
    fontFamily: FONT_FAMILY.sans,
    fontSize: FONT_SIZE.md,
    fontWeight: FONT_WEIGHT.semibold,
    color: COLORS.textSecondary,
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
  };

  const bodyStyle: CSSProperties = {
    padding: padding === 'none' ? '0' : PADDING_MAP[padding],
  };

  return (
    <div style={cardStyle} onClick={onClick}>
      {title !== undefined && (
        <div style={headerStyle}>
          <span style={titleStyle}>{title}</span>
          {headerAction !== undefined && <div>{headerAction}</div>}
        </div>
      )}
      <div style={bodyStyle}>{children}</div>
    </div>
  );
}
