/**
 * Headless tests — run with: node tests/voxel-mesher.test.js
 */

import { VoxelStore } from '../src/voxel/store.js';
import { buildMesh, buildBoxMesh, quadCount, autotileCornerMask, computeFaceSunTable, ambientBase } from '../src/voxel/mesher.js';
import { atlasUV, TEX, FACING, MODELS, BLOCKS, resolveFace } from '../src/voxel/blocks.js';
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
  // The unlit cube's top face color is now JUST ambientBase(profile) — a colorless scalar
  // repeated on every channel. The sun's contribution no longer touches vColor at all (see
  // mesher.js's doc comments on computeFaceSunTable/makeLightSampler): it's baked as a
  // separate per-vertex `sunLit` scalar instead, consumed by the shader alongside a real GPU
  // shadow map (renderer.js), not by anything buildMesh's own color math does.
  const dungeonAmb = ambientBase(dungeon);
  assert(
    Math.abs(darkR - dungeonAmb) < 1e-9 && darkR === darkB,
    'the unlit cube\'s color is exactly ambientBase(profile), neutral across channels — the sun no longer contributes to vColor',
  );
}

console.log('computeFaceSunTable — pure per-face "how directly does this face point at the sun" scalar (pure function)');
{
  // Deliberately just a raw dot product (0..1), no keyStrength/sunColor baked in — those are
  // GPU shader uniforms now (uSunStrength/uSunColor in renderer.js), so tweaking them no
  // longer needs a mesh rebuild at all. A face pointing directly at the sun gets dot=1; a face
  // pointing away gets exactly 0.
  const straightUp = computeFaceSunTable([0, 1, 0]);
  assert(Math.abs(straightUp.top - 1) < 1e-9, 'a face pointing directly at the sun gets dot=1');
  assert(straightUp.bottom === 0, 'a face pointing directly away from the sun gets exactly 0');
  assert(straightUp.north === 0 && straightUp.south === 0, 'faces perpendicular to the sun (dot=0) also get exactly zero (max(0,dot) clamps negative dot too)');

  // Sun due east (+voxel-x): east face fully lit, every other face gets zero.
  const dueEast = computeFaceSunTable([1, 0, 0]);
  assert(Math.abs(dueEast.east - 1) < 1e-9 && dueEast.west === 0, 'rotating the sun to due east moves the nonzero value from top to east');

  // A 45-degree sun (between top and east) splits its dot-product value between the two faces
  // it partially faces, proving this is a real continuous dot product, not a nearest-face snap.
  const angled = computeFaceSunTable([1, 1, 0]);
  const expected = Math.SQRT1_2; // cos(45deg)
  assert(Math.abs(angled.top - expected) < 1e-6 && Math.abs(angled.east - expected) < 1e-6, 'a 45-degree sun gives top and east the same partial (cos 45) value');

  // A missing sunDir falls back to LIGHT_PRESETS.day's own default, not a crash/NaN.
  const noSunDir = computeFaceSunTable(null);
  assert(Number.isFinite(noSunDir.top) && noSunDir.top > 0, 'omitting sunDir falls back to a sane default (matches LIGHT_PRESETS.day), not NaN');
}

console.log('adjustable sun direction changes which face has the highest sunLit value (end-to-end)');
{
  function brightestSunFace(sunDir) {
    const store = new VoxelStore();
    store.set(9, 9, 0, 'stone');
    const profile = resolveLighting({ mode: 'day', sunDir });
    const { opaque } = buildMesh(store, { lightProfile: profile });
    // DIRS order in mesher.js: top, bottom, north, south, east, west — each full cube face
    // is exactly one quad (4 verts) in that order since nothing occludes an isolated cube.
    const faceOrder = ['top', 'bottom', 'north', 'south', 'east', 'west'];
    let best = null;
    let bestVal = -1;
    for (let q = 0; q < faceOrder.length; q++) {
      const v = opaque.sunLit[q * 4]; // per-vertex, constant across a face's own 4 vertices
      if (v > bestVal) { bestVal = v; best = faceOrder[q]; }
    }
    return best;
  }
  // sunDir is lighting.js's Y-up [x, y=up, z] convention (see sunDirToVoxelSpace's doc comment).
  assert(brightestSunFace([0, 1, 0]) === 'top', 'sun straight up -> top face has the highest sunLit value');
  assert(brightestSunFace([1, 0, 0]) === 'east', 'sun due east -> east face has the highest sunLit value');
  assert(brightestSunFace([-1, 0, 0]) === 'west', 'sun due west -> west face has the highest sunLit value');
  assert(brightestSunFace([0, 0, 1]) === 'south', 'sun due south (voxel +row) -> south face has the highest sunLit value');
}

console.log('sunLit is baked per-vertex into the mesh buffer, ready for the shader\'s shadow-map pass');
{
  // Real shadow CASTING (does a wall block the sun from a given point) is now a GPU concern —
  // a shadow map rendered in renderer.js — not something buildMesh computes at all (an
  // earlier version did this via a per-vertex CPU raycast; replaced because getting finer
  // shadow resolution meant subdividing faces into more and more geometry — see git history).
  // What buildMesh still owns is purely geometric: which way each face points relative to the
  // sun. Actual shadow-edge correctness needs a browser (WebGL), not a headless test.
  const store = new VoxelStore();
  store.set(4, 4, 0, 'stone');
  const profile = resolveLighting({ mode: 'day', sunDir: [0, 1, 0] });
  const { opaque } = buildMesh(store, { lightProfile: profile });
  assert(opaque.sunLit.length === opaque.positions.length / 3, 'sunLit has exactly one entry per vertex');
  const topVals = [0, 1, 2, 3].map((i) => opaque.sunLit[i]); // top face is quad 0 (DIRS order)
  assert(topVals.every((v) => Math.abs(v - 1) < 1e-9), 'the top face\'s 4 vertices all carry the same sunLit value (sun straight up -> dot=1)');

  // No lightProfile at all -> sunLit is still populated (falls back to DEFAULT_SUN_DIR), never
  // undefined/NaN, so renderer.js can always safely upload/bind this attribute.
  const { opaque: noProfileOpaque } = buildMesh(store);
  assert(noProfileOpaque.sunLit.every((v) => Number.isFinite(v)), 'sunLit is always a finite number, even with no lightProfile at all');
}

console.log('side-face UV orientation is consistent across all 4 compass faces (regression)');
{
  // Real bug, 2026-07-12: FACE_VERTS' hand-derived winding order was verified correct for
  // backface culling but never checked for UV-axis consistency. north/east happened to put
  // a texture's file-top row at world z1 (top) after the first fix pass; south/west had U
  // and V transposed, so the SAME fix silently left them wrong — a texture with real top/
  // bottom content (grass fringe, dungeon_wall courses) rendered upside down or sideways on
  // 2 of 4 faces. faceUVCorners derives UV from actual vertex position instead of a generic
  // corner-index table, so this must hold for every side face, not just some of them.
  const uv = atlasUV(TEX.GRASS_SIDE);
  const buf = buildBoxMesh({ from: [0, 0, 0], to: [1, 1, 1] }, TEX.GRASS_SIDE);
  const faceOrder = ['top', 'bottom', 'north', 'south', 'east', 'west'];
  for (const faceName of ['north', 'south', 'east', 'west']) {
    const f = faceOrder.indexOf(faceName);
    for (let v = 0; v < 4; v++) {
      const pi = (f * 4 + v) * 3;
      const ui = (f * 4 + v) * 2;
      const worldZ = buf.positions[pi + 2];
      const sampledV = buf.uvs[ui + 1];
      const isTop = worldZ > 0.5;
      const expectedV = isTop ? uv.v0 : uv.v1; // v0 = the texture's own top row
      assert(
        Math.abs(sampledV - expectedV) < 1e-9,
        `${faceName} vertex ${v}: world z=${worldZ} (${isTop ? 'top' : 'bottom'}) samples the texture's ${isTop ? 'top' : 'bottom'} row`,
      );
    }
  }
}

console.log('autotileCornerMask — samples the SAME z-level, not one above (AO does, this must not)');
{
  // Isolated grass tile: no same-type neighbors anywhere -> mask 0 (no corners match).
  const lone = new VoxelStore();
  lone.set(5, 5, 0, 'grass');
  assert(autotileCornerMask(lone, 5, 5, 0, 'grass') === 0, 'a fully isolated tile has an all-zero corner mask');

  // Full ring of same-type neighbors at the SAME z -> every corner should match (mask 15).
  const ring = new VoxelStore();
  ring.set(5, 5, 0, 'grass');
  for (let dc = -1; dc <= 1; dc++) {
    for (let dr = -1; dr <= 1; dr++) {
      if (dc === 0 && dr === 0) continue;
      ring.set(5 + dc, 5 + dr, 0, 'grass');
    }
  }
  assert(autotileCornerMask(ring, 5, 5, 0, 'grass') === 15, 'fully surrounded at the same level -> all 4 corner bits set');

  // The critical regression case: same-type neighbors exist, but ONLY one z level ABOVE —
  // if this function wrongly reused AO's z+1 offset, it would see those and report a match;
  // sampled correctly (same z), it must report 0.
  const wrongLevel = new VoxelStore();
  wrongLevel.set(5, 5, 0, 'grass');
  for (let dc = -1; dc <= 1; dc++) {
    for (let dr = -1; dr <= 1; dr++) {
      if (dc === 0 && dr === 0) continue;
      wrongLevel.set(5 + dc, 5 + dr, 1, 'grass'); // one level UP, not the same level
    }
  }
  assert(autotileCornerMask(wrongLevel, 5, 5, 0, 'grass') === 0, 'same-type neighbors one level up (not the same level) must NOT affect the mask');

  // A single side neighbor alone is never enough (each corner needs 2 of its 3 samples to
  // match — a lone "north" match only gives each of NW/NE one point, not two).
  const northOnly = new VoxelStore();
  northOnly.set(5, 5, 0, 'grass');
  northOnly.set(5, 4, 0, 'grass'); // north neighbor only
  assert(autotileCornerMask(northOnly, 5, 5, 0, 'grass') === 0, 'one lone side neighbor is not enough to light up any corner');

  // North + west together both border the NW corner directly (its two "adjacent" samples),
  // which the corner rule forces to count even without the diagonal — exactly one corner set.
  const northWest = new VoxelStore();
  northWest.set(5, 5, 0, 'grass');
  northWest.set(5, 4, 0, 'grass'); // north
  northWest.set(4, 5, 0, 'grass'); // west
  assert(autotileCornerMask(northWest, 5, 5, 0, 'grass') === 0b0001, 'north+west together force exactly the NW corner (bit 0), no others');
}

console.log('buildMesh consumes topAutotile end-to-end (material maker integration)');
{
  const autoType = 'test_autotile_grass';
  const autotileTexIds = Array.from({ length: 16 }, (_, i) => 40 + i); // arbitrary distinct ids
  const savedDef = BLOCKS[autoType];
  BLOCKS[autoType] = { all: TEX.STONE, solid: true, opaque: true, topAutotile: autotileTexIds };

  try {
    const store = new VoxelStore();
    store.set(5, 5, 0, autoType); // isolated -> mask 0 -> should use autotileTexIds[0]
    const { opaque } = buildMesh(store);
    const topUV = atlasUV(autotileTexIds[0]);
    // Top face is emitted first (DIRS order), quad 0.
    assert(Math.abs(opaque.uvs[0] - topUV.u0) < 1e-9, 'isolated autotile block (mask=0) uses topAutotile[0]');

    const store2 = new VoxelStore();
    store2.set(5, 5, 0, autoType);
    for (let dc = -1; dc <= 1; dc++) {
      for (let dr = -1; dr <= 1; dr++) {
        if (dc === 0 && dr === 0) continue;
        store2.set(5 + dc, 5 + dr, 0, autoType);
      }
    }
    const { opaque: opaque2 } = buildMesh(store2);
    // Find the center block's top quad by its known world verts (same technique as the AO test).
    function findQuad(buf, expected) {
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
    const centerTop = findQuad(opaque2, [[5, 5, 1], [6, 5, 1], [6, 6, 1], [5, 6, 1]]);
    assert(centerTop !== -1, 'found the fully-surrounded center block\'s top quad');
    const fullMaskUV = atlasUV(autotileTexIds[15]); // mask=15 when fully surrounded
    assert(
      Math.abs(opaque2.uvs[centerTop * 4 * 2] - fullMaskUV.u0) < 1e-9,
      'fully-surrounded autotile block (mask=15) uses topAutotile[15]',
    );
  } finally {
    if (savedDef) BLOCKS[autoType] = savedDef;
    else delete BLOCKS[autoType];
  }
}

console.log('shape presets (material-agnostic non-cube geometry)');
{
  const shapeType = '__test_shape_column_thin__';
  BLOCKS[shapeType] = { all: TEX.STONE, solid: true, opaque: false, shape: 'column_thin' };

  const store = new VoxelStore();
  store.set(3, 3, 0, shapeType);
  const { opaque } = buildMesh(store);
  assert(quadCount(opaque) === 6, 'a single-box shape (column_thin) emits exactly 6 quads, like a lone cube');

  const topUV = atlasUV(resolveFace(shapeType, 'top', { facing: FACING.N, depth: 0 }));
  assert(Math.abs(opaque.uvs[0] - topUV.u0) < 1e-9, 'shape face texture resolves via resolveFace using the block\'s own material, not a baked id');

  // A full opaque cube next to a shape block must NOT have its adjoining face culled — a
  // shape never fills its whole cell, so it must never occlude a neighbor (same rule as
  // models/slabs).
  const store2 = new VoxelStore();
  store2.set(3, 3, 0, shapeType);
  store2.set(4, 3, 0, 'stone');
  const { opaque: opaque2 } = buildMesh(store2);
  assert(quadCount(opaque2) === 6 + 6, 'neighboring solid cube keeps all 6 faces — a shape block never occludes it');

  delete BLOCKS[shapeType];
}

console.log('shape presets: depth-indexed variant (flared column base/mid/cap)');
{
  const shapeType = '__test_shape_flared__';
  BLOCKS[shapeType] = { all: TEX.STONE, solid: true, opaque: false, shape: ['column_cap', 'column_mid', 'column_base'] };

  const store = new VoxelStore();
  store.set(2, 2, 0, shapeType); // base of a 3-tall stack (depth=2, clamped to last entry)
  store.set(2, 2, 1, shapeType); // middle (depth=1)
  store.set(2, 2, 2, shapeType); // top of the stack (depth=0 -> cap)
  const { opaque } = buildMesh(store);
  // column_base has 2 boxes (12 quads), column_mid has 1 box (6 quads), column_cap has 2 boxes
  // (12 quads) — total geometry proves each stack level picked its own shape variant by depth.
  assert(quadCount(opaque) === 12 + 6 + 12, 'each depth of the stack used its own shape variant (base/mid/cap box counts sum correctly)');

  delete BLOCKS[shapeType];
}

console.log('shape presets: newly authored multi-box catalog entries (step, window_frame, barrel)');
{
  const cases = [
    ['step', 2],
    ['window_frame', 4],
    ['barrel', 3],
    ['wall_corner', 2],
    ['door_jamb', 2],
  ];
  for (const [shapeName, boxCount] of cases) {
    const shapeType = `__test_shape_${shapeName}__`;
    BLOCKS[shapeType] = { all: TEX.STONE, solid: true, opaque: false, shape: shapeName };
    const store = new VoxelStore();
    store.set(1, 1, 0, shapeType);
    const { opaque } = buildMesh(store);
    assert(quadCount(opaque) === boxCount * 6, `${shapeName} (${boxCount} boxes) emits ${boxCount * 6} quads`);
    delete BLOCKS[shapeType];
  }
}

console.log('shape presets: unknown shape name throws a clear error');
{
  const shapeType = '__test_shape_bogus__';
  BLOCKS[shapeType] = { all: TEX.STONE, solid: true, opaque: false, shape: 'not_a_real_shape' };
  const store = new VoxelStore();
  store.set(1, 1, 0, shapeType);
  let threw = false;
  try {
    buildMesh(store);
  } catch (e) {
    threw = /unknown shape/.test(e.message);
  }
  assert(threw, 'referencing a shape name missing from SHAPES throws instead of silently rendering nothing');
  delete BLOCKS[shapeType];
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
