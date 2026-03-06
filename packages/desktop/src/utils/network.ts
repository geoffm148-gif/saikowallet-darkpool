export interface Network {
  id: string;
  name: string;
  chainId: number;
  rpcUrl: string;
  explorerUrl: string;
  isTestnet: boolean;
  nativeCurrency: { symbol: string; decimals: number };
}

export const NETWORKS: Network[] = [
  {
    id: 'mainnet',
    name: 'Ethereum Mainnet',
    chainId: 1,
    rpcUrl: 'https://ethereum.publicnode.com',
    explorerUrl: 'https://etherscan.io',
    isTestnet: false,
    nativeCurrency: { symbol: 'ETH', decimals: 18 },
  },
  {
    id: 'sepolia',
    name: 'Sepolia Testnet',
    chainId: 11155111,
    rpcUrl: 'https://rpc.sepolia.org',
    explorerUrl: 'https://sepolia.etherscan.io',
    isTestnet: true,
    nativeCurrency: { symbol: 'ETH', decimals: 18 },
  },
  {
    id: 'base',
    name: 'Base',
    chainId: 8453,
    rpcUrl: 'https://mainnet.base.org',
    explorerUrl: 'https://basescan.org',
    isTestnet: false,
    nativeCurrency: { symbol: 'ETH', decimals: 18 },
  },
];

const LS_NETWORK = 'saiko_network';

export function getActiveNetwork(): Network {
  try {
    const id = localStorage.getItem(LS_NETWORK) ?? 'mainnet';
    return NETWORKS.find((n) => n.id === id) ?? NETWORKS[0]!;
  } catch {
    return NETWORKS[0]!;
  }
}

export function setActiveNetwork(id: string): void {
  const network = NETWORKS.find((n) => n.id === id);
  if (!network) return;
  try {
    localStorage.setItem(LS_NETWORK, id);
  } catch {
    // storage full
  }
}

export function getActiveRpc(): string {
  return getActiveNetwork().rpcUrl;
}

export function getExplorerUrl(): string {
  return getActiveNetwork().explorerUrl;
}

export function getActiveChainId(): number {
  return getActiveNetwork().chainId;
}

export function isTorEnabled(): boolean {
  try {
    return localStorage.getItem('saiko_tor_enabled') === 'true';
  } catch {
    return false;
  }
}
