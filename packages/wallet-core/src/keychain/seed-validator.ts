/**
 * BIP-39 mnemonic validation.
 *
 * WHY: We validate three independent properties:
 * 1. Word count (12 or 24) — other counts are non-standard for ETH wallets
 * 2. Wordlist membership — every word must exist in the BIP-39 English list
 * 3. Checksum — BIP-39 embeds a SHA-256 checksum in the final bits; an
 *    invalid checksum means the phrase was corrupted or mistyped.
 *
 * All three must pass before we attempt key derivation.
 * Standard: BIP-39
 */

import { Mnemonic, wordlists } from 'ethers';
import type { MnemonicWordCount } from '../types/index.js';
import { InvalidSeedError } from '../errors.js';

const VALID_WORD_COUNTS: ReadonlySet<number> = new Set([12, 24]);

/** BIP-39 English wordlist — 2048 words */
// WHY assert: ethers always ships with the English wordlist; if this
// somehow fails, we want a hard crash at startup, not silent bypass.
const englishWordlist = wordlists.en;
if (!englishWordlist) {
  throw new Error('BIP-39 English wordlist not available — ethers misconfigured');
}
const BIP39_WORDS: ReadonlySet<string> = new Set(
  Array.from({ length: 2048 }, (_, i) => englishWordlist.getWord(i)),
);

export interface ValidationResult {
  readonly isValid: boolean;
  readonly errors: readonly string[];
}

/**
 * Validate a BIP-39 mnemonic phrase.
 * Returns a result object rather than throwing, so UI can display all errors at once.
 */
export function validateMnemonic(phrase: string): ValidationResult {
  const errors: string[] = [];
  const words = phrase.trim().toLowerCase().split(/\s+/);

  // Check 1: Word count
  if (!VALID_WORD_COUNTS.has(words.length)) {
    errors.push(
      `Invalid word count: got ${words.length}, expected 12 or 24`,
    );
  }

  // Check 2: All words must be in the BIP-39 English wordlist
  const invalidWords = words.filter((word) => !BIP39_WORDS.has(word));
  if (invalidWords.length > 0) {
    errors.push(
      `Unknown BIP-39 words: ${invalidWords.join(', ')}`,
    );
  }

  // Check 3: BIP-39 checksum (only if word count and wordlist are OK)
  if (errors.length === 0) {
    const isChecksumValid = Mnemonic.isValidMnemonic(phrase.trim().toLowerCase());
    if (!isChecksumValid) {
      errors.push('Invalid BIP-39 checksum — phrase may have been corrupted or mistyped');
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Validate a mnemonic and throw InvalidSeedError if invalid.
 * Use this in code paths where invalid input should hard-fail (e.g. key derivation).
 */
export function assertValidMnemonic(phrase: string): void {
  const result = validateMnemonic(phrase);
  if (!result.isValid) {
    throw new InvalidSeedError(
      `Invalid mnemonic: ${result.errors.join('; ')}`,
    );
  }
}

/**
 * Determine whether a word count is a valid BIP-39 count for Ethereum.
 */
export function isValidWordCount(count: number): count is MnemonicWordCount {
  return VALID_WORD_COUNTS.has(count);
}
