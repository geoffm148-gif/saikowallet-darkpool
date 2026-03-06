/**
 * Swap Token Registry
 *
 * WHY: Centralizes the list of tokens supported for swapping. SAIKO is always
 * featured at the top. Other tokens are well-known Ethereum mainnet tokens with
 * verified contract addresses.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SwapToken {
  /** EIP-55 checksummed contract address (ETH uses zero address) */
  readonly address: string;
  readonly symbol: string;
  readonly name: string;
  readonly decimals: number;
  /** Path to logo image asset or external URL */
  readonly logoUrl: string;
  /** True if this token should be highlighted in the UI */
  readonly featured: boolean;
}

// ─── Token List ───────────────────────────────────────────────────────────────

/** Canonical Ethereum mainnet token list for Saiko Wallet swaps */
export const SWAP_TOKENS: readonly SwapToken[] = [
  {
    address: '0x4c89364F18Ecc562165820989549022e64eC2eD2',
    symbol: 'SAIKO',
    name: 'Saiko Inu',
    decimals: 18,
    logoUrl: '/assets/saiko-logo.png',
    featured: true,
  },
  {
    // ETH is represented as native currency — use zero address convention
    address: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
    symbol: 'ETH',
    name: 'Ethereum',
    decimals: 18,
    logoUrl: 'https://assets.coingecko.com/coins/images/279/small/ethereum.png',
    featured: false,
  },
  {
    address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    symbol: 'USDC',
    name: 'USD Coin',
    decimals: 6,
    logoUrl: 'https://assets.coingecko.com/coins/images/6319/small/usdc.png',
    featured: false,
  },
  {
    address: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
    symbol: 'USDT',
    name: 'Tether USD',
    decimals: 6,
    logoUrl: 'https://assets.coingecko.com/coins/images/325/small/tether.png',
    featured: false,
  },
  {
    address: '0x6B175474E89094C44Da98b954EedeAC495271d0F',
    symbol: 'DAI',
    name: 'Dai Stablecoin',
    decimals: 18,
    logoUrl: 'https://assets.coingecko.com/coins/images/9956/small/dai-multi-collateral-mcd.png',
    featured: false,
  },
  {
    address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    symbol: 'WETH',
    name: 'Wrapped Ether',
    decimals: 18,
    logoUrl: 'https://assets.coingecko.com/coins/images/2518/small/weth.png',
    featured: false,
  },
] as const;

// ─── Accessors ────────────────────────────────────────────────────────────────

/** Returns the full list of swappable tokens (SAIKO first) */
export function getSwapTokens(): readonly SwapToken[] {
  return SWAP_TOKENS;
}

/**
 * Find a token by symbol (case-insensitive) or contract address (case-insensitive).
 * Returns undefined if not found.
 */
export function findToken(symbolOrAddress: string): SwapToken | undefined {
  const query = symbolOrAddress.toLowerCase();
  return SWAP_TOKENS.find(
    (t) =>
      t.symbol.toLowerCase() === query ||
      t.address.toLowerCase() === query,
  );
}
