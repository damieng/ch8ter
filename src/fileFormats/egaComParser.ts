// Parse Pete Kvitek's EGA/VGA .COM font loader files.
//
// These are DOS COM executables with a loader stub followed by 256 glyphs
// of raw 8px-wide bitmap data. Font height is 8, 14, or 16.
//
// Detection: starts with E9 (JMP), contains "font" in the version string.
// Height detection: search for INT 10h AX=1100h pattern.

export interface EgaComParseResult {
  fontData: Uint8Array
  startChar: number
  glyphWidth: number
  glyphHeight: number
}

/** Find INT 10h font load pattern and extract font offset.
 *  Supports both AX=1100h (Kvitek) and AX=1110h (Mefford) patterns. */
function findFontFromCode(data: Uint8Array): { height: number; offset: number } | null {
  for (let i = 0; i < data.length - 13; i++) {
    // Look for B8 xx 11 ... CD 10 (INT 10h function 11xxh)
    if (data[i] !== 0xB8 || data[i + 2] !== 0x11) continue
    const subFunc = data[i + 1]
    if (subFunc !== 0x00 && subFunc !== 0x10) continue // 1100h or 1110h

    // Find CD 10 (INT 10h) nearby
    let intPos = -1
    for (let k = i + 3; k < Math.min(i + 20, data.length - 1); k++) {
      if (data[k] === 0xCD && data[k + 1] === 0x10) { intPos = k; break }
    }
    if (intPos < 0) continue

    // Look for height in BH (BB xx HH) or standalone byte patterns
    // Kvitek: BB xx HH where HH is height
    // Mefford: various patterns, height often loaded from memory
    for (let j = i + 3; j < intPos; j++) {
      if (data[j] === 0xBB) {
        const height = data[j + 2]
        if (height !== 8 && height !== 14 && height !== 16) continue
        // Look for MOV BP, xxxx (BD xx xx) nearby
        for (let k = Math.max(0, i - 30); k < intPos; k++) {
          if (data[k] === 0xBD) {
            const bpVal = data[k + 1] | (data[k + 2] << 8)
            const fileOff = bpVal - 0x100
            if (fileOff > 0 && fileOff + 256 * height <= data.length) {
              return { height, offset: fileOff }
            }
          }
        }
      }
    }
  }
  return null
}

/** Fallback: scan file for font data at any offset. Prefer tallest font found. */
function findFontFromScan(data: Uint8Array): { height: number; offset: number } | null {
  let best: { height: number; offset: number } | null = null
  for (const height of [16, 14, 8]) {
    const fontSize = 256 * height
    if (fontSize > data.length - 32) continue

    for (let offset = 0; offset <= data.length - fontSize; offset++) {
      // Space (char 32) should be all zeros
      const spaceOff = offset + 32 * height
      let spaceOk = true
      for (let r = 0; r < height; r++) {
        if (data[spaceOff + r] !== 0) { spaceOk = false; break }
      }
      if (!spaceOk) continue

      // 'A' (char 65) should have pixels
      const aOff = offset + 65 * height
      let aPixels = 0
      for (let r = 0; r < height; r++) {
        if (data[aOff + r] !== 0) aPixels++
      }
      if (aPixels < height / 3) continue

      // 'B' (char 66) should also have pixels
      const bOff = offset + 66 * height
      let bPixels = 0
      for (let r = 0; r < height; r++) {
        if (data[bOff + r] !== 0) bPixels++
      }
      if (bPixels < height / 3) continue

      // Prefer tallest font
      if (!best || height > best.height) {
        best = { height, offset }
      }
      break // found one for this height, no need to keep scanning
    }
  }
  return best
}

export function isEgaCom(buf: ArrayBuffer): boolean {
  const bytes = new Uint8Array(buf)
  if (bytes.length < 100 || bytes[0] !== 0xE9) return false

  const header = String.fromCharCode(...bytes.slice(3, Math.min(80, bytes.length)))
    .toLowerCase()
  if (!header.includes('font')) return false

  return findFontFromCode(bytes) !== null || findFontFromScan(bytes) !== null
}

export function parseEgaCom(buf: ArrayBuffer): EgaComParseResult {
  const bytes = new Uint8Array(buf)

  const found = findFontFromCode(bytes) ?? findFontFromScan(bytes)
  if (!found) throw new Error('Cannot determine font height from EGA COM file')

  const { height, offset } = found
  const fontSize = 256 * height
  const fontData = bytes.slice(offset, offset + fontSize)

  return {
    fontData,
    startChar: 0,
    glyphWidth: 8,
    glyphHeight: height,
  }
}
