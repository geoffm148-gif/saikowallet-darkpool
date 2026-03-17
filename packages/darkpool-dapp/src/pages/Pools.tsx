import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { createPublicClient, http, parseAbiItem, isAddress } from 'viem';
import { mainnet } from 'viem/chains';
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import {
  RPC_URLS, POOL_FACTORY_ADDRESS, SAIKO_TOKEN_ADDRESS,
  CUSTOM_POOL_ABI, POOL_FACTORY_ABI, ERC20_ABI,
} from '../constants';
import {
  fetchTokenMeta, fetchPoolVolumeStats, fetchPoolState, fetchLpBalance,
  fetchMaxPoolFee, fetchAllowance, type PoolVolumeStats, type PoolState,
} from '../utils/contracts';

// ── Types ─────────────────────────────────────────────────────────────────────

interface CustomPool {
  address: string;
  token0: string; token1: string;
  token0Symbol: string; token1Symbol: string;
  token0Decimals: number; token1Decimals: number;
  feeBPS: number;
  isNew: boolean;
}

type PoolTab = 'swap' | 'liquidity' | 'position' | 'info';

// ── Helpers ───────────────────────────────────────────────────────────────────

function calcSwapOut(amountIn: bigint, reserveIn: bigint, reserveOut: bigint, feeBPS: bigint): bigint {
  if (reserveIn === 0n || reserveOut === 0n || amountIn === 0n) return 0n;
  const fee = amountIn * feeBPS / 10_000n;
  const inAfterFee = amountIn - fee;
  return inAfterFee * reserveOut / (reserveIn + inAfterFee);
}

function calcAddLiqShares(amountA: bigint, amountB: bigint, reserveA: bigint, reserveB: bigint, totalSupply: bigint): bigint {
  if (totalSupply === 0n) {
    const sqr = sqrt(amountA * amountB);
    return sqr > 1000n ? sqr - 1000n : 0n;
  }
  if (reserveA === 0n || reserveB === 0n) return 0n;
  const s0 = amountA * totalSupply / reserveA;
  const s1 = amountB * totalSupply / reserveB;
  return s0 < s1 ? s0 : s1;
}

function sqrt(y: bigint): bigint {
  if (y > 3n) {
    let z = y, x = y / 2n + 1n;
    while (x < z) { z = x; x = (y / x + x) / 2n; }
    return z;
  }
  return y !== 0n ? 1n : 0n;
}

function parseTokenAmount(val: string, decimals: number): bigint {
  try {
    const [whole, frac = ''] = val.split('.');
    const fracPadded = frac.padEnd(decimals, '0').slice(0, decimals);
    return BigInt(whole || '0') * (10n ** BigInt(decimals)) + BigInt(fracPadded || '0');
  } catch { return 0n; }
}

function formatAmount(raw: bigint, decimals: number, dp = 4): string {
  if (raw === 0n) return '0';
  const d = 10n ** BigInt(decimals);
  const whole = raw / d;
  const frac = raw % d;
  const fracStr = frac.toString().padStart(decimals, '0').slice(0, dp).replace(/0+$/, '');
  return fracStr ? `${whole}.${fracStr}` : `${whole}`;
}

function isSaiko(addr: string) {
  return addr.toLowerCase() === SAIKO_TOKEN_ADDRESS.toLowerCase();
}

// ── Data fetching ─────────────────────────────────────────────────────────────

async function fetchCustomPools(): Promise<CustomPool[]> {
  if (POOL_FACTORY_ADDRESS === '0x0000000000000000000000000000000000000000') return [];
  const client = createPublicClient({ chain: mainnet, transport: http(RPC_URLS[0]) });
  try {
    const logs = await client.getLogs({
      address: POOL_FACTORY_ADDRESS as `0x${string}`,
      event: parseAbiItem('event PoolCreated(address indexed token0, address indexed token1, address pool, uint256 feeBPS)'),
      fromBlock: 'earliest', toBlock: 'latest',
    });
    const uniqueTokens = [...new Set(logs.flatMap(l => [l.args.token0 as string, l.args.token1 as string]))];
    const metaMap = Object.fromEntries(
      await Promise.all(uniqueTokens.map(async t => [t.toLowerCase(), await fetchTokenMeta(t)]))
    );
    return logs.map((log, i) => {
      const t0 = log.args.token0 as string, t1 = log.args.token1 as string;
      const m0 = metaMap[t0.toLowerCase()] ?? { symbol: t0.slice(0, 6) + '…', decimals: 18 };
      const m1 = metaMap[t1.toLowerCase()] ?? { symbol: t1.slice(0, 6) + '…', decimals: 18 };
      return {
        address: log.args.pool as string,
        token0: t0, token1: t1,
        token0Symbol: m0.symbol, token1Symbol: m1.symbol,
        token0Decimals: m0.decimals, token1Decimals: m1.decimals,
        feeBPS: Number(log.args.feeBPS), isNew: i >= logs.length - 3,
      };
    });
  } catch { return []; }
}

// ── Create Pool Form ──────────────────────────────────────────────────────────

function CreatePoolForm({ onCreated }: { onCreated: () => void }) {
  const { isConnected } = useAccount();
  const [tokenA, setTokenA] = useState('');
  const [tokenB, setTokenB] = useState('');
  const [symbolA, setSymbolA] = useState('');
  const [symbolB, setSymbolB] = useState('');
  const [feeBPS, setFeeBPS] = useState('30');
  const [maxFee, setMaxFee] = useState(100n);
  const [error, setError] = useState('');

  useEffect(() => { fetchMaxPoolFee().then(setMaxFee); }, []);

  async function resolveSymbol(addr: string, set: (s: string) => void) {
    if (!isAddress(addr)) { set(''); return; }
    try { const m = await fetchTokenMeta(addr); set(m.symbol); }
    catch { set('?'); }
  }

  const { writeContract, data: txHash, isPending } = useWriteContract();
  const { isSuccess } = useWaitForTransactionReceipt({ hash: txHash });

  useEffect(() => { if (isSuccess) { onCreated(); setTokenA(''); setTokenB(''); setFeeBPS('30'); } }, [isSuccess]);

  function handleCreate() {
    setError('');
    if (!isAddress(tokenA) || !isAddress(tokenB)) { setError('Enter valid token addresses.'); return; }
    if (tokenA.toLowerCase() === tokenB.toLowerCase()) { setError('Tokens must be different.'); return; }
    const fee = BigInt(feeBPS);
    if (fee > maxFee) { setError(`Max fee is ${Number(maxFee) / 100}%`); return; }
    writeContract({
      address: POOL_FACTORY_ADDRESS as `0x${string}`,
      abi: POOL_FACTORY_ABI,
      functionName: 'createPool',
      args: [tokenA as `0x${string}`, tokenB as `0x${string}`, fee],
    });
  }

  return (
    <div className="card space-y-4">
      <div className="font-anton text-lg text-white tracking-wider">CREATE NEW POOL</div>
      <p className="text-muted text-xs font-body">Deploy an AMM pool for any ERC20 pair. Permissionless.</p>

      {error && <div className="text-red text-xs font-body border border-red px-3 py-2">{error}</div>}

      <div className="grid md:grid-cols-2 gap-3">
        <div className="space-y-1">
          <div className="font-anton text-xs text-muted tracking-widest">TOKEN A</div>
          <input
            value={tokenA} onChange={e => setTokenA(e.target.value)}
            onBlur={() => resolveSymbol(tokenA, setSymbolA)}
            placeholder="0x... token address"
            className="input-dark font-mono text-xs"
          />
          {symbolA && <div className="text-red text-xs font-anton tracking-wider">{symbolA}</div>}
        </div>
        <div className="space-y-1">
          <div className="font-anton text-xs text-muted tracking-widest">TOKEN B</div>
          <input
            value={tokenB} onChange={e => setTokenB(e.target.value)}
            onBlur={() => resolveSymbol(tokenB, setSymbolB)}
            placeholder="0x... token address"
            className="input-dark font-mono text-xs"
          />
          {symbolB && <div className="text-red text-xs font-anton tracking-wider">{symbolB}</div>}
        </div>
      </div>

      <div className="space-y-2">
        <div className="font-anton text-xs text-muted tracking-widest">
          SWAP FEE — {(Number(feeBPS) / 100).toFixed(2)}% (max {(Number(maxFee) / 100).toFixed(2)}%)
        </div>
        <div className="flex gap-2 flex-wrap">
          {['5', '10', '30', '50', '100'].filter(f => BigInt(f) <= maxFee).map(f => (
            <button
              key={f} onClick={() => setFeeBPS(f)}
              className={`font-anton text-xs px-3 py-1.5 tracking-wider transition-colors ${feeBPS === f ? 'bg-red text-white' : 'border border-border text-muted hover:text-white hover:border-muted'}`}
            >
              {(Number(f) / 100).toFixed(2)}%
            </button>
          ))}
        </div>
      </div>

      {!isConnected ? (
        <ConnectButton />
      ) : (
        <button onClick={handleCreate} disabled={isPending || isSuccess} className="btn-red w-full">
          {isPending ? 'DEPLOYING...' : isSuccess ? 'POOL CREATED.' : 'CREATE POOL'}
        </button>
      )}
    </div>
  );
}

// ── Pool Card ─────────────────────────────────────────────────────────────────

function PoolCard({ pool, stats }: { pool: CustomPool; stats?: PoolVolumeStats }) {
  const { address: userAddress, isConnected } = useAccount();
  const [expanded, setExpanded] = useState(false);
  const [tab, setTab] = useState<PoolTab>('swap');
  const [poolState, setPoolState] = useState<PoolState | null>(null);
  const [lpBalance, setLpBalance] = useState<bigint>(0n);

  // Swap state
  const [swapDir, setSwapDir] = useState<'AtoB' | 'BtoA'>('AtoB');
  const [swapIn, setSwapIn] = useState('');
  const [swapAllowance, setSwapAllowance] = useState<bigint>(0n);

  // Liquidity state
  const [liqAmtA, setLiqAmtA] = useState('');
  const [liqAmtB, setLiqAmtB] = useState('');
  const [removeShares, setRemoveShares] = useState('');
  const [allowanceA, setAllowanceA] = useState<bigint>(0n);
  const [allowanceB, setAllowanceB] = useState<bigint>(0n);

  const tokenIn  = swapDir === 'AtoB' ? pool.token0 : pool.token1;
  const tokenOut = swapDir === 'AtoB' ? pool.token1 : pool.token0;
  const symIn    = swapDir === 'AtoB' ? pool.token0Symbol : pool.token1Symbol;
  const symOut   = swapDir === 'AtoB' ? pool.token1Symbol : pool.token0Symbol;
  const decIn    = swapDir === 'AtoB' ? pool.token0Decimals : pool.token1Decimals;
  const decOut   = swapDir === 'AtoB' ? pool.token1Decimals : pool.token0Decimals;
  const resIn    = poolState ? (swapDir === 'AtoB' ? poolState.reserveA : poolState.reserveB) : 0n;
  const resOut   = poolState ? (swapDir === 'AtoB' ? poolState.reserveB : poolState.reserveA) : 0n;

  const swapAmtIn  = parseTokenAmount(swapIn, decIn);
  const swapAmtOut = poolState ? calcSwapOut(swapAmtIn, resIn, resOut, poolState.feeBPS) : 0n;

  const addAmtA = parseTokenAmount(liqAmtA, pool.token0Decimals);
  const addAmtB = parseTokenAmount(liqAmtB, pool.token1Decimals);
  const sharesOut = poolState ? calcAddLiqShares(addAmtA, addAmtB, poolState.reserveA, poolState.reserveB, poolState.totalSupply) : 0n;

  const removeSharesAmt = parseTokenAmount(removeShares, 18);
  const removeAmtA = poolState && poolState.totalSupply > 0n ? removeSharesAmt * poolState.reserveA / poolState.totalSupply : 0n;
  const removeAmtB = poolState && poolState.totalSupply > 0n ? removeSharesAmt * poolState.reserveB / poolState.totalSupply : 0n;

  // Swap tx
  const { writeContract: writeSwap, data: swapHash, isPending: isSwapping, reset: resetSwap } = useWriteContract();
  const { isSuccess: swapOk } = useWaitForTransactionReceipt({ hash: swapHash });

  // Approve swap input
  const { writeContract: writeApproveSwap, data: approveSwapHash, isPending: isApprovingSwap } = useWriteContract();
  const { isSuccess: approveSwapOk } = useWaitForTransactionReceipt({ hash: approveSwapHash });

  // Approve A
  const { writeContract: writeApproveA, data: approveAHash, isPending: isApprovingA } = useWriteContract();
  const { isSuccess: approveAOk } = useWaitForTransactionReceipt({ hash: approveAHash });

  // Approve B
  const { writeContract: writeApproveB, data: approveBHash, isPending: isApprovingB } = useWriteContract();
  const { isSuccess: approveBOk } = useWaitForTransactionReceipt({ hash: approveBHash });

  // Add liquidity
  const { writeContract: writeAddLiq, data: addLiqHash, isPending: isAddingLiq } = useWriteContract();
  const { isSuccess: addLiqOk } = useWaitForTransactionReceipt({ hash: addLiqHash });

  // Remove liquidity
  const { writeContract: writeRemoveLiq, data: removeLiqHash, isPending: isRemovingLiq } = useWriteContract();
  const { isSuccess: removeLiqOk } = useWaitForTransactionReceipt({ hash: removeLiqHash });

  const reload = useCallback(async () => {
    const state = await fetchPoolState(pool.address);
    setPoolState(state);
    if (userAddress) {
      const [lb, sa, aa, ab] = await Promise.all([
        fetchLpBalance(userAddress, pool.address),
        fetchAllowance(userAddress, pool.address, pool.token0),
        fetchAllowance(userAddress, pool.address),
        fetchAllowance(userAddress, pool.address, pool.token1),
      ]);
      setLpBalance(lb);
      setSwapAllowance(sa);
      setAllowanceA(aa);
      setAllowanceB(ab);
    }
  }, [pool.address, userAddress]);

  useEffect(() => { if (expanded) reload(); }, [expanded, reload]);
  useEffect(() => { if (approveSwapOk || swapOk || approveAOk || approveBOk || addLiqOk || removeLiqOk) reload(); }, [approveSwapOk, swapOk, approveAOk, approveBOk, addLiqOk, removeLiqOk]);

  // Update swap allowance when direction changes
  useEffect(() => {
    if (!userAddress || !expanded) return;
    fetchAllowance(userAddress, pool.address, tokenIn).then(setSwapAllowance);
  }, [swapDir, userAddress, expanded]);

  const price = poolState && resIn > 0n
    ? calcSwapOut(10n ** BigInt(decIn), resIn, resOut, poolState.feeBPS)
    : 0n;

  const tvlA = poolState ? formatAmount(poolState.reserveA, pool.token0Decimals) : '—';
  const tvlB = poolState ? formatAmount(poolState.reserveB, pool.token1Decimals) : '—';

  const needsApproveSwap = swapAmtIn > 0n && swapAmtIn > swapAllowance;
  const needsApproveA    = addAmtA > 0n && addAmtA > allowanceA;
  const needsApproveB    = addAmtB > 0n && addAmtB > allowanceB;

  return (
    <div className="border border-border bg-surface">
      {/* Collapsed header — always visible */}
      <button
        className="w-full p-5 flex items-center justify-between gap-4 hover:bg-white/[0.02] transition-colors"
        onClick={() => setExpanded(e => !e)}
      >
        <div className="flex items-center gap-4 min-w-0">
          <div className="font-anton text-white text-lg tracking-wide shrink-0">
            {pool.token0Symbol} / {pool.token1Symbol}
          </div>
          {pool.isNew && <span className="font-anton text-xs text-red tracking-widest">NEW</span>}
          <span className="font-body text-xs text-muted hidden md:block truncate">{pool.address}</span>
        </div>
        <div className="flex items-center gap-6 shrink-0">
          {poolState && (
            <div className="text-right hidden sm:block">
              <div className="text-muted text-xs font-body">{tvlA} {pool.token0Symbol} / {tvlB} {pool.token1Symbol}</div>
            </div>
          )}
          <div className="font-anton text-muted text-sm">{(pool.feeBPS / 100).toFixed(2)}%</div>
          {stats && stats.swapCount > 0 && (
            <div className="font-body text-xs text-muted">{stats.swapCount.toLocaleString()} swaps</div>
          )}
          <div className="text-muted text-sm">{expanded ? '▲' : '▼'}</div>
        </div>
      </button>

      {/* Expanded content */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="border-t border-border">
              {/* Tabs */}
              <div className="flex border-b border-border">
                {(['swap', 'liquidity', 'position', 'info'] as PoolTab[]).map(t => (
                  <button
                    key={t}
                    onClick={() => setTab(t)}
                    className={`font-anton text-xs tracking-widest px-5 py-3 transition-colors uppercase ${tab === t ? 'text-red border-b-2 border-red' : 'text-muted hover:text-white'}`}
                  >
                    {t === 'liquidity' ? 'ADD LIQ' : t === 'position' ? 'MY POSITION' : t}
                  </button>
                ))}
              </div>

              <div className="p-5">
                {!isConnected && tab !== 'info' && (
                  <div className="flex items-center gap-4 mb-4">
                    <ConnectButton />
                    <span className="text-muted text-xs font-body">Connect to interact</span>
                  </div>
                )}

                {/* ── SWAP ── */}
                {tab === 'swap' && (
                  <div className="space-y-4 max-w-sm">
                    {/* Direction toggle */}
                    <div className="flex gap-2">
                      <button
                        onClick={() => setSwapDir('AtoB')}
                        className={`font-anton text-xs px-3 py-1.5 tracking-wider transition-colors ${swapDir === 'AtoB' ? 'bg-red text-white' : 'border border-border text-muted hover:text-white'}`}
                      >
                        {pool.token0Symbol} → {pool.token1Symbol}
                      </button>
                      <button
                        onClick={() => setSwapDir('BtoA')}
                        className={`font-anton text-xs px-3 py-1.5 tracking-wider transition-colors ${swapDir === 'BtoA' ? 'bg-red text-white' : 'border border-border text-muted hover:text-white'}`}
                      >
                        {pool.token1Symbol} → {pool.token0Symbol}
                      </button>
                    </div>

                    <div className="space-y-1">
                      <div className="font-anton text-xs text-muted tracking-widest">SELL {symIn}</div>
                      <input
                        value={swapIn} onChange={e => setSwapIn(e.target.value)}
                        placeholder="0.0"
                        className="input-dark font-mono"
                      />
                    </div>

                    <div className="space-y-1">
                      <div className="font-anton text-xs text-muted tracking-widest">RECEIVE {symOut} (estimated)</div>
                      <div className="border border-border px-4 py-3 font-mono text-white bg-bg text-sm">
                        {swapAmtOut > 0n ? formatAmount(swapAmtOut, decOut) : '—'}
                      </div>
                      {price > 0n && (
                        <div className="text-muted text-xs font-body">
                          1 {symIn} ≈ {formatAmount(price, decOut)} {symOut}
                        </div>
                      )}
                    </div>

                    <div className="flex gap-2">
                      {needsApproveSwap && (
                        <button
                          onClick={() => writeApproveSwap({ address: tokenIn as `0x${string}`, abi: ERC20_ABI, functionName: 'approve', args: [pool.address as `0x${string}`, swapAmtIn * 2n] })}
                          disabled={isApprovingSwap || approveSwapOk}
                          className="btn-outline flex-1 text-sm"
                        >
                          {isApprovingSwap ? 'APPROVING...' : `APPROVE ${symIn}`}
                        </button>
                      )}
                      <button
                        onClick={() => writeSwap({ address: pool.address as `0x${string}`, abi: CUSTOM_POOL_ABI, functionName: 'swap', args: [tokenIn as `0x${string}`, swapAmtIn, swapAmtOut * 95n / 100n] })}
                        disabled={!isConnected || isSwapping || swapOk || swapAmtIn === 0n || needsApproveSwap}
                        className="btn-red flex-1 text-sm"
                      >
                        {isSwapping ? 'SWAPPING...' : swapOk ? 'SWAPPED.' : 'SWAP'}
                      </button>
                    </div>
                    {swapOk && swapHash && (
                      <a href={`https://etherscan.io/tx/${swapHash}`} target="_blank" rel="noopener noreferrer" className="text-muted text-xs font-mono hover:text-white block">
                        {swapHash.slice(0, 16)}... (etherscan)
                      </a>
                    )}
                  </div>
                )}

                {/* ── ADD LIQUIDITY ── */}
                {tab === 'liquidity' && (
                  <div className="space-y-4 max-w-sm">
                    <div className="space-y-1">
                      <div className="font-anton text-xs text-muted tracking-widest">AMOUNT {pool.token0Symbol}</div>
                      <input value={liqAmtA} onChange={e => setLiqAmtA(e.target.value)} placeholder="0.0" className="input-dark font-mono" />
                    </div>
                    <div className="space-y-1">
                      <div className="font-anton text-xs text-muted tracking-widest">AMOUNT {pool.token1Symbol}</div>
                      <input value={liqAmtB} onChange={e => setLiqAmtB(e.target.value)} placeholder="0.0" className="input-dark font-mono" />
                    </div>
                    {sharesOut > 0n && (
                      <div className="text-muted text-xs font-body">
                        You receive ≈ {formatAmount(sharesOut, 18)} LP shares
                      </div>
                    )}
                    <div className="flex gap-2 flex-wrap">
                      {needsApproveA && (
                        <button onClick={() => writeApproveA({ address: pool.token0 as `0x${string}`, abi: ERC20_ABI, functionName: 'approve', args: [pool.address as `0x${string}`, addAmtA * 2n] })} disabled={isApprovingA || approveAOk} className="btn-outline text-sm">
                          {isApprovingA ? 'APPROVING...' : `APPROVE ${pool.token0Symbol}`}
                        </button>
                      )}
                      {needsApproveB && (
                        <button onClick={() => writeApproveB({ address: pool.token1 as `0x${string}`, abi: ERC20_ABI, functionName: 'approve', args: [pool.address as `0x${string}`, addAmtB * 2n] })} disabled={isApprovingB || approveBOk} className="btn-outline text-sm">
                          {isApprovingB ? 'APPROVING...' : `APPROVE ${pool.token1Symbol}`}
                        </button>
                      )}
                      <button
                        onClick={() => writeAddLiq({ address: pool.address as `0x${string}`, abi: CUSTOM_POOL_ABI, functionName: 'addLiquidity', args: [addAmtA, addAmtB] })}
                        disabled={!isConnected || isAddingLiq || addLiqOk || addAmtA === 0n || addAmtB === 0n || needsApproveA || needsApproveB}
                        className="btn-red text-sm"
                      >
                        {isAddingLiq ? 'ADDING...' : addLiqOk ? 'ADDED.' : 'ADD LIQUIDITY'}
                      </button>
                    </div>
                    {addLiqOk && addLiqHash && (
                      <a href={`https://etherscan.io/tx/${addLiqHash}`} target="_blank" rel="noopener noreferrer" className="text-muted text-xs font-mono hover:text-white block">
                        {addLiqHash.slice(0, 16)}... (etherscan)
                      </a>
                    )}
                  </div>
                )}

                {/* ── MY POSITION ── */}
                {tab === 'position' && (
                  <div className="space-y-4 max-w-sm">
                    <div className="card space-y-2">
                      <div className="font-anton text-xs text-muted tracking-widest">YOUR LP SHARES</div>
                      <div className="font-anton text-2xl text-white">{formatAmount(lpBalance, 18)}</div>
                      {poolState && poolState.totalSupply > 0n && lpBalance > 0n && (
                        <div className="text-muted text-xs font-body space-y-0.5 pt-1">
                          <div>{formatAmount(lpBalance * poolState.reserveA / poolState.totalSupply, pool.token0Decimals)} {pool.token0Symbol}</div>
                          <div>{formatAmount(lpBalance * poolState.reserveB / poolState.totalSupply, pool.token1Decimals)} {pool.token1Symbol}</div>
                        </div>
                      )}
                    </div>

                    {lpBalance > 0n && (
                      <div className="space-y-3">
                        <div className="space-y-1">
                          <div className="font-anton text-xs text-muted tracking-widest">SHARES TO REMOVE</div>
                          <input value={removeShares} onChange={e => setRemoveShares(e.target.value)} placeholder="0.0" className="input-dark font-mono" />
                          <button onClick={() => setRemoveShares(formatAmount(lpBalance, 18))} className="text-muted text-xs hover:text-white font-body">MAX</button>
                        </div>
                        {removeSharesAmt > 0n && (
                          <div className="text-muted text-xs font-body space-y-0.5">
                            <div>≈ {formatAmount(removeAmtA, pool.token0Decimals)} {pool.token0Symbol}</div>
                            <div>≈ {formatAmount(removeAmtB, pool.token1Decimals)} {pool.token1Symbol}</div>
                          </div>
                        )}
                        <button
                          onClick={() => writeRemoveLiq({ address: pool.address as `0x${string}`, abi: CUSTOM_POOL_ABI, functionName: 'removeLiquidity', args: [removeSharesAmt] })}
                          disabled={!isConnected || isRemovingLiq || removeLiqOk || removeSharesAmt === 0n}
                          className="btn-red w-full text-sm"
                        >
                          {isRemovingLiq ? 'REMOVING...' : removeLiqOk ? 'REMOVED.' : 'REMOVE LIQUIDITY'}
                        </button>
                        {removeLiqOk && removeLiqHash && (
                          <a href={`https://etherscan.io/tx/${removeLiqHash}`} target="_blank" rel="noopener noreferrer" className="text-muted text-xs font-mono hover:text-white block">
                            {removeLiqHash.slice(0, 16)}... (etherscan)
                          </a>
                        )}
                      </div>
                    )}

                    {lpBalance === 0n && (
                      <p className="text-muted text-sm font-body">No position in this pool. Add liquidity to earn fees.</p>
                    )}
                  </div>
                )}

                {/* ── INFO ── */}
                {tab === 'info' && (
                  <div className="space-y-3 text-sm font-body">
                    <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                      <div className="text-muted">Pool address</div>
                      <div className="font-mono text-xs text-white break-all">{pool.address}</div>
                      <div className="text-muted">{pool.token0Symbol}</div>
                      <div className="font-mono text-xs text-white break-all">{pool.token0}</div>
                      <div className="text-muted">{pool.token1Symbol}</div>
                      <div className="font-mono text-xs text-white break-all">{pool.token1}</div>
                      <div className="text-muted">Swap fee</div>
                      <div className="text-white">{(pool.feeBPS / 100).toFixed(2)}%</div>
                      <div className="text-muted">Reserve {pool.token0Symbol}</div>
                      <div className="text-white">{poolState ? formatAmount(poolState.reserveA, pool.token0Decimals) : '—'}</div>
                      <div className="text-muted">Reserve {pool.token1Symbol}</div>
                      <div className="text-white">{poolState ? formatAmount(poolState.reserveB, pool.token1Decimals) : '—'}</div>
                      <div className="text-muted">Total LP supply</div>
                      <div className="text-white">{poolState ? formatAmount(poolState.totalSupply, 18) : '—'}</div>
                      {stats && <><div className="text-muted">Total swaps</div><div className="text-white">{stats.swapCount.toLocaleString()}</div></>}
                    </div>
                    <a
                      href={`https://etherscan.io/address/${pool.address}`}
                      target="_blank" rel="noopener noreferrer"
                      className="text-muted text-xs font-mono hover:text-white block pt-1"
                    >
                      View on Etherscan ↗
                    </a>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export function Pools() {
  const [pools, setPools] = useState<CustomPool[]>([]);
  const [volumeStats, setVolumeStats] = useState<Record<string, PoolVolumeStats>>({});
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [search, setSearch] = useState('');
  const factoryDeployed = POOL_FACTORY_ADDRESS !== '0x0000000000000000000000000000000000000000';

  const load = useCallback(() => {
    setLoading(true);
    fetchCustomPools().then(p => {
      setPools(p);
      setLoading(false);
      if (p.length > 0) {
        fetchPoolVolumeStats(p.map(x => x.address)).then(stats => setVolumeStats(stats));
      }
    });
  }, []);

  useEffect(() => { load(); }, [load]);

  const topPools = [...pools]
    .filter(p => {
      const s = volumeStats[p.address.toLowerCase()];
      return s && s.swapCount > 0;
    })
    .sort((a, b) => {
      const sa = volumeStats[a.address.toLowerCase()];
      const sb = volumeStats[b.address.toLowerCase()];
      if (!sa || !sb) return 0;
      const totalA = Object.values(sa.volumeByToken).reduce((s, v) => s + v, 0n);
      const totalB = Object.values(sb.volumeByToken).reduce((s, v) => s + v, 0n);
      return totalB > totalA ? 1 : totalB < totalA ? -1 : 0;
    })
    .slice(0, 5);

  return (
    <div className="max-w-4xl mx-auto px-6 py-12">

      {/* Header */}
      <div className="flex items-start justify-between mb-10">
        <div>
          <h1 className="font-anton text-4xl tracking-wider text-white">TOKEN POOLS</h1>
          <p className="text-muted text-sm mt-2 font-body max-w-lg">
            Dark pools for any ERC20 pair. Permissionless creation via the Saiko Factory.
            Swap, provide liquidity, earn fees — all on-chain.
          </p>
        </div>
        {factoryDeployed && (
          <button
            onClick={() => setShowCreate(s => !s)}
            className={showCreate ? 'btn-outline text-sm shrink-0 ml-4' : 'btn-red text-sm shrink-0 ml-4'}
          >
            {showCreate ? 'CANCEL' : '+ CREATE POOL'}
          </button>
        )}
      </div>

      {/* Create Pool Form */}
      <AnimatePresence>
        {showCreate && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="mb-8"
          >
            <CreatePoolForm onCreated={() => { setShowCreate(false); load(); }} />
          </motion.div>
        )}
      </AnimatePresence>

      {loading ? (
        <div className="text-muted text-sm font-body">Loading pools...</div>
      ) : !factoryDeployed ? (
        <div className="card space-y-2">
          <div className="font-anton text-xl text-white tracking-wider">NO POOLS YET</div>
          <p className="text-muted text-sm font-body">Factory not deployed. Pools available after launch.</p>
        </div>
      ) : pools.length === 0 ? (
        <div className="card space-y-3">
          <div className="font-anton text-xl text-white tracking-wider">NO POOLS YET</div>
          <p className="text-muted text-sm font-body">No custom pools created yet. Be the first.</p>
        </div>
      ) : (
        <>
          {/* Top Pools */}
          {topPools.length > 0 && (
            <div className="mb-10">
              <h2 className="font-anton text-xl text-white tracking-wider mb-4">TOP POOLS</h2>
              <div className="space-y-2">
                {topPools.map((pool, rank) => {
                  const stats = volumeStats[pool.address.toLowerCase()]!;
                  const totalVol = Object.values(stats.volumeByToken).reduce((s, v) => s + v, 0n);
                  return (
                    <motion.div key={pool.address} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.05 * rank }}
                      className="flex items-center gap-4 border border-border p-4 bg-surface"
                    >
                      <div className="font-anton text-2xl text-red w-8 shrink-0">{String(rank + 1).padStart(2, '0')}</div>
                      <div className="flex-1 min-w-0">
                        <div className="font-anton text-white text-base tracking-wide">{pool.token0Symbol} / {pool.token1Symbol}</div>
                        <div className="font-mono text-xs text-border truncate">{pool.address}</div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="font-anton text-white text-sm">{stats.swapCount.toLocaleString()} swaps</div>
                        <div className="text-muted text-xs font-body">{(pool.feeBPS / 100).toFixed(2)}% fee</div>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </div>
          )}

          {/* All Pools */}
          <div>
            <div className="flex items-center gap-4 mb-4 flex-wrap">
              <h2 className="font-anton text-xl text-white tracking-wider">ALL POOLS</h2>
              <span className="text-muted text-sm font-body">
                {pools.length} {pools.length === 1 ? 'pool' : 'pools'} · {pools.filter(p => isSaiko(p.token0) || isSaiko(p.token1)).length} SAIKO pairs
              </span>
            </div>

            {/* Search */}
            <div className="mb-4">
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search by token symbol or address..."
                className="input-dark font-body text-sm"
              />
            </div>

            {(() => {
              const q = search.trim().toLowerCase();
              const filtered = q
                ? pools.filter(p =>
                    p.token0Symbol.toLowerCase().includes(q) ||
                    p.token1Symbol.toLowerCase().includes(q) ||
                    p.token0.toLowerCase().includes(q) ||
                    p.token1.toLowerCase().includes(q) ||
                    p.address.toLowerCase().includes(q)
                  )
                : pools;
              return filtered.length === 0 ? (
                <div className="text-muted text-sm font-body py-4">
                  No pools match "{search}"
                </div>
              ) : (
                <div className="space-y-1">
                  {filtered.map((pool) => (
                    <PoolCard
                      key={pool.address}
                      pool={pool}
                      stats={volumeStats[pool.address.toLowerCase()]}
                    />
                  ))}
                </div>
              );
            })()}
          </div>
        </>
      )}

      {/* Info */}
      <div className="border border-border p-6 mt-10 space-y-3">
        <div className="font-anton text-xs text-muted tracking-widest">HOW TOKEN POOLS WORK</div>
        <div className="grid md:grid-cols-2 gap-4 text-sm font-body text-muted">
          <div className="space-y-2">
            <p><span className="text-white">Any pair.</span> Permissionless creation for any two ERC20 tokens. One pool per pair.</p>
            <p><span className="text-white">Fee split three ways.</span> Between LPs, protocol treasury, and DarkPool stakers. LPs always receive at least 30%.</p>
          </div>
          <div className="space-y-2">
            <p><span className="text-white">Staker yield.</span> A portion of every swap fee flows directly to DarkPool stakers as token rewards.</p>
            <p><span className="text-white">x*y=k AMM.</span> Standard constant-product curve. Familiar mechanics.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
