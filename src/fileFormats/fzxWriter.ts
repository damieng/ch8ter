// Write FZX proportional font files (ZX Spectrum).
//
// Each offset in the character table is relative to the position of that offset word itself.

import type { GlyphMeta } from './bdfParser'

interface FzxWriteParams {
  fontData: Uint8Array
  glyphWidth: number
  glyphHeight: number
  startChar: number
  glyphCount: number
  glyphMeta: (GlyphMeta | null)[] | null
}

function countTopAndBottomBlankRows(
  fontData: Uint8Array, glyphOffset: number, bpr: number,
  glyphWidth: number, glyphHeight: number
): [number, number] {
  let top = 0
  for (let y = 0; y < glyphHeight; y++) {
    let blank = true
    for (let x = 0; x < glyphWidth; x++) {
      if (fontData[glyphOffset + y * bpr + (x >> 3)] & (0x80 >> (x & 7))) {
        blank = false
        break
      }
    }
    if (!blank) break
    top++
  }

  let bottom = 0
  for (let y = glyphHeight - 1; y > top; y--) {
    let blank = true
    for (let x = 0; x < glyphWidth; x++) {
      if (fontData[glyphOffset + y * bpr + (x >> 3)] & (0x80 >> (x & 7))) {
        blank = false
        break
      }
    }
    if (!blank) break
    bottom++
  }

  return [top, bottom]
}

export function writeFzx(params: FzxWriteParams): Uint8Array {
  const { fontData, glyphWidth, glyphHeight, startChar, glyphCount, glyphMeta } = params
  const bpr = Math.ceil(glyphWidth / 8)
  const bpg = glyphHeight * bpr

  // FZX only supports chars 32..255
  const firstSlot = Math.max(0, 32 - startChar)
  const lastPossible = Math.min(glyphCount - 1, 255 - startChar)

  // Find actual last populated char
  let lastSlot = firstSlot
  for (let i = lastPossible; i >= firstSlot; i--) {
    const offset = i * bpg
    let hasPixels = false
    for (let b = 0; b < bpg; b++) {
      if (fontData[offset + b]) { hasPixels = true; break }
    }
    if (hasPixels || (startChar + i) === 32) {
      lastSlot = i
      break
    }
  }

  const lastChar = startChar + lastSlot
  const numChars = lastChar - 32 + 1

  // Build per-character data and info
  const charData: Uint8Array[] = []
  const charInfo: { shift: number; width: number }[] = []

  for (let i = 0; i < numChars; i++) {
    const slotIdx = (32 - startChar) + i
    if (slotIdx < 0 || slotIdx >= glyphCount) {
      charData.push(new Uint8Array(0))
      charInfo.push({ shift: 0, width: 1 })
      continue
    }

    const glyphOffset = slotIdx * bpg

    // Use stored FZX metadata if available
    const meta = glyphMeta?.[slotIdx]
    let shift: number, width: number, topBlank: number, bottomBlank: number

    if (meta?.bbx) {
      width = meta.bbx[0]
      shift = meta.bbx[3]
      const numRows = meta.bbx[1]
      topBlank = shift
      bottomBlank = glyphHeight - shift - numRows
    } else {
      // Auto-detect: trim blank rows, use full glyphWidth
      const [top, bottom] = countTopAndBottomBlankRows(fontData, glyphOffset, bpr, glyphWidth, glyphHeight)
      topBlank = top
      bottomBlank = bottom
      shift = topBlank === glyphHeight ? 0 : topBlank
      width = glyphWidth
    }

    const numRows = glyphHeight - topBlank - bottomBlank
    if (numRows <= 0) {
      charData.push(new Uint8Array(0))
      charInfo.push({ shift: 0, width: Math.min(width, 16) })
      continue
    }

    // Build row data (1 byte per row for width<=8)
    const charBytesPerRow = width <= 8 ? 1 : 2
    const data = new Uint8Array(numRows * charBytesPerRow)

    const srcXStart = meta?.bbx ? meta.bbx[2] : 0 // kern = left offset into grid
    for (let row = 0; row < numRows; row++) {
      const y = topBlank + row
      if (y >= glyphHeight) break
      for (let px = 0; px < width; px++) {
        const srcX = srcXStart + px
        if (srcX >= glyphWidth) break
        if (fontData[glyphOffset + y * bpr + (srcX >> 3)] & (0x80 >> (srcX & 7))) {
          data[row * charBytesPerRow + (px >> 3)] |= (0x80 >> (px & 7))
        }
      }
    }

    charData.push(data)
    charInfo.push({ shift: Math.min(shift, 15), width: Math.min(width, 16) })
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
  out[1] = 0 // tracking
  out[2] = lastChar

  // Character table — each offset is relative to that entry's own position
  let dataPos = dataStart
  for (let i = 0; i < numChars; i++) {
    const entryPos = tableStart + i * 3
    const relativeOffset = dataPos - entryPos
    out[entryPos] = relativeOffset & 0xFF
    out[entryPos + 1] = (relativeOffset >> 8) & 0xFF
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
