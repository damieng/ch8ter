import { describe, it, expect, beforeEach } from 'vitest'
import {
  windowLayouts, updateWindowLayout, minimizeWindow, restoreWindow,
  createFont, openGlyphEditor, storedFocusedId, ICON_W,
} from './store'

describe('minimized windows', () => {
  beforeEach(() => { windowLayouts.value = {} })

  it('minimize keeps the window geometry and gives it an icon position', () => {
    updateWindowLayout('grid-a', { x: 10, y: 20, w: 300, h: 200 })
    storedFocusedId.value = 'grid-a'
    minimizeWindow('grid-a')
    const r = windowLayouts.value['grid-a']
    expect(r).toMatchObject({ x: 10, y: 20, w: 300, h: 200, minimized: true })
    expect(r.iconX).toBeTypeOf('number')
    expect(r.iconY).toBeTypeOf('number')
    expect(storedFocusedId.value).not.toBe('grid-a')
  })

  it('places further icons in free slots rather than on top of each other', () => {
    updateWindowLayout('a', { x: 0, y: 0, w: 1, h: 1 })
    updateWindowLayout('b', { x: 0, y: 0, w: 1, h: 1 })
    minimizeWindow('a')
    minimizeWindow('b')
    const a = windowLayouts.value['a']
    const b = windowLayouts.value['b']
    expect(b.iconY).toBe(a.iconY)
    expect(b.iconX! - a.iconX!).toBeGreaterThanOrEqual(ICON_W)
  })

  it('remembers where the icon was dragged to across minimize cycles', () => {
    updateWindowLayout('a', { x: 0, y: 0, w: 1, h: 1 })
    minimizeWindow('a')
    updateWindowLayout('a', { iconX: 400, iconY: 300 })
    restoreWindow('a')
    expect(windowLayouts.value['a'].minimized).toBe(false)
    minimizeWindow('a')
    expect(windowLayouts.value['a']).toMatchObject({ iconX: 400, iconY: 300, minimized: true })
  })

  it('restoreWindow does not create a layout for an unknown window', () => {
    restoreWindow('nope')
    expect(windowLayouts.value['nope']).toBeUndefined()
  })

  it('opening the glyph editor restores a minimized tracking editor', () => {
    const font = createFont()
    updateWindowLayout(font.trackerId.value, { x: 5, y: 5, w: 380, h: 440 })
    minimizeWindow(font.trackerId.value)
    openGlyphEditor(font)
    expect(windowLayouts.value[font.trackerId.value].minimized).toBe(false)
  })
})
