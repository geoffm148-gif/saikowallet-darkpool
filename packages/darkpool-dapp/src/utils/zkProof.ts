/**
 * ZK Proof Generation — snarkjs Groth16 wrapper.
 *
 * Circuit files are served from /circuits/ in the public directory.
 * withdrawal.wasm + withdrawal_final.zkey must be copied there at build time.
 */

import { poseidonHash, bytesToBigInt } from './note';
import type { DarkPoolNote } from './note';

// IncrementalMerkleTree — mirrors MerkleTreeWithHistory.sol
const LEVELS = 20;
const ZERO_VALUE = 6929077469078349753219590094154138880478450472643629583200794044453396342555n;

let poseidonFn: any = null;
async function getPoseidon() {
  if (!poseidonFn) {
    const { buildPoseidon } = await import('circomlibjs');
    poseidonFn = await buildPoseidon();
  }
  return poseidonFn;
}

function poseidonDirect(p: any, a: bigint, b: bigint): bigint {
  return BigInt(p.F.toString(p([a, b])));
}

export interface MerkleProof {
  pathElements: bigint[];
  pathIndices: number[];
  root: bigint;
}

export async function buildMerkleProof(
  commitments: string[],  // all commitments in deposit order (hex)
  targetCommitment: string
): Promise<MerkleProof> {
  const p = await getPoseidon();

  // Precompute zero hashes
  const zeros: bigint[] = new Array(LEVELS + 1);
  zeros[0] = ZERO_VALUE;
  for (let i = 1; i <= LEVELS; i++) {
    zeros[i] = poseidonDirect(p, zeros[i - 1]!, zeros[i - 1]!);
  }

  const targetIdx = commitments.findIndex(c => c.toLowerCase() === targetCommitment.toLowerCase());
  if (targetIdx === -1) throw new Error('Commitment not found in deposit history');

  const filledSubtrees: bigint[] = [...zeros.slice(0, LEVELS)];
  let proofAtIndex: MerkleProof | null = null;

  for (let idx = 0; idx < commitments.length; idx++) {
    let currentIndex = idx;
    let currentHash = BigInt(commitments[idx]!);
    const pathElements: bigint[] = [];
    const pathIndices: number[] = [];

    for (let level = 0; level < LEVELS; level++) {
      const sibling = filledSubtrees[level]!;
      pathIndices.push(currentIndex & 1);
      pathElements.push(sibling);

      let left: bigint, right: bigint;
      if (currentIndex % 2 === 0) {
        left = currentHash;
        right = sibling;
        filledSubtrees[level] = currentHash;
      } else {
        left = sibling;
        right = currentHash;
      }
      currentHash = poseidonDirect(p, left, right);
      currentIndex = Math.floor(currentIndex / 2);
    }

    if (idx === targetIdx) {
      proofAtIndex = { pathElements, pathIndices, root: currentHash };
    }
  }

  if (!proofAtIndex) throw new Error('Failed to compute Merkle proof');
  return proofAtIndex;
}

export interface GrothProof {
  pA: [bigint, bigint];
  pB: [[bigint, bigint], [bigint, bigint]];
  pC: [bigint, bigint];
  root: bigint;
  nullifierHash: bigint;
}

export async function generateWithdrawalProof(
  note: DarkPoolNote,
  merkleProof: MerkleProof,
  recipient: string
): Promise<GrothProof> {
  const secretBig = bytesToBigInt(note.secret);
  const nullifierBig = bytesToBigInt(note.nullifier);
  const nullifierHash = await poseidonHash([nullifierBig]);
  const recipientBig = BigInt(recipient);

  const input = {
    secret: secretBig.toString(),
    nullifier: nullifierBig.toString(),
    pathElements: merkleProof.pathElements.map(x => x.toString()),
    pathIndices: merkleProof.pathIndices.map(x => x.toString()),
    root: merkleProof.root.toString(),
    nullifierHash: nullifierHash.toString(),
    recipient: recipientBig.toString(),
    amount: note.amount.toString(),
  };

  const snarkjs = await import('snarkjs');
  const wasmRes = await fetch('/circuits/withdrawal_js/withdrawal.wasm');
  const zkeyRes = await fetch('/circuits/withdrawal_final.zkey');

  if (!wasmRes.ok || !zkeyRes.ok) {
    throw new Error('Circuit files not found. Copy them to /public/circuits/');
  }

  const [wasmBuf, zkeyBuf] = await Promise.all([
    wasmRes.arrayBuffer(),
    zkeyRes.arrayBuffer(),
  ]);

  const { proof } = await (snarkjs as any).groth16.fullProve(
    input,
    new Uint8Array(wasmBuf),
    new Uint8Array(zkeyBuf)
  );

  return {
    pA: [BigInt(proof.pi_a[0]), BigInt(proof.pi_a[1])],
    pB: [
      [BigInt(proof.pi_b[0][1]), BigInt(proof.pi_b[0][0])],
      [BigInt(proof.pi_b[1][1]), BigInt(proof.pi_b[1][0])],
    ],
    pC: [BigInt(proof.pi_c[0]), BigInt(proof.pi_c[1])],
    root: merkleProof.root,
    nullifierHash,
  };
}
