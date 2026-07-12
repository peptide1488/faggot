/**
 * Headless tests — run with: node tests/voxel-pick.test.js
 */

import { VoxelStore } from '../src/voxel/store.js';
import { raycastVoxels, adjacentCell } from '../src/voxel/pick.js';

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

console.log('axis-aligned rays');
{
  const store = new VoxelStore();
  store.set(2, 2, 0, 'stone');

  // Straight down onto the top face.
  const down = raycastVoxels(store, [2.5, 2.5, 10], [0, 0, -1]);
  assert(down && down.c === 2 && down.r === 2 && down.z === 0, 'straight-down ray hits the cube');
  assert(down.face === 'top', 'straight-down ray hits the TOP face');

  // Straight up from below onto the bottom face.
  const up = raycastVoxels(store, [2.5, 2.5, -10], [0, 0, 1]);
  assert(up && up.face === 'bottom', 'straight-up ray hits the BOTTOM face');

  // Along +x into the west face.
  const fromWest = raycastVoxels(store, [-10, 2.5, 0.5], [1, 0, 0]);
  assert(fromWest && fromWest.face === 'west', 'ray traveling +x hits the WEST face');

  // Along -x into the east face.
  const fromEast = raycastVoxels(store, [10, 2.5, 0.5], [-1, 0, 0]);
  assert(fromEast && fromEast.face === 'east', 'ray traveling -x hits the EAST face');

  // Along +r (south direction) into the north face.
  const fromNorth = raycastVoxels(store, [2.5, -10, 0.5], [0, 1, 0]);
  assert(fromNorth && fromNorth.face === 'north', 'ray traveling +r hits the NORTH face');

  // Along -r (north direction) into the south face.
  const fromSouth = raycastVoxels(store, [2.5, 10, 0.5], [0, -1, 0]);
  assert(fromSouth && fromSouth.face === 'south', 'ray traveling -r hits the SOUTH face');
}

console.log('diagonal rays');
{
  const store = new VoxelStore();
  store.set(5, 5, 0, 'stone');

  // 45-degree ray from high above and to the northwest, aimed at the block's top.
  const diag = raycastVoxels(store, [4.0, 4.0, 10], [1, 1, -8]);
  assert(diag && diag.c === 5 && diag.r === 5, '45-degree-ish diagonal ray still lands on the right cell');
  assert(diag.face === 'top', 'steep diagonal ray still hits the top face first');

  // A genuinely 45-degree horizontal-diagonal ray should hit whichever of north/west comes
  // first in traversal order — just confirm it registers a hit on the correct cell at all.
  const flatDiag = raycastVoxels(store, [3.5, 3.5, 0.5], [1, 1, 0]);
  assert(flatDiag && flatDiag.c === 5 && flatDiag.r === 5, 'flat 45-degree diagonal ray reaches the cube');
  assert(flatDiag.face === 'north' || flatDiag.face === 'west', 'flat diagonal hits a leading edge face');

  // Ray missing entirely: y=x+3 never enters the cube's y-range [5,6] while x is in [5,6].
  const missDiag = raycastVoxels(store, [0, 3, 0.5], [1, 1, 0]);
  assert(!missDiag, 'diagonal ray that passes beside the cube (not through it) misses');
}

console.log('slab hits');
{
  const store = new VoxelStore();
  store.set(0, 0, 0, 'stone#slab'); // occupies z in [0, 0.5]

  const hitTop = raycastVoxels(store, [0.5, 0.5, 5], [0, 0, -1]);
  assert(hitTop && hitTop.face === 'top', 'ray straight down hits the slab surface');
  assert(Math.abs(hitTop.point[2] - 0.5) < 1e-9, 'slab top hit lands at z=0.5, not z=1');

  // A ray through the slab's empty upper half (z in [0.5, 1]) should pass through to
  // whatever is behind/below it instead of registering a false hit at full-cube height.
  const store2 = new VoxelStore();
  store2.set(0, 0, 0, 'stone#slab');
  store2.set(0, 0, -1, 'bedrock'); // solid floor beneath, for the pass-through ray to land on
  const passThrough = raycastVoxels(store2, [0.5, 0.5, 0.75], [1, 0, 0]);
  // At z=0.75 (above the slab's 0.5 top), moving along +x should NOT hit the slab cell at
  // z=0 — there's nothing else at z=0.75 in this store, so it should miss entirely.
  assert(!passThrough, 'ray through a slab-cell\'s empty upper half does not register a false hit');
}

console.log('miss = null');
{
  const store = new VoxelStore();
  store.set(0, 0, 0, 'stone');
  const miss = raycastVoxels(store, [10, 10, 10], [1, 1, 1]);
  assert(miss === null, 'ray pointed away from all geometry returns null');

  const emptyStore = new VoxelStore();
  const emptyMiss = raycastVoxels(emptyStore, [0.5, 0.5, 5], [0, 0, -1]);
  assert(emptyMiss === null, 'ray into a completely empty store returns null');
}

console.log('translucent skip (water is see-through unless requested)');
{
  const store = new VoxelStore();
  store.set(0, 0, 0, 'water');
  store.set(0, 0, -1, 'bedrock');

  const throughWater = raycastVoxels(store, [0.5, 0.5, 5], [0, 0, -1]);
  assert(throughWater && throughWater.z === -1, 'default pick sees through water to the bedrock below');

  const hitWater = raycastVoxels(store, [0.5, 0.5, 5], [0, 0, -1], { includeTranslucent: true });
  assert(hitWater && hitWater.z === 0 && hitWater.block === 'water', 'includeTranslucent:true targets the water itself');
}

console.log('adjacentCell');
{
  const store = new VoxelStore();
  store.set(2, 2, 0, 'stone');
  const hit = raycastVoxels(store, [2.5, 2.5, 10], [0, 0, -1]);
  const adj = adjacentCell(hit);
  assert(adj.c === 2 && adj.r === 2 && adj.z === 1, 'placing on the top face lands one level up in the same column');
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
