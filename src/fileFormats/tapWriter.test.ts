import { describe, it, expect } from 'vitest'
import { writeTap } from './tapWriter'
import { extractTapFonts } from './tapParser'
import { loadFontFile } from '../fontLoad'
import type { FontWriteData } from '../fontSave'

function makeFont(): FontWriteData {
  const fontData = new Uint8Array(96 * 8)
  for (let g = 0; g < 96; g++)
    for (let b = 0; b < 8; b++)
      fontData[g * 8 + b] = (g * 5 + b * 11) & 0xFF
  return {
    fontData, glyphWidth: 8, glyphHeight: 8, startChar: 32,
    glyphCount: 96, baseline: 7, meta: null, glyphMeta: null, fontName: 'MyFont',
  }
}

describe('writeTap', () => {
  it('produces a TAP that our extractor reads back', () => {
    const font = makeFont()
    const buf = writeTap(font)
    const fonts = extractTapFonts(buf)
    expect(fonts.length).toBe(1)
    expect(fonts[0].label).toContain('MYFONT')
    expect(fonts[0].numChars).toBe(128) // padded to cover codes 0..127
    expect(fonts[0].startAddress).toBe(32768)
    expect([...fonts[0].fontData.subarray(32 * 8, 32 * 8 + 8)]).toEqual([...font.fontData.subarray(0, 8)])
  })

  it('round-trips through the font loader', () => {
    const font = makeFont()
    const buf = writeTap(font)
    const result = loadFontFile('test.tap', buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer)
    expect(result.glyphCount).toBe(128)
    expect(result.glyphWidth).toBe(8)
    expect(result.detectedCharset).toBe('zx')
  })

  it('rejects non-8x8 fonts', () => {
    expect(() => writeTap({ ...makeFont(), glyphHeight: 16 })).toThrow('8x8')
  })
})
