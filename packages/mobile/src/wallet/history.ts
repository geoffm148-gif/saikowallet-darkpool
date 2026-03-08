const SAIKO_CONTRACT = '0x4c89364F18Ecc562165820989549022e64eC2eD2';

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
  tx: { from: string; to: string; value: string; input: string; isError?: string; timeStamp: string },
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
    hash: tx.hash ?? '',
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
  contractAddress?: string;
}

async function fetchEtherscan(url: string): Promise<EtherscanTx[]> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Etherscan HTTP ${res.status}`);
  const json = await res.json();
  if (json.status !== '1' || !Array.isArray(json.result)) return [];
  return json.result;
}

export async function fetchTxHistory(address: string): Promise<TxRecord[]> {
  const ethUrl =
    `https://api.etherscan.io/api?module=account&action=txlist&address=${address}&sort=desc&page=1&offset=20`;
  const saikoUrl =
    `https://api.etherscan.io/api?module=account&action=tokentx&contractaddress=${SAIKO_CONTRACT}&address=${address}&sort=desc&page=1&offset=20`;

  const ethTxs = await fetchEtherscan(ethUrl);

  // 1s delay to respect Etherscan free-tier rate limits
  await new Promise<void>((r) => setTimeout(r, 1000));

  const saikoTxs = await fetchEtherscan(saikoUrl);

  const ethRecords = ethTxs.map((tx) => classifyTx(tx, address, 'ETH'));
  const saikoRecords = saikoTxs.map((tx) => classifyTx(tx, address, 'SAIKO'));

  // Merge, deduplicate by hash, sort by timestamp desc
  const byHash = new Map<string, TxRecord>();
  for (const r of [...ethRecords, ...saikoRecords]) {
    if (!byHash.has(r.hash)) {
      byHash.set(r.hash, r);
    }
  }

  return Array.from(byHash.values()).sort((a, b) => b.timestamp - a.timestamp);
}
