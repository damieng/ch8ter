# Ch8ter

A browser-based editor for ZX Spectrum .ch8 bitmap font files (8x8 pixel glyphs, 1 bit per pixel).

## Features

- Load and save .ch8 font files
- Pixel editor with adjustable zoom (400-2000%)
- Full character set grid with zoom (100-1000%)
- Per-glyph transforms: flip X/Y, invert, rotate CW, shift in all directions
- Multi-select glyphs (click, shift+click range, ctrl+click toggle)
- Quick select by category: numbers, uppercase, lowercase, symbols
- Batch transforms on selection via Tools dropdown

## Getting Started

```sh
npm install
npm run dev
```

## Tech Stack

Vite + Preact + TypeScript + Tailwind CSS + Lucide icons

## License

MIT
