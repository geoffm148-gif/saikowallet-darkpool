/**
 * StakingCallout — Post-deposit info card shown after note backup.
 * Non-blocking, dismissible.
 */
import React, { type CSSProperties } from 'react';
import { motion } from 'framer-motion';
import { IconCheck, IconX } from '../../icons.js';
import {
  COLORS,
  FONT_FAMILY,
  FONT_SIZE,
  FONT_WEIGHT,
  SPACING,
  RADIUS,
} from '@saiko-wallet/ui-kit';

interface StakingCalloutProps {
  onDismiss: () => void;
}

export function StakingCallout({ onDismiss }: StakingCalloutProps): React.ReactElement {
  const containerStyle: CSSProperties = {
    backgroundColor: 'rgba(67,160,71,0.08)',
    border: `1px solid rgba(67,160,71,0.3)`,
    borderRadius: RADIUS.lg,
    padding: SPACING[5],
    display: 'flex',
    gap: SPACING[3],
    position: 'relative',
  };

  const iconStyle: CSSProperties = {
    width: 32,
    height: 32,
    borderRadius: '50%',
    backgroundColor: 'rgba(67,160,71,0.15)',
    color: '#43A047',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  };

  const closeStyle: CSSProperties = {
    position: 'absolute',
    top: SPACING[2],
    right: SPACING[2],
    background: 'none',
    border: 'none',
    color: COLORS.textMuted,
    cursor: 'pointer',
    padding: SPACING[1],
    display: 'flex',
    alignItems: 'center',
  };

  const titleStyle: CSSProperties = {
    fontFamily: FONT_FAMILY.sans,
    fontSize: FONT_SIZE.md,
    fontWeight: FONT_WEIGHT.bold,
    color: COLORS.textPrimary,
    marginBottom: SPACING[2],
  };

  const textStyle: CSSProperties = {
    fontFamily: FONT_FAMILY.sans,
    fontSize: FONT_SIZE.sm,
    color: COLORS.textSecondary,
    lineHeight: '1.6',
    margin: 0,
  };

  const apyStyle: CSSProperties = {
    fontFamily: FONT_FAMILY.mono,
    fontWeight: FONT_WEIGHT.semibold,
    color: COLORS.primary,
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: -12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      transition={{ duration: 0.2 }}
      style={containerStyle}
    >
      <div style={iconStyle}>
        <IconCheck size={18} />
      </div>
      <div style={{ flex: 1 }}>
        <div style={titleStyle}>Your funds are now earning staking rewards!</div>
        <p style={textStyle}>
          Current estimated APY: <span style={apyStyle}>12.4%</span>
        </p>
        <p style={textStyle}>
          Rewards accumulate automatically. Claim anytime from the DarkPool dashboard.
        </p>
        <p style={textStyle}>
          The longer you keep funds in the DarkPool, the more you earn.
        </p>
      </div>
      <button style={closeStyle} onClick={onDismiss} aria-label="Dismiss">
        <IconX size={16} />
      </button>
    </motion.div>
  );
}
