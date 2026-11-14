import { describe, it, expect, beforeEach } from 'vitest'
import { theme, setTheme, toggleTheme } from './theme'

// There is no DOM in this test environment, which is exactly the situation
// theme.ts is written to tolerate: it guards every `document` access so the
// signal and its persistence work without a browser.

describe('theme', () => {
  beforeEach(() => {
    localStorage.clear()
    setTheme('light')
  })

  it('defaults to a valid theme', () => {
    expect(['light', 'dark']).toContain(theme.value)
  })

  it('sets an explicit theme', () => {
    setTheme('dark')
    expect(theme.value).toBe('dark')
    setTheme('light')
    expect(theme.value).toBe('light')
  })

  it('toggles between the two', () => {
    setTheme('light')
    toggleTheme()
    expect(theme.value).toBe('dark')
    toggleTheme()
    expect(theme.value).toBe('light')
  })

  it('persists the choice to localStorage', () => {
    setTheme('dark')
    expect(localStorage.getItem('ch8ter-theme')).toBe('dark')
    setTheme('light')
    expect(localStorage.getItem('ch8ter-theme')).toBe('light')
  })

  it('works without a document, so the signal is usable outside a browser', () => {
    expect(typeof document).toBe('undefined')
    expect(() => setTheme('dark')).not.toThrow()
    expect(() => toggleTheme()).not.toThrow()
    expect(theme.value).toBe('light')
  })

  it('survives localStorage throwing on write', () => {
    const original = localStorage.setItem
    localStorage.setItem = () => { throw new Error('quota exceeded') }
    try {
      expect(() => setTheme('dark')).not.toThrow()
      // The in-memory signal still changes even if persistence failed
      expect(theme.value).toBe('dark')
    } finally {
      localStorage.setItem = original
    }
  })
})
