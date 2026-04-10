import { useEffect, useRef, useState } from 'preact/hooks'
import type { ComponentChildren } from 'preact'
import { createPortal } from 'preact/compat'
import { useClickOutside } from '../hooks/useClickOutside'

interface Props {
  /** The trigger button content */
  button: ComponentChildren
  /** Extra classes on the trigger button */
  buttonClass?: string
  /** Title attribute for the trigger button */
  title?: string
  /** Extra classes on the popup panel */
  popupClass?: string
  /** Popup alignment: 'left' (default) or 'right' */
  align?: 'left' | 'right'
  /** Render the popup in a portal (avoids clipping) */
  portal?: boolean
  /** Content rendered inside the popup; receives a close callback */
  children: (close: () => void) => ComponentChildren
  /** Content rendered outside the popup (e.g. portaled dialogs), always visible */
  extra?: ComponentChildren
}

export function Dropdown({
  button, buttonClass, title, popupClass, align = 'left', portal = false, children, extra,
}: Props) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const popupRef = useRef<HTMLDivElement>(null)
  useClickOutside(portal ? [ref, popupRef] : ref, () => setOpen(false))
  const close = () => setOpen(false)
  const [popupStyle, setPopupStyle] = useState<Record<string, string | number>>({})

  const alignClass = align === 'right' ? 'right-0' : 'left-0'

  useEffect(() => {
    if (!open || !portal) return
    const rect = buttonRef.current?.getBoundingClientRect()
    if (!rect) return
    const top = rect.bottom + 4
    if (align === 'right') {
      const right = Math.max(0, window.innerWidth - rect.right)
      setPopupStyle({ position: 'fixed', top, right, zIndex: 120 })
    } else {
      setPopupStyle({ position: 'fixed', top, left: rect.left, zIndex: 120 })
    }
  }, [open, portal, align])

  return (
    <div class="relative" ref={ref}>
      <button
        class={buttonClass ?? 'px-2 py-1 bg-white hover:bg-blue-50 rounded border border-gray-300 font-medium flex items-center gap-1'}
        onClick={() => setOpen(!open)}
        title={title}
        ref={buttonRef}
      >
        {button}
      </button>
      {open && (
        portal
          ? createPortal(
            <div
              ref={popupRef}
              class={`bg-white border border-gray-300 rounded shadow-lg py-1 ${popupClass ?? ''}`}
              style={popupStyle}
            >
              {children(close)}
            </div>,
            document.body,
          )
          : (
            <div
              class={`absolute top-full ${alignClass} mt-1 bg-white border border-gray-300 rounded shadow-lg z-50 py-1 ${popupClass ?? ''}`}
            >
              {children(close)}
            </div>
          )
      )}
      {extra}
    </div>
  )
}
