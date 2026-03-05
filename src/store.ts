import { signal, type Signal, effect } from '@preact/signals'

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

export function clearGlyph(font: FontInstance, glyphIndex: number) {
  const data = new Uint8Array(font.fontData.value)
  const offset = glyphIndex * 8
  for (let y = 0; y < 8; y++) data[offset + y] = 0
  font.fontData.value = data
  markDirty(font)
}

export function pasteGlyph(font: FontInstance, glyphIndex: number, text: string): boolean {
  const rows = text.split(/\r?\n/)
  if (rows.length !== 8) return false
  if (!rows.every(r => r.length === 8 && /^[ *]{8}$/.test(r))) return false
  const data = new Uint8Array(font.fontData.value)
  const offset = glyphIndex * 8
  for (let y = 0; y < 8; y++) {
    let byte = 0
    for (let x = 0; x < 8; x++) {
      if (rows[y][x] === '*') byte |= (0x80 >> x)
    }
    data[offset + y] = byte
  }
  font.fontData.value = data
  markDirty(font)
  return true
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

function centerHorizontalBytes(bytes: Uint8Array): Uint8Array {
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
export const activeCenterH = (font: FontInstance) => applyToGlyph(font, font.lastClickedGlyph.value, centerHorizontalBytes)

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
export const selCenterH = (font: FontInstance) => applyToSelected(font, centerHorizontalBytes)

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
