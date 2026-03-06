/**
 * DarkPool Withdraw Screen — Multi-step withdrawal flow.
 *
 * Step 1: Select or paste note
 * Step 2: Enter recipient address
 * Step 3: Confirm details
 * Step 4: Generate proof + broadcast (mock)
 */
import React, { useContext, useEffect, useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ethers, HDNodeWallet, Mnemonic, keccak256, toUtf8Bytes } from 'ethers';
import { IconArrowLeft, IconShield, IconAlertTriangle, IconCheck } from '../icons.js';
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
  DARK_POOL_ADDRESS,
  loadNotes,
  markNoteSpent,
  generateWithdrawalProof,
  formatProofForContract,
  IncrementalMerkleTree,
  poseidonHash,
} from '@saiko-wallet/wallet-core';
import type { DarkPoolNote } from '@saiko-wallet/wallet-core';
import { AppCtx } from '../context.js';
import { getActiveRpc } from '../utils/network.js';

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

// ── EIP-55 Validation ────────────────────────────────────────────────────────

function isValidAddress(addr: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(addr);
}

// ── Deserialize pasted note ──────────────────────────────────────────────────

function parseNoteJson(json: string): DarkPoolNote | null {
  try {
    const obj = JSON.parse(json) as Record<string, unknown>;
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
  } catch {
    return null;
  }
}

// ── Main Component ───────────────────────────────────────────────────────────

/** Convert Uint8Array to bigint. */
function bytesToBigInt(bytes: Uint8Array): bigint {
  let result = 0n;
  for (const byte of bytes) {
    result = (result << 8n) | BigInt(byte);
  }
  return result;
}

export function DarkPoolWithdrawScreen(): React.ReactElement {
  const navigate = useNavigate();
  const { sessionMnemonic, addToast } = useContext(AppCtx);
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [savedNotes, setSavedNotes] = useState<DarkPoolNote[]>([]);
  const [selectedNote, setSelectedNote] = useState<DarkPoolNote | null>(null);
  const [pastedJson, setPastedJson] = useState('');
  const [recipient, setRecipient] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [txHash, setTxHash] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const notes = await loadNotes('default');
        setSavedNotes(notes.filter((n) => !n.isSpent));
      } catch {
        // No saved notes
      }
    })();
  }, []);

  function handleSelectPasted(): void {
    const note = parseNoteJson(pastedJson);
    if (note) {
      setSelectedNote(note);
      setStep(2);
    }
  }

  async function handleWithdraw(): Promise<void> {
    if (!selectedNote || !recipient || !sessionMnemonic) return;
    setStep(4);
    setIsGenerating(true);

    try {
      const provider = new ethers.JsonRpcProvider(getActiveRpc());

      // 1. Sync Merkle tree from on-chain Deposit events
      const depositEventTopic = keccak256(
        toUtf8Bytes('Deposit(bytes32,uint32,uint256,uint256,uint256,address)'),
      );
      const logs = await provider.getLogs({
        address: DARK_POOL_ADDRESS,
        topics: [depositEventTopic],
        fromBlock: 0,
        toBlock: 'latest',
      });

      const tree = await IncrementalMerkleTree.create();
      const commitments: string[] = [];
      for (const log of logs) {
        // First topic after event sig is the commitment (bytes32, indexed or in data)
        // data layout: commitment(bytes32), leafIndex(uint32), amount, fee, timestamp, depositor
        const commitment = log.topics[1] ?? '0x' + log.data.slice(2, 66);
        commitments.push(commitment);
        tree.insert(BigInt(commitment));
      }

      // 2. Find our commitment's index
      const noteCommitment = selectedNote.commitment;
      const leafIndex = commitments.findIndex((c) => c.toLowerCase() === noteCommitment.toLowerCase());
      if (leafIndex === -1) throw new Error('Note commitment not found in on-chain Merkle tree');

      // 3. Build Merkle proof
      const merkleProof = tree.getProof(leafIndex);

      // 4. Compute nullifier hash
      const secretBigInt = bytesToBigInt(selectedNote.secret);
      const nullifierBigInt = bytesToBigInt(selectedNote.nullifier);
      const nullifierHash = await poseidonHash([nullifierBigInt]);

      // 5. Generate ZK proof
      const { proof } = await generateWithdrawalProof({
        secret: secretBigInt,
        nullifier: nullifierBigInt,
        pathElements: merkleProof.pathElements,
        pathIndices: merkleProof.pathIndices,
        root: merkleProof.root,
        nullifierHash,
        recipient: BigInt(recipient),
        amount: selectedNote.amount,
      });

      // 6. Format proof for contract
      const { pA, pB, pC } = formatProofForContract(proof);

      // 7. Build and broadcast withdraw tx
      const hdWallet = HDNodeWallet.fromMnemonic(
        Mnemonic.fromPhrase(sessionMnemonic),
        `m/44'/60'/0'/0/0`,
      );
      const wallet = hdWallet.connect(provider);

      const darkPoolIface = new ethers.Interface([
        'function withdraw(uint256[2] pA, uint256[2][2] pB, uint256[2] pC, bytes32 root, bytes32 nullifierHash, address recipient, uint256 amount) external',
      ]);
      const withdrawData = darkPoolIface.encodeFunctionData('withdraw', [
        pA, pB, pC,
        '0x' + merkleProof.root.toString(16).padStart(64, '0'),
        '0x' + nullifierHash.toString(16).padStart(64, '0'),
        recipient,
        selectedNote.amount,
      ]);

      const tx = await wallet.sendTransaction({
        to: DARK_POOL_ADDRESS,
        data: withdrawData,
        value: 0n,
        gasLimit: 500_000n,
        type: 2,
      });
      const receipt = await tx.wait();
      setTxHash(receipt!.hash);

      // 8. Mark note as spent
      try { await markNoteSpent(selectedNote.commitment, 'default'); } catch { /* non-critical */ }

      setSuccess(true);
    } catch (err) {
      addToast({ type: 'error', message: `Withdrawal failed: ${err instanceof Error ? err.message : 'unknown error'}` });
      setStep(3);
    }
    setIsGenerating(false);
  }

  const stepTitles = ['Select Note', 'Recipient', 'Confirm', 'Withdrawing'];

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
          onClick={() => {
            if (step === 1 || success) void navigate('/darkpool');
            else setStep((step - 1) as 1 | 2 | 3);
          }}
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
            DarkPool Withdraw
          </div>
          <div style={{
            fontFamily: FONT_FAMILY.sans,
            fontSize: FONT_SIZE.sm,
            color: COLORS.textMuted,
          }}>
            {success ? 'Complete' : `Step ${step} of 4 — ${stepTitles[step - 1]}`}
          </div>
        </div>
      </header>

      <div style={CONTENT_STYLE}>
        {/* Step 1: Select Note */}
        {step === 1 && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            style={{ display: 'flex', flexDirection: 'column', gap: SPACING[5] }}
          >
            {/* Saved Notes */}
            {savedNotes.length > 0 && (
              <Card title="Saved Active Notes">
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {savedNotes.map((note, i) => (
                    <motion.button
                      key={note.commitment}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: `${SPACING[4]} ${SPACING[4]}`,
                        borderBottom: i < savedNotes.length - 1 ? `1px solid ${COLORS.divider}` : 'none',
                        background: selectedNote?.commitment === note.commitment
                          ? 'rgba(227,27,35,0.08)' : 'none',
                        border: 'none',
                        cursor: 'pointer',
                        outline: 'none',
                        width: '100%',
                        textAlign: 'left',
                      }}
                      onClick={() => { setSelectedNote(note); setStep(2); }}
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
                      <Badge variant="connected" dot>Active</Badge>
                    </motion.button>
                  ))}
                </div>
              </Card>
            )}

            {/* Paste Note */}
            <Card title="Or Paste Note JSON">
              <div style={{ display: 'flex', flexDirection: 'column', gap: SPACING[3] }}>
                <textarea
                  value={pastedJson}
                  onChange={(e) => setPastedJson(e.target.value)}
                  placeholder="Paste your DarkPool note JSON here..."
                  style={{
                    width: '100%',
                    minHeight: '100px',
                    padding: SPACING[3],
                    backgroundColor: COLORS.background,
                    border: `1px solid ${COLORS.border}`,
                    borderRadius: RADIUS.md,
                    color: COLORS.textPrimary,
                    fontFamily: FONT_FAMILY.mono,
                    fontSize: FONT_SIZE.xs,
                    resize: 'vertical',
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
                <Button
                  variant="secondary"
                  disabled={!pastedJson.trim()}
                  onClick={handleSelectPasted}
                >
                  Use Pasted Note
                </Button>
              </div>
            </Card>
          </motion.div>
        )}

        {/* Step 2: Recipient Address */}
        {step === 2 && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            style={{ display: 'flex', flexDirection: 'column', gap: SPACING[5] }}
          >
            <Card title="Recipient Address">
              <div style={{ display: 'flex', flexDirection: 'column', gap: SPACING[3] }}>
                <Input
                  label="ETH Address"
                  value={recipient}
                  onChange={(v) => setRecipient(v)}
                  placeholder="0x..."
                />
                {recipient && !isValidAddress(recipient) && (
                  <span style={{
                    fontFamily: FONT_FAMILY.sans,
                    fontSize: FONT_SIZE.xs,
                    color: COLORS.error,
                  }}>
                    Invalid Ethereum address
                  </span>
                )}
              </div>
            </Card>

            <div style={{
              backgroundColor: 'rgba(255,193,7,0.08)',
              border: '1px solid rgba(255,193,7,0.3)',
              borderRadius: RADIUS.md,
              padding: SPACING[4],
              display: 'flex',
              alignItems: 'flex-start',
              gap: SPACING[3],
            }}>
              <IconAlertTriangle size={20} color="#FFC107" style={{ flexShrink: 0, marginTop: '2px' }} />
              <span style={{
                fontFamily: FONT_FAMILY.sans,
                fontSize: FONT_SIZE.sm,
                color: '#FFC107',
                lineHeight: '1.5',
              }}>
                Use a FRESH address you've never used before — this maximises your privacy.
              </span>
            </div>

            <Button
              variant="primary"
              fullWidth
              disabled={!isValidAddress(recipient)}
              onClick={() => setStep(3)}
            >
              Continue
            </Button>
          </motion.div>
        )}

        {/* Step 3: Confirm */}
        {step === 3 && selectedNote && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            style={{ display: 'flex', flexDirection: 'column', gap: SPACING[5] }}
          >
            <Card title="Withdrawal Summary">
              <div style={{ display: 'flex', flexDirection: 'column', gap: SPACING[3], padding: SPACING[2] }}>
                {[
                  { label: 'Note Tier', value: TIER_LABELS[selectedNote.amount.toString()] ?? selectedNote.amount.toString() },
                  { label: 'Recipient', value: `${recipient.slice(0, 8)}...${recipient.slice(-6)}` },
                  { label: 'Est. Gas', value: '~0.002 ETH' },
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
              A zero-knowledge proof will be generated client-side. This may take
              a few seconds.
            </div>

            <Button
              variant="primary"
              fullWidth
              onClick={() => void handleWithdraw()}
            >
              Withdraw
            </Button>
          </motion.div>
        )}

        {/* Step 4: Generating / Success */}
        {step === 4 && (
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
            {!success ? (
              <>
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
                    Generating Proof
                  </div>
                  <div style={{
                    fontFamily: FONT_FAMILY.sans,
                    fontSize: FONT_SIZE.sm,
                    color: COLORS.textMuted,
                  }}>
                    Building zero-knowledge proof and broadcasting transaction...
                  </div>
                </div>
              </>
            ) : (
              <>
                <div style={{
                  width: '64px',
                  height: '64px',
                  borderRadius: '50%',
                  backgroundColor: 'rgba(67,160,71,0.15)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                  <IconCheck size={32} color={COLORS.success} />
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{
                    fontFamily: FONT_FAMILY.sans,
                    fontSize: FONT_SIZE.xl,
                    fontWeight: FONT_WEIGHT.bold,
                    color: COLORS.success,
                    marginBottom: SPACING[2],
                  }}>
                    Withdrawal Complete
                  </div>
                  <div style={{
                    fontFamily: FONT_FAMILY.mono,
                    fontSize: FONT_SIZE.xs,
                    color: COLORS.textMuted,
                    wordBreak: 'break-all',
                  }}>
                    Tx: {txHash}
                  </div>
                </div>
                <Button
                  variant="primary"
                  onClick={() => void navigate('/darkpool')}
                >
                  Back to DarkPool
                </Button>
              </>
            )}
          </motion.div>
        )}
      </div>
    </div>
  );
}
