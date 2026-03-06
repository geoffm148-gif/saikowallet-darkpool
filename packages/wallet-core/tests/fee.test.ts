import { describe, expect, it } from 'vitest';
import { calculateSwapFee, isBelowMinimumSwapAmount } from '../src/swap/fee.js';

describe('calculateSwapFee', () => {
  it('standard: 1,000 tokens → fee=5, swap=995', () => {
    const { fee, amountAfterFee } = calculateSwapFee(1_000n);
    expect(fee).toBe(5n);
    expect(amountAfterFee).toBe(995n);
  });

  it('large: 1,000,000 tokens → fee=5,000, swap=995,000', () => {
    const { fee, amountAfterFee } = calculateSwapFee(1_000_000n);
    expect(fee).toBe(5_000n);
    expect(amountAfterFee).toBe(995_000n);
  });

  it('18-decimal 1 ETH (1e18) → correct BPS math', () => {
    const one = 10n ** 18n;
    const { fee, amountAfterFee } = calculateSwapFee(one);
    expect(fee).toBe(5_000_000_000_000_000n); // 0.005 ETH
    expect(amountAfterFee).toBe(995_000_000_000_000_000n);
  });

  it('dust: 1 wei → fee rounds to 0, swap=1 (no block)', () => {
    const { fee, amountAfterFee } = calculateSwapFee(1n);
    expect(fee).toBe(0n);
    expect(amountAfterFee).toBe(1n);
  });

  it('dust: 199 units → fee floors to 0', () => {
    // 199 * 50 / 10000 = 9950/10000 = 0 (floor)
    const { fee, amountAfterFee } = calculateSwapFee(199n);
    expect(fee).toBe(0n);
    expect(amountAfterFee).toBe(199n);
  });

  it('zero amount → fee=0, amountAfterFee=0', () => {
    const { fee, amountAfterFee } = calculateSwapFee(0n);
    expect(fee).toBe(0n);
    expect(amountAfterFee).toBe(0n);
  });

  it('max uint256 → no overflow', () => {
    const maxUint256 = 2n ** 256n - 1n;
    expect(() => calculateSwapFee(maxUint256)).not.toThrow();
    const { fee, amountAfterFee } = calculateSwapFee(maxUint256);
    expect(fee + amountAfterFee).toBe(maxUint256);
  });

  it('USDC (6 decimals): 1 USDC = 1e6 units → fee=5000 (0.005 USDC), swap=995000', () => {
    const oneUSDC = 1_000_000n;
    const { fee, amountAfterFee } = calculateSwapFee(oneUSDC);
    expect(fee).toBe(5_000n); // 0.5% of 1,000,000
    expect(amountAfterFee).toBe(995_000n);
  });

  it('fee + amountAfterFee always equals inputAmount (no tokens lost)', () => {
    const amounts = [1n, 100n, 999n, 10_000n, 1_000_000n, 10n ** 18n];
    for (const amount of amounts) {
      const { fee, amountAfterFee } = calculateSwapFee(amount);
      expect(fee + amountAfterFee).toBe(amount);
    }
  });

  it('throws on negative input', () => {
    expect(() => calculateSwapFee(-1n)).toThrow(RangeError);
  });
});

describe('isBelowMinimumSwapAmount', () => {
  it('returns false for normal amounts', () => {
    expect(isBelowMinimumSwapAmount(1_000n)).toBe(false);
  });

  it('returns false for dust (fee=0, amountAfterFee=1)', () => {
    expect(isBelowMinimumSwapAmount(1n)).toBe(false);
  });

  it('returns true for zero', () => {
    expect(isBelowMinimumSwapAmount(0n)).toBe(true);
  });
});
