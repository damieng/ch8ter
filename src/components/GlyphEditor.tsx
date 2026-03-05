import { useRef, useEffect } from 'preact/hooks'
import { type FontInstance, getPixel, setPixel } from '../store'
import { beginPaintStroke, commitPaintStroke } from '../undoHistory'

export function GlyphEditor({ font }: { font: FontInstance }) {
  const painting = useRef<boolean | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

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

  return (
    <div
      ref={containerRef}
      class="w-full h-full grid select-none"
      style={{
        gridTemplateColumns: `repeat(${w}, 1fr)`,
        gridTemplateRows: `repeat(${h}, 1fr)`,
        gap: '1px',
        backgroundColor: '#94a3b8',
        padding: '1px',
      }}
    >
      {cells}
    </div>
  )
}
