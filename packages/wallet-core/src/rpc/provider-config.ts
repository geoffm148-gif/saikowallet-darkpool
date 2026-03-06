/**
 * RPC provider configuration — endpoints, timeouts, and weights.
 *
 * WHY weights: Providers are not equal. Alchemy/Infura with API keys are
 * more reliable and have higher rate limits than public endpoints. We
 * prefer high-weight providers in the rotation, falling back to lower-weight
 * ones only on failure. This reduces unnecessary load on free public nodes.
 *
 * WHY separate timeouts per operation type:
 * - eth_call can be slow for complex contracts — allow more time
 * - eth_sendRawTransaction must wait for network propagation — allow most time
 * - Read-only calls like eth_blockNumber should be fast — short timeout
 */

import type { ProviderConfig } from '../types/index.js';

/** Timeout in milliseconds for standard read calls (eth_blockNumber, eth_getBalance, etc.) */
export const TIMEOUT_STANDARD_MS = 10_000;

/** Timeout for eth_call (contract reads — can be slower for complex contracts) */
export const TIMEOUT_CALL_MS = 30_000;

/** Timeout for eth_sendRawTransaction (must propagate to peers) */
export const TIMEOUT_SEND_TX_MS = 60_000;

/** Timeout for fee history and gas estimation calls */
export const TIMEOUT_FEE_HISTORY_MS = 15_000;

/**
 * Default public providers for Ethereum mainnet (no API key required).
 * WHY we use multiple: Redundancy. Any single provider can go down, rate-limit,
 * or become compromised. Rotating between providers also reduces single points
 * of surveillance (no single provider sees all your requests).
 */
export const DEFAULT_MAINNET_PROVIDERS: readonly ProviderConfig[] = [
  {
    url: 'https://eth.llamarpc.com',
    timeoutMs: TIMEOUT_STANDARD_MS,
    weight: 3,
  },
  {
    url: 'https://ethereum.publicnode.com',
    timeoutMs: TIMEOUT_STANDARD_MS,
    weight: 3,
  },
  {
    url: 'https://cloudflare-eth.com',
    timeoutMs: TIMEOUT_STANDARD_MS,
    weight: 2,
  },
  {
    url: 'https://1rpc.io/eth',
    timeoutMs: TIMEOUT_STANDARD_MS,
    weight: 2,
  },
  {
    url: 'https://rpc.flashbots.net',
    timeoutMs: TIMEOUT_SEND_TX_MS,
    weight: 2,
  },
];

export const DEFAULT_SEPOLIA_PROVIDERS: readonly ProviderConfig[] = [
  {
    url: 'https://rpc.sepolia.org',
    timeoutMs: TIMEOUT_STANDARD_MS,
    weight: 3,
  },
  {
    url: 'https://eth-sepolia.public.blastapi.io',
    timeoutMs: TIMEOUT_STANDARD_MS,
    weight: 2,
  },
];

/**
 * Create a provider config for a custom user-supplied RPC endpoint.
 * WHY default high weight: A user-supplied node (e.g. their own Alchemy key)
 * should be preferred over public fallbacks.
 */
export function createProviderConfig(url: string, timeoutMs?: number): ProviderConfig {
  return {
    url,
    timeoutMs: timeoutMs ?? TIMEOUT_STANDARD_MS,
    weight: 10, // Highest priority — user explicitly configured this
  };
}
