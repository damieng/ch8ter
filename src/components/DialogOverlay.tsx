import { useRef, useEffect } from 'preact/hooks'
import type { ComponentChildren } from 'preact'

interface Props {
  children: ComponentChildren
  onClose: () => void
  label?: string
}

/** Registration order of open dialogs; only the last (topmost) one may
 *  react to Escape. Multiple overlays can stack (e.g. drag-drop while a
 *  dialog is open), and document listeners all receive the event. */
const dialogStack: object[] = []

export function DialogOverlay({ children, onClose, label }: Props) {
  const overlayRef = useRef<HTMLDivElement>(null)
  const previousFocus = useRef<Element | null>(null)
  // Keep the callback in a ref so the mount effect runs exactly once —
  // call sites pass inline arrows, which would otherwise tear down and
  // re-run this effect (re-focusing, re-registering) on every parent render.
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    previousFocus.current = document.activeElement

    const token = {}
    dialogStack.push(token)

    // Focus the first focusable element inside the dialog
    const overlay = overlayRef.current
    if (overlay) {
      const focusable = overlay.querySelector<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      )
      focusable?.focus()
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        if (dialogStack[dialogStack.length - 1] !== token) return
        e.stopPropagation()
        onCloseRef.current()
        return
      }

      // Trap focus within the dialog
      if (e.key === 'Tab' && overlay) {
        const focusables = overlay.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        )
        if (focusables.length === 0) return
        const first = focusables[0]
        const last = focusables[focusables.length - 1]
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      const idx = dialogStack.indexOf(token)
      if (idx >= 0) dialogStack.splice(idx, 1)
      // Restore focus to the element that was focused before the dialog opened
      if (previousFocus.current instanceof HTMLElement) {
        previousFocus.current.focus()
      }
    }
  }, [])

  return (
    <div
      ref={overlayRef}
      class="fixed inset-0 bg-black/40 flex items-center justify-center z-[200]"
      role="dialog"
      aria-modal="true"
      aria-label={label}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      {children}
    </div>
  )
}
