import { useState } from 'preact/hooks'
import { type Charset, createFont, addFont, charset } from '../store'
import { bpr } from '../bitUtils'
import { DialogOverlay } from '../components/DialogOverlay'

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
  { value: 'iso8859_1', label: 'ISO 8859-1 (Latin-1)', startChar: 32, glyphCount: 224 },
  { value: 'iso8859_2', label: 'ISO 8859-2 (Central European)', startChar: 32, glyphCount: 224 },
  { value: 'iso8859_3', label: 'ISO 8859-3 (South European)', startChar: 32, glyphCount: 224 },
  { value: 'iso8859_4', label: 'ISO 8859-4 (North European)', startChar: 32, glyphCount: 224 },
  { value: 'iso8859_5', label: 'ISO 8859-5 (Cyrillic)', startChar: 32, glyphCount: 224 },
  { value: 'iso8859_6', label: 'ISO 8859-6 (Arabic)', startChar: 32, glyphCount: 224 },
  { value: 'iso8859_7', label: 'ISO 8859-7 (Greek)', startChar: 32, glyphCount: 224 },
  { value: 'iso8859_8', label: 'ISO 8859-8 (Hebrew)', startChar: 32, glyphCount: 224 },
  { value: 'iso8859_9', label: 'ISO 8859-9 (Turkish)', startChar: 32, glyphCount: 224 },
  { value: 'iso8859_10', label: 'ISO 8859-10 (Nordic)', startChar: 32, glyphCount: 224 },
  { value: 'iso8859_13', label: 'ISO 8859-13 (Baltic)', startChar: 32, glyphCount: 224 },
  { value: 'iso8859_14', label: 'ISO 8859-14 (Celtic)', startChar: 32, glyphCount: 224 },
  { value: 'iso8859_15', label: 'ISO 8859-15 (Western European)', startChar: 32, glyphCount: 224 },
  { value: 'iso8859_16', label: 'ISO 8859-16 (Romanian)', startChar: 32, glyphCount: 224 },
  { value: 'msx', label: 'MSX International', startChar: 0, glyphCount: 256 },
  { value: 'sam', label: 'SAM Coupe', startChar: 32, glyphCount: 96 },
  { value: 'win1250', label: 'Windows-1250 (Central European)', startChar: 32, glyphCount: 224 },
  { value: 'win1251', label: 'Windows-1251 (Cyrillic)', startChar: 32, glyphCount: 224 },
  { value: 'win1252', label: 'Windows-1252 / Latin-1 (Western)', startChar: 32, glyphCount: 224 },
  { value: 'win1253', label: 'Windows-1253 (Greek)', startChar: 32, glyphCount: 224 },
  { value: 'win1254', label: 'Windows-1254 (Turkish)', startChar: 32, glyphCount: 224 },
  { value: 'win1255', label: 'Windows-1255 (Hebrew)', startChar: 32, glyphCount: 224 },
  { value: 'win1256', label: 'Windows-1256 (Arabic)', startChar: 32, glyphCount: 224 },
  { value: 'win1257', label: 'Windows-1257 (Baltic)', startChar: 32, glyphCount: 224 },
  { value: 'win1258', label: 'Windows-1258 (Vietnamese)', startChar: 32, glyphCount: 224 },
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
    const rowBytes = bpr(width)
    const bpg = height * rowBytes
    const data = new Uint8Array(cp.glyphCount * bpg)
    const font = createFont(data, 'untitled', cp.startChar, width, height)
    font.hideEmpty.value = false
    addFont(font)
    charset.value = codepage
    onClose()
  }

  return (
    <DialogOverlay onClose={onClose} label="New Font">
      <div class="bg-white rounded-lg shadow-2xl border border-gray-300 p-5 flex flex-col gap-4" style={{ width: 440 }}>
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
                <option key={cp.value} value={cp.value}>{cp.label}</option>
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
    </DialogOverlay>
  )
}
