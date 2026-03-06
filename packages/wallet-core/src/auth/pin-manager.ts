/**
 * PIN manager — hash, verify, and validate wallet PINs.
 *
 * WHY Argon2id for PIN hashing: Even though PINs are rate-limited at the
 * application level, we still hash them with Argon2id (lighter params than
 * seed encryption). If the device storage is extracted, the attacker must
 * brute-force Argon2id to find the PIN — expensive even for a 6-digit space.
 *
 * WHY lighter Argon2id params than seed encryption: The seed passphrase can
 * be a long random phrase (very high entropy). A PIN is 6-10 digits (low entropy).
 * We compensate for low entropy via rate limiting in the app layer AND memory-hard
 * hashing. Using full seed params (64MB) would make PIN entry feel sluggish
 * on older devices — 19MB is the OWASP recommendation for interactive PIN hashing.
 *
 * WHY constant-time comparison: If PIN verification takes different time for
 * "almost correct" vs. "totally wrong" PINs, a timing attack can reveal the
 * correct PIN without triggering rate limits. Constant-time comparison
 * prevents this side channel.
 *
 * Duress PIN: A secondary PIN that opens a "decoy" wallet with minimal balance.
 * If the user is physically coerced, they enter the duress PIN. The attacker
 * sees a wallet but not the real one. The duress PIN differs by exactly one
 * digit to ensure it's plausible yet distinct.
 *
 * Standard: RFC 9106 (Argon2id), OWASP Authentication Cheat Sheet
 */

import { deriveKey, deriveKeyWithSalt } from '../crypto/argon2-kdf.js';
import { secureRandom } from '../crypto/secure-random.js';
import { wipeBytes } from '../crypto/memory-wipe.js';
import { PinError } from '../errors.js';
import type { Argon2Params } from '../types/index.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PinValidationResult {
  readonly isValid: boolean;
  readonly reason: string | null; // null if valid
}

export interface HashedPin {
  readonly hash: Uint8Array; // 32-byte Argon2id output — zero after use!
  readonly salt: Uint8Array; // 16-byte Argon2id salt — store this
}

// ─── KDF Parameters ───────────────────────────────────────────────────────────

/**
 * Argon2id params for PIN hashing.
 * Tuned per OWASP for interactive auth with rate limiting:
 * 19 MB memory, 2 iterations — balances security and latency on mobile.
 */
export const PIN_ARGON2_PARAMS: Argon2Params = {
  memoryKb: 19456, // 19 MB (OWASP recommendation for interactive PIN)
  iterations: 2,
  parallelism: 1, // Single-threaded for predictable mobile performance
  saltLength: 16,
  keyLength: 32,
};

/** Faster params for tests — NEVER use in production. */
export const PIN_ARGON2_TEST_PARAMS: Argon2Params = {
  memoryKb: 256,
  iterations: 1,
  parallelism: 1,
  saltLength: 16,
  keyLength: 32,
};

// ─── Constants ────────────────────────────────────────────────────────────────

/** Minimum PIN length (digits). */
const MIN_PIN_LENGTH = 6;

/** Maximum PIN length (digits). */
const MAX_PIN_LENGTH = 12;

/** Sequential digit runs that are too guessable. */
const SEQUENTIAL_ASCENDING = '0123456789';
const SEQUENTIAL_DESCENDING = '9876543210';

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Hash a PIN using Argon2id with a fresh random salt.
 *
 * Returns both hash and salt — store the salt alongside the hash,
 * and zero out the hash after storing it securely.
 *
 * @param pin    - The PIN string (must be numeric, validated separately)
 * @param params - Argon2id parameters (use PIN_ARGON2_PARAMS in production)
 */
export async function hashPin(
  pin: string,
  params: Argon2Params = PIN_ARGON2_PARAMS,
): Promise<HashedPin> {
  if (pin.length === 0) {
    throw new PinError('PIN must not be empty');
  }

  const { key: hash, salt } = await deriveKey(pin, params);
  return { hash, salt };
}

/**
 * Hash a PIN using a KNOWN salt (for verification — re-derives the same hash).
 *
 * @param pin    - The PIN to hash
 * @param salt   - The stored salt (from the original hashPin call)
 * @param params - Same Argon2id parameters used during hashing
 */
export async function hashPinWithSalt(
  pin: string,
  salt: Uint8Array,
  params: Argon2Params = PIN_ARGON2_PARAMS,
): Promise<Uint8Array> {
  if (pin.length === 0) {
    throw new PinError('PIN must not be empty');
  }
  return deriveKeyWithSalt(pin, salt, params);
}

/**
 * Verify a PIN against a stored hash using constant-time comparison.
 *
 * WHY constant-time: Even though the attacker can only try one PIN at a time
 * (rate limited), we defend in depth. Timing attacks in the verification step
 * would be valuable to an attacker who can make many rapid local verification
 * attempts (e.g., after extracting the hash from storage).
 *
 * @param pin          - PIN entered by user
 * @param salt         - Stored salt (from original hashPin)
 * @param expectedHash - Stored hash (from original hashPin)
 * @param params       - Argon2id parameters used during original hashing
 * @returns true if PIN matches, false otherwise (never throws on mismatch)
 */
export async function verifyPin(
  pin: string,
  salt: Uint8Array,
  expectedHash: Uint8Array,
  params: Argon2Params = PIN_ARGON2_PARAMS,
): Promise<boolean> {
  if (pin.length === 0) return false;

  let derivedHash: Uint8Array | null = null;
  try {
    derivedHash = await hashPinWithSalt(pin, salt, params);
    return constantTimeEqual(derivedHash, expectedHash);
  } finally {
    if (derivedHash !== null) {
      wipeBytes(derivedHash);
    }
  }
}

/**
 * Validate PIN strength before accepting it.
 * Returns { isValid: true, reason: null } for a strong PIN.
 * Returns { isValid: false, reason: string } with a user-friendly explanation.
 *
 * Rules:
 *   - Must be 6–12 digits
 *   - Must contain only digits (0-9)
 *   - Must not be all the same digit (000000, 111111, etc.)
 *   - Must not be a sequential run (123456, 654321, etc.)
 */
export function validatePinStrength(pin: string): PinValidationResult {
  // Length check
  if (pin.length < MIN_PIN_LENGTH) {
    return {
      isValid: false,
      reason: `PIN must be at least ${MIN_PIN_LENGTH} digits long. Yours has ${pin.length}.`,
    };
  }

  if (pin.length > MAX_PIN_LENGTH) {
    return {
      isValid: false,
      reason: `PIN must not exceed ${MAX_PIN_LENGTH} digits. Yours has ${pin.length}.`,
    };
  }

  // Digits-only check
  if (!/^\d+$/.test(pin)) {
    return {
      isValid: false,
      reason: 'PIN must contain only digits (0–9).',
    };
  }

  // All-same-digit check (000000, 111111, ...)
  if (/^(\d)\1+$/.test(pin)) {
    return {
      isValid: false,
      reason: `"${pin}" is too simple — all digits are the same. Choose a less predictable PIN.`,
    };
  }

  // Sequential ascending check (123456, 234567, ...)
  if (SEQUENTIAL_ASCENDING.includes(pin)) {
    return {
      isValid: false,
      reason: `"${pin}" is a sequential PIN and too guessable. Choose a less predictable PIN.`,
    };
  }

  // Sequential descending check (654321, 987654, ...)
  if (SEQUENTIAL_DESCENDING.includes(pin)) {
    return {
      isValid: false,
      reason: `"${pin}" is a reverse-sequential PIN and too guessable. Choose a less predictable PIN.`,
    };
  }

  return { isValid: true, reason: null };
}

/**
 * Generate a duress PIN that differs from the real PIN by exactly one digit.
 *
 * WHY "exactly one digit different": The duress PIN must be:
 *   1. Easy to remember under stress (minimal difference from real PIN)
 *   2. Clearly distinct from the real PIN (different enough to route differently)
 *   3. Plausible as a real PIN (doesn't look like a trap)
 *
 * WHY random position: If the position were always the same (e.g., always
 * flip the last digit), an adversary who knows the scheme could infer
 * the real PIN by trying adjacent values.
 *
 * @param realPin - The real PIN (must pass validatePinStrength)
 * @returns A duress PIN that differs by exactly one digit at a random position
 */
export function createDuressPin(realPin: string): string {
  const validation = validatePinStrength(realPin);
  if (!validation.isValid) {
    throw new PinError(
      `Cannot create duress PIN from invalid real PIN: ${validation.reason ?? 'unknown reason'}`,
    );
  }

  const digits = realPin.split('').map(Number);

  // Pick a random position to flip
  const positionBytes = secureRandom(1);
  const position = positionBytes[0]! % digits.length;

  const originalDigit = digits[position]!;

  // Pick a different digit at the chosen position using secure random
  // Loop until we get a digit that's different from the original
  let newDigit: number;
  do {
    const randomByte = secureRandom(1);
    newDigit = randomByte[0]! % 10;
  } while (newDigit === originalDigit);

  const duressDigits = [...digits];
  duressDigits[position] = newDigit;
  return duressDigits.join('');
}

// ─── Internal Helpers ─────────────────────────────────────────────────────────

/**
 * Constant-time byte array comparison.
 *
 * WHY not === or Buffer.compare: Both can short-circuit on the first
 * differing byte, creating timing variance proportional to the number of
 * matching prefix bytes. An attacker measuring nanosecond timing differences
 * could determine how many bytes of a hash match their guess.
 *
 * This implementation processes every byte regardless of early mismatch,
 * ensuring the execution time is independent of the data.
 */
function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;

  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    // XOR is 0 iff the bytes are equal. OR accumulates any difference.
    diff |= a[i]! ^ b[i]!;
  }
  // diff === 0 iff all bytes were equal
  return diff === 0;
}
