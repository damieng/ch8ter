import { useState, useRef, useEffect, useCallback } from 'preact/hooks'
import { Download } from 'lucide-preact'
import { type FontInstance, bytesPerRow, glyphCount } from '../store'
import { ZoomControl } from '../components/ZoomControl'

interface Props {
  font: FontInstance
  onClose: () => void
}

function NumField({ label, value, onChange, min = 0, max = 999 }: {
  label: string
  value: number
  onChange: (v: number) => void
  min?: number
  max?: number
}) {
  return (
    <label class="flex items-center gap-1 text-xs">
      <span class="text-gray-500">{label}</span>
      <input
        type="number"
        class="w-12 px-1 py-0.5 border border-gray-300 rounded text-xs"
        value={value}
        min={min}
        max={max}
        onInput={(e) => {
          const v = parseInt((e.target as HTMLInputElement).value)
          if (!isNaN(v)) onChange(Math.max(min, Math.min(max, v)))
        }}
      />
    </label>
  )
}

function ColorField({ label, value, onChange }: {
  label: string
  value: string
  onChange: (v: string) => void
}) {
  return (
    <label class="flex items-center gap-1 text-xs">
      <span class="text-gray-500">{label}</span>
      <input
        type="color"
        class="w-6 h-5 border border-gray-300 rounded cursor-pointer p-0"
        value={value}
        onInput={(e) => onChange((e.target as HTMLInputElement).value)}
      />
    </label>
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
          <h2 class="font-bold">Export PNG Sprite Sheet</h2>
          <span class="text-xs text-gray-500">{font.fileName.value}</span>
          <div class="ml-auto">
            <ZoomControl value={zoom} onChange={setZoom} />
          </div>
        </div>

        {/* Row 1: Scale, colors, cols */}
        <div class="flex items-center gap-3 flex-wrap text-xs">
          <NumField label="Scale" value={settings.scale} onChange={v => update({ scale: v })} min={1} max={16} />
          <ColorField label="FG" value={settings.fg} onChange={v => update({ fg: v })} />
          <ColorField label="BG" value={settings.bg} onChange={v => update({ bg: v })} />
          <label class="flex items-center gap-1 text-xs">
            <input
              type="checkbox"
              checked={settings.bgTransparent}
              onChange={(e) => update({ bgTransparent: (e.target as HTMLInputElement).checked })}
            />
            <span class="text-gray-500">Transparent</span>
          </label>
          <span class="text-gray-300">|</span>
          <NumField label="Cols" value={settings.cols} onChange={v => update({ cols: v })} min={1} max={count} />
        </div>

        {/* Row 2: Gap and border */}
        <div class="flex items-center gap-3 flex-wrap text-xs">
          <span class="text-gray-500">Gap</span>
          <NumField label="X" value={settings.gapX} onChange={v => update({ gapX: v })} />
          <NumField label="Y" value={settings.gapY} onChange={v => update({ gapY: v })} />
          <ColorField label="" value={settings.divisionColor} onChange={v => update({ divisionColor: v })} />
          <span class="text-gray-300">|</span>
          <span class="text-gray-500">Border</span>
          <NumField label="X" value={settings.borderX} onChange={v => update({ borderX: v })} />
          <NumField label="Y" value={settings.borderY} onChange={v => update({ borderY: v })} />
          <ColorField label="" value={settings.borderColor} onChange={v => update({ borderColor: v })} />
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
          <button class="px-3 py-1 rounded border border-gray-300 hover:bg-gray-50 text-sm" onClick={onClose}>Cancel</button>
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
