import { ChevronDown } from 'lucide-preact'
import { CHARSETS, type Charset } from '../store'
import { Dropdown } from './Dropdown'

interface Props {
  value: Charset
  onChange: (v: Charset) => void
}

export function CharsetSelect({ value, onChange }: Props) {
  const current = CHARSETS[value]

  return (
    <Dropdown
      button={<>{current.label}<ChevronDown size={12} /></>}
      buttonClass="px-2 py-1 bg-white hover:bg-blue-50 rounded border border-gray-300 font-medium flex items-center gap-1 text-xs"
      popupClass="w-52 max-h-64 overflow-y-auto"
    >
      {(close) => (
        Object.entries(CHARSETS).sort((a, b) => a[1].label.localeCompare(b[1].label, undefined, { numeric: true })).map(([key, def]) => (
          <button
            key={key}
            class={`flex items-center gap-2 w-full px-3 py-1 text-left text-xs hover:bg-blue-50 ${
              value === key ? 'font-bold' : ''
            }`}
            onClick={() => { onChange(key as Charset); close() }}
          >
            {def.label}
          </button>
        ))
      )}
    </Dropdown>
  )
}
