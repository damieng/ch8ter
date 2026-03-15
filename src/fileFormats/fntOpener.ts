// Determine whether a .fnt file is Windows FNT or Atari ST GDOS GEM format,
// and dispatch to the appropriate parser.
//
// Detection strategy:
//   - Windows FNT: first 2 bytes (UInt16LE) are 0x0100, 0x0200, or 0x0300,
//     and bytes 2-5 (UInt32LE dfSize) plausibly match the buffer length.
//   - GDOS GEM: everything else.

import { isWindowsFnt, parseWindowsFnt } from './windowsFntParser'
import { parseGdosFont, type GdosFontParseResult } from './gdosFontParser'
import type { WindowsFntParseResult } from './windowsFntParser'

export type FntParseResult =
  | (GdosFontParseResult & { source: 'gdos' })
  | (WindowsFntParseResult & { source: 'windows' })

export function openFnt(buffer: ArrayBuffer): FntParseResult {
  if (isWindowsFnt(buffer)) {
    return { ...parseWindowsFnt(buffer), source: 'windows' }
  }
  return { ...parseGdosFont(buffer), source: 'gdos' }
}
