// Format dispatch for dropped/opened files: decide what a file contains and
// describe it, without touching app state.
//
// This used to live inside AppPane.openFontBuffer, a 246-line function that
// mixed parsing, error dialogs, font creation and window management, and was
// untestable as a result. Everything a branch needs is now returned as a
// descriptor; the component only applies the result.

import type { FontConversionData } from './fontLoad'
import { loadFontFile, UnknownFormatError } from './fontLoad'
import type { ContainerFont, ContainerMeta } from './store'
import type { Charset } from './charsets'
import type { ComSingleResult } from './fileFormats/comOpener'
import { parseFon } from './fileFormats/fonParser'
import { parseCpi } from './fileFormats/cpiParser'
import { decompressCpx } from './fileFormats/cpxDecoder'
import { extractTapFonts } from './fileFormats/tapParser'
import { parseGeosCvt } from './fileFormats/geosParser'
import { parseSbit, isSbitFont, type SbitStrike } from './fileFormats/sbitParser'
import { openCom } from './fileFormats/comOpener'
import { isBmFontText } from './fileFormats/bmFontParser'

/** A font ready to be added, plus the codepage to remember as the default. */
export interface FontDescriptor {
  /** Display name to give the font. */
  name: string
  /** Parsed font, or an error for the caller to show. */
  result: FontConversionData
}

export interface ContainerDescriptor {
  /** File name to record on the container. */
  fileName: string
  /** Short format label, e.g. "CPI (FONT)" or "ZX Spectrum TAP". */
  format: string
  meta: ContainerMeta | null
  fonts: ContainerFont[]
}

/** What opening a file produced: fonts, a container, a raw-import prompt, or an error. */
export type OpenOutcome =
  /** One font to open directly (the generic path). */
  | { kind: 'font'; descriptor: FontDescriptor }
  /** Several fonts to open directly, sharing one codepage (.com images). */
  | { kind: 'fonts'; descriptors: FontDescriptor[]; charsetKey: Charset }
  /** Several fonts, shown as a container. */
  | { kind: 'container'; descriptor: ContainerDescriptor }
  /** Not a recognised font; hand it to the raw import dialog. */
  | { kind: 'raw'; name: string; buffer: ArrayBuffer }
  /** Nothing usable; show this to the user. */
  | { kind: 'error'; title: string; message: string }

/** Map Windows dfCharSet value to a codepage number for display. */
export function winCharsetToCodepage(cs: number): number {
  switch (cs) {
    case 0: return 1252    // ANSI
    case 177: return 1255  // HEBREW
    case 178: return 1256  // ARABIC
    case 161: return 1253  // GREEK
    case 162: return 1254  // TURKISH
    case 186: return 1257  // BALTIC
    case 204: return 1251  // RUSSIAN
    case 238: return 1250  // EASTEUROPE
    case 222: return 874   // THAI
    case 128: return 932   // SHIFTJIS
    case 129: return 949   // HANGUL
    case 134: return 936   // GB2312
    case 136: return 950   // CHINESEBIG5
    case 255: return 437   // OEM
    default: return 0      // DEFAULT/SYMBOL/unknown
  }
}

function error(title: string, e: unknown): OpenOutcome {
  return { kind: 'error', title, message: (e as Error).message }
}

/**
 * Work out what `buf` contains, from the file name and its bytes.
 * Pure: no state is read or written, so the whole dispatch is testable.
 */
export function describeOpenedFile(name: string, buf: ArrayBuffer): OpenOutcome {
  const lower = name.toLowerCase()

  // .fon files are NE executables containing FNT font resources
  if (lower.endsWith('.fon')) {
    try {
      const result = parseFon(buf)
      const fonts: ContainerFont[] = result.fonts.map(f => ({
        label: `${f.fnt.glyphWidth}x${f.fnt.glyphHeight}`,
        codepage: winCharsetToCodepage(parseInt(f.fnt.meta?.properties?.CHARSET ?? '1')),
        deviceName: '',
        deviceType: 1,
        startChar: f.fnt.startChar,
        width: f.fnt.glyphWidth,
        height: f.fnt.glyphHeight,
        numChars: f.fnt.fontData.length / (f.fnt.glyphHeight * Math.ceil(f.fnt.glyphWidth / 8)),
        fontData: f.fnt.fontData,
        baseline: f.fnt.baseline,
        meta: f.fnt.meta,
        glyphMeta: f.fnt.glyphMeta,
        populated: f.fnt.populated,
        spacingMode: f.fnt.glyphMeta?.some(g => g?.dwidth && g.dwidth[0] > 0 && g.dwidth[0] !== f.fnt.glyphWidth)
          ? 'proportional'
          : 'monospace',
      }))
      return {
        kind: 'container',
        descriptor: { fileName: name, format: 'Windows FON (NE)', meta: null, fonts },
      }
    } catch (e) {
      return error('Failed to open FON', e)
    }
  }

  // .cpx files are UPX-compressed .cpi  —  decompress and re-dispatch
  if (lower.endsWith('.cpx')) {
    try {
      const cpiData = decompressCpx(new Uint8Array(buf))
      return describeOpenedFile(name.replace(/\.cpx$/i, '.cpi'), cpiData.buffer as ArrayBuffer)
    } catch (e) {
      return error('Failed to decompress CPX', e)
    }
  }

  // .cpi files are font containers  —  show in container pane
  if (lower.endsWith('.cpi')) {
    try {
      const result = parseCpi(buf)
      if (result.fonts.length === 0) {
        return {
          kind: 'error',
          title: 'No bitmap data',
          message: `${name} contains no bitmap font data.\n\nThis CPI file only contains escape sequences for selecting built-in printer fonts  —  there are no downloadable character bitmaps to edit.`,
        }
      }
      const fonts: ContainerFont[] = result.fonts.map(f => ({
        label: `CP${f.codepage} ${f.width}x${f.height} (${f.deviceName})`,
        codepage: f.codepage,
        deviceName: f.deviceName,
        deviceType: f.deviceType,
        startChar: 0,
        width: f.width,
        height: f.height,
        numChars: f.numChars,
        fontData: f.fontData,
      }))
      return {
        kind: 'container',
        descriptor: {
          fileName: name,
          format: `CPI (${result.variant})`,
          meta: { properties: result.properties },
          fonts,
        },
      }
    } catch (e) {
      return error('Failed to open CPI', e)
    }
  }

  // TAP files are ZX Spectrum tape images; extract font-sized CODE blocks
  if (lower.endsWith('.tap')) {
    try {
      const entries = extractTapFonts(new Uint8Array(buf))
      if (entries.length === 0) {
        return {
          kind: 'error',
          title: 'No fonts in TAP',
          message: `${name} contains no font-sized CODE blocks (768/1024/2048 bytes of 8x8 glyphs).`,
        }
      }
      const fonts: ContainerFont[] = entries.map(f => ({
        label: f.label,
        codepage: 0,
        deviceName: '',
        deviceType: 1,
        startChar: 0,
        width: 8,
        height: 8,
        numChars: f.numChars,
        fontData: f.fontData,
        charsetKey: 'zx',
      }))
      return {
        kind: 'container',
        descriptor: { fileName: name, format: 'ZX Spectrum TAP', meta: null, fonts },
      }
    } catch (e) {
      return error('Failed to open TAP', e)
    }
  }

  // CVT files are C64 GEOS fonts  —  one point size per VLIR record
  if (lower.endsWith('.cvt')) {
    try {
      const sets = parseGeosCvt(new Uint8Array(buf))
      if (sets.length === 0) {
        return { kind: 'error', title: 'No fonts in CVT', message: `${name} contains no glyph data.` }
      }
      const fonts: ContainerFont[] = sets.map(s => ({
        label: s.size > 0 ? `${s.size} pt` : 'mega',
        codepage: 0,
        deviceName: '',
        deviceType: 1,
        startChar: 0x20,
        width: s.glyphWidth,
        height: s.glyphHeight,
        numChars: s.populated.size,
        fontData: s.fontData,
        baseline: s.ascent,
        glyphMeta: s.glyphMeta,
        populated: s.populated,
        spacingMode: 'proportional',
        charsetKey: 'iso8859_1',
      }))
      return {
        kind: 'container',
        descriptor: { fileName: name, format: 'C64 GEOS font', meta: null, fonts },
      }
    } catch (e) {
      return error('Failed to open GEOS font', e)
    }
  }

  // TTF/OTF files  —  only useful here if they carry embedded bitmaps
  if (lower.endsWith('.ttf') || lower.endsWith('.otf')) {
    if (!isSbitFont(buf)) {
      return {
        kind: 'error',
        title: 'No bitmap data',
        message: 'This TTF/OTF font contains only vector outlines  —  no embedded bitmaps found.',
      }
    }
    try {
      const result = parseSbit(buf)
      if (result.strikes.length === 1) {
        // Single strike  —  open as a regular font
        return { kind: 'font', descriptor: { name, result: sbitStrikeToConversionData(result.strikes[0], name) } }
      }
      const fonts: ContainerFont[] = result.strikes.map(s => ({
        label: `${s.ppemX}×${s.ppemY}`,
        codepage: 0,
        deviceName: '',
        deviceType: 1,
        startChar: s.startChar,
        width: s.glyphWidth,
        height: s.glyphHeight,
        numChars: s.populated.size,
        fontData: s.fontData,
        baseline: s.baseline,
        meta: s.meta,
        glyphMeta: s.glyphMeta,
        populated: s.populated,
        spacingMode: s.spacingMode,
      }))
      return {
        kind: 'container',
        descriptor: { fileName: name, format: 'TTF sbit', meta: null, fonts },
      }
    } catch (e) {
      return error('Failed to open TTF', e)
    }
  }

  // .com files can contain several fonts, all on the same codepage
  if (lower.endsWith('.com')) {
    try {
      const results = openCom(buf)
      if (results.length === 0) {
        return { kind: 'error', title: 'No fonts in COM', message: `${name} contains no font data.` }
      }
      const charsetKey = results[0].source === 'cpm' ? 'cpm' : 'cp437'
      return {
        kind: 'fonts',
        descriptors: results.map(result => ({
          // Several fonts in one .com are told apart by their cell size
          name: results.length > 1 ? `${name} (${result.glyphWidth}×${result.glyphHeight})` : name,
          result: comResultToConversionData(result, charsetKey),
        })),
        charsetKey,
      }
    } catch (e) {
      return error('Failed to open font', e)
    }
  }

  // BMFont text descriptors need their PNG pages
  if (lower.endsWith('.fnt') && isBmFontText(buf)) {
    return {
      kind: 'error',
      title: 'BMFont descriptor',
      message: `${name} is an AngelCode BMFont descriptor.\n\nDrop the .fnt file together with its PNG texture page(s) to open it.`,
    }
  }

  try {
    return { kind: 'font', descriptor: { name, result: loadFontFile(name, buf) } }
  } catch (e) {
    if (e instanceof UnknownFormatError) return { kind: 'raw', name, buffer: buf }
    return error('Failed to open font', e)
  }
}

/** Adapt a single .com font to the shape the generic font path expects. */
function comResultToConversionData(result: ComSingleResult, charsetKey: Charset): FontConversionData {
  const bpr = Math.ceil(result.glyphWidth / 8)
  const bpg = result.glyphHeight * bpr
  return {
    fontData: result.fontData,
    glyphWidth: result.glyphWidth,
    glyphHeight: result.glyphHeight,
    startChar: result.startChar,
    glyphCount: bpg > 0 ? Math.floor(result.fontData.length / bpg) : 0,
    baseline: result.glyphHeight - 1,
    meta: null,
    encodings: null,
    glyphMeta: null,
    populated: null,
    fontName: '',
    spacingMode: 'monospace',
    detectedCharset: charsetKey,
    useCalcMissing: false,
  }
}

/** Adapt one TTF sbit strike to the shape the generic font path expects. */
function sbitStrikeToConversionData(s: SbitStrike, name: string): FontConversionData {
  const bpr = Math.ceil(s.glyphWidth / 8)
  const bpg = s.glyphHeight * bpr
  return {
    fontData: s.fontData,
    glyphWidth: s.glyphWidth,
    glyphHeight: s.glyphHeight,
    startChar: s.startChar,
    glyphCount: bpg > 0 ? Math.floor(s.fontData.length / bpg) : 0,
    baseline: s.baseline,
    meta: s.meta,
    encodings: null,
    glyphMeta: s.glyphMeta,
    populated: s.populated,
    fontName: name,
    spacingMode: s.spacingMode,
    detectedCharset: 'iso8859_1',
    useCalcMissing: true,
  }
}
