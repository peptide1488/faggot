/**
 * Headless tests — run with: node tests/voxel-decals.test.js
 */

// Minimal in-memory localStorage polyfill — same pattern voxel-customMaterials.test.js uses,
// needed to actually exercise the decal-type library round trip, not just confirm it no-ops.
const memoryStore = new Map();
global.localStorage = {
  getItem: (k) => (memoryStore.has(k) ? memoryStore.get(k) : null),
  setItem: (k, v) => memoryStore.set(k, String(v)),
  removeItem: (k) => memoryStore.delete(k),
};

import {
  DecalStore, decalKeyFor, parseDecalKey, registerDecalType, deleteDecalType, DECAL_TYPES,
  createDecalType, loadDecalTypeLibrary, saveDecalTypeLibrary, addDecalTypeToLibrary, removeDecalTypeFromLibrary,
} from '../src/voxel/decals.js';
import { VoxelStore } from '../src/voxel/store.js';
import { buildDecalMesh, quadCount } from '../src/voxel/mesher.js';
import { resolveLighting } from '../src/voxel/lighting.js';

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

console.log('decalKeyFor / parseDecalKey round-trip');
{
  const key = decalKeyFor(3, -2, 1, 'north');
  assert(key === '3,-2,1,north', 'key format is c,r,z,face');
  const parsed = parseDecalKey(key);
  assert(parsed.c === 3 && parsed.r === -2 && parsed.z === 1 && parsed.face === 'north', 'parseDecalKey recovers all 4 fields, including a negative coordinate');
}

console.log('DecalStore basic get/set/remove/has, keyed by (c,r,z,face) not just (c,r,z)');
{
  const store = new DecalStore();
  assert(store.get(1, 1, 0, 'north') === null, 'empty store has no decal');
  store.set(1, 1, 0, 'north', 'moss');
  assert(store.get(1, 1, 0, 'north') === 'moss', 'set/get round-trips the type');
  assert(store.has(1, 1, 0, 'north'), 'has() reflects a placed decal');
  assert(!store.has(1, 1, 0, 'south'), 'a different FACE on the same cell is a distinct slot — untouched');
  assert(store.size === 1, 'size reflects one placed decal');

  // Same cell, two different faces AND two different types — proves the key genuinely
  // includes face, not just (c,r,z) like VoxelStore's block key.
  store.set(1, 1, 0, 'south', 'bloodstain');
  assert(store.size === 2, 'a second decal on a different face of the SAME cell is a separate entry');
  assert(store.get(1, 1, 0, 'south') === 'bloodstain', 'the second face keeps its own independent type');
  assert(store.get(1, 1, 0, 'north') === 'moss', 'the first face is unaffected by adding the second');

  store.remove(1, 1, 0, 'north');
  assert(!store.has(1, 1, 0, 'north') && store.has(1, 1, 0, 'south'), 'remove() only clears the targeted face, not the whole cell');
}

console.log('DecalStore.entries() lists every placed decal with its c/r/z/face/type');
{
  const store = new DecalStore();
  store.set(0, 0, 0, 'top', 'scorch');
  store.set(2, 3, 1, 'east', 'poster');
  const entries = store.entries().sort((a, b) => a.c - b.c);
  assert(entries.length === 2, 'two placed decals -> two entries');
  assert(entries[0].c === 0 && entries[0].face === 'top' && entries[0].type === 'scorch', 'first entry carries correct c/face/type');
  assert(entries[1].c === 2 && entries[1].r === 3 && entries[1].z === 1 && entries[1].face === 'east' && entries[1].type === 'poster', 'second entry carries correct c/r/z/face/type');
}

console.log('DecalStore save/load round-trip (toJSON/fromJSON)');
{
  const store = new DecalStore();
  store.set(5, 5, 2, 'west', 'crack');
  store.set(-1, 0, 0, 'bottom', 'moss');
  const json = store.toJSON();
  assert(json.v === 1, 'save format is version-tagged');

  const reloaded = DecalStore.fromJSON(json);
  assert(reloaded.size === 2, 'reloaded store has the same number of decals');
  assert(reloaded.get(5, 5, 2, 'west') === 'crack', 'first decal survives the round trip');
  assert(reloaded.get(-1, 0, 0, 'bottom') === 'moss', 'a negative coordinate survives the round trip too');

  const reloadedFromString = DecalStore.fromJSON(JSON.stringify(json));
  assert(reloadedFromString.get(5, 5, 2, 'west') === 'crack', 'fromJSON also accepts a raw JSON string, not just a parsed object');

  let threw = false;
  try {
    DecalStore.fromJSON({ v: 999, decals: {} });
  } catch {
    threw = true;
  }
  assert(threw, 'a mismatched save version throws instead of silently loading garbage');
}

console.log('decal type registry — separate from BLOCKS, id+name only (texture handling is the caller\'s job)');
{
  assert(DECAL_TYPES.test_moss === undefined, 'starts unregistered');
  registerDecalType('test_moss', { name: 'Moss' });
  assert(DECAL_TYPES.test_moss.name === 'Moss', 'registerDecalType stores the def under its id');
  deleteDecalType('test_moss');
  assert(DECAL_TYPES.test_moss === undefined, 'deleteDecalType unregisters it');
}

console.log('buildDecalMesh — one bucket per decal TYPE, quads inset off the host face\'s plane');
{
  const store = new VoxelStore();
  store.set(5, 5, 0, 'stone');
  const decals = new DecalStore();
  decals.set(5, 5, 0, 'north', 'moss');
  const { byType } = buildDecalMesh(store, decals);
  assert(Object.keys(byType).length === 1 && byType.moss, 'exactly one bucket, keyed by the decal type');
  assert(quadCount(byType.moss) === 1, 'one placed decal produces exactly one quad');

  // North face of cell (5,5,0): FACE_VERTS.north at y=5 (uninset). The decal's normal is
  // (0,-1,0) (north), so an inset toward the world should move y slightly BELOW 5 (more
  // negative), not sit exactly coplanar with the block's own north face.
  const y0 = byType.moss.positions[1]; // first vertex's y
  assert(y0 < 5 && y0 > 4.9, 'the decal quad is inset slightly off the host face\'s exact plane (toward the face\'s outward normal), not z-fighting with it');
}

console.log('buildDecalMesh — different decal types land in separate buckets, same type shares one bucket');
{
  const store = new VoxelStore();
  store.set(0, 0, 0, 'stone');
  store.set(1, 0, 0, 'stone');
  const decals = new DecalStore();
  decals.set(0, 0, 0, 'north', 'moss');
  decals.set(0, 0, 0, 'south', 'bloodstain');
  decals.set(1, 0, 0, 'north', 'moss'); // second "moss" decal, different cell
  const { byType } = buildDecalMesh(store, decals);
  assert(Object.keys(byType).length === 2, 'two distinct decal types -> two buckets, not three (one per placed decal)');
  assert(quadCount(byType.moss) === 2, 'both "moss" decals share the same bucket/texture, 2 quads total');
  assert(quadCount(byType.bloodstain) === 1, 'the lone "bloodstain" decal has its own single-quad bucket');
}

console.log('buildDecalMesh — reads the HOST cell\'s own lighting (AO/sun/ambient), not a flat/unlit sprite');
{
  const store = new VoxelStore();
  store.set(5, 5, 0, 'stone');
  store.set(20, 20, 0, 'stone'); // far away, stays unlit — same setup as the buildMesh lightProfile test
  const decals = new DecalStore();
  decals.set(5, 5, 0, 'top', 'scorch');
  decals.set(20, 20, 0, 'top', 'scorch');

  const dungeon = resolveLighting({
    mode: 'dungeon',
    points: [{ col: 5, row: 5, radius: 4, intensity: 1.5, color: [1.0, 0.55, 0.22] }],
  });
  const { byType } = buildDecalMesh(store, decals, { lightProfile: dungeon });
  assert(quadCount(byType.scorch) === 2, 'both decals present, one quad each');
  const litR = byType.scorch.colors[0];
  const darkR = byType.scorch.colors[4 * 3]; // second quad's first vertex (R channel)
  assert(litR > darkR, 'the decal near the torch is genuinely brighter than the one far away — real lighting, not a flat unlit overlay');
}

console.log('createDecalType — slugified id (same convention as customMaterials/customObjects), library persistence');
{
  const entry = createDecalType('Mossy Crack');
  assert(entry.id === 'mossy_crack', 'name is slugified into the id, same convention every content type uses');
  assert(DECAL_TYPES.mossy_crack.name === 'Mossy Crack', 'createDecalType registers into the live DECAL_TYPES registry');
  deleteDecalType('mossy_crack');

  saveDecalTypeLibrary([]); // clean slate
  assert(loadDecalTypeLibrary().length === 0, 'starts empty');
  addDecalTypeToLibrary({ id: 'moss', name: 'Moss' });
  addDecalTypeToLibrary({ id: 'blood', name: 'Blood' });
  assert(loadDecalTypeLibrary().length === 2, 'two distinct entries persisted');
  removeDecalTypeFromLibrary('moss');
  const lib = loadDecalTypeLibrary();
  assert(lib.length === 1 && lib[0].id === 'blood', 'removeDecalTypeFromLibrary drops only the targeted entry, survives a fresh load call');
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
