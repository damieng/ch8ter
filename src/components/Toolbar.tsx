import {
  FlipHorizontal, FlipVertical, Contrast, RotateCw, RotateCcw,
  ArrowUp, ArrowDown, ArrowLeft, ArrowRight,
  FilePlus, FolderOpen, Save
} from 'lucide-preact'
import {
  activeFlipX, activeFlipY, activeInvert, activeRotateCW, activeRotateCCW,
  activeShiftUp, activeShiftDown, activeShiftLeft, activeShiftRight,
  loadFont, saveFont, startChar,
  fontData, glyphCount
} from '../store'

function IconBtn({ onClick, children, title }: { onClick: () => void; children: any; title?: string }) {
  return (
    <button
      class="p-1.5 bg-white hover:bg-blue-50 rounded border border-gray-300 flex items-center justify-center"
      onClick={onClick}
      title={title}
    >
      {children}
    </button>
  )
}

const ICON = 18

export function FileBar() {
  function handleLoad() {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.ch8,.bin'
    input.onchange = () => {
      const file = input.files?.[0]
      if (!file) return
      file.arrayBuffer().then(buf => {
        loadFont(buf)
      })
    }
    input.click()
  }

  function handleSave() {
    const data = saveFont()
    const blob = new Blob([data.buffer as ArrayBuffer], { type: 'application/octet-stream' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'font.ch8'
    a.click()
    URL.revokeObjectURL(url)
  }

  function handleNew() {
    const countStr = prompt('Number of glyphs (default 96):', '96')
    if (!countStr) return
    const count = parseInt(countStr, 10)
    if (isNaN(count) || count < 1) return
    const startStr = prompt('Start character code (default 32):', '32')
    if (startStr === null) return
    const start = parseInt(startStr, 10)
    if (isNaN(start) || start < 0) return
    startChar.value = start
    fontData.value = new Uint8Array(count * 8)
  }

  return (
    <div class="flex items-center gap-1">
      <IconBtn onClick={handleNew} title="New font"><FilePlus size={ICON} /></IconBtn>
      <IconBtn onClick={handleLoad} title="Load .ch8"><FolderOpen size={ICON} /></IconBtn>
      <IconBtn onClick={handleSave} title="Save .ch8"><Save size={ICON} /></IconBtn>
    </div>
  )
}

export function FontInfo() {
  const total = glyphCount.value
  return (
    <span>{total} glyphs, start char {startChar.value}</span>
  )
}

export function Toolbar() {
  return (
    <div class="flex flex-col gap-1">
      <div class="flex flex-wrap gap-1">
        <IconBtn onClick={activeFlipX} title="Flip X"><FlipHorizontal size={ICON} /></IconBtn>
        <IconBtn onClick={activeFlipY} title="Flip Y"><FlipVertical size={ICON} /></IconBtn>
        <IconBtn onClick={activeInvert} title="Invert"><Contrast size={ICON} /></IconBtn>
        <IconBtn onClick={activeRotateCW} title="Rotate CW"><RotateCw size={ICON} /></IconBtn>
        <IconBtn onClick={activeRotateCCW} title="Rotate CCW"><RotateCcw size={ICON} /></IconBtn>
      </div>
      <div class="flex flex-wrap gap-1">
        <IconBtn onClick={activeShiftUp} title="Shift up"><ArrowUp size={ICON} /></IconBtn>
        <IconBtn onClick={activeShiftDown} title="Shift down"><ArrowDown size={ICON} /></IconBtn>
        <IconBtn onClick={activeShiftLeft} title="Shift left"><ArrowLeft size={ICON} /></IconBtn>
        <IconBtn onClick={activeShiftRight} title="Shift right"><ArrowRight size={ICON} /></IconBtn>
      </div>
    </div>
  )
}
