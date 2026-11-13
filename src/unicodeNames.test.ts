import { describe, it, expect } from 'vitest'
import { CHARSETS, cpToUnicode, type Charset } from './charsets'
import { unicodeName, charName } from './unicodeNames'

describe('unicodeName', () => {
  it('names symbols, controls and the Apple logo', () => {
    expect(unicodeName(0xB6)).toBe('pilcrow sign')
    expect(unicodeName(0x41)).toBe('latin capital letter a')
    expect(unicodeName(0x20)).toBe('space')
    expect(unicodeName(0x07)).toBe('bell')
    expect(unicodeName(0x7F)).toBe('delete')
    expect(unicodeName(0x85)).toBe('next line')
    expect(unicodeName(0xF8FF)).toBe('apple logo')
  })

  it('returns undefined for unknown code points', () => {
    expect(unicodeName(0x378)).toBeUndefined()
  })
})

describe('charName', () => {
  it('resolves through the codepage', () => {
    // 0x14 is the pilcrow in CP437 but a control character in plain ASCII
    expect(charName(0x14, 'cp437')).toBe('pilcrow sign')
    expect(charName(0x14, 'ascii')).toBe('device control four')
    expect(charName(0xC9, 'cp437')).toBe('box drawings double down and right')
  })

  it('names every glyph every codepage can produce, bar a few newer symbols', () => {
    // Added after Unicode 15.1 (the data's version), used by the CPC and MSX codepages
    const newer = new Set([0x1FA6E, 0x1FA6F, 0x1FA8C, 0x1FA8D, 0x1FA8E, 0x1FA8F])
    const unnamed: string[] = []
    for (const key of Object.keys(CHARSETS) as Charset[]) {
      for (let cp = 0; cp <= 255; cp++) {
        if (charName(cp, key)) continue
        const u = cpToUnicode(cp, key).codePointAt(0)!
        if (!newer.has(u)) unnamed.push(`${key}:0x${cp.toString(16)}`)
      }
    }
    expect(unnamed).toEqual([])
  })
})
