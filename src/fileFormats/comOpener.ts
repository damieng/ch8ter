// Determine whether a .com file is an EGA/VGA font loader or a CP/M Plus font,
// and dispatch to the appropriate parser.
//
// Detection strategy:
//   - EGA/VGA: starts with E9 (JMP), contains "font" in version string
//   - CP/M Plus: everything else (512-byte PSF2AMS header)

import { isEgaCom, parseEgaCom, type EgaComParseResult } from './egaComParser'
import { parseCpm } from './cpmParser'

export type ComParseResult =
  | (EgaComParseResult & { source: 'ega' })
  | { fontData: Uint8Array; glyphHeight: number; startChar: number; glyphWidth: number; source: 'cpm' }

export function openCom(buffer: ArrayBuffer): ComParseResult {
  if (isEgaCom(buffer)) {
    return { ...parseEgaCom(buffer), source: 'ega' }
  }
  const { fontData, glyphHeight } = parseCpm(buffer)
  return { fontData, glyphHeight, startChar: 0, glyphWidth: 8, source: 'cpm' }
}
