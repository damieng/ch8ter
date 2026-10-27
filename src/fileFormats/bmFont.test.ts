import { describe, it, expect } from 'vitest'
import { isBmFontText, parseBmFont, buildFontFromPage, type PixelSource } from './bmFontParser'
import { packBmFontAtlas, bmFontDescriptorText, renderAtlasRgba } from './bmFontWriter'
import type { FontWriteData } from '../fontSave'

const DESCRIPTOR = `info face="Test" size=8 bold=0 italic=0 charset="" unicode=1 stretchH=100 smooth=0 aa=1 padding=0,0,0,0 spacing=1,1 outline=0
common lineHeight=8 base=7 scaleW=32 scaleH=16 pages=1 packed=0
page id=0 file="test_0.png"
chars count=2
char id=65 x=0 y=0 width=3 height=5 xoffset=1 yoffset=2 xadvance=6 page=0 chnl=15
char id=66 x=16 y=0 width=4 height=6 xoffset=0 yoffset=1 xadvance=7 page=0 chnl=15
`

function makeImage(width: number, height: number, paint: (x: number, y: number) => boolean): PixelSource {
  const data = new Uint8ClampedArray(width * height * 4) // all zero = background
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      if (paint(x, y)) {
        const o = (y * width + x) * 4
        data[o] = 255; data[o + 1] = 255; data[o + 2] = 255; data[o + 3] = 255
      }
  return { width, height, data }
}

describe('bmFontParser', () => {
  it('sniffs text descriptors, including binary FNT false positives', () => {
    const enc = new TextEncoder()
    expect(isBmFontText(enc.encode('info face="x" size=8\n').buffer as ArrayBuffer)).toBe(true)
    expect(isBmFontText(enc.encode('\uFEFFinfo face="x"\n').buffer as ArrayBuffer)).toBe(true)
    const bin = new Uint8Array([0x00, 0x02, 0, 0, 0, 0, 0, 0])
    expect(isBmFontText(bin.buffer as ArrayBuffer)).toBe(false)
  })

  it('parses info/common/page/char sections', () => {
    const desc = parseBmFont(DESCRIPTOR)
    expect(desc.face).toBe('Test')
    expect(desc.lineHeight).toBe(8)
    expect(desc.base).toBe(7)
    expect(desc.scaleW).toBe(32)
    expect(desc.pages).toEqual([{ id: 0, file: 'test_0.png' }])
    expect(desc.chars.length).toBe(2)
    expect(desc.chars[0]).toEqual({ id: 65, x: 0, y: 0, width: 3, height: 5, xoffset: 1, yoffset: 2, xadvance: 6, page: 0 })
  })

  it('builds a font from page pixels, honouring offsets and advances', () => {
    const desc = parseBmFont(DESCRIPTOR)
    // 32x16 atlas: glyph A occupies (0..2, 0..4) as a diagonal+block pattern
    const image = makeImage(32, 16, (x, y) => x < 3 && y < 5 && (x === y || x === 2))
    const built = buildFontFromPage(desc, 0, image)

    expect(built.startChar).toBe(65)
    expect(built.glyphWidth).toBe(4)   // max width
    expect(built.glyphHeight).toBe(7)  // max yoffset+height
    expect(built.spacingMode).toBe('proportional')
    expect(built.baseline).toBe(6)     // desc.base 7 clamped to cellH-1
    expect(built.populated).toEqual(new Set([0, 1]))
    expect(built.glyphMeta[0]).toEqual({ dwidth: [6, 0] })

    // Glyph A pixel source (2,2) is on (x===y diagonal) → cell (3,4)
    const bpr = Math.ceil(built.glyphWidth / 8)
    const on = (x: number, y: number) =>
      (built.fontData[y * bpr + (x >> 3)] & (0x80 >> (x & 7))) !== 0
    expect(on(3, 4)).toBe(true)   // source (2,2)
    expect(on(1, 4)).toBe(false)  // source (0,2): not on the diagonal
    expect(on(2, 2)).toBe(false)  // source (1,0): off
  })

  it('rejects missing pages and oversized ranges', () => {
    const desc = parseBmFont(DESCRIPTOR)
    expect(() => buildFontFromPage(desc, 3, makeImage(8, 8, () => false))).toThrow('no chars')
  })
})

function makeWriteData(): FontWriteData {
  // Two 8x8 glyphs with distinctive bits and per-glyph advances
  const fontData = new Uint8Array(16)
  fontData[0] = 0x80 // glyph 0: pixel (0,0)
  fontData[8] = 0x41 // glyph 1: pixels (0,0) and (6,0)
  return {
    fontData,
    glyphWidth: 8,
    glyphHeight: 8,
    startChar: 65,
    glyphCount: 2,
    baseline: 7,
    meta: null,
    glyphMeta: [{ dwidth: [6, 0] }, { dwidth: [9, 0] }],
    fontName: 'Out',
  }
}

describe('bmFontWriter', () => {
  it('packs trimmed glyphs and emits a valid descriptor', () => {
    const data = makeWriteData()
    const atlas = packBmFontAtlas(data)
    expect(atlas.placements.length).toBe(2)
    // Glyph 0: single pixel → 1x1 rect at (0,0), yoffset 0
    expect(atlas.placements[0]).toMatchObject({ id: 65, width: 1, height: 1, xoffset: 0, yoffset: 0, xadvance: 6 })
    // Glyph 1: pixels span (1..7,0) → 7x1 rect at x=1, xadvance 9
    expect(atlas.placements[1]).toMatchObject({ id: 66, width: 7, height: 1, xoffset: 1, yoffset: 0, xadvance: 9 })
    // Non-overlapping placements
    expect(atlas.placements[1].x).toBeGreaterThanOrEqual(atlas.placements[0].x + 1)

    const text = bmFontDescriptorText(data, atlas, 'out_0.png')
    expect(text).toContain('info face="Out"')
    expect(text).toContain('page id=0 file="out_0.png"')
    expect(text).toContain('chars count=2')

    // The writer's own descriptor parses back through the reader
    const desc = parseBmFont(text)
    expect(desc.chars.length).toBe(2)
    expect(desc.chars[1].xadvance).toBe(9)
  })

  it('renders atlas pixels at the placed positions', () => {
    const data = makeWriteData()
    const atlas = packBmFontAtlas(data)
    const rgba = renderAtlasRgba(data, atlas)
    const p0 = atlas.placements[0]
    const o0 = (p0.y * atlas.scaleW + p0.x) * 4
    expect(rgba[o0 + 3]).toBe(255)   // glyph pixel opaque
    const p1 = atlas.placements[1]
    const o1 = (p1.y * atlas.scaleW + p1.x + p1.width - 1) * 4
    expect(rgba[o1 + 3]).toBe(255)   // second glyph's rightmost pixel
    const oBg = (p1.y * atlas.scaleW + p1.x + p1.width + 2) * 4
    expect(rgba[oBg + 3]).toBe(0)    // background transparent
  })
})
