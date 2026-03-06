import { getActiveRpc, getActiveChainId } from './network.js';
import { getTokenLogoUrl } from './coingecko.js';

export interface CustomToken {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  chainId: number;
  logoUrl?: string;
  isCustom: true;
}

const LS_CUSTOM_TOKENS = 'saiko_custom_tokens';

// ---- RPC helpers ----

async function ethCall(to: string, data: string, rpcUrl: string): Promise<string> {
  const res = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_call', params: [{ to, data }, 'latest'] }),
  });
  const json = await res.json();
  if (json.error) throw new Error(json.error.message);
  return json.result as string;
}

function decodeString(hex: string): string {
  if (!hex || hex === '0x') return '';
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  // Try ABI-encoded string (offset + length + data)
  if (clean.length >= 128) {
    try {
      const lengthHex = clean.slice(64, 128);
      const length = parseInt(lengthHex, 16);
      if (length > 0 && length < 256) {
        const dataHex = clean.slice(128, 128 + length * 2);
        const bytes = new Uint8Array(dataHex.match(/.{2}/g)!.map((b) => parseInt(b, 16)));
        return new TextDecoder().decode(bytes);
      }
    } catch { /* fall through */ }
  }
  // Try raw bytes32
  try {
    const stripped = clean.replace(/0+$/, '');
    if (stripped.length > 0 && stripped.length <= 64) {
      const bytes = new Uint8Array(stripped.match(/.{2}/g)!.map((b) => parseInt(b, 16)));
      return new TextDecoder().decode(bytes);
    }
  } catch { /* ignore */ }
  return '';
}

function decodeUint8(hex: string): number {
  if (!hex || hex === '0x') return 0;
  return parseInt(hex, 16);
}

// ---- Public API ----

export async function fetchTokenMetadata(address: string, rpcUrl?: string): Promise<CustomToken> {
  const rpc = rpcUrl ?? getActiveRpc();
  const chainId = getActiveChainId();

  // name() = 0x06fdde03, symbol() = 0x95d89b41, decimals() = 0x313ce567
  const [nameHex, symbolHex, decimalsHex] = await Promise.all([
    ethCall(address, '0x06fdde03', rpc),
    ethCall(address, '0x95d89b41', rpc),
    ethCall(address, '0x313ce567', rpc),
  ]);

  const name = decodeString(nameHex) || 'Unknown Token';
  const symbol = decodeString(symbolHex) || '???';
  const decimals = decodeUint8(decimalsHex) || 18;

  // Best-effort logo fetch from CoinGecko (doesn't block if it fails)
  const logoUrl = await getTokenLogoUrl(address).catch(() => undefined) ?? undefined;

  return { address, symbol, name, decimals, chainId, logoUrl, isCustom: true };
}

export async function fetchTokenBalance(
  tokenAddress: string,
  walletAddress: string,
  rpcUrl?: string,
): Promise<bigint> {
  const rpc = rpcUrl ?? getActiveRpc();
  const paddedAddr = walletAddress.toLowerCase().replace('0x', '').padStart(64, '0');
  const data = `0x70a08231${paddedAddr}`;
  const result = await ethCall(tokenAddress, data, rpc);
  if (!result || result === '0x') return 0n;
  return BigInt(result);
}

export function loadCustomTokens(): CustomToken[] {
  try {
    const raw = localStorage.getItem(LS_CUSTOM_TOKENS);
    if (!raw) return [];
    return JSON.parse(raw) as CustomToken[];
  } catch {
    return [];
  }
}

export function addCustomToken(token: CustomToken): void {
  const tokens = loadCustomTokens();
  const exists = tokens.some(
    (t) => t.address.toLowerCase() === token.address.toLowerCase() && t.chainId === token.chainId,
  );
  if (exists) return;
  tokens.push(token);
  try {
    localStorage.setItem(LS_CUSTOM_TOKENS, JSON.stringify(tokens));
  } catch { /* storage full */ }
}

export function removeCustomToken(address: string): void {
  const tokens = loadCustomTokens().filter(
    (t) => t.address.toLowerCase() !== address.toLowerCase(),
  );
  try {
    localStorage.setItem(LS_CUSTOM_TOKENS, JSON.stringify(tokens));
  } catch { /* storage full */ }
}
