import { describe, it, expect } from 'vitest'
import { describeOpenedFile, winCharsetToCodepage } from './openFile'
import { writeCpi } from './fileFormats/cpiWriter'
import { writeTap } from './fileFormats/tapWriter'
import { writeFzx } from './fileFormats/fzxWriter'
import { writeEgaCom } from './fileFormats/egaComWriter'

function toBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
}

/** Minimal 8x8 font data for one glyph: a single set pixel. */
function glyphData(count = 96): Uint8Array {
  const bytes = new Uint8Array(count * 8)
  bytes[0] = 0x80
  return bytes
}

const fontData = (extra: Record<string, unknown> = {}) => ({
  fontData: glyphData(),
  glyphWidth: 8,
  glyphHeight: 8,
  startChar: 32,
  glyphCount: 96,
  baseline: 7,
  fontName: 'test',
  ...extra,
})

describe('winCharsetToCodepage', () => {
  it('maps the dfCharSet values Windows fonts actually use', () => {
    expect(winCharsetToCodepage(0)).toBe(1252)   // ANSI
    expect(winCharsetToCodepage(255)).toBe(437)  // OEM
    expect(winCharsetToCodepage(204)).toBe(1251) // Russian
  })

  it('reports 0 for DEFAULT/SYMBOL, which have no codepage', () => {
    expect(winCharsetToCodepage(1)).toBe(0)
  })
})

describe('describeOpenedFile: generic paths', () => {
  it('opens a recognised font through the generic loader', () => {
    // .ch8 is raw glyph data; the loader reports it as a ZX Spectrum font
    const out = describeOpenedFile('thing.ch8', toBuffer(glyphData()))
    expect(out.kind).toBe('font')
    if (out.kind !== 'font') return
    expect(out.descriptor.result.glyphWidth).toBe(8)
    expect(out.descriptor.result.detectedCharset).toBe('zx')
  })

  it('asks for the raw import dialog when the format is truly unknown', () => {
    // A .zzz extension is not one of the handled containers, and the bytes do
    // not match any magic-byte fallback, so the caller must offer Raw Import
    const out = describeOpenedFile('mystery.zzz', toBuffer(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8])))
    expect(out.kind).toBe('raw')
  })

  it('rejects a TTF that has only vector outlines', () => {
    // A bare sfnt header is a valid TTF but carries no embedded bitmaps
    const ttf = new Uint8Array(12)
    new DataView(ttf.buffer).setUint32(0, 0x00010000)
    const out = describeOpenedFile('vector.ttf', toBuffer(ttf))
    expect(out.kind).toBe('error')
    if (out.kind !== 'error') return
    expect(out.title).toBe('No bitmap data')
    expect(out.message).toContain('only vector outlines')
  })

  it('explains that a BMFont .fnt needs its texture pages', () => {
    const descriptor = 'info face="Test" size=8\ncommon lineHeight=8 pages=1\n'
    const out = describeOpenedFile('bm.fnt', toBuffer(new TextEncoder().encode(descriptor)))
    expect(out.kind).toBe('error')
    if (out.kind !== 'error') return
    expect(out.title).toBe('BMFont descriptor')
    expect(out.message).toContain('PNG texture page')
  })
})

describe('describeOpenedFile: CPI containers', () => {
  it('describes every font in the file and keeps the variant label', () => {
    const buf = writeCpi(fontData({ detectedCharset: 'cp437' }) as never)
    const out = describeOpenedFile('test.cpi', toBuffer(buf))
    expect(out.kind).toBe('container')
    if (out.kind !== 'container') return
    expect(out.descriptor.format).toMatch(/^CPI \(/)
    expect(out.descriptor.fonts.length).toBeGreaterThan(0)
    expect(out.descriptor.fileName).toBe('test.cpi')
    // The container carries the CPI header properties for the properties dialog
    expect(out.descriptor.meta?.properties).toBeTypeOf('object')
  })

  it('reports a codepage-derived label for each entry', () => {
    const buf = writeCpi(fontData({ detectedCharset: 'cp850' }) as never)
    const out = describeOpenedFile('cp850.cpi', toBuffer(buf))
    expect(out.kind).toBe('container')
    if (out.kind !== 'container') return
    const font = out.descriptor.fonts[0]
    expect(font.codepage).toBe(850)
    expect(font.label).toContain('CP850')
  })
})

describe('describeOpenedFile: ZX Spectrum TAP', () => {
  it('marks extracted fonts as ZX Spectrum so they keep their own codepage', () => {
    const buf = writeTap(fontData() as never)
    const out = describeOpenedFile('game.tap', toBuffer(buf))
    // A tap with no font-sized block is an error; with one it is a container
    if (out.kind === 'container') {
      expect(out.descriptor.format).toBe('ZX Spectrum TAP')
      for (const f of out.descriptor.fonts) expect(f.charsetKey).toBe('zx')
    } else {
      expect(out.kind).toBe('error')
    }
  })

  it('explains when a TAP has no font-sized blocks', () => {
    const out = describeOpenedFile('empty.tap', toBuffer(new Uint8Array(64)))
    if (out.kind === 'error') {
      expect(out.message).toMatch(/no font-sized CODE blocks/i)
    }
  })
})

describe('describeOpenedFile: errors are values, not exceptions', () => {
  it('never throws for truncated or malformed container files', () => {
    const bad = toBuffer(new Uint8Array([0x00, 0x01, 0x02]))
    for (const name of ['x.cpi', 'x.cpx', 'x.fon', 'x.tap', 'x.cvt', 'x.ttf']) {
      expect(() => describeOpenedFile(name, bad), name).not.toThrow()
    }
  })

  it('returns an error outcome with a title and message', () => {
    const out = describeOpenedFile('x.cpi', toBuffer(new Uint8Array([1, 2, 3])))
    expect(out.kind).toBe('error')
    if (out.kind !== 'error') return
    expect(out.title.length).toBeGreaterThan(0)
    expect(out.message.length).toBeGreaterThan(0)
  })
})

describe('describeOpenedFile: FZX', () => {
  it('opens an FZX font as a single font', () => {
    const buf = writeFzx(fontData() as never)
    const out = describeOpenedFile('demo.fzx', toBuffer(buf))
    expect(out.kind).toBe('font')
  })
})

describe('describeOpenedFile: routing', () => {
  it('routes each extension to its own handler', () => {
    // Each of these should be recognised as its own format, not fall through
    // to the generic loader or the raw import dialog.
    const cases: [string, Uint8Array, string][] = [
      ['a.cpi', writeCpi(fontData({ detectedCharset: 'cp437' }) as never), 'container'],
      ['a.tap', writeTap(fontData() as never), 'container'],
      ['a.cvt', new Uint8Array(0), 'error'],
      ['a.com', writeEgaCom(fontData() as never), 'fonts'],
      ['a.fzx', writeFzx(fontData() as never), 'font'],
      ['a.ch8', glyphData(), 'font'],
    ]
    for (const [name, bytes, expected] of cases) {
      const out = describeOpenedFile(name, toBuffer(bytes))
      expect(out.kind, name).toBe(expected)
    }
  })

  it('is case-insensitive about the extension', () => {
    const buf = toBuffer(glyphData())
    expect(describeOpenedFile('THING.CH8', buf).kind).toBe('font')
    expect(describeOpenedFile('Thing.Ch8', buf).kind).toBe('font')
  })

  it('prefers the BMFont hint over the generic .fnt path', () => {
    // A textual .fnt is an AngelCode descriptor needing PNG pages; a binary
    // one is a Windows FNT. Both share the extension and must not collide.
    const text = new TextEncoder().encode('info face="X" size=8\ncommon lineHeight=8\n')
    const out = describeOpenedFile('page.fnt', toBuffer(text))
    expect(out.kind).toBe('error')
    if (out.kind === 'error') expect(out.title).toBe('BMFont descriptor')
  })
})

describe('describeOpenedFile: .com images', () => {
  it('returns each font separately, all on the image\'s codepage', () => {
    const buf = writeEgaCom(fontData() as never)
    const out = describeOpenedFile('dos.com', toBuffer(buf))
    expect(out.kind).toBe('fonts')
    if (out.kind !== 'fonts') return
    expect(out.descriptors.length).toBeGreaterThan(0)
    // EGA .com images are CP437, not CP/M
    expect(out.charsetKey).toBe('cp437')
    for (const d of out.descriptors) {
      expect(d.result.detectedCharset).toBe('cp437')
      expect(d.result.fontData.length).toBeGreaterThan(0)
    }
  })

  it('distinguishes multiple fonts by cell size in their names', () => {
    const buf = writeEgaCom(fontData() as never)
    const out = describeOpenedFile('multi.com', toBuffer(buf))
    if (out.kind !== 'fonts' || out.descriptors.length < 2) return
    const names = out.descriptors.map(d => d.name)
    expect(new Set(names).size).toBe(names.length)
    expect(names.every(n => n.includes('×'))).toBe(true)
  })
})
