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
    if (cpihOffset > 0 && cpihOffset + 6 <= bytes.length) {
      const numFonts = view.getUint16(cpihOffset + 2, true)

      if (deviceType === 2) {
        // Printer font — bitmap data is embedded in printer ESC download sequences.
        // Format: PrinterFontHeader (4 bytes) + 2 Pascal strings (select/deselect) + font data.
        // The font data contains ESC preamble then character definitions.
        // Each character: 2 attribute bytes + 11 column bytes = 13 bytes (column-major, 8 dots tall).
        const pfhOff = cpihOffset + 6
        if (pfhOff + 4 <= bytes.length) {
          const escLen = view.getUint16(pfhOff + 2, true)
          // Skip PrinterFontHeader (4) + escape strings (escLen)
          const fontDataStart = pfhOff + 4 + escLen
          const charData = findPrinterCharData(bytes, fontDataStart)
          if (charData) {
            const { offset: charOff, numChars, numColumns, attrBytes } = charData
            const height = 8
            const width = numColumns
            const stride = attrBytes + numColumns
            const fontData = columnToRowMajor(bytes, charOff, numChars, stride, attrBytes, numColumns, height)
            fonts.push({ codepage, deviceName, deviceType, width, height, numChars, fontData })
          }
        }
      } else if (variant === 'DRFONT') {
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

/**
 * Locate the start of per-character bitmap data within a printer font's ESC download stream.
 *
 * The font data begins with an ESC preamble (typically ESC 6, ESC = n1 n2, then 2 header bytes)
 * followed by character definitions. We locate the ESC = command and use its byte count to
 * determine the character data boundaries and stride.
 */
function findPrinterCharData(
  bytes: Uint8Array, start: number,
): { offset: number; numChars: number; numColumns: number; attrBytes: number } | null {
  // Scan for ESC = (0x1B 0x3D) which starts the character download command
  let escEqOff = -1
  for (let i = start; i < bytes.length - 1; i++) {
    if (bytes[i] === 0x1B && bytes[i + 1] === 0x3D) {
      escEqOff = i
      break
    }
  }
  if (escEqOff < 0 || escEqOff + 4 > bytes.length) return null

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const dataByteCount = view.getUint16(escEqOff + 2, true)

  // After ESC = n1 n2: 2 header bytes, then character data
  const headerBytes = 2
  const charDataStart = escEqOff + 4 + headerBytes
  const charDataSize = dataByteCount - headerBytes

  // Try common strides: 13 (2 attr + 11 cols) or 12 (1 attr + 11 cols)
  for (const [attrBytes, numColumns] of [[2, 11], [1, 11], [2, 12], [1, 12]] as const) {
    const stride = attrBytes + numColumns
    if (charDataSize % stride === 0) {
      const numChars = charDataSize / stride
      if (numChars >= 128 && numChars <= 256 && charDataStart + charDataSize <= bytes.length) {
        return { offset: charDataStart, numChars, numColumns, attrBytes }
      }
    }
  }

  return null
}

/**
 * Convert printer font column-major data to our internal row-major MSBit-first format.
 * Input: each char = attrBytes attribute bytes + numColumns column bytes
 *        (each column byte = 8 vertical dots, MSB = top row).
 * Output: row-major packed rows (numColumns wide × 8 tall).
 */
function columnToRowMajor(
  bytes: Uint8Array, offset: number, numChars: number,
  stride: number, attrBytes: number, numColumns: number, height: number,
): Uint8Array {
  const width = numColumns
  const outBpr = bpr(width)
  const outBpg = height * outBpr
  const fontData = new Uint8Array(numChars * outBpg)

  for (let ch = 0; ch < numChars; ch++) {
    const srcBase = offset + ch * stride + attrBytes // skip attribute bytes
    const dstBase = ch * outBpg
    for (let col = 0; col < numColumns; col++) {
      if (srcBase + col >= bytes.length) break
      const colByte = bytes[srcBase + col]
      for (let row = 0; row < height; row++) {
        // Column byte: bit 7 (MSB) = top row, bit 0 = bottom row
        if (colByte & (0x80 >> row)) {
          // Set the pixel at (col, row) in row-major format
          const byteIdx = dstBase + row * outBpr + (col >> 3)
          fontData[byteIdx] |= 0x80 >> (col & 7)
        }
      }
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
