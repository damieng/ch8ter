// Parse Amiga bitmap font files (individual size files from font directories).
//
// These files are Amiga Hunk executables containing a DiskFontHeader + TextFont
// structure followed by bitmap data, character location table, and optional
// spacing/kerning tables. All integers are big-endian.
//
// Hunk wrapper:
//   HUNK_HEADER (0x000003F3) + table info + HUNK_DATA + data + optional HUNK_RELOC32 + HUNK_END
//
// DiskFontHeader layout within hunk data:
//   [0..3]:   Return code (70FF 4E75 = moveq #-1,d0; rts)
//   [4..17]:  Node (ln_Succ, ln_Pred, ln_Type, ln_Pri, ln_Name)
//   [18..19]: dfh_FileID (0x0F80)
//   [20..21]: dfh_Revision
//   [22..25]: dfh_Segment (0 on disk)
//   [26..57]: dfh_Name (32 bytes, null-padded)
//   [58..]:   TextFont structure (tf_Message + font fields)
//
// TextFont fields (relative to offset 58):
//   [+0..+19]:  tf_Message (Node + ReplyPort + Length)
//   [+20..+21]: tf_YSize (height)
//   [+22]:      tf_Style
//   [+23]:      tf_Flags
//   [+24..+25]: tf_XSize (nominal width)
//   [+26..+27]: tf_Baseline
//   [+28..+29]: tf_BoldSmear
//   [+30..+31]: tf_Accessors
//   [+32]:      tf_LoChar
//   [+33]:      tf_HiChar
//   [+34..+37]: tf_CharData (offset to bitmap)
//   [+38..+39]: tf_Modulo (bytes per bitmap row)
//   [+40..+43]: tf_CharLoc (offset to location table)
//   [+44..+47]: tf_CharSpace (offset to spacing table, or 0)
//   [+48..+51]: tf_CharKern (offset to kerning table, or 0)

import type { GlyphMeta, FontMeta } from './bdfParser'
import { getBit, setBit } from '../bitUtils'

export interface AmigaFontParseResult {
  fontData: Uint8Array
  startChar: number
  glyphWidth: number
  glyphHeight: number
  populated: Set<number>
  glyphMeta: (GlyphMeta | null)[]
  baseline: number
  meta: FontMeta
}

const HUNK_HEADER = 0x000003F3

function extractHunkData(buf: ArrayBuffer): Uint8Array {
  const view = new DataView(buf)
  const bytes = new Uint8Array(buf)

  if (bytes.length < 32) throw new Error('File too small')
  if (view.getUint32(0, false) !== HUNK_HEADER)
    throw new Error('Not an Amiga hunk file (missing HUNK_HEADER)')

  // Skip resident library names (list of longword-counted strings, terminated by 0)
  let pos = 4
  while (pos + 4 <= bytes.length && view.getUint32(pos, false) !== 0) {
    const nameLen = view.getUint32(pos, false)
    pos += 4 + nameLen * 4
  }
  pos += 4 // skip the 0 terminator

  // Table size, first/last hunk
  pos += 4 // tableSize
  pos += 4 // firstHunk
  const lastHunk = view.getUint32(pos, false); pos += 4

  // Skip hunk size entries
  pos += (lastHunk + 1) * 4

  // Read HUNK_DATA or HUNK_CODE
  const hunkType = view.getUint32(pos, false); pos += 4
  if (hunkType !== 0x000003E9 && hunkType !== 0x000003EA)
    throw new Error(`Expected HUNK_DATA/HUNK_CODE, got 0x${hunkType.toString(16)}`)

  const dataSize = view.getUint32(pos, false); pos += 4
  return bytes.slice(pos, pos + dataSize * 4)
}

export function parseAmigaFont(buf: ArrayBuffer): AmigaFontParseResult {
  const d = extractHunkData(buf)
  const view = new DataView(d.buffer, d.byteOffset, d.byteLength)

  // Verify dfh_FileID
  const fileId = view.getUint16(18, false)
  if (fileId !== 0x0F80)
    throw new Error(`Not an Amiga font file (dfh_FileID=0x${fileId.toString(16)}, expected 0x0F80)`)

  // Read font name
  const nameBytes = d.slice(26, 58)
  const nameEnd = nameBytes.indexOf(0)
  const fontName = String.fromCharCode(...nameBytes.slice(0, nameEnd > 0 ? nameEnd : 32))

  // TextFont starts at offset 58
  const tf = 58
  const ySize     = view.getUint16(tf + 20, false)
  const style     = d[tf + 22]
  const flags     = d[tf + 23]
  const xSize     = view.getUint16(tf + 24, false)
  const baseline  = view.getUint16(tf + 26, false)
  const loChar    = d[tf + 32]
  const hiChar    = d[tf + 33]
  const charDataOff  = view.getUint32(tf + 34, false)
  const modulo       = view.getUint16(tf + 38, false)
  const charLocOff   = view.getUint32(tf + 40, false)
  const charSpaceOff = view.getUint32(tf + 44, false)
  const charKernOff  = view.getUint32(tf + 48, false)

  if (ySize === 0 || ySize > 256)
    throw new Error(`Invalid font height: ${ySize}`)
  if (hiChar < loChar)
    throw new Error('hiChar < loChar')

  const numChars = hiChar - loChar + 1
  const numEntries = numChars + 1 // +1 for replacement glyph

  // Validate offsets
  if (charLocOff + numEntries * 4 > d.length)
    throw new Error('CharLoc table out of bounds')
  if (charDataOff + modulo * ySize > d.length)
    throw new Error('CharData bitmap out of bounds')

  // Find max glyph width
  let maxWidth = 0
  for (let i = 0; i < numChars; i++) {
    const bitWidth = view.getUint16(charLocOff + i * 4 + 2, false)
    if (bitWidth > maxWidth) maxWidth = bitWidth
    if (charSpaceOff) {
      const space = view.getInt16(charSpaceOff + i * 2, false)
      if (space > maxWidth) maxWidth = space
    }
  }
  if (maxWidth <= 0) maxWidth = xSize > 0 ? xSize : 8

  // Extract glyphs
  const bpr = Math.ceil(maxWidth / 8)
  const bpg = ySize * bpr
  const fontData = new Uint8Array(numChars * bpg)
  const populated = new Set<number>()
  const glyphMeta: (GlyphMeta | null)[] = new Array(numChars).fill(null)

  const isProportional = !!(flags & 0x20) // FPF_PROPORTIONAL

  for (let i = 0; i < numChars; i++) {
    const locEntry = charLocOff + i * 4
    const bitOffset = view.getUint16(locEntry, false)
    const bitWidth = view.getUint16(locEntry + 2, false)

    if (bitWidth <= 0) continue

    // Read optional spacing and kerning
    let advanceWidth = xSize
    let kern = 0
    if (charSpaceOff && charSpaceOff + (i + 1) * 2 <= d.length) {
      advanceWidth = view.getInt16(charSpaceOff + i * 2, false)
    }
    if (charKernOff && charKernOff + (i + 1) * 2 <= d.length) {
      kern = view.getInt16(charKernOff + i * 2, false)
    }

    let hasPixels = false
    const glyphBase = i * bpg

    for (let row = 0; row < ySize; row++) {
      const srcRow = charDataOff + row * modulo
      const dstRow = glyphBase + row * bpr
      for (let px = 0; px < bitWidth; px++) {
        if (srcRow + ((bitOffset + px) >> 3) < d.length && getBit(d, srcRow, bitOffset + px)) {
          setBit(fontData, dstRow, px)
          hasPixels = true
        }
      }
    }

    if (hasPixels) populated.add(i)

    glyphMeta[i] = {
      bbx: [bitWidth, ySize, 0, 0],
      dwidth: [isProportional ? (kern + advanceWidth) : advanceWidth, 0],
    }
  }

  return {
    fontData,
    startChar: loChar,
    glyphWidth: maxWidth,
    glyphHeight: ySize,
    populated,
    glyphMeta,
    baseline: baseline > 0 ? baseline - 1 : 0,
    meta: {
      format: 'Amiga NFNT',
      family: fontName || undefined,
      fontAscent: baseline,
      fontDescent: ySize - baseline,
      properties: {
        AMIGA_STYLE: String(style),
        AMIGA_FLAGS: String(flags),
        AMIGA_XSIZE: String(xSize),
        AMIGA_BOLD_SMEAR: String(view.getUint16(tf + 28, false)),
      },
    },
  }
}

/** Check if an ArrayBuffer starts with Amiga HUNK_HEADER magic. */
export function isAmigaHunk(buf: ArrayBuffer): boolean {
  if (buf.byteLength < 32) return false
  const view = new DataView(buf)
  return view.getUint32(0, false) === HUNK_HEADER
}
