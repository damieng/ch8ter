import type preact from 'preact'
import { createPortal } from 'preact/compat'
import { useState, useRef, useEffect, useMemo, useCallback } from 'preact/hooks'
import { ZoomIn } from 'lucide-preact'
import { type FontInstance, fonts, storedPreviews, updatePreviewSettings } from '../store'
import { sampleTexts } from '../sampleTexts'
import { COLOR_SYSTEMS } from '../colorSystems'
import { wrapText, wrapTextProportional, cursorPosition, selectedCells, glyphBounds, propCharAdvance } from '../textLayout'
import { renderText } from '../previewRenderer'
import { useClickOutside } from '../hooks/useClickOutside'
import { CenterHIcon } from './CenterHIcon'

function ColorChip({ chipRef, popupRef, color, open, palette, onToggle, onPick, title }: {
  chipRef: preact.RefObject<HTMLDivElement | null>
  popupRef: preact.RefObject<HTMLDivElement | null>
  color: string
  open: boolean
  palette?: string[]
  onToggle: () => void
  onPick: (c: string) => void
  title: string
}) {
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const nativeRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open && chipRef.current) {
      const rect = chipRef.current.getBoundingClientRect()
      setPos({ x: rect.left, y: rect.bottom + 4 })
    }
  }, [open])

  function handleClick() {
    if (palette) {
      onToggle()
    } else {
      nativeRef.current?.click()
    }
  }

  return (
    <div ref={chipRef}>
      <button
        class="w-6 h-6 rounded border-2 border-gray-400 hover:border-gray-600"
        style={{ backgroundColor: color }}
        onClick={handleClick}
        title={title}
      />
      {!palette && (
        <input
          ref={nativeRef}
          type="color"
          value={color}
          onInput={(e) => onPick((e.target as HTMLInputElement).value)}
          class="absolute opacity-0 pointer-events-none"
          style={{ width: 0, height: 0 }}
        />
      )}
      {open && palette && createPortal(
        <div
          ref={popupRef}
          class="fixed bg-white border border-gray-300 rounded shadow-lg p-2"
          style={{ left: pos.x, top: pos.y, zIndex: 9999 }}
        >
          <div class="grid gap-1" style={{ gridTemplateColumns: `repeat(${palette.length > 16 ? 16 : Math.min(8, palette.length)}, 1fr)` }}>
            {palette.map((c, i) => (
              <button
                key={i}
                class={`w-5 h-5 rounded border ${c === color ? 'border-blue-500 border-2' : 'border-gray-300'}`}
                style={{ backgroundColor: c }}
                onClick={() => onPick(c)}
              />
            ))}
          </div>
        </div>,
        document.body,
      )}
    </div>
  )
}

interface Props {
  previewId: string
  initialFontId: string
}

export function PreviewWindow({ previewId, initialFontId }: Props) {
  const stored = storedPreviews.value.find(s => s.id === previewId)
  const [selectedFontId, setSelectedFontId] = useState(stored?.selectedFontId ?? initialFontId)
  const [textKey, setTextKey] = useState(stored?.textKey ?? '0-0')
  const [zoom, setZoom] = useState(stored?.zoom ?? 2)
  const [zoomOpen, setZoomOpen] = useState(false)
  const initSysIdx = stored?.systemIdx ?? COLOR_SYSTEMS.findIndex(s => s.name === 'ZX Spectrum')
  const [systemIdx, setSystemIdx] = useState(initSysIdx >= 0 ? initSysIdx : 0)
  const [fg, setFg] = useState(stored?.fg ?? COLOR_SYSTEMS[initSysIdx >= 0 ? initSysIdx : 0].fg)
  const [bg, setBg] = useState(stored?.bg ?? COLOR_SYSTEMS[initSysIdx >= 0 ? initSysIdx : 0].bg)
  const [proportional, setProportional] = useState(stored?.proportional ?? false)
  const [lineHeight, setLineHeight] = useState(stored?.lineHeight ?? 8)
  const [fgPickerOpen, setFgPickerOpen] = useState(false)
  const [bgPickerOpen, setBgPickerOpen] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const zoomRef = useRef<HTMLDivElement>(null)
  const fgRef = useRef<HTMLDivElement>(null)
  const bgRef = useRef<HTMLDivElement>(null)
  const fgPopupRef = useRef<HTMLDivElement>(null)
  const bgPopupRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [focused, setFocused] = useState(false)
  const [cursorVisible, setCursorVisible] = useState(true)
  const [selTick, setSelTick] = useState(0)
  const dragging = useRef(false)
  const dragAnchor = useRef(0)
  const clickCount = useRef(0)
  const lastClickTime = useRef(0)

  const allFonts = fonts.value
  const font = allFonts.find(f => f.id === selectedFontId) ?? allFonts[0]
  const system = COLOR_SYSTEMS[systemIdx]

  const initialText = useMemo(() => {
    const [gi, ii] = textKey.split('-').map(Number)
    return sampleTexts[gi]?.items[ii]?.text ?? ''
  }, [textKey])

  const [text, setText] = useState(initialText)

  useEffect(() => {
    setText(initialText)
    if (textareaRef.current) {
      textareaRef.current.value = initialText
      textareaRef.current.selectionStart = 0
      textareaRef.current.selectionEnd = 0
    }
  }, [initialText])

  useEffect(() => {
    updatePreviewSettings(previewId, {
      selectedFontId, textKey, zoom, systemIdx, fg, bg, fontId: initialFontId, proportional, lineHeight,
    })
  }, [selectedFontId, textKey, zoom, systemIdx, fg, bg, proportional, lineHeight])

  const [cols, setCols] = useState(32)

  useEffect(() => {
    function updateCols() {
      if (containerRef.current) {
        const w = containerRef.current.clientWidth - 24
        const cellSize = 8 * zoom
        setCols(Math.max(10, Math.floor(w / cellSize)))
      }
    }
    updateCols()
    const obs = new ResizeObserver(updateCols)
    if (containerRef.current) obs.observe(containerRef.current)
    return () => obs.disconnect()
  }, [zoom])

  useEffect(() => {
    if (!focused) return
    setCursorVisible(true)
    const interval = setInterval(() => setCursorVisible(v => !v), 530)
    return () => clearInterval(interval)
  }, [focused])

  const resetBlink = useCallback(() => {
    setCursorVisible(true)
  }, [])

  // Click-outside for zoom and color pickers
  useClickOutside(zoomRef, () => setZoomOpen(false))
  useClickOutside([fgRef, fgPopupRef], () => setFgPickerOpen(false))
  useClickOutside([bgRef, bgPopupRef], () => setBgPickerOpen(false))

  const selStart = textareaRef.current?.selectionStart ?? 0
  const selEnd = textareaRef.current?.selectionEnd ?? 0

  const wrapResult = useMemo(() => {
    if (!proportional) {
      return wrapText(text, cols)
    }
    const data = font?.fontData.value
    const start = font?.startChar.value ?? 32
    const gc = data ? data.length / 8 : 0
    const eIdx = 'e'.charCodeAt(0) - start
    const eWidth = (data && eIdx >= 0 && eIdx < gc) ? (glyphBounds(data, eIdx).width || 4) : 4
    const gap = 1
    const maxPixelWidth = cols * 8
    return wrapTextProportional(text, maxPixelWidth, (ch) =>
      data ? propCharAdvance(ch, data, start, gc, eWidth, gap) : 8
    )
  }, [text, cols, proportional, font?.fontData.value, font?.startChar.value])

  const { lines: wrappedLines, offsets } = wrapResult
  const cursorPos = focused ? cursorPosition(offsets, selStart, text.length) : null
  const selected = focused ? selectedCells(offsets, selStart, selEnd) : new Set<string>()

  useEffect(() => {
    if (canvasRef.current && font) {
      renderText({
        canvas: canvasRef.current, font, lines: wrappedLines, scale: zoom, cols,
        fg, bg, cursorPos, showCursor: cursorVisible, selected, proportional, lineHeight,
      })
    }
  }, [font?.fontData.value, font?.id, text, zoom, cols, fg, bg, cursorPos?.row, cursorPos?.col, cursorVisible, selStart, selEnd, selTick, proportional, lineHeight])

  function hitTest(clientX: number, clientY: number): number {
    if (!canvasRef.current) return 0
    const rect = canvasRef.current.getBoundingClientRect()
    const rowH = lineHeight * zoom
    const clickRow = Math.floor((clientY - rect.top) / rowH)
    const clickX = clientX - rect.left

    const row = Math.max(0, Math.min(clickRow, wrappedLines.length - 1))
    if (wrappedLines.length === 0) return 0

    if (!proportional) {
      const clickCol = Math.floor(clickX / (8 * zoom))
      const col = Math.min(Math.max(0, clickCol), offsets[row]?.length ?? 0)
      if (col < (offsets[row]?.length ?? 0)) {
        return offsets[row][col]
      } else if (offsets[row]?.length > 0) {
        return offsets[row][offsets[row].length - 1] + 1
      }
    } else {
      const data = font?.fontData.value
      const start = font?.startChar.value ?? 32
      const gc = data ? data.length / 8 : 0
      const eIdx = 'e'.charCodeAt(0) - start
      const eWidth = (data && eIdx >= 0 && eIdx < gc) ? (glyphBounds(data, eIdx).width || 4) : 4
      const gap = 1
      const line = wrappedLines[row]
      let xPos = 0
      for (let col = 0; col < line.length; col++) {
        const advance = (data ? propCharAdvance(line[col], data, start, gc, eWidth, gap) : 8) * zoom
        if (clickX < xPos + advance / 2) {
          if (col < (offsets[row]?.length ?? 0)) return offsets[row][col]
          break
        }
        xPos += advance
      }
      if (offsets[row]?.length > 0) {
        return offsets[row][offsets[row].length - 1] + 1
      }
    }

    let offset = text.length
    let lineCount = 0
    for (let i = 0; i <= text.length; i++) {
      if (lineCount === row) { offset = i; break }
      if (text[i] === '\n') lineCount++
    }
    return offset
  }

  function wordBounds(offset: number): [number, number] {
    const wordChars = /[a-zA-Z0-9_']/
    let start = offset, end = offset
    while (start > 0 && wordChars.test(text[start - 1])) start--
    while (end < text.length && wordChars.test(text[end])) end++
    if (start === end && offset < text.length) { end = offset + 1 }
    return [start, end]
  }

  function handleCanvasMouseDown(e: MouseEvent) {
    if (!textareaRef.current) return
    e.preventDefault()
    const ta = textareaRef.current
    const now = Date.now()
    const offset = hitTest(e.clientX, e.clientY)

    if (now - lastClickTime.current < 400) {
      clickCount.current++
    } else {
      clickCount.current = 1
    }
    lastClickTime.current = now

    if (clickCount.current >= 3) {
      ta.selectionStart = 0
      ta.selectionEnd = text.length
      clickCount.current = 0
    } else if (clickCount.current === 2) {
      const [ws, we] = wordBounds(offset)
      ta.selectionStart = ws
      ta.selectionEnd = we
      dragAnchor.current = ws
    } else {
      ta.selectionStart = ta.selectionEnd = offset
      dragAnchor.current = offset
      dragging.current = true
    }

    ta.focus()
    resetBlink()
    handleSelectionChange()
  }

  useEffect(() => {
    function onMouseMove(e: MouseEvent) {
      if (!dragging.current || !textareaRef.current) return
      const offset = hitTest(e.clientX, e.clientY)
      const anchor = dragAnchor.current
      textareaRef.current.selectionStart = Math.min(anchor, offset)
      textareaRef.current.selectionEnd = Math.max(anchor, offset)
      handleSelectionChange()
    }
    function onMouseUp() {
      dragging.current = false
    }
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
    return () => {
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
    }
  }, [text, cols, zoom])

  function handleTextareaInput() {
    if (textareaRef.current) {
      setText(textareaRef.current.value)
      resetBlink()
      setSelTick(t => t + 1)
    }
  }

  function handleSelectionChange() {
    setSelTick(t => t + 1)
    resetBlink()
  }

  useEffect(() => {
    function onSelectionChange() {
      if (document.activeElement === textareaRef.current) {
        setSelTick(t => t + 1)
        resetBlink()
      }
    }
    document.addEventListener('selectionchange', onSelectionChange)
    return () => document.removeEventListener('selectionchange', onSelectionChange)
  }, [])

  return (
    <div class="flex flex-col h-full">
      <div class="flex items-center gap-2 px-3 py-2 border-b border-gray-200 bg-gray-50 flex-wrap shrink-0">
        <select
          class="px-2 py-1 bg-white rounded border border-gray-300 text-sm"
          value={selectedFontId}
          onChange={(e) => setSelectedFontId((e.target as HTMLSelectElement).value)}
        >
          {allFonts.map(f => (
            <option key={f.id} value={f.id}>{f.fileName.value}</option>
          ))}
        </select>
        <select
          class="px-2 py-1 bg-white rounded border border-gray-300 text-sm"
          value={textKey}
          onChange={(e) => setTextKey((e.target as HTMLSelectElement).value)}
        >
          {sampleTexts.map((group, gi) => (
            <optgroup key={gi} label={group.group}>
              {group.items.map((item, ii) => (
                <option key={`${gi}-${ii}`} value={`${gi}-${ii}`}>{item.name}</option>
              ))}
            </optgroup>
          ))}
        </select>
        <select
          class="px-2 py-1 bg-white rounded border border-gray-300 text-sm"
          value={systemIdx}
          onChange={(e) => {
            const idx = parseInt((e.target as HTMLSelectElement).value)
            setSystemIdx(idx)
            setFg(COLOR_SYSTEMS[idx].fg)
            setBg(COLOR_SYSTEMS[idx].bg)
          }}
        >
          {COLOR_SYSTEMS.map((s, i) => (
            <option key={i} value={i}>{s.name}</option>
          ))}
        </select>
        <ColorChip
          chipRef={fgRef}
          popupRef={fgPopupRef}
          color={fg}
          open={fgPickerOpen}
          palette={system.palette}
          onToggle={() => { setFgPickerOpen(!fgPickerOpen); setBgPickerOpen(false) }}
          onPick={(c) => { setFg(c); setFgPickerOpen(false) }}
          title="Foreground color"
        />
        <ColorChip
          chipRef={bgRef}
          popupRef={bgPopupRef}
          color={bg}
          open={bgPickerOpen}
          palette={system.palette}
          onToggle={() => { setBgPickerOpen(!bgPickerOpen); setFgPickerOpen(false) }}
          onPick={(c) => { setBg(c); setBgPickerOpen(false) }}
          title="Background color"
        />
        <button
          class={`p-1.5 rounded border ${proportional ? 'bg-blue-100 border-blue-400 text-blue-700' : 'bg-white border-gray-300 hover:bg-blue-50'}`}
          onClick={() => setProportional(!proportional)}
          title="Proportional spacing"
        >
          <CenterHIcon size={14} />
        </button>
        <select
          class="px-2 py-1 bg-white rounded border border-gray-300 text-sm"
          value={lineHeight}
          onChange={(e) => setLineHeight(parseInt((e.target as HTMLSelectElement).value))}
          title="Line height"
        >
          {[4, 5, 6, 7, 8, 9, 10].map(h => (
            <option key={h} value={h}>{h}px</option>
          ))}
        </select>
        <div class="relative ml-auto" ref={zoomRef}>
          <button
            class="px-2 py-1 bg-white hover:bg-blue-50 rounded border border-gray-300 font-medium flex items-center gap-1 text-sm"
            onClick={() => setZoomOpen(!zoomOpen)}
          >
            <ZoomIn size={14} />
            {zoom * 100}%
          </button>
          {zoomOpen && (
            <div class="absolute top-full right-0 mt-1 bg-white border border-gray-300 rounded shadow-lg z-50 py-2 px-3 flex items-center gap-2">
              <input
                type="range"
                min={1}
                max={8}
                value={zoom}
                onInput={(e) => setZoom(parseInt((e.target as HTMLInputElement).value))}
                class="w-40"
              />
              <span class="text-sm whitespace-nowrap">{zoom * 100}%</span>
            </div>
          )}
        </div>
      </div>
      <div
        ref={containerRef}
        class="flex-1 overflow-auto p-3 relative"
        style={{ backgroundColor: bg }}
      >
        <canvas
          ref={canvasRef}
          class="block cursor-text"
          style={{ imageRendering: 'pixelated' }}
          onMouseDown={handleCanvasMouseDown}
        />
        <textarea
          ref={textareaRef}
          class="absolute opacity-0 pointer-events-none"
          style={{ top: 0, left: 0, width: 1, height: 1 }}
          onInput={handleTextareaInput}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
        />
      </div>
    </div>
  )
}
