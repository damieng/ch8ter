// Font file loading — detects format by extension/magic bytes and returns unified FontConversionData.
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
import { parseBbc, isBbcFont } from './fileFormats/bbcParser'
import { parseSbit, isSbitFont } from './fileFormats/sbitParser'
import { bdfCharsetMap } from './charsets'
import { bpr } from './bitUtils'

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
  spacingMode: 'monospace' | 'proportional'
  detectedCharset: string
  useCalcMissing: boolean
  source?: string
  ascender?: number
  descender?: number
}

export interface LoadOptions {
  width?: number
  height?: number
  startChar?: number
}

export function baseName(filename: string): string {
  const base = filename.replace(/^.*[\\/]/, '')
  return base.replace(/\.\w+$/i, '')
}

// --- Internal helpers ---

function layoutPsfGlyphs(psf: PsfParseResult): {
  fontData: Uint8Array
  startChar: number
  populated: Set<number> | null
} {
  const rowBytes = bpr(psf.glyphWidth)
  const bpg = psf.glyphHeight * rowBytes

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

function detectPropSpacing(glyphMeta: (GlyphMeta | null)[] | null, glyphWidth: number): boolean {
  return glyphMeta?.some(gm => gm?.dwidth && gm.dwidth[0] > 0 && gm.dwidth[0] !== glyphWidth) ?? false
}

function detectBdfCharset(meta: FontMeta | null): string {
  if (meta?.properties) {
    const reg = meta.properties.CHARSET_REGISTRY ?? ''
    const enc = meta.properties.CHARSET_ENCODING ?? ''
    if (reg) {
      const mapped = bdfCharsetMap[`${reg}-${enc}`]
      if (mapped) return mapped
    }
  }
  return 'iso8859_1'
}

/** Build a FontConversionData with defaults, auto-computing glyphCount from fontData dimensions. */
function makeResult(
  fields: Partial<FontConversionData> & Pick<FontConversionData, 'fontData' | 'glyphWidth' | 'glyphHeight' | 'startChar' | 'fontName'>,
): FontConversionData {
  const rowBytes = bpr(fields.glyphWidth)
  const bpg = fields.glyphHeight * rowBytes
  return {
    glyphCount: bpg > 0 ? Math.floor(fields.fontData.length / bpg) : 0,
    baseline: fields.glyphHeight - 1,
    meta: null,
    encodings: null,
    glyphMeta: null,
    populated: null,
    spacingMode: 'monospace',
    detectedCharset: 'iso8859_1',
    useCalcMissing: false,
    ...fields,
  }
}

// --- Main loader ---

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
    const result = parseDraw(new TextDecoder().decode(buf))
    return makeResult({
      ...result, fontName: name,
    })
  }

  if (lower.endsWith('.yaff')) {
    const result = parseYaff(new TextDecoder().decode(buf))
    return makeResult({
      ...result, fontName: result.name || name,
    })
  }

  if (lower.endsWith('.bdf')) {
    const result = parseBdf(new TextDecoder().decode(buf))
    return makeResult({
      ...result, baseline: result.baseline ?? result.glyphHeight - 2,
      populated: populatedFromGlyphMeta(result.glyphMeta),
      fontName: result.meta.family || name,
      spacingMode: detectPropSpacing(result.glyphMeta, result.glyphWidth) ? 'proportional' : 'monospace',
      detectedCharset: detectBdfCharset(result.meta), useCalcMissing: true,
    })
  }

  if (lower.endsWith('.psf') || lower.endsWith('.psfu')) {
    const result = parsePsf(buf)
    const layout = layoutPsfGlyphs(result)
    return makeResult({
      fontData: layout.fontData, glyphWidth: result.glyphWidth, glyphHeight: result.glyphHeight,
      startChar: layout.startChar, populated: layout.populated, fontName: name,
    })
  }

  if (lower.endsWith('.fzx')) {
    const result = parseFzx(buf)
    return makeResult({
      ...result, fontName: name, spacingMode: 'proportional',
    })
  }

  if (lower.endsWith('.fnt')) {
    const result = openFnt(buf)
    return makeResult({
      ...result, meta: result.meta ?? null,
      fontName: (result.meta as { family?: string } | null)?.family || name,
      spacingMode: detectPropSpacing(result.glyphMeta, result.glyphWidth) ? 'proportional' : 'monospace',
      detectedCharset: result.source === 'atari8bit' ? 'atari' : result.source === 'gdos' ? 'atarist' : 'iso8859_1',
      useCalcMissing: true, source: result.source,
      ascender: result.source === 'gdos' ? result.ascender : undefined,
      descender: result.source === 'gdos' ? result.descender : undefined,
    })
  }

  if (lower.endsWith('.pcf')) {
    const result = parsePcf(buf)
    return makeResult({
      ...result, baseline: result.baseline ?? result.glyphHeight - 2,
      populated: populatedFromGlyphMeta(result.glyphMeta),
      fontName: result.meta.family || name,
      spacingMode: detectPropSpacing(result.glyphMeta, result.glyphWidth) ? 'proportional' : 'monospace',
      detectedCharset: detectBdfCharset(result.meta), useCalcMissing: true,
    })
  }

  if (lower.endsWith('.pdb')) {
    const result = parsePdbFont(buf)
    return makeResult({
      ...result, fontName: result.meta?.family || name,
      spacingMode: detectPropSpacing(result.glyphMeta, result.glyphWidth) ? 'proportional' : 'monospace',
      detectedCharset: 'palmos', useCalcMissing: true,
    })
  }

  if (lower.endsWith('.com')) {
    const result = openCom(buf)[0]
    return makeResult({
      ...result, fontName: name,
      detectedCharset: result.source === 'cpm' ? 'cpm' : 'cp437',
      source: result.source,
    })
  }

  // TTF/OTF files
  if (lower.endsWith('.ttf') || lower.endsWith('.otf')) {
    if (!isSbitFont(buf))
      throw new Error('This TTF/OTF font contains only vector outlines — no embedded bitmaps found')
    const result = parseSbit(buf)
    // Use the largest strike for single-font loading
    const strike = result.strikes[result.strikes.length - 1]
    return makeResult({
      fontData: strike.fontData, glyphWidth: strike.glyphWidth, glyphHeight: strike.glyphHeight,
      startChar: strike.startChar, baseline: strike.baseline,
      meta: strike.meta, glyphMeta: strike.glyphMeta, populated: strike.populated,
      fontName: result.fontName || name,
      spacingMode: strike.spacingMode, useCalcMissing: true,
    })
  }

  // Detect Amiga hunk files (no standard extension — numeric filenames like "10", "15")
  if (isAmigaHunk(buf)) {
    const result = parseAmigaFont(buf)
    return makeResult({
      ...result, fontName: result.meta?.family || name,
      spacingMode: detectPropSpacing(result.glyphMeta, result.glyphWidth) ? 'proportional' : 'monospace',
      detectedCharset: 'amiga', useCalcMissing: true,
    })
  }

  if (lower.endsWith('.bbc') || isBbcFont(buf)) {
    const result = parseBbc(buf)
    return makeResult({
      fontData: result.fontData, glyphWidth: 8, glyphHeight: 8,
      startChar: result.startChar, baseline: 6,
      populated: result.populated, fontName: name,
      detectedCharset: 'bbc',
    })
  }

  if (lower.endsWith('.64c')) {
    const dataLen = Math.min(128 * 8, buf.byteLength - 2)
    return makeResult({
      fontData: new Uint8Array(buf, 2, dataLen), glyphWidth: 8, glyphHeight: 8,
      startChar: 0, baseline: 6, fontName: name,
      detectedCharset: 'c64',
    })
  }

  // Raw formats: .ch8
  return makeResult({
    fontData: parseCh8(buf, h), glyphWidth: w, glyphHeight: h,
    startChar: options?.startChar ?? 32, fontName: name,
    detectedCharset: 'zx',
  })
}
