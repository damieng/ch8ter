// Coverage for the .com dispatch and the EGA/VGA and CP/M parsers.
//
// A .com file can be three quite different things, and the opener guesses from
// the bytes: a PC Magazine / Mefford TSR loader, an EGA/VGA loader, or a plain
// CP/M Plus font with a 512-byte PSF2AMS header.

import { describe, it, expect } from 'vitest'
import { openCom } from './comOpener'
import { isEgaCom, parseEgaCom } from './egaComParser'
import { isTsrCom, parseTsrCom } from './tsrComParser'
import { parseCpm } from './cpmParser'

/** A copy of these bytes, typed as a plain ArrayBuffer for the parsers. */
function buf(u8: Uint8Array): ArrayBuffer {
  return u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength) as ArrayBuffer
}

/** A CP/M Plus font: 512-byte header with height at 0x2F, then 256 glyphs. */
function makeCpm(height = 8): Uint8Array {
  const out = new Uint8Array(512 + 256 * height)
  out[0x2F] = height
  // Give 'A' some ink so it is a plausible font
  const a = 512 + 65 * height
  for (let r = 0; r < height; r++) out[a + r] = 0xFF
  return out
}

/**
 * An EGA/VGA loader: a COM stub containing the INT 10h function-11 call
 * pattern, with the font bitmap somewhere after it.
 */
function makeEga(height = 14): Uint8Array {
  const fontOffset = 0x200
  const total = fontOffset + 256 * height
  const out = new Uint8Array(total)

  // JMP short at the start, as real loaders have
  out[0] = 0xE9
  // isEgaCom requires "font" in the version string within the first 80 bytes
  const banner = new TextEncoder().encode('EGA font loader')
  out.set(banner, 3)

  // MOV AX, 1110h  ->  B8 10 11
  out[0x10] = 0xB8
  out[0x11] = 0x10
  out[0x12] = 0x11
  // MOV BH, height ->  BB xx HH
  out[0x14] = 0xBB
  out[0x15] = 0x00
  out[0x16] = height
  // MOV BP, fontOffset+0x100 -> BD lo hi
  const bp = fontOffset + 0x100
  out[0x18] = 0xBD
  out[0x19] = bp & 0xFF
  out[0x1A] = (bp >> 8) & 0xFF
  // INT 10h -> CD 10
  out[0x1C] = 0xCD
  out[0x1D] = 0x10

  // Font bitmap: space blank, 'A' and 'B' inked
  const a = fontOffset + 65 * height
  const b = fontOffset + 66 * height
  for (let r = 0; r < height; r++) {
    out[a + r] = 0xFF
    out[b + r] = 0x0F
  }
  return out
}

describe('parseCpm', () => {
  it('reads the height from the header and the glyphs after it', () => {
    const parsed = parseCpm(buf(makeCpm(8)))
    expect(parsed.glyphHeight).toBe(8)
    expect(parsed.fontData.length).toBe(256 * 8)
  })

  it('supports a taller font', () => {
    expect(parseCpm(buf(makeCpm(16))).glyphHeight).toBe(16)
  })

  it('rejects a file smaller than the 512-byte header', () => {
    expect(() => parseCpm(buf(new Uint8Array(100)))).toThrow(/too small/)
  })

  it('rejects an implausible glyph height', () => {
    const bad = makeCpm(8)
    bad[0x2F] = 0
    expect(() => parseCpm(buf(bad))).toThrow(/Unexpected glyph height/)

    const huge = makeCpm(8)
    huge[0x2F] = 65
    expect(() => parseCpm(buf(huge))).toThrow(/Unexpected glyph height/)
  })

  it('rejects a file too short for the declared height', () => {
    const short = new Uint8Array(600)
    short[0x2F] = 16 // needs 512 + 4096 bytes
    expect(() => parseCpm(buf(short))).toThrow(/too small for 16px font/)
  })
})

describe('isEgaCom / parseEgaCom', () => {
  it('recognises an EGA loader by its INT 10h function-11 pattern', () => {
    expect(isEgaCom(buf(makeEga(14)))).toBe(true)
  })

  it('rejects a plain CP/M font', () => {
    expect(isEgaCom(buf(makeCpm(8)))).toBe(false)
  })

  it('rejects a buffer too short to contain the pattern', () => {
    expect(isEgaCom(buf(new Uint8Array(10)))).toBe(false)
  })

  it('extracts the font and its height', () => {
    const parsed = parseEgaCom(buf(makeEga(14)))
    expect(parsed.glyphHeight).toBe(14)
    expect(parsed.fontData.length).toBe(256 * 14)
  })

  it('finds the bitmap through the fallback scan when the stub is absent', () => {
    // No INT 10h pattern, but a plausible bitmap: a blank space glyph plus
    // inked 'A' and 'B'. The scan tries 16, 14 then 8 and takes the first
    // self-consistent size, so just require it to find one.
    const height = 16
    const out = new Uint8Array(256 * height)
    for (let r = 0; r < height; r++) {
      out[65 * height + r] = 0xFF
      out[66 * height + r] = 0xFF
    }
    const parsed = parseEgaCom(buf(out))
    expect(parsed.fontData.length).toBe(256 * parsed.glyphHeight)
    expect([8, 14, 16]).toContain(parsed.glyphHeight)
  })

  it('throws when there is no plausible font anywhere', () => {
    // All zeroes has a blank space but no inked 'A'/'B', so nothing matches
    const zeros = new Uint8Array(4096)
    expect(() => parseEgaCom(buf(zeros))).toThrow(/Cannot determine font height/)
  })
})

describe('isTsrCom', () => {
  it('requires a jump instruction at the start', () => {
    const loader = new Uint8Array(300)
    loader.set(new TextEncoder().encode('PC Magazine'), 2)
    expect(isTsrCom(buf(loader))).toBe(false)
  })

  it('recognises a Magazine loader', () => {
    const loader = new Uint8Array(300)
    loader[0] = 0xE9
    loader.set(new TextEncoder().encode('PC Magazine FONT'), 2)
    expect(isTsrCom(buf(loader))).toBe(true)
  })

  it('recognises a Mefford loader', () => {
    const loader = new Uint8Array(300)
    loader[0] = 0xEB
    loader.set(new TextEncoder().encode('Mefford'), 2)
    expect(isTsrCom(buf(loader))).toBe(true)
  })

  it('ignores a short buffer', () => {
    const loader = new Uint8Array(100)
    loader[0] = 0xE9
    loader.set(new TextEncoder().encode('PC Magazine'), 2)
    expect(isTsrCom(buf(loader))).toBe(false)
  })

  it('reports no fonts when the loader holds none', () => {
    const loader = new Uint8Array(300)
    loader[0] = 0xE9
    loader.set(new TextEncoder().encode('Mefford'), 2)
    expect(() => parseTsrCom(buf(loader))).toThrow(/No valid font data/)
  })
})

describe('openCom dispatch', () => {
  it('reports a CP/M font with the right shape', () => {
    const [result] = openCom(buf(makeCpm(8)))
    expect(result.source).toBe('cpm')
    expect(result.glyphHeight).toBe(8)
    expect(result.glyphWidth).toBe(8)
    expect(result.startChar).toBe(0)
  })

  it('reports an EGA font with the right shape', () => {
    const [result] = openCom(buf(makeEga(14)))
    expect(result.source).toBe('ega')
    expect(result.glyphHeight).toBe(14)
  })

  it('checks the TSR heuristic before the EGA one', () => {
    // Precedence, without needing a file that satisfies both scanners: a TSR
    // banner makes isTsrCom true, and openCom consults it first
    const loader = new Uint8Array(1000)
    loader[0] = 0xEB
    loader.set(new TextEncoder().encode('PC Magazine font'), 3)
    expect(isTsrCom(buf(loader))).toBe(true)
    expect(isEgaCom(buf(loader))).toBe(false)
    // ...so it takes the TSR route, which then reports it has no font data
    expect(() => openCom(buf(loader))).toThrow(/No valid font data/)
  })

  it('reports no EGA source for a plain CP/M font', () => {
    expect(openCom(buf(makeCpm(8)))[0].source).toBe('cpm')
  })

  it('always returns at least one entry', () => {
    expect(openCom(buf(makeCpm(8))).length).toBeGreaterThanOrEqual(1)
  })
})
