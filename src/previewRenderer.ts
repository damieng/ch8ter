// Canvas rendering for the bitmap font text preview.

import type { FontInstance } from './store'
import { glyphAdvance } from './store'
import { isFixedWidth } from './unicodeRanges'

export interface RenderOptions {
  canvas: HTMLCanvasElement
  font: FontInstance
  lines: string[]
  attrs: number[][]
  scale: number
  cols: number
  fg: string
  bg: string
  cursorPos: { row: number; col: number } | null
  showCursor: boolean
  selected: Set<string>
  proportional: boolean
  lineHeight: number
}

export function renderText({
  canvas, font, lines, attrs, scale, cols, fg, bg,
  cursorPos, showCursor, selected, proportional, lineHeight,
}: RenderOptions) {
  const ctx = canvas.getContext('2d')!
  const data = font.fontData.value
  const startChar = font.startChar.value
  const gw = font.glyphWidth.value
  const gh = font.glyphHeight.value
  const bpr = Math.ceil(gw / 8)
  const bpg = gh * bpr
  const gc = bpg > 0 ? Math.floor(data.length / bpg) : 0
  const cellW = gw * scale
  const rowH = lineHeight * scale
  const glyphYOff = Math.floor((lineHeight - gh) / 2) * scale

  const rowCount = Math.max(1, lines.length)

  function drawGlyph(glyphIdx: number, gx: number, rowY: number) {
    const base = glyphIdx * bpg
    for (let y = 0; y < gh; y++) {
      const py = rowY + glyphYOff + y * scale
      if (py + scale <= rowY || py >= rowY + rowH) continue
      for (let x = 0; x < gw; x++) {
        const byteIdx = base + y * bpr + Math.floor(x / 8)
        if (data[byteIdx] & (0x80 >> (x % 8))) {
          ctx.fillRect(gx + x * scale, py, scale, scale)
        }
      }
    }
  }


  if (!proportional) {
    const newW = cols * cellW
    const newH = rowCount * rowH
    if (canvas.width !== newW) canvas.width = newW
    if (canvas.height !== newH) canvas.height = newH

    ctx.fillStyle = bg
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    for (let row = 0; row < lines.length; row++) {
      const line = lines[row]
      const rowAttrs = attrs[row] || []
      const oy = row * rowH
      for (let col = 0; col < line.length; col++) {
        const isSel = selected.has(`${row},${col}`)
        const inv = rowAttrs[col] === 1
        const cFg = inv ? bg : fg
        const cBg = inv ? fg : bg
        const ox = col * cellW

        if (inv) {
          ctx.fillStyle = cBg
          ctx.fillRect(ox, oy, cellW, rowH)
        }

        if (isSel) {
          ctx.fillStyle = cFg
          ctx.fillRect(ox, oy, cellW, rowH)
          ctx.fillStyle = cBg
        } else {
          ctx.fillStyle = cFg
        }

        const glyphIdx = line.charCodeAt(col) - startChar
        if (glyphIdx < 0 || glyphIdx >= gc) continue
        drawGlyph(glyphIdx, ox, oy)
      }
    }

    if (cursorPos && showCursor && selected.size === 0) {
      ctx.fillStyle = fg
      ctx.fillRect(cursorPos.col * cellW, cursorPos.row * rowH, scale, rowH)
    }
  } else {
    function charAdv(gi: number) {
      if (gi < 0 || gi >= gc) return cellW
      if (isFixedWidth(startChar + gi)) return cellW
      return glyphAdvance(font, gi) * scale
    }

    let maxLineWidth = 0
    for (const line of lines) {
      let w = 0
      for (let i = 0; i < line.length; i++) w += charAdv(line.charCodeAt(i) - startChar)
      if (w > maxLineWidth) maxLineWidth = w
    }

    const newW = Math.max(maxLineWidth, cols * cellW)
    const newH = rowCount * rowH
    if (canvas.width !== newW) canvas.width = newW
    if (canvas.height !== newH) canvas.height = newH

    ctx.fillStyle = bg
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    for (let row = 0; row < lines.length; row++) {
      let xPos = 0
      const rowAttrs = attrs[row] || []
      const oy = row * rowH
      for (let col = 0; col < lines[row].length; col++) {
        const charCode = lines[row].charCodeAt(col)
        const glyphIdx = charCode - startChar
        const isSel = selected.has(`${row},${col}`)
        const inv = rowAttrs[col] === 1
        const cFg = inv ? bg : fg
        const cBg = inv ? fg : bg
        const advance = charAdv(glyphIdx)

        if (inv) {
          ctx.fillStyle = cBg
          ctx.fillRect(xPos, oy, advance, rowH)
        }

        if (isSel) {
          ctx.fillStyle = cFg
          ctx.fillRect(xPos, oy, advance, rowH)
          ctx.fillStyle = cBg
        } else {
          ctx.fillStyle = cFg
        }

        if (glyphIdx >= 0 && glyphIdx < gc) {
          drawGlyph(glyphIdx, xPos, oy)
        }
        xPos += advance
      }

      if (cursorPos && showCursor && selected.size === 0 && cursorPos.row === row && cursorPos.col === lines[row].length) {
        ctx.fillStyle = fg
        ctx.fillRect(xPos, oy, scale, rowH)
      }
    }

    if (cursorPos && showCursor && selected.size === 0) {
      const row = cursorPos.row
      if (row < lines.length && cursorPos.col < lines[row].length) {
        let xPos = 0
        for (let col = 0; col < cursorPos.col; col++) {
          xPos += charAdv(lines[row].charCodeAt(col) - startChar)
        }
        ctx.fillStyle = fg
        ctx.fillRect(xPos, row * rowH, scale, rowH)
      }
    }
  }
}
