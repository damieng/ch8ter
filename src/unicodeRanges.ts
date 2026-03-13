// Unicode ranges that must always render at fixed (monospace) advance width.
// These characters are designed to tile, connect, or align with adjacent cells —
// proportional spacing would break their visual purpose.

export interface UnicodeRange {
  start: number
  end: number
  name: string
}

export const FIXED_WIDTH_RANGES: UnicodeRange[] = [
  { start: 0x2300, end: 0x23FF, name: 'Miscellaneous Technical' },
  { start: 0x2440, end: 0x245F, name: 'Optical Character Recognition' },
  { start: 0x2500, end: 0x257F, name: 'Box Drawing' },
  { start: 0x2580, end: 0x259F, name: 'Block Elements' },
  { start: 0x25A0, end: 0x25FF, name: 'Geometric Shapes' },
  { start: 0x2800, end: 0x28FF, name: 'Braille Patterns' },
  { start: 0x1FB00, end: 0x1FBFF, name: 'Symbols for Legacy Computing' },
]

export function isFixedWidth(codePoint: number): boolean {
  for (const range of FIXED_WIDTH_RANGES) {
    if (codePoint >= range.start && codePoint <= range.end) return true
  }
  return false
}
