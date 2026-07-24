/**
 * Sparse voxel data store — "c,r,z" -> block string (parseable by blocks.js#parseBlock).
 * Axis convention matches blocks.js: c=+x east, r=+y south, z=+z up. Absent key = air.
 */

import { TERRAIN, cellAt } from '../map.js';

const SAVE_VERSION = 2;

export function keyFor(c, r, z) {
  return `${c},${r},${z}`;
}

export function parseKey(key) {
  return key.split(',').map(Number);
}

export class VoxelStore {
  constructor() {
    this.blocks = new Map();
  }

  get(c, r, z) {
    return this.blocks.get(keyFor(c, r, z)) ?? null;
  }

  set(c, r, z, blockStr) {
    this.blocks.set(keyFor(c, r, z), blockStr);
  }

  remove(c, r, z) {
    this.blocks.delete(keyFor(c, r, z));
  }

  has(c, r, z) {
    return this.blocks.has(keyFor(c, r, z));
  }

  get size() {
    return this.blocks.size;
  }

  /** All occupied cells as {c, r, z, block}. */
  entries() {
    const out = [];
    for (const [key, block] of this.blocks) {
      const [c, r, z] = parseKey(key);
      out.push({ c, r, z, block });
    }
    return out;
  }

  /** Bounding box of occupied cells (inclusive). Empty store -> an empty/inverted range. */
  bounds() {
    if (this.blocks.size === 0) {
      return { minC: 0, maxC: -1, minR: 0, maxR: -1, minZ: 0, maxZ: -1 };
    }
    let minC = Infinity;
    let maxC = -Infinity;
    let minR = Infinity;
    let maxR = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const key of this.blocks.keys()) {
      const [c, r, z] = parseKey(key);
      if (c < minC) minC = c;
      if (c > maxC) maxC = c;
      if (r < minR) minR = r;
      if (r > maxR) maxR = r;
      if (z < minZ) minZ = z;
      if (z > maxZ) maxZ = z;
    }
    return { minC, maxC, minR, maxR, minZ, maxZ };
  }

  /** Version-tagged save format (map format v2 in VOXEL_PLAN.md). */
  toJSON() {
    const b = this.bounds();
    const blocks = {};
    for (const [k, v] of this.blocks) blocks[k] = v;
    return {
      v: SAVE_VERSION,
      cols: Math.max(0, b.maxC + 1),
      rows: Math.max(0, b.maxR + 1),
      levels: Math.max(0, b.maxZ + 1),
      blocks,
    };
  }

  static fromJSON(data) {
    const parsed = typeof data === 'string' ? JSON.parse(data) : data;
    if (!parsed || parsed.v !== SAVE_VERSION) {
      throw new Error(`unsupported voxel map version: ${parsed && parsed.v}`);
    }
    const store = new VoxelStore();
    for (const [k, v] of Object.entries(parsed.blocks || {})) {
      store.blocks.set(k, v);
    }
    return store;
  }
}

/** Fixed-depth world floor bands (user request) — every column gets these regardless of its
 * own height. `BEDROCK_DEPTH` is deliberately just 1 (a thin cap at the very bottom, z=0,
 * matching `spread.js`'s own `WORLD_MIN_Z=0` floor convention and this engine's original
 * "one bedrock layer" convention) — an EARLIER version made bedrock itself 8 layers thick,
 * which looked wrong live (a huge, visually dominant slab of pure black bedrock texture under
 * everything). What the user actually wanted was the SURFACE sitting further above bedrock,
 * not bedrock itself being thick: `STONE_DEPTH` (7) makes up the rest of the fixed 8-deep base
 * (`BEDROCK_DEPTH+STONE_DEPTH`), so bedrock "starts 8 blocks lower" than a flat surface while
 * staying a thin 1-block cap. A height-0 column's surface sits directly on top of this fixed
 * base, with no filler at all — filler (dirt, or the ocean's dedicated sand layer) only
 * appears in the EXTRA room a taller/deeper column's own height provides above this shared base. */
export const BEDROCK_DEPTH = 1;
export const STONE_DEPTH = 7;

/**
 * Fill a cols x rows grid with Minecraft-style strata: a fixed bedrock+stone base (see
 * BEDROCK_DEPTH/STONE_DEPTH above) under EVERY column, then — within whatever extra height
 * `heightFn(c,r)` provides above that base — filler just below the surface, and the surface
 * type itself on top at z = BEDROCK_DEPTH + STONE_DEPTH + heightFn(c,r).
 *
 * Grass surfaces are a 3-course stack (top / mid / base) so hill sides show GRASS_SIDE + DIRT
 * + GRASS_BASE auto courses. Cliff surfaces use a full-height `cliff` stack above the stone
 * band so vertical faces show CLIFF_SIDE / CLIFF_MID / CLIFF_BASE courses. Sand still uses a
 * 2-deep sand filler. Water gets a single sand ocean-floor layer borrowed from the stone band
 * so shoreline stays flush with land at the same height.
 */
export function genStrata(cols, rows, heightFn, surfaceFn) {
  const store = new VoxelStore();
  const baseZ = BEDROCK_DEPTH + STONE_DEPTH; // z a height=0 surface sits at, for every column
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const h = heightFn(c, r);
      const surface = surfaceFn(c, r);
      if (surface == null) continue; // void/pit — no column at all
      const surfaceZ = baseZ + h;
      const isOcean = surface === 'water';
      // Grass: 3-course stack at the top. Cliff: entire column above stone band is cliff rock
      // so tall faces show full course auto-tiling (rim / strata / scree).
      const grassStack = surface === 'grass';
      const cliffStack = surface === 'cliff';
      const filler = surface === 'sand' ? 'sand' : 'dirt';
      for (let z = 0; z <= surfaceZ; z++) {
        let type;
        if (z < BEDROCK_DEPTH) type = 'bedrock';
        else if (cliffStack && z >= baseZ) type = 'cliff';
        else if (grassStack && z >= surfaceZ - 2 && z <= surfaceZ) type = 'grass';
        else if (z === surfaceZ) type = surface;
        else if (isOcean && z === surfaceZ - 1) type = 'sand'; // the ocean floor's own single sand layer
        else if (!isOcean && !cliffStack && z >= Math.max(baseZ, surfaceZ - 2)) type = filler;
        else type = 'stone';
        store.set(c, r, z, type);
      }
    }
  }
  return store;
}

/** Legacy iso3d-engine map.js TERRAIN id -> voxel surface block type. */
const LEGACY_SURFACE = {
  [TERRAIN.GRASS]: 'grass',
  [TERRAIN.DIRT]: 'dirt',
  [TERRAIN.WATER]: 'water',
  [TERRAIN.SAND]: 'sand',
  [TERRAIN.MUD]: 'dirt',
  [TERRAIN.CLIFF]: 'cliff',
};

/** Convert an old { cols, rows, cells:[{h,type}] } map (map.js) into a voxel store. */
export function fromLegacyMap(map) {
  return genStrata(
    map.cols,
    map.rows,
    (c, r) => cellAt(map, c, r).h,
    (c, r) => LEGACY_SURFACE[cellAt(map, c, r).type] ?? 'grass',
  );
}

/**
 * Grimoire terrain key -> voxel surface block type. Approximate for V1 (Step 8 revisits this
 * once the real Grimoire adapter is wired up) — good enough to render existing Grimoire maps
 * as blocks rather than all-dirt.
 */
export const GRIMOIRE_TO_VOXEL = {
  grass: 'grass',
  stone: 'stone',
  wood: 'planks',
  sand: 'sand',
  snow: 'sand',
  mud: 'dirt',
  rubble: 'stone',
  cliff: 'cliff',
  rock: 'cliff',
  water: 'water',
  brush: 'grass',
  fog: 'sand',
  ice: 'sand',
  acid: 'dirt',
  caltrops: 'dirt',
  lava: 'stone',
  wall: 'dungeon_wall',
  cave_wall: 'dungeon_wall',
  low_wall: 'dungeon_wall',
  window: 'dungeon_wall',
  void: null,
  pit: null,
  grease: 'dirt',
  web: 'sand',
  floor: 'stone',
};

/** Convert a Grimoire session's { tiles: {"c,r":key}, height: {"c,r":n} } dict to voxels. */
export function fromGrimoireTiles(cols, rows, tiles, height) {
  return genStrata(
    cols,
    rows,
    (c, r) => {
      const h = height ? Number(height[`${c},${r}`]) : 0;
      return Number.isFinite(h) ? h : 0;
    },
    (c, r) => {
      const key = tiles ? tiles[`${c},${r}`] : undefined;
      if (key == null) return 'grass';
      return GRIMOIRE_TO_VOXEL[key] !== undefined ? GRIMOIRE_TO_VOXEL[key] : 'grass';
    },
  );
}
