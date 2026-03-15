# FZX Proportional Font Format

FZX is a compact proportional bitmap font format designed for the ZX Spectrum. It supports variable-width glyphs with vertical shifting and kerning, packed efficiently for 8-bit systems. **Little-endian** byte order throughout.

## File Structure

```
[0]              Header (3 bytes)
[3]              Character table (numChars × 3 bytes)
[3 + numChars*3] Final offset word (2 bytes)
[...]            Glyph bitmap data (variable length)
```

## Header (3 bytes)

| Offset | Size | Type  | Field    | Notes |
|--------|------|-------|----------|-------|
| 0      | 1    | UInt8 | height   | Glyph cell height in pixels (1-255) |
| 1      | 1    | Int8  | tracking | Extra pixels added to each character's advance width |
| 2      | 1    | UInt8 | lastChar | Last character code in font (first is always 32) |

Character range is always **32 to lastChar** inclusive. Number of characters = `lastChar - 32 + 1`.

## Character Table

`(lastChar - 32 + 1)` entries, each 3 bytes:

| Offset | Size | Type   | Field        | Notes |
|--------|------|--------|--------------|-------|
| 0      | 2    | UInt16 | offset+kern  | Bits 0-13: offset to bitmap data; bits 14-15: kern (0-3 pixels) |
| 2      | 1    | UInt8  | shift_width  | High nibble: vertical shift (0-15); low nibble: width - 1 (0-15, so width 1-16) |

### Offset Field (16-bit LE)

```
Bit 15-14: kern (0-3 pixels of left spacing before the glyph)
Bit 13-0:  offset RELATIVE TO THE POSITION OF THIS OFFSET WORD
```

The offset is **not** relative to the start of the file — it is relative to the byte position of the offset word itself. To compute the absolute file position:

```
absoluteDataPos = entryBytePosition + (rawOffset & 0x3FFF)
```

### Shift and Width Byte

```
Bits 7-4: shift (number of blank pixel rows at top before glyph starts)
Bits 3-0: width - 1 (actual pixel width = value + 1, range 1-16)
```

## Final Offset Word

After the last character table entry, a 2-byte word gives the offset (relative to its own position) pointing to the end of all glyph data. This marks the boundary of the last glyph's bitmap.

```
endOfData = finalWordPosition + (finalWord & 0x3FFF)
```

## Glyph Bitmap Data

Each glyph's bitmap data is stored as sequential row bytes:

- **1 byte per row** for widths 1-8
- **2 bytes per row** for widths 9-16
- **MSB = leftmost pixel**
- Number of rows = bitmap height (not font height — blank rows from shift and bottom are not stored)

The number of rows for glyph `i` is determined by the data length:

```
dataLength = nextGlyphAbsPos - thisGlyphAbsPos
numRows = dataLength / bytesPerRow
```

Where `bytesPerRow = 1` if width ≤ 8, else `2`.

The glyph is rendered at vertical position `shift` within the font cell. Rows above `shift` and below `shift + numRows` are blank.

## Advance Width

The total advance width (horizontal space consumed by a character) is:

```
advanceWidth = kern + pixelWidth + tracking
```

Where:
- `kern`: from character table (0-3)
- `pixelWidth`: from character table (1-16)
- `tracking`: from header (global, can be negative)

## Example

A font with height=8, tracking=0, lastChar=33 (space and !):

```
Header:     08 00 21
Entry 0 (space): offset=7 relative, kern=0, shift=0, width=3
  Bytes: 07 00 02    (offset=7, kern=0, shift=0, width=3)
Entry 1 (!): offset=7 relative, kern=0, shift=1, width=2
  Bytes: 07 00 11    (offset=7, kern=0, shift=1, width=2)
Final word: 09 00     (offset=9 relative → points past last glyph)
Space data: (empty — 0 bytes, no visible pixels)
! data:     80 80 80 80 80 00 80  (7 rows, 1 byte each)
```

The `!` glyph with shift=1 renders as:
```
Row 0: ..  (blank, shift=1)
Row 1: #.  (0x80)
Row 2: #.  (0x80)
Row 3: #.  (0x80)
Row 4: #.  (0x80)
Row 5: #.  (0x80)
Row 6: ..  (0x00)
Row 7: #.  (0x80)
```

## Limitations

- Maximum glyph width: 16 pixels
- Maximum vertical shift: 15 pixels
- Maximum kern: 3 pixels
- Character range: always starts at 32 (space)
- Maximum 14-bit relative offset (16383 bytes)

## References

- FZX format specification by Andrew Owen for the ZX Spectrum
