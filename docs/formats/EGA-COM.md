# EGA/VGA .COM Font Loader Format (Pete Kvitek)

DOS .COM executables that contain an x86 loader stub and raw EGA/VGA bitmap font data. Created by Pete Kvitek's font tools (1988-1989). The loader uses BIOS INT 10h/AH=11h to install the font into EGA/VGA character RAM.

## Overview

These files are self-executing: running them on DOS loads the font into the video card. For our purposes, we need to extract the raw bitmap data and the font height.

## File Structure

```
[0x0000]  JMP instruction (E9 xx xx) — jumps to loader entry point
[0x0003]  Version string (null-terminated ASCII)
[...]     Loader x86 code
[...]     Raw font bitmap data (256 × height bytes)
[EOF]     End of file (font data typically ends exactly at EOF)
```

### Version Strings

| String | Height | Notes |
|--------|--------|-------|
| `EGA text font loader v2.0xA` | 14 | EGA 8×14 fonts |
| `8x16 font driver v3.0xa` | 16 | VGA 8×16 fonts |
| `8x8 font driver v...` | 8 | CGA/EGA 8×8 fonts |

## Font Data

The font bitmap data is always:
- **256 glyphs** (codepoints 0-255, CP437 ordering)
- **8 pixels wide** (1 byte per row, MSB = leftmost pixel)
- **Height**: 8, 14, or 16 pixels (determined from loader code or version string)
- **Row-major**: each glyph is `height` consecutive bytes
- Total size: `256 × height` bytes

The font data is located at the end of the file. For most files it ends exactly at EOF; some have a few trailing bytes of padding.

## Detecting Font Height

### Method 1: INT 10h Pattern (v2.x loaders)

Search for the byte sequence that sets up the BIOS font load call:

```
B8 00 11    MOV AX, 1100h     ; Load user text font
BB xx HH    MOV BX, HH00h     ; BH = height, BL = block (0)
B9 00 01    MOV CX, 0100h     ; 256 characters
BA 00 00    MOV DX, 0000h     ; First character = 0
CD 10       INT 10h            ; BIOS video call
```

The font height is at the byte marked `HH` (the high byte of the BX operand, 5 bytes after the `B8 00 11` start).

### Method 2: Tail Scan

Calculate `fileSize - 256 × height` for each candidate height (16, 14, 8). Verify by checking that:
- Character 32 (space) is all zero bytes
- Character 65 ('A') has a reasonable number of non-zero rows

### Method 3: Version String

Parse the version string at offset 3 for dimension hints like "8x16" or "8x14".

## Locating Font Data

### From INT 10h Pattern

The `MOV BP, xxxx` instruction immediately before the INT 10h sequence gives the in-memory offset of the font data. Since COM files load at offset 0x100, the file offset is:

```
fileOffset = BP_value - 0x100
```

### From File End

For most files, the font data ends exactly at EOF:

```
fontDataOffset = fileSize - (256 × height)
```

## Character Set

The font uses standard DOS CP437 encoding (same as the existing `cp437` codepage).

## Differences Between Loader Versions

| Version | Loader Size | Height | Notes |
|---------|-------------|--------|-------|
| v2.0x   | ~371 bytes  | 14     | EGA fonts, uses INT 10h/AX=1100h directly |
| v2.05   | ~379 bytes  | 14     | Slightly larger loader |
| v3.0x   | ~569 bytes  | 16     | VGA fonts, more complex loader with video card detection |

The v3 loader includes additional code to detect the video card type and may use different INT 10h subfunctions, but the font data format is identical.

## Example

For an 8×14 EGA font file of 3955 bytes:
- Loader: 371 bytes (offsets 0x0000-0x0172)
- Font data: 3584 bytes (offsets 0x0173-0x0F72) = 256 × 14
- Character 'A' (codepoint 65) at offset 0x0173 + 65 × 14 = 0x0553

## References

- Pete I. Kvitek, EGA text font loader (1988)
- IBM EGA/VGA BIOS INT 10h documentation, function AH=11h
