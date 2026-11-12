import { useEffect, useRef, useState } from 'preact/hooks'
import type { ComponentChildren } from 'preact'
import { createPortal } from 'preact/compat'
import { useClickOutside } from '../hooks/useClickOutside'
import { POPUP_Z } from '../windowStack'

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
  /** Content rendered inside the popup; receives a close callback */
  children: (close: () => void) => ComponentChildren
  /** Content rendered outside the popup (e.g. portaled dialogs), always visible */
  extra?: ComponentChildren
}

export function Dropdown({
  button, buttonClass, title, popupClass, align = 'left', children, extra,
}: Props) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const popupRef = useRef<HTMLDivElement>(null)
  useClickOutside([ref, popupRef], () => setOpen(false))
  const close = () => setOpen(false)
  const [popupStyle, setPopupStyle] = useState<Record<string, string | number>>({})

  useEffect(() => {
    if (!open) return
    const rect = buttonRef.current?.getBoundingClientRect()
    if (!rect) return
    const top = rect.bottom + 4
    if (align === 'right') {
      const right = Math.max(0, window.innerWidth - rect.right)
      setPopupStyle({ position: 'fixed', top, right, zIndex: POPUP_Z })
    } else {
      setPopupStyle({ position: 'fixed', top, left: rect.left, zIndex: POPUP_Z })
    }
  }, [open, align])

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
      {/* Always portaled to <body>: a window's own stacking context would
          otherwise let other windows paint over the menu. */}
      {open && createPortal(
        <div
          ref={popupRef}
          class={`bg-white border border-gray-300 rounded shadow-lg py-1 ${popupClass ?? ''}`}
          style={popupStyle}
        >
          {children(close)}
        </div>,
        document.body,
      )}
      {extra}
    </div>
  )
}
