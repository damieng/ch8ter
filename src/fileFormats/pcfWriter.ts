// Write PCF (Portable Compiled Format) font files.

import type { FontMeta, GlyphMeta } from './bdfParser'

interface PcfWriteParams {
  fontData: Uint8Array
  glyphWidth: number
  glyphHeight: number
  startChar: number
  glyphCount: number
  baseline: number
  meta: FontMeta | null
  glyphMeta: (GlyphMeta | null)[] | null
  fontName?: string
}

const PCF_MAGIC = 0x70636601

// Table types
const PCF_PROPERTIES = 1 << 0
const PCF_ACCELERATORS = 1 << 1
const PCF_METRICS = 1 << 2
const PCF_BITMAPS = 1 << 3
const PCF_BDF_ENCODINGS = 1 << 5
const PCF_SWIDTHS = 1 << 6
const PCF_GLYPH_NAMES = 1 << 7
const PCF_BDF_ACCELERATORS = 1 << 8

// Format: MSByte first, MSBit first, byte-padded, byte scan unit
const FORMAT_MSBYTE_MSBIT = (1 << 2) | (1 << 3)
// Compressed metrics format flag
const PCF_COMPRESSED_METRICS = 0x100

function pad4(n: number): number { return (n + 3) & ~3 }

export function writePcf(params: PcfWriteParams): Uint8Array {
  const { fontData, glyphWidth: w, glyphHeight: h, startChar, glyphCount, baseline, meta, glyphMeta, fontName } = params
  const bpr = Math.ceil(w / 8)
  const bpg = h * bpr

  // Collect non-empty glyphs (keep space)
  const included: { srcIdx: number; cp: number }[] = []
  for (let i = 0; i < glyphCount; i++) {
    const cp = startChar + i
    if (cp === 0x20) { included.push({ srcIdx: i, cp }); continue }
    const gm = glyphMeta?.[i]
    if (gm) { included.push({ srcIdx: i, cp }); continue }
    const offset = i * bpg
    let hasPixels = false
    for (let b = 0; b < bpg; b++) {
      if (fontData[offset + b]) { hasPixels = true; break }
    }
    if (hasPixels) included.push({ srcIdx: i, cp })
  }

  const numGlyphs = included.length
  if (numGlyphs === 0) throw new Error('No glyphs to write')

  const descent = h - baseline

  // Build glyph metrics
  const glyphMetrics = included.map(({ srcIdx }) => {
    const gm = glyphMeta?.[srcIdx]
    const dw = gm?.dwidth?.[0] ?? w
    return {
      leftBearing: 0,
      rightBearing: w,
      characterWidth: dw,
      ascent: baseline,
      descent: descent,
    }
  })

  // Build glyph names
  const glyphNamesList = included.map(({ srcIdx, cp }) => {
    const gm = glyphMeta?.[srcIdx]
    return gm?.name || (cp >= 33 && cp <= 126 ? String.fromCharCode(cp) : `char${cp}`)
  })

  // Bitmap data: byte-padded rows, MSBit first (matches our internal format)
  const paddedBpr = pad4(bpr)
  const bitmapOffsets: number[] = []
  const bitmapChunks: Uint8Array[] = []
  let bitmapTotalSize = 0
  for (const { srcIdx } of included) {
    bitmapOffsets.push(bitmapTotalSize)
    const chunk = new Uint8Array(paddedBpr * h)
    const srcOff = srcIdx * bpg
    for (let y = 0; y < h; y++) {
      for (let b = 0; b < bpr; b++) {
        chunk[y * paddedBpr + b] = fontData[srcOff + y * bpr + b]
      }
    }
    bitmapChunks.push(chunk)
    bitmapTotalSize += paddedBpr * h
  }

  // Build properties
  const props: { name: string; isString: boolean; value: string | number }[] = []
  const addProp = (name: string, value: string | number, isString: boolean) => {
    props.push({ name, isString, value })
  }

  const familyName = meta?.family || fontName || 'Unknown'
  addProp('FOUNDRY', meta?.foundry || 'Misc', true)
  addProp('FAMILY_NAME', familyName, true)
  addProp('WEIGHT_NAME', meta?.weight || 'Medium', true)
  addProp('SLANT', meta?.slant || 'R', true)
  addProp('SETWIDTH_NAME', 'Normal', true)
  addProp('ADD_STYLE_NAME', '', true)
  addProp('PIXEL_SIZE', h, false)
  addProp('POINT_SIZE', (meta?.pointSize || h) * 10, false)
  addProp('RESOLUTION_X', meta?.xDpi || 75, false)
  addProp('RESOLUTION_Y', meta?.yDpi || 75, false)
  addProp('SPACING', 'C', true)
  addProp('AVERAGE_WIDTH', w * 10, false)
  addProp('CHARSET_REGISTRY', 'ISO10646', true)
  addProp('CHARSET_ENCODING', '1', true)
  addProp('FONT_ASCENT', baseline, false)
  addProp('FONT_DESCENT', descent, false)
  addProp('DEFAULT_CHAR', included[0]?.cp ?? 0, false)
  if (meta?.copyright) addProp('COPYRIGHT', meta.copyright, true)

  // Also carry forward any extra properties from original
  if (meta?.properties) {
    const alreadySet = new Set(props.map(p => p.name))
    for (const [key, val] of Object.entries(meta.properties)) {
      if (!alreadySet.has(key)) {
        const isNum = /^-?\d+$/.test(val)
        addProp(key, isNum ? parseInt(val) : val, !isNum)
      }
    }
  }

  // Serialize properties table
  const propStringParts: string[] = []
  const propStringOffsets: number[] = []
  let propStringPos = 0
  for (const p of props) {
    propStringOffsets.push(propStringPos)
    propStringParts.push(p.name)
    propStringPos += p.name.length + 1 // +1 for null terminator
  }
  const propValueStringOffsets: number[] = []
  for (const p of props) {
    if (p.isString) {
      propValueStringOffsets.push(propStringPos)
      const s = String(p.value)
      propStringParts.push(s)
      propStringPos += s.length + 1
    } else {
      propValueStringOffsets.push(0)
    }
  }
  const propStringTotal = propStringPos
  const propStringBuf = new Uint8Array(propStringTotal)
  let spos = 0
  for (const s of propStringParts) {
    const encoded = new TextEncoder().encode(s)
    propStringBuf.set(encoded, spos)
    spos += encoded.length + 1 // null terminator (already 0)
  }

  // Properties table binary
  // format(4) + nprops(4) + props(nprops*9) + pad + stringSize(4) + strings
  const propsDataSize = 4 + 4 + props.length * 9
  const propsPadded = pad4(propsDataSize)
  const propsTableSize = propsPadded + 4 + propStringTotal
  const propsTable = new Uint8Array(pad4(propsTableSize))
  const propsView = new DataView(propsTable.buffer)
  let pp = 0
  propsView.setInt32(pp, FORMAT_MSBYTE_MSBIT, true); pp += 4
  propsView.setInt32(pp, props.length, false); pp += 4
  for (let i = 0; i < props.length; i++) {
    propsView.setInt32(pp, propStringOffsets[i], false); pp += 4
    propsView.setUint8(pp, props[i].isString ? 1 : 0); pp += 1
    if (props[i].isString) {
      propsView.setInt32(pp, propValueStringOffsets[i], false)
    } else {
      propsView.setInt32(pp, props[i].value as number, false)
    }
    pp += 4
  }
  pp = propsPadded
  propsView.setInt32(pp, propStringTotal, false); pp += 4
  propsTable.set(propStringBuf, pp)

  // Metrics table (compressed format)
  const metricsTableSize = 4 + 2 + numGlyphs * 5
  const metricsTable = new Uint8Array(pad4(metricsTableSize))
  const metricsView = new DataView(metricsTable.buffer)
  let mp = 0
  metricsView.setInt32(mp, FORMAT_MSBYTE_MSBIT | PCF_COMPRESSED_METRICS, true); mp += 4
  metricsView.setInt16(mp, numGlyphs, false); mp += 2
  for (const m of glyphMetrics) {
    metricsView.setUint8(mp, m.leftBearing + 0x80); mp += 1
    metricsView.setUint8(mp, m.rightBearing + 0x80); mp += 1
    metricsView.setUint8(mp, m.characterWidth + 0x80); mp += 1
    metricsView.setUint8(mp, m.ascent + 0x80); mp += 1
    metricsView.setUint8(mp, m.descent + 0x80); mp += 1
  }

  // Bitmaps table
  // format(4) + count(4) + offsets(count*4) + sizes[4](16) + data
  const bitmapsHeaderSize = 4 + 4 + numGlyphs * 4 + 16
  const bitmapsTableSize = bitmapsHeaderSize + bitmapTotalSize
  const bitmapsTable = new Uint8Array(pad4(bitmapsTableSize))
  const bitmapsView = new DataView(bitmapsTable.buffer)
  let bp = 0
  // Format: MSBit first, MSByte first, int-padded rows (glyphPad=2 in bits 0-1), byte scan unit
  const bitmapFormat = FORMAT_MSBYTE_MSBIT | 2
  bitmapsView.setInt32(bp, bitmapFormat, true); bp += 4
  bitmapsView.setInt32(bp, numGlyphs, false); bp += 4
  for (const off of bitmapOffsets) {
    bitmapsView.setInt32(bp, off, false); bp += 4
  }
  // Bitmap sizes for each padding mode (byte, word16, word32, word64)
  const padSizes = [1, 2, 4, 8]
  for (let p = 0; p < 4; p++) {
    const padAlign = padSizes[p]
    const paddedRowBytes = (bpr + padAlign - 1) & ~(padAlign - 1)
    bitmapsView.setInt32(bp, paddedRowBytes * h * numGlyphs, false); bp += 4
  }
  for (const chunk of bitmapChunks) {
    bitmapsTable.set(chunk, bp)
    bp += chunk.length
  }

  // Encodings table
  const minEnc = included[0].cp
  const maxEnc = included[included.length - 1].cp
  const encRange = maxEnc - minEnc + 1
  const encodingsTableSize = 4 + 10 + encRange * 2
  const encodingsTable = new Uint8Array(pad4(encodingsTableSize))
  const encodingsView = new DataView(encodingsTable.buffer)
  let ep = 0
  encodingsView.setInt32(ep, FORMAT_MSBYTE_MSBIT, true); ep += 4
  encodingsView.setInt16(ep, minEnc, false); ep += 2  // minCharOrByte2
  encodingsView.setInt16(ep, maxEnc, false); ep += 2  // maxCharOrByte2
  encodingsView.setInt16(ep, 0, false); ep += 2       // minByte1
  encodingsView.setInt16(ep, 0, false); ep += 2       // maxByte1
  encodingsView.setInt16(ep, 0xFFFF, false); ep += 2   // defaultChar

  // Build codepoint -> output glyph index map
  const cpToGlyph = new Map<number, number>()
  for (let i = 0; i < included.length; i++) {
    cpToGlyph.set(included[i].cp, i)
  }
  for (let enc = minEnc; enc <= maxEnc; enc++) {
    const gi = cpToGlyph.get(enc)
    encodingsView.setInt16(ep, gi !== undefined ? gi : 0xFFFF, false); ep += 2
  }

  // Swidths table
  const swidthsTableSize = 4 + 4 + numGlyphs * 4
  const swidthsTable = new Uint8Array(pad4(swidthsTableSize))
  const swidthsView = new DataView(swidthsTable.buffer)
  let sp = 0
  swidthsView.setInt32(sp, FORMAT_MSBYTE_MSBIT, true); sp += 4
  swidthsView.setInt32(sp, numGlyphs, false); sp += 4
  for (let i = 0; i < numGlyphs; i++) {
    const gm = glyphMeta?.[included[i].srcIdx]
    const sw = gm?.swidth?.[0] ?? glyphMetrics[i].characterWidth * 72
    swidthsView.setInt32(sp, sw, false); sp += 4
  }

  // Glyph names table
  const nameStrings: Uint8Array[] = []
  const nameOffsets: number[] = []
  let nameStrPos = 0
  for (const name of glyphNamesList) {
    nameOffsets.push(nameStrPos)
    const encoded = new TextEncoder().encode(name)
    nameStrings.push(encoded)
    nameStrPos += encoded.length + 1
  }
  const namesTableSize = 4 + 4 + numGlyphs * 4 + 4 + nameStrPos
  const namesTable = new Uint8Array(pad4(namesTableSize))
  const namesView = new DataView(namesTable.buffer)
  let np = 0
  namesView.setInt32(np, FORMAT_MSBYTE_MSBIT, true); np += 4
  namesView.setInt32(np, numGlyphs, false); np += 4
  for (const off of nameOffsets) {
    namesView.setInt32(np, off, false); np += 4
  }
  namesView.setInt32(np, nameStrPos, false); np += 4
  for (const ns of nameStrings) {
    namesTable.set(ns, np)
    np += ns.length + 1
  }

  // Accelerators table (BDF_ACCELERATORS)
  // 4(format) + 8(flags) + 4(fontAscent) + 4(fontDescent) + 4(maxOverlap)
  //   + 12(minbounds) + 12(maxbounds) + 12(ink_minbounds) + 12(ink_maxbounds)
  const accelTableSize = 4 + 8 + 12 + 24 + 24
  const accelTable = new Uint8Array(pad4(accelTableSize))
  const accelView = new DataView(accelTable.buffer)
  let ap = 0
  accelView.setInt32(ap, FORMAT_MSBYTE_MSBIT, true); ap += 4
  // Flags: noOverlap=1, constantMetrics=0, terminalFont=1, constantWidth=1,
  //        inkInside=1, inkMetrics=0, drawDirection=0, padding=0
  accelView.setUint8(ap, 1); ap += 1 // noOverlap
  accelView.setUint8(ap, 0); ap += 1 // constantMetrics
  accelView.setUint8(ap, 1); ap += 1 // terminalFont
  accelView.setUint8(ap, 1); ap += 1 // constantWidth
  accelView.setUint8(ap, 1); ap += 1 // inkInside
  accelView.setUint8(ap, 0); ap += 1 // inkMetrics
  accelView.setUint8(ap, 0); ap += 1 // drawDirection
  accelView.setUint8(ap, 0); ap += 1 // padding
  accelView.setInt32(ap, baseline, false); ap += 4  // fontAscent
  accelView.setInt32(ap, descent, false); ap += 4   // fontDescent
  accelView.setInt32(ap, 0, false); ap += 4         // maxOverlap
  // minbounds (uncompressed: 6 int16)
  accelView.setInt16(ap, 0, false); ap += 2     // leftBearing
  accelView.setInt16(ap, w, false); ap += 2     // rightBearing
  accelView.setInt16(ap, w, false); ap += 2     // characterWidth
  accelView.setInt16(ap, baseline, false); ap += 2  // ascent
  accelView.setInt16(ap, descent, false); ap += 2   // descent
  accelView.setInt16(ap, 0, false); ap += 2     // attributes
  // maxbounds
  accelView.setInt16(ap, 0, false); ap += 2     // leftBearing
  accelView.setInt16(ap, w, false); ap += 2     // rightBearing
  accelView.setInt16(ap, w, false); ap += 2     // characterWidth
  accelView.setInt16(ap, baseline, false); ap += 2  // ascent
  accelView.setInt16(ap, descent, false); ap += 2   // descent
  accelView.setInt16(ap, 0, false); ap += 2     // attributes
  // ink minbounds (same)
  accelView.setInt16(ap, 0, false); ap += 2
  accelView.setInt16(ap, w, false); ap += 2
  accelView.setInt16(ap, w, false); ap += 2
  accelView.setInt16(ap, baseline, false); ap += 2
  accelView.setInt16(ap, descent, false); ap += 2
  accelView.setInt16(ap, 0, false); ap += 2
  // ink maxbounds (same)
  accelView.setInt16(ap, 0, false); ap += 2
  accelView.setInt16(ap, w, false); ap += 2
  accelView.setInt16(ap, w, false); ap += 2
  accelView.setInt16(ap, baseline, false); ap += 2
  accelView.setInt16(ap, descent, false); ap += 2
  accelView.setInt16(ap, 0, false); ap += 2

  // Assemble all tables
  const tables: { type: number; data: Uint8Array }[] = [
    { type: PCF_PROPERTIES, data: propsTable },
    { type: PCF_ACCELERATORS, data: accelTable },
    { type: PCF_METRICS, data: metricsTable },
    { type: PCF_BITMAPS, data: bitmapsTable },
    { type: PCF_BDF_ENCODINGS, data: encodingsTable },
    { type: PCF_SWIDTHS, data: swidthsTable },
    { type: PCF_GLYPH_NAMES, data: namesTable },
    { type: PCF_BDF_ACCELERATORS, data: accelTable },
  ]

  // Calculate final file size
  const tocSize = 8 + tables.length * 16
  let fileSize = tocSize
  for (const t of tables) {
    fileSize = pad4(fileSize)
    fileSize += t.data.length
  }

  const out = new Uint8Array(fileSize)
  const outView = new DataView(out.buffer)

  // Write header
  outView.setUint32(0, PCF_MAGIC, true)
  outView.setInt32(4, tables.length, true)

  // Calculate offsets and write TOC
  let offset = tocSize
  for (let i = 0; i < tables.length; i++) {
    offset = pad4(offset)
    const tocOff = 8 + i * 16
    outView.setInt32(tocOff, tables[i].type, true)

    // Get format from first 4 bytes of each table
    const tableFormat = new DataView(tables[i].data.buffer).getInt32(0, true)
    outView.setInt32(tocOff + 4, tableFormat, true)
    outView.setInt32(tocOff + 8, tables[i].data.length, true)
    outView.setInt32(tocOff + 12, offset, true)
    offset += tables[i].data.length
  }

  // Write table data
  offset = tocSize
  for (const t of tables) {
    offset = pad4(offset)
    out.set(t.data, offset)
    offset += t.data.length
  }

  return out
}
