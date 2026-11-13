import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  createFont, addFont, fonts, windowLayouts, updateWindowLayout, removeAllFontsAndContainers,
  openGlyphEditor, openNewGlyphEditor, exportWorkspace, importWorkspace,
} from './store'

describe('glyph editor windows survive export/import', () => {
  beforeEach(() => {
    removeAllFontsAndContainers()
    windowLayouts.value = {}
  })

  it('restores the open tracker, the pinned editors and their layouts', () => {
    const f = createFont(new Uint8Array(8 * 4), 'e.bin', 32, 8, 8)
    addFont(f)
    openGlyphEditor(f)
    updateWindowLayout(f.trackerId.value, { x: 10, y: 20, w: 380, h: 440 })
    openNewGlyphEditor(f, 2, true) // pins glyph 2, new tracker
    const pinnedId = f.pinnedEditors.value[0].id
    updateWindowLayout(pinnedId, { x: 55, y: 66, w: 300, h: 300 })
    const json = exportWorkspace()

    importWorkspace(json)

    const g = fonts.value[0]
    expect(g.id).not.toBe(f.id)
    expect(g.editorOpen.value).toBe(true)
    expect(g.pinnedEditors.value).toHaveLength(1)
    expect(g.pinnedEditors.value[0].glyph).toBe(2)
    expect(g.pinnedEditors.value[0].id.startsWith(`editor-${g.id}`)).toBe(true)
    expect(windowLayouts.value[g.pinnedEditors.value[0].id]).toMatchObject({ x: 55, y: 66 })
    expect(windowLayouts.value[g.trackerId.value]).toBeDefined()

    // New editors must not reuse an id that was just restored
    openNewGlyphEditor(g, 1, true)
    const ids = [...g.pinnedEditors.value.map(e => e.id), g.trackerId.value]
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('glyph editor windows survive a reload', () => {
  beforeEach(() => { localStorage.clear(); vi.resetModules() })

  it('restores them under the font\'s fresh id', async () => {
    localStorage.setItem('ch8ter-fonts', JSON.stringify([{
      id: 'font-4', fileName: 'r.bin', startChar: 32, glyphWidth: 8, glyphHeight: 8,
      fontData: btoa(String.fromCharCode(...new Uint8Array(32))),
      editorOpen: true, trackerId: 'editor-font-4-3',
      pinnedEditors: [{ id: 'editor-font-4', glyph: 1 }, { id: 'editor-font-4-2', glyph: 3 }],
    }]))
    localStorage.setItem('ch8ter-layout', JSON.stringify({
      windows: {
        'editor-font-4': { x: 1, y: 2, w: 3, h: 4 },
        'editor-font-4-2': { x: 5, y: 6, w: 7, h: 8 },
        'editor-font-4-3': { x: 9, y: 10, w: 11, h: 12 },
        'editor-font-4-9': { x: 0, y: 0, w: 0, h: 0 }, // not saved: must be dropped
      },
      previews: [], focusedId: '',
    }))

    const store = await import('./store')
    const f = store.fonts.value[0]
    expect(f.id).toBe('font-1')
    expect(f.editorOpen.value).toBe(true)
    expect(f.trackerId.value).toBe('editor-font-1-3')
    expect(f.pinnedEditors.value).toEqual([{ id: 'editor-font-1', glyph: 1 }, { id: 'editor-font-1-2', glyph: 3 }])
    const w = store.windowLayouts.value
    expect(w['editor-font-1']).toMatchObject({ x: 1 })
    expect(w['editor-font-1-2']).toMatchObject({ x: 5 })
    expect(w['editor-font-1-3']).toMatchObject({ x: 9 })
    expect(w['editor-font-1-9']).toBeUndefined()

    // The id counter moved past the restored suffixes
    store.openNewGlyphEditor(f, 0, true)
    expect(f.trackerId.value).toBe('editor-font-1-4')
  })
})
