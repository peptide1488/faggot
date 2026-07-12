/**
 * Headless tests — run with: node tests/voxel-surface.test.js
 */

import { VoxelStore } from '../src/voxel/store.js';
import { findSurface, surfaceToLegacyMap } from '../src/voxel/surface.js';
import { TERRAIN } from '../src/map.js';
import { findPath } from '../src/pathfinding.js';

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

console.log('findSurface — flat cube column');
{
  const store = new VoxelStore();
  store.set(0, 0, 0, 'stone');
  const surf = findSurface(store, 0, 0);
  assert(surf && surf.z === 0, 'finds the cube at z=0');
  assert(surf.standZ === 1, 'a full-cube surface stands at z+1');
}

console.log('findSurface — slab top');
{
  const store = new VoxelStore();
  store.set(0, 0, 0, 'stone');
  store.set(0, 0, 1, 'stone#slab');
  const surf = findSurface(store, 0, 0);
  assert(surf && surf.z === 1, 'finds the slab, not the cube beneath it');
  assert(surf.standZ === 1.5, 'a slab surface stands at z+0.5 (half-step)');
}

console.log('findSurface — insufficient clearance falls through to a lower surface');
{
  const store = new VoxelStore();
  store.set(0, 0, 0, 'stone'); // candidate floor
  store.set(0, 0, 1, 'stone'); // blocks headroom directly above it
  // No standable surface at z=0 (blocked) and z=1 IS the blocker itself, not a floor with
  // its own 2 clear cells above unless z=2,3 are empty — they are, so z=1 becomes the surface.
  const surf = findSurface(store, 0, 0);
  assert(surf && surf.z === 1, 'the topmost clear-headroom block wins, not the buried one');
}

console.log('findSurface — no standable surface at all');
{
  const empty = new VoxelStore();
  assert(findSurface(empty, 0, 0) === null, 'empty column has no surface');

  const pond = new VoxelStore();
  pond.set(0, 0, 0, 'sand');
  pond.set(0, 0, 1, 'water');
  assert(findSurface(pond, 0, 0) === null, 'a water-topped column has no standable surface (matches old WATER-impassable convention)');

  const furniture = new VoxelStore();
  furniture.set(0, 0, 0, 'stone');
  furniture.set(0, 0, 1, 'table:N'); // non-solid, but still occupies the cell
  assert(findSurface(furniture, 0, 0) === null, 'a non-solid model occupying the cell above still blocks standing on the floor beneath it');
}

console.log('surfaceToLegacyMap + real findPath integration');
{
  // A 5x1 strip: flat ground at z=0, then a slab step up to z=1(.5), then a full step to z=2,
  // like a little staircase — the checkpoint scenario ("knight walks... up steps, onto slabs").
  const store = new VoxelStore();
  store.set(0, 0, 0, 'stone');
  store.set(1, 0, 0, 'stone');
  store.set(2, 0, 0, 'stone');
  store.set(2, 0, 1, 'stone#slab'); // half-step up
  store.set(3, 0, 0, 'stone');
  store.set(3, 0, 1, 'stone'); // full step up
  store.set(4, 0, 0, 'stone');
  store.set(4, 0, 1, 'stone');

  const legacyMap = surfaceToLegacyMap(store, 5, 1);
  assert(legacyMap.cols === 5 && legacyMap.rows === 1, 'legacy map has the requested dims');
  assert(legacyMap.cells[0].h === 1, 'col 0: flat ground stands at h=1');
  assert(legacyMap.cells[2].h === 1.5, 'col 2: slab step stands at h=1.5');
  assert(legacyMap.cells[3].h === 2, 'col 3: full step stands at h=2');
  assert(legacyMap.cells[3].type === TERRAIN.GRASS, 'a real surface is marked walkable GRASS, not the WATER sentinel');

  // Real, unmodified pathfinding.js findPath — this IS the "feeds pathfinding.js unchanged"
  // requirement, exercised end to end rather than just asserted from the plan text.
  const path = findPath(legacyMap, 0, 0, 4, 0);
  assert(Array.isArray(path) && path.length === 5, 'findPath walks the full 5-tile strip up the steps');
  assert(path[0].x === 0 && path[path.length - 1].x === 4, 'path starts and ends where requested');
}

console.log('surfaceToLegacyMap — impassable column blocks pathfinding, matching old WATER semantics');
{
  const store = new VoxelStore();
  store.set(0, 0, 0, 'stone');
  store.set(1, 0, 0, 'sand');
  store.set(1, 0, 1, 'water'); // gap: no standable surface here
  store.set(2, 0, 0, 'stone');

  const legacyMap = surfaceToLegacyMap(store, 3, 1);
  assert(legacyMap.cells[1].type === TERRAIN.WATER, 'the gapped column is marked with the unwalkable WATER sentinel');
  const path = findPath(legacyMap, 0, 0, 2, 0);
  assert(path === null, 'findPath correctly refuses to cross the impassable gap');
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
