import { describe, it, expect } from 'vitest'
import { buildTable, decode } from './lhaHuffman'
import { LhaBitReader } from './lhaBitReader'

function decodeAll(data: Uint8Array, codeLengths: Uint8Array, tableBits: number, count: number): number[] {
  const ht = buildTable(codeLengths, tableBits)
  const reader = new LhaBitReader(data, 0, data.length * 8)
  const out: number[] = []
  for (let i = 0; i < count; i++) out.push(decode(reader, ht))
  return out
}

describe('lhaHuffman buildTable', () => {
  it('decodes codes longer than the table size (all overflow)', () => {
    // Canonical codes for lengths [4,4,5]: sym0=0000, sym1=0001, sym2=00100
    // Bitstream 0000 0001 00100 -> bytes 0x01, 0x20
    expect(decodeAll(new Uint8Array([0x01, 0x20]), new Uint8Array([4, 4, 5]), 2, 3))
      .toEqual([0, 1, 2])
  })

  it('decodes a mix of direct and overflow codes', () => {
    // Lengths [1,3,3,3]: sym0=0, sym1=100, sym2=101, sym3=110, tableBits=1
    // Bitstream 100 101 110 0 -> bytes 0x97, 0x00
    expect(decodeAll(new Uint8Array([0x97, 0x00]), new Uint8Array([1, 3, 3, 3]), 1, 4))
      .toEqual([1, 2, 3, 0])
  })

  it('decodes codes that all share one overflow prefix', () => {
    // Lengths [4,4,4,4]: sym0=00 00, sym1=01 01... canonical: 0000,0001,0010,0011, tableBits=2
    // Bitstream 0000 0001 0010 0011 -> bytes 0x01, 0x23
    expect(decodeAll(new Uint8Array([0x01, 0x23]), new Uint8Array([4, 4, 4, 4]), 2, 4))
      .toEqual([0, 1, 2, 3])
  })
})
