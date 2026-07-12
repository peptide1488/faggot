/**
 * Pure geometry: voxel store -> { opaque, translucent } mesh buffers of textured quads.
 * No WebGL here — see voxel/renderer.js for the GL upload/draw side. Axis convention matches
 * blocks.js (c=+x east, r=+y south, z=+z up); one geometry path — everything is emitted as
 * textured boxes (a cube and a slab are just the trivial 1-box "models").
 */

import { parseBlock, resolveFace, atlasUV, MODELS, SHAPES, BLOCKS, FACING, pickDepth } from './blocks.js';
import { raycastVoxels } from './pick.js';

const DIRS = [
  { name: 'top', dc: 0, dr: 0, dz: 1 },
  { name: 'bottom', dc: 0, dr: 0, dz: -1 },
  { name: 'north', dc: 0, dr: -1, dz: 0 },
  { name: 'south', dc: 0, dr: 1, dz: 0 },
  { name: 'east', dc: 1, dr: 0, dz: 0 },
  { name: 'west', dc: -1, dr: 0, dz: 0 },
];
const FACE_NAMES = DIRS.map((d) => d.name);

/** Fallback fake directional light (no lightProfile at all — the pre-lighting look every
 * tools/voxel_*_check.html page still relies on): top brightest, north/west darkest. With a
 * real lightProfile, actual sun direction lives elsewhere — see computeFaceSunTable (the
 * per-vertex sunLit attribute) and renderer.js's shadow map + shader uniforms. */
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

/** Only a full, opaque, non-slab, non-model, non-shape cube occludes a neighbor's face. */
function isFullOpaqueCube(blockStr) {
  if (!blockStr) return false;
  const parsed = parseBlock(blockStr);
  const def = BLOCKS[parsed.type];
  if (!def || def.model || def.shape || parsed.slab) return false;
  return !!def.opaque;
}

/**
 * lighting.js's sun/point-light math is ported from Grimoire's own Y-up (x=east, y=up,
 * z=south) 2D/pseudo-3D renderer — see lighting.js's file header, "do not fork". This
 * engine's own mesh-local space is Z-up (x=c/column, y=r/row, z=elevation — see blocks.js's
 * axis convention). Face normals below (FACE_AO) are authored in THAT space, so any
 * lighting.js direction vector needs the same y<->z swap voxel.html's screenToGridRay already
 * performs for camera rays before it can be dotted against a face normal here.
 */
function sunDirToVoxelSpace(sunDir) {
  const [sx, sy, sz] = sunDir;
  const len = Math.hypot(sx, sy, sz) || 1;
  return [sx / len, sz / len, sy / len];
}

const DEFAULT_SUN_DIR = [0.55, 0.82, 0.28]; // matches lighting.js LIGHT_PRESETS.day

/** Old ambientLevel-stepped ambient (0/1/2 -> 0.06/0.2/0.45/0.92) — the exact, unchanged,
 * already-tested scalar dungeon mode used since before any sun work, and still the DEFAULT
 * scene-wide ambient intensity for every mode unless profile.voxelAmbientColor overrides it
 * (see makeLightSampler). */
export function ambientBase(profile) {
  return profile.ambientLevel >= 2 ? 0.92 : profile.ambientLevel === 1 ? 0.45 : profile.ambientLevel > 0 ? 0.2 : 0.06;
}

/**
 * Pure per-face "how directly does this face point at the sun" scalar (0..1, via
 * max(0,dot(normal,sunDir))) — deliberately NOT scaled by sunColor/keyStrength (those are now
 * GPU shader uniforms — uSunColor/uSunStrength in renderer.js — so dragging those sliders no
 * longer needs a mesh rebuild at all, just new uniforms). This is the ONE piece of sun data
 * still baked per-vertex into the mesh (as the `sunLit` attribute — see emitFace/emitFaceAO):
 * which way each face points, relative to the sun. Shadow VISIBILITY (does something block
 * the sun from this exact point) used to be a per-vertex CPU raycast here — replaced by a
 * real GPU shadow map (renderer.js's depth pre-pass), which gives genuinely higher resolution
 * without inflating vertex/triangle counts the way subdividing faces for more raycast samples
 * did (see git history — that approach was tried and reverted for exactly this reason).
 * Computed once per mesh build (6 entries), indexed by face name.
 */
export function computeFaceSunTable(sunDir) {
  const sunDirVoxel = sunDirToVoxelSpace(sunDir || DEFAULT_SUN_DIR);
  const table = {};
  for (const face of Object.keys(FACE_AO)) {
    const n = FACE_AO[face].normal;
    table[face] = Math.max(0, n[0] * sunDirVoxel[0] + n[1] * sunDirVoxel[1] + n[2] * sunDirVoxel[2]);
  }
  return table;
}

/**
 * Build a (worldX, worldY, worldZ, faceName) -> [r,g,b] sampler for this specific mesh build —
 * ambient + shadow-tested point lights (torches) ONLY now; the sun's contribution is entirely
 * a GPU concern (sunLit vertex attribute + shadow map + shader uniforms — see
 * computeFaceSunTable's doc comment and renderer.js). No lightProfile -> the ORIGINAL fixed
 * fake-directional look (FACE_SHADE), zero cost, byte-identical to every
 * tools/voxel_*_check.html page's pre-lighting default.
 */
function makeLightSampler(store, profile) {
  if (!profile) {
    return (wx, wy, wz, faceName) => {
      const s = FACE_SHADE[faceName];
      return [s, s, s];
    };
  }
  // profile.voxelAmbientColor: an explicit override from voxel.html's Sun/Ambient panel
  // (NOT a lighting.js/LIGHT_PRESETS field — resolveLighting only passes through its own
  // whitelisted fields, so this is attached directly onto the resolved profile object by the
  // caller). Absent -> the proven ambientBase(profile) scalar, so day/dungeon's default look
  // (no sliders touched) never regresses.
  const [ambR, ambG, ambB] = profile.voxelAmbientColor || [ambientBase(profile), ambientBase(profile), ambientBase(profile)];
  const points = profile.points || [];
  return (wx, wy, wz) => {
    let r = ambR;
    let g = ambG;
    let b = ambB;
    for (const p of points) {
      const lx = p.col + 0.5;
      const ly = p.row + 0.5;
      const lz = p.z != null ? p.z : 1.5;
      const dx = wx - lx;
      const dy = wy - ly;
      const dz = wz - lz;
      const dist = Math.hypot(dx, dy, dz);
      const rad = Math.max(0.5, p.radius);
      if (dist > rad || dist < 1e-6) continue;
      const hit = raycastVoxels(store, [lx, ly, lz], [wx - lx, wy - ly, wz - lz], { maxDist: dist - 0.05 });
      if (hit) continue; // solid geometry blocks this light's path — a real shadow
      const t = 1 - dist / rad;
      const contrib = (p.intensity || 1) * t * t * 0.85;
      const [cr, cg, cb] = p.color || [1, 1, 1];
      r += cr * contrib;
      g += cg * contrib;
      b += cb * contrib;
    }
    // Ceiling is intentionally high (not ~1.0-1.3) — GL already saturates fragColor to white
    // at the framebuffer once tex.rgb*vTint exceeds 1 per channel, so this only needs to stay
    // finite/sane; it must NOT be the thing that stops a cranked torch from blowing a dark
    // texture out to pure white.
    const clamp = (v) => Math.max(0, Math.min(6.0, v));
    return [clamp(r), clamp(g), clamp(b)];
  };
}

function createMeshBuffer() {
  return { positions: [], uvs: [], colors: [], sunLit: [], indices: [] };
}

/** A face's texId is either a plain number (built-in material, indexes the one shared atlas —
 * see atlasUV) or a `{ materialId, u0, v0, u1, v1 }` ref (custom material-maker material, its
 * own small texture — see customMaterials.js). This is the one place that tells the two apart. */
function resolveUV(texId) {
  return typeof texId === 'number' ? atlasUV(texId) : texId;
}

/** colors: a single [r,g,b] (flat) or an array of 4 [r,g,b]s (per-vertex, for AO). uvCorners:
 * an array of 4 [u,v] pairs, one per vertex (see faceUVCorners — never a generic rect+index
 * table, that's what caused the south/west axis-transposition bug). sunLit: a single 0..1
 * scalar (see computeFaceSunTable) — constant across a whole face, since a flat face has one
 * normal, so it's broadcast to all 4 vertices; consumed in the shader alongside the shadow-map
 * lookup to decide how much of the sun's color/strength this fragment actually gets. flip
 * picks which diagonal splits the quad into triangles — matters once corners can differ (AO). */
function pushQuad(buf, verts, uvCorners, colors, sunLit = 0, flip = false) {
  const base = buf.positions.length / 3;
  const c = Array.isArray(colors[0]) ? colors : [colors, colors, colors, colors];
  for (let i = 0; i < 4; i++) {
    buf.positions.push(verts[i][0], verts[i][1], verts[i][2]);
    buf.uvs.push(uvCorners[i][0], uvCorners[i][1]);
    buf.colors.push(c[i][0], c[i][1], c[i][2]);
    buf.sunLit.push(sunLit);
  }
  if (flip) {
    buf.indices.push(base + 1, base + 2, base + 3, base + 1, base + 3, base);
  } else {
    buf.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
}

/**
 * Compute each vertex's [u,v] directly from its own world position — not from a generic
 * "corner index" table, which is what caused south/west to come out with U and V transposed
 * relative to north/east (an artifact of FACE_VERTS' hand-derived winding order, verified
 * correct for backface culling but never checked for UV-axis consistency). This is the one
 * function responsible for texture orientation on every face type — fixing it here fixes
 * grass sides, dungeon_wall's cap/mid/base courses, and any future side-textured material
 * uniformly, instead of re-deriving per-material.
 * top/bottom: u tracks x, v tracks y (arbitrary but consistent; no "up" to get wrong).
 * side faces: u tracks the horizontal in-plane axis, v tracks height — with v where a
 * texture's file-TOP row lands at world z1 (top), matching what any texture author expects
 * (atlasUV's own v0 is file-row-0 = file top, so file-top -> world-top means high z -> v0).
 */
function faceUVCorners(faceName, verts, box, uv) {
  const [x0, y0, z0] = box.from;
  const [x1, y1, z1] = box.to;
  const dx = x1 - x0 || 1;
  const dy = y1 - y0 || 1;
  const dz = z1 - z0 || 1;
  return verts.map(([vx, vy, vz]) => {
    let hFrac;
    let zFrac;
    if (faceName === 'top' || faceName === 'bottom') {
      hFrac = (vx - x0) / dx;
      zFrac = (vy - y0) / dy;
    } else if (faceName === 'north' || faceName === 'south') {
      hFrac = (vx - x0) / dx;
      zFrac = (vz - z0) / dz;
    } else {
      hFrac = (vy - y0) / dy;
      zFrac = (vz - z0) / dz;
    }
    const u = hFrac < 0.5 ? uv.u0 : uv.u1;
    // High z (world top) -> uv.v0 (the texture's own top row) for side faces. Top/bottom
    // don't have a "height" axis in-plane, so this is just a consistent second axis there.
    const v = zFrac < 0.5 ? uv.v1 : uv.v0;
    return [u, v];
  });
}

/** Per-corner AO occlusion count (0-3, higher = darker) — classic 3-neighbor voxel AO.
 * Only meaningful for grid-aligned full cubes; slabs/models don't use this. */
/**
 * Generic 3-neighbor corner sampling for one face's 4 corners: for each corner, test the 2
 * adjacent + 1 diagonal neighbor cell against `predicate`, with the classic Wang/AO rule
 * that both adjacents matching forces the corner to count as fully matching too (avoids an
 * inverted-looking single-pixel notch). Shared by two consumers: AO (predicate = "is this
 * neighbor a full opaque cube") and autotile corner-mask selection (predicate = "is this
 * neighbor the same material") — same geometry, different question.
 */
export function faceCornerNeighborCounts(store, c, r, z, faceName, predicate) {
  const { normal, u, v, corners } = FACE_AO[faceName];
  const nc = c + normal[0];
  const nr = r + normal[1];
  const nz = z + normal[2];
  return corners.map(([su, sv]) => {
    const sideU = predicate(store.get(nc + su * u[0], nr + su * u[1], nz + su * u[2]));
    const sideV = predicate(store.get(nc + sv * v[0], nr + sv * v[1], nz + sv * v[2]));
    if (sideU && sideV) return 3;
    const cornerSolid = predicate(
      store.get(nc + su * u[0] + sv * v[0], nr + su * u[1] + sv * v[1], nz + su * u[2] + sv * v[2]),
    );
    return (sideU ? 1 : 0) + (sideV ? 1 : 0) + (cornerSolid ? 1 : 0);
  });
}

function vertexAOCounts(store, c, r, z, faceName) {
  return faceCornerNeighborCounts(store, c, r, z, faceName, isFullOpaqueCube);
}

// NW,NE,SE,SW — same corner order/convention as FACE_AO.top, but NOT the same sampling: see
// autotileCornerMask below for why this can't reuse faceCornerNeighborCounts directly.
const TOP_AUTOTILE_CORNERS = [[-1, -1], [1, -1], [1, 1], [-1, 1]];

/**
 * Corner-Wang autotile mask for a top face: 4 bits, one per corner (NW,NE,SE,SW), set when
 * that corner's neighbor COLUMNS are the SAME material as this block. Directly indexes a
 * material's `topAutotile` 16-tile array — see CONTENT_TOOLS_PLAN.md for the authoring
 * convention. Cosmetic only; unrelated to AO/culling.
 *
 * Deliberately does NOT reuse faceCornerNeighborCounts/FACE_AO.top: AO's "top" entry offsets
 * by normal=[0,0,1] because it's asking "what's occupying the space ABOVE this face" (z+1).
 * Autotiling asks a different question — "is the adjacent COLUMN the same material as me" —
 * which must sample at THIS block's own z, not z+1. Reusing the AO offset here would silently
 * sample the wrong layer.
 */
export function autotileCornerMask(store, c, r, z, type) {
  const sameType = (blockStr) => !!blockStr && parseBlock(blockStr).type === type;
  let mask = 0;
  TOP_AUTOTILE_CORNERS.forEach(([su, sv], i) => {
    const sideU = sameType(store.get(c + su, r, z));
    const sideV = sameType(store.get(c, r + sv, z));
    let count;
    if (sideU && sideV) {
      count = 3;
    } else {
      const cornerSame = sameType(store.get(c + su, r + sv, z));
      count = (sideU ? 1 : 0) + (sideV ? 1 : 0) + (cornerSame ? 1 : 0);
    }
    if (count >= 2) mask |= 1 << i;
  });
  return mask;
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
 * that isn't a grid-aligned full cube. sampleLight: (x,y,z,faceName)->[r,g,b] from
 * makeLightSampler — ambient + shadow-tested point lights only now (see its doc comment).
 * sunLit: this face's computeFaceSunTable value, baked as a per-vertex attribute for the
 * shader's shadow-map pass to consume — see pushQuad's doc comment. */
function emitFace(pickBuffer, translucentFlag, faceName, worldBox, texId, sampleLight, vHalf = false, aoFactor = 1.0, sunLit = 0) {
  const buf = pickBuffer(translucentFlag, texId);
  const [x0, y0, z0] = worldBox.from;
  const [x1, y1, z1] = worldBox.to;
  const verts = FACE_VERTS[faceName](x0, y0, z0, x1, y1, z1);
  let uv = resolveUV(texId);
  if (vHalf) {
    const midV = uv.v0 + (uv.v1 - uv.v0) * 0.5;
    uv = { u0: uv.u0, u1: uv.u1, v0: uv.v0, v1: midV };
  }
  const uvCorners = faceUVCorners(faceName, verts, worldBox, uv);
  const colors = verts.map(([vx, vy, vz]) => {
    const lc = sampleLight(vx, vy, vz, faceName);
    return [aoFactor * lc[0], aoFactor * lc[1], aoFactor * lc[2]];
  });
  pushQuad(buf, verts, uvCorners, colors, sunLit);
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
function emitFaceAO(pickBuffer, faceName, worldBox, texId, sampleLight, store, c, r, z, sunLit = 0) {
  const buf = pickBuffer(false, texId); // emitFaceAO is only ever called for opaque (non-translucent) faces
  const [x0, y0, z0] = worldBox.from;
  const [x1, y1, z1] = worldBox.to;
  const verts = FACE_VERTS[faceName](x0, y0, z0, x1, y1, z1);
  const uv = resolveUV(texId);
  const uvCorners = faceUVCorners(faceName, verts, worldBox, uv);
  const aoCounts = vertexAOCounts(store, c, r, z, faceName);
  const colors = verts.map(([vx, vy, vz], i) => {
    const ao = AO_CURVE[aoCounts[i]];
    const lc = sampleLight(vx, vy, vz, faceName);
    return [ao * lc[0], ao * lc[1], ao * lc[2]];
  });
  // Flip the triangulation diagonal toward the more-consistently-lit pair of corners, or a
  // lone dark/bright corner creates a visible diagonal seam under bilinear interpolation.
  const flip = aoCounts[0] + aoCounts[2] < aoCounts[1] + aoCounts[3];
  pushQuad(buf, verts, uvCorners, colors, sunLit, flip);
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
 * opts.lightProfile: optional resolveLighting() output (lighting.js) — ambient + shadow-tested
 * torch/spell points, genuinely colored. Omit for full white light (matches pre-lighting
 * behavior exactly). The sun itself is NOT baked here beyond each vertex's `sunLit` scalar
 * (see computeFaceSunTable) — shadow visibility and actual color/intensity are a GPU concern
 * now (renderer.js's shadow map + shader uniforms), not something buildMesh needs to know.
 */
export function buildMesh(store, opts = {}) {
  const lightProfile = opts.lightProfile || null;
  const sampleLight = makeLightSampler(store, lightProfile);
  const sunTable = computeFaceSunTable(lightProfile ? lightProfile.sunDir : null);
  const opaque = createMeshBuffer();
  const translucent = createMeshBuffer();
  // Custom (material-maker) materials each get their own texture, so their geometry can't
  // share the shared-atlas opaque/translucent buffers above (a different bound texture needs
  // its own draw call) — bucketed separately by materialId, populated lazily. Built-in
  // materials (plain numeric texIds) never touch this; `opaque`/`translucent` alone are the
  // complete mesh in that case, exactly as before this pivot.
  const byMaterial = {};
  function pickBuffer(translucentFlag, texId) {
    if (typeof texId === 'number') return translucentFlag ? translucent : opaque;
    const bucket = byMaterial[texId.materialId] || (byMaterial[texId.materialId] = { opaque: createMeshBuffer(), translucent: createMeshBuffer() });
    return translucentFlag ? bucket.translucent : bucket.opaque;
  }

  for (const { c, r, z, block } of store.entries()) {
    const parsed = parseBlock(block);
    const def = BLOCKS[parsed.type];
    if (!def) continue;
    const facing = parsed.facing ?? FACING.N;
    const translucentFlag = !!def.translucent;

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
          emitFace(pickBuffer, translucentFlag, faceName, worldBox, texId, sampleLight, false, ao, sunTable[faceName]);
        }
      }
      continue;
    }

    const depth = depthBelowStackTop(store, c, r, z, parsed.type);

    if (def.shape) {
      // Shape presets (see blocks.js SHAPES) are material-agnostic: each box face resolves
      // through resolveFace using this block's own material + facing, unlike MODELS boxes
      // which bake in one fixed texture id at authoring time.
      const shapeName = pickDepth(def.shape, depth);
      const boxes = SHAPES[shapeName];
      if (!boxes) throw new Error(`unknown shape: ${shapeName}`);
      for (const box of boxes) {
        const rotated = rotateModelBox(box, facing);
        const worldBox = {
          from: [rotated.from[0] + c, rotated.from[1] + r, rotated.from[2] + z],
          to: [rotated.to[0] + c, rotated.to[1] + r, rotated.to[2] + z],
        };
        // Shape boxes occlude nothing and are never occluded — always emit all 6 faces.
        for (const faceName of FACE_NAMES) {
          const texId = resolveFace(parsed.type, faceName, { facing, depth });
          const ao = cellFaceAO(store, c, r, z, faceName);
          emitFace(pickBuffer, translucentFlag, faceName, worldBox, texId, sampleLight, false, ao, sunTable[faceName]);
        }
      }
      continue;
    }

    const height = parsed.slab ? 0.5 : 1;
    const worldBox = { from: [c, r, z], to: [c + 1, r + 1, z + height] };

    if (parsed.slab) {
      // Slabs occlude nothing and are never occluded — always emit all 6 faces.
      for (const faceName of FACE_NAMES) {
        const texId = resolveFace(parsed.type, faceName, { facing, depth });
        const vHalf = faceName !== 'top' && faceName !== 'bottom';
        const ao = cellFaceAO(store, c, r, z, faceName);
        emitFace(pickBuffer, translucentFlag, faceName, worldBox, texId, sampleLight, vHalf, ao, sunTable[faceName]);
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
      // Autotile opt-in (material maker): the top face of a material with a 16-tile
      // topAutotile set picks its texture by same-material corner mask instead of the
      // usual single texture — purely cosmetic, every other face is unaffected.
      const texId =
        dir.name === 'top' && def.topAutotile
          ? def.topAutotile[autotileCornerMask(store, c, r, z, parsed.type)]
          : resolveFace(parsed.type, dir.name, { facing, depth });
      if (def.translucent) {
        emitFace(pickBuffer, translucentFlag, dir.name, worldBox, texId, sampleLight, false, 1.0, sunTable[dir.name]);
      } else {
        emitFaceAO(pickBuffer, dir.name, worldBox, texId, sampleLight, store, c, r, z, sunTable[dir.name]);
      }
    }
  }

  return { opaque, translucent, byMaterial };
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
  const pickBuffer = () => buf; // a single caller-owned buffer, never bucketed by material
  const sampleLight = () => lightColor;
  for (const faceName of FACE_NAMES) {
    emitFace(pickBuffer, false, faceName, box, texId, sampleLight);
  }
  return buf;
}
