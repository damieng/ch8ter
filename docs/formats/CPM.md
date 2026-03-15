# CP/M Plus .COM Font Format (PSF2AMS)

CP/M Plus font files are Z80 executables (.com) that contain a font loader stub followed by raw bitmap font data. The format was created by the PSF2AMS tool for use with Amstrad CPC, PCW, and Spectrum +3 machines running CP/M Plus.

## File Structure

```
[0x0000]  Z80 loader code (512 bytes)
[0x0200]  Font bitmap data (256 × height bytes)
```

## Header / Loader (512 bytes)

The first 512 bytes are a Z80 executable stub that loads the font data into the system character set. The only field of interest for parsing is:

| Offset | Size | Type  | Field       | Notes |
|--------|------|-------|-------------|-------|
| 0x2F   | 1    | UInt8 | glyphHeight | Pixel height of each glyph (typically 8) |

All other bytes are Z80 machine code and should be preserved when round-tripping. The loader template is specific to PSF2AMS and handles the CRT+ driver interface.

## Font Data (starts at offset 512)

- **256 glyphs** (codepoints 0-255), stored sequentially
- **8 pixels wide** (1 byte per row, MSB = leftmost pixel)
- **`glyphHeight` rows per glyph**
- Total font data size: `256 × glyphHeight` bytes

### Pixel Layout

Each glyph is `glyphHeight` bytes, one byte per row, top to bottom:

```
Bit 7 = leftmost pixel
Bit 6 = second pixel
...
Bit 0 = rightmost pixel
```

## Total File Size

```
totalSize = 512 + (256 × glyphHeight)
```

For an 8-pixel-tall font: `512 + 2048 = 2560 bytes`

## Example

For an 8×8 font, glyph for 'A' (codepoint 65) would be at offset:

```
offset = 512 + (65 × 8) = 1032 (0x0408)
```

The 8 bytes at that offset represent the 8 rows of the 'A' glyph.

## Limitations

- Fixed 8-pixel width
- Fixed 256 glyph count (codepoints 0-255)
- No metadata, font name, or proportional width support
- Requires the PSF2AMS loader template for the .com file to be executable

## Writing

When creating a .com file:
1. Start with the 512-byte PSF2AMS loader template
2. Set byte at offset 0x2F to the glyph height
3. Append 256 × glyphHeight bytes of font bitmap data (pad with zeros if fewer glyphs available)

## References

- PSF2AMS by Damien Guard — converts PSF fonts for CP/M Plus systems
