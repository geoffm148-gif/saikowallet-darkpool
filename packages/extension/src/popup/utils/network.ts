/**
 * Network definitions for the extension.
 */

export interface NetworkInfo {
  id: string;
  name: string;
  chainId: number;
  rpcUrl: string;
  explorerUrl: string;
  isTestnet: boolean;
}

export const NETWORKS: NetworkInfo[] = [
  {
    id: 'mainnet',
    name: 'Ethereum Mainnet',
    chainId: 1,
    rpcUrl: 'https://ethereum.publicnode.com',
    explorerUrl: 'https://etherscan.io',
    isTestnet: false,
  },
  {
    id: 'sepolia',
    name: 'Sepolia Testnet',
    chainId: 11155111,
    rpcUrl: 'https://ethereum-sepolia-rpc.publicnode.com',
    explorerUrl: 'https://sepolia.etherscan.io',
    isTestnet: true,
  },
];

const NETWORK_MAP = new Map(NETWORKS.map(n => [n.id, n]));

export function getNetworkById(id: string): NetworkInfo {
  return NETWORK_MAP.get(id) ?? NETWORKS[0]!;
}

export function getActiveRpc(networkId: string): string {
  return getNetworkById(networkId).rpcUrl;
}
