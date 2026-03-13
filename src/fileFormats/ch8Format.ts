// .ch8 and .udg format: raw sequential glyph pixel data, 1 byte per 8 pixels per row.
// No header, no metadata — just bytes.

export function parseCh8(buffer: ArrayBuffer, bytesPerGlyph: number): Uint8Array {
  const bytes = new Uint8Array(buffer)
  const count = bytesPerGlyph > 0 ? Math.floor(bytes.length / bytesPerGlyph) : 0
  return bytes.slice(0, count * bytesPerGlyph)
}

export function writeCh8(data: Uint8Array): Uint8Array {
  return new Uint8Array(data)
}
