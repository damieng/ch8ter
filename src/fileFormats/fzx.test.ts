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

describe('writeFzx metrics come from pixels and advance width', () => {
  it('keeps a narrow advance instead of widening it to the full cell', () => {
    const f = blankFont(8, 8)
    f.plot(1, 0, 2); f.plot(1, 1, 2)
    f.glyphMeta = [null, { dwidth: [3, 0] }, null]
    const r = parseFzx(writeFzx(f).buffer as ArrayBuffer)
    expect(r.glyphMeta[1]!.dwidth![0]).toBe(3)
  })

  it('does not read BDF bounding boxes as FZX kern/shift/width fields', () => {
    // BDF bbx is [w, h, xoff, yoff]; a negative yoff (descender) used to become a garbage shift
    const f = blankFont(8, 8)
    f.plot(1, 1, 3); f.plot(1, 2, 3); f.plot(1, 1, 4); f.plot(1, 2, 4)
    f.glyphMeta = [null, { bbx: [2, 2, 1, -2], dwidth: [4, 0] }, null]
    const r = parseFzx(writeFzx(f).buffer as ArrayBuffer)
    for (const [x, y] of [[1, 3], [2, 3], [1, 4], [2, 4]]) expect(pixel(r, 1, x, y), `${x},${y}`).toBe(true)
    expect(pixel(r, 1, 0, 3)).toBe(false)
    expect(r.glyphMeta[1]!.dwidth![0]).toBe(4)
  })

  it('round-trips the kern and advance of an FZX font', () => {
    const f = blankFont(8, 8)
    f.plot(1, 2, 1); f.plot(1, 3, 1); f.plot(1, 2, 2); f.plot(1, 3, 2) // ink starts at column 2
    f.glyphMeta = [null, { dwidth: [6, 0] }, null]
    const once = parseFzx(writeFzx(f).buffer as ArrayBuffer)
    expect(once.glyphMeta[1]!.bbx![2]).toBe(2) // kern
    expect(once.glyphMeta[1]!.dwidth![0]).toBe(6)

    // Writing the parsed font again changes nothing
    const again = writeFzx({
      fontData: once.fontData, glyphWidth: once.glyphWidth, glyphHeight: once.glyphHeight,
      startChar: 32, glyphCount: once.fontData.length / (once.glyphHeight * bpr(once.glyphWidth)),
      baseline: 7, meta: null, glyphMeta: once.glyphMeta, fontName: 'T', tracking: once.tracking,
    })
    expect([...again]).toEqual([...writeFzx(f)])
  })
})

describe('parseFzx glyphs without bitmap rows', () => {
  it('keeps the advance width of a space', () => {
    const f = blankFont(8, 8)
    f.plot(1, 0, 3)
    f.glyphMeta = [{ dwidth: [5, 0] }, null, null] // glyph 0 is the (blank) space, 5px wide
    const r = parseFzx(writeFzx(f).buffer as ArrayBuffer)
    expect(r.glyphMeta[0]?.dwidth?.[0]).toBe(5)
  })
})
