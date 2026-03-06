/**
 * Symmetric encryption using libsodium secretbox (XSalsa20-Poly1305).
 *
 * WHY XSalsa20-Poly1305 over AES-GCM:
 * - libsodium is one of the most audited crypto libraries in existence
 * - XSalsa20 uses a 192-bit nonce (vs 96-bit for AES-GCM) making nonce
 *   collision practically impossible even with random nonce generation
 * - Poly1305 authentication prevents ciphertext tampering attacks
 * - libsodium's API makes it hard to misuse (nonce generation, MAC included)
 *
 * Flow:
 *   Passphrase → Argon2id → 32-byte key → secretbox.seal(plaintext, nonce, key)
 *   → EncryptedKeystore {ciphertext, nonce, salt, kdfParams}
 *
 * The key is NEVER stored — only the salt and ciphertext.
 * The user must re-derive the key from their passphrase each unlock.
 *
 * Standard: NaCl/libsodium secretbox (XSalsa20-Poly1305)
 */

import sodium from 'libsodium-wrappers';
import type { EncryptedKeystore } from '../types/index.js';
import { ARGON2_PARAMS, ARGON2_TEST_PARAMS, deriveKey, deriveKeyWithSalt } from './argon2-kdf.js';
import { wipeBytes } from './memory-wipe.js';
import { EncryptionError, DecryptionError } from '../errors.js';
import type { Argon2Params } from '../types/index.js';

/** Ensure libsodium WASM is loaded before any crypto ops. */
async function getSodium(): Promise<typeof sodium> {
  await sodium.ready;
  return sodium;
}

/**
 * Encrypt a plaintext payload (e.g. seed phrase or private key) with a passphrase.
 *
 * @param plaintext - UTF-8 string or raw bytes to encrypt
 * @param passphrase - User's passphrase (min 1 char, validated externally)
 * @param kdfParams  - Argon2id parameters (use ARGON2_PARAMS in prod)
 * @returns EncryptedKeystore ready to persist to disk/DB
 */
export async function encryptPayload(
  plaintext: string | Uint8Array,
  passphrase: string,
  kdfParams: Argon2Params = ARGON2_PARAMS,
): Promise<EncryptedKeystore> {
  const lib = await getSodium();

  const plaintextBytes =
    typeof plaintext === 'string' ? new TextEncoder().encode(plaintext) : plaintext;

  // Derive encryption key (fresh salt each time — never reuse salts)
  let key: Uint8Array;
  let salt: Uint8Array;
  try {
    const kdfResult = await deriveKey(passphrase, kdfParams);
    key = kdfResult.key;
    salt = kdfResult.salt;
  } catch (err) {
    throw new EncryptionError('Key derivation failed during encryption', err);
  }

  let ciphertext: Uint8Array;
  let nonce: Uint8Array;
  try {
    nonce = lib.randombytes_buf(lib.crypto_secretbox_NONCEBYTES);
    // secretbox produces MAC-authenticated ciphertext (Poly1305 tag prepended)
    ciphertext = lib.crypto_secretbox_easy(plaintextBytes, nonce, key);
  } catch (err) {
    throw new EncryptionError('Encryption failed', err);
  } finally {
    // Zero the key — we only store ciphertext + salt
    wipeBytes(key);
  }

  return {
    version: 1,
    ciphertext: Buffer.from(ciphertext).toString('base64'),
    nonce: Buffer.from(nonce).toString('base64'),
    salt: Buffer.from(salt).toString('base64'),
    kdfParams: {
      algorithm: 'argon2id',
      memoryKb: kdfParams.memoryKb,
      iterations: kdfParams.iterations,
      parallelism: kdfParams.parallelism,
    },
  };
}

/**
 * Decrypt an EncryptedKeystore with the user's passphrase.
 * Returns the plaintext as a Uint8Array — caller MUST wipe it after use.
 *
 * WHY we return Uint8Array not string: Forces callers to explicitly handle
 * sensitive material (they must decode it and then wipe both the raw bytes
 * and any derived strings).
 */
export async function decryptPayload(
  keystore: EncryptedKeystore,
  passphrase: string,
  kdfParams: Argon2Params = ARGON2_PARAMS,
): Promise<Uint8Array> {
  const lib = await getSodium();

  const ciphertextBytes = Buffer.from(keystore.ciphertext, 'base64');
  const nonceBytes = Buffer.from(keystore.nonce, 'base64');
  const saltBytes = Buffer.from(keystore.salt, 'base64');

  // Re-derive the key from the passphrase + stored salt
  let key: Uint8Array;
  try {
    key = await deriveKeyWithSalt(passphrase, saltBytes, kdfParams);
  } catch (err) {
    throw new DecryptionError('Key derivation failed during decryption', err);
  }

  let plaintext: Uint8Array | null;
  try {
    plaintext = lib.crypto_secretbox_open_easy(ciphertextBytes, nonceBytes, key);
  } catch (err) {
    throw new DecryptionError(
      'Decryption failed — wrong passphrase or corrupted data',
      err,
    );
  } finally {
    wipeBytes(key);
  }

  if (plaintext === null) {
    throw new DecryptionError(
      'Decryption failed — authentication tag invalid. Wrong passphrase or tampered data.',
    );
  }

  return plaintext;
}

/**
 * Encrypt using fast test params. ONLY FOR TESTS — never call in production.
 * WHY: Argon2id with production params takes ~2s per operation, making tests
 * too slow if we encrypt/decrypt in every test case.
 */
export async function encryptPayloadFast(
  plaintext: string | Uint8Array,
  passphrase: string,
): Promise<EncryptedKeystore> {
  return encryptPayload(plaintext, passphrase, ARGON2_TEST_PARAMS);
}

/**
 * Decrypt using fast test params. ONLY FOR TESTS.
 */
export async function decryptPayloadFast(
  keystore: EncryptedKeystore,
  passphrase: string,
): Promise<Uint8Array> {
  return decryptPayload(keystore, passphrase, ARGON2_TEST_PARAMS);
}
