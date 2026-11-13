import { describe, it, expect } from 'vitest'
import { wrapText, wrapTextProportional, cursorPosition } from './textLayout'
import { glyphCodeForChar } from './charsets'

describe('astral characters are one cell', () => {
  const SMP = '\u{1FB00}' // a Symbols for Legacy Computing block, two UTF-16 units

  it('wrapText counts it as one column and keeps offsets aligned', () => {
    const { lines, offsets } = wrapText(`a${SMP}b`, 3)
    expect(lines).toEqual([`a${SMP}b`]) // 3 cells fit in 3 columns
    expect(offsets[0]).toEqual([0, 1, 3]) // text index of each cell; b follows the pair
    expect(cursorPosition(offsets, 3, 4)).toEqual({ row: 0, col: 2 })
  })

  it('wrapTextProportional measures it once', () => {
    const widths: string[] = []
    wrapTextProportional(`${SMP}x`, 100, ch => { widths.push(ch); return 1 })
    expect(widths).toEqual([SMP, 'x'])
  })

  it('glyphCodeForChar resolves it by code point, not a lone surrogate', () => {
    expect(glyphCodeForChar(SMP, 'cp437')).toBe(0x1FB00)
  })
})
