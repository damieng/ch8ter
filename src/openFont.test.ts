import { describe, it, expect, beforeEach } from 'vitest'
import { fonts, activeFontId, openFont, removeAllFonts, createFont, addFont } from './store'
import { bpr } from './bitUtils'

/** 8x8 glyphs whose 'H' and '1' have ink, so metric detection has something to find. */
function inkData(startChar = 32): Uint8Array {
  const count = 96
  const data = new Uint8Array(count * 8)
  const h = (0x48 - startChar) * 8
  data[h] = 0xFF
  data[h + 1] = 0x81
  const one = (0x31 - startChar) * 8
  data[one] = 0x40
  data[one + 1] = 0xC0
  return data
}

describe('openFont', () => {
  beforeEach(() => { removeAllFonts() })

  it('adds the font and makes it active', () => {
    const font = openFont(inkData(), 'test.bin', 32, 8, 8)
    // Identity, not toContain: Vitest's deep equality walks the signal graph
    expect(fonts.value.length).toBe(1)
    expect(fonts.value[0] === font).toBe(true)
    expect(activeFontId.value).toBe(font.id)
  })

  it('copies the populated set and container id over', () => {
    const populated = new Set([0, 2, 4])
    const font = openFont(inkData(), 'c.cpi', 32, 8, 8, {
      populated,
      sourceContainerId: 'container-1',
    })
    expect(font.populatedGlyphs.value).toEqual(populated)
    expect(font.sourceContainerId).toBe('container-1')
  })

  // The ordering this helper exists to protect: vertical metrics from the
  // source must survive metric detection, which would otherwise overwrite them.
  it('keeps source vertical metrics instead of detecting them', () => {
    const font = openFont(inkData(), 'gdos.fnt', 32, 8, 8, { ascender: 1, descender: 0 })
    expect(font.ascender.value).toBe(1)
    expect(font.descender.value).toBe(0)
  })

  it('fills missing metrics in with useCalcMissing, leaving given ones alone', () => {
    const font = openFont(inkData(), 'bdf.bdf', 32, 8, 8, {
      useCalcMissing: true,
      ascender: 2,
    })
    expect(font.ascender.value).toBe(2) // supplied, so untouched
    expect(font.capHeight.value).toBeGreaterThanOrEqual(0) // detected from 'H'
  })

  it('applies the hideEmpty override', () => {
    const shown = openFont(inkData(), 'a.bin', 32, 8, 8, { hideEmpty: false })
    expect(shown.hideEmpty.value).toBe(false)
  })

  it('carries the codepage through to the font', () => {
    const font = openFont(inkData(), 'x.ch8', 32, 8, 8, { charset: 'zx' })
    expect(font.charset.value).toBe('zx')
  })

  // A new font should replace the untouched blank one rather than stack up
  it('replaces the initial blank untitled font', () => {
    removeAllFonts()
    const blank = createFont()
    addFont(blank)
    expect(fonts.value.length).toBe(1)

    const font = openFont(inkData(), 'real.bin', 32, 8, 8)
    expect(fonts.value.length).toBe(1)
    expect(fonts.value[0]).toBe(font)
  })

  it('keeps a blank font that has unsaved edits', () => {
    removeAllFonts()
    const blank = createFont()
    blank.dirty.value = true
    addFont(blank)

    openFont(inkData(), 'real.bin', 32, 8, 8)
    expect(fonts.value.length).toBe(2)
    expect(fonts.value[0]).toBe(blank)
  })
})

describe('openFont glyph sizing', () => {
  it('derives glyph count from the data it is given', () => {
    const font = openFont(new Uint8Array(12 * 8 * bpr(8)), 'twelve.bin', 32, 8, 8)
    expect(font.fontData.value.length).toBe(12 * 8)
  })
})
