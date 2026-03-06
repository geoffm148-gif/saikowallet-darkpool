/**
 * Offline transaction signing.
 *
 * WHY offline signing: The signing operation uses the private key, which should
 * NEVER touch the network. We sign offline, then broadcast the serialized
 * signed transaction. This architecture allows airgap signing in future.
 *
 * WHY EIP-155: EIP-155 includes chainId in the signing hash, preventing
 * replay attacks where a signed transaction is replayed on a different chain.
 * Always include chainId when signing.
 *
 * Standards: EIP-155 (replay protection), EIP-1559 (fee market txns),
 *            EIP-2718 (transaction envelope), EIP-2930 (access lists)
 */

import { Transaction, getAddress } from 'ethers';
import type { TransactionRequest, SignedTransaction } from '../types/index.js';
import { deriveSigningWallet } from '../keychain/hd-derivation.js';
import { SigningError } from '../errors.js';

/**
 * Sign a transaction with a private key derived from a mnemonic.
 *
 * WHY mnemonic + index not raw private key: This ensures the key is derived
 * fresh each time and not stored. The mnemonic is cleared from the caller's
 * scope as soon as this function returns.
 *
 * @param tx       - Unsigned transaction request
 * @param mnemonic - BIP-39 mnemonic (will be used to derive key at `accountIndex`)
 * @param accountIndex - HD wallet derivation index (default: 0, first account)
 * @returns SignedTransaction with serialized hex and hash
 */
export async function signTransaction(
  tx: TransactionRequest,
  mnemonic: string,
  accountIndex = 0,
): Promise<SignedTransaction> {
  const wallet = deriveSigningWallet(mnemonic, accountIndex);

  // Verify the signing address matches the `from` field
  // WHY: Prevent accidentally signing a transaction intended for a different account
  const expectedFrom = getAddress(tx.from);
  const actualFrom = getAddress(wallet.address);
  if (expectedFrom !== actualFrom) {
    throw new SigningError(
      `Address mismatch: transaction.from is ${expectedFrom} but derived wallet is ${actualFrom}`,
    );
  }

  // Build the ethers Transaction object
  const ethersTx = new Transaction();
  ethersTx.chainId = BigInt(tx.chainId);
  ethersTx.nonce = tx.nonce;
  ethersTx.gasLimit = tx.gasLimit;
  ethersTx.to = tx.to;
  ethersTx.value = tx.value;
  if (tx.data !== undefined) {
    ethersTx.data = tx.data;
  }

  if (tx.type === 'eip1559') {
    ethersTx.type = 2; // EIP-1559 transaction type
    ethersTx.maxFeePerGas = tx.maxFeePerGas;
    ethersTx.maxPriorityFeePerGas = tx.maxPriorityFeePerGas;
  } else {
    ethersTx.type = 0; // Legacy transaction type
    ethersTx.gasPrice = tx.gasPrice;
  }

  let signed: string;
  try {
    signed = await wallet.signTransaction(ethersTx);
  } catch (err) {
    throw new SigningError(
      `Transaction signing failed: ${err instanceof Error ? err.message : 'unknown error'}`,
      err,
    );
  }

  // Parse the signed transaction to extract the hash
  const parsedTx = Transaction.from(signed);

  return {
    serialized: signed,
    hash: parsedTx.hash ?? '',
    from: actualFrom,
  };
}

/**
 * Sign an arbitrary message with a key derived from the mnemonic.
 * Used for proving wallet ownership (e.g., login, identity).
 *
 * WHY we support message signing: DApp integrations (WalletConnect) require
 * message signing for authentication. The signed message is NOT a transaction.
 */
export async function signMessage(
  message: string,
  mnemonic: string,
  accountIndex = 0,
): Promise<string> {
  const wallet = deriveSigningWallet(mnemonic, accountIndex);

  try {
    return await wallet.signMessage(message);
  } catch (err) {
    throw new SigningError(
      `Message signing failed: ${err instanceof Error ? err.message : 'unknown'}`,
      err,
    );
  }
}
