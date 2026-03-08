/**
 * StakingCallout — Post-deposit info card shown after note backup.
 * Non-blocking, dismissible. Shows live APY from staking contract.
 */
import React, { useEffect, useState, type CSSProperties } from 'react';
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
import { DARK_POOL_STAKING_ADDRESS } from '@saiko-wallet/wallet-core';

const RPC = 'https://ethereum.publicnode.com';

async function rpc(method: string, params: unknown[]): Promise<string> {
  const r = await fetch(RPC, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
  const j = await r.json() as { result: string };
  return j.result;
}

async function fetchLiveApy(): Promise<string> {
  try {
    // rewardPool() and totalStaked() are public state var getters (selector = keccak256 first 4 bytes)
    const rewardPoolSel = '0x69f68573'; // keccak256("rewardPool()")
    const totalStakedSel = '0x817b1cd2'; // keccak256("totalStaked()")
    const [rpHex, tsHex] = await Promise.all([
      rpc('eth_call', [{ to: DARK_POOL_STAKING_ADDRESS, data: rewardPoolSel }, 'latest']),
      rpc('eth_call', [{ to: DARK_POOL_STAKING_ADDRESS, data: totalStakedSel }, 'latest']),
    ]);
    const rewardPool = BigInt(rpHex);
    const totalStaked = BigInt(tsHex);
    if (totalStaked === 0n) return '—';
    // rate = rewardPool / 86400 / 100 per second; annual = rate * 86400 * 365
    // APY = annual / totalStaked * 100
    const annual = (rewardPool * 365n) / 100n;
    const apyBps = (annual * 10000n) / totalStaked;
    return (Number(apyBps) / 100).toFixed(1) + '%';
  } catch {
    return '—';
  }
}

interface StakingCalloutProps {
  onDismiss: () => void;
}

export function StakingCallout({ onDismiss }: StakingCalloutProps): React.ReactElement {
  const [apy, setApy] = useState<string>('...');
  useEffect(() => { void fetchLiveApy().then(setApy); }, []);
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
          Current estimated APY: <span style={apyStyle}>{apy}</span>
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
