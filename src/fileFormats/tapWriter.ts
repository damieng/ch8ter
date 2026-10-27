// Write ZX Spectrum TAP files containing a font as a CODE block.
//
// A TAP file is a sequence of blocks: [u16 length][flag + payload + parity].
// We emit the standard pair: a 17-byte header block (flag $00, type 3 =
// CODE, 10-byte name, length, start address) followed by the data block
// (flag $FF). Glyphs are 8x8, placed at their character codes.

import type { FontWriteData } from '../fontSave'

/** Default load address for the CODE block (safe upper RAM). */
const START_ADDRESS = 32768

interface TapBlock { flag: number; payload: number[] }

function makeTap(blocks: TapBlock[]): Uint8Array {
  const parts: number[][] = []
  for (const b of blocks) {
    const parity = b.flag ^ b.payload.reduce((a, v) => a ^ v, 0)
    const body = [b.flag, ...b.payload, parity]
    parts.push([body.length & 0xFF, (body.length >> 8) & 0xFF, ...body])
  }
  return new Uint8Array(parts.flat())
}

export function writeTap({ fontData, glyphWidth, glyphHeight, startChar, glyphCount, fontName }: FontWriteData): Uint8Array {
  if (glyphWidth !== 8 || glyphHeight !== 8) {
    throw new Error('ZX Spectrum TAP export requires 8x8 fonts')
  }

  // Character dumps cover codes 0..N; blank out the leading codes the font
  // doesn't define so the block stays a conventional full charset.
  const numChars = Math.max(96, Math.min(256, startChar + glyphCount))
  const fontBytes = new Uint8Array(numChars * 8)
  for (let i = 0; i < glyphCount; i++) {
    const charCode = startChar + i
    if (charCode < 0 || charCode > 255) continue
    fontBytes.set(fontData.subarray(i * 8, i * 8 + 8), charCode * 8)
  }

  const name = (fontName || 'FONT').toUpperCase().replace(/[^A-Z0-9 ]/g, '').slice(0, 10)
  const header: TapBlock = {
    flag: 0x00,
    payload: [
      3, // CODE
      ...Array.from({ length: 10 }, (_, i) => i < name.length ? name.charCodeAt(i) : 0x20),
      fontBytes.length & 0xFF, (fontBytes.length >> 8) & 0xFF,
      START_ADDRESS & 0xFF, (START_ADDRESS >> 8) & 0xFF,
      0x80, 0x00, // param2 (unused for CODE)
      0,          // checksum byte (not validated by our parser)
    ],
  }
  const data: TapBlock = {
    flag: 0xFF,
    payload: [...fontBytes, 0],
  }

  return makeTap([header, data])
}
