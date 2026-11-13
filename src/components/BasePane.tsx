import { useRef, useEffect, useState } from 'preact/hooks'
import type { ComponentChildren } from 'preact'
import { Minus } from 'lucide-preact'
import {
  windowLayouts, updateWindowLayout, storedFocusedId,
  minimizeWindow, restoreWindow, ICON_W, ICON_H,
} from '../store'

interface Props {
  title: string | ComponentChildren
  children: ComponentChildren
  statusBar?: ComponentChildren
  windowId?: string
  initialX: number
  initialY: number
  initialW?: number
  initialH?: number
  resizable?: boolean
  aspectRatio?: number // e.g. 1 for 1:1
  onFocus?: () => void
  onClose?: () => void
  zIndex?: number
  /** Picture shown on the desktop icon when the window is minimized. */
  icon?: ComponentChildren
  /** Caption under the desktop icon; defaults to the window title. */
  iconLabel?: ComponentChildren
}

function clampIcon(p: { x: number; y: number }): { x: number; y: number } {
  return {
    x: Math.max(0, Math.min(window.innerWidth - ICON_W, p.x)),
    y: Math.max(0, Math.min(window.innerHeight - ICON_H, p.y)),
  }
}

/**
 * Desktop icon for a minimized window. Drag it to move it; click (without
 * dragging) to restore. It sits at the very bottom of the stacking order,
 * behind every window, like an icon in the Windows 3.1 Program Manager.
 */
function MinimizedIcon({ windowId, title, icon, onRestore }: {
  windowId: string
  title: ComponentChildren
  icon?: ComponentChildren
  onRestore: () => void
}) {
  const stored = windowLayouts.value[windowId]
  const [pos, setPos] = useState(() => clampIcon({ x: stored?.iconX ?? 16, y: stored?.iconY ?? 16 }))
  const posRef = useRef(pos)
  posRef.current = pos
  const restoreRef = useRef(onRestore)
  restoreRef.current = onRestore
  const drag = useRef<{ dx: number; dy: number; sx: number; sy: number; moved: boolean } | null>(null)

  useEffect(() => {
    function onMove(e: MouseEvent) {
      const d = drag.current
      if (!d) return
      if (!d.moved && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < 4) return
      d.moved = true
      const next = clampIcon({ x: e.clientX - d.dx, y: e.clientY - d.dy })
      posRef.current = next
      setPos(next)
    }
    function onUp() {
      const d = drag.current
      drag.current = null
      if (!d) return
      if (d.moved) updateWindowLayout(windowId, { iconX: posRef.current.x, iconY: posRef.current.y })
      else restoreRef.current()
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    return () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
  }, [windowId])

  return (
    <div
      class="absolute flex flex-col items-center gap-1 select-none cursor-pointer"
      style={{ left: pos.x, top: pos.y, width: ICON_W, zIndex: 0 }}
      onMouseDown={(e: MouseEvent) => {
        if (e.button !== 0) return
        e.preventDefault()
        drag.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y, sx: e.clientX, sy: e.clientY, moved: false }
      }}
    >
      <div class="w-10 h-10 flex items-center justify-center bg-white border border-gray-400 shadow text-gray-700">
        {icon}
      </div>
      <div class="w-full text-center text-[11px] leading-tight text-gray-800 line-clamp-2 break-words">
        {title}
      </div>
    </div>
  )
}

/** Keep the window reachable: at least a strip of the title bar stays
 *  inside the viewport (dragging and restored positions are both clamped). */
function clampPos(p: { x: number; y: number }, w: number): { x: number; y: number } {
  const minVisible = 60
  const maxX = window.innerWidth - minVisible
  const minX = Math.min(0, minVisible - Math.max(w, minVisible))
  const maxY = window.innerHeight - minVisible
  return {
    x: Math.max(minX, Math.min(maxX, p.x)),
    y: Math.max(0, Math.min(maxY, p.y)),
  }
}

export function BasePane({
  title, children, statusBar, windowId, initialX, initialY,
  initialW, initialH, resizable, aspectRatio,
  onFocus, onClose, zIndex = 1, icon, iconLabel
}: Props) {
  const stored = windowId ? windowLayouts.value[windowId] : undefined
  const minimized = stored?.minimized === true
  const focused = windowId != null && storedFocusedId.value === windowId
  const [pos, setPos] = useState(() => clampPos(
    { x: stored?.x ?? initialX, y: stored?.y ?? initialY },
    stored?.w ?? (initialW ?? 0),
  ))
  const [size, setSize] = useState({
    w: resizable ? (stored?.w ?? (initialW ?? 0)) : (initialW ?? 0),
    h: resizable ? (stored?.h ?? (initialH ?? 0)) : (initialH ?? 0),
  })

  // Save on mount
  useEffect(() => {
    if (windowId) {
      if (resizable) {
        updateWindowLayout(windowId, { x: pos.x, y: pos.y, w: size.w, h: size.h })
      } else {
        updateWindowLayout(windowId, { x: pos.x, y: pos.y, w: undefined, h: undefined })
      }
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const dragging = useRef(false)
  const resizing = useRef(false)
  const posRef = useRef(pos)
  const sizeRef = useRef(size)
  posRef.current = pos
  sizeRef.current = size
  const offset = useRef({ x: 0, y: 0 })
  const resizeStart = useRef({ x: 0, y: 0, w: 0, h: 0 })
  const titleRef = useRef<HTMLDivElement>(null)

  function onTitleMouseDown(e: MouseEvent) {
    e.preventDefault()
    dragging.current = true
    offset.current = { x: e.clientX - pos.x, y: e.clientY - pos.y }
    onFocus?.()
  }

  // New windows pop up on top of everything else
  useEffect(() => {
    onFocus?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function onResizeMouseDown(e: MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    resizing.current = true
    resizeStart.current = { x: e.clientX, y: e.clientY, w: size.w, h: size.h }
    onFocus?.()
  }

  useEffect(() => {
    function onMouseMove(e: MouseEvent) {
      if (dragging.current) {
        const next = clampPos(
          { x: e.clientX - offset.current.x, y: e.clientY - offset.current.y },
          sizeRef.current.w,
        )
        posRef.current = next
        setPos(next)
      }
      if (resizing.current) {
        const dx = e.clientX - resizeStart.current.x
        const dy = e.clientY - resizeStart.current.y
        let newW = Math.max(150, resizeStart.current.w + dx)
        let newH = Math.max(100, resizeStart.current.h + dy)
        if (aspectRatio) {
          const titleH = titleRef.current?.offsetHeight ?? 30
          const contentW = newW
          const contentH = newH - titleH
          const driven = Math.max(contentW, contentH)
          newW = driven
          newH = driven + titleH
        }
        const next = { w: newW, h: newH }
        sizeRef.current = next
        setSize(next)
      }
    }
    function onMouseUp() {
      const wasDragging = dragging.current || resizing.current
      dragging.current = false
      resizing.current = false
      if (wasDragging && windowId) {
        const p = posRef.current
        if (resizable) {
          const s = sizeRef.current
          updateWindowLayout(windowId, { x: p.x, y: p.y, w: s.w, h: s.h })
        } else {
          updateWindowLayout(windowId, { x: p.x, y: p.y, w: undefined, h: undefined })
        }
      }
    }
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
    return () => {
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
    }
  }, [aspectRatio, windowId])

  // A minimized window stays mounted (so its scroll position, canvas and
  // keyboard handling survive) but is hidden; its desktop icon stands in.
  const hiddenStyle = minimized ? { visibility: 'hidden' as const, pointerEvents: 'none' as const } : {}

  return (
    <>
    {minimized && windowId && (
      <MinimizedIcon
        windowId={windowId}
        title={iconLabel ?? title}
        icon={icon}
        onRestore={() => { restoreWindow(windowId); onFocus?.() }}
      />
    )}
    <div
      class="absolute rounded-lg shadow-xl border border-gray-300 bg-white overflow-hidden flex flex-col"
      style={{ left: pos.x, top: pos.y, zIndex, width: size.w || undefined, height: size.h || undefined, ...hiddenStyle }}
      onMouseDown={() => onFocus?.()}
    >
      <div
        ref={titleRef}
        class={`flex items-center gap-2 px-3 py-1.5 border-b border-gray-300 cursor-move select-none shrink-0 ${focused ? 'bg-blue-100' : 'bg-gray-100'}`}
        onMouseDown={onTitleMouseDown}
      >
        <span class="font-bold text-sm flex-1">{title}</span>
        {windowId && (
          <button
            class="ml-auto w-6 h-6 flex items-center justify-center rounded-sm text-gray-500 hover:bg-gray-300/60 hover:text-gray-800"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); minimizeWindow(windowId) }}
            title="Minimize"
          >
            <Minus size={14} strokeWidth={2.5} />
          </button>
        )}
        {onClose && (
          <button
            class="text-gray-400 hover:text-red-500 leading-none text-lg font-bold"
            onClick={(e) => { e.stopPropagation(); onClose() }}
            title="Close"
          >
            ×
          </button>
        )}
      </div>
      <div class="overflow-auto flex-1">
        {children}
      </div>
      {statusBar && (
        <div class="flex items-center justify-between px-3 py-1 bg-gray-50 border-t border-gray-300 text-xs text-gray-500 shrink-0">
          {statusBar}
        </div>
      )}
      {resizable && (
        <div
          class="absolute bottom-0 right-0 w-4 h-4 cursor-nwse-resize"
          onMouseDown={onResizeMouseDown}
        >
          <svg viewBox="0 0 16 16" class="w-4 h-4 text-gray-400">
            <path d="M14 14L8 14L14 8Z" fill="currentColor" />
            <path d="M14 14L11 14L14 11Z" fill="currentColor" opacity="0.5" />
          </svg>
        </div>
      )}
    </div>
    </>
  )
}
