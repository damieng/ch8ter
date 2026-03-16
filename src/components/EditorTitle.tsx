import { type FontInstance, charLabel } from '../store'

export function EditorTitle({ font }: { font: FontInstance }) {
  const glyphIdx = font.lastClickedGlyph.value
  const charCode = font.startChar.value + glyphIdx
  const label = charLabel(charCode)
  const labelStr = label ? ` "${label}"` : ''
  return (
    <span>
      Glyph{labelStr} — {font.fileName.value}
    </span>
  )
}
