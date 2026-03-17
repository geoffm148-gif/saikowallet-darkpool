/**
 * Custom ERC-20 token storage utility.
 * Stores/loads user-added tokens via chrome.storage.local (localStorage fallback).
 */

export interface StoredToken {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  logoUrl?: string;
}

const STORAGE_KEY = 'saiko_custom_tokens';

/** Built-in SAIKO token — always shown alongside ETH. */
export const SAIKO_BUILTIN: StoredToken = {
  address: '0x4c89364F18Ecc562165820989549022e64eC2eD2',
  symbol: 'SAIKO',
  name: 'Saiko',
  decimals: 18,
};

/** Popular ERC-20 tokens on Ethereum mainnet. Auto-detected if wallet holds a balance. */
export const POPULAR_TOKENS: ReadonlyArray<StoredToken> = [
  { address: '0xdac17f958d2ee523a2206206994597c13d831ec7', symbol: 'USDT', name: 'Tether USD', decimals: 6 },
  { address: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', symbol: 'USDC', name: 'USD Coin', decimals: 6 },
  { address: '0x6b175474e89094c44da98b954eedeac495271d0f', symbol: 'DAI', name: 'Dai Stablecoin', decimals: 18 },
  { address: '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599', symbol: 'WBTC', name: 'Wrapped Bitcoin', decimals: 8 },
  { address: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2', symbol: 'WETH', name: 'Wrapped Ether', decimals: 18 },
  { address: '0x514910771af9ca656af840dff83e8264ecf986ca', symbol: 'LINK', name: 'Chainlink', decimals: 18 },
  { address: '0x1f9840a85d5af5bf1d1762f925bdaddc4201f984', symbol: 'UNI', name: 'Uniswap', decimals: 18 },
  { address: '0x95ad61b0a150d79219dcf64e1e6cc01f0b64c4ce', symbol: 'SHIB', name: 'Shiba Inu', decimals: 18 },
  { address: '0x6982508145454ce325ddbe47a25d4ec3d2311933', symbol: 'PEPE', name: 'Pepe', decimals: 18 },
  { address: '0x7fc66500c84a76ad7e9c93437bfc5ac33e2ddae9', symbol: 'AAVE', name: 'Aave', decimals: 18 },
  { address: '0xae7ab96520de3a18e5e111b5eaab095312d7fe84', symbol: 'stETH', name: 'Lido Staked Ether', decimals: 18 },
];

function useChromeStorage(): boolean {
  return typeof chrome !== 'undefined' && !!chrome.storage?.local;
}

/** Load custom tokens from storage. */
export async function loadCustomTokens(): Promise<StoredToken[]> {
  try {
    if (useChromeStorage()) {
      const result = await chrome.storage.local.get(STORAGE_KEY);
      return (result[STORAGE_KEY] as StoredToken[]) ?? [];
    }
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as StoredToken[]) : [];
  } catch {
    return [];
  }
}

/** Save custom tokens to storage. */
export async function saveCustomTokens(tokens: StoredToken[]): Promise<void> {
  if (useChromeStorage()) {
    await chrome.storage.local.set({ [STORAGE_KEY]: tokens });
  } else {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tokens));
  }
}

/** Add a custom token (no duplicates by address). */
export async function addCustomToken(token: StoredToken): Promise<StoredToken[]> {
  const existing = await loadCustomTokens();
  const normalized = token.address.toLowerCase();
  if (existing.some(t => t.address.toLowerCase() === normalized)) {
    return existing; // already exists
  }
  const updated = [...existing, token];
  await saveCustomTokens(updated);
  return updated;
}

/** Remove a custom token by address. */
export async function removeCustomToken(address: string): Promise<StoredToken[]> {
  const existing = await loadCustomTokens();
  const updated = existing.filter(t => t.address.toLowerCase() !== address.toLowerCase());
  await saveCustomTokens(updated);
  return updated;
}

/** Get all tokens the user holds: ETH (native) + SAIKO + custom tokens. */
export async function getAllTokens(): Promise<Array<StoredToken & { isNative?: boolean }>> {
  const custom = await loadCustomTokens();
  return [
    { address: '', symbol: 'ETH', name: 'Ethereum', decimals: 18, isNative: true },
    SAIKO_BUILTIN,
    ...custom,
  ];
}
