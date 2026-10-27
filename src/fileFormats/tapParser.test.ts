import { describe, it, expect } from 'vitest'
import { parseTapBlocks, extractTapFonts, pickTapFont } from './tapParser'

/** Build TAP bytes: each block = u16 len + flag + payload + parity (XOR of flag+payload). */
function makeTap(blocks: { flag: number; payload: number[] }[]): Uint8Array {
  const parts: number[][] = []
  for (const b of blocks) {
    const parity = b.flag ^ b.payload.reduce((a, v) => a ^ v, 0)
    const body = [b.flag, ...b.payload, parity]
    parts.push([(body.length & 0xFF), (body.length >> 8) & 0xFF, ...body])
  }
  return new Uint8Array(parts.flat())
}

function codeHeader(name: string, length: number, start: number): { flag: number; payload: number[] } {
  const payload = [3] // CODE
  const nameBytes = Array.from({ length: 10 }, (_, i) => i < name.length ? name.charCodeAt(i) : 0x20)
  payload.push(...nameBytes)
  payload.push(length & 0xFF, (length >> 8) & 0xFF)
  payload.push(start & 0xFF, (start >> 8) & 0xFF)
  payload.push(0, 0) // param2
  payload.push(0)    // checksum byte (not validated by our parser)
  return { flag: 0x00, payload }
}

function dataBlock(data: number[]): { flag: number; payload: number[] } {
  return { flag: 0xFF, payload: [...data, 0] } // trailing checksum byte
}

describe('parseTapBlocks', () => {
  it('splits blocks and strips flag/parity', () => {
    const tap = makeTap([
      { flag: 0x00, payload: [1, 2, 3] },
      { flag: 0xFF, payload: [4, 5] },
    ])
    const blocks = parseTapBlocks(tap)
    expect(blocks.length).toBe(2)
    expect(blocks[0].flag).toBe(0x00)
    expect([...blocks[0].data]).toEqual([1, 2, 3]) // payload only, flag and parity stripped
  })

  it('stops at truncated or corrupt blocks', () => {
    const tap = makeTap([{ flag: 0xFF, payload: [1, 2, 3] }])
    const truncated = tap.subarray(0, tap.length - 2)
    expect(parseTapBlocks(truncated).length).toBe(0)
  })
})

describe('extractTapFonts', () => {
  it('finds font-sized CODE blocks with names and addresses', () => {
    const font1024 = Array.from({ length: 1024 }, (_, i) => i & 0xFF)
    const font768 = Array.from({ length: 768 }, (_, i) => (i * 3) & 0xFF)
    const program = Array.from({ length: 100 }, () => 0)
    const tap = makeTap([
      codeHeader('font1', 1024, 16384),
      dataBlock(font1024),
      codeHeader('', 768, 32768),
      dataBlock(font768),
      { flag: 0x00, payload: [0, ...Array(10).fill(0x20), 100, 0, 0, 0, 0, 0, 0] }, // Program
      dataBlock(program),
    ])

    const fonts = extractTapFonts(tap)
    expect(fonts.length).toBe(2)
    expect(fonts[0].label).toBe('font1 at 16384 (128 chars)')
    expect(fonts[0].numChars).toBe(128)
    expect([...fonts[0].fontData.slice(0, 4)]).toEqual(font1024.slice(0, 4))
    expect(fonts[1].numChars).toBe(96)

    // Single-font pick prefers the largest charset
    expect(pickTapFont(tap)!.numChars).toBe(128)
  })

  it('ignores code blocks that are not font-sized', () => {
    const code = Array.from({ length: 300 }, () => 1)
    const tap = makeTap([codeHeader('prog', 300, 24000), dataBlock(code)])
    expect(extractTapFonts(tap).length).toBe(0)
  })

  it('returns no fonts for an empty tape', () => {
    expect(pickTapFont(new Uint8Array(0))).toBeNull()
  })
})
