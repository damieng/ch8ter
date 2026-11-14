import { describe, it, expect } from 'vitest'
import { saveFontFile, TEXT_FORMATS, type FontWriteData } from './fontSave'
import { loadFontFile } from './fontLoad'
import { describeOpenedFile } from './openFile'
import { createFont } from './fontModel'
import { setPixel } from './fontOps'
import { fontToConversionData } from './fontOps'

/** A small 8x8 font with a few inked glyphs and complete metadata. */
function sampleFont(): FontWriteData {
  const f = createFont(new Uint8Array(96 * 8), 'roundtrip.ch8', 32, 8, 8)
  for (const ch of ['A', 'B', 'a', '0']) {
    const idx = ch.charCodeAt(0) - 32
    for (let y = 1; y < 7; y++) setPixel(f, idx, 1, y, true)
  }
  const d = fontToConversionData(f)
  return {
    fontData: d.fontData,
    glyphWidth: 8,
    glyphHeight: 8,
    startChar: 32,
    glyphCount: 96,
    baseline: 7,
    meta: { properties: {}, family: 'Round Trip' },
    glyphMeta: null,
    fontName: 'RoundTrip',
  }
}

function toBuffer(bytes: Uint8Array | string): ArrayBuffer {
  const u8 = typeof bytes === 'string' ? new TextEncoder().encode(bytes) : bytes
  return u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength) as ArrayBuffer
}

describe('saveFontFile: dispatch', () => {
  it('accepts the extension with or without a leading dot', () => {
    const data = sampleFont()
    expect(saveFontFile('ch8', data as never)).toBeInstanceOf(Uint8Array)
    expect(saveFontFile('.ch8', data as never)).toBeInstanceOf(Uint8Array)
  })

  it('is case-insensitive about the extension', () => {
    const data = sampleFont()
    expect(saveFontFile('BDF', data as never)).toBeTypeOf('string')
    expect(saveFontFile('.Bdf', data as never)).toBeTypeOf('string')
  })

  it('rejects an unknown format and names it', () => {
    expect(() => saveFontFile('xyz', sampleFont() as never)).toThrow(/Unsupported output format/)
    expect(() => saveFontFile('xyz', sampleFont() as never)).toThrow(/xyz/)
  })

  it('returns text for the text formats and bytes for the rest', () => {
    const data = sampleFont()
    for (const ext of TEXT_FORMATS) {
      expect(typeof saveFontFile(ext, data as never), ext).toBe('string')
    }
    for (const ext of ['ch8', 'psf', 'fzx', 'cpi', 'fon', 'geos', '64c', 'tap']) {
      expect(saveFontFile(ext, data as never), ext).toBeInstanceOf(Uint8Array)
    }
  })

  it('covers every format the UI offers', () => {
    // If a writer is added without a case here, this list makes it obvious
    const supported = [
      'ch8', 'bdf', 'psf', 'yaff', 'draw', 'fzx', 'fnt', 'windows', 'pcf', 'pdb',
      'amiga', 'atari8', 'ega', 'bbc', 'com', 'cpi', 'fon', 'geos', '64c', 'tap', 'psf1',
    ]
    for (const ext of supported) {
      expect(() => saveFontFile(ext, sampleFont() as never), ext).not.toThrow()
    }
  })
})

describe('saveFontFile: round-trips through the loader', () => {
  // Formats loadFontFile handles as a single font. .cpi/.fon are containers and
  // go through describeOpenedFile instead, covered further down.
  const singleFont: [string, string][] = [
    ['ch8', 'out.ch8'], ['bdf', 'out.bdf'], ['psf', 'out.psf'], ['yaff', 'out.yaff'],
    ['draw', 'out.draw'], ['fzx', 'out.fzx'], ['pcf', 'out.pcf'], ['pdb', 'out.pdb'],
    ['bbc', 'out.bbc'], ['64c', 'out.64c'], ['tap', 'out.tap'], ['ega', 'out.com'],
  ]

  // These formats always describe a full 256-character set, so they reload at
  // character code 0 regardless of where the source font started.
  const fullCharset = new Set(['64c', 'tap', 'ega'])

  for (const [ext, filename] of singleFont) {
    it(`reloads a ${ext} it just wrote with the same cell size`, () => {
      const written = saveFontFile(ext, sampleFont() as never)
      const result = loadFontFile(filename, toBuffer(written))
      expect(result.glyphWidth, `${ext} width`).toBe(8)
      expect(result.glyphHeight, `${ext} height`).toBe(8)
      // Full-charset formats reset the start code; others keep the source's
      expect(result.startChar, `${ext} startChar`).toBe(fullCharset.has(ext) ? 0 : 32)
    })
  }

  it('reloads a CPI as a container with the same cell size', () => {
    const written = saveFontFile('cpi', sampleFont() as never) as Uint8Array
    const out = describeOpenedFile('out.cpi', toBuffer(written))
    expect(out.kind).toBe('container')
    if (out.kind !== 'container') return
    expect(out.descriptor.fonts[0].width).toBe(8)
    expect(out.descriptor.fonts[0].height).toBe(8)
  })

  it('reloads a FON as a container with the same cell size', () => {
    const written = saveFontFile('fon', sampleFont() as never) as Uint8Array
    const out = describeOpenedFile('out.fon', toBuffer(written))
    expect(out.kind).toBe('container')
    if (out.kind !== 'container') return
    expect(out.descriptor.fonts[0].width).toBe(8)
    expect(out.descriptor.fonts[0].height).toBe(8)
  })

  it('reloads a GEOS CVT as a container', () => {
    const data = { ...sampleFont(), glyphMeta: Array.from({ length: 96 }, () => ({ dwidth: [8, 0] })) }
    const written = saveFontFile('geos', data as never) as Uint8Array
    const out = describeOpenedFile('out.cvt', toBuffer(written))
    expect(out.kind).toBe('container')
  })

  it('preserves the pixels of a glyph through ch8', () => {
    const written = saveFontFile('ch8', sampleFont() as never) as Uint8Array
    const back = loadFontFile('out.ch8', toBuffer(written))
    // Glyph 'A' has ink at column 1, rows 1..6
    const idx = 0x41 - 32
    const bpg = 8 * 1
    const glyph = back.fontData.subarray(idx * bpg, (idx + 1) * bpg)
    expect(glyph[0]).toBe(0)
    expect(glyph[1]).toBe(0x40) // column 1 set
    expect(glyph[6]).toBe(0x40)
    expect(glyph[7]).toBe(0)
  })

  it('preserves the family name through BDF', () => {
    const written = saveFontFile('bdf', sampleFont() as never) as string
    expect(written).toContain('FAMILY_NAME')
    const back = loadFontFile('out.bdf', toBuffer(written))
    expect(back.meta?.family).toContain('Round')
  })

  it('writes a CPI that records the codepage it was given', () => {
    const data = { ...sampleFont(), detectedCharset: 'cp850' }
    const written = saveFontFile('cpi', data as never) as Uint8Array
    const out = describeOpenedFile('out.cpi', toBuffer(written))
    expect(out.kind).toBe('container')
    if (out.kind !== 'container') return
    // The codepage written into the header is read back per entry
    expect(out.descriptor.fonts[0].codepage).toBe(850)
  })
})

describe('saveFontFile: format-specific output', () => {
  it('writes ch8 as a plain copy of the glyph data', () => {
    const data = sampleFont()
    const out = saveFontFile('ch8', data as never) as Uint8Array
    expect([...out]).toEqual([...data.fontData])
  })

  it('produces a text BDF with the expected section markers', () => {
    const bdf = saveFontFile('bdf', sampleFont() as never) as string
    expect(bdf).toContain('STARTFONT')
    expect(bdf).toContain('ENDFONT')
    expect(bdf).toContain('STARTCHAR')
    expect(bdf).toContain('BITMAP')
  })

  it('produces an Amiga archive containing the font directory and hunk', () => {
    const lha = saveFontFile('amiga', sampleFont() as never) as Uint8Array
    // Stored LHA entries start with the level-0 header size byte, then "-lh0-"
    const asText = new TextDecoder('latin1').decode(lha)
    expect(asText).toContain('-lh0-')
    expect(asText).toContain('Fonts/')
  })

  it('writes nothing surprising into the glyph data for PSF1', () => {
    const out = saveFontFile('psf1', sampleFont() as never) as Uint8Array
    expect(out.length).toBeGreaterThan(4)
    // PSF1 magic is 0x36 0x04
    expect(out[0]).toBe(0x36)
    expect(out[1]).toBe(0x04)
  })
})
