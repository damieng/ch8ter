import { describe, it, expect, beforeEach, vi } from 'vitest'

// Fonts are given fresh ids (font-1..n) on every reload, so layouts and
// previews saved under the previous session's ids must follow them.
describe('restoring state from localStorage', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.resetModules()
  })

  function font(id: string, name: string) {
    return {
      id, fileName: name, startChar: 32, glyphWidth: 8, glyphHeight: 8,
      fontData: btoa(String.fromCharCode(...new Uint8Array(8))),
    }
  }

  it('maps saved layouts, focus and previews onto the restored fonts', async () => {
    // Previous session: font-1 was closed, so only font-2 and font-3 remain
    localStorage.setItem('ch8ter-fonts', JSON.stringify([font('font-2', 'b.bin'), font('font-3', 'c.bin')]))
    localStorage.setItem('ch8ter-layout', JSON.stringify({
      windows: {
        'grid-font-1': { x: 1, y: 1, w: 1, h: 1, minimized: true }, // closed font: must not reappear
        'grid-font-2': { x: 20, y: 21, w: 300, h: 200 },
        'grid-font-3': { x: 30, y: 31, w: 300, h: 200, minimized: true, iconX: 9, iconY: 8 },
        'editor-font-3-4': { x: 5, y: 5, w: 1, h: 1 },
        ch8ter: { x: 2, y: 3, w: 0, h: 0 },
      },
      previews: [{ id: 'preview-1', fontId: 'font-3', selectedFontId: 'font-2' }],
      focusedId: 'grid-font-3',
    }))

    const store = await import('./store')
    const [b, c] = store.fonts.value
    expect([b.fileName.value, c.fileName.value]).toEqual(['b.bin', 'c.bin'])
    expect(b.id).toBe('font-1')

    const w = store.windowLayouts.value
    expect(w['grid-font-1']).toMatchObject({ x: 20, y: 21 })
    expect(w['grid-font-2']).toMatchObject({ x: 30, y: 31, minimized: true, iconX: 9 })
    expect(w['grid-font-3']).toBeUndefined()
    expect(w['editor-font-3-4']).toBeUndefined()
    expect(w['ch8ter']).toMatchObject({ x: 2, y: 3 })
    expect(store.storedFocusedId.value).toBe('grid-font-2')
    expect(store.storedPreviews.value[0]).toMatchObject({ fontId: 'font-2', selectedFontId: 'font-1' })
  })
})
