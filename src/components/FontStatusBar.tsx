import { charset, type Charset } from '../store'

export function FontStatusBar() {
  return (
    <>
      <span>Click to select, Shift+click for range, Ctrl+click to toggle</span>
      <select
        class="text-xs bg-transparent border-none outline-none cursor-pointer text-gray-500"
        value={charset.value}
        onChange={(e) => { charset.value = (e.target as HTMLSelectElement).value as Charset }}
      >
        <option value="zx">ZX Spectrum</option>
        <option value="ascii">ASCII</option>
      </select>
    </>
  )
}
