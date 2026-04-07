// Parse TTF/OTF embedded bitmap fonts (EBLC/EBDT or Apple bloc/bdat tables).
// Reads the cmap table for glyph ID → Unicode mapping, then extracts 1-bit
// bitmap strikes from the EBLC index and EBDT data tables.

import type { FontMeta, GlyphMeta } from './bdfParser'
import { bpr, setBit } from '../bitUtils'

export interface SbitStrike {
  fontData: Uint8Array
  glyphWidth: number
  glyphHeight: number
  startChar: number
  glyphMeta: (GlyphMeta | null)[]
  baseline: number
  meta: FontMeta
  populated: Set<number>
  ppemX: number
  ppemY: number
  spacingMode: 'monospace' | 'proportional'
}

export interface SbitParseResult {
  strikes: SbitStrike[]
  fontName: string
}

// --- TTF table directory ---

interface TableEntry { offset: number; length: number }

function readTableDirectory(view: DataView, bytes: Uint8Array): Map<string, TableEntry> {
  const sfnt = view.getUint32(0)
  if (sfnt !== 0x00010000 && sfnt !== 0x4F54544F)
    throw new Error('Not a valid TTF/OTF file')

  const numTables = view.getUint16(4)
  const tables = new Map<string, TableEntry>()
  for (let i = 0; i < numTables; i++) {
    const off = 12 + i * 16
    if (off + 16 > bytes.length) break
    const tag = String.fromCharCode(bytes[off], bytes[off + 1], bytes[off + 2], bytes[off + 3])
    tables.set(tag, {
      offset: view.getUint32(off + 8),
      length: view.getUint32(off + 12),
    })
  }
  return tables
}

// --- cmap parsing (glyph ID → Unicode codepoint) ---

function parseCmap(view: DataView, bytes: Uint8Array, table: TableEntry): Map<number, number> {
  const base = table.offset
  if (base + 4 > bytes.length) return new Map()

  const numSubtables = view.getUint16(base + 2)
  let bestOffset = -1
  let bestPriority = -1

  for (let i = 0; i < numSubtables; i++) {
    const recOff = base + 4 + i * 8
    if (recOff + 8 > bytes.length) break
    const platformID = view.getUint16(recOff)
    const encodingID = view.getUint16(recOff + 2)
    const subtableOff = view.getUint32(recOff + 4)

    let priority = -1
    if (platformID === 3 && encodingID === 10) priority = 3 // Windows full
    else if (platformID === 0 && encodingID >= 3) priority = 2 // Unicode full
    else if (platformID === 3 && encodingID === 1) priority = 1 // Windows BMP
    else if (platformID === 0) priority = 0 // Unicode BMP

    if (priority > bestPriority) {
      bestPriority = priority
      bestOffset = base + subtableOff
    }
  }

  if (bestOffset < 0) return new Map()
  return parseCmapSubtable(view, bytes, bestOffset)
}

function parseCmapSubtable(view: DataView, bytes: Uint8Array, off: number): Map<number, number> {
  if (off + 2 > bytes.length) return new Map()
  const format = view.getUint16(off)

  if (format === 4) return parseCmapFormat4(view, bytes, off)
  if (format === 12) return parseCmapFormat12(view, bytes, off)
  if (format === 6) return parseCmapFormat6(view, bytes, off)
  return new Map()
}

function parseCmapFormat4(view: DataView, bytes: Uint8Array, off: number): Map<number, number> {
  // glyphID → codepoint (reverse map)
  const map = new Map<number, number>()
  if (off + 14 > bytes.length) return map

  const segCount = view.getUint16(off + 6) >> 1
  const endCodesOff = off + 14
  const startCodesOff = endCodesOff + segCount * 2 + 2 // +2 for reservedPad
  const idDeltasOff = startCodesOff + segCount * 2
  const idRangeOffsetsOff = idDeltasOff + segCount * 2

  for (let seg = 0; seg < segCount; seg++) {
    const endCode = view.getUint16(endCodesOff + seg * 2)
    const startCode = view.getUint16(startCodesOff + seg * 2)
    const idDelta = view.getInt16(idDeltasOff + seg * 2)
    const idRangeOffset = view.getUint16(idRangeOffsetsOff + seg * 2)

    if (startCode === 0xFFFF) break

    for (let cp = startCode; cp <= endCode; cp++) {
      let glyphID: number
      if (idRangeOffset === 0) {
        glyphID = (cp + idDelta) & 0xFFFF
      } else {
        const glyphIdOff = idRangeOffsetsOff + seg * 2 + idRangeOffset + (cp - startCode) * 2
        if (glyphIdOff + 2 > bytes.length) continue
        glyphID = view.getUint16(glyphIdOff)
        if (glyphID !== 0) glyphID = (glyphID + idDelta) & 0xFFFF
      }
      if (glyphID !== 0 && !map.has(glyphID)) {
        map.set(glyphID, cp)
      }
    }
  }
  return map
}

function parseCmapFormat12(view: DataView, bytes: Uint8Array, off: number): Map<number, number> {
  const map = new Map<number, number>()
  if (off + 16 > bytes.length) return map

  const numGroups = view.getUint32(off + 12)
  for (let i = 0; i < numGroups; i++) {
    const grpOff = off + 16 + i * 12
    if (grpOff + 12 > bytes.length) break
    const startCharCode = view.getUint32(grpOff)
    const endCharCode = view.getUint32(grpOff + 4)
    const startGlyphID = view.getUint32(grpOff + 8)
    for (let cp = startCharCode; cp <= endCharCode; cp++) {
      const gid = startGlyphID + (cp - startCharCode)
      if (!map.has(gid)) map.set(gid, cp)
    }
  }
  return map
}

function parseCmapFormat6(view: DataView, bytes: Uint8Array, off: number): Map<number, number> {
  const map = new Map<number, number>()
  if (off + 10 > bytes.length) return map

  const firstCode = view.getUint16(off + 6)
  const entryCount = view.getUint16(off + 8)
  for (let i = 0; i < entryCount; i++) {
    const arrOff = off + 10 + i * 2
    if (arrOff + 2 > bytes.length) break
    const glyphID = view.getUint16(arrOff)
    if (glyphID !== 0 && !map.has(glyphID)) {
      map.set(glyphID, firstCode + i)
    }
  }
  return map
}

// --- name table parsing ---

function parseName(view: DataView, bytes: Uint8Array, table: TableEntry): string {
  const base = table.offset
  if (base + 6 > bytes.length) return ''

  const count = view.getUint16(base + 2)
  const storageOffset = base + view.getUint16(base + 4)

  // Look for name ID 4 (full font name) or 1 (family name)
  for (const targetId of [4, 1]) {
    for (let i = 0; i < count; i++) {
      const recOff = base + 6 + i * 12
      if (recOff + 12 > bytes.length) break
      const platformID = view.getUint16(recOff)
      const nameID = view.getUint16(recOff + 6)
      const length = view.getUint16(recOff + 8)
      const strOffset = view.getUint16(recOff + 10)

      if (nameID !== targetId) continue
      const strStart = storageOffset + strOffset
      if (strStart + length > bytes.length) continue

      if (platformID === 3 || platformID === 0) {
        // UTF-16BE
        let s = ''
        for (let j = 0; j < length; j += 2) {
          s += String.fromCharCode(view.getUint16(strStart + j))
        }
        return s
      }
      if (platformID === 1) {
        // Mac Roman (ASCII-compatible for typical names)
        let s = ''
        for (let j = 0; j < length; j++) {
          s += String.fromCharCode(bytes[strStart + j])
        }
        return s
      }
    }
  }
  return ''
}

// --- EBLC/EBDT parsing ---

interface GlyphBitmap {
  glyphID: number
  width: number
  height: number
  bearingX: number
  bearingY: number
  advance: number
  imageData: Uint8Array // byte-aligned rows, MSBit-first
}

interface SmallMetrics {
  height: number
  width: number
  bearingX: number
  bearingY: number
  advance: number
}

interface BigMetrics extends SmallMetrics {
  vertBearingX: number
  vertBearingY: number
  vertAdvance: number
}

function readSmallMetrics(view: DataView, off: number): SmallMetrics {
  return {
    height: bytes8(view, off),
    width: bytes8(view, off + 1),
    bearingX: view.getInt8(off + 2),
    bearingY: view.getInt8(off + 3),
    advance: bytes8(view, off + 4),
  }
}

function readBigMetrics(view: DataView, off: number): BigMetrics {
  return {
    height: bytes8(view, off),
    width: bytes8(view, off + 1),
    bearingX: view.getInt8(off + 2),
    bearingY: view.getInt8(off + 3),
    advance: bytes8(view, off + 4),
    vertBearingX: view.getInt8(off + 5),
    vertBearingY: view.getInt8(off + 6),
    vertAdvance: bytes8(view, off + 7),
  }
}

function bytes8(view: DataView, off: number): number {
  return view.getUint8(off)
}

/** Convert bit-aligned image data to byte-aligned rows. */
function unpackBitAligned(src: Uint8Array, srcOffset: number, width: number, height: number): Uint8Array {
  const rowBytes = Math.ceil(width / 8)
  const out = new Uint8Array(rowBytes * height)
  let bitPos = 0

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const srcByteIdx = srcOffset + (bitPos >> 3)
      const srcBitIdx = 7 - (bitPos & 7)
      if (srcByteIdx < src.length && (src[srcByteIdx] >> srcBitIdx) & 1) {
        const dstByte = y * rowBytes + (x >> 3)
        const dstBit = 7 - (x & 7)
        out[dstByte] |= 1 << dstBit
      }
      bitPos++
    }
  }
  return out
}

function readGlyphBitmap(
  view: DataView, bytes: Uint8Array,
  ebdtStart: number, ebdtOffset: number,
  imageFormat: number, sharedMetrics: BigMetrics | null,
): GlyphBitmap | null {
  const pos = ebdtStart + ebdtOffset
  if (pos >= bytes.length) return null

  let metrics: SmallMetrics
  let imgOff: number

  switch (imageFormat) {
    case 1: { // SmallGlyphMetrics + byte-aligned
      if (pos + 5 > bytes.length) return null
      metrics = readSmallMetrics(view, pos)
      imgOff = pos + 5
      const rowBytes = Math.ceil(metrics.width / 8)
      const imgSize = rowBytes * metrics.height
      if (imgOff + imgSize > bytes.length) return null
      return { ...metrics, glyphID: 0, imageData: bytes.slice(imgOff, imgOff + imgSize) }
    }
    case 2: { // SmallGlyphMetrics + bit-aligned
      if (pos + 5 > bytes.length) return null
      metrics = readSmallMetrics(view, pos)
      imgOff = pos + 5
      return { ...metrics, glyphID: 0, imageData: unpackBitAligned(bytes, imgOff, metrics.width, metrics.height) }
    }
    case 5: { // bit-aligned data only (metrics from EBLC)
      if (!sharedMetrics) return null
      metrics = sharedMetrics
      return { ...metrics, glyphID: 0, imageData: unpackBitAligned(bytes, pos, metrics.width, metrics.height) }
    }
    case 6: { // BigGlyphMetrics + byte-aligned
      if (pos + 8 > bytes.length) return null
      const big = readBigMetrics(view, pos)
      imgOff = pos + 8
      const rowBytes = Math.ceil(big.width / 8)
      const imgSize = rowBytes * big.height
      if (imgOff + imgSize > bytes.length) return null
      return { ...big, glyphID: 0, imageData: bytes.slice(imgOff, imgOff + imgSize) }
    }
    case 7: { // BigGlyphMetrics + bit-aligned
      if (pos + 8 > bytes.length) return null
      const big = readBigMetrics(view, pos)
      imgOff = pos + 8
      return { ...big, glyphID: 0, imageData: unpackBitAligned(bytes, imgOff, big.width, big.height) }
    }
    default:
      return null // Formats 8,9 (composite), 17-19 (color) not supported
  }
}

function parseStrike(
  view: DataView, bytes: Uint8Array,
  eblcStart: number, ebdtStart: number,
  sizeRecordOff: number,
): { glyphs: GlyphBitmap[]; ascender: number; descender: number; ppemX: number; ppemY: number; widthMax: number } | null {
  if (sizeRecordOff + 48 > bytes.length) return null

  const indexSubtableListOffset = view.getUint32(sizeRecordOff)
  const numberOfIndexSubtables = view.getUint32(sizeRecordOff + 8)

  // SbitLineMetrics (horizontal)
  const horiOff = sizeRecordOff + 16
  const ascender = view.getInt8(horiOff)
  const descender = view.getInt8(horiOff + 1)
  const widthMax = bytes[horiOff + 2]

  const ppemX = bytes[sizeRecordOff + 44]
  const ppemY = bytes[sizeRecordOff + 45]
  const bitDepth = bytes[sizeRecordOff + 46]

  // Only support 1-bit bitmaps for now
  if (bitDepth !== 1) return null

  const listBase = eblcStart + indexSubtableListOffset
  const glyphs: GlyphBitmap[] = []

  for (let sub = 0; sub < numberOfIndexSubtables; sub++) {
    const recOff = listBase + sub * 8
    if (recOff + 8 > bytes.length) break

    const firstGlyph = view.getUint16(recOff)
    const lastGlyph = view.getUint16(recOff + 2)
    const subtableOffset = view.getUint32(recOff + 4)

    const subtablePos = listBase + subtableOffset
    if (subtablePos + 8 > bytes.length) continue

    const indexFormat = view.getUint16(subtablePos)
    const imageFormat = view.getUint16(subtablePos + 2)
    const imageDataOffset = view.getUint32(subtablePos + 4)

    const count = lastGlyph - firstGlyph + 1

    switch (indexFormat) {
      case 1: { // Variable metrics, 4-byte offsets
        for (let i = 0; i < count; i++) {
          const offIdx = subtablePos + 8 + i * 4
          if (offIdx + 8 > bytes.length) break
          const sbitOff = view.getUint32(offIdx)
          const nextOff = view.getUint32(offIdx + 4)
          const dataSize = nextOff - sbitOff
          if (dataSize <= 0) continue
          const bmp = readGlyphBitmap(view, bytes, ebdtStart, imageDataOffset + sbitOff, imageFormat, null)
          if (bmp) { bmp.glyphID = firstGlyph + i; glyphs.push(bmp) }
        }
        break
      }
      case 2: { // Constant metrics, constant image size
        if (subtablePos + 20 > bytes.length) break
        const imageSize = view.getUint32(subtablePos + 8)
        const sharedMetrics = readBigMetrics(view, subtablePos + 12)
        for (let i = 0; i < count; i++) {
          const bmp = readGlyphBitmap(view, bytes, ebdtStart, imageDataOffset + i * imageSize, imageFormat, sharedMetrics)
          if (bmp) { bmp.glyphID = firstGlyph + i; glyphs.push(bmp) }
        }
        break
      }
      case 3: { // Variable metrics, 2-byte offsets
        for (let i = 0; i < count; i++) {
          const offIdx = subtablePos + 8 + i * 2
          if (offIdx + 4 > bytes.length) break
          const sbitOff = view.getUint16(offIdx)
          const nextOff = view.getUint16(offIdx + 2)
          const dataSize = nextOff - sbitOff
          if (dataSize <= 0) continue
          const bmp = readGlyphBitmap(view, bytes, ebdtStart, imageDataOffset + sbitOff, imageFormat, null)
          if (bmp) { bmp.glyphID = firstGlyph + i; glyphs.push(bmp) }
        }
        break
      }
      case 4: { // Variable metrics, sparse glyph IDs
        if (subtablePos + 12 > bytes.length) break
        const numGlyphs = view.getUint32(subtablePos + 8)
        for (let i = 0; i < numGlyphs; i++) {
          const pairOff = subtablePos + 12 + i * 4
          if (pairOff + 4 > bytes.length) break
          const glyphID = view.getUint16(pairOff)
          const sbitOff = view.getUint16(pairOff + 2)
          if (i < numGlyphs - 1) {
            const nextSbitOff = view.getUint16(pairOff + 4 + 2)
            const dataSize = nextSbitOff - sbitOff
            if (dataSize <= 0) continue
          }
          const bmp = readGlyphBitmap(view, bytes, ebdtStart, imageDataOffset + sbitOff, imageFormat, null)
          if (bmp) { bmp.glyphID = glyphID; glyphs.push(bmp) }
        }
        break
      }
      case 5: { // Constant metrics, sparse glyph IDs
        if (subtablePos + 24 > bytes.length) break
        const imageSize = view.getUint32(subtablePos + 8)
        const sharedMetrics = readBigMetrics(view, subtablePos + 12)
        const numGlyphs = view.getUint32(subtablePos + 20)
        for (let i = 0; i < numGlyphs; i++) {
          const gidOff = subtablePos + 24 + i * 2
          if (gidOff + 2 > bytes.length) break
          const glyphID = view.getUint16(gidOff)
          const bmp = readGlyphBitmap(view, bytes, ebdtStart, imageDataOffset + i * imageSize, imageFormat, sharedMetrics)
          if (bmp) { bmp.glyphID = glyphID; glyphs.push(bmp) }
        }
        break
      }
    }
  }

  return { glyphs, ascender, descender, ppemX, ppemY, widthMax }
}

/** Layout parsed glyphs into a cell grid mapped by Unicode codepoints. */
function layoutStrike(
  glyphs: GlyphBitmap[],
  glyphToUnicode: Map<number, number>,
  ascender: number, descender: number, widthMax: number,
  ppemX: number, ppemY: number,
  fontName: string,
): SbitStrike | null {
  if (glyphs.length === 0) return null

  // Determine cell dimensions — ppemY is the authoritative cell height
  const cellH = ppemY
  if (cellH <= 0) return null
  let cellW = widthMax
  if (cellW <= 0) {
    for (const g of glyphs) { if (g.width > cellW) cellW = g.width }
  }
  if (cellW <= 0) return null

  // Map glyphs to Unicode codepoints, find range
  const mapped: { cp: number; glyph: GlyphBitmap }[] = []
  for (const g of glyphs) {
    const cp = glyphToUnicode.get(g.glyphID)
    if (cp !== undefined && cp >= 0) {
      mapped.push({ cp, glyph: g })
    }
  }

  // Fall back to identity mapping if cmap gave us nothing useful
  if (mapped.length === 0) {
    for (const g of glyphs) {
      if (g.glyphID > 0 && g.glyphID <= 0xFFFF) {
        mapped.push({ cp: g.glyphID, glyph: g })
      }
    }
  }

  if (mapped.length === 0) return null

  let minCp = 0x7FFFFFFF, maxCp = 0
  for (const { cp } of mapped) {
    if (cp < minCp) minCp = cp
    if (cp > maxCp) maxCp = cp
  }

  const startChar = minCp
  const totalSlots = maxCp - minCp + 1
  const outBpr = bpr(cellW)
  const outBpg = cellH * outBpr
  const fontData = new Uint8Array(totalSlots * outBpg)
  const glyphMeta: (GlyphMeta | null)[] = new Array(totalSlots).fill(null)
  const populated = new Set<number>()

  const baseline = ascender > 0 ? ascender - 1 : 0

  for (const { cp, glyph } of mapped) {
    const idx = cp - startChar
    const dstBase = idx * outBpg

    // Position glyph within cell using bearingX/bearingY
    const xOff = Math.max(0, glyph.bearingX)
    const yOff = Math.max(0, ascender - glyph.bearingY)

    const srcRowBytes = Math.ceil(glyph.width / 8)
    for (let y = 0; y < glyph.height; y++) {
      const dstY = yOff + y
      if (dstY >= cellH) break
      for (let x = 0; x < glyph.width; x++) {
        const dstX = xOff + x
        if (dstX >= cellW) break
        // Read source pixel (MSBit-first, byte-aligned rows)
        const srcByte = y * srcRowBytes + (x >> 3)
        const srcBit = 7 - (x & 7)
        if (glyph.imageData[srcByte] & (1 << srcBit)) {
          setBit(fontData, dstBase + dstY * outBpr, dstX)
        }
      }
    }

    populated.add(idx)
    glyphMeta[idx] = { dwidth: [glyph.advance, 0] }
  }

  // Detect proportional
  const isProportional = mapped.some(m => m.glyph.advance !== cellW)

  return {
    fontData,
    glyphWidth: cellW,
    glyphHeight: cellH,
    startChar,
    glyphMeta,
    baseline,
    meta: {
      format: `TTF sbit ${ppemX}×${ppemY}`,
      fontName,
      family: fontName,
      fontAscent: ascender,
      fontDescent: Math.abs(descender),
      properties: {
        PIXEL_SIZE: String(ppemY),
      },
    },
    populated,
    ppemX,
    ppemY,
    spacingMode: isProportional ? 'proportional' : 'monospace',
  }
}

// --- Public API ---

/** Check if a buffer looks like a TTF/OTF file with embedded bitmaps. */
export function isSbitFont(buf: ArrayBuffer): boolean {
  if (buf.byteLength < 16) return false
  const view = new DataView(buf)
  const sfnt = view.getUint32(0)
  if (sfnt !== 0x00010000 && sfnt !== 0x4F54544F) return false
  const bytes = new Uint8Array(buf)
  const tables = readTableDirectory(view, bytes)
  return tables.has('EBLC') || tables.has('bloc')
}

export function parseSbit(buf: ArrayBuffer): SbitParseResult {
  const bytes = new Uint8Array(buf)
  const view = new DataView(buf)
  const tables = readTableDirectory(view, bytes)

  // Find location and data tables (OpenType or Apple)
  const eblcEntry = tables.get('EBLC') ?? tables.get('bloc')
  const ebdtEntry = tables.get('EBDT') ?? tables.get('bdat')
  if (!eblcEntry || !ebdtEntry)
    throw new Error('No embedded bitmap tables (EBLC/EBDT) found')

  const eblcStart = eblcEntry.offset
  const ebdtStart = ebdtEntry.offset

  // Parse cmap for glyph ID → Unicode mapping
  const cmapEntry = tables.get('cmap')
  const glyphToUnicode = cmapEntry ? parseCmap(view, bytes, cmapEntry) : new Map<number, number>()

  // Parse name table for font name
  const nameEntry = tables.get('name')
  const fontName = nameEntry ? parseName(view, bytes, nameEntry) : ''

  // Read EBLC header
  if (eblcStart + 8 > bytes.length)
    throw new Error('EBLC table too short')
  const numSizes = view.getUint32(eblcStart + 4)

  const strikes: SbitStrike[] = []

  for (let i = 0; i < numSizes; i++) {
    const sizeOff = eblcStart + 8 + i * 48
    const result = parseStrike(view, bytes, eblcStart, ebdtStart, sizeOff)
    if (!result) continue

    const strike = layoutStrike(
      result.glyphs, glyphToUnicode,
      result.ascender, result.descender, result.widthMax,
      result.ppemX, result.ppemY, fontName,
    )
    if (strike) strikes.push(strike)
  }

  if (strikes.length === 0)
    throw new Error('No usable 1-bit bitmap strikes found in this font')

  // Sort by ppemY ascending
  strikes.sort((a, b) => a.ppemY - b.ppemY)

  return { strikes, fontName }
}
