import { useState } from 'preact/hooks'
import { type FontInstance, resizeFont } from '../store'
import {
  calcBaseline, calcAscender, calcCapHeight,
  calcXHeight, calcNumericHeight, calcDescender,
} from '../charMetrics'

interface Props {
  font: FontInstance
  onClose: () => void
}

export function SizeDialog({ font, onClose }: Props) {
  const [width, setWidth] = useState(font.glyphWidth.value)
  const [height, setHeight] = useState(font.glyphHeight.value)
  const [baseline, setBaseline] = useState(font.baseline.value)
  const [ascender, setAscender] = useState(font.ascender.value)
  const [capHeight, setCapHeight] = useState(font.capHeight.value)
  const [xHeight, setXHeight] = useState(font.xHeight.value)
  const [numericHeight, setNumericHeight] = useState(font.numericHeight.value)
  const [descender, setDescender] = useState(font.descender.value)
  const [anchorX, setAnchorX] = useState<'left' | 'center' | 'right'>('center')
  const [anchorY, setAnchorY] = useState<'top' | 'center' | 'bottom'>('center')

  function calc(fn: (data: Uint8Array, start: number, w: number, h: number) => number) {
    return fn(font.fontData.value, font.startChar.value, font.glyphWidth.value, font.glyphHeight.value)
  }

  function handleApply() {
    if (width !== font.glyphWidth.value || height !== font.glyphHeight.value) {
      resizeFont(font, width, height, anchorX, anchorY)
    }
    font.baseline.value = baseline
    font.ascender.value = ascender
    font.capHeight.value = capHeight
    font.xHeight.value = xHeight
    font.numericHeight.value = numericHeight
    font.descender.value = descender
    onClose()
  }

  const changed = width !== font.glyphWidth.value || height !== font.glyphHeight.value ||
    baseline !== font.baseline.value || ascender !== font.ascender.value ||
    capHeight !== font.capHeight.value || xHeight !== font.xHeight.value ||
    numericHeight !== font.numericHeight.value || descender !== font.descender.value

  const metricInput = "w-14 px-2 py-1 border border-gray-300 rounded text-center text-sm"
  const calcBtn = "px-2 py-1 rounded border border-gray-300 text-xs hover:bg-gray-50"

  return (
    <div
      class="fixed inset-0 bg-black/40 flex items-center justify-center z-[200]"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div class="bg-white rounded-lg shadow-2xl border border-gray-300 p-5 flex flex-col gap-4 min-w-[340px]">
        <h2 class="font-bold text-lg">Glyph Metrics</h2>

        <div class="flex flex-col gap-3">
          <div class="flex items-center gap-2">
            <span class="text-sm w-24">Height</span>
            <input
              type="number" min={1} max={32} value={height}
              onInput={(e) => setHeight(Math.max(1, Math.min(32, parseInt((e.target as HTMLInputElement).value) || 1)))}
              class={metricInput}
            />
            <div class="flex gap-1 ml-1">
              {(['top', 'center', 'bottom'] as const).map(v => (
                <button
                  key={v}
                  class={`px-2 py-1 rounded border text-xs ${anchorY === v ? 'bg-blue-100 border-blue-400 font-medium' : 'border-gray-300 hover:bg-gray-50'}`}
                  onClick={() => setAnchorY(v)}
                >
                  {v === 'top' ? 'Top' : v === 'center' ? 'Both' : 'Bottom'}
                </button>
              ))}
            </div>
          </div>
          <div class="flex items-center gap-2">
            <span class="text-sm w-24">Width</span>
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

          <hr class="border-gray-200" />

          <div class="flex items-center gap-2">
            <span class="text-sm w-24">Ascender</span>
            <input type="number" min={-1} max={height} value={ascender}
              onInput={(e) => setAscender(parseInt((e.target as HTMLInputElement).value) ?? -1)}
              class={metricInput} />
            <button class={calcBtn} onClick={() => setAscender(calc(calcAscender))}>Calc</button>
          </div>
          <div class="flex items-center gap-2">
            <span class="text-sm w-24">Cap height</span>
            <input type="number" min={-1} max={height} value={capHeight}
              onInput={(e) => setCapHeight(parseInt((e.target as HTMLInputElement).value) ?? -1)}
              class={metricInput} />
            <button class={calcBtn} onClick={() => setCapHeight(calc(calcCapHeight))}>Calc</button>
          </div>
          <div class="flex items-center gap-2">
            <span class="text-sm w-24">Numeric height</span>
            <input type="number" min={-1} max={height} value={numericHeight}
              onInput={(e) => setNumericHeight(parseInt((e.target as HTMLInputElement).value) ?? -1)}
              class={metricInput} />
            <button class={calcBtn} onClick={() => setNumericHeight(calc(calcNumericHeight))}>Calc</button>
          </div>
          <div class="flex items-center gap-2">
            <span class="text-sm w-24">x-height</span>
            <input type="number" min={-1} max={height} value={xHeight}
              onInput={(e) => setXHeight(parseInt((e.target as HTMLInputElement).value) ?? -1)}
              class={metricInput} />
            <button class={calcBtn} onClick={() => setXHeight(calc(calcXHeight))}>Calc</button>
          </div>
          <div class="flex items-center gap-2">
            <span class="text-sm w-24">Baseline</span>
            <input type="number" min={0} max={height} value={baseline}
              onInput={(e) => setBaseline(parseInt((e.target as HTMLInputElement).value) ?? 0)}
              class={metricInput} />
            <button class={calcBtn} onClick={() => setBaseline(calc(calcBaseline))}>Calc</button>
          </div>
          <div class="flex items-center gap-2">
            <span class="text-sm w-24">Descender</span>
            <input type="number" min={-1} max={height} value={descender}
              onInput={(e) => setDescender(parseInt((e.target as HTMLInputElement).value) ?? -1)}
              class={metricInput} />
            <button class={calcBtn} onClick={() => setDescender(calc(calcDescender))}>Calc</button>
          </div>

          <p class="text-xs text-gray-400">Set to -1 to hide a guideline. Metrics are listed top to bottom.</p>
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
