import { useState } from 'react';
import { motion } from 'framer-motion';
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { fetchStakingRewards } from '../utils/contracts';
import { DARK_POOL_STAKING_ADDRESS, STAKING_ABI } from '../constants';
import { formatSaiko } from '../utils/note';

export function Claim() {
  const { address, isConnected } = useAccount();
  const [commitment, setCommitment] = useState('');
  const [preimage, setPreimage] = useState('');
  const [rewards, setRewards] = useState<{ saikoEarned: bigint; ethEarned: bigint } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const { writeContract, data: txHash, isPending } = useWriteContract();
  const { isSuccess } = useWaitForTransactionReceipt({ hash: txHash });

  async function handleCheck() {
    if (!commitment.startsWith('0x') || commitment.length !== 66) {
      setError('Enter a valid commitment hash (0x + 64 hex chars)');
      return;
    }
    setError('');
    setLoading(true);
    try {
      setRewards(await fetchStakingRewards(commitment));
    } catch (e: any) {
      setError('Failed to fetch rewards: ' + e.message);
    } finally {
      setLoading(false);
    }
  }

  function handleClaim() {
    if (!commitment || !preimage || !address) return;
    writeContract({
      address: DARK_POOL_STAKING_ADDRESS,
      abi: STAKING_ABI,
      functionName: 'claimManual',
      args: [commitment as `0x${string}`, preimage as `0x${string}`, address],
    });
  }

  const hasRewards = rewards && (rewards.saikoEarned > 0n || rewards.ethEarned > 0n);

  return (
    <div className="max-w-2xl mx-auto px-6 py-12">
      <div className="mb-8">
        <h1 className="font-anton text-4xl tracking-wider text-white">CLAIM REWARDS</h1>
        <p className="text-muted text-sm mt-1 font-body">
          DarkPool deposits earn SAIKO and ETH rewards from protocol fees.
          Claim at any time without touching your principal.
        </p>
      </div>

      {error && <div className="border border-red p-4 text-red text-sm font-body mb-6">{error}</div>}

      <div className="space-y-6">

        {/* Connect prompt */}
        {!isConnected && (
          <div className="card flex items-center gap-4">
            <ConnectButton />
            <span className="text-muted text-sm font-body">Connect wallet to claim</span>
          </div>
        )}

        {isConnected && (<>
          {/* Step 1 */}
          <div className="card space-y-3">
            <div className="font-anton text-sm text-muted tracking-widest">STEP 1 — COMMITMENT HASH</div>
            <p className="text-muted text-xs font-body">
              Find your commitment hash in your deposit note. It's the <code className="text-white bg-surface px-1">0x…</code> value
              derived from your secret and nullifier at deposit time.
            </p>
            <input
              type="text"
              value={commitment}
              onChange={e => setCommitment(e.target.value)}
              placeholder="0x..."
              className="input-dark font-mono text-xs"
            />
            <button onClick={handleCheck} disabled={loading || !commitment} className="btn-outline w-full text-sm">
              {loading ? 'CHECKING...' : 'CHECK REWARDS'}
            </button>
          </div>

          {/* Step 2: Rewards */}
          {rewards && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="card space-y-5">
              <div className="font-anton text-sm text-muted tracking-widest">STEP 2 — ACCRUED REWARDS</div>
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-1">
                  <div className="text-muted text-xs font-body">SAIKO REWARDS</div>
                  <div className={`font-anton text-3xl ${rewards.saikoEarned > 0n ? 'text-white' : 'text-border'}`}>
                    {rewards.saikoEarned > 0n ? formatSaiko(rewards.saikoEarned) : '0'}
                  </div>
                  <div className="text-muted text-xs font-body">from DarkPool deposit fees</div>
                </div>
                <div className="space-y-1">
                  <div className="text-muted text-xs font-body">ETH REWARDS</div>
                  <div className={`font-anton text-3xl ${rewards.ethEarned > 0n ? 'text-white' : 'text-border'}`}>
                    {rewards.ethEarned > 0n ? (Number(rewards.ethEarned) / 1e18).toFixed(6) : '0'}
                  </div>
                  <div className="text-muted text-xs font-body">from swap router fees</div>
                </div>
              </div>

              {!hasRewards && (
                <p className="text-muted text-sm font-body border-t border-border pt-3">
                  No rewards yet. Rewards accumulate per block from deposit. Check back after protocol activity.
                </p>
              )}

              {hasRewards && (
                <div className="border-t border-border pt-4 space-y-4">
                  <div className="font-anton text-sm text-muted tracking-widest">STEP 3 — CLAIM KEY PREIMAGE</div>
                  <p className="text-muted text-xs font-body">
                    The raw <code className="text-white bg-surface px-1">bytes32</code> value used as{' '}
                    <code className="text-white bg-surface px-1">claimKeyHash</code> at deposit.
                    In the desktop wallet this is derived from your note's nullifier.
                  </p>
                  <input
                    type="text"
                    value={preimage}
                    onChange={e => setPreimage(e.target.value)}
                    placeholder="0x..."
                    className="input-dark font-mono text-xs"
                  />
                  <div className="border border-red/40 p-4 bg-red/5 space-y-1">
                    <div className="font-anton text-xs text-red tracking-widest">PRIVACY WARNING</div>
                    <p className="text-muted text-xs font-body leading-relaxed">
                      Submitting publicly reveals your claim key. For privacy, use{' '}
                      <a href="https://protect.flashbots.net" target="_blank" rel="noopener noreferrer"
                        className="text-white hover:text-red transition-colors">
                        Flashbots Protect ↗
                      </a>{' '}
                      to avoid mempool exposure.
                    </p>
                  </div>
                  <button onClick={handleClaim} disabled={isPending || isSuccess || !preimage} className="btn-red w-full">
                    {isPending ? 'CLAIMING...' : isSuccess ? 'CLAIMED.' : 'CLAIM REWARDS'}
                  </button>
                </div>
              )}
            </motion.div>
          )}

          {isSuccess && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="border-2 border-red/30 p-6 space-y-2">
              <div className="font-anton text-red text-2xl tracking-wider">REWARDS CLAIMED.</div>
              <p className="text-muted text-sm font-body">SAIKO and ETH sent to your wallet.</p>
              {txHash && (
                <a href={`https://etherscan.io/tx/${txHash}`} target="_blank" rel="noopener noreferrer"
                  className="text-muted text-xs font-mono hover:text-white block">
                  {txHash.slice(0, 18)}... ↗ etherscan
                </a>
              )}
            </motion.div>
          )}
        </>)}

        {/* HOW REWARDS WORK — always visible */}
        <div className="border border-border p-5 space-y-4">
          <div className="font-anton text-xs text-muted tracking-widest">HOW REWARDS WORK</div>
          <div className="grid grid-cols-[auto,1fr] gap-x-4 gap-y-3 items-start text-xs font-body">
            <span className="font-anton text-white">SAIKO</span>
            <span className="text-muted">A share of every DarkPool deposit fee is sent to stakers pro-rata by tier size.</span>
            <span className="font-anton text-white">ETH</span>
            <span className="text-muted">Swap fees from SaikoSwapRouterV2 accrue as ETH rewards across all depositors.</span>
            <span className="font-anton text-white">TOKEN</span>
            <span className="text-muted">Custom Token Pool swaps route a portion of fees to stakers in the input token.</span>
            <span className="font-anton text-white">PRO-RATA</span>
            <span className="text-muted">A 10B SAIKO deposit earns 1000× more than a 10M deposit. Larger tier = larger share.</span>
            <span className="font-anton text-white">PRINCIPAL</span>
            <span className="text-muted">Claiming does not move your deposit. Principal stays locked. Rewards reset to zero.</span>
          </div>
        </div>
      </div>
    </div>
  );
}
