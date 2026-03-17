/**
 * CoinGecko integration — token logos, metadata, and market data.
 *
 * Free tier: no API key needed for CDN assets or basic coin lookups.
 * Rate limit: ~30 req/min on free tier — we cache aggressively to stay safe.
 */

// ─── CDN logo map for well-known tokens (no API call needed) ─────────────────

const KNOWN_LOGOS: Record<string, string> = {
  // Native / wrapped ETH
  '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee':
    'https://assets.coingecko.com/coins/images/279/small/ethereum.png',
  '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2': // WETH
    'https://assets.coingecko.com/coins/images/2518/small/weth.png',

  // Stablecoins
  '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48': // USDC
    'https://assets.coingecko.com/coins/images/6319/small/usdc.png',
  '0xdac17f958d2ee523a2206206994597c13d831ec7': // USDT
    'https://assets.coingecko.com/coins/images/325/small/tether.png',
  '0x6b175474e89094c44da98b954eedeac495271d0f': // DAI
    'https://assets.coingecko.com/coins/images/9956/small/dai-multi-collateral-mcd.png',
  '0x4fabb145d64652a948d72533023f6e7a623c7c53': // BUSD
    'https://assets.coingecko.com/coins/images/9576/small/BUSD.png',
  '0x8e870d67f660d95d5be530380d0ec0bd388289e1': // USDP
    'https://assets.coingecko.com/coins/images/6013/small/Pax_Dollar.png',

  // DeFi blue-chips
  '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599': // WBTC
    'https://assets.coingecko.com/coins/images/7598/small/wrapped_bitcoin_wbtc.png',
  '0x1f9840a85d5af5bf1d1762f925bdaddc4201f984': // UNI
    'https://assets.coingecko.com/coins/images/12504/small/uniswap-uni.png',
  '0x7fc66500c84a76ad7e9c93437bfc5ac33e2ddae9': // AAVE
    'https://assets.coingecko.com/coins/images/12645/small/AAVE.png',
  '0xc00e94cb662c3520282e6f5717214004a7f26888': // COMP
    'https://assets.coingecko.com/coins/images/10775/small/COMP.png',
  '0x9f8f72aa9304c8b593d555f12ef6589cc3a579a2': // MKR
    'https://assets.coingecko.com/coins/images/1364/small/Mark_Maker.png',
  '0x514910771af9ca656af840dff83e8264ecf986ca': // LINK
    'https://assets.coingecko.com/coins/images/877/small/chainlink-new-logo.png',
  '0xd533a949740bb3306d119cc777fa900ba034cd52': // CRV
    'https://assets.coingecko.com/coins/images/12124/small/Curve.png',

  // Saiko (local asset — higher res)
  '0x4c89364f18ecc562165820989549022e64ec2ed2':
    '/assets/saiko-logo.png',
};

// ─── CoinGecko API types ──────────────────────────────────────────────────────

export interface CoinGeckoTokenInfo {
  id: string;
  symbol: string;
  name: string;
  logoUrl: string;
  decimals: number;
  currentPriceUsd: number;
  priceChange24h: number;
  marketCap: number;
  cachedAt: number;
}

const LOGO_CACHE_PREFIX = 'saiko:cgLogo:';
const TOKEN_INFO_CACHE_PREFIX = 'saiko:cgToken:';
const LOGO_CACHE_TTL = 7 * 24 * 60 * 60 * 1000;   // 7 days — logos rarely change
const TOKEN_INFO_CACHE_TTL = 5 * 60 * 1000;         // 5 min for price data

// ─── Cache helpers ────────────────────────────────────────────────────────────

function cacheGet<T>(key: string, ttl: number): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const { value, ts } = JSON.parse(raw) as { value: T; ts: number };
    if (Date.now() - ts > ttl) return null;
    return value;
  } catch {
    return null;
  }
}

function cacheSet<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify({ value, ts: Date.now() }));
  } catch { /* storage full */ }
}

// ─── In-flight dedup (avoid parallel identical fetches) ──────────────────────

const inFlight = new Map<string, Promise<string | null>>();

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Get the logo URL for a token by contract address.
 *
 * Priority:
 *   1. Local known-logos map (instant, no request)
 *   2. localStorage cache (no request)
 *   3. CoinGecko API (cached for 7 days after first fetch)
 */
export async function getTokenLogoUrl(address: string): Promise<string | null> {
  const lower = address.toLowerCase();

  // 1. Hardcoded map
  if (KNOWN_LOGOS[lower]) return KNOWN_LOGOS[lower];

  const cacheKey = `${LOGO_CACHE_PREFIX}${lower}`;

  // 2. localStorage cache
  const cached = cacheGet<string>(cacheKey, LOGO_CACHE_TTL);
  if (cached !== null) return cached;

  // 3. In-flight dedup
  if (inFlight.has(lower)) return inFlight.get(lower)!;

  const promise = (async (): Promise<string | null> => {
    try {
      const res = await fetch(
        `https://api.coingecko.com/api/v3/coins/ethereum/contract/${lower}`,
        { headers: { Accept: 'application/json' } },
      );
      if (!res.ok) return null;
      const json = await res.json();
      const url: string | null = json?.image?.small ?? json?.image?.thumb ?? null;
      if (url) cacheSet(cacheKey, url);
      return url;
    } catch {
      return null;
    } finally {
      inFlight.delete(lower);
    }
  })();

  inFlight.set(lower, promise);
  return promise;
}

/**
 * Get the synchronous logo URL from the known-logos map only.
 * Use this in render paths where you can't await; pair with `getTokenLogoUrl`
 * in a useEffect to upgrade to the real URL.
 */
export function getKnownLogoUrl(address: string): string | null {
  return KNOWN_LOGOS[address.toLowerCase()] ?? null;
}

/**
 * Fetch full token info from CoinGecko by contract address.
 * Cached for 5 minutes. Returns null on failure.
 */
export async function fetchTokenInfo(address: string): Promise<CoinGeckoTokenInfo | null> {
  const lower = address.toLowerCase();
  const cacheKey = `${TOKEN_INFO_CACHE_PREFIX}${lower}`;

  const cached = cacheGet<CoinGeckoTokenInfo>(cacheKey, TOKEN_INFO_CACHE_TTL);
  if (cached) return cached;

  try {
    const res = await fetch(
      `https://api.coingecko.com/api/v3/coins/ethereum/contract/${lower}`,
      { headers: { Accept: 'application/json' } },
    );
    if (!res.ok) return null;
    const json = await res.json();

    const info: CoinGeckoTokenInfo = {
      id: json.id ?? '',
      symbol: (json.symbol ?? '').toUpperCase(),
      name: json.name ?? '',
      logoUrl: json?.image?.small ?? json?.image?.thumb ?? '',
      decimals: json?.detail_platforms?.ethereum?.decimal_place ?? 18,
      currentPriceUsd: json?.market_data?.current_price?.usd ?? 0,
      priceChange24h: json?.market_data?.price_change_percentage_24h ?? 0,
      marketCap: json?.market_data?.market_cap?.usd ?? 0,
      cachedAt: Date.now(),
    };

    cacheSet(cacheKey, info);

    // Also prime the logo cache from the same response
    if (info.logoUrl) {
      cacheSet(`${LOGO_CACHE_PREFIX}${lower}`, info.logoUrl);
    }

    return info;
  } catch {
    return null;
  }
}

// ─── Stablecoin price hardcodes (no API call needed) ─────────────────────────

const KNOWN_STABLE_PRICES: Record<string, number> = {
  '0xdac17f958d2ee523a2206206994597c13d831ec7': 1, // USDT
  '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48': 1, // USDC
  '0x6b175474e89094c44da98b954eedeac495271d0f': 1, // DAI
  '0x4fabb145d64652a948d72533023f6e7a623c7c53': 1, // BUSD
  '0x8e870d67f660d95d5be530380d0ec0bd388289e1': 1, // USDP
  '0x956f47f50a910163d8bf957cf5846d573e7f87ca': 1, // FEI
  '0x5f98805a4e8be255a32880fdec7f6728c6568ba0': 1, // LUSD
};

const TOKEN_PRICES_CACHE_PREFIX = 'saiko:tokenPrices:';
const TOKEN_PRICES_TTL = 60_000; // 1 minute

/**
 * Fetch USD prices for a list of ERC-20 contract addresses (Ethereum mainnet).
 * Stablecoins are resolved instantly from hardcodes. Others via CoinGecko batch API.
 * Results cached for 1 minute.
 */
export async function fetchTokenPrices(addresses: string[]): Promise<Record<string, number>> {
  if (!addresses.length) return {};

  const prices: Record<string, number> = {};
  const toLookup: string[] = [];

  for (const addr of addresses) {
    const lower = addr.toLowerCase();
    if (KNOWN_STABLE_PRICES[lower] !== undefined) {
      prices[lower] = KNOWN_STABLE_PRICES[lower]!;
    } else {
      toLookup.push(lower);
    }
  }

  if (!toLookup.length) return prices;

  const cacheKey = `${TOKEN_PRICES_CACHE_PREFIX}${toLookup.slice().sort().join(',')}`;
  const cached = cacheGet<Record<string, number>>(cacheKey, TOKEN_PRICES_TTL);
  if (cached) return { ...prices, ...cached };

  try {
    const url = `https://api.coingecko.com/api/v3/simple/token_price/ethereum?contract_addresses=${toLookup.join(',')}&vs_currencies=usd`;
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) return prices;
    const json = await res.json() as Record<string, { usd?: number }>;
    const fetched: Record<string, number> = {};
    for (const [addr, data] of Object.entries(json)) {
      if (data.usd) fetched[addr.toLowerCase()] = data.usd;
    }
    cacheSet(cacheKey, fetched);
    return { ...prices, ...fetched };
  } catch {
    return prices;
  }
}

/**
 * Resolve multiple token logos in one batch.
 * Fetches serially with 200ms gap to respect CoinGecko rate limits.
 */
export async function batchFetchLogos(
  addresses: string[],
): Promise<Map<string, string>> {
  const result = new Map<string, string>();

  for (const addr of addresses) {
    const logo = await getTokenLogoUrl(addr);
    if (logo) result.set(addr.toLowerCase(), logo);
    await new Promise<void>((r) => setTimeout(r, 200));
  }

  return result;
}
