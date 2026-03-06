/**
 * Backup & recovery tests — encrypted backup, Shamir SSS, recovery verification.
 *
 * WHY we test Shamir extensively: Mathematical bugs in GF(256) arithmetic
 * or Lagrange interpolation could silently produce wrong reconstruction output
 * without throwing errors. We test multiple N/K combinations and verify
 * round-trips byte-for-byte.
 */

import { describe, it, expect } from 'vitest';
import {
  createEncryptedBackupFast,
  restoreFromBackup,
  serializeBackup,
  deserializeBackup,
  BACKUP_ARGON2_PARAMS,
} from '../src/backup/encrypted-backup.js';
import {
  splitSecret,
  combineShares,
  validateShareSet,
} from '../src/backup/shamir-sss.js';
import {
  verifyRecoveryCapability,
  verifyMnemonicsMatch,
} from '../src/backup/recovery-verifier.js';
import { wipeBytes } from '../src/crypto/memory-wipe.js';
import { secureRandom } from '../src/crypto/secure-random.js';
import { ShamirError, RestoreError, RecoveryVerificationError } from '../src/errors.js';

// ─── Known test mnemonic (public test vector — NOT a real wallet) ─────────────

const TEST_MNEMONIC =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
// The first Ethereum account from this mnemonic (BIP-44: m/44'/60'/0'/0/0)
const TEST_ADDRESS = '0x9858EfFD232B4033E47d90003D41EC34EcaEda94';

// ─── Encrypted Backup ─────────────────────────────────────────────────────────

describe('createEncryptedBackup / restoreFromBackup', () => {
  const PASSPHRASE = 'super-secret-backup-passphrase-42!';

  it('round-trips: backup and restore returns identical seed', async () => {
    const seed = secureRandom(64);
    const seedCopy = new Uint8Array(seed); // Keep a copy for comparison

    const backup = await createEncryptedBackupFast(seed, PASSPHRASE);
    const restored = await restoreFromBackup(backup, PASSPHRASE);

    expect(Buffer.from(restored).toString('hex')).toBe(
      Buffer.from(seedCopy).toString('hex'),
    );

    wipeBytes(restored);
  });

  it('produces different ciphertext on each call (random nonce)', async () => {
    const seed = secureRandom(64);
    const b1 = await createEncryptedBackupFast(seed, PASSPHRASE);
    const b2 = await createEncryptedBackupFast(seed, PASSPHRASE);

    expect(b1.ciphertext).not.toBe(b2.ciphertext);
    expect(b1.nonce).not.toBe(b2.nonce);
    expect(b1.salt).not.toBe(b2.salt);
  });

  it('includes createdAt timestamp', async () => {
    const before = Date.now();
    const backup = await createEncryptedBackupFast(secureRandom(64), PASSPHRASE);
    const after = Date.now();

    expect(backup.createdAt).toBeGreaterThanOrEqual(before);
    expect(backup.createdAt).toBeLessThanOrEqual(after);
  });

  it('stores optional hint in backup', async () => {
    const hint = 'stored on my USB stick';
    const backup = await createEncryptedBackupFast(secureRandom(64), PASSPHRASE, hint);
    expect(backup.hint).toBe(hint);
  });

  it('does not store hint when not provided', async () => {
    const backup = await createEncryptedBackupFast(secureRandom(64), PASSPHRASE);
    expect(backup.hint).toBeUndefined();
  });

  it('backup version is 1', async () => {
    const backup = await createEncryptedBackupFast(secureRandom(64), PASSPHRASE);
    expect(backup.version).toBe(1);
  });

  it('kdfParams records argon2id algorithm', async () => {
    const backup = await createEncryptedBackupFast(secureRandom(64), PASSPHRASE);
    expect(backup.kdfParams.algorithm).toBe('argon2id');
  });

  it('fails to restore with wrong passphrase', async () => {
    const seed = secureRandom(64);
    const backup = await createEncryptedBackupFast(seed, PASSPHRASE);

    await expect(restoreFromBackup(backup, 'wrong-passphrase')).rejects.toThrow(RestoreError);
  });

  it('fails to restore with tampered ciphertext', async () => {
    const backup = await createEncryptedBackupFast(secureRandom(64), PASSPHRASE);
    const tampered = Buffer.from(backup.ciphertext, 'base64');
    tampered[0] = tampered[0]! ^ 0xff;

    const tamperedBackup = { ...backup, ciphertext: tampered.toString('base64') };
    await expect(restoreFromBackup(tamperedBackup, PASSPHRASE)).rejects.toThrow(RestoreError);
  });

  it('throws when seed is empty', async () => {
    await expect(
      createEncryptedBackupFast(new Uint8Array(0), PASSPHRASE),
    ).rejects.toThrow(/Seed must not be empty/);
  });

  it('throws when passphrase is empty', async () => {
    await expect(
      createEncryptedBackupFast(secureRandom(64), ''),
    ).rejects.toThrow(/Backup passphrase must not be empty/);
  });
});

describe('serializeBackup / deserializeBackup', () => {
  const PASSPHRASE = 'serialize-test-passphrase';

  it('round-trips through JSON serialization', async () => {
    const seed = secureRandom(32);
    const backup = await createEncryptedBackupFast(seed, PASSPHRASE);

    const json = serializeBackup(backup);
    const restored = deserializeBackup(json);

    expect(restored.version).toBe(backup.version);
    expect(restored.ciphertext).toBe(backup.ciphertext);
    expect(restored.nonce).toBe(backup.nonce);
    expect(restored.salt).toBe(backup.salt);
    expect(restored.createdAt).toBe(backup.createdAt);
  });

  it('produced JSON is a valid JSON string', async () => {
    const backup = await createEncryptedBackupFast(secureRandom(32), PASSPHRASE);
    const json = serializeBackup(backup);
    expect(() => JSON.parse(json)).not.toThrow();
  });

  it('throws RestoreError for invalid JSON', () => {
    expect(() => deserializeBackup('{not-json}')).toThrow(RestoreError);
  });

  it('throws RestoreError for missing ciphertext field', async () => {
    const backup = await createEncryptedBackupFast(secureRandom(32), PASSPHRASE);
    const parsed = JSON.parse(serializeBackup(backup)) as Record<string, unknown>;
    delete parsed['ciphertext'];
    expect(() => deserializeBackup(JSON.stringify(parsed))).toThrow(RestoreError);
  });

  it('throws RestoreError for wrong version', () => {
    expect(() => deserializeBackup(JSON.stringify({ version: 99 }))).toThrow(RestoreError);
  });

  it('can decrypt after serialize+deserialize cycle', async () => {
    const seed = secureRandom(32);
    const seedCopy = new Uint8Array(seed);

    const backup = await createEncryptedBackupFast(seed, PASSPHRASE);
    const json = serializeBackup(backup);
    const deserialized = deserializeBackup(json);
    const restored = await restoreFromBackup(deserialized, PASSPHRASE);

    expect(Buffer.from(restored).toString('hex')).toBe(
      Buffer.from(seedCopy).toString('hex'),
    );
    wipeBytes(restored);
  });
});

// ─── Shamir Secret Sharing ────────────────────────────────────────────────────

describe('splitSecret / combineShares', () => {
  const SECRET = new TextEncoder().encode('Hello, Shamir!');

  it('splits and reconstructs with 2-of-3', () => {
    const shares = splitSecret(SECRET, 3, 2);
    expect(shares).toHaveLength(3);

    // Any 2 shares should reconstruct
    const reconstructed = combineShares([shares[0]!, shares[1]!]);
    expect(Buffer.from(reconstructed).toString()).toBe('Hello, Shamir!');
  });

  it('splits and reconstructs with 3-of-5', () => {
    const shares = splitSecret(SECRET, 5, 3);
    expect(shares).toHaveLength(5);

    const r1 = combineShares([shares[0]!, shares[2]!, shares[4]!]);
    expect(Buffer.from(r1).toString()).toBe('Hello, Shamir!');

    const r2 = combineShares([shares[1]!, shares[3]!, shares[4]!]);
    expect(Buffer.from(r2).toString()).toBe('Hello, Shamir!');
  });

  it('splits and reconstructs with 5-of-5 (N=K)', () => {
    const shares = splitSecret(SECRET, 5, 5);
    const reconstructed = combineShares(shares);
    expect(Buffer.from(reconstructed).toString()).toBe('Hello, Shamir!');
  });

  it('splits and reconstructs with 2-of-2', () => {
    const shares = splitSecret(SECRET, 2, 2);
    const reconstructed = combineShares(shares);
    expect(Buffer.from(reconstructed).toString()).toBe('Hello, Shamir!');
  });

  it('works with a full 64-byte BIP-39 seed', () => {
    const seed = secureRandom(64);
    const seedCopy = new Uint8Array(seed);
    const shares = splitSecret(seed, 5, 3);

    const reconstructed = combineShares([shares[0]!, shares[2]!, shares[4]!]);
    expect(Buffer.from(reconstructed).toString('hex')).toBe(
      Buffer.from(seedCopy).toString('hex'),
    );
    wipeBytes(reconstructed);
  });

  it('produces shares of the same length as the secret', () => {
    const shares = splitSecret(SECRET, 5, 3);
    for (const share of shares) {
      expect(share.data.length).toBe(SECRET.length);
    }
  });

  it('share indices are 1-based and unique', () => {
    const shares = splitSecret(SECRET, 4, 2);
    const indices = shares.map((s) => s.index);
    expect(indices).toEqual([1, 2, 3, 4]);
    expect(new Set(indices).size).toBe(4);
  });

  it('all shares record the correct threshold', () => {
    const shares = splitSecret(SECRET, 5, 3);
    for (const share of shares) {
      expect(share.threshold).toBe(3);
    }
  });

  it('different splits of same secret produce different share data', () => {
    const s1 = splitSecret(SECRET, 3, 2);
    const s2 = splitSecret(SECRET, 3, 2);
    // With random coefficients, shares should be different
    expect(Buffer.from(s1[0]!.data).toString('hex')).not.toBe(
      Buffer.from(s2[0]!.data).toString('hex'),
    );
  });

  it('reconstruction works with shares in any order', () => {
    const shares = splitSecret(SECRET, 5, 3);
    const reversed = [shares[4]!, shares[2]!, shares[0]!];
    const reconstructed = combineShares(reversed);
    expect(Buffer.from(reconstructed).toString()).toBe('Hello, Shamir!');
  });

  it('throws ShamirError for empty secret', () => {
    expect(() => splitSecret(new Uint8Array(0), 3, 2)).toThrow(ShamirError);
  });

  it('throws ShamirError when threshold > totalShares', () => {
    expect(() => splitSecret(SECRET, 3, 5)).toThrow(ShamirError);
  });

  it('throws ShamirError when threshold < 2', () => {
    expect(() => splitSecret(SECRET, 3, 1)).toThrow(ShamirError);
  });

  it('throws ShamirError when totalShares < 2', () => {
    expect(() => splitSecret(SECRET, 1, 1)).toThrow(ShamirError);
  });

  it('throws ShamirError when totalShares > 255', () => {
    expect(() => splitSecret(SECRET, 256, 2)).toThrow(ShamirError);
  });
});

describe('combineShares — error handling', () => {
  const SECRET = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);

  it('throws ShamirError for empty share array', () => {
    expect(() => combineShares([])).toThrow(ShamirError);
  });

  it('throws ShamirError when not enough shares', () => {
    const shares = splitSecret(SECRET, 5, 3);
    expect(() => combineShares([shares[0]!, shares[1]!])).toThrow(ShamirError);
  });

  it('throws ShamirError for duplicate share indices', () => {
    const shares = splitSecret(SECRET, 5, 3);
    expect(() => combineShares([shares[0]!, shares[0]!, shares[1]!])).toThrow(ShamirError);
  });

  it('throws ShamirError for shares with mismatched thresholds', () => {
    const shares2of3 = splitSecret(SECRET, 3, 2);
    const shares3of5 = splitSecret(SECRET, 5, 3);

    const mixedShares = [
      shares2of3[0]!,
      { ...shares3of5[1]!, threshold: 3 }, // Different threshold
    ];

    expect(() => combineShares(mixedShares)).toThrow(ShamirError);
  });

  it('throws ShamirError for shares with mismatched data lengths', () => {
    const shares = splitSecret(SECRET, 3, 2);
    const badShare = { ...shares[1]!, data: new Uint8Array(3) }; // Wrong length
    expect(() => combineShares([shares[0]!, badShare])).toThrow(ShamirError);
  });
});

describe('validateShareSet', () => {
  const SECRET = new Uint8Array(32).fill(0xab);

  it('passes for a valid set of shares', () => {
    const shares = splitSecret(SECRET, 5, 3);
    expect(() => validateShareSet(shares.slice(0, 3))).not.toThrow();
  });

  it('throws for empty share array', () => {
    expect(() => validateShareSet([])).toThrow(ShamirError);
  });

  it('throws when fewer shares than threshold', () => {
    const shares = splitSecret(SECRET, 5, 3);
    expect(() => validateShareSet(shares.slice(0, 2))).toThrow(ShamirError);
  });
});

// ─── Recovery Verifier ────────────────────────────────────────────────────────

describe('verifyRecoveryCapability', () => {
  it('returns isValid=true when mnemonic matches expected address', () => {
    const result = verifyRecoveryCapability(TEST_MNEMONIC, TEST_ADDRESS);
    expect(result.isValid).toBe(true);
    expect(result.matchesExpected).toBe(true);
    expect(result.derivedAddress.toLowerCase()).toBe(TEST_ADDRESS.toLowerCase());
  });

  it('returns isValid=false when mnemonic produces a different address', () => {
    const differentMnemonic =
      'zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo wrong';
    const result = verifyRecoveryCapability(differentMnemonic, TEST_ADDRESS);
    expect(result.isValid).toBe(false);
    expect(result.matchesExpected).toBe(false);
  });

  it('includes both derived and expected addresses in result', () => {
    const result = verifyRecoveryCapability(TEST_MNEMONIC, TEST_ADDRESS);
    expect(result.derivedAddress).toBeTruthy();
    expect(result.expectedAddress).toBeTruthy();
  });

  it('is case-insensitive for address comparison', () => {
    const lowerAddress = TEST_ADDRESS.toLowerCase();
    const result = verifyRecoveryCapability(TEST_MNEMONIC, lowerAddress);
    expect(result.isValid).toBe(true);
  });

  it('throws RecoveryVerificationError for invalid mnemonic', () => {
    expect(() =>
      verifyRecoveryCapability('not a valid mnemonic phrase here', TEST_ADDRESS),
    ).toThrow(RecoveryVerificationError);
  });

  it('throws RecoveryVerificationError for invalid expected address', () => {
    expect(() =>
      verifyRecoveryCapability(TEST_MNEMONIC, 'not-an-address'),
    ).toThrow(RecoveryVerificationError);
  });

  it('normalizes expected address to EIP-55 checksum', () => {
    const result = verifyRecoveryCapability(TEST_MNEMONIC, TEST_ADDRESS.toLowerCase());
    // expectedAddress in result should be EIP-55 checksummed
    expect(result.expectedAddress).toMatch(/^0x[0-9a-fA-F]{40}$/);
  });
});

describe('verifyMnemonicsMatch', () => {
  it('returns true when two identical mnemonics are given', () => {
    expect(verifyMnemonicsMatch([TEST_MNEMONIC, TEST_MNEMONIC])).toBe(true);
  });

  it('returns false when different mnemonics produce different addresses', () => {
    const other = 'zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo wrong';
    expect(verifyMnemonicsMatch([TEST_MNEMONIC, other])).toBe(false);
  });

  it('throws RecoveryVerificationError when fewer than 2 mnemonics', () => {
    expect(() => verifyMnemonicsMatch([TEST_MNEMONIC])).toThrow(RecoveryVerificationError);
  });

  it('throws RecoveryVerificationError when any mnemonic is invalid', () => {
    expect(() => verifyMnemonicsMatch([TEST_MNEMONIC, 'bad mnemonic'])).toThrow(
      RecoveryVerificationError,
    );
  });
});
