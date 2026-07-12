/**
 * Headless tests — run with: node tests/voxel-editor.test.js
 */

import { VoxelStore } from '../src/voxel/store.js';
import { EditorHistory, applyEdit, isBedrock } from '../src/voxel/editor.js';

let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (cond) {
    passed += 1;
    console.log(`  OK  ${msg}`);
  } else {
    failed += 1;
    console.error(`  FAIL  ${msg}`);
  }
}

console.log('applyEdit + undo');
{
  const store = new VoxelStore();
  const history = new EditorHistory();

  assert(!history.canUndo(), 'fresh history has nothing to undo');

  const changed1 = applyEdit(store, history, 0, 0, 0, 'stone');
  assert(changed1 === true, 'placing on an empty cell reports a change');
  assert(store.get(0, 0, 0) === 'stone', 'cell now holds the new value');
  assert(history.canUndo(), 'history now has an undoable op');

  const noop = applyEdit(store, history, 0, 0, 0, 'stone');
  assert(noop === false, 'setting the same value again is a no-op');

  const changed2 = applyEdit(store, history, 0, 0, 0, 'dirt');
  assert(changed2 === true, 'retyping (paint) an occupied cell reports a change');
  assert(store.get(0, 0, 0) === 'dirt', 'cell now holds the retyped value');

  history.undo(store);
  assert(store.get(0, 0, 0) === 'stone', 'undo restores the previous value (stone)');

  history.undo(store);
  assert(store.get(0, 0, 0) === null, 'undoing the original placement clears the cell entirely');

  assert(!history.canUndo(), 'history is empty again after undoing everything');
  assert(history.undo(store) === false, 'undoing an empty history is a safe no-op');
}

console.log('remove via applyEdit(null)');
{
  const store = new VoxelStore();
  const history = new EditorHistory();
  store.set(1, 1, 1, 'grass');

  applyEdit(store, history, 1, 1, 1, null);
  assert(!store.has(1, 1, 1), 'passing null removes the block');

  history.undo(store);
  assert(store.get(1, 1, 1) === 'grass', 'undoing a removal restores the original block');
}

console.log('history size limit');
{
  const store = new VoxelStore();
  const history = new EditorHistory(3);
  for (let i = 0; i < 5; i++) applyEdit(store, history, i, 0, 0, 'stone');
  assert(history.stack.length === 3, 'history is capped at its configured limit');
}

console.log('isBedrock');
{
  assert(isBedrock('bedrock') === true, 'plain bedrock string is bedrock');
  assert(isBedrock('bedrock:N') === true, 'bedrock with a facing suffix still counts (defensive)');
  assert(isBedrock('stone') === false, 'stone is not bedrock');
  assert(isBedrock(null) === false, 'null is not bedrock');
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
