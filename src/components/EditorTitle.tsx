import { type FontInstance, charLabel } from '../store'
import { charName } from '../unicodeNames'

export function EditorTitle({ font, glyph }: { font: FontInstance; glyph?: number }) {
  const glyphIdx = glyph ?? font.lastClickedGlyph.value
  const charCode = font.startChar.value + glyphIdx
  const label = charLabel(charCode, font.charset.value)
  const labelStr = label ? ` "${label}"` : ''
  const name = charName(charCode, font.charset.value)
  const nameStr = name ? ` (${name})` : ''
  return (
    <span>
      Glyph{labelStr}{nameStr} — {font.fileName.value}
    </span>
  )
}
