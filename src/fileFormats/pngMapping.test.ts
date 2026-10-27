import { describe, it, expect } from 'vitest'
import { extractGlyphs, type PngImportSettings } from './pngImport'

/** Build a plain-object ImageData stand-in: black pixels where paint(x,y), white elsewhere. */
function makeImage(width: number, height: number, paint: (x: number, y: number) => boolean): ImageData {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4
      if (paint(x, y)) {
        data[o] = 0; data[o + 1] = 0; data[o + 2] = 0; data[o + 3] = 255
      } else {
        data[o] = 255; data[o + 1] = 255; data[o + 2] = 255; data[o + 3] = 255
      }
    }
  }
  return { width, height, data } as unknown as ImageData
}

const settings: PngImportSettings = {
  scale: 1, glyphWidth: 8, glyphHeight: 8, gapX: 0, gapY: 0, borderX: 0, borderY: 0,
}

// 2x2 grid of 8x8 cells: cell 1 (top-right) blank, others have a pixel at (0,0)
const gridImage = () => makeImage(16, 16, (x, y) => x % 8 === 0 && y % 8 === 0 && !(x >= 8 && y < 8))

describe('extractGlyphs with text mapping', () => {
  it('maps cells to the given characters instead of sequential codes', () => {
    // mapping 'A b': cell 0 → 'A' (65, on), cell 1 → ' ' (32, blank),
    // cell 2 → 'b' (98, on), cell 3 dropped
    const result = extractGlyphs(gridImage(), settings, 'A b')

    expect(result.startChar).toBe(32)
    expect(result.glyphCount).toBe(98 - 32 + 1)
    expect(result.populated.has(65 - 32)).toBe(true)
    expect(result.populated.has(0)).toBe(false)
    expect(result.populated.has(98 - 32)).toBe(true)
    expect(result.populated.size).toBe(2)
  })

  it('ignores cells beyond the mapping text', () => {
    const result = extractGlyphs(gridImage(), settings, 'Q')
    expect(result.glyphCount).toBe(1)
    expect(result.startChar).toBe(81) // 'Q'
    expect(result.populated.has(0)).toBe(true)
  })

  it('without mapping, falls back to sequential layout with space detection', () => {
    const result = extractGlyphs(gridImage(), settings)
    expect(result.glyphCount).toBe(4)
    expect(result.startChar).toBe(31) // first blank cell (index 1) maps to space
    expect(result.populated.size).toBe(3)
  })
})
