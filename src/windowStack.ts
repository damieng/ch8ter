// Window stacking: a monotonically increasing counter. Clicking a window
// raises it — highest z wins. Lives at module scope so it survives component
// re-renders and can be raised from outside the component tree (e.g. when a
// glyph click re-opens the editor).

import { signal } from '@preact/signals'

export const windowZ = signal<Record<string, number>>({})
let zTop = 0

export function raiseWindow(windowId: string): void {
  windowZ.value = { ...windowZ.value, [windowId]: ++zTop }
  if (zTop > 5000) {
    // Renormalize so z values stay well below the dialog layer (100000)
    const sorted = Object.entries(windowZ.value).sort((a, b) => a[1] - b[1])
    const normalized: Record<string, number> = {}
    sorted.forEach(([id], i) => { normalized[id] = i + 1 })
    zTop = sorted.length
    windowZ.value = normalized
  }
}

export function getZIndex(windowId: string): number {
  return windowZ.value[windowId] ?? 1
}
