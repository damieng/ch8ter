// Character metric classification for ISO-8859-1.
// Each character is tagged with which font metrics it exhibits.

export const Metric = {
  Baseline:  1,   // sits on the baseline (most printable chars)
  Ascender:  2,   // extends to ascender line (b, d, h, k, l, etc.)
  Descender: 4,   // extends below baseline (g, j, p, q, y, etc.)
  CapHeight: 8,   // extends to cap height (A-Z, accented uppercase)
  XHeight:   16,  // top reaches x-height (a, c, e, m, n, o, etc.)
  NumHeight: 32,  // extends to numeric height (0-9)
} as const

// Map from codepoint to metric flags.
// Only covers ISO-8859-1 (0x20-0xFF). Characters not in the map have no metrics.
const M: Record<number, number> = {}

function tag(chars: string, flags: number) {
  for (let i = 0; i < chars.length; i++) M[chars.charCodeAt(i)] = (M[chars.charCodeAt(i)] ?? 0) | flags
}

// Baseline: nearly everything sits on it
tag('ABCDEFGHIJKLMNOPQRSTUVWXYZ', Metric.Baseline | Metric.CapHeight)
tag('abcdeghimnorsuvwxz', Metric.Baseline | Metric.XHeight)  // no ascender/descender
tag('fklbt', Metric.Baseline | Metric.Ascender)               // ascender, no descender
tag('dhl', Metric.Baseline | Metric.Ascender)                  // ascender, x-height top
tag('gpqy', Metric.Baseline | Metric.XHeight | Metric.Descender) // descender
tag('j', Metric.Baseline | Metric.Ascender | Metric.Descender)
tag('0123456789', Metric.Baseline | Metric.NumHeight)

// Accented uppercase - cap height + baseline
tag('\u00C0\u00C1\u00C2\u00C3\u00C4\u00C5\u00C6\u00C7\u00C8\u00C9\u00CA\u00CB\u00CC\u00CD\u00CE\u00CF', Metric.Baseline | Metric.CapHeight)
tag('\u00D0\u00D1\u00D2\u00D3\u00D4\u00D5\u00D6\u00D8\u00D9\u00DA\u00DB\u00DC\u00DD\u00DE', Metric.Baseline | Metric.CapHeight)

// Accented lowercase with ascenders
tag('\u00E0\u00E1\u00E2\u00E3\u00E4\u00E5\u00E6\u00E8\u00E9\u00EA\u00EB\u00EC\u00ED\u00EE\u00EF', Metric.Baseline | Metric.Ascender)
tag('\u00F1\u00F2\u00F3\u00F4\u00F5\u00F6\u00F8\u00F9\u00FA\u00FB\u00FC\u00FD\u00FF', Metric.Baseline | Metric.Ascender)

// Accented lowercase with descenders
tag('\u00E7', Metric.Baseline | Metric.XHeight | Metric.Descender) // ç
tag('\u00FE', Metric.Baseline | Metric.Ascender | Metric.Descender) // þ

// Punctuation and symbols on baseline
tag('!"\u0027()*+,-./:;<=>?@[\\]^_`{|}~', Metric.Baseline)
tag('#$%&', Metric.Baseline)

export function getCharMetrics(codepoint: number): number {
  return M[codepoint] ?? 0
}

// Characters to scan for each metric detection.
const BASELINE_CHARS = 'HIEFLTixz'
const ASCENDER_CHARS = 'bdhkl'
const CAP_HEIGHT_CHARS = 'HIEFLT'
const X_HEIGHT_CHARS = 'xzvwcoe'
const NUM_HEIGHT_CHARS = '014789'
const DESCENDER_CHARS = 'gpqy'

// Raw font data params to avoid circular dependency with store
interface FontData {
  data: Uint8Array
  startChar: number
  w: number
  h: number
}

function glyphTopRow(data: Uint8Array, glyphIdx: number, w: number, h: number): number {
  const bpr = Math.ceil(w / 8)
  const base = glyphIdx * h * bpr
  for (let y = 0; y < h; y++) {
    for (let b = 0; b < bpr; b++) {
      if (data[base + y * bpr + b]) return y
    }
  }
  return -1
}

function glyphBottomRow(data: Uint8Array, glyphIdx: number, w: number, h: number): number {
  const bpr = Math.ceil(w / 8)
  const base = glyphIdx * h * bpr
  for (let y = h - 1; y >= 0; y--) {
    for (let b = 0; b < bpr; b++) {
      if (data[base + y * bpr + b]) return y
    }
  }
  return -1
}

function scanTop(fd: FontData, chars: string): number {
  const bpr = Math.ceil(fd.w / 8)
  const bpg = fd.h * bpr
  const gc = bpg > 0 ? Math.floor(fd.data.length / bpg) : 0
  let best = fd.h
  for (let i = 0; i < chars.length; i++) {
    const gi = chars.charCodeAt(i) - fd.startChar
    if (gi < 0 || gi >= gc) continue
    const top = glyphTopRow(fd.data, gi, fd.w, fd.h)
    if (top >= 0 && top < best) best = top
  }
  return best < fd.h ? best : -1
}

function scanBottom(fd: FontData, chars: string): number {
  const bpr = Math.ceil(fd.w / 8)
  const bpg = fd.h * bpr
  const gc = bpg > 0 ? Math.floor(fd.data.length / bpg) : 0
  let best = -1
  for (let i = 0; i < chars.length; i++) {
    const gi = chars.charCodeAt(i) - fd.startChar
    if (gi < 0 || gi >= gc) continue
    const bot = glyphBottomRow(fd.data, gi, fd.w, fd.h)
    if (bot > best) best = bot
  }
  return best
}

function fd(data: Uint8Array, startChar: number, w: number, h: number): FontData {
  return { data, startChar, w, h }
}

export function calcBaseline(data: Uint8Array, startChar: number, w: number, h: number): number {
  const bot = scanBottom(fd(data, startChar, w, h), BASELINE_CHARS)
  return bot >= 0 ? bot + 1 : h - 1
}

export function calcAscender(data: Uint8Array, startChar: number, w: number, h: number): number {
  return scanTop(fd(data, startChar, w, h), ASCENDER_CHARS)
}

export function calcCapHeight(data: Uint8Array, startChar: number, w: number, h: number): number {
  return scanTop(fd(data, startChar, w, h), CAP_HEIGHT_CHARS)
}

export function calcXHeight(data: Uint8Array, startChar: number, w: number, h: number): number {
  return scanTop(fd(data, startChar, w, h), X_HEIGHT_CHARS)
}

export function calcNumericHeight(data: Uint8Array, startChar: number, w: number, h: number): number {
  return scanTop(fd(data, startChar, w, h), NUM_HEIGHT_CHARS)
}

export function calcDescender(data: Uint8Array, startChar: number, w: number, h: number): number {
  const bot = scanBottom(fd(data, startChar, w, h), DESCENDER_CHARS)
  return bot >= 0 ? bot + 1 : -1
}

export function calcAllMetrics(data: Uint8Array, startChar: number, w: number, h: number) {
  return {
    baseline: calcBaseline(data, startChar, w, h),
    ascender: calcAscender(data, startChar, w, h),
    capHeight: calcCapHeight(data, startChar, w, h),
    xHeight: calcXHeight(data, startChar, w, h),
    numericHeight: calcNumericHeight(data, startChar, w, h),
    descender: calcDescender(data, startChar, w, h),
  }
}
