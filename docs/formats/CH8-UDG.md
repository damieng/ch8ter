# CH8 / UDG / BIN Raw Bitmap Font Format

The simplest possible bitmap font format — raw sequential glyph pixel data with no header or metadata.

## Format

The file is a flat byte array of glyph bitmaps concatenated end-to-end. There is no header, no character table, no metadata of any kind.

### Pixel Layout

Each glyph is stored row-by-row, top to bottom:

- **1 byte per row** (8 pixels wide, MSB = leftmost pixel)
- **N rows per glyph** (determined by file size / glyph count)
- Glyphs are concatenated sequentially

### Determining Dimensions

Since there is no header, the glyph dimensions must be inferred:

- **Width**: Always 8 pixels (1 byte per row)
- **Height**: `fileSize / glyphCount / 1` — the height depends on knowing how many glyphs are in the file
- For **.ch8 files**: Typically 96 glyphs (ASCII 32-127), 8×8 pixels, so 768 bytes
- For **.udg files**: Typically 21 glyphs (UDG A-U), 8×8 pixels, so 168 bytes

### Character Range

| Format | Typical Start | Typical Count | Typical Size |
|--------|--------------|---------------|--------------|
| .ch8   | 32 (space)   | 96            | 768 bytes    |
| .udg   | 0            | 21            | 168 bytes    |
| .bin   | 32 (space)   | 96            | 768 bytes    |

## Example

An 8×8 exclamation mark glyph (`!`) stored as 8 bytes:

```
Byte  Binary     Pixels
0x18  00011000   ...##...
0x18  00011000   ...##...
0x18  00011000   ...##...
0x18  00011000   ...##...
0x18  00011000   ...##...
0x00  00000000   ........
0x18  00011000   ...##...
0x00  00000000   ........
```

A file containing just space (all zeros) and `!` would be 16 bytes:

```
00 00 00 00 00 00 00 00  (space)
18 18 18 18 18 00 18 00  (!)
```

## Platform Context

- **.ch8**: ZX Spectrum character set files (8×8, 96 chars from space to ©)
- **.udg**: ZX Spectrum User Defined Graphics (8×8, 21 characters A-U)
- **.bin**: Generic raw font binary, same layout

## Limitations

- Fixed 8-pixel width (1 byte per row)
- No metadata, font name, or dimensions stored in file
- No proportional width support
- Character range must be assumed from context/file extension
