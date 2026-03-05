import { useRef, useEffect } from 'preact/hooks'
import { type FontInstance, getPixel, setPixel } from '../store'

// Fixed canvas size: 8 cells of 40px + 9 grid lines of 1px = 329
const CELL = 40
const LINE = 1
const STEP = CELL + LINE
const CANVAS = LINE + 8 * STEP

export function GlyphEditor({ font }: { font: FontInstance }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const painting = useRef<boolean | null>(null)

  function draw() {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    const idx = font.lastClickedGlyph.value

    ctx.fillStyle = '#94a3b8'
    ctx.fillRect(0, 0, CANVAS, CANVAS)

    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        const px = LINE + x * STEP
        const py = LINE + y * STEP
        ctx.fillStyle = getPixel(font, idx, x, y) ? '#1e293b' : '#e2e8f0'
        ctx.fillRect(px, py, CELL, CELL)
      }
    }
  }

  useEffect(() => {
    draw()
  }, [font.fontData.value, font.lastClickedGlyph.value])

  function getCellCoords(e: MouseEvent) {
    const canvas = canvasRef.current!
    const rect = canvas.getBoundingClientRect()
    const scaleX = CANVAS / rect.width
    const scaleY = CANVAS / rect.height
    const canvasX = (e.clientX - rect.left) * scaleX
    const canvasY = (e.clientY - rect.top) * scaleY
    const x = Math.floor((canvasX - LINE) / STEP)
    const y = Math.floor((canvasY - LINE) / STEP)
    return { x: Math.max(0, Math.min(7, x)), y: Math.max(0, Math.min(7, y)) }
  }

  function onMouseDown(e: MouseEvent) {
    e.preventDefault()
    const { x, y } = getCellCoords(e)
    const idx = font.lastClickedGlyph.value
    const current = getPixel(font, idx, x, y)
    painting.current = !current
    setPixel(font, idx, x, y, !current)
  }

  function onMouseMove(e: MouseEvent) {
    if (painting.current === null) return
    const { x, y } = getCellCoords(e)
    setPixel(font, font.lastClickedGlyph.value, x, y, painting.current)
  }

  function onMouseUp() {
    painting.current = null
  }

  useEffect(() => {
    document.addEventListener('mouseup', onMouseUp)
    return () => document.removeEventListener('mouseup', onMouseUp)
  }, [])

  return (
    <canvas
      ref={canvasRef}
      width={CANVAS}
      height={CANVAS}
      class="block cursor-crosshair w-full h-full"
      style={{ imageRendering: 'pixelated' }}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
    />
  )
}
