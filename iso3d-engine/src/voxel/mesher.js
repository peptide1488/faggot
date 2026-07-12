/**
 * Pure geometry: voxel store -> { opaque, translucent } mesh buffers of textured quads.
 * No WebGL here — see voxel/renderer.js for the GL upload/draw side. Axis convention matches
 * blocks.js (c=+x east, r=+y south, z=+z up); one geometry path — everything is emitted as
 * textured boxes (a cube and a slab are just the trivial 1-box "models").
 */

import { parseBlock, resolveFace, atlasUV, MODELS, BLOCKS, FACING } from './blocks.js';
import { tileLightRGB } from './lighting.js';

const DIRS = [
  { name: 'top', dc: 0, dr: 0, dz: 1 },
  { name: 'bottom', dc: 0, dr: 0, dz: -1 },
  { name: 'north', dc: 0, dr: -1, dz: 0 },
  { name: 'south', dc: 0, dr: 1, dz: 0 },
  { name: 'east', dc: 1, dr: 0, dz: 0 },
  { name: 'west', dc: -1, dr: 0, dz: 0 },
];
const FACE_NAMES = DIRS.map((d) => d.name);

/** Fake directional light, classic blocky look: top brightest, north/west darkest. */
const FACE_SHADE = { top: 1.0, bottom: 0.5, south: 0.8, east: 0.8, north: 0.65, west: 0.65 };
/** Vertex AO brightness by occlusion count (0 = no neighbors, 3 = fully tucked into a corner). */
const AO_CURVE = [1.0, 0.78, 0.6, 0.45];
const WHITE = [1, 1, 1];

// Per-face in-plane axes (u,v) and each FACE_VERTS corner's (su,sv) sign, used to find the
// 3 AO-relevant neighbor cells per corner (classic Minecraft-style corner AO). Derived by
// hand from FACE_VERTS's own vertex order — see VOXEL_PLAN.md if these ever need re-deriving.
const CORNERS_A = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
const CORNERS_B = [[-1, -1], [-1, 1], [1, 1], [1, -1]];
const FACE_AO = {
  top: { normal: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0], corners: CORNERS_A },
  bottom: { normal: [0, 0, -1], u: [1, 0, 0], v: [0, 1, 0], corners: CORNERS_B },
  north: { normal: [0, -1, 0], u: [1, 0, 0], v: [0, 0, 1], corners: CORNERS_A },
  south: { normal: [0, 1, 0], u: [1, 0, 0], v: [0, 0, 1], corners: CORNERS_B },
  east: { normal: [1, 0, 0], u: [0, 1, 0], v: [0, 0, 1], corners: CORNERS_A },
  west: { normal: [-1, 0, 0], u: [0, 1, 0], v: [0, 0, 1], corners: CORNERS_B },
};

/** How far below the top of a contiguous same-type vertical run this block sits (0 = top). */
function depthBelowStackTop(store, c, r, z, type) {
  let top = z;
  for (;;) {
    const above = store.get(c, r, top + 1);
    if (!above || parseBlock(above).type !== type) break;
    top++;
  }
  return top - z;
}

/** Only a full, opaque, non-slab, non-model cube occludes a neighbor's face. */
function isFullOpaqueCube(blockStr) {
  if (!blockStr) return false;
  const parsed = parseBlock(blockStr);
  const def = BLOCKS[parsed.type];
  if (!def || def.model || parsed.slab) return false;
  return !!def.opaque;
}

function createMeshBuffer() {
  return { positions: [], uvs: [], colors: [], indices: [] };
}

/** colors: a single [r,g,b] (flat) or an array of 4 [r,g,b]s (per-vertex, for AO). flip picks
 * which diagonal splits the quad into triangles — matters once corners can differ (AO). */
function pushQuad(buf, verts, uv, colors, flip = false) {
  const base = buf.positions.length / 3;
  const c = Array.isArray(colors[0]) ? colors : [colors, colors, colors, colors];
  const uvCorners = [
    [uv.u0, uv.v0],
    [uv.u1, uv.v0],
    [uv.u1, uv.v1],
    [uv.u0, uv.v1],
  ];
  for (let i = 0; i < 4; i++) {
    buf.positions.push(verts[i][0], verts[i][1], verts[i][2]);
    buf.uvs.push(uvCorners[i][0], uvCorners[i][1]);
    buf.colors.push(c[i][0], c[i][1], c[i][2]);
  }
  if (flip) {
    buf.indices.push(base + 1, base + 2, base + 3, base + 1, base + 3, base);
  } else {
    buf.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
}

/** Per-corner AO occlusion count (0-3, higher = darker) — classic 3-neighbor voxel AO.
 * Only meaningful for grid-aligned full cubes; slabs/models don't use this. */
function vertexAOCounts(store, c, r, z, faceName) {
  const { normal, u, v, corners } = FACE_AO[faceName];
  const nc = c + normal[0];
  const nr = r + normal[1];
  const nz = z + normal[2];
  return corners.map(([su, sv]) => {
    const sideU = isFullOpaqueCube(store.get(nc + su * u[0], nr + su * u[1], nz + su * u[2]));
    const sideV = isFullOpaqueCube(store.get(nc + sv * v[0], nr + sv * v[1], nz + sv * v[2]));
    if (sideU && sideV) return 3; // both edges solid -> corner forced fully occluded
    const cornerSolid = isFullOpaqueCube(
      store.get(nc + su * u[0] + sv * v[0], nr + su * u[1] + sv * v[1], nz + su * u[2] + sv * v[2]),
    );
    return (sideU ? 1 : 0) + (sideV ? 1 : 0) + (cornerSolid ? 1 : 0);
  });
}

// Per-face vertex order verified (by hand, via cross product) to be CCW as seen from the
// direction of that face's outward normal — required for gl.CULL_FACE to work correctly
// from day one (see VOXEL_PLAN.md pitfall #2). Do not reorder without re-deriving.
const FACE_VERTS = {
  top: (x0, y0, z0, x1, y1, z1) => [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]],
  bottom: (x0, y0, z0, x1, y1) => [[x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [x1, y0, z0]],
  north: (x0, y0, z0, x1, y1, z1) => [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]],
  south: (x0, y0, z0, x1, y1, z1) => [[x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0]],
  east: (x0, y0, z0, x1, y1, z1) => [[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]],
  west: (x0, y0, z0, x1, y1, z1) => [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]],
};

/** vHalf: use only the top half of the atlas cell's V range — for a slab's SIDE faces, so a
 * half-height quad doesn't squish the texture vertically (see VOXEL_PLAN.md Data model/Slabs).
 * aoFactor: an extra flat multiplier — used by slabs/models to get a cheap whole-face darkening
 * from their cell's neighbors (see cellFaceAO) without needing true per-vertex AO on a shape
 * that isn't a grid-aligned full cube. lightColor: [r,g,b] from lighting.js's tileLightRGB —
 * torches/spells genuinely tint geometry, not just brighten it. */
function emitFace(buf, faceName, worldBox, texId, lightColor, vHalf = false, aoFactor = 1.0) {
  const [x0, y0, z0] = worldBox.from;
  const [x1, y1, z1] = worldBox.to;
  const verts = FACE_VERTS[faceName](x0, y0, z0, x1, y1, z1);
  let uv = atlasUV(texId);
  if (vHalf) {
    const midV = uv.v0 + (uv.v1 - uv.v0) * 0.5;
    uv = { u0: uv.u0, u1: uv.u1, v0: uv.v0, v1: midV };
  }
  const scalar = FACE_SHADE[faceName] * aoFactor;
  const color = [scalar * lightColor[0], scalar * lightColor[1], scalar * lightColor[2]];
  pushQuad(buf, verts, uv, color);
}

/** Cheap flat AO for a whole face of a non-cube shape (slab/model): average the same 4
 * corner occlusion counts full cubes use for this cell, mapped through AO_CURVE. Not a
 * per-vertex gradient — just enough to make furniture/doors read as darker against a wall
 * or tucked into a corner, without needing true per-vertex AO on an irregular box shape. */
function cellFaceAO(store, c, r, z, faceName) {
  const counts = vertexAOCounts(store, c, r, z, faceName);
  const avg = counts.reduce((a, b) => a + b, 0) / counts.length;
  const lo = Math.floor(avg);
  const hi = Math.min(3, Math.ceil(avg));
  const t = avg - lo;
  return AO_CURVE[lo] * (1 - t) + AO_CURVE[hi] * t;
}

/** Like emitFace, but with per-vertex Minecraft-style corner AO — used only for grid-aligned
 * full cubes, where "neighbor cell" is unambiguous (slabs/models keep the flat emitFace). */
function emitFaceAO(buf, faceName, worldBox, texId, lightColor, store, c, r, z) {
  const [x0, y0, z0] = worldBox.from;
  const [x1, y1, z1] = worldBox.to;
  const verts = FACE_VERTS[faceName](x0, y0, z0, x1, y1, z1);
  const uv = atlasUV(texId);
  const base = FACE_SHADE[faceName];
  const aoCounts = vertexAOCounts(store, c, r, z, faceName);
  const colors = aoCounts.map((n) => {
    const scalar = base * AO_CURVE[n];
    return [scalar * lightColor[0], scalar * lightColor[1], scalar * lightColor[2]];
  });
  // Flip the triangulation diagonal toward the more-consistently-lit pair of corners, or a
  // lone dark/bright corner creates a visible diagonal seam under bilinear interpolation.
  const flip = aoCounts[0] + aoCounts[2] < aoCounts[1] + aoCounts[3];
  pushQuad(buf, verts, uv, colors, flip);
}

/** Rotate a local (x,y) unit-cube coordinate around the cell center by `facing` steps
 * (0..3, clockwise N->E->S->W — matches blocks.js FACING order). */
function rotateXY(x, y, facing) {
  switch (facing & 3) {
    case 1: return [1 - y, x];
    case 2: return [1 - x, 1 - y];
    case 3: return [y, 1 - x];
    default: return [x, y];
  }
}

const COMPASS_ORDER = ['north', 'east', 'south', 'west'];
/** World face name a CANONICAL (facing=N) face named `name` ends up as after rotating by
 * `facing` steps. top/bottom/all are unaffected by a yaw rotation. */
function rotateFaceName(name, facing) {
  const idx = COMPASS_ORDER.indexOf(name);
  if (idx === -1) return name;
  return COMPASS_ORDER[(idx + facing) % 4];
}

function rotateModelBox(box, facing) {
  const [x0, y0, z0] = box.from;
  const [x1, y1, z1] = box.to;
  const c0 = rotateXY(x0, y0, facing);
  const c1 = rotateXY(x1, y1, facing);
  return {
    from: [Math.min(c0[0], c1[0]), Math.min(c0[1], c1[1]), z0],
    to: [Math.max(c0[0], c1[0]), Math.max(c0[1], c1[1]), z1],
  };
}

function resolveBoxFaceTex(box, faceName) {
  return box.faces[faceName] !== undefined ? box.faces[faceName] : box.faces.all;
}

/**
 * Build opaque + translucent mesh buffers from a voxel store.
 * opts.lightProfile: optional resolveLighting() output (lighting.js) — ambient + torch/spell
 * points, genuinely colored. Omit for full white light (matches pre-lighting behavior exactly).
 */
export function buildMesh(store, opts = {}) {
  const lightProfile = opts.lightProfile || null;
  const opaque = createMeshBuffer();
  const translucent = createMeshBuffer();

  for (const { c, r, z, block } of store.entries()) {
    const parsed = parseBlock(block);
    const def = BLOCKS[parsed.type];
    if (!def) continue;
    const facing = parsed.facing ?? FACING.N;
    const lightColor = lightProfile ? tileLightRGB(lightProfile, c, r) : WHITE;
    const target = def.translucent ? translucent : opaque;

    if (def.model) {
      for (const box of MODELS[def.model]) {
        const rotated = rotateModelBox(box, facing);
        const worldBox = {
          from: [rotated.from[0] + c, rotated.from[1] + r, rotated.from[2] + z],
          to: [rotated.to[0] + c, rotated.to[1] + r, rotated.to[2] + z],
        };
        // Model boxes occlude nothing and are never occluded — always emit all 6 faces.
        for (const faceName of FACE_NAMES) {
          const canonicalFace = rotateFaceName(faceName, (4 - facing) % 4);
          const texId = resolveBoxFaceTex(box, canonicalFace);
          const ao = cellFaceAO(store, c, r, z, faceName);
          emitFace(target, faceName, worldBox, texId, lightColor, false, ao);
        }
      }
      continue;
    }

    const height = parsed.slab ? 0.5 : 1;
    const worldBox = { from: [c, r, z], to: [c + 1, r + 1, z + height] };
    const depth = depthBelowStackTop(store, c, r, z, parsed.type);

    if (parsed.slab) {
      // Slabs occlude nothing and are never occluded — always emit all 6 faces.
      for (const faceName of FACE_NAMES) {
        const texId = resolveFace(parsed.type, faceName, { facing, depth });
        const vHalf = faceName !== 'top' && faceName !== 'bottom';
        const ao = cellFaceAO(store, c, r, z, faceName);
        emitFace(target, faceName, worldBox, texId, lightColor, vHalf, ao);
      }
      continue;
    }

    // Full cube — face culling against neighbors.
    for (const dir of DIRS) {
      const nBlock = store.get(c + dir.dc, r + dir.dr, z + dir.dz);
      let occluded;
      if (def.translucent) {
        // Only a same-type translucent neighbor (e.g. water next to water) is "internal";
        // solid or air neighbors are always exposed — depth test hides truly-buried ones
        // for free in the translucent pass, so there's no need for a full occlusion test here.
        occluded = false;
        if (nBlock) {
          const nParsed = parseBlock(nBlock);
          const nDef = BLOCKS[nParsed.type];
          if (nParsed.type === parsed.type && nDef && !nDef.model && !nParsed.slab) occluded = true;
        }
      } else {
        occluded = isFullOpaqueCube(nBlock);
      }
      if (occluded) continue;
      const texId = resolveFace(parsed.type, dir.name, { facing, depth });
      if (def.translucent) {
        emitFace(target, dir.name, worldBox, texId, lightColor);
      } else {
        emitFaceAO(target, dir.name, worldBox, texId, lightColor, store, c, r, z);
      }
    }
  }

  return { opaque, translucent };
}

export function quadCount(buf) {
  return buf.indices.length / 6;
}

/**
 * A single textured box mesh at an arbitrary grid-space position — NOT tied to the store's
 * integer cell keys, so it works for units mid-movement (fractional c,r,z). Reuses the exact
 * same face-winding/UV/shading primitives as buildMesh, so a unit box has the same rendering
 * correctness guarantees as any other voxel geometry.
 */
export function buildBoxMesh(box, texId, lightColor = WHITE) {
  const buf = createMeshBuffer();
  for (const faceName of FACE_NAMES) {
    emitFace(buf, faceName, box, texId, lightColor);
  }
  return buf;
}
