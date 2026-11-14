// Machine-code tests for the x86 emulator.
//
// This emulator exists to run the decompression stub inside .CPX files and the
// font extractor inside TSR .COM loaders, so its correctness directly decides
// whether those formats open. Previously at 16% coverage: the decoder paths
// were exercised indirectly but the instruction set was not checked.

import { describe, it, expect } from 'vitest'
import { X86Emu } from './x86emu'

/** Load a byte program at 0x100 (COM style) and run a single step. */
function emuWith(program: number[], setup?: (e: X86Emu) => void): X86Emu {
  const emu = new X86Emu()
  emu.load(new Uint8Array(program), 0x100)
  emu.ip = 0x100
  setup?.(emu)
  return emu
}

/** Run `steps` instructions from 0x100. */
function runSteps(program: number[], steps: number, setup?: (e: X86Emu) => void): X86Emu {
  const emu = emuWith(program, setup)
  for (let i = 0; i < steps && !emu.halted; i++) emu.step()
  return emu
}

describe('register access', () => {
  it('splits AX into AL and AH', () => {
    const emu = new X86Emu()
    emu.ax = 0x1234
    expect(emu.getR8(0)).toBe(0x34) // AL
    expect(emu.getR8(4)).toBe(0x12) // AH
  })

  it('writes a byte register without disturbing the other half', () => {
    const emu = new X86Emu()
    emu.ax = 0x1234
    emu.setR8(0, 0xFF) // AL
    expect(emu.ax).toBe(0x12FF)
    emu.setR8(4, 0x00) // AH
    expect(emu.ax).toBe(0x00FF)
  })

  it('covers all eight byte registers', () => {
    const emu = new X86Emu()
    emu.ax = 0x1122; emu.cx = 0x3344; emu.dx = 0x5566; emu.bx = 0x7788
    expect([0, 1, 2, 3, 4, 5, 6, 7].map(i => emu.getR8(i)))
      .toEqual([0x22, 0x44, 0x66, 0x88, 0x11, 0x33, 0x55, 0x77])
  })

  it('covers all eight word registers', () => {
    const emu = new X86Emu()
    emu.ax = 1; emu.cx = 2; emu.dx = 3; emu.bx = 4
    emu.sp = 5; emu.bp = 6; emu.si = 7; emu.di = 8
    expect([0, 1, 2, 3, 4, 5, 6, 7].map(i => emu.getR16(i))).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
  })
})

describe('memory', () => {
  it('loads a program at an offset', () => {
    const emu = new X86Emu()
    emu.load(new Uint8Array([0xAA, 0xBB]), 0x200)
    expect(emu.mem[0x200]).toBe(0xAA)
    expect(emu.mem[0x201]).toBe(0xBB)
  })

  it('reads and writes 16-bit words', () => {
    const emu = new X86Emu()
    emu.writeU16(0x300, 0xBEEF)
    expect(emu.mem[0x300]).toBe(0xEF)
    expect(emu.mem[0x301]).toBe(0xBE)
    expect(emu.readU16(0x300)).toBe(0xBEEF)
  })
})

describe('MOV immediates', () => {
  it('loads a word register', () => {
    // B8 34 12  = MOV AX, 0x1234
    expect(runSteps([0xB8, 0x34, 0x12], 1).ax).toBe(0x1234)
  })

  it('loads each of the eight word registers', () => {
    const emu = emuWith([
      0xB8, 0x01, 0x00, // MOV AX, 1
      0xB9, 0x02, 0x00, // MOV CX, 2
      0xBA, 0x03, 0x00, // MOV DX, 3
      0xBB, 0x04, 0x00, // MOV BX, 4
      0xBD, 0x05, 0x00, // MOV BP, 5
      0xBE, 0x06, 0x00, // MOV SI, 6
      0xBF, 0x07, 0x00, // MOV DI, 7
    ])
    for (let i = 0; i < 7; i++) emu.step()
    expect([emu.ax, emu.cx, emu.dx, emu.bx, emu.bp, emu.si, emu.di])
      .toEqual([1, 2, 3, 4, 5, 6, 7])
  })

  it('advances IP past the immediate', () => {
    const emu = runSteps([0xB8, 0x34, 0x12], 1)
    expect(emu.ip).toBe(0x103)
  })
})

describe('arithmetic', () => {
  it('adds to AX with ADD AL, imm8 (83 C0 xx is ADD AX, imm8 sign-extended)', () => {
    const emu = emuWith([0x83, 0xC0, 0x01], e => { e.ax = 10 })
    emu.step()
    expect(emu.ax).toBe(11)
  })

  it('sets the zero flag when a result becomes zero', () => {
    const emu = emuWith([0x83, 0xE8, 0x01], e => { e.ax = 1 }) // SUB AX, 1
    emu.step()
    expect(emu.ax).toBe(0)
    expect(emu.zf).toBe(true)
  })

  it('clears the zero flag for a non-zero result', () => {
    const emu = emuWith([0x83, 0xC0, 0x01], e => { e.ax = 0 })
    emu.step()
    expect(emu.zf).toBe(false)
  })
})

describe('PUSH and POP', () => {
  it('round-trips a value through the stack', () => {
    // MOV AX, 0x1234 ; PUSH AX ; MOV AX, 0 ; POP BX
    const emu = emuWith([
      0xB8, 0x34, 0x12,
      0x50,
      0xB8, 0x00, 0x00,
      0x5B,
    ], e => { e.sp = 0xFF00 })
    for (let i = 0; i < 4; i++) emu.step()
    expect(emu.bx).toBe(0x1234)
  })

  it('moves SP down on push and back up on pop', () => {
    const emu = emuWith([0xB8, 0x11, 0x11, 0x50, 0x58], e => { e.sp = 0xFF00 })
    emu.step() // MOV
    const before = emu.sp
    emu.step() // PUSH
    expect(emu.sp).toBe(before - 2)
    emu.step() // POP AX
    expect(emu.sp).toBe(before)
  })

  it('pushes each of the eight registers', () => {
    const emu = emuWith([
      0x50, 0x51, 0x52, 0x53, 0x54, 0x55, 0x56, 0x57,
    ], e => { e.sp = 0xFF00 })
    for (let i = 0; i < 8; i++) emu.step()
    expect(emu.sp).toBe(0xFF00 - 16)
  })
})

describe('conditional jumps', () => {
  it('jumps when the condition holds', () => {
    // MOV AX, 0 ; JZ +2 ; (skipped); NOP
    // 74 02 jumps over the two bytes at 0x105
    const emu = emuWith([0x74, 0x02, 0x90, 0x90, 0x90], e => { e.zf = true })
    emu.step()
    expect(emu.ip).toBe(0x102 + 2)
  })

  it('falls through when the condition does not hold', () => {
    const emu = emuWith([0x74, 0x02, 0x90, 0x90], e => { e.zf = false })
    emu.step()
    expect(emu.ip).toBe(0x102)
  })

  it('takes JNZ when the zero flag is clear', () => {
    const emu = emuWith([0x75, 0x02, 0x90, 0x90], e => { e.zf = false })
    emu.step()
    expect(emu.ip).toBe(0x104)
  })

  it('implements the carry-based branches', () => {
    const jb = emuWith([0x72, 0x02, 0x90, 0x90], e => { e.cf = true })
    jb.step()
    expect(jb.ip).toBe(0x104)

    const jae = emuWith([0x73, 0x02, 0x90, 0x90], e => { e.cf = false })
    jae.step()
    expect(jae.ip).toBe(0x104)
  })
})

describe('string-ish instructions', () => {
  it('MOVSB copies a byte from SI to DI and advances both', () => {
    // A4 = MOVSB
    const emu = emuWith([0xA4], e => {
      e.si = 0x200
      e.di = 0x300
      e.mem[0x200] = 0x5A
    })
    emu.step()
    expect(emu.mem[0x300]).toBe(0x5A)
    expect(emu.si).toBe(0x201)
    expect(emu.di).toBe(0x301)
  })

  it('MOVSW copies a word and advances by two', () => {
    const emu = emuWith([0xA5], e => {
      e.si = 0x200
      e.di = 0x300
      e.mem[0x200] = 0x34
      e.mem[0x201] = 0x12
    })
    emu.step()
    expect(emu.readU16(0x300)).toBe(0x1234)
    expect(emu.si).toBe(0x202)
    expect(emu.di).toBe(0x302)
  })

  it('STOSB writes AL to DI', () => {
    // AA = STOSB
    const emu = emuWith([0xAA], e => { e.di = 0x400; e.ax = 0x00CD })
    emu.step()
    expect(emu.mem[0x400]).toBe(0xCD)
    expect(emu.di).toBe(0x401)
  })

  it('LODSB loads from SI into AL', () => {
    // AC = LODSB
    const emu = emuWith([0xAC], e => { e.si = 0x200; e.mem[0x200] = 0x77; e.ax = 0xFF00 })
    emu.step()
    expect(emu.ax & 0xFF).toBe(0x77)
    expect(emu.si).toBe(0x201)
  })
})

describe('run loop', () => {
  it('stops when the stop address is reached', () => {
    // Program sits at 0x100 and jumps back to 0x100; run(0x100) stops there
    const emu = emuWith([0xEB, 0xFE], e => { e.sp = 0xFF00 }) // JMP -2
    emu.step() // step past the first instruction
    emu.run(0x100, 100)
    expect(emu.ip).toBe(0x100)
  })

  it('throws if the step budget runs out, rather than looping forever', () => {
    // An infinite tight loop must not hang the process; run() reports it
    const emu = emuWith([0xEB, 0xFE], e => { e.sp = 0xFF00 })
    expect(() => emu.run(0x9999, 50)).toThrow(/maximum step count/)
  })

  it('starts unhalted and stays unhalted after a normal instruction', () => {
    const emu = emuWith([0x90], e => { e.sp = 0xFF00 }) // NOP
    expect(emu.halted).toBe(false)
    emu.step()
    expect(emu.halted).toBe(false)
  })

  it('RET returns to the address on the stack', () => {
    // MOV AX, 0x1234 ; PUSH AX ; RET
    const emu = emuWith([
      0xB8, 0x34, 0x12, // MOV AX, 0x1234
      0x50,             // PUSH AX
      0xC3,             // RET
    ], e => { e.sp = 0xFF00 })
    emu.step()
    emu.step()
    emu.step()
    expect(emu.ip).toBe(0x1234)
  })
})

describe('robustness', () => {
  it('reports an unimplemented opcode with its number and address', () => {
    const emu = emuWith([0x0F], e => { e.sp = 0xFF00 })
    expect(() => emu.step()).toThrow(/Unimplemented opcode 0x0f/)
  })

  it('survives a long run of random opcodes', () => {
    // Deterministic pseudo-random program; the point is that decode never crashes
    const program: number[] = []
    let seed = 12345
    for (let i = 0; i < 512; i++) {
      seed = (seed * 1103515245 + 12345) & 0x7FFFFFFF
      program.push((seed >>> 16) & 0xFF)
    }
    const emu = emuWith(program, e => { e.sp = 0xFF00 })
    // Random bytes will hit unimplemented opcodes; the contract is that the
    // emulator reports which one and where, never that it silently misbehaves
    try {
      emu.run(0x9999, 200)
    } catch (e) {
      expect((e as Error).message).toMatch(/Unimplemented opcode 0x[0-9a-f]{2}|maximum step count/)
    }
  })
})
