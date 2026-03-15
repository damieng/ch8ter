interface Props {
  label: string
  w: number
  h: number
  onW: (v: number) => void
  onH: (v: number) => void
  min?: number
  max?: number
}

export function SizeField({ label, w, h, onW, onH, min = 0, max = 999 }: Props) {
  function clamp(v: number) { return Math.max(min, Math.min(max, v)) }
  return (
    <label class="flex items-center gap-1 text-xs">
      <span class="text-gray-500">{label}</span>
      <input
        type="number"
        class="w-10 px-1 py-0.5 border border-gray-300 rounded text-xs text-center"
        value={w}
        min={min}
        max={max}
        onInput={(e) => { const v = parseInt((e.target as HTMLInputElement).value); if (!isNaN(v)) onW(clamp(v)) }}
      />
      <span class="text-gray-400">×</span>
      <input
        type="number"
        class="w-10 px-1 py-0.5 border border-gray-300 rounded text-xs text-center"
        value={h}
        min={min}
        max={max}
        onInput={(e) => { const v = parseInt((e.target as HTMLInputElement).value); if (!isNaN(v)) onH(clamp(v)) }}
      />
    </label>
  )
}
