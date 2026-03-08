/**
 * Keychain tests — BIP-39 mnemonic generation, BIP-44 derivation, validation.
 *
 * Uses known BIP-39 / BIP-44 test vectors where applicable.
 * Source: https://github.com/trezor/python-mnemonic/blob/master/vectors.json
 *         https://github.com/bitcoin/bips/blob/master/bip-0044.mediawiki
 */

import { describe, it, expect } from 'vitest';
import { generateMnemonic } from '../src/keychain/mnemonic-generator.js';
import {
  validateMnemonic,
  assertValidMnemonic,
  isValidWordCount,
} from '../src/keychain/seed-validator.js';
import {
  deriveAccount,
  deriveAccounts,
  buildDerivationPath,
  DEFAULT_DERIVATION_PATH,
  MAX_ACCOUNTS_PER_BATCH,
} from '../src/keychain/hd-derivation.js';
import { InvalidSeedError, DerivationError } from '../src/errors.js';
import { getAddress } from 'ethers';

// ─── Known BIP-39 Test Vectors ────────────────────────────────────────────────
// These are the official BIP-39 test vectors for English wordlist.
// We test round-trip: entropy → mnemonic → validation → derivation.

const VALID_12_WORD_MNEMONIC =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

const VALID_24_WORD_MNEMONIC =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon art';

// Known derived address for the 12-word "abandon * 11 + about" mnemonic
// Path: m/44'/60'/0'/0/0 — verified against multiple independent implementations
const KNOWN_ADDRESS_12W_INDEX0 = '0x9858EfFD232B4033E47d90003D41EC34EcaEda94';

// ─── Mnemonic Generation ──────────────────────────────────────────────────────

describe('generateMnemonic', () => {
  it('generates a 24-word mnemonic by default', () => {
    const result = generateMnemonic(24);
    const words = result.mnemonic.trim().split(/\s+/);
    expect(words).toHaveLength(24);
  });

  it('generates a 12-word mnemonic', () => {
    const result = generateMnemonic(12);
    const words = result.mnemonic.trim().split(/\s+/);
    expect(words).toHaveLength(12);
  });

  it('returns a valid BIP-39 mnemonic (passes checksum)', () => {
    const result = generateMnemonic(24);
    const validation = validateMnemonic(result.mnemonic);
    expect(validation.isValid).toBe(true);
  });

  it('returns unique mnemonics on each call (entropy is random)', () => {
    const a = generateMnemonic(24);
    const b = generateMnemonic(24);
    expect(a.mnemonic).not.toBe(b.mnemonic);
  });

  it('returns entropy buffer of correct length for 24 words (32 bytes)', () => {
    const result = generateMnemonic(24);
    expect(result.entropy).toHaveLength(32);
  });

  it('returns entropy buffer of correct length for 12 words (16 bytes)', () => {
    const result = generateMnemonic(12);
    expect(result.entropy).toHaveLength(16);
  });

  it('entropy is not all zeros (CSPRNG is working)', () => {
    const result = generateMnemonic(24);
    const allZero = result.entropy.every((b) => b === 0);
    expect(allZero).toBe(false);
  });
});

// ─── Mnemonic Validation ──────────────────────────────────────────────────────

describe('validateMnemonic', () => {
  it('validates a correct 12-word mnemonic', () => {
    const result = validateMnemonic(VALID_12_WORD_MNEMONIC);
    expect(result.isValid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('validates a correct 24-word mnemonic', () => {
    const result = validateMnemonic(VALID_24_WORD_MNEMONIC);
    expect(result.isValid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('rejects a mnemonic with wrong word count (11 words)', () => {
    const truncated = VALID_12_WORD_MNEMONIC.split(' ').slice(0, 11).join(' ');
    const result = validateMnemonic(truncated);
    expect(result.isValid).toBe(false);
    expect(result.errors.some((e) => e.includes('word count'))).toBe(true);
  });

  it('rejects a mnemonic with an invalid BIP-39 word', () => {
    const withInvalidWord = VALID_12_WORD_MNEMONIC.replace('about', 'saiko');
    const result = validateMnemonic(withInvalidWord);
    expect(result.isValid).toBe(false);
    expect(result.errors.some((e) => e.includes('saiko') || e.includes('word'))).toBe(true);
  });

  it('rejects a mnemonic with invalid checksum (word substitution)', () => {
    // Replace last word to corrupt checksum while keeping valid words
    const words = VALID_12_WORD_MNEMONIC.split(' ');
    words[11] = 'zoo'; // Valid BIP-39 word but wrong checksum
    const result = validateMnemonic(words.join(' '));
    expect(result.isValid).toBe(false);
  });

  it('handles extra whitespace gracefully', () => {
    const withExtraSpaces = '  ' + VALID_12_WORD_MNEMONIC + '  ';
    const result = validateMnemonic(withExtraSpaces);
    expect(result.isValid).toBe(true);
  });

  it('is case-insensitive', () => {
    const upper = VALID_12_WORD_MNEMONIC.toUpperCase();
    const result = validateMnemonic(upper);
    expect(result.isValid).toBe(true);
  });
});

describe('assertValidMnemonic', () => {
  it('does not throw for valid mnemonic', () => {
    expect(() => assertValidMnemonic(VALID_12_WORD_MNEMONIC)).not.toThrow();
  });

  it('throws InvalidSeedError for invalid mnemonic', () => {
    expect(() => assertValidMnemonic('not a valid mnemonic phrase at all')).toThrow(
      InvalidSeedError,
    );
  });
});

describe('isValidWordCount', () => {
  it('accepts 12', () => expect(isValidWordCount(12)).toBe(true));
  it('accepts 24', () => expect(isValidWordCount(24)).toBe(true));
  it('rejects 15', () => expect(isValidWordCount(15)).toBe(false));
  it('rejects 0', () => expect(isValidWordCount(0)).toBe(false));
});

// ─── HD Derivation ────────────────────────────────────────────────────────────

describe('buildDerivationPath', () => {
  it('builds correct path for index 0', () => {
    expect(buildDerivationPath(0)).toBe("m/44'/60'/0'/0/0");
  });

  it('builds correct path for index 5', () => {
    expect(buildDerivationPath(5)).toBe("m/44'/60'/0'/0/5");
  });

  it('supports custom base path', () => {
    expect(buildDerivationPath(0, "m/44'/60'/1'/0")).toBe("m/44'/60'/1'/0/0");
  });

  it('throws for negative index', () => {
    expect(() => buildDerivationPath(-1)).toThrow(DerivationError);
  });

  it('throws for non-integer index', () => {
    expect(() => buildDerivationPath(1.5)).toThrow(DerivationError);
  });
});

describe('deriveAccount', () => {
  it('derives a valid Ethereum address from known mnemonic at index 0', () => {
    const account = deriveAccount(VALID_12_WORD_MNEMONIC, 0);
    // Verify the address matches known test vector
    expect(account.address).toBe(getAddress(KNOWN_ADDRESS_12W_INDEX0));
  });

  it('returns correct derivation path', () => {
    const account = deriveAccount(VALID_12_WORD_MNEMONIC, 0);
    expect(account.derivationPath).toBe(`${DEFAULT_DERIVATION_PATH}/0`);
  });

  it('returns EIP-55 checksummed address', () => {
    const account = deriveAccount(VALID_12_WORD_MNEMONIC, 0);
    // getAddress returns checksummed — if already checksummed, they match
    expect(account.address).toBe(getAddress(account.address));
  });

  it('derives different addresses for different indices', () => {
    const acc0 = deriveAccount(VALID_12_WORD_MNEMONIC, 0);
    const acc1 = deriveAccount(VALID_12_WORD_MNEMONIC, 1);
    expect(acc0.address).not.toBe(acc1.address);
  });

  it('returns the account index', () => {
    const account = deriveAccount(VALID_12_WORD_MNEMONIC, 7);
    expect(account.index).toBe(7);
  });

  it('throws InvalidSeedError for invalid mnemonic', () => {
    expect(() => deriveAccount('invalid mnemonic', 0)).toThrow(InvalidSeedError);
  });
});

describe('deriveAccounts (batch)', () => {
  it('derives the correct number of accounts', () => {
    const result = deriveAccounts(VALID_12_WORD_MNEMONIC, 5);
    expect(result.accounts).toHaveLength(5);
  });

  it('starts from the specified index', () => {
    const result = deriveAccounts(VALID_12_WORD_MNEMONIC, 3, 5);
    expect(result.accounts[0]?.index).toBe(5);
    expect(result.accounts[2]?.index).toBe(7);
  });

  it('throws for count exceeding MAX_ACCOUNTS_PER_BATCH', () => {
    expect(() => deriveAccounts(VALID_12_WORD_MNEMONIC, MAX_ACCOUNTS_PER_BATCH + 1)).toThrow(
      DerivationError,
    );
  });

  it('returns a masterFingerprint string', () => {
    const result = deriveAccounts(VALID_12_WORD_MNEMONIC, 1);
    expect(typeof result.masterFingerprint).toBe('string');
    expect(result.masterFingerprint.length).toBeGreaterThan(0);
  });

  it('all derived addresses are unique', () => {
    const result = deriveAccounts(VALID_12_WORD_MNEMONIC, 10);
    const addresses = result.accounts.map((a) => a.address);
    const unique = new Set(addresses);
    expect(unique.size).toBe(10);
  });
});
