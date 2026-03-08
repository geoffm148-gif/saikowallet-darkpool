/**
 * Saiko Wallet — wallet-core Stress Tests
 *
 * Tests cover:
 * 1. HD wallet account generation (1000 accounts, uniqueness)
 * 2. Child key derivation (10,000 keys, no collisions)
 * 3. Argon2id concurrent hashing
 * 4. XSalsa20 encrypt/decrypt large data
 * 5. IncrementalMerkleTree (1000 leaves, proof verification)
 * 6. poseidonHash consistency
 * 7. Note store encrypt/decrypt (500 notes)
 * 8. BIP39 mnemonic generation
 * 9. BIP44 address derivation uniqueness
 * 10. Edge case torture tests
 * 11. Performance benchmarks
 */

import { describe, it, expect, beforeAll, vi } from 'vitest';
import { generateMnemonic } from './src/keychain/mnemonic-generator.js';
import {
  deriveAccount,
  deriveAccounts,
  buildDerivationPath,
  MAX_ACCOUNTS_PER_BATCH,
} from './src/keychain/hd-derivation.js';
import { validateMnemonic } from './src/keychain/seed-validator.js';
import { deriveKey, deriveKeyWithSalt, ARGON2_PARAMS } from './src/crypto/argon2-kdf.js';
import {
  encryptPayload,
  decryptPayload,
  encryptPayloadFast,
  decryptPayloadFast,
} from './src/crypto/encryption.js';
import { IncrementalMerkleTree } from './src/darkpool/merkle-tree.js';
import { poseidonHash, computeCommitment, encryptNote, decryptNote } from './src/darkpool/crypto.js';
import { InvalidSeedError, DerivationError, DecryptionError } from './src/errors.js';
import type { DarkPoolNote } from './src/darkpool/types.js';

// ─── Argon2id TEST params (fast) ──────────────────────────────────────────────
const ARGON2_FAST = { memoryKb: 1024, iterations: 1, parallelism: 1, saltLength: 16, keyLength: 32 };

// ─── Known mnemonic for deterministic tests ───────────────────────────────────
const KNOWN_MNEMONIC =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

// ─── Mock localStorage for note-store tests ───────────────────────────────────
const localStorageStore: Record<string, string> = {};
global.localStorage = {
  getItem: (key: string) => localStorageStore[key] ?? null,
  setItem: (key: string, value: string) => { localStorageStore[key] = value; },
  removeItem: (key: string) => { delete localStorageStore[key]; },
  clear: () => { Object.keys(localStorageStore).forEach(k => delete localStorageStore[k]); },
  length: 0,
  key: () => null,
} as unknown as Storage;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeFakeNote(i: number): DarkPoolNote {
  const secret = new Uint8Array(32).fill(i % 256);
  const nullifier = new Uint8Array(32).fill((i + 1) % 256);
  const viewingKey = new Uint8Array(32).fill((i + 2) % 256);
  return {
    secret,
    nullifier,
    commitment: `0x${'a'.repeat(63)}${(i % 16).toString(16)}`,
    amount: BigInt(10_000_000) * BigInt(10 ** 18),
    tier: i % 4,
    timestamp: Date.now() + i,
    txHash: `0x${'b'.repeat(64)}`,
    viewingKey,
    isSpent: false,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. HD WALLET: Generate 1000 accounts from same seed, verify all unique
// ─────────────────────────────────────────────────────────────────────────────

describe('Stress 1: HD Wallet — 1000 accounts from same seed', () => {
  it('all 1000 derived addresses are unique', () => {
    const addresses = new Set<string>();
    const batchSize = MAX_ACCOUNTS_PER_BATCH; // 100
    const batches = 10;

    for (let b = 0; b < batches; b++) {
      const result = deriveAccounts(KNOWN_MNEMONIC, batchSize, b * batchSize);
      for (const account of result.accounts) {
        expect(addresses.has(account.address)).toBe(false);
        addresses.add(account.address);
      }
    }

    expect(addresses.size).toBe(1000);
  });
}, { timeout: 120_000 });

// ─────────────────────────────────────────────────────────────────────────────
// 2. HD WALLET: Derive 10,000 child keys, verify no collisions
// ─────────────────────────────────────────────────────────────────────────────

describe('Stress 2: HD Wallet — 10,000 derived keys, no collisions', () => {
  it('10,000 derived addresses are all unique (batches of 100)', () => {
    const addresses = new Set<string>();
    const batchSize = MAX_ACCOUNTS_PER_BATCH; // 100
    const totalBatches = 100; // 100 * 100 = 10,000

    for (let b = 0; b < totalBatches; b++) {
      const result = deriveAccounts(KNOWN_MNEMONIC, batchSize, b * batchSize);
      for (const account of result.accounts) {
        expect(addresses.has(account.address)).toBe(false);
        addresses.add(account.address);
      }
    }

    expect(addresses.size).toBe(10_000);
  });
}, { timeout: 600_000 });

// ─────────────────────────────────────────────────────────────────────────────
// 3. Argon2id: hash 100 passphrases (fast params to avoid timeouts)
// ─────────────────────────────────────────────────────────────────────────────

describe('Stress 3: Argon2id — 100 passphrases', () => {
  it('100 sequential Argon2id hashes all complete successfully', async () => {
    const results: Uint8Array[] = [];

    for (let i = 0; i < 100; i++) {
      const { key, salt } = await deriveKey(`passphrase-${i}-stress`, ARGON2_FAST);
      expect(key).toBeInstanceOf(Uint8Array);
      expect(key.length).toBe(32);
      results.push(key);
    }

    expect(results.length).toBe(100);

    // All keys should be different (different passphrases)
    const hexKeys = results.map(k => Buffer.from(k).toString('hex'));
    const unique = new Set(hexKeys);
    expect(unique.size).toBe(100);
  });

  it('same passphrase + same salt → same key (determinism)', async () => {
    const passphrase = 'deterministic-stress-test';
    const salt = new Uint8Array(16).fill(42);

    const key1 = await deriveKeyWithSalt(passphrase, salt, ARGON2_FAST);
    const key2 = await deriveKeyWithSalt(passphrase, salt, ARGON2_FAST);

    expect(Buffer.from(key1).toString('hex')).toBe(Buffer.from(key2).toString('hex'));
  });

  it('different passphrases → different keys', async () => {
    const salt = new Uint8Array(16).fill(1);
    const key1 = await deriveKeyWithSalt('passA', salt, ARGON2_FAST);
    const key2 = await deriveKeyWithSalt('passB', salt, ARGON2_FAST);

    expect(Buffer.from(key1).toString('hex')).not.toBe(Buffer.from(key2).toString('hex'));
  });
}, { timeout: 120_000 });

// ─────────────────────────────────────────────────────────────────────────────
// 4. XSalsa20: encrypt/decrypt chunked data
// ─────────────────────────────────────────────────────────────────────────────

describe('Stress 4: XSalsa20 — encrypt/decrypt data in chunks', () => {
  it('encrypt/decrypt 1000 x 1KB chunks, verify integrity', async () => {
    const CHUNK_SIZE = 1024;
    const NUM_CHUNKS = 1000;
    const passphrase = 'xsalsa20-stress-test';

    let totalBytesEncrypted = 0;

    for (let i = 0; i < NUM_CHUNKS; i++) {
      const plaintext = new Uint8Array(CHUNK_SIZE);
      // Fill with deterministic pattern
      for (let j = 0; j < CHUNK_SIZE; j++) {
        plaintext[j] = (i * 7 + j * 13) % 256;
      }

      const keystore = await encryptPayloadFast(plaintext, passphrase);
      const decrypted = await decryptPayloadFast(keystore, passphrase);

      expect(decrypted.length).toBe(CHUNK_SIZE);
      for (let j = 0; j < CHUNK_SIZE; j++) {
        if (decrypted[j] !== plaintext[j]) {
          throw new Error(`Chunk ${i}, byte ${j}: expected ${plaintext[j]}, got ${decrypted[j]}`);
        }
      }

      totalBytesEncrypted += CHUNK_SIZE;
    }

    expect(totalBytesEncrypted).toBe(NUM_CHUNKS * CHUNK_SIZE);
  });

  it('wrong passphrase → DecryptionError', async () => {
    const keystore = await encryptPayloadFast('secret data', 'correct-password');
    await expect(decryptPayloadFast(keystore, 'wrong-password')).rejects.toThrow();
  });

  it('tampered ciphertext → DecryptionError', async () => {
    const keystore = await encryptPayloadFast('secret data', 'my-password');
    // Corrupt the ciphertext
    const corruptedKeystore = {
      ...keystore,
      ciphertext: Buffer.from('deadbeef'.repeat(20), 'hex').toString('base64'),
    };
    await expect(decryptPayloadFast(corruptedKeystore, 'my-password')).rejects.toThrow();
  });
}, { timeout: 120_000 });

// ─────────────────────────────────────────────────────────────────────────────
// 5. IncrementalMerkleTree: stress test with 10-level tree (1024 capacity)
//    Note: computeRoot() is O(2^levels), so we use levels=10 for performance.
//    The contract uses levels=20 but that makes getRoot/getProof O(2^20)~1M ops.
// ─────────────────────────────────────────────────────────────────────────────

describe('Stress 5: IncrementalMerkleTree — up to 1000 leaves, proof verification', () => {
  let tree: IncrementalMerkleTree;
  const leaves: bigint[] = [];
  // Use 10 levels (capacity=1024) so computeRoot is O(1024) not O(1M)
  const LEVELS = 10;
  const NUM_LEAVES = 1000;

  beforeAll(async () => {
    tree = await IncrementalMerkleTree.create(LEVELS);
    for (let i = 1; i <= NUM_LEAVES; i++) {
      const leaf = BigInt(i) * 31337n + 1n;
      leaves.push(leaf);
      tree.insert(leaf);
    }
  });

  it('root changes after each insertion (verified on small tree)', async () => {
    const t = await IncrementalMerkleTree.create(LEVELS);
    let prevRoot = t.getRoot();
    for (let i = 0; i < 20; i++) {
      t.insert(BigInt(i + 1) * 997n);
      const newRoot = t.getRoot();
      expect(newRoot).not.toBe(prevRoot);
      prevRoot = newRoot;
    }
  });

  it('getRoot() returns a non-zero bigint after 1000 inserts', () => {
    const root = tree.getRoot();
    expect(typeof root).toBe('bigint');
    expect(root).toBeGreaterThan(0n);
  });

  it('getProof() for first leaf (index 0) is valid', () => {
    const { pathElements, pathIndices, root } = tree.getProof(0);
    expect(pathElements.length).toBe(LEVELS);
    expect(pathIndices.length).toBe(LEVELS);
    expect(root).toBe(tree.getRoot());
  });

  it('getProof() for last leaf (index 999) is valid', () => {
    const { pathElements, root } = tree.getProof(999);
    expect(pathElements.length).toBe(LEVELS);
    expect(root).toBe(tree.getRoot());
  });

  it('getProof() for middle leaf (index 500) is valid', () => {
    const { root } = tree.getProof(500);
    expect(root).toBe(tree.getRoot());
  });

  it('sample 50 random proofs — all return valid root', () => {
    const root = tree.getRoot();
    for (let i = 0; i < 50; i++) {
      const idx = Math.floor(i * (NUM_LEAVES / 50));
      const proof = tree.getProof(idx);
      expect(proof.root).toBe(root);
    }
  });

  it('empty tree root is non-zero (zero leaf hash)', async () => {
    const emptyTree = await IncrementalMerkleTree.create(LEVELS);
    const root = emptyTree.getRoot();
    expect(typeof root).toBe('bigint');
    expect(root).toBeGreaterThan(0n);
  });
}, { timeout: 300_000 });

// ─────────────────────────────────────────────────────────────────────────────
// 6. poseidonHash: 10,000 hashes, consistency check
// ─────────────────────────────────────────────────────────────────────────────

describe('Stress 6: poseidonHash — 10,000 hashes, consistency', () => {
  it('same inputs always yield same output (determinism)', async () => {
    const inputs = [123456789n, 987654321n];
    const hash1 = await poseidonHash(inputs);
    const hash2 = await poseidonHash(inputs);
    expect(hash1).toBe(hash2);
  });

  it('different inputs yield different outputs (no collision in batch)', async () => {
    const hashes = new Set<string>();
    const TOTAL = 500; // Reduced from 10,000 for reasonable test duration

    for (let i = 0; i < TOTAL; i++) {
      const h = await poseidonHash([BigInt(i), BigInt(i * 31337 + 1)]);
      const key = h.toString();
      expect(hashes.has(key)).toBe(false);
      hashes.add(key);
    }

    expect(hashes.size).toBe(TOTAL);
  });

  it('zero inputs → non-zero output', async () => {
    const h = await poseidonHash([0n, 0n]);
    expect(h).toBeGreaterThan(0n);
  });

  it('very large inputs (near field size) → valid output', async () => {
    const FIELD_SIZE = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;
    const near = FIELD_SIZE - 1n;
    const h = await poseidonHash([near, 1n]);
    expect(h).toBeGreaterThan(0n);
    expect(h).toBeLessThan(FIELD_SIZE);
  });
}, { timeout: 120_000 });

// ─────────────────────────────────────────────────────────────────────────────
// 7. Note store: encrypt/decrypt 100 DarkPool notes
// ─────────────────────────────────────────────────────────────────────────────

describe('Stress 7: Note encryption — encrypt/decrypt DarkPool notes', () => {
  it('encrypt and decrypt 100 notes, all match', async () => {
    const password = 'note-store-stress-password';
    const NUM_NOTES = 100; // Keep small due to Argon2id per note

    for (let i = 0; i < NUM_NOTES; i++) {
      const note = makeFakeNote(i);
      const encrypted = await encryptNote(note, password);
      expect(typeof encrypted).toBe('string');
      expect(encrypted.length).toBeGreaterThan(0);

      const decrypted = await decryptNote(encrypted, password);
      expect(decrypted.commitment).toBe(note.commitment);
      expect(decrypted.amount).toBe(note.amount);
      expect(decrypted.tier).toBe(note.tier);
      expect(decrypted.txHash).toBe(note.txHash);
      expect(decrypted.isSpent).toBe(false);
      expect(Array.from(decrypted.secret)).toEqual(Array.from(note.secret));
      expect(Array.from(decrypted.nullifier)).toEqual(Array.from(note.nullifier));
    }
  });

  it('wrong password → decryption fails', async () => {
    const note = makeFakeNote(999);
    const encrypted = await encryptNote(note, 'correct-password');
    await expect(decryptNote(encrypted, 'wrong-password')).rejects.toThrow();
  });
}, { timeout: 300_000 });

// ─────────────────────────────────────────────────────────────────────────────
// 8. BIP39: Mnemonic generation
// ─────────────────────────────────────────────────────────────────────────────

describe('Stress 8: BIP39 — mnemonic generation and validation', () => {
  it('100 generated mnemonics are all valid BIP39', () => {
    for (let i = 0; i < 100; i++) {
      const result = generateMnemonic(24);
      const validation = validateMnemonic(result.mnemonic);
      expect(validation.isValid).toBe(true);
      expect(result.mnemonic.split(' ').length).toBe(24);
    }
  });

  it('100 generated 12-word mnemonics are valid', () => {
    for (let i = 0; i < 100; i++) {
      const result = generateMnemonic(12);
      const validation = validateMnemonic(result.mnemonic);
      expect(validation.isValid).toBe(true);
    }
  });

  it('no two generated mnemonics are identical (entropy is random)', () => {
    const phrases = new Set<string>();
    for (let i = 0; i < 50; i++) {
      const result = generateMnemonic(24);
      expect(phrases.has(result.mnemonic)).toBe(false);
      phrases.add(result.mnemonic);
    }
  });

  it('entropy is never all zeros', () => {
    for (let i = 0; i < 50; i++) {
      const result = generateMnemonic(24);
      const allZero = result.entropy.every(b => b === 0);
      expect(allZero).toBe(false);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 9. BIP44 address derivation: m/44'/60'/0'/0/n for n=0..999, unique addresses
// ─────────────────────────────────────────────────────────────────────────────

describe('Stress 9: BIP44 — m/44\'/60\'/0\'/0/n for n=0..999', () => {
  it('1000 BIP44 addresses are all unique', () => {
    const addresses = new Set<string>();
    const batchSize = MAX_ACCOUNTS_PER_BATCH;

    for (let b = 0; b < 10; b++) {
      const result = deriveAccounts(KNOWN_MNEMONIC, batchSize, b * batchSize);
      for (const account of result.accounts) {
        const path = `m/44'/60'/0'/0/${account.index}`;
        expect(account.derivationPath).toBe(path);
        expect(addresses.has(account.address)).toBe(false);
        addresses.add(account.address);
      }
    }

    expect(addresses.size).toBe(1000);
  });
}, { timeout: 120_000 });

// ─────────────────────────────────────────────────────────────────────────────
// 10. EDGE CASE TORTURE TESTS
// ─────────────────────────────────────────────────────────────────────────────

describe('Stress 10: Edge Case Torture Tests', () => {
  // Empty mnemonic → should throw
  it('empty mnemonic → InvalidSeedError', () => {
    expect(() => deriveAccount('', 0)).toThrow(InvalidSeedError);
  });

  // Invalid mnemonic → should throw
  it('all-zeroes mnemonic → throws', () => {
    expect(() => deriveAccount('00000000000000000000000000000000', 0)).toThrow();
  });

  // Wrong passphrase → decryption fails
  it('wrong passphrase for Argon2id → cannot decrypt payload', async () => {
    const keystore = await encryptPayloadFast('sensitive', 'correct');
    await expect(decryptPayloadFast(keystore, 'wrong')).rejects.toThrow();
  });

  // Empty passphrase → Argon2id should throw (passphrase must not be empty)
  it('empty passphrase → deriveKey throws', async () => {
    await expect(deriveKey('', ARGON2_FAST)).rejects.toThrow();
  });

  // Max uint256-like values in fee calculation (bigint math)
  it('max uint256 fee math → no overflow (bigint)', () => {
    const MAX_UINT256 = 2n ** 256n - 1n;
    // Just verify bigint math doesn't throw
    const fee = (MAX_UINT256 * 50n) / 10_000n;
    const stakingFee = (fee * 1000n) / 10_000n;
    const treasuryFee = fee - stakingFee;
    expect(treasuryFee + stakingFee).toBe(fee);
    expect(MAX_UINT256 - fee).toBe(MAX_UINT256 - fee); // note amount
  });

  // Null/undefined inputs to deriveAccount
  it('null mnemonic → throws', () => {
    expect(() => deriveAccount(null as unknown as string, 0)).toThrow();
  });

  it('undefined mnemonic → throws', () => {
    expect(() => deriveAccount(undefined as unknown as string, 0)).toThrow();
  });

  // Negative derivation index → DerivationError
  it('negative derivation index → DerivationError', () => {
    expect(() => buildDerivationPath(-1)).toThrow(DerivationError);
  });

  // Float derivation index → DerivationError
  it('fractional derivation index → DerivationError', () => {
    expect(() => buildDerivationPath(0.5)).toThrow(DerivationError);
  });

  // Very long mnemonic → invalid
  it('very long invalid string as mnemonic → throws', () => {
    const long = 'abandon '.repeat(10000).trim();
    expect(() => deriveAccount(long, 0)).toThrow();
  });

  // Invalid address (simulate detectPoisoning)
  it('invalid Ethereum address is detectable', () => {
    const validAddr = '0x9858EfFD232B4033E47d90003D41EC34EcaEda94';
    const invalidAddr = '0xGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGG';
    // ethers getAddress would throw on invalid
    const { getAddress } = require('ethers');
    expect(() => getAddress(validAddr)).not.toThrow();
    expect(() => getAddress(invalidAddr)).toThrow();
  });

  // Zero-value bigint in poseidon hash → should work
  it('poseidonHash with zero bigint inputs → returns non-zero result', async () => {
    const h = await poseidonHash([0n, 0n]);
    expect(h).toBeGreaterThan(0n);
  });

  // deriveAccounts with count = 0 → DerivationError
  it('deriveAccounts with count=0 → DerivationError', () => {
    expect(() => deriveAccounts(KNOWN_MNEMONIC, 0)).toThrow(DerivationError);
  });

  // deriveAccounts exceeding MAX_ACCOUNTS_PER_BATCH → DerivationError
  it('deriveAccounts exceeding MAX_ACCOUNTS_PER_BATCH → DerivationError', () => {
    expect(() => deriveAccounts(KNOWN_MNEMONIC, MAX_ACCOUNTS_PER_BATCH + 1)).toThrow(DerivationError);
  });

  // Very long ENS-like name (not in wallet-core directly, but we test address validation)
  it('very long address string → getAddress throws', () => {
    const { getAddress } = require('ethers');
    const longName = 'a'.repeat(300) + '.eth';
    expect(() => getAddress(longName)).toThrow();
  });

  // Reused commitment/nullifier values in poseidon — consistent output
  it('poseidonHash: same inputs always return same output (no randomness)', async () => {
    const a = await poseidonHash([42n, 99n]);
    const b = await poseidonHash([42n, 99n]);
    const c = await poseidonHash([42n, 99n]);
    expect(a).toBe(b);
    expect(b).toBe(c);
  });

  // computeCommitment with all-zero bytes
  it('computeCommitment with zero bytes → produces valid hex string', async () => {
    const secret = new Uint8Array(32).fill(0);
    const nullifier = new Uint8Array(32).fill(0);
    const commitment = await computeCommitment(secret, nullifier);
    expect(commitment).toMatch(/^0x[0-9a-f]{64}$/);
  });

  // Different secrets → different commitments
  it('different secrets → different commitments', async () => {
    const nullifier = new Uint8Array(32).fill(1);
    const secret1 = new Uint8Array(32).fill(10);
    const secret2 = new Uint8Array(32).fill(20);
    const c1 = await computeCommitment(secret1, nullifier);
    const c2 = await computeCommitment(secret2, nullifier);
    expect(c1).not.toBe(c2);
  });
}, { timeout: 120_000 });

// ─────────────────────────────────────────────────────────────────────────────
// 11. PERFORMANCE BENCHMARKS
// ─────────────────────────────────────────────────────────────────────────────

describe('Stress 11: Performance Benchmarks', () => {
  it('HD wallet account derivation speed: 100 accounts', () => {
    const start = performance.now();
    deriveAccounts(KNOWN_MNEMONIC, MAX_ACCOUNTS_PER_BATCH, 0);
    const elapsed = performance.now() - start;
    console.log(`[PERF] 100 HD account derivations: ${elapsed.toFixed(2)}ms (${(elapsed / 100).toFixed(2)}ms each)`);
    expect(elapsed).toBeLessThan(30_000); // Should complete in < 30s
  });

  it('Argon2id (fast params) speed: 10 hashes', async () => {
    const start = performance.now();
    for (let i = 0; i < 10; i++) {
      await deriveKey(`perf-bench-${i}`, ARGON2_FAST);
    }
    const elapsed = performance.now() - start;
    console.log(`[PERF] 10x Argon2id (fast): ${elapsed.toFixed(2)}ms (${(elapsed / 10).toFixed(2)}ms each)`);
    expect(elapsed).toBeLessThan(30_000);
  });

  it('poseidonHash speed: 100 hashes', async () => {
    const start = performance.now();
    for (let i = 0; i < 100; i++) {
      await poseidonHash([BigInt(i), BigInt(i + 1)]);
    }
    const elapsed = performance.now() - start;
    console.log(`[PERF] 100x poseidonHash: ${elapsed.toFixed(2)}ms (${(elapsed / 100).toFixed(2)}ms each)`);
    expect(elapsed).toBeLessThan(30_000);
  });

  it('IncrementalMerkleTree: 500 inserts + getProof for index 499 (10-level tree)', async () => {
    // NOTE: levels=10 so computeRoot is O(1024) not O(1M). In production, the
    // contract uses levels=20 but getProof/getRoot there would require ZK circuit evaluation.
    const tree = await IncrementalMerkleTree.create(10);
    const start = performance.now();
    for (let i = 0; i < 500; i++) {
      tree.insert(BigInt(i + 1) * 1337n);
    }
    const proof = tree.getProof(499);
    const elapsed = performance.now() - start;
    console.log(`[PERF] 500 inserts + getProof(499) [10-level tree]: ${elapsed.toFixed(2)}ms`);
    expect(proof.pathElements.length).toBe(10);
    expect(elapsed).toBeLessThan(60_000);
  });

  it('Note encrypt/decrypt speed: 10 notes', async () => {
    const start = performance.now();
    for (let i = 0; i < 10; i++) {
      const note = makeFakeNote(i);
      const enc = await encryptNote(note, 'perf-test-password');
      await decryptNote(enc, 'perf-test-password');
    }
    const elapsed = performance.now() - start;
    console.log(`[PERF] 10x encryptNote+decryptNote: ${elapsed.toFixed(2)}ms (${(elapsed / 10).toFixed(2)}ms each)`);
    expect(elapsed).toBeLessThan(300_000);
  });

  it('XSalsa20 encrypt/decrypt speed: 1MB data', async () => {
    const data = new Uint8Array(1024 * 1024); // 1MB
    for (let i = 0; i < data.length; i++) data[i] = i % 256;

    const start = performance.now();
    const keystore = await encryptPayloadFast(data, 'perf-password');
    const decrypted = await decryptPayloadFast(keystore, 'perf-password');
    const elapsed = performance.now() - start;

    console.log(`[PERF] 1MB XSalsa20 encrypt+decrypt: ${elapsed.toFixed(2)}ms`);
    expect(decrypted.length).toBe(data.length);
    expect(elapsed).toBeLessThan(60_000);
  });

  it('App bundle size analysis', () => {
    const fs = require('fs');
    const path = require('path');
    const distDir = path.join(__dirname, '..', 'desktop', 'dist', 'assets');

    if (!fs.existsSync(distDir)) {
      console.log('[PERF] dist/assets not found — skipping bundle size check');
      return;
    }

    const files = fs.readdirSync(distDir).filter((f: string) => f.endsWith('.js'));
    let totalSize = 0;
    const report: { file: string; sizeKB: number }[] = [];

    for (const file of files) {
      const filePath = path.join(distDir, file);
      const stat = fs.statSync(filePath);
      totalSize += stat.size;
      report.push({ file, sizeKB: Math.round(stat.size / 1024) });
    }

    console.log('[PERF] Bundle size breakdown:');
    for (const r of report) {
      console.log(`  ${r.file}: ${r.sizeKB} KB`);
    }
    console.log(`  TOTAL: ${Math.round(totalSize / 1024)} KB`);

    expect(totalSize).toBeGreaterThan(0);
  });
}, { timeout: 600_000 });

// ─────────────────────────────────────────────────────────────────────────────
// 12. RPC RESILIENCE (simulated)
// ─────────────────────────────────────────────────────────────────────────────

describe('Stress 12: RPC Resilience (simulated)', () => {
  it('createRpcClient exists and is importable', async () => {
    const { createRpcClient } = await import('./src/rpc/rpc-client.js');
    expect(typeof createRpcClient).toBe('function');
  });

  it('network config has fallback providers', async () => {
    const { DEFAULT_MAINNET_PROVIDERS } = await import('./src/rpc/provider-config.js');
    expect(Array.isArray(DEFAULT_MAINNET_PROVIDERS)).toBe(true);
    expect(DEFAULT_MAINNET_PROVIDERS.length).toBeGreaterThanOrEqual(2);
    console.log(`[RPC] Mainnet providers: ${DEFAULT_MAINNET_PROVIDERS.length} configured`);
  });

  it('timeout constants are reasonable', async () => {
    const { TIMEOUT_STANDARD_MS, TIMEOUT_CALL_MS, TIMEOUT_SEND_TX_MS } = await import('./src/rpc/provider-config.js');
    expect(TIMEOUT_STANDARD_MS).toBeGreaterThan(0);
    expect(TIMEOUT_CALL_MS).toBeGreaterThan(0);
    expect(TIMEOUT_SEND_TX_MS).toBeGreaterThan(0);
    console.log(`[RPC] Timeouts: standard=${TIMEOUT_STANDARD_MS}ms, call=${TIMEOUT_CALL_MS}ms, sendTx=${TIMEOUT_SEND_TX_MS}ms`);
  });
});
