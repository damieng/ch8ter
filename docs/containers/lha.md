# LHA / LZH Archive Format — Design & Implementation Reference

## Overview

LHA (also known as LZH, LHarc) is an archive format combining LZSS sliding-window compression with Huffman coding. Created by Haruyasu Yoshizaki (Yoshi) in 1988, it was the dominant archive format on Amiga and widely used on DOS/Windows in Japan.

- `.lha`, `.lzh`, `.lzs` are the same container format (different naming conventions)
- All multi-byte integers are **little-endian**
- Bits within the compressed bitstream are read **MSB-first** (big-endian bit order)

---

## File Structure

An LHA archive has **no global file header**. It is a sequence of member entries followed by a single `0x00` byte (end-of-archive marker).

```
[Entry 1 header][Entry 1 compressed data]
[Entry 2 header][Entry 2 compressed data]
...
[0x00]  ← end of archive
```

### File Identification

No fixed magic at offset 0. Identify by the method ID at offset 2 of the first entry — a 5-byte ASCII string matching `-XX#-` where `XX` is the algorithm family and `#` is the variant (e.g. `-lh5-`).

---

## Header Levels

The header level byte determines parsing. Three levels are common (0, 1, 2); level 3 exists but is rare.

### Level 0

Oldest format. Total header size = `header_size + 2` bytes.

| Offset | Size | Field |
|--------|------|-------|
| 0 | 1 | `header_size` — byte count from offset 2 to end of header |
| 1 | 1 | Header checksum — sum of bytes [2..header_size+1] mod 256 |
| 2 | 5 | Method ID (ASCII, e.g. `-lh5-`) |
| 7 | 4 | Compressed size (uint32) |
| 11 | 4 | Uncompressed size (uint32) |
| 15 | 4 | MS-DOS timestamp |
| 19 | 1 | File attribute (DOS attribute byte) |
| 20 | 1 | Header level = `0x00` |
| 21 | 1 | Filename length (N) |
| 22 | N | Filename (may contain path separators) |
| 22+N | 2 | CRC-16 of uncompressed data |

Compressed data follows immediately after, `compressed_size` bytes.

### Level 1

Adds OS ID and extended header chain. Total base header = `header_size + 2` bytes.

| Offset | Size | Field |
|--------|------|-------|
| 0 | 1 | `header_size` |
| 1 | 1 | Header checksum |
| 2 | 5 | Method ID |
| 7 | 4 | Skip size (compressed data + extended headers combined) |
| 11 | 4 | Uncompressed size (uint32) |
| 15 | 4 | MS-DOS timestamp |
| 19 | 1 | Reserved (`0x20`) |
| 20 | 1 | Header level = `0x01` |
| 21 | 1 | Filename length (N) |
| 22 | N | Filename (name only; path in extended headers) |
| 22+N | 2 | CRC-16 of uncompressed data |
| 24+N | 1 | OS ID |
| 25+N | 2 | Next extended header size (0 = none) |

Extended headers follow. Their total size is **subtracted from skip_size** to get actual compressed data length.

### Level 2

Modern format. No inline filename (comes from extended header 0x01).

| Offset | Size | Field |
|--------|------|-------|
| 0 | 2 | Total header size including extended headers (uint16) |
| 2 | 5 | Method ID |
| 7 | 4 | Compressed size (uint32) — actual compressed data only |
| 11 | 4 | Uncompressed size (uint32) |
| 15 | 4 | Unix timestamp (uint32) |
| 19 | 1 | Reserved |
| 20 | 1 | Header level = `0x02` |
| 21 | 2 | CRC-16 of uncompressed data |
| 23 | 1 | OS ID |
| 24 | 2 | Next extended header size |

### Level 3

Rare. Uses 4-byte extended header size fields.

| Offset | Size | Field |
|--------|------|-------|
| 0 | 2 | Word size (must be 4) |
| 2 | 5 | Method ID |
| 7 | 4 | Compressed size (uint32) |
| 11 | 4 | Uncompressed size (uint32) |
| 15 | 4 | Unix timestamp (uint32) |
| 19 | 1 | Reserved |
| 20 | 1 | Header level = `0x03` |
| 21 | 2 | CRC-16 of uncompressed data |
| 23 | 1 | OS ID |
| 24 | 4 | Total header length (uint32) |
| 28 | 4 | Next extended header size (uint32) |

---

## MS-DOS Timestamp

Used in level 0 and 1 headers. Two 16-bit words, little-endian:

**Time word (low 2 bytes, offset 15):**
| Bits | Field |
|------|-------|
| 0–4 | Seconds ÷ 2 (0–29 → 0–58) |
| 5–10 | Minutes (0–59) |
| 11–15 | Hours (0–23) |

**Date word (high 2 bytes, offset 17):**
| Bits | Field |
|------|-------|
| 0–4 | Day (1–31) |
| 5–8 | Month (1–12) |
| 9–15 | Year − 1980 |

---

## Extended Headers

Chained linked-list. Each header:

```
Level 1/2:  [uint16 next_size][uint8 type][data...]    (data = next_size - 3 bytes)
Level 3:    [uint32 next_size][uint8 type][data...]    (data = next_size - 5 bytes)
```

A `next_size` of 0 terminates the chain.

### Common Extended Header Types

| ID | Name | Content |
|----|------|---------|
| 0x00 | Header CRC | 2-byte CRC-16 of entire header + optional info |
| 0x01 | Filename | Variable-length filename string |
| 0x02 | Directory | Path string (uses `0xFF` as separator) |
| 0x3F | Comment | Variable-length comment |
| 0x41 | Windows timestamps | 3× 64-bit FILETIME (create, modify, access) |
| 0x42 | File sizes (64-bit) | 2× uint64 (compressed, uncompressed) |
| 0x50 | Unix permissions | uint16 permission mode |
| 0x51 | Unix GID/UID | uint16 GID + uint16 UID |
| 0x52 | Unix group name | String |
| 0x53 | Unix user name | String |
| 0x54 | Unix timestamp | uint32 time_t |

---

## CRC-16

LHA uses **CRC-16/IBM** (CRC-16-ARC):

| Parameter | Value |
|-----------|-------|
| Polynomial | 0x8005 (reflected: 0xA001) |
| Initial value | 0x0000 |
| Input reflected | Yes |
| Output reflected | Yes |
| Final XOR | 0x0000 |

```js
function makeCRC16Table() {
  const table = new Uint16Array(256);
  for (let i = 0; i < 256; i++) {
    let crc = i;
    for (let j = 0; j < 8; j++) {
      crc = (crc & 1) ? (crc >>> 1) ^ 0xA001 : crc >>> 1;
    }
    table[i] = crc;
  }
  return table;
}

function crc16(data, initial = 0) {
  const table = makeCRC16Table();
  let crc = initial;
  for (let i = 0; i < data.length; i++) {
    crc = (crc >>> 8) ^ table[(crc ^ data[i]) & 0xFF];
  }
  return crc;
}
```

The CRC is computed over the **uncompressed** file data. The level 0/1 header checksum is a simple byte sum mod 256.

---

## OS ID Values

| Char | Hex | OS |
|------|-----|-----|
| `M` | 0x4D | MS-DOS |
| `2` | 0x32 | OS/2 |
| `9` | 0x39 | OS-9 |
| `K` | 0x4B | OS/68K |
| `3` | 0x33 | OS/386 |
| `H` | 0x48 | HUMAN68K |
| `U` | 0x55 | Unix |
| `C` | 0x43 | CP/M |
| `F` | 0x46 | FLEX |
| `m` | 0x6D | Macintosh |
| `R` | 0x52 | Runser |
| `a` | 0x61 | Amiga |
| `A` | 0x41 | Atari |
| `w` | 0x77 | Windows (LHARK) |
| `J` | 0x4A | Java |
| ` ` | 0x20 | Generic/unknown |

---

## Compression Methods

| Method | Dictionary | Max Match | Algorithm | Notes |
|--------|-----------|-----------|-----------|-------|
| `-lh0-` | — | — | Store (uncompressed) | |
| `-lz4-` | — | — | Store (uncompressed) | LArc |
| `-lhd-` | — | — | Directory entry | No data payload |
| `-lzs-` | 2 KB | 17 | LZSS only | LArc |
| `-lz5-` | 4 KB | 17 | LZSS only | LArc |
| `-lh1-` | 4 KB | 60 | LZSS + dynamic Huffman | LHarc v1 |
| `-lh2-` | 8 KB | 256 | LZSS + dynamic Huffman | Obsolete |
| `-lh3-` | 8 KB | 256 | LZSS + static Huffman | Obsolete |
| `-lh4-` | 4 KB | 256 | LZSS + static Huffman | LHA v2 |
| `-lh5-` | 8 KB | 256 | LZSS + static Huffman | **Most common** |
| `-lh6-` | 32 KB | 256 | LZSS + static Huffman | LHA v2.66 |
| `-lh7-` | 64 KB | 256 | LZSS + static Huffman | LHA v2.67 |

### Priority for Implementation

1. **Must have:** `-lh0-` (store), `-lh5-` (overwhelmingly common), `-lhd-` (directories)
2. **Should have:** `-lh6-`, `-lh7-` (same algorithm as lh5, different constants)
3. **Nice to have:** `-lh4-`, `-lh1-`
4. **Low priority:** `-lzs-`, `-lz5-`, `-lh2-`, `-lh3-`

---

## Decompression: `-lh5-` / `-lh6-` / `-lh7-` Algorithm

These three methods use the same algorithm with different dictionary sizes. This is the critical path.

### Constants

| Constant | lh4 | lh5 | lh6 | lh7 | Description |
|----------|-----|-----|-----|-----|-------------|
| DICBIT | 12 | 13 | 15 | 16 | Log2 of dictionary size |
| Dict size | 4 KB | 8 KB | 32 KB | 64 KB | Sliding window |
| NP | 14 | 14 | 16 | 17 | Number of offset codes |
| PBIT | 4 | 4 | 5 | 5 | Bits to read offset count |

Shared constants:
- **NC** = 510 — number of code symbols (256 literals + 254 length codes)
- **THRESHOLD** = 3 — minimum match length
- **MAXMATCH** = 256 — maximum match length
- **NT** = 19 — codes in the "tree encoding" tree
- **TBIT** = 5 — bits to read NT count
- **CBIT** = 9 — bits to read NC count

### Block Structure

Compressed data is a sequence of blocks. Each block:

#### 1. Block size (16 bits)
Number of code symbols in this block.

#### 2. Temp tree ("tree of trees") — encodes code lengths for the code tree

- Read **TBIT** (5) bits → `nt_count`
- If `nt_count == 0`: read 5 bits → single code value; all symbols decode to this
- Otherwise: for each of `nt_count` symbols:
  - Read 3 bits → code length
  - If length == 7: read 1-bit extensions (increment length for each `1` bit until `0`)
  - After the 3rd symbol (index 2): read 2 bits → insert that many zero-length codes
- Build canonical Huffman table (8-bit lookup)

#### 3. Code tree (literal/length tree)

- Read **CBIT** (9) bits → `nc_count`
- If `nc_count == 0`: read 9 bits → single code value
- Otherwise: for each symbol, decode using temp tree:
  - Value 0: one zero-length code
  - Value 1: run of `3 + read(4 bits)` zero-length codes (3–18)
  - Value 2: run of `20 + read(9 bits)` zero-length codes (20–531)
  - Value ≥ 3: actual code length = `value - 2`
- Build canonical Huffman table (12-bit lookup)

#### 4. Offset tree (position/distance tree)

- Read **PBIT** (4 or 5) bits → `np_count`
- If `np_count == 0`: read PBIT bits → single code value
- Otherwise: same 3-bit + extension encoding as temp tree
- Build canonical Huffman table (8-bit lookup)

#### 5. Decode `blocksize` symbols

For each code:
1. Decode symbol from code tree
2. If `symbol < 256`: output literal byte
3. If `symbol >= 256`: copy command
   - `length = symbol - 256 + THRESHOLD` (i.e. `symbol - 253`)
   - Decode offset symbol from offset tree
   - Compute distance:
     - `offset_symbol == 0` → distance = 0
     - `offset_symbol == 1` → distance = 1
     - `offset_symbol >= 2` → distance = `(1 << (offset_symbol - 1)) + read(offset_symbol - 1 bits)`
   - Copy `length` bytes from ring buffer at `(write_pos - distance - 1)`, wrapping

### Canonical Huffman Table Construction

Build a direct-lookup table of `2^tablebits` entries:
- Codes with length ≤ tablebits: fill `2^(tablebits - length)` consecutive slots
- Codes with length > tablebits: build a binary tree in auxiliary `left[]`/`right[]` arrays, referenced from overflow table entries

### Bitstream Reader

Bits are consumed **MSB-first** from the byte stream. Maintain a bit buffer (at least 16 bits wide) and refill as needed.

```js
class BitReader {
  constructor(data) {
    this.data = data;
    this.pos = 0;       // byte position
    this.bitbuf = 0;    // bit buffer (use 32 bits)
    this.bitcount = 0;  // bits available in buffer
  }

  fillbuf(n) {
    while (this.bitcount < n) {
      this.bitbuf = (this.bitbuf << 8) | (this.pos < this.data.length ? this.data[this.pos++] : 0);
      this.bitcount += 8;
    }
  }

  peekbits(n) {
    this.fillbuf(n);
    return (this.bitbuf >>> (this.bitcount - n)) & ((1 << n) - 1);
  }

  getbits(n) {
    const val = this.peekbits(n);
    this.bitcount -= n;
    return val;
  }
}
```

---

## Decompression: `-lh1-` (Dynamic Huffman)

Uses adaptive Huffman coding (tree rebuilds on the fly).

- **314 code symbols** (256 literals + 58 length codes; max match = 60, threshold = 3)
- **627 tree nodes** (2 × 314 − 1)
- 4 KB dictionary (DICBIT = 12)

### Decoding Loop

1. Decode a symbol from the adaptive Huffman tree
2. Update the tree (increment frequency, sift nodes, rebuild when root freq ≥ 0x8000)
3. If `symbol < 256`: output literal
4. If `symbol >= 256`: copy command
   - `length = symbol - 256 + 3`
   - Read offset: decode upper 6 bits from fixed position table, read lower 6 bits directly
   - Copy from ring buffer

### Position Decoding (Fixed Tables)

Upper 6 bits of the 12-bit offset are encoded with variable-length codes (3–8 bits). Standard lookup tables `d_code[]` and `d_len[]` are used.

---

## Decompression: `-lzs-` (LArc, 2 KB)

Simple LZSS, no Huffman. Ring buffer of 2048 bytes initialized to `0x20` (space).

- Read 1 bit:
  - `1` → literal: read 8 bits, output byte
  - `0` → copy: read 11 bits (offset into ring buffer), read 4 bits + 2 (length 2–17)

---

## Decompression: `-lz5-` (LArc, 4 KB)

LZSS with flag bytes. Ring buffer of 4096 bytes with special initialization pattern.

- Read a **flag byte** (8 bits, controls next 8 commands, LSB first)
- For each bit:
  - `1` → literal: read 1 byte, output
  - `0` → copy: read 2 bytes → 12-bit offset + 4-bit length (length + 3, range 3–18)

---

## Compression: `-lh5-` / `-lh6-` / `-lh7-`

### Step 1: LZSS Match Finding

Scan input with a sliding window. For each position, find the longest match in the dictionary (min length = THRESHOLD = 3, max = MAXMATCH = 256).

**Match-finding strategies (in order of complexity):**
- **Hash chains** — hash 3-byte sequences, chain positions with same hash. Walk chain up to a depth limit. This is what the original LHA uses.
- **Binary search trees** — insert dictionary positions into a BST keyed by the string content. Faster for large windows.
- **Simple brute force** — scan entire dictionary for longest match. Slow but correct for initial implementation.

For each position, emit either:
- A literal byte (symbol 0–255)
- A (length, distance) pair → symbol = length - THRESHOLD + 256, distance encoded separately

### Step 2: Huffman Encoding

Divide the output into blocks. For each block:

1. **Count frequencies** of all code symbols (literals + lengths) and offset symbols
2. **Build Huffman trees** from frequencies (canonical form)
3. **Write block header:**
   - 16-bit block size (number of codes)
   - Temp tree (code lengths for the code-length tree, 3-bit + extension encoded)
   - Code tree (code lengths encoded via temp tree, with run-length for zeros)
   - Offset tree (same format as temp tree)
4. **Write codes** using the Huffman tables

### Block Size Selection

The original LHA uses blocks of ~16384 codes. Restarting with fresh Huffman tables periodically adapts to changing data statistics.

### Lazy Matching

For better compression, consider "lazy matching": when a match is found at position P, also check position P+1. If P+1 yields a longer match, emit a literal for P and use the match at P+1 instead.

---

## Directory Entries

- Method ID: `-lhd-`
- Compressed size: 0
- Uncompressed size: 0
- Filename/path in header or extended headers
- Symlinks (Unix): `-lhd-` entry with filename `linkname|target` and `S_IFLNK` in permissions

---

## Implementation Plan — JavaScript Modules

### Module Structure

```
src/containers/
  lha.ts              — Public API: parseLha(), writeLha()
  lhaBitReader.ts     — MSB-first bitstream reader
  lhaBitWriter.ts     — MSB-first bitstream writer
  lhaCrc.ts           — CRC-16/IBM implementation
  lhaHeader.ts        — Header parsing/writing (all levels)
  lhaHuffman.ts       — Canonical Huffman table build + decode/encode
  lhaDecompress.ts    — Decompressors for lh0/lh1/lh5/lh6/lh7
  lhaCompress.ts      — Compressors for lh0/lh5
  lhaTypes.ts         — TypeScript interfaces
```

### Type Definitions

```ts
interface LhaEntry {
  method: string;           // e.g. "-lh5-"
  compressedSize: number;
  uncompressedSize: number;
  filename: string;
  directory: string;
  timestamp: Date;
  crc: number;
  osId: number;
  headerLevel: number;
  isDirectory: boolean;
  data: Uint8Array;         // uncompressed file data
}

interface LhaArchive {
  entries: LhaEntry[];
}
```

### API

```ts
// Decompress
function parseLha(data: Uint8Array): LhaArchive;

// Compress
function writeLha(archive: LhaArchive, options?: {
  method?: '-lh0-' | '-lh5-';  // default: -lh5-
  headerLevel?: 0 | 1 | 2;     // default: 1
}): Uint8Array;
```

### Implementation Order

1. `lhaCrc.ts` — CRC-16 table and function
2. `lhaBitReader.ts` — bitstream reader
3. `lhaTypes.ts` — interfaces
4. `lhaHeader.ts` — parse level 0, 1, 2 headers + extended headers
5. `lhaDecompress.ts` — `-lh0-` (store), then `-lh5-` (static Huffman)
6. `lhaHuffman.ts` — canonical table construction, decode
7. `parseLha()` — wire header parsing + decompression together
8. `lhaBitWriter.ts` — bitstream writer
9. `lhaCompress.ts` — `-lh0-` (store), then `-lh5-` with hash-chain matching
10. `lhaHeader.ts` — header writing (level 1 recommended for output)
11. `writeLha()` — wire compression + header writing together

---

## Reference Implementations

- **lhasa** (C, ISC license) — https://github.com/fragglet/lhasa — cleanest modern implementation
  - `lib/lh_new_decoder.c` — lh4/5/6/7 decompression template
  - `lib/lh1_decoder.c` — dynamic Huffman decoder
  - `lib/lha_file_header.c` — header parsing
  - `lib/ext_header.c` — extended headers
- **jca02266/lha** (C) — https://github.com/jca02266/lha — canonical implementation
  - `src/huf.c` — Huffman coding (read_pt_len, read_c_len, decode_c_st1, decode_p_st1)
  - `src/lha_macro.h` — all constants
- **Kaitai Struct** — https://formats.kaitai.io/lzh/ — formal grammar for header structure

## Additional Resources

- LHA header.doc.md — https://github.com/jca02266/lha/blob/master/header.doc.md
- Entropymine LHA blocksize — https://entropymine.wordpress.com/2020/11/23/the-blocksize-field-in-lha-compression-format/
- Entropymine Huffman codebooks — https://entropymine.wordpress.com/2021/01/24/encoding-huffman-codebooks/
- Just Solve wiki — http://justsolve.archiveteam.org/wiki/LHA
