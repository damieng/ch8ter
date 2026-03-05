import type preact from 'preact'
import { createPortal } from 'preact/compat'
import { useState, useRef, useEffect, useMemo, useCallback } from 'preact/hooks'
import { ZoomIn, Type } from 'lucide-preact'
import { type FontInstance, fonts, storedPreviews, updatePreviewSettings } from '../store'
import { sampleTexts } from '../sampleTexts'

interface ColorSystem {
  name: string
  fg: string
  bg: string
  palette?: string[] // if provided, show swatches (up to 128)
}

const SYSTEMS: ColorSystem[] = [
  {
    name: 'Acorn BBC Micro',
    fg: '#ffffff', bg: '#000000',
    palette: [
      '#000000', '#ff0000', '#00ff00', '#ffff00',
      '#0000ff', '#ff00ff', '#00ffff', '#ffffff',
    ],
  },
  {
    name: 'Amstrad CPC',
    fg: '#ffff00', bg: '#000080',
    palette: [
      '#000000', '#000080', '#0000ff', '#800000',
      '#800080', '#8000ff', '#ff0000', '#ff0080',
      '#ff00ff', '#008000', '#008080', '#0080ff',
      '#808000', '#808080', '#8080ff', '#ff8000',
      '#ff8080', '#ff80ff', '#00ff00', '#00ff80',
      '#00ffff', '#80ff00', '#80ff80', '#80ffff',
      '#ffff00', '#ffff80', '#ffffff',
    ],
  },
  {
    name: 'Apple II',
    fg: '#33ff33', bg: '#000000',
    palette: [
      '#000000', '#dd0033', '#000099', '#dd22dd',
      '#007722', '#555555', '#2222ff', '#6699ff',
      '#885500', '#ff6600', '#aaaaaa', '#ff9988',
      '#11dd00', '#ffff00', '#44ff99', '#ffffff',
    ],
  },
  {
    name: 'Atari 8-bit (NTSC)',
    fg: '#c5a3ff', bg: '#3311cc',
    palette: [
      // 16 hues × 8 luminances (GTIA NTSC)
      '#000000', '#1a1a1a', '#393939', '#5b5b5b', '#7e7e7e', '#a2a2a2', '#c7c7c7', '#ededed',
      '#190000', '#3a1300', '#5c3200', '#7e5400', '#a17700', '#c59b00', '#eac000', '#ffe600',
      '#2b0000', '#4c0000', '#6e1100', '#903300', '#b35600', '#d77a00', '#fc9f17', '#ffc53c',
      '#350000', '#560000', '#780000', '#9a1100', '#bd3400', '#e15800', '#ff7d21', '#ffa346',
      '#350006', '#56000e', '#780024', '#9a0040', '#bd1063', '#e13487', '#ff59ac', '#ff7fd1',
      '#2b0032', '#4c0050', '#6e006f', '#90008e', '#b31aae', '#d73ed0', '#fc63f0', '#ff89ff',
      '#190054', '#3a0072', '#5c0091', '#7e11b0', '#a134ce', '#c558ec', '#ea7dff', '#ffa3ff',
      '#06006a', '#270088', '#4900a7', '#6b11c6', '#8e34e4', '#b258ff', '#d77dff', '#fca3ff',
      '#000070', '#00008e', '#1100ad', '#3311cc', '#5634ea', '#7a58ff', '#9f7dff', '#c5a3ff',
      '#000064', '#000082', '#0011a1', '#1133c0', '#3456de', '#587afc', '#7d9fff', '#a3c5ff',
      '#00004a', '#000e68', '#003287', '#0054a6', '#1077c4', '#349be2', '#59c0ff', '#7fe6ff',
      '#000826', '#002244', '#004163', '#006382', '#0086a1', '#1eaac0', '#43cfde', '#68f4fc',
      '#001000', '#002a18', '#004937', '#006b56', '#008e75', '#22b294', '#47d7b3', '#6cfcd2',
      '#001c00', '#003600', '#005500', '#007700', '#1a9a00', '#3ebe10', '#63e335', '#88ff5a',
      '#002000', '#003a00', '#005900', '#0e7b00', '#319e00', '#55c200', '#7ae700', '#a0ff24',
      '#001800', '#003200', '#0c5100', '#2e7300', '#519600', '#75ba00', '#9adf00', '#c0ff1a',
    ],
  },
  {
    name: 'Atari 8-bit (PAL)',
    fg: '#a3c5ff', bg: '#1133c0',
    palette: [
      // 16 hues × 8 luminances (GTIA PAL)
      '#000000', '#1a1a1a', '#393939', '#5b5b5b', '#7e7e7e', '#a2a2a2', '#c7c7c7', '#ededed',
      '#001800', '#003200', '#0c5100', '#2e7300', '#519600', '#75ba00', '#9adf00', '#c0ff1a',
      '#002a00', '#004b00', '#006a00', '#0e8c00', '#31af00', '#55d300', '#7af817', '#a0ff3c',
      '#001c00', '#003600', '#005500', '#007700', '#1a9a00', '#3ebe10', '#63e335', '#88ff5a',
      '#001000', '#002a18', '#004937', '#006b56', '#008e75', '#22b294', '#47d7b3', '#6cfcd2',
      '#000826', '#002244', '#004163', '#006382', '#0086a1', '#1eaac0', '#43cfde', '#68f4fc',
      '#00004a', '#000e68', '#003287', '#0054a6', '#1077c4', '#349be2', '#59c0ff', '#7fe6ff',
      '#000064', '#000082', '#0011a1', '#1133c0', '#3456de', '#587afc', '#7d9fff', '#a3c5ff',
      '#000070', '#00008e', '#1100ad', '#3311cc', '#5634ea', '#7a58ff', '#9f7dff', '#c5a3ff',
      '#06006a', '#270088', '#4900a7', '#6b11c6', '#8e34e4', '#b258ff', '#d77dff', '#fca3ff',
      '#190054', '#3a0072', '#5c0091', '#7e11b0', '#a134ce', '#c558ec', '#ea7dff', '#ffa3ff',
      '#2b0032', '#4c0050', '#6e006f', '#90008e', '#b31aae', '#d73ed0', '#fc63f0', '#ff89ff',
      '#350006', '#56000e', '#780024', '#9a0040', '#bd1063', '#e13487', '#ff59ac', '#ff7fd1',
      '#350000', '#560000', '#780000', '#9a1100', '#bd3400', '#e15800', '#ff7d21', '#ffa346',
      '#2b0000', '#4c0000', '#6e1100', '#903300', '#b35600', '#d77a00', '#fc9f17', '#ffc53c',
      '#190000', '#3a1300', '#5c3200', '#7e5400', '#a17700', '#c59b00', '#eac000', '#ffe600',
    ],
  },
  {
    name: 'Commodore 64',
    fg: '#7b71d5', bg: '#3a34a2',
    palette: [
      '#000000', '#ffffff', '#880000', '#aaffee',
      '#cc44cc', '#00cc55', '#0000aa', '#eeee77',
      '#dd8855', '#664400', '#ff7777', '#333333',
      '#777777', '#aaff66', '#0088ff', '#bbbbbb',
    ],
  },
  {
    name: 'Commodore VIC-20',
    fg: '#ffffff', bg: '#000000',
    palette: [
      '#000000', '#ffffff', '#782922', '#87d6dd',
      '#aa5fb6', '#55a049', '#40318d', '#bfce72',
      '#aa7449', '#eab489', '#b86962', '#c7ffff',
      '#eaa7f6', '#94e089', '#8071cc', '#ffffb2',
    ],
  },
  {
    name: 'MSX (TMS9918)',
    fg: '#ffffff', bg: '#3a34a2',
    palette: [
      '#000000', '#000000', '#3eb849', '#74d07d',
      '#5955e0', '#8076f1', '#b95e51', '#65dbef',
      '#db6559', '#ff897d', '#ccc35e', '#ded087',
      '#3aa241', '#b766b5', '#cccccc', '#ffffff',
    ],
  },
  {
    name: 'SAM Coupé',
    fg: '#ffffff', bg: '#000049',
    palette: (() => {
      // 128 colors: BRIGHT bit + 2 bits each R, G, B
      // Normal levels: 0, 73, 146, 255. Bright adds 36 (capped at 255)
      const norm = [0, 73, 146, 255]
      const colors: string[] = []
      for (const bright of [0, 36]) {
        for (let r = 0; r < 4; r++) {
          for (let g = 0; g < 4; g++) {
            for (let b = 0; b < 4; b++) {
              const rv = Math.min(255, norm[r] + bright)
              const gv = Math.min(255, norm[g] + bright)
              const bv = Math.min(255, norm[b] + bright)
              colors.push(`#${rv.toString(16).padStart(2, '0')}${gv.toString(16).padStart(2, '0')}${bv.toString(16).padStart(2, '0')}`)
            }
          }
        }
      }
      return colors
    })(),
  },
  {
    name: 'Sinclair QL',
    fg: '#00ff00', bg: '#000000',
    palette: [
      '#000000', '#ff0000', '#00ff00', '#ffff00',
      '#0000ff', '#ff00ff', '#00ffff', '#ffffff',
    ],
  },
  {
    name: 'ZX Spectrum',
    fg: '#000000', bg: '#ffffff',
    palette: [
      '#000000', '#0000c0', '#c00000', '#c000c0',
      '#00c000', '#00c0c0', '#c0c000', '#c0c0c0',
      '#000000', '#0000ff', '#ff0000', '#ff00ff',
      '#00ff00', '#00ffff', '#ffff00', '#ffffff',
    ],
  },
  {
    name: 'Custom',
    fg: '#000000', bg: '#ffffff',
    // No palette — uses native color picker
  },
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

// Wrap text proportionally: wraps based on pixel width rather than character count.
// charWidth returns the pixel advance for a character (including gap).
function wrapTextProportional(
  text: string,
  maxWidth: number,
  charWidth: (ch: string) => number,
): { lines: string[]; offsets: number[][] } {
  const lines: string[] = []
  const offsets: number[][] = []
  let pos = 0
  for (const paragraph of text.split('\n')) {
    if (paragraph.length === 0) {
      lines.push('')
      offsets.push([])
      pos += 1
      continue
    }
    let line = ''
    let lineOffsets: number[] = []
    let lineWidth = 0
    let wordStart = pos
    for (const word of paragraph.split(' ')) {
      // Measure word width
      let wordWidth = 0
      for (let i = 0; i < word.length; i++) wordWidth += charWidth(word[i])
      const spaceWidth = charWidth(' ')

      if (line.length === 0) {
        line = word
        lineOffsets = []
        lineWidth = wordWidth
        for (let i = 0; i < word.length; i++) lineOffsets.push(wordStart + i)
      } else if (lineWidth + spaceWidth + wordWidth <= maxWidth) {
        lineOffsets.push(wordStart - 1) // the space
        line += ' ' + word
        lineWidth += spaceWidth + wordWidth
        for (let i = 0; i < word.length; i++) lineOffsets.push(wordStart + i)
      } else {
        lines.push(line)
        offsets.push(lineOffsets)
        line = word
        lineOffsets = []
        lineWidth = wordWidth
        for (let i = 0; i < word.length; i++) lineOffsets.push(wordStart + i)
      }
      wordStart += word.length + 1
    }
    if (line.length > 0) {
      lines.push(line)
      offsets.push(lineOffsets)
    }
    pos += paragraph.length + 1
  }
  return { lines, offsets }
}

// For a glyph, find leftmost and rightmost pixel columns (0-7). Returns [left, width].
// If blank, returns [0, 0].
function glyphBounds(data: Uint8Array, glyphIdx: number): { left: number; width: number } {
  const offset = glyphIdx * 8
  let minX = 8, maxX = -1
  for (let y = 0; y < 8; y++) {
    const byte = data[offset + y]
    for (let x = 0; x < 8; x++) {
      if (byte & (0x80 >> x)) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
      }
    }
  }
  if (maxX < 0) return { left: 0, width: 0 }
  return { left: minX, width: maxX - minX + 1 }
}

// Compute proportional char advance in pixels (NOT scaled — raw pixel width + gap)
function propCharAdvance(
  ch: string, data: Uint8Array, start: number, gc: number, eWidth: number, gap: number,
): number {
  if (ch === ' ') return eWidth + gap
  const glyphIdx = ch.charCodeAt(0) - start
  if (glyphIdx >= 0 && glyphIdx < gc) {
    return (glyphBounds(data, glyphIdx).width || 1) + gap
  }
  return 1 + gap
}

function renderText(
  canvas: HTMLCanvasElement,
  font: FontInstance,
  lines: string[],
  scale: number,
  cols: number,
  fg: string,
  bg: string,
  cursorPos: { row: number; col: number } | null,
  showCursor: boolean,
  selected: Set<string>,
  proportional: boolean,
  lineHeight: number, // raw pixels per row (4–10), glyph centered vertically
) {
  const ctx = canvas.getContext('2d')!
  const data = font.fontData.value
  const start = font.startChar.value
  const gc = data.length / 8
  const cellW = 8 * scale
  const rowH = lineHeight * scale
  const glyphYOff = Math.floor((lineHeight - 8) / 2) * scale // vertical centering offset

  // Ensure at least 1 row for empty text
  const rowCount = Math.max(1, lines.length)

  // Helper: draw a single glyph at pixel position, clipped to row bounds
  function drawGlyph(glyphIdx: number, gx: number, rowY: number) {
    const byteOffset = glyphIdx * 8
    for (let y = 0; y < 8; y++) {
      const py = rowY + glyphYOff + y * scale
      if (py + scale <= rowY || py >= rowY + rowH) continue // clipped
      const byte = data[byteOffset + y]
      for (let x = 0; x < 8; x++) {
        if (byte & (0x80 >> x)) {
          ctx.fillRect(gx + x * scale, py, scale, scale)
        }
      }
    }
  }

  // Helper: draw a proportional glyph shifted left
  function drawGlyphProp(glyphIdx: number, gx: number, rowY: number, boundsLeft: number, charW: number) {
    const byteOffset = glyphIdx * 8
    for (let y = 0; y < 8; y++) {
      const py = rowY + glyphYOff + y * scale
      if (py + scale <= rowY || py >= rowY + rowH) continue
      const byte = data[byteOffset + y]
      for (let x = 0; x < 8; x++) {
        if (byte & (0x80 >> x)) {
          const px = (x - boundsLeft) * scale
          if (px >= 0 && px < charW) {
            ctx.fillRect(gx + px, py, scale, scale)
          }
        }
      }
    }
  }

  if (!proportional) {
    const newW = cols * cellW
    const newH = rowCount * rowH
    if (canvas.width !== newW) canvas.width = newW
    if (canvas.height !== newH) canvas.height = newH

    ctx.fillStyle = bg
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    for (let row = 0; row < lines.length; row++) {
      const line = lines[row]
      const oy = row * rowH
      for (let col = 0; col < line.length; col++) {
        const isSel = selected.has(`${row},${col}`)
        const ox = col * cellW

        if (isSel) {
          ctx.fillStyle = fg
          ctx.fillRect(ox, oy, cellW, rowH)
          ctx.fillStyle = bg
        } else {
          ctx.fillStyle = fg
        }

        const glyphIdx = line.charCodeAt(col) - start
        if (glyphIdx < 0 || glyphIdx >= gc) continue
        drawGlyph(glyphIdx, ox, oy)
      }
    }

    if (cursorPos && showCursor && selected.size === 0) {
      ctx.fillStyle = fg
      ctx.fillRect(cursorPos.col * cellW, cursorPos.row * rowH, scale, rowH)
    }
  } else {
    const eIdx = 'e'.charCodeAt(0) - start
    const eWidth = (eIdx >= 0 && eIdx < gc) ? (glyphBounds(data, eIdx).width || 4) : 4
    const gap = 1
    function adv(ch: string) { return propCharAdvance(ch, data, start, gc, eWidth, gap) }

    let maxLineWidth = 0
    for (const line of lines) {
      let w = 0
      for (let i = 0; i < line.length; i++) w += adv(line[i]) * scale
      if (w > maxLineWidth) maxLineWidth = w
    }

    const newW = Math.max(maxLineWidth, cols * cellW)
    const newH = rowCount * rowH
    if (canvas.width !== newW) canvas.width = newW
    if (canvas.height !== newH) canvas.height = newH

    ctx.fillStyle = bg
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    for (let row = 0; row < lines.length; row++) {
      let xPos = 0
      const oy = row * rowH
      for (let col = 0; col < lines[row].length; col++) {
        const ch = lines[row][col]
        const charCode = ch.charCodeAt(0)
        const glyphIdx = charCode - start
        const isSel = selected.has(`${row},${col}`)
        const advance = adv(ch) * scale

        if (charCode === 32) {
          if (isSel) {
            ctx.fillStyle = fg
            ctx.fillRect(xPos, oy, advance, rowH)
          }
          xPos += advance
          continue
        }

        if (glyphIdx < 0 || glyphIdx >= gc) {
          xPos += advance
          continue
        }

        const bounds = glyphBounds(data, glyphIdx)
        const charW = (bounds.width || 1) * scale

        if (isSel) {
          ctx.fillStyle = fg
          ctx.fillRect(xPos, oy, advance, rowH)
          ctx.fillStyle = bg
        } else {
          ctx.fillStyle = fg
        }

        drawGlyphProp(glyphIdx, xPos, oy, bounds.left, charW)
        xPos += advance
      }

      if (cursorPos && showCursor && selected.size === 0 && cursorPos.row === row && cursorPos.col === lines[row].length) {
        ctx.fillStyle = fg
        ctx.fillRect(xPos, oy, scale, rowH)
      }
    }

    if (cursorPos && showCursor && selected.size === 0) {
      const row = cursorPos.row
      if (row < lines.length && cursorPos.col < lines[row].length) {
        let xPos = 0
        for (let col = 0; col < cursorPos.col; col++) {
          xPos += adv(lines[row][col]) * scale
        }
        ctx.fillStyle = fg
        ctx.fillRect(xPos, row * rowH, scale, rowH)
      }
    }
  }
}

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
  const initSysIdx = stored?.systemIdx ?? SYSTEMS.findIndex(s => s.name === 'ZX Spectrum')
  const [systemIdx, setSystemIdx] = useState(initSysIdx >= 0 ? initSysIdx : 0)
  const [fg, setFg] = useState(stored?.fg ?? SYSTEMS[initSysIdx >= 0 ? initSysIdx : 0].fg)
  const [bg, setBg] = useState(stored?.bg ?? SYSTEMS[initSysIdx >= 0 ? initSysIdx : 0].bg)
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
  const system = SYSTEMS[systemIdx]

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

  // Persist preview settings
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

  // Compute wrapping (proportional uses pixel-width wrapping, fixed uses char-count)
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
    const maxPixelWidth = cols * 8 // wrap at same pixel width as fixed-width would use
    return wrapTextProportional(text, maxPixelWidth, (ch) =>
      data ? propCharAdvance(ch, data, start, gc, eWidth, gap) : 8
    )
  }, [text, cols, proportional, font?.fontData.value, font?.startChar.value])

  const { lines: wrappedLines, offsets } = wrapResult
  const cursorPos = focused ? cursorPosition(offsets, selStart, text.length) : null
  const selected = focused ? selectedCells(offsets, selStart, selEnd) : new Set<string>()

  useEffect(() => {
    if (canvasRef.current && font) {
      renderText(canvasRef.current, font, wrappedLines, zoom, cols, fg, bg, cursorPos, cursorVisible, selected, proportional, lineHeight)
    }
  }, [font?.fontData.value, font?.id, text, zoom, cols, fg, bg, cursorPos?.row, cursorPos?.col, cursorVisible, selStart, selEnd, selTick, proportional, lineHeight])

  // Convert canvas pixel coordinates to a text offset
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
      // Proportional: walk char advances to find which column the click lands in
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
      // Past end of line
      if (offsets[row]?.length > 0) {
        return offsets[row][offsets[row].length - 1] + 1
      }
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
      const t = e.target as Node
      if (zoomRef.current && !zoomRef.current.contains(t)) setZoomOpen(false)
      if (fgRef.current && !fgRef.current.contains(t) && !(fgPopupRef.current && fgPopupRef.current.contains(t))) setFgPickerOpen(false)
      if (bgRef.current && !bgRef.current.contains(t) && !(bgPopupRef.current && bgPopupRef.current.contains(t))) setBgPickerOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  function handleTextareaInput() {
    if (textareaRef.current) {
      setText(textareaRef.current.value)
      resetBlink()
      setSelTick(t => t + 1)
    }
  }

  // Re-render on cursor/selection movement
  function handleSelectionChange() {
    setSelTick(t => t + 1)
    resetBlink()
  }

  // Use selectionchange for reliable cursor tracking (arrow keys, home/end, etc.)
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
            setFg(SYSTEMS[idx].fg)
            setBg(SYSTEMS[idx].bg)
          }}
        >
          {SYSTEMS.map((s, i) => (
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
          <Type size={14} />
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
        {/* Hidden textarea for keyboard input */}
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
