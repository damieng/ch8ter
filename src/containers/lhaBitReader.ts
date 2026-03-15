/** MSB-first bitstream reader for LHA decompression */

export class LhaBitReader {
  private data: Uint8Array
  private pos: number
  private end: number
  private bitbuf: number
  private bitcount: number

  constructor(data: Uint8Array, offset: number, length: number) {
    this.data = data
    this.pos = offset
    this.end = offset + length
    this.bitbuf = 0
    this.bitcount = 0
  }

  /** Ensure at least n bits are available in the buffer */
  private fill(n: number): void {
    while (this.bitcount < n) {
      const byte = this.pos < this.end ? this.data[this.pos++] : 0
      // Mask off stale high bits before shifting to prevent corruption
      const mask = this.bitcount > 0 ? ((1 << this.bitcount) >>> 0) - 1 : 0
      this.bitbuf = (((this.bitbuf & mask) << 8) | byte) >>> 0
      this.bitcount += 8
    }
  }

  /** Peek at the top n bits without consuming them (n <= 16) */
  peek(n: number): number {
    if (n === 0) return 0
    this.fill(n)
    return (this.bitbuf >>> (this.bitcount - n)) & ((1 << n) - 1)
  }

  /** Read and consume n bits (n <= 16) */
  read(n: number): number {
    if (n === 0) return 0
    this.fill(n)
    this.bitcount -= n
    return (this.bitbuf >>> this.bitcount) & ((1 << n) - 1)
  }

  /** Skip n bits */
  skip(n: number): void {
    while (n > 0) {
      if (this.bitcount === 0) {
        // Skip whole bytes directly
        const bytes = n >>> 3
        if (bytes > 0) {
          this.pos += bytes
          n -= bytes << 3
        }
        if (n > 0) this.fill(n)
      }
      const consume = Math.min(n, this.bitcount)
      this.bitcount -= consume
      n -= consume
    }
  }
}
