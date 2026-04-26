import { describe, it, expect } from 'vitest'
import { createFont, bytesPerGlyph } from './store'
import { execTransformGlyph, execClearGlyph } from './undoHistory'
import { rotateCWBytes, rotateCCWBytes, flipXBytes } from './glyphTransforms'
import { setBit, bpr as calcBpr } from './bitUtils'

function makeFont(w: number, h: number, glyphCount = 1) {
  const bpg = h * calcBpr(w)
  return createFont(new Uint8Array(glyphCount * bpg), 'test.bin', 0, w, h)
}

function setPixel(data: Uint8Array, w: number, glyphIdx: number, x: number, y: number) {
  const bpr = calcBpr(w)
  const bpg = data.length // assume single-glyph data view; otherwise pass bpg
  setBit(data, glyphIdx * bpg + y * bpr, x)
}

function glyphBytes(font: ReturnType<typeof makeFont>, idx: number) {
  const bpg = bytesPerGlyph(font)
  return font.fontData.value.slice(idx * bpg, (idx + 1) * bpg)
}

describe('execTransformGlyph rotation', () => {
  it('does not change font dimensions', () => {
    const font = makeFont(8, 16)
    // Plant some pixels
    const data = new Uint8Array(font.fontData.value)
    setPixel(data, 8, 0, 0, 0)
    setPixel(data, 8, 0, 7, 15)
    font.fontData.value = data

    execTransformGlyph(font, 0, rotateCWBytes, 'Rotate CW')

    expect(font.glyphWidth.value).toBe(8)
    expect(font.glyphHeight.value).toBe(16)
  })

  it('clips rotated content to fit the existing dimensions', () => {
    const font = makeFont(8, 16)
    // Top row fully on
    const data = new Uint8Array(font.fontData.value)
    const bpr = calcBpr(8)
    for (let x = 0; x < 8; x++) setBit(data, 0, x)
    font.fontData.value = data

    execTransformGlyph(font, 0, rotateCWBytes, 'Rotate CW')

    // After CW rotation the top row becomes the right column at original 8w×16h
    // logical 16w×8h. Clipping top-left to 8×16 keeps only x=0..7, y=0..7.
    // The right column of the unclipped 16×8 buffer is x=15 — outside the clip.
    // So display has no pixels in this clipped region.
    const out = glyphBytes(font, 0)
    let any = false
    for (const b of out) if (b !== 0) { any = true; break }
    expect(any).toBe(false)
    // But the live buffer must hold the full rotated data (16×8).
    const live = font.glyphRotationLive.get(0)!
    expect(live).toBeDefined()
    expect(live.w).toBe(16)
    expect(live.h).toBe(8)
    // Right-most column (x=15) of live should be set in row 0
    const liveBpr = calcBpr(16)
    for (let y = 0; y < 8; y++) {
      const byte = live.data[y * liveBpr + Math.floor(15 / 8)]
      expect((byte >> (7 - (15 % 8))) & 1).toBe(1)
      void bpr
    }
  })

  it('four CW rotations on a non-square glyph restore the original via the live buffer', () => {
    const font = makeFont(8, 16)
    // Fill with a recognisable pattern — set every column at row 0 and column 0
    const data = new Uint8Array(font.fontData.value)
    for (let x = 0; x < 8; x++) setBit(data, 0, x)        // top row
    for (let y = 0; y < 16; y++) setBit(data, y * calcBpr(8), 0) // left column
    font.fontData.value = data
    const original = glyphBytes(font, 0)

    execTransformGlyph(font, 0, rotateCWBytes, 'Rotate CW')
    execTransformGlyph(font, 0, rotateCWBytes, 'Rotate CW')
    execTransformGlyph(font, 0, rotateCWBytes, 'Rotate CW')
    execTransformGlyph(font, 0, rotateCWBytes, 'Rotate CW')

    expect(Array.from(glyphBytes(font, 0))).toEqual(Array.from(original))
  })

  it('CW then CCW restores the original via the live buffer', () => {
    const font = makeFont(8, 16)
    const data = new Uint8Array(font.fontData.value)
    for (let x = 0; x < 8; x++) setBit(data, 0, x)
    for (let y = 0; y < 16; y++) setBit(data, y * calcBpr(8), 0)
    font.fontData.value = data
    const original = glyphBytes(font, 0)

    execTransformGlyph(font, 0, rotateCWBytes, 'Rotate CW')
    execTransformGlyph(font, 0, rotateCCWBytes, 'Rotate CCW')

    expect(Array.from(glyphBytes(font, 0))).toEqual(Array.from(original))
  })

  it('does not affect other glyphs in the font', () => {
    const font = makeFont(8, 16, 3)
    const data = new Uint8Array(font.fontData.value)
    const bpg = bytesPerGlyph(font)
    // Set glyph 1 row 5 col 3
    setBit(data, 1 * bpg + 5 * calcBpr(8), 3)
    font.fontData.value = data
    const before = glyphBytes(font, 1)

    execTransformGlyph(font, 0, rotateCWBytes, 'Rotate CW')

    expect(Array.from(glyphBytes(font, 1))).toEqual(Array.from(before))
  })

  it('non-rotation edits invalidate the live buffer', () => {
    const font = makeFont(8, 16)
    const data = new Uint8Array(font.fontData.value)
    for (let x = 0; x < 8; x++) setBit(data, 0, x)
    font.fontData.value = data

    execTransformGlyph(font, 0, rotateCWBytes, 'Rotate CW')
    expect(font.glyphRotationLive.has(0)).toBe(true)

    execTransformGlyph(font, 0, flipXBytes, 'Flip X')
    expect(font.glyphRotationLive.has(0)).toBe(false)
  })

  it('clear invalidates the live buffer', () => {
    const font = makeFont(8, 16)
    const data = new Uint8Array(font.fontData.value)
    for (let x = 0; x < 8; x++) setBit(data, 0, x)
    font.fontData.value = data

    execTransformGlyph(font, 0, rotateCWBytes, 'Rotate CW')
    expect(font.glyphRotationLive.has(0)).toBe(true)

    execClearGlyph(font, 0)
    expect(font.glyphRotationLive.has(0)).toBe(false)
  })

  it('undo of a rotation restores the prior live state', () => {
    const font = makeFont(8, 16)
    const data = new Uint8Array(font.fontData.value)
    for (let x = 0; x < 8; x++) setBit(data, 0, x)
    font.fontData.value = data

    execTransformGlyph(font, 0, rotateCWBytes, 'Rotate CW')
    expect(font.glyphRotationLive.has(0)).toBe(true)

    font.undoHistory.undo()
    expect(font.glyphRotationLive.has(0)).toBe(false)
  })
})
