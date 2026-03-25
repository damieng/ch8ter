interface Props {
  title: string
  message: string
  onClose: () => void
}

export function ErrorDialog({ title, message, onClose }: Props) {
  return (
    <div
      class="fixed inset-0 bg-black/40 flex items-center justify-center z-[200]"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div class="bg-white rounded-lg shadow-2xl border border-gray-300 p-5 flex flex-col gap-4 min-w-[300px] max-w-[450px]">
        <h2 class="font-bold text-lg">{title}</h2>
        <p class="text-sm text-gray-700 whitespace-pre-line">{message}</p>
        <div class="flex justify-end">
          <button
            class="px-4 py-1.5 rounded bg-blue-600 text-white text-sm hover:bg-blue-700"
            onClick={onClose}
          >
            OK
          </button>
        </div>
      </div>
    </div>
  )
}
