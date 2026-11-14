import { describe, it, expect, beforeEach } from 'vitest'
import { raiseWindow, getZIndex, windowZ, POPUP_Z } from './windowStack'

/** Reset the module-level counter between tests. */
function reset() {
  windowZ.value = {}
  // zTop is private; raising from empty repeatedly is enough to exceed it
}

describe('window stacking', () => {
  beforeEach(reset)

  it('gives an unknown window the bottom z-index', () => {
    expect(getZIndex('nothing')).toBe(1)
  })

  it('raises a window above the others', () => {
    raiseWindow('a')
    raiseWindow('b')
    expect(getZIndex('b')).toBeGreaterThan(getZIndex('a'))
  })

  it('moves an existing window to the top when raised again', () => {
    raiseWindow('a')
    raiseWindow('b')
    raiseWindow('a')
    expect(getZIndex('a')).toBeGreaterThan(getZIndex('b'))
  })

  it('keeps every window below the popup layer', () => {
    for (let i = 0; i < 50; i++) raiseWindow(`w${i}`)
    for (let i = 0; i < 50; i++) {
      expect(getZIndex(`w${i}`)).toBeLessThan(POPUP_Z)
    }
  })

  it('renormalizes past the threshold without losing or merging windows', () => {
    // Push past the 5000 renormalization point
    for (let i = 0; i < 5100; i++) raiseWindow(`w${i % 20}`)
    const values = Object.values(windowZ.value)
    expect(values.length).toBe(20)
    expect(new Set(values).size).toBe(20) // still distinct
    // and everything is still far below the popup layer
    expect(Math.max(...values)).toBeLessThan(POPUP_Z)
  })

  it('preserves stacking order across a renormalization', () => {
    for (let i = 0; i < 5100; i++) raiseWindow(`w${i % 5}`)
    const order = ['w0', 'w1', 'w2', 'w3', 'w4']
      .map(id => [id, getZIndex(id)] as const)
      .sort((a, b) => a[1] - b[1])
      .map(([id]) => id)
    // The last raised is on top
    expect(order[order.length - 1]).toBe('w4')
  })

  it('does not mutate the previous map in place', () => {
    raiseWindow('a')
    const before = windowZ.value
    raiseWindow('b')
    expect(windowZ.value).not.toBe(before)
    expect(before.b).toBeUndefined()
  })
})
