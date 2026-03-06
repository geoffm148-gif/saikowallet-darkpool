import AsyncStorage from '@react-native-async-storage/async-storage';
import { getActiveRpc } from '../wallet/network';

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
  if (clean.length >= 128) {
    try {
      const lengthHex = clean.slice(64, 128);
      const length = parseInt(lengthHex, 16);
      if (length > 0 && length < 256) {
        const dataHex = clean.slice(128, 128 + length * 2);
        const bytes: number[] = [];
        for (let i = 0; i < dataHex.length; i += 2) {
          bytes.push(parseInt(dataHex.slice(i, i + 2), 16));
        }
        return String.fromCharCode(...bytes);
      }
    } catch { /* fall through */ }
  }
  try {
    const stripped = clean.replace(/0+$/, '');
    if (stripped.length > 0 && stripped.length <= 64) {
      const bytes: number[] = [];
      for (let i = 0; i < stripped.length; i += 2) {
        bytes.push(parseInt(stripped.slice(i, i + 2), 16));
      }
      return String.fromCharCode(...bytes);
    }
  } catch { /* ignore */ }
  return '';
}

export async function fetchTokenMetadata(address: string, rpcUrl?: string): Promise<CustomToken> {
  const rpc = rpcUrl ?? getActiveRpc();
  const [nameHex, symbolHex, decimalsHex] = await Promise.all([
    ethCall(address, '0x06fdde03', rpc),
    ethCall(address, '0x95d89b41', rpc),
    ethCall(address, '0x313ce567', rpc),
  ]);
  const name = decodeString(nameHex) || 'Unknown Token';
  const symbol = decodeString(symbolHex) || '???';
  const decimals = decimalsHex ? parseInt(decimalsHex, 16) : 18;
  return { address, symbol, name, decimals, chainId: 1, isCustom: true };
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

export async function loadCustomTokens(): Promise<CustomToken[]> {
  try {
    const raw = await AsyncStorage.getItem(LS_CUSTOM_TOKENS);
    if (!raw) return [];
    return JSON.parse(raw) as CustomToken[];
  } catch {
    return [];
  }
}

export async function addCustomToken(token: CustomToken): Promise<void> {
  const tokens = await loadCustomTokens();
  const exists = tokens.some(
    (t) => t.address.toLowerCase() === token.address.toLowerCase() && t.chainId === token.chainId,
  );
  if (exists) return;
  tokens.push(token);
  await AsyncStorage.setItem(LS_CUSTOM_TOKENS, JSON.stringify(tokens));
}

export async function removeCustomToken(address: string): Promise<void> {
  const tokens = (await loadCustomTokens()).filter(
    (t) => t.address.toLowerCase() !== address.toLowerCase(),
  );
  await AsyncStorage.setItem(LS_CUSTOM_TOKENS, JSON.stringify(tokens));
}
