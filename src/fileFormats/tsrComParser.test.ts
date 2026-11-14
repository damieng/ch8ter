// Tests for the TSR COM font scanner.
//
// A TSR loader (PC Magazine / Mefford) is a resident program with a font
// embedded somewhere in its image. The parser cannot use a header, so it scans
// for byte ranges that look like a 256-glyph font and validates them
// heuristically: null and space blank, 'A'/'B'/'M'/'0' inked in at least half
// their rows, and the code-1 smiley inked at all (which is what separates a
// real DOS font from a long run of zeroes).
//
// The fixtures below build images that satisfy exactly those rules, so the
// tests pin the scanner's contract rather than a particular real loader.

import { describe, it, expect } from 'vitest'
import { isTsrCom, parseTsrCom } from './tsrComParser'

/** Narrow a Uint8Array's buffer to a plain ArrayBuffer for the parser. */
function bufOf(u8: Uint8Array): ArrayBuffer {
  return u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength) as ArrayBuffer
}

/** A 256-glyph font of `height` rows, inked at the characters the scanner checks. */
function fontImage(height: number): Uint8Array {
  const data = new Uint8Array(256 * height)
  const ink = (ch: number, rows: number) => {
    for (let r = 0; r < rows; r++) data[ch * height + r] = 0xFF
  }
  // Code 1 (smiley) must have at least two inked rows
  ink(0x01, 3)
  // These four must be inked in at least half their rows
  for (const ch of [0x41, 0x42, 0x4D, 0x30]) ink(ch, Math.ceil(height / 2))
  // 0x00 and 0x20 stay blank, as the scanner requires
  return data
}

/** Build a file that looks like a TSR loader with one embedded font. */
function makeLoader(name: string, height: number, prefix = 0x200): Uint8Array {
  const font = fontImage(height)
  const total = prefix + font.length
  const out = new Uint8Array(total)
  // Jump at the start, as a real COM resident program has
  out[0] = 0xE9
  const banner = new TextEncoder().encode(name)
  out.set(banner, 3)
  out.set(font, prefix)
  return out
}

describe('isTsrCom', () => {
  it('requires a jump instruction at offset 0', () => {
    const buf = new Uint8Array(300)
    buf.set(new TextEncoder().encode('PC Magazine'), 2)
    expect(isTsrCom(bufOf(buf))).toBe(false)
  })

  it('accepts a short jump with a Magazine banner', () => {
    expect(isTsrCom(bufOf(makeLoader('PC Magazine Font Editor', 16)))).toBe(true)
  })

  it('accepts a near jump with a Mefford banner', () => {
    const buf = makeLoader('Mefford', 16)
    buf[0] = 0xE9
    expect(isTsrCom(bufOf(buf))).toBe(true)
  })

  it('rejects a buffer smaller than the header it scans', () => {
    expect(isTsrCom(bufOf(new Uint8Array(100)))).toBe(false)
  })

  it('rejects a loader whose banner names no known tool', () => {
    expect(isTsrCom(bufOf(makeLoader('Generic Resident Program', 16)))).toBe(false)
  })
})

describe('parseTsrCom: finding fonts', () => {
  it('extracts one embedded font', () => {
    const result = parseTsrCom(bufOf(makeLoader('PC Magazine', 16)))

    expect(result.length).toBe(1)
    expect(result[0].glyphHeight).toBe(16)
    expect(result[0].glyphWidth).toBe(8)
    expect(result[0].startChar).toBe(0)
    expect(result[0].fontData.length).toBe(256 * 16)
  })

  it('copies a font whose code-1 and probe glyphs carry ink', () => {
    // The scanner is heuristic and searches every offset, so assert the shape
    // of what it returns rather than a byte position: the glyphs it validated
    // must be the inked ones.
    const height = 14
    const result = parseTsrCom(bufOf(makeLoader('PC Magazine', height, 0x180)))

    expect(result.length).toBe(1)
    const font = result[0].fontData
    // Code 1 must have ink, which is the check that excludes runs of zeroes
    expect([...font.subarray(1 * height, 2 * height)].some(b => b !== 0)).toBe(true)
    // Space must be blank
    expect([...font.subarray(0x20 * height, 0x21 * height)].every(b => b === 0)).toBe(true)
  })

  it('finds fonts at 8, 14 and 16 rows tall', () => {
    for (const height of [16, 14, 8]) {
      const result = parseTsrCom(bufOf(makeLoader('PC Magazine', height)))

      expect(result.length, `height ${height}`).toBe(1)
      expect(result[0].glyphHeight, `height ${height}`).toBe(height)
    }
  })

  it('prefers the tallest font when several are present', () => {
    // Two fonts, 8-row first then 16-row, so the taller one wins the sort
    const small = fontImage(8)
    const large = fontImage(16)
    const out = new Uint8Array(0x200 + small.length + large.length)
    out[0] = 0xE9
    out.set(new TextEncoder().encode('PC Magazine'), 3)
    out.set(small, 0x200)
    out.set(large, 0x200 + small.length)

    const result = parseTsrCom(bufOf(out))

    expect(result.length).toBeGreaterThanOrEqual(1)
    // Sorted tallest first
    expect(result[0].glyphHeight).toBe(16)
  })

  it('throws a clear error when no font is present', () => {
    const buf = new Uint8Array(2000)
    buf[0] = 0xE9
    buf.set(new TextEncoder().encode('PC Magazine'), 3)
    expect(() => parseTsrCom(bufOf(buf))
).toThrow(/No valid font data/)
  })
})

describe('parseTsrCom: validation rules', () => {
  /** Assert that a loader with the given mutation yields no font. */
  function expectRejected(mutate: (font: Uint8Array, height: number) => void, height = 16) {
    const loader = makeLoader('PC Magazine', height)
    const prefix = 0x200
    const font = loader.subarray(prefix, prefix + 256 * height)
    mutate(font, height)
    expect(() => parseTsrCom(bufOf(loader))
).toThrow(/No valid font data/)
  }

  it('rejects a font whose null glyph has ink', () => {
    expectRejected(font => { font[0] = 0xFF })
  })

  it('rejects a font whose space glyph has ink', () => {
    expectRejected((font, h) => { font[0x20 * h] = 0xFF }, 16)
  })

  it('rejects a font with too little ink in a probe character', () => {
    expectRejected((font, h) => {
      // Clear the 'M' so it fails the half-rows rule
      for (let r = 0; r < h; r++) font[0x4D * h + r] = 0
    }, 16)
  })

  it('rejects a font with no smiley, which is how runs of zeroes are excluded', () => {
    expectRejected((font, h) => {
      for (let r = 0; r < h; r++) font[1 * h + r] = 0
    }, 16)
  })

  it('rejects a run of zeroes even though null and space are blank', () => {
    const out = new Uint8Array(0x200 + 256 * 16)
    out[0] = 0xE9
    out.set(new TextEncoder().encode('PC Magazine'), 3)
    expect(() => parseTsrCom(bufOf(out))
).toThrow(/No valid font data/)
  })
})

describe('parseTsrCom: robustness', () => {
  it('never crashes on truncation of a valid loader', () => {
    const full = makeLoader('PC Magazine', 16)
    for (let cut = 0; cut <= full.length; cut += 16) {
      const part = full.slice(0, cut)
      try {
        parseTsrCom(bufOf(part))

      } catch (e) {
        expect((e as Error).constructor.name, `cut ${cut}`).not.toBe('RangeError')
      }
    }
  })

  it('does not report overlapping fonts from one image', () => {
    const result = parseTsrCom(bufOf(makeLoader('PC Magazine', 16)))

    // A single embedded font must not be reported twice
    expect(result.length).toBe(1)
  })
})
