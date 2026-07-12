/**
 * Voxel block registry — the ONE place face textures, shapes and models are declared.
 *
 * AXIS CONVENTION (authoritative — never restate differently in any other voxel/* file):
 *   c = column = +x east
 *   r = row    = +y south
 *   z = level  = +z up, 1 block = 1 world unit
 * Facing order, clockwise from north: N=0, E=1, S=2, W=3 (see FACING).
 * A block's stored `facing` is the direction its FRONT points. Relative face names on a
 * directional block (front/right/back/left) are resolved against that facing — "right" is
 * your right hand if you were standing facing the same direction as the block's front.
 */

export const FACING = { N: 0, E: 1, S: 2, W: 3 };
export const FACING_NAMES = ['N', 'E', 'S', 'W'];

export const FACE = {
  TOP: 'top',
  BOTTOM: 'bottom',
  NORTH: 'north',
  EAST: 'east',
  SOUTH: 'south',
  WEST: 'west',
};
export const ALL_FACES = [FACE.TOP, FACE.BOTTOM, FACE.NORTH, FACE.EAST, FACE.SOUTH, FACE.WEST];
// Compass faces index-aligned with FACING (north=0, east=1, south=2, west=3).
const COMPASS_FACES = [FACE.NORTH, FACE.EAST, FACE.SOUTH, FACE.WEST];
const RELATIVE_NAMES = ['front', 'right', 'back', 'left'];

/** Placeholder atlas texture ids — swapped 1:1 for real PixelLab atlas cells in Step 8. */
export const TEX = {
  GRASS_TOP: 0,
  GRASS_SIDE: 1,
  DIRT: 2,
  STONE: 3,
  SAND: 4,
  BEDROCK: 5,
  WATER: 6,
  WOOD: 7,
  PLANKS: 8,
  BOOKS: 9,
  GLASS: 10,
  WALL_CAP: 11,
  WALL_MID: 12,
  WALL_BASE: 13,
  UNIT: 14,
};

/**
 * Per type: face textures resolved by most-specific-wins fallback (see resolveFace), plus
 * flags { solid, opaque, translucent } and an optional `model` name (see MODELS) for
 * non-cube shapes. `side` may be a single texture id or an array indexed by depth-below-
 * stack-top (per-elevation courses, e.g. a dungeon wall's cap/mid/base).
 */
export const BLOCKS = {
  bedrock: { all: TEX.BEDROCK, solid: true, opaque: true },
  stone: { all: TEX.STONE, solid: true, opaque: true },
  dirt: { all: TEX.DIRT, solid: true, opaque: true },
  sand: { all: TEX.SAND, solid: true, opaque: true },
  grass: { top: TEX.GRASS_TOP, side: TEX.GRASS_SIDE, bottom: TEX.DIRT, solid: true, opaque: true },
  water: { all: TEX.WATER, solid: false, opaque: false, translucent: true },
  wood: { all: TEX.WOOD, solid: true, opaque: true },
  planks: { all: TEX.PLANKS, solid: true, opaque: true },
  glass: { all: TEX.GLASS, solid: true, opaque: false, translucent: true },
  shelf: { front: TEX.BOOKS, all: TEX.PLANKS, solid: true, opaque: true },
  dungeon_wall: {
    top: TEX.WALL_CAP,
    side: [TEX.WALL_CAP, TEX.WALL_MID, TEX.WALL_BASE],
    solid: true,
    opaque: true,
  },
  door: { all: TEX.PLANKS, solid: true, opaque: false, model: 'door' },
  door_open: { all: TEX.PLANKS, solid: false, opaque: false, model: 'door_open' },
  window: { all: TEX.GLASS, solid: true, opaque: false, translucent: true, model: 'window' },
  table: { all: TEX.PLANKS, solid: false, opaque: false, model: 'table' },
  chair: { all: TEX.WOOD, solid: false, opaque: false, model: 'chair' },
};

/**
 * Non-cube geometry: a list of textured boxes in unit-cube coordinates (0..1 on each axis,
 * matching one grid cell), authored for canonical facing N (front points north, -r). The
 * mesher rotates these around the cell center for other facings. Boxes are inset ~0.01 from
 * cell boundaries so they never sit exactly coplanar with a neighboring cube face (z-fighting
 * by design, not luck — see VOXEL_PLAN.md pitfall #3).
 */
export const MODELS = {
  door: [{ from: [0.01, 0.02, 0.02], to: [0.99, 0.12, 1.98], faces: { all: TEX.PLANKS } }],
  door_open: [{ from: [0.88, 0.01, 0.02], to: [0.98, 0.99, 1.98], faces: { all: TEX.PLANKS } }],
  window: [{ from: [0.02, 0.02, 0.2], to: [0.98, 0.12, 0.8], faces: { all: TEX.GLASS } }],
  table: [
    { from: [0.1, 0.1, 0.45], to: [0.9, 0.9, 0.55], faces: { all: TEX.PLANKS } },
    { from: [0.12, 0.12, 0.0], to: [0.22, 0.22, 0.45], faces: { all: TEX.WOOD } },
    { from: [0.78, 0.12, 0.0], to: [0.88, 0.22, 0.45], faces: { all: TEX.WOOD } },
    { from: [0.12, 0.78, 0.0], to: [0.22, 0.88, 0.45], faces: { all: TEX.WOOD } },
    { from: [0.78, 0.78, 0.0], to: [0.88, 0.88, 0.45], faces: { all: TEX.WOOD } },
  ],
  chair: [
    { from: [0.2, 0.2, 0.4], to: [0.8, 0.8, 0.48], faces: { all: TEX.PLANKS } },
    { from: [0.2, 0.72, 0.48], to: [0.8, 0.8, 0.95], faces: { all: TEX.PLANKS } },
    { from: [0.22, 0.22, 0.0], to: [0.3, 0.3, 0.4], faces: { all: TEX.WOOD } },
    { from: [0.7, 0.22, 0.0], to: [0.78, 0.3, 0.4], faces: { all: TEX.WOOD } },
    { from: [0.22, 0.7, 0.0], to: [0.3, 0.78, 0.4], faces: { all: TEX.WOOD } },
    { from: [0.7, 0.7, 0.0], to: [0.78, 0.78, 0.4], faces: { all: TEX.WOOD } },
  ],
};

/** Parse a stored block value like "shelf:S#slab" -> { type, facing, slab }. */
export function parseBlock(str) {
  const m = /^([a-zA-Z_][a-zA-Z0-9_]*)(?::([NESW]))?(?:#(\w+))?$/.exec(str);
  if (!m) throw new Error(`bad block string: ${str}`);
  const [, type, facingLetter, shape] = m;
  return {
    type,
    facing: facingLetter ? FACING[facingLetter] : null,
    slab: shape === 'slab',
  };
}

/** Inverse of parseBlock — mainly for editors/tests round-tripping a parsed block. */
export function stringifyBlock({ type, facing, slab }) {
  let s = type;
  if (facing !== null && facing !== undefined) s += ':' + FACING_NAMES[facing];
  if (slab) s += '#slab';
  return s;
}

function pickDepth(value, depth) {
  if (Array.isArray(value)) return value[Math.min(depth, value.length - 1)];
  return value;
}

/**
 * Resolve which atlas texture id a specific absolute face of a block instance shows.
 * opts.facing: FACING index (default N=0) — only matters for blocks with relative face keys.
 * opts.depth: how far below the top of a same-type vertical stack this block sits (default 0)
 *   — only matters for blocks whose `side` is an array (per-elevation courses).
 */
export function resolveFace(typeName, face, opts = {}) {
  const def = BLOCKS[typeName];
  if (!def) throw new Error(`unknown block type: ${typeName}`);
  const facing = opts.facing ?? FACING.N;
  const depth = opts.depth ?? 0;

  if (face === FACE.TOP || face === FACE.BOTTOM) {
    if (def[face] !== undefined) return pickDepth(def[face], depth);
    return def.all;
  }

  const absIdx = COMPASS_FACES.indexOf(face);
  if (absIdx === -1) throw new Error(`bad face: ${face}`);

  const relIdx = (absIdx - facing + 4) % 4;
  const relName = RELATIVE_NAMES[relIdx];
  if (def[relName] !== undefined) return pickDepth(def[relName], depth);
  if (def[face] !== undefined) return pickDepth(def[face], depth);
  if (def.side !== undefined) return pickDepth(def.side, depth);
  return def.all;
}

// --- Placeholder atlas (Step 1) — swapped for a real PixelLab PNG in Step 8 without
// touching the mesher: only atlasUV()'s output changes meaning, never its shape. ---

export const ATLAS_COLS = 8;
export const ATLAS_ROWS = 8;
export const ATLAS_CELL_PX = 32;
export const ATLAS_PX = ATLAS_COLS * ATLAS_CELL_PX;

export const PLACEHOLDER_COLORS = {
  [TEX.GRASS_TOP]: '#4a9c3e',
  [TEX.GRASS_SIDE]: '#6b8f3a',
  [TEX.DIRT]: '#6b4a2f',
  [TEX.STONE]: '#8a8a8a',
  [TEX.SAND]: '#d9c98a',
  [TEX.BEDROCK]: '#1a1a1a',
  [TEX.WATER]: 'rgba(50,110,220,0.55)',
  [TEX.WOOD]: '#8a5a2f',
  [TEX.PLANKS]: '#a97a4a',
  [TEX.BOOKS]: '#7a2f2f',
  [TEX.GLASS]: 'rgba(170,210,230,0.3)',
  [TEX.WALL_CAP]: '#707070',
  [TEX.WALL_MID]: '#5a5a5a',
  [TEX.WALL_BASE]: '#454545',
  [TEX.UNIT]: '#e8d24a',
};

export function atlasCellRect(texId) {
  const col = texId % ATLAS_COLS;
  const row = Math.floor(texId / ATLAS_COLS);
  return { col, row, x: col * ATLAS_CELL_PX, y: row * ATLAS_CELL_PX };
}

/** Half-texel UV inset — the one function that converts atlas index -> UV rect, so bleed
 * fixes here apply everywhere forever, including once real textures replace the placeholder. */
export function atlasUV(texId, atlasPx = ATLAS_PX) {
  const { x, y } = atlasCellRect(texId);
  const texel = 1 / atlasPx;
  const half = texel * 0.5;
  return {
    u0: x / atlasPx + half,
    v0: y / atlasPx + half,
    u1: (x + ATLAS_CELL_PX) / atlasPx - half,
    v1: (y + ATLAS_CELL_PX) / atlasPx - half,
  };
}

/** Load the real atlas PNG (browser-only). Falls back to the placeholder canvas if the
 * file is missing, so pages never hard-fail just because art hasn't been generated yet. */
export function loadAtlasImage(url = 'src/voxel/atlas.png') {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => {
      const canvas = document.createElement('canvas');
      canvas.width = ATLAS_PX;
      canvas.height = ATLAS_PX;
      drawPlaceholderAtlas(canvas.getContext('2d'));
      resolve(canvas);
    };
    img.src = url;
  });
}

/** Draw the placeholder atlas into a 2D canvas context. Browser-only (not exercised by
 * node tests) — this is the only function in the file that touches a canvas API. */
export function drawPlaceholderAtlas(ctx) {
  ctx.clearRect(0, 0, ATLAS_PX, ATLAS_PX);
  for (const [texIdStr, color] of Object.entries(PLACEHOLDER_COLORS)) {
    const texId = Number(texIdStr);
    const { x, y } = atlasCellRect(texId);
    ctx.fillStyle = color;
    ctx.fillRect(x, y, ATLAS_CELL_PX, ATLAS_CELL_PX);
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, ATLAS_CELL_PX - 1, ATLAS_CELL_PX - 1);
  }
}
