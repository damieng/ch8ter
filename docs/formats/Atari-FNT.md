# Atari 8-bit .fnt Bitmap Font Format

Raw 1024-byte bitmap font files used by Atari 400/800/XL/XE 8-bit computers. These are identical in structure to .ch8 files but use the Atari internal (screen code) character ordering rather than ASCII.

## Format

The file is exactly **1024 bytes** — 128 glyphs × 8 bytes per glyph. There is no header.

### Pixel Layout

Each glyph is 8×8 pixels, stored as 8 bytes (one byte per row, MSB = leftmost pixel), concatenated sequentially. This is the same raw format as .ch8 files.

### Identification

Atari 8-bit .fnt files can be distinguished from other .fnt formats by:

1. **Exact file size**: 1024 bytes
2. **First 8 bytes are zero**: The first glyph is space (internal code 0), which has no set pixels

Other .fnt formats (Windows FNT, GDOS) have headers and are never exactly 1024 bytes.

## Character Ordering: Internal (Screen) Codes

The glyphs are stored in Atari **internal code** order, NOT ATASCII order. The Atari uses three distinct code systems:

- **ATASCII**: The interchange code (what BASIC uses, analogous to ASCII)
- **Internal/Screen codes**: The order glyphs are stored in the character set ROM/RAM
- **Keyboard codes**: Raw codes from the keyboard hardware

The font file uses internal codes. The mapping between internal codes and ATASCII is:

| Internal Code | ATASCII Range | Characters |
|---------------|---------------|------------|
| 0-63          | 0x20-0x5F     | Space ! " # ... _ (punctuation, digits, uppercase) |
| 64-95         | 0x00-0x1F     | Graphics characters (hearts, box-drawing, etc.) |
| 96-127        | 0x60-0x7F     | ♦ a b c ... z ♠ | arrow symbols |

### Conversion Formula

```
Internal to ATASCII:
  if internal < 64:  atascii = internal + 32
  if internal < 96:  atascii = internal - 64
  else:              atascii = internal

ATASCII to Internal:
  if atascii < 32:   internal = atascii + 64
  if atascii < 96:   internal = atascii - 32
  else:              internal = atascii
```

## Inverse Video (Characters 128-255)

The font file only contains 128 glyphs. Characters 128-255 are **inverse video** variants of characters 0-127, produced automatically by the ANTIC chip (it inverts all pixels). They are not stored in the font file.

## Glyph Table

| Internal | ATASCII | Glyph | Unicode |
|----------|---------|-------|---------|
| 0        | 0x20    | (space) | U+0020 |
| 1        | 0x21    | !     | U+0021 |
| 2        | 0x22    | "     | U+0022 |
| ...      | ...     | ...   | ... |
| 31       | 0x3F    | ?     | U+003F |
| 32       | 0x40    | @     | U+0040 |
| 33       | 0x41    | A     | U+0041 |
| ...      | ...     | ...   | ... |
| 63       | 0x5F    | _     | U+005F |
| 64       | 0x00    | ♥     | U+2665 |
| 65       | 0x01    | ├     | U+251C |
| 66       | 0x02    | 🮇     | U+1FB87 |
| 67       | 0x03    | ┘     | U+2518 |
| 68       | 0x04    | ┤     | U+2524 |
| 69       | 0x05    | ┐     | U+2510 |
| 70       | 0x06    | ╱     | U+2571 |
| 71       | 0x07    | ╲     | U+2572 |
| 72       | 0x08    | ◢     | U+25E2 |
| 73       | 0x09    | ▗     | U+2597 |
| 74       | 0x0A    | ◣     | U+25E3 |
| 75       | 0x0B    | ▝     | U+259D |
| 76       | 0x0C    | ▘     | U+2598 |
| 77       | 0x0D    | 🮂     | U+1FB82 |
| 78       | 0x0E    | ▂     | U+2582 |
| 79       | 0x0F    | ▖     | U+2596 |
| 80       | 0x10    | ♣     | U+2663 |
| 81       | 0x11    | ┌     | U+250C |
| 82       | 0x12    | ─     | U+2500 |
| 83       | 0x13    | ┼     | U+253C |
| 84       | 0x14    | •     | U+2022 |
| 85       | 0x15    | ▄     | U+2584 |
| 86       | 0x16    | ▎     | U+258E |
| 87       | 0x17    | ┬     | U+252C |
| 88       | 0x18    | ┴     | U+2534 |
| 89       | 0x19    | ▌     | U+258C |
| 90       | 0x1A    | └     | U+2514 |
| 91       | 0x1B    | ␛     | U+241B |
| 92       | 0x1C    | ↑     | U+2191 |
| 93       | 0x1D    | ↓     | U+2193 |
| 94       | 0x1E    | ←     | U+2190 |
| 95       | 0x1F    | →     | U+2192 |
| 96       | 0x60    | ♦     | U+2666 |
| 97-122   | 0x61-0x7A | a-z | U+0061-U+007A |
| 123      | 0x7B    | ♠     | U+2660 |
| 124      | 0x7C    | \|    | U+007C |
| 125      | 0x7D    | 🢰     | U+1F8B0 |
| 126      | 0x7E    | ◀     | U+25C0 |
| 127      | 0x7F    | ▶     | U+25B6 |

## Example

The space glyph (internal code 0) occupies bytes 0-7 of the file — all zeros. The 'A' glyph (internal code 33) occupies bytes 264-271 (33 × 8 = 264).

## References

- [ATASCII on Wikipedia](https://en.wikipedia.org/wiki/ATASCII)
- Atari 400/800 Hardware Manual
- Mapping the Atari (Ian Chadwick, 1983)
