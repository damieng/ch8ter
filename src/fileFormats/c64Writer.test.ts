import { describe, it, expect } from 'vitest'
import { write64c } from './c64Writer'
import { loadFontFile } from '../fontLoad'
import type { FontWriteData } from '../fontSave'

function makeFont(): FontWriteData {
  const fontData = new Uint8Array(256 * 8)
  for (let g = 0; g < 256; g++)
    for (let b = 0; b < 8; b++)
      fontData[g * 8 + b] = (g * 7 + b * 3) & 0xFF
  return {
    fontData, glyphWidth: 8, glyphHeight: 8, startChar: 0,
    glyphCount: 256, baseline: 7, meta: null, glyphMeta: null, fontName: 'C64',
  }
}

describe('write64c', () => {
  it('round-trips all 256 glyphs through the .64c loader', () => {
    const font = makeFont()
    const buf = write64c(font)
    expect(buf.length).toBe(2 + 2048)
    expect(buf[0]).toBe(0x00) // load address $D000
    expect(buf[1]).toBe(0xD0)

    const result = loadFontFile('test.64c', buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer)
    expect(result.glyphCount).toBe(256)
    expect([...result.fontData]).toEqual([...font.fontData])
  })

  it('places partial fonts at their character codes', () => {
    const font = makeFont()
    font.startChar = 65
    font.glyphCount = 2
    font.fontData = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16])

    const buf = write64c(font)
    // 'A' (code 65) at offset 2 + 65*8
    expect([...buf.subarray(2 + 65 * 8, 2 + 65 * 8 + 8)]).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
    expect([...buf.subarray(2 + 66 * 8, 2 + 66 * 8 + 8)]).toEqual([9, 10, 11, 12, 13, 14, 15, 16])
  })

  it('rejects non-8x8 fonts', () => {
    expect(() => write64c({ ...makeFont(), glyphWidth: 8, glyphHeight: 16 })).toThrow('8x8')
  })
})
