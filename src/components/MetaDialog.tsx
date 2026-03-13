import { useState } from 'preact/hooks'
import { type FontInstance } from '../store'
import type { FontMeta } from '../fileFormats/bdfParser'

interface Props {
  font: FontInstance
  onClose: () => void
}

export function MetaDialog({ font, onClose }: Props) {
  const meta = font.meta.value
  const [fontName, setFontName] = useState(font.fontName.value)
  const [properties, setProperties] = useState<Record<string, string>>(() =>
    meta ? { ...meta.properties } : {}
  )
  const [newKey, setNewKey] = useState('')
  const [newVal, setNewVal] = useState('')

  function updateProp(key: string, value: string) {
    setProperties(prev => ({ ...prev, [key]: value }))
  }

  function removeProp(key: string) {
    setProperties(prev => {
      const next = { ...prev }
      delete next[key]
      return next
    })
  }

  function addProp() {
    const key = newKey.trim().toUpperCase()
    if (!key) return
    setProperties(prev => ({ ...prev, [key]: newVal }))
    setNewKey('')
    setNewVal('')
  }

  function handleSave() {
    font.fontName.value = fontName
    const updated: FontMeta = {
      ...(meta || { properties: {} }),
      properties: { ...properties },
    }
    // Sync well-known fields from properties
    updated.copyright = properties.COPYRIGHT
    updated.foundry = properties.FOUNDRY
    updated.family = properties.FAMILY_NAME
    updated.weight = properties.WEIGHT_NAME
    updated.slant = properties.SLANT
    if (properties.FONT_ASCENT) updated.fontAscent = parseInt(properties.FONT_ASCENT)
    if (properties.FONT_DESCENT) updated.fontDescent = parseInt(properties.FONT_DESCENT)
    font.meta.value = updated
    onClose()
  }

  const keys = Object.keys(properties).sort()

  return (
    <div
      class="fixed inset-0 bg-black/40 flex items-center justify-center z-[200]"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div class="bg-white rounded-lg shadow-2xl border border-gray-300 p-5 flex flex-col gap-3 min-w-[400px] max-w-[500px] max-h-[80vh]">
        <h2 class="font-bold text-lg">Font Properties</h2>
        <div class="flex items-center gap-2">
          <span class="text-sm font-medium w-16 shrink-0">Name</span>
          <input
            type="text" value={fontName}
            onInput={(e) => setFontName((e.target as HTMLInputElement).value)}
            class="flex-1 px-2 py-1 border border-gray-300 rounded text-sm min-w-0"
            placeholder="Font name"
          />
        </div>
        <hr class="border-gray-200" />
        <div class="overflow-y-auto flex flex-col gap-1 min-h-0">
          {keys.length === 0 && (
            <p class="text-sm text-gray-400 italic">No properties. Add one below.</p>
          )}
          {keys.map(key => (
            <div key={key} class="flex items-center gap-1">
              <span class="text-xs font-mono text-gray-600 w-32 shrink-0 truncate" title={key}>{key}</span>
              <input
                class="flex-1 px-2 py-0.5 border border-gray-300 rounded text-sm font-mono min-w-0"
                value={properties[key]}
                onInput={(e) => updateProp(key, (e.target as HTMLInputElement).value)}
              />
              <button
                class="text-gray-400 hover:text-red-500 text-sm px-1"
                onClick={() => removeProp(key)}
                title="Remove"
              >&times;</button>
            </div>
          ))}
        </div>
        <div class="flex items-center gap-1 border-t border-gray-200 pt-2">
          <input
            class="w-32 shrink-0 px-2 py-0.5 border border-gray-300 rounded text-sm font-mono"
            placeholder="KEY"
            value={newKey}
            onInput={(e) => setNewKey((e.target as HTMLInputElement).value)}
            onKeyDown={(e) => { if (e.key === 'Enter') addProp() }}
          />
          <input
            class="flex-1 px-2 py-0.5 border border-gray-300 rounded text-sm font-mono min-w-0"
            placeholder="Value"
            value={newVal}
            onInput={(e) => setNewVal((e.target as HTMLInputElement).value)}
            onKeyDown={(e) => { if (e.key === 'Enter') addProp() }}
          />
          <button
            class="px-2 py-0.5 rounded border border-gray-300 text-sm hover:bg-gray-100"
            onClick={addProp}
          >Add</button>
        </div>
        <div class="flex justify-end gap-2">
          <button
            class="px-4 py-1.5 rounded border border-gray-300 text-sm hover:bg-gray-100"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            class="px-4 py-1.5 rounded bg-blue-600 text-white text-sm hover:bg-blue-700"
            onClick={handleSave}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  )
}
