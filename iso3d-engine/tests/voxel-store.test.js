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
  BEDROCK_DEPTH,
  STONE_DEPTH,
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

console.log('genStrata layering — fixed BEDROCK_DEPTH/STONE_DEPTH base under every column (user request)');
{
  const baseZ = BEDROCK_DEPTH + STONE_DEPTH;

  // h=0 grass: 3-course grass stack (top/mid/base) eats 2 layers of the stone band so sides
  // show GRASS_SIDE / DIRT / GRASS_BASE auto courses on every natural grass column.
  const flat = genStrata(1, 1, () => 0, () => 'grass');
  for (let z = 0; z < BEDROCK_DEPTH; z++) assert(flat.get(0, 0, z) === 'bedrock', `h=0: bedrock at z=${z}`);
  for (let z = BEDROCK_DEPTH; z < baseZ - 2; z++) assert(flat.get(0, 0, z) === 'stone', `h=0: stone at z=${z}`);
  assert(flat.get(0, 0, baseZ - 2) === 'grass', 'h=0: grass base course 2 below surface');
  assert(flat.get(0, 0, baseZ - 1) === 'grass', 'h=0: grass mid course 1 below surface');
  assert(flat.get(0, 0, baseZ) === 'grass', 'h=0: grass top course at surface');
  assert(!flat.has(0, 0, baseZ + 1), 'h=0 column has nothing above its own surface');

  // h=4 grass: extra height is stone under a 3-high grass stack (no dirt filler under grass).
  const tall = genStrata(1, 1, () => 4, () => 'grass');
  assert(tall.get(0, 0, baseZ) === 'stone', 'h=4: extra stone directly above the fixed base');
  assert(tall.get(0, 0, baseZ + 1) === 'stone', 'h=4: extra stone (2nd layer)');
  assert(tall.get(0, 0, baseZ + 2) === 'grass', 'h=4: grass base course');
  assert(tall.get(0, 0, baseZ + 3) === 'grass', 'h=4: grass mid course');
  assert(tall.get(0, 0, baseZ + 4) === 'grass', 'h=4: grass top course at surface');

  // Ocean (water surface): a dedicated single sand layer right under the water — borrows one
  // layer from the stone band rather than adding extra depth, so it stays flush with land at
  // the same height (no 1-block step at the shoreline).
  const ocean = genStrata(1, 1, () => 0, () => 'water');
  assert(ocean.get(0, 0, baseZ - 1) === 'sand', 'ocean floor: exactly one sand layer directly beneath the water');
  assert(ocean.get(0, 0, baseZ) === 'water', 'ocean: water block at the surface itself, flush with land at the same height');
  for (let z = BEDROCK_DEPTH; z < baseZ - 1; z++) assert(ocean.get(0, 0, z) === 'stone', `ocean: stone at z=${z} (one fewer layer than land, to make room for the sand)`);

  // A non-water sand SURFACE (a beach, not underwater) still uses the generic 2-deep filler
  // rule when it has extra height room — distinct from the ocean's own single-layer rule above.
  const beach = genStrata(1, 1, () => 2, () => 'sand');
  assert(beach.get(0, 0, baseZ) === 'sand', 'beach (h=2): sand filler 2 below surface');
  assert(beach.get(0, 0, baseZ + 1) === 'sand', 'beach (h=2): sand filler 1 below surface');
  assert(beach.get(0, 0, baseZ + 2) === 'sand', 'beach (h=2): sand surface on top');

  // void/pit surfaces produce no column at all.
  const withVoid = genStrata(2, 1, () => 2, (c) => (c === 1 ? null : 'grass'));
  assert(withVoid.has(0, 0, baseZ + 2), 'non-void column exists');
  assert(!withVoid.has(1, 0, 0) && !withVoid.has(1, 0, baseZ + 2), 'void column has no blocks at all');
}

console.log('fromLegacyMap converter');
{
  // Surface now sits at BEDROCK_DEPTH+STONE_DEPTH+h, not bare h — see genStrata's own doc
  // comment on the new fixed-depth base (user request).
  const baseZ = BEDROCK_DEPTH + STONE_DEPTH;
  const legacy = buildDemoMap(12, 12);
  const store = fromLegacyMap(legacy);
  // Spot-check a handful of cells the legacy demo map is known to set explicitly.
  for (let r = 0; r < legacy.rows; r++) {
    for (let c = 0; c < legacy.cols; c++) {
      const cell = legacy.cells[r * legacy.cols + c];
      const surfaceZ = baseZ + cell.h;
      const got = store.get(c, r, surfaceZ);
      assert(got != null, `legacy cell (${c},${r}) converted to a non-empty voxel column`);
    }
  }
  const waterCell = legacy.cells[0]; // (0,0) is water in buildDemoMap
  assert(waterCell.type === TERRAIN.WATER, 'sanity: legacy (0,0) is water');
  assert(store.get(0, 0, baseZ + waterCell.h) === 'water', 'water cell converts to a water block at its surface z');
}

console.log('fromGrimoireTiles converter');
{
  const baseZ = BEDROCK_DEPTH + STONE_DEPTH;
  const tiles = { '0,0': 'grass', '1,0': 'wall', '2,0': 'water', '3,0': 'void' };
  const height = { '0,0': 0, '1,0': 2, '2,0': 0, '3,0': 0 };
  const store = fromGrimoireTiles(4, 1, tiles, height);
  assert(store.get(0, 0, baseZ) === 'grass', 'grass tile converts directly');
  assert(store.get(1, 0, baseZ + 2) === 'dungeon_wall', 'wall tile becomes dungeon_wall at its height');
  assert(store.get(2, 0, baseZ) === 'water', 'water tile converts to a water block');
  assert(!store.has(3, 0, 0), 'void tile produces no column');
  assert(GRIMOIRE_TO_VOXEL.wall === 'dungeon_wall', 'wall mapping is dungeon_wall');
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
