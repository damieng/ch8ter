import { describe, it, expect } from 'vitest'
import { getBit, setBit, bpr } from './bitUtils'
import {
  flipXBytes, flipYBytes, invertBytes,
  rotateCWBytes, rotateCCWBytes,
  shiftUp, shiftDown, shiftLeft, shiftRight,
  centerHorizontalBytes, shearGlyphBytes,
} from './glyphTransforms'

/** Helper: create glyph bytes from an array of pixel strings ('.' = off, '#' = on). */
function makeGlyph(w: number, rows: string[]): Uint8Array {
  const h = rows.length
  const bytesPerRow = bpr(w)
  const data = new Uint8Array(h * bytesPerRow)
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (rows[y][x] === '#') setBit(data, y * bytesPerRow, x)
  return data
}

/** Helper: convert glyph bytes back to pixel strings for easy assertions. */
function glyphToStrings(data: Uint8Array, w: number, h: number): string[] {
  const bytesPerRow = bpr(w)
  const rows: string[] = []
  for (let y = 0; y < h; y++) {
    let row = ''
    for (let x = 0; x < w; x++)
      row += getBit(data, y * bytesPerRow, x) ? '#' : '.'
    rows.push(row)
  }
  return rows
}

describe('flipXBytes', () => {
  it('mirrors horizontally', () => {
    const input = makeGlyph(4, [
      '#...',
      '##..',
      '###.',
      '####',
    ])
    expect(glyphToStrings(flipXBytes(input, 4, 4), 4, 4)).toEqual([
      '...#',
      '..##',
      '.###',
      '####',
    ])
  })

  it('is its own inverse', () => {
    const input = makeGlyph(8, ['#.#.#.#.', '..##..##'])
    const flipped = flipXBytes(input, 8, 2)
    expect(glyphToStrings(flipXBytes(flipped, 8, 2), 8, 2))
      .toEqual(glyphToStrings(input, 8, 2))
  })
})

describe('flipYBytes', () => {
  it('mirrors vertically', () => {
    const input = makeGlyph(4, [
      '####',
      '....',
      '....',
      '#..#',
    ])
    expect(glyphToStrings(flipYBytes(input, 4, 4), 4, 4)).toEqual([
      '#..#',
      '....',
      '....',
      '####',
    ])
  })

  it('is its own inverse', () => {
    const input = makeGlyph(4, ['#...', '..#.', '.#..', '...#'])
    const flipped = flipYBytes(input, 4, 4)
    expect(glyphToStrings(flipYBytes(flipped, 4, 4), 4, 4))
      .toEqual(glyphToStrings(input, 4, 4))
  })
})

describe('invertBytes', () => {
  it('toggles all pixels', () => {
    const input = makeGlyph(4, [
      '#...',
      '....',
    ])
    expect(glyphToStrings(invertBytes(input, 4, 2), 4, 2)).toEqual([
      '.###',
      '####',
    ])
  })

  it('is its own inverse', () => {
    const input = makeGlyph(8, ['#.#.#.#.'])
    expect(glyphToStrings(invertBytes(invertBytes(input, 8, 1), 8, 1), 8, 1))
      .toEqual(glyphToStrings(input, 8, 1))
  })
})

describe('shiftUp', () => {
  it('shifts rows up with wrap', () => {
    const input = makeGlyph(4, [
      '####',
      '....',
      '....',
      '#..#',
    ])
    expect(glyphToStrings(shiftUp(input, 4, 4), 4, 4)).toEqual([
      '....',
      '....',
      '#..#',
      '####',
    ])
  })
})

describe('shiftDown', () => {
  it('shifts rows down with wrap', () => {
    const input = makeGlyph(4, [
      '####',
      '....',
      '....',
      '#..#',
    ])
    expect(glyphToStrings(shiftDown(input, 4, 4), 4, 4)).toEqual([
      '#..#',
      '####',
      '....',
      '....',
    ])
  })

  it('is inverse of shiftUp', () => {
    const input = makeGlyph(4, ['#...', '.#..', '..#.', '...#'])
    expect(glyphToStrings(shiftDown(shiftUp(input, 4, 4), 4, 4), 4, 4))
      .toEqual(glyphToStrings(input, 4, 4))
  })
})

describe('shiftLeft', () => {
  it('shifts pixels left with wrap', () => {
    const input = makeGlyph(4, [
      '.#..',
      '..#.',
    ])
    expect(glyphToStrings(shiftLeft(input, 4, 2), 4, 2)).toEqual([
      '#...',
      '.#..',
    ])
  })
})

describe('shiftRight', () => {
  it('shifts pixels right with wrap', () => {
    const input = makeGlyph(4, [
      '.#..',
      '..#.',
    ])
    expect(glyphToStrings(shiftRight(input, 4, 2), 4, 2)).toEqual([
      '..#.',
      '...#',
    ])
  })

  it('wraps rightmost pixel to left', () => {
    const input = makeGlyph(4, ['...#'])
    expect(glyphToStrings(shiftRight(input, 4, 1), 4, 1)).toEqual(['#...'])
  })

  it('is inverse of shiftLeft', () => {
    const input = makeGlyph(8, ['#.#.#.#.', '..##..##'])
    expect(glyphToStrings(shiftRight(shiftLeft(input, 8, 2), 8, 2), 8, 2))
      .toEqual(glyphToStrings(input, 8, 2))
  })
})

describe('rotateCWBytes', () => {
  it('rotates a square glyph 90 degrees clockwise', () => {
    const input = makeGlyph(3, [
      '#..',
      '.#.',
      '..#',
    ])
    const r = rotateCWBytes(input, 3, 3)
    expect(r.w).toBe(3)
    expect(r.h).toBe(3)
    expect(glyphToStrings(r.data, 3, 3)).toEqual([
      '..#',
      '.#.',
      '#..',
    ])
  })

  it('four CW rotations return to original (square)', () => {
    const input = makeGlyph(4, [
      '##..',
      '#...',
      '....',
      '....',
    ])
    let r = rotateCWBytes(input, 4, 4)
    for (let i = 1; i < 4; i++) r = rotateCWBytes(r.data, r.w, r.h)
    expect(glyphToStrings(r.data, 4, 4)).toEqual(glyphToStrings(input, 4, 4))
  })

  it('transposes dimensions for non-square glyphs (8x4 -> 4x8)', () => {
    const input = makeGlyph(8, [
      '#.......',
      '.#......',
      '..#.....',
      '...#....',
    ])
    const r = rotateCWBytes(input, 8, 4)
    expect(r.w).toBe(4)
    expect(r.h).toBe(8)
    // CW rotation: (x,y) -> (h-1-y, x) where h=4
    // (0,0) -> (3,0), (1,1) -> (2,1), (2,2) -> (1,2), (3,3) -> (0,3)
    expect(glyphToStrings(r.data, 4, 8)).toEqual([
      '...#',
      '..#.',
      '.#..',
      '#...',
      '....',
      '....',
      '....',
      '....',
    ])
  })

  it('preserves all pixels for non-square glyph', () => {
    const input = makeGlyph(8, [
      '########',
      '........',
      '........',
      '........',
    ])
    const r = rotateCWBytes(input, 8, 4)
    // Top row becomes left column: (x,0) -> (3, x) for x=0..7
    // Output is 4 wide, 8 tall
    expect(glyphToStrings(r.data, 4, 8)).toEqual([
      '...#',
      '...#',
      '...#',
      '...#',
      '...#',
      '...#',
      '...#',
      '...#',
    ])
  })
})

describe('rotateCCWBytes', () => {
  it('is inverse of rotateCW (square)', () => {
    const input = makeGlyph(4, [
      '##..',
      '#...',
      '.#..',
      '...#',
    ])
    const cw = rotateCWBytes(input, 4, 4)
    const ccw = rotateCCWBytes(cw.data, cw.w, cw.h)
    expect(glyphToStrings(ccw.data, 4, 4))
      .toEqual(glyphToStrings(input, 4, 4))
  })

  it('is inverse of rotateCW (non-square)', () => {
    const input = makeGlyph(8, [
      '#.......',
      '.#......',
      '..#.....',
      '...#....',
    ])
    const cw = rotateCWBytes(input, 8, 4)
    expect(cw.w).toBe(4)
    expect(cw.h).toBe(8)
    const ccw = rotateCCWBytes(cw.data, cw.w, cw.h)
    expect(ccw.w).toBe(8)
    expect(ccw.h).toBe(4)
    expect(glyphToStrings(ccw.data, 8, 4))
      .toEqual(glyphToStrings(input, 8, 4))
  })
})

describe('centerHorizontalBytes', () => {
  it('centers a left-aligned glyph', () => {
    const input = makeGlyph(8, [
      '#.......',
      '##......',
    ])
    const result = glyphToStrings(centerHorizontalBytes(input, 8, 2), 8, 2)
    // Content is 2px wide, 6px blank total, should center with ceil(6/2)=3 left blank
    expect(result).toEqual([
      '...#....',
      '...##...',
    ])
  })

  it('returns copy when already centered', () => {
    const input = makeGlyph(4, [
      '.##.',
    ])
    expect(glyphToStrings(centerHorizontalBytes(input, 4, 1), 4, 1))
      .toEqual(['.##.'])
  })

  it('returns empty for blank glyph', () => {
    const input = makeGlyph(4, ['....', '....'])
    const result = centerHorizontalBytes(input, 4, 2)
    expect(glyphToStrings(result, 4, 2)).toEqual(['....', '....'])
  })
})

describe('shearGlyphBytes', () => {
  it('returns empty for empty glyph', () => {
    const input = makeGlyph(8, ['........', '........'])
    const result = shearGlyphBytes(input, 12, 8, 2)
    expect(glyphToStrings(result, 8, 2)).toEqual(['........', '........'])
  })

  it('zero angle preserves all pixels', () => {
    const input = makeGlyph(8, [
      '..##....',
      '.####...',
      '..##....',
    ])
    const result = shearGlyphBytes(input, 0, 8, 3)
    expect(glyphToStrings(result, 8, 3)).toEqual(glyphToStrings(input, 8, 3))
  })
})
