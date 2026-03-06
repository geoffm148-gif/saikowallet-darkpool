import AsyncStorage from '@react-native-async-storage/async-storage';

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
    rpcUrl: 'https://eth.llamarpc.com',
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
let cachedNetworkId: string | null = null;

export async function getActiveNetworkAsync(): Promise<Network> {
  try {
    const id = await AsyncStorage.getItem(LS_NETWORK);
    cachedNetworkId = id;
    return NETWORKS.find((n) => n.id === id) ?? NETWORKS[0]!;
  } catch {
    return NETWORKS[0]!;
  }
}

export function getActiveNetwork(): Network {
  return NETWORKS.find((n) => n.id === cachedNetworkId) ?? NETWORKS[0]!;
}

export async function setActiveNetwork(id: string): Promise<void> {
  const network = NETWORKS.find((n) => n.id === id);
  if (!network) return;
  cachedNetworkId = id;
  try {
    await AsyncStorage.setItem(LS_NETWORK, id);
  } catch {
    // storage full
  }
}

export function getActiveRpc(): string {
  return getActiveNetwork().rpcUrl;
}
