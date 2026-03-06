import { useState } from 'preact/hooks'
import { type FontInstance, glyphCount } from '../store'
import type { GlyphMeta } from '../bdfParser'

interface Props {
  font: FontInstance
  glyphIdx: number
  onClose: () => void
}

export function GlyphMetaDialog({ font, glyphIdx, onClose }: Props) {
  const gc = glyphCount(font)
  const charCode = font.startChar.value + glyphIdx
  const existing = font.glyphMeta.value?.[glyphIdx] ?? null

  const [name, setName] = useState(existing?.name ?? '')
  const [swidth, setSwidth] = useState(existing?.swidth ? existing.swidth.join(' ') : '')
  const [dwidth, setDwidth] = useState(existing?.dwidth ? existing.dwidth.join(' ') : '')
  const [bbx, setBbx] = useState(existing?.bbx ? existing.bbx.join(' ') : '')

  function handleSave() {
    const gm: GlyphMeta = {}
    if (name.trim()) gm.name = name.trim()
    if (swidth.trim()) {
      const parts = swidth.trim().split(/\s+/).map(Number)
      if (parts.length === 2) gm.swidth = [parts[0], parts[1]]
    }
    if (dwidth.trim()) {
      const parts = dwidth.trim().split(/\s+/).map(Number)
      if (parts.length === 2) gm.dwidth = [parts[0], parts[1]]
    }
    if (bbx.trim()) {
      const parts = bbx.trim().split(/\s+/).map(Number)
      if (parts.length === 4) gm.bbx = [parts[0], parts[1], parts[2], parts[3]]
    }

    const arr = font.glyphMeta.value ? [...font.glyphMeta.value] : new Array(gc).fill(null)
    while (arr.length < gc) arr.push(null)
    arr[glyphIdx] = Object.keys(gm).length > 0 ? gm : null
    font.glyphMeta.value = arr
    onClose()
  }

  const label = charCode >= 32 && charCode < 127
    ? `"${String.fromCharCode(charCode)}" (U+${charCode.toString(16).toUpperCase().padStart(4, '0')})`
    : `U+${charCode.toString(16).toUpperCase().padStart(4, '0')}`

  return (
    <div
      class="fixed inset-0 bg-black/40 flex items-center justify-center z-[200]"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div class="bg-white rounded-lg shadow-2xl border border-gray-300 p-5 flex flex-col gap-3 min-w-[350px] max-w-[450px]">
        <h2 class="font-bold text-lg">Glyph Properties — {label}</h2>
        <div class="flex flex-col gap-2">
          <div class="flex items-center gap-2">
            <span class="text-xs font-mono text-gray-600 w-16 shrink-0">NAME</span>
            <input
              class="flex-1 px-2 py-0.5 border border-gray-300 rounded text-sm font-mono min-w-0"
              value={name}
              placeholder="e.g. A, space, uni00E9"
              onInput={(e) => setName((e.target as HTMLInputElement).value)}
            />
          </div>
          <div class="flex items-center gap-2">
            <span class="text-xs font-mono text-gray-600 w-16 shrink-0">SWIDTH</span>
            <input
              class="flex-1 px-2 py-0.5 border border-gray-300 rounded text-sm font-mono min-w-0"
              value={swidth}
              placeholder="x y"
              onInput={(e) => setSwidth((e.target as HTMLInputElement).value)}
            />
          </div>
          <div class="flex items-center gap-2">
            <span class="text-xs font-mono text-gray-600 w-16 shrink-0">DWIDTH</span>
            <input
              class="flex-1 px-2 py-0.5 border border-gray-300 rounded text-sm font-mono min-w-0"
              value={dwidth}
              placeholder="x y"
              onInput={(e) => setDwidth((e.target as HTMLInputElement).value)}
            />
          </div>
          <div class="flex items-center gap-2">
            <span class="text-xs font-mono text-gray-600 w-16 shrink-0">BBX</span>
            <input
              class="flex-1 px-2 py-0.5 border border-gray-300 rounded text-sm font-mono min-w-0"
              value={bbx}
              placeholder="w h offX offY"
              onInput={(e) => setBbx((e.target as HTMLInputElement).value)}
            />
          </div>
        </div>
        <div class="flex justify-end gap-2">
          <button
            class="px-4 py-1.5 rounded border border-gray-300 text-sm hover:bg-gray-100"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            class="px-4 py-1.5 rounded bg-blue-600 text-white text-sm hover:bg-blue-700"
            onClick={handleSave}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  )
}
