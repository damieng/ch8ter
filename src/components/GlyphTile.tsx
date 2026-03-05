import { useRef, useEffect } from 'preact/hooks'
import { type FontInstance, charLabel } from '../store'

interface Props {
  font: FontInstance
  index: number
  size: number
  selected?: boolean
  active?: boolean
  onClick?: (e: MouseEvent) => void
}

export function GlyphTile({ font, index, size, selected, active, onClick }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const w = font.glyphWidth.value
  const h = font.glyphHeight.value
  const bpr = Math.ceil(w / 8)
  const bpg = h * bpr
  const canvasW = Math.round(size * w / Math.max(w, h))
  const canvasH = Math.round(size * h / Math.max(w, h))

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    const data = font.fontData.value
    const offset = index * bpg
    const scaleX = canvasW / w
    const scaleY = canvasH / h

    ctx.clearRect(0, 0, canvasW, canvasH)

    ctx.fillStyle = '#e2e8f0'
    ctx.fillRect(0, 0, canvasW, canvasH)

    ctx.fillStyle = '#1e293b'
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const byteIdx = offset + y * bpr + Math.floor(x / 8)
        if (data[byteIdx] & (0x80 >> (x % 8))) {
          ctx.fillRect(x * scaleX, y * scaleY, scaleX, scaleY)
        }
      }
    }
  }, [font.fontData.value, index, size, w, h])

  const charCode = font.startChar.value + index
  const label = charLabel(charCode)

  let borderColor = 'border-gray-300'
  if (active) borderColor = 'border-amber-500'
  else if (selected) borderColor = 'border-blue-500'

  return (
    <div
      class={`inline-flex flex-col items-center cursor-pointer hover:bg-blue-100 rounded p-0.5 border-2 ${borderColor}`}
      onClick={onClick}
      title={`${charCode} (0x${charCode.toString(16).toUpperCase()})${label ? ' ' + label : ''}`}
    >
      <canvas ref={canvasRef} width={canvasW} height={canvasH} class="block" />
      <span class="text-sm leading-tight mt-0.5">
        {label || '\u00B7'}
      </span>
    </div>
  )
}
