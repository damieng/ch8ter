import type preact from 'preact'
import type { RefObject } from 'preact'
import { createPortal } from 'preact/compat'
import { useState, useRef, useEffect } from 'preact/hooks'
import { COLOR_SYSTEMS } from '../colorSystems'

export function ColorSwatch({ anchorRef, popupRef, fg, bg, open, palette, systems, systemIdx, onToggle, onFgPick, onBgPick, onSystemChange }: {
  anchorRef: RefObject<HTMLDivElement | null>
  popupRef: RefObject<HTMLDivElement | null>
  fg: string
  bg: string
  open: boolean
  palette?: string[]
  systems: typeof COLOR_SYSTEMS
  systemIdx: number
  onToggle: () => void
  onFgPick: (c: string) => void
  onBgPick: (c: string) => void
  onSystemChange: (idx: number) => void
}) {
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const fgNativeRef = useRef<HTMLInputElement>(null)
  const bgNativeRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open && anchorRef.current) {
      const rect = anchorRef.current.getBoundingClientRect()
      setPos({ x: rect.left, y: rect.bottom + 4 })
    }
  }, [open])

  function paletteCols(len: number) {
    return len > 16 ? 16 : Math.min(8, len)
  }

  return (
    <div ref={anchorRef as preact.Ref<HTMLDivElement>}>
      <button
        class="px-2 py-1 bg-white hover:bg-blue-50 rounded border border-gray-300 flex items-center"
        onClick={onToggle}
        title="Foreground / Background colors"
      >
        <div class="relative" style={{ width: 22, height: 18 }}>
          <div
            class="absolute w-3.5 h-3.5 rounded-sm border border-gray-400"
            style={{ backgroundColor: bg, right: 0, bottom: 0 }}
          />
          <div
            class="absolute w-3.5 h-3.5 rounded-sm border border-gray-400 z-10"
            style={{ backgroundColor: fg, left: 0, top: 0 }}
          />
        </div>
      </button>
      {!palette && (
        <>
          <input ref={fgNativeRef} type="color" value={fg} onInput={(e) => onFgPick((e.target as HTMLInputElement).value)} class="absolute opacity-0 pointer-events-none" style={{ width: 0, height: 0 }} />
          <input ref={bgNativeRef} type="color" value={bg} onInput={(e) => onBgPick((e.target as HTMLInputElement).value)} class="absolute opacity-0 pointer-events-none" style={{ width: 0, height: 0 }} />
        </>
      )}
      {open && palette && createPortal(
        <div
          ref={popupRef as preact.Ref<HTMLDivElement>}
          class="fixed bg-white border border-gray-300 rounded shadow-lg p-2"
          style={{ left: pos.x, top: pos.y, zIndex: 9999 }}
        >
          <div class="flex gap-1 mb-2">
            <select
              class="flex-1 px-2 py-1 bg-white rounded border border-gray-300 text-sm min-w-0"
              value={systemIdx}
              onChange={(e) => onSystemChange(parseInt((e.target as HTMLSelectElement).value))}
            >
              {systems.map((s, i) => (
                <option key={i} value={i}>{s.name}</option>
              ))}
            </select>
            <button
              class="px-2 py-1 bg-white rounded border border-gray-300 text-sm hover:bg-gray-100"
              onClick={() => { onFgPick(bg); onBgPick(fg) }}
              title="Swap foreground/background"
            >⇄</button>
          </div>
          <div class="text-xs text-gray-500 font-medium mb-1">Foreground</div>
          <div class="grid gap-1 mb-2" style={{ gridTemplateColumns: `repeat(${paletteCols(palette.length)}, 1fr)` }}>
            {palette.map((c, i) => (
              <button
                key={i}
                class={`w-5 h-5 rounded border ${c === fg ? 'border-blue-500 border-2' : 'border-gray-300'}`}
                style={{ backgroundColor: c }}
                onClick={() => onFgPick(c)}
              />
            ))}
          </div>
          <div class="text-xs text-gray-500 font-medium mb-1">Background</div>
          <div class="grid gap-1" style={{ gridTemplateColumns: `repeat(${paletteCols(palette.length)}, 1fr)` }}>
            {palette.map((c, i) => (
              <button
                key={i}
                class={`w-5 h-5 rounded border ${c === bg ? 'border-blue-500 border-2' : 'border-gray-300'}`}
                style={{ backgroundColor: c }}
                onClick={() => onBgPick(c)}
              />
            ))}
          </div>
        </div>,
        document.body,
      )}
    </div>
  )
}
