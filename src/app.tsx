import './app.css'
import { useState, useEffect } from 'preact/hooks'
import { GlyphEditor } from './components/GlyphEditor'
import { GlyphGrid } from './components/GlyphGrid'
import { Toolbar } from './components/Toolbar'
import { DragWindow } from './components/DragWindow'
import { EditorTitle } from './components/EditorTitle'
import { CharSetTitle } from './components/CharSetTitle'
import { Ch8terPane, Ch8terTitle } from './components/Ch8terPane'
import { FontStatusBar } from './components/FontStatusBar'
import { fonts, activeFontId, removeFont } from './store'

export function App() {
  // Track which font pair is in the foreground (null = ch8ter pane focused)
  const [focusedFontId, setFocusedFontId] = useState<string | null>(null)

  // When a new font is added/activated, bring its windows to front
  const currentActiveId = activeFontId.value
  useEffect(() => {
    if (currentActiveId && fonts.value.some(f => f.id === currentActiveId)) {
      setFocusedFontId(currentActiveId)
    }
  }, [currentActiveId])

  const allFonts = fonts.value
  const maxZ = allFonts.length * 2 + 3

  function getZIndex(windowId: string): number {
    if (windowId === 'ch8ter') {
      return focusedFontId === null ? maxZ : 2
    }
    // Both the font window and its editor share the same high z-index when focused
    const fontId = windowId.startsWith('editor-') ? windowId.slice(7) : windowId
    if (fontId === focusedFontId) return maxZ - (windowId.startsWith('editor-') ? 1 : 0)
    const idx = allFonts.findIndex(f => f.id === fontId)
    return Math.max(1, idx + 3)
  }

  function focusFont(fontId: string) {
    setFocusedFontId(fontId)
    activeFontId.value = fontId
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
        onFocus={() => setFocusedFontId(null)}
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
            onFocus={() => focusFont(font.id)}
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
            onFocus={() => focusFont(font.id)}
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
