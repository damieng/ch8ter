import { signal, computed } from '@preact/signals'

const DEFAULT_START = 32
const DEFAULT_COUNT = 96

export const fontData = signal<Uint8Array>(new Uint8Array(DEFAULT_COUNT * 8))
export const startChar = signal(DEFAULT_START)
export const glyphCount = computed(() => fontData.value.length / 8)

export const selectedGlyphs = signal<Set<number>>(new Set([0]))
export const lastClickedGlyph = signal(0)
export const activeGlyph = computed(() => lastClickedGlyph.value)

export const gridZoom = signal(5) // right-side grid: 1-10 (x100%)
export const editorZoom = signal(8) // editor: 4-20 (x100%)

export function getPixel(glyphIndex: number, x: number, y: number): boolean {
  const offset = glyphIndex * 8 + y
  return (fontData.value[offset] & (0x80 >> x)) !== 0
}

export function setPixel(glyphIndex: number, x: number, y: number, on: boolean) {
  const data = new Uint8Array(fontData.value)
  const offset = glyphIndex * 8 + y
  if (on) {
    data[offset] |= (0x80 >> x)
  } else {
    data[offset] &= ~(0x80 >> x)
  }
  fontData.value = data
}

export function togglePixel(glyphIndex: number, x: number, y: number) {
  setPixel(glyphIndex, x, y, !getPixel(glyphIndex, x, y))
}

export function selectGlyph(index: number, shift: boolean, ctrl: boolean) {
  const count = glyphCount.value
  if (index < 0 || index >= count) return

  if (shift) {
    const from = Math.min(lastClickedGlyph.value, index)
    const to = Math.max(lastClickedGlyph.value, index)
    const next = new Set(selectedGlyphs.value)
    for (let i = from; i <= to; i++) next.add(i)
    selectedGlyphs.value = next
  } else if (ctrl) {
    const next = new Set(selectedGlyphs.value)
    if (next.has(index)) {
      next.delete(index)
      if (next.size === 0) next.add(index)
    } else {
      next.add(index)
    }
    selectedGlyphs.value = next
  } else {
    selectedGlyphs.value = new Set([index])
  }
  lastClickedGlyph.value = index
}

function charRange(from: number, to: number): Set<number> {
  const s = startChar.value
  const count = glyphCount.value
  const result = new Set<number>()
  for (let c = from; c <= to; c++) {
    const idx = c - s
    if (idx >= 0 && idx < count) result.add(idx)
  }
  return result
}

export function selectNumbers() {
  selectedGlyphs.value = charRange(48, 57)
  const first = 48 - startChar.value
  if (first >= 0) lastClickedGlyph.value = first
}
export function selectUppercase() {
  selectedGlyphs.value = charRange(65, 90)
  const first = 65 - startChar.value
  if (first >= 0) lastClickedGlyph.value = first
}
export function selectLowercase() {
  selectedGlyphs.value = charRange(97, 122)
  const first = 97 - startChar.value
  if (first >= 0) lastClickedGlyph.value = first
}
export function selectSymbols() {
  const s = startChar.value
  const count = glyphCount.value
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
    selectedGlyphs.value = result
    lastClickedGlyph.value = Math.min(...result)
  }
}

// Transformations
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

function applyToGlyph(index: number, fn: (b: Uint8Array) => Uint8Array) {
  const data = new Uint8Array(fontData.value)
  const offset = index * 8
  const bytes = data.slice(offset, offset + 8)
  data.set(fn(bytes), offset)
  fontData.value = data
}

function applyToSelected(fn: (b: Uint8Array) => Uint8Array) {
  const data = new Uint8Array(fontData.value)
  for (const idx of selectedGlyphs.value) {
    const offset = idx * 8
    const bytes = data.slice(offset, offset + 8)
    data.set(fn(bytes), offset)
  }
  fontData.value = data
}

// Single active glyph transforms (left panel editor)
export const activeFlipX = () => applyToGlyph(activeGlyph.value, flipXBytes)
export const activeFlipY = () => applyToGlyph(activeGlyph.value, flipYBytes)
export const activeInvert = () => applyToGlyph(activeGlyph.value, invertBytes)
export const activeRotateCW = () => applyToGlyph(activeGlyph.value, rotateCWBytes)
export const activeShiftUp = () => applyToGlyph(activeGlyph.value, shiftUp)
export const activeShiftDown = () => applyToGlyph(activeGlyph.value, shiftDown)
export const activeShiftLeft = () => applyToGlyph(activeGlyph.value, shiftLeft)
export const activeShiftRight = () => applyToGlyph(activeGlyph.value, shiftRight)

// Selection transforms (right panel Tools dropdown)
export const selFlipX = () => applyToSelected(flipXBytes)
export const selFlipY = () => applyToSelected(flipYBytes)
export const selInvert = () => applyToSelected(invertBytes)
export const selRotateCW = () => applyToSelected(rotateCWBytes)
export const selShiftUp = () => applyToSelected(shiftUp)
export const selShiftDown = () => applyToSelected(shiftDown)
export const selShiftLeft = () => applyToSelected(shiftLeft)
export const selShiftRight = () => applyToSelected(shiftRight)

// File I/O
export function loadFont(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer)
  const count = Math.floor(bytes.length / 8)
  fontData.value = bytes.slice(0, count * 8)
  selectedGlyphs.value = new Set([0])
  lastClickedGlyph.value = 0
}

export function saveFont(): Uint8Array {
  return new Uint8Array(fontData.value)
}
