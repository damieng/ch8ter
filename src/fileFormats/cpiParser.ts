// Parse CPI (Code Page Information) font files.
//
// Supports three variants:
//   FONT    — MS-DOS / PC-DOS / Windows 9x
//   FONT.NT — Windows NT+
//   DRFONT  — DR-DOS (compressed with character index table)
//
// CPI files are containers: each file holds fonts for one or more codepages,
// and each codepage can contain multiple screen font sizes (e.g. 8x8, 8x14, 8x16).
//
// All multi-byte values are little-endian.

import { bpr } from '../bitUtils'

export interface CpiScreenFont {
  codepage: number
  deviceName: string
  deviceType: number    // 1 = screen, 2 = printer
  width: number
  height: number
  numChars: number
  fontData: Uint8Array  // MSBit-first packed rows (matches internal format)
}

export interface CpiParseResult {
  variant: 'FONT' | 'FONT.NT' | 'DRFONT'
  fonts: CpiScreenFont[]
}

export function parseCpi(buffer: ArrayBuffer): CpiParseResult {
  const view = new DataView(buffer)
  const bytes = new Uint8Array(buffer)

  // --- FontFileHeader (23 bytes) ---
  const id0 = bytes[0]
  if (id0 !== 0xFF && id0 !== 0x7F)
    throw new Error('Not a CPI file: invalid magic byte')

  const idStr = readAscii(bytes, 1, 7)
  let variant: CpiParseResult['variant']
  if (id0 === 0x7F && idStr.startsWith('DRFONT'))
    variant = 'DRFONT'
  else if (idStr.startsWith('FONT.NT'))
    variant = 'FONT.NT'
  else if (idStr.startsWith('FONT'))
    variant = 'FONT'
  else
    throw new Error(`Not a CPI file: unrecognized signature "${idStr}"`)

  const fihOffset = view.getUint32(0x13, true)

  // --- DRFONT extended header ---
  let drFontsPerCp = 0
  const drCellSizes: number[] = []
  const drDataOffsets: number[] = []

  if (variant === 'DRFONT') {
    const extOff = 23 // immediately after FontFileHeader
    drFontsPerCp = bytes[extOff]
    for (let i = 0; i < drFontsPerCp; i++)
      drCellSizes.push(bytes[extOff + 1 + i])
    for (let i = 0; i < drFontsPerCp; i++)
      drDataOffsets.push(view.getUint32(extOff + 1 + drFontsPerCp + i * 4, true))
  }

  // --- FontInfoHeader ---
  const numCodepages = view.getUint16(fihOffset, true)

  // --- Walk codepage entry chain ---
  const fonts: CpiScreenFont[] = []
  let cpehOffset = fihOffset + 2 // first CodePageEntryHeader follows FontInfoHeader

  for (let cp = 0; cp < numCodepages; cp++) {
    if (cpehOffset === 0 || cpehOffset >= bytes.length) break

    const deviceType = view.getUint16(cpehOffset + 0x06, true)
    const deviceName = readAscii(bytes, cpehOffset + 0x08, 8).trim()
    const codepage = view.getUint16(cpehOffset + 0x10, true)

    let cpihOffset = view.getUint32(cpehOffset + 0x18, true)
    // FONT.NT: offset is relative to CodePageEntryHeader
    if (variant === 'FONT.NT')
      cpihOffset += cpehOffset

    // --- CodePageInfoHeader (6 bytes) ---
    if (cpihOffset > 0 && cpihOffset + 6 <= bytes.length && deviceType === 1) {
      const numFonts = view.getUint16(cpihOffset + 2, true)

      if (variant === 'DRFONT') {
        // DRFONT: all ScreenFontHeaders first, then shared character index table (256 × uint16)
        const indexOff = cpihOffset + 6 + numFonts * 6
        if (indexOff + 512 <= bytes.length) {
          for (let f = 0; f < numFonts && f < drFontsPerCp; f++) {
            const sfhOff = cpihOffset + 6 + f * 6
            if (sfhOff + 6 > bytes.length) break
            const height = bytes[sfhOff]
            const width = bytes[sfhOff + 1]
            const numChars = view.getUint16(sfhOff + 4, true)
            const sizeIdx = drCellSizes.indexOf(height)
            if (sizeIdx < 0 || sizeIdx >= drDataOffsets.length) continue
            const fontData = extractDrFont(
              bytes, drDataOffsets[sizeIdx], indexOff, numChars, width, height,
            )
            fonts.push({ codepage, deviceName, deviceType, width, height, numChars, fontData })
          }
        }
      } else {
        // FONT / FONT.NT: ScreenFontHeaders each followed immediately by bitmap data
        let sfhOff = cpihOffset + 6
        for (let f = 0; f < numFonts; f++) {
          if (sfhOff + 6 > bytes.length) break
          const height = bytes[sfhOff]
          const width = bytes[sfhOff + 1]
          const numChars = view.getUint16(sfhOff + 4, true)
          const bytesPerRow = bpr(width)
          const bitmapSize = numChars * height * bytesPerRow
          const bitmapOff = sfhOff + 6

          if (bitmapOff + bitmapSize > bytes.length) break

          // CPI bitmap format is already MSBit-first packed rows — same as internal format
          const fontData = new Uint8Array(bitmapSize)
          fontData.set(bytes.subarray(bitmapOff, bitmapOff + bitmapSize))

          fonts.push({ codepage, deviceName, deviceType, width, height, numChars, fontData })
          sfhOff = bitmapOff + bitmapSize
        }
      }
    }

    // Advance to next codepage entry
    const nextOffset = view.getUint32(cpehOffset + 0x02, true)
    if (nextOffset === 0) break
    cpehOffset = variant === 'FONT.NT' ? cpehOffset + nextOffset : nextOffset
  }

  return { variant, fonts }
}

/** Extract a DRFONT font by resolving the character index table. */
function extractDrFont(
  bytes: Uint8Array, dataOffset: number, indexOffset: number,
  numChars: number, width: number, height: number,
): Uint8Array {
  const bytesPerRow = bpr(width)
  const bytesPerGlyph = height * bytesPerRow
  const fontData = new Uint8Array(numChars * bytesPerGlyph)
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)

  for (let ch = 0; ch < numChars && ch < 256; ch++) {
    const charIdx = view.getUint16(indexOffset + ch * 2, true)
    const srcOff = dataOffset + charIdx * bytesPerGlyph
    if (srcOff + bytesPerGlyph <= bytes.length) {
      fontData.set(bytes.subarray(srcOff, srcOff + bytesPerGlyph), ch * bytesPerGlyph)
    }
  }

  return fontData
}

function readAscii(bytes: Uint8Array, offset: number, length: number): string {
  let s = ''
  for (let i = 0; i < length; i++)
    s += String.fromCharCode(bytes[offset + i])
  return s
}
