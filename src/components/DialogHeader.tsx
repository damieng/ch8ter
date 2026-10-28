interface Props {
  title: string
  /** When set, shows the ✕ close button in the title bar (viewer/action
   *  dialogs only — form dialogs close via their footer buttons). */
  onClose?: () => void
}

/**
 * Shared dialog title bar: blue bar with a Title Case title and an
 * optional ✕ close button.
 */
export function DialogHeader({ title, onClose }: Props) {
  return (
    <div class="px-5 py-2 bg-blue-100 border-b border-gray-300 rounded-t-lg flex items-center">
      <h2 class="font-bold text-lg">{title}</h2>
      {onClose && (
        <button
          class="ml-auto text-gray-500 hover:text-gray-700 hover:bg-black/5 rounded px-1.5 py-0.5 text-base leading-none"
          onClick={onClose}
          aria-label="Close"
        >
          ✕
        </button>
      )}
    </div>
  )
}
