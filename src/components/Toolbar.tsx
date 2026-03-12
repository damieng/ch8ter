import { useState, useRef } from 'preact/hooks'
import { createPortal } from 'preact/compat'
import {
  FlipHorizontal, FlipVertical, Contrast, RotateCw, RotateCcw,
  ArrowUp, ArrowDown, ArrowLeft, ArrowRight,
  Save, TypeOutline, Info, ChevronDown
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
import { exportTtf } from '../ttfExport'
import { exportVarTtf } from '../ttfVarExport'
import { writeYaff } from '../yaffWriter'
import { ttfToWoff } from '../woffExport'
import { writeDraw } from '../drawWriter'
import { exportCpm } from '../cpmExport'
import { writeFzx } from '../fzxWriter'
import { writeGdosFont } from '../gdosFontWriter'
import { useClickOutside } from '../hooks/useClickOutside'
import { SourceExportDialog } from './SourceExportDialog'

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
  return filename.replace(/\.(ch8|udg|bdf|psf|psfu|bin|ttf|woff|yaff|draw|fzx|fnt)$/i, '')
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

  function saveUdg() {
    const data = saveFont(font)
    download(new Blob([data.buffer as ArrayBuffer]), baseName(font.fileName.value) + '.udg')
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

  function saveYaff() {
    const data = saveFont(font)
    const count = glyphCount(font)
    const yaff = writeYaff({
      fontData: data,
      glyphWidth: font.glyphWidth.value,
      glyphHeight: font.glyphHeight.value,
      startChar: font.startChar.value,
      glyphCount: count,
      name: baseName(font.fileName.value),
    })
    download(new Blob([yaff], { type: 'text/plain' }), baseName(font.fileName.value) + '.yaff')
    setOpen(false)
  }

  function saveDraw() {
    const data = saveFont(font)
    const count = glyphCount(font)
    const draw = writeDraw({
      fontData: data,
      glyphWidth: font.glyphWidth.value,
      glyphHeight: font.glyphHeight.value,
      startChar: font.startChar.value,
      glyphCount: count,
    })
    download(new Blob([draw], { type: 'text/plain' }), baseName(font.fileName.value) + '.draw')
    setOpen(false)
  }

  function saveFzx() {
    const data = saveFont(font)
    const count = glyphCount(font)
    const fzx = writeFzx({
      fontData: data,
      glyphWidth: font.glyphWidth.value,
      glyphHeight: font.glyphHeight.value,
      startChar: font.startChar.value,
      glyphCount: count,
      glyphMeta: font.glyphMeta.value,
    })
    download(new Blob([fzx.buffer as ArrayBuffer]), baseName(font.fileName.value) + '.fzx')
    setOpen(false)
  }

  function saveFnt() {
    const data = saveFont(font)
    const count = glyphCount(font)
    const fnt = writeGdosFont({
      fontData: data,
      glyphWidth: font.glyphWidth.value,
      glyphHeight: font.glyphHeight.value,
      startChar: font.startChar.value,
      glyphCount: count,
      glyphMeta: font.glyphMeta.value,
      baseline: font.baseline.value,
      ascender: font.ascender.value,
      descender: font.descender.value,
      name: baseName(font.fileName.value),
      meta: font.meta.value,
    })
    download(new Blob([fnt.buffer as ArrayBuffer]), baseName(font.fileName.value) + '.fnt')
    setOpen(false)
  }

  function saveCpm() {
    const data = saveFont(font)
    const com = exportCpm(font.glyphHeight.value, data)
    download(new Blob([com.buffer as ArrayBuffer]), baseName(font.fileName.value) + '.com')
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
          <button class="flex items-center w-full px-3 py-1.5 text-left hover:bg-blue-50 text-sm" onClick={saveUdg}>
            Save as .udg
          </button>
          <button class="flex items-center w-full px-3 py-1.5 text-left hover:bg-blue-50 text-sm" onClick={saveBdf}>
            Save as .bdf
          </button>
          <button class="flex items-center w-full px-3 py-1.5 text-left hover:bg-blue-50 text-sm" onClick={savePsf}>
            Save as .psf
          </button>
          <button class="flex items-center w-full px-3 py-1.5 text-left hover:bg-blue-50 text-sm" onClick={saveYaff}>
            Save as .yaff
          </button>
          <button class="flex items-center w-full px-3 py-1.5 text-left hover:bg-blue-50 text-sm" onClick={saveDraw}>
            Save as .draw
          </button>
          <button class="flex items-center w-full px-3 py-1.5 text-left hover:bg-blue-50 text-sm" onClick={saveFzx}>
            Save as .fzx
          </button>
          <button class="flex items-center w-full px-3 py-1.5 text-left hover:bg-blue-50 text-sm" onClick={saveFnt}>
            Save as Atari ST .fnt
          </button>
          <button class="flex items-center w-full px-3 py-1.5 text-left hover:bg-blue-50 text-sm" onClick={saveCpm}>
            Save as CP/M Plus .com
          </button>
        </div>
      )}
    </div>
  )
}

export function ExportBar({ font }: { font: FontInstance }) {
  const [open, setOpen] = useState(false)
  const [sourceOpen, setSourceOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useClickOutside(ref, () => setOpen(false))

  function exportTtfFile() {
    saveFont(font)
    const buf = exportTtf(font)
    download(new Blob([buf]), baseName(font.fileName.value) + '.ttf')
    setOpen(false)
  }

  async function exportWoff() {
    saveFont(font)
    const ttf = exportTtf(font)
    const woff = await ttfToWoff(ttf)
    download(new Blob([woff]), baseName(font.fileName.value) + '.woff')
    setOpen(false)
  }

  function exportVarTtfFile() {
    saveFont(font)
    const buf = exportVarTtf(font)
    download(new Blob([buf]), baseName(font.fileName.value) + '-variable.ttf')
    setOpen(false)
  }

  async function exportVarWoff() {
    saveFont(font)
    const ttf = exportVarTtf(font)
    const woff = await ttfToWoff(ttf)
    download(new Blob([woff]), baseName(font.fileName.value) + '-variable.woff')
    setOpen(false)
  }

  return (
    <div class="relative" ref={ref}>
      <button
        class="p-1.5 hover:bg-blue-50 rounded flex items-center gap-0.5"
        onClick={() => setOpen(!open)}
        title="Export"
      >
        <TypeOutline size={ICON} />
        <ChevronDown size={12} />
      </button>
      {open && (
        <div class="absolute top-full left-0 mt-1 bg-white border border-gray-300 rounded shadow-lg z-50 py-1 w-auto whitespace-nowrap">
          <button class="flex items-center w-full px-3 py-1.5 text-left hover:bg-blue-50 text-sm" onClick={exportTtfFile}>
            Export as .ttf
          </button>
          <button class="flex items-center w-full px-3 py-1.5 text-left hover:bg-blue-50 text-sm" onClick={exportWoff}>
            Export as .woff
          </button>
          <button class="flex items-center w-full px-3 py-1.5 text-left hover:bg-blue-50 text-sm" onClick={exportVarTtfFile}>
            Export as .ttf (variable)
          </button>
          <button class="flex items-center w-full px-3 py-1.5 text-left hover:bg-blue-50 text-sm" onClick={exportVarWoff}>
            Export as .woff (variable)
          </button>
          <div class="border-t border-gray-200 my-1" />
          <button class="flex items-center w-full px-3 py-1.5 text-left hover:bg-blue-50 text-sm" onClick={() => { setSourceOpen(true); setOpen(false) }}>
            Export Source...
          </button>
        </div>
      )}
      {sourceOpen && <SourceExportDialog font={font} onClose={() => setSourceOpen(false)} />}
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
