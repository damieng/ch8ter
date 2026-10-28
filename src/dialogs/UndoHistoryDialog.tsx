// Browse a font's undo history: every recorded step with the current
// position marked; clicking an entry jumps there via undo/redo.

import { useState } from 'preact/hooks'
import { type FontInstance } from '../store'
import { type UndoHistoryEntry } from '../undoHistory'
import { DialogOverlay } from '../components/DialogOverlay'
import { DialogHeader } from '../components/DialogHeader'
import { CornerDownLeft, CornerDownRight } from 'lucide-preact'

export function UndoHistoryDialog({ font, onClose }: { font: FontInstance; onClose: () => void }) {
  const [, setTick] = useState(0)
  const rerender = () => setTick(t => t + 1)

  const entries: UndoHistoryEntry[] = font.undoHistory.list()

  function jump(entry: UndoHistoryEntry) {
    font.undoHistory.jump(entry.steps, entry.state === 'past' ? 'undo' : 'redo')
    rerender()
  }

  return (
    <DialogOverlay onClose={onClose} label="Undo history">
      <div class="bg-gray-50 rounded-lg shadow-2xl border border-gray-300 flex flex-col min-w-[380px] max-h-[70vh]">
        <DialogHeader title="Undo History" onClose={onClose} />
        <div class="px-5 py-3 overflow-y-auto">
          {entries.length === 0 ? (
            <p class="text-sm text-gray-500 py-4 text-center">No history yet for this font.</p>
          ) : (
            <ul class="flex flex-col gap-0.5">
              {entries.map((entry, i) => {
                const previous = entries[i - 1]
                const showMarker = previous && previous.state === 'past' && entry.state === 'future'
                return (
                  <>
                    {showMarker && (
                      <li class="flex items-center gap-2 text-[10px] uppercase tracking-wide text-gray-400 py-0.5">
                        <span class="flex-1 border-t border-gray-300" />
                        current position
                        <span class="flex-1 border-t border-gray-300" />
                      </li>
                    )}
                    <li>
                      <button
                        class={`w-full flex items-center gap-2 px-2 py-1 rounded text-sm text-left ${
                          entry.state === 'past'
                            ? 'hover:bg-blue-50 text-gray-700'
                            : 'hover:bg-blue-50 text-gray-400'
                        }`}
                        onClick={() => jump(entry)}
                        title={entry.state === 'past'
                          ? `Undo ${entry.steps} step${entry.steps === 1 ? '' : 's'} to here`
                          : `Redo ${entry.steps} step${entry.steps === 1 ? '' : 's'} to here`}
                      >
                        {entry.state === 'past'
                          ? <CornerDownLeft size={12} class="shrink-0" />
                          : <CornerDownRight size={12} class="shrink-0" />}
                        <span class="flex-1">{entry.name}</span>
                        <span class="text-[10px] font-mono text-gray-400">
                          {entry.state === 'past' ? `-${entry.steps}` : `+${entry.steps}`}
                        </span>
                      </button>
                    </li>
                  </>
                )
              })}
            </ul>
          )}
        </div>
        <div class="px-5 py-2 bg-gray-100 border-t border-gray-300 rounded-b-lg text-xs text-gray-500">
          Click a step to jump there (undo or redo to that point).
        </div>
      </div>
    </DialogOverlay>
  )
}
