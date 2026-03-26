# Windows FNT Bitmap Font Format

The Windows FNT format is the native bitmap font format for Microsoft Windows (2.x through 3.x). FNT resources can appear as standalone `.fnt` files or bundled inside `.fon` files (which are NE or PE executables containing one or more FNT resources). All multi-byte integers are **little-endian**.

There are three versions: v1 (Windows 1.x, rare), v2 (Windows 2.x), and v3 (Windows 3.x+). This document covers v2 and v3.

## .fon Container

A `.fon` file is a 16-bit NE (New Executable) or 32-bit PE (Portable Executable) containing FNT resources. To extract the FNT data:

### NE Format

1. Read the DOS MZ header. The `e_lfanew` field at offset 0x3C (UInt32LE) points to the NE header.
2. At the NE header, read `ne_rsrctab` (offset 0x24, UInt16LE) — the offset from the NE header to the resource table.
3. The resource table starts with `rscAlignShift` (UInt16LE) — the alignment shift count. Resource data offsets are left-shifted by this value.
4. Walk the resource type blocks. Each block starts with a type ID (UInt16LE):
   - If the high bit is set, the low 15 bits are a predefined type. Font resources are type `0x8008` (RT_FONT).
   - If the type ID is 0, the resource table is finished.
5. After the type ID, read `count` (UInt16LE) and skip 4 bytes (reserved). Then read `count` resource entries, each 12 bytes:
   - `offset` (UInt16LE) — left-shift by `rscAlignShift` to get the absolute file offset
   - `length` (UInt16LE) — left-shift by `rscAlignShift` to get the byte length
   - Skip 8 bytes (flags, name, handle)
6. Each resource at the computed offset contains a complete FNT structure.

### PE Format

1. Read the DOS MZ header. `e_lfanew` at offset 0x3C points to the PE signature (`"PE\0\0"`).
2. Parse the COFF header and optional header to locate the resource directory (data directory entry index 2).
3. Walk the resource directory tree to find `RT_FONT` (type 8) resources.
4. Each resource data entry gives the RVA and size of a FNT structure.

## FNT Header

The header size depends on the version:
- **v2**: 118 bytes
- **v3**: 148 bytes

Read `dfVersion` at offset 0 to determine which layout to use.

### Common Fields (v2 and v3)

| Offset | Size | Type   | Field            | Notes |
|--------|------|--------|------------------|-------|
| 0      | 2    | UInt16 | dfVersion        | 0x0200 (v2) or 0x0300 (v3) |
| 2      | 4    | UInt32 | dfSize           | Total file size in bytes |
| 6      | 60   | char[] | dfCopyright      | Copyright string, null-padded |
| 66     | 2    | UInt16 | dfType           | Bit 0: 1 = vector, 0 = raster. Must be 0 for bitmap fonts. |
| 68     | 2    | UInt16 | dfPoints         | Nominal point size |
| 70     | 2    | UInt16 | dfVertRes        | Vertical resolution (DPI) the font was designed for |
| 72     | 2    | UInt16 | dfHorizRes       | Horizontal resolution (DPI) |
| 74     | 2    | UInt16 | dfAscent         | Ascent in pixels (baseline to top of cell) |
| 76     | 2    | UInt16 | dfInternalLeading| Internal leading included in dfAscent |
| 78     | 2    | UInt16 | dfExternalLeading| Suggested external leading |
| 80     | 1    | UInt8  | dfItalic         | Non-zero = italic |
| 81     | 1    | UInt8  | dfUnderline      | Non-zero = underline |
| 82     | 1    | UInt8  | dfStrikeOut      | Non-zero = strikeout |
| 83     | 2    | UInt16 | dfWeight         | Weight (400 = normal, 700 = bold) |
| 85     | 1    | UInt8  | dfCharSet        | Character set identifier (see below) |
| 86     | 2    | UInt16 | dfPixWidth       | Width for fixed-pitch fonts (0 = proportional) |
| 88     | 2    | UInt16 | dfPixHeight      | Character cell height in pixels |
| 90     | 1    | UInt8  | dfPitchAndFamily | Bits 0-3: pitch, bits 4-7: family |
| 91     | 2    | UInt16 | dfAvgWidth       | Average character width |
| 93     | 2    | UInt16 | dfMaxWidth       | Maximum character width |
| 95     | 1    | UInt8  | dfFirstChar      | First defined character code |
| 96     | 1    | UInt8  | dfLastChar       | Last defined character code |
| 97     | 1    | UInt8  | dfDefaultChar    | Default character (relative to dfFirstChar) |
| 98     | 1    | UInt8  | dfBreakChar      | Word-break character (relative to dfFirstChar) |
| 99     | 2    | UInt16 | dfWidthBytes     | Bytes per row of the bitmap (for fixed-pitch fonts) |
| 101    | 4    | UInt32 | dfDevice         | Offset to device name string (0 = generic) |
| 105    | 4    | UInt32 | dfFace           | Offset to face name string (null-terminated). **Note:** In v3, this field is at offset 141 (shifted by the 36-byte v3 header extension). |
| 109    | 4    | UInt32 | dfBitsPointer    | Reserved, always 0 on disk |
| 113    | 4    | UInt32 | dfBitsOffset     | Offset to bitmap data from start of file |

### Additional v3 Fields

| Offset | Size | Type   | Field            | Notes |
|--------|------|--------|------------------|-------|
| 117    | 1    | UInt8  | dfReserved       | Reserved |
| 118    | 4    | UInt32 | dfFlags          | Bit flags (see below) |
| 122    | 2    | UInt16 | dfAspace         | Global A space |
| 124    | 2    | UInt16 | dfBspace         | Global B space |
| 126    | 2    | UInt16 | dfCspace         | Global C space |
| 128    | 4    | UInt32 | dfColorPointer   | Offset to color table (0 if none) |
| 132    | 16   | UInt8[]| dfReserved1      | Reserved, all zero |

#### v3 dfFlags

| Bit | Meaning |
|-----|---------|
| 0   | DFF_FIXED — font is fixed-pitch |
| 1   | DFF_PROPORTIONAL — font is proportional |
| 2   | DFF_ABCFIXED — font has ABC fixed widths |
| 3   | DFF_ABCPROPORTIONAL — font has ABC proportional widths |
| 4   | DFF_1COLOR — font is monochrome (standard bitmap) |
| 5   | DFF_16COLOR — font has 16-color bitmaps |
| 6   | DFF_256COLOR — font has 256-color bitmaps |
| 7   | DFF_RGBCOLOR — font has RGB color bitmaps |

### dfCharSet Values

| Value | Character Set |
|-------|---------------|
| 0     | ANSI (Windows-1252) |
| 1     | DEFAULT |
| 2     | SYMBOL |
| 128   | SHIFTJIS (Japanese) |
| 129   | HANGUL (Korean) |
| 134   | GB2312 (Simplified Chinese) |
| 136   | CHINESEBIG5 (Traditional Chinese) |
| 161   | GREEK |
| 162   | TURKISH |
| 177   | HEBREW |
| 178   | ARABIC |
| 186   | BALTIC |
| 204   | RUSSIAN (Windows-1251) |
| 222   | THAI |
| 238   | EASTEUROPE |
| 255   | OEM (system-dependent, often CP437) |

### dfPitchAndFamily

**Low nibble (pitch):**

| Value | Meaning |
|-------|---------|
| 0     | DEFAULT_PITCH |
| 1     | FIXED_PITCH |
| 2     | VARIABLE_PITCH |

**High nibble (family):**

| Value | Meaning |
|-------|---------|
| 0x00  | FF_DONTCARE |
| 0x10  | FF_ROMAN (serif, variable width) |
| 0x20  | FF_SWISS (sans-serif, variable width) |
| 0x30  | FF_MODERN (fixed width) |
| 0x40  | FF_SCRIPT (cursive) |
| 0x50  | FF_DECORATIVE |

## Character Width Table

Immediately follows the header. Contains one entry per character from `dfFirstChar` to `dfLastChar`, plus one sentinel entry. The total number of entries is `dfLastChar - dfFirstChar + 2`.

### v2 Character Entry (4 bytes each)

| Size | Type   | Field   | Notes |
|------|--------|---------|-------|
| 2    | UInt16 | width   | Character width in pixels |
| 2    | UInt16 | offset  | Byte offset from start of file to this character's bitmap data |

### v3 Character Entry (6 bytes each)

| Size | Type   | Field   | Notes |
|------|--------|---------|-------|
| 2    | UInt16 | width   | Character width in pixels |
| 4    | UInt32 | offset  | Byte offset from start of file to this character's bitmap data |

For **fixed-pitch** fonts (`dfPixWidth > 0`), all width values equal `dfPixWidth`, but the table is still present.

## Bitmap Data

The bitmap data starts at `dfBitsOffset`. Each character's data is located at the offset given in its character table entry.

### Storage Format

Bitmaps are stored in **byte-column-major** order with **MSBit-first** bit ordering. This is different from most bitmap font formats: instead of storing each row contiguously, each byte-column is stored as `dfPixHeight` consecutive bytes (one byte per row, top to bottom), and the byte-columns are stored left to right.

For a character of width `w` pixels and height `h` pixels (`h` = `dfPixHeight`):

```
widthBytes = ceil(w / 8)       — number of byte-columns
totalBytes = widthBytes * h    — total bytes for this character
```

The layout in memory is:

```
[byte-col 0, row 0] [byte-col 0, row 1] ... [byte-col 0, row h-1]
[byte-col 1, row 0] [byte-col 1, row 1] ... [byte-col 1, row h-1]
...
[byte-col N, row 0] [byte-col N, row 1] ... [byte-col N, row h-1]
```

Within each byte, bit 0 corresponds to the leftmost pixel of that byte's 8-pixel column, and bit 7 to the rightmost:

```
Bit 0 → leftmost pixel (x = k*8 + 7)  — note: reversed from most formats
Bit 7 → rightmost pixel (x = k*8 + 0)
```

The pixel at column `x` within byte-column `k` is at bit `(7 - (x - k*8))`, i.e., bit position increases right-to-left.

### Reading a Pixel

To read pixel (x, y) for a character whose bitmap starts at file offset `charOffset`:

```
widthBytes = ceil(charWidth / 8)
byteCol = x >> 3                              — which byte-column
byteIndex = charOffset + byteCol * height + y — byte-column-major indexing
bit = x & 7
pixel = (data[byteIndex] >> bit) & 1          — bit 0 = leftmost within column
```

### Fixed-Pitch Layout

For fixed-pitch fonts, all characters have the same width (`dfPixWidth`). In v3, `dfWidthBytes` gives the number of byte-columns per character for the bitmap data.

### Proportional Layout

Each character has its own width from the character width table. The `offset` field in each character entry points to where that character's bitmap data begins. The number of byte-columns is computed from each character's individual width: `ceil(width / 8)`.

## Face Name String

Located at the offset specified by `dfFace`. A null-terminated ASCII string giving the typeface name (e.g., "System", "Courier", "MS Sans Serif").

## File Layout Summary

### Standalone .fnt

```
[0x0000]  FNT Header (118 or 148 bytes)
[header]  Character width table (numChars + 1 entries)
[varies]  Bitmap data
[varies]  Face name string (null-terminated)
[varies]  Device name string (if dfDevice != 0)
```

Where `numChars = dfLastChar - dfFirstChar + 1`.

### .fon container

```
[0x0000]  DOS MZ stub header
[varies]  NE or PE header
[varies]  Resource table / directory
[varies]  FNT resource 1 (complete .fnt structure)
[varies]  FNT resource 2 (complete .fnt structure)
...
```

## Metrics

- **Cell height**: `dfPixHeight` pixels
- **Baseline**: `dfAscent` pixels from the top of the cell
- **Ascent**: `dfAscent` pixels (includes internal leading)
- **Descent**: `dfPixHeight - dfAscent` pixels
- **Internal leading**: `dfInternalLeading` pixels (space above characters within the ascent, for accents)
- **Fixed width**: `dfPixWidth` (0 = proportional; per-character widths in width table)

## Version Detection

Read the first two bytes as UInt16LE:
- `0x0200` → FNT v2 (header is 118 bytes, char entries are 4 bytes)
- `0x0300` → FNT v3 (header is 148 bytes, char entries are 6 bytes)
- `0x0100` → FNT v1 (rarely encountered, not documented here)

To distinguish a standalone `.fnt` from a `.fon` container, check for the DOS MZ signature (`"MZ"` or `"ZM"`) at offset 0.

## Limitations

- Character range limited to single-byte values (0-255)
- No Unicode support — character codes are raw byte values in the font's character set
- Maximum cell height is 65535 pixels (UInt16), but practical fonts rarely exceed 64 pixels
- v2 bitmap offsets are UInt16, limiting file size to 64 KB; v3 uses UInt32
- Color bitmap flags exist in v3 but are rarely used; virtually all FNT fonts are monochrome

## References

- [Microsoft Windows SDK: Font-File Format](https://learn.microsoft.com/en-us/windows/win32/menurc/font-file-format) — Official specification
- [Microsoft PE/COFF Specification](https://learn.microsoft.com/en-us/windows/win32/debug/pe-format) — For .fon PE container parsing
- [Microsoft NE Executable Format](https://wiki.osdev.org/NE) — For .fon NE container parsing
- Simon Tatham's `.fon` documentation — Detailed reverse-engineering notes
