/**
 * Transaction simulation — dry-run transactions before the user signs.
 *
 * WHY simulate before signing: Even if a user approves a transaction,
 * malicious contract calls or unexpected token approvals could drain funds.
 * eth_call lets us execute the tx against the current blockchain state
 * without spending gas, so we can show a human-readable impact preview.
 *
 * WHY we decode ERC-20 calldata: Raw hex calldata is opaque to users.
 * Showing "Approve WETH spender 0xRouter for UNLIMITED amount" is far
 * more actionable than "data: 0x095ea7b3...".
 *
 * Reference: Ethereum JSON-RPC eth_call, eth_estimateGas
 */

import { AbiCoder, getAddress, isAddress } from 'ethers';
import type { TransactionRequest } from '../types/index.js';
import type { RpcClient } from '../rpc/rpc-client.js';
import { SimulationError } from '../errors.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export type DecodedActionType =
  | 'eth-transfer'
  | 'erc20-transfer'
  | 'erc20-approve'
  | 'contract-call';

export interface DecodedAction {
  readonly type: DecodedActionType;
  readonly description: string;
  readonly to?: string;
  readonly amount?: bigint;
  readonly contractAddress?: string;
}

export interface SimulationResult {
  readonly success: boolean;
  readonly gasUsed: bigint;
  readonly decodedActions: readonly DecodedAction[];
  readonly warnings: readonly string[];
}

// ─── ERC-20 Selector constants ────────────────────────────────────────────────

/** First 4 bytes of keccak256("transfer(address,uint256)") */
const SELECTOR_TRANSFER = '0xa9059cbb';
/** First 4 bytes of keccak256("approve(address,uint256)") */
const SELECTOR_APPROVE = '0x095ea7b3';
/** First 4 bytes of keccak256("transferFrom(address,address,uint256)") */
const SELECTOR_TRANSFER_FROM = '0x23b872dd';

/** Threshold above which an ERC-20 approval is considered "unlimited" */
const UNLIMITED_APPROVAL_THRESHOLD = 2n ** 128n;

const abiCoder = AbiCoder.defaultAbiCoder();

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Dry-run a transaction via eth_call and eth_estimateGas, returning a
 * human-readable impact summary.
 *
 * WHY we use eth_call not eth_sendRawTransaction: eth_call is a read-only
 * simulation — it does not submit to the mempool or consume any gas. It's
 * the standard way to preview contract execution results.
 *
 * NOTE: Simulation uses the current chain state. Results may differ if
 * state changes between simulation and actual broadcast.
 */
export async function simulateTransaction(
  tx: TransactionRequest,
  provider: RpcClient,
): Promise<SimulationResult> {
  const warnings: string[] = [];
  const actions: DecodedAction[] = [];

  // Build the eth_call parameter object (subset of tx fields understood by nodes)
  const callParams = buildCallParams(tx);

  // ── Step 1: Estimate gas (also serves as revert detection) ──────────────
  let gasUsed: bigint;
  try {
    const gasHex = await provider.send<string>({
      method: 'eth_estimateGas',
      params: [callParams],
    });
    gasUsed = BigInt(gasHex);
  } catch (err) {
    // eth_estimateGas rejects when the tx would revert
    const revertMsg = extractRevertMessage(err);
    return {
      success: false,
      gasUsed: 0n,
      decodedActions: [],
      warnings: [`Transaction would revert: ${revertMsg}`],
    };
  }

  // ── Step 2: Dry-run via eth_call to get return data ─────────────────────
  let returnData: string;
  try {
    returnData = await provider.send<string>({
      method: 'eth_call',
      params: [callParams, 'latest'],
    });
  } catch (err) {
    throw new SimulationError(
      'eth_call failed — unable to simulate transaction',
      err,
    );
  }

  // ── Step 3: Decode the transaction intent ────────────────────────────────
  const decodedActions = decodeTransactionActions(tx, returnData, warnings);
  actions.push(...decodedActions);

  // ── Step 4: Attach general warnings ──────────────────────────────────────
  if (tx.value > 0n && actions.length > 0 && actions[0]?.type !== 'eth-transfer') {
    warnings.push('Transaction sends ETH and calls a contract — verify the contract is trusted.');
  }

  return {
    success: true,
    gasUsed,
    decodedActions: actions,
    warnings,
  };
}

/**
 * Decode ERC-20 calldata into a human-readable description.
 * Returns null if the calldata does not match any known ERC-20 function.
 *
 * WHY exported separately: The UI layer may want to show previews without
 * performing a full simulation (e.g., while the user is still composing the tx).
 */
export function decodeErc20Calldata(
  data: string,
  contractAddress: string,
): DecodedAction | null {
  if (!data || data.length < 10) return null;

  const selector = data.slice(0, 10).toLowerCase();
  const params = '0x' + data.slice(10);

  if (selector === SELECTOR_TRANSFER) {
    return decodeTransferAction(params, contractAddress);
  }

  if (selector === SELECTOR_APPROVE) {
    return decodeApproveAction(params, contractAddress);
  }

  if (selector === SELECTOR_TRANSFER_FROM) {
    return decodeTransferFromAction(params, contractAddress);
  }

  return null;
}

// ─── Internal Helpers ─────────────────────────────────────────────────────────

/**
 * Build the JSON-RPC call parameter object from a TransactionRequest.
 * Only includes fields that eth_call / eth_estimateGas understand.
 */
function buildCallParams(tx: TransactionRequest): Record<string, string> {
  const params: Record<string, string> = {
    from: tx.from,
    to: tx.to,
    value: '0x' + tx.value.toString(16),
  };

  if (tx.data) {
    params['data'] = tx.data;
  }

  return params;
}

/**
 * Decode the intended actions from transaction fields.
 * Populates warnings with any suspicious patterns detected.
 */
function decodeTransactionActions(
  tx: TransactionRequest,
  _returnData: string,
  warnings: string[],
): DecodedAction[] {
  const actions: DecodedAction[] = [];

  // Plain ETH transfer — no calldata
  if (!tx.data || tx.data === '0x' || tx.data === '') {
    if (tx.value > 0n) {
      actions.push({
        type: 'eth-transfer',
        description: `Send ${formatWei(tx.value)} ETH to ${tx.to}`,
        to: tx.to,
        amount: tx.value,
      });
    }
    return actions;
  }

  // Try to decode as ERC-20
  const erc20Action = decodeErc20Calldata(tx.data, tx.to);
  if (erc20Action !== null) {
    actions.push(erc20Action);

    // Warn on unlimited approvals — a major phishing vector
    if (
      erc20Action.type === 'erc20-approve' &&
      erc20Action.amount !== undefined &&
      erc20Action.amount >= UNLIMITED_APPROVAL_THRESHOLD
    ) {
      warnings.push(
        `UNLIMITED token approval detected for ${erc20Action.to}. ` +
        'This grants the spender permanent access to all tokens of this type. ' +
        'Consider approving only the exact amount needed.',
      );
    }
    return actions;
  }

  // Unknown contract call
  actions.push({
    type: 'contract-call',
    description: `Call contract ${tx.to} with ${tx.data.length / 2 - 1} bytes of calldata`,
    contractAddress: tx.to,
    ...(tx.value > 0n ? { amount: tx.value } : {}),
  });

  warnings.push(
    'Calling an unrecognized contract function. Verify you trust this contract before signing.',
  );

  return actions;
}

function decodeTransferAction(encodedParams: string, contractAddress: string): DecodedAction {
  try {
    const [to, amount] = abiCoder.decode(['address', 'uint256'], encodedParams) as unknown as [string, bigint];
    const checksummed = isAddress(to) ? getAddress(to) : to;
    return {
      type: 'erc20-transfer',
      description: `Transfer ${amount.toString()} token units to ${checksummed} via contract ${contractAddress}`,
      to: checksummed,
      amount,
      contractAddress,
    };
  } catch {
    return {
      type: 'erc20-transfer',
      description: `ERC-20 transfer (decode failed — raw calldata)`,
      contractAddress,
    };
  }
}

function decodeApproveAction(encodedParams: string, contractAddress: string): DecodedAction {
  try {
    const [spender, amount] = abiCoder.decode(['address', 'uint256'], encodedParams) as unknown as [string, bigint];
    const checksummed = isAddress(spender) ? getAddress(spender) : spender;
    const isUnlimited = amount >= UNLIMITED_APPROVAL_THRESHOLD;
    const amountDisplay = isUnlimited ? 'UNLIMITED' : amount.toString();
    return {
      type: 'erc20-approve',
      description: `Approve ${amountDisplay} token units for spender ${checksummed} on contract ${contractAddress}`,
      to: checksummed,
      amount,
      contractAddress,
    };
  } catch {
    return {
      type: 'erc20-approve',
      description: `ERC-20 approve (decode failed — raw calldata)`,
      contractAddress,
    };
  }
}

function decodeTransferFromAction(encodedParams: string, contractAddress: string): DecodedAction {
  try {
    const [from, to, amount] = abiCoder.decode(['address', 'address', 'uint256'], encodedParams) as unknown as [string, string, bigint];
    const fromChecked = isAddress(from) ? getAddress(from) : from;
    const toChecked = isAddress(to) ? getAddress(to) : to;
    return {
      type: 'erc20-transfer',
      description: `Transfer ${amount.toString()} token units from ${fromChecked} to ${toChecked} via ${contractAddress}`,
      to: toChecked,
      amount,
      contractAddress,
    };
  } catch {
    return {
      type: 'erc20-transfer',
      description: `ERC-20 transferFrom (decode failed — raw calldata)`,
      contractAddress,
    };
  }
}

/** Format wei as ETH with up to 6 decimal places. */
function formatWei(wei: bigint): string {
  const eth = Number(wei) / 1e18;
  return eth.toFixed(6).replace(/\.?0+$/, '');
}

/** Extract a revert reason from an RPC error if present. */
function extractRevertMessage(err: unknown): string {
  if (err instanceof Error) {
    // Many nodes include the revert reason in the error message
    const match = err.message.match(/revert(?:ed)?(?: with reason string '([^']+)')?/i);
    if (match?.[1]) return match[1];
    return err.message.slice(0, 200);
  }
  return 'unknown reason';
}
