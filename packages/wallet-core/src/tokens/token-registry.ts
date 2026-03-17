/**
 * Token registry — known ERC-20 tokens with SAIKO as the featured token.
 *
 * WHY a built-in registry: Users shouldn't need to manually add SAIKO or
 * common tokens. The registry provides metadata (name, symbol, decimals,
 * logo) without requiring an RPC call for display purposes.
 *
 * SECURITY: Tokens in this registry are displayed with a "verified" badge.
 * Only add tokens after verifying their contract on Etherscan. An attacker
 * who adds a fraudulent token to the registry could trick users into
 * approving malicious contract interactions.
 *
 * WHY we still call decimals() from the contract at runtime: The registry
 * provides defaults for fast display. We always verify decimals from the
 * contract before constructing transfer calldata. A wrong decimal value
 * could cause users to send 10^12 more or fewer tokens than intended.
 */

import { getAddress } from 'ethers';
import type { TokenInfo } from '../types/index.js';
import { SAIKO_TOKEN } from './saiko-token.js';
import { MAINNET_CHAIN_ID, SEPOLIA_CHAIN_ID } from '../rpc/network-config.js';
import { TokenNotFoundError } from '../errors.js';

/** All known tokens, organized by chainId */
const TOKEN_REGISTRY: ReadonlyMap<number, readonly TokenInfo[]> = new Map([
  [
    MAINNET_CHAIN_ID,
    [
      // SAIKO is always first — it's the featured token
      SAIKO_TOKEN,
      {
        address: getAddress('0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'),
        name: 'Wrapped Ether',
        symbol: 'WETH',
        decimals: 18,
        chainId: MAINNET_CHAIN_ID,
        isFeatured: false,
      },
      {
        address: getAddress('0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'),
        name: 'USD Coin',
        symbol: 'USDC',
        decimals: 6,
        chainId: MAINNET_CHAIN_ID,
        isFeatured: false,
      },
      {
        address: getAddress('0xdAC17F958D2ee523a2206206994597C13D831ec7'),
        name: 'Tether USD',
        symbol: 'USDT',
        decimals: 6,
        chainId: MAINNET_CHAIN_ID,
        isFeatured: false,
      },
      {
        address: getAddress('0x6B175474E89094C44Da98b954EedeAC495271d0F'),
        name: 'Dai Stablecoin',
        symbol: 'DAI',
        decimals: 18,
        chainId: MAINNET_CHAIN_ID,
        isFeatured: false,
      },
    ],
  ],
  [
    SEPOLIA_CHAIN_ID,
    [
      // Minimal testnet token registry
    ],
  ],
]);

/**
 * Get all tokens for a given chain ID.
 * SAIKO is always first in the mainnet list (featured placement).
 */
export function getTokensForChain(chainId: number): readonly TokenInfo[] {
  return TOKEN_REGISTRY.get(chainId) ?? [];
}

/**
 * Look up a token by contract address on a specific chain.
 * Address comparison is case-insensitive but we normalize to EIP-55.
 */
export function getTokenByAddress(address: string, chainId: number): TokenInfo | undefined {
  let checksummed: string;
  try {
    checksummed = getAddress(address);
  } catch {
    return undefined; // Invalid address
  }

  const tokens = getTokensForChain(chainId);
  return tokens.find((t) => t.address === checksummed);
}

/**
 * Look up a token by symbol on a specific chain.
 * WHY: Symbol lookup is convenient for user-facing code, but symbols are NOT
 * unique — always verify the contract address before any transaction.
 */
export function getTokenBySymbol(symbol: string, chainId: number): TokenInfo | undefined {
  const upper = symbol.toUpperCase();
  const tokens = getTokensForChain(chainId);
  return tokens.find((t) => t.symbol.toUpperCase() === upper);
}

/**
 * Get a token by address, throwing if not found.
 * Use in contexts where missing token is a programming error.
 */
export function requireToken(address: string, chainId: number): TokenInfo {
  const token = getTokenByAddress(address, chainId);
  if (token === undefined) {
    throw new TokenNotFoundError(address);
  }
  return token;
}

/**
 * Check if a token address is in the known registry (i.e., "verified").
 */
export function isVerifiedToken(address: string, chainId: number): boolean {
  return getTokenByAddress(address, chainId) !== undefined;
}

/**
 * Get only the featured tokens for a chain (for dashboard display).
 */
export function getFeaturedTokens(chainId: number): readonly TokenInfo[] {
  return getTokensForChain(chainId).filter((t) => t.isFeatured);
}
