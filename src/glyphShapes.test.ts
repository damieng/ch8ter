import { describe, it, expect } from 'vitest'
import { linePixels, rectPixels, ellipsePixels, floodFill } from './glyphShapes'
import { createFont, getPixel } from './store'

describe('linePixels', () => {
  it('draws a horizontal, vertical and diagonal line inclusive of both ends', () => {
    expect([...linePixels(0, 0, 3, 0)]).toEqual(['0,0', '1,0', '2,0', '3,0'])
    expect([...linePixels(2, 1, 2, 4)]).toEqual(['2,1', '2,2', '2,3', '2,4'])
    const diag = linePixels(0, 0, 3, 3)
    expect(diag.has('0,0')).toBe(true)
    expect(diag.has('3,3')).toBe(true)
    expect(diag.size).toBe(4) // perfect 45° diagonal touches every step
  })

  it('reverses direction cleanly', () => {
    expect(linePixels(3, 0, 0, 0).has('0,0')).toBe(true)
    expect(linePixels(3, 0, 0, 0).size).toBe(4)
  })
})

describe('rectPixels', () => {
  it('outlines the box without interior', () => {
    const pts = rectPixels(0, 0, 3, 2, false)
    expect(pts.size).toBe((4 * 3) - (2 * 1)) // perimeter only
    expect(pts.has('0,0')).toBe(true)
    expect(pts.has('3,2')).toBe(true)
    expect(pts.has('1,1')).toBe(false)
  })

  it('fills the box when asked', () => {
    expect(rectPixels(0, 0, 2, 2, true).size).toBe(9)
  })
})

describe('ellipsePixels', () => {
  it('produces a symmetric outline for an odd-sized ellipse', () => {
    const pts = ellipsePixels(0, 0, 6, 6, false)
    // center row/col extremes present
    expect(pts.has('0,3')).toBe(true)
    expect(pts.has('6,3')).toBe(true)
    expect(pts.has('3,0')).toBe(true)
    expect(pts.has('3,6')).toBe(true)
    // interior is empty
    expect(pts.has('3,3')).toBe(false)
  })

  it('fills the interior when asked', () => {
    const pts = ellipsePixels(0, 0, 6, 6, true)
    expect(pts.has('3,3')).toBe(true)
    // everything inside the bounding box that is inside the ellipse
    let insideCount = 0
    for (let y = 0; y <= 6; y++)
      for (let x = 0; x <= 6; x++) {
        const dx = (x + 0.5 - 3.5) / 3.5, dy = (y + 0.5 - 3.5) / 3.5
        if (dx * dx + dy * dy <= 1) insideCount++
      }
    expect(pts.size).toBe(insideCount)
  })

  it('degenerates to a line for a one-pixel-wide box', () => {
    const pts = ellipsePixels(2, 0, 2, 3, false)
    expect(pts.size).toBe(4)
    expect(pts.has('2,0')).toBe(true)
    expect(pts.has('2,3')).toBe(true)
  })
})

describe('floodFill', () => {
  it('fills the connected region without leaking across walls', () => {
    // 5x5: a complete wall of set pixels splitting the glyph in half
    const font = createFont(new Uint8Array(5), 'test', 0, 5, 5)
    const set = (x: number, y: number) => { font.fontData.value[y + (x >> 3)] |= 0x80 >> (x & 7) }
    for (let y = 0; y < 5; y++) set(2, y)

    floodFill(font, 0, 0, 0, true)

    // left region (cols 0-1, rows 0-3) filled; right region untouched;
    // the wall itself was already set so it stays set
    expect(getPixel(font, 0, 0, 0)).toBe(true)
    expect(getPixel(font, 0, 1, 3)).toBe(true)
    expect(getPixel(font, 0, 3, 0)).toBe(false)
    expect(getPixel(font, 0, 4, 4)).toBe(false)
    expect(getPixel(font, 0, 2, 0)).toBe(true)
  })

  it('does nothing when the target already matches', () => {
    const font = createFont(new Uint8Array(4), 'test', 0, 2, 2)
    floodFill(font, 0, 0, 0, false)
    expect(font.fontData.value.every(b => b === 0)).toBe(true)
  })
})
