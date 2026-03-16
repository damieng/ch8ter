# Atari ST GDOS / GEM .fnt Bitmap Font Format

The GDOS .fnt format originated on Digital Research's GEM (Graphics Environment Manager) for the PC and was adopted by the Atari ST. Files may be **big-endian** (native Atari ST / Motorola 68000) or **little-endian** (PC GEM / Intel). The byte order must be auto-detected.

## File Structure

```
[0]                    Header (88 bytes)
[charTablePos]         Character offset table
[fontDataPos]          Font bitmap raster
[end of raster]        (Face name string, if dfFace points here)
```

## Header (88 bytes)

| Offset | Size | Type    | Field          | Notes |
|--------|------|---------|----------------|-------|
| 0      | 2    | UInt16  | faceId         | Font identifier |
| 2      | 2    | UInt16  | faceSize       | Point size |
| 4      | 32   | char[]  | faceName       | Null-padded ASCII |
| 36     | 2    | UInt16  | loChar         | Lowest character index (usually 32) |
| 38     | 2    | UInt16  | hiChar         | Highest character index |
| 40     | 2    | UInt16  | topLine        | Top line distance from baseline |
| 42     | 2    | UInt16  | ascentLine     | Ascent distance from baseline |
| 44     | 2    | UInt16  | halfLine       | Half line distance |
| 46     | 2    | UInt16  | descentLine    | Descent distance from baseline |
| 48     | 2    | UInt16  | bottomLine     | Bottom line distance |
| 50     | 2    | UInt16  | maxCharWidth   | Width of widest character |
| 52     | 2    | UInt16  | maxCellWidth   | Width of widest character cell |
| 54     | 2    | UInt16  | leftOffset     | Left offset |
| 56     | 2    | UInt16  | rightOffset    | Right offset |
| 58     | 2    | UInt16  | thickening     | Thickening size for bold |
| 60     | 2    | UInt16  | underlineSize  | Underline thickness |
| 62     | 2    | UInt16  | lighteningMask | Mask for light style (usually 0x5555) |
| 64     | 2    | UInt16  | skewingMask    | Mask for italic style (usually 0x5555) |
| 66     | 2    | UInt16  | fontFlags      | See flags below |
| 68     | 4    | UInt32  | horizTablePos  | File offset to horizontal offset table |
| 72     | 4    | UInt32  | charTablePos   | File offset to character offset table |
| 76     | 4    | UInt32  | fontDataPos    | File offset to font bitmap raster |
| 80     | 2    | UInt16  | formWidth      | Raster width in bytes per scanline |
| 82     | 2    | UInt16  | formHeight     | Raster height in scanlines (= glyph height) |
| 84     | 4    | UInt32  | nextFontPtr    | Pointer to next font (always 0 on disk) |

### Font Flags (offset 66)

| Bit | Meaning |
|-----|---------|
| 0   | System font |
| 1   | Horizontal offset table present |
| 2   | Font data is big-endian (no byte-swap needed on 68000) |
| 3   | Monospaced font |

## Endianness Detection

The file may be big-endian or little-endian. Auto-detect by reading `formHeight` (offset 82) in both endiannesses — the plausible value (1-128) indicates the correct byte order. If both are plausible, check `fontDataPos` (offset 76) — the valid one points within the file.

All header fields and the character offset table use the detected byte order.

## Character Offset Table

Located at `charTablePos`. Contains `(hiChar - loChar + 2)` UInt16 entries in header byte order.

Each entry gives the **x pixel position** within the font raster where that character's bitmap starts. The pixel width of character `i` is:

```
charWidth = charOffsets[i + 1] - charOffsets[i]
```

The extra entry (numChars + 1) is a sentinel marking the end of the last character.

## Horizontal Offset Table (optional)

If flag bit 1 is set and `horizTablePos > 0`, there is a table of `numChars` Int16 values at `horizTablePos`. Each value is added to the character width to compute the advance width:

```
advanceWidth = charWidth + horizOffset[i]
```

## Font Bitmap Raster

Located at `fontDataPos`. The raster is a single bitmap `formWidth` bytes wide and `formHeight` rows tall, with all characters placed side-by-side horizontally.

- **Row-major**: each row is `formWidth` bytes
- **MSB-first**: bit 7 of each byte is the leftmost pixel
- The byte-swap flag (bit 2) is only relevant for in-memory 68000 WORD access; standard byte access works for both LE and BE files on disk

To read pixel (x, y):
```
byteIndex = fontDataPos + y * formWidth + (x >> 3)
bit = (data[byteIndex] >> (7 - (x & 7))) & 1
```

## Metrics

- **Baseline row**: `topLine - 1` (0-indexed from top of glyph)
- **Ascender**: `ascentLine` pixels above baseline
- **Descender**: `descentLine` pixels below baseline
- **Glyph height**: `formHeight` scanlines

## Example Layout

For a font with loChar=32, hiChar=127, formWidth=120, formHeight=16:

```
Header:          88 bytes
Char table:      (96 + 1) × 2 = 194 bytes at charTablePos
Font raster:     120 × 16 = 1920 bytes at fontDataPos
```

## Limitations

- Maximum character range depends on UInt16 index (0-65535 theoretically, typically 32-255)
- No Unicode support — character indices are raw byte values
- Proportional widths supported via character offset table
- The Atari ST typically uses its own character set (similar to CP437 with differences)

## References

- Atari ST GEM/VDI documentation
- Digital Research GEM Programmer's Guide
