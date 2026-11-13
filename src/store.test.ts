import { describe, it, expect, beforeEach } from 'vitest'
import {
  activeFontId, addFont, charset, createFont, glyphCount, removeAllFonts, switchCharset,
  removeAllFontsAndContainers, fonts,
  exportWorkspace, importWorkspace, addContainer, createContainerId, containers,
  previews, windowLayouts, updateWindowLayout, openPreview,
  openGlyphEditor, openNewGlyphEditor, closePinnedEditor, storedFocusedId, workspaceEpoch, recordGlyphClick, completeGlyphDoubleClick,
} from './store'
import { execSetAdvances } from './undoHistory'

describe('charset switching', () => {
  beforeEach(() => {
    removeAllFonts()
    charset.value = 'cpm'
  })

  it('preserves CP/M glyphs that collide by Unicode and keeps blank trailing slots', () => {
    const data = new Uint8Array(256)
    data[0x30] = 0x30
    data[0x7F] = 0x7F

    const font = createFont(data, 'cpm.bin', 0, 8, 1)
    addFont(font)

    switchCharset('amiga')

    expect(glyphCount(font)).toBe(256)
    expect(font.fontData.value[0x30]).toBe(0x30)
    expect(font.fontData.value[0x7F]).toBe(0x7F)
    expect(font.fontData.value[0xFF]).toBe(0)

    switchCharset('cpm')

    expect(glyphCount(font)).toBe(256)
    expect(font.fontData.value[0x30]).toBe(0x30)
    expect(font.fontData.value[0x7F]).toBe(0x7F)
    expect(font.fontData.value[0xFF]).toBe(0)
    expect(activeFontId.value).toBe(font.id)
  })

  it('remaps every open font when the charset changes', () => {
    const first = createFont(new Uint8Array(256), 'first.bin', 0, 8, 1)
    const second = createFont(new Uint8Array(256), 'second.bin', 0, 8, 1)
    addFont(first)
    addFont(second)

    switchCharset('amiga')

    expect(glyphCount(first)).toBe(256)
    expect(glyphCount(second)).toBe(256)
    expect(first.undoHistory.undo()).toBe(false)
    expect(second.undoHistory.undo()).toBe(false)
  })
})

describe('workspace export/import', () => {
  beforeEach(() => {
    removeAllFontsAndContainers()
    windowLayouts.value = {}
    previews.value = []
  })

  it('round-trips fonts, containers, previews and layout', () => {
    const data = new Uint8Array([1, 2, 3, 4])
    const font = createFont(data, 'proj.bin', 32, 8, 8)
    addFont(font)
    addContainer({
      id: createContainerId(),
      fileName: 'bundle.cvt',
      format: 'test',
      meta: null,
      fonts: [{
        label: '8 pt', codepage: 0, deviceName: '', deviceType: 1,
        startChar: 32, width: 8, height: 8, numChars: 1,
        fontData: new Uint8Array([9, 8, 7, 6, 5, 4, 3, 2]),
      }],
    })
    openPreview(font.id)
    updateWindowLayout('grid-test', { x: 10, y: 20, w: 300, h: 200 })

    const json = exportWorkspace()

    // Wipe everything, then restore
    removeAllFontsAndContainers()
    windowLayouts.value = {}
    previews.value = []
    expect(fonts.value.length).toBe(0)

    importWorkspace(json)

    expect(fonts.value.length).toBe(1)
    expect(fonts.value[0].fileName.value).toBe('proj.bin')
    expect(glyphCount(fonts.value[0])).toBe(1)
    expect([...fonts.value[0].fontData.value.subarray(0, 4)]).toEqual([1, 2, 3, 4])
    expect(fonts.value[0].fontData.value.length).toBe(8) // padded to a whole glyph
    expect(activeFontId.value).toBe(fonts.value[0].id)

    expect(containers.value.length).toBe(1)
    expect(containers.value[0].fileName).toBe('bundle.cvt')
    expect(containers.value[0].fonts[0].fontData[0]).toBe(9)

    expect(previews.value.length).toBe(1)
    expect(previews.value[0].fontId).toBe(fonts.value[0].id)
    expect(windowLayouts.value['grid-test']).toEqual({ x: 10, y: 20, w: 300, h: 200 })

    // New containers must not collide with imported ids
    const newId = createContainerId()
    expect(containers.value.some(c => c.id === newId)).toBe(false)
  })

  it('remaps window layouts and focus to the imported fonts\' fresh ids', () => {
    const a = createFont(new Uint8Array(8), 'a.bin', 32, 8, 8)
    const b = createFont(new Uint8Array(8), 'b.bin', 32, 8, 8)
    addFont(a)
    fonts.value = [a, b]
    updateWindowLayout(`grid-${a.id}`, { x: 11, y: 12, w: 300, h: 200, minimized: true, iconX: 5, iconY: 6 })
    updateWindowLayout(`editor-${b.id}`, { x: 21, y: 22, w: 380, h: 440 })
    updateWindowLayout(`editor-${b.id}-7`, { x: 1, y: 1, w: 1, h: 1 }) // pinned editor: not persisted
    updateWindowLayout('ch8ter', { x: 3, y: 4, w: 0, h: 0 })
    storedFocusedId.value = `grid-${a.id}`
    const json = exportWorkspace()

    // Importing into a session whose id counter has moved on gives fresh ids
    importWorkspace(json)

    const [na, nb] = fonts.value
    expect(na.id).not.toBe(a.id)
    expect(windowLayouts.value[`grid-${na.id}`]).toMatchObject({ x: 11, y: 12, minimized: true, iconX: 5 })
    expect(windowLayouts.value[`editor-${nb.id}`]).toMatchObject({ x: 21, y: 22 })
    expect(windowLayouts.value['ch8ter']).toMatchObject({ x: 3, y: 4 })
    expect(windowLayouts.value[`grid-${a.id}`]).toBeUndefined()
    expect(Object.keys(windowLayouts.value).some(k => /^editor-font-\d+-/.test(k))).toBe(false)
    expect(storedFocusedId.value).toBe(`grid-${na.id}`)
  })

  it('bumps the workspace epoch so the UI remounts its windows', () => {
    addFont(createFont())
    const json = exportWorkspace()
    const before = workspaceEpoch.value
    importWorkspace(json)
    expect(workspaceEpoch.value).toBe(before + 1)
  })

  it('records the codepage and restores it without remapping glyphs', () => {
    const original = charset.value
    try {
      const font = createFont(new Uint8Array([0xAA, 0, 0, 0, 0, 0, 0, 0]), 'cpm.bin', 0, 8, 8)
      addFont(font)
      charset.value = 'cpm'
      const json = exportWorkspace()
      expect(JSON.parse(json).charset).toBe('cpm')

      charset.value = 'zx'
      importWorkspace(json)

      expect(charset.value).toBe('cpm')
      expect(fonts.value[0].startChar.value).toBe(0)
      expect(fonts.value[0].fontData.value[0]).toBe(0xAA)
    } finally {
      charset.value = original
    }
  })

  it('leaves the codepage alone when importing an older file without one', () => {
    const original = charset.value
    try {
      addFont(createFont())
      const file = JSON.parse(exportWorkspace())
      delete file.charset
      charset.value = 'cp437'
      importWorkspace(JSON.stringify(file))
      expect(charset.value).toBe('cp437')
    } finally {
      charset.value = original
    }
  })

  it('rejects JSON that is not a workspace file', () => {
    expect(() => importWorkspace('{"hello":1}')).toThrow('Not a Ch8ter workspace')
    expect(() => importWorkspace('not json at all')).toThrow()
  })
})


describe('execSetAdvances', () => {
  it('sets advances and undoes/redoes as one step', () => {
    removeAllFontsAndContainers()
    const font = createFont(new Uint8Array(64), 'adv.bin', 32, 8, 8)
    addFont(font)

    const updates = new Map<number, number>([[0, 5], [2, 9]])
    execSetAdvances(font, updates)

    expect(font.glyphMeta.value?.[0]?.dwidth).toEqual([5, 0])
    expect(font.glyphMeta.value?.[2]?.dwidth).toEqual([9, 0])
    expect(font.glyphMeta.value?.[1] ?? null).toBeNull()

    font.undoHistory.undo()
    expect(font.glyphMeta.value?.[0] ?? null).toBeNull()

    font.undoHistory.redo()
    expect(font.glyphMeta.value?.[2]?.dwidth).toEqual([9, 0])
  })

  it('preserves other glyph metadata while updating advances', () => {
    removeAllFontsAndContainers()
    const font = createFont(new Uint8Array(32), 'adv.bin', 32, 8, 8)
    addFont(font)
    font.glyphMeta.value = [null, { swidth: [8, 8], dwidth: [4, 0] }, null, null]

    execSetAdvances(font, new Map<number, number>([[1, 7]]))

    expect(font.glyphMeta.value?.[1]?.swidth).toEqual([8, 8])
    expect(font.glyphMeta.value?.[1]?.dwidth).toEqual([7, 0])
  })
})

describe('multiple glyph editors', () => {
  it('double-click pins the old tracker to its glyph and opens a new tracker', () => {
    const font = createFont()
    openGlyphEditor(font)
    const oldId = font.trackerId.value
    updateWindowLayout(oldId, { x: 10, y: 20, w: 380, h: 440 })

    openNewGlyphEditor(font, 3, true)

    expect(font.pinnedEditors.value).toEqual([{ id: oldId, glyph: 3 }])
    expect(font.trackerId.value).not.toBe(oldId)
    expect(font.editorOpen.value).toBe(true)
    expect(windowLayouts.value[font.trackerId.value]).toMatchObject({ x: 40, y: 50 })
  })

  it('double-click with no open tracker just opens one without pinning', () => {
    const font = createFont()
    openNewGlyphEditor(font, 3, false)
    expect(font.pinnedEditors.value).toEqual([])
    expect(font.editorOpen.value).toBe(true)
  })

  it('closePinnedEditor removes only that editor', () => {
    const font = createFont()
    openGlyphEditor(font)
    openNewGlyphEditor(font, 1, true)
    openNewGlyphEditor(font, 2, true)
    const [first, second] = font.pinnedEditors.value
    closePinnedEditor(font, first.id)
    expect(font.pinnedEditors.value).toEqual([second])
  })
})

describe('glyph double-click', () => {
  it('completes from a second press elsewhere only when it is close in time and place', () => {
    const font = createFont()
    openGlyphEditor(font)
    recordGlyphClick(font, 100, 100, 3, true)
    expect(completeGlyphDoubleClick(font, 150, 100)).toBe(false) // far away: a normal click
    expect(font.pinnedEditors.value).toEqual([])
    expect(completeGlyphDoubleClick(font, 102, 99)).toBe(true) // lands on the editor over the tile
    expect(font.pinnedEditors.value.map(e => e.glyph)).toEqual([3])
    expect(completeGlyphDoubleClick(font, 102, 99)).toBe(false) // only once per double-click
  })

  it('ignores a press for a different font', () => {
    const a = createFont()
    const b = createFont()
    openGlyphEditor(a)
    recordGlyphClick(a, 10, 10, 0, true)
    expect(completeGlyphDoubleClick(b, 10, 10)).toBe(false)
  })
})
