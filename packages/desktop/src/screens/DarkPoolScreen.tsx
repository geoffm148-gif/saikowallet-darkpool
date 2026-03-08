/**
 * DarkPool Dashboard — Main privacy pool overview.
 *
 * Shows pool stats, privacy levels, saved notes, and navigation to
 * deposit/withdraw/proof screens.
 */
import React, { useCallback, useContext, useEffect, useState, type CSSProperties } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ethers, HDNodeWallet, Mnemonic } from 'ethers';
import { IconShield, IconArrowLeft, IconLock, IconKey, IconArrowDownLeft, IconArrowUpRight } from '../icons.js';
import {
  Card,
  Button,
  Badge,
  COLORS,
  FONT_FAMILY,
  FONT_SIZE,
  FONT_WEIGHT,
  SPACING,
  RADIUS,
} from '@saiko-wallet/ui-kit';
import {
  getAllPoolInfo,
  TIER_LABELS,
  DARKPOOL_TIERS,
  loadNotes,
  markNoteUnspent,
  getOnChainStakingGlobalInfo,
  getPrivacyLevel,
  DARK_POOL_STAKING_ADDRESS,
} from '@saiko-wallet/wallet-core';
import type { DarkPoolInfo, DarkPoolNote } from '@saiko-wallet/wallet-core';
import type { LiveNote } from '../components/darkpool/NoteEarnings.js';
import { StakingBanner } from '../components/darkpool/StakingBanner.js';
import { NoteEarnings } from '../components/darkpool/NoteEarnings.js';
import { StakingCallout } from '../components/darkpool/StakingCallout.js';
import { getActiveRpc } from '../utils/network.js';
import { rpcCall, getGasParams, sendSignedTx, getNonce, ethCall } from '../utils/tx-utils.js';
import { AppCtx } from '../context.js';

// ── Styles ───────────────────────────────────────────────────────────────────

const PAGE_STYLE: CSSProperties = {
  minHeight: '100vh',
  backgroundColor: COLORS.background,
  display: 'flex',
  flexDirection: 'column',
};

const CONTENT_STYLE: CSSProperties = {
  maxWidth: '720px',
  width: '100%',
  margin: '0 auto',
  padding: `${SPACING[6]} ${SPACING[6]}`,
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  gap: SPACING[6],
};

const HEADER_STYLE: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: SPACING[4],
  padding: `${SPACING[4]} ${SPACING[6]}`,
  backgroundColor: COLORS.surface,
  borderBottom: `1px solid ${COLORS.border}`,
};

// ── Privacy Level Badge ──────────────────────────────────────────────────────

function PrivacyBadge({ level }: { level: 'low' | 'moderate' | 'strong' }): React.ReactElement {
  const colorMap = {
    low: { bg: 'rgba(227,27,35,0.15)', text: COLORS.error },
    moderate: { bg: 'rgba(255,193,7,0.15)', text: '#FFC107' },
    strong: { bg: 'rgba(67,160,71,0.15)', text: COLORS.success },
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

// ── Pool Table ───────────────────────────────────────────────────────────────

function PoolTable({ pools }: { pools: DarkPoolInfo[] }): React.ReactElement {
  const rowStyle: CSSProperties = {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr 1fr',
    alignItems: 'center',
    padding: `${SPACING[4]} ${SPACING[4]}`,
    borderBottom: `1px solid ${COLORS.divider}`,
  };

  const headerStyle: CSSProperties = {
    ...rowStyle,
    borderBottom: `1px solid ${COLORS.border}`,
  };

  const labelStyle: CSSProperties = {
    fontFamily: FONT_FAMILY.sans,
    fontSize: FONT_SIZE.sm,
    fontWeight: FONT_WEIGHT.semibold,
    color: COLORS.textMuted,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
  };

  return (
    <Card title="Privacy Pools">
      <div style={headerStyle}>
        <span style={labelStyle}>Tier</span>
        <span style={{ ...labelStyle, textAlign: 'center' }}>Deposits</span>
        <span style={{ ...labelStyle, textAlign: 'right' }}>Privacy</span>
      </div>
      {pools.map((pool, i) => (
        <motion.div
          key={pool.tier.toString()}
          style={rowStyle}
          initial={{ opacity: 0, x: -8 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.15, delay: i * 0.05 }}
        >
          <span style={{
            fontFamily: FONT_FAMILY.mono,
            fontSize: FONT_SIZE.md,
            fontWeight: FONT_WEIGHT.medium,
            color: COLORS.textPrimary,
          }}>
            {TIER_LABELS[pool.tier.toString()] ?? pool.tier.toString()}
          </span>
          <span style={{
            fontFamily: FONT_FAMILY.mono,
            fontSize: FONT_SIZE.md,
            color: COLORS.textSecondary,
            textAlign: 'center',
          }}>
            {pool.depositCount}
          </span>
          <div style={{ textAlign: 'right' }}>
            <PrivacyBadge level={pool.privacyLevel} />
          </div>
        </motion.div>
      ))}
    </Card>
  );
}

// ── Main Component ───────────────────────────────────────────────────────────

export function DarkPoolScreen(): React.ReactElement {
  const navigate = useNavigate();
  const location = useLocation();
  const { walletAddress, sessionMnemonic, addToast } = useContext(AppCtx);
  const [pools, setPools] = useState<DarkPoolInfo[]>([]);
  const [notes, setNotes] = useState<DarkPoolNote[]>([]);
  const [totalStaked, setTotalStaked] = useState<bigint>(0n);
  const [noteEarnings, setNoteEarnings] = useState<Map<string, bigint>>(new Map());
  const [noteEthEarnings, setNoteEthEarnings] = useState<Map<string, bigint>>(new Map());
  const [isLoading, setIsLoading] = useState(true);
  const [isClaiming, setIsClaiming] = useState(false);
  const [showStakingCallout, setShowStakingCallout] = useState(false);

  // Show staking callout after deposit backup
  useEffect(() => {
    const state = location.state as { showStakingCallout?: boolean } | null;
    if (!state?.showStakingCallout) return;
    setShowStakingCallout(true);
    window.history.replaceState({}, '');
    const timer = setTimeout(() => setShowStakingCallout(false), 8000);
    return () => clearTimeout(timer);
  }, [location.state]);

  const fetchData = useCallback(async (cancelled: { value: boolean }) => {
    const rpc = getActiveRpc();

    // Pool table data
    try {
      const poolInfo = await getAllPoolInfo(rpc);
      if (!cancelled.value) setPools(poolInfo);
    } catch { /* unavailable */ }

    // User notes
    let loadedNotes: DarkPoolNote[] = [];
    try {
      // Derive a wallet-specific key — much safer than the old hardcoded 'default'
      const notesKey = walletAddress.toLowerCase() + ':saiko-darkpool-notes-v1';
      loadedNotes = await loadNotes(notesKey);
      if (!cancelled.value) setNotes(loadedNotes);
    } catch { /* no notes */ }

    // On-chain staking data
    try {
      const globalInfo = await getOnChainStakingGlobalInfo(rpc);
      if (!cancelled.value) setTotalStaked(globalInfo.totalStaked);
    } catch { /* unavailable */ }

    // Per-note earned rewards — use ethCall (IPC bridge, no JsonRpcProvider)
    if (loadedNotes.length > 0) {
      try {
        const coder = ethers.AbiCoder.defaultAbiCoder();
        const earnedSel = ethers.id('earned(bytes32)').slice(0, 10);
        const earnedEthSel = ethers.id('earnedEth(bytes32)').slice(0, 10);
        const earnings = new Map<string, bigint>();
        const ethEarnings = new Map<string, bigint>();
        await Promise.all(
          loadedNotes.filter(n => !n.isSpent).map(async (note) => {
            try {
              const encoded = coder.encode(['bytes32'], [note.commitment]).slice(2);
              const [earnedRaw, earnedEthRaw] = await Promise.all([
                ethCall(DARK_POOL_STAKING_ADDRESS, earnedSel + encoded),
                ethCall(DARK_POOL_STAKING_ADDRESS, earnedEthSel + encoded),
              ]);
              const earned = earnedRaw && earnedRaw !== '0x'
                ? (coder.decode(['uint256'], earnedRaw)[0] as bigint) : 0n;
              const earnedEthVal = earnedEthRaw && earnedEthRaw !== '0x'
                ? (coder.decode(['uint256'], earnedEthRaw)[0] as bigint) : 0n;
              earnings.set(note.commitment, earned);
              ethEarnings.set(note.commitment, earnedEthVal);
            } catch {
              earnings.set(note.commitment, 0n);
              ethEarnings.set(note.commitment, 0n);
            }
          })
        );
        if (!cancelled.value) {
          setNoteEarnings(earnings);
          setNoteEthEarnings(ethEarnings);
        }
      } catch { /* staking contract unavailable */ }
    }

    if (!cancelled.value) setIsLoading(false);
  }, []);

  useEffect(() => {
    const cancelled = { value: false };
    void fetchData(cancelled);
    return () => { cancelled.value = true; };
  }, [fetchData]);

  // Claim rewards for a single note — uses IPC tx-utils (bypasses Chromium net stack)
  const handleClaim = useCallback(async (commitment: string) => {
    if (!sessionMnemonic || !walletAddress) {
      addToast({ type: 'error', message: 'Wallet must be unlocked to claim rewards' });
      return;
    }
    setIsClaiming(true);
    try {
      // Diagnostic: verify IPC bridge is live
      const w = window as any;
      const hasIpc = !!(w.electronAPI?.rpc);
      let diagMsg = `Claim-IPC:${hasIpc ? 'YES' : 'NO'}`;
      if (hasIpc) {
        try {
          const r = await w.electronAPI.rpc.call('https://ethereum.publicnode.com', 'eth_blockNumber', []);
          diagMsg += `|ok:${r?.result}`;
        } catch (e: any) { diagMsg += `|err:${e?.message}`; }
      }
      addToast({ type: 'info', title: 'Claim diag', message: diagMsg });

      const hdWallet = HDNodeWallet.fromMnemonic(
        Mnemonic.fromPhrase(sessionMnemonic), `m/44'/60'/0'/0/0`,
      );
      const claimIface = new ethers.Interface([
        'function claimManual(bytes32 commitment, address recipient) external',
      ]);
      const claimData = claimIface.encodeFunctionData('claimManual', [commitment, walletAddress]);
      const [nonce, gasParams] = await Promise.all([
        getNonce(hdWallet.address),
        getGasParams(),
      ]);
      const txHash = await sendSignedTx(hdWallet, {
        to: DARK_POOL_STAKING_ADDRESS,
        data: claimData,
        value: 0n,
        nonce,
        gasLimit: 200_000n,
        ...gasParams,
      });
      addToast({ type: 'success', message: `Claimed! Tx: ${txHash.slice(0, 14)}…` });
      const cancelled = { value: false };
      void fetchData(cancelled);
    } catch (e) {
      console.error('[Claim] failed:', e);
      addToast({ type: 'error', message: `Claim failed: ${e instanceof Error ? e.message : 'Unknown error'}` });
    } finally {
      setIsClaiming(false);
    }
  }, [sessionMnemonic, walletAddress, addToast, fetchData]);

  // Claim all active notes
  const handleClaimAll = useCallback(async () => {
    if (!sessionMnemonic || !walletAddress) {
      addToast({ type: 'error', message: 'Wallet must be unlocked to claim rewards' });
      return;
    }
    const activeNotes = notes.filter(n => !n.isSpent && (noteEarnings.get(n.commitment) ?? 0n) > 0n);
    for (const note of activeNotes) {
      await handleClaim(note.commitment);
    }
  }, [sessionMnemonic, walletAddress, notes, noteEarnings, handleClaim, addToast]);

  // Recover a note that was locally marked spent but whose on-chain withdrawal failed
  const handleRecover = useCallback(async (commitment: string) => {
    if (!walletAddress) return;
    try {
      const notesKey = walletAddress.toLowerCase() + ':saiko-darkpool-notes-v1';
      await markNoteUnspent(commitment, notesKey);
      // Reload notes
      const updated = await loadNotes(notesKey);
      setNotes(updated);
      addToast({ type: 'success', title: 'Note recovered', message: 'You can now retry the withdrawal.' });
    } catch (err) {
      addToast({ type: 'error', message: 'Failed to recover note' });
    }
  }, [walletAddress, addToast]);

  const activeNotes = notes.filter((n) => !n.isSpent);

  // Total earned SAIKO + ETH across all active notes
  const totalEarnedSaiko = activeNotes.reduce((sum, n) => sum + (noteEarnings.get(n.commitment) ?? 0n), 0n);
  const totalEarnedEth = activeNotes.reduce((sum, n) => sum + (noteEthEarnings.get(n.commitment) ?? 0n), 0n);
  const userStakedAmount = activeNotes.reduce((sum, n) => sum + n.amount, 0n);

  // Map notes to LiveNote format for NoteEarnings component
  const liveNotes: LiveNote[] = notes.map((note) => {
    // note.tier is 0-3 index; DarkPoolInfo.tier is the bigint tier amount
    const tierAmount = DARKPOOL_TIERS[note.tier];
    const tierKey = tierAmount?.toString() ?? '';
    const poolInfo = pools.find(p => p.tier === tierAmount);
    return {
      commitment: note.commitment,
      tierLabel: TIER_LABELS[tierKey] ?? `Tier ${note.tier + 1}`,
      tier: note.tier,
      timestamp: note.timestamp,
      earnedSaiko: noteEarnings.get(note.commitment) ?? 0n,
      earnedEth: noteEthEarnings.get(note.commitment) ?? 0n,
      privacyLevel: getPrivacyLevel(poolInfo?.depositCount ?? 0),
      isSpent: note.isSpent,
    };
  });

  const actionButtonStyle: CSSProperties = {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: SPACING[2],
    padding: SPACING[4],
    backgroundColor: COLORS.surface,
    border: `1px solid ${COLORS.border}`,
    borderRadius: RADIUS.lg,
    cursor: 'pointer',
    outline: 'none',
    color: COLORS.textSecondary,
  };

  const actionLabelStyle: CSSProperties = {
    fontFamily: FONT_FAMILY.sans,
    fontSize: FONT_SIZE.sm,
    fontWeight: FONT_WEIGHT.semibold,
    color: COLORS.textSecondary,
  };

  return (
    <div style={PAGE_STYLE}>
      {/* Header */}
      <header style={HEADER_STYLE}>
        <motion.button
          style={{
            background: 'none',
            border: `1px solid ${COLORS.border}`,
            borderRadius: RADIUS.md,
            color: COLORS.textSecondary,
            cursor: 'pointer',
            padding: `${SPACING[2]} ${SPACING[3]}`,
            display: 'flex',
            alignItems: 'center',
          }}
          onClick={() => void navigate('/dashboard')}
          whileHover={{ borderColor: COLORS.primary, color: COLORS.textPrimary }}
          whileTap={{ scale: 0.95 }}
          aria-label="Back to dashboard"
        >
          <IconArrowLeft size={16} />
        </motion.button>
        <div style={{ flex: 1 }}>
          <div style={{
            fontFamily: FONT_FAMILY.sans,
            fontSize: FONT_SIZE.lg,
            fontWeight: FONT_WEIGHT.bold,
            color: COLORS.textPrimary,
            display: 'flex',
            alignItems: 'center',
            gap: SPACING[2],
          }}>
            <IconShield size={20} />
            Saiko DarkPool
          </div>
          <div style={{
            fontFamily: FONT_FAMILY.sans,
            fontSize: FONT_SIZE.sm,
            color: COLORS.textMuted,
          }}>
            Break the link between your wallets
          </div>
        </div>
      </header>

      <div style={CONTENT_STYLE}>
        {/* Loading State */}
        {isLoading ? (
          <Card>
            <div style={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              padding: SPACING[8],
              gap: SPACING[3],
            }}>
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
              >
                <IconShield size={24} color={COLORS.primary} />
              </motion.div>
              <span style={{
                fontFamily: FONT_FAMILY.sans,
                fontSize: FONT_SIZE.md,
                color: COLORS.textSecondary,
              }}>
                Loading pool data...
              </span>
            </div>
          </Card>
        ) : (
          <>
            {/* Staking Callout (post-deposit) */}
            <AnimatePresence>
              {showStakingCallout && (
                <StakingCallout onDismiss={() => setShowStakingCallout(false)} />
              )}
            </AnimatePresence>

            {/* Staking Banner */}
            <StakingBanner
              totalStaked={totalStaked}
              userNoteCount={activeNotes.length}
              userStakedAmount={userStakedAmount}
              earnedSaiko={totalEarnedSaiko}
              earnedEth={totalEarnedEth}
              hasStake={activeNotes.length > 0}
              isLoading={isLoading}
              onClaimAll={() => void handleClaimAll()}
              onDeposit={() => void navigate('/darkpool/deposit')}
            />

            {/* Privacy Pool Table */}
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
            >
              <PoolTable pools={pools} />
            </motion.div>

            {/* Action Buttons */}
            <div style={{ display: 'flex', gap: SPACING[4] }}>
              <motion.button
                style={actionButtonStyle}
                onClick={() => void navigate('/darkpool/deposit')}
                whileHover={{ scale: 1.02, borderColor: COLORS.primary }}
                whileTap={{ scale: 0.98 }}
              >
                <IconArrowDownLeft size={28} />
                <span style={actionLabelStyle}>Deposit</span>
              </motion.button>
              <motion.button
                style={actionButtonStyle}
                onClick={() => void navigate('/darkpool/withdraw')}
                whileHover={{ scale: 1.02, borderColor: COLORS.primary }}
                whileTap={{ scale: 0.98 }}
              >
                <IconArrowUpRight size={28} />
                <span style={actionLabelStyle}>Withdraw</span>
              </motion.button>
              <motion.button
                style={actionButtonStyle}
                onClick={() => void navigate('/darkpool/proof')}
                whileHover={{ scale: 1.02, borderColor: COLORS.primary }}
                whileTap={{ scale: 0.98 }}
              >
                <IconKey size={28} />
                <span style={actionLabelStyle}>Generate Proof</span>
              </motion.button>
            </div>

            {/* My DarkPool Notes with Earnings */}
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, delay: 0.1 }}
            >
              <NoteEarnings
                notes={liveNotes}
                totalEarnedSaiko={totalEarnedSaiko}
                totalEarnedEth={totalEarnedEth}
                isLoading={isLoading}
                onClaim={(commitment) => void handleClaim(commitment)}
                onClaimAll={() => void handleClaimAll()}
                onRecover={(commitment) => void handleRecover(commitment)}
              />
            </motion.div>

            {/* Warning Banner */}
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, delay: 0.2 }}
              style={{
                backgroundColor: 'rgba(227,27,35,0.08)',
                border: `1px solid rgba(227,27,35,0.3)`,
                borderRadius: RADIUS.md,
                padding: SPACING[4],
                display: 'flex',
                alignItems: 'flex-start',
                gap: SPACING[3],
              }}
            >
              <IconShield size={20} color={COLORS.error} style={{ flexShrink: 0, marginTop: '2px' }} />
              <span style={{
                fontFamily: FONT_FAMILY.sans,
                fontSize: FONT_SIZE.sm,
                color: COLORS.error,
                lineHeight: '1.5',
              }}>
                Saiko DarkPool uses zero-knowledge proofs. Your funds are protected by
                cryptographic guarantees, not trust.
              </span>
            </motion.div>
          </>
        )}
      </div>
    </div>
  );
}
