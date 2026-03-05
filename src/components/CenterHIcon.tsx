export function CenterHIcon({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      {/* Letter A in center */}
      <path d="M9.5 17L12 7L14.5 17" />
      <path d="M10.3 14H13.7" />
      {/* Left arrow pointing right toward A */}
      <line x1="1" y1="12" x2="7" y2="12" />
      <polyline points="5,9.5 7,12 5,14.5" />
      {/* Right arrow pointing left toward A */}
      <line x1="23" y1="12" x2="17" y2="12" />
      <polyline points="19,9.5 17,12 19,14.5" />
    </svg>
  )
}
