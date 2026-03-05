import {
  glyphCount, selectedGlyphs, activeGlyph, selectGlyph, gridZoom
} from '../store'
import { GlyphTile } from './GlyphTile'
import { FontInfo } from './Toolbar'
import { ToolsDropdown } from './ToolsDropdown'
import { SelectDropdown } from './SelectDropdown'
import { CharsetDropdown } from './CharsetDropdown'

export function GlyphGrid() {
  const count = glyphCount.value
  const zoomLevel = gridZoom.value
  const tileSize = 8 * zoomLevel

  const tiles = []
  for (let i = 0; i < count; i++) {
    tiles.push(
      <GlyphTile
        key={i}
        index={i}
        size={tileSize}
        selected={selectedGlyphs.value.has(i)}
        active={i === activeGlyph.value}
        onClick={(e: MouseEvent) => selectGlyph(i, e.shiftKey, e.ctrlKey || e.metaKey)}
      />
    )
  }

  return (
    <div>
      <div class="flex items-center gap-4 mb-3 flex-wrap">
        <div class="flex items-center gap-2">
          <span class="font-bold">Zoom:</span>
          <input
            type="range"
            min={1}
            max={10}
            value={gridZoom.value}
            onInput={(e) => { gridZoom.value = parseInt((e.target as HTMLInputElement).value) }}
            class="w-40"
          />
          <span>{gridZoom.value * 100}%</span>
        </div>
        <SelectDropdown />
        <ToolsDropdown />
        <CharsetDropdown />
        <div class="ml-auto">
          <FontInfo />
        </div>
      </div>
      <div class="text-sm mb-2">
        Click to select, Shift+click for range, Ctrl+click to toggle
      </div>
      <div class="flex flex-wrap gap-0.5 max-h-[calc(100vh-120px)] overflow-y-auto p-1">
        {tiles}
      </div>
    </div>
  )
}
