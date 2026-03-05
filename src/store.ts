import { signal, type Signal } from '@preact/signals'

// --- Font Instance ---

export interface FontInstance {
  id: string
  fontData: Signal<Uint8Array>
  startChar: Signal<number>
  fileName: Signal<string>
  selectedGlyphs: Signal<Set<number>>
  lastClickedGlyph: Signal<number>
  gridZoom: Signal<number>
  dirty: Signal<boolean>
  savedSnapshot: Signal<Uint8Array>
}

let nextFontId = 1

export function createFont(data?: Uint8Array, name?: string, start?: number): FontInstance {
  const id = `font-${nextFontId++}`
  const initial = data ?? new Uint8Array(96 * 8)
  return {
    id,
    fontData: signal(initial),
    startChar: signal(start ?? 32),
    fileName: signal(name ?? 'untitled.ch8'),
    selectedGlyphs: signal<Set<number>>(new Set([0])),
    lastClickedGlyph: signal(0),
    gridZoom: signal(5),
    dirty: signal(false),
    savedSnapshot: signal(new Uint8Array(initial)),
  }
}

// --- Global state ---

export const fonts = signal<FontInstance[]>([createFont()])
export const activeFontId = signal<string>(fonts.value[0].id)

function isEmptyUntitled(f: FontInstance): boolean {
  if (f.dirty.value) return false
  if (f.fileName.value !== 'untitled.ch8') return false
  return f.fontData.value.every(b => b === 0)
}

export function addFont(font: FontInstance) {
  // If the only open font is an empty untitled, replace it
  const current = fonts.value
  if (current.length === 1 && isEmptyUntitled(current[0])) {
    fonts.value = [font]
  } else {
    fonts.value = [...current, font]
  }
  activeFontId.value = font.id
}

export function removeFont(id: string) {
  const remaining = fonts.value.filter(f => f.id !== id)
  if (remaining.length === 0) return // don't remove last font
  fonts.value = remaining
  if (activeFontId.value === id) {
    activeFontId.value = remaining[0].id
  }
}

// --- Charset (global display preference) ---

export type Charset = 'zx' | 'ascii'
export const charset = signal<Charset>('zx')

const ZX_OVERRIDES: Record<number, string> = {
  0x5E: '\u2191', // ↑
  0x60: '\u00A3', // £
  0x7F: '\u00A9', // ©
}

export function charLabel(charCode: number): string {
  if (charset.value === 'zx' && ZX_OVERRIDES[charCode]) {
    return ZX_OVERRIDES[charCode]
  }
  if (charCode === 0x7F) return ''
  if (charCode >= 33 && charCode <= 126) return String.fromCharCode(charCode)
  return ''
}

function markDirty(font: FontInstance) {
  const a = font.fontData.value
  const b = font.savedSnapshot.value
  if (a.length !== b.length) { font.dirty.value = true; return }
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) { font.dirty.value = true; return }
  }
  font.dirty.value = false
}

// --- Per-font helpers ---

export function glyphCount(font: FontInstance): number {
  return font.fontData.value.length / 8
}

export function getPixel(font: FontInstance, glyphIndex: number, x: number, y: number): boolean {
  const offset = glyphIndex * 8 + y
  return (font.fontData.value[offset] & (0x80 >> x)) !== 0
}

export function setPixel(font: FontInstance, glyphIndex: number, x: number, y: number, on: boolean) {
  const data = new Uint8Array(font.fontData.value)
  const offset = glyphIndex * 8 + y
  if (on) {
    data[offset] |= (0x80 >> x)
  } else {
    data[offset] &= ~(0x80 >> x)
  }
  font.fontData.value = data
  markDirty(font)
}

export function selectGlyph(font: FontInstance, index: number, shift: boolean, ctrl: boolean) {
  const count = glyphCount(font)
  if (index < 0 || index >= count) return

  if (shift) {
    const from = Math.min(font.lastClickedGlyph.value, index)
    const to = Math.max(font.lastClickedGlyph.value, index)
    const next = new Set(font.selectedGlyphs.value)
    for (let i = from; i <= to; i++) next.add(i)
    font.selectedGlyphs.value = next
  } else if (ctrl) {
    const next = new Set(font.selectedGlyphs.value)
    if (next.has(index)) {
      next.delete(index)
      if (next.size === 0) next.add(index)
    } else {
      next.add(index)
    }
    font.selectedGlyphs.value = next
  } else {
    font.selectedGlyphs.value = new Set([index])
  }
  font.lastClickedGlyph.value = index
}

function charRange(font: FontInstance, from: number, to: number): Set<number> {
  const s = font.startChar.value
  const count = glyphCount(font)
  const result = new Set<number>()
  for (let c = from; c <= to; c++) {
    const idx = c - s
    if (idx >= 0 && idx < count) result.add(idx)
  }
  return result
}

export function selectNumbers(font: FontInstance) {
  font.selectedGlyphs.value = charRange(font, 48, 57)
  const first = 48 - font.startChar.value
  if (first >= 0) font.lastClickedGlyph.value = first
}
export function selectUppercase(font: FontInstance) {
  font.selectedGlyphs.value = charRange(font, 65, 90)
  const first = 65 - font.startChar.value
  if (first >= 0) font.lastClickedGlyph.value = first
}
export function selectLowercase(font: FontInstance) {
  font.selectedGlyphs.value = charRange(font, 97, 122)
  const first = 97 - font.startChar.value
  if (first >= 0) font.lastClickedGlyph.value = first
}
export function selectSymbols(font: FontInstance) {
  const s = font.startChar.value
  const count = glyphCount(font)
  const result = new Set<number>()
  for (let i = 0; i < count; i++) {
    const c = s + i
    const isDigit = c >= 48 && c <= 57
    const isUpper = c >= 65 && c <= 90
    const isLower = c >= 97 && c <= 122
    const isSpace = c === 32
    if (!isDigit && !isUpper && !isLower && !isSpace && c >= 33 && c <= 126) {
      result.add(i)
    }
  }
  if (result.size > 0) {
    font.selectedGlyphs.value = result
    font.lastClickedGlyph.value = Math.min(...result)
  }
}

// --- Transformations ---

function flipXBytes(bytes: Uint8Array): Uint8Array {
  const out = new Uint8Array(8)
  for (let y = 0; y < 8; y++) {
    let reversed = 0
    for (let x = 0; x < 8; x++) {
      if (bytes[y] & (0x80 >> x)) reversed |= (1 << x)
    }
    out[y] = reversed
  }
  return out
}

function flipYBytes(bytes: Uint8Array): Uint8Array {
  const out = new Uint8Array(8)
  for (let y = 0; y < 8; y++) out[y] = bytes[7 - y]
  return out
}

function invertBytes(bytes: Uint8Array): Uint8Array {
  const out = new Uint8Array(8)
  for (let y = 0; y < 8; y++) out[y] = bytes[y] ^ 0xFF
  return out
}

function rotateCWBytes(bytes: Uint8Array): Uint8Array {
  const out = new Uint8Array(8)
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      if (bytes[y] & (0x80 >> x)) {
        out[x] |= (1 << y)
      }
    }
  }
  return out
}

function rotateCCWBytes(bytes: Uint8Array): Uint8Array {
  const out = new Uint8Array(8)
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      if (bytes[y] & (0x80 >> x)) {
        out[7 - x] |= (0x80 >> y)
      }
    }
  }
  return out
}

function shiftUp(bytes: Uint8Array): Uint8Array {
  const out = new Uint8Array(8)
  for (let y = 0; y < 7; y++) out[y] = bytes[y + 1]
  out[7] = bytes[0]
  return out
}

function shiftDown(bytes: Uint8Array): Uint8Array {
  const out = new Uint8Array(8)
  for (let y = 1; y < 8; y++) out[y] = bytes[y - 1]
  out[0] = bytes[7]
  return out
}

function shiftLeft(bytes: Uint8Array): Uint8Array {
  const out = new Uint8Array(8)
  for (let y = 0; y < 8; y++) {
    out[y] = ((bytes[y] << 1) | (bytes[y] >> 7)) & 0xFF
  }
  return out
}

function shiftRight(bytes: Uint8Array): Uint8Array {
  const out = new Uint8Array(8)
  for (let y = 0; y < 8; y++) {
    out[y] = ((bytes[y] >> 1) | ((bytes[y] & 1) << 7)) & 0xFF
  }
  return out
}

function applyToGlyph(font: FontInstance, index: number, fn: (b: Uint8Array) => Uint8Array) {
  const data = new Uint8Array(font.fontData.value)
  const offset = index * 8
  const bytes = data.slice(offset, offset + 8)
  data.set(fn(bytes), offset)
  font.fontData.value = data
  markDirty(font)
}

function applyToSelected(font: FontInstance, fn: (b: Uint8Array) => Uint8Array) {
  const data = new Uint8Array(font.fontData.value)
  for (const idx of font.selectedGlyphs.value) {
    const offset = idx * 8
    const bytes = data.slice(offset, offset + 8)
    data.set(fn(bytes), offset)
  }
  font.fontData.value = data
  markDirty(font)
}

// Active glyph transforms (editor toolbar)
export const activeFlipX = (font: FontInstance) => applyToGlyph(font, font.lastClickedGlyph.value, flipXBytes)
export const activeFlipY = (font: FontInstance) => applyToGlyph(font, font.lastClickedGlyph.value, flipYBytes)
export const activeInvert = (font: FontInstance) => applyToGlyph(font, font.lastClickedGlyph.value, invertBytes)
export const activeRotateCW = (font: FontInstance) => applyToGlyph(font, font.lastClickedGlyph.value, rotateCWBytes)
export const activeRotateCCW = (font: FontInstance) => applyToGlyph(font, font.lastClickedGlyph.value, rotateCCWBytes)
export const activeShiftUp = (font: FontInstance) => applyToGlyph(font, font.lastClickedGlyph.value, shiftUp)
export const activeShiftDown = (font: FontInstance) => applyToGlyph(font, font.lastClickedGlyph.value, shiftDown)
export const activeShiftLeft = (font: FontInstance) => applyToGlyph(font, font.lastClickedGlyph.value, shiftLeft)
export const activeShiftRight = (font: FontInstance) => applyToGlyph(font, font.lastClickedGlyph.value, shiftRight)

// Selection transforms (Tools dropdown)
export const selFlipX = (font: FontInstance) => applyToSelected(font, flipXBytes)
export const selFlipY = (font: FontInstance) => applyToSelected(font, flipYBytes)
export const selInvert = (font: FontInstance) => applyToSelected(font, invertBytes)
export const selRotateCW = (font: FontInstance) => applyToSelected(font, rotateCWBytes)
export const selRotateCCW = (font: FontInstance) => applyToSelected(font, rotateCCWBytes)
export const selShiftUp = (font: FontInstance) => applyToSelected(font, shiftUp)
export const selShiftDown = (font: FontInstance) => applyToSelected(font, shiftDown)
export const selShiftLeft = (font: FontInstance) => applyToSelected(font, shiftLeft)
export const selShiftRight = (font: FontInstance) => applyToSelected(font, shiftRight)

// Copy case
function copyRange(font: FontInstance, srcStart: number, srcEnd: number, dstStart: number) {
  const s = font.startChar.value
  const count = glyphCount(font)
  const data = new Uint8Array(font.fontData.value)
  for (let c = srcStart; c <= srcEnd; c++) {
    const srcIdx = c - s
    const dstIdx = (dstStart + (c - srcStart)) - s
    if (srcIdx >= 0 && srcIdx < count && dstIdx >= 0 && dstIdx < count) {
      data.set(data.slice(srcIdx * 8, srcIdx * 8 + 8), dstIdx * 8)
    }
  }
  font.fontData.value = data
  markDirty(font)
}

export const copyUpperToLower = (font: FontInstance) => copyRange(font, 65, 90, 97)
export const copyLowerToUpper = (font: FontInstance) => copyRange(font, 97, 122, 65)

// Create bold variant — OR each row with itself shifted right by 1
// If the rightmost column is used, shift the glyph left first to make room
export function createBoldVariant(font: FontInstance) {
  const src = font.fontData.value
  const count = src.length / 8
  const bold = new Uint8Array(src.length)
  for (let g = 0; g < count; g++) {
    const offset = g * 8
    // Check if rightmost bit (bit 0) is set on any row
    let rightUsed = false
    // Check if leftmost bit (bit 7) is free on all rows
    let leftFree = true
    for (let y = 0; y < 8; y++) {
      if (src[offset + y] & 0x01) rightUsed = true
      if (src[offset + y] & 0x80) leftFree = false
    }
    for (let y = 0; y < 8; y++) {
      let row = src[offset + y]
      if (rightUsed && leftFree) {
        // Shift glyph left 1px to make room on the right
        row = (row << 1) & 0xFF
      }
      bold[offset + y] = row | (row >> 1)
    }
  }
  const name = font.fileName.value.replace(/(\.\w+)$/, '-bold$1')
  const newFont = createFont(bold, name, font.startChar.value)
  addFont(newFont)
}

// Oblique variant — shear each glyph horizontally based on angle
// Auto-shifts glyph left/right if shearing would clip set pixels
// Fills gaps between adjacent rows to preserve stroke continuity
export function shearGlyphBytes(bytes: Uint8Array, angleDegrees: number): Uint8Array {
  const tan = Math.tan((angleDegrees * Math.PI) / 180)
  const shifts: number[] = []
  for (let y = 0; y < 8; y++) {
    shifts.push(Math.round(tan * (3.5 - y)))
  }

  // Find leftmost and rightmost set pixel across all rows after shear
  let minBit = 8, maxBit = -1
  for (let y = 0; y < 8; y++) {
    if (bytes[y] === 0) continue
    for (let x = 0; x < 8; x++) {
      if (bytes[y] & (0x80 >> x)) {
        const newX = x - shifts[y]
        if (newX < minBit) minBit = newX
        if (newX > maxBit) maxBit = newX
      }
    }
  }

  // Calculate centering offset to keep glyph within 0-7
  let adjust = 0
  if (minBit < 0) adjust = -minBit
  if (maxBit > 7) adjust = 7 - maxBit
  if (minBit + adjust < 0) adjust = -minBit

  const totalShifts: number[] = shifts.map(s => s - adjust)

  // Basic shear
  const out = new Uint8Array(8)
  for (let y = 0; y < 8; y++) {
    const s = totalShifts[y]
    if (s > 0) {
      out[y] = (bytes[y] << s) & 0xFF
    } else if (s < 0) {
      out[y] = bytes[y] >> -s
    } else {
      out[y] = bytes[y]
    }
  }

  // Fill gaps: where adjacent rows both had a pixel at the same original x,
  // fill horizontal gaps created by shift differences > 1
  for (let y = 0; y < 7; y++) {
    if (Math.abs(totalShifts[y] - totalShifts[y + 1]) <= 1) continue
    for (let x = 0; x < 8; x++) {
      if (!(bytes[y] & (0x80 >> x)) || !(bytes[y + 1] & (0x80 >> x))) continue
      const x1 = x - totalShifts[y]
      const x2 = x - totalShifts[y + 1]
      const lo = Math.max(0, Math.min(x1, x2))
      const hi = Math.min(7, Math.max(x1, x2))
      for (let fx = lo; fx <= hi; fx++) {
        out[y] |= (0x80 >> fx)
        out[y + 1] |= (0x80 >> fx)
      }
    }
  }

  return out
}

export function createObliqueVariant(font: FontInstance, angleDegrees: number) {
  const src = font.fontData.value
  const count = src.length / 8
  const oblique = new Uint8Array(src.length)
  for (let g = 0; g < count; g++) {
    const offset = g * 8
    const bytes = src.slice(offset, offset + 8)
    oblique.set(shearGlyphBytes(bytes, angleDegrees), offset)
  }
  const name = font.fileName.value.replace(/(\.\w+)$/, '-oblique$1')
  const newFont = createFont(oblique, name, font.startChar.value)
  addFont(newFont)
}

// File I/O
export function loadFont(font: FontInstance, buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer)
  const count = Math.floor(bytes.length / 8)
  const data = bytes.slice(0, count * 8)
  font.fontData.value = data
  font.savedSnapshot.value = new Uint8Array(data)
  font.dirty.value = false
  font.selectedGlyphs.value = new Set([0])
  font.lastClickedGlyph.value = 0
}

export function saveFont(font: FontInstance): Uint8Array {
  const data = new Uint8Array(font.fontData.value)
  font.savedSnapshot.value = new Uint8Array(data)
  font.dirty.value = false
  return data
}
