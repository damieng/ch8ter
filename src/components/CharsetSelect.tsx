import { useState, useRef } from 'preact/hooks'
import { ChevronDown } from 'lucide-preact'
import { CHARSETS, type Charset } from '../store'
import { useClickOutside } from '../hooks/useClickOutside'

interface Props {
  value: Charset
  onChange: (v: Charset) => void
}

export function CharsetSelect({ value, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useClickOutside(ref, () => setOpen(false))

  const current = CHARSETS[value]

  return (
    <div class="relative" ref={ref}>
      <button
        class="px-2 py-1 bg-white hover:bg-blue-50 rounded border border-gray-300 font-medium flex items-center gap-1 text-xs"
        onClick={() => setOpen(!open)}
      >
        {current.label}
        <ChevronDown size={12} />
      </button>
      {open && (
        <div class="absolute top-full left-0 mt-1 bg-white border border-gray-300 rounded shadow-lg z-50 py-1 w-52 max-h-64 overflow-y-auto">
          {Object.entries(CHARSETS).sort((a, b) => a[1].label.localeCompare(b[1].label, undefined, { numeric: true })).map(([key, def]) => (
            <button
              key={key}
              class={`flex items-center gap-2 w-full px-3 py-1 text-left text-xs hover:bg-blue-50 ${
                value === key ? 'font-bold' : ''
              }`}
              onClick={() => { onChange(key as Charset); setOpen(false) }}
            >
              {def.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
