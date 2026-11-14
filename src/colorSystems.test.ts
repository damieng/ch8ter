import { describe, it, expect } from 'vitest'
import { COLOR_SYSTEMS } from './colorSystems'
import { CHARSETS } from './charsets'

/**
 * COLOR_SYSTEMS drives the preview renderer's palette picker, and charsets
 * refer to entries by name. A typo in either place silently loses a colour
 * scheme, so assert the shape and the cross-references.
 */
describe('COLOR_SYSTEMS', () => {
  it('is a non-empty list', () => {
    expect(COLOR_SYSTEMS.length).toBeGreaterThan(0)
  })

  it('every entry has a name and a foreground and background colour', () => {
    for (const s of COLOR_SYSTEMS) {
      expect(s.name.length, s.name).toBeGreaterThan(0)
      expect(s.fg, s.name).toMatch(/^#[0-9a-fA-F]{6}$/)
      expect(s.bg, s.name).toMatch(/^#[0-9a-fA-F]{6}$/)
    }
  })

  it('has unique names', () => {
    const names = COLOR_SYSTEMS.map(s => s.name)
    expect(new Set(names).size).toBe(names.length)
  })

  it('gives every palette entry a valid colour', () => {
    for (const s of COLOR_SYSTEMS) {
      for (const c of s.palette ?? []) {
        expect(c, `${s.name} palette`).toMatch(/^#[0-9a-fA-F]{6}$/)
      }
    }
  })

  it('gives every palette at least a few colours, if it has one', () => {
    for (const s of COLOR_SYSTEMS) {
      if (s.palette) expect(s.palette.length, s.name).toBeGreaterThanOrEqual(2)
    }
  })

  it('has no accidental duplicate colours within a palette', () => {
    // Some hardware genuinely repeats a colour (the TMS9918 has two identical
    // greys), so allow a small number of repeats rather than none.
    for (const s of COLOR_SYSTEMS) {
      const p = s.palette
      if (!p) continue
      const unique = new Set(p.map(c => c.toLowerCase())).size
      expect(p.length - unique, `${s.name} duplicates`).toBeLessThanOrEqual(1)
    }
  })

  it('has distinct foreground and background per system', () => {
    for (const s of COLOR_SYSTEMS) {
      expect(s.fg.toLowerCase(), s.name).not.toBe(s.bg.toLowerCase())
    }
  })

  it('includes the systems the codepages reference by name', () => {
    // A charset naming a colour system that does not exist silently falls back
    const names = new Set(COLOR_SYSTEMS.map(s => s.name))
    for (const [key, def] of Object.entries(CHARSETS)) {
      if (!def.colorSystem) continue
      expect(names.has(def.colorSystem), `${key} -> ${def.colorSystem}`).toBe(true)
    }
  })
})
