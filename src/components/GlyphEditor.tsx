import { useRef, useEffect, useState } from 'preact/hooks'
import { type FontInstance, getPixel, setPixel } from '../store'
import { beginPaintStroke, commitPaintStroke } from '../undoHistory'

export function GlyphEditor({ font }: { font: FontInstance }) {
  const painting = useRef<boolean | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [containerSize, setContainerSize] = useState({ w: 256, h: 256 })

  function handleCell(x: number, y: number, e: MouseEvent) {
    e.preventDefault()
    const idx = font.lastClickedGlyph.value
    if (painting.current === null) {
      painting.current = !getPixel(font, idx, x, y)
      beginPaintStroke(font, idx)
    }
    setPixel(font, idx, x, y, painting.current)
  }

  function onMouseUp() {
    if (painting.current !== null) {
      commitPaintStroke(font)
    }
    painting.current = null
  }

  useEffect(() => {
    document.addEventListener('mouseup', onMouseUp)
    return () => document.removeEventListener('mouseup', onMouseUp)
  }, [])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const update = () => setContainerSize({ w: el.clientWidth, h: el.clientHeight })
    const obs = new ResizeObserver(update)
    obs.observe(el)
    update()
    return () => obs.disconnect()
  }, [])

  const idx = font.lastClickedGlyph.value
  const w = font.glyphWidth.value
  const h = font.glyphHeight.value
  const cells = []
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const on = getPixel(font, idx, x, y)
      cells.push(
        <div
          key={`${x}-${y}`}
          class="cursor-crosshair"
          style={{ backgroundColor: on ? '#1e293b' : '#e2e8f0' }}
          onMouseDown={(e: MouseEvent) => handleCell(x, y, e)}
          onMouseEnter={(e: MouseEvent) => {
            if (painting.current !== null) handleCell(x, y, e)
          }}
        />
      )
    }
  }

  // Square cells: fit the largest square cell size into the container
  const gap = 1
  const cellSize = Math.max(1, Math.floor(Math.min(
    (containerSize.w - gap * (w + 1)) / w,
    (containerSize.h - gap * (h + 1)) / h,
  )))
  const gridW = cellSize * w + gap * (w + 1)
  const gridH = cellSize * h + gap * (h + 1)

  return (
    <div ref={containerRef} class="w-full h-full flex items-center justify-center">
      <div
        class="grid select-none"
        style={{
          width: `${gridW}px`,
          height: `${gridH}px`,
          gridTemplateColumns: `repeat(${w}, ${cellSize}px)`,
          gridTemplateRows: `repeat(${h}, ${cellSize}px)`,
          gap: `${gap}px`,
          backgroundColor: '#94a3b8',
          padding: `${gap}px`,
        }}
      >
        {cells}
      </div>
    </div>
  )
}
