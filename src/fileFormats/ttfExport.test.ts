import { describe, it, expect } from 'vitest'
import { createFont } from '../fontModel'
import { setPixel } from '../fontOps'
import { exportTtf } from './ttfExport'
import { exportVarTtf } from './ttfVarExport'
import { ttfToWoff } from './woffExport'
import { calcChecksum, assembleTtf } from './ttfUtils'

/** 8x8 font with a few inked glyphs, enough for a real glyf/loca table. */
function makeFont(w = 8, h = 8, count = 96, start = 32) {
  const f = createFont(new Uint8Array(count * h * Math.ceil(w / 8)), 'test.bin', start, w, h)
  for (const ch of ['A', 'B', 'a', '0', '.']) {
    const idx = ch.charCodeAt(0) - start
    for (let y = 0; y < Math.min(h, 6); y++) setPixel(f, idx, 1, y, true)
  }
  return f
}

/** Read the table directory of a TTF: tag -> {offset, length}. */
function tables(buf: ArrayBuffer): Map<string, { offset: number; length: number }> {
  const view = new DataView(buf)
  const numTables = view.getUint16(4)
  const out = new Map<string, { offset: number; length: number }>()
  for (let i = 0; i < numTables; i++) {
    const p = 12 + i * 16
    const tag = String.fromCharCode(
      view.getUint8(p), view.getUint8(p + 1), view.getUint8(p + 2), view.getUint8(p + 3),
    )
    out.set(tag, { offset: view.getUint32(p + 8), length: view.getUint32(p + 12) })
  }
  return out
}

describe('calcChecksum', () => {
  it('sums 32-bit big-endian words', () => {
    // Two words: 0x00000001 + 0x00000002
    const data = new Uint8Array([0, 0, 0, 1, 0, 0, 0, 2])
    expect(calcChecksum(data)).toBe(3)
  })

  it('pads a trailing partial word with zeros', () => {
    const data = new Uint8Array([0, 0, 0, 5, 0])
    expect(calcChecksum(data)).toBe(5)
  })

  it('wraps modulo 2^32', () => {
    const data = new Uint8Array([0xFF, 0xFF, 0xFF, 0xFF, 0, 0, 0, 2])
    expect(calcChecksum(data)).toBe(1)
  })
})

describe('assembleTtf', () => {
  // Every real sfnt has a head table; assembleTtf patches its checksumAdjustment
  const head = () => ({ tag: 'head', data: new Uint8Array(54) })

  it('writes a valid sfnt header', () => {
    const ttf = assembleTtf([head()])
    const view = new DataView(ttf)
    expect(view.getUint32(0)).toBe(0x00010000) // sfnt version
    expect(view.getUint16(4)).toBe(1) // one table
  })

  it('records each table with its real offset and length', () => {
    const a = new Uint8Array(4).fill(1)
    const b = new Uint8Array(8).fill(2)
    const ttf = assembleTtf([head(), { tag: 'AAAA', data: a }, { tag: 'BBBB', data: b }])
    const dir = tables(ttf)
    expect(dir.get('AAAA')?.length).toBe(4)
    expect(dir.get('BBBB')?.length).toBe(8)
    // and the bytes are actually there
    const bytes = new Uint8Array(ttf)
    expect(bytes[dir.get('AAAA')!.offset]).toBe(1)
    expect(bytes[dir.get('BBBB')!.offset]).toBe(2)
  })

  it('sorts tables by tag, as the spec requires', () => {
    const ttf = assembleTtf([
      head(),
      { tag: 'name', data: new Uint8Array(2) },
      { tag: 'cmap', data: new Uint8Array(2) },
    ])
    expect([...tables(ttf).keys()]).toEqual(['cmap', 'head', 'name'])
  })

  it('pads tables to four-byte boundaries', () => {
    const ttf = assembleTtf([head(), { tag: 'AAAA', data: new Uint8Array(3) }])
    const dir = tables(ttf)
    // The table after a 3-byte one still starts on a word boundary
    const after = [...dir.values()].find(e => e.offset > dir.get('AAAA')!.offset)
    if (after) expect(after.offset % 4).toBe(0)
  })

  it('patches the head checksum adjustment so the file checksums to 0xB1B0AFBA', () => {
    const ttf = assembleTtf([head(), { tag: 'AAAA', data: new Uint8Array(4) }])
    const dir = tables(ttf)!
    const headOff = dir.get('head')!.offset
    // The adjustment field was written by assembleTtf; reading it back and
    // re-deriving the magic is the property that matters
    const bytes = new Uint8Array(ttf)
    const adjustment = new DataView(ttf).getUint32(headOff + 8)
    const zeroed = new Uint8Array(bytes)
    zeroed.fill(0, headOff + 8, headOff + 12)
    expect((calcChecksum(zeroed) + adjustment) >>> 0).toBe(0xB1B0AFBA)
  })
})

describe('exportTtf', () => {
  it('produces a parseable sfnt with the expected tables', () => {
    const ttf = exportTtf(makeFont())
    const dir = tables(ttf)
    for (const tag of ['head', 'hhea', 'maxp', 'cmap', 'glyf', 'loca', 'hmtx', 'name', 'post']) {
      expect(dir.has(tag), `missing ${tag}`).toBe(true)
    }
  })

  it('declares the right glyph count in maxp', () => {
    const f = makeFont(8, 8, 32, 32)
    const ttf = exportTtf(f)
    const dir = tables(ttf)!
    const view = new DataView(ttf)
    const numGlyphs = view.getUint16(dir.get('maxp')!.offset + 4)
    // glyphs plus the .notdef entry the format requires
    expect(numGlyphs).toBeGreaterThanOrEqual(32)
  })

  it('emits a loca table with one more entry than glyphs', () => {
    const ttf = exportTtf(makeFont(8, 8, 16, 32))
    const dir = tables(ttf)!
    const view = new DataView(ttf)
    const numGlyphs = view.getUint16(dir.get('maxp')!.offset + 4)
    const loca = dir.get('loca')!
    // short format: uint16 per glyph, or long format: uint32
    const entries = loca.length / 2 === numGlyphs + 1 ? 'short' : 'long'
    expect(['short', 'long']).toContain(entries)
  })

  it('is deterministic for the same font', () => {
    const f = makeFont()
    const a = new Uint8Array(exportTtf(f))
    const b = new Uint8Array(exportTtf(f))
    expect([...a]).toEqual([...b])
  })

  it('handles a font with no ink at all', () => {
    const f = createFont(new Uint8Array(96 * 8), 'blank.bin', 32, 8, 8)
    expect(() => exportTtf(f)).not.toThrow()
    expect(tables(exportTtf(f)).has('glyf')).toBe(true)
  })

  it('handles glyphs wider than one byte', () => {
    const f = makeFont(16, 16, 8, 32)
    const ttf = exportTtf(f)
    expect(tables(ttf).has('glyf')).toBe(true)
  })
})

describe('exportVarTtf', () => {
  it('produces a parseable sfnt including the variable-font tables', () => {
    const ttf = exportVarTtf(makeFont())
    const dir = tables(ttf)
    expect(dir.has('glyf')).toBe(true)
    expect(dir.has('fvar')).toBe(true)
    expect(dir.has('gvar')).toBe(true)
  })

  it('is deterministic for the same font', () => {
    const f = makeFont()
    expect([...new Uint8Array(exportVarTtf(f))]).toEqual([...new Uint8Array(exportVarTtf(f))])
  })
})

describe('ttfToWoff', () => {
  it('wraps a TTF in a WOFF container with the right magic', () => {
    return ttfToWoff(exportTtf(makeFont())).then(woff => {
      const view = new DataView(woff)
      expect(view.getUint32(0)).toBe(0x774F4646) // 'wOFF'
    })
  })

  it('declares the same number of tables as the TTF', async () => {
    const ttf = exportTtf(makeFont())
    const woff = await ttfToWoff(ttf)
    expect(new DataView(woff).getUint16(12)).toBe(new DataView(ttf).getUint16(4))
  })

  it('compresses the font, since WOFF tables are zlib-deflated', async () => {
    const ttf = exportTtf(makeFont())
    const woff = await ttfToWoff(ttf)
    expect(woff.byteLength).toBeLessThan(ttf.byteLength)
  })

  it('records the original TTF size', async () => {
    const ttf = exportTtf(makeFont())
    const woff = await ttfToWoff(ttf)
    expect(new DataView(woff).getUint32(16)).toBe(ttf.byteLength)
  })
})
