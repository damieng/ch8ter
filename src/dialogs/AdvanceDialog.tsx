// Set or offset the advance widths of the selected glyphs (or the whole
// font) as a single undoable step.

import { useState } from 'preact/hooks'
import { type FontInstance, glyphCount, glyphAdvance } from '../store'
import { execSetAdvances } from '../undoHistory'
import { DialogOverlay } from '../components/DialogOverlay'
import { DialogHeader } from '../components/DialogHeader'

export function AdvanceDialog({ font, onClose }: { font: FontInstance; onClose: () => void }) {
  const selection = [...font.selectedGlyphs.value].sort((x, y) => x - y)
  const scopeOptions: { id: 'selection' | 'all'; label: string }[] = [
    { id: 'selection', label: `Selection (${selection.length} glyph${selection.length === 1 ? '' : 's'})` },
    { id: 'all', label: `Entire font (${glyphCount(font)} glyphs)` },
  ]
  const [scope, setScope] = useState<'selection' | 'all'>(selection.length > 0 ? 'selection' : 'all')
  const [mode, setMode] = useState<'set' | 'offset'>('set')
  const [value, setValue] = useState('0')
  const [error, setError] = useState('')

  function apply() {
    const n = Math.round(Number(value))
    if (!Number.isFinite(n)) {
      setError('Enter a whole number of pixels')
      return
    }
    if (mode === 'set' && n < 1) {
      setError('Advance must be at least 1 pixel')
      return
    }
    const indices = scope === 'all'
      ? Array.from({ length: glyphCount(font) }, (_, i) => i)
      : selection
    const updates = new Map<number, number>()
    for (const idx of indices) {
      const current = glyphAdvance(font, idx)
      updates.set(idx, mode === 'set' ? n : Math.max(1, current + n))
    }
    execSetAdvances(font, updates, mode === 'set' ? 'Set advances' : 'Offset advances')
    onClose()
  }

  return (
    <DialogOverlay onClose={onClose} label="Set advances">
      <div class="bg-gray-50 rounded-lg shadow-2xl border border-gray-300 flex flex-col min-w-[360px]">
        <DialogHeader title="Set Advances" />
        <div class="flex flex-col gap-3 px-5 py-4 text-sm">
          <div class="flex flex-col gap-1">
            <span class="text-xs font-mono text-gray-600">SCOPE</span>
            {scopeOptions.map(o => (
              <label key={o.id} class="flex items-center gap-2">
                <input
                  type="radio"
                  name="scope"
                  checked={scope === o.id}
                  onChange={() => setScope(o.id)}
                />
                <span>{o.label}</span>
              </label>
            ))}
          </div>
          <div class="flex flex-col gap-1">
            <span class="text-xs font-mono text-gray-600">MODE</span>
            <label class="flex items-center gap-2">
              <input type="radio" name="mode" checked={mode === 'set'} onChange={() => setMode('set')} />
              <span>Set every advance to</span>
            </label>
            <label class="flex items-center gap-2">
              <input type="radio" name="mode" checked={mode === 'offset'} onChange={() => setMode('offset')} />
              <span>Offset every advance by (± pixels)</span>
            </label>
          </div>
          <div class="flex items-center gap-2">
            <span class="text-xs font-mono text-gray-600 w-14">PIXELS</span>
            <input
              class={`flex-1 px-2 py-0.5 border rounded text-sm font-mono ${error ? 'border-red-400' : 'border-gray-300'}`}
              value={value}
              onInput={(e) => { setValue((e.target as HTMLInputElement).value); setError('') }}
            />
          </div>
          {error && <p class="text-xs text-red-500">{error}</p>}
          <p class="text-xs text-gray-500">
            Advances apply when the font is in proportional spacing mode. This action is undoable.
          </p>
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
            onClick={apply}
          >
            Apply
          </button>
        </div>
      </div>
    </DialogOverlay>
  )
}
