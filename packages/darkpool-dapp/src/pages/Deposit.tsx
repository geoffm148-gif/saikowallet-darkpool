import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { TierCard } from '../components/TierCard';
import { NoteBackup } from '../components/NoteBackup';
import { generateNote, encodeNote } from '../utils/note';
import { fetchAllowance, fetchPoolStats } from '../utils/contracts';
import {
  SAIKO_TOKEN_ADDRESS,
  DARK_POOL_V4_ABI,
  ERC20_ABI,
  TIER_AMOUNTS_WEI,
  POOL_VERSIONS,
} from '../constants';
import type { DarkPoolNote } from '../utils/note';

type Step = 'tier' | 'backup' | 'approve' | 'deposit' | 'done';

export function Deposit() {
  const [searchParams] = useSearchParams();
  const poolVersionParam = searchParams.get('pool') ?? 'V4';
  const poolConfig = POOL_VERSIONS.find(p => p.version === poolVersionParam && p.status === 'active') ?? POOL_VERSIONS[0];
  const activePoolAddress = poolConfig.address as `0x${string}`;

  const { address, isConnected } = useAccount();
  const [step, setStep] = useState<Step>('tier');
  const [tierIndex, setTierIndex] = useState<number | null>(null);
  const [note, setNote] = useState<DarkPoolNote | null>(null);
  const [noteStr, setNoteStr] = useState('');
  const [depositCounts, setDepositCounts] = useState<number[]>([0, 0, 0, 0]);
  const [allowance, setAllowance] = useState<bigint>(0n);
  const [leafIndex, setLeafIndex] = useState<number>(-1);
  const [generatingNote, setGeneratingNote] = useState(false);
  const [error, setError] = useState('');

  const amount = tierIndex !== null ? TIER_AMOUNTS_WEI[tierIndex]! : 0n;

  // Fetch pool stats + allowance
  useEffect(() => {
    fetchPoolStats(activePoolAddress).then(s => {
      const counts = s.tierBalances.map((bal, i) => {
        const perDeposit = TIER_AMOUNTS_WEI[i]! * 9950n / 10000n;
        return perDeposit > 0n ? Math.floor(Number(bal) / Number(perDeposit)) : 0;
      });
      setDepositCounts(counts);
    });
  }, [activePoolAddress]);

  useEffect(() => {
    if (address && tierIndex !== null) {
      fetchAllowance(address, activePoolAddress).then(setAllowance);
    }
  }, [address, tierIndex, activePoolAddress]);

  // Approve tx
  const { writeContract: writeApprove, data: approveTxHash, isPending: isApproving } = useWriteContract();
  const { isSuccess: approveSuccess } = useWaitForTransactionReceipt({ hash: approveTxHash });

  useEffect(() => {
    if (approveSuccess) {
      setAllowance(amount * 2n);
      setStep('deposit');
    }
  }, [approveSuccess, amount]);

  // Deposit tx
  const { writeContract: writeDeposit, data: depositTxHash, isPending: isDepositing } = useWriteContract();
  const { isSuccess: depositSuccess, data: depositReceipt } = useWaitForTransactionReceipt({ hash: depositTxHash });

  useEffect(() => {
    if (depositSuccess && depositReceipt && note) {
      // Parse leafIndex from Deposit event
      const depositLog = depositReceipt.logs[0];
      if (depositLog) {
        try {
          const leafIdx = Number(BigInt(depositLog.data.slice(0, 66)));
          setLeafIndex(leafIdx);
          const finalNote = { ...note, leafIndex: leafIdx };
          setNoteStr(encodeNote(finalNote));
        } catch {
          setNoteStr(encodeNote(note));
        }
      }
      setStep('done');
    }
  }, [depositSuccess, depositReceipt, note]);

  async function handleTierSelect(idx: number) {
    setTierIndex(idx);
    setGeneratingNote(true);
    setError('');
    try {
      const newNote = await generateNote(idx);
      setNote(newNote);
      const tempStr = encodeNote({ ...newNote, leafIndex: -1 });
      setNoteStr(tempStr);
      setStep('backup');
    } catch (e: any) {
      setError('Failed to generate note: ' + e.message);
    } finally {
      setGeneratingNote(false);
    }
  }

  function handleApprove() {
    if (!note) return;
    writeApprove({
      address: SAIKO_TOKEN_ADDRESS,
      abi: ERC20_ABI,
      functionName: 'approve',
      args: [activePoolAddress, amount],
    });
  }

  function handleDeposit() {
    if (!note) return;
    writeDeposit({
      address: activePoolAddress,
      abi: DARK_POOL_V4_ABI,
      functionName: 'deposit',
      args: [
        note.commitment as `0x${string}`,
        amount,
        note.nullifierHash as `0x${string}`,
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
        <p className="text-muted font-body text-sm">Connect your wallet to deposit.</p>
        <div className="flex justify-center">
          <ConnectButton />
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-6 py-12">
      {/* Header */}
      <div className="mb-8">
        <h1 className="font-anton text-4xl tracking-wider text-white">DARKPOOL</h1>
        <p className="text-muted text-sm mt-1 font-body">
          {poolConfig.label} · SAIKO privacy pool · zero-knowledge proof withdrawal
        </p>
      </div>

      {/* Step indicator */}
      <div className="flex gap-2 mb-8">
        {(['tier', 'backup', 'approve', 'deposit', 'done'] as Step[]).map((s, i) => (
          <div
            key={s}
            className={`h-1 flex-1 transition-colors ${
              step === s ? 'bg-red' :
              ['tier','backup','approve','deposit','done'].indexOf(step) > i ? 'bg-red/40' : 'bg-border'
            }`}
          />
        ))}
      </div>

      {error && (
        <div className="border border-red p-4 text-red text-sm font-body mb-6">{error}</div>
      )}

      <AnimatePresence mode="wait">
        {/* Step 1: Tier Selection */}
        {step === 'tier' && (
          <motion.div key="tier" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <p className="text-muted text-sm font-body mb-6">
              Select a deposit tier. All deposits of the same tier are indistinguishable.
            </p>
            {generatingNote && (
              <div className="text-muted text-sm font-body mb-4">Generating commitment...</div>
            )}
            <div className="grid gap-4">
              {TIER_AMOUNTS_WEI.map((_, i) => (
                <TierCard
                  key={i}
                  tierIndex={i}
                  selected={tierIndex === i}
                  onSelect={() => handleTierSelect(i)}
                  depositCount={depositCounts[i]}
                />
              ))}
            </div>
          </motion.div>
        )}

        {/* Step 2: Note Backup */}
        {step === 'backup' && noteStr && (
          <motion.div key="backup" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <NoteBackup
              noteString={noteStr}
              onConfirmed={() => {
                if (allowance >= amount) {
                  setStep('deposit');
                } else {
                  setStep('approve');
                }
              }}
            />
          </motion.div>
        )}

        {/* Step 3: Approve */}
        {step === 'approve' && (
          <motion.div key="approve" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-6">
            <div className="card space-y-4">
              <div className="font-anton text-xl text-white tracking-wider">APPROVE SAIKO</div>
              <p className="text-muted text-sm font-body">
                Allow the DarkPool contract to spend your SAIKO. One-time approval.
              </p>
              <button
                onClick={handleApprove}
                disabled={isApproving}
                className="btn-red w-full"
              >
                {isApproving ? 'APPROVING...' : 'APPROVE SAIKO'}
              </button>
            </div>
          </motion.div>
        )}

        {/* Step 4: Deposit */}
        {step === 'deposit' && (
          <motion.div key="deposit" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-6">
            <div className="card space-y-4">
              <div className="font-anton text-xl text-white tracking-wider">CONFIRM DEPOSIT</div>
              <p className="text-muted text-sm font-body">
                This will lock your SAIKO in the pool. Ensure your note is saved before proceeding.
              </p>
              <button
                onClick={handleDeposit}
                disabled={isDepositing}
                className="btn-red w-full"
              >
                {isDepositing ? 'DEPOSITING...' : 'DEPOSIT'}
              </button>
            </div>
          </motion.div>
        )}

        {/* Step 5: Done */}
        {step === 'done' && (
          <motion.div key="done" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
            <div className="border-2 border-red/30 p-6 space-y-3">
              <div className="font-anton text-red text-3xl tracking-wider">DEPOSITED.</div>
              <p className="text-muted text-sm font-body">
                Your SAIKO is in the pool. Guard your note. Withdraw when ready.
              </p>
            </div>
            <div className="card space-y-2">
              <div className="font-anton text-sm text-muted tracking-wider">YOUR NOTE</div>
              <div className="bg-bg border border-border p-3 font-mono text-xs text-white break-all">
                {noteStr}
              </div>
              <button
                onClick={() => { navigator.clipboard.writeText(noteStr); }}
                className="btn-outline w-full text-sm"
              >
                COPY NOTE
              </button>
            </div>
            <div className="text-muted text-xs font-body">
              Leaf index: {leafIndex >= 0 ? `#${leafIndex}` : 'unknown'}.
              Tx: {depositTxHash ? `${depositTxHash.slice(0, 10)}...` : ''}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
