import { describe, it, expect } from 'vitest'
import { createFont, fontToConversionData } from './store'
import { writeCpi } from './fileFormats/cpiWriter'
import { parseCpi } from './fileFormats/cpiParser'

describe('fontToConversionData', () => {
  it('carries the font\'s own codepage so a CPI export records it', () => {
    const font = createFont(
      new Uint8Array(8 * 4), 'x.bin', 0, 8, 8,
      { charset: 'cp850' },
    )
    const data = fontToConversionData(font)
    expect(data.detectedCharset).toBe('cp850')
    const buf = writeCpi(data)
    const parsed = parseCpi(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer)
    expect(parsed.fonts[0].codepage).toBe(850)
  })

  it('exports the codepage of the font being saved, not of another open font', () => {
    const cpm = createFont(
      new Uint8Array(256), 'cpm.bin', 0, 8, 1,
      { charset: 'cpm' },
    )
    const cp850 = createFont(
      new Uint8Array(8 * 4), 'dos.bin', 0, 8, 8,
      { charset: 'cp850' },
    )
    expect(fontToConversionData(cpm).detectedCharset).toBe('cpm')
    expect(fontToConversionData(cp850).detectedCharset).toBe('cp850')
  })
})
