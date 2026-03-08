/**
 * Transaction engine tests — building, signing, ERC-20 encoding, gas, nonce.
 */

import { describe, it, expect } from 'vitest';
import {
  buildEthTransferEip1559,
  buildEthTransferLegacy,
  buildErc20TransferEip1559,
  buildErc20TransferLegacy,
  calculateMaxCost,
  ETH_TRANSFER_GAS_LIMIT,
  ERC20_TRANSFER_GAS_LIMIT,
} from '../src/tx/transaction-builder.js';
import { encodeTransfer, encodeApprove, encodeBalanceOf } from '../src/tx/erc20.js';
import { InvalidAddressError, TransactionBuildError } from '../src/errors.js';
import { getAddress, AbiCoder } from 'ethers';

// Known addresses for testing (EIP-55 checksummed)
const FROM_ADDR = '0x9858EfFD232B4033E47d90003D41EC34EcaEda94';
const TO_ADDR = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045'; // vitalik.eth
const SAIKO_CONTRACT = '0x4c89364F18Ecc562165820989549022e64eC2eD2';

// ─── ETH Transfer (EIP-1559) ──────────────────────────────────────────────────

describe('buildEthTransferEip1559', () => {
  it('builds a valid EIP-1559 ETH transfer', () => {
    const tx = buildEthTransferEip1559({
      from: FROM_ADDR,
      to: TO_ADDR,
      value: 1000000000000000000n, // 1 ETH
      nonce: 0,
      maxFeePerGas: 30000000000n, // 30 gwei
      maxPriorityFeePerGas: 2000000000n, // 2 gwei
      chainId: 1,
    });

    expect(tx.type).toBe('eip1559');
    expect(tx.from).toBe(getAddress(FROM_ADDR));
    expect(tx.to).toBe(getAddress(TO_ADDR));
    expect(tx.value).toBe(1000000000000000000n);
    expect(tx.gasLimit).toBe(ETH_TRANSFER_GAS_LIMIT);
    expect(tx.chainId).toBe(1);
  });

  it('uses custom gas limit when provided', () => {
    const tx = buildEthTransferEip1559({
      from: FROM_ADDR,
      to: TO_ADDR,
      value: 0n,
      nonce: 0,
      maxFeePerGas: 30000000000n,
      maxPriorityFeePerGas: 2000000000n,
      chainId: 1,
      gasLimit: 50000n,
    });

    expect(tx.gasLimit).toBe(50000n);
  });

  it('rejects invalid from address', () => {
    expect(() =>
      buildEthTransferEip1559({
        from: '0xinvalid',
        to: TO_ADDR,
        value: 0n,
        nonce: 0,
        maxFeePerGas: 30000000000n,
        maxPriorityFeePerGas: 2000000000n,
        chainId: 1,
      }),
    ).toThrow(InvalidAddressError);
  });

  it('rejects negative value', () => {
    expect(() =>
      buildEthTransferEip1559({
        from: FROM_ADDR,
        to: TO_ADDR,
        value: -1n,
        nonce: 0,
        maxFeePerGas: 30000000000n,
        maxPriorityFeePerGas: 2000000000n,
        chainId: 1,
      }),
    ).toThrow(TransactionBuildError);
  });

  it('rejects maxPriorityFeePerGas > maxFeePerGas', () => {
    expect(() =>
      buildEthTransferEip1559({
        from: FROM_ADDR,
        to: TO_ADDR,
        value: 0n,
        nonce: 0,
        maxFeePerGas: 1000000000n,
        maxPriorityFeePerGas: 2000000000n,
        chainId: 1,
      }),
    ).toThrow(TransactionBuildError);
  });

  it('rejects zero maxFeePerGas', () => {
    expect(() =>
      buildEthTransferEip1559({
        from: FROM_ADDR,
        to: TO_ADDR,
        value: 0n,
        nonce: 0,
        maxFeePerGas: 0n,
        maxPriorityFeePerGas: 0n,
        chainId: 1,
      }),
    ).toThrow(TransactionBuildError);
  });
});

// ─── ETH Transfer (Legacy) ───────────────────────────────────────────────────

describe('buildEthTransferLegacy', () => {
  it('builds a valid legacy ETH transfer', () => {
    const tx = buildEthTransferLegacy({
      from: FROM_ADDR,
      to: TO_ADDR,
      value: 500000000000000000n, // 0.5 ETH
      nonce: 5,
      gasPrice: 20000000000n, // 20 gwei
      chainId: 1,
    });

    expect(tx.type).toBe('legacy');
    expect(tx.gasPrice).toBe(20000000000n);
    expect(tx.gasLimit).toBe(ETH_TRANSFER_GAS_LIMIT);
  });

  it('rejects zero gasPrice', () => {
    expect(() =>
      buildEthTransferLegacy({
        from: FROM_ADDR,
        to: TO_ADDR,
        value: 0n,
        nonce: 0,
        gasPrice: 0n,
        chainId: 1,
      }),
    ).toThrow(TransactionBuildError);
  });
});

// ─── ERC-20 Transfer ──────────────────────────────────────────────────────────

describe('buildErc20TransferEip1559', () => {
  it('builds a valid ERC-20 transfer with value=0', () => {
    const tx = buildErc20TransferEip1559({
      from: FROM_ADDR,
      tokenAddress: SAIKO_CONTRACT,
      recipient: TO_ADDR,
      amount: 1000000000000000000n,
      nonce: 0,
      maxFeePerGas: 30000000000n,
      maxPriorityFeePerGas: 2000000000n,
      chainId: 1,
    });

    expect(tx.value).toBe(0n); // ERC-20 transfers don't send ETH
    expect(tx.to).toBe(getAddress(SAIKO_CONTRACT)); // Goes to token contract
    expect(tx.data).toBeDefined();
    expect(tx.gasLimit).toBe(ERC20_TRANSFER_GAS_LIMIT);
  });

  it('encodes transfer calldata correctly', () => {
    const tx = buildErc20TransferEip1559({
      from: FROM_ADDR,
      tokenAddress: SAIKO_CONTRACT,
      recipient: TO_ADDR,
      amount: 1000n,
      nonce: 0,
      maxFeePerGas: 30000000000n,
      maxPriorityFeePerGas: 2000000000n,
      chainId: 1,
    });

    // transfer(address,uint256) selector = 0xa9059cbb
    expect(tx.data?.startsWith('0xa9059cbb')).toBe(true);
  });
});

// ─── ERC-20 ABI Encoding ──────────────────────────────────────────────────────

describe('encodeTransfer', () => {
  it('encodes with correct function selector', () => {
    const data = encodeTransfer(TO_ADDR, 1000n);
    expect(data.startsWith('0xa9059cbb')).toBe(true);
  });

  it('encodes the recipient address correctly', () => {
    const data = encodeTransfer(TO_ADDR, 1000n);
    // Address is in bytes 4..36 (left-padded to 32 bytes)
    const addressParam = '0x' + data.slice(10, 74);
    const decoded = AbiCoder.defaultAbiCoder().decode(['address'], addressParam);
    expect(getAddress(decoded[0] as string)).toBe(getAddress(TO_ADDR));
  });
});

describe('encodeApprove', () => {
  it('encodes with correct function selector', () => {
    const data = encodeApprove(TO_ADDR, 1000n);
    // approve(address,uint256) selector = 0x095ea7b3
    expect(data.startsWith('0x095ea7b3')).toBe(true);
  });
});

describe('encodeBalanceOf', () => {
  it('encodes with correct function selector', () => {
    const data = encodeBalanceOf(FROM_ADDR);
    // balanceOf(address) selector = 0x70a08231
    expect(data.startsWith('0x70a08231')).toBe(true);
  });
});

// ─── Max Cost Calculation ─────────────────────────────────────────────────────

describe('calculateMaxCost', () => {
  it('calculates EIP-1559 max cost correctly', () => {
    const tx = buildEthTransferEip1559({
      from: FROM_ADDR,
      to: TO_ADDR,
      value: 1000000000000000000n, // 1 ETH
      nonce: 0,
      maxFeePerGas: 30000000000n,
      maxPriorityFeePerGas: 2000000000n,
      chainId: 1,
    });

    const cost = calculateMaxCost(tx);
    // 21000 * 30 gwei + 1 ETH
    const expected = 21000n * 30000000000n + 1000000000000000000n;
    expect(cost).toBe(expected);
  });

  it('calculates legacy max cost correctly', () => {
    const tx = buildEthTransferLegacy({
      from: FROM_ADDR,
      to: TO_ADDR,
      value: 500000000000000000n,
      nonce: 0,
      gasPrice: 20000000000n,
      chainId: 1,
    });

    const cost = calculateMaxCost(tx);
    const expected = 21000n * 20000000000n + 500000000000000000n;
    expect(cost).toBe(expected);
  });
});
