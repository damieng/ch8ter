// PNG bitmap font import — detection and glyph extraction

import { setBit } from '../bitUtils'

export interface PngImportSettings {
  scale: number
  glyphWidth: number
  glyphHeight: number
  gapX: number
  gapY: number
  borderX: number
  borderY: number
}

export interface PngImportResult {
  fontData: Uint8Array
  glyphWidth: number
  glyphHeight: number
  startChar: number
  glyphCount: number
  populated: Set<number>
}

// Get ImageData from a loaded image
export function imageToData(img: HTMLImageElement): ImageData {
  const c = document.createElement('canvas')
  c.width = img.naturalWidth
  c.height = img.naturalHeight
  const ctx = c.getContext('2d')!
  ctx.drawImage(img, 0, 0)
  return ctx.getImageData(0, 0, c.width, c.height)
}

// Check if a pixel is "dark" (foreground)
function isDark(data: ImageData, x: number, y: number, threshold = 128): boolean {
  if (x < 0 || x >= data.width || y < 0 || y >= data.height) return false
  const i = (y * data.width + x) * 4
  const r = data.data[i], g = data.data[i + 1], b = data.data[i + 2], a = data.data[i + 3]
  if (a < 128) return false // transparent = background
  return (r + g + b) / 3 < threshold
}

// Check if the image has significant transparency (background is transparent)
function hasTransparentBackground(data: ImageData): boolean {
  const w = data.width, h = data.height
  const stride = Math.max(1, Math.floor(Math.sqrt(w * h / 10000)))
  let transparent = 0, total = 0
  for (let y = 0; y < h; y += stride) {
    for (let x = 0; x < w; x += stride) {
      total++
      if (data.data[(y * w + x) * 4 + 3] < 128) transparent++
    }
  }
  return transparent > total * 0.2
}

// Find the most common opaque color in the image (= background for an opaque font sheet).
function getBackgroundColor(data: ImageData): [number, number, number] {
  const w = data.width, h = data.height
  const counts = new Map<string, { r: number; g: number; b: number; count: number }>()
  const stride = Math.max(1, Math.floor(Math.sqrt(w * h / 10000)))

  for (let y = 0; y < h; y += stride) {
    for (let x = 0; x < w; x += stride) {
      const i = (y * w + x) * 4
      if (data.data[i + 3] < 128) continue
      const r = data.data[i], g = data.data[i + 1], b = data.data[i + 2]
      const key = `${r >> 4},${g >> 4},${b >> 4}`
      const entry = counts.get(key)
      if (entry) { entry.r += r; entry.g += g; entry.b += b; entry.count++ }
      else counts.set(key, { r, g, b, count: 1 })
    }
  }

  let best = { r: 255, g: 255, b: 255, count: 0 }
  for (const v of counts.values()) if (v.count > best.count) best = v
  if (best.count === 0) return [255, 255, 255]
  return [Math.round(best.r / best.count), Math.round(best.g / best.count), Math.round(best.b / best.count)]
}

// Is this pixel foreground (part of a glyph)?
function isForeground(data: ImageData, x: number, y: number, transparentBg: boolean, bg: [number, number, number]): boolean {
  if (x < 0 || x >= data.width || y < 0 || y >= data.height) return false
  const i = (y * data.width + x) * 4
  const a = data.data[i + 3]
  if (transparentBg) {
    // Transparent background: any opaque pixel is foreground
    return a >= 128
  }
  // Opaque background: foreground = not matching background color
  if (a < 128) return false
  const r = data.data[i], g = data.data[i + 1], b = data.data[i + 2]
  return Math.abs(r - bg[0]) + Math.abs(g - bg[1]) + Math.abs(b - bg[2]) >= 120
}

// Is this pixel background? (inverse of isForeground, used for border/gap detection)
function isBackground(data: ImageData, x: number, y: number, bg: [number, number, number]): boolean {
  if (x < 0 || x >= data.width || y < 0 || y >= data.height) return true
  const i = (y * data.width + x) * 4
  const a = data.data[i + 3]
  if (a < 128) return true
  const r = data.data[i], g = data.data[i + 1], b = data.data[i + 2]
  return Math.abs(r - bg[0]) + Math.abs(g - bg[1]) + Math.abs(b - bg[2]) < 120
}

// Check if an entire row is background
function isUniformRow(data: ImageData, y: number, bg: [number, number, number]): boolean {
  for (let x = 0; x < data.width; x++) {
    if (!isBackground(data, x, y, bg)) return false
  }
  return true
}

// Check if an entire column is background
function isUniformCol(data: ImageData, x: number, bg: [number, number, number]): boolean {
  for (let y = 0; y < data.height; y++) {
    if (!isBackground(data, x, y, bg)) return false
  }
  return true
}

// Detect border: count uniform rows/cols from edges
// Only counts as border if both edges match AND it's a small fraction of the image.
// A simple font PNG with no border has glyphs starting at edge — we must not
// mistake empty glyph rows (like space char) for border.
function detectBorder(data: ImageData, bg: [number, number, number]): { borderX: number; borderY: number } {
  // Cap border at 10% of each dimension — real borders are small
  const maxBorderY = Math.floor(data.height * 0.1)
  const maxBorderX = Math.floor(data.width * 0.1)

  let borderYTop = 0
  for (let y = 0; y < Math.min(data.height, maxBorderY + 1); y++) {
    if (isUniformRow(data, y, bg)) borderYTop++
    else break
  }
  let borderYBottom = 0
  for (let y = data.height - 1; y >= Math.max(0, data.height - maxBorderY - 1); y--) {
    if (isUniformRow(data, y, bg)) borderYBottom++
    else break
  }
  // Only count border if both sides have some, and take the smaller
  let borderY = Math.min(borderYTop, borderYBottom)
  if (borderY > maxBorderY) borderY = 0

  let borderXLeft = 0
  for (let x = 0; x < Math.min(data.width, maxBorderX + 1); x++) {
    if (isUniformCol(data, x, bg)) borderXLeft++
    else break
  }
  let borderXRight = 0
  for (let x = data.width - 1; x >= Math.max(0, data.width - maxBorderX - 1); x--) {
    if (isUniformCol(data, x, bg)) borderXRight++
    else break
  }
  let borderX = Math.min(borderXLeft, borderXRight)
  if (borderX > maxBorderX) borderX = 0

  return { borderX, borderY }
}

// Detect grid separator gaps by finding uniform row/col runs within the content area
function detectGap(data: ImageData, bg: [number, number, number], borderX: number, borderY: number): { gapX: number; gapY: number } {
  const contentW = data.width - borderX * 2
  const contentH = data.height - borderY * 2

  // Scan columns for vertical gap lines
  function findGapSize(horizontal: boolean): number {
    const len = horizontal ? contentW : contentH
    const start = horizontal ? borderX : borderY

    // Find runs of uniform lines after the first content
    let inContent = false
    let gapStart = -1
    const gaps: number[] = []

    for (let i = 0; i < len; i++) {
      const pos = start + i
      const uniform = horizontal
        ? isUniformCol(data, pos, bg)
        : isUniformRow(data, pos, bg)

      if (!uniform) {
        if (gapStart >= 0 && inContent) {
          gaps.push(i - gapStart)
        }
        gapStart = -1
        inContent = true
      } else if (inContent && gapStart < 0) {
        gapStart = i
      }
    }
    if (gapStart >= 0 && inContent) gaps.push(len - gapStart)

    if (gaps.length < 2) return 0
    // Find most common gap size
    const freq = new Map<number, number>()
    for (const g of gaps) freq.set(g, (freq.get(g) ?? 0) + 1)
    let bestGap = 0, bestCount = 0
    for (const [g, c] of freq) if (c > bestCount) { bestGap = g; bestCount = c }
    return bestGap
  }

  return { gapX: findGapSize(true), gapY: findGapSize(false) }
}

// Detect scale by looking at the minimum non-gap segment size
function detectScale(data: ImageData, bg: [number, number, number], borderX: number, borderY: number): number {
  const contentW = data.width - borderX * 2

  // Find segment sizes between gaps in horizontal direction
  const segments: number[] = []
  let segStart = -1
  for (let x = 0; x < contentW; x++) {
    const pos = borderX + x
    const uniform = isUniformCol(data, pos, bg)
    if (!uniform) {
      if (segStart < 0) segStart = x
    } else {
      if (segStart >= 0) {
        segments.push(x - segStart)
        segStart = -1
      }
    }
  }
  if (segStart >= 0) segments.push(contentW - segStart)

  if (segments.length === 0) return 1

  // The segment size = glyphWidth * scale
  // We need to figure out scale. Look at pixel-level patterns.
  // Find the smallest "feature" — look for runs of identical columns within first few segments
  const firstSeg = segments[0]
  if (firstSeg <= 8) return 1

  // Check if columns repeat in groups (scale detection)
  for (let testScale = 2; testScale <= 8; testScale++) {
    if (firstSeg % testScale !== 0) continue
    // Check if pixels repeat in testScale x testScale blocks in first segment
    let consistent = true
    outer:
    for (let sy = borderY; sy < Math.min(borderY + firstSeg, data.height - borderY); sy += testScale) {
      for (let sx = borderX; sx < borderX + firstSeg; sx += testScale) {
        // All pixels in this block should be the same
        const refDark = isDark(data, sx, sy)
        for (let dy = 0; dy < testScale && sy + dy < data.height - borderY; dy++) {
          for (let dx = 0; dx < testScale && sx + dx < borderX + firstSeg; dx++) {
            if (dx === 0 && dy === 0) continue
            if (isDark(data, sx + dx, sy + dy) !== refDark) {
              consistent = false
              break outer
            }
          }
        }
      }
    }
    if (consistent) return testScale
  }

  return 1
}

// Auto-detect all import settings from image data
export function autoDetect(data: ImageData): PngImportSettings {
  const bg = getBackgroundColor(data)
  const { borderX, borderY } = detectBorder(data, bg)
  const { gapX, gapY } = detectGap(data, bg, borderX, borderY)
  const scale = detectScale(data, bg, borderX, borderY)

  // Calculate glyph size from content area
  const contentW = data.width - borderX * 2
  const contentH = data.height - borderY * 2

  // If we have gaps, we can calculate cell size
  // cell = glyphWidth * scale + gapX
  // But we need to figure out how many columns
  // Try common glyph widths
  let bestW = 8, bestH = 8

  if (gapX > 0) {
    // Find segments between gaps
    const segs: number[] = []
    let segStart = -1
    for (let x = 0; x < contentW; x++) {
      const pos = borderX + x
      const uniform = isUniformCol(data, pos, bg)
      if (!uniform) { if (segStart < 0) segStart = x }
      else if (segStart >= 0) { segs.push(x - segStart); segStart = -1 }
    }
    if (segStart >= 0) segs.push(contentW - segStart)
    if (segs.length > 0) bestW = Math.round(segs[0] / scale)
  } else {
    // No gaps — try to divide evenly
    // Assume 16 or 32 columns of 8px glyphs is common
    const scaledW = contentW / scale
    for (const cols of [32, 16, 24, 20, 8]) {
      if (scaledW % cols === 0) { bestW = scaledW / cols; break }
    }
  }

  if (gapY > 0) {
    const segs: number[] = []
    let segStart = -1
    for (let y = 0; y < contentH; y++) {
      const pos = borderY + y
      const uniform = isUniformRow(data, pos, bg)
      if (!uniform) { if (segStart < 0) segStart = y }
      else if (segStart >= 0) { segs.push(y - segStart); segStart = -1 }
    }
    if (segStart >= 0) segs.push(contentH - segStart)
    if (segs.length > 0) bestH = Math.round(segs[0] / scale)
  } else {
    const scaledH = contentH / scale
    for (const rows of [8, 6, 12, 16, 4, 3]) {
      if (scaledH % rows === 0) { bestH = scaledH / rows; break }
    }
  }

  return {
    scale,
    glyphWidth: Math.max(1, bestW),
    glyphHeight: Math.max(1, bestH),
    gapX: Math.round(gapX / scale),
    gapY: Math.round(gapY / scale),
    borderX: Math.round(borderX / scale),
    borderY: Math.round(borderY / scale),
  }
}

// Calculate how many glyphs fit with given settings
export function calcGridSize(imgW: number, imgH: number, s: PngImportSettings): { cols: number; rows: number; total: number } {
  const cellW = s.glyphWidth + s.gapX
  const cellH = s.glyphHeight + s.gapY
  const contentW = (imgW / s.scale) - s.borderX * 2 + s.gapX
  const contentH = (imgH / s.scale) - s.borderY * 2 + s.gapY
  const cols = Math.max(0, Math.floor(contentW / cellW))
  const rows = Math.max(0, Math.floor(contentH / cellH))
  return { cols, rows, total: cols * rows }
}

// Extract glyphs from image data using given settings
export function extractGlyphs(data: ImageData, settings: PngImportSettings): PngImportResult {
  const { scale, glyphWidth, glyphHeight, gapX, gapY, borderX, borderY } = settings
  const { cols, rows, total } = calcGridSize(data.width, data.height, settings)

  const bpr = Math.ceil(glyphWidth / 8)
  const bpg = glyphHeight * bpr
  const fontData = new Uint8Array(total * bpg)
  const populated = new Set<number>()

  const transparentBg = hasTransparentBackground(data)
  const bg = getBackgroundColor(data)

  // Space detection: find first all-empty glyph
  let spaceIndex = -1

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const idx = row * cols + col
      const px = (borderX + col * (glyphWidth + gapX)) * scale
      const py = (borderY + row * (glyphHeight + gapY)) * scale
      let hasPixels = false

      for (let y = 0; y < glyphHeight; y++) {
        for (let x = 0; x < glyphWidth; x++) {
          // Sample center of scaled pixel
          const sx = px + Math.floor((x + 0.5) * scale)
          const sy = py + Math.floor((y + 0.5) * scale)

          const foreground = isForeground(data, sx, sy, transparentBg, bg)

          if (foreground) {
            setBit(fontData, idx * bpg + y * bpr, x)
            hasPixels = true
          }
        }
      }

      if (hasPixels) {
        populated.add(idx)
      } else if (spaceIndex < 0) {
        spaceIndex = idx
      }
    }
  }

  // Start char: if space is found, map it to ASCII 32
  const startChar = spaceIndex >= 0 ? 32 - spaceIndex : 32

  return {
    fontData,
    glyphWidth,
    glyphHeight,
    startChar: Math.max(0, startChar),
    glyphCount: total,
    populated,
  }
}
