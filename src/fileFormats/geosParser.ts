// Parse C64 GEOS fonts (.cvt VLIR container files).
//
// A GEOS font file is a VLIR bundle where each record is one point size of
// the font (record number = point size). Each record holds a complete
// bitmap font for characters $20-$7F:
//
//   $00      ascent (baseline offset from top)
//   $01-$02  row length (bytes per bitmap row)
//   $03      height
//   $04-$05  offset to x-coordinate table (usually $08)
//   $06-$07  offset to bitmap (usually $CA = 8 + 97*2)
//
// The bitmap is `height` rows of `rowLength` bytes with all glyphs
// concatenated horizontally in ASCII order (MSB = leftmost pixel). The
// x-coordinate table holds 97 words: start/end x of each of the 96
// characters plus the final end position; each character's advance is the
// difference of its end and start coordinates.
//
// Mega fonts (geoPublish) split the bitmap across records 48-53 ($20-$2F,
// $30-$3F, ... $70-$7F); record 54 holds only an x-coordinate table.
//
// CVT container layout (254-byte blocks):
//   block 0  directory entry (30 bytes) + "PRG formatted GEOS file V1.0"
//   block 1  INFO block (font id at $80, record lengths at $61, point
//            sizes at $82)
//   block 2  VLIR record index: byte pairs (sector count, bytes in last
//            sector), $00 $FF = record absent, $00 $00 = end
//   block 3+ record data, concatenated in record order
//
// References: Bits'N'Picas "GEOS Font Format" (R. Bettencourt),
// "CVT (ConVerT containers)" (J. Forster/STA), pagetable.com geoWrite #3.

export interface GeosFontSet {
  /** Point size (record number), or 0 for mega fonts. */
  size: number
  ascent: number
  glyphWidth: number
  glyphHeight: number
  fontData: Uint8Array
  populated: Set<number>
  glyphMeta: ({ dwidth: [number, number] } | null)[]
}

export const GEOS_FIRST_CHAR = 0x20
const GEOS_NUM_CHARS = 96
const BLOCK_SIZE = 254

/** Check the CVT signature at offset 30. */
export function isGeosCvt(bytes: Uint8Array): boolean {
  if (bytes.length < 30 + 28) return false
  const sig = String.fromCharCode(...bytes.subarray(30, 30 + 28))
  return sig === 'PRG formatted GEOS file V1.0'
    || sig === 'PRG truncated GEOS file V1.0'
}

interface RecordEntry {
  offset: number
  length: number
}

/** Split the CVT into VLIR records using the record index block. */
function readRecords(bytes: Uint8Array): Map<number, RecordEntry> {
  const records = new Map<number, RecordEntry>()
  const indexOff = 2 * BLOCK_SIZE
  let dataOff = 3 * BLOCK_SIZE

  for (let rec = 1; rec <= 127; rec++) {
    const p = indexOff + rec * 2
    if (p + 2 > bytes.length) break
    const count = bytes[p]
    const lastIdx = bytes[p + 1]
    if (count === 0 && lastIdx === 0) break          // end of record chain
    if (count === 0 && lastIdx === 0xFF) continue    // record absent
    const length = (count - 1) * BLOCK_SIZE + lastIdx
    if (length <= 0) continue
    if (dataOff + length > bytes.length) {
      // Truncated CVT: take what is there
      records.set(rec, { offset: dataOff, length: bytes.length - dataOff })
      break
    }
    records.set(rec, { offset: dataOff, length })
    dataOff += length
  }
  return records
}

/**
 * Parse one record into a glyph set.
 * `onlyChars` restricts extraction to a char range (mega font records).
 */
function parseRecord(
  rec: Uint8Array, size: number, onlyChars?: [number, number],
): GeosFontSet | null {
  if (rec.length < 8) return null
  const view = new DataView(rec.buffer, rec.byteOffset, rec.byteLength)
  const ascent = rec[0]
  const rowLength = view.getUint16(1, true)
  const height = rec[3]
  const xTableOff = view.getUint16(4, true)
  const bitmapOff = view.getUint16(6, true)

  if (height < 1 || rowLength < 1) return null
  if (xTableOff + GEOS_NUM_CHARS * 2 + 2 > rec.length) return null
  if (bitmapOff >= rec.length) return null

  // X-coordinate table: 97 words (96 chars + final end position)
  const xCoords: number[] = []
  for (let i = 0; i <= GEOS_NUM_CHARS; i++) {
    xCoords.push(view.getUint16(xTableOff + i * 2, true))
  }
  const maxBitmapX = rowLength * 8

  // Character widths from the table; third-party fonts sometimes have an
  // invalid final entry, so clamp to the bitmap bounds.
  const widths: number[] = []
  for (let i = 0; i < GEOS_NUM_CHARS; i++) {
    const start = xCoords[i]
    let end = xCoords[i + 1]
    if (end < start) end = start
    if (end > maxBitmapX) end = maxBitmapX
    if (start >= maxBitmapX) {
      widths.push(0)
    } else {
      widths.push(end - start)
    }
  }

  const cellW = Math.max(1, ...widths)
  const cellH = height
  const outBpr = Math.ceil(cellW / 8)
  const outBpg = cellH * outBpr
  const fontData = new Uint8Array(GEOS_NUM_CHARS * outBpg)
  const populated = new Set<number>()
  const glyphMeta: ({ dwidth: [number, number] } | null)[] = new Array(GEOS_NUM_CHARS).fill(null)

  for (let i = 0; i < GEOS_NUM_CHARS; i++) {
    const charCode = GEOS_FIRST_CHAR + i
    if (onlyChars && (charCode < onlyChars[0] || charCode > onlyChars[1])) continue
    const width = widths[i]
    if (width <= 0) continue

    glyphMeta[i] = { dwidth: [width, 0] }
    populated.add(i)
    for (let y = 0; y < cellH; y++) {
      const srcRow = bitmapOff + y * rowLength
      for (let x = 0; x < width; x++) {
        const gx = xCoords[i] + x
        const b = rec[srcRow + (gx >> 3)]
        if (b & (0x80 >> (gx & 7))) {
          fontData[i * outBpg + y * outBpr + (x >> 3)] |= 0x80 >> (x & 7)
        }
      }
    }
  }

  if (populated.size === 0) return null
  return {
    size,
    ascent,
    glyphWidth: cellW,
    glyphHeight: cellH,
    fontData,
    populated,
    glyphMeta,
  }
}

/** Parse a .cvt GEOS font file into one glyph set per point size. */
export function parseGeosCvt(bytes: Uint8Array): GeosFontSet[] {
  if (!isGeosCvt(bytes)) {
    throw new Error('Not a GEOS CVT file (missing "PRG formatted GEOS file V1.0" signature)')
  }

  const records = readRecords(bytes)
  if (records.size === 0) {
    throw new Error('GEOS CVT file contains no records')
  }

  const results: GeosFontSet[] = []

  // Mega font: records 48-53 hold $20-$2F .. $70-$7F, record 54 is a bare
  // x-coordinate table (bitmap offset at or past the end of the record).
  const rec54 = records.get(54)
  const isMega = rec54 != null && records.has(48) &&
    (() => {
      if (rec54.length < 8) return false
      const rec = bytes.subarray(rec54.offset, rec54.offset + rec54.length)
      const bitmapOff = rec[6] | (rec[7] << 8)
      return bitmapOff >= rec54.length
    })()

  if (isMega) {
    let merged: GeosFontSet | null = null
    const parts: GeosFontSet[] = []
    for (let r = 0; r < 6; r++) {
      const entry = records.get(48 + r)
      if (!entry) continue
      const rec = bytes.subarray(entry.offset, entry.offset + entry.length)
      const part = parseRecord(rec, 0, [GEOS_FIRST_CHAR + r * 16, GEOS_FIRST_CHAR + r * 16 + 15])
      if (part) parts.push(part)
    }
    if (parts.length > 0) {
      // Merge parts into one glyph set (all share the same metrics)
      const proto = parts[0]
      const fontData = new Uint8Array(proto.fontData.length)
      const populated = new Set<number>()
      for (const part of parts) {
        fontData.set(part.fontData)
        for (const i of part.populated) populated.add(i)
      }
      merged = { ...proto, fontData, populated }
      results.push(merged)
    }
    return results
  }

  // Standard font: every record is one point size
  const sizes = [...records.keys()].sort((a, b) => a - b)
  for (const size of sizes) {
    const entry = records.get(size)!
    const rec = bytes.subarray(entry.offset, entry.offset + entry.length)
    const set = parseRecord(rec, size)
    if (set) results.push(set)
  }
  return results
}
