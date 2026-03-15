import { useState } from "preact/hooks"
import { signal } from "@preact/signals"
import { FilePlus, FolderOpen } from "lucide-preact"
import {
  createFont,
  addFont,
  loadFont,
  charset,
  recalcMetrics,
  calcMissingMetrics,
  type Charset,
} from "../store"
import { parseBdf } from "../fileFormats/bdfParser"
import { parsePsf, type PsfParseResult } from "../fileFormats/psfParser"
import { parseYaff } from "../fileFormats/yaffParser"
import { parseDraw } from "../fileFormats/drawParser"
import { parseFzx } from "../fileFormats/fzxParser"
import { openFnt } from "../fileFormats/fntOpener"
import { parseCpm } from "../fileFormats/cpmParser"
import { parsePcf } from "../fileFormats/pcfParser"
import { parsePdbFont } from "../fileFormats/pdbFontParser"
import { parseAmigaFont, isAmigaHunk } from "../fileFormats/amigaFontParser"
import { bdfCharsetMap } from "../codepages"
import { IconBtn } from "../components/IconBtn"
import { NewFontDialog } from "../dialogs/NewFontDialog"
import { PngImportDialog } from "../dialogs/PngImportDialog"
import CHANGELOG from "../change-log.json"

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

function layoutPsfGlyphs(psf: PsfParseResult): {
  fontData: Uint8Array
  startChar: number
  populated: Set<number> | null
} {
  const bpr = Math.ceil(psf.glyphWidth / 8)
  const bpg = psf.glyphHeight * bpr

  if (psf.unicodeMap && psf.unicodeMap.size > 0) {
    // Map glyphs by unicode codepoint into a contiguous range
    let minCp = 0x7fffffff,
      maxCp = 0
    for (const cp of psf.unicodeMap.keys()) {
      if (cp < minCp) minCp = cp
      if (cp > maxCp) maxCp = cp
    }
    const totalSlots = maxCp - minCp + 1
    const out = new Uint8Array(totalSlots * bpg)
    const populated = new Set<number>()
    for (const [cp, glyphIdx] of psf.unicodeMap) {
      const srcOff = glyphIdx * bpg
      const idx = cp - minCp
      const dstOff = idx * bpg
      out.set(psf.fontData.subarray(srcOff, srcOff + bpg), dstOff)
      populated.add(idx)
    }
    return { fontData: out, startChar: minCp, populated }
  }

  // No unicode table — treat as sequential from codepoint 0
  return { fontData: psf.fontData, startChar: 0, populated: null }
}

const showChangelog = signal(false)
const showHotkeys = signal(false)

const FORMATS: { exts: string; name: string }[] = [
  { exts: '.bdf .pcf',     name: 'X11' },
  { exts: '.psf',          name: 'Linux console' },
  { exts: '.yaff',         name: 'YAFF' },
  { exts: '.draw',         name: 'Acorn Draw' },
  { exts: '.ch8 .fzx',     name: 'ZX Spectrum' },
  { exts: '.fnt',          name: 'Atari ST GDOS' },
  { exts: '.fnt',          name: 'Windows FNT' },
  { exts: '.fnt',          name: 'Atari 8-bit' },
  { exts: '.pdb',          name: 'PalmOS' },
  { exts: '',              name: 'Amiga' },
  { exts: '.com',          name: 'CP/M Plus' },
  { exts: '.png',          name: 'PNG tile sheet' },
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

  function openFontBuffer(name: string, buf: ArrayBuffer) {
    const lower = name.toLowerCase()

    if (lower.endsWith(".draw")) {
      try {
        const text = new TextDecoder().decode(buf)
        const result = parseDraw(text)
        const font = createFont(
          result.fontData,
          name,
          result.startChar,
          result.glyphWidth,
          result.glyphHeight,
        )
        font.populatedGlyphs.value = result.populated
        recalcMetrics(font)
        addFont(font)
        charset.value = "iso8859_1"
      } catch (e) {
        alert(`Failed to parse .draw: ${(e as Error).message}`)
      }
    } else if (lower.endsWith(".yaff")) {
      try {
        const text = new TextDecoder().decode(buf)
        const result = parseYaff(text)
        const font = createFont(
          result.fontData,
          name,
          result.startChar,
          result.glyphWidth,
          result.glyphHeight,
        )
        if (result.name) font.fontName.value = result.name
        font.populatedGlyphs.value = result.populated
        recalcMetrics(font)
        addFont(font)
        charset.value = "iso8859_1"
      } catch (e) {
        alert(`Failed to parse YAFF: ${(e as Error).message}`)
      }
    } else if (lower.endsWith(".bdf")) {
      try {
        const text = new TextDecoder().decode(buf)
        const result = parseBdf(text)
        const hasPropSpacing = result.glyphMeta.some(
          (gm) =>
            gm?.dwidth &&
            gm.dwidth[0] > 0 &&
            gm.dwidth[0] !== result.glyphWidth,
        )
        const font = createFont(
          result.fontData,
          name,
          result.startChar,
          result.glyphWidth,
          result.glyphHeight,
          result.meta,
          result.encodings,
          result.baseline,
          result.glyphMeta,
          hasPropSpacing ? "proportional" : "monospace",
        )
        const populated = new Set<number>()
        if (result.glyphMeta) {
          for (let j = 0; j < result.glyphMeta.length; j++) {
            if (result.glyphMeta[j] !== null) populated.add(j)
          }
        }
        font.populatedGlyphs.value = populated
        calcMissingMetrics(font)
        addFont(font)
        let detectedCharset: Charset = "iso8859_1"
        if (result.meta?.properties) {
          const reg = result.meta.properties.CHARSET_REGISTRY ?? ""
          const enc = result.meta.properties.CHARSET_ENCODING ?? ""
          if (reg) {
            const key = `${reg}-${enc}`
            const mapped = bdfCharsetMap[key]
            if (mapped) detectedCharset = mapped as Charset
          }
        }
        charset.value = detectedCharset
      } catch (e) {
        alert(`Failed to parse BDF: ${(e as Error).message}`)
      }
    } else if (lower.endsWith(".psf") || lower.endsWith(".psfu")) {
      try {
        const result = parsePsf(buf)
        const { fontData, startChar, populated } = layoutPsfGlyphs(result)
        const font = createFont(
          fontData,
          name,
          startChar,
          result.glyphWidth,
          result.glyphHeight,
        )
        if (populated) font.populatedGlyphs.value = populated
        recalcMetrics(font)
        addFont(font)
        charset.value = "iso8859_1"
      } catch (e) {
        alert(`Failed to parse PSF: ${(e as Error).message}`)
      }
    } else if (lower.endsWith(".fzx")) {
      try {
        const result = parseFzx(buf)
        const font = createFont(
          result.fontData,
          name,
          result.startChar,
          result.glyphWidth,
          result.glyphHeight,
          undefined,
          undefined,
          undefined,
          result.glyphMeta,
          "proportional",
        )
        font.populatedGlyphs.value = result.populated
        recalcMetrics(font)
        addFont(font)
        charset.value = "iso8859_1"
      } catch (e) {
        alert(`Failed to parse FZX: ${(e as Error).message}`)
      }
    } else if (lower.endsWith(".fnt")) {
      try {
        const result = openFnt(buf)
        const hasPropSpacing = result.glyphMeta?.some(
          (gm) =>
            gm?.dwidth &&
            gm.dwidth[0] > 0 &&
            gm.dwidth[0] !== result.glyphWidth,
        ) ?? false
        const font = createFont(
          result.fontData,
          name,
          result.startChar,
          result.glyphWidth,
          result.glyphHeight,
          result.meta ?? undefined,
          undefined,
          result.baseline,
          result.glyphMeta ?? undefined,
          hasPropSpacing ? "proportional" : "monospace",
        )
        font.populatedGlyphs.value = result.populated
        if (result.source === "gdos") {
          font.ascender.value = result.ascender
          font.descender.value = result.descender
        }
        calcMissingMetrics(font)
        addFont(font)
        charset.value = result.source === "atari8bit" ? "atari"
          : result.source === "gdos" ? "atarist" : "iso8859_1"
      } catch (e) {
        alert(`Failed to parse .fnt: ${(e as Error).message}`)
      }
    } else if (lower.endsWith(".pcf")) {
      try {
        const result = parsePcf(buf)
        const hasPropSpacing = result.glyphMeta.some(
          (gm) =>
            gm?.dwidth &&
            gm.dwidth[0] > 0 &&
            gm.dwidth[0] !== result.glyphWidth,
        )
        const font = createFont(
          result.fontData,
          name,
          result.startChar,
          result.glyphWidth,
          result.glyphHeight,
          result.meta,
          result.encodings,
          result.baseline,
          result.glyphMeta,
          hasPropSpacing ? "proportional" : "monospace",
        )
        const populated = new Set<number>()
        if (result.glyphMeta) {
          for (let j = 0; j < result.glyphMeta.length; j++) {
            if (result.glyphMeta[j] !== null) populated.add(j)
          }
        }
        font.populatedGlyphs.value = populated
        calcMissingMetrics(font)
        addFont(font)
        let detectedCharset: Charset = "iso8859_1"
        if (result.meta?.properties) {
          const reg = result.meta.properties.CHARSET_REGISTRY ?? ""
          const enc = result.meta.properties.CHARSET_ENCODING ?? ""
          if (reg) {
            const key = `${reg}-${enc}`
            const mapped = bdfCharsetMap[key]
            if (mapped) detectedCharset = mapped as Charset
          }
        }
        charset.value = detectedCharset
      } catch (e) {
        alert(`Failed to parse PCF: ${(e as Error).message}`)
      }
    } else if (lower.endsWith(".pdb")) {
      try {
        const result = parsePdbFont(buf)
        const hasPropSpacing = result.glyphMeta.some(
          (gm) =>
            gm?.dwidth &&
            gm.dwidth[0] > 0 &&
            gm.dwidth[0] !== result.glyphWidth,
        )
        const font = createFont(
          result.fontData,
          name,
          result.startChar,
          result.glyphWidth,
          result.glyphHeight,
          result.meta,
          undefined,
          result.baseline,
          result.glyphMeta,
          hasPropSpacing ? "proportional" : "monospace",
        )
        font.populatedGlyphs.value = result.populated
        calcMissingMetrics(font)
        addFont(font)
        charset.value = "palmos"
      } catch (e) {
        alert(`Failed to parse Palm .pdb: ${(e as Error).message}`)
      }
    } else if (lower.endsWith(".com")) {
      try {
        const { fontData, glyphHeight } = parseCpm(buf)
        const font = createFont(fontData, name, 0, 8, glyphHeight)
        recalcMetrics(font)
        addFont(font)
        charset.value = "cpm"
      } catch (e) {
        alert(`Failed to extract font from .com: ${(e as Error).message}`)
      }
    } else if (isAmigaHunk(buf)) {
      try {
        const result = parseAmigaFont(buf)
        const hasPropSpacing = result.glyphMeta.some(
          (gm) =>
            gm?.dwidth &&
            gm.dwidth[0] > 0 &&
            gm.dwidth[0] !== result.glyphWidth,
        )
        const font = createFont(
          result.fontData,
          name,
          result.startChar,
          result.glyphWidth,
          result.glyphHeight,
          result.meta,
          undefined,
          result.baseline,
          result.glyphMeta,
          hasPropSpacing ? "proportional" : "monospace",
        )
        font.populatedGlyphs.value = result.populated
        calcMissingMetrics(font)
        addFont(font)
        charset.value = "amiga"
      } catch (e) {
        alert(`Failed to parse Amiga font: ${(e as Error).message}`)
      }
    } else {
      const font = createFont()
      loadFont(font, buf)
      font.fileName.value = name
      addFont(font)
      if (lower.endsWith(".ch8")) {
        charset.value = "zx"
      }
    }
  }

  function handleOpen() {
    const input = document.createElement("input")
    input.type = "file"
    input.accept =
      ".ch8,.com,.bin,.bdf,.psf,.psfu,.yaff,.draw,.fzx,.fnt,.pcf,.pdb,.png,.gz"
    input.onchange = () => {
      const file = input.files?.[0]
      if (!file) return
      const lower = file.name.toLowerCase()

      if (lower.endsWith(".png")) {
        setPngFile(file)
        return
      }

      if (lower.endsWith(".gz")) {
        const innerName = file.name.slice(0, -3)
        file.arrayBuffer().then(async (buf) => {
          try {
            const decompressed = await decompressGz(buf)
            openFontBuffer(innerName, decompressed)
          } catch (e) {
            alert(`Failed to decompress .gz: ${(e as Error).message}`)
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
                v{release.version}
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
          <div class="text-xs font-bold text-gray-600 mb-1">Keyboard Shortcuts</div>
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
          <div class="text-xs font-bold text-gray-600 mt-3 mb-1">Load &amp; Save Formats</div>
          <table class="text-xs w-full">
            {FORMATS.map((f, i) => (
              <tr key={i}>
                <td class="py-0.5 text-gray-600">{f.name}</td>
                <td class="py-0.5 text-gray-500 font-mono text-right">{f.exts || '(none)'}</td>
              </tr>
            ))}
          </table>
        </div>
      )}
    </div>
  )
}
