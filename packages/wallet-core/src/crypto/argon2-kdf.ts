/**
 * Argon2id key derivation function.
 *
 * WHY Argon2id over PBKDF2 or bcrypt:
 * - Argon2id is memory-hard + time-hard, making GPU/ASIC brute-force attacks
 *   orders of magnitude more expensive than PBKDF2 (time-only) or bcrypt.
 * - Argon2id was the Password Hashing Competition winner (2015) and is
 *   recommended by NIST SP 800-63B for credential hashing.
 * - The 'id' variant combines Argon2i (side-channel resistance) and
 *   Argon2d (GPU resistance) for the best of both.
 *
 * Parameters per spec: memory=64MB, iterations=3, parallelism=4.
 * These are intentionally expensive — wallet unlock is a one-time operation,
 * not a hot path. Do NOT reduce these for "performance" on user devices.
 *
 * Standard: RFC 9106 (Argon2)
 */

import { argon2id } from 'hash-wasm';
import type { Argon2Params } from '../types/index.js';
import { secureRandom } from './secure-random.js';

/** Production Argon2id parameters. Tuned for wallet security, not speed. */
export const ARGON2_PARAMS: Argon2Params = {
  memoryKb: 65536, // 64 MB — memory-hard, expensive for GPUs
  iterations: 3, // Time cost — number of passes over memory
  parallelism: 4, // Parallelism factor — maps to CPU threads
  saltLength: 16, // 128-bit salt — unique per keystore
  keyLength: 32, // 256-bit output key for XSalsa20-Poly1305
};

/** Faster params for testing — never use in production! */
export const ARGON2_TEST_PARAMS: Argon2Params = {
  memoryKb: 1024, // 1 MB — fast enough for tests
  iterations: 1,
  parallelism: 1,
  saltLength: 16,
  keyLength: 32,
};

export interface KdfResult {
  readonly key: Uint8Array; // 32-byte derived key — zero-out after use!
  readonly salt: Uint8Array; // Salt used — store this in the keystore
}

/**
 * Derive a 256-bit encryption key from a passphrase using Argon2id.
 * Generates a fresh random salt on each call — never reuse salts.
 *
 * WHY we generate salt internally: Prevents callers from accidentally
 * reusing salts, which would break the security guarantees of the KDF.
 */
export async function deriveKey(
  passphrase: string,
  params: Argon2Params = ARGON2_PARAMS,
): Promise<KdfResult> {
  const salt = secureRandom(params.saltLength);
  const key = await deriveKeyWithSalt(passphrase, salt, params);
  return { key, salt };
}

/**
 * Derive a key using an existing salt (for decryption / unlock).
 * Called when the user enters their passphrase to unlock an existing keystore.
 */
export async function deriveKeyWithSalt(
  passphrase: string,
  salt: Uint8Array,
  params: Argon2Params = ARGON2_PARAMS,
): Promise<Uint8Array> {
  if (passphrase.length === 0) {
    throw new Error('Passphrase must not be empty');
  }

  // hash-wasm's argon2id returns a hex string by default.
  // We use outputType: 'binary' to get a Uint8Array directly.
  const result = await argon2id({
    password: passphrase,
    salt,
    parallelism: params.parallelism,
    iterations: params.iterations,
    memorySize: params.memoryKb,
    hashLength: params.keyLength,
    outputType: 'binary',
  });

  // hash-wasm returns ArrayBuffer in binary mode — wrap in Uint8Array
  return new Uint8Array(result);
}
