// Glyph selection operations.

import { type FontInstance, glyphCount } from './store'

export function selectGlyph(font: FontInstance, index: number, shift: boolean, ctrl: boolean) {
  const count = glyphCount(font)
  if (index < 0 || index >= count) return

  if (shift) {
    const from = Math.min(font.lastClickedGlyph.value, index)
    const to = Math.max(font.lastClickedGlyph.value, index)
    const next = new Set(font.selectedGlyphs.value)
    for (let i = from; i <= to; i++) next.add(i)
    font.selectedGlyphs.value = next
  } else if (ctrl) {
    const next = new Set(font.selectedGlyphs.value)
    if (next.has(index)) {
      next.delete(index)
      if (next.size === 0) next.add(index)
    } else {
      next.add(index)
    }
    font.selectedGlyphs.value = next
  } else {
    font.selectedGlyphs.value = new Set([index])
  }
  font.lastClickedGlyph.value = index
}

function charRange(font: FontInstance, from: number, to: number): Set<number> {
  const s = font.startChar.value
  const count = glyphCount(font)
  const result = new Set<number>()
  for (let c = from; c <= to; c++) {
    const idx = c - s
    if (idx >= 0 && idx < count) result.add(idx)
  }
  return result
}

export function selectNumbers(font: FontInstance) {
  font.selectedGlyphs.value = charRange(font, 48, 57)
  const first = 48 - font.startChar.value
  if (first >= 0) font.lastClickedGlyph.value = first
}
export function selectUppercase(font: FontInstance) {
  font.selectedGlyphs.value = charRange(font, 65, 90)
  const first = 65 - font.startChar.value
  if (first >= 0) font.lastClickedGlyph.value = first
}
export function selectLowercase(font: FontInstance) {
  font.selectedGlyphs.value = charRange(font, 97, 122)
  const first = 97 - font.startChar.value
  if (first >= 0) font.lastClickedGlyph.value = first
}
export function selectAll(font: FontInstance) {
  const count = glyphCount(font)
  const result = new Set<number>()
  for (let i = 0; i < count; i++) result.add(i)
  font.selectedGlyphs.value = result
  font.lastClickedGlyph.value = 0
}
export function selectNone(font: FontInstance) {
  font.selectedGlyphs.value = new Set([font.lastClickedGlyph.value])
}
export function invertSelection(font: FontInstance) {
  const count = glyphCount(font)
  const current = font.selectedGlyphs.value
  const result = new Set<number>()
  for (let i = 0; i < count; i++) {
    if (!current.has(i)) result.add(i)
  }
  if (result.size === 0) return
  font.selectedGlyphs.value = result
}

export function selectSymbols(font: FontInstance) {
  const s = font.startChar.value
  const count = glyphCount(font)
  const result = new Set<number>()
  for (let i = 0; i < count; i++) {
    const c = s + i
    const isDigit = c >= 48 && c <= 57
    const isUpper = c >= 65 && c <= 90
    const isLower = c >= 97 && c <= 122
    const isSpace = c === 32
    if (!isDigit && !isUpper && !isLower && !isSpace && c >= 33 && c <= 126) {
      result.add(i)
    }
  }
  if (result.size > 0) {
    font.selectedGlyphs.value = result
    font.lastClickedGlyph.value = Math.min(...result)
  }
}
