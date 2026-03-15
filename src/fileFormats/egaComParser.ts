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

/** Find INT 10h AX=1100h pattern: B8 00 11 BB xx HH B9 00 01 BA xx xx CD 10
 *  Returns { height, fileOffset } or null. */
function findFontFromCode(data: Uint8Array): { height: number; offset: number } | null {
  for (let i = 0; i < data.length - 13; i++) {
    if (data[i] === 0xB8 && data[i + 1] === 0x00 && data[i + 2] === 0x11 &&
        data[i + 3] === 0xBB &&
        data[i + 6] === 0xB9 && data[i + 7] === 0x00 && data[i + 8] === 0x01 &&
        data[i + 9] === 0xBA &&
        data[i + 12] === 0xCD && data[i + 13] === 0x10) {
      const height = data[i + 5]
      if (height !== 8 && height !== 14 && height !== 16) continue

      // Look backwards for MOV BP, xxxx (BD xx xx)
      for (let j = i - 1; j >= Math.max(i - 20, 0); j--) {
        if (data[j] === 0xBD) {
          const bpVal = data[j + 1] | (data[j + 2] << 8)
          const fileOff = bpVal - 0x100 // COM files load at 0x100
          if (fileOff > 0 && fileOff + 256 * height <= data.length) {
            return { height, offset: fileOff }
          }
        }
      }
    }
  }
  return null
}

/** Fallback: scan from end of file for font data. */
function findFontFromTail(data: Uint8Array): { height: number; offset: number } | null {
  for (const height of [16, 14, 8]) {
    const fontSize = 256 * height
    if (fontSize > data.length - 32) continue

    const offset = data.length - fontSize
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

    return { height, offset }
  }
  return null
}

export function isEgaCom(buf: ArrayBuffer): boolean {
  const bytes = new Uint8Array(buf)
  if (bytes.length < 100 || bytes[0] !== 0xE9) return false

  const header = String.fromCharCode(...bytes.slice(3, Math.min(80, bytes.length)))
    .toLowerCase()
  if (!header.includes('font')) return false

  return findFontFromCode(bytes) !== null || findFontFromTail(bytes) !== null
}

export function parseEgaCom(buf: ArrayBuffer): EgaComParseResult {
  const bytes = new Uint8Array(buf)

  const found = findFontFromCode(bytes) ?? findFontFromTail(bytes)
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
