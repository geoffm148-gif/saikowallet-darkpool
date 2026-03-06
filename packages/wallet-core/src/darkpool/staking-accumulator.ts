/**
 * Saiko DarkPool — Reward Accumulator (Synthetix pattern)
 *
 * Tracks reward-per-token using a global accumulator so that each deposit
 * earns pro-rata yield based on amount and duration staked.
 *
 * All math is BigInt with 1e18 precision scaling.
 */

import { REWARD_PRECISION } from './constants.js';
import { StakingError } from './types.js';

interface DepositRecord {
  amount: bigint;
  rewardPerTokenPaid: bigint;
  accruedRewards: bigint;
  depositTime: number;
  removed: boolean;
}

export class RewardAccumulator {
  rewardPerTokenStored: bigint = 0n;
  lastUpdateTime: number = 0;
  totalStaked: bigint = 0n;
  rewardPool: bigint = 0n;
  deposits: Map<string, DepositRecord> = new Map();

  /** View-only: compute current rewardPerToken without mutating state. */
  rewardPerToken(currentTime: number): bigint {
    if (this.totalStaked === 0n) return this.rewardPerTokenStored;
    const elapsed = BigInt(Math.max(0, currentTime - this.lastUpdateTime));
    return this.rewardPerTokenStored +
      (this.rewardPool * REWARD_PRECISION * elapsed) / this.totalStaked;
  }

  /** Update global state — MUST call before every mutation. */
  updateRewardState(currentTime: number): void {
    this.rewardPerTokenStored = this.rewardPerToken(currentTime);
    this.lastUpdateTime = currentTime;
  }

  /** Add external rewards to the pool. */
  addRewards(amount: bigint, currentTime: number): void {
    this.updateRewardState(currentTime);
    this.rewardPool += amount;
  }

  /** Register a new deposit for staking. */
  registerDeposit(commitment: string, amount: bigint, currentTime: number): void {
    this.updateRewardState(currentTime);
    this.deposits.set(commitment, {
      amount,
      rewardPerTokenPaid: this.rewardPerTokenStored,
      accruedRewards: 0n,
      depositTime: currentTime,
      removed: false,
    });
    this.totalStaked += amount;
  }

  /** Remove a deposit — finalizes rewards, keeps record for claiming. */
  removeDeposit(commitment: string, currentTime: number): bigint {
    this.updateRewardState(currentTime);
    const deposit = this.deposits.get(commitment);
    if (!deposit) throw new StakingError(`Deposit not found: ${commitment}`);
    if (deposit.removed) throw new StakingError(`Deposit already removed: ${commitment}`);

    // Finalize earned rewards
    deposit.accruedRewards = this.earned(commitment, currentTime);
    deposit.rewardPerTokenPaid = this.rewardPerTokenStored;
    deposit.removed = true;
    this.totalStaked -= deposit.amount;

    return deposit.accruedRewards;
  }

  /** Calculate earned rewards for a deposit (view-only). */
  earned(commitment: string, currentTime: number): bigint {
    const deposit = this.deposits.get(commitment);
    if (!deposit) return 0n;
    if (deposit.removed) return deposit.accruedRewards;

    const rpt = this.rewardPerToken(currentTime);
    return (deposit.amount * (rpt - deposit.rewardPerTokenPaid)) / REWARD_PRECISION +
      deposit.accruedRewards;
  }

  /** Claim accumulated rewards for a deposit. */
  claim(commitment: string, currentTime: number): bigint {
    this.updateRewardState(currentTime);
    const deposit = this.deposits.get(commitment);
    if (!deposit) throw new StakingError(`Deposit not found: ${commitment}`);

    const earnedAmount = this.earned(commitment, currentTime);
    deposit.accruedRewards = 0n;
    deposit.rewardPerTokenPaid = this.rewardPerTokenStored;

    // Deduct from reward pool (cap at 0)
    this.rewardPool = this.rewardPool > earnedAmount
      ? this.rewardPool - earnedAmount
      : 0n;

    return earnedAmount;
  }
}
