/**
 * DarkPool Withdraw Screen — Extension popup (360x600).
 *
 * Multi-step withdrawal flow:
 * 1. Select note
 * 2. Enter recipient address
 * 3. Confirm details
 * 4. Generate ZK proof (via offscreen document) + broadcast tx
 */
import React, { useContext, useEffect, useState, type CSSProperties } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ethers, HDNodeWallet, Mnemonic, keccak256, toUtf8Bytes } from 'ethers';
import { IconArrowLeft, IconShield, IconAlertTriangle, IconCheck } from '../icons';
import {
  Button, Card, Input, COLORS, FONT_FAMILY, FONT_SIZE, FONT_WEIGHT, SPACING, RADIUS,
} from '@saiko-wallet/ui-kit';
import {
  DARKPOOL_TIERS, TIER_LABELS, DARK_POOL_ADDRESS, DARK_POOL_V2_ADDRESS,
  IncrementalMerkleTree, poseidonHash, formatProofForContract,
  markNoteSpent,
} from '@saiko-wallet/wallet-core';
import type { DarkPoolNote } from '@saiko-wallet/wallet-core';
import { AppCtx } from '../context';
import { getNetworkById } from '../utils/network';

// ── Styles ───────────────────────────────────────────────────────────────────

const SCREEN: CSSProperties = {
  minHeight: '600px', display: 'flex', flexDirection: 'column',
  backgroundColor: COLORS.background, padding: SPACING[4],
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function isValidAddress(addr: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(addr);
}

function bytesToBigInt(bytes: Uint8Array): bigint {
  let result = 0n;
  for (const byte of bytes) {
    result = (result << 8n) | BigInt(byte);
  }
  return result;
}

/** Deserialize a note from location.state or storage JSON. */
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
    isSpent: (obj.isSpent as boolean) ?? false,
    poolVersion: (obj.poolVersion as 'v2' | 'v3') ?? undefined,
  };
}

/** RPC call through service worker. */
async function rpcCall<T>(rpcUrl: string, method: string, params: unknown[]): Promise<T> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ action: 'rpc:call', rpcUrl, method, params }, (resp: any) => {
      if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
      if (resp?.error) return reject(new Error(typeof resp.error === 'string' ? resp.error : resp.error.message ?? JSON.stringify(resp.error)));
      resolve(resp?.result as T);
    });
  });
}

/** Generate ZK proof via service worker → offscreen document. */
async function requestZKProof(input: Record<string, string>): Promise<{ proof: any; publicSignals: string[] }> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ action: 'darkpool:generateProof', input }, (resp: any) => {
      if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
      if (resp?.error) return reject(new Error(resp.error));
      resolve({ proof: resp.proof, publicSignals: resp.publicSignals });
    });
  });
}

/** Load encrypted notes via service worker. */
async function loadNotesFromSW(address: string): Promise<DarkPoolNote[]> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ action: 'darkpool:getNotes', address }, (resp: any) => {
      if (chrome.runtime.lastError || resp?.error || !resp?.notes) {
        resolve([]);
        return;
      }
      try {
        resolve((resp.notes as Record<string, unknown>[]).map(deserializeNote));
      } catch {
        resolve([]);
      }
    });
  });
}

// ── Main Component ───────────────────────────────────────────────────────────

export function DarkPoolWithdrawScreen(): React.ReactElement {
  const navigate = useNavigate();
  const location = useLocation();
  const { sessionMnemonic, walletAddress, activeNetworkId, addToast, activeAccountIndex } = useContext(AppCtx);
  const rpcUrl = getNetworkById(activeNetworkId).rpcUrl;

  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [savedNotes, setSavedNotes] = useState<DarkPoolNote[]>([]);
  const [selectedNote, setSelectedNote] = useState<DarkPoolNote | null>(null);
  const [recipient, setRecipient] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [withdrawStatus, setWithdrawStatus] = useState('');
  const [txHash, setTxHash] = useState('');
  const [success, setSuccess] = useState(false);
  const [gasEstimate, setGasEstimate] = useState<string | null>(null);

  // Pre-select note from navigation state
  const stateNote = (location.state as { note?: Record<string, unknown> } | null)?.note;

  useEffect(() => {
    if (stateNote) {
      try {
        setSelectedNote(deserializeNote(stateNote));
        setStep(2);
      } catch { /* ignore */ }
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch gas estimate when entering step 3
  useEffect(() => {
    if (step !== 3) return;
    setGasEstimate(null);
    const WITHDRAW_GAS = 800_000n;
    rpcCall<{ baseFeePerGas?: string } | null>(rpcUrl, 'eth_getBlockByNumber', ['latest', false])
      .then(block => {
        const base = block?.baseFeePerGas ? BigInt(block.baseFeePerGas) : 30_000_000_000n;
        const maxFee = base * 2n + 1_500_000_000n;
        const costWei = WITHDRAW_GAS * maxFee;
        setGasEstimate(`~${(Number(costWei) / 1e18).toFixed(4)} ETH`);
      })
      .catch(() => setGasEstimate('~0.002 ETH'));
  }, [step, rpcUrl]);

  // Load saved notes
  useEffect(() => {
    if (!walletAddress) return;
    void loadNotesFromSW(walletAddress).then(notes => {
      setSavedNotes(notes.filter(n => !n.isSpent));
    });
  }, [walletAddress]);

  async function handleWithdraw(): Promise<void> {
    if (!selectedNote || !recipient || !sessionMnemonic) return;
    setStep(4);
    setIsGenerating(true);
    setWithdrawStatus('Connecting to network...');

    try {
      // 1. Sync Merkle tree from on-chain Deposit events
      setWithdrawStatus('Syncing Merkle tree from chain...');
      const isV3 = selectedNote.poolVersion === 'v3';
      const poolAddress = isV3 ? DARK_POOL_ADDRESS : DARK_POOL_V2_ADDRESS;
      const depositEventTopic = isV3
        ? keccak256(toUtf8Bytes('Deposit(bytes32,uint32,uint256,uint256,uint256)'))
        : keccak256(toUtf8Bytes('Deposit(bytes32,uint32,uint256,uint256,uint256,address)'));
      const DEPLOY_BLOCK = 24_594_587;
      const CHUNK_SIZE = 49_000;

      const latestHex = await rpcCall<string>(rpcUrl, 'eth_blockNumber', []);
      const latestBlock = Number(BigInt(latestHex));

      type RawLog = { topics: string[]; data: string };
      const allLogs: RawLog[] = [];
      for (let from = DEPLOY_BLOCK; from <= latestBlock; from += CHUNK_SIZE) {
        const to = Math.min(from + CHUNK_SIZE - 1, latestBlock);
        const chunk = await rpcCall<RawLog[]>(rpcUrl, 'eth_getLogs', [{
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
      const leafIndex = commitments.findIndex(c => c.toLowerCase() === noteCommitment.toLowerCase());
      if (leafIndex === -1) throw new Error('Note commitment not found in on-chain Merkle tree');

      // 3. Build Merkle proof
      const merkleProof = tree.getProof(leafIndex);

      // 4. Compute nullifier hash
      setWithdrawStatus('Computing nullifier hash...');
      const secretBigInt = bytesToBigInt(selectedNote.secret);
      const nullifierBigInt = bytesToBigInt(selectedNote.nullifier);
      const nullifierHash = await poseidonHash([nullifierBigInt]);

      // 5. Check on-chain nullifier status BEFORE generating proof
      setWithdrawStatus('Checking note status on-chain...');
      const nullifierSpentSelector = ethers.id('nullifierSpent(bytes32)').slice(0, 10);
      const nullifierHashHex = '0x' + nullifierHash.toString(16).padStart(64, '0');
      const spentCallData = nullifierSpentSelector + nullifierHashHex.slice(2).padStart(64, '0');
      const spentResult = await rpcCall<string>(rpcUrl, 'eth_call', [{ to: poolAddress, data: spentCallData }, 'latest']);
      const isAlreadySpent = spentResult && spentResult !== '0x' && BigInt(spentResult) !== 0n;
      if (isAlreadySpent) {
        await markNoteSpent(selectedNote.commitment, walletAddress);
        throw new Error('Note already withdrawn on-chain — marked as spent.');
      }

      // 6. Generate ZK proof via offscreen document
      const tierAmountWei = (DARKPOOL_TIERS[selectedNote.tier] ?? 0n) * 10n ** 18n;
      if (tierAmountWei === 0n) throw new Error(`Unknown tier index ${selectedNote.tier}`);

      setWithdrawStatus('Generating ZK proof... (10-30 seconds)');
      await new Promise(r => setTimeout(r, 50));

      const witnessInput: Record<string, string> = {
        secret: secretBigInt.toString(),
        nullifier: nullifierBigInt.toString(),
        pathElements: JSON.stringify(merkleProof.pathElements.map(x => x.toString())),
        pathIndices: JSON.stringify(merkleProof.pathIndices.map(x => x.toString())),
        root: merkleProof.root.toString(),
        nullifierHash: nullifierHash.toString(),
        recipient: BigInt(recipient).toString(),
        amount: tierAmountWei.toString(),
      };

      // snarkjs expects arrays, not JSON strings — pass them as arrays
      const snarkInput = {
        secret: witnessInput.secret,
        nullifier: witnessInput.nullifier,
        pathElements: merkleProof.pathElements.map(x => x.toString()),
        pathIndices: merkleProof.pathIndices.map(x => x.toString()),
        root: witnessInput.root,
        nullifierHash: witnessInput.nullifierHash,
        recipient: witnessInput.recipient,
        amount: witnessInput.amount,
      };

      const { proof, publicSignals } = await requestZKProof(snarkInput as any);

      // 7. Format proof for contract
      const { pA, pB, pC } = formatProofForContract(proof);

      // 8. Sign + broadcast
      setWithdrawStatus('Broadcasting transaction...');
      const hdWallet = HDNodeWallet.fromMnemonic(Mnemonic.fromPhrase(sessionMnemonic), `m/44'/60'/0'/0/${activeAccountIndex}`);

      // Get nonce
      const nonceHex = await rpcCall<string>(rpcUrl, 'eth_getTransactionCount', [hdWallet.address, 'pending']);
      const nonce = Number(BigInt(nonceHex));

      // Get gas params
      let maxFeePerGas = 30_000_000_000n;
      const maxPriorityFeePerGas = 1_500_000_000n;
      try {
        const block = await rpcCall<{ baseFeePerGas?: string } | null>(rpcUrl, 'eth_getBlockByNumber', ['latest', false]);
        if (block?.baseFeePerGas) {
          const base = BigInt(block.baseFeePerGas);
          maxFeePerGas = base * 2n + maxPriorityFeePerGas;
        }
      } catch { /* use default */ }

      const rootHex = '0x' + merkleProof.root.toString(16).padStart(64, '0');
      const nullifierHashHex2 = '0x' + nullifierHash.toString(16).padStart(64, '0');

      let withdrawData: string;
      if (isV3) {
        const proofCommitment = publicSignals[0]!;
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

      const signed = await hdWallet.signTransaction({
        type: 2,
        chainId: BigInt(getNetworkById(activeNetworkId).chainId),
        nonce,
        to: poolAddress,
        data: withdrawData,
        value: 0n,
        gasLimit: 800_000n,
        maxFeePerGas,
        maxPriorityFeePerGas,
      });

      const expectedHash = keccak256(signed);
      let broadcastHash: string;
      try {
        const hash = await rpcCall<string>(rpcUrl, 'eth_sendRawTransaction', [signed]);
        broadcastHash = hash ?? expectedHash;
      } catch {
        broadcastHash = expectedHash;
      }

      setWithdrawStatus(`Waiting for confirmation... (tx: ${broadcastHash.slice(0, 10)}...)`);

      // Wait for receipt
      const deadline = Date.now() + 180_000;
      while (Date.now() < deadline) {
        try {
          const receipt = await rpcCall<Record<string, unknown> | null>(rpcUrl, 'eth_getTransactionReceipt', [broadcastHash]);
          if (receipt) {
            if (receipt['status'] === '0x0') throw new Error('Transaction reverted on-chain');
            break;
          }
        } catch (err) {
          if (err instanceof Error && err.message.includes('reverted')) throw err;
        }
        await new Promise(r => setTimeout(r, 3000));
      }
      setTxHash(broadcastHash);

      // Mark note as spent
      try {
        await markNoteSpent(selectedNote.commitment, walletAddress);
      } catch { /* non-critical */ }

      setSuccess(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      addToast({ type: 'error', message: `Withdrawal failed: ${msg}`.slice(0, 300) });
      setStep(3);
    }
    setIsGenerating(false);
  }

  return (
    <div style={SCREEN}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: SPACING[3], marginBottom: SPACING[4] }}>
        <button
          onClick={() => {
            if (step === 1 || success) void navigate('/darkpool');
            else setStep((step - 1) as 1 | 2 | 3);
          }}
          style={{
            background: 'none', border: `1px solid ${COLORS.border}`, borderRadius: RADIUS.md,
            color: COLORS.textSecondary, cursor: 'pointer', padding: `${SPACING[2]} ${SPACING[3]}`,
            display: 'flex', alignItems: 'center',
          }}
        >
          <IconArrowLeft size={16} />
        </button>
        <div style={{ flex: 1 }}>
          <div style={{
            fontFamily: FONT_FAMILY.sans, fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.bold,
            color: COLORS.textPrimary, display: 'flex', alignItems: 'center', gap: SPACING[2],
          }}>
            <IconShield size={18} /> Withdraw
          </div>
          <div style={{
            fontFamily: FONT_FAMILY.sans, fontSize: FONT_SIZE.xs, color: COLORS.textMuted,
          }}>
            {success ? 'Complete' : `Step ${step} of 4`}
          </div>
        </div>
      </div>

      {/* Step 1: Select Note */}
      {step === 1 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: SPACING[4], flex: 1, overflow: 'auto' }}>
          {savedNotes.length > 0 && (
            <Card bordered>
              <div style={{
                padding: SPACING[3], fontFamily: FONT_FAMILY.sans, fontSize: FONT_SIZE.sm,
                fontWeight: FONT_WEIGHT.bold, color: COLORS.textPrimary,
              }}>
                Active Notes
              </div>
              {savedNotes.map((note, i) => (
                <button
                  key={note.commitment}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: `${SPACING[3]} ${SPACING[3]}`,
                    borderTop: i > 0 ? `1px solid ${COLORS.border}` : 'none',
                    background: 'none', border: 'none', cursor: 'pointer', width: '100%', textAlign: 'left',
                  }}
                  onClick={() => { setSelectedNote(note); setStep(2); }}
                >
                  <div>
                    <div style={{
                      fontFamily: FONT_FAMILY.mono, fontSize: FONT_SIZE.sm,
                      fontWeight: FONT_WEIGHT.medium, color: COLORS.textPrimary,
                    }}>
                      {TIER_LABELS[note.amount.toString()] ?? `${note.amount.toString()} SAIKO`}
                    </div>
                    <div style={{
                      fontFamily: FONT_FAMILY.sans, fontSize: FONT_SIZE.xs, color: COLORS.textMuted,
                    }}>
                      {new Date(note.timestamp).toLocaleDateString()}
                      {note.poolVersion ? ` (${note.poolVersion})` : ''}
                    </div>
                  </div>
                  <IconArrowLeft size={14} style={{ transform: 'rotate(180deg)', color: COLORS.textMuted }} />
                </button>
              ))}
            </Card>
          )}
          {savedNotes.length === 0 && (
            <div style={{
              flex: 1, display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', gap: SPACING[3],
            }}>
              <IconAlertTriangle size={32} color={COLORS.textMuted} />
              <div style={{
                fontFamily: FONT_FAMILY.sans, fontSize: FONT_SIZE.sm,
                color: COLORS.textMuted, textAlign: 'center',
              }}>
                No active notes found. Deposit first or navigate from the DarkPool screen.
              </div>
              <Button variant="secondary" onClick={() => void navigate('/darkpool')}>
                Back to DarkPool
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Step 2: Recipient Address */}
      {step === 2 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: SPACING[4] }}>
          {selectedNote && (
            <Card bordered>
              <div style={{
                padding: SPACING[3], display: 'flex', justifyContent: 'space-between',
                alignItems: 'center',
              }}>
                <span style={{
                  fontFamily: FONT_FAMILY.sans, fontSize: FONT_SIZE.xs, color: COLORS.textMuted,
                }}>Selected Note</span>
                <span style={{
                  fontFamily: FONT_FAMILY.mono, fontSize: FONT_SIZE.sm,
                  fontWeight: FONT_WEIGHT.medium, color: COLORS.textPrimary,
                }}>
                  {TIER_LABELS[(DARKPOOL_TIERS[selectedNote.tier])?.toString() ?? ''] ?? `Tier ${selectedNote.tier + 1}`}
                </span>
              </div>
            </Card>
          )}

          <Input
            label="Recipient Address"
            value={recipient}
            onChange={(v) => setRecipient(v)}
            placeholder="0x..."
          />
          {recipient && !isValidAddress(recipient) && (
            <span style={{
              fontFamily: FONT_FAMILY.sans, fontSize: FONT_SIZE.xs, color: COLORS.error,
            }}>
              Invalid Ethereum address
            </span>
          )}

          <div style={{
            backgroundColor: 'rgba(255,193,7,0.08)',
            border: '1px solid rgba(255,193,7,0.3)',
            borderRadius: RADIUS.md, padding: SPACING[3],
            display: 'flex', alignItems: 'flex-start', gap: SPACING[2],
          }}>
            <IconAlertTriangle size={16} color="#FFC107" style={{ flexShrink: 0, marginTop: '2px' }} />
            <span style={{
              fontFamily: FONT_FAMILY.sans, fontSize: FONT_SIZE.xs, color: '#FFC107', lineHeight: '1.4',
            }}>
              Use a FRESH address for maximum privacy.
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
        </div>
      )}

      {/* Step 3: Confirm */}
      {step === 3 && selectedNote && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: SPACING[4] }}>
          <Card bordered>
            <div style={{ padding: SPACING[3], display: 'flex', flexDirection: 'column', gap: SPACING[2] }}>
              {[
                { label: 'Note Tier', value: TIER_LABELS[selectedNote.amount.toString()] ?? selectedNote.amount.toString() },
                { label: 'Recipient', value: `${recipient.slice(0, 8)}...${recipient.slice(-6)}` },
                { label: 'Pool', value: selectedNote.poolVersion === 'v3' ? 'V3' : 'V2' },
                { label: 'Est. Gas', value: gasEstimate ?? '...' },
              ].map(({ label, value }) => (
                <div key={label} style={{
                  display: 'flex', justifyContent: 'space-between',
                  padding: `${SPACING[1]} 0`, borderBottom: `1px solid ${COLORS.border}`,
                }}>
                  <span style={{ fontFamily: FONT_FAMILY.sans, fontSize: FONT_SIZE.xs, color: COLORS.textMuted }}>
                    {label}
                  </span>
                  <span style={{ fontFamily: FONT_FAMILY.mono, fontSize: FONT_SIZE.xs, color: COLORS.textPrimary }}>
                    {value}
                  </span>
                </div>
              ))}
            </div>
          </Card>

          <div style={{
            backgroundColor: COLORS.surface, border: `1px solid ${COLORS.border}`,
            borderRadius: RADIUS.md, padding: SPACING[3],
            fontFamily: FONT_FAMILY.sans, fontSize: FONT_SIZE.xs,
            color: COLORS.textMuted, lineHeight: '1.5',
          }}>
            A zero-knowledge proof will be generated. This takes 10-30 seconds.
          </div>

          <Button variant="primary" fullWidth onClick={() => void handleWithdraw()}>
            Withdraw
          </Button>
        </div>
      )}

      {/* Step 4: Generating / Success */}
      {step === 4 && (
        <div style={{
          flex: 1, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: SPACING[4],
        }}>
          {!success ? (
            <>
              <div style={{
                width: 48, height: 48, borderRadius: '50%',
                border: `3px solid ${COLORS.primary}`,
                borderTopColor: 'transparent',
                animation: 'spin 1s linear infinite',
              }} />
              <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
              <div style={{ textAlign: 'center' }}>
                <div style={{
                  fontFamily: FONT_FAMILY.sans, fontSize: FONT_SIZE.md,
                  fontWeight: FONT_WEIGHT.bold, color: COLORS.textPrimary,
                  marginBottom: SPACING[2],
                }}>
                  Generating Proof
                </div>
                <div style={{
                  fontFamily: FONT_FAMILY.sans, fontSize: FONT_SIZE.xs,
                  color: COLORS.textMuted, maxWidth: '280px',
                }}>
                  {withdrawStatus || 'Preparing...'}
                </div>
              </div>
            </>
          ) : (
            <>
              <div style={{
                width: 56, height: 56, borderRadius: '50%',
                backgroundColor: 'rgba(67,160,71,0.15)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <IconCheck size={28} color={COLORS.success} />
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{
                  fontFamily: FONT_FAMILY.sans, fontSize: FONT_SIZE.lg,
                  fontWeight: FONT_WEIGHT.bold, color: COLORS.success,
                  marginBottom: SPACING[2],
                }}>
                  Withdrawal Complete
                </div>
                <div style={{
                  fontFamily: FONT_FAMILY.mono, fontSize: FONT_SIZE.xs,
                  color: COLORS.textMuted, wordBreak: 'break-all',
                }}>
                  Tx: {txHash}
                </div>
              </div>
              <Button variant="primary" onClick={() => void navigate('/darkpool')}>
                Back to DarkPool
              </Button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
