// Parse .draw bitmap font files.
// Format: hex label (e.g. "00:") followed by tab-indented rows of '#' (set) and '-' (unset) pixels.

export interface DrawParseResult {
  fontData: Uint8Array
  startChar: number
  glyphWidth: number
  glyphHeight: number
  populated: Set<number>
}

export function parseDraw(text: string): DrawParseResult {
  const lines = text.split(/\r?\n/)

  const glyphs: { codepoint: number; rows: string[] }[] = []
  let current: { codepoint: number; rows: string[] } | null = null

  for (const line of lines) {
    // Tab-indented line = bitmap row for current glyph
    if (line.startsWith('\t') && current) {
      current.rows.push(line.substring(1))
      continue
    }

    // Hex label line: "00:", "7F:", "FF:" etc.
    const match = line.match(/^([0-9a-fA-F]+):\s*$/)
    if (match) {
      current = { codepoint: parseInt(match[1], 16), rows: [] }
      // Check if there's bitmap data on the same line after the label (e.g. "00:\t########")
      glyphs.push(current)
      continue
    }

    // Label with inline bitmap: "00:\t########"
    const inlineMatch = line.match(/^([0-9a-fA-F]+):\t(.+)$/)
    if (inlineMatch) {
      current = { codepoint: parseInt(inlineMatch[1], 16), rows: [inlineMatch[2]] }
      glyphs.push(current)
      continue
    }

    // Comment or blank line
    current = null
  }

  const coded = glyphs.filter(g => g.rows.length > 0)
  if (coded.length === 0) throw new Error('No glyphs found in .draw file')

  const glyphHeight = coded[0].rows.length
  const glyphWidth = coded[0].rows[0].length

  let minCp = 0x7FFFFFFF, maxCp = 0
  for (const g of coded) {
    if (g.codepoint < minCp) minCp = g.codepoint
    if (g.codepoint > maxCp) maxCp = g.codepoint
  }

  const totalSlots = maxCp - minCp + 1
  const bpr = Math.ceil(glyphWidth / 8)
  const bpg = glyphHeight * bpr
  const fontData = new Uint8Array(totalSlots * bpg)
  const populated = new Set<number>()

  for (const g of coded) {
    const idx = g.codepoint - minCp
    const offset = idx * bpg
    populated.add(idx)

    for (let y = 0; y < glyphHeight && y < g.rows.length; y++) {
      const row = g.rows[y]
      for (let x = 0; x < glyphWidth && x < row.length; x++) {
        if (row[x] === '#') {
          fontData[offset + y * bpr + Math.floor(x / 8)] |= (0x80 >> (x % 8))
        }
      }
    }
  }

  return { fontData, startChar: minCp, glyphWidth, glyphHeight, populated }
}
