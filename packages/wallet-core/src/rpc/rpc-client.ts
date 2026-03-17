/**
 * Multi-provider RPC client with rotation and failover.
 *
 * WHY we roll our own instead of using ethers providers:
 * ethers v6 providers don't support custom failover logic with per-provider
 * health tracking and weight-based rotation. We implement this at the fetch
 * level so we have full control over:
 * - Provider selection order (weight-based)
 * - Failure thresholds before blacklisting a provider
 * - Timeout handling per request type
 * - Chain ID validation on each provider connection
 *
 * The client communicates via raw JSON-RPC (eth_ methods) and returns typed
 * results. Higher-level modules use this client rather than calling fetch directly.
 */

import type { RpcRequest, RpcResponse, RpcClientConfig, ProviderConfig } from '../types/index.js';
import { RPCTimeoutError, RPCError, AllProvidersFailedError, RpcValidationError } from '../errors.js';
import { validateChainId } from './chain-validator.js';

/** Number of consecutive failures before a provider is temporarily blacklisted */
const MAX_PROVIDER_FAILURES = 3;

/** How long to blacklist a failing provider (ms) */
const PROVIDER_BLACKLIST_DURATION_MS = 60_000; // 1 minute

interface ProviderHealth {
  consecutiveFailures: number;
  blacklistedUntil: number; // Unix ms timestamp, 0 = not blacklisted
}

/**
 * Create a stateful RPC client. The returned object holds provider health
 * state but no sensitive data — safe to keep alive for the session.
 */
export function createRpcClient(config: RpcClientConfig): RpcClient {
  const healthMap = new Map<string, ProviderHealth>(
    config.providers.map((p) => [
      p.url,
      { consecutiveFailures: 0, blacklistedUntil: 0 },
    ]),
  );

  let chainIdValidated = false;

  /**
   * Get available providers sorted by weight (highest first), excluding blacklisted ones.
   */
  function getAvailableProviders(): readonly ProviderConfig[] {
    const now = Date.now();
    return [...config.providers]
      .filter((p) => {
        const health = healthMap.get(p.url);
        return health === undefined || health.blacklistedUntil <= now;
      })
      .sort((a, b) => b.weight - a.weight);
  }

  /**
   * Record a provider failure, potentially blacklisting it.
   */
  function recordFailure(url: string): void {
    const health = healthMap.get(url) ?? { consecutiveFailures: 0, blacklistedUntil: 0 };
    const failures = health.consecutiveFailures + 1;
    healthMap.set(url, {
      consecutiveFailures: failures,
      blacklistedUntil:
        failures >= MAX_PROVIDER_FAILURES ? Date.now() + PROVIDER_BLACKLIST_DURATION_MS : 0,
    });
  }

  /**
   * Record a provider success, clearing its failure count.
   */
  function recordSuccess(url: string): void {
    healthMap.set(url, { consecutiveFailures: 0, blacklistedUntil: 0 });
  }

  /**
   * Execute a single JSON-RPC request against a specific provider.
   * Handles timeout, HTTP errors, and JSON-RPC error responses.
   */
  async function executeRequest<T>(
    provider: ProviderConfig,
    request: RpcRequest,
  ): Promise<T> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), provider.timeoutMs);

    let response: Response;
    try {
      response = await fetch(provider.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: Date.now(),
          method: request.method,
          params: request.params,
        }),
        signal: controller.signal,
      });
    } catch (err) {
      clearTimeout(timeoutId);
      if (err instanceof Error && err.name === 'AbortError') {
        throw new RPCTimeoutError(provider.url, provider.timeoutMs);
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      throw new RPCError(
        `HTTP ${response.status} from ${provider.url}`,
        response.status,
      );
    }

    const json = (await response.json()) as RpcResponse<T>;

    if (json.error !== undefined) {
      throw new RPCError(json.error.message, json.error.code);
    }

    if (json.result === undefined) {
      throw new RPCError('RPC response missing result field', -32700);
    }

    validateRpcResult(request.method, json.result);
    return json.result;
  }

  /**
   * Validate RPC result matches expected format for known methods.
   * Throws RpcValidationError on malformed data.
   */
  function validateRpcResult(method: string, result: unknown): void {
    const hexPattern = /^0x[0-9a-fA-F]*$/;

    if (method === 'eth_getBalance' || method === 'eth_blockNumber') {
      if (typeof result !== 'string' || !hexPattern.test(result)) {
        throw new RpcValidationError(method, `expected hex string, got ${typeof result}: ${String(result).slice(0, 100)}`);
      }
    }

    if (method === 'eth_chainId') {
      if (typeof result !== 'string' || !hexPattern.test(result)) {
        throw new RpcValidationError(method, `expected hex chain ID, got ${typeof result}: ${String(result).slice(0, 100)}`);
      }
    }
  }

  /**
   * Send a JSON-RPC request with automatic provider rotation on failure.
   * Tries each available provider in weight order; throws AllProvidersFailedError
   * if all fail.
   */
  async function send<T>(request: RpcRequest): Promise<T> {
    // Validate chain ID on first real request
    if (!chainIdValidated && request.method !== 'eth_chainId') {
      const hexChainId = await send<string>({ method: 'eth_chainId', params: [] });
      validateChainId(hexChainId, config.chainId);
      chainIdValidated = true;
    }

    const providers = getAvailableProviders();
    if (providers.length === 0) {
      throw new AllProvidersFailedError([
        new Error('All providers are currently blacklisted due to repeated failures'),
      ]);
    }

    const errors: Error[] = [];

    for (const provider of providers) {
      try {
        const result = await executeRequest<T>(provider, request);
        recordSuccess(provider.url);
        return result;
      } catch (err) {
        recordFailure(provider.url);
        errors.push(err instanceof Error ? err : new Error(String(err)));
        // Continue to next provider
      }
    }

    throw new AllProvidersFailedError(errors);
  }

  /**
   * Reset chain ID validation (call after switching networks).
   */
  function resetChainValidation(): void {
    chainIdValidated = false;
  }

  /**
   * Get health status of all providers (for diagnostics).
   */
  function getProviderHealth(): ReadonlyMap<string, ProviderHealth> {
    return healthMap;
  }

  return { send, resetChainValidation, getProviderHealth };
}

export interface RpcClient {
  send: <T>(request: RpcRequest) => Promise<T>;
  resetChainValidation: () => void;
  getProviderHealth: () => ReadonlyMap<string, ProviderHealth>;
}
