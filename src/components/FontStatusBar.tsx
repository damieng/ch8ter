import { type FontInstance, glyphCount } from '../store'

export function FontStatusBar({ font }: { font: FontInstance }) {
  const total = glyphCount(font)
  return (
    <>
      <span>Click to select, Shift+click for range, Ctrl+click to toggle</span>
      <span>{total} glyphs, start char {font.startChar.value}</span>
    </>
  )
}
