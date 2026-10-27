import { describe, it, expect } from 'vitest'
import { writeAmigaFontIndex, buildAmigaFontDirectory, amigaFontBaseName } from './amigaFontWriter'
import type { FontWriteData } from '../fontSave'

function makeFont(): FontWriteData {
  const fontData = new Uint8Array(8 * 8)
  fontData[0] = 0x18
  return {
    fontData, glyphWidth: 8, glyphHeight: 8, startChar: 32,
    glyphCount: 8, baseline: 7, meta: null, glyphMeta: null, fontName: 'MyFont',
  }
}

describe('writeAmigaFontIndex', () => {
  it('writes a $0F00 header, one entry, and the size-file reference', () => {
    const buf = writeAmigaFontIndex(makeFont())
    const view = new DataView(buf.buffer)
    expect(buf.length).toBe(6 + 84)
    expect(view.getUint32(0, false)).toBe(0x0F00)
    expect(view.getUint16(4, false)).toBe(1)

    const e = 6
    expect(view.getUint16(e + 20, false)).toBe(8)                      // tf_YSize
    expect(view.getUint16(e + 24, false)).toBe(8)                      // tf_XSize
    expect(view.getUint16(e + 26, false)).toBe(8)                      // tf_Baseline + 1
    expect(buf[e + 32]).toBe(32)                                       // tf_LoChar
    expect(buf[e + 33]).toBe(39)                                       // tf_HiChar

    const name = new TextDecoder().decode(buf.subarray(e + 52, e + 84)).replace(/\0.*$/, '')
    expect(name).toBe('MyFont/8')
  })

  it('flags proportional fonts', () => {
    const font = makeFont()
    font.glyphMeta = [{ dwidth: [6, 0] }, null, null, null, null, null, null, null]
    const buf = writeAmigaFontIndex(font)
    expect(buf[6 + 23] & 0x20).toBe(0x20)
  })

  it('rejects character ranges beyond a byte', () => {
    expect(() => writeAmigaFontIndex({ ...makeFont(), startChar: 250, glyphCount: 8 })).toThrow('0..255')
  })
})

describe('buildAmigaFontDirectory', () => {
  it('builds the standard FONTS: drawer file set', () => {
    const files = buildAmigaFontDirectory(makeFont())
    expect(files.map(f => f.path)).toEqual(['Fonts/MyFont.font', 'Fonts/MyFont/8'])
    expect(files[0].data.length).toBe(90)
    // The hunk font is the existing writer's output
    expect(files[1].data[0]).toBe(0x00)
    expect(files[1].data[1]).toBe(0x00)
    expect(files[1].data[2]).toBe(0x03)
    expect(files[1].data[3]).toBe(0xF3)
  })

  it('sanitizes names used in paths', () => {
    expect(amigaFontBaseName('a/b:c?')).toBe('abc')
  })
})
