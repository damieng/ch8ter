import { useState } from 'preact/hooks'
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
import { GlyphPropertiesDialog } from '../dialogs/GlyphPropertiesDialog'
import { writeBdf } from '../fileFormats/bdfWriter'
import { writePsf } from '../fileFormats/psfWriter'
import { exportTtf } from '../fileFormats/ttfExport'
import { exportVarTtf } from '../fileFormats/ttfVarExport'
import { writeYaff } from '../fileFormats/yaffWriter'
import { ttfToWoff } from '../fileFormats/woffExport'
import { writeDraw } from '../fileFormats/drawWriter'
import { exportCpm } from '../fileFormats/cpmExport'
import { writeFzx } from '../fileFormats/fzxWriter'
import { writeGdosFont } from '../fileFormats/gdosFontWriter'
import { writePcf } from '../fileFormats/pcfWriter'
import { writePdbFont } from '../fileFormats/pdbFontWriter'
import { writeAmigaFont } from '../fileFormats/amigaFontWriter'
import { writeAtari8Bit } from '../fileFormats/atari8BitWriter'
import { writeBbc } from '../fileFormats/bbcWriter'
import { writeEgaCom } from '../fileFormats/egaComWriter'
import { SourceExportDialog } from '../dialogs/SourceExportDialog'
import { PngExportDialog } from '../dialogs/PngExportDialog'
import { Dropdown } from './Dropdown'

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
  return filename.replace(/\.(ch8|bdf|psf|psfu|bin|ttf|woff|yaff|draw|fzx|fnt|pcf|pdb)$/i, '')
}

export function SaveBar({ font }: { font: FontInstance }) {
  const is8x8 = font.glyphWidth.value <= 8 && font.glyphHeight.value <= 8

  function saveCh8() {
    const data = saveFont(font)
    download(new Blob([data.buffer as ArrayBuffer]), baseName(font.fileName.value) + '.ch8')
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
      fontName: font.fontName.value,
    })
    download(new Blob([bdf], { type: 'text/plain' }), baseName(font.fileName.value) + '.bdf')
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
      name: font.fontName.value || baseName(font.fileName.value),
    })
    download(new Blob([yaff], { type: 'text/plain' }), baseName(font.fileName.value) + '.yaff')
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
      fontName: font.fontName.value,
      meta: font.meta.value,
    })
    download(new Blob([fnt.buffer as ArrayBuffer]), baseName(font.fileName.value) + '.fnt')
  }

  function savePcf() {
    const data = saveFont(font)
    const count = glyphCount(font)
    const pcf = writePcf({
      fontData: data,
      glyphWidth: font.glyphWidth.value,
      glyphHeight: font.glyphHeight.value,
      startChar: font.startChar.value,
      glyphCount: count,
      baseline: font.baseline.value,
      meta: font.meta.value,
      glyphMeta: font.glyphMeta.value,
      fontName: font.fontName.value,
    })
    download(new Blob([pcf.buffer as ArrayBuffer]), baseName(font.fileName.value) + '.pcf')
  }

  function savePdb() {
    const data = saveFont(font)
    const count = glyphCount(font)
    const pdb = writePdbFont({
      fontData: data,
      glyphWidth: font.glyphWidth.value,
      glyphHeight: font.glyphHeight.value,
      startChar: font.startChar.value,
      glyphCount: count,
      baseline: font.baseline.value,
      meta: font.meta.value,
      glyphMeta: font.glyphMeta.value,
      fontName: font.fontName.value,
    })
    download(new Blob([pdb.buffer as ArrayBuffer]), baseName(font.fileName.value) + '.pdb')
  }

  function saveAtari8Bit() {
    const data = saveFont(font)
    const a8 = writeAtari8Bit(data, font.startChar.value)
    download(new Blob([a8.buffer as ArrayBuffer]), baseName(font.fileName.value) + '.fnt')
  }

  function saveAmiga() {
    const data = saveFont(font)
    const count = glyphCount(font)
    const amiga = writeAmigaFont({
      fontData: data,
      glyphWidth: font.glyphWidth.value,
      glyphHeight: font.glyphHeight.value,
      startChar: font.startChar.value,
      glyphCount: count,
      baseline: font.baseline.value,
      meta: font.meta.value,
      glyphMeta: font.glyphMeta.value,
      fontName: font.fontName.value,
    })
    const height = font.glyphHeight.value
    download(new Blob([amiga.buffer as ArrayBuffer]), baseName(font.fileName.value) + '-' + height)
  }

  function saveEgaCom() {
    const data = saveFont(font)
    const ega = writeEgaCom(data, font.glyphHeight.value)
    download(new Blob([ega.buffer as ArrayBuffer]), baseName(font.fileName.value) + '.com')
  }

  function saveBbc() {
    const data = saveFont(font)
    const count = glyphCount(font)
    const bbc = writeBbc(data, font.startChar.value, count)
    download(new Blob([bbc.buffer as ArrayBuffer]), baseName(font.fileName.value) + '.bbc')
  }

  function saveCpm() {
    const data = saveFont(font)
    const com = exportCpm(font.glyphHeight.value, data)
    download(new Blob([com.buffer as ArrayBuffer]), baseName(font.fileName.value) + '.com')
  }

  const btn = (label: string, fn: () => void, close: () => void) => (
    <button class="flex items-center w-full px-3 py-1.5 text-left hover:bg-blue-50 text-sm" onClick={() => { fn(); close() }}>
      {label}
    </button>
  )

  return (
    <Dropdown
      button={<><Save size={ICON} /><ChevronDown size={12} /></>}
      buttonClass="p-1.5 hover:bg-blue-50 rounded flex items-center gap-0.5"
      title="Save"
      popupClass="w-auto whitespace-nowrap"
    >
      {(close) => (
        <>
          {is8x8 && btn('Save as .ch8', saveCh8, close)}
          {btn('Save as .bdf', saveBdf, close)}
          {btn('Save as .psf', savePsf, close)}
          {btn('Save as .yaff', saveYaff, close)}
          {btn('Save as .draw', saveDraw, close)}
          {btn('Save as .fzx', saveFzx, close)}
          {btn('Save as Atari ST .fnt', saveFnt, close)}
          {btn('Save as X11 .pcf', savePcf, close)}
          {btn('Save as Palm .pdb', savePdb, close)}
          {btn('Save as Atari 8-bit .fnt', saveAtari8Bit, close)}
          {btn('Save as Amiga font', saveAmiga, close)}
          {btn('Save as EGA/VGA .com', saveEgaCom, close)}
          {btn('Save as BBC Micro .bbc', saveBbc, close)}
          {btn('Save as CP/M Plus .com', saveCpm, close)}
        </>
      )}
    </Dropdown>
  )
}

export function ExportBar({ font }: { font: FontInstance }) {
  const [sourceOpen, setSourceOpen] = useState(false)
  const [pngOpen, setPngOpen] = useState(false)

  function exportTtfFile() {
    saveFont(font)
    const buf = exportTtf(font)
    download(new Blob([buf]), baseName(font.fileName.value) + '.ttf')
  }

  async function exportWoff() {
    saveFont(font)
    const ttf = exportTtf(font)
    const woff = await ttfToWoff(ttf)
    download(new Blob([woff]), baseName(font.fileName.value) + '.woff')
  }

  function exportVarTtfFile() {
    saveFont(font)
    const buf = exportVarTtf(font)
    download(new Blob([buf]), baseName(font.fileName.value) + '-variable.ttf')
  }

  async function exportVarWoff() {
    saveFont(font)
    const ttf = exportVarTtf(font)
    const woff = await ttfToWoff(ttf)
    download(new Blob([woff]), baseName(font.fileName.value) + '-variable.woff')
  }

  const btn = (label: string, fn: () => void, close: () => void) => (
    <button class="flex items-center w-full px-3 py-1.5 text-left hover:bg-blue-50 text-sm" onClick={() => { fn(); close() }}>
      {label}
    </button>
  )

  return (
    <Dropdown
      button={<><TypeOutline size={ICON} /><ChevronDown size={12} /></>}
      buttonClass="p-1.5 hover:bg-blue-50 rounded flex items-center gap-0.5"
      title="Export"
      popupClass="w-auto whitespace-nowrap"
      extra={<>
        {pngOpen && <PngExportDialog font={font} onClose={() => setPngOpen(false)} />}
        {sourceOpen && <SourceExportDialog font={font} onClose={() => setSourceOpen(false)} />}
      </>}
    >
      {(close) => (
        <>
          {btn('Export as .ttf', exportTtfFile, close)}
          {btn('Export as .woff', exportWoff, close)}
          {btn('Export as .ttf (variable)', exportVarTtfFile, close)}
          {btn('Export as .woff (variable)', exportVarWoff, close)}
          <div class="border-t border-gray-200 my-1" />
          {btn('Export PNG...', () => setPngOpen(true), close)}
          {btn('Export Source...', () => setSourceOpen(true), close)}
        </>
      )}
    </Dropdown>
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
        <GlyphPropertiesDialog font={font} glyphIdx={font.lastClickedGlyph.value} onClose={() => setGlyphMetaOpen(false)} />,
        document.body,
      )}
    </div>
  )
}
