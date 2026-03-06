/**
 * ERC-20 Token Approval for Uniswap V2 Router
 *
 * Checks allowance and builds approve transactions so tokens can be
 * spent by the router on behalf of the wallet.
 */

import { AbiCoder } from 'ethers';

const ALLOWANCE_SELECTOR = '0xdd62ed3e'; // allowance(address,address)
const APPROVE_SELECTOR = '0x095ea7b3'; // approve(address,uint256)

export interface ApprovalStatus {
  needsApproval: boolean;
  currentAllowance: bigint;
  required: bigint;
}

/**
 * Check if the wallet has approved the spender (e.g. Uniswap V2 Router)
 * to spend the token.
 */
export async function checkTokenApproval(
  rpcUrl: string,
  tokenAddress: string,
  ownerAddress: string,
  spenderAddress: string,
  requiredAmount: bigint,
): Promise<ApprovalStatus> {
  const coder = AbiCoder.defaultAbiCoder();
  const data =
    ALLOWANCE_SELECTOR +
    coder.encode(['address', 'address'], [ownerAddress, spenderAddress]).slice(2);

  const result = await rpcCall(rpcUrl, 'eth_call', [
    { to: tokenAddress, data },
    'latest',
  ]);

  const currentAllowance = result && result !== '0x'
    ? BigInt(result)
    : 0n;

  return {
    needsApproval: currentAllowance < requiredAmount,
    currentAllowance,
    required: requiredAmount,
  };
}

/**
 * Build an ERC-20 approve transaction for the exact amount needed.
 * Caller signs and broadcasts this before the swap tx.
 */
export function buildApproveTransaction(
  tokenAddress: string,
  spenderAddress: string,
  walletAddress: string,
  amount: bigint,
): {
  to: string;
  data: string;
  value: bigint;
  gasLimit: bigint;
} {
  const coder = AbiCoder.defaultAbiCoder();
  const data =
    APPROVE_SELECTOR +
    coder.encode(['address', 'uint256'], [spenderAddress, amount]).slice(2);

  return {
    to: tokenAddress,
    data,
    value: 0n,
    gasLimit: 60_000n,
  };
}

/**
 * Build an ERC-20 revoke approval transaction (approve spender for 0).
 */
export function buildRevokeApprovalTransaction(
  tokenAddress: string,
  spenderAddress: string,
): {
  to: string;
  data: string;
  value: bigint;
  gasLimit: bigint;
} {
  return buildApproveTransaction(tokenAddress, spenderAddress, '', 0n);
}

// ─── RPC helper ────────────────────────────────────────────────────────────────

const RPC_FALLBACKS = [
  'https://eth.llamarpc.com',
  'https://rpc.ankr.com/eth',
];

async function rpcCall(
  primaryRpc: string,
  method: string,
  params: unknown[],
): Promise<string> {
  const rpcs = [primaryRpc, ...RPC_FALLBACKS.filter((r) => r !== primaryRpc)];

  for (const url of rpcs) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      });
      const json = await res.json();
      if (json.error) continue;
      return json.result as string;
    } catch {
      continue;
    }
  }
  throw new Error(`RPC call ${method} failed on all endpoints`);
}
