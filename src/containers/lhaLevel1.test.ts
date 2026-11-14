// Level 1/2 LHA headers, which our writer never emits.
//
// lhaWriter only produces level-0 headers with the -lh0- method, so the
// level 1 and 2 paths in lhaHeader had no coverage. Real Amiga archives use
// level 1, so these are the paths that matter most when reading files in the
// wild.

import { describe, it, expect } from 'vitest'
import { parseHeaders } from './lhaHeader'
import { parseLha } from './lha'

function ascii(s: string): number[] {
  return [...s].map(c => c.charCodeAt(0))
}

function u16(v: number): number[] {
  return [v & 0xFF, (v >>> 8) & 0xFF]
}

function u32(v: number): number[] {
  return [v & 0xFF, (v >>> 8) & 0xFF, (v >>> 16) & 0xFF, (v >>> 24) & 0xFF]
}

/** MS-DOS packed date/time for 2026-11-14 12:30:00. */
function dosTimestamp(): number[] {
  const time = (12 << 11) | (30 << 5) | 0
  const date = ((2026 - 1980) << 9) | (11 << 5) | 14
  return u32(((date << 16) | time) >>> 0)
}

/**
 * Build a level-1 header.
 * Level 1 stores the compressed size as "skip size" (header + data + ext
 * headers) and keeps the real payload after the extended header chain.
 */
function level1(name: string, data: Uint8Array, opts: { method?: string; directory?: string } = {}): Uint8Array {
  const method = opts.method ?? '-lh0-'
  const nameBytes = ascii(name)
  const dirBytes = opts.directory ? ascii(opts.directory) : []

  // Offsets the parser reads (verified against lhaHeader.ts):
  //   pos+0 size, +1 checksum, +2 method(5), +7 skip(4), +11 orig(4),
  //   +15 time(4), +19 attr, +20 level, +21 nameLen, +22 name,
  //   +22+n crc(2), +24+n os(1), then pos+headerSize holds the first ext size.
  // With the ext-size field at 25+n, headerSize must be 25+n.
  const headerSize = 25 + nameBytes.length

  // Extended headers: each is [size][type][data...][next_size(2)], and the
  // parser computes dataLen = size - 3, so size = dataLen + 3. The *first*
  // size is stored separately in the 2 bytes at pos+headerSize, so the chain
  // that follows starts with the type byte.
  const extBody: number[] = []
  let firstExtSize = 0
  if (dirBytes.length > 0) {
    firstExtSize = dirBytes.length + 3
    extBody.push(0x02, ...dirBytes, ...u16(0))
  }
  const skipSize = headerSize + 2 + (firstExtSize > 0 ? firstExtSize : 0) + data.length

  const out: number[] = []
  out.push(headerSize)
  out.push(0) // checksum (not validated by the parser)
  out.push(...ascii(method))
  out.push(...u32(skipSize))
  out.push(...u32(data.length))
  out.push(...dosTimestamp())
  out.push(0x20) // attribute
  out.push(1) // header level
  out.push(nameBytes.length)
  out.push(...nameBytes)
  out.push(...u16(0)) // CRC
  out.push(0) // OS id
  // First extended-header size, then the chain body (which omits that size byte)
  out.push(...u16(firstExtSize))
  out.push(...extBody)
  out.push(...data)

  return new Uint8Array(out)
}

describe('level 1 headers', () => {
  it('reads a stored file and its payload', () => {
    const payload = new Uint8Array([1, 2, 3, 4, 5])
    const archive = level1('font.dat', payload)
    const headers = parseHeaders(archive)
    expect(headers.length).toBe(1)
    expect(headers[0].filename).toBe('font.dat')
    expect(headers[0].method).toBe('-lh0-')
    expect(headers[0].uncompressedSize).toBe(5)
    expect(headers[0].headerLevel).toBe(1)
  })

  it('exposes the payload at the offset it reports', () => {
    const payload = new Uint8Array([9, 8, 7])
    const archive = level1('a.bin', payload)
    const [h] = parseHeaders(archive)
    expect([...archive.slice(h.dataOffset, h.dataOffset + h.compressedSize)]).toEqual([9, 8, 7])
  })

  it('takes the directory from the extended header', () => {
    const archive = level1('File', new Uint8Array([1]), { directory: 'Fonts/' })
    const [h] = parseHeaders(archive)
    expect(h.directory).toBe('Fonts/')
    expect(h.filename).toBe('File')
  })

  it('splits a path embedded in the filename', () => {
    const archive = level1('Fonts/Sub/x.font', new Uint8Array([1]))
    const [h] = parseHeaders(archive)
    expect(h.directory).toBe('Fonts/Sub/')
    expect(h.filename).toBe('x.font')
  })

  it('marks a -lhd- entry as a directory', () => {
    const archive = level1('Fonts/', new Uint8Array(0), { method: '-lhd-' })
    const [h] = parseHeaders(archive)
    expect(h.isDirectory).toBe(true)
  })

  it('marks a trailing-slash name as a directory', () => {
    const archive = level1('things/', new Uint8Array(0))
    expect(parseHeaders(archive)[0].isDirectory).toBe(true)
  })

  it('rejects a header whose filename overflows it', () => {
    const archive = level1('x', new Uint8Array([1]))
    // Corrupt the filename length so it runs past the header
    archive[21] = 200
    expect(parseHeaders(archive).length).toBe(0)
  })

  it('stops at a corrupt header rather than looping', () => {
    const archive = level1('x', new Uint8Array([1]))
    const corrupt = archive.slice()
    corrupt[20] = 9 // unknown header level
    expect(() => parseHeaders(corrupt)).not.toThrow()
    expect(parseHeaders(corrupt).length).toBe(0)
  })
})

describe('full archive parse through level 1', () => {
  it('returns the entry with its data', () => {
    const payload = new Uint8Array([0xAA, 0xBB, 0xCC])
    const archive = level1('stored.bin', payload)
    const parsed = parseLha(archive)
    expect(parsed.entries.length).toBe(1)
    expect([...parsed.entries[0].data]).toEqual([0xAA, 0xBB, 0xCC])
    expect(parsed.entries[0].method).toBe('-lh0-')
  })

  it('returns an empty payload for a directory entry', () => {
    const archive = level1('dir/', new Uint8Array(0), { method: '-lhd-' })
    const parsed = parseLha(archive)
    expect(parsed.entries[0].data.length).toBe(0)
  })
})

describe('header-level robustness', () => {
  it('returns nothing for input shorter than a header', () => {
    expect(parseHeaders(new Uint8Array(10))).toEqual([])
  })

  it('treats a zero first byte as end-of-archive', () => {
    expect(parseHeaders(new Uint8Array([0, 0, 0, 0]))).toEqual([])
  })

  it('never crashes across every truncation of a level-1 archive', () => {
    const full = level1('t.bin', new Uint8Array([1, 2, 3]))
    for (let cut = 0; cut <= full.length; cut++) {
      const part = full.slice(0, cut)
      try {
        parseHeaders(part)
      } catch (e) {
        expect((e as Error).constructor.name, `cut at ${cut}`).not.toBe('RangeError')
      }
    }
  })
})
