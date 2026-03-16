/** Returns true if every byte in the glyph at the given offset is zero. */
export function isGlyphEmpty(data: Uint8Array, offset: number, bytesPerGlyph: number): boolean {
  for (let b = 0; b < bytesPerGlyph; b++) {
    if (data[offset + b]) return false
  }
  return true
}
