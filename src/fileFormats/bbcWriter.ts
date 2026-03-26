// Write BBC Micro soft-font files (VDU23 character definitions).
//
// Output: a stream of VDU23 commands, one per character.
// Each definition is 10 bytes: 0x17, charCode, 8 bitmap rows.

import type { FontWriteData } from '../fontSave'

export function writeBbc({ fontData, startChar, glyphCount }: FontWriteData): Uint8Array {
  // Count non-empty glyphs to size the output
  const entries: { code: number; offset: number }[] = []
  for (let i = 0; i < glyphCount; i++) {
    const code = startChar + i
    if (code < 32 || code > 255) continue
    const offset = i * 8
    // Include all glyphs in range (even blank ones like space)
    entries.push({ code, offset })
  }

  const out = new Uint8Array(entries.length * 10)
  for (let i = 0; i < entries.length; i++) {
    const pos = i * 10
    out[pos] = 0x17 // VDU23
    out[pos + 1] = entries[i].code
    for (let y = 0; y < 8; y++) {
      out[pos + 2 + y] = fontData[entries[i].offset + y] ?? 0
    }
  }

  return out
}
