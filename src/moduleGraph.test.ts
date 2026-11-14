import { describe, it, expect } from 'vitest'

/**
 * The store used to sit in two runtime import cycles:
 *
 *   store <-> persistence   (store imported persistence; persistence imported
 *                            createFont from store)
 *   store <-> undoHistory   (store held an UndoHistory; undoHistory imported
 *                            font helpers from store)
 *
 * Both resolved only because the borrowed values happened to be hoisted
 * function *declarations*. Replacing one with a `const` arrow function would
 * have thrown a TDZ error at startup, with nothing in the type system or the
 * test suite to catch it. These tests pin the runtime module graph.
 *
 * `import type` and inline `type` specifiers are excluded: they are erased by
 * the compiler, so they cannot take part in a runtime cycle.
 */

// Vite gives us the sources as text, so no Node typings are needed here.
const SOURCES = import.meta.glob<string>('./**/*.{ts,tsx}', {
  query: '?raw',
  import: 'default',
  eager: true,
})

/** './foo/bar.ts' -> the key in SOURCES, with a leading './'. */
function keyOf(path: string): string {
  return path.startsWith('./') ? path : `./${path}`
}

function sourceOf(path: string): string | undefined {
  return SOURCES[keyOf(path)]
}

/** Local module specifiers this file needs at run time. */
function runtimeDeps(path: string): string[] {
  const src = sourceOf(path)
  if (src === undefined) throw new Error(`no source for ${path}`)
  const deps: string[] = []
  for (const m of src.matchAll(/^import\s+([\s\S]*?)\s+from\s+'(\.[^']+)'/gm)) {
    const clause = m[1].trim()
    if (clause.startsWith('type ')) continue
    const named = clause.match(/\{([\s\S]*)\}$/)
    if (!named) {
      deps.push(m[2]) // default or namespace import: a runtime dependency
      continue
    }
    const specs = named[1].split(',').map(s => s.trim()).filter(Boolean)
    if (specs.some(s => !s.startsWith('type '))) deps.push(m[2])
  }
  return deps
}

/** Resolve a relative specifier against the known module keys. */
function resolveModule(fromPath: string, spec: string): string | null {
  const dir = keyOf(fromPath).replace(/\/[^/]*$/, '')
  const parts = `${dir}/${spec}`.split('/')
  const out: string[] = []
  for (const part of parts) {
    if (part === '.' || part === '') continue
    if (part === '..') out.pop()
    else out.push(part)
  }
  const base = './' + out.join('/')
  for (const ext of ['.ts', '.tsx']) {
    if (SOURCE_KEYS.has(base + ext)) return base.slice(2) + ext
  }
  for (const ext of ['.ts', '.tsx']) {
    const idx = `${base}/index${ext}`
    if (SOURCE_KEYS.has(idx)) return idx.slice(2) + ext
  }
  return null
}

const SOURCE_KEYS = new Set(Object.keys(SOURCES))

/** Depth-first search for a path from `start` back to itself. */
function findCycle(startPath: string): string[] | null {
  const seen = new Set<string>()
  const stack: string[] = []

  function visit(path: string): string[] | null {
    if (stack.includes(path)) return [...stack.slice(stack.indexOf(path)), path]
    if (seen.has(path)) return null
    seen.add(path)
    stack.push(path)
    for (const spec of runtimeDeps(path)) {
      const next = resolveModule(path, spec)
      if (next) {
        const found = visit(next)
        if (found) return found
      }
    }
    stack.pop()
    return null
  }

  return visit(startPath)
}

describe('runtime module graph', () => {
  // Self-check: if the helpers stopped finding real edges, every assertion
  // below would pass for the wrong reason.
  it('reads sources and resolves real edges', () => {
    expect(sourceOf('store.ts')).toBeDefined()
    expect(runtimeDeps('store.ts')).toContain('./persistence')
    expect(resolveModule('store.ts', './fontModel')).toBe('fontModel.ts')
  })

  it('has no cycle through store.ts', () => {
    expect(findCycle('store.ts')).toBeNull()
  })

  it('has no cycle through fontModel.ts', () => {
    expect(findCycle('fontModel.ts')).toBeNull()
  })

  it('has no cycle through persistence.ts', () => {
    expect(findCycle('persistence.ts')).toBeNull()
  })

  it('has no cycle through undoHistory.ts', () => {
    expect(findCycle('undoHistory.ts')).toBeNull()
  })

  it('keeps the font model independent of the app layers', () => {
    const deps = runtimeDeps('fontModel.ts')
    for (const forbidden of ['./store', './persistence', './undoHistory']) {
      expect(deps, `fontModel must not import ${forbidden}`).not.toContain(forbidden)
    }
  })

  it('keeps persistence free of the store\'s runtime values', () => {
    // persistence builds fonts, so it must take createFont from fontModel;
    // importing it from store would close the cycle again
    const deps = runtimeDeps('persistence.ts')
    expect(deps).not.toContain('./store')
    expect(deps).toContain('./fontModel')
  })
})
