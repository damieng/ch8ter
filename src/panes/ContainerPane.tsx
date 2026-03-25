import { useState, useRef, useEffect } from 'preact/hooks'
import { createPortal } from 'preact/compat'
import {
  createFont, addFont, recalcMetrics, charset, CHARSETS, containers,
  type FontContainer, type ContainerFont, type ContainerMeta, type Charset,
} from '../store'
import { ContainerPropertiesDialog } from '../dialogs/ContainerPropertiesDialog'
import { bpr } from '../bitUtils'
import { drawGlyphToCtx } from '../drawGlyph'

function FontPreview({ cf }: { cf: ContainerFont }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    const { fontData, width: gw, height: gh, startChar } = cf
    const rowBytes = bpr(gw)
    const bpg = gh * rowBytes
    const gc = bpg > 0 ? Math.floor(fontData.length / bpg) : 0
    const text = 'ABCabc'
    canvas.width = text.length * gw
    canvas.height = gh
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.fillStyle = '#374151'
    for (let i = 0; i < text.length; i++) {
      const gi = text.charCodeAt(i) - startChar
      if (gi < 0 || gi >= gc) continue
      drawGlyphToCtx(ctx, fontData, gi * bpg, gw, gh, rowBytes, i * gw, 0, 1, 1)
    }
  }, [cf])
  return <canvas ref={canvasRef} style={{ imageRendering: 'pixelated' }} />
}

export function ContainerPaneTitle({ container }: { container: FontContainer }) {
  return <span>Container — {container.fileName}</span>
}

type SortKey = 'name' | 'weight' | 'codepage' | 'size' | 'device' | 'chars'
type SortDir = 'asc' | 'desc'

function fontName(cf: ContainerFont): string {
  return cf.meta?.family || cf.meta?.fontName || ''
}

function fontWeight(cf: ContainerFont): string {
  return cf.meta?.weight || ''
}

function compareFonts(a: ContainerFont, b: ContainerFont, key: SortKey): number {
  switch (key) {
    case 'name': return fontName(a).localeCompare(fontName(b))
    case 'weight': return fontWeight(a).localeCompare(fontWeight(b))
    case 'codepage': return a.codepage - b.codepage
    case 'size': return (a.width * a.height) - (b.width * b.height)
    case 'device': return a.deviceName.localeCompare(b.deviceName)
    case 'chars': return a.numChars - b.numChars
  }
}

export function ContainerPane({ container }: { container: FontContainer }) {
  const [sortKey, setSortKey] = useState<SortKey>('codepage')
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  const sorted = [...container.fonts].sort((a, b) => {
    const cmp = compareFonts(a, b, sortKey)
    return sortDir === 'asc' ? cmp : -cmp
  })

  function openFont(cf: ContainerFont) {
    const parts: string[] = []
    if (cf.codepage > 0) parts.push(String(cf.codepage))
    parts.push(`${cf.width}x${cf.height}`)
    const w = fontWeight(cf).toLowerCase()
    if (w && w !== 'medium') parts.push(w)
    const suffix = ` (${parts.join('-')})`
    const meta = cf.meta ? { ...cf.meta } : { properties: {} as Record<string, string> }
    if (cf.deviceName) meta.properties.CPI_DEVICE = cf.deviceName
    if (cf.deviceType === 2) meta.properties.CPI_DEVICE_TYPE = 'printer'
    const font = createFont(
      cf.fontData, container.fileName + suffix, cf.startChar,
      cf.width, cf.height,
      meta,
      undefined,
      cf.baseline,
      cf.glyphMeta ?? undefined,
      cf.spacingMode ?? 'monospace',
    )
    if (cf.populated) font.populatedGlyphs.value = cf.populated
    font.sourceContainerId = container.id

    recalcMetrics(font)
    addFont(font)
    const cpKey = `cp${cf.codepage}` as Charset
    charset.value = cpKey in CHARSETS ? cpKey : 'cp437' as Charset
  }

  const hasName = container.fonts.some(f => fontName(f) !== '')
  const hasWeight = container.fonts.some(f => fontWeight(f) !== '')
  const hasCodepage = container.fonts.some(f => f.codepage > 0)
  const hasDevice = container.fonts.some(f => f.deviceType === 2 || (f.deviceName && f.deviceName !== 'Unknown'))
  const arrow = sortDir === 'asc' ? ' \u25B4' : ' \u25BE'

  function SortHeader({ label, col }: { label: string; col: SortKey }) {
    return (
      <th
        class="text-left py-1 font-medium cursor-pointer select-none hover:text-gray-600"
        onClick={() => handleSort(col)}
      >
        {label}{sortKey === col ? arrow : ''}
      </th>
    )
  }

  return (
    <div class="p-3 text-sm">
      <table class="w-full text-xs">
        <thead>
          <tr class="text-gray-400 border-b border-gray-100">
            {hasName && <SortHeader label="Name" col="name" />}
            {hasCodepage && <SortHeader label="CP" col="codepage" />}
            <SortHeader label="Size" col="size" />
            {hasWeight && <SortHeader label="Weight" col="weight" />}
            {hasDevice && <SortHeader label="Device" col="device" />}
            <SortHeader label="Chars" col="chars" />
            <th class="py-1 font-medium">Preview</th>
            <th class="text-right py-1 font-medium" />
          </tr>
        </thead>
        <tbody>
          {sorted.map((cf, i) => (
            <tr key={i} class="hover:bg-blue-50 border-b border-gray-50">
              {hasName && <td class="py-1.5">{fontName(cf)}</td>}
              {hasCodepage && <td class="py-1.5">{cf.codepage}</td>}
              <td class="py-1.5 font-mono">{cf.width}x{cf.height}</td>
              {hasWeight && <td class="py-1.5">{fontWeight(cf)}</td>}
              {hasDevice && (
                <td class="py-1.5">
                  {cf.deviceName}
                  {cf.deviceType === 2 && <span class="ml-1 text-gray-400">(printer)</span>}
                </td>
              )}
              <td class="py-1.5">{cf.numChars}</td>
              <td class="py-1.5"><FontPreview cf={cf} /></td>
              <td class="py-1.5 text-right">
                <button
                  class="px-2 py-0.5 bg-gray-100 hover:bg-blue-100 rounded border border-gray-200 text-gray-700"
                  onClick={() => openFont(cf)}
                >
                  Open
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function ContainerStatusBar({ container }: { container: FontContainer }) {
  const [propsOpen, setPropsOpen] = useState(false)
  const propCount = Object.keys(container.meta?.properties ?? {}).length

  function handleSaveMeta(updated: ContainerMeta) {
    containers.value = containers.value.map(c =>
      c.id === container.id ? { ...c, meta: updated } : c,
    )
  }

  return (
    <>
      <span>
        {container.format} {'\u00B7'} {container.fonts.length} font{container.fonts.length !== 1 ? 's' : ''}
      </span>
      <button
        class="text-xs text-gray-500 hover:text-blue-600 cursor-pointer"
        onClick={() => setPropsOpen(true)}
        title="Container properties"
      >
        {propCount} properties
      </button>
      {propsOpen && createPortal(
        <ContainerPropertiesDialog
          container={container}
          onClose={() => setPropsOpen(false)}
          onSave={handleSaveMeta}
        />,
        document.body,
      )}
    </>
  )
}
