import { useRef, useEffect, useState } from 'preact/hooks'
import { type FontInstance, getPixel, setPixel, glyphAdvance } from '../store'
import { beginPaintStroke, commitPaintStroke } from '../undoHistory'
import { getCharMetrics, Metric } from '../charMetrics'

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

  // Determine which guidelines to show based on the current character
  const charCode = font.startChar.value + font.lastClickedGlyph.value
  const charFlags = getCharMetrics(charCode)

  // Guide sits at top edge of row: row 0 = top of grid, row h = bottom of grid
  function guideY(row: number): number {
    if (row < 0 || row > h) return -1
    if (row === 0) return 0
    if (row === h) return gridH - gap
    return gap + row * (cellSize + gap) - gap
  }

  // Build guideline list: [row, color]
  const guidelines: [number, string][] = []
  const baseline = font.baseline.value

  // Blue guidelines - convert relative-to-baseline values to absolute rows
  if (font.ascender.value >= 0 && (charFlags & Metric.Ascender))
    guidelines.push([baseline - font.ascender.value, '#3b82f6'])
  if (font.capHeight.value >= 0 && (charFlags & Metric.CapHeight))
    guidelines.push([baseline - font.capHeight.value, '#3b82f6'])
  if (font.numericHeight.value >= 0 && (charFlags & Metric.NumHeight))
    guidelines.push([baseline - font.numericHeight.value, '#3b82f6'])
  if (font.xHeight.value >= 0 && (charFlags & Metric.XHeight))
    guidelines.push([baseline - font.xHeight.value, '#3b82f6'])
  // Baseline always shown (red)
  if (baseline >= 0 && baseline <= h)
    guidelines.push([baseline, '#ef4444'])
  // Descender: pixels below baseline
  if (font.descender.value >= 0 && (charFlags & Metric.Descender))
    guidelines.push([baseline + font.descender.value, '#3b82f6'])

  // In proportional spacing mode, show a vertical guide for this glyph's advance width.
  const spacingMode = font.spacing.value
  const advance = spacingMode === 'proportional' ? glyphAdvance(font, idx) : null

  function guideX(col: number): number {
    if (col == null) return -1
    if (col <= 0) return 0
    if (col >= w) return gridW - gap
    return gap + col * (cellSize + gap) - gap
  }

  return (
    <div ref={containerRef} class="w-full h-full flex items-center justify-center">
      <div
        class="relative grid select-none"
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
        {guidelines.map(([row, color], i) => {
          const y = guideY(row)
          if (y < 0) return null
          return (
            <div
              key={i}
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                top: `${y}px`,
                height: `${gap}px`,
                backgroundColor: color,
                boxShadow: `0 0 1px 1px ${color}`,
                pointerEvents: 'none',
              }}
            />
          )
        })}
        {advance != null && advance > 0 && advance <= w && (
          <div
            style={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              left: `${guideX(advance)}px`,
              width: `${gap}px`,
              backgroundColor: '#22c55e',
              boxShadow: '0 0 1px 1px #22c55e',
              pointerEvents: 'none',
            }}
          />
        )}
      </div>
    </div>
  )
}
