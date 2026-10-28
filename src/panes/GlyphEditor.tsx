import { useRef, useEffect, useState } from 'preact/hooks'
import { Pencil, Slash, Square, Circle, PaintBucket } from 'lucide-preact'
import { type FontInstance, getPixel, setPixel, glyphAdvance, setGlyphAdvance } from '../store'
import { beginPaintStroke, commitPaintStroke } from '../undoHistory'
import { getCharMetrics, Metric } from '../charMetrics'
import { linePixels, rectPixels, ellipsePixels, floodFill } from '../glyphShapes'

type Tool = 'pencil' | 'line' | 'rect' | 'ellipse' | 'fill'

const TOOLS: { id: Tool; icon: typeof Pencil; label: string }[] = [
  { id: 'pencil', icon: Pencil, label: 'Pencil' },
  { id: 'line', icon: Slash, label: 'Line' },
  { id: 'rect', icon: Square, label: 'Rectangle (Shift = filled)' },
  { id: 'ellipse', icon: Circle, label: 'Ellipse (Shift = filled)' },
  { id: 'fill', icon: PaintBucket, label: 'Fill' },
]

function shapePixels(tool: Tool, x0: number, y0: number, x1: number, y1: number, filled: boolean): Set<string> {
  if (tool === 'line') return linePixels(x0, y0, x1, y1)
  if (tool === 'rect') return rectPixels(x0, y0, x1, y1, filled)
  return ellipsePixels(x0, y0, x1, y1, filled)
}

export function GlyphEditor({ font }: { font: FontInstance }) {
  const painting = useRef<boolean | null>(null)
  const draggingGuide = useRef(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const gridRef = useRef<HTMLDivElement>(null)
  const [containerSize, setContainerSize] = useState({ w: 256, h: 256 })

  const [tool, setTool] = useState<Tool>('pencil')
  const toolRef = useRef(tool)
  toolRef.current = tool
  // Shape drag state: start cell, current end cell, and the pixels being
  // previewed (applied to the font only on mouseup, as one undo step)
  const shapeStart = useRef<{ x: number; y: number } | null>(null)
  const shapeEnd = useRef<{ x: number; y: number } | null>(null)
  const previewPixels = useRef<Set<string>>(new Set())
  const [preview, setPreview] = useState<{ pixels: Set<string>; on: boolean } | null>(null)

  const idx = font.lastClickedGlyph.value
  const w = font.glyphWidth.value
  const h = font.glyphHeight.value

  // Keep refs so document-level event handlers always see current values
  // without needing to re-register on every render.
  const fontRef = useRef(font)
  fontRef.current = font
  const editorState = useRef({ idx, w, cellSize: 0, gap: 1 })

  // Square cells: fit the largest square cell size into the container
  const gap = 1
  const cellSize = Math.max(1, Math.floor(Math.min(
    (containerSize.w - gap * (w + 1)) / w,
    (containerSize.h - gap * (h + 1)) / h,
  )))
  const gridW = cellSize * w + gap * (w + 1)
  const gridH = cellSize * h + gap * (h + 1)

  editorState.current = { idx, w, cellSize, gap }

  function updateShapePreview(x1: number, y1: number, shift: boolean) {
    const start = shapeStart.current
    if (!start) return
    const t = toolRef.current
    previewPixels.current = shapePixels(t, start.x, start.y, x1, y1, shift && (t === 'rect' || t === 'ellipse'))
    setPreview({ pixels: previewPixels.current, on: painting.current ?? true })
  }

  function handleCell(x: number, y: number, e: MouseEvent) {
    e.preventDefault()
    const t = toolRef.current
    if (t === 'pencil') {
      if (painting.current === null) {
        painting.current = !getPixel(font, idx, x, y)
        beginPaintStroke(font, idx)
      }
      setPixel(font, idx, x, y, painting.current)
      return
    }
    if (t === 'fill') {
      if (painting.current === null) {
        painting.current = !getPixel(font, idx, x, y)
        beginPaintStroke(font, idx)
        floodFill(font, idx, x, y, painting.current)
      }
      return
    }
    // Shape tools: drag to preview, pixels applied on mouseup
    if (shapeStart.current === null) {
      shapeStart.current = { x, y }
      shapeEnd.current = { x, y }
      painting.current = !getPixel(font, idx, x, y)
      previewPixels.current = new Set([`${x},${y}`])
      setPreview({ pixels: previewPixels.current, on: painting.current })
    } else {
      shapeEnd.current = { x, y }
      updateShapePreview(x, y, e.shiftKey)
    }
  }

  useEffect(() => {
    function onMouseMove(e: MouseEvent) {
      if (!draggingGuide.current) return
      const grid = gridRef.current
      if (!grid) return
      const { idx: curIdx, w: curW, cellSize: curCell, gap: curGap } = editorState.current
      const rect = grid.getBoundingClientRect()
      const x = e.clientX - rect.left
      const col = Math.max(1, Math.min(curW, Math.round(x / (curCell + curGap))))
      setGlyphAdvance(fontRef.current, curIdx, col)
    }

    function onMouseUp(e: MouseEvent) {
      draggingGuide.current = false
      if (painting.current !== null) {
        // Shape drag: apply the previewed pixels now, between the
        // begin/commit pair, so the whole shape is one undo step
        const start = shapeStart.current
        if (start) {
          const end = shapeEnd.current ?? start
          const pixels = shapePixels(
            toolRef.current, start.x, start.y, end.x, end.y,
            e.shiftKey && (toolRef.current === 'rect' || toolRef.current === 'ellipse'),
          )
          beginPaintStroke(fontRef.current, editorState.current.idx)
          for (const key of pixels) {
            const [px, py] = key.split(',').map(Number)
            setPixel(fontRef.current, editorState.current.idx, px, py, painting.current ?? true)
          }
        }
        commitPaintStroke(fontRef.current)
      }
      painting.current = null
      shapeStart.current = null
      shapeEnd.current = null
      previewPixels.current = new Set()
      setPreview(null)
    }

    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
    return () => {
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
    }
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

  // Subscribe to paintVersion so we re-render on each in-place pixel edit.
  // fontData signal only fires at commit time (mouseup).
  font.paintVersion.value

  const cells = []
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const previewPixel = preview?.pixels.has(`${x},${y}`) ?? false
      const on = previewPixel ? preview!.on : getPixel(font, idx, x, y)
      cells.push(
        <div
          key={`${x}-${y}`}
          class="cursor-crosshair"
          style={{ backgroundColor: on ? '#1e293b' : previewPixel ? '#f87171' : '#e2e8f0' }}
          onMouseDown={(e: MouseEvent) => handleCell(x, y, e)}
          onMouseEnter={(e: MouseEvent) => {
            if (painting.current !== null || shapeStart.current !== null) handleCell(x, y, e)
          }}
        />
      )
    }
  }

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
    if (col <= 0) return 0
    if (col >= w) return gridW - gap
    return col * (cellSize + gap)
  }

  return (
    <div class="w-full h-full flex flex-col">
      <div class="flex items-center gap-1 pb-2 shrink-0 flex-wrap">
        {TOOLS.map(t => (
          <button
            key={t.id}
            title={t.label}
            class={`p-1.5 rounded border ${tool === t.id
              ? 'bg-blue-100 border-blue-400 text-blue-700'
              : 'bg-white hover:bg-blue-50 border-gray-300 text-gray-600'}`}
            onClick={() => setTool(t.id)}
          >
            <t.icon size={14} />
          </button>
        ))}
        <span class="text-xs text-gray-400 ml-2">{TOOLS.find(t => t.id === tool)!.label}</span>
      </div>
      <div ref={containerRef} class="flex-1 min-h-0 w-full flex items-center justify-center">
        <div
          ref={gridRef}
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
        {advance != null && (
          <div
            style={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              left: `${guideX(advance)}px`,
              width: `${gap + 4}px`,
              marginLeft: `-2px`,
              backgroundColor: 'transparent',
              cursor: 'ew-resize',
              zIndex: 10,
            }}
            onMouseDown={(e: MouseEvent) => {
              e.stopPropagation()
              e.preventDefault()
              draggingGuide.current = true
            }}
          >
            <div
              style={{
                position: 'absolute',
                top: 0,
                bottom: 0,
                left: '2px',
                width: `${gap}px`,
                backgroundColor: '#22c55e',
                boxShadow: '0 0 1px 1px #22c55e',
                pointerEvents: 'none',
              }}
            />
          </div>
        )}
        </div>
      </div>
    </div>
  )
}
