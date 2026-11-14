import { describe, it, expect } from 'vitest'
import {
  cpToUnicode, buildUnicodeReverse, charLabel, charCodeFromKey, glyphCodeForChar,
  CHARSETS, sortedCharsets, isCharset, type Charset,
} from './charsets'

describe('cpToUnicode', () => {
  it('returns the codepage override where one exists', () => {
    // ZX Spectrum puts the pound sign at 0x60
    expect(cpToUnicode(0x60, 'zx')).toBe('\u00A3')
    // CP/M Plus maps 0x7F onto the digit zero
    expect(cpToUnicode(0x7F, 'cpm')).toBe('0')
  })

  it('falls back to the codepoint itself when there is no override', () => {
    expect(cpToUnicode(0x41, 'zx')).toBe('A')
    expect(cpToUnicode(0x30, 'cp437')).toBe('0')
  })
})

describe('buildUnicodeReverse', () => {
  it('maps every character in range back to its code', () => {
    const map = buildUnicodeReverse('zx')
    expect(map.get('A')).toBe(0x41)
    expect(map.get('\u00A3')).toBe(0x60)
  })

  it('keeps the first code when two codes produce the same character', () => {
    // Later duplicates must not overwrite the earlier mapping, so lookups are stable
    const map = buildUnicodeReverse('cp437')
    const firstZero = map.get('0')
    expect(firstZero).toBe(0x30)
  })

  it('only covers the codepage range', () => {
    const map = buildUnicodeReverse('ascii') // range 32..126
    expect(map.get('A')).toBe(0x41)
    // Beyond the range, the character is not present
    expect(map.get('\u00E9')).toBeUndefined()
  })
})

describe('charLabel', () => {
  it('shows printable characters as themselves', () => {
    expect(charLabel(0x41, 'ascii')).toBe('A')
    expect(charLabel(0x35, 'ascii')).toBe('5')
  })

  it('shows a space as the open-box symbol', () => {
    expect(charLabel(32, 'ascii')).toBe('\u2423')
  })

  it('uses the codepage character for high codes', () => {
    expect(charLabel(0x60, 'zx')).toBe('\u00A3')
  })

  it('falls back to a hex label when no glyph exists', () => {
    // A control code with no printable representation
    const label = charLabel(1, 'ascii')
    expect(label).toMatch(/^0x[0-9A-F]{2}$/)
  })

  it('pads the hex label to two digits', () => {
    expect(charLabel(9, 'ascii')).toBe('0x09')
  })

  it('renders printable Latin-1 directly even without an override', () => {
    expect(charLabel(0xE9, 'iso8859_1')).toBe('\u00E9')
  })
})

describe('charCodeFromKey', () => {
  it('maps a character the codepage defines', () => {
    expect(charCodeFromKey('\u00A3', 'zx')).toBe(0x60)
  })

  it('passes through printable ASCII', () => {
    expect(charCodeFromKey('A', 'ascii')).toBe(0x41)
    expect(charCodeFromKey(' ', 'ascii')).toBe(0x20)
  })

  it('rejects keys that are not a single character', () => {
    expect(charCodeFromKey('Shift', 'ascii')).toBeNull()
    expect(charCodeFromKey('', 'ascii')).toBeNull()
  })

  it('rejects characters outside printable ASCII that the codepage lacks', () => {
    expect(charCodeFromKey('\u4e2d', 'ascii')).toBeNull()
  })

  it('accepts an astral character as one key but rejects it when unmapped', () => {
    // A single code point counts as one key, but an unmapped character outside
    // printable ASCII is not a usable shortcut, so the result is null
    expect(charCodeFromKey('\u{1FB00}', 'cp437')).toBeNull()
  })
})

describe('glyphCodeForChar', () => {
  it('returns the codepage position for a mapped character', () => {
    expect(glyphCodeForChar('\u2554', 'cp437')).toBe(0xC9)
  })

  it('returns the raw codepoint for an unmapped character', () => {
    expect(glyphCodeForChar('\u4e2d', 'cp437')).toBe(0x4E2D)
  })

  it('follows the codepage it is given rather than a global', () => {
    // The pound sign sits at different codes in different codepages
    expect(glyphCodeForChar('\u00A3', 'zx')).toBe(0x60)
    expect(glyphCodeForChar('\u00A3', 'cp437')).toBe(0x9C)
  })
})

describe('sortedCharsets', () => {
  it('returns every codepage exactly once', () => {
    const sorted = sortedCharsets()
    expect(sorted.length).toBe(Object.keys(CHARSETS).length)
    expect(new Set(sorted.map(([k]) => k)).size).toBe(sorted.length)
  })

  it('orders by label, numerically where labels contain numbers', () => {
    const labels = sortedCharsets().map(([, def]) => def.label)
    const expected = [...labels].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    expect(labels).toEqual(expected)
  })

  it('includes the codepages the app depends on', () => {
    const keys = sortedCharsets().map(([k]) => k)
    for (const k of ['zx', 'cpm', 'cp437', 'amiga']) expect(keys).toContain(k)
  })
})

describe('isCharset', () => {
  it('accepts every key in the table and nothing else', () => {
    for (const key of Object.keys(CHARSETS)) expect(isCharset(key)).toBe(true)
    for (const key of ['nope', 'toString', 'constructor', '__proto__', '']) {
      expect(isCharset(key), key).toBe(false)
    }
  })
})

describe('codepage extends chains', () => {
  it('resolves inherited overrides', () => {
    // iso8859_9 extends iso8859_1, which has no overrides, then adds its own
    const map = buildUnicodeReverse('iso8859_9')
    expect(map.get('\u011E')).toBe(0xD0) // Turkish, from its own table
    expect(map.get('\u00E9')).toBe(0xE9) // from the Latin-1 base
  })

  it('uses the child override where parent and child disagree', () => {
    // cp866 extends cp437; 0x80 is a Cyrillic letter in cp866 but a Latin one in cp437
    expect(cpToUnicode(0x80, 'cp866')).toBe('\u0410')
    expect(cpToUnicode(0x80, 'cp437')).toBe('\u00C7')
  })
})

describe('every codepage is usable', () => {
  it('builds a reverse map without throwing, for all of them', () => {
    for (const key of Object.keys(CHARSETS) as Charset[]) {
      const map = buildUnicodeReverse(key)
      expect(map.size, key).toBeGreaterThan(0)
    }
  })

  it('produces a label for the first and last code of each range', () => {
    for (const [key, def] of Object.entries(CHARSETS) as [Charset, typeof CHARSETS[Charset]][]) {
      const range = def.range ?? [32, 126]
      expect(() => charLabel(range[0], key), key).not.toThrow()
      expect(() => charLabel(range[1], key), key).not.toThrow()
      expect(charLabel(range[0], key).length, key).toBeGreaterThan(0)
    }
  })
})
