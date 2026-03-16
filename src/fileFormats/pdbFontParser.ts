// Parse PalmOS .pdb bitmap font files (PDB container with NFNT font record).
//
// PDB header (78 bytes, big-endian):
//   0-31:  Database name (null-terminated ASCII)
//   32-33: Attributes
//   34-35: Version
//   36-39: Creation date
//   40-43: Modification date
//   44-47: Last backup date
//   48-51: Modification number
//   52-55: AppInfo offset (0 if unused)
//   56-59: SortInfo offset (0 if unused)
//   60-63: Type ('Font')
//   64-67: Creator ('Font')
//   68-71: Unique ID seed
//   72-75: Next record list ID (0)
//   76-77: Number of records
//
// Record list: numRecords × 8 bytes each:
//   0-3: Record data offset (from file start)
//   4:   Record attributes
//   5-7: Unique ID
//
// 2-byte gap (zeros), then record data.
//
// Font record (NFNT/FontType, big-endian):
//   0-1:   fontType (0x9000 = NFNT)
//   2-3:   firstChar
//   4-5:   lastChar
//   6-7:   maxWidth
//   8-9:   kernMax
//   10-11: nDescent
//   12-13: fRectWidth (bitmap width in pixels)
//   14-15: fRectHeight (bitmap height = glyph height)
//   16-17: owTLoc (word offset from byte 16 to offset/width table)
//   18-19: ascent
//   20-21: descent
//   22-23: leading
//   24-25: rowWords (bitmap row width in 16-bit words)
//
// After header:
//   Bitmap:         rowWords * 2 * fRectHeight bytes
//   Location table: (numChars + 2) × UInt16 — x pixel of each glyph in bitmap
//   Offset/Width:   (numChars + 2) × {Int8 offset, UInt8 width}
//                   Missing glyphs: offset=-1 (0xFF), width=0xFF

import type { GlyphMeta, FontMeta } from './bdfParser'
import { setBit } from '../bitUtils'

export interface PdbFontParseResult {
  fontData: Uint8Array
  startChar: number
  glyphWidth: number
  glyphHeight: number
  populated: Set<number>
  glyphMeta: (GlyphMeta | null)[]
  baseline: number
  meta: FontMeta
}

export function parsePdbFont(buf: ArrayBuffer): PdbFontParseResult {
  const bytes = new Uint8Array(buf)
  if (bytes.length < 80)
    throw new Error('File too small to be a PDB file')

  const view = new DataView(buf)

  // Validate PDB type/creator
  const dbType = String.fromCharCode(...bytes.slice(60, 64))
  const creator = String.fromCharCode(...bytes.slice(64, 68))
  if (dbType !== 'Font' || creator !== 'Font')
    throw new Error(`Not a Palm font PDB (type='${dbType}', creator='${creator}')`)

  const dbName = String.fromCharCode(...bytes.slice(0, 32)).replace(/\0.*$/, '')
  const numRecords = view.getUint16(76, false)
  if (numRecords < 1)
    throw new Error('PDB contains no records')

  // Read first record entry
  const recOffset = view.getUint32(78, false)
  if (recOffset >= bytes.length)
    throw new Error('Record offset out of bounds')

  // Determine record size
  const recEnd = numRecords > 1 ? view.getUint32(86, false) : bytes.length
  const rec = bytes.subarray(recOffset, recEnd)
  const rv = new DataView(buf, recOffset, recEnd - recOffset)

  if (rec.length < 26)
    throw new Error('Font record too small')

  // Parse NFNT header
  const fontType    = rv.getUint16(0, false)
  const firstChar   = rv.getInt16(2, false)
  const lastChar    = rv.getInt16(4, false)
  const maxWidth    = rv.getInt16(6, false)
  const kernMax     = rv.getInt16(8, false)
  const nDescent    = rv.getInt16(10, false)
  const fRectWidth  = rv.getInt16(12, false)
  const fRectHeight = rv.getInt16(14, false)
  const owTLoc      = rv.getUint16(16, false)
  const ascent      = rv.getInt16(18, false)
  const descent     = rv.getInt16(20, false)
  const leading     = rv.getInt16(22, false)
  const rowWords    = rv.getInt16(24, false)

  if (fRectHeight <= 0 || fRectHeight > 128)
    throw new Error(`Invalid font height: ${fRectHeight}`)
  if (firstChar < 0)
    throw new Error(`Invalid firstChar: ${firstChar}`)
  if (lastChar < firstChar)
    throw new Error('lastChar < firstChar')
  if (rowWords <= 0)
    throw new Error(`Invalid rowWords: ${rowWords}`)

  const numChars = lastChar - firstChar + 1
  const numEntries = numChars + 2 // +1 missing glyph, +1 sentinel

  // Layout within the record
  const bitmapStart = 26
  const bitmapSize = rowWords * 2 * fRectHeight
  const locTableStart = bitmapStart + bitmapSize
  const owtOffset = 16 + owTLoc * 2

  // Read location table
  if (locTableStart + numEntries * 2 > rec.length)
    throw new Error('Location table out of bounds')

  const locs: number[] = []
  for (let i = 0; i < numEntries; i++)
    locs.push(rv.getUint16(locTableStart + i * 2, false))

  // Read offset/width table
  if (owtOffset + numEntries * 2 > rec.length)
    throw new Error('Offset/width table out of bounds')

  const owts: Array<{ off: number; wid: number }> = []
  for (let i = 0; i < numEntries; i++) {
    const raw = rv.getUint16(owtOffset + i * 2, false)
    const off = (raw >> 8) & 0xFF
    const wid = raw & 0xFF
    owts.push({ off: off >= 128 ? off - 256 : off, wid })
  }

  // Find max glyph width for cell sizing
  let cellWidth = 0
  for (let i = 0; i < numChars; i++) {
    if (owts[i].off === -1 && owts[i].wid === 255) continue
    const glyphW = locs[i + 1] - locs[i]
    if (glyphW > cellWidth) cellWidth = glyphW
    if (owts[i].wid > cellWidth) cellWidth = owts[i].wid
  }
  if (cellWidth <= 0) cellWidth = maxWidth > 0 ? maxWidth : 8

  // Extract glyphs from single raster into per-glyph format
  const bpr = Math.ceil(cellWidth / 8)
  const bpg = fRectHeight * bpr
  const fontData = new Uint8Array(numChars * bpg)
  const populated = new Set<number>()
  const glyphMeta: (GlyphMeta | null)[] = new Array(numChars).fill(null)
  const rowBytes = rowWords * 2

  for (let i = 0; i < numChars; i++) {
    if (owts[i].off === -1 && owts[i].wid === 255) continue

    const xStart = locs[i]
    const glyphW = locs[i + 1] - xStart
    if (glyphW <= 0) continue

    const advanceWidth = owts[i].wid
    let hasPixels = false
    const glyphBase = i * bpg

    for (let y = 0; y < fRectHeight; y++) {
      const srcRowBase = bitmapStart + y * rowBytes
      const dstRow = glyphBase + y * bpr
      for (let px = 0; px < glyphW; px++) {
        const sx = xStart + px
        const srcByte = rec[srcRowBase + (sx >> 3)]
        if (srcByte & (0x80 >> (sx & 7))) {
          setBit(fontData, dstRow, px)
          hasPixels = true
        }
      }
    }

    if (hasPixels) populated.add(i)

    glyphMeta[i] = {
      bbx: [glyphW, fRectHeight, 0, 0],
      dwidth: [advanceWidth, 0],
    }
  }

  return {
    fontData,
    startChar: firstChar,
    glyphWidth: cellWidth,
    glyphHeight: fRectHeight,
    populated,
    glyphMeta,
    baseline: ascent > 0 ? ascent - 1 : 0,
    meta: {
      format: `Palm NFNT (0x${fontType.toString(16)})`,
      family: dbName || undefined,
      fontAscent: ascent,
      fontDescent: descent,
      properties: {
        PALM_FONT_TYPE: fontType.toString(),
        PALM_KERN_MAX: String(kernMax),
        PALM_N_DESCENT: String(nDescent),
        PALM_LEADING: String(leading),
        PALM_MAX_WIDTH: String(maxWidth),
        PALM_FRECT_WIDTH: String(fRectWidth),
      },
    },
  }
}
