// Parse Atari ST GDOS .fnt bitmap font files.
//
// The .fnt format originated on PC GEM (Intel, little-endian) but is also used
// natively on Atari ST (Motorola 68000, big-endian). Files may use either byte
// order for header fields and the character offset table. We auto-detect by
// checking which endianness yields plausible header values.
//
// Format:
//   Header (88 bytes):
//     0-1:   Face ID
//     2-3:   Face size (points)
//     4-35:  Face name (32-byte null-padded ASCII)
//     36-37: Lowest character index (usually 32)
//     38-39: Highest character index
//     40-41: Top line distance (positive offset from baseline = baseline row)
//     42-43: Ascent line distance (positive offset from baseline, upward)
//     44-45: Half line distance
//     46-47: Descent line distance (positive offset from baseline, downward)
//     48-49: Bottom line distance
//     50-51: Width of widest character
//     52-53: Width of widest character cell
//     54-55: Left offset
//     56-57: Right offset
//     58-59: Thickening size
//     60-61: Underline size
//     62-63: Lightening mask (usually 0x5555)
//     64-65: Skewing mask (usually 0x5555)
//     66-67: Font flags
//       Bit 0: system font
//       Bit 1: use horizontal offset table
//       Bit 2: font data need not be byte-swapped (data is big-endian)
//       Bit 3: monospaced
//     68-71: Offset to horizontal offset table
//     72-75: Offset to character offset table
//     76-79: Offset to font data
//     80-81: Form width (bytes)
//     82-83: Form height (scanlines)
//     84-87: Next font pointer (0 on disk)
//   Character offset table: (numChars + 1) WORDs, same endianness as header
//   Font data: formHeight * formWidth bytes
//     If flag bit 2 is clear, font data WORDs are in Intel (LE) byte order.
//     If flag bit 2 is set, font data WORDs are in Motorola (BE) byte order.

import type { GlyphMeta, FontMeta } from './bdfParser'
import { bpr, getBit, setBit } from '../bitUtils'

export interface GdosFontParseResult {
  fontData: Uint8Array
  startChar: number
  glyphWidth: number
  glyphHeight: number
  populated: Set<number>
  glyphMeta: (GlyphMeta | null)[]
  baseline: number
  ascender: number
  descender: number
  meta: FontMeta
}

/** Auto-detect whether the header is big-endian or little-endian. */
function detectBigEndian(view: DataView, fileSize: number): boolean {
  // formHeight (bytes 82-83) should be a reasonable pixel height (1-128).
  // One endianness will give the real value; the other will give value*256.
  const hBE = view.getUint16(82, false)
  const hLE = view.getUint16(82, true)
  const beOk = hBE > 0 && hBE <= 128
  const leOk = hLE > 0 && hLE <= 128
  if (beOk && !leOk) return true
  if (leOk && !beOk) return false

  // Both plausible; check font data offset validity
  const fdBE = view.getUint32(76, false)
  const fdLE = view.getUint32(76, true)
  const fdBeOk = fdBE >= 88 && fdBE < fileSize
  const fdLeOk = fdLE >= 88 && fdLE < fileSize
  if (fdBeOk && !fdLeOk) return true
  if (fdLeOk && !fdBeOk) return false

  // Default to big-endian (native Atari ST)
  return true
}

/** Read a pixel from the font raster using standard byte access. */
function getRasterBit(
  raster: Uint8Array, formWidth: number, x: number, y: number,
): boolean {
  const rowBase = y * formWidth
  return getBit(raster, rowBase, x)
}

export function parseGdosFont(buf: ArrayBuffer): GdosFontParseResult {
  const bytes = new Uint8Array(buf)
  if (bytes.length < 88) throw new Error('File too small to be a GDOS .fnt font')

  const view = new DataView(buf)
  const be = detectBigEndian(view, bytes.length)
  const le = !be

  const faceId      = view.getUint16(0, le)
  const faceSize    = view.getUint16(2, le)
  const faceName    = String.fromCharCode(...bytes.slice(4, 36)).replace(/\0.*$/, '')
  const loChar      = view.getUint16(36, le)
  const hiChar      = view.getUint16(38, le)
  const topLine     = view.getUint16(40, le)
  const ascentLine  = view.getUint16(42, le)
  const halfLine    = view.getUint16(44, le)
  const descentLine = view.getUint16(46, le)
  const leftOffset  = view.getUint16(54, le)
  const rightOffset = view.getUint16(56, le)
  const thickening  = view.getUint16(58, le)
  const ulSize      = view.getUint16(60, le)
  const fontFlags   = view.getUint16(66, le)

  const horizTablePos = view.getUint32(68, le)
  const charTablePos  = view.getUint32(72, le)
  const fontDataPos   = view.getUint32(76, le)
  const formWidth     = view.getUint16(80, le)  // bytes per scanline
  const formHeight    = view.getUint16(82, le)  // scanlines

  if (hiChar < loChar)  throw new Error('GDOS FNT: hiChar < loChar')
  if (formHeight === 0) throw new Error('GDOS FNT: zero form height')
  if (formWidth === 0)  throw new Error('GDOS FNT: zero form width')

  const numChars = hiChar - loChar + 1

  // --- Character offset table: (numChars + 1) WORDs ---
  const cotEnd = charTablePos + (numChars + 1) * 2
  if (cotEnd > bytes.length) throw new Error('GDOS FNT: character offset table out of bounds')

  const charOffsets: number[] = []
  for (let i = 0; i <= numChars; i++) {
    charOffsets.push(view.getUint16(charTablePos + i * 2, le))
  }

  // --- Optional horizontal offset table ---
  const hasHorizTable = !!(fontFlags & 0x02) && horizTablePos > 0
  const horizOffsets: number[] = new Array(numChars).fill(0)
  if (hasHorizTable && horizTablePos + numChars * 2 <= bytes.length) {
    for (let i = 0; i < numChars; i++) {
      horizOffsets[i] = view.getInt16(horizTablePos + i * 2, le)
    }
  }

  // --- Font raster ---
  const rasterSize = formWidth * formHeight
  if (fontDataPos + rasterSize > bytes.length)
    throw new Error('GDOS FNT: font data out of bounds')
  const raster = bytes.slice(fontDataPos, fontDataPos + rasterSize)

  // Standard byte access works for both LE and BE font files on disk.
  // The byte-swap flag is only relevant for in-memory 68000 WORD access.

  // --- Find max character pixel width ---
  let maxWidth = 0
  for (let i = 0; i < numChars; i++) {
    const w = charOffsets[i + 1] - charOffsets[i]
    if (w > maxWidth) maxWidth = w
  }
  if (maxWidth === 0) maxWidth = 8

  // --- Extract glyphs into fixed-width grid ---
  const rowBytes = bpr(maxWidth)
  const bpg = formHeight * rowBytes
  const fontData = new Uint8Array(numChars * bpg)
  const populated = new Set<number>()
  const glyphMeta: (GlyphMeta | null)[] = new Array(numChars).fill(null)

  for (let i = 0; i < numChars; i++) {
    const xStart    = charOffsets[i]
    const charWidth = charOffsets[i + 1] - xStart
    if (charWidth <= 0) continue

    const advanceWidth = charWidth + horizOffsets[i]
    const glyphBase = i * bpg
    let hasPixels = false

    for (let y = 0; y < formHeight; y++) {
      const dstRow = glyphBase + y * rowBytes
      for (let px = 0; px < charWidth; px++) {
        if (getRasterBit(raster, formWidth, xStart + px, y)) {
          setBit(fontData, dstRow, px)
          hasPixels = true
        }
      }
    }

    if (hasPixels) populated.add(i)
    glyphMeta[i] = {
      bbx:    [charWidth, formHeight, 0, 0],
      dwidth: [Math.max(1, advanceWidth), 0],
    }
  }

  return {
    fontData,
    startChar:   loChar,
    glyphWidth:  maxWidth,
    glyphHeight: formHeight,
    populated,
    glyphMeta,
    baseline:  topLine > 0 ? topLine - 1 : 0,
    ascender:  ascentLine,
    descender: descentLine,
    meta: {
      family: faceName,
      pointSize: faceSize,
      properties: {
        GDOS_FACE_ID:      String(faceId),
        GDOS_HALF_LINE:    String(halfLine),
        GDOS_LEFT_OFFSET:  String(leftOffset),
        GDOS_RIGHT_OFFSET: String(rightOffset),
        GDOS_THICKENING:   String(thickening),
        GDOS_UNDERLINE:    String(ulSize),
      },
    },
  }
}
