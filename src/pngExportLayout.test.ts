// Tests for the PNG exporter's page geometry and settings persistence.
//
// Both were pure logic inside PngExportDialog.tsx, reachable only by rendering
// the dialog with a canvas. Moved to pngExportLayout so the arithmetic and the
// localStorage handling can be checked directly.

import { describe, it, expect, beforeEach } from 'vitest'
import {
  exportLayout, exportGlyphPosition, defaultExportSettings,
  loadExportSettings, saveExportSettings, PNG_EXPORT_STORAGE_KEY,
  type ExportSettings,
} from './pngExportLayout'

/** Settings with a chosen page width, no gaps or border unless stated. */
function settings(over: Partial<ExportSettings> = {}): ExportSettings {
  return {
    ...defaultExportSettings(16),
    gapX: 0, gapY: 0, borderX: 0, borderY: 0,
    ...over,
  }
}

describe('exportLayout: grid', () => {
  it('divides the glyphs into the requested number of columns', () => {
    const l = exportLayout(96, 8, 8, settings({ cols: 16 }))
    expect(l.cols).toBe(16)
    expect(l.rows).toBe(6)
  })

  it('rounds a partial last row up', () => {
    const l = exportLayout(100, 8, 8, settings({ cols: 16 }))
    expect(l.rows).toBe(7)
  })

  it('never asks for more columns than there are glyphs', () => {
    const l = exportLayout(4, 8, 8, settings({ cols: 16 }))
    expect(l.cols).toBe(4)
    expect(l.rows).toBe(1)
  })

  it('uses at least one column, so a small page still works', () => {
    const l = exportLayout(4, 8, 8, settings({ cols: 0 }))
    expect(l.cols).toBe(1)
    expect(l.rows).toBe(4)
  })

  it('produces an empty image for a font with no glyphs', () => {
    const l = exportLayout(0, 8, 8, settings({ cols: 16 }))
    expect(l.rows).toBe(0)
    expect(l.imgW).toBeGreaterThanOrEqual(0)
    expect(l.imgH).toBeGreaterThanOrEqual(0)
    expect(Number.isFinite(l.imgW)).toBe(true)
    expect(Number.isFinite(l.imgH)).toBe(true)
  })
})

describe('exportLayout: image size', () => {
  it('is the cells plus the border, with no trailing gap', () => {
    // 4 cells of 8px, no border, no gap => 32 x 8
    const l = exportLayout(4, 8, 8, settings({ cols: 4 }))
    expect(l.imgW).toBe(32)
    expect(l.imgH).toBe(8)
  })

  it('counts gaps between cells but not after the last one', () => {
    // 4 cells of 8 + 3 gaps of 1 => 35
    const l = exportLayout(4, 8, 8, settings({ cols: 4, gapX: 1, gapY: 1 }))
    expect(l.imgW).toBe(35)
    expect(l.imgH).toBe(8)
  })

  it('counts the border on both sides', () => {
    const l = exportLayout(4, 8, 8, settings({ cols: 4, borderX: 3, borderY: 2 }))
    expect(l.imgW).toBe(32 + 6)
    expect(l.imgH).toBe(8 + 4)
  })

  it('multiplies the cell by the scale', () => {
    const l = exportLayout(4, 8, 8, settings({ cols: 4, scale: 3 }))
    expect(l.imgW).toBe(96)
    expect(l.imgH).toBe(24)
  })

  it('reports the cell pitch including the gap', () => {
    const l = exportLayout(4, 8, 8, settings({ cols: 4, gapX: 2, gapY: 3, scale: 2 }))
    expect(l.cellW).toBe(18) // 8*2 + 2
    expect(l.cellH).toBe(19) // 8*2 + 3
  })

  it('never returns a negative size', () => {
    // A border smaller than the gap would go negative without the clamp
    const l = exportLayout(1, 8, 8, settings({ cols: 1, gapX: 10, borderX: 0 }))
    expect(l.imgW).toBeGreaterThanOrEqual(0)
    expect(l.imgH).toBeGreaterThanOrEqual(0)
  })
})

describe('exportGlyphPosition', () => {
  it('puts the first glyph at the border origin', () => {
    const s = settings({ cols: 4, borderX: 2, borderY: 3 })
    const l = exportLayout(8, 8, 8, s)
    expect(exportGlyphPosition(l, 0, s)).toEqual({ x: 2, y: 3 })
  })

  it('steps across a row by the cell width', () => {
    const s = settings({ cols: 4, gapX: 1 })
    const l = exportLayout(8, 8, 8, s)
    expect(exportGlyphPosition(l, 1, s).x).toBe(l.cellW)
    expect(exportGlyphPosition(l, 3, s).x).toBe(3 * l.cellW)
  })

  it('wraps to the next row after the last column', () => {
    const s = settings({ cols: 4 })
    const l = exportLayout(8, 8, 8, s)
    const pos = exportGlyphPosition(l, 5, s)
    expect(pos.x).toBe(l.cellW)      // second column
    expect(pos.y).toBe(l.cellH)      // second row
  })

  it('keeps every position inside the image', () => {
    const s = settings({ cols: 5, gapX: 1, gapY: 1, borderX: 2, borderY: 2, scale: 2 })
    const l = exportLayout(23, 8, 8, s)
    for (let g = 0; g < 23; g++) {
      const { x, y } = exportGlyphPosition(l, g, s)
      expect(x).toBeGreaterThanOrEqual(0)
      expect(y).toBeGreaterThanOrEqual(0)
      expect(x + 8 * s.scale).toBeLessThanOrEqual(l.imgW)
      expect(y + 8 * s.scale).toBeLessThanOrEqual(l.imgH)
    }
  })
})

describe('settings defaults', () => {
  it('uses the requested page width', () => {
    expect(defaultExportSettings(32).cols).toBe(32)
  })

  it('opaque white background, black ink, 1px gaps and border', () => {
    const d = defaultExportSettings(16)
    expect(d.bg).toBe('#ffffff')
    expect(d.fg).toBe('#000000')
    expect(d.bgTransparent).toBe(false)
    expect(d.gapX).toBe(1)
    expect(d.borderY).toBe(1)
    expect(d.scale).toBe(1)
  })
})

describe('settings persistence', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('round-trips through storage', () => {
    const saved = { ...defaultExportSettings(24), scale: 4, fg: '#123456' }
    saveExportSettings(saved)
    const loaded = loadExportSettings(16)
    expect(loaded.scale).toBe(4)
    expect(loaded.fg).toBe('#123456')
  })

  it('returns defaults when nothing is stored', () => {
    expect(loadExportSettings(32)).toEqual(defaultExportSettings(32))
  })

  it('keeps the caller default width when storage has no cols', () => {
    localStorage.setItem(PNG_EXPORT_STORAGE_KEY, JSON.stringify({ scale: 2 }))
    const loaded = loadExportSettings(48)
    expect(loaded.cols).toBe(48)
    expect(loaded.scale).toBe(2)
  })

  it('fills in settings missing from an older save', () => {
    localStorage.setItem(PNG_EXPORT_STORAGE_KEY, JSON.stringify({ scale: 3 }))
    const loaded = loadExportSettings(16)
    // Everything else falls back to defaults rather than being undefined
    expect(loaded.bg).toBe('#ffffff')
    expect(loaded.gapX).toBe(1)
    expect(loaded.bgTransparent).toBe(false)
  })

  it('ignores unparseable storage', () => {
    localStorage.setItem(PNG_EXPORT_STORAGE_KEY, 'not json at all{')
    expect(loadExportSettings(16)).toEqual(defaultExportSettings(16))
  })

  it('ignores storage holding a non-object', () => {
    localStorage.setItem(PNG_EXPORT_STORAGE_KEY, '"a string"')
    expect(loadExportSettings(16)).toEqual(defaultExportSettings(16))
  })

  it('survives a storage that throws on read', () => {
    const throwing = { getItem: () => { throw new Error('denied') } }
    expect(loadExportSettings(16, throwing)).toEqual(defaultExportSettings(16))
  })

  it('survives a storage that throws on write', () => {
    const throwing = { setItem: () => { throw new Error('quota') } }
    expect(() => saveExportSettings(defaultExportSettings(16), throwing)).not.toThrow()
  })

  it('works with no storage at all, as in the CLI', () => {
    // Passing an explicit undefined-ish store exercises the guard
    expect(() => saveExportSettings(defaultExportSettings(16), {} as never)).not.toThrow()
  })
})
