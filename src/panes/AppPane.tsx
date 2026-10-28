import { useEffect, useState, useRef } from "preact/hooks"
import { signal } from "@preact/signals"
import { FilePlus, FolderOpen, MoreVertical } from "lucide-preact"
import { theme, toggleTheme } from "../theme"
import {
  createFont,
  addFont,
  switchCharset,
  recalcMetrics,
  calcMissingMetrics,
  CHARSETS,
  type Charset,
  removeAllFonts,
  removeAllFontsAndContainers,
  exportWorkspace,
  importWorkspace,
  fonts,
} from "../store"
import { parseWorkspaceFile } from "../persistence"
import { loadFontFile, UnknownFormatError, type FontConversionData } from "../fontLoad"
import { openCom } from "../fileFormats/comOpener"
import { parseCpi } from "../fileFormats/cpiParser"
import { decompressCpx } from "../fileFormats/cpxDecoder"
import { parseFon } from "../fileFormats/fonParser"
import { parseSbit, isSbitFont } from "../fileFormats/sbitParser"
import { addContainer, createContainerId, type ContainerFont } from "../store"
import { extractTapFonts } from "../fileFormats/tapParser"
import { parseGeosCvt } from "../fileFormats/geosParser"
import { isBmFontText, parseBmFont, buildFontFromPage } from "../fileFormats/bmFontParser"
import { imageToData } from "../fileFormats/pngImport"
import { IconBtn } from "../components/IconBtn"
import { NewFontDialog } from "../dialogs/NewFontDialog"
import { PngImportDialog } from "../dialogs/PngImportDialog"
import { RawImportDialog } from "../dialogs/RawImportDialog"
import { ErrorDialog } from "../dialogs/ErrorDialog"
import { ConfirmActionDialog } from "../dialogs/ConfirmActionDialog"
import CHANGELOG from "../change-log.json"
import { Dropdown } from "../components/Dropdown"

const ICON = 18

/** Map Windows dfCharSet value to a codepage number for display. */
function winCharsetToCodepage(cs: number): number {
  switch (cs) {
    case 0: return 1252    // ANSI
    case 177: return 1255  // HEBREW
    case 178: return 1256  // ARABIC
    case 161: return 1253  // GREEK
    case 162: return 1254  // TURKISH
    case 186: return 1257  // BALTIC
    case 204: return 1251  // RUSSIAN
    case 238: return 1250  // EASTEUROPE
    case 222: return 874   // THAI
    case 128: return 932   // SHIFTJIS
    case 129: return 949   // HANGUL
    case 134: return 936   // GB2312
    case 136: return 950   // CHINESEBIG5
    case 255: return 437   // OEM
    default: return 0      // DEFAULT/SYMBOL/unknown
  }
}

const APP_VERSION = __APP_VERSION__


async function decompressGz(buf: ArrayBuffer): Promise<ArrayBuffer> {
  const ds = new DecompressionStream("gzip")
  const reader = new Blob([buf]).stream().pipeThrough(ds).getReader()
  const chunks: Uint8Array[] = []
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
  }
  const total = chunks.reduce((s, c) => s + c.length, 0)
  const out = new Uint8Array(total)
  let off = 0
  for (const c of chunks) {
    out.set(c, off)
    off += c.length
  }
  return out.buffer
}

const showChangelog = signal(false)
const showHotkeys = signal(false)
const helpTab = signal<'shortcuts' | 'formats' | 'codepages'>('shortcuts')

const FORMATS: { exts: string; name: string }[] = [
  { exts: '.draw',         name: 'Acorn Draw' },
  { exts: '.fnt',          name: 'Atari 8-bit' },
  { exts: '.fnt',          name: 'Atari ST GDOS' },
  { exts: '.bbc',          name: 'BBC Micro' },
  { exts: '.64c',          name: 'Commodore 64' },
  { exts: '',              name: 'Commodore Amiga' },
  { exts: '.com',          name: 'CP/M Plus' },
  { exts: '.psf',          name: 'Linux console' },
  { exts: '.pdb',          name: 'PalmOS' },
  { exts: '.com .cpi .cpx', name: 'PC DOS' },
  { exts: '.png',          name: 'PNG tile sheet' },
  { exts: '.bin .raw',     name: 'RAW binary' },
  { exts: '.ttf .otf',     name: 'TTF/OTF embedded bitmap' },
  { exts: '.fnt .fon',     name: 'Windows FNT' },
  { exts: '.fnt .png',     name: 'BMFont (drop both)' },
  { exts: '.bdf .pcf',     name: 'X11' },
  { exts: '.yaff',         name: 'YAFF' },
  { exts: '.ch8 .fzx .tap', name: 'ZX Spectrum' },
  { exts: '.cvt',          name: 'C64 GEOS' },
]

const HOTKEYS: { key: string; desc: string }[] = [
  { key: 'Ctrl+Z', desc: 'Undo' },
  { key: 'Ctrl+Y', desc: 'Redo' },
  { key: 'Ctrl+A', desc: 'Select all glyphs' },
  { key: 'Ctrl+C', desc: 'Copy glyph' },
  { key: 'Ctrl+X', desc: 'Cut glyph' },
  { key: 'Ctrl+V', desc: 'Paste glyph' },
  { key: 'Delete', desc: 'Clear glyph' },
  { key: '↑ ↓ ← →', desc: '↑ ↓ ← →' },
  { key: 'Ctrl+↑ ↓ ← →', desc: 'Navigate glyph grid' },
  { key: 'A-Z, 0-9', desc: 'Jump to that glyph' },
]

export function AppTitle() {
  return (
    <span class="flex items-center w-full gap-1">
      <span class="font-black tracking-tight">Ch8ter</span>
      <span class="flex-1" />
      <button
        class="font-normal text-xs text-gray-400 hover:text-blue-500"
        onClick={(e) => {
          e.stopPropagation()
          showChangelog.value = !showChangelog.value
        }}
        title="Show changelog"
      >
        v{APP_VERSION}
      </button>
      <span class="flex-1" />
      <button
        class="font-bold text-xs text-gray-400 hover:text-blue-500 w-5 h-5 rounded-full border border-gray-300 flex items-center justify-center"
        onClick={(e) => {
          e.stopPropagation()
          showHotkeys.value = !showHotkeys.value
        }}
        title="Keyboard shortcuts"
      >
        ?
      </button>
    </span>
  )
}

export function AppPane() {
  const [showNewDialog, setShowNewDialog] = useState(false)
  const workspaceInputRef = useRef<HTMLInputElement>(null)

  // Warn before leaving with unsaved fonts
  useEffect(() => {
    function onBeforeUnload(e: BeforeUnloadEvent) {
      if (fonts.value.some(f => f.dirty.value)) {
        e.preventDefault()
        e.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [])
  const [pngFile, setPngFile] = useState<File | null>(null)
  const [rawFile, setRawFile] = useState<File | null>(null)
  const [error, setError] = useState<{ title: string; message: string } | null>(null)
  const [confirmAction, setConfirmAction] = useState<{
    title: string
    message: string
    confirmLabel: string
    confirmClass?: string
    onConfirm: () => void
  } | null>(null)

  function applyLoadResult(name: string, result: FontConversionData) {
    const font = createFont(
      result.fontData, name, result.startChar,
      result.glyphWidth, result.glyphHeight,
      result.meta ?? undefined, result.encodings ?? undefined,
      result.baseline, result.glyphMeta ?? undefined,
      result.spacingMode, result.tracking,
    )
    if (result.populated) font.populatedGlyphs.value = result.populated
    if (result.source === 'gdos' && result.ascender !== undefined) {
      font.ascender.value = result.ascender
    }
    if (result.source === 'gdos' && result.descender !== undefined) {
      font.descender.value = result.descender
    }
    switchCharset(result.detectedCharset as Charset)
    if (result.useCalcMissing) calcMissingMetrics(font)
    else recalcMetrics(font)
    addFont(font)
  }

  function openFontBuffer(name: string, buf: ArrayBuffer) {
    const lower = name.toLowerCase()

    // .fon files are NE executables containing FNT font resources
    if (lower.endsWith(".fon")) {
      try {
        const result = parseFon(buf)
        const fonts: ContainerFont[] = result.fonts.map(f => ({
          label: `${f.fnt.glyphWidth}x${f.fnt.glyphHeight}`,
          codepage: winCharsetToCodepage(parseInt(f.fnt.meta?.properties?.CHARSET ?? '1')),
          deviceName: '',
          deviceType: 1,
          startChar: f.fnt.startChar,
          width: f.fnt.glyphWidth,
          height: f.fnt.glyphHeight,
          numChars: f.fnt.fontData.length / (f.fnt.glyphHeight * Math.ceil(f.fnt.glyphWidth / 8)),
          fontData: f.fnt.fontData,
          baseline: f.fnt.baseline,
          meta: f.fnt.meta,
          glyphMeta: f.fnt.glyphMeta,
          populated: f.fnt.populated,
          spacingMode: f.fnt.glyphMeta?.some(g => g?.dwidth && g.dwidth[0] > 0 && g.dwidth[0] !== f.fnt.glyphWidth) ? 'proportional' : 'monospace',
        }))
        addContainer({
          id: createContainerId(),
          fileName: name,
          format: 'Windows FON (NE)',
          meta: null,
          fonts,
        })
      } catch (e) {
        setError({ title: 'Failed to open FON', message: (e as Error).message })
      }
      return
    }

    // .cpx files are UPX-compressed .cpi  —  decompress and handle as .cpi
    if (lower.endsWith(".cpx")) {
      try {
        const cpiData = decompressCpx(new Uint8Array(buf))
        openFontBuffer(name.replace(/\.cpx$/i, '.cpi'), cpiData.buffer as ArrayBuffer)
      } catch (e) {
        setError({ title: 'Failed to decompress CPX', message: (e as Error).message })
      }
      return
    }

    // .cpi files are font containers  —  show in container pane
    if (lower.endsWith(".cpi")) {
      try {
        const result = parseCpi(buf)
        if (result.fonts.length === 0) {
          setError({ title: 'No bitmap data', message: `${name} contains no bitmap font data.\n\nThis CPI file only contains escape sequences for selecting built-in printer fonts  —  there are no downloadable character bitmaps to edit.` })
          return
        }
        const fonts: ContainerFont[] = result.fonts.map(f => ({
          label: `CP${f.codepage} ${f.width}x${f.height} (${f.deviceName})`,
          codepage: f.codepage,
          deviceName: f.deviceName,
          deviceType: f.deviceType,
          startChar: 0,
          width: f.width,
          height: f.height,
          numChars: f.numChars,
          fontData: f.fontData,
        }))
        addContainer({
          id: createContainerId(),
          fileName: name,
          format: `CPI (${result.variant})`,
          meta: { properties: result.properties },
          fonts,
        })
      } catch (e) {
        setError({ title: 'Failed to open CPI', message: (e as Error).message })
      }
      return
    }

    // TAP files are ZX Spectrum tape images; extract font-sized CODE blocks
    if (lower.endsWith(".tap")) {
      try {
        const entries = extractTapFonts(new Uint8Array(buf))
        if (entries.length === 0) {
          setError({ title: 'No fonts in TAP', message: `${name} contains no font-sized CODE blocks (768/1024/2048 bytes of 8x8 glyphs).` })
          return
        }
        const fonts: ContainerFont[] = entries.map(f => ({
          label: f.label,
          codepage: 0,
          deviceName: '',
          deviceType: 1,
          startChar: 0,
          width: 8,
          height: 8,
          numChars: f.numChars,
          fontData: f.fontData,
          charsetKey: 'zx',
        }))
        addContainer({
          id: createContainerId(),
          fileName: name,
          format: 'ZX Spectrum TAP',
          meta: null,
          fonts,
        })
      } catch (e) {
        setError({ title: 'Failed to open TAP', message: (e as Error).message })
      }
      return
    }

    // CVT files are C64 GEOS fonts  —  one point size per VLIR record
    if (lower.endsWith(".cvt")) {
      try {
        const sets = parseGeosCvt(new Uint8Array(buf))
        if (sets.length === 0) {
          setError({ title: 'No fonts in CVT', message: `${name} contains no glyph data.` })
          return
        }
        const fonts: ContainerFont[] = sets.map(s => ({
          label: s.size > 0 ? `${s.size} pt` : 'mega',
          codepage: 0,
          deviceName: '',
          deviceType: 1,
          startChar: 0x20,
          width: s.glyphWidth,
          height: s.glyphHeight,
          numChars: s.populated.size,
          fontData: s.fontData,
          baseline: s.ascent,
          glyphMeta: s.glyphMeta,
          populated: s.populated,
          spacingMode: 'proportional',
          charsetKey: 'iso8859_1',
        }))
        addContainer({
          id: createContainerId(),
          fileName: name,
          format: 'C64 GEOS font',
          meta: null,
          fonts,
        })
      } catch (e) {
        setError({ title: 'Failed to open GEOS font', message: (e as Error).message })
      }
      return
    }

    // TTF/OTF files  —  check for embedded bitmaps
    if (lower.endsWith(".ttf") || lower.endsWith(".otf")) {
      if (!isSbitFont(buf)) {
        setError({ title: 'No bitmap data', message: 'This TTF/OTF font contains only vector outlines  —  no embedded bitmaps found.' })
        return
      }
      try {
        const result = parseSbit(buf)
        if (result.strikes.length === 1) {
          // Single strike  —  open as regular font
          const s = result.strikes[0]
          const font = createFont(
            s.fontData, name, s.startChar, s.glyphWidth, s.glyphHeight,
            s.meta, undefined, s.baseline, s.glyphMeta, s.spacingMode,
          )
          font.populatedGlyphs.value = s.populated
          recalcMetrics(font)
          calcMissingMetrics(font)
          addFont(font)
        } else {
          // Multiple strikes  —  show as container
          const fonts: ContainerFont[] = result.strikes.map(s => ({
            label: `${s.ppemX}×${s.ppemY}`,
            codepage: 0,
            deviceName: '',
            deviceType: 1,
            startChar: s.startChar,
            width: s.glyphWidth,
            height: s.glyphHeight,
            numChars: s.populated.size,
            fontData: s.fontData,
            baseline: s.baseline,
            meta: s.meta,
            glyphMeta: s.glyphMeta,
            populated: s.populated,
            spacingMode: s.spacingMode,
          }))
          addContainer({
            id: createContainerId(),
            fileName: name,
            format: 'TTF sbit',
            meta: null,
            fonts,
          })
        }
      } catch (e) {
        setError({ title: 'Failed to open TTF', message: (e as Error).message })
      }
      return
    }

    // .com files can contain multiple fonts  —  handle separately
    if (lower.endsWith(".com")) {
      try {
        const results = openCom(buf)
        switchCharset((results[0].source === "cpm" ? "cpm" : "cp437") as Charset)
        for (const result of results) {
          const suffix = results.length > 1 ? ` (${result.glyphWidth}×${result.glyphHeight})` : ''
          const font = createFont(
            result.fontData, name + suffix, result.startChar,
            result.glyphWidth, result.glyphHeight,
          )
          recalcMetrics(font)
          addFont(font)
        }
      } catch (e) {
        setError({ title: 'Failed to open font', message: (e as Error).message })
      }
      return
    }

    // BMFont text descriptors need their PNG pages; tell the user how to open them
    if (lower.endsWith(".fnt") && isBmFontText(buf)) {
      setError({ title: 'BMFont descriptor', message: `${name} is an AngelCode BMFont descriptor.\n\nDrop the .fnt file together with its PNG texture page(s) to open it.` })
      return
    }

    try {
      const result = loadFontFile(name, buf)
      applyLoadResult(name, result)
    } catch (e) {
      if (e instanceof UnknownFormatError) {
        setRawFile(new File([buf], name))
      } else {
        setError({ title: 'Failed to open font', message: (e as Error).message })
      }
    }
  }

  /** Load an image File into ImageData via an object URL. */
  function loadPageImage(file: File): Promise<ImageData> {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file)
      const image = new Image()
      image.onload = () => {
        URL.revokeObjectURL(url)
        resolve(imageToData(image))
      }
      image.onerror = () => {
        URL.revokeObjectURL(url)
        reject(new Error(`Could not read image: ${file.name}`))
      }
      image.src = url
    })
  }

  /** Open an AngelCode BMFont descriptor together with its PNG page files. */
  async function openBmFont(name: string, buf: ArrayBuffer, pageFiles: File[]) {
    try {
      const desc = parseBmFont(new TextDecoder().decode(buf))

      // Resolve each page to a dropped PNG by file name (case-insensitive)
      const byName = new Map(pageFiles.map(f => [f.name.toLowerCase(), f]))
      const missing: string[] = []
      const loaded = new Map<number, ImageData>()
      for (const page of desc.pages) {
        const base = page.file.replace(/^.*[\\/]/, '').toLowerCase()
        const file = byName.get(base)
        if (!file) { missing.push(page.file); continue }
        loaded.set(page.id, await loadPageImage(file))
      }
      if (missing.length > 0) {
        setError({ title: 'Missing BMFont pages', message: `${name} references pages that were not found in the drop:\n\n${missing.join('\n')}\n\nDrop the descriptor together with its PNG page files.` })
        return
      }

      const build = (pageId: number) => {
        const imageData = loaded.get(pageId)!
        return buildFontFromPage(desc, pageId, imageData)
      }

      if (desc.pages.length === 1) {
        const built = build(desc.pages[0].id)
        const bpg = built.glyphHeight * Math.ceil(built.glyphWidth / 8)
        applyLoadResult(name, {
          fontData: built.fontData,
          glyphWidth: built.glyphWidth,
          glyphHeight: built.glyphHeight,
          startChar: built.startChar,
          glyphCount: bpg > 0 ? Math.floor(built.fontData.length / bpg) : 0,
          baseline: built.baseline,
          meta: { format: 'BMFont', properties: {}, family: built.fontName || undefined },
          encodings: null,
          glyphMeta: built.glyphMeta,
          populated: built.populated,
          fontName: built.fontName || name,
          spacingMode: built.spacingMode,
          detectedCharset: 'win1252',
          useCalcMissing: false,
        })
      } else {
        const fonts: ContainerFont[] = desc.pages.map(page => {
          const built = build(page.id)
          return {
            label: page.file.replace(/^.*[\\/]/, ''),
            codepage: 1252,
            deviceName: '',
            deviceType: 1,
            startChar: built.startChar,
            width: built.glyphWidth,
            height: built.glyphHeight,
            numChars: built.populated.size,
            fontData: built.fontData,
            baseline: built.baseline,
            meta: { properties: {}, family: built.fontName || undefined },
            glyphMeta: built.glyphMeta,
            populated: built.populated,
            spacingMode: built.spacingMode,
            charsetKey: 'win1252',
          }
        })
        addContainer({
          id: createContainerId(),
          fileName: name,
          format: 'AngelCode BMFont',
          meta: null,
          fonts,
        })
      }
    } catch (e) {
      setError({ title: 'Failed to open BMFont', message: (e as Error).message })
    }
  }

  async function openFontFile(file: File) {
    const lower = file.name.toLowerCase()

    if (lower.endsWith(".png")) {
      setPngFile(file)
      return
    }

    if (lower.endsWith(".gz")) {
      const innerName = file.name.slice(0, -3)
      try {
        const buf = await file.arrayBuffer()
        const decompressed = await decompressGz(buf)
        openFontBuffer(innerName, decompressed)
      } catch (e) {
        setError({ title: 'Failed to decompress', message: (e as Error).message })
      }
      return
    }

    try {
      const buf = await file.arrayBuffer()
      openFontBuffer(file.name, buf)
    } catch (e) {
      setError({ title: 'Failed to open font', message: (e as Error).message })
    }
  }

  async function openFontUrl(url: string) {
    const trimmed = url.trim()
    if (!/^https?:\/\//i.test(trimmed)) return

    let name = 'download'
    try {
      const parsed = new URL(trimmed)
      name = decodeURIComponent(parsed.pathname.split('/').filter(Boolean).pop() ?? name)
    } catch {
      // Keep default name for malformed URLs.
    }
    if (!name) name = 'download'

    try {
      const response = await fetch(trimmed)
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }
      const buf = await response.arrayBuffer()
      const lower = name.toLowerCase()

      if (lower.endsWith(".png")) {
        setPngFile(new File([buf], name))
        return
      }

      if (lower.endsWith(".bin") || lower.endsWith(".raw")) {
        setRawFile(new File([buf], name))
        return
      }

      if (lower.endsWith(".gz")) {
        const innerName = name.slice(0, -3)
        const decompressed = await decompressGz(buf)
        openFontBuffer(innerName, decompressed)
        return
      }

      openFontBuffer(name, buf)
    } catch (e) {
      setError({ title: 'Failed to fetch font', message: (e as Error).message })
    }
  }

  function extractDropUrls(dt: DataTransfer): string[] {
    const urls: string[] = []
    const uriList = dt.getData('text/uri-list')
    if (uriList) {
      for (const line of uriList.split(/\r?\n/)) {
        const trimmed = line.trim()
        if (!trimmed || trimmed.startsWith('#')) continue
        urls.push(trimmed)
      }
    } else {
      const text = dt.getData('text/plain')
      const trimmed = text.trim()
      if (/^https?:\/\//i.test(trimmed)) urls.push(trimmed)
    }
    return urls
  }

  useEffect(() => {
    const handleDragOver = (event: DragEvent) => {
      event.preventDefault()
    }

    const handleDrop = async (event: DragEvent) => {
      event.preventDefault()
      const dt = event.dataTransfer
      if (!dt) return

      const files = Array.from(dt.files ?? [])
      const urls = extractDropUrls(dt)

      // BMFont descriptors consume their PNG pages from the same drop
      const used = new Set<File>()
      for (const file of files) {
        if (!file.name.toLowerCase().endsWith('.fnt')) continue
        const buf = await file.arrayBuffer()
        if (!isBmFontText(buf)) continue
        used.add(file)
        const pages = files.filter(f => !used.has(f) && f.name.toLowerCase().endsWith('.png'))
        await openBmFont(file.name, buf, pages)
        for (const p of pages) used.add(p)
      }

      for (const file of files) {
        if (!used.has(file)) await openFontFile(file)
      }
      for (const url of urls) {
        await openFontUrl(url)
      }
    }

    window.addEventListener('dragover', handleDragOver)
    window.addEventListener('drop', handleDrop)

    return () => {
      window.removeEventListener('dragover', handleDragOver)
      window.removeEventListener('drop', handleDrop)
    }
  }, [])

  function handleOpen() {
    const input = document.createElement("input")
    input.type = "file"
    input.accept =
      ".ch8,.64c,.com,.bbc,.bdf,.psf,.psfu,.yaff,.draw,.fzx,.fnt,.fon,.pcf,.pdb,.ttf,.otf,.png,.bin,.raw,.cpi,.cpx,.gz,*"
    input.onchange = () => {
      const file = input.files?.[0]
      if (!file) return
      openFontFile(file)
    }
    input.click()
  }

  function handleCloseAllFonts() {
    if (confirmAction) return
    setConfirmAction({
      title: 'Close all fonts?',
      message: 'This will close all open fonts, including any unsaved changes.',
      confirmLabel: 'Close all fonts',
      confirmClass: 'px-4 py-1.5 rounded bg-red-600 text-white text-sm hover:bg-red-700',
      onConfirm: () => {
        removeAllFontsAndContainers()
        setConfirmAction(null)
      },
    })
  }

  function handleResetLocalStorage() {
    if (confirmAction) return
    setConfirmAction({
      title: 'Reset local storage?',
      message: 'This will remove all saved fonts, layout, and container data from this browser. This cannot be undone.',
      confirmLabel: 'Reset local storage',
      confirmClass: 'px-4 py-1.5 rounded bg-red-600 text-white text-sm hover:bg-red-700',
      onConfirm: () => {
        localStorage.clear()
        removeAllFonts()
        window.location.reload()
      },
    })
  }

  function download(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  function handleExportWorkspace() {
    try {
      const json = exportWorkspace()
      const date = new Date().toISOString().slice(0, 10).replace(/-/g, '')
      download(new Blob([json], { type: 'application/json' }), `ch8ter-workspace-${date}.json`)
    } catch (e) {
      setError({ title: 'Failed to export workspace', message: (e as Error).message })
    }
  }

  async function handleImportWorkspace(file: File) {
    if (confirmAction) return
    let json: string
    let file_: ReturnType<typeof parseWorkspaceFile>
    try {
      json = await file.text()
      file_ = parseWorkspaceFile(json)
    } catch (e) {
      setError({ title: 'Failed to read workspace', message: (e as Error).message })
      return
    }
    const exported = file_.exported ? `Exported ${file_.exported.slice(0, 10)}.` : ''
    setConfirmAction({
      title: 'Import workspace?',
      message: `This will replace all open fonts, containers, and window layout with the workspace in ${file.name}. ${exported}\n\nUnsaved changes in the current fonts will be lost.`,
      confirmLabel: 'Import workspace',
      onConfirm: () => {
        try {
          importWorkspace(json)
        } catch (e) {
          setError({ title: 'Failed to import workspace', message: (e as Error).message })
        }
        setConfirmAction(null)
      },
    })
  }

  function handleImportWorkspaceInput(e: Event) {
    const input = e.target as HTMLInputElement
    const file = input.files?.[0]
    input.value = ''
    if (file) void handleImportWorkspace(file)
  }

  function menuItem(label: string, fn: () => void, close: () => void) {
    return (
      <button
        class="flex items-center gap-2 w-full px-3 py-1.5 text-left hover:bg-blue-50 rounded"
        onClick={() => { fn(); close() }}
      >
        {label}
      </button>
    )
  }

  return (
    <div>
      <div class="flex items-center gap-3 px-3 py-2">
        <IconBtn onClick={() => setShowNewDialog(true)} title="New font">
          <FilePlus size={ICON} />
        </IconBtn>
        {showNewDialog && (
          <NewFontDialog onClose={() => setShowNewDialog(false)} />
        )}
        {pngFile && (
          <PngImportDialog file={pngFile} onClose={() => setPngFile(null)} />
        )}
        {rawFile && (
          <RawImportDialog file={rawFile} onClose={() => setRawFile(null)} />
        )}
        {error && (
          <ErrorDialog title={error.title} message={error.message} onClose={() => setError(null)} />
        )}
        {confirmAction && (
          <ConfirmActionDialog
            title={confirmAction.title}
            message={confirmAction.message}
            confirmLabel={confirmAction.confirmLabel}
            confirmClass={confirmAction.confirmClass}
            onConfirm={confirmAction.onConfirm}
            onCancel={() => setConfirmAction(null)}
          />
        )}
        <IconBtn onClick={handleOpen} title="Open font file">
          <FolderOpen size={ICON} />
        </IconBtn>
        <input
          ref={workspaceInputRef}
          type="file"
          accept=".json,application/json"
          class="hidden"
          onChange={handleImportWorkspaceInput}
        />
        <Dropdown
          title="More"
          button={<MoreVertical size={ICON} />}
          buttonClass="p-1.5 bg-white hover:bg-blue-50 rounded border border-gray-300 flex items-center justify-center"
          popupClass="w-48"
          align="left"
          portal
        >
          {(close) => (
            <>
              {menuItem('Export Workspace…', handleExportWorkspace, close)}
              {menuItem('Import Workspace…', () => workspaceInputRef.current?.click(), close)}
              <div class="border-t border-gray-200 my-1" />
              {menuItem(theme.value === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode', toggleTheme, close)}
              <div class="border-t border-gray-200 my-1" />
              {menuItem('Close All Fonts', handleCloseAllFonts, close)}
              {menuItem('Reset Local Storage', handleResetLocalStorage, close)}
            </>
          )}
        </Dropdown>
        <span class="w-px h-6 bg-gray-300 mx-0.5" />
        <div class="flex flex-col">
          <span class="text-sm text-gray-600">Online Bitmap Font Editor</span>
          <a
            class="text-sm text-blue-500 hover:text-blue-700 underline"
            href="https://github.com/damieng/ch8ter"
            target="_blank"
          >
            https://github.com/damieng/ch8ter
          </a>
        </div>
      </div>
      {showChangelog.value && (
        <div class="px-3 pb-3 border-t border-gray-200 mt-1 pt-2 max-h-48 overflow-y-auto">
          {CHANGELOG.map((release) => (
            <div key={release.version} class="mb-2 last:mb-0">
              <div class="text-xs font-bold text-gray-600">
                v{release.version} - {release.date}
              </div>
              <ul class="text-xs text-gray-500 ml-3 list-disc">
                {release.changes.map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
      {showHotkeys.value && (
        <div class="px-3 pb-3 border-t border-gray-200 mt-1 pt-2">
          <div class="flex gap-1 mb-2">
            {(['shortcuts', 'formats', 'codepages'] as const).map(tab => (
              <button
                key={tab}
                class={`px-2 py-0.5 text-xs rounded ${helpTab.value === tab ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                onClick={() => { helpTab.value = tab }}
              >
                {tab[0].toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </div>
          {helpTab.value === 'shortcuts' && (
            <table class="text-xs w-full">
              {HOTKEYS.map((h, i) => (
                <tr key={i}>
                  <td class="pr-3 py-0.5 whitespace-nowrap">
                    {h.key.split(', ').map((combo, ci) => (
                      <span key={ci}>
                        {ci > 0 && <span class="text-gray-400 mx-1">/</span>}
                        {combo.split('+').map((k, j) => (
                          <span key={j}>
                            {j > 0 && <span class="text-gray-400 mx-0.5">+</span>}
                            <kbd class="px-1.5 py-0.5 bg-gray-100 border border-gray-300 rounded text-gray-600 font-mono text-[10px] shadow-sm">{k.trim()}</kbd>
                          </span>
                        ))}
                      </span>
                    ))}
                  </td>
                  <td class="py-0.5 text-gray-600">{h.desc}</td>
                </tr>
              ))}
            </table>
          )}
          {helpTab.value === 'formats' && (
            <table class="text-xs w-full">
              {FORMATS.map((f, i) => (
                <tr key={i}>
                  <td class="py-0.5 text-gray-600">{f.name}</td>
                  <td class="py-0.5 text-gray-500 font-mono text-right">{f.exts || '(none)'}</td>
                </tr>
              ))}
            </table>
          )}
          {helpTab.value === 'codepages' && (
            <table class="text-xs w-full">
              {Object.entries(CHARSETS)
                .sort((a, b) => a[1].label.localeCompare(b[1].label, undefined, { numeric: true }))
                .map(([key, def]) => (
                  <tr key={key}>
                    <td class="py-0.5 text-gray-600">{def.label}</td>
                    <td class="py-0.5 text-gray-500 font-mono text-right">{key}</td>
                  </tr>
                ))}
            </table>
          )}
        </div>
      )}
    </div>
  )
}
