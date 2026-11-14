import { useState } from 'preact/hooks'
import { createPortal } from 'preact/compat'
import { type FontInstance, glyphCount, switchCharset, sortedCharsets, type Charset } from '../store'
import { FontPropertiesDialog } from '../dialogs/FontPropertiesDialog'

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
        {`${propCount} properties`}
      </button>
      <select
        class="text-xs bg-transparent border-none outline-none cursor-pointer text-gray-500"
        value={font.charset.value}
        onChange={(e) => { switchCharset(font, (e.target as HTMLSelectElement).value as Charset) }}
        title="Codepage for this font"
      >
        {sortedCharsets().map(([key, def]) => (
          <option key={key} value={key}>{def.label}</option>
        ))}
      </select>
      {metaOpen && createPortal(
        <FontPropertiesDialog font={font} onClose={() => setMetaOpen(false)} />,
        document.body,
      )}
    </>
  )
}
