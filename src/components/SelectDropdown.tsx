import { useState, useRef, useEffect } from 'preact/hooks'
import { ChevronDown, MousePointer } from 'lucide-preact'
import {
  type FontInstance,
  selectNumbers, selectUppercase, selectLowercase, selectSymbols
} from '../store'

const ICON = 16

export function SelectDropdown({ font }: { font: FontInstance }) {
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

  function item(label: string, fn: () => void) {
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
        <MousePointer size={ICON} />
        Select
        <ChevronDown size={14} />
      </button>
      {open && (
        <div class="absolute top-full left-0 mt-1 bg-white border border-gray-300 rounded shadow-lg z-50 py-1 w-40">
          {item('Numbers 0-9', () => selectNumbers(font))}
          {item('Uppercase A-Z', () => selectUppercase(font))}
          {item('Lowercase a-z', () => selectLowercase(font))}
          {item('Symbols', () => selectSymbols(font))}
        </div>
      )}
    </div>
  )
}
