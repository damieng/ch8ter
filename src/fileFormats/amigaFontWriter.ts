// Write Amiga bitmap font files (Hunk executable with DiskFontHeader + TextFont).
//
// Output: a single Amiga hunk file for one font size, suitable for placing
// in a font directory (e.g., Anna/10). All integers are big-endian.
//
// Layout within HUNK_DATA:
//   [0..3]:     Return code (70FF 4E75)
//   [4..17]:    Node (ln_Succ, ln_Pred, ln_Type=0x0C, ln_Pri, ln_Name)
//   [18..19]:   dfh_FileID (0x0F80)
//   [20..21]:   dfh_Revision (0)
//   [22..25]:   dfh_Segment (0)
//   [26..57]:   dfh_Name (32 bytes)
//   [58..109]:  TextFont (tf_Message + fields)
//   [110..]:    CharLoc, CharSpace, CharKern, CharData
//
// Also writes the accompanying `.font` directory file (FontDirHeader +
// TFontContents entries) that makes the font visible to diskfont.library.

import { bpr, getBit, setBit } from '../bitUtils'
import type { FontWriteData } from '../fontSave'

export function writeAmigaFont(params: FontWriteData): Uint8Array {
  const {
    fontData, glyphWidth, glyphHeight, startChar, glyphCount,
    glyphMeta, baseline, fontName, meta,
  } = params

  const rowBytes = bpr(glyphWidth)
  const bpg = glyphHeight * rowBytes
  const loChar = startChar
  const hiChar = startChar + glyphCount - 1
  // tf_LoChar/tf_HiChar are bytes; wrapping them silently would produce a
  // font whose visible range differs from the source.
  if (hiChar > 255) {
    throw new Error(`Amiga fonts support at most 256 glyphs (char range ${loChar}..${hiChar})`)
  }
  const numChars = glyphCount
  const numEntries = numChars + 1 // +1 for replacement glyph

  // Determine per-glyph pixel widths and advance widths
  const bitWidths: number[] = []
  const advanceWidths: number[] = []
  const kerns: number[] = []
  let isProportional = false
  let maxAdvance = 0

  for (let i = 0; i < numChars; i++) {
    const gm = glyphMeta?.[i]
    const advW = gm?.dwidth?.[0] ?? glyphWidth

    // Find rightmost pixel
    let rightmost = 0
    const glyphBase = i * bpg
    for (let y = 0; y < glyphHeight; y++) {
      for (let x = glyphWidth - 1; x >= rightmost; x--) {
        if (getBit(fontData, glyphBase + y * rowBytes, x)) {
          rightmost = x + 1
          break
        }
      }
    }
    const bitW = Math.max(rightmost, 1)
    bitWidths.push(bitW)
    advanceWidths.push(Math.max(advW, 1))
    kerns.push(0)
    if (advW !== advanceWidths[0]) isProportional = true
    if (advW > maxAdvance) maxAdvance = advW
  }

  // Replacement glyph (empty)
  bitWidths.push(glyphWidth)
  advanceWidths.push(glyphWidth)
  kerns.push(0)

  // Build bitmap raster — all glyphs side by side
  // CharLoc uses bit offsets, so we pack tightly
  const bitOffsets: number[] = []
  let totalBits = 0
  for (let i = 0; i < numEntries; i++) {
    bitOffsets.push(totalBits)
    totalBits += bitWidths[i]
  }
  const modulo = Math.ceil(totalBits / 8)
  // Pad modulo to even (word-aligned)
  const paddedModulo = (modulo + 1) & ~1

  const bitmapSize = paddedModulo * glyphHeight
  const bitmap = new Uint8Array(bitmapSize)

  for (let i = 0; i < numChars; i++) {
    const glyphBase = i * bpg
    const bitOff = bitOffsets[i]
    const bitW = bitWidths[i]

    for (let y = 0; y < glyphHeight; y++) {
      const srcRow = glyphBase + y * rowBytes
      const dstRowBase = y * paddedModulo
      for (let px = 0; px < bitW; px++) {
        if (getBit(fontData, srcRow, px)) {
          const dstBit = bitOff + px
          setBit(bitmap, dstRowBase, dstBit)
        }
      }
    }
  }

  // Calculate data layout offsets (within hunk data)
  const headerSize = 110 // DiskFontHeader (4+14+4+4+32) + TextFont (52)
  const charLocSize = numEntries * 4
  const charSpaceSize = isProportional ? numEntries * 2 : 0
  const charKernSize = isProportional ? numEntries * 2 : 0

  const charLocOff = headerSize
  const charSpaceOff = charLocOff + charLocSize
  const charKernOff = charSpaceOff + charSpaceSize
  const charDataOff = charKernOff + charKernSize

  const totalDataSize = charDataOff + bitmapSize
  // Pad to longword boundary
  const paddedDataSize = (totalDataSize + 3) & ~3

  // Build hunk data
  const hunkData = new Uint8Array(paddedDataSize)
  const hv = new DataView(hunkData.buffer)

  // Return code
  hunkData[0] = 0x70; hunkData[1] = 0xFF; hunkData[2] = 0x4E; hunkData[3] = 0x75

  // Node
  // ln_Succ, ln_Pred = 0
  hunkData[12] = 0x0C // ln_Type = NT_FONT
  // ln_Pri = 0
  hv.setUint32(14, 26, false) // ln_Name -> offset 26 (dfh_Name)

  // DiskFontHeader
  hv.setUint16(18, 0x0F80, false) // dfh_FileID
  // dfh_Revision = 0, dfh_Segment = 0

  // dfh_Name (32 bytes at offset 26)
  const name = fontName || meta?.family || 'Font'
  for (let i = 0; i < Math.min(31, name.length); i++) {
    hunkData[26 + i] = name.charCodeAt(i) & 0xFF
  }

  // TextFont (starts at offset 58)
  const tf = 58
  // tf_Message: Node (14 bytes) + ReplyPort (4) + Length (2) = 20 bytes, all zeros
  hv.setUint16(tf + 20, glyphHeight, false) // tf_YSize
  hunkData[tf + 22] = 0 // tf_Style
  hunkData[tf + 23] = (isProportional ? 0x20 : 0x00) | 0x40 | 0x02 // FPF_PROPORTIONAL | FPF_DESIGNED | FPF_DISKFONT
  hv.setUint16(tf + 24, maxAdvance, false) // tf_XSize
  hv.setUint16(tf + 26, baseline + 1, false) // tf_Baseline (1-indexed from top)
  hv.setUint16(tf + 28, 1, false) // tf_BoldSmear
  // tf_Accessors = 0
  hunkData[tf + 32] = loChar & 0xFF // tf_LoChar
  hunkData[tf + 33] = hiChar & 0xFF // tf_HiChar
  hv.setUint32(tf + 34, charDataOff, false) // tf_CharData
  hv.setUint16(tf + 38, paddedModulo, false) // tf_Modulo
  hv.setUint32(tf + 40, charLocOff, false) // tf_CharLoc
  hv.setUint32(tf + 44, isProportional ? charSpaceOff : 0, false) // tf_CharSpace
  hv.setUint32(tf + 48, isProportional ? charKernOff : 0, false) // tf_CharKern

  // CharLoc table: {bitOffset: u16, bitWidth: u16} per entry
  for (let i = 0; i < numEntries; i++) {
    if (bitOffsets[i] > 0xFFFF) {
      throw new Error('Amiga font bitmap data too large (CharLoc bit offsets are 16-bit)')
    }
    hv.setUint16(charLocOff + i * 4, bitOffsets[i], false)
    hv.setUint16(charLocOff + i * 4 + 2, bitWidths[i], false)
  }

  // CharSpace table (proportional only)
  if (isProportional) {
    for (let i = 0; i < numEntries; i++) {
      hv.setInt16(charSpaceOff + i * 2, advanceWidths[i], false)
    }
  }

  // CharKern table (proportional only)
  if (isProportional) {
    for (let i = 0; i < numEntries; i++) {
      hv.setInt16(charKernOff + i * 2, kerns[i], false)
    }
  }

  // Bitmap data
  hunkData.set(bitmap, charDataOff)

  // Build relocation table for pointer fields
  // Offsets within hunk data that need HUNK_RELOC32 fixup:
  const relocOffsets = [
    14,       // ln_Name
    tf + 34,  // tf_CharData
    tf + 40,  // tf_CharLoc
  ]
  if (isProportional) {
    relocOffsets.push(tf + 44) // tf_CharSpace
    relocOffsets.push(tf + 48) // tf_CharKern
  }

  // Build HUNK_RELOC32 section
  // Format: count:u32, hunkNum:u32, offsets...:u32[], terminated by count=0
  const relocSize = 4 + 4 + relocOffsets.length * 4 + 4 // count + hunkNum + offsets + terminator

  // Assemble the complete file
  // HUNK_HEADER: magic, 0 (no libs), 1 (table size), 0 (first), 0 (last), size
  // HUNK_DATA: size, data
  // HUNK_RELOC32: relocs
  // HUNK_END
  const hunkHeaderSize = 6 * 4 // 6 longwords
  const hunkDataHeader = 2 * 4 // type + size
  const hunkEndSize = 4

  const totalFileSize = hunkHeaderSize + hunkDataHeader + paddedDataSize + 4 + relocSize + hunkEndSize

  const file = new Uint8Array(totalFileSize)
  const fv = new DataView(file.buffer)
  let pos = 0

  // HUNK_HEADER
  fv.setUint32(pos, 0x000003F3, false); pos += 4 // magic
  fv.setUint32(pos, 0, false); pos += 4           // no resident libs
  fv.setUint32(pos, 1, false); pos += 4           // table size
  fv.setUint32(pos, 0, false); pos += 4           // first hunk
  fv.setUint32(pos, 0, false); pos += 4           // last hunk
  fv.setUint32(pos, paddedDataSize / 4, false); pos += 4 // hunk size in longwords

  // HUNK_DATA
  fv.setUint32(pos, 0x000003E9, false); pos += 4 // HUNK_DATA
  fv.setUint32(pos, paddedDataSize / 4, false); pos += 4 // data size in longwords
  file.set(hunkData, pos); pos += paddedDataSize

  // HUNK_RELOC32
  fv.setUint32(pos, 0x000003EC, false); pos += 4 // HUNK_RELOC32
  fv.setUint32(pos, relocOffsets.length, false); pos += 4 // count
  fv.setUint32(pos, 0, false); pos += 4 // hunk number
  for (const off of relocOffsets) {
    fv.setUint32(pos, off, false); pos += 4
  }
  fv.setUint32(pos, 0, false); pos += 4 // terminator

  // HUNK_END
  fv.setUint32(pos, 0x000003F2, false)

  return file
}

// --- .font directory file ---

/** Sanitized base name shared by the .font file and its size-file paths. */
export function amigaFontBaseName(fontName: string): string {
  const cleaned = (fontName || 'font').replace(/[^A-Za-z0-9 _\-]/g, '').trim()
  return cleaned.length > 0 ? cleaned.slice(0, 28) : 'font'
}

/**
 * Write the `.font` directory file (FontDirHeader + TFontContents entries)
 * that references the size-suffixed hunk font. diskfont.library reads this
 * to enumerate the font; layout is big-endian:
 *
 *   ULONG FileID            = $0F00
 *   UWORD numEntries
 *   TFontContents[numEntries] (84 bytes each):
 *     Message (20 bytes) + TextFont fields + char fileName[32]
 */
export function writeAmigaFontIndex(params: FontWriteData): Uint8Array {
  const {
    glyphWidth, glyphHeight, startChar, glyphCount,
    glyphMeta, baseline, fontName,
  } = params

  if (glyphCount < 1) throw new Error('Amiga font index requires at least one glyph')
  const hiChar = startChar + glyphCount - 1
  if (startChar < 0 || hiChar > 255) {
    throw new Error(`Amiga font index supports character codes 0..255 (got ${startChar}..${hiChar})`)
  }

  const baseName = amigaFontBaseName(fontName)
  const entryPath = `${baseName}/${glyphHeight}`
  const isProportional = (glyphMeta?.some(g => g?.dwidth?.[0] != null && g.dwidth[0] !== glyphWidth)) ?? false

  const HEADER_SIZE = 6      // ULONG FileID + UWORD numEntries
  const ENTRY_SIZE = 84      // 20-byte Message + TextFont fields + 32-char name
  const out = new Uint8Array(HEADER_SIZE + ENTRY_SIZE)
  const view = new DataView(out.buffer)

  view.setUint32(0, 0x0F00, false)          // FileID
  view.setUint16(4, 1, false)               // numEntries

  const e = HEADER_SIZE                     // TFontContents at offset 6
  // tf_Message (20 bytes) stays zero
  view.setUint16(e + 20, glyphHeight, false)                    // tf_YSize
  out[e + 22] = 0                                               // tf_Style
  out[e + 23] = (isProportional ? 0x20 : 0x00) | 0x40 | 0x02    // tf_Flags
  view.setUint16(e + 24, glyphWidth, false)                     // tf_XSize
  view.setUint16(e + 26, baseline + 1, false)                   // tf_Baseline (1-indexed)
  view.setUint16(e + 28, 1, false)                              // tf_BoldSmear
  view.setUint16(e + 30, 0, false)                              // tf_Accessors
  out[e + 32] = startChar                                       // tf_LoChar
  out[e + 33] = hiChar                                          // tf_HiChar
  view.setUint32(e + 34, 0, false)                              // tf_CharData (resolved on load)
  view.setUint16(e + 38, 0, false)                              // tf_Modulo
  view.setUint32(e + 40, 0, false)                              // tf_CharLoc
  view.setUint32(e + 44, 0, false)                              // tf_CharSpace
  view.setUint32(e + 48, 0, false)                              // tf_CharKern
  const pathBytes = new TextEncoder().encode(entryPath.slice(0, 32))
  out.set(pathBytes, e + 52)                                    // tf_FileName[32]

  return out
}

/**
 * Build the full Amiga installation file set for one font size:
 * the `.font` directory entry plus the size-suffixed hunk font.
 * Paths follow the standard FONTS: drawer layout.
 */
export function buildAmigaFontDirectory(data: FontWriteData): { path: string; data: Uint8Array }[] {
  const baseName = amigaFontBaseName(data.fontName)
  return [
    { path: `Fonts/${baseName}.font`, data: writeAmigaFontIndex(data) },
    { path: `Fonts/${baseName}/${data.glyphHeight}`, data: writeAmigaFont(data) },
  ]
}
