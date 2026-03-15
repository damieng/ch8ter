// Determine whether a .com file is an EGA/VGA font loader or a CP/M Plus font,
// and dispatch to the appropriate parser.
//
// Detection strategy:
//   - EGA/VGA: starts with E9 (JMP), contains "font" in version string
//   - CP/M Plus: everything else (512-byte PSF2AMS header)

import { isEgaCom, parseEgaCom, type EgaComParseResult } from './egaComParser'
import { isTsrCom, parseTsrCom, type TsrComParseResult } from './tsrComParser'
import { parseCpm } from './cpmParser'

export type ComSingleResult =
  | (EgaComParseResult & { source: 'ega' })
  | (TsrComParseResult & { source: 'ega' })
  | { fontData: Uint8Array; glyphHeight: number; startChar: number; glyphWidth: number; source: 'cpm' }

export type ComParseResult = ComSingleResult[]

export function openCom(buffer: ArrayBuffer): ComParseResult {
  if (isTsrCom(buffer)) {
    return parseTsrCom(buffer).map(r => ({ ...r, source: 'ega' as const }))
  }
  if (isEgaCom(buffer)) {
    return [{ ...parseEgaCom(buffer), source: 'ega' as const }]
  }
  const { fontData, glyphHeight } = parseCpm(buffer)
  return [{ fontData, glyphHeight, startChar: 0, glyphWidth: 8, source: 'cpm' as const }]
}
