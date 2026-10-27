// UI theme (light/dark) with localStorage persistence.

import { signal } from '@preact/signals'

const THEME_KEY = 'ch8ter-theme'
const hasLocalStorage = typeof localStorage !== 'undefined'

function loadTheme(): 'light' | 'dark' {
  if (!hasLocalStorage) return 'light'
  try {
    return localStorage.getItem(THEME_KEY) === 'dark' ? 'dark' : 'light'
  } catch {
    return 'light'
  }
}

export const theme = signal<'light' | 'dark'>(loadTheme())

function applyTheme() {
  if (typeof document !== 'undefined') {
    document.documentElement.classList.toggle('dark', theme.value === 'dark')
  }
}

export function setTheme(t: 'light' | 'dark') {
  theme.value = t
  if (hasLocalStorage) {
    try {
      localStorage.setItem(THEME_KEY, t)
    } catch { /* ignore */ }
  }
  applyTheme()
}

export function toggleTheme() {
  setTheme(theme.value === 'dark' ? 'light' : 'dark')
}

// Apply the persisted theme at startup
if (typeof document !== 'undefined') applyTheme()
