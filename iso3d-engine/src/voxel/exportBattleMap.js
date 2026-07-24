/**
 * Bake a VoxelStore (+ optional billboards) into a Grimoire / Iso3D battle map:
 *   { cols, rows, tiles, height, decor, name?, source, stats }
 *
 * Iso3D (adapter.grimoireMapToIso) only needs per-column tiles + height + decor sprites.
 * Full voxel fidelity is optional via includeVoxelSnapshot for re-open in the editor.
 *
 * Rules stay Grimoire's job — this only derives walk surface + art keys.
 */

import { parseBlock, BLOCKS } from './blocks.js';
import { findSurface } from './surface.js';

/** Voxel block type → Grimoire tile key (session.map.tiles). */
/** Must match keys in Grimoire TERRAIN (dnd-character/index.html). No bare "dirt". */
export const VOXEL_TO_GRIMOIRE_TILE = {
  grass: 'grass',
  dirt: 'mud',
  mud: 'mud',
  sand: 'sand',
  stone: 'stone',
  cliff: 'stone',
  bedrock: 'stone',
  wood: 'wood',
  planks: 'wood',
  glass: 'stone',
  shelf: 'wood',
  water: 'water',
  fog: 'fog',
  gas: 'fog',
  dungeon_wall: 'wall',
  dungeon_wall_thin: 'wall',
  dungeon_wall_outer: 'wall',
  dungeon_wall_corner: 'wall',
  dungeon_stairs: 'stone',
  dungeon_ramp: 'stone',
  stone_stairs: 'stone',
  stone_ramp: 'stone',
  dungeon_pillar: 'wall',
  stone_pillar: 'stone',
  dungeon_pillar_single: 'wall',
  stone_pillar_single: 'stone',
  door: 'wood',
  door_open: 'wood',
  window: 'window',
  table: 'wood',
  chair: 'wood',
  torch: 'stone',
  torch_off: 'stone',
};

/** Terrain keys Grimoire knows (subset used by bake). */
export const GRIMOIRE_TILE_KEYS = new Set([
  'grass', 'stone', 'wood', 'sand', 'snow', 'mud', 'rubble', 'water', 'brush',
  'fog', 'ice', 'acid', 'caltrops', 'lava', 'wall', 'cave_wall', 'low_wall',
  'window', 'void', 'pit', 'grease', 'web',
]);

export const GRIMOIRE_MAPS_KEY = 'grimoire.maps';

/** Billboard / object type ids that Iso3D may draw as decor sprites. */
export const DECOR_SAFE_KEYS = new Set([
  'tree', 'tree2', 'tree_dead', 'tree_snow', 'jungle_tree', 'jungle_tree2',
  'bush', 'bush2', 'bush3', 'bush_snow', 'jungle_bush',
  'rock', 'stump', 'log', 'mushroom', 'crystal', 'ore',
]);

/**
 * Map a voxel block type string to a Grimoire tile key.
 * @param {string} blockType
 */
export function voxelTypeToGrimoireTile(blockType) {
  const t = String(blockType || '').toLowerCase();
  if (VOXEL_TO_GRIMOIRE_TILE[t]) return VOXEL_TO_GRIMOIRE_TILE[t];
  if (t.includes('wall') || t.includes('pillar')) return 'wall';
  if (t.includes('stair') || t.includes('ramp')) return 'stone';
  if (t.includes('wood') || t.includes('plank')) return 'wood';
  if (t.includes('sand')) return 'sand';
  if (t.includes('mud')) return 'mud';
  if (t.includes('dirt')) return 'dirt';
  if (t.includes('grass')) return 'grass';
  if (t.includes('water') || t.includes('lava')) return 'water';
  if (t.includes('cliff') || t.includes('stone') || t.includes('rock')) return 'stone';
  return 'grass';
}

/**
 * True if this column is mostly a vertical wall/cliff barrier (for Iso3D wall tiles).
 * Heuristic: tall solid stack and surface type is wall-like, OR top solid is dungeon_wall*.
 */
function columnLooksLikeWall(store, c, r, surf) {
  if (!surf) return false;
  const topType = parseBlock(store.get(c, r, surf.z) || 'stone').type;
  if (String(topType).startsWith('dungeon_wall') || topType.includes('pillar')) return true;

  // Count solid cells in column near the surface
  let solid = 0;
  for (let z = surf.z; z >= surf.z - 6 && z >= 0; z--) {
    const b = store.get(c, r, z);
    if (!b) continue;
    const def = BLOCKS[parseBlock(b).type];
    if (def && def.solid && !def.gas && !def.liquid) solid++;
  }
  // Cliff plateau tops are walkable stone (solid stack but not "wall")
  if (topType === 'cliff' && solid >= 4) return false; // walkable cliff top → stone tile
  if (topType === 'cliff' && solid >= 2) {
    // If nothing walkable? we have surf so it is walkable. Use stone not wall.
    return false;
  }
  return false;
}

/**
 * Detect water-only / unwalkable columns.
 */
function columnIsWater(store, c, r, maxZ) {
  // Prefer surface first — if standable, not water
  if (findSurface(store, c, r, { maxZ })) return false;
  for (let z = maxZ; z >= 0; z--) {
    const b = store.get(c, r, z);
    if (!b) continue;
    const t = parseBlock(b).type;
    if (t === 'water') return true;
    const def = BLOCKS[t];
    if (def && def.liquid) return true;
    if (def && def.solid) return false;
  }
  return true; // empty / void → treat unwalkable like water for Iso3D
}

/**
 * Bake voxels → Grimoire map.
 *
 * @param {import('./store.js').VoxelStore} store
 * @param {{
 *   cols?: number,
 *   rows?: number,
 *   originC?: number,
 *   originR?: number,
 *   billboardStore?: { entries?: Function, billboards?: Map },
 *   billboardTypes?: Record<string, { id?: string, name?: string }>,
 *   name?: string,
 *   includeVoxelSnapshot?: boolean,
 *   maxHeight?: number,
 * }} [opts]
 */
export function voxelToGrimoireMap(store, opts = {}) {
  const b = store.bounds();
  const originC = opts.originC != null ? opts.originC : Math.min(0, b.minC);
  const originR = opts.originR != null ? opts.originR : Math.min(0, b.minR);
  const cols = opts.cols != null
    ? opts.cols
    : Math.max(1, (b.maxC < b.minC ? 16 : b.maxC - originC + 1));
  const rows = opts.rows != null
    ? opts.rows
    : Math.max(1, (b.maxR < b.minR ? 16 : b.maxR - originR + 1));
  const maxH = opts.maxHeight != null ? opts.maxHeight : 6;
  const maxZ = b.maxZ < b.minZ ? 32 : b.maxZ + 4;

  // Pass 1: surfaces + raw stand heights
  /** @type {{ key:string, tile:string, standZ:number|null, wall:boolean }[]} */
  const cells = [];
  let minStand = Infinity;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const wc = originC + c;
      const wr = originR + r;
      const key = `${c},${r}`;
      const surf = findSurface(store, wc, wr, { maxZ });

      if (!surf) {
        const water = columnIsWater(store, wc, wr, maxZ);
        cells.push({
          key,
          tile: water ? 'water' : 'void',
          standZ: null,
          wall: false,
        });
        continue;
      }

      const blockStr = store.get(wc, wr, surf.z);
      const blockType = blockStr ? parseBlock(blockStr).type : 'grass';
      let tile = voxelTypeToGrimoireTile(blockType);
      const wall = columnLooksLikeWall(store, wc, wr, surf);
      if (wall) tile = 'wall';

      if (surf.standZ < minStand) minStand = surf.standZ;
      cells.push({ key, tile, standZ: surf.standZ, wall });
    }
  }

  if (!Number.isFinite(minStand)) minStand = 0;

  // Pass 2: relative heights 0..maxH for Iso3D
  const tiles = {};
  const height = {};
  let walkable = 0;
  let water = 0;
  let walls = 0;

  for (const cell of cells) {
    tiles[cell.key] = cell.tile;
    if (cell.standZ == null) {
      height[cell.key] = 0;
      if (cell.tile === 'water' || cell.tile === 'void') water++;
      continue;
    }
    walkable++;
    if (cell.tile === 'wall') walls++;
    let h = Math.round(cell.standZ - minStand);
    if (cell.tile === 'wall' && h < 1) h = 2;
    height[cell.key] = Math.max(0, Math.min(maxH, h));
  }

  // Decor from billboards (one per column, top-most wins)
  const decor = {};
  const bbStore = opts.billboardStore;
  const bbTypes = opts.billboardTypes || {};
  if (bbStore) {
    const list = typeof bbStore.entries === 'function'
      ? bbStore.entries()
      : [...(bbStore.billboards || new Map()).entries()].map(([k, type]) => {
        const [c, r, z] = k.split(',').map(Number);
        return { c, r, z, type };
      });

    // Prefer higher z when multiple on same column
    const byCol = new Map();
    for (const e of list) {
      const lc = e.c - originC;
      const lr = e.r - originR;
      if (lc < 0 || lr < 0 || lc >= cols || lr >= rows) continue;
      const colKey = `${lc},${lr}`;
      const prev = byCol.get(colKey);
      if (!prev || e.z > prev.z) byCol.set(colKey, e);
    }
    for (const [colKey, e] of byCol) {
      const typeId = e.type;
      const def = bbTypes[typeId];
      const name = (def && (def.name || def.id)) || typeId;
      const slug = String(name).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
      // Map common names onto Iso3D-safe decor keys
      let decorKey = slug;
      if (slug.includes('tree')) decorKey = 'tree';
      else if (slug.includes('bush')) decorKey = 'bush';
      else if (slug.includes('rock')) decorKey = 'rock';
      else if (DECOR_SAFE_KEYS.has(slug)) decorKey = slug;
      else if (DECOR_SAFE_KEYS.has(typeId)) decorKey = typeId;
      else continue; // skip unknown custom billboards for Iso3D
      decor[colKey] = decorKey;
    }
  }

  const out = {
    cols,
    rows,
    tiles,
    height,
    decor,
    name: opts.name || 'voxel_export',
    source: 'voxel',
    stats: {
      walkable,
      water,
      walls,
      decor: Object.keys(decor).length,
      baseStandZ: minStand,
    },
  };

  if (opts.includeVoxelSnapshot) {
    out.voxelSnapshot = store.toJSON();
  }

  return out;
}

/**
 * Build a minimal Grimoire session shell around an exported map (for bridge preview).
 * @param {ReturnType<typeof voxelToGrimoireMap>} gMap
 * @param {{ placeDemoUnits?: boolean }} [opts]
 */
export function grimoireSessionFromBattleMap(gMap, opts = {}) {
  const cols = gMap.cols;
  const rows = gMap.rows;

  // Find two walkable tiles for demo units
  const walk = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const t = gMap.tiles[`${c},${r}`];
      if (t && t !== 'water' && t !== 'void' && t !== 'wall') walk.push({ c, r });
    }
  }
  const p1 = walk[0] || { c: 1, r: 1 };
  const p2 = walk[Math.min(3, walk.length - 1)] || p1;
  const m1 = walk[Math.floor(walk.length / 2)] || p1;
  const m2 = walk[Math.min(walk.length - 1, Math.floor(walk.length / 2) + 2)] || m1;

  const session = {
    map: {
      cols: gMap.cols,
      rows: gMap.rows,
      tiles: gMap.tiles,
      height: gMap.height,
      decor: gMap.decor || {},
    },
    players: [],
    monsters: [],
    order: [],
    turn: 0,
    battle: true,
  };

  if (opts.placeDemoUnits !== false) {
    session.players = [
      {
        id: 'p1', name: 'Aldric', cls: 'Fighter',
        x: p1.c, y: p1.r, hpCur: 12, hpMax: 14, facing: 'up',
      },
      {
        id: 'p2', name: 'Nyx', cls: 'Rogue',
        x: p2.c, y: p2.r, hpCur: 9, hpMax: 10, facing: 'right',
      },
    ];
    session.monsters = [
      {
        id: 'm1', name: 'Goblin A', sprite: 'goblin',
        x: m1.c, y: m1.r, hp: 7, max: 7, facing: 'down',
      },
      {
        id: 'm2', name: 'Goblin B', sprite: 'goblin',
        x: m2.c, y: m2.r, hp: 7, max: 7, facing: 'left',
      },
    ];
  }

  return session;
}

export const BATTLE_MAP_STORAGE_KEY = 'iso3d.battleMapPreview';

/**
 * Strip export down to what Grimoire loadMapData / savedMaps expect.
 * Unknown terrain → grass; unknown decor dropped; size clamped.
 */
export function sanitizeForGrimoire(gMap, opts = {}) {
  const maxDim = opts.maxDim != null ? opts.maxDim : 40;
  const cols = Math.max(2, Math.min(maxDim, Number(gMap.cols) || 10));
  const rows = Math.max(2, Math.min(maxDim, Number(gMap.rows) || 8));
  const tiles = {};
  const height = {};
  const decor = {};
  const srcT = gMap.tiles || {};
  const srcH = gMap.height || {};
  const srcD = gMap.decor || {};

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const k = `${x},${y}`;
      let t = srcT[k] || 'grass';
      if (t === 'dirt') t = 'mud';
      if (t === 'floor') t = 'grass';
      if (!GRIMOIRE_TILE_KEYS.has(t)) t = 'grass';
      tiles[k] = t;
      const h = Number(srcH[k]);
      if (Number.isFinite(h) && h !== 0) {
        height[k] = Math.max(-4, Math.min(6, Math.round(h)));
      }
      const d = srcD[k];
      if (d && DECOR_SAFE_KEYS.has(d)) decor[k] = d;
    }
  }

  return {
    cols,
    rows,
    tiles,
    height,
    decor,
    name: gMap.name || 'voxel_import',
    blurb: gMap.blurb || (gMap.source === 'voxel' ? 'Imported from voxel engine' : undefined),
    source: gMap.source || 'voxel',
  };
}

/**
 * Save a battle map into Grimoire's localStorage library (`grimoire.maps`).
 * Only works when voxel UI and Grimoire share the same origin (same host:port).
 * @returns {{ ok:boolean, name:string, reason?:string, count?:number }}
 */
export function pushMapToGrimoireLibrary(gMap, name) {
  const nm = String(name || gMap.name || 'Voxel map').trim() || 'Voxel map';
  const clean = sanitizeForGrimoire(gMap);
  try {
    const all = JSON.parse(localStorage.getItem(GRIMOIRE_MAPS_KEY) || '{}');
    all[nm] = {
      cols: clean.cols,
      rows: clean.rows,
      tiles: clean.tiles,
      height: clean.height,
      decor: clean.decor,
      blurb: clean.blurb,
    };
    localStorage.setItem(GRIMOIRE_MAPS_KEY, JSON.stringify(all));
    return { ok: true, name: nm, count: Object.keys(all).length };
  } catch (e) {
    return { ok: false, name: nm, reason: e.message || String(e) };
  }
}

/** Trigger a browser download of the Grimoire-ready JSON. */
export function downloadBattleMapJson(gMap, filename) {
  const clean = sanitizeForGrimoire(gMap);
  const blob = new Blob([JSON.stringify(clean, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename || `${(clean.name || 'voxel_map').replace(/[^\w\-]+/g, '_')}.json`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 500);
  return clean;
}
