// Write BDF (Bitmap Distribution Format) font files from our internal format.

import type { FontMeta, GlyphMeta } from './bdfParser'

interface BdfWriteParams {
  fontData: Uint8Array
  glyphWidth: number
  glyphHeight: number
  startChar: number
  glyphCount: number
  baseline: number
  meta: FontMeta | null
  glyphMeta: (GlyphMeta | null)[] | null
  fontName?: string
}

// BDF properties that are defined as integers per the spec
const NUMERIC_PROPS = new Set([
  'FONT_ASCENT', 'FONT_DESCENT', 'DEFAULT_CHAR', 'PIXEL_SIZE', 'POINT_SIZE',
  'RESOLUTION_X', 'RESOLUTION_Y', 'AVERAGE_WIDTH', 'SPACING', 'CAP_HEIGHT',
  'X_HEIGHT', 'QUAD_WIDTH', 'WEIGHT', 'RESOLUTION', 'STRIKEOUT_ASCENT',
  'STRIKEOUT_DESCENT', 'SUBSCRIPT_X', 'SUBSCRIPT_Y', 'SUBSCRIPT_SIZE',
  'SUPERSCRIPT_X', 'SUPERSCRIPT_Y', 'SUPERSCRIPT_SIZE', 'FIGURE_WIDTH',
  'AVG_CAPITAL_WIDTH', 'AVG_LOWERCASE_WIDTH', 'UNDERLINE_POSITION',
  'UNDERLINE_THICKNESS', 'RAW_ASCENT', 'RAW_DESCENT', 'NORM_SPACE',
  'RELATIVE_WEIGHT', 'RELATIVE_SETWIDTH', 'ITALIC_ANGLE', 'DESTINATION',
  'MIN_SPACE', 'MAX_SPACE', 'END_SPACE',
])

export function writeBdf(params: BdfWriteParams): string {
  const { fontData, glyphWidth: w, glyphHeight: h, startChar, glyphCount, baseline, meta, glyphMeta, fontName: paramFontName } = params
  const bpr = Math.ceil(w / 8)
  const bpg = h * bpr
  const lines: string[] = []

  const fontName = meta?.fontName || `-misc-unknown-medium-r-normal--${h}-${h * 10}-75-75-c-${w * 10}-iso10646-1`

  lines.push(`STARTFONT 2.1`)
  lines.push(`FONT ${fontName}`)
  lines.push(`SIZE ${meta?.pointSize || h} ${meta?.xDpi || 75} ${meta?.yDpi || 75}`)
  lines.push(`FONTBOUNDINGBOX ${w} ${h} 0 ${-(h - baseline)}`)

  // Properties
  const props = meta?.properties ? { ...meta.properties } : {} as Record<string, string>
  if (paramFontName && !('FAMILY_NAME' in props)) props['FAMILY_NAME'] = paramFontName
  if (!('FONT_ASCENT' in props)) props['FONT_ASCENT'] = String(baseline)
  if (!('FONT_DESCENT' in props)) props['FONT_DESCENT'] = String(h - baseline)
  const propKeys = Object.keys(props)
  if (propKeys.length > 0) {
    lines.push(`STARTPROPERTIES ${propKeys.length}`)
    for (const key of propKeys) {
      const val = props[key]
      if (NUMERIC_PROPS.has(key) && /^-?\d+$/.test(val)) {
        lines.push(`${key} ${val}`)
      } else {
        lines.push(`${key} "${val}"`)
      }
    }
    lines.push('ENDPROPERTIES')
  }

  // Determine which glyphs to include: skip empty ones unless space or has metadata
  const includeIdx: number[] = []
  for (let i = 0; i < glyphCount; i++) {
    const charCode = startChar + i
    const gm = glyphMeta?.[i]
    if (charCode === 0x20 || gm) { includeIdx.push(i); continue }
    const offset = i * bpg
    let hasPixels = false
    for (let b = 0; b < bpg; b++) {
      if (fontData[offset + b]) { hasPixels = true; break }
    }
    if (hasPixels) includeIdx.push(i)
  }

  lines.push(`CHARS ${includeIdx.length}`)

  const bbOffY = -(h - baseline)

  for (const i of includeIdx) {
    const charCode = startChar + i
    const gm = glyphMeta?.[i]
    const name = gm?.name || (charCode >= 33 && charCode <= 126 ? String.fromCharCode(charCode) : `char${charCode}`)

    lines.push(`STARTCHAR ${name}`)
    lines.push(`ENCODING ${charCode}`)
    if (gm?.swidth) {
      lines.push(`SWIDTH ${gm.swidth[0]} ${gm.swidth[1]}`)
    } else {
      lines.push(`SWIDTH ${w * 72} 0`)
    }
    if (gm?.dwidth) {
      lines.push(`DWIDTH ${gm.dwidth[0]} ${gm.dwidth[1]}`)
    } else {
      lines.push(`DWIDTH ${w} 0`)
    }
    lines.push(`BBX ${w} ${h} 0 ${bbOffY}`)
    lines.push('BITMAP')

    const offset = i * bpg
    for (let y = 0; y < h; y++) {
      let hex = ''
      for (let b = 0; b < bpr; b++) {
        hex += fontData[offset + y * bpr + b].toString(16).toUpperCase().padStart(2, '0')
      }
      lines.push(hex)
    }
    lines.push('ENDCHAR')
  }

  lines.push('ENDFONT')
  lines.push('')
  return lines.join('\n')
}
