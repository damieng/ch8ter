import { getBit } from './bitUtils'

/**
 * Draw a single glyph bitmap to a canvas context.
 * Assumes ctx.fillStyle is already set to the desired foreground color.
 */
export function drawGlyphToCtx(
  ctx: CanvasRenderingContext2D,
  data: Uint8Array,
  offset: number,
  width: number,
  height: number,
  bytesPerRow: number,
  x: number,
  y: number,
  scaleX: number,
  scaleY: number,
): void {
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      if (getBit(data, offset + row * bytesPerRow, col)) {
        ctx.fillRect(x + col * scaleX, y + row * scaleY, scaleX, scaleY)
      }
    }
  }
}
