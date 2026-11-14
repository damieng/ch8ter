import { describe, it, expect } from 'vitest'
import { drawGlyphToCtx } from './drawGlyph'
import { setBit, bpr } from './bitUtils'

/** Records the rectangles a glyph draw would produce. */
function recorder() {
  const rects: { x: number; y: number; w: number; h: number }[] = []
  const ctx = {
    fillStyle: '',
    fillRect(x: number, y: number, w: number, h: number) {
      rects.push({ x, y, w, h })
    },
  } as unknown as CanvasRenderingContext2D
  return { ctx, rects }
}

/** One 8x8 glyph made from a row of booleans. */
function glyph(rows: boolean[][]): Uint8Array {
  const w = rows[0].length
  const h = rows.length
  const data = new Uint8Array(h * bpr(w))
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) if (rows[y][x]) setBit(data, y * bpr(w), x)
  }
  return data
}

describe('drawGlyphToCtx', () => {
  it('draws nothing for an entirely blank glyph', () => {
    const { ctx, rects } = recorder()
    drawGlyphToCtx(ctx, new Uint8Array(8), 0, 8, 8, 1, 0, 0, 1, 1)
    expect(rects).toEqual([])
  })

  it('draws one rectangle per set pixel', () => {
    const { ctx, rects } = recorder()
    const data = glyph([
      [false, false, false, false, false, false, false, false],
      [false, true, false, false, false, false, false, false],
      [false, false, false, false, false, false, true, false],
      [false, false, false, false, false, false, false, false],
      [false, false, false, false, false, false, false, false],
      [false, false, false, false, false, false, false, false],
      [false, false, false, false, false, false, false, false],
      [false, false, false, false, false, false, false, false],
    ])
    drawGlyphToCtx(ctx, data, 0, 8, 8, 1, 0, 0, 1, 1)
    expect(rects).toEqual([
      { x: 1, y: 1, w: 1, h: 1 },
      { x: 6, y: 2, w: 1, h: 1 },
    ])
  })

  it('applies the scale to both the step and the rectangle size', () => {
    const { ctx, rects } = recorder()
    const data = glyph([
      [true, false],
      [false, true],
    ])
    drawGlyphToCtx(ctx, data, 0, 2, 2, 1, 0, 0, 3, 4)
    expect(rects).toEqual([
      { x: 0, y: 0, w: 3, h: 4 },
      { x: 3, y: 4, w: 3, h: 4 },
    ])
  })

  it('honours the origin offset', () => {
    const { ctx, rects } = recorder()
    drawGlyphToCtx(ctx, glyph([[true]]), 0, 1, 1, 1, 10, 20, 2, 2)
    expect(rects).toEqual([{ x: 10, y: 20, w: 2, h: 2 }])
  })

  it('reads from the glyph offset, not the start of the buffer', () => {
    // Two 8x8 glyphs; only the second has ink
    const data = new Uint8Array(16)
    setBit(data, 8, 0) // second glyph, first pixel
    const { ctx, rects } = recorder()
    drawGlyphToCtx(ctx, data, 8, 8, 8, 1, 0, 0, 1, 1)
    expect(rects).toEqual([{ x: 0, y: 0, w: 1, h: 1 }])
  })

  it('handles widths wider than one byte', () => {
    const w = 12
    const data = new Uint8Array(bpr(w))
    setBit(data, 0, 9) // column 9 of row 0
    const { ctx, rects } = recorder()
    drawGlyphToCtx(ctx, data, 0, w, 1, bpr(w), 0, 0, 1, 1)
    expect(rects).toEqual([{ x: 9, y: 0, w: 1, h: 1 }])
  })

  it('does not touch fillStyle', () => {
    const { ctx } = recorder()
    ;(ctx as { fillStyle: string }).fillStyle = '#123456'
    drawGlyphToCtx(ctx, glyph([[true]]), 0, 1, 1, 1, 0, 0, 1, 1)
    expect((ctx as { fillStyle: string }).fillStyle).toBe('#123456')
  })
})
