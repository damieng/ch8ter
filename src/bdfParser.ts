// Parse BDF (Bitmap Distribution Format) font files into our internal format.

export interface FontMeta {
  format?: string       // e.g. 'BDF 2.1'
  fontName?: string     // FONT line
  copyright?: string    // COPYRIGHT property
  foundry?: string      // FOUNDRY property
  family?: string       // FAMILY_NAME property
  weight?: string       // WEIGHT_NAME property
  slant?: string        // SLANT property
  pointSize?: number    // SIZE line
  xDpi?: number
  yDpi?: number
  fontAscent?: number   // FONT_ASCENT property
  fontDescent?: number  // FONT_DESCENT property
  properties: Record<string, string>  // all STARTPROPERTIES values
}

export interface GlyphMeta {
  name?: string              // STARTCHAR name
  swidth?: [number, number]  // SWIDTH
  dwidth?: [number, number]  // DWIDTH
  bbx?: [number, number, number, number] // BBX w, h, offX, offY
}

export interface BdfParseResult {
  glyphWidth: number
  glyphHeight: number
  startChar: number
  fontData: Uint8Array
  meta: FontMeta
  encodings: number[] // per-glyph Unicode codepoint (index -> codepoint)
  glyphMeta: (GlyphMeta | null)[] // per-glyph metadata (index-aligned with encodings)
  baseline?: number   // row index (0-based from top)
}

// Fast hex nibble lookup
const H = new Uint8Array(128)
for (let i = 0; i < 10; i++) { H[48 + i] = i }       // '0'-'9'
for (let i = 0; i < 6; i++) { H[65 + i] = 10 + i }   // 'A'-'F'
for (let i = 0; i < 6; i++) { H[97 + i] = 10 + i }   // 'a'-'f'

function hexByte(a: number, b: number): number {
  return (H[a] << 4) | H[b]
}

export function parseBdf(text: string): BdfParseResult {
  const lines = text.split(/\r?\n/)
  let fontBBW = 0, fontBBH = 0, fontBBOffX = 0, fontBBOffY = 0
  const meta: FontMeta = { properties: {} }

  // First pass: header only (up to first STARTCHAR)
  let i = 0
  let inProps = false
  while (i < lines.length) {
    const line = lines[i]
    if (line.startsWith('STARTCHAR ')) break

    if (line.startsWith('STARTFONT ')) {
      meta.format = 'BDF ' + line.substring(10).trim()
    } else if (line.startsWith('FONT ')) {
      meta.fontName = line.substring(5).trim()
    } else if (line.startsWith('SIZE ')) {
      const parts = line.split(/\s+/)
      meta.pointSize = parseInt(parts[1])
      meta.xDpi = parseInt(parts[2])
      meta.yDpi = parseInt(parts[3])
    } else if (line.startsWith('FONTBOUNDINGBOX ')) {
      const parts = line.split(/\s+/)
      fontBBW = parseInt(parts[1])
      fontBBH = parseInt(parts[2])
      fontBBOffX = parseInt(parts[3])
      fontBBOffY = parseInt(parts[4])
    } else if (line.startsWith('STARTPROPERTIES')) {
      inProps = true
    } else if (line === 'ENDPROPERTIES') {
      inProps = false
    } else if (inProps) {
      const sp = line.indexOf(' ')
      if (sp > 0) {
        const key = line.substring(0, sp)
        let val = line.substring(sp + 1).trim()
        if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1)
        meta.properties[key] = val
        switch (key) {
          case 'COPYRIGHT': meta.copyright = val; break
          case 'FOUNDRY': meta.foundry = val; break
          case 'FAMILY_NAME': meta.family = val; break
          case 'WEIGHT_NAME': meta.weight = val; break
          case 'SLANT': meta.slant = val; break
          case 'FONT_ASCENT': meta.fontAscent = parseInt(val); break
          case 'FONT_DESCENT': meta.fontDescent = parseInt(val); break
        }
      }
    }
    i++
  }

  // Scan for encoding range and count (fast pre-scan)
  let minEnc = 0x7FFFFFFF, maxEnc = -1
  let glyphCount = 0
  for (let j = i; j < lines.length; j++) {
    const line = lines[j]
    if (line.startsWith('ENCODING ')) {
      const enc = parseInt(line.substring(9))
      if (enc >= 0) {
        if (enc < minEnc) minEnc = enc
        if (enc > maxEnc) maxEnc = enc
        glyphCount++
      }
    } else if (line === 'ENDFONT') {
      break
    }
  }

  if (glyphCount === 0) throw new Error('No glyphs found in BDF file')

  const cellW = fontBBW || 8
  const cellH = fontBBH || 16
  const totalGlyphs = maxEnc - minEnc + 1
  const bpr = Math.ceil(cellW / 8)
  const bpg = cellH * bpr
  const fontData = new Uint8Array(totalGlyphs * bpg)
  const encodings = new Array<number>(totalGlyphs)
  const glyphMetaArr: (GlyphMeta | null)[] = new Array(totalGlyphs).fill(null)
  for (let e = 0; e < totalGlyphs; e++) encodings[e] = minEnc + e
  // Main parse: write directly to fontData
  while (i < lines.length) {
    const line = lines[i]
    if (line === 'ENDFONT') break

    if (line.startsWith('STARTCHAR ')) {
      let encoding = -1
      let bbxW = fontBBW, bbxH = fontBBH, bbxOffX = fontBBOffX, bbxOffY = fontBBOffY
      const gm: GlyphMeta = { name: line.substring(10).trim() }
      i++

      // Parse glyph header
      while (i < lines.length) {
        const gl = lines[i]
        if (gl === 'BITMAP') { i++; break }
        if (gl.startsWith('ENCODING ')) {
          encoding = parseInt(gl.substring(9))
        } else if (gl.startsWith('SWIDTH ')) {
          const parts = gl.split(/\s+/)
          gm.swidth = [parseInt(parts[1]), parseInt(parts[2])]
        } else if (gl.startsWith('DWIDTH ')) {
          const parts = gl.split(/\s+/)
          gm.dwidth = [parseInt(parts[1]), parseInt(parts[2])]
        } else if (gl.startsWith('BBX ')) {
          const parts = gl.split(/\s+/)
          bbxW = parseInt(parts[1])
          bbxH = parseInt(parts[2])
          bbxOffX = parseInt(parts[3])
          bbxOffY = parseInt(parts[4])
          gm.bbx = [bbxW, bbxH, bbxOffX, bbxOffY]
        }
        i++
      }

      if (encoding < 0) {
        // Skip to ENDCHAR
        while (i < lines.length && lines[i] !== 'ENDCHAR') i++
        i++
        continue
      }

      const idx = encoding - minEnc
      glyphMetaArr[idx] = gm
      const base = idx * bpg
      const px = bbxOffX - fontBBOffX
      const py = (fontBBH + fontBBOffY) - (bbxOffY + bbxH)

      // Parse bitmap rows directly into output
      let row = 0
      while (i < lines.length) {
        const gl = lines[i]
        if (gl === 'ENDCHAR') break
        const destY = py + row
        if (destY >= 0 && destY < cellH) {
          // Parse hex string directly into output bytes
          const hexLen = gl.length
          let srcBit = 0
          for (let c = 0; c < hexLen - 1; c += 2) {
            const byte = hexByte(gl.charCodeAt(c), gl.charCodeAt(c + 1))
            for (let bit = 7; bit >= 0; bit--) {
              if (byte & (1 << bit)) {
                const destX = px + srcBit
                if (destX >= 0 && destX < cellW) {
                  fontData[base + destY * bpr + (destX >> 3)] |= (0x80 >> (destX & 7))
                }
              }
              srcBit++
            }
          }
        }
        row++
        i++
      }
    }
    i++
  }

  // Baseline: fontAscent rows from top (0-indexed)
  const baseline = meta.fontAscent != null ? meta.fontAscent : undefined

  return {
    glyphWidth: cellW,
    glyphHeight: cellH,
    startChar: minEnc,
    fontData,
    meta,
    encodings,
    glyphMeta: glyphMetaArr,
    baseline,
  }
}
