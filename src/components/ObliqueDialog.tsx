import { useState, useRef, useEffect } from 'preact/hooks'
import { type FontInstance, shearGlyphBytes, createObliqueVariant } from '../store'

const PREVIEW_GLYPHS = [
  // Show a mix: uppercase, lowercase, digits, symbols
  33, 35, 48, 50, 52, 65, 66, 67, 68, 69, 72, 75, 77, 82, 97, 98, 100, 103, 104, 107, 112, 113
]

function PreviewGrid({ font, angle }: { font: FontInstance; angle: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const start = font.startChar.value
  const gw = font.glyphWidth.value
  const gh = font.glyphHeight.value
  const bpr = Math.ceil(gw / 8)
  const bpg = gh * bpr
  const count = bpg > 0 ? Math.floor(font.fontData.value.length / bpg) : 0

  const indices = PREVIEW_GLYPHS
    .map(c => c - start)
    .filter(i => i >= 0 && i < count)
    .slice(0, 16)

  const cols = Math.min(indices.length, 8)
  const rows = Math.ceil(indices.length / cols)
  const scale = 4
  const cellW = gw * scale
  const cellH = gh * scale
  const gap = 2
  const w = cols * (cellW + gap) - gap
  const h = rows * (cellH + gap) - gap

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#e2e8f0'
    ctx.fillRect(0, 0, w, h)

    indices.forEach((glyphIdx, i) => {
      const col = i % cols
      const row = Math.floor(i / cols)
      const ox = col * (cellW + gap)
      const oy = row * (cellH + gap)
      const offset = glyphIdx * bpg
      const bytes = font.fontData.value.slice(offset, offset + bpg)
      const sheared = shearGlyphBytes(bytes, angle, gw, gh)

      ctx.fillStyle = '#e2e8f0'
      ctx.fillRect(ox, oy, cellW, cellH)

      ctx.fillStyle = '#1e293b'
      for (let y = 0; y < gh; y++) {
        for (let x = 0; x < gw; x++) {
          const byteIdx = y * bpr + Math.floor(x / 8)
          if (sheared[byteIdx] & (0x80 >> (x % 8))) {
            ctx.fillRect(ox + x * scale, oy + y * scale, scale, scale)
          }
        }
      }
    })
  }, [font.fontData.value, angle])

  return (
    <canvas
      ref={canvasRef}
      width={w}
      height={h}
      class="block"
      style={{ imageRendering: 'pixelated' }}
    />
  )
}

interface Props {
  font: FontInstance
  onClose: () => void
}

export function ObliqueDialog({ font, onClose }: Props) {
  const [angle, setAngle] = useState(20)

  function handleCreate() {
    createObliqueVariant(font, angle)
    onClose()
  }

  return (
    <div
      class="fixed inset-0 bg-black/40 flex items-center justify-center z-[200]"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div class="bg-white rounded-lg shadow-2xl border border-gray-300 p-5 flex flex-col gap-4 min-w-[340px]">
        <h2 class="font-bold text-lg">Create Oblique Variant</h2>

        <div class="flex items-center gap-3">
          <span class="text-sm w-12 text-right">{angle}°</span>
          <input
            type="range"
            min={-30}
            max={30}
            value={angle}
            onInput={(e) => setAngle(parseInt((e.target as HTMLInputElement).value))}
            class="flex-1"
          />
        </div>

        <div class="border border-gray-200 rounded p-3 bg-gray-50 flex justify-center">
          <PreviewGrid font={font} angle={angle} />
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
