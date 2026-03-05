// Canvas rendering for the bitmap font text preview.

import type { FontInstance } from './store'
import { glyphBounds } from './textLayout'

export interface RenderOptions {
  canvas: HTMLCanvasElement
  font: FontInstance
  lines: string[]
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
  canvas, font, lines, scale, cols, fg, bg,
  cursorPos, showCursor, selected, proportional, lineHeight,
}: RenderOptions) {
  const ctx = canvas.getContext('2d')!
  const data = font.fontData.value
  const startChar = font.startChar.value
  const gc = data.length / 8
  const cellW = 8 * scale
  const rowH = lineHeight * scale
  const glyphYOff = Math.floor((lineHeight - 8) / 2) * scale

  const rowCount = Math.max(1, lines.length)

  // Draw a single glyph at pixel position, clipped to row bounds
  function drawGlyph(glyphIdx: number, gx: number, rowY: number) {
    const byteOffset = glyphIdx * 8
    for (let y = 0; y < 8; y++) {
      const py = rowY + glyphYOff + y * scale
      if (py + scale <= rowY || py >= rowY + rowH) continue
      const byte = data[byteOffset + y]
      for (let x = 0; x < 8; x++) {
        if (byte & (0x80 >> x)) {
          ctx.fillRect(gx + x * scale, py, scale, scale)
        }
      }
    }
  }

  // Draw a proportional glyph shifted left to remove leading blank columns
  function drawGlyphProp(glyphIdx: number, gx: number, rowY: number, boundsLeft: number, charW: number) {
    const byteOffset = glyphIdx * 8
    for (let y = 0; y < 8; y++) {
      const py = rowY + glyphYOff + y * scale
      if (py + scale <= rowY || py >= rowY + rowH) continue
      const byte = data[byteOffset + y]
      for (let x = 0; x < 8; x++) {
        if (byte & (0x80 >> x)) {
          const px = (x - boundsLeft) * scale
          if (px >= 0 && px < charW) {
            ctx.fillRect(gx + px, py, scale, scale)
          }
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
      const oy = row * rowH
      for (let col = 0; col < line.length; col++) {
        const isSel = selected.has(`${row},${col}`)
        const ox = col * cellW

        if (isSel) {
          ctx.fillStyle = fg
          ctx.fillRect(ox, oy, cellW, rowH)
          ctx.fillStyle = bg
        } else {
          ctx.fillStyle = fg
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
    const eIdx = 'e'.charCodeAt(0) - startChar
    const eWidth = (eIdx >= 0 && eIdx < gc) ? (glyphBounds(data, eIdx).width || 4) : 4
    const gap = 1
    function adv(ch: string) {
      if (ch === ' ') return eWidth + gap
      const gi = ch.charCodeAt(0) - startChar
      if (gi >= 0 && gi < gc) return (glyphBounds(data, gi).width || 1) + gap
      return 1 + gap
    }

    let maxLineWidth = 0
    for (const line of lines) {
      let w = 0
      for (let i = 0; i < line.length; i++) w += adv(line[i]) * scale
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
      const oy = row * rowH
      for (let col = 0; col < lines[row].length; col++) {
        const ch = lines[row][col]
        const charCode = ch.charCodeAt(0)
        const glyphIdx = charCode - startChar
        const isSel = selected.has(`${row},${col}`)
        const advance = adv(ch) * scale

        if (charCode === 32) {
          if (isSel) {
            ctx.fillStyle = fg
            ctx.fillRect(xPos, oy, advance, rowH)
          }
          xPos += advance
          continue
        }

        if (glyphIdx < 0 || glyphIdx >= gc) {
          xPos += advance
          continue
        }

        const bounds = glyphBounds(data, glyphIdx)
        const charW = (bounds.width || 1) * scale

        if (isSel) {
          ctx.fillStyle = fg
          ctx.fillRect(xPos, oy, advance, rowH)
          ctx.fillStyle = bg
        } else {
          ctx.fillStyle = fg
        }

        drawGlyphProp(glyphIdx, xPos, oy, bounds.left, charW)
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
          xPos += adv(lines[row][col]) * scale
        }
        ctx.fillStyle = fg
        ctx.fillRect(xPos, row * rowH, scale, rowH)
      }
    }
  }
}
