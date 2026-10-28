import { describe, it, expect, beforeEach } from 'vitest'
import {
  activeFontId, addFont, charset, createFont, glyphCount, removeAllFonts, switchCharset,
  removeAllFontsAndContainers, fonts,
  exportWorkspace, importWorkspace, addContainer, createContainerId, containers,
  previews, windowLayouts, updateWindowLayout, openPreview,
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
