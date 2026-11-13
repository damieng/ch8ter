import { describe, it, expect, afterEach } from 'vitest'
import { charset, createFont, fontToConversionData } from './store'
import { writeCpi } from './fileFormats/cpiWriter'
import { parseCpi } from './fileFormats/cpiParser'

describe('fontToConversionData', () => {
  const original = charset.value
  afterEach(() => { charset.value = original })

  it('carries the active codepage so a CPI export records it', () => {
    charset.value = 'cp850'
    const data = fontToConversionData(createFont(new Uint8Array(8 * 4), 'x.bin', 0, 8, 8))
    expect(data.detectedCharset).toBe('cp850')
    const buf = writeCpi(data)
    const parsed = parseCpi(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer)
    expect(parsed.fonts[0].codepage).toBe(850)
  })
})
