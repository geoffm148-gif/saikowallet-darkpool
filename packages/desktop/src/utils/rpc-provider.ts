/**
 * RPC Provider Utilities
 *
 * Provides a `getWorkingProvider()` that tests multiple RPC endpoints in
 * parallel and returns a single JsonRpcProvider for the first one that
 * responds. Avoids FallbackProvider quorum issues on tx.wait().
 */

import { ethers } from 'ethers';
import { getActiveRpc } from './network.js';

export const MAINNET_RPC_LIST = [
  'https://ethereum.publicnode.com',
  'https://cloudflare-eth.com',
  'https://eth.llamarpc.com',
  'https://1rpc.io/eth',
];

const RPC_TEST_TIMEOUT_MS = 4000;

/**
 * Ping an RPC endpoint with eth_blockNumber.
 * Resolves with the provider if alive, rejects on timeout/error.
 */
async function testRpc(url: string): Promise<ethers.JsonRpcProvider> {
  const provider = new ethers.JsonRpcProvider(url);
  await Promise.race([
    provider.getBlockNumber(),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`RPC timeout: ${url}`)), RPC_TEST_TIMEOUT_MS),
    ),
  ]);
  return provider;
}

/**
 * Return a working JsonRpcProvider by racing all known endpoints.
 * Falls back gracefully: if parallel tests fail, throws with a helpful message.
 */
export async function getWorkingProvider(): Promise<ethers.JsonRpcProvider> {
  const primary = getActiveRpc();
  const urls = [primary, ...MAINNET_RPC_LIST.filter((u) => u !== primary)];

  try {
    return await Promise.any(urls.map((url) => testRpc(url)));
  } catch {
    // AggregateError: all failed — throw a user-friendly message
    throw new Error(
      'Network unavailable — all RPC endpoints failed. ' +
      'Check your internet connection and try again.',
    );
  }
}
