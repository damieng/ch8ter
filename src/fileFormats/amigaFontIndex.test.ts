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

// docs/formats/Amiga-font.md: FontContentsHeader is two UInt16s; each FontContents
// entry is a 256-byte path then UInt16 YSize, UInt8 Style, UInt8 Flags (260 bytes)
describe('writeAmigaFontIndex', () => {
  it('writes the documented header and 260-byte FontContents entry', () => {
    const buf = writeAmigaFontIndex(makeFont())
    const view = new DataView(buf.buffer)
    expect(buf.length).toBe(4 + 260)
    expect(view.getUint16(0, false)).toBe(0x0F00)   // fch_FileID
    expect(view.getUint16(2, false)).toBe(1)        // fch_NumEntries

    const e = 4
    const name = new TextDecoder().decode(buf.subarray(e, e + 256)).replace(/\0.*$/, '')
    expect(name).toBe('MyFont/8')
    expect(buf[e + 8]).toBe(0)                      // null-terminated
    expect(view.getUint16(e + 256, false)).toBe(8)  // fc_YSize
    expect(buf[e + 258]).toBe(0)                    // fc_Style
    expect(buf[e + 259] & 0x40).toBe(0x40)          // fc_Flags: FPF_DESIGNED
    expect(buf[e + 259] & 0x02).toBe(0x02)          // fc_Flags: FPF_DISKFONT
    expect(buf[e + 259] & 0x20).toBe(0)             // not proportional
  })

  it('flags proportional fonts', () => {
    const font = makeFont()
    font.glyphMeta = [{ dwidth: [6, 0] }, null, null, null, null, null, null, null]
    const buf = writeAmigaFontIndex(font)
    expect(buf[4 + 259] & 0x20).toBe(0x20)
  })

  it('rejects character ranges beyond a byte', () => {
    expect(() => writeAmigaFontIndex({ ...makeFont(), startChar: 250, glyphCount: 8 })).toThrow('0..255')
  })
})

describe('buildAmigaFontDirectory', () => {
  it('builds the standard FONTS: drawer file set', () => {
    const files = buildAmigaFontDirectory(makeFont())
    expect(files.map(f => f.path)).toEqual(['Fonts/MyFont.font', 'Fonts/MyFont/8'])
    expect(files[0].data.length).toBe(264)
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
