// CP/M Plus .com font export — PSF2AMS format
// 512-byte header (PSF2AMS loader), glyph height at offset 0x2F, then 256 glyphs of font data

// Header template from a PSF2AMS-generated 8px font (lawson.com)
const HEADER_B64 = '6wTrw6cBtAm6MgHNIc0gDUZvbnQgY29udmVydGVkIHdpdGggUFNGMkFNUw0KGgAIAANSZXF1aXJlcyBDUEMsIFBDVywgUGNXMTYgb3IgU3BlY3RydW0gKzMgQ1AvTS4NCiROb3QgZW5vdWdoIG1lbW9yeSB0byBsb2FkIGZvbnQuDQokQ1JUUExVUyBkcml2ZXIgbm90IGxvYWRlZC4NCiRBTk5FMRqX6g8CDgzNBQD+MDAUKgEAEWYAGRGhAQYGGr4gSyMTEPgqBgDtSy4BBKftQnz+wBFiAQ4J2gUA7UsuASowARGAwO2wAQwAIeACEQDA7bAqLgEiAcDNzgLjALcoFP4BKBz+Aygj/kEoLhEyAQ4JwwUAIQAIIgHAzc4CAMDHIQAIIgHAIQC4GAMhADAiBMABAMDNzgLpAMchhAERQMDl1QEIAO2w0c3OAuwA0Q4J0gUAERDAASQAzboCDgAqMAHF3SGAwP0hkMAGCH4jy0AgBf13AP0j3XcA/XcA3SP9I913AP13AN0j/SMQ3+XtWzDAIYDAARAAzboC7VMwwO1bMsAhkMABFADNugLtUzLA4cENwmQCxyIHwO1TBMDtQwHAAQDAzc4C7wDJw9EC5dUqAQARVwAZIs8C0ePJAQAIEQCAIYDA7bDJ//////////////////////////8='

function decodeHeader(): Uint8Array {
  const bin = atob(HEADER_B64)
  const out = new Uint8Array(512)
  for (let i = 0; i < 512; i++) out[i] = bin.charCodeAt(i)
  return out
}

import type { FontWriteData } from '../fontSave'

export function exportCpm({ glyphHeight, glyphWidth, fontData }: FontWriteData): Uint8Array {
  if (glyphWidth > 8) throw new Error('CP/M export requires fonts 8 pixels or narrower')
  const bpg = glyphHeight
  const glyphs = 256
  const header = decodeHeader()
  header[0x2F] = glyphHeight

  const out = new Uint8Array(512 + glyphs * bpg)
  out.set(header, 0)
  // Copy up to 256 glyphs; pad with zeros if fewer are available
  out.set(fontData.subarray(0, Math.min(fontData.length, glyphs * bpg)), 512)
  return out
}
