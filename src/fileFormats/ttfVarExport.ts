import type { FontInstance } from '../store'
import { glyphCount, bytesPerRow, bytesPerGlyph } from '../store'
import { BinaryWriter, buildCmap, buildName, buildPost, assembleTtf } from './ttfUtils'

// --- Pixel component shape ---
// 12-point contour centered at origin: 4 on-curve (edge midpoints) + 8 off-curve (2 per corner)
// Square default: off-curve pairs at corners = sharp corners
// Circle variation: off-curve pairs spread along edges = smooth arcs

const HALF = 50 // half pixel size at scale=100

// k = HALF * tan(π/8) ≈ 20.71 — control point distance for circle approximation
const K = Math.round(HALF * Math.tan(Math.PI / 8))

// Points: on/off flag, x, y at default (square)
// CW from top midpoint
const PIXEL_PTS: { on: boolean; x: number; y: number }[] = [
  { on: true,  x: 0,     y: HALF },   // 0  top mid
  { on: false, x: HALF,  y: HALF },   // 1  TR corner A
  { on: false, x: HALF,  y: HALF },   // 2  TR corner B
  { on: true,  x: HALF,  y: 0 },      // 3  right mid
  { on: false, x: HALF,  y: -HALF },  // 4  BR corner A
  { on: false, x: HALF,  y: -HALF },  // 5  BR corner B
  { on: true,  x: 0,     y: -HALF },  // 6  bottom mid
  { on: false, x: -HALF, y: -HALF },  // 7  BL corner A
  { on: false, x: -HALF, y: -HALF },  // 8  BL corner B
  { on: true,  x: -HALF, y: 0 },      // 9  left mid
  { on: false, x: -HALF, y: HALF },   // 10 TL corner A
  { on: false, x: -HALF, y: HALF },   // 11 TL corner B
]

// Circle positions for off-curve points (on-curve stay the same)
const PIXEL_CIRCLE: { x: number; y: number }[] = [
  { x: 0,    y: HALF },   // 0  same
  { x: K,    y: HALF },   // 1  TR-A: moved left along top edge
  { x: HALF, y: K },      // 2  TR-B: moved down along right edge
  { x: HALF, y: 0 },      // 3  same
  { x: HALF, y: -K },     // 4  BR-A: moved up along right edge
  { x: K,    y: -HALF },  // 5  BR-B: moved left along bottom edge
  { x: 0,    y: -HALF },  // 6  same
  { x: -K,   y: -HALF },  // 7  BL-A: moved right along bottom edge
  { x: -HALF, y: -K },    // 8  BL-B: moved up along left edge
  { x: -HALF, y: 0 },     // 9  same
  { x: -HALF, y: K },     // 10 TL-A: moved down along left edge
  { x: -K,   y: HALF },   // 11 TL-B: moved right along top edge
]

// --- Encode the pixel component simple glyph ---

function encodePixelGlyph(scale: number): Uint8Array {
  const half = scale / 2
  const w = new BinaryWriter(200)

  // Header
  w.i16(1) // numberOfContours
  w.i16(-half); w.i16(-half); w.i16(half); w.i16(half) // bbox

  // endPtsOfContours
  w.u16(PIXEL_PTS.length - 1)

  // Instructions
  w.u16(0)

  // Flags
  const pts = PIXEL_PTS.map(p => ({ x: Math.round(p.x * scale / 100), y: Math.round(p.y * scale / 100) }))
  let prevX = 0, prevY = 0
  const flags: number[] = []
  const xDeltas: number[] = []
  const yDeltas: number[] = []

  for (let i = 0; i < PIXEL_PTS.length; i++) {
    const dx = pts[i].x - prevX
    const dy = pts[i].y - prevY
    prevX = pts[i].x; prevY = pts[i].y

    let flag = PIXEL_PTS[i].on ? 0x01 : 0x00
    if (dx === 0) flag |= 0x10
    else if (Math.abs(dx) <= 255) { flag |= 0x02; if (dx > 0) flag |= 0x10 }
    if (dy === 0) flag |= 0x20
    else if (Math.abs(dy) <= 255) { flag |= 0x04; if (dy > 0) flag |= 0x20 }

    flags.push(flag)
    xDeltas.push(dx)
    yDeltas.push(dy)
  }

  for (const f of flags) w.u8(f)
  for (let i = 0; i < pts.length; i++) {
    if (xDeltas[i] === 0) continue
    if (flags[i] & 0x02) w.u8(Math.abs(xDeltas[i]))
    else w.i16(xDeltas[i])
  }
  for (let i = 0; i < pts.length; i++) {
    if (yDeltas[i] === 0) continue
    if (flags[i] & 0x04) w.u8(Math.abs(yDeltas[i]))
    else w.i16(yDeltas[i])
  }

  return w.bytes()
}

// --- Encode composite glyph ---

function encodeCompositeGlyph(
  pixelGlyphId: number,
  positions: { x: number; y: number }[],
  xMin: number, yMin: number, xMax: number, yMax: number,
  scale: number,
): Uint8Array {
  if (positions.length === 0) return new Uint8Array(0)

  const half = scale / 2
  const w = new BinaryWriter(10 + positions.length * 10)

  // Header
  w.i16(-1) // numberOfContours = -1 (composite)
  w.i16(xMin - half); w.i16(yMin - half)
  w.i16(xMax + half); w.i16(yMax + half)

  for (let i = 0; i < positions.length; i++) {
    const isLast = i === positions.length - 1
    const x = positions[i].x
    const y = positions[i].y
    const useWords = Math.abs(x) > 127 || Math.abs(y) > 127

    let flags = 0x0002 // ARGS_ARE_XY_VALUES
    if (useWords) flags |= 0x0001 // ARG_1_AND_2_ARE_WORDS
    if (!isLast) flags |= 0x0020 // MORE_COMPONENTS
    if (i === 0) flags |= 0x0200 // USE_MY_METRICS

    w.u16(flags)
    w.u16(pixelGlyphId)
    if (useWords) { w.i16(x); w.i16(y) }
    else { w.u8(x & 0xFF); w.u8(y & 0xFF) }
  }

  return w.bytes()
}

// --- fvar table ---

function buildFvar(rondNameId: number, pixlNameId: number, instanceNameIds: number[]): Uint8Array {
  const axisSize = 20
  const axisCount = 2
  const instanceCount = instanceNameIds.length
  const instanceSize = 4 + axisCount * 4 // subfamilyNameID(2) + flags(2) + coordinates(4 * axisCount)
  const w = new BinaryWriter(16 + axisCount * axisSize + instanceCount * instanceSize)

  w.u16(1); w.u16(0)        // majorVersion, minorVersion
  w.u16(16)                   // offsetToAxesArray
  w.u16(2)                    // reserved
  w.u16(axisCount)            // axisCount
  w.u16(axisSize)             // axisSize
  w.u16(instanceCount)        // instanceCount
  w.u16(instanceSize)         // instanceSize

  // ROND axis: 0 (square) to 100 (circle), default 0
  w.tag('ROND')
  w.fixed(0)     // minValue
  w.fixed(0)     // defaultValue
  w.fixed(100)   // maxValue
  w.u16(0)        // flags
  w.u16(rondNameId)

  // PIXL axis: 40 (tiny dots) to 150 (overlapping), default 100
  w.tag('PIXL')
  w.fixed(40)    // minValue
  w.fixed(100)   // defaultValue
  w.fixed(150)   // maxValue
  w.u16(0)        // flags
  w.u16(pixlNameId)

  // Named instances
  // Instance 0: "Pixel" — ROND=0, PIXL=85 (square pixels not quite touching)
  w.u16(instanceNameIds[0]); w.u16(0) // subfamilyNameID, flags
  w.fixed(0); w.fixed(85)              // ROND, PIXL

  // Instance 1: "Printer" — ROND=100, PIXL=70 (round dots not touching)
  w.u16(instanceNameIds[1]); w.u16(0)
  w.fixed(100); w.fixed(70)

  return w.bytes()
}

// --- gvar table ---
// Only the pixel component glyph (index 1) has variation data.
// It needs deltas for ROND axis and PIXL axis.

function packDeltas(deltas: number[]): Uint8Array {
  const parts: number[] = []
  let i = 0
  while (i < deltas.length) {
    // Zero run
    let zeroRun = 0
    while (i + zeroRun < deltas.length && deltas[i + zeroRun] === 0) zeroRun++
    if (zeroRun > 0) {
      while (zeroRun > 0) {
        const n = Math.min(zeroRun, 64)
        parts.push(0x80 | (n - 1)) // DELTAS_ARE_ZERO
        zeroRun -= n; i += n
      }
      continue
    }
    // Non-zero: check if we need words
    let run = 0
    let needWords = false
    while (i + run < deltas.length && deltas[i + run] !== 0 && run < 64) {
      if (deltas[i + run] < -128 || deltas[i + run] > 127) needWords = true
      run++
    }
    if (needWords) {
      parts.push(0x40 | (run - 1)) // DELTAS_ARE_WORDS
      for (let j = 0; j < run; j++) {
        const v = deltas[i + j]
        parts.push((v >> 8) & 0xFF, v & 0xFF)
      }
    } else {
      parts.push((run - 1)) // byte deltas
      for (let j = 0; j < run; j++) parts.push(deltas[i + j] & 0xFF)
    }
    i += run
  }
  return new Uint8Array(parts)
}

function buildGvarProper(numGlyphs: number, scale: number): Uint8Array {
  const nPts = PIXEL_PTS.length

  // Compute ROND deltas (interleaved x,y)
  const rondXY: number[] = []
  for (let i = 0; i < nPts; i++) {
    rondXY.push(Math.round(PIXEL_CIRCLE[i].x * scale / 100) - Math.round(PIXEL_PTS[i].x * scale / 100))
    rondXY.push(Math.round(PIXEL_CIRCLE[i].y * scale / 100) - Math.round(PIXEL_PTS[i].y * scale / 100))
  }
  // 4 phantom points (x,y each)
  for (let i = 0; i < 8; i++) rondXY.push(0)

  // Compute PIXL deltas (delta = default coordinate value)
  // Positive direction: at peak +1.0 (axis=150), coords grow by 100%
  // Negative direction: at peak -1.0 (axis=40), coords shrink by 100%
  const sizeGrowXY: number[] = []
  const sizeShrinkXY: number[] = []
  for (let i = 0; i < nPts; i++) {
    const sx = Math.round(PIXEL_PTS[i].x * scale / 100)
    const sy = Math.round(PIXEL_PTS[i].y * scale / 100)
    sizeGrowXY.push(sx, sy)
    sizeShrinkXY.push(-sx, -sy)
  }
  for (let i = 0; i < 8; i++) { sizeGrowXY.push(0); sizeShrinkXY.push(0) }

  // Interaction tuples: ROND × PIXL correction
  // Without these, combining ROND + PIXL shrink creates diamond artifacts
  // because PIXL deltas are based on square coords but ROND has moved points.
  // The interaction deltas = rond_deltas for grow, -rond_deltas for shrink.
  const interGrowXY = [...rondXY]   // same as ROND deltas
  const interShrinkXY = rondXY.map(d => -d) // negated ROND deltas

  // Pack x and y deltas separately for each tuple
  function packXY(deltas: number[]): Uint8Array {
    const xVals = deltas.filter((_, i) => i % 2 === 0)
    const yVals = deltas.filter((_, i) => i % 2 === 1)
    const xPacked = packDeltas(xVals)
    const yPacked = packDeltas(yVals)
    const out = new Uint8Array(xPacked.length + yPacked.length)
    out.set(xPacked, 0)
    out.set(yPacked, xPacked.length)
    return out
  }

  const rondPacked = packXY(rondXY)
  const sizeGrowPacked = packXY(sizeGrowXY)
  const sizeShrinkPacked = packXY(sizeShrinkXY)
  const interGrowPacked = packXY(interGrowXY)
  const interShrinkPacked = packXY(interShrinkXY)

  const tupleCount = 5
  const serializedSize = 1 + rondPacked.length + sizeGrowPacked.length +
    sizeShrinkPacked.length + interGrowPacked.length + interShrinkPacked.length

  // Build glyph 1 variation data block
  const tupleHeaderSize = 4 + 4 // variationDataSize(2) + tupleIndex(2) + peakTuple(2*2)
  const glyphDataHeaderSize = 4 + tupleCount * tupleHeaderSize

  const glyphData = new BinaryWriter(glyphDataHeaderSize + serializedSize)
  glyphData.u16(0x8000 | tupleCount) // SHARED_POINT_NUMBERS | count
  glyphData.u16(glyphDataHeaderSize) // offsetToSerializedData

  // Tuple 1: ROND peak=(1.0, 0.0) — square to circle
  glyphData.u16(rondPacked.length)
  glyphData.u16(0x8000)
  glyphData.i16(0x4000); glyphData.i16(0)

  // Tuple 2: PIXL grow peak=(0.0, 1.0) — bigger pixels
  glyphData.u16(sizeGrowPacked.length)
  glyphData.u16(0x8000)
  glyphData.i16(0); glyphData.i16(0x4000)

  // Tuple 3: PIXL shrink peak=(0.0, -1.0) — smaller pixels
  glyphData.u16(sizeShrinkPacked.length)
  glyphData.u16(0x8000)
  glyphData.i16(0); glyphData.i16(-0x4000)

  // Tuple 4: ROND×PIXL grow peak=(1.0, 1.0) — interaction correction
  glyphData.u16(interGrowPacked.length)
  glyphData.u16(0x8000)
  glyphData.i16(0x4000); glyphData.i16(0x4000)

  // Tuple 5: ROND×PIXL shrink peak=(1.0, -1.0) — interaction correction
  glyphData.u16(interShrinkPacked.length)
  glyphData.u16(0x8000)
  glyphData.i16(0x4000); glyphData.i16(-0x4000)

  // Serialized data
  glyphData.u8(0) // shared point numbers: 0 = all points
  for (const b of rondPacked) glyphData.u8(b)
  for (const b of sizeGrowPacked) glyphData.u8(b)
  for (const b of sizeShrinkPacked) glyphData.u8(b)
  for (const b of interGrowPacked) glyphData.u8(b)
  for (const b of interShrinkPacked) glyphData.u8(b)

  const glyphDataBytes = glyphData.bytes()

  // Build gvar table (short offsets like fontTools)
  const offsetsSize = (numGlyphs + 1) * 2
  const gvarHeaderSize = 20

  // Ensure glyph data is 2-byte aligned for short offsets
  const glyphDataLen = glyphDataBytes.length
  const paddedLen = glyphDataLen + (glyphDataLen % 2)

  const totalSize = gvarHeaderSize + offsetsSize + paddedLen
  const gvar = new BinaryWriter(totalSize)

  gvar.u16(1); gvar.u16(0) // version 1.0
  gvar.u16(2)               // axisCount
  gvar.u16(0)               // sharedTupleCount
  gvar.u32(gvarHeaderSize + offsetsSize) // offsetToSharedTuples
  gvar.u16(numGlyphs)
  gvar.u16(0)               // flags: short offsets
  gvar.u32(gvarHeaderSize + offsetsSize) // offsetToGlyphVariationDataArray

  // Offsets (short: actual offset / 2)
  const endHalf = paddedLen / 2
  gvar.u16(0) // glyph 0 start
  gvar.u16(0) // glyph 1 start
  for (let i = 2; i <= numGlyphs; i++) {
    gvar.u16(endHalf)
  }

  // Glyph variation data
  for (const b of glyphDataBytes) gvar.u8(b)
  if (glyphDataLen % 2) gvar.u8(0) // pad to 2-byte boundary

  return gvar.bytes()
}

// --- STAT table (required by Windows for variable fonts) ---

function buildStat(rondNameId: number, pixlNameId: number): Uint8Array {
  // Version 1.1 with 2 design axes, no axis values
  const axisCount = 2
  const axisSize = 8 // tag(4) + nameID(2) + ordering(2)
  const headerSize = 20 // version(4) + designAxisSize(2) + designAxisCount(2) + designAxesOffset(4) + axisValueCount(2) + axisValuesOffset(4) + elidedFallbackNameID(2)
  const w = new BinaryWriter(headerSize + axisCount * axisSize)

  w.u16(1); w.u16(1)      // version 1.1
  w.u16(axisSize)           // designAxisSize
  w.u16(axisCount)          // designAxisCount
  w.u32(headerSize)         // designAxesOffset
  w.u16(0)                  // axisValueCount
  w.u32(0)                  // axisValuesOffset (none)
  w.u16(2)                  // elidedFallbackNameID (nameID 2 = "Regular")

  // Axis 0: ROND
  w.tag('ROND')
  w.u16(rondNameId)
  w.u16(0) // ordering

  // Axis 1: PIXL
  w.tag('PIXL')
  w.u16(pixlNameId)
  w.u16(1) // ordering

  return w.bytes()
}

// --- Main export ---

export function exportVarTtf(font: FontInstance): ArrayBuffer {
  const glyphW = font.glyphWidth.value
  const glyphH = font.glyphHeight.value
  const baseline = font.baseline.value
  const data = font.fontData.value
  const start = font.startChar.value
  const count = glyphCount(font)
  const bpr = bytesPerRow(font)
  const bpg = bytesPerGlyph(font)
  const enc = font.encodings.value

  const scale = 100
  const unitsPerEm = glyphH * scale
  const advanceWidth = glyphW * scale
  const ascent = baseline * scale
  const lineGap = (glyphH - baseline) * scale
  const half = scale / 2

  const baseName = font.fontName.value || font.fileName.value.replace(/\.\w+$/, '')

  // Glyph layout:
  // 0: .notdef (empty)
  // 1: pixel component (simple glyph)
  // 2+: character glyphs (composite, referencing glyph 1)

  const pixelGlyphId = 1
  const pixelGlyph = encodePixelGlyph(scale)

  // Build character glyphs
  const charGlyphs: Uint8Array[] = []
  const unicodeMap: { unicode: number; glyphId: number }[] = []
  let fontXMin = 0x7FFF, fontYMin = 0x7FFF, fontXMax = -0x7FFF, fontYMax = -0x7FFF
  let maxComponentElements = 0

  for (let i = 0; i < count; i++) {
    const charCode = start + i
    let unicode = charCode
    if (enc && i < enc.length && enc[i] >= 0) unicode = enc[i]

    // Find set pixels
    const positions: { x: number; y: number }[] = []
    let xMin = 0x7FFF, yMin = 0x7FFF, xMax = -0x7FFF, yMax = -0x7FFF

    for (let py = 0; py < glyphH; py++) {
      for (let px = 0; px < glyphW; px++) {
        const byteIdx = i * bpg + py * bpr + (px >> 3)
        if (data[byteIdx] & (0x80 >> (px & 7))) {
          // Component center position
          const cx = px * scale + half
          const cy = (baseline - py - 1) * scale + half
          positions.push({ x: cx, y: cy })

          // Update bounds (pixel fills cx±half, cy±half)
          if (cx - half < xMin) xMin = cx - half
          if (cy - half < yMin) yMin = cy - half
          if (cx + half > xMax) xMax = cx + half
          if (cy + half > yMax) yMax = cy + half
        }
      }
    }

    if (positions.length > maxComponentElements) maxComponentElements = positions.length

    const glyphId = 2 + i
    let glyphBytes: Uint8Array
    if (positions.length > 0) {
      glyphBytes = encodeCompositeGlyph(pixelGlyphId, positions, xMin, yMin, xMax, yMax, scale)
      fontXMin = Math.min(fontXMin, xMin - half)
      fontYMin = Math.min(fontYMin, yMin - half)
      fontXMax = Math.max(fontXMax, xMax + half)
      fontYMax = Math.max(fontYMax, yMax + half)
    } else {
      glyphBytes = new Uint8Array(0)
    }
    charGlyphs.push(glyphBytes)
    unicodeMap.push({ unicode, glyphId })
  }

  if (fontXMin > fontXMax) fontXMin = fontYMin = fontXMax = fontYMax = 0

  const numGlyphs = 2 + count // .notdef + pixel + characters

  // Build glyf table
  const glyfParts: { data: Uint8Array; offset: number }[] = []
  const locaOffsets: number[] = []
  let glyfOffset = 0

  function addGlyf(entry: Uint8Array) {
    locaOffsets.push(glyfOffset)
    glyfParts.push({ data: entry, offset: glyfOffset })
    glyfOffset += entry.length
    const pad = (4 - (entry.length % 4)) % 4
    if (pad > 0) glyfOffset += pad
  }

  addGlyf(new Uint8Array(0))  // .notdef
  addGlyf(pixelGlyph)          // pixel component
  for (const cg of charGlyphs) addGlyf(cg) // characters
  locaOffsets.push(glyfOffset) // sentinel

  const glyfTable = new Uint8Array(glyfOffset)
  for (const part of glyfParts) {
    glyfTable.set(part.data, part.offset)
  }

  // loca (long format)
  const locaW = new BinaryWriter(locaOffsets.length * 4)
  for (const o of locaOffsets) locaW.u32(o)

  // hmtx
  const hmtxW = new BinaryWriter(numGlyphs * 4)
  for (let i = 0; i < numGlyphs; i++) {
    hmtxW.u16(advanceWidth)
    hmtxW.i16(0) // lsb (0 for simplicity)
  }

  // head
  const now = new Date()
  const headW = new BinaryWriter(54)
  headW.u16(1); headW.u16(0)
  headW.fixed(1.0)
  headW.u32(0) // checksumAdjustment
  headW.u32(0x5F0F3CF5)
  headW.u16(0x000B)
  headW.u16(unitsPerEm)
  headW.datetime(now); headW.datetime(now)
  headW.i16(fontXMin); headW.i16(fontYMin); headW.i16(fontXMax); headW.i16(fontYMax)
  headW.u16(0); headW.u16(8); headW.i16(2)
  headW.i16(1) // indexToLocFormat = long
  headW.i16(0)

  // hhea
  const hheaW = new BinaryWriter(36)
  hheaW.u16(1); hheaW.u16(0)
  hheaW.i16(ascent); hheaW.i16(0); hheaW.i16(lineGap)
  hheaW.u16(advanceWidth)
  hheaW.i16(fontXMin > 0 ? 0 : fontXMin)
  hheaW.i16(0)
  hheaW.i16(fontXMax)
  hheaW.i16(1); hheaW.i16(0); hheaW.i16(0)
  hheaW.i16(0); hheaW.i16(0); hheaW.i16(0); hheaW.i16(0)
  hheaW.i16(0)
  hheaW.u16(numGlyphs)

  // maxp
  const maxpW = new BinaryWriter(32)
  maxpW.u32(0x00010000)
  maxpW.u16(numGlyphs)
  maxpW.u16(PIXEL_PTS.length) // maxPoints (simple glyph)
  maxpW.u16(1)                 // maxContours (simple glyph)
  maxpW.u16(maxComponentElements * PIXEL_PTS.length) // maxCompositePoints
  maxpW.u16(maxComponentElements) // maxCompositeContours
  maxpW.u16(1)                 // maxZones
  maxpW.u16(0)                 // maxTwilightPoints
  maxpW.u16(0)                 // maxStorage
  maxpW.u16(0)                 // maxFunctionDefs
  maxpW.u16(0)                 // maxInstructionDefs
  maxpW.u16(0)                 // maxStackElements
  maxpW.u16(0)                 // maxSizeOfInstructions
  maxpW.u16(maxComponentElements) // maxComponentElements
  maxpW.u16(1)                 // maxComponentDepth

  // OS/2
  const os2W = new BinaryWriter(96)
  os2W.u16(4)
  os2W.i16(Math.round(advanceWidth * 0.5))
  os2W.u16(400); os2W.u16(5); os2W.u16(0)
  os2W.i16(Math.round(unitsPerEm * 0.6))
  os2W.i16(Math.round(unitsPerEm * 0.7))
  os2W.i16(0)
  os2W.i16(Math.round(unitsPerEm * 0.14))
  os2W.i16(Math.round(unitsPerEm * 0.6))
  os2W.i16(Math.round(unitsPerEm * 0.7))
  os2W.i16(0)
  os2W.i16(Math.round(unitsPerEm * 0.48))
  os2W.i16(Math.round(scale * 0.5))
  os2W.i16(Math.round(ascent * 0.44))
  os2W.i16(0) // sFamilyClass
  for (const b of [2, 0, 5, 9, 0, 0, 0, 0, 0, 0]) os2W.u8(b)
  os2W.u32(1); os2W.u32(0); os2W.u32(0); os2W.u32(0)
  os2W.tag('    ')
  os2W.u16(0x0040)
  const unicodes = unicodeMap.map(e => e.unicode)
  os2W.u16(Math.min(...unicodes))
  os2W.u16(Math.min(0xFFFF, Math.max(...unicodes)))
  os2W.i16(ascent); os2W.i16(0); os2W.i16(lineGap)
  os2W.u16(ascent); os2W.u16(lineGap)
  os2W.u32(1); os2W.u32(0)
  os2W.i16(font.xHeight.value > 0 ? font.xHeight.value * scale : Math.round(ascent * 0.7))
  os2W.i16(font.capHeight.value > 0 ? font.capHeight.value * scale : ascent)
  os2W.u16(0); os2W.u16(0x20); os2W.u16(1)

  // Name table (with axis and instance names)
  const ROND_NAME_ID = 256
  const PIXL_NAME_ID = 257
  const INST_PIXEL_ID = 258
  const INST_PRINTER_ID = 259
  const nameTable = buildName(baseName + ' Variable', 'Regular', [
    { id: ROND_NAME_ID, value: 'Roundness' },
    { id: PIXL_NAME_ID, value: 'Pixel Size' },
    { id: INST_PIXEL_ID, value: 'Pixel' },
    { id: INST_PRINTER_ID, value: 'Printer' },
  ])

  const cmapTable = buildCmap(unicodeMap)
  const postTable = buildPost()
  const fvarTable = buildFvar(ROND_NAME_ID, PIXL_NAME_ID, [INST_PIXEL_ID, INST_PRINTER_ID])
  const gvarTable = buildGvarProper(numGlyphs, scale)
  const statTable = buildStat(ROND_NAME_ID, PIXL_NAME_ID)

  // Assemble
  return assembleTtf([
    { tag: 'OS/2', data: os2W.bytes() },
    { tag: 'cmap', data: cmapTable },
    { tag: 'fvar', data: fvarTable },
    { tag: 'glyf', data: glyfTable },
    { tag: 'gvar', data: gvarTable },
    { tag: 'STAT', data: statTable },
    { tag: 'head', data: headW.bytes() },
    { tag: 'hhea', data: hheaW.bytes() },
    { tag: 'hmtx', data: hmtxW.bytes() },
    { tag: 'loca', data: locaW.bytes() },
    { tag: 'maxp', data: maxpW.bytes() },
    { tag: 'name', data: nameTable },
    { tag: 'post', data: postTable },
  ])
}
