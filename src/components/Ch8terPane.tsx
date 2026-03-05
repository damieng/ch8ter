import { FilePlus, FolderOpen } from 'lucide-preact'
import { createFont, addFont, loadFont } from '../store'
import { IconBtn } from './IconBtn'

const ICON = 18

const BUILD_DATE = __BUILD_DATE__

export function Ch8terTitle() {
  return (
    <span class="flex items-center w-full">
      <span class="font-black tracking-tight">Ch8ter</span>
      <span class="ml-auto font-normal text-xs text-gray-400">{BUILD_DATE}</span>
    </span>
  )
}

export function Ch8terPane() {
  function handleNew() {
    const countStr = prompt('Number of glyphs (default 96):', '96')
    if (!countStr) return
    const count = parseInt(countStr, 10)
    if (isNaN(count) || count < 1) return
    const startStr = prompt('Start character code (default 32):', '32')
    if (startStr === null) return
    const start = parseInt(startStr, 10)
    if (isNaN(start) || start < 0) return
    const font = createFont(new Uint8Array(count * 8), 'untitled.ch8', start)
    addFont(font)
  }

  function handleOpen() {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.ch8,.bin'
    input.onchange = () => {
      const file = input.files?.[0]
      if (!file) return
      file.arrayBuffer().then(buf => {
        const font = createFont()
        loadFont(font, buf)
        font.fileName.value = file.name
        addFont(font)
      })
    }
    input.click()
  }

  return (
    <div class="flex items-center gap-3 px-3 py-2">
      <IconBtn onClick={handleNew} title="New font">
        <FilePlus size={ICON} />
      </IconBtn>
      <IconBtn onClick={handleOpen} title="Open .ch8 file">
        <FolderOpen size={ICON} />
      </IconBtn>
      <span class="w-px h-6 bg-gray-300 mx-0.5" />
      <div class="flex flex-col">
        <span class="text-sm text-gray-600">ZX Spectrum Font Editor</span>
        <a
          class="text-sm text-blue-500 hover:text-blue-700 underline"
          href="https://github.com/damieng/ch8ter"
          target="_blank"
        >
          https://github.com/damieng/ch8ter
        </a>
      </div>
    </div>
  )
}
