import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { fetchPoolStats } from '../utils/contracts';
import { formatSaiko } from '../utils/note';
import { TIER_LABELS, TIER_AMOUNTS_WEI, POOL_VERSIONS } from '../constants';

interface PoolData {
  tierBalances: bigint[];
  totalDeposits: number;
}

const STATUS_STYLES = {
  active: { dot: 'bg-green-400', label: 'ACTIVE', text: 'text-green-400' },
  withdrawals_only: { dot: 'bg-yellow-400', label: 'WITHDRAW ONLY', text: 'text-yellow-400' },
};

export function Landing() {
  const [poolData, setPoolData] = useState<Record<string, PoolData>>({});

  useEffect(() => {
    Promise.all(
      POOL_VERSIONS.map(async p => {
        const stats = await fetchPoolStats(p.address);
        return [p.address, stats] as const;
      })
    ).then(results => {
      const map: Record<string, PoolData> = {};
      results.forEach(([addr, stats]) => { map[addr] = stats; });
      setPoolData(map);
    });
  }, []);

  return (
    <div className="min-h-screen bg-bg">
      {/* Hero */}
      <section className="max-w-4xl mx-auto px-6 pt-20 pb-12">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="space-y-6"
        >
          <div className="font-anton leading-none">
            <div className="text-7xl md:text-9xl text-red tracking-wider">SAIKO</div>
            <div className="text-7xl md:text-9xl text-white tracking-wider">DARK POOLS</div>
          </div>
          <p className="text-muted text-lg max-w-xl font-body leading-relaxed">
            Private SAIKO transfers via zero-knowledge proofs. Permissionless AMM pools for any ERC20 pair.
            Staking rewards in SAIKO and ETH. Built on Ethereum.
          </p>
          <div className="flex gap-4 pt-2 flex-wrap">
            <Link to="/deposit" className="btn-red px-10 py-4 text-base no-underline">DARKPOOL</Link>
            <Link to="/pools" className="btn-outline px-10 py-4 text-base no-underline">POOLS</Link>
            <Link to="/claim" className="btn-outline px-10 py-4 text-base no-underline">CLAIM REWARDS</Link>
          </div>
        </motion.div>
      </section>

      {/* Protocol pillars */}
      <section className="border-t border-border">
        <div className="max-w-4xl mx-auto px-6 py-14">
          <h2 className="font-anton text-2xl text-white tracking-wider mb-8">THE PROTOCOL</h2>
          <div className="grid md:grid-cols-3 gap-6">
            {[
              {
                tag: 'PRIVACY',
                title: 'DARKPOOL',
                body: 'Deposit SAIKO into a privacy pool. Receive a cryptographic note. Withdraw to any address with zero on-chain link. Groth16 ZK proofs generated locally in your browser.',
                link: '/deposit',
                cta: 'DEPOSIT',
              },
              {
                tag: 'POOLS',
                title: 'TOKEN POOLS',
                body: 'Dark pools for any ERC20 pair. Permissionless creation via the Saiko Factory. Swap, provide liquidity, earn fees — fully on-chain.',
                link: '/pools',
                cta: 'EXPLORE POOLS',
              },
              {
                tag: 'REWARDS',
                title: 'STAKING',
                body: 'DarkPool depositors earn SAIKO rewards from pool deposit fees, plus ETH rewards from swap fees — all without touching principal. Claim any time.',
                link: '/claim',
                cta: 'CLAIM REWARDS',
              },
            ].map(({ tag, title, body, link, cta }) => (
              <div key={tag} className="card flex flex-col space-y-3">
                <div className="font-anton text-xs text-red tracking-widest">{tag}</div>
                <div className="font-anton text-xl text-white tracking-wider">{title}</div>
                <p className="text-muted text-sm font-body leading-relaxed flex-1">{body}</p>
                <Link to={link} className="btn-outline text-xs py-2 px-4 no-underline self-start mt-2">
                  {cta}
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pool cards */}
      <section className="border-t border-border">
        <div className="max-w-4xl mx-auto px-6 py-12 space-y-4">
          <h2 className="font-anton text-2xl text-white tracking-wider mb-6">POOLS</h2>

          {POOL_VERSIONS.map((pool, i) => {
            const data = poolData[pool.address];
            const style = STATUS_STYLES[pool.status];
            const totalLocked = data ? data.tierBalances.reduce((a, b) => a + b, 0n) : null;

            return (
              <motion.div
                key={pool.version}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.1 * i }}
                className="card"
              >
                {/* Header row */}
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <div className="font-anton text-2xl text-white tracking-wider">{pool.label}</div>
                    <p className="text-muted text-sm font-body mt-1">{pool.description}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <div className={`w-2 h-2 rounded-full ${style.dot}`} />
                    <span className={`font-anton text-xs tracking-widest ${style.text}`}>{style.label}</span>
                  </div>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-4 gap-3 mb-4">
                  {TIER_AMOUNTS_WEI.map((_, ti) => (
                    <div key={ti} className="text-center space-y-1">
                      <div className="text-muted text-xs font-body">{TIER_LABELS[ti]}</div>
                      <div className="font-anton text-white text-lg">
                        {data ? formatSaiko(data.tierBalances[ti]!) : '—'}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Summary row */}
                <div className="flex gap-6 pt-3 border-t border-border text-sm font-body text-muted">
                  <span>
                    <span className="text-white font-bold">{data?.totalDeposits ?? '—'}</span> deposits
                  </span>
                  {totalLocked !== null && totalLocked > 0n && (
                    <span>
                      <span className="text-white font-bold">{formatSaiko(totalLocked)} SAIKO</span> locked
                    </span>
                  )}
                  <span className="ml-auto font-mono text-xs text-border hover:text-muted transition-colors truncate max-w-[200px]">
                    {pool.address.slice(0, 10)}...{pool.address.slice(-6)}
                  </span>
                </div>

                {/* Actions */}
                <div className="flex gap-3 mt-4 pt-3 border-t border-border">
                  {pool.status === 'active' && (
                    <Link to={`/deposit?pool=${pool.version}`} className="btn-red text-sm px-4 py-2 no-underline">
                      DEPOSIT
                    </Link>
                  )}
                  <Link to={`/withdraw?pool=${pool.version}`} className="btn-outline text-sm px-4 py-2 no-underline">
                    WITHDRAW
                  </Link>
                </div>
              </motion.div>
            );
          })}
        </div>
      </section>

      {/* How it works */}
      <section className="border-t border-border">
        <div className="max-w-4xl mx-auto px-6 py-14">
          <h2 className="font-anton text-2xl text-white tracking-wider mb-8">HOW DARKPOOL WORKS</h2>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              { num: '01', title: 'DEPOSIT', body: 'Lock SAIKO in the pool. Receive a cryptographic note. Guard it with your life.' },
              { num: '02', title: 'WAIT', body: 'Let the anonymity set grow. More deposits. More cover. Stronger privacy.' },
              { num: '03', title: 'WITHDRAW', body: 'Fresh wallet. Submit note. Receive SAIKO with no link to the original deposit.' },
            ].map(({ num, title, body }) => (
              <div key={num} className="space-y-3">
                <div className="font-anton text-red text-5xl">{num}</div>
                <div className="font-anton text-white text-xl tracking-wider">{title}</div>
                <p className="text-muted text-sm font-body leading-relaxed">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How Token Pools work */}
      <section className="border-t border-border">
        <div className="max-w-4xl mx-auto px-6 py-14">
          <h2 className="font-anton text-2xl text-white tracking-wider mb-8">HOW TOKEN POOLS WORK</h2>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              { num: '01', title: 'CREATE', body: 'Deploy a pool for any two ERC20 tokens via the Saiko Factory. Set your fee. One pool per pair. Permissionless.' },
              { num: '02', title: 'PROVIDE', body: 'Add liquidity to any pool. Earn a share of every swap fee proportional to your position.' },
              { num: '03', title: 'EARN', body: 'Swap fees flow three ways: LPs (you), protocol treasury, and DarkPool stakers. No lock-ups. Remove any time.' },
            ].map(({ num, title, body }) => (
              <div key={num} className="space-y-3">
                <div className="font-anton text-red text-5xl">{num}</div>
                <div className="font-anton text-white text-xl tracking-wider">{title}</div>
                <p className="text-muted text-sm font-body leading-relaxed">{body}</p>
              </div>
            ))}
          </div>
          <div className="mt-8">
            <Link to="/pools" className="btn-red px-8 py-3 text-sm no-underline">
              EXPLORE TOKEN POOLS
            </Link>
          </div>
        </div>
      </section>

      {/* Rules */}
      <section className="border-t border-border">
        <div className="max-w-4xl mx-auto px-6 py-10">
          <div className="border border-border p-6 space-y-2">
            <div className="font-anton text-xs text-muted tracking-widest mb-3">RULES OF ENGAGEMENT</div>
            <ul className="text-muted text-sm font-body space-y-1.5">
              <li>Your DarkPool note is the only key. Lose it. Lose everything. No recovery.</li>
              <li>Withdraw to a fresh wallet with no transaction history for maximum privacy.</li>
              <li>Larger anonymity sets offer stronger privacy. Wait for more deposits before withdrawing.</li>
              <li>ZK proofs generated locally. Your secrets never leave your browser.</li>
              <li>Token pool LP positions are not anonymous. Only DarkPool deposits have ZK privacy.</li>
              <li>Claim key preimage reveals which note is claiming rewards. Submit via Flashbots for privacy.</li>
            </ul>
          </div>
        </div>
      </section>
    </div>
  );
}
