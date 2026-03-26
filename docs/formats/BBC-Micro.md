# BBC Micro Soft-Font Format (VDU23)

BBC Micro soft-fonts are binary streams of VDU23 character definition commands. Each command redefines one character in the user-definable range. The format has no header — it is simply a sequence of 10-byte VDU23 commands, possibly interleaved with other data (e.g., `*FX20` ASCII text commands).

## VDU23 Command (10 bytes each)

| Offset | Size | Type  | Field     | Notes |
|--------|------|-------|-----------|-------|
| 0      | 1    | UInt8 | marker    | Always `0x17` (VDU23) |
| 1      | 1    | UInt8 | charCode  | Character code (typically 32-255) |
| 2      | 8    | UInt8[]| rows     | 8 rows of bitmap data, top to bottom |

### Pixel Layout

Each glyph is 8x8 pixels. Each row is 1 byte, MSBit = leftmost pixel:

```
Bit 7 = leftmost pixel
Bit 6 = second pixel
...
Bit 0 = rightmost pixel
```

## File Structure

```
[optional ASCII commands (*FX20, etc.)]
[0x17] [charCode] [8 bytes of bitmap]    <- VDU23 command 1
[0x17] [charCode] [8 bytes of bitmap]    <- VDU23 command 2
...
```

Characters can appear in any order. Non-VDU23 bytes between commands are skipped. The file may begin with ASCII text (e.g., `*FX20,5` commands that configure the character set on the BBC Micro).

## Detection

A file is identified as a BBC soft-font by scanning for `0x17` marker bytes followed by a character code >= 32, with at least 10 bytes available for each command. A minimum of 4 valid VDU23 sequences is required for confident detection.

## Glyph Range

The character range is determined dynamically from the lowest and highest `charCode` values found in the file. Characters not defined by any VDU23 command within that range are left blank.

## Limitations

- Fixed 8x8 pixel glyphs
- No font metadata, name, or proportional width support
- Character codes outside 32-255 are technically valid but unusual
- No explicit glyph count — determined by scanning the file

## Example

To define the letter 'A' (character code 65):

```
0x17  0x41  0x18  0x24  0x42  0x42  0x7E  0x42  0x42  0x00
 |     |     |     |     |     |     |     |     |     |
VDU23  'A'  row0  row1  row2  row3  row4  row5  row6  row7
```

## References

- BBC Micro User Guide: VDU23 command
- Acorn MOS documentation
