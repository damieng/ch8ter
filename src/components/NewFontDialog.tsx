import { useState, useRef, useEffect } from 'preact/hooks'
import { fontTemplates } from '../fontTemplates'
import { createFont, addFont } from '../store'

const TILE_SCALE = 3
const PREVIEW_TEXT = 'Abc'
const START_CHAR = 32

function renderText(ctx: CanvasRenderingContext2D, data: Uint8Array, text: string, scale: number, fg: string) {
  const w = text.length * 8 * scale
  const h = 8 * scale
  ctx.canvas.width = w
  ctx.canvas.height = h
  ctx.fillStyle = '#e2e8f0'
  ctx.fillRect(0, 0, w, h)
  ctx.fillStyle = fg
  for (let c = 0; c < text.length; c++) {
    const glyphIdx = text.charCodeAt(c) - START_CHAR
    if (glyphIdx < 0 || glyphIdx >= data.length / 8) continue
    const offset = glyphIdx * 8
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        if (data[offset + y] & (0x80 >> x)) {
          ctx.fillRect(c * 8 * scale + x * scale, y * scale, scale, scale)
        }
      }
    }
  }
}

function FontTile({ name, data, selected, onClick }: {
  name: string
  data: Uint8Array | null
  selected: boolean
  onClick: () => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (!canvasRef.current || !data) return
    const ctx = canvasRef.current.getContext('2d')!
    renderText(ctx, data, PREVIEW_TEXT, TILE_SCALE, '#1e293b')
  }, [data])

  return (
    <button
      class={`flex flex-col items-center gap-1 p-2 rounded border ${selected ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:bg-gray-50'}`}
      onClick={onClick}
    >
      {data ? (
        <canvas
          ref={canvasRef}
          class="block"
          style={{ imageRendering: 'pixelated' }}
        />
      ) : (
        <div class="flex items-center justify-center" style={{ width: PREVIEW_TEXT.length * 8 * TILE_SCALE, height: 8 * TILE_SCALE }}>
          <span class="text-xs text-gray-400">...</span>
        </div>
      )}
      <span class="text-xs">{name}</span>
    </button>
  )
}

// Cache fetched font data
const fontCache = new Map<string, Uint8Array>()

async function fetchFont(file: string): Promise<Uint8Array> {
  const cached = fontCache.get(file)
  if (cached) return cached
  const resp = await fetch(`${import.meta.env.BASE_URL}fonts/${file}`)
  const buf = await resp.arrayBuffer()
  const data = new Uint8Array(buf)
  fontCache.set(file, data)
  return data
}

interface Props {
  onClose: () => void
}

export function NewFontDialog({ onClose }: Props) {
  const [selected, setSelected] = useState(-1) // -1 = blank
  const [tileData, setTileData] = useState<(Uint8Array | null)[]>(fontTemplates.map(() => null))

  // Fetch all font tiles on mount
  useEffect(() => {
    fontTemplates.forEach((tpl, i) => {
      fetchFont(tpl.file).then(data => {
        setTileData(prev => { const next = [...prev]; next[i] = data; return next })
      })
    })
  }, [])

  function handleCreate() {
    if (selected >= 0 && tileData[selected]) {
      const tpl = fontTemplates[selected]
      const font = createFont(new Uint8Array(tileData[selected]!), `${tpl.name}.ch8`, 32)
      addFont(font)
    } else {
      const font = createFont(new Uint8Array(96 * 8), 'untitled.ch8', 32)
      addFont(font)
    }
    onClose()
  }

  return (
    <div
      class="fixed inset-0 bg-black/40 flex items-center justify-center z-[200]"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div class="bg-white rounded-lg shadow-2xl border border-gray-300 p-5 flex flex-col gap-4 max-h-[90vh]" style={{ width: 520 }}>
        <h2 class="font-bold text-lg">New Font</h2>

        <div class="grid gap-2 overflow-y-auto" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
          <button
            class={`flex flex-col items-center gap-1 p-2 rounded border ${selected === -1 ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:bg-gray-50'}`}
            onClick={() => setSelected(-1)}
          >
            <div class="flex items-center justify-center" style={{ width: PREVIEW_TEXT.length * 8 * TILE_SCALE, height: 8 * TILE_SCALE }}>
              <span class="text-gray-300 text-lg font-light">Empty</span>
            </div>
            <span class="text-xs">Blank</span>
          </button>
          {fontTemplates.map((tpl, i) => (
            <FontTile
              key={i}
              name={tpl.name}
              data={tileData[i]}
              selected={selected === i}
              onClick={() => setSelected(i)}
            />
          ))}
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
