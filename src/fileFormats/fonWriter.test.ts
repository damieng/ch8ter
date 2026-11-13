import { describe, it, expect } from 'vitest'
import { writeFon } from './fonWriter'
import { parseFon } from './fonParser'
import type { FontWriteData } from '../fontSave'

function sampleFont(): FontWriteData {
  // 3 glyphs, 8x8 with a simple pattern
  const fontData = new Uint8Array(3 * 8)
  for (let g = 0; g < 3; g++)
    for (let b = 0; b < 8; b++)
      fontData[g * 8 + b] = ((g + 1) * 0x24 + b) & 0xFF
  return {
    fontData,
    glyphWidth: 8,
    glyphHeight: 8,
    startChar: 32,
    glyphCount: 3,
    baseline: 7,
    meta: { format: 'test', properties: {}, family: 'TestFace' },
    glyphMeta: null,
    fontName: 'TestFace',
  }
}

function toArrayBuffer(u: Uint8Array): ArrayBuffer {
  return u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer
}

describe('writeFon', () => {
  it('writes a FONTDIR entry in the documented layout: ordinal, 113-byte font info, then the strings', () => {
    const buf = writeFon(sampleFont())
    const v = new DataView(buf.buffer)
    const neOffset = v.getUint32(0x3C, true)
    let pos = neOffset + v.getUint16(neOffset + 0x24, true)
    const shift = v.getUint16(pos, true)
    pos += 2
    let dirOff = -1, fontOff = -1
    while (v.getUint16(pos, true) !== 0) {
      const type = v.getUint16(pos, true)
      const off = v.getUint16(pos + 8, true) << shift
      if (type === 0x8007) dirOff = off
      if (type === 0x8008) fontOff = off
      pos += 8 + 12
    }
    expect(v.getUint16(dirOff, true)).toBe(1) // one font
    expect(v.getUint16(dirOff + 2, true)).toBe(1) // fontOrdinal
    const info = dirOff + 4
    expect(v.getUint16(info, true)).toBe(v.getUint16(fontOff, true)) // dfVersion copied from the FNT
    expect(v.getUint16(info + 66, true)).toBe(0) // dfType: raster
    expect(v.getUint32(info + 109, true)).toBe(0) // dfReserved
    // device name (empty) then the face name
    expect(buf[info + 113]).toBe(0)
    expect(new TextDecoder().decode(buf.subarray(info + 114, info + 114 + 8))).toBe('TestFace')
  });


  it('writes integer resource IDs (high bit set), not name offsets', () => {
    const buf = writeFon(sampleFont())
    const v = new DataView(buf.buffer)
    const neOffset = v.getUint32(0x3C, true)
    let pos = neOffset + v.getUint16(neOffset + 0x24, true) + 2 // after the alignment shift
    const ids: Record<number, number> = {}
    while (v.getUint16(pos, true) !== 0) {
      const type = v.getUint16(pos, true)
      const count = v.getUint16(pos + 2, true)
      pos += 8
      for (let i = 0; i < count; i++) { ids[type] = v.getUint16(pos + 6, true); pos += 12 }
    }
    expect(ids[0x8007]).toBe(0x8001) // FONTDIR
    expect(ids[0x8008]).toBe(0x8001) // FONT
  });


  it('produces an NE FON that parseFon reads back', () => {
    const buf = writeFon(sampleFont())
    const parsed = parseFon(toArrayBuffer(buf))

    expect(parsed.fonts.length).toBe(1)
    const fnt = parsed.fonts[0].fnt
    expect(fnt.glyphWidth).toBe(8)
    expect(fnt.glyphHeight).toBe(8)
    expect(fnt.startChar).toBe(32)
    expect(fnt.populated.size).toBe(3)
    // Glyph bitmaps survive (compare row-major re-encodings)
    expect([...fnt.fontData]).toEqual([...sampleFont().fontData])
    expect(fnt.meta.family).toBe('TestFace')
  })
})
