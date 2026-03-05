import { useState, useRef, useEffect, useMemo, useCallback } from 'preact/hooks'
import { ChevronDown, ZoomIn } from 'lucide-preact'
import { type FontInstance, fonts } from '../store'
import { sampleTexts } from '../sampleTexts'

const COLOR_SCHEMES = [
  { name: 'ZX Spectrum', fg: '#c8d0dc', bg: '#1e293b' },
  { name: 'Green screen', fg: '#33ff33', bg: '#0a1a0a' },
  { name: 'Amber', fg: '#ffb000', bg: '#1a0e00' },
  { name: 'White on blue', fg: '#ffffff', bg: '#0000aa' },
  { name: 'Paper', fg: '#1a1a1a', bg: '#e8e0d0' },
  { name: 'C64', fg: '#7b71d5', bg: '#3a34a2' },
  { name: 'Apple II', fg: '#33ff33', bg: '#000000' },
  { name: 'BBC Micro', fg: '#ffffff', bg: '#000000' },
  { name: 'Teletext', fg: '#ffffff', bg: '#000080' },
  { name: 'CPC', fg: '#ffff00', bg: '#000080' },
  { name: 'TRS-80', fg: '#00ff00', bg: '#000000' },
  { name: 'Atari ST', fg: '#000000', bg: '#ffffff' },
  { name: 'MSX', fg: '#ffffff', bg: '#3a34a2' },
  { name: 'VT100', fg: '#00ff00', bg: '#1a1a1a' },
  { name: 'Minitel', fg: '#ffffff', bg: '#333333' },
  { name: 'QL', fg: '#00ff00', bg: '#000000' },
]

// Wrap text into lines, returning wrapped lines and a mapping from
// each wrapped-line character back to an offset in the original string.
function wrapText(text: string, cols: number): { lines: string[]; offsets: number[][] } {
  const lines: string[] = []
  const offsets: number[][] = []
  let pos = 0
  for (const paragraph of text.split('\n')) {
    if (paragraph.length <= cols) {
      lines.push(paragraph)
      const lineOffsets: number[] = []
      for (let i = 0; i < paragraph.length; i++) lineOffsets.push(pos + i)
      offsets.push(lineOffsets)
      pos += paragraph.length + 1 // +1 for \n
      continue
    }
    let line = ''
    let lineOffsets: number[] = []
    let wordStart = pos
    for (const word of paragraph.split(' ')) {
      if (line.length === 0) {
        line = word
        lineOffsets = []
        for (let i = 0; i < word.length; i++) lineOffsets.push(wordStart + i)
      } else if (line.length + 1 + word.length <= cols) {
        lineOffsets.push(wordStart - 1) // the space before the word
        line += ' ' + word
        for (let i = 0; i < word.length; i++) lineOffsets.push(wordStart + i)
      } else {
        lines.push(line)
        offsets.push(lineOffsets)
        line = word
        lineOffsets = []
        for (let i = 0; i < word.length; i++) lineOffsets.push(wordStart + i)
      }
      wordStart += word.length + 1 // +1 for space
    }
    if (line.length > 0) {
      lines.push(line)
      offsets.push(lineOffsets)
    }
    pos += paragraph.length + 1
  }
  return { lines, offsets }
}

// Find cursor row/col from text offset within wrapped lines
function cursorPosition(offsets: number[][], cursorOffset: number, textLen: number): { row: number; col: number } {
  // Cursor at end of text
  if (cursorOffset >= textLen) {
    const lastRow = offsets.length - 1
    if (lastRow < 0) return { row: 0, col: 0 }
    return { row: lastRow, col: offsets[lastRow].length }
  }
  for (let row = 0; row < offsets.length; row++) {
    for (let col = 0; col < offsets[row].length; col++) {
      if (offsets[row][col] === cursorOffset) return { row, col }
    }
  }
  // Cursor is on a \n — put it at end of the preceding line
  for (let row = offsets.length - 1; row >= 0; row--) {
    if (offsets[row].length > 0 && offsets[row][offsets[row].length - 1] < cursorOffset) {
      return { row, col: offsets[row].length }
    }
  }
  return { row: 0, col: 0 }
}

// Build a set of selected cell keys "row,col" from text selection range
function selectedCells(offsets: number[][], selStart: number, selEnd: number): Set<string> {
  const set = new Set<string>()
  if (selStart === selEnd) return set
  const lo = Math.min(selStart, selEnd)
  const hi = Math.max(selStart, selEnd)
  for (let row = 0; row < offsets.length; row++) {
    for (let col = 0; col < offsets[row].length; col++) {
      const o = offsets[row][col]
      if (o >= lo && o < hi) set.add(`${row},${col}`)
    }
  }
  return set
}

function renderText(
  canvas: HTMLCanvasElement,
  font: FontInstance,
  text: string,
  scale: number,
  cols: number,
  fg: string,
  bg: string,
  cursorPos: { row: number; col: number } | null,
  showCursor: boolean,
  selected: Set<string>,
) {
  const ctx = canvas.getContext('2d')!
  const data = font.fontData.value
  const start = font.startChar.value
  const gc = data.length / 8
  const cellSize = 8 * scale
  const { lines } = wrapText(text, cols)

  // Ensure at least 1 row for empty text
  const rowCount = Math.max(1, lines.length)
  canvas.width = cols * cellSize
  canvas.height = rowCount * cellSize

  ctx.fillStyle = bg
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  for (let row = 0; row < lines.length; row++) {
    const line = lines[row]
    for (let col = 0; col < line.length; col++) {
      const isSel = selected.has(`${row},${col}`)
      const ox = col * cellSize
      const oy = row * cellSize

      if (isSel) {
        // Selection: fill cell with fg, draw glyph in bg
        ctx.fillStyle = fg
        ctx.fillRect(ox, oy, cellSize, cellSize)
        ctx.fillStyle = bg
      } else {
        ctx.fillStyle = fg
      }

      const charCode = line.charCodeAt(col)
      const glyphIdx = charCode - start
      if (glyphIdx < 0 || glyphIdx >= gc) continue
      const offset = glyphIdx * 8
      for (let y = 0; y < 8; y++) {
        const byte = data[offset + y]
        for (let x = 0; x < 8; x++) {
          if (byte & (0x80 >> x)) {
            ctx.fillRect(ox + x * scale, oy + y * scale, scale, scale)
          }
        }
      }
    }
  }

  // Draw cursor (only when no selection)
  if (cursorPos && showCursor && selected.size === 0) {
    ctx.fillStyle = fg
    const cx = cursorPos.col * cellSize
    const cy = cursorPos.row * cellSize
    ctx.fillRect(cx, cy, scale, cellSize)
  }
}

interface Props {
  initialFontId: string
}

export function PreviewWindow({ initialFontId }: Props) {
  const [selectedFontId, setSelectedFontId] = useState(initialFontId)
  const [textKey, setTextKey] = useState('0-0')
  const [zoom, setZoom] = useState(2)
  const [zoomOpen, setZoomOpen] = useState(false)
  const [colorIdx, setColorIdx] = useState(0)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const zoomRef = useRef<HTMLDivElement>(null)
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

  const initialText = useMemo(() => {
    const [gi, ii] = textKey.split('-').map(Number)
    return sampleTexts[gi]?.items[ii]?.text ?? ''
  }, [textKey])

  const [text, setText] = useState(initialText)

  // When sample selection changes, replace text
  useEffect(() => {
    setText(initialText)
    if (textareaRef.current) {
      textareaRef.current.value = initialText
      textareaRef.current.selectionStart = 0
      textareaRef.current.selectionEnd = 0
    }
  }, [initialText])

  const scheme = COLOR_SCHEMES[colorIdx]
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

  // Blink cursor
  useEffect(() => {
    if (!focused) return
    setCursorVisible(true)
    const interval = setInterval(() => setCursorVisible(v => !v), 530)
    return () => clearInterval(interval)
  }, [focused])

  // Reset blink on typing
  const resetBlink = useCallback(() => {
    setCursorVisible(true)
  }, [])

  // Compute cursor position and selection
  const selStart = textareaRef.current?.selectionStart ?? 0
  const selEnd = textareaRef.current?.selectionEnd ?? 0
  const { offsets } = wrapText(text, cols)
  const cursorPos = focused ? cursorPosition(offsets, selStart, text.length) : null
  const selected = focused ? selectedCells(offsets, selStart, selEnd) : new Set<string>()

  useEffect(() => {
    if (canvasRef.current && font) {
      renderText(canvasRef.current, font, text, zoom, cols, scheme.fg, scheme.bg, cursorPos, cursorVisible, selected)
    }
  }, [font?.fontData.value, font?.id, text, zoom, cols, colorIdx, cursorPos?.row, cursorPos?.col, cursorVisible, selStart, selEnd, selTick])

  // Convert canvas pixel coordinates to a text offset
  function hitTest(clientX: number, clientY: number): number {
    if (!canvasRef.current) return 0
    const rect = canvasRef.current.getBoundingClientRect()
    const cellSize = 8 * zoom
    const clickCol = Math.floor((clientX - rect.left) / cellSize)
    const clickRow = Math.floor((clientY - rect.top) / cellSize)

    const { lines, offsets: wrappedOffsets } = wrapText(text, cols)
    const row = Math.max(0, Math.min(clickRow, lines.length - 1))
    if (lines.length === 0) return 0
    const col = Math.min(Math.max(0, clickCol), wrappedOffsets[row]?.length ?? 0)
    if (col < (wrappedOffsets[row]?.length ?? 0)) {
      return wrappedOffsets[row][col]
    } else if (wrappedOffsets[row]?.length > 0) {
      return wrappedOffsets[row][wrappedOffsets[row].length - 1] + 1
    }
    // Empty line
    let offset = text.length
    let lineCount = 0
    for (let i = 0; i <= text.length; i++) {
      if (lineCount === row) { offset = i; break }
      if (text[i] === '\n') lineCount++
    }
    return offset
  }

  // Find word boundaries around an offset
  function wordBounds(offset: number): [number, number] {
    const wordChars = /[a-zA-Z0-9_']/
    let start = offset, end = offset
    while (start > 0 && wordChars.test(text[start - 1])) start--
    while (end < text.length && wordChars.test(text[end])) end++
    // If we didn't find a word (clicked on space/punctuation), select that char
    if (start === end && offset < text.length) { end = offset + 1 }
    return [start, end]
  }

  function handleCanvasMouseDown(e: MouseEvent) {
    if (!textareaRef.current) return
    e.preventDefault()
    const ta = textareaRef.current
    const now = Date.now()
    const offset = hitTest(e.clientX, e.clientY)

    // Detect click count (double/triple)
    if (now - lastClickTime.current < 400) {
      clickCount.current++
    } else {
      clickCount.current = 1
    }
    lastClickTime.current = now

    if (clickCount.current >= 3) {
      // Triple-click: select all
      ta.selectionStart = 0
      ta.selectionEnd = text.length
      clickCount.current = 0
    } else if (clickCount.current === 2) {
      // Double-click: select word
      const [ws, we] = wordBounds(offset)
      ta.selectionStart = ws
      ta.selectionEnd = we
      dragAnchor.current = ws
    } else {
      // Single click: position cursor, start drag
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

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (zoomRef.current && !zoomRef.current.contains(e.target as Node)) {
        setZoomOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  function handleTextareaInput() {
    if (textareaRef.current) {
      setText(textareaRef.current.value)
      resetBlink()
    }
  }

  // Re-render on cursor/selection movement
  function handleSelectionChange() {
    setSelTick(t => t + 1)
    resetBlink()
  }

  function handleKeyUp() {
    if (textareaRef.current) {
      setText(textareaRef.current.value)
    }
    handleSelectionChange()
  }

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
          value={colorIdx}
          onChange={(e) => setColorIdx(parseInt((e.target as HTMLSelectElement).value))}
        >
          {COLOR_SCHEMES.map((c, i) => (
            <option key={i} value={i}>{c.name}</option>
          ))}
        </select>
        <div class="relative ml-auto" ref={zoomRef}>
          <button
            class="px-2 py-1 bg-white hover:bg-blue-50 rounded border border-gray-300 font-medium flex items-center gap-1 text-sm"
            onClick={() => setZoomOpen(!zoomOpen)}
          >
            <ZoomIn size={14} />
            {zoom * 100}%
            <ChevronDown size={12} />
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
        style={{ backgroundColor: scheme.bg }}
      >
        <canvas
          ref={canvasRef}
          class="block cursor-text"
          style={{ imageRendering: 'pixelated' }}
          onMouseDown={handleCanvasMouseDown}
        />
        {/* Hidden textarea for keyboard input */}
        <textarea
          ref={textareaRef}
          class="absolute opacity-0 pointer-events-none"
          style={{ top: 0, left: 0, width: 1, height: 1 }}
          onInput={handleTextareaInput}
          onKeyUp={handleKeyUp}
          onSelect={handleSelectionChange}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          value={text}
        />
      </div>
    </div>
  )
}
