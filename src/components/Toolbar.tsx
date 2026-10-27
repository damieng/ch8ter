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
  saveFont, fontToConversionData
} from '../store'
import {
  flipXBytes, flipYBytes, invertBytes, rotateCWBytes, rotateCCWBytes,
  shiftUp, shiftDown, shiftLeft, shiftRight, centerHorizontalBytes,
} from '../glyphTransforms'
import { execTransformGlyph } from '../undoHistory'
import { GlyphPropertiesDialog } from '../dialogs/GlyphPropertiesDialog'
import { exportTtf } from '../fileFormats/ttfExport'
import { exportVarTtf } from '../fileFormats/ttfVarExport'
import { ttfToWoff } from '../fileFormats/woffExport'
import { SourceExportDialog } from '../dialogs/SourceExportDialog'
import { PngExportDialog } from '../dialogs/PngExportDialog'
import { ErrorDialog } from '../dialogs/ErrorDialog'
import { Dropdown } from './Dropdown'
import { baseName } from '../fontLoad'
import { saveFontFile, TEXT_FORMATS } from '../fontSave'
import { packBmFontAtlas, renderAtlasRgba, bmFontDescriptorText } from '../fileFormats/bmFontWriter'

const ICON = 18

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function SaveBar({ font }: { font: FontInstance }) {
  const [error, setError] = useState<string | null>(null)
  const is8x8 = font.glyphWidth.value <= 8 && font.glyphHeight.value <= 8

  function saveAs(formatKey: string, fileExt: string): boolean {
    const data = fontToConversionData(font)
    try {
      const result = saveFontFile(formatKey, data)
      const blobOpts = TEXT_FORMATS.has(formatKey) ? { type: 'text/plain' } : undefined
      const blobData = typeof result === 'string' ? result : result.buffer as ArrayBuffer
      download(new Blob([blobData], blobOpts), baseName(font.fileName.value) + fileExt)
      saveFont(font)
      return true
    } catch (e) {
      setError((e as Error).message)
      return false
    }
  }

  const btn = (label: string, formatKey: string, fileExt: string, close: () => void) => (
    <button class="flex items-center w-full px-3 py-1.5 text-left hover:bg-blue-50 text-sm" onClick={() => { saveAs(formatKey, fileExt); close() }}>
      {label}
    </button>
  )

  return (
    <>
      <Dropdown
        button={<><Save size={ICON} /><ChevronDown size={12} /></>}
        buttonClass="p-1.5 hover:bg-blue-50 rounded flex items-center gap-0.5"
        title="Save"
        popupClass="w-auto whitespace-nowrap"
      >
        {(close) => (
          <>
            {is8x8 && btn('Save as .ch8', 'ch8', '.ch8', close)}
            {btn('Save as .bdf', 'bdf', '.bdf', close)}
            {btn('Save as .psf', 'psf', '.psf', close)}
            {btn('Save as .yaff', 'yaff', '.yaff', close)}
            {btn('Save as .draw', 'draw', '.draw', close)}
            {btn('Save as .fzx', 'fzx', '.fzx', close)}
           {btn('Save as Atari ST .fnt', 'fnt', '.fnt', close)}
           {btn('Save as Windows .fnt', 'windows', '.fnt', close)}
            {btn('Save as X11 .pcf', 'pcf', '.pcf', close)}
            {btn('Save as Palm .pdb', 'pdb', '.pdb', close)}
            {btn('Save as Atari 8-bit .fnt', 'atari8', '.fnt', close)}
            {btn('Save as Amiga font', 'amiga', '-' + font.glyphHeight.value, close)}
            {btn('Save as EGA/VGA .com', 'ega', '.com', close)}
            {btn('Save as BBC Micro .bbc', 'bbc', '.bbc', close)}
            {btn('Save as CP/M Plus .com', 'com', '.com', close)}
            {btn('Save as DOS .cpi', 'cpi', '.cpi', close)}
            {btn('Save as Windows .fon', 'fon', '.fon', close)}
            {btn('Save as C64 GEOS .cvt', 'geos', '.cvt', close)}
            {btn('Save as C64 .64c', '64c', '.64c', close)}
            {btn('Save as ZX Spectrum .tap', 'tap', '.tap', close)}
          </>
        )}
      </Dropdown>
      {error !== null && <ErrorDialog title="Failed to save font" message={error} onClose={() => setError(null)} />}
    </>
  )
}

export function ExportBar({ font }: { font: FontInstance }) {
  const [sourceOpen, setSourceOpen] = useState(false)
  const [pngOpen, setPngOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function exportTtfFile() {
    saveFont(font)
    const buf = exportTtf(font)
    download(new Blob([buf]), baseName(font.fileName.value) + '.ttf')
  }

  async function exportBmFont() {
    try {
      saveFont(font)
      const conv = fontToConversionData(font)
      const atlas = packBmFontAtlas(conv)
      const base = baseName(font.fileName.value)
      const pageFile = `${base}_0.png`
      const rgba = renderAtlasRgba(conv, atlas)
      const canvas = document.createElement('canvas')
      canvas.width = atlas.scaleW
      canvas.height = atlas.scaleH
      const ctx = canvas.getContext('2d')!
      const imageData = ctx.createImageData(atlas.scaleW, atlas.scaleH)
      imageData.data.set(rgba)
      ctx.putImageData(imageData, 0, 0)
      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'))
      if (!blob) throw new Error('Could not encode atlas PNG')
      download(blob, pageFile)
      download(new Blob([bmFontDescriptorText(conv, atlas, pageFile)], { type: 'text/plain' }), base + '.fnt')
    } catch (e) {
      setError((e as Error).message)
    }
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
        {error !== null && <ErrorDialog title="Failed to export BMFont" message={error} onClose={() => setError(null)} />}
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
          {btn('Export BMFont (.fnt + .png)', () => { void exportBmFont() }, close)}
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
