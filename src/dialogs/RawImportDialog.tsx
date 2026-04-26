import { type ComponentChildren } from 'preact'
import { useState, useRef, useEffect } from 'preact/hooks'
import { createFont, addFont, recalcMetrics, charset } from '../store'
import { CHARSETS } from '../charsets'
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
  glyphWidth: number
  glyphHeight: number
  numChars: number
  columnMajor: boolean
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

/** Convert entire file from byte 0 into glyphs. Skip/numChars are handled externally as a display window. */
function convertAllGlyphs(
  raw: Uint8Array,
  settings: RawSettings,
): { fontData: Uint8Array; outBytesPerRow: number; effectiveWidth: number; totalGlyphs: number; srcBytesPerGlyph: number } {
  const { glyphHeight, headerSkip, lsbFirst, bottomToTop, invert, columnMajor } = settings
  const empty = { fontData: new Uint8Array(0), outBytesPerRow: 0, effectiveWidth: 0, totalGlyphs: 0, srcBytesPerGlyph: 0 }
  if (raw.length <= 0 || glyphHeight <= 0) return empty
  const dataLen = Math.max(0, raw.length - headerSkip)
  if (dataLen <= 0) return empty

  if (!columnMajor) {
    const { bytesPerRow } = settings
    const bytesPerGlyph = bytesPerRow * glyphHeight
    if (bytesPerGlyph <= 0) return empty
    const totalGlyphs = Math.floor(dataLen / bytesPerGlyph)
    const out = new Uint8Array(totalGlyphs * bytesPerGlyph)

    for (let g = 0; g < totalGlyphs; g++) {
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

    return { fontData: out, outBytesPerRow: bytesPerRow, effectiveWidth: bytesPerRow * 8, totalGlyphs, srcBytesPerGlyph: bytesPerGlyph }
  }

  // Column-major: each byte is 8 vertical pixels, columns left-to-right
  const { glyphWidth } = settings
  if (glyphWidth <= 0) return empty
  const bytesPerCol = Math.ceil(glyphHeight / 8)
  const srcBytesPerGlyph = glyphWidth * bytesPerCol
  const outBpr = Math.ceil(glyphWidth / 8)
  const outBytesPerGlyph = outBpr * glyphHeight
  const totalGlyphs = Math.floor(dataLen / srcBytesPerGlyph)
  const out = new Uint8Array(totalGlyphs * outBytesPerGlyph)

  for (let g = 0; g < totalGlyphs; g++) {
    const srcBase = headerSkip + g * srcBytesPerGlyph
    const dstBase = g * outBytesPerGlyph
    for (let col = 0; col < glyphWidth; col++) {
      const srcCol = bottomToTop ? (glyphWidth - 1 - col) : col
      for (let byteIdx = 0; byteIdx < bytesPerCol; byteIdx++) {
        let byte = raw[srcBase + srcCol * bytesPerCol + byteIdx]
        if (lsbFirst) byte = reverseBits(byte)
        if (invert) byte ^= 0xFF
        for (let bit = 0; bit < 8; bit++) {
          const row = byteIdx * 8 + bit
          if (row >= glyphHeight) break
          if (byte & (0x80 >> bit)) {
            out[dstBase + row * outBpr + (col >> 3)] |= 0x80 >> (col & 7)
          }
        }
      }
    }
  }

  return { fontData: out, outBytesPerRow: outBpr, effectiveWidth: glyphWidth, totalGlyphs, srcBytesPerGlyph }
}

function drawPreview(
  canvas: HTMLCanvasElement,
  fontData: Uint8Array,
  glyphWidth: number,
  glyphHeight: number,
  totalGlyphs: number,
  activeStart: number,
  activeEnd: number,
  bytesPerRow: number,
  zoom: number,
  availableWidth: number,
) {
  const cellW = (glyphWidth + 1) * zoom
  const cellH = (glyphHeight + 1) * zoom
  const cols = Math.max(1, Math.floor((availableWidth - zoom) / cellW))
  const rows = Math.ceil(totalGlyphs / cols)
  const cw = cols * cellW + zoom
  const ch = rows * cellH + zoom

  canvas.width = cw
  canvas.height = ch
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#f3f4f6'
  ctx.fillRect(0, 0, cw, ch)

  const bytesPerGlyph = bytesPerRow * glyphHeight

  for (let g = 0; g < totalGlyphs; g++) {
    const col = g % cols
    const row = Math.floor(g / cols)
    const ox = col * cellW + zoom
    const oy = row * cellH + zoom
    const active = g >= activeStart && g < activeEnd

    // Background
    ctx.fillStyle = active ? '#fff' : '#f3f4f6'
    ctx.fillRect(ox, oy, glyphWidth * zoom, glyphHeight * zoom)

    // Pixels
    ctx.fillStyle = active ? '#000' : '#c0c0c0'
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
    glyphWidth: 8,
    glyphHeight: 8,
    numChars: 96,
    columnMajor: false,
    lsbFirst: false,
    bottomToTop: false,
    invert: false,
    startChar: 32,
  })
  const [zoom, setZoom] = useState(2)
  const [showSkipSlider, setShowSkipSlider] = useState(false)
  const skipSliderDragging = useRef(false)
  const [codepage, setCodepage] = useState<Charset>('iso8859_1')

  function handleCodepageChange(cs: Charset) {
    setCodepage(cs)
    const range = CHARSETS[cs].range
    if (range) {
      setSettings(s => ({ ...s, startChar: range[0], numChars: range[1] - range[0] + 1 }))
    }
  }

  useEffect(() => {
    file.arrayBuffer().then(buf => setRaw(new Uint8Array(buf)))
  }, [file])

  const result = raw ? convertAllGlyphs(raw, settings) : { fontData: new Uint8Array(0), outBytesPerRow: 0, effectiveWidth: 0, totalGlyphs: 0, srcBytesPerGlyph: 0 }
  const glyphWidth = result.effectiveWidth || (settings.columnMajor ? settings.glyphWidth : settings.bytesPerRow * 8)
  const bytesPerRow = result.outBytesPerRow || Math.ceil(glyphWidth / 8)
  const outBytesPerGlyph = bytesPerRow * settings.glyphHeight

  // Active window: numChars determines how many leading glyphs are imported (the rest are faded)
  const activeCount = settings.numChars > 0 ? Math.min(settings.numChars, result.totalGlyphs) : result.totalGlyphs
  const availableAfterSkip = result.totalGlyphs
  const activeStart = 0
  const activeEnd = activeCount
  const maxSkip = raw ? raw.length - 1 : 0

  // Draw preview
  useEffect(() => {
    const canvas = canvasRef.current
    const scroll = scrollRef.current
    if (!canvas || !scroll || result.totalGlyphs === 0) return
    const availableWidth = scroll.clientWidth
    drawPreview(canvas, result.fontData, glyphWidth, settings.glyphHeight, result.totalGlyphs, activeStart, activeEnd, bytesPerRow, zoom, availableWidth)
  }, [raw, settings, zoom, result.totalGlyphs, activeStart, activeEnd])

  function handleImport() {
    if (activeCount === 0) return
    const activeData = result.fontData.slice(activeStart * outBytesPerGlyph, activeEnd * outBytesPerGlyph)
    const font = createFont(
      activeData,
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

  function ToggleBtn({ title, active, onChange, children }: { title: string; active: boolean; onChange: (v: boolean) => void; children: ComponentChildren }) {
    return (
      <button
        type="button"
        title={title}
        class={`p-1 rounded border flex items-center justify-center ${active ? 'bg-blue-500 text-white border-blue-600' : 'bg-white text-gray-400 border-gray-300 hover:bg-gray-50'}`}
        onClick={() => onChange(!active)}
      >
        {children}
      </button>
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
          <div class="relative flex items-center gap-1">
            <NumField label="Skip" value={settings.headerSkip} onChange={v => setSettings(s => ({ ...s, headerSkip: v }))} min={0} max={maxSkip} />
            <button
              type="button"
              title="Scrub skip offset"
              class="p-0.5 rounded border border-gray-300 text-gray-400 hover:bg-gray-50 flex items-center justify-center"
              onClick={() => setShowSkipSlider(v => !v)}
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
                <line x1="2" y1="12" x2="14" y2="12" />
                <line x1="4" y1="8" x2="4" y2="12" />
                <line x1="8" y1="4" x2="8" y2="12" />
                <line x1="12" y1="6" x2="12" y2="12" />
              </svg>
            </button>
            {showSkipSlider && (
              <div
                class="absolute top-full left-0 mt-1 z-50 bg-white border border-gray-300 rounded shadow-lg px-3 py-4"
                style={{ width: 300 }}
              >
                <input
                  type="range"
                  class="w-full accent-blue-500"
                  min={0}
                  max={maxSkip}
                  value={settings.headerSkip}
                  onPointerDown={() => { skipSliderDragging.current = true }}
                  onInput={e => {
                    const v = parseInt((e.target as HTMLInputElement).value)
                    if (!isNaN(v)) setSettings(s => ({ ...s, headerSkip: v }))
                  }}
                  onPointerUp={() => {
                    if (skipSliderDragging.current) {
                      skipSliderDragging.current = false
                      setShowSkipSlider(false)
                    }
                  }}
                />
              </div>
            )}
          </div>
          {settings.columnMajor
            ? <NumField label="Width" value={settings.glyphWidth} onChange={v => setSettings(s => ({ ...s, glyphWidth: v }))} min={1} max={64} />
            : <NumField label="Width" value={settings.bytesPerRow} onChange={v => setSettings(s => ({ ...s, bytesPerRow: v }))} min={1} max={8} />
          }
          <NumField label="Height" value={settings.glyphHeight} onChange={v => setSettings(s => ({ ...s, glyphHeight: v }))} min={1} max={64} />
          <NumField label="Start char" value={settings.startChar} onChange={v => setSettings(s => ({ ...s, startChar: v }))} min={0} max={255} />
          <NumField label="Chars" value={settings.numChars} onChange={v => setSettings(s => ({ ...s, numChars: v }))} min={0} max={availableAfterSkip || 9999} />
          <span class="w-px h-5 bg-gray-300" />
          <div class="flex items-center gap-1">
            <ToggleBtn title="Invert pixels" active={settings.invert} onChange={v => setSettings(s => ({ ...s, invert: v }))}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
                <circle cx="8" cy="8" r="6" />
                <path d="M8 2a6 6 0 0 1 0 12z" fill="currentColor" />
              </svg>
            </ToggleBtn>
            <button
              type="button"
              title={settings.lsbFirst ? "LSB first (click for MSB)" : "MSB first (click for LSB)"}
              class="px-1 rounded border text-[10px] font-bold flex items-center justify-center bg-white border-gray-300 text-gray-500 hover:bg-gray-50"
              style={{ height: 26 }}
              onClick={() => setSettings(s => ({ ...s, lsbFirst: !s.lsbFirst }))}
            >{settings.lsbFirst ? 'LSB' : 'MSB'}</button>
            <button
              type="button"
              title={settings.columnMajor ? "Column-major / vertical (click for horizontal)" : "Row-major / horizontal (click for vertical)"}
              class="px-1 rounded border text-[10px] font-bold flex items-center justify-center bg-white border-gray-300 text-gray-500 hover:bg-gray-50"
              style={{ height: 26 }}
              onClick={() => setSettings(s => ({ ...s, columnMajor: !s.columnMajor }))}
            >{settings.columnMajor ? 'VERT' : 'HORZ'}</button>
            <button
              type="button"
              title={settings.columnMajor
                ? (settings.bottomToTop ? "Right to left (click for left to right)" : "Left to right (click for right to left)")
                : (settings.bottomToTop ? "Bottom to top (click for top to bottom)" : "Top to bottom (click for bottom to top)")}
              class="px-1 rounded border text-[10px] font-bold flex items-center justify-center bg-white border-gray-300 text-gray-500 hover:bg-gray-50"
              style={{ height: 26 }}
              onClick={() => setSettings(s => ({ ...s, bottomToTop: !s.bottomToTop }))}
            >{settings.columnMajor ? (settings.bottomToTop ? 'RTL' : 'LTR') : (settings.bottomToTop ? 'BTT' : 'TTB')}</button>
          </div>
          <span class="w-px h-5 bg-gray-300" />
          <CharsetSelect value={codepage} onChange={handleCodepageChange} />
        </div>

        {/* Preview */}
        <div ref={scrollRef} class="overflow-auto border border-gray-200 rounded bg-gray-100 flex-1 min-h-0">
          {raw ? (
            result.totalGlyphs > 0 ? (
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
            {activeCount} of {result.totalGlyphs} glyphs &middot; {glyphWidth}&times;{settings.glyphHeight}px
            {raw && result.srcBytesPerGlyph > 0 && <> &middot; {raw.length - result.totalGlyphs * result.srcBytesPerGlyph} bytes unused</>}
          </span>
          <div class="ml-auto" />
          <button
            class="px-3 py-1 rounded border border-gray-300 text-gray-600 hover:bg-gray-100 text-sm"
            onClick={onClose}
          >Cancel</button>
          <button
            class="px-3 py-1 rounded bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-50 text-sm"
            onClick={handleImport}
            disabled={activeCount === 0}
          >Import {activeCount > 0 ? `${activeCount} glyphs` : ''}</button>
        </div>
      </div>
    </DialogOverlay>
  )
}
