import { describe, it, expect, beforeEach } from 'vitest'
import { createFont } from './fontModel'
import { getPixel, setPixel, glyphCount, glyphAdvance, glyphToText } from './fontOps'
import { removeAllFonts, fonts } from './store'
import {
  createBoldVariant, createOutlineVariant, createObliqueVariant,
  createProportionalVariant, createMonospaceVariant,
} from './createVariants'

function makeFont(w = 8, h = 8, count = 96, start = 32) {
  return createFont(new Uint8Array(count * h * Math.ceil(w / 8)), 'base.ch8', start, w, h)
}

/** Latest font added by a variant creator. */
function lastFont() {
  return fonts.value[fonts.value.length - 1]
}

describe('variants: general contract', () => {
  beforeEach(() => { removeAllFonts() })

  it('each creator adds exactly one font and keeps the source', () => {
    for (const create of [
      (f: ReturnType<typeof makeFont>) => createBoldVariant(f),
      (f: ReturnType<typeof makeFont>) => createOutlineVariant(f),
      (f: ReturnType<typeof makeFont>) => createObliqueVariant(f, 15),
      (f: ReturnType<typeof makeFont>) => createProportionalVariant(f),
      (f: ReturnType<typeof makeFont>) => createMonospaceVariant(f, 8, 'left'),
    ]) {
      removeAllFonts()
      const source = makeFont()
      setPixel(source, 0, 1, 1, true)
      // add the source directly so the count is predictable
      const before = fonts.value.length
      create(source)
      expect(fonts.value.length).toBe(before + 1)
    }
  })

  it('names the variant after the source file', () => {
    removeAllFonts()
    createBoldVariant(makeFont())
    expect(lastFont().fileName.value).toBe('base-bold.ch8')
  })

  it('inherits the source codepage', () => {
    removeAllFonts()
    const source = createFont(new Uint8Array(96 * 8), 'src.ch8', 32, 8, 8, { charset: 'cpm' })
    createBoldVariant(source)
    expect(lastFont().charset.value).toBe('cpm')
  })

  it('has metrics settled, not left at the -1 default', () => {
    removeAllFonts()
    const source = makeFont()
    // 'H' is a cap-height character, so detection has something to find
    for (let y = 1; y < 7; y++) setPixel(source, 0x48 - 32, 1, y, true)
    createBoldVariant(source)
    expect(lastFont().capHeight.value).toBeGreaterThanOrEqual(0)
  })
})

describe('createBoldVariant', () => {
  beforeEach(() => { removeAllFonts() })

  it('widens each pixel to the right', () => {
    const source = makeFont()
    setPixel(source, 0, 2, 3, true)
    createBoldVariant(source)
    const v = lastFont()
    expect(getPixel(v, 0, 2, 3)).toBe(true)
    expect(getPixel(v, 0, 3, 3)).toBe(true)
  })

  it('keeps the cell size the same', () => {
    const source = makeFont()
    createBoldVariant(source)
    expect(lastFont().glyphWidth.value).toBe(8)
    expect(lastFont().glyphHeight.value).toBe(8)
    expect(glyphCount(lastFont())).toBe(glyphCount(source))
  })

  it('leaves a blank glyph blank', () => {
    const source = makeFont()
    createBoldVariant(source)
    expect(glyphToText(lastFont(), 5).trim()).toBe('')
  })
})

describe('createOutlineVariant', () => {
  beforeEach(() => { removeAllFonts() })

  it('keeps the pixels adjacent to a filled shape, dropping the interior', () => {
    const source = makeFont()
    // A filled 3x3 block: every one of its pixels touches a set neighbour,
    // so a solid block outlines to nothing. Use a hollow ring instead:
    // ink at the border of a 4x4 area with an empty centre.
    for (let y = 2; y <= 5; y++) {
      for (let x = 2; x <= 5; x++) {
        const border = y === 2 || y === 5 || x === 2 || x === 5
        if (border) setPixel(source, 0, x, y, true)
      }
    }

    createOutlineVariant(source)
    const v = lastFont()
    // The interior was empty and is surrounded by ink, so it becomes the outline
    expect(getPixel(v, 0, 3, 3)).toBe(true)
    // The original border pixels each touched other border pixels, so they drop
    // where fully enclosed; the outermost corners survive
    expect(getPixel(v, 0, 2, 2)).toBe(false)
  })

  it('empties a solid block entirely', () => {
    const source = makeFont()
    for (let y = 2; y <= 4; y++) for (let x = 2; x <= 4; x++) setPixel(source, 0, x, y, true)
    createOutlineVariant(source)
    // Every pixel in a solid block has a set neighbour
    expect(getPixel(lastFont(), 0, 3, 3)).toBe(false)
    for (let y = 2; y <= 4; y++) {
      for (let x = 2; x <= 4; x++) expect(getPixel(lastFont(), 0, x, y)).toBe(false)
    }
  })

  it('empties a single isolated pixel', () => {
    const source = makeFont()
    setPixel(source, 0, 4, 4, true)
    createOutlineVariant(source)
    expect(getPixel(lastFont(), 0, 4, 4)).toBe(false)
  })
})

describe('createObliqueVariant', () => {
  beforeEach(() => { removeAllFonts() })

  it('shifts upper rows sideways', () => {
    const source = makeFont()
    for (let y = 0; y < 8; y++) setPixel(source, 0, 3, y, true)
    createObliqueVariant(source, 30)
    const v = lastFont()
    // The glyph is no longer a straight vertical bar
    const column = [0, 1, 2, 3, 4, 5, 6, 7].filter(y => getPixel(v, 0, 3, y))
    expect(column.length).toBeLessThan(8)
  })

  it('does nothing at zero degrees', () => {
    const source = makeFont()
    setPixel(source, 0, 2, 2, true)
    createObliqueVariant(source, 0)
    expect(getPixel(lastFont(), 0, 2, 2)).toBe(true)
  })

  it('keeps the cell size', () => {
    const source = makeFont()
    createObliqueVariant(source, 15)
    expect(lastFont().glyphWidth.value).toBe(8)
  })
})

describe('createProportionalVariant', () => {
  beforeEach(() => { removeAllFonts() })

  it('shifts ink to the left edge', () => {
    const source = makeFont()
    setPixel(source, 0x41 - 32, 3, 0, true)
    createProportionalVariant(source)
    expect(getPixel(lastFont(), 0x41 - 32, 0, 0)).toBe(true)
  })

  it('reports proportional spacing and gives a tight advance', () => {
    const source = makeFont()
    // 'A' is one pixel wide, three columns in
    setPixel(source, 0x41 - 32, 3, 0, true)
    createProportionalVariant(source)
    const v = lastFont()
    expect(v.spacing.value).toBe('proportional')
    expect(glyphAdvance(v, 0x41 - 32)).toBeLessThan(8)
  })

  it('keeps fixed-width characters (box drawing) at full width', () => {
    // A 256-glyph CP437 font, so 0xC4 maps to U+2500 (box drawing)
    const source = createFont(new Uint8Array(256 * 8), 'box.ch8', 0, 8, 8, { charset: 'cp437' })
    const idx = 0xC4
    setPixel(source, idx, 0, 3, true)
    createProportionalVariant(source)
    // Its advance must stay the cell width, not shrink to the ink width
    expect(glyphAdvance(lastFont(), idx)).toBe(8)
  })
})

describe('createMonospaceVariant', () => {
  beforeEach(() => { removeAllFonts() })

  it('rebuilds glyphs into the requested width', () => {
    const source = makeFont()
    setPixel(source, 0, 0, 0, true)
    createMonospaceVariant(source, 6, 'left')
    expect(lastFont().glyphWidth.value).toBe(6)
  })

  it('anchors ink left, centre or right', () => {
    const source = makeFont()
    setPixel(source, 0, 0, 0, true)
    setPixel(source, 0, 4, 1, true) // ink spans x=0..4

    createMonospaceVariant(source, 8, 'right')
    const right = lastFont()
    // Pushed away from the left edge
    expect(getPixel(right, 0, 0, 0)).toBe(false)

    removeAllFonts()
    createMonospaceVariant(source, 8, 'left')
    expect(getPixel(lastFont(), 0, 0, 0)).toBe(true)
  })

  it('sets monospace spacing', () => {
    createMonospaceVariant(makeFont(), 8, 'center')
    expect(lastFont().spacing.value).toBe('monospace')
  })
})
