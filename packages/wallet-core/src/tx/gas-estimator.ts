/**
 * Gas fee estimation using EIP-1559 fee history.
 *
 * WHY fee history over eth_gasPrice: EIP-1559 introduced a base fee that
 * is protocol-enforced and burns. eth_gasPrice only gives a legacy gwei
 * estimate and doesn't account for priority fees. eth_feeHistory lets us
 * analyze recent blocks to compute realistic slow/normal/fast tiers.
 *
 * Algorithm:
 * - Fetch fee history for last N blocks with percentile rewards [10, 50, 90]
 * - 10th percentile = slow (accepted when network is quiet)
 * - 50th percentile = normal (reliable within 1-3 blocks)
 * - 90th percentile = fast (accepted within the next block)
 * - baseFeePerGas comes from the most recent block + next-block prediction
 *
 * Standard: EIP-1559
 */

import type { GasEstimate, GasPrice } from '../types/index.js';
import { GasEstimationError } from '../errors.js';

/** Number of recent blocks to analyze for fee estimation */
export const FEE_HISTORY_BLOCK_COUNT = 10;

/** Reward percentiles for slow/normal/fast tiers */
export const FEE_HISTORY_PERCENTILES = [10, 50, 90] as const;

/** Minimum priority fee (1 gwei) — prevents zero-tip transactions */
export const MIN_PRIORITY_FEE_WEI = 1_000_000_000n; // 1 gwei

/** Safety multiplier for base fee to handle block-to-block increases */
export const BASE_FEE_MULTIPLIER_SLOW = 1.1;
export const BASE_FEE_MULTIPLIER_NORMAL = 1.2;
export const BASE_FEE_MULTIPLIER_FAST = 1.5;

export interface FeeHistoryResult {
  readonly baseFeePerGas: readonly bigint[];
  readonly reward: readonly (readonly bigint[])[];
  readonly oldestBlock: bigint;
}

/**
 * Estimate gas fees from raw fee history data.
 * This is separated from RPC calls so it can be unit tested with mock data.
 *
 * WHY we don't call the RPC here: Keeping pure functions separate from
 * I/O makes testing much simpler and avoids mock complexity.
 */
export function estimateFeesFromHistory(
  feeHistory: FeeHistoryResult,
  currentBlockBaseFee: bigint,
): GasEstimate {
  if (feeHistory.reward.length === 0) {
    throw new GasEstimationError('Fee history returned empty rewards array');
  }

  // Extract percentile rewards for each tier
  // reward[block][percentileIndex]
  const slowRewards: bigint[] = [];
  const normalRewards: bigint[] = [];
  const fastRewards: bigint[] = [];

  for (const blockRewards of feeHistory.reward) {
    // blockRewards[0] = 10th percentile, [1] = 50th, [2] = 90th
    if (blockRewards[0] !== undefined) slowRewards.push(blockRewards[0]);
    if (blockRewards[1] !== undefined) normalRewards.push(blockRewards[1]);
    if (blockRewards[2] !== undefined) fastRewards.push(blockRewards[2]);
  }

  const slowTip = medianBigInt(slowRewards);
  const normalTip = medianBigInt(normalRewards);
  const fastTip = medianBigInt(fastRewards);

  // Apply base fee multipliers — next block base fee can change ±12.5% per block
  const slowBase = multiplyBigIntByFloat(currentBlockBaseFee, BASE_FEE_MULTIPLIER_SLOW);
  const normalBase = multiplyBigIntByFloat(currentBlockBaseFee, BASE_FEE_MULTIPLIER_NORMAL);
  const fastBase = multiplyBigIntByFloat(currentBlockBaseFee, BASE_FEE_MULTIPLIER_FAST);

  const slow: GasPrice = {
    maxFeePerGas: slowBase + ensureMinTip(slowTip),
    maxPriorityFeePerGas: ensureMinTip(slowTip),
    gasPrice: slowBase + ensureMinTip(slowTip), // Legacy fallback
  };

  const normal: GasPrice = {
    maxFeePerGas: normalBase + ensureMinTip(normalTip),
    maxPriorityFeePerGas: ensureMinTip(normalTip),
    gasPrice: normalBase + ensureMinTip(normalTip),
  };

  const fast: GasPrice = {
    maxFeePerGas: fastBase + ensureMinTip(fastTip),
    maxPriorityFeePerGas: ensureMinTip(fastTip),
    gasPrice: fastBase + ensureMinTip(fastTip),
  };

  return {
    slow,
    normal,
    fast,
    estimatedAt: Math.floor(Date.now() / 1000),
  };
}

/** Parse a hex fee history response (as returned by eth_feeHistory JSON-RPC). */
export function parseFeeHistory(raw: {
  baseFeePerGas: readonly string[];
  reward: readonly (readonly string[])[];
  oldestBlock: string;
}): FeeHistoryResult {
  return {
    baseFeePerGas: raw.baseFeePerGas.map((h) => BigInt(h)),
    reward: raw.reward.map((blockRewards) => blockRewards.map((r) => BigInt(r))),
    oldestBlock: BigInt(raw.oldestBlock),
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function medianBigInt(values: readonly bigint[]): bigint {
  if (values.length === 0) return MIN_PRIORITY_FEE_WEI;
  const sorted = [...values].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const mid = Math.floor(sorted.length / 2);
  // Use non-null assertion after bounds check via sort — length verified above
  return sorted[mid] ?? MIN_PRIORITY_FEE_WEI;
}

function multiplyBigIntByFloat(value: bigint, multiplier: number): bigint {
  // BigInt doesn't support floating-point math; we use integer arithmetic.
  // Multiply by 1000, apply float as integer, then divide by 1000.
  const scaled = BigInt(Math.round(multiplier * 1000));
  return (value * scaled) / 1000n;
}

function ensureMinTip(tip: bigint): bigint {
  return tip < MIN_PRIORITY_FEE_WEI ? MIN_PRIORITY_FEE_WEI : tip;
}
