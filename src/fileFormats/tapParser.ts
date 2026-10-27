// Parse ZX Spectrum TAP files and extract font-sized CODE blocks.
//
// A TAP file is a sequence of blocks: [u16 length][length bytes]. The first
// byte of each block is the flag (0x00 = header, 0xFF = data), followed by
// the payload and a trailing XOR parity byte.
//
// Header payloads are 17 bytes: type (0=Program, 1=Number array, 2=Character
// array, 3=Code), 10-byte name, u16 length, u16 param1 (start address for
// code), u16 param2.
//
// Spectrum fonts are 8x8, shipped as CODE blocks of 768/1024/2048 bytes
// (96/128/256 characters x 8 rows).

export interface TapBlock {
  flag: number
  data: Uint8Array // payload without flag and parity bytes
}

export interface TapFontEntry {
  label: string
  startAddress: number
  numChars: number
  fontData: Uint8Array
}

/** Font-sized CODE block lengths (rows 8 bytes wide). */
const FONT_SIZES = [2048, 1024, 768]

export function parseTapBlocks(bytes: Uint8Array): TapBlock[] {
  const blocks: TapBlock[] = []
  let pos = 0
  while (pos + 2 <= bytes.length) {
    const len = bytes[pos] | (bytes[pos + 1] << 8)
    if (len < 2 || pos + 2 + len > bytes.length) break // corrupt/truncated
    // flag byte + payload (len-2 incl. parity)
    blocks.push({ flag: bytes[pos + 2], data: bytes.subarray(pos + 3, pos + 2 + len - 1) })
    pos += 2 + len
  }
  return blocks
}

/** Extract all font-sized CODE blocks from a TAP file. */
export function extractTapFonts(bytes: Uint8Array): TapFontEntry[] {
  const blocks = parseTapBlocks(bytes)
  const entries: TapFontEntry[] = []

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i]
    let length = block.data.length - 1 // minus header checksum
    let type = -1
    let name = ''
    let param1 = 0

    if (block.flag === 0x00 && block.data.length >= 18) {
      // Header block: describes the data block that follows
      type = block.data[0]
      name = Array.from(block.data.subarray(1, 11))
        .map(b => (b >= 0x20 && b < 0x7F ? String.fromCharCode(b) : ' '))
        .join('').trim()
      length = block.data[11] | (block.data[12] << 8)
      param1 = block.data[13] | (block.data[14] << 8)
    } else if (block.flag !== 0xFF) {
      continue
    }

    if (type !== -1 && type !== 3) continue // only CODE blocks
    if (!FONT_SIZES.includes(length)) continue

    // The data block follows the header block
    const dataBlock = blocks[i + 1]
    if (!dataBlock || dataBlock.flag !== 0xFF || dataBlock.data.length - 1 < length) continue

    entries.push({
      label: `${name || 'Code'} at ${param1} (${length / 8} chars)`,
      startAddress: param1,
      numChars: length / 8,
      fontData: dataBlock.data.subarray(0, length).slice(),
    })
  }

  return entries
}

/** Pick the best single font for the plain-font open path (largest charset). */
export function pickTapFont(bytes: Uint8Array): TapFontEntry | null {
  const entries = extractTapFonts(bytes)
  if (entries.length === 0) return null
  return entries.reduce((best, e) => (e.numChars > best.numChars ? e : best), entries[0])
}
