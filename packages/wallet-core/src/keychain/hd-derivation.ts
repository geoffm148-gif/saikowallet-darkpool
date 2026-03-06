/**
 * BIP-44 HD wallet key derivation.
 *
 * WHY: BIP-44 provides a standard derivation path hierarchy so any wallet
 * can regenerate the same accounts from a seed. The Ethereum path is:
 *   m / 44' / 60' / account' / change / address_index
 * where 44'=BIP-44, 60'=ETH coin type, 0'=first account, 0=external chain.
 *
 * We use HDNodeWallet from ethers v6 which correctly handles:
 * - HMAC-SHA512-based child key derivation (BIP-32)
 * - Hardened derivation (indicated by apostrophe — bit-flip on index)
 * - secp256k1 private key generation from derived entropy
 *
 * Standard: BIP-32, BIP-44
 */

import { HDNodeWallet, Mnemonic, getAddress } from 'ethers';
import type { WalletAccount, DerivedAccounts } from '../types/index.js';
import { assertValidMnemonic } from './seed-validator.js';
import { DerivationError } from '../errors.js';

/** BIP-44 Ethereum coin type path (m/44'/60'/0'/0) */
export const DEFAULT_DERIVATION_PATH = "m/44'/60'/0'/0";

/** Maximum accounts to derive in a single batch — prevents infinite loops */
export const MAX_ACCOUNTS_PER_BATCH = 100;

/**
 * Build the full BIP-44 derivation path for a given address index.
 * WHY: Keeping path construction in one place prevents typos across modules.
 */
export function buildDerivationPath(index: number, basePath = DEFAULT_DERIVATION_PATH): string {
  if (index < 0 || !Number.isInteger(index)) {
    throw new DerivationError(`Derivation index must be a non-negative integer, got: ${index}`);
  }
  return `${basePath}/${index}`;
}

/**
 * Derive a single Ethereum account from a mnemonic at the given index.
 * The returned WalletAccount contains only public information — private key
 * is NOT included in the return value.
 *
 * WHY we return WalletAccount not HDNodeWallet: consumers should never hold
 * raw private key material longer than necessary. Sign operations receive
 * the wallet object ephemerally within the signing function.
 */
export function deriveAccount(mnemonic: string, index: number): WalletAccount {
  assertValidMnemonic(mnemonic);

  const path = buildDerivationPath(index);

  let wallet: HDNodeWallet;
  try {
    wallet = HDNodeWallet.fromMnemonic(
      Mnemonic.fromPhrase(mnemonic),
      path,
    );
  } catch (err) {
    throw new DerivationError(
      `Failed to derive account at index ${index}: ${err instanceof Error ? err.message : 'unknown'}`,
      err,
    );
  }

  return {
    address: getAddress(wallet.address), // EIP-55 checksum
    derivationPath: path,
    index,
    publicKey: wallet.publicKey,
  };
}

/**
 * Derive multiple accounts from a single mnemonic.
 * Accounts are derived sequentially from index `startIndex` to `startIndex + count - 1`.
 *
 * WHY we limit to MAX_ACCOUNTS_PER_BATCH: HD derivation is CPU-bound.
 * Requesting thousands of accounts would block the thread.
 */
export function deriveAccounts(
  mnemonic: string,
  count: number,
  startIndex = 0,
): DerivedAccounts {
  if (count <= 0 || !Number.isInteger(count)) {
    throw new DerivationError(`Account count must be a positive integer, got: ${count}`);
  }
  if (count > MAX_ACCOUNTS_PER_BATCH) {
    throw new DerivationError(
      `Requested ${count} accounts exceeds batch limit of ${MAX_ACCOUNTS_PER_BATCH}`,
    );
  }

  assertValidMnemonic(mnemonic);

  // Derive master key fingerprint from the root node (coin-type level)
  // WHY: The fingerprint identifies which HD master key a set of accounts belongs to
  // without exposing any key material.
  let masterFingerprint: string;
  try {
    const rootNode = HDNodeWallet.fromMnemonic(Mnemonic.fromPhrase(mnemonic));
    masterFingerprint = rootNode.fingerprint;
  } catch (err) {
    throw new DerivationError('Failed to derive master fingerprint', err);
  }

  const accounts: WalletAccount[] = [];
  for (let i = 0; i < count; i++) {
    accounts.push(deriveAccount(mnemonic, startIndex + i));
  }

  return {
    accounts,
    masterFingerprint,
  };
}

/**
 * Derive an HDNodeWallet for signing purposes.
 * Returns the full wallet object — caller is responsible for NOT storing this.
 *
 * WHY separate from deriveAccount: We return the full wallet ONLY inside the
 * signer module which immediately uses it and lets it go out of scope.
 */
export function deriveSigningWallet(mnemonic: string, index: number): HDNodeWallet {
  assertValidMnemonic(mnemonic);

  const path = buildDerivationPath(index);

  try {
    return HDNodeWallet.fromMnemonic(
      Mnemonic.fromPhrase(mnemonic),
      path,
    );
  } catch (err) {
    throw new DerivationError(
      `Failed to derive signing wallet at index ${index}`,
      err,
    );
  }
}
