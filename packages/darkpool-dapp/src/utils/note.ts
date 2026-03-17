/**
 * DarkPool Note — encode/decode and generation.
 *
 * Note format: saiko-dp-v4-<128-hex-chars>-<leaf_index>-<tier_index>
 * Where the 128 hex chars = 32 bytes secret + 32 bytes nullifier
 */

import { DARKPOOL_TIERS, TIER_AMOUNTS_WEI } from '../constants';

export interface DarkPoolNote {
  secret: Uint8Array;       // 32 bytes
  nullifier: Uint8Array;    // 32 bytes
  commitment: string;       // hex bytes32 - poseidon(secret, nullifier)
  nullifierHash: string;    // hex bytes32 - poseidon(nullifier)
  amount: bigint;           // tier amount in wei
  tierIndex: number;        // 0-3
  leafIndex: number;        // position in Merkle tree (set after deposit tx)
}

// ── Poseidon ──────────────────────────────────────────────────────────────────

let poseidonFn: any = null;

async function getPoseidon() {
  if (!poseidonFn) {
    const { buildPoseidon } = await import('circomlibjs');
    poseidonFn = await buildPoseidon();
  }
  return poseidonFn;
}

export async function poseidonHash(inputs: bigint[]): Promise<bigint> {
  const p = await getPoseidon();
  const result = p(inputs);
  return BigInt(p.F.toString(result));
}

// ── Generation ────────────────────────────────────────────────────────────────

export function randomBytes32(): Uint8Array {
  const buf = new Uint8Array(32);
  crypto.getRandomValues(buf);
  return buf;
}

export function bytesToBigInt(bytes: Uint8Array): bigint {
  let result = 0n;
  for (const b of bytes) result = (result << 8n) | BigInt(b);
  return result;
}

function bigIntToHex32(n: bigint): string {
  return '0x' + n.toString(16).padStart(64, '0');
}

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

export function hexToBytes(hex: string): Uint8Array {
  const clean = hex.replace(/^0x/, '');
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

export async function generateNote(tierIndex: number): Promise<DarkPoolNote> {
  const secret = randomBytes32();
  const nullifier = randomBytes32();
  const secretBig = bytesToBigInt(secret);
  const nullifierBig = bytesToBigInt(nullifier);

  const commitment = bigIntToHex32(await poseidonHash([secretBig, nullifierBig]));
  const nullifierHash = bigIntToHex32(await poseidonHash([nullifierBig]));

  return {
    secret,
    nullifier,
    commitment,
    nullifierHash,
    amount: TIER_AMOUNTS_WEI[tierIndex]!,
    tierIndex,
    leafIndex: -1, // set after deposit tx mined
  };
}

// ── Encode / Decode ───────────────────────────────────────────────────────────

export function encodeNote(note: DarkPoolNote): string {
  const secretHex = bytesToHex(note.secret);
  const nullifierHex = bytesToHex(note.nullifier);
  return `saiko-dp-v4-${secretHex}${nullifierHex}-${note.leafIndex}-${note.tierIndex}`;
}

export async function decodeNote(noteStr: string): Promise<DarkPoolNote> {
  const trimmed = noteStr.trim();
  if (!trimmed.startsWith('saiko-dp-v4-')) {
    throw new Error('Invalid note format');
  }
  const rest = trimmed.slice('saiko-dp-v4-'.length);
  const parts = rest.split('-');
  if (parts.length < 3) throw new Error('Invalid note: missing fields');

  const hex128 = parts[0]!;
  if (hex128.length !== 128) throw new Error('Invalid note: bad secret/nullifier length');

  const secretHex = hex128.slice(0, 64);
  const nullifierHex = hex128.slice(64, 128);
  const leafIndex = parseInt(parts[1]!, 10);
  const tierIndex = parseInt(parts[2]!, 10);

  if (isNaN(leafIndex) || isNaN(tierIndex) || tierIndex < 0 || tierIndex > 3) {
    throw new Error('Invalid note: bad tier or leaf index');
  }

  const secret = hexToBytes(secretHex);
  const nullifier = hexToBytes(nullifierHex);
  const secretBig = bytesToBigInt(secret);
  const nullifierBig = bytesToBigInt(nullifier);

  const commitment = bigIntToHex32(await poseidonHash([secretBig, nullifierBig]));
  const nullifierHash = bigIntToHex32(await poseidonHash([nullifierBig]));

  return {
    secret,
    nullifier,
    commitment,
    nullifierHash,
    amount: TIER_AMOUNTS_WEI[tierIndex]!,
    tierIndex,
    leafIndex,
  };
}

// ── Format ────────────────────────────────────────────────────────────────────

export function formatSaiko(wei: bigint): string {
  const whole = wei / 10n ** 18n;
  if (whole >= 1_000_000_000n) return `${(Number(whole) / 1e9).toFixed(1)}B`;
  if (whole >= 1_000_000n) return `${(Number(whole) / 1e6).toFixed(0)}M`;
  return whole.toLocaleString();
}
