import './app.css'
import { useState } from 'preact/hooks'
import { GlyphEditor } from './components/GlyphEditor'
import { GlyphGrid } from './components/GlyphGrid'
import { Toolbar } from './components/Toolbar'
import { DragWindow } from './components/DragWindow'
import { EditorTitle } from './components/EditorTitle'
import { CharSetTitle } from './components/CharSetTitle'
import { Ch8terPane, Ch8terTitle } from './components/Ch8terPane'
import { FontStatusBar } from './components/FontStatusBar'
import { fonts, removeFont } from './store'

export function App() {
  const [focusedWindow, setFocusedWindow] = useState<string>('ch8ter')

  const allFonts = fonts.value
  const maxZ = allFonts.length * 2 + 3

  function getZIndex(windowId: string): number {
    if (windowId === focusedWindow) return maxZ
    if (windowId === 'ch8ter') return 2
    const idx = allFonts.findIndex(f => f.id === windowId || `editor-${f.id}` === windowId)
    return Math.max(1, idx + 3)
  }

  function handleClose(fontId: string) {
    const font = allFonts.find(f => f.id === fontId)
    if (font?.dirty.value) {
      if (!confirm(`"${font.fileName.value}" has unsaved changes. Close anyway?`)) return
    }
    removeFont(fontId)
  }

  return (
    <div class="relative w-screen h-screen overflow-hidden bg-gray-200">
      {/* Ch8ter pane */}
      <DragWindow
        title={<Ch8terTitle />}
        initialX={16}
        initialY={16}
        zIndex={getZIndex('ch8ter')}
        onFocus={() => setFocusedWindow('ch8ter')}
      >
        <Ch8terPane />
      </DragWindow>

      {/* Per-font: Glyph Editor + Font windows */}
      {allFonts.map((font, i) => (
        <>
          <DragWindow
            key={`editor-${font.id}`}
            title={<EditorTitle font={font} />}
            initialX={16 + i * 30}
            initialY={120 + i * 30}
            initialW={380}
            initialH={440}
            resizable
            aspectRatio={1}
            zIndex={getZIndex(`editor-${font.id}`)}
            onFocus={() => setFocusedWindow(`editor-${font.id}`)}
          >
            <div class="flex flex-col gap-2 p-2 h-full">
              <div class="flex-1 min-h-0">
                <GlyphEditor font={font} />
              </div>
              <Toolbar font={font} />
            </div>
          </DragWindow>

          <DragWindow
            key={font.id}
            title={<CharSetTitle font={font} />}
            initialX={420 + i * 30}
            initialY={16 + i * 30}
            initialW={700}
            initialH={600}
            resizable
            statusBar={<FontStatusBar font={font} />}
            zIndex={getZIndex(font.id)}
            onFocus={() => setFocusedWindow(font.id)}
            onClose={allFonts.length > 1 ? () => handleClose(font.id) : undefined}
          >
            <div class="p-3">
              <GlyphGrid font={font} />
            </div>
          </DragWindow>
        </>
      ))}
    </div>
  )
}
