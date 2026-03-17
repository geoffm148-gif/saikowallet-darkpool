/**
 * Network configurations for supported Ethereum networks.
 *
 * WHY we hardcode these: Default networks should be available offline.
 * Users can add custom RPCs, but the standard networks are pre-configured
 * so a fresh install works without any setup.
 */

import type { NetworkConfig } from '../types/index.js';

export const MAINNET_CHAIN_ID = 1;
export const SEPOLIA_CHAIN_ID = 11155111;

export const MAINNET_CONFIG: NetworkConfig = {
  chainId: MAINNET_CHAIN_ID,
  name: 'Ethereum Mainnet',
  rpcUrls: [
    // Public fallbacks — do not require API keys
    // WHY: We list public endpoints as defaults; users can override with
    // their own Alchemy/Infura keys for better rate limits and privacy.
    'https://eth.llamarpc.com',
    'https://rpc.ankr.com/eth',
    'https://cloudflare-eth.com',
    'https://rpc.flashbots.net', // MEV-protected for transaction broadcasting
  ],
  nativeCurrency: {
    name: 'Ether',
    symbol: 'ETH',
    decimals: 18,
  },
  blockExplorerUrl: 'https://etherscan.io',
  isTestnet: false,
};

export const SEPOLIA_CONFIG: NetworkConfig = {
  chainId: SEPOLIA_CHAIN_ID,
  name: 'Sepolia Testnet',
  rpcUrls: [
    'https://rpc.sepolia.org',
    'https://rpc2.sepolia.org',
    'https://eth-sepolia.public.blastapi.io',
  ],
  nativeCurrency: {
    name: 'Sepolia Ether',
    symbol: 'SEP',
    decimals: 18,
  },
  blockExplorerUrl: 'https://sepolia.etherscan.io',
  isTestnet: true,
};

/** All built-in network configs indexed by chainId. */
export const BUILTIN_NETWORKS: ReadonlyMap<number, NetworkConfig> = new Map([
  [MAINNET_CHAIN_ID, MAINNET_CONFIG],
  [SEPOLIA_CHAIN_ID, SEPOLIA_CONFIG],
]);

/**
 * Merge a custom RPC into a built-in network config.
 * The custom URL is prepended (highest priority).
 */
export function withCustomRpc(
  base: NetworkConfig,
  customRpcUrl: string,
): NetworkConfig {
  return {
    ...base,
    rpcUrls: [customRpcUrl, ...base.rpcUrls],
  };
}

/**
 * Create a fully custom network config (e.g. local hardhat node).
 */
export function createCustomNetwork(params: {
  chainId: number;
  name: string;
  rpcUrl: string;
  currencySymbol?: string;
  blockExplorerUrl?: string;
}): NetworkConfig {
  return {
    chainId: params.chainId,
    name: params.name,
    rpcUrls: [params.rpcUrl],
    nativeCurrency: {
      name: params.currencySymbol ?? 'ETH',
      symbol: params.currencySymbol ?? 'ETH',
      decimals: 18,
    },
    blockExplorerUrl: params.blockExplorerUrl ?? '',
    isTestnet: true, // Custom networks default to testnet for safety
  };
}
