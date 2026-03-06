import { useState } from 'preact/hooks'
import { createPortal } from 'preact/compat'
import {
  FlipHorizontal, FlipVertical, Contrast, RotateCw, RotateCcw,
  ArrowUp, ArrowDown, ArrowLeft, ArrowRight,
  Save, Info
} from 'lucide-preact'
import { CenterHIcon } from './CenterHIcon'
import { IconBtn } from './IconBtn'
import {
  type FontInstance,
  flipXBytes, flipYBytes, invertBytes, rotateCWBytes, rotateCCWBytes,
  shiftUp, shiftDown, shiftLeft, shiftRight, centerHorizontalBytes,
  saveFont
} from '../store'
import { execTransformGlyph } from '../undoHistory'
import { GlyphMetaDialog } from './GlyphMetaDialog'

const ICON = 18

export function SaveBar({ font }: { font: FontInstance }) {
  function handleSave() {
    const data = saveFont(font)
    const blob = new Blob([data.buffer as ArrayBuffer], { type: 'application/octet-stream' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = font.fileName.value
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div class="flex items-center gap-1">
      <IconBtn onClick={handleSave} title="Save .ch8"><Save size={ICON} /></IconBtn>
    </div>
  )
}

export function Toolbar({ font }: { font: FontInstance }) {
  const [glyphMetaOpen, setGlyphMetaOpen] = useState(false)

  return (
    <div class="flex flex-wrap gap-1">
      <IconBtn onClick={() => execTransformGlyph(font, font.lastClickedGlyph.value, flipXBytes, 'Flip X')} title="Flip X"><FlipHorizontal size={ICON} /></IconBtn>
      <IconBtn onClick={() => execTransformGlyph(font, font.lastClickedGlyph.value, flipYBytes, 'Flip Y')} title="Flip Y"><FlipVertical size={ICON} /></IconBtn>
      <IconBtn onClick={() => execTransformGlyph(font, font.lastClickedGlyph.value, invertBytes, 'Invert')} title="Invert"><Contrast size={ICON} /></IconBtn>
      <IconBtn onClick={() => execTransformGlyph(font, font.lastClickedGlyph.value, rotateCWBytes, 'Rotate CW')} title="Rotate CW"><RotateCw size={ICON} /></IconBtn>
      <IconBtn onClick={() => execTransformGlyph(font, font.lastClickedGlyph.value, rotateCCWBytes, 'Rotate CCW')} title="Rotate CCW"><RotateCcw size={ICON} /></IconBtn>
      <IconBtn onClick={() => execTransformGlyph(font, font.lastClickedGlyph.value, shiftUp, 'Shift Up')} title="Shift up"><ArrowUp size={ICON} /></IconBtn>
      <IconBtn onClick={() => execTransformGlyph(font, font.lastClickedGlyph.value, shiftDown, 'Shift Down')} title="Shift down"><ArrowDown size={ICON} /></IconBtn>
      <IconBtn onClick={() => execTransformGlyph(font, font.lastClickedGlyph.value, shiftLeft, 'Shift Left')} title="Shift left"><ArrowLeft size={ICON} /></IconBtn>
      <IconBtn onClick={() => execTransformGlyph(font, font.lastClickedGlyph.value, shiftRight, 'Shift Right')} title="Shift right"><ArrowRight size={ICON} /></IconBtn>
      <IconBtn onClick={() => execTransformGlyph(font, font.lastClickedGlyph.value, centerHorizontalBytes, 'Center H')} title="Center horizontal"><CenterHIcon size={ICON} /></IconBtn>
      <IconBtn onClick={() => setGlyphMetaOpen(true)} title="Glyph properties"><Info size={ICON} /></IconBtn>
      {glyphMetaOpen && createPortal(
        <GlyphMetaDialog font={font} glyphIdx={font.lastClickedGlyph.value} onClose={() => setGlyphMetaOpen(false)} />,
        document.body,
      )}
    </div>
  )
}
