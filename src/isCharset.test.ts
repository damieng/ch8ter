import { describe, it, expect } from 'vitest'
import { isCharset } from './charsets'

describe('isCharset', () => {
  it('accepts real codepage keys', () => {
    for (const key of ['zx', 'cpm', 'cp437', 'iso8859_1', 'amiga', 'bbc']) {
      expect(isCharset(key), key).toBe(true)
    }
  })

  it('rejects unknown keys and missing values', () => {
    for (const key of ['', 'nonsense', 'CP437', undefined, null]) {
      expect(isCharset(key), String(key)).toBe(false)
    }
  })

  // `key in CHARSETS` walks the prototype chain, so these used to pass the
  // guard and then resolve to a function instead of a codepage definition
  it('rejects inherited Object members', () => {
    for (const key of ['toString', 'constructor', 'hasOwnProperty', 'valueOf', '__proto__']) {
      expect(isCharset(key), key).toBe(false)
    }
  })
})
