/**
 * RPC layer tests — chain ID validation, provider config, network config.
 */

import { describe, it, expect } from 'vitest';
import { validateChainId, parseChainId, isTestnet } from '../src/rpc/chain-validator.js';
import { MAINNET_CONFIG, SEPOLIA_CONFIG, BUILTIN_NETWORKS } from '../src/rpc/network-config.js';
import {
  DEFAULT_MAINNET_PROVIDERS,
  DEFAULT_SEPOLIA_PROVIDERS,
  TIMEOUT_STANDARD_MS,
  TIMEOUT_CALL_MS,
  TIMEOUT_SEND_TX_MS,
  createProviderConfig,
} from '../src/rpc/provider-config.js';
import { ChainIdMismatchError } from '../src/errors.js';

// ─── Chain ID Validation ──────────────────────────────────────────────────────

describe('validateChainId', () => {
  it('passes for matching chain ID (mainnet)', () => {
    expect(() => validateChainId('0x1', 1)).not.toThrow();
  });

  it('passes for matching chain ID (Sepolia)', () => {
    expect(() => validateChainId('0xaa36a7', 11155111)).not.toThrow();
  });

  it('throws ChainIdMismatchError for mismatched chain ID', () => {
    expect(() => validateChainId('0x5', 1)).toThrow(ChainIdMismatchError);
  });

  it('throws for invalid hex string', () => {
    expect(() => validateChainId('not-hex', 1)).toThrow(ChainIdMismatchError);
  });

  it('error contains expected and received values', () => {
    try {
      validateChainId('0x5', 1);
    } catch (err) {
      expect(err).toBeInstanceOf(ChainIdMismatchError);
      const error = err as ChainIdMismatchError;
      expect(error.expected).toBe(1);
      expect(error.received).toBe(5);
    }
  });
});

describe('parseChainId', () => {
  it('parses hex string', () => {
    expect(parseChainId('0x1')).toBe(1);
  });

  it('parses hex string uppercase', () => {
    expect(parseChainId('0XA')).toBe(10);
  });

  it('parses decimal string', () => {
    expect(parseChainId('137')).toBe(137);
  });

  it('passes through number', () => {
    expect(parseChainId(42161)).toBe(42161);
  });

  it('throws for invalid string', () => {
    expect(() => parseChainId('abc')).toThrow();
  });
});

describe('isTestnet', () => {
  it('Sepolia is a testnet', () => {
    expect(isTestnet(11155111)).toBe(true);
  });

  it('Mainnet is not a testnet', () => {
    expect(isTestnet(1)).toBe(false);
  });

  it('Holesky is a testnet', () => {
    expect(isTestnet(17000)).toBe(true);
  });

  it('Random chain ID is not a testnet', () => {
    expect(isTestnet(999999)).toBe(false);
  });
});

// ─── Network Config ───────────────────────────────────────────────────────────

describe('Network Config', () => {
  it('Ethereum Mainnet has correct chain ID', () => {
    expect(MAINNET_CONFIG.chainId).toBe(1);
  });

  it('Ethereum Mainnet is not a testnet', () => {
    expect(MAINNET_CONFIG.isTestnet).toBe(false);
  });

  it('Sepolia has correct chain ID', () => {
    expect(SEPOLIA_CONFIG.chainId).toBe(11155111);
  });

  it('Sepolia is a testnet', () => {
    expect(SEPOLIA_CONFIG.isTestnet).toBe(true);
  });

  it('BUILTIN_NETWORKS has mainnet', () => {
    const net = BUILTIN_NETWORKS.get(1);
    expect(net).toBeDefined();
    expect(net?.name).toContain('Ethereum');
  });

  it('BUILTIN_NETWORKS returns undefined for unknown chain', () => {
    expect(BUILTIN_NETWORKS.get(999999)).toBeUndefined();
  });
});

// ─── Provider Config ──────────────────────────────────────────────────────────

describe('Provider Config', () => {
  it('has at least 2 default mainnet providers', () => {
    expect(DEFAULT_MAINNET_PROVIDERS.length).toBeGreaterThanOrEqual(2);
  });

  it('has at least 1 default Sepolia provider', () => {
    expect(DEFAULT_SEPOLIA_PROVIDERS.length).toBeGreaterThanOrEqual(1);
  });

  it('all mainnet providers have positive timeout', () => {
    for (const p of DEFAULT_MAINNET_PROVIDERS) {
      expect(p.timeoutMs).toBeGreaterThan(0);
    }
  });

  it('all providers have positive weight', () => {
    for (const p of DEFAULT_MAINNET_PROVIDERS) {
      expect(p.weight).toBeGreaterThan(0);
    }
  });

  it('timeout constants are correctly ordered', () => {
    expect(TIMEOUT_STANDARD_MS).toBeLessThan(TIMEOUT_CALL_MS);
    expect(TIMEOUT_CALL_MS).toBeLessThan(TIMEOUT_SEND_TX_MS);
  });

  it('createProviderConfig creates a high-weight provider', () => {
    const custom = createProviderConfig('https://my-node.example.com');
    expect(custom.weight).toBe(10);
    expect(custom.url).toBe('https://my-node.example.com');
    expect(custom.timeoutMs).toBe(TIMEOUT_STANDARD_MS);
  });

  it('createProviderConfig accepts custom timeout', () => {
    const custom = createProviderConfig('https://my-node.example.com', 5000);
    expect(custom.timeoutMs).toBe(5000);
  });
});
