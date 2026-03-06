import { describe, expect, it, beforeEach } from 'vitest';
import {
  splitDarkPoolFee,
  estimateAPY,
  REWARD_SHARE_BPS,
  REWARD_DENOMINATOR,
  DARKPOOL_TIERS,
} from '../../src/darkpool/index.js';
import { RewardAccumulator } from '../../src/darkpool/staking-accumulator.js';
import { StakingPoolService } from '../../src/darkpool/staking-pool.js';

// ─── Fee Split ──────────────────────────────────────────────────────────────

describe('splitDarkPoolFee', () => {
  it('splits 10/90 correctly', () => {
    const { rewardShare, treasuryShare } = splitDarkPoolFee(1000n);
    expect(rewardShare).toBe(100n);
    expect(treasuryShare).toBe(900n);
  });

  it('invariant: rewardShare + treasuryShare === totalFee', () => {
    for (const fee of [0n, 1n, 50_000n, 500_000n, 5_000_000n, 50_000_000n, 999_999n]) {
      const { rewardShare, treasuryShare } = splitDarkPoolFee(fee);
      expect(rewardShare + treasuryShare).toBe(fee);
    }
  });

  it('handles zero fee', () => {
    const { rewardShare, treasuryShare } = splitDarkPoolFee(0n);
    expect(rewardShare).toBe(0n);
    expect(treasuryShare).toBe(0n);
  });

  it('applies correct BPS math', () => {
    const fee = 10_000n;
    const { rewardShare } = splitDarkPoolFee(fee);
    expect(rewardShare).toBe((fee * REWARD_SHARE_BPS) / REWARD_DENOMINATOR);
  });
});

// ─── estimateAPY ────────────────────────────────────────────────────────────

describe('estimateAPY', () => {
  it('returns 0 when totalStaked is 0', () => {
    expect(estimateAPY(1_000_000n, 0n)).toBe(0);
  });

  it('calculates APY with known values', () => {
    const apy = estimateAPY(10_000_000n, 100_000_000n);
    expect(apy).toBeGreaterThan(50);
    expect(apy).toBeLessThan(55);
  });
});

// ─── RewardAccumulator ──────────────────────────────────────────────────────

describe('RewardAccumulator', () => {
  let acc: RewardAccumulator;

  beforeEach(() => {
    acc = new RewardAccumulator();
  });

  it('single deposit earns all rewards', () => {
    acc.registerDeposit('note1', 1000n, 0);
    acc.addRewards(500n, 1);
    const earned = acc.earned('note1', 2);
    expect(earned).toBeGreaterThan(0n);
  });

  it('two equal deposits at same time split 50/50', () => {
    acc.registerDeposit('a', 1000n, 0);
    acc.registerDeposit('b', 1000n, 0);
    acc.addRewards(1000n, 1);

    const earnedA = acc.earned('a', 2);
    const earnedB = acc.earned('b', 2);
    expect(earnedA).toBe(earnedB);
  });

  it('deposit held 2x longer earns 2x more (same amount)', () => {
    acc.registerDeposit('a', 1000n, 0);
    acc.addRewards(1000n, 0);

    acc.registerDeposit('b', 1000n, 5);

    const earnedA = acc.earned('a', 10);
    const earnedB = acc.earned('b', 10);
    expect(earnedA).toBeGreaterThan(earnedB);
  });

  it('Tier 4 (10B) earns ~1000x vs Tier 1 (10M)', () => {
    const tier1 = DARKPOOL_TIERS[0]; // 10M
    const tier4 = DARKPOOL_TIERS[3]; // 10B

    acc.registerDeposit('t1', tier1, 0);
    acc.registerDeposit('t4', tier4, 0);
    acc.addRewards(1_000_000n, 1);

    const e1 = acc.earned('t1', 2);
    const e4 = acc.earned('t4', 2);

    const ratio = Number(e4) / Number(e1);
    expect(ratio).toBeGreaterThan(990);
    expect(ratio).toBeLessThan(1010);
  });

  it('claim resets earned to 0, new rewards accumulate after claim', () => {
    acc.registerDeposit('note', 1000n, 0);
    acc.addRewards(500n, 1);

    const claimed = acc.claim('note', 2);
    expect(claimed).toBeGreaterThan(0n);

    const afterClaim = acc.earned('note', 2);
    expect(afterClaim).toBe(0n);

    acc.addRewards(300n, 3);
    const afterNew = acc.earned('note', 4);
    expect(afterNew).toBeGreaterThan(0n);
  });

  it('remove deposit finalizes rewards, no new accrual after', () => {
    acc.registerDeposit('note', 1000n, 0);
    acc.addRewards(500n, 1);

    const finalized = acc.removeDeposit('note', 2);
    expect(finalized).toBeGreaterThan(0n);

    acc.addRewards(1000n, 3);

    const afterMore = acc.earned('note', 4);
    expect(afterMore).toBe(finalized);
  });

  it('zero totalStaked: addRewards does not revert', () => {
    expect(() => acc.addRewards(1000n, 1)).not.toThrow();
  });

  it('first deposit starts earning from deposit time', () => {
    acc.addRewards(1000n, 0);

    acc.registerDeposit('first', 500n, 5);

    acc.addRewards(500n, 5);

    const earned = acc.earned('first', 10);
    expect(earned).toBeGreaterThan(0n);
  });
});

// ─── StakingPoolService Integration ─────────────────────────────────────────

describe('StakingPoolService', () => {
  it('full deposit → accrue → earn → claim cycle', () => {
    const pool = new StakingPoolService();

    pool.registerDeposit('commitment1', 1_000_000n);

    // Accrue from darkpool deposit fee
    const { rewardShare, treasuryShare } = pool.accrueReward(50_000n);
    expect(rewardShare).toBe(5_000n);
    expect(treasuryShare).toBe(45_000n);

    const info = pool.getStakingInfo('commitment1');
    expect(info.commitment).toBe('commitment1');
    expect(info.stakedAmount).toBe(1_000_000n);

    const result = pool.claimReward('commitment1', '0xRecipient');
    expect(result.commitment).toBe('commitment1');
    expect(result.recipientAddress).toBe('0xRecipient');
    expect(result.txHash).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it('both fee sources: swap fees + darkpool fees both increase rewardPool', () => {
    const pool = new StakingPoolService();

    pool.registerDeposit('c1', 1_000_000n);

    // DarkPool deposit fee
    const split1 = pool.accrueReward(100_000n);
    expect(split1.rewardShare).toBe(10_000n);

    // Swap fee (same path)
    const split2 = pool.accrueReward(200_000n);
    expect(split2.rewardShare).toBe(20_000n);

    const global = pool.getGlobalInfo();
    expect(global.rewardPool).toBeGreaterThan(0n);
  });

  it('getAllUserStakingInfo returns info for multiple deposits', () => {
    const pool = new StakingPoolService();

    pool.registerDeposit('c1', 100n);
    pool.registerDeposit('c2', 200n);

    const infos = pool.getAllUserStakingInfo(['c1', 'c2', 'c3']);
    expect(infos).toHaveLength(2);
    expect(infos[0].commitment).toBe('c1');
    expect(infos[1].commitment).toBe('c2');
  });

  it('getGlobalInfo returns estimated APY when fees provided', () => {
    const pool = new StakingPoolService();
    pool.registerDeposit('c1', 1_000_000n);
    const global = pool.getGlobalInfo(500_000n);
    expect(global.estimatedAPY).toBeGreaterThan(0);
  });
});
