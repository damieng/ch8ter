import { useRef, useEffect } from 'preact/hooks'
import { fontData, activeGlyph, getPixel, setPixel, startChar, editorZoom } from '../store'

const LINE = 1

export function GlyphEditor() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const painting = useRef<boolean | null>(null)

  const cell = editorZoom.value * 4
  const step = cell + LINE
  const size = LINE + 8 * step

  function draw() {
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')!
    const idx = activeGlyph.value

    ctx.fillStyle = '#94a3b8'
    ctx.fillRect(0, 0, size, size)

    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        const px = LINE + x * step
        const py = LINE + y * step
        ctx.fillStyle = getPixel(idx, x, y) ? '#1e293b' : '#e2e8f0'
        ctx.fillRect(px, py, cell, cell)
      }
    }
  }

  useEffect(() => {
    draw()
  }, [fontData.value, activeGlyph.value, editorZoom.value])

  function getCellCoords(e: MouseEvent) {
    const canvas = canvasRef.current!
    const rect = canvas.getBoundingClientRect()
    const canvasX = e.clientX - rect.left
    const canvasY = e.clientY - rect.top
    const x = Math.floor((canvasX - LINE) / step)
    const y = Math.floor((canvasY - LINE) / step)
    return { x: Math.max(0, Math.min(7, x)), y: Math.max(0, Math.min(7, y)) }
  }

  function onMouseDown(e: MouseEvent) {
    e.preventDefault()
    const { x, y } = getCellCoords(e)
    const idx = activeGlyph.value
    const current = getPixel(idx, x, y)
    painting.current = !current
    setPixel(idx, x, y, !current)
  }

  function onMouseMove(e: MouseEvent) {
    if (painting.current === null) return
    const { x, y } = getCellCoords(e)
    setPixel(activeGlyph.value, x, y, painting.current)
  }

  function onMouseUp() {
    painting.current = null
  }

  useEffect(() => {
    document.addEventListener('mouseup', onMouseUp)
    return () => document.removeEventListener('mouseup', onMouseUp)
  }, [])

  const charCode = startChar.value + activeGlyph.value
  const charLabel = charCode >= 33 && charCode <= 126 ? ` "${String.fromCharCode(charCode)}"` : ''

  return (
    <div>
      <div class="flex items-center gap-2 mb-2">
        <span>Zoom:</span>
        <input
          type="range"
          min={4}
          max={20}
          value={editorZoom.value}
          onInput={(e) => { editorZoom.value = parseInt((e.target as HTMLInputElement).value) }}
          class="w-32"
        />
        <span>{editorZoom.value * 100}%</span>
      </div>
      <div class="flex items-center gap-3 mb-2">
        <span class="font-bold">
          Glyph {activeGlyph.value} — Char {charCode} (0x{charCode.toString(16).toUpperCase()}){charLabel}
        </span>
      </div>
      <canvas
        ref={canvasRef}
        width={size}
        height={size}
        class="block cursor-crosshair border border-gray-400"
        style={{ width: size, height: size }}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
      />
    </div>
  )
}
