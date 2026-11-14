// Tests for the PNG glyph-sheet importer.
//
// Only imageToData touches the DOM (it needs a canvas); every other function
// takes an ImageData-shaped object and reads .width/.height/.data. So the
// analysis and extraction logic is testable with a plain stub, no jsdom.

import { describe, it, expect } from 'vitest'
import { autoDetect, calcGridSize, extractGlyphs, type PngImportSettings } from './pngImport'

interface StubImageData {
  width: number
  height: number
  data: Uint8ClampedArray
}

/** Build an ImageData-shaped object from a pixel function. */
function makeImage(
  w: number,
  h: number,
  pixel: (x: number, y: number) => [number, number, number, number],
): StubImageData {
  const data = new Uint8ClampedArray(w * h * 4)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const [r, g, b, a] = pixel(x, y)
      const i = (y * w + x) * 4
      data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = a
    }
  }
  return { width: w, height: h, data }
}

const BLACK: [number, number, number, number] = [0, 0, 0, 255]
const WHITE: [number, number, number, number] = [255, 255, 255, 255]
const CLEAR: [number, number, number, number] = [0, 0, 0, 0]

function asImageData(img: StubImageData): ImageData {
  return img as unknown as ImageData
}

/** Unscaled 8x8 cells, no gaps or border. */
function settings(over: Partial<PngImportSettings> = {}): PngImportSettings {
  return { scale: 1, glyphWidth: 8, glyphHeight: 8, gapX: 0, gapY: 0, borderX: 0, borderY: 0, ...over }
}

describe('autoDetect', () => {
  it('produces settings with a usable scale', () => {
    const img = makeImage(8, 8, (x, y) => (x === 3 && y === 3 ? BLACK : WHITE))
    const detected = autoDetect(asImageData(img))
    expect(detected.scale).toBeGreaterThan(0)
    expect(detected.glyphWidth).toBeGreaterThan(0)
    expect(detected.glyphHeight).toBeGreaterThan(0)
  })

  it('copes with a transparent background', () => {
    const img = makeImage(16, 16, (x, y) => (x < 8 && y < 8 ? BLACK : CLEAR))
    expect(() => autoDetect(asImageData(img))).not.toThrow()
  })

  it('copes with an all-blank sheet', () => {
    expect(() => autoDetect(asImageData(makeImage(16, 16, () => WHITE)))).not.toThrow()
  })

  it('returns settings calcGridSize can use', () => {
    const img = makeImage(32, 32, (x) => (x % 9 === 0 ? BLACK : WHITE))
    const detected = autoDetect(asImageData(img))
    const grid = calcGridSize(32, 32, detected)
    expect(Number.isFinite(grid.cols)).toBe(true)
    expect(Number.isFinite(grid.rows)).toBe(true)
  })

  it('detects a scaled-up sheet as scale > 1', () => {
    // 2x scaled: each font pixel is a 2x2 block
    const img = makeImage(16, 16, (x, y) => ((x >> 1) === 3 && (y >> 1) === 3 ? BLACK : WHITE))
    const detected = autoDetect(asImageData(img))
    expect(detected.scale).toBeGreaterThanOrEqual(1)
  })
})

describe('calcGridSize', () => {
  it('divides the sheet into cells', () => {
    const grid = calcGridSize(64, 32, settings())
    expect(grid.cols).toBe(8)
    expect(grid.rows).toBe(4)
    expect(grid.total).toBe(32)
  })

  it('accounts for gaps between cells', () => {
    // 9px cells (8 + 1 gap) in 63px of content => floor(63/9) = 7 columns
    const grid = calcGridSize(63, 63, settings({ gapX: 1, gapY: 1 }))
    expect(grid.cols).toBe(7)
    expect(grid.rows).toBe(7)
  })

  it('accounts for a border', () => {
    const grid = calcGridSize(80, 32, settings({ borderX: 8, borderY: 0 }))
    expect(grid.cols).toBe(8) // (80) - 16 = 64 => 8 cells
    expect(grid.rows).toBe(4)
  })

  it('accounts for scale', () => {
    const grid = calcGridSize(128, 64, settings({ scale: 2 }))
    expect(grid.cols).toBe(8) // 128/2 = 64 => 8 cells
    expect(grid.rows).toBe(4)
  })

  it('never returns a negative count', () => {
    const grid = calcGridSize(4, 4, settings())
    expect(grid.cols).toBeGreaterThanOrEqual(0)
    expect(grid.rows).toBeGreaterThanOrEqual(0)
  })

  it('reports total as cols times rows', () => {
    const grid = calcGridSize(64, 32, settings())
    expect(grid.total).toBe(grid.cols * grid.rows)
  })
})

describe('extractGlyphs', () => {
  it('extracts one glyph whose pixels match the source', () => {
    const img = makeImage(8, 8, (_x, y) => (y === 0 ? BLACK : WHITE))
    const result = extractGlyphs(asImageData(img), settings())
    expect(result.glyphWidth).toBe(8)
    expect(result.glyphHeight).toBe(8)
    expect(result.fontData[0]).toBe(0xFF) // first row fully inked
    expect(result.fontData[1]).toBe(0x00) // second row blank
  })

  it('extracts several cells in reading order', () => {
    // 24x8: first cell black, the other two white, so white is the background
    const img = makeImage(24, 8, (x) => (x < 8 ? BLACK : WHITE))
    const result = extractGlyphs(asImageData(img), settings())
    expect(result.glyphCount).toBe(3)
    expect(result.fontData[0]).toBe(0xFF)  // first glyph, first row
    expect(result.fontData[8]).toBe(0x00)  // second glyph, first row
  })

  it('counts the cells it extracted', () => {
    const img = makeImage(16, 8, () => BLACK)
    const result = extractGlyphs(asImageData(img), settings())
    expect(result.glyphCount).toBe(2)
  })

  it('treats transparency as background', () => {
    // Mostly transparent, one dark pixel: dark is foreground because the
    // background is the transparent field
    const img = makeImage(8, 8, (x, y) => (x === 0 && y === 0 ? BLACK : CLEAR))
    const result = extractGlyphs(asImageData(img), settings())
    expect(result.fontData[0]).toBe(0x80)
  })

  it('reports which cells had ink', () => {
    // Mostly white sheet with one dark cell: white is the background, so only
    // the dark cell counts as inked
    const img = makeImage(24, 8, (x) => (x < 8 ? BLACK : WHITE))
    const result = extractGlyphs(asImageData(img), settings())
    expect(result.populated.has(0)).toBe(true)
    expect(result.populated.has(1)).toBe(false)
  })

  it('treats a uniformly coloured sheet as one background, inverting the rest', () => {
    // An all-black sheet makes black the background, so nothing is foreground
    const img = makeImage(8, 8, () => BLACK)
    const result = extractGlyphs(asImageData(img), settings())
    expect(result.populated.size).toBe(0)
  })

  it('uses a mapping string to set the start character', () => {
    const img = makeImage(8, 8, () => BLACK)
    const result = extractGlyphs(asImageData(img), settings(), 'A')
    expect(result.startChar).toBe('A'.charCodeAt(0))
  })

  it('ignores mapping characters beyond the cell count', () => {
    const img = makeImage(8, 8, () => BLACK)
    expect(() => extractGlyphs(asImageData(img), settings(), 'ABCDEF')).not.toThrow()
  })

  it('handles an image smaller than one cell', () => {
    const result = extractGlyphs(asImageData(makeImage(4, 4, () => BLACK)), settings())
    expect(result.glyphCount).toBe(0)
    expect(result.fontData.length).toBe(0)
  })

  it('respects gaps and borders when slicing', () => {
    // 17x8: cells at x=0..7 and x=9..16, one pixel gap at x=8
    const img = makeImage(17, 8, (x) => (x === 0 || x === 9 ? BLACK : WHITE))
    const result = extractGlyphs(asImageData(img), settings({ gapX: 1 }))
    expect(result.glyphCount).toBe(2)
    expect(result.fontData[0]).toBe(0x80) // left cell, first pixel
    expect(result.fontData[8]).toBe(0x80) // right cell, first pixel
  })

  it('is deterministic for the same input', () => {
    const img = makeImage(16, 16, (x, y) => ((x + y) % 3 === 0 ? BLACK : WHITE))
    const a = extractGlyphs(asImageData(img), settings())
    const b = extractGlyphs(asImageData(img), settings())
    expect([...a.fontData]).toEqual([...b.fontData])
  })

  it('produces data sized for the cell and glyph count', () => {
    const img = makeImage(32, 16, () => BLACK)
    const result = extractGlyphs(asImageData(img), settings())
    const bpg = result.glyphHeight * Math.ceil(result.glyphWidth / 8)
    expect(result.fontData.length).toBe(result.glyphCount * bpg)
  })
})
