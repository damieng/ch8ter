# Webfonter Code Review — TODO

## Critical

- [x] **Windows FNT docs: bitmap storage layout was wrong** — described as row-major but actual format is byte-column-major. *Fixed in this review.*
- [x] **PSF1 parser: mode flag constants are swapped** — `PSF1_MODE_HAS_TAB` is defined as `0x01` and `PSF1_MODE_512` as `0x04`, but the Linux kernel spec defines `PSF1_MODE512 = 0x01` and `PSF1_MODEHASTAB = 0x02`. The doc was correct; the parser constants are wrong. Works by coincidence when all mode bits are set together but will misparse fonts with mode `0x01` (512 glyphs, no unicode table). (`psfParser.ts:14-16`)

## High Priority — Code

- [x] **Circular dependency store.ts ↔ persistence.ts** — `store.ts` imports from `persistence.ts` and vice versa. Extract shared utilities (e.g., `buildGlyphLookup`) to a separate module.
- [x] **Duplicate `buildGlyphLookup()`** — identical function in `store.ts:178` and `persistence.ts:88`. Extract to shared module.
- [x] **No bounds check on Windows FNT character table reads** — `windowsFntParser.ts:106-111` reads from DataView without verifying offsets are within buffer bounds. Could overread on malformed files.
- [x] **`ComSingleResult` type: TSR tagged as `source: 'ega'`** — `comOpener.ts:13-14` has both EGA and TSR results using `source: 'ega'`. TSR should have its own source tag.
- [x] **No error boundary in app** — render errors crash the entire app. Add an error boundary wrapper at the root.
- [x] **Persistence: `atob()` can throw on corrupted localStorage** — `persistence.ts:79-84` calls `atob()` without try/catch inside `fromBase64()`. Corrupted data will crash instead of gracefully degrading.
- [x] **Persistence: silent failures on restore** — `persistence.ts:148-150` swallows errors with empty catch blocks. User gets blank state with no notification.

## High Priority — Docs

- [x] **BBC Micro format: missing docs** — parser exists (`bbcParser.ts`) but no doc file. *Created in this review.*
- [ ] **TTF Bitmap EBLC/EBDT: docs exist but no parser** — `TTF-Bitmap-EBLC-EBDT.md` exists but format is unimplemented. Consider adding a note to the doc or removing it.

## Medium Priority — Code

- [ ] **Inconsistent baseline conventions across parsers** — `fontLoad.ts:114` uses `height-2`, `amigaFontParser.ts:195` uses `baseline-1`, `gdosFontParser.ts:201` uses `topLine-1`, `pdbFontParser.ts:200` uses `ascent-1`. Document the convention or normalize.
- [x] **Truncated last glyph silently dropped** — `store.ts:91`: if `fontData.length % bpg !== 0`, the last partial glyph is silently discarded. Should pad or warn.
- [ ] **`remapFontForCharset()` is 90 lines of complex logic** — `store.ts:398-487`. Three passes, nested loops, no tests. Consider refactoring into smaller functions.
- [ ] **Writers lack shared interface** — some accept `FontInstance`, others accept `FontConversionData` fields. No abstract base defining the pattern.
- [x] **Dialogs lack focus management** — no focus trapping, no `role="dialog"`, no focus-return-on-close in `NewFontDialog.tsx`, `ConfirmDialog.tsx`, etc.
- [x] **BasePane useEffect missing `windowId` dependency** — `BasePane.tsx:102` has `[aspectRatio]` but handler uses `windowId`. Stale closure risk.
- [ ] **`charsets.ts` is 606 lines** — ~400 lines of charset override tables. Consider extracting to JSON data file.

## Low Priority

- [ ] **Input validation in simpler parsers** — `drawParser.ts` assumes uniform glyph size, `bbcParser.ts` doesn't validate char code range.
- [ ] **No test framework** — complex algorithms like `remapFontForCharset()`, TTF generation, and charset remapping have no test coverage.
- [x] **`saveFont()` double-wraps Uint8Array** — `store.ts:627-628` creates `new Uint8Array(data)` when data is already a Uint8Array. Harmless but wasteful.
- [ ] **`useClickOutside` refs dependency** — `useClickOutside.ts:26` may cause unnecessary listener re-registration when inline arrays are passed.
- [ ] **PreviewPane is 496 lines** — could extract ColorSwatch and text selection logic to separate files.
