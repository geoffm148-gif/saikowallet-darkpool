/**
 * wallet-safe.ts — Extension-safe re-implementation of wallet-core exports.
 *
 * The wallet-core barrel index.ts imports libsodium-wrappers (WASM) as a
 * side-effect, which fails in the extension popup. This file provides
 * everything the popup needs using only Web Crypto API + ethers + poseidon-lite.
 *
 * Used via vite alias: @saiko-wallet/wallet-core → this file
 */

import {
  HDNodeWallet, Mnemonic, ethers,
  AbiCoder, Contract, JsonRpcProvider,
  parseUnits, formatUnits,
} from 'ethers';
import { poseidon1, poseidon2 } from 'poseidon-lite';

// ─── Re-export safe types ────────────────────────────────────────────────────

export type { DarkPoolNote } from '../../../wallet-core/src/darkpool/types.js';
export type { SubWallet } from '../../../wallet-core/src/accounts/types.js';
export type { SwapQuote } from '../../../wallet-core/src/swap/uniswap-quotes.js';
export type { SwapToken } from '../../../wallet-core/src/swap/swap-tokens.js';

// ─── Constants ───────────────────────────────────────────────────────────────

export { DARKPOOL_TIERS, TIER_LABELS, DARK_POOL_ADDRESS, DARK_POOL_V2_ADDRESS, SAIKO_TOKEN_ADDRESS, DARK_POOL_STAKING_ADDRESS } from '../../../wallet-core/src/darkpool/constants.js';
export { DEFAULT_MAINNET_PROVIDERS } from '../../../wallet-core/src/rpc/provider-config.js';

export const SAIKO_TOKEN = {
  address: '0x4c89364F18Ecc562165820989549022e64eC2eD2',
  symbol: 'SAIKO',
  decimals: 18,
  name: 'Saiko Inu',
};
export const SAIKO_CONTRACT_ADDRESS = '0x4c89364F18Ecc562165820989549022e64eC2eD2';
export const UNISWAP_V2_ROUTER = '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D';
export const SAIKO_SWAP_ROUTER = '0x5fb62a972aa9cfac642f117c00b2a48ea56fb82d';

// ─── Mnemonic / Account Derivation ──────────────────────────────────────────

export function generateMnemonic(wordCount: 12 | 24 = 24): { mnemonic: string; entropy: Uint8Array } {
  const bytes = wordCount === 24 ? 32 : 16;
  const entropy = crypto.getRandomValues(new Uint8Array(bytes));
  const mn = Mnemonic.fromEntropy(entropy);
  return { mnemonic: mn.phrase, entropy };
}

export function deriveAccount(mnemonic: string, index: number): { address: string; path: string } {
  const path = `m/44'/60'/0'/0/${index}`;
  const wallet = HDNodeWallet.fromMnemonic(Mnemonic.fromPhrase(mnemonic), path);
  return { address: wallet.address, path };
}

// ─── DarkPool Crypto (Web Crypto + poseidon-lite, NO libsodium/argon2) ──────

function bytesToBigInt(bytes: Uint8Array): bigint {
  return BigInt('0x' + Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join(''));
}

function bigIntToHex(n: bigint): string {
  return '0x' + n.toString(16).padStart(64, '0');
}

export function generateSecret(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(32));
}

export function generateNullifier(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(32));
}

export async function computeCommitment(secret: Uint8Array, nullifier: Uint8Array): Promise<string> {
  const s = bytesToBigInt(secret);
  const n = bytesToBigInt(nullifier);
  const result = poseidon2([s, n]);
  return bigIntToHex(result);
}

export async function deriveViewingKey(secret: Uint8Array): Promise<Uint8Array> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw', Uint8Array.from(secret), { name: 'HKDF' }, false, ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(32), info: new TextEncoder().encode('saiko-darkpool-viewing-key') },
    keyMaterial, 256,
  );
  return new Uint8Array(bits);
}

// ─── DarkPool Fee Utils ──────────────────────────────────────────────────────

const FEE_BPS = 50n; // 0.5%

export function calculateAmountAfterFee(tierAmount: bigint): bigint {
  return tierAmount - (tierAmount * FEE_BPS / 10000n);
}

export function formatDarkPoolFeeBreakdown(tierAmount: bigint): { tier: bigint; fee: bigint; amountAfterFee: bigint } {
  const fee = tierAmount * FEE_BPS / 10000n;
  const amountAfterFee = tierAmount - fee;
  return { tier: tierAmount, fee, amountAfterFee };
}

// ─── Note Storage — routed through service worker (AES-GCM encrypted, v2 keys) ──

import type { DarkPoolNote } from '../../../wallet-core/src/darkpool/types.js';

// NOTE: Direct chrome.storage.local access for notes is intentionally removed.
// All note I/O routes through the service worker's darkpool:* handlers which use
// AES-GCM encryption keyed to the session passphrase (v2 storage keys).

function serializeNote(note: DarkPoolNote): Record<string, unknown> {
  return {
    secret: Array.from(note.secret),
    nullifier: Array.from(note.nullifier),
    commitment: note.commitment,
    amount: note.amount.toString(),
    tier: note.tier,
    timestamp: note.timestamp,
    txHash: note.txHash,
    viewingKey: Array.from(note.viewingKey),
    isSpent: note.isSpent,
    poolVersion: (note as any).poolVersion,
  };
}

function deserializeNote(obj: Record<string, unknown>): DarkPoolNote {
  return {
    secret: new Uint8Array(obj.secret as number[]),
    nullifier: new Uint8Array(obj.nullifier as number[]),
    commitment: obj.commitment as string,
    amount: BigInt(obj.amount as string),
    tier: obj.tier as number,
    timestamp: obj.timestamp as number,
    txHash: obj.txHash as string,
    viewingKey: new Uint8Array(obj.viewingKey as number[]),
    isSpent: obj.isSpent as boolean,
    ...(obj.poolVersion ? { poolVersion: obj.poolVersion as 'v2' | 'v3' } : {}),
  } as DarkPoolNote;
}

/**
 * Load notes via service worker (decrypts AES-GCM encrypted v2 storage).
 * The `addressOrPassword` param is the wallet address.
 */
export async function loadNotes(addressOrPassword: string): Promise<DarkPoolNote[]> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ action: 'darkpool:getNotes', address: addressOrPassword }, (resp: any) => {
      if (chrome.runtime.lastError || !resp?.notes) { resolve([]); return; }
      try {
        resolve((resp.notes as Record<string, unknown>[]).map(deserializeNote));
      } catch { resolve([]); }
    });
  });
}

/**
 * Save a note via service worker (encrypts with AES-GCM before storing).
 * The `addressOrPassword` param is the wallet address.
 */
export async function saveNote(note: DarkPoolNote, addressOrPassword: string): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      { action: 'darkpool:saveNote', address: addressOrPassword, note: serializeNote(note) },
      (resp: any) => {
        if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
        if (resp?.error) return reject(new Error(resp.error));
        resolve();
      }
    );
  });
}

// ─── Poseidon Hash (poseidon-lite) ────────────────────────────────────────

export async function poseidonHash(inputs: bigint[]): Promise<bigint> {
  if (inputs.length === 1) return poseidon1(inputs);
  if (inputs.length === 2) return poseidon2(inputs);
  throw new Error(`poseidonHash: unsupported input count ${inputs.length}`);
}

// ─── IncrementalMerkleTree (poseidon-lite, mirrors MerkleTreeWithHistory.sol) ─

const MERKLE_LEVELS = 20;
const ZERO_VALUE = 6929077469078349753219590094154138880478450472643629583200794044453396342555n;

export class IncrementalMerkleTree {
  private levels: number;
  private zeros: bigint[];
  private leaves: bigint[] = [];

  constructor(levels: number = MERKLE_LEVELS) {
    this.levels = levels;
    this.zeros = new Array(levels + 1);
    this.zeros[0] = ZERO_VALUE;
    for (let i = 1; i <= levels; i++) {
      this.zeros[i] = poseidon2([this.zeros[i - 1]!, this.zeros[i - 1]!]);
    }
  }

  static async create(levels: number = MERKLE_LEVELS): Promise<IncrementalMerkleTree> {
    return new IncrementalMerkleTree(levels);
  }

  insert(leaf: bigint): void {
    this.leaves.push(leaf);
  }

  getProof(index: number): { pathElements: bigint[]; pathIndices: number[]; root: bigint } {
    if (index >= this.leaves.length) {
      throw new Error(`Index ${index} out of range (tree has ${this.leaves.length} leaves)`);
    }
    const { proofAtIndex } = this._simulate(index);
    if (!proofAtIndex) throw new Error('Proof capture failed');
    return proofAtIndex;
  }

  private _simulate(targetIndex: number): {
    finalRoot: bigint;
    proofAtIndex: { pathElements: bigint[]; pathIndices: number[]; root: bigint } | null;
  } {
    const filledSubtrees: bigint[] = [...this.zeros.slice(0, this.levels)];
    let lastRoot = this.zeros[this.levels]!;
    let proofAtIndex: { pathElements: bigint[]; pathIndices: number[]; root: bigint } | null = null;

    for (let idx = 0; idx < this.leaves.length; idx++) {
      let currentIndex = idx;
      let currentLevelHash = this.leaves[idx]!;

      const pathElements: bigint[] = [];
      const pathIndices: number[] = [];

      for (let level = 0; level < this.levels; level++) {
        const sibling = filledSubtrees[level]!;
        pathIndices.push(currentIndex & 1);
        pathElements.push(sibling);

        let left: bigint;
        let right: bigint;
        if (currentIndex % 2 === 0) {
          left = currentLevelHash;
          right = sibling;
          filledSubtrees[level] = currentLevelHash;
        } else {
          left = sibling;
          right = currentLevelHash;
        }
        currentLevelHash = poseidon2([left, right]);
        currentIndex = Math.floor(currentIndex / 2);
      }

      lastRoot = currentLevelHash;

      if (idx === targetIndex) {
        proofAtIndex = { pathElements, pathIndices, root: lastRoot };
      }
    }

    return { finalRoot: lastRoot, proofAtIndex };
  }
}

// ─── Proof Formatting ─────────────────────────────────────────────────────

export function formatProofForContract(proof: any): {
  pA: [bigint, bigint];
  pB: [[bigint, bigint], [bigint, bigint]];
  pC: [bigint, bigint];
} {
  return {
    pA: [BigInt(proof.pi_a[0]), BigInt(proof.pi_a[1])],
    pB: [
      [BigInt(proof.pi_b[0][1]), BigInt(proof.pi_b[0][0])],
      [BigInt(proof.pi_b[1][1]), BigInt(proof.pi_b[1][0])],
    ],
    pC: [BigInt(proof.pi_c[0]), BigInt(proof.pi_c[1])],
  };
}

// ─── Mark Note Spent ─────────────────────────────────────────────────────

export async function markNoteSpent(commitment: string, addressOrKey: string): Promise<void> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(
      { action: 'darkpool:markNoteSpent', address: addressOrKey, commitment },
      () => resolve()
    );
  });
}

// ─── RPC Helpers ─────────────────────────────────────────────────────────────

export const PRIMARY_RPC = 'https://ethereum.publicnode.com';
const RPC_FALLBACKS = [
  'https://ethereum.publicnode.com',
  'https://cloudflare-eth.com',
  'https://rpc.flashbots.net',
];

export async function rpcCall<T = unknown>(method: string, params: unknown[]): Promise<T> {
  let lastErr: Error = new Error('No RPC available');
  for (const url of RPC_FALLBACKS) {
    try {
      const resp = await chrome.runtime.sendMessage({ action: 'rpc:call', rpcUrl: url, method, params });
      const r = resp as { result?: T; error?: string };
      if (r.error) throw new Error(r.error);
      return r.result as T;
    } catch (e) { lastErr = e as Error; }
  }
  throw lastErr;
}

export function encodeBalanceOf(address: string): string {
  return '0x70a08231' + AbiCoder.defaultAbiCoder().encode(['address'], [address]).slice(2);
}

export function decodeUint256(hex: string): bigint {
  if (!hex || hex === '0x') return 0n;
  return BigInt(hex);
}

// ─── RPC Provider Config (for screens that need it) ──────────────────────────

export function createRpcClient() { return { call: rpcCall }; }
export function createProviderConfig() { return { urls: RPC_FALLBACKS }; }

// ─── Transaction Building ─────────────────────────────────────────────────────

export async function buildEthTransferEip1559(params: {
  from: string; to: string; value: bigint; nonce: number;
  maxFeePerGas: bigint; maxPriorityFeePerGas: bigint;
}): Promise<{ type: number; from: string; to: string; value: string; nonce: number; maxFeePerGas: string; maxPriorityFeePerGas: string; gasLimit: string; chainId: number }> {
  return {
    type: 2,
    from: params.from,
    to: params.to,
    value: '0x' + params.value.toString(16),
    nonce: params.nonce,
    maxFeePerGas: '0x' + params.maxFeePerGas.toString(16),
    maxPriorityFeePerGas: '0x' + params.maxPriorityFeePerGas.toString(16),
    gasLimit: '0x5208', // 21000
    chainId: 1,
  };
}

export async function signTransaction(tx: Record<string, unknown>, privateKey: string): Promise<string> {
  const wallet = new ethers.Wallet(privateKey);
  return wallet.signTransaction(tx as Parameters<typeof wallet.signTransaction>[0]);
}

// ─── Swap (re-export from wallet-core submodules directly) ───────────────────

export { getSwapTokens } from '../../../wallet-core/src/swap/swap-tokens.js';
export { fetchSwapQuote } from '../../../wallet-core/src/swap/uniswap-quotes.js';
export { buildSwapTransaction } from '../../../wallet-core/src/swap/swap-builder.js';
