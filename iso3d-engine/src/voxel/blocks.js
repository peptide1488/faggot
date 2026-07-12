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
  // Per-elevation side array (same mechanic dungeon_wall uses): only the TOP block of a
  // stack shows the grass fringe; anything stacked underneath shows plain dirt, matching
  // how a tall grass-topped column should actually look (not fringe repeated at every level).
  grass: { top: TEX.GRASS_TOP, side: [TEX.GRASS_SIDE, TEX.DIRT], bottom: TEX.DIRT, solid: true, opaque: true },
  water: { all: TEX.WATER, solid: false, opaque: false, translucent: true },
  wood: { all: TEX.WOOD, solid: true, opaque: true },
  planks: { all: TEX.PLANKS, solid: true, opaque: true },
  glass: { all: TEX.GLASS, solid: true, opaque: false, translucent: true, model: 'window' },
  shelf: { front: TEX.BOOKS, all: TEX.PLANKS, solid: true, opaque: true },
  dungeon_wall: {
    // WALL_CAP/MID/BASE are side-view crops (cropped from a tall wall image meant to be
    // seen from the side) — correct for the side courses, but wrong for the top face
    // (viewed straight down), which needs an actual top-down texture. STONE until a
    // dedicated top-down wall-cap texture exists (material maker will make that easy).
    top: TEX.STONE,
    side: [TEX.WALL_CAP, TEX.WALL_MID, TEX.WALL_BASE],
    // Never normally seen (undersides of floor-supported walls), but must resolve to
    // SOMETHING — previously fell through resolveFace's `return def.all` fallback to
    // undefined (no `all` on this def either), which silently produced NaN UVs instead of
    // throwing. Reuse the base course's texture, the closest visual match.
    bottom: TEX.WALL_BASE,
    solid: true,
    opaque: true,
  },
  door: { all: TEX.PLANKS, solid: true, opaque: false, model: 'door' },
  door_open: { all: TEX.PLANKS, solid: false, opaque: false, model: 'door_open' },
  window: { all: TEX.GLASS, solid: true, opaque: false, translucent: true, model: 'window' },
  table: { all: TEX.PLANKS, solid: false, opaque: false, model: 'table' },
  chair: { all: TEX.WOOD, solid: false, opaque: false, model: 'chair' },
  /** `light`: read by the editor/host to build a lighting.js point light at this cell —
   * same shape as Grimoire's torchPt() (radius in tiles, color 0-1 RGB, intensity). */
  torch: {
    all: TEX.WOOD,
    solid: false,
    opaque: false,
    model: 'torch',
    light: { radius: 5, color: [1, 0.55, 0.22], intensity: 1.6 },
  },
  // Unlit — same physical stick model as `torch`, just no `light` field, so it emits nothing.
  // A toggle is swapping the stored type (exactly the `door`/`door_open` pattern already
  // used above) — actually triggering that swap (Mage Hand, a spell, being blown out) is
  // Grimoire's rules layer to wire up, not this engine's job; this only provides the second
  // placeable state to swap to/from.
  torch_off: {
    all: TEX.WOOD,
    solid: false,
    opaque: false,
    model: 'torch',
  },
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
  // Small wall-mounted stick — the light itself comes from BLOCKS.torch.light, not from any
  // special geometry here; this is just a thin post so it reads as an object, not a decal.
  torch: [{ from: [0.44, 0.02, 0.15], to: [0.56, 0.14, 0.75], faces: { all: TEX.WOOD } }],
};

/**
 * Shape presets — non-cube geometry that, unlike MODELS, is MATERIAL-AGNOSTIC: each box's
 * faces are resolved through resolveFace() using the placed block's own material + facing,
 * exactly like a full cube or slab already does, instead of baking in one fixed texture. This
 * is what lets any material (built-in or custom) pair with any shape independently (see
 * CONTENT_TOOLS_PLAN.md "Block shape presets"). Assign via `BLOCKS[type].shape = 'column_thin'`
 * (or an array — see pickDepth — for a shape that varies by depth-below-stack-top, the same
 * mechanic `side: [cap,mid,base]` textures already use, e.g. a flared column's base/mid/cap
 * needing different box lists, not just different textures).
 *
 * Only shapes representable as axis-aligned boxes live here. True diagonal geometry (a ramp/
 * slope) needs slanted quads, a genuinely new primitive beyond this box-list mechanism — not
 * built, flagged in CONTENT_TOOLS_PLAN.md rather than faked with stepped boxes.
 */
export const SHAPES = {
  // A thin full-height post through the cell's center — thick/thin post or tree trunk (round
  // trunks would need cylindrical geometry; this is the square approximation).
  column_thick: [{ from: [0.2, 0.2, 0.0], to: [0.8, 0.8, 0.99] }],
  column_thin: [{ from: [0.35, 0.35, 0.0], to: [0.65, 0.65, 0.99] }],
  // Depth-varying flared column (see pickDepth below) — a base block gets the wide-foot
  // shape, middle blocks the plain shaft, a cap block the wide-top shape. Use as
  // `shape: ['column_cap', 'column_mid', 'column_base']` on a multi-block-tall column.
  column_base: [
    { from: [0.15, 0.15, 0.0], to: [0.85, 0.85, 0.2] },
    { from: [0.35, 0.35, 0.2], to: [0.65, 0.65, 0.99] },
  ],
  column_mid: [{ from: [0.35, 0.35, 0.0], to: [0.65, 0.65, 0.99] }],
  column_cap: [
    { from: [0.35, 0.35, 0.0], to: [0.65, 0.65, 0.8] },
    { from: [0.15, 0.15, 0.8], to: [0.85, 0.85, 0.99] },
  ],
  // Thin partition wall, centered, running east-west through the cell (rotates with facing
  // like any other shape).
  wall_thin_middle: [{ from: [0.01, 0.42, 0.0], to: [0.99, 0.58, 0.99] }],
  // A short inset box near the floor — trap/lever-plate footprint.
  pressure_plate: [{ from: [0.15, 0.15, 0.0], to: [0.85, 0.85, 0.08] }],
  // A thin vertical pane centered in the cell, no frame — glass-without-window-model.
  pane: [{ from: [0.02, 0.46, 0.02], to: [0.98, 0.54, 0.98] }],
  // A thin full-footprint horizontal panel — floor grate/mat, distinct from a half-height
  // slab (much thinner) and from pressure_plate (full footprint, not inset).
  flat_pane: [{ from: [0.01, 0.01, 0.0], to: [0.99, 0.99, 0.08] }],
  // Reusable furniture primitives — a counter/shelf surface and a single corner post, meant
  // to be combined across cells with any material (unlike the fixed-material MODELS.table).
  table_top: [{ from: [0.02, 0.02, 0.45], to: [0.98, 0.98, 0.55] }],
  table_leg: [{ from: [0.12, 0.12, 0.0], to: [0.28, 0.28, 0.45] }],
  // A single ascending step, low tread toward the front (north/open side), a raised ledge on
  // the back (south) half — canonical N facing means you climb it walking south.
  step: [
    { from: [0.01, 0.01, 0.0], to: [0.99, 0.99, 0.5] },
    { from: [0.01, 0.5, 0.5], to: [0.99, 0.99, 0.99] },
  ],
  // Thin wall flush with the cell's outer (north) edge vs inner (south) edge — companions to
  // wall_thin_middle for lining up a wall against one side of a room instead of through its
  // center.
  wall_thin_outer: [{ from: [0.01, 0.02, 0.0], to: [0.99, 0.18, 0.99] }],
  wall_thin_inner: [{ from: [0.01, 0.82, 0.0], to: [0.99, 0.98, 0.99] }],
  // Two thin wall segments meeting at the NW corner — turns a wall corner without a gap.
  wall_corner: [
    { from: [0.01, 0.02, 0.0], to: [0.99, 0.18, 0.99] },
    { from: [0.02, 0.01, 0.0], to: [0.18, 0.99, 0.99] },
  ],
  // Two side posts (wall_thin_middle's position, split) with a door-width gap between them —
  // the frame a door model (MODELS.door) is meant to sit inside.
  door_jamb: [
    { from: [0.01, 0.42, 0.0], to: [0.3, 0.58, 0.99] },
    { from: [0.7, 0.42, 0.0], to: [0.99, 0.58, 0.99] },
  ],
  // A full ring (two posts, a sill, a lintel) around a central opening — same footprint as
  // door_jamb plus top/bottom bars, for a window opening (glass is a separate material/shape
  // placed in the same cell, or MODELS.window).
  window_frame: [
    { from: [0.01, 0.42, 0.0], to: [0.15, 0.58, 0.99] },
    { from: [0.85, 0.42, 0.0], to: [0.99, 0.58, 0.99] },
    { from: [0.15, 0.42, 0.0], to: [0.85, 0.58, 0.2] },
    { from: [0.15, 0.42, 0.8], to: [0.85, 0.58, 0.99] },
  ],
  // Square-approximated barrel silhouette: narrow top/bottom, bulging middle (round barrels
  // would need cylindrical geometry — see the file-level note on slopes/round shapes).
  barrel: [
    { from: [0.25, 0.25, 0.0], to: [0.75, 0.75, 0.15] },
    { from: [0.15, 0.15, 0.15], to: [0.85, 0.85, 0.85] },
    { from: [0.25, 0.25, 0.85], to: [0.75, 0.75, 0.99] },
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

/** Pick the depth-indexed entry of a per-elevation array (side textures, or a shape list —
 * see SHAPES' column_cap/mid/base), clamping to the last entry on taller stacks. Plain
 * (non-array) values pass through unchanged — most defs don't vary by depth at all. */
export function pickDepth(value, depth) {
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

// Reserved: 0-14 built-in materials (see TEX above), 15 = orientation/debug test texture
// (tools/voxel_orientation_test.html — 4-quadrant + top-edge marker, used to verify UV
// orientation; keep it, it's how the 2026-07-12 face-orientation bug got diagnosed).
// Custom materials/objects from the material maker allocate starting here.
export const TEX_CUSTOM_START = 16;
let nextCustomTexId = TEX_CUSTOM_START;

/**
 * Hand out the next free atlas cell for a custom material/object texture (material maker).
 * Throws once the atlas (ATLAS_COLS x ATLAS_ROWS cells) is full rather than silently
 * overflowing into another texture's cell — growing to a bigger atlas is a real future
 * need, not solved here (see CONTENT_TOOLS_PLAN.md), but corrupting existing textures
 * silently would be much worse than a clear error.
 */
export function allocateTexSlot() {
  if (nextCustomTexId >= ATLAS_COLS * ATLAS_ROWS) {
    throw new Error(`Atlas is full (${ATLAS_COLS * ATLAS_ROWS} cells) — no more custom texture slots. Needs a bigger atlas.`);
  }
  return nextCustomTexId++;
}

/** Reset custom texture allocation. ONLY for tests, or reloading a material library from a
 * clean slate — never call this mid-session while existing custom blocks still reference
 * previously-allocated ids, or two materials will silently share one atlas cell. */
export function resetCustomTexAllocation() {
  nextCustomTexId = TEX_CUSTOM_START;
}

/**
 * Register a new (or replace an existing) block type at runtime — the material maker's
 * entry point into the engine. Mutates the shared BLOCKS registry in place, so every
 * existing consumer (resolveFace, mesher culling/AO, surface.js, pick.js) sees the new
 * material immediately with zero code changes anywhere else.
 */
export function registerBlock(type, def) {
  BLOCKS[type] = def;
}

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

/**
 * Generic version of atlasUV/atlasCellRect, parameterized by grid shape instead of the fixed
 * global ATLAS_COLS/ROWS/CELL_PX — used by customMaterials.js, where every material gets its
 * OWN small texture/grid (its own "atlas") instead of sharing cells in the one global atlas.
 * Kept separate from atlasUV/atlasCellRect (which stay exactly as-is, cols/rows fixed) so the
 * built-in-material path is zero-risk untouched by the per-material-texture pivot.
 */
export function gridCellPixelRect(index, cols, cellPx) {
  const col = index % cols;
  const row = Math.floor(index / cols);
  return { x: col * cellPx, y: row * cellPx, w: cellPx, h: cellPx };
}

/** Half-texel-inset UV rect for one cell of an arbitrary cols x rows grid of cellPx-sized
 * cells — same bleed-avoidance as atlasUV, generalized to any grid shape/resolution. */
export function computeGridUV(index, cols, rows, cellPx) {
  const { x, y } = gridCellPixelRect(index, cols, cellPx);
  const w = cols * cellPx;
  const h = rows * cellPx;
  const halfX = 0.5 / w;
  const halfY = 0.5 / h;
  return {
    u0: x / w + halfX,
    v0: y / h + halfY,
    u1: (x + cellPx) / w - halfX,
    v1: (y + cellPx) / h - halfY,
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

// --- Material maker atlas editing (browser-only). The renderer accepts any CanvasImageSource
// for its atlas texture, so a mutable <canvas> works as a drop-in replacement for the static
// PNG — draw into it at runtime, then re-upload via renderer.setAtlasImage(canvas) again. ---

/** Like loadAtlasImage, but returns a mutable <canvas> with the atlas already drawn onto it
 * — the material maker draws custom textures into this SAME canvas afterward, then the
 * caller re-uploads it to the renderer (setAtlasImage) each time it changes. */
export async function loadAtlasCanvas(url = 'src/voxel/atlas.png') {
  const source = await loadAtlasImage(url);
  const canvas = document.createElement('canvas');
  canvas.width = ATLAS_PX;
  canvas.height = ATLAS_PX;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(source, 0, 0);
  return canvas;
}

/** Draw an arbitrary image/canvas source into one atlas cell, nearest-neighbor scaled to
 * ATLAS_CELL_PX regardless of the source's native size — the material maker's per-face
 * upload path. Caller is responsible for re-uploading the atlas canvas to the renderer
 * afterward (drawing alone doesn't touch the GPU texture). */
export function drawImageIntoAtlasCell(atlasCtx, image, texId) {
  const { x, y } = atlasCellRect(texId);
  atlasCtx.imageSmoothingEnabled = false;
  atlasCtx.clearRect(x, y, ATLAS_CELL_PX, ATLAS_CELL_PX);
  atlasCtx.drawImage(image, x, y, ATLAS_CELL_PX, ATLAS_CELL_PX);
}

/** Like drawImageIntoAtlasCell, but for a material's own per-material canvas/grid (see
 * gridCellPixelRect/computeGridUV) instead of the one shared atlas. */
export function drawImageIntoGridCell(ctx, image, index, cols, cellPx) {
  const { x, y, w, h } = gridCellPixelRect(index, cols, cellPx);
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(x, y, w, h);
  ctx.drawImage(image, x, y, w, h);
}

/** Read a user-uploaded image File (material maker file input) into an <img>, ready to hand
 * to drawImageIntoAtlasCell. */
export function loadImageFile(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = (e) => {
      URL.revokeObjectURL(url);
      reject(e);
    };
    img.src = url;
  });
}

/** Slice a 4x4 tile sheet image into 16 individual cell-sized canvases, row-major (index 0
 * = sheet's top-left tile ... 15 = bottom-right), for an autotile material's topAutotile
 * upload. The sheet's tile-N position must be authored to represent corner-mask N (bit0=NW
 * corner matches, bit1=NE, bit2=SE, bit3=SW matches this material) — a direct index, not a
 * blob-tileset convention — document this in the material maker UI, not just here. */
export function sliceSheet4x4(image) {
  const cellW = image.width / 4;
  const cellH = image.height / 4;
  const out = [];
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 4; col++) {
      const c = document.createElement('canvas');
      c.width = cellW;
      c.height = cellH;
      const ctx = c.getContext('2d');
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(image, col * cellW, row * cellH, cellW, cellH, 0, 0, cellW, cellH);
      out.push(c);
    }
  }
  return out;
}
