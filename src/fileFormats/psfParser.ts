// Parse PSF (PC Screen Font) files — both PSF1 and PSF2 formats.

export interface PsfParseResult {
  glyphWidth: number
  glyphHeight: number
  glyphCount: number
  fontData: Uint8Array
  unicodeMap: Map<number, number> | null // codepoint -> glyph index
}

const PSF1_MAGIC = 0x0436
const PSF2_MAGIC = 0x864AB572

const PSF1_MODE_HAS_TAB = 0x01
const PSF1_MODE_HAS_SEQ = 0x02
const PSF1_MODE_512 = 0x01

export function parsePsf(buffer: ArrayBuffer): PsfParseResult {
  const view = new DataView(buffer)
  const bytes = new Uint8Array(buffer)

  // Try PSF2 first (4-byte magic)
  if (buffer.byteLength >= 32 && view.getUint32(0, true) === PSF2_MAGIC) {
    return parsePsf2(view, bytes)
  }

  // Try PSF1 (2-byte magic)
  if (buffer.byteLength >= 4 && view.getUint16(0, true) === PSF1_MAGIC) {
    return parsePsf1(bytes)
  }

  throw new Error('Not a valid PSF file')
}

function parsePsf1(bytes: Uint8Array): PsfParseResult {
  const mode = bytes[2]
  const charSize = bytes[3] // bytes per glyph = height (width is always 8)
  const glyphCount = (mode & PSF1_MODE_512) ? 512 : 256
  const height = charSize
  const width = 8
  const bitmapStart = 4
  const bitmapSize = glyphCount * charSize

  if (bytes.length < bitmapStart + bitmapSize) {
    throw new Error('PSF1 file too short for declared glyph count')
  }

  // PSF1 stores 1 byte per row (8px wide) which matches our internal format
  const fontData = bytes.slice(bitmapStart, bitmapStart + bitmapSize)

  // Parse unicode table if present
  const hasUnicode = (mode & (PSF1_MODE_HAS_TAB | PSF1_MODE_HAS_SEQ)) !== 0
  let unicodeMap: Map<number, number> | null = null
  if (hasUnicode && bytes.length > bitmapStart + bitmapSize) {
    unicodeMap = parsePsf1UnicodeTable(bytes, bitmapStart + bitmapSize, glyphCount)
  }

  return { glyphWidth: width, glyphHeight: height, glyphCount, fontData, unicodeMap }
}

function parsePsf1UnicodeTable(bytes: Uint8Array, offset: number, glyphCount: number): Map<number, number> {
  const map = new Map<number, number>()
  let pos = offset
  let glyph = 0

  while (pos < bytes.length && glyph < glyphCount) {
    // Each entry: sequence of uint16le codepoints, terminated by 0xFFFF
    // Sequences start with 0xFFFE (we skip those)
    while (pos + 1 < bytes.length) {
      const val = bytes[pos] | (bytes[pos + 1] << 8)
      pos += 2
      if (val === 0xFFFF) break // end of entry
      if (val === 0xFFFE) continue // start of sequence, skip
      if (!map.has(val)) {
        map.set(val, glyph)
      }
    }
    glyph++
  }

  return map
}

function parsePsf2(view: DataView, bytes: Uint8Array): PsfParseResult {
  // PSF2 header: 32 bytes
  // 0-3: magic, 4-7: version, 8-11: header size, 12-15: flags
  // 16-19: glyph count, 20-23: bytes per glyph, 24-27: height, 28-31: width
  const headerSize = view.getUint32(8, true)
  const flags = view.getUint32(12, true)
  const glyphCount = view.getUint32(16, true)
  const bytesPerGlyph = view.getUint32(20, true)
  const height = view.getUint32(24, true)
  const width = view.getUint32(28, true)

  const bitmapStart = headerSize
  const bitmapSize = glyphCount * bytesPerGlyph

  if (bytes.length < bitmapStart + bitmapSize) {
    throw new Error('PSF2 file too short for declared glyph count')
  }

  // PSF2 stores ceil(width/8) bytes per row, same as our format
  const fontData = bytes.slice(bitmapStart, bitmapStart + bitmapSize)

  // Parse unicode table if present (flag bit 0)
  let unicodeMap: Map<number, number> | null = null
  if ((flags & 1) && bytes.length > bitmapStart + bitmapSize) {
    unicodeMap = parsePsf2UnicodeTable(bytes, bitmapStart + bitmapSize, glyphCount)
  }

  return { glyphWidth: width, glyphHeight: height, glyphCount, fontData, unicodeMap }
}

function parsePsf2UnicodeTable(bytes: Uint8Array, offset: number, glyphCount: number): Map<number, number> {
  const map = new Map<number, number>()
  let pos = offset
  let glyph = 0

  while (pos < bytes.length && glyph < glyphCount) {
    // Each entry: sequence of UTF-8 codepoints, separated by 0xFE, terminated by 0xFF
    while (pos < bytes.length) {
      const b = bytes[pos]
      if (b === 0xFF) { pos++; break } // end of entry
      if (b === 0xFE) { pos++; continue } // start of sequence, skip rest

      // Decode one UTF-8 codepoint
      let cp: number
      let len: number
      if (b < 0x80) { cp = b; len = 1 }
      else if (b < 0xE0) { cp = b & 0x1F; len = 2 }
      else if (b < 0xF0) { cp = b & 0x0F; len = 3 }
      else { cp = b & 0x07; len = 4 }

      for (let i = 1; i < len && pos + i < bytes.length; i++) {
        cp = (cp << 6) | (bytes[pos + i] & 0x3F)
      }
      pos += len

      if (!map.has(cp)) {
        map.set(cp, glyph)
      }
    }
    glyph++
  }

  return map
}
