import { useState, useRef, useEffect } from 'preact/hooks'
import { createPortal } from 'preact/compat'
import { ZoomIn, Eye, Maximize2, EyeOff } from 'lucide-preact'
import { type FontInstance, glyphCount, bytesPerGlyph, selectGlyph, selectAll, activeFontId, openPreview, openGlyphEditor, charCodeFromKey, glyphToText, charset, CHARSETS, charsetGlyphFilter, shiftUp, shiftDown, shiftLeft, shiftRight } from '../store'
import { execClearGlyph, execPasteGlyph, execTransformGlyph, undo, redo } from '../undoHistory'
import { COLOR_SYSTEMS } from '../colorSystems'
import { GlyphTile } from '../components/GlyphTile'
import { SaveBar, ExportBar } from '../components/Toolbar'
import { ToolsDropdown } from '../components/ToolsDropdown'
import { SelectDropdown } from '../components/SelectDropdown'
import { MetricsDialog } from '../dialogs/MetricsDialog'
import { useClickOutside } from '../hooks/useClickOutside'

export function FontPaneTitle({ font }: { font: FontInstance }) {
  return <span>Font — {font.fileName.value} ({font.spacing.value})</span>
}

function ZoomDropdown({ font }: { font: FontInstance }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useClickOutside(ref, () => setOpen(false))

  return (
    <div class="relative" ref={ref}>
      <button
        class="px-2 py-1 bg-white hover:bg-blue-50 rounded border border-gray-300 font-medium flex items-center gap-1"
        onClick={() => setOpen(!open)}
      >
        <ZoomIn size={16} />
        {font.gridZoom.value * 100}%
      </button>
      {open && (
        <div class="absolute top-full right-0 mt-1 bg-white border border-gray-300 rounded shadow-lg z-50 py-2 px-3 flex items-center gap-2">
          <input
            type="range"
            min={1}
            max={10}
            value={font.gridZoom.value}
            onInput={(e) => { font.gridZoom.value = parseInt((e.target as HTMLInputElement).value) }}
            class="w-40"
          />
          <span class="text-sm whitespace-nowrap">{font.gridZoom.value * 100}%</span>
        </div>
      )}
    </div>
  )
}

function SizeButton({ font }: { font: FontInstance }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        class="px-2 py-1 bg-white hover:bg-blue-50 rounded border border-gray-300 font-medium flex items-center gap-1"
        onClick={() => setOpen(true)}
      >
        <Maximize2 size={16} />
        {font.glyphWidth.value}×{font.glyphHeight.value}
      </button>
      {open && createPortal(
        <MetricsDialog font={font} onClose={() => setOpen(false)} />,
        document.body,
      )}
    </>
  )
}

function PreviewButton({ font }: { font: FontInstance }) {
  function handleClick() {
    const cs = CHARSETS[charset.value]
    const sysIdx = cs?.colorSystem
      ? COLOR_SYSTEMS.findIndex(s => s.name === cs.colorSystem)
      : -1
    openPreview(font.id, sysIdx >= 0 ? sysIdx : undefined)
  }

  return (
    <button
      class="px-2 py-1 bg-white hover:bg-blue-50 rounded border border-gray-300 font-medium flex items-center gap-1"
      onClick={handleClick}
    >
      <Eye size={16} />
      Preview
    </button>
  )
}

interface Props {
  font: FontInstance
}

export function FontPane({ font }: Props) {
  const hideEmpty = font.hideEmpty.value
  const setHideEmpty = (v: boolean) => { font.hideEmpty.value = v }
  const count = glyphCount(font)
  const zoomLevel = font.gridZoom.value
  const tileSize = Math.max(font.glyphWidth.value, font.glyphHeight.value) * zoomLevel

  // Tile dimensions: canvas + border-2 (2px each side) + p-0.5 (1px each side)
  const gw = font.glyphWidth.value
  const gh = font.glyphHeight.value
  const maxDim = Math.max(gw, gh)
  const canvasW = Math.round(tileSize * gw / maxDim)
  const canvasH = Math.round(tileSize * gh / maxDim)
  const border = 4 // border-2 = 2px * 2 sides
  const pad = 2    // p-0.5 = 1px * 2 sides
  const labelHeight = 20 // text-sm leading-tight + mt-0.5
  const gap = 2
  const tileOuterW = canvasW + border + pad + gap
  const tileOuterH = canvasH + border + pad + labelHeight + gap

  const gridNavRef = useRef({ cols: 0, visibleIndices: [] as number[], visibleCount: 0, hideEmpty: true })
  const scrollRef = useRef<HTMLDivElement>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [viewHeight, setViewHeight] = useState(400)
  const [viewWidth, setViewWidth] = useState(600)
  const rafRef = useRef(0)

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const update = () => {
      const w = el.clientWidth
      const h = el.clientHeight
      setViewWidth(prev => prev !== w ? w : prev)
      setViewHeight(prev => prev !== h ? h : prev)
    }
    const throttledUpdate = () => {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = requestAnimationFrame(update)
    }
    const onScroll = () => setScrollTop(el.scrollTop)
    el.addEventListener('scroll', onScroll, { passive: true })
    const obs = new ResizeObserver(throttledUpdate)
    obs.observe(el)
    update()
    return () => { el.removeEventListener('scroll', onScroll); obs.disconnect(); cancelAnimationFrame(rafRef.current) }
  }, [])

  // Reset scroll position when font changes so tiles are visible immediately
  useEffect(() => {
    const el = scrollRef.current
    if (el) {
      el.scrollTop = 0
      setScrollTop(0)
    }
  }, [font.id])

  // Build index of visible glyph indices (hide empty only — charset filter used for muting labels)
  const data = font.fontData.value
  const bpg = bytesPerGlyph(font)
  const csFilter = charsetGlyphFilter(font)
  let visibleIndices: number[]
  if (hideEmpty) {
    visibleIndices = []
    for (let i = 0; i < count; i++) {
      const offset = i * bpg
      let empty = true
      for (let b = 0; b < bpg; b++) {
        if (data[offset + b] !== 0) { empty = false; break }
      }
      const charCode = font.startChar.value + i
      if (empty && charCode !== 32) continue
      visibleIndices.push(i)
    }
  } else {
    visibleIndices = Array.from({ length: count }, (_, i) => i)
  }
  const visibleCount = visibleIndices.length

  const cols = tileOuterW > 0 ? Math.max(1, Math.floor((viewWidth - gap) / tileOuterW)) : 1
  const rows = Math.ceil(visibleCount / cols)
  const totalHeight = rows * tileOuterH + gap
  gridNavRef.current = { cols, visibleIndices, visibleCount, hideEmpty }

  // Visible row range
  const startRow = Math.max(0, Math.floor(scrollTop / tileOuterH) - 1)
  const endRow = Math.min(rows, Math.ceil((scrollTop + viewHeight) / tileOuterH) + 1)

  // Build visible tiles
  const selectedSet = font.selectedGlyphs.value
  const activeIdx = font.lastClickedGlyph.value
  const visibleTiles = []
  for (let row = startRow; row < endRow; row++) {
    for (let col = 0; col < cols; col++) {
      const slot = row * cols + col
      if (slot >= visibleCount) break
      const i = visibleIndices[slot]
      visibleTiles.push(
        <div
          key={i}
          style={{
            position: 'absolute',
            left: `${gap + col * tileOuterW}px`,
            top: `${gap + row * tileOuterH}px`,
          }}
        >
          <GlyphTile
            font={font}
            index={i}
            size={tileSize}
            selected={selectedSet.has(i)}
            active={i === activeIdx}
            muted={csFilter != null && !csFilter(i)}
            onClick={(e: MouseEvent) => {
              selectGlyph(font, i, e.shiftKey, e.ctrlKey || e.metaKey)
              activeFontId.value = font.id
              if (!e.shiftKey && !(e.ctrlKey || e.metaKey)) {
                openGlyphEditor(font)
              }
            }}
          />
        </div>
      )
    }
  }

  // Jump to glyph when typing a character (document-level, only when this font is active)
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (activeFontId.value !== font.id) return
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return

      const active = font.lastClickedGlyph.value

      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        undo(font)
        e.preventDefault()
        return
      }

      if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
        redo(font)
        e.preventDefault()
        return
      }

      if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
        selectAll(font)
        e.preventDefault()
        return
      }

      if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
        const text = glyphToText(font, active)
        navigator.clipboard.writeText(text)
        e.preventDefault()
        return
      }

      if ((e.ctrlKey || e.metaKey) && e.key === 'x') {
        const text = glyphToText(font, active)
        navigator.clipboard.writeText(text)
        execClearGlyph(font, active)
        e.preventDefault()
        return
      }

      if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
        navigator.clipboard.readText().then(text => {
          execPasteGlyph(font, active, text)
        })
        e.preventDefault()
        return
      }

      if (e.key === 'Delete') {
        execClearGlyph(font, active)
        e.preventDefault()
        return
      }

      // Ctrl+Arrow: navigate glyphs in the grid
      if ((e.ctrlKey || e.metaKey) && e.key.startsWith('Arrow')) {
        const nav = gridNavRef.current
        const slot = nav.hideEmpty ? nav.visibleIndices.indexOf(active) : active
        if (slot < 0) return
        let newSlot = slot
        if (e.key === 'ArrowRight') newSlot = slot + 1
        else if (e.key === 'ArrowLeft') newSlot = slot - 1
        else if (e.key === 'ArrowDown') newSlot = slot + nav.cols
        else if (e.key === 'ArrowUp') newSlot = slot - nav.cols
        if (newSlot >= 0 && newSlot < nav.visibleCount) {
          selectGlyph(font, nav.visibleIndices[newSlot], false, false)
        }
        e.preventDefault()
        return
      }

      // Plain Arrow: shift glyph pixels
      const shiftMap: Record<string, typeof shiftUp> = {
        ArrowUp: shiftUp, ArrowDown: shiftDown,
        ArrowLeft: shiftLeft, ArrowRight: shiftRight,
      }
      if (shiftMap[e.key]) {
        execTransformGlyph(font, active, shiftMap[e.key], 'Shift')
        e.preventDefault()
        return
      }

      if (e.ctrlKey || e.metaKey || e.altKey) return

      const charCode = charCodeFromKey(e.key)
      if (charCode === null) return

      const idx = charCode - font.startChar.value
      if (idx >= 0 && idx < count) {
        selectGlyph(font, idx, false, false)
        e.preventDefault()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [font, count])

  // Scroll to active glyph when it changes
  useEffect(() => {
    const active = font.lastClickedGlyph.value
    if (active < 0 || active >= count || !scrollRef.current) return
    const slot = hideEmpty ? visibleIndices.indexOf(active) : active
    if (slot < 0) return
    const row = Math.floor(slot / cols)
    const tileTop = gap + row * tileOuterH
    const tileBottom = tileTop + tileOuterH
    const el = scrollRef.current
    if (tileTop < el.scrollTop) {
      el.scrollTop = tileTop - gap
    } else if (tileBottom > el.scrollTop + el.clientHeight) {
      el.scrollTop = tileBottom - el.clientHeight + gap
    }
  }, [font.lastClickedGlyph.value, cols])

  return (
    <div class="flex flex-col h-full">
      <div class="flex items-center gap-4 mb-3 flex-wrap shrink-0">
        <SaveBar font={font} />
        <ExportBar font={font} />
        <SelectDropdown font={font} />
        <ToolsDropdown font={font} />
        <SizeButton font={font} />
        <PreviewButton font={font} />
        <button
          class={`px-2 py-1 rounded border font-medium flex items-center gap-1 ${hideEmpty ? 'bg-blue-100 border-blue-400 text-blue-700' : 'bg-white hover:bg-blue-50 border-gray-300'}`}
          onClick={() => setHideEmpty(!hideEmpty)}
          title={hideEmpty ? 'Show all glyphs' : 'Hide empty glyphs'}
        >
          <EyeOff size={16} />
          {hideEmpty ? `${visibleCount} shown` : 'Hide empty'}
        </button>
        <div class="ml-auto">
          <ZoomDropdown font={font} />
        </div>
      </div>
      <div
        ref={scrollRef}
        class="flex-1 overflow-auto min-h-0"
      >
        <div style={{ position: 'relative', height: `${totalHeight}px`, width: '100%' }}>
          {visibleTiles}
        </div>
      </div>
    </div>
  )
}
