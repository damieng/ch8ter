import { useEffect, useRef } from 'preact/hooks'
import type { RefObject } from 'preact'

/**
 * Close a popup when clicking outside the given refs.
 * Pass one or more refs — if the click target is outside all of them, `onClose` fires.
 */
export function useClickOutside(
  refs: RefObject<HTMLElement | null> | RefObject<HTMLElement | null>[],
  onClose: () => void,
) {
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  const refsRef = useRef(refs)
  refsRef.current = refs

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      const target = e.target as Node
      const refList = Array.isArray(refsRef.current) ? refsRef.current : [refsRef.current]
      for (const ref of refList) {
        if (ref.current?.contains(target)) return
      }
      onCloseRef.current()
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])
}
