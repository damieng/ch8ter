/** Returns true if every byte in the glyph at the given offset is zero. */
export function isGlyphEmpty(data: Uint8Array, offset: number, bytesPerGlyph: number): boolean {
  const end = Math.min(offset + bytesPerGlyph, data.length)
  for (let b = offset; b < end; b++) {
    if (data[b]) return false
  }
  return true
}
