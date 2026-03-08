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

export { DARKPOOL_TIERS, TIER_LABELS, DARK_POOL_ADDRESS, SAIKO_TOKEN_ADDRESS, DARK_POOL_STAKING_ADDRESS } from '../../../wallet-core/src/darkpool/constants.js';
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

export function formatDarkPoolFeeBreakdown(tierAmount: bigint): { fee: string; net: string; feePct: string } {
  const fee = tierAmount * FEE_BPS / 10000n;
  const net = tierAmount - fee;
  return {
    fee: formatUnits(fee, 18),
    net: formatUnits(net, 18),
    feePct: '0.5%',
  };
}

// ─── Note Storage (chrome.storage.local) ────────────────────────────────────

import type { DarkPoolNote } from '../../../wallet-core/src/darkpool/types.js';

function noteKey(address: string): string {
  return address.toLowerCase() + ':saiko-darkpool-notes-v1';
}

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
  };
}

export async function loadNotes(address: string): Promise<DarkPoolNote[]> {
  return new Promise((resolve) => {
    const key = noteKey(address);
    chrome.storage.local.get(key, (result) => {
      try {
        const raw = result[key] as unknown[] | undefined;
        resolve(raw ? raw.map(n => deserializeNote(n as Record<string, unknown>)) : []);
      } catch { resolve([]); }
    });
  });
}

export async function saveNote(address: string, note: DarkPoolNote): Promise<void> {
  const notes = await loadNotes(address);
  const existing = notes.findIndex(n => n.commitment === note.commitment);
  if (existing >= 0) notes[existing] = note; else notes.push(note);
  return new Promise((resolve) => {
    chrome.storage.local.set({ [noteKey(address)]: notes.map(serializeNote) }, resolve);
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
