import { useEffect, useState, useRef } from "preact/hooks"
import { signal } from "@preact/signals"
import { FilePlus, FolderOpen, MoreVertical } from "lucide-preact"
import { theme, toggleTheme } from "../theme"
import {
  openFont,
  addContainer,
  createContainerId,
  defaultCharset,
  isCharset,
  sortedCharsets,
  removeAllFonts,
  removeAllFontsAndContainers,
  exportWorkspace,
  importWorkspace,
  fonts,
  type ContainerFont,
} from "../store"
import { parseWorkspaceFile } from "../persistence"
import { type FontConversionData } from "../fontLoad"
import { describeOpenedFile } from "../openFile"
import { parseBmFont, buildFontFromPage, isBmFontText } from "../fileFormats/bmFontParser"
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
    const charsetKey = result.detectedCharset
    const options = isCharset(charsetKey) ? charsetKey : undefined
    // Only this font's codepage is set; other open fonts keep theirs
    if (options) defaultCharset.value = options
    openFont(
      result.fontData, name, result.startChar,
      result.glyphWidth, result.glyphHeight,
      {
        meta: result.meta ?? undefined,
        encodings: result.encodings ?? undefined,
        baseline: result.baseline,
        glyphMeta: result.glyphMeta ?? undefined,
        spacing: result.spacingMode,
        tracking: result.tracking,
        charset: options,
        populated: result.populated,
        useCalcMissing: result.useCalcMissing,
        // GDOS files record their own vertical metrics; detection must not win
        ascender: result.source === 'gdos' ? result.ascender : undefined,
        descender: result.source === 'gdos' ? result.descender : undefined,
      },
    )
  }

  /**
   * Open a file's bytes as fonts. Deciding what the file contains is done by
   * describeOpenedFile, which is pure; this only applies the outcome.
   */
  function openFontBuffer(name: string, buf: ArrayBuffer) {
    const outcome = describeOpenedFile(name, buf)
    switch (outcome.kind) {
      case 'error':
        setError({ title: outcome.title, message: outcome.message })
        return
      case 'raw':
        setRawFile(new File([outcome.buffer], outcome.name))
        return
      case 'container': {
        const { fileName, format, meta, fonts } = outcome.descriptor
        addContainer({ id: createContainerId(), fileName, format, meta, fonts })
        return
      }
      case 'fonts':
        // Several fonts in one file, all sharing a codepage
        if (isCharset(outcome.charsetKey)) defaultCharset.value = outcome.charsetKey
        for (const d of outcome.descriptors) applyLoadResult(d.name, d.result)
        return
      case 'font':
        applyLoadResult(outcome.descriptor.name, outcome.descriptor.result)
        return
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
              {sortedCharsets().map(([key, def]) => (
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
