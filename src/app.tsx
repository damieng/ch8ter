import './app.css'
import { GlyphEditor } from './components/GlyphEditor'
import { GlyphGrid } from './components/GlyphGrid'
import { FileBar, Toolbar } from './components/Toolbar'

export function App() {
  return (
    <div class="flex h-screen overflow-hidden">
      {/* Left panel */}
      <div class="flex flex-col gap-4 p-4 border-r border-gray-300 bg-gray-50 shrink-0 overflow-y-auto" style={{ width: 'fit-content', maxWidth: '50vw' }}>
        <div class="flex items-center gap-3">
          <h1
            class="text-2xl font-black tracking-tight"
            style={{
              background: 'linear-gradient(90deg, #d70000, #d7d700, #00d700, #00d7d7, #0000d7, #d700d7)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
          >Ch8ter</h1>
          <FileBar />
        </div>
        <GlyphEditor />
        <Toolbar />
      </div>

      {/* Right panel */}
      <div class="flex-1 p-4 overflow-y-auto">
        <GlyphGrid />
      </div>
    </div>
  )
}
