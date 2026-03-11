import { useState } from 'preact/hooks'
import { signal } from '@preact/signals'
import { FilePlus, FolderOpen } from 'lucide-preact'
import { createFont, addFont, loadFont, charset, recalcMetrics, calcMissingMetrics, type Charset } from '../store'
import { parseBdf } from '../bdfParser'
import { parsePsf, type PsfParseResult } from '../psfParser'
import { parseYaff } from '../yaffParser'
import { parseDraw } from '../drawParser'
import { parseFzx } from '../fzxParser'
import { bdfCharsetMap } from '../codepages'
import { IconBtn } from './IconBtn'
import { NewFontDialog } from './NewFontDialog'
import { PngImportDialog } from './PngImportDialog'

const ICON = 18

const APP_VERSION = __APP_VERSION__

const CHANGELOG: { version: string; changes: string[] }[] = [
  {
    version: '0.9.0',
    changes: [
      'New Font dialog with size and codepage selection',
      'FZX font format load and save',
      'DOS CP437 and CP850 codepage support',
      'Unicode-aware glyph remapping when switching codepages',
      'Out-of-codepage glyphs shown with muted labels',
    ],
  },
  {
    version: '0.8.0',
    changes: [
      'CP/M Plus .com font load and save',
      'Source code export: C#, TypeScript, hex ASM formats',
      'Source code export: C, Rust, Z80, 6502, 68000, x86',
    ],
  },
  {
    version: '0.7.0',
    changes: [
      'BDF, PSF, YAFF, .draw format support',
      'TTF/WOFF export with variable font support',
      'PNG import for sprite sheets',
      'Font metrics: baseline, ascender, cap height, x-height, descender',
      'Glyph editor with pixel tools and transforms',
    ],
  },
]

// Extract font from a PSF2AMS CP/M .com file
// Header is 512 bytes; glyph height at offset 0x2F; font data starts at offset 512; always 256 glyphs
function extractCpmFont(buf: ArrayBuffer): { fontData: Uint8Array; glyphHeight: number } {
  const bytes = new Uint8Array(buf)
  if (bytes.length < 512) throw new Error('File too small to be a CP/M font .com')
  const glyphHeight = bytes[0x2F]
  if (glyphHeight === 0 || glyphHeight > 64) throw new Error(`Unexpected glyph height at 0x2F: ${glyphHeight}`)
  const bpg = glyphHeight // 8px wide = 1 byte per row
  const expected = 512 + 256 * bpg
  if (bytes.length < expected) throw new Error(`File too small for ${glyphHeight}px font (expected ${expected} bytes)`)
  return { fontData: bytes.slice(512, 512 + 256 * bpg), glyphHeight }
}

async function decompress(buf: ArrayBuffer, filename: string): Promise<ArrayBuffer> {
  if (!filename.endsWith('.gz')) return buf
  const ds = new DecompressionStream('gzip')
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
  for (const c of chunks) { out.set(c, off); off += c.length }
  return out.buffer
}

function layoutPsfGlyphs(psf: PsfParseResult): { fontData: Uint8Array; startChar: number; populated: Set<number> | null } {
  const bpr = Math.ceil(psf.glyphWidth / 8)
  const bpg = psf.glyphHeight * bpr

  if (psf.unicodeMap && psf.unicodeMap.size > 0) {
    // Map glyphs by unicode codepoint into a contiguous range
    let minCp = 0x7FFFFFFF, maxCp = 0
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

export function Ch8terTitle() {
  return (
    <span class="flex items-center w-full">
      <span class="font-black tracking-tight">Ch8ter</span>
      <button
        class="ml-auto font-normal text-xs text-gray-400 hover:text-blue-500"
        onClick={(e) => { e.stopPropagation(); showChangelog.value = !showChangelog.value }}
        title="Show changelog"
      >
        v{APP_VERSION}
      </button>
    </span>
  )
}

export function Ch8terPane() {
  const [showNewDialog, setShowNewDialog] = useState(false)
  const [pngFile, setPngFile] = useState<File | null>(null)

  function handleOpen() {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.ch8,.udg,.com,.bin,.bdf,.psf,.psfu,.yaff,.draw,.fzx,.png,.gz'
    input.onchange = () => {
      const file = input.files?.[0]
      if (!file) return
      const lower = file.name.toLowerCase()
      if (lower.endsWith('.png')) {
        setPngFile(file)
        return
      } else if (lower.endsWith('.draw')) {
        file.text().then(text => {
          try {
            const result = parseDraw(text)
            const font = createFont(result.fontData, file.name, result.startChar, result.glyphWidth, result.glyphHeight)
            font.populatedGlyphs.value = result.populated
            recalcMetrics(font)
            addFont(font)
            charset.value = 'imported'
          } catch (e) {
            alert(`Failed to parse .draw: ${(e as Error).message}`)
          }
        })
      } else if (lower.endsWith('.yaff')) {
        file.text().then(text => {
          try {
            const result = parseYaff(text)
            const font = createFont(result.fontData, file.name, result.startChar, result.glyphWidth, result.glyphHeight)
            font.populatedGlyphs.value = result.populated
            recalcMetrics(font)
            addFont(font)
            charset.value = 'imported'
          } catch (e) {
            alert(`Failed to parse YAFF: ${(e as Error).message}`)
          }
        })
      } else if (lower.endsWith('.bdf')) {
        file.text().then(text => {
          try {
            const result = parseBdf(text)
            const font = createFont(result.fontData, file.name, result.startChar, result.glyphWidth, result.glyphHeight, result.meta, result.encodings, result.baseline, result.glyphMeta)
            // Track which glyph slots were actually in the source file
            const populated = new Set<number>()
            if (result.glyphMeta) {
              for (let j = 0; j < result.glyphMeta.length; j++) {
                if (result.glyphMeta[j] !== null) populated.add(j)
              }
            }
            font.populatedGlyphs.value = populated
            calcMissingMetrics(font)
            addFont(font)
            // Auto-detect charset from BDF CHARSET_REGISTRY/CHARSET_ENCODING
            let detectedCharset: Charset = 'imported'
            if (result.meta?.properties) {
              const reg = result.meta.properties.CHARSET_REGISTRY ?? ''
              const enc = result.meta.properties.CHARSET_ENCODING ?? ''
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
        })
      } else if (lower.endsWith('.psf') || lower.endsWith('.psfu') || lower.endsWith('.psf.gz') || lower.endsWith('.psfu.gz')) {
        file.arrayBuffer().then(buf => decompress(buf, lower)).then(buf => {
          try {
            const result = parsePsf(buf)
            const { fontData, startChar, populated } = layoutPsfGlyphs(result)
            const name = file.name.replace(/\.gz$/i, '')
            const font = createFont(fontData, name, startChar, result.glyphWidth, result.glyphHeight)
            if (populated) font.populatedGlyphs.value = populated
            recalcMetrics(font)
            addFont(font)
            charset.value = 'imported'
          } catch (e) {
            alert(`Failed to parse PSF: ${(e as Error).message}`)
          }
        })
      } else if (lower.endsWith('.fzx')) {
        file.arrayBuffer().then(buf => {
          try {
            const result = parseFzx(buf)
            const font = createFont(result.fontData, file.name, result.startChar, result.glyphWidth, result.glyphHeight, undefined, undefined, undefined, result.glyphMeta)
            font.populatedGlyphs.value = result.populated
            recalcMetrics(font)
            addFont(font)
            charset.value = 'imported'
          } catch (e) {
            alert(`Failed to parse FZX: ${(e as Error).message}`)
          }
        })
      } else if (lower.endsWith('.com')) {
        file.arrayBuffer().then(buf => {
          try {
            const { fontData, glyphHeight } = extractCpmFont(buf)
            const font = createFont(fontData, file.name, 0, 8, glyphHeight)
            recalcMetrics(font)
            addFont(font)
            charset.value = 'cpm'
          } catch (e) {
            alert(`Failed to extract font from .com: ${(e as Error).message}`)
          }
        })
      } else if (lower.endsWith('.udg')) {
        file.arrayBuffer().then(buf => {
          const font = createFont(undefined, file.name, 0)
          loadFont(font, buf)
          addFont(font)
        })
      } else {
        file.arrayBuffer().then(buf => {
          const font = createFont()
          loadFont(font, buf)
          font.fileName.value = file.name
          addFont(font)
          if (lower.endsWith('.ch8')) {
            charset.value = 'zx'
          }
        })
      }
    }
    input.click()
  }

  return (
    <div>
      <div class="flex items-center gap-3 px-3 py-2">
        <IconBtn onClick={() => setShowNewDialog(true)} title="New font">
          <FilePlus size={ICON} />
        </IconBtn>
        {showNewDialog && <NewFontDialog onClose={() => setShowNewDialog(false)} />}
        {pngFile && <PngImportDialog file={pngFile} onClose={() => setPngFile(null)} />}
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
          {CHANGELOG.map(release => (
            <div key={release.version} class="mb-2 last:mb-0">
              <div class="text-xs font-bold text-gray-600">v{release.version}</div>
              <ul class="text-xs text-gray-500 ml-3 list-disc">
                {release.changes.map((c, i) => <li key={i}>{c}</li>)}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
