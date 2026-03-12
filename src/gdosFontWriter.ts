// Write Atari ST GDOS .fnt bitmap font files in little-endian (Intel) format.
//
// Output layout:
//   88-byte header (little-endian)
//   Character offset table: (numChars + 1) little-endian WORDs
//   Font raster data (standard byte access)
//
// No horizontal offset table is written.

import type { GlyphMeta, FontMeta } from './bdfParser'

interface GdosFontWriteParams {
  fontData: Uint8Array
  glyphWidth: number
  glyphHeight: number
  startChar: number
  glyphCount: number
  glyphMeta: (GlyphMeta | null)[] | null
  baseline: number
  ascender: number
  descender: number
  name: string
  meta: FontMeta | null
}

function rightmostPixel(
  fontData: Uint8Array, glyphOffset: number, bpr: number,
  glyphWidth: number, glyphHeight: number,
): number {
  let rightmost = 0
  for (let y = 0; y < glyphHeight; y++) {
    const rowBase = glyphOffset + y * bpr
    for (let x = glyphWidth - 1; x >= rightmost; x--) {
      if (fontData[rowBase + (x >> 3)] & (0x80 >> (x & 7))) {
        rightmost = x + 1
        break
      }
    }
  }
  return rightmost
}

export function writeGdosFont(params: GdosFontWriteParams): Uint8Array {
  const { fontData, glyphWidth, glyphHeight, startChar, glyphCount,
          glyphMeta, baseline, ascender, descender, name, meta } = params
  const props = meta?.properties ?? {}

  const bpr = Math.ceil(glyphWidth / 8)
  const bpg = glyphHeight * bpr

  const loChar = startChar
  const hiChar = startChar + glyphCount - 1

  // Per-character pixel widths (clamped to glyphWidth)
  const charWidths: number[] = []
  for (let i = 0; i < glyphCount; i++) {
    const meta = glyphMeta?.[i]
    if (meta?.bbx) {
      charWidths.push(Math.min(glyphWidth, Math.max(1, meta.bbx[0])))
    } else {
      const w = rightmostPixel(fontData, i * bpg, bpr, glyphWidth, glyphHeight)
      charWidths.push(Math.max(1, w))
    }
  }

  // Character offset table — cumulative pixel offsets
  const charOffsets: number[] = []
  let xPos = 0
  for (let i = 0; i < glyphCount; i++) {
    charOffsets.push(xPos)
    xPos += charWidths[i]
  }
  charOffsets.push(xPos)  // sentinel

  // Raster width: total pixels padded to WORD (16-pixel) boundary, in bytes
  const formWidth  = Math.max(2, ((xPos + 15) >> 4) << 1)
  const formHeight = glyphHeight

  // Build raster (big-endian: standard sequential byte access)
  const raster = new Uint8Array(formWidth * formHeight)
  for (let i = 0; i < glyphCount; i++) {
    const xStart    = charOffsets[i]
    const charWidth = charWidths[i]
    const glyphBase = i * bpg

    for (let y = 0; y < formHeight; y++) {
      const dstRow = y * formWidth
      const srcRow = glyphBase + y * bpr
      for (let px = 0; px < charWidth; px++) {
        if (fontData[srcRow + (px >> 3)] & (0x80 >> (px & 7))) {
          const x = xStart + px
          raster[dstRow + (x >> 3)] |= (0x80 >> (x & 7))
        }
      }
    }
  }

  // File layout
  const HEADER_SIZE     = 88
  const charTableOffset = HEADER_SIZE
  const charTableSize   = (glyphCount + 1) * 2
  const fontDataOffset  = (charTableOffset + charTableSize + 1) & ~1  // WORD-aligned

  const out  = new Uint8Array(fontDataOffset + raster.length)
  const view = new DataView(out.buffer)
  const LE = true  // little-endian flag for DataView

  // --- Header (little-endian) ---
  const faceId = props.GDOS_FACE_ID ? parseInt(props.GDOS_FACE_ID) : 1
  const faceSize = meta?.pointSize ?? formHeight
  view.setUint16(0, faceId, LE)     // face ID
  view.setUint16(2, faceSize, LE)   // face size (points)

  // Face name: 32 bytes — prefer stored family name, fall back to filename
  const faceName = (meta?.family || name).substring(0, 31)
  for (let i = 0; i < 32; i++) {
    out[4 + i] = i < faceName.length ? faceName.charCodeAt(i) : 0
  }

  view.setUint16(36, loChar, LE)
  view.setUint16(38, hiChar, LE)

  // Metric distances from baseline
  const topLine     = baseline + 1
  const bottomLine  = Math.max(0, formHeight - topLine)
  const ascentLine  = ascender >= 0 ? ascender : topLine
  const descentLine = descender >= 0 ? descender : bottomLine

  view.setUint16(40, topLine,                    LE)  // top
  view.setUint16(42, ascentLine,                 LE)  // ascent
  const halfLine = props.GDOS_HALF_LINE ? parseInt(props.GDOS_HALF_LINE) : Math.round(topLine / 2)
  view.setUint16(44, halfLine,                     LE)  // half
  view.setUint16(46, descentLine,                LE)  // descent
  view.setUint16(48, bottomLine,                 LE)  // bottom

  const maxCharWidth = charWidths.reduce((m, w) => Math.max(m, w), 0)
  view.setUint16(50, maxCharWidth, LE)  // widest char
  view.setUint16(52, maxCharWidth, LE)  // widest cell
  const defaultThick = Math.max(1, Math.round(formHeight / 14))
  const leftOffset   = props.GDOS_LEFT_OFFSET  ? parseInt(props.GDOS_LEFT_OFFSET)  : defaultThick
  const rightOffset  = props.GDOS_RIGHT_OFFSET ? parseInt(props.GDOS_RIGHT_OFFSET) : defaultThick
  const thickening   = props.GDOS_THICKENING   ? parseInt(props.GDOS_THICKENING)   : defaultThick
  const ulSize       = props.GDOS_UNDERLINE    ? parseInt(props.GDOS_UNDERLINE)    : defaultThick
  view.setUint16(54, leftOffset,   LE)  // left offset
  view.setUint16(56, rightOffset,  LE)  // right offset
  view.setUint16(58, thickening,   LE)  // thickening
  view.setUint16(60, ulSize,       LE)  // underline size
  view.setUint16(62, 0x5555,       LE)  // lightening mask
  view.setUint16(64, 0x5555,       LE)  // skewing mask

  // Flags: bit 2 clear = font data is little-endian (Intel format)
  view.setUint16(66, 0x00, LE)

  view.setUint32(68, charTableOffset,  LE)  // horizontal offset table (same as char table when unused)
  view.setUint32(72, charTableOffset,  LE)  // character offset table
  view.setUint32(76, fontDataOffset,   LE)  // font data
  view.setUint16(80, formWidth,        LE)  // form width in bytes
  view.setUint16(82, formHeight,       LE)  // form height
  view.setUint32(84, 0,                LE)  // next font pointer

  // --- Character offset table (little-endian) ---
  for (let i = 0; i <= glyphCount; i++) {
    view.setUint16(charTableOffset + i * 2, charOffsets[i], LE)
  }

  // --- Font raster ---
  out.set(raster, fontDataOffset)

  return out
}
