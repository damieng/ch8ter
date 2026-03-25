// Root component — manages the MDI window layout for font panes, editors, and previews.

import './app.css'
import { Fragment } from 'preact'
import { useState } from 'preact/hooks'
import { GlyphEditor } from './panes/GlyphEditor'
import { FontPane, FontPaneTitle } from './panes/FontPane'
import { Toolbar } from './components/Toolbar'
import { BasePane } from './components/BasePane'
import { EditorTitle } from './components/EditorTitle'
import { AppPane, AppTitle } from './panes/AppPane'
import { FontStatusBar } from './components/FontStatusBar'
import { fonts, activeFontId, removeFont, previews, closePreview, storedFocusedId, storedPreviews, containers, removeContainer } from './store'
import { PreviewPane } from './panes/PreviewPane'
import { ContainerPane, ContainerPaneTitle, ContainerStatusBar } from './panes/ContainerPane'
import { ConfirmDialog } from './dialogs/ConfirmDialog'
import { sampleTexts } from './sampleTexts'

export function App() {
  const [confirmClose, setConfirmClose] = useState<{ fontId: string; font: typeof allFonts[0] } | null>(null)
  const focusedId = storedFocusedId.value

  const allFonts = fonts.value
  const TOP = 100

  function getZIndex(windowId: string): number {
    return windowId === focusedId ? TOP : 1
  }

  function setFocus(id: string) {
    storedFocusedId.value = id
  }

  function focusFont(windowId: string, fontId: string) {
    setFocus(windowId)
    activeFontId.value = fontId
  }

  function handleClose(fontId: string) {
    const font = allFonts.find(f => f.id === fontId)
    if (font?.dirty.value) {
      setConfirmClose({ fontId, font })
      return
    }
    removeFont(fontId)
  }

  return (
    <div class="relative w-screen h-screen overflow-hidden bg-gray-200">
      {/* App pane */}
      <BasePane
        title={<AppTitle />}
        windowId="ch8ter"
        initialX={16}
        initialY={16}
        initialW={380}
        zIndex={getZIndex('ch8ter')}
        onFocus={() => setFocus('ch8ter')}
      >
        <AppPane />
      </BasePane>

      {/* Per-font: Glyph Editor + Font windows */}
      {allFonts.map((font, i) => (
        <Fragment key={font.id}>
          {font.editorOpen.value && (
            <BasePane
              title={<EditorTitle font={font} />}
              windowId={`editor-${font.id}`}
              initialX={16 + i * 30}
              initialY={120 + i * 30}
              initialW={380}
              initialH={440}
              resizable
              zIndex={getZIndex(`editor-${font.id}`)}
              onFocus={() => focusFont(`editor-${font.id}`, font.id)}
              onClose={() => { font.editorOpen.value = false }}
            >
              <div class="flex flex-col gap-2 p-2 h-full">
                <div class="flex-1 min-h-0">
                  <GlyphEditor font={font} />
                </div>
                <Toolbar font={font} />
              </div>
            </BasePane>
          )}

          <BasePane
            title={<FontPaneTitle font={font} />}
            windowId={`grid-${font.id}`}
            initialX={420 + i * 30}
            initialY={16 + i * 30}
            initialW={700}
            initialH={600}
            resizable
            statusBar={<FontStatusBar font={font} />}
            zIndex={getZIndex(`grid-${font.id}`)}
            onFocus={() => focusFont(`grid-${font.id}`, font.id)}
            onClose={() => handleClose(font.id)}
          >
            <div class="p-3 h-full flex flex-col overflow-hidden">
              <FontPane font={font} />
            </div>
          </BasePane>
        </Fragment>
      ))}

      {/* Container windows */}
      {containers.value.map((c, i) => (
        <BasePane
          key={c.id}
          title={<ContainerPaneTitle container={c} />}
          windowId={`container-${c.id}`}
          initialX={200 + i * 30}
          initialY={80 + i * 30}
          initialW={420}
          initialH={300}
          resizable
          statusBar={<ContainerStatusBar container={c} />}
          zIndex={getZIndex(`container-${c.id}`)}
          onFocus={() => setFocus(`container-${c.id}`)}
          onClose={() => removeContainer(c.id)}
        >
          <ContainerPane container={c} />
        </BasePane>
      ))}

      {/* Preview windows */}
      {previews.value.map((p, i) => {
        const sp = storedPreviews.value.find(s => s.id === p.id)
        const pFont = allFonts.find(f => f.id === (sp?.selectedFontId ?? p.fontId))
        const [gi, ii] = (sp?.textKey ?? '0-0').split('-').map(Number)
        const sampleName = sampleTexts[gi]?.items[ii]?.name ?? ''
        const previewTitle = `Preview Text — ${sampleName} — ${pFont?.fileName.value ?? ''}`
        return (
        <BasePane
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
          <PreviewPane previewId={p.id} initialFontId={p.fontId} />
        </BasePane>
        )
      })}
      {confirmClose && (
        <ConfirmDialog
          font={confirmClose.font}
          onConfirm={() => { removeFont(confirmClose.fontId); setConfirmClose(null) }}
          onCancel={() => setConfirmClose(null)}
        />
      )}
    </div>
  )
}
