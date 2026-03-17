/**
 * ERC-20 ABI encoding utilities.
 *
 * WHY we don't use a full ABI library for this: The ERC-20 interface is
 * small and stable. Hand-encoding saves a dependency while remaining correct.
 * We use ethers AbiCoder for the actual encoding (battle-tested, no risk of
 * encoding bugs vs. rolling our own).
 *
 * Standard: ERC-20 (EIP-20), EIP-55 (address checksum)
 */

import { AbiCoder, getAddress, isAddress } from 'ethers';
import { InvalidAddressError, InvalidTokenAmountError } from '../errors.js';

/** ERC-20 function selectors (keccak256 of function signature, first 4 bytes) */
export const ERC20_SELECTORS = {
  transfer: '0xa9059cbb', // transfer(address,uint256)
  approve: '0x095ea7b3', // approve(address,uint256)
  balanceOf: '0x70a08231', // balanceOf(address)
  allowance: '0xdd62ed3e', // allowance(address,address)
  decimals: '0x313ce567', // decimals()
  symbol: '0x95d89b41', // symbol()
  name: '0x06fdde03', // name()
  totalSupply: '0x18160ddd', // totalSupply()
} as const;

const abiCoder = AbiCoder.defaultAbiCoder();

/**
 * Encode an ERC-20 transfer(address,uint256) call.
 * Returns hex calldata for inclusion in TransactionRequest.data.
 *
 * WHY validate address before encoding: A typo in `to` would silently encode
 * an invalid address and send tokens to a black hole. Checksum validation
 * catches transposition errors that leave the address syntactically valid.
 */
export function encodeTransfer(to: string, amount: bigint): string {
  validateAddress(to);
  validateAmount(amount);

  const encoded = abiCoder.encode(['address', 'uint256'], [to, amount]);
  return ERC20_SELECTORS.transfer + encoded.slice(2); // Remove 0x prefix from encoded params
}

/**
 * Encode an ERC-20 approve(address,uint256) call.
 * WHY: Token approvals must be encoded exactly — wrong encoding could
 * approve the wrong spender or the wrong amount.
 */
export function encodeApprove(spender: string, amount: bigint): string {
  validateAddress(spender);
  validateAmount(amount);

  const encoded = abiCoder.encode(['address', 'uint256'], [spender, amount]);
  return ERC20_SELECTORS.approve + encoded.slice(2);
}

/**
 * Encode a balanceOf(address) call.
 */
export function encodeBalanceOf(owner: string): string {
  validateAddress(owner);

  const encoded = abiCoder.encode(['address'], [owner]);
  return ERC20_SELECTORS.balanceOf + encoded.slice(2);
}

/**
 * Encode an allowance(address,address) call.
 */
export function encodeAllowance(owner: string, spender: string): string {
  validateAddress(owner);
  validateAddress(spender);

  const encoded = abiCoder.encode(['address', 'address'], [owner, spender]);
  return ERC20_SELECTORS.allowance + encoded.slice(2);
}

/**
 * Decode a uint256 return value from an ERC-20 call response.
 * Returns BigInt — never use Number for token amounts.
 */
export function decodeUint256(data: string): bigint {
  const [result] = abiCoder.decode(['uint256'], data) as unknown as [bigint];
  return result;
}

/**
 * Decode an address return value.
 */
export function decodeAddress(data: string): string {
  const [result] = abiCoder.decode(['address'], data) as unknown as [string];
  return getAddress(result); // Ensure EIP-55 checksum
}

/**
 * Decode a string return value (for name(), symbol()).
 */
export function decodeString(data: string): string {
  const [result] = abiCoder.decode(['string'], data) as unknown as [string];
  return result;
}

/**
 * Decode a uint8 return value (for decimals()).
 */
export function decodeUint8(data: string): number {
  const [result] = abiCoder.decode(['uint8'], data) as unknown as [bigint];
  return Number(result);
}

// ─── Internal Validators ──────────────────────────────────────────────────────

function validateAddress(address: string): void {
  if (!isAddress(address)) {
    throw new InvalidAddressError(address, 'not a valid Ethereum address');
  }
  // EIP-55 checksum validation — warn if not checksummed
  try {
    getAddress(address); // throws if checksum invalid
  } catch {
    throw new InvalidAddressError(address, 'failed EIP-55 checksum validation');
  }
}

function validateAmount(amount: bigint): void {
  if (amount < 0n) {
    throw new InvalidTokenAmountError(amount.toString(), 'amount must be non-negative');
  }
  // uint256 max: 2^256 - 1
  const MAX_UINT256 = 2n ** 256n - 1n;
  if (amount > MAX_UINT256) {
    throw new InvalidTokenAmountError(amount.toString(), 'amount exceeds uint256 max');
  }
}
