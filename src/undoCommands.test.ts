// Tests for the undo command factories in undoHistory.ts (the UndoHistory
// stack itself is covered separately in undoHistory.test.ts).

import { describe, it, expect } from 'vitest'
import { createFont } from './fontModel'
import { getPixel, setPixel, glyphToText } from './fontOps'
import {
  execClearGlyph, execPasteGlyph, execCopyRange, execSetAdvances,
  execTransformGlyph, execTransformSelection,
  beginPaintStroke, commitPaintStroke, undo, redo,
} from './undoHistory'
import { flipXBytes, invertBytes, rotateCWBytes, shiftRight } from './glyphTransforms'

function makeFont(count = 8, w = 8, h = 8, start = 32) {
  return createFont(new Uint8Array(count * h * Math.ceil(w / 8)), 'test.bin', start, w, h)
}

function fill(f: ReturnType<typeof makeFont>, idx: number, w = 8, h = 8) {
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) setPixel(f, idx, x, y, true)
}

describe('execClearGlyph', () => {
  it('clears the glyph and restores it on undo', () => {
    const f = makeFont()
    fill(f, 2)
    execClearGlyph(f, 2)
    expect(getPixel(f, 2, 0, 0)).toBe(false)

    undo(f)
    expect(getPixel(f, 2, 0, 0)).toBe(true)
    redo(f)
    expect(getPixel(f, 2, 0, 0)).toBe(false)
  })

  it('leaves other glyphs alone', () => {
    const f = makeFont()
    fill(f, 1)
    execClearGlyph(f, 2)
    expect(getPixel(f, 1, 0, 0)).toBe(true)
  })

  it('tracks dirty state back to the saved snapshot', () => {
    const f = makeFont()
    fill(f, 0)
    f.savedSnapshot.value = new Uint8Array(f.fontData.value)
    f.dirty.value = false

    execClearGlyph(f, 0)
    expect(f.dirty.value).toBe(true)
    undo(f)
    expect(f.dirty.value).toBe(false)
  })

  it('drops a stale rotation buffer for the cleared glyph', () => {
    const f = makeFont()
    f.glyphRotationLive.set(2, { data: new Uint8Array(8), w: 8, h: 8 })
    execClearGlyph(f, 2)
    expect(f.glyphRotationLive.has(2)).toBe(false)
  })
})

describe('execPasteGlyph', () => {
  const valid = [
    '**      ',
    ' *      ',
    '  *     ',
    '        ',
    '        ',
    '        ',
    '        ',
    '        ',
  ].join('\r\n')

  it('accepts a well-formed glyph and applies it', () => {
    const f = makeFont()
    expect(execPasteGlyph(f, 0, valid)).toBe(true)
    expect(getPixel(f, 0, 0, 0)).toBe(true)
    expect(getPixel(f, 0, 1, 1)).toBe(true)
    expect(getPixel(f, 0, 2, 2)).toBe(true)
    expect(getPixel(f, 0, 3, 0)).toBe(false)
  })

  it('rejects the wrong number of rows', () => {
    const f = makeFont()
    expect(execPasteGlyph(f, 0, '**\r\n')).toBe(false)
  })

  it('rejects a row of the wrong width', () => {
    const f = makeFont()
    const rows = valid.split('\r\n')
    rows[0] = '***'
    expect(execPasteGlyph(f, 0, rows.join('\r\n'))).toBe(false)
  })

  it('rejects characters other than space and asterisk', () => {
    const f = makeFont()
    const rows = valid.split('\r\n')
    rows[0] = 'XX      '
    expect(execPasteGlyph(f, 0, rows.join('\r\n'))).toBe(false)
  })

  it('accepts LF-only line endings', () => {
    const f = makeFont()
    expect(execPasteGlyph(f, 0, valid.replace(/\r\n/g, '\n'))).toBe(true)
  })

  it('pushes no undo step when the paste is rejected', () => {
    const f = makeFont()
    expect(execPasteGlyph(f, 0, 'bad')).toBe(false)
    expect(undo(f)).toBe(false)
  })

  it('is undoable', () => {
    const f = makeFont()
    execPasteGlyph(f, 0, valid)
    undo(f)
    expect(getPixel(f, 0, 0, 0)).toBe(false)
  })

  it('matches the glyph dimensions rather than assuming 8x8', () => {
    const f = makeFont(4, 4, 2)
    expect(execPasteGlyph(f, 0, '*** \r\n ***')).toBe(true)
    expect(getPixel(f, 0, 0, 0)).toBe(true)
  })
})

describe('execCopyRange', () => {
  it('copies glyphs to a destination offset', () => {
    const f = makeFont(8, 8, 8, 32)
    fill(f, 0)
    execCopyRange(f, 32, 33, 36, 'Copy')
    expect(getPixel(f, 4, 0, 0)).toBe(true)
  })

  it('is undoable', () => {
    const f = makeFont()
    fill(f, 0)
    execCopyRange(f, 32, 33, 36, 'Copy')
    undo(f)
    expect(getPixel(f, 4, 0, 0)).toBe(false)
  })

  it('ignores cells outside the font instead of throwing', () => {
    const f = makeFont(4, 8, 8, 32)
    expect(() => execCopyRange(f, 32, 99, 32, 'Copy')).not.toThrow()
  })

  it('changes nothing when the destination is out of bounds', () => {
    const f = makeFont(4, 8, 8, 32)
    const before = [...f.fontData.value]
    execCopyRange(f, 32, 33, 200, 'Copy')
    expect([...f.fontData.value]).toEqual(before)
  })
})

describe('execSetAdvances', () => {
  it('sets several advances as one undo step', () => {
    const f = makeFont()
    execSetAdvances(f, new Map([[0, 4], [2, 6]]))
    expect(f.glyphMeta.value?.[0]?.dwidth).toEqual([4, 0])
    expect(f.glyphMeta.value?.[2]?.dwidth).toEqual([6, 0])

    undo(f)
    expect(f.glyphMeta.value?.[0] ?? null).toBeNull()
  })

  it('keeps other glyph metadata intact', () => {
    const f = makeFont()
    f.glyphMeta.value = [null, { swidth: [8, 8], dwidth: [1, 0] }, null, null, null, null, null, null]
    execSetAdvances(f, new Map([[1, 9]]))
    expect(f.glyphMeta.value?.[1]?.swidth).toEqual([8, 8])
    expect(f.glyphMeta.value?.[1]?.dwidth).toEqual([9, 0])
  })

  it('marks the font dirty', () => {
    const f = makeFont()
    execSetAdvances(f, new Map([[0, 3]]))
    expect(f.dirty.value).toBe(true)
  })
})

describe('execTransformGlyph', () => {
  it('transforms one glyph and undoes it', () => {
    const f = makeFont()
    setPixel(f, 1, 0, 0, true)
    const before = glyphToText(f, 1)

    execTransformGlyph(f, 1, flipXBytes, 'Flip')
    expect(glyphToText(f, 1)).not.toBe(before)

    undo(f)
    expect(glyphToText(f, 1)).toBe(before)
  })

  it('keeps a live rotation buffer so repeat rotations do not degrade', () => {
    const f = makeFont()
    setPixel(f, 0, 0, 0, true)
    execTransformGlyph(f, 0, rotateCWBytes, 'Rotate')
    expect(f.glyphRotationLive.has(0)).toBe(true)
    undo(f)
    expect(glyphToText(f, 0)).toContain('*')
  })

  it('drops pixels pushed off the right edge', () => {
    const f = makeFont(1, 8, 8)
    setPixel(f, 0, 7, 0, true)
    execTransformGlyph(f, 0, shiftRight, 'Shift')
    expect(getPixel(f, 0, 7, 0)).toBe(false)
  })
})

describe('execTransformSelection', () => {
  it('transforms every selected glyph in one step', () => {
    const f = makeFont()
    setPixel(f, 0, 0, 0, true)
    setPixel(f, 2, 0, 0, true)
    f.selectedGlyphs.value = new Set([0, 2])

    execTransformSelection(f, invertBytes, 'Invert')
    expect(getPixel(f, 0, 0, 0)).toBe(false)
    expect(getPixel(f, 2, 0, 0)).toBe(false)

    undo(f)
    expect(getPixel(f, 0, 0, 0)).toBe(true)
    expect(getPixel(f, 2, 0, 0)).toBe(true)
  })

  it('leaves unselected glyphs alone', () => {
    const f = makeFont()
    setPixel(f, 1, 0, 0, true)
    f.selectedGlyphs.value = new Set([0])
    execTransformSelection(f, invertBytes, 'Invert')
    expect(getPixel(f, 1, 0, 0)).toBe(true)
  })

  it('does not throw on an empty selection', () => {
    const f = makeFont()
    f.selectedGlyphs.value = new Set()
    expect(() => execTransformSelection(f, invertBytes, 'Invert')).not.toThrow()
  })
})

describe('paint strokes', () => {
  it('records one undo step for a stroke of many pixels', () => {
    const f = makeFont()
    beginPaintStroke(f, 0)
    setPixel(f, 0, 0, 0, true)
    setPixel(f, 0, 1, 1, true)
    setPixel(f, 0, 2, 2, true)
    commitPaintStroke(f)

    expect(getPixel(f, 0, 0, 0)).toBe(true)
    undo(f)
    expect(getPixel(f, 0, 0, 0)).toBe(false)
    expect(getPixel(f, 0, 1, 1)).toBe(false)
  })

  it('assigns a fresh array so signal subscribers fire', () => {
    const f = makeFont()
    const before = f.fontData.value
    beginPaintStroke(f, 0)
    setPixel(f, 0, 0, 0, true)
    commitPaintStroke(f)
    expect(f.fontData.value).not.toBe(before)
  })

  it('pushes nothing when the stroke changed no pixels', () => {
    const f = makeFont()
    beginPaintStroke(f, 0)
    commitPaintStroke(f)
    expect(undo(f)).toBe(false)
  })

  it('ignores a commit for a different font', () => {
    const a = makeFont()
    const b = makeFont()
    beginPaintStroke(a, 0)
    setPixel(a, 0, 0, 0, true)
    commitPaintStroke(b) // wrong font
    expect(undo(a)).toBe(false)
  })

  it('ignores a commit with no stroke in progress', () => {
    const f = makeFont()
    expect(() => commitPaintStroke(f)).not.toThrow()
  })

  it('rebases a second stroke on the first', () => {
    const f = makeFont()
    beginPaintStroke(f, 0)
    setPixel(f, 0, 0, 0, true)
    commitPaintStroke(f)

    beginPaintStroke(f, 0)
    setPixel(f, 0, 1, 0, true)
    commitPaintStroke(f)

    expect(getPixel(f, 0, 0, 0)).toBe(true)
    expect(getPixel(f, 0, 1, 0)).toBe(true)
    undo(f)
    expect(getPixel(f, 0, 1, 0)).toBe(false)
    expect(getPixel(f, 0, 0, 0)).toBe(true)
  })
})

describe('undo/redo plumbing', () => {
  it('returns false when there is nothing to undo', () => {
    const f = makeFont()
    expect(undo(f)).toBe(false)
    expect(redo(f)).toBe(false)
  })

  it('unwinds several steps in order', () => {
    const f = makeFont()
    setPixel(f, 0, 0, 0, true)
    setPixel(f, 1, 0, 0, true)
    f.savedSnapshot.value = new Uint8Array(f.fontData.value)

    execClearGlyph(f, 0)
    execClearGlyph(f, 1)
    expect(getPixel(f, 0, 0, 0)).toBe(false)
    expect(getPixel(f, 1, 0, 0)).toBe(false)

    undo(f)
    expect(getPixel(f, 1, 0, 0)).toBe(true)
    expect(getPixel(f, 0, 0, 0)).toBe(false)

    undo(f)
    expect(getPixel(f, 0, 0, 0)).toBe(true)
  })
})
