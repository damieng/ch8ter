// Write Atari 8-bit .fnt font files.
// 1024 bytes: 128 glyphs × 8 bytes, stored in internal (screen) code order.
// Input font data is in ATASCII order; we remap back to internal codes.

import type { FontWriteData } from '../fontSave'

export function writeAtari8Bit({ fontData, startChar }: FontWriteData): Uint8Array {
  const out = new Uint8Array(1024)

  for (let atascii = 0; atascii < 128; atascii++) {
    // ATASCII to internal code
    const internal = atascii < 32 ? atascii + 64
      : atascii < 96 ? atascii - 32
      : atascii

    const srcIdx = atascii - startChar
    if (srcIdx < 0 || srcIdx * 8 + 8 > fontData.length) continue

    const src = srcIdx * 8
    const dst = internal * 8
    for (let b = 0; b < 8; b++) out[dst + b] = fontData[src + b]
  }

  return out
}
