import { describe, it, expect, afterEach } from 'vitest'
import { charset, glyphCodeForChar } from './charsets'

describe('glyphCodeForChar', () => {
  const original = charset.value
  afterEach(() => { charset.value = original })

  it('maps box-drawing Unicode to the Amstrad CP/M Plus line-drawing codes', () => {
    charset.value = 'cpm'
    const expected: Record<string, number> = {
      '┌': 0x96, '─': 0x9A, '┬': 0x9E, '┐': 0x9C, '│': 0x95,
      '╔': 0x86, '═': 0x8A, '╗': 0x8C, '║': 0x85, '╝': 0x89,
      '╧': 0x81, '╟': 0x82, '╤': 0x84, '╢': 0x88,
      '╵': 0x91, '·': 0x90, '◾': 0x80,
    }
    for (const [ch, code] of Object.entries(expected)) {
      expect(glyphCodeForChar(ch), `U+${ch.charCodeAt(0).toString(16)}`).toBe(code)
    }
  })

  it('leaves ASCII alone', () => {
    charset.value = 'cpm'
    expect(glyphCodeForChar('A')).toBe(0x41)
    expect(glyphCodeForChar('0')).toBe(0x30)
  })

  it('follows the active codepage', () => {
    charset.value = 'cp437'
    expect(glyphCodeForChar('╔')).toBe(0xC9)
  })

  it('falls back to the raw code for unmapped characters', () => {
    charset.value = 'cpm'
    expect(glyphCodeForChar('中')).toBe(0x4E2D)
  })
})
