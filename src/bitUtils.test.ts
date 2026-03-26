import { describe, it, expect } from 'vitest'
import { bpr, bpg, getBit, setBit, clearBit } from './bitUtils'

describe('bpr', () => {
  it('returns 1 for widths 1-8', () => {
    for (let w = 1; w <= 8; w++) expect(bpr(w)).toBe(1)
  })

  it('returns 2 for widths 9-16', () => {
    for (let w = 9; w <= 16; w++) expect(bpr(w)).toBe(2)
  })

  it('returns 3 for width 24', () => {
    expect(bpr(24)).toBe(3)
  })
})

describe('bpg', () => {
  it('computes bytes per glyph', () => {
    expect(bpg(8, 8)).toBe(8)
    expect(bpg(8, 16)).toBe(16)
    expect(bpg(16, 16)).toBe(32)
    expect(bpg(12, 10)).toBe(20) // 2 bytes/row * 10 rows
  })
})

describe('getBit / setBit / clearBit', () => {
  it('reads zero from empty data', () => {
    const data = new Uint8Array(2)
    for (let x = 0; x < 16; x++) expect(getBit(data, 0, x)).toBe(false)
  })

  it('setBit sets the correct bit (MSBit-first)', () => {
    const data = new Uint8Array(1)
    setBit(data, 0, 0) // leftmost bit
    expect(data[0]).toBe(0x80)
  })

  it('setBit sets bit 7 (rightmost of first byte)', () => {
    const data = new Uint8Array(1)
    setBit(data, 0, 7)
    expect(data[0]).toBe(0x01)
  })

  it('getBit reads back what setBit wrote', () => {
    const data = new Uint8Array(2)
    setBit(data, 0, 3)
    setBit(data, 0, 11)
    expect(getBit(data, 0, 3)).toBe(true)
    expect(getBit(data, 0, 11)).toBe(true)
    expect(getBit(data, 0, 0)).toBe(false)
    expect(getBit(data, 0, 4)).toBe(false)
  })

  it('clearBit clears a set bit', () => {
    const data = new Uint8Array(1)
    setBit(data, 0, 2)
    expect(getBit(data, 0, 2)).toBe(true)
    clearBit(data, 0, 2)
    expect(getBit(data, 0, 2)).toBe(false)
  })

  it('clearBit does not affect other bits', () => {
    const data = new Uint8Array(1)
    setBit(data, 0, 0)
    setBit(data, 0, 7)
    clearBit(data, 0, 0)
    expect(getBit(data, 0, 0)).toBe(false)
    expect(getBit(data, 0, 7)).toBe(true)
  })

  it('respects byte offset', () => {
    const data = new Uint8Array(4)
    setBit(data, 2, 0) // sets bit 0 in byte at offset 2
    expect(data[0]).toBe(0)
    expect(data[1]).toBe(0)
    expect(data[2]).toBe(0x80)
    expect(data[3]).toBe(0)
  })
})
