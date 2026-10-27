// Write Commodore 64 .64c font files.
//
// A .64c file is a raw character dump prefixed with a 2-byte load address
// (little endian). Character sets conventionally load at $D000, the address
// of the C64's character ROM. Glyphs are 8x8, stored in screen-code order
// (character code * 8 bytes each).

import type { FontWriteData } from '../fontSave'

/** Default load address: the C64 character ROM ($D000). */
const LOAD_ADDRESS = 0xD000

export function write64c({ fontData, glyphWidth, glyphHeight, startChar, glyphCount }: FontWriteData): Uint8Array {
  if (glyphWidth !== 8 || glyphHeight !== 8) {
    throw new Error('C64 .64c export requires 8x8 fonts')
  }

  const out = new Uint8Array(2 + 256 * 8)
  out[0] = LOAD_ADDRESS & 0xFF
  out[1] = LOAD_ADDRESS >> 8

  for (let i = 0; i < glyphCount; i++) {
    const charCode = startChar + i
    if (charCode < 0 || charCode > 255) continue
    out.set(fontData.subarray(i * 8, i * 8 + 8), 2 + charCode * 8)
  }
  return out
}
