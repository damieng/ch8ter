import { signal, type Signal, effect } from '@preact/signals'
import { UndoHistory } from './undoHistory'
import type { FontMeta, GlyphMeta } from './bdfParser'
import { calcAllMetrics, calcAscender, calcCapHeight, calcXHeight, calcNumericHeight, calcDescender } from './charMetrics'

// --- Font Instance ---

export interface FontInstance {
  id: string
  fontData: Signal<Uint8Array>
  glyphWidth: Signal<number>
  glyphHeight: Signal<number>
  startChar: Signal<number>
  fileName: Signal<string>
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
  dirty: Signal<boolean>
  savedSnapshot: Signal<Uint8Array>
  undoHistory: UndoHistory
}

export function bytesPerRow(font: FontInstance): number {
  return Math.ceil(font.glyphWidth.value / 8)
}

export function bytesPerGlyph(font: FontInstance): number {
  return font.glyphHeight.value * bytesPerRow(font)
}

let nextFontId = 1

export function createFont(data?: Uint8Array, name?: string, start?: number, width?: number, height?: number, meta?: FontMeta, encodings?: number[], baselineOverride?: number, glyphMeta?: (GlyphMeta | null)[]): FontInstance {
  const id = `font-${nextFontId++}`
  const w = width ?? 8
  const h = height ?? 8
  const bpr = Math.ceil(w / 8)
  const bpg = h * bpr
  const initial = data ?? new Uint8Array(96 * bpg)
  return {
    id,
    fontData: signal(initial),
    glyphWidth: signal(w),
    glyphHeight: signal(h),
    startChar: signal(start ?? 32),
    fileName: signal(name ?? 'untitled.ch8'),
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
      const font = createFont(data, s.fileName, s.startChar, s.glyphWidth ?? 8, s.glyphHeight ?? 8, s.meta ?? undefined, s.encodings ?? undefined, s.baseline, s.glyphMeta ?? undefined)
      if (s.populatedGlyphs) font.populatedGlyphs.value = new Set(s.populatedGlyphs)
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

interface CharsetDef {
  label: string
  overrides: Record<number, string>
  colorSystem?: string // matches name in COLOR_SYSTEMS for preview default
  range?: [number, number] // codepoint range [lo, hi] inclusive — filters glyph grid
}

const CHARSETS_DEF = {
  ascii: { label: 'ASCII', range: [32, 126] as [number, number], overrides: {} },
  zx: { label: 'ZX Spectrum', range: [32, 127] as [number, number], colorSystem: 'Sinclair ZX Spectrum', overrides: {
    0x5E: '\u2191', // ↑ (up arrow instead of caret)
    0x60: '\u00A3', // £ (pound instead of backtick)
    0x7F: '\u00A9', // © (copyright)
  }},
  bbc: { label: 'BBC Micro', range: [32, 127] as [number, number], colorSystem: 'Acorn BBC Micro', overrides: {
    0x60: '\u00A3', // £ (pound instead of backtick)
    0x7F: '\u00A9', // © (copyright)
  }},
  c64: { label: 'Commodore 64', range: [32, 127] as [number, number], colorSystem: 'Commodore 64', overrides: {
    0x5C: '\u00A3', // £ (pound instead of backslash)
    0x5E: '\u2191', // ↑ (up arrow, ASCII-1963)
    0x5F: '\u2190', // ← (left arrow instead of underscore)
    0x7F: '\u03C0', // π (pi)
  }},
  atari: { label: 'Atari 8-bit', range: [32, 127] as [number, number], colorSystem: 'Atari 8-bit', overrides: {
    // ATASCII: 0x7B-0x7F are control codes, not printable
    0x7B: '\u2666', // ♦ (spade-like in Atari set)
    0x7D: '\u2503', // clear screen (box drawing as placeholder)
    0x7E: '\u25C0', // delete char
    0x7F: '\u25B6', // tab
  }},
  cpc: { label: 'Amstrad CPC', range: [0, 255] as [number, number], colorSystem: 'Amstrad CPC', overrides: {
    // 0x00-0x1F: control code graphics
    0x00: '\u25FB', // ◻
    0x01: '\u23BE', // ⎾
    0x02: '\u23CA', // ⏊
    0x03: '\u23CC', // ⏌
    0x04: '\u26A1', // ⚡
    0x05: '\u22A0', // ⊠
    0x06: '\u2713', // ✓
    0x07: '\u237E', // ⍾
    0x08: '\u2190', // ←
    0x09: '\u2192', // →
    0x0A: '\u2193', // ↓
    0x0B: '\u2191', // ↑
    0x0C: '\u21A1', // ↡
    0x0D: '\u21B2', // ↲
    0x0E: '\u2297', // ⊗
    0x0F: '\u2299', // ⊙
    0x10: '\u229F', // ⊟
    0x11: '\u25F7', // ◷
    0x12: '\u25F6', // ◶
    0x13: '\u25F5', // ◵
    0x14: '\u25F4', // ◴
    0x15: '\u237B', // ⍻
    0x16: '\u238D', // ⎍
    0x17: '\u22A3', // ⊣
    0x18: '\u29D6', // ⧖
    0x19: '\u237F', // ⍿
    0x1A: '\u2426', // ␦
    0x1B: '\u2296', // ⊖
    0x1C: '\u25F0', // ◰
    0x1D: '\u25F1', // ◱
    0x1E: '\u25F2', // ◲
    0x1F: '\u25F3', // ◳
    // 0x27: right single quotation mark
    0x27: '\u2019', // '
    // 0x5E: up arrow
    0x5E: '\u2191', // ↑
    // 0x7F: DEL (not printable, but glyph exists)
    0x7F: '\u2421', // ␡
    // 0x80-0x8F: block elements (quadrants)
    0x80: '\u00A0', // NBSP
    0x81: '\u2598', // ▘
    0x82: '\u259D', // ▝
    0x83: '\u2580', // ▀
    0x84: '\u2596', // ▖
    0x85: '\u258C', // ▌
    0x86: '\u259E', // ▞
    0x87: '\u259B', // ▛
    0x88: '\u2597', // ▗
    0x89: '\u259A', // ▚
    0x8A: '\u2590', // ▐
    0x8B: '\u259C', // ▜
    0x8C: '\u2584', // ▄
    0x8D: '\u2599', // ▙
    0x8E: '\u259F', // ▟
    0x8F: '\u2588', // █
    // 0x90-0x9F: box drawing
    0x90: '\u00B7', // ·
    0x91: '\u2575', // ╵
    0x92: '\u2576', // ╶
    0x93: '\u2514', // └
    0x94: '\u2577', // ╷
    0x95: '\u2502', // │
    0x96: '\u250C', // ┌
    0x97: '\u251C', // ├
    0x98: '\u2574', // ╴
    0x99: '\u2518', // ┘
    0x9A: '\u2500', // ─
    0x9B: '\u2534', // ┴
    0x9C: '\u2510', // ┐
    0x9D: '\u2524', // ┤
    0x9E: '\u252C', // ┬
    0x9F: '\u253C', // ┼
    // 0xA0-0xAF: symbols
    0xA0: '\u005E', // ^
    0xA1: '\u00B4', // ´
    0xA2: '\u00A8', // ¨
    0xA3: '\u00A3', // £
    0xA4: '\u00A9', // ©
    0xA5: '\u00B6', // ¶
    0xA6: '\u00A7', // §
    0xA7: '\u2018', // '
    0xA8: '\u00BC', // ¼
    0xA9: '\u00BD', // ½
    0xAA: '\u00BE', // ¾
    0xAB: '\u00B1', // ±
    0xAC: '\u00F7', // ÷
    0xAD: '\u00AC', // ¬
    0xAE: '\u00BF', // ¿
    0xAF: '\u00A1', // ¡
    // 0xB0-0xBF: Greek
    0xB0: '\u03B1', // α
    0xB1: '\u03B2', // β
    0xB2: '\u03B3', // γ
    0xB3: '\u03B4', // δ
    0xB4: '\u03B5', // ε
    0xB5: '\u03B8', // θ
    0xB6: '\u03BB', // λ
    0xB7: '\u03BC', // μ
    0xB8: '\u03C0', // π
    0xB9: '\u03C3', // σ
    0xBA: '\u03C6', // φ
    0xBB: '\u03C8', // ψ
    0xBC: '\u03C7', // χ
    0xBD: '\u03C9', // ω
    0xBE: '\u03A3', // Σ
    0xBF: '\u03A9', // Ω
    // 0xC0-0xCF: diagonal box drawing & patterns
    0xC0: '\uD83E\uDEA0', // 🮠 U+1FBA0
    0xC1: '\uD83E\uDEA1', // 🮡 U+1FBA1
    0xC2: '\uD83E\uDEA3', // 🮣 U+1FBA3
    0xC3: '\uD83E\uDEA2', // 🮢 U+1FBA2
    0xC4: '\uD83E\uDEA7', // 🮧 U+1FBA7
    0xC5: '\uD83E\uDEA5', // 🮥 U+1FBA5
    0xC6: '\uD83E\uDEA6', // 🮦 U+1FBA6
    0xC7: '\uD83E\uDEA4', // 🮤 U+1FBA4
    0xC8: '\uD83E\uDEA8', // 🮨 U+1FBA8
    0xC9: '\uD83E\uDEA9', // 🮩 U+1FBA9
    0xCA: '\uD83E\uDEAE', // 🮮 U+1FBAE
    0xCB: '\u2573', // ╳
    0xCC: '\u2571', // ╱
    0xCD: '\u2572', // ╲
    0xCE: '\uD83E\uDE95', // 🮕 U+1FB95
    0xCF: '\u2592', // ▒
    // 0xD0-0xDF: blocks & triangles
    0xD0: '\u2594', // ▔
    0xD1: '\u2595', // ▕
    0xD2: '\u2581', // ▁
    0xD3: '\u258F', // ▏
    0xD4: '\u25E4', // ◤
    0xD5: '\u25E5', // ◥
    0xD6: '\u25E2', // ◢
    0xD7: '\u25E3', // ◣
    0xD8: '\uD83E\uDE8E', // 🮎 U+1FB8E
    0xD9: '\uD83E\uDE8D', // 🮍 U+1FB8D
    0xDA: '\uD83E\uDE8F', // 🮏 U+1FB8F
    0xDB: '\uD83E\uDE8C', // 🮌 U+1FB8C
    0xDC: '\uD83E\uDE9C', // 🮜 U+1FB9C
    0xDD: '\uD83E\uDE9D', // 🮝 U+1FB9D
    0xDE: '\uD83E\uDE9E', // 🮞 U+1FB9E
    0xDF: '\uD83E\uDE9F', // 🮟 U+1FB9F
    // 0xE0-0xEF: misc symbols
    0xE0: '\u263A', // ☺
    0xE1: '\u2639', // ☹
    0xE2: '\u2663', // ♣
    0xE3: '\u2666', // ♦
    0xE4: '\u2665', // ♥
    0xE5: '\u2660', // ♠
    0xE6: '\u25CB', // ○
    0xE7: '\u25CF', // ●
    0xE8: '\u25A1', // □
    0xE9: '\u25A0', // ■
    0xEA: '\u2642', // ♂
    0xEB: '\u2640', // ♀
    0xEC: '\u2669', // ♩
    0xED: '\u266A', // ♪
    0xEE: '\u263C', // ☼
    0xEF: '\uD807\uDC57', // 🚀 U+1CC57 (rocket)
    // 0xF0-0xFF: arrows, stick figures, misc
    0xF0: '\u2B61', // ⭡
    0xF1: '\u2B63', // ⭣
    0xF2: '\u2B60', // ⭠
    0xF3: '\u2B62', // ⭢
    0xF4: '\u25B2', // ▲
    0xF5: '\u25BC', // ▼
    0xF6: '\u25B6', // ▶
    0xF7: '\u25C0', // ◀
    0xF8: '\uD83E\uDFC6', // 🯆 U+1FBC6
    0xF9: '\uD83E\uDFC5', // 🯅 U+1FBC5
    0xFA: '\uD83E\uDFC7', // 🯇 U+1FBC7
    0xFB: '\uD83E\uDFC8', // 🯈 U+1FBC8
    0xFC: '\uD807\uDC63', // 💣 U+1CC63 (bomb)
    0xFD: '\uD807\uDC64', // ☁ U+1CC64 (mushroom cloud)
    0xFE: '\u2B65', // ⭥
    0xFF: '\u2B64', // ⭤
  }},
  cga: { label: 'IBM CGA', range: [32, 127] as [number, number], colorSystem: 'Custom', overrides: {
    0x7F: '\u2302', // ⌂ (house, CP437)
  }},
  msx: { label: 'MSX', range: [32, 127] as [number, number], colorSystem: 'MSX (TMS9918)', overrides: {
    0x7F: '\u25B6', // ► (triangle, MSX uses this position for a graphic)
  }},
  amiga: { label: 'Amiga (ISO-8859-1)', range: [32, 255] as [number, number], colorSystem: 'Custom', overrides: {
    0x7F: '\u2302', // ⌂
  }},
  sam: { label: 'SAM Coupe', range: [32, 127] as [number, number], colorSystem: 'SAM Coup\u00e9', overrides: {
    0x60: '\u00A3', // £ (pound, inherited from Spectrum)
    0x7F: '\u00A9', // © (copyright)
  }},
  cpm: { label: 'Amstrad CP/M Plus', range: [0, 255] as [number, number], colorSystem: 'Custom', overrides: {
    // 0x00-0x1F: Greek & math symbols
    0x00: '\u221E', 0x01: '\u2299', 0x02: '\u0393', 0x03: '\u0394',
    0x04: '\u2297', 0x05: '\u00D7', 0x06: '\u00F7', 0x07: '\u2234',
    0x08: '\u03A0', 0x09: '\u2193', 0x0A: '\u03A3', 0x0B: '\u2190',
    0x0C: '\u2192', 0x0D: '\u00B1', 0x0E: '\u2194', 0x0F: '\u03A9',
    0x10: '\u03B1', 0x11: '\u03B2', 0x12: '\u03B3', 0x13: '\u03B4',
    0x14: '\u03B5', 0x15: '\u03B8', 0x16: '\u03BB', 0x17: '\u03BC',
    0x18: '\u03C0', 0x19: '\u03C1', 0x1A: '\u03C3', 0x1B: '\u03C4',
    0x1C: '\u03C6', 0x1D: '\u03C7', 0x1E: '\u03C8', 0x1F: '\u03C9',
    // 0x80-0x9F: line graphics (not specified in manual)
    // 0xA0-0xBF: currency, punctuation, symbols
    0xA0: '\u00AA', 0xA1: '\u00BA', 0xA2: '\u00B0', 0xA3: '\u00A3',
    0xA4: '\u00A9', 0xA5: '\u00B6', 0xA6: '\u00A7', 0xA7: '\u2020',
    0xA8: '\u00BC', 0xA9: '\u00BD', 0xAA: '\u00BE', 0xAB: '\u00AB',
    0xAC: '\u00BB', 0xAD: '\u20A7', 0xAE: '\u00BF', 0xAF: '\u00A1',
    0xB0: '\u0192', 0xB1: '\u00A2', 0xB2: '\u00A8', 0xB3: '\u00B4',
    0xB4: '\u02C6', 0xB5: '\u2030', 0xB6: '\u215B', 0xB7: '\u215C',
    0xB8: '\u215D', 0xB9: '\u215E', 0xBA: '\u00DF', 0xBB: '\u25CB',
    0xBC: '\u2022', 0xBD: '\u00A5', 0xBE: '\u00AE', 0xBF: '\u2122',
    // 0xC0-0xDB: accented uppercase
    0xC0: '\u00C1', 0xC1: '\u00C9', 0xC2: '\u00CD', 0xC3: '\u00D3', 0xC4: '\u00DA',
    0xC5: '\u00C2', 0xC6: '\u00CA', 0xC7: '\u00CE', 0xC8: '\u00D4', 0xC9: '\u00DB',
    0xCA: '\u00C0', 0xCB: '\u00C8', 0xCC: '\u00CC', 0xCD: '\u00D2', 0xCE: '\u00D9',
    0xCF: '\u0178', // Y umlaut
    0xD0: '\u00C4', 0xD1: '\u00CB', 0xD2: '\u00CF', 0xD3: '\u00D6', 0xD4: '\u00DC',
    0xD5: '\u00C7', 0xD6: '\u00C6', 0xD7: '\u00C5', 0xD8: '\u00D8',
    0xD9: '\u00D1', 0xDA: '\u00C3', 0xDB: '\u00D5',
    // 0xDC-0xDF: math comparison
    0xDC: '\u2265', 0xDD: '\u2264', 0xDE: '\u2260', 0xDF: '\u2245',
    // 0xE0-0xFB: accented lowercase
    0xE0: '\u00E1', 0xE1: '\u00E9', 0xE2: '\u00ED', 0xE3: '\u00F3', 0xE4: '\u00FA',
    0xE5: '\u00E2', 0xE6: '\u00EA', 0xE7: '\u00EE', 0xE8: '\u00F4', 0xE9: '\u00FB',
    0xEA: '\u00E0', 0xEB: '\u00E8', 0xEC: '\u00EC', 0xED: '\u00F2', 0xEE: '\u00F9',
    0xEF: '\u00FF', // y umlaut
    0xF0: '\u00E4', 0xF1: '\u00EB', 0xF2: '\u00EF', 0xF3: '\u00F6', 0xF4: '\u00FC',
    0xF5: '\u00E7', 0xF6: '\u00E6', 0xF7: '\u00E5', 0xF8: '\u00F8',
    0xF9: '\u00F1', 0xFA: '\u00E3', 0xFB: '\u00F5',
    // 0xFC-0xFF: double-shaft arrows & equivalence
    0xFC: '\u21D2', 0xFD: '\u21D0', 0xFE: '\u21D4', 0xFF: '\u2261',
  }},
  imported: { label: 'Imported', overrides: {} },
}

export type Charset = keyof typeof CHARSETS_DEF
export const CHARSETS: Record<Charset, CharsetDef> = CHARSETS_DEF
export const charset = signal<Charset>('zx')

function hexLabel(charCode: number): string {
  return '0x' + charCode.toString(16).toUpperCase().padStart(2, '0')
}

export function charLabel(charCode: number, font?: FontInstance): string {
  if (charset.value === 'imported' && font) {
    const enc = font.encodings.value
    if (enc) {
      const idx = charCode - font.startChar.value
      const cp = idx >= 0 && idx < enc.length ? enc[idx] : -1
      if (cp > 32 && cp !== 0x7F) {
        try { return String.fromCodePoint(cp) } catch { /* invalid codepoint */ }
      }
      return hexLabel(charCode)
    }
  }
  const overrides = CHARSETS[charset.value]?.overrides
  if (overrides && overrides[charCode]) {
    return overrides[charCode]
  }
  if (charCode >= 33 && charCode <= 126) return String.fromCharCode(charCode)
  // ISO-8859-1 printable range (for Amiga and similar charsets)
  if (charCode >= 160 && charCode <= 255) return String.fromCharCode(charCode)
  return hexLabel(charCode)
}

// Reverse lookup: given a typed character, find its char code in the font.
export function charCodeFromKey(ch: string): number | null {
  if (ch.length !== 1) return null
  const overrides = CHARSETS[charset.value]?.overrides
  if (overrides) {
    for (const [code, label] of Object.entries(overrides)) {
      if (label === ch) return parseInt(code)
    }
  }
  const code = ch.charCodeAt(0)
  if (code >= 32 && code <= 126) return code
  return null
}

// Returns a filter predicate for which glyph indices to show, or null for "show all"
export function charsetGlyphFilter(font: FontInstance): ((index: number) => boolean) | null {
  const cs = charset.value
  if (cs === 'imported') {
    const pop = font.populatedGlyphs.value
    if (pop) return (i: number) => pop.has(i)
    return null
  }
  const def = CHARSETS[cs]
  if (def?.range) {
    const start = font.startChar.value
    const lo = def.range[0] - start
    const hi = def.range[1] - start
    return (i: number) => i >= lo && i <= hi
  }
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
  const bpg = bytesPerGlyph(font)
  return bpg > 0 ? Math.floor(font.fontData.value.length / bpg) : 0
}

export function getPixel(font: FontInstance, glyphIndex: number, x: number, y: number): boolean {
  const bpr = bytesPerRow(font)
  const bpg = bytesPerGlyph(font)
  const offset = glyphIndex * bpg + y * bpr + Math.floor(x / 8)
  return (font.fontData.value[offset] & (0x80 >> (x % 8))) !== 0
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
      const byteIdx = base + y * bpr + Math.floor(x / 8)
      row += (data[byteIdx] & (0x80 >> (x % 8))) ? '*' : ' '
    }
    rows.push(row)
  }
  return rows.join('\r\n')
}

export function setPixel(font: FontInstance, glyphIndex: number, x: number, y: number, on: boolean) {
  const bpr = bytesPerRow(font)
  const bpg = bytesPerGlyph(font)
  const data = new Uint8Array(font.fontData.value)
  const offset = glyphIndex * bpg + y * bpr + Math.floor(x / 8)
  const bit = 0x80 >> (x % 8)
  if (on) {
    data[offset] |= bit
  } else {
    data[offset] &= ~bit
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

function getBit(bytes: Uint8Array, bpr: number, x: number, y: number): boolean {
  return (bytes[y * bpr + Math.floor(x / 8)] & (0x80 >> (x % 8))) !== 0
}

function setBit(bytes: Uint8Array, bpr: number, x: number, y: number) {
  bytes[y * bpr + Math.floor(x / 8)] |= (0x80 >> (x % 8))
}

export function flipXBytes(bytes: Uint8Array, w: number, h: number): Uint8Array {
  const bpr = Math.ceil(w / 8)
  const out = new Uint8Array(h * bpr)
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (getBit(bytes, bpr, x, y)) setBit(out, bpr, w - 1 - x, y)
  return out
}

export function flipYBytes(bytes: Uint8Array, w: number, h: number): Uint8Array {
  const bpr = Math.ceil(w / 8)
  const out = new Uint8Array(h * bpr)
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (getBit(bytes, bpr, x, y)) setBit(out, bpr, x, h - 1 - y)
  return out
}

export function invertBytes(bytes: Uint8Array, w: number, h: number): Uint8Array {
  const bpr = Math.ceil(w / 8)
  const out = new Uint8Array(h * bpr)
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (!getBit(bytes, bpr, x, y)) setBit(out, bpr, x, y)
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
      if (getBit(bytes, bpr, x, y)) {
        const nx = h - 1 - y, ny = x
        if (nx < w && ny < h) setBit(out, bpr, nx, ny)
      }
  return out
}

export function rotateCCWBytes(bytes: Uint8Array, w: number, h: number): Uint8Array {
  const bpr = Math.ceil(w / 8)
  const out = new Uint8Array(h * bpr)
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (getBit(bytes, bpr, x, y)) {
        const nx = y, ny = w - 1 - x
        if (nx < w && ny < h) setBit(out, bpr, nx, ny)
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
      if (getBit(bytes, bpr, x, y)) setBit(out, bpr, (x - 1 + w) % w, y)
  return out
}

export function shiftRight(bytes: Uint8Array, w: number, h: number): Uint8Array {
  const bpr = Math.ceil(w / 8)
  const out = new Uint8Array(h * bpr)
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (getBit(bytes, bpr, x, y)) setBit(out, bpr, (x + 1) % w, y)
  return out
}

export function centerHorizontalBytes(bytes: Uint8Array, w: number, h: number): Uint8Array {
  const bpr = Math.ceil(w / 8)
  let leftBlank = 0
  for (let x = 0; x < w; x++) {
    let used = false
    for (let y = 0; y < h; y++) if (getBit(bytes, bpr, x, y)) { used = true; break }
    if (used) break
    leftBlank++
  }
  let rightBlank = 0
  for (let x = w - 1; x >= 0; x--) {
    let used = false
    for (let y = 0; y < h; y++) if (getBit(bytes, bpr, x, y)) { used = true; break }
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
      if (getBit(bytes, bpr, x, y)) {
        const nx = x - shift
        if (nx >= 0 && nx < w) setBit(out, bpr, nx, y)
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
      if (getBit(bytes, bpr, w - 1, y)) rightUsed = true
      if (getBit(bytes, bpr, 0, y)) leftFree = false
    }
    const glyphBold = new Uint8Array(bpg)
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        let srcX = x
        if (rightUsed && leftFree) srcX = x + 1
        const on = (srcX < w && getBit(bytes, bpr, srcX, y)) ||
                   (srcX > 0 && srcX - 1 < w && getBit(bytes, bpr, srcX - 1, y))
        if (on) setBit(glyphBold, bpr, x, y)
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
        const orig = getBit(bytes, bpr, x, y)
        if (orig) continue // outline = only border pixels
        // Check if any neighbour is set
        const hasNeighbour =
          (x > 0 && getBit(bytes, bpr, x - 1, y)) ||
          (x < w - 1 && getBit(bytes, bpr, x + 1, y)) ||
          (y > 0 && getBit(bytes, bpr, x, y - 1)) ||
          (y < h - 1 && getBit(bytes, bpr, x, y + 1))
        if (hasNeighbour) setBit(glyphOut, bpr, x, y)
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
    x >= 0 && x < w && y >= 0 && y < h && getBit(bytes, bpr, x, y)

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
    if (x >= 0 && x < w && y >= 0 && y < h) setBit(out, bpr, x, y)
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

// File I/O
export function loadFont(font: FontInstance, buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer)
  const bpg = bytesPerGlyph(font)
  const count = bpg > 0 ? Math.floor(bytes.length / bpg) : 0
  const data = bytes.slice(0, count * bpg)
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
        if (getBit(srcBytes, oldBpr, x, y)) {
          setBit(dstBytes, newBpr, nx, ny)
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
  const data = new Uint8Array(font.fontData.value)
  font.savedSnapshot.value = new Uint8Array(data)
  font.dirty.value = false
  return data
}
