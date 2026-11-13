import { describe, it, expect } from 'vitest'
import { glyphCodeForChar } from './charsets'

describe('glyphCodeForChar', () => {
  it('maps box-drawing Unicode to the Amstrad CP/M Plus line-drawing codes', () => {
    const expected: Record<string, number> = {
      '┌': 0x96, '─': 0x9A, '┬': 0x9E, '┐': 0x9C, '│': 0x95,
      '╔': 0x86, '═': 0x8A, '╗': 0x8C, '║': 0x85, '╝': 0x89,
      '╧': 0x81, '╟': 0x82, '╤': 0x84, '╢': 0x88,
      '╵': 0x91, '·': 0x90, '◾': 0x80,
    }
    for (const [ch, code] of Object.entries(expected)) {
      expect(glyphCodeForChar(ch, 'cpm'), `U+${ch.charCodeAt(0).toString(16)}`).toBe(code)
    }
  })

  it('leaves ASCII alone', () => {
    expect(glyphCodeForChar('A', 'cpm')).toBe(0x41)
    expect(glyphCodeForChar('0', 'cpm')).toBe(0x30)
  })

  it('uses the codepage it is given', () => {
    expect(glyphCodeForChar('╔', 'cp437')).toBe(0xC9)
    // A ZX Spectrum font has no box-drawing mapping, so the code passes through
    expect(glyphCodeForChar('╔', 'zx')).toBe(0x2554)
  })

  it('falls back to the raw code for unmapped characters', () => {
    expect(glyphCodeForChar('中', 'cpm')).toBe(0x4E2D)
  })
})
