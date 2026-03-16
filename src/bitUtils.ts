/** Bytes per row for a glyph of the given pixel width. */
export function bpr(w: number): number { return Math.ceil(w / 8) }

/** Bytes per glyph for given pixel dimensions. */
export function bpg(w: number, h: number): number { return h * bpr(w) }

/** Read bit `x` from `data` starting at byte offset `offset`. */
export function getBit(data: Uint8Array, offset: number, x: number): boolean {
  return (data[offset + (x >> 3)] & (0x80 >> (x & 7))) !== 0
}

/** Set bit `x` in `data` starting at byte offset `offset`. */
export function setBit(data: Uint8Array, offset: number, x: number): void {
  data[offset + (x >> 3)] |= (0x80 >> (x & 7))
}

/** Clear bit `x` in `data` starting at byte offset `offset`. */
export function clearBit(data: Uint8Array, offset: number, x: number): void {
  data[offset + (x >> 3)] &= ~(0x80 >> (x & 7))
}
