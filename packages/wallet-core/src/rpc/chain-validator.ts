/**
 * Chain ID validation for RPC responses.
 *
 * WHY validate chain ID on every response: A chain-switching attack is where
 * a malicious or compromised RPC endpoint returns data from a different chain.
 * For example, an attacker could serve mainnet-formatted responses from a
 * Sepolia node, causing you to sign Sepolia transactions thinking they're mainnet.
 *
 * By validating chain ID on every RPC connection, we detect this attack
 * before any transactions are signed.
 *
 * Standard: EIP-155 defines chainId; eth_chainId is the RPC method.
 */

import { ChainIdMismatchError } from '../errors.js';

/**
 * Validate that a hex chain ID string matches the expected chain ID.
 * Call this after `eth_chainId` to verify the provider is on the right chain.
 *
 * @param hexChainId - Chain ID as hex string from eth_chainId (e.g. "0x1")
 * @param expectedChainId - The chain ID we expect
 * @throws ChainIdMismatchError if the chain IDs don't match
 */
export function validateChainId(hexChainId: string, expectedChainId: number): void {
  const receivedChainId = parseInt(hexChainId, 16);

  if (isNaN(receivedChainId)) {
    throw new ChainIdMismatchError(expectedChainId, -1);
  }

  if (receivedChainId !== expectedChainId) {
    throw new ChainIdMismatchError(expectedChainId, receivedChainId);
  }
}

/**
 * Parse a hex or decimal chain ID to a number.
 * RPC endpoints return hex strings; user input may be decimal.
 */
export function parseChainId(value: string | number): number {
  if (typeof value === 'number') return value;

  if (value.startsWith('0x') || value.startsWith('0X')) {
    const parsed = parseInt(value, 16);
    if (isNaN(parsed)) throw new Error(`Invalid hex chain ID: ${value}`);
    return parsed;
  }

  const parsed = parseInt(value, 10);
  if (isNaN(parsed)) throw new Error(`Invalid chain ID: ${value}`);
  return parsed;
}

/**
 * Check if a chain ID represents a known testnet.
 * WHY: We warn users when they're on a testnet so they don't accidentally
 * send real funds to a testnet address.
 */
export function isTestnet(chainId: number): boolean {
  const TESTNET_CHAIN_IDS: ReadonlySet<number> = new Set([
    11155111, // Sepolia
    5, // Goerli (deprecated)
    17000, // Holesky
    80001, // Mumbai (Polygon testnet)
    421613, // Arbitrum Goerli
    420, // Optimism Goerli
  ]);
  return TESTNET_CHAIN_IDS.has(chainId);
}
