/**
 * DarkPool Proof Screen — Compliance proof generation.
 *
 * User selects an active note, picks a proof type, generates,
 * then can copy or download the result.
 */
import React, { useContext, useEffect, useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { IconArrowLeft, IconShield, IconKey, IconCopy, IconCheck } from '../icons.js';
import {
  Card,
  Button,
  Input,
  Badge,
  COLORS,
  FONT_FAMILY,
  FONT_SIZE,
  FONT_WEIGHT,
  SPACING,
  RADIUS,
} from '@saiko-wallet/ui-kit';
import {
  TIER_LABELS,
  loadNotes,
  generateComplianceProof,
} from '@saiko-wallet/wallet-core';
import type { DarkPoolNote, ComplianceProof } from '@saiko-wallet/wallet-core';
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

const PROOF_TYPES: { value: ComplianceProof['type']; label: string; desc: string }[] = [
  { value: 'ownership', label: 'Ownership', desc: 'Prove you own a specific deposit' },
  { value: 'link', label: 'Link', desc: 'Prove a deposit and withdrawal are linked' },
  { value: 'source', label: 'Source', desc: 'Prove the source of deposited funds' },
  { value: 'innocence', label: 'Innocence', desc: 'Prove your deposit is not associated with illicit activity' },
];

// ── Main Component ───────────────────────────────────────────────────────────

export function DarkPoolProofScreen(): React.ReactElement {
  const navigate = useNavigate();
  const { walletAddress, addToast } = useContext(AppCtx);
  const [notes, setNotes] = useState<DarkPoolNote[]>([]);
  const [selectedNote, setSelectedNote] = useState<DarkPoolNote | null>(null);
  const [proofType, setProofType] = useState<ComplianceProof['type'] | null>(null);
  const [withdrawalTxHash, setWithdrawalTxHash] = useState('');
  const [generatedProof, setGeneratedProof] = useState<ComplianceProof | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!walletAddress) return;
    void (async () => {
      try {
        const notesKey = walletAddress.toLowerCase() + ':saiko-darkpool-notes-v1';
        const all = await loadNotes(notesKey);
        setNotes(all.filter((n) => !n.isSpent));
      } catch {
        // No notes
      }
    })();
  }, [walletAddress]);

  async function handleGenerate(): Promise<void> {
    if (!selectedNote || !proofType) return;
    setIsGenerating(true);
    try {
      const proof = await generateComplianceProof(
        selectedNote,
        proofType,
        proofType === 'link' ? withdrawalTxHash : undefined,
      );
      setGeneratedProof(proof);
    } catch (err) {
      addToast({
        type: 'error',
        title: 'Proof Generation Failed',
        message: err instanceof Error ? err.message : 'Could not generate proof. Please try again.',
      });
    }
    setIsGenerating(false);
  }

  const proofJson = generatedProof ? JSON.stringify(generatedProof, null, 2) : '';

  async function handleCopy(): Promise<void> {
    await navigator.clipboard.writeText(proofJson);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleDownload(): void {
    const blob = new Blob([proofJson], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `saiko-darkpool-proof-${generatedProof?.type ?? 'unknown'}-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
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
          <IconKey size={20} />
          Compliance Proof
        </div>
      </header>

      <div style={CONTENT_STYLE}>
        {/* Step 1: Select Note */}
        {!generatedProof && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            style={{ display: 'flex', flexDirection: 'column', gap: SPACING[5] }}
          >
            <Card title="Select Note">
              {notes.length === 0 ? (
                <div style={{
                  padding: SPACING[6],
                  textAlign: 'center',
                  fontFamily: FONT_FAMILY.sans,
                  fontSize: FONT_SIZE.sm,
                  color: COLORS.textMuted,
                }}>
                  No active notes found. Make a deposit first.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {notes.map((note, i) => {
                    const isSelected = selectedNote?.commitment === note.commitment;
                    return (
                      <motion.button
                        key={note.commitment}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: `${SPACING[4]} ${SPACING[4]}`,
                          borderBottom: i < notes.length - 1 ? `1px solid ${COLORS.divider}` : 'none',
                          background: isSelected ? 'rgba(227,27,35,0.08)' : 'none',
                          border: 'none',
                          cursor: 'pointer',
                          outline: 'none',
                          width: '100%',
                          textAlign: 'left',
                        }}
                        onClick={() => setSelectedNote(note)}
                        whileHover={{ backgroundColor: 'rgba(227,27,35,0.05)' }}
                      >
                        <div>
                          <div style={{
                            fontFamily: FONT_FAMILY.mono,
                            fontSize: FONT_SIZE.md,
                            fontWeight: FONT_WEIGHT.medium,
                            color: COLORS.textPrimary,
                          }}>
                            {TIER_LABELS[note.amount.toString()] ?? `${note.amount.toString()} SAIKO`}
                          </div>
                          <div style={{
                            fontFamily: FONT_FAMILY.sans,
                            fontSize: FONT_SIZE.xs,
                            color: COLORS.textMuted,
                          }}>
                            {new Date(note.timestamp).toLocaleDateString()}
                          </div>
                        </div>
                        {isSelected && <Badge variant="connected" dot>Selected</Badge>}
                      </motion.button>
                    );
                  })}
                </div>
              )}
            </Card>

            {/* Proof Type Selection */}
            {selectedNote && (
              <Card title="Proof Type">
                <div style={{ display: 'flex', flexDirection: 'column', gap: SPACING[2] }}>
                  {PROOF_TYPES.map(({ value, label, desc }) => {
                    const isSelected = proofType === value;
                    return (
                      <motion.button
                        key={value}
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          padding: `${SPACING[3]} ${SPACING[4]}`,
                          background: isSelected ? 'rgba(227,27,35,0.08)' : 'none',
                          border: isSelected
                            ? `1px solid ${COLORS.primary}`
                            : `1px solid ${COLORS.border}`,
                          borderRadius: RADIUS.md,
                          cursor: 'pointer',
                          outline: 'none',
                          textAlign: 'left',
                          width: '100%',
                        }}
                        onClick={() => setProofType(value)}
                        whileHover={{ borderColor: COLORS.primary }}
                      >
                        <span style={{
                          fontFamily: FONT_FAMILY.sans,
                          fontSize: FONT_SIZE.md,
                          fontWeight: FONT_WEIGHT.semibold,
                          color: COLORS.textPrimary,
                        }}>
                          {label}
                        </span>
                        <span style={{
                          fontFamily: FONT_FAMILY.sans,
                          fontSize: FONT_SIZE.xs,
                          color: COLORS.textMuted,
                        }}>
                          {desc}
                        </span>
                      </motion.button>
                    );
                  })}
                </div>
              </Card>
            )}

            {/* Link proof needs withdrawal tx hash */}
            {proofType === 'link' && (
              <Card title="Withdrawal Transaction Hash">
                <Input
                  label="Tx Hash"
                  value={withdrawalTxHash}
                  onChange={(v) => setWithdrawalTxHash(v)}
                  placeholder="0x..."
                />
              </Card>
            )}

            <Button
              variant="primary"
              fullWidth
              disabled={!selectedNote || !proofType || (proofType === 'link' && !withdrawalTxHash)}
              isLoading={isGenerating}
              onClick={() => void handleGenerate()}
            >
              Generate Proof
            </Button>
          </motion.div>
        )}

        {/* Generated Proof Result */}
        {generatedProof && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            style={{ display: 'flex', flexDirection: 'column', gap: SPACING[5] }}
          >
            <Card title={`${generatedProof.type.charAt(0).toUpperCase() + generatedProof.type.slice(1)} Proof`}>
              <div style={{
                backgroundColor: COLORS.background,
                border: `1px solid ${COLORS.border}`,
                borderRadius: RADIUS.md,
                padding: SPACING[4],
                maxHeight: '300px',
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
                  {proofJson}
                </pre>
              </div>
            </Card>

            <div style={{ display: 'flex', gap: SPACING[3] }}>
              <Button
                variant="secondary"
                fullWidth
                onClick={() => void handleCopy()}
              >
                <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: SPACING[2] }}>
                  {copied ? <IconCheck size={16} /> : <IconCopy size={16} />}
                  {copied ? 'Copied!' : 'Copy Proof'}
                </span>
              </Button>
              <Button variant="secondary" fullWidth onClick={handleDownload}>
                Download as JSON
              </Button>
            </div>

            {/* Disclaimer */}
            <div style={{
              backgroundColor: COLORS.surface,
              border: `1px solid ${COLORS.border}`,
              borderRadius: RADIUS.md,
              padding: SPACING[4],
              fontFamily: FONT_FAMILY.sans,
              fontSize: FONT_SIZE.sm,
              color: COLORS.textMuted,
              lineHeight: '1.5',
            }}>
              This proof is for YOUR use only. Saiko Wallet never sees it.
              Share only with parties you choose.
            </div>

            <Button
              variant="ghost"
              fullWidth
              onClick={() => {
                setGeneratedProof(null);
                setSelectedNote(null);
                setProofType(null);
              }}
            >
              Generate Another Proof
            </Button>
          </motion.div>
        )}
      </div>
    </div>
  );
}
