import './app.css'
import { Fragment } from 'preact'
import { useState, useEffect, useRef } from 'preact/hooks'
import { GlyphEditor } from './components/GlyphEditor'
import { GlyphGrid } from './components/GlyphGrid'
import { Toolbar } from './components/Toolbar'
import { DragWindow } from './components/DragWindow'
import { EditorTitle } from './components/EditorTitle'
import { CharSetTitle } from './components/CharSetTitle'
import { Ch8terPane, Ch8terTitle } from './components/Ch8terPane'
import { FontStatusBar } from './components/FontStatusBar'
import { fonts, activeFontId, removeFont, previews, closePreview, lastOpenedPreviewId, storedFocusedId, storedPreviews } from './store'
import { PreviewWindow } from './components/PreviewWindow'
import { sampleTexts } from './sampleTexts'

export function App() {
  const [focusedId, setFocusedId] = useState<string>(storedFocusedId.value)

  const currentActiveId = activeFontId.value
  const initialActiveId = useRef<string | null>(currentActiveId)
  useEffect(() => {
    // Skip the initial mount — restored focusedId takes precedence
    if (currentActiveId === initialActiveId.current) return
    initialActiveId.current = null
    if (currentActiveId && fonts.value.some(f => f.id === currentActiveId)) {
      setFocus(currentActiveId)
    }
  }, [currentActiveId])

  const lastPreview = lastOpenedPreviewId.value
  const initialPreview = useRef(lastPreview)
  useEffect(() => {
    if (lastPreview === initialPreview.current) return
    initialPreview.current = null
    if (lastPreview) setFocus(lastPreview)
  }, [lastPreview])

  const allFonts = fonts.value
  const TOP = 100

  // Focused font brings both its editor and grid to top
  // Focused preview or ch8ter just brings itself to top
  function getZIndex(windowId: string): number {
    // Extract the font id for paired windows
    const pairedFontId = windowId.startsWith('editor-') ? windowId.slice(7) : windowId

    if (pairedFontId === focusedId) {
      return windowId.startsWith('editor-') ? TOP - 1 : TOP
    }
    return 1
  }

  function setFocus(id: string) {
    setFocusedId(id)
    storedFocusedId.value = id
  }

  function focusFont(fontId: string) {
    setFocus(fontId)
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
        windowId="ch8ter"
        initialX={16}
        initialY={16}
        initialW={380}
        zIndex={getZIndex('ch8ter')}
        onFocus={() => setFocus('ch8ter')}
      >
        <Ch8terPane />
      </DragWindow>

      {/* Per-font: Glyph Editor + Font windows */}
      {allFonts.map((font, i) => (
        <Fragment key={font.id}>
          <DragWindow
            title={<EditorTitle font={font} />}
            windowId={`editor-${font.id}`}
            initialX={16 + i * 30}
            initialY={120 + i * 30}
            initialW={380}
            initialH={440}
            resizable
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
            title={<CharSetTitle font={font} />}
            windowId={`grid-${font.id}`}
            initialX={420 + i * 30}
            initialY={16 + i * 30}
            initialW={700}
            initialH={600}
            resizable
            statusBar={<FontStatusBar font={font} />}
            zIndex={getZIndex(font.id)}
            onFocus={() => focusFont(font.id)}
            onClose={() => handleClose(font.id)}
          >
            <div class="p-3 h-full flex flex-col overflow-hidden">
              <GlyphGrid font={font} />
            </div>
          </DragWindow>
        </Fragment>
      ))}

      {/* Preview windows */}
      {previews.value.map((p, i) => {
        const sp = storedPreviews.value.find(s => s.id === p.id)
        const pFont = allFonts.find(f => f.id === (sp?.selectedFontId ?? p.fontId))
        const [gi, ii] = (sp?.textKey ?? '0-0').split('-').map(Number)
        const sampleName = sampleTexts[gi]?.items[ii]?.name ?? ''
        const previewTitle = `Preview Text — ${sampleName} — ${pFont?.fileName.value ?? ''}`
        return (
        <DragWindow
          key={p.id}
          title={previewTitle}
          windowId={p.id}
          initialX={200 + i * 30}
          initialY={100 + i * 30}
          initialW={600}
          initialH={450}
          resizable
          zIndex={getZIndex(p.id)}
          onFocus={() => setFocus(p.id)}
          onClose={() => closePreview(p.id)}
        >
          <PreviewWindow previewId={p.id} initialFontId={p.fontId} />
        </DragWindow>
        )
      })}
    </div>
  )
}
