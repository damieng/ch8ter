import {
  FlipHorizontal, FlipVertical, Contrast, RotateCw, RotateCcw,
  ArrowUp, ArrowDown, ArrowLeft, ArrowRight, AlignCenterHorizontal,
  Save
} from 'lucide-preact'
import {
  type FontInstance,
  activeFlipX, activeFlipY, activeInvert, activeRotateCW, activeRotateCCW,
  activeShiftUp, activeShiftDown, activeShiftLeft, activeShiftRight, activeCenterH,
  saveFont
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

export function SaveBar({ font }: { font: FontInstance }) {
  function handleSave() {
    const data = saveFont(font)
    const blob = new Blob([data.buffer as ArrayBuffer], { type: 'application/octet-stream' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = font.fileName.value
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div class="flex items-center gap-1">
      <IconBtn onClick={handleSave} title="Save .ch8"><Save size={ICON} /></IconBtn>
    </div>
  )
}

export function Toolbar({ font }: { font: FontInstance }) {
  return (
    <div class="flex flex-wrap gap-1">
      <IconBtn onClick={() => activeFlipX(font)} title="Flip X"><FlipHorizontal size={ICON} /></IconBtn>
      <IconBtn onClick={() => activeFlipY(font)} title="Flip Y"><FlipVertical size={ICON} /></IconBtn>
      <IconBtn onClick={() => activeInvert(font)} title="Invert"><Contrast size={ICON} /></IconBtn>
      <IconBtn onClick={() => activeRotateCW(font)} title="Rotate CW"><RotateCw size={ICON} /></IconBtn>
      <IconBtn onClick={() => activeRotateCCW(font)} title="Rotate CCW"><RotateCcw size={ICON} /></IconBtn>
      <IconBtn onClick={() => activeShiftUp(font)} title="Shift up"><ArrowUp size={ICON} /></IconBtn>
      <IconBtn onClick={() => activeShiftDown(font)} title="Shift down"><ArrowDown size={ICON} /></IconBtn>
      <IconBtn onClick={() => activeShiftLeft(font)} title="Shift left"><ArrowLeft size={ICON} /></IconBtn>
      <IconBtn onClick={() => activeShiftRight(font)} title="Shift right"><ArrowRight size={ICON} /></IconBtn>
      <IconBtn onClick={() => activeCenterH(font)} title="Center horizontal"><AlignCenterHorizontal size={ICON} /></IconBtn>
    </div>
  )
}
