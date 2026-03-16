// Parse PCF (Portable Compiled Format) font files used by X11.

import type { FontMeta, GlyphMeta } from './bdfParser'
import { getBit, setBit } from '../bitUtils'

export interface PcfParseResult {
  glyphWidth: number
  glyphHeight: number
  startChar: number
  fontData: Uint8Array
  meta: FontMeta
  encodings: number[]
  glyphMeta: (GlyphMeta | null)[]
  baseline?: number
}

const PCF_MAGIC = 0x70636601 // "\1fcp"

// Table types
const PCF_PROPERTIES = 1 << 0
const PCF_ACCELERATORS = 1 << 1
const PCF_METRICS = 1 << 2
const PCF_BITMAPS = 1 << 3
const PCF_BDF_ENCODINGS = 1 << 5
const PCF_SWIDTHS = 1 << 6
const PCF_GLYPH_NAMES = 1 << 7
const PCF_BDF_ACCELERATORS = 1 << 8

// Format bits
const PCF_BYTE_ORDER = 1 << 2  // 0=LSByte first, 1=MSByte first
const PCF_BIT_ORDER = 1 << 3   // 0=LSBit first, 1=MSBit first

interface TocEntry {
  type: number
  format: number
  size: number
  offset: number
}

function getInt16(view: DataView, offset: number, bigEndian: boolean): number {
  return view.getInt16(offset, !bigEndian)
}

function getInt32(view: DataView, offset: number, bigEndian: boolean): number {
  return view.getInt32(offset, !bigEndian)
}

// Reverse bits in a byte (for LSBit-first to MSBit-first conversion)
const REVERSE = new Uint8Array(256)
for (let i = 0; i < 256; i++) {
  REVERSE[i] = ((i * 0x0802 & 0x22110) | (i * 0x8020 & 0x88440)) * 0x10101 >>> 16 & 0xFF
}

function align(n: number, a: number): number { return (n + a - 1) & ~(a - 1) }

export function parsePcf(buffer: ArrayBuffer): PcfParseResult {
  const view = new DataView(buffer)
  const bytes = new Uint8Array(buffer)

  if (view.getUint32(0, true) !== PCF_MAGIC) {
    throw new Error('Not a valid PCF file')
  }

  const tableCount = view.getInt32(4, true)
  const toc = new Map<number, TocEntry>()
  for (let i = 0; i < tableCount; i++) {
    const off = 8 + i * 16
    const entry: TocEntry = {
      type: view.getInt32(off, true),
      format: view.getInt32(off + 4, true),
      size: view.getInt32(off + 8, true),
      offset: view.getInt32(off + 12, true),
    }
    toc.set(entry.type, entry)
  }

  // Required tables
  const metricsEntry = toc.get(PCF_METRICS)
  const bitmapsEntry = toc.get(PCF_BITMAPS)
  if (!metricsEntry || !bitmapsEntry) {
    throw new Error('PCF file missing required METRICS or BITMAPS table')
  }

  // Parse metrics
  const metrics = parseMetrics(view, metricsEntry)

  // Determine cell dimensions from metrics
  let maxW = 0
  let maxAscent = 0, maxDescent = 0
  for (const m of metrics) {
    const w = m.rightBearing - m.leftBearing
    if (w > maxW) maxW = w
    if (m.ascent > maxAscent) maxAscent = m.ascent
    if (m.descent > maxDescent) maxDescent = m.descent
  }
  if (maxW <= 0) maxW = 8

  // Try to get better metrics from accelerators
  const accelEntry = toc.get(PCF_BDF_ACCELERATORS) || toc.get(PCF_ACCELERATORS)
  let fontAscent = maxAscent
  let fontDescent = maxDescent
  let minLeftBearing = 0
  if (accelEntry) {
    const accel = parseAccelerators(view, accelEntry)
    fontAscent = accel.fontAscent
    fontDescent = accel.fontDescent
    if (accel.maxOverallWidth > maxW) maxW = accel.maxOverallWidth
    minLeftBearing = accel.minLeftBearing
  }
  const cellW = maxW
  const cellH = fontAscent + fontDescent

  // Parse encodings
  const encodingsEntry = toc.get(PCF_BDF_ENCODINGS)
  let encodingMap: Map<number, number> | null = null
  if (encodingsEntry) {
    encodingMap = parseEncodings(view, encodingsEntry)
  }

  // Parse properties for metadata
  const meta: FontMeta = { properties: {} }
  const propsEntry = toc.get(PCF_PROPERTIES)
  if (propsEntry) {
    const props = parseProperties(view, bytes, propsEntry)
    meta.properties = props
    if (props.FAMILY_NAME) meta.family = props.FAMILY_NAME
    if (props.WEIGHT_NAME) meta.weight = props.WEIGHT_NAME
    if (props.SLANT) meta.slant = props.SLANT
    if (props.COPYRIGHT) meta.copyright = props.COPYRIGHT
    if (props.FOUNDRY) meta.foundry = props.FOUNDRY
    if (props.FONT) meta.fontName = props.FONT
    if (props.FONT_ASCENT) meta.fontAscent = parseInt(props.FONT_ASCENT)
    if (props.FONT_DESCENT) meta.fontDescent = parseInt(props.FONT_DESCENT)
    if (props.POINT_SIZE) meta.pointSize = parseInt(props.POINT_SIZE) / 10
    if (props.RESOLUTION_X) meta.xDpi = parseInt(props.RESOLUTION_X)
    if (props.RESOLUTION_Y) meta.yDpi = parseInt(props.RESOLUTION_Y)
  }
  meta.format = 'PCF'

  // Parse swidths
  let swidths: number[] | null = null
  const swidthsEntry = toc.get(PCF_SWIDTHS)
  if (swidthsEntry) {
    swidths = parseSwidths(view, swidthsEntry)
  }

  // Parse glyph names
  let glyphNames: string[] | null = null
  const namesEntry = toc.get(PCF_GLYPH_NAMES)
  if (namesEntry) {
    glyphNames = parseGlyphNames(view, bytes, namesEntry)
  }

  // Parse bitmaps — returns normalized per-glyph data (byte-padded, MSBit-first)
  const bitmapData = parseBitmaps(view, bytes, bitmapsEntry, metrics)

  // Build output: map glyphs into a contiguous array
  const outBpr = Math.ceil(cellW / 8)
  const outBpg = cellH * outBpr

  // Determine encoding range
  let minEnc = 0x7FFFFFFF, maxEnc = -1
  if (encodingMap && encodingMap.size > 0) {
    for (const cp of encodingMap.keys()) {
      if (cp >= 0 && cp < minEnc) minEnc = cp
      if (cp > maxEnc) maxEnc = cp
    }
  } else {
    minEnc = 0
    maxEnc = metrics.length - 1
  }

  if (maxEnc < 0) throw new Error('No glyphs found in PCF file')

  const totalGlyphs = maxEnc - minEnc + 1
  const fontData = new Uint8Array(totalGlyphs * outBpg)
  const encodings = new Array<number>(totalGlyphs)
  const glyphMetaArr: (GlyphMeta | null)[] = new Array(totalGlyphs).fill(null)

  for (let e = 0; e < totalGlyphs; e++) encodings[e] = minEnc + e

  // Place each glyph's normalized bitmap into the output cell
  function placeGlyph(glyphIdx: number, outputIdx: number) {
    const m = metrics[glyphIdx]
    const bd = bitmapData[glyphIdx]
    if (!bd) return

    const gm: GlyphMeta = {
      dwidth: [m.characterWidth, 0],
    }
    if (swidths && glyphIdx < swidths.length) {
      gm.swidth = [swidths[glyphIdx], 0]
    }
    if (glyphNames && glyphIdx < glyphNames.length) {
      gm.name = glyphNames[glyphIdx]
    }

    const glyphW = m.rightBearing - m.leftBearing
    const glyphH = m.ascent + m.descent
    if (glyphW <= 0 || glyphH <= 0) {
      glyphMetaArr[outputIdx] = gm
      return
    }

    // Position within cell
    const px = m.leftBearing - minLeftBearing
    const py = fontAscent - m.ascent

    // bd is already normalized to byte-padded MSBit-first rows
    const srcBpr = Math.ceil(glyphW / 8)
    const base = outputIdx * outBpg

    for (let y = 0; y < glyphH; y++) {
      const destY = py + y
      if (destY < 0 || destY >= cellH) continue
      for (let x = 0; x < glyphW; x++) {
        const destX = px + x
        if (destX < 0 || destX >= cellW) continue
        if (getBit(bd, y * srcBpr, x)) {
          setBit(fontData, base + destY * outBpr, destX)
        }
      }
    }

    gm.bbx = [glyphW, glyphH, m.leftBearing, -m.descent]
    glyphMetaArr[outputIdx] = gm
  }

  if (encodingMap && encodingMap.size > 0) {
    for (const [cp, glyphIdx] of encodingMap) {
      if (cp < minEnc || cp > maxEnc) continue
      if (glyphIdx < 0 || glyphIdx >= metrics.length) continue
      placeGlyph(glyphIdx, cp - minEnc)
    }
  } else {
    for (let i = 0; i < metrics.length; i++) {
      placeGlyph(i, i)
    }
  }

  return {
    glyphWidth: cellW,
    glyphHeight: cellH,
    startChar: minEnc,
    fontData,
    meta,
    encodings,
    glyphMeta: glyphMetaArr,
    baseline: fontAscent,
  }
}

interface GlyphMetrics {
  leftBearing: number
  rightBearing: number
  characterWidth: number
  ascent: number
  descent: number
}

function parseMetrics(view: DataView, entry: TocEntry): GlyphMetrics[] {
  let pos = entry.offset
  const format = view.getInt32(pos, true)
  pos += 4
  const be = !!(format & PCF_BYTE_ORDER)
  const compressed = !!(format & 0x100)

  const metrics: GlyphMetrics[] = []

  if (compressed) {
    const count = getInt16(view, pos, be)
    pos += 2
    for (let i = 0; i < count; i++) {
      metrics.push({
        leftBearing: view.getUint8(pos) - 0x80,
        rightBearing: view.getUint8(pos + 1) - 0x80,
        characterWidth: view.getUint8(pos + 2) - 0x80,
        ascent: view.getUint8(pos + 3) - 0x80,
        descent: view.getUint8(pos + 4) - 0x80,
      })
      pos += 5
    }
  } else {
    const count = getInt32(view, pos, be)
    pos += 4
    for (let i = 0; i < count; i++) {
      metrics.push({
        leftBearing: getInt16(view, pos, be),
        rightBearing: getInt16(view, pos + 2, be),
        characterWidth: getInt16(view, pos + 4, be),
        ascent: getInt16(view, pos + 6, be),
        descent: getInt16(view, pos + 8, be),
      })
      pos += 12 // 5 int16 + 2 bytes attributes
    }
  }

  return metrics
}

interface AccelData {
  fontAscent: number
  fontDescent: number
  maxOverallWidth: number
  minLeftBearing: number
}

function parseAccelerators(view: DataView, entry: TocEntry): AccelData {
  let pos = entry.offset
  const format = view.getInt32(pos, true)
  pos += 4
  const be = !!(format & PCF_BYTE_ORDER)

  // Skip: noOverlap(1), constantMetrics(1), terminalFont(1), constantWidth(1),
  //        inkInside(1), inkMetrics(1), drawDirection(1), padding(1)
  pos += 8
  const fontAscent = getInt32(view, pos, be)
  const fontDescent = getInt32(view, pos + 4, be)
  // skip maxOverlap (4 bytes)
  pos += 12

  // minbounds (uncompressed metrics: 6 int16 = 12 bytes)
  const minLeftBearing = getInt16(view, pos, be)
  pos += 12

  // maxbounds
  pos += 4 // skip leftBearing, rightBearing
  const maxOverallWidth = getInt16(view, pos, be)

  return { fontAscent, fontDescent, maxOverallWidth, minLeftBearing }
}

function parseEncodings(view: DataView, entry: TocEntry): Map<number, number> {
  let pos = entry.offset
  const format = view.getInt32(pos, true)
  pos += 4
  const be = !!(format & PCF_BYTE_ORDER)

  const minCharOrByte2 = getInt16(view, pos, be)
  const maxCharOrByte2 = getInt16(view, pos + 2, be)
  const minByte1 = getInt16(view, pos + 4, be)
  const maxByte1 = getInt16(view, pos + 6, be)
  pos += 10 // skip defaultChar too

  const map = new Map<number, number>()
  for (let byte1 = minByte1; byte1 <= maxByte1; byte1++) {
    for (let byte2 = minCharOrByte2; byte2 <= maxCharOrByte2; byte2++) {
      const glyphIdx = getInt16(view, pos, be)
      pos += 2
      if (glyphIdx !== -1 && (glyphIdx & 0xFFFF) !== 0xFFFF) {
        const encoding = byte1 > 0 ? (byte1 << 8) | byte2 : byte2
        map.set(encoding, glyphIdx)
      }
    }
  }

  return map
}

function parseProperties(view: DataView, bytes: Uint8Array, entry: TocEntry): Record<string, string> {
  let pos = entry.offset
  const format = view.getInt32(pos, true)
  pos += 4
  const be = !!(format & PCF_BYTE_ORDER)

  const nprops = getInt32(view, pos, be)
  pos += 4

  const propEntries: { nameOffset: number; isString: number; value: number }[] = []
  for (let i = 0; i < nprops; i++) {
    propEntries.push({
      nameOffset: getInt32(view, pos, be),
      isString: view.getUint8(pos + 4),
      value: getInt32(view, pos + 5, be),
    })
    pos += 9
  }

  // Pad to 4-byte boundary
  pos = (pos + 3) & ~3

  const stringSize = getInt32(view, pos, be)
  pos += 4
  const stringData = bytes.subarray(pos, pos + stringSize)

  function readString(offset: number): string {
    let end = offset
    while (end < stringData.length && stringData[end] !== 0) end++
    return new TextDecoder().decode(stringData.subarray(offset, end))
  }

  const props: Record<string, string> = {}
  for (const pe of propEntries) {
    const name = readString(pe.nameOffset)
    if (pe.isString) {
      props[name] = readString(pe.value)
    } else {
      props[name] = String(pe.value)
    }
  }

  return props
}

function parseSwidths(view: DataView, entry: TocEntry): number[] {
  let pos = entry.offset
  const format = view.getInt32(pos, true)
  pos += 4
  const be = !!(format & PCF_BYTE_ORDER)

  const count = getInt32(view, pos, be)
  pos += 4

  const swidths: number[] = []
  for (let i = 0; i < count; i++) {
    swidths.push(getInt32(view, pos, be))
    pos += 4
  }
  return swidths
}

function parseGlyphNames(view: DataView, bytes: Uint8Array, entry: TocEntry): string[] {
  let pos = entry.offset
  const format = view.getInt32(pos, true)
  pos += 4
  const be = !!(format & PCF_BYTE_ORDER)

  const count = getInt32(view, pos, be)
  pos += 4

  const offsets: number[] = []
  for (let i = 0; i < count; i++) {
    offsets.push(getInt32(view, pos, be))
    pos += 4
  }

  const stringSize = getInt32(view, pos, be)
  pos += 4
  const stringData = bytes.subarray(pos, pos + stringSize)

  return offsets.map(off => {
    let end = off
    while (end < stringData.length && stringData[end] !== 0) end++
    return new TextDecoder().decode(stringData.subarray(off, end))
  })
}

/**
 * Parse bitmap data and normalize each glyph to byte-padded, MSBit-first rows.
 * The returned Uint8Array for each glyph uses stride = ceil(glyphW / 8).
 */
function parseBitmaps(
  view: DataView, bytes: Uint8Array, entry: TocEntry, metrics: GlyphMetrics[]
): Uint8Array[] {
  let pos = entry.offset
  const format = view.getInt32(pos, true)
  pos += 4
  const be = !!(format & PCF_BYTE_ORDER)
  const msbBitOrder = !!(format & PCF_BIT_ORDER)
  const glyphPad = 1 << (format & 3)           // bits 0-1: 1, 2, or 4 bytes
  const scanUnit = 1 << ((format >> 4) & 3)   // bits 4-5: 1, 2, or 4 bytes

  const count = getInt32(view, pos, be)
  pos += 4

  const offsets: number[] = []
  for (let i = 0; i < count; i++) {
    offsets.push(getInt32(view, pos, be))
    pos += 4
  }

  // Skip 4 bitmap sizes
  pos += 16

  const bitmapStart = pos
  const result: Uint8Array[] = []

  for (let i = 0; i < count; i++) {
    const glyphW = i < metrics.length ? metrics[i].rightBearing - metrics[i].leftBearing : 0
    const glyphH = i < metrics.length ? metrics[i].ascent + metrics[i].descent : 0

    if (glyphW <= 0 || glyphH <= 0) {
      result.push(new Uint8Array(0))
      continue
    }

    const srcStride = align(Math.ceil(glyphW / 8), glyphPad)
    const dstStride = Math.ceil(glyphW / 8)
    const srcStart = bitmapStart + offsets[i]

    const normalized = new Uint8Array(glyphH * dstStride)

    for (let y = 0; y < glyphH; y++) {
      const rowStart = srcStart + y * srcStride

      // Handle byte swapping within scan units for LSByte order
      // MSByte = natural left-to-right order, LSByte = reversed within scan units
      if (scanUnit > 1 && !be) {
        // LSByte order: swap bytes within each scan unit
        for (let s = 0; s < srcStride; s += scanUnit) {
          for (let b = 0; b < scanUnit && (s + b) < dstStride; b++) {
            const srcByte = bytes[rowStart + s + (scanUnit - 1 - b)]
            normalized[y * dstStride + s + b] = msbBitOrder ? srcByte : REVERSE[srcByte]
          }
        }
      } else {
        // MSByte order or byte scan unit: bytes are already in order
        for (let b = 0; b < dstStride; b++) {
          const srcByte = bytes[rowStart + b]
          normalized[y * dstStride + b] = msbBitOrder ? srcByte : REVERSE[srcByte]
        }
      }
    }

    result.push(normalized)
  }

  return result
}
