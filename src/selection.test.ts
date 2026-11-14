import { describe, it, expect } from 'vitest'
import { createFont } from './fontModel'
import { glyphCount } from './fontOps'
import {
  selectGlyph, selectNumbers, selectUppercase, selectLowercase,
  selectAll, selectNone, invertSelection, selectSymbols,
} from './selection'

function makeFont(count = 96, start = 32) {
  return createFont(new Uint8Array(count * 8), 'test.bin', start, 8, 8)
}

/** Glyph indices whose character code falls in [from, to]. */
function chars(font: ReturnType<typeof makeFont>): number[] {
  const s = font.startChar.value
  return [...font.selectedGlyphs.value].map(i => s + i).sort((a, b) => a - b)
}

describe('selectGlyph', () => {
  it('replaces the selection on a plain click', () => {
    const f = makeFont()
    selectGlyph(f, 5, false, false)
    expect([...f.selectedGlyphs.value]).toEqual([5])
    expect(f.lastClickedGlyph.value).toBe(5)

    selectGlyph(f, 9, false, false)
    expect([...f.selectedGlyphs.value]).toEqual([9])
  })

  it('extends a range on shift-click, anchored at the last click', () => {
    const f = makeFont()
    selectGlyph(f, 3, false, false)
    selectGlyph(f, 7, true, false)
    expect([...f.selectedGlyphs.value].sort((a, b) => a - b)).toEqual([3, 4, 5, 6, 7])
  })

  it('extends a range backwards too', () => {
    const f = makeFont()
    selectGlyph(f, 7, false, false)
    selectGlyph(f, 3, true, false)
    expect([...f.selectedGlyphs.value].sort((a, b) => a - b)).toEqual([3, 4, 5, 6, 7])
  })

  it('toggles a glyph on ctrl-click', () => {
    const f = makeFont()
    selectGlyph(f, 1, false, false)
    selectGlyph(f, 2, false, true)
    expect([...f.selectedGlyphs.value].sort((a, b) => a - b)).toEqual([1, 2])

    selectGlyph(f, 1, false, true)
    expect([...f.selectedGlyphs.value]).toEqual([2])
  })

  it('never leaves the selection empty when ctrl-clicking the last glyph', () => {
    const f = makeFont()
    selectGlyph(f, 4, false, false)
    selectGlyph(f, 4, false, true)
    expect([...f.selectedGlyphs.value]).toEqual([4])
  })

  it('ignores out-of-range indices', () => {
    const f = makeFont(10)
    selectGlyph(f, 3, false, false)
    selectGlyph(f, -1, false, false)
    expect(f.lastClickedGlyph.value).toBe(3)
    selectGlyph(f, 10, false, false)
    expect(f.lastClickedGlyph.value).toBe(3)
  })
})

describe('select by class', () => {
  it('selects digits, only those the font actually has', () => {
    const f = makeFont(96, 32)
    selectNumbers(f)
    expect(chars(f)).toEqual([48, 49, 50, 51, 52, 53, 54, 55, 56, 57])
    expect(f.lastClickedGlyph.value).toBe(48 - 32)
  })

  it('selects uppercase letters', () => {
    const f = makeFont(96, 32)
    selectUppercase(f)
    expect(chars(f)).toEqual(Array.from({ length: 26 }, (_, i) => 65 + i))
  })

  it('selects lowercase letters', () => {
    const f = makeFont(96, 32)
    selectLowercase(f)
    expect(chars(f)).toEqual(Array.from({ length: 26 }, (_, i) => 97 + i))
  })

  it('skips characters outside the font\'s range without offsetting the rest', () => {
    // Font starts at 'A', so 48..57 are all before it
    const f = makeFont(26, 65)
    selectNumbers(f)
    expect(f.selectedGlyphs.value.size).toBe(0)
    // lastClickedGlyph must not become negative
    expect(f.lastClickedGlyph.value).toBe(0)
  })

  it('selects only the overlap when the font covers part of a range', () => {
    // Start at '0' so digits 48..57 are present, letters are not
    const f = makeFont(10, 48)
    selectUppercase(f)
    expect(f.selectedGlyphs.value.size).toBe(0)
  })
})

describe('selectAll / selectNone / invertSelection', () => {
  it('selects every glyph', () => {
    const f = makeFont(12)
    selectAll(f)
    expect(f.selectedGlyphs.value.size).toBe(12)
    expect(f.lastClickedGlyph.value).toBe(0)
  })

  it('clears the selection', () => {
    const f = makeFont(12)
    selectAll(f)
    selectNone(f)
    expect(f.selectedGlyphs.value.size).toBe(0)
  })

  it('inverts the selection', () => {
    const f = makeFont(5)
    selectGlyph(f, 1, false, false)
    selectGlyph(f, 3, false, true)
    invertSelection(f)
    expect([...f.selectedGlyphs.value].sort((a, b) => a - b)).toEqual([0, 2, 4])
  })

  it('inverts an empty selection to everything', () => {
    const f = makeFont(4)
    selectNone(f)
    invertSelection(f)
    expect(f.selectedGlyphs.value.size).toBe(4)
  })
})

describe('selectSymbols', () => {
  it('picks punctuation and symbols but not letters, digits or space', () => {
    const f = makeFont(96, 32)
    selectSymbols(f)
    const picked = chars(f)
    // '!' through '/' are symbols; '0'-'9' are not
    expect(picked).toContain(33)
    expect(picked).toContain(47)
    expect(picked).not.toContain(48)
    expect(picked).not.toContain(65)
    expect(picked).not.toContain(97)
    expect(picked).not.toContain(32)
  })

  it('leaves the selection alone when the font has no symbols', () => {
    // A font of only digits and letters
    const f = makeFont(10, 48)
    selectAll(f)
    const before = f.selectedGlyphs.value
    selectSymbols(f)
    expect(f.selectedGlyphs.value).toBe(before)
  })

  it('moves the anchor to the lowest selected symbol', () => {
    const f = makeFont(96, 32)
    selectSymbols(f)
    expect(f.lastClickedGlyph.value).toBe(Math.min(...f.selectedGlyphs.value))
  })

  it('ignores control codes below 33', () => {
    const f = makeFont(32, 0) // 0..31
    selectNone(f) // createFont seeds {0}, so start from a known state
    selectSymbols(f)
    expect(f.selectedGlyphs.value.size).toBe(0)
  })
})

describe('selection assumptions', () => {
  it('selectAll covers exactly the glyphs the font has', () => {
    const f = makeFont(7, 32)
    selectAll(f)
    expect(f.selectedGlyphs.value.size).toBe(glyphCount(f))
    // and every index is in range
    for (const i of f.selectedGlyphs.value) {
      expect(i).toBeGreaterThanOrEqual(0)
      expect(i).toBeLessThan(glyphCount(f))
    }
  })
})
