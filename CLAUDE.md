# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build

- `npm run build` — TypeScript check + Vite production build
- `npm run dev` — Dev server with HMR
- `npm run convert` — CLI font converter (`tsx src/cli.ts convert`)
- Any code change is NOT complete until `npm run build` passes cleanly with zero errors

## Commits

- Before committing, run `git status` and ensure ALL new/untracked files are staged
- Always `git add` every new file you created during the task

## Stack

- Preact + @preact/signals + TypeScript + Tailwind CSS v4 + Vite
- No test framework currently configured
- Lucide icons (lucide-preact)

## Architecture

### Core data model (`store.ts`)

`FontInstance` is the central type — a reactive bag of signals representing one open font. Key fields: `fontData` (Uint8Array of packed 1bpp bitmap rows), `glyphWidth`/`glyphHeight`, `startChar`, `baseline`, `spacing` (monospace/proportional), `glyphMeta` (per-glyph advance widths for proportional fonts).

Pixel storage is MSBit-first packed rows: `bytesPerRow = ceil(width/8)`, `bytesPerGlyph = height * bytesPerRow`. Use `getBit`/`setBit`/`clearBit` from `bitUtils.ts` — never hand-roll the bit manipulation pattern.

### Font loading pipeline

`fontLoad.ts` (`loadFontFile`) is the unified entry point for all format detection and parsing. It takes a filename + ArrayBuffer and returns `FontConversionData`. The web UI (`AppPane.tsx`) and CLI (`cli.ts`) both use it. Format detection is by file extension, with magic-byte fallbacks for Amiga and BBC formats.

**Openers** (`fntOpener.ts`, `comOpener.ts`) handle ambiguous extensions that map to multiple formats — they detect which actual format and dispatch to the right parser. The `.fnt` opener distinguishes Atari 8-bit / Atari ST GDOS / Windows FNT. The `.com` opener distinguishes CP/M Plus / EGA-VGA Kvitek / PC Magazine TSR.

**Parsers** live in `src/fileFormats/` and return format-specific result types. Writers also live there. Each format pair is `fooParser.ts` / `fooWriter.ts`.

### Font saving pipeline

`fontSave.ts` (`saveFontFile`) takes a format extension + `FontConversionData` and returns bytes. The web UI (`Toolbar.tsx`) converts a `FontInstance` to `FontConversionData` via `fontToConversionData()` before calling it.

### Charsets / codepages (`charsets.ts`)

Each charset maps byte positions (0-255) to Unicode codepoints via an `overrides` record (positions not overridden use identity mapping). The `charset` signal tracks the active codepage. Charsets define a `range` (e.g. `[32, 127]`) that controls which glyph slots are shown/hidden, and an optional `colorSystem` for preview rendering.

### UI structure

- `AppPane.tsx` — Main app pane with file open/new, about dialog, format detection for `.gz`/`.com` multi-font
- `FontPane.tsx` — Glyph grid display for one font, keyboard navigation, selection
- `GlyphEditor.tsx` — Pixel editor for a single glyph
- `PreviewPane.tsx` — Text preview with color system rendering
- `BasePane.tsx` — Draggable/resizable window container shared by all panes
- `Toolbar.tsx` — Save/export dropdown, glyph transforms, source export

### Container formats (`src/containers/`)

LHA archive support for loading fonts from `.lha`/`.lzh` archives (common for Amiga fonts).

### Persistence (`persistence.ts`)

Fonts and window layouts auto-save to localStorage. The active charset persists separately under `ch8ter-charset`.

## Key patterns

- **Format parser template**: Parse binary/text → return `{ fontData, glyphWidth, glyphHeight, startChar, meta?, glyphMeta?, baseline?, populated? }`. Parsers must normalize bitmap data to the internal MSBit-first packed row format.
- **Proportional fonts**: Indicated by `GlyphMeta.dwidth[0]` differing from `glyphWidth`. The `spacing` signal switches rendering mode.
- **`.gz` support**: `AppPane.openFontBuffer` strips `.gz`, decompresses via `DecompressionStream`, then re-dispatches — all formats get gz support automatically.
- **Glyph transforms**: Pure functions in `store.ts` (`flipXBytes`, `shiftUp`, `rotateCWBytes`, etc.) that take bytes + dimensions and return new bytes. Wired through `undoHistory.ts` for undo/redo.

## Format documentation

`docs/formats/` contains detailed specifications for each supported format — consult these when implementing parsers/writers. `todo.md` tracks known bugs and refactoring tasks.
