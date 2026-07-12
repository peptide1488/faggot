/**
 * Headless tests — run with: node tests/voxel-mesher.test.js
 */

import { VoxelStore } from '../src/voxel/store.js';
import { buildMesh, quadCount } from '../src/voxel/mesher.js';
import { atlasUV, TEX, FACING, MODELS } from '../src/voxel/blocks.js';
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

/** UV of a quad's first vertex, by 0-based quad index within a mesh buffer. */
function quadUV0(buf, quadIndex) {
  const base = quadIndex * 4 * 2;
  return { u: buf.uvs[base], v: buf.uvs[base + 1] };
}

console.log('lone cube = 6 faces');
{
  const store = new VoxelStore();
  store.set(5, 5, 5, 'stone');
  const { opaque, translucent } = buildMesh(store);
  assert(quadCount(opaque) === 6, 'isolated stone cube emits exactly 6 quads');
  assert(quadCount(translucent) === 0, 'nothing goes in the translucent buffer');
}

console.log('two stacked = 10 faces (shared interface hidden both ways)');
{
  const store = new VoxelStore();
  store.set(0, 0, 0, 'stone');
  store.set(0, 0, 1, 'stone');
  const { opaque } = buildMesh(store);
  assert(quadCount(opaque) === 10, 'two stacked opaque cubes hide exactly their shared face, both sides');
}

console.log('buried block = 0 (plus-shaped 7-cube cluster)');
{
  const store = new VoxelStore();
  const center = [1, 1, 1];
  store.set(...center, 'stone');
  const neighbors = [
    [0, 1, 1], [2, 1, 1], // east/west
    [1, 0, 1], [1, 2, 1], // north/south
    [1, 1, 0], [1, 1, 2], // bottom/top
  ];
  for (const n of neighbors) store.set(...n, 'stone');
  const { opaque } = buildMesh(store);
  // Center is fully surrounded -> 0 faces of its own. Each of the 6 arms touches the center
  // on exactly 1 face (hidden) and is exposed on the other 5 (arms don't touch each other).
  // Total = 6 arms * 5 = 30; if the center leaked even one face this would be 31+.
  assert(quadCount(opaque) === 30, 'fully-surrounded center cube contributes zero faces of its own');
}

console.log('slab on cube: neither occludes the other');
{
  const store = new VoxelStore();
  store.set(0, 0, 0, 'stone');
  store.set(0, 0, 1, 'stone#slab');
  const { opaque } = buildMesh(store);
  // Cube's top face must still show (a slab never occludes), and the slab itself always
  // renders all 6 of its own faces (never occluded, occludes nothing) = 6 + 6 = 12.
  assert(quadCount(opaque) === 12, 'cube top stays visible under a slab, slab shows all 6 faces');
}

console.log('water pool faces (translucent same-type culling, but never against solid)');
{
  const storeTwo = new VoxelStore();
  storeTwo.set(0, 0, 0, 'water');
  storeTwo.set(1, 0, 0, 'water');
  const { translucent: twoWater } = buildMesh(storeTwo);
  assert(quadCount(twoWater) === 10, 'two adjacent water cubes hide only their shared interior face');

  const storeSolid = new VoxelStore();
  storeSolid.set(0, 0, 0, 'water');
  storeSolid.set(-1, 0, 0, 'stone'); // solid neighbor to the west
  const meshed = buildMesh(storeSolid);
  assert(quadCount(meshed.translucent) === 6, 'water next to solid stays fully exposed (all 6 faces), not culled');
  assert(quadCount(meshed.opaque) === 6, 'the solid stone neighbor is also fully exposed against water');
}

console.log('door model box count');
{
  const store = new VoxelStore();
  store.set(0, 0, 0, 'door');
  const { opaque } = buildMesh(store);
  const expectedQuads = MODELS.door.length * 6;
  assert(quadCount(opaque) === expectedQuads, `door model emits 6 quads per box (${MODELS.door.length} box(es))`);
}

console.log("facing rotation of a shelf's books face");
{
  // DIRS order in mesher.js is top,bottom,north,south,east,west — an isolated shelf has no
  // neighbors so all 6 faces are emitted in exactly that order, letting us index by position.
  const idx = { top: 0, bottom: 1, north: 2, south: 3, east: 4, west: 5 };
  const bookUV = atlasUV(TEX.BOOKS);
  const planksUV = atlasUV(TEX.PLANKS);

  const storeS = new VoxelStore();
  storeS.set(0, 0, 0, 'shelf:S');
  const { opaque: meshS } = buildMesh(storeS);
  assert(quadUV0(meshS, idx.south).u === bookUV.u0, 'facing S: books show on the SOUTH face');
  assert(quadUV0(meshS, idx.north).u === planksUV.u0, 'facing S: north face is plain planks');
  assert(quadUV0(meshS, idx.east).u === planksUV.u0, 'facing S: east face is plain planks');
  assert(quadUV0(meshS, idx.top).u === planksUV.u0, 'facing S: top face is plain planks');

  const storeN = new VoxelStore();
  storeN.set(0, 0, 0, 'shelf:N');
  const { opaque: meshN } = buildMesh(storeN);
  assert(quadUV0(meshN, idx.north).u === bookUV.u0, 'facing N: books show on the NORTH face instead');
  assert(quadUV0(meshN, idx.south).u === planksUV.u0, 'facing N: south face is now plain planks');
}

console.log('per-elevation side selection integration (dungeon_wall 3-stack)');
{
  const store = new VoxelStore();
  store.set(0, 0, 0, 'dungeon_wall');
  store.set(0, 0, 1, 'dungeon_wall');
  store.set(0, 0, 2, 'dungeon_wall');
  const { opaque } = buildMesh(store);
  const capUV = atlasUV(TEX.WALL_CAP);
  const midUV = atlasUV(TEX.WALL_MID);
  const baseUV = atlasUV(TEX.WALL_BASE);
  // Each cube in the stack: top+bottom occluded by same-stack neighbors except the very
  // top (no block above) and very bottom (no block below) -> 4 side faces each = 12 quads,
  // plus top's own top face and bottom's own bottom face = 14 total.
  assert(quadCount(opaque) === 14, '3-stack dungeon_wall: sides all around + top cap + bottom exposed');

  // A north/south face has all 4 vertices at the same Y (unlike top/bottom, constant Z, or
  // east/west, constant X) — classify by which coordinate is constant across the quad, then
  // pick the one at Y=0 (the north edge, since this column sits at r=0) and match its z-range.
  function findNorthQuadUV(buf, wantZ) {
    const vertsPerQuad = 4;
    const floatsPerVert = 3;
    for (let q = 0; q < quadCount(buf); q++) {
      const base = q * vertsPerQuad * floatsPerVert;
      const ys = [0, 1, 2, 3].map((i) => buf.positions[base + i * floatsPerVert + 1]);
      const zs = [0, 1, 2, 3].map((i) => buf.positions[base + i * floatsPerVert + 2]);
      const yConstant = ys.every((v) => Math.abs(v - ys[0]) < 1e-9);
      if (!yConstant || Math.abs(ys[0] - 0) > 1e-9) continue; // not a north-edge face
      const minZ = Math.min(...zs);
      if (Math.abs(minZ - wantZ) < 1e-9) return quadUV0(buf, q);
    }
    return null;
  }
  assert(findNorthQuadUV(opaque, 2).u === capUV.u0, 'top of stack (z=2) shows CAP on its side');
  assert(findNorthQuadUV(opaque, 1).u === midUV.u0, 'middle of stack (z=1) shows MID on its side');
  assert(findNorthQuadUV(opaque, 0).u === baseUV.u0, 'bottom of stack (z=0) shows BASE on its side');
}

console.log('vertex AO (corner darkening)');
{
  const store = new VoxelStore();
  store.set(5, 5, 0, 'stone'); // main cube, exposed top face
  // Three neighbors one level up, all on the "west+north" (v0) corner of the top face.
  store.set(4, 5, 1, 'stone');
  store.set(5, 4, 1, 'stone');
  store.set(4, 4, 1, 'stone');
  const { opaque } = buildMesh(store);

  function findQuadByAllVerts(buf, expected) {
    for (let q = 0; q < quadCount(buf); q++) {
      const base = q * 4 * 3;
      let match = true;
      for (let i = 0; i < 4 && match; i++) {
        const [ex, ey, ez] = expected[i];
        if (
          Math.abs(buf.positions[base + i * 3] - ex) > 1e-9 ||
          Math.abs(buf.positions[base + i * 3 + 1] - ey) > 1e-9 ||
          Math.abs(buf.positions[base + i * 3 + 2] - ez) > 1e-9
        ) {
          match = false;
        }
      }
      if (match) return q;
    }
    return -1;
  }

  // Top face of the cube at (5,5,0): world verts per FACE_VERTS.top.
  const q = findQuadByAllVerts(opaque, [[5, 5, 1], [6, 5, 1], [6, 6, 1], [5, 6, 1]]);
  assert(q !== -1, "found the main cube's top face quad by its exact 4 vertices");
  const base = q * 4 * 3; // 4 verts/quad * 3 floats(r,g,b)/vert
  const shadeNW = opaque.colors[base + 0 * 3]; // v0 (R channel): west+north corner -> both AO neighbors solid
  const shadeSE = opaque.colors[base + 2 * 3]; // v2 (R channel): east+south corner -> no AO neighbors
  assert(Math.abs(shadeSE - 1.0) < 1e-9, 'unoccluded corner keeps full top-face brightness (shade=1.0)');
  assert(Math.abs(shadeNW - 0.45) < 1e-9, 'corner with both side-neighbors solid is forced to max occlusion (darkest AO step)');
  assert(shadeNW < shadeSE, 'the occluded corner is visibly darker than the unoccluded one');
  // Default (no lightProfile) is neutral white, so all 3 channels should match the scalar.
  assert(opaque.colors[base + 1] === shadeNW && opaque.colors[base + 2] === shadeNW, 'no lightProfile -> neutral white tint (R=G=B)');
}

console.log('lightProfile integration (colored torch light)');
{
  const store = new VoxelStore();
  store.set(5, 5, 0, 'stone');
  store.set(20, 20, 0, 'stone'); // far away, stays unlit

  const dungeon = resolveLighting({
    mode: 'dungeon',
    points: [{ col: 5, row: 5, radius: 4, intensity: 1.5, color: [1.0, 0.55, 0.22] }],
  });
  const { opaque } = buildMesh(store, { lightProfile: dungeon });

  function findQuadByAllVerts(buf, expected) {
    for (let q = 0; q < quadCount(buf); q++) {
      const base = q * 4 * 3;
      let match = true;
      for (let i = 0; i < 4 && match; i++) {
        const [ex, ey, ez] = expected[i];
        if (
          Math.abs(buf.positions[base + i * 3] - ex) > 1e-9 ||
          Math.abs(buf.positions[base + i * 3 + 1] - ey) > 1e-9 ||
          Math.abs(buf.positions[base + i * 3 + 2] - ez) > 1e-9
        ) {
          match = false;
        }
      }
      if (match) return q;
    }
    return -1;
  }

  const litTop = findQuadByAllVerts(opaque, [[5, 5, 1], [6, 5, 1], [6, 6, 1], [5, 6, 1]]);
  const darkTop = findQuadByAllVerts(opaque, [[20, 20, 1], [21, 20, 1], [21, 21, 1], [20, 21, 1]]);
  assert(litTop !== -1 && darkTop !== -1, 'found both cubes\' top-face quads');

  const litBase = litTop * 4 * 3;
  const darkBase = darkTop * 4 * 3;
  const [litR, litG, litB] = [opaque.colors[litBase], opaque.colors[litBase + 1], opaque.colors[litBase + 2]];
  const [darkR, , darkB] = [opaque.colors[darkBase], opaque.colors[darkBase + 1], opaque.colors[darkBase + 2]];

  assert(litR > darkR, 'the torch-lit cube is genuinely brighter than the far, unlit cube');
  assert(litR > litG && litG > litB, 'the torch-lit cube is tinted orange (R > G > B), not just brighter white');
  assert(Math.abs(darkR - darkB) < 1e-9, 'the unlit cube stays neutral gray (ambient only, no color cast)');
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
