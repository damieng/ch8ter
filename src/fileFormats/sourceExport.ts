import type { FontInstance } from '../store'
import { bytesPerGlyph, glyphCount } from '../store'

export type SourceFormat = 'c' | 'csharp' | 'rust' | 'ts' | 'basic' | 'z80' | '6502' | '68000' | 'x86'

export const SOURCE_FORMATS: { id: SourceFormat; label: string; ext: string }[] = [
  { id: 'c',      label: 'C Header',   ext: '.h'        },
  { id: 'csharp', label: 'C#',         ext: '.cs'       },
  { id: 'rust',   label: 'Rust',       ext: '.rs'       },
  { id: 'ts',     label: 'TypeScript', ext: '.ts'       },
  { id: 'basic',  label: 'BASIC',      ext: '.bas'      },
  { id: 'z80',    label: 'Z80',        ext: '.z80.asm'  },
  { id: '6502',   label: '6502',       ext: '.6502.asm' },
  { id: '68000',  label: '68000',      ext: '.68000.asm'},
  { id: 'x86',    label: 'x86',        ext: '.x86.asm'  },
]

function toIdentifier(filename: string): string {
  return filename
    .replace(/\.[a-zA-Z0-9]+$/i, '')
    .replace(/[^a-zA-Z0-9]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .toUpperCase()
}

function charComment(code: number): string {
  if (code === 32) return ' '
  if (code > 32 && code <= 126) return String.fromCharCode(code)
  return `0x${code.toString(16).toUpperCase().padStart(2, '0')}`
}

function hex2(v: number): string {
  return v.toString(16).padStart(2, '0')
}

export function exportSource(font: FontInstance, format: SourceFormat): string {
  const data = font.fontData.value
  const startChar = font.startChar.value
  const bpg = bytesPerGlyph(font)
  const count = glyphCount(font)
  const name = toIdentifier(font.fileName.value)
  const filename = font.fileName.value
  const lines: string[] = []

  if (format === 'c') {
    lines.push(`// ${filename}`)
    lines.push(`#ifndef FONT_${name}_H_`)
    lines.push(`#define FONT_${name}_H_`)
    lines.push(``)
    lines.push(`#include <stdint.h>`)
    lines.push(``)
    lines.push(`static const uint8_t FONT_${name}_BITMAP[] = {`)
    for (let g = 0; g < count; g++) {
      const bytes = Array.from(data.subarray(g * bpg, (g + 1) * bpg))
      const hex = bytes.map(b => `0x${hex2(b)}`).join(', ')
      lines.push(`\t${hex}, // ${charComment(startChar + g)}`)
    }
    lines.push(`};`)
    lines.push(``)
    lines.push(`#endif // FONT_${name}_H_`)

  } else if (format === 'csharp') {
    lines.push(`// ${filename}`)
    lines.push(`public static readonly byte[] Font${name.replace(/_/g, '')}Bitmap = [`)
    for (let g = 0; g < count; g++) {
      const bytes = Array.from(data.subarray(g * bpg, (g + 1) * bpg))
      const hex = bytes.map(b => `0x${hex2(b)}`).join(', ')
      lines.push(`\t${hex}, // ${charComment(startChar + g)}`)
    }
    lines.push(`];`)

  } else if (format === 'rust') {
    lines.push(`// ${filename}`)
    lines.push(`pub const FONT_${name}_BITMAP: &[u8] = &[`)
    for (let g = 0; g < count; g++) {
      const bytes = Array.from(data.subarray(g * bpg, (g + 1) * bpg))
      const hex = bytes.map(b => `0x${hex2(b)}`).join(', ')
      lines.push(`\t${hex}, // ${charComment(startChar + g)}`)
    }
    lines.push(`];`)

  } else if (format === 'ts') {
    lines.push(`// ${filename}`)
    lines.push(`export const FONT_${name}_BITMAP: Uint8Array = new Uint8Array([`)
    for (let g = 0; g < count; g++) {
      const bytes = Array.from(data.subarray(g * bpg, (g + 1) * bpg))
      const hex = bytes.map(b => `0x${hex2(b)}`).join(', ')
      lines.push(`\t${hex}, // ${charComment(startChar + g)}`)
    }
    lines.push(`]);`)

  } else if (format === 'basic') {
    for (let g = 0; g < count; g++) {
      const bytes = Array.from(data.subarray(g * bpg, (g + 1) * bpg))
      const vals = bytes.join(',')
      const lineNum = 1000 + g * 10
      lines.push(`${lineNum} DATA ${vals}`)
    }

  } else if (format === 'z80') {
    lines.push(`\t; ${filename}`)
    for (let g = 0; g < count; g++) {
      const bytes = Array.from(data.subarray(g * bpg, (g + 1) * bpg))
      const vals = bytes.map(b => `&${hex2(b)}`).join(',')
      lines.push(`\tdefb ${vals} ; ${charComment(startChar + g)}`)
    }

  } else if (format === '6502') {
    lines.push(`\t; ${filename}`)
    for (let g = 0; g < count; g++) {
      const bytes = Array.from(data.subarray(g * bpg, (g + 1) * bpg))
      const vals = bytes.map(b => `$${hex2(b)}`).join(',')
      lines.push(`\t.byte ${vals} ; ${charComment(startChar + g)}`)
    }

  } else if (format === '68000') {
    lines.push(`\t; ${filename}`)
    for (let g = 0; g < count; g++) {
      const bytes = Array.from(data.subarray(g * bpg, (g + 1) * bpg))
      const vals = bytes.map(b => `$${hex2(b)}`).join(',')
      lines.push(`\tDC.B ${vals} ; ${charComment(startChar + g)}`)
    }

  } else if (format === 'x86') {
    // MASM/TASM style: 0FFh (leading zero if first digit is A-F)
    lines.push(`\t; ${filename}`)
    for (let g = 0; g < count; g++) {
      const bytes = Array.from(data.subarray(g * bpg, (g + 1) * bpg))
      const vals = bytes.map(b => `0x${hex2(b)}`).join(',')
      lines.push(`\tdb\t${vals} ; ${charComment(startChar + g)}`)
    }
  }

  return lines.join('\n')
}
