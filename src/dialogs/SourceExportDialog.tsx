import { useState, useMemo } from 'preact/hooks'
import { Copy, Download } from 'lucide-preact'
import { type FontInstance } from '../store'
import { exportSource, SOURCE_FORMATS, type SourceFormat } from '../fileFormats/sourceExport'

interface Props {
  font: FontInstance
  onClose: () => void
}

export function SourceExportDialog({ font, onClose }: Props) {
  const [format, setFormat] = useState<SourceFormat>('c')

  const source = useMemo(() => exportSource(font, format), [font.fontData.value, font.fileName.value, font.startChar.value, format])

  const fmt = SOURCE_FORMATS.find(f => f.id === format)!

  function handleCopy() {
    navigator.clipboard.writeText(source)
  }

  function handleDownload() {
    const base = font.fileName.value.replace(/\.[a-zA-Z0-9]+$/i, '')
    const blob = new Blob([source], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = base + fmt.ext
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div
      class="fixed inset-0 bg-black/40 flex items-center justify-center z-[200]"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div class="bg-white rounded-lg shadow-2xl border border-gray-300 p-4 flex flex-col gap-3" style={{ width: 680, height: 560 }}>
        <div class="flex items-center gap-2">
          <h2 class="font-bold">Export Source Code</h2>
          <span class="text-xs text-gray-400">{font.fileName.value}</span>
          <div class="ml-auto flex items-center gap-2">
            <button
              class="flex items-center gap-1.5 px-3 py-1 rounded border border-gray-300 hover:bg-gray-50 text-sm"
              onClick={handleCopy}
            >
              <Copy size={14} /> Copy
            </button>
            <button
              class="flex items-center gap-1.5 px-3 py-1 rounded bg-blue-500 text-white hover:bg-blue-600 text-sm"
              onClick={handleDownload}
            >
              <Download size={14} /> Download
            </button>
            <button
              class="text-gray-400 hover:text-red-500 leading-none text-lg font-bold ml-1"
              onClick={onClose}
              title="Close"
            >
              ×
            </button>
          </div>
        </div>

        {/* Format selector */}
        <div class="flex gap-1">
          {SOURCE_FORMATS.map(f => (
            <button
              key={f.id}
              class={`px-3 py-1 rounded text-sm border ${format === f.id ? 'bg-blue-500 text-white border-blue-500' : 'border-gray-300 hover:bg-gray-50'}`}
              onClick={() => setFormat(f.id)}
            >
              {f.label}
            </button>
          ))}
        </div>

        <textarea
          class="flex-1 font-mono text-xs border border-gray-200 rounded p-2 resize-none bg-gray-50 focus:outline-none focus:border-blue-300"
          value={source}
          readOnly
          spellcheck={false}
          onClick={(e) => (e.target as HTMLTextAreaElement).select()}
        />
      </div>
    </div>
  )
}
