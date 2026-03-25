# CPI (Code Page Information) Font Format

CPI files store bitmap fonts for multiple codepages, used by DOS/Windows `DISPLAY.SYS` and `MODE` commands. Three variants exist: **FONT** (MS-DOS/PC-DOS/Windows 9x), **FONT.NT** (Windows NT+), and **DRFONT** (DR-DOS).

All multi-byte values are **little-endian**.

## References

- https://www.seasip.info/DOS/CPI/cpi.html

## Magic Bytes

| Variant    | Byte 0 | Bytes 1-7   |
|------------|--------|-------------|
| FONT       | `0xFF` | `FONT   `   |
| FONT.NT    | `0xFF` | `FONT.NT`   |
| DRFONT     | `0x7F` | `DRFONT `   |

## FontFileHeader (23 bytes)

| Offset | Size | Field        | Description |
|--------|------|--------------|-------------|
| 0x00   | 1    | id0          | `0xFF` (FONT/FONT.NT) or `0x7F` (DRFONT) |
| 0x01   | 7    | id           | Format string, space-padded |
| 0x08   | 8    | reserved     | Always zero |
| 0x10   | 2    | pnum         | Pointer count (should be 1) |
| 0x12   | 1    | ptyp         | Pointer type (should be 1) |
| 0x13   | 4    | fih_offset   | Offset to FontInfoHeader |

## DRDOSExtendedFontFileHeader (DRFONT only)

Immediately follows FontFileHeader.

| Offset | Size          | Field                  | Description |
|--------|---------------|------------------------|-------------|
| 0x00   | 1             | num_fonts_per_codepage | Font count per codepage (typically 4) |
| 0x01   | N × 1         | font_cellsize[]        | Character height for each font |
| 0x01+N | N × 4         | dfd_offset[]           | File offset to bitmap data for each font |

Total size: `1 + (5 × num_fonts_per_codepage)` bytes.

## FontInfoHeader (2 bytes)

| Offset | Size | Field          | Description |
|--------|------|----------------|-------------|
| 0x00   | 2    | num_codepages  | Number of codepages in file |

## CodePageEntryHeader (28 bytes)

Forms a linked list; first immediately follows FontInfoHeader.

| Offset | Size | Field             | Description |
|--------|------|-------------------|-------------|
| 0x00   | 2    | cpeh_size         | Header size (0x1C; some files use 0x1A) |
| 0x02   | 4    | next_cpeh_offset  | Offset to next header (0 = last entry) |
| 0x06   | 2    | device_type       | 1 = screen, 2 = printer |
| 0x08   | 8    | device_name       | e.g. `"EGA     "`, `"LCD     "` |
| 0x10   | 2    | codepage          | Codepage number (e.g. 437, 850) |
| 0x12   | 6    | reserved          | Always zero |
| 0x18   | 4    | cpih_offset       | Offset to CodePageInfoHeader |

**Offset interpretation:**
- FONT/DRFONT: relative to file start
- FONT.NT: relative to start of this CodePageEntryHeader

## CodePageInfoHeader (6 bytes)

| Offset | Size | Field      | Description |
|--------|------|------------|-------------|
| 0x00   | 2    | version    | 1 = FONT, 2 = DRFONT |
| 0x02   | 2    | num_fonts  | Number of screen fonts (printer = 1) |
| 0x04   | 2    | size       | Remaining bytes for this codepage (FONT) or header size (DRFONT) |

## ScreenFontHeader (6 bytes)

One per font in the codepage.

| Offset | Size | Field     | Description |
|--------|------|-----------|-------------|
| 0x00   | 1    | height    | Character height in pixels |
| 0x01   | 1    | width     | Character width in pixels (typically 8) |
| 0x02   | 2    | reserved  | yaspect/xaspect (unused, 0) |
| 0x04   | 2    | num_chars | Character count (typically 256) |

### Bitmap data (FONT/FONT.NT)

Follows immediately after each ScreenFontHeader:
- Size: `num_chars × height × ceil(width / 8)` bytes
- Sequential character bitmaps in ascending order
- MSBit-first row packing

## DRFONT Character Index Table

Located after all ScreenFontHeaders in each codepage entry:
- 256 × 2-byte (uint16) entries = 512 bytes
- Maps codepage position → character index into shared bitmap tables
- Bitmap location: `dfd_offset[font] + index[char] × height`

## Printer Font Structure

| Offset | Size | Field        | Description |
|--------|------|--------------|-------------|
| 0x00   | 2    | printer_type | 1 = downloaded, 2 = built-in with escapes |
| 0x02   | 2    | escape_len   | Total escape sequence bytes |

Followed by Pascal strings (length-prefixed) for select/deselect sequences, then font data.

## Known Quirks

- LCD.CPI (Toshiba MS-DOS 3.30) sets CodePageInfoHeader version to 0; treat as 1
- Character widths other than 8 may cause issues with various utilities
- CPI files in FONT format should not exceed 64 KB (PC-DOS 3.3 DISPLAY.SYS limit)
- Some early DR-DOS printer CPI files set device_type=1 instead of 2
