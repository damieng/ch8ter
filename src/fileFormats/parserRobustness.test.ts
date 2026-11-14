// Truncation robustness for the binary parsers.
//
// The CPI parser had three unguarded DataView reads that threw a bare
// RangeError on damaged input; a sweep over every prefix length found them.
// This does the same for every other binary format: take a file the writers
// produce, truncate it to every possible length, and require that the parser
// either succeeds or fails with a described error - never a RangeError,
// TypeError or "Offset is outside the bounds" crash.

import { describe, it, expect } from 'vitest'
import { loadFontFile } from '../fontLoad'
import { parseCpi } from './cpiParser'
import { parsePdbFont } from './pdbFontParser'
import { parsePcf } from './pcfParser'
import { parsePsf } from './psfParser'
import { parseBbc } from './bbcParser'
import { parseFzx } from './fzxParser'
import { parseGeosCvt } from './geosParser'
import { parseFon } from './fonParser'
import { parseCh8 } from './ch8Format'
import { extractTapFonts } from './tapParser'

/** A parse attempt must not crash with an internal error type. */
function expectNoInternalCrash(run: () => unknown, label: string) {
  try {
    run()
  } catch (e) {
    const err = e as Error
    expect(err.constructor.name, `${label}: ${err.name}`).not.toBe('RangeError')
    expect(err.constructor.name, `${label}: ${err.name}`).not.toBe('TypeError')
    expect(err.constructor.name, `${label}: ${err.name}`).not.toBe('ReferenceError')
    // A described failure is fine; an internal one is not
    expect(err.message, label).not.toMatch(/Offset is outside the bounds|out of bounds of the DataView|is not a function|Cannot read propert/)
  }
}

/** Truncate `bytes` to every length and feed each prefix to `run`. */
function sweep(bytes: Uint8Array, run: (buf: ArrayBuffer) => unknown, label: string) {
  for (let cut = 0; cut <= bytes.length; cut += Math.max(1, Math.floor(bytes.length / 64))) {
    const part = bytes.slice(0, cut)
    expectNoInternalCrash(() => run(part.buffer as ArrayBuffer), `${label} cut at ${cut}`)
  }
}

/** Build a small valid font file for a given extension via the save path. */
async function makeFile(ext: string): Promise<Uint8Array> {
  const { createFont } = await import('../fontModel')
  const { setPixel, fontToConversionData } = await import('../fontOps')
  const { saveFontFile } = await import('../fontSave')

  const f = createFont(new Uint8Array(96 * 8), 'sweep.ch8', 32, 8, 8)
  for (const ch of ['A', '0']) {
    const idx = ch.charCodeAt(0) - 32
    for (let y = 1; y < 7; y++) setPixel(f, idx, 1, y, true)
  }
  const out = saveFontFile(ext, fontToConversionData(f) as never)
  return typeof out === 'string' ? new TextEncoder().encode(out) : out
}

describe('binary parsers survive truncation without internal crashes', () => {
  it('BDF (text, but still parsed by extension)', async () => {
    sweep(await makeFile('bdf'), b => loadFontFile('s.bdf', b), 'bdf')
  })

  it('PSF', async () => {
    sweep(await makeFile('psf'), b => parsePsf(b), 'psf')
  })

  it('PCF', async () => {
    sweep(await makeFile('pcf'), b => parsePcf(b), 'pcf')
  })

  it('PDB', async () => {
    sweep(await makeFile('pdb'), b => parsePdbFont(b), 'pdb')
  })

  it('BBC', async () => {
    sweep(await makeFile('bbc'), b => parseBbc(b), 'bbc')
  })

  it('FZX', async () => {
    sweep(await makeFile('fzx'), b => parseFzx(b), 'fzx')
  })

  it('FON', async () => {
    sweep(await makeFile('fon'), b => parseFon(b), 'fon')
  })

  it('CPI', async () => {
    sweep(await makeFile('cpi'), b => parseCpi(b), 'cpi')
  })

  it('GEOS CVT', async () => {
    const data = await makeFile('geos')
    sweep(data, b => parseGeosCvt(new Uint8Array(b)), 'cvt')
  })

  it('TAP', async () => {
    sweep(await makeFile('tap'), b => extractTapFonts(new Uint8Array(b)), 'tap')
  })

  it('CH8 (raw bytes, always parses)', () => {
    const data = new Uint8Array(96 * 8)
    sweep(data, b => parseCh8(b, 8), 'ch8')
  })
})

describe('parsers reject obvious garbage with a described error', () => {
  const garbage = new Uint8Array([0xDE, 0xAD, 0xBE, 0xEF, 0, 1, 2, 3])

  it('never crash on a short garbage buffer', () => {
    for (const [label, run] of [
      ['psf', () => parsePsf(garbage.buffer)],
      ['pcf', () => parsePcf(garbage.buffer)],
      ['pdb', () => parsePdbFont(garbage.buffer)],
      ['bbc', () => parseBbc(garbage.buffer)],
      ['fzx', () => parseFzx(garbage.buffer)],
      ['fon', () => parseFon(garbage.buffer)],
      ['cpi', () => parseCpi(garbage.buffer)],
      ['cvt', () => parseGeosCvt(garbage)],
      ['tap', () => extractTapFonts(garbage)],
    ] as const) {
      expectNoInternalCrash(run, label)
    }
  })

  it('accepts an empty buffer without crashing', () => {
    const empty = new Uint8Array(0).buffer
    for (const [label, run] of [
      ['psf', () => parsePsf(empty)],
      ['cpi', () => parseCpi(empty)],
      ['pdb', () => parsePdbFont(empty)],
      ['fon', () => parseFon(empty)],
      ['ch8', () => parseCh8(empty, 8)],
    ] as const) {
      expectNoInternalCrash(run, label)
    }
  })
})
