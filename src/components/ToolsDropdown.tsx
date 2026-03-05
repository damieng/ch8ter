import { useState, useRef, useEffect } from 'preact/hooks'
import {
  FlipHorizontal, FlipVertical, Contrast, RotateCw, RotateCcw,
  ArrowUp, ArrowDown, ArrowLeft, ArrowRight, Wrench, ChevronDown
} from 'lucide-preact'
import {
  type FontInstance,
  selFlipX, selFlipY, selInvert, selRotateCW, selRotateCCW,
  selShiftUp, selShiftDown, selShiftLeft, selShiftRight,
  copyUpperToLower, copyLowerToUpper, createBoldVariant
} from '../store'
import { ObliqueDialog } from './ObliqueDialog'

const ICON = 16

export function ToolsDropdown({ font }: { font: FontInstance }) {
  const [open, setOpen] = useState(false)
  const [obliqueOpen, setObliqueOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  function iconBtn(icon: any, title: string, fn: () => void) {
    return (
      <button
        class="p-1.5 hover:bg-blue-50 rounded flex items-center justify-center"
        onClick={() => { fn(); setOpen(false) }}
        title={title}
      >
        {icon}
      </button>
    )
  }

  function menuItem(label: string, fn: () => void) {
    return (
      <button
        class="flex items-center gap-2 w-full px-3 py-1.5 text-left hover:bg-blue-50 rounded"
        onClick={() => { fn(); setOpen(false) }}
      >
        {label}
      </button>
    )
  }

  return (
    <div class="relative" ref={ref}>
      <button
        class="px-2 py-1 bg-white hover:bg-blue-50 rounded border border-gray-300 font-medium flex items-center gap-1"
        onClick={() => setOpen(!open)}
      >
        <Wrench size={ICON} />
        Tools
        <ChevronDown size={14} />
      </button>
      {open && (
        <div class="absolute top-full left-0 mt-1 bg-white border border-gray-300 rounded shadow-lg z-50 py-1 w-auto">
          <div class="flex items-center gap-0 px-2 py-1">
            {iconBtn(<FlipHorizontal size={ICON} />, 'Flip X', () => selFlipX(font))}
            {iconBtn(<FlipVertical size={ICON} />, 'Flip Y', () => selFlipY(font))}
            {iconBtn(<Contrast size={ICON} />, 'Invert', () => selInvert(font))}
            {iconBtn(<RotateCw size={ICON} />, 'Rotate CW', () => selRotateCW(font))}
            {iconBtn(<RotateCcw size={ICON} />, 'Rotate CCW', () => selRotateCCW(font))}
          </div>
          <div class="flex items-center gap-0 px-2 py-1">
            {iconBtn(<ArrowUp size={ICON} />, 'Shift up', () => selShiftUp(font))}
            {iconBtn(<ArrowDown size={ICON} />, 'Shift down', () => selShiftDown(font))}
            {iconBtn(<ArrowLeft size={ICON} />, 'Shift left', () => selShiftLeft(font))}
            {iconBtn(<ArrowRight size={ICON} />, 'Shift right', () => selShiftRight(font))}
          </div>
          <div class="border-t border-gray-200 my-1" />
          {menuItem('Copy Upper to Lower', () => copyUpperToLower(font))}
          {menuItem('Copy Lower to Upper', () => copyLowerToUpper(font))}
          <div class="border-t border-gray-200 my-1" />
          {menuItem('Create Bold', () => createBoldVariant(font))}
          {menuItem('Create Oblique...', () => setObliqueOpen(true))}
        </div>
      )}
      {obliqueOpen && (
        <ObliqueDialog font={font} onClose={() => setObliqueOpen(false)} />
      )}
    </div>
  )
}
