// Parse Windows .fnt raster bitmap font files (v1, v2, v3).
//
// v1/v2 store bitmaps column-major (each column is ceil(h/8) bytes, left to right).
// v3 stores bitmaps row-major (each row is ceil(w/8) bytes, top to bottom).
// All multi-byte values are little-endian.
//
// v1 header: 117 bytes, 4-byte char table entries
// v2 header: 118 bytes, 4-byte char table entries (offsets are UInt16)
// v3 header: 148 bytes, 6-byte char table entries (offsets are UInt32)

import type { GlyphMeta, FontMeta } from './bdfParser'
import { getBit, setBit } from '../bitUtils'

export interface WindowsFntParseResult {
  fontData: Uint8Array
  startChar: number
  glyphWidth: number
  glyphHeight: number
  populated: Set<number>
  glyphMeta: (GlyphMeta | null)[]
  baseline: number
  meta: FontMeta
}

export function parseWindowsFnt(buffer: ArrayBuffer): WindowsFntParseResult {
  const view = new DataView(buffer)
  const bytes = new Uint8Array(buffer)

  const dfVersion = view.getUint16(0, true)
  if (dfVersion !== 0x0100 && dfVersion !== 0x0200 && dfVersion !== 0x0300) {
    throw new Error('Not a valid Windows FNT file')
  }

  const dfType = view.getUint16(66, true)
  if (dfType & 1) {
    throw new Error('Vector fonts are not supported — only raster bitmap .fnt files can be loaded')
  }

  const dfPixHeight = view.getUint16(88, true)
  const dfPixWidth = view.getUint16(86, true)
  const dfAscent = view.getUint16(74, true)
  const dfFirstChar = bytes[95]
  const dfLastChar = bytes[96]


  // Read metadata
  const copyright = readNullTermString(bytes, 6, 60)
  const dfFace = view.getUint32(105, true)
  const faceName = dfFace > 0 && dfFace < bytes.length
    ? readNullTermString(bytes, dfFace, bytes.length - dfFace)
    : ''
  const dfPoints = view.getUint16(68, true)
  const dfVertRes = view.getUint16(70, true)
  const dfHorizRes = view.getUint16(72, true)
  const dfWeight = view.getUint16(83, true)
  const dfCharSet = bytes[85]
  const dfPitchAndFamily = bytes[90]

  const meta: FontMeta = {
    format: `Windows FNT v${dfVersion >> 8}`,
    fontName: faceName || undefined,
    family: faceName || undefined,
    copyright: copyright || undefined,
    pointSize: dfPoints || undefined,
    xDpi: dfHorizRes || undefined,
    yDpi: dfVertRes || undefined,
    fontAscent: dfAscent,
    fontDescent: dfPixHeight - dfAscent,
    weight: dfWeight === 700 ? 'Bold' : dfWeight === 400 ? 'Medium' : dfWeight > 0 ? String(dfWeight) : undefined,
    properties: {},
  }

  if (dfCharSet !== undefined) meta.properties.CHARSET = String(dfCharSet)
  if (dfPitchAndFamily) meta.properties.PITCH_AND_FAMILY = String(dfPitchAndFamily)

  // Determine header size and char table entry size
  let headerSize: number
  let charEntrySize: number
  if (dfVersion === 0x0300) {
    headerSize = 148
    charEntrySize = 6 // width: u16, offset: u32
  } else {
    // v1 and v2
    headerSize = dfVersion === 0x0100 ? 117 : 118
    charEntrySize = 4 // width: u16, offset: u16
  }

  const numChars = dfLastChar - dfFirstChar + 1
  const charTableStart = headerSize

  // Read character table
  const charWidths: number[] = []
  const charOffsets: number[] = []
  for (let i = 0; i < numChars + 1; i++) { // +1 for sentinel
    const off = charTableStart + i * charEntrySize
    const width = view.getUint16(off, true)
    const bitmapOffset = charEntrySize === 6
      ? view.getUint32(off + 2, true)
      : view.getUint16(off + 2, true)
    charWidths.push(width)
    charOffsets.push(bitmapOffset)
  }

  // Determine max width for cell size
  let maxWidth = dfPixWidth || 0
  if (maxWidth === 0) {
    for (let i = 0; i < numChars; i++) {
      if (charWidths[i] > maxWidth) maxWidth = charWidths[i]
    }
  }
  if (maxWidth <= 0) maxWidth = 8

  const cellW = maxWidth
  const cellH = dfPixHeight
  const outBpr = Math.ceil(cellW / 8)
  const outBpg = cellH * outBpr

  const fontData = new Uint8Array(numChars * outBpg)
  const glyphMetaArr: (GlyphMeta | null)[] = new Array(numChars).fill(null)
  const populated = new Set<number>()

  for (let i = 0; i < numChars; i++) {
    const w = charWidths[i]
    const bitmapOff = charOffsets[i]

    if (w === 0 && (dfFirstChar + i) !== 0x20) continue

    const gm: GlyphMeta = { dwidth: [w, 0] }
    glyphMetaArr[i] = gm

    if (w === 0) {
      populated.add(i)
      continue
    }

    const base = i * outBpg
    let hasPixels = false

    if (dfVersion === 0x0300) {
      // v3: row-major, MSBit-first
      const srcBpr = Math.ceil(w / 8)
      for (let y = 0; y < cellH; y++) {
        const srcRow = bitmapOff + y * srcBpr
        if (srcRow + Math.ceil(w / 8) > bytes.length) continue
        for (let x = 0; x < w; x++) {
          if (getBit(bytes, srcRow, x)) {
            hasPixels = true
            setBit(fontData, base + y * outBpr, x)
          }
        }
      }
    } else {
      // v1/v2: column-major, MSBit-first
      // Each column is ceil(height/8) bytes, columns stored left to right
      const bytesPerCol = Math.ceil(cellH / 8)
      for (let x = 0; x < w; x++) {
        const colBase = bitmapOff + x * bytesPerCol
        if (colBase + bytesPerCol > bytes.length) continue
        for (let y = 0; y < cellH; y++) {
          if (getBit(bytes, colBase, y)) {
            hasPixels = true
            setBit(fontData, base + y * outBpr, x)
          }
        }
      }
    }

    if (hasPixels || (dfFirstChar + i) === 0x20) {
      populated.add(i)
    }
  }

  // Detect proportional spacing
  const isProportional = dfPixWidth === 0

  return {
    fontData,
    startChar: dfFirstChar,
    glyphWidth: cellW,
    glyphHeight: cellH,
    populated,
    glyphMeta: isProportional ? glyphMetaArr : glyphMetaArr.map(() => null),
    baseline: dfAscent,
    meta,
  }
}

/** Check if a buffer looks like a Windows FNT file (vs GDOS GEM). */
export function isWindowsFnt(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < 118) return false
  const view = new DataView(buffer)
  const version = view.getUint16(0, true)
  if (version !== 0x0100 && version !== 0x0200 && version !== 0x0300) return false
  const dfSize = view.getUint32(2, true)
  // dfSize should match or be close to the buffer length
  if (dfSize === buffer.byteLength) return true
  // For .fnt extracted from .fon, dfSize might not match the buffer exactly
  // but should be reasonable (not wildly off)
  if (dfSize > 0 && dfSize <= buffer.byteLength && dfSize > 100) return true
  return false
}

function readNullTermString(bytes: Uint8Array, offset: number, maxLen: number): string {
  let end = offset
  const limit = Math.min(offset + maxLen, bytes.length)
  while (end < limit && bytes[end] !== 0) end++
  return new TextDecoder('latin1').decode(bytes.subarray(offset, end))
}
