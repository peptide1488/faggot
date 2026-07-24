/**
 * Headless tests — run with: node tests/voxel-mesher.test.js
 */

import { VoxelStore } from '../src/voxel/store.js';
import { buildMesh, buildBoxMesh, buildMultiBoxMesh, quadCount, autotileCornerMask, computeFaceSunTable, computeFaceBounceTable, computeFaceAmbientTable, ambientBase, liquidCornerHeight } from '../src/voxel/mesher.js';
import { atlasUV, TEX, FACING, MODELS, BLOCKS, WEDGES, resolveFace } from '../src/voxel/blocks.js';
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

  // opts.aoStrength is a pure intensity dial on the SAME occlusion counts/curve: 1 (default,
  // omitted) is today's original look; 0 flattens AO out entirely (every corner reads as
  // fully lit); values >1 exaggerate darker than the curve's own value.
  const { opaque: aoOff } = buildMesh(store, { aoStrength: 0 });
  const qOff = findQuadByAllVerts(aoOff, [[5, 5, 1], [6, 5, 1], [6, 6, 1], [5, 6, 1]]);
  assert(Math.abs(aoOff.colors[qOff * 4 * 3] - 1.0) < 1e-9, 'aoStrength=0 flattens even the max-occlusion corner to full brightness (1.0)');

  const { opaque: aoDefault } = buildMesh(store);
  const { opaque: aoExplicit1 } = buildMesh(store, { aoStrength: 1 });
  const qDefault = findQuadByAllVerts(aoDefault, [[5, 5, 1], [6, 5, 1], [6, 6, 1], [5, 6, 1]]);
  const qExplicit1 = findQuadByAllVerts(aoExplicit1, [[5, 5, 1], [6, 5, 1], [6, 6, 1], [5, 6, 1]]);
  assert(aoDefault.colors[qDefault * 4 * 3] === aoExplicit1.colors[qExplicit1 * 4 * 3], 'omitting aoStrength and passing aoStrength:1 are identical (the default)');

  const { opaque: aoExaggerated } = buildMesh(store, { aoStrength: 2 });
  const qExag = findQuadByAllVerts(aoExaggerated, [[5, 5, 1], [6, 5, 1], [6, 6, 1], [5, 6, 1]]);
  // curveValue=0.45 (max occlusion) -> 1-2*(1-0.45) = 1-1.1 = -0.1, clamped to 0.
  assert(aoExaggerated.colors[qExag * 4 * 3] === 0, 'aoStrength=2 exaggerates the max-occlusion corner past the curve\'s own value, clamped at 0 (never negative)');
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

console.log('computeFaceBounceTable — fake bounce/fill light, opposite the sun, blended with a flat spill floor');
{
  // Sun straight up -> bounce shines from straight below -> bottom face gets full strength.
  const straightUp = computeFaceBounceTable([0, 1, 0]);
  assert(Math.abs(straightUp.bottom - 1) < 1e-9, 'the face pointing directly at the bounce direction gets full strength (1), spill or not');
  // Default spill=0.3: a face NOT facing the bounce direction still gets that flat floor
  // instead of a hard zero — a 100%-directional bounce read as a second harsh key light, not
  // a soft fill (this is literally the point of spill).
  assert(Math.abs(straightUp.top - 0.3) < 1e-9, 'the sun-facing top face gets the flat spill floor (0.3), not a hard zero');
  assert(Math.abs(straightUp.north - 0.3) < 1e-9 && Math.abs(straightUp.south - 0.3) < 1e-9, 'perpendicular faces also get exactly the spill floor');

  // Sun due east -> bounce shines from due west -> west face gets full strength, east gets spill only.
  const dueEast = computeFaceBounceTable([1, 0, 0]);
  assert(Math.abs(dueEast.west - 1) < 1e-9, 'bounce direction is the exact opposite of the sun');
  assert(Math.abs(dueEast.east - 0.3) < 1e-9, 'the directly-sunlit east face gets the spill floor, not zero');

  // spill is adjustable (voxel.html doesn't expose it as a slider today, but the function
  // itself supports any value) — spill=0 recovers the exact old hard-directional behavior.
  const noSpill = computeFaceBounceTable([0, 1, 0], 0);
  assert(noSpill.top === 0, 'spill=0 recovers the pure directional dot product (no floor at all)');
  const fullSpill = computeFaceBounceTable([0, 1, 0], 1);
  assert(fullSpill.top === 1 && fullSpill.bottom === 1, 'spill=1 makes every face uniformly fully lit, regardless of orientation');

  // A missing sunDir falls back to the same default the sun table uses, not a crash/NaN.
  const noSunDir = computeFaceBounceTable(null);
  assert(Number.isFinite(noSunDir.bottom) && noSunDir.bottom > 0, 'omitting sunDir falls back to a sane default, not NaN');
}

console.log('computeFaceAmbientTable — a pure per-face directional dot product, independent of the sun');
{
  // Same math as computeFaceSunTable (this is now a thin wrapper around it — see its doc
  // comment) — the "own color/strength" and "additive, never multiplies the flat ambient"
  // parts live in makeLightSampler, not here.
  const up = computeFaceAmbientTable([0, 1, 0]);
  assert(Math.abs(up.top - 1) < 1e-9, 'the face facing the ambient direction gets full strength (1)');
  assert(up.bottom === 0, 'the face facing directly away gets exactly 0');

  // Ambient direction is completely independent of the sun's own direction — no coupling.
  const east = computeFaceAmbientTable([1, 0, 0]);
  assert(Math.abs(east.east - 1) < 1e-9 && east.west === 0, 'ambient direction points wherever it\'s told, independent of any sun concept');
}

console.log('directional ambient is purely additive (own color/strength) — off by default, never touches existing ambient behavior');
{
  const store = new VoxelStore();
  store.set(5, 5, 0, 'stone');
  store.set(6, 5, 0, 'stone');
  // Two profiles, identical except one explicitly attaches ambientDir (as voxel.html would)
  // with NO strength set (defaults to 0, off) and the other doesn't attach it at all (as every
  // OTHER existing test does) — both must render byte-identically, since strength=0 is a no-op
  // regardless of what direction/color accompanies it.
  const withoutAmbientDir = resolveLighting({ mode: 'dungeon' });
  const withAmbientDirButNoStrength = resolveLighting({ mode: 'dungeon' });
  withAmbientDirButNoStrength.ambientDir = [1, 0, 0];
  withAmbientDirButNoStrength.ambientDirColor = [0, 1, 0];
  const meshA = buildMesh(store, { lightProfile: withoutAmbientDir });
  const meshB = buildMesh(store, { lightProfile: withAmbientDirButNoStrength });
  assert(JSON.stringify(meshA.opaque.colors) === JSON.stringify(meshB.opaque.colors), 'ambientDirStrength=0 (the default) makes direction/color irrelevant — byte-identical to omitting them entirely');

  // Once a strength is actually set, it genuinely tints/brightens the facing side and leaves
  // the away-facing side untouched (still just the flat ambient).
  const withStrength = resolveLighting({ mode: 'dungeon' });
  withStrength.ambientDir = [0, 1, 0]; // straight up -> only the top face is lit by this term
  withStrength.ambientDirColor = [0, 1, 0.3]; // greenish
  withStrength.ambientDirStrength = 0.5;
  const { opaque } = buildMesh(store, { lightProfile: withStrength });
  // Top face of the first cube is quad 0 (DIRS order: top,bottom,north,south,east,west).
  const topR = opaque.colors[0];
  const topG = opaque.colors[1];
  const flatAmb = ambientBase(withStrength);
  assert(Math.abs(topR - flatAmb) < 1e-9, 'the lit face\'s R channel is unaffected (ambientDirColor R=0)');
  assert(topG > flatAmb, 'the lit face\'s G channel is genuinely brighter than the flat ambient floor alone');
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
    ['step', 4], // 4 treads per block of rise
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

console.log('wedge/ramp geometry (genuinely non-axis-aligned primitive)');
{
  const wedgeType = '__test_wedge_ramp__';
  BLOCKS[wedgeType] = { all: TEX.STONE, solid: true, opaque: false, wedge: 'ramp' };

  function findQuadByAllVerts(buf, expected, tol = 1e-6) {
    for (let q = 0; q < quadCount(buf); q++) {
      const base = q * 4 * 3;
      let match = true;
      for (let i = 0; i < 4 && match; i++) {
        const [ex, ey, ez] = expected[i];
        if (
          Math.abs(buf.positions[base + i * 3] - ex) > tol ||
          Math.abs(buf.positions[base + i * 3 + 1] - ey) > tol ||
          Math.abs(buf.positions[base + i * 3 + 2] - ez) > tol
        ) match = false;
      }
      if (match) return q;
    }
    return -1;
  }

  console.log('  quad count and non-occlusion');
  {
    const store = new VoxelStore();
    store.set(3, 3, 0, wedgeType);
    const { opaque } = buildMesh(store);
    assert(quadCount(opaque) === WEDGES.ramp.length, `a lone ramp emits exactly ${WEDGES.ramp.length} quads (bottom, back wall, 2 end caps, slanted top)`);

    const store2 = new VoxelStore();
    store2.set(3, 3, 0, wedgeType);
    store2.set(4, 3, 0, 'stone');
    const { opaque: opaque2 } = buildMesh(store2);
    assert(quadCount(opaque2) === WEDGES.ramp.length + 6, 'a neighboring solid cube keeps all 6 of its own faces — a wedge never occludes it, same rule as SHAPES/MODELS');
  }

  console.log('  texture resolves via resolveFace (material-driven, not baked)');
  {
    const store = new VoxelStore();
    store.set(3, 3, 0, wedgeType);
    const { opaque } = buildMesh(store);
    const topUV = atlasUV(resolveFace(wedgeType, 'top', { facing: FACING.N, depth: 0 }));
    // The slanted ramp surface is the only quad whose 4 vertices are NOT all coplanar with a
    // constant x/y/z — every other wedge face (bottom/south/east/west) has one constant axis.
    let rampQuad = -1;
    for (let q = 0; q < quadCount(opaque); q++) {
      const base = q * 4 * 3;
      const xs = [0, 1, 2, 3].map((i) => opaque.positions[base + i * 3]);
      const ys = [0, 1, 2, 3].map((i) => opaque.positions[base + i * 3 + 1]);
      const zs = [0, 1, 2, 3].map((i) => opaque.positions[base + i * 3 + 2]);
      const constantAxis = [xs, ys, zs].some((vals) => vals.every((v) => Math.abs(v - vals[0]) < 1e-9));
      if (!constantAxis) rampQuad = q;
    }
    assert(rampQuad !== -1, 'found the slanted ramp-surface quad (the one face with no constant axis)');
    assert(Math.abs(opaque.uvs[rampQuad * 4 * 2] - topUV.u0) < 1e-9, "the ramp surface's texture resolves through resolveFace's 'top' lookup, using the block's own material");
  }

  console.log('  geometric correctness: computed normal actually matches the true slanted plane (not a canonical-face approximation)');
  {
    // sunDir chosen (in lighting.js's raw Y-up [x,y=up,z] convention — sunDirToVoxelSpace maps
    // it to voxel [x,z,y]) so its voxel-space form is exactly the ramp surface's own true
    // normal (0,+1/sqrt2,1/sqrt2) — high-at-north ascent-facing-N geometry.
    // If the mesher fell back to a flat "top" face (normal (0,0,1)), this would not hit ≈1.
    const store = new VoxelStore();
    store.set(3, 3, 0, wedgeType);
    const profile = resolveLighting({ mode: 'day', sunDir: [0, 1, 1] });
    const { opaque } = buildMesh(store, { lightProfile: profile });

    let rampQuad = -1;
    let highWallQuad = -1;
    for (let q = 0; q < quadCount(opaque); q++) {
      const base = q * 4 * 3;
      const xs = [0, 1, 2, 3].map((i) => opaque.positions[base + i * 3]);
      const ys = [0, 1, 2, 3].map((i) => opaque.positions[base + i * 3 + 1]);
      const zs = [0, 1, 2, 3].map((i) => opaque.positions[base + i * 3 + 2]);
      const constAxis = (vals) => vals.every((v) => Math.abs(v - vals[0]) < 1e-9);
      if (!constAxis(xs) && !constAxis(ys) && !constAxis(zs)) rampQuad = q;
      else if (constAxis(ys) && Math.abs(ys[0] - 3) < 1e-9) highWallQuad = q; // north high wall: r=cell
    }
    assert(rampQuad !== -1 && highWallQuad !== -1, 'found both the ramp surface and the high-wall quads');
    assert(Math.abs(opaque.sunLit[rampQuad * 4] - 1) < 1e-6, "sun aligned with the ramp's true slanted normal gives sunLit≈1 (proves the normal is genuinely computed from geometry, not a flat-top approximation)");
    assert(opaque.sunLit[highWallQuad * 4] === 0, 'the high (north) wall, perpendicular-or-away from this sun angle, gets zero — same clamp behavior as every other face');
  }

  console.log('  rotation: facing moves the high wall to the ascent-direction edge');
  {
    // Canonical (facing=N): high wall on the north edge (world r = cell), climb walking north.
    const storeN = new VoxelStore();
    storeN.set(2, 2, 0, wedgeType);
    const { opaque: opaqueN } = buildMesh(storeN);
    assert(findQuadByAllVerts(opaqueN, [[2, 2, 0], [3, 2, 0], [3, 2, 1], [2, 2, 1]]) !== -1, 'facing=N (default): high wall sits at the NORTH edge (r=cell) — Minecraft-style ascent = facing');

    // facing=E: climb east, high wall on the east edge (c=cell+1).
    const storeE = new VoxelStore();
    storeE.set(2, 2, 0, `${wedgeType}:E`);
    const { opaque: opaqueE } = buildMesh(storeE);
    assert(findQuadByAllVerts(opaqueE, [[3, 2, 0], [3, 3, 0], [3, 3, 1], [3, 2, 1]]) !== -1, 'facing=E: high wall rotates to the EAST edge (c=cell+1) — ascent = facing');
  }

  console.log('  unknown wedge name throws a clear error');
  {
    const badType = '__test_wedge_bogus__';
    BLOCKS[badType] = { all: TEX.STONE, solid: true, opaque: false, wedge: 'not_a_real_wedge' };
    const store = new VoxelStore();
    store.set(1, 1, 0, badType);
    let threw = false;
    try {
      buildMesh(store);
    } catch (e) {
      threw = /unknown wedge/.test(e.message);
    }
    assert(threw, 'referencing a wedge name missing from WEDGES throws instead of silently rendering nothing');
    delete BLOCKS[badType];
  }

  delete BLOCKS[wedgeType];
}

console.log('buildMultiBoxMesh — Object Maker\'s live box-editor preview: multiple MODELS-shaped boxes merged into one mesh');
{
  const boxes = [
    { from: [0, 0, 0], to: [1, 1, 1], faces: { all: TEX.STONE } },
    { from: [1, 0, 0], to: [2, 1, 1], faces: { all: TEX.GRASS_SIDE } },
  ];
  const buf = buildMultiBoxMesh(boxes);
  assert(quadCount(buf) === 12, 'two boxes, each a full 6-face cube, merge into 12 quads total — no occlusion culling (this is a standalone preview, not a VoxelStore mesh)');

  const singleFace = [{ from: [0, 0, 0], to: [1, 1, 1], faces: { top: TEX.STONE } }]; // no "all" fallback, only "top" given
  const bufPartial = buildMultiBoxMesh(singleFace);
  assert(quadCount(bufPartial) === 1, 'a box with only ONE face key set (no "all" fallback) emits just that one face, skipping the rest rather than crashing on an undefined texId');
}

console.log('rounded prism geometry (column8/barrel8 — round/cylindrical shapes via an N-gon, no new primitive)');
{
  console.log('  column8: quad count, non-occlusion, every quad genuinely faces outward from the cell center');
  {
    const colType = '__test_wedge_column8__';
    BLOCKS[colType] = { all: TEX.STONE, solid: true, opaque: false, wedge: 'column8' };
    const store = new VoxelStore();
    store.set(3, 3, 0, colType);
    const { opaque } = buildMesh(store);
    assert(quadCount(opaque) === WEDGES.column8.length, `a lone column8 emits exactly ${WEDGES.column8.length} quads (8 sides + 8 bottom-cap fan + 8 top-cap fan)`);

    const store2 = new VoxelStore();
    store2.set(3, 3, 0, colType);
    store2.set(4, 3, 0, 'stone');
    const { opaque: opaque2 } = buildMesh(store2);
    assert(quadCount(opaque2) === WEDGES.column8.length + 6, 'a neighboring solid cube keeps all 6 of its own faces — column8 never occludes it, same rule as ramp/SHAPES/MODELS');

    // Cell center in world-ish (grid) space: (3.5, 3.5, z-anywhere) — every SIDE quad's own
    // centroid, projected to the horizontal plane, should lie OUTWARD from (3.5,3.5) along its
    // own normal's horizontal component (proves winding is correct for every side quad, not just
    // one hand-picked face — a wrong-signed quad anywhere would fail this). Side quads are
    // identified by spanning two distinct z values (lo.z/hi.z); cap-fan quads are flat (all 4
    // corners share one z), a much more robust discriminator than centroid distance.
    const cx = 3.5, cy = 3.5;
    let sideQuadsChecked = 0;
    for (let q = 0; q < quadCount(opaque); q++) {
      const base = q * 4 * 3;
      const v = [0, 1, 2, 3].map((i) => [opaque.positions[base + i * 3], opaque.positions[base + i * 3 + 1], opaque.positions[base + i * 3 + 2]]);
      const distinctZ = new Set(v.map((p) => Math.round(p[2] * 1e6))).size;
      if (distinctZ === 1) continue; // a flat cap-fan quad — not a side wall, skip
      const centroid = [0, 1, 2].map((k) => (v[0][k] + v[1][k] + v[2][k] + v[3][k]) / 4);
      const dx = centroid[0] - cx, dy = centroid[1] - cy;
      const e1 = [v[1][0] - v[0][0], v[1][1] - v[0][1], v[1][2] - v[0][2]];
      const e2 = [v[2][0] - v[0][0], v[2][1] - v[0][1], v[2][2] - v[0][2]];
      const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
      const dot = n[0] * dx + n[1] * dy;
      assert(dot > 0, `side quad ${q} winds outward (normal's horizontal component points away from the column's own axis)`);
      sideQuadsChecked++;
    }
    assert(sideQuadsChecked === 8, 'all 8 side quads were checked (the 16 cap-fan quads were correctly skipped by the z-variance filter)');

    // Cap quads: bottom-cap normal should point straight down (-z), top-cap straight up (+z) —
    // checked directly rather than inferred, since the side-quad loop above skips them entirely.
    let bottomCapOk = true, topCapOk = true, bottomChecked = 0, topChecked = 0;
    for (let q = 0; q < quadCount(opaque); q++) {
      const base = q * 4 * 3;
      const v = [0, 1, 2, 3].map((i) => [opaque.positions[base + i * 3], opaque.positions[base + i * 3 + 1], opaque.positions[base + i * 3 + 2]]);
      const distinctZ = new Set(v.map((p) => Math.round(p[2] * 1e6))).size;
      if (distinctZ !== 1) continue; // a side quad — not a cap, skip
      const e1 = [v[1][0] - v[0][0], v[1][1] - v[0][1], v[1][2] - v[0][2]];
      const e2 = [v[2][0] - v[0][0], v[2][1] - v[0][1], v[2][2] - v[0][2]];
      const nz = e1[0] * e2[1] - e1[1] * e2[0];
      if (Math.abs(v[0][2] - 0) < 1e-6) { if (nz >= 0) bottomCapOk = false; bottomChecked++; }
      else { if (nz <= 0) topCapOk = false; topChecked++; }
    }
    assert(bottomChecked === 8 && topChecked === 8, 'found exactly 8 bottom-cap and 8 top-cap fan quads');
    assert(bottomCapOk, 'every bottom-cap quad winds with a downward-pointing normal');
    assert(topCapOk, 'every top-cap quad winds with an upward-pointing normal');
    delete BLOCKS[colType];
  }

  console.log('  depth-indexed pillar moulding (cap/mid/base courses)');
  {
    const pilType = '__test_pillar_courses__';
    BLOCKS[pilType] = {
      all: TEX.STONE,
      solid: true,
      opaque: true,
      wedge: ['pillar_cap8', 'pillar_mid8', 'pillar_base8'],
    };
    const store = new VoxelStore();
    store.set(1, 1, 0, pilType);
    store.set(1, 1, 1, pilType);
    store.set(1, 1, 2, pilType);
    const { opaque } = buildMesh(store);
    const expected =
      WEDGES.pillar_base8.length + WEDGES.pillar_mid8.length + WEDGES.pillar_cap8.length;
    assert(
      quadCount(opaque) === expected,
      `3-high pillar stack emits base+mid+cap quads (${expected}), not one profile thrice`,
    );
    store.set(2, 1, 1, 'stone');
    const { opaque: withNeighbor } = buildMesh(store);
    assert(
      quadCount(withNeighbor) === expected + 6,
      'neighbor of a pillar keeps all 6 faces (wedge is not a full opaque cube)',
    );
    delete BLOCKS[pilType];
  }

  console.log('  barrel8: tapered/bulged profile actually widens in the middle vs. column8\'s constant radius');
  {
    // Column8's every side vertex sits at horizontal distance 0.5 from the cell center; barrel8's
    // profile ([0,0.35],[0.15,0.42],[0.5,0.5],[0.85,0.42],[1,0.35]]) should have SOME vertex
    // narrower than 0.4 (the tapered ends) and SOME vertex as wide as the bulge (~0.5) — proving
    // the multi-tier radius profile genuinely varies by height, not just a relabeled column8.
    const cx = 0.5, cy = 0.5;
    const dists = WEDGES.barrel8
      .flatMap((f) => f.quad.map((p) => p.pos))
      .map(([x, y]) => Math.hypot(x - cx, y - cy));
    assert(Math.min(...dists) < 0.4, 'barrel8 tapers narrower than a straight column near its base/lid');
    assert(Math.max(...dists) >= 0.49, 'barrel8 bulges back out to (near) the full 0.5 radius in the middle tier');

    const barrelType = '__test_wedge_barrel8__';
    BLOCKS[barrelType] = { all: TEX.STONE, solid: true, opaque: false, wedge: 'barrel8' };
    const store = new VoxelStore();
    store.set(1, 1, 0, barrelType);
    const { opaque } = buildMesh(store);
    assert(quadCount(opaque) === WEDGES.barrel8.length, `a lone barrel8 emits exactly ${WEDGES.barrel8.length} quads (4 tiers x 8 side quads + 8 bottom-cap fan + 8 top-cap fan)`);
    delete BLOCKS[barrelType];
  }
}

console.log('tangent attribute — populated per vertex, matches FACE_AO\'s own in-plane U axis');
{
  const store = new VoxelStore();
  store.set(5, 5, 5, 'stone');
  const { opaque } = buildMesh(store);
  assert(opaque.tangents.length === opaque.positions.length, 'one tangent (3 floats) per vertex, same as normals');
  // Top face is quad 0 (DIRS order: top,bottom,north,south,east,west) — FACE_AO.top.u is [1,0,0].
  assert(opaque.tangents[0] === 1 && opaque.tangents[1] === 0 && opaque.tangents[2] === 0, "the top face's tangent matches FACE_AO.top's own in-plane U axis");
  // East face is quad 4 (24 verts * 3 floats in) — FACE_AO.east.u is [0,1,0].
  const eastBase = 4 * 4 * 3;
  assert(opaque.tangents[eastBase] === 0 && opaque.tangents[eastBase + 1] === 1 && opaque.tangents[eastBase + 2] === 0, "the east face's tangent matches FACE_AO.east's own in-plane U axis");
}

console.log('liquidCornerHeight — Minecraft-style averaged/sloped liquid surface');
{
  const heights = new Map();
  const getHeight = (c, r, z) => heights.get(`${c},${r},${z}`) ?? 1;

  console.log('  isolated cell (no same-type neighbors): corner height = its own height');
  {
    const store = new VoxelStore();
    store.set(5, 5, 0, 'water');
    heights.set('5,5,0', 0.5);
    const h = liquidCornerHeight(store, 5, 5, 0, 'water', getHeight, 1, 1); // SE corner
    assert(Math.abs(h - 0.5) < 1e-9, 'no same-type neighbors at all -> falls back to this cell\'s own height (this cell itself is one of the 4 candidates and always matches)');
    heights.clear();
  }

  console.log('  two same-type neighbors sharing a corner average smoothly (not a hard step)');
  {
    const store = new VoxelStore();
    store.set(5, 5, 0, 'water');
    store.set(6, 5, 0, 'water'); // east neighbor (shares the NE/SE corners with (5,5,0))
    heights.set('5,5,0', 0.8);
    heights.set('6,5,0', 0.2);
    // SE corner (su=1,sv=1) of (5,5,0) touches: (5,5,0), (6,5,0)[side U], (5,6,0)[side V, empty], (6,6,0)[diagonal, empty]
    const hSE = liquidCornerHeight(store, 5, 5, 0, 'water', getHeight, 1, 1);
    assert(Math.abs(hSE - 0.5) < 1e-9, 'the shared corner averages the two contributing columns (0.8+0.2)/2 = 0.5, a smooth blend not a hard 0.8-vs-0.2 seam');
    heights.clear();
  }

  console.log('  a wall/solid neighbor never drags a corner down (excluded, not treated as height 0)');
  {
    const store = new VoxelStore();
    store.set(5, 5, 0, 'water');
    store.set(6, 5, 0, 'stone'); // solid, not water — must be excluded from the average entirely
    heights.set('5,5,0', 0.6);
    const hSE = liquidCornerHeight(store, 5, 5, 0, 'water', getHeight, 1, 1);
    assert(Math.abs(hSE - 0.6) < 1e-9, 'the solid neighbor contributes nothing — corner height is just this cell\'s own 0.6, not pulled toward 0');
    heights.clear();
  }

  console.log('  same liquid stacked one level higher does NOT force full height — average stays smooth, no discontinuity');
  {
    // An earlier version force-set this to full height (1) — reverted after a real bug hit
    // live: forcing SOME of a cell's 4 corners to 1 while others stayed near their shallow
    // average produced a visibly warped/disconnected quad ("floating broken diamond") instead
    // of a smooth taper. The plain average (bounded 0..1, since getHeight always is) is the
    // only source of truth now — no special case that can jump a corner discontinuously.
    const store = new VoxelStore();
    store.set(5, 5, 0, 'water');
    store.set(5, 5, 1, 'water'); // stacked directly above this SAME cell
    heights.set('5,5,0', 0.3);
    const h = liquidCornerHeight(store, 5, 5, 0, 'water', getHeight, 1, 1);
    assert(Math.abs(h - 0.3) < 1e-9, 'water stacked one level up does not override the average — stays at this cell\'s own 0.3, smooth and predictable');
    heights.clear();
  }
}

console.log('buildMesh: tapered liquid integration (opt-in via opts.liquidHeights)');
{
  console.log('  no liquidHeights supplied -> byte-identical to today\'s plain full-cube water (regression safety)');
  {
    const store = new VoxelStore();
    store.set(0, 0, 0, 'water');
    store.set(1, 0, 0, 'water');
    const { translucent } = buildMesh(store); // no opts.liquidHeights at all
    assert(quadCount(translucent) === 10, 'unaffected by the tapered-liquid feature when no heights are supplied — same count the existing water-pool test already asserts');
  }

  console.log('  an isolated cell below full height renders as a flat 6-quad slab-like shape');
  {
    const store = new VoxelStore();
    store.set(5, 5, 0, 'water');
    const liquidHeights = new Map([['5,5,0', 0.5]]);
    const { translucent } = buildMesh(store, { liquidHeights });
    assert(quadCount(translucent) === 6, 'bottom + top + 4 side walls, all corners non-zero at height 0.5');
  }

  console.log('  a fully-thin edge (adjacent to nothing, height near 0) skips its outward-facing side walls');
  {
    const store = new VoxelStore();
    store.set(5, 5, 0, 'water');
    const liquidHeights = new Map([['5,5,0', 0.01]]);
    const { translucent } = buildMesh(store, { liquidHeights });
    // Still bottom + top (2), but all 4 sides collapse to ~0 height and get skipped -> 2 quads.
    assert(quadCount(translucent) === 2, 'near-zero height skips all 4 side walls (nothing visible there), leaving just the flat bottom+top');
  }

  console.log('  two adjacent tapered (below-full-height) same-type cells skip their SHARED internal wall');
  {
    // Real bug hit live: a large connected flood rendered EVERY cell's 4 side walls
    // unconditionally, so — being translucent — you could see straight through a near cell's
    // wall into the far cell's wall behind it ("overlapping backfaces"/"front faces of the
    // water tile behind the next one"). Adjacent same-type cells share a seam that should be
    // invisible, same as the ordinary full-cube translucent path already does.
    const store = new VoxelStore();
    store.set(5, 5, 0, 'water');
    store.set(6, 5, 0, 'water'); // east neighbor — shares water's east/west wall with (5,5,0)
    const liquidHeights = new Map([['5,5,0', 0.5], ['6,5,0', 0.5]]);
    const { translucent } = buildMesh(store, { liquidHeights });
    // Each cell alone would be bottom+top+4 walls = 6 (see the isolated-cell test above); with
    // the shared east(5,5,0)/west(6,5,0) wall skipped on BOTH sides, that's 6+6-2 = 10.
    assert(quadCount(translucent) === 10, 'the shared east/west wall between the two connected cells is skipped on both sides (10, not 12)');
  }

  console.log('  a tapered cell next to a DIFFERENT material (not the same liquid) still draws its wall normally');
  {
    const store = new VoxelStore();
    store.set(5, 5, 0, 'water');
    store.set(6, 5, 0, 'stone'); // solid, different type — a real boundary, not an internal seam
    const liquidHeights = new Map([['5,5,0', 0.5]]);
    const { translucent } = buildMesh(store, { liquidHeights });
    assert(quadCount(translucent) === 6, 'a non-same-type neighbor is a real boundary — all 4 walls still draw (6 total), same as the fully-isolated case');
  }

  console.log('  height === 1 (a source/full cell) falls through to the ordinary occlusion-culled full-cube path, not the tapered path');
  {
    const store = new VoxelStore();
    store.set(5, 5, 0, 'water');
    store.set(6, 5, 0, 'water'); // same-type neighbor -> ordinary translucent culling shares 1 face
    const liquidHeights = new Map([['5,5,0', 1], ['6,5,0', 1]]);
    const { translucent } = buildMesh(store, { liquidHeights });
    assert(quadCount(translucent) === 10, 'full-height cells still get the ordinary same-type face culling (10, matching the no-liquidHeights case above), not 12 (which the always-6-faces tapered path would produce for 2 cells)');
  }
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
