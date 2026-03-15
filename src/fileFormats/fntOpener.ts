// Determine whether a .fnt file is Atari 8-bit, Windows FNT, or Atari ST GDOS
// GEM format, and dispatch to the appropriate parser.
//
// Detection strategy:
//   - Atari 8-bit: exactly 1024 bytes, first 8 bytes all zero (space glyph)
//   - Windows FNT: first 2 bytes (UInt16LE) are 0x0100, 0x0200, or 0x0300,
//     and bytes 2-5 (UInt32LE dfSize) plausibly match the buffer length.
//   - GDOS GEM: everything else.

import { isWindowsFnt, parseWindowsFnt } from './windowsFntParser'
import { parseGdosFont, type GdosFontParseResult } from './gdosFontParser'
import type { WindowsFntParseResult } from './windowsFntParser'
import { parseCh8 } from './ch8Format'

export interface Atari8BitParseResult {
  fontData: Uint8Array
  startChar: number
  glyphWidth: number
  glyphHeight: number
  populated: Set<number>
  glyphMeta: null
  baseline: number
  meta: null
}

function isAtari8Bit(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength !== 1024) return false
  const bytes = new Uint8Array(buffer)
  // First 8 bytes (space glyph) must be all zero
  for (let i = 0; i < 8; i++) {
    if (bytes[i] !== 0) return false
  }
  return true
}

function parseAtari8Bit(buffer: ArrayBuffer): Atari8BitParseResult {
  const raw = parseCh8(buffer, 8)
  // Remap from internal (screen) code order to ATASCII order:
  //   Internal 0-63  → ATASCII 0x20-0x5F (space through _)
  //   Internal 64-95 → ATASCII 0x00-0x1F (graphics)
  //   Internal 96-127→ ATASCII 0x60-0x7F (lowercase etc)
  const fontData = new Uint8Array(1024)
  for (let internal = 0; internal < 128; internal++) {
    const atascii = internal < 64 ? internal + 32
      : internal < 96 ? internal - 64
      : internal
    const src = internal * 8
    const dst = atascii * 8
    for (let b = 0; b < 8; b++) fontData[dst + b] = raw[src + b]
  }
  return {
    fontData,
    startChar: 0,
    glyphWidth: 8,
    glyphHeight: 8,
    populated: new Set<number>(),
    glyphMeta: null,
    baseline: 6,
    meta: null,
  }
}

export type FntParseResult =
  | (GdosFontParseResult & { source: 'gdos' })
  | (WindowsFntParseResult & { source: 'windows' })
  | (Atari8BitParseResult & { source: 'atari8bit' })

export function openFnt(buffer: ArrayBuffer): FntParseResult {
  if (isAtari8Bit(buffer)) {
    return { ...parseAtari8Bit(buffer), source: 'atari8bit' }
  }
  if (isWindowsFnt(buffer)) {
    return { ...parseWindowsFnt(buffer), source: 'windows' }
  }
  return { ...parseGdosFont(buffer), source: 'gdos' }
}
