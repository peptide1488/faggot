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

/** Built-in atlas texture ids — packed into src/voxel/atlas.png (see tools/gen_atlas.py). */
export const TEX = {
  GRASS_TOP: 0,
  // 3-course grass column (depth-below-stack-top, same mechanic as dungeon_wall):
  //   depth 0 top block sides → GRASS_SIDE (dirt + grass transition at top of texture)
  //   depth 1 mid            → DIRT (plain)
  //   depth 2+ bottom        → GRASS_BASE (rough grass trim at foot)
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
  // Dungeon wall courses (side view, depth-below-stack-top: cap=0, mid=1, base=2+)
  WALL_CAP: 11,   // top course — brick + weather moulding
  WALL_MID: 12,   // middle course — plain brick
  WALL_BASE: 13,  // bottom course — brick + grass trim
  UNIT: 14,
  GAS: 15,
  // Top-down view of a dungeon wall (looking at the cap from above)
  WALL_TOP: 16,
  // Bottom course of a stacked grass column — default foot when on grass/dirt field
  GRASS_BASE: 17,
  // Rock cliff courses (depth-below-stack-top on sides)
  CLIFF_TOP: 18,   // plateau top (flat rock / lichen)
  CLIFF_SIDE: 19,  // top course face — weathered rim / lighter bands
  CLIFF_MID: 20,   // mid face — stratified rock + cracks
  CLIFF_BASE: 21,  // bottom foot ONLY when neighbor is grass (rock + grass trim)
  // Soft mud (also a foot-transition target for grass stacks)
  MUD: 22,
  // Neighbor-aware grass foot trims (bottom-of-stack sides only — see footByNeighbor)
  GRASS_FOOT_STONE: 23,
  GRASS_FOOT_SAND: 24,
  GRASS_FOOT_MUD: 25,
  CLIFF_FOOT_SAND: 26,
  // Dungeon wall foot trims (brick body + substrate) — WALL_BASE = grass default
  WALL_FOOT_STONE: 27,
  WALL_FOOT_SAND: 28,
  WALL_FOOT_MUD: 29,
  WALL_FOOT_WATER: 30,
  GRASS_FOOT_WATER: 31,
  // Extra cliff feet
  CLIFF_FOOT_STONE: 32,
  CLIFF_FOOT_MUD: 33,
  CLIFF_FOOT_WATER: 34,
  // Stone stack feet (stone body + substrate at foot)
  STONE_FOOT_GRASS: 35,
  STONE_FOOT_SAND: 36,
  STONE_FOOT_MUD: 37,
  STONE_FOOT_WATER: 38,
  STONE_FOOT_DIRT: 39,
};

/** Shared neighbor→foot maps so every multi-course material uses the same substrate keys. */
const FOOT_GRASS = () => ({
  default: TEX.GRASS_BASE,
  grass: TEX.GRASS_BASE,
  dirt: TEX.GRASS_BASE,
  mud: TEX.GRASS_FOOT_MUD,
  sand: TEX.GRASS_FOOT_SAND,
  stone: TEX.GRASS_FOOT_STONE,
  bedrock: TEX.GRASS_FOOT_STONE,
  cliff: TEX.GRASS_FOOT_STONE,
  dungeon_wall: TEX.GRASS_FOOT_STONE,
  water: TEX.GRASS_FOOT_WATER,
});
const FOOT_WALL = () => ({
  default: TEX.WALL_BASE,
  grass: TEX.WALL_BASE,
  dirt: TEX.WALL_BASE,
  mud: TEX.WALL_FOOT_MUD,
  sand: TEX.WALL_FOOT_SAND,
  stone: TEX.WALL_FOOT_STONE,
  bedrock: TEX.WALL_FOOT_STONE,
  cliff: TEX.WALL_FOOT_STONE,
  dungeon_wall: TEX.WALL_FOOT_STONE,
  water: TEX.WALL_FOOT_WATER,
});
// Green grass trim ONLY when the bottom of a cliff stack sits on / next to grass.
// default/dirt/etc. → pure rock (CLIFF_MID); CLIFF_BASE atlas cell is the grass-foot art.
const FOOT_CLIFF = () => ({
  default: TEX.CLIFF_MID,
  grass: TEX.CLIFF_BASE,
  dirt: TEX.CLIFF_MID,
  mud: TEX.CLIFF_FOOT_MUD,
  sand: TEX.CLIFF_FOOT_SAND,
  stone: TEX.CLIFF_FOOT_STONE,
  bedrock: TEX.CLIFF_FOOT_STONE,
  cliff: TEX.CLIFF_MID,
  dungeon_wall: TEX.CLIFF_FOOT_STONE,
  water: TEX.CLIFF_FOOT_WATER,
});
const FOOT_STONE = () => ({
  default: TEX.STONE_FOOT_DIRT,
  grass: TEX.STONE_FOOT_GRASS,
  dirt: TEX.STONE_FOOT_DIRT,
  mud: TEX.STONE_FOOT_MUD,
  sand: TEX.STONE_FOOT_SAND,
  stone: TEX.STONE, // same rock under — plain stone side
  bedrock: TEX.STONE,
  cliff: TEX.STONE,
  dungeon_wall: TEX.STONE,
  water: TEX.STONE_FOOT_WATER,
});

/**
 * Per type: face textures resolved by most-specific-wins fallback (see resolveFace), plus
 * flags { solid, opaque, translucent } and an optional `model` name (see MODELS) for
 * non-cube shapes. `side` may be a single texture id or an array indexed by depth-below-
 * stack-top (per-elevation courses, e.g. a dungeon wall's cap/mid/base).
 */
export const BLOCKS = {
  bedrock: { all: TEX.BEDROCK, solid: true, opaque: true },
  /**
   * Stone column (stack 2+ for foot trims):
   *   sides mid/top → plain STONE
   *   bottom of stack → neighbor-aware foot (grass/sand/mud/water/dirt)
   * Lone 1-high stone stays plain STONE (no foot override).
   */
  stone: {
    all: TEX.STONE,
    top: TEX.STONE,
    side: [TEX.STONE, TEX.STONE, TEX.STONE],
    bottom: TEX.STONE,
    solid: true,
    opaque: true,
    footByNeighbor: FOOT_STONE(),
  },
  // Soft terrain / props carry `hp` so damage_blocks spells (Fireball etc.) can actually hurt
  // something on a fresh map. Hard structure (stone/bedrock/cliff/dungeon_wall) stays without
  // hp = indestructible, matching 5e "Fireball doesn't demolish a stone castle wall".
  //
  // Natural ground (dirt/sand/mud/grass) also carries `threshold` (DMG "damage threshold"
  // object rule — a single cast's total damage below the threshold does NOTHING at all, not
  // partial chip damage) and no fire vulnerability — user ruling 2026-07-21: terrain SHOULD
  // be destructible, but not so easily that one Fireball (avg 28, was doubled to 56 by the old
  // fire-vulnerable grass) excavates its whole blast radius in a single cast (see
  // GATE_TESTBED.md bug #4). threshold 15 stops a stray cantrip (Fire Bolt avg 11) from
  // leaving a mark at all, while a real Fireball still chips real damage every cast — hp 50-60
  // means it now genuinely takes sustained bombardment, not one spell, to crater the ground.
  // Built STRUCTURES (wood/planks/glass/shelf below) keep their old low hp + fire
  // vulnerability unchanged — a wooden door should still burn down easily.
  dirt: { all: TEX.DIRT, solid: true, opaque: true, hp: 50, threshold: 15 },
  sand: { all: TEX.SAND, solid: true, opaque: true, hp: 50, threshold: 15 },
  mud: { all: TEX.MUD, solid: true, opaque: true, hp: 50, threshold: 15 },
  /**
   * Multi-course grass:
   *   top of stack  → GRASS_SIDE (dirt + grass fringe at top of texture)
   *   every mid     → plain DIRT (no baked foot — feet are ONLY via footByNeighbor)
   *   bottom of 2+ stack → exactly one neighbor-aware foot (grass/stone/sand/mud/water)
   * Lone (1-high) grass keeps GRASS_SIDE only.
   */
  grass: {
    top: [TEX.GRASS_TOP, TEX.DIRT, TEX.DIRT],
    // Index 2+ must stay plain mid (DIRT), NOT GRASS_BASE — otherwise a 3+ stack paints a
    // baked transition on an upper course AND a dynamic foot on the true bottom (double feet).
    side: [TEX.GRASS_SIDE, TEX.DIRT, TEX.DIRT],
    bottom: TEX.DIRT,
    solid: true,
    opaque: true,
    footByNeighbor: FOOT_GRASS(),
    hp: 60,
    threshold: 15,
  },
  /**
   * Multi-course cliff: top rim / mid rock / bottom = one dynamic foot only.
   */
  cliff: {
    top: TEX.CLIFF_TOP,
    side: [TEX.CLIFF_SIDE, TEX.CLIFF_MID, TEX.CLIFF_MID],
    bottom: TEX.CLIFF_MID,
    solid: true,
    opaque: true,
    footByNeighbor: FOOT_CLIFF(),
  },
  // `liquid: true` opts a placed instance into voxel/spread.js's flow simulation (gravity-first,
  // decreasing-level lateral spread, source/finite-volume tracking) — a STATIC pool is already
  // fully supported without this flag at all (same rendering path as any translucent block).
  water: { all: TEX.WATER, solid: false, opaque: false, translucent: true, liquid: true },
  // DONE (2026-07-14): a gas/fog cell emits NO GEOMETRY at all (see mesher.js's buildMesh, which
  // skips any block with `def.gas` entirely before the ordinary cube-emission path even runs) —
  // it's rendered purely as a per-fragment volumetric blend (same smoothstep technique the
  // vertical-fog effect already established, just bounded to each connected gas cloud's own 3D
  // box instead of a global Y-band — see renderer.js's setGasVolumes/FS_SRC's gas-volume loop),
  // not a textured (or even flat-tinted) cube. `gasFogColor`/`gasDensity` are the only data this
  // needs; `all` is deliberately absent (nothing ever resolves a face for a gas-flagged block,
  // so there's nothing to set it to). `gas: true` also opts a placed instance into
  // voxel/spread.js's dispersal simulation (spreads into open neighbors, fades when unconfined,
  // stable/never-fading when sealed in a room) — unrelated to the rendering side, just shares
  // the one boolean flag.
  // gasSpreadRadius: 0 — don't let hand-placed fog crawl the map (spells also seed hops=0).
  fog: { gasFogColor: [0.75, 0.8, 0.85], gasDensity: 0.4, solid: false, opaque: false, translucent: true, gas: true, gasSpreadRadius: 0 },
  // Same mechanic as `fog` above, just its own distinct fog color (a visibly greenish poison-
  // cloud tint, not a reused pale-gray mist) so the two read as different clouds at a glance —
  // a ready-to-place gas type for immediate use, alongside the Material Maker's "Gas" checkbox
  // for authoring more with a custom color (no texture upload needed for gas materials at all).
  gas: { gasFogColor: [0.55, 0.85, 0.45], gasDensity: 0.45, solid: false, opaque: false, translucent: true, gas: true, gasSpreadRadius: 0 },
  wood: {
    all: TEX.WOOD, solid: true, opaque: true,
    hp: 20, vulnerable: ['fire'],
  },
  planks: {
    all: TEX.PLANKS, solid: true, opaque: true,
    hp: 25, vulnerable: ['fire'],
  },
  // Full translucent cube (Minecraft-style glass block) — not a window model.
  glass: {
    all: TEX.GLASS, solid: true, opaque: false, translucent: true,
    hp: 8, vulnerable: ['thunder', 'bludgeoning'],
  },
  shelf: {
    front: TEX.BOOKS, all: TEX.PLANKS, solid: true, opaque: true,
    hp: 12, vulnerable: ['fire'],
  },
  /**
   * Full-cube dungeon wall — stack up to 3 high for free course auto-selection
   * (depth-below-stack-top picks side texture):
   *   top block  → WALL_CAP  (brick + weather moulding)
   *   mid block  → WALL_MID  (plain brick)
   *   bottom+    → WALL_BASE (brick + grass trim at foot)
   * Top face uses WALL_TOP (top-down cobble/cap). Use R to rotate facing for thin/corner variants.
   */
  // side: [cap, mid, mid] — never bake WALL_BASE into the course array. Bottom-of-stack
  // sides get exactly one dynamic foot from footByNeighbor (grass/sand/mud/stone/water).
  dungeon_wall: {
    top: TEX.WALL_TOP,
    side: [TEX.WALL_CAP, TEX.WALL_MID, TEX.WALL_MID],
    bottom: TEX.WALL_MID,
    solid: true,
    opaque: true,
    footByNeighbor: FOOT_WALL(),
  },
  dungeon_wall_thin: {
    top: TEX.WALL_TOP,
    side: [TEX.WALL_CAP, TEX.WALL_MID, TEX.WALL_MID],
    bottom: TEX.WALL_MID,
    solid: true,
    opaque: true,
    shape: 'wall_thin_middle',
    footByNeighbor: FOOT_WALL(),
  },
  dungeon_wall_outer: {
    top: TEX.WALL_TOP,
    side: [TEX.WALL_CAP, TEX.WALL_MID, TEX.WALL_MID],
    bottom: TEX.WALL_MID,
    solid: true,
    opaque: true,
    shape: 'wall_thin_outer',
    footByNeighbor: FOOT_WALL(),
  },
  dungeon_wall_corner: {
    top: TEX.WALL_TOP,
    side: [TEX.WALL_CAP, TEX.WALL_MID, TEX.WALL_MID],
    bottom: TEX.WALL_MID,
    solid: true,
    opaque: true,
    shape: 'wall_corner',
    footByNeighbor: FOOT_WALL(),
  },
  dungeon_stairs: {
    top: TEX.WALL_TOP,
    side: [TEX.WALL_CAP, TEX.WALL_MID, TEX.WALL_MID],
    bottom: TEX.WALL_MID,
    solid: true,
    opaque: true,
    shape: 'step',
    footByNeighbor: FOOT_WALL(),
  },
  dungeon_ramp: {
    top: TEX.WALL_TOP,
    side: [TEX.WALL_CAP, TEX.WALL_MID, TEX.WALL_MID],
    bottom: TEX.WALL_MID,
    solid: true,
    opaque: true,
    wedge: 'ramp',
    footByNeighbor: FOOT_WALL(),
  },
  // Stone variants of stair/ramp for outdoor use (no course textures).
  stone_stairs: { all: TEX.STONE, solid: true, opaque: true, shape: 'step' },
  stone_ramp: { all: TEX.STONE, solid: true, opaque: true, wedge: 'ramp' },
  /**
   * Round pillar with depth-course moulding (stack 1–3+ high):
   *   top  → capital / abacus moulding
   *   mid  → plain shaft
   *   base → plinth / torus foot
   * Uses octagonal wedge geometry (not a full cube).
   */
  dungeon_pillar: {
    top: TEX.WALL_TOP,
    side: [TEX.WALL_CAP, TEX.WALL_MID, TEX.WALL_BASE],
    bottom: TEX.WALL_BASE,
    solid: true,
    opaque: true,
    wedge: ['pillar_cap8', 'pillar_mid8', 'pillar_base8'],
  },
  stone_pillar: {
    all: TEX.STONE,
    solid: true,
    opaque: true,
    wedge: ['pillar_cap8', 'pillar_mid8', 'pillar_base8'],
  },
  // Single-cell full pillar (base + shaft + capital in one block) — place alone, don't stack.
  dungeon_pillar_single: {
    top: TEX.WALL_TOP,
    side: TEX.WALL_MID,
    bottom: TEX.WALL_BASE,
    solid: true,
    opaque: true,
    wedge: 'pillar_full8',
  },
  stone_pillar_single: {
    all: TEX.STONE,
    solid: true,
    opaque: true,
    wedge: 'pillar_full8',
  },
  door: { all: TEX.PLANKS, solid: true, opaque: false, model: 'door' },
  door_open: { all: TEX.PLANKS, solid: false, opaque: false, model: 'door_open' },
  // Framed window: wood frame + glass lights (see MODELS.window). Facing = wall normal.
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
    // Bright enough to read in day as a warm pool and dominate dungeon ambient.
    light: { radius: 7, color: [1, 0.62, 0.28], intensity: 2.4 },
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
  // Closed door: thin panel in the E–W plane, flush to the NORTH edge of the cell when facing N.
  // Facing is the outward normal of the wall the door sits in (same as torch wall-snap).
  // 2 blocks tall so it fills a standard doorway under a lintel.
  door: [{ from: [0.01, 0.02, 0.02], to: [0.99, 0.14, 1.98], faces: { all: TEX.PLANKS } }],
  // Open: swung 90° against the east jamb (thin along E–W, spans N–S).
  door_open: [{ from: [0.86, 0.01, 0.02], to: [0.98, 0.99, 1.98], faces: { all: TEX.PLANKS } }],
  /**
   * Framed casement window — canonical facing N (thin along N–S, sits in an E–W wall plane).
   * Wood frame (stiles / sill / lintel / mullions) + 4 glass lights.
   */
  window: [
    // West stile
    { from: [0.06, 0.42, 0.10], to: [0.16, 0.58, 0.90], faces: { all: TEX.PLANKS } },
    // East stile
    { from: [0.84, 0.42, 0.10], to: [0.94, 0.58, 0.90], faces: { all: TEX.PLANKS } },
    // Sill
    { from: [0.06, 0.40, 0.08], to: [0.94, 0.60, 0.18], faces: { all: TEX.PLANKS } },
    // Lintel
    { from: [0.06, 0.40, 0.82], to: [0.94, 0.60, 0.92], faces: { all: TEX.PLANKS } },
    // Vertical mullion
    { from: [0.46, 0.44, 0.18], to: [0.54, 0.56, 0.82], faces: { all: TEX.PLANKS } },
    // Horizontal mullion
    { from: [0.16, 0.44, 0.46], to: [0.84, 0.56, 0.54], faces: { all: TEX.PLANKS } },
    // Four glass lights (thin pane in the wall plane)
    { from: [0.16, 0.47, 0.18], to: [0.46, 0.53, 0.46], faces: { all: TEX.GLASS } },
    { from: [0.54, 0.47, 0.18], to: [0.84, 0.53, 0.46], faces: { all: TEX.GLASS } },
    { from: [0.16, 0.47, 0.54], to: [0.46, 0.53, 0.82], faces: { all: TEX.GLASS } },
    { from: [0.54, 0.47, 0.54], to: [0.84, 0.53, 0.82], faces: { all: TEX.GLASS } },
  ],
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
  // 4-tread stair within one block of rise — facing = ascent direction (Minecraft-style).
  // Canonical N: low at south, high at north — climb walking north. Each tread is 1/4 cell.
  // Inset slightly so coplanar neighbors don't z-fight.
  step: [
    { from: [0.02, 0.02, 0.00], to: [0.98, 0.98, 0.25] }, // full bottom tread
    { from: [0.02, 0.02, 0.25], to: [0.98, 0.75, 0.50] }, // skip south quarter
    { from: [0.02, 0.02, 0.50], to: [0.98, 0.50, 0.75] },
    { from: [0.02, 0.02, 0.75], to: [0.98, 0.26, 0.98] }, // north quarter only (top)
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

/**
 * Wedge/ramp geometry — a right triangular-prism ramp. Facing = ascent direction
 * (Minecraft-style, same as SHAPES.step): canonical N has the HIGH edge on the north
 * (front) and the LOW/open edge on the south — climb walking north.
 *
 * Each entry is a list of faces; each face is a canonical (facing=N) quad given as 4 explicit
 * `{ pos:[x,y,z], u, v }` corners (u/v are 0..1 FRACTIONS across that face's own texture cell —
 * see mesher.js's uvCornerFromFrac — not absolute atlas coordinates) rather than a `from`/`to`
 * box: the mesher can't derive a slanted face's corners/UV from a simple axis-aligned range the
 * way SHAPES/MODELS do. A genuinely TRIANGULAR face (the wedge's two vertical end caps, east/
 * west) is written as a quad with its last corner repeating the 3rd — mesher.js's `pushQuad`
 * always builds 2 triangles from a quad's 4 corners; repeating a corner makes one of the two
 * triangles degenerate (zero area, harmless) and the other exactly the intended triangle, so no
 * separate triangle-emission code path is needed anywhere in the mesher/renderer.
 *
 * Corner order/winding for every face below was hand-derived via cross product to match this
 * engine's own CCW-from-outward-normal convention (see FACE_VERTS' own doc comment) — mesher.js
 * computes each face's real normal FROM these corners at mesh-build time (not a FACE_AO lookup
 * table, since the ramp surface genuinely isn't axis-aligned), so getting the winding right here
 * is what makes both backface culling and lighting/fresnel correct.
 *
 * Round/cylindrical shapes (barrels, round columns): see makeRoundedPrism below — turns out
 * this needed no new primitive at all, just a programmatic N-gon generator emitting the exact
 * same `{face, quad}` shape by hand-authored WEDGES entries use; a regular octagon (or any N)
 * inscribed in the unit-cube footprint approximates "round" well enough at this voxel scale, the
 * same technique most voxel engines use for barrels/pillars. No depth-indexed variant (unlike
 * SHAPES' column_cap/mid/base) — ramps aren't typically stacked with varying courses.
 */
// Solid right-triangular prism: HIGH edge at north (y=0), LOW at south (y=1).
// Facing = ascent = walk toward the high edge. All windings CCW from outside.
const RAMP_FACES = [
  // Bottom (−z)
  { face: 'bottom', quad: [
    { pos: [0, 0, 0], u: 0, v: 0 }, { pos: [0, 1, 0], u: 0, v: 1 },
    { pos: [1, 1, 0], u: 1, v: 1 }, { pos: [1, 0, 0], u: 1, v: 0 },
  ] },
  // High wall on north (−y) — full height, abuts the block you climb onto
  { face: 'north', quad: [
    { pos: [0, 0, 0], u: 0, v: 0 }, { pos: [1, 0, 0], u: 1, v: 0 },
    { pos: [1, 0, 1], u: 1, v: 1 }, { pos: [0, 0, 1], u: 0, v: 1 },
  ] },
  // East (+x) triangular cap: high at y=0, floor at y=1
  { face: 'east', quad: [
    { pos: [1, 0, 0], u: 0, v: 0 }, { pos: [1, 1, 0], u: 1, v: 0 },
    { pos: [1, 0, 1], u: 0, v: 1 }, { pos: [1, 0, 1], u: 0, v: 1 },
  ] },
  // West (−x) triangular cap
  { face: 'west', quad: [
    { pos: [0, 0, 0], u: 0, v: 0 }, { pos: [0, 0, 1], u: 0, v: 1 },
    { pos: [0, 1, 0], u: 1, v: 0 }, { pos: [0, 1, 0], u: 1, v: 0 },
  ] },
  // Slanted walk surface: z = 1−y (high north → low south). Normal ≈ (0, +y, +z).
  { face: 'top', quad: [
    { pos: [0, 0, 1], u: 0, v: 0 }, { pos: [1, 0, 1], u: 1, v: 0 },
    { pos: [1, 1, 0], u: 1, v: 1 }, { pos: [0, 1, 0], u: 0, v: 1 },
  ] },
];

/**
 * Generate a WEDGES-style face list approximating a round column/barrel as a regular N-sided
 * prism, centered in the unit-cube footprint (cx=cy=0.5) — reuses def.wedge's existing
 * arbitrary-vertex quad emission (mesher.js) completely unchanged; a prism's side/cap quads are
 * built from explicit corners exactly the way the hand-authored `ramp` above already is, just
 * computed instead of typed out one-by-one.
 *
 * `profile` is a list of `[z, radius]` control points, z ascending 0..1 — two points (equal
 * radius) makes a straight column; more points can taper/bulge per tier (see barrel8's
 * narrow-bottom / bulge-middle / narrow-top silhouette). Side quads connect every consecutive
 * pair of rings (so a multi-tier profile needs no separate cap between tiers, only at the very
 * first/last ring); each side quad's `face` is whichever of the 4 canonical directions its
 * outward normal is nearest — the same "approximate against the nearest canonical face" rule
 * SHAPES/other WEDGES already use for AO/ambient sampling (see mesher.js's def.wedge branch) —
 * so texture/AO resolution needs no changes to support this.
 *
 * Winding for every quad below was verified via the same cross-product-sign check the ramp's
 * hand-authored corners were checked against (side quads: [lo0, lo1, hi1, hi0] gives an
 * outward-pointing normal for a CCW-ordered ring; caps: [center, p_i, p_i+1, p_i+1] for the top
 * ring points +z, the reversed order [center, p_i+1, p_i, p_i] for the bottom ring points -z).
 */
function makeRoundedPrism(sides, profile) {
  const cx = 0.5;
  const cy = 0.5;
  const ringAt = (radius) => {
    const pts = [];
    for (let i = 0; i < sides; i++) {
      const angle = (i / sides) * Math.PI * 2;
      pts.push([cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)]);
    }
    return pts;
  };
  const rings = profile.map(([z, radius]) => ({ z, radius, points: ringAt(radius) }));
  const faces = [];

  for (let t = 0; t < rings.length - 1; t++) {
    const lo = rings[t];
    const hi = rings[t + 1];
    for (let i = 0; i < sides; i++) {
      const [x0, y0] = lo.points[i];
      const [x1, y1] = lo.points[(i + 1) % sides];
      const [hx0, hy0] = hi.points[i];
      const [hx1, hy1] = hi.points[(i + 1) % sides];
      const midX = (x0 + x1) / 2 - cx;
      const midY = (y0 + y1) / 2 - cy;
      const faceName = Math.abs(midX) > Math.abs(midY) ? (midX > 0 ? 'east' : 'west') : (midY > 0 ? 'south' : 'north');
      const u0 = i / sides;
      const u1 = (i + 1) / sides;
      // V uses absolute cell height (lo.z/hi.z in 0..1), NOT 0/1 per ring pair — so a
      // multi-tier moulding profile samples the texture once down the shaft instead of
      // stretching the full texture onto every thin ring (zebra banding).
      faces.push({ face: faceName, quad: [
        { pos: [x0, y0, lo.z], u: u0, v: lo.z },
        { pos: [x1, y1, lo.z], u: u1, v: lo.z },
        { pos: [hx1, hy1, hi.z], u: u1, v: hi.z },
        { pos: [hx0, hy0, hi.z], u: u0, v: hi.z },
      ] });
    }
  }

  const capUV = (coord, center, radius) => (radius < 1e-6 ? 0.5 : (coord - center) / (2 * radius) + 0.5);
  const first = rings[0];
  for (let i = 0; i < sides; i++) {
    const [x0, y0] = first.points[i];
    const [x1, y1] = first.points[(i + 1) % sides];
    faces.push({ face: 'bottom', quad: [
      { pos: [cx, cy, first.z], u: 0.5, v: 0.5 },
      { pos: [x1, y1, first.z], u: capUV(x1, cx, first.radius), v: capUV(y1, cy, first.radius) },
      { pos: [x0, y0, first.z], u: capUV(x0, cx, first.radius), v: capUV(y0, cy, first.radius) },
      { pos: [x0, y0, first.z], u: capUV(x0, cx, first.radius), v: capUV(y0, cy, first.radius) },
    ] });
  }
  const last = rings[rings.length - 1];
  for (let i = 0; i < sides; i++) {
    const [x0, y0] = last.points[i];
    const [x1, y1] = last.points[(i + 1) % sides];
    faces.push({ face: 'top', quad: [
      { pos: [cx, cy, last.z], u: 0.5, v: 0.5 },
      { pos: [x0, y0, last.z], u: capUV(x0, cx, last.radius), v: capUV(y0, cy, last.radius) },
      { pos: [x1, y1, last.z], u: capUV(x1, cx, last.radius), v: capUV(y1, cy, last.radius) },
      { pos: [x1, y1, last.z], u: capUV(x1, cx, last.radius), v: capUV(y1, cy, last.radius) },
    ] });
  }
  return faces;
}

// Shaft radius for stacked round pillars (fits inside the cell with room for moulding rings).
const PILLAR_SHAFT_R = 0.22;
const PILLAR_PLINTH_R = 0.38;
const PILLAR_CAP_R = 0.36;

export const WEDGES = {
  ramp: RAMP_FACES,
  // Straight octagon — full-cell radius (legacy / fat post).
  column8: makeRoundedPrism(8, [[0, 0.5], [1, 0.5]]),
  // Barrel silhouette — narrow base/lid, bulge mid.
  barrel8: makeRoundedPrism(8, [[0, 0.35], [0.15, 0.42], [0.5, 0.5], [0.85, 0.42], [1, 0.35]]),
  // --- Course-stacked round pillars (use with wedge: ['pillar_cap8','pillar_mid8','pillar_base8']) ---
  // Base: wide plinth + torus step into shaft
  pillar_base8: makeRoundedPrism(8, [
    [0.0, PILLAR_PLINTH_R],
    [0.1, PILLAR_PLINTH_R],
    [0.14, PILLAR_PLINTH_R * 0.92],
    [0.2, PILLAR_SHAFT_R + 0.04],
    [0.28, PILLAR_SHAFT_R],
    [1.0, PILLAR_SHAFT_R],
  ]),
  // Mid: plain cylindrical shaft
  pillar_mid8: makeRoundedPrism(8, [
    [0.0, PILLAR_SHAFT_R],
    [1.0, PILLAR_SHAFT_R],
  ]),
  // Cap: shaft into echinus / abacus capital moulding
  pillar_cap8: makeRoundedPrism(8, [
    [0.0, PILLAR_SHAFT_R],
    [0.55, PILLAR_SHAFT_R],
    [0.68, PILLAR_SHAFT_R + 0.04],
    [0.78, PILLAR_CAP_R * 0.85],
    [0.88, PILLAR_CAP_R],
    [0.94, PILLAR_CAP_R],
    [1.0, PILLAR_CAP_R * 0.92],
  ]),
  // One-block pillar: plinth + shaft + capital (don't stack these)
  pillar_full8: makeRoundedPrism(8, [
    [0.0, PILLAR_PLINTH_R],
    [0.08, PILLAR_PLINTH_R],
    [0.12, PILLAR_PLINTH_R * 0.9],
    [0.18, PILLAR_SHAFT_R + 0.03],
    [0.28, PILLAR_SHAFT_R],
    [0.72, PILLAR_SHAFT_R],
    [0.8, PILLAR_SHAFT_R + 0.04],
    [0.88, PILLAR_CAP_R * 0.88],
    [0.94, PILLAR_CAP_R],
    [1.0, PILLAR_CAP_R * 0.9],
  ]),
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

const FACE_HORIZ_OFFSET = {
  north: [0, -1],
  south: [0, 1],
  east: [1, 0],
  west: [-1, 0],
};

/** True when (c,r,z) has no same-type solid directly below it. */
export function isBottomOfTypeStack(store, c, r, z, type) {
  const below = store.get(c, r, z - 1);
  if (!below) return true;
  return parseBlock(below).type !== type;
}

/** Contiguous same-type height including this cell. */
export function typeStackHeight(store, c, r, z, type) {
  let top = z;
  let bot = z;
  for (;;) {
    const above = store.get(c, r, top + 1);
    if (!above || parseBlock(above).type !== type) break;
    top++;
  }
  for (;;) {
    const below = store.get(c, r, bot - 1);
    if (!below || parseBlock(below).type !== type) break;
    bot--;
  }
  return top - bot + 1;
}

/**
 * Pick a foot-trim texture for a bottom-of-stack side face from def.footByNeighbor.
 *
 * Neighbor priority:
 *  1. Block directly under this cell (c,r,z-1) if it has a map entry
 *  2. Else block under the face-adjacent cell (c±1,r±1,z-1) — so a grass column on dirt
 *     at a sand shoreline still gets sand feet on the sand-facing side
 *  3. Else footByNeighbor.default
 *  4. Else null (caller falls back to normal course side texture)
 */
export function pickFootTexture(def, store, c, r, z, faceName) {
  const map = def && def.footByNeighbor;
  if (!map) return null;

  const typeAt = (cc, rr, zz) => {
    const b = store.get(cc, rr, zz);
    return b ? parseBlock(b).type : null;
  };

  const under = typeAt(c, r, z - 1);
  const off = FACE_HORIZ_OFFSET[faceName];
  const besideUnder = off ? typeAt(c + off[0], r + off[1], z - 1) : null;
  // Same-level neighbor beside the foot (wall of stone next to grass stack)
  const beside = off ? typeAt(c + off[0], r + off[1], z) : null;

  // Prefer *specific* substrates (stone/sand/mud) over generic dirt/grass. Among the same
  // specificity, prefer directly under → under face-adjacent → same-level beside.
  const isGeneric = (t) => t === 'dirt' || t === 'grass';
  const scored = [];
  const consider = (key, basePri) => {
    if (key == null || map[key] == null) return;
    scored.push({ key, score: (isGeneric(key) ? 0 : 10) + basePri });
  };
  consider(under, 3);
  consider(besideUnder, 2);
  consider(beside, 1);
  scored.sort((a, b) => b.score - a.score);
  if (scored.length > 0) return map[scored[0].key];
  if (map.default != null) return map.default;
  return null;
}

/**
 * Resolve which atlas texture id a specific absolute face of a block instance shows.
 * opts.facing: FACING index (default N=0) — only matters for blocks with relative face keys.
 * opts.depth: how far below the top of a same-type vertical stack this block sits (default 0)
 *   — only matters for blocks whose `side` is an array (per-elevation courses).
 * opts.store/c/r/z: when set with a def.footByNeighbor map, bottom-of-multi-stack SIDE faces
 *   pick a foot trim texture from the material under/beside this cell (grass→stone etc.).
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

  // Neighbor-aware foot trim on bottom-of-stack sides.
  // Grass/wall/stone: multi-block stacks only (lone surface grass keeps GRASS_SIDE top fringe).
  // Cliff: also allow 1-high so a single cliff block on grass still gets a grass foot.
  if (
    def.footByNeighbor &&
    opts.store &&
    opts.c != null &&
    opts.r != null &&
    opts.z != null &&
    FACE_HORIZ_OFFSET[face]
  ) {
    const { store, c, r, z } = opts;
    const minStack = typeName === 'cliff' ? 1 : 2;
    if (
      isBottomOfTypeStack(store, c, r, z, typeName) &&
      typeStackHeight(store, c, r, z, typeName) >= minStack
    ) {
      const foot = pickFootTexture(def, store, c, r, z, face);
      if (foot != null) return foot;
    }
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

// --- Built-in atlas: 8×8 grid of 32px cells → 256×256 PNG at src/voxel/atlas.png.
// Regenerate with: python tools/gen_atlas.py
// Mesher only ever sees TEX ids via atlasUV() — regenerating art doesn't touch geometry. ---

export const ATLAS_COLS = 8;
export const ATLAS_ROWS = 8;
export const ATLAS_CELL_PX = 32;
export const ATLAS_PX = ATLAS_COLS * ATLAS_CELL_PX;

// Reserved: 0-39 built-in (STONE_FOOT_DIRT = 39). Custom materials allocate from 40.
export const TEX_CUSTOM_START = 40;
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
  [TEX.GAS]: 'rgba(120,200,110,0.4)',
  [TEX.WALL_TOP]: '#6a6a6a',
  [TEX.GRASS_BASE]: '#3d6b32',
  [TEX.CLIFF_TOP]: '#a89e8c',
  [TEX.CLIFF_SIDE]: '#a89e8c',
  [TEX.CLIFF_MID]: '#6e6458',
  [TEX.CLIFF_BASE]: '#6e6458',
  [TEX.MUD]: '#3a2e22',
  [TEX.GRASS_FOOT_STONE]: '#5a5850',
  [TEX.GRASS_FOOT_SAND]: '#c4b47a',
  [TEX.GRASS_FOOT_MUD]: '#3a2e22',
  [TEX.CLIFF_FOOT_SAND]: '#b8a86a',
  [TEX.WALL_FOOT_STONE]: '#6a6a6a',
  [TEX.WALL_FOOT_SAND]: '#c4b47a',
  [TEX.WALL_FOOT_MUD]: '#3a2e22',
  [TEX.WALL_FOOT_WATER]: '#3a6a8a',
  [TEX.GRASS_FOOT_WATER]: '#3a6a5a',
  [TEX.CLIFF_FOOT_STONE]: '#5a564e',
  [TEX.CLIFF_FOOT_MUD]: '#3a2e22',
  [TEX.CLIFF_FOOT_WATER]: '#3a5a6a',
  [TEX.STONE_FOOT_GRASS]: '#4a9c3e',
  [TEX.STONE_FOOT_SAND]: '#d9c98a',
  [TEX.STONE_FOOT_MUD]: '#3a2e22',
  [TEX.STONE_FOOT_WATER]: '#3a6a7a',
  [TEX.STONE_FOOT_DIRT]: '#6b4a2f',
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

/**
 * Convert a grayscale height/bump image into a tangent-space normal map (browser-only, canvas
 * pixel processing — same "browser-only" carve-out as drawPlaceholderAtlas/sliceSheet4x4 above)
 * via a simple central-difference gradient, so the Material Maker's "Normal/bump map" upload
 * can accept either a real tangent-space normal image OR a simpler height/bump map and produce
 * the SAME runtime representation either way — the renderer/shader only ever deals with one
 * normal-map format, never branches on which the user actually uploaded (see
 * CONTENT_TOOLS_PLAN.md's emissive/normal-map section).
 * `strength` scales how pronounced the perceived bumpiness is (the gradient magnitude), not the
 * image's own brightness.
 */
export function bumpToNormalMap(bumpImage, strength = 1) {
  const w = bumpImage.naturalWidth || bumpImage.width;
  const h = bumpImage.naturalHeight || bumpImage.height;
  const src = document.createElement('canvas');
  src.width = w;
  src.height = h;
  const sctx = src.getContext('2d');
  sctx.drawImage(bumpImage, 0, 0, w, h);
  const heightData = sctx.getImageData(0, 0, w, h).data;
  const heightAt = (x, y) => {
    const cx = Math.max(0, Math.min(w - 1, x));
    const cy = Math.max(0, Math.min(h - 1, y));
    return heightData[(cy * w + cx) * 4] / 255; // red channel as grayscale height
  };
  const out = document.createElement('canvas');
  out.width = w;
  out.height = h;
  const octx = out.getContext('2d');
  const img = octx.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (heightAt(x + 1, y) - heightAt(x - 1, y)) * strength;
      const dy = (heightAt(x, y + 1) - heightAt(x, y - 1)) * strength;
      // Tangent-space normal from a height gradient: (-dx, -dy, 1), normalized, encoded 0..255
      // (0.5-centered per channel = "no perturbation", matching FS_SRC's `* 2.0 - 1.0` unpack).
      const nx = -dx;
      const ny = -dy;
      const nz = 1;
      const len = Math.hypot(nx, ny, nz) || 1;
      const i = (y * w + x) * 4;
      img.data[i] = Math.round(((nx / len) * 0.5 + 0.5) * 255);
      img.data[i + 1] = Math.round(((ny / len) * 0.5 + 0.5) * 255);
      img.data[i + 2] = Math.round(((nz / len) * 0.5 + 0.5) * 255);
      img.data[i + 3] = 255;
    }
  }
  octx.putImageData(img, 0, 0);
  return out;
}
