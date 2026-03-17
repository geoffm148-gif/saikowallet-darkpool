/**
 * Transaction history fetcher — uses Blockscout v2 API (free, no API key).
 * Replaces deprecated Etherscan v1 endpoint.
 */

export interface TxRecord {
  hash: string;
  type: 'send' | 'receive' | 'swap' | 'approve' | 'contract';
  token: string;
  symbol: string;
  amount: string;
  decimals: number;
  counterparty: string;
  counterpartyName?: string;
  timestamp: number;
  status: 'confirmed' | 'failed';
  isIncoming: boolean;
}

function truncateAddress(addr: string): string {
  if (!addr || addr.length < 12) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function formatAmount(value: string, decimals: number): string {
  try {
    const raw = BigInt(value);
    const divisor = 10n ** BigInt(decimals);
    const whole = raw / divisor;
    const remainder = raw % divisor;
    if (remainder === 0n || whole >= 1_000n) return whole.toLocaleString('en-US');
    const fracStr = remainder.toString().padStart(decimals, '0');
    const sig = fracStr.replace(/0+$/, '').slice(0, 4);
    return sig ? `${whole.toLocaleString('en-US')}.${sig}` : whole.toLocaleString('en-US');
  } catch {
    return '0';
  }
}

function getBlockscoutBase(networkId: string): string {
  if (networkId === 'sepolia') return 'https://eth-sepolia.blockscout.com';
  return 'https://eth.blockscout.com';
}

function getExplorerBase(networkId: string): string {
  if (networkId === 'sepolia') return 'https://sepolia.etherscan.io';
  return 'https://etherscan.io';
}

export function getTxExplorerUrl(hash: string, networkId: string): string {
  return `${getExplorerBase(networkId)}/tx/${hash}`;
}

interface BlockscoutAddress {
  hash: string;
  name?: string | null;
}

interface BlockscoutTx {
  hash: string;
  timestamp: string;
  status: string;         // "ok" | "error"
  result?: string;
  from: BlockscoutAddress;
  to: BlockscoutAddress | null;
  value: string;          // wei
  method: string | null;
  exchange_rate?: string | null;
}

interface BlockscoutTokenTransfer {
  transaction_hash: string;
  timestamp: string;
  type: string;
  from: BlockscoutAddress;
  to: BlockscoutAddress;
  total: { value: string; decimals: string };
  token: { symbol: string; address: string; name?: string };
}

async function blockscoutFetch<T>(url: string): Promise<T[]> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, { headers: { Accept: 'application/json' } });
      if (res.status === 429) {
        await new Promise<void>((r) => setTimeout(r, 1500));
        continue;
      }
      if (!res.ok) return [];
      const json = await res.json() as { items?: T[] };
      return json.items ?? [];
    } catch {
      if (attempt < 2) await new Promise<void>((r) => setTimeout(r, 500));
    }
  }
  return [];
}

function classifyMethod(method: string | null): TxRecord['type'] {
  if (!method) return 'send';
  const m = method.toLowerCase();
  if (m.includes('swap')) return 'swap';
  if (m === 'approve') return 'approve';
  return 'contract';
}

export async function fetchTxHistory(
  address: string,
  networkId: string,
): Promise<TxRecord[]> {
  const base = getBlockscoutBase(networkId);
  const lower = address.toLowerCase();

  const [rawTxs, rawTokenTxs] = await Promise.all([
    blockscoutFetch<BlockscoutTx>(`${base}/api/v2/addresses/${address}/transactions`),
    blockscoutFetch<BlockscoutTokenTransfer>(`${base}/api/v2/addresses/${address}/token-transfers?type=ERC-20`),
  ]);

  const records = new Map<string, TxRecord>();

  // Process ETH transactions
  for (const tx of rawTxs) {
    if (!tx.hash) continue;
    const isIncoming = (tx.to?.hash ?? '').toLowerCase() === lower;
    const counterparty = isIncoming ? tx.from.hash : (tx.to?.hash ?? '');
    const type = tx.method ? classifyMethod(tx.method) : isIncoming ? 'receive' : 'send';
    const status = tx.status === 'ok' || tx.result === 'success' ? 'confirmed' : 'failed';

    records.set(tx.hash.toLowerCase(), {
      hash: tx.hash,
      type,
      token: 'ETH',
      symbol: type === 'swap' ? 'Swap' : 'ETH',
      amount: formatAmount(tx.value || '0', 18),
      decimals: 18,
      counterparty: truncateAddress(counterparty),
      counterpartyName: tx.to?.name ?? undefined,
      timestamp: new Date(tx.timestamp).getTime(),
      status,
      isIncoming,
    });
  }

  // Process ERC-20 token transfers — enrich or add records
  for (const tt of rawTokenTxs) {
    if (!tt.transaction_hash) continue;
    const key = tt.transaction_hash.toLowerCase();
    const isIncoming = tt.to.hash.toLowerCase() === lower;
    const counterparty = isIncoming ? tt.from.hash : tt.to.hash;
    const decimals = parseInt(tt.total.decimals, 10) || 18;
    const amount = formatAmount(tt.total.value, decimals);

    const existing = records.get(key);
    if (existing) {
      // Enrich existing ETH record with token info (e.g. it was actually a token swap)
      existing.symbol = tt.token.symbol;
      existing.amount = amount;
      existing.token = tt.token.address;
      existing.decimals = decimals;
      if (existing.type === 'contract') existing.type = 'swap';
    } else {
      records.set(key, {
        hash: tt.transaction_hash,
        type: isIncoming ? 'receive' : 'send',
        token: tt.token.address,
        symbol: tt.token.symbol,
        amount,
        decimals,
        counterparty: truncateAddress(counterparty),
        timestamp: new Date(tt.timestamp).getTime(),
        status: 'confirmed',
        isIncoming,
      });
    }
  }

  return Array.from(records.values()).sort((a, b) => b.timestamp - a.timestamp);
}

export function formatRelativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(ts).toLocaleDateString();
}
