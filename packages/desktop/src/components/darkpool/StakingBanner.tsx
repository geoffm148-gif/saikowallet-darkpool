/**
 * StakingBanner — Full-width card showing DarkPool staking rewards overview.
 * Wired to live on-chain data via props from DarkPoolScreen.
 */
import React, { type CSSProperties } from 'react';
import { motion } from 'framer-motion';
import { IconShield, IconTrendingUp } from '../../icons.js';
import {
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
  if (whole >= 1_000_000_000n) return `${(Number(whole) / 1e9).toFixed(2)}B`;
  if (whole >= 1_000_000n) return `${(Number(whole) / 1e6).toFixed(2)}M`;
  if (whole >= 1_000n) return `${Number(whole).toLocaleString()}`;
  return whole.toString();
}

export interface StakingBannerProps {
  totalStaked: bigint;
  userNoteCount: number;
  userStakedAmount: bigint;
  earnedSaiko: bigint;
  earnedEth: bigint;
  hasStake: boolean;
  isLoading: boolean;
  onClaimAll?: () => void;
  onDeposit?: () => void;
}

export function StakingBanner({
  totalStaked,
  userNoteCount,
  userStakedAmount,
  earnedSaiko,
  earnedEth,
  hasStake,
  isLoading,
  onClaimAll,
  onDeposit,
}: StakingBannerProps): React.ReactElement {
  const containerStyle: CSSProperties = {
    background: `linear-gradient(135deg, ${COLORS.surface} 0%, rgba(227,27,35,0.06) 100%)`,
    border: `1px solid rgba(227,27,35,0.2)`,
    borderRadius: RADIUS.lg,
    padding: SPACING[5],
    display: 'flex',
    flexDirection: 'column',
    gap: SPACING[4],
  };

  const titleStyle: CSSProperties = {
    fontFamily: FONT_FAMILY.sans,
    fontSize: FONT_SIZE.lg,
    fontWeight: FONT_WEIGHT.bold,
    color: COLORS.textPrimary,
    display: 'flex',
    alignItems: 'center',
    gap: SPACING[2],
  };

  const subtitleStyle: CSSProperties = {
    fontFamily: FONT_FAMILY.sans,
    fontSize: FONT_SIZE.sm,
    color: COLORS.textMuted,
    lineHeight: '1.5',
  };

  const statsRowStyle: CSSProperties = {
    display: 'flex',
    gap: SPACING[5],
    flexWrap: 'wrap',
  };

  const statStyle: CSSProperties = {
    fontFamily: FONT_FAMILY.sans,
    fontSize: FONT_SIZE.sm,
    color: COLORS.textSecondary,
  };

  const statValueStyle: CSSProperties = {
    fontFamily: FONT_FAMILY.mono,
    fontWeight: FONT_WEIGHT.semibold,
  };

  const earnedStyle: CSSProperties = {
    fontFamily: FONT_FAMILY.mono,
    fontSize: FONT_SIZE.lg,
    fontWeight: FONT_WEIGHT.bold,
    color: COLORS.primary,
  };

  if (isLoading) {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={containerStyle}>
        <div style={titleStyle}><IconShield size={20} /> DarkPool Yield</div>
        <div style={{ color: COLORS.textMuted, fontFamily: FONT_FAMILY.sans, fontSize: FONT_SIZE.sm }}>
          Loading staking data…
        </div>
      </motion.div>
    );
  }

  if (!hasStake) {
    return (
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }} style={containerStyle}>
        <div style={titleStyle}><IconShield size={20} /> DarkPool Yield</div>
        <p style={subtitleStyle}>Deposit to start earning yield from swap and DarkPool deposit fees.</p>
        {onDeposit && <Button variant="primary" onClick={onDeposit}>Deposit to Start Earning</Button>}
      </motion.div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }} style={containerStyle}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={titleStyle}><IconShield size={20} /> DarkPool Yield</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: SPACING[2], color: COLORS.success, fontFamily: FONT_FAMILY.mono, fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.bold }}>
          <IconTrendingUp size={16} /> Live
        </div>
      </div>

      <div style={statsRowStyle}>
        <span style={statStyle}>
          Total Staked: <span style={statValueStyle}>{formatSaiko(totalStaked)} SAIKO</span>
        </span>
        <span style={statStyle}>
          Your Staked: <span style={statValueStyle}>{formatSaiko(userStakedAmount)} SAIKO ({userNoteCount} notes)</span>
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontFamily: FONT_FAMILY.sans, fontSize: FONT_SIZE.xs, color: COLORS.textMuted, marginBottom: SPACING[1] }}>
            Your Claimable Rewards
          </div>
          <div style={earnedStyle}>{formatSaiko(earnedSaiko)} SAIKO</div>
          {earnedEth > 0n && (
            <div style={{ fontFamily: FONT_FAMILY.mono, fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.semibold, color: '#627EEA' }}>
              {(Number(earnedEth) / 1e18).toFixed(6)} ETH
            </div>
          )}
        </div>
        <Button
          variant="primary"
          disabled={earnedSaiko === 0n && earnedEth === 0n}
          onClick={onClaimAll}
        >
          Claim All Rewards
        </Button>
      </div>

      <p style={{ fontFamily: FONT_FAMILY.sans, fontSize: FONT_SIZE.xs, color: COLORS.textMuted, fontStyle: 'italic' }}>
        Rewards accumulate pro-rata from swap and DarkPool deposit fees.
      </p>
    </motion.div>
  );
}
