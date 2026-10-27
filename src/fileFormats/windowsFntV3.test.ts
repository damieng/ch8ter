import { describe, it, expect } from 'vitest'
import { writeWindowsFnt } from './windowsFntWriter'
import { parseWindowsFnt } from './windowsFntParser'
import { bpr } from '../bitUtils'
import type { FontWriteData } from '../fontSave'

function toBuffer(u: Uint8Array): ArrayBuffer {
  return u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer
}

function makeFont(width: number, height: number, count: number): FontWriteData {
  const bytesPerGlyph = height * bpr(width)
  const fontData = new Uint8Array(count * bytesPerGlyph)
  for (let i = 0; i < fontData.length; i++) fontData[i] = (i * 7 + 3) & 0xFF
  return {
    fontData,
    glyphWidth: width,
    glyphHeight: height,
    startChar: 0,
    glyphCount: count,
    baseline: height - 1,
    meta: null,
    glyphMeta: null,
    fontName: 'BigCell',
  }
}

describe('writeWindowsFnt v3 fallback', () => {
  it('stays v2 for small fonts', () => {
    const buf = writeWindowsFnt(makeFont(8, 8, 32))
    expect(buf[0] | (buf[1] << 8)).toBe(0x0200)
  })

  it('emits v3 when v2 u16 bitmap offsets would overflow, and round-trips', () => {
    // 256 glyphs x (32x80 cell = 320 bytes) => bitmap offsets exceed 0xFFFF
    const font = makeFont(32, 80, 256)
    const buf = writeWindowsFnt(font)

    const view = new DataView(buf.buffer)
    expect(view.getUint16(0, true)).toBe(0x0300)

    const parsed = parseWindowsFnt(toBuffer(buf))
    expect(parsed.glyphWidth).toBe(32)
    expect(parsed.glyphHeight).toBe(80)
    expect(parsed.startChar).toBe(0)
    expect(parsed.populated.size).toBe(256)
    // Every glyph's pixels survive the column-padded v3 layout
    let matches = 0
    for (let g = 0; g < 256; g++) {
      const src = font.fontData.subarray(g * 320, (g + 1) * 320)
      const dst = parsed.fontData.subarray(g * 320, (g + 1) * 320)
      if (src.every((b, i) => b === dst[i])) matches++
    }
    expect(matches).toBe(256)
  })
})
