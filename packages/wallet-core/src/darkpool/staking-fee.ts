/**
 * Saiko DarkPool — Staking Fee Split
 *
 * 10% of all fees go to the staking reward pool, 90% to treasury.
 * Floating point used ONLY for APY display.
 */

import { REWARD_SHARE_BPS, REWARD_DENOMINATOR } from './constants.js';

/**
 * Split a fee into reward pool share and treasury share.
 * Invariant: rewardShare + treasuryShare === totalFee (no rounding loss).
 */
export function splitDarkPoolFee(totalFee: bigint): { rewardShare: bigint; treasuryShare: bigint } {
  const rewardShare = (totalFee * REWARD_SHARE_BPS) / REWARD_DENOMINATOR;
  const treasuryShare = totalFee - rewardShare;
  return { rewardShare, treasuryShare };
}

/**
 * Estimate APY based on trailing 7-day fee volume and total staked.
 * Returns a percentage number (e.g. 12.5 for 12.5%).
 * Floating point is acceptable here — display only.
 */
export function estimateAPY(trailingSevenDayFees: bigint, totalStaked: bigint): number {
  if (totalStaked === 0n) return 0;
  const rewardPool7d = (trailingSevenDayFees * REWARD_SHARE_BPS) / REWARD_DENOMINATOR;
  const annualReward = (rewardPool7d * 365n) / 7n;
  return Number((annualReward * 10000n) / totalStaked) / 100;
}
