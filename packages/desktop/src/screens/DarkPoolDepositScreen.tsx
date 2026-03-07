/**
 * DarkPool Deposit Screen — Multi-step deposit flow.
 *
 * Step 1: Tier selection
 * Step 2: Confirm fee breakdown
 * Step 3: Generating note + submitting tx (mock)
 * Step 4: Success → navigate to backup
 */
import React, { useContext, useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ethers, HDNodeWallet, Mnemonic } from 'ethers';
import { IconArrowLeft, IconShield, IconAlertTriangle } from '../icons.js';
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
import {
  DARKPOOL_TIERS,
  TIER_LABELS,
  DARK_POOL_ADDRESS,
  SAIKO_TOKEN_ADDRESS,
  formatDarkPoolFeeBreakdown,
  generateSecret,
  generateNullifier,
  computeCommitment,
  deriveViewingKey,
  calculateAmountAfterFee,
  saveNote,
} from '@saiko-wallet/wallet-core';
import type { DarkPoolNote } from '@saiko-wallet/wallet-core';
import { AppCtx } from '../context.js';
import { rpcCall, getGasParams, sendSignedTx, waitForReceipt, getNonce, ethCall } from '../utils/tx-utils.js';

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

// ── Helper ───────────────────────────────────────────────────────────────────

function formatBigInt(val: bigint): string {
  return val.toLocaleString('en-US');
}

// ── Main Component ───────────────────────────────────────────────────────────

export function DarkPoolDepositScreen(): React.ReactElement {
  const navigate = useNavigate();
  const { sessionMnemonic, addToast, walletAddress } = useContext(AppCtx);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [selectedTier, setSelectedTier] = useState<number | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [depositStatus, setDepositStatus] = useState('');

  const tierAmount = selectedTier !== null ? (DARKPOOL_TIERS[selectedTier] ?? 0n) : 0n;
  const breakdown = selectedTier !== null ? formatDarkPoolFeeBreakdown(tierAmount) : null;

  async function handleConfirm(): Promise<void> {
    if (selectedTier === null) return;
    if (!sessionMnemonic) {
      addToast({ type: 'error', message: 'Wallet is locked. Please lock and unlock to re-authenticate.' });
      return;
    }
    setStep(3);
    setIsGenerating(true);

    try {
      setDepositStatus('Generating commitment...');
      const secret = generateSecret();
      const nullifier = generateNullifier();
      const commitment = computeCommitment(secret, nullifier);
      setDepositStatus('Deriving viewing key...');
      const viewingKey = await deriveViewingKey(secret);
      const amountAfterFee = calculateAmountAfterFee(tierAmount);

      const hdWallet = HDNodeWallet.fromMnemonic(
        Mnemonic.fromPhrase(sessionMnemonic),
        `m/44'/60'/0'/0/0`,
      );
      const walletAddr = hdWallet.address;
      const tierAmountWei = tierAmount * 10n ** 18n;

      // Check SAIKO balance (rpcCall with 4-endpoint fallback)
      setDepositStatus('Checking SAIKO balance...');
      const balanceOfData = '0x70a08231' +
        ethers.AbiCoder.defaultAbiCoder().encode(['address'], [walletAddr]).slice(2);
      const balResult = await ethCall(SAIKO_TOKEN_ADDRESS, balanceOfData);
      const safeBalance = balResult && balResult !== '0x' ? BigInt(balResult) : 0n;
      if (safeBalance < tierAmountWei) {
        const humanBalance = Number(safeBalance / 10n ** 15n) / 1000;
        const humanNeeded = Number(tierAmountWei / 10n ** 18n).toLocaleString();
        throw new Error(`Insufficient SAIKO balance. You have ${humanBalance.toLocaleString()} SAIKO but need ${humanNeeded} SAIKO for this tier.`);
      }

      // Fetch nonce, gas params, and ETH balance in parallel
      setDepositStatus('Checking ETH balance...');
      const [nonce, gasParams, ethBalHex] = await Promise.all([
        getNonce(walletAddr),
        getGasParams(),
        rpcCall<string>('eth_getBalance', [walletAddr, 'latest']),
      ]);

      // Pre-flight: ensure wallet has enough ETH to cover approve + deposit gas
      const ethBalance = BigInt(ethBalHex ?? '0x0');
      const APPROVE_GAS = 65_000n;
      const DEPOSIT_GAS = 1_300_000n; // ~1.07M actual + 20% buffer
      const requiredEth = (APPROVE_GAS + DEPOSIT_GAS) * gasParams.maxFeePerGas;
      if (ethBalance < requiredEth) {
        const haveEth = (Number(ethBalance) / 1e18).toFixed(6);
        const needEth = (Number(requiredEth) / 1e18).toFixed(6);
        const shortfall = (Number(requiredEth - ethBalance) / 1e18 + 0.0005).toFixed(4);
        throw new Error(
          `Not enough ETH for gas fees.\n` +
          `Have: ${haveEth} ETH  |  Need: ~${needEth} ETH\n` +
          `Send at least ${shortfall} ETH to: ${walletAddr}`,
        );
      }

      let currentNonce = nonce;

      // 1. Approve SAIKO for DarkPool V2
      setDepositStatus('Approving SAIKO spend...');
      const erc20Iface = new ethers.Interface([
        'function approve(address spender, uint256 amount) returns (bool)',
      ]);
      const approveHash = await sendSignedTx(hdWallet, {
        to: SAIKO_TOKEN_ADDRESS,
        data: erc20Iface.encodeFunctionData('approve', [DARK_POOL_ADDRESS, tierAmountWei]),
        value: 0n,
        nonce: currentNonce,
        gasLimit: 65_000n,
        ...gasParams,
      });
      setDepositStatus('Waiting for approval tx...');
      await waitForReceipt(approveHash);
      currentNonce++;

      // 2. Deposit into DarkPool V2
      setDepositStatus('Sending deposit tx...');
      // Note: status updates to 'Waiting for deposit...' after hash is received
      const darkPoolIface = new ethers.Interface([
        'function deposit(bytes32 commitment, uint256 amount) external',
      ]);
      const depositHash = await sendSignedTx(hdWallet, {
        to: DARK_POOL_ADDRESS,
        data: darkPoolIface.encodeFunctionData('deposit', [commitment, tierAmountWei]),
        value: 0n,
        nonce: currentNonce,
        gasLimit: 1_200_000n,
        ...gasParams,
      });
      setDepositStatus(`Waiting for deposit to confirm... (${depositHash.slice(0, 10)})`);
      await waitForReceipt(depositHash);

      const note: DarkPoolNote = {
        secret,
        nullifier,
        commitment,
        amount: tierAmountWei,
        tier: selectedTier,
        timestamp: Date.now(),
        txHash: depositHash,
        viewingKey,
        isSpent: false,
      };

      // Save to local store
      try {
        const notesKey = walletAddress.toLowerCase() + ':saiko-darkpool-notes-v1';
        await saveNote(note, notesKey);
      } catch { /* non-critical */ }

      // Navigate to backup screen with note in router state
      void navigate('/darkpool/backup', { state: { note: serializeNoteForState(note) } });
    } catch (err) {
      addToast({ type: 'error', message: `Deposit failed: ${err instanceof Error ? err.message : 'unknown error'}` });
      setIsGenerating(false);
      setStep(2);
    }
  }

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
          onClick={() => step === 1 ? void navigate('/darkpool') : setStep((step - 1) as 1 | 2)}
          whileHover={{ borderColor: COLORS.primary, color: COLORS.textPrimary }}
          whileTap={{ scale: 0.95 }}
          aria-label="Back"
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
            DarkPool Deposit
          </div>
          <div style={{
            fontFamily: FONT_FAMILY.sans,
            fontSize: FONT_SIZE.sm,
            color: COLORS.textMuted,
          }}>
            Step {step} of 3
          </div>
        </div>
      </header>

      <div style={CONTENT_STYLE}>
        {/* Step 1: Tier Selection */}
        {step === 1 && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            style={{ display: 'flex', flexDirection: 'column', gap: SPACING[5] }}
          >
            <div style={{
              fontFamily: FONT_FAMILY.sans,
              fontSize: FONT_SIZE.sm,
              color: COLORS.textMuted,
              textAlign: 'center',
              padding: `${SPACING[2]} ${SPACING[4]}`,
              backgroundColor: COLORS.surface,
              borderRadius: RADIUS.md,
              border: `1px solid ${COLORS.border}`,
            }}>
              FIXED AMOUNTS ONLY — uniformity creates your anonymity set.
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: SPACING[4] }}>
              {DARKPOOL_TIERS.map((tier, i) => {
                const bd = formatDarkPoolFeeBreakdown(tier);
                const isSelected = selectedTier === i;
                return (
                  <motion.button
                    key={tier.toString()}
                    style={{
                      padding: SPACING[5],
                      backgroundColor: isSelected ? 'rgba(227,27,35,0.1)' : COLORS.surface,
                      border: `2px solid ${isSelected ? COLORS.primary : COLORS.border}`,
                      borderRadius: RADIUS.lg,
                      cursor: 'pointer',
                      outline: 'none',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: SPACING[2],
                      textAlign: 'left',
                    }}
                    onClick={() => setSelectedTier(i)}
                    whileHover={{ borderColor: COLORS.primary }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <span style={{
                      fontFamily: FONT_FAMILY.mono,
                      fontSize: FONT_SIZE.lg,
                      fontWeight: FONT_WEIGHT.bold,
                      color: COLORS.textPrimary,
                    }}>
                      {TIER_LABELS[tier.toString()]}
                    </span>
                    <span style={{
                      fontFamily: FONT_FAMILY.sans,
                      fontSize: FONT_SIZE.xs,
                      color: COLORS.textMuted,
                    }}>
                      Fee: {formatBigInt(bd.fee)} SAIKO
                    </span>
                    <span style={{
                      fontFamily: FONT_FAMILY.sans,
                      fontSize: FONT_SIZE.xs,
                      color: COLORS.textSecondary,
                    }}>
                      Enters pool: {formatBigInt(bd.amountAfterFee)} SAIKO
                    </span>
                  </motion.button>
                );
              })}
            </div>

            <Button
              variant="primary"
              fullWidth
              disabled={selectedTier === null}
              onClick={() => setStep(2)}
            >
              Continue
            </Button>
          </motion.div>
        )}

        {/* Step 2: Confirm */}
        {step === 2 && breakdown && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            style={{ display: 'flex', flexDirection: 'column', gap: SPACING[5] }}
          >
            <Card title="Fee Breakdown">
              <div style={{ display: 'flex', flexDirection: 'column', gap: SPACING[3], padding: SPACING[2] }}>
                {[
                  { label: 'Deposit Amount', value: `${formatBigInt(breakdown.tier)} SAIKO` },
                  { label: 'Service Fee (0.5%)', value: `${formatBigInt(breakdown.fee)} SAIKO` },
                  { label: 'Amount Entering Pool', value: `${formatBigInt(breakdown.amountAfterFee)} SAIKO` },
                ].map(({ label, value }) => (
                  <div key={label} style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    padding: `${SPACING[2]} 0`,
                    borderBottom: `1px solid ${COLORS.divider}`,
                  }}>
                    <span style={{
                      fontFamily: FONT_FAMILY.sans,
                      fontSize: FONT_SIZE.sm,
                      color: COLORS.textSecondary,
                    }}>{label}</span>
                    <span style={{
                      fontFamily: FONT_FAMILY.mono,
                      fontSize: FONT_SIZE.sm,
                      fontWeight: FONT_WEIGHT.medium,
                      color: COLORS.textPrimary,
                    }}>{value}</span>
                  </div>
                ))}
              </div>
            </Card>

            {/* Warning */}
            <div style={{
              backgroundColor: 'rgba(227,27,35,0.08)',
              border: `1px solid rgba(227,27,35,0.3)`,
              borderRadius: RADIUS.md,
              padding: SPACING[4],
              display: 'flex',
              alignItems: 'flex-start',
              gap: SPACING[3],
            }}>
              <IconAlertTriangle size={20} color={COLORS.error} style={{ flexShrink: 0, marginTop: '2px' }} />
              <span style={{
                fontFamily: FONT_FAMILY.sans,
                fontSize: FONT_SIZE.sm,
                color: COLORS.error,
                lineHeight: '1.5',
              }}>
                You are about to generate a private note. Back it up immediately
                or your funds are permanently lost.
              </span>
            </div>

            <Button
              variant="primary"
              fullWidth
              onClick={() => void handleConfirm()}
            >
              Confirm Deposit
            </Button>
          </motion.div>
        )}

        {/* Step 3: Generating */}
        {step === 3 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: SPACING[5],
              padding: SPACING[8],
            }}
          >
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
            >
              <IconShield size={48} color={COLORS.primary} />
            </motion.div>
            <div style={{ textAlign: 'center' }}>
              <div style={{
                fontFamily: FONT_FAMILY.sans,
                fontSize: FONT_SIZE.lg,
                fontWeight: FONT_WEIGHT.bold,
                color: COLORS.textPrimary,
                marginBottom: SPACING[2],
              }}>
                Generating Your Private Note
              </div>
              <div style={{
                fontFamily: FONT_FAMILY.sans,
                fontSize: FONT_SIZE.sm,
                color: COLORS.textMuted,
              }}>
                {depositStatus || 'Generating commitment...'}
              </div>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}

// ── Serialization for router state ───────────────────────────────────────────

function serializeNoteForState(note: DarkPoolNote): Record<string, unknown> {
  return {
    secret: Array.from(note.secret),
    nullifier: Array.from(note.nullifier),
    commitment: note.commitment,
    amount: note.amount.toString(),
    tier: note.tier,
    timestamp: note.timestamp,
    txHash: note.txHash,
    viewingKey: Array.from(note.viewingKey),
    isSpent: note.isSpent,
  };
}
