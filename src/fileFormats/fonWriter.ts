// Write Windows .FON files: 16-bit NE executables containing FNT resources.
//
// Produces a minimal resource-only NE library with a FONTDIR resource (type 7)
// and one FONT resource (type 8) holding the FNT bytes produced by
// writeWindowsFnt. Our own parser (fonParser.ts) reads this layout back.

import type { FontWriteData } from '../fontSave'
import { writeWindowsFnt } from './windowsFntWriter'

const ALIGN_SHIFT = 4               // 2^4 = 16-byte resource alignment
const NE_OFFSET = 0x40
const NE_SIZE = 0x40

const alignUp = (n: number) => Math.ceil(n / (1 << ALIGN_SHIFT)) * (1 << ALIGN_SHIFT)

export function writeFon(data: FontWriteData): Uint8Array {
  const fnt = writeWindowsFnt(data)
  const fv = new DataView(fnt.buffer, fnt.byteOffset, fnt.byteLength)

  // Metrics read back from the FNT so FONTDIR stays consistent with it
  const pointSize = fv.getUint16(68, true)
  const yDpi = fv.getUint16(70, true)
  const xDpi = fv.getUint16(72, true)
  const weight = fv.getUint16(83, true)
  const charset = fnt[85]
  const pixWidth = fv.getUint16(86, true)
  const pixHeight = fv.getUint16(88, true)
  const faceOffset = fv.getUint32(105, true)
  let faceName = ''
  if (faceOffset > 0 && faceOffset < fnt.length) {
    let end = faceOffset
    while (end < fnt.length && fnt[end] !== 0) end++
    faceName = new TextDecoder().decode(fnt.subarray(faceOffset, end))
  }

  // --- FONTDIR resource: u16 count + FONTDIRENTRY (25-byte fixed part + names)
  const deviceName = new Uint8Array(1) // empty device name (screen fonts)
  const faceBytes = new TextEncoder().encode(faceName)
  const fontDirSize = 2 + 25 + deviceName.length + faceBytes.length + 1
  const fontDir = new Uint8Array(fontDirSize)
  const dirView = new DataView(fontDir.buffer)
  dirView.setUint16(0, 1, true) // numFonts
  let d = 2
  dirView.setUint16(d + 0, 0, true)          // dfRate
  dirView.setUint16(d + 2, pointSize, true)  // dfPointsize
  dirView.setUint16(d + 4, pixWidth, true)   // dfPixWidth
  dirView.setUint16(d + 6, pixHeight, true)  // dfPixHeight
  dirView.setUint16(d + 8, weight, true)     // dfWeight
  fontDir[d + 10] = charset                  // dfCharSet
  dirView.setUint16(d + 12, yDpi, true)      // dfVertRes
  dirView.setUint16(d + 14, xDpi, true)      // dfHorizRes
  fontDir[d + 16] = 0                        // dfType: raster
  fontDir[d + 17] = 0                        // dfBits
  fontDir[d + 18] = 0                        // dfReserved1
  dirView.setUint16(d + 19, 0, true)         // dfFlags
  d += 25
  fontDir.set(deviceName, d); d += deviceName.length
  fontDir.set(faceBytes, d); d += faceBytes.length
  fontDir[d] = 0

  // --- Layout ---
  const enttabAbs = NE_OFFSET + NE_SIZE            // 1 empty entry byte
  const resTableAbs = enttabAbs + 1
  const resTableSize = 2 + (8 + 12) + (8 + 12) + 2 // align + FONTDIR block + FONT block + terminator
  const restabAbs = resTableAbs + resTableSize
  const restab = new Uint8Array([0x03, 0x46, 0x4F, 0x4E, 0x00]) // module name "FON"
  const fontDirDataAbs = alignUp(restabAbs + restab.length)
  const fontDataAbs = alignUp(fontDirDataAbs + fontDirSize)
  // Pad the file so each resource's aligned length is fully present
  const totalSize = fontDataAbs + alignUp(fnt.length)

  const out = new Uint8Array(totalSize)
  const view = new DataView(out.buffer)

  // --- MZ header ---
  out[0] = 0x4D; out[1] = 0x5A                     // "MZ"
  const pages = Math.ceil(totalSize / 512)
  view.setUint16(0x02, totalSize - (pages - 1) * 512, true) // bytes on last page
  view.setUint16(0x04, pages, true)
  view.setUint16(0x08, 4, true)                    // header size: 4 paragraphs
  view.setUint16(0x18, 0x40, true)                 // relocation table offset
  view.setUint32(0x3C, NE_OFFSET, true)            // NE offset

  // --- NE header ---
  out[NE_OFFSET] = 0x4E; out[NE_OFFSET + 1] = 0x45 // "NE"
  out[NE_OFFSET + 2] = 5                           // linker version
  out[NE_OFFSET + 3] = 1                           // linker revision
  view.setUint16(NE_OFFSET + 0x04, enttabAbs - NE_OFFSET, true)  // entry table offset
  view.setUint16(NE_OFFSET + 0x06, 1, true)                      // entry table size
  view.setUint16(NE_OFFSET + 0x0C, 0x8300, true)   // flags: LIBRARY | non-autoload sections
  view.setUint16(NE_OFFSET + 0x20, 0, true)        // no non-resident name table
  view.setUint16(NE_OFFSET + 0x22, 0, true)        // segment table offset (no segments)
  view.setUint16(NE_OFFSET + 0x24, resTableAbs - NE_OFFSET, true) // resource table
  view.setUint16(NE_OFFSET + 0x26, restabAbs - NE_OFFSET, true)   // resident name table

  // Entry table: single 0x00 (no segments/entries)
  out[enttabAbs] = 0x00

  // --- Resource table ---
  let p = resTableAbs
  const alignUnits = (n: number) => Math.ceil(n / (1 << ALIGN_SHIFT))
  view.setUint16(p, ALIGN_SHIFT, true); p += 2

  // FONTDIR (type 7)
  view.setUint16(p, 0x8007, true); p += 2
  view.setUint16(p, 1, true); p += 2               // count
  view.setUint32(p, 0, true); p += 4               // reserved
  view.setUint16(p, fontDirDataAbs >> ALIGN_SHIFT, true); p += 2
  view.setUint16(p, alignUnits(fontDirSize), true); p += 2
  view.setUint16(p, 0x00C0, true); p += 2          // flags: preload + moveable
  view.setUint16(p, 1, true); p += 2               // resource id (ordinal)
  p += 4                                           // handle + usage

  // FONT (type 8)
  view.setUint16(p, 0x8008, true); p += 2
  view.setUint16(p, 1, true); p += 2               // count
  view.setUint32(p, 0, true); p += 4               // reserved
  view.setUint16(p, fontDataAbs >> ALIGN_SHIFT, true); p += 2
  view.setUint16(p, alignUnits(fnt.length), true); p += 2
  view.setUint16(p, 0x00C0, true); p += 2          // flags
  view.setUint16(p, 1, true); p += 2               // resource id (ordinal)
  p += 4                                           // handle + usage

  view.setUint16(p, 0, true)                       // end of resource table

  // --- Resident name table ---
  out.set(restab, restabAbs)

  // --- Resource data ---
  out.set(fontDir, fontDirDataAbs)
  out.set(fnt, fontDataAbs)

  return out
}
