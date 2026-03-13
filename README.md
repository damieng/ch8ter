# Ch8ter

An online bitmap font editor for retro computing character sets. Edit pixel-level glyphs in variable-size fonts, preview text with authentic color palettes, and import/export in multiple formats.

## Features

### Font management

- Open and edit multiple fonts simultaneously in floating, draggable windows
- Variable glyph dimensions from 1×1 up to 32×32 pixels
- Auto-save to browser localStorage with dirty-state tracking
- Monospace and proportional spacing modes

### File formats

- **Load**: `.ch8`, `.bin`, `.udg`, `.com` (CP/M), `.bdf`, `.fzx`, `.fnt` (Atari ST GDOS), `.psf`/`.psfu` (+ `.gz`), `.yaff`, `.draw`, `.png`
- **Save**: `.ch8`, `.udg`, `.bdf`, `.fzx`, `.fnt` (Atari ST GDOS), `.psf`, `.yaff`, `.draw`
- **Export**: `.ttf`, `.woff`, `.ttf` (variable), `.woff` (variable), source code
- BDF and FZX import preserves per-glyph advance widths for proportional rendering
- PNG import with auto-detection of scale, gaps, and borders

### Glyph editing

- Interactive pixel editor opens on glyph click, follows selection, closable
- Adjustable zoom on both the pixel editor and the character grid
- Per-glyph transforms: flip horizontal/vertical, rotate CW/CCW, invert, shift in all directions, center horizontally
- Multi-select glyphs with click, Shift+click range, Ctrl+click toggle
- Quick select by category: all, numbers, uppercase, lowercase, symbols, invert selection
- Batch transforms on entire selections
- Clipboard support: copy/paste/cut glyph data as ASCII art
- Undo/redo with up to 100 steps per font (Ctrl+Z / Ctrl+Y)

### Font-wide transforms

- Generate **bold** variant (pixel expansion)
- Generate **outline** variant (border detection)
- Generate **oblique** variant with adjustable shear angle
- Generate **proportional** variant: shifts each glyph to the pixel edge and sets per-character advance widths
- Generate **monospace** variant from a proportional font: choose target width and pixel alignment (left/center/right)
- Resize all glyphs with configurable anchor (top/center/bottom, left/center/right)
- Copy character ranges (e.g. uppercase to lowercase)

### Proportional spacing

- Per-glyph advance widths loaded from BDF, FZX, and Atari ST GDOS fonts
- Drag the green advance-width guide in the glyph editor to adjust a character's width
- Unicode fixed-width ranges (box drawing, block elements, etc.) always render at full cell width
- Proportional and monospace preview rendering

### Text preview

- Live text preview windows with custom or sample text
- Automatic proportional or monospace rendering based on font spacing mode
- 50+ built-in sample texts: pangrams, character sets, classic game text, code samples (BASIC, C, Pascal, Z80 assembly), literature excerpts
- Adjustable zoom (1×–20×) and line height

### Character sets & color palettes

- **Character sets**: ASCII, Amiga (ISO-8859-1), Amstrad CPC, Amstrad CP/M Plus, Atari 8-bit, Atari ST, BBC Micro, Commodore 64, DOS (CP437), DOS (CP850), MSX International, SAM Coupé, ZX Spectrum, Imported (BDF/PSF codepoints)
- **Color palettes**: Acorn BBC Micro, Amstrad CPC, Apple II, Atari 8-bit, Commodore 64, Commodore Plus/4, Commodore VIC-20, MSX (TMS9918), Nintendo NES, SEGA Master System, SAM Coupé, Sinclair QL, ZX Spectrum, Custom

### Keyboard shortcuts

| Key | Action |
|-----|--------|
| Ctrl+A | Select all glyphs |
| Ctrl+Z | Undo |
| Ctrl+Y | Redo |
| Ctrl+C | Copy glyph as ASCII art |
| Ctrl+V | Paste glyph from ASCII art |
| Ctrl+X | Cut glyph |
| Ctrl+Arrow | Navigate between glyphs in the grid |
| Arrow keys | Shift active glyph pixels in that direction |
| Delete | Clear active glyph |
| Any character | Jump to that glyph in the grid |

## Getting Started

```sh
npm install
npm run dev
```

## Tech Stack

Vite + Preact + @preact/signals + TypeScript + Tailwind CSS + Lucide icons

Claude Code was used extensively in the creation of this tool.

## License

MIT
