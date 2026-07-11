/**
 * Grid map: height + terrain type per cell.
 */

export const TERRAIN = {
  GRASS: 0,
  DIRT: 1,
  WATER: 2,
  SAND: 3,
  MUD: 4,
  CLIFF: 5,
  VOID: 6,
};

/** Human-readable editor palette (primary first). */
export const TERRAIN_META = [
  { id: TERRAIN.GRASS, name: 'Grass', swatch: '#5a9a3e' },
  { id: TERRAIN.DIRT, name: 'Dirt', swatch: '#8b6a45' },
  { id: TERRAIN.WATER, name: 'Water', swatch: '#2a6fb0' },
  { id: TERRAIN.CLIFF, name: 'Cliff', swatch: '#7a7368' },
  { id: TERRAIN.SAND, name: 'Sand', swatch: '#c9b56a' },
  { id: TERRAIN.MUD, name: 'Mud', swatch: '#5c4528' },
];

/** Base albedo for each terrain (top face) — kept bright for readability on WebGL. */
export const TERRAIN_COLORS = {
  [TERRAIN.GRASS]: [0.42, 0.68, 0.32],
  [TERRAIN.DIRT]: [0.68, 0.52, 0.34],
  [TERRAIN.WATER]: [0.28, 0.52, 0.78],
  [TERRAIN.SAND]: [0.86, 0.78, 0.50],
  [TERRAIN.MUD]: [0.52, 0.40, 0.24],
  [TERRAIN.CLIFF]: [0.68, 0.66, 0.62],
  [TERRAIN.VOID]: [0.015, 0.015, 0.02],
};

/** Rock / cliff face strata (lighter → darker). */
export const CLIFF_STRATA = [
  [0.72, 0.68, 0.62],
  [0.60, 0.56, 0.50],
  [0.50, 0.48, 0.44],
  [0.42, 0.40, 0.38],
];

export const MAX_HEIGHT = 4;

export function createMap(cols, rows, fillHeight = 0, fillType = TERRAIN.GRASS) {
  const cells = new Array(cols * rows);
  for (let i = 0; i < cells.length; i++) {
    cells[i] = { h: fillHeight, type: fillType };
  }
  return { cols, rows, cells };
}

export function cellAt(map, col, row) {
  if (col < 0 || row < 0 || col >= map.cols || row >= map.rows) return null;
  return map.cells[row * map.cols + col];
}

export function heightAt(map, col, row) {
  const c = cellAt(map, col, row);
  return c ? c.h : 0;
}

/** Entering this cell costs this many squares of speed. */
export function moveCost(map, col, row) {
  const cell = cellAt(map, col, row);
  if (!cell) return Infinity;
  if (cell.type === TERRAIN.WATER) return Infinity;
  if (cell.type === TERRAIN.MUD) return 2;
  // Steep cliffs are walkable on top but climbing handled by maxClimb
  return 1;
}

/**
 * Scenic demo: pond, dirt path, grassy fields, rocky cliffs.
 */
export function buildDemoMap(cols = 12, rows = 12) {
  const map = createMap(cols, rows, 0, TERRAIN.GRASS);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cell = map.cells[r * cols + c];
      // Outer water bay (NW)
      if (c <= 1 && r <= 3) {
        cell.type = TERRAIN.WATER;
        cell.h = 0;
      } else if (c === 0 || r === 0) {
        cell.type = TERRAIN.WATER;
        cell.h = 0;
      } else if (c >= cols - 1 || r >= rows - 1) {
        // Sand shore on far edges
        cell.type = TERRAIN.SAND;
        cell.h = 0;
      } else if (c >= 7 && c <= 9 && r >= 3 && r <= 7) {
        // Rocky cliff plateau
        cell.type = TERRAIN.CLIFF;
        cell.h = c === 7 ? 1 : c === 8 ? 2 : 3;
      } else if (c >= 5 && c <= 6 && r >= 4 && r <= 6) {
        // Cliff foothills
        cell.type = TERRAIN.CLIFF;
        cell.h = 1;
      } else if (r === 6 && c >= 2 && c <= 6) {
        // Mud crossing (before dirt path so it wins on the intersection)
        cell.type = TERRAIN.MUD;
        cell.h = 0;
      } else if ((c === 3 || c === 4) && r >= 2 && r <= 9) {
        // Dirt path
        cell.type = TERRAIN.DIRT;
        cell.h = 0;
      } else if (c >= 2 && c <= 3 && r >= 8 && r <= 9) {
        // Low dirt mound
        cell.type = TERRAIN.DIRT;
        cell.h = 1;
      } else {
        cell.type = TERRAIN.GRASS;
        cell.h = 0;
      }
    }
  }
  return map;
}

export function isWalkable(map, col, row) {
  const cell = cellAt(map, col, row);
  if (!cell) return false;
  return cell.type !== TERRAIN.WATER;
}

/**
 * Super-cover LOS: Bresenham; blocked if intermediate cell taller than both ends.
 */
export function hasLineOfSight(map, c0, r0, c1, r1) {
  if (c0 === c1 && r0 === r1) return true;
  const h0 = heightAt(map, c0, r0);
  const h1 = heightAt(map, c1, r1);
  const maxEndpoint = Math.max(h0, h1);

  let x0 = c0;
  let y0 = r0;
  const x1 = c1;
  const y1 = r1;
  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;

  while (!(x0 === x1 && y0 === y1)) {
    const e2 = 2 * err;
    if (e2 > -dy) {
      err -= dy;
      x0 += sx;
    }
    if (e2 < dx) {
      err += dx;
      y0 += sy;
    }
    if (x0 === x1 && y0 === y1) break;
    const h = heightAt(map, x0, y0);
    if (h > maxEndpoint) return false;
  }
  return true;
}

export function maxClimb() {
  return 1;
}

// --- Editor ops ---

export function paintTerrain(map, col, row, type) {
  const cell = cellAt(map, col, row);
  if (!cell) return false;
  cell.type = type;
  if (type === TERRAIN.WATER) cell.h = 0;
  if (type === TERRAIN.CLIFF && cell.h < 1) cell.h = 1;
  return true;
}

export function raiseTile(map, col, row) {
  const cell = cellAt(map, col, row);
  if (!cell || cell.type === TERRAIN.WATER) return false;
  if (cell.h >= MAX_HEIGHT) return false;
  cell.h += 1;
  // Raised rock becomes cliff-like if was dirt/grass optionally leave type
  return true;
}

export function lowerTile(map, col, row) {
  const cell = cellAt(map, col, row);
  if (!cell) return false;
  if (cell.h <= 0) return false;
  cell.h -= 1;
  return true;
}

export function flattenTile(map, col, row) {
  const cell = cellAt(map, col, row);
  if (!cell) return false;
  cell.h = 0;
  return true;
}

/** Clone map for undo. */
export function cloneMap(map) {
  return {
    cols: map.cols,
    rows: map.rows,
    cells: map.cells.map((c) => ({ h: c.h, type: c.type })),
  };
}

export function serializeMap(map) {
  return JSON.stringify({
    cols: map.cols,
    rows: map.rows,
    cells: map.cells.map((c) => [c.h, c.type]),
  });
}

export function deserializeMap(json) {
  const data = typeof json === 'string' ? JSON.parse(json) : json;
  const map = createMap(data.cols, data.rows);
  for (let i = 0; i < map.cells.length; i++) {
    const [h, type] = data.cells[i];
    map.cells[i] = { h, type };
  }
  return map;
}
