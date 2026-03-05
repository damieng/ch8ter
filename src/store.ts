import { signal, type Signal, effect } from '@preact/signals'
import { UndoHistory } from './undoHistory'

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
  undoHistory: UndoHistory
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
    undoHistory: new UndoHistory(),
  }
}

// --- localStorage persistence ---

const STORAGE_KEY = 'ch8ter-fonts'
const LAYOUT_KEY = 'ch8ter-layout'

interface StoredFont {
  fileName: string
  startChar: number
  fontData: string // base64
}

// --- Window layout persistence ---

export interface WindowRect {
  x: number
  y: number
  w: number
  h: number
}

export interface StoredPreview {
  id: string
  fontId: string
  selectedFontId?: string
  textKey?: string
  zoom?: number
  systemIdx?: number
  fg?: string
  bg?: string
  proportional?: boolean
  lineHeight?: number
}

interface StoredLayout {
  windows: Record<string, WindowRect>
  previews: StoredPreview[]
  focusedId: string
}

export const windowLayouts = signal<Record<string, WindowRect>>({})
export const storedPreviews = signal<StoredPreview[]>([])
export const storedFocusedId = signal<string>('ch8ter')

export function updateWindowLayout(id: string, rect: Partial<WindowRect>) {
  const current = windowLayouts.value[id] ?? { x: 0, y: 0, w: 0, h: 0 }
  windowLayouts.value = { ...windowLayouts.value, [id]: { ...current, ...rect } }
}

function loadLayout() {
  try {
    const raw = localStorage.getItem(LAYOUT_KEY)
    if (!raw) return
    const layout: StoredLayout = JSON.parse(raw)
    if (layout.windows) windowLayouts.value = layout.windows
    if (layout.previews) storedPreviews.value = layout.previews
    if (layout.focusedId) storedFocusedId.value = layout.focusedId
  } catch { /* ignore */ }
}

function saveLayout() {
  const layout: StoredLayout = {
    windows: windowLayouts.value,
    previews: previews.value.map(p => {
      // Merge runtime preview state
      const stored = storedPreviews.value.find(s => s.id === p.id)
      return { id: p.id, fontId: p.fontId, ...stored }
    }),
    focusedId: storedFocusedId.value,
  }
  localStorage.setItem(LAYOUT_KEY, JSON.stringify(layout))
}

export function updatePreviewSettings(id: string, settings: Partial<StoredPreview>) {
  const list = storedPreviews.value
  const idx = list.findIndex(s => s.id === id)
  if (idx >= 0) {
    const updated = [...list]
    updated[idx] = { ...updated[idx], ...settings }
    storedPreviews.value = updated
  } else {
    storedPreviews.value = [...list, { id, fontId: '', ...settings }]
  }
}

function toBase64(data: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < data.length; i++) binary += String.fromCharCode(data[i])
  return btoa(binary)
}

function fromBase64(b64: string): Uint8Array {
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

function loadFromStorage(): FontInstance[] | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const stored: StoredFont[] = JSON.parse(raw)
    if (!Array.isArray(stored) || stored.length === 0) return null
    return stored.map(s => {
      const data = fromBase64(s.fontData)
      const font = createFont(data, s.fileName, s.startChar)
      font.savedSnapshot.value = new Uint8Array(data)
      font.dirty.value = false
      return font
    })
  } catch {
    return null
  }
}

function saveToStorage() {
  const stored: StoredFont[] = fonts.value.map(f => ({
    fileName: f.fileName.value,
    startChar: f.startChar.value,
    fontData: toBase64(f.fontData.value),
  }))
  localStorage.setItem(STORAGE_KEY, JSON.stringify(stored))
}

// --- Global state ---

const restored = loadFromStorage()
export const fonts = signal<FontInstance[]>(restored ?? [createFont()])
export const activeFontId = signal<string>(fonts.value[0].id)

// Auto-save to localStorage on any font data/name/list change
effect(() => {
  // Access all reactive values we want to track
  const allFonts = fonts.value
  for (const f of allFonts) {
    f.fontData.value
    f.fileName.value
    f.startChar.value
  }
  saveToStorage()
})

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
  fonts.value = remaining
  if (activeFontId.value === id) {
    activeFontId.value = remaining.length > 0 ? remaining[0].id : ''
  }
}

// --- Preview windows ---

export interface PreviewInstance {
  id: string
  fontId: string
}

let nextPreviewId = 1

export const previews = signal<PreviewInstance[]>([])
export const lastOpenedPreviewId = signal<string | null>(null)

export function openPreview(fontId: string) {
  const id = `preview-${nextPreviewId++}`
  previews.value = [...previews.value, { id, fontId }]
  lastOpenedPreviewId.value = id
}

export function closePreview(id: string) {
  previews.value = previews.value.filter(p => p.id !== id)
  // Clean up stored settings
  storedPreviews.value = storedPreviews.value.filter(s => s.id !== id)
}

// Restore previews and layout from localStorage
loadLayout()
const restoredPreviews = storedPreviews.value
if (restoredPreviews.length > 0) {
  // Ensure preview IDs don't conflict
  const maxId = restoredPreviews.reduce((max, p) => {
    const n = parseInt(p.id.replace('preview-', ''))
    return isNaN(n) ? max : Math.max(max, n)
  }, 0)
  nextPreviewId = maxId + 1
  previews.value = restoredPreviews.map(p => ({ id: p.id, fontId: p.fontId }))
}

// Auto-save layout
let layoutTimer: ReturnType<typeof setTimeout> | null = null
effect(() => {
  // Track window layouts and preview state
  windowLayouts.value
  previews.value
  storedPreviews.value
  storedFocusedId.value
  if (layoutTimer) clearTimeout(layoutTimer)
  layoutTimer = setTimeout(saveLayout, 300)
})

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

// Reverse lookup: given a typed character, find its char code in the font.
// In ZX mode, maps £→0x60, ↑→0x5E, ©→0x7F. Otherwise uses charCodeAt.
export function charCodeFromKey(ch: string): number | null {
  if (ch.length !== 1) return null
  if (charset.value === 'zx') {
    for (const [code, label] of Object.entries(ZX_OVERRIDES)) {
      if (label === ch) return parseInt(code)
    }
  }
  const code = ch.charCodeAt(0)
  if (code >= 32 && code <= 126) return code
  return null
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

export function glyphToText(font: FontInstance, glyphIndex: number): string {
  const data = font.fontData.value
  const offset = glyphIndex * 8
  const rows: string[] = []
  for (let y = 0; y < 8; y++) {
    let row = ''
    for (let x = 0; x < 8; x++) {
      row += (data[offset + y] & (0x80 >> x)) ? '*' : ' '
    }
    rows.push(row)
  }
  return rows.join('\r\n')
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

export function flipXBytes(bytes: Uint8Array): Uint8Array {
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

export function flipYBytes(bytes: Uint8Array): Uint8Array {
  const out = new Uint8Array(8)
  for (let y = 0; y < 8; y++) out[y] = bytes[7 - y]
  return out
}

export function invertBytes(bytes: Uint8Array): Uint8Array {
  const out = new Uint8Array(8)
  for (let y = 0; y < 8; y++) out[y] = bytes[y] ^ 0xFF
  return out
}

export function rotateCWBytes(bytes: Uint8Array): Uint8Array {
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

export function rotateCCWBytes(bytes: Uint8Array): Uint8Array {
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

export function shiftUp(bytes: Uint8Array): Uint8Array {
  const out = new Uint8Array(8)
  for (let y = 0; y < 7; y++) out[y] = bytes[y + 1]
  out[7] = bytes[0]
  return out
}

export function shiftDown(bytes: Uint8Array): Uint8Array {
  const out = new Uint8Array(8)
  for (let y = 1; y < 8; y++) out[y] = bytes[y - 1]
  out[0] = bytes[7]
  return out
}

export function shiftLeft(bytes: Uint8Array): Uint8Array {
  const out = new Uint8Array(8)
  for (let y = 0; y < 8; y++) {
    out[y] = ((bytes[y] << 1) | (bytes[y] >> 7)) & 0xFF
  }
  return out
}

export function shiftRight(bytes: Uint8Array): Uint8Array {
  const out = new Uint8Array(8)
  for (let y = 0; y < 8; y++) {
    out[y] = ((bytes[y] >> 1) | ((bytes[y] & 1) << 7)) & 0xFF
  }
  return out
}

export function centerHorizontalBytes(bytes: Uint8Array): Uint8Array {
  // Count blank columns on left
  let leftBlank = 0
  for (let x = 0; x < 8; x++) {
    let used = false
    for (let y = 0; y < 8; y++) {
      if (bytes[y] & (0x80 >> x)) { used = true; break }
    }
    if (used) break
    leftBlank++
  }
  // Count blank columns on right
  let rightBlank = 0
  for (let x = 7; x >= 0; x--) {
    let used = false
    for (let y = 0; y < 8; y++) {
      if (bytes[y] & (0x80 >> x)) { used = true; break }
    }
    if (used) break
    rightBlank++
  }
  if (leftBlank === 0 && rightBlank === 0) return new Uint8Array(bytes)
  if (leftBlank + rightBlank >= 8) return new Uint8Array(8) // empty glyph
  // Target: equal blanks, or left one more than right if odd
  const total = leftBlank + rightBlank
  const targetLeft = Math.ceil(total / 2)
  const shift = leftBlank - targetLeft // positive = shift left, negative = shift right
  if (shift === 0) return new Uint8Array(bytes)
  const out = new Uint8Array(8)
  for (let y = 0; y < 8; y++) {
    if (shift > 0) {
      out[y] = (bytes[y] << shift) & 0xFF
    } else {
      out[y] = bytes[y] >> -shift
    }
  }
  return out
}

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

// Outline variant — set pixels become the border of the original shape
export function createOutlineVariant(font: FontInstance) {
  const src = font.fontData.value
  const count = src.length / 8
  const outline = new Uint8Array(src.length)
  for (let g = 0; g < count; g++) {
    const offset = g * 8
    const bytes = src.slice(offset, offset + 8)
    // Expand: OR each pixel with its 4 neighbours
    const expanded = new Uint8Array(8)
    for (let y = 0; y < 8; y++) {
      expanded[y] = bytes[y] | ((bytes[y] << 1) & 0xFF) | (bytes[y] >> 1)
      if (y > 0) expanded[y] |= bytes[y - 1]
      if (y < 7) expanded[y] |= bytes[y + 1]
    }
    // Outline = expanded XOR original (border pixels only)
    for (let y = 0; y < 8; y++) {
      outline[offset + y] = expanded[y] ^ bytes[y]
    }
  }
  const name = font.fileName.value.replace(/(\.\w+)$/, '-outline$1')
  const newFont = createFont(outline, name, font.startChar.value)
  addFont(newFont)
}

// Oblique variant — shear via float-precision transform + Bresenham re-rasterize
// For each original pixel, compute exact sheared position. Then draw Bresenham
// lines between all pairs of originally 8-connected pixels to preserve strokes.
export function shearGlyphBytes(bytes: Uint8Array, angleDegrees: number): Uint8Array {
  const tan = Math.tan((angleDegrees * Math.PI) / 180)

  // Collect original set pixels
  const orig: { x: number; y: number }[] = []
  const isSet = (x: number, y: number) =>
    x >= 0 && x < 8 && y >= 0 && y < 8 && (bytes[y] & (0x80 >> x)) !== 0

  for (let y = 0; y < 8; y++)
    for (let x = 0; x < 8; x++)
      if (isSet(x, y)) orig.push({ x, y })

  if (orig.length === 0) return new Uint8Array(8)

  // Compute exact sheared x for each pixel (y stays the same)
  const shearedFloat = orig.map(p => ({
    x: p.x + tan * (3.5 - p.y),
    y: p.y,
    ox: p.x, oy: p.y,
  }))

  // Auto-center: find bounds and adjust
  let minX = Infinity, maxX = -Infinity
  for (const p of shearedFloat) {
    if (p.x < minX) minX = p.x
    if (p.x > maxX) maxX = p.x
  }
  let adjust = 0
  if (minX < 0) adjust = -minX
  if (maxX + adjust > 7) adjust = 7 - maxX
  if (minX + adjust < 0) adjust = -minX

  // Round to integer grid
  const rounded = shearedFloat.map(p => ({
    x: Math.max(0, Math.min(7, Math.round(p.x + adjust))),
    y: p.y,
    ox: p.ox, oy: p.oy,
  }))

  // Build lookup: original (x,y) → rounded (x,y)
  const posMap = new Map<string, { x: number; y: number }>()
  for (const p of rounded) {
    posMap.set(`${p.ox},${p.oy}`, { x: p.x, y: p.y })
  }

  const out = new Uint8Array(8)
  function plot(x: number, y: number) {
    if (x >= 0 && x < 8 && y >= 0 && y < 8) out[y] |= (0x80 >> x)
  }

  // Plot all transformed pixels
  for (const p of rounded) plot(p.x, p.y)

  // For each pair of 8-connected original pixels, draw Bresenham line
  // between their sheared positions to maintain connectivity
  for (const p of orig) {
    const from = posMap.get(`${p.x},${p.y}`)!
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dy === 0 && dx === 0) continue
        // Only process each pair once: neighbor with higher key
        const nx = p.x + dx, ny = p.y + dy
        if (ny < 0 || ny > 7 || nx < 0 || nx > 7) continue
        if (ny < p.y || (ny === p.y && nx < p.x)) continue
        if (!isSet(nx, ny)) continue
        const to = posMap.get(`${nx},${ny}`)!
        // Already 8-connected? Skip
        if (Math.abs(from.x - to.x) <= 1 && Math.abs(from.y - to.y) <= 1) continue
        // Bresenham between from and to
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
  font.undoHistory.clear()
}

export function saveFont(font: FontInstance): Uint8Array {
  const data = new Uint8Array(font.fontData.value)
  font.savedSnapshot.value = new Uint8Array(data)
  font.dirty.value = false
  return data
}
