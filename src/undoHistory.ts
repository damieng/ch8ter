import { type FontInstance, bytesPerGlyph, bytesPerRow, markDirty } from './store'
import { getBit, setBit, bpr as calcBpr } from './bitUtils'
import { type GlyphTransform, type TransformResult, rotateCWBytes, rotateCCWBytes } from './glyphTransforms'

function isRotation(t: GlyphTransform): boolean {
  return t === rotateCWBytes || t === rotateCCWBytes
}

/** Top-left clip/pad srcBytes (srcW × srcH) into a dstW × dstH glyph. */
function clipGlyphBytes(srcBytes: Uint8Array, srcW: number, srcH: number, dstW: number, dstH: number): Uint8Array {
  const srcBpr = calcBpr(srcW)
  const dstBpr = calcBpr(dstW)
  const out = new Uint8Array(dstH * dstBpr)
  const minH = Math.min(srcH, dstH)
  const minW = Math.min(srcW, dstW)
  for (let y = 0; y < minH; y++) {
    for (let x = 0; x < minW; x++) {
      if (getBit(srcBytes, y * srcBpr, x)) setBit(out, y * dstBpr, x)
    }
  }
  return out
}

type RotationLive = { data: Uint8Array; w: number; h: number }

function snapshotRotationLive(font: FontInstance, indices: Iterable<number>): Map<number, RotationLive> {
  const snap = new Map<number, RotationLive>()
  for (const i of indices) {
    const e = font.glyphRotationLive.get(i)
    if (e) snap.set(i, { data: e.data.slice(), w: e.w, h: e.h })
  }
  return snap
}

function restoreRotationLive(font: FontInstance, indices: Iterable<number>, snap: Map<number, RotationLive>) {
  for (const i of indices) {
    const e = snap.get(i)
    if (e) font.glyphRotationLive.set(i, { data: e.data.slice(), w: e.w, h: e.h })
    else font.glyphRotationLive.delete(i)
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

function execRotateGlyphs(
  font: FontInstance, indices: number[],
  transformFn: typeof rotateCWBytes | typeof rotateCCWBytes, name: string,
) {
  const w = font.glyphWidth.value
  const h = font.glyphHeight.value
  const bpg = bytesPerGlyph(font)

  const beforeBytes = new Map<number, Uint8Array>()
  const afterBytes = new Map<number, Uint8Array>()
  const newLive = new Map<number, RotationLive>()
  for (const idx of indices) {
    beforeBytes.set(idx, snapshotGlyph(font, idx))
    const prev = font.glyphRotationLive.get(idx)
    const srcBytes = prev?.data ?? snapshotGlyph(font, idx)
    const srcW = prev?.w ?? w
    const srcH = prev?.h ?? h
    const result = transformFn(srcBytes, srcW, srcH) as TransformResult
    newLive.set(idx, { data: result.data, w: result.w, h: result.h })
    afterBytes.set(idx, clipGlyphBytes(result.data, result.w, result.h, w, h))
  }
  const prevLive = snapshotRotationLive(font, indices)

  const cmd: UndoCommand = {
    name,
    execute() {
      const data = new Uint8Array(font.fontData.value)
      for (const idx of indices) data.set(afterBytes.get(idx)!, idx * bpg)
      font.fontData.value = data
      for (const idx of indices) {
        const live = newLive.get(idx)!
        font.glyphRotationLive.set(idx, { data: live.data.slice(), w: live.w, h: live.h })
      }
      markDirty(font)
    },
    undo() {
      const data = new Uint8Array(font.fontData.value)
      for (const idx of indices) data.set(beforeBytes.get(idx)!, idx * bpg)
      font.fontData.value = data
      restoreRotationLive(font, indices, prevLive)
      markDirty(font)
    },
  }
  cmd.execute()
  font.undoHistory.push(cmd)
}

export function execTransformGlyph(
  font: FontInstance, index: number,
  transformFn: GlyphTransform, name: string,
) {
  if (isRotation(transformFn)) {
    execRotateGlyphs(font, [index], transformFn as typeof rotateCWBytes, name)
    return
  }
  const w = font.glyphWidth.value
  const h = font.glyphHeight.value
  const before = snapshotGlyph(font, index)
  const after = transformFn(before, w, h) as Uint8Array
  const prevLive = snapshotRotationLive(font, [index])
  const cmd: UndoCommand = {
    name,
    execute() {
      restoreGlyph(font, index, after)
      font.glyphRotationLive.delete(index)
      markDirty(font)
    },
    undo() {
      restoreGlyph(font, index, before)
      restoreRotationLive(font, [index], prevLive)
      markDirty(font)
    },
  }
  cmd.execute()
  font.undoHistory.push(cmd)
}

export function execTransformSelection(
  font: FontInstance,
  transformFn: GlyphTransform, name: string,
) {
  const indices = [...font.selectedGlyphs.value]
  if (isRotation(transformFn)) {
    execRotateGlyphs(font, indices, transformFn as typeof rotateCWBytes, name)
    return
  }
  const w = font.glyphWidth.value
  const h = font.glyphHeight.value
  const bpg = bytesPerGlyph(font)
  const befores = indices.map(i => snapshotGlyph(font, i))
  const afters = befores.map(b => transformFn(b, w, h) as Uint8Array)
  const prevLive = snapshotRotationLive(font, indices)
  const cmd: UndoCommand = {
    name,
    execute() {
      const data = new Uint8Array(font.fontData.value)
      for (let i = 0; i < indices.length; i++) data.set(afters[i], indices[i] * bpg)
      font.fontData.value = data
      for (const idx of indices) font.glyphRotationLive.delete(idx)
      markDirty(font)
    },
    undo() {
      const data = new Uint8Array(font.fontData.value)
      for (let i = 0; i < indices.length; i++) data.set(befores[i], indices[i] * bpg)
      font.fontData.value = data
      restoreRotationLive(font, indices, prevLive)
      markDirty(font)
    },
  }
  cmd.execute()
  font.undoHistory.push(cmd)
}

export function execClearGlyph(font: FontInstance, index: number) {
  const bpg = bytesPerGlyph(font)
  const before = snapshotGlyph(font, index)
  const prevLive = snapshotRotationLive(font, [index])
  const cmd: UndoCommand = {
    name: 'Clear',
    execute() {
      restoreGlyph(font, index, new Uint8Array(bpg))
      font.glyphRotationLive.delete(index)
      markDirty(font)
    },
    undo() {
      restoreGlyph(font, index, before)
      restoreRotationLive(font, [index], prevLive)
      markDirty(font)
    },
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
  const prevLive = snapshotRotationLive(font, [index])
  const cmd: UndoCommand = {
    name: 'Paste',
    execute() {
      restoreGlyph(font, index, after)
      font.glyphRotationLive.delete(index)
      markDirty(font)
    },
    undo() {
      restoreGlyph(font, index, before)
      restoreRotationLive(font, [index], prevLive)
      markDirty(font)
    },
  }
  cmd.execute()
  font.undoHistory.push(cmd)
  return true
}

export function execCopyRange(
  font: FontInstance, srcStart: number, srcEnd: number, dstStart: number, name: string,
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
  const dstIndices = entries.map(e => e.dstIdx)
  const prevLive = snapshotRotationLive(font, dstIndices)
  const cmd: UndoCommand = {
    name,
    execute() {
      const data = new Uint8Array(font.fontData.value)
      for (const e of entries) data.set(e.srcBytes, e.dstIdx * bpg)
      font.fontData.value = data
      for (const idx of dstIndices) font.glyphRotationLive.delete(idx)
      markDirty(font)
    },
    undo() {
      const data = new Uint8Array(font.fontData.value)
      for (const e of entries) data.set(e.before, e.dstIdx * bpg)
      font.fontData.value = data
      restoreRotationLive(font, dstIndices, prevLive)
      markDirty(font)
    },
  }
  cmd.execute()
  font.undoHistory.push(cmd)
}

// --- Paint stroke (live painting, commit on mouseup) ---

let pendingStroke: { font: FontInstance; index: number; before: Uint8Array; prevLive: Map<number, RotationLive> } | null = null

export function beginPaintStroke(font: FontInstance, glyphIndex: number) {
  pendingStroke = {
    font,
    index: glyphIndex,
    before: snapshotGlyph(font, glyphIndex),
    prevLive: snapshotRotationLive(font, [glyphIndex]),
  }
}

export function commitPaintStroke(font: FontInstance) {
  if (!pendingStroke || pendingStroke.font !== font) { pendingStroke = null; return }
  const { index, before, prevLive } = pendingStroke
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
  font.glyphRotationLive.delete(index)
  markDirty(font)
  const cmd: UndoCommand = {
    name: 'Paint',
    execute() {
      restoreGlyph(font, index, after)
      font.glyphRotationLive.delete(index)
      markDirty(font)
    },
    undo() {
      restoreGlyph(font, index, before)
      restoreRotationLive(font, [index], prevLive)
      markDirty(font)
    },
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
