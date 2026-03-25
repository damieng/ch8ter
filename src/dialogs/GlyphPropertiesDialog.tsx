import { useState } from 'preact/hooks'
import { type FontInstance, glyphCount } from '../store'
import type { GlyphMeta } from '../fileFormats/bdfParser'

interface Props {
  font: FontInstance
  glyphIdx: number
  onClose: () => void
}

export function GlyphPropertiesDialog({ font, glyphIdx, onClose }: Props) {
  const gc = glyphCount(font)
  const charCode = font.startChar.value + glyphIdx
  const existing = font.glyphMeta.value?.[glyphIdx] ?? null

  const existingCharIdx = font.charIndex?.value?.[glyphIdx]
  const [name, setName] = useState(existing?.name ?? '')
  const [swidth, setSwidth] = useState(existing?.swidth ? existing.swidth.join(' ') : '')
  const [dwidth, setDwidth] = useState(existing?.dwidth ? existing.dwidth.join(' ') : '')
  const [bbx, setBbx] = useState(existing?.bbx ? existing.bbx.join(' ') : '')
  const [charIdx, setCharIdx] = useState(existingCharIdx != null ? String(existingCharIdx) : '')
  const [charIdxError, setCharIdxError] = useState('')

  function handleSave() {
    // Validate charIndex uniqueness
    if (charIdx.trim() !== '' && font.charIndex) {
      const newVal = parseInt(charIdx.trim())
      if (isNaN(newVal) || newVal < 0) {
        setCharIdxError('Must be a non-negative integer')
        return
      }
      const existing = font.charIndex.value
      for (let i = 0; i < existing.length; i++) {
        if (i !== glyphIdx && existing[i] === newVal) {
          setCharIdxError(`Already used by glyph ${i + font.startChar.value}`)
          return
        }
      }
    }

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

    // Save charIndex
    if (font.charIndex) {
      const idxArr = [...font.charIndex.value]
      while (idxArr.length <= glyphIdx) idxArr.push(undefined)
      idxArr[glyphIdx] = charIdx.trim() !== '' ? parseInt(charIdx.trim()) : undefined
      font.charIndex.value = idxArr
    }

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
      <div class="bg-gray-50 rounded-lg shadow-2xl border border-gray-300 flex flex-col min-w-[350px] max-w-[450px]">
        <div class="px-5 py-2 bg-blue-100 border-b border-gray-300 rounded-t-lg">
          <h2 class="font-bold text-lg">Glyph Properties — {label}</h2>
        </div>
        <div class="flex flex-col gap-2 px-5 pt-4 pb-3">
          <div class="flex items-center gap-2">
            <span class="text-xs font-mono text-gray-600 w-20 shrink-0">NAME</span>
            <input
              class="flex-1 px-2 py-0.5 border border-gray-300 rounded text-sm font-mono min-w-0"
              value={name}
              placeholder="e.g. A, space, uni00E9"
              onInput={(e) => setName((e.target as HTMLInputElement).value)}
            />
          </div>
          <div class="flex items-center gap-2">
            <span class="text-xs font-mono text-gray-600 w-20 shrink-0">SWIDTH</span>
            <input
              class="flex-1 px-2 py-0.5 border border-gray-300 rounded text-sm font-mono min-w-0"
              value={swidth}
              placeholder="x y"
              onInput={(e) => setSwidth((e.target as HTMLInputElement).value)}
            />
          </div>
          <div class="flex items-center gap-2">
            <span class="text-xs font-mono text-gray-600 w-20 shrink-0">DWIDTH</span>
            <input
              class="flex-1 px-2 py-0.5 border border-gray-300 rounded text-sm font-mono min-w-0"
              value={dwidth}
              placeholder="x y"
              onInput={(e) => setDwidth((e.target as HTMLInputElement).value)}
            />
          </div>
          <div class="flex items-center gap-2">
            <span class="text-xs font-mono text-gray-600 w-20 shrink-0">BBX</span>
            <input
              class="flex-1 px-2 py-0.5 border border-gray-300 rounded text-sm font-mono min-w-0"
              value={bbx}
              placeholder="w h offX offY"
              onInput={(e) => setBbx((e.target as HTMLInputElement).value)}
            />
          </div>
          <div class="flex items-center gap-2">
            <span class="text-xs font-mono text-gray-600 w-20 shrink-0">INDEX</span>
            <input
              class={`flex-1 px-2 py-0.5 border rounded text-sm font-mono min-w-0 ${charIdxError ? 'border-red-400' : 'border-gray-300'}`}
              value={charIdx}
              placeholder="Original byte index"
              onInput={(e) => { setCharIdx((e.target as HTMLInputElement).value); setCharIdxError('') }}
            />
          </div>
          {charIdxError && <p class="text-xs text-red-500">{charIdxError}</p>}
        </div>
        <div class="flex justify-end gap-2 px-5 py-2 bg-gray-100 border-t border-gray-300 rounded-b-lg">
          <button
            class="px-4 py-1.5 rounded border border-gray-300 text-sm hover:bg-gray-100 bg-white"
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
