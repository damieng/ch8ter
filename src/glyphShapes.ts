// Pure pixel-set primitives for the glyph editor drawing tools.
// Pixels are keyed as "x,y" strings; all functions are bounds-agnostic
// (the caller clamps to the glyph when applying).

import { getPixel, setPixel, type FontInstance } from './store'

/** Bresenham line from (x0,y0) to (x1,y1), inclusive. */
export function linePixels(x0: number, y0: number, x1: number, y1: number): Set<string> {
  const pts = new Set<string>()
  let dx = Math.abs(x1 - x0)
  let dy = -Math.abs(y1 - y0)
  const sx = x0 < x1 ? 1 : -1
  const sy = y0 < y1 ? 1 : -1
  let err = dx + dy
  for (;;) {
    pts.add(`${x0},${y0}`)
    if (x0 === x1 && y0 === y1) break
    const e2 = 2 * err
    if (e2 >= dy) { err += dy; x0 += sx }
    if (e2 <= dx) { err += dx; y0 += sy }
  }
  return pts
}

/** Rectangle outline (or filled with `filled`) from corner to corner. */
export function rectPixels(x0: number, y0: number, x1: number, y1: number, filled: boolean): Set<string> {
  const l = Math.min(x0, x1), r = Math.max(x0, x1)
  const t = Math.min(y0, y1), b = Math.max(y0, y1)
  const pts = new Set<string>()
  for (let y = t; y <= b; y++) {
    for (let x = l; x <= r; x++) {
      if (filled || x === l || x === r || y === t || y === b) pts.add(`${x},${y}`)
    }
  }
  return pts
}

/** Ellipse outline (or filled) inscribed in the corner-to-corner box. */
export function ellipsePixels(x0: number, y0: number, x1: number, y1: number, filled: boolean): Set<string> {
  const l = Math.min(x0, x1), r = Math.max(x0, x1)
  const t = Math.min(y0, y1), b = Math.max(y0, y1)
  const rx = (r - l + 1) / 2
  const ry = (b - t + 1) / 2
  const cx = l + rx
  const cy = t + ry
  const inside = (px: number, py: number) => {
    const dx = (px + 0.5 - cx) / rx
    const dy = (py + 0.5 - cy) / ry
    return dx * dx + dy * dy <= 1
  }
  const pts = new Set<string>()
  for (let y = t; y <= b; y++) {
    for (let x = l; x <= r; x++) {
      if (!inside(x, y)) continue
      if (filled || !inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1) || !inside(x, y + 1)) {
        pts.add(`${x},${y}`)
      }
    }
  }
  return pts
}

/** Flood-fill the connected region of the original color at (x, y). */
export function floodFill(
  font: FontInstance, idx: number, x: number, y: number, color: boolean,
): void {
  const w = font.glyphWidth.value
  const h = font.glyphHeight.value
  const target = getPixel(font, idx, x, y)
  if (target === color) return
  const stack: [number, number][] = [[x, y]]
  while (stack.length > 0) {
    const [cx, cy] = stack.pop()!
    if (cx < 0 || cx >= w || cy < 0 || cy >= h) continue
    if (getPixel(font, idx, cx, cy) !== target) continue
    setPixel(font, idx, cx, cy, color)
    stack.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1])
  }
}
