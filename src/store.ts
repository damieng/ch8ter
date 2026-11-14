import { signal } from '@preact/signals'
import { bpr as calcBpr } from './bitUtils'
import type { FontMeta, GlyphMeta } from './fileFormats/bdfParser'
import { raiseWindow } from './windowStack'
import {
  type Charset, CHARSETS, defaultCharset, isCharset,
  charsetGlyphFilter as charsetGlyphFilterImpl,
  cpToUnicode, buildUnicodeReverse,
} from './charsets'
import { type FontInstance, type FontOptions, type SpacingMode, createFont } from './fontModel'
import { calcMissingMetrics, recalcMetrics, glyphCount } from './fontOps'

// The font model lives in its own module; re-exported so the many existing
// `from './store'` imports keep working.
export {
  type FontInstance, type FontOptions, type SpacingMode, type PinnedEditor,
  createFont, bytesPerRow, bytesPerGlyph,
} from './fontModel'

// --- Persistence (types re-exported, logic in persistence.ts) ---

import {
  type WindowRect, type StoredPreview,
  loadFontsFromStorage, loadLayoutFromStorage,
  loadContainersFromStorage,
  setupFontAutoSave, setupLayoutAutoSave, setupContainerAutoSave,
  buildWorkspaceFile, parseWorkspaceFile, fontFromStored, containerFromStored,
  remapWindowLayouts, remapWindowKey, savedEditorKeys,
} from './persistence'
export type { WindowRect, StoredPreview } from './persistence'

export const windowLayouts = signal<Record<string, WindowRect>>({})
export const storedPreviews = signal<StoredPreview[]>([])
export const storedFocusedId = signal<string>('ch8ter')

export function updateWindowLayout(id: string, rect: Partial<WindowRect>) {
  const current = windowLayouts.value[id] ?? { x: 0, y: 0, w: 0, h: 0 }
  windowLayouts.value = { ...windowLayouts.value, [id]: { ...current, ...rect } }
}

/** Forget the stored layouts of windows that no longer exist, so their ids can't leak onto later windows. */
function dropWindowLayouts(match: (key: string) => boolean) {
  const current = windowLayouts.value
  const stale = Object.keys(current).filter(match)
  if (stale.length === 0) return
  const next = { ...current }
  for (const k of stale) delete next[k]
  windowLayouts.value = next
}

/** Layout keys of a font's grid window, tracking editor and extra glyph editors. */
function isFontWindowKey(fontId: string, key: string): boolean {
  return key === `grid-${fontId}` || key === `editor-${fontId}` || key.startsWith(`editor-${fontId}-`)
}

// Minimized windows collapse to icons on the desktop, Program Manager style.
export const ICON_W = 88
export const ICON_H = 76
const ICON_GAP = 8

/** Collapse a window to a desktop icon (remembering where the icon was last put). */
export function minimizeWindow(id: string) {
  const layouts = windowLayouts.value
  const current = layouts[id]
  let iconX = current?.iconX
  let iconY = current?.iconY
  const taken = (x: number, y: number) => Object.entries(layouts).some(([k, r]) =>
    k !== id && r.minimized && r.iconX != null && r.iconY != null &&
    Math.abs(r.iconX - x) < ICON_W && Math.abs(r.iconY - y) < ICON_H)
  // Reuse where this icon was last put, unless another icon has since taken that spot
  if (iconX == null || iconY == null || taken(iconX, iconY)) {
    // First free slot along the bottom edge of the desktop, wrapping upwards
    const viewW = typeof window !== 'undefined' ? window.innerWidth : 1200
    const viewH = typeof window !== 'undefined' ? window.innerHeight : 800
    iconX = ICON_GAP * 2
    iconY = Math.max(0, viewH - ICON_H - ICON_GAP * 2)
    while (taken(iconX, iconY) && iconY > 0) {
      iconX += ICON_W + ICON_GAP
      if (iconX + ICON_W > viewW) {
        iconX = ICON_GAP * 2
        iconY = Math.max(0, iconY - ICON_H - ICON_GAP)
      }
    }
  }
  updateWindowLayout(id, { minimized: true, iconX, iconY })
  if (storedFocusedId.value === id) storedFocusedId.value = ''
}

/** True unless every window of this font (grid, glyph editors) is minimized to an icon. */
export function fontHasVisibleWindow(font: FontInstance): boolean {
  const layouts = windowLayouts.value
  const visible = (id: string) => layouts[id]?.minimized !== true
  if (visible(`grid-${font.id}`)) return true
  if (font.editorOpen.value && visible(font.trackerId.value)) return true
  return font.pinnedEditors.value.some(e => visible(e.id))
}

export function restoreWindow(id: string) {
  // Only touch a window that has a layout entry, so an unmounted window
  // isn't given a bogus 0,0 layout
  if (windowLayouts.value[id]?.minimized) updateWindowLayout(id, { minimized: false })
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
const restoredState = loadFontsFromStorage()
const restored = restoredState?.fonts ?? null
const restoredContainers = loadContainersFromStorage()
const needsBlankFont = !restored && (!restoredContainers || restoredContainers.length === 0)
export const fonts = signal<FontInstance[]>(restored ?? (needsBlankFont ? [createFont()] : []))
export const activeFontId = signal<string>(fonts.value.length > 0 ? fonts.value[0].id : '')

// Auto-save fonts to localStorage
setupFontAutoSave(() => fonts.value)


function isEmptyUntitled(f: FontInstance): boolean {
  if (f.dirty.value) return false
  if (f.fileName.value !== 'untitled.ch8') return false
  return f.fontData.value.every(b => b === 0)
}

export function addFont(font: FontInstance) {
  // If the only open font is an empty untitled, replace it
  const current = fonts.value
  if (current.length === 1 && isEmptyUntitled(current[0])) {
    dropWindowLayouts(k => isFontWindowKey(current[0].id, k))
    fonts.value = [font]
  } else {
    fonts.value = [...current, font]
  }
  activeFontId.value = font.id
  storedFocusedId.value = `grid-${font.id}`
}

/** Per-font values applied when opening, on top of the font's own options. */
export interface OpenFontSpec extends FontOptions {
  /** Glyph slots that were actually populated in the source file. */
  populated?: Set<number> | null
  /** Fill in only metrics still at their default (-1), using BDF properties. */
  useCalcMissing?: boolean
  /** Container this font was opened from, if any. */
  sourceContainerId?: string
  /** Vertical metrics the source recorded, which metric detection must not overwrite. */
  ascender?: number
  descender?: number
  /** Override whether blank glyph slots are hidden in the grid. */
  hideEmpty?: boolean
}

/**
 * Build a font, settle its metrics and open it.
 *
 * Every entry point used to repeat this by hand (create, set populated, maybe
 * set vertical metrics, recalc, add), and the steps had to stay in a particular
 * order. Keeping that order in one place means a new caller cannot get it wrong.
 */
export function openFont(
  data: Uint8Array | undefined,
  name: string,
  start: number,
  width: number,
  height: number,
  spec: OpenFontSpec = {},
): FontInstance {
  const {
    populated, useCalcMissing, sourceContainerId,
    ascender, descender, hideEmpty, ...fontOptions
  } = spec

  const font = createFont(data, name, start, width, height, fontOptions)
  if (populated) font.populatedGlyphs.value = populated
  if (sourceContainerId) font.sourceContainerId = sourceContainerId
  if (hideEmpty !== undefined) font.hideEmpty.value = hideEmpty

  if (useCalcMissing) calcMissingMetrics(font)
  else recalcMetrics(font)

  // Apply source-recorded vertical metrics *after* detection, so they always
  // win. Setting them first would silently lose them whenever the source also
  // asked for a full recalculation, which overwrites whatever is there.
  if (ascender !== undefined && ascender >= 0) font.ascender.value = ascender
  if (descender !== undefined && descender >= 0) font.descender.value = descender

  addFont(font)
  return font
}

export function openGlyphEditor(font: FontInstance) {
  font.editorOpen.value = true
  restoreWindow(font.trackerId.value)
  storedFocusedId.value = font.trackerId.value
  raiseWindow(font.trackerId.value)
}

let nextEditorId = 1

/** Keep new editor ids clear of the ones restored from storage or an import. */
function syncEditorCounter(fontList: FontInstance[]) {
  for (const f of fontList) {
    for (const id of [f.trackerId.value, ...f.pinnedEditors.value.map(e => e.id)]) {
      const n = /-(\d+)$/.exec(id.slice(`editor-${f.id}`.length))
      if (n) nextEditorId = Math.max(nextEditorId, parseInt(n[1]) + 1)
    }
  }
}
syncEditorCounter(fonts.value)

/**
 * Double-click on a glyph: the open tracking editor is left behind pinned to
 * `pinnedGlyph` (the glyph it was showing), and a fresh tracking editor opens
 * just offset from it. If no tracking editor was open there is nothing to pin,
 * so this does nothing beyond the ordinary single-click behaviour.
 */
export function openNewGlyphEditor(font: FontInstance, pinnedGlyph: number, trackerWasOpen: boolean) {
  if (!trackerWasOpen) {
    openGlyphEditor(font)
    return
  }
  const oldId = font.trackerId.value
  const newId = `editor-${font.id}-${nextEditorId++}`
  font.pinnedEditors.value = [...font.pinnedEditors.value, { id: oldId, glyph: pinnedGlyph }]
  const oldRect = windowLayouts.value[oldId]
  // Same geometry, nudged; the new window starts un-minimized whatever the old one was
  if (oldRect) updateWindowLayout(newId, { x: oldRect.x + 30, y: oldRect.y + 30, w: oldRect.w, h: oldRect.h })
  font.trackerId.value = newId
  openGlyphEditor(font)
}

// A double-click on a glyph tile opens a second editor. Its first click raises the
// tracking editor, which can sit right over the tile, so the second press may land on
// the editor instead. Remember the first click so the editor can complete the gesture.
interface GlyphClick { fontId: string; time: number; x: number; y: number; preGlyph: number; trackerWasOpen: boolean; done: boolean }
let lastGlyphClick: GlyphClick | null = null
const DOUBLE_CLICK_MS = 500
const DOUBLE_CLICK_SLOP = 5

/** First click of a possible double-click: what the tracking editor showed, and whether it was open. */
export function recordGlyphClick(font: FontInstance, x: number, y: number, preGlyph: number, trackerWasOpen: boolean) {
  lastGlyphClick = { fontId: font.id, time: Date.now(), x, y, preGlyph, trackerWasOpen, done: false }
}

/**
 * Second press of a double-click (on the tile, or on an editor that now covers it):
 * open the extra editor. False if there is no matching first click.
 */
export function completeGlyphDoubleClick(font: FontInstance, x: number, y: number): boolean {
  const c = lastGlyphClick
  if (!c || c.done || c.fontId !== font.id) return false
  if (Date.now() - c.time > DOUBLE_CLICK_MS) return false
  if (Math.hypot(x - c.x, y - c.y) > DOUBLE_CLICK_SLOP) return false
  c.done = true
  openNewGlyphEditor(font, c.preGlyph, c.trackerWasOpen)
  return true
}

export function closePinnedEditor(font: FontInstance, id: string) {
  font.pinnedEditors.value = font.pinnedEditors.value.filter(e => e.id !== id)
  dropWindowLayouts(k => k === id)
}

export function removeFont(id: string) {
  const remaining = fonts.value.filter(f => f.id !== id)
  fonts.value = remaining
  dropWindowLayouts(k => isFontWindowKey(id, k))
  if (activeFontId.value === id) {
    activeFontId.value = remaining.length > 0 ? remaining[0].id : ''
  }
}

export function removeAllFonts() {
  const ids = fonts.value.map(f => f.id)
  fonts.value = []
  dropWindowLayouts(k => ids.some(id => isFontWindowKey(id, k)))
  activeFontId.value = ''
}

export function removeAllFontsAndContainers() {
  removeAllFonts()
  containers.value = []
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
  /** Explicit charset key (e.g. 'zx'); overrides the cp<codepage> mapping. */
  charsetKey?: string
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
    dropWindowLayouts(k => childFontIds.some(fid => isFontWindowKey(fid, k)))
    if (childFontIds.includes(activeFontId.value)) {
      activeFontId.value = fonts.value.length > 0 ? fonts.value[0].id : ''
    }
  }
  containers.value = containers.value.filter(c => c.id !== id)
  dropWindowLayouts(k => k === `container-${id}`)
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
  dropWindowLayouts(k => k === id)
}

// Restore previews and layout from localStorage
const restoredLayout = loadLayoutFromStorage()
if (restoredLayout) {
  // Fonts were given fresh ids on restore; bring everything keyed by the old
  // ids (window layouts, focus, preview fonts) across, and drop what no longer exists
  const idMap = restoredState?.idMap ?? new Map<string, string>()
  const fallbackFontId = restored?.[0]?.id ?? ''
  const remapFontId = (id: string | undefined) => (id && idMap.get(id)) || fallbackFontId
  if (restoredLayout.windows) windowLayouts.value = remapWindowLayouts(restoredLayout.windows, idMap, restoredState?.editorKeys)
  if (restoredLayout.previews) {
    storedPreviews.value = restoredLayout.previews.map(p => ({
      ...p,
      fontId: remapFontId(p.fontId),
      selectedFontId: p.selectedFontId ? remapFontId(p.selectedFontId) : undefined,
    }))
  }
  if (restoredLayout.focusedId) storedFocusedId.value = remapWindowKey(restoredLayout.focusedId, idMap) ?? ''
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

// --- Project export/import ---

/** Serialize all current state (fonts, containers, layout) to a workspace JSON string. */
export function exportWorkspace(): string {
  return JSON.stringify(buildWorkspaceFile(
    fonts.value,
    containers.value,
    windowLayouts.value,
    previews.value,
    storedPreviews.value,
    storedFocusedId.value,
    // Each font carries its own codepage now; this is only for older builds
    defaultCharset.value,
  ), null, 2)
}

/**
 * Replace all state with a parsed workspace file. The autosave effects fire on
 * the signal writes, so localStorage ends up consistent with the import.
 */
/** Bumped on every workspace import so the UI can remount its windows. */
export const workspaceEpoch = signal(0)

export function importWorkspace(json: string): void {
  const file = parseWorkspaceFile(json)

  // The workspace codepage seeds fonts that don't record their own (files
  // exported before codepages were per font). It is not applied to fonts that
  // do, and never remaps glyphs  —  the stored data is already laid out for it.
  if (isCharset(file.charset)) {
    defaultCharset.value = file.charset
  }

  const newFonts = file.fonts.map(fontFromStored)
  const newContainers = file.containers.map(containerFromStored)

  // Remap preview font references to the fresh runtime ids (fall back to
  // the first font, matching the preview pane's own fallback behavior)
  const idMap = new Map<string, string>()
  file.fonts.forEach((s, i) => {
    if (s.id && newFonts[i]) idMap.set(s.id, newFonts[i].id)
  })
  const fallbackFontId = newFonts[0]?.id ?? ''
  const remapFontId = (id: string | undefined) =>
    (id && idMap.get(id)) || fallbackFontId

  // The stored fonts are already laid out for their codepage; restoreFonts
  // restores each one's own without remapping any glyph data.
  fonts.value = newFonts
  activeFontId.value = newFonts.length > 0 ? newFonts[0].id : ''
  containers.value = newContainers

  // Window layouts and the focused window are keyed by font id, so they
  // need the same old-id to new-id remapping as the previews
  windowLayouts.value = remapWindowLayouts(file.layout.windows ?? {}, idMap, savedEditorKeys(file.fonts))
  storedPreviews.value = (file.layout.previews ?? []).map(p => ({
    ...p,
    fontId: remapFontId(p.fontId),
    selectedFontId: p.selectedFontId ? remapFontId(p.selectedFontId) : undefined,
  }))
  storedFocusedId.value = remapWindowKey(file.layout.focusedId ?? '', idMap) ?? ''
  previews.value = storedPreviews.value.map(p => ({ id: p.id, fontId: p.fontId }))

  // Keep the runtime ID counters ahead of the restored ids so new
  // fonts/containers/previews never collide with imported ones
  syncEditorCounter(newFonts)
  workspaceEpoch.value++

  nextContainerId = 1 + newContainers.reduce((max, c) => {
    const n = parseInt(c.id.replace('container-', ''))
    return isNaN(n) ? max : Math.max(max, n)
  }, 0)
  nextPreviewId = 1 + storedPreviews.value.reduce((max, p) => {
    const n = parseInt(p.id.replace('preview-', ''))
    return isNaN(n) ? max : Math.max(max, n)
  }, 0)
}

// --- Charset (re-exported from charsets.ts) ---

export { type Charset, type CharsetDef, CHARSETS, defaultCharset, isCharset, sortedCharsets, charLabel, charCodeFromKey } from './charsets'

export function charsetGlyphFilter(font: FontInstance): ((index: number) => boolean) | null {
  const def = CHARSETS[font.charset.value]
  return charsetGlyphFilterImpl(font.startChar.value, def?.range)
}

/**
 * Change one font's codepage, remapping its glyphs by Unicode identity so a
 * character keeps its pixels (e.g. £ moves from ZX 0x60 to Amiga 0xA3).
 * Only this font is touched  —  other open fonts keep their own codepages.
 * Also remembers the choice as the default for fonts opened later.
 */
export function switchCharset(font: FontInstance, newCs: Charset) {
  const oldCs = font.charset.value
  if (newCs === oldCs) return

  remapFontForCharset(font, oldCs, newCs)
  font.charset.value = newCs
  defaultCharset.value = newCs
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
  let newCount = newEnd - newStart + 1
  let newData = new Uint8Array(newCount * bpg)
  let newGlyphMeta: (GlyphMeta | null)[] | null = oldGm ? new Array(newCount).fill(null) : null
  const newPop = new Set<number>()

  const reverse = buildUnicodeReverse(newCs)
  const filled = new Set<number>()

  function growToInclude(index: number) {
    if (index < newCount) return
    const nextCount = index + 1
    const grownData = new Uint8Array(nextCount * bpg)
    grownData.set(newData)
    newData = grownData
    if (newGlyphMeta) {
      const grownMeta: (GlyphMeta | null)[] = new Array(nextCount).fill(null)
      for (let i = 0; i < newGlyphMeta.length; i++) grownMeta[i] = newGlyphMeta[i]
      newGlyphMeta = grownMeta
    }
    newCount = nextCount
  }

  function copyGlyph(oldIdx: number, newIdx: number, hasData: boolean) {
    growToInclude(newIdx)
    const offset = oldIdx * bpg
    newData.set(oldData.subarray(offset, offset + bpg), newIdx * bpg)
    filled.add(newIdx)
    if (hasData) newPop.add(newIdx)
    if (newGlyphMeta && oldGm?.[oldIdx]) newGlyphMeta[newIdx] = oldGm[oldIdx]
  }

  // First pass: place glyphs that have a mapped position in the new charset
  // Second pass: place unmapped glyphs at their original codepoint if available
  interface PendingGlyph { oldIdx: number; oldCp: number; hasData: boolean }
  const unmapped: PendingGlyph[] = []

  for (let i = 0; i < oldCount; i++) {
    const offset = i * bpg
    let hasData = false
    for (let b = 0; b < bpg; b++) {
      if (oldData[offset + b]) { hasData = true; break }
    }
    if (!hasData && !oldGm?.[i] && (oldStart + i) !== 32) continue

    const oldCp = oldStart + i
    const unicode = cpToUnicode(oldCp, oldCs)
    const newCp = reverse.get(unicode)

    if (newCp !== undefined) {
      const newIdx = newCp - newStart
      if (newIdx >= 0 && newIdx < newCount && !filled.has(newIdx)) {
        copyGlyph(i, newIdx, hasData)
        continue
      }
    }

    unmapped.push({ oldIdx: i, oldCp, hasData })
  }

  // Place unmapped glyphs at their original codepoint position as fallback
  for (const { oldIdx, oldCp, hasData } of unmapped) {
    const fallbackIdx = oldCp - newStart
    if (fallbackIdx >= 0 && fallbackIdx < newCount && !filled.has(fallbackIdx)) {
      copyGlyph(oldIdx, fallbackIdx, hasData)
    } else if (hasData || oldGm?.[oldIdx]) {
      copyGlyph(oldIdx, newCount, hasData)
    }
  }

  font.startChar.value = newStart
  font.fontData.value = newData
  if (newGlyphMeta) font.glyphMeta.value = newGlyphMeta
  font.savedSnapshot.value = new Uint8Array(newData)
  font.populatedGlyphs.value = newPop

  // Remap selection: follow the active glyph's Unicode character
  const activeOldIdx = font.lastClickedGlyph.value
  const activeOldCp = oldStart + activeOldIdx
  const activeUnicode = cpToUnicode(activeOldCp, oldCs)
  const activeNewCp = reverse.get(activeUnicode) ?? activeOldCp
  const activeNewIdx = Math.max(0, activeNewCp - newStart)
  font.selectedGlyphs.value = new Set([activeNewIdx])
  font.lastClickedGlyph.value = activeNewIdx

  // Pinned glyph editors follow their glyph's character the same way
  if (font.pinnedEditors.value.length > 0) {
    font.pinnedEditors.value = font.pinnedEditors.value.map(ed => {
      const cp = reverse.get(cpToUnicode(oldStart + ed.glyph, oldCs)) ?? oldStart + ed.glyph
      return { ...ed, glyph: Math.max(0, cp - newStart) }
    })
  }
  // Rotation buffers are keyed by glyph index, which just changed
  font.glyphRotationLive.clear()
  font.undoHistory.clear()
}


// --- Per-font operations (re-exported from fontOps.ts) ---
// These are pure functions of a FontInstance; they live in their own module
// and are re-exported here so the many existing `from './store'` imports hold.
export {
  calcMissingMetrics, recalcMetrics, glyphCount, getPixel, glyphToText,
  glyphAdvance, setGlyphAdvance, setPixel, isDirty, markDirty, saveFont,
  resizeFont, fontToConversionData,
} from './fontOps'
