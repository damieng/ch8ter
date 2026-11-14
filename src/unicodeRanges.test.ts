import { describe, it, expect } from 'vitest'
import { isFixedWidth, FIXED_WIDTH_RANGES } from './unicodeRanges'

describe('isFixedWidth', () => {
  it('marks box-drawing characters fixed width', () => {
    expect(isFixedWidth(0x2500)).toBe(true) // ─
    expect(isFixedWidth(0x2502)).toBe(true) // │
    expect(isFixedWidth(0x2554)).toBe(true) // ╔
  })

  it('marks block elements fixed width', () => {
    expect(isFixedWidth(0x2588)).toBe(true) // █
    expect(isFixedWidth(0x2591)).toBe(true) // ░
  })

  it('marks legacy computing symbols fixed width', () => {
    expect(isFixedWidth(0x1FB00)).toBe(true)
  })

  it('leaves ordinary letters and digits proportional', () => {
    expect(isFixedWidth(0x41)).toBe(false) // A
    expect(isFixedWidth(0x61)).toBe(false) // a
    expect(isFixedWidth(0x30)).toBe(false) // 0
    expect(isFixedWidth(0x20)).toBe(false) // space
  })

  it('treats the range bounds as inclusive', () => {
    expect(isFixedWidth(0x2500)).toBe(true) // first of Box Drawing
    expect(isFixedWidth(0x257F)).toBe(true) // last of Box Drawing
    expect(isFixedWidth(0x24FF)).toBe(false) // just before Box Drawing
    expect(isFixedWidth(0x2580)).toBe(true) // first of Block Elements
  })

  it('rejects raw byte values from a codepage', () => {
    // 0xC4 is the CP437 slot for U+2500, but the byte itself is not a
    // codepoint in a fixed-width range - callers must map through the codepage
    expect(isFixedWidth(0xC4)).toBe(false)
  })
})

describe('FIXED_WIDTH_RANGES', () => {
  it('has well-formed, non-overlapping ranges', () => {
    const sorted = [...FIXED_WIDTH_RANGES].sort((a, b) => a.start - b.start)
    for (const r of sorted) {
      expect(r.start).toBeLessThanOrEqual(r.end)
      expect(r.name.length).toBeGreaterThan(0)
    }
    for (let i = 1; i < sorted.length; i++) {
      expect(sorted[i].start).toBeGreaterThan(sorted[i - 1].end)
    }
  })

  it('every declared range reports its own endpoints as fixed width', () => {
    for (const r of FIXED_WIDTH_RANGES) {
      expect(isFixedWidth(r.start), `${r.name} start`).toBe(true)
      expect(isFixedWidth(r.end), `${r.name} end`).toBe(true)
    }
  })
})
