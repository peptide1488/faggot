/**
 * Decals — a 4th content class (see CONTENT_TOOLS_PLAN.md), distinct from blocks (one per
 * voxel cell) and objects (model-shaped, still occupy a cell): a thin textured overlay SNAPPED
 * TO A SPECIFIC FACE of an already-placed block — bloodstains, scorch marks, moss, a poster on
 * a wall. No volume/collision, doesn't replace whatever block is at that cell (VoxelStore still
 * keys one block per cell, untouched by this module), keyed instead by (c,r,z,faceName).
 *
 * Kept as its own store/registry, separate from BLOCKS/VoxelStore entirely — a decal isn't a
 * placeable block type (no resolveFace/registerBlock involvement) and doesn't need one; see
 * mesher.js's buildDecalMesh for the (also separate) rendering path.
 */

import { slugify } from './customMaterials.js';
import { makeLibrary } from './contentLibrary.js';

const SAVE_VERSION = 1;

export function decalKeyFor(c, r, z, face) {
  return `${c},${r},${z},${face}`;
}

export function parseDecalKey(key) {
  const parts = key.split(',');
  return { c: Number(parts[0]), r: Number(parts[1]), z: Number(parts[2]), face: parts[3] };
}

export class DecalStore {
  constructor() {
    this.decals = new Map();
  }

  get(c, r, z, face) {
    return this.decals.get(decalKeyFor(c, r, z, face)) ?? null;
  }

  set(c, r, z, face, type) {
    this.decals.set(decalKeyFor(c, r, z, face), type);
  }

  remove(c, r, z, face) {
    this.decals.delete(decalKeyFor(c, r, z, face));
  }

  has(c, r, z, face) {
    return this.decals.has(decalKeyFor(c, r, z, face));
  }

  get size() {
    return this.decals.size;
  }

  /** All placed decals as {c, r, z, face, type}. */
  entries() {
    const out = [];
    for (const [key, type] of this.decals) {
      out.push({ ...parseDecalKey(key), type });
    }
    return out;
  }

  toJSON() {
    const decals = {};
    for (const [k, v] of this.decals) decals[k] = v;
    return { v: SAVE_VERSION, decals };
  }

  static fromJSON(data) {
    const parsed = typeof data === 'string' ? JSON.parse(data) : data;
    if (!parsed || parsed.v !== SAVE_VERSION) {
      throw new Error(`unsupported decal store version: ${parsed && parsed.v}`);
    }
    const store = new DecalStore();
    for (const [k, v] of Object.entries(parsed.decals || {})) {
      store.decals.set(k, v);
    }
    return store;
  }
}

/**
 * Decal TYPE registry — deliberately separate from BLOCKS: a decal type is just an id+name
 * (the actual texture/canvas/GPU-upload is the caller's job, same boundary blocks.js keeps for
 * BLOCKS — this module never touches images/DOM/GL). One image per decal type, no top/side/
 * bottom courses like a material (CONTENT_TOOLS_PLAN.md section 3's "no top/side/bottom
 * courses needed — a decal only ever has ONE face image").
 */
export const DECAL_TYPES = {};

export function registerDecalType(id, def) {
  DECAL_TYPES[id] = def;
}

export function deleteDecalType(id) {
  delete DECAL_TYPES[id];
}

/** Register a new decal type from just a name (reuses customMaterials.js's slugify, same id
 * convention every content type in this engine uses) and return the library entry to persist.
 * The actual texture (an uploaded image, one full face) is the caller's job — see voxel.html's
 * Decal Maker panel — same boundary registerBlock/createCustomMaterial already keep. */
export function createDecalType(name) {
  const id = slugify(name);
  registerDecalType(id, { name });
  return { id, name, createdAt: Date.now() };
}

// --- localStorage library (thin wrappers over the shared helper — see contentLibrary.js) ---

const library = makeLibrary('iso3d.decalTypes');
export const loadDecalTypeLibrary = library.load;
export const saveDecalTypeLibrary = library.save;
export const addDecalTypeToLibrary = library.add;
export const removeDecalTypeFromLibrary = library.remove;
