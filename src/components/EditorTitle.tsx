import { type FontInstance, charLabel } from '../store'
import { charName } from '../unicodeNames'

export function EditorTitle({ font, glyph }: { font: FontInstance; glyph?: number }) {
  const glyphIdx = glyph ?? font.lastClickedGlyph.value
  const charCode = font.startChar.value + glyphIdx
  const label = charLabel(charCode)
  const labelStr = label ? ` "${label}"` : ''
  const name = charName(charCode)
  const nameStr = name ? ` (${name})` : ''
  return (
    <span>
      Glyph{labelStr}{nameStr} — {font.fileName.value}
    </span>
  )
}
