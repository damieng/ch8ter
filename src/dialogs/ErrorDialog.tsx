import { DialogOverlay } from '../components/DialogOverlay'

interface Props {
  title: string
  message: string
  onClose: () => void
}

export function ErrorDialog({ title, message, onClose }: Props) {
  return (
    <DialogOverlay onClose={onClose} label={title}>
      <div class="bg-gray-50 rounded-lg shadow-2xl border border-gray-300 flex flex-col min-w-[300px] max-w-[450px]">
        <div class="px-5 py-2 bg-red-100 border-b border-gray-300 rounded-t-lg">
          <h2 class="font-bold text-lg text-red-800">{title}</h2>
        </div>
        <p class="text-sm text-gray-700 whitespace-pre-line px-5 py-4">{message}</p>
        <div class="flex justify-end px-5 py-2 bg-gray-100 border-t border-gray-300 rounded-b-lg">
          <button
            class="px-4 py-1.5 rounded bg-blue-600 text-white text-sm hover:bg-blue-700"
            onClick={onClose}
          >
            OK
          </button>
        </div>
      </div>
    </DialogOverlay>
  )
}
