import { useState, useRef } from 'preact/hooks'
import type { ComponentChildren } from 'preact'
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
  useClickOutside(ref, () => setOpen(false))
  const close = () => setOpen(false)

  const alignClass = align === 'right' ? 'right-0' : 'left-0'

  return (
    <div class="relative" ref={ref}>
      <button
        class={buttonClass ?? 'px-2 py-1 bg-white hover:bg-blue-50 rounded border border-gray-300 font-medium flex items-center gap-1'}
        onClick={() => setOpen(!open)}
        title={title}
      >
        {button}
      </button>
      {open && (
        <div class={`absolute top-full ${alignClass} mt-1 bg-white border border-gray-300 rounded shadow-lg z-50 py-1 ${popupClass ?? ''}`}>
          {children(close)}
        </div>
      )}
      {extra}
    </div>
  )
}
