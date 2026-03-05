import { useState, useRef, useEffect } from 'preact/hooks'
import { ZoomIn, Eye } from 'lucide-preact'
import { type FontInstance, glyphCount, selectGlyph, activeFontId, openPreview, charCodeFromKey, glyphToText, charset, CHARSETS } from '../store'
import { execClearGlyph, execPasteGlyph, undo, redo } from '../undoHistory'
import { COLOR_SYSTEMS } from '../colorSystems'
import { GlyphTile } from './GlyphTile'
import { SaveBar } from './Toolbar'
import { ToolsDropdown } from './ToolsDropdown'
import { SelectDropdown } from './SelectDropdown'
import { useClickOutside } from '../hooks/useClickOutside'

function ZoomDropdown({ font }: { font: FontInstance }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useClickOutside(ref, () => setOpen(false))

  return (
    <div class="relative" ref={ref}>
      <button
        class="px-2 py-1 bg-white hover:bg-blue-50 rounded border border-gray-300 font-medium flex items-center gap-1"
        onClick={() => setOpen(!open)}
      >
        <ZoomIn size={16} />
        {font.gridZoom.value * 100}%
      </button>
      {open && (
        <div class="absolute top-full right-0 mt-1 bg-white border border-gray-300 rounded shadow-lg z-50 py-2 px-3 flex items-center gap-2">
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

function PreviewButton({ font }: { font: FontInstance }) {
  function handleClick() {
    const cs = CHARSETS[charset.value]
    const sysIdx = cs?.colorSystem
      ? COLOR_SYSTEMS.findIndex(s => s.name === cs.colorSystem)
      : -1
    openPreview(font.id, sysIdx >= 0 ? sysIdx : undefined)
  }

  return (
    <button
      class="px-2 py-1 bg-white hover:bg-blue-50 rounded border border-gray-300 font-medium flex items-center gap-1"
      onClick={handleClick}
    >
      <Eye size={16} />
      Preview
    </button>
  )
}

interface Props {
  font: FontInstance
}

export function GlyphGrid({ font }: Props) {
  const count = glyphCount(font)
  const zoomLevel = font.gridZoom.value
  const tileSize = 8 * zoomLevel
  // Jump to glyph when typing a character (document-level, only when this font is active)
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (activeFontId.value !== font.id) return
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return

      const active = font.lastClickedGlyph.value

      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        undo(font)
        e.preventDefault()
        return
      }

      if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
        redo(font)
        e.preventDefault()
        return
      }

      if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
        const text = glyphToText(font, active)
        navigator.clipboard.writeText(text)
        e.preventDefault()
        return
      }

      if ((e.ctrlKey || e.metaKey) && e.key === 'x') {
        const text = glyphToText(font, active)
        navigator.clipboard.writeText(text)
        execClearGlyph(font, active)
        e.preventDefault()
        return
      }

      if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
        navigator.clipboard.readText().then(text => {
          execPasteGlyph(font, active, text)
        })
        e.preventDefault()
        return
      }

      if (e.key === 'Delete') {
        execClearGlyph(font, active)
        e.preventDefault()
        return
      }

      if (e.ctrlKey || e.metaKey || e.altKey) return

      const charCode = charCodeFromKey(e.key)
      if (charCode === null) return

      const idx = charCode - font.startChar.value
      if (idx >= 0 && idx < count) {
        selectGlyph(font, idx, false, false)
        e.preventDefault()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [font, count])

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
        <PreviewButton font={font} />
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
