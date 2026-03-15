# PSF (PC Screen Font) Format

PSF is a binary bitmap font format used by the Linux console (fbcon/kbd). All multi-byte integers are **little-endian**. There are two versions: PSF1 (simple, 8px-wide only) and PSF2 (variable width/height).

---

## PSF1

### Header (4 bytes)

| Offset | Size | Type  | Field    | Description |
|--------|------|-------|----------|-------------|
| 0      | 2    | UInt16| magic    | `0x0436`    |
| 2      | 1    | UInt8 | mode     | Flags (see below) |
| 3      | 1    | UInt8 | charSize | Bytes per glyph (equals the glyph height in pixels) |

#### Magic bytes

Stored little-endian, so the raw byte sequence is `0x36 0x04`.

#### Mode flags

| Bit | Mask | Meaning |
|-----|------|---------|
| 0   | 0x01 | Font has 512 glyphs (if clear, 256 glyphs) |
| 1   | 0x02 | Font has a Unicode mapping table |
| 2   | 0x04 | Font has Unicode sequences (multi-codepoint mappings) |

The glyph count is determined solely by bit 0: either 256 or 512.

#### Glyph dimensions

- **Width** is always 8 pixels (1 byte per row).
- **Height** equals `charSize` (since each row is 1 byte, charSize is both the byte count and the row count).

### Glyph bitmap data

Immediately follows the header. Total size: `glyphCount * charSize` bytes.

Each glyph is `charSize` consecutive bytes, one byte per row, top to bottom. Within each byte the **most significant bit** is the leftmost pixel.

```
Byte bits:  [7] [6] [5] [4] [3] [2] [1] [0]
Pixel:       0   1   2   3   4   5   6   7
```

A set bit (1) means the pixel is "on" (foreground); a clear bit (0) means "off" (background).

### Unicode mapping table (PSF1)

Present only when mode bit 1 or bit 2 is set. Follows immediately after all glyph bitmaps.

The table contains one entry per glyph, in glyph index order. Each entry is a variable-length sequence of **UInt16LE** values:

| Value    | Meaning |
|----------|---------|
| 0x0000-0xFFFD | A Unicode codepoint mapped to this glyph |
| 0xFFFE   | Start of a multi-codepoint sequence (combining character sequence) |
| 0xFFFF   | End-of-entry terminator for this glyph |

#### Reading the PSF1 Unicode table

For each glyph (0 to glyphCount-1):

1. Read UInt16LE values one at a time.
2. If the value is a normal codepoint (< 0xFFFE), associate it with this glyph as a single-codepoint mapping.
3. If the value is `0xFFFE`, the subsequent codepoints (up to the next `0xFFFE` or `0xFFFF`) form a multi-codepoint sequence (e.g., base character + combining marks). These sequences can generally be skipped for basic font editing.
4. If the value is `0xFFFF`, this glyph's entry is complete; move to the next glyph.

Note: PSF1 Unicode values are UCS-2 / UTF-16LE. Codepoints above U+FFFD are not representable in PSF1 Unicode tables.

---

## PSF2

### Header (32 bytes)

| Offset | Size | Type   | Field        | Description |
|--------|------|--------|--------------|-------------|
| 0      | 4    | UInt32 | magic        | `0x864AB572` |
| 4      | 4    | UInt32 | version      | Must be `0` |
| 8      | 4    | UInt32 | headerSize   | Size of header in bytes (usually 32, but parsers should respect this value to allow future extensions) |
| 12     | 4    | UInt32 | flags        | Flags (see below) |
| 16     | 4    | UInt32 | numGlyphs    | Number of glyphs in the font |
| 20     | 4    | UInt32 | bytesPerGlyph| Bytes per glyph bitmap |
| 24     | 4    | UInt32 | height       | Glyph height in pixels |
| 28     | 4    | UInt32 | width        | Glyph width in pixels |

#### Magic bytes

Stored little-endian, so the raw byte sequence is `0x72 0xB5 0x4A 0x86`.

#### Flags

| Bit | Mask       | Meaning |
|-----|------------|---------|
| 0   | 0x00000001 | Font has a Unicode mapping table |

#### Glyph dimensions

Unlike PSF1, PSF2 supports arbitrary widths. The relationship is:

```
bytesPerRow  = ceil(width / 8)
bytesPerGlyph = height * bytesPerRow
```

Parsers should verify that `bytesPerGlyph == height * ceil(width / 8)`.

### Glyph bitmap data

Starts at offset `headerSize` (not necessarily 32, though it usually is). Total size: `numGlyphs * bytesPerGlyph` bytes.

Each glyph consists of `height` rows. Each row is `ceil(width / 8)` bytes. Within each byte the **most significant bit** is the leftmost pixel. If the width is not a multiple of 8, the unused trailing bits in the last byte of each row are padding and should be zero.

Example for a 12-pixel-wide glyph (2 bytes per row):

```
Byte 0 bits: [7] [6] [5] [4] [3] [2] [1] [0]   -> pixels 0-7
Byte 1 bits: [7] [6] [5] [4] [3] [2] [1] [0]   -> pixels 8-11, then 4 padding bits
```

### Unicode mapping table (PSF2)

Present only when flags bit 0 is set. Follows immediately after all glyph bitmaps (at offset `headerSize + numGlyphs * bytesPerGlyph`).

The table contains one entry per glyph, in glyph index order. Each entry is a variable-length sequence of **UTF-8 encoded** bytes:

| Byte value | Meaning |
|------------|---------|
| 0x00-0xFD  | Part of a UTF-8 encoded codepoint |
| 0xFE       | Sequence separator: starts a multi-codepoint sequence |
| 0xFF       | End-of-entry terminator for this glyph |

#### Reading the PSF2 Unicode table

For each glyph (0 to numGlyphs-1):

1. Read bytes and decode UTF-8 codepoints until encountering `0xFE` or `0xFF`.
2. Each fully decoded codepoint before the first `0xFE` is a single-codepoint mapping to this glyph.
3. If `0xFE` is encountered, the following UTF-8 codepoints (up to the next `0xFE` or `0xFF`) form a multi-codepoint sequence (e.g., a base character followed by combining marks). These can generally be skipped for basic font editing.
4. If `0xFF` is encountered, this glyph's entry is complete; move to the next glyph.

Since the table uses UTF-8, PSF2 can represent the full Unicode range (U+0000 to U+10FFFF). The separator bytes `0xFE` and `0xFF` are chosen because they are invalid in well-formed UTF-8, so they cannot be confused with encoded codepoints.

---

## Comparison: PSF1 vs PSF2

| Feature | PSF1 | PSF2 |
|---------|------|------|
| Magic | `0x0436` (2 bytes) | `0x864AB572` (4 bytes) |
| Header size | 4 bytes | 32 bytes (or more, per headerSize field) |
| Max glyph count | 256 or 512 | Any UInt32 value |
| Glyph width | Fixed at 8 pixels | Any width |
| Glyph height | 1-255 (stored as charSize) | Any UInt32 value |
| Unicode table encoding | UTF-16LE (UInt16LE per codepoint) | UTF-8 |
| Unicode entry terminator | `0xFFFF` (UInt16LE) | `0xFF` (single byte) |
| Sequence separator | `0xFFFE` (UInt16LE) | `0xFE` (single byte) |
| Max codepoint | U+FFFD | U+10FFFF |

---

## File layout summary

### PSF1

```
[ Magic 2B ][ Mode 1B ][ CharSize 1B ]
[ Glyph 0: charSize bytes ]
[ Glyph 1: charSize bytes ]
...
[ Glyph N-1: charSize bytes ]
[ Unicode table (optional, variable length) ]
```

### PSF2

```
[ Header: headerSize bytes (min 32) ]
[ Glyph 0: bytesPerGlyph bytes ]
[ Glyph 1: bytesPerGlyph bytes ]
...
[ Glyph N-1: bytesPerGlyph bytes ]
[ Unicode table (optional, variable length) ]
```

---

## Notes for implementers

- **Detecting version**: Read the first 2 bytes. If they are `0x36 0x04`, it is PSF1. Otherwise read 4 bytes and check for `0x72 0xB5 0x4A 0x86` for PSF2. If neither matches, the file is not a valid PSF font.
- **PSF2 headerSize**: Always seek to offset `headerSize` to find the start of glyph data, even if headerSize > 32. Future versions may extend the header.
- **Gzip compression**: PSF files distributed with Linux are often gzip-compressed (`.psf.gz` or `.psfu.gz`). Decompress before parsing.
- **Writing PSF1**: Set mode bit 1 when including a Unicode table. Set bit 0 for 512-glyph fonts. `charSize` equals the font height.
- **Writing PSF2**: Set `version` to 0, `headerSize` to 32, and flags bit 0 when including a Unicode table. Compute `bytesPerGlyph` as `height * ceil(width / 8)`.
- **Padding bits**: When writing glyphs whose width is not a multiple of 8, zero-fill the unused low bits in the last byte of each row.
