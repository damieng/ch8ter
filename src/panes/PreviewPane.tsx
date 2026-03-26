import { useState, useRef, useEffect, useLayoutEffect, useMemo, useCallback } from 'preact/hooks'
import { ZoomIn } from 'lucide-preact'
import { fonts, storedPreviews, updatePreviewSettings, glyphAdvance } from '../store'
import { isFixedWidth } from '../unicodeRanges'
import { sampleTexts } from '../sampleTexts'
import { COLOR_SYSTEMS } from '../colorSystems'
import { wrapText, wrapTextProportional, cursorPosition, selectedCells } from '../textLayout'
import { renderText } from '../previewRenderer'
import { useClickOutside } from '../hooks/useClickOutside'
import { bpr } from '../bitUtils'
import { ColorSwatch } from '../components/ColorSwatch'

interface Props {
  previewId: string
  initialFontId: string
}

export function PreviewPane({ previewId, initialFontId }: Props) {
  const stored = storedPreviews.value.find(s => s.id === previewId)
  const [selectedFontId, setSelectedFontId] = useState(stored?.selectedFontId ?? initialFontId)
  const [textKey, setTextKey] = useState(stored?.textKey ?? '0-0')
  const [zoom, setZoom] = useState(stored?.zoom ?? 2)
  const [zoomOpen, setZoomOpen] = useState(false)
  const rawSysIdx = stored?.systemIdx ?? COLOR_SYSTEMS.findIndex(s => s.name === 'Sinclair ZX Spectrum')
  const initSysIdx = rawSysIdx >= 0 && rawSysIdx < COLOR_SYSTEMS.length ? rawSysIdx : 0
  const [systemIdx, setSystemIdx] = useState(initSysIdx)
  const [fg, setFg] = useState(stored?.fg ?? COLOR_SYSTEMS[initSysIdx >= 0 ? initSysIdx : 0].fg)
  const [bg, setBg] = useState(stored?.bg ?? COLOR_SYSTEMS[initSysIdx >= 0 ? initSysIdx : 0].bg)
  const [colorOpen, setColorOpen] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const zoomRef = useRef<HTMLDivElement>(null)
  const colorRef = useRef<HTMLDivElement>(null)
  const colorPopupRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [focused, setFocused] = useState(false)
  const [cursorVisible, setCursorVisible] = useState(true)
  const dragging = useRef(false)
  const dragAnchor = useRef(0)
  const clickCount = useRef(0)
  const lastClickTime = useRef(0)

  const allFonts = fonts.value
  const font = allFonts.find(f => f.id === selectedFontId) ?? allFonts[0]
  const proportional = font?.spacing.value === 'proportional'
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

  const gw = font?.glyphWidth.value ?? 8
  const gh = font?.glyphHeight.value ?? 8

  useEffect(() => {
    updatePreviewSettings(previewId, {
      selectedFontId, textKey, zoom, systemIdx, fg, bg, fontId: initialFontId, lineHeight: gh,
    })
  }, [selectedFontId, textKey, zoom, systemIdx, fg, bg, gh])

  const [cols, setCols] = useState(32)

  // Measure container synchronously before first paint so cols is correct
  // from the start (avoids a blank-canvas flash on initial load).
  useLayoutEffect(() => {
    if (containerRef.current) {
      const cw = containerRef.current.clientWidth - 24
      const cellSize = gw * zoom
      setCols(Math.max(10, Math.floor(cw / cellSize)))
    }
  }, [zoom, gw])

  // Track ongoing resizes asynchronously via ResizeObserver.
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const obs = new ResizeObserver(() => {
      const cw = el.clientWidth - 24
      const cellSize = gw * zoom
      setCols(Math.max(10, Math.floor(cw / cellSize)))
    })
    obs.observe(el)
    return () => obs.disconnect()
  }, [zoom, gw])

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
  useClickOutside([colorRef, colorPopupRef], () => setColorOpen(false))

  const selStart = textareaRef.current?.selectionStart ?? 0
  const selEnd = textareaRef.current?.selectionEnd ?? 0

  const wrapResult = useMemo(() => {
    if (!proportional || !font) {
      return wrapText(text, cols)
    }
    const start = font.startChar.value
    const rowBytes = bpr(gw)
    const bpg = gh * rowBytes
    const data = font.fontData.value
    const gc = data && bpg > 0 ? Math.floor(data.length / bpg) : 0
    const maxPixelWidth = cols * gw
    return wrapTextProportional(text, maxPixelWidth, (ch) => {
      const cp = ch.charCodeAt(0)
      const gi = cp - start
      if (isFixedWidth(cp)) return gw
      return (gi >= 0 && gi < gc) ? glyphAdvance(font, gi) : gw
    })
  }, [text, cols, proportional, font?.fontData.value, font?.glyphMeta.value, font?.startChar.value, gw, gh])

  const { lines: wrappedLines, offsets, attrs } = wrapResult
  const cursorPos = focused ? cursorPosition(offsets, selStart, text.length) : null
  const selected = focused ? selectedCells(offsets, selStart, selEnd) : new Set<string>()

  const renderCanvas = useCallback(() => {
    if (!canvasRef.current || !font) return
    renderText({
      canvas: canvasRef.current,
      font,
      lines: wrappedLines,
      attrs,
      scale: zoom,
      cols,
      fg,
      bg,
      cursorPos,
      showCursor: cursorVisible,
      selected,
      proportional,
      lineHeight: gh,
    })
  }, [font, wrappedLines, attrs, zoom, cols, fg, bg, cursorPos, cursorVisible, selected, proportional, gh])

  // Normal reactive render
  useEffect(renderCanvas, [renderCanvas])

  function hitTest(clientX: number, clientY: number): number {
    if (!canvasRef.current) return 0
    const rect = canvasRef.current.getBoundingClientRect()
    const rowH = gh * zoom
    const clickRow = Math.floor((clientY - rect.top) / rowH)
    const clickX = clientX - rect.left

    const row = Math.max(0, Math.min(clickRow, wrappedLines.length - 1))
    if (wrappedLines.length === 0) return 0

    if (!proportional) {
      const clickCol = Math.floor(clickX / (gw * zoom))
      const col = Math.min(Math.max(0, clickCol), offsets[row]?.length ?? 0)
      if (col < (offsets[row]?.length ?? 0)) {
        return offsets[row][col]
      } else if (offsets[row]?.length > 0) {
        return offsets[row][offsets[row].length - 1] + 1
      }
    } else {
      const start = font?.startChar.value ?? 32
      const rowBytes = bpr(gw)
      const bpg = gh * rowBytes
      const data = font?.fontData.value
      const gc = data && bpg > 0 ? Math.floor(data.length / bpg) : 0
      const line = wrappedLines[row]
      let xPos = 0
      for (let col = 0; col < line.length; col++) {
        const cp = line[col].charCodeAt(0)
        const gi = cp - start
        const advance = (isFixedWidth(cp) ? gw : (font && gi >= 0 && gi < gc ? glyphAdvance(font, gi) : gw)) * zoom
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
    if (e.button !== 0) {
      textareaRef.current.focus()
      return
    }
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
    }
  }

  function handleSelectionChange() {
    resetBlink()
  }

  useEffect(() => {
    function onSelectionChange() {
      if (document.activeElement === textareaRef.current) {
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
          {sampleTexts.map((group, gi) =>
            group.items.length === 1 ? (
              <option key={gi} value={`${gi}-0`}>{group.items[0].name}</option>
            ) : (
              <optgroup key={gi} label={group.group}>
                {group.items.map((item, ii) => (
                  <option key={`${gi}-${ii}`} value={`${gi}-${ii}`}>{item.name}</option>
                ))}
              </optgroup>
            )
          )}
        </select>
        <ColorSwatch
          anchorRef={colorRef}
          popupRef={colorPopupRef}
          fg={fg}
          bg={bg}
          open={colorOpen}
          palette={system.palette}
          systems={COLOR_SYSTEMS}
          systemIdx={systemIdx}
          onToggle={() => setColorOpen(!colorOpen)}
          onFgPick={(c) => setFg(c)}
          onBgPick={(c) => setBg(c)}
          onSystemChange={(idx) => {
            setSystemIdx(idx)
            setFg(COLOR_SYSTEMS[idx].fg)
            setBg(COLOR_SYSTEMS[idx].bg)
          }}
        />
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
