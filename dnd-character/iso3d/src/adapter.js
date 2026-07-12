/**
 * Convert Grimoire (dnd-character) battle state → Iso3D map/units.
 * Presentation only — no rules.
 */

import { TERRAIN, createMap } from './map.js?v=0.5.62';
import { DIR_ORDER_8 } from './pathfinding.js?v=0.5.62';

/** Grimoire terrain key → Iso3D TERRAIN id */
export const GRIMOIRE_TERRAIN_MAP = {
  grass: TERRAIN.GRASS,
  stone: TERRAIN.CLIFF,
  wood: TERRAIN.DIRT,
  sand: TERRAIN.SAND,
  snow: TERRAIN.SAND,
  mud: TERRAIN.MUD,
  rubble: TERRAIN.DIRT,
  water: TERRAIN.WATER,
  brush: TERRAIN.GRASS,
  fog: TERRAIN.SAND,
  ice: TERRAIN.SAND,
  acid: TERRAIN.MUD,
  caltrops: TERRAIN.DIRT,
  lava: TERRAIN.CLIFF,
  wall: TERRAIN.CLIFF,       // full dungeon wall (tall)
  cave_wall: TERRAIN.CLIFF,  // natural cave rock (tall, distinct texture)
  low_wall: TERRAIN.CLIFF,   // outdoor parapet (shorter height below)
  window: TERRAIN.CLIFF,     // wall gap that lets light through (still solid, shorter)
  void: TERRAIN.VOID, // pit/chasm visual; walkability is Grimoire's job
  pit: TERRAIN.VOID,
  grease: TERRAIN.MUD,
  web: TERRAIN.SAND,
  floor: TERRAIN.GRASS,
};

/**
 * Canonical walk-sheet layout (RPG Maker / RPM / most tactics packs).
 * Host samples: row = facing, col = walk frame.
 *
 *   cols: 4   → walk cycle (0 = idle, 1–3 = steps)
 *   rows: 4   → facing down, left, right, up (top → bottom)
 *   anchor: feet at bottom-center of each cell
 *   filter: nearest-neighbor
 *
 * Drop a PNG matching this grid and list it in DEFAULT_SPRITE_PATHS /
 * DEFAULT_SPRITE_DRAW — no renderer rewrite needed.
 */
export const SPRITE_SHEET_SPEC = {
  cols: 4,
  rows: 4,
  dirOrder: ['down', 'left', 'right', 'up'],
  /** Column used while standing still (gentle idle bob may still use 0–1). */
  idleCol: 0,
  /** Walk: cycle columns at ~2 frames per tile. */
  walkFpsHint: 8,
  /** Feet anchor (0–1 within frame). */
  anchor: { x: 0.5, y: 1.0 },
};

/**
 * Art pack for units.
 * - 'hq'  = FFT-style art under sprites/hq/ (default). Missing keys use HQ
 *           stand-ins (fighter / goblin) so the field stays consistent.
 * - 'rpm' = Paper Maker BR only (opt-in; not the default)
 *
 * Terrain/decor have their own paths. Walk/facing sampling is always on —
 * when HQ sheets are still single-pose stubs, motion reads via bob until
 * real multi-frame sheets replace them (see SPRITE_PIPELINE.md).
 */
export let SPRITE_PACK = 'hq';

/** Keys that exist under sprites/hq/ (expand when you add art). */
export const HQ_CHARACTER_KEYS = new Set([
  'fighter',
  'paladin',
  'barbarian',
  'human',
]);
export const HQ_MONSTER_KEYS = new Set(['goblin']);

/** Relative path for a unit key under a pack root. */
export function spritePathFor(key, kind = 'character', pack = 'rpm') {
  const folder = kind === 'monster' ? 'monsters' : 'characters';
  if (pack === 'hq') return `sprites/hq/${folder}/${key}.png`;
  return `sprites/${folder}/${key}.png`;
}

/**
 * Resolve sheet path. HQ pack paints FFT-style; stand-in for missing keys.
 */
export function resolveSpritePath(key, kind = 'character') {
  const k = (key || '').toLowerCase();
  if (SPRITE_PACK === 'rpm') {
    return (
      DEFAULT_SPRITE_PATHS[k] ||
      (kind === 'monster'
        ? DEFAULT_SPRITE_PATHS.goblin
        : DEFAULT_SPRITE_PATHS.fighter)
    );
  }
  // hq (default)
  if (kind === 'monster') {
    if (HQ_MONSTER_KEYS.has(k)) return spritePathFor(k, 'monster', 'hq');
    return spritePathFor('goblin', 'monster', 'hq');
  }
  if (HQ_CHARACTER_KEYS.has(k)) return spritePathFor(k, 'character', 'hq');
  return spritePathFor('fighter', 'character', 'hq');
}

/** Grimoire class/monster sprite key → sheet path (RPM default). */
export const DEFAULT_SPRITE_PATHS = {
  fighter: 'sprites/characters/fighter.png',
  barbarian: 'sprites/characters/barbarian.png',
  paladin: 'sprites/characters/paladin.png',
  ranger: 'sprites/characters/ranger.png',
  rogue: 'sprites/characters/rogue.png',
  monk: 'sprites/characters/monk.png',
  bard: 'sprites/characters/bard.png',
  cleric: 'sprites/characters/cleric.png',
  druid: 'sprites/characters/druid.png',
  wizard: 'sprites/characters/wizard.png',
  sorcerer: 'sprites/characters/sorcerer.png',
  warlock: 'sprites/characters/warlock.png',
  artificer: 'sprites/characters/artificer.png',
  skeleton: 'sprites/monsters/skeleton.png',
  zombie: 'sprites/monsters/zombie.png',
  spider: 'sprites/monsters/spider.png',
  ogre: 'sprites/monsters/ogre.png',
  demon: 'sprites/monsters/demon.png',
  slime: 'sprites/monsters/slime.png',
  goblin: 'sprites/monsters/goblin.png',
  ghost: 'sprites/monsters/ghost.png',
  wolf: 'sprites/monsters/wolf.png',
  human: 'sprites/monsters/human.png',
  orc: 'sprites/monsters/orc.png',
  bear: 'sprites/monsters/bear.png',
  snake: 'sprites/monsters/snake.png',
  bat: 'sprites/monsters/bat.png',
  rat: 'sprites/monsters/rat.png',
  harpy: 'sprites/monsters/harpy.png',
  imp: 'sprites/monsters/imp.png',
  specter: 'sprites/monsters/specter.png',
  mushroom: 'sprites/monsters/mushroom.png',
};

/**
 * Per-key draw + sheet layout overrides.
 * Always set cols/rows/dirOrder to match the PNG (see SPRITE_SHEET_SPEC).
 */
export const DEFAULT_SPRITE_DRAW = {
  fighter: { targetFrameH: 64, pixelPerfect: true, cols: 4, rows: 4, dirOrder: SPRITE_SHEET_SPEC.dirOrder },
  paladin: { targetFrameH: 64, pixelPerfect: true, cols: 4, rows: 4, dirOrder: SPRITE_SHEET_SPEC.dirOrder },
  barbarian: { targetFrameH: 66, pixelPerfect: true, cols: 4, rows: 4, dirOrder: SPRITE_SHEET_SPEC.dirOrder },
  human: { targetFrameH: 60, pixelPerfect: true, cols: 4, rows: 4, dirOrder: SPRITE_SHEET_SPEC.dirOrder },
  goblin: { targetFrameH: 48, pixelPerfect: true, cols: 4, rows: 4, dirOrder: SPRITE_SHEET_SPEC.dirOrder },
  wizard: { targetFrameH: 56, pixelPerfect: true, cols: 4, rows: 4, dirOrder: SPRITE_SHEET_SPEC.dirOrder },
  rogue: { targetFrameH: 56, pixelPerfect: true, cols: 4, rows: 4, dirOrder: SPRITE_SHEET_SPEC.dirOrder },
  cleric: { targetFrameH: 56, pixelPerfect: true, cols: 4, rows: 4, dirOrder: SPRITE_SHEET_SPEC.dirOrder },
  ranger: { targetFrameH: 56, pixelPerfect: true, cols: 4, rows: 4, dirOrder: SPRITE_SHEET_SPEC.dirOrder },
  spider: { targetFrameH: 44, pixelPerfect: true, cols: 4, rows: 2, dirOrder: ['down', 'right', 'left', 'up'] },
  // True 8-direction sheets: 1 col (single pose per direction, no walk cycle yet),
  // 8 rows in DIR_ORDER_8's order. Diagonal movement now shows an actual diagonal
  // facing instead of snapping to whichever cardinal axis dominated the step.
  wiz: { targetFrameH: 56, pixelPerfect: true, cols: 1, rows: 8, dirOrder: DIR_ORDER_8 },
  wizard_purple: { targetFrameH: 56, pixelPerfect: true, cols: 1, rows: 8, dirOrder: DIR_ORDER_8 },
};

/**
 * Only side-view / freestanding props. Objects3D cube UV atlases (chest, barrel,
 * fence, tent…) look like purple garbage as billboards — never draw those.
 */
export const DEFAULT_DECOR_PATHS = {
  // Pixelized from HQ art (not RPM Paper Maker scrap). ~terrain tile density, nearest-neighbor.
  tree: 'sprites/hq/decor/tree_px.png',
  tree2: 'sprites/hq/decor/tree2_px.png',
  tree_dead: 'sprites/hq/decor/tree_dead_px.png',
  tree_snow: 'sprites/hq/decor/tree_px.png',
  jungle_tree: 'sprites/hq/decor/tree_px.png',
  jungle_tree2: 'sprites/hq/decor/tree2_px.png',
  bush: 'sprites/hq/decor/bush_px.png',
  bush2: 'sprites/hq/decor/bush_px.png',
  bush3: 'sprites/hq/decor/bush_px.png',
  bush_snow: 'sprites/hq/decor/bush_px.png',
  jungle_bush: 'sprites/hq/decor/bush_px.png',
  rock: 'sprites/decor/rock.png',
  stump: 'sprites/decor/stump.png',
  log: 'sprites/decor/log.png',
  mushroom: 'sprites/decor/mushroom.png',
  crystal: 'sprites/decor/crystal.png',
  ore: 'sprites/decor/ore.png',
  torch: 'sprites/decor/campfire.png',
  campfire: 'sprites/decor/campfire.png',
  torch_unlit: 'sprites/decor/stump.png',
  // Interactables (Mage Hand / Use) — nearest existing prop art
  door: 'sprites/decor/door.png',
  door_open: 'sprites/decor/door_open.png',
  grate: 'sprites/decor/grate.png',
  grate_open: 'sprites/decor/grate_open.png',
  plank: 'sprites/decor/log.png',
  loose_rock: 'sprites/decor/rocks.png',
  lever: 'sprites/decor/sign_post.png',
  switch: 'sprites/decor/sign.png',
  trap: 'sprites/decor/trap.png',
  trap_safe: 'sprites/decor/trap_safe.png',
  cauldron: 'sprites/decor/cauldron.png',
  cauldron_tipped: 'sprites/decor/cauldron_tipped.png',
  bell: 'sprites/decor/crystal.png',
  drawbridge: 'sprites/decor/log.png',
  drawbridge_down: 'sprites/decor/log.png',
  oil_barrel: 'sprites/decor/oil_barrel.png',
  acid_barrel: 'sprites/decor/acid_barrel.png',
  powder_barrel: 'sprites/decor/powder_barrel.png',
};

/** Keys safe for Iso3D billboards (subset of DEFAULT_DECOR_PATHS). */
export const ISO3D_BILLBOARD_DECOR = new Set(Object.keys(DEFAULT_DECOR_PATHS));

/**
 * @param {{ cols:number, rows:number, tiles?:Record<string,string>, height?:Record<string,number>, decor?:Record<string,string> }} gMap
 */
export function grimoireMapToIso(gMap) {
  const cols = gMap.cols | 0;
  const rows = gMap.rows | 0;
  const map = createMap(cols, rows, 0, TERRAIN.GRASS);
  const tiles = gMap.tiles || {};
  const height = gMap.height || {};

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const key = `${c},${r}`;
      const cell = map.cells[r * cols + c];
      const tName = tiles[key] || 'grass';
      const type =
        GRIMOIRE_TERRAIN_MAP[tName] != null
          ? GRIMOIRE_TERRAIN_MAP[tName]
          : TERRAIN.GRASS;
      cell.type = type;
      // Keep Grimoire key so the renderer can pick the right RPM texture
      cell.gKey = tName;
      let h = height[key] != null ? Number(height[key]) : 0;
      if (!Number.isFinite(h)) h = 0;
      // Full walls = tall bulk (ceiling-height look). Low walls = short parapet.
      if (tName === 'wall' || tName === 'cave_wall') h = Math.max(h, 2);
      if (tName === 'low_wall' || tName === 'window') h = Math.max(h, 1);
      if (tName === 'water') h = 0;
      // Pits/voids are a real drop, not a flush-with-floor decal — live report: "the voids...
      // needs to actually lower elevation and have void at bottom." Fixed depth regardless of
      // authored height (a pit is always "the floor drops away here").
      if (tName === 'void' || tName === 'pit') h = -3;
      cell.h = Math.max(-4, Math.min(6, h | 0));
    }
  }

  return {
    map,
    decor: gMap.decor || {},
    light: gMap.light || null,
  };
}

const VALID_FACINGS = new Set([
  'down', 'left', 'right', 'up',
  'down-left', 'up-left', 'up-right', 'down-right',
]);

/**
 * Facing: Grimoire's 4-cardinal set, plus the 4 diagonals for 8-direction sprites
 * (facingFromStep in pathfinding.js emits these during diagonal movement).
 * @returns {'down'|'left'|'right'|'up'|'down-left'|'up-left'|'up-right'|'down-right'}
 */
export function normalizeFacing(f) {
  return VALID_FACINGS.has(f) ? f : 'down';
}

/**
 * @param {object} session - Grimoire session { map, players, monsters, order, turn, battle }
 * @param {{ assetBase?: string, spritePaths?: Record<string,string> }} [opts]
 */
export function grimoireSessionToView(session, opts = {}) {
  const assetBase = opts.assetBase || '';
  const paths = { ...DEFAULT_SPRITE_PATHS, ...(opts.spritePaths || {}) };
  const decorPaths = { ...DEFAULT_DECOR_PATHS, ...(opts.decorPaths || {}) };
  const { map, decor, light } = grimoireMapToIso(
    session.map || { cols: 10, rows: 8 },
  );
  if (light) map.light = light;
  else if (session.map && session.map.light) map.light = session.map.light;
  // Doors are built as real 3D wall-oriented quads in buildMapMesh (renderer.js), which
  // needs the raw col,row->kind decor map (not the billboard-only decorSprites list below)
  // to find door cells and detect their wall axis.
  map.decor = decor;

  const units = [];

  const drawOverrides = { ...DEFAULT_SPRITE_DRAW, ...(opts.spriteDraw || {}) };

  for (const pl of session.players || []) {
    if (pl.x == null || pl.y == null) continue;
    const cls = (pl.cls || (pl.c && pl.c.cls) || 'fighter').toLowerCase();
    // Explicit override (sprite-test.html's custom-key box) bypasses the HQ_CHARACTER_KEYS
    // whitelist entirely — lets you point at any file, even ones with no dedicated art yet,
    // instead of silently resolving to the fighter stand-in with no visible feedback.
    const explicitFile = opts.spritePaths && opts.spritePaths[cls];
    const spriteKey = explicitFile ? cls : (paths[cls] ? cls : 'fighter');
    const file = explicitFile || resolveSpritePath(spriteKey, 'character');
    // QB uses hpCur; also fall back to nested character sheet c.hp.cur
    const hp =
      pl.hpCur != null
        ? pl.hpCur
        : pl.hp != null
          ? pl.hp
          : pl.c && pl.c.hp
            ? pl.c.hp.cur
            : 1;
    const maxHp =
      pl.hpMax != null
        ? pl.hpMax
        : pl.maxHp != null
          ? pl.maxHp
          : pl.c && pl.c.hp
            ? pl.c.hp.max
            : hp || 1;
    units.push({
      id: `p:${pl.id || pl.cid || pl.name}`,
      source: 'player',
      raw: pl,
      col: pl.x | 0,
      row: pl.y | 0,
      team: 'player',
      label: pl.name || 'Player',
      hp,
      maxHp,
      // Treat missing HP as alive (don't hide the PC as a corpse)
      alive: hp == null || hp > 0,
      facing: normalizeFacing(pl.facing),
      spriteKey,
      spriteUrl: joinUrl(assetBase, file),
      spriteDraw: drawOverrides[spriteKey] || {
        targetFrameH: 56,
        pixelPerfect: true,
        cols: SPRITE_SHEET_SPEC.cols,
        rows: SPRITE_SHEET_SPEC.rows,
        dirOrder: SPRITE_SHEET_SPEC.dirOrder,
      },
      color: [0.25, 0.55, 0.95],
    });
  }

  for (const mo of session.monsters || []) {
    if (mo.x == null || mo.y == null) continue;
    const sk = (mo.sprite || 'goblin').toLowerCase();
    const spriteKey = paths[sk] ? sk : 'goblin';
    const file = resolveSpritePath(spriteKey, 'monster');
    const hp = mo.hp != null ? mo.hp : 0;
    units.push({
      id: `m:${mo.id}`,
      source: 'monster',
      raw: mo,
      col: mo.x | 0,
      row: mo.y | 0,
      team: 'enemy',
      label: mo.name || 'Monster',
      hp,
      maxHp: mo.max != null ? mo.max : mo.maxHp || hp || 1,
      alive: hp > 0,
      facing: normalizeFacing(mo.facing),
      spriteKey,
      spriteUrl: joinUrl(assetBase, file),
      spriteDraw: drawOverrides[spriteKey] || {
        targetFrameH: 50,
        pixelPerfect: true,
        cols: SPRITE_SHEET_SPEC.cols,
        rows: SPRITE_SHEET_SPEC.rows,
        dirOrder: SPRITE_SHEET_SPEC.dirOrder,
      },
      color: [0.85, 0.3, 0.25],
    });
  }

  // Decor billboards for Iso3D overlay (skip cube-UV / bad props)
  // Doors (open or closed) are NOT billboards — a camera-facing sprite can never truly align
  // with a specific wall's orientation (that's why the old 6-rotation-lookup hack existed and
  // still had gaps at the blank edge-on angles). They're built as real world-oriented 3D slabs
  // directly in buildMapMesh (renderer.js), which detects wall axis itself from the map's own
  // tile data — see the "door quads" pass there. Skip them here entirely.
  const decorSprites = [];
  for (const [key, kind] of Object.entries(decor || {})) {
    if (!kind || kind === 'door' || kind === 'door_open' || !ISO3D_BILLBOARD_DECOR.has(kind)) continue;
    const [cs, rs] = key.split(',');
    const col = Number(cs);
    const row = Number(rs);
    if (!Number.isFinite(col) || !Number.isFinite(row)) continue;
    const file = decorPaths[kind];
    if (!file) continue;
    const isTree = kind.includes('tree');
    const isBush = kind.includes('bush');
    const entry = {
      id: `d:${key}`,
      kind,
      col,
      row,
      spriteUrl: joinUrl(assetBase, file),
      // Chunky pixel trees — larger on map, same native texture (no re-pixelize)
      scale: isTree ? 2.8 : isBush ? 1.5 : 1.35,
      maxH: isTree ? 150 : isBush ? 44 : 42,
    };
    decorSprites.push(entry);
  }

  // Active turn unit id if order present
  let activeId = null;
  if (session.order && session.order.length) {
    const cur = session.order[session.turn || 0];
    if (cur) {
      activeId = cur.k === 'm' ? `m:${cur.id}` : `p:${cur.id}`;
    }
  }

  // Highlights from opts.reachCost / targets (optional, Grimoire mapGridHTML style)
  const highlights = buildHighlights(opts.highlights, map);

  return {
    map,
    decor,
    decorSprites,
    units,
    activeId,
    highlights,
    dynamicLights: session.lights || [],
  };
}

function buildHighlights(h, map) {
  if (!h) return {};
  let move = null;
  let dash = null;
  let jump = null;
  let climb = null;
  if (h.reachCost) {
    move = new Set();
    dash = new Set();
    jump = new Set();
    climb = new Set();
    const normal = h.reachNormal != null ? h.reachNormal : 1e9;
    for (const key of Object.keys(h.reachCost)) {
      const fc = h.reachCost[key];
      if (!(fc > 0)) continue;
      if (fc > normal) dash.add(key);
      else move.add(key);
      const rm = h.reachMeta && h.reachMeta[key];
      if (rm && rm.jump) jump.add(key);
      if (rm && rm.climb) climb.add(key);
    }
  }
  if (h.move) move = h.move;
  if (h.dash) dash = h.dash;
  if (h.jump) jump = h.jump;
  if (h.climb) climb = h.climb;
  const attack = h.attackTiles
    ? h.attackTiles instanceof Set
      ? h.attackTiles
      : new Set(h.attackTiles)
    : h.attack || null;
  // Range / AoE / pre-roll badges must pass through (syncIso3DHost builds these)
  const attackRange = h.attackRange
    ? h.attackRange instanceof Set
      ? h.attackRange
      : new Set(h.attackRange)
    : null;
  const attackRangeMax = h.attackRangeMax
    ? h.attackRangeMax instanceof Set
      ? h.attackRangeMax
      : new Set(h.attackRangeMax)
    : null;
  const blast = h.blast
    ? h.blast instanceof Set
      ? h.blast
      : new Set(h.blast)
    : null;
  // Valid attack targets (monster/player ids or "x,y" keys)
  let targetIds = null;
  if (h.targetIds) {
    targetIds = h.targetIds instanceof Set ? h.targetIds : new Set(h.targetIds);
  } else if (h.targets) {
    targetIds = new Set(
      (Array.isArray(h.targets) ? h.targets : [...h.targets]).map(String),
    );
  }
  return {
    move,
    dash,
    jump,
    climb,
    attack,
    attackRange,
    attackRangeMax,
    blast,
    aoeR: h.aoeR != null ? h.aoeR : null,
    blastLocked: !!h.blastLocked,
    aoePreview: h.aoePreview || null,
    targetIds,
    targetInfo: h.targetInfo || null,
    selected: h.selected || null,
    hover: h.hover || null,
  };
}

function joinUrl(base, path) {
  if (!path) return path;
  if (/^https?:\/\//i.test(path) || path.startsWith('/')) return path;
  if (!base) return path;
  return base.replace(/\/?$/, '/') + path.replace(/^\//, '');
}

/**
 * Iso grid (col,row) uses same axes as Grimoire (x,y).
 * Rotation 0–3 matches Grimoire mapRotation for camera yaw only.
 */
export function rotationToYaw(rot) {
  // Grimoire rot 0 = default; each step +90°
  // Our camera: rot 0 ≈ looking along -Z-ish; use π/4 base + k*π/2
  const r = ((rot % 4) + 4) % 4;
  return Math.PI / 4 + (r * Math.PI) / 2;
}

/** Demo session shaped like Grimoire (for bridge.html, no presets needed). */
export function makeDemoGrimoireSession() {
  const cols = 12;
  const rows = 10;
  const tiles = {};
  const height = {};
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      tiles[`${x},${y}`] = 'grass';
    }
  }
  // water pond
  for (let y = 1; y <= 3; y++) for (let x = 1; x <= 3; x++) tiles[`${x},${y}`] = 'water';
  // dirt path
  for (let y = 0; y < rows; y++) tiles[`5,${y}`] = 'mud';
  // cliff ridge
  for (let y = 3; y <= 7; y++) {
    tiles[`8,${y}`] = 'wall';
    height[`8,${y}`] = 1;
    tiles[`9,${y}`] = 'stone';
    height[`9,${y}`] = 2;
  }
  // sand shore
  for (let x = 0; x < cols; x++) tiles[`${x},${rows - 1}`] = 'sand';

  return {
    map: { cols, rows, tiles, height, decor: { '3,5': 'bush', '6,2': 'tree' } },
    players: [
      {
        id: 'p1',
        name: 'Aldric',
        cls: 'Fighter',
        x: 2,
        y: 7,
        hpCur: 12,
        hpMax: 14,
        facing: 'up',
      },
      {
        id: 'p2',
        name: 'Nyx',
        cls: 'Rogue',
        x: 3,
        y: 8,
        hpCur: 9,
        hpMax: 10,
        facing: 'right',
      },
    ],
    monsters: [
      {
        id: 'm1',
        name: 'Goblin A',
        sprite: 'goblin',
        x: 7,
        y: 2,
        hp: 7,
        max: 7,
        facing: 'down',
      },
      {
        id: 'm2',
        name: 'Skeleton',
        sprite: 'skeleton',
        x: 10,
        y: 4,
        hp: 13,
        max: 13,
        facing: 'left',
      },
      {
        id: 'm3',
        name: 'Wolf',
        sprite: 'wolf',
        x: 6,
        y: 4,
        hp: 11,
        max: 11,
        facing: 'down',
      },
    ],
    order: [
      { k: 'p', id: 'p1', name: 'Aldric' },
      { k: 'm', id: 'm1', name: 'Goblin A' },
      { k: 'p', id: 'p2', name: 'Nyx' },
      { k: 'm', id: 'm2', name: 'Skeleton' },
      { k: 'm', id: 'm3', name: 'Wolf' },
    ],
    turn: 0,
    battle: { active: true, round: 1 },
  };
}

