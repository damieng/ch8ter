// Font variant generators — create new fonts derived from an existing one.

import { getBit, setBit, bpr as calcBpr } from './bitUtils'
import { shearGlyphBytes } from './glyphTransforms'
import { isFixedWidth } from './unicodeRanges'
import { cpToUnicode } from './charsets'
import {
  type FontInstance, openFont, glyphCount, bytesPerRow, bytesPerGlyph,
} from './store'
import type { GlyphMeta } from './fileFormats/bdfParser'

function getPixelBit(bytes: Uint8Array, bpr: number, x: number, y: number): boolean {
  return getBit(bytes, y * bpr, x)
}

function setPixelBit(bytes: Uint8Array, bpr: number, x: number, y: number) {
  setBit(bytes, y * bpr, x)
}

// Create bold variant — OR each pixel with its right neighbour
export function createBoldVariant(font: FontInstance) {
  const src = font.fontData.value
  const w = font.glyphWidth.value
  const h = font.glyphHeight.value
  const bpr = bytesPerRow(font)
  const bpg = bytesPerGlyph(font)
  const count = glyphCount(font)
  const bold = new Uint8Array(src.length)
  for (let g = 0; g < count; g++) {
    const offset = g * bpg
    const bytes = src.slice(offset, offset + bpg)
    let rightUsed = false, leftFree = true
    for (let y = 0; y < h; y++) {
      if (getPixelBit(bytes, bpr, w - 1, y)) rightUsed = true
      if (getPixelBit(bytes, bpr, 0, y)) leftFree = false
    }
    const glyphBold = new Uint8Array(bpg)
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        let srcX = x
        if (rightUsed && leftFree) srcX = x + 1
        const on = (srcX < w && getPixelBit(bytes, bpr, srcX, y)) ||
                   (srcX > 0 && srcX - 1 < w && getPixelBit(bytes, bpr, srcX - 1, y))
        if (on) setPixelBit(glyphBold, bpr, x, y)
      }
    bold.set(glyphBold, offset)
  }
  const name = font.fileName.value.replace(/(\.\w+)$/, '-bold$1')
  openFont(bold, name, font.startChar.value, w, h, { charset: font.charset.value })
}

// Outline variant — set pixels become the border of the original shape
export function createOutlineVariant(font: FontInstance) {
  const src = font.fontData.value
  const w = font.glyphWidth.value
  const h = font.glyphHeight.value
  const bpr = bytesPerRow(font)
  const bpg = bytesPerGlyph(font)
  const count = glyphCount(font)
  const outline = new Uint8Array(src.length)
  for (let g = 0; g < count; g++) {
    const offset = g * bpg
    const bytes = src.slice(offset, offset + bpg)
    const glyphOut = new Uint8Array(bpg)
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const orig = getPixelBit(bytes, bpr, x, y)
        if (orig) continue // outline = only border pixels
        // Check if any neighbour is set
        const hasNeighbour =
          (x > 0 && getPixelBit(bytes, bpr, x - 1, y)) ||
          (x < w - 1 && getPixelBit(bytes, bpr, x + 1, y)) ||
          (y > 0 && getPixelBit(bytes, bpr, x, y - 1)) ||
          (y < h - 1 && getPixelBit(bytes, bpr, x, y + 1))
        if (hasNeighbour) setPixelBit(glyphOut, bpr, x, y)
      }
    outline.set(glyphOut, offset)
  }
  const name = font.fileName.value.replace(/(\.\w+)$/, '-outline$1')
  openFont(outline, name, font.startChar.value, w, h, { charset: font.charset.value })
}

export function createObliqueVariant(font: FontInstance, angleDegrees: number) {
  const src = font.fontData.value
  const w = font.glyphWidth.value
  const h = font.glyphHeight.value
  const bpg = bytesPerGlyph(font)
  const count = glyphCount(font)
  const oblique = new Uint8Array(src.length)
  for (let g = 0; g < count; g++) {
    const offset = g * bpg
    const bytes = src.slice(offset, offset + bpg)
    oblique.set(shearGlyphBytes(bytes, angleDegrees, w, h), offset)
  }
  const name = font.fileName.value.replace(/(\.\w+)$/, '-oblique$1')
  openFont(oblique, name, font.startChar.value, w, h, { charset: font.charset.value })
}

// Proportional variant — shift each non-fixed-width glyph left to the pixel edge,
// set advance = tight pixel width + 1px gap. Fixed-width glyphs keep full cell advance.
export function createProportionalVariant(font: FontInstance) {
  const src = font.fontData.value
  const w = font.glyphWidth.value
  const h = font.glyphHeight.value
  const bpr = bytesPerRow(font)
  const bpg = bytesPerGlyph(font)
  const count = glyphCount(font)
  const start = font.startChar.value
  const out = new Uint8Array(src.length)
  const meta: (GlyphMeta | null)[] = []

  for (let g = 0; g < count; g++) {
    const offset = g * bpg
    const bytes = src.slice(offset, offset + bpg)
    // isFixedWidth tests Unicode codepoints; the glyph slot is a byte offset
    // into the font's codepage, so map it through that codepage first
    const charCode = start + g
    const unicode = cpToUnicode(charCode, font.charset.value)

    if (isFixedWidth(unicode.codePointAt(0)!)) {
      out.set(bytes, offset)
      meta.push({ dwidth: [w, 0] })
      continue
    }

    // Find pixel bounds
    let left = w, right = -1
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++)
        if (getPixelBit(bytes, bpr, x, y)) {
          if (x < left) left = x
          if (x > right) right = x
        }

    if (right < 0) {
      // Empty glyph (space etc.) — use half cell width
      out.set(bytes, offset)
      meta.push({ dwidth: [Math.max(1, Math.round(w / 2)), 0] })
      continue
    }

    // Shift pixels left to column 0
    const shifted = new Uint8Array(bpg)
    for (let y = 0; y < h; y++)
      for (let x = left; x < w; x++)
        if (getPixelBit(bytes, bpr, x, y))
          setPixelBit(shifted, bpr, x - left, y)
    out.set(shifted, offset)

    // Advance = tight width + 1px gap
    meta.push({ dwidth: [right - left + 2, 0] })
  }

  const name = font.fileName.value.replace(/(\.\w+)$/, '-proportional$1')
  openFont(out, name, start, w, h, { glyphMeta: meta, spacing: 'proportional', charset: font.charset.value })
}

// Monospace variant — places each glyph's pixels into a fixed-width cell using the chosen anchor.
export function createMonospaceVariant(
  font: FontInstance,
  newW: number,
  anchorX: 'left' | 'center' | 'right',
) {
  const src = font.fontData.value
  const w = font.glyphWidth.value
  const h = font.glyphHeight.value
  const bpr = calcBpr(w)
  const bpg = h * bpr
  const newBpr = calcBpr(newW)
  const newBpg = h * newBpr
  const count = glyphCount(font)
  const start = font.startChar.value
  const out = new Uint8Array(count * newBpg)

  for (let g = 0; g < count; g++) {
    const srcOff = g * bpg
    const bytes = src.slice(srcOff, srcOff + bpg)
    const dstBytes = new Uint8Array(newBpg)

    // Find tight pixel bounds
    let left = w, right = -1
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++)
        if (getPixelBit(bytes, bpr, x, y)) {
          if (x < left) left = x
          if (x > right) right = x
        }

    if (right < 0) {
      // Empty glyph — leave blank
      out.set(dstBytes, g * newBpg)
      continue
    }

    const pixW = right - left + 1
    const dx = anchorX === 'left' ? 0
      : anchorX === 'right' ? newW - pixW
      : Math.floor((newW - pixW) / 2)

    for (let y = 0; y < h; y++)
      for (let x = left; x <= right; x++) {
        const nx = x - left + dx
        if (getPixelBit(bytes, bpr, x, y) && nx >= 0 && nx < newW)
          setPixelBit(dstBytes, newBpr, nx, y)
      }

    out.set(dstBytes, g * newBpg)
  }

  const name = font.fileName.value.replace(/(\.\w+)$/, '-monospace$1')
  openFont(out, name, start, newW, h, { spacing: 'monospace', charset: font.charset.value })
}
