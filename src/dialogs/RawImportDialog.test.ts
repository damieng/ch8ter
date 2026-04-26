import { describe, it, expect } from 'vitest'
import { copyGlyphWindow } from './RawImportDialog'

describe('copyGlyphWindow', () => {
  it('pads missing trailing glyphs with zeroes', () => {
    const source = new Uint8Array(255)
    source[254] = 0xFE

    const result = copyGlyphWindow(source, 0, 256, 1)

    expect(result).toHaveLength(256)
    expect(result[254]).toBe(0xFE)
    expect(result[255]).toBe(0)
  })
})
