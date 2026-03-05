import { type FontInstance, glyphCount, charset, CHARSETS, type Charset } from '../store'

export function FontStatusBar({ font }: { font: FontInstance }) {
  const count = glyphCount(font)
  const selSize = font.selectedGlyphs.value.size
  const hint = selSize > 1
    ? `${selSize} glyphs selected`
    : 'Click to select, Shift+click for range, Ctrl+click to toggle'

  return (
    <>
      <span>{hint}</span>
      <span>{count} glyphs</span>
      <select
        class="text-xs bg-transparent border-none outline-none cursor-pointer text-gray-500"
        value={charset.value}
        onChange={(e) => { charset.value = (e.target as HTMLSelectElement).value as Charset }}
      >
        {Object.entries(CHARSETS).map(([key, def]) => (
          <option key={key} value={key}>{def.label}</option>
        ))}
      </select>
    </>
  )
}
