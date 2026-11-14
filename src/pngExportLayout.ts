// Pure geometry and persistence for the PNG glyph-sheet exporter.
//
// Kept in its own module rather than inside PngExportDialog.tsx so it can be
// tested without rendering Preact or providing a canvas. The drawing itself
// still lives in the dialog; everything here is arithmetic and storage.

export interface ExportSettings {
  scale: number
  gapX: number
  gapY: number
  borderX: number
  borderY: number
  fg: string
  bg: string
  bgTransparent: boolean
  divisionColor: string
  borderColor: string
  cols: number
}

/** The subset of settings that affects page geometry. */
export type LayoutSettings = Pick<ExportSettings, 'scale' | 'gapX' | 'gapY' | 'borderX' | 'borderY' | 'cols'>

/** Page geometry for an export: how the glyphs are tiled into an image. */
export interface ExportLayout {
  cols: number
  rows: number
  /** Cell pitch, including the gap. */
  cellW: number
  cellH: number
  /** Finished image size in pixels. */
  imgW: number
  imgH: number
}

/**
 * Work out the page layout for a glyph-sheet export.
 *
 * The image is `border*2 + cols*cellW - gapX`, because the trailing gap after
 * the last column is not part of the image. A zero-glyph font produces an
 * empty image rather than a negative or NaN size.
 */
export function exportLayout(
  glyphCount: number,
  glyphWidth: number,
  glyphHeight: number,
  settings: LayoutSettings,
): ExportLayout {
  const { scale, gapX, gapY, borderX, borderY } = settings
  // Never ask for more columns than there are glyphs, and never fewer than one
  const cols = Math.max(1, Math.min(settings.cols, glyphCount))
  const rows = glyphCount > 0 ? Math.ceil(glyphCount / cols) : 0

  const cellW = glyphWidth * scale + gapX
  const cellH = glyphHeight * scale + gapY
  const imgW = Math.max(0, borderX * 2 + cols * cellW - gapX)
  const imgH = Math.max(0, borderY * 2 + rows * cellH - gapY)

  return { cols, rows, cellW, cellH, imgW, imgH }
}

/** Where the top-left corner of glyph `index` sits in the exported image. */
export function exportGlyphPosition(layout: ExportLayout, index: number, settings: LayoutSettings): { x: number; y: number } {
  const col = index % layout.cols
  const row = Math.floor(index / layout.cols)
  return {
    x: settings.borderX + col * layout.cellW,
    y: settings.borderY + row * layout.cellH,
  }
}

export const PNG_EXPORT_STORAGE_KEY = 'ch8ter-png-export'

/** Default export settings, with the page width defaulted to `defaultCols`. */
export function defaultExportSettings(defaultCols: number): ExportSettings {
  return {
    scale: 1, gapX: 1, gapY: 1, borderX: 1, borderY: 1,
    fg: '#000000', bg: '#ffffff', bgTransparent: false,
    divisionColor: '#b3d4fc', borderColor: '#cccccc', cols: defaultCols,
  }
}

/**
 * Load saved export settings, falling back to the defaults for anything
 * missing and ignoring unreadable storage entirely.
 */
export function loadExportSettings(defaultCols: number, storage?: Pick<Storage, 'getItem'>): ExportSettings {
  const defaults = defaultExportSettings(defaultCols)
  const store = storage ?? (typeof localStorage !== 'undefined' ? localStorage : undefined)
  if (!store) return defaults
  try {
    const raw = store.getItem(PNG_EXPORT_STORAGE_KEY)
    if (!raw) return defaults
    const saved = JSON.parse(raw)
    if (!saved || typeof saved !== 'object') return defaults
    return { ...defaults, ...saved, cols: saved.cols ?? defaultCols }
  } catch {
    return defaults
  }
}

export function saveExportSettings(
  settings: ExportSettings,
  storage?: Pick<Storage, 'setItem'>,
): void {
  const store = storage ?? (typeof localStorage !== 'undefined' ? localStorage : undefined)
  if (!store) return
  try {
    store.setItem(PNG_EXPORT_STORAGE_KEY, JSON.stringify(settings))
  } catch { /* ignore */ }
}
