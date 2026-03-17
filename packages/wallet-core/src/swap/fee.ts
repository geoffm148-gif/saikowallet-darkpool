/**
 * Saiko Wallet Swap Fee
 *
 * 0.5% fee on all swaps, collected in the input token.
 * Uses BigInt/basis-points math — never floating point.
 */

// ─── Constants ────────────────────────────────────────────────────────────────

/** 0.5% expressed as basis points */
export const FEE_BPS = 50n;

/** BPS denominator */
export const FEE_DENOMINATOR = 10_000n;

/** Display rate string */
export const FEE_RATE_DISPLAY = '0.5%';

/**
 * Treasury address — EIP-55 checksummed.
 * Override via SAIKO_TREASURY_ADDRESS env var for deployment flexibility.
 * MUST NOT be changed at runtime or via remote config.
 */
export const FEE_RECIPIENT = process.env.SAIKO_TREASURY_ADDRESS || '0xbB54d3350e256D3660Ec35dc87FF52c18f541d6A';

if (!FEE_RECIPIENT.match(/^0x[0-9a-fA-F]{40}$/)) {
  throw new Error('Invalid FEE_RECIPIENT address');
}

// ─── Core calculation ─────────────────────────────────────────────────────────

export interface SwapFeeResult {
  /** Fee in token base units (floored — user is never overcharged) */
  readonly fee: bigint;
  /** Input amount minus fee — what actually gets routed to the DEX */
  readonly amountAfterFee: bigint;
}

/**
 * Calculate the Saiko Wallet swap fee.
 *
 * Rules:
 *  - Fee is floored (BigInt integer division is floor by default)
 *  - If fee rounds to 0 (dust), proceeds with full amount — no block
 *  - If amountAfterFee would be 0, caller should block the swap
 */
export function calculateSwapFee(inputAmount: bigint): SwapFeeResult {
  if (inputAmount < 0n) throw new RangeError('inputAmount must be non-negative');

  const fee = (inputAmount * FEE_BPS) / FEE_DENOMINATOR;
  const amountAfterFee = inputAmount - fee;
  return { fee, amountAfterFee };
}

/**
 * Returns true if the swap should be blocked because the input is so small
 * that the fee consumes 100% of it.
 */
export function isBelowMinimumSwapAmount(inputAmount: bigint): boolean {
  const { amountAfterFee } = calculateSwapFee(inputAmount);
  return amountAfterFee === 0n;
}
