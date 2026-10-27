import { describe, it, expect } from 'vitest'
import { writePsf1 } from './psfWriter'
import { parsePsf } from './psfParser'
import { bpr, getBit } from '../bitUtils'
import type { FontWriteData } from '../fontSave'

function makeFont(): FontWriteData {
  const fontData = new Uint8Array(4 * 8)
  fontData[0] = 0x80  // ' ' pixel (0,0)
  fontData[8] = 0x81  // '!' pixels (0,0),(7,0)
  return {
    fontData, glyphWidth: 8, glyphHeight: 8, startChar: 32,
    glyphCount: 4, baseline: 7, meta: null, glyphMeta: null, fontName: 'PSF1',
  }
}

describe('writePsf1', () => {
  it('writes the PSF1 magic and 256 blank-backed glyphs', () => {
    const buf = writePsf1(makeFont())
    expect(buf.length).toBe(4 + 256 * 8)
    expect(buf[0]).toBe(0x36)
    expect(buf[1]).toBe(0x04)
    expect(buf[2]).toBe(0)  // mode: 256 chars
    expect(buf[3]).toBe(8)  // char height
  })

  it('round-trips through the PSF parser with pixels intact', () => {
    const font = makeFont()
    const buf = writePsf1(font)
    const psf = parsePsf(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer)
    expect(psf.glyphWidth).toBe(8)
    expect(psf.glyphHeight).toBe(8)

    // 256 glyphs laid out by char code; compare a few known pixels
    const rowBytes = bpr(8)
    expect(getBit(psf.fontData, 32 * 8 + 0 * rowBytes, 0)).toBe(true)   // ' ' pixel
    expect(getBit(psf.fontData, 33 * 8 + 0 * rowBytes, 7)).toBe(true)   // '!' pixel (7,0)
    expect(getBit(psf.fontData, 33 * 8 + 0 * rowBytes, 1)).toBe(false)  // '!' no pixel (1,0)
    expect(getBit(psf.fontData, 100 * 8 + 3 * rowBytes, 4)).toBe(false) // out-of-range blank
  })

  it('rejects fonts wider than 8 pixels', () => {
    expect(() => writePsf1({ ...makeFont(), glyphWidth: 9 })).toThrow('8 pixels')
  })
})
