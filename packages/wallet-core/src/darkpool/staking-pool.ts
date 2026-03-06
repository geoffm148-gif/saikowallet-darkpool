/**
 * Saiko DarkPool — Staking Pool Service
 *
 * High-level API over the RewardAccumulator.
 * Routes fee splits, manages deposits, and exposes staking info.
 */

import { ethers, HDNodeWallet, Mnemonic } from 'ethers';
import { RewardAccumulator } from './staking-accumulator.js';
import { splitDarkPoolFee, estimateAPY } from './staking-fee.js';
import type { StakingInfo, StakingGlobalInfo, StakingClaimResult } from './types.js';
import { StakingError } from './types.js';
import { DARK_POOL_STAKING_ADDRESS } from './constants.js';

const STAKING_ABI = [
  'function totalStaked() view returns (uint256)',
  'function rewardPool() view returns (uint256)',
  'function ethRewardPool() view returns (uint256)',
  'function rewardPerTokenStored() view returns (uint256)',
  'function earned(bytes32 commitment) view returns (uint256)',
  'function earnedEth(bytes32 commitment) view returns (uint256)',
  'function claimManual(bytes32 commitment, bytes32 nullifier, address recipient) external',
];

export class StakingPoolService {
  private readonly accumulator: RewardAccumulator;

  constructor() {
    this.accumulator = new RewardAccumulator();
  }

  /** Split fee and add reward share to the pool. Returns the split. */
  accrueReward(totalFee: bigint): { rewardShare: bigint; treasuryShare: bigint } {
    const { rewardShare, treasuryShare } = splitDarkPoolFee(totalFee);
    if (rewardShare > 0n) {
      this.accumulator.addRewards(rewardShare, Date.now());
    }
    return { rewardShare, treasuryShare };
  }

  /** Register a deposit for staking rewards. */
  registerDeposit(commitment: string, amountAfterFee: bigint): void {
    this.accumulator.registerDeposit(commitment, amountAfterFee, Date.now());
  }

  /** Remove a deposit and finalize its rewards. Returns earned amount. */
  removeDeposit(commitment: string): bigint {
    return this.accumulator.removeDeposit(commitment, Date.now());
  }

  /** Claim rewards for a deposit via on-chain transaction. */
  async claimReward(
    commitment: string,
    recipientAddress: string,
    mnemonic: string,
    rpcUrl?: string,
  ): Promise<StakingClaimResult> {
    const provider = new ethers.JsonRpcProvider(rpcUrl ?? 'https://eth.llamarpc.com');
    const hdWallet = HDNodeWallet.fromMnemonic(
      Mnemonic.fromPhrase(mnemonic),
      `m/44'/60'/0'/0/0`,
    );
    const wallet = hdWallet.connect(provider);
    const staking = new ethers.Contract(DARK_POOL_STAKING_ADDRESS, STAKING_ABI, wallet);

    const earnedBefore = await staking.earned!(commitment) as bigint;
    const tx = await staking.claimManual!(commitment, recipientAddress);
    const receipt = await tx.wait();

    // Also update local accumulator
    try { this.accumulator.claim(commitment, Date.now()); } catch { /* local state may be out of sync */ }

    return {
      commitment,
      claimedAmount: earnedBefore,
      recipientAddress,
      txHash: receipt.hash as string,
    };
  }

  /** Get staking info for a single deposit. */
  getStakingInfo(commitment: string): StakingInfo {
    const now = Date.now();
    const deposit = this.accumulator.deposits.get(commitment);
    if (!deposit) throw new StakingError(`Deposit not found: ${commitment}`);

    return {
      commitment,
      stakedAmount: deposit.amount,
      earnedRewards: this.accumulator.earned(commitment, now),
      depositTime: deposit.depositTime,
      stakingDurationSeconds: Math.floor((now - deposit.depositTime) / 1000),
    };
  }

  /** Get global staking statistics. */
  getGlobalInfo(trailingSevenDayFees?: bigint): StakingGlobalInfo {
    return {
      totalStaked: this.accumulator.totalStaked,
      rewardPool: this.accumulator.rewardPool,
      ethRewardPool: 0n,
      estimatedAPY: trailingSevenDayFees !== undefined
        ? estimateAPY(trailingSevenDayFees, this.accumulator.totalStaked)
        : 0,
      rewardPerTokenStored: this.accumulator.rewardPerTokenStored,
      lastUpdateTime: this.accumulator.lastUpdateTime,
    };
  }

  /** Get staking info for multiple deposits. */
  getAllUserStakingInfo(commitments: string[]): StakingInfo[] {
    return commitments
      .filter((c) => this.accumulator.deposits.has(c))
      .map((c) => this.getStakingInfo(c));
  }
}

/** Singleton staking pool instance. */
export const stakingPool = new StakingPoolService();

/**
 * Read global staking info directly from the SaikoDarkPoolStaking contract.
 */
export async function getOnChainStakingGlobalInfo(rpcUrl: string): Promise<StakingGlobalInfo> {
  try {
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const staking = new ethers.Contract(DARK_POOL_STAKING_ADDRESS, STAKING_ABI, provider);

    const [totalStaked, rewardPool, ethRewardPool, rewardPerTokenStored] = await Promise.all([
      staking.totalStaked!() as Promise<bigint>,
      staking.rewardPool!() as Promise<bigint>,
      staking.ethRewardPool!() as Promise<bigint>,
      staking.rewardPerTokenStored!() as Promise<bigint>,
    ]);

    return {
      totalStaked,
      rewardPool,
      ethRewardPool,
      estimatedAPY: 0,
      rewardPerTokenStored,
      lastUpdateTime: Date.now(),
    };
  } catch {
    return {
      totalStaked: 0n,
      rewardPool: 0n,
      ethRewardPool: 0n,
      estimatedAPY: 0,
      rewardPerTokenStored: 0n,
      lastUpdateTime: Date.now(),
    };
  }
}
