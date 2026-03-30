import { describe, it, expect } from 'vitest'
import { bpr, setBit } from './bitUtils'
import {
  calcBaseline,
  calcAscender,
  calcCapHeight,
  calcXHeight,
  calcNumericHeight,
  calcDescender,
  calcAllMetrics,
  getCharMetrics,
  Metric,
} from './charMetrics'

/**
 * Build font data with specific glyphs populated.
 * `glyphs` maps character code to an array of row indices that have pixels set.
 * Width is always 8, so 1 byte per row.
 */
function buildFont(
  w: number,
  h: number,
  startChar: number,
  glyphCount: number,
  glyphs: Record<number, number[]>,
): Uint8Array {
  const rowBytes = bpr(w)
  const bpg = h * rowBytes
  const data = new Uint8Array(glyphCount * bpg)
  for (const [charCodeStr, rows] of Object.entries(glyphs)) {
    const charCode = Number(charCodeStr)
    const idx = charCode - startChar
    if (idx < 0 || idx >= glyphCount) continue
    for (const y of rows) {
      // Set the first pixel in the row so the row counts as non-empty
      setBit(data, idx * bpg + y * rowBytes, 0)
    }
  }
  return data
}

// ---- getCharMetrics ----

describe('getCharMetrics', () => {
  it('returns CapHeight + Baseline for uppercase letters', () => {
    const flags = getCharMetrics('H'.charCodeAt(0))
    expect(flags & Metric.CapHeight).toBeTruthy()
    expect(flags & Metric.Baseline).toBeTruthy()
  })

  it('returns XHeight + Baseline for lowercase x', () => {
    const flags = getCharMetrics('x'.charCodeAt(0))
    expect(flags & Metric.XHeight).toBeTruthy()
    expect(flags & Metric.Baseline).toBeTruthy()
  })

  it('returns Descender for g', () => {
    const flags = getCharMetrics('g'.charCodeAt(0))
    expect(flags & Metric.Descender).toBeTruthy()
  })

  it('returns Ascender for b', () => {
    const flags = getCharMetrics('b'.charCodeAt(0))
    expect(flags & Metric.Ascender).toBeTruthy()
  })

  it('returns NumHeight for digits', () => {
    const flags = getCharMetrics('0'.charCodeAt(0))
    expect(flags & Metric.NumHeight).toBeTruthy()
  })

  it('returns 0 for unmapped codepoints', () => {
    expect(getCharMetrics(0x1F600)).toBe(0) // emoji
  })
})

// ---- calcBaseline ----

describe('calcBaseline', () => {
  it('detects baseline from bottom row of baseline chars', () => {
    // 8x16 font, startChar 32. 'H' = code 72, index 40.
    // 'H' pixels occupy rows 2-12 (bottom of H at row 12)
    const h = 16
    const data = buildFont(8, h, 32, 96, {
      72: [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], // H
      73: [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], // I
      120: [5, 6, 7, 8, 9, 10, 11, 12],           // x
    })
    // Baseline = bottom of BASELINE_CHARS ('HIEFLTixz') + 1
    // 'H' and 'I' bottom at row 12, 'x' bottom at row 12 → baseline = 13
    expect(calcBaseline(data, 32, 8, h)).toBe(13)
  })

  it('returns h-1 when no baseline chars found', () => {
    // Empty font — no glyphs populated
    const data = new Uint8Array(96 * 16) // 96 glyphs, 8x16
    expect(calcBaseline(data, 32, 8, 16)).toBe(15)
  })
})

// ---- calcAscender ----

describe('calcAscender', () => {
  it('measures pixels above baseline for ascender chars', () => {
    // 'b' = code 98, index 66 from startChar 32. Pixels at rows 2-12.
    // With baseline 13, ascender = 13 - 2 = 11
    const data = buildFont(8, 16, 32, 96, {
      98:  [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],  // b
      100: [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],  // d
      104: [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],  // h
    })
    expect(calcAscender(data, 32, 8, 16, 13)).toBe(11)
  })

  it('returns -1 when no ascender chars found', () => {
    const data = new Uint8Array(96 * 16)
    expect(calcAscender(data, 32, 8, 16, 13)).toBe(-1)
  })
})

// ---- calcCapHeight ----

describe('calcCapHeight', () => {
  it('measures cap height from uppercase letters', () => {
    // 'H' = 72, 'I' = 73. Top row at 3, baseline 13. Cap height = 13 - 3 = 10
    const data = buildFont(8, 16, 32, 96, {
      72: [3, 4, 5, 6, 7, 8, 9, 10, 11, 12], // H
      73: [3, 4, 5, 6, 7, 8, 9, 10, 11, 12], // I
    })
    expect(calcCapHeight(data, 32, 8, 16, 13)).toBe(10)
  })

  it('returns -1 when no cap height chars found', () => {
    const data = new Uint8Array(96 * 16)
    expect(calcCapHeight(data, 32, 8, 16, 13)).toBe(-1)
  })
})

// ---- calcXHeight ----

describe('calcXHeight', () => {
  it('measures x-height from lowercase letters', () => {
    // 'x' = 120, index 88. Top row at 6, baseline 13. x-height = 13 - 6 = 7
    const data = buildFont(8, 16, 32, 96, {
      120: [6, 7, 8, 9, 10, 11, 12], // x
      122: [6, 7, 8, 9, 10, 11, 12], // z
    })
    expect(calcXHeight(data, 32, 8, 16, 13)).toBe(7)
  })
})

// ---- calcNumericHeight ----

describe('calcNumericHeight', () => {
  it('measures numeric height from digits', () => {
    // '0' = 48, index 16. Top row at 3, baseline 13. Numeric height = 10
    const data = buildFont(8, 16, 32, 96, {
      48: [3, 4, 5, 6, 7, 8, 9, 10, 11, 12], // 0
      49: [3, 4, 5, 6, 7, 8, 9, 10, 11, 12], // 1
    })
    expect(calcNumericHeight(data, 32, 8, 16, 13)).toBe(10)
  })
})

// ---- calcDescender ----

describe('calcDescender', () => {
  it('measures pixels below baseline for descender chars', () => {
    // 'g' = 103, index 71. Pixels rows 6-14, baseline 13.
    // Descender = (14 + 1) - 13 = 2
    const data = buildFont(8, 16, 32, 96, {
      103: [6, 7, 8, 9, 10, 11, 12, 13, 14], // g
    })
    expect(calcDescender(data, 32, 8, 16, 13)).toBe(2)
  })

  it('returns -1 when no descender chars found', () => {
    const data = new Uint8Array(96 * 16)
    expect(calcDescender(data, 32, 8, 16, 13)).toBe(-1)
  })
})

// ---- calcAllMetrics ----

describe('calcAllMetrics', () => {
  it('computes all metrics together', () => {
    // Build a realistic 8x16 font with several characters
    const data = buildFont(8, 16, 32, 96, {
      72:  [3, 4, 5, 6, 7, 8, 9, 10, 11, 12],             // H (cap height)
      73:  [3, 4, 5, 6, 7, 8, 9, 10, 11, 12],             // I (cap height)
      120: [6, 7, 8, 9, 10, 11, 12],                       // x (x-height)
      98:  [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],          // b (ascender)
      100: [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],          // d (ascender)
      103: [6, 7, 8, 9, 10, 11, 12, 13, 14],              // g (descender)
      48:  [3, 4, 5, 6, 7, 8, 9, 10, 11, 12],             // 0 (numeric)
    })

    const m = calcAllMetrics(data, 32, 8, 16)

    // Baseline: bottom of H/I/x = row 12, so baseline = 13
    expect(m.baseline).toBe(13)
    // Ascender: top of b/d = row 2, ascender = 13 - 2 = 11
    expect(m.ascender).toBe(11)
    // Cap height: top of H/I = row 3, cap = 13 - 3 = 10
    expect(m.capHeight).toBe(10)
    // X-height: top of x = row 6, xHeight = 13 - 6 = 7
    expect(m.xHeight).toBe(7)
    // Numeric height: top of 0 = row 3, numHeight = 13 - 3 = 10
    expect(m.numericHeight).toBe(10)
    // Descender: bottom of g = row 14, desc = (14+1) - 13 = 2
    expect(m.descender).toBe(2)
  })

  it('handles an empty font gracefully', () => {
    const data = new Uint8Array(96 * 16)
    const m = calcAllMetrics(data, 32, 8, 16)
    expect(m.baseline).toBe(15)
    expect(m.ascender).toBe(-1)
    expect(m.capHeight).toBe(-1)
    expect(m.xHeight).toBe(-1)
    expect(m.numericHeight).toBe(-1)
    expect(m.descender).toBe(-1)
  })

  it('works with wider glyphs (12px)', () => {
    const data = buildFont(12, 16, 32, 96, {
      72:  [3, 4, 5, 6, 7, 8, 9, 10, 11, 12], // H
      120: [6, 7, 8, 9, 10, 11, 12],           // x
    })
    const m = calcAllMetrics(data, 32, 12, 16)
    expect(m.baseline).toBe(13)
    expect(m.capHeight).toBe(10)
    expect(m.xHeight).toBe(7)
  })
})
