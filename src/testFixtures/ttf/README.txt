Bitmap-only TrueType reproducers for ThorVG's sfnt loader.

tvg-bitmap-only-apple.ttf     Apple layout: sfnt version 'true'; tables OS/2 bdat bhed bloc cmap maxp name post.
                              No head, hhea, hmtx, glyf or loca.
tvg-bitmap-only-opentype.ttf  OpenType layout: sfnt version 0x00010000; tables EBDT EBLC OS/2 cmap head hhea hmtx
                              maxp name post. No glyf or loca.

Both carry one 16 ppem, 1-bit strike with glyphs .notdef, space, A, B (cmap: U+0020, U+0041, U+0042).
Built from scratch by build_repro.py (fontTools 4.67.0). No third-party font data. CC0 1.0: no rights reserved.

bitmap_probe.cpp loads each file with tvg::Text::load(), sets it with Text::font(), draws "AB" at size 32 into a
128x48 SwCanvas and counts non-transparent pixels.
