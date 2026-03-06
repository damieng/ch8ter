// Write .yaff (Yet Another Font Format) bitmap font files.

interface YaffWriteParams {
  fontData: Uint8Array
  glyphWidth: number
  glyphHeight: number
  startChar: number
  glyphCount: number
  name: string
}

export function writeYaff(params: YaffWriteParams): string {
  const { fontData, glyphWidth: w, glyphHeight: h, startChar, glyphCount, name } = params
  const bpr = Math.ceil(w / 8)
  const bpg = h * bpr
  const lines: string[] = []

  lines.push(`name: ${name}`)
  lines.push(`size: ${h}`)
  lines.push(`spacing: character-cell`)
  lines.push('')

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

    lines.push(`0x${charCode.toString(16).padStart(2, '0')}:`)

    for (let y = 0; y < h; y++) {
      let row = '    '
      for (let x = 0; x < w; x++) {
        const byteIdx = offset + y * bpr + Math.floor(x / 8)
        row += (fontData[byteIdx] & (0x80 >> (x % 8))) ? '@' : '.'
      }
      lines.push(row)
    }
    lines.push('')
  }

  return lines.join('\n')
}
