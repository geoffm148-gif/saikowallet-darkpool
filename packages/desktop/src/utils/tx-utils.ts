/**
 * Raw RPC + transaction utilities.
 *
 * All network calls use fetch() with 4-endpoint fallback — no ethers.js
 * JsonRpcProvider involved, so "Failed to fetch" on one endpoint auto-retries
 * on the next.
 */

import { HDNodeWallet, keccak256 } from 'ethers';
import { getActiveRpc, isTorEnabled } from './network.js';
import { MAINNET_RPC_LIST } from './rpc-provider.js';

// ── Core RPC call ─────────────────────────────────────────────────────────────

/**
 * Make a single JSON-RPC call via Electron IPC bridge (Node https in main process).
 * Throws descriptively if the IPC bridge is unavailable (wrong build/version).
 */
async function rpcCallOne<T>(url: string, method: string, params: unknown[]): Promise<T> {
  const ipc = (window as any).electronAPI?.rpc;
  if (!ipc) {
    // Fallback: direct fetch() — may fail in some Electron configs
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    });
    const json = await res.json() as { result?: T; error?: { message?: string } };
    if (json.error) throw new Error(json.error.message ?? 'RPC error');
    return json.result as T;
  }
  // IPC bridge: runs in main process via Node https — no proxy/CSP restrictions
  const json = await ipc.call(url, method, params) as { result?: T; error?: { message?: string } };
  if (json.error) throw new Error(json.error.message ?? 'RPC error');
  return json.result as T;
}

export async function rpcCall<T = string>(method: string, params: unknown[]): Promise<T> {
  if (isTorEnabled()) {
    // eslint-disable-next-line no-console
    console.info('[Tor] SOCKS5 proxy requires desktop binary');
  }
  const primary = getActiveRpc();
  const urls = [primary, ...MAINNET_RPC_LIST.filter((u) => u !== primary)];
  let lastErr: unknown;
  for (const url of urls) {
    try {
      return await rpcCallOne<T>(url, method, params);
    } catch (err) {
      lastErr = err;
      continue;
    }
  }
  throw lastErr ?? new Error(`RPC call ${method} failed on all endpoints`);
}

// ── Gas (EIP-1559) ────────────────────────────────────────────────────────────

export async function getGasParams(): Promise<{
  maxFeePerGas: bigint;
  maxPriorityFeePerGas: bigint;
}> {
  const tip = 1_500_000_000n; // 1.5 gwei
  try {
    const block = await rpcCall<{ baseFeePerGas?: string } | null>('eth_getBlockByNumber', ['latest', false]);
    if (block?.baseFeePerGas) {
      const base = BigInt(block.baseFeePerGas);
      return { maxFeePerGas: base * 2n + tip, maxPriorityFeePerGas: tip };
    }
  } catch { /* fall through */ }
  try {
    const gpRaw = await rpcCall<string>('eth_gasPrice', []);
    return { maxFeePerGas: BigInt(gpRaw) * 12n / 10n, maxPriorityFeePerGas: tip };
  } catch { /* fall through */ }
  return { maxFeePerGas: 30_000_000_000n, maxPriorityFeePerGas: tip };
}

// ── Sign + broadcast ──────────────────────────────────────────────────────────

export async function sendSignedTx(
  wallet: HDNodeWallet,
  txRequest: {
    to: string;
    data: string;
    value: bigint;
    nonce: number;
    gasLimit: bigint;
    maxFeePerGas: bigint;
    maxPriorityFeePerGas: bigint;
  },
): Promise<string> {
  const signed = await wallet.signTransaction({
    type: 2,
    chainId: 1n,
    nonce: txRequest.nonce,
    to: txRequest.to,
    data: txRequest.data,
    value: txRequest.value,
    gasLimit: txRequest.gasLimit,
    maxFeePerGas: txRequest.maxFeePerGas,
    maxPriorityFeePerGas: txRequest.maxPriorityFeePerGas,
  });

  // Compute the tx hash ourselves so we can detect "ghost submissions" —
  // some public RPC nodes accept the tx into their mempool but return an error
  // response anyway. If broadcast throws, we check the receipt after a short
  // wait; if confirmed, we treat it as a success.
  const expectedHash = keccak256(signed);

  try {
    const hash = await rpcCall<string>('eth_sendRawTransaction', [signed]);
    // Some nodes return null result without an error (rare) — fall back to computed hash
    return hash ?? expectedHash;
  } catch (broadcastErr) {
    // Give nodes up to 8s to propagate the tx before checking receipt.
    // If the tx was ghost-submitted, it will appear in the mempool quickly.
    await new Promise((r) => setTimeout(r, 8000));
    try {
      const receipt = await rpcCall<Record<string, unknown> | null>(
        'eth_getTransactionReceipt', [expectedHash],
      );
      if (receipt) {
        // Tx mined despite the RPC error — return the hash so caller can show success
        console.info('[sendSignedTx] ghost-submission confirmed:', expectedHash);
        return expectedHash;
      }
      // Not yet mined; check mempool (eth_getTransactionByHash)
      const pending = await rpcCall<Record<string, unknown> | null>(
        'eth_getTransactionByHash', [expectedHash],
      );
      if (pending) {
        console.info('[sendSignedTx] tx in mempool (pending):', expectedHash);
        return expectedHash;
      }
    } catch {
      // receipt check also failed — fall through to throw original error
    }
    throw broadcastErr;
  }
}

// ── Wait for receipt ──────────────────────────────────────────────────────────

export async function waitForReceipt(
  txHash: string,
  timeoutMs = 180_000,
): Promise<Record<string, unknown>> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const receipt = await rpcCall<Record<string, unknown> | null>(
        'eth_getTransactionReceipt', [txHash],
      );
      if (receipt) {
        // status 0x0 = reverted; 0x1 = success
        if (receipt['status'] === '0x0') {
          throw new Error(`Transaction reverted on-chain (${txHash.slice(0, 10)}...)`);
        }
        return receipt;
      }
    } catch (err) {
      // Re-throw revert errors immediately; swallow polling errors
      if (err instanceof Error && err.message.includes('reverted')) throw err;
    }
    await new Promise((r) => setTimeout(r, 3000));
  }
  throw new Error(`Transaction not mined within ${timeoutMs / 1000}s (${txHash.slice(0, 10)}...)`);
}

// ── Nonce ─────────────────────────────────────────────────────────────────────

export async function getNonce(address: string): Promise<number> {
  const raw = await rpcCall<string>('eth_getTransactionCount', [address, 'latest']);
  return Number(BigInt(raw));
}

// ── eth_call ──────────────────────────────────────────────────────────────────

export async function ethCall(to: string, data: string): Promise<string> {
  return rpcCall<string>('eth_call', [{ to, data }, 'latest']);
}
