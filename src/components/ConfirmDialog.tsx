import { useRef, useEffect, useMemo } from 'preact/hooks'
import { type FontInstance, bytesPerGlyph } from '../store'

interface Props {
  font: FontInstance
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({ font, onConfirm, onCancel }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const changedCount = useMemo(() => {
    const data = font.fontData.value
    const saved = font.savedSnapshot.value
    const bpg = bytesPerGlyph(font)
    if (bpg === 0) return 0
    const gc = Math.floor(data.length / bpg)
    let count = 0
    for (let g = 0; g < gc; g++) {
      const off = g * bpg
      for (let b = 0; b < bpg; b++) {
        if (data[off + b] !== saved[off + b]) { count++; break }
      }
    }
    return count
  }, [font.fontData.value, font.savedSnapshot.value])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    const data = font.fontData.value
    const gw = font.glyphWidth.value
    const gh = font.glyphHeight.value
    const start = font.startChar.value
    const bpr = Math.ceil(gw / 8)
    const bpg = gh * bpr
    const gc = bpg > 0 ? Math.floor(data.length / bpg) : 0

    const text = 'AaBbCc123'
    const scale = 2
    canvas.width = text.length * gw * scale
    canvas.height = gh * scale

    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.fillStyle = '#000000'

    for (let i = 0; i < text.length; i++) {
      const gi = text.charCodeAt(i) - start
      if (gi < 0 || gi >= gc) continue
      const base = gi * bpg
      for (let y = 0; y < gh; y++) {
        for (let x = 0; x < gw; x++) {
          const byteIdx = base + y * bpr + Math.floor(x / 8)
          if (data[byteIdx] & (0x80 >> (x % 8))) {
            ctx.fillRect(i * gw * scale + x * scale, y * scale, scale, scale)
          }
        }
      }
    }
  }, [font])

  return (
    <div
      class="fixed inset-0 bg-black/40 flex items-center justify-center z-[200]"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel() }}
    >
      <div class="bg-white rounded-lg shadow-2xl border border-gray-300 p-5 flex flex-col gap-4 min-w-[300px] max-w-[400px]">
        <h2 class="font-bold text-lg">Discard changes to {font.fileName.value}?</h2>
        <div class="flex justify-center p-2 bg-gray-100 rounded border border-gray-200">
          <canvas ref={canvasRef} style={{ imageRendering: 'pixelated' }} />
        </div>
        <p class="text-sm text-gray-700">
          {changedCount} {changedCount === 1 ? 'glyph has' : 'glyphs have'} been modified since last save.
        </p>
        <div class="flex justify-end gap-2">
          <button
            class="px-4 py-1.5 rounded border border-gray-300 text-sm hover:bg-gray-100"
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            class="px-4 py-1.5 rounded bg-red-600 text-white text-sm hover:bg-red-700"
            onClick={onConfirm}
          >
            Close without saving
          </button>
        </div>
      </div>
    </div>
  )
}
