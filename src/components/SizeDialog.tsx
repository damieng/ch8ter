import { useState } from 'preact/hooks'
import { type FontInstance, resizeFont } from '../store'

interface Props {
  font: FontInstance
  onClose: () => void
}

export function SizeDialog({ font, onClose }: Props) {
  const [width, setWidth] = useState(font.glyphWidth.value)
  const [height, setHeight] = useState(font.glyphHeight.value)
  const [anchorX, setAnchorX] = useState<'left' | 'center' | 'right'>('center')
  const [anchorY, setAnchorY] = useState<'top' | 'center' | 'bottom'>('center')

  function handleApply() {
    resizeFont(font, width, height, anchorX, anchorY)
    onClose()
  }

  const changed = width !== font.glyphWidth.value || height !== font.glyphHeight.value

  return (
    <div
      class="fixed inset-0 bg-black/40 flex items-center justify-center z-[200]"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div class="bg-white rounded-lg shadow-2xl border border-gray-300 p-5 flex flex-col gap-4 min-w-[300px]">
        <h2 class="font-bold text-lg">Glyph Size</h2>

        <div class="flex flex-col gap-3">
          <div class="flex items-center gap-2">
            <span class="text-sm w-14">Height</span>
            <input
              type="number"
              min={1}
              max={32}
              value={height}
              onInput={(e) => setHeight(Math.max(1, Math.min(32, parseInt((e.target as HTMLInputElement).value) || 1)))}
              class="w-16 px-2 py-1 border border-gray-300 rounded text-center"
            />
            <div class="flex gap-1 ml-2">
              {(['top', 'center', 'bottom'] as const).map(v => (
                <button
                  key={v}
                  class={`px-2 py-1 rounded border text-xs ${anchorY === v ? 'bg-blue-100 border-blue-400 font-medium' : 'border-gray-300 hover:bg-gray-50'}`}
                  onClick={() => setAnchorY(v)}
                  title={v === 'top' ? 'Add space below' : v === 'bottom' ? 'Add space above' : 'Add space both sides'}
                >
                  {v === 'top' ? 'Top' : v === 'center' ? 'Both' : 'Bottom'}
                </button>
              ))}
            </div>
          </div>
          <div class="flex items-center gap-2">
            <span class="text-sm w-14">Width</span>
            <input
              type="number"
              min={1}
              max={32}
              value={width}
              onInput={(e) => setWidth(Math.max(1, Math.min(32, parseInt((e.target as HTMLInputElement).value) || 1)))}
              class="w-16 px-2 py-1 border border-gray-300 rounded text-center"
            />
            <div class="flex gap-1 ml-2">
              {(['left', 'center', 'right'] as const).map(v => (
                <button
                  key={v}
                  class={`px-2 py-1 rounded border text-xs ${anchorX === v ? 'bg-blue-100 border-blue-400 font-medium' : 'border-gray-300 hover:bg-gray-50'}`}
                  onClick={() => setAnchorX(v)}
                  title={v === 'left' ? 'Add space to right' : v === 'right' ? 'Add space to left' : 'Add space both sides'}
                >
                  {v === 'left' ? 'Left' : v === 'center' ? 'Both' : 'Right'}
                </button>
              ))}
            </div>
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
            class="px-4 py-1.5 rounded bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-50"
            onClick={handleApply}
            disabled={!changed}
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  )
}
