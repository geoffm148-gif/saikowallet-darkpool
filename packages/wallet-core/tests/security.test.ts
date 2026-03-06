/**
 * Security module tests — transaction simulator, address poisoning, clipboard guard.
 *
 * WHY we mock the RPC client for simulation tests: We can't run a real Ethereum
 * node in CI. The mock lets us inject deterministic responses to test the
 * simulation logic in isolation.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  simulateTransaction,
  decodeErc20Calldata,
} from '../src/security/transaction-simulator.js';
import {
  detectPoisoning,
  calculateAddressSimilarity,
  hasPrefixSuffixMatch,
} from '../src/security/address-poisoning.js';
import {
  verifyClipboardIntegrity,
  isClipboardIntact,
} from '../src/security/clipboard-guard.js';
import type { RpcClient } from '../src/rpc/rpc-client.js';
import { InvalidAddressError } from '../src/errors.js';
import { encodeTransfer, encodeApprove } from '../src/tx/erc20.js';

// ─── Mock RPC Client ───────────────────────────────────────────────────────────

function createMockRpcClient(overrides: {
  estimateGas?: string | (() => never);
  ethCall?: string;
} = {}): RpcClient {
  return {
    send: vi.fn(async (req: { method: string; params: unknown[] }) => {
      if (req.method === 'eth_estimateGas') {
        if (typeof overrides.estimateGas === 'function') {
          overrides.estimateGas();
        }
        return overrides.estimateGas ?? '0x5208'; // 21000 gas
      }
      if (req.method === 'eth_call') {
        return overrides.ethCall ?? '0x0000000000000000000000000000000000000000000000000000000000000001';
      }
      return '0x0';
    }),
    resetChainValidation: vi.fn(),
    getProviderHealth: vi.fn(() => new Map()),
  } as unknown as RpcClient;
}

// ─── Test Addresses ───────────────────────────────────────────────────────────

/** A real checksummed Ethereum address. */
const REAL_ADDRESS = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045';
/** Same first 4 + last 4 chars as REAL_ADDRESS but different middle — classic poisoned address. */
const POISONED_ADDRESS = '0xd8dA6BF2111111111111111111111115D37aA96045';
/** Completely different address. */
const UNRELATED_ADDRESS = '0x742d35Cc6634C0532925a3b8D4C9C0bFa1e2d3e4';

// Note: these addresses have 42 chars (0x + 40 hex chars)
// Let's use properly sized test addresses:
const KNOWN_ADDR = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045';
const POISONED_ADDR = '0xd8dA6BF2deadbeef12345678CAFEBABE37aA96045'.slice(0, 42);
const ERC20_CONTRACT = '0x4c89364F18Ecc562165820989549022e64eC2eD2';
const SPENDER = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';

// ─── Transaction Simulator ─────────────────────────────────────────────────────

describe('simulateTransaction', () => {
  const baseTx = {
    from: KNOWN_ADDR,
    to: UNRELATED_ADDRESS,
    value: 0n,
    nonce: 0,
    gasLimit: 21000n,
    chainId: 1,
    type: 'eip1559' as const,
    maxFeePerGas: 1000000000n,
    maxPriorityFeePerGas: 100000000n,
  };

  it('simulates a plain ETH transfer successfully', async () => {
    const provider = createMockRpcClient({ estimateGas: '0x5208' });
    const tx = { ...baseTx, value: 1_000_000_000_000_000_000n }; // 1 ETH

    const result = await simulateTransaction(tx, provider);

    expect(result.success).toBe(true);
    expect(result.gasUsed).toBe(21000n);
    expect(result.decodedActions).toHaveLength(1);
    expect(result.decodedActions[0]?.type).toBe('eth-transfer');
    expect(result.decodedActions[0]?.amount).toBe(1_000_000_000_000_000_000n);
  });

  it('returns success=false when transaction would revert', async () => {
    const provider = createMockRpcClient({
      estimateGas: () => {
        throw new Error('execution reverted: insufficient balance');
      },
    });

    const result = await simulateTransaction(baseTx, provider);

    expect(result.success).toBe(false);
    expect(result.gasUsed).toBe(0n);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toMatch(/revert/i);
  });

  it('decodes an ERC-20 transfer and reports action', async () => {
    const provider = createMockRpcClient({ estimateGas: '0xcf08' }); // ~53000 gas
    const transferData = encodeTransfer(SPENDER, 1000n * 10n ** 18n);

    const tx = {
      ...baseTx,
      to: ERC20_CONTRACT,
      data: transferData,
    };

    const result = await simulateTransaction(tx, provider);

    expect(result.success).toBe(true);
    expect(result.decodedActions).toHaveLength(1);
    expect(result.decodedActions[0]?.type).toBe('erc20-transfer');
    expect(result.decodedActions[0]?.description).toMatch(/transfer/i);
  });

  it('decodes an ERC-20 approve and emits unlimited warning', async () => {
    const provider = createMockRpcClient({ estimateGas: '0xcf08' });
    const MAX_UINT256 = 2n ** 256n - 1n;
    const approveData = encodeApprove(SPENDER, MAX_UINT256);

    const tx = {
      ...baseTx,
      to: ERC20_CONTRACT,
      data: approveData,
    };

    const result = await simulateTransaction(tx, provider);

    expect(result.success).toBe(true);
    expect(result.decodedActions[0]?.type).toBe('erc20-approve');
    expect(result.warnings.some((w) => w.includes('UNLIMITED'))).toBe(true);
  });

  it('handles unknown contract calls with a warning', async () => {
    const provider = createMockRpcClient({ estimateGas: '0x186a0' }); // 100000 gas
    const unknownData = '0xdeadbeef0000000000000000000000000000000000000000000000000000000000000001';

    const tx = {
      ...baseTx,
      to: ERC20_CONTRACT,
      data: unknownData,
    };

    const result = await simulateTransaction(tx, provider);

    expect(result.success).toBe(true);
    expect(result.decodedActions[0]?.type).toBe('contract-call');
    expect(result.warnings.some((w) => w.includes('unrecognized'))).toBe(true);
  });
});

describe('decodeErc20Calldata', () => {
  it('decodes a transfer call', () => {
    const data = encodeTransfer(SPENDER, 500n);
    const result = decodeErc20Calldata(data, ERC20_CONTRACT);

    expect(result).not.toBeNull();
    expect(result?.type).toBe('erc20-transfer');
    expect(result?.amount).toBe(500n);
  });

  it('decodes an approve call', () => {
    const data = encodeApprove(SPENDER, 1000n);
    const result = decodeErc20Calldata(data, ERC20_CONTRACT);

    expect(result).not.toBeNull();
    expect(result?.type).toBe('erc20-approve');
    expect(result?.amount).toBe(1000n);
  });

  it('returns null for unknown selectors', () => {
    const result = decodeErc20Calldata('0x12345678', ERC20_CONTRACT);
    expect(result).toBeNull();
  });

  it('returns null for empty data', () => {
    expect(decodeErc20Calldata('', ERC20_CONTRACT)).toBeNull();
    expect(decodeErc20Calldata('0x', ERC20_CONTRACT)).toBeNull();
  });
});

// ─── Address Poisoning ────────────────────────────────────────────────────────

describe('detectPoisoning', () => {
  // Build a poisoned address: same prefix (0xd8dA) and suffix (6045) as KNOWN_ADDR
  // KNOWN_ADDR = 0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045
  // prefix 4 chars: d8dA  suffix 4 chars: 6045
  const POISONED = '0xd8da000000000000000000000000000000006045';

  it('detects a poisoned address matching a known contact', () => {
    const result = detectPoisoning(POISONED, [KNOWN_ADDR]);

    expect(result.isPoisoned).toBe(true);
    expect(result.warning).not.toBeNull();
    expect(result.similarTo).toBe(KNOWN_ADDR);
  });

  it('does not flag an exact match as poisoned', () => {
    const result = detectPoisoning(KNOWN_ADDR, [KNOWN_ADDR]);
    expect(result.isPoisoned).toBe(false);
    expect(result.warning).toBeNull();
  });

  it('does not flag an unrelated address as poisoned', () => {
    const unrelated = '0x1234567890123456789012345678901234567890';
    const result = detectPoisoning(unrelated, [KNOWN_ADDR]);
    expect(result.isPoisoned).toBe(false);
  });

  it('returns isPoisoned=false when known addresses list is empty', () => {
    const result = detectPoisoning(POISONED, []);
    expect(result.isPoisoned).toBe(false);
  });

  it('throws for invalid address format', () => {
    expect(() => detectPoisoning('not-an-address', [KNOWN_ADDR])).toThrow(InvalidAddressError);
  });

  it('handles multiple known addresses and finds the most similar', () => {
    const unrelated = '0x1234567890123456789012345678901234567890';
    const result = detectPoisoning(POISONED, [unrelated, KNOWN_ADDR]);
    expect(result.isPoisoned).toBe(true);
    expect(result.similarTo).toBe(KNOWN_ADDR);
  });
});

describe('calculateAddressSimilarity', () => {
  it('returns 1.0 for identical addresses', () => {
    const score = calculateAddressSimilarity(KNOWN_ADDR, KNOWN_ADDR);
    expect(score).toBe(1.0);
  });

  it('returns 0 for non-address strings', () => {
    expect(calculateAddressSimilarity('not-an-address', KNOWN_ADDR)).toBe(0);
    expect(calculateAddressSimilarity(KNOWN_ADDR, 'not-an-address')).toBe(0);
  });

  it('returns higher score for prefix+suffix match than unrelated address', () => {
    const poisoned = '0xd8da000000000000000000000000000000006045';
    const unrelated = '0x1234567890123456789012345678901234567890';

    const poisonedScore = calculateAddressSimilarity(KNOWN_ADDR, poisoned);
    const unrelatedScore = calculateAddressSimilarity(KNOWN_ADDR, unrelated);

    expect(poisonedScore).toBeGreaterThan(unrelatedScore);
  });

  it('returns a value in [0, 1] range', () => {
    const score = calculateAddressSimilarity(KNOWN_ADDR, UNRELATED_ADDRESS);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(1);
  });
});

describe('hasPrefixSuffixMatch', () => {
  it('returns true when prefix and suffix match but middle differs', () => {
    // KNOWN_ADDR: 0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045
    // Poisoned:   0xd8da000000000000000000000000000000006045
    const poisoned = '0xd8da000000000000000000000000000000006045';
    expect(hasPrefixSuffixMatch(KNOWN_ADDR, poisoned)).toBe(true);
  });

  it('returns false for identical addresses', () => {
    expect(hasPrefixSuffixMatch(KNOWN_ADDR, KNOWN_ADDR)).toBe(false);
  });

  it('returns false when prefix does not match', () => {
    const different = '0x1111000000000000000000000000000000006045';
    expect(hasPrefixSuffixMatch(KNOWN_ADDR, different)).toBe(false);
  });

  it('returns false for invalid addresses', () => {
    expect(hasPrefixSuffixMatch('not-an-address', KNOWN_ADDR)).toBe(false);
  });
});

// ─── Clipboard Guard ──────────────────────────────────────────────────────────

describe('verifyClipboardIntegrity', () => {
  it('returns isIntact=true when addresses are the same', () => {
    const result = verifyClipboardIntegrity(KNOWN_ADDR, KNOWN_ADDR);
    expect(result.isIntact).toBe(true);
    expect(result.warning).toBeNull();
  });

  it('normalizes address casing before comparison (no false positive)', () => {
    const lower = KNOWN_ADDR.toLowerCase();
    const result = verifyClipboardIntegrity(KNOWN_ADDR, lower);
    expect(result.isIntact).toBe(true); // EIP-55 normalization makes them equal
    expect(result.warning).toBeNull();
  });

  it('detects clipboard hijacking (both valid addresses, different content)', () => {
    const attackerAddr = '0x1234567890123456789012345678901234567890';
    const result = verifyClipboardIntegrity(KNOWN_ADDR, attackerAddr);

    expect(result.isIntact).toBe(false);
    expect(result.warning).not.toBeNull();
    expect(result.warning).toMatch(/CLIPBOARD HIJACKING/i);
    expect(result.bothAreAddresses).toBe(true);
  });

  it('warns when clipboard changes to a new Ethereum address', () => {
    const attackerAddr = '0x1234567890123456789012345678901234567890';
    const result = verifyClipboardIntegrity('some text I copied', attackerAddr);

    expect(result.isIntact).toBe(false);
    expect(result.warning).not.toBeNull();
    expect(result.bothAreAddresses).toBe(false);
  });

  it('warns on generic content change', () => {
    const result = verifyClipboardIntegrity('original text', 'different text');
    expect(result.isIntact).toBe(false);
    expect(result.warning).not.toBeNull();
  });

  it('trims whitespace before comparing', () => {
    const result = verifyClipboardIntegrity(KNOWN_ADDR, `  ${KNOWN_ADDR}  `);
    expect(result.isIntact).toBe(true);
  });

  it('returns correct originalAddress and currentAddress in result', () => {
    const attacker = '0x1234567890123456789012345678901234567890';
    const result = verifyClipboardIntegrity(KNOWN_ADDR, attacker);
    // Both should be normalized (EIP-55)
    expect(result.originalAddress).toBe(KNOWN_ADDR);
  });
});

describe('isClipboardIntact', () => {
  it('returns true for identical content', () => {
    expect(isClipboardIntact(KNOWN_ADDR, KNOWN_ADDR)).toBe(true);
  });

  it('returns true for same address different case', () => {
    expect(isClipboardIntact(KNOWN_ADDR, KNOWN_ADDR.toLowerCase())).toBe(true);
  });

  it('returns false for different content', () => {
    expect(isClipboardIntact(KNOWN_ADDR, '0x1234567890123456789012345678901234567890')).toBe(false);
  });
});
