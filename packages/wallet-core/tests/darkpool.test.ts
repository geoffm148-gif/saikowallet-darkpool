import { describe, expect, it, beforeEach, vi } from 'vitest';
import {
  DARKPOOL_TIERS,
  DARKPOOL_FEE_BPS,
  DARKPOOL_FEE_DENOMINATOR,
  calculateDarkPoolFee,
  calculateAmountAfterFee,
  formatDarkPoolFeeBreakdown,
  generateSecret,
  generateNullifier,
  computeCommitment,
  poseidonHash,
  encryptNote,
  decryptNote,
  saveNote,
  loadNotes,
  markNoteSpent,
  exportNoteAsJson,
  generateComplianceProof,
  getPrivacyLevel,
} from '../src/darkpool/index.js';
import type { DarkPoolNote } from '../src/darkpool/index.js';

// ─── Mock localStorage ──────────────────────────────────────────────────────

const store: Record<string, string> = {};

beforeEach(() => {
  for (const key of Object.keys(store)) delete store[key];

  vi.stubGlobal('localStorage', {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { for (const key of Object.keys(store)) delete store[key]; },
    get length() { return Object.keys(store).length; },
    key: (i: number) => Object.keys(store)[i] ?? null,
  });
});

// ─── Helper ─────────────────────────────────────────────────────────────────

function createMockNote(overrides?: Partial<DarkPoolNote>): DarkPoolNote {
  return {
    secret: new Uint8Array(32).fill(1),
    nullifier: new Uint8Array(32).fill(2),
    commitment: '0x' + 'ab'.repeat(32),
    amount: 9_950_000n,
    tier: 0,
    timestamp: 1700000000000,
    txHash: '0x' + 'ff'.repeat(32),
    viewingKey: new Uint8Array(32).fill(3),
    isSpent: false,
    ...overrides,
  };
}

// ─── Fee Calculation ────────────────────────────────────────────────────────

describe('DarkPool Fee Calculation', () => {
  it('calculates fee for Tier 1 (10M SAIKO)', () => {
    const tier = DARKPOOL_TIERS[0]; // 10_000_000n
    const fee = calculateDarkPoolFee(tier);
    // 50 * 10_000_000 / 10_000 = 50_000
    expect(fee).toBe(50_000n);
  });

  it('calculates fee for Tier 2 (100M SAIKO)', () => {
    const tier = DARKPOOL_TIERS[1]; // 100_000_000n
    const fee = calculateDarkPoolFee(tier);
    expect(fee).toBe(500_000n);
  });

  it('calculates fee for Tier 3 (1B SAIKO)', () => {
    const tier = DARKPOOL_TIERS[2]; // 1_000_000_000n
    const fee = calculateDarkPoolFee(tier);
    expect(fee).toBe(5_000_000n);
  });

  it('calculates fee for Tier 4 (10B SAIKO)', () => {
    const tier = DARKPOOL_TIERS[3]; // 10_000_000_000n
    const fee = calculateDarkPoolFee(tier);
    expect(fee).toBe(50_000_000n);
  });

  it('all tiers: fee = BPS * amount / denominator', () => {
    for (const tier of DARKPOOL_TIERS) {
      const fee = calculateDarkPoolFee(tier);
      expect(fee).toBe((DARKPOOL_FEE_BPS * tier) / DARKPOOL_FEE_DENOMINATOR);
    }
  });

  it('amountAfterFee = tier - fee for all tiers', () => {
    for (const tier of DARKPOOL_TIERS) {
      const fee = calculateDarkPoolFee(tier);
      const after = calculateAmountAfterFee(tier);
      expect(after).toBe(tier - fee);
    }
  });

  it('formatDarkPoolFeeBreakdown returns correct structure', () => {
    const tier = DARKPOOL_TIERS[0];
    const breakdown = formatDarkPoolFeeBreakdown(tier);
    expect(breakdown.tier).toBe(tier);
    expect(breakdown.fee).toBe(50_000n);
    expect(breakdown.amountAfterFee).toBe(9_950_000n);
  });
});

// ─── Crypto Primitives ──────────────────────────────────────────────────────

describe('DarkPool Crypto', () => {
  it('generateSecret returns a 32-byte Uint8Array', () => {
    const secret = generateSecret();
    expect(secret).toBeInstanceOf(Uint8Array);
    expect(secret.length).toBe(32);
  });

  it('generateNullifier returns a 32-byte Uint8Array', () => {
    const nullifier = generateNullifier();
    expect(nullifier).toBeInstanceOf(Uint8Array);
    expect(nullifier.length).toBe(32);
  });

  it('generateSecret produces different values each call', () => {
    const a = generateSecret();
    const b = generateSecret();
    expect(a).not.toEqual(b);
  });

  it('computeCommitment returns a 0x-prefixed hex string', async () => {
    const secret = new Uint8Array(32).fill(0xaa);
    const nullifier = new Uint8Array(32).fill(0xbb);
    const commitment = await computeCommitment(secret, nullifier);
    expect(commitment).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it('same inputs produce same commitment', async () => {
    const secret = new Uint8Array(32).fill(0xaa);
    const nullifier = new Uint8Array(32).fill(0xbb);
    const c1 = await computeCommitment(secret, nullifier);
    const c2 = await computeCommitment(secret, nullifier);
    expect(c1).toBe(c2);
  });

  it('different inputs produce different commitments', async () => {
    const secret1 = new Uint8Array(32).fill(0xaa);
    const secret2 = new Uint8Array(32).fill(0xcc);
    const nullifier = new Uint8Array(32).fill(0xbb);
    const c1 = await computeCommitment(secret1, nullifier);
    const c2 = await computeCommitment(secret2, nullifier);
    expect(c1).not.toBe(c2);
  });

  it('poseidonHash returns a bigint', async () => {
    const result = await poseidonHash([1n, 2n, 3n]);
    expect(typeof result).toBe('bigint');
    expect(result > 0n).toBe(true);
  });
});

// ─── Encrypt / Decrypt Round-Trip ───────────────────────────────────────────

describe('DarkPool Note Encryption', () => {
  it('encrypt then decrypt returns identical note', async () => {
    const note = createMockNote();
    const password = 'test-password-123';

    const encrypted = await encryptNote(note, password);
    expect(typeof encrypted).toBe('string');
    expect(encrypted.length).toBeGreaterThan(0);

    const decrypted = await decryptNote(encrypted, password);
    expect(decrypted.commitment).toBe(note.commitment);
    expect(decrypted.amount).toBe(note.amount);
    expect(decrypted.tier).toBe(note.tier);
    expect(decrypted.timestamp).toBe(note.timestamp);
    expect(decrypted.txHash).toBe(note.txHash);
    expect(decrypted.isSpent).toBe(note.isSpent);
    expect(Array.from(decrypted.secret)).toEqual(Array.from(note.secret));
    expect(Array.from(decrypted.nullifier)).toEqual(Array.from(note.nullifier));
    expect(Array.from(decrypted.viewingKey)).toEqual(Array.from(note.viewingKey));
  });

  it('wrong password fails to decrypt', async () => {
    const note = createMockNote();
    const encrypted = await encryptNote(note, 'correct-password');
    await expect(decryptNote(encrypted, 'wrong-password')).rejects.toThrow();
  });
});

// ─── Note Store ─────────────────────────────────────────────────────────────

describe('DarkPool Note Store', () => {
  const password = 'store-test-pw';

  it('saveNote + loadNotes round-trip', async () => {
    const note = createMockNote();
    await saveNote(note, password);

    const loaded = await loadNotes(password);
    expect(loaded).toHaveLength(1);
    expect(loaded[0].commitment).toBe(note.commitment);
    expect(loaded[0].amount).toBe(note.amount);
  });

  it('saves multiple notes', async () => {
    const note1 = createMockNote({ commitment: '0x' + 'aa'.repeat(32) });
    const note2 = createMockNote({ commitment: '0x' + 'bb'.repeat(32) });

    await saveNote(note1, password);
    await saveNote(note2, password);

    const loaded = await loadNotes(password);
    expect(loaded).toHaveLength(2);
  });

  it('markNoteSpent correctly updates isSpent', async () => {
    const note = createMockNote({ commitment: '0x' + 'cc'.repeat(32), isSpent: false });
    await saveNote(note, password);

    await markNoteSpent('0x' + 'cc'.repeat(32), password);

    const loaded = await loadNotes(password);
    expect(loaded[0].isSpent).toBe(true);
  });

  it('loadNotes returns empty array when no notes stored', async () => {
    const loaded = await loadNotes(password);
    expect(loaded).toEqual([]);
  });

  it('exportNoteAsJson returns valid JSON with correct fields', () => {
    const note = createMockNote();
    const json = exportNoteAsJson(note);
    const parsed = JSON.parse(json);
    expect(parsed.commitment).toBe(note.commitment);
    expect(parsed.amount).toBe(note.amount.toString());
    expect(parsed.tier).toBe(note.tier);
    expect(parsed.isSpent).toBe(false);
  });
});

// ─── Compliance Proof ───────────────────────────────────────────────────────

describe('DarkPool Compliance Proof', () => {
  it('generates ownership proof with correct type', async () => {
    const note = createMockNote();
    const proof = await generateComplianceProof(note, 'ownership');
    expect(proof.type).toBe('ownership');
    expect(proof.depositTxHash).toBe(note.txHash);
    expect(typeof proof.proof).toBe('string');
    expect(proof.generatedAt).toBeGreaterThan(0);
  });

  it('generates link proof with withdrawalTxHash', async () => {
    const note = createMockNote();
    const withdrawalTx = '0x' + 'dd'.repeat(32);
    const proof = await generateComplianceProof(note, 'link', withdrawalTx);
    expect(proof.type).toBe('link');
    expect(proof.withdrawalTxHash).toBe(withdrawalTx);
  });

  it('generates source proof', async () => {
    const note = createMockNote();
    const proof = await generateComplianceProof(note, 'source');
    expect(proof.type).toBe('source');
  });

  it('generates innocence proof', async () => {
    const note = createMockNote();
    const proof = await generateComplianceProof(note, 'innocence');
    expect(proof.type).toBe('innocence');
  });
});

// ─── Privacy Level ──────────────────────────────────────────────────────────

describe('Privacy Level', () => {
  it('returns "low" for count 5', () => {
    expect(getPrivacyLevel(5)).toBe('low');
  });

  it('returns "moderate" for count 50', () => {
    expect(getPrivacyLevel(50)).toBe('moderate');
  });

  it('returns "strong" for count 150', () => {
    expect(getPrivacyLevel(150)).toBe('strong');
  });

  it('returns "low" for count 0', () => {
    expect(getPrivacyLevel(0)).toBe('low');
  });

  it('returns "low" for count 9 (boundary)', () => {
    expect(getPrivacyLevel(9)).toBe('low');
  });

  it('returns "moderate" for count 10 (boundary)', () => {
    expect(getPrivacyLevel(10)).toBe('moderate');
  });

  it('returns "moderate" for count 99 (boundary)', () => {
    expect(getPrivacyLevel(99)).toBe('moderate');
  });

  it('returns "strong" for count 100 (boundary)', () => {
    expect(getPrivacyLevel(100)).toBe('strong');
  });
});
