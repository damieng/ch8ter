import { describe, it, expect } from 'vitest'
import {
  wrapText, wrapTextProportional, cursorPosition, selectedCells,
  glyphBounds, propCharAdvance, INVERSE_CHAR,
} from './textLayout'
import { setBit, bpr } from './bitUtils'

describe('wrapText (fixed width)', () => {
  it('keeps a short line whole', () => {
    expect(wrapText('hello', 10).lines).toEqual(['hello'])
  })

  it('wraps at spaces when a word does not fit', () => {
    // The separating space stays at the end of the line it was on
    expect(wrapText('hello world', 7).lines).toEqual(['hello ', 'world'])
  })

  it('does not break a word that is longer than the line', () => {
    // Words are never split; an over-long word occupies its own line
    expect(wrapText('abcdefghij', 3).lines).toEqual(['abcdefghij'])
  })

  it('starts a new line at an explicit newline', () => {
    expect(wrapText('a\nb', 10).lines).toEqual(['a', 'b'])
  })

  it('handles an empty string as one empty line', () => {
    const r = wrapText('', 10)
    expect(r.lines).toEqual([''])
    expect(r.offsets).toEqual([[]])
  })

  it('preserves consecutive spaces inside a line', () => {
    expect(wrapText('a  b', 10).lines).toEqual(['a  b'])
  })

  it('tracks the source offset of every cell', () => {
    const r = wrapText('ab cd', 10)
    expect(r.offsets[0]).toEqual([0, 1, 2, 3, 4])
  })

  it('keeps offsets correct across a wrap', () => {
    const { lines, offsets } = wrapText('ab cd', 3)
    expect(lines).toEqual(['ab ', 'cd'])
    expect(offsets[0]).toEqual([0, 1, 2])
    expect(offsets[1]).toEqual([3, 4])
  })

  it('counts an astral character as one cell but two code units', () => {
    const star = '\u{1FB00}'
    const { lines, offsets } = wrapText(`a${star}b`, 3)
    expect(lines).toEqual([`a${star}b`])
    expect(offsets[0]).toEqual([0, 1, 3]) // b starts after the surrogate pair
  })

  it('drops the inverse marker from the visible text and flags its cells', () => {
    const { lines, attrs } = wrapText(`ab${INVERSE_CHAR}cd`, 10)
    expect(lines).toEqual(['abcd'])
    expect(attrs[0]).toEqual([0, 0, 1, 1])
  })

  it('returns an attribute for every cell it returns', () => {
    const r = wrapText('one two three', 5)
    for (let i = 0; i < r.lines.length; i++) {
      expect(r.attrs[i].length).toBe(r.offsets[i].length)
      expect(r.attrs[i].length).toBe([...r.lines[i]].length)
    }
  })
})

describe('wrapTextProportional', () => {
  const fixed = (_ch: string) => 1

  it('wraps once the pixel width is exceeded', () => {
    expect(wrapTextProportional('aa bb', 3, fixed).lines).toEqual(['aa ', 'bb'])
  })

  it('uses the measured advance of each character', () => {
    // 'W' is wide, 'i' is narrow: 4 narrow letters fit where 2 wide ones do not
    const widths: Record<string, number> = { W: 4, i: 1, ' ': 1 }
    const measure = (ch: string) => widths[ch] ?? 1
    expect(wrapTextProportional('WW ii', 6, measure).lines).toEqual(['WW ', 'ii'])
  })

  it('measures an astral character once', () => {
    const seen: string[] = []
    wrapTextProportional('\u{1FB00}x', 100, ch => { seen.push(ch); return 1 })
    expect(seen).toEqual(['\u{1FB00}', 'x'])
  })

  it('keeps offsets aligned with the source', () => {
    const { lines, offsets } = wrapTextProportional('ab cd', 3, fixed)
    expect(lines).toEqual(['ab ', 'cd'])
    expect(offsets[1]).toEqual([3, 4])
  })

  it('handles empty text', () => {
    expect(wrapTextProportional('', 10, fixed).lines).toEqual([''])
  })
})

describe('cursorPosition', () => {
  const text = 'ab\ncd'
  const { offsets } = wrapText(text, 10)

  it('maps an offset to row and column', () => {
    expect(cursorPosition(offsets, 0, text.length)).toEqual({ row: 0, col: 0 })
    expect(cursorPosition(offsets, 1, text.length)).toEqual({ row: 0, col: 1 })
  })

  it('places a cursor at the end of the text on the last line', () => {
    expect(cursorPosition(offsets, text.length, text.length)).toEqual({ row: 1, col: 2 })
  })

  it('places a cursor sitting on a newline at the end of the line above', () => {
    expect(cursorPosition(offsets, 2, text.length)).toEqual({ row: 0, col: 2 })
  })

  it('handles empty offsets', () => {
    expect(cursorPosition([], 0, 0)).toEqual({ row: 0, col: 0 })
  })
})

describe('selectedCells', () => {
  const text = 'abcd'
  const { offsets } = wrapText(text, 10)

  it('returns nothing for an empty selection', () => {
    expect(selectedCells(offsets, 2, 2).size).toBe(0)
  })

  it('marks the cells in the range', () => {
    expect([...selectedCells(offsets, 1, 3)]).toEqual(['0,1', '0,2'])
  })

  it('works with a backwards selection', () => {
    expect([...selectedCells(offsets, 3, 1)]).toEqual(['0,1', '0,2'])
  })

  it('excludes the cell at the selection end', () => {
    expect(selectedCells(offsets, 0, 1).has('0,1')).toBe(false)
  })
})

describe('glyphBounds', () => {
  function makeData(w: number, h: number, count = 4) {
    return new Uint8Array(count * h * bpr(w))
  }
  const put = (data: Uint8Array, idx: number, x: number, y: number, w: number, h: number) => {
    setBit(data, idx * h * bpr(w) + y * bpr(w), x)
  }

  it('reports a zero-width bound for an empty glyph', () => {
    expect(glyphBounds(makeData(8, 8), 0)).toEqual({ left: 0, width: 0 })
  })

  it('finds the inked columns and their span', () => {
    const data = makeData(8, 8)
    put(data, 0, 2, 0, 8, 8)
    put(data, 0, 5, 7, 8, 8)
    expect(glyphBounds(data, 0, 8, 8)).toEqual({ left: 2, width: 4 })
  })

  it('measures the requested glyph, not the first', () => {
    const data = makeData(8, 8, 4)
    put(data, 1, 6, 3, 8, 8)
    expect(glyphBounds(data, 1, 8, 8)).toEqual({ left: 6, width: 1 })
    expect(glyphBounds(data, 0, 8, 8).width).toBe(0)
  })

  it('handles widths that are not a multiple of 8', () => {
    const data = makeData(12, 4)
    put(data, 0, 9, 1, 12, 4)
    expect(glyphBounds(data, 0, 12, 4)).toEqual({ left: 9, width: 1 })
  })
})

describe('propCharAdvance', () => {
  function makeData() {
    // 8x8 cells pack to 8 bytes per glyph; 'A' is glyph index 0x41-32
    const data = new Uint8Array(96 * 8)
    const base = (0x41 - 32) * 8
    setBit(data, base, 1) // 'A' has a pixel at x=1 on its first row
    setBit(data, base, 3) // and x=3
    return data
  }

  it('gives a space the full cell width plus gap', () => {
    expect(propCharAdvance(' ', makeData(), 32, 96, 6, 1)).toBe(7)
  })

  it('uses the ink width plus gap for a normal glyph', () => {
    // 'A' spans x=1..3 -> width 3, + 1 gap
    expect(propCharAdvance('A', makeData(), 32, 96, 6, 1)).toBe(4)
  })

  it('gives a blank glyph a minimum of one pixel', () => {
    expect(propCharAdvance('B', makeData(), 32, 96, 6, 1)).toBe(2)
  })

  it('gives unmapped characters a minimum width', () => {
    // A character outside the font's range
    expect(propCharAdvance('\u4e2d', makeData(), 32, 96, 6, 1)).toBe(2)
  })
})
