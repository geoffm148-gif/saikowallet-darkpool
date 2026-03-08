import React, { type CSSProperties } from 'react';
import { COLORS } from '../themes/colors.js';
import { FONT_FAMILY, FONT_SIZE, FONT_WEIGHT } from '../themes/typography.js';
import { SPACING, RADIUS } from '../themes/spacing.js';

export type SecurityStatus = 'locked' | 'unlocked' | 'backup-missing' | 'backup-complete' | 'testnet';

export interface SecurityBadgeProps {
  status: SecurityStatus;
  /** Show detailed description text */
  showDetail?: boolean;
  onClick?: () => void;
  style?: CSSProperties;
}

interface StatusConfig {
  icon: string;
  label: string;
  detail: string;
  color: string;
  bgColor: string;
}

const STATUS_CONFIG: Record<SecurityStatus, StatusConfig> = {
  locked: {
    icon: '🔒',
    label: 'Locked',
    detail: 'Wallet is locked. Tap to unlock.',
    color: COLORS.error,
    bgColor: 'rgba(229,57,53,0.12)',
  },
  unlocked: {
    icon: '🔓',
    label: 'Unlocked',
    detail: 'Wallet is unlocked and active.',
    color: COLORS.success,
    bgColor: 'rgba(67,160,71,0.12)',
  },
  'backup-missing': {
    icon: '⚠️',
    label: 'Backup Missing',
    detail: 'Your seed phrase has not been backed up. Funds at risk.',
    color: COLORS.warning,
    bgColor: 'rgba(251,140,0,0.12)',
  },
  'backup-complete': {
    icon: '✓',
    label: 'Backed Up',
    detail: 'Seed phrase backup confirmed.',
    color: COLORS.success,
    bgColor: 'rgba(67,160,71,0.12)',
  },
  testnet: {
    icon: '🔬',
    label: 'Testnet',
    detail: 'Connected to test network. No real funds.',
    color: COLORS.testnet,
    bgColor: 'rgba(251,140,0,0.12)',
  },
};

/** Shows wallet security status — locked, backup status, network */
export function SecurityBadge({
  status,
  showDetail = false,
  onClick,
  style,
}: SecurityBadgeProps): React.ReactElement {
  const { icon, label, detail, color, bgColor } = STATUS_CONFIG[status];

  const badgeStyle: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: SPACING[2],
    backgroundColor: bgColor,
    color,
    padding: showDetail
      ? `${SPACING[3]} ${SPACING[4]}`
      : `${SPACING[1]} ${SPACING[3]}`,
    borderRadius: showDetail ? RADIUS.md : RADIUS.full,
    cursor: onClick !== undefined ? 'pointer' : 'default',
    border: `1px solid ${color}30`,
    transition: 'opacity 0.15s ease',
    ...style,
  };

  const iconStyle: CSSProperties = {
    fontSize: showDetail ? FONT_SIZE.lg : FONT_SIZE.sm,
    flexShrink: 0,
    lineHeight: 1,
  };

  const textWrapperStyle: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  };

  const labelStyle: CSSProperties = {
    fontFamily: FONT_FAMILY.sans,
    fontSize: showDetail ? FONT_SIZE.base : FONT_SIZE.sm,
    fontWeight: FONT_WEIGHT.semibold,
    color,
    lineHeight: 1.2,
  };

  const detailStyle: CSSProperties = {
    fontFamily: FONT_FAMILY.sans,
    fontSize: FONT_SIZE.sm,
    color: COLORS.textSecondary,
    lineHeight: 1.4,
  };

  return (
    <div style={badgeStyle} onClick={onClick} role={onClick !== undefined ? 'button' : undefined}>
      <span style={iconStyle} aria-hidden="true">{icon}</span>
      <div style={textWrapperStyle}>
        <span style={labelStyle}>{label}</span>
        {showDetail && <span style={detailStyle}>{detail}</span>}
      </div>
    </div>
  );
}
