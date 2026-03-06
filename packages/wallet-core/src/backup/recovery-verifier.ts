/**
 * Recovery verification — prove a mnemonic produces the expected wallet address.
 *
 * WHY verify before first deposit: If the user writes down their seed phrase
 * incorrectly, they won't know until they try to recover — by which point
 * their funds may be in an unrecoverable address. Making them verify the
 * seed → address derivation before depositing any funds prevents this.
 *
 * Flow:
 *   1. User backs up seed phrase
 *   2. App asks them to re-enter the seed phrase
 *   3. App derives the first account address from the entered phrase
 *   4. Compare to the address shown during onboarding
 *   5. Only mark backup as verified if they match exactly
 *
 * Standard: BIP-39 (mnemonic → seed), BIP-44 (seed → Ethereum address)
 */

import { deriveAccount } from '../keychain/hd-derivation.js';
import { validateMnemonic } from '../keychain/seed-validator.js';
import { getAddress } from 'ethers';
import { RecoveryVerificationError } from '../errors.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RecoveryVerification {
  /** True only if derivedAddress exactly matches expectedAddress. */
  readonly isValid: boolean;
  /** The Ethereum address derived from the provided mnemonic (EIP-55 checksummed). */
  readonly derivedAddress: string;
  /** The expected address (EIP-55 checksummed, as provided by caller). */
  readonly expectedAddress: string;
  /** Whether derivedAddress === expectedAddress (redundant with isValid, included for clarity). */
  readonly matchesExpected: boolean;
}

// ─── Constants ────────────────────────────────────────────────────────────────

/**
 * Derivation index used for recovery verification.
 * WHY index 0: The first account (index 0) is the primary wallet address.
 * If the user can reproduce this address, they can reproduce all subsequent
 * accounts — the master seed is verified.
 */
const VERIFICATION_ACCOUNT_INDEX = 0;

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Verify that a mnemonic phrase correctly derives to an expected Ethereum address.
 *
 * @param mnemonic         - The mnemonic phrase to verify (space-separated words)
 * @param expectedAddress  - The Ethereum address the wallet expects (EIP-55 or lowercase)
 *
 * WHY we return a result object rather than throw on mismatch:
 * A mismatch is not an error — it's valid information ("user entered wrong seed").
 * The caller can show a clear UI message instead of catching an exception.
 *
 * Throws RecoveryVerificationError only on truly unexpected failures
 * (e.g., invalid address format, cryptographic failure) — not on mismatch.
 */
export function verifyRecoveryCapability(
  mnemonic: string,
  expectedAddress: string,
): RecoveryVerification {
  // Validate the mnemonic first — give a clear error if it's structurally wrong
  const mnemonicValidation = validateMnemonic(mnemonic);
  if (!mnemonicValidation.isValid) {
    throw new RecoveryVerificationError(
      `Invalid mnemonic phrase: ${mnemonicValidation.errors.join('; ') || 'unknown error'}. ` +
      'Check that all words are spelled correctly and the phrase has the correct length.',
    );
  }

  // Normalize and validate the expected address
  let normalizedExpected: string;
  try {
    normalizedExpected = getAddress(expectedAddress.trim());
  } catch {
    throw new RecoveryVerificationError(
      `Invalid expected address: "${expectedAddress}". Must be a valid Ethereum address.`,
    );
  }

  // Derive the first account from the mnemonic
  let derivedAddress: string;
  try {
    const account = deriveAccount(mnemonic.trim(), VERIFICATION_ACCOUNT_INDEX);
    derivedAddress = account.address; // Already EIP-55 checksummed
  } catch (err) {
    throw new RecoveryVerificationError(
      'Failed to derive address from mnemonic — unexpected cryptographic error.',
      err,
    );
  }

  // Case-insensitive comparison (both are EIP-55 checksummed, but be defensive)
  const matchesExpected = derivedAddress.toLowerCase() === normalizedExpected.toLowerCase();

  return {
    isValid: matchesExpected,
    derivedAddress,
    expectedAddress: normalizedExpected,
    matchesExpected,
  };
}

/**
 * Verify that a set of mnemonics all produce the same address.
 * Useful for confirming multiple seed phrase fragments encode the same wallet.
 *
 * WHY: When using Shamir SSS, the user may reconstruct the seed from shares
 * and want to verify the resulting mnemonic before trusting it with funds.
 */
export function verifyMnemonicsMatch(mnemonics: readonly string[]): boolean {
  if (mnemonics.length < 2) {
    throw new RecoveryVerificationError(
      'At least 2 mnemonics required for cross-verification',
    );
  }

  const addresses = mnemonics.map((mnemonic, i) => {
    const validation = validateMnemonic(mnemonic);
    if (!validation.isValid) {
      throw new RecoveryVerificationError(
        `Mnemonic at index ${i} is invalid: ${validation.errors.join('; ') || 'unknown error'}`,
      );
    }
    const account = deriveAccount(mnemonic.trim(), VERIFICATION_ACCOUNT_INDEX);
    return account.address.toLowerCase();
  });

  // All addresses must be identical
  const firstAddress = addresses[0]!;
  return addresses.every((addr) => addr === firstAddress);
}
