import { describe, it, expect } from 'vitest'
import { writeLhaArchive } from './lhaWriter'
import { parseLha } from './lha'
import { buildAmigaFontDirectory } from '../fileFormats/amigaFontWriter'
import type { FontWriteData } from '../fontSave'

describe('writeLhaArchive', () => {
  it('round-trips entries through our own parser', () => {
    const entries = [
      { path: 'Fonts/MyFont.font', data: new Uint8Array([1, 2, 3, 4, 5]) },
      { path: 'Fonts/MyFont/8', data: new Uint8Array(600).fill(0xAB) },
    ]
    const archive = writeLhaArchive(entries, new Date(2026, 9, 27, 12, 30, 0))

    const parsed = parseLha(archive)
    expect(parsed.entries.length).toBe(2)
    expect(parsed.entries[0].directory + parsed.entries[0].filename).toBe('Fonts/MyFont.font')
    expect([...parsed.entries[0].data]).toEqual([1, 2, 3, 4, 5])
    expect(parsed.entries[1].directory + parsed.entries[1].filename).toBe('Fonts/MyFont/8')
    expect(parsed.entries[1].data.length).toBe(600)
    expect(parsed.entries[1].data[0]).toBe(0xAB)
  })

  it('produces an archive of a single file without trailing corruption', () => {
    const archive = writeLhaArchive([{ path: 'a.txt', data: new Uint8Array(10).fill(7) }])
    const parsed = parseLha(archive)
    expect(parsed.entries.length).toBe(1)
    expect(parsed.entries[0].data.length).toBe(10)
  })

  it('rejects empty archives and invalid names', () => {
    expect(() => writeLhaArchive([])).toThrow('empty')
    expect(() => writeLhaArchive([{ path: '', data: new Uint8Array(1) }])).toThrow('Invalid LHA entry')
  })
})

describe('amiga .lha packaging', () => {
  const font: FontWriteData = {
    fontData: new Uint8Array(64), glyphWidth: 8, glyphHeight: 8, startChar: 32,
    glyphCount: 8, baseline: 7, meta: null, glyphMeta: null, fontName: 'TestFont',
  }

  it('packages the .font index and hunk font into one archive', () => {
    const archive = writeLhaArchive(buildAmigaFontDirectory(font))
    const parsed = parseLha(archive)
    expect(parsed.entries.map(e => e.directory + e.filename)).toEqual([
      'Fonts/TestFont.font',
      'Fonts/TestFont/8',
    ])
    // .font index magic $0F00 (ULONG big-endian)
    expect(parsed.entries[0].data[0]).toBe(0x00)
    expect(parsed.entries[0].data[2]).toBe(0x0F)
    // hunk font starts with HUNK_HEADER
    expect(parsed.entries[1].data[0]).toBe(0x00)
    expect(parsed.entries[1].data[2]).toBe(0x03)
    expect(parsed.entries[1].data[3]).toBe(0xF3)
  })
})
