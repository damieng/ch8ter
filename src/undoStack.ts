// The undo/redo stack itself, with no knowledge of fonts.
// Kept separate from undoHistory.ts so the font type can depend on the stack
// without the stack depending on the font (which would be a cycle: store.ts
// types FontInstance, and undoHistory.ts imports those types).

export interface UndoCommand {
  name: string
  execute(): void
  undo(): void
}

export interface UndoHistoryEntry {
  name: string
  /** past = already executed (undoable), future = redoable */
  state: 'past' | 'future'
  /** how many undo/redo steps to reach this entry's boundary */
  steps: number
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

  /** Entries newest-executed-first, then redoable entries in order. */
  list(): UndoHistoryEntry[] {
    const entries: UndoHistoryEntry[] = []
    for (let i = this.undoStack.length - 1; i >= 0; i--) {
      entries.push({ name: this.undoStack[i].name, state: 'past', steps: this.undoStack.length - i })
    }
    for (let i = 0; i < this.redoStack.length; i++) {
      entries.push({ name: this.redoStack[i].name, state: 'future', steps: i + 1 })
    }
    return entries
  }

  /** Undo (or redo) the given number of steps, stopping when exhausted. */
  jump(steps: number, direction: 'undo' | 'redo') {
    for (let i = 0; i < steps; i++) {
      const moved = direction === 'undo' ? this.undo() : this.redo()
      if (!moved) break
    }
  }
}
