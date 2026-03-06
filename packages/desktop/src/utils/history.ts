import { getActiveNetwork } from './network.js';

const SAIKO_CONTRACT = '0x4c89364F18Ecc562165820989549022e64eC2eD2';
const ETHERSCAN_API_KEY = (import.meta.env.VITE_ETHERSCAN_KEY as string) ?? '';

export interface TxRecord {
  hash: string;
  type: 'send' | 'receive' | 'swap' | 'contract';
  token: 'ETH' | 'SAIKO' | 'unknown';
  amount: string;
  symbol: string;
  counterparty: string;
  timestamp: number;
  status: 'confirmed' | 'pending' | 'failed';
  isIncoming: boolean;
}

function truncateAddress(addr: string): string {
  if (addr.length < 12) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function formatAmount(value: string, decimals: number): string {
  const raw = BigInt(value);
  const divisor = 10n ** BigInt(decimals);
  const whole = raw / divisor;
  return whole.toLocaleString('en-US');
}

function classifyTx(
  tx: { hash: string; from: string; to: string; value: string; input: string; isError?: string; timeStamp: string },
  address: string,
  token: 'ETH' | 'SAIKO',
): TxRecord {
  const lower = address.toLowerCase();
  const isIncoming = tx.to.toLowerCase() === lower;
  const counterparty = isIncoming ? tx.from : tx.to;

  let type: TxRecord['type'] = isIncoming ? 'receive' : 'send';
  if (token === 'ETH' && tx.input && tx.input !== '0x' && tx.input.length > 10) {
    type = 'contract';
  }

  return {
    hash: tx.hash,
    type,
    token,
    amount: formatAmount(tx.value, 18),
    symbol: token,
    counterparty: truncateAddress(counterparty),
    timestamp: parseInt(tx.timeStamp, 10) * 1000,
    status: tx.isError === '1' ? 'failed' : 'confirmed',
    isIncoming,
  };
}

interface EtherscanTx {
  hash: string;
  from: string;
  to: string;
  value: string;
  input: string;
  isError: string;
  timeStamp: string;
}

async function fetchEtherscan(url: string, maxRetries = 3): Promise<EtherscanTx[]> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const res = await fetch(url);
    if (res.status === 429) {
      // Rate limited — respect Retry-After header or default to 1s
      const retryAfter = parseInt(res.headers.get('Retry-After') ?? '1', 10);
      await new Promise<void>((r) => setTimeout(r, retryAfter * 1000));
      continue;
    }
    if (!res.ok) throw new Error(`Etherscan HTTP ${res.status}`);
    const json = await res.json();
    if (json.status !== '1' || !Array.isArray(json.result)) return [];
    // M-4: Validate required fields on each tx
    return (json.result as EtherscanTx[]).filter(
      (tx) => tx.hash && tx.from && tx.to && tx.value !== undefined
    );
  }
  return [];
}

function getEtherscanApiBase(): string {
  const net = getActiveNetwork();
  if (net.id === 'sepolia') return 'https://api-sepolia.etherscan.io';
  if (net.id === 'base') return 'https://api.basescan.org';
  return 'https://api.etherscan.io';
}

export async function fetchTxHistory(address: string): Promise<TxRecord[]> {
  const apiBase = getEtherscanApiBase();
  const apiKeyParam = ETHERSCAN_API_KEY ? `&apikey=${ETHERSCAN_API_KEY}` : '';
  const ethUrl =
    `${apiBase}/api?module=account&action=txlist&address=${address}&sort=desc&page=1&offset=20${apiKeyParam}`;
  const saikoUrl =
    `${apiBase}/api?module=account&action=tokentx&contractaddress=${SAIKO_CONTRACT}&address=${address}&sort=desc&page=1&offset=20${apiKeyParam}`;

  const ethTxs = await fetchEtherscan(ethUrl);

  // M-4: Removed hardcoded 1000ms sleep — retry logic handles 429s
  const saikoTxs = await fetchEtherscan(saikoUrl);

  const ethRecords = ethTxs.map((tx) => classifyTx(tx, address, 'ETH'));
  const saikoRecords = saikoTxs.map((tx) => classifyTx(tx, address, 'SAIKO'));

  const byHash = new Map<string, TxRecord>();
  for (const r of [...ethRecords, ...saikoRecords]) {
    if (!byHash.has(r.hash)) {
      byHash.set(r.hash, r);
    }
  }

  return Array.from(byHash.values()).sort((a, b) => b.timestamp - a.timestamp);
}
