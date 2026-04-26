import { describe, it, expect, beforeEach } from 'vitest'
import { activeFontId, addFont, charset, createFont, glyphCount, removeAllFonts, switchCharset } from './store'

describe('charset switching', () => {
  beforeEach(() => {
    removeAllFonts()
    charset.value = 'cpm'
  })

  it('preserves CP/M glyphs that collide by Unicode and keeps blank trailing slots', () => {
    const data = new Uint8Array(256)
    data[0x30] = 0x30
    data[0x7F] = 0x7F

    const font = createFont(data, 'cpm.bin', 0, 8, 1)
    addFont(font)

    switchCharset('amiga')

    expect(glyphCount(font)).toBe(256)
    expect(font.fontData.value[0x30]).toBe(0x30)
    expect(font.fontData.value[0x7F]).toBe(0x7F)
    expect(font.fontData.value[0xFF]).toBe(0)

    switchCharset('cpm')

    expect(glyphCount(font)).toBe(256)
    expect(font.fontData.value[0x30]).toBe(0x30)
    expect(font.fontData.value[0x7F]).toBe(0x7F)
    expect(font.fontData.value[0xFF]).toBe(0)
    expect(activeFontId.value).toBe(font.id)
  })
})
