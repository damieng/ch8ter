// Write C64 GEOS font files (.cvt VLIR container).
//
// Emits a single point size as VLIR record #pointSize (record number = point
// size, following the convention that a font's height is its point size).
// The record layout matches the format documented in Bits'N'Picas'
// "GEOS Font Format": an 8-byte header, a 97-word x-coordinate table
// ($20-$7F plus final end), and a bitmap with all glyphs concatenated
// horizontally, MSB = leftmost pixel.
//
// CVT container layout (254-byte blocks): signature block with directory
// entry, INFO block (font id at $80, record length at $61, point size id at
// $82), VLIR record index, then the record data.

import type { FontWriteData } from '../fontSave'
import { bpr, getBit } from '../bitUtils'

const BLOCK_SIZE = 254
const FIRST_CHAR = 0x20
const NUM_CHARS = 96

function petasciiName(name: string): Uint8Array {
  const out = new Uint8Array(16).fill(0xA0)
  const cleaned = (name || 'FONT').toUpperCase().replace(/[^A-Z0-9 \-]/g, '').slice(0, 16)
  for (let i = 0; i < cleaned.length; i++) out[i] = cleaned.charCodeAt(i)
  return out
}

export function writeGeosCvt(data: FontWriteData): Uint8Array {
  const { fontData, glyphWidth, glyphHeight, startChar, glyphCount, glyphMeta, baseline, fontName } = data

  if (glyphCount < 1) throw new Error('GEOS export requires at least one glyph')
  if (glyphHeight < 1 || glyphHeight > 255) throw new Error('GEOS height must be 1..255')
  if (baseline < 0 || baseline > 255) throw new Error('GEOS baseline must be 0..255')

  // Point size == VLIR record number; keep clear of the mega-font range
  const pointSize = Math.max(1, Math.min(47, glyphHeight))

  // Per-character advances; only chars $20-$7F can be stored
  const widths: number[] = []
  let totalX = 0
  for (let i = 0; i < NUM_CHARS; i++) {
    const charCode = FIRST_CHAR + i
    const idx = charCode - startChar
    let width = 0
    if (idx >= 0 && idx < glyphCount) {
      const adv = glyphMeta?.[idx]?.dwidth?.[0]
      width = adv == null ? glyphWidth : Math.round(adv)
      if (width < 0) width = 0
      if (width > 255) width = 255
    }
    widths.push(width)
    totalX += width
  }
  const rowLength = Math.max(1, Math.ceil(totalX / 8))
  if (rowLength > 0xFFFF) throw new Error('GEOS bitmap row length exceeds 64K')

  // Assemble the record: header + x-coordinate table + bitmap
  const xTableOff = 8
  const bitmapOff = xTableOff + (NUM_CHARS + 1) * 2 // $CA
  const recordLen = bitmapOff + glyphHeight * rowLength
  if (recordLen > 0xFFFF) throw new Error('GEOS record exceeds 64K')

  const record = new Uint8Array(recordLen)
  const view = new DataView(record.buffer)
  record[0] = baseline                                  // ascent
  view.setUint16(1, rowLength, true)
  record[3] = glyphHeight
  view.setUint16(4, xTableOff, true)
  view.setUint16(6, bitmapOff, true)

  let x = 0
  for (let i = 0; i < NUM_CHARS; i++) {
    view.setUint16(xTableOff + i * 2, x, true)
    const idx = FIRST_CHAR + i - startChar
    const copyW = Math.min(widths[i], glyphWidth)
    if (idx >= 0 && idx < glyphCount && copyW > 0) {
      for (let y = 0; y < glyphHeight; y++) {
        for (let px = 0; px < copyW; px++) {
          if (getBit(fontData, idx * glyphHeight * bpr(glyphWidth) + y * bpr(glyphWidth), px)) {
            const gx = x + px
            record[bitmapOff + y * rowLength + (gx >> 3)] |= 0x80 >> (gx & 7)
          }
        }
        // GEOS stores exactly `advance` columns per character; ink beyond
        // the advance cannot be represented, so refuse rather than lose it
        for (let px = copyW; px < glyphWidth; px++) {
          if (getBit(fontData, idx * glyphHeight * bpr(glyphWidth) + y * bpr(glyphWidth), px)) {
            throw new Error(`GEOS character ${FIRST_CHAR + i} has pixels beyond its advance width (${widths[i]})`)
          }
        }
      }
    }
    x += widths[i]
  }
  view.setUint16(xTableOff + NUM_CHARS * 2, x, true) // final end position

  // --- CVT container ---
  const sigBlock = new Uint8Array(BLOCK_SIZE)
  const name = petasciiName(fontName)
  sigBlock[0] = 0x83
  sigBlock.set(name, 3)                    // filename (16 bytes, $A0 padded)
  sigBlock[21] = 0x01                      // GEOS structure: VLIR
  sigBlock[22] = 0x06                      // GEOS type: font
  sigBlock.set(new TextEncoder().encode('PRG formatted GEOS file V1.0\u0000'), 30)

  const infoBlock = new Uint8Array(BLOCK_SIZE)
  const infoView = new DataView(infoBlock.buffer)
  infoView.setUint16(0, 0x40, true)        // pointer to directory entry copy
  infoBlock.set(sigBlock.subarray(0, 30), 0x40)
  infoView.setUint16(0x61, recordLen, true) // record lengths ($61.., zero terminated)
  infoView.setUint16(0x80, 1023, true)      // font id (unassigned)
  infoView.setUint16(0x82, 1023 * 64 + pointSize, true)

  const indexBlock = new Uint8Array(BLOCK_SIZE)
  // Sparse index: records below ours are marked non-existent ($00 $FF)
  for (let rec = 1; rec < pointSize; rec++) {
    indexBlock[rec * 2 + 1] = 0xFF
  }
  const count = Math.ceil(recordLen / BLOCK_SIZE)
  indexBlock[pointSize * 2] = count
  indexBlock[pointSize * 2 + 1] = recordLen - (count - 1) * BLOCK_SIZE
  // $00 $00 terminator after the last written entry

  const out = new Uint8Array(3 * BLOCK_SIZE + recordLen)
  out.set(sigBlock, 0)
  out.set(infoBlock, BLOCK_SIZE)
  out.set(indexBlock, 2 * BLOCK_SIZE)
  out.set(record, 3 * BLOCK_SIZE)
  return out
}
