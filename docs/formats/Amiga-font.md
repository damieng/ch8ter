# Amiga Bitmap Font Format

Amiga bitmap fonts are stored as a directory structure with multiple files. The format originated in the Amiga OS graphics and diskfont libraries. All multi-byte integers are **big-endian** (Motorola 68000).

## Directory Layout

```
FONTS:
  topaz.font              <- Font contents file (index)
  topaz/
    8                     <- Bitmap font data for 8pt
    9                     <- Bitmap font data for 9pt
    11                    <- Bitmap font data for 11pt
```

The `.font` file is the index; the subdirectory (same name without `.font`) contains the actual bitmap data files, named by their pixel height.

## The .font File (Font Contents Header)

The `.font` file is a simple index listing all available sizes. It consists of a header followed by an array of font content entries.

### FontContentsHeader

| Offset | Size | Type   | Field      | Notes |
|--------|------|--------|------------|-------|
| 0      | 2    | UInt16 | fch_FileID | Magic number: 0x0F00 (FCH_ID) or 0x0F02 (TFCH_ID for tagged) |
| 2      | 2    | UInt16 | fch_NumEntries | Number of FontContents entries |

### FontContents Entry (260 bytes each)

For `fch_FileID == 0x0F00` (standard):

| Offset | Size | Type    | Field        | Notes |
|--------|------|---------|--------------|-------|
| 0      | 256  | char[]  | fc_FileName  | Null-terminated path relative to FONTS: (e.g., "topaz/8") |
| 256    | 2    | UInt16  | fc_YSize     | Font height in pixels |
| 258    | 1    | UInt8   | fc_Style     | Style flags (see below) |
| 259    | 1    | UInt8   | fc_Flags     | Font flags (see below) |

### TFontContents Entry (264 bytes each)

For `fch_FileID == 0x0F02` (tagged, supports extra metrics):

| Offset | Size | Type    | Field          | Notes |
|--------|------|---------|----------------|-------|
| 0      | 256  | char[]  | tfc_FileName   | Null-terminated path |
| 256    | 2    | UInt16  | tfc_TagCount   | Number of supplementary tags (usually 0) |
| 258    | 2    | UInt16  | tfc_YSize      | Font height in pixels |
| 260    | 1    | UInt8   | tfc_Style      | Style flags |
| 261    | 1    | UInt8   | tfc_Flags      | Font flags |

Tags, if present, follow as `{UInt32 tag, UInt32 data}` pairs.

## Individual Font Files (e.g., `topaz/8`)

Each font file in the size subdirectory is an **Amiga Hunk executable** containing a `DiskFontHeader` structure followed by the font bitmap data. The hunk wrapper is required because Amiga OS loads fonts as relocatable executables using the standard Amiga LoadSeg mechanism.

### Amiga Hunk Wrapper

Font files are wrapped in the standard Amiga hunk format:

| Value      | Type   | Meaning |
|------------|--------|---------|
| 0x000003F3 | UInt32 | HUNK_HEADER |
| 0x00000000 | UInt32 | No resident library names |
| 0x00000001 | UInt32 | Table size (1 hunk) |
| 0x00000000 | UInt32 | First hunk slot |
| 0x00000000 | UInt32 | Last hunk slot |
| N          | UInt32 | Hunk size in longwords |
| 0x000003E9 | UInt32 | HUNK_DATA |
| N          | UInt32 | Data size in longwords |
| ...        |        | Hunk data (DiskFontHeader + font data) |
| 0x000003F2 | UInt32 | HUNK_END |

Optionally, a HUNK_RELOC32 (0x000003EC) section may appear between the data and end, containing relocation entries that fix up the internal pointers in the DiskFontHeader (tf_CharData, tf_CharLoc, etc.).

### DiskFontHeader

The hunk data begins with a `DiskFontHeader` followed by the `TextFont` structure. The `DiskFontHeader` adds disk-specific fields around the in-memory `TextFont`.

| Offset | Size | Type   | Field          | Notes |
|--------|------|--------|----------------|-------|
| 0      | 4    | UInt32 | dfh_NextSegment | Next segment pointer (0 on disk) |
| 4      | 4    | UInt32 | dfh_ReturnCode | Return code (0 on disk) |

This is followed by an embedded `Node` structure (the `ln_` fields from `tf_Message.mn_Node`):

| Offset | Size | Type   | Field       | Notes |
|--------|------|--------|-------------|-------|
| 8      | 4    | APTR   | ln_Succ     | 0 on disk |
| 12     | 4    | APTR   | ln_Pred     | 0 on disk |
| 16     | 1    | UInt8  | ln_Type     | NT_FONT (12) |
| 17     | 1    | Int8   | ln_Pri      | Priority |
| 18     | 4    | APTR   | ln_Name     | Pointer to font name (relocated) |

Then the `Message` fields:

| Offset | Size | Type   | Field         | Notes |
|--------|------|--------|---------------|-------|
| 22     | 4    | APTR   | mn_ReplyPort  | 0 on disk |
| 26     | 2    | UInt16 | mn_Length     | Message length |

Then the `TextFont` fields:

| Offset | Size | Type   | Field         | Notes |
|--------|------|--------|---------------|-------|
| 28     | 2    | UInt16 | tf_YSize      | Font height in pixels |
| 30     | 1    | UInt8  | tf_Style      | Style flags |
| 31     | 1    | UInt8  | tf_Flags      | Font flags |
| 32     | 2    | UInt16 | tf_XSize      | Nominal character width |
| 34     | 2    | UInt16 | tf_Baseline   | Pixels from top to baseline |
| 36     | 2    | UInt16 | tf_BoldSmear  | Pixels to smear for bold |
| 38     | 2    | UInt16 | tf_Accessors  | Access count (0 on disk) |
| 40     | 1    | UInt8  | tf_LoChar     | First character code |
| 41     | 1    | UInt8  | tf_HiChar     | Last character code |
| 42     | 4    | APTR   | tf_CharData   | Pointer to bitmap data (relocated) |
| 46     | 2    | UInt16 | tf_Modulo     | Bytes per row in the bitmap |
| 48     | 4    | APTR   | tf_CharLoc    | Pointer to character location table (relocated) |
| 52     | 4    | APTR   | tf_CharSpace  | Pointer to spacing table, or NULL (relocated) |
| 56     | 4    | APTR   | tf_CharKern   | Pointer to kerning table, or NULL (relocated) |

After the TextFont, additional DiskFontHeader fields:

| Offset | Size | Type   | Field         | Notes |
|--------|------|--------|---------------|-------|
| 60     | 2    | UInt16 | dfh_Revision  | Font revision number |
| 62     | 1    | UInt8  | dfh_Segment   | Segment identifier |
| 63     | 1    | UInt8  | dfh_Pad       | Padding |
| 64     | 4+   | char[] | dfh_Name      | Font name (null-terminated), referenced by ln_Name |

**Total header size:** Variable, but typically 64 + name length (padded to word boundary).

### Pointer Relocation

The pointer fields (`tf_CharData`, `tf_CharLoc`, `tf_CharSpace`, `tf_CharKern`, `ln_Name`) are stored as **offsets from the start of the hunk data** on disk. The HUNK_RELOC32 section lists these offsets so the OS can fix them up to absolute addresses when loading. When parsing from a file, treat these as offsets from the start of the hunk data block.

## Bitmap Data (tf_CharData)

A single raster bitmap containing all glyphs side-by-side, similar to GDOS .fnt and PalmOS NFNT formats.

- **Row-major**: each row is `tf_Modulo` bytes wide
- **MSB-first**: bit 7 of each byte is the leftmost pixel
- **Height**: `tf_YSize` rows
- Total size: `tf_Modulo × tf_YSize` bytes

The bitmap includes all characters from `tf_LoChar` to `tf_HiChar` plus one extra "replacement" character (displayed for undefined characters).

## Character Location Table (tf_CharLoc)

An array of `(tf_HiChar - tf_LoChar + 2)` entries, each 4 bytes:

| Size | Type   | Field     | Notes |
|------|--------|-----------|-------|
| 2    | UInt16 | bitOffset | Bit offset from start of bitmap row to this character |
| 2    | UInt16 | bitWidth  | Width of this character in bits (pixels) |

The character's pixels in the bitmap span from bit position `bitOffset` to `bitOffset + bitWidth - 1` within each row.

To extract pixel (x, y) for character index `i`:
```
bitOff = charLoc[i].bitOffset + x
byteIdx = charData + y * tf_Modulo + (bitOff >> 3)
bit = (data[byteIdx] >> (7 - (bitOff & 7))) & 1
```

The extra entry at index `(tf_HiChar - tf_LoChar + 1)` is the replacement/default character glyph.

## Character Spacing Table (tf_CharSpace)

Optional (NULL for monospace fonts). An array of `(tf_HiChar - tf_LoChar + 2)` Int16 values giving the advance width in pixels for each character. If NULL, all characters advance by `tf_XSize`.

## Character Kerning Table (tf_CharKern)

Optional (NULL for most fonts). An array of `(tf_HiChar - tf_LoChar + 2)` Int16 values giving the horizontal offset (in pixels) to apply before rendering each character. Positive values shift right, negative shift left.

The total advance width for a character is: `tf_CharKern[i] + tf_CharSpace[i]` (or `tf_XSize` if both are NULL).

## Style Flags (tf_Style)

| Bit | Value | Name           | Meaning |
|-----|-------|----------------|---------|
| 0   | 0x01  | FSF_UNDERLINED | Underlined |
| 1   | 0x02  | FSF_BOLD       | Bold |
| 2   | 0x04  | FSF_ITALIC     | Italic |
| 3   | 0x08  | FSF_EXTENDED   | Extended (extra wide) |
| 6   | 0x40  | FSF_COLORFONT  | Color font (AmigaOS 3.0+) |
| 7   | 0x80  | FSF_TAGGED     | Tagged font (has extra data) |

## Font Flags (tf_Flags)

| Bit | Value | Name             | Meaning |
|-----|-------|------------------|---------|
| 0   | 0x01  | FPF_ROMFONT      | ROM-resident font |
| 1   | 0x02  | FPF_DISKFONT     | Loaded from disk |
| 2   | 0x04  | FPF_REVPATH      | Right-to-left rendering |
| 3   | 0x08  | FPF_TALLDOT      | Designed for hires (640×200) |
| 4   | 0x10  | FPF_WIDEDOT      | Designed for interlaced (320×400) |
| 5   | 0x20  | FPF_PROPORTIONAL | Proportional spacing |
| 6   | 0x40  | FPF_DESIGNED     | Designed at this size (not scaled) |
| 7   | 0x80  | FPF_REMOVED      | Font has been removed (internal) |

## Character Range

- `tf_LoChar`: First character (typically 32 for space)
- `tf_HiChar`: Last character (typically 255)
- Number of characters: `tf_HiChar - tf_LoChar + 1`
- Plus 1 replacement glyph at the end (for undefined characters)
- Character set is Amiga OS default (ISO 8859-1 with some differences in 0x80-0x9F)

## Example: topaz.font

```
topaz.font (FontContentsHeader):
  FileID: 0x0F00
  NumEntries: 2
  Entry 0: "topaz/8", YSize=8, Style=0, Flags=FPF_ROMFONT|FPF_DESIGNED
  Entry 1: "topaz/9", YSize=9, Style=0, Flags=FPF_ROMFONT|FPF_DESIGNED

topaz/8 (Hunk executable):
  HUNK_HEADER -> HUNK_DATA -> DiskFontHeader:
    tf_YSize: 8
    tf_XSize: 8
    tf_Baseline: 6
    tf_LoChar: 32
    tf_HiChar: 255
    tf_Modulo: 56 (448 pixels / 8 = 56 bytes per row)
    tf_CharData: -> 56 × 8 = 448 bytes of bitmap data
    tf_CharLoc: -> 225 entries × 4 bytes = 900 bytes
    tf_CharSpace: NULL (monospace)
    tf_CharKern: NULL
  HUNK_RELOC32 -> relocation entries for pointers
  HUNK_END
```

## Parsing Notes

1. Read the `.font` file to enumerate available sizes
2. For each size, read the corresponding file in the subdirectory
3. Parse the Amiga hunk wrapper to find HUNK_DATA
4. Apply HUNK_RELOC32 relocations to fix up pointers (or treat pointer fields as offsets from hunk data start)
5. Read the TextFont header fields
6. Extract glyphs using tf_CharLoc to find each character's position in the tf_CharData bitmap
7. If tf_CharSpace is present, read proportional advance widths

## References

- AmigaOS SDK: `<libraries/diskfont.h>`, `<graphics/text.h>`
- [AmigaOS Wiki - Graphics Library and Text](https://wiki.amigaos.net/wiki/Graphics_Library_and_Text)
- Inside Amiga Graphics, Chapter on Fonts
