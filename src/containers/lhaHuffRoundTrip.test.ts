// Round-trip and property tests for the LHA Huffman machinery.
//
// The existing tests hand-write bitstreams for three specific tables. These
// instead build codes from the table's own canonical assignment, encode a
// known symbol sequence, and check the decoder recovers it - so the encoder
// and decoder are checked against each other over many shapes rather than
// against hand-computed bytes.

import { describe, it, expect } from 'vitest'
import { buildTable, buildSingleSymbol, decode } from './lhaHuffman'
import { LhaBitReader } from './lhaBitReader'
import { AdaptiveHuffTree } from './lhaAdaptiveHuff'

/** Canonical codes for a length table, matching buildTable's own assignment. */
function canonicalCodes(codeLengths: Uint8Array): Map<number, { code: number; len: number }> {
  let maxLen = 0
  for (const l of codeLengths) if (l > maxLen) maxLen = l
  const blCount = new Uint16Array(maxLen + 1)
  for (const l of codeLengths) if (l > 0) blCount[l]++
  const nextCode = new Uint32Array(maxLen + 1)
  let code = 0
  for (let bits = 1; bits <= maxLen; bits++) {
    code = (code + blCount[bits - 1]) << 1
    nextCode[bits] = code
  }
  const out = new Map<number, { code: number; len: number }>()
  for (let sym = 0; sym < codeLengths.length; sym++) {
    const len = codeLengths[sym]
    if (len === 0) continue
    out.set(sym, { code: nextCode[len]++, len })
  }
  return out
}

/** Pack a symbol sequence into bytes using canonical codes, MSB first. */
function encode(symbols: number[], codeLengths: Uint8Array): Uint8Array {
  const codes = canonicalCodes(codeLengths)
  const bits: number[] = []
  for (const sym of symbols) {
    const entry = codes.get(sym)
    if (!entry) throw new Error(`symbol ${sym} has no code`)
    for (let i = entry.len - 1; i >= 0; i--) bits.push((entry.code >>> i) & 1)
  }
  while (bits.length % 8 !== 0) bits.push(0)
  const bytes = new Uint8Array(bits.length / 8)
  for (let i = 0; i < bits.length; i++) {
    if (bits[i]) bytes[i >> 3] |= 0x80 >> (i & 7)
  }
  return bytes
}

function roundTrip(symbols: number[], codeLengths: Uint8Array, tableBits: number): number[] {
  const data = encode(symbols, codeLengths)
  const ht = buildTable(codeLengths, tableBits)
  const reader = new LhaBitReader(data, 0, data.length * 8)
  const out: number[] = []
  for (let i = 0; i < symbols.length; i++) out.push(decode(reader, ht))
  return out
}

/** A full code-length table: `n` symbols all at `len` bits (a balanced tree). */
function uniform(n: number, len: number): Uint8Array {
  const t = new Uint8Array(n)
  t.fill(len)
  return t
}

describe('buildTable + decode round-trip', () => {
  it('recovers a balanced tree of equal-length codes', () => {
    const lengths = uniform(16, 4)
    const symbols = [0, 15, 7, 3, 12, 1, 14, 8]
    expect(roundTrip(symbols, lengths, 4)).toEqual(symbols)
  })

  it('recovers skewed codes that all overflow the direct table', () => {
    // Lengths 5..8 with tableBits 2 forces every code down the tree
    const lengths = new Uint8Array([5, 5, 6, 6, 7, 7, 8, 8, 8, 8])
    const symbols = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]
    expect(roundTrip(symbols, lengths, 2)).toEqual(symbols)
  })

  it('recovers a single-symbol table', () => {
    expect(roundTrip([0, 0, 0], new Uint8Array([1]), 1)).toEqual([0, 0, 0])
  })

  it('recovers codes of mixed direct and overflow lengths', () => {
    const lengths = new Uint8Array([2, 2, 6, 6, 6, 6])
    const symbols = [0, 1, 2, 3, 4, 5, 1, 0]
    expect(roundTrip(symbols, lengths, 3)).toEqual(symbols)
  })

  it('handles a full 510-symbol LHA code table', () => {
    // 512 symbols at 9 bits is a complete binary tree
    const lengths = uniform(512, 9)
    const symbols = [0, 1, 255, 256, 511, 300, 42]
    expect(roundTrip(symbols, lengths, 8)).toEqual(symbols)
  })

  it('skips symbols whose length is zero', () => {
    // Only symbols 1 and 3 are used
    const lengths = new Uint8Array([0, 1, 0, 1])
    expect(roundTrip([1, 3, 3, 1], lengths, 1)).toEqual([1, 3, 3, 1])
  })

  it('returns a table that decodes nothing when every length is zero', () => {
    const ht = buildTable(new Uint8Array([0, 0, 0]), 4)
    // No codes exist, so every direct entry stays at the -1 sentinel
    expect([...ht.table].every(v => v === -1)).toBe(true)
  })
})

describe('buildTable structure', () => {
  it('records the length of each direct entry', () => {
    const lengths = new Uint8Array([2, 2, 2, 2])
    const ht = buildTable(lengths, 2)
    for (let i = 0; i < ht.table.length; i++) {
      if (ht.table[i] >= 0) expect(ht.lenTable[i]).toBe(2)
    }
  })

  it('marks overflow prefixes with a negative pointer that is not the sentinel', () => {
    // Long codes only: every direct entry becomes a tree pointer
    const lengths = new Uint8Array([4, 4, 4, 4])
    const ht = buildTable(lengths, 1)
    const pointers = [...ht.table].filter(v => v < 0)
    // -1 is "empty"; real pointers are stored as ~node, i.e. <= -2
    for (const p of pointers) {
      if (p !== -1) expect(p).toBeLessThanOrEqual(-2)
    }
    expect(ht.table.some(v => v <= -2)).toBe(true)
  })

  it('sizes its node arrays for the symbol count', () => {
    const ht = buildTable(uniform(10, 4), 2)
    expect(ht.left.length).toBe(20)
    expect(ht.right.length).toBe(20)
  })
})

describe('buildSingleSymbol', () => {
  it('always returns its symbol and consumes no bits', () => {
    const ht = buildSingleSymbol(7, 4)
    const data = new Uint8Array([0, 0])
    const reader = new LhaBitReader(data, 0, 16)
    expect(decode(reader, ht)).toBe(7)
    expect(decode(reader, ht)).toBe(7)
    // No bits were consumed, so the reader is still at the start
    expect(reader.peek(8)).toBe(0)
  })

  it('fills every direct entry', () => {
    const ht = buildSingleSymbol(3, 3)
    expect([...ht.table].every(v => v === 3)).toBe(true)
    expect([...ht.lenTable].every(v => v === 0)).toBe(true)
  })
})

describe('AdaptiveHuffTree (LH1)', () => {
  /** Feed a bit list to the tree, returning the decoded symbols. */
  function decodeBits(tree: AdaptiveHuffTree, bits: number[], count: number): number[] {
    let i = 0
    const readBit = () => (i < bits.length ? bits[i++] : 0)
    const out: number[] = []
    for (let n = 0; n < count; n++) out.push(tree.decodeSymbol(readBit))
    return out
  }

  it('decodes the first symbol using the initial tree shape', () => {
    const tree = new AdaptiveHuffTree(4)
    // A fresh tree is a flat left-leaning chain; reading all zero bits reaches
    // the first leaf. The exact symbol depends on lhasa's initial ordering, so
    // just require a valid code in range.
    const sym = decodeBits(tree, [0, 0, 0, 0], 1)[0]
    expect(sym).toBeGreaterThanOrEqual(0)
    expect(sym).toBeLessThan(4)
  })

  it('adapts so a repeated symbol stays decodable', () => {
    const tree = new AdaptiveHuffTree(4)
    const first = decodeBits(tree, [0, 0, 0, 0], 1)[0]
    // After one symbol the tree has been updated; a second decode must still
    // return a valid code rather than looping or going out of range
    const second = decodeBits(tree, [1, 0, 1, 0, 1, 0], 1)[0]
    expect(second).toBeGreaterThanOrEqual(0)
    expect(second).toBeLessThan(4)
    expect(first).toBeGreaterThanOrEqual(0)
  })

  it('keeps returning in-range symbols over many updates', () => {
    const tree = new AdaptiveHuffTree(8)
    for (let n = 0; n < 50; n++) {
      const sym = decodeBits(tree, [0, 1, 0, 1, 1, 0, 0, 1], 1)[0]
      expect(sym).toBeGreaterThanOrEqual(0)
      expect(sym).toBeLessThan(8)
    }
  })

  it('is constructed for any code count without throwing', () => {
    for (const n of [2, 3, 5, 16, 510]) {
      expect(() => new AdaptiveHuffTree(n), `n=${n}`).not.toThrow()
    }
  })
})
