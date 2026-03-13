import { useState } from 'preact/hooks'
import { createPortal } from 'preact/compat'
import { type FontInstance, createMonospaceVariant } from '../store'

interface Props {
  font: FontInstance
  onClose: () => void
}

export function MonospaceDialog({ font, onClose }: Props) {
  const [width, setWidth] = useState(font.glyphWidth.value)
  const [anchorX, setAnchorX] = useState<'left' | 'center' | 'right'>('center')

  function handleApply() {
    createMonospaceVariant(font, width, anchorX)
    onClose()
  }

  const metricInput = "w-14 px-2 py-1 border border-gray-300 rounded text-center text-sm"

  return createPortal(
    <div
      class="fixed inset-0 bg-black/40 flex items-center justify-center z-[200]"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div class="bg-white rounded-lg shadow-2xl border border-gray-300 p-5 flex flex-col gap-4 min-w-[320px]">
        <h2 class="font-bold text-lg">Create Monospace</h2>

        <div class="flex flex-col gap-3">
          <div class="flex items-center gap-2">
            <span class="text-sm w-24 shrink-0">Width</span>
            <input
              type="number" min={1} max={32} value={width}
              onInput={(e) => setWidth(Math.max(1, Math.min(32, parseInt((e.target as HTMLInputElement).value) || 1)))}
              class={metricInput}
            />
            <div class="flex gap-1 ml-1">
              {(['left', 'center', 'right'] as const).map(v => (
                <button
                  key={v}
                  class={`px-2 py-1 rounded border text-xs ${anchorX === v ? 'bg-blue-100 border-blue-400 font-medium' : 'border-gray-300 hover:bg-gray-50'}`}
                  onClick={() => setAnchorX(v)}
                >
                  {v === 'left' ? 'Left' : v === 'center' ? 'Both' : 'Right'}
                </button>
              ))}
            </div>
          </div>
          <p class="text-xs text-gray-500">
            Glyph pixels will be placed within the new fixed-width cell according to the chosen alignment.
          </p>
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
            onClick={handleApply}
          >
            Create
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
