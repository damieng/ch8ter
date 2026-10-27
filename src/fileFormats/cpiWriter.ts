// Write CPI (Code Page Information) font files.
//
// Emits the classic FONT variant (MS-DOS / PC-DOS / Windows 9x) with a single
// screen-font codepage entry — the simplest and most widely accepted form.
// CPI screen fonts are indexed from character code 0, so the glyph array is
// written in stored order (callers remap before saving where needed).

import type { FontWriteData } from '../fontSave'
import { bpr } from '../bitUtils'

export function writeCpi({ fontData, glyphWidth, glyphHeight, glyphCount, fontName, detectedCharset }: FontWriteData): Uint8Array {
  if (glyphCount < 1 || glyphCount > 256) {
    throw new Error(`CPI fonts hold 1..256 characters (got ${glyphCount})`)
  }
  if (glyphHeight < 1 || glyphHeight > 255 || glyphWidth < 1 || glyphWidth > 255) {
    throw new Error(`CPI cell dimensions must fit in a byte (got ${glyphWidth}x${glyphHeight})`)
  }

  // Derive the codepage number from the detected charset (cp437 -> 437)
  const cpMatch = /^cp(\d{3,4})$/.exec(detectedCharset ?? '')
  const codepage = cpMatch ? parseInt(cpMatch[1], 10) : 437

  const bytesPerRow = bpr(glyphWidth)
  const bitmapSize = glyphCount * glyphHeight * bytesPerRow

  // --- Layout ---
  // 0x00 FontFileHeader (23 bytes)
  // 0x17 FontInfoHeader (2 bytes)
  // 0x19 CodePageEntryHeader (28 bytes — pointer field ends at +0x1B)
  // 0x35 CodePageInfoHeader (6 bytes)
  // 0x3B ScreenFontHeader (6 bytes) + bitmap
  const fihOffset = 0x17
  const cpehOffset = 0x19
  const cpihOffset = cpehOffset + 0x1C
  const sfhOffset = cpihOffset + 6
  const bitmapOffset = sfhOffset + 6

  const copyright = '\r\nCreated with Ch8ter\x1A'
  const totalSize = bitmapOffset + bitmapSize + copyright.length
  const out = new Uint8Array(totalSize)
  const view = new DataView(out.buffer)

  // --- FontFileHeader ---
  out[0] = 0xFF
  out.set(new TextEncoder().encode('FONT.CPI'), 1)
  view.setUint32(0x13, fihOffset, true)

  // --- FontInfoHeader ---
  view.setUint16(fihOffset, 1, true) // numCodepages

  // --- CodePageEntryHeader ---
  view.setUint32(cpehOffset + 0x00, 0, true)       // no next entry
  view.setUint16(cpehOffset + 0x06, 1, true)       // device type: screen
  out.set(new TextEncoder().encode('EGA     '), cpehOffset + 0x08)
  view.setUint16(cpehOffset + 0x10, codepage, true)
  view.setUint32(cpehOffset + 0x18, cpihOffset, true)

  // --- CodePageInfoHeader ---
  view.setUint16(cpihOffset + 0x00, 1, true)       // version-ish reserved word
  view.setUint16(cpihOffset + 0x02, 1, true)       // numFonts
  view.setUint16(cpihOffset + 0x04, 0, true)

  // --- ScreenFontHeader ---
  out[sfhOffset + 0] = glyphHeight
  out[sfhOffset + 1] = glyphWidth
  out[sfhOffset + 2] = glyphHeight                 // aspect: pixel height
  out[sfhOffset + 3] = glyphWidth                  // aspect: pixel width
  view.setUint16(sfhOffset + 4, glyphCount, true)

  // --- Bitmap (already MSBit-first packed rows, same as internal format) ---
  out.set(fontData.subarray(0, bitmapSize), bitmapOffset)

  // --- Trailing copyright notice ---
  out.set(new TextEncoder().encode(copyright), bitmapOffset + bitmapSize)

  void fontName
  return out
}
