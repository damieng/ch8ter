// Parse Windows .FON files (NE executables containing FNT font resources).
//
// FON files are 16-bit NE (New Executable) format with FONT resources (type 8).
// Each resource contains a Windows FNT font, which we extract and pass to the
// existing windowsFntParser.

import { parseWindowsFnt } from './windowsFntParser'
import type { WindowsFntParseResult } from './windowsFntParser'

export interface FonFont {
  resourceId: number
  fnt: WindowsFntParseResult
}

export interface FonParseResult {
  fonts: FonFont[]
}

export function parseFon(buffer: ArrayBuffer): FonParseResult {
  const bytes = new Uint8Array(buffer)
  const view = new DataView(buffer)

  // --- MZ header ---
  if (bytes[0] !== 0x4D || bytes[1] !== 0x5A) // "MZ"
    throw new Error('Not a valid FON file: missing MZ signature')

  const neOffset = view.getUint32(0x3C, true)
  if (neOffset + 0x40 > bytes.length)
    throw new Error('Not a valid FON file: NE header offset out of range')

  // --- NE header ---
  if (bytes[neOffset] !== 0x4E || bytes[neOffset + 1] !== 0x45) // "NE"
    throw new Error('Not a valid FON file: missing NE signature (PE format not supported)')

  const resTableOffset = view.getUint16(neOffset + 0x24, true)
  const resTableAbsolute = neOffset + resTableOffset

  if (resTableAbsolute + 2 > bytes.length)
    throw new Error('Not a valid FON file: resource table out of range')

  // --- Resource table ---
  const alignShift = view.getUint16(resTableAbsolute, true)
  const alignFactor = 1 << alignShift

  // Walk resource type blocks to find FONT resources (type 8)
  const fonts: FonFont[] = []
  let pos = resTableAbsolute + 2

  while (pos + 2 <= bytes.length) {
    const typeId = view.getUint16(pos, true)
    if (typeId === 0) break // end of resource table

    const resourceCount = view.getUint16(pos + 2, true)
    pos += 8 // skip typeId(2) + count(2) + reserved(4)

    const isFontType = (typeId & 0x8000) !== 0 && (typeId & 0x7FFF) === 8

    for (let i = 0; i < resourceCount; i++) {
      if (pos + 12 > bytes.length) break

      const fileOffset = view.getUint16(pos, true) * alignFactor
      const resourceLen = view.getUint16(pos + 2, true) * alignFactor
      const resourceId = view.getUint16(pos + 6, true)
      pos += 12 // each resource entry is 12 bytes

      if (!isFontType) continue
      if (fileOffset + resourceLen > bytes.length) continue

      // Extract the FNT data and parse it
      const fntBuffer = buffer.slice(fileOffset, fileOffset + resourceLen)
      try {
        const fnt = parseWindowsFnt(fntBuffer)
        const id = (resourceId & 0x8000) ? (resourceId & 0x7FFF) : resourceId
        fonts.push({ resourceId: id, fnt })
      } catch {
        // Skip resources that fail to parse (e.g. vector fonts)
      }
    }
  }

  if (fonts.length === 0)
    throw new Error('No bitmap font resources found in FON file')

  return { fonts }
}
