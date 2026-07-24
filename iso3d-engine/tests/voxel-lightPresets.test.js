/**
 * Headless tests — run with: node tests/voxel-lightPresets.test.js
 */

// Minimal in-memory localStorage polyfill — same pattern the other library test files use.
const memoryStore = new Map();
global.localStorage = {
  getItem: (k) => (memoryStore.has(k) ? memoryStore.get(k) : null),
  setItem: (k, v) => memoryStore.set(k, String(v)),
  removeItem: (k) => memoryStore.delete(k),
};

import {
  createLightPreset, loadLightPresetLibrary, saveLightPresetLibrary,
  addLightPresetToLibrary, removeLightPresetFromLibrary,
} from '../src/voxel/lightPresets.js';

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

console.log('createLightPreset — slugified id (same convention as materials/objects/decals), state stored verbatim');
{
  const state = { sunAzimuth: '222', sunStrength: '2.5', fogColor: '#112233' };
  const entry = createLightPreset('Golden Hour', state);
  assert(entry.id === 'golden_hour', 'name is slugified into the id');
  assert(entry.name === 'Golden Hour', 'original name preserved for display');
  assert(entry.state === state, 'state blob stored as-is (voxel.html owns its shape, this module has no opinion on it)');
  assert(typeof entry.createdAt === 'number', 'createdAt timestamp is set');
}

console.log('light preset library persistence (localStorage) — same shape as every other content library');
{
  saveLightPresetLibrary([]); // clean slate
  assert(loadLightPresetLibrary().length === 0, 'starts empty');

  const a = createLightPreset('Golden Hour', { sunStrength: '2.5' });
  const b = createLightPreset('Midnight Crypt', { sunStrength: '0.08' });
  addLightPresetToLibrary(a);
  addLightPresetToLibrary(b);
  assert(loadLightPresetLibrary().length === 2, 'two distinct presets persisted');

  const updated = createLightPreset('Golden Hour', { sunStrength: '3.0' }); // same name -> same id
  addLightPresetToLibrary(updated);
  const lib = loadLightPresetLibrary();
  assert(lib.length === 2, 're-saving under the same name REPLACES the existing entry, not a duplicate');
  assert(lib.find((e) => e.id === 'golden_hour').state.sunStrength === '3.0', 'the replaced entry carries the new state');

  removeLightPresetFromLibrary('midnight_crypt');
  const lib2 = loadLightPresetLibrary();
  assert(lib2.length === 1 && lib2[0].id === 'golden_hour', 'removeLightPresetFromLibrary drops only the targeted entry');
  assert(loadLightPresetLibrary().length === 1, 'persistence survives a fresh load call, not just in-memory');
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
