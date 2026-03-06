const RPC_URL = 'https://cloudflare-eth.com';
const SAIKO_CONTRACT = '0x4c89364F18Ecc562165820989549022e64eC2eD2';

async function rpcCall<T>(method: string, params: unknown[]): Promise<T> {
  const res = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  const json = await res.json();
  if (json.error) throw new Error(json.error.message);
  return json.result as T;
}

export async function getEthBalance(address: string): Promise<bigint> {
  const hex = await rpcCall<string>('eth_getBalance', [address, 'latest']);
  return BigInt(hex);
}

export async function getSaikoBalance(address: string): Promise<bigint> {
  // balanceOf(address) selector = 0x70a08231
  const data = '0x70a08231' + address.slice(2).padStart(64, '0');
  const hex = await rpcCall<string>('eth_call', [{ to: SAIKO_CONTRACT, data }, 'latest']);
  return BigInt(hex);
}

export function formatBalance(raw: bigint, decimals: number, maxFrac = 4): string {
  const divisor = 10n ** BigInt(decimals);
  const whole = raw / divisor;
  const frac = raw % divisor;
  const fracStr = frac.toString().padStart(decimals, '0').slice(0, maxFrac).replace(/0+$/, '');
  return fracStr ? `${whole.toLocaleString()}.${fracStr}` : whole.toLocaleString();
}
