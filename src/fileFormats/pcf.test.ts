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

import { parsePcf } from './pcfParser'
import { bpr, getBit } from '../bitUtils'

/** Minimal PCF: compressed metrics + bitmaps (MSBit-first, 1-byte rows), no encodings or accelerators. */
function buildPcf(glyphs: { lb: number; rb: number; cw: number; asc: number; desc: number; rows: number[] }[]): ArrayBuffer {
  const metricsSize = 4 + 2 + glyphs.length * 5
  const bitmapRows = glyphs.map(g => g.rows)
  const offsets: number[] = []
  let dataLen = 0
  for (const rows of bitmapRows) { offsets.push(dataLen); dataLen += rows.length }
  const bitmapsSize = 4 + 4 + glyphs.length * 4 + 16 + dataLen

  const tocSize = 8 + 2 * 16
  const metricsOff = tocSize
  const bitmapsOff = metricsOff + ((metricsSize + 3) & ~3)
  const total = bitmapsOff + bitmapsSize
  const buf = new ArrayBuffer(total)
  const v = new DataView(buf)
  const u8 = new Uint8Array(buf)

  v.setUint32(0, 0x70636601, true)
  v.setInt32(4, 2, true)
  const entry = (i: number, type: number, format: number, size: number, offset: number) => {
    const o = 8 + i * 16
    v.setInt32(o, type, true); v.setInt32(o + 4, format, true); v.setInt32(o + 8, size, true); v.setInt32(o + 12, offset, true)
  }
  entry(0, 1 << 2, 0x100, metricsSize, metricsOff)
  entry(1, 1 << 3, 0x8, bitmapsSize, bitmapsOff)

  v.setInt32(metricsOff, 0x100, true)       // compressed metrics, little-endian
  v.setInt16(metricsOff + 4, glyphs.length, true)
  glyphs.forEach((g, i) => {
    const o = metricsOff + 6 + i * 5
    u8[o] = g.lb + 0x80; u8[o + 1] = g.rb + 0x80; u8[o + 2] = g.cw + 0x80; u8[o + 3] = g.asc + 0x80; u8[o + 4] = g.desc + 0x80
  })

  v.setInt32(bitmapsOff, 0x8, true)         // MSBit-first, 1-byte padding and scan unit
  v.setInt32(bitmapsOff + 4, glyphs.length, true)
  offsets.forEach((off, i) => v.setInt32(bitmapsOff + 8 + i * 4, off, true))
  let d = bitmapsOff + 8 + glyphs.length * 4 + 16
  for (const rows of bitmapRows) for (const r of rows) u8[d++] = r
  return buf
}

describe('parsePcf negative left bearing', () => {
  it('widens the cell and offsets glyphs so no ink is clipped', () => {
    // A hangs 2px left of the origin (4px wide); B is 6px wide starting at the origin
    const r = parsePcf(buildPcf([
      { lb: -2, rb: 2, cw: 3, asc: 1, desc: 0, rows: [0xF0] },
      { lb: 0, rb: 6, cw: 6, asc: 1, desc: 0, rows: [0xFC] },
    ]))
    expect(r.glyphWidth).toBe(8) // 6 (rightmost ink) minus -2 (leftmost)
    const rowBytes = bpr(r.glyphWidth)
    const bit = (g: number, x: number) => getBit(r.fontData, g * r.glyphHeight * rowBytes, x)
    for (let x = 0; x < 4; x++) expect(bit(0, x), `A col ${x}`).toBe(true)
    expect(bit(0, 4)).toBe(false)
    for (let x = 2; x < 8; x++) expect(bit(1, x), `B col ${x}`).toBe(true)
  })
})
