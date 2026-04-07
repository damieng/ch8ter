import { signal, type Signal } from '@preact/signals'
import { getBit, setBit, clearBit, bpr as calcBpr } from './bitUtils'
import { UndoHistory } from './undoHistory'
import type { FontMeta, GlyphMeta } from './fileFormats/bdfParser'
import { baseName } from './fontLoad'
import { calcAllMetrics, calcAscender, calcCapHeight, calcXHeight, calcNumericHeight, calcDescender, buildGlyphLookup } from './charMetrics'
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
  /** If opened from a container pane, the container's id. */
  sourceContainerId?: string
  /** Original byte index for each glyph slot, if known. Sparse — only set for glyphs loaded from file. */
  charIndex?: Signal<(number | undefined)[]>
}

export function bytesPerRow(font: FontInstance): number {
  return calcBpr(font.glyphWidth.value)
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
  const bpr = calcBpr(w)
  const bpg = h * bpr
  let initial = data ?? new Uint8Array(96 * bpg)
  // Pad to whole glyph boundary if truncated
  if (bpg > 0 && initial.length % bpg !== 0) {
    const padded = new Uint8Array(Math.ceil(initial.length / bpg) * bpg)
    padded.set(initial)
    initial = padded
  }
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
  const defaultHideEmpty = data != null && numGlyphs > 0 && blankCount > numGlyphs / 2
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
    charIndex: data != null
      ? signal<(number | undefined)[]>(Array.from({ length: numGlyphs }, (_, i) => (start ?? 32) + i))
      : signal<(number | undefined)[]>([]),
    undoHistory: new UndoHistory(),
  }
}

// --- Persistence (types re-exported, logic in persistence.ts) ---

import {
  type WindowRect, type StoredPreview,
  loadFontsFromStorage, loadLayoutFromStorage,
  loadContainersFromStorage,
  setupFontAutoSave, setupLayoutAutoSave, setupContainerAutoSave,
} from './persistence'
export type { WindowRect, StoredPreview } from './persistence'

export const windowLayouts = signal<Record<string, WindowRect>>({})
export const storedPreviews = signal<StoredPreview[]>([])
export const storedFocusedId = signal<string>('ch8ter')

export function updateWindowLayout(id: string, rect: Partial<WindowRect>) {
  const current = windowLayouts.value[id] ?? { x: 0, y: 0, w: 0, h: 0 }
  windowLayouts.value = { ...windowLayouts.value, [id]: { ...current, ...rect } }
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

// --- Global state ---
const restored = loadFontsFromStorage()
const restoredContainers = loadContainersFromStorage()
const needsBlankFont = !restored && (!restoredContainers || restoredContainers.length === 0)
export const fonts = signal<FontInstance[]>(restored ?? (needsBlankFont ? [createFont()] : []))
export const activeFontId = signal<string>(fonts.value.length > 0 ? fonts.value[0].id : '')

// Auto-save fonts to localStorage
setupFontAutoSave(() => fonts.value)


// Fill in only metrics that are still at default (-1), using BDF properties where available
export function calcMissingMetrics(font: FontInstance) {
  const data = font.fontData.value
  const start = font.startChar.value
  const w = font.glyphWidth.value
  const h = font.glyphHeight.value
  const bl = font.baseline.value
  const props = font.meta.value?.properties
  const lookup = buildGlyphLookup(start, glyphCount(font))

  if (font.capHeight.value < 0) {
    const fromProp = props?.['CAP_HEIGHT']
    font.capHeight.value = fromProp != null ? parseInt(fromProp) : calcCapHeight(data, start, w, h, bl, lookup)
  }
  if (font.xHeight.value < 0) {
    const fromProp = props?.['X_HEIGHT']
    font.xHeight.value = fromProp != null ? parseInt(fromProp) : calcXHeight(data, start, w, h, bl, lookup)
  }
  if (font.ascender.value < 0) {
    font.ascender.value = calcAscender(data, start, w, h, bl, lookup)
  }
  if (font.numericHeight.value < 0) {
    font.numericHeight.value = calcNumericHeight(data, start, w, h, bl, lookup)
  }
  if (font.descender.value < 0) {
    font.descender.value = calcDescender(data, start, w, h, bl, lookup)
  }
}

export function recalcMetrics(font: FontInstance) {
  const lookup = buildGlyphLookup(font.startChar.value, glyphCount(font))
  const m = calcAllMetrics(font.fontData.value, font.startChar.value, font.glyphWidth.value, font.glyphHeight.value, lookup)
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

// --- Font containers ---

export interface ContainerFont {
  label: string
  codepage: number
  deviceName: string
  deviceType: number  // 1 = screen, 2 = printer
  startChar: number
  width: number
  height: number
  numChars: number
  fontData: Uint8Array
  baseline?: number
  meta?: FontMeta | null
  glyphMeta?: (GlyphMeta | null)[] | null
  populated?: Set<number> | null
  spacingMode?: SpacingMode
}

export interface ContainerMeta {
  properties: Record<string, string>
}

export interface FontContainer {
  id: string
  fileName: string
  format: string
  meta: ContainerMeta | null
  fonts: ContainerFont[]
}

export const containers = signal<FontContainer[]>(restoredContainers ?? [])

let nextContainerId = restoredContainers
  ? restoredContainers.reduce((max, c) => {
      const n = parseInt(c.id.replace('container-', ''))
      return isNaN(n) ? max : Math.max(max, n)
    }, 0) + 1
  : 1

export function addContainer(container: FontContainer) {
  containers.value = [...containers.value, container]
  storedFocusedId.value = `container-${container.id}`
}

export function removeContainer(id: string) {
  // Close all fonts that were opened from this container
  const childFontIds = fonts.value.filter(f => f.sourceContainerId === id).map(f => f.id)
  if (childFontIds.length > 0) {
    fonts.value = fonts.value.filter(f => f.sourceContainerId !== id)
    if (childFontIds.includes(activeFontId.value)) {
      activeFontId.value = fonts.value.length > 0 ? fonts.value[0].id : ''
    }
  }
  containers.value = containers.value.filter(c => c.id !== id)
}

export function createContainerId(): string {
  return `container-${nextContainerId++}`
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
const restoredLayout = loadLayoutFromStorage()
if (restoredLayout) {
  if (restoredLayout.windows) windowLayouts.value = restoredLayout.windows
  if (restoredLayout.previews) storedPreviews.value = restoredLayout.previews
  if (restoredLayout.focusedId) storedFocusedId.value = restoredLayout.focusedId
}
const restoredPreviews = storedPreviews.value
if (restoredPreviews.length > 0) {
  const maxId = restoredPreviews.reduce((max, p) => {
    const n = parseInt(p.id.replace('preview-', ''))
    return isNaN(n) ? max : Math.max(max, n)
  }, 0)
  nextPreviewId = maxId + 1
  previews.value = restoredPreviews.map(p => ({ id: p.id, fontId: p.fontId }))
}

// Auto-save layout
setupLayoutAutoSave(
  () => windowLayouts.value,
  () => previews.value,
  () => storedPreviews.value,
  () => storedFocusedId.value,
)

// Auto-save containers to localStorage
setupContainerAutoSave(() => containers.value)

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
  const bpr = calcBpr(font.glyphWidth.value)
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
  meta[glyphIndex] = existing ? { ...existing, dwidth: [advance, 0] } : { dwidth: [advance, 0] }
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

  const oldBpr = calcBpr(oldW)
  const oldBpg = oldH * oldBpr
  const newBpr = calcBpr(newW)
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
        if (getBit(srcBytes, y * oldBpr, x)) {
          setBit(dstBytes, ny * newBpr, nx)
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
  font.dirty.value = true
  font.undoHistory.clear()
}

export function saveFont(font: FontInstance): Uint8Array {
  const snapshot = new Uint8Array(font.fontData.value)
  font.savedSnapshot.value = snapshot
  font.dirty.value = false
  return snapshot
}

/** Extract a plain FontConversionData snapshot from a FontInstance (marks font as saved). */
export function fontToConversionData(font: FontInstance): import('./fontLoad').FontConversionData {
  const fontData = saveFont(font)
  const w = font.glyphWidth.value
  const h = font.glyphHeight.value
  const bpr = calcBpr(w)
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
