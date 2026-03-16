import { useState, useRef, useEffect, useCallback } from 'preact/hooks'
import { Download } from 'lucide-preact'
import { type FontInstance, bytesPerRow, glyphCount } from '../store'
import { ZoomControl } from '../components/ZoomControl'
import { SizeField } from '../components/SizeField'
import { NumField } from '../components/NumField'
import { useClickOutside } from '../hooks/useClickOutside'

interface Props {
  font: FontInstance
  onClose: () => void
}

function checkerPattern(size: number): string {
  const c = document.createElement('canvas')
  c.width = size * 2; c.height = size * 2
  const ctx = c.getContext('2d')!
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, size * 2, size * 2)
  ctx.fillStyle = '#ccc'; ctx.fillRect(0, 0, size, size); ctx.fillRect(size, size, size, size)
  return `url(${c.toDataURL()})`
}

function FgBgControl({ fg, bg, bgTransparent, divisionColor, borderColor, onFg, onBg, onTransparent, onDivision, onBorder }: {
  fg: string; bg: string; bgTransparent: boolean; divisionColor: string; borderColor: string
  onFg: (v: string) => void; onBg: (v: string) => void; onTransparent: (v: boolean) => void
  onDivision: (v: string) => void; onBorder: (v: string) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useClickOutside(ref, () => setOpen(false))

  return (
    <div class="relative" ref={ref}>
      <button
        class="flex items-center gap-1.5 px-2 py-1 bg-white hover:bg-blue-50 rounded border border-gray-300 text-xs font-medium"
        onClick={() => setOpen(!open)}
        title="Foreground / Background colors"
      >
        <div class="relative" style={{ width: 20, height: 16 }}>
          {/* BG swatch (behind, offset right+down) */}
          <div
            class="absolute border border-gray-400 rounded-sm"
            style={{
              width: 14, height: 12, right: 0, bottom: 0,
              background: bgTransparent ? checkerPattern(3) : bg,
            }}
          />
          {/* FG swatch (front, offset left+up) */}
          <div
            class="absolute border border-gray-400 rounded-sm"
            style={{ width: 14, height: 12, left: 0, top: 0, background: fg }}
          />
        </div>
        Colors
      </button>
      {open && (
        <div class="absolute top-full left-0 mt-1 bg-white border border-gray-300 rounded shadow-lg z-50 p-3 flex flex-col gap-2 min-w-[180px]">
          <label class="flex items-center gap-2 text-xs">
            <input
              type="color"
              class="w-7 h-6 border border-gray-300 rounded cursor-pointer p-0"
              value={fg}
              onInput={(e) => onFg((e.target as HTMLInputElement).value)}
            />
            <span class="text-gray-600">Foreground</span>
          </label>
          <label class="flex items-center gap-2 text-xs">
            <input
              type="color"
              class="w-7 h-6 border border-gray-300 rounded cursor-pointer p-0"
              value={bg}
              disabled={bgTransparent}
              onInput={(e) => onBg((e.target as HTMLInputElement).value)}
              style={{ opacity: bgTransparent ? 0.3 : 1 }}
            />
            <span class="text-gray-600">Background</span>
          </label>
          <label class="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={bgTransparent}
              onChange={(e) => onTransparent((e.target as HTMLInputElement).checked)}
            />
            <span class="text-gray-600">Transparent background</span>
          </label>
          <div class="border-t border-gray-200 my-1" />
          <label class="flex items-center gap-2 text-xs">
            <input
              type="color"
              class="w-7 h-6 border border-gray-300 rounded cursor-pointer p-0"
              value={divisionColor}
              onInput={(e) => onDivision((e.target as HTMLInputElement).value)}
            />
            <span class="text-gray-600">Gap / divisions</span>
          </label>
          <label class="flex items-center gap-2 text-xs">
            <input
              type="color"
              class="w-7 h-6 border border-gray-300 rounded cursor-pointer p-0"
              value={borderColor}
              onInput={(e) => onBorder((e.target as HTMLInputElement).value)}
            />
            <span class="text-gray-600">Border</span>
          </label>
        </div>
      )}
    </div>
  )
}

interface ExportSettings {
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

function renderExport(
  font: FontInstance,
  settings: ExportSettings,
): { canvas: HTMLCanvasElement; cols: number; rows: number } {
  const data = font.fontData.value
  const gw = font.glyphWidth.value
  const gh = font.glyphHeight.value
  const bpr = bytesPerRow(font)
  const count = glyphCount(font)
  const { scale, gapX, gapY, borderX, borderY, fg, bg, bgTransparent, divisionColor, borderColor, cols: settingsCols } = settings

  const cols = Math.min(settingsCols, count)
  const rows = Math.ceil(count / cols)

  const cellW = gw * scale + gapX
  const cellH = gh * scale + gapY
  const imgW = borderX * 2 + cols * cellW - gapX
  const imgH = borderY * 2 + rows * cellH - gapY

  const canvas = document.createElement('canvas')
  canvas.width = imgW
  canvas.height = imgH
  const ctx = canvas.getContext('2d')!

  // Background
  if (!bgTransparent) {
    ctx.fillStyle = bg
    ctx.fillRect(0, 0, imgW, imgH)
  }

  // Border fill (if border > 0 and border color differs from bg)
  if ((borderX > 0 || borderY > 0) && borderColor !== bg) {
    ctx.fillStyle = borderColor
    if (borderY > 0) {
      ctx.fillRect(0, 0, imgW, borderY)
      ctx.fillRect(0, imgH - borderY, imgW, borderY)
    }
    if (borderX > 0) {
      ctx.fillRect(0, 0, borderX, imgH)
      ctx.fillRect(imgW - borderX, 0, borderX, imgH)
    }
  }

  // Gap/division fills
  if ((gapX > 0 || gapY > 0) && divisionColor !== bg) {
    ctx.fillStyle = divisionColor
    if (gapX > 0) {
      for (let col = 0; col < cols - 1; col++) {
        const x = borderX + (col + 1) * (gw * scale) + col * gapX
        ctx.fillRect(x, borderY, gapX, rows * cellH - gapY)
      }
    }
    if (gapY > 0) {
      for (let row = 0; row < rows - 1; row++) {
        const y = borderY + (row + 1) * (gh * scale) + row * gapY
        ctx.fillRect(borderX, y, cols * cellW - gapX, gapY)
      }
    }
  }

  // Draw glyphs
  ctx.fillStyle = fg
  const bpg = gh * bpr
  for (let g = 0; g < count; g++) {
    const col = g % cols
    const row = Math.floor(g / cols)
    const ox = borderX + col * cellW
    const oy = borderY + row * cellH
    const glyphBase = g * bpg

    for (let py = 0; py < gh; py++) {
      for (let px = 0; px < gw; px++) {
        if (data[glyphBase + py * bpr + (px >> 3)] & (0x80 >> (px & 7))) {
          ctx.fillRect(ox + px * scale, oy + py * scale, scale, scale)
        }
      }
    }
  }

  return { canvas, cols, rows }
}

const STORAGE_KEY = 'ch8ter-png-export'

function loadSettings(defaultCols: number): ExportSettings {
  const defaults: ExportSettings = {
    scale: 1, gapX: 1, gapY: 1, borderX: 1, borderY: 1,
    fg: '#000000', bg: '#ffffff', bgTransparent: false,
    divisionColor: '#b3d4fc', borderColor: '#cccccc', cols: defaultCols,
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const saved = JSON.parse(raw)
      return { ...defaults, ...saved, cols: saved.cols ?? defaultCols }
    }
  } catch { /* ignore */ }
  return defaults
}

function saveSettings(settings: ExportSettings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  } catch { /* ignore */ }
}

export function PngExportDialog({ font, onClose }: Props) {
  const previewRef = useRef<HTMLCanvasElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const [zoom, setZoom] = useState(2)
  const [settings, setSettings] = useState<ExportSettings>(() => loadSettings(32))

  const update = useCallback((patch: Partial<ExportSettings>) => {
    setSettings(s => {
      const next = { ...s, ...patch }
      saveSettings(next)
      return next
    })
  }, [])

  const count = glyphCount(font)
  const gw = font.glyphWidth.value
  const gh = font.glyphHeight.value

  // Render preview
  useEffect(() => {
    const preview = previewRef.current
    if (!preview) return

    const { canvas, cols, rows } = renderExport(font, settings)
    const cw = canvas.width * zoom
    const ch = canvas.height * zoom
    preview.width = cw
    preview.height = ch
    const ctx = preview.getContext('2d')!
    ctx.imageSmoothingEnabled = false

    // Checkerboard for transparent bg
    if (settings.bgTransparent) {
      const checkSize = 8
      for (let y = 0; y < ch; y += checkSize) {
        for (let x = 0; x < cw; x += checkSize) {
          ctx.fillStyle = ((x / checkSize + y / checkSize) & 1) ? '#e0e0e0' : '#ffffff'
          ctx.fillRect(x, y, checkSize, checkSize)
        }
      }
    }

    ctx.drawImage(canvas, 0, 0, cw, ch)

    // Grid overlay at high zoom
    if (zoom >= 3) {
      const cellW = (gw * settings.scale + settings.gapX) * zoom
      const cellH = (gh * settings.scale + settings.gapY) * zoom
      const ox = settings.borderX * zoom
      const oy = settings.borderY * zoom

      ctx.strokeStyle = 'rgba(0, 120, 255, 0.4)'
      ctx.lineWidth = 1
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          ctx.strokeRect(
            ox + col * cellW + 0.5,
            oy + row * cellH + 0.5,
            gw * settings.scale * zoom,
            gh * settings.scale * zoom,
          )
        }
      }
    }
  }, [font, font.fontData.value, settings, zoom])

  function handleDownload() {
    const { canvas } = renderExport(font, settings)
    canvas.toBlob((blob) => {
      if (!blob) return
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = font.fileName.value.replace(/\.[a-zA-Z0-9]+$/i, '') + '.png'
      a.click()
      URL.revokeObjectURL(url)
    })
  }

  const effectiveCols = Math.min(settings.cols, count)
  const effectiveRows = Math.ceil(count / effectiveCols)
  const imgW = settings.borderX * 2 + effectiveCols * (gw * settings.scale + settings.gapX) - settings.gapX
  const imgH = settings.borderY * 2 + effectiveRows * (gh * settings.scale + settings.gapY) - settings.gapY

  return (
    <div
      class="fixed inset-0 bg-black/40 flex items-center justify-center z-[200]"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div class="bg-white rounded-lg shadow-2xl border border-gray-300 p-4 flex flex-col gap-2 max-h-[90vh]" style={{ width: 900 }}>
        <div class="flex items-center gap-2">
          <h2 class="font-bold">Export PNG</h2>
          <span class="text-xs text-gray-500">{font.fileName.value}</span>
          <div class="ml-auto">
            <button
              class="text-gray-400 hover:text-red-500 leading-none text-lg font-bold"
              onClick={onClose}
              title="Close"
            >×</button>
          </div>
        </div>

        {/* Settings */}
        <div class="flex items-center gap-3 flex-wrap text-xs">
          <NumField label="Scale" value={settings.scale} onChange={v => update({ scale: v })} min={1} max={16} />
          <FgBgControl
            fg={settings.fg} bg={settings.bg} bgTransparent={settings.bgTransparent}
            divisionColor={settings.divisionColor} borderColor={settings.borderColor}
            onFg={v => update({ fg: v })} onBg={v => update({ bg: v })}
            onTransparent={v => update({ bgTransparent: v })}
            onDivision={v => update({ divisionColor: v })} onBorder={v => update({ borderColor: v })}
          />
          <NumField label="Cols" value={settings.cols} onChange={v => update({ cols: v })} min={1} max={count} />
          <SizeField label="Gap" w={settings.gapX} h={settings.gapY} onW={v => update({ gapX: v })} onH={v => update({ gapY: v })} />
          <SizeField label="Border" w={settings.borderX} h={settings.borderY} onW={v => update({ borderX: v })} onH={v => update({ borderY: v })} />
          <div class="ml-auto">
            <ZoomControl value={zoom} onChange={setZoom} />
          </div>
        </div>

        {/* Preview */}
        <div
          ref={scrollRef}
          class="overflow-auto border border-gray-200 rounded bg-gray-100 flex-1 min-h-0"
          style={{ minHeight: 200 }}
        >
          <canvas
            ref={previewRef}
            class="block"
            style={{ imageRendering: 'pixelated' }}
          />
        </div>

        <div class="flex items-center gap-2">
          <span class="text-xs text-gray-500">{effectiveCols}&times;{effectiveRows} grid, {imgW}&times;{imgH}px output, {count} glyphs</span>
          <div class="ml-auto" />
          <button
            class="flex items-center gap-1.5 px-3 py-1 rounded bg-blue-500 text-white hover:bg-blue-600 text-sm"
            onClick={handleDownload}
          >
            <Download size={14} /> Download PNG
          </button>
        </div>
      </div>
    </div>
  )
}
