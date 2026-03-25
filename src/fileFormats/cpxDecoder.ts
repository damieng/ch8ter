// Decompress .CPX files (UPX-compressed .CPI font containers).
//
// CPX files are DOS COM executables containing a small UPX decompression stub
// followed by NRV-compressed CPI data. We decompress by running the stub in a
// minimal x86 emulator — the stub writes the decompressed CPI to memory at
// 0x0100 (COM load address), and we extract it when execution returns there.

import { X86Emu } from '../x86emu'

/**
 * Decompress a CPX file and return the underlying CPI data.
 * Throws if the file is not a valid CPX or decompression fails.
 */
export function decompressCpx(data: Uint8Array): Uint8Array {
  // CPX files are COM executables — verify they have the UPX signature
  const upxIdx = findSignature(data, [0x55, 0x50, 0x58, 0x21]) // "UPX!"
  if (upxIdx < 0) throw new Error('Not a CPX file: UPX signature not found')

  const emu = new X86Emu()
  const loadAddr = 0x0100 // COM files load at CS:0100

  // Load file into memory at COM load address
  emu.load(data, loadAddr)

  // Set up registers for COM execution
  emu.ip = loadAddr
  emu.sp = 0xFFFE // plenty of stack space (passes the memory check)

  // Run until IP returns to 0x100 (decompressed program entry) or halts
  // First step past the initial IP=0x100 so the stop check works
  emu.step()
  emu.run(loadAddr)

  if (emu.halted) throw new Error('CPX decompression failed: program terminated (insufficient memory?)')

  // The decompressed CPI data is now at 0x100 in memory.
  // Find its extent by looking for the FONT/DRFONT signature.
  const mem = emu.mem
  const sig0 = mem[loadAddr]
  if (sig0 !== 0xFF && sig0 !== 0x7F)
    throw new Error('CPX decompression produced invalid CPI: bad magic byte')

  // Read the CPI structure to determine the total size.
  // Walk the codepage chain to find the end of the last codepage's data.
  const cpiSize = measureCpi(mem, loadAddr)
  if (cpiSize <= 0) throw new Error('CPX decompression produced invalid CPI: could not determine size')

  return mem.slice(loadAddr, loadAddr + cpiSize)
}

/** Find a byte signature in data, return offset or -1. */
function findSignature(data: Uint8Array, sig: number[]): number {
  outer: for (let i = 0; i <= data.length - sig.length; i++) {
    for (let j = 0; j < sig.length; j++) {
      if (data[i + j] !== sig[j]) continue outer
    }
    return i
  }
  return -1
}

/**
 * Measure the total size of a CPI file in memory by walking its structure.
 * Returns the byte count from the start of the FontFileHeader.
 */
function measureCpi(mem: Uint8Array, base: number): number {
  const view = new DataView(mem.buffer, mem.byteOffset, mem.byteLength)

  const id0 = mem[base]
  const idStr = String.fromCharCode(...mem.slice(base + 1, base + 8))
  const isFontNT = id0 === 0xFF && idStr.startsWith('FONT.NT')
  const isDrFont = id0 === 0x7F && idStr.startsWith('DRFONT')

  const fihOffset = view.getUint32(base + 0x13, true)
  const numCp = view.getUint16(base + fihOffset, true)

  let maxEnd = fihOffset + 2 // at minimum, includes FontInfoHeader

  // Skip DRFONT extended header if present
  if (isDrFont) {
    const numFonts = mem[base + 23]
    maxEnd = Math.max(maxEnd, 23 + 1 + numFonts * 5)
  }

  let cpehOffset = fihOffset + 2
  for (let i = 0; i < numCp; i++) {
    if (cpehOffset === 0 || cpehOffset + 28 > mem.length - base) break

    const cpehSize = view.getUint16(base + cpehOffset, true)
    maxEnd = Math.max(maxEnd, cpehOffset + Math.max(cpehSize, 28))

    let cpihOffset = view.getUint32(base + cpehOffset + 0x18, true)
    if (isFontNT) cpihOffset += cpehOffset

    if (cpihOffset > 0 && cpihOffset + 6 < mem.length - base) {
      const cpihSize = view.getUint16(base + cpihOffset + 4, true)
      maxEnd = Math.max(maxEnd, cpihOffset + 6 + cpihSize)
    }

    const nextOffset = view.getUint32(base + cpehOffset + 0x02, true)
    if (nextOffset === 0) break
    cpehOffset = isFontNT ? cpehOffset + nextOffset : nextOffset
  }

  // Scan for trailing copyright text (printable ASCII after the last codepage)
  let end = maxEnd
  while (end < mem.length - base) {
    const b = mem[base + end]
    if (b >= 0x20 && b < 0x7F || b === 0x0A || b === 0x0D || b === 0x1A) {
      end++
    } else if (b === 0x00) {
      break
    } else {
      break
    }
  }

  return end
}
