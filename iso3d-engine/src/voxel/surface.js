/**
 * Derives a standable surface per (c,r) column from the voxel store, and adapts it into the
 * existing legacy map.js shape ({cols, rows, cells:[{h,type}]}) so pathfinding.js keeps
 * working completely unchanged — elevation just becomes the surface's standZ instead of an
 * integer height. Rules (Grimoire) never live here; this only derives geometry a rules
 * engine can walk.
 */

import { parseBlock, BLOCKS } from './blocks.js';
import { TERRAIN } from '../map.js';

/**
 * Topmost standable spot in a column: a solid block with 2 genuinely empty cells above it
 * (room to stand). A slab's stand height is z+0.5 (feet on its half-height top); a full
 * cube's is z+1. Returns { c, r, z, standZ } for the supporting block, or null if the column
 * has no standable surface at all (e.g. a water-topped pond, matching the old WATER-is-
 * impassable convention — nothing under a full pond block ever qualifies as standable).
 */
export function findSurface(store, c, r, opts = {}) {
  const maxZ = opts.maxZ ?? 64;
  const minZ = opts.minZ ?? -maxZ;
  for (let z = maxZ; z >= minZ; z--) {
    const block = store.get(c, r, z);
    if (!block) continue;
    const parsed = parseBlock(block);
    const def = BLOCKS[parsed.type];
    if (!def || !def.solid) continue;
    if (store.has(c, r, z + 1) || store.has(c, r, z + 2)) continue;
    return { c, r, z, standZ: parsed.slab ? z + 0.5 : z + 1 };
  }
  return null;
}

/**
 * Build a full { cols, rows, cells } grid of surfaces (map.js shape) — h = standZ (may be
 * a .5 fraction for a slab top; pathfinding.js's elevation math is plain arithmetic and
 * doesn't care), type = GRASS for any standable column, WATER as the "no surface here"
 * unwalkable sentinel (the same convention isWalkable()/moveCost() already use).
 */
export function surfaceToLegacyMap(store, cols, rows) {
  const cells = new Array(cols * rows);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const surf = findSurface(store, c, r);
      cells[r * cols + c] = surf ? { h: surf.standZ, type: TERRAIN.GRASS } : { h: 0, type: TERRAIN.WATER };
    }
  }
  return { cols, rows, cells };
}
