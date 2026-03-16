// Parse .yaff (Yet Another Font Format) bitmap font files.
// Format: key:value metadata, then glyph labels (0xNN: or u+NNNN: or named)
// followed by indented rows of '@' (set) and '.' (unset) pixels.

import { bpr, setBit } from '../bitUtils'

export interface YaffParseResult {
  fontData: Uint8Array
  startChar: number
  glyphWidth: number
  glyphHeight: number
  populated: Set<number>
  name: string | null
}

export function parseYaff(text: string): YaffParseResult {
  const lines = text.split(/\r?\n/)

  // Collect metadata and glyph blocks
  const meta: Record<string, string> = {}
  const glyphs: { codepoint: number | null; label: string; rows: string[] }[] = []
  let currentGlyph: { codepoint: number | null; label: string; rows: string[] } | null = null

  for (const line of lines) {
    // Comments
    if (line.startsWith('#') || line.length === 0) continue

    // Indented line = bitmap row for current glyph
    if (/^\s+/.test(line) && currentGlyph) {
      currentGlyph.rows.push(line.trim())
      continue
    }

    // Non-indented line with colon = either metadata or glyph label
    const colonIdx = line.indexOf(':')
    if (colonIdx < 0) continue

    const key = line.substring(0, colonIdx).trim()
    const value = line.substring(colonIdx + 1).trim()

    // Glyph label: 0xNN, u+NNNN, or named (like "default")
    const hexMatch = key.match(/^0x([0-9a-fA-F]+)$/)
    const uniMatch = key.match(/^u\+([0-9a-fA-F]+)$/i)

    if (hexMatch) {
      currentGlyph = { codepoint: parseInt(hexMatch[1], 16), label: key, rows: [] }
      glyphs.push(currentGlyph)
    } else if (uniMatch) {
      currentGlyph = { codepoint: parseInt(uniMatch[1], 16), label: key, rows: [] }
      glyphs.push(currentGlyph)
    } else if (value === '' && !key.includes(' ')) {
      // Named glyph (like "default:", "placeholder_d7:")
      currentGlyph = { codepoint: null, label: key, rows: [] }
      glyphs.push(currentGlyph)
    } else {
      // Metadata
      meta[key] = value
      currentGlyph = null
    }
  }

  // Filter to only glyphs with valid codepoints and rows
  const coded = glyphs.filter(g => g.codepoint !== null && g.rows.length > 0) as
    { codepoint: number; label: string; rows: string[] }[]

  if (coded.length === 0) throw new Error('No glyphs found in YAFF file')

  // Determine glyph dimensions from first glyph
  const glyphHeight = coded[0].rows.length
  const glyphWidth = coded[0].rows[0].length

  // Find codepoint range
  let minCp = 0x7FFFFFFF, maxCp = 0
  for (const g of coded) {
    if (g.codepoint < minCp) minCp = g.codepoint
    if (g.codepoint > maxCp) maxCp = g.codepoint
  }

  const totalSlots = maxCp - minCp + 1
  const rowBytes = bpr(glyphWidth)
  const bpg = glyphHeight * rowBytes
  const fontData = new Uint8Array(totalSlots * bpg)
  const populated = new Set<number>()

  for (const g of coded) {
    const idx = g.codepoint - minCp
    const offset = idx * bpg
    populated.add(idx)

    for (let y = 0; y < glyphHeight && y < g.rows.length; y++) {
      const row = g.rows[y]
      for (let x = 0; x < glyphWidth && x < row.length; x++) {
        if (row[x] === '@') {
          setBit(fontData, offset + y * rowBytes, x)
        }
      }
    }
  }

  return {
    fontData,
    startChar: minCp,
    glyphWidth,
    glyphHeight,
    populated,
    name: meta['name'] || null,
  }
}
