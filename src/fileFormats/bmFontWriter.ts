// Write AngelCode BMFont descriptors (text .fnt) plus a packed atlas layout.
//
// The caller renders the atlas pixels (e.g. onto a canvas) using the
// placements returned here, encodes the PNG, and pairs it with the
// descriptor text this module generates.

import type { FontWriteData } from '../fontSave'
import { bpr, getBit } from '../bitUtils'

export interface GlyphPlacement {
  id: number          // unicode codepoint
  x: number
  y: number
  width: number
  height: number
  xoffset: number
  yoffset: number
  xadvance: number
}

export interface BmFontAtlas {
  scaleW: number
  scaleH: number
  placements: GlyphPlacement[]
  lineHeight: number
  base: number
  face: string
}

/** Tight pixel bounds of a glyph (all-zero for empty glyphs). */
function glyphRect(data: Uint8Array, idx: number, w: number, h: number): { x: number; y: number; w: number; h: number } {
  const rowBytes = bpr(w)
  const bpg = h * rowBytes
  const base = idx * bpg
  let minX = w, maxX = -1, minY = h, maxY = -1
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (getBit(data, base + y * rowBytes, x)) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }
  if (maxX < 0) return { x: 0, y: 0, w: 0, h: 0 }
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 }
}

const nextPow2 = (n: number): number => {
  let p = 1
  while (p < n) p <<= 1
  return p
}

/**
 * Shelf-pack trimmed glyphs into a single atlas.
 * Advance widths come from per-glyph dwidth when present, else the cell width.
 */
export function packBmFontAtlas(data: FontWriteData, maxAtlasSize = 4096): BmFontAtlas {
  const { fontData, glyphWidth, glyphHeight, startChar, glyphCount, glyphMeta, baseline, fontName } = data

  interface Item { id: number; rect: { x: number; y: number; w: number; h: number }; yoffset: number; xadvance: number }
  const items: Item[] = []
  let totalArea = 0

  for (let i = 0; i < glyphCount; i++) {
    const rect = glyphRect(fontData, i, glyphWidth, glyphHeight)
    const xadvance = glyphMeta?.[i]?.dwidth?.[0] ?? glyphWidth
    if (rect.w > 0) {
      items.push({ id: startChar + i, rect, yoffset: rect.y, xadvance })
      totalArea += rect.w * rect.h
    } else {
      // Blank glyph (e.g. space): keep the advance with a zero-size rect
      items.push({ id: startChar + i, rect: { x: 0, y: 0, w: 0, h: 0 }, yoffset: 0, xadvance })
    }
  }

  // Estimate an atlas width from the total glyph area, then shelf-pack
  let scaleW = Math.min(maxAtlasSize, nextPow2(Math.ceil(Math.sqrt(totalArea || 1)) + 8))
  const lineHeight = glyphHeight
  const placements: GlyphPlacement[] = []

  for (;;) {
    placements.length = 0
    let x = 0, y = 0, rowH = 0
    let overflow = false
    for (const item of items) {
      if (item.rect.w === 0) {
        placements.push({ id: item.id, x: 0, y: 0, width: 0, height: 0, xoffset: 0, yoffset: 0, xadvance: item.xadvance })
        continue
      }
      if (x + item.rect.w > scaleW) {
        y += rowH
        x = 0
        rowH = 0
      }
      if (y + item.rect.h > maxAtlasSize) { overflow = true; break }
      placements.push({
        id: item.id,
        x, y,
        width: item.rect.w,
        height: item.rect.h,
        xoffset: item.rect.x,
        yoffset: item.rect.y,
        xadvance: item.xadvance,
      })
      x += item.rect.w
      rowH = Math.max(rowH, item.rect.h)
    }
    if (!overflow) {
      const scaleH = Math.max(1, nextPow2(y + rowH))
      return {
        scaleW,
        scaleH,
        placements,
        lineHeight,
        base: Math.max(0, Math.min(lineHeight - 1, baseline)),
        face: (fontName || 'Font').replace(/"/g, ''),
      }
    }
    if (scaleW >= maxAtlasSize) {
      throw new Error('BMFont atlas exceeds maximum size')
    }
    scaleW = Math.min(maxAtlasSize, scaleW * 2)
  }
}

/** Generate the BMFont text descriptor for a single-page atlas. */
export function bmFontDescriptorText(data: FontWriteData, atlas: BmFontAtlas, pageFile: string): string {
  const face = atlas.face
  const size = data.meta?.pointSize ?? data.glyphHeight
  const lines: string[] = []
  lines.push(`info face="${face}" size=${size} bold=0 italic=0 charset="" unicode=1 stretchH=100 smooth=0 aa=1 padding=0,0,0,0 spacing=1,1 outline=0`)
  lines.push(`common lineHeight=${atlas.lineHeight} base=${atlas.base} scaleW=${atlas.scaleW} scaleH=${atlas.scaleH} pages=1 packed=0 alphaChnl=0 redChnl=0 greenChnl=0 blueChnl=0`)
  lines.push(`page id=0 file="${pageFile}"`)
  lines.push(`chars count=${atlas.placements.length}`)
  for (const p of atlas.placements) {
    lines.push(`char id=${p.id} x=${p.x} y=${p.y} width=${p.width} height=${p.height} xoffset=${p.xoffset} yoffset=${p.yoffset} xadvance=${p.xadvance} page=0 chnl=15`)
  }
  return lines.join('\n') + '\n'
}

/** Read one placement's pixels into an RGBA atlas buffer (white glyphs, transparent background). */
export function renderAtlasRgba(data: FontWriteData, atlas: BmFontAtlas): Uint8ClampedArray {
  const { fontData, glyphWidth, glyphHeight, startChar } = data
  const rgba = new Uint8ClampedArray(atlas.scaleW * atlas.scaleH * 4)
  const rowBytes = bpr(glyphWidth)
  const bpg = glyphHeight * rowBytes

  for (const p of atlas.placements) {
    if (p.width === 0) continue
    const idx = p.id - startChar
    if (idx < 0) continue
    for (let y = 0; y < p.height; y++) {
      for (let x = 0; x < p.width; x++) {
        if (!getBit(fontData, idx * bpg + (p.yoffset + y) * rowBytes, p.xoffset + x)) continue
        const o = ((p.y + y) * atlas.scaleW + (p.x + x)) * 4
        rgba[o] = 255
        rgba[o + 1] = 255
        rgba[o + 2] = 255
        rgba[o + 3] = 255
      }
    }
  }
  return rgba
}
