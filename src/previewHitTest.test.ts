// Tests for the two preview interactions that used to live inside PreviewPane:
// mapping a click to a text offset, and finding the word under a double-click.
//
// Both were pure arithmetic and string scanning buried in a component with no
// coverage. Extracted to textLayout so they can be checked without a canvas.

import { describe, it, expect } from 'vitest'
import { offsetAtPoint, wordBounds, wrapText } from './textLayout'

/** Monospace hit testing with 8px cells at zoom 1. */
function hitMonospace(text: string, cols: number, x: number, y: number): number {
  const { lines, offsets } = wrapText(text, cols)
  return offsetAtPoint({
    x, y,
    lines, offsets,
    glyphWidth: 8,
    zoom: 1,
    lineHeight: 8,
    text,
  })
}

describe('wordBounds', () => {
  it('selects the word around the offset', () => {
    const text = 'hello world'
    expect(wordBounds(text, 2)).toEqual([0, 5])
    expect(wordBounds(text, 0)).toEqual([0, 5])
    expect(wordBounds(text, 4)).toEqual([0, 5])
  })

  it('selects a word in the middle of a longer string', () => {
    expect(wordBounds('a big dog', 3)).toEqual([2, 5])
  })

  it('treats digits and underscore as word characters', () => {
    expect(wordBounds('x_1 y2', 1)).toEqual([0, 3])
    expect(wordBounds('say y2', 5)).toEqual([4, 6])
  })

  it('keeps an apostrophe inside a word', () => {
    const text = "don't stop"
    expect(wordBounds(text, 2)).toEqual([0, 5])
  })

  it('expands left into the preceding word when the offset is on a separator', () => {
    // Offset 1 is the space; `start` walks back over 'a', so the range is [0,1)
    expect(wordBounds('a b', 1)).toEqual([0, 1])
  })

  it('selects the trailing word when the offset is at the very end', () => {
    // `start` walks back over the whole word, so clicking just past "abc"
    // still selects it rather than returning an empty range
    expect(wordBounds('abc', 3)).toEqual([0, 3])
  })

  it('handles an empty string', () => {
    expect(wordBounds('', 0)).toEqual([0, 0])
  })

  it('selects the whole string when it is one word', () => {
    expect(wordBounds('word', 0)).toEqual([0, 4])
  })

  it('stops at newlines', () => {
    // '\n' is not a word character, so the range stays on one line
    const text = 'ab\ncd'
    expect(wordBounds(text, 1)).toEqual([0, 2])
    expect(wordBounds(text, 3)).toEqual([3, 5])
  })
})

describe('offsetAtPoint: monospace', () => {
  const text = 'abcd'

  it('maps the start of a character to its offset', () => {
    // cell k spans x = 8k .. 8k+7
    expect(hitMonospace(text, 10, 0, 0)).toBe(0)
    expect(hitMonospace(text, 10, 8, 0)).toBe(1)
    expect(hitMonospace(text, 10, 16, 0)).toBe(2)
  })

  it('maps anywhere inside a cell to that character', () => {
    for (let dx = 0; dx < 8; dx++) {
      expect(hitMonospace(text, 10, 8 + dx, 0), `dx=${dx}`).toBe(1)
    }
  })

  it('maps a click past the last character to the end of the line', () => {
    expect(hitMonospace(text, 10, 200, 0)).toBe(4)
  })

  it('maps a click before the first character to the start', () => {
    expect(hitMonospace(text, 10, -50, 0)).toBe(0)
  })

  it('selects the right row for a multi-line text', () => {
    const multi = 'ab\ncd'
    const { lines, offsets } = wrapText(multi, 10)
    const hit = (y: number) => offsetAtPoint({
      x: 0, y, lines, offsets, glyphWidth: 8, zoom: 1, lineHeight: 8, text: multi,
    })
    expect(hit(0)).toBe(0)   // first line, first char
    expect(hit(8)).toBe(3)   // second line, first char ('c' is index 3)
  })

  it('clamps a click below the last row to the last line', () => {
    const multi = 'ab\ncd'
    const { lines, offsets } = wrapText(multi, 10)
    expect(offsetAtPoint({
      x: 0, y: 9999, lines, offsets, glyphWidth: 8, zoom: 1, lineHeight: 8, text: multi,
    })).toBe(3)
  })

  it('accounts for zoom', () => {
    const { lines, offsets } = wrapText('abcd', 10)
    // At zoom 2 a cell is 16px wide, so x=16 is still the first character
    expect(offsetAtPoint({
      x: 16, y: 0, lines, offsets, glyphWidth: 8, zoom: 2, lineHeight: 8, text: 'abcd',
    })).toBe(1)
    expect(offsetAtPoint({
      x: 15, y: 0, lines, offsets, glyphWidth: 8, zoom: 2, lineHeight: 8, text: 'abcd',
    })).toBe(0)
  })

  it('returns 0 when there are no lines', () => {
    expect(offsetAtPoint({
      x: 0, y: 0, lines: [], offsets: [], glyphWidth: 8, zoom: 1, lineHeight: 8, text: '',
    })).toBe(0)
  })
})

describe('offsetAtPoint: proportional', () => {
  // 'W' is wide, 'i' is narrow
  const widths: Record<string, number> = { W: 10, i: 2 }
  const advanceOf = (ch: string) => widths[ch] ?? 8

  function hitProportional(text: string, cols: number, x: number) {
    const { lines, offsets } = wrapText(text, cols)
    return offsetAtPoint({
      x, y: 0, lines, offsets, glyphWidth: 8, zoom: 1, lineHeight: 8, advanceOf, text,
    })
  }

  it('uses each character width to decide the cell', () => {
    // 'W' spans 0..9, so x=4 is inside it and x=6 is past its midpoint (5)
    expect(hitProportional('Wi', 10, 0)).toBe(0)
    expect(hitProportional('Wi', 10, 4)).toBe(0)
    // Past the midpoint of 'W' -> next character
    expect(hitProportional('Wi', 10, 6)).toBe(1)
  })

  it('reaches the second character after the first one ends', () => {
    // 'W' is 10 wide, so 'i' starts at 10 and spans 10..11
    expect(hitProportional('Wi', 10, 10)).toBe(1)
  })

  it('maps a click past the line to the end of the line', () => {
    expect(hitProportional('Wi', 10, 500)).toBe(2)
  })

  it('handles a character whose measurer returns a wide advance', () => {
    // Only one character, so a click beyond it falls out of the loop and
    // returns the offset past the line rather than looping
    const { lines, offsets } = wrapText('W', 10)
    const hit = offsetAtPoint({
      x: 1000, y: 0, lines, offsets, glyphWidth: 8, zoom: 1, lineHeight: 8,
      advanceOf, text: 'W',
    })
    expect(hit).toBe(1)
  })
})

describe('offsetAtPoint: empty rows fall back to the line start', () => {
  it('returns the offset of the line start when a row has no cells', () => {
    // A blank line has no offsets, so neither branch can resolve the click and
    // the fallback walks the source text to find the line's start
    const text = 'ab\n\ncd'
    const { lines, offsets } = wrapText(text, 10)
    // Row 1 is the blank line
    expect(lines[1]).toBe('')
    const hit = offsetAtPoint({
      x: 0, y: 8, lines, offsets, glyphWidth: 8, zoom: 1, lineHeight: 8, text,
    })
    // Start of the blank line is index 3
    expect(hit).toBe(3)
  })

  it('falls back for a proportional font on a blank row too', () => {
    const text = 'ab\n\ncd'
    const { lines, offsets } = wrapText(text, 10)
    const hit = offsetAtPoint({
      x: 0, y: 8, lines, offsets, glyphWidth: 8, zoom: 1, lineHeight: 8,
      advanceOf: () => 8, text,
    })
    expect(hit).toBe(3)
  })

  it('returns the text length when the row is past every line', () => {
    const text = 'ab'
    const { lines, offsets } = wrapText(text, 10)
    // Clamped to the last row, which does have offsets, so the end is returned
    const hit = offsetAtPoint({
      x: 999, y: 999, lines, offsets, glyphWidth: 8, zoom: 1, lineHeight: 8, text,
    })
    expect(hit).toBe(2)
  })
})
