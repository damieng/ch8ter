// Text wrapping, cursor mapping, and glyph measurement for the preview renderer.

import { getBit, bpr } from './bitUtils'

export const INVERSE_CHAR = '\x01'

export interface WrapResult {
  lines: string[]
  offsets: number[][]  // offsets[row][col] = index into original text
  attrs: number[][]    // 0 = normal, 1 = inverse
}

// Wrap text into lines by character count (fixed-width mode).
export function wrapText(text: string, cols: number): WrapResult {
  const lines: string[] = []
  const offsets: number[][] = []
  const attrs: number[][] = []
  let pos = 0
  let inverse = false
  for (const paragraph of text.split('\n')) {
    const tokens = paragraph.match(/\S+| +/g) || []
    let line = ''
    let lineOffsets: number[] = []
    let lineAttrs: number[] = []
    let tokenPos = pos

    for (const token of tokens) {
      if (token[0] === ' ') {
        for (let i = 0; i < token.length; i++) {
          lineOffsets.push(tokenPos + i)
          lineAttrs.push(inverse ? 1 : 0)
        }
        line += token
      } else {
        let visible = ''
        const wordOffsets: number[] = []
        const wordAttrs: number[] = []
        // One cell per code point: an astral character (two UTF-16 units) is one cell
        for (let i = 0; i < token.length;) {
          const ch = String.fromCodePoint(token.codePointAt(i)!)
          if (ch === INVERSE_CHAR) {
            inverse = !inverse
          } else {
            visible += ch
            wordOffsets.push(tokenPos + i)
            wordAttrs.push(inverse ? 1 : 0)
          }
          i += ch.length
        }
        if (lineOffsets.length + wordOffsets.length > cols && lineOffsets.length > 0) {
          lines.push(line)
          offsets.push(lineOffsets)
          attrs.push(lineAttrs)
          line = ''
          lineOffsets = []
          lineAttrs = []
        }
        lineOffsets.push(...wordOffsets)
        lineAttrs.push(...wordAttrs)
        line += visible
      }
      tokenPos += token.length
    }

    lines.push(line)
    offsets.push(lineOffsets)
    attrs.push(lineAttrs)
    pos += paragraph.length + 1
  }
  return { lines, offsets, attrs }
}

// Wrap text by pixel width (proportional mode).
// `charWidth` returns the pixel advance for a single character (including gap).
export function wrapTextProportional(
  text: string,
  maxWidth: number,
  charWidth: (ch: string) => number,
): WrapResult {
  const lines: string[] = []
  const offsets: number[][] = []
  const attrs: number[][] = []
  let pos = 0
  let inverse = false
  for (const paragraph of text.split('\n')) {
    const tokens = paragraph.match(/\S+| +/g) || []
    let line = ''
    let lineOffsets: number[] = []
    let lineAttrs: number[] = []
    let lineWidth = 0
    let tokenPos = pos

    for (const token of tokens) {
      if (token[0] === ' ') {
        let tokenWidth = 0
        for (let i = 0; i < token.length; i++) tokenWidth += charWidth(' ')
        for (let i = 0; i < token.length; i++) {
          lineOffsets.push(tokenPos + i)
          lineAttrs.push(inverse ? 1 : 0)
        }
        line += token
        lineWidth += tokenWidth
      } else {
        let visible = ''
        let visibleWidth = 0
        const wordOffsets: number[] = []
        const wordAttrs: number[] = []
        // One cell per code point: an astral character (two UTF-16 units) is one cell
        for (let i = 0; i < token.length;) {
          const ch = String.fromCodePoint(token.codePointAt(i)!)
          if (ch === INVERSE_CHAR) {
            inverse = !inverse
          } else {
            visible += ch
            visibleWidth += charWidth(ch)
            wordOffsets.push(tokenPos + i)
            wordAttrs.push(inverse ? 1 : 0)
          }
          i += ch.length
        }
        if (lineWidth + visibleWidth > maxWidth && lineOffsets.length > 0) {
          lines.push(line)
          offsets.push(lineOffsets)
          attrs.push(lineAttrs)
          line = ''
          lineOffsets = []
          lineAttrs = []
          lineWidth = 0
        }
        lineOffsets.push(...wordOffsets)
        lineAttrs.push(...wordAttrs)
        line += visible
        lineWidth += visibleWidth
      }
      tokenPos += token.length
    }

    lines.push(line)
    offsets.push(lineOffsets)
    attrs.push(lineAttrs)
    pos += paragraph.length + 1
  }
  return { lines, offsets, attrs }
}

// Map a text cursor offset to a row/col in wrapped lines.
export function cursorPosition(offsets: number[][], cursorOffset: number, textLen: number): { row: number; col: number } {
  if (cursorOffset >= textLen) {
    const lastRow = offsets.length - 1
    if (lastRow < 0) return { row: 0, col: 0 }
    return { row: lastRow, col: offsets[lastRow].length }
  }
  for (let row = 0; row < offsets.length; row++) {
    for (let col = 0; col < offsets[row].length; col++) {
      if (offsets[row][col] === cursorOffset) return { row, col }
    }
  }
  // Cursor is on a \n — place it at end of the preceding line
  for (let row = offsets.length - 1; row >= 0; row--) {
    if (offsets[row].length > 0 && offsets[row][offsets[row].length - 1] < cursorOffset) {
      return { row, col: offsets[row].length }
    }
  }
  return { row: 0, col: 0 }
}

// Build a set of "row,col" keys for all characters in a text selection range.
export function selectedCells(offsets: number[][], selStart: number, selEnd: number): Set<string> {
  const set = new Set<string>()
  if (selStart === selEnd) return set
  const lo = Math.min(selStart, selEnd)
  const hi = Math.max(selStart, selEnd)
  for (let row = 0; row < offsets.length; row++) {
    for (let col = 0; col < offsets[row].length; col++) {
      const o = offsets[row][col]
      if (o >= lo && o < hi) set.add(`${row},${col}`)
    }
  }
  return set
}

// Find the leftmost and rightmost set pixel columns in a glyph.
export function glyphBounds(data: Uint8Array, glyphIdx: number, w = 8, h = 8): { left: number; width: number } {
  const rowBytes = bpr(w)
  const bpg = h * rowBytes
  const offset = glyphIdx * bpg
  let minX = w, maxX = -1
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (getBit(data, offset + y * rowBytes, x)) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
      }
    }
  }
  if (maxX < 0) return { left: 0, width: 0 }
  return { left: minX, width: maxX - minX + 1 }
}

// Compute proportional character advance in raw pixels (width + gap).
export function propCharAdvance(
  ch: string, data: Uint8Array, startChar: number, glyphCount: number, eWidth: number, gap: number, w = 8, h = 8,
): number {
  if (ch === ' ') return eWidth + gap
  const glyphIdx = ch.charCodeAt(0) - startChar
  if (glyphIdx >= 0 && glyphIdx < glyphCount) {
    return (glyphBounds(data, glyphIdx, w, h).width || 1) + gap
  }
  return 1 + gap
}

/**
 * Characters treated as part of a word for double-click selection. Letters,
 * digits, underscore and apostrophe, so "don't" selects as one word.
 */
const WORD_CHAR = /[a-zA-Z0-9_']/

/** The word around `offset`, as a [start, end) text range. */
export function wordBounds(text: string, offset: number): [number, number] {
  let start = offset
  let end = offset
  while (start > 0 && WORD_CHAR.test(text[start - 1])) start--
  while (end < text.length && WORD_CHAR.test(text[end])) end++
  // Clicking a separator selects just that one character, so a double-click
  // always selects something visible
  if (start === end && offset < text.length) end = offset + 1
  return [start, end]
}

/** How to measure a character's width, for proportional hit testing. */
export type AdvanceOf = (ch: string) => number

/**
 * Map a click inside the rendered text to a text offset.
 *
 * Pure: the caller supplies the already-wrapped lines and their offsets, the
 * cell size, and (for proportional fonts) a way to measure each character.
 * Returns the offset of the character the click landed on, or the offset just
 * past the last character of the line when it lands beyond it.
 */
export function offsetAtPoint(
  opts: {
    /** Click position in canvas pixels, relative to the canvas origin. */
    x: number
    y: number
    /** Wrapped lines and their source offsets, as returned by wrapText. */
    lines: string[]
    offsets: number[][]
    /** Cell width in font pixels. */
    glyphWidth: number
    zoom: number
    /** Preview line height in font pixels. */
    lineHeight: number
    /** Character advance in font pixels; required for proportional fonts. */
    advanceOf?: AdvanceOf
    /** The preview text, used to find the offset when the click misses a line. */
    text: string
  },
): number {
  const { x, y, lines, offsets, glyphWidth, zoom, lineHeight, advanceOf, text } = opts
  if (lines.length === 0) return 0

  const rowH = lineHeight * zoom
  const clickRow = Math.floor(y / rowH)
  const row = Math.max(0, Math.min(clickRow, lines.length - 1))

  if (!advanceOf) {
    const clickCol = Math.floor(x / (glyphWidth * zoom))
    const rowOffsets = offsets[row] ?? []
    const col = Math.min(Math.max(0, clickCol), rowOffsets.length)
    if (col < rowOffsets.length) return rowOffsets[col]
    if (rowOffsets.length > 0) return rowOffsets[rowOffsets.length - 1] + 1
  } else {
    // One entry per code point, matching how the text is rendered
    const line = Array.from(lines[row])
    const rowOffsets = offsets[row] ?? []
    let xPos = 0
    for (let col = 0; col < line.length; col++) {
      const advance = advanceOf(line[col]) * zoom
      if (x < xPos + advance / 2) {
        if (col < rowOffsets.length) return rowOffsets[col]
        break
      }
      xPos += advance
    }
    if (rowOffsets.length > 0) return rowOffsets[rowOffsets.length - 1] + 1
  }

  // Fall back to the start of the requested line
  let offset = text.length
  let lineCount = 0
  for (let i = 0; i <= text.length; i++) {
    if (lineCount === row) { offset = i; break }
    if (text[i] === '\n') lineCount++
  }
  return offset
}
