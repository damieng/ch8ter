import { describe, it, expect } from 'vitest'
import { parsePsf } from './psfParser'

/** Build a PSF2 file: header, `count` glyphs of `bytesPerGlyph` bytes, optional unicode table. */
function psf2(opts: {
  width: number; height: number; count: number; bytesPerGlyph: number; table?: number[]
}): ArrayBuffer {
  const bitmapLen = opts.count * opts.bytesPerGlyph
  const table = opts.table ?? []
  const buf = new ArrayBuffer(32 + bitmapLen + table.length)
  const v = new DataView(buf)
  v.setUint32(0, 0x864AB572, true)
  v.setUint32(4, 0, true)
  v.setUint32(8, 32, true)
  v.setUint32(12, table.length > 0 ? 1 : 0, true)
  v.setUint32(16, opts.count, true)
  v.setUint32(20, opts.bytesPerGlyph, true)
  v.setUint32(24, opts.height, true)
  v.setUint32(28, opts.width, true)
  new Uint8Array(buf).set(table, 32 + bitmapLen)
  return buf
}

describe('parsePsf2 header validation', () => {
  it('accepts a consistent header', () => {
    const r = parsePsf(psf2({ width: 9, height: 16, count: 2, bytesPerGlyph: 32 }))
    expect(r.glyphWidth).toBe(9)
    expect(r.glyphCount).toBe(2)
  })

  it('rejects a bytes-per-glyph that does not match height x ceil(width/8)', () => {
    expect(() => parsePsf(psf2({ width: 8, height: 16, count: 2, bytesPerGlyph: 32 }))).toThrow('inconsistent')
  })

  it('rejects a zero-sized glyph', () => {
    expect(() => parsePsf(psf2({ width: 0, height: 0, count: 1, bytesPerGlyph: 0 }))).toThrow('inconsistent')
  })
})
