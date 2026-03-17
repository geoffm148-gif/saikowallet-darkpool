/**
 * Address poisoning detection.
 *
 * WHY this matters: A common attack sends tiny transactions from addresses
 * that look identical to the victim's contacts — same first 4 and last 4
 * characters but different middle bytes. When the victim copies an address
 * from their transaction history, they may accidentally select the poisoned
 * address instead of the real one.
 *
 * Detection strategy:
 *   1. Normalize addresses (lowercase, strip 0x prefix)
 *   2. Compare prefix (first N chars) and suffix (last N chars)
 *   3. If prefix+suffix match but the full address doesn't → suspicious
 *   4. Compute a similarity score for UI ranking
 */

import { getAddress, isAddress } from 'ethers';
import { InvalidAddressError } from '../errors.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PoisoningCheckResult {
  readonly isPoisoned: boolean;
  readonly suspiciousAddress: string;
  readonly similarTo: string | null; // The known address it resembles
  readonly similarityScore: number; // 0.0–1.0
  readonly warning: string | null;
}

// ─── Constants ────────────────────────────────────────────────────────────────

/**
 * Number of hex characters to compare at each end for prefix/suffix matching.
 * 4 chars = 2 bytes. Attackers typically match first 4 + last 4 chars.
 */
const MATCH_CHARS = 4;

/**
 * Similarity score threshold above which an address is flagged as suspicious.
 * 0.8 = matching first 4 + last 4 chars out of 40 total hex chars.
 */
const POISONING_SCORE_THRESHOLD = 0.7;

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Check whether a given address resembles any known contact address
 * in a way that suggests an address poisoning attack.
 *
 * WHY we check both prefix AND suffix: Attackers generate vanity addresses
 * with matching prefix + suffix because that's what users scan visually.
 * An address that differs only in the middle is extremely suspicious.
 */
export function detectPoisoning(
  address: string,
  knownAddresses: readonly string[],
): PoisoningCheckResult {
  validateEthereumAddress(address);

  const normalizedAddress = normalize(address);

  let highestScore = 0;
  let mostSimilar: string | null = null;

  for (const known of knownAddresses) {
    if (!isAddress(known)) continue;

    const normalizedKnown = normalize(known);

    // Exact match — this IS the known address, not a poisoned one
    if (normalizedAddress === normalizedKnown) {
      return {
        isPoisoned: false,
        suspiciousAddress: getAddress(address),
        similarTo: null,
        similarityScore: 1.0,
        warning: null,
      };
    }

    const score = calculateAddressSimilarity(address, known);
    if (score > highestScore) {
      highestScore = score;
      mostSimilar = getAddress(known);
    }
  }

  // Flag as poisoned if prefix+suffix match a known address
  const isPoisoned = highestScore >= POISONING_SCORE_THRESHOLD && mostSimilar !== null;

  const warning = isPoisoned
    ? `Warning: This address looks similar to your known contact ${mostSimilar}. ` +
      'This may be an address poisoning attack. Verify every character before sending.'
    : null;

  return {
    isPoisoned,
    suspiciousAddress: getAddress(address),
    similarTo: mostSimilar,
    similarityScore: highestScore,
    warning,
  };
}

/**
 * Calculate a similarity score between two Ethereum addresses.
 * Returns a value in [0, 1] where 1.0 = identical.
 *
 * Scoring logic:
 * - Matching prefix characters contribute proportionally
 * - Matching suffix characters contribute proportionally
 * - Matching middle characters also contribute but with less weight
 *   (attackers don't target the middle)
 *
 * WHY weighted prefix+suffix: Users scan the first and last 4–6 chars
 * of an address. An attacker exploiting this will match those chars exactly.
 * We give extra weight to prefix/suffix matches to catch this attack pattern.
 */
export function calculateAddressSimilarity(a: string, b: string): number {
  if (!isAddress(a) || !isAddress(b)) return 0;

  const normA = normalize(a);
  const normB = normalize(b);

  if (normA === normB) return 1.0;

  const totalChars = normA.length; // 40 hex chars

  // Count matching prefix characters
  let prefixMatches = 0;
  for (let i = 0; i < MATCH_CHARS && i < totalChars; i++) {
    if (normA[i] === normB[i]) prefixMatches++;
    else break; // Prefix match must be contiguous
  }

  // Count matching suffix characters (from the end)
  let suffixMatches = 0;
  for (let i = 0; i < MATCH_CHARS && i < totalChars; i++) {
    const posA = totalChars - 1 - i;
    const posB = totalChars - 1 - i;
    if (normA[posA] === normB[posB]) suffixMatches++;
    else break; // Suffix match must be contiguous
  }

  // Count matching characters in the middle
  let middleMatches = 0;
  const middleStart = MATCH_CHARS;
  const middleEnd = totalChars - MATCH_CHARS;
  for (let i = middleStart; i < middleEnd; i++) {
    if (normA[i] === normB[i]) middleMatches++;
  }
  const middleLength = Math.max(1, middleEnd - middleStart);

  // Weight: prefix (35%) + suffix (35%) + middle (30%)
  const prefixScore = prefixMatches / MATCH_CHARS;
  const suffixScore = suffixMatches / MATCH_CHARS;
  const middleScore = middleMatches / middleLength;

  return prefixScore * 0.35 + suffixScore * 0.35 + middleScore * 0.30;
}

/**
 * Check if two addresses match on prefix + suffix (the poisoning signature).
 * This is the core heuristic — returns true even if similarity < threshold
 * so callers can implement their own thresholds.
 */
export function hasPrefixSuffixMatch(a: string, b: string, matchChars = MATCH_CHARS): boolean {
  if (!isAddress(a) || !isAddress(b)) return false;

  const normA = normalize(a);
  const normB = normalize(b);

  if (normA === normB) return false; // Same address, not a match

  const prefix = normA.slice(0, matchChars) === normB.slice(0, matchChars);
  const suffix = normA.slice(-matchChars) === normB.slice(-matchChars);

  return prefix && suffix;
}

// ─── Internal Helpers ─────────────────────────────────────────────────────────

/** Normalize an Ethereum address: lowercase without 0x prefix. */
function normalize(address: string): string {
  return address.toLowerCase().replace(/^0x/, '');
}

function validateEthereumAddress(address: string): void {
  if (!isAddress(address)) {
    throw new InvalidAddressError(address, 'not a valid Ethereum address');
  }
}
