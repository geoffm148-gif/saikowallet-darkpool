/**
 * Crypto tests — encryption round-trips, Argon2id KDF, memory wiping.
 *
 * WHY we use ARGON2_TEST_PARAMS for speed: Production Argon2id params (64MB,
 * 3 iterations) take ~2 seconds per operation — acceptable for wallet unlock
 * but impractical for a test suite that runs on CI. Test params use 1MB/1 iteration
 * which is still correct behavior, just faster.
 */

import { describe, it, expect } from 'vitest';
import { encryptPayloadFast, decryptPayloadFast } from '../src/crypto/encryption.js';
import { deriveKey, deriveKeyWithSalt, ARGON2_TEST_PARAMS } from '../src/crypto/argon2-kdf.js';
import { wipeBytes, wipeAll, withWipe } from '../src/crypto/memory-wipe.js';
import { secureRandom, secureRandomHex } from '../src/crypto/secure-random.js';
import { DecryptionError } from '../src/errors.js';

// ─── Secure Random ────────────────────────────────────────────────────────────

describe('secureRandom', () => {
  it('returns a buffer of the requested length', () => {
    const buf = secureRandom(32);
    expect(buf).toHaveLength(32);
  });

  it('returns unique values on each call', () => {
    const a = secureRandom(32);
    const b = secureRandom(32);
    // Extremely unlikely to be equal with 256 bits of entropy
    expect(Buffer.from(a).toString('hex')).not.toBe(Buffer.from(b).toString('hex'));
  });

  it('is not all zeros (CSPRNG is active)', () => {
    const buf = secureRandom(32);
    expect(buf.every((b) => b === 0)).toBe(false);
  });

  it('throws for zero length', () => {
    expect(() => secureRandom(0)).toThrow();
  });

  it('throws for negative length', () => {
    expect(() => secureRandom(-1)).toThrow();
  });
});

describe('secureRandomHex', () => {
  it('returns a hex string of length byteLength * 2', () => {
    const hex = secureRandomHex(16);
    expect(hex).toHaveLength(32);
    expect(/^[0-9a-f]+$/.test(hex)).toBe(true);
  });
});

// ─── Argon2id KDF ─────────────────────────────────────────────────────────────

describe('Argon2id KDF', () => {
  it('derives a 32-byte key from passphrase', async () => {
    const { key } = await deriveKey('test-passphrase', ARGON2_TEST_PARAMS);
    expect(key).toHaveLength(32);
  });

  it('produces deterministic output for same passphrase + salt', async () => {
    const salt = secureRandom(16);
    const key1 = await deriveKeyWithSalt('same-passphrase', salt, ARGON2_TEST_PARAMS);
    const key2 = await deriveKeyWithSalt('same-passphrase', salt, ARGON2_TEST_PARAMS);
    expect(Buffer.from(key1).toString('hex')).toBe(Buffer.from(key2).toString('hex'));
  });

  it('produces different output for different passphrases (same salt)', async () => {
    const salt = secureRandom(16);
    const key1 = await deriveKeyWithSalt('passphrase-1', salt, ARGON2_TEST_PARAMS);
    const key2 = await deriveKeyWithSalt('passphrase-2', salt, ARGON2_TEST_PARAMS);
    expect(Buffer.from(key1).toString('hex')).not.toBe(Buffer.from(key2).toString('hex'));
  });

  it('produces different output for different salts (same passphrase)', async () => {
    const salt1 = secureRandom(16);
    const salt2 = secureRandom(16);
    const key1 = await deriveKeyWithSalt('same', salt1, ARGON2_TEST_PARAMS);
    const key2 = await deriveKeyWithSalt('same', salt2, ARGON2_TEST_PARAMS);
    expect(Buffer.from(key1).toString('hex')).not.toBe(Buffer.from(key2).toString('hex'));
  });

  it('generates a fresh random salt on each call to deriveKey', async () => {
    const result1 = await deriveKey('p', ARGON2_TEST_PARAMS);
    const result2 = await deriveKey('p', ARGON2_TEST_PARAMS);
    expect(Buffer.from(result1.salt).toString('hex')).not.toBe(
      Buffer.from(result2.salt).toString('hex'),
    );
  });

  it('throws for empty passphrase', async () => {
    await expect(deriveKey('', ARGON2_TEST_PARAMS)).rejects.toThrow();
  });
});

// ─── Encryption / Decryption Round-Trip ──────────────────────────────────────

describe('encryptPayload / decryptPayload', () => {
  const PASSPHRASE = 'correct-horse-battery-staple';
  const PLAINTEXT_STRING = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

  it('encrypts and decrypts a string payload', async () => {
    const keystore = await encryptPayloadFast(PLAINTEXT_STRING, PASSPHRASE);
    const decrypted = await decryptPayloadFast(keystore, PASSPHRASE);
    const result = new TextDecoder().decode(decrypted);
    expect(result).toBe(PLAINTEXT_STRING);
  });

  it('encrypts and decrypts binary payload', async () => {
    const binaryData = secureRandom(64);
    const keystore = await encryptPayloadFast(binaryData, PASSPHRASE);
    const decrypted = await decryptPayloadFast(keystore, PASSPHRASE);
    expect(Buffer.from(decrypted).toString('hex')).toBe(
      Buffer.from(binaryData).toString('hex'),
    );
  });

  it('produces different ciphertext each time (nonce is random)', async () => {
    const ks1 = await encryptPayloadFast(PLAINTEXT_STRING, PASSPHRASE);
    const ks2 = await encryptPayloadFast(PLAINTEXT_STRING, PASSPHRASE);
    expect(ks1.ciphertext).not.toBe(ks2.ciphertext);
    expect(ks1.nonce).not.toBe(ks2.nonce);
    expect(ks1.salt).not.toBe(ks2.salt);
  });

  it('keystore has version 1', async () => {
    const keystore = await encryptPayloadFast(PLAINTEXT_STRING, PASSPHRASE);
    expect(keystore.version).toBe(1);
  });

  it('keystore records correct kdf algorithm', async () => {
    const keystore = await encryptPayloadFast(PLAINTEXT_STRING, PASSPHRASE);
    expect(keystore.kdfParams.algorithm).toBe('argon2id');
  });

  it('fails to decrypt with wrong passphrase', async () => {
    const keystore = await encryptPayloadFast(PLAINTEXT_STRING, PASSPHRASE);
    await expect(decryptPayloadFast(keystore, 'wrong-passphrase')).rejects.toThrow(
      DecryptionError,
    );
  });

  it('fails to decrypt with tampered ciphertext', async () => {
    const keystore = await encryptPayloadFast(PLAINTEXT_STRING, PASSPHRASE);
    // Flip a byte in the ciphertext — should fail MAC validation
    const tampered = Buffer.from(keystore.ciphertext, 'base64');
    tampered[0] = tampered[0] !== undefined ? tampered[0] ^ 0xff : 0xff;
    const tamperedKeystore = { ...keystore, ciphertext: tampered.toString('base64') };
    await expect(decryptPayloadFast(tamperedKeystore, PASSPHRASE)).rejects.toThrow(
      DecryptionError,
    );
  });

  it('fails to decrypt with tampered nonce', async () => {
    const keystore = await encryptPayloadFast(PLAINTEXT_STRING, PASSPHRASE);
    const tampered = Buffer.from(keystore.nonce, 'base64');
    tampered[0] = tampered[0] !== undefined ? tampered[0] ^ 0xff : 0xff;
    const tamperedKeystore = { ...keystore, nonce: tampered.toString('base64') };
    await expect(decryptPayloadFast(tamperedKeystore, PASSPHRASE)).rejects.toThrow(
      DecryptionError,
    );
  });
});

// ─── Memory Wiping ────────────────────────────────────────────────────────────

describe('wipeBytes', () => {
  it('zeros out a Uint8Array', () => {
    const buf = new Uint8Array([1, 2, 3, 4, 5]);
    wipeBytes(buf);
    expect(buf.every((b) => b === 0)).toBe(true);
  });

  it('zeros out a buffer of all 0xFF', () => {
    const buf = new Uint8Array(32).fill(0xff);
    wipeBytes(buf);
    expect(buf.every((b) => b === 0)).toBe(true);
  });

  it('handles empty buffer without error', () => {
    const buf = new Uint8Array(0);
    expect(() => wipeBytes(buf)).not.toThrow();
  });
});

describe('wipeAll', () => {
  it('wipes multiple buffers', () => {
    const a = new Uint8Array([1, 2, 3]);
    const b = new Uint8Array([4, 5, 6]);
    wipeAll(a, b);
    expect(a.every((x) => x === 0)).toBe(true);
    expect(b.every((x) => x === 0)).toBe(true);
  });
});

describe('withWipe', () => {
  it('wipes buffer after successful operation', async () => {
    const sensitive = new Uint8Array([0xde, 0xad, 0xbe, 0xef]);
    let seenInside: Uint8Array | null = null;

    await withWipe(sensitive, async (buf) => {
      seenInside = new Uint8Array(buf); // Capture a copy
      return 'done';
    });

    // seenInside should have the original values
    expect(seenInside![0]).toBe(0xde);
    // After withWipe, the original buffer should be zeroed
    expect(sensitive.every((b) => b === 0)).toBe(true);
  });

  it('wipes buffer even if operation throws', async () => {
    const sensitive = new Uint8Array([1, 2, 3]);

    await expect(
      withWipe(sensitive, async () => {
        throw new Error('operation failed');
      }),
    ).rejects.toThrow('operation failed');

    expect(sensitive.every((b) => b === 0)).toBe(true);
  });
});
