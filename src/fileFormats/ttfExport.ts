import type { FontInstance } from '../store'
import { glyphCount, bytesPerRow, bytesPerGlyph } from '../store'

// --- Binary writers ---

class BinaryWriter {
  private buf: DataView
  private pos = 0

  constructor(size: number) {
    this.buf = new DataView(new ArrayBuffer(size))
  }

  get offset() { return this.pos }
  set offset(v: number) { this.pos = v }
  get buffer() { return this.buf.buffer }
  get length() { return this.pos }

  u8(v: number) { this.buf.setUint8(this.pos++, v) }
  u16(v: number) { this.buf.setUint16(this.pos, v); this.pos += 2 }
  i16(v: number) { this.buf.setInt16(this.pos, v); this.pos += 2 }
  u32(v: number) { this.buf.setUint32(this.pos, v); this.pos += 4 }
  i32(v: number) { this.buf.setInt32(this.pos, v); this.pos += 4 }
  tag(s: string) { for (let i = 0; i < 4; i++) this.u8(s.charCodeAt(i)) }

  // Fixed 16.16
  fixed(v: number) { this.i32(Math.round(v * 65536)) }

  // LONGDATETIME (int64, seconds since 1904-01-01)
  datetime(d: Date) {
    const epoch = Date.UTC(1904, 0, 1)
    const secs = Math.floor((d.getTime() - epoch) / 1000)
    // Write as two uint32 (high, low)
    this.u32(Math.floor(secs / 0x100000000))
    this.u32(secs >>> 0)
  }

  pad(alignment: number) {
    while (this.pos % alignment) this.u8(0)
  }

  bytes() { return new Uint8Array(this.buf.buffer, 0, this.pos) }
}

function calcChecksum(data: Uint8Array): number {
  let sum = 0
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
  const len = Math.ceil(data.byteLength / 4) * 4
  for (let i = 0; i < len; i += 4) {
    if (i + 4 <= data.byteLength) {
      sum = (sum + view.getUint32(i)) >>> 0
    } else {
      // Pad with zeros for last partial word
      let val = 0
      for (let j = 0; j < 4; j++) {
        val = (val << 8) | (i + j < data.byteLength ? data[i + j] : 0)
      }
      sum = (sum + val) >>> 0
    }
  }
  return sum
}

// --- Pixel contour tracing ---

interface Pt { x: number; y: number }

function getPixelBit(data: Uint8Array, gi: number, bpr: number, bpg: number, x: number, y: number): boolean {
  return (data[gi * bpg + y * bpr + (x >> 3)] & (0x80 >> (x & 7))) !== 0
}

function traceGlyphContours(
  data: Uint8Array, gi: number,
  w: number, h: number, bpr: number, bpg: number,
): Pt[][] {
  const edgeMap = new Map<number, Pt[]>()
  const stride = w + 2
  const key = (x: number, y: number) => y * stride + x

  function isOn(px: number, py: number): boolean {
    if (px < 0 || px >= w || py < 0 || py >= h) return false
    return getPixelBit(data, gi, bpr, bpg, px, py)
  }

  function addEdge(fx: number, fy: number, tx: number, ty: number) {
    const k = key(fx, fy)
    let list = edgeMap.get(k)
    if (!list) { list = []; edgeMap.set(k, list) }
    list.push({ x: tx, y: ty })
  }

  // Horizontal edges
  for (let gy = 0; gy <= h; gy++) {
    for (let gx = 0; gx < w; gx++) {
      const above = isOn(gx, gy - 1)
      const below = isOn(gx, gy)
      if (above !== below) {
        if (below) addEdge(gx, gy, gx + 1, gy)
        else       addEdge(gx + 1, gy, gx, gy)
      }
    }
  }

  // Vertical edges
  for (let gx = 0; gx <= w; gx++) {
    for (let gy = 0; gy < h; gy++) {
      const left = isOn(gx - 1, gy)
      const right = isOn(gx, gy)
      if (left !== right) {
        if (left) addEdge(gx, gy, gx, gy + 1)
        else      addEdge(gx, gy + 1, gx, gy)
      }
    }
  }

  // Trace contours, preferring right turns at ambiguous junctions
  const contours: Pt[][] = []

  while (edgeMap.size > 0) {
    const firstKey = edgeMap.keys().next().value!
    const firstTargets = edgeMap.get(firstKey)!
    const start = firstTargets[0]
    const sy = Math.floor(firstKey / stride)
    const sx = firstKey - sy * stride
    const contour: Pt[] = [{ x: sx, y: sy }]

    let cx = sx, cy = sy
    let prevDx = start.x - sx, prevDy = start.y - sy

    firstTargets.splice(0, 1)
    if (firstTargets.length === 0) edgeMap.delete(firstKey)
    cx = start.x; cy = start.y

    while (cx !== sx || cy !== sy) {
      contour.push({ x: cx, y: cy })
      const k = key(cx, cy)
      const targets = edgeMap.get(k)
      if (!targets || targets.length === 0) break

      let bestIdx = 0
      if (targets.length > 1) {
        let bestScore = -1
        for (let i = 0; i < targets.length; i++) {
          const odx = targets[i].x - cx
          const ody = targets[i].y - cy
          const cross = prevDx * ody - prevDy * odx
          const dot = prevDx * odx + prevDy * ody
          let score: number
          if (cross < 0) score = 3
          else if (cross === 0 && dot > 0) score = 2
          else if (cross > 0) score = 1
          else score = 0
          if (score > bestScore) { bestScore = score; bestIdx = i }
        }
      }

      const next = targets[bestIdx]
      targets.splice(bestIdx, 1)
      if (targets.length === 0) edgeMap.delete(k)

      prevDx = next.x - cx
      prevDy = next.y - cy
      cx = next.x
      cy = next.y
    }

    if (contour.length >= 3) contours.push(contour)
  }

  // Remove collinear points
  return contours.map(c => {
    if (c.length < 3) return c
    const out: Pt[] = []
    for (let i = 0; i < c.length; i++) {
      const prev = c[(i - 1 + c.length) % c.length]
      const curr = c[i]
      const next = c[(i + 1) % c.length]
      if (curr.x - prev.x !== next.x - curr.x || curr.y - prev.y !== next.y - curr.y) {
        out.push(curr)
      }
    }
    return out.length >= 3 ? out : c
  })
}

// --- TrueType table builders ---

interface GlyphData {
  contours: { x: number; y: number }[][]  // font coordinates
  xMin: number; yMin: number; xMax: number; yMax: number
  advanceWidth: number
  lsb: number
}

function encodeGlyf(glyph: GlyphData): Uint8Array {
  if (glyph.contours.length === 0) {
    // Empty glyph (e.g., space)
    return new Uint8Array(0)
  }

  // Calculate size: header + endPts + instructionLen + flags + coordinates
  const totalPoints = glyph.contours.reduce((s, c) => s + c.length, 0)
  // Generous estimate
  const w = new BinaryWriter(10 + glyph.contours.length * 2 + 2 + totalPoints * 5 + 4)

  // Header
  w.i16(glyph.contours.length)  // numberOfContours
  w.i16(glyph.xMin)
  w.i16(glyph.yMin)
  w.i16(glyph.xMax)
  w.i16(glyph.yMax)

  // endPtsOfContours
  let ptIdx = -1
  for (const contour of glyph.contours) {
    ptIdx += contour.length
    w.u16(ptIdx)
  }

  // Instructions
  w.u16(0) // instructionLength = 0

  // Flatten points
  const allPts = glyph.contours.flat()

  // Encode flags and coordinates
  // All our points are on-curve. Use simple delta encoding.
  const flags: number[] = []
  const xDeltas: number[] = []
  const yDeltas: number[] = []

  let prevX = 0, prevY = 0
  for (const pt of allPts) {
    const dx = pt.x - prevX
    const dy = pt.y - prevY
    prevX = pt.x
    prevY = pt.y

    let flag = 0x01 // ON_CURVE_POINT

    // X coordinate flags
    if (dx === 0) {
      flag |= 0x10 // X_IS_SAME (repeat previous, i.e., delta=0)
    } else if (dx >= -255 && dx <= 255) {
      flag |= 0x02 // X_SHORT_VECTOR
      if (dx > 0) flag |= 0x10 // positive
    }

    // Y coordinate flags
    if (dy === 0) {
      flag |= 0x20 // Y_IS_SAME
    } else if (dy >= -255 && dy <= 255) {
      flag |= 0x04 // Y_SHORT_VECTOR
      if (dy > 0) flag |= 0x20 // positive
    }

    flags.push(flag)
    xDeltas.push(dx)
    yDeltas.push(dy)
  }

  // Write flags (no RLE for simplicity)
  for (const f of flags) w.u8(f)

  // Write x coordinates
  for (let i = 0; i < allPts.length; i++) {
    const dx = xDeltas[i]
    if (dx === 0) continue // X_IS_SAME, nothing written
    if (flags[i] & 0x02) {
      w.u8(Math.abs(dx)) // short vector
    } else {
      w.i16(dx)
    }
  }

  // Write y coordinates
  for (let i = 0; i < allPts.length; i++) {
    const dy = yDeltas[i]
    if (dy === 0) continue
    if (flags[i] & 0x04) {
      w.u8(Math.abs(dy))
    } else {
      w.i16(dy)
    }
  }

  return w.bytes()
}

function buildCmap(glyphUnicodes: { unicode: number; glyphId: number }[]): Uint8Array {
  // Build format 4 subtable for BMP characters
  const entries = glyphUnicodes
    .filter(e => e.unicode >= 0 && e.unicode <= 0xFFFF)
    .sort((a, b) => a.unicode - b.unicode)

  // Build segments
  const segments: { start: number; end: number; delta: number }[] = []
  for (const e of entries) {
    const last = segments.length > 0 ? segments[segments.length - 1] : null
    if (last && e.unicode === last.end + 1 && e.glyphId - e.unicode === last.delta) {
      last.end = e.unicode
    } else {
      segments.push({ start: e.unicode, end: e.unicode, delta: e.glyphId - e.unicode })
    }
  }
  // Add sentinel segment
  segments.push({ start: 0xFFFF, end: 0xFFFF, delta: 1 })

  const segCount = segments.length
  const searchRange = 2 * (1 << Math.floor(Math.log2(segCount)))
  const entrySelector = Math.floor(Math.log2(segCount))
  const rangeShift = 2 * segCount - searchRange

  // Format 4 subtable size
  const fmt4Size = 16 + segCount * 8 // header(14) + reservedPad(2) + 4 arrays of segCount uint16

  // cmap header: version(2) + numTables(2) + record(8) + format4
  const w = new BinaryWriter(4 + 8 + fmt4Size)

  // cmap header
  w.u16(0)  // version
  w.u16(1)  // numTables

  // Encoding record: platform 3 (Windows), encoding 1 (Unicode BMP)
  w.u16(3)   // platformID
  w.u16(1)   // encodingID
  w.u32(12)  // offset to subtable

  // Format 4 subtable
  w.u16(4)          // format
  w.u16(fmt4Size)   // length
  w.u16(0)          // language
  w.u16(segCount * 2) // segCountX2
  w.u16(searchRange)
  w.u16(entrySelector)
  w.u16(rangeShift)

  // endCode
  for (const seg of segments) w.u16(seg.end)
  w.u16(0) // reservedPad

  // startCode
  for (const seg of segments) w.u16(seg.start)

  // idDelta
  for (const seg of segments) w.i16(seg.delta)

  // idRangeOffset (all zeros — we use delta mapping)
  for (let i = 0; i < segCount; i++) w.u16(0)

  return w.bytes()
}

function buildName(familyName: string, styleName: string): Uint8Array {
  const fullName = familyName + ' ' + styleName
  const psName = familyName.replace(/\s/g, '') + '-' + styleName
  const uniqueId = psName

  // Name records: ID 0=copyright, 1=family, 2=style, 3=uniqueId, 4=fullName, 5=version, 6=psName
  const strings = [
    { id: 1, value: familyName },
    { id: 2, value: styleName },
    { id: 3, value: uniqueId },
    { id: 4, value: fullName },
    { id: 5, value: 'Version 1.000' },
    { id: 6, value: psName },
  ]

  // Encode as platform 3 (Windows), encoding 1 (Unicode BMP), language 0x0409 (English)
  const encodedStrings = strings.map(s => {
    const buf = new Uint8Array(s.value.length * 2)
    for (let i = 0; i < s.value.length; i++) {
      buf[i * 2] = s.value.charCodeAt(i) >> 8
      buf[i * 2 + 1] = s.value.charCodeAt(i) & 0xFF
    }
    return { id: s.id, data: buf }
  })

  const headerSize = 6 + strings.length * 12
  const totalStringSize = encodedStrings.reduce((s, e) => s + e.data.length, 0)
  const w = new BinaryWriter(headerSize + totalStringSize)

  w.u16(0) // format
  w.u16(strings.length) // count
  w.u16(headerSize) // stringOffset

  let strOffset = 0
  for (const es of encodedStrings) {
    w.u16(3)      // platformID (Windows)
    w.u16(1)      // encodingID (Unicode BMP)
    w.u16(0x0409) // languageID (English)
    w.u16(es.id)  // nameID
    w.u16(es.data.length) // length
    w.u16(strOffset)      // offset
    strOffset += es.data.length
  }

  for (const es of encodedStrings) {
    for (const b of es.data) w.u8(b)
  }

  return w.bytes()
}

function buildPost(): Uint8Array {
  const w = new BinaryWriter(32)
  w.fixed(3.0)  // format 3.0 (no glyph names)
  w.fixed(0)    // italicAngle
  w.i16(-100)   // underlinePosition
  w.i16(50)     // underlineThickness
  w.u32(1)      // isFixedPitch
  w.u32(0)      // minMemType42
  w.u32(0)      // maxMemType42
  w.u32(0)      // minMemType1
  w.u32(0)      // maxMemType1
  return w.bytes()
}

export function exportTtf(font: FontInstance): ArrayBuffer {
  const w = font.glyphWidth.value
  const h = font.glyphHeight.value
  const baseline = font.baseline.value
  const data = font.fontData.value
  const start = font.startChar.value
  const count = glyphCount(font)
  const bpr = bytesPerRow(font)
  const bpg = bytesPerGlyph(font)
  const enc = font.encodings.value

  const scale = 100
  const unitsPerEm = h * scale
  const advanceWidth = w * scale
  const ascent = baseline * scale
  const lineGap = (h - baseline) * scale

  const baseName = font.fontName.value || font.fileName.value.replace(/\.\w+$/, '')

  // Build glyph data
  const glyphs: GlyphData[] = []
  const unicodeMap: { unicode: number; glyphId: number }[] = []

  // .notdef glyph (index 0)
  glyphs.push({
    contours: [],
    xMin: 0, yMin: 0, xMax: 0, yMax: 0,
    advanceWidth,
    lsb: 0,
  })

  // Font bounding box
  let fontXMin = 0x7FFF, fontYMin = 0x7FFF, fontXMax = -0x7FFF, fontYMax = -0x7FFF
  let maxPoints = 0, maxContours = 0

  for (let i = 0; i < count; i++) {
    const charCode = start + i
    let unicode = charCode
    if (enc && i < enc.length && enc[i] >= 0) unicode = enc[i]

    const pixelContours = traceGlyphContours(data, i, w, h, bpr, bpg)

    // Convert to font coordinates
    const fontContours = pixelContours.map(c =>
      c.map(p => ({ x: p.x * scale, y: (baseline - p.y) * scale }))
    )

    let xMin = 0, yMin = 0, xMax = 0, yMax = 0
    if (fontContours.length > 0) {
      const allPts = fontContours.flat()
      xMin = Math.min(...allPts.map(p => p.x))
      yMin = Math.min(...allPts.map(p => p.y))
      xMax = Math.max(...allPts.map(p => p.x))
      yMax = Math.max(...allPts.map(p => p.y))

      fontXMin = Math.min(fontXMin, xMin)
      fontYMin = Math.min(fontYMin, yMin)
      fontXMax = Math.max(fontXMax, xMax)
      fontYMax = Math.max(fontYMax, yMax)

      const pts = allPts.length
      const ctrs = fontContours.length
      if (pts > maxPoints) maxPoints = pts
      if (ctrs > maxContours) maxContours = ctrs
    }

    const glyphId = glyphs.length
    glyphs.push({
      contours: fontContours,
      xMin, yMin, xMax, yMax,
      advanceWidth,
      lsb: fontContours.length > 0 ? xMin : 0,
    })

    unicodeMap.push({ unicode, glyphId })
  }

  if (fontXMin > fontXMax) {
    fontXMin = fontYMin = fontXMax = fontYMax = 0
  }

  // Encode all glyf entries and build loca
  const glyfEntries: Uint8Array[] = []
  const locaOffsets: number[] = []
  let glyfOffset = 0

  for (const glyph of glyphs) {
    locaOffsets.push(glyfOffset)
    const entry = encodeGlyf(glyph)
    glyfEntries.push(entry)
    glyfOffset += entry.length
    // Pad to 4 bytes
    const pad = (4 - (entry.length % 4)) % 4
    if (pad > 0) {
      glyfEntries.push(new Uint8Array(pad))
      glyfOffset += pad
    }
  }
  locaOffsets.push(glyfOffset) // sentinel

  // Use long loca format (simpler)
  const locaFormat = 1 // long format

  // Build glyf table
  const glyfTable = new Uint8Array(glyfOffset)
  let off = 0
  for (const entry of glyfEntries) {
    glyfTable.set(entry, off)
    off += entry.length
  }

  // Build loca table (long format: uint32 offsets)
  const locaWriter = new BinaryWriter(locaOffsets.length * 4)
  for (const o of locaOffsets) locaWriter.u32(o)
  const locaTable = locaWriter.bytes()

  // Build hmtx table
  const hmtxWriter = new BinaryWriter(glyphs.length * 4)
  for (const g of glyphs) {
    hmtxWriter.u16(g.advanceWidth)
    hmtxWriter.i16(g.lsb)
  }
  const hmtxTable = hmtxWriter.bytes()

  // Build head table
  const now = new Date()
  const headWriter = new BinaryWriter(54)
  headWriter.u16(1); headWriter.u16(0)   // majorVersion, minorVersion
  headWriter.fixed(1.0)                   // fontRevision
  headWriter.u32(0)                       // checksumAdjustment (filled later)
  headWriter.u32(0x5F0F3CF5)             // magicNumber
  headWriter.u16(0x000B)                  // flags (baseline at y=0, lsb at x=0, ppem=integer)
  headWriter.u16(unitsPerEm)
  headWriter.datetime(now)                // created
  headWriter.datetime(now)                // modified
  headWriter.i16(fontXMin)
  headWriter.i16(fontYMin)
  headWriter.i16(fontXMax)
  headWriter.i16(fontYMax)
  headWriter.u16(0)                       // macStyle (regular)
  headWriter.u16(8)                       // lowestRecPPEM
  headWriter.i16(2)                       // fontDirectionHint
  headWriter.i16(locaFormat)              // indexToLocFormat
  headWriter.i16(0)                       // glyphDataFormat
  const headTable = headWriter.bytes()

  // Build hhea table
  const hheaWriter = new BinaryWriter(36)
  hheaWriter.u16(1); hheaWriter.u16(0)   // majorVersion, minorVersion
  hheaWriter.i16(ascent)                  // ascender
  hheaWriter.i16(0)                       // descender
  hheaWriter.i16(lineGap)                 // lineGap
  hheaWriter.u16(advanceWidth)            // advanceWidthMax
  hheaWriter.i16(fontXMin)               // minLeftSideBearing
  hheaWriter.i16(advanceWidth - fontXMax) // minRightSideBearing
  hheaWriter.i16(fontXMax)               // xMaxExtent
  hheaWriter.i16(1)                       // caretSlopeRise
  hheaWriter.i16(0)                       // caretSlopeRun
  hheaWriter.i16(0)                       // caretOffset
  hheaWriter.i16(0); hheaWriter.i16(0)   // reserved
  hheaWriter.i16(0); hheaWriter.i16(0)   // reserved
  hheaWriter.i16(0)                       // metricDataFormat
  hheaWriter.u16(glyphs.length)           // numberOfHMetrics
  const hheaTable = hheaWriter.bytes()

  // Build maxp table (TrueType version)
  const maxpWriter = new BinaryWriter(32)
  maxpWriter.u32(0x00010000)              // version 1.0
  maxpWriter.u16(glyphs.length)           // numGlyphs
  maxpWriter.u16(maxPoints)               // maxPoints
  maxpWriter.u16(maxContours)             // maxContours
  maxpWriter.u16(0)                       // maxCompositePoints
  maxpWriter.u16(0)                       // maxCompositeContours
  maxpWriter.u16(1)                       // maxZones
  maxpWriter.u16(0)                       // maxTwilightPoints
  maxpWriter.u16(0)                       // maxStorage
  maxpWriter.u16(0)                       // maxFunctionDefs
  maxpWriter.u16(0)                       // maxInstructionDefs
  maxpWriter.u16(0)                       // maxStackElements
  maxpWriter.u16(0)                       // maxSizeOfInstructions
  maxpWriter.u16(0)                       // maxComponentElements
  maxpWriter.u16(0)                       // maxComponentDepth
  const maxpTable = maxpWriter.bytes()

  // Build OS/2 table (version 4)
  const os2Writer = new BinaryWriter(96)
  os2Writer.u16(4)                        // version
  os2Writer.i16(Math.round(advanceWidth * 0.5)) // xAvgCharWidth
  os2Writer.u16(400)                      // usWeightClass (Regular)
  os2Writer.u16(5)                        // usWidthClass (Medium)
  os2Writer.u16(0)                        // fsType
  os2Writer.i16(Math.round(unitsPerEm * 0.6))  // ySubscriptXSize
  os2Writer.i16(Math.round(unitsPerEm * 0.7))  // ySubscriptYSize
  os2Writer.i16(0)                        // ySubscriptXOffset
  os2Writer.i16(Math.round(unitsPerEm * 0.14)) // ySubscriptYOffset
  os2Writer.i16(Math.round(unitsPerEm * 0.6))  // ySuperscriptXSize
  os2Writer.i16(Math.round(unitsPerEm * 0.7))  // ySuperscriptYSize
  os2Writer.i16(0)                        // ySuperscriptXOffset
  os2Writer.i16(Math.round(unitsPerEm * 0.48)) // ySuperscriptYOffset
  os2Writer.i16(Math.round(scale * 0.5)) // yStrikeoutSize
  os2Writer.i16(Math.round(ascent * 0.44)) // yStrikeoutPosition
  os2Writer.i16(0)                        // sFamilyClass
  // panose (10 bytes)
  const panose = [2, 0, 5, 9, 0, 0, 0, 0, 0, 0] // Latin, monospaced
  for (const b of panose) os2Writer.u8(b)
  // ulUnicodeRange (16 bytes) — basic Latin
  os2Writer.u32(1); os2Writer.u32(0); os2Writer.u32(0); os2Writer.u32(0)
  // achVendID
  os2Writer.tag('    ')
  os2Writer.u16(0x0040)                   // fsSelection (Regular)
  // usFirstCharIndex, usLastCharIndex
  const unicodes = unicodeMap.map(e => e.unicode)
  os2Writer.u16(Math.min(...unicodes))
  os2Writer.u16(Math.min(0xFFFF, Math.max(...unicodes)))
  os2Writer.i16(ascent)                   // sTypoAscender
  os2Writer.i16(0)                        // sTypoDescender
  os2Writer.i16(lineGap)                  // sTypoLineGap
  os2Writer.u16(ascent)                   // usWinAscent
  os2Writer.u16(lineGap)                  // usWinDescent
  // ulCodePageRange (8 bytes)
  os2Writer.u32(1); os2Writer.u32(0)      // Latin 1
  os2Writer.i16(font.xHeight.value > 0 ? font.xHeight.value * scale : Math.round(ascent * 0.7))
  os2Writer.i16(font.capHeight.value > 0 ? font.capHeight.value * scale : ascent)
  os2Writer.u16(0)                        // usDefaultChar
  os2Writer.u16(0x20)                     // usBreakChar (space)
  os2Writer.u16(1)                        // usMaxContext
  const os2Table = os2Writer.bytes()

  const cmapTable = buildCmap(unicodeMap)
  const nameTable = buildName(baseName, 'Regular')
  const postTable = buildPost()

  // Assemble the TTF file
  const tables: { tag: string; data: Uint8Array }[] = [
    { tag: 'cmap', data: cmapTable },
    { tag: 'glyf', data: glyfTable },
    { tag: 'head', data: headTable },
    { tag: 'hhea', data: hheaTable },
    { tag: 'hmtx', data: hmtxTable },
    { tag: 'loca', data: locaTable },
    { tag: 'maxp', data: maxpTable },
    { tag: 'name', data: nameTable },
    { tag: 'OS/2', data: os2Table },
    { tag: 'post', data: postTable },
  ]

  // Sort tables by tag
  tables.sort((a, b) => a.tag < b.tag ? -1 : a.tag > b.tag ? 1 : 0)

  const numTables = tables.length
  const entrySelector = Math.floor(Math.log2(numTables))
  const searchRange = (1 << entrySelector) * 16
  const rangeShift = numTables * 16 - searchRange

  // Calculate offsets
  const headerSize = 12 + numTables * 16
  let tableOffset = headerSize
  const tableEntries = tables.map(t => {
    const padded = t.data.length + ((4 - (t.data.length % 4)) % 4)
    const entry = { tag: t.tag, checksum: calcChecksum(t.data), offset: tableOffset, length: t.data.length, data: t.data }
    tableOffset += padded
    return entry
  })

  const totalSize = tableOffset
  const out = new BinaryWriter(totalSize)

  // Offset table
  out.u32(0x00010000)   // sfVersion (TrueType)
  out.u16(numTables)
  out.u16(searchRange)
  out.u16(entrySelector)
  out.u16(rangeShift)

  // Table records
  for (const e of tableEntries) {
    out.tag(e.tag)
    out.u32(e.checksum)
    out.u32(e.offset)
    out.u32(e.length)
  }

  // Table data
  for (const e of tableEntries) {
    for (const b of e.data) out.u8(b)
    // Pad to 4 bytes
    const pad = (4 - (e.length % 4)) % 4
    for (let i = 0; i < pad; i++) out.u8(0)
  }

  // Fix head checksumAdjustment
  const fullBytes = new Uint8Array(out.buffer, 0, totalSize)
  const fullChecksum = calcChecksum(fullBytes)
  const adjustment = (0xB1B0AFBA - fullChecksum) >>> 0
  // Find head table and patch checksumAdjustment at offset +8
  const headEntry = tableEntries.find(e => e.tag === 'head')!
  const view = new DataView(out.buffer)
  view.setUint32(headEntry.offset + 8, adjustment)

  return (out.buffer as ArrayBuffer).slice(0, totalSize)
}
