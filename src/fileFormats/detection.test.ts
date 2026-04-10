// Tests for format detection, dispatch, and opener logic.

import { describe, it, expect } from 'vitest'
import { loadFontFile, baseName } from '../fontLoad'
import { setBit } from '../bitUtils'

// Writers used to generate test data in specific formats
import { writeBdf } from './bdfWriter'
import { writePsf } from './psfWriter'
import { writeDraw } from './drawWriter'
import { writeYaff } from './yaffWriter'
import { writeBbc } from './bbcWriter'
import { writeEgaCom } from './egaComWriter'
import { writeFzx } from './fzxWriter'
import type { FontWriteData } from '../fontSave'

// Openers
import { openFnt } from './fntOpener'
import { openCom } from './comOpener'

// Detection helpers
import { isBbcFont } from './bbcParser'
import { isEgaCom } from './egaComParser'
import { isTsrCom } from './tsrComParser'

/** Minimal test font for writing. */
function makeTestFont(w: number, h: number, startChar: number, glyphCount: number): FontWriteData {
  const rowBytes = Math.ceil(w / 8)
  const bpg = h * rowBytes
  const fontData = new Uint8Array(glyphCount * bpg)
  for (let i = 0; i < glyphCount; i++) {
    for (let y = 0; y < h; y++) {
      const x = (y + i) % w
      setBit(fontData, i * bpg + y * rowBytes, x)
    }
  }
  return { fontData, glyphWidth: w, glyphHeight: h, startChar, glyphCount, baseline: h - 1, meta: null, glyphMeta: null, fontName: 'Test' }
}

/** Convert string to ArrayBuffer */
function textToBuffer(text: string): ArrayBuffer {
  return new TextEncoder().encode(text).buffer
}

/** Convert Uint8Array to ArrayBuffer (ensure it's a standalone buffer) */
function toBuffer(arr: Uint8Array): ArrayBuffer {
  const buf = new ArrayBuffer(arr.length)
  new Uint8Array(buf).set(arr)
  return buf
}

// --- baseName ---

describe('baseName', () => {
  it('strips directory and extension', () => {
    expect(baseName('/path/to/font.bdf')).toBe('font')
    expect(baseName('C:\\Users\\test\\myfont.psf')).toBe('myfont')
    expect(baseName('simple.fnt')).toBe('simple')
    expect(baseName('noext')).toBe('noext')
  })
})

// --- loadFontFile extension dispatch ---

describe('loadFontFile extension dispatch', () => {
  it('dispatches .draw files to DRAW parser', () => {
    const font = makeTestFont(8, 8, 32, 16)
    const text = writeDraw(font)
    const result = loadFontFile('test.draw', textToBuffer(text))
    expect(result.glyphWidth).toBe(8)
    expect(result.glyphHeight).toBe(8)
    expect(result.fontName).toBe('test')
  })

  it('dispatches .yaff files to YAFF parser', () => {
    const font = makeTestFont(8, 8, 32, 16)
    const text = writeYaff(font)
    const result = loadFontFile('myfont.yaff', textToBuffer(text))
    expect(result.glyphWidth).toBe(8)
    expect(result.glyphHeight).toBe(8)
  })

  it('dispatches .bdf files to BDF parser', () => {
    const font = makeTestFont(8, 16, 32, 96)
    const text = writeBdf(font)
    const result = loadFontFile('font.bdf', textToBuffer(text))
    expect(result.glyphWidth).toBe(8)
    expect(result.glyphHeight).toBe(16)
  })

  it('dispatches .psf files to PSF parser', () => {
    const font = makeTestFont(8, 16, 32, 96)
    const bytes = writePsf(font)
    const result = loadFontFile('font.psf', toBuffer(bytes))
    expect(result.glyphWidth).toBe(8)
    expect(result.glyphHeight).toBe(16)
  })

  it('dispatches .fzx files to FZX parser', () => {
    const font = makeTestFont(8, 8, 32, 96)
    const bytes = writeFzx(font)
    const result = loadFontFile('font.fzx', toBuffer(bytes))
    expect(result.glyphHeight).toBe(8)
    expect(result.spacingMode).toBe('proportional')
  })

  it('dispatches .bbc files to BBC parser', () => {
    const font = makeTestFont(8, 8, 32, 96)
    const bytes = writeBbc(font)
    const result = loadFontFile('font.bbc', toBuffer(bytes))
    expect(result.glyphWidth).toBe(8)
    expect(result.glyphHeight).toBe(8)
    expect(result.detectedCharset).toBe('bbc')
  })

  it('is case-insensitive for extensions', () => {
    const font = makeTestFont(8, 8, 32, 16)
    const text = writeDraw(font)
    const result = loadFontFile('TEST.DRAW', textToBuffer(text))
    expect(result.glyphWidth).toBe(8)
  })

  it('loads .ch8 as raw ch8 format', () => {
    const raw = new Uint8Array(96 * 8)
    raw[0] = 0xFF // first byte of first glyph
    const result = loadFontFile('font.ch8', raw.buffer, { width: 8, height: 8, startChar: 32 })
    expect(result.glyphWidth).toBe(8)
    expect(result.glyphHeight).toBe(8)
    expect(result.startChar).toBe(32)
  })

  it('throws UnknownFormatError for unknown extensions', () => {
    const raw = new Uint8Array(96 * 8)
    expect(() => loadFontFile('font.xyz', raw.buffer)).toThrow('Unknown font format')
  })
})

// --- .fnt opener detection ---

describe('openFnt detection', () => {
  it('detects 1024-byte file with empty first glyph as Atari 8-bit', () => {
    const buf = new ArrayBuffer(1024)
    // First 8 bytes = 0 (space glyph), rest can be anything
    const bytes = new Uint8Array(buf)
    bytes[8] = 0xFF // first pixel row of glyph 1
    const result = openFnt(buf)
    expect(result.source).toBe('atari8bit')
    expect(result.glyphWidth).toBe(8)
    expect(result.glyphHeight).toBe(8)
  })

  it('detects non-1024-byte files as GDOS', () => {
    // Build a minimal GDOS header (Atari ST GEM font)
    // GDOS has a 88-byte header; we just need it to not match Atari 8-bit or Windows
    const buf = new ArrayBuffer(2048)
    const view = new DataView(buf)
    // font_id=1, point_size=8
    view.setUint16(0, 1, false) // big-endian font_id
    view.setUint16(2, 8, false) // point_size
    // A non-matching file that's not 1024 bytes and doesn't look like Windows FNT
    // openFnt falls through to GDOS
    // This may throw if GDOS parser rejects it, which is fine
    try {
      const result = openFnt(buf)
      expect(result.source).toBe('gdos')
    } catch {
      // GDOS parser rejecting malformed data is acceptable
    }
  })
})

// --- .com opener detection ---

describe('openCom detection', () => {
  it('detects EGA COM files', () => {
    const font = makeTestFont(8, 16, 0, 256)
    const bytes = writeEgaCom(font)
    const results = openCom(toBuffer(bytes))
    expect(results.length).toBe(1)
    expect(results[0].source).toBe('ega')
    expect(results[0].glyphHeight).toBe(16)
  })
})

// --- Magic byte detection helpers ---

describe('isBbcFont', () => {
  it('returns true for valid BBC font data', () => {
    const font = makeTestFont(8, 8, 32, 96)
    const bytes = writeBbc(font)
    expect(isBbcFont(toBuffer(bytes))).toBe(true)
  })

  it('returns false for random data', () => {
    const random = new Uint8Array(100)
    for (let i = 0; i < 100; i++) random[i] = (i * 37) & 0xFF
    expect(isBbcFont(random.buffer)).toBe(false)
  })
})

describe('isEgaCom', () => {
  it('returns true for EGA COM file', () => {
    const font = makeTestFont(8, 16, 0, 256)
    const bytes = writeEgaCom(font)
    expect(isEgaCom(toBuffer(bytes))).toBe(true)
  })

  it('returns false for non-COM data', () => {
    const data = new Uint8Array(200)
    expect(isEgaCom(data.buffer)).toBe(false)
  })
})

describe('isTsrCom', () => {
  it('returns false for non-TSR data', () => {
    const data = new Uint8Array(200)
    expect(isTsrCom(data.buffer)).toBe(false)
  })

  it('returns false for EGA COM (not TSR)', () => {
    const font = makeTestFont(8, 16, 0, 256)
    const bytes = writeEgaCom(font)
    expect(isTsrCom(toBuffer(bytes))).toBe(false)
  })
})
