import { describe, it, expect } from 'vitest'
import { writeGeosCvt } from './geosWriter'
import { parseGeosCvt, isGeosCvt } from './geosParser'
import { bpr, getBit } from '../bitUtils'
import type { FontWriteData } from '../fontSave'

function makeFont(): FontWriteData {
  // 4 glyphs, 8x8, codes $20-$23, with distinct advances and patterns
  const glyphCount = 4
  const fontData = new Uint8Array(glyphCount * 8)
  fontData[0] = 0x80                 // ' ': pixel (0,0) only
  fontData[8] = 0xC0                 // '!': pixels (0,0),(1,0)
  fontData[16] = 0xAA                // '"': pixels (0,0),(2,0),(4,0),(6,0)
  fontData[24] = 0xFF                // '#': full row 0
  return {
    fontData,
    glyphWidth: 8,
    glyphHeight: 8,
    startChar: 0x20,
    glyphCount,
    baseline: 7,
    meta: null,
    glyphMeta: [
      { dwidth: [3, 0] },
      { dwidth: [4, 0] },
      { dwidth: [8, 0] },
      { dwidth: [8, 0] },
    ],
    fontName: 'TestFont',
  }
}

describe('writeGeosCvt / parseGeosCvt', () => {
  it('produces a file with the CVT signature', () => {
    const buf = writeGeosCvt(makeFont())
    expect(isGeosCvt(buf)).toBe(true)
    const sig = new TextDecoder().decode(buf.subarray(30, 58))
    expect(sig).toContain('PRG formatted GEOS file V1.0')
  })

  it('round-trips glyphs, advances, baseline and point size', () => {
    const font = makeFont()
    const buf = writeGeosCvt(font)
    const sets = parseGeosCvt(buf)

    expect(sets.length).toBe(1)
    const set = sets[0]
    expect(set.size).toBe(8)                  // point size = height
    expect(set.glyphHeight).toBe(8)
    expect(set.ascent).toBe(7)
    expect(set.populated).toEqual(new Set([0, 1, 2, 3]))
    expect(set.glyphMeta.filter(Boolean).map(m => m!.dwidth[0])).toEqual([3, 4, 8, 8])

    // Pixel-exact round-trip: every set cell pixel matches the source
    const bprSrc = bpr(8)
    const bprDst = bpr(set.glyphWidth)
    for (let g = 0; g < 4; g++) {
      for (let y = 0; y < 8; y++) {
        for (let x = 0; x < 8; x++) {
          const src = getBit(font.fontData, g * 8 + y * bprSrc, x)
          const dst = getBit(set.fontData, g * set.glyphHeight * bprDst + y * bprDst, x)
          expect(dst).toBe(src)
        }
      }
    }
  })

  it('ignores glyphs outside the $20-$7F GEOS range', () => {
    const font = makeFont()
    font.startChar = 0x10  // codes $10-$13, all outside $20-$7F
    // With no glyphs in range the record has no content, so no set is emitted
    const sets = parseGeosCvt(writeGeosCvt(font))
    expect(sets.length).toBe(0)
  })

  it('rejects non-CVT input', () => {
    expect(() => parseGeosCvt(new Uint8Array(1024))).toThrow('Not a GEOS CVT')
  })
})
