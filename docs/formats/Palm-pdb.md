# PalmOS PDB Font Format

PalmOS bitmap fonts are stored as PDB (Palm Database) files containing a single NFNT (New Font) resource record. The entire file is **big-endian**.

## PDB Container

### Header (78 bytes)

| Offset | Size | Type   | Field              | Notes |
|--------|------|--------|--------------------|-------|
| 0      | 32   | char[] | name               | Null-terminated, null-padded ASCII |
| 32     | 2    | UInt16 | attributes         | Bit flags (see below) |
| 34     | 2    | UInt16 | version            | File version, typically 0 |
| 36     | 4    | UInt32 | creationDate       | Seconds since 1904-01-01 00:00:00 |
| 40     | 4    | UInt32 | modificationDate   | Seconds since 1904-01-01 00:00:00 |
| 44     | 4    | UInt32 | lastBackupDate     | Seconds since 1904-01-01 00:00:00 |
| 48     | 4    | UInt32 | modificationNumber | Incremented on each modification |
| 52     | 4    | UInt32 | appInfoID          | Offset to AppInfo block, or 0 |
| 56     | 4    | UInt32 | sortInfoID         | Offset to SortInfo block, or 0 |
| 60     | 4    | char[4]| type               | `'Font'` (0x466F6E74) for font databases |
| 64     | 4    | char[4]| creator            | `'Font'` (0x466F6E74) for font databases |
| 68     | 4    | UInt32 | uniqueIDSeed       | Internal use |
| 72     | 4    | UInt32 | nextRecordListID   | Always 0 in stored files |
| 76     | 2    | UInt16 | numRecords         | Number of records (1 for font files) |

### Date Conversion

Palm dates count seconds from **1904-01-01 00:00:00 UTC**. To convert from Unix epoch:

```
palmDate = unixTimestamp + 2082844800
```

### Attribute Flags

| Bit  | Value  | Meaning |
|------|--------|---------|
| 1    | 0x0002 | Read-only |
| 2    | 0x0004 | Dirty AppInfoArea |
| 3    | 0x0008 | Backup this database |
| 4    | 0x0010 | Allow newer version install |
| 5    | 0x0020 | Force reset after install |
| 6    | 0x0040 | No beaming |

### Record List (starts at offset 78)

Each record entry is 8 bytes. For font PDBs there is typically 1 record.

| Size | Type   | Field            | Notes |
|------|--------|------------------|-------|
| 4    | UInt32 | dataOffset       | Absolute byte offset from file start to record data |
| 1    | UInt8  | attributes       | 0x40 = dirty |
| 3    | UInt24 | uniqueID         | Record identifier |

### Gap

After the record list, there are **2 bytes of zeros** before the record data begins. This is a PDB convention ("traditionally 2 zero bytes").

### Typical Layout

```
[0x0000]  PDB Header (78 bytes)
[0x004E]  Record entry (8 bytes)
[0x0056]  2-byte gap (zeros)
[0x0058]  Font record data (to end of file)
```

## NFNT Font Record

The font record contains a header, a single raster bitmap with all glyphs arranged side-by-side, a location table, and an offset/width table.

### Font Header (26 bytes, big-endian)

| Offset | Size | Type   | Field       | Notes |
|--------|------|--------|-------------|-------|
| 0      | 2    | UInt16 | fontType    | `0x9000` for standard NFNT |
| 2      | 2    | Int16  | firstChar   | First character code (typically 9) |
| 4      | 2    | Int16  | lastChar    | Last character code (typically 255) |
| 6      | 2    | Int16  | maxWidth    | Width of widest glyph in pixels |
| 8      | 2    | Int16  | kernMax     | Maximum kerning value (usually 0) |
| 10     | 2    | Int16  | nDescent    | Negative descent (usually 0) |
| 12     | 2    | Int16  | fRectWidth  | Width of widest glyph (same as maxWidth) |
| 14     | 2    | Int16  | fRectHeight | Height of all glyphs in pixels |
| 16     | 2    | UInt16 | owTLoc      | Word offset from byte 16 to offset/width table |
| 18     | 2    | Int16  | ascent      | Pixels from top of glyph to baseline |
| 20     | 2    | Int16  | descent     | Pixels from baseline to bottom of glyph |
| 22     | 2    | Int16  | leading     | Extra vertical spacing between lines (usually 0) |
| 24     | 2    | Int16  | rowWords    | Width of bitmap in 16-bit words |

**Key relationships:**
- `fRectHeight = ascent + descent`
- `rowWords = ceil(totalBitmapPixelWidth / 16)`
- `owTLoc` is a **word offset** (multiply by 2 for bytes) measured from **byte 16** of the font record

### Record Layout

```
[0]                                Font header (26 bytes)
[26]                               Bitmap data
[26 + bitmapSize]                  Location table
[26 + bitmapSize + locTableSize]   Offset/Width table
```

Where:
- `bitmapSize = rowWords * 2 * fRectHeight`
- `locTableSize = (numChars + 2) * 2`
- `owtTableSize = (numChars + 2) * 2`
- `numChars = lastChar - firstChar + 1`

The extra 2 entries (beyond numChars) are:
- Entry at index `numChars`: the "missing glyph" substitute
- Entry at index `numChars + 1`: sentinel marking the end

### Bitmap Data

The bitmap is a single contiguous raster containing all glyphs arranged side-by-side horizontally.

- **Row-major order**: each row is `rowWords * 2` bytes
- **MSB-first**: bit 7 of each byte is the leftmost pixel
- **Total rows**: `fRectHeight`
- All glyphs share the same height; the glyph's x-position and pixel width within the raster are given by the location table

To read pixel (x, y) from the bitmap:
```
byteIndex = 26 + y * (rowWords * 2) + (x >> 3)
bit = (data[byteIndex] >> (7 - (x & 7))) & 1
```

### Location Table

Immediately follows the bitmap. Contains `(numChars + 2)` big-endian UInt16 entries.

Each entry gives the **x pixel position** in the bitmap where that glyph starts. The pixel width of glyph `i` is:

```
glyphPixelWidth = locationTable[i + 1] - locationTable[i]
```

A glyph with width 0 (same location as the next) has no bitmap data. The final entry is a sentinel giving the total bitmap pixel width.

Example for a font with firstChar=32, glyphs of widths 3, 5, 4:
```
locationTable = [0, 3, 8, 12, ...]
```

### Offset/Width Table

Located at `16 + owTLoc * 2` bytes from the start of the font record. Contains `(numChars + 2)` entries, each 2 bytes:

| Byte | Type  | Field  | Notes |
|------|-------|--------|-------|
| 0    | Int8  | offset | Pixel offset before drawing (kerning). Usually 0. |
| 1    | UInt8 | width  | Advance width (total character width including spacing) |

**Missing glyph marker:** `offset = -1 (0xFF), width = 0xFF`. This means the character is not present in the font. PalmOS will substitute the "missing glyph" entry (at index `numChars`).

**Advance width vs bitmap width:** The advance width from this table determines character spacing when rendering text. The bitmap width from the location table determines how many pixels are actually drawn. These are typically equal, with the bitmap including trailing blank columns.

### Calculating owTLoc

When writing:
```
owtByteOffset = 26 + bitmapSize + locationTableSize
owTLoc = (owtByteOffset - 16) / 2
```

When reading:
```
owtByteOffset = 16 + owTLoc * 2
```

## Character Range

PalmOS fonts typically cover codepoints **9 through 255**:

- **9**: Tab (horizontal arrow glyph, blank bitmap)
- **10-13**: Line control characters (usually missing)
- **14-19**: Missing in most fonts
- **20-25**: PalmOS special characters (OTA indicators, command/shortcut strokes, ellipsis, numeric space)
- **26-31**: Usually missing
- **32-126**: Standard ASCII printable characters
- **127**: Usually missing (DEL)
- **128-255**: Extended characters per PalmOS codepage (based on Windows-1252)

## PalmOS 3.3 Codepage

Based on Windows-1252 with these differences:

### Low Control Character Overrides (0x08-0x19)

| Byte | Unicode | Character | Notes |
|------|---------|-----------|-------|
| 0x08 | U+2190  | ←         | Left arrow (backspace glyph) |
| 0x09 | U+2192  | →         | Right arrow (tab glyph) |
| 0x0A | U+2193  | ↓         | Down arrow (linefeed glyph) |
| 0x0B | U+2191  | ↑         | Up arrow |
| 0x14 | U+25C0  | ◀         | OTA secure indicator |
| 0x15 | U+25B6  | ▶         | OTA indicator |
| 0x16 | U+2318  | ⌘         | Command stroke (preferred location) |
| 0x17 | U+2702  | ✂         | Shortcut stroke (preferred location) |
| 0x18 | U+2026  | …         | Horizontal ellipsis (preferred location) |
| 0x19 | U+2007  |           | Numeric/figure space |

### High Byte Overrides (0x80-0x9F)

| Byte | Unicode | Character | Win-1252 equivalent |
|------|---------|-----------|---------------------|
| 0x80 | U+20AC  | €         | Same (Euro sign, since PalmOS 3.3) |
| 0x8D | U+2662  | ♢         | Was undefined in Win-1252 |
| 0x8E | U+2663  | ♣         | Was Ž in Win-1252 |
| 0x8F | U+2661  | ♡         | Was undefined in Win-1252 |
| 0x90 | U+2660  | ♠         | Was undefined in Win-1252 |
| 0x9D | U+2318  | ⌘         | Command stroke (legacy position) |
| 0x9E | U+2702  | ✂         | Shortcut stroke (legacy position) |

All other positions (0x81-0x8C, 0x91-0x9C, 0x9F, 0xA0-0xFF) are identical to Windows-1252.

### Version History

| PalmOS | Changes |
|--------|---------|
| 2.0    | Original codepage. 0x80 = numeric space, 0x9D/0x9E = command/shortcut |
| 3.1    | Added 0x14-0x19 special chars. 0x16/0x17 became preferred command/shortcut |
| 3.3    | 0x80 changed to Euro sign (aligned with Win-1252). 0x19 = numeric space |
| 3.5    | No codepage changes |

## Complete File Example

For a font named "MyFont" with firstChar=32, lastChar=34 (3 chars: space, !, "), height=8, and these glyphs:

```
Space: 3px wide, blank
!:     2px wide, vertical bar + dot
":     5px wide, two dots
```

### Bitmap Layout

```
Row 0: [space 3px][! 2px][" 5px] = 10px total → rowWords = 1
Row 1: ...
(8 rows total)
```

### Location Table (5 entries = 3 chars + 2)

```
[0, 3, 5, 10, 10]
```

### Offset/Width Table (5 entries)

```
[{0, 3}, {0, 2}, {0, 5}, {-1, 0xFF}, {-1, 0xFF}]
```

### File Structure

```
PDB Header (78 bytes)
  name = "MyFont\0..."
  type = "Font"
  creator = "Font"
  numRecords = 1
Record Entry (8 bytes)
  offset = 88
  attrs = 0x40
Gap (2 bytes)
  0x0000
Font Record:
  Header (26 bytes)
    fontType = 0x9000
    firstChar = 32
    lastChar = 34
    maxWidth = 5
    fRectWidth = 5
    fRectHeight = 8
    owTLoc = (26 + 16 + 10 - 16) / 2 = 18
    ascent = 7
    descent = 1
    rowWords = 1
  Bitmap (16 bytes = 1 word * 2 bytes * 8 rows)
  Location Table (10 bytes = 5 * 2)
  Offset/Width Table (10 bytes = 5 * 2)
```

## References

- [PDB format](https://wiki.mobileread.com/wiki/PDB) — MobileRead Wiki
- [PalmOS codepage](https://dflund.se/~triad/krad/recode/palm.html) — PalmOS character encoding differences from Windows-1252
