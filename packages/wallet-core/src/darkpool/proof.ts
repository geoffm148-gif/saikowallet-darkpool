/**
 * Saiko DarkPool — ZK Proof Generation
 *
 * Uses snarkjs in the renderer process with circuit files served via the
 * saiko-app:// custom Electron protocol (no native modules required).
 *
 * In Node.js / test context: loads circuit files directly from disk.
 */

import type { DarkPoolNote, ComplianceProof } from './types.js';

/** Base URL for circuit files — saiko-app:// in Electron, file path in Node */
function circuitsBaseUrl(): string {
  if (typeof window !== 'undefined') {
    return 'saiko-app://circuits';
  }
  // Node.js / test: use file path relative to this module
  return '';
}

export async function generateWithdrawalProof(params: {
  secret: bigint;
  nullifier: bigint;
  pathElements: bigint[];
  pathIndices: number[];
  root: bigint;
  nullifierHash: bigint;
  recipient: bigint;
  amount: bigint;
}): Promise<{ proof: any; publicSignals: string[]; commitment: string }> {
  const input = {
    secret: params.secret.toString(),
    nullifier: params.nullifier.toString(),
    pathElements: params.pathElements.map(x => x.toString()),
    pathIndices: params.pathIndices.map(x => x.toString()),
    root: params.root.toString(),
    nullifierHash: params.nullifierHash.toString(),
    recipient: params.recipient.toString(),
    amount: params.amount.toString(),
  };

  const snarkjs = await import('snarkjs');
  const base = circuitsBaseUrl();

  if (typeof window !== 'undefined') {
    // Electron renderer: fetch circuit files via saiko-app:// protocol
    const wasmUrl = `${base}/withdrawal_js/withdrawal.wasm`;
    const zkeyUrl = `${base}/withdrawal_final.zkey`;

    const [wasmBuf, zkeyBuf] = await Promise.all([
      fetch(wasmUrl).then(r => r.arrayBuffer()),
      fetch(zkeyUrl).then(r => r.arrayBuffer()),
    ]);

    const { proof, publicSignals } = await (snarkjs as any).groth16.fullProve(
      input,
      new Uint8Array(wasmBuf),
      new Uint8Array(zkeyBuf),
    );
    return { proof, publicSignals, commitment: publicSignals[4] };
  }

  // Node.js / test context
  const path = await import('path');
  const { fileURLToPath } = await import('url');
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const circuitsDir = path.join(__dirname, 'circuits');
  const wasmPath = path.join(circuitsDir, 'withdrawal_js', 'withdrawal.wasm');
  const zkeyPath = path.join(circuitsDir, 'withdrawal_final.zkey');
  const result = await (snarkjs as any).groth16.fullProve(input, wasmPath, zkeyPath);
  return { ...result, commitment: result.publicSignals[4] };
}

export async function verifyWithdrawalProof(
  proof: any,
  publicSignals: string[]
): Promise<boolean> {
  const snarkjs = await import('snarkjs');
  const base = circuitsBaseUrl();

  let vk: any;
  if (typeof window !== 'undefined') {
    const res = await fetch(`${base}/verification_key.json`);
    vk = await res.json();
  } else {
    const path = await import('path');
    const fs = await import('fs');
    const { fileURLToPath } = await import('url');
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    vk = JSON.parse(fs.readFileSync(path.join(__dirname, 'circuits', 'verification_key.json'), 'utf8'));
  }

  return (snarkjs as any).groth16.verify(vk, publicSignals, proof);
}

export async function generateComplianceProof(
  note: DarkPoolNote,
  proofType: 'ownership' | 'link' | 'source' | 'innocence',
  withdrawalTxHash?: string,
): Promise<ComplianceProof> {
  return {
    type: proofType,
    depositTxHash: note.txHash,
    withdrawalTxHash,
    proof: JSON.stringify({ commitment: note.commitment, type: proofType }),
    generatedAt: Date.now(),
  };
}

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
