import { useState } from 'preact/hooks'
import { createPortal } from 'preact/compat'
import {
  createFont, addFont, recalcMetrics, charset, CHARSETS, containers,
  type FontContainer, type ContainerFont, type ContainerMeta, type Charset,
} from '../store'
import { ContainerPropertiesDialog } from '../dialogs/ContainerPropertiesDialog'

export function ContainerPaneTitle({ container }: { container: FontContainer }) {
  return <span>Container — {container.fileName}</span>
}

type SortKey = 'codepage' | 'size' | 'device' | 'chars'
type SortDir = 'asc' | 'desc'

function compareFonts(a: ContainerFont, b: ContainerFont, key: SortKey): number {
  switch (key) {
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
    const suffix = ` (CP${cf.codepage} ${cf.width}x${cf.height})`
    const properties: Record<string, string> = {
      CPI_DEVICE: cf.deviceName,
      CPI_DEVICE_TYPE: cf.deviceType === 2 ? 'printer' : 'screen',
    }
    const font = createFont(
      cf.fontData, container.fileName + suffix, 0,
      cf.width, cf.height,
      { properties },
    )
    font.sourceContainerId = container.id
    recalcMetrics(font)
    addFont(font)
    const cpKey = `cp${cf.codepage}` as Charset
    charset.value = cpKey in CHARSETS ? cpKey : 'cp437' as Charset
  }

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
            <SortHeader label="Codepage" col="codepage" />
            <SortHeader label="Size" col="size" />
            <SortHeader label="Device" col="device" />
            <SortHeader label="Chars" col="chars" />
            <th class="text-right py-1 font-medium" />
          </tr>
        </thead>
        <tbody>
          {sorted.map((cf, i) => (
            <tr key={i} class="hover:bg-blue-50 border-b border-gray-50">
              <td class="py-1.5">{cf.codepage}</td>
              <td class="py-1.5 font-mono">{cf.width}x{cf.height}</td>
              <td class="py-1.5">
                {cf.deviceName}
                {cf.deviceType === 2 && <span class="ml-1 text-gray-400">(printer)</span>}
              </td>
              <td class="py-1.5">{cf.numChars}</td>
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
