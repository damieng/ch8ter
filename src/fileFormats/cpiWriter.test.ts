import { describe, it, expect } from 'vitest'
import { writeCpi } from './cpiWriter'
import { parseCpi } from './cpiParser'
import type { FontWriteData } from '../fontSave'

function sampleFont(overrides: Partial<FontWriteData> = {}): FontWriteData {
  // 4 glyphs, 8x8, distinct bytes
  const fontData = new Uint8Array(4 * 8)
  for (let g = 0; g < 4; g++)
    for (let b = 0; b < 8; b++)
      fontData[g * 8 + b] = (g + 1) * 0x11 + b
  return {
    fontData,
    glyphWidth: 8,
    glyphHeight: 8,
    startChar: 0,
    glyphCount: 4,
    baseline: 7,
    meta: null,
    glyphMeta: null,
    fontName: 'Test',
    detectedCharset: 'cp850',
    ...overrides,
  }
}

describe('writeCpi', () => {
  it('round-trips through parseCpi with data and codepage intact', () => {
    const font = sampleFont()
    const buf = writeCpi(font)
    const parsed = parseCpi(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer)

    expect(parsed.variant).toBe('FONT')
    expect(parsed.fonts.length).toBe(1)
    const f = parsed.fonts[0]
    expect(f.codepage).toBe(850)
    expect(f.deviceType).toBe(1)
    expect(f.width).toBe(8)
    expect(f.height).toBe(8)
    expect(f.numChars).toBe(4)
    expect([...f.fontData]).toEqual([...font.fontData])
  })

  it('puts each glyph on its character code when the font does not start at 0', () => {
    const font = sampleFont({ startChar: 65 }) // 4 glyphs: A..D
    const buf = writeCpi(font)
    const parsed = parseCpi(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer)
    const f = parsed.fonts[0]
    expect(f.numChars).toBe(69) // codes 0..68
    expect([...f.fontData.subarray(65 * 8, 69 * 8)]).toEqual([...font.fontData])
    expect([...f.fontData.subarray(0, 8)]).toEqual([0, 0, 0, 0, 0, 0, 0, 0]) // padding below A is blank
  })

  it('rejects a font that runs past character code 255', () => {
    expect(() => writeCpi(sampleFont({ startChar: 254 }))).toThrow('0..255')
  })

  it('defaults the codepage to 437 without a cpN charset', () => {
    const buf = writeCpi(sampleFont({ detectedCharset: undefined }))
    const parsed = parseCpi(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer)
    expect(parsed.fonts[0].codepage).toBe(437)
  })

  it('rejects fonts larger than 256 glyphs', () => {
    expect(() => writeCpi(sampleFont({ glyphCount: 257, fontData: new Uint8Array(257 * 8) })))
      .toThrow('1..256')
  })
})
