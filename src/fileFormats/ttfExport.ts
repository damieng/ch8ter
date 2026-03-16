import type { FontInstance } from '../store'
import { glyphCount, bytesPerRow, bytesPerGlyph } from '../store'
import { getBit } from '../bitUtils'
import { BinaryWriter, buildCmap, buildName, buildPost, assembleTtf } from './ttfUtils'

// --- Pixel contour tracing ---

interface Pt { x: number; y: number }

function getPixelBit(data: Uint8Array, gi: number, bpr: number, bpg: number, x: number, y: number): boolean {
  return getBit(data, gi * bpg + y * bpr, x)
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
  return assembleTtf([
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
  ])
}
