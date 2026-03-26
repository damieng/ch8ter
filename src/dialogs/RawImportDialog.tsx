import { useState, useRef, useEffect } from 'preact/hooks'
import { createFont, addFont, recalcMetrics, charset } from '../store'
import { NumField } from '../components/NumField'
import { CharsetSelect } from '../components/CharsetSelect'
import { ZoomControl } from '../components/ZoomControl'
import { DialogOverlay } from '../components/DialogOverlay'
import { type Charset } from '../store'

interface Props {
  file: File
  onClose: () => void
}

interface RawSettings {
  headerSkip: number
  bytesPerRow: number
  glyphHeight: number
  lsbFirst: boolean
  bottomToTop: boolean
  invert: boolean
  startChar: number
}

function reverseBits(b: number): number {
  b = ((b & 0xF0) >> 4) | ((b & 0x0F) << 4)
  b = ((b & 0xCC) >> 2) | ((b & 0x33) << 2)
  b = ((b & 0xAA) >> 1) | ((b & 0x55) << 1)
  return b
}

function convertRawFont(
  raw: Uint8Array,
  settings: RawSettings,
): { fontData: Uint8Array; glyphCount: number } {
  const { headerSkip, bytesPerRow, glyphHeight, lsbFirst, bottomToTop, invert } = settings
  const bytesPerGlyph = bytesPerRow * glyphHeight
  const dataLen = raw.length - headerSkip
  if (dataLen <= 0 || bytesPerGlyph <= 0) return { fontData: new Uint8Array(0), glyphCount: 0 }
  const glyphCount = Math.floor(dataLen / bytesPerGlyph)
  const out = new Uint8Array(glyphCount * bytesPerGlyph)

  for (let g = 0; g < glyphCount; g++) {
    for (let row = 0; row < glyphHeight; row++) {
      const srcRow = bottomToTop ? (glyphHeight - 1 - row) : row
      for (let b = 0; b < bytesPerRow; b++) {
        let byte = raw[headerSkip + g * bytesPerGlyph + srcRow * bytesPerRow + b]
        if (lsbFirst) byte = reverseBits(byte)
        if (invert) byte ^= 0xFF
        out[g * bytesPerGlyph + row * bytesPerRow + b] = byte
      }
    }
  }

  return { fontData: out, glyphCount }
}

function drawPreview(
  canvas: HTMLCanvasElement,
  fontData: Uint8Array,
  glyphWidth: number,
  glyphHeight: number,
  glyphCount: number,
  bytesPerRow: number,
  zoom: number,
  availableWidth: number,
) {
  const cellW = (glyphWidth + 1) * zoom
  const cellH = (glyphHeight + 1) * zoom
  const cols = Math.max(1, Math.floor((availableWidth - zoom) / cellW))
  const rows = Math.ceil(glyphCount / cols)
  const cw = cols * cellW + zoom
  const ch = rows * cellH + zoom

  canvas.width = cw
  canvas.height = ch
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#f3f4f6'
  ctx.fillRect(0, 0, cw, ch)

  const bytesPerGlyph = bytesPerRow * glyphHeight

  for (let g = 0; g < glyphCount; g++) {
    const col = g % cols
    const row = Math.floor(g / cols)
    const ox = col * cellW + zoom
    const oy = row * cellH + zoom

    // Background
    ctx.fillStyle = '#fff'
    ctx.fillRect(ox, oy, glyphWidth * zoom, glyphHeight * zoom)

    // Pixels
    ctx.fillStyle = '#000'
    const glyphOffset = g * bytesPerGlyph
    for (let py = 0; py < glyphHeight; py++) {
      for (let px = 0; px < glyphWidth; px++) {
        const byteIdx = glyphOffset + py * bytesPerRow + (px >> 3)
        const bit = (fontData[byteIdx] & (0x80 >> (px & 7))) !== 0
        if (bit) {
          ctx.fillRect(ox + px * zoom, oy + py * zoom, zoom, zoom)
        }
      }
    }
  }
}

export function RawImportDialog({ file, onClose }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const [raw, setRaw] = useState<Uint8Array | null>(null)
  const [settings, setSettings] = useState<RawSettings>({
    headerSkip: 0,
    bytesPerRow: 1,
    glyphHeight: 8,
    lsbFirst: false,
    bottomToTop: false,
    invert: false,
    startChar: 32,
  })
  const [zoom, setZoom] = useState(2)
  const [codepage, setCodepage] = useState<Charset>('iso8859_1')

  useEffect(() => {
    file.arrayBuffer().then(buf => setRaw(new Uint8Array(buf)))
  }, [file])

  const glyphWidth = settings.bytesPerRow * 8
  const result = raw ? convertRawFont(raw, settings) : { fontData: new Uint8Array(0), glyphCount: 0 }

  // Draw preview
  useEffect(() => {
    const canvas = canvasRef.current
    const scroll = scrollRef.current
    if (!canvas || !scroll || result.glyphCount === 0) return
    const availableWidth = scroll.clientWidth
    drawPreview(canvas, result.fontData, glyphWidth, settings.glyphHeight, result.glyphCount, settings.bytesPerRow, zoom, availableWidth)
  }, [raw, settings, zoom, result.glyphCount])

  function handleImport() {
    if (result.glyphCount === 0) return
    const font = createFont(
      result.fontData,
      file.name,
      settings.startChar,
      glyphWidth,
      settings.glyphHeight,
    )
    recalcMetrics(font)
    addFont(font)
    charset.value = codepage
    onClose()
  }

  function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
    return (
      <label class="flex items-center gap-1 text-xs cursor-pointer select-none">
        <input type="checkbox" checked={value} onChange={e => onChange((e.target as HTMLInputElement).checked)} />
        <span class="text-gray-500">{label}</span>
      </label>
    )
  }

  return (
    <DialogOverlay onClose={onClose} label="Import RAW Binary">
      <div class="bg-white rounded-lg shadow-2xl border border-gray-300 p-4 flex flex-col gap-2 max-h-[90vh]" style={{ width: 900 }}>
        <div class="flex items-center gap-2">
          <h2 class="font-bold">Import RAW Binary</h2>
          <span class="text-xs text-gray-500">{file.name}{raw ? ` (${raw.length} bytes)` : ''}</span>
          <div class="ml-auto">
            <ZoomControl value={zoom} onChange={setZoom} />
          </div>
        </div>

        {/* Settings */}
        <div class="flex items-center gap-3 flex-wrap text-xs">
          <NumField label="Skip" value={settings.headerSkip} onChange={v => setSettings(s => ({ ...s, headerSkip: v }))} min={0} max={raw ? raw.length : 9999} />
          <NumField label="Width (bytes)" value={settings.bytesPerRow} onChange={v => setSettings(s => ({ ...s, bytesPerRow: v }))} min={1} max={8} />
          <NumField label="Height" value={settings.glyphHeight} onChange={v => setSettings(s => ({ ...s, glyphHeight: v }))} min={1} max={64} />
          <NumField label="Start char" value={settings.startChar} onChange={v => setSettings(s => ({ ...s, startChar: v }))} min={0} max={255} />
          <span class="w-px h-5 bg-gray-300" />
          <Toggle label="LSB first" value={settings.lsbFirst} onChange={v => setSettings(s => ({ ...s, lsbFirst: v }))} />
          <Toggle label="Bottom to top" value={settings.bottomToTop} onChange={v => setSettings(s => ({ ...s, bottomToTop: v }))} />
          <Toggle label="Invert" value={settings.invert} onChange={v => setSettings(s => ({ ...s, invert: v }))} />
          <span class="w-px h-5 bg-gray-300" />
          <CharsetSelect value={codepage} onChange={setCodepage} />
        </div>

        {/* Preview */}
        <div ref={scrollRef} class="overflow-auto border border-gray-200 rounded bg-gray-100 flex-1 min-h-0">
          {raw ? (
            result.glyphCount > 0 ? (
              <canvas
                ref={canvasRef}
                class="block"
                style={{ imageRendering: 'pixelated' }}
              />
            ) : (
              <div class="flex items-center justify-center h-32">
                <span class="text-gray-400">No glyphs (file too small or settings incorrect)</span>
              </div>
            )
          ) : (
            <div class="flex items-center justify-center h-32">
              <span class="text-gray-400">Loading...</span>
            </div>
          )}
        </div>

        <div class="flex items-center gap-2">
          <span class="text-xs text-gray-500">
            {result.glyphCount} glyphs &middot; {glyphWidth}&times;{settings.glyphHeight}px
            {raw && <> &middot; {raw.length - settings.headerSkip - result.glyphCount * settings.bytesPerRow * settings.glyphHeight} bytes unused</>}
          </span>
          <div class="ml-auto" />
          <button
            class="px-3 py-1 rounded border border-gray-300 text-gray-600 hover:bg-gray-100 text-sm"
            onClick={onClose}
          >Cancel</button>
          <button
            class="px-3 py-1 rounded bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-50 text-sm"
            onClick={handleImport}
            disabled={result.glyphCount === 0}
          >Import {result.glyphCount > 0 ? `${result.glyphCount} glyphs` : ''}</button>
        </div>
      </div>
    </DialogOverlay>
  )
}
