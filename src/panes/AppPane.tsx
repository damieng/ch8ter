import { useState } from "preact/hooks"
import { signal } from "@preact/signals"
import { FilePlus, FolderOpen } from "lucide-preact"
import {
  createFont,
  addFont,
  charset,
  recalcMetrics,
  calcMissingMetrics,
  CHARSETS,
  type Charset,
} from "../store"
import { loadFontFile, type FontConversionData } from "../fontLoad"
import { openCom } from "../fileFormats/comOpener"
import { parseCpi } from "../fileFormats/cpiParser"
import { decompressCpx } from "../fileFormats/cpxDecoder"
import { parseFon } from "../fileFormats/fonParser"
import { addContainer, createContainerId, type ContainerFont } from "../store"
import { IconBtn } from "../components/IconBtn"
import { NewFontDialog } from "../dialogs/NewFontDialog"
import { PngImportDialog } from "../dialogs/PngImportDialog"
import { RawImportDialog } from "../dialogs/RawImportDialog"
import { ErrorDialog } from "../dialogs/ErrorDialog"
import CHANGELOG from "../change-log.json"

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
  { exts: '.fnt .fon',     name: 'Windows FNT' },
  { exts: '.bdf .pcf',     name: 'X11' },
  { exts: '.yaff',         name: 'YAFF' },
  { exts: '.ch8 .fzx',     name: 'ZX Spectrum' },
]

const HOTKEYS: { key: string; desc: string }[] = [
  { key: 'Ctrl+Z', desc: 'Undo' },
  { key: 'Ctrl+Y', desc: 'Redo' },
  { key: 'Ctrl+A', desc: 'Select all glyphs' },
  { key: 'Ctrl+C', desc: 'Copy glyph' },
  { key: 'Ctrl+X', desc: 'Cut glyph' },
  { key: 'Ctrl+V', desc: 'Paste glyph' },
  { key: 'Delete', desc: 'Clear glyph' },
  { key: '↑ ↓ ← →', desc: 'Shift glyph pixels' },
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
  const [pngFile, setPngFile] = useState<File | null>(null)
  const [rawFile, setRawFile] = useState<File | null>(null)
  const [error, setError] = useState<{ title: string; message: string } | null>(null)

  function applyLoadResult(name: string, result: FontConversionData) {
    const font = createFont(
      result.fontData, name, result.startChar,
      result.glyphWidth, result.glyphHeight,
      result.meta ?? undefined, result.encodings ?? undefined,
      result.baseline, result.glyphMeta ?? undefined,
      result.spacingMode,
    )
    if (result.populated) font.populatedGlyphs.value = result.populated
    if (result.source === 'gdos' && result.ascender !== undefined) {
      font.ascender.value = result.ascender
    }
    if (result.source === 'gdos' && result.descender !== undefined) {
      font.descender.value = result.descender
    }
    if (result.useCalcMissing) calcMissingMetrics(font)
    else recalcMetrics(font)
    addFont(font)
    charset.value = result.detectedCharset as Charset
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

    // .cpx files are UPX-compressed .cpi — decompress and handle as .cpi
    if (lower.endsWith(".cpx")) {
      try {
        const cpiData = decompressCpx(new Uint8Array(buf))
        openFontBuffer(name.replace(/\.cpx$/i, '.cpi'), cpiData.buffer as ArrayBuffer)
      } catch (e) {
        setError({ title: 'Failed to decompress CPX', message: (e as Error).message })
      }
      return
    }

    // .cpi files are font containers — show in container pane
    if (lower.endsWith(".cpi")) {
      try {
        const result = parseCpi(buf)
        if (result.fonts.length === 0) {
          setError({ title: 'No bitmap data', message: `${name} contains no bitmap font data.\n\nThis CPI file only contains escape sequences for selecting built-in printer fonts — there are no downloadable character bitmaps to edit.` })
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

    // .com files can contain multiple fonts — handle separately
    if (lower.endsWith(".com")) {
      try {
        const results = openCom(buf)
        for (const result of results) {
          const suffix = results.length > 1 ? ` (${result.glyphWidth}×${result.glyphHeight})` : ''
          const font = createFont(
            result.fontData, name + suffix, result.startChar,
            result.glyphWidth, result.glyphHeight,
          )
          recalcMetrics(font)
          addFont(font)
        }
        charset.value = (results[0].source === "cpm" ? "cpm" : "cp437") as Charset
      } catch (e) {
        setError({ title: 'Failed to open font', message: (e as Error).message })
      }
      return
    }

    try {
      const result = loadFontFile(name, buf)
      applyLoadResult(name, result)
    } catch (e) {
      setError({ title: 'Failed to open font', message: (e as Error).message })
    }
  }

  function handleOpen() {
    const input = document.createElement("input")
    input.type = "file"
    input.accept =
      ".ch8,.64c,.com,.bbc,.bdf,.psf,.psfu,.yaff,.draw,.fzx,.fnt,.fon,.pcf,.pdb,.png,.bin,.raw,.cpi,.cpx,.gz"
    input.onchange = () => {
      const file = input.files?.[0]
      if (!file) return
      const lower = file.name.toLowerCase()

      if (lower.endsWith(".png")) {
        setPngFile(file)
        return
      }

      if (lower.endsWith(".bin") || lower.endsWith(".raw")) {
        setRawFile(file)
        return
      }

      if (lower.endsWith(".gz")) {
        const innerName = file.name.slice(0, -3)
        file.arrayBuffer().then(async (buf) => {
          try {
            const decompressed = await decompressGz(buf)
            openFontBuffer(innerName, decompressed)
          } catch (e) {
            setError({ title: 'Failed to decompress', message: (e as Error).message })
          }
        })
        return
      }

      file.arrayBuffer().then((buf) => openFontBuffer(file.name, buf))
    }
    input.click()
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
        <IconBtn onClick={handleOpen} title="Open font file">
          <FolderOpen size={ICON} />
        </IconBtn>
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
