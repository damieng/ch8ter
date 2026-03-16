# Acorn .draw Bitmap Font Format

A simple text-based bitmap font format using `#` and `-` characters to represent set and unset pixels. Originally associated with Acorn RISC OS systems.

## Format

Plain text, line-oriented. The file consists of a sequence of glyph blocks, each starting with a hex label line followed by tab-indented bitmap rows.

### Glyph Block

```
HH:
	####----
	#--#----
	####----
	#--#----
	####----
```

Where:
- `HH:` is a hex codepoint label (e.g., `41:` for 'A'), followed by a colon
- Each subsequent line is tab-indented (`\t`) and contains the pixel row
- `#` = pixel set (1)
- `-` = pixel unset (0)
- All glyphs must have the same width and height (fixed-pitch, fixed-height)

### Alternative Inline Syntax

The first bitmap row may appear on the same line as the label, separated by a tab:

```
41:	####----
	#--#----
	####----
```

### Comments and Blank Lines

Lines that don't match a label pattern and aren't tab-indented are ignored (treated as comments or separators).

## Parsing Rules

1. A line matching `/^[0-9a-fA-F]+:\s*$/` starts a new glyph block
2. A line matching `/^[0-9a-fA-F]+:\t.+$/` starts a new glyph with inline first row
3. Lines starting with `\t` append rows to the current glyph
4. All other lines reset the current glyph context
5. Glyph dimensions are determined from the first glyph found
6. Character range spans from the lowest to highest codepoint present
7. Missing codepoints within the range are left as blank (zero) glyphs

## Example

```
20:
	--------
	--------
	--------
	--------
	--------
	--------
	--------
	--------

21:
	---#----
	---#----
	---#----
	---#----
	---#----
	--------
	---#----
	--------

41:
	--##----
	-#--#---
	-#--#---
	-####---
	-#--#---
	-#--#---
	-#--#---
	--------
```

This defines an 8×8 font with space (0x20), exclamation mark (0x21), and A (0x41).

## Limitations

- Fixed-width, fixed-height glyphs only (monospace)
- No metadata (font name, metrics, etc.)
- No proportional width support
- Hex labels only support integer codepoints
- Character set determined by which codepoints are present
