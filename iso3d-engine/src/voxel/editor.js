/**
 * Pure editing logic for the voxel store: apply an edit while recording an inverse op,
 * and undo it later. No DOM/canvas here — voxel.html owns input handling and calls into
 * this module, which is what makes the history logic independently testable.
 */

export function isBedrock(blockStr) {
  return !!blockStr && (blockStr === 'bedrock' || blockStr.startsWith('bedrock:') || blockStr.startsWith('bedrock#'));
}

export class EditorHistory {
  constructor(limit = 200) {
    this.stack = [];
    this.limit = limit;
  }

  canUndo() {
    return this.stack.length > 0;
  }

  push(op) {
    this.stack.push(op);
    if (this.stack.length > this.limit) this.stack.shift();
  }

  /** Pop the last op and revert it on `store`. Returns false if there was nothing to undo. */
  undo(store) {
    const op = this.stack.pop();
    if (!op) return false;
    if (op.prev == null) store.remove(op.c, op.r, op.z);
    else store.set(op.c, op.r, op.z, op.prev);
    return true;
  }

  clear() {
    this.stack.length = 0;
  }
}

/**
 * Set (or clear, if nextValueOrNull is null) a single cell, recording the inverse into
 * `history`. No-ops (setting the same value that's already there) are not recorded.
 * Returns true if the store actually changed.
 */
export function applyEdit(store, history, c, r, z, nextValueOrNull) {
  const prev = store.get(c, r, z);
  if (prev === nextValueOrNull) return false;
  if (nextValueOrNull == null) store.remove(c, r, z);
  else store.set(c, r, z, nextValueOrNull);
  history.push({ c, r, z, prev, next: nextValueOrNull });
  return true;
}
