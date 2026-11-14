import { describe, it, expect } from 'vitest'
import {
  glyphCount, getPixel, setPixel, glyphToText, glyphAdvance, setGlyphAdvance,
  isDirty, markDirty, saveFont, resizeFont, calcMissingMetrics, recalcMetrics,
  fontToConversionData,
} from './fontOps'
import { createFont } from './fontModel'
import { bpr } from './bitUtils'

/** Blank 8x8 font with `count` glyphs starting at `start`. */
function makeFont(count = 96, start = 32, w = 8, h = 8) {
  return createFont(new Uint8Array(count * h * bpr(w)), 'test.bin', start, w, h)
}

/** Blank font in test data. */
describe('isDirty / markDirty / saveFont', () => {
  it('starts clean, since the snapshot matches the data', () => {
    const f = makeFont()
    expect(isDirty(f)).toBe(false)
    // createFont seeds savedSnapshot from the initial data
    f.dirty.value = true // pretend something set it
    markDirty(f)
    expect(f.dirty.value).toBe(false)
  })

  it('reports dirty once a byte differs, and clean again after saving', () => {
    const f = makeFont()
    f.fontData.value = new Uint8Array(f.fontData.value)
    f.fontData.value[0] = 0xFF

    markDirty(f)
    expect(f.dirty.value).toBe(true)
    expect(isDirty(f)).toBe(true)

    saveFont(f)
    expect(f.dirty.value).toBe(false)
    expect(isDirty(f)).toBe(false)
  })

  it('treats a different length as dirty without comparing bytes', () => {
    const f = makeFont()
    f.fontData.value = new Uint8Array(2)
    expect(isDirty(f)).toBe(true)
  })

  it('saveFont snapshots a copy, so later edits do not alter it', () => {
    const f = makeFont()
    saveFont(f)
    const snapshot = f.savedSnapshot.value
    const before = snapshot[0]
    f.fontData.value = new Uint8Array(f.fontData.value)
    f.fontData.value[0] = before ^ 0xFF
    expect(f.savedSnapshot.value[0]).toBe(before)
  })
})

describe('pixel access', () => {
  it('reads back what it wrote at every position in a glyph', () => {
    const f = makeFont(4, 32, 8, 8)
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        setPixel(f, 2, x, y, true)
      }
    }
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        expect(getPixel(f, 2, x, y), `(${x},${y})`).toBe(true)
      }
    }
  })

  it('clears a pixel it previously set', () => {
    const f = makeFont()
    setPixel(f, 0, 3, 4, true)
    expect(getPixel(f, 0, 3, 4)).toBe(true)
    setPixel(f, 0, 3, 4, false)
    expect(getPixel(f, 0, 3, 4)).toBe(false)
  })

  it('keeps glyphs independent', () => {
    const f = makeFont(4)
    setPixel(f, 1, 0, 0, true)
    expect(getPixel(f, 0, 0, 0)).toBe(false)
    expect(getPixel(f, 2, 0, 0)).toBe(false)
  })

  it('works for widths that are not a multiple of 8', () => {
    const f = makeFont(2, 32, 12, 4)
    setPixel(f, 1, 9, 3, true)
    expect(getPixel(f, 1, 9, 3)).toBe(true)
    expect(getPixel(f, 1, 8, 3)).toBe(false)
  })

  it('bumps paintVersion rather than swapping the array', () => {
    const f = makeFont()
    const before = f.fontData.value
    const v = f.paintVersion.value
    setPixel(f, 0, 0, 0, true)
    expect(f.paintVersion.value).toBe(v + 1)
    expect(f.fontData.value).toBe(before) // mutated in place
  })
})

describe('glyphCount', () => {
  it('derives the count from the data length', () => {
    expect(glyphCount(makeFont(96))).toBe(96)
    expect(glyphCount(makeFont(12))).toBe(12)
  })

  it('is 0 when the font has no data', () => {
    expect(glyphCount(createFont(new Uint8Array(0), 'x', 32, 8, 8))).toBe(0)
  })
})

describe('glyphToText', () => {
  it('renders pixels as asterisks with one line per row', () => {
    const f = makeFont(1, 32, 4, 3)
    setPixel(f, 0, 0, 0, true)
    setPixel(f, 0, 3, 2, true)
    expect(glyphToText(f, 0)).toBe('*   \r\n    \r\n   *')
  })

  it('renders an empty glyph as blank rows', () => {
    const f = makeFont(1, 32, 3, 2)
    expect(glyphToText(f, 0)).toBe('   \r\n   ')
  })
})

describe('glyphAdvance', () => {
  it('always uses the cell width for monospace fonts', () => {
    const f = makeFont(4, 32, 8, 8)
    f.glyphMeta.value = [null, { dwidth: [3, 0] }, null, null]
    expect(glyphAdvance(f, 1)).toBe(8)
  })

  it('prefers per-glyph DWIDTH in proportional fonts', () => {
    const f = makeFont(4, 32, 8, 8)
    f.spacing.value = 'proportional'
    f.glyphMeta.value = [null, { dwidth: [3, 0] }, null, null]
    expect(glyphAdvance(f, 1)).toBe(3)
  })

  it('falls back to BBX width, then the cell width', () => {
    const f = makeFont(4, 32, 8, 8)
    f.spacing.value = 'proportional'
    f.glyphMeta.value = [null, { bbx: [5, 6, 0, 0] }, { dwidth: [0, 0] }, null]
    expect(glyphAdvance(f, 1)).toBe(5)
    expect(glyphAdvance(f, 2)).toBe(8) // dwidth 0 is not usable
    expect(glyphAdvance(f, 3)).toBe(8) // null metadata
  })

  it('falls back for out-of-range and negative indices', () => {
    const f = makeFont(4, 32, 8, 8)
    f.spacing.value = 'proportional'
    f.glyphMeta.value = [{ dwidth: [2, 0] }]
    expect(glyphAdvance(f, 99)).toBe(8)
    expect(glyphAdvance(f, -1)).toBe(8)
  })
})

describe('setGlyphAdvance', () => {
  it('writes DWIDTH and marks the font dirty', () => {
    const f = makeFont(4)
    setGlyphAdvance(f, 2, 6)
    expect(f.glyphMeta.value?.[2]?.dwidth).toEqual([6, 0])
    expect(f.dirty.value).toBe(true)
  })

  it('preserves other metrics on the same glyph', () => {
    const f = makeFont(4)
    f.glyphMeta.value = [null, null, { swidth: [8, 8], dwidth: [1, 0] }, null]
    setGlyphAdvance(f, 2, 9)
    expect(f.glyphMeta.value?.[2]?.swidth).toEqual([8, 8])
    expect(f.glyphMeta.value?.[2]?.dwidth).toEqual([9, 0])
  })

  it('creates the metadata array when the font has none', () => {
    const f = makeFont(3)
    setGlyphAdvance(f, 0, 4)
    expect(f.glyphMeta.value).toHaveLength(3)
    expect(f.glyphMeta.value?.[1]).toBeNull()
  })
})

describe('resizeFont', () => {
  it('does nothing when the size is unchanged', () => {
    const f = makeFont(2, 32, 8, 8)
    f.fontData.value[0] = 0xFF
    const before = f.fontData.value
    resizeFont(f, 8, 8, 'left', 'top')
    expect(f.fontData.value).toBe(before)
    expect(f.undoHistory.undo()).toBe(false)
  })

  it('keeps pixels anchored at the top-left, padding new space', () => {
    const f = makeFont(1, 32, 8, 8)
    setPixel(f, 0, 0, 0, true)
    setPixel(f, 0, 7, 7, true)
    resizeFont(f, 16, 16, 'left', 'top')
    expect(f.glyphWidth.value).toBe(16)
    expect(f.glyphHeight.value).toBe(16)
    expect(getPixel(f, 0, 0, 0)).toBe(true)
    expect(getPixel(f, 0, 7, 7)).toBe(true) // original position kept
  })

  it('crops pixels that fall outside a smaller font', () => {
    const f = makeFont(1, 32, 8, 8)
    setPixel(f, 0, 7, 7, true)
    setPixel(f, 0, 0, 0, true)
    resizeFont(f, 4, 4, 'left', 'top')
    expect(getPixel(f, 0, 0, 0)).toBe(true)
    expect(f.glyphHeight.value).toBe(4)
  })

  it('adjusts the baseline by the vertical offset', () => {
    const f = makeFont(1, 32, 8, 8)
    f.baseline.value = 6
    resizeFont(f, 8, 12, 'left', 'bottom') // dy = +4
    expect(f.baseline.value).toBe(10)
  })

  it('clamps the baseline into the new height', () => {
    const f = makeFont(1, 32, 8, 8)
    f.baseline.value = 7
    resizeFont(f, 8, 4, 'left', 'top') // dy = -4 => 3
    expect(f.baseline.value).toBe(3)
  })

  it('is undoable and redoable', () => {
    const f = makeFont(1, 32, 8, 8)
    setPixel(f, 0, 0, 0, true)
    resizeFont(f, 16, 16, 'center', 'center')

    expect(f.undoHistory.undo()).toBe(true)
    expect(f.glyphWidth.value).toBe(8)
    expect(f.glyphHeight.value).toBe(8)
    expect(getPixel(f, 0, 0, 0)).toBe(true)

    expect(f.undoHistory.redo()).toBe(true)
    expect(f.glyphWidth.value).toBe(16)
  })

  it('clears rotation buffers, whose indices assume the old size', () => {
    const f = makeFont(1, 32, 8, 8)
    f.glyphRotationLive.set(0, { data: new Uint8Array(8), w: 8, h: 8 })
    resizeFont(f, 16, 16, 'left', 'top')
    expect(f.glyphRotationLive.size).toBe(0)
  })
})

describe('metric detection', () => {
  /**
   * 8x8 font with ink in two reference glyphs: 'H' (a cap-height character)
   * and 'd' (an ascender character), each spanning rows 1..7.
   */
  function fontWithInk() {
    const f = makeFont(96)
    for (const ch of ['H', 'd']) {
      const idx = ch.charCodeAt(0) - 32
      for (let y = 1; y <= 7; y++) setPixel(f, idx, 0, y, true)
    }
    return f
  }

  it('recalcMetrics overwrites every metric from the glyphs', () => {
    const f = fontWithInk()
    f.ascender.value = 99
    f.capHeight.value = 99
    recalcMetrics(f)
    expect(f.capHeight.value).not.toBe(99)
    expect(f.ascender.value).toBeLessThanOrEqual(7)
  })

  it('calcMissingMetrics leaves values that are already set', () => {
    const f = fontWithInk()
    f.ascender.value = 5
    f.capHeight.value = 4
    calcMissingMetrics(f)
    expect(f.ascender.value).toBe(5)
    expect(f.capHeight.value).toBe(4)
  })

  it('calcMissingMetrics prefers BDF properties over detection', () => {
    const f = fontWithInk()
    f.meta.value = { properties: { CAP_HEIGHT: '6', X_HEIGHT: '3' } }
    calcMissingMetrics(f)
    expect(f.capHeight.value).toBe(6)
    expect(f.xHeight.value).toBe(3)
  })

  it('fills in metrics that can be detected from the glyphs', () => {
    const f = fontWithInk()
    for (const s of [f.ascender, f.capHeight, f.xHeight, f.numericHeight, f.descender]) {
      expect(s.value).toBe(-1)
    }
    calcMissingMetrics(f)
    // 'H' gives a cap height and 'd' an ascender; there are no digits or
    // descenders, so numericHeight and descender legitimately stay at -1.
    expect(f.capHeight.value).toBeGreaterThanOrEqual(0)
    expect(f.ascender.value).toBeGreaterThanOrEqual(0)
  })
})

describe('fontToConversionData', () => {
  it('copies the font out as plain data', () => {
    const f = makeFont(96, 32, 8, 8)
    f.fontName.value = 'My Font'
    setPixel(f, 0, 0, 0, true)
    const d = fontToConversionData(f)

    expect(d.glyphWidth).toBe(8)
    expect(d.glyphHeight).toBe(8)
    expect(d.startChar).toBe(32)
    expect(d.glyphCount).toBe(96)
    expect(d.fontName).toBe('My Font')
    expect(d.fontData).not.toBe(f.fontData.value) // a copy
  })

  it('falls back to a name derived from the file name', () => {
    const f = makeFont()
    f.fontName.value = ''
    f.fileName.value = 'my-cool-font.ch8'
    // baseName strips the directory and extension only
    expect(fontToConversionData(f).fontName).toBe('my-cool-font')
  })

  it('records this font\'s codepage, not a global one', () => {
    const a = createFont(new Uint8Array(8), 'a.bin', 32, 8, 8, { charset: 'cpm' })
    const b = createFont(new Uint8Array(8), 'b.bin', 32, 8, 8, { charset: 'cp850' })
    expect(fontToConversionData(a).detectedCharset).toBe('cpm')
    expect(fontToConversionData(b).detectedCharset).toBe('cp850')
  })

  it('omits metrics that are still at their default', () => {
    const f = makeFont()
    const d = fontToConversionData(f)
    expect(d.ascender).toBeUndefined()
    expect(d.descender).toBeUndefined()
  })

  it('includes metrics once they are set', () => {
    const f = makeFont()
    f.ascender.value = 7
    f.descender.value = 1
    const d = fontToConversionData(f)
    expect(d.ascender).toBe(7)
    expect(d.descender).toBe(1)
  })
})
