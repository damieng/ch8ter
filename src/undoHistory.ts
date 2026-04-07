import { type FontInstance, bytesPerGlyph, bytesPerRow, markDirty } from './store'
import { setBit, bpr as calcBpr } from './bitUtils'
import { type GlyphTransform, type TransformResult, isDimensionSwapping } from './glyphTransforms'

function repackageGlyph(
  src: Uint8Array, srcOff: number, _srcBpg: number, srcW: number,
  dst: Uint8Array, dstOff: number, _dstBpg: number, dstW: number, dstH: number,
) {
  const srcBpr = calcBpr(srcW)
  const dstBpr = calcBpr(dstW)
  const minH = dstH
  const minBpr = Math.min(srcBpr, dstBpr)
  for (let y = 0; y < minH; y++) {
    for (let b = 0; b < minBpr; b++) {
      dst[dstOff + y * dstBpr + b] = src[srcOff + y * srcBpr + b]
    }
  }
}

export interface UndoCommand {
  name: string
  execute(): void
  undo(): void
}

const MAX_HISTORY = 100

export class UndoHistory {
  private undoStack: UndoCommand[] = []
  private redoStack: UndoCommand[] = []

  push(cmd: UndoCommand) {
    this.undoStack.push(cmd)
    if (this.undoStack.length > MAX_HISTORY) this.undoStack.shift()
    this.redoStack.length = 0
  }

  undo(): boolean {
    const cmd = this.undoStack.pop()
    if (!cmd) return false
    cmd.undo()
    this.redoStack.push(cmd)
    return true
  }

  redo(): boolean {
    const cmd = this.redoStack.pop()
    if (!cmd) return false
    cmd.execute()
    this.undoStack.push(cmd)
    return true
  }

  clear() {
    this.undoStack.length = 0
    this.redoStack.length = 0
  }
}

// --- Helpers to snapshot/restore glyph bytes ---

function snapshotGlyph(font: FontInstance, index: number): Uint8Array {
  const bpg = bytesPerGlyph(font)
  const offset = index * bpg
  return font.fontData.value.slice(offset, offset + bpg)
}

function restoreGlyph(font: FontInstance, index: number, bytes: Uint8Array) {
  const bpg = bytesPerGlyph(font)
  const data = new Uint8Array(font.fontData.value)
  data.set(bytes, index * bpg)
  font.fontData.value = data
}

// --- Command factories ---

export function execTransformGlyph(
  font: FontInstance, index: number,
  transformFn: GlyphTransform, name: string
) {
  const w = font.glyphWidth.value
  const h = font.glyphHeight.value
  const before = snapshotGlyph(font, index)
  const rawAfter = transformFn(before, w, h)

  if (isDimensionSwapping(transformFn)) {
    const result = rawAfter as TransformResult
    const newW = result.w, newH = result.h
    const oldBpg = bytesPerGlyph(font)
    const newBpr = calcBpr(newW)
    const newBpg = newH * newBpr
    const oldData = font.fontData.value
    const glyphCount = oldBpg > 0 ? Math.floor(oldData.length / oldBpg) : 0
    const newData = new Uint8Array(glyphCount * newBpg)

    for (let i = 0; i < glyphCount; i++) {
      if (i === index) {
        newData.set(result.data, i * newBpg)
      } else {
        repackageGlyph(oldData, i * oldBpg, oldBpg, w, newData, i * newBpg, newBpg, newW, newH)
      }
    }

    const oldW = w, oldH = h, oldBaseline = font.baseline.value
    const oldBefore = oldData.slice()
    const cmd: UndoCommand = {
      name,
      execute() {
        font.glyphWidth.value = newW
        font.glyphHeight.value = newH
        font.baseline.value = Math.min(oldBaseline, newH - 1)
        font.fontData.value = newData.slice()
        markDirty(font)
      },
      undo() {
        font.glyphWidth.value = oldW
        font.glyphHeight.value = oldH
        font.baseline.value = oldBaseline
        font.fontData.value = oldBefore.slice()
        markDirty(font)
      },
    }
    cmd.execute()
    font.undoHistory.push(cmd)
  } else {
    const after = rawAfter as Uint8Array
    const cmd: UndoCommand = {
      name,
      execute() { restoreGlyph(font, index, after); markDirty(font) },
      undo() { restoreGlyph(font, index, before); markDirty(font) },
    }
    cmd.execute()
    font.undoHistory.push(cmd)
  }
}

export function execTransformSelection(
  font: FontInstance,
  transformFn: GlyphTransform, name: string
) {
  const w = font.glyphWidth.value
  const h = font.glyphHeight.value
  const bpg = bytesPerGlyph(font)
  const indices = [...font.selectedGlyphs.value]
  const befores = indices.map(i => snapshotGlyph(font, i))

  if (isDimensionSwapping(transformFn)) {
    const afters = befores.map(b => transformFn(b, w, h) as TransformResult)
    const newW = afters[0].w, newH = afters[0].h
    const newBpr = calcBpr(newW)
    const newBpg = newH * newBpr
    const glyphCount = bpg > 0 ? Math.floor(font.fontData.value.length / bpg) : 0
    const newData = new Uint8Array(glyphCount * newBpg)

    for (let i = 0; i < glyphCount; i++) {
      const idx = indices.indexOf(i)
      if (idx >= 0) {
        newData.set(afters[idx].data, i * newBpg)
      } else {
        repackageGlyph(font.fontData.value, i * bpg, bpg, w, newData, i * newBpg, newBpg, newW, newH)
      }
    }

    const oldW = w, oldH = h, oldBaseline = font.baseline.value
    const oldBefore = font.fontData.value.slice()
    const cmd: UndoCommand = {
      name,
      execute() {
        font.glyphWidth.value = newW
        font.glyphHeight.value = newH
        font.baseline.value = Math.min(oldBaseline, newH - 1)
        font.fontData.value = newData.slice()
        markDirty(font)
      },
      undo() {
        font.glyphWidth.value = oldW
        font.glyphHeight.value = oldH
        font.baseline.value = oldBaseline
        font.fontData.value = oldBefore.slice()
        markDirty(font)
      },
    }
    cmd.execute()
    font.undoHistory.push(cmd)
  } else {
    const afters = befores.map(b => transformFn(b, w, h) as Uint8Array)
    const cmd: UndoCommand = {
      name,
      execute() {
        const data = new Uint8Array(font.fontData.value)
        for (let i = 0; i < indices.length; i++) data.set(afters[i], indices[i] * bpg)
        font.fontData.value = data
        markDirty(font)
      },
      undo() {
        const data = new Uint8Array(font.fontData.value)
        for (let i = 0; i < indices.length; i++) data.set(befores[i], indices[i] * bpg)
        font.fontData.value = data
        markDirty(font)
      },
    }
    cmd.execute()
    font.undoHistory.push(cmd)
  }
}

export function execClearGlyph(font: FontInstance, index: number) {
  const bpg = bytesPerGlyph(font)
  const before = snapshotGlyph(font, index)
  const cmd: UndoCommand = {
    name: 'Clear',
    execute() { restoreGlyph(font, index, new Uint8Array(bpg)); markDirty(font) },
    undo() { restoreGlyph(font, index, before); markDirty(font) },
  }
  cmd.execute()
  font.undoHistory.push(cmd)
}

export function execPasteGlyph(font: FontInstance, index: number, text: string): boolean {
  const w = font.glyphWidth.value
  const h = font.glyphHeight.value
  const bpr = bytesPerRow(font)
  const bpg = bytesPerGlyph(font)
  const rows = text.split(/\r?\n/)
  if (rows.length !== h) return false
  const re = new RegExp(`^[ *]{${w}}$`)
  if (!rows.every(r => r.length === w && re.test(r))) return false
  const before = snapshotGlyph(font, index)
  const after = new Uint8Array(bpg)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (rows[y][x] === '*') {
        setBit(after, y * bpr, x)
      }
    }
  }
  const cmd: UndoCommand = {
    name: 'Paste',
    execute() { restoreGlyph(font, index, after); markDirty(font) },
    undo() { restoreGlyph(font, index, before); markDirty(font) },
  }
  cmd.execute()
  font.undoHistory.push(cmd)
  return true
}

export function execCopyRange(
  font: FontInstance, srcStart: number, srcEnd: number, dstStart: number, name: string
) {
  const s = font.startChar.value
  const bpg = bytesPerGlyph(font)
  const count = bpg > 0 ? Math.floor(font.fontData.value.length / bpg) : 0
  const entries: { dstIdx: number; before: Uint8Array; srcBytes: Uint8Array }[] = []
  for (let c = srcStart; c <= srcEnd; c++) {
    const srcIdx = c - s
    const dstIdx = (dstStart + (c - srcStart)) - s
    if (srcIdx >= 0 && srcIdx < count && dstIdx >= 0 && dstIdx < count) {
      entries.push({
        dstIdx,
        before: snapshotGlyph(font, dstIdx),
        srcBytes: snapshotGlyph(font, srcIdx),
      })
    }
  }
  const cmd: UndoCommand = {
    name,
    execute() {
      const data = new Uint8Array(font.fontData.value)
      for (const e of entries) data.set(e.srcBytes, e.dstIdx * bpg)
      font.fontData.value = data
      markDirty(font)
    },
    undo() {
      const data = new Uint8Array(font.fontData.value)
      for (const e of entries) data.set(e.before, e.dstIdx * bpg)
      font.fontData.value = data
      markDirty(font)
    },
  }
  cmd.execute()
  font.undoHistory.push(cmd)
}

// --- Paint stroke (live painting, commit on mouseup) ---

let pendingStroke: { font: FontInstance; index: number; before: Uint8Array } | null = null

export function beginPaintStroke(font: FontInstance, glyphIndex: number) {
  pendingStroke = {
    font,
    index: glyphIndex,
    before: snapshotGlyph(font, glyphIndex),
  }
}

export function commitPaintStroke(font: FontInstance) {
  if (!pendingStroke || pendingStroke.font !== font) { pendingStroke = null; return }
  const { index, before } = pendingStroke
  const after = snapshotGlyph(font, index)
  pendingStroke = null
  // Don't push if nothing changed
  let changed = false
  for (let i = 0; i < before.length; i++) { if (before[i] !== after[i]) { changed = true; break } }
  if (!changed) return
  // Assign a new array ref so the fontData signal fires for all subscribers
  // (tiles, preview, localStorage persistence).  During the stroke itself,
  // setPixel mutated in place and only bumped paintVersion.
  font.fontData.value = new Uint8Array(font.fontData.value)
  markDirty(font)
  const cmd: UndoCommand = {
    name: 'Paint',
    execute() { restoreGlyph(font, index, after); markDirty(font) },
    undo() { restoreGlyph(font, index, before); markDirty(font) },
  }
  font.undoHistory.push(cmd)
}

// --- Undo/Redo entry points ---

export function undo(font: FontInstance) {
  font.undoHistory.undo()
}

export function redo(font: FontInstance) {
  font.undoHistory.redo()
}
