import { describe, it, expect } from 'vitest'
import { decompress } from './lhaDecompress'
import { parseHeaders } from './lhaHeader'
import { parseLha } from './lha'
import { writeLhaArchive } from './lhaWriter'
import { crc16 } from './lhaCrc'
import { LhaBitReader } from './lhaBitReader'

describe('LHA stored methods', () => {
  it('returns the bytes verbatim for -lh0-', () => {
    const data = new Uint8Array([9, 8, 7, 6, 5, 4])
    const out = decompress('-lh0-', data, 2, 4, 4)
    expect([...out]).toEqual([7, 6, 5, 4])
  })

  it('treats -lz4- the same as stored', () => {
    const data = new Uint8Array([1, 2, 3, 4])
    expect([...decompress('-lz4-', data, 0, 4, 4)]).toEqual([1, 2, 3, 4])
  })

  it('returns nothing for directory entries (-lhd-)', () => {
    expect(decompress('-lhd-', new Uint8Array(4), 0, 4, 0).length).toBe(0)
  })

  it('reads only the declared uncompressed length', () => {
    const data = new Uint8Array([1, 2, 3, 4, 5, 6])
    expect(decompress('-lh0-', data, 0, 6, 3).length).toBe(3)
  })
})

describe('LHA unsupported methods', () => {
  it('rejects an unknown method with a clear message', () => {
    expect(() => decompress('-lh9-', new Uint8Array(4), 0, 4, 4))
      .toThrow(/Unsupported LHA method/)
  })

  it('names the method in the error', () => {
    expect(() => decompress('-xx1-', new Uint8Array(4), 0, 4, 4))
      .toThrow(/-xx1-/)
  })
})

describe('LHA header parsing', () => {
  it('reads the headers of a stored archive', () => {
    const archive = writeLhaArchive([
      { path: 'a.txt', data: new Uint8Array([1, 2, 3]) },
      { path: 'dir/b.txt', data: new Uint8Array([4, 5]) },
    ])
    const headers = parseHeaders(archive)
    expect(headers.length).toBe(2)
    expect(headers[0].method).toBe('-lh0-')
    expect(headers[0].uncompressedSize).toBe(3)
    expect(headers[1].filename).toBe('b.txt')
    expect(headers[1].directory).toBe('dir/')
  })

  it('stops cleanly at the end of the archive', () => {
    const archive = writeLhaArchive([{ path: 'one', data: new Uint8Array([0]) }])
    expect(parseHeaders(archive).length).toBe(1)
  })

  it('returns no headers for empty input', () => {
    expect(parseHeaders(new Uint8Array(0))).toEqual([])
  })

  it('stops rather than looping on truncated garbage', () => {
    // A zero header size would otherwise repeat forever
    const bogus = new Uint8Array([0, 0, 0, 0, 0, 0, 0, 0])
    expect(() => parseHeaders(bogus)).not.toThrow()
    expect(parseHeaders(bogus).length).toBe(0)
  })
})

describe('LHA archive integrity', () => {
  it('round-trips several entries with their contents intact', () => {
    const entries = [
      { path: 'Fonts/One.font', data: new Uint8Array(100).fill(0x11) },
      { path: 'Fonts/One/8', data: new Uint8Array(256).fill(0x22) },
      { path: 'Fonts/Two/9', data: new Uint8Array(0) },
    ]
    const parsed = parseLha(writeLhaArchive(entries))
    expect(parsed.entries.length).toBe(3)
    expect(parsed.entries[0].data[0]).toBe(0x11)
    expect(parsed.entries[1].data.length).toBe(256)
    expect(parsed.entries[2].data.length).toBe(0)
  })

  it('keeps directory entries separate from file data', () => {
    const archive = writeLhaArchive([
      { path: 'dir/', data: new Uint8Array(0) },
      { path: 'dir/file', data: new Uint8Array([7]) },
    ])
    const parsed = parseLha(archive)
    expect(parsed.entries.length).toBe(2)
    expect(parsed.entries[0].data.length).toBe(0)
  })

  it('reports the method it read', () => {
    const parsed = parseLha(writeLhaArchive([{ path: 'x', data: new Uint8Array([1]) }]))
    expect(parsed.entries[0].method).toBe('-lh0-')
  })
})

describe('LHA CRC', () => {
  it('matches the value the writer embedded', () => {
    const payload = new Uint8Array([1, 2, 3, 4, 5])
    const archive = writeLhaArchive([{ path: 'f', data: payload }])
    const header = parseHeaders(archive)[0]
    expect(header.crc).toBe(crc16(payload))
  })

  it('computes a stable, distinct value per payload', () => {
    expect(crc16(new Uint8Array([1, 2]))).not.toBe(crc16(new Uint8Array([1, 3])))
    expect(crc16(new Uint8Array(0))).toBe(crc16(new Uint8Array(0)))
  })
})

describe('LhaBitReader', () => {
  it('reads bits in order and stops at the end', () => {
    // 0b1010_0101: MSB first
    const reader = new LhaBitReader(new Uint8Array([0xA5]), 0, 1)
    expect(reader.read(1)).toBe(1)
    expect(reader.read(1)).toBe(0)
    expect(reader.read(1)).toBe(1)
    expect(reader.read(1)).toBe(0)
  })

  it('reads across byte boundaries', () => {
    const reader = new LhaBitReader(new Uint8Array([0xFF, 0x00]), 0, 2)
    expect(reader.read(8)).toBe(0xFF)
    expect(reader.read(8)).toBe(0x00)
  })

  it('respects the declared compressed size', () => {
    // Declaring only one byte means the second is unreachable
    const reader = new LhaBitReader(new Uint8Array([0xFF, 0xFF]), 0, 1)
    expect(reader.read(8)).toBe(0xFF)
    expect(reader.read(8)).toBe(0) // past the end pads with zeros
  })

  it('can start at an offset', () => {
    const reader = new LhaBitReader(new Uint8Array([0x00, 0xAB]), 1, 1)
    expect(reader.read(8)).toBe(0xAB)
  })
})
