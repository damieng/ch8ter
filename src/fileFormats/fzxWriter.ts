// Write FZX proportional font files (ZX Spectrum).
//
// Each offset in the character table is relative to the position of that offset word itself.

import { bpr, getBit, setBit } from '../bitUtils'
import { isGlyphEmpty } from './glyphUtils'
import type { FontWriteData } from '../fontSave'

export function writeFzx(params: FontWriteData): Uint8Array {
  const { fontData, glyphWidth, glyphHeight, startChar, glyphCount, glyphMeta } = params
  const tracking = params.tracking ?? 0
  if (!Number.isInteger(tracking) || tracking < -128 || tracking > 127) {
    throw new Error('FZX tracking must be an integer from -128 to 127')
  }
  if (glyphWidth <= 0 || glyphWidth > 16) {
    throw new Error('FZX export supports glyph widths from 1 to 16 pixels')
  }
  if (glyphHeight <= 0 || glyphHeight > 255) {
    throw new Error('FZX export supports glyph heights from 1 to 255 pixels')
  }
  const rowBytes = bpr(glyphWidth)
  const bpg = glyphHeight * rowBytes

  // FZX only supports chars 32..255
  const firstSlot = Math.max(0, 32 - startChar)
  const lastPossible = Math.min(glyphCount - 1, 255 - startChar)

  // Find actual last populated char
  let lastSlot = firstSlot
  for (let i = lastPossible; i >= firstSlot; i--) {
    const offset = i * bpg
    if (!isGlyphEmpty(fontData, offset, bpg) || (startChar + i) === 32) {
      lastSlot = i
      break
    }
  }

  const lastChar = startChar + lastSlot
  const numChars = lastChar - 32 + 1

  // Build per-character data and info. Everything is derived from the pixel grid
  // plus the glyph's advance width, whatever format the glyph came from: bbx and
  // dwidth carry BDF meanings, so they can't be read back as FZX fields.
  const charData: Uint8Array[] = []
  const charInfo: { kern: number; shift: number; width: number }[] = []

  for (let i = 0; i < numChars; i++) {
    const slotIdx = (32 - startChar) + i
    if (slotIdx < 0 || slotIdx >= glyphCount) {
      charData.push(new Uint8Array(0))
      charInfo.push({ kern: 0, shift: 0, width: 1 })
      continue
    }

    const glyphOffset = slotIdx * bpg
    const meta = glyphMeta?.[slotIdx]

    // Ink bounds in the glyph grid
    let top = glyphHeight, bottom = -1, left = glyphWidth, right = -1
    for (let y = 0; y < glyphHeight; y++) {
      for (let x = 0; x < glyphWidth; x++) {
        if (getBit(fontData, glyphOffset + y * rowBytes, x)) {
          if (y < top) top = y
          if (y > bottom) bottom = y
          if (x < left) left = x
          if (x > right) right = x
        }
      }
    }
    const hasInk = bottom >= 0

    // FZX advance = kern + width + tracking. Honour the glyph's own advance when it
    // has one; otherwise the glyph occupies its full cell.
    const kernPlusWidth = meta?.dwidth ? meta.dwidth[0] - tracking : glyphWidth
    const kern = hasInk ? Math.min(3, left) : 0
    const inkExtent = hasInk ? right + 1 - kern : 0
    if (inkExtent > 16) {
      throw new Error('FZX export supports per-glyph widths from 1 to 16 pixels')
    }
    const width = Math.min(16, Math.max(1, kernPlusWidth - kern, inkExtent))

    if (!hasInk) {
      charData.push(new Uint8Array(0))
      charInfo.push({ kern: 0, shift: 0, width: Math.min(16, Math.max(1, kernPlusWidth)) })
      continue
    }

    // The vertical shift field is 4 bits. A glyph that starts lower than row 15 keeps
    // shift 15 and stores its leading blank rows as data, rather than being moved up
    const shift = Math.min(top, 15)
    const firstRow = shift
    const numRows = bottom - firstRow + 1

    // Row data: 1 byte per row for width<=8, else 2
    const charBytesPerRow = width <= 8 ? 1 : 2
    const data = new Uint8Array(numRows * charBytesPerRow)
    for (let row = 0; row < numRows; row++) {
      const y = firstRow + row
      for (let px = 0; px < width; px++) {
        const srcX = kern + px
        if (srcX >= glyphWidth) break
        if (getBit(fontData, glyphOffset + y * rowBytes, srcX)) {
          setBit(data, row * charBytesPerRow, px)
        }
      }
    }

    charData.push(data)
    charInfo.push({ kern, shift, width })
  }

  // Calculate file layout
  // Header: 3 bytes, table: numChars * 3 bytes, final word: 2 bytes, then data
  const tableStart = 3
  const finalWordPos = tableStart + numChars * 3
  const dataStart = finalWordPos + 2

  // Calculate total data size
  let totalDataSize = 0
  for (const d of charData) totalDataSize += d.length

  const totalSize = dataStart + totalDataSize
  const out = new Uint8Array(totalSize)

  // Header
  out[0] = glyphHeight
  out[1] = tracking & 0xFF
  out[2] = lastChar

  // Character table — each offset is relative to that entry's own position
  let dataPos = dataStart
  for (let i = 0; i < numChars; i++) {
    const entryPos = tableStart + i * 3
    const kern = charInfo[i].kern
    const relativeOffset = dataPos - entryPos
    if (relativeOffset > 0x3FFF) throw new Error('FZX font too large: character data offset exceeds 14-bit limit (16383 bytes)')
    const offsetWord = (kern << 14) | relativeOffset
    out[entryPos] = offsetWord & 0xFF
    out[entryPos + 1] = (offsetWord >> 8) & 0xFF
    out[entryPos + 2] = (charInfo[i].shift << 4) | (charInfo[i].width - 1)
    dataPos += charData[i].length
  }

  // Final word — relative to its own position
  const finalRelative = dataPos - finalWordPos
  out[finalWordPos] = finalRelative & 0xFF
  out[finalWordPos + 1] = (finalRelative >> 8) & 0xFF

  // Character data
  let writePos = dataStart
  for (let i = 0; i < numChars; i++) {
    out.set(charData[i], writePos)
    writePos += charData[i].length
  }

  return out
}
