import { describe, it, expect } from 'vitest'
import { writeGdosFont } from './gdosFontWriter'
import { parseGdosFont } from './gdosFontParser'
import type { FontWriteData } from '../fontSave'

function font(overrides: Partial<FontWriteData> = {}): FontWriteData {
  const fontData = new Uint8Array(3 * 8)
  fontData[0 * 8 + 1] = 0x60 // glyph 0 ('space' slot reused): ink on cols 1-2
  fontData[1 * 8 + 2] = 0xC0 // glyph 1: cols 0-1
  return {
    fontData, glyphWidth: 8, glyphHeight: 8, startChar: 32, glyphCount: 3,
    baseline: 7, meta: null, glyphMeta: null, fontName: 'T', ...overrides,
  }
}
const toBuf = (b: Uint8Array) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer

describe('writeGdosFont advance widths', () => {
  it('uses the glyph DWIDTH as the advance instead of the bitmap width', () => {
    const f = font({ glyphMeta: [{ dwidth: [5, 0] }, { dwidth: [8, 0] }, { dwidth: [3, 0] }] })
    const parsed = parseGdosFont(toBuf(writeGdosFont(f)))
    expect(parsed.glyphMeta.map(m => m?.dwidth?.[0])).toEqual([5, 8, 3])
  })

  it('gives a monospaced font (no metadata) the full cell as its advance', () => {
    const parsed = parseGdosFont(toBuf(writeGdosFont(font())))
    // the blank third glyph used to export as a 1px space
    expect(parsed.glyphMeta.map(m => m?.dwidth?.[0])).toEqual([8, 8, 8])
  })

  it('still writes no horizontal table when every advance equals its bitmap width', () => {
    const f = font({ glyphMeta: [{ dwidth: [3, 0] }, { dwidth: [2, 0] }, { dwidth: [1, 0] }] })
    const bytes = writeGdosFont(f)
    expect(new DataView(bytes.buffer).getUint32(68, true)).toBe(0)
  })
})

describe('parseGdosFont offset validation', () => {
  it('rejects a character offset beyond the raster instead of allocating for it', () => {
    const bytes = writeGdosFont(font())
    const v = new DataView(bytes.buffer)
    const charTable = v.getUint32(72, true)
    v.setUint16(charTable + 2 * 2, 65535, true) // an offset far past the raster
    expect(() => parseGdosFont(toBuf(bytes))).toThrow('beyond')
  })
})
