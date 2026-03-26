// Font file saving logic used by both the web UI and CLI.
// No DOM or Preact dependencies — pure TypeScript operating on ArrayBuffer/Uint8Array.

import type { FontMeta, GlyphMeta } from './fileFormats/bdfParser'
import type { FontConversionData } from './fontLoad'

/** Shared parameter interface accepted by all font format writers. */
export interface FontWriteData {
  fontData: Uint8Array
  glyphWidth: number
  glyphHeight: number
  startChar: number
  glyphCount: number
  baseline: number
  meta: FontMeta | null
  glyphMeta: (GlyphMeta | null)[] | null
  fontName: string
  ascender?: number
  descender?: number
}

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
    case 'ch8':   return new Uint8Array(data.fontData)
    case 'bdf':   return writeBdf(data)
    case 'psf':   return writePsf(data)
    case 'yaff':  return writeYaff(data)
    case 'draw':  return writeDraw(data)
    case 'fzx':   return writeFzx(data)
    case 'fnt':   return writeGdosFont(data)
    case 'pcf':   return writePcf(data)
    case 'pdb':   return writePdbFont(data)
    case 'amiga': return writeAmigaFont(data)
    case 'atari8': return writeAtari8Bit(data)
    case 'ega':   return writeEgaCom(data)
    case 'bbc':   return writeBbc(data)
    case 'com':   return exportCpm(data)
    default:
      throw new Error(`Unsupported output format: .${e}`)
  }
}
