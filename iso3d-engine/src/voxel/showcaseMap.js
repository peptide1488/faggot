/**
 * Showcase map — fresh 36×36 demo layout.
 *
 *   ┌─────────────────────────────────────┐
 *   │  sample strip (walls/pillars/grass) │  N
 *   │                                     │
 *   │   ┌──────── keep ────────┐   pond   │
 *   │   │ courtyard + deck     │   beach  │
 *   │   │ stairs / ramp / torch│          │
 *   │   └──────────┬───────────┘          │
 *   │         gate stairs                 │
 *   │                                     │
 *   │   rock cliff ══ stair flight ══ top │  S
 *   └─────────────────────────────────────┘
 */

import { genStrata, BEDROCK_DEPTH, STONE_DEPTH } from './store.js';
import { FACING, stringifyBlock } from './blocks.js';
import { BillboardStore } from './billboards.js';

const COLS = 36;
const ROWS = 36;
const BASE = BEDROCK_DEPTH + STONE_DEPTH;

function face(type, facing) {
  return stringifyBlock({ type, facing, slab: false });
}

function heightAt(c, r) {
  // Keep yard — flat
  if (c >= 4 && c <= 18 && r >= 6 && r <= 20) return 1;
  // Cliff mass south-west — stepped shelves
  if (c >= 2 && c <= 14 && r >= 22 && r <= 32) {
    if (c >= 4 && c <= 12 && r >= 26 && r <= 30) return 5; // plateau top
    if (c >= 3 && c <= 13 && r >= 24 && r <= 31) return 3; // mid shelf
    return 1;
  }
  // Pond SE
  const dx = c - 26;
  const dy = r - 26;
  if (dx * dx + dy * dy <= 20) return 0;
  // Gentle hills NE
  const n = Math.sin(c * 0.3) * Math.cos(r * 0.28);
  return Math.max(0, Math.min(2, Math.round(n + 0.9)));
}

function surfaceAt(c, r) {
  const dx = c - 26;
  const dy = r - 26;
  const d2 = dx * dx + dy * dy;
  if (d2 <= 12) return 'water';
  if (d2 <= 22) return 'sand';
  if (c >= 2 && c <= 14 && r >= 22 && r <= 32) return 'cliff';
  if (c >= 4 && c <= 18 && r >= 6 && r <= 20) return 'grass';
  return 'grass';
}

function zSurf(c, r) {
  return BASE + heightAt(c, r);
}

function zStand(c, r) {
  return zSurf(c, r) + 1;
}

function fill(store, c0, r0, c1, r1, z, block) {
  for (let r = r0; r <= r1; r++) {
    for (let c = c0; c <= c1; c++) store.set(c, r, z, block);
  }
}

function stack(store, c, r, z0, h, type) {
  for (let i = 0; i < h; i++) store.set(c, r, z0 + i, type);
}

function wallRing(store, c0, r0, c1, r1, z0, h, gates) {
  const g = new Set(gates.map((x) => `${x.c},${x.r}`));
  for (let r = r0; r <= r1; r++) {
    for (let c = c0; c <= c1; c++) {
      if (c !== c0 && c !== c1 && r !== r0 && r !== r1) continue;
      if (g.has(`${c},${r}`)) continue;
      stack(store, c, r, z0, h, 'dungeon_wall');
    }
  }
}

/**
 * Place a stair flight that climbs `rise` full blocks in direction `dir` (FACING).
 * Starts at cell (c,r) with stairs sitting at walk-height `walkZ` (high tread → walkZ+1).
 * Each cell has 4 treads; one cell per block of rise.
 */
function stairFlight(store, c, r, walkZ, dir, rise, type = 'stone_stairs') {
  const dc = [0, 1, 0, -1][dir];
  const dr = [-1, 0, 1, 0][dir];
  for (let i = 0; i < rise; i++) {
    store.set(c + dc * i, r + dr * i, walkZ + i, face(type, dir));
  }
}

function rampFlight(store, c, r, walkZ, dir, rise, type = 'stone_ramp') {
  const dc = [0, 1, 0, -1][dir];
  const dr = [-1, 0, 1, 0][dir];
  for (let i = 0; i < rise; i++) {
    store.set(c + dc * i, r + dr * i, walkZ + i, face(type, dir));
  }
}

export function buildShowcaseMap(opts = {}) {
  const billboardTypes = opts.billboardTypes || [];
  const typeSet = new Set(billboardTypes);
  const store = genStrata(COLS, ROWS, heightAt, surfaceAt);
  const billboardStore = new BillboardStore();

  // ═══════════════════════════════════════════════════════════════════════
  // KEEP — stone courtyard on the flat pad
  // ═══════════════════════════════════════════════════════════════════════
  // Pad height=1 → surface solid at BASE+1, natural walk = BASE+2.
  // We lay a stone floor solid at BASE+2 → courtyard walk = BASE+3.
  const floorZ = BASE + 2;
  const walkZ = floorZ + 1; // BASE+3
  const wallZ = walkZ;      // walls sit on the floor top

  fill(store, 6, 8, 16, 18, floorZ, 'stone');
  // Plank path through courtyard
  fill(store, 7, 12, 15, 13, floorZ, 'planks');

  // Outer walls, gate open on south (toward cliff) at (10–11, 18)
  wallRing(store, 6, 8, 16, 18, wallZ, 3, [
    { c: 10, r: 18 },
    { c: 11, r: 18 },
    { c: 12, r: 18 },
  ]);
  // Gate posts
  stack(store, 9, 18, wallZ, 3, 'dungeon_wall');
  stack(store, 13, 18, wallZ, 3, 'dungeon_wall');
  // Doors in gate (facing out south)
  store.set(10, 18, wallZ, face('door', FACING.S));
  store.set(11, 18, wallZ, face('door', FACING.S));
  store.set(12, 18, wallZ, face('door_open', FACING.S));

  // Windows north wall
  store.set(9, 8, wallZ + 1, face('window', FACING.N));
  store.set(13, 8, wallZ + 1, face('window', FACING.N));

  // Interior thin wall
  for (let c = 8; c <= 12; c++) {
    for (let h = 0; h < 3; h++) store.set(c, 11, wallZ + h, face('dungeon_wall_thin', FACING.N));
  }
  for (let h = 0; h < 3; h++) {
    store.set(7, 11, wallZ + h, face('dungeon_wall_corner', FACING.N));
    store.set(13, 11, wallZ + h, face('dungeon_wall_corner', FACING.E));
  }

  // Raised deck (NE of courtyard) — 2 blocks above courtyard walk
  // Deck solid top at walkZ+2 → walk on deck = walkZ+3
  const deckSolid = walkZ + 2;
  fill(store, 13, 9, 15, 11, walkZ + 1, 'stone');
  fill(store, 13, 9, 15, 11, deckSolid, 'stone');
  // 2-block stair flight climb east onto deck (8 treads) + ramp beside
  stairFlight(store, 12, 9, walkZ, FACING.E, 2, 'dungeon_stairs');
  stairFlight(store, 12, 10, walkZ, FACING.E, 2, 'dungeon_stairs');
  rampFlight(store, 12, 11, walkZ, FACING.E, 2, 'dungeon_ramp');

  // Pillars on deck
  stack(store, 13, 9, deckSolid + 1, 3, 'dungeon_pillar');
  stack(store, 15, 11, deckSolid + 1, 3, 'dungeon_pillar');

  // Furniture + torches
  store.set(8, 9, wallZ, face('table', FACING.N));
  store.set(9, 9, wallZ, face('chair', FACING.W));
  store.set(8, 10, wallZ, face('shelf', FACING.S));
  store.set(10, 9, wallZ, face('torch', FACING.S));
  store.set(14, 14, wallZ, face('torch', FACING.N));
  store.set(8, 15, wallZ, face('torch', FACING.E));
  store.set(14, 10, wallZ, face('torch', FACING.W));

  // ═══════════════════════════════════════════════════════════════════════
  // GATE APPROACH — stairs from outside up into keep (climb north)
  // Exterior pad walk = BASE+2; courtyard walk = walkZ = BASE+3 → rise 1
  // ═══════════════════════════════════════════════════════════════════════
  const outWalk = BASE + 2;
  stairFlight(store, 10, 19, outWalk, FACING.N, 1, 'stone_stairs');
  stairFlight(store, 11, 19, outWalk, FACING.N, 1, 'stone_stairs');
  rampFlight(store, 12, 19, outWalk, FACING.N, 1, 'stone_ramp');

  // ═══════════════════════════════════════════════════════════════════════
  // SAMPLE STRIP — north edge, free-standing demos
  // ═══════════════════════════════════════════════════════════════════════
  const sy = 3;
  const sBase = zStand(20, sy);
  // Walls 1 / 2 / 3
  stack(store, 18, sy, sBase, 1, 'dungeon_wall');
  stack(store, 19, sy, sBase, 2, 'dungeon_wall');
  stack(store, 20, sy, sBase, 3, 'dungeon_wall');
  // Pillars 1 / 2 / 3 / single
  stack(store, 22, sy, sBase, 1, 'dungeon_pillar');
  stack(store, 23, sy, sBase, 2, 'dungeon_pillar');
  stack(store, 24, sy, sBase, 3, 'dungeon_pillar');
  store.set(25, sy, sBase, 'stone_pillar_single');
  stack(store, 26, sy, sBase, 3, 'stone_pillar');
  // Grass 3-high on different substrates (foot trim follows under-block)
  const grassFootDemo = [
    [18, 'stone'],
    [19, 'sand'],
    [20, 'mud'],
    [21, 'dirt'],
  ];
  for (const [c, under] of grassFootDemo) {
    const z0 = zStand(c, sy + 2);
    store.set(c, sy + 2, z0 - 1, under);
    stack(store, c, sy + 2, z0, 3, 'grass');
  }
  // Dungeon walls 3-high on same substrates (wall foot trims)
  const wallFootDemo = [
    [18, 'stone'],
    [19, 'sand'],
    [20, 'mud'],
    [21, 'grass'],
  ];
  for (const [c, under] of wallFootDemo) {
    const z0 = zStand(c, sy + 4);
    store.set(c, sy + 4, z0 - 1, under);
    stack(store, c, sy + 4, z0, 3, 'dungeon_wall');
  }
  // Cliff 3-high on sand / mud / stone / grass
  const cliffFootDemo = [
    [23, 'sand'],
    [24, 'mud'],
    [25, 'stone'],
    [26, 'grass'],
  ];
  for (const [c, under] of cliffFootDemo) {
    const z0 = zStand(c, sy + 2);
    store.set(c, sy + 2, z0 - 1, under);
    stack(store, c, sy + 2, z0, 3, 'cliff');
  }
  // Stone 3-high on grass / sand / mud / water
  const stoneFootDemo = [
    [23, 'grass'],
    [24, 'sand'],
    [25, 'mud'],
    [26, 'dirt'],
  ];
  for (const [c, under] of stoneFootDemo) {
    const z0 = zStand(c, sy + 4);
    store.set(c, sy + 4, z0 - 1, under);
    stack(store, c, sy + 4, z0, 3, 'stone');
  }

  // ═══════════════════════════════════════════════════════════════════════
  // ROCK CLIFF — south-west mass with a long stair flight up the face
  // Terrain heights: approach 1, mid 3, top 5  (surfaces at BASE+h)
  // Walk heights:    approach BASE+2, mid BASE+4, top BASE+6
  // ═══════════════════════════════════════════════════════════════════════
  const cliffTopWalk = BASE + 6;
  const cliffMidWalk = BASE + 4;
  const cliffLowWalk = BASE + 2;

  // Clear a stair corridor of pure cliff faces (already cliff from genStrata)
  // Flight low → mid: rise 2 (walk +2)
  stairFlight(store, 7, 23, cliffLowWalk, FACING.N, 2, 'stone_stairs');
  stairFlight(store, 8, 23, cliffLowWalk, FACING.N, 2, 'stone_stairs');
  rampFlight(store, 9, 23, cliffLowWalk, FACING.N, 2, 'stone_ramp');

  // Flight mid → top: rise 2
  stairFlight(store, 7, 25, cliffMidWalk, FACING.N, 2, 'stone_stairs');
  stairFlight(store, 8, 25, cliffMidWalk, FACING.N, 2, 'stone_stairs');
  rampFlight(store, 9, 25, cliffMidWalk, FACING.N, 2, 'stone_ramp');

  // Plateau furniture: grass cap + pillars + torch
  for (let r = 27; r <= 29; r++) {
    for (let c = 5; c <= 11; c++) {
      store.set(c, r, zSurf(c, r) + 1, 'grass');
    }
  }
  stack(store, 5, 27, cliffTopWalk, 3, 'stone_pillar');
  stack(store, 11, 27, cliffTopWalk, 3, 'stone_pillar');
  stack(store, 5, 29, cliffTopWalk, 3, 'stone_pillar');
  stack(store, 11, 29, cliffTopWalk, 3, 'stone_pillar');
  store.set(8, 28, cliffTopWalk, face('torch', FACING.S));

  // Tall cliff buttress samples west of stairs (shows grass-base course)
  for (let r = 24; r <= 28; r++) {
    stack(store, 3, r, zSurf(3, r), 4, 'cliff');
  }

  // ═══════════════════════════════════════════════════════════════════════
  // TREES
  // ═══════════════════════════════════════════════════════════════════════
  const treeSpots = [
    [18, 8], [20, 12], [22, 16], [28, 10], [30, 14],
    [17, 22], [20, 24], [28, 20], [30, 28], [22, 30],
    [2, 10], [2, 16], [15, 32], [18, 30],
  ];
  const preferred = ['treetest1', 'treetest2', 'tree_test', 'tree'];
  let treeType = null;
  for (const t of preferred) {
    if (typeSet.has(t)) { treeType = t; break; }
  }
  if (!treeType && typeSet.size > 0) treeType = [...typeSet][0];
  if (treeType) {
    for (const [c, r] of treeSpots) {
      if (surfaceAt(c, r) === 'water') continue;
      if (c >= 6 && c <= 16 && r >= 8 && r <= 18) continue;
      billboardStore.set(c, r, zStand(c, r), treeType);
    }
  }

  return {
    store,
    billboardStore,
    cam: { panX: 14, panY: 16, rot: 0.55, zoom: 0.7 },
    notes: [
      'Keep courtyard: 3-course walls, thin partitions, doors, deck',
      'Deck stairs: 2-block rise = 8 treads + ramp',
      'Gate approach: 4-tread stone stairs into the keep',
      'Cliff path: two 2-block flights (16 treads total) up to the plateau',
      'North samples: walls / pillars / 3-high grass on stone|sand|mud|dirt (foot trims)',
      'Grass/cliff foot trim auto-picks from block under or beside (stone/sand/mud/grass)',
      'Torches: switch to Dungeon light mode to see them',
      treeType ? `Trees: "${treeType}"` : 'Trees: register a billboard type, reload showcase',
    ],
  };
}
