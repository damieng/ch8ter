import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  charset, createFont, addFont, removeAllFonts, switchCharset, openGlyphEditor, openNewGlyphEditor, getPixel,
} from './store'

describe('switching codepage', () => {
  const original = charset.value
  beforeEach(() => { removeAllFonts() })
  afterEach(() => { charset.value = original })

  // zx covers 32-127, cp437 covers 0-255, so switching shifts every glyph index
  function zxFont() {
    charset.value = 'zx'
    const f = createFont(new Uint8Array(96 * 8), 'x.bin', 32, 8, 8)
    // 'A' (0x41) gets a distinctive pattern: top-left pixel plus a pixel on row 3
    f.fontData.value[(0x41 - 32) * 8] = 0x80
    f.fontData.value[(0x41 - 32) * 8 + 3] = 0x40
    addFont(f)
    return f
  }

  it('moves pinned glyph editors with their glyph', () => {
    const f = zxFont()
    f.lastClickedGlyph.value = 0x41 - 32
    openGlyphEditor(f)
    openNewGlyphEditor(f, 0x41 - 32, true) // pin 'A'
    expect(f.pinnedEditors.value[0].glyph).toBe(0x41 - 32)

    switchCharset('cp437')

    const idx = f.pinnedEditors.value[0].glyph
    expect(f.startChar.value + idx).toBe(0x41)
    expect(getPixel(f, idx, 0, 0)).toBe(true) // still showing the glyph that was 'A'
  })

})
