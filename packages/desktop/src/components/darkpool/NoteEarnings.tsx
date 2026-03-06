/**
 * NoteEarnings — Per-note staking rewards display.
 * Wired to live on-chain data via props from DarkPoolScreen.
 */
import React, { type CSSProperties } from 'react';
import { motion } from 'framer-motion';
import {
  Card,
  Button,
  COLORS,
  FONT_FAMILY,
  FONT_SIZE,
  FONT_WEIGHT,
  SPACING,
  RADIUS,
} from '@saiko-wallet/ui-kit';

const SAIKO_DECIMALS = 18;

function formatSaiko(raw: bigint): string {
  const whole = raw / BigInt(10 ** SAIKO_DECIMALS);
  if (whole >= 1_000_000_000n) return `${(Number(whole) / 1e9).toFixed(3)}B`;
  if (whole >= 1_000_000n) return `${(Number(whole) / 1e6).toFixed(3)}M`;
  if (whole >= 1_000n) return `${Number(whole).toLocaleString()}`;
  return whole.toString();
}

function formatDuration(ms: number): string {
  const secs = Math.floor(ms / 1000);
  const days = Math.floor(secs / 86400);
  const hours = Math.floor((secs % 86400) / 3600);
  if (days > 0) return `${days}d ${hours}h`;
  const mins = Math.floor((secs % 3600) / 60);
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

function PrivacyBadge({ level }: { level: 'low' | 'moderate' | 'strong' }): React.ReactElement {
  const colorMap = {
    low: { bg: 'rgba(227,27,35,0.15)', text: '#E31B23' },
    moderate: { bg: 'rgba(255,193,7,0.15)', text: '#FFC107' },
    strong: { bg: 'rgba(67,160,71,0.15)', text: '#43A047' },
  };
  const { bg, text } = colorMap[level];
  return (
    <span style={{
      display: 'inline-block',
      padding: `${SPACING[1]} ${SPACING[3]}`,
      borderRadius: RADIUS.sm,
      backgroundColor: bg,
      color: text,
      fontFamily: FONT_FAMILY.sans,
      fontSize: FONT_SIZE.xs,
      fontWeight: FONT_WEIGHT.semibold,
      textTransform: 'capitalize',
    }}>
      {level}
    </span>
  );
}

export interface LiveNote {
  commitment: string;
  tierLabel: string;
  tier: number;
  timestamp: number;
  earnedSaiko: bigint;
  earnedEth: bigint;
  privacyLevel: 'low' | 'moderate' | 'strong';
  isSpent: boolean;
}

export interface NoteEarningsProps {
  notes: LiveNote[];
  totalEarnedSaiko: bigint;
  totalEarnedEth: bigint;
  isLoading: boolean;
  onClaim?: (commitment: string) => void;
  onClaimAll?: () => void;
}

export function NoteEarnings({ notes, totalEarnedSaiko, totalEarnedEth, isLoading, onClaim, onClaimAll }: NoteEarningsProps): React.ReactElement {
  const now = Date.now();

  const headerRowStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING[2],
  };

  if (isLoading) {
    return (
      <Card title="My DarkPool Notes">
        <div style={{ color: COLORS.textMuted, fontFamily: FONT_FAMILY.sans, fontSize: FONT_SIZE.sm, padding: SPACING[4] }}>
          Loading notes…
        </div>
      </Card>
    );
  }

  if (notes.length === 0) {
    return (
      <Card title="My DarkPool Notes (0)">
        <div style={{ color: COLORS.textMuted, fontFamily: FONT_FAMILY.sans, fontSize: FONT_SIZE.sm, padding: SPACING[4] }}>
          No notes found. Deposit to create your first note.
        </div>
      </Card>
    );
  }

  const activeNotes = notes.filter(n => !n.isSpent);

  return (
    <Card title={`My DarkPool Notes (${notes.length})`}>
      <div style={headerRowStyle}>
        <div>
          <div style={{ fontFamily: FONT_FAMILY.mono, fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.semibold, color: COLORS.primary }}>
            {formatSaiko(totalEarnedSaiko)} SAIKO claimable
          </div>
          {totalEarnedEth > 0n && (
            <div style={{ fontFamily: FONT_FAMILY.mono, fontSize: FONT_SIZE.xs, color: '#627EEA' }}>
              + {(Number(totalEarnedEth) / 1e18).toFixed(6)} ETH claimable
            </div>
          )}
        </div>
        <Button variant="secondary" size="sm" onClick={onClaimAll} disabled={(totalEarnedSaiko === 0n && totalEarnedEth === 0n) || activeNotes.length === 0}>
          Claim All
        </Button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {notes.map((note, i) => (
          <motion.div
            key={note.commitment}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.15, delay: i * 0.05 }}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: `${SPACING[4]} ${SPACING[3]}`,
              borderBottom: i < notes.length - 1 ? `1px solid ${COLORS.divider}` : 'none',
              opacity: note.isSpent ? 0.5 : 1,
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: SPACING[2], marginBottom: SPACING[1] }}>
                <span style={{ fontFamily: FONT_FAMILY.mono, fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.medium, color: COLORS.textPrimary }}>
                  {note.tierLabel}
                </span>
                <span style={{ fontFamily: FONT_FAMILY.sans, fontSize: FONT_SIZE.xs, color: COLORS.textMuted }}>
                  — Tier {note.tier + 1}
                </span>
                {note.isSpent && (
                  <span style={{ fontFamily: FONT_FAMILY.sans, fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.semibold, color: COLORS.textMuted, backgroundColor: COLORS.border, padding: `1px ${SPACING[2]}`, borderRadius: RADIUS.sm }}>
                    Withdrawn
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: SPACING[3] }}>
                <span style={{ fontFamily: FONT_FAMILY.sans, fontSize: FONT_SIZE.xs, color: COLORS.textMuted }}>
                  Staked: {formatDuration(now - note.timestamp)}
                </span>
                <PrivacyBadge level={note.privacyLevel} />
              </div>
              <div style={{ fontFamily: FONT_FAMILY.mono, fontSize: FONT_SIZE.xs, color: COLORS.textMuted, marginTop: SPACING[1] }}>
                {note.commitment.slice(0, 10)}…{note.commitment.slice(-6)}
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: SPACING[3], flexShrink: 0 }}>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontFamily: FONT_FAMILY.mono, fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.semibold, color: COLORS.primary }}>
                  +{formatSaiko(note.earnedSaiko)} SAIKO
                </div>
                {note.earnedEth > 0n && (
                  <div style={{ fontFamily: FONT_FAMILY.mono, fontSize: FONT_SIZE.xs, color: '#627EEA' }}>
                    +{(Number(note.earnedEth) / 1e18).toFixed(6)} ETH
                  </div>
                )}
              </div>
              {!note.isSpent && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => onClaim?.(note.commitment)}
                  disabled={note.earnedSaiko === 0n && note.earnedEth === 0n}
                >
                  Claim
                </Button>
              )}
            </div>
          </motion.div>
        ))}
      </div>
    </Card>
  );
}
