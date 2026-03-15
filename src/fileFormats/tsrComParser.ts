// Parse PC Magazine-style DOS TSR .COM font loaders (Michael J. Mefford).
//
// These are COM executables that use INT 10h function 1110h to load custom
// VGA text-mode fonts. They contain embedded 8px-wide bitmap font data for
// one or more heights (8, 14, 16 pixels).
//
// Detection: starts with EB (JMP short), contains "Magazine" or "Mefford".
// Font location: scan for valid font data blocks (256 chars × height bytes).

export interface TsrComParseResult {
  fontData: Uint8Array
  startChar: number
  glyphWidth: number
  glyphHeight: number
}

/** Detect a Mefford/PC Magazine TSR font loader. */
export function isTsrCom(buf: ArrayBuffer): boolean {
  const bytes = new Uint8Array(buf)
  if (bytes.length < 200) return false
  if (bytes[0] !== 0xEB && bytes[0] !== 0xE9) return false

  const header = String.fromCharCode(...bytes.slice(0, Math.min(120, bytes.length))).toLowerCase()
  return header.includes('magazine') || header.includes('mefford')
}

/** Parse the TSR COM file and extract ALL embedded fonts. */
export function parseTsrCom(buf: ArrayBuffer): TsrComParseResult[] {
  const bytes = new Uint8Array(buf)
  const results = findAllFonts(bytes)
  if (results.length === 0) throw new Error('No valid font data found in TSR COM file')
  return results.map(({ height, offset }) => ({
    fontData: bytes.slice(offset, offset + 256 * height),
    startChar: 0,
    glyphWidth: 8,
    glyphHeight: height,
  }))
}

function isValidFont(data: Uint8Array, offset: number, height: number): boolean {
  const fontSize = 256 * height
  if (offset + fontSize > data.length) return false

  // Char 0x00 (null) should be all zeros
  for (let r = 0; r < height; r++) {
    if (data[offset + r] !== 0) return false
  }

  // Space (char 0x20) should be all zeros
  const spaceOff = offset + 0x20 * height
  for (let r = 0; r < height; r++) {
    if (data[spaceOff + r] !== 0) return false
  }

  // Check multiple characters for plausibility
  // A, B, M, 0 should all have pixels in at least half the rows
  for (const ch of [0x41, 0x42, 0x4D, 0x30]) {
    const chOff = offset + ch * height
    let pixels = 0
    for (let r = 0; r < height; r++) {
      if (data[chOff + r] !== 0) pixels++
    }
    if (pixels < height / 2) return false
  }

  // Char 0x01 (smiley) should not be all zeros — distinguishes real fonts
  // from runs of zeros that happen to pass the space/null checks
  const smileyOff = offset + 0x01 * height
  let smileyPixels = 0
  for (let r = 0; r < height; r++) {
    if (data[smileyOff + r] !== 0) smileyPixels++
  }
  if (smileyPixels < 2) return false

  return true
}

function findAllFonts(data: Uint8Array): { height: number; offset: number }[] {
  const found: { height: number; offset: number }[] = []

  // Scan for each height independently
  for (const height of [16, 14, 8]) {
    const fontSize = 256 * height
    if (fontSize > data.length - 16) continue

    for (let offset = 0; offset <= data.length - fontSize; offset++) {
      if (isValidFont(data, offset, height)) {
        found.push({ height, offset })
        offset += fontSize - 1 // skip past this font
      }
    }
  }

  // Remove entries that overlap with a taller font (same byte range)
  found.sort((a, b) => b.height - a.height) // tallest first
  const filtered: { height: number; offset: number }[] = []
  for (const f of found) {
    const fEnd = f.offset + 256 * f.height
    const overlaps = filtered.some(e => {
      const eEnd = e.offset + 256 * e.height
      return f.offset < eEnd && fEnd > e.offset
    })
    if (!overlaps) filtered.push(f)
  }

  return filtered
}
