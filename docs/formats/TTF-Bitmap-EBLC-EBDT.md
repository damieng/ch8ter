# TTF/OTF Embedded Bitmap Tables: EBLC + EBDT

Implementation reference for the OpenType/TrueType embedded bitmap system.
Apple equivalents: `bloc` (= EBLC) and `bdat` (= EBDT).
Color extensions: `CBLC` (= EBLC) and `CBDT` (= EBDT, adds formats 17-19).

---

## 1. TTF/OTF File Structure Basics

All multi-byte values are **big-endian**.

### 1.1 Table Directory (at byte 0 of file, or per-font in TTC)

| Offset | Type   | Name           | Description |
|--------|--------|----------------|-------------|
| 0      | uint32 | sfntVersion    | `0x00010000` = TrueType outlines, `0x4F54544F` ('OTTO') = CFF outlines |
| 4      | uint16 | numTables      | Number of table records that follow |
| 6      | uint16 | searchRange    | `(2**floor(log2(numTables))) * 16` |
| 8      | uint16 | entrySelector  | `floor(log2(numTables))` |
| 10     | uint16 | rangeShift     | `numTables * 16 - searchRange` |
| 12     | TableRecord[numTables] | tableRecords | Sorted ascending by tag |

Total header size: 12 bytes, followed by `numTables * 16` bytes of records.

### 1.2 Table Record (16 bytes each)

| Offset | Type     | Name     | Description |
|--------|----------|----------|-------------|
| 0      | Tag (4B) | tableTag | Four ASCII bytes, e.g. `EBLC`, `EBDT` |
| 4      | uint32   | checksum | Table checksum |
| 8      | uint32   | offset   | Byte offset from beginning of font file |
| 12     | uint32   | length   | Actual byte length (unpadded) |

All tables must start on 4-byte boundaries; padding between tables is zero-filled.

### 1.3 Locating EBLC and EBDT

Scan the table records for tags `EBLC` (0x45424C43) and `EBDT` (0x45424454).
The `offset` field gives absolute file position; `length` gives the table size.
For Apple AAT fonts, look for `bloc` (0x626C6F63) and `bdat` (0x62646174) instead.
For color bitmaps, look for `CBLC` and `CBDT`.

---

## 2. EBLC Table (Embedded Bitmap Location)

### 2.1 EBLC Header

| Offset | Type   | Name         | Description |
|--------|--------|--------------|-------------|
| 0      | uint16 | majorVersion | = 2 |
| 2      | uint16 | minorVersion | = 0 |
| 4      | uint32 | numSizes     | Number of BitmapSize records |
| 8      | BitmapSize[numSizes] | bitmapSizes | One per strike |

Note: CBLC uses majorVersion = 3, minorVersion = 0.
Apple `bloc` uses version `0x00020000` (Fixed 2.0).

### 2.2 BitmapSize Record (48 bytes)

One per bitmap strike (a complete set of glyphs at a specific ppem size).

| Offset | Type            | Size | Name                    | Description |
|--------|-----------------|------|-------------------------|-------------|
| 0      | Offset32        | 4    | indexSubtableListOffset | Offset from start of EBLC to IndexSubtableList |
| 4      | uint32          | 4    | indexSubtableListSize   | Total bytes of IndexSubtableList + all its IndexSubtables |
| 8      | uint32          | 4    | numberOfIndexSubtables  | Count of IndexSubtableRecord entries |
| 12     | uint32          | 4    | colorRef                | Reserved, set to 0 |
| 16     | SbitLineMetrics | 12   | hori                    | Horizontal line metrics |
| 28     | SbitLineMetrics | 12   | vert                    | Vertical line metrics |
| 40     | uint16          | 2    | startGlyphIndex         | Lowest glyph ID in this strike |
| 42     | uint16          | 2    | endGlyphIndex           | Highest glyph ID in this strike |
| 44     | uint8           | 1    | ppemX                   | Horizontal pixels per em |
| 45     | uint8           | 1    | ppemY                   | Vertical pixels per em |
| 46     | uint8           | 1    | bitDepth                | 1, 2, 4, 8 (or 32 for CBLC color) |
| 47     | int8            | 1    | flags                   | Bitmap flags (see below) |

**Bitmap flags** (BitmapSize.flags):

| Mask | Name               | Description |
|------|--------------------|-------------|
| 0x01 | HORIZONTAL_METRICS | SmallGlyphMetrics are horizontal |
| 0x02 | VERTICAL_METRICS   | SmallGlyphMetrics are vertical |
| 0xFC | Reserved           | Must be 0 |

**Bit depth values**:

| Value | Meaning |
|-------|---------|
| 1     | Black/white (1 bit per pixel) |
| 2     | 4 levels of gray (2 bits per pixel) |
| 4     | 16 levels of gray (4 bits per pixel) |
| 8     | 256 levels of gray (8 bits per pixel) |
| 32    | BGRA color (CBLC/CBDT only, 4 bytes per pixel) |

### 2.3 SbitLineMetrics Record (12 bytes)

| Offset | Type  | Name                   | Description |
|--------|-------|------------------------|-------------|
| 0      | int8  | ascender               | Ascender in pixels |
| 1      | int8  | descender              | Descender in pixels (typically negative) |
| 2      | uint8 | widthMax               | Maximum glyph width in pixels |
| 3      | int8  | caretSlopeNumerator    | Rise of caret slope |
| 4      | int8  | caretSlopeDenominator  | Run of caret slope |
| 5      | int8  | caretOffset            | Caret offset in pixels |
| 6      | int8  | minOriginSB            | Min left side bearing (horiBearingX) |
| 7      | int8  | minAdvanceSB           | Min right side bearing (= advance - width - horiBearingX) |
| 8      | int8  | maxBeforeBL            | Max value of horiBearingY |
| 9      | int8  | minAfterBL             | Min value of (horiBearingY - height) |
| 10     | int8  | pad1                   | Padding, set to 0 |
| 11     | int8  | pad2                   | Padding, set to 0 |

### 2.4 Glyph Metrics Structures

#### BigGlyphMetrics (8 bytes)

Defines metrics for both horizontal and vertical layout.

| Offset | Type  | Name         | Description |
|--------|-------|--------------|-------------|
| 0      | uint8 | height       | Number of rows in bitmap |
| 1      | uint8 | width        | Number of columns in bitmap |
| 2      | int8  | horiBearingX | Horizontal origin to left edge of bitmap |
| 3      | int8  | horiBearingY | Horizontal origin to top edge of bitmap |
| 4      | uint8 | horiAdvance  | Horizontal advance width in pixels |
| 5      | int8  | vertBearingX | Vertical origin to left edge of bitmap |
| 6      | int8  | vertBearingY | Vertical origin to top edge of bitmap |
| 7      | uint8 | vertAdvance  | Vertical advance width in pixels |

#### SmallGlyphMetrics (5 bytes)

Defines metrics for one direction only (determined by BitmapSize.flags).

| Offset | Type  | Name     | Description |
|--------|-------|----------|-------------|
| 0      | uint8 | height   | Number of rows in bitmap |
| 1      | uint8 | width    | Number of columns in bitmap |
| 2      | int8  | bearingX | Origin to left edge (horiz) or top edge (vert) |
| 3      | int8  | bearingY | Origin to top edge (horiz) or left edge (vert) |
| 4      | uint8 | advance  | Advance width in pixels |

### 2.5 IndexSubtableList

Located at `EBLC_start + BitmapSize.indexSubtableListOffset`.
Contains an array of IndexSubtableRecord, count = `BitmapSize.numberOfIndexSubtables`.

#### IndexSubtableRecord (8 bytes)

| Offset | Type     | Size | Name                | Description |
|--------|----------|------|---------------------|-------------|
| 0      | uint16   | 2    | firstGlyphIndex     | First glyph ID in this range |
| 2      | uint16   | 2    | lastGlyphIndex      | Last glyph ID in this range (inclusive) |
| 4      | Offset32 | 4    | indexSubtableOffset  | Offset to IndexSubtable from start of IndexSubtableList |

Records must be sorted by firstGlyphIndex. Ranges must not overlap.

The actual IndexSubtable is at:
`EBLC_start + BitmapSize.indexSubtableListOffset + record.indexSubtableOffset`

### 2.6 IndexSubHeader (common to all 5 formats, 8 bytes)

| Offset | Type     | Size | Name            | Description |
|--------|----------|------|-----------------|-------------|
| 0      | uint16   | 2    | indexFormat      | 1, 2, 3, 4, or 5 |
| 2      | uint16   | 2    | imageFormat      | EBDT glyph bitmap format (1,2,5,6,7,8,9, or 17,18,19 for CBDT) |
| 4      | Offset32 | 4    | imageDataOffset  | Offset to image data from start of EBDT table |

### 2.7 IndexSubtable Format 1: Variable metrics, 4-byte offsets

For contiguous glyph ranges with per-glyph metrics stored in EBDT.

| Offset | Type     | Name | Description |
|--------|----------|------|-------------|
| 0      | IndexSubHeader (8B) | header | indexFormat = 1 |
| 8      | Offset32[N] | sbitOffsets | Offsets into EBDT from imageDataOffset |

`N = lastGlyphIndex - firstGlyphIndex + 2` (one extra for end-of-last-glyph).

Actual EBDT position of glyph `g`:
`header.imageDataOffset + sbitOffsets[g - firstGlyphIndex]`

Data size for glyph `g`:
`sbitOffsets[g - firstGlyphIndex + 1] - sbitOffsets[g - firstGlyphIndex]`

A glyph with data size = 0 is not present (missing glyph).

### 2.8 IndexSubtable Format 2: Constant metrics, constant image size

For contiguous glyph ranges where all glyphs share identical metrics.
Metrics stored here in EBLC; EBDT contains only raw image data (imageFormat 5).

| Offset | Type            | Size | Name       | Description |
|--------|-----------------|------|------------|-------------|
| 0      | IndexSubHeader  | 8    | header     | indexFormat = 2 |
| 8      | uint32          | 4    | imageSize  | Byte size of each glyph's image data |
| 12     | BigGlyphMetrics | 8    | bigMetrics | Shared metrics for all glyphs in range |

EBDT position of glyph `g`:
`header.imageDataOffset + (g - firstGlyphIndex) * imageSize`

### 2.9 IndexSubtable Format 3: Variable metrics, 2-byte offsets

Same as Format 1 but with 16-bit offsets (saves space, limited to < 64KB data per range).

| Offset | Type     | Name | Description |
|--------|----------|------|-------------|
| 0      | IndexSubHeader (8B) | header | indexFormat = 3 |
| 8      | Offset16[N] | sbitOffsets | 2-byte offsets into EBDT from imageDataOffset |

`N = lastGlyphIndex - firstGlyphIndex + 2`

May need 1 padding uint16 at end if N is odd (to maintain 4-byte alignment).

### 2.10 IndexSubtable Format 4: Variable metrics, sparse glyph IDs

For non-contiguous glyph ranges with per-glyph metrics in EBDT.

| Offset | Type     | Size | Name | Description |
|--------|----------|------|------|-------------|
| 0      | IndexSubHeader | 8 | header | indexFormat = 4 |
| 8      | uint32   | 4    | numGlyphs | Number of actual glyphs |
| 12     | GlyphIdOffsetPair[numGlyphs+1] | variable | glyphArray | Sorted by glyphID |

#### GlyphIdOffsetPair (4 bytes)

| Offset | Type     | Size | Name       | Description |
|--------|----------|------|------------|-------------|
| 0      | uint16   | 2    | glyphID    | Glyph ID |
| 2      | Offset16 | 2    | sbitOffset | Offset into EBDT from imageDataOffset |

One extra entry at end provides end-of-data for the last glyph.

### 2.11 IndexSubtable Format 5: Constant metrics, sparse glyph IDs

For non-contiguous glyph ranges where all glyphs share identical metrics.

| Offset | Type            | Size | Name         | Description |
|--------|-----------------|------|--------------|-------------|
| 0      | IndexSubHeader  | 8    | header       | indexFormat = 5 |
| 8      | uint32          | 4    | imageSize    | Byte size of each glyph's image data |
| 12     | BigGlyphMetrics | 8    | bigMetrics   | Shared metrics for all glyphs |
| 20     | uint32          | 4    | numGlyphs    | Number of glyphs |
| 24     | uint16[numGlyphs] | var | glyphIdArray | Sorted by glyph ID |

May need 1 padding uint16 if numGlyphs is odd (4-byte alignment).

EBDT position of glyph at array index `i`:
`header.imageDataOffset + i * imageSize`

---

## 3. EBDT Table (Embedded Bitmap Data)

### 3.1 EBDT Header

| Offset | Type   | Name         | Description |
|--------|--------|--------------|-------------|
| 0      | uint16 | majorVersion | = 2 |
| 2      | uint16 | minorVersion | = 0 |

CBDT uses majorVersion = 3, minorVersion = 0.
Apple `bdat` uses version `0x00020000` (Fixed 2.0).

The rest of the table is a blob of glyph bitmap data at offsets specified by EBLC.
No alignment requirements beyond byte alignment.

### 3.2 Bitmap Data Encoding Rules

- Most significant bit of first byte = top-left pixel.
- Pixels proceed left-to-right across each row.
- 1-bit: `1` = black, `0` = white.
- If bitDepth > 1, each pixel's bits are stored consecutively (e.g. 2-bit: 2 consecutive bits per pixel, 4-bit: 4 consecutive bits, 8-bit: full byte per pixel).
- All of a row's pixels are stored consecutively.

**Byte-aligned** (formats 1, 6): Each row is padded to end on a byte boundary.
Row byte count = `ceil(width * bitDepth / 8)`.
Total image bytes = `rowBytes * height`.

**Bit-aligned** (formats 2, 5, 7): Rows are NOT padded; next row starts at the very next bit.
The entire glyph image is padded to a byte boundary at the end.
Total image bytes = `ceil(width * height * bitDepth / 8)`.

### 3.3 Format 1: SmallGlyphMetrics + byte-aligned data

| Field | Type              | Size     | Description |
|-------|-------------------|----------|-------------|
| 0     | SmallGlyphMetrics | 5 bytes  | Per-glyph metrics |
| 5     | uint8[]           | variable | Byte-aligned image data |

Image data size = `ceil(width * bitDepth / 8) * height`

### 3.4 Format 2: SmallGlyphMetrics + bit-aligned data

| Field | Type              | Size     | Description |
|-------|-------------------|----------|-------------|
| 0     | SmallGlyphMetrics | 5 bytes  | Per-glyph metrics |
| 5     | uint8[]           | variable | Bit-aligned image data |

Image data size = `ceil(width * height * bitDepth / 8)`

### 3.5 Format 3: Obsolete

Not supported in OpenType. Do not use.

### 3.6 Format 4: Compressed (Apple only)

Apple-specific compressed format using modified Huffman coding.
**Not supported in OpenType.** Structure:

| Field | Type   | Description |
|-------|--------|-------------|
| 0     | uint32 | whiteTreeOffset |
| 4     | uint32 | blackTreeOffset |
| 8     | uint32 | glyphDataOffset |

### 3.7 Format 5: Bit-aligned image data only (no metrics)

| Field | Type    | Size     | Description |
|-------|---------|----------|-------------|
| 0     | uint8[] | variable | Bit-aligned image data |

Used with IndexSubtable format 2 or 5 (which store the shared metrics in EBLC).
Image data size = `ceil(width * height * bitDepth / 8)`
(width/height come from BigGlyphMetrics in the IndexSubtable).

Note: On Windows, the rasterizer recalculates metrics for format 5 bitmaps,
allowing correct ABC widths even if bitmaps include whitespace padding.

### 3.8 Format 6: BigGlyphMetrics + byte-aligned data

| Field | Type            | Size     | Description |
|-------|-----------------|----------|-------------|
| 0     | BigGlyphMetrics | 8 bytes  | Per-glyph metrics (both directions) |
| 8     | uint8[]         | variable | Byte-aligned image data |

Image data size = `ceil(width * bitDepth / 8) * height`

### 3.9 Format 7: BigGlyphMetrics + bit-aligned data

| Field | Type            | Size     | Description |
|-------|-----------------|----------|-------------|
| 0     | BigGlyphMetrics | 8 bytes  | Per-glyph metrics (both directions) |
| 8     | uint8[]         | variable | Bit-aligned image data |

Image data size = `ceil(width * height * bitDepth / 8)`

### 3.10 Format 8: SmallGlyphMetrics + composite components

Composite glyph made of other bitmap glyphs.

| Field | Type              | Size     | Description |
|-------|-------------------|----------|-------------|
| 0     | SmallGlyphMetrics | 5 bytes  | Metrics for the composite |
| 5     | uint8             | 1 byte   | Padding (alignment to 16-bit boundary) |
| 6     | uint16            | 2 bytes  | numComponents |
| 8     | EbdtComponent[numComponents] | 4*N | Component array |

### 3.11 Format 9: BigGlyphMetrics + composite components

| Field | Type            | Size     | Description |
|-------|-----------------|----------|-------------|
| 0     | BigGlyphMetrics | 8 bytes  | Metrics for the composite |
| 8     | uint16          | 2 bytes  | numComponents |
| 10    | EbdtComponent[numComponents] | 4*N | Component array |

### 3.12 EbdtComponent Record (4 bytes)

| Offset | Type   | Size | Name    | Description |
|--------|--------|------|---------|-------------|
| 0      | uint16 | 2    | glyphID | Glyph ID of the component bitmap |
| 2      | int8   | 1    | xOffset | X position of component's top-left in composite |
| 3      | int8   | 1    | yOffset | Y position of component's top-left in composite |

Component glyphIDs are looked up via EBLC to find their bitmap data.
Nested composites (composite of composites) are allowed.

### 3.13 CBDT-only Formats (Color Bitmaps)

These require CBLC (not EBLC) with bitDepth = 32 for uncompressed BGRA,
or any bitDepth for PNG-compressed data.

#### Format 17: SmallGlyphMetrics + PNG data

| Field | Type              | Size     | Description |
|-------|-------------------|----------|-------------|
| 0     | SmallGlyphMetrics | 5 bytes  | Per-glyph metrics |
| 5     | uint32            | 4 bytes  | dataLen |
| 9     | uint8[dataLen]    | variable | Raw PNG data |

#### Format 18: BigGlyphMetrics + PNG data

| Field | Type            | Size     | Description |
|-------|-----------------|----------|-------------|
| 0     | BigGlyphMetrics | 8 bytes  | Per-glyph metrics |
| 8     | uint32          | 4 bytes  | dataLen |
| 12    | uint8[dataLen]  | variable | Raw PNG data |

#### Format 19: PNG data only (metrics in CBLC)

| Field | Type           | Size     | Description |
|-------|----------------|----------|-------------|
| 0     | uint32         | 4 bytes  | dataLen |
| 4     | uint8[dataLen] | variable | Raw PNG data |

PNG data may only contain chunks: IHDR, PLTE, tRNS, sRGB, IDAT, IEND.
Colors must be sRGB. For 32-bit uncompressed: pixels are BGRA, pre-multiplied alpha.

---

## 4. Format Summary Matrix

| EBDT Format | Metrics Type      | Metrics Location | Image Data     | Composite? |
|-------------|-------------------|------------------|----------------|------------|
| 1           | SmallGlyphMetrics | EBDT             | Byte-aligned   | No         |
| 2           | SmallGlyphMetrics | EBDT             | Bit-aligned    | No         |
| 3           | (obsolete)        | -                | -              | -          |
| 4           | (Apple only)      | -                | Huffman compr. | No         |
| 5           | BigGlyphMetrics   | EBLC (fmt 2/5)  | Bit-aligned    | No         |
| 6           | BigGlyphMetrics   | EBDT             | Byte-aligned   | No         |
| 7           | BigGlyphMetrics   | EBDT             | Bit-aligned    | No         |
| 8           | SmallGlyphMetrics | EBDT             | Components     | Yes        |
| 9           | BigGlyphMetrics   | EBDT             | Components     | Yes        |
| 17          | SmallGlyphMetrics | CBDT             | PNG            | No         |
| 18          | BigGlyphMetrics   | CBDT             | PNG            | No         |
| 19          | BigGlyphMetrics   | CBLC (fmt 2/5)  | PNG            | No         |

| EBLC IndexFormat | Metrics     | Glyph Range  | Offset Size |
|------------------|-------------|--------------|-------------|
| 1                | In EBDT     | Contiguous   | 4 bytes     |
| 2                | In EBLC     | Contiguous   | Computed     |
| 3                | In EBDT     | Contiguous   | 2 bytes     |
| 4                | In EBDT     | Sparse       | 2 bytes     |
| 5                | In EBLC     | Sparse       | Computed     |

---

## 5. Apple bloc/bdat vs OpenType EBLC/EBDT

| Aspect | OpenType | Apple AAT |
|--------|----------|-----------|
| Location table tag | `EBLC` | `bloc` |
| Data table tag | `EBDT` | `bdat` |
| Version | 2.0 (uint16 major + uint16 minor) | `0x00020000` (Fixed 2.0) |
| Format 4 (Huffman) | Not supported | Supported |
| Format 3 (obsolete) | Not supported | Not supported |
| Formats 8, 9 (composite) | Supported | Not documented in Apple spec |
| IndexSubtable formats | 1-5 | 1-3 documented (4-5 may be supported) |
| Sparse bitmap restriction | Allowed | macOS historically required all glyphs present |

The table binary formats are otherwise identical. A parser can handle both by
simply accepting either tag pair.

---

## 6. EBSC Table (Embedded Bitmap Scaling)

Optional table that defines bitmap strikes generated by scaling existing strikes.

### EBSC Header

| Offset | Type   | Name         | Description |
|--------|--------|--------------|-------------|
| 0      | uint16 | majorVersion | = 2 |
| 2      | uint16 | minorVersion | = 0 |
| 4      | uint32 | numSizes     | Number of BitmapScale records |
| 8      | BitmapScale[numSizes] | strikes | |

### BitmapScale Record (28 bytes)

| Offset | Type            | Size | Name             | Description |
|--------|-----------------|------|------------------|-------------|
| 0      | SbitLineMetrics | 12   | hori             | Line metrics after scaling |
| 12     | SbitLineMetrics | 12   | vert             | Line metrics after scaling |
| 24     | uint8           | 1    | ppemX            | Target horizontal ppem |
| 25     | uint8           | 1    | ppemY            | Target vertical ppem |
| 26     | uint8           | 1    | substitutePpemX  | Source strike ppemX to scale from |
| 27     | uint8           | 1    | substitutePpemY  | Source strike ppemY to scale from |

---

## 7. Parsing Pseudocode

```
1. Parse table directory, find EBLC offset and EBDT offset.
2. Read EBLC header: majorVersion, minorVersion, numSizes.
3. For each BitmapSize record (i = 0..numSizes-1):
   a. Read 48-byte BitmapSize at EBLC + 8 + i*48.
   b. Check ppemX, ppemY, bitDepth to find desired strike.
4. Once strike found:
   a. Go to EBLC + bitmapSize.indexSubtableListOffset.
   b. Read numberOfIndexSubtables IndexSubtableRecords (8 bytes each).
   c. Binary search records for one where firstGlyphIndex <= glyphID <= lastGlyphIndex.
5. Compute IndexSubtable position:
   subtablePos = EBLC + bitmapSize.indexSubtableListOffset + record.indexSubtableOffset
6. Read IndexSubHeader (8 bytes) to get indexFormat, imageFormat, imageDataOffset.
7. Based on indexFormat (1-5), compute the glyph's offset within EBDT:
   - Format 1: ebdtPos = EBDT + imageDataOffset + sbitOffsets[glyphID - firstGlyphIndex]
   - Format 2: ebdtPos = EBDT + imageDataOffset + (glyphID - firstGlyphIndex) * imageSize
   - Format 3: same as 1 but with uint16 offsets
   - Format 4: look up glyphID in glyphArray, use sbitOffset
   - Format 5: find glyphID's index i in glyphIdArray, ebdtPos = EBDT + imageDataOffset + i * imageSize
8. Read glyph data at ebdtPos according to imageFormat.
```

---

## 8. Bit Depth Pixel Encoding Detail

For a glyph of width W and height H at bitDepth D:

**Byte-aligned row size**: `rowBytes = ceil(W * D / 8)`
**Byte-aligned image size**: `rowBytes * H`
**Bit-aligned image size**: `ceil(W * H * D / 8)`

Examples for an 8-wide, 10-tall glyph:

| bitDepth | Bits/row | Byte-aligned row | Byte-aligned total | Bit-aligned total |
|----------|----------|-------------------|--------------------|-------------------|
| 1        | 8        | 1 byte            | 10 bytes           | 10 bytes          |
| 2        | 16       | 2 bytes           | 20 bytes           | 20 bytes          |
| 4        | 32       | 4 bytes           | 40 bytes           | 40 bytes          |
| 8        | 64       | 8 bytes           | 80 bytes           | 80 bytes          |

For a 7-wide, 10-tall glyph at 1-bit:
- Byte-aligned: `ceil(7/8)` = 1 byte/row, 10 bytes total (1 wasted bit per row)
- Bit-aligned: `ceil(70/8)` = 9 bytes total (2 wasted bits at very end)

For a 7-wide, 10-tall glyph at 2-bit:
- Byte-aligned: `ceil(14/8)` = 2 bytes/row, 20 bytes total (2 wasted bits per row)
- Bit-aligned: `ceil(140/8)` = 18 bytes total (4 wasted bits at very end)

For 32-bit (CBDT only, BGRA pre-multiplied alpha):
- Each pixel = 4 bytes in order: Blue, Green, Red, Alpha
- Row size = W * 4 bytes (always byte-aligned naturally)
- Total = W * H * 4 bytes

---

## 9. Limitations

- Glyph IDs are uint16, limiting to 65535 glyph indices
- ppemX/ppemY are uint8, limiting strike sizes to 1-255 ppem
- SmallGlyphMetrics bearings are int8 (-128 to 127 pixels); BigGlyphMetrics same
- Width/height in glyph metrics are uint8 (max 255 pixels per glyph)
- IndexSubtable format 3 and 4 use 16-bit offsets, limiting to 64KB of image data per range
- Composite glyphs (formats 8, 9) reference other glyphs by ID; circular references must be guarded against
- No built-in Unicode mapping; glyph IDs must be resolved via the `cmap` table

---

## References

- [OpenType EBLC specification](https://learn.microsoft.com/en-us/typography/opentype/spec/eblc) -- Embedded Bitmap Location table
- [OpenType EBDT specification](https://learn.microsoft.com/en-us/typography/opentype/spec/ebdt) -- Embedded Bitmap Data table
- [OpenType EBSC specification](https://learn.microsoft.com/en-us/typography/opentype/spec/ebsc) -- Embedded Bitmap Scaling table
- [OpenType CBLC specification](https://learn.microsoft.com/en-us/typography/opentype/spec/cblc) -- Color Bitmap Location (EBLC v3)
- [OpenType CBDT specification](https://learn.microsoft.com/en-us/typography/opentype/spec/cbdt) -- Color Bitmap Data (EBDT v3, adds PNG formats)
- [OpenType font file structure](https://learn.microsoft.com/en-us/typography/opentype/spec/otff) -- Table directory and table record format
- [Apple TrueType Reference: bloc](https://developer.apple.com/fonts/TrueType-Reference-Manual/RM06/Chap6bloc.html) -- Apple equivalent of EBLC
- [Apple TrueType Reference: bdat](https://developer.apple.com/fonts/TrueType-Reference-Manual/RM06/Chap6bdat.html) -- Apple equivalent of EBDT
