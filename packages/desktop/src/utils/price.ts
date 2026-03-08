const DEXSCREENER_URL =
  'https://api.dexscreener.com/latest/dex/tokens/0x4c89364F18Ecc562165820989549022e64eC2eD2';
const COINGECKO_ETH_URL =
  'https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd&include_24hr_change=true';

export interface PriceData {
  saikoUsd: number;
  ethUsd: number;
  change24h: number;
  ethChange24h: number;
  updatedAt: number;
}

const PRICE_CACHE_KEY = 'saiko_price_cache_v3';
const CACHE_TTL_MS = 60_000;

export function getCachedPrices(): PriceData | null {
  try {
    const raw = localStorage.getItem(PRICE_CACHE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as PriceData;
    if (Date.now() - data.updatedAt > CACHE_TTL_MS) return null;
    return data;
  } catch {
    return null;
  }
}

function setCachedPrices(data: PriceData): void {
  try {
    localStorage.setItem(PRICE_CACHE_KEY, JSON.stringify(data));
  } catch {
    // storage full
  }
}

function getStalePrices(): PriceData | null {
  try {
    const raw = localStorage.getItem(PRICE_CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as PriceData;
  } catch {
    return null;
  }
}

export async function fetchPrices(): Promise<PriceData> {
  const cached = getCachedPrices();
  if (cached) return cached;

  const stale = getStalePrices();
  let saikoUsd = stale?.saikoUsd ?? 0;
  let change24h = stale?.change24h ?? 0;
  let ethUsd = stale?.ethUsd ?? 0;
  let ethChange24h = stale?.ethChange24h ?? 0;

  try {
    const dexRes = await fetch(DEXSCREENER_URL);
    if (dexRes.ok) {
      const dexJson = await dexRes.json();
      const pair = dexJson?.pairs?.[0];
      if (pair) {
        saikoUsd = parseFloat(pair.priceUsd) || saikoUsd;
        change24h = pair.priceChange?.h24 ?? change24h;
      }
    }
  } catch {
    // keep fallback
  }

  try {
    const cgRes = await fetch(COINGECKO_ETH_URL);
    if (cgRes.ok) {
      const cgJson = await cgRes.json();
      ethUsd = cgJson?.ethereum?.usd ?? ethUsd;
      ethChange24h = cgJson?.ethereum?.usd_24h_change ?? ethChange24h;
    }
  } catch {
    // keep fallback
  }

  const data: PriceData = { saikoUsd, ethUsd, change24h, ethChange24h, updatedAt: Date.now() };
  setCachedPrices(data);
  return data;
}
