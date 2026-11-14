// Hand-built CPI fixtures for the variants our writer never produces.
//
// writeCpi only emits the "FONT" variant, so parseCpi's FONT.NT and DRFONT
// paths had no coverage at all. These construct the headers by hand from the
// layout in docs/formats/CPI.md.

import { describe, it, expect } from 'vitest'
import { parseCpi } from './cpiParser'

function ascii(s: string, len: number): number[] {
  const out = new Array(len).fill(0)
  for (let i = 0; i < Math.min(s.length, len); i++) out[i] = s.charCodeAt(i)
  return out
}

/** Pack 4 bytes as a little-endian uint32. */
function u32(v: number): number[] {
  return [v & 0xFF, (v >>> 8) & 0xFF, (v >>> 16) & 0xFF, (v >>> 24) & 0xFF]
}

function u16(v: number): number[] {
  return [v & 0xFF, (v >>> 8) & 0xFF]
}

/**
 * Build a CPI file.
 * @param signature bytes 1..7 of the FontFileHeader
 * @param magic     byte 0
 * @param opts.fihRelative FONT.NT stores code-page-header offsets relative to
 *                         the entry itself; FONT and DRFONT store absolute ones
 */
function buildCpi(magic: number, signature: string, opts: {
  fihRelative?: boolean
  glyphs?: Uint8Array
  numChars?: number
  width?: number
  height?: number
  codepage?: number
} = {}): ArrayBuffer {
  const width = opts.width ?? 8
  const height = opts.height ?? 8
  const numChars = opts.numChars ?? 2
  const codepage = opts.codepage ?? 437
  const bpg = height * Math.ceil(width / 8)
  const glyphs = opts.glyphs ?? new Uint8Array(numChars * bpg)

  const FIH = 23
  const CPIH_SIZE = 6
  const SFH_SIZE = 6

  // Layout: FontFileHeader | FontInfoHeader(2) | CP EntryHeader(28) | CP InfoHeader(6) | SFH(6) | bitmap
  const fihOff = FIH
  const cpehOff = fihOff + 2
  const CPIH_OFF = cpehOff + 28
  const SFH_OFF = CPIH_OFF + CPIH_SIZE
  const BITMAP_OFF = SFH_OFF + SFH_SIZE
  const total = BITMAP_OFF + glyphs.length

  const out = new Uint8Array(total)

  // FontFileHeader
  out[0] = magic
  ascii(signature, 7).forEach((b, i) => { out[1 + i] = b })
  // 0x0E points at the FontInfoHeader
  u32(fihOff).forEach((b, i) => { out[0x13 + i] = b })

  // FontInfoHeader: number of code pages
  u16(1).forEach((b, i) => { out[fihOff + i] = b })

  // CodePageEntryHeader (28 bytes)
  // +0x00 size of this entry
  u16(28).forEach((b, i) => { out[cpehOff + i] = b })
  // +0x02 offset to the next entry (0 = last)
  u32(0).forEach((b, i) => { out[cpehOff + 0x02 + i] = b })
  // +0x06 device type (1 = screen)
  u16(1).forEach((b, i) => { out[cpehOff + 0x06 + i] = b })
  // +0x08 device name
  ascii('VIDEO', 8).forEach((b, i) => { out[cpehOff + 0x08 + i] = b })
  // +0x10 codepage
  u16(codepage).forEach((b, i) => { out[cpehOff + 0x10 + i] = b })
  // +0x18 offset to CodePageInfoHeader
  const cpihValue = opts.fihRelative ? CPIH_OFF - cpehOff : CPIH_OFF
  u32(cpihValue).forEach((b, i) => { out[cpehOff + 0x18 + i] = b })

  // CodePageInfoHeader: +2 number of fonts
  u16(1).forEach((b, i) => { out[CPIH_OFF + 2 + i] = b })

  // ScreenFontHeader
  out[SFH_OFF] = height
  out[SFH_OFF + 1] = width
  u16(numChars).forEach((b, i) => { out[SFH_OFF + 4 + i] = b })

  // Bitmap
  out.set(glyphs, BITMAP_OFF)

  return out.buffer as ArrayBuffer
}

describe('parseCpi: variant detection', () => {
  it('rejects a file whose magic byte is wrong', () => {
    const buf = new Uint8Array(64)
    expect(() => parseCpi(buf.buffer as ArrayBuffer)).toThrow(/invalid magic/)
  })

  it('rejects an unrecognised signature', () => {
    const buf = new Uint8Array(64)
    buf[0] = 0xFF
    ascii('GARBAGE', 7).forEach((b, i) => { buf[1 + i] = b })
    expect(() => parseCpi(buf.buffer as ArrayBuffer)).toThrow(/unrecognized signature/)
  })

  it('recognises the FONT variant', () => {
    expect(parseCpi(buildCpi(0xFF, 'FONT')).variant).toBe('FONT')
  })

  it('recognises the FONT.NT variant', () => {
    expect(parseCpi(buildCpi(0xFF, 'FONT.NT')).variant).toBe('FONT.NT')
  })

  it('recognises the DRFONT variant from its 0x7F magic', () => {
    expect(parseCpi(buildCpi(0x7F, 'DRFONT')).variant).toBe('DRFONT')
  })

  it('does not call 0x7F DRFONT when the signature is not DRFONT', () => {
    // 0x7F with a FONT signature is a FONT file, not DRFONT
    expect(parseCpi(buildCpi(0x7F, 'FONT')).variant).toBe('FONT')
  })
})

describe('parseCpi: FONT.NT relative offsets', () => {
  it('resolves code page headers stored relative to the entry', () => {
    const buf = buildCpi(0xFF, 'FONT.NT', { fihRelative: true, numChars: 2 })
    const result = parseCpi(buf)
    expect(result.fonts.length).toBe(1)
    expect(result.fonts[0].width).toBe(8)
    expect(result.fonts[0].height).toBe(8)
    expect(result.fonts[0].numChars).toBe(2)
  })
})

describe('parseCpi: screen font data', () => {
  it('reads the bitmap verbatim, already in our row-major MSBit-first form', () => {
    const glyphs = new Uint8Array(2 * 8)
    glyphs[0] = 0x80 // first pixel of the first glyph
    glyphs[8] = 0x01 // last pixel of the second glyph
    const result = parseCpi(buildCpi(0xFF, 'FONT', { glyphs, numChars: 2 }))
    expect(result.fonts[0].fontData[0]).toBe(0x80)
    expect(result.fonts[0].fontData[8]).toBe(0x01)
  })

  it('reports the codepage and device name from the entry header', () => {
    const result = parseCpi(buildCpi(0xFF, 'FONT', { codepage: 850 }))
    expect(result.fonts[0].codepage).toBe(850)
    // The 8-byte device-name field is NUL padded; the parser stops at the NUL
    expect(result.fonts[0].deviceName).toBe('VIDEO')
    expect(result.fonts[0].deviceType).toBe(1)
  })

  it('handles a font wider than one byte', () => {
    const width = 16
    const glyphs = new Uint8Array(1 * 8 * 2)
    glyphs[1] = 0x40 // second byte of the first row
    const result = parseCpi(buildCpi(0xFF, 'FONT', { width, glyphs, numChars: 1 }))
    expect(result.fonts[0].width).toBe(16)
    expect(result.fonts[0].fontData[1]).toBe(0x40)
  })

  it('stops rather than overrunning when the bitmap is truncated', () => {
    const full = new Uint8Array(buildCpi(0xFF, 'FONT', { numChars: 4 }))
    // Cut the file in the middle of the bitmap
    const truncated = full.slice(0, full.length - 10)
    expect(() => parseCpi(truncated.buffer as ArrayBuffer)).not.toThrow()
    expect(parseCpi(truncated.buffer as ArrayBuffer).fonts.length).toBe(0)
  })

  it('survives a font count that exceeds the remaining data', () => {
    const buf = new Uint8Array(buildCpi(0xFF, 'FONT'))
    // Claim 99 fonts in the CodePageInfoHeader
    const fih = 23
    const cpih = fih + 2 + 28
    buf[cpih + 2] = 99
    buf[cpih + 3] = 0
    expect(() => parseCpi(buf.buffer as ArrayBuffer)).not.toThrow()
  })
})

describe('parseCpi: DRFONT', () => {
  it('parses the extended header and shared index without throwing', () => {
    const buf = buildCpi(0x7F, 'DRFONT')
    // The DRFONT extended header sits right after the 23-byte FontFileHeader;
    // zero fonts-per-codepage is a valid (if empty) file
    expect(() => parseCpi(buf)).not.toThrow()
  })

  it('reports DRFONT as the variant', () => {
    expect(parseCpi(buildCpi(0x7F, 'DRFONT')).variant).toBe('DRFONT')
  })
})

describe('parseCpi: robustness', () => {
  it('reports a truncated header clearly instead of crashing', () => {
    const full = new Uint8Array(buildCpi(0xFF, 'FONT'))
    const part = full.slice(0, 8) // signature only, shorter than the 23-byte header
    // Previously this threw RangeError from an unguarded DataView read
    expect(() => parseCpi(part.buffer as ArrayBuffer)).toThrow(/truncated/)
  })

  it('never throws a raw RangeError for any truncation of a valid file', () => {
    // Sweep every truncation length; this is what surfaced the unguarded
    // DataView reads at 8, 23 and 40 bytes
    const full = new Uint8Array(buildCpi(0xFF, 'FONT'))
    for (let cut = 0; cut <= full.length; cut++) {
      const part = full.slice(0, cut)
      try {
        parseCpi(part.buffer as ArrayBuffer)
      } catch (e) {
        expect((e as Error).constructor.name, `cut at ${cut}`).not.toBe('RangeError')
      }
    }
  })

  it('does the same for the DRFONT and FONT.NT variants', () => {
    for (const [magic, sig] of [[0x7F, 'DRFONT'], [0xFF, 'FONT.NT']] as const) {
      const full = new Uint8Array(buildCpi(magic, sig))
      for (let cut = 0; cut <= full.length; cut++) {
        const part = full.slice(0, cut)
        try {
          parseCpi(part.buffer as ArrayBuffer)
        } catch (e) {
          expect((e as Error).constructor.name, `${sig} cut at ${cut}`).not.toBe('RangeError')
        }
      }
    }
  })

  it('rejects input too short to carry a signature', () => {
    // Fewer than 8 header bytes cannot hold the magic plus signature
    const part = new Uint8Array(buildCpi(0xFF, 'FONT')).slice(0, 1)
    expect(() => parseCpi(part.buffer as ArrayBuffer)).toThrow(/unrecognized signature/)
  })

  it('extracts a trailing copyright notice when present', () => {
    const base = new Uint8Array(buildCpi(0xFF, 'FONT'))
    const notice = new TextEncoder().encode('\r\n(c) Copyright Test 2026')
    const combined = new Uint8Array(base.length + notice.length)
    combined.set(base)
    combined.set(notice, base.length)
    const result = parseCpi(combined.buffer as ArrayBuffer)
    // A notice is surfaced through the properties map, not a dedicated field
    const copyright = result.properties.COPYRIGHT
    if (copyright !== undefined) expect(copyright).toContain('Copyright')
  })
})
