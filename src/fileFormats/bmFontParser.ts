// Parse AngelCode BMFont descriptors (the text variant of .fnt).
//
// BMFont .fnt files come in text, XML and binary flavours; this supports the
// common text format. A descriptor references one or more PNG texture pages
// that hold the actual glyph pixels.

export interface BmFontChar {
  id: number       // unicode codepoint
  x: number
  y: number
  width: number
  height: number
  xoffset: number
  yoffset: number
  xadvance: number
  page: number
}

export interface BmFontDescriptor {
  face: string
  size: number
  lineHeight: number
  base: number
  scaleW: number
  scaleH: number
  pages: { id: number; file: string }[]
  chars: BmFontChar[]
}

/** Sniff whether an .fnt buffer is a BMFont text descriptor rather than a binary Windows/GDOS FNT. */
export function isBmFontText(buf: ArrayBuffer): boolean {
  const bytes = new Uint8Array(buf, 0, Math.min(8, buf.byteLength))
  let start = 0
  if (bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) start = 3 // UTF-8 BOM
  const prefix = String.fromCharCode(...bytes.subarray(start))
  return prefix.startsWith('info ')
}

function parseTokens(line: string): Map<string, string | number> {
  const tokens = new Map<string, string | number>()
  const re = /(\w+)="([^"]*)"|(\w+)=(-?\d+)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(line)) !== null) {
    if (m[1] !== undefined) tokens.set(m[1], m[2])
    else tokens.set(m[3], parseInt(m[4], 10))
  }
  return tokens
}

const num = (tokens: Map<string, string | number>, key: string, fallback = 0): number => {
  const v = tokens.get(key)
  return typeof v === 'number' ? v : fallback
}

export function parseBmFont(text: string): BmFontDescriptor {
  const desc: BmFontDescriptor = {
    face: '', size: 0, lineHeight: 0, base: 0, scaleW: 0, scaleH: 0,
    pages: [], chars: [],
  }

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line) continue
    const space = line.indexOf(' ')
    const section = space < 0 ? line : line.slice(0, space)
    const tokens = parseTokens(line)

    if (section === 'info') {
      desc.face = typeof tokens.get('face') === 'string' ? tokens.get('face') as string : ''
      desc.size = num(tokens, 'size')
    } else if (section === 'common') {
      desc.lineHeight = num(tokens, 'lineHeight')
      desc.base = num(tokens, 'base')
      desc.scaleW = num(tokens, 'scaleW')
      desc.scaleH = num(tokens, 'scaleH')
    } else if (section === 'page') {
      const file = tokens.get('file')
      desc.pages.push({ id: num(tokens, 'id'), file: typeof file === 'string' ? file : '' })
    } else if (section === 'char') {
      desc.chars.push({
        id: num(tokens, 'id'),
        x: num(tokens, 'x'),
        y: num(tokens, 'y'),
        width: num(tokens, 'width'),
        height: num(tokens, 'height'),
        xoffset: num(tokens, 'xoffset'),
        yoffset: num(tokens, 'yoffset'),
        xadvance: num(tokens, 'xadvance'),
        page: num(tokens, 'page'),
      })
    }
    // other sections (chars count, kerning(s), distance fields) are ignored
  }

  if (desc.pages.length === 0) {
    throw new Error('BMFont descriptor contains no page entries')
  }
  if (desc.chars.length === 0) {
    throw new Error('BMFont descriptor contains no chars entries')
  }
  return desc
}

/** A structural stand-in for ImageData so the glyph extractor stays testable. */
export interface PixelSource {
  width: number
  height: number
  data: Uint8ClampedArray
}

/**
 * Build an editable font from one descriptor page.
 * Glyphs are cut at their declared rects; a pixel is "on" when it differs
 * from the page's background (sampled from the top-left corner).
 */
export function buildFontFromPage(
  desc: BmFontDescriptor,
  pageIdx: number,
  image: PixelSource,
): {
  fontData: Uint8Array
  startChar: number
  glyphWidth: number
  glyphHeight: number
  glyphMeta: ({ dwidth: [number, number] } | null)[]
  populated: Set<number>
  spacingMode: 'monospace' | 'proportional'
  baseline: number
  fontName: string
} {
  const chars = desc.chars.filter(c => c.page === pageIdx)
  if (chars.length === 0) {
    throw new Error(`BMFont page ${pageIdx} has no chars`)
  }

  // Background = most frequent pixel color (dominates real atlas pages and
  // is robust to glyphs touching the corners, unlike a corner sample).
  const counts = new Map<number, number>()
  for (let i = 0; i < image.data.length; i += 4) {
    const key = (image.data[i] << 24) | (image.data[i + 1] << 16) | (image.data[i + 2] << 8) | image.data[i + 3]
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  let bgKey = 0, best = -1
  for (const [key, n] of counts) {
    if (n > best) { best = n; bgKey = key }
  }
  const bg = [(bgKey >>> 24) & 0xFF, (bgKey >>> 16) & 0xFF, (bgKey >>> 8) & 0xFF, bgKey & 0xFF]
  const isOn = (x: number, y: number): boolean => {
    const o = (y * image.width + x) * 4
    return image.data[o] !== bg[0] || image.data[o + 1] !== bg[1]
      || image.data[o + 2] !== bg[2] || image.data[o + 3] !== bg[3]
  }

  const maxId = Math.max(...chars.map(c => c.id))
  const minId = Math.min(...chars.map(c => c.id))
  const span = maxId - minId + 1
  if (span > 65536) {
    throw new Error(`BMFont character range too large (${minId}..${maxId}). Maximum is 65536 glyphs.`)
  }

  const cellW = Math.max(1, Math.max(...chars.map(c => c.width)))
  const cellH = Math.max(1, Math.max(...chars.map(c => c.yoffset + c.height)))
  const bpr = Math.ceil(cellW / 8)
  const bpg = cellH * bpr
  const fontData = new Uint8Array(span * bpg)
  const populated = new Set<number>()
  const glyphMeta: ({ dwidth: [number, number] } | null)[] = new Array(span).fill(null)

  for (const c of chars) {
    const idx = c.id - minId
    if (c.xadvance > 0) glyphMeta[idx] = { dwidth: [c.xadvance, 0] }
    for (let y = 0; y < c.height; y++) {
      for (let x = 0; x < c.width; x++) {
        const sx = c.x + x
        const sy = c.y + y
        if (sx < 0 || sx >= image.width || sy < 0 || sy >= image.height) continue
        if (!isOn(sx, sy)) continue
        const row = (c.yoffset + y) * bpr
        fontData[idx * bpg + row + ((c.xoffset + x) >> 3)] |= 0x80 >> ((c.xoffset + x) & 7)
      }
    }
    populated.add(idx)
  }

  const allFixed = chars.every(c => c.xadvance === cellW)
  return {
    fontData,
    startChar: minId,
    glyphWidth: cellW,
    glyphHeight: cellH,
    glyphMeta,
    populated,
    spacingMode: allFixed ? 'monospace' : 'proportional',
    baseline: Math.max(0, Math.min(cellH - 1, desc.base)),
    fontName: desc.face,
  }
}
