import { describe, it, expect } from 'vitest'
import { parseYaff } from './yaffParser'
import { bpr, getBit } from '../bitUtils'

function px(r: ReturnType<typeof parseYaff>, cp: number, x: number, y: number): boolean {
  const rowBytes = bpr(r.glyphWidth)
  return getBit(r.fontData, (cp - r.startChar) * r.glyphHeight * rowBytes + y * rowBytes, x)
}

describe('parseYaff stacked labels', () => {
  it('gives every label stacked over one bitmap that bitmap', () => {
    const r = parseYaff([
      'name: Stacked',
      '',
      '0x41:',
      'u+0042:',
      'named_glyph:',
      '    @.',
      '    .@',
      '',
      '0x43:',
      '    ..',
      '    @@',
    ].join('\n'))
    // 0x41 and 0x42 share the bitmap even though only the last label touched the rows
    expect(px(r, 0x41, 0, 0)).toBe(true)
    expect(px(r, 0x42, 0, 0)).toBe(true)
    expect(px(r, 0x42, 1, 1)).toBe(true)
    expect(px(r, 0x43, 0, 1)).toBe(true)
    expect(r.populated.has(0x41 - r.startChar)).toBe(true)
    expect(r.populated.has(0x42 - r.startChar)).toBe(true)
  })
})

describe('parseYaff cell size', () => {
  it('sizes the cell to the widest glyph, not the first one', () => {
    const r = parseYaff([
      '0x20:',
      '    ...',
      '    ...',
      '0x41:',
      '    @@@@@',
      '    @...@',
    ].join('\n'))
    expect(r.glyphWidth).toBe(5)
    expect(px(r, 0x41, 4, 0)).toBe(true) // the right-hand column is not clipped
    expect(px(r, 0x41, 4, 1)).toBe(true)
  })

  it('honours a declared cell-size larger than any glyph', () => {
    const r = parseYaff(['cell-size: 8x4', '0x41:', '    @@', '    @.'].join('\n'))
    expect(r.glyphWidth).toBe(8)
    expect(r.glyphHeight).toBe(4)
  })
})
