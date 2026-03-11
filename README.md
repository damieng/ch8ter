# Ch8ter

An online bitmap font editor for retro computing character sets. Edit pixel-level glyphs in variable-size fonts, preview text with authentic color palettes, and import/export in multiple formats.

## Features

### Font management

- Create new fonts from scratch or from 10 built-in templates (ZX Spectrum, BBC Micro, C64, Atari 8-bit, Amstrad CPC, IBM CGA, MSX, Amiga Topaz v1/v2, SAM Coupe)
- Open and edit multiple fonts simultaneously in floating, draggable windows
- Variable glyph dimensions from 1x1 up to 32x32 pixels
- Auto-save to browser localStorage with dirty-state tracking

### File formats

- **Load**: `.ch8`, `.bin`, `.udg`, `.com` (CP/M), `.bdf`, `.psf`/`.psfu` (+ `.gz`), `.yaff`, `.draw`, `.png`
- **Save**: `.ch8`, `.udg`, `.bdf`, `.psf`, `.yaff`, `.draw`
- **Export**: `.ttf`, `.woff`, `.ttf` (variable), `.woff` (variable)
- BDF import preserves font metadata and per-glyph Unicode encodings
- PNG import with auto-detection of scale, gaps, and borders

### Glyph editing

- Interactive pixel editor with click-to-toggle and drag painting
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
- Resize all glyphs with configurable anchor (top/center/bottom, left/center/right)
- Copy character ranges (e.g. uppercase to lowercase)

### Text preview

- Live text preview windows with custom or sample text
- Fixed-width and proportional rendering modes
- 50+ built-in sample texts: pangrams, character sets, classic game text, code samples (BASIC, C, Pascal, Z80 assembly), literature excerpts
- Adjustable zoom (1x-20x) and line height

### Character sets & color palettes

- 12 character set mappings: ASCII, ZX Spectrum, BBC Micro, C64, Atari (ATASCII), Amstrad CPC, Amstrad CP/M Plus, IBM CGA, MSX, Amiga (ISO-8859-1), SAM Coupe
- "Imported" charset using per-glyph Unicode codepoints from BDF/PSF files
- 14 authentic color palettes: ZX Spectrum, BBC Micro, C64, VIC-20, Amstrad CPC, Apple II, Atari (NTSC/PAL), Sinclair QL, IBM CGA, MSX (TMS9918), SAM Coupe, plus custom colors

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
