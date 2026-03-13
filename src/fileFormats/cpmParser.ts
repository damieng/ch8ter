// CP/M Plus .com font parser — PSF2AMS format
// Header is 512 bytes; glyph height at offset 0x2F; font data starts at offset 512; always 256 glyphs

export function parseCpm(buf: ArrayBuffer): { fontData: Uint8Array; glyphHeight: number } {
  const bytes = new Uint8Array(buf)
  if (bytes.length < 512)
    throw new Error('File too small to be a CP/M font .com')
  const glyphHeight = bytes[0x2f]
  if (glyphHeight === 0 || glyphHeight > 64)
    throw new Error(`Unexpected glyph height at 0x2F: ${glyphHeight}`)
  const bpg = glyphHeight // 8px wide = 1 byte per row
  const expected = 512 + 256 * bpg
  if (bytes.length < expected)
    throw new Error(`File too small for ${glyphHeight}px font (expected ${expected} bytes)`)
  return { fontData: bytes.slice(512, 512 + 256 * bpg), glyphHeight }
}
