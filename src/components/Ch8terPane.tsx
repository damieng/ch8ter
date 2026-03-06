import { useState } from 'preact/hooks'
import { FilePlus, FolderOpen } from 'lucide-preact'
import { createFont, addFont, loadFont, charset, recalcMetrics, calcMissingMetrics } from '../store'
import { parseBdf } from '../bdfParser'
import { parsePsf, type PsfParseResult } from '../psfParser'
import { IconBtn } from './IconBtn'
import { NewFontDialog } from './NewFontDialog'

const ICON = 18

const BUILD_DATE = __BUILD_DATE__

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

export function Ch8terTitle() {
  return (
    <span class="flex items-center w-full">
      <span class="font-black tracking-tight">Ch8ter</span>
      <span class="ml-auto font-normal text-xs text-gray-400">{BUILD_DATE}</span>
    </span>
  )
}

export function Ch8terPane() {
  const [showNewDialog, setShowNewDialog] = useState(false)

  function handleOpen() {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.ch8,.bin,.bdf,.psf,.psfu,.gz'
    input.onchange = () => {
      const file = input.files?.[0]
      if (!file) return
      const lower = file.name.toLowerCase()
      if (lower.endsWith('.bdf')) {
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
            charset.value = 'imported'
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
    <div class="flex items-center gap-3 px-3 py-2">
      <IconBtn onClick={() => setShowNewDialog(true)} title="New font">
        <FilePlus size={ICON} />
      </IconBtn>
      {showNewDialog && <NewFontDialog onClose={() => setShowNewDialog(false)} />}
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
  )
}
