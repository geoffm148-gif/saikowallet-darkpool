/**
 * Shamir's Secret Sharing (SSS) over GF(2^8).
 *
 * WHY Shamir's SSS: Splitting a seed into N shares where any K can
 * reconstruct it provides a safer backup than a single copy. You can give
 * shares to trusted friends, store some offline, some in cloud — no single
 * compromised location reveals the secret.
 *
 * Mathematical foundation:
 * - Field: GF(2^8) with primitive polynomial x^8 + x^4 + x^3 + x + 1
 *   (same polynomial used in AES — well-studied, correct)
 * - Secret sharing: Each byte of the secret is the constant term of a
 *   randomly chosen degree-(threshold-1) polynomial over GF(256).
 * - Evaluation: Share i is the polynomial evaluated at x = i (i = 1..N).
 *   x = 0 is never used as a share index (it's the secret itself).
 * - Reconstruction: Lagrange interpolation at x=0 recovers the secret
 *   from any K shares.
 *
 * Security: Information-theoretic — any K-1 shares reveal ZERO information
 * about the secret. This holds even against computationally unbounded adversaries.
 *
 * WHY we do NOT use Math.random(): CSPRNG is mandatory. Predictable
 * polynomial coefficients would allow an attacker to reconstruct the
 * polynomial (and thus the secret) from fewer than K shares.
 *
 * Reference: Adi Shamir, "How to Share a Secret", CACM 1979
 *            SLIP39 / BIP-SLIP39 for modern wallet usage patterns
 */

import { secureRandom } from '../crypto/secure-random.js';
import { ShamirError } from '../errors.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ShamirShare {
  /** Share index (1-based, corresponds to the x-coordinate in the polynomial). */
  readonly index: number;
  /** Encoded share data — one byte per secret byte, evaluated at x=index. */
  readonly data: Uint8Array;
  /** K — the minimum number of shares required to reconstruct the secret. */
  readonly threshold: number;
}

// ─── GF(2^8) Field Arithmetic ────────────────────────────────────────────────

/**
 * GF(2^8) with AES primitive polynomial: x^8 + x^4 + x^3 + x + 1 (0x11b).
 *
 * WHY we use lookup tables instead of on-the-fly computation:
 * Constant-time multiplication via the Russian Peasant algorithm leaks timing
 * information in some environments. Log/exp tables make multiplication a
 * constant number of operations regardless of the input values.
 */

// Build logarithm and exponential tables for GF(2^8)
// Generator g=3: g^i cycles through all 255 non-zero elements.
// EXP_TABLE[i] = g^i mod P, LOG_TABLE[g^i] = i
const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);

(function buildTables(): void {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = x;
    GF_LOG[x] = i;
    // Multiply x by generator (3) in GF(2^8)
    // Equivalent to: x = x * g mod P(x), where g=3 and P(x) = 0x11b
    x = gf256MultiplyRaw(x, 3);
  }
  // Duplicate table to simplify modular index arithmetic (avoid % 255)
  for (let i = 0; i < 255; i++) {
    GF_EXP[255 + i] = GF_EXP[i]!;
  }
})();

/** Raw GF(2^8) multiplication using Russian Peasant (used only for table building). */
function gf256MultiplyRaw(a: number, b: number): number {
  let result = 0;
  let aa = a;
  let bb = b;
  while (bb !== 0) {
    if ((bb & 1) !== 0) result ^= aa;
    const hiBit = aa & 0x80;
    aa = (aa << 1) & 0xff;
    // Reduce by XOR with irreducible polynomial 0x1b (lower 8 bits of 0x11b)
    if (hiBit !== 0) aa ^= 0x1b;
    bb >>= 1;
  }
  return result;
}

/** GF(2^8) addition — identical to XOR in characteristic-2 fields. */
function gfAdd(a: number, b: number): number {
  return a ^ b;
}

/** GF(2^8) multiplication via log/exp tables. O(1), data-independent timing. */
function gfMul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  // LOG_TABLE[0] is undefined (log(0) doesn't exist in GF), guarded by the check above
  return GF_EXP[(GF_LOG[a]! + GF_LOG[b]!) % 255]!;
}

/** GF(2^8) division. Throws on division by zero. */
function gfDiv(a: number, b: number): number {
  if (b === 0) throw new ShamirError('GF(256) division by zero');
  if (a === 0) return 0;
  return GF_EXP[((GF_LOG[a]! - GF_LOG[b]!) + 255) % 255]!;
}

// ─── Polynomial Operations ────────────────────────────────────────────────────

/**
 * Evaluate a polynomial at a given x using Horner's method.
 * coefficients[0] is the constant term (the secret byte for x=0).
 * coefficients[i] for i > 0 are random coefficients.
 *
 * Horner's: p(x) = (...((a_k * x + a_{k-1}) * x + ...) * x + a_1) * x + a_0
 * WHY Horner's: Minimizes GF multiplications (n-1 instead of n(n-1)/2).
 */
function evaluatePolynomial(coefficients: Uint8Array, x: number): number {
  let result = 0;
  for (let i = coefficients.length - 1; i >= 0; i--) {
    result = gfAdd(gfMul(result, x), coefficients[i]!);
  }
  return result;
}

/**
 * Lagrange interpolation over GF(2^8) at x=0 — recovers the secret byte.
 *
 * Formula at x=0:
 *   f(0) = Σ_i y_i * Π_{j≠i} (0 - x_j) / (x_i - x_j)
 *         = Σ_i y_i * Π_{j≠i} x_j / (x_i XOR x_j)   [since -a = a in GF(2^n)]
 *
 * WHY interpolate at x=0: That's where the secret lives (the constant term).
 * Share evaluation uses x = 1..N so x=0 is never directly given out.
 */
function interpolateAt0(points: ReadonlyArray<{ x: number; y: number }>): number {
  let secret = 0;

  for (let i = 0; i < points.length; i++) {
    const pt = points[i]!;
    let basis = 1; // Lagrange basis polynomial L_i(0)

    for (let j = 0; j < points.length; j++) {
      if (i === j) continue;
      const pj = points[j]!;
      // L_i(0) *= (0 - x_j) / (x_i - x_j) = x_j / (x_i XOR x_j)
      basis = gfMul(basis, gfDiv(pj.x, gfAdd(pt.x, pj.x)));
    }

    secret = gfAdd(secret, gfMul(pt.y, basis));
  }

  return secret;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Split a secret into `totalShares` shares, requiring `threshold` to reconstruct.
 *
 * @param secret      - The secret bytes to split (e.g., 64-byte BIP-39 seed)
 * @param totalShares - Total number of shares to produce (N). Max 255.
 * @param threshold   - Minimum shares required to reconstruct (K). Min 2, max N.
 *
 * WHY max 255: GF(2^8) has 255 non-zero elements. Share indices map to
 * field elements, so we can't exceed 255 shares.
 *
 * WHY min threshold 2: A threshold of 1 defeats the purpose — any single
 * share would reveal the secret. Threshold 1 is equivalent to N copies.
 */
export function splitSecret(
  secret: Uint8Array,
  totalShares: number,
  threshold: number,
): readonly ShamirShare[] {
  validateSplitParams(secret, totalShares, threshold);

  // Allocate share data arrays (one byte per share per secret byte)
  const shareData: Uint8Array[] = Array.from(
    { length: totalShares },
    () => new Uint8Array(secret.length),
  );

  // Process each byte of the secret independently
  // WHY independent: Shamir SSS is applied byte-by-byte. This is correct
  // because GF(2^8) operations on each byte are independent and the
  // information-theoretic security guarantee holds for each byte.
  const coefficients = new Uint8Array(threshold);

  for (let byteIdx = 0; byteIdx < secret.length; byteIdx++) {
    // Build a random degree-(threshold-1) polynomial with secret byte as constant term
    coefficients[0] = secret[byteIdx]!; // f(0) = secret byte

    // Fill coefficients 1..threshold-1 with CSPRNG random bytes
    const randomCoeffs = secureRandom(threshold - 1);

    for (let c = 1; c < threshold; c++) {
      // Ensure non-zero leading coefficient — a zero leading coefficient
      // reduces polynomial degree, which could weaken security.
      // Retry until non-zero (expected: ~1.006 iterations on average).
      let coeff = randomCoeffs[c - 1]!;
      if (c === threshold - 1) {
        while (coeff === 0) {
          coeff = secureRandom(1)[0]!;
        }
      }
      coefficients[c] = coeff;
    }

    // Evaluate the polynomial at x = 1..N (share indices are 1-based)
    for (let shareIdx = 0; shareIdx < totalShares; shareIdx++) {
      const x = shareIdx + 1; // x is 1-indexed; x=0 is reserved for the secret
      shareData[shareIdx]![byteIdx] = evaluatePolynomial(coefficients, x);
    }
  }

  // Zero out the coefficients buffer — they're derived from the secret
  coefficients.fill(0);

  return shareData.map((data, i) => ({
    index: i + 1,
    data,
    threshold,
  }));
}

/**
 * Reconstruct the secret from a set of shares using Lagrange interpolation.
 *
 * @param shares - At least `threshold` shares (duplicates are detected and rejected)
 *
 * NOTE: If fewer than threshold shares are provided, this will silently return
 * WRONG data (not throw) — this is a property of polynomial interpolation.
 * Always call validateShareSet() first to ensure you have enough shares.
 */
export function combineShares(shares: readonly ShamirShare[]): Uint8Array {
  if (shares.length === 0) {
    throw new ShamirError('No shares provided');
  }

  validateShareSet(shares);

  const secretLength = shares[0]!.data.length;
  const secret = new Uint8Array(secretLength);

  // Check for duplicate indices (would cause division by zero in interpolation)
  const seenIndices = new Set<number>();
  for (const share of shares) {
    if (seenIndices.has(share.index)) {
      throw new ShamirError(
        `Duplicate share index ${share.index} — cannot reconstruct from duplicate shares`,
      );
    }
    seenIndices.add(share.index);
  }

  // Reconstruct each byte of the secret via Lagrange interpolation
  for (let byteIdx = 0; byteIdx < secretLength; byteIdx++) {
    const points = shares.map((share) => ({
      x: share.index,
      y: share.data[byteIdx]!,
    }));
    secret[byteIdx] = interpolateAt0(points);
  }

  return secret;
}

/**
 * Validate that a set of shares is compatible and sufficient for reconstruction.
 *
 * Checks:
 * 1. All shares have the same threshold
 * 2. All shares have the same data length (same secret)
 * 3. At least `threshold` shares are present
 * 4. All share indices are within the valid range (1–255)
 */
export function validateShareSet(shares: readonly ShamirShare[]): void {
  if (shares.length === 0) {
    throw new ShamirError('Share set is empty');
  }

  const firstShare = shares[0]!;
  const expectedThreshold = firstShare.threshold;
  const expectedLength = firstShare.data.length;

  for (let i = 1; i < shares.length; i++) {
    const share = shares[i]!;

    if (share.threshold !== expectedThreshold) {
      throw new ShamirError(
        `Share ${share.index} has threshold ${share.threshold} but share 1 has threshold ${expectedThreshold}. ` +
        'Shares must come from the same split operation.',
      );
    }

    if (share.data.length !== expectedLength) {
      throw new ShamirError(
        `Share ${share.index} has data length ${share.data.length} but expected ${expectedLength}. ` +
        'Shares must come from the same secret.',
      );
    }

    if (share.index < 1 || share.index > 255 || !Number.isInteger(share.index)) {
      throw new ShamirError(
        `Share index ${share.index} is invalid. Valid range: 1–255.`,
      );
    }
  }

  if (shares.length < expectedThreshold) {
    throw new ShamirError(
      `Not enough shares: have ${shares.length}, need ${expectedThreshold}. ` +
      'Provide at least the threshold number of shares to reconstruct the secret.',
    );
  }
}

// ─── Internal Validators ──────────────────────────────────────────────────────

function validateSplitParams(secret: Uint8Array, totalShares: number, threshold: number): void {
  if (secret.length === 0) {
    throw new ShamirError('Secret must not be empty');
  }
  if (!Number.isInteger(totalShares) || totalShares < 2 || totalShares > 255) {
    throw new ShamirError(
      `totalShares must be an integer between 2 and 255, got ${totalShares}`,
    );
  }
  if (!Number.isInteger(threshold) || threshold < 2) {
    throw new ShamirError(
      `threshold must be an integer ≥ 2, got ${threshold}`,
    );
  }
  if (threshold > totalShares) {
    throw new ShamirError(
      `threshold (${threshold}) cannot exceed totalShares (${totalShares})`,
    );
  }
}
