/**
 * Canonical Huffman table construction and decoding for LHA.
 *
 * Direct-lookup table of 2^tableBits entries for fast decode.
 * Codes longer than tableBits use an overflow binary tree.
 */

import { LhaBitReader } from './lhaBitReader'

export interface HuffTable {
  /** Direct lookup: symbol for codes <= tableBits */
  table: Int16Array
  /** Bits to consume for each direct-lookup entry */
  lenTable: Uint8Array
  /** Overflow tree: left child (symbol if >=0, or ~nodeIndex if <0) */
  left: Int16Array
  /** Overflow tree: right child */
  right: Int16Array
  tableBits: number
}

/**
 * Build canonical Huffman decode table from code lengths.
 * codeLengths[i] = bit length for symbol i (0 = unused).
 */
export function buildTable(codeLengths: Uint8Array, tableBits: number): HuffTable {
  const nSymbols = codeLengths.length
  const tableSize = 1 << tableBits
  const table = new Int16Array(tableSize).fill(-1)
  const lenTable = new Uint8Array(tableSize)
  const left = new Int16Array(nSymbols * 2)
  const right = new Int16Array(nSymbols * 2)
  let nextNode = 1  // start at 1: ~0 === -1 collides with the empty sentinel

  // Find max code length
  let maxLen = 0
  for (let i = 0; i < nSymbols; i++) {
    if (codeLengths[i] > maxLen) maxLen = codeLengths[i]
  }
  if (maxLen === 0) return { table, lenTable, left, right, tableBits }

  // Compute canonical codes
  const blCount = new Uint16Array(maxLen + 1)
  for (let i = 0; i < nSymbols; i++) {
    if (codeLengths[i] > 0) blCount[codeLengths[i]]++
  }

  const nextCode = new Uint32Array(maxLen + 1)
  let code = 0
  for (let bits = 1; bits <= maxLen; bits++) {
    code = (code + blCount[bits - 1]) << 1
    nextCode[bits] = code
  }

  // Assign codes and fill tables
  for (let sym = 0; sym < nSymbols; sym++) {
    const len = codeLengths[sym]
    if (len === 0) continue
    const c = nextCode[len]++

    if (len <= tableBits) {
      // Fill 2^(tableBits - len) consecutive entries
      const shift = tableBits - len
      const base = c << shift
      const fill = 1 << shift
      for (let j = 0; j < fill; j++) {
        table[base + j] = sym
        lenTable[base + j] = len
      }
    } else {
      // Overflow: insert into tree hanging off a table entry
      const prefix = c >>> (len - tableBits)
      // Ensure a tree root exists at table[prefix]
      if (table[prefix] === -1) {
        const node = nextNode++
        table[prefix] = ~node  // bitwise NOT to mark as tree pointer
        lenTable[prefix] = 0
        left[node] = -1
        right[node] = -1
      }

      // Walk bits [len-tableBits-1 .. 0] to place the symbol
      let node = ~table[prefix]
      for (let bit = len - tableBits - 1; bit >= 0; bit--) {
        const b = (c >>> bit) & 1
        const arr = b === 0 ? left : right
        if (bit === 0) {
          // Leaf
          arr[node] = sym
        } else if (arr[node] < 0) {
          // Follow existing internal node
          node = ~arr[node]
        } else {
          // Create new internal node
          const nn = nextNode++
          arr[node] = ~nn
          left[nn] = -1
          right[nn] = -1
          node = nn
        }
      }
    }
  }

  return { table, lenTable, left, right, tableBits }
}

/** Decode one symbol from the bitstream using a Huffman table */
export function decode(reader: LhaBitReader, ht: HuffTable): number {
  const idx = reader.peek(ht.tableBits)
  const val = ht.table[idx]

  if (val >= 0) {
    // Direct hit
    reader.skip(ht.lenTable[idx])
    return val
  }

  // Overflow tree walk
  reader.skip(ht.tableBits)
  let node = ~val
  while (true) {
    const bit = reader.read(1)
    const next = bit === 0 ? ht.left[node] : ht.right[node]
    if (next >= 0) return next       // leaf: symbol value
    node = ~next                      // internal node
  }
}

/** Create a trivial table that always returns the same symbol */
export function buildSingleSymbol(symbol: number, tableBits: number): HuffTable {
  const tableSize = 1 << tableBits
  const table = new Int16Array(tableSize).fill(symbol)
  const lenTable = new Uint8Array(tableSize) // all 0 = consume 0 bits
  return { table, lenTable, left: new Int16Array(0), right: new Int16Array(0), tableBits }
}
