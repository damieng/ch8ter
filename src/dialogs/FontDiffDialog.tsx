// Compare two open fonts glyph-by-glyph: pixels only-in-A are blue,
// pixels only-in-B are red, shared pixels dark gray. Useful for verifying
// format round-trips and tracking down conversion differences.

import { useState, useMemo, useRef, useEffect } from 'preact/hooks'
import { type FontInstance, glyphCount, fonts as allFonts } from '../store'
import { DialogOverlay } from '../components/DialogOverlay'
import { getBit, bpr } from '../bitUtils'

interface DiffEntry {
  charCode: number
  state: 'diff' | 'onlyA' | 'onlyB'
}

const COLOR_A_ONLY = '#2563eb'
const COLOR_B_ONLY = '#dc2626'
const COLOR_SHARED = '#1f2937'

function pixelAt(font: FontInstance, idx: number, x: number, y: number): boolean {
  const w = font.glyphWidth.value
  const h = font.glyphHeight.value
  if (x < 0 || x >= w || y < 0 || y >= h) return false
  return getBit(font.fontData.value, idx * h * bpr(w) + y * bpr(w), x)
}

/** Union char range, clamped to keep the pixel scan bounded. */
function diffRange(a: FontInstance, b: FontInstance): [number, number] {
  const start = Math.min(a.startChar.value, b.startChar.value)
  const rawEnd = Math.max(
    a.startChar.value + glyphCount(a) - 1,
    b.startChar.value + glyphCount(b) - 1,
  )
  return [start, Math.min(rawEnd, start + 4095)]
}

function computeDiff(a: FontInstance, b: FontInstance): DiffEntry[] {
  const [start, end] = diffRange(a, b)
  const maxW = Math.max(a.glyphWidth.value, b.glyphWidth.value)
  const maxH = Math.max(a.glyphHeight.value, b.glyphHeight.value)
  const entries: DiffEntry[] = []

  for (let code = start; code <= end; code++) {
    const ai = code - a.startChar.value
    const bi = code - b.startChar.value
    const inA = ai >= 0 && ai < glyphCount(a)
    const inB = bi >= 0 && bi < glyphCount(b)
    if (!inA && !inB) continue

    let aHas = false
    let bHas = false
    let differs = false
    for (let y = 0; y < maxH; y++) {
      for (let x = 0; x < maxW; x++) {
        const pa = inA && pixelAt(a, ai, x, y)
        const pb = inB && pixelAt(b, bi, x, y)
        if (pa) aHas = true
        if (pb) bHas = true
        if (pa !== pb) differs = true
      }
    }
    if (!aHas && !bHas) continue
    if (!aHas) entries.push({ charCode: code, state: 'onlyB' })
    else if (!bHas) entries.push({ charCode: code, state: 'onlyA' })
    else if (differs) entries.push({ charCode: code, state: 'diff' })
  }
  return entries
}

function charLabel(code: number): string {
  return code >= 33 && code < 127
    ? `"${String.fromCharCode(code)}"`
    : `U+${code.toString(16).toUpperCase().padStart(4, '0')}`
}

/**
 * Draw an overlay comparison into a canvas: pixels found only in A are
 * blue, pixels only in B are red, shared pixels dark gray.
 */
function drawOverlay(
  canvas: HTMLCanvasElement,
  a: FontInstance, aIdx: number,
  b: FontInstance, bIdx: number,
  scale: number,
) {
  const w = Math.max(a.glyphWidth.value, b.glyphWidth.value)
  const h = Math.max(a.glyphHeight.value, b.glyphHeight.value)
  canvas.width = w * scale
  canvas.height = h * scale
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#f3f4f6'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const pa = pixelAt(a, aIdx, x, y)
      const pb = pixelAt(b, bIdx, x, y)
      if (pa && pb) ctx.fillStyle = COLOR_SHARED
      else if (pa) ctx.fillStyle = COLOR_A_ONLY
      else if (pb) ctx.fillStyle = COLOR_B_ONLY
      else continue
      ctx.fillRect(x * scale, y * scale, scale, scale)
    }
  }
}

function OverlayTile({ a, b, entry, scale, onPick }: {
  a: FontInstance
  b: FontInstance
  entry: DiffEntry
  scale: number
  onPick: () => void
}) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    if (!ref.current) return
    const aIdx = entry.charCode - a.startChar.value
    const bIdx = entry.charCode - b.startChar.value
    drawOverlay(ref.current, a, aIdx, b, Math.max(0, bIdx), scale)
  })
  return (
    <button
      class="flex flex-col items-center gap-0.5 p-1 rounded border border-gray-300 bg-white hover:border-blue-400"
      onClick={onPick}
      title={`${charLabel(entry.charCode)} — ${entry.state}`}
    >
      <canvas ref={ref} style={{ imageRendering: 'pixelated' }} />
      <span class="text-[10px] font-mono text-gray-600">{charLabel(entry.charCode)}</span>
    </button>
  )
}

function SideBySide({ a, b, charCode, scale }: { a: FontInstance; b: FontInstance; charCode: number; scale: number }) {
  const aRef = useRef<HTMLCanvasElement>(null)
  const bRef = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    if (aRef.current) drawOverlay(aRef.current, a, charCode - a.startChar.value, a, charCode - a.startChar.value, scale)
    if (bRef.current) drawOverlay(bRef.current, b, charCode - b.startChar.value, b, charCode - b.startChar.value, scale)
  })
  return (
    <div class="flex items-start gap-3">
      <div class="flex flex-col items-center gap-1">
        <canvas ref={aRef} style={{ imageRendering: 'pixelated' }} />
        <span class="text-xs text-gray-600">A</span>
      </div>
      <div class="flex flex-col items-center gap-1">
        <canvas ref={bRef} style={{ imageRendering: 'pixelated' }} />
        <span class="text-xs text-gray-600">B</span>
      </div>
    </div>
  )
}

export function FontDiffDialog({ font, onClose }: { font: FontInstance; onClose: () => void }) {
  const all = allFonts.value
  const [aId, setAId] = useState(font.id)
  const [bId, setBId] = useState(all.find(f => f.id !== font.id)?.id ?? font.id)
  const [picked, setPicked] = useState<number | null>(null)

  const a = all.find(f => f.id === aId) ?? font
  const b = all.find(f => f.id === bId) ?? font

  const entries = useMemo(() => (a.id === b.id ? [] : computeDiff(a, b)), [a.id, b.id])
  const [rangeStart] = useMemo(() => diffRange(a, b), [a.id, b.id])

  return (
    <DialogOverlay onClose={onClose} label="Compare fonts">
      <div class="bg-gray-50 rounded-lg shadow-2xl border border-gray-300 flex flex-col w-[640px] max-h-[80vh]">
        <div class="px-5 py-2 bg-blue-100 border-b border-gray-300 rounded-t-lg">
          <h2 class="font-bold text-lg">Compare fonts</h2>
        </div>
        <div class="flex flex-col gap-3 px-5 py-4 overflow-hidden">
          <div class="flex items-center gap-3">
            <label class="text-sm text-gray-600">
              A
              <select
                class="ml-2 px-2 py-1 bg-white rounded border border-gray-300 text-sm"
                value={aId}
                onChange={(e) => { setAId((e.target as HTMLSelectElement).value); setPicked(null) }}
              >
                {all.map(f => <option key={f.id} value={f.id}>{f.fileName.value}</option>)}
              </select>
            </label>
            <label class="text-sm text-gray-600">
              B
              <select
                class="ml-2 px-2 py-1 bg-white rounded border border-gray-300 text-sm"
                value={bId}
                onChange={(e) => { setBId((e.target as HTMLSelectElement).value); setPicked(null) }}
              >
                {all.map(f => <option key={f.id} value={f.id}>{f.fileName.value}</option>)}
              </select>
            </label>
            <span class="ml-auto text-sm text-gray-600">
              {a.id === b.id
                ? 'Pick two different fonts'
                : entries.length === 0
                  ? 'Glyphs are identical'
                  : `${entries.length} differing glyph${entries.length === 1 ? '' : 's'}`}
            </span>
          </div>

          <div class="flex items-center gap-4 text-xs text-gray-500">
            <span class="flex items-center gap-1"><span class="inline-block w-3 h-3" style={{ background: COLOR_A_ONLY }} /> only in A</span>
            <span class="flex items-center gap-1"><span class="inline-block w-3 h-3" style={{ background: COLOR_B_ONLY }} /> only in B</span>
            <span class="flex items-center gap-1"><span class="inline-block w-3 h-3 bg-gray-800" /> shared (in the diff tile)</span>
            {(() => {
              const [, end] = diffRange(a, b)
              const rawEnd = Math.max(a.startChar.value + glyphCount(a) - 1, b.startChar.value + glyphCount(b) - 1)
              return rawEnd > end ? <span class="text-amber-600">range truncated at 4096 characters</span> : null
            })()}
          </div>

          {picked !== null && (
            <div class="border border-gray-200 rounded p-3 bg-white flex items-center gap-4">
              <SideBySide a={a} b={b} charCode={picked} scale={6} />
              <div class="text-sm text-gray-700">
                <div class="font-mono font-bold">{charLabel(picked)}</div>
                <div class="text-xs text-gray-500 mt-1">A: {a.glyphWidth.value}×{a.glyphHeight.value}, B: {b.glyphWidth.value}×{b.glyphHeight.value}</div>
              </div>
              <button class="ml-auto text-sm text-gray-500 hover:text-gray-700" onClick={() => setPicked(null)}>close</button>
            </div>
          )}

          <div class="overflow-y-auto border border-gray-200 rounded bg-gray-100 p-2 min-h-[120px]">
            {a.id === b.id ? (
              <div class="text-sm text-gray-400 p-2">Select two different fonts to compare.</div>
            ) : entries.length === 0 ? (
              <div class="text-sm text-gray-400 p-2">No differences found in the compared range.</div>
            ) : (
              <div class="flex flex-wrap gap-1.5">
                {entries.map(entry => (
                  <OverlayTile
                    key={entry.charCode}
                    a={a}
                    b={b}
                    entry={entry}
                    scale={2}
                    onPick={() => setPicked(picked === entry.charCode ? null : entry.charCode)}
                  />
                ))}
              </div>
            )}
          </div>
          <div class="text-[11px] text-gray-400">
            Comparing character codes {charLabel(rangeStart)} … {charLabel(diffRange(a, b)[1])} by cell pixels from the top-left; baseline offsets are not normalized.
          </div>
        </div>
      </div>
    </DialogOverlay>
  )
}
