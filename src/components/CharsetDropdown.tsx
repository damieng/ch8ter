import { useState, useRef } from 'preact/hooks'
import { ChevronDown, Type } from 'lucide-preact'
import { charset } from '../store'
import type { Charset } from '../store'
import { useClickOutside } from '../hooks/useClickOutside'

const ICON = 16

const OPTIONS: { value: Charset; label: string }[] = [
  { value: 'zx', label: 'ZX Spectrum' },
  { value: 'ascii', label: 'ASCII' },
]

export function CharsetDropdown() {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useClickOutside(ref, () => setOpen(false))

  const current = OPTIONS.find(o => o.value === charset.value)!

  return (
    <div class="relative" ref={ref}>
      <button
        class="px-2 py-1 bg-white hover:bg-blue-50 rounded border border-gray-300 font-medium flex items-center gap-1"
        onClick={() => setOpen(!open)}
      >
        <Type size={ICON} />
        {current.label}
        <ChevronDown size={14} />
      </button>
      {open && (
        <div class="absolute top-full left-0 mt-1 bg-white border border-gray-300 rounded shadow-lg z-50 py-1 w-40">
          {OPTIONS.map(opt => (
            <button
              key={opt.value}
              class={`flex items-center gap-2 w-full px-3 py-1.5 text-left hover:bg-blue-50 rounded ${
                charset.value === opt.value ? 'font-bold' : ''
              }`}
              onClick={() => { charset.value = opt.value; setOpen(false) }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
