import { useState, useRef } from 'preact/hooks'
import { ChevronDown, MousePointer } from 'lucide-preact'
import {
  type FontInstance,
  selectAll, selectNumbers, selectUppercase, selectLowercase, selectSymbols, invertSelection
} from '../store'
import { useClickOutside } from '../hooks/useClickOutside'

const ICON = 16

export function SelectDropdown({ font }: { font: FontInstance }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useClickOutside(ref, () => setOpen(false))

  function item(label: string, fn: () => void, shortcut?: string) {
    return (
      <button
        class="flex items-center w-full px-3 py-1.5 text-left hover:bg-blue-50 rounded"
        onClick={() => { fn(); setOpen(false) }}
      >
        {label}
        {shortcut && <span class="ml-auto text-xs text-gray-400 pl-4">{shortcut}</span>}
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
          {item('All', () => selectAll(font), 'Ctrl+A')}
          {item('Numbers 0-9', () => selectNumbers(font))}
          {item('Uppercase A-Z', () => selectUppercase(font))}
          {item('Lowercase a-z', () => selectLowercase(font))}
          {item('Symbols', () => selectSymbols(font))}
          <div class="border-t border-gray-200 my-1" />
          {item('Invert Selection', () => invertSelection(font))}
        </div>
      )}
    </div>
  )
}
