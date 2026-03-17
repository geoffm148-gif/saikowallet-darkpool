/**
 * On-chain reads via viem — pool stats, allowance, balances, deposit history.
 */

import { createPublicClient, http, parseAbiItem } from 'viem';
import { mainnet } from 'viem/chains';
import {
  DARK_POOL_V4_ADDRESS,
  DARK_POOL_V3_ADDRESS,
  DARK_POOL_STAKING_ADDRESS,
  SAIKO_TOKEN_ADDRESS,
  DARK_POOL_V4_ABI,
  STAKING_ABI,
  ERC20_ABI,
  RPC_URLS,
  TIER_AMOUNTS_WEI,
  CUSTOM_POOL_ABI,
  POOL_FACTORY_ABI,
  FEE_CONFIG_ABI,
  FEE_CONFIG_ADDRESS,
} from '../constants';

function getClient() {
  return createPublicClient({
    chain: mainnet,
    transport: http(RPC_URLS[0]),
  });
}

export interface PoolStats {
  tierBalances: bigint[];   // deposited SAIKO per tier (wei)
  totalDeposits: number;    // total deposit count
  isPaused: boolean;
}

export async function fetchPoolStats(poolAddress?: string): Promise<PoolStats> {
  const addr = (poolAddress ?? DARK_POOL_V3_ADDRESS) as `0x${string}`;
  const client = getClient();
  try {
    const [balances, nextIndex] = await Promise.all([
      Promise.all(
        TIER_AMOUNTS_WEI.map(amount =>
          client.readContract({
            address: addr,
            abi: DARK_POOL_V4_ABI,
            functionName: 'tierBalance',
            args: [amount],
          }) as Promise<bigint>
        )
      ),
      client.readContract({
        address: addr,
        abi: DARK_POOL_V4_ABI,
        functionName: 'nextIndex',
      }) as Promise<number>,
    ]);
    return { tierBalances: balances, totalDeposits: Number(nextIndex), isPaused: false };
  } catch {
    return { tierBalances: [0n, 0n, 0n, 0n], totalDeposits: 0, isPaused: false };
  }
}

export async function fetchAllowance(owner: string, spender?: string, tokenAddress?: string): Promise<bigint> {
  const client = getClient();
  const spenderAddr = (spender ?? DARK_POOL_V3_ADDRESS) as `0x${string}`;
  const tokenAddr = (tokenAddress ?? SAIKO_TOKEN_ADDRESS) as `0x${string}`;
  try {
    return await client.readContract({
      address: tokenAddr,
      abi: ERC20_ABI,
      functionName: 'allowance',
      args: [owner as `0x${string}`, spenderAddr],
    }) as bigint;
  } catch {
    return 0n;
  }
}

export async function fetchSaikoBalance(address: string): Promise<bigint> {
  const client = getClient();
  try {
    return await client.readContract({
      address: SAIKO_TOKEN_ADDRESS,
      abi: ERC20_ABI,
      functionName: 'balanceOf',
      args: [address as `0x${string}`],
    }) as bigint;
  } catch {
    return 0n;
  }
}

export async function fetchStakingRewards(commitment: string): Promise<{
  saikoEarned: bigint;
  ethEarned: bigint;
}> {
  const client = getClient();
  try {
    const [saikoEarned, ethEarned] = await Promise.all([
      client.readContract({
        address: DARK_POOL_STAKING_ADDRESS,
        abi: STAKING_ABI,
        functionName: 'earned',
        args: [commitment as `0x${string}`],
      }) as Promise<bigint>,
      client.readContract({
        address: DARK_POOL_STAKING_ADDRESS,
        abi: STAKING_ABI,
        functionName: 'earnedEth',
        args: [commitment as `0x${string}`],
      }) as Promise<bigint>,
    ]);
    return { saikoEarned, ethEarned };
  } catch {
    return { saikoEarned: 0n, ethEarned: 0n };
  }
}

export async function fetchAllCommitments(fromBlock?: bigint, poolAddress?: string): Promise<{ commitment: string; leafIndex: number }[]> {
  const addr = (poolAddress ?? DARK_POOL_V3_ADDRESS) as `0x${string}`;
  const client = getClient();
  try {
    const logs = await client.getLogs({
      address: addr,
      event: parseAbiItem('event Deposit(bytes32 indexed commitment, uint32 leafIndex, uint256 inputAmount, uint256 noteAmount, uint256 fee)'),
      fromBlock: fromBlock ?? 'earliest',
      toBlock: 'latest',
    });
    return logs
      .sort((a, b) => Number(a.args.leafIndex!) - Number(b.args.leafIndex!))
      .map(log => ({
        commitment: log.args.commitment as string,
        leafIndex: Number(log.args.leafIndex),
      }));
  } catch {
    return [];
  }
}

export async function fetchNullifierSpent(nullifierHash: string, poolAddress?: string): Promise<boolean> {
  const addr = (poolAddress ?? DARK_POOL_V3_ADDRESS) as `0x${string}`;
  const client = getClient();
  try {
    return await client.readContract({
      address: addr,
      abi: DARK_POOL_V4_ABI,
      functionName: 'nullifierSpent',
      args: [nullifierHash as `0x${string}`],
    }) as boolean;
  } catch {
    return false;
  }
}

// ── Custom pool state ─────────────────────────────────────────────────────────

export interface PoolState {
  reserveA: bigint;
  reserveB: bigint;
  totalSupply: bigint;
  feeBPS: bigint;
}

export async function fetchPoolState(poolAddress: string): Promise<PoolState> {
  const client = getClient();
  const addr = poolAddress as `0x${string}`;
  try {
    const [reserveA, reserveB, totalSupply, feeBPS] = await Promise.all([
      client.readContract({ address: addr, abi: CUSTOM_POOL_ABI, functionName: 'reserveA' }) as Promise<bigint>,
      client.readContract({ address: addr, abi: CUSTOM_POOL_ABI, functionName: 'reserveB' }) as Promise<bigint>,
      client.readContract({ address: addr, abi: CUSTOM_POOL_ABI, functionName: 'totalSupply' }) as Promise<bigint>,
      client.readContract({ address: addr, abi: CUSTOM_POOL_ABI, functionName: 'feeBPS' }) as Promise<bigint>,
    ]);
    return { reserveA, reserveB, totalSupply, feeBPS };
  } catch {
    return { reserveA: 0n, reserveB: 0n, totalSupply: 0n, feeBPS: 0n };
  }
}

export async function fetchLpBalance(userAddress: string, poolAddress: string): Promise<bigint> {
  const client = getClient();
  try {
    return await client.readContract({
      address: poolAddress as `0x${string}`,
      abi: CUSTOM_POOL_ABI,
      functionName: 'balanceOf',
      args: [userAddress as `0x${string}`],
    }) as bigint;
  } catch {
    return 0n;
  }
}

export async function fetchMaxPoolFee(): Promise<bigint> {
  if (FEE_CONFIG_ADDRESS === '0x0000000000000000000000000000000000000000') return 100n;
  const client = getClient();
  try {
    return await client.readContract({
      address: FEE_CONFIG_ADDRESS as `0x${string}`,
      abi: FEE_CONFIG_ABI,
      functionName: 'customPoolDefaultFeeBPS',
    }) as bigint;
  } catch {
    return 100n;
  }
}

// ── Token metadata ────────────────────────────────────────────────────────────

const TOKEN_SYMBOL_ABI = [
  { name: 'symbol', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'string' }] },
  { name: 'decimals', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint8' }] },
] as const;

const symbolCache = new Map<string, { symbol: string; decimals: number }>();

export async function fetchTokenMeta(address: string): Promise<{ symbol: string; decimals: number }> {
  const key = address.toLowerCase();
  if (symbolCache.has(key)) return symbolCache.get(key)!;
  const client = getClient();
  try {
    const [symbol, decimals] = await Promise.all([
      client.readContract({ address: address as `0x${string}`, abi: TOKEN_SYMBOL_ABI, functionName: 'symbol' }) as Promise<string>,
      client.readContract({ address: address as `0x${string}`, abi: TOKEN_SYMBOL_ABI, functionName: 'decimals' }) as Promise<number>,
    ]);
    const result = { symbol, decimals: Number(decimals) };
    symbolCache.set(key, result);
    return result;
  } catch {
    const fallback = { symbol: address.slice(0, 6) + '…', decimals: 18 };
    symbolCache.set(key, fallback);
    return fallback;
  }
}

// ── Custom pool volume ─────────────────────────────────────────────────────────

export interface PoolVolumeStats {
  swapCount: number;
  // volumeByToken: raw amountIn summed per input token address
  volumeByToken: Record<string, bigint>;
}

export async function fetchPoolVolumeStats(poolAddresses: string[]): Promise<Record<string, PoolVolumeStats>> {
  const client = getClient();
  const results: Record<string, PoolVolumeStats> = {};

  await Promise.allSettled(
    poolAddresses.map(async (addr) => {
      try {
        const logs = await client.getLogs({
          address: addr as `0x${string}`,
          event: parseAbiItem(
            'event Swap(address indexed user, address tokenIn, uint256 amountIn, address tokenOut, uint256 amountOut, uint256 fee)'
          ),
          fromBlock: 'earliest',
          toBlock: 'latest',
        });

        const volumeByToken: Record<string, bigint> = {};
        for (const log of logs) {
          const token = (log.args.tokenIn as string).toLowerCase();
          volumeByToken[token] = (volumeByToken[token] ?? 0n) + (log.args.amountIn ?? 0n);
        }
        results[addr.toLowerCase()] = { swapCount: logs.length, volumeByToken };
      } catch {
        results[addr.toLowerCase()] = { swapCount: 0, volumeByToken: {} };
      }
    })
  );

  return results;
}
