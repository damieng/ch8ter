// Write standalone Windows FNT v2 raster bitmap fonts.
//
// FNT stores each glyph column-by-column, with one byte per column row.
// Offsets in the character table are absolute file offsets.

import { bpr, getBit } from '../bitUtils'
import type { FontWriteData } from '../fontSave'

function writeString(bytes: Uint8Array, offset: number, length: number, value: string) {
  for (let i = 0; i < Math.min(length - 1, value.length); i++) {
    bytes[offset + i] = value.charCodeAt(i) & 0xFF
  }
}

function hasPixelsBeyondWidth(
  fontData: Uint8Array,
  glyphOffset: number,
  glyphWidth: number,
  glyphHeight: number,
  width: number,
): boolean {
  const sourceBpr = bpr(glyphWidth)
  for (let y = 0; y < glyphHeight; y++) {
    const row = glyphOffset + y * sourceBpr
    for (let x = width; x < glyphWidth; x++) {
      if (getBit(fontData, row, x)) return true
    }
  }
  return false
}

export function writeWindowsFnt(params: FontWriteData): Uint8Array {
  const {
    fontData, glyphWidth, glyphHeight, startChar, glyphCount,
    glyphMeta, baseline, fontName, meta,
  } = params

  if (glyphCount <= 0) throw new Error('Windows FNT export requires at least one glyph')
  if (startChar < 0 || startChar > 255 || startChar + glyphCount - 1 > 255) {
    throw new Error('Windows FNT export supports character codes from 0 to 255')
  }
  if (glyphWidth <= 0 || glyphHeight <= 0 || glyphHeight > 0xFFFF) {
    throw new Error('Windows FNT export requires positive dimensions')
  }

  const sourceBpr = bpr(glyphWidth)
  const bpg = glyphHeight * sourceBpr
  const widths: number[] = []
  const glyphBytes: Uint8Array[] = []
  let maxWidth = 0
  let totalBitmapSize = 0

  for (let i = 0; i < glyphCount; i++) {
    const advance = glyphMeta?.[i]?.dwidth?.[0]
    const width = advance == null ? glyphWidth : Math.round(advance)
    if (width < 0 || width > 0xFFFF) throw new Error('Windows FNT glyph widths must fit in 16 bits')
    if (width < glyphWidth && hasPixelsBeyondWidth(fontData, i * bpg, glyphWidth, glyphHeight, width)) {
      throw new Error(`Windows FNT glyph ${startChar + i} has pixels beyond its advance width`)
    }

    const byteColumns = bpr(width)
    const bytes = new Uint8Array(byteColumns * glyphHeight)
    const sourceOffset = i * bpg
    for (let column = 0; column < byteColumns; column++) {
      for (let y = 0; y < glyphHeight; y++) {
        let value = 0
        for (let bit = 0; bit < 8; bit++) {
          const x = column * 8 + bit
          if (x < width && x < glyphWidth && getBit(fontData, sourceOffset + y * sourceBpr, x)) {
            value |= 0x80 >> bit
          }
        }
        bytes[column * glyphHeight + y] = value
      }
    }

    widths.push(width)
    glyphBytes.push(bytes)
    maxWidth = Math.max(maxWidth, width)
    totalBitmapSize += bytes.length
  }

  const faceName = fontName || meta?.family || 'Font'
  const faceBytes = new TextEncoder().encode(faceName)
  const fixedWidth = widths.every(width => width === glyphWidth)
  const averageWidth = Math.round(widths.reduce((sum, width) => sum + width, 0) / widths.length)
  const properties = meta?.properties ?? {}
  const weight = meta?.weight?.toLowerCase() === 'bold' ? 700 : 400
  const charset = parseInt(properties.CHARSET ?? '1')
  const xDpi = meta?.xDpi ?? 96
  const yDpi = meta?.yDpi ?? 96

  // Layout: v2 (118-byte header, 4-byte char entries, u16 bitmap offsets)
  // falls back to v3 (148-byte header, 6-byte entries, u32 offsets) when the
  // bitmap would overflow the v2 64 KiB offset range.
  const v2FaceOffset = 118 + (glyphCount + 1) * 4 + totalBitmapSize
  const useV3 = v2FaceOffset > 0xFFFF

  let glyphBitmaps: Uint8Array[]
  let widthBytesField: number
  let headerSize: number
  let charEntrySize: number
  if (useV3) {
    // v3 glyphs share a uniform byte-column stride given by dfWidthBytes
    const stride = Math.max(1, bpr(maxWidth))
    glyphBitmaps = glyphBytes.map(bytes => {
      const columns = bytes.length / glyphHeight
      const out = new Uint8Array(stride * glyphHeight)
      for (let c = 0; c < columns; c++) {
        out.set(bytes.subarray(c * glyphHeight, (c + 1) * glyphHeight), c * glyphHeight)
      }
      return out
    })
    widthBytesField = stride
    headerSize = 148
    charEntrySize = 6 // width: u16, offset: u32
  } else {
    glyphBitmaps = glyphBytes
    widthBytesField = fixedWidth ? bpr(glyphWidth) : 0
    headerSize = 118
    charEntrySize = 4 // width: u16, offset: u16
  }

  const tableSize = (glyphCount + 1) * charEntrySize
  const bitsOffset = headerSize + tableSize
  const totalBitmapSize3 = glyphBitmaps.reduce((sum, b) => sum + b.length, 0)
  const faceOffset = bitsOffset + totalBitmapSize3
  const totalSize = faceOffset + faceBytes.length + 1
  if (totalSize > 0xFFFFFFFF || faceOffset > 0xFFFFFFFF) {
    throw new Error('Windows FNT export exceeds its offset limits')
  }

  const out = new Uint8Array(totalSize)
  const view = new DataView(out.buffer)

  view.setUint16(0, useV3 ? 0x0300 : 0x0200, true)
  view.setUint32(2, totalSize, true)
  writeString(out, 6, 60, meta?.copyright ?? '')
  view.setUint16(66, 0, true) // raster font
  view.setUint16(68, meta?.pointSize ?? glyphHeight, true)
  view.setUint16(70, yDpi, true)
  view.setUint16(72, xDpi, true)
  view.setUint16(74, Math.max(0, Math.min(glyphHeight, baseline)), true)
  view.setUint16(83, weight, true)
  out[85] = Number.isFinite(charset) ? charset & 0xFF : 1
  view.setUint16(86, fixedWidth ? glyphWidth : 0, true)
  view.setUint16(88, glyphHeight, true)
  out[90] = fixedWidth ? 0x31 : 0x32 // modern + fixed/proportional pitch
  view.setUint16(91, averageWidth, true)
  view.setUint16(93, maxWidth, true)
  out[95] = startChar
  out[96] = startChar + glyphCount - 1
  out[97] = 0 // default character relative index
  out[98] = Math.max(0, Math.min(glyphCount - 1, 32 - startChar))
  view.setUint16(99, widthBytesField, true)
  view.setUint32(105, faceOffset, true)
  view.setUint32(109, 0, true)
  view.setUint32(113, bitsOffset, true)

  let tablePos = headerSize
  let bitmapPos = bitsOffset
  for (let i = 0; i < glyphCount; i++) {
    view.setUint16(tablePos, widths[i], true)
    if (useV3) {
      view.setUint32(tablePos + 2, bitmapPos, true)
    } else {
      view.setUint16(tablePos + 2, bitmapPos, true)
    }
    tablePos += charEntrySize
    out.set(glyphBitmaps[i], bitmapPos)
    bitmapPos += glyphBitmaps[i].length
  }
  view.setUint16(tablePos, 0, true)
  if (useV3) {
    view.setUint32(tablePos + 2, bitmapPos, true)
  } else {
    view.setUint16(tablePos + 2, bitmapPos, true)
  }
  out.set(faceBytes, faceOffset)

  return out
}
