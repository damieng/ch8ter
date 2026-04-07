# Changelog

## 0.9.8 — 2026-04-07

- Fixed rotation of non-square glyphs (e.g. 8×16) — now correctly swaps width and height
- Fixed corrupt output when exporting FZX fonts that are too large
- Fixed garbled last glyph when importing TTF embedded bitmaps (sbit)
- Fixed potential crash when loading `.64c` fonts
- Fixed incorrect glyph labels for non-Latin charsets (e.g. ISO-8859-5 Cyrillic)
- Fixed CP/M export silently producing corrupt output for fonts wider than 8px (now shows an error)
- Fixed FZX import reading garbage for entries with zero offset
- Fixed proportional font advance width being lost when editing glyphs with no prior metadata
- Fixed PCF export creating unnecessarily large files for fonts with gaps in the encoding range
- Fixed crash when opening BDF/PSF files with extremely sparse encoding ranges
- Added test suite
