import { ChevronDown, Type } from 'lucide-preact'
import { switchCharset, charset, CHARSETS } from '../store'
import type { Charset } from '../store'
import { Dropdown } from './Dropdown'

const ICON = 16

export function CharsetDropdown() {
  const current = CHARSETS[charset.value]

  return (
    <Dropdown
      button={<><Type size={ICON} />{current.label}<ChevronDown size={14} /></>}
      popupClass="w-44"
    >
      {(close) => (
        Object.entries(CHARSETS).sort((a, b) => a[1].label.localeCompare(b[1].label, undefined, { numeric: true })).map(([key, def]) => (
          <button
            key={key}
            class={`flex items-center gap-2 w-full px-3 py-1.5 text-left hover:bg-blue-50 rounded ${
              charset.value === key ? 'font-bold' : ''
            }`}
            onClick={() => { switchCharset(key as Charset); close() }}
          >
            {def.label}
          </button>
        ))
      )}
    </Dropdown>
  )
}
