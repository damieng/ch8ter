# PCF (Portable Compiled Format) - X11 Bitmap Font Format

PCF is the compiled bitmap font format used by the X Window System. It is a **binary** format that can use either byte order. PCF files are typically produced by `bdftopcf` from BDF source fonts.

## File Header (8 bytes)

| Offset | Size | Type     | Field      | Notes |
|--------|------|----------|------------|-------|
| 0      | 4    | char[4]  | magic      | `"\1fcp"` (0x70636601 as UInt32LE) |
| 4      | 4    | Int32LE  | tableCount | Number of tables in the file |

The magic bytes are always little-endian. In byte order: `0x01 0x66 0x63 0x70`.

## Table of Contents

Immediately follows the header at offset 8. Contains `tableCount` entries, each 16 bytes. All fields in the TOC are **always little-endian**, regardless of individual table byte order.

| Size | Type    | Field  | Notes |
|------|---------|--------|-------|
| 4    | Int32LE | type   | Table type identifier (bit flag) |
| 4    | Int32LE | format | Format descriptor (endianness, padding, etc.) |
| 4    | Int32LE | size   | Size of table data in bytes |
| 4    | Int32LE | offset | Absolute byte offset of table data from file start |

### Table Types

Each type is a single bit flag:

| Constant             | Value    | Description |
|----------------------|----------|-------------|
| PCF_PROPERTIES       | 1 << 0   | Font properties (key-value metadata) |
| PCF_ACCELERATORS     | 1 << 1   | Basic accelerator info |
| PCF_METRICS          | 1 << 2   | Per-glyph metrics |
| PCF_BITMAPS          | 1 << 3   | Glyph bitmap data |
| PCF_INK_METRICS      | 1 << 4   | Ink (tight) metrics |
| PCF_BDF_ENCODINGS    | 1 << 5   | Character-to-glyph mapping |
| PCF_SWIDTHS          | 1 << 6   | Scalable widths |
| PCF_GLYPH_NAMES      | 1 << 7   | Per-glyph names |
| PCF_BDF_ACCELERATORS | 1 << 8   | Extended accelerators (preferred over PCF_ACCELERATORS) |

### Format Field

Every table has a format word that describes how its data is encoded. The format word is also stored in the TOC entry. The format field is interpreted as follows:

| Bits | Mask | Field         | Values |
|------|------|---------------|--------|
| 0-1  | 0x03 | glyphPad      | 0 = byte (1), 1 = word16 (2), 2 = word32 (4) |
| 2    | 0x04 | byteOrder     | 0 = LSByte first, 1 = MSByte first |
| 3    | 0x08 | bitOrder      | 0 = LSBit first, 1 = MSBit first |
| 4-5  | 0x30 | scanUnit      | Encoded as `1 << value`: 0 = 1 byte, 1 = 2 bytes, 2 = 4 bytes |
| 8    | 0x100| compressed    | Used by METRICS tables: 1 = compressed format |

The glyph padding value determines row stride alignment: each bitmap row is padded to the next multiple of `1 << glyphPad` bytes.

The scan unit determines the unit size for byte-swapping. When byte order is LSByte, bytes within each scan unit are reversed relative to MSByte order.

**Important:** Every table begins with its format word as an **Int32LE** (always little-endian), regardless of the byte order specified within the format. The byte/bit order bits in the format then govern how the *remainder* of the table data is read.

## Table Data Formats

All tables are padded to **4-byte boundaries** within the file. Each table's data begins with the format word (4 bytes, always LE), followed by table-specific content.

### PROPERTIES Table (PCF_PROPERTIES)

Stores font metadata as key-value pairs.

#### Structure

```
format       : Int32LE (4 bytes) - format word
nprops       : Int32 (4 bytes)   - number of properties
props[nprops]: Property entries (nprops * 9 bytes)
<padding>    : align to 4-byte boundary
stringSize   : Int32 (4 bytes)   - total size of string pool
strings      : char[] (stringSize bytes) - null-terminated string pool
```

#### Property Entry (9 bytes each)

| Size | Type  | Field      | Notes |
|------|-------|------------|-------|
| 4    | Int32 | nameOffset | Byte offset into string pool for property name |
| 1    | UInt8 | isString   | 1 = value is a string offset, 0 = value is an integer |
| 4    | Int32 | value      | If isString: offset into string pool. Otherwise: integer value. |

Endianness for Int32 fields (except the format word) is determined by bit 2 of the format word.

All strings in the string pool are null-terminated. Both property names and string values reference the same pool.

#### Common Properties

| Name              | Type    | Description |
|-------------------|---------|-------------|
| FOUNDRY           | string  | Font foundry name |
| FAMILY_NAME       | string  | Font family name |
| WEIGHT_NAME       | string  | Weight (e.g. "Medium", "Bold") |
| SLANT             | string  | Slant code: "R" (roman), "I" (italic), "O" (oblique) |
| SETWIDTH_NAME     | string  | Set width (e.g. "Normal", "Condensed") |
| ADD_STYLE_NAME    | string  | Additional style info |
| PIXEL_SIZE        | integer | Pixel height |
| POINT_SIZE        | integer | Point size in decipoints (multiply by 10) |
| RESOLUTION_X      | integer | Horizontal DPI |
| RESOLUTION_Y      | integer | Vertical DPI |
| SPACING           | string  | "P" (proportional), "M" (monospace), "C" (cell) |
| AVERAGE_WIDTH     | integer | Average width in tenths of a pixel |
| CHARSET_REGISTRY  | string  | Encoding registry (e.g. "ISO10646", "ISO8859") |
| CHARSET_ENCODING  | string  | Encoding variant (e.g. "1") |
| FONT_ASCENT       | integer | Font-wide ascent |
| FONT_DESCENT      | integer | Font-wide descent |
| DEFAULT_CHAR      | integer | Codepoint used for missing glyphs |
| FONT              | string  | Full XLFD font name |
| COPYRIGHT         | string  | Copyright notice |

### METRICS Table (PCF_METRICS)

Per-glyph bounding box and advance width information. There is one entry per glyph in the font, in glyph index order.

#### Uncompressed Format (bit 8 of format = 0)

```
format      : Int32LE (4 bytes)
glyphCount  : Int32 (4 bytes)
metrics[n]  : Metric entries (glyphCount * 12 bytes)
```

Each uncompressed metric entry is 12 bytes:

| Size | Type  | Field          | Notes |
|------|-------|----------------|-------|
| 2    | Int16 | leftBearing    | Left side bearing (X origin to leftmost pixel) |
| 2    | Int16 | rightBearing   | Right side bearing (X origin to rightmost pixel + 1) |
| 2    | Int16 | characterWidth | Advance width (total horizontal movement) |
| 2    | Int16 | ascent         | Pixels above baseline |
| 2    | Int16 | descent        | Pixels below baseline |
| 2    | UInt16| attributes     | Per-glyph attributes (typically 0) |

#### Compressed Format (bit 8 of format = 1)

```
format      : Int32LE (4 bytes)
glyphCount  : Int16 (2 bytes)        <-- note: Int16, not Int32
metrics[n]  : Compressed entries (glyphCount * 5 bytes)
```

Each compressed metric entry is 5 bytes:

| Size | Type  | Field          | Notes |
|------|-------|----------------|-------|
| 1    | UInt8 | leftBearing    | Actual value = byte - 0x80 |
| 1    | UInt8 | rightBearing   | Actual value = byte - 0x80 |
| 1    | UInt8 | characterWidth | Actual value = byte - 0x80 |
| 1    | UInt8 | ascent         | Actual value = byte - 0x80 |
| 1    | UInt8 | descent        | Actual value = byte - 0x80 |

Compressed metrics store values biased by 0x80 (128), allowing signed values from -128 to +127 in a single unsigned byte. There is no attributes field in compressed format.

#### Metric Interpretation

```
  characterWidth (advance width)
  |<---------------------------->|
  |  leftBearing                 |
  |  |<->|                      |
  |  +---+--+                   |
  |  |   |##|   ^  ascent       |
  |  |   |##|   |               |
  +--+---+--+---+ baseline      |
  |  |  ##  |   |               |
  |  +------+   v  descent      |
  |             |               |
  |  |<------>|                 |
  |  rightBearing               |
```

- **Glyph pixel width** = `rightBearing - leftBearing`
- **Glyph pixel height** = `ascent + descent`
- **Advance width** (`characterWidth`) determines cursor movement; may differ from pixel width

### BITMAPS Table (PCF_BITMAPS)

Contains the actual glyph bitmap data.

#### Structure

```
format        : Int32LE (4 bytes)
glyphCount    : Int32 (4 bytes)
offsets[n]    : Int32[glyphCount] - byte offset of each glyph's bitmap within bitmapData
bitmapSizes[4]: Int32[4] - total bitmap size for each padding mode (byte/word16/word32/word64)
bitmapData    : UInt8[] - concatenated glyph bitmaps
```

#### Interpreting Bitmap Data

For each glyph, the bitmap is a rectangular raster of `glyphHeight` rows, where `glyphHeight = ascent + descent` from the corresponding METRICS entry, and `glyphWidth = rightBearing - leftBearing`.

**Row stride** is determined by the glyph padding (format bits 0-1):

```
bytesPerRow = align(ceil(glyphWidth / 8), 1 << (format & 3))
```

Where `align(n, a)` rounds `n` up to the next multiple of `a`.

For example, a glyph 12 pixels wide:
- Byte padding (0): `ceil(12/8) = 2` bytes per row
- Word16 padding (1): `align(2, 2) = 2` bytes per row
- Word32 padding (2): `align(2, 4) = 4` bytes per row

**Bit order** (format bit 3):
- MSBit first (1): bit 7 of each byte is the leftmost pixel (standard/natural order)
- LSBit first (0): bit 0 of each byte is the leftmost pixel (bits must be reversed)

**Byte order** (format bit 2): affects byte arrangement within scan units.
- MSByte first (1): bytes within each scan unit are in natural left-to-right order
- LSByte first (0): bytes within each scan unit are reversed

**Scan unit** (format bits 4-5): determines the unit size for byte-order swapping (`1 << value` bytes). Only meaningful when byte order is LSByte. When swapping, reverse the bytes within each scan-unit-sized group.

#### Byte Reversal Table

For LSBit-first to MSBit-first conversion, each byte's bits must be reversed:

```
reversed = ((b * 0x0802 & 0x22110) | (b * 0x8020 & 0x88440)) * 0x10101 >>> 16 & 0xFF
```

Or use a 256-entry lookup table.

#### Reading a Pixel

After normalizing to MSBit-first, MSByte-first, byte-padded format:

```
byteIndex = y * bytesPerRow + (x >> 3)
pixel = (data[byteIndex] >> (7 - (x & 7))) & 1
```

### BDF_ENCODINGS Table (PCF_BDF_ENCODINGS)

Maps character codes to glyph indices.

#### Structure

```
format         : Int32LE (4 bytes)
minCharOrByte2 : Int16 (2 bytes) - minimum low byte of character code
maxCharOrByte2 : Int16 (2 bytes) - maximum low byte of character code
minByte1       : Int16 (2 bytes) - minimum high byte (0 for single-byte encodings)
maxByte1       : Int16 (2 bytes) - maximum high byte (0 for single-byte encodings)
defaultChar    : Int16 (2 bytes) - default character code for undefined glyphs
glyphIndices[] : Int16[] - glyph index array
```

#### Index Array

The array has `(maxByte1 - minByte1 + 1) * (maxCharOrByte2 - minCharOrByte2 + 1)` entries.

For a character code, compute the array index:

```
index = (byte1 - minByte1) * (maxCharOrByte2 - minCharOrByte2 + 1) + (byte2 - minCharOrByte2)
```

Where for single-byte encodings: `byte1 = 0`, `byte2 = charCode`. For two-byte encodings: `byte1 = charCode >> 8`, `byte2 = charCode & 0xFF`.

A glyph index value of `0xFFFF` (-1 as Int16) indicates the character is not present in the font.

### ACCELERATORS Table (PCF_ACCELERATORS) and BDF_ACCELERATORS (PCF_BDF_ACCELERATORS)

Provides pre-computed font-wide metrics for fast rendering. Both table types share the same structure. When PCF_BDF_ACCELERATORS is present, it is preferred over PCF_ACCELERATORS.

#### Structure

```
format          : Int32LE (4 bytes)
noOverlap       : UInt8 (1 byte)  - 1 if no glyph bitmaps overlap
constantMetrics : UInt8 (1 byte)  - 1 if all glyphs have the same metrics
terminalFont    : UInt8 (1 byte)  - 1 if suitable for terminal use
constantWidth   : UInt8 (1 byte)  - 1 if all glyphs have the same advance width
inkInside       : UInt8 (1 byte)  - 1 if ink stays within bounds
inkMetrics      : UInt8 (1 byte)  - 1 if ink metrics differ from logical metrics
drawDirection   : UInt8 (1 byte)  - 0 = left-to-right, 1 = right-to-left
padding         : UInt8 (1 byte)  - unused padding byte
fontAscent      : Int32 (4 bytes) - font-wide ascent in pixels
fontDescent     : Int32 (4 bytes) - font-wide descent in pixels
maxOverlap      : Int32 (4 bytes) - maximum glyph overlap
minBounds       : Metrics (12 bytes) - minimum values across all glyph metrics
maxBounds       : Metrics (12 bytes) - maximum values across all glyph metrics
```

If `inkMetrics` is set (PCF_BDF_ACCELERATORS only), two additional metric records follow:

```
inkMinBounds    : Metrics (12 bytes) - minimum ink metrics
inkMaxBounds    : Metrics (12 bytes) - maximum ink metrics
```

The Metrics sub-structure is the same as an uncompressed METRICS entry (6 Int16 fields = 12 bytes): leftBearing, rightBearing, characterWidth, ascent, descent, attributes.

### SWIDTHS Table (PCF_SWIDTHS)

Scalable widths for each glyph, used for scaling to different resolutions.

```
format     : Int32LE (4 bytes)
glyphCount : Int32 (4 bytes)
swidths[n] : Int32[glyphCount] - scalable width for each glyph
```

Scalable widths are expressed in units of 1/1000th of the font's point size.

### GLYPH_NAMES Table (PCF_GLYPH_NAMES)

Maps glyph indices to PostScript-style glyph names.

```
format       : Int32LE (4 bytes)
glyphCount   : Int32 (4 bytes)
offsets[n]   : Int32[glyphCount] - byte offset of each name in string pool
stringSize   : Int32 (4 bytes)   - total size of string pool
stringPool   : char[] - null-terminated glyph names
```

## File Layout

A typical PCF file is laid out as:

```
[0x0000]  File header (8 bytes)
            magic: 0x70636601
            tableCount: N
[0x0008]  Table of Contents (N * 16 bytes)
            TOC entry 0: type, format, size, offset
            TOC entry 1: type, format, size, offset
            ...
[varies]  Table data (each padded to 4-byte boundary)
            PROPERTIES table
            ACCELERATORS table
            METRICS table
            BITMAPS table
            BDF_ENCODINGS table
            SWIDTHS table
            GLYPH_NAMES table
            BDF_ACCELERATORS table
```

Table order within the file is not mandated; the TOC offsets can point to tables in any order. However, `bdftopcf` conventionally writes them in the order shown above.

## Typical Table Set

A minimal PCF file requires at minimum:
- **PCF_METRICS** - glyph dimensions
- **PCF_BITMAPS** - glyph pixel data

A fully-featured PCF file typically includes all eight table types. The PCF_ACCELERATORS and PCF_BDF_ACCELERATORS tables often contain identical data; both are written for compatibility with different X server versions.

## Endianness Summary

| Data                         | Endianness |
|------------------------------|------------|
| File magic                   | Always LE  |
| tableCount                   | Always LE  |
| TOC entries (all fields)     | Always LE  |
| Format word (first 4 bytes of each table) | Always LE |
| All other table data         | Per format bit 2 (0=LE, 1=BE) |

## References

- [X.Org PCF source code](https://gitlab.freedesktop.org/xorg/lib/libxfont) - Canonical implementation in libXfont
- [bdftopcf](https://gitlab.freedesktop.org/xorg/app/bdftopcf) - BDF to PCF compiler source
- [FontForge PCF documentation](https://fontforge.org/docs/techref/pcf-format.html) - Community-maintained format notes
