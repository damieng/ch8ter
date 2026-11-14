// localStorage persistence for fonts, containers, window layout, and preview state.

import { effect } from '@preact/signals'
import type { FontMeta, GlyphMeta } from './fileFormats/bdfParser'
import type { FontInstance, SpacingMode, FontContainer, ContainerMeta } from './store'
import { createFont } from './store'
import { isCharset } from './charsets'
import { bpr } from './bitUtils'
import { calcAllMetrics, buildGlyphLookup } from './charMetrics'

// --- Types ---

export interface StoredFont {
  /** Runtime id (exported so previews can be remapped on import). */
  id?: string
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
  tracking?: number
  sourceContainerId?: string
  charIndex?: (number | undefined)[]
  /** Codepage key this font's byte positions map through. Absent in older saves. */
  charset?: string
  /** Whether the tracking glyph editor window was open. */
  editorOpen?: boolean
  /** Window id of the tracking editor (changes after a double-click spawns a new one). */
  trackerId?: string
  /** Extra glyph editors, each pinned to one glyph. */
  pinnedEditors?: { id: string; glyph: number }[]
}

export interface WindowRect {
  x: number
  y: number
  w: number
  h: number
  /** Collapsed to a desktop icon. x/y/w/h keep the restored window geometry. */
  minimized?: boolean
  /** Desktop position of the icon while minimized. */
  iconX?: number
  iconY?: number
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

/** Portable bundle of everything the app persists. */
export interface WorkspaceFile {
  app: 'ch8ter'
  version: 1
  exported: string
  fonts: StoredFont[]
  containers: StoredContainer[]
  layout: StoredLayout
  /** Active codepage key (e.g. 'cpm'). Absent in files exported before it was recorded. */
  charset?: string
}

// --- Storage keys ---

const STORAGE_KEY = 'ch8ter-fonts'
const LAYOUT_KEY = 'ch8ter-layout'
const CONTAINER_KEY = 'ch8ter-containers'

// --- Base64 helpers ---

function toBase64(data: Uint8Array): string {
  const chunks: string[] = []
  const CHUNK = 8192
  for (let i = 0; i < data.length; i += CHUNK) {
    chunks.push(String.fromCharCode(...data.subarray(i, Math.min(i + CHUNK, data.length))))
  }
  return btoa(chunks.join(''))
}

function fromBase64(b64: string): Uint8Array {
  let binary: string
  try {
    binary = atob(b64)
  } catch {
    throw new Error('Corrupted font data in localStorage (invalid base64)')
  }
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

// --- Font persistence ---

/** Rebuild a FontInstance from its stored form. */
export function fontFromStored(s: StoredFont): FontInstance {
  const data = fromBase64(s.fontData)
  const font = createFont(
    data,
    s.fileName,
    s.startChar,
    s.glyphWidth ?? 8,
    s.glyphHeight ?? 8,
    {
      meta: s.meta ?? undefined,
      encodings: s.encodings ?? undefined,
      baseline: s.baseline,
      glyphMeta: s.glyphMeta ?? undefined,
      spacing: s.spacing ?? 'monospace',
      tracking: s.tracking ?? 0,
      // Saved before codepages were per font: fall back to the remembered default
      charset: isCharset(s.charset) ? s.charset : undefined,
    },
  )
  if (s.fontName) font.fontName.value = s.fontName
  if (s.populatedGlyphs) font.populatedGlyphs.value = new Set(s.populatedGlyphs)
  if (s.hideEmpty != null) font.hideEmpty.value = s.hideEmpty
  if (s.sourceContainerId) font.sourceContainerId = s.sourceContainerId
  if (s.charIndex) font.charIndex!.value = s.charIndex
  // Glyph editor windows. Their ids embed the font's old id, so carry them over to its new one
  const editorPrefix = s.id ? `editor-${s.id}` : null
  const remapEditorId = (id: string) =>
    editorPrefix && id.startsWith(editorPrefix) ? `editor-${font.id}${id.slice(editorPrefix.length)}` : id
  if (s.editorOpen) font.editorOpen.value = true
  if (s.trackerId) font.trackerId.value = remapEditorId(s.trackerId)
  if (s.pinnedEditors) font.pinnedEditors.value = s.pinnedEditors.map(p => ({ id: remapEditorId(p.id), glyph: p.glyph }))
  font.savedSnapshot.value = new Uint8Array(data)
  font.dirty.value = false
  if (s.ascender != null) font.ascender.value = s.ascender
  if (s.capHeight != null) font.capHeight.value = s.capHeight
  if (s.xHeight != null) font.xHeight.value = s.xHeight
  if (s.numericHeight != null) font.numericHeight.value = s.numericHeight
  if (s.descender != null) font.descender.value = s.descender
  // Auto-calc metrics if not stored
  if (s.ascender == null) {
    const w = s.glyphWidth ?? 8
    const h = s.glyphHeight ?? 8
    const bpg = h * bpr(w)
    const count = bpg > 0 ? Math.floor(data.length / bpg) : 0
    const lookup = buildGlyphLookup(s.startChar, count, font.charset.value)
    const m = calcAllMetrics(data, s.startChar, w, h, lookup)
    font.ascender.value = m.ascender
    font.capHeight.value = m.capHeight
    font.xHeight.value = m.xHeight
    font.numericHeight.value = m.numericHeight
    font.descender.value = m.descender
  }
  return font
}

/**
 * Restore fonts from localStorage. Fonts get fresh runtime ids, so `idMap`
 * maps each font's previous id to its new one (for remapping layouts/previews).
 */
export function loadFontsFromStorage(): { fonts: FontInstance[]; idMap: Map<string, string>; editorKeys: Set<string> } | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const stored: StoredFont[] = JSON.parse(raw)
    if (!Array.isArray(stored) || stored.length === 0) return null
    const fonts = stored.map(fontFromStored)
    const idMap = new Map<string, string>()
    stored.forEach((s, i) => { if (s.id) idMap.set(s.id, fonts[i].id) })
    return { fonts, idMap, editorKeys: savedEditorKeys(stored) }
  } catch (e) {
    console.warn('Failed to restore fonts from localStorage:', e)
    return null
  }
}

/** Serialize font instances to their storable form. */
export function toStoredFonts(fontList: FontInstance[]): StoredFont[] {
  return fontList.map(f => ({
    id: f.id,
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
    tracking: f.tracking.value,
    sourceContainerId: f.sourceContainerId,
    charIndex: f.charIndex?.value,
    charset: f.charset.value,
    editorOpen: f.editorOpen.value,
    trackerId: f.trackerId.value,
    pinnedEditors: f.pinnedEditors.value.map(e => ({ id: e.id, glyph: e.glyph })),
  }))
}

export function saveFontsToStorage(fontList: FontInstance[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(toStoredFonts(fontList)))
}

// --- Layout persistence ---

export function loadLayoutFromStorage(): StoredLayout | null {
  try {
    const raw = localStorage.getItem(LAYOUT_KEY)
    if (!raw) return null
    return JSON.parse(raw)
  } catch (e) {
    console.warn('Failed to restore layout from localStorage:', e)
    return null
  }
}

export function saveLayoutToStorage(
  windows: Record<string, WindowRect>,
  previews: { id: string; fontId: string }[],
  storedPreviewSettings: StoredPreview[],
  focusedId: string,
) {
  localStorage.setItem(LAYOUT_KEY, JSON.stringify(toStoredLayout(windows, previews, storedPreviewSettings, focusedId)))
}

/** Serialize layout state to its storable form. */
export function toStoredLayout(
  windows: Record<string, WindowRect>,
  previews: { id: string; fontId: string }[],
  storedPreviewSettings: StoredPreview[],
  focusedId: string,
): StoredLayout {
  return {
    windows,
    previews: previews.map(p => {
      const stored = storedPreviewSettings.find(s => s.id === p.id)
      return { id: p.id, fontId: p.fontId, ...stored }
    }),
    focusedId,
  }
}

// --- Remapping layout keys after fonts get fresh runtime ids ---

const FONT_WINDOW_KEY = /^(grid|editor)-(font-\d+)(-.*)?$/

/**
 * Window layouts are keyed by runtime font ids ("grid-font-3"), but fonts are
 * given fresh ids whenever they are restored or imported. Rewrite the keys to
 * the new ids. Layouts of fonts that no longer exist are dropped, as are
 * layouts of extra glyph editors ("editor-font-3-2") unless they are listed in
 * `liveEditorKeys` (the editors saved with the fonts being restored), since
 * otherwise their layouts would only be applied to unrelated windows.
 * Keys that don't belong to a font (app pane, containers, previews) are kept.
 */
export function remapWindowLayouts(
  windows: Record<string, WindowRect>,
  idMap: Map<string, string>,
  liveEditorKeys?: Set<string>,
): Record<string, WindowRect> {
  const out: Record<string, WindowRect> = {}
  for (const [key, rect] of Object.entries(windows)) {
    const mapped = remapWindowKey(key, idMap, liveEditorKeys)
    if (mapped !== null) out[mapped] = rect
  }
  return out
}

/** Remap one window key (also used for the focused window id); null if it should be dropped. */
export function remapWindowKey(key: string, idMap: Map<string, string>, liveEditorKeys?: Set<string>): string | null {
  const m = FONT_WINDOW_KEY.exec(key)
  if (!m) return key
  const newId = idMap.get(m[2])
  if (!newId) return null
  if (m[3] && !liveEditorKeys?.has(key)) return null
  return `${m[1]}-${newId}${m[3] ?? ''}`
}

/** Old window ids of the tracking and extra glyph editors saved with these fonts. */
export function savedEditorKeys(stored: StoredFont[]): Set<string> {
  const keys = new Set<string>()
  for (const s of stored) {
    if (s.trackerId) keys.add(s.trackerId)
    for (const p of s.pinnedEditors ?? []) keys.add(p.id)
  }
  return keys
}

// --- Workspace export/import ---

/** Bundle all persisted state into a portable workspace file. */
export function buildWorkspaceFile(
  fontList: FontInstance[],
  containerList: FontContainer[],
  windows: Record<string, WindowRect>,
  previews: { id: string; fontId: string }[],
  storedPreviewSettings: StoredPreview[],
  focusedId: string,
  charset?: string,
): WorkspaceFile {
  return {
    app: 'ch8ter',
    version: 1,
    exported: new Date().toISOString(),
    fonts: toStoredFonts(fontList),
    containers: toStoredContainers(containerList),
    layout: toStoredLayout(windows, previews, storedPreviewSettings, focusedId),
    charset,
  }
}

/** Parse and validate a workspace file's JSON. */
export function parseWorkspaceFile(json: string): WorkspaceFile {
  const file = JSON.parse(json)
  if (!file || file.app !== 'ch8ter' || typeof file.version !== 'number') {
    throw new Error('Not a Ch8ter workspace file')
  }
  if (file.version > 1) {
    throw new Error(`Workspace file version ${file.version} is newer than this app supports`)
  }
  return {
    app: 'ch8ter',
    version: 1,
    exported: typeof file.exported === 'string' ? file.exported : '',
    fonts: Array.isArray(file.fonts) ? file.fonts : [],
    containers: Array.isArray(file.containers) ? file.containers : [],
    layout: file.layout && typeof file.layout === 'object' ? file.layout : { windows: {}, previews: [], focusedId: '' },
    charset: typeof file.charset === 'string' ? file.charset : undefined,
  }
}

// --- Auto-save effect for fonts ---

export function setupFontAutoSave(getFonts: () => FontInstance[]) {
  effect(() => {
    const allFonts = getFonts()
    for (const f of allFonts) {
      // Access all reactive values we want to track
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
      f.tracking.value
      f.populatedGlyphs.value
      f.charIndex?.value
      f.charset.value
      f.editorOpen.value
      f.trackerId.value
      f.pinnedEditors.value
    }
    saveFontsToStorage(allFonts)
  })
}

// --- Container persistence ---

export interface StoredContainerFont {
  label: string
  codepage: number
  deviceName: string
  deviceType: number
  startChar: number
  width: number
  height: number
  numChars: number
  fontData: string // base64
  baseline?: number
  meta?: FontMeta | null
  glyphMeta?: (GlyphMeta | null)[] | null
  populated?: number[] | null
  spacingMode?: SpacingMode
  /** Explicit codepage key (e.g. 'zx'), overriding the cp<codepage> guess. */
  charsetKey?: string
}

export interface StoredContainer {
  id: string
  fileName: string
  format: string
  meta: ContainerMeta | null
  fonts: StoredContainerFont[]
}

/** Rebuild a FontContainer from its stored form. */
export function containerFromStored(sc: StoredContainer): FontContainer {
  return {
    id: sc.id,
    fileName: sc.fileName,
    format: sc.format,
    meta: sc.meta ?? null,
    fonts: sc.fonts.map(sf => ({
      label: sf.label,
      codepage: sf.codepage,
      deviceName: sf.deviceName,
      deviceType: sf.deviceType ?? 1,
      startChar: sf.startChar ?? 0,
      width: sf.width,
      height: sf.height,
      numChars: sf.numChars,
      fontData: fromBase64(sf.fontData),
      baseline: sf.baseline,
      meta: sf.meta,
      glyphMeta: sf.glyphMeta,
      populated: sf.populated ? new Set(sf.populated) : null,
      spacingMode: sf.spacingMode,
      charsetKey: sf.charsetKey,
    })),
  }
}

export function loadContainersFromStorage(): FontContainer[] | null {
  try {
    const raw = localStorage.getItem(CONTAINER_KEY)
    if (!raw) return null
    const stored: StoredContainer[] = JSON.parse(raw)
    if (!Array.isArray(stored) || stored.length === 0) return null
    return stored.map(containerFromStored)
  } catch (e) {
    console.warn('Failed to restore containers from localStorage:', e)
    return null
  }
}

/** Serialize containers to their storable form. */
export function toStoredContainers(containerList: FontContainer[]): StoredContainer[] {
  return containerList.map(c => ({
    id: c.id,
    fileName: c.fileName,
    format: c.format,
    meta: c.meta,
    fonts: c.fonts.map(f => ({
      label: f.label,
      codepage: f.codepage,
      deviceName: f.deviceName,
      deviceType: f.deviceType,
      startChar: f.startChar,
      width: f.width,
      height: f.height,
      numChars: f.numChars,
      fontData: toBase64(f.fontData),
      baseline: f.baseline,
      meta: f.meta,
      glyphMeta: f.glyphMeta,
      populated: f.populated ? [...f.populated] : null,
      spacingMode: f.spacingMode,
      charsetKey: f.charsetKey,
    })),
  }))
}

function saveContainersToStorage(containerList: FontContainer[]) {
  localStorage.setItem(CONTAINER_KEY, JSON.stringify(toStoredContainers(containerList)))
}

export function setupContainerAutoSave(getContainers: () => FontContainer[]) {
  let timer: ReturnType<typeof setTimeout> | null = null
  effect(() => {
    const all = getContainers()
    // Access the array to subscribe to changes
    all.length
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => saveContainersToStorage(all), 300)
  })
}

// --- Auto-save effect for layout ---

export function setupLayoutAutoSave(
  getWindows: () => Record<string, WindowRect>,
  getPreviews: () => { id: string; fontId: string }[],
  getStoredPreviews: () => StoredPreview[],
  getFocusedId: () => string,
) {
  let timer: ReturnType<typeof setTimeout> | null = null
  effect(() => {
    const windows = getWindows()
    const previews = getPreviews()
    const storedPreviewSettings = getStoredPreviews()
    const focusedId = getFocusedId()
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => saveLayoutToStorage(windows, previews, storedPreviewSettings, focusedId), 300)
  })
}
