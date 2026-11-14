// Round-trip tests for the LZSS-based LHA methods (-lzs- and -lz5-).
//
// These decoders were effectively uncovered. Rather than hand-writing bit
// patterns, encode a known input with a small LZSS encoder that emits the
// same format the decoder reads, then require the decoder to recover it.
//
// Both methods are: 1 flag bit (1 = literal byte follows, 0 = dictionary
// match), then either an 8-bit literal or an 11-bit dictionary position plus
// a length code. That is simple enough to encode correctly and exercises the
// whole decode loop including the ring buffer.

import { describe, it, expect } from 'vitest'
import { decompress } from './lhaDecompress'

/** MSB-first bit writer. */
class BitWriter {
  private bits: number[] = []
  write(value: number, count: number) {
    for (let i = count - 1; i >= 0; i--) this.bits.push((value >>> i) & 1)
  }
  finish(): Uint8Array {
    while (this.bits.length % 8 !== 0) this.bits.push(0)
    const out = new Uint8Array(this.bits.length / 8)
    for (let i = 0; i < this.bits.length; i++) {
      if (this.bits[i]) out[i >> 3] |= 0x80 >> (i & 7)
    }
    return out
  }
}

/** Encode a byte string as all-literals `-lzs-` data. */
function encodeLiterals(bytes: Uint8Array): Uint8Array {
  const w = new BitWriter()
  for (const b of bytes) {
    w.write(1, 1)   // literal
    w.write(b, 8)
  }
  return w.finish()
}

/** Encode a literal run followed by one dictionary match. */
function encodeLiteralThenMatch(
  prefix: Uint8Array,
  matchPos: number,
  matchLenCode: number,
): Uint8Array {
  const w = new BitWriter()
  for (const b of prefix) {
    w.write(1, 1)
    w.write(b, 8)
  }
  w.write(0, 1)          // match
  w.write(matchPos, 11)
  w.write(matchLenCode, 4) // decoded length = code + 2
  return w.finish()
}

describe('-lzs- (LZSS)', () => {
  it('decodes a run of literals verbatim', () => {
    const input = new Uint8Array([0x41, 0x42, 0x43, 0x44, 0x45])
    const encoded = encodeLiterals(input)
    expect([...decompress('-lzs-', encoded, 0, encoded.length, input.length)]).toEqual([...input])
  })

  it('decodes a single literal', () => {
    const encoded = encodeLiterals(new Uint8Array([0x7F]))
    expect([...decompress('-lzs-', encoded, 0, encoded.length, 1)]).toEqual([0x7F])
  })

  it('copies from the dictionary for a match', () => {
    // Four literals at dictionary positions 0..3, then a match back to 0
    // with length code 2 => 4 bytes, reproducing "ABCD"
    const encoded = encodeLiteralThenMatch(new Uint8Array([0x41, 0x42, 0x43, 0x44]), 0, 2)
    const out = decompress('-lzs-', encoded, 0, encoded.length, 8)
    expect([...out]).toEqual([0x41, 0x42, 0x43, 0x44, 0x41, 0x42, 0x43, 0x44])
  })

  it('fills the dictionary with spaces before any output', () => {
    // A match against the pre-filled dictionary (0x20) yields spaces
    const w = new BitWriter()
    w.write(0, 1)      // match
    w.write(0, 11)     // position 0
    w.write(0, 4)      // length code 0 => 2 bytes
    const encoded = w.finish()
    expect([...decompress('-lzs-', encoded, 0, encoded.length, 2)]).toEqual([0x20, 0x20])
  })

  it('stops exactly at the declared output length', () => {
    const encoded = encodeLiterals(new Uint8Array([1, 2, 3, 4, 5, 6]))
    // Ask for only 3 bytes even though 6 are encoded
    expect(decompress('-lzs-', encoded, 0, encoded.length, 3).length).toBe(3)
  })

  it('handles an empty output', () => {
    expect(decompress('-lzs-', new Uint8Array(0), 0, 0, 0).length).toBe(0)
  })

  it('respects a non-zero data offset', () => {
    const encoded = encodeLiterals(new Uint8Array([0x11, 0x22]))
    const prefixed = new Uint8Array(3 + encoded.length)
    prefixed.set(encoded, 3)
    expect([...decompress('-lzs-', prefixed, 3, encoded.length, 2)]).toEqual([0x11, 0x22])
  })
})

describe('-lz5- (LZSS)', () => {
  /**
   * -lz5- frames differently from -lzs-: a flag byte precedes each group of
   * eight items, bit set = literal byte, clear = 12-bit position plus a
   * 4-bit length code (decoded length = code + 3).
   */
  function encodeLz5Literals(bytes: Uint8Array): Uint8Array {
    const out: number[] = []
    for (let i = 0; i < bytes.length; i += 8) {
      const group = bytes.slice(i, i + 8)
      out.push(0) // flag byte, filled below
      let flags = 0
      for (let b = 0; b < group.length; b++) {
        flags |= 1 << b
        out.push(group[b])
      }
      out[out.length - group.length - 1] = flags
    }
    return new Uint8Array(out)
  }

  it('decodes literals verbatim', () => {
    const input = new Uint8Array([0x61, 0x62, 0x63])
    const encoded = encodeLz5Literals(input)
    expect([...decompress('-lz5-', encoded, 0, encoded.length, input.length)]).toEqual([...input])
  })

  it('decodes a full group of eight literals', () => {
    const input = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8])
    const encoded = encodeLz5Literals(input)
    expect([...decompress('-lz5-', encoded, 0, encoded.length, 8)]).toEqual([...input])
  })

  it('stops at the declared output length mid-group', () => {
    const input = new Uint8Array([9, 8, 7, 6, 5])
    const encoded = encodeLz5Literals(input)
    expect([...decompress('-lz5-', encoded, 0, encoded.length, 3)]).toEqual([9, 8, 7])
  })

  it('handles an empty output', () => {
    expect(decompress('-lz5-', new Uint8Array(0), 0, 0, 0).length).toBe(0)
  })
})

describe('decompress dispatch', () => {
  it('routes -lzs- to its own decoder', () => {
    const encoded = encodeLiterals(new Uint8Array([0x41]))
    expect([...decompress('-lzs-', encoded, 0, encoded.length, 1)]).toEqual([0x41])
  })

  it('rejects an unknown method before doing any work', () => {
    expect(() => decompress('-zzz-', new Uint8Array(4), 0, 4, 4))
      .toThrow(/Unsupported LHA method: -zzz-/)
  })
})

describe('decoders do not overrun their declared output', () => {
  it('never writes past uncompSize for -lzs-', () => {
    // Encode many literals, ask for far fewer
    const encoded = encodeLiterals(new Uint8Array(200).fill(0xAB))
    const out = decompress('-lzs-', encoded, 0, encoded.length, 10)
    expect(out.length).toBe(10)
    expect([...out]).toEqual(new Array(10).fill(0xAB))
  })

  it('tolerates a truncated bitstream by padding with zeros', () => {
    const encoded = encodeLiterals(new Uint8Array(50))
    const truncated = encoded.slice(0, 4)
    expect(() => decompress('-lzs-', truncated, 0, truncated.length, 50)).not.toThrow()
  })
})
