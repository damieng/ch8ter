import { useState, useRef } from 'preact/hooks'
import { createPortal } from 'preact/compat'
import {
  FlipHorizontal, FlipVertical, Contrast, RotateCw, RotateCcw,
  ArrowUp, ArrowDown, ArrowLeft, ArrowRight,
  Save, Info, ChevronDown
} from 'lucide-preact'
import { CenterHIcon } from './CenterHIcon'
import { IconBtn } from './IconBtn'
import {
  type FontInstance,
  flipXBytes, flipYBytes, invertBytes, rotateCWBytes, rotateCCWBytes,
  shiftUp, shiftDown, shiftLeft, shiftRight, centerHorizontalBytes,
  saveFont, glyphCount
} from '../store'
import { execTransformGlyph } from '../undoHistory'
import { GlyphMetaDialog } from './GlyphMetaDialog'
import { writeBdf } from '../bdfWriter'
import { writePsf } from '../psfWriter'
import { useClickOutside } from '../hooks/useClickOutside'

const ICON = 18

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function baseName(filename: string): string {
  return filename.replace(/\.(ch8|bdf|psf|psfu|bin)$/i, '')
}

export function SaveBar({ font }: { font: FontInstance }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useClickOutside(ref, () => setOpen(false))

  function saveCh8() {
    const data = saveFont(font)
    download(new Blob([data.buffer as ArrayBuffer]), baseName(font.fileName.value) + '.ch8')
    setOpen(false)
  }

  function saveBdf() {
    const data = saveFont(font)
    const count = glyphCount(font)
    const bdf = writeBdf({
      fontData: data,
      glyphWidth: font.glyphWidth.value,
      glyphHeight: font.glyphHeight.value,
      startChar: font.startChar.value,
      glyphCount: count,
      baseline: font.baseline.value,
      meta: font.meta.value,
      glyphMeta: font.glyphMeta.value,
    })
    download(new Blob([bdf], { type: 'text/plain' }), baseName(font.fileName.value) + '.bdf')
    setOpen(false)
  }

  function savePsf() {
    const data = saveFont(font)
    const count = glyphCount(font)
    const psf = writePsf({
      fontData: data,
      glyphWidth: font.glyphWidth.value,
      glyphHeight: font.glyphHeight.value,
      startChar: font.startChar.value,
      glyphCount: count,
    })
    download(new Blob([psf.buffer as ArrayBuffer]), baseName(font.fileName.value) + '.psf')
    setOpen(false)
  }

  return (
    <div class="relative" ref={ref}>
      <button
        class="p-1.5 hover:bg-blue-50 rounded flex items-center gap-0.5"
        onClick={() => setOpen(!open)}
        title="Save"
      >
        <Save size={ICON} />
        <ChevronDown size={12} />
      </button>
      {open && (
        <div class="absolute top-full left-0 mt-1 bg-white border border-gray-300 rounded shadow-lg z-50 py-1 w-auto whitespace-nowrap">
          <button class="flex items-center w-full px-3 py-1.5 text-left hover:bg-blue-50 text-sm" onClick={saveCh8}>
            Save as .ch8
          </button>
          <button class="flex items-center w-full px-3 py-1.5 text-left hover:bg-blue-50 text-sm" onClick={saveBdf}>
            Save as .bdf
          </button>
          <button class="flex items-center w-full px-3 py-1.5 text-left hover:bg-blue-50 text-sm" onClick={savePsf}>
            Save as .psf
          </button>
        </div>
      )}
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
