// Per-font operations: reading and writing glyph pixels, measuring metrics,
// resizing, and converting to/from the plain conversion-data snapshot.
//
// These are pure functions of a FontInstance - none of them touch the open-font
// list, window layout or any other global state - so they do not belong in
// store.ts, which owns the app's mutable state.

import { getBit, setBit, clearBit, bpr as calcBpr } from './bitUtils'
import type { GlyphMeta } from './fileFormats/bdfParser'
import {
  calcAllMetrics, calcAscender, calcCapHeight, calcXHeight, calcNumericHeight, calcDescender,
  buildGlyphLookup,
} from './charMetrics'
import { baseName } from './fontLoad'
import type { FontConversionData } from './fontLoad'
import { type FontInstance, bytesPerRow, bytesPerGlyph } from './fontModel'

/** Fill in only metrics still at their default (-1), using BDF properties where available. */
export function calcMissingMetrics(font: FontInstance) {
  const data = font.fontData.value
  const start = font.startChar.value
  const w = font.glyphWidth.value
  const h = font.glyphHeight.value
  const bl = font.baseline.value
  const props = font.meta.value?.properties
  const lookup = buildGlyphLookup(start, glyphCount(font), font.charset.value)

  if (font.capHeight.value < 0) {
    const fromProp = props?.['CAP_HEIGHT']
    font.capHeight.value = fromProp != null ? parseInt(fromProp) : calcCapHeight(data, start, w, h, bl, lookup)
  }
  if (font.xHeight.value < 0) {
    const fromProp = props?.['X_HEIGHT']
    font.xHeight.value = fromProp != null ? parseInt(fromProp) : calcXHeight(data, start, w, h, bl, lookup)
  }
  if (font.ascender.value < 0) {
    font.ascender.value = calcAscender(data, start, w, h, bl, lookup)
  }
  if (font.numericHeight.value < 0) {
    font.numericHeight.value = calcNumericHeight(data, start, w, h, bl, lookup)
  }
  if (font.descender.value < 0) {
    font.descender.value = calcDescender(data, start, w, h, bl, lookup)
  }
}

/** Recompute every metric from the glyph shapes, overwriting whatever is there. */
export function recalcMetrics(font: FontInstance) {
  const lookup = buildGlyphLookup(font.startChar.value, glyphCount(font), font.charset.value)
  const m = calcAllMetrics(font.fontData.value, font.startChar.value, font.glyphWidth.value, font.glyphHeight.value, lookup)
  font.baseline.value = m.baseline
  font.ascender.value = m.ascender
  font.capHeight.value = m.capHeight
  font.xHeight.value = m.xHeight
  font.numericHeight.value = m.numericHeight
  font.descender.value = m.descender
}

export function glyphCount(font: FontInstance): number {
  const bpg = bytesPerGlyph(font)
  return bpg > 0 ? Math.floor(font.fontData.value.length / bpg) : 0
}

export function getPixel(font: FontInstance, glyphIndex: number, x: number, y: number): boolean {
  const bpr = bytesPerRow(font)
  const bpg = bytesPerGlyph(font)
  const rowOffset = glyphIndex * bpg + y * bpr
  return getBit(font.fontData.value, rowOffset, x)
}

export function glyphToText(font: FontInstance, glyphIndex: number): string {
  const w = font.glyphWidth.value
  const h = font.glyphHeight.value
  const bpr = bytesPerRow(font)
  const bpg = bytesPerGlyph(font)
  const data = font.fontData.value
  const base = glyphIndex * bpg
  const rows: string[] = []
  for (let y = 0; y < h; y++) {
    let row = ''
    for (let x = 0; x < w; x++) {
      row += getBit(data, base + y * bpr, x) ? '*' : ' '
    }
    rows.push(row)
  }
  return rows.join('\r\n')
}

// Return the advance width (in pixels) for a glyph.
// In monospace fonts this is always the global glyph width.
// In proportional fonts we prefer per-glyph DWIDTH, then BBX width, then fall back to glyphWidth.
export function glyphAdvance(font: FontInstance, glyphIndex: number): number {
  const gw = font.glyphWidth.value
  const spacing = font.spacing.value
  const gmArr = font.glyphMeta.value
  const gm = gmArr && glyphIndex >= 0 && glyphIndex < gmArr.length ? gmArr[glyphIndex] : null

  if (spacing === 'proportional') {
    if (gm?.dwidth && gm.dwidth[0] > 0) return gm.dwidth[0]
    if (gm?.bbx && gm.bbx[0] > 0) return gm.bbx[0]
  }
  return gw
}

export function setGlyphAdvance(font: FontInstance, glyphIndex: number, advance: number) {
  const gmArr = font.glyphMeta.value
  const len = glyphCount(font)
  const meta: (GlyphMeta | null)[] = gmArr ? [...gmArr] : new Array(len).fill(null)
  const existing = meta[glyphIndex]
  meta[glyphIndex] = existing ? { ...existing, dwidth: [advance, 0] } : { dwidth: [advance, 0] }
  font.glyphMeta.value = meta
  font.dirty.value = true
}

/**
 * Set a pixel during a paint stroke.  Mutates the existing Uint8Array in
 * place (no allocation) and bumps paintVersion to trigger re-renders in
 * the glyph editor.  The fontData signal is NOT updated here  —  that
 * happens in commitPaintStroke which creates the new array reference
 * needed for undo snapshots and downstream subscribers (tiles, preview).
 */
export function setPixel(font: FontInstance, glyphIndex: number, x: number, y: number, on: boolean) {
  const bpr = bytesPerRow(font)
  const bpg = bytesPerGlyph(font)
  const data = font.fontData.value
  const rowOffset = glyphIndex * bpg + y * bpr
  if (on) setBit(data, rowOffset, x)
  else clearBit(data, rowOffset, x)
  font.paintVersion.value++
}

/** True when the font's pixels no longer match its saved snapshot. */
export function isDirty(font: FontInstance): boolean {
  const a = font.fontData.value
  const b = font.savedSnapshot.value
  if (a.length !== b.length) return true
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return true
  }
  return false
}

export function markDirty(font: FontInstance) {
  font.dirty.value = isDirty(font)
}

export function saveFont(font: FontInstance): Uint8Array {
  const snapshot = new Uint8Array(font.fontData.value)
  font.savedSnapshot.value = snapshot
  font.dirty.value = false
  return snapshot
}

/** Resize all glyphs in a font to new dimensions. */
export function resizeFont(
  font: FontInstance,
  newW: number, newH: number,
  anchorX: 'left' | 'center' | 'right',
  anchorY: 'top' | 'center' | 'bottom',
) {
  const oldW = font.glyphWidth.value
  const oldH = font.glyphHeight.value
  if (newW === oldW && newH === oldH) return

  const oldBpr = calcBpr(oldW)
  const oldBpg = oldH * oldBpr
  const newBpr = calcBpr(newW)
  const newBpg = newH * newBpr
  const count = glyphCount(font)
  const src = font.fontData.value
  const dst = new Uint8Array(count * newBpg)

  // Compute pixel offsets based on anchor
  const dx = anchorX === 'left' ? 0 : anchorX === 'right' ? newW - oldW : Math.floor((newW - oldW) / 2)
  const dy = anchorY === 'top' ? 0 : anchorY === 'bottom' ? newH - oldH : Math.floor((newH - oldH) / 2)

  for (let g = 0; g < count; g++) {
    const srcOff = g * oldBpg
    const dstOff = g * newBpg
    const srcBytes = src.slice(srcOff, srcOff + oldBpg)
    const dstBytes = new Uint8Array(newBpg)

    for (let y = 0; y < oldH; y++) {
      const ny = y + dy
      if (ny < 0 || ny >= newH) continue
      for (let x = 0; x < oldW; x++) {
        const nx = x + dx
        if (nx < 0 || nx >= newW) continue
        if (getBit(srcBytes, y * oldBpr, x)) {
          setBit(dstBytes, ny * newBpr, nx)
        }
      }
    }
    dst.set(dstBytes, dstOff)
  }

  // Adjust baseline by the same vertical offset as the pixels
  const prevW = oldW
  const prevH = oldH
  const prevBaseline = font.baseline.value
  const prevData = new Uint8Array(src)
  const newBaseline = Math.max(0, Math.min(newH - 1, font.baseline.value + dy))

  const prevRotationLive = new Map(font.glyphRotationLive)
  font.glyphRotationLive.clear()

  font.baseline.value = newBaseline
  font.glyphWidth.value = newW
  font.glyphHeight.value = newH
  font.fontData.value = dst
  font.dirty.value = true
  font.undoHistory.push({
    name: 'Resize',
    execute() {
      font.glyphWidth.value = newW
      font.glyphHeight.value = newH
      font.baseline.value = newBaseline
      font.fontData.value = dst.slice()
      font.glyphRotationLive.clear()
      markDirty(font)
    },
    undo() {
      font.glyphWidth.value = prevW
      font.glyphHeight.value = prevH
      font.baseline.value = prevBaseline
      font.fontData.value = prevData.slice()
      font.glyphRotationLive.clear()
      for (const [k, v] of prevRotationLive) font.glyphRotationLive.set(k, v)
      markDirty(font)
    },
  })
}

/** Extract a plain FontConversionData snapshot from a FontInstance. */
export function fontToConversionData(font: FontInstance): FontConversionData {
  const fontData = new Uint8Array(font.fontData.value)
  const w = font.glyphWidth.value
  const h = font.glyphHeight.value
  const bpr = calcBpr(w)
  const bpg = h * bpr
  return {
    fontData,
    glyphWidth: w,
    glyphHeight: h,
    startChar: font.startChar.value,
    glyphCount: bpg > 0 ? Math.floor(fontData.length / bpg) : 0,
    baseline: font.baseline.value,
    meta: font.meta.value,
    encodings: font.encodings.value,
    glyphMeta: font.glyphMeta.value,
    populated: font.populatedGlyphs.value,
    fontName: font.fontName.value || baseName(font.fileName.value),
    spacingMode: font.spacing.value,
    // This font's codepage, so formats that record one (CPI) write the right number
    detectedCharset: font.charset.value,
    useCalcMissing: false,
    ascender: font.ascender.value >= 0 ? font.ascender.value : undefined,
    descender: font.descender.value >= 0 ? font.descender.value : undefined,
    tracking: font.tracking.value,
  }
}
