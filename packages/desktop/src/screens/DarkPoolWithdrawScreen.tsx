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
  DARKPOOL_TIERS,
  DARK_POOL_ADDRESS,
  DARK_POOL_V2_ADDRESS,
  loadNotes,
  markNoteSpent,
  generateWithdrawalProof,
  formatProofForContract,
  IncrementalMerkleTree,
  poseidonHash,
} from '@saiko-wallet/wallet-core';
import type { DarkPoolNote } from '@saiko-wallet/wallet-core';
import { AppCtx } from '../context.js';
import { rpcCall, getGasParams, sendSignedTx, waitForReceipt, getNonce } from '../utils/tx-utils.js';

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
      poolVersion: (obj.poolVersion as 'v2' | 'v3') ?? undefined,
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
  const { sessionMnemonic, addToast, walletAddress } = useContext(AppCtx);
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [savedNotes, setSavedNotes] = useState<DarkPoolNote[]>([]);
  const [selectedNote, setSelectedNote] = useState<DarkPoolNote | null>(null);
  const [pastedJson, setPastedJson] = useState('');
  const [recipient, setRecipient] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [withdrawStatus, setWithdrawStatus] = useState('');
  const [txHash, setTxHash] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!walletAddress) return;
    void (async () => {
      try {
        const notesKey = walletAddress.toLowerCase() + ':saiko-darkpool-notes-v1';
        const notes = await loadNotes(notesKey);
        setSavedNotes(notes.filter((n) => !n.isSpent));
      } catch {
        // No saved notes
      }
    })();
  }, [walletAddress]);

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
    setWithdrawStatus('Connecting to network...');

    try {
      // 1. Sync Merkle tree from on-chain Deposit events using raw rpcCall
      setWithdrawStatus('Syncing Merkle tree from chain...');
      const isV3 = selectedNote.poolVersion === 'v3';
      const poolAddress = isV3 ? DARK_POOL_ADDRESS : DARK_POOL_V2_ADDRESS;
      const depositEventTopic = isV3
        ? keccak256(toUtf8Bytes('Deposit(bytes32,uint32,uint256,uint256,uint256)'))
        : keccak256(toUtf8Bytes('Deposit(bytes32,uint32,uint256,uint256,uint256,address)'));
      const DEPLOY_BLOCK = 24_594_587;
      const CHUNK_SIZE = 49_000;

      const latestHex = await rpcCall<string>('eth_blockNumber', []);
      const latestBlock = Number(BigInt(latestHex));

      type RawLog = { topics: string[]; data: string };
      const allLogs: RawLog[] = [];
      for (let from = DEPLOY_BLOCK; from <= latestBlock; from += CHUNK_SIZE) {
        const to = Math.min(from + CHUNK_SIZE - 1, latestBlock);
        const chunk = await rpcCall<RawLog[]>('eth_getLogs', [{
          address: poolAddress,
          topics: [depositEventTopic],
          fromBlock: '0x' + from.toString(16),
          toBlock: '0x' + to.toString(16),
        }]);
        if (Array.isArray(chunk)) allLogs.push(...chunk);
      }

      const tree = await IncrementalMerkleTree.create();
      const commitments: string[] = [];
      for (const log of allLogs) {
        const commitment = log.topics[1] ?? '0x' + log.data.slice(2, 66);
        commitments.push(commitment);
        tree.insert(BigInt(commitment));
      }

      // 2. Find our commitment
      const noteCommitment = selectedNote.commitment;
      const leafIndex = commitments.findIndex((c) => c.toLowerCase() === noteCommitment.toLowerCase());
      if (leafIndex === -1) throw new Error('Note commitment not found in on-chain Merkle tree');

      // 3. Build Merkle proof
      const merkleProof = tree.getProof(leafIndex);

      // 4. Compute nullifier hash
      setWithdrawStatus('Computing nullifier hash...');
      const secretBigInt = bytesToBigInt(selectedNote.secret);
      const nullifierBigInt = bytesToBigInt(selectedNote.nullifier);
      const nullifierHash = await poseidonHash([nullifierBigInt]);

      // 5. Check on-chain nullifier status BEFORE generating proof (saves 2 min + gas)
      setWithdrawStatus('Checking note status on-chain...');
      const nullifierSpentSelector = ethers.id('nullifierSpent(bytes32)').slice(0, 10);
      const nullifierHashHex = '0x' + nullifierHash.toString(16).padStart(64, '0');
      const spentCallData = nullifierSpentSelector + nullifierHashHex.slice(2).padStart(64, '0');
      const spentResult = await rpcCall<string>('eth_call', [{ to: poolAddress, data: spentCallData }, 'latest']);
      const isAlreadySpent = spentResult && spentResult !== '0x' && BigInt(spentResult) !== 0n;
      if (isAlreadySpent) {
        const notesKey = walletAddress.toLowerCase() + ':saiko-darkpool-notes-v1';
        await markNoteSpent(selectedNote.commitment, notesKey);
        throw new Error('Note already withdrawn on-chain — marked as spent. Your SAIKO was received in a previous withdrawal.');
      }

      // 6. Generate ZK proof
      // Use the raw tier amount in wei — note.amount may store post-fee value which fails _isValidTier()
      const tierAmountWei = (DARKPOOL_TIERS[selectedNote.tier] ?? 0n) * 10n ** 18n;
      if (tierAmountWei === 0n) throw new Error(`Unknown tier index ${selectedNote.tier}`);

      setWithdrawStatus('Generating ZK proof... (this takes 1–2 minutes, please wait)');
      await new Promise(r => setTimeout(r, 50));
      const { proof, commitment: proofCommitment } = await generateWithdrawalProof({
        secret: secretBigInt,
        nullifier: nullifierBigInt,
        pathElements: merkleProof.pathElements,
        pathIndices: merkleProof.pathIndices,
        root: merkleProof.root,
        nullifierHash,
        recipient: BigInt(recipient),
        amount: tierAmountWei,
      });

      // 7. Format proof
      const { pA, pB, pC } = formatProofForContract(proof);

      // 8. Sign + broadcast via rpcCall (no ethers.js provider)
      setWithdrawStatus('Broadcasting transaction...');
      const hdWallet = HDNodeWallet.fromMnemonic(Mnemonic.fromPhrase(sessionMnemonic), `m/44'/60'/0'/0/0`);
      const [nonce, gasParams] = await Promise.all([getNonce(hdWallet.address), getGasParams()]);

      const rootHex = '0x' + merkleProof.root.toString(16).padStart(64, '0');
      const nullifierHashHex2 = '0x' + nullifierHash.toString(16).padStart(64, '0');

      let withdrawData: string;
      if (isV3) {
        const commitmentHex = '0x' + BigInt(proofCommitment).toString(16).padStart(64, '0');
        const darkPoolIface = new ethers.Interface([
          'function withdraw(uint256[2] pA, uint256[2][2] pB, uint256[2] pC, bytes32 root, bytes32 nullifierHash, address recipient, uint256 amount, bytes32 commitment) external',
        ]);
        withdrawData = darkPoolIface.encodeFunctionData('withdraw', [
          pA, pB, pC, rootHex, nullifierHashHex2, recipient, tierAmountWei, commitmentHex,
        ]);
      } else {
        const darkPoolIface = new ethers.Interface([
          'function withdraw(uint256[2] pA, uint256[2][2] pB, uint256[2] pC, bytes32 root, bytes32 nullifierHash, address recipient, uint256 amount) external',
        ]);
        withdrawData = darkPoolIface.encodeFunctionData('withdraw', [
          pA, pB, pC, rootHex, nullifierHashHex2, recipient, tierAmountWei,
        ]);
      }

      const txHash_ = await sendSignedTx(hdWallet, {
        to: poolAddress,
        data: withdrawData,
        value: 0n,
        nonce,
        gasLimit: 800_000n,
        ...gasParams,
      });
      setWithdrawStatus(`Waiting for confirmation... (tx: ${txHash_.slice(0, 10)}...)`);
      await waitForReceipt(txHash_);
      setTxHash(txHash_);

      // 9. Mark note as spent
      try {
        const notesKey = walletAddress.toLowerCase() + ':saiko-darkpool-notes-v1';
        await markNoteSpent(selectedNote.commitment, notesKey);
      } catch { /* non-critical */ }

      setSuccess(true);
    } catch (err) {
      console.error('[Withdraw] failed at step:', withdrawStatus, err);
      const msg = err instanceof Error ? err.message : String(err);
      addToast({ type: 'error', title: 'Withdrawal failed', message: `[at: ${withdrawStatus}] ${msg}`.slice(0, 300) });
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
                    maxWidth: '320px',
                  }}>
                    {withdrawStatus || 'Preparing...'}
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
