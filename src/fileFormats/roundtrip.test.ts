// Round-trip tests: write a font in format X, parse it back, verify glyph data matches.

import { describe, it, expect } from 'vitest'
import { bpr, getBit, setBit } from '../bitUtils'
import type { FontWriteData } from '../fontSave'

// --- Parsers ---
import { parseDraw } from './drawParser'
import { parseYaff } from './yaffParser'
import { parseBdf } from './bdfParser'
import { parsePsf } from './psfParser'
import { parseBbc } from './bbcParser'
import { parseFzx } from './fzxParser'
import { parseEgaCom } from './egaComParser'

// --- Writers ---
import { writeDraw } from './drawWriter'
import { writeYaff } from './yaffWriter'
import { writeBdf } from './bdfWriter'
import { writePsf } from './psfWriter'
import { writeBbc } from './bbcWriter'
import { writeFzx } from './fzxWriter'
import { writeEgaCom } from './egaComWriter'

/** Build a simple monospace FontWriteData with a few populated glyphs. */
function makeTestFont(w: number, h: number, startChar: number, glyphCount: number): FontWriteData {
  const rowBytes = bpr(w)
  const bpg = h * rowBytes
  const fontData = new Uint8Array(glyphCount * bpg)

  // Draw a distinct pattern in each glyph: diagonal line from top-left
  for (let i = 0; i < glyphCount; i++) {
    const offset = i * bpg
    for (let y = 0; y < h; y++) {
      const x = (y + i) % w
      setBit(fontData, offset + y * rowBytes, x)
    }
  }

  return {
    fontData,
    glyphWidth: w,
    glyphHeight: h,
    startChar,
    glyphCount,
    baseline: h - 1,
    meta: null,
    glyphMeta: null,
    fontName: 'TestFont',
  }
}

/** Extract glyph pixel data as a flat boolean grid for comparison. */
function extractGlyphPixels(data: Uint8Array, w: number, h: number, glyphIndex: number): boolean[][] {
  const rowBytes = bpr(w)
  const bpg = h * rowBytes
  const offset = glyphIndex * bpg
  const rows: boolean[][] = []
  for (let y = 0; y < h; y++) {
    const row: boolean[] = []
    for (let x = 0; x < w; x++) {
      row.push(getBit(data, offset + y * rowBytes, x))
    }
    rows.push(row)
  }
  return rows
}

/** Compare glyph pixels between two font data arrays. */
function assertGlyphMatch(
  srcData: Uint8Array, srcW: number, srcH: number, srcIdx: number,
  dstData: Uint8Array, dstW: number, dstH: number, dstIdx: number,
  label: string,
) {
  const srcPixels = extractGlyphPixels(srcData, srcW, srcH, srcIdx)
  const dstPixels = extractGlyphPixels(dstData, dstW, dstH, dstIdx)
  for (let y = 0; y < srcH; y++) {
    for (let x = 0; x < srcW; x++) {
      if (x < dstW && y < dstH) {
        expect(dstPixels[y][x], `${label} pixel (${x},${y})`).toBe(srcPixels[y][x])
      }
    }
  }
}

describe('DRAW round-trip', () => {
  it('preserves glyph data for 8x8 font', () => {
    const font = makeTestFont(8, 8, 32, 96)
    const text = writeDraw(font)
    const parsed = parseDraw(text)

    expect(parsed.glyphWidth).toBe(8)
    expect(parsed.glyphHeight).toBe(8)
    expect(parsed.startChar).toBe(32)

    // Check a few glyphs (space is empty, 'A' = index 33, '~' = index 94)
    for (const idx of [1, 33, 50, 94]) {
      assertGlyphMatch(
        font.fontData, 8, 8, idx,
        parsed.fontData, 8, 8, idx,
        `glyph ${idx}`,
      )
    }
  })

  it('preserves glyph data for 6x10 font', () => {
    const font = makeTestFont(6, 10, 32, 16)
    const text = writeDraw(font)
    const parsed = parseDraw(text)

    expect(parsed.glyphWidth).toBe(6)
    expect(parsed.glyphHeight).toBe(10)

    for (let i = 0; i < 16; i++) {
      assertGlyphMatch(
        font.fontData, 6, 10, i,
        parsed.fontData, 6, 10, i,
        `glyph ${i}`,
      )
    }
  })
})

describe('YAFF round-trip', () => {
  it('preserves glyph data for 8x8 font', () => {
    const font = makeTestFont(8, 8, 32, 96)
    const text = writeYaff(font)
    const parsed = parseYaff(text)

    expect(parsed.glyphWidth).toBe(8)
    expect(parsed.glyphHeight).toBe(8)
    expect(parsed.startChar).toBe(32)

    for (const idx of [1, 33, 50, 94]) {
      assertGlyphMatch(
        font.fontData, 8, 8, idx,
        parsed.fontData, 8, 8, idx,
        `glyph ${idx}`,
      )
    }
  })
})

describe('BDF round-trip', () => {
  it('preserves glyph data for 8x16 font', () => {
    const font = makeTestFont(8, 16, 32, 96)
    const text = writeBdf(font)
    const parsed = parseBdf(text)

    expect(parsed.glyphWidth).toBe(8)
    expect(parsed.glyphHeight).toBe(16)

    // BDF uses encodings to map chars; find glyph index for a given encoding
    for (const charCode of [33, 65, 90, 126]) {
      const srcIdx = charCode - font.startChar
      const dstIdx = parsed.encodings.indexOf(charCode)
      expect(dstIdx, `encoding for char ${charCode}`).toBeGreaterThanOrEqual(0)
      assertGlyphMatch(
        font.fontData, 8, 16, srcIdx,
        parsed.fontData, parsed.glyphWidth, parsed.glyphHeight, dstIdx,
        `char ${charCode}`,
      )
    }
  })

  it('round-trips a 12-pixel-wide font', () => {
    const font = makeTestFont(12, 14, 32, 16)
    const text = writeBdf(font)
    const parsed = parseBdf(text)

    expect(parsed.glyphWidth).toBe(12)
    expect(parsed.glyphHeight).toBe(14)

    const charCode = 33
    const srcIdx = charCode - font.startChar
    const dstIdx = parsed.encodings.indexOf(charCode)
    expect(dstIdx).toBeGreaterThanOrEqual(0)
    assertGlyphMatch(
      font.fontData, 12, 14, srcIdx,
      parsed.fontData, 12, 14, dstIdx,
      `char ${charCode}`,
    )
  })
})

describe('PSF round-trip', () => {
  it('preserves glyph data for 8x16 font', () => {
    const font = makeTestFont(8, 16, 32, 96)
    const bytes = writePsf(font)
    const parsed = parsePsf(bytes.buffer)

    expect(parsed.glyphWidth).toBe(8)
    expect(parsed.glyphHeight).toBe(16)

    // PSF writer compacts non-empty glyphs and adds unicode map
    // Re-read via unicodeMap: codepoint -> glyph index in parsed data
    expect(parsed.unicodeMap).not.toBeNull()

    for (const charCode of [33, 65, 90, 126]) {
      const srcIdx = charCode - font.startChar
      const dstGlyphIdx = parsed.unicodeMap!.get(charCode)
      expect(dstGlyphIdx, `unicode map entry for char ${charCode}`).toBeDefined()
      assertGlyphMatch(
        font.fontData, 8, 16, srcIdx,
        parsed.fontData, 8, 16, dstGlyphIdx!,
        `char ${charCode}`,
      )
    }
  })
})

describe('BBC round-trip', () => {
  it('preserves glyph data for 8x8 font', () => {
    // BBC is always 8x8, chars 32-255
    const font = makeTestFont(8, 8, 32, 96)
    const bytes = writeBbc(font)
    const parsed = parseBbc(bytes.buffer)

    expect(parsed.glyphWidth).toBe(8)
    expect(parsed.glyphHeight).toBe(8)
    expect(parsed.startChar).toBe(32)

    // BBC fontData is indexed from startChar, same as input
    for (const idx of [0, 1, 33, 50, 94, 95]) {
      assertGlyphMatch(
        font.fontData, 8, 8, idx,
        parsed.fontData, 8, 8, idx,
        `glyph ${idx}`,
      )
    }
  })
})

describe('EGA COM round-trip', () => {
  it('preserves glyph data for 8x16 font', () => {
    // EGA COM is always 8px wide, 256 glyphs starting at 0
    const font = makeTestFont(8, 16, 0, 256)
    const bytes = writeEgaCom(font)
    const parsed = parseEgaCom(bytes.buffer)

    expect(parsed.glyphWidth).toBe(8)
    expect(parsed.glyphHeight).toBe(16)
    expect(parsed.startChar).toBe(0)

    for (const idx of [0, 32, 65, 128, 255]) {
      assertGlyphMatch(
        font.fontData, 8, 16, idx,
        parsed.fontData, 8, 16, idx,
        `glyph ${idx}`,
      )
    }
  })

  it('preserves glyph data for 8x8 font', () => {
    const font = makeTestFont(8, 8, 0, 256)
    const bytes = writeEgaCom(font)
    const parsed = parseEgaCom(bytes.buffer)

    expect(parsed.glyphHeight).toBe(8)

    for (const idx of [32, 65, 90]) {
      assertGlyphMatch(
        font.fontData, 8, 8, idx,
        parsed.fontData, 8, 8, idx,
        `glyph ${idx}`,
      )
    }
  })
})

describe('FZX round-trip', () => {
  it('preserves glyph data for monospace 8x8 font', () => {
    // FZX always starts at char 32
    const font = makeTestFont(8, 8, 32, 96)
    const bytes = writeFzx(font)
    const parsed = parseFzx(bytes.buffer)

    expect(parsed.glyphHeight).toBe(8)
    expect(parsed.startChar).toBe(32)

    // FZX is proportional — glyphWidth may differ. Check pixel data within the
    // original width for non-empty glyphs.
    for (const idx of [1, 33, 50]) {
      const srcPixels = extractGlyphPixels(font.fontData, 8, 8, idx)
      const dstPixels = extractGlyphPixels(parsed.fontData, parsed.glyphWidth, 8, idx)
      // Verify all set pixels in source appear in dest
      for (let y = 0; y < 8; y++) {
        for (let x = 0; x < 8; x++) {
          if (srcPixels[y][x] && x < parsed.glyphWidth) {
            expect(dstPixels[y][x], `glyph ${idx} pixel (${x},${y})`).toBe(true)
          }
        }
      }
    }
  })
})
