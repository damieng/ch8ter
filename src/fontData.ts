// Shared font loading and saving logic used by both the web UI and CLI.
// No DOM or Preact dependencies — pure TypeScript operating on ArrayBuffer/Uint8Array.

import type { FontMeta, GlyphMeta } from './fileFormats/bdfParser'
import { parseBdf } from './fileFormats/bdfParser'
import { parsePsf, type PsfParseResult } from './fileFormats/psfParser'
import { parseYaff } from './fileFormats/yaffParser'
import { parseDraw } from './fileFormats/drawParser'
import { parseFzx } from './fileFormats/fzxParser'
import { openFnt } from './fileFormats/fntOpener'
import { openCom } from './fileFormats/comOpener'
import { parsePcf } from './fileFormats/pcfParser'
import { parsePdbFont } from './fileFormats/pdbFontParser'
import { parseCh8 } from './fileFormats/ch8Format'
import { parseAmigaFont, isAmigaHunk } from './fileFormats/amigaFontParser'
import { writeBdf } from './fileFormats/bdfWriter'
import { writePsf } from './fileFormats/psfWriter'
import { writeYaff } from './fileFormats/yaffWriter'
import { writeDraw } from './fileFormats/drawWriter'
import { writeFzx } from './fileFormats/fzxWriter'
import { writeGdosFont } from './fileFormats/gdosFontWriter'
import { exportCpm } from './fileFormats/cpmExport'
import { writePcf } from './fileFormats/pcfWriter'
import { writeAmigaFont } from './fileFormats/amigaFontWriter'
import { parseBbc, isBbcFont } from './fileFormats/bbcParser'
import { writeBbc } from './fileFormats/bbcWriter'
import { writeEgaCom } from './fileFormats/egaComWriter'
import { writeAtari8Bit } from './fileFormats/atari8BitWriter'
import { writePdbFont } from './fileFormats/pdbFontWriter'

export interface FontConversionData {
  fontData: Uint8Array
  glyphWidth: number
  glyphHeight: number
  startChar: number
  glyphCount: number
  baseline: number
  meta: FontMeta | null
  encodings: number[] | null
  glyphMeta: (GlyphMeta | null)[] | null
  populated: Set<number> | null
  fontName: string
}

function layoutPsfGlyphs(psf: PsfParseResult): {
  fontData: Uint8Array
  startChar: number
  populated: Set<number> | null
} {
  const bpr = Math.ceil(psf.glyphWidth / 8)
  const bpg = psf.glyphHeight * bpr

  if (psf.unicodeMap && psf.unicodeMap.size > 0) {
    let minCp = 0x7fffffff, maxCp = 0
    for (const cp of psf.unicodeMap.keys()) {
      if (cp < minCp) minCp = cp
      if (cp > maxCp) maxCp = cp
    }
    const totalSlots = maxCp - minCp + 1
    const out = new Uint8Array(totalSlots * bpg)
    const populated = new Set<number>()
    for (const [cp, glyphIdx] of psf.unicodeMap) {
      const srcOff = glyphIdx * bpg
      const idx = cp - minCp
      out.set(psf.fontData.subarray(srcOff, srcOff + bpg), idx * bpg)
      populated.add(idx)
    }
    return { fontData: out, startChar: minCp, populated }
  }

  return { fontData: psf.fontData, startChar: 0, populated: null }
}

function populatedFromGlyphMeta(glyphMeta: (GlyphMeta | null)[]): Set<number> {
  const populated = new Set<number>()
  for (let j = 0; j < glyphMeta.length; j++) {
    if (glyphMeta[j] !== null) populated.add(j)
  }
  return populated
}

function baseName(filename: string): string {
  const base = filename.replace(/^.*[\\/]/, '')
  return base.replace(/\.\w+$/i, '')
}

export interface LoadOptions {
  width?: number
  height?: number
  startChar?: number
}

export function loadFontFile(
  filename: string,
  buf: ArrayBuffer,
  options?: LoadOptions,
): FontConversionData {
  const lower = filename.toLowerCase()
  const name = baseName(filename)
  const w = options?.width ?? 8
  const h = options?.height ?? 8

  if (lower.endsWith('.draw')) {
    const text = new TextDecoder().decode(buf)
    const result = parseDraw(text)
    const bpr = Math.ceil(result.glyphWidth / 8)
    const count = result.fontData.length / (result.glyphHeight * bpr)
    return {
      fontData: result.fontData, glyphWidth: result.glyphWidth, glyphHeight: result.glyphHeight,
      startChar: result.startChar, glyphCount: count, baseline: result.glyphHeight - 2,
      meta: null, encodings: null, glyphMeta: null,
      populated: result.populated, fontName: name,
    }
  }

  if (lower.endsWith('.yaff')) {
    const text = new TextDecoder().decode(buf)
    const result = parseYaff(text)
    const bpr = Math.ceil(result.glyphWidth / 8)
    const count = result.fontData.length / (result.glyphHeight * bpr)
    return {
      fontData: result.fontData, glyphWidth: result.glyphWidth, glyphHeight: result.glyphHeight,
      startChar: result.startChar, glyphCount: count, baseline: result.glyphHeight - 2,
      meta: null, encodings: null, glyphMeta: null,
      populated: result.populated, fontName: result.name || name,
    }
  }

  if (lower.endsWith('.bdf')) {
    const text = new TextDecoder().decode(buf)
    const result = parseBdf(text)
    const bpr = Math.ceil(result.glyphWidth / 8)
    const count = result.fontData.length / (result.glyphHeight * bpr)
    return {
      fontData: result.fontData, glyphWidth: result.glyphWidth, glyphHeight: result.glyphHeight,
      startChar: result.startChar, glyphCount: count,
      baseline: result.baseline ?? result.glyphHeight - 2,
      meta: result.meta, encodings: result.encodings, glyphMeta: result.glyphMeta,
      populated: populatedFromGlyphMeta(result.glyphMeta), fontName: result.meta.family || name,
    }
  }

  if (lower.endsWith('.psf') || lower.endsWith('.psfu')) {
    const result = parsePsf(buf)
    const layout = layoutPsfGlyphs(result)
    const bpr = Math.ceil(result.glyphWidth / 8)
    const count = layout.fontData.length / (result.glyphHeight * bpr)
    return {
      fontData: layout.fontData, glyphWidth: result.glyphWidth, glyphHeight: result.glyphHeight,
      startChar: layout.startChar, glyphCount: count, baseline: result.glyphHeight - 2,
      meta: null, encodings: null, glyphMeta: null,
      populated: layout.populated, fontName: name,
    }
  }

  if (lower.endsWith('.fzx')) {
    const result = parseFzx(buf)
    const bpr = Math.ceil(result.glyphWidth / 8)
    const count = result.fontData.length / (result.glyphHeight * bpr)
    return {
      fontData: result.fontData, glyphWidth: result.glyphWidth, glyphHeight: result.glyphHeight,
      startChar: result.startChar, glyphCount: count, baseline: result.glyphHeight - 2,
      meta: null, encodings: null, glyphMeta: result.glyphMeta,
      populated: result.populated, fontName: name,
    }
  }

  if (lower.endsWith('.fnt')) {
    const result = openFnt(buf)
    const bpr = Math.ceil(result.glyphWidth / 8)
    const count = result.fontData.length / (result.glyphHeight * bpr)
    return {
      fontData: result.fontData, glyphWidth: result.glyphWidth, glyphHeight: result.glyphHeight,
      startChar: result.startChar, glyphCount: count, baseline: result.baseline,
      meta: result.meta ?? null, encodings: null, glyphMeta: result.glyphMeta,
      populated: result.populated, fontName: (result.meta as { family?: string } | null)?.family || name,
    }
  }

  if (lower.endsWith('.pcf')) {
    const result = parsePcf(buf)
    const bpr = Math.ceil(result.glyphWidth / 8)
    const count = result.fontData.length / (result.glyphHeight * bpr)
    return {
      fontData: result.fontData, glyphWidth: result.glyphWidth, glyphHeight: result.glyphHeight,
      startChar: result.startChar, glyphCount: count,
      baseline: result.baseline ?? result.glyphHeight - 2,
      meta: result.meta, encodings: result.encodings, glyphMeta: result.glyphMeta,
      populated: populatedFromGlyphMeta(result.glyphMeta), fontName: result.meta.family || name,
    }
  }

  if (lower.endsWith('.pdb')) {
    const result = parsePdbFont(buf)
    const bpr = Math.ceil(result.glyphWidth / 8)
    const count = result.fontData.length / (result.glyphHeight * bpr)
    return {
      fontData: result.fontData, glyphWidth: result.glyphWidth, glyphHeight: result.glyphHeight,
      startChar: result.startChar, glyphCount: count, baseline: result.baseline,
      meta: result.meta, encodings: null, glyphMeta: result.glyphMeta,
      populated: result.populated, fontName: result.meta?.family || name,
    }
  }

  if (lower.endsWith('.com')) {
    const result = openCom(buf)
    return {
      fontData: result.fontData, glyphWidth: result.glyphWidth, glyphHeight: result.glyphHeight,
      startChar: result.startChar, glyphCount: result.fontData.length / result.glyphHeight,
      baseline: result.glyphHeight - 2,
      meta: null, encodings: null, glyphMeta: null,
      populated: null, fontName: name,
    }
  }

  // Detect Amiga hunk files (no standard extension — numeric filenames like "10", "15")
  if (isAmigaHunk(buf)) {
    const result = parseAmigaFont(buf)
    const bpr = Math.ceil(result.glyphWidth / 8)
    const count = result.fontData.length / (result.glyphHeight * bpr)
    return {
      fontData: result.fontData, glyphWidth: result.glyphWidth, glyphHeight: result.glyphHeight,
      startChar: result.startChar, glyphCount: count, baseline: result.baseline,
      meta: result.meta, encodings: null, glyphMeta: result.glyphMeta,
      populated: result.populated, fontName: result.meta?.family || name,
    }
  }

  if (lower.endsWith('.bbc')) {
    const result = parseBbc(buf)
    return {
      fontData: result.fontData, glyphWidth: 8, glyphHeight: 8,
      startChar: result.startChar, glyphCount: result.fontData.length / 8,
      baseline: 6, meta: null, encodings: null, glyphMeta: null,
      populated: result.populated, fontName: name,
    }
  }


  // Detect BBC Micro soft-font (VDU23 sequences)
  if (isBbcFont(buf)) {
    const result = parseBbc(buf)
    return {
      fontData: result.fontData, glyphWidth: 8, glyphHeight: 8,
      startChar: result.startChar, glyphCount: result.fontData.length / 8,
      baseline: 6, meta: null, encodings: null, glyphMeta: null,
      populated: result.populated, fontName: name,
    }
  }

  // Raw formats: .ch8
  const bpg = h // 8px wide = 1 byte per row × h rows
  const fontData = parseCh8(buf, bpg)
  const count = fontData.length / bpg
  const start = options?.startChar ?? 32
  return {
    fontData, glyphWidth: w, glyphHeight: h,
    startChar: start, glyphCount: count, baseline: h - 2,
    meta: null, encodings: null, glyphMeta: null,
    populated: null, fontName: name,
  }
}

export function saveFontFile(ext: string, data: FontConversionData): Uint8Array | string {
  const e = ext.toLowerCase().replace(/^\./, '')

  switch (e) {
    case 'ch8':
      return new Uint8Array(data.fontData)

    case 'bdf':
      return writeBdf({
        fontData: data.fontData, glyphWidth: data.glyphWidth, glyphHeight: data.glyphHeight,
        startChar: data.startChar, glyphCount: data.glyphCount, baseline: data.baseline,
        meta: data.meta, glyphMeta: data.glyphMeta, fontName: data.fontName,
      })

    case 'psf':
      return writePsf({
        fontData: data.fontData, glyphWidth: data.glyphWidth, glyphHeight: data.glyphHeight,
        startChar: data.startChar, glyphCount: data.glyphCount,
      })

    case 'yaff':
      return writeYaff({
        fontData: data.fontData, glyphWidth: data.glyphWidth, glyphHeight: data.glyphHeight,
        startChar: data.startChar, glyphCount: data.glyphCount,
        name: data.fontName,
      })

    case 'draw':
      return writeDraw({
        fontData: data.fontData, glyphWidth: data.glyphWidth, glyphHeight: data.glyphHeight,
        startChar: data.startChar, glyphCount: data.glyphCount,
      })

    case 'fzx':
      return writeFzx({
        fontData: data.fontData, glyphWidth: data.glyphWidth, glyphHeight: data.glyphHeight,
        startChar: data.startChar, glyphCount: data.glyphCount, glyphMeta: data.glyphMeta,
      })

    case 'fnt':
      return writeGdosFont({
        fontData: data.fontData, glyphWidth: data.glyphWidth, glyphHeight: data.glyphHeight,
        startChar: data.startChar, glyphCount: data.glyphCount, glyphMeta: data.glyphMeta,
        baseline: data.baseline, ascender: data.meta?.fontAscent ?? data.baseline,
        descender: data.meta?.fontDescent ?? (data.glyphHeight - data.baseline - 1),
        name: data.fontName, fontName: data.fontName, meta: data.meta,
      })

    case 'pcf':
      return writePcf({
        fontData: data.fontData, glyphWidth: data.glyphWidth, glyphHeight: data.glyphHeight,
        startChar: data.startChar, glyphCount: data.glyphCount, baseline: data.baseline,
        meta: data.meta, glyphMeta: data.glyphMeta, fontName: data.fontName,
      })

    case 'pdb':
      return writePdbFont({
        fontData: data.fontData, glyphWidth: data.glyphWidth, glyphHeight: data.glyphHeight,
        startChar: data.startChar, glyphCount: data.glyphCount, baseline: data.baseline,
        meta: data.meta, glyphMeta: data.glyphMeta, fontName: data.fontName,
      })

    case 'amiga':
      return writeAmigaFont({
        fontData: data.fontData, glyphWidth: data.glyphWidth, glyphHeight: data.glyphHeight,
        startChar: data.startChar, glyphCount: data.glyphCount, baseline: data.baseline,
        meta: data.meta, glyphMeta: data.glyphMeta, fontName: data.fontName,
      })

    case 'atari8':
      return writeAtari8Bit(data.fontData, data.startChar)

    case 'ega':
      return writeEgaCom(data.fontData, data.glyphHeight)

    case 'bbc':
      return writeBbc(data.fontData, data.startChar, data.glyphCount)

    case 'com':
      return exportCpm(data.glyphHeight, data.fontData)

    default:
      throw new Error(`Unsupported output format: .${e}`)
  }
}
