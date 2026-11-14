// The open-font model: FontInstance, its options, and createFont.
// Split out of store.ts so persistence.ts can build fonts without importing
// store.ts, which imports persistence.ts back (a module cycle that only worked
// by relying on hoisted function declarations).

import { signal, type Signal } from '@preact/signals'
import { bpr as calcBpr } from './bitUtils'
import { UndoHistory } from './undoStack'
import type { FontMeta, GlyphMeta } from './fileFormats/bdfParser'
import { type Charset, defaultCharset } from './charsets'

// --- Font Instance ---

export type SpacingMode = 'monospace' | 'proportional'

export interface PinnedEditor {
  /** Window id (also the key for the window's stored layout). */
  id: string
  glyph: number
}

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
  tracking: Signal<number>
  /** Whether the tracking glyph editor window (the one that follows lastClickedGlyph) is open. */
  editorOpen: Signal<boolean>
  /** Window id of the tracking glyph editor. Changes when a double-click spawns a new tracker. */
  trackerId: Signal<string>
  /** Extra glyph editor windows pinned to one glyph each. They stop following the selection. */
  pinnedEditors: Signal<PinnedEditor[]>
  savedSnapshot: Signal<Uint8Array>
  /** Bumped on each in-place pixel edit; lets the glyph editor re-render without copying fontData. */
  paintVersion: Signal<number>
  undoHistory: UndoHistory
  /**
   * Per-glyph un-clipped buffer from the most recent rotation, keyed by glyph index.
   * Lets repeat rotations operate on full data so e.g. four CW rotations restore the
   * original glyph even when intermediate rotations had to clip to fit. Cleared on
   * any other edit to that glyph or on font resize.
   */
  glyphRotationLive: Map<number, { data: Uint8Array; w: number; h: number }>
  /** If opened from a container pane, the container's id. */
  sourceContainerId?: string
  /** Original byte index for each glyph slot, if known. Sparse  —  only set for glyphs loaded from file. */
  charIndex?: Signal<(number | undefined)[]>
  /**
   * Codepage this font's byte positions map through. Per font, because two
   * open fonts can be different platforms (a ZX Spectrum dump next to a
   * CP437 DOS font) and each keeps its own mapping.
   */
  charset: Signal<Charset>
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

/** Everything about a font that isn't implied by its bitmap data and name. */
export interface FontOptions {
  meta?: FontMeta
  encodings?: number[]
  /** Baseline row, overriding the default of `height - 1`. */
  baseline?: number
  glyphMeta?: (GlyphMeta | null)[]
  spacing?: SpacingMode
  tracking?: number
  /** Codepage the font's byte positions map through; defaults to the remembered one. */
  charset?: Charset
}

export function createFont(
  data?: Uint8Array,
  name?: string,
  start?: number,
  width?: number,
  height?: number,
  options: FontOptions = {},
): FontInstance {
  const {
    meta, encodings, baseline: baselineOverride, glyphMeta,
    spacing: spacingMode = 'monospace', tracking = 0, charset: charsetKey,
  } = options
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
    tracking: signal(tracking),
    editorOpen: signal(false),
    trackerId: signal(`editor-${id}`),
    pinnedEditors: signal<PinnedEditor[]>([]),
    dirty: signal(false),
    savedSnapshot: signal(new Uint8Array(initial)),
    paintVersion: signal(0),
    charIndex: data != null
      ? signal<(number | undefined)[]>(Array.from({ length: numGlyphs }, (_, i) => (start ?? 32) + i))
      : signal<(number | undefined)[]>([]),
    charset: signal<Charset>(charsetKey ?? defaultCharset.value),
    glyphRotationLive: new Map(),
    undoHistory: new UndoHistory(),
  }
}

