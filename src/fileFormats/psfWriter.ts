// Write PSF2 font files from our internal format.

import { bpr, getBit } from '../bitUtils'
import { isGlyphEmpty } from './glyphUtils'
import type { FontWriteData } from '../fontSave'

const PSF2_MAGIC = 0x864AB572
const PSF2_HAS_UNICODE = 1

export function writePsf(params: FontWriteData): Uint8Array {
  const { fontData, glyphWidth: w, glyphHeight: h, startChar, glyphCount } = params
  const rowBytes = bpr(w)
  const bpg = h * rowBytes
  const headerSize = 32

  // Collect non-empty glyphs (keep space even if empty)
  const included: { srcIdx: number; cp: number }[] = []
  for (let i = 0; i < glyphCount; i++) {
    const cp = startChar + i
    if (cp === 0x20) { included.push({ srcIdx: i, cp }); continue }
    if (!isGlyphEmpty(fontData, i * bpg, bpg)) included.push({ srcIdx: i, cp })
  }

  const outCount = included.length

  // Build compacted bitmap and unicode table
  const bitmapData = new Uint8Array(outCount * bpg)
  const unicodeChunks: Uint8Array[] = []
  for (let g = 0; g < outCount; g++) {
    const srcOff = included[g].srcIdx * bpg
    bitmapData.set(fontData.subarray(srcOff, srcOff + bpg), g * bpg)

    const encoded = encodeUtf8(included[g].cp)
    const chunk = new Uint8Array(encoded.length + 1)
    chunk.set(encoded)
    chunk[encoded.length] = 0xFF
    unicodeChunks.push(chunk)
  }

  const unicodeSize = unicodeChunks.reduce((s, c) => s + c.length, 0)
  const totalSize = headerSize + outCount * bpg + unicodeSize
  const out = new Uint8Array(totalSize)
  const view = new DataView(out.buffer)

  // Header
  view.setUint32(0, PSF2_MAGIC, true)
  view.setUint32(4, 0, true) // version
  view.setUint32(8, headerSize, true)
  view.setUint32(12, PSF2_HAS_UNICODE, true) // flags
  view.setUint32(16, outCount, true)
  view.setUint32(20, bpg, true)
  view.setUint32(24, h, true)
  view.setUint32(28, w, true)

  // Glyph bitmaps
  out.set(bitmapData, headerSize)

  // Unicode table
  let off = headerSize + outCount * bpg
  for (const chunk of unicodeChunks) {
    out.set(chunk, off)
    off += chunk.length
  }

  return out
}

function encodeUtf8(cp: number): Uint8Array {
  if (cp < 0x80) return new Uint8Array([cp])
  if (cp < 0x800) return new Uint8Array([0xC0 | (cp >> 6), 0x80 | (cp & 0x3F)])
  if (cp < 0x10000) return new Uint8Array([0xE0 | (cp >> 12), 0x80 | ((cp >> 6) & 0x3F), 0x80 | (cp & 0x3F)])
  return new Uint8Array([0xF0 | (cp >> 18), 0x80 | ((cp >> 12) & 0x3F), 0x80 | ((cp >> 6) & 0x3F), 0x80 | (cp & 0x3F)])
}

// --- PSF1 ---

/**
 * Write a legacy PSF1 font: magic $36 $04, mode byte, char height byte,
 * then 256 fixed-8px glyphs (no Unicode table). Characters outside the
 * font's range are emitted blank.
 */
export function writePsf1(params: FontWriteData): Uint8Array {
  const { fontData, glyphWidth: w, glyphHeight: h, startChar, glyphCount } = params
  if (w > 8) throw new Error('PSF1 fonts are fixed at 8 pixels wide')
  if (h < 1 || h > 255) throw new Error('PSF1 height must be 1..255')

  const srcRowBytes = bpr(w)
  const out = new Uint8Array(4 + 256 * h)
  out[0] = 0x36
  out[1] = 0x04
  out[2] = 0 // mode: 256 characters, no Unicode table
  out[3] = h

  for (let charCode = 0; charCode < 256; charCode++) {
    const idx = charCode - startChar
    if (idx < 0 || idx >= glyphCount) continue
    const dstOff = 4 + charCode * h
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (getBit(fontData, idx * h * srcRowBytes + y * srcRowBytes, x)) {
          out[dstOff + y] |= 0x80 >> x
        }
      }
    }
  }
  return out
}
