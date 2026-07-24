/**
 * Billboards — a 5th content class (see CONTENT_TOOLS_PLAN.md), distinct from objects (fixed
 * 3D box-list geometry, baked into the static mesh on markDirty): a billboard is a flat
 * transparent-PNG quad that ALWAYS FACES THE CAMERA, standing upright on the voxel it's placed
 * in (trees, bushes, grass clumps, other "sprite" clutter). Because the camera orbits freely
 * (right-drag) rather than snapping between fixed angles, a billboard's own quad geometry has to
 * be rebuilt every render frame from the camera's current facing — unlike every other content
 * type here, which only rebuilds on markDirty. See mesher.js's buildBillboardMesh for the
 * per-frame geometry and voxel.html's tick() for the "rebuild every frame, not gated by
 * markDirty" wiring.
 *
 * Kept as its own store/registry, separate from BLOCKS/VoxelStore entirely — a billboard isn't
 * a placeable block type (no resolveFace/registerBlock involvement, no facing/rotation) and
 * doesn't need one; one billboard per cell, keyed by (c,r,z) like a block placement.
 */

import { slugify } from './customMaterials.js';
import { makeLibrary } from './contentLibrary.js';

const SAVE_VERSION = 1;

export function billboardKeyFor(c, r, z) {
  return `${c},${r},${z}`;
}

export function parseBillboardKey(key) {
  const parts = key.split(',');
  return { c: Number(parts[0]), r: Number(parts[1]), z: Number(parts[2]) };
}

export class BillboardStore {
  constructor() {
    this.billboards = new Map();
  }

  get(c, r, z) {
    return this.billboards.get(billboardKeyFor(c, r, z)) ?? null;
  }

  set(c, r, z, type) {
    this.billboards.set(billboardKeyFor(c, r, z), type);
  }

  remove(c, r, z) {
    this.billboards.delete(billboardKeyFor(c, r, z));
  }

  has(c, r, z) {
    return this.billboards.has(billboardKeyFor(c, r, z));
  }

  get size() {
    return this.billboards.size;
  }

  /** All placed billboards as {c, r, z, type}. */
  entries() {
    const out = [];
    for (const [key, type] of this.billboards) {
      out.push({ ...parseBillboardKey(key), type });
    }
    return out;
  }

  toJSON() {
    const billboards = {};
    for (const [k, v] of this.billboards) billboards[k] = v;
    return { v: SAVE_VERSION, billboards };
  }

  static fromJSON(data) {
    const parsed = typeof data === 'string' ? JSON.parse(data) : data;
    if (!parsed || parsed.v !== SAVE_VERSION) {
      throw new Error(`unsupported billboard store version: ${parsed && parsed.v}`);
    }
    const store = new BillboardStore();
    for (const [k, v] of Object.entries(parsed.billboards || {})) {
      store.billboards.set(k, v);
    }
    return store;
  }
}

/**
 * Billboard TYPE registry — an id+name+size+aspect (the actual texture/canvas/GPU-upload is the
 * caller's job, same boundary blocks.js/decals.js keep). `size` is the world-space HEIGHT in
 * blocks (width is derived from the uploaded image's own aspect ratio, so art doesn't get
 * stretched); `aspect` = image width/height, computed client-side at upload time. `bottomPad`
 * (0..1 fraction of image height) is transparent margin under the art — mesher crops it in UV
 * so solid pixels sit on the ground. `yOffset` is an extra world-space plant/sink after that crop
 * (negative = into the dirt). Together these replace the old "yOffset alone = pad*size" approach
 * that still left trees visibly floating.
 */
export const BILLBOARD_TYPES = {};

export function registerBillboardType(id, def) {
  BILLBOARD_TYPES[id] = def;
}

export function deleteBillboardType(id) {
  delete BILLBOARD_TYPES[id];
}

/** Register a new billboard type from a name + size + the uploaded image's aspect ratio (reuses
 * customMaterials.js's slugify, same id convention every content type in this engine uses) and
 * return the library entry to persist. The actual texture (a single transparent PNG, no top/
 * side/bottom courses — always seen from the front-facing quad only) is the caller's job — see
 * voxel.html's Billboard Maker panel — same boundary registerDecalType/createCustomMaterial keep. */
export function createBillboardType(name, { size = 1, aspect = 1, yOffset = 0, bottomPad = 0 } = {}) {
  const id = slugify(name);
  registerBillboardType(id, { name, size, aspect, yOffset, bottomPad });
  return { id, name, size, aspect, yOffset, bottomPad, createdAt: Date.now() };
}

// --- localStorage library (thin wrappers over the shared helper — see contentLibrary.js) ---

const library = makeLibrary('iso3d.billboardTypes');
export const loadBillboardTypeLibrary = library.load;
export const saveBillboardTypeLibrary = library.save;
export const addBillboardTypeToLibrary = library.add;
export const removeBillboardTypeFromLibrary = library.remove;
