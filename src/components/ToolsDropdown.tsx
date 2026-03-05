import { useState, useRef, useEffect } from 'preact/hooks'
import {
  FlipHorizontal, FlipVertical, Contrast, RotateCw,
  ArrowUp, ArrowDown, ArrowLeft, ArrowRight, Wrench, ChevronDown
} from 'lucide-preact'
import {
  selFlipX, selFlipY, selInvert, selRotateCW,
  selShiftUp, selShiftDown, selShiftLeft, selShiftRight,
  selectedGlyphs
} from '../store'

const ICON = 16

export function ToolsDropdown() {
  const [open, setOpen] = useState(false)
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

  const selCount = selectedGlyphs.value.size

  function item(label: string, icon: any, fn: () => void) {
    return (
      <button
        class="flex items-center gap-2 w-full px-3 py-1.5 text-left hover:bg-blue-50 rounded"
        onClick={() => { fn(); setOpen(false) }}
      >
        {icon}
        {label}
      </button>
    )
  }

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

  return (
    <div class="relative" ref={ref}>
      <button
        class="px-2 py-1 bg-white hover:bg-blue-50 rounded border border-gray-300 font-medium flex items-center gap-1"
        onClick={() => setOpen(!open)}
      >
        <Wrench size={ICON} />
        Tools ({selCount})
        <ChevronDown size={14} />
      </button>
      {open && (
        <div class="absolute top-full left-0 mt-1 bg-white border border-gray-300 rounded shadow-lg z-50 py-1 w-48">
          {item('Flip X', <FlipHorizontal size={ICON} />, selFlipX)}
          {item('Flip Y', <FlipVertical size={ICON} />, selFlipY)}
          {item('Invert', <Contrast size={ICON} />, selInvert)}
          {item('Rotate CW', <RotateCw size={ICON} />, selRotateCW)}
          <div class="border-t border-gray-200 my-1" />
          <div class="flex items-center gap-0 px-2 py-1">
            {iconBtn(<ArrowUp size={ICON} />, 'Up', selShiftUp)}
            {iconBtn(<ArrowDown size={ICON} />, 'Down', selShiftDown)}
            {iconBtn(<ArrowLeft size={ICON} />, 'Left', selShiftLeft)}
            {iconBtn(<ArrowRight size={ICON} />, 'Right', selShiftRight)}
          </div>
        </div>
      )}
    </div>
  )
}
