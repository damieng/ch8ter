import { describe, it, expect } from 'vitest'
import { sampleTexts } from './sampleTexts'

describe('sampleTexts', () => {
  it('has unique item names within each group', () => {
    for (const g of sampleTexts) {
      const names = g.items.map(i => i.name)
      expect(new Set(names).size).toBe(names.length)
    }
  })

  it('keeps the codepage coverage group last so stored previews keep their indices', () => {
    const last = sampleTexts[sampleTexts.length - 1]
    expect(last.group).toBe('Codepage coverage')
    expect(last.items.map(i => i.name)).toEqual([
      'Western European prose',
      'Typography, legal & commerce',
      'Arithmetic & algebra',
      'Geometry & logic',
      'Box drawing',
      'Shading & blocks',
      'Arrows & direction',
      'Cards, games & dingbats',
      'Greek & technical',
    ])
  })

  it('preserves non-ASCII characters in the coverage samples', () => {
    const all = sampleTexts[sampleTexts.length - 1].items.map(i => i.text).join('\n')
    for (const ch of ['Þ', 'œ', '€', '≠', '╬', '▓', '⇥', '♞', 'Ω']) {
      expect(all).toContain(ch)
    }
    // UTF-8 bytes misread as Windows-1252 (e.g. "é" -> "Ã©", "—" -> "â€”")
    expect(all).not.toMatch(/â€|Ã[\u0080-¿]|Â[ -¿]/)
  })
})
