// Write .draw bitmap font files.

import { getBit } from '../bitUtils'
import { isGlyphEmpty } from './glyphUtils'

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
    if (charCode !== 0x20 && isGlyphEmpty(fontData, offset, bpg)) continue

    const hex = charCode.toString(16).padStart(2, '0').toUpperCase()
    let first = true
    for (let y = 0; y < h; y++) {
      let row = ''
      for (let x = 0; x < w; x++) {
        row += getBit(fontData, offset + y * bpr, x) ? '#' : '-'
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
