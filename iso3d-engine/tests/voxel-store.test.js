/**
 * Headless tests — run with: node tests/voxel-store.test.js
 */

import { buildDemoMap, TERRAIN } from '../src/map.js';
import {
  VoxelStore,
  genStrata,
  fromLegacyMap,
  fromGrimoireTiles,
  GRIMOIRE_TO_VOXEL,
} from '../src/voxel/store.js';

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

console.log('VoxelStore basics');
{
  const store = new VoxelStore();
  assert(store.size === 0, 'starts empty');
  store.set(1, 2, 0, 'grass');
  assert(store.has(1, 2, 0), 'has() true after set');
  assert(store.get(1, 2, 0) === 'grass', 'get() returns stored value');
  assert(store.get(9, 9, 9) === null, 'get() on absent cell = null (air)');
  store.remove(1, 2, 0);
  assert(!store.has(1, 2, 0), 'remove() clears the cell');
}

console.log('VoxelStore bounds + JSON round-trip');
{
  const store = new VoxelStore();
  store.set(0, 0, 0, 'bedrock');
  store.set(3, 5, 2, 'grass');
  const b = store.bounds();
  assert(b.minC === 0 && b.maxC === 3, 'bounds tracks col range');
  assert(b.minR === 0 && b.maxR === 5, 'bounds tracks row range');
  assert(b.minZ === 0 && b.maxZ === 2, 'bounds tracks z range');

  const json = store.toJSON();
  assert(json.v === 2, 'save format is version-tagged');
  assert(json.cols === 4 && json.rows === 6 && json.levels === 3, 'dims derived from bounds (+1)');

  const restored = VoxelStore.fromJSON(json);
  assert(restored.get(3, 5, 2) === 'grass', 'round-trip preserves a block');
  assert(restored.size === store.size, 'round-trip preserves count');

  let threw = false;
  try {
    VoxelStore.fromJSON({ v: 1, blocks: {} });
  } catch {
    threw = true;
  }
  assert(threw, 'fromJSON rejects an unsupported version instead of silently misreading it');
}

console.log('genStrata layering');
{
  // h=0: bare surface, no bedrock (no room below it).
  const flat = genStrata(1, 1, () => 0, () => 'grass');
  assert(flat.get(0, 0, 0) === 'grass', 'h=0 column is just the surface block');
  assert(!flat.has(0, 0, -1), 'h=0 column has nothing below z=0');

  // h=1: bedrock directly under the surface.
  const shallow = genStrata(1, 1, () => 1, () => 'grass');
  assert(shallow.get(0, 0, 0) === 'bedrock', 'h=1 column: bedrock at z=0');
  assert(shallow.get(0, 0, 1) === 'grass', 'h=1 column: surface at z=h');

  // h=4: bedrock, stone, 2x filler, surface.
  const tall = genStrata(1, 1, () => 4, () => 'grass');
  assert(tall.get(0, 0, 0) === 'bedrock', 'h=4: bedrock at z=0');
  assert(tall.get(0, 0, 1) === 'stone', 'h=4: stone in the middle');
  assert(tall.get(0, 0, 2) === 'dirt', 'h=4: dirt filler 2 below surface');
  assert(tall.get(0, 0, 3) === 'dirt', 'h=4: dirt filler 1 below surface');
  assert(tall.get(0, 0, 4) === 'grass', 'h=4: grass surface at top');

  // Sand/water surfaces use sand filler, not dirt.
  const pond = genStrata(1, 1, () => 3, () => 'water');
  assert(pond.get(0, 0, 2) === 'sand', 'water column: sand filler beneath the surface');
  assert(pond.get(0, 0, 3) === 'water', 'water column: water block at the surface itself');

  // void/pit surfaces produce no column at all.
  const withVoid = genStrata(2, 1, () => 2, (c) => (c === 1 ? null : 'grass'));
  assert(withVoid.has(0, 0, 2), 'non-void column exists');
  assert(!withVoid.has(1, 0, 0) && !withVoid.has(1, 0, 2), 'void column has no blocks at all');
}

console.log('fromLegacyMap converter');
{
  const legacy = buildDemoMap(12, 12);
  const store = fromLegacyMap(legacy);
  // Spot-check a handful of cells the legacy demo map is known to set explicitly.
  for (let r = 0; r < legacy.rows; r++) {
    for (let c = 0; c < legacy.cols; c++) {
      const cell = legacy.cells[r * legacy.cols + c];
      const surfaceZ = cell.h;
      const got = store.get(c, r, surfaceZ);
      assert(got != null, `legacy cell (${c},${r}) converted to a non-empty voxel column`);
    }
  }
  const waterCell = legacy.cells[0]; // (0,0) is water in buildDemoMap
  assert(waterCell.type === TERRAIN.WATER, 'sanity: legacy (0,0) is water');
  assert(store.get(0, 0, waterCell.h) === 'water', 'water cell converts to a water block at its surface z');
}

console.log('fromGrimoireTiles converter');
{
  const tiles = { '0,0': 'grass', '1,0': 'wall', '2,0': 'water', '3,0': 'void' };
  const height = { '0,0': 0, '1,0': 2, '2,0': 0, '3,0': 0 };
  const store = fromGrimoireTiles(4, 1, tiles, height);
  assert(store.get(0, 0, 0) === 'grass', 'grass tile converts directly');
  assert(store.get(1, 0, 2) === 'dungeon_wall', 'wall tile becomes dungeon_wall at its height');
  assert(store.get(2, 0, 0) === 'water', 'water tile converts to a water block');
  assert(!store.has(3, 0, 0), 'void tile produces no column');
  assert(GRIMOIRE_TO_VOXEL.wall === 'dungeon_wall', 'wall mapping is dungeon_wall');
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
