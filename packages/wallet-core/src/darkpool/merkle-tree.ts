/**
 * IncrementalMerkleTree — exact TypeScript port of MerkleTreeWithHistory.sol
 *
 * Tornado Cash incremental tree: filledSubtrees[k] stores the last "left child"
 * hash seen at level k. The root after N insertions does NOT equal a naive
 * static Merkle tree with N leaves + zero padding.
 *
 * For proof generation: pathElements are the filledSubtrees values AT THE TIME
 * our leaf was inserted, paired with the root from that same insertion.
 * That root is stored in the contract's ROOT_HISTORY (last 30 roots).
 */

const LEVELS = 20;

const ZERO_VALUE = 6929077469078349753219590094154138880478450472643629583200794044453396342555n;
const FIELD_SIZE = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;

export class IncrementalMerkleTree {
  private levels: number;
  private poseidon: any;
  private F: any;
  private zeros: bigint[];
  private leaves: bigint[] = [];

  private constructor(poseidon: any, levels: number) {
    this.levels = levels;
    this.poseidon = poseidon;
    this.F = poseidon.F;

    this.zeros = new Array(levels + 1);
    this.zeros[0] = ZERO_VALUE;
    for (let i = 1; i <= levels; i++) {
      this.zeros[i] = this.hash(this.zeros[i - 1]!, this.zeros[i - 1]!);
    }
  }

  static async create(levels: number = LEVELS): Promise<IncrementalMerkleTree> {
    const { buildPoseidon } = await import('circomlibjs');
    const poseidon = await buildPoseidon();
    return new IncrementalMerkleTree(poseidon, levels);
  }

  private hash(left: bigint, right: bigint): bigint {
    const result = BigInt(this.F.toString(this.poseidon([left, right])));
    if (result >= FIELD_SIZE) throw new Error('Hash overflow');
    return result;
  }

  insert(leaf: bigint): void {
    this.leaves.push(leaf);
  }

  /** Final root after all insertions (matches getLastRoot() on-chain). */
  getRoot(): bigint {
    const { finalRoot } = this._simulate(null);
    return finalRoot;
  }

  /**
   * Get Merkle proof for leaf at `index`.
   *
   * Proof is against the ROOT that was stored when THAT LEAF was inserted.
   * The contract keeps the last 30 roots — valid as long as < 30 deposits
   * have been made since ours.
   *
   * pathElements = filledSubtrees siblings used during that insertion.
   * pathIndices  = left(0)/right(1) at each level.
   * root         = the on-chain root stored after that insertion.
   */
  getProof(index: number): { pathElements: bigint[]; pathIndices: number[]; root: bigint } {
    if (index >= this.leaves.length) {
      throw new Error(`Index ${index} out of range (tree has ${this.leaves.length} leaves)`);
    }
    const { proofAtIndex } = this._simulate(index);
    if (!proofAtIndex) throw new Error('Proof capture failed');
    return proofAtIndex;
  }

  /**
   * Core simulation: mirrors Solidity _insert() for every leaf.
   * Captures proof at targetIndex if provided.
   */
  private _simulate(targetIndex: number | null): {
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
        // filledSubtrees[level] is always the sibling for this node
        const sibling = filledSubtrees[level]!;
        pathIndices.push(currentIndex & 1);
        pathElements.push(sibling);

        let left: bigint;
        let right: bigint;
        if (currentIndex % 2 === 0) {
          // This node is the LEFT child; sibling is right
          left = currentLevelHash;
          right = sibling;
          // Update: this node is now the "last left" at this level
          filledSubtrees[level] = currentLevelHash;
        } else {
          // This node is the RIGHT child; sibling is left
          left = sibling;
          right = currentLevelHash;
        }
        currentLevelHash = this.hash(left, right);
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
