/**
 * Transaction building for ETH native transfers and ERC-20 token transfers.
 *
 * WHY separate builder from signer: The builder constructs unsigned transaction
 * objects which can be reviewed/displayed to the user before signing. This
 * enforces the "show before sign" principle and enables offline signing workflows.
 *
 * Standards: EIP-155 (replay protection), EIP-1559 (fee market), EIP-2718 (tx types)
 */

import { isAddress, getAddress } from 'ethers';
import type {
  LegacyTransactionRequest,
  Eip1559TransactionRequest,
  TransactionRequest,
} from '../types/index.js';
import { encodeTransfer } from './erc20.js';
import { InvalidAddressError, TransactionBuildError } from '../errors.js';

/** Default gas limit for ETH native transfers (exact cost per EIP) */
export const ETH_TRANSFER_GAS_LIMIT = 21000n;

/** Conservative default gas limit for ERC-20 transfers (actual may be less) */
export const ERC20_TRANSFER_GAS_LIMIT = 100000n;

/** Conservative gas limit for ERC-20 approvals */
export const ERC20_APPROVE_GAS_LIMIT = 60000n;

/**
 * Build an EIP-1559 ETH native transfer transaction.
 *
 * WHY EIP-1559 by default: EIP-1559 transactions are more predictable —
 * users set a max fee cap and the chain refunds unused gas. Legacy txns
 * can lead to overpaying when gas prices spike.
 */
export function buildEthTransferEip1559(params: {
  from: string;
  to: string;
  value: bigint; // Wei
  nonce: number;
  maxFeePerGas: bigint;
  maxPriorityFeePerGas: bigint;
  chainId: number;
  gasLimit?: bigint;
}): Eip1559TransactionRequest {
  validateAddresses(params.from, params.to);
  validateValue(params.value);
  validateGasParams(params.maxFeePerGas, params.maxPriorityFeePerGas);

  return {
    type: 'eip1559',
    from: getAddress(params.from),
    to: getAddress(params.to),
    value: params.value,
    nonce: params.nonce,
    maxFeePerGas: params.maxFeePerGas,
    maxPriorityFeePerGas: params.maxPriorityFeePerGas,
    gasLimit: params.gasLimit ?? ETH_TRANSFER_GAS_LIMIT,
    chainId: params.chainId,
  };
}

/**
 * Build a legacy ETH native transfer transaction.
 * WHY: Some older tools and hardware wallets don't support EIP-1559.
 * We support both for maximum compatibility.
 */
export function buildEthTransferLegacy(params: {
  from: string;
  to: string;
  value: bigint;
  nonce: number;
  gasPrice: bigint;
  chainId: number;
  gasLimit?: bigint;
}): LegacyTransactionRequest {
  validateAddresses(params.from, params.to);
  validateValue(params.value);

  if (params.gasPrice <= 0n) {
    throw new TransactionBuildError('gasPrice must be positive');
  }

  return {
    type: 'legacy',
    from: getAddress(params.from),
    to: getAddress(params.to),
    value: params.value,
    nonce: params.nonce,
    gasPrice: params.gasPrice,
    gasLimit: params.gasLimit ?? ETH_TRANSFER_GAS_LIMIT,
    chainId: params.chainId,
  };
}

/**
 * Build an EIP-1559 ERC-20 token transfer.
 * The contract address is `to`; actual recipient is encoded in calldata.
 *
 * WHY value=0n: ERC-20 transfers move tokens, not ETH. The ETH value field
 * must be zero — sending ETH to an ERC-20 contract without a payable function
 * will revert and your ETH may be locked forever.
 */
export function buildErc20TransferEip1559(params: {
  from: string;
  tokenAddress: string;
  recipient: string;
  amount: bigint; // Token units (e.g. 1000000n for 1 USDC with 6 decimals)
  nonce: number;
  maxFeePerGas: bigint;
  maxPriorityFeePerGas: bigint;
  chainId: number;
  gasLimit?: bigint;
}): Eip1559TransactionRequest {
  validateAddresses(params.from, params.tokenAddress, params.recipient);
  validateGasParams(params.maxFeePerGas, params.maxPriorityFeePerGas);

  return {
    type: 'eip1559',
    from: getAddress(params.from),
    to: getAddress(params.tokenAddress),
    value: 0n, // ERC-20 transfers do not send ETH
    data: encodeTransfer(params.recipient, params.amount),
    nonce: params.nonce,
    maxFeePerGas: params.maxFeePerGas,
    maxPriorityFeePerGas: params.maxPriorityFeePerGas,
    gasLimit: params.gasLimit ?? ERC20_TRANSFER_GAS_LIMIT,
    chainId: params.chainId,
  };
}

/**
 * Build a legacy ERC-20 token transfer.
 */
export function buildErc20TransferLegacy(params: {
  from: string;
  tokenAddress: string;
  recipient: string;
  amount: bigint;
  nonce: number;
  gasPrice: bigint;
  chainId: number;
  gasLimit?: bigint;
}): LegacyTransactionRequest {
  validateAddresses(params.from, params.tokenAddress, params.recipient);

  if (params.gasPrice <= 0n) {
    throw new TransactionBuildError('gasPrice must be positive');
  }

  return {
    type: 'legacy',
    from: getAddress(params.from),
    to: getAddress(params.tokenAddress),
    value: 0n,
    data: encodeTransfer(params.recipient, params.amount),
    nonce: params.nonce,
    gasPrice: params.gasPrice,
    gasLimit: params.gasLimit ?? ERC20_TRANSFER_GAS_LIMIT,
    chainId: params.chainId,
  };
}

/**
 * Calculate the maximum ETH cost of a transaction (gasLimit * maxFeePerGas + value).
 * Used for insufficient-funds checks before submitting.
 *
 * WHY: Users need to know the worst-case cost, not the expected cost.
 * We always check against `maxFeePerGas * gasLimit` to ensure they can
 * cover the transaction even if gas prices spike before inclusion.
 */
export function calculateMaxCost(tx: TransactionRequest): bigint {
  const gasCost =
    tx.type === 'eip1559'
      ? tx.maxFeePerGas * tx.gasLimit
      : tx.gasPrice * tx.gasLimit;

  return gasCost + tx.value;
}

// ─── Internal Validators ──────────────────────────────────────────────────────

function validateAddresses(...addresses: string[]): void {
  for (const addr of addresses) {
    if (!isAddress(addr)) {
      throw new InvalidAddressError(addr);
    }
  }
}

function validateValue(value: bigint): void {
  if (value < 0n) {
    throw new TransactionBuildError('Transaction value cannot be negative');
  }
}

function validateGasParams(maxFeePerGas: bigint, maxPriorityFeePerGas: bigint): void {
  if (maxFeePerGas <= 0n) {
    throw new TransactionBuildError('maxFeePerGas must be positive');
  }
  if (maxPriorityFeePerGas < 0n) {
    throw new TransactionBuildError('maxPriorityFeePerGas cannot be negative');
  }
  if (maxPriorityFeePerGas > maxFeePerGas) {
    throw new TransactionBuildError(
      'maxPriorityFeePerGas cannot exceed maxFeePerGas',
    );
  }
}
