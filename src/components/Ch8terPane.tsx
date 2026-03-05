import { useState } from 'preact/hooks'
import { FilePlus, FolderOpen } from 'lucide-preact'
import { createFont, addFont, loadFont, charset } from '../store'
import { parseBdf } from '../bdfParser'
import { IconBtn } from './IconBtn'
import { NewFontDialog } from './NewFontDialog'

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
  const [showNewDialog, setShowNewDialog] = useState(false)

  function handleOpen() {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.ch8,.bin,.bdf'
    input.onchange = () => {
      const file = input.files?.[0]
      if (!file) return
      if (file.name.toLowerCase().endsWith('.bdf')) {
        file.text().then(text => {
          try {
            const result = parseBdf(text)
            const font = createFont(result.fontData, file.name, result.startChar, result.glyphWidth, result.glyphHeight, result.meta, result.encodings, result.baseline)
            addFont(font)
            charset.value = 'imported'
          } catch (e) {
            alert(`Failed to parse BDF: ${(e as Error).message}`)
          }
        })
      } else {
        file.arrayBuffer().then(buf => {
          const font = createFont()
          loadFont(font, buf)
          font.fileName.value = file.name
          addFont(font)
        })
      }
    }
    input.click()
  }

  return (
    <div class="flex items-center gap-3 px-3 py-2">
      <IconBtn onClick={() => setShowNewDialog(true)} title="New font">
        <FilePlus size={ICON} />
      </IconBtn>
      {showNewDialog && <NewFontDialog onClose={() => setShowNewDialog(false)} />}
      <IconBtn onClick={handleOpen} title="Open font file">
        <FolderOpen size={ICON} />
      </IconBtn>
      <span class="w-px h-6 bg-gray-300 mx-0.5" />
      <div class="flex flex-col">
        <span class="text-sm text-gray-600">Online Bitmap Font Editor</span>
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
