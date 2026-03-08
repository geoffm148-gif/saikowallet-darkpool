/**
 * DarkPool Withdraw Screen — Extension popup (360x600).
 *
 * ZK proof generation requires WASM (snarkjs) which isn't available in
 * the extension popup. Shows a message directing users to the desktop app.
 */
import React, { type CSSProperties } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { IconArrowLeft, IconShield, IconAlertTriangle } from '../icons';
import {
  Button, Card, COLORS, FONT_FAMILY, FONT_SIZE, FONT_WEIGHT, SPACING, RADIUS,
} from '@saiko-wallet/ui-kit';
import { DARKPOOL_TIERS, TIER_LABELS } from '@saiko-wallet/wallet-core';

const SCREEN: CSSProperties = {
  minHeight: '600px', display: 'flex', flexDirection: 'column',
  backgroundColor: COLORS.background, padding: SPACING[4],
};

export function DarkPoolWithdrawScreen(): React.ReactElement {
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as { note?: Record<string, unknown> } | null;

  const noteInfo = state?.note;
  const tierLabel = noteInfo
    ? TIER_LABELS[(DARKPOOL_TIERS[noteInfo.tier as number])?.toString() ?? ''] ?? `Tier ${(noteInfo.tier as number) + 1}`
    : null;

  return (
    <div style={SCREEN}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: SPACING[3], marginBottom: SPACING[4] }}>
        <button onClick={() => void navigate('/darkpool')} style={{
          background: 'none', border: `1px solid ${COLORS.border}`, borderRadius: RADIUS.md,
          color: COLORS.textSecondary, cursor: 'pointer', padding: `${SPACING[2]} ${SPACING[3]}`,
          display: 'flex', alignItems: 'center',
        }}>
          <IconArrowLeft size={16} />
        </button>
        <div style={{ flex: 1 }}>
          <div style={{
            fontFamily: FONT_FAMILY.sans, fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.bold,
            color: COLORS.textPrimary, display: 'flex', alignItems: 'center', gap: SPACING[2],
          }}>
            <IconShield size={18} /> Withdraw
          </div>
        </div>
      </div>

      {/* Note info */}
      {noteInfo && (
        <Card bordered style={{ marginBottom: SPACING[4] }}>
          <div style={{
            padding: SPACING[3], display: 'flex', justifyContent: 'space-between',
            alignItems: 'center',
          }}>
            <span style={{
              fontFamily: FONT_FAMILY.sans, fontSize: FONT_SIZE.xs, color: COLORS.textMuted,
            }}>Selected Note</span>
            <span style={{
              fontFamily: FONT_FAMILY.mono, fontSize: FONT_SIZE.sm,
              fontWeight: FONT_WEIGHT.medium, color: COLORS.textPrimary,
            }}>{tierLabel}</span>
          </div>
          <div style={{
            padding: `0 ${SPACING[3]} ${SPACING[3]}`, display: 'flex', justifyContent: 'space-between',
          }}>
            <span style={{
              fontFamily: FONT_FAMILY.sans, fontSize: FONT_SIZE.xs, color: COLORS.textMuted,
            }}>Date</span>
            <span style={{
              fontFamily: FONT_FAMILY.sans, fontSize: FONT_SIZE.xs, color: COLORS.textSecondary,
            }}>{new Date(noteInfo.timestamp as number).toLocaleDateString()}</span>
          </div>
        </Card>
      )}

      {/* Desktop required message */}
      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: SPACING[4],
        padding: SPACING[4],
      }}>
        <div style={{
          width: 64, height: 64, borderRadius: '50%',
          backgroundColor: 'rgba(255,193,7,0.15)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <IconAlertTriangle size={32} color="#FFC107" />
        </div>

        <div style={{ textAlign: 'center' }}>
          <div style={{
            fontFamily: FONT_FAMILY.sans, fontSize: FONT_SIZE.md,
            fontWeight: FONT_WEIGHT.bold, color: COLORS.textPrimary,
            marginBottom: SPACING[2],
          }}>
            Desktop App Required
          </div>
          <div style={{
            fontFamily: FONT_FAMILY.sans, fontSize: FONT_SIZE.sm, color: COLORS.textMuted,
            lineHeight: '1.5', maxWidth: '280px',
          }}>
            DarkPool withdrawals require zero-knowledge proof generation (snarkjs + WASM),
            which is only available in the Saiko Wallet desktop app.
          </div>
        </div>

        <Button
          variant="primary"
          onClick={() => window.open('https://github.com/nicholasclaw/saiko-wallet/releases', '_blank', 'noopener,noreferrer')}
        >
          Download Desktop App
        </Button>

        <button
          onClick={() => void navigate('/darkpool')}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            fontFamily: FONT_FAMILY.sans, fontSize: FONT_SIZE.sm,
            color: COLORS.textMuted, textDecoration: 'underline',
          }}
        >
          Back to DarkPool
        </button>
      </div>
    </div>
  );
}
