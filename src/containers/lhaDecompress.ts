/**
 * LHA decompression routines.
 * Supports: -lh0- (store), -lh4-/-lh5-/-lh6-/-lh7- (LZSS + static Huffman),
 *           -lh1- (LZSS + dynamic Huffman), -lzs-, -lz5- (LZSS only)
 */

import { LhaBitReader } from './lhaBitReader'
import { buildTable, buildSingleSymbol, decode, type HuffTable } from './lhaHuffman'
import { AdaptiveHuffTree } from './lhaAdaptiveHuff'

const THRESHOLD = 3
const NC = 510
const NT = 19
const TBIT = 5
const CBIT = 9

interface MethodParams {
  dicbit: number
  np: number
  pbit: number
}

const METHOD_PARAMS: Record<string, MethodParams> = {
  '-lh4-': { dicbit: 12, np: 14, pbit: 4 },
  '-lh5-': { dicbit: 13, np: 14, pbit: 4 },
  '-lh6-': { dicbit: 15, np: 16, pbit: 5 },
  '-lh7-': { dicbit: 16, np: 17, pbit: 5 },
}

/** Decompress an LHA entry. Returns uncompressed data. */
export function decompress(
  method: string,
  data: Uint8Array,
  offset: number,
  compSize: number,
  uncompSize: number,
): Uint8Array {
  if (method === '-lh0-' || method === '-lz4-') {
    return data.slice(offset, offset + uncompSize)
  }
  if (method === '-lhd-') {
    return new Uint8Array(0)
  }
  const params = METHOD_PARAMS[method]
  if (params) {
    return decompressLhNew(data, offset, compSize, uncompSize, params)
  }
  if (method === '-lh1-') {
    return decompressLh1(data, offset, compSize, uncompSize)
  }
  if (method === '-lzs-') {
    return decompressLzs(data, offset, compSize, uncompSize)
  }
  if (method === '-lz5-') {
    return decompressLz5(data, offset, compSize, uncompSize)
  }
  throw new Error(`Unsupported LHA method: ${method}`)
}

// ─── LH4/5/6/7: LZSS + block-based static Huffman ──────────

function decompressLhNew(
  data: Uint8Array, offset: number, compSize: number, uncompSize: number, params: MethodParams,
): Uint8Array {
  const { dicbit, np, pbit } = params
  const dicSize = 1 << dicbit
  const dicMask = dicSize - 1
  const reader = new LhaBitReader(data, offset, compSize)
  const output = new Uint8Array(uncompSize)
  const dic = new Uint8Array(dicSize)
  let dicPos = 0
  let outPos = 0
  let blockRemaining = 0
  let codeTable!: HuffTable
  let offTable!: HuffTable

  while (outPos < uncompSize) {
    if (blockRemaining === 0) {
      blockRemaining = reader.read(16)
      if (blockRemaining === 0) blockRemaining = 0x10000
      const tempTable = readTempTree(reader)
      codeTable = readCodeTable(reader, tempTable)
      offTable = readOffsetTree(reader, np, pbit)
    }

    blockRemaining--
    const sym = decode(reader, codeTable)

    if (sym < 256) {
      output[outPos++] = sym
      dic[dicPos] = sym
      dicPos = (dicPos + 1) & dicMask
    } else {
      const length = sym - 256 + THRESHOLD
      const offSym = decode(reader, offTable)
      let distance: number
      if (offSym <= 1) {
        distance = offSym
      } else {
        distance = ((1 << (offSym - 1)) | reader.read(offSym - 1)) >>> 0
      }
      let srcPos = (dicPos - distance - 1) & dicMask
      for (let i = 0; i < length && outPos < uncompSize; i++) {
        const byte = dic[srcPos]
        output[outPos++] = byte
        dic[dicPos] = byte
        dicPos = (dicPos + 1) & dicMask
        srcPos = (srcPos + 1) & dicMask
      }
    }
  }

  return output
}

function readTempTree(reader: LhaBitReader): HuffTable {
  const n = reader.read(TBIT)
  if (n === 0) {
    return buildSingleSymbol(reader.read(TBIT), 8)
  }
  const lengths = new Uint8Array(NT)
  let i = 0
  while (i < n && i < NT) {
    let len = reader.read(3)
    if (len === 7) {
      while (reader.read(1) === 1) len++
    }
    lengths[i++] = len
    if (i === 3) {
      const skip = reader.read(2)
      for (let s = 0; s < skip && i < NT; s++) lengths[i++] = 0
    }
  }
  return buildTable(lengths, 8)
}

function readCodeTable(reader: LhaBitReader, tempTable: HuffTable): HuffTable {
  const n = reader.read(CBIT)
  if (n === 0) {
    return buildSingleSymbol(reader.read(CBIT), 12)
  }
  const lengths = new Uint8Array(NC)
  let i = 0
  while (i < n && i < NC) {
    const val = decode(reader, tempTable)
    if (val === 0) {
      lengths[i++] = 0
    } else if (val === 1) {
      const run = 3 + reader.read(4)
      for (let r = 0; r < run && i < NC; r++) lengths[i++] = 0
    } else if (val === 2) {
      const run = 20 + reader.read(CBIT)
      for (let r = 0; r < run && i < NC; r++) lengths[i++] = 0
    } else {
      lengths[i++] = val - 2
    }
  }
  return buildTable(lengths, 12)
}

function readOffsetTree(reader: LhaBitReader, np: number, pbit: number): HuffTable {
  const n = reader.read(pbit)
  if (n === 0) {
    return buildSingleSymbol(reader.read(pbit), 8)
  }
  const lengths = new Uint8Array(np)
  let i = 0
  while (i < n && i < np) {
    let len = reader.read(3)
    if (len === 7) {
      while (reader.read(1) === 1) len++
    }
    lengths[i++] = len
  }
  return buildTable(lengths, 8)
}

// ─── LH1: LZSS + adaptive Huffman (lhasa-style) ────────────

const LH1_N_CODES = 314     // 256 + 60 - 3 + 1 (maxmatch=60 for lh1)
const LH1_DICBIT = 12

// Offset lookup table: maps 8-bit peek to (code, length)
// Built from the offset frequency distribution: 1×3bit, 3×4bit, 8×5bit, 12×6bit, 24×7bit, 16×8bit = 64 offsets
const OFFSET_LOOKUP = new Uint8Array(256)
const OFFSET_LENGTHS = new Uint8Array(64)

;(function buildOffsetTable() {
  const fdist = [1, 3, 8, 12, 24, 16]
  const minLen = 3
  let code = 0
  let offset = 0
  for (let i = 0; i < fdist.length; i++) {
    const len = i + minLen
    const iterbit = 1 << (8 - len)
    for (let j = 0; j < fdist[i]; j++) {
      const mask = iterbit - 1
      for (let k = 0; (k & ~mask) === 0; k++) {
        OFFSET_LOOKUP[code | k] = offset
      }
      OFFSET_LENGTHS[offset] = len
      code += iterbit
      offset++
    }
  }
})()

function decompressLh1(
  data: Uint8Array, offset: number, compSize: number, uncompSize: number,
): Uint8Array {
  const dicSize = 1 << LH1_DICBIT
  const dicMask = dicSize - 1
  const reader = new LhaBitReader(data, offset, compSize)
  const output = new Uint8Array(uncompSize)
  const dic = new Uint8Array(dicSize).fill(0x20)
  let dicPos = 0
  let outPos = 0

  const tree = new AdaptiveHuffTree(LH1_N_CODES)

  while (outPos < uncompSize) {
    const c = tree.decodeSymbol(() => reader.read(1))

    if (c < 256) {
      output[outPos++] = c
      dic[dicPos] = c
      dicPos = (dicPos + 1) & dicMask
    } else {
      const length = c - 256 + 3  // threshold = 3

      // Decode position: peek 8 bits for offset code, then read lower 6 bits
      const peek8 = reader.peek(8)
      const off = OFFSET_LOOKUP[peek8]
      reader.skip(OFFSET_LENGTHS[off])
      const lower = reader.read(6)
      const pos = (off << 6) | lower

      let srcPos = (dicPos - pos - 1) & dicMask
      for (let i = 0; i < length && outPos < uncompSize; i++) {
        const byte = dic[srcPos]
        output[outPos++] = byte
        dic[dicPos] = byte
        dicPos = (dicPos + 1) & dicMask
        srcPos = (srcPos + 1) & dicMask
      }
    }
  }

  return output
}

// ─── LZS: LZSS only, 2KB ring buffer ────────────────────────

function decompressLzs(
  data: Uint8Array, offset: number, compSize: number, uncompSize: number,
): Uint8Array {
  const dicSize = 2048
  const dicMask = dicSize - 1
  const reader = new LhaBitReader(data, offset, compSize)
  const output = new Uint8Array(uncompSize)
  const dic = new Uint8Array(dicSize).fill(0x20)
  let dicPos = 0
  let outPos = 0

  while (outPos < uncompSize) {
    if (reader.read(1) === 1) {
      const byte = reader.read(8)
      output[outPos++] = byte
      dic[dicPos] = byte
      dicPos = (dicPos + 1) & dicMask
    } else {
      const pos = reader.read(11)
      const length = reader.read(4) + 2
      for (let i = 0; i < length && outPos < uncompSize; i++) {
        const byte = dic[(pos + i) & dicMask]
        output[outPos++] = byte
        dic[dicPos] = byte
        dicPos = (dicPos + 1) & dicMask
      }
    }
  }

  return output
}

// ─── LZ5: LZSS with flag bytes, 4KB ring buffer ─────────────

function decompressLz5(
  data: Uint8Array, offset: number, compSize: number, uncompSize: number,
): Uint8Array {
  const dicSize = 4096
  const dicMask = dicSize - 1
  const reader = new LhaBitReader(data, offset, compSize)
  const output = new Uint8Array(uncompSize)
  const dic = new Uint8Array(dicSize)

  // Initialize ring buffer per original LZSS/LArc pattern:
  // 256 × 13 identical bytes, ascending, descending, 128 zeros, 110 spaces, 18 zeros
  let p = 0
  for (let i = 0; i < 256; i++) {
    for (let j = 0; j < 13; j++) dic[p++] = i
  }
  for (let i = 0; i < 256; i++) dic[p++] = i
  for (let i = 255; i >= 0; i--) dic[p++] = i
  for (let i = 0; i < 128; i++) dic[p++] = 0
  for (let i = 0; i < 110; i++) dic[p++] = 0x20
  for (let i = 0; i < 18; i++) dic[p++] = 0

  let dicPos = dicSize - 18  // 0x0FEE
  let outPos = 0

  while (outPos < uncompSize) {
    const flags = reader.read(8)
    for (let bit = 0; bit < 8 && outPos < uncompSize; bit++) {
      if (flags & (1 << bit)) {
        const byte = reader.read(8)
        output[outPos++] = byte
        dic[dicPos] = byte
        dicPos = (dicPos + 1) & dicMask
      } else {
        const lo = reader.read(8)
        const hi = reader.read(8)
        const pos = lo | ((hi & 0xF0) << 4)
        const length = (hi & 0x0F) + 3
        for (let i = 0; i < length && outPos < uncompSize; i++) {
          const byte = dic[(pos + i) & dicMask]
          output[outPos++] = byte
          dic[dicPos] = byte
          dicPos = (dicPos + 1) & dicMask
        }
      }
    }
  }

  return output
}
