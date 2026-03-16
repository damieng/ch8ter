import { signal, type Signal, effect } from '@preact/signals'
import { getBit, setBit, clearBit } from './bitUtils'
import { UndoHistory } from './undoHistory'
import type { FontMeta, GlyphMeta } from './fileFormats/bdfParser'
import { parseCh8, writeCh8 } from './fileFormats/ch8Format'
import { baseName } from './fontLoad'
import { isFixedWidth } from './unicodeRanges'
import { calcAllMetrics, calcAscender, calcCapHeight, calcXHeight, calcNumericHeight, calcDescender } from './charMetrics'
import {
  type Charset, CHARSETS, charset,
  charsetGlyphFilter as charsetGlyphFilterImpl,
  cpToUnicode, buildUnicodeReverse,
} from './charsets'

// --- Font Instance ---

export type SpacingMode = 'monospace' | 'proportional'

export interface FontInstance {
  id: string
  fontData: Signal<Uint8Array>
  glyphWidth: Signal<number>
  glyphHeight: Signal<number>
  startChar: Signal<number>
  fileName: Signal<string>
  fontName: Signal<string>
  meta: Signal<FontMeta | null>
  encodings: Signal<number[] | null>
  glyphMeta: Signal<(GlyphMeta | null)[] | null>
  populatedGlyphs: Signal<Set<number> | null>
  selectedGlyphs: Signal<Set<number>>
  lastClickedGlyph: Signal<number>
  baseline: Signal<number>
  ascender: Signal<number>
  capHeight: Signal<number>
  xHeight: Signal<number>
  numericHeight: Signal<number>
  descender: Signal<number>
  gridZoom: Signal<number>
  hideEmpty: Signal<boolean>
  dirty: Signal<boolean>
  spacing: Signal<SpacingMode>
  editorOpen: Signal<boolean>
  savedSnapshot: Signal<Uint8Array>
  /** Bumped on each in-place pixel edit; lets the glyph editor re-render without copying fontData. */
  paintVersion: Signal<number>
  undoHistory: UndoHistory
}

export function bytesPerRow(font: FontInstance): number {
  return Math.ceil(font.glyphWidth.value / 8)
}

export function bytesPerGlyph(font: FontInstance): number {
  return font.glyphHeight.value * bytesPerRow(font)
}

function nameFromFile(filename: string): string {
  // Strip extension, then trailing numbers/brackets like "10", "(1)", "_14"
  return filename
    .replace(/\.\w+$/i, '')
    .replace(/[\s_-]*(\(\d+\)|\d+)$/, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
    .trim()
}

let nextFontId = 1

export function createFont(
  data?: Uint8Array,
  name?: string,
  start?: number,
  width?: number,
  height?: number,
  meta?: FontMeta,
  encodings?: number[],
  baselineOverride?: number,
  glyphMeta?: (GlyphMeta | null)[],
  spacingMode: SpacingMode = 'monospace',
): FontInstance {
  const id = `font-${nextFontId++}`
  const w = width ?? 8
  const h = height ?? 8
  const bpr = Math.ceil(w / 8)
  const bpg = h * bpr
  const initial = data ?? new Uint8Array(96 * bpg)
  // Count blank glyphs to decide default hideEmpty
  const numGlyphs = bpg > 0 ? Math.floor(initial.length / bpg) : 0
  let blankCount = 0
  for (let g = 0; g < numGlyphs; g++) {
    let blank = true
    const off = g * bpg
    for (let b = 0; b < bpg; b++) {
      if (initial[off + b] !== 0) { blank = false; break }
    }
    if (blank) blankCount++
  }
  const defaultHideEmpty = numGlyphs > 0 && blankCount > numGlyphs / 2
  return {
    id,
    fontData: signal(initial),
    glyphWidth: signal(w),
    glyphHeight: signal(h),
    startChar: signal(start ?? 32),
    fileName: signal(name ?? 'untitled.ch8'),
    fontName: signal(meta?.family || nameFromFile(name ?? 'untitled')),
    meta: signal<FontMeta | null>(meta ?? null),
    encodings: signal<number[] | null>(encodings ?? null),
    glyphMeta: signal<(GlyphMeta | null)[] | null>(glyphMeta ?? null),
    populatedGlyphs: signal<Set<number> | null>(null),
    selectedGlyphs: signal<Set<number>>(new Set([0])),
    lastClickedGlyph: signal(0),
    baseline: signal(baselineOverride ?? h - 1),
    ascender: signal(-1),
    capHeight: signal(-1),
    xHeight: signal(-1),
    numericHeight: signal(-1),
    descender: signal(-1),
    gridZoom: signal(5),
    hideEmpty: signal(defaultHideEmpty),
    spacing: signal(spacingMode),
    editorOpen: signal(false),
    dirty: signal(false),
    savedSnapshot: signal(new Uint8Array(initial)),
    paintVersion: signal(0),
    undoHistory: new UndoHistory(),
  }
}

// --- localStorage persistence ---

const STORAGE_KEY = 'ch8ter-fonts'
const LAYOUT_KEY = 'ch8ter-layout'

interface StoredFont {
  fileName: string
  fontName?: string
  startChar: number
  fontData: string // base64
  glyphWidth?: number
  glyphHeight?: number
  baseline?: number
  ascender?: number
  capHeight?: number
  xHeight?: number
  numericHeight?: number
  descender?: number
  meta?: FontMeta | null
  encodings?: number[] | null
  glyphMeta?: (GlyphMeta | null)[] | null
  populatedGlyphs?: number[] | null
  hideEmpty?: boolean
  spacing?: SpacingMode
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
  // Build binary string in chunks to avoid O(n²) string concat
  const chunks: string[] = []
  const CHUNK = 8192
  for (let i = 0; i < data.length; i += CHUNK) {
    chunks.push(String.fromCharCode(...data.subarray(i, Math.min(i + CHUNK, data.length))))
  }
  return btoa(chunks.join(''))
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
      const font = createFont(
        data,
        s.fileName,
        s.startChar,
        s.glyphWidth ?? 8,
        s.glyphHeight ?? 8,
        s.meta ?? undefined,
        s.encodings ?? undefined,
        s.baseline,
        s.glyphMeta ?? undefined,
        s.spacing ?? 'monospace',
      )
      if (s.fontName) font.fontName.value = s.fontName
      if (s.populatedGlyphs) font.populatedGlyphs.value = new Set(s.populatedGlyphs)
      if (s.hideEmpty != null) font.hideEmpty.value = s.hideEmpty
      font.savedSnapshot.value = new Uint8Array(data)
      font.dirty.value = false
      if (s.ascender != null) font.ascender.value = s.ascender
      if (s.capHeight != null) font.capHeight.value = s.capHeight
      if (s.xHeight != null) font.xHeight.value = s.xHeight
      if (s.numericHeight != null) font.numericHeight.value = s.numericHeight
      if (s.descender != null) font.descender.value = s.descender
      // Auto-calc metrics if not stored
      if (s.ascender == null) {
        const m = calcAllMetrics(data, s.startChar, s.glyphWidth ?? 8, s.glyphHeight ?? 8)
        font.ascender.value = m.ascender
        font.capHeight.value = m.capHeight
        font.xHeight.value = m.xHeight
        font.numericHeight.value = m.numericHeight
        font.descender.value = m.descender
      }
      return font
    })
  } catch {
    return null
  }
}

function saveToStorage() {
  const stored: StoredFont[] = fonts.value.map(f => ({
    fileName: f.fileName.value,
    fontName: f.fontName.value || undefined,
    startChar: f.startChar.value,
    fontData: toBase64(f.fontData.value),
    glyphWidth: f.glyphWidth.value,
    glyphHeight: f.glyphHeight.value,
    baseline: f.baseline.value,
    ascender: f.ascender.value,
    capHeight: f.capHeight.value,
    xHeight: f.xHeight.value,
    numericHeight: f.numericHeight.value,
    descender: f.descender.value,
    meta: f.meta.value,
    encodings: f.encodings.value,
    glyphMeta: f.glyphMeta.value,
    populatedGlyphs: f.populatedGlyphs.value ? [...f.populatedGlyphs.value] : null,
    hideEmpty: f.hideEmpty.value,
    spacing: f.spacing.value,
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
    f.fontName.value
    f.startChar.value
    f.glyphWidth.value
    f.glyphHeight.value
    f.meta.value
    f.glyphMeta.value
    f.baseline.value
    f.ascender.value
    f.capHeight.value
    f.xHeight.value
    f.numericHeight.value
    f.descender.value
    f.hideEmpty.value
    f.spacing.value
  }
  saveToStorage()
})

// Fill in only metrics that are still at default (-1), using BDF properties where available
export function calcMissingMetrics(font: FontInstance) {
  const data = font.fontData.value
  const start = font.startChar.value
  const w = font.glyphWidth.value
  const h = font.glyphHeight.value
  const bl = font.baseline.value
  const props = font.meta.value?.properties

  if (font.capHeight.value < 0) {
    const fromProp = props?.['CAP_HEIGHT']
    font.capHeight.value = fromProp != null ? parseInt(fromProp) : calcCapHeight(data, start, w, h, bl)
  }
  if (font.xHeight.value < 0) {
    const fromProp = props?.['X_HEIGHT']
    font.xHeight.value = fromProp != null ? parseInt(fromProp) : calcXHeight(data, start, w, h, bl)
  }
  if (font.ascender.value < 0) {
    font.ascender.value = calcAscender(data, start, w, h, bl)
  }
  if (font.numericHeight.value < 0) {
    font.numericHeight.value = calcNumericHeight(data, start, w, h, bl)
  }
  if (font.descender.value < 0) {
    font.descender.value = calcDescender(data, start, w, h, bl)
  }
}

export function recalcMetrics(font: FontInstance) {
  const m = calcAllMetrics(font.fontData.value, font.startChar.value, font.glyphWidth.value, font.glyphHeight.value)
  font.baseline.value = m.baseline
  font.ascender.value = m.ascender
  font.capHeight.value = m.capHeight
  font.xHeight.value = m.xHeight
  font.numericHeight.value = m.numericHeight
  font.descender.value = m.descender
}

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
  storedFocusedId.value = `grid-${font.id}`
}

export function openGlyphEditor(font: FontInstance) {
  font.editorOpen.value = true
  storedFocusedId.value = `editor-${font.id}`
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

export function openPreview(fontId: string, systemIdx?: number) {
  const id = `preview-${nextPreviewId++}`
  previews.value = [...previews.value, { id, fontId }]
  if (systemIdx !== undefined) {
    updatePreviewSettings(id, { fontId, systemIdx })
  }
  lastOpenedPreviewId.value = id
  storedFocusedId.value = id
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

// --- Charset (re-exported from charsets.ts) ---

export { type Charset, type CharsetDef, CHARSETS, charset, charLabel, charCodeFromKey } from './charsets'

export function charsetGlyphFilter(font: FontInstance): ((index: number) => boolean) | null {
  const def = CHARSETS[charset.value]
  return charsetGlyphFilterImpl(font.startChar.value, def?.range)
}

// Switch charset with Unicode-aware glyph remapping
export function switchCharset(newCs: Charset) {
  const oldCs = charset.value
  if (newCs === oldCs) return

  const font = fonts.value.find(f => f.id === activeFontId.value)
  if (font) {
    remapFontForCharset(font, oldCs, newCs)
  }

  charset.value = newCs
}

function remapFontForCharset(font: FontInstance, oldCs: Charset, newCs: Charset) {
  const newDef = CHARSETS[newCs]
  const newRange = newDef.range ?? [32, 126]

  const oldStart = font.startChar.value
  const oldCount = glyphCount(font)
  const bpr = Math.ceil(font.glyphWidth.value / 8)
  const bpg = font.glyphHeight.value * bpr
  const oldData = font.fontData.value
  const oldGm = font.glyphMeta.value

  // New font covers both the new charset range and any existing positions
  const newStart = Math.min(oldStart, newRange[0])
  const newEnd = Math.max(oldStart + oldCount - 1, newRange[1])
  const newCount = newEnd - newStart + 1
  const newData = new Uint8Array(newCount * bpg)
  const newGlyphMeta: (typeof oldGm extends null ? never : NonNullable<typeof oldGm>)[number][] | null =
    oldGm ? new Array(newCount).fill(null) : null
  const newPop = new Set<number>()

  const reverse = buildUnicodeReverse(newCs)
  const filled = new Set<number>()

  // First pass: place glyphs that have a mapped position in the new charset
  // Second pass: place unmapped glyphs at their original codepoint if available
  interface PendingGlyph { oldIdx: number; oldCp: number }
  const unmapped: PendingGlyph[] = []

  for (let i = 0; i < oldCount; i++) {
    const offset = i * bpg
    let hasData = false
    for (let b = 0; b < bpg; b++) {
      if (oldData[offset + b]) { hasData = true; break }
    }
    if (!hasData && (oldStart + i) !== 32) continue

    const oldCp = oldStart + i
    const unicode = cpToUnicode(oldCp, oldCs)
    const newCp = reverse.get(unicode)

    if (newCp !== undefined) {
      const newIdx = newCp - newStart
      if (newIdx >= 0 && newIdx < newCount && !filled.has(newIdx)) {
        newData.set(oldData.subarray(offset, offset + bpg), newIdx * bpg)
        filled.add(newIdx)
        if (hasData) newPop.add(newIdx)
        if (newGlyphMeta && oldGm?.[i]) newGlyphMeta[newIdx] = oldGm[i]
        continue
      }
    }

    unmapped.push({ oldIdx: i, oldCp })
  }

  // Place unmapped glyphs at their original codepoint position as fallback
  let droppedGlyphs = 0
  for (const { oldIdx, oldCp } of unmapped) {
    const fallbackIdx = oldCp - newStart
    if (fallbackIdx >= 0 && fallbackIdx < newCount && !filled.has(fallbackIdx)) {
      const offset = oldIdx * bpg
      newData.set(oldData.subarray(offset, offset + bpg), fallbackIdx * bpg)
      filled.add(fallbackIdx)
      newPop.add(fallbackIdx)
      if (newGlyphMeta && oldGm?.[oldIdx]) newGlyphMeta[fallbackIdx] = oldGm[oldIdx]
    } else {
      droppedGlyphs++
    }
  }

  font.startChar.value = newStart
  font.fontData.value = newData
  if (newGlyphMeta) font.glyphMeta.value = newGlyphMeta
  if (droppedGlyphs > 0) {
    // Glyphs were lost — keep font dirty so user gets a save warning
    font.dirty.value = true
  } else {
    // Lossless remap — update snapshot so font stays clean
    font.savedSnapshot.value = new Uint8Array(newData)
  }
  font.populatedGlyphs.value = newPop

  // Remap selection: follow the active glyph's Unicode character
  const activeOldIdx = font.lastClickedGlyph.value
  const activeOldCp = oldStart + activeOldIdx
  const activeUnicode = cpToUnicode(activeOldCp, oldCs)
  const activeNewCp = reverse.get(activeUnicode) ?? activeOldCp
  const activeNewIdx = Math.max(0, activeNewCp - newStart)
  font.selectedGlyphs.value = new Set([activeNewIdx])
  font.lastClickedGlyph.value = activeNewIdx
}

export function markDirty(font: FontInstance) {
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
  const bpg = bytesPerGlyph(font)
  return bpg > 0 ? Math.floor(font.fontData.value.length / bpg) : 0
}

export function getPixel(font: FontInstance, glyphIndex: number, x: number, y: number): boolean {
  const bpr = bytesPerRow(font)
  const bpg = bytesPerGlyph(font)
  const rowOffset = glyphIndex * bpg + y * bpr
  return getBit(font.fontData.value, rowOffset, x)
}

export function glyphToText(font: FontInstance, glyphIndex: number): string {
  const w = font.glyphWidth.value
  const h = font.glyphHeight.value
  const bpr = bytesPerRow(font)
  const bpg = bytesPerGlyph(font)
  const data = font.fontData.value
  const base = glyphIndex * bpg
  const rows: string[] = []
  for (let y = 0; y < h; y++) {
    let row = ''
    for (let x = 0; x < w; x++) {
      row += getBit(data, base + y * bpr, x) ? '*' : ' '
    }
    rows.push(row)
  }
  return rows.join('\r\n')
}

// Return the advance width (in pixels) for a glyph.
// In monospace fonts this is always the global glyph width.
// In proportional fonts we prefer per-glyph DWIDTH, then BBX width, then fall back to glyphWidth.
export function glyphAdvance(font: FontInstance, glyphIndex: number): number {
  const gw = font.glyphWidth.value
  const spacing = font.spacing.value
  const gmArr = font.glyphMeta.value
  const gm = gmArr && glyphIndex >= 0 && glyphIndex < gmArr.length ? gmArr[glyphIndex] : null

  if (spacing === 'proportional') {
    if (gm?.dwidth && gm.dwidth[0] > 0) return gm.dwidth[0]
    if (gm?.bbx && gm.bbx[0] > 0) return gm.bbx[0]
  }
  return gw
}

export function setGlyphAdvance(font: FontInstance, glyphIndex: number, advance: number) {
  const gmArr = font.glyphMeta.value
  const len = glyphCount(font)
  const meta: (GlyphMeta | null)[] = gmArr ? [...gmArr] : new Array(len).fill(null)
  const existing = meta[glyphIndex]
  meta[glyphIndex] = { ...existing, dwidth: [advance, 0] }
  font.glyphMeta.value = meta
  font.dirty.value = true
}

/**
 * Set a pixel during a paint stroke.  Mutates the existing Uint8Array in
 * place (no allocation) and bumps paintVersion to trigger re-renders in
 * the glyph editor.  The fontData signal is NOT updated here — that
 * happens in commitPaintStroke which creates the new array reference
 * needed for undo snapshots and downstream subscribers (tiles, preview).
 */
export function setPixel(font: FontInstance, glyphIndex: number, x: number, y: number, on: boolean) {
  const bpr = bytesPerRow(font)
  const bpg = bytesPerGlyph(font)
  const data = font.fontData.value
  const rowOffset = glyphIndex * bpg + y * bpr
  if (on) setBit(data, rowOffset, x)
  else clearBit(data, rowOffset, x)
  font.paintVersion.value++
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
export function selectAll(font: FontInstance) {
  const count = glyphCount(font)
  const result = new Set<number>()
  for (let i = 0; i < count; i++) result.add(i)
  font.selectedGlyphs.value = result
  font.lastClickedGlyph.value = 0
}
export function invertSelection(font: FontInstance) {
  const count = glyphCount(font)
  const current = font.selectedGlyphs.value
  const result = new Set<number>()
  for (let i = 0; i < count; i++) {
    if (!current.has(i)) result.add(i)
  }
  if (result.size === 0) return
  font.selectedGlyphs.value = result
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

// --- Generic pixel helpers for transform functions ---
// These work on raw glyph byte arrays with given dimensions.

function getPixelBit(bytes: Uint8Array, bpr: number, x: number, y: number): boolean {
  return getBit(bytes, y * bpr, x)
}

function setPixelBit(bytes: Uint8Array, bpr: number, x: number, y: number) {
  setBit(bytes, y * bpr, x)
}

export function flipXBytes(bytes: Uint8Array, w: number, h: number): Uint8Array {
  const bpr = Math.ceil(w / 8)
  const out = new Uint8Array(h * bpr)
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (getPixelBit(bytes, bpr, x, y)) setPixelBit(out, bpr, w - 1 - x, y)
  return out
}

export function flipYBytes(bytes: Uint8Array, w: number, h: number): Uint8Array {
  const bpr = Math.ceil(w / 8)
  const out = new Uint8Array(h * bpr)
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (getPixelBit(bytes, bpr, x, y)) setPixelBit(out, bpr, x, h - 1 - y)
  return out
}

export function invertBytes(bytes: Uint8Array, w: number, h: number): Uint8Array {
  const bpr = Math.ceil(w / 8)
  const out = new Uint8Array(h * bpr)
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (!getPixelBit(bytes, bpr, x, y)) setPixelBit(out, bpr, x, y)
  return out
}

export function rotateCWBytes(bytes: Uint8Array, w: number, h: number): Uint8Array {
  // Rotate CW: (x,y) -> (h-1-y, x) — output is w×h but transposed
  // For non-square, output dims swap but we keep same bpg for simplicity
  // Only works cleanly for square glyphs; for non-square, use same dims
  const bpr = Math.ceil(w / 8)
  const out = new Uint8Array(h * bpr)
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (getPixelBit(bytes, bpr, x, y)) {
        const nx = h - 1 - y, ny = x
        if (nx < w && ny < h) setPixelBit(out, bpr, nx, ny)
      }
  return out
}

export function rotateCCWBytes(bytes: Uint8Array, w: number, h: number): Uint8Array {
  const bpr = Math.ceil(w / 8)
  const out = new Uint8Array(h * bpr)
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (getPixelBit(bytes, bpr, x, y)) {
        const nx = y, ny = w - 1 - x
        if (nx < w && ny < h) setPixelBit(out, bpr, nx, ny)
      }
  return out
}

export function shiftUp(bytes: Uint8Array, w: number, h: number): Uint8Array {
  const bpr = Math.ceil(w / 8)
  const out = new Uint8Array(h * bpr)
  for (let y = 0; y < h; y++) {
    const srcY = (y + 1) % h
    for (let i = 0; i < bpr; i++) out[y * bpr + i] = bytes[srcY * bpr + i]
  }
  return out
}

export function shiftDown(bytes: Uint8Array, w: number, h: number): Uint8Array {
  const bpr = Math.ceil(w / 8)
  const out = new Uint8Array(h * bpr)
  for (let y = 0; y < h; y++) {
    const srcY = (y - 1 + h) % h
    for (let i = 0; i < bpr; i++) out[y * bpr + i] = bytes[srcY * bpr + i]
  }
  return out
}

export function shiftLeft(bytes: Uint8Array, w: number, h: number): Uint8Array {
  const bpr = Math.ceil(w / 8)
  const out = new Uint8Array(h * bpr)
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (getPixelBit(bytes, bpr, x, y)) setPixelBit(out, bpr, (x - 1 + w) % w, y)
  return out
}

export function shiftRight(bytes: Uint8Array, w: number, h: number): Uint8Array {
  const bpr = Math.ceil(w / 8)
  const out = new Uint8Array(h * bpr)
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (getPixelBit(bytes, bpr, x, y)) setPixelBit(out, bpr, (x + 1) % w, y)
  return out
}

export function centerHorizontalBytes(bytes: Uint8Array, w: number, h: number): Uint8Array {
  const bpr = Math.ceil(w / 8)
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

// Create bold variant — OR each pixel with its right neighbour
export function createBoldVariant(font: FontInstance) {
  const src = font.fontData.value
  const w = font.glyphWidth.value
  const h = font.glyphHeight.value
  const bpr = bytesPerRow(font)
  const bpg = bytesPerGlyph(font)
  const count = glyphCount(font)
  const bold = new Uint8Array(src.length)
  for (let g = 0; g < count; g++) {
    const offset = g * bpg
    const bytes = src.slice(offset, offset + bpg)
    let rightUsed = false, leftFree = true
    for (let y = 0; y < h; y++) {
      if (getPixelBit(bytes, bpr, w - 1, y)) rightUsed = true
      if (getPixelBit(bytes, bpr, 0, y)) leftFree = false
    }
    const glyphBold = new Uint8Array(bpg)
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        let srcX = x
        if (rightUsed && leftFree) srcX = x + 1
        const on = (srcX < w && getPixelBit(bytes, bpr, srcX, y)) ||
                   (srcX > 0 && srcX - 1 < w && getPixelBit(bytes, bpr, srcX - 1, y))
        if (on) setPixelBit(glyphBold, bpr, x, y)
      }
    bold.set(glyphBold, offset)
  }
  const name = font.fileName.value.replace(/(\.\w+)$/, '-bold$1')
  const newFont = createFont(bold, name, font.startChar.value, w, h)
  recalcMetrics(newFont)
  addFont(newFont)
}

// Outline variant — set pixels become the border of the original shape
export function createOutlineVariant(font: FontInstance) {
  const src = font.fontData.value
  const w = font.glyphWidth.value
  const h = font.glyphHeight.value
  const bpr = bytesPerRow(font)
  const bpg = bytesPerGlyph(font)
  const count = glyphCount(font)
  const outline = new Uint8Array(src.length)
  for (let g = 0; g < count; g++) {
    const offset = g * bpg
    const bytes = src.slice(offset, offset + bpg)
    const glyphOut = new Uint8Array(bpg)
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const orig = getPixelBit(bytes, bpr, x, y)
        if (orig) continue // outline = only border pixels
        // Check if any neighbour is set
        const hasNeighbour =
          (x > 0 && getPixelBit(bytes, bpr, x - 1, y)) ||
          (x < w - 1 && getPixelBit(bytes, bpr, x + 1, y)) ||
          (y > 0 && getPixelBit(bytes, bpr, x, y - 1)) ||
          (y < h - 1 && getPixelBit(bytes, bpr, x, y + 1))
        if (hasNeighbour) setPixelBit(glyphOut, bpr, x, y)
      }
    outline.set(glyphOut, offset)
  }
  const name = font.fileName.value.replace(/(\.\w+)$/, '-outline$1')
  const newFont = createFont(outline, name, font.startChar.value, w, h)
  recalcMetrics(newFont)
  addFont(newFont)
}

// Oblique variant — shear via float-precision transform + Bresenham re-rasterize
// For each original pixel, compute exact sheared position. Then draw Bresenham
// lines between all pairs of originally 8-connected pixels to preserve strokes.
export function shearGlyphBytes(bytes: Uint8Array, angleDegrees: number, w: number, h: number): Uint8Array {
  const bpr = Math.ceil(w / 8)
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

export function createObliqueVariant(font: FontInstance, angleDegrees: number) {
  const src = font.fontData.value
  const w = font.glyphWidth.value
  const h = font.glyphHeight.value
  const bpg = bytesPerGlyph(font)
  const count = glyphCount(font)
  const oblique = new Uint8Array(src.length)
  for (let g = 0; g < count; g++) {
    const offset = g * bpg
    const bytes = src.slice(offset, offset + bpg)
    oblique.set(shearGlyphBytes(bytes, angleDegrees, w, h), offset)
  }
  const name = font.fileName.value.replace(/(\.\w+)$/, '-oblique$1')
  const newFont = createFont(oblique, name, font.startChar.value, w, h)
  recalcMetrics(newFont)
  addFont(newFont)
}

// Proportional variant — shift each non-fixed-width glyph left to the pixel edge,
// set advance = tight pixel width + 1px gap. Fixed-width glyphs keep full cell advance.
export function createProportionalVariant(font: FontInstance) {
  const src = font.fontData.value
  const w = font.glyphWidth.value
  const h = font.glyphHeight.value
  const bpr = bytesPerRow(font)
  const bpg = bytesPerGlyph(font)
  const count = glyphCount(font)
  const start = font.startChar.value
  const out = new Uint8Array(src.length)
  const meta: (GlyphMeta | null)[] = []

  for (let g = 0; g < count; g++) {
    const offset = g * bpg
    const bytes = src.slice(offset, offset + bpg)
    const charCode = start + g

    if (isFixedWidth(charCode)) {
      out.set(bytes, offset)
      meta.push({ dwidth: [w, 0] })
      continue
    }

    // Find pixel bounds
    let left = w, right = -1
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++)
        if (getPixelBit(bytes, bpr, x, y)) {
          if (x < left) left = x
          if (x > right) right = x
        }

    if (right < 0) {
      // Empty glyph (space etc.) — use half cell width
      out.set(bytes, offset)
      meta.push({ dwidth: [Math.max(1, Math.round(w / 2)), 0] })
      continue
    }

    // Shift pixels left to column 0
    const shifted = new Uint8Array(bpg)
    for (let y = 0; y < h; y++)
      for (let x = left; x < w; x++)
        if (getPixelBit(bytes, bpr, x, y))
          setPixelBit(shifted, bpr, x - left, y)
    out.set(shifted, offset)

    // Advance = tight width + 1px gap
    meta.push({ dwidth: [right - left + 2, 0] })
  }

  const name = font.fileName.value.replace(/(\.\w+)$/, '-proportional$1')
  const newFont = createFont(out, name, start, w, h, undefined, undefined, undefined, meta, 'proportional')
  recalcMetrics(newFont)
  addFont(newFont)
}

// Monospace variant — places each glyph's pixels into a fixed-width cell using the chosen anchor.
export function createMonospaceVariant(
  font: FontInstance,
  newW: number,
  anchorX: 'left' | 'center' | 'right',
) {
  const src = font.fontData.value
  const w = font.glyphWidth.value
  const h = font.glyphHeight.value
  const bpr = Math.ceil(w / 8)
  const bpg = h * bpr
  const newBpr = Math.ceil(newW / 8)
  const newBpg = h * newBpr
  const count = glyphCount(font)
  const start = font.startChar.value
  const out = new Uint8Array(count * newBpg)

  for (let g = 0; g < count; g++) {
    const srcOff = g * bpg
    const bytes = src.slice(srcOff, srcOff + bpg)
    const dstBytes = new Uint8Array(newBpg)

    // Find tight pixel bounds
    let left = w, right = -1
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++)
        if (getPixelBit(bytes, bpr, x, y)) {
          if (x < left) left = x
          if (x > right) right = x
        }

    if (right < 0) {
      // Empty glyph — leave blank
      out.set(dstBytes, g * newBpg)
      continue
    }

    const pixW = right - left + 1
    const dx = anchorX === 'left' ? 0
      : anchorX === 'right' ? newW - pixW
      : Math.floor((newW - pixW) / 2)

    for (let y = 0; y < h; y++)
      for (let x = left; x <= right; x++) {
        const nx = x - left + dx
        if (getPixelBit(bytes, bpr, x, y) && nx >= 0 && nx < newW)
          setPixelBit(dstBytes, newBpr, nx, y)
      }

    out.set(dstBytes, g * newBpg)
  }

  const name = font.fileName.value.replace(/(\.\w+)$/, '-monospace$1')
  const newFont = createFont(out, name, start, newW, h, undefined, undefined, undefined, undefined, 'monospace')
  recalcMetrics(newFont)
  addFont(newFont)
}

// File I/O
export function loadFont(font: FontInstance, buffer: ArrayBuffer) {
  const data = parseCh8(buffer, bytesPerGlyph(font))
  font.fontData.value = data
  font.savedSnapshot.value = new Uint8Array(data)
  font.dirty.value = false
  font.selectedGlyphs.value = new Set([0])
  font.lastClickedGlyph.value = 0
  font.undoHistory.clear()
  recalcMetrics(font)
}

// Resize all glyphs in a font to new dimensions
export function resizeFont(
  font: FontInstance,
  newW: number, newH: number,
  anchorX: 'left' | 'center' | 'right',
  anchorY: 'top' | 'center' | 'bottom',
) {
  const oldW = font.glyphWidth.value
  const oldH = font.glyphHeight.value
  if (newW === oldW && newH === oldH) return

  const oldBpr = Math.ceil(oldW / 8)
  const oldBpg = oldH * oldBpr
  const newBpr = Math.ceil(newW / 8)
  const newBpg = newH * newBpr
  const count = glyphCount(font)
  const src = font.fontData.value
  const dst = new Uint8Array(count * newBpg)

  // Compute pixel offsets based on anchor
  const dx = anchorX === 'left' ? 0 : anchorX === 'right' ? newW - oldW : Math.floor((newW - oldW) / 2)
  const dy = anchorY === 'top' ? 0 : anchorY === 'bottom' ? newH - oldH : Math.floor((newH - oldH) / 2)

  for (let g = 0; g < count; g++) {
    const srcOff = g * oldBpg
    const dstOff = g * newBpg
    const srcBytes = src.slice(srcOff, srcOff + oldBpg)
    const dstBytes = new Uint8Array(newBpg)

    for (let y = 0; y < oldH; y++) {
      const ny = y + dy
      if (ny < 0 || ny >= newH) continue
      for (let x = 0; x < oldW; x++) {
        const nx = x + dx
        if (nx < 0 || nx >= newW) continue
        if (getPixelBit(srcBytes, oldBpr, x, y)) {
          setPixelBit(dstBytes, newBpr, nx, ny)
        }
      }
    }
    dst.set(dstBytes, dstOff)
  }

  // Adjust baseline by the same vertical offset as the pixels
  font.baseline.value = Math.max(0, Math.min(newH - 1, font.baseline.value + dy))
  font.glyphWidth.value = newW
  font.glyphHeight.value = newH
  font.fontData.value = dst
  font.savedSnapshot.value = new Uint8Array(dst)
  font.dirty.value = true
  font.undoHistory.clear()
}

export function saveFont(font: FontInstance): Uint8Array {
  const data = writeCh8(font.fontData.value)
  font.savedSnapshot.value = new Uint8Array(data)
  font.dirty.value = false
  return data
}

/** Extract a plain FontConversionData snapshot from a FontInstance (marks font as saved). */
export function fontToConversionData(font: FontInstance): import('./fontLoad').FontConversionData {
  const fontData = saveFont(font)
  const w = font.glyphWidth.value
  const h = font.glyphHeight.value
  const bpr = Math.ceil(w / 8)
  const bpg = h * bpr
  return {
    fontData,
    glyphWidth: w,
    glyphHeight: h,
    startChar: font.startChar.value,
    glyphCount: bpg > 0 ? Math.floor(fontData.length / bpg) : 0,
    baseline: font.baseline.value,
    meta: font.meta.value,
    encodings: font.encodings.value,
    glyphMeta: font.glyphMeta.value,
    populated: font.populatedGlyphs.value,
    fontName: font.fontName.value || baseName(font.fileName.value),
    spacingMode: font.spacing.value,
    detectedCharset: '',
    useCalcMissing: false,
    ascender: font.ascender.value >= 0 ? font.ascender.value : undefined,
    descender: font.descender.value >= 0 ? font.descender.value : undefined,
  }
}
