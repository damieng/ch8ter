// Parse real fonts that exercise each EBDT image format.
//
// Skia ships four fonts built specifically to cover the monochrome embedded
// bitmap formats (BSD-3-Clause, from google/skia resources/fonts):
//   ebdt_fmt1.ttf  format 1: byte-aligned, per-glyph metrics
//   ebdt_fmt2.ttf  format 2: bit-aligned,  per-glyph metrics
//   ebdt_fmt6.ttf  format 6: byte-aligned, strike metrics only
//   ebdt_fmt7.ttf  format 7: bit-aligned,  strike metrics only
// plus ebdt_glyf.ttf, which carries outlines as well as bitmaps.
//
// Each holds three sparse codepoints (space, U+2662, U+1F600) at 16, 64 and
// 128 ppem. That sparse range is why the parser's dense codepoint-indexed
// buffer needs a size cap: spread over U+0020..U+1F600 it asks for hundreds of
// megabytes at 128 ppem, which used to exhaust the heap.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parseSbit, isSbitFont } from './sbitParser'

const DIR = resolve(__dirname, '../testFixtures/ttf')

function load(name: string): ArrayBuffer {
  const b = readFileSync(resolve(DIR, name))
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer
}

const FORMATS = [
  ['ebdt_fmt1.ttf', 1],
  ['ebdt_fmt2.ttf', 2],
  ['ebdt_fmt6.ttf', 6],
  ['ebdt_fmt7.ttf', 7],
] as const

describe.each(FORMATS)('%s (EBDT format %i)', (name) => {
  it('is recognised as an sbit font', () => {
    expect(isSbitFont(load(name))).toBe(true)
  })

  it('parses without exhausting memory', () => {
    // Before the strike-size cap this test exhausted the heap on the 128 ppem
    // strike, because the cmap spans U+0020..U+1F600 with only 3 glyphs in it
    expect(() => parseSbit(load(name))).not.toThrow()
  })

  it('reports the strikes it can represent', () => {
    const result = parseSbit(load(name))
    expect(result.strikes.length).toBeGreaterThan(0)
    for (const s of result.strikes) {
      expect(s.glyphWidth).toBeGreaterThan(0)
      expect(s.glyphHeight).toBeGreaterThan(0)
      expect(s.fontData.length).toBeGreaterThan(0)
    }
  })

  it('keeps strike sizes ascending by ppem', () => {
    const strikes = parseSbit(load(name)).strikes
    for (let i = 1; i < strikes.length; i++) {
      expect(strikes[i].ppemY).toBeGreaterThanOrEqual(strikes[i - 1].ppemY)
    }
  })

  it('decodes glyph ink at the smallest strike', () => {
    const smallest = parseSbit(load(name)).strikes[0]
    const inked = [...smallest.fontData].filter(b => b !== 0).length
    expect(inked).toBeGreaterThan(0)
  })

  it('populates only the characters the cmap maps', () => {
    // space, U+2662 and U+1F600 - not every slot in between
    const smallest = parseSbit(load(name)).strikes[0]
    expect(smallest.populated.size).toBeGreaterThan(0)
    expect(smallest.populated.size).toBeLessThan(10)
  })
})

describe('ebdt_glyf.ttf (bitmaps alongside outlines)', () => {
  it('is recognised and parses', () => {
    const buf = load('ebdt_glyf.ttf')
    expect(isSbitFont(buf)).toBe(true)
    expect(() => parseSbit(buf)).not.toThrow()
  })

  it('still finds the bitmap strikes despite having a glyf table', () => {
    const result = parseSbit(load('ebdt_glyf.ttf'))
    expect(result.strikes.length).toBeGreaterThan(0)
    expect(result.strikes[0].populated.size).toBeGreaterThan(0)
  })
})

describe('strike-size cap', () => {
  it('skips a strike whose buffer would be implausibly large', () => {
    // These fonts have a 128 ppem strike spanning a sparse 128k-codepoint
    // range; it must be skipped rather than allocated (243 MB previously)
    const strikes = parseSbit(load('ebdt_fmt1.ttf')).strikes
    expect(strikes.every(s => s.fontData.length <= 64 * 1024 * 1024)).toBe(true)
  })

  it('still returns the smaller strikes from the same font', () => {
    const strikes = parseSbit(load('ebdt_fmt1.ttf')).strikes
    expect(strikes.length).toBeGreaterThanOrEqual(1)
    expect(strikes.some(s => s.ppemY <= 64)).toBe(true)
  })
})

describe('computed layout of a sparse codepoint range', () => {
  it('starts at the lowest codepoint that actually has a bitmap', () => {
    // The cmap maps U+0020, U+2662 and U+1F600, but only U+2662 onward carry
    // bitmaps, so the buffer starts there rather than at the space
    const strike = parseSbit(load('ebdt_fmt1.ttf')).strikes[0]
    expect(strike.startChar).toBe(0x2662)
  })

  it('puts the first mapped glyph at offset 0 and later ones after it', () => {
    const strike = parseSbit(load('ebdt_fmt1.ttf')).strikes[0]
    expect(strike.populated.has(0)).toBe(true)
    // U+1F600 is 128512, i.e. 128512 - 9826 slots along
    expect(strike.populated.has(0x1F600 - 0x2662)).toBe(true)
  })
})
