import { describe, it, expect } from 'vitest'
import { createFont } from './store'
import { invertSelection, selectAll, selectNone } from './selection'

describe('selection commands', () => {
  it('allows an empty selection', () => {
    const font = createFont(new Uint8Array(8 * 3), 'test.ch8', 32, 8, 1)

    selectNone(font)

    expect(font.selectedGlyphs.value.size).toBe(0)
  })

  it('inverts a full selection to empty', () => {
    const font = createFont(new Uint8Array(8 * 3), 'test.ch8', 32, 8, 1)

    selectAll(font)
    invertSelection(font)

    expect(font.selectedGlyphs.value.size).toBe(0)
  })
})
