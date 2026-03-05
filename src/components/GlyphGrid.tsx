import { useState, useRef, useEffect } from 'preact/hooks'
import { ChevronDown, ZoomIn } from 'lucide-preact'
import { type FontInstance, glyphCount, selectGlyph, activeFontId } from '../store'
import { GlyphTile } from './GlyphTile'
import { SaveBar } from './Toolbar'
import { ToolsDropdown } from './ToolsDropdown'
import { SelectDropdown } from './SelectDropdown'

function ZoomDropdown({ font }: { font: FontInstance }) {
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

  return (
    <div class="relative" ref={ref}>
      <button
        class="px-2 py-1 bg-white hover:bg-blue-50 rounded border border-gray-300 font-medium flex items-center gap-1"
        onClick={() => setOpen(!open)}
      >
        <ZoomIn size={16} />
        {font.gridZoom.value * 100}%
        <ChevronDown size={14} />
      </button>
      {open && (
        <div class="absolute top-full left-0 mt-1 bg-white border border-gray-300 rounded shadow-lg z-50 py-2 px-3 flex items-center gap-2">
          <input
            type="range"
            min={1}
            max={10}
            value={font.gridZoom.value}
            onInput={(e) => { font.gridZoom.value = parseInt((e.target as HTMLInputElement).value) }}
            class="w-40"
          />
          <span class="text-sm whitespace-nowrap">{font.gridZoom.value * 100}%</span>
        </div>
      )}
    </div>
  )
}

interface Props {
  font: FontInstance
}

export function GlyphGrid({ font }: Props) {
  const count = glyphCount(font)
  const zoomLevel = font.gridZoom.value
  const tileSize = 8 * zoomLevel

  const tiles = []
  for (let i = 0; i < count; i++) {
    tiles.push(
      <GlyphTile
        key={i}
        font={font}
        index={i}
        size={tileSize}
        selected={font.selectedGlyphs.value.has(i)}
        active={i === font.lastClickedGlyph.value}
        onClick={(e: MouseEvent) => {
          selectGlyph(font, i, e.shiftKey, e.ctrlKey || e.metaKey)
          activeFontId.value = font.id
        }}
      />
    )
  }

  return (
    <div>
      <div class="flex items-center gap-4 mb-3 flex-wrap">
        <SaveBar font={font} />
        <span class="text-sm">{font.selectedGlyphs.value.size} of {count} glyphs selected</span>
        <SelectDropdown font={font} />
        <ToolsDropdown font={font} />
        <div class="ml-auto">
          <ZoomDropdown font={font} />
        </div>
      </div>
      <div class="flex flex-wrap gap-0.5 p-1">
        {tiles}
      </div>
    </div>
  )
}
