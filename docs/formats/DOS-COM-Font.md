# DOS .COM Font Loader Format (PC Magazine Style)

DOS font loaders are terminate-and-stay-resident (TSR) programs distributed as `.COM` files that replace the BIOS text-mode character generator fonts using INT 10h function 11h. They were popularized by Michael J. Mefford's font utilities in *PC Magazine* during the late 1980s and early 1990s.

These are **executable programs**, not raw font data files. The font bitmaps are embedded within the program at specific offsets.

## Overview

- **File extension**: `.COM`
- **Glyph dimensions**: 8 pixels wide, 8/14/16 pixels tall (matching VGA text mode heights)
- **Character count**: 256 (full IBM PC character set)
- **Encoding**: CP437 (IBM PC code page)
- **Byte order**: N/A (single-byte-per-row bitmaps)
- **Bit order**: MSBit-first (bit 7 = leftmost pixel)

## File Variants

### Multi-height (8291 bytes typical)

Contains all three standard VGA font heights packed together:

```
[0x0000]  JMP instruction + header (variable, ~99 bytes)
            - JMP short past header
            - "PC Magazine" credit string
            - Author name
            - Font count and parameter bytes
            - TSR code (INT 10h calls)
[varies]  16px font data (256 × 16 = 4096 bytes)
[varies]  14px font data (256 × 14 = 3584 bytes)  -- or --
[varies]  8px font data  (256 × 8  = 2048 bytes)
```

The 16px font is typically loaded first and positioned immediately after the TSR code. The TSR uses INT 10h function 1110h (Load User-Specified Pattern) to install the fonts.

### Single-height (~2100-2700 bytes)

Contains only the 8×8 font:

```
[0x0000]  TSR code (~178 bytes)
[0x00B2]  8px font data (256 × 8 = 2048 bytes)
[varies]  Trailing data/padding
```

### PKLITE Compressed

Some `.COM` font loaders are compressed with PKLITE. These can be identified by the `PKLITE Copr.` string near offset 0x30. The font data is not directly accessible without decompression. Compressed files should be skipped or decompressed externally.

## Header

The header structure is not formally standardized but follows a common pattern in the *PC Magazine* utilities:

| Offset | Content |
|--------|---------|
| 0      | JMP instruction (`0xEB xx` short jump or `0xE9 xxxx` near jump) |
| 3      | Credit/title string (null or `$`-terminated), typically "PC Magazine" |
| varies | Author name (e.g., "Michael J. Mefford") |
| varies | `0x1A` (CP/M EOF marker, stops `TYPE` command from showing binary) |
| varies | Parameter bytes (font count, video mode info) |
| varies | TSR code |

## Font Bitmap Data

Each font is a contiguous block of `256 × height` bytes. Characters are stored sequentially from 0x00 to 0xFF. Each character consists of `height` bytes, one per row, top to bottom.

Within each byte, bit 7 is the leftmost pixel (MSBit-first):

```
Bit:    7  6  5  4  3  2  1  0
Pixel:  0  1  2  3  4  5  6  7
```

This is identical to the VGA character generator ROM format and matches the internal format used by INT 10h function 11h.

## Detection Strategy

To identify a `.COM` file as a PC Magazine-style font loader:

1. **Size check**: Multi-height files are typically 8291 bytes. Single-height files are ~2100-2700 bytes.
2. **String search**: Look for `"PC Magazine"` or `"PC  \r\nMagazine"` (with embedded CR/LF) in the first 512 bytes.
3. **PKLITE check**: If `"PKLITE"` is found, the file is compressed and cannot be parsed without decompression.

## Font Location Strategy

Since fonts are embedded at varying offsets within executable code, locate them by scanning:

1. For each candidate height (16, 14, 8):
   - Scan the file for a block where character 0x20 (space) is all zeros and character 0x41 ('A') has a plausible number of set pixels.
   - Verify with additional characters (e.g., 0x42 'B', 0x30 '0').
2. The 16px font is usually found first (lowest offset after the header).
3. Prefer the tallest font found, as it has the most detail.

## INT 10h Font Loading

The TSR code uses BIOS INT 10h to install the fonts:

```
AX = 1110h    ; Load User-Specified Pattern
BH = height   ; Bytes per character (8, 14, or 16)
BL = 0        ; Character generator block
CX = 0100h    ; Number of characters (256)
DX = 0000h    ; First character to load
ES:BP         ; Pointer to font bitmap data
INT 10h
```

The program typically:
1. Checks/sets the video mode
2. Loads the appropriate font height for the current mode
3. Terminates and stays resident (or exits)

## Codepage

All characters use **CP437** (IBM PC/DOS code page), which includes box-drawing characters (0x80-0xDF), mathematical symbols, and accented Latin characters. This is the standard character set for IBM PC text mode.

## Limitations

- Width is always 8 pixels (VGA text mode constraint)
- No metadata beyond what can be extracted from embedded strings
- PKLITE-compressed files cannot be parsed without decompression
- Font offsets vary between programs — heuristic scanning is required
- Some programs contain only a subset of heights
- The embedded code makes these files larger than raw font data

## Known Programs

| Program | Size | Heights | Author |
|---------|------|---------|--------|
| BOLDPLOT.COM | 8291 | 8, 14, 16 | Michael J. Mefford |
| DIDDY.COM | 8291 | 8, 14, 16 | Michael J. Mefford |
| FUTUREX.COM | 8291 | 8, 14, 16 | Michael J. Mefford |
| MEGABOLD.COM | 8291 | 8, 14, 16 | Michael J. Mefford |
| OCRSTYLE.COM | 8291 | 8, 14, 16 | Michael J. Mefford |
| SHOWTIME.COM | 8291 | 8, 14, 16 | Michael J. Mefford |
| PLOTTER.COM | 2669 | 8 (compressed) | Michael J. Mefford |
| SCRIPT.COM | 2667 | 8 | Michael J. Mefford |
| SMART.COM | 2138 | 8 | Michael J. Mefford |

## References

- *PC Magazine* DOS utilities collection
- IBM VGA BIOS INT 10h documentation (function 11h — Character Generator)
- Ralph Brown's Interrupt List — INT 10h/AX=1110h
