/**
 * Encrypted seed backup — export and restore wallet seeds.
 *
 * WHY a separate backup format from the in-wallet keystore:
 * The EncryptedKeystore in crypto/encryption.ts is the live, on-device storage
 * format. The EncryptedBackup is an export format intended for cold storage —
 * written to a USB stick, printed as QR, or sent to cloud backup. It carries
 * additional metadata (creation timestamp, version, format) to ensure the
 * user can always understand and restore it, even years later.
 *
 * Encryption: libsodium secretbox (XSalsa20-Poly1305) with Argon2id KDF.
 * WHY the same as the keystore: Consistency of cryptographic choices reduces
 * the attack surface. Both formats are auditable together.
 *
 * Standard: NaCl/libsodium secretbox, RFC 9106 (Argon2id)
 */

import sodium from 'libsodium-wrappers';
import { ARGON2_TEST_PARAMS, deriveKey, deriveKeyWithSalt } from '../crypto/argon2-kdf.js';
import { wipeBytes } from '../crypto/memory-wipe.js';
import { BackupError, RestoreError } from '../errors.js';
import type { Argon2Params } from '../types/index.js';

// ─── Types ────────────────────────────────────────────────────────────────────

/** Current backup format version. Increment on breaking format changes. */
const BACKUP_FORMAT_VERSION = 1 as const;

export interface EncryptedBackup {
  /** Format version for forward-compatibility checks. */
  readonly version: typeof BACKUP_FORMAT_VERSION;
  /** Base64-encoded XSalsa20-Poly1305 ciphertext (includes 16-byte MAC). */
  readonly ciphertext: string;
  /** Base64-encoded 24-byte XSalsa20-Poly1305 nonce. */
  readonly nonce: string;
  /** Base64-encoded Argon2id salt (16 bytes). */
  readonly salt: string;
  /** Argon2id parameters used for this backup. */
  readonly kdfParams: {
    readonly algorithm: 'argon2id';
    readonly memoryKb: number;
    readonly iterations: number;
    readonly parallelism: number;
  };
  /** Unix millisecond timestamp when this backup was created. */
  readonly createdAt: number;
  /** Optional user-defined hint (NOT the passphrase — just a memory aid). */
  readonly hint?: string;
}

// ─── KDF Parameters ───────────────────────────────────────────────────────────

/**
 * Production Argon2id parameters for backups.
 * Slightly stronger than the interactive unlock parameters since backup
 * decryption is a rare, user-initiated event — latency is acceptable.
 */
export const BACKUP_ARGON2_PARAMS: Argon2Params = {
  memoryKb: 65536, // 64 MB
  iterations: 3,
  parallelism: 4,
  saltLength: 16,
  keyLength: 32,
};

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Encrypt a wallet seed with a user-provided passphrase.
 *
 * @param seed       - The raw seed bytes (64 bytes from BIP-39 derivation)
 *                     IMPORTANT: caller must wipe this after calling.
 * @param passphrase - User's backup passphrase (separate from wallet passphrase)
 * @param hint       - Optional memory aid (e.g., "the phrase from my notebook")
 * @param kdfParams  - Override Argon2id params (use BACKUP_ARGON2_PARAMS in prod)
 *
 * WHY separate passphrase: Using the same passphrase for backup and daily
 * unlock means compromising either also compromises both. A distinct backup
 * passphrase provides defense-in-depth.
 */
export async function createEncryptedBackup(
  seed: Uint8Array,
  passphrase: string,
  hint?: string,
  kdfParams: Argon2Params = BACKUP_ARGON2_PARAMS,
): Promise<EncryptedBackup> {
  if (seed.length === 0) {
    throw new BackupError('Seed must not be empty');
  }
  if (passphrase.length === 0) {
    throw new BackupError('Backup passphrase must not be empty');
  }

  await sodium.ready;

  let key: Uint8Array;
  let salt: Uint8Array;
  try {
    const kdfResult = await deriveKey(passphrase, kdfParams);
    key = kdfResult.key;
    salt = kdfResult.salt;
  } catch (err) {
    throw new BackupError('Key derivation failed during backup creation', err);
  }

  let ciphertext: Uint8Array;
  let nonce: Uint8Array;
  try {
    nonce = sodium.randombytes_buf(sodium.crypto_secretbox_NONCEBYTES);
    ciphertext = sodium.crypto_secretbox_easy(seed, nonce, key);
  } catch (err) {
    throw new BackupError('Encryption failed during backup creation', err);
  } finally {
    wipeBytes(key);
  }

  const backup: EncryptedBackup = {
    version: BACKUP_FORMAT_VERSION,
    ciphertext: Buffer.from(ciphertext).toString('base64'),
    nonce: Buffer.from(nonce).toString('base64'),
    salt: Buffer.from(salt).toString('base64'),
    kdfParams: {
      algorithm: 'argon2id',
      memoryKb: kdfParams.memoryKb,
      iterations: kdfParams.iterations,
      parallelism: kdfParams.parallelism,
    },
    createdAt: Date.now(),
    ...(hint !== undefined && hint.length > 0 ? { hint } : {}),
  };

  return backup;
}

/**
 * Decrypt a backup and return the raw seed bytes.
 *
 * Returns a Uint8Array — caller MUST wipe it after use with wipeBytes().
 * Throwing errors here is intentional — a failed restore must surface
 * immediately, not silently return garbage.
 */
export async function restoreFromBackup(
  backup: EncryptedBackup,
  passphrase: string,
): Promise<Uint8Array> {
  if (backup.version !== BACKUP_FORMAT_VERSION) {
    throw new RestoreError(
      `Unsupported backup format version: ${backup.version}. ` +
      `Expected version ${BACKUP_FORMAT_VERSION}. Update the app to restore this backup.`,
    );
  }

  if (passphrase.length === 0) {
    throw new RestoreError('Passphrase must not be empty');
  }

  await sodium.ready;

  const kdfParams: Argon2Params = {
    memoryKb: backup.kdfParams.memoryKb,
    iterations: backup.kdfParams.iterations,
    parallelism: backup.kdfParams.parallelism,
    saltLength: 16,
    keyLength: 32,
  };

  let ciphertextBytes: Uint8Array;
  let nonceBytes: Uint8Array;
  let saltBytes: Uint8Array;
  try {
    ciphertextBytes = Buffer.from(backup.ciphertext, 'base64');
    nonceBytes = Buffer.from(backup.nonce, 'base64');
    saltBytes = Buffer.from(backup.salt, 'base64');
  } catch (err) {
    throw new RestoreError('Backup data is corrupted — base64 decode failed', err);
  }

  let key: Uint8Array;
  try {
    key = await deriveKeyWithSalt(passphrase, saltBytes, kdfParams);
  } catch (err) {
    throw new RestoreError('Key derivation failed during restore', err);
  }

  let seed: Uint8Array | null;
  try {
    seed = sodium.crypto_secretbox_open_easy(ciphertextBytes, nonceBytes, key);
  } catch (err) {
    throw new RestoreError(
      'Backup decryption failed — wrong passphrase or corrupted backup',
      err,
    );
  } finally {
    wipeBytes(key);
  }

  if (seed === null) {
    throw new RestoreError(
      'Backup authentication failed — wrong passphrase or tampered backup file. ' +
      'Do NOT attempt to use this backup further.',
    );
  }

  return seed;
}

/**
 * Serialize an EncryptedBackup to a JSON string for file export.
 *
 * WHY we include pretty-printing indent: The backup JSON may be printed as
 * a QR code or stored as a human-readable file. Indentation makes visual
 * inspection easier without compromising security.
 */
export function serializeBackup(backup: EncryptedBackup): string {
  return JSON.stringify(backup, null, 2);
}

/**
 * Parse and validate a JSON backup string.
 * Throws if the JSON is malformed or missing required fields.
 *
 * WHY strict validation: A corrupted or partially-written backup that
 * passes validation silently would give the user false confidence. We
 * check every required field exists and has the right type.
 */
export function deserializeBackup(json: string): EncryptedBackup {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (err) {
    throw new RestoreError('Backup file is not valid JSON', err);
  }

  if (typeof parsed !== 'object' || parsed === null) {
    throw new RestoreError('Backup file has invalid structure (not an object)');
  }

  const obj = parsed as Record<string, unknown>;

  // Validate required fields
  if (obj['version'] !== BACKUP_FORMAT_VERSION) {
    throw new RestoreError(
      `Backup version mismatch: got ${String(obj['version'])}, expected ${BACKUP_FORMAT_VERSION}`,
    );
  }
  if (typeof obj['ciphertext'] !== 'string' || obj['ciphertext'].length === 0) {
    throw new RestoreError('Backup missing or invalid "ciphertext" field');
  }
  if (typeof obj['nonce'] !== 'string' || obj['nonce'].length === 0) {
    throw new RestoreError('Backup missing or invalid "nonce" field');
  }
  if (typeof obj['salt'] !== 'string' || obj['salt'].length === 0) {
    throw new RestoreError('Backup missing or invalid "salt" field');
  }
  if (typeof obj['createdAt'] !== 'number' || obj['createdAt'] <= 0) {
    throw new RestoreError('Backup missing or invalid "createdAt" field');
  }

  const kdfParams = obj['kdfParams'];
  if (
    typeof kdfParams !== 'object' || kdfParams === null ||
    (kdfParams as Record<string, unknown>)['algorithm'] !== 'argon2id' ||
    typeof (kdfParams as Record<string, unknown>)['memoryKb'] !== 'number' ||
    typeof (kdfParams as Record<string, unknown>)['iterations'] !== 'number' ||
    typeof (kdfParams as Record<string, unknown>)['parallelism'] !== 'number'
  ) {
    throw new RestoreError('Backup has invalid "kdfParams" field');
  }

  return obj as unknown as EncryptedBackup;
}

/**
 * Fast backup for tests — uses minimal Argon2id params.
 * NEVER call this in production.
 */
export async function createEncryptedBackupFast(
  seed: Uint8Array,
  passphrase: string,
  hint?: string,
): Promise<EncryptedBackup> {
  // L-10: Guard against accidental production use
  if (typeof process !== 'undefined' && process.env?.NODE_ENV === 'production') {
    throw new Error('createEncryptedBackupFast must not be used in production');
  }
  return createEncryptedBackup(seed, passphrase, hint, ARGON2_TEST_PARAMS);
}
