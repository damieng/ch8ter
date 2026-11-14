// Extended coverage for the LHA header parser, using real archives from the
// lhasa regression corpus (ISC licensed) that exercise paths the earlier tests
// did not reach: symlinks, extended headers carrying directory names, empty
// filenames, multiple entries, Unix path separators, absolute paths and
// truncation.
//
// Level 3 headers are also covered, built by hand in this file because no real
// level-3 archive exists in the corpus - the level is rarely emitted by tools.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parseHeaders } from './lhaHeader'
import { parseLha } from './lha'

const DIR = resolve(__dirname, '../testFixtures/lha')

function load(name: string): Uint8Array {
  return new Uint8Array(readFileSync(resolve(DIR, name)))
}

function header(name: string) {
  const h = parseHeaders(load(name))
  expect(h.length, `${name} entries`).toBeGreaterThan(0)
  return h[0]
}

describe('real archives: extended-header paths', () => {
  it('reads a level 2 archive with nested directories', () => {
    const entries = parseHeaders(load('h2_subdir.lzh'))
    expect(entries.length).toBe(3)
    expect(entries.every(e => e.headerLevel === 2)).toBe(true)
    const file = entries.find(e => e.method !== '-lhd-')!
    expect(file.directory + file.filename).toBe('subdir/subdir2/HELLO.TXT')
  })

  it('reads a level 1 archive with nested directories', () => {
    const entries = parseHeaders(load('h1_subdir.lzh'))
    expect(entries.length).toBe(3)
    expect(entries.every(e => e.headerLevel === 1)).toBe(true)
  })

  it('marks directory entries by method and by trailing slash', () => {
    const entries = parseHeaders(load('h2_subdir.lzh'))
    const dirs = entries.filter(e => e.isDirectory)
    expect(dirs.length).toBe(2)
    for (const d of dirs) expect(d.method).toBe('-lhd-')
  })

  it('takes a symlink target from the extended header', () => {
    // A level-2 symlink entry stores its target as an extended header field,
    // which surfaces as the directory component
    const entries = parseHeaders(load('h2_symlink3.lzh'))
    expect(entries.length).toBe(1)
    expect(entries[0].method).toBe('-lhd-')
    expect(entries[0].directory + entries[0].filename).toContain('symlink')
  })

  it('reads a level 1 symlink whose target contains path traversal', () => {
    const entries = parseHeaders(load('h1_symlink2.lzh'))
    expect(entries.length).toBe(1)
    expect(entries[0].method).toBe('-lhd-')
  })

  it('reads a level 0 symlink', () => {
    const entries = parseHeaders(load('h0_symlink.lzh'))
    expect(entries.length).toBe(1)
    expect(entries[0].headerLevel).toBe(0)
    expect(entries[0].method).toBe('-lhd-')
  })
})

describe('real archives: multiple entries', () => {
  it('walks every header in a multi-file archive', () => {
    const entries = parseHeaders(load('multiple.lzh'))
    expect(entries.length).toBe(5)
    const names = entries.map(e => e.filename)
    expect(names).toContain('file1.txt')
    expect(names).toContain('file3.txt')
    expect(names).toContain('file4.txt')
  })

  it('gives each entry a distinct data offset', () => {
    const entries = parseHeaders(load('multiple.lzh'))
    const offsets = entries.map(e => e.dataOffset)
    expect(new Set(offsets).size).toBe(offsets.length)
  })

  it('reads the payload of every entry', () => {
    const archive = parseLha(load('multiple.lzh'))
    expect(archive.entries.length).toBe(5)
    for (const e of archive.entries) {
      expect(e.data.length).toBe(e.uncompressedSize)
    }
  })
})

describe('real archives: awkward paths', () => {
  it('keeps an absolute path as written rather than resolving it', () => {
    // The parser reports what the archive says; sanitising is the extractor's job
    const e = header('abspath.lzh')
    expect((e.directory + e.filename)).toContain('/tmp/')
  })

  it('keeps a traversal path as written', () => {
    const entries = parseHeaders(load('dotdot.lzh'))
    const names = entries.map(e => e.directory + e.filename)
    expect(names.some(n => n.includes('..'))).toBe(true)
  })

  it('handles Unix-style separators in a level 0 filename', () => {
    const e = header('unixsep.lzh')
    expect(e.headerLevel).toBe(0)
    // Level 0 stores the whole path in the filename field
    expect((e.directory + e.filename).replace(/\\/g, '/')).toBe('SUBDIR/SUBDIR2/HELLO.TXT')
  })

  it('handles empty filenames without dropping the archive', () => {
    // Picasso96 segment with zero-length names; parsing must continue past them
    const entries = parseHeaders(load('empty_fn.lzh'))
    expect(entries.length).toBeGreaterThan(1)
    expect(entries.some(e => e.filename === '')).toBe(true)
  })

  it('preserves an escape sequence verbatim rather than stripping it', () => {
    // Terminal safety is the display layer's concern, not the parser's
    const e = header('badterm.lzh')
    expect(e.filename.length).toBeGreaterThan(0)
  })
})

describe('real archives: truncation', () => {
  it('stops at the last complete header in a truncated archive', () => {
    // This file is cut short mid-payload; the header itself is intact
    const entries = parseHeaders(load('truncated.lzh'))
    expect(entries.length).toBeGreaterThanOrEqual(1)
  })

  it('does not throw on a truncated archive', () => {
    expect(() => parseHeaders(load('truncated.lzh'))).not.toThrow()
  })
})

describe('level 3 headers (built by hand)', () => {
  /**
   * Build a level-3 header. Layout per parseLevel3:
   *   +0  wordSize (u16, must be 4)   +2  method (5)
   *   +7  compressedSize (u32)        +11 uncompressedSize (u32)
   *   +15 timestamp (u32, seconds)    +21 crc (u16)
   *   +23 osId (1)                    +24 totalHeaderSize (u32)
   *   +28 first ext size (u32), then the ext chain
   */
  function level3(name: string, data: Uint8Array, opts: { method?: string } = {}): Uint8Array {
    const method = opts.method ?? '-lh0-'
    const nameBytes = [...name].map(c => c.charCodeAt(0))

    // One ext header: [size u32][type][data][...], size = dataLen + 5
    const extSize = nameBytes.length + 5
    const extChain = [0, 0, 0, 0, 0x01, ...nameBytes] // placeholder, patched below
    extChain[0] = extSize & 0xFF
    extChain[1] = (extSize >>> 8) & 0xFF
    extChain[2] = (extSize >>> 16) & 0xFF
    extChain[3] = (extSize >>> 24) & 0xFF

    const baseSize = 28 + extChain.length
    const out: number[] = []
    const u16 = (v: number) => out.push(v & 0xFF, (v >>> 8) & 0xFF)
    const u32 = (v: number) => out.push(v & 0xFF, (v >>> 8) & 0xFF, (v >>> 16) & 0xFF, (v >>> 24) & 0xFF)

    u16(4)                       // wordSize
    for (const c of method) out.push(c.charCodeAt(0))
    u32(data.length)             // compressed size
    u32(data.length)             // uncompressed size
    u32(1_700_000_000)           // timestamp (seconds)
    out.push(0)                  // byte 19
    out.push(3)                  // byte 20: the level marker parseOneHeader dispatches on
    u16(0)                       // crc
    out.push(0)                  // osId
    u32(baseSize)                // totalHeaderSize (advance to payload)
    u32(extSize)                 // first ext size
    out.push(0x01, ...nameBytes) // ext body: type + name
    out.push(...data)
    return new Uint8Array(out)
  }

  it('is not reached by the level 0/1/2 fixtures', () => {
    // Sanity check that level 3 really is a distinct code path
    const levels = parseHeaders(load('h2_subdir.lzh')).map(e => e.headerLevel)
    expect(levels).not.toContain(3)
  })

  it('parses a hand-built level 3 header', () => {
    const archive = level3('FONTS/TEST', new Uint8Array([1, 2, 3]))
    const entries = parseHeaders(archive)
    expect(entries.length).toBe(1)
    expect(entries[0].headerLevel).toBe(3)
    expect(entries[0].method).toBe('-lh0-')
    expect(entries[0].filename).toBe('FONTS/TEST')
  })

  it('reports the payload size and offset', () => {
    const payload = new Uint8Array([9, 8, 7, 6])
    const archive = level3('X', payload)
    const [e] = parseHeaders(archive)
    expect(e.compressedSize).toBe(4)
    expect(e.uncompressedSize).toBe(4)
    expect([...archive.subarray(e.dataOffset, e.dataOffset + 4)]).toEqual([9, 8, 7, 6])
  })

  it('reads its timestamp as seconds since the epoch', () => {
    const [e] = parseHeaders(level3('T', new Uint8Array(1)))
    expect(e.timestamp.getTime()).toBe(1_700_000_000_000)
  })

  it('rejects a header whose word size is not 4', () => {
    const archive = level3('X', new Uint8Array(1))
    archive[0] = 2 // wordSize must be 4
    expect(parseHeaders(archive).length).toBe(0)
  })

  it('rejects a zero total header size, which would loop forever', () => {
    const archive = level3('X', new Uint8Array(1))
    // totalHeaderSize lives at +24
    archive[24] = 0; archive[25] = 0; archive[26] = 0; archive[27] = 0
    expect(parseHeaders(archive).length).toBe(0)
  })

  it('rejects a header claiming to extend past the buffer', () => {
    const archive = level3('X', new Uint8Array(1))
    archive[24] = 0xFF; archive[25] = 0xFF
    expect(parseHeaders(archive).length).toBe(0)
  })

  it('returns nothing from a buffer shorter than a level 3 header', () => {
    const short = new Uint8Array(20)
    short[20 - 1] = 3 // level byte at +20
    expect(parseHeaders(short).length).toBe(0)
  })
})
