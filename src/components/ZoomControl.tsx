import { useState, useRef } from 'preact/hooks'
import { ZoomIn } from 'lucide-preact'
import { useClickOutside } from '../hooks/useClickOutside'

interface Props {
  value: number
  onChange: (v: number) => void
  min?: number
  max?: number
}

export function ZoomControl({ value, onChange, min = 1, max = 10 }: Props) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useClickOutside(ref, () => setOpen(false))

  return (
    <div class="relative" ref={ref}>
      <button
        class="px-2 py-1 bg-white hover:bg-blue-50 rounded border border-gray-300 font-medium flex items-center gap-1 text-xs"
        onClick={() => setOpen(!open)}
      >
        <ZoomIn size={14} />
        {value * 100}%
      </button>
      {open && (
        <div class="absolute top-full right-0 mt-1 bg-white border border-gray-300 rounded shadow-lg z-50 py-2 px-3 flex items-center gap-2">
          <input
            type="range"
            min={min}
            max={max}
            value={value}
            onInput={(e) => onChange(parseInt((e.target as HTMLInputElement).value))}
            class="w-40"
          />
          <span class="text-sm whitespace-nowrap">{value * 100}%</span>
        </div>
      )}
    </div>
  )
}
