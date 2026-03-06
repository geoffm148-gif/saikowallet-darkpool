// circomlibjs loaded dynamically to avoid bundling Node.js deps in browser build

const LEVELS = 20;

export class IncrementalMerkleTree {
  private levels: number;
  private poseidon: any;
  private F: any;
  private zeros: bigint[];
  private filledSubtrees: bigint[];
  private leaves: bigint[] = [];
  private nextIndex = 0;

  private constructor(poseidon: any, levels: number) {
    this.levels = levels;
    this.poseidon = poseidon;
    this.F = poseidon.F;

    this.zeros = new Array(levels + 1);
    this.zeros[0] = BigInt(this.F.toString(this.poseidon([0])));

    for (let i = 1; i <= levels; i++) {
      this.zeros[i] = this.hash(this.zeros[i - 1]!, this.zeros[i - 1]!);
    }

    this.filledSubtrees = new Array(levels);
    for (let i = 0; i < levels; i++) {
      this.filledSubtrees[i] = this.zeros[i]!;
    }
  }

  static async create(levels: number = LEVELS): Promise<IncrementalMerkleTree> {
    const { buildPoseidon } = await import('circomlibjs');
    const poseidon = await buildPoseidon();
    return new IncrementalMerkleTree(poseidon, levels);
  }

  private hash(left: bigint, right: bigint): bigint {
    return BigInt(this.F.toString(this.poseidon([left, right])));
  }

  insert(leaf: bigint): void {
    let currentIndex = this.nextIndex;
    let currentLevelHash = leaf;

    for (let i = 0; i < this.levels; i++) {
      if (currentIndex % 2 === 0) {
        this.filledSubtrees[i] = currentLevelHash;
        currentLevelHash = this.hash(currentLevelHash, this.zeros[i]!);
      } else {
        currentLevelHash = this.hash(this.filledSubtrees[i]!, currentLevelHash);
      }
      currentIndex = Math.floor(currentIndex / 2);
    }

    this.leaves.push(leaf);
    this.nextIndex++;
  }

  getRoot(): bigint {
    if (this.nextIndex === 0) {
      return this.zeros[this.levels]!;
    }
    let currentIndex = this.nextIndex - 1;
    let currentLevelHash = this.leaves[currentIndex]!;

    // Recompute from last inserted leaf
    // Actually, we need to compute root from the filled subtrees
    let root = this.filledSubtrees[0]!;
    let idx = this.nextIndex - 1;
    for (let i = 0; i < this.levels; i++) {
      if (idx % 2 === 0) {
        root = this.hash(this.filledSubtrees[i]!, this.zeros[i]!);
      } else {
        root = this.hash(this.filledSubtrees[i]!, root);
      }
      idx = Math.floor(idx / 2);
    }

    // Correct approach: rebuild from all leaves
    return this.computeRoot();
  }

  private computeRoot(): bigint {
    if (this.nextIndex === 0) return this.zeros[this.levels]!;

    let layer = [...this.leaves];
    const totalLeaves = 1 << this.levels;

    // Pad with zeros
    while (layer.length < totalLeaves) {
      layer.push(this.zeros[0]!);
    }

    for (let level = 0; level < this.levels; level++) {
      const nextLayer: bigint[] = [];
      for (let i = 0; i < layer.length; i += 2) {
        nextLayer.push(this.hash(layer[i]!, layer[i + 1]!));
      }
      layer = nextLayer;
    }

    return layer[0]!;
  }

  getProof(index: number): { pathElements: bigint[]; pathIndices: number[]; root: bigint } {
    if (index >= this.nextIndex) {
      throw new Error(`Index ${index} out of range (${this.nextIndex} leaves)`);
    }

    const pathElements: bigint[] = [];
    const pathIndices: number[] = [];

    let layer = [...this.leaves];
    const totalLeaves = 1 << this.levels;
    while (layer.length < totalLeaves) {
      layer.push(this.zeros[0]!);
    }

    let currentIndex = index;
    for (let level = 0; level < this.levels; level++) {
      const siblingIndex = currentIndex % 2 === 0 ? currentIndex + 1 : currentIndex - 1;
      pathElements.push(layer[siblingIndex]!);
      pathIndices.push(currentIndex % 2);

      const nextLayer: bigint[] = [];
      for (let i = 0; i < layer.length; i += 2) {
        nextLayer.push(this.hash(layer[i]!, layer[i + 1]!));
      }
      layer = nextLayer;
      currentIndex = Math.floor(currentIndex / 2);
    }

    return { pathElements, pathIndices, root: layer[0]! };
  }
}
