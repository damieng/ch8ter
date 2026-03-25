import {
  createFont, addFont, recalcMetrics, charset, CHARSETS,
  type FontContainer, type ContainerFont, type Charset,
} from '../store'

export function ContainerPaneTitle({ container }: { container: FontContainer }) {
  return <span>Container — {container.fileName}</span>
}

export function ContainerPane({ container }: { container: FontContainer }) {
  const cpSet = new Set(container.fonts.map(f => f.codepage))
  const hasMultipleCps = cpSet.size > 1

  function openFont(cf: ContainerFont) {
    const suffix = ` (CP${cf.codepage} ${cf.width}x${cf.height})`
    const font = createFont(
      cf.fontData, container.fileName + suffix, 0,
      cf.width, cf.height,
    )
    font.sourceContainerId = container.id
    recalcMetrics(font)
    addFont(font)
    // Set charset if we have a definition for this codepage, otherwise default to cp437
    const cpKey = `cp${cf.codepage}` as Charset
    charset.value = cpKey in CHARSETS ? cpKey : 'cp437' as Charset
  }

  function openAll() {
    for (const cf of container.fonts) openFont(cf)
  }

  // Group fonts by codepage
  const byCodepage = new Map<number, ContainerFont[]>()
  for (const f of container.fonts) {
    const list = byCodepage.get(f.codepage) ?? []
    list.push(f)
    byCodepage.set(f.codepage, list)
  }

  return (
    <div class="p-3 text-sm">
      <div class="flex items-center gap-2 mb-3">
        <span class="text-xs text-gray-500">{container.format}</span>
        <span class="text-xs text-gray-400">|</span>
        <span class="text-xs text-gray-500">
          {container.fonts.length} font{container.fonts.length !== 1 ? 's' : ''}
          {hasMultipleCps && ` across ${cpSet.size} codepages`}
        </span>
        <span class="flex-1" />
        <button
          class="px-2 py-1 text-xs bg-blue-500 text-white rounded hover:bg-blue-600"
          onClick={openAll}
        >
          Open All
        </button>
      </div>

      {[...byCodepage.entries()].map(([cp, fonts]) => (
        <div key={cp} class="mb-3 last:mb-0">
          {hasMultipleCps && (
            <div class="text-xs font-bold text-gray-600 mb-1 border-b border-gray-200 pb-1">
              Codepage {cp}
            </div>
          )}
          <table class="w-full text-xs">
            <thead>
              <tr class="text-gray-400 border-b border-gray-100">
                <th class="text-left py-1 font-medium">Size</th>
                <th class="text-left py-1 font-medium">Device</th>
                <th class="text-left py-1 font-medium">Chars</th>
                {!hasMultipleCps && <th class="text-left py-1 font-medium">Codepage</th>}
                <th class="text-right py-1 font-medium" />
              </tr>
            </thead>
            <tbody>
              {fonts.map((cf, i) => (
                <tr key={i} class="hover:bg-blue-50 border-b border-gray-50">
                  <td class="py-1.5 font-mono">{cf.width}x{cf.height}</td>
                  <td class="py-1.5">{cf.deviceName}</td>
                  <td class="py-1.5">{cf.numChars}</td>
                  {!hasMultipleCps && <td class="py-1.5">{cf.codepage}</td>}
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
      ))}
    </div>
  )
}
