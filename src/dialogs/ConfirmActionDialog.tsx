import { DialogOverlay } from '../components/DialogOverlay'

interface Props {
  title: string
  message: string
  confirmLabel: string
  confirmClass?: string
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmActionDialog({
  title,
  message,
  confirmLabel,
  confirmClass,
  onConfirm,
  onCancel,
}: Props) {
  return (
    <DialogOverlay onClose={onCancel} label={title}>
      <div class="bg-white rounded-lg shadow-2xl border border-gray-300 p-5 flex flex-col gap-4 min-w-[320px] max-w-[420px]">
        <h2 class="font-bold text-lg">{title}</h2>
        <p class="text-sm text-gray-700 whitespace-pre-line">{message}</p>
        <div class="flex justify-end gap-2">
          <button
            class="px-4 py-1.5 rounded border border-gray-300 text-sm hover:bg-gray-100"
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            class={confirmClass ?? 'px-4 py-1.5 rounded bg-red-600 text-white text-sm hover:bg-red-700'}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </DialogOverlay>
  )
}
