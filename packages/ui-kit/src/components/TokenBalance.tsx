import React, { type CSSProperties } from 'react';
import { COLORS } from '../themes/colors.js';
import { FONT_FAMILY, FONT_SIZE, FONT_WEIGHT } from '../themes/typography.js';
import { SPACING, RADIUS } from '../themes/spacing.js';

export interface TokenBalanceProps {
  /** Token symbol (e.g., "SAIKO", "ETH") */
  symbol: string;
  /** Token full name (e.g., "Saiko Inu") */
  name?: string;
  /** Formatted balance string (e.g., "1,234,567.89") */
  balance: string;
  /** Fiat value string (e.g., "$123.45") */
  fiatValue?: string;
  /** URL for token logo image */
  logoUrl?: string;
  /** Featured = large display variant (SAIKO on dashboard) */
  featured?: boolean;
  /** Price change percentage (e.g., "+5.23%") */
  priceChange?: string;
  /** Whether price change is positive */
  priceChangePositive?: boolean;
  style?: CSSProperties;
  onClick?: () => void;
}

/** Displays a token with icon, symbol, and balance amount */
export function TokenBalance({
  symbol,
  name,
  balance,
  fiatValue,
  logoUrl,
  featured = false,
  priceChange,
  priceChangePositive,
  style,
  onClick,
}: TokenBalanceProps): React.ReactElement {
  const containerStyle: CSSProperties = featured
    ? {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: SPACING[3],
        padding: SPACING[8],
        cursor: onClick !== undefined ? 'pointer' : 'default',
        ...style,
      }
    : {
        display: 'flex',
        alignItems: 'center',
        gap: SPACING[4],
        padding: `${SPACING[4]} 0`,
        cursor: onClick !== undefined ? 'pointer' : 'default',
        ...style,
      };

  const logoStyle: CSSProperties = {
    width: featured ? '88px' : '40px',
    height: featured ? '88px' : '40px',
    borderRadius: '50%',
    backgroundColor: COLORS.surfaceElevated,
    border: featured
      ? `2px solid ${COLORS.primary}`
      : `1px solid ${COLORS.border}`,
    overflow: 'hidden',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    fontSize: featured ? '40px' : '18px',
  };

  const logoImgStyle: CSSProperties = {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  };

  const symbolPlaceholder = symbol.charAt(0).toUpperCase();

  if (featured) {
    return (
      <div style={containerStyle} onClick={onClick}>
        <div style={logoStyle}>
          {logoUrl !== undefined ? (
            <img src={logoUrl} alt={symbol} style={logoImgStyle} />
          ) : (
            <span style={{ color: COLORS.primary, fontWeight: FONT_WEIGHT.bold }}>
              {symbolPlaceholder}
            </span>
          )}
        </div>
        <div style={{ textAlign: 'center' }}>
          <div
            style={{
              fontFamily: FONT_FAMILY.mono,
              fontSize: FONT_SIZE['4xl'],
              fontWeight: FONT_WEIGHT.bold,
              color: COLORS.textPrimary,
              lineHeight: 1.1,
              letterSpacing: '-0.02em',
            }}
          >
            {balance}
          </div>
          <div
            style={{
              fontFamily: FONT_FAMILY.sans,
              fontSize: FONT_SIZE.lg,
              fontWeight: FONT_WEIGHT.medium,
              color: COLORS.primary,
              marginTop: SPACING[1],
            }}
          >
            {symbol}
          </div>
          {name !== undefined && (
            <div
              style={{
                fontFamily: FONT_FAMILY.sans,
                fontSize: FONT_SIZE.sm,
                color: COLORS.textMuted,
                marginTop: SPACING[1],
              }}
            >
              {name}
            </div>
          )}
          {fiatValue !== undefined && (
            <div
              style={{
                fontFamily: FONT_FAMILY.sans,
                fontSize: FONT_SIZE.base,
                color: COLORS.textSecondary,
                marginTop: SPACING[2],
              }}
            >
              {fiatValue}
              {priceChange !== undefined && (
                <span
                  style={{
                    marginLeft: SPACING[2],
                    color: priceChangePositive === true ? COLORS.success : COLORS.error,
                    fontSize: FONT_SIZE.sm,
                  }}
                >
                  {priceChange}
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Standard compact row
  return (
    <div style={containerStyle} onClick={onClick}>
      <div style={logoStyle}>
        {logoUrl !== undefined ? (
          <img src={logoUrl} alt={symbol} style={logoImgStyle} />
        ) : (
          <span style={{ color: COLORS.textSecondary, fontWeight: FONT_WEIGHT.medium }}>
            {symbolPlaceholder}
          </span>
        )}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontFamily: FONT_FAMILY.sans,
            fontSize: FONT_SIZE.base,
            fontWeight: FONT_WEIGHT.medium,
            color: COLORS.textPrimary,
          }}
        >
          {symbol}
        </div>
        {name !== undefined && (
          <div
            style={{
              fontFamily: FONT_FAMILY.sans,
              fontSize: FONT_SIZE.sm,
              color: COLORS.textMuted,
            }}
          >
            {name}
          </div>
        )}
      </div>
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <div
          style={{
            fontFamily: FONT_FAMILY.mono,
            fontSize: FONT_SIZE.base,
            fontWeight: FONT_WEIGHT.medium,
            color: COLORS.textPrimary,
          }}
        >
          {balance}
        </div>
        {fiatValue !== undefined && (
          <div
            style={{
              fontFamily: FONT_FAMILY.sans,
              fontSize: FONT_SIZE.sm,
              color: COLORS.textMuted,
            }}
          >
            {fiatValue}
          </div>
        )}
      </div>
    </div>
  );
}
