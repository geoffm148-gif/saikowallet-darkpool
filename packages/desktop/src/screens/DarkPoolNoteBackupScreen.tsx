/**
 * DarkPool Note Backup Screen — Mandatory post-deposit backup.
 *
 * User must back up their note or lose funds permanently.
 * Provides copy + encrypted download + acknowledgment checkbox.
 */
import React, { useState, useMemo, type CSSProperties } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { IconAlertTriangle, IconCopy, IconCheck, IconArrowLeft, IconShield } from '../icons.js';
import {
  Button,
  COLORS,
  FONT_FAMILY,
  FONT_SIZE,
  FONT_WEIGHT,
  SPACING,
  RADIUS,
} from '@saiko-wallet/ui-kit';
import { encryptNote, exportNoteAsJson } from '@saiko-wallet/wallet-core';
import type { DarkPoolNote } from '@saiko-wallet/wallet-core';

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
  gap: SPACING[5],
};

const HEADER_STYLE: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: SPACING[4],
  padding: `${SPACING[4]} ${SPACING[6]}`,
  backgroundColor: COLORS.surface,
  borderBottom: `1px solid ${COLORS.border}`,
};

// ── Deserialize from router state ────────────────────────────────────────────

function deserializeNote(obj: Record<string, unknown>): DarkPoolNote {
  return {
    secret: new Uint8Array(obj.secret as number[]),
    nullifier: new Uint8Array(obj.nullifier as number[]),
    commitment: obj.commitment as string,
    amount: BigInt(obj.amount as string),
    tier: obj.tier as number,
    timestamp: obj.timestamp as number,
    txHash: obj.txHash as string,
    viewingKey: new Uint8Array(obj.viewingKey as number[]),
    isSpent: obj.isSpent as boolean,
  };
}

// ── Main Component ───────────────────────────────────────────────────────────

export function DarkPoolNoteBackupScreen(): React.ReactElement {
  const navigate = useNavigate();
  const location = useLocation();
  const [copied, setCopied] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);

  const state = location.state as { note?: Record<string, unknown> } | null;
  const note = useMemo(() => {
    if (!state?.note) return null;
    try { return deserializeNote(state.note); } catch { return null; }
  }, [state]);

  if (!note) {
    return (
      <div style={PAGE_STYLE}>
        <div style={{ ...CONTENT_STYLE, alignItems: 'center', justifyContent: 'center' }}>
          <p style={{ fontFamily: FONT_FAMILY.sans, color: COLORS.textMuted }}>
            No note data found. Please make a deposit first.
          </p>
          <Button variant="secondary" onClick={() => void navigate('/darkpool')}>
            Back to DarkPool
          </Button>
        </div>
      </div>
    );
  }

  const noteJson = exportNoteAsJson(note);

  async function handleCopy(): Promise<void> {
    await navigator.clipboard.writeText(noteJson);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleDownload(): Promise<void> {
    setIsDownloading(true);
    try {
      const encrypted = await encryptNote(note!, 'default');
      const blob = new Blob([encrypted], { type: 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `saiko-darkpool-note-${note!.commitment.slice(0, 10)}.saiko-note`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setIsDownloading(false);
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
          onClick={() => void navigate('/darkpool')}
          whileHover={{ borderColor: COLORS.primary, color: COLORS.textPrimary }}
          whileTap={{ scale: 0.95 }}
          aria-label="Back"
        >
          <IconArrowLeft size={16} />
        </motion.button>
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
          Note Backup
        </div>
      </header>

      <div style={CONTENT_STYLE}>
        {/* Warning Header */}
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          style={{
            backgroundColor: 'rgba(227,27,35,0.12)',
            border: `2px solid ${COLORS.error}`,
            borderRadius: RADIUS.lg,
            padding: SPACING[5],
            textAlign: 'center',
          }}
        >
          <div style={{
            fontFamily: FONT_FAMILY.sans,
            fontSize: FONT_SIZE.xl,
            fontWeight: FONT_WEIGHT.bold,
            color: COLORS.error,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: SPACING[2],
            marginBottom: SPACING[3],
          }}>
            <IconAlertTriangle size={24} />
            BACK UP YOUR NOTE
          </div>
          <p style={{
            fontFamily: FONT_FAMILY.sans,
            fontSize: FONT_SIZE.sm,
            color: COLORS.textSecondary,
            lineHeight: '1.6',
            margin: 0,
          }}>
            Losing this note means permanent, irrecoverable loss of your funds.
            No one — not Saiko, not anyone — can recover it for you.
          </p>
        </motion.div>

        {/* Note Display */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <div style={{
            backgroundColor: COLORS.surface,
            border: `1px solid ${COLORS.border}`,
            borderRadius: RADIUS.md,
            padding: SPACING[4],
            maxHeight: '240px',
            overflow: 'auto',
          }}>
            <pre style={{
              fontFamily: FONT_FAMILY.mono,
              fontSize: FONT_SIZE.xs,
              color: COLORS.textSecondary,
              margin: 0,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-all',
            }}>
              {noteJson}
            </pre>
          </div>
        </motion.div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: SPACING[3] }}>
          <Button
            variant="secondary"
            fullWidth
            onClick={() => void handleCopy()}
          >
            <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: SPACING[2] }}>
              {copied ? <IconCheck size={16} /> : <IconCopy size={16} />}
              {copied ? 'Copied!' : 'Copy Note'}
            </span>
          </Button>
          <Button
            variant="secondary"
            fullWidth
            isLoading={isDownloading}
            onClick={() => void handleDownload()}
          >
            Download Encrypted File
          </Button>
        </div>

        {/* Acknowledgment Checkbox */}
        <label style={{
          display: 'flex',
          alignItems: 'center',
          gap: SPACING[3],
          padding: SPACING[4],
          backgroundColor: COLORS.surface,
          border: `1px solid ${COLORS.border}`,
          borderRadius: RADIUS.md,
          cursor: 'pointer',
        }}>
          <input
            type="checkbox"
            checked={acknowledged}
            onChange={(e) => setAcknowledged(e.target.checked)}
            style={{
              width: '20px',
              height: '20px',
              accentColor: COLORS.primary,
              cursor: 'pointer',
            }}
          />
          <span style={{
            fontFamily: FONT_FAMILY.sans,
            fontSize: FONT_SIZE.sm,
            color: COLORS.textSecondary,
            lineHeight: '1.5',
          }}>
            I understand that losing my note means losing my funds forever
          </span>
        </label>

        {/* Continue Button */}
        <Button
          variant="primary"
          fullWidth
          disabled={!acknowledged}
          onClick={() => void navigate('/darkpool', { state: { showStakingCallout: true } })}
        >
          I've Backed Up My Note
        </Button>
      </div>
    </div>
  );
}
