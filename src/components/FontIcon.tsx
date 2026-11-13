// Desktop icon picture for a minimized font window: "AZ" set in that font.

import { useRef, useEffect } from 'preact/hooks'
import { type FontInstance, glyphCount, glyphAdvance } from '../store'
import { glyphCodeForChar, charset } from '../charsets'
import { getBit, bpr } from '../bitUtils'
import { theme } from '../theme'

const BOX = 36 // pixels available inside the icon tile

/**
 * Lay out "AZ" using each glyph's real advance width (so proportional fonts
 * get their proper spacing), then crop to the inked pixels so the result is
 * centred in the tile regardless of side bearings or descender space.
 */
function layoutAZ(font: FontInstance): { pixels: [number, number][]; w: number; h: number } {
  const data = font.fontData.value
  const start = font.startChar.value
  const gw = font.glyphWidth.value
  const gh = font.glyphHeight.value
  const count = glyphCount(font)
  const rowBytes = bpr(gw)
  const bpg = gh * rowBytes

  const pixels: [number, number][] = []
  let x0 = 0
  for (const ch of ['A', 'Z']) {
    const idx = glyphCodeForChar(ch) - start
    if (idx < 0 || idx >= count) continue
    for (let y = 0; y < gh; y++) {
      for (let x = 0; x < gw; x++) {
        if (getBit(data, idx * bpg + y * rowBytes, x)) pixels.push([x0 + x, y])
      }
    }
    x0 += glyphAdvance(font, idx)
  }
  if (pixels.length === 0) return { pixels, w: 1, h: 1 }

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  for (const [x, y] of pixels) {
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (y < minY) minY = y
    if (y > maxY) maxY = y
  }
  return {
    pixels: pixels.map(([x, y]) => [x - minX, y - minY] as [number, number]),
    w: maxX - minX + 1,
    h: maxY - minY + 1,
  }
}

export function FontIcon({ font }: { font: FontInstance }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  // Reading these signals (via layoutAZ and below) re-renders the icon
  // whenever the glyphs, spacing, codepage or theme change
  const { pixels, w, h } = layoutAZ(font)
  const cs = charset.value
  const themeName = theme.value

  const scale = Math.min(BOX / w, BOX / h)
  // Whole-pixel scaling when it fits, otherwise squeeze to the tile
  const cssScale = scale >= 1 ? Math.floor(scale) : scale

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    // Follow the tile's text colour so it reads in light and dark themes
    ctx.fillStyle = getComputedStyle(canvas).color
    for (const [x, y] of pixels) ctx.fillRect(x, y, 1, 1)
  })

  return (
    <canvas
      ref={canvasRef}
      width={w}
      height={h}
      data-cs={cs}
      data-theme={themeName}
      style={{ width: w * cssScale, height: h * cssScale, imageRendering: 'pixelated' }}
    />
  )
}
