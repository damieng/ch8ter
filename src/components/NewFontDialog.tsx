import { useState } from 'preact/hooks'
import { type Charset, createFont, addFont, charset } from '../store'

const CODEPAGES: { value: Charset; label: string; startChar: number; glyphCount: number }[] = [
  { value: 'amiga', label: 'Amiga (ISO-8859-1)', startChar: 32, glyphCount: 224 },
  { value: 'cpc', label: 'Amstrad CPC', startChar: 0, glyphCount: 256 },
  { value: 'cpm', label: 'Amstrad CP/M Plus', startChar: 0, glyphCount: 256 },
  { value: 'ascii', label: 'ASCII', startChar: 32, glyphCount: 95 },
  { value: 'atari', label: 'Atari 8-bit', startChar: 32, glyphCount: 96 },
  { value: 'bbc', label: 'BBC Micro', startChar: 32, glyphCount: 96 },
  { value: 'c64', label: 'Commodore 64', startChar: 32, glyphCount: 96 },
  { value: 'cp437', label: 'DOS (CP437)', startChar: 0, glyphCount: 256 },
  { value: 'cp850', label: 'DOS (CP850)', startChar: 0, glyphCount: 256 },
  { value: 'msx', label: 'MSX', startChar: 32, glyphCount: 96 },
  { value: 'sam', label: 'SAM Coupe', startChar: 32, glyphCount: 96 },
  { value: 'zx', label: 'ZX Spectrum', startChar: 32, glyphCount: 96 },
]

interface Props {
  onClose: () => void
}

export function NewFontDialog({ onClose }: Props) {
  const [width, setWidth] = useState(8)
  const [height, setHeight] = useState(8)
  const [codepage, setCodepage] = useState<Charset>('ascii')

  function handleCreate() {
    const cp = CODEPAGES.find(c => c.value === codepage)!
    const bpr = Math.ceil(width / 8)
    const bpg = height * bpr
    const data = new Uint8Array(cp.glyphCount * bpg)
    const font = createFont(data, 'untitled', cp.startChar, width, height)
    font.hideEmpty.value = false
    addFont(font)
    charset.value = codepage
    onClose()
  }

  return (
    <div
      class="fixed inset-0 bg-black/40 flex items-center justify-center z-[200]"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div class="bg-white rounded-lg shadow-2xl border border-gray-300 p-5 flex flex-col gap-4" style={{ width: 340 }}>
        <h2 class="font-bold text-lg">New Font</h2>

        <div class="flex flex-col gap-3">
          <div class="flex items-center gap-3">
            <label class="text-sm w-20 text-right">Width</label>
            <input
              type="number"
              min={1}
              max={32}
              value={width}
              onInput={(e) => setWidth(Math.max(1, Math.min(32, parseInt((e.target as HTMLInputElement).value) || 1)))}
              class="border border-gray-300 rounded px-2 py-1 text-sm w-20"
            />
            <span class="text-xs text-gray-400">px</span>
          </div>
          <div class="flex items-center gap-3">
            <label class="text-sm w-20 text-right">Height</label>
            <input
              type="number"
              min={1}
              max={64}
              value={height}
              onInput={(e) => setHeight(Math.max(1, Math.min(64, parseInt((e.target as HTMLInputElement).value) || 1)))}
              class="border border-gray-300 rounded px-2 py-1 text-sm w-20"
            />
            <span class="text-xs text-gray-400">px</span>
          </div>
          <div class="flex items-center gap-3">
            <label class="text-sm w-20 text-right">Codepage</label>
            <select
              value={codepage}
              onChange={(e) => setCodepage((e.target as HTMLSelectElement).value as Charset)}
              class="border border-gray-300 rounded px-2 py-1 text-sm flex-1"
            >
              {CODEPAGES.map(cp => (
                <option key={cp.value} value={cp.value}>{cp.label} ({cp.glyphCount} glyphs)</option>
              ))}
            </select>
          </div>
        </div>

        <div class="flex justify-end gap-2">
          <button
            class="px-4 py-1.5 rounded border border-gray-300 hover:bg-gray-50"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            class="px-4 py-1.5 rounded bg-blue-500 text-white hover:bg-blue-600"
            onClick={handleCreate}
          >
            Create
          </button>
        </div>
      </div>
    </div>
  )
}
