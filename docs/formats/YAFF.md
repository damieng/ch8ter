# YAFF (Yet Another Font Format)

YAFF is a human-readable text-based bitmap font format. It supports metadata, Unicode codepoints, and named glyphs.

## Format

Plain text, line-oriented. The file consists of metadata key-value pairs followed by glyph blocks.

### Metadata

Non-indented lines with a colon and a value are metadata:

```
name: My Font
spacing: character-cell
cell-size: 8x16
```

Common metadata keys: `name`, `spacing`, `cell-size`, `family`, `foundry`, `copyright`, `notice`.

Metadata lines have the format `key: value` where `value` is non-empty.

### Glyph Labels

Non-indented lines with a colon and **no value** start a glyph block. Several label formats are supported:

| Format | Example | Meaning |
|--------|---------|---------|
| `0xNN:` | `0x41:` | Hex codepoint (65 = 'A') |
| `u+NNNN:` | `u+0041:` | Unicode codepoint |
| `name:` | `default:` | Named glyph (no codepoint) |

### Bitmap Rows

Lines starting with whitespace (spaces or tabs) following a glyph label are bitmap rows:

- `@` = pixel set (1)
- `.` = pixel unset (0)
- Leading whitespace is stripped before parsing

All glyphs should have the same dimensions (width × height), determined from the first glyph.

### Comments

Lines starting with `#` are comments and ignored. Blank lines are also ignored.

## Parsing Rules

1. Skip blank lines and `#` comments
2. Non-indented `key: value` (with non-empty value) → metadata
3. Non-indented `label:` (with empty value, no spaces in label) → start new glyph
4. Parse label as `0xNN`, `u+NNNN`, or named glyph
5. Indented lines → bitmap rows for current glyph (trim whitespace, read `@`/`.`)
6. Character range spans lowest to highest codepoint found
7. Named glyphs (no codepoint) are parsed but not mapped to the font grid

## Example

```
name: Example Font

# ASCII space
0x20:
    ........
    ........
    ........
    ........
    ........
    ........
    ........
    ........

0x21:
    ...@....
    ...@....
    ...@....
    ...@....
    ...@....
    ........
    ...@....
    ........

u+0041:
    ..@@....
    .@..@...
    .@..@...
    .@@@@...
    .@..@...
    .@..@...
    .@..@...
    ........

default:
    @@@@@@@@
    @......@
    @......@
    @......@
    @......@
    @......@
    @......@
    @@@@@@@@
```

## Limitations

- Fixed-width, fixed-height glyphs only
- No proportional width support (no per-glyph advance width)
- No baseline, ascent, or descent metrics
- Named glyphs have no standard codepoint assignment

## References

- YAFF format by Rob Hagemans (monobit project)
