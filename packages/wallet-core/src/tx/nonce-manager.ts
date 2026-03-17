/**
 * Nonce management for Ethereum transactions.
 *
 * WHY nonce management matters: Ethereum requires sequential nonces.
 * If you send tx with nonce=5 when the chain expects nonce=3, the transaction
 * won't be included until nonces 3 and 4 are confirmed (or it expires from mempool).
 * Gaps cause stuck transactions; reusing a nonce replaces the previous transaction.
 *
 * This module tracks nonces locally to handle:
 * - Sequential nonce assignment for rapid transaction submission
 * - Gap detection (missing nonces between on-chain and pending count)
 * - Replacement transaction support (speed-up / cancel)
 */

import type { NonceState } from '../types/index.js';
import { NonceError } from '../errors.js';

// In-memory nonce cache — keyed by checksummed address + chainId
const nonceCache = new Map<string, NonceState>();

function cacheKey(address: string, chainId: number): string {
  return `${address.toLowerCase()}:${chainId}`;
}

/**
 * Initialize or refresh the nonce state for an address from the chain.
 *
 * @param address        - The sending address
 * @param onChainNonce   - Current nonce from eth_getTransactionCount(addr, 'pending')
 * @param chainId        - Chain ID (to namespace the cache)
 */
export function initNonceState(
  address: string,
  onChainNonce: number,
  chainId: number,
): NonceState {
  const state: NonceState = {
    address: address.toLowerCase(),
    onChainNonce,
    pendingNonce: onChainNonce,
    gaps: [],
  };
  nonceCache.set(cacheKey(address, chainId), state);
  return state;
}

/**
 * Get the next nonce to use for a transaction, incrementing the local counter.
 * Falls back to on-chain nonce if no local state exists.
 *
 * WHY we track locally: If we submitted two transactions rapidly, calling
 * eth_getTransactionCount between them might return the same nonce for both.
 * Local tracking ensures each tx gets a unique, sequential nonce.
 */
export function getNextNonce(address: string, chainId: number): number {
  const key = cacheKey(address, chainId);
  const state = nonceCache.get(key);

  if (state === undefined) {
    throw new NonceError(
      `No nonce state for ${address} on chain ${chainId}. Call initNonceState first.`,
    );
  }

  const nonce = state.pendingNonce;

  // Increment the pending nonce for the next call
  nonceCache.set(key, {
    ...state,
    pendingNonce: state.pendingNonce + 1,
  });

  return nonce;
}

/**
 * Detect gaps in the nonce sequence.
 *
 * WHY: A gap means a transaction was submitted with a nonce that was
 * later skipped or dropped. This prevents subsequent transactions from
 * being included until the gap is filled (with a replacement tx at that nonce).
 */
export function detectGaps(
  address: string,
  chainId: number,
  pendingNonces: readonly number[],
): readonly number[] {
  const key = cacheKey(address, chainId);
  const state = nonceCache.get(key);

  if (state === undefined) {
    throw new NonceError(`No nonce state for ${address} on chain ${chainId}`);
  }

  if (pendingNonces.length === 0) return [];

  const sorted = [...pendingNonces].sort((a, b) => a - b);
  const gaps: number[] = [];

  // Check for gaps between on-chain nonce and the lowest pending nonce
  const lowestPending = sorted[0];
  if (lowestPending !== undefined) {
    for (let n = state.onChainNonce; n < lowestPending; n++) {
      gaps.push(n);
    }
  }

  // Check for gaps within the pending nonce sequence
  for (let i = 0; i < sorted.length - 1; i++) {
    const current = sorted[i];
    const next = sorted[i + 1];
    if (current !== undefined && next !== undefined && next - current > 1) {
      for (let n = current + 1; n < next; n++) {
        gaps.push(n);
      }
    }
  }

  // Update state with detected gaps
  const newState: NonceState = { ...state, gaps };
  nonceCache.set(key, newState);

  return gaps;
}

/**
 * Update the on-chain nonce after receiving confirmation of a transaction.
 * Call this when a transaction is confirmed to keep local state in sync.
 */
export function confirmNonce(address: string, chainId: number, confirmedNonce: number): void {
  const key = cacheKey(address, chainId);
  const state = nonceCache.get(key);

  if (state === undefined) return; // No state to update

  const newOnChain = confirmedNonce + 1; // Next expected on-chain nonce
  nonceCache.set(key, {
    ...state,
    onChainNonce: newOnChain,
    // Don't reset pendingNonce — we may have more in-flight
    pendingNonce: Math.max(state.pendingNonce, newOnChain),
    // Remove the confirmed nonce from gaps if it was there
    gaps: state.gaps.filter((g) => g !== confirmedNonce),
  });
}

/**
 * Get the nonce to use for a replacement transaction (speed-up or cancel).
 * Returns the same nonce as an in-flight transaction to replace it.
 *
 * WHY: To replace a pending transaction, you submit a new transaction with
 * the SAME nonce but higher gas fees. The miner will prefer the higher-fee tx.
 */
export function getReplacementNonce(
  address: string,
  chainId: number,
  targetNonce: number,
): number {
  const key = cacheKey(address, chainId);
  const state = nonceCache.get(key);

  if (state === undefined) {
    throw new NonceError(`No nonce state for ${address} on chain ${chainId}`);
  }

  if (targetNonce < state.onChainNonce) {
    throw new NonceError(
      `Cannot replace nonce ${targetNonce} — it was already confirmed (on-chain nonce: ${state.onChainNonce})`,
    );
  }

  return targetNonce;
}

/**
 * Clear the nonce cache for an address. Used on wallet reset or account switch.
 */
export function clearNonceState(address: string, chainId: number): void {
  nonceCache.delete(cacheKey(address, chainId));
}

/**
 * Get current nonce state (read-only).
 */
export function getNonceState(address: string, chainId: number): NonceState | undefined {
  return nonceCache.get(cacheKey(address, chainId));
}
