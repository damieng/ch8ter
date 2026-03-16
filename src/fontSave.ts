// Font file saving logic used by both the web UI and CLI.
// No DOM or Preact dependencies — pure TypeScript operating on ArrayBuffer/Uint8Array.

import type { FontConversionData } from './fontLoad'

import { writeBdf } from './fileFormats/bdfWriter'
import { writePsf } from './fileFormats/psfWriter'
import { writeYaff } from './fileFormats/yaffWriter'
import { writeDraw } from './fileFormats/drawWriter'
import { writeFzx } from './fileFormats/fzxWriter'
import { writeGdosFont } from './fileFormats/gdosFontWriter'
import { exportCpm } from './fileFormats/cpmExport'
import { writePcf } from './fileFormats/pcfWriter'
import { writeAmigaFont } from './fileFormats/amigaFontWriter'
import { writeBbc } from './fileFormats/bbcWriter'
import { writeEgaCom } from './fileFormats/egaComWriter'
import { writeAtari8Bit } from './fileFormats/atari8BitWriter'
import { writePdbFont } from './fileFormats/pdbFontWriter'

/** Formats whose output is text (useful for setting Blob MIME type). */
export const TEXT_FORMATS = new Set(['bdf', 'yaff', 'draw'])

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
        baseline: data.baseline,
        ascender: data.ascender ?? data.meta?.fontAscent ?? data.baseline,
        descender: data.descender ?? data.meta?.fontDescent ?? (data.glyphHeight - data.baseline - 1),
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
