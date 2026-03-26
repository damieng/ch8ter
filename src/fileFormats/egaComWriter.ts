// Write Pete Kvitek-style EGA/VGA .COM font loader files.
//
// Uses a 371-byte v2.04A loader stub patched with the correct font height
// and data offset, followed by 256 glyphs of raw bitmap data.

const STUB_B64 = '6e4ARUdBIHRleHQgZm9udCBsb2FkZXIgdjIuMDRBAA0KQ29weXJpZ2h0IChDKSAxOTg4IGJ5IFBldGUgSS4gS3ZpdGVrDQokAAAAAAAAAAAAAAAAaAEAAHcBAAAAAAAAAAAAAAAAAAAOAAABAABzAgAA/wIDB///DgBzAgAADxD/CuR0FYD8AXQFLv8uSAGB+QcGdfW5BwXr8FAkfzwDdgo8B3QGWC7/LkgBWFBTUVIGVZwu/x5IAYzIjsC9cwK4ABG7AA65AAG6AACcLv8eSAG0A5wu/x5IAYH5BwV0C7QBuQcFnC7/HkgBXQdaWVtYz7gAAI7Y+vy/TAGLNqgEjh6qBLkOAPOluAAAjtjHBqgETAGMDqoEjMiO2IwOcAGMDloBxwZYAXcBjA58Afu4EDXNIYkeSAGMBkoBuoEBuBAlzSGMyI7AvXMCuAARuwAOuQABugAAzRC0AbkHBc0QugMBtAnNIbpzELEE0+pCuAAxzSE='

// Offsets within the stub where height and font data pointer need patching
const HEIGHT_OFFSETS = [0xC4, 0x14F] // Two MOV BX instructions with height in BH
const BP_OFFSETS = [0xBD, 0x148]     // Two MOV BP instructions with font data pointer (LE uint16)

function decodeStub(): Uint8Array {
  const bin = atob(STUB_B64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

import type { FontWriteData } from '../fontSave'

export function writeEgaCom({ fontData, glyphHeight }: FontWriteData): Uint8Array {
  const stub = decodeStub()
  const fontSize = 256 * glyphHeight
  const fontOffset = stub.length // font data immediately follows stub
  const memOffset = fontOffset + 0x100 // COM loads at 0x100

  // Patch height bytes
  for (const off of HEIGHT_OFFSETS) {
    stub[off] = glyphHeight
  }

  // Patch font data pointer (MOV BP, xxxx — little-endian uint16)
  for (const off of BP_OFFSETS) {
    stub[off] = memOffset & 0xFF
    stub[off + 1] = (memOffset >> 8) & 0xFF
  }

  // Assemble: stub + font data
  const out = new Uint8Array(stub.length + fontSize)
  out.set(stub, 0)
  out.set(fontData.subarray(0, Math.min(fontData.length, fontSize)), stub.length)

  return out
}
