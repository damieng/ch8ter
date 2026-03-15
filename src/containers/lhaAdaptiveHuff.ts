/**
 * Adaptive Huffman tree for LHA (LH1) decompression.
 * Faithful port of lhasa's lh1_decoder.c tree logic.
 */

const TREE_REORDER_LIMIT = 32768;

export class AdaptiveHuffTree {
  private readonly nCodes: number;
  private readonly nNodes: number;

  // Parallel arrays for node data (indexed by node_index)
  private readonly isLeaf: Uint8Array;
  private readonly childIndex: Uint16Array;
  private readonly parent: Uint16Array;
  private readonly freq: Uint16Array;
  private readonly group: Uint16Array;

  // Group management
  private readonly groups: Uint16Array;
  private numGroups: number;
  private readonly groupLeader: Uint16Array;

  // Leaf lookup: code -> node_index
  private readonly leafNodes: Uint16Array;

  constructor(nCodes: number) {
    this.nCodes = nCodes;
    this.nNodes = nCodes * 2 - 1;

    this.isLeaf = new Uint8Array(this.nNodes);
    this.childIndex = new Uint16Array(this.nNodes);
    this.parent = new Uint16Array(this.nNodes);
    this.freq = new Uint16Array(this.nNodes);
    this.group = new Uint16Array(this.nNodes);

    this.groups = new Uint16Array(this.nNodes);
    this.numGroups = 0;
    this.groupLeader = new Uint16Array(this.nNodes);

    this.leafNodes = new Uint16Array(nCodes);

    this.initGroups();
    this.initTree();
  }

  private allocGroup(): number {
    const result = this.groups[this.numGroups];
    ++this.numGroups;
    return result;
  }

  private freeGroup(g: number): void {
    --this.numGroups;
    this.groups[this.numGroups] = g;
  }

  private initGroups(): void {
    for (let i = 0; i < this.nNodes; ++i) {
      this.groups[i] = i;
    }
    this.numGroups = 0;
  }

  private initTree(): void {
    let nodeIndex = this.nNodes - 1;
    const leafGroup = this.allocGroup();

    for (let i = 0; i < this.nCodes; ++i) {
      this.isLeaf[nodeIndex] = 1;
      this.childIndex[nodeIndex] = i;
      this.freq[nodeIndex] = 1;
      this.group[nodeIndex] = leafGroup;
      this.groupLeader[leafGroup] = nodeIndex;
      this.leafNodes[i] = nodeIndex;
      --nodeIndex;
    }

    let child = this.nNodes - 1;

    while (nodeIndex >= 0) {
      this.isLeaf[nodeIndex] = 0;
      this.childIndex[nodeIndex] = child;
      this.parent[child] = nodeIndex;
      this.parent[child - 1] = nodeIndex;

      this.freq[nodeIndex] = this.freq[child] + this.freq[child - 1];

      if (this.freq[nodeIndex] === this.freq[nodeIndex + 1]) {
        this.group[nodeIndex] = this.group[nodeIndex + 1];
      } else {
        const g = this.allocGroup();
        this.group[nodeIndex] = g;
      }

      this.groupLeader[this.group[nodeIndex]] = nodeIndex;
      --nodeIndex;
      child -= 2;
    }
  }

  private makeGroupLeader(nodeIndex: number): number {
    const g = this.group[nodeIndex];
    const leaderIndex = this.groupLeader[g];

    if (leaderIndex === nodeIndex) {
      return nodeIndex;
    }

    // Swap leaf and childIndex between node and leader
    const tmpLeaf = this.isLeaf[leaderIndex];
    this.isLeaf[leaderIndex] = this.isLeaf[nodeIndex];
    this.isLeaf[nodeIndex] = tmpLeaf;

    const tmpChild = this.childIndex[leaderIndex];
    this.childIndex[leaderIndex] = this.childIndex[nodeIndex];
    this.childIndex[nodeIndex] = tmpChild;

    // Update back-references for node (which now has leader's old data)
    if (this.isLeaf[nodeIndex]) {
      this.leafNodes[this.childIndex[nodeIndex]] = nodeIndex;
    } else {
      this.parent[this.childIndex[nodeIndex]] = nodeIndex;
      this.parent[this.childIndex[nodeIndex] - 1] = nodeIndex;
    }

    // Update back-references for leader (which now has node's old data)
    if (this.isLeaf[leaderIndex]) {
      this.leafNodes[this.childIndex[leaderIndex]] = leaderIndex;
    } else {
      this.parent[this.childIndex[leaderIndex]] = leaderIndex;
      this.parent[this.childIndex[leaderIndex] - 1] = leaderIndex;
    }

    return leaderIndex;
  }

  private incrementNodeFreq(nodeIndex: number): void {
    ++this.freq[nodeIndex];

    if (
      nodeIndex < this.nNodes - 1 &&
      this.group[nodeIndex] === this.group[nodeIndex + 1]
    ) {
      ++this.groupLeader[this.group[nodeIndex]];

      if (this.freq[nodeIndex] === this.freq[nodeIndex - 1]) {
        this.group[nodeIndex] = this.group[nodeIndex - 1];
      } else {
        const g = this.allocGroup();
        this.group[nodeIndex] = g;
        this.groupLeader[g] = nodeIndex;
      }
    } else {
      if (this.freq[nodeIndex] === this.freq[nodeIndex - 1]) {
        this.freeGroup(this.group[nodeIndex]);
        this.group[nodeIndex] = this.group[nodeIndex - 1];
      }
    }
  }

  private reconstructTree(): void {
    // Phase 1: compact leaves to the front
    // Temp arrays for compacted leaves
    const tmpChildIndex = new Uint16Array(this.nCodes);
    const tmpFreq = new Uint16Array(this.nCodes);
    let tmpCount = 0;

    for (let i = 0; i < this.nNodes; ++i) {
      if (this.isLeaf[i]) {
        tmpChildIndex[tmpCount] = this.childIndex[i];
        tmpFreq[tmpCount] = (this.freq[i] + 1) >>> 1;
        ++tmpCount;
      }
    }

    // Copy compacted leaves into nodes[0..nCodes-1]
    for (let i = 0; i < tmpCount; ++i) {
      this.isLeaf[i] = 1;
      this.childIndex[i] = tmpChildIndex[i];
      this.freq[i] = tmpFreq[i];
    }

    // Phase 2: rebuild tree from back
    let leafPtr = this.nCodes - 1; // points into nodes[0..nCodes-1] (the compacted leaves)
    let child = this.nNodes - 1;
    let i = this.nNodes - 1;

    while (i >= 0) {
      // Copy leaves while child - i < 2
      while (child - i < 2) {
        // Copy leaf from compacted area to position i
        this.isLeaf[i] = 1;
        this.childIndex[i] = this.childIndex[leafPtr];
        this.freq[i] = this.freq[leafPtr];
        this.leafNodes[this.childIndex[leafPtr]] = i;
        --i;
        --leafPtr;
      }

      const f = this.freq[child] + this.freq[child - 1];

      // Copy leaves with freq <= f
      while (leafPtr >= 0 && f >= this.freq[leafPtr]) {
        this.isLeaf[i] = 1;
        this.childIndex[i] = this.childIndex[leafPtr];
        this.freq[i] = this.freq[leafPtr];
        this.leafNodes[this.childIndex[leafPtr]] = i;
        --i;
        --leafPtr;
      }

      // Create internal node
      this.isLeaf[i] = 0;
      this.freq[i] = f;
      this.childIndex[i] = child;
      this.parent[child] = i;
      this.parent[child - 1] = i;
      --i;
      child -= 2;
    }

    // Phase 3: rebuild groups
    this.initGroups();

    let g = this.allocGroup();
    this.group[0] = g;
    this.groupLeader[g] = 0;

    for (let j = 1; j < this.nNodes; ++j) {
      if (this.freq[j] === this.freq[j - 1]) {
        this.group[j] = this.group[j - 1];
      } else {
        g = this.allocGroup();
        this.group[j] = g;
        this.groupLeader[g] = j;
      }
    }
  }

  private incrementForCode(code: number): void {
    if (this.freq[0] >= TREE_REORDER_LIMIT) {
      this.reconstructTree();
    }

    ++this.freq[0];

    let nodeIndex = this.leafNodes[code];

    while (nodeIndex !== 0) {
      nodeIndex = this.makeGroupLeader(nodeIndex);
      this.incrementNodeFreq(nodeIndex);
      nodeIndex = this.parent[nodeIndex];
    }
  }

  decodeSymbol(readBit: () => number): number {
    let nodeIndex = 0; // start at root

    while (!this.isLeaf[nodeIndex]) {
      const bit = readBit();
      nodeIndex = this.childIndex[nodeIndex] - bit;
    }

    const result = this.childIndex[nodeIndex];
    this.incrementForCode(result);
    return result;
  }
}
