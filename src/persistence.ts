// localStorage persistence for fonts, window layout, and preview state.

import { effect } from '@preact/signals'
import type { FontMeta, GlyphMeta } from './fileFormats/bdfParser'
import type { FontInstance, SpacingMode } from './store'
import { createFont } from './store'
import { bpr } from './bitUtils'
import { calcAllMetrics, type GlyphLookup } from './charMetrics'
import { buildUnicodeReverse, charset } from './charsets'

// --- Types ---

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

// --- Storage keys ---

const STORAGE_KEY = 'ch8ter-fonts'
const LAYOUT_KEY = 'ch8ter-layout'

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
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

// --- Glyph lookup for metrics ---

function buildGlyphLookup(startChar: number, count: number): GlyphLookup {
  const reverse = buildUnicodeReverse(charset.value)
  return (ch: string) => {
    const cp = reverse.get(ch)
    if (cp === undefined) return undefined
    const idx = cp - startChar
    return idx >= 0 && idx < count ? idx : undefined
  }
}

// --- Font persistence ---

export function loadFontsFromStorage(): FontInstance[] | null {
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
        const w = s.glyphWidth ?? 8
        const h = s.glyphHeight ?? 8
        const bpg = h * bpr(w)
        const count = bpg > 0 ? Math.floor(data.length / bpg) : 0
        const lookup = buildGlyphLookup(s.startChar, count)
        const m = calcAllMetrics(data, s.startChar, w, h, lookup)
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

export function saveFontsToStorage(fontList: FontInstance[]) {
  const stored: StoredFont[] = fontList.map(f => ({
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

// --- Layout persistence ---

export function loadLayoutFromStorage(): StoredLayout | null {
  try {
    const raw = localStorage.getItem(LAYOUT_KEY)
    if (!raw) return null
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export function saveLayoutToStorage(
  windows: Record<string, WindowRect>,
  previews: { id: string; fontId: string }[],
  storedPreviewSettings: StoredPreview[],
  focusedId: string,
) {
  const layout: StoredLayout = {
    windows,
    previews: previews.map(p => {
      const stored = storedPreviewSettings.find(s => s.id === p.id)
      return { id: p.id, fontId: p.fontId, ...stored }
    }),
    focusedId,
  }
  localStorage.setItem(LAYOUT_KEY, JSON.stringify(layout))
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
    }
    saveFontsToStorage(allFonts)
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
