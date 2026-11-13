import { describe, it, expect } from 'vitest'
import { writeFzx } from './fzxWriter'
import { parseFzx } from './fzxParser'
import { getBit, bpr } from '../bitUtils'
import type { FontWriteData } from '../fontSave'

/** A font of `count` glyphs starting at 32, all blank, with a pixel-plotting helper. */
function blankFont(w: number, h: number, count = 3): FontWriteData & { plot(glyph: number, x: number, y: number): void } {
  const rowBytes = bpr(w)
  const fontData = new Uint8Array(count * h * rowBytes)
  return {
    fontData, glyphWidth: w, glyphHeight: h, startChar: 32, glyphCount: count,
    baseline: h - 1, meta: null, glyphMeta: null, fontName: 'T',
    plot(glyph, x, y) { fontData[glyph * h * rowBytes + y * rowBytes + (x >> 3)] |= 0x80 >> (x & 7) },
  }
}

function pixel(r: ReturnType<typeof parseFzx>, glyph: number, x: number, y: number): boolean {
  const rowBytes = bpr(r.glyphWidth)
  return getBit(r.fontData, glyph * r.glyphHeight * rowBytes + y * rowBytes, x)
}

describe('writeFzx vertical shift', () => {
  it('keeps a glyph that starts below row 15 on its row', () => {
    const f = blankFont(8, 24)
    f.plot(1, 2, 20) // glyph 1 (char 33): its only pixel is on row 20
    const r = parseFzx(writeFzx(f).buffer as ArrayBuffer)
    expect(pixel(r, 1, 2, 20)).toBe(true)
    expect(pixel(r, 1, 2, 15)).toBe(false)
  })
})
