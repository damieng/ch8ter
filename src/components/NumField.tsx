export function NumField({ label, value, onChange, min = 0, max = 999 }: {
  label: string
  value: number
  onChange: (v: number) => void
  min?: number
  max?: number
}) {
  return (
    <label class="flex items-center gap-1 text-xs">
      <span class="text-gray-500">{label}</span>
      <input
        type="number"
        class="w-12 px-1 py-0.5 border border-gray-300 rounded text-xs"
        value={value}
        min={min}
        max={max}
        onInput={(e) => {
          const v = parseInt((e.target as HTMLInputElement).value)
          if (!isNaN(v)) onChange(Math.max(min, Math.min(max, v)))
        }}
      />
    </label>
  )
}
