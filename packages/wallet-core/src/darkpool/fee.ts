/**
 * Saiko DarkPool — Fee Calculations
 *
 * All math uses BigInt. No floats ever.
 * Fee is 0.5% (50 BPS) of the tier deposit amount.
 */

import { DARKPOOL_FEE_BPS, DARKPOOL_FEE_DENOMINATOR } from './constants.js';

/** Calculate the DarkPool fee for a given tier amount. */
export function calculateDarkPoolFee(tierAmount: bigint): bigint {
  return (DARKPOOL_FEE_BPS * tierAmount) / DARKPOOL_FEE_DENOMINATOR;
}

/** Calculate the amount entering the pool after fee deduction. */
export function calculateAmountAfterFee(tierAmount: bigint): bigint {
  return tierAmount - calculateDarkPoolFee(tierAmount);
}

/** Return a full fee breakdown for a tier amount. */
export function formatDarkPoolFeeBreakdown(tier: bigint): {
  tier: bigint;
  fee: bigint;
  amountAfterFee: bigint;
} {
  const fee = calculateDarkPoolFee(tier);
  const amountAfterFee = tier - fee;
  return { tier, fee, amountAfterFee };
}
