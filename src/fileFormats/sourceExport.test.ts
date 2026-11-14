import { describe, it, expect } from 'vitest'
import { createFont } from '../fontModel'
import { setPixel } from '../fontOps'
import { exportSource, SOURCE_FORMATS, type SourceFormat } from './sourceExport'

/** 2 glyphs of 8x8, with known pixel patterns. */
function makeFont(name = 'my font.ch8') {
  const f = createFont(new Uint8Array(2 * 8), name, 32, 8, 8)
  setPixel(f, 0, 0, 0, true) // first byte 0x80
  setPixel(f, 1, 7, 1, true)
  return f
}

describe('SOURCE_FORMATS', () => {
  it('lists one entry per supported format with an extension', () => {
    expect(SOURCE_FORMATS.length).toBe(9)
    for (const f of SOURCE_FORMATS) {
      expect(f.ext.startsWith('.')).toBe(true)
      expect(f.label.length).toBeGreaterThan(0)
    }
  })

  it('has unique ids', () => {
    const ids = SOURCE_FORMATS.map(f => f.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('exportSource: every format produces output', () => {
  const formats: SourceFormat[] = ['c', 'csharp', 'rust', 'ts', 'basic', 'z80', '6502', '68000', 'x86']

  for (const format of formats) {
    it(`emits non-empty, multi-line ${format}`, () => {
      const out = exportSource(makeFont(), format)
      expect(out.length).toBeGreaterThan(0)
      expect(out.split('\n').length).toBeGreaterThan(1)
      expect(out).not.toContain('undefined')
      expect(out).not.toContain('NaN')
    })
  }

  it('emits the glyph bytes in every format', () => {
    // The first glyph's first byte is 0x80 by construction
    const expectations: Partial<Record<SourceFormat, string>> = {
      c: '0x80',
      csharp: '0x80',
      rust: '0x80',
      ts: '0x80',
      basic: '128',
      z80: '&80',
      '6502': '$80',
      '68000': '$80',
      x86: '80h',
    }
    for (const [format, needle] of Object.entries(expectations)) {
      expect(exportSource(makeFont(), format as SourceFormat), format).toContain(needle!)
    }
  })
})

describe('exportSource: C header', () => {
  it('has an include guard derived from the file name', () => {
    // The extension is stripped before sanitising, so ".ch8" is not part of the name
    const out = exportSource(makeFont('Zed Font.ch8'), 'c')
    expect(out).toContain('#ifndef FONT_ZED_FONT_H_')
    expect(out).toContain('#define FONT_ZED_FONT_H_')
    expect(out.startsWith('// Zed Font.ch8')).toBe(true)
    expect(out.trimEnd().endsWith('#endif // FONT_ZED_FONT_H_')).toBe(true)
  })

  it('includes stdint for uint8_t', () => {
    expect(exportSource(makeFont(), 'c')).toContain('#include <stdint.h>')
  })

  it('declares the bitmap as a static const array', () => {
    expect(exportSource(makeFont(), 'c')).toContain('static const uint8_t FONT_MY_FONT_BITMAP[]')
  })
})

describe('exportSource: identifiers', () => {
  it('sanitises punctuation in the file name', () => {
    const out = exportSource(makeFont('a-b c.d8'), 'c')
    // Non-alphanumerics become underscores; the extension is dropped first
    expect(out).toMatch(/FONT_A_B_C_H_/)
  })

  it('keeps digits and letters', () => {
    expect(exportSource(makeFont('ZX81.ch8'), 'rust')).toContain('FONT_ZX81_BITMAP')
  })
})

describe('exportSource: comments', () => {
  it('labels glyphs with their printable character', () => {
    const out = exportSource(makeFont(), 'c')
    expect(out).toContain('// !') // startChar 32 => '!' at index 1
    expect(out).toContain('//  ') // index 0 is a space, commented as a space
  })

  it('labels non-printable codes in hex', () => {
    const f = createFont(new Uint8Array(8), 'ctl.bin', 0x01, 8, 8)
    expect(exportSource(f, 'c')).toContain('// 0x01')
  })
})

describe('exportSource: assembly dialects', () => {
  it('uses & prefix for Z80 bytes', () => {
    const out = exportSource(makeFont(), 'z80')
    expect(out).toMatch(/defb &[0-9a-f]{2}/)
  })

  it('uses $ prefix for 6502 bytes', () => {
    expect(exportSource(makeFont(), '6502')).toMatch(/\.byte \$[0-9a-f]{2}/)
  })

  it('uses DC.B for 68000', () => {
    expect(exportSource(makeFont(), '68000')).toMatch(/DC\.B \$[0-9a-f]{2}/)
  })

  it('pads x86 hex with a leading zero when it would start with a letter', () => {
    const f = createFont(new Uint8Array(8), 'x86.bin', 32, 8, 8)
    f.fontData.value[0] = 0xAB // would be "ABh", which is not valid MASM
    expect(exportSource(f, 'x86')).toContain('0ABh')
  })

  it('does not pad x86 hex that already starts with a digit', () => {
    const f = createFont(new Uint8Array(8), 'x86.bin', 32, 8, 8)
    f.fontData.value[0] = 0x42
    expect(exportSource(f, 'x86')).toContain('42h')
    expect(exportSource(f, 'x86')).not.toContain('042h')
  })
})

describe('exportSource: BASIC', () => {
  it('numbers DATA lines from 1000 in steps of 10', () => {
    const out = exportSource(makeFont(), 'basic')
    const numbers = out.split('\n').map(l => parseInt(l, 10))
    expect(numbers).toEqual([1000, 1010])
  })

  it('writes decimal byte values', () => {
    expect(exportSource(makeFont(), 'basic')).toContain('DATA 128')
  })
})

describe('exportSource: edge cases', () => {
  it('handles a font with no glyphs', () => {
    const f = createFont(new Uint8Array(0), 'empty.bin', 32, 8, 8)
    expect(() => exportSource(f, 'c')).not.toThrow()
  })

  it('handles multi-byte rows (width above 8)', () => {
    const f = createFont(new Uint8Array(2 * 16), 'wide.bin', 32, 16, 8)
    const out = exportSource(f, 'c')
    // 16 pixels wide is two bytes per row, eight rows => 16 bytes per glyph
    const dataLine = out.split('\n').find(l => l.trim().startsWith('0x'))!
    // The trailing comment is stripped; count only the comma-separated hex values
    const hexValues = dataLine.split('//')[0].match(/0x[0-9a-f]{2}/g)!
    expect(hexValues.length).toBe(16)
  })

  it('is deterministic', () => {
    const f = makeFont()
    expect(exportSource(f, 'ts')).toBe(exportSource(f, 'ts'))
  })
})
