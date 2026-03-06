// Write .draw bitmap font files.

interface DrawWriteParams {
  fontData: Uint8Array
  glyphWidth: number
  glyphHeight: number
  startChar: number
  glyphCount: number
}

export function writeDraw(params: DrawWriteParams): string {
  const { fontData, glyphWidth: w, glyphHeight: h, startChar, glyphCount } = params
  const bpr = Math.ceil(w / 8)
  const bpg = h * bpr
  const lines: string[] = []

  for (let i = 0; i < glyphCount; i++) {
    const charCode = startChar + i
    const offset = i * bpg

    // Skip empty glyphs (except space)
    if (charCode !== 0x20) {
      let hasPixels = false
      for (let b = 0; b < bpg; b++) {
        if (fontData[offset + b]) { hasPixels = true; break }
      }
      if (!hasPixels) continue
    }

    const hex = charCode.toString(16).padStart(2, '0').toUpperCase()
    let first = true
    for (let y = 0; y < h; y++) {
      let row = ''
      for (let x = 0; x < w; x++) {
        const byteIdx = offset + y * bpr + Math.floor(x / 8)
        row += (fontData[byteIdx] & (0x80 >> (x % 8))) ? '#' : '-'
      }
      if (first) {
        lines.push(`${hex}:\t${row}`)
        first = false
      } else {
        lines.push(`\t${row}`)
      }
    }
    lines.push('')
  }

  return lines.join('\n')
}
