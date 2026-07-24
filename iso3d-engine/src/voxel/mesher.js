/**
 * Pure geometry: voxel store -> { opaque, translucent } mesh buffers of textured quads.
 * No WebGL here — see voxel/renderer.js for the GL upload/draw side. Axis convention matches
 * blocks.js (c=+x east, r=+y south, z=+z up); one geometry path — everything is emitted as
 * textured boxes (a cube and a slab are just the trivial 1-box "models").
 */

import { parseBlock, resolveFace, atlasUV, MODELS, SHAPES, WEDGES, BLOCKS, FACING, pickDepth } from './blocks.js';
import { raycastVoxels } from './pick.js';
import { findSurface } from './surface.js';

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

/** Only a full, opaque, non-slab, non-model, non-shape, non-wedge cube occludes a neighbor's face. */
function isFullOpaqueCube(blockStr) {
  if (!blockStr) return false;
  const parsed = parseBlock(blockStr);
  const def = BLOCKS[parsed.type];
  // Wedges (ramps, round pillars) and shapes don't fill the cell — must not fake-occlude.
  if (!def || def.model || def.shape || def.wedge || parsed.slab) return false;
  return !!def.opaque;
}

/**
 * Soft AO occupancy from billboards / unit sprites (not full cubes, but they still cast
 * contact darkening on ground and walls). Keys are integer `"c,r,z"` cells the sprite
 * "fills" for corner-AO sampling — same grid the solid-cube AO predicate uses.
 *
 * `billboardStore` + `typeLookup(id)->{size,aspect}`: each placed billboard marks its column
 * for `ceil(size)` vertical cells starting at floor(z). Wide sprites (width > 1.25) also mark
 * the 4 orthogonal neighbors at the base so canopy-wide trees darken more than a thin post.
 *
 * `sprites`: optional list of `{c,r,z, height=1, width=1}` for units / other soft casters.
 */
export function buildSpriteAOOccupancy(billboardStore, typeLookup, sprites = []) {
  const set = new Set();
  const mark = (c, r, z) => set.add(`${c},${r},${z}`);
  const markColumn = (c, r, z0, height, width) => {
    const ic = Math.floor(c + 1e-6);
    const ir = Math.floor(r + 1e-6);
    const iz0 = Math.floor(z0 + 1e-6);
    const levels = Math.max(1, Math.ceil(height - 1e-6));
    for (let i = 0; i < levels; i++) mark(ic, ir, iz0 + i);
    // Wide canopy: also mark orthog neighbors at the base so rim corners of adjacent grass
    // darken. (Center-cell soft AO for the stand tile itself is handled in vertexAOCounts —
    // classic top-face AO never samples the cell directly above the face, only its rim.)
    if (width > 1.25) {
      for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        mark(ic + dc, ir + dr, iz0);
      }
    }
  };
  if (billboardStore) {
    const lookup = typeLookup || (() => null);
    for (const { c, r, z, type } of billboardStore.entries()) {
      const def = lookup(type);
      const height = (def && Number(def.size)) || 1;
      const width = height * ((def && Number(def.aspect)) || 1);
      markColumn(c, r, z, height, width);
    }
  }
  for (const s of sprites) {
    if (!s) continue;
    markColumn(s.c, s.r, s.z, s.height != null ? s.height : 1, s.width != null ? s.width : 1);
  }
  return set;
}

/** Solid cube OR soft sprite occupancy at (c,r,z) — the AO occluder used by vertexAOCounts. */
function makeAOOccludes(store, aoOccupancy) {
  return (cc, rr, zz) => {
    if (isFullOpaqueCube(store.get(cc, rr, zz))) return true;
    if (aoOccupancy && aoOccupancy.has(`${cc},${rr},${zz}`)) return true;
    return false;
  };
}

/**
 * lighting.js's sun/point-light math is ported from Grimoire's own Y-up (x=east, y=up,
 * z=south) 2D/pseudo-3D renderer — see lighting.js's file header, "do not fork". This
 * engine's own mesh-local space is Z-up (x=c/column, y=r/row, z=elevation — see blocks.js's
 * axis convention). Face normals below (FACE_AO) are authored in THAT space, so any
 * lighting.js direction vector needs the same y<->z swap voxel.html's screenToGridRay already
 * performs for camera rays before it can be dotted against a face normal here.
 */
export function sunDirToVoxelSpace(sunDir) {
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
/** Pure per-normal "how directly does THIS normal point at this direction" scalar (0..1) —
 * the primitive computeFaceSunTable's 6-entry table is built from, factored out so anything
 * with a genuinely non-axis-aligned normal (see WEDGES/blocks.js — a slanted ramp face isn't
 * one of FACE_AO's 6 canonical directions) can compute the same lighting math directly instead
 * of being forced through a table keyed by canonical face names. */
export function faceSunLit(dirVoxel, normal) {
  return Math.max(0, normal[0] * dirVoxel[0] + normal[1] * dirVoxel[1] + normal[2] * dirVoxel[2]);
}

export function computeFaceSunTable(sunDir) {
  const sunDirVoxel = sunDirToVoxelSpace(sunDir || DEFAULT_SUN_DIR);
  const table = {};
  for (const face of Object.keys(FACE_AO)) {
    table[face] = faceSunLit(sunDirVoxel, FACE_AO[face].normal);
  }
  return table;
}

/** Shared shape behind both computeFaceBounceTable and computeFaceAmbientTable (and available
 * directly for non-axis-aligned geometry — see faceSunLit): a pure per-normal directional dot
 * product blended with a flat floor. spill=0 is the pure directional dot product (a face facing
 * away gets exactly 0); spill=1 makes every face uniformly 1 regardless of orientation. */
export function directionalBlend(dirVoxel, normal, spill) {
  return (1 - spill) * faceSunLit(dirVoxel, normal) + spill;
}

function computeFaceDirectionalBlendTable(dir, spill) {
  const dirVoxel = sunDirToVoxelSpace(dir || DEFAULT_SUN_DIR);
  const table = {};
  for (const face of Object.keys(FACE_AO)) {
    table[face] = directionalBlend(dirVoxel, FACE_AO[face].normal, spill);
  }
  return table;
}

/**
 * Fake bounce/fill light — a second directional light shining from the exact OPPOSITE
 * direction of the sun (so it faces back toward it), with no shadow-map test at all: it's a
 * cheap "the sky/ground bounced some sunlight back" approximation, not real light transport,
 * so it never gets occluded by geometry the way the real sun does. Since bounceDir = -sunDir,
 * max(0,dot(normal,-sunDir)) is EXACTLY max(0,-dot(normal,sunDir)) — the mathematical
 * complement of computeFaceSunTable's own dot product, reusing that same function with the
 * negated direction rather than re-deriving the math.
 *
 * `spill` (default 0.3) blends that pure dot product with a flat floor — a face pointing
 * straight at the bounce direction still gets the full value (1), but a face NOT facing it
 * (including one already lit by the sun) gets `spill` instead of a hard zero. Without this, a
 * 100%-directional bounce reads as a second harsh key light rather than a soft fill — real
 * bounce light isn't purely absent on the sun-facing side either.
 */
export function computeFaceBounceTable(sunDir, spill = 0.3) {
  const s = sunDir || DEFAULT_SUN_DIR;
  return computeFaceDirectionalBlendTable([-s[0], -s[1], -s[2]], spill);
}

/**
 * Optional directional ambient — an independent light direction (NOT tied to the sun at all),
 * its OWN color, with no shadow-map test at all: structurally identical to bounce (a pure
 * per-face dot product, ADDED on top of the flat ambient in makeLightSampler, never
 * multiplying/replacing it), just with a direction the caller controls directly instead of
 * being derived from -sunDir. `softness` (0..1, default 0) is the same blend-with-a-flat-floor
 * shape bounce's own `spill` uses: softness=0 is a hard directional cutoff (a face facing
 * directly away gets exactly 0 contribution from this term — the flat ambient floor is what
 * keeps it from going pure black); softness=1 makes every face get the FULL contribution
 * regardless of orientation (uniform, no directionality at all).
 */
export function computeFaceAmbientTable(ambientDir, softness = 0) {
  return computeFaceDirectionalBlendTable(ambientDir || DEFAULT_SUN_DIR, softness);
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
  // profile.ambientDir/ambientDirColor/ambientDirStrength: same voxel.html-attached-directly
  // pattern as voxelAmbientColor above (not lighting.js fields) — an independent directional
  // light with its OWN color, ADDED on top of the flat ambient above (see
  // computeFaceAmbientTable's doc comment; structurally identical to bounce). Strength
  // defaults to 0 (off, a no-op) until the user actually dials one in. No shadow-map test at
  // all, same as bounce: a per-FACE-orientation table, not a per-position raycast, so it fits
  // directly into this already-faceName-aware sampler without its own vertex attribute.
  const ambientDirTable = computeFaceAmbientTable(profile.ambientDir, profile.ambientDirSoftness || 0);
  const [adr, adg, adb] = profile.ambientDirColor || [1, 1, 1];
  const ambientDirStrength = profile.ambientDirStrength || 0;
  const points = profile.points || [];
  return (wx, wy, wz, faceName) => {
    const ambientDirLit = ambientDirTable[faceName] * ambientDirStrength;
    let r = ambR + adr * ambientDirLit;
    let g = ambG + adg * ambientDirLit;
    let b = ambB + adb * ambientDirLit;
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
      const hit = raycastVoxels(store, [lx, ly, lz], [wx - lx, wy - ly, wz - lz], {
        maxDist: dist - 0.05,
        // Only full opaque cubes occlude — torches/doors/furniture must not fake-block light.
        opaqueOnly: true,
      });
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
  return { positions: [], uvs: [], colors: [], sunLit: [], bounceLit: [], normals: [], tangents: [], indices: [] };
}

/** A face's texId is either a plain number (built-in material, indexes the one shared atlas —
 * see atlasUV) or a `{ materialId, u0, v0, u1, v1 }` ref (custom material-maker material, its
 * own small texture — see customMaterials.js). This is the one place that tells the two apart. */
function resolveUV(texId) {
  return typeof texId === 'number' ? atlasUV(texId) : texId;
}

/** colors: a single [r,g,b] (flat) or an array of 4 [r,g,b]s (per-vertex, for AO). uvCorners:
 * an array of 4 [u,v] pairs, one per vertex (see faceUVCorners — never a generic rect+index
 * table, that's what caused the south/west axis-transposition bug). Everything else is an
 * options bag (this function outgrew positional params once the shader started needing more
 * per-face data than just color):
 *  - sunLit/bounceLit: single 0..1 scalars (see computeFaceSunTable/computeFaceBounceTable) —
 *    constant across a whole face, since a flat face has one normal, so both broadcast to all
 *    4 vertices; consumed in the shader to decide how much of the sun's (shadow-mapped) and
 *    bounce's (never shadowed) color/strength this fragment actually gets.
 *  - normal: this face's own outward normal (voxel c,r,z space — same axis-swap-at-upload
 *    convention as positions, see renderer.js), constant across the face — used by the
 *    shader's view-dependent rim/fresnel term, which genuinely needs a real vector (not just a
 *    precomputed scalar) since it depends on the CAMERA's direction, not a fixed light direction.
 *  - tangent: this face's own in-plane U-axis direction (same voxel-space/axis-swap convention
 *    as normal), constant across the face — unused by anything unless a custom material has a
 *    normal/bump map bound (see renderer.js FS_SRC's TBN construction), always emitted anyway
 *    (cheap, and keeps every call site simple — no material-aware branch needed here).
 *  - flip: which diagonal splits the quad into triangles — matters once corners can differ (AO).
 */
function pushQuad(buf, verts, uvCorners, colors, opts = {}) {
  const {
    sunLit = 0,
    bounceLit = 0,
    normal = [0, 0, 0],
    tangent = [1, 0, 0],
    flip = false,
  } = opts;
  const base = buf.positions.length / 3;
  const c = Array.isArray(colors[0]) ? colors : [colors, colors, colors, colors];
  for (let i = 0; i < 4; i++) {
    buf.positions.push(verts[i][0], verts[i][1], verts[i][2]);
    buf.uvs.push(uvCorners[i][0], uvCorners[i][1]);
    buf.normals.push(normal[0], normal[1], normal[2]);
    buf.tangents.push(tangent[0], tangent[1], tangent[2]);
    buf.colors.push(c[i][0], c[i][1], c[i][2]);
    buf.sunLit.push(sunLit);
    buf.bounceLit.push(bounceLit);
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
/** Each vertex's position as a continuous (hFrac, zFrac) 0..1 fraction across its own face's
 * in-plane axes — used by faceUVCorners, which snaps this to a texture cell's u0/u1 corner. */
function faceLocalFracs(faceName, verts, box) {
  const [x0, y0, z0] = box.from;
  const [x1, y1, z1] = box.to;
  const dx = x1 - x0 || 1;
  const dy = y1 - y0 || 1;
  const dz = z1 - z0 || 1;
  return verts.map(([vx, vy, vz]) => {
    if (faceName === 'top' || faceName === 'bottom') return [(vx - x0) / dx, (vy - y0) / dy];
    if (faceName === 'north' || faceName === 'south') return [(vx - x0) / dx, (vz - z0) / dz];
    return [(vy - y0) / dy, (vz - z0) / dz];
  });
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
  return faceLocalFracs(faceName, verts, box).map(([hFrac, zFrac]) => {
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
 * adjacent + 1 diagonal neighbor cell against `occludesCell(c,r,z)`, with the classic Wang/AO
 * rule that both adjacents matching forces the corner to count as fully matching too (avoids
 * an inverted-looking single-pixel notch). AO passes a solid-cube OR sprite-occupancy check;
 * autotile uses its own same-material sampler and does not go through this helper.
 */
export function faceCornerNeighborCounts(store, c, r, z, faceName, occludesCell) {
  const { normal, u, v, corners } = FACE_AO[faceName];
  const nc = c + normal[0];
  const nr = r + normal[1];
  const nz = z + normal[2];
  return corners.map(([su, sv]) => {
    const sideU = occludesCell(nc + su * u[0], nr + su * u[1], nz + su * u[2]);
    const sideV = occludesCell(nc + sv * v[0], nr + sv * v[1], nz + sv * v[2]);
    if (sideU && sideV) return 3;
    const cornerSolid = occludesCell(
      nc + su * u[0] + sv * v[0],
      nr + su * u[1] + sv * v[1],
      nz + su * u[2] + sv * v[2],
    );
    return (sideU ? 1 : 0) + (sideV ? 1 : 0) + (cornerSolid ? 1 : 0);
  });
}

function vertexAOCounts(store, c, r, z, faceName, occludesCell) {
  const occludes = occludesCell || makeAOOccludes(store, null);
  const counts = faceCornerNeighborCounts(store, c, r, z, faceName, occludes);
  // Soft sprite (billboard/unit) standing ON this top face: classic corner AO only looks at
  // the 3 rim neighbors of the cell above the face, never the center cell itself — so a tree
  // at (c,r,z+1) would cast zero AO onto the grass at (c,r,z) without this. A solid full cube
  // above would have CULLED the face entirely; soft sprites don't cull, so we bump every
  // corner +1 (cap 3) for contact darkening under the trunk.
  if (faceName === 'top' && occludes(c, r, z + 1)) {
    return counts.map((n) => Math.min(3, n + 1));
  }
  return counts;
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

/**
 * Minecraft-style smoothly-varying liquid surface: this corner's height is the AVERAGE of
 * every same-TYPE liquid column sharing it (this cell + the 2 adjacent + 1 diagonal — the same
 * 3-neighbor shape autotileCornerMask/faceCornerNeighborCounts already sample, just averaging
 * a continuous height instead of counting matches), ignoring solid/absent/different-type
 * neighbors entirely (a wall never drags a pool's edge down — they're excluded from the
 * average, not treated as height 0).
 * `getHeight(c,r,z)` looks up a column's own 0..1 height fraction (see voxel.html's
 * computeLiquidHeights — this module has no opinion on WHERE that data comes from), always in
 * 0..1, so this average is too — a genuinely smooth, monotonic gradient with no discontinuity
 * ever possible.
 *
 * An earlier version also force-set a corner to full height (1) whenever any contributing
 * column had the same liquid stacked one level higher, meant to read as "seamlessly connecting
 * into a deeper adjacent pool." Reverted — a real bug hit live: this could snap SOME of a
 * cell's 4 corners to 1 while its other corners stayed near their shallow average, producing a
 * visibly warped/twisted quad (a "floating broken diamond" disconnected from the surrounding
 * surface) instead of the intended smooth taper. The plain average alone already gives a
 * seamless-enough gradient without that failure mode.
 */
export function liquidCornerHeight(store, c, r, z, type, getHeight, su, sv) {
  const cells = [[c, r], [c + su, r], [c, r + sv], [c + su, r + sv]];
  let sum = 0;
  let count = 0;
  for (const [cc, cr] of cells) {
    const block = store.get(cc, cr, z);
    if (!block) continue;
    if (parseBlock(block).type !== type) continue;
    sum += getHeight(cc, cr, z);
    count++;
  }
  return count > 0 ? sum / count : getHeight(c, r, z);
}

/**
 * Build a full liquid cell's geometry as a tapered/sloped shape instead of a flat-topped cube:
 * a flat bottom, a TOP face whose 4 corners independently take `liquidCornerHeight`'s value
 * (a genuinely warped quad when corners differ — same cross-product normal computation WEDGES
 * uses, since this is the second shape in the engine whose faces aren't guaranteed axis-
 * aligned), and 4 side walls as planar trapezoids (each confined to one constant-x or
 * constant-y plane, so they stay flat even though their two top corners can differ in height —
 * spanning from the cell floor up to their own two corners' computed heights, skipped entirely
 * when both corners are ~0). Occludes nothing and is never occluded, same rule as slabs/shapes/
 * wedges. Any BLOCKS type flagged `liquid: true` gets this automatically — not specific to
 * `water`, so a future acid/lava material taper/slopes identically for free.
 */
function emitTaperedLiquid(pickBuffer, translucentFlag, store, c, r, z, type, facing, depth, sampleLight, sunDirVoxel, bounceDirVoxel, aoStrength, getHeight, occludesCell) {
  const corners = TOP_AUTOTILE_CORNERS.map(([su, sv]) => liquidCornerHeight(store, c, r, z, type, getHeight, su, sv));
  const [hNW, hNE, hSE, hSW] = corners;

  // Bottom — flat, standard full-footprint quad (a liquid's floor is always the cell's own
  // bottom, regardless of how thin the surface above it currently is).
  {
    const texId = resolveFace(type, 'bottom', { facing, depth });
    const worldBox = { from: [c, r, z], to: [c + 1, r + 1, z + 1] };
    const ao = cellFaceAO(store, c, r, z, 'bottom', aoStrength, occludesCell);
    emitFace(pickBuffer, translucentFlag, 'bottom', worldBox, texId, sampleLight, 1, ao, 0, 0);
  }

  // Top — a single quad, corners independently at z+hNW/hNE/hSE/hSW (matches FACE_VERTS.top's
  // own NW,NE,SE,SW vertex order) — genuinely non-planar when corners differ, so the normal is
  // computed via cross product from the actual geometry, exactly like WEDGES' ramp surface.
  {
    const texId = resolveFace(type, 'top', { facing, depth });
    const uv = resolveUV(texId);
    const verts = [
      [c, r, z + hNW], [c + 1, r, z + hNE], [c + 1, r + 1, z + hSE], [c, r + 1, z + hSW],
    ];
    const uvCorners = [[uv.u0, uv.v0], [uv.u1, uv.v0], [uv.u1, uv.v1], [uv.u0, uv.v1]];
    const normal = normalize3(cross3(sub3(verts[1], verts[0]), sub3(verts[2], verts[0])));
    const sunLit = faceSunLit(sunDirVoxel, normal);
    const bounceLit = directionalBlend(bounceDirVoxel, normal, 0.3);
    const ao = cellFaceAO(store, c, r, z, 'top', aoStrength, occludesCell);
    emitQuad(pickBuffer, translucentFlag, verts, uvCorners, texId, sampleLight, 'top', normal, FACE_AO.top.u, ao, sunLit, bounceLit);
  }

  // 4 side walls — planar trapezoids (each confined to one constant-x or constant-y plane, so
  // they stay flat regardless of their two top corners' heights), corner order/winding copied
  // directly from FACE_VERTS' own already-verified layout for each direction, just with the
  // "top" corners' z varying per-corner instead of a single shared z1.
  const sideSpecs = [
    { name: 'north', dc: 0, dr: -1, hA: hNW, hB: hNE, verts: (hA, hB) => [[c, r, z], [c + 1, r, z], [c + 1, r, z + hB], [c, r, z + hA]] },
    { name: 'south', dc: 0, dr: 1, hA: hSW, hB: hSE, verts: (hA, hB) => [[c, r + 1, z], [c, r + 1, z + hA], [c + 1, r + 1, z + hB], [c + 1, r + 1, z]] },
    { name: 'east', dc: 1, dr: 0, hA: hNE, hB: hSE, verts: (hA, hB) => [[c + 1, r, z], [c + 1, r + 1, z], [c + 1, r + 1, z + hB], [c + 1, r, z + hA]] },
    { name: 'west', dc: -1, dr: 0, hA: hNW, hB: hSW, verts: (hA, hB) => [[c, r, z], [c, r, z + hA], [c, r + 1, z + hB], [c, r + 1, z]] },
  ];
  for (const spec of sideSpecs) {
    if (spec.hA < 0.02 && spec.hB < 0.02) continue; // no visible wall here at all
    // Same-type neighbor = an internal seam between two connected liquid cells, not a real
    // boundary — skip it (matches the ordinary full-cube translucent path's own same-type
    // culling). Without this, a large connected flood renders EVERY cell's 4 walls
    // unconditionally, and — since they're translucent — you see straight through the near
    // cell's wall into the far cell's wall behind it: a real visual bug hit live ("you can see
    // the front faces of the water tile behind the next one").
    const neighborBlock = store.get(c + spec.dc, r + spec.dr, z);
    if (neighborBlock && parseBlock(neighborBlock).type === type) continue;
    const texId = resolveFace(type, spec.name, { facing, depth });
    const uv = resolveUV(texId);
    const verts = spec.verts(spec.hA, spec.hB);
    // Flat V mapping (not scaled per corner's own height) — an accepted simplification, same
    // reasoning emitTaperedLiquid's own doc comment gives: liquid textures are typically simple
    // color-ish tiles with little vertical detail worth preserving precisely here.
    const uvCorners = [[uv.u0, uv.v1], [uv.u1, uv.v1], [uv.u1, uv.v0], [uv.u0, uv.v0]];
    const normal = normalize3(cross3(sub3(verts[1], verts[0]), sub3(verts[2], verts[0])));
    const sunLit = faceSunLit(sunDirVoxel, normal);
    const bounceLit = directionalBlend(bounceDirVoxel, normal, 0.3);
    const ao = cellFaceAO(store, c, r, z, spec.name, aoStrength, occludesCell);
    emitQuad(pickBuffer, translucentFlag, verts, uvCorners, texId, sampleLight, spec.name, normal, FACE_AO[spec.name].u, ao, sunLit, bounceLit);
  }
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
/** Shared quad-emission core behind emitFace and the wedge geometry path (buildMesh's def.wedge
 * branch) — takes already-computed world-space verts/uvCorners/normal directly, rather than
 * deriving them from an axis-aligned faceName+box the way emitFace does, so genuinely
 * non-axis-aligned geometry (a slanted ramp face) can use the exact same coloring/push logic. */
function emitQuad(pickBuffer, translucentFlag, verts, uvCorners, texId, sampleLight, faceNameForSampling, normal, tangent, aoFactor, sunLit, bounceLit) {
  const buf = pickBuffer(translucentFlag, texId);
  const colors = verts.map(([vx, vy, vz]) => {
    const lc = sampleLight(vx, vy, vz, faceNameForSampling);
    return [aoFactor * lc[0], aoFactor * lc[1], aoFactor * lc[2]];
  });
  pushQuad(buf, verts, uvCorners, colors, { sunLit, bounceLit, normal, tangent });
}

function emitFace(pickBuffer, translucentFlag, faceName, worldBox, texId, sampleLight, vHalf = false, aoFactor = 1.0, sunLit = 0, bounceLit = 0) {
  const [x0, y0, z0] = worldBox.from;
  const [x1, y1, z1] = worldBox.to;
  const verts = FACE_VERTS[faceName](x0, y0, z0, x1, y1, z1);
  let uv = resolveUV(texId);
  if (vHalf) {
    const midV = uv.v0 + (uv.v1 - uv.v0) * 0.5;
    uv = { u0: uv.u0, u1: uv.u1, v0: uv.v0, v1: midV };
  }
  const uvCorners = faceUVCorners(faceName, verts, worldBox, uv);
  // tangent: this face's own in-plane U axis (FACE_AO already has one per canonical face,
  // reused here rather than re-derived) — only consulted by the shader when a custom material
  // has a normal/bump map bound (see renderer.js), harmless/unused otherwise.
  emitQuad(pickBuffer, translucentFlag, verts, uvCorners, texId, sampleLight, faceName, FACE_AO[faceName].normal, FACE_AO[faceName].u, aoFactor, sunLit, bounceLit);
}

/**
 * Map a continuous (uFrac, vFrac) 0..1 fraction into an atlas cell's UV rect.
 * MUST be linear (not corner-snapped): rounded prisms/pillars author many intermediate U
 * values around the ring and V values along the shaft. Snapping to u0/u1/v0/v1 (the old
 * behaviour) collapsed every octagon side onto a single texel column and remapped each
 * moulding ring to the FULL texture height → horizontal zebra banding on columns.
 *
 * vFrac convention matches side-face faceUVCorners: 0 = texture bottom (file-bottom / world
 * low), 1 = texture top (file-top / world high). Hand-authored ramp quads use the same 0/1.
 */
function uvCornerFromFrac(uv, uFrac, vFrac) {
  const uf = Math.max(0, Math.min(1, uFrac));
  const vf = Math.max(0, Math.min(1, vFrac));
  const u = uv.u0 + (uv.u1 - uv.u0) * uf;
  // vf=0 → v1 (bottom of cell), vf=1 → v0 (top of cell)
  const v = uv.v1 + (uv.v0 - uv.v1) * vf;
  return [u, v];
}

function sub3(a, b) {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}
function cross3(a, b) {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
function normalize3(v) {
  const len = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / len, v[1] / len, v[2] / len];
}
function negate3(v) {
  return [-v[0], -v[1], -v[2]];
}

/** Scales how strongly the AO_CURVE actually darkens a corner: strength=1 (default) is the
 * curve's own unmodified value (today's original look); strength=0 flattens AO out entirely
 * (every corner reads as fully lit, 1.0); strength>1 exaggerates it darker than the curve's
 * own value (clamped at 0, never negative). A pure intensity dial on the SAME occlusion
 * counts/curve shape — not a different AO algorithm. */
function applyAOStrength(curveValue, strength) {
  return Math.max(0, 1 - strength * (1 - curveValue));
}

/** Cheap flat AO for a whole face of a non-cube shape (slab/model): average the same 4
 * corner occlusion counts full cubes use for this cell, mapped through AO_CURVE. Not a
 * per-vertex gradient — just enough to make furniture/doors read as darker against a wall
 * or tucked into a corner, without needing true per-vertex AO on an irregular box shape.
 * `occludesCell` optional — when set, billboards/sprites count as soft AO casters too. */
function cellFaceAO(store, c, r, z, faceName, aoStrength = 1, occludesCell) {
  const counts = vertexAOCounts(store, c, r, z, faceName, occludesCell);
  const avg = counts.reduce((a, b) => a + b, 0) / counts.length;
  const lo = Math.floor(avg);
  const hi = Math.min(3, Math.ceil(avg));
  const t = avg - lo;
  const curveValue = AO_CURVE[lo] * (1 - t) + AO_CURVE[hi] * t;
  return applyAOStrength(curveValue, aoStrength);
}

/** Like emitFace, but with per-vertex Minecraft-style corner AO — used only for grid-aligned
 * full cubes, where "neighbor cell" is unambiguous (slabs/models keep the flat emitFace). */
function emitFaceAO(pickBuffer, faceName, worldBox, texId, sampleLight, store, c, r, z, sunLit = 0, bounceLit = 0, aoStrength = 1, occludesCell) {
  const buf = pickBuffer(false, texId); // emitFaceAO is only ever called for opaque (non-translucent) faces
  const [x0, y0, z0] = worldBox.from;
  const [x1, y1, z1] = worldBox.to;
  const verts = FACE_VERTS[faceName](x0, y0, z0, x1, y1, z1);
  const uv = resolveUV(texId);
  const uvCorners = faceUVCorners(faceName, verts, worldBox, uv);
  const aoCounts = vertexAOCounts(store, c, r, z, faceName, occludesCell);
  const colors = verts.map(([vx, vy, vz], i) => {
    const ao = applyAOStrength(AO_CURVE[aoCounts[i]], aoStrength);
    const lc = sampleLight(vx, vy, vz, faceName);
    return [ao * lc[0], ao * lc[1], ao * lc[2]];
  });
  // Flip the triangulation diagonal toward the more-consistently-lit pair of corners, or a
  // lone dark/bright corner creates a visible diagonal seam under bilinear interpolation.
  const flip = aoCounts[0] + aoCounts[2] < aoCounts[1] + aoCounts[3];
  pushQuad(buf, verts, uvCorners, colors, { sunLit, bounceLit, normal: FACE_AO[faceName].normal, tangent: FACE_AO[faceName].u, flip });
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
 *
 * opts.billboardStore + opts.billboardTypeLookup / opts.aoOccupancy / opts.aoSprites: soft AO
 * casters (trees, units). Billboards darken grass tops and walls the same way solid cubes do
 * for corner AO — without this, trees cast sun shadows but left a bright AO-less halo under
 * the trunk (user request: "billboards and sprites should affect AO too").
 */
export function buildMesh(store, opts = {}) {
  const lightProfile = opts.lightProfile || null;
  const sampleLight = makeLightSampler(store, lightProfile);
  const sunTable = computeFaceSunTable(lightProfile ? lightProfile.sunDir : null);
  const bounceTable = computeFaceBounceTable(lightProfile ? lightProfile.sunDir : null);
  // Raw per-normal directions (voxel space) for WEDGES' genuinely non-axis-aligned faces (see
  // the def.wedge branch below) — sunTable/bounceTable above only cover FACE_AO's 6 canonical
  // directions, so a slanted ramp face computes its own sunLit/bounceLit directly instead of a
  // table lookup. Negating post-conversion (rather than converting -sunDir separately) is valid
  // since sunDirToVoxelSpace is just a normalize+axis-swap, which commutes with negation.
  const sunDirVoxel = sunDirToVoxelSpace((lightProfile && lightProfile.sunDir) || DEFAULT_SUN_DIR);
  const bounceDirVoxel = negate3(sunDirVoxel);
  const aoStrength = opts.aoStrength != null ? opts.aoStrength : 1;
  const aoOccupancy = opts.aoOccupancy || (
    (opts.billboardStore || (opts.aoSprites && opts.aoSprites.length))
      ? buildSpriteAOOccupancy(opts.billboardStore, opts.billboardTypeLookup, opts.aoSprites || [])
      : null
  );
  const occludes = makeAOOccludes(store, aoOccupancy);
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
    // Gas/fog cells emit NO geometry at all — rendered purely as a per-fragment volumetric
    // blend over whatever's actually behind/around them (see renderer.js's setGasVolumes/
    // FS_SRC), not a textured or even flat-tinted cube. `resolveFace` is never called for
    // these types (there's no `all`/`top`/etc on their BLOCKS def at all — see blocks.js's own
    // doc comment on `fog`/`gas`), so this MUST come before any face-resolution below.
    if (def.gas) continue;
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
          const ao = cellFaceAO(store, c, r, z, faceName, aoStrength, occludes);
          emitFace(pickBuffer, translucentFlag, faceName, worldBox, texId, sampleLight, false, ao, sunTable[faceName], bounceTable[faceName]);
        }
      }
      continue;
    }

    const depth = depthBelowStackTop(store, c, r, z, parsed.type);

    if (def.wedge) {
      // Wedges (see blocks.js WEDGES — ramps, round pillars) occlude nothing and are never
      // occluded, same rule as SHAPES/MODELS. Depth-indexed arrays work like shape courses
      // (e.g. pillar capital / shaft / base moulding on a 3-high stack).
      const wedgeName = pickDepth(def.wedge, depth);
      if (!wedgeName) continue;
      const faces = WEDGES[wedgeName];
      if (!faces) throw new Error(`unknown wedge: ${wedgeName}`);
      for (const faceDef of faces) {
        const worldFace = rotateFaceName(faceDef.face, facing);
        const texId = resolveFace(parsed.type, worldFace, { facing, depth });
        const uv = resolveUV(texId);
        const verts = faceDef.quad.map(({ pos: [x, y, z2] }) => {
          const [rx, ry] = rotateXY(x, y, facing);
          return [rx + c, ry + r, z2 + z];
        });
        const uvCorners = faceDef.quad.map(({ u, v }) => uvCornerFromFrac(uv, u, v));
        // True outward normal from (already-rotated) geometry via cross product.
        const edge1 = sub3(verts[1], verts[0]);
        const normal = normalize3(cross3(edge1, sub3(verts[2], verts[0])));
        const tangent = normalize3(edge1);
        const sunLit = faceSunLit(sunDirVoxel, normal);
        const bounceLit = directionalBlend(bounceDirVoxel, normal, 0.3);
        const ao = cellFaceAO(store, c, r, z, worldFace, aoStrength, occludes);
        emitQuad(pickBuffer, translucentFlag, verts, uvCorners, texId, sampleLight, worldFace, normal, tangent, ao, sunLit, bounceLit);
      }
      continue;
    }

    // Per-course shape arrays (Material Maker) can hold `null` holes for courses left at
    // "Full block (default)" — pickDepth resolving to null means "no shape override for THIS
    // course", not "unknown shape"; falls through to the ordinary full-cube path below,
    // same as `def.shape` being null/absent for the whole material.
    const shapeName = def.shape ? pickDepth(def.shape, depth) : null;
    if (shapeName) {
      // Shape presets (see blocks.js SHAPES) are material-agnostic: each box face resolves
      // through resolveFace using this block's own material + facing, unlike MODELS boxes
      // which bake in one fixed texture id at authoring time.
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
          const texId = resolveFace(parsed.type, faceName, { facing, depth, store, c, r, z });
          const ao = cellFaceAO(store, c, r, z, faceName, aoStrength, occludes);
          emitFace(pickBuffer, translucentFlag, faceName, worldBox, texId, sampleLight, false, ao, sunTable[faceName], bounceTable[faceName]);
        }
      }
      continue;
    }

    // Tapered/sloped liquid (see emitTaperedLiquid) — opt-in per BLOCKS type (def.liquid) AND
    // only when the caller actually supplies simulation-derived heights (opts.liquidHeights —
    // see voxel.html's computeLiquidHeights); a plain static water pool with no liquid
    // simulation running at all (opts.liquidHeights absent) falls straight through to the
    // ordinary full-cube path below, byte-identical to this feature not existing.
    if (def.liquid && opts.liquidHeights) {
      const key = `${c},${r},${z}`;
      const selfHeight = opts.liquidHeights.has(key) ? opts.liquidHeights.get(key) : 1;
      if (selfHeight < 0.999) {
        const getHeight = (cc, cr, cz) => {
          const k = `${cc},${cr},${cz}`;
          return opts.liquidHeights.has(k) ? opts.liquidHeights.get(k) : 1;
        };
        emitTaperedLiquid(pickBuffer, translucentFlag, store, c, r, z, parsed.type, facing, depth, sampleLight, sunDirVoxel, bounceDirVoxel, aoStrength, getHeight, occludes);
        continue;
      }
    }

    const height = parsed.slab ? 0.5 : 1;
    const worldBox = { from: [c, r, z], to: [c + 1, r + 1, z + height] };

    if (parsed.slab) {
      // Slabs occlude nothing and are never occluded — always emit all 6 faces.
      for (const faceName of FACE_NAMES) {
        const texId = resolveFace(parsed.type, faceName, { facing, depth, store, c, r, z });
        const vHalf = faceName !== 'top' && faceName !== 'bottom';
        const ao = cellFaceAO(store, c, r, z, faceName, aoStrength, occludes);
        emitFace(pickBuffer, translucentFlag, faceName, worldBox, texId, sampleLight, vHalf, ao, sunTable[faceName], bounceTable[faceName]);
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
      // Side faces pass store+coords so footByNeighbor can pick stone/sand/mud foot trims.
      const texId =
        dir.name === 'top' && def.topAutotile
          ? def.topAutotile[autotileCornerMask(store, c, r, z, parsed.type)]
          : resolveFace(parsed.type, dir.name, { facing, depth, store, c, r, z });
      if (def.translucent) {
        emitFace(pickBuffer, translucentFlag, dir.name, worldBox, texId, sampleLight, false, 1.0, sunTable[dir.name], bounceTable[dir.name]);
      } else {
        emitFaceAO(pickBuffer, dir.name, worldBox, texId, sampleLight, store, c, r, z, sunTable[dir.name], bounceTable[dir.name], aoStrength, occludes);
      }
    }
  }

  return { opaque, translucent, byMaterial };
}

export function quadCount(buf) {
  return buf.indices.length / 6;
}

/** Small inset off the host face's plane — same z-fighting-avoidance convention MODELS' door/
 * window boxes already use (VOXEL_PLAN.md pitfall #3), applied along the face's own normal so a
 * decal never sits exactly coplanar with the block face it's stuck to. */
const DECAL_INSET = 0.015;

/** Like faceUVCorners, but for a decal's own single, full (0..1) image — no atlas cell to snap
 * to, just the vertex's continuous position-derived fraction directly. Reuses faceLocalFracs
 * (same per-face axis selection as every other quad in this file) so a decal's texture
 * orientation stays consistent with how every other face already maps u/v to world position;
 * v is inverted (1-vFrac) to match the established "high world z -> the image's own top row"
 * convention (see faceUVCorners' own doc comment). */
function decalUVCorners(faceName, verts, box) {
  return faceLocalFracs(faceName, verts, box).map(([hFrac, vFrac]) => [hFrac, 1 - vFrac]);
}

/**
 * Build one mesh buffer PER DECAL TYPE from a DecalStore (see voxel/decals.js) — a decal is a
 * thin, alpha-tested overlay quad snapped to a specific already-placed block's face, entirely
 * separate from `buildMesh`'s block geometry (no volume/collision, doesn't replace what's in
 * `store` at that cell). Each decal type gets its OWN small texture (same "one item, one
 * texture, one extra draw call" pattern customMaterials.js already established for materials —
 * see renderer.js's DecalBucketSet), so there's no shared-atlas cell math here at all: a decal
 * only ever has one full-image face, UV is just that image's own 0..1 fraction (decalUVCorners).
 * `store` (the VoxelStore the decals are attached to) supplies AO/ambient/sun/bounce lighting
 * context for the HOST cell — a decal reads as part of the surface it's stuck to, not a
 * separately-lit floating sprite.
 */
export function buildDecalMesh(store, decalStore, opts = {}) {
  const lightProfile = opts.lightProfile || null;
  const sampleLight = makeLightSampler(store, lightProfile);
  const sunTable = computeFaceSunTable(lightProfile ? lightProfile.sunDir : null);
  const bounceTable = computeFaceBounceTable(lightProfile ? lightProfile.sunDir : null);
  const aoStrength = opts.aoStrength != null ? opts.aoStrength : 1;
  const aoOccupancy = opts.aoOccupancy || (
    (opts.billboardStore || (opts.aoSprites && opts.aoSprites.length))
      ? buildSpriteAOOccupancy(opts.billboardStore, opts.billboardTypeLookup, opts.aoSprites || [])
      : null
  );
  const occludes = makeAOOccludes(store, aoOccupancy);
  const byType = {};
  function pickBuffer(_translucentFlag, typeId) {
    return byType[typeId] || (byType[typeId] = createMeshBuffer());
  }

  for (const { c, r, z, face, type } of decalStore.entries()) {
    const worldBox = { from: [c, r, z], to: [c + 1, r + 1, z + 1] };
    const normal = FACE_AO[face].normal;
    const baseVerts = FACE_VERTS[face](c, r, z, c + 1, r + 1, z + 1);
    const verts = baseVerts.map(([vx, vy, vz]) => [
      vx + normal[0] * DECAL_INSET,
      vy + normal[1] * DECAL_INSET,
      vz + normal[2] * DECAL_INSET,
    ]);
    const uvCorners = decalUVCorners(face, baseVerts, worldBox);
    const ao = cellFaceAO(store, c, r, z, face, aoStrength, occludes);
    emitQuad(pickBuffer, false, verts, uvCorners, type, sampleLight, face, normal, FACE_AO[face].u, ao, sunTable[face], bounceTable[face]);
  }

  return { byType };
}

/**
 * Billboards (see voxel/billboards.js) — always-camera-facing transparent-PNG quads, standing
 * upright on the cell they're placed in. Rebuilt every frame (see voxel.html's tick()), not
 * gated by markDirty like every other content type here, since orbiting the camera changes
 * which way "facing the camera" points.
 *
 * `camRightGrid` is the camera's current right vector, already in GRID-space (c,r,elevation)
 * convention — same axis order as everything else this module builds — so the normal
 * gridPositionsToWorld swap-at-upload (renderer.js) handles it like any other vertex data; see
 * voxel.html's caller for the world->grid conversion (a self-inverse y<->z swap, same op as
 * gridPositionsToWorld itself).
 *
 * Locked to "upright" (axis-aligned Y-billboarding): only the camera's HORIZONTAL facing
 * chooses the quad's left-right axis, so a standing sprite never leans over as the camera
 * pitches — it only spins around its own vertical axis to face the camera, matching how
 * Minecraft/most engines billboard trees and similar "stand up" sprite decor.
 */
/**
 * Shared ground contact for display + shadow billboard quads.
 * - Pin base to findSurface standZ when a column has a standable top (fixes stale / side-click
 *   placements that leave trees mid-air).
 * - bottomPad crops transparent PNG rows under the art in UV space so solid pixels sit on baseZ.
 * - yOffset is a tiny world-space plant after crop (negative = into dirt). Keep it small —
 *   large sinks bury roots under the grass depth plane (reads as "bottom of tree cropped").
 */
export function billboardGroundPlacement(def, c, r, z, store) {
  let groundZ = Number(z) || 0;
  if (store) {
    const surf = findSurface(store, Math.floor(c + 1e-6), Math.floor(r + 1e-6));
    // Always pin when a surface exists under this column. Trees/bushes are ground clutter;
    // intentional mid-air billboards are not a supported case yet.
    if (surf) groundZ = surf.standZ;
  }
  const height = Number(def.size) || 1;
  const pad = Number(def.bottomPad);
  const bottomPad = Number.isFinite(pad) ? Math.max(0, Math.min(0.45, pad)) : 0;
  const yOff = Number(def.yOffset);
  // Honor author yOffset (Billboard Maker slider is -2..2). No tight clamp — that made the
  // slider feel broken and left trees stuck mid-air or buried.
  const plant = Number.isFinite(yOff) ? Math.max(-2, Math.min(2, yOff)) : 0;
  const baseZ = groundZ + plant;
  // Crop transparent bottom in UV: solid art fills the full world height `size`.
  const uvBottom = 1 - bottomPad;
  return { groundZ, baseZ, height, width: height * (def.aspect || 1), uvBottom, bottomPad };
}

export function buildBillboardMesh(billboardStore, typeLookup, camRightGrid, store, lightProfile, opts = {}) {
  const sampleLight = makeLightSampler(store, lightProfile);
  const sunDirVoxel = sunDirToVoxelSpace((lightProfile && lightProfile.sunDir) || DEFAULT_SUN_DIR);
  const aoStrength = opts.aoStrength != null ? opts.aoStrength : 1;
  // Billboards both CAST soft AO (via buildMesh's occupancy) and RECEIVE it: tucked against
  // walls / other trees they darken like any other clutter, not full-bright cutouts.
  const aoOccupancy = opts.aoOccupancy || buildSpriteAOOccupancy(billboardStore, typeLookup, opts.aoSprites || []);
  const occludes = makeAOOccludes(store, aoOccupancy);
  const byType = {};
  function pickBuffer(_translucentFlag, typeId) {
    return byType[typeId] || (byType[typeId] = createMeshBuffer());
  }

  let rx = camRightGrid[0];
  let ry = camRightGrid[1];
  const len = Math.hypot(rx, ry);
  if (len < 1e-6) { rx = 1; ry = 0; } else { rx /= len; ry /= len; }
  // Pseudo-normal for the sun/bounce dot product below: fixed straight up ([0,0,1], same as
  // FACE_AO.top), not the quad's own horizontal-plane outward normal (perpendicular to its
  // left-right axis) tried previously. A billboard's "true" normal constantly changes to face
  // the camera, so this was always an approximation either way (same accepted pattern non-
  // axis-aligned SHAPES/WEDGES geometry already uses — see cellFaceAO's doc comment) — but a
  // HORIZONTAL normal is nearly perpendicular to a typical overhead sun direction, so its dot
  // product (faceSunLit) came out near zero most of the time: billboards read as barely lit by
  // the sun regardless of time of day (a real bug hit live: "billboards don't seem to get hit
  // by light"). Treating them like a top-facing surface instead — already what
  // `sampleLight`'s own faceNameForSampling='top' below assumes for the ambient term — gives
  // believable sun exposure (bright under a high sun, dim near the horizon, like real foliage
  // canopy) and keeps the ambient/sun/bounce terms internally consistent with each other.
  const normal = [0, 0, 1];
  const sunLit = faceSunLit(sunDirVoxel, normal);
  const bounceLit = directionalBlend([-sunDirVoxel[0], -sunDirVoxel[1], -sunDirVoxel[2]], normal, 0.3);

  for (const { c, r, z, type } of billboardStore.entries()) {
    const def = typeLookup(type);
    if (!def) continue;
    const place = billboardGroundPlacement(def, c, r, z, store);
    // Never push the DISPLAY quad more than a hairline under the stand surface — grass depth
    // clips buried texels ("texture cropped when I sink for shadow"). Shadow contact is handled
    // separately on the ground plane (see buildBillboardShadowMesh stump). yOffset still raises
    // the art; large negative values no longer bury it.
    const displayBase = Math.max(place.baseZ, place.groundZ - 0.02);
    const { height, width, uvBottom } = place;
    const cx = c + 0.5;
    const cy = r + 0.5;
    const halfW = width / 2;
    const verts = [
      [cx - rx * halfW, cy - ry * halfW, displayBase],
      [cx + rx * halfW, cy + ry * halfW, displayBase],
      [cx + rx * halfW, cy + ry * halfW, displayBase + height],
      [cx - rx * halfW, cy - ry * halfW, displayBase + height],
    ];
    // v=0 image top, v=1 image bottom. uvBottom < 1 crops transparent padding under roots so
    // the first solid texel sits on baseZ (not a pad*size sink that still left a visible gap).
    const uv = [[0, uvBottom], [1, uvBottom], [1, 0], [0, 0]];
    const texId = type;
    // Receive AO from surrounding solids + other sprites at the cell the billboard stands in.
    const ic = Math.floor(c + 1e-6);
    const ir = Math.floor(r + 1e-6);
    const iz = Math.floor(displayBase + 1e-6);
    let ao = 0;
    for (const face of ['north', 'south', 'east', 'west']) {
      ao += cellFaceAO(store, ic, ir, iz, face, aoStrength, occludes);
    }
    ao /= 4;
    emitQuad(pickBuffer, false, verts, uv, texId, sampleLight, 'top', normal, [1, 0, 0], ao, sunLit, bounceLit);
  }

  return { byType };
}

/**
 * Shadow-casting geometry for billboards — deliberately SEPARATE from buildBillboardMesh's
 * display quads. Those reorient every frame to face whichever way the PLAYER's camera is
 * looking, which makes them a moving target for the sun's own "camera" (the shadow depth pass):
 * the apparent width of a camera-facing quad, as seen from the sun, changes with the player's
 * viewing angle (a real bug hit live — "shadow is thin from one side, thick from another
 * relative to the sun"). This instead orients the quad to face the SUN's own horizontal
 * direction, so it presents the same full rectangular footprint to the shadow map no matter
 * where the player is standing or looking — a stable, viewpoint-independent shadow shape.
 * Per-vertex UV is still included (unlike buildBoxMesh's bare geometry) so the shadow shader can
 * alpha-test against the billboard's own transparent-PNG cutout instead of casting a solid box.
 *
 * X-CROSS, not a single card (real bug hit live: a hard, straight-edged cutoff on one side of
 * the cast shadow, present at every sun angle tried — "the left side still has no shadow"). A
 * single flat card, however perfectly it's kept facing the sun, is still a flat 2D cross-section
 * of an object whose real canopy silhouette is round/organic — it can only ever donate ONE
 * cross-section's worth of coverage to the depth map, so any sun elevation steep enough to
 * matter still only casts a thin sliver's shadow, not the full canopy footprint. Minecraft's own
 * grass/flower sprites solve exactly this with two crossed quads instead of one; the same fix
 * applies here — a second card, rotated 90 degrees from the first (SAME center/height/UV/image,
 * just rotated), so the shadow map always has coverage from a second direction regardless of
 * where the sun sits. This does not touch buildBillboardMesh's own DISPLAY geometry at all
 * (still a single camera-facing card, unrelated concern) — only what gets rasterized into the
 * shadow map changes.
 */
/**
 * Sun-oriented alpha-tested X-cross only. No solid stakes/boxes/contact strips — those added
 * lines, squares, and radiating bars (user 2026-07-14). Keep this simple: two cards, PNG cutout.
 * Returns `{ byType, contactByType }` (contact empty; API kept for the caller).
 */
export function buildBillboardShadowMesh(billboardStore, typeLookup, sunDirVoxel, store) {
  const byType = {};
  function pickBuffer(_translucentFlag, typeId) {
    return byType[typeId] || (byType[typeId] = createMeshBuffer());
  }

  // Horizontal sun direction in grid (c,r) for orienting the primary card.
  let sx = sunDirVoxel[0];
  let sy = sunDirVoxel[1];
  const sLen = Math.hypot(sx, sy);
  if (sLen < 1e-6) { sx = 1; sy = 0; } else { sx /= sLen; sy /= sLen; }
  // Perpendicular = card "right" axis (face the sun)
  let rx = -sy;
  let ry = sx;
  const rLen = Math.hypot(rx, ry);
  if (rLen < 1e-6) { rx = 1; ry = 0; } else { rx /= rLen; ry /= rLen; }

  const emitCard = (cx, cy, baseZ, halfW, height, qx, qy, type, uvBottom) => {
    const verts = [
      [cx - qx * halfW, cy - qy * halfW, baseZ],
      [cx + qx * halfW, cy + qy * halfW, baseZ],
      [cx + qx * halfW, cy + qy * halfW, baseZ + height],
      [cx - qx * halfW, cy - qy * halfW, baseZ + height],
    ];
    const uv = [[0, uvBottom], [1, uvBottom], [1, 0], [0, 0]];
    emitQuad(pickBuffer, false, verts, uv, type, () => WHITE, 'top', [0, 0, 1], [1, 0, 0], 1, 0, 0);
  };

  for (const { c, r, z, type } of billboardStore.entries()) {
    const def = typeLookup(type);
    if (!def) continue;
    const { groundZ, baseZ, height, width, uvBottom } = billboardGroundPlacement(def, c, r, z, store);
    const cx = c + 0.5;
    const cy = r + 0.5;
    // Slightly wider than display so canopy edges don't get alpha-cropped in the shadow map
    const halfW = (width / 2) * 1.06;
    // Bottom of caster at ground (tiny sink) so roots meet the dirt; height matches display.
    const castBase = Math.min(baseZ, groundZ) - 0.06;
    const castH = height + 0.06;
    // 3 cards at 60° — fuller round canopy than a pure X, without the 4×45° "star" strips
    // (those only looked bad when combined with a solid contact UV band).
    for (let i = 0; i < 3; i++) {
      const ang = (i * Math.PI) / 3;
      const cos = Math.cos(ang);
      const sin = Math.sin(ang);
      const qx = rx * cos - ry * sin;
      const qy = rx * sin + ry * cos;
      emitCard(cx, cy, castBase, halfW, castH, qx, qy, type, uvBottom);
    }
  }

  return { byType, contactByType: {} };
}

/**
 * A single textured box mesh at an arbitrary grid-space position — NOT tied to the store's
 * integer cell keys, so it works for units mid-movement (fractional c,r,z). Reuses the exact
 * same face-winding/UV/shading primitives as buildMesh, so a unit box has the same rendering
 * correctness guarantees as any other voxel geometry.
 *
 * opts.store + opts.aoOccupancy/aoStrength: unit/sprite receives the same corner AO as terrain
 * (darker next to walls / under trees). Flat lightColor still tints; AO multiplies it.
 */
export function buildBoxMesh(box, texId, lightColor = WHITE, opts = {}) {
  const buf = createMeshBuffer();
  const pickBuffer = () => buf; // a single caller-owned buffer, never bucketed by material
  const sampleLight = () => lightColor;
  const store = opts.store || null;
  const aoStrength = opts.aoStrength != null ? opts.aoStrength : 1;
  const occludes = store ? makeAOOccludes(store, opts.aoOccupancy || null) : null;
  // Sample AO at the box's integer cell (floor of center).
  const cc = Math.floor((box.from[0] + box.to[0]) * 0.5 + 1e-6);
  const cr = Math.floor((box.from[1] + box.to[1]) * 0.5 + 1e-6);
  const cz = Math.floor(box.from[2] + 1e-6);
  for (const faceName of FACE_NAMES) {
    const ao = store
      ? cellFaceAO(store, cc, cr, cz, faceName, aoStrength, occludes)
      : 1;
    emitFace(pickBuffer, false, faceName, box, texId, sampleLight, false, ao, 0, 0);
  }
  return buf;
}

/**
 * Multiple MODELS-shaped boxes (`{from, to, faces}`, faces already resolved to real texIds —
 * see customObjects.js's resolveObjectBoxes) merged into ONE mesh buffer, at whatever world/
 * grid position the caller's own from/to coordinates already encode (no cell offset applied
 * here, unlike buildMesh's def.model branch which adds a store cell's c/r/z — this is for a
 * standalone, not-yet-placed preview, e.g. the Object Maker's live 3D box-editor preview in
 * voxel.html). Flat lighting only (a single lightColor, same as buildBoxMesh) — a preview
 * doesn't need real shadow/AO fidelity, just to look roughly right while editing.
 */
export function buildMultiBoxMesh(boxes, lightColor = WHITE) {
  const buf = createMeshBuffer();
  const pickBuffer = () => buf;
  const sampleLight = () => lightColor;
  for (const box of boxes) {
    for (const faceName of FACE_NAMES) {
      const texId = resolveBoxFaceTex(box, faceName);
      if (texId === undefined) continue; // this box has no material for this face (no explicit entry, no "all" fallback) — skip rather than crash
      emitFace(pickBuffer, false, faceName, box, texId, sampleLight);
    }
  }
  return buf;
}
