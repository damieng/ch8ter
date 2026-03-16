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
        for (let i = 0; i < token.length; i++) {
          if (token[i] === INVERSE_CHAR) {
            inverse = !inverse
          } else {
            visible += token[i]
            wordOffsets.push(tokenPos + i)
            wordAttrs.push(inverse ? 1 : 0)
          }
        }
        if (line.length + visible.length > cols && line.length > 0) {
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
        for (let i = 0; i < token.length; i++) {
          if (token[i] === INVERSE_CHAR) {
            inverse = !inverse
          } else {
            visible += token[i]
            visibleWidth += charWidth(token[i])
            wordOffsets.push(tokenPos + i)
            wordAttrs.push(inverse ? 1 : 0)
          }
        }
        if (lineWidth + visibleWidth > maxWidth && line.length > 0) {
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
