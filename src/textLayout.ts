// Text wrapping, cursor mapping, and glyph measurement for the preview renderer.

export interface WrapResult {
  lines: string[]
  offsets: number[][]  // offsets[row][col] = index into original text
}

// Wrap text into lines by character count (fixed-width mode).
export function wrapText(text: string, cols: number): WrapResult {
  const lines: string[] = []
  const offsets: number[][] = []
  let pos = 0
  for (const paragraph of text.split('\n')) {
    if (paragraph.length <= cols) {
      lines.push(paragraph)
      const lineOffsets: number[] = []
      for (let i = 0; i < paragraph.length; i++) lineOffsets.push(pos + i)
      offsets.push(lineOffsets)
      pos += paragraph.length + 1
      continue
    }
    let line = ''
    let lineOffsets: number[] = []
    let wordStart = pos
    for (const word of paragraph.split(' ')) {
      if (line.length === 0) {
        line = word
        lineOffsets = []
        for (let i = 0; i < word.length; i++) lineOffsets.push(wordStart + i)
      } else if (line.length + 1 + word.length <= cols) {
        lineOffsets.push(wordStart - 1)
        line += ' ' + word
        for (let i = 0; i < word.length; i++) lineOffsets.push(wordStart + i)
      } else {
        lines.push(line)
        offsets.push(lineOffsets)
        line = word
        lineOffsets = []
        for (let i = 0; i < word.length; i++) lineOffsets.push(wordStart + i)
      }
      wordStart += word.length + 1
    }
    if (line.length > 0) {
      lines.push(line)
      offsets.push(lineOffsets)
    }
    pos += paragraph.length + 1
  }
  return { lines, offsets }
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
  let pos = 0
  for (const paragraph of text.split('\n')) {
    if (paragraph.length === 0) {
      lines.push('')
      offsets.push([])
      pos += 1
      continue
    }
    let line = ''
    let lineOffsets: number[] = []
    let lineWidth = 0
    let wordStart = pos
    for (const word of paragraph.split(' ')) {
      let wordWidth = 0
      for (let i = 0; i < word.length; i++) wordWidth += charWidth(word[i])
      const spaceWidth = charWidth(' ')

      if (line.length === 0) {
        line = word
        lineOffsets = []
        lineWidth = wordWidth
        for (let i = 0; i < word.length; i++) lineOffsets.push(wordStart + i)
      } else if (lineWidth + spaceWidth + wordWidth <= maxWidth) {
        lineOffsets.push(wordStart - 1)
        line += ' ' + word
        lineWidth += spaceWidth + wordWidth
        for (let i = 0; i < word.length; i++) lineOffsets.push(wordStart + i)
      } else {
        lines.push(line)
        offsets.push(lineOffsets)
        line = word
        lineOffsets = []
        lineWidth = wordWidth
        for (let i = 0; i < word.length; i++) lineOffsets.push(wordStart + i)
      }
      wordStart += word.length + 1
    }
    if (line.length > 0) {
      lines.push(line)
      offsets.push(lineOffsets)
    }
    pos += paragraph.length + 1
  }
  return { lines, offsets }
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

// Find the leftmost and rightmost set pixel columns (0-7) in a glyph.
export function glyphBounds(data: Uint8Array, glyphIdx: number): { left: number; width: number } {
  const offset = glyphIdx * 8
  let minX = 8, maxX = -1
  for (let y = 0; y < 8; y++) {
    const byte = data[offset + y]
    for (let x = 0; x < 8; x++) {
      if (byte & (0x80 >> x)) {
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
  ch: string, data: Uint8Array, startChar: number, glyphCount: number, eWidth: number, gap: number,
): number {
  if (ch === ' ') return eWidth + gap
  const glyphIdx = ch.charCodeAt(0) - startChar
  if (glyphIdx >= 0 && glyphIdx < glyphCount) {
    return (glyphBounds(data, glyphIdx).width || 1) + gap
  }
  return 1 + gap
}
