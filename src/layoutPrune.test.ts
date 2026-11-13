import { describe, it, expect, beforeEach } from 'vitest'
import {
  windowLayouts, updateWindowLayout, createFont, addFont, fonts, removeFont, removeAllFonts,
  openGlyphEditor, openNewGlyphEditor, closePinnedEditor, openPreview, closePreview,
  addContainer, removeContainer, createContainerId, minimizeWindow,
} from './store'

describe('window layouts are forgotten when their window goes away', () => {
  beforeEach(() => {
    removeAllFonts()
    windowLayouts.value = {}
  })

  function openWithWindows() {
    const f = createFont(new Uint8Array(8), 'x.bin', 32, 8, 8)
    addFont(f)
    updateWindowLayout(`grid-${f.id}`, { x: 1, y: 2, w: 3, h: 4 })
    updateWindowLayout(`editor-${f.id}`, { x: 1, y: 2, w: 3, h: 4 })
    return f
  }

  it('removeFont drops the grid, editor and extra editor layouts but not other fonts\'', () => {
    const a = openWithWindows()
    const b = openWithWindows()
    openGlyphEditor(a)
    openNewGlyphEditor(a, 1, true)
    minimizeWindow(`grid-${a.id}`)
    removeFont(a.id)
    expect(Object.keys(windowLayouts.value).filter(k => k.includes(a.id))).toEqual([])
    expect(windowLayouts.value[`grid-${b.id}`]).toBeDefined()
    expect(windowLayouts.value[`editor-${b.id}`]).toBeDefined()
  })

  it('does not confuse font-1 with font-10', () => {
    updateWindowLayout('grid-font-10', { x: 1, y: 1, w: 1, h: 1 })
    updateWindowLayout('editor-font-10-2', { x: 1, y: 1, w: 1, h: 1 })
    const f = createFont()
    Object.defineProperty(f, 'id', { value: 'font-1' })
    fonts.value = [f]
    removeFont('font-1')
    expect(windowLayouts.value['grid-font-10']).toBeDefined()
    expect(windowLayouts.value['editor-font-10-2']).toBeDefined()
  })

  it('removeAllFonts drops every font window layout but keeps the app pane', () => {
    openWithWindows()
    openWithWindows()
    updateWindowLayout('ch8ter', { x: 5, y: 5, w: 0, h: 0 })
    removeAllFonts()
    expect(Object.keys(windowLayouts.value)).toEqual(['ch8ter'])
  })

  it('closing a pinned editor drops its layout', () => {
    const f = openWithWindows()
    openGlyphEditor(f)
    updateWindowLayout(f.trackerId.value, { x: 1, y: 1, w: 1, h: 1 })
    const pinnedId = f.trackerId.value
    openNewGlyphEditor(f, 2, true)
    closePinnedEditor(f, pinnedId)
    expect(windowLayouts.value[pinnedId]).toBeUndefined()
  })

  it('closing a preview or a container drops its layout, and its fonts\'', () => {
    const f = openWithWindows()
    openPreview(f.id)
    updateWindowLayout('preview-99', { x: 1, y: 1, w: 1, h: 1 })
    closePreview('preview-99')
    expect(windowLayouts.value['preview-99']).toBeUndefined()

    const cid = createContainerId()
    addContainer({ id: cid, fileName: 'c.cvt', format: 't', meta: null, fonts: [] })
    f.sourceContainerId = cid
    updateWindowLayout(`container-${cid}`, { x: 1, y: 1, w: 1, h: 1 })
    removeContainer(cid)
    expect(windowLayouts.value[`container-${cid}`]).toBeUndefined()
    expect(windowLayouts.value[`grid-${f.id}`]).toBeUndefined()
  })
})
