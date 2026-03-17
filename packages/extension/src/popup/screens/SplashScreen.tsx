import React, { type CSSProperties } from 'react';
import { COLORS, FONT_FAMILY, FONT_SIZE, FONT_WEIGHT, SPACING } from '@saiko-wallet/ui-kit';

const CONTAINER: CSSProperties = {
  width: '360px',
  height: '600px',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  backgroundColor: COLORS.background,
  gap: SPACING[4],
};

export function SplashScreen(): React.ReactElement {
  return (
    <div style={CONTAINER}>
      <div style={{
        width: '48px',
        height: '48px',
        border: `3px solid ${COLORS.border}`,
        borderTopColor: COLORS.primary,
        borderRadius: '50%',
        animation: 'spin 1s linear infinite',
      }} />
      <div style={{
        fontFamily: FONT_FAMILY.sans,
        fontSize: FONT_SIZE.lg,
        fontWeight: FONT_WEIGHT.bold,
        color: COLORS.textPrimary,
        letterSpacing: '0.08em',
      }}>
        SAIKO WALLET
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
