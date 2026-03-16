// Parse FZX proportional font files (ZX Spectrum).
//
// Format:
//   Header (3 bytes): height, tracking, lastchar
//   Char table: (lastchar - 32 + 1) entries of 3 bytes each + final 2-byte offset
//     - offset (2 bytes LE, top 2 bits = kern) RELATIVE TO the offset word's own position
//     - shift_width (1 byte): (shift << 4) | (width - 1)
//   Char definitions: variable-length bitmap rows (1 byte/row for width<=8, 2 for 9-16)

import type { GlyphMeta } from './bdfParser'
import { getBit, setBit } from '../bitUtils'

export interface FzxParseResult {
  fontData: Uint8Array
  startChar: number
  glyphWidth: number
  glyphHeight: number
  populated: Set<number>
  glyphMeta: (GlyphMeta | null)[]
  tracking: number
}

export function parseFzx(buf: ArrayBuffer): FzxParseResult {
  const bytes = new Uint8Array(buf)
  if (bytes.length < 5) throw new Error('File too small to be an FZX font')

  const height = bytes[0]
  const tracking = bytes[1]
  const lastChar = bytes[2]

  if (height === 0) throw new Error('FZX font has zero height')
  if (lastChar < 32) throw new Error('FZX lastChar must be >= 32')

  const numChars = lastChar - 32 + 1
  const tableEnd = 3 + numChars * 3 + 2 // header + entries + final word

  if (bytes.length < tableEnd)
    throw new Error('FZX file truncated in character table')

  // Parse character table — each entry's offset is relative to that entry's position
  const chars: { absDataPos: number; kern: number; shift: number; width: number }[] = []

  for (let i = 0; i < numChars; i++) {
    const entryPos = 3 + i * 3
    const rawOffset = bytes[entryPos] | (bytes[entryPos + 1] << 8)
    const kern = (rawOffset >> 14) & 3
    const offset = rawOffset & 0x3FFF
    const sw = bytes[entryPos + 2]
    const shift = (sw >> 4) & 0x0F
    const width = (sw & 0x0F) + 1

    chars.push({ absDataPos: entryPos + offset, kern, shift, width })
  }

  // Final word — offset relative to its own position
  const finalPos = 3 + numChars * 3
  const finalRaw = bytes[finalPos] | (bytes[finalPos + 1] << 8)
  const absEndPos = finalPos + (finalRaw & 0x3FFF)

  // Find max width across all characters for the fixed-width grid
  let maxWidth = 0
  for (const c of chars) {
    const totalWidth = c.kern + c.width
    if (totalWidth > maxWidth) maxWidth = totalWidth
  }
  if (maxWidth === 0) maxWidth = 8

  // Build font data
  const bpr = Math.ceil(maxWidth / 8)
  const bpg = height * bpr
  const fontData = new Uint8Array(numChars * bpg)
  const populated = new Set<number>()
  const glyphMeta: (GlyphMeta | null)[] = new Array(numChars).fill(null)

  for (let i = 0; i < numChars; i++) {
    const c = chars[i]
    const nextAbsPos = i < numChars - 1 ? chars[i + 1].absDataPos : absEndPos
    const dataLen = nextAbsPos - c.absDataPos

    if (dataLen <= 0) continue

    const charBytesPerRow = c.width <= 8 ? 1 : 2
    const numRows = Math.floor(dataLen / charBytesPerRow)
    if (numRows === 0) continue

    populated.add(i)
    const glyphOffset = i * bpg

    // Store per-glyph metadata: bbx = [width, numRows, kern, shift]
    glyphMeta[i] = {
      bbx: [c.width, numRows, c.kern, c.shift],
      dwidth: [c.kern + c.width + tracking, 0],
    }

    // Copy bitmap rows into the fixed-width grid
    for (let row = 0; row < numRows && (c.shift + row) < height; row++) {
      const srcPos = c.absDataPos + row * charBytesPerRow
      if (srcPos + charBytesPerRow > bytes.length) break

      const y = c.shift + row
      const dstRowStart = glyphOffset + y * bpr

      // Read source pixels (MSB = leftmost)
      for (let px = 0; px < c.width; px++) {
        if (getBit(bytes, srcPos, px)) {
          setBit(fontData, dstRowStart, c.kern + px)
        }
      }
    }
  }

  return {
    fontData,
    startChar: 32,
    glyphWidth: maxWidth,
    glyphHeight: height,
    populated,
    glyphMeta,
    tracking,
  }
}
