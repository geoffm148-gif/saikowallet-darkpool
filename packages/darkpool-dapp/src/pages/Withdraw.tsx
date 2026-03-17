import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { ProofProgress } from '../components/ProofProgress';
import { decodeNote } from '../utils/note';
import { buildMerkleProof, generateWithdrawalProof } from '../utils/zkProof';
import { fetchAllCommitments, fetchNullifierSpent } from '../utils/contracts';
import {
  DARK_POOL_V4_ABI,
  POOL_VERSIONS,
} from '../constants';
import type { DarkPoolNote } from '../utils/note';
import type { GrothProof } from '../utils/zkProof';

type Step = 'input' | 'proving' | 'confirm' | 'done';

export function Withdraw() {
  const [searchParams] = useSearchParams();
  const initPool = searchParams.get('pool') ?? 'V4';
  const [selectedPool, setSelectedPool] = useState(initPool);
  const poolConfig = POOL_VERSIONS.find(p => p.version === selectedPool) ?? POOL_VERSIONS[0];
  const activePoolAddress = poolConfig.address;

  const { address, isConnected } = useAccount();
  const [step, setStep] = useState<Step>('input');
  const [noteInput, setNoteInput] = useState('');
  const [recipient, setRecipient] = useState('');
  const [note, setNote] = useState<DarkPoolNote | null>(null);
  const [proof, setProof] = useState<GrothProof | null>(null);
  const [proofStep, setProofStep] = useState('Preparing inputs...');
  const [error, setError] = useState('');

  const { writeContract, data: txHash, isPending: isSending } = useWriteContract();
  const { isSuccess } = useWaitForTransactionReceipt({ hash: txHash });

  async function handleGenerateProof() {
    setError('');
    const recipientAddr = recipient.trim() || address || '';
    if (!recipientAddr.startsWith('0x')) {
      setError('Enter a valid recipient address (0x...)');
      return;
    }

    setStep('proving');

    try {
      setProofStep('Parsing note...');
      const decoded = await decodeNote(noteInput.trim());
      setNote(decoded);

      setProofStep('Checking nullifier status...');
      const spent = await fetchNullifierSpent(decoded.nullifierHash, activePoolAddress);
      if (spent) throw new Error('This note has already been withdrawn.');

      setProofStep('Fetching deposit history from chain...');
      const allDeposits = await fetchAllCommitments(undefined, activePoolAddress);
      if (allDeposits.length === 0) throw new Error('No deposits found on-chain. Wrong network?');

      const commitmentList = allDeposits
        .sort((a, b) => a.leafIndex - b.leafIndex)
        .map(d => d.commitment);

      setProofStep('Building Merkle proof...');
      const merkleProof = await buildMerkleProof(commitmentList, decoded.commitment);

      setProofStep('Generating ZK proof (this takes ~30s)...');
      const grothProof = await generateWithdrawalProof(decoded, merkleProof, recipientAddr);

      setProof(grothProof);
      setStep('confirm');
    } catch (e: any) {
      setError(e.message || 'Proof generation failed.');
      setStep('input');
    }
  }

  function handleWithdraw() {
    if (!note || !proof) return;
    const recipientAddr = (recipient.trim() || address || '') as `0x${string}`;
    writeContract({
      address: activePoolAddress as `0x${string}`,
      abi: DARK_POOL_V4_ABI,
      functionName: 'withdraw',
      args: [
        proof.pA,
        proof.pB,
        proof.pC,
        ('0x' + proof.root.toString(16).padStart(64, '0')) as `0x${string}`,
        ('0x' + proof.nullifierHash.toString(16).padStart(64, '0')) as `0x${string}`,
        recipientAddr,
        note.amount,
        note.commitment as `0x${string}`,
      ],
    });
  }

  if (!isConnected) {
    return (
      <div className="max-w-xl mx-auto px-6 py-20 text-center space-y-6">
        <div>
          <h1 className="font-anton text-4xl tracking-wider text-white">DARKPOOL</h1>
          <p className="text-muted text-sm mt-1 font-body">SAIKO privacy pool · ZK proofs · fixed denomination</p>
        </div>
        <p className="text-muted font-body text-sm">Connect a wallet to withdraw. Use a fresh address for maximum privacy.</p>
        <div className="flex justify-center">
          <ConnectButton />
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-6 py-12">
      <div className="mb-8">
        <h1 className="font-anton text-4xl tracking-wider text-white">DARKPOOL</h1>
        <p className="text-muted text-sm mt-1 font-body">
          Submit your note. Receive funds at any address. Leave no trace.
        </p>
        <div className="mt-2 text-xs font-mono text-border">
          {poolConfig.label} — {activePoolAddress.slice(0, 10)}...{activePoolAddress.slice(-6)}
        </div>
      </div>

      {error && (
        <div className="border border-red p-4 text-red text-sm font-body mb-6">{error}</div>
      )}

      <AnimatePresence mode="wait">
        {/* Input step */}
        {step === 'input' && (
          <motion.div key="input" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-6">

            {/* Pool selector */}
            <div className="card space-y-3">
              <div className="font-anton text-sm text-muted tracking-widest">WHICH POOL</div>
              <div className="grid grid-cols-2 gap-2">
                {POOL_VERSIONS.map(p => (
                  <button
                    key={p.version}
                    onClick={() => setSelectedPool(p.version)}
                    className={`p-3 text-left transition-all ${selectedPool === p.version ? 'border-2 border-red bg-red/5' : 'border border-border hover:border-muted'}`}
                  >
                    <div className="font-anton text-sm text-white">{p.label}</div>
                    <div className="text-muted text-xs font-body mt-0.5">
                      {p.status === 'active' ? 'Live' : 'Paused — withdraw only'}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="card space-y-4">
              <div className="font-anton text-sm text-muted tracking-widest">YOUR NOTE</div>
              <textarea
                value={noteInput}
                onChange={e => setNoteInput(e.target.value)}
                placeholder="saiko-dp-v4-..."
                rows={4}
                className="input-dark font-mono text-xs resize-none"
                style={{ fontFamily: 'monospace' }}
              />
            </div>

            <div className="card space-y-3">
              <div className="font-anton text-sm text-muted tracking-widest">RECIPIENT ADDRESS</div>
              <input
                type="text"
                value={recipient}
                onChange={e => setRecipient(e.target.value)}
                placeholder={address || '0x... (leave blank to use connected wallet)'}
                className="input-dark font-mono text-xs"
              />
              <p className="text-muted text-xs font-body">
                For privacy: use a fresh wallet with no history.
              </p>
            </div>

            <button
              onClick={handleGenerateProof}
              disabled={!noteInput.trim()}
              className="btn-red w-full text-base"
            >
              GENERATE PROOF
            </button>
          </motion.div>
        )}

        {/* Proving */}
        {step === 'proving' && (
          <motion.div key="proving" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <ProofProgress step={proofStep} />
          </motion.div>
        )}

        {/* Confirm */}
        {step === 'confirm' && note && proof && (
          <motion.div key="confirm" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-6">
            <div className="border border-red/30 p-4 space-y-1">
              <div className="font-anton text-green-400 text-sm tracking-wider">PROOF GENERATED</div>
              <div className="text-muted text-xs font-body">Zero-knowledge proof verified locally.</div>
            </div>

            <div className="card space-y-3">
              <div className="font-anton text-sm text-muted tracking-widest">WITHDRAWAL SUMMARY</div>
              <div className="space-y-2 text-sm font-body">
                <div className="flex justify-between">
                  <span className="text-muted">Amount</span>
                  <span className="text-white font-mono">{(note.amount / 10n ** 18n).toLocaleString()} SAIKO</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted">Recipient</span>
                  <span className="text-white font-mono text-xs">
                    {(recipient.trim() || address || '').slice(0, 8)}...{(recipient.trim() || address || '').slice(-6)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted">Nullifier hash</span>
                  <span className="text-white font-mono text-xs">
                    {('0x' + proof.nullifierHash.toString(16).padStart(64, '0')).slice(0, 10)}...
                  </span>
                </div>
              </div>
            </div>

            <button
              onClick={handleWithdraw}
              disabled={isSending || isSuccess}
              className="btn-red w-full text-base"
            >
              {isSending ? 'WITHDRAWING...' : isSuccess ? 'WITHDRAWN.' : 'WITHDRAW'}
            </button>
          </motion.div>
        )}

        {/* Done */}
        {isSuccess && (
          <motion.div key="done" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-4 mt-6">
            <div className="border-2 border-red/30 p-6 space-y-2">
              <div className="font-anton text-red text-3xl tracking-wider">WITHDRAWN.</div>
              <p className="text-muted text-sm font-body">
                SAIKO delivered. The hunt continues.
              </p>
              {txHash && (
                <a
                  href={`https://etherscan.io/tx/${txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-muted text-xs font-mono hover:text-white transition-colors block"
                >
                  {txHash.slice(0, 16)}... (etherscan)
                </a>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
