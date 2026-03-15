# BDF - Bitmap Distribution Format

BDF is a text-based bitmap font format originally developed by Adobe and adopted as the standard font format for the X Window System (X11). It is defined in the "Glyph Bitmap Distribution Format (BDF) Specification" version 2.1 (1993) and version 2.2 (1993, adding METRICSSET for vertical writing).

The format is human-readable, line-oriented, and uses ASCII text throughout. It describes a single bitmap strike (one size) of a font.

---

## File Structure Overview

A BDF file has this top-level structure:

```
STARTFONT <version>
<global font metadata>
STARTPROPERTIES <count>
  <property entries>
ENDPROPERTIES
CHARS <count>
<glyph definitions>
ENDFONT
```

Every BDF file begins with `STARTFONT` and ends with `ENDFONT`. Blank lines and lines beginning with `COMMENT` are ignored.

---

## Global Header Keywords

### STARTFONT

```
STARTFONT 2.1
```

Required. Must be the first line. The version is almost always `2.1`. Version `2.2` adds the `METRICSSET` keyword for vertical writing metrics but is otherwise identical.

### COMMENT

```
COMMENT This is a comment
COMMENT
```

Optional. May appear anywhere in the file. Everything after `COMMENT ` (note the space) to end of line is the comment text. A bare `COMMENT` with no text is also valid.

### FONT

```
FONT -foundry-family-weight-slant-setWidth-addStyle-pixelSize-pointSize-resX-resY-spacing-avgWidth-charsetRegistry-charsetEncoding
```

Required. The font name. Conventionally uses the X Logical Font Description (XLFD) format, which is a hyphen-separated string of 14 fields:

| Position | Field | Example values |
|----------|-------|---------------|
| 1 | Foundry | `Misc`, `Adobe`, `Bitstream` |
| 2 | Family name | `Fixed`, `Courier`, `Helvetica` |
| 3 | Weight | `Medium`, `Bold`, `Light` |
| 4 | Slant | `R` (roman), `I` (italic), `O` (oblique) |
| 5 | Set width | `Normal`, `Condensed`, `SemiCondensed` |
| 6 | Additional style | `` (empty), `Sans`, `Serif` |
| 7 | Pixel size | `16`, `0` (scalable) |
| 8 | Point size (decipoints) | `120` = 12.0pt |
| 9 | Resolution X (dpi) | `75`, `100` |
| 10 | Resolution Y (dpi) | `75`, `100` |
| 11 | Spacing | `C` (character cell), `M` (monospace), `P` (proportional) |
| 12 | Average width (tenths of pixel) | `80` = 8.0 pixels |
| 13 | Charset registry | `ISO8859`, `ISO10646` |
| 14 | Charset encoding | `1`, `15`, `1` (for Unicode) |

The XLFD convention is not enforced by parsers; the FONT value can technically be any string.

### SIZE

```
SIZE pointSize xResolution yResolution
```

Required. Defines the design size of the font.

- `pointSize` - Integer, the point size of the font.
- `xResolution` - Integer, horizontal resolution in dots per inch the font was designed for.
- `yResolution` - Integer, vertical resolution in dots per inch.

Example: `SIZE 12 75 75` means a 12-point font designed for 75 dpi.

### FONTBOUNDINGBOX

```
FONTBOUNDINGBOX fbbxWidth fbbxHeight fbbxOffX fbbxOffY
```

Required. The bounding box that is large enough to contain any glyph in the font. This is the union (smallest enclosing rectangle) of all individual glyph bounding boxes.

- `fbbxWidth` - Integer, width in pixels.
- `fbbxHeight` - Integer, height in pixels.
- `fbbxOffX` - Integer, x-offset from the origin (left bearing).
- `fbbxOffY` - Integer, y-offset from the baseline. Positive means the bottom of the bounding box is above the baseline.

### METRICSSET

```
METRICSSET n
```

Optional (BDF 2.2 only). Specifies which writing directions have metrics:
- `0` - Horizontal metrics only (default if absent).
- `1` - Vertical metrics only.
- `2` - Both horizontal and vertical metrics.

---

## Properties Section

```
STARTPROPERTIES n
<property lines>
ENDPROPERTIES
```

Optional but very commonly present. `n` is the number of property lines between `STARTPROPERTIES` and `ENDPROPERTIES`.

Each property line has the format:

```
PROPERTY_NAME value
```

Values are either:
- **Integer** - a decimal number, possibly negative (e.g., `12`, `-3`).
- **String** - enclosed in double quotes (e.g., `"Courier"`). To include a literal double quote within a string, use two consecutive double quotes (`""`).

### Standard Properties

These properties are defined by the BDF specification and the X11 convention. All are optional.

| Property | Type | Description |
|----------|------|-------------|
| `FOUNDRY` | String | Font vendor name |
| `FAMILY_NAME` | String | Typeface family name (e.g., `"Courier"`) |
| `WEIGHT_NAME` | String | Weight (e.g., `"Bold"`, `"Medium"`) |
| `SLANT` | String | `"R"` = roman, `"I"` = italic, `"O"` = oblique, `"RI"` = reverse italic, `"RO"` = reverse oblique |
| `SETWIDTH_NAME` | String | Width variant (e.g., `"Normal"`, `"Condensed"`) |
| `ADD_STYLE_NAME` | String | Additional style info (e.g., `"Sans"`, `"Serif"`, `""`) |
| `PIXEL_SIZE` | Integer | Font pixel size |
| `POINT_SIZE` | Integer | Font point size in decipoints (120 = 12.0pt) |
| `RESOLUTION_X` | Integer | Horizontal resolution in dpi |
| `RESOLUTION_Y` | Integer | Vertical resolution in dpi |
| `SPACING` | String | `"P"` = proportional, `"M"` = monospace, `"C"` = character cell |
| `AVERAGE_WIDTH` | Integer | Average width in tenths of a pixel |
| `CHARSET_REGISTRY` | String | Character set registry (e.g., `"ISO8859"`, `"ISO10646"`) |
| `CHARSET_ENCODING` | String | Character set encoding (e.g., `"1"`, `"15"`) |
| `FONT_ASCENT` | Integer | Pixels above the baseline for the font's logical extent |
| `FONT_DESCENT` | Integer | Pixels below the baseline for the font's logical extent (positive value) |
| `DEFAULT_CHAR` | Integer | Encoding value of the glyph to use for undefined characters |
| `COPYRIGHT` | String | Copyright notice |
| `NOTICE` | String | Additional notice string |
| `CAP_HEIGHT` | Integer | Height of capital letters in pixels |
| `X_HEIGHT` | Integer | Height of lowercase `x` in pixels |
| `UNDERLINE_POSITION` | Integer | Y position of underline relative to baseline (negative = below) |
| `UNDERLINE_THICKNESS` | Integer | Thickness of underline in pixels |
| `WEIGHT` | Integer | Numeric weight value (typically 10 = light, 20 = medium, 40 = bold) |
| `FACE_NAME` | String | Human-readable name of the font face |
| `QUAD_WIDTH` | Integer | Width of an em quad in pixels |
| `RAW_ASCENT` | Integer | Unscaled ascent value from original font |
| `RAW_DESCENT` | Integer | Unscaled descent value from original font |
| `RAW_PIXELSIZE` | Integer | Unscaled pixel size from original font |
| `RAW_POINTSIZE` | Integer | Unscaled point size in decipoints from original font |
| `RAW_AVERAGE_WIDTH` | Integer | Unscaled average width in tenths of a pixel |
| `_XMBDFED_INFO` | String | Editor metadata (various editors store their own `_`-prefixed properties) |

Properties with names beginning with an underscore (`_`) are vendor-specific and can be freely defined. Parsers should preserve but may ignore unrecognized properties.

### FONT_ASCENT and FONT_DESCENT

These two properties are especially important for rendering. Together they define the font's logical line height:

```
lineHeight = FONT_ASCENT + FONT_DESCENT
```

- `FONT_ASCENT` is the number of pixels from the baseline to the top of the font's logical extent.
- `FONT_DESCENT` is the number of pixels from the baseline to the bottom. Stored as a positive integer even though it represents a downward distance.

When rendering a glyph, the glyph's bitmap is placed relative to the baseline using the glyph's BBX values (see below).

---

## Glyph Definitions

### CHARS

```
CHARS n
```

Required. Declares the total number of glyph definitions that follow. `n` must match the actual count of `STARTCHAR`...`ENDCHAR` blocks.

### Glyph Block

Each glyph is defined by a `STARTCHAR`...`ENDCHAR` block:

```
STARTCHAR name
ENCODING codepoint
SWIDTH swx0 swy0
DWIDTH dwx0 dwy0
BBX bbxWidth bbxHeight bbxOffX bbxOffY
BITMAP
hexRow1
hexRow2
...
ENDCHAR
```

#### STARTCHAR

```
STARTCHAR name
```

Required. `name` is a human-readable identifier for the glyph (e.g., `A`, `space`, `Adieresis`, `uni0041`, `C0020`). It does not need to match any encoding standard but is conventionally the Adobe glyph name or PostScript character name.

#### ENCODING

```
ENCODING codepoint
```

Required. The character code as a non-negative decimal integer. For Unicode-encoded fonts, this is the Unicode codepoint (e.g., `65` for U+0041 LATIN CAPITAL LETTER A).

A value of `-1` indicates the glyph has no encoding (it is an unencoded glyph).

The two-argument form is also valid for BDF 2.2:

```
ENCODING -1 codepoint
```

This means the standard encoding is unencoded (`-1`), but a second non-standard encoding value is provided.

#### SWIDTH

```
SWIDTH swx0 swy0
```

Required. The scalable width of the glyph.

- `swx0` - Integer, the scalable width in the x direction in units of 1/1000th of the point size (equivalently, 1/1000th of an em). For example, a glyph that is half an em wide in a 12pt font would have `swx0 = 500`.
- `swy0` - Integer, the scalable width in the y direction. This is almost always `0` for horizontal writing.

The relationship between SWIDTH and DWIDTH is:

```
DWIDTH_x = round(SWIDTH_x * pointSize / 1000 * xResolution / 72)
```

#### DWIDTH

```
DWIDTH dwx0 dwy0
```

Required. The device width (advance width) in pixels - how far to move the drawing position after rendering this glyph.

- `dwx0` - Integer, advance width in the x direction (pixels).
- `dwy0` - Integer, advance width in the y direction (pixels). Almost always `0` for horizontal writing.

For monospace fonts, all glyphs have the same `dwx0`.

#### SWIDTH1 and DWIDTH1

```
SWIDTH1 swx1 swy1
DWIDTH1 dwx1 dwy1
```

Optional (BDF 2.2 only). Scalable and device widths for vertical writing direction. Same format as SWIDTH and DWIDTH.

#### BBX

```
BBX bbxWidth bbxHeight bbxOffX bbxOffY
```

Required. The bounding box of this glyph's bitmap.

- `bbxWidth` - Integer, width of the bitmap in pixels.
- `bbxHeight` - Integer, height of the bitmap in pixels (equals the number of BITMAP rows).
- `bbxOffX` - Integer, x-offset from the current drawing origin to the left edge of the bitmap. Positive means the bitmap starts to the right of the origin.
- `bbxOffY` - Integer, y-offset from the baseline to the bottom edge of the bitmap. Positive means the bottom edge is above the baseline; negative means below.

The bitmap therefore occupies the rectangle:

```
left   = origin_x + bbxOffX
right  = origin_x + bbxOffX + bbxWidth
bottom = baseline_y + bbxOffY
top    = baseline_y + bbxOffY + bbxHeight
```

#### Placing a Glyph on the Raster Grid

Given a raster image with `FONT_ASCENT` rows above the baseline and `FONT_DESCENT` rows below:

```
Row 0 (top of cell)       = FONT_ASCENT - 1 pixels above baseline
...
Row FONT_ASCENT - 1       = baseline row
...
Row FONT_ASCENT + FONT_DESCENT - 1 = bottom of cell
```

The glyph bitmap's top-left corner is placed at:

```
rasterX = bbxOffX
rasterY = FONT_ASCENT - bbxOffY - bbxHeight
```

Where `rasterY` is in top-down row coordinates (row 0 = top of the cell).

#### BITMAP

```
BITMAP
hexRow1
hexRow2
...
```

Required. The `BITMAP` keyword is followed by exactly `bbxHeight` lines of hexadecimal data, one per row of the glyph from top to bottom.

**Hex encoding rules:**

1. Each row represents `bbxWidth` pixels.
2. The row is encoded as `ceil(bbxWidth / 8)` bytes.
3. Each byte is written as exactly 2 uppercase hexadecimal digits (00-FF). Lowercase hex is also accepted by most parsers.
4. Bytes are written left to right (MSB of first byte = leftmost pixel of the row).
5. Within each byte, bit 7 (MSB, value 0x80) is the leftmost pixel; bit 0 (LSB, value 0x01) is the rightmost.
6. If `bbxWidth` is not a multiple of 8, the trailing bits of the last byte in each row are padding and must be zero. They are not part of the glyph.
7. A set bit (1) means the pixel is "on" (foreground/ink). A clear bit (0) means "off" (background/no ink).

**Example:** For a glyph with `BBX 5 7 0 0`:

- Each row is `ceil(5/8) = 1` byte = 2 hex characters.
- A row showing pixels `X.X.X` (on, off, on, off, on) is binary `10101000` = hex `A8`. The trailing 3 bits are padding zeros.

For a glyph with `BBX 12 3 0 0`:

- Each row is `ceil(12/8) = 2` bytes = 4 hex characters.
- A row of all-on pixels: `11111111 11110000` = hex `FFF0`. The trailing 4 bits are padding zeros.

#### ENDCHAR

Terminates the glyph definition.

---

## ENDFONT

The last line of the file. Signals end of the font data. Everything after this line is ignored.

---

## Complete Example

This example defines a minimal 8x16 font with two glyphs: space (U+0020) and the letter A (U+0041).

```
STARTFONT 2.1
COMMENT Example BDF font with 2 glyphs
FONT -Example-Demo-Medium-R-Normal--16-120-75-75-C-80-ISO10646-1
SIZE 12 75 75
FONTBOUNDINGBOX 8 16 0 -3
STARTPROPERTIES 10
FOUNDRY "Example"
FAMILY_NAME "Demo"
WEIGHT_NAME "Medium"
SLANT "R"
SETWIDTH_NAME "Normal"
SPACING "C"
CHARSET_REGISTRY "ISO10646"
CHARSET_ENCODING "1"
FONT_ASCENT 13
FONT_DESCENT 3
ENDPROPERTIES
CHARS 2
STARTCHAR space
ENCODING 32
SWIDTH 500 0
DWIDTH 8 0
BBX 8 16 0 -3
BITMAP
00
00
00
00
00
00
00
00
00
00
00
00
00
00
00
00
ENDCHAR
STARTCHAR A
ENCODING 65
SWIDTH 500 0
DWIDTH 8 0
BBX 8 13 0 0
BITMAP
00
18
3C
66
66
C3
C3
FF
C3
C3
C3
C3
00
ENDCHAR
ENDFONT
```

### Walkthrough of the "A" Glyph

The glyph `A` has `BBX 8 13 0 0`, meaning the bitmap is 8 pixels wide, 13 pixels tall, starts at the origin (offX=0), and its bottom edge sits on the baseline (offY=0).

Decoding each hex row to binary (8 pixels per row, 1 byte per row):

```
Hex   Binary     Pixels (# = ink, . = blank)
00    00000000   ........
18    00011000   ...##...
3C    00111100   ..####..
66    01100110   .##..##.
66    01100110   .##..##.
C3    11000011   ##....##
C3    11000011   ##....##
FF    11111111   ########
C3    11000011   ##....##
C3    11000011   ##....##
C3    11000011   ##....##
C3    11000011   ##....##
00    00000000   ........
```

With `FONT_ASCENT 13` and `bbxOffY 0`, `bbxHeight 13`:

```
rasterY = 13 - 0 - 13 = 0
```

So the glyph bitmap's top row starts at row 0 of the character cell (the very top). The 13 rows of bitmap data span from the top of the cell to the baseline row. The 3 rows of `FONT_DESCENT` below the baseline are not covered by this glyph's bitmap since it does not descend.

### The Space Glyph

The space glyph has `BBX 8 16 0 -3`, covering the entire character cell (ascent + descent = 13 + 3 = 16), with all rows set to `00`. Its `DWIDTH 8 0` still advances the cursor by 8 pixels. Alternatively, a space glyph could use a smaller BBX (even `BBX 0 0 0 0` with zero bitmap rows) since it has no ink; the full-cell BBX is just one common convention.

---

## Parsing Notes

- Lines are terminated by newline (`\n`). Carriage return + newline (`\r\n`) should also be accepted.
- Leading and trailing whitespace on lines should be tolerated.
- Keywords are case-sensitive (always uppercase).
- Property names are case-sensitive.
- Hex digits in BITMAP rows may be uppercase or lowercase; writers should prefer uppercase.
- The `CHARS` count must match the actual number of glyph blocks. Some lenient parsers tolerate mismatches.
- Glyphs may appear in any order; they are not required to be sorted by encoding.
- Multiple glyphs may share the same `ENCODING` value, though this is unusual and some tools will use the last occurrence.
- There is no explicit line length limit, but practically no line exceeds a few hundred characters.
- The properties section may be absent entirely. If present, `STARTPROPERTIES` must be followed by exactly the declared number of property lines before `ENDPROPERTIES`.

## Writing Notes

- Always start with `STARTFONT 2.1`.
- `FONTBOUNDINGBOX` should be computed as the tightest bounding box enclosing all glyph BBXes:
  - `fbbxOffX = min(all bbxOffX)`
  - `fbbxOffY = min(all bbxOffY)`
  - `fbbxWidth = max(all bbxOffX + bbxWidth) - fbbxOffX`
  - `fbbxHeight = max(all bbxOffY + bbxHeight) - fbbxOffY`
- Write `CHARS` with the exact number of glyphs that follow.
- Each BITMAP row must have exactly `ceil(bbxWidth / 8) * 2` hex characters.
- Ensure padding bits (the unused trailing bits in the last byte of each row) are zero.
- Terminate the file with `ENDFONT` followed by a final newline.
- Ensure `FONT_ASCENT` and `FONT_DESCENT` are set in properties; most renderers require them.
- `SWIDTH` can be computed from `DWIDTH` using: `SWIDTH_x = round(DWIDTH_x * 1000 * 72 / (pointSize * xResolution))`.

## Character Set Conventions

Common `CHARSET_REGISTRY` / `CHARSET_ENCODING` pairs:

| Registry | Encoding | Meaning |
|----------|----------|---------|
| `ISO8859` | `1` | Latin-1 Western European |
| `ISO8859` | `2` | Latin-2 Central European |
| `ISO8859` | `5` | Cyrillic |
| `ISO8859` | `7` | Greek |
| `ISO8859` | `9` | Latin-5 Turkish |
| `ISO8859` | `15` | Latin-9 (Latin-1 with Euro sign) |
| `ISO10646` | `1` | Unicode (full BMP and beyond) |
| `JISX0208.1983` | `0` | Japanese |
| `KSC5601.1987` | `0` | Korean |
| `FontSpecific` | `0` | Custom encoding with no standard mapping |

For Unicode fonts, use `ISO10646-1` and set `ENCODING` to the Unicode codepoint for each glyph.

## References

- Adobe. "Glyph Bitmap Distribution Format (BDF) Specification", Version 2.1, 1993.
- Adobe. "Glyph Bitmap Distribution Format (BDF) Specification", Version 2.2, 1993 (adds METRICSSET, SWIDTH1, DWIDTH1, VVECTOR).
- X.Org Foundation. X Logical Font Description (XLFD) convention.
