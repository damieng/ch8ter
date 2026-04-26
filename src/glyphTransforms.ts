// Pure glyph byte-array transforms — no store/signal dependencies.

import { getBit, setBit, bpr as calcBpr } from './bitUtils'

function getPixelBit(bytes: Uint8Array, bpr: number, x: number, y: number): boolean {
  return getBit(bytes, y * bpr, x)
}

function setPixelBit(bytes: Uint8Array, bpr: number, x: number, y: number) {
  setBit(bytes, y * bpr, x)
}

export function flipXBytes(bytes: Uint8Array, w: number, h: number): Uint8Array {
  const bpr = calcBpr(w)
  const out = new Uint8Array(h * bpr)
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (getPixelBit(bytes, bpr, x, y)) setPixelBit(out, bpr, w - 1 - x, y)
  return out
}

export function flipYBytes(bytes: Uint8Array, w: number, h: number): Uint8Array {
  const bpr = calcBpr(w)
  const out = new Uint8Array(h * bpr)
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (getPixelBit(bytes, bpr, x, y)) setPixelBit(out, bpr, x, h - 1 - y)
  return out
}

export function invertBytes(bytes: Uint8Array, w: number, h: number): Uint8Array {
  const bpr = calcBpr(w)
  const out = new Uint8Array(h * bpr)
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (!getPixelBit(bytes, bpr, x, y)) setPixelBit(out, bpr, x, y)
  return out
}

export interface TransformResult {
  data: Uint8Array
  w: number
  h: number
}

export type GlyphTransform = (b: Uint8Array, w: number, h: number) => Uint8Array | TransformResult

export function rotateCWBytes(bytes: Uint8Array, w: number, h: number): TransformResult {
  const outW = h, outH = w
  const outBpr = calcBpr(outW)
  const out = new Uint8Array(outH * outBpr)
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (getPixelBit(bytes, calcBpr(w), x, y))
        setPixelBit(out, outBpr, h - 1 - y, x)
  return { data: out, w: outW, h: outH }
}

export function rotateCCWBytes(bytes: Uint8Array, w: number, h: number): TransformResult {
  const outW = h, outH = w
  const outBpr = calcBpr(outW)
  const out = new Uint8Array(outH * outBpr)
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (getPixelBit(bytes, calcBpr(w), x, y))
        setPixelBit(out, outBpr, y, w - 1 - x)
  return { data: out, w: outW, h: outH }
}

export function shiftUp(bytes: Uint8Array, w: number, h: number): Uint8Array {
  const bpr = calcBpr(w)
  const out = new Uint8Array(h * bpr)
  for (let y = 0; y < h; y++) {
    const srcY = (y + 1) % h
    for (let i = 0; i < bpr; i++) out[y * bpr + i] = bytes[srcY * bpr + i]
  }
  return out
}

export function shiftDown(bytes: Uint8Array, w: number, h: number): Uint8Array {
  const bpr = calcBpr(w)
  const out = new Uint8Array(h * bpr)
  for (let y = 0; y < h; y++) {
    const srcY = (y - 1 + h) % h
    for (let i = 0; i < bpr; i++) out[y * bpr + i] = bytes[srcY * bpr + i]
  }
  return out
}

export function shiftLeft(bytes: Uint8Array, w: number, h: number): Uint8Array {
  const bpr = calcBpr(w)
  const out = new Uint8Array(h * bpr)
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (getPixelBit(bytes, bpr, x, y)) setPixelBit(out, bpr, (x - 1 + w) % w, y)
  return out
}

export function shiftRight(bytes: Uint8Array, w: number, h: number): Uint8Array {
  const bpr = calcBpr(w)
  const out = new Uint8Array(h * bpr)
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (getPixelBit(bytes, bpr, x, y)) setPixelBit(out, bpr, (x + 1) % w, y)
  return out
}

export function centerHorizontalBytes(bytes: Uint8Array, w: number, h: number): Uint8Array {
  const bpr = calcBpr(w)
  let leftBlank = 0
  for (let x = 0; x < w; x++) {
    let used = false
    for (let y = 0; y < h; y++) if (getPixelBit(bytes, bpr, x, y)) { used = true; break }
    if (used) break
    leftBlank++
  }
  let rightBlank = 0
  for (let x = w - 1; x >= 0; x--) {
    let used = false
    for (let y = 0; y < h; y++) if (getPixelBit(bytes, bpr, x, y)) { used = true; break }
    if (used) break
    rightBlank++
  }
  if (leftBlank === 0 && rightBlank === 0) return new Uint8Array(bytes)
  if (leftBlank + rightBlank >= w) return new Uint8Array(h * bpr)
  const total = leftBlank + rightBlank
  const targetLeft = Math.ceil(total / 2)
  const shift = leftBlank - targetLeft
  if (shift === 0) return new Uint8Array(bytes)
  const out = new Uint8Array(h * bpr)
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (getPixelBit(bytes, bpr, x, y)) {
        const nx = x - shift
        if (nx >= 0 && nx < w) setPixelBit(out, bpr, nx, y)
      }
  return out
}

// Oblique shear — float-precision transform + Bresenham re-rasterize.
// For each original pixel, compute exact sheared position. Then draw Bresenham
// lines between all pairs of originally 8-connected pixels to preserve strokes.
export function shearGlyphBytes(bytes: Uint8Array, angleDegrees: number, w: number, h: number): Uint8Array {
  const bpr = calcBpr(w)
  const tan = Math.tan((angleDegrees * Math.PI) / 180)

  const orig: { x: number; y: number }[] = []
  const isSet = (x: number, y: number) =>
    x >= 0 && x < w && y >= 0 && y < h && getPixelBit(bytes, bpr, x, y)

  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (isSet(x, y)) orig.push({ x, y })

  if (orig.length === 0) return new Uint8Array(h * bpr)

  const midY = (h - 1) / 2
  const shearedFloat = orig.map(p => ({
    x: p.x + tan * (midY - p.y),
    y: p.y,
    ox: p.x, oy: p.y,
  }))

  let minX = Infinity, maxX = -Infinity
  for (const p of shearedFloat) {
    if (p.x < minX) minX = p.x
    if (p.x > maxX) maxX = p.x
  }
  let adjust = 0
  if (minX < 0) adjust = -minX
  if (maxX + adjust > w - 1) adjust = w - 1 - maxX
  if (minX + adjust < 0) adjust = -minX

  const rounded = shearedFloat.map(p => ({
    x: Math.max(0, Math.min(w - 1, Math.round(p.x + adjust))),
    y: p.y,
    ox: p.ox, oy: p.oy,
  }))

  const posMap = new Map<string, { x: number; y: number }>()
  for (const p of rounded) posMap.set(`${p.ox},${p.oy}`, { x: p.x, y: p.y })

  const out = new Uint8Array(h * bpr)
  function plot(x: number, y: number) {
    if (x >= 0 && x < w && y >= 0 && y < h) setPixelBit(out, bpr, x, y)
  }

  for (const p of rounded) plot(p.x, p.y)

  for (const p of orig) {
    const from = posMap.get(`${p.x},${p.y}`)!
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dy === 0 && dx === 0) continue
        const nx = p.x + dx, ny = p.y + dy
        if (ny < 0 || ny >= h || nx < 0 || nx >= w) continue
        if (ny < p.y || (ny === p.y && nx < p.x)) continue
        if (!isSet(nx, ny)) continue
        const to = posMap.get(`${nx},${ny}`)!
        if (Math.abs(from.x - to.x) <= 1 && Math.abs(from.y - to.y) <= 1) continue
        let x0 = from.x, y0 = from.y, x1 = to.x, y1 = to.y
        const sdx = Math.abs(x1 - x0), sdy = Math.abs(y1 - y0)
        const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1
        let err = sdx - sdy
        while (true) {
          plot(x0, y0)
          if (x0 === x1 && y0 === y1) break
          const e2 = 2 * err
          if (e2 > -sdy) { err -= sdy; x0 += sx }
          if (e2 < sdx) { err += sdx; y0 += sy }
        }
      }
    }
  }

  return out
}
