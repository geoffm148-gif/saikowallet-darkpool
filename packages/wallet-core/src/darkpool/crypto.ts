/**
 * Saiko DarkPool — Cryptographic Primitives
 *
 * Provides secret/nullifier generation, commitment computation,
 * viewing key derivation, and note encryption/decryption.
 *
 * SECURITY: All crypto runs client-side. Secrets never leave the device.
 */

import type { DarkPoolNote } from './types.js';
// circomlibjs loaded dynamically to avoid bundling Node.js deps in browser build
import { deriveKeyWithSalt, ARGON2_PARAMS } from '../crypto/argon2-kdf.js';
import { secureRandom } from '../crypto/secure-random.js';

// ─── Random Generation ───────────────────────────────────────────────────────

/** Generate a 32-byte cryptographic secret. */
export function generateSecret(): Uint8Array {
  const buf = new Uint8Array(32);
  crypto.getRandomValues(buf);
  return buf;
}

/** Generate a 32-byte cryptographic nullifier. */
export function generateNullifier(): Uint8Array {
  const buf = new Uint8Array(32);
  crypto.getRandomValues(buf);
  return buf;
}

// ─── Poseidon Hash (BN254 via circomlibjs) ──────────────────────────────────

let poseidonFn: any;

async function getPoseidon() {
  if (!poseidonFn) {
    const { buildPoseidon } = await import('circomlibjs');
    poseidonFn = await buildPoseidon();
  }
  return poseidonFn;
}

/**
 * Real BN254 Poseidon hash via circomlibjs.
 */
export async function poseidonHash(inputs: bigint[]): Promise<bigint> {
  const poseidon = await getPoseidon();
  const result = poseidon(inputs.map(x => x));
  return BigInt(poseidon.F.toString(result));
}

// ─── Commitment ──────────────────────────────────────────────────────────────

/** Convert Uint8Array to bigint. */
function bytesToBigInt(bytes: Uint8Array): bigint {
  let result = 0n;
  for (const byte of bytes) {
    result = (result << 8n) | BigInt(byte);
  }
  return result;
}

/** Convert bigint to hex string (0x-prefixed). */
function bigIntToHex(n: bigint): string {
  const hex = n.toString(16);
  return '0x' + hex.padStart(64, '0');
}

/**
 * Compute on-chain commitment: poseidonHash(secret, nullifier).
 * Returns a 0x-prefixed hex string.
 */
export async function computeCommitment(secret: Uint8Array, nullifier: Uint8Array): Promise<string> {
  const s = bytesToBigInt(secret);
  const n = bytesToBigInt(nullifier);
  const commitment = await poseidonHash([s, n]);
  return bigIntToHex(commitment);
}

// ─── Viewing Key Derivation ──────────────────────────────────────────────────

/**
 * Derive a viewing key from the secret using HKDF via SubtleCrypto.
 * Label: "saiko-darkpool-viewing-key"
 */
export async function deriveViewingKey(secret: Uint8Array): Promise<Uint8Array> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    Uint8Array.from(secret),
    { name: 'HKDF' },
    false,
    ['deriveBits'],
  );

  const label = new TextEncoder().encode('saiko-darkpool-viewing-key');

  const bits = await crypto.subtle.deriveBits(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: new Uint8Array(32), // zero salt — the secret itself is high-entropy
      info: label,
    },
    keyMaterial,
    256,
  );

  return new Uint8Array(bits);
}

// ─── Note Encryption / Decryption ────────────────────────────────────────────

/** Derive an AES-256-GCM key from a password via Argon2id. */
async function deriveAesKey(password: string, salt: Uint8Array): Promise<Uint8Array> {
  return deriveKeyWithSalt(password, salt, ARGON2_PARAMS);
}

/** Serialize a DarkPoolNote to JSON-safe format (Uint8Array → hex, bigint → string). */
function serializeNote(note: DarkPoolNote): Record<string, unknown> {
  return {
    secret: Array.from(note.secret),
    nullifier: Array.from(note.nullifier),
    commitment: note.commitment,
    amount: note.amount.toString(),
    tier: note.tier,
    timestamp: note.timestamp,
    txHash: note.txHash,
    viewingKey: Array.from(note.viewingKey),
    isSpent: note.isSpent,
  };
}

/** Deserialize JSON-safe format back to DarkPoolNote. */
function deserializeNote(obj: Record<string, unknown>): DarkPoolNote {
  return {
    secret: new Uint8Array(obj.secret as number[]),
    nullifier: new Uint8Array(obj.nullifier as number[]),
    commitment: obj.commitment as string,
    amount: BigInt(obj.amount as string),
    tier: obj.tier as number,
    timestamp: obj.timestamp as number,
    txHash: obj.txHash as string,
    viewingKey: new Uint8Array(obj.viewingKey as number[]),
    isSpent: obj.isSpent as boolean,
  };
}

/**
 * Encrypt a DarkPoolNote with AES-256-GCM.
 * Returns a base64-encoded JSON string containing { salt, iv, ciphertext }.
 */
export async function encryptNote(note: DarkPoolNote, password: string): Promise<string> {
  const salt = secureRandom(16);
  const iv = new Uint8Array(12);
  crypto.getRandomValues(iv);

  const keyBytes = await deriveAesKey(password, salt);
  const key = await crypto.subtle.importKey(
    'raw',
    new Uint8Array(keyBytes.buffer as ArrayBuffer),
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt'],
  );
  const plaintext = new TextEncoder().encode(JSON.stringify(serializeNote(note)));

  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    plaintext,
  );

  const payload = JSON.stringify({
    salt: Array.from(salt),
    iv: Array.from(iv),
    ciphertext: Array.from(new Uint8Array(ciphertext)),
  });

  return btoa(payload);
}

/**
 * Decrypt a base64-encoded encrypted note back to DarkPoolNote.
 */
export async function decryptNote(encrypted: string, password: string): Promise<DarkPoolNote> {
  const payload = JSON.parse(atob(encrypted)) as {
    salt: number[];
    iv: number[];
    ciphertext: number[];
  };

  const salt = new Uint8Array(payload.salt);
  const iv = new Uint8Array(payload.iv);
  const ciphertext = new Uint8Array(payload.ciphertext);

  const keyBytes = await deriveAesKey(password, salt);
  const key = await crypto.subtle.importKey(
    'raw',
    new Uint8Array(keyBytes.buffer as ArrayBuffer),
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt'],
  );

  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    ciphertext,
  );

  const obj = JSON.parse(new TextDecoder().decode(plaintext)) as Record<string, unknown>;
  return deserializeNote(obj);
}
