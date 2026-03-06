import { useState } from 'preact/hooks'
import { createPortal } from 'preact/compat'
import { type FontInstance, glyphCount, charset, CHARSETS, type Charset } from '../store'
import { MetaDialog } from './MetaDialog'

export function FontStatusBar({ font }: { font: FontInstance }) {
  const [metaOpen, setMetaOpen] = useState(false)
  const count = glyphCount(font)
  const selSize = font.selectedGlyphs.value.size
  const propCount = Object.keys(font.meta.value?.properties ?? {}).length
  const hint = selSize > 1
    ? `${selSize} glyphs selected`
    : 'Click to select, Shift+click for range, Ctrl+click to toggle'

  return (
    <>
      <span>{hint}</span>
      <span>{count} glyphs</span>
      <button
        class="text-xs text-gray-500 hover:text-blue-600 cursor-pointer"
        onClick={() => setMetaOpen(true)}
        title="Font properties"
      >
        {propCount > 0 ? `${propCount} properties` : 'properties'}
      </button>
      <select
        class="text-xs bg-transparent border-none outline-none cursor-pointer text-gray-500"
        value={charset.value}
        onChange={(e) => { charset.value = (e.target as HTMLSelectElement).value as Charset }}
      >
        {Object.entries(CHARSETS).map(([key, def]) => (
          <option key={key} value={key}>{def.label}</option>
        ))}
      </select>
      {metaOpen && createPortal(
        <MetaDialog font={font} onClose={() => setMetaOpen(false)} />,
        document.body,
      )}
    </>
  )
}
