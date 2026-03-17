/**
 * DarkPool Screen — Coming Soon placeholder (extension popup).
 */
import React, { type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { IconArrowLeft, IconShield } from '../icons';
import { COLORS, FONT_FAMILY, FONT_SIZE, FONT_WEIGHT, SPACING, RADIUS } from '@saiko-wallet/ui-kit';

const SCREEN: CSSProperties = {
  minHeight: '600px', display: 'flex', flexDirection: 'column',
  backgroundColor: COLORS.background, padding: SPACING[4],
};

export function DarkPoolScreen(): React.ReactElement {
  const navigate = useNavigate();

  return (
    <div style={SCREEN}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: SPACING[3], marginBottom: SPACING[4] }}>
        <button
          onClick={() => void navigate('/dashboard')}
          style={{
            background: 'none', border: `1px solid ${COLORS.border}`, borderRadius: RADIUS.md,
            color: COLORS.textSecondary, cursor: 'pointer', padding: `${SPACING[2]} ${SPACING[3]}`,
            display: 'flex', alignItems: 'center',
          }}
        >
          <IconArrowLeft size={16} />
        </button>
        <div style={{ fontFamily: FONT_FAMILY.sans, fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.bold, color: COLORS.textPrimary }}>
          DarkPool
        </div>
      </div>

      {/* Hero */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: SPACING[6] }}>
        <div style={{
          width: 72, height: 72, borderRadius: '50%',
          backgroundColor: `${COLORS.primary}1A`,
          border: `2px solid ${COLORS.primary}33`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          marginBottom: SPACING[4],
        }}>
          <IconShield size={36} color={COLORS.primary} />
        </div>
        <div style={{
          fontFamily: FONT_FAMILY.sans, fontSize: FONT_SIZE['2xl'], fontWeight: FONT_WEIGHT.bold,
          color: COLORS.textPrimary, marginBottom: SPACING[2], textAlign: 'center',
        }}>
          Saiko Dark Pools
        </div>
        <div style={{
          fontFamily: FONT_FAMILY.sans, fontSize: FONT_SIZE.sm, color: COLORS.textMuted,
          textAlign: 'center', lineHeight: 1.5, maxWidth: 280,
        }}>
          Private ZK deposits and withdrawals. Fixed tiers create uniform anonymity sets.
        </div>
      </div>

      {/* Coming Soon */}
      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: SPACING[3],
      }}>
        <div style={{
          backgroundColor: COLORS.surface,
          border: `1px solid ${COLORS.border}`,
          borderRadius: RADIUS.lg,
          padding: `${SPACING[2]} ${SPACING[5]}`,
          fontFamily: FONT_FAMILY.sans, fontSize: FONT_SIZE.sm,
          fontWeight: FONT_WEIGHT.bold, color: COLORS.textMuted,
          letterSpacing: '0.08em', textTransform: 'uppercase',
          userSelect: 'none',
          pointerEvents: 'none',
        }}>
          Coming Soon
        </div>
        <div style={{
          fontFamily: FONT_FAMILY.sans, fontSize: '12px', color: COLORS.textMuted,
          textAlign: 'center', lineHeight: 1.6, maxWidth: 260,
        }}>
          DarkPool will be available in a future update.
        </div>
      </div>
    </div>
  );
}
