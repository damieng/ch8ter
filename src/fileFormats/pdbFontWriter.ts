// Write PalmOS .pdb bitmap font files (PDB container with NFNT font record).
//
// Produces a PDB with type/creator 'Font'/'Font' containing a single
// NFNT font record. See pdbFontParser.ts for format details.

import type { GlyphMeta, FontMeta } from './bdfParser'

export interface PdbFontWriteParams {
  fontData: Uint8Array
  glyphWidth: number
  glyphHeight: number
  startChar: number
  glyphCount: number
  glyphMeta: (GlyphMeta | null)[] | null
  baseline: number
  fontName?: string
  meta: FontMeta | null
}

export function writePdbFont(params: PdbFontWriteParams): Uint8Array {
  const {
    fontData, glyphWidth, glyphHeight, startChar, glyphCount,
    glyphMeta, baseline, fontName, meta,
  } = params

  const bpr = Math.ceil(glyphWidth / 8)
  const bpg = glyphHeight * bpr
  const firstChar = startChar
  const lastChar = startChar + glyphCount - 1
  const numChars = glyphCount
  const numEntries = numChars + 2 // +1 missing glyph, +1 sentinel

  // Determine per-glyph pixel widths and advance widths
  const glyphWidths: number[] = []
  const advanceWidths: number[] = []
  const isMissing: boolean[] = []

  for (let i = 0; i < numChars; i++) {
    const gm = glyphMeta?.[i]
    const advW = gm?.dwidth?.[0] ?? gm?.bbx?.[0] ?? glyphWidth

    // Check if glyph has any pixels
    let hasPixels = false
    const glyphBase = i * bpg
    for (let b = 0; b < bpg; b++) {
      if (fontData[glyphBase + b]) { hasPixels = true; break }
    }

    // A glyph is present if it has pixels OR has valid glyphMeta (blank glyphs
    // like tab, space, and PalmOS special chars are valid even without pixels)
    const hasEntry = gm !== null && gm !== undefined

    if (!hasPixels && !hasEntry) {
      glyphWidths.push(0)
      advanceWidths.push(0)
      isMissing.push(true)
    } else {
      // Use advance width as bitmap width to preserve trailing blank columns
      const pixW = Math.max(advW, 1)
      glyphWidths.push(pixW)
      advanceWidths.push(pixW)
      isMissing.push(false)
    }
  }

  // Build location table (cumulative x positions)
  const locs: number[] = []
  let xPos = 0
  for (let i = 0; i < numChars; i++) {
    locs.push(xPos)
    xPos += glyphWidths[i]
  }
  // Missing glyph entry (reuse first present glyph or empty)
  locs.push(xPos)
  // Sentinel
  locs.push(xPos)

  const totalBitmapWidth = xPos
  const rowWords = Math.ceil(totalBitmapWidth / 16)
  const rowBytes = rowWords * 2

  // Build single raster bitmap
  const bitmapSize = rowBytes * glyphHeight
  const bitmap = new Uint8Array(bitmapSize)

  for (let i = 0; i < numChars; i++) {
    if (isMissing[i]) continue
    const xStart = locs[i]
    const pixW = glyphWidths[i]
    const glyphBase = i * bpg

    for (let y = 0; y < glyphHeight; y++) {
      const srcRow = glyphBase + y * bpr
      const dstRowBase = y * rowBytes
      for (let px = 0; px < pixW; px++) {
        // Read from per-glyph format
        if (fontData[srcRow + (px >> 3)] & (0x80 >> (px & 7))) {
          // Write to raster
          const dx = xStart + px
          bitmap[dstRowBase + (dx >> 3)] |= (0x80 >> (dx & 7))
        }
      }
    }
  }

  // Build offset/width table
  const owtData = new Uint8Array(numEntries * 2)
  for (let i = 0; i < numChars; i++) {
    if (isMissing[i]) {
      owtData[i * 2] = 0xFF     // offset = -1 (signed)
      owtData[i * 2 + 1] = 0xFF // width = 0xFF
    } else {
      owtData[i * 2] = 0        // offset = 0 (no kern)
      owtData[i * 2 + 1] = advanceWidths[i] & 0xFF
    }
  }
  // Missing glyph and sentinel entries
  owtData[(numChars) * 2] = 0xFF
  owtData[(numChars) * 2 + 1] = 0xFF
  owtData[(numChars + 1) * 2] = 0xFF
  owtData[(numChars + 1) * 2 + 1] = 0xFF

  // Calculate sizes and owTLoc
  const fontHeaderSize = 26
  const locTableSize = numEntries * 2
  const owtTableSize = numEntries * 2
  const owtByteOffset = fontHeaderSize + bitmapSize + locTableSize
  // owTLoc = word offset from byte 16 of font record to owt table
  const owTLoc = (owtByteOffset - 16) / 2

  const fontRecordSize = fontHeaderSize + bitmapSize + locTableSize + owtTableSize

  // Calculate max width
  let maxW = 0
  for (let i = 0; i < numChars; i++) {
    if (!isMissing[i] && advanceWidths[i] > maxW) maxW = advanceWidths[i]
  }

  const ascent = baseline + 1
  const descent = glyphHeight - ascent

  // Build font record
  const fontRecord = new Uint8Array(fontRecordSize)
  const frv = new DataView(fontRecord.buffer)

  frv.setUint16(0, 0x9000, false) // fontType = NFNT
  frv.setInt16(2, firstChar, false)
  frv.setInt16(4, lastChar, false)
  frv.setInt16(6, maxW, false) // maxWidth
  frv.setInt16(8, 0, false) // kernMax
  frv.setInt16(10, 0, false) // nDescent
  frv.setInt16(12, maxW, false) // fRectWidth
  frv.setInt16(14, glyphHeight, false) // fRectHeight
  frv.setUint16(16, owTLoc, false)
  frv.setInt16(18, ascent, false)
  frv.setInt16(20, descent, false)
  frv.setInt16(22, 0, false) // leading
  frv.setInt16(24, rowWords, false)

  // Copy bitmap
  fontRecord.set(bitmap, fontHeaderSize)
  // Copy location table (big-endian u16)
  const locOff = fontHeaderSize + bitmapSize
  for (let i = 0; i < numEntries; i++)
    frv.setUint16(locOff + i * 2, locs[i], false)
  // Copy offset/width table
  fontRecord.set(owtData, owtByteOffset)

  // Build PDB container
  // Header: 78 bytes + 1 record entry (8 bytes) + 2 byte gap = 88 bytes before data
  const pdbHeaderSize = 78
  const recListSize = 1 * 8 // 1 record × 8 bytes
  const gapSize = 2
  const dataOffset = pdbHeaderSize + recListSize + gapSize

  const totalSize = dataOffset + fontRecordSize
  const pdb = new Uint8Array(totalSize)
  const pv = new DataView(pdb.buffer)

  // Database name (32 bytes, null-padded)
  const name = fontName || meta?.family || 'Font'
  for (let i = 0; i < Math.min(31, name.length); i++)
    pdb[i] = name.charCodeAt(i) & 0x7F

  // Attributes, version = 0
  // Dates: use Palm epoch offset (seconds from 1904-01-01)
  const now = Math.floor(Date.now() / 1000) + 2082844800 // Unix to Palm epoch
  pv.setUint32(36, now, false) // creation date
  pv.setUint32(40, now, false) // modification date

  // Type = 'Font', Creator = 'Font'
  pdb[60] = 0x46; pdb[61] = 0x6F; pdb[62] = 0x6E; pdb[63] = 0x74 // Font
  pdb[64] = 0x46; pdb[65] = 0x6F; pdb[66] = 0x6E; pdb[67] = 0x74 // Font

  // Number of records
  pv.setUint16(76, 1, false)

  // Record entry: offset, attrs, uid
  pv.setUint32(78, dataOffset, false)
  pdb[82] = 0x40 // attrs = dirty
  // uid = 0

  // 2-byte gap is already zeros

  // Copy font record
  pdb.set(fontRecord, dataOffset)

  return pdb
}
