// Minimal 16-bit real-mode x86 emulator.
//
// Supports the subset of instructions needed to run UPX/NRV decompression
// stubs found in DOS .CPX (compressed .CPI) files. No I/O, no segments,
// flat 64 KB memory model.

export class X86Emu {
  mem: Uint8Array
  ax = 0; bx = 0; cx = 0; dx = 0
  si = 0; di = 0; bp = 0; sp = 0; ip = 0
  cf = false; zf = false; sf = false; of = false; df = false
  halted = false

  constructor(memSize = 65536) {
    this.mem = new Uint8Array(memSize)
  }

  load(data: Uint8Array, offset: number) {
    this.mem.set(data, offset)
  }

  // --- 8-bit register access ---

  getR8(idx: number): number {
    // 0=AL 1=CL 2=DL 3=BL 4=AH 5=CH 6=DH 7=BH
    switch (idx) {
      case 0: return this.ax & 0xFF
      case 1: return this.cx & 0xFF
      case 2: return this.dx & 0xFF
      case 3: return this.bx & 0xFF
      case 4: return (this.ax >> 8) & 0xFF
      case 5: return (this.cx >> 8) & 0xFF
      case 6: return (this.dx >> 8) & 0xFF
      case 7: return (this.bx >> 8) & 0xFF
    }
    return 0
  }

  setR8(idx: number, val: number) {
    val &= 0xFF
    switch (idx) {
      case 0: this.ax = (this.ax & 0xFF00) | val; break
      case 1: this.cx = (this.cx & 0xFF00) | val; break
      case 2: this.dx = (this.dx & 0xFF00) | val; break
      case 3: this.bx = (this.bx & 0xFF00) | val; break
      case 4: this.ax = (this.ax & 0x00FF) | (val << 8); break
      case 5: this.cx = (this.cx & 0x00FF) | (val << 8); break
      case 6: this.dx = (this.dx & 0x00FF) | (val << 8); break
      case 7: this.bx = (this.bx & 0x00FF) | (val << 8); break
    }
  }

  // --- 16-bit register access ---

  getR16(idx: number): number {
    switch (idx) {
      case 0: return this.ax
      case 1: return this.cx
      case 2: return this.dx
      case 3: return this.bx
      case 4: return this.sp
      case 5: return this.bp
      case 6: return this.si
      case 7: return this.di
    }
    return 0
  }

  setR16(idx: number, val: number) {
    val &= 0xFFFF
    switch (idx) {
      case 0: this.ax = val; break
      case 1: this.cx = val; break
      case 2: this.dx = val; break
      case 3: this.bx = val; break
      case 4: this.sp = val; break
      case 5: this.bp = val; break
      case 6: this.si = val; break
      case 7: this.di = val; break
    }
  }

  // --- Memory access ---

  readU8(addr: number): number { return this.mem[addr & 0xFFFF] }
  readU16(addr: number): number {
    addr &= 0xFFFF
    return this.mem[addr] | (this.mem[(addr + 1) & 0xFFFF] << 8)
  }
  readI16(addr: number): number {
    const v = this.readU16(addr)
    return v > 0x7FFF ? v - 0x10000 : v
  }
  writeU8(addr: number, val: number) { this.mem[addr & 0xFFFF] = val & 0xFF }
  writeU16(addr: number, val: number) {
    addr &= 0xFFFF
    this.mem[addr] = val & 0xFF
    this.mem[(addr + 1) & 0xFFFF] = (val >> 8) & 0xFF
  }

  // --- Stack ---

  push16(val: number) {
    this.sp = (this.sp - 2) & 0xFFFF
    this.writeU16(this.sp, val)
  }

  pop16(): number {
    const val = this.readU16(this.sp)
    this.sp = (this.sp + 2) & 0xFFFF
    return val
  }

  // --- Instruction fetch ---

  fetchU8(): number {
    const v = this.mem[this.ip & 0xFFFF]
    this.ip = (this.ip + 1) & 0xFFFF
    return v
  }

  fetchI8(): number {
    const v = this.fetchU8()
    return v > 127 ? v - 256 : v
  }

  fetchU16(): number {
    const lo = this.fetchU8()
    const hi = this.fetchU8()
    return lo | (hi << 8)
  }

  fetchI16(): number {
    const v = this.fetchU16()
    return v > 0x7FFF ? v - 0x10000 : v
  }

  // --- Flags ---

  setFlagsArith16(result: number) {
    const r = result & 0xFFFF
    this.zf = r === 0
    this.sf = (r & 0x8000) !== 0
  }

  setFlagsArith8(result: number) {
    const r = result & 0xFF
    this.zf = r === 0
    this.sf = (r & 0x80) !== 0
  }

  // --- Mod/RM decoding ---

  /** Decode mod/rm byte, returning the effective address for memory operands. */
  decodeModRM(modrm: number): { reg: number; addr: number; isMem: boolean } {
    const mod = (modrm >> 6) & 3
    const reg = (modrm >> 3) & 7
    const rm = modrm & 7

    if (mod === 3) return { reg, addr: rm, isMem: false }

    let addr = 0
    switch (rm) {
      case 0: addr = (this.bx + this.si) & 0xFFFF; break
      case 1: addr = (this.bx + this.di) & 0xFFFF; break
      case 2: addr = (this.bp + this.si) & 0xFFFF; break
      case 3: addr = (this.bp + this.di) & 0xFFFF; break
      case 4: addr = this.si; break
      case 5: addr = this.di; break
      case 6: addr = mod === 0 ? this.fetchU16() : this.bp; break
      case 7: addr = this.bx; break
    }
    if (mod === 1) addr = (addr + this.fetchI8()) & 0xFFFF
    else if (mod === 2) addr = (addr + this.fetchI16()) & 0xFFFF

    return { reg, addr, isMem: true }
  }

  getRM16(modrm: ReturnType<X86Emu['decodeModRM']>): number {
    return modrm.isMem ? this.readU16(modrm.addr) : this.getR16(modrm.addr)
  }

  setRM16(modrm: ReturnType<X86Emu['decodeModRM']>, val: number) {
    if (modrm.isMem) this.writeU16(modrm.addr, val)
    else this.setR16(modrm.addr, val)
  }

  getRM8(modrm: ReturnType<X86Emu['decodeModRM']>): number {
    return modrm.isMem ? this.readU8(modrm.addr) : this.getR8(modrm.addr)
  }

  setRM8(modrm: ReturnType<X86Emu['decodeModRM']>, val: number) {
    if (modrm.isMem) this.writeU8(modrm.addr, val)
    else this.setR8(modrm.addr, val)
  }

  // --- Execute one instruction ---

  step() {
    const op = this.fetchU8()

    switch (op) {
      // INC r16 (40-47)
      case 0x40: case 0x41: case 0x42: case 0x43:
      case 0x44: case 0x45: case 0x46: case 0x47: {
        const idx = op - 0x40
        const val = this.getR16(idx)
        const result = (val + 1) & 0xFFFF
        this.setR16(idx, result)
        this.zf = result === 0
        this.sf = (result & 0x8000) !== 0
        this.of = val === 0x7FFF
        // INC does not affect CF
        break
      }

      // DEC r16 (48-4F)
      case 0x48: case 0x49: case 0x4A: case 0x4B:
      case 0x4C: case 0x4D: case 0x4E: case 0x4F: {
        const idx = op - 0x48
        const val = this.getR16(idx)
        const result = (val - 1) & 0xFFFF
        this.setR16(idx, result)
        this.zf = result === 0
        this.sf = (result & 0x8000) !== 0
        this.of = val === 0x8000
        // DEC does not affect CF
        break
      }

      // PUSH r16 (50-57)
      case 0x50: case 0x51: case 0x52: case 0x53:
      case 0x54: case 0x55: case 0x56: case 0x57:
        this.push16(this.getR16(op - 0x50))
        break

      // POP r16 (58-5F)
      case 0x58: case 0x59: case 0x5A: case 0x5B:
      case 0x5C: case 0x5D: case 0x5E: case 0x5F:
        this.setR16(op - 0x58, this.pop16())
        break

      // JO/JNO/JB/JAE/JZ/JNZ/JBE/JA rel8 (70-77)
      // JS/JNS/JP/JNP/JL/JGE/JLE/JG rel8 (78-7F)
      case 0x70: { const d = this.fetchI8(); if (this.of) this.ip = (this.ip + d) & 0xFFFF; break }
      case 0x71: { const d = this.fetchI8(); if (!this.of) this.ip = (this.ip + d) & 0xFFFF; break }
      case 0x72: { const d = this.fetchI8(); if (this.cf) this.ip = (this.ip + d) & 0xFFFF; break }  // JB/JC
      case 0x73: { const d = this.fetchI8(); if (!this.cf) this.ip = (this.ip + d) & 0xFFFF; break } // JAE/JNC
      case 0x74: { const d = this.fetchI8(); if (this.zf) this.ip = (this.ip + d) & 0xFFFF; break }  // JZ/JE
      case 0x75: { const d = this.fetchI8(); if (!this.zf) this.ip = (this.ip + d) & 0xFFFF; break } // JNZ/JNE
      case 0x76: { const d = this.fetchI8(); if (this.cf || this.zf) this.ip = (this.ip + d) & 0xFFFF; break } // JBE
      case 0x77: { const d = this.fetchI8(); if (!this.cf && !this.zf) this.ip = (this.ip + d) & 0xFFFF; break } // JA
      case 0x78: { const d = this.fetchI8(); if (this.sf) this.ip = (this.ip + d) & 0xFFFF; break }  // JS
      case 0x79: { const d = this.fetchI8(); if (!this.sf) this.ip = (this.ip + d) & 0xFFFF; break } // JNS
      case 0x7C: { const d = this.fetchI8(); if (this.sf !== this.of) this.ip = (this.ip + d) & 0xFFFF; break } // JL
      case 0x7D: { const d = this.fetchI8(); if (this.sf === this.of) this.ip = (this.ip + d) & 0xFFFF; break } // JGE

      // ADD/OR/ADC/SBB/AND/SUB/XOR/CMP r/m16, imm8sx (83)
      case 0x83: {
        const m = this.decodeModRM(this.fetchU8())
        let imm = this.fetchI8()
        imm &= 0xFFFF
        const val = this.getRM16(m)
        let result: number
        switch (m.reg) {
          case 0: // ADD
            result = val + imm
            this.cf = result > 0xFFFF
            this.setRM16(m, result)
            this.setFlagsArith16(result)
            break
          case 1: // OR
            result = val | imm
            this.cf = false
            this.setRM16(m, result)
            this.setFlagsArith16(result)
            break
          case 2: // ADC
            result = val + imm + (this.cf ? 1 : 0)
            this.cf = result > 0xFFFF
            this.setRM16(m, result)
            this.setFlagsArith16(result)
            break
          case 3: // SBB
            result = val - imm - (this.cf ? 1 : 0)
            this.cf = result < 0
            this.setRM16(m, result)
            this.setFlagsArith16(result)
            break
          case 5: // SUB
            result = val - imm
            this.cf = result < 0
            this.setRM16(m, result)
            this.setFlagsArith16(result)
            break
          case 7: // CMP
            result = val - imm
            this.cf = result < 0
            this.setFlagsArith16(result)
            break
          default:
            throw new Error(`Unimplemented 83 /${m.reg}`)
        }
        break
      }

      // XCHG r8, r/m8 (86)
      case 0x86: {
        const m = this.decodeModRM(this.fetchU8())
        const a = this.getR8(m.reg)
        const b = this.getRM8(m)
        this.setR8(m.reg, b)
        this.setRM8(m, a)
        break
      }

      // XCHG r16, r/m16 (87)
      case 0x87: {
        const m = this.decodeModRM(this.fetchU8())
        const a = this.getR16(m.reg)
        const b = this.getRM16(m)
        this.setR16(m.reg, b)
        this.setRM16(m, a)
        break
      }

      // MOV r/m8, r8 (88)
      case 0x88: {
        const m = this.decodeModRM(this.fetchU8())
        this.setRM8(m, this.getR8(m.reg))
        break
      }

      // MOV r/m16, r16 (89)
      case 0x89: {
        const m = this.decodeModRM(this.fetchU8())
        this.setRM16(m, this.getR16(m.reg))
        break
      }

      // MOV r8, r/m8 (8A)
      case 0x8A: {
        const m = this.decodeModRM(this.fetchU8())
        this.setR8(m.reg, this.getRM8(m))
        break
      }

      // MOV r16, r/m16 (8B)
      case 0x8B: {
        const m = this.decodeModRM(this.fetchU8())
        this.setR16(m.reg, this.getRM16(m))
        break
      }

      // LEA r16, m (8D)
      case 0x8D: {
        const m = this.decodeModRM(this.fetchU8())
        this.setR16(m.reg, m.addr & 0xFFFF)
        break
      }

      // NOP / XCHG AX, r16 (90-97)
      case 0x90: break // NOP
      case 0x91: case 0x92: case 0x93:
      case 0x94: case 0x95: case 0x96: case 0x97: {
        const idx = op - 0x90
        const tmp = this.ax
        this.ax = this.getR16(idx)
        this.setR16(idx, tmp)
        break
      }

      // MOVSB (A4)
      case 0xA4:
        this.writeU8(this.di, this.readU8(this.si))
        this.si = (this.si + (this.df ? -1 : 1)) & 0xFFFF
        this.di = (this.di + (this.df ? -1 : 1)) & 0xFFFF
        break

      // MOVSW (A5)
      case 0xA5:
        this.writeU16(this.di, this.readU16(this.si))
        this.si = (this.si + (this.df ? -2 : 2)) & 0xFFFF
        this.di = (this.di + (this.df ? -2 : 2)) & 0xFFFF
        break

      // LODSB (AC)
      case 0xAC:
        this.ax = (this.ax & 0xFF00) | this.readU8(this.si)
        this.si = (this.si + (this.df ? -1 : 1)) & 0xFFFF
        break

      // LODSW (AD)
      case 0xAD:
        this.ax = this.readU16(this.si)
        this.si = (this.si + (this.df ? -2 : 2)) & 0xFFFF
        break

      // STOSB (AA)
      case 0xAA:
        this.writeU8(this.di, this.ax & 0xFF)
        this.di = (this.di + (this.df ? -1 : 1)) & 0xFFFF
        break

      // STOSW (AB)
      case 0xAB:
        this.writeU16(this.di, this.ax)
        this.di = (this.di + (this.df ? -2 : 2)) & 0xFFFF
        break

      // MOV r16, imm16 (B8-BF)
      case 0xB8: case 0xB9: case 0xBA: case 0xBB:
      case 0xBC: case 0xBD: case 0xBE: case 0xBF:
        this.setR16(op - 0xB8, this.fetchU16())
        break

      // RET (C3)
      case 0xC3:
        this.ip = this.pop16()
        break

      // INT imm8 (CD)
      case 0xCD: {
        const intNo = this.fetchU8()
        if (intNo === 0x20) {
          this.halted = true // DOS terminate
        } else {
          // Ignore other interrupts
        }
        break
      }

      // CALL rel16 (E8)
      case 0xE8: {
        const offset = this.fetchI16()
        this.push16(this.ip)
        this.ip = (this.ip + offset) & 0xFFFF
        break
      }

      // JMP rel16 (E9)
      case 0xE9: {
        const offset = this.fetchI16()
        this.ip = (this.ip + offset) & 0xFFFF
        break
      }

      // JMP rel8 (EB)
      case 0xEB: {
        const offset = this.fetchI8()
        this.ip = (this.ip + offset) & 0xFFFF
        break
      }

      // JCXZ rel8 (E3)
      case 0xE3: {
        const d = this.fetchI8()
        if (this.cx === 0) this.ip = (this.ip + d) & 0xFFFF
        break
      }

      // LOOP rel8 (E2)
      case 0xE2: {
        const d = this.fetchI8()
        this.cx = (this.cx - 1) & 0xFFFF
        if (this.cx !== 0) this.ip = (this.ip + d) & 0xFFFF
        break
      }

      // CLD (FC)
      case 0xFC: this.df = false; break

      // STD (FD)
      case 0xFD: this.df = true; break

      // CMP r/m16, imm16 (81)
      case 0x81: {
        const m = this.decodeModRM(this.fetchU8())
        const imm = this.fetchU16()
        const val = this.getRM16(m)
        switch (m.reg) {
          case 0: { // ADD
            const result = val + imm
            this.cf = result > 0xFFFF
            this.setRM16(m, result)
            this.setFlagsArith16(result)
            break
          }
          case 5: { // SUB
            const result = val - imm
            this.cf = result < 0
            this.setRM16(m, result)
            this.setFlagsArith16(result)
            break
          }
          case 7: { // CMP
            const result = val - imm
            this.cf = result < 0
            this.setFlagsArith16(result)
            break
          }
          default:
            throw new Error(`Unimplemented 81 /${m.reg}`)
        }
        break
      }

      // ADD r/m16, r16 (01)
      case 0x01: {
        const m = this.decodeModRM(this.fetchU8())
        const a = this.getRM16(m)
        const b = this.getR16(m.reg)
        const result = a + b
        this.cf = result > 0xFFFF
        this.setRM16(m, result)
        this.setFlagsArith16(result)
        break
      }

      // ADC r/m16, r16 (11)
      case 0x11: {
        const m = this.decodeModRM(this.fetchU8())
        const a = this.getRM16(m)
        const b = this.getR16(m.reg)
        const result = a + b + (this.cf ? 1 : 0)
        this.cf = result > 0xFFFF
        this.setRM16(m, result)
        this.setFlagsArith16(result)
        break
      }

      // SBB r/m16, r16 (19)
      case 0x19: {
        const m = this.decodeModRM(this.fetchU8())
        const a = this.getRM16(m)
        const b = this.getR16(m.reg)
        const result = a - b - (this.cf ? 1 : 0)
        this.cf = result < 0
        this.setRM16(m, result)
        this.setFlagsArith16(result)
        break
      }

      // SUB r/m16, r16 (29)
      case 0x29: {
        const m = this.decodeModRM(this.fetchU8())
        const a = this.getRM16(m)
        const b = this.getR16(m.reg)
        const result = a - b
        this.cf = result < 0
        this.setRM16(m, result)
        this.setFlagsArith16(result)
        break
      }

      // XOR r/m16, r16 (31)
      case 0x31: {
        const m = this.decodeModRM(this.fetchU8())
        const result = this.getRM16(m) ^ this.getR16(m.reg)
        this.cf = false
        this.of = false
        this.setRM16(m, result)
        this.setFlagsArith16(result)
        break
      }

      // CMP r/m16, r16 (39)
      case 0x39: {
        const m = this.decodeModRM(this.fetchU8())
        const result = this.getRM16(m) - this.getR16(m.reg)
        this.cf = result < 0
        this.setFlagsArith16(result)
        break
      }

      // SUB AL, imm8 (2C)
      case 0x2C: {
        const imm = this.fetchU8()
        const al = this.ax & 0xFF
        const result = al - imm
        this.cf = result < 0
        this.setFlagsArith8(result)
        this.ax = (this.ax & 0xFF00) | (result & 0xFF)
        break
      }

      // CMP AL, imm8 (3C)
      case 0x3C: {
        const imm = this.fetchU8()
        const result = (this.ax & 0xFF) - imm
        this.cf = result < 0
        this.setFlagsArith8(result)
        break
      }

      // REP prefix (F3)
      case 0xF3: {
        const next = this.fetchU8()
        if (next === 0xA4) {
          // REP MOVSB
          while (this.cx > 0) {
            this.writeU8(this.di, this.readU8(this.si))
            this.si = (this.si + (this.df ? -1 : 1)) & 0xFFFF
            this.di = (this.di + (this.df ? -1 : 1)) & 0xFFFF
            this.cx = (this.cx - 1) & 0xFFFF
          }
        } else if (next === 0xA5) {
          // REP MOVSW
          while (this.cx > 0) {
            this.writeU16(this.di, this.readU16(this.si))
            this.si = (this.si + (this.df ? -2 : 2)) & 0xFFFF
            this.di = (this.di + (this.df ? -2 : 2)) & 0xFFFF
            this.cx = (this.cx - 1) & 0xFFFF
          }
        } else {
          throw new Error(`Unimplemented REP + 0x${next.toString(16)}`)
        }
        break
      }

      // NOT/NEG r/m16 (F7)
      case 0xF7: {
        const m = this.decodeModRM(this.fetchU8())
        const val = this.getRM16(m)
        switch (m.reg) {
          case 2: // NOT
            this.setRM16(m, ~val & 0xFFFF)
            break
          case 3: // NEG
            this.cf = val !== 0
            this.setRM16(m, (-val) & 0xFFFF)
            this.setFlagsArith16(-val)
            break
          default:
            throw new Error(`Unimplemented F7 /${m.reg}`)
        }
        break
      }

      default:
        throw new Error(`Unimplemented opcode 0x${op.toString(16).padStart(2, '0')} at IP=0x${((this.ip - 1) & 0xFFFF).toString(16)}`)
    }
  }

  /** Run until halted or IP reaches stopAddr, with a maximum step count as safety. */
  run(stopAddr: number, maxSteps = 10_000_000) {
    for (let i = 0; i < maxSteps && !this.halted; i++) {
      if (this.ip === stopAddr) return
      this.step()
    }
    if (!this.halted) throw new Error('x86 emulator: maximum step count exceeded')
  }
}
