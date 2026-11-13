import { describe, it, expect } from 'vitest'
import { parseWindowsFnt } from './windowsFntParser'
import { writeWindowsFnt } from './windowsFntWriter'
import type { FontWriteData } from '../fontSave'

describe('parseWindowsFnt header validation', () => {
  it('rejects a last character before the first with a clear error, not a RangeError', () => {
    const data: FontWriteData = {
      fontData: new Uint8Array(3 * 8), glyphWidth: 8, glyphHeight: 8, startChar: 32, glyphCount: 3,
      baseline: 7, meta: null, glyphMeta: null, fontName: 'T',
    }
    const bytes = writeWindowsFnt(data)
    bytes[95] = 90 // dfFirstChar
    bytes[96] = 40 // dfLastChar < dfFirstChar
    expect(() => parseWindowsFnt(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer))
      .toThrow('before the first')
  })
})
