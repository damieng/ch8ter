import { useRef, useEffect } from 'preact/hooks'
import { fontData, startChar, charLabel } from '../store'

interface Props {
  index: number
  size: number
  selected?: boolean
  active?: boolean
  onClick?: (e: MouseEvent) => void
}

export function GlyphTile({ index, size, selected, active, onClick }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    const data = fontData.value
    const offset = index * 8
    const scale = size / 8

    ctx.clearRect(0, 0, size, size)

    ctx.fillStyle = '#e2e8f0'
    ctx.fillRect(0, 0, size, size)

    ctx.fillStyle = '#1e293b'
    for (let y = 0; y < 8; y++) {
      const byte = data[offset + y]
      for (let x = 0; x < 8; x++) {
        if (byte & (0x80 >> x)) {
          ctx.fillRect(x * scale, y * scale, scale, scale)
        }
      }
    }
  }, [fontData.value, index, size])

  const charCode = startChar.value + index
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
      <canvas ref={canvasRef} width={size} height={size} class="block" />
      <span class="text-sm leading-tight mt-0.5">
        {label || '\u00B7'}
      </span>
    </div>
  )
}
