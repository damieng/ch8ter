import { describe, it, expect } from 'vitest'
import { parseEncodings } from './pcfParser'

/** A PCF encodings table (little-endian) covering byte2 = min..max with the given glyph indices. */
function encodingsTable(min: number, max: number, indices: number[]): { view: DataView; size: number } {
  const buf = new ArrayBuffer(4 + 10 + indices.length * 2)
  const view = new DataView(buf)
  view.setInt32(0, 0, true)       // format: default (little-endian)
  view.setUint16(4, min, true)    // min_char_or_byte2
  view.setUint16(6, max, true)    // max_char_or_byte2
  view.setUint16(8, 0, true)      // min_byte1
  view.setUint16(10, 0, true)     // max_byte1
  view.setUint16(12, 0, true)     // default_char
  indices.forEach((g, i) => view.setUint16(14 + i * 2, g, true))
  return { view, size: buf.byteLength }
}

describe('parseEncodings', () => {
  it('reads glyph indices as unsigned, so large fonts are not truncated', () => {
    const { view, size } = encodingsTable(0x41, 0x44, [40000, 0xFFFF, 32768, 5])
    const map = parseEncodings(view, { type: 0, format: 0, size, offset: 0 })
    expect(map.get(0x41)).toBe(40000)
    expect(map.get(0x43)).toBe(32768)
    expect(map.get(0x44)).toBe(5)
    expect(map.has(0x42)).toBe(false) // 0xFFFF = no glyph
  })
})
