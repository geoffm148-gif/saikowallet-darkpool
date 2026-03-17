const DEXSCREENER_URL =
  'https://api.dexscreener.com/latest/dex/tokens/0x4c89364F18Ecc562165820989549022e64eC2eD2';
const COINGECKO_ETH_URL =
  'https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd';

export interface PriceData {
  saikoUsd: number;
  ethUsd: number;
  change24h: number;
  updatedAt: number;
}

let cachedPrices: PriceData | null = null;
const CACHE_TTL_MS = 60_000;

export function getCachedPrices(): PriceData | null {
  if (!cachedPrices) return null;
  if (Date.now() - cachedPrices.updatedAt > CACHE_TTL_MS) return null;
  return cachedPrices;
}

export async function fetchPrices(): Promise<PriceData> {
  const cached = getCachedPrices();
  if (cached) return cached;

  let saikoUsd = cachedPrices?.saikoUsd ?? 0;
  let change24h = cachedPrices?.change24h ?? 0;
  let ethUsd = cachedPrices?.ethUsd ?? 0;

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
    // keep previous values
  }

  try {
    const cgRes = await fetch(COINGECKO_ETH_URL);
    if (cgRes.ok) {
      const cgJson = await cgRes.json();
      ethUsd = cgJson?.ethereum?.usd ?? ethUsd;
    }
  } catch {
    // keep previous values
  }

  const data: PriceData = {
    saikoUsd,
    ethUsd,
    change24h,
    updatedAt: Date.now(),
  };

  cachedPrices = data;
  return data;
}
