import { ChevronDown, MousePointer } from 'lucide-preact'
import {
  type FontInstance,
  selectAll, selectNumbers, selectUppercase, selectLowercase, selectSymbols, invertSelection
} from '../store'
import { Dropdown } from './Dropdown'

const ICON = 16

export function SelectDropdown({ font }: { font: FontInstance }) {
  function item(label: string, fn: () => void, shortcut?: string, close?: () => void) {
    return (
      <button
        class="flex items-center w-full px-3 py-1.5 text-left hover:bg-blue-50 rounded"
        onClick={() => { fn(); close?.() }}
      >
        {label}
        {shortcut && <span class="ml-auto text-xs text-gray-400 pl-4">{shortcut}</span>}
      </button>
    )
  }

  return (
    <Dropdown
      button={<><MousePointer size={ICON} />Select<ChevronDown size={14} /></>}
      popupClass="w-40"
    >
      {(close) => (
        <>
          {item('All', () => selectAll(font), 'Ctrl+A', close)}
          {item('Numbers 0-9', () => selectNumbers(font), undefined, close)}
          {item('Uppercase A-Z', () => selectUppercase(font), undefined, close)}
          {item('Lowercase a-z', () => selectLowercase(font), undefined, close)}
          {item('Symbols', () => selectSymbols(font), undefined, close)}
          <div class="border-t border-gray-200 my-1" />
          {item('Invert Selection', () => invertSelection(font), undefined, close)}
        </>
      )}
    </Dropdown>
  )
}
