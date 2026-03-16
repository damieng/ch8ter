// Write .yaff (Yet Another Font Format) bitmap font files.

import { bpr, getBit } from '../bitUtils'
import { isGlyphEmpty } from './glyphUtils'

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
  const rowBytes = bpr(w)
  const bpg = h * rowBytes
  const lines: string[] = []

  lines.push(`name: ${name}`)
  lines.push(`size: ${h}`)
  lines.push(`spacing: character-cell`)
  lines.push('')

  for (let i = 0; i < glyphCount; i++) {
    const charCode = startChar + i
    const offset = i * bpg

    // Skip empty glyphs (except space)
    if (charCode !== 0x20 && isGlyphEmpty(fontData, offset, bpg)) continue

    lines.push(`0x${charCode.toString(16).padStart(2, '0')}:`)

    for (let y = 0; y < h; y++) {
      let row = '    '
      for (let x = 0; x < w; x++) {
        row += getBit(fontData, offset + y * rowBytes, x) ? '@' : '.'
      }
      lines.push(row)
    }
    lines.push('')
  }

  return lines.join('\n')
}
