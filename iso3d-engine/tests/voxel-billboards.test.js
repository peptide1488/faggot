/**
 * Headless tests — run with: node tests/voxel-billboards.test.js
 */

const memoryStore = new Map();
global.localStorage = {
  getItem: (k) => (memoryStore.has(k) ? memoryStore.get(k) : null),
  setItem: (k, v) => memoryStore.set(k, String(v)),
  removeItem: (k) => memoryStore.delete(k),
};

import {
  BillboardStore, billboardKeyFor, parseBillboardKey, registerBillboardType, deleteBillboardType,
  BILLBOARD_TYPES, createBillboardType, loadBillboardTypeLibrary, saveBillboardTypeLibrary,
  addBillboardTypeToLibrary, removeBillboardTypeFromLibrary,
} from '../src/voxel/billboards.js';
import { VoxelStore } from '../src/voxel/store.js';
import { buildBillboardMesh, buildMesh, buildSpriteAOOccupancy, quadCount } from '../src/voxel/mesher.js';

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

console.log('billboardKeyFor / parseBillboardKey round-trip');
{
  const key = billboardKeyFor(3, -2, 1);
  assert(key === '3,-2,1', 'key format is c,r,z (no face — a billboard isn\'t snapped to a face)');
  const parsed = parseBillboardKey(key);
  assert(parsed.c === 3 && parsed.r === -2 && parsed.z === 1, 'parseBillboardKey recovers all 3 fields, including a negative coordinate');
}

console.log('BillboardStore basic get/set/remove/has, one per cell');
{
  const store = new BillboardStore();
  assert(store.get(1, 1, 0) === null, 'empty store has no billboard');
  store.set(1, 1, 0, 'tree');
  assert(store.get(1, 1, 0) === 'tree', 'set/get round-trips the type');
  assert(store.has(1, 1, 0), 'has() reflects a placed billboard');
  assert(store.size === 1, 'size reflects one placed billboard');

  store.set(1, 1, 0, 'bush'); // same cell, different type — replaces, doesn't stack
  assert(store.get(1, 1, 0) === 'bush' && store.size === 1, 'placing a second billboard on the same cell replaces it, not stacks');

  store.remove(1, 1, 0);
  assert(!store.has(1, 1, 0) && store.size === 0, 'remove() clears the cell');
}

console.log('BillboardStore.entries() lists every placed billboard with its c/r/z/type');
{
  const store = new BillboardStore();
  store.set(0, 0, 0, 'tree');
  store.set(2, 3, 1, 'bush');
  const entries = store.entries().sort((a, b) => a.c - b.c);
  assert(entries.length === 2, 'two placed billboards -> two entries');
  assert(entries[0].c === 0 && entries[0].type === 'tree', 'first entry carries correct c/type');
  assert(entries[1].c === 2 && entries[1].r === 3 && entries[1].z === 1 && entries[1].type === 'bush', 'second entry carries correct c/r/z/type');
}

console.log('BillboardStore save/load round-trip (toJSON/fromJSON)');
{
  const store = new BillboardStore();
  store.set(5, 5, 2, 'tree');
  store.set(-1, 0, 0, 'bush');
  const json = store.toJSON();
  assert(json.v === 1, 'save format is version-tagged');

  const reloaded = BillboardStore.fromJSON(json);
  assert(reloaded.size === 2, 'reloaded store has the same number of billboards');
  assert(reloaded.get(5, 5, 2) === 'tree', 'first billboard survives the round trip');
  assert(reloaded.get(-1, 0, 0) === 'bush', 'a negative coordinate survives the round trip too');

  const reloadedFromString = BillboardStore.fromJSON(JSON.stringify(json));
  assert(reloadedFromString.get(5, 5, 2) === 'tree', 'fromJSON also accepts a raw JSON string, not just a parsed object');

  let threw = false;
  try {
    BillboardStore.fromJSON({ v: 999, billboards: {} });
  } catch {
    threw = true;
  }
  assert(threw, 'a mismatched save version throws instead of silently loading garbage');
}

console.log('billboard type registry — separate from BLOCKS, id+name+size+aspect (texture handling is the caller\'s job)');
{
  assert(BILLBOARD_TYPES.test_fern === undefined, 'starts unregistered');
  registerBillboardType('test_fern', { name: 'Fern', size: 1.2, aspect: 0.8 });
  assert(BILLBOARD_TYPES.test_fern.name === 'Fern' && BILLBOARD_TYPES.test_fern.size === 1.2, 'registerBillboardType stores the def under its id');
  deleteBillboardType('test_fern');
  assert(BILLBOARD_TYPES.test_fern === undefined, 'deleteBillboardType unregisters it');
}

console.log('createBillboardType — slugified id, defaults, library persistence');
{
  const entry = createBillboardType('Oak Tree', { size: 2, aspect: 0.6 });
  assert(entry.id === 'oak_tree', 'name is slugified into the id, same convention every content type uses');
  assert(BILLBOARD_TYPES.oak_tree.size === 2 && BILLBOARD_TYPES.oak_tree.aspect === 0.6, 'createBillboardType registers size/aspect into the live registry');
  deleteBillboardType('oak_tree');

  const defaulted = createBillboardType('Weed');
  assert(defaulted.size === 1 && defaulted.aspect === 1, 'size/aspect default to 1 when omitted');
  deleteBillboardType('weed');

  saveBillboardTypeLibrary([]); // clean slate
  assert(loadBillboardTypeLibrary().length === 0, 'starts empty');
  addBillboardTypeToLibrary({ id: 'tree', name: 'Tree', size: 2, aspect: 0.6 });
  addBillboardTypeToLibrary({ id: 'bush', name: 'Bush', size: 0.8, aspect: 1 });
  assert(loadBillboardTypeLibrary().length === 2, 'two distinct entries persisted');
  removeBillboardTypeFromLibrary('tree');
  const lib = loadBillboardTypeLibrary();
  assert(lib.length === 1 && lib[0].id === 'bush', 'removeBillboardTypeFromLibrary drops only the targeted entry, survives a fresh load call');
}

console.log('buildBillboardMesh — one bucket per billboard TYPE, one quad per placed billboard');
{
  const store = new VoxelStore();
  store.set(5, 5, 0, 'grass');
  const billboards = new BillboardStore();
  billboards.set(5, 5, 1, 'tree');
  const typeLookup = (id) => ({ tree: { size: 2, aspect: 0.5 } }[id]);
  const { byType } = buildBillboardMesh(billboards, typeLookup, [1, 0], store);
  assert(Object.keys(byType).length === 1 && byType.tree, 'exactly one bucket, keyed by the billboard type');
  assert(quadCount(byType.tree) === 1, 'one placed billboard produces exactly one quad');
}

console.log('buildBillboardMesh — an unregistered type is silently skipped (no crash, no stray geometry)');
{
  const billboards = new BillboardStore();
  billboards.set(0, 0, 0, 'ghost_type');
  const typeLookup = () => undefined;
  const { byType } = buildBillboardMesh(billboards, typeLookup, [1, 0], new VoxelStore());
  assert(Object.keys(byType).length === 0, 'no bucket created for a type with no registered def');
}

console.log('buildBillboardMesh — quad orientation tracks the camera\'s right vector, stays upright regardless of it');
{
  const store = new VoxelStore();
  const billboards = new BillboardStore();
  billboards.set(0, 0, 0, 'tree');
  const typeLookup = () => ({ size: 2, aspect: 1 });

  // Camera right = grid +x (c-axis): quad's left/right corners should spread along x, share y.
  const facingX = buildBillboardMesh(billboards, typeLookup, [1, 0], store).byType.tree;
  const x0 = facingX.positions[0], y0 = facingX.positions[1];
  const x1 = facingX.positions[3], y1 = facingX.positions[4];
  assert(Math.abs(x0 - x1) > 0.5 && Math.abs(y0 - y1) < 1e-6, 'camRight=[1,0] spreads the quad along grid x, constant y');

  // Camera right = grid +y (r-axis): quad's left/right corners should spread along y, share x.
  const facingY = buildBillboardMesh(billboards, typeLookup, [0, 1], store).byType.tree;
  const fx0 = facingY.positions[0], fy0 = facingY.positions[1];
  const fx1 = facingY.positions[3], fy1 = facingY.positions[4];
  assert(Math.abs(fy0 - fy1) > 0.5 && Math.abs(fx0 - fx1) < 1e-6, 'camRight=[0,1] spreads the quad along grid y, constant x');

  // Every quad stands from the placed cell's own floor (z) up to z+height — verify both bottom
  // corners sit at z and both top corners sit at z+height regardless of camera facing.
  const zs = [0, 1, 2, 3].map((i) => facingX.positions[i * 3 + 2]);
  assert(zs[0] === 0 && zs[1] === 0 && zs[2] === 2 && zs[3] === 2, 'bottom two verts at z=0 (cell floor), top two verts at z=height(2)');
}

console.log('buildBillboardMesh — reads the store\'s own lighting (sun direction), not flat full-bright');
{
  const store = new VoxelStore();
  const billboards = new BillboardStore();
  billboards.set(0, 0, 0, 'tree');
  const typeLookup = () => ({ size: 1, aspect: 1 });
  // The billboard's pseudo-normal is a fixed straight-up [0,0,1] in grid space (treated like a
  // top-facing surface for lighting purposes — a horizontal normal was tried first but left
  // billboards barely lit under a typical high overhead sun, a real bug since fixed: see
  // buildBillboardMesh's own comment). So it's the sun's ELEVATION that should move sunLit, not
  // its horizontal direction. sunDirToVoxelSpace maps world (east,up,south) -> grid
  // (c,r,elevation) via a y<->z swap, so world [0,1,0]/[0,-1,0] (straight up/down) land on grid
  // [0,0,1]/[0,0,-1] — directly overhead should light it fully; from below the horizon should not.
  const litFacing = buildBillboardMesh(billboards, typeLookup, [1, 0], store, { sunDir: [0, 1, 0] }).byType.tree;
  const litAway = buildBillboardMesh(billboards, typeLookup, [1, 0], store, { sunDir: [0, -1, 0] }).byType.tree;
  assert(litFacing.sunLit[0] > litAway.sunLit[0], 'sun direction actually changes the billboard\'s sunLit attribute, not hardcoded to a constant');
}

console.log('buildBillboardMesh — pins base to findSurface standZ (stale / wrong placement z)');
{
  const store = new VoxelStore();
  store.set(0, 0, 0, 'grass');
  const billboards = new BillboardStore();
  // Wrong low placement (z=0 = inside the grass cell) must still sit on standZ=1
  billboards.set(0, 0, 0, 'tree');
  const typeLookup = () => ({ size: 2, aspect: 1, yOffset: 0, bottomPad: 0 });
  const mesh = buildBillboardMesh(billboards, typeLookup, [1, 0], store).byType.tree;
  const zs = [0, 1, 2, 3].map((i) => mesh.positions[i * 3 + 2]);
  assert(zs[0] === 1 && zs[1] === 1 && zs[2] === 3 && zs[3] === 3,
    'surface pin lifts base to standZ=1 and top to standZ+height even when stored z was 0');
}

console.log('buildBillboardMesh — bottomPad crops UV so solid art sits on baseZ');
{
  const store = new VoxelStore();
  const billboards = new BillboardStore();
  billboards.set(0, 0, 0, 'tree');
  const typeLookup = () => ({ size: 2, aspect: 1, yOffset: -0.01, bottomPad: 0.1 });
  const mesh = buildBillboardMesh(billboards, typeLookup, [1, 0], store).byType.tree;
  // bottom verts UV.v should be 1 - bottomPad = 0.9; top verts UV.v = 0
  assert(Math.abs(mesh.uvs[1] - 0.9) < 1e-6 && Math.abs(mesh.uvs[3] - 0.9) < 1e-6,
    'bottom verts sample uv v = 1-bottomPad (crop transparent margin)');
  assert(Math.abs(mesh.uvs[5]) < 1e-6 && Math.abs(mesh.uvs[7]) < 1e-6,
    'top verts sample uv v = 0');
  // Small plant within the hairline clamp is kept.
  assert(Math.abs(mesh.positions[2] - (-0.01)) < 1e-6,
    'small yOffset plant applies (within groundZ-0.02 clamp)');
  // Large negative yOffset must NOT bury the display under the ground (clips texture).
  // Display clamps to groundZ - 0.02; shadow contact is independent on the ground plane.
  const buried = buildBillboardMesh(
    billboards,
    () => ({ size: 2, aspect: 1, yOffset: -0.35, bottomPad: 0 }),
    [1, 0],
    store,
  ).byType.tree;
  assert(Math.abs(buried.positions[2] - (-0.02)) < 1e-6,
    'display base clamps to groundZ-0.02 so sinking for shadow no longer crops the texture');
  // Positive raise still works (tree can float if the author wants).
  const raised = buildBillboardMesh(
    billboards,
    () => ({ size: 2, aspect: 1, yOffset: 0.4, bottomPad: 0 }),
    [1, 0],
    store,
  ).byType.tree;
  assert(Math.abs(raised.positions[2] - 0.4) < 1e-6,
    'positive ground offset still raises the billboard');
}

console.log('buildSpriteAOOccupancy — billboards mark their column for soft AO');
{
  const billboards = new BillboardStore();
  billboards.set(3, 4, 1, 'oak');
  const typeLookup = (id) => (id === 'oak' ? { size: 2.5, aspect: 1 } : null);
  const set = buildSpriteAOOccupancy(billboards, typeLookup);
  assert(set.has('3,4,1') && set.has('3,4,2'), 'tall tree marks floor(z) and ceil(size) vertical cells');
  assert(!set.has('3,4,0'), 'does not mark below its stand height');
}

console.log('buildMesh — billboards darken grass tops via soft AO (same curve as solid cubes)');
{
  const store = new VoxelStore();
  store.set(5, 5, 0, 'grass');
  // Neighbors of the top-face NW corner at z=1: west, north, diagonal — all empty solids
  // but a billboard sits in the same cell as the open space above the grass (5,5,1).
  const billboards = new BillboardStore();
  billboards.set(5, 5, 1, 'tree');
  // Also put solid occluders on west+north of a SECOND grass for comparison of full solid AO
  store.set(8, 8, 0, 'grass');
  store.set(7, 8, 1, 'stone');
  store.set(8, 7, 1, 'stone');
  store.set(7, 7, 1, 'stone');

  const typeLookup = () => ({ size: 2, aspect: 1 });
  const aoOccupancy = buildSpriteAOOccupancy(billboards, typeLookup);
  const { opaque: withTree } = buildMesh(store, { aoOccupancy });
  const { opaque: noTree } = buildMesh(store);

  function findTopQuad(buf, c, r, zTop) {
    for (let q = 0; q < quadCount(buf); q++) {
      const base = q * 4 * 3;
      // top face verts are roughly at z=zTop covering [c,c+1]x[r,r+1]
      const zs = [0, 1, 2, 3].map((i) => buf.positions[base + i * 3 + 2]);
      if (zs.every((z) => Math.abs(z - zTop) < 1e-6)) {
        const xs = [0, 1, 2, 3].map((i) => buf.positions[base + i * 3]);
        if (xs.some((x) => Math.abs(x - c) < 1e-6) && xs.some((x) => Math.abs(x - (c + 1)) < 1e-6)) {
          return q;
        }
      }
    }
    return -1;
  }

  const qTree = findTopQuad(withTree, 5, 5, 1);
  const qOpen = findTopQuad(noTree, 5, 5, 1);
  assert(qTree !== -1 && qOpen !== -1, 'found grass top quads with and without tree AO');
  // With tree occupancy at (5,5,1), top-face AO samples the cell above the grass — that
  // single soft occluder darkens at least some corners vs fully open grass.
  const avg = (buf, q) => {
    const base = q * 4 * 3;
    let s = 0;
    for (let i = 0; i < 4; i++) s += buf.colors[base + i * 3];
    return s / 4;
  };
  assert(avg(withTree, qTree) < avg(noTree, qOpen) - 0.01,
    'grass under a billboard is darker (soft AO) than the same grass with no billboard');

  const qSolid = findTopQuad(withTree, 8, 8, 1);
  assert(qSolid !== -1, 'found solid-occluded grass top');
  // Solid 3-corner AO is the max-dark path for a single corner; soft tree AO is a milder
  // whole-face +1 bump — both must be darker than open grass.
  assert(avg(withTree, qSolid) < avg(noTree, qOpen) - 0.01,
    'solid-cube AO path still darkens grass as before');
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
