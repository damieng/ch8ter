# Ch8ter

An online bitmap font editor for retro computing character sets. Edit pixel-level glyphs in variable-size fonts, preview text with authentic color palettes, and import/export across 25+ formats.

Try it now at https://damieng.github.io/ch8ter/

## Features

### Font management

- Open and edit multiple fonts simultaneously in floating, draggable windows
- Variable glyph dimensions from 1x1 up to 32x32 pixels
- Auto-save to browser localStorage with dirty-state tracking
- Project export/import: save all open fonts, containers, previews and layout as one JSON file
- Warns before closing the browser with unsaved fonts
- Light and dark UI themes
- Monospace and proportional spacing modes

### File formats

**Load** (auto-detected from extension and content):

| Format | Extension | Notes |
|--------|-----------|-------|
| Ch8 | `.ch8` | Configurable dimensions, default 8x8 |
| X11 BDF | `.bdf` | Preserves metrics, proportional spacing, charset |
| X11 PCF | `.pcf` | Preserves metrics, proportional spacing, charset |
| Linux PSF | `.psf`, `.psfu` | Unicode map layout support |
| Yaff | `.yaff` | |
| Acorn Draw | `.draw` | |
| ZX Spectrum FZX | `.fzx` | Proportional spacing |
| ZX Spectrum TAP | `.tap` | Extracts font-sized CODE blocks; multi-font opens as container |
| AngelCode BMFont | `.fnt` + `.png` | Text descriptor format; drop descriptor and page PNGs together |
| Atari ST GDOS / Atari 8-bit / Windows FNT | `.fnt` | Source auto-detected |
| Windows FON | `.fon` | NE container; each FNT resource opens as a container entry |
| DOS codepage | `.cpi`, `.cpx` | FONT, FONT.NT and DRFONT variants; opens as container |
| TTF/OTF embedded bitmaps | `.ttf`, `.otf` | EBLC/EBDT/EBSC strikes; multi-strike opens as container |
| PalmOS | `.pdb` | Proportional spacing |
| CP/M Plus / EGA/VGA | `.com` | Source auto-detected; multi-font support |
| BBC Micro | `.bbc` | Also detected by magic bytes |
| Commodore 64 | `.64c` | |
| C64 GEOS | `.cvt` | One point size per VLIR record; opens as container |
| C64 GEOS | `.cvt` | One point size per VLIR record; opens as container |
| Amiga hunk | _(any)_ | Detected by magic bytes |
| PNG tile sheet | `.png` | Auto-detection of scale, gaps, borders |
| Gzip-compressed | `.gz` | Transparent decompression of any format |

**Save**:

| Format | Extension |
|--------|-----------|
| Ch8 | `.ch8` |
| X11 BDF | `.bdf` |
| X11 PCF | `.pcf` |
| Linux PSF | `.psf` | |
| Linux PSF1 | `.psf` | Legacy 256-character variant |
| Yaff | `.yaff` |
| Acorn Draw | `.draw` |
| ZX Spectrum FZX | `.fzx` |
| Atari ST GDOS | `.fnt` |
| Windows FNT v2/v3 | `.fnt` |
| Atari 8-bit | `.fnt` |
| PalmOS | `.pdb` |
| Amiga | `.lha` | Archive with `.font` index + hunk font in `Fonts/<name>/` |
| EGA/VGA | `.com` |
| CP/M Plus | `.com` |
| Commodore 64 | `.64c` |
| ZX Spectrum TAP | `.tap` |
| DOS codepage | `.cpi` |
| Windows FON | `.fon` |
| C64 GEOS | `.cvt` |
| AngelCode BMFont | `.fnt` + `_0.png` |
| BBC Micro | `.bbc` |

**Export**:

| Format | Extension |
|--------|-----------|
| TrueType | `.ttf` |
| WOFF | `.woff` |
| TrueType (variable) | `.ttf` |
| WOFF (variable) | `.woff` |
| PNG tile sheet | `.png` |
| Source code | `.h`, `.cs`, `.rs`, `.ts`, `.bas`, `.z80.asm`, `.6502.asm`, `.68000.asm`, `.x86.asm` |

### Glyph editing

- Interactive pixel editor opens on glyph click, follows selection, closable
- Drawing tools: pencil, line, rectangle, ellipse and flood fill (Shift fills shapes)
- Adjustable zoom on both the pixel editor and the character grid
- Per-glyph transforms: flip horizontal/vertical, rotate CW/CCW, invert, shift in all directions, center horizontally
- Multi-select glyphs with click, Shift+click range, Ctrl+click toggle
- Quick select by category: all, numbers, uppercase, lowercase, symbols, invert selection
- Batch transforms on entire selections
- Clipboard support: copy/paste/cut glyph data as ASCII art
- Undo/redo with up to 100 steps per font (Ctrl+Z / Ctrl+Y) plus a browsable undo history
- Metric guidelines in the editor: baseline, ascender, cap height, x-height, numeric height, descender
- Compare any two open fonts glyph-by-glyph with difference highlighting

### Font-wide transforms

- Generate **bold** variant (pixel expansion)
- Generate **outline** variant (border detection)
- Generate **oblique** variant with adjustable shear angle
- Generate **proportional** variant: shifts each glyph to the pixel edge and sets per-character advance widths
- Generate **monospace** variant from a proportional font: choose target width and pixel alignment (left/center/right)
- Resize all glyphs with configurable anchor (top/center/bottom, left/center/right)
- Copy character ranges (e.g. uppercase to lowercase)

### Proportional spacing

- Per-glyph advance widths loaded from BDF, FZX, PCF, PDB, Amiga, GEOS, BMFont, and Atari ST GDOS fonts
- Drag the green advance-width guide in the glyph editor to adjust a character's width
- Set or offset advances for the whole selection in one undoable step
- Unicode fixed-width ranges (box drawing, block elements, etc.) always render at full cell width
- Proportional and monospace preview rendering

### Text preview

- Live text preview windows with custom or sample text
- Automatic proportional or monospace rendering based on font spacing mode
- Export the current preview as a PNG image
- 50+ built-in sample texts: pangrams, character sets, classic game text, code samples (BASIC, C, Pascal, Z80 assembly, 6502 assembly), literature excerpts
- Adjustable zoom and line height
- Text selection and cursor with click, drag, double-click word select, triple-click select all

### Character sets & color palettes

**Character sets**: ASCII, Amiga (ISO-8859-1), Amstrad CPC, Amstrad CP/M Plus, Atari 8-bit, Atari ST, BBC Micro, Commodore 64, DOS (CP437), DOS (CP850), ISO 8859-1 through 8859-16, MSX International, PalmOS 3.3, SAM Coupe, Windows-1252, ZX Spectrum

**Color palettes**: Acorn BBC Micro, Amstrad CPC, Apple II, Atari 8-bit, Commodore 64, Commodore Plus/4, Commodore VIC-20, MSX (TMS9918), Nintendo NES, SEGA Master System, SAM Coupe, Sinclair QL, ZX Spectrum, Custom

### PNG import & export

**Import**: auto-detection of glyph dimensions, scale factor, gap and border sizes with live grid overlay preview; optional "map to text" field to assign cells to specific characters (screenshot → font)

**Export**: configurable scale, column count, gap/border sizes, foreground/background colors, transparent background, division and border colors

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

## CLI

Batch convert fonts from the command line:

```sh
ch8ter convert <input-file> <format> [output-file] [options]
```

Output formats: `ch8`, `bdf`, `psf`, `yaff`, `draw`, `fzx`, `gdos`, `windows`, `pcf`, `pdb`, `atari8`, `amiga`, `ega`, `bbc`, `cpm`, `cpi`, `fon`, `geos`

Options: `--width`, `--height`, `--start-char`, `--name`, `--baseline`

Input format is auto-detected. Gzip-compressed inputs (`.gz`) are decompressed transparently.

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
