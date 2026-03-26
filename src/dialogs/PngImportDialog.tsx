import { useState, useRef, useEffect, useCallback } from 'preact/hooks'
import { autoDetect, calcGridSize, extractGlyphs, imageToData, type PngImportSettings } from '../fileFormats/pngImport'
import { createFont, addFont, recalcMetrics, charset } from '../store'
import { ZoomControl } from '../components/ZoomControl'
import { SizeField } from '../components/SizeField'
import { DialogOverlay } from '../components/DialogOverlay'
import { NumField } from '../components/NumField'
import { CharsetSelect } from '../components/CharsetSelect'
import { type Charset } from '../store'

interface Props {
  file: File
  onClose: () => void
}

export function PngImportDialog({ file, onClose }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const [img, setImg] = useState<HTMLImageElement | null>(null)
  const [imgData, setImgData] = useState<ImageData | null>(null)
  const [settings, setSettings] = useState<PngImportSettings>({
    scale: 1, glyphWidth: 8, glyphHeight: 8, gapX: 0, gapY: 0, borderX: 0, borderY: 0,
  })
  const [detected, setDetected] = useState(false)
  const [zoom, setZoom] = useState(1)
  const [codepage, setCodepage] = useState<Charset>('iso8859_1')

  // Load image
  useEffect(() => {
    const url = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => {
      setImg(image)
      const data = imageToData(image)
      setImgData(data)
      const auto = autoDetect(data)
      setSettings({ ...auto, glyphWidth: 8, glyphHeight: 8 })
      setDetected(true)
      setZoom(4)
    }
    image.src = url
    return () => URL.revokeObjectURL(url)
  }, [file])

  const update = useCallback((patch: Partial<PngImportSettings>) => {
    setSettings(s => ({ ...s, ...patch }))
  }, [])

  const grid = img ? calcGridSize(img.naturalWidth, img.naturalHeight, settings) : { cols: 0, rows: 0, total: 0 }

  // Draw image + grid overlay
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !img) return

    const cw = Math.ceil(img.naturalWidth * zoom)
    const ch = Math.ceil(img.naturalHeight * zoom)
    canvas.width = cw
    canvas.height = ch

    const ctx = canvas.getContext('2d')!
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(img, 0, 0, cw, ch)

    const { scale, glyphWidth, glyphHeight, gapX, gapY, borderX, borderY } = settings
    const cellW = (glyphWidth + gapX) * scale * zoom
    const cellH = (glyphHeight + gapY) * scale * zoom
    const ox = borderX * scale * zoom
    const oy = borderY * scale * zoom
    const glyphW = glyphWidth * scale * zoom
    const glyphH = glyphHeight * scale * zoom

    if (gapX > 0 && grid.cols > 1) {
      ctx.fillStyle = 'rgba(255, 200, 0, 0.25)'
      for (let row = 0; row < grid.rows; row++) {
        for (let col = 0; col < grid.cols - 1; col++) {
          ctx.fillRect(ox + col * cellW + glyphW, oy + row * cellH, gapX * scale * zoom, glyphH)
        }
      }
    }
    if (gapY > 0 && grid.rows > 1) {
      ctx.fillStyle = 'rgba(255, 200, 0, 0.25)'
      for (let row = 0; row < grid.rows - 1; row++) {
        for (let col = 0; col < grid.cols; col++) {
          ctx.fillRect(ox + col * cellW, oy + row * cellH + glyphH, glyphW, gapY * scale * zoom)
        }
      }
    }

    // Pixel grid lines (grey)
    if (zoom >= 3) {
      ctx.strokeStyle = 'rgba(128, 128, 128, 0.3)'
      ctx.lineWidth = 1
      const pxW = scale * zoom
      const pxH = scale * zoom
      for (let row = 0; row < grid.rows; row++) {
        for (let col = 0; col < grid.cols; col++) {
          const gx = ox + col * cellW
          const gy = oy + row * cellH
          for (let px = 1; px < glyphWidth; px++) {
            const lx = Math.round(gx + px * pxW) + 0.5
            ctx.beginPath()
            ctx.moveTo(lx, gy)
            ctx.lineTo(lx, gy + glyphH)
            ctx.stroke()
          }
          for (let py = 1; py < glyphHeight; py++) {
            const ly = Math.round(gy + py * pxH) + 0.5
            ctx.beginPath()
            ctx.moveTo(gx, ly)
            ctx.lineTo(gx + glyphW, ly)
            ctx.stroke()
          }
        }
      }
    }

    // Glyph cell outlines (blue)
    ctx.strokeStyle = 'rgba(0, 120, 255, 0.6)'
    ctx.lineWidth = 1
    for (let row = 0; row < grid.rows; row++) {
      for (let col = 0; col < grid.cols; col++) {
        ctx.strokeRect(ox + col * cellW, oy + row * cellH, glyphW, glyphH)
      }
    }

    if (borderX > 0 || borderY > 0) {
      ctx.strokeStyle = 'rgba(255, 100, 0, 0.5)'
      ctx.lineWidth = 2
      ctx.strokeRect(ox, oy,
        grid.cols * cellW - gapX * scale * zoom,
        grid.rows * cellH - gapY * scale * zoom)
    }
  }, [img, settings, grid, zoom])

  function handleImport() {
    if (!imgData) return
    const result = extractGlyphs(imgData, settings)
    const font = createFont(result.fontData, file.name.replace(/\.png$/i, '.ch8'), result.startChar, result.glyphWidth, result.glyphHeight)
    font.populatedGlyphs.value = result.populated
    recalcMetrics(font)
    addFont(font)
    charset.value = codepage
    onClose()
  }

  return (
    <DialogOverlay onClose={onClose} label="Import PNG">
      <div class="bg-white rounded-lg shadow-2xl border border-gray-300 p-4 flex flex-col gap-2 max-h-[90vh]" style={{ width: 900 }}>
        <div class="flex items-center gap-2">
          <h2 class="font-bold">Import PNG</h2>
          <span class="text-xs text-gray-500">{file.name}{img ? ` (${img.naturalWidth}\u00d7${img.naturalHeight})` : ''}</span>
          <div class="ml-auto">
            <ZoomControl value={zoom} onChange={setZoom} />
          </div>
        </div>

        {/* Settings bar */}
        <div class="flex items-center gap-3 flex-wrap text-xs">
          <NumField label="Scale" value={settings.scale} onChange={v => update({ scale: v })} min={1} max={16} />
          <SizeField label="Glyph" w={settings.glyphWidth} h={settings.glyphHeight} onW={v => update({ glyphWidth: v })} onH={v => update({ glyphHeight: v })} min={1} max={64} />
          <CharsetSelect value={codepage} onChange={setCodepage} />
          <SizeField label="Gap" w={settings.gapX} h={settings.gapY} onW={v => update({ gapX: v })} onH={v => update({ gapY: v })} />
          <SizeField label="Border" w={settings.borderX} h={settings.borderY} onW={v => update({ borderX: v })} onH={v => update({ borderY: v })} />
        </div>

        {/* Canvas preview */}
        <div
          ref={scrollRef}
          class="overflow-auto border border-gray-200 rounded bg-gray-100 flex-1 min-h-0"
        >
          {img ? (
            <canvas
              ref={canvasRef}
              class="block"
              style={{ imageRendering: 'pixelated' }}
            />
          ) : (
            <div class="flex items-center justify-center h-full">
              <span class="text-gray-400">Loading...</span>
            </div>
          )}
        </div>

        <div class="flex items-center gap-2">
          <span class="text-xs text-gray-500">{grid.cols}&times;{grid.rows}</span>
          {detected && <span class="text-xs text-green-700">Auto-detected</span>}
          <div class="ml-auto" />
          <button
            class="px-3 py-1 rounded border border-gray-300 text-gray-600 hover:bg-gray-100 text-sm"
            onClick={onClose}
          >Cancel</button>
          <button
            class="px-3 py-1 rounded bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-50 text-sm"
            onClick={handleImport}
            disabled={!imgData || grid.total === 0}
          >Import {grid.total > 0 ? `${grid.total} glyphs` : ''}</button>
        </div>
      </div>
    </DialogOverlay>
  )
}
