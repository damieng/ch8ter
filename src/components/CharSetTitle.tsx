import { type FontInstance } from '../store'

export function CharSetTitle({ font }: { font: FontInstance }) {
  return <span>Font — {font.fileName.value} ({font.spacing.value})</span>
}
