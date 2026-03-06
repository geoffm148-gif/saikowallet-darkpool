import { ethers } from 'ethers';

// cloudflare-eth.com blocks browser eth_call via CORS — use CORS-friendly endpoints
const ENS_RPCS = [
  'https://eth.llamarpc.com',
  'https://rpc.ankr.com/eth',
  'https://ethereum.publicnode.com',
];

export async function resolveEns(name: string): Promise<string | null> {
  if (!name.includes('.')) return null;
  // Try each RPC in sequence until one works
  for (const rpc of ENS_RPCS) {
    try {
      const p = new ethers.JsonRpcProvider(rpc);
      const address = await Promise.race([
        p.resolveName(name),
        new Promise<null>((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000)),
      ]);
      if (address) return address;
    } catch {
      continue;
    }
  }
  return null;
}

export function isEnsName(input: string): boolean {
  const trimmed = input.trim().toLowerCase();
  if (trimmed.startsWith('0x')) return false;
  return trimmed.endsWith('.eth') || (trimmed.includes('.') && trimmed.length > 3);
}
