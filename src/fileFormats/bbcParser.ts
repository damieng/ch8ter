// Parse BBC Micro soft-font files (VDU23 character definitions).
//
// Format: a stream of VDU23 commands, each 10 bytes:
//   Byte 0:   0x17 (VDU23 marker)
//   Byte 1:   character code (32-255)
//   Bytes 2-9: 8 rows of bitmap data (8x8, MSB = leftmost pixel)
//
// Characters can appear in any order and the file may contain
// non-VDU23 bytes which are skipped. Optional *FX20 commands
// (ASCII text) may precede the binary data.

export interface BbcParseResult {
  fontData: Uint8Array
  startChar: number
  glyphWidth: number
  glyphHeight: number
  populated: Set<number>
}

export function parseBbc(buf: ArrayBuffer): BbcParseResult {
  const bytes = new Uint8Array(buf)
  if (bytes.length < 10)
    throw new Error('File too small to contain BBC Micro character definitions')

  const glyphs = new Uint8Array(256 * 8) // all 256 possible chars
  const populated = new Set<number>()
  let firstChar = 256
  let lastChar = -1

  let pos = 0
  while (pos < bytes.length) {
    if (bytes[pos] !== 0x17) { pos++; continue } // skip non-VDU23 bytes
    if (pos + 10 > bytes.length) break // not enough data for a full definition

    const charCode = bytes[pos + 1]
    if (charCode > 255) { pos++; continue } // skip invalid char codes
    const offset = charCode * 8
    for (let y = 0; y < 8; y++) {
      glyphs[offset + y] = bytes[pos + 2 + y]
    }
    populated.add(charCode)
    if (charCode < firstChar) firstChar = charCode
    if (charCode > lastChar) lastChar = charCode
    pos += 10
  }

  if (firstChar > lastChar) {
    throw new Error('No BBC Micro character definitions found')
  }

  const fontData = glyphs.slice(firstChar * 8, (lastChar + 1) * 8)

  // Remap populated set to be relative to firstChar
  const relPopulated = new Set<number>()
  for (const cp of populated) relPopulated.add(cp - firstChar)

  return {
    fontData,
    startChar: firstChar,
    glyphWidth: 8,
    glyphHeight: 8,
    populated: relPopulated,
  }
}

/** Check if a buffer looks like a BBC soft-font (contains VDU23 sequences). */
export function isBbcFont(buf: ArrayBuffer): boolean {
  const bytes = new Uint8Array(buf)
  let vdu23Count = 0
  let pos = 0
  while (pos + 10 <= bytes.length) {
    if (bytes[pos] === 0x17 && bytes[pos + 1] >= 32) {
      vdu23Count++
      pos += 10
    } else {
      pos++
    }
  }
  return vdu23Count >= 4 // at least 4 character definitions to be confident
}
