import { describe, it, expect } from 'vitest'
import { X86Emu } from './x86emu'

describe('x86emu signed overflow flag', () => {
  it('JL is taken when a signed comparison overflows (0x8000 < 1)', () => {
    // mov ax, 0x8000 ; cmp ax, 1 ; jl target ; int 0x20 ; target: int 0x20
    const emu = new X86Emu()
    emu.load(new Uint8Array([
      0xB8, 0x00, 0x80,       // mov ax, 0x8000
      0x81, 0xF8, 0x01, 0x00, // cmp ax, 1
      0x7C, 0x02,             // jl +2 (to target)
      0xCD, 0x20,             // int 0x20 (failure: halt)
      0xCD, 0x20,             // target: int 0x20
    ]), 0)
    emu.run(0x0B)
    // Reaching the stop address means the branch was taken
    expect(emu.halted).toBe(false)
  })

  it('JGE is taken when a signed comparison does not overflow (1 >= 0x8000)', () => {
    const emu = new X86Emu()
    emu.load(new Uint8Array([
      0xB8, 0x01, 0x00,       // mov ax, 1
      0x81, 0xF8, 0x00, 0x80, // cmp ax, 0x8000
      0x7D, 0x02,             // jge +2 (to target)
      0xCD, 0x20,             // int 0x20 (failure: halt)
      0xCD, 0x20,             // target: int 0x20
    ]), 0)
    emu.run(0x0B)
    expect(emu.halted).toBe(false)
  })

  it('JL is taken for a plain negative result (2 < 7)', () => {
    const emu = new X86Emu()
    emu.load(new Uint8Array([
      0xB8, 0x02, 0x00,       // mov ax, 2
      0x81, 0xF8, 0x07, 0x00, // cmp ax, 7
      0x7C, 0x02,             // jl +2
      0xCD, 0x20,
      0xCD, 0x20,
    ]), 0)
    emu.run(0x0B)
    expect(emu.halted).toBe(false)
  })
})
