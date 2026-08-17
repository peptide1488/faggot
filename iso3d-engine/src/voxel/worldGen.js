/**
 * worldGen.js — complete, seeded, procedurally generated maps.
 *
 * Returns the SAME shape as showcaseMap.js's buildShowcaseMap ({store, billboardStore,
 * cam, notes}) so voxel.html's existing loadDemoMap() can swap one in with no other
 * changes. That contract is the whole reason this is a sibling module rather than a
 * fork of the showcase: every downstream consumer (mesher, spread sim, light collection,
 * Grimoire export) already works on a VoxelStore and needs to know nothing about how the
 * store got filled.
 *
 * Two kinds, both "complete maps" in the sense the brief asked for — terrain, structures,
 * furniture, light sources, and clutter, not a sample strip:
 *
 *   generateDungeon(seed)  rooms + corridors carved from solid rock, doors, torches,
 *                          pillared halls, flooded chambers, bottomless chasms.
 *   generateOutdoor(seed)  noise terrain, a river with a bridged road, a walled village
 *                          of real buildings, forest, rock outcrops, a beach.
 *
 * EVERY placement goes through the real block vocabulary in blocks.js (BLOCKS keys).
 * There is no block type invented here — an unknown type silently renders as a
 * placeholder, which is exactly the kind of failure that looks like a renderer bug.
 */

import { genStrata, BEDROCK_DEPTH, STONE_DEPTH } from './store.js';
import { FACING, stringifyBlock } from './blocks.js';
import { BillboardStore } from './billboards.js';

/** z that a height=0 column's surface sits at — same derivation genStrata itself uses. */
const BASE = BEDROCK_DEPTH + STONE_DEPTH;

// ═══════════════════════════════════════════════════════════════════════════════
// Seeded RNG
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * mulberry32 — small, fast, and (critically) SEEDED. Every generator here is a pure
 * function of its seed, so a map that shows a bug can be reproduced exactly by writing
 * the seed down. Math.random() would make every interesting failure a one-off.
 */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function rnd() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const randInt = (rnd, lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1));
const pick = (rnd, arr) => arr[Math.floor(rnd() * arr.length)];
const chance = (rnd, p) => rnd() < p;

// ═══════════════════════════════════════════════════════════════════════════════
// Shared helpers
// ═══════════════════════════════════════════════════════════════════════════════

function face(type, facing) {
  return stringifyBlock({ type, facing, slab: false });
}

function slab(type) {
  return stringifyBlock({ type, facing: FACING.N, slab: true });
}

/** Stack `h` blocks of `type` upward from z0. */
function stack(store, c, r, z0, h, type) {
  for (let i = 0; i < h; i++) store.set(c, r, z0 + i, type);
}

/** Fill an inclusive rectangle on one z plane. */
function fillRect(store, c0, r0, c1, r1, z, block) {
  for (let r = r0; r <= r1; r++) {
    for (let c = c0; c <= c1; c++) store.set(c, r, z, block);
  }
}

/** Clear an inclusive box of every block — the "carve" half of dungeon building. */
function clearBox(store, c0, r0, c1, r1, z0, z1) {
  for (let z = z0; z <= z1; z++) {
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) store.remove(c, r, z);
    }
  }
}

/**
 * Camera that frames the WHOLE map. Same 1.3 margin factor voxel.html's own
 * centerCamera() uses — a bare-extent fit clips the map's corners against the ortho
 * frustum's side planes, because the isometric footprint's diagonal is longer than
 * either edge. Centring on the map rather than on the spawn room matters here: a
 * generated dungeon's first room can sit anywhere, and centring on it pushed most of
 * the map off-frame (observed, seed 1).
 */
function frameCam(cols, rows) {
  const extent = Math.max(cols, rows, 1);
  return { panX: cols / 2, panY: rows / 2, rot: 0.6, zoom: 20 / (extent * 1.3) };
}

/** Value noise on a seeded integer lattice, smoothed with a cosine-ish fade. */
function makeNoise2D(seed) {
  const rnd = mulberry32(seed);
  const perm = new Float64Array(512);
  for (let i = 0; i < 512; i++) perm[i] = rnd();
  const at = (xi, yi) => perm[(((xi * 73856093) ^ (yi * 19349663)) >>> 0) & 511];
  const fade = (t) => t * t * (3 - 2 * t);
  return function noise(x, y) {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = fade(x - xi);
    const yf = fade(y - yi);
    const a = at(xi, yi);
    const b = at(xi + 1, yi);
    const c = at(xi, yi + 1);
    const d = at(xi + 1, yi + 1);
    return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf;
  };
}

/** Fractal sum of makeNoise2D octaves, normalised to roughly 0..1. */
function fbm(noise, x, y, octaves = 4) {
  let sum = 0;
  let amp = 1;
  let freq = 1;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += noise(x * freq, y * freq) * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return sum / norm;
}

// ═══════════════════════════════════════════════════════════════════════════════
// DUNGEON
// ═══════════════════════════════════════════════════════════════════════════════

const DUNGEON_WALL_H = 4; // courses of dungeon_wall above the floor — also the ceiling gap

/**
 * Rooms are placed by rejection sampling (random rect, keep it if it clears every
 * existing room by GAP), then connected with L-corridors in nearest-neighbour order.
 *
 * WHY nearest-neighbour rather than "connect room i to room i+1": sequential linking
 * produces long corridors that criss-cross the whole map and read as a tangle. Growing
 * a spanning tree by always attaching the nearest unconnected room keeps corridors
 * short and local, and — because every room joins an already-connected component — it
 * still guarantees the whole dungeon is reachable, which random extra links do not.
 */
function placeRooms(rnd, cols, rows, count) {
  const rooms = [];
  const GAP = 2; // blank rock between rooms so walls never fuse
  let guard = 0;
  while (rooms.length < count && guard++ < count * 200) {
    const w = randInt(rnd, 4, 9);
    const h = randInt(rnd, 4, 8);
    const c0 = randInt(rnd, 2, cols - w - 3);
    const r0 = randInt(rnd, 2, rows - h - 3);
    const cand = { c0, r0, c1: c0 + w, r1: r0 + h };
    const clashes = rooms.some(
      (o) =>
        cand.c0 - GAP <= o.c1 && cand.c1 + GAP >= o.c0 &&
        cand.r0 - GAP <= o.r1 && cand.r1 + GAP >= o.r0,
    );
    if (!clashes) {
      cand.cx = Math.floor((cand.c0 + cand.c1) / 2);
      cand.cy = Math.floor((cand.r0 + cand.r1) / 2);
      rooms.push(cand);
    }
  }
  return rooms;
}

/** Spanning tree over rooms by centre distance — see placeRooms' doc comment. */
function connectRooms(rooms) {
  if (rooms.length < 2) return [];
  const links = [];
  const linked = new Set([0]);
  while (linked.size < rooms.length) {
    let best = null;
    for (const i of linked) {
      for (let j = 0; j < rooms.length; j++) {
        if (linked.has(j)) continue;
        const d = Math.abs(rooms[i].cx - rooms[j].cx) + Math.abs(rooms[i].cy - rooms[j].cy);
        if (!best || d < best.d) best = { i, j, d };
      }
    }
    links.push([best.i, best.j]);
    linked.add(best.j);
  }
  return links;
}

export function generateDungeon(seed = 1, opts = {}) {
  const cols = opts.cols || 48;
  const rows = opts.rows || 48;
  const rnd = mulberry32(seed);
  const notes = [];

  const roomCount = opts.rooms || randInt(rnd, 7, 10);
  const rooms = placeRooms(rnd, cols, rows, roomCount);
  const links = connectRooms(rooms);

  // --- Which cells are open floor? Decide BEFORE building, so the rock fill below can
  // simply skip them. Doing it the other way (fill everything, then carve) costs a
  // full extra pass over ~48*48*5 cells for no benefit.
  const open = new Set();
  const key = (c, r) => c + ',' + r;
  for (const rm of rooms) {
    for (let r = rm.r0; r <= rm.r1; r++) {
      for (let c = rm.c0; c <= rm.c1; c++) open.add(key(c, r));
    }
  }
  // L-corridors: horizontal leg then vertical leg (order flipped at random so the
  // dungeon doesn't develop a visible structural bias toward one elbow direction).
  const corridor = new Set();
  for (const [i, j] of links) {
    const a = rooms[i];
    const b = rooms[j];
    const hFirst = chance(rnd, 0.5);
    const legH = (row) => {
      for (let c = Math.min(a.cx, b.cx); c <= Math.max(a.cx, b.cx); c++) {
        if (!open.has(key(c, row))) corridor.add(key(c, row));
        open.add(key(c, row));
      }
    };
    const legV = (col) => {
      for (let r = Math.min(a.cy, b.cy); r <= Math.max(a.cy, b.cy); r++) {
        if (!open.has(key(col, r))) corridor.add(key(col, r));
        open.add(key(col, r));
      }
    };
    if (hFirst) { legH(a.cy); legV(b.cx); } else { legV(a.cx); legH(b.cy); }
  }

  // --- Chasms: a few interior cells drop out entirely (surfaceFn -> null = no column
  // at all, i.e. genuinely bottomless, not a deep hole with a floor). Only ever carved
  // out of SOLID rock, never out of a room or corridor, or the dungeon would be cut in
  // two and the spanning tree's connectivity guarantee would be a lie.
  const chasm = new Set();
  const chasmCount = randInt(rnd, 2, 4);
  for (let n = 0; n < chasmCount; n++) {
    const cc = randInt(rnd, 4, cols - 5);
    const cr = randInt(rnd, 4, rows - 5);
    const rad = randInt(rnd, 2, 3);
    for (let r = cr - rad; r <= cr + rad; r++) {
      for (let c = cc - rad; c <= cc + rad; c++) {
        const d = Math.hypot(c - cc, r - cr);
        if (d <= rad && !open.has(key(c, r))) chasm.add(key(c, r));
      }
    }
  }

  // --- Terrain: one flat stone floor plane. The dungeon is EXACTLY flat by design —
  // the engine's own note (HANDOFF) is that a dungeon floor must be flat so liquids
  // flood as a uniform sheet rather than pooling on speckle.
  const store = genStrata(
    cols,
    rows,
    () => 0,
    (c, r) => (chasm.has(key(c, r)) ? null : 'stone'),
  );

  const floorZ = BASE;      // solid floor top
  const walkZ = floorZ + 1; // first empty z above it — where props and walls sit

  // --- Solid rock everywhere that isn't open floor.
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (open.has(key(c, r)) || chasm.has(key(c, r))) continue;
      stack(store, c, r, walkZ, DUNGEON_WALL_H, 'dungeon_wall');
    }
  }

  // --- Room dressing.
  const THEMES = ['barracks', 'crypt', 'flooded', 'hall', 'store', 'shrine'];
  const usedThemes = [];
  rooms.forEach((rm, idx) => {
    // The first room is always a plain entry hall so the spawn point is never inside a
    // flooded chamber or behind a pillar forest.
    const theme = idx === 0 ? 'hall' : pick(rnd, THEMES);
    usedThemes.push(theme);
    const w = rm.c1 - rm.c0;
    const h = rm.r1 - rm.r0;

    // Torches on the inside face of the walls, spaced out. Placed on the FLOOR cell
    // adjacent to a wall (this engine's torch is a block occupying a cell, exactly as
    // showcaseMap.js places them), and only where that cell is really open.
    const torchSpots = [];
    for (let c = rm.c0 + 1; c < rm.c1; c += 3) {
      torchSpots.push([c, rm.r0, FACING.N], [c, rm.r1, FACING.S]);
    }
    for (let r = rm.r0 + 2; r < rm.r1; r += 3) {
      torchSpots.push([rm.c0, r, FACING.W], [rm.c1, r, FACING.E]);
    }
    for (const [c, r, f] of torchSpots) {
      if (chance(rnd, 0.55)) store.set(c, r, walkZ, face('torch', f));
    }

    if (theme === 'crypt') {
      // Pillared burial hall — a grid of 2-high pillars, sarcophagus slabs between them.
      for (let r = rm.r0 + 1; r < rm.r1; r += 2) {
        for (let c = rm.c0 + 1; c < rm.c1; c += 2) {
          if (chance(rnd, 0.6)) stack(store, c, r, walkZ, 2, 'dungeon_pillar');
          else if (chance(rnd, 0.4)) store.set(c, r, walkZ, slab('stone'));
        }
      }
    } else if (theme === 'flooded') {
      // Water at floor level. The floor is flat, so this floods as one sheet — and
      // spread.js will treat each placed cell as an infinite source, matching how
      // voxel.html seeds liquidSourceInfo for every liquid already in a loaded store.
      fillRect(store, rm.c0 + 1, rm.r0 + 1, rm.c1 - 1, rm.r1 - 1, floorZ, 'water');
      if (chance(rnd, 0.5)) {
        store.set(rm.cx, rm.cy, walkZ, slab('stone')); // a stepping stone
      }
    } else if (theme === 'barracks') {
      fillRect(store, rm.c0 + 1, rm.r0 + 1, rm.c1 - 1, rm.r1 - 1, floorZ, 'planks');
      for (let n = 0; n < randInt(rnd, 2, 4); n++) {
        const c = randInt(rnd, rm.c0 + 1, rm.c1 - 1);
        const r = randInt(rnd, rm.r0 + 1, rm.r1 - 1);
        store.set(c, r, walkZ, face('table', FACING.N));
        if (chance(rnd, 0.7)) store.set(c, Math.min(r + 1, rm.r1 - 1), walkZ, face('chair', FACING.N));
      }
      store.set(rm.c0 + 1, rm.r1 - 1, walkZ, face('shelf', FACING.W));
    } else if (theme === 'store') {
      // Storeroom — crates as wood blocks and half-height wood slabs, shelves on walls.
      for (let n = 0; n < randInt(rnd, 4, 9); n++) {
        const c = randInt(rnd, rm.c0 + 1, rm.c1 - 1);
        const r = randInt(rnd, rm.r0 + 1, rm.r1 - 1);
        if (chance(rnd, 0.5)) store.set(c, r, walkZ, 'wood');
        else store.set(c, r, walkZ, slab('wood'));
        if (chance(rnd, 0.25)) store.set(c, r, walkZ + 1, slab('wood'));
      }
      store.set(rm.c1 - 1, rm.r0 + 1, walkZ, face('shelf', FACING.E));
    } else if (theme === 'shrine') {
      // A raised altar with a torch pair and a pillar behind it.
      fillRect(store, rm.cx - 1, rm.cy - 1, rm.cx + 1, rm.cy + 1, walkZ, 'stone');
      store.set(rm.cx, rm.cy, walkZ + 1, slab('stone'));
      store.set(rm.cx - 1, rm.cy, walkZ + 1, face('torch', FACING.N));
      store.set(rm.cx + 1, rm.cy, walkZ + 1, face('torch', FACING.N));
      stack(store, rm.cx, rm.cy - 2, walkZ, 3, 'stone_pillar');
    } else {
      // 'hall' — big open room, corner pillars, a rug of planks.
      if (w >= 5 && h >= 5) {
        stack(store, rm.c0 + 1, rm.r0 + 1, walkZ, 3, 'dungeon_pillar');
        stack(store, rm.c1 - 1, rm.r0 + 1, walkZ, 3, 'dungeon_pillar');
        stack(store, rm.c0 + 1, rm.r1 - 1, walkZ, 3, 'dungeon_pillar');
        stack(store, rm.c1 - 1, rm.r1 - 1, walkZ, 3, 'dungeon_pillar');
      }
      fillRect(store, rm.cx - 1, rm.cy - 1, rm.cx + 1, rm.cy + 1, floorZ, 'planks');
    }
  });

  // --- Doors where a corridor meets a room edge. Scanning the corridor set (rather
  // than the room rects) is what makes this land in the ONE cell that is actually a
  // threshold: a corridor cell orthogonally adjacent to a room's interior.
  const roomInterior = new Set();
  for (const rm of rooms) {
    for (let r = rm.r0; r <= rm.r1; r++) {
      for (let c = rm.c0; c <= rm.c1; c++) roomInterior.add(key(c, r));
    }
  }
  let doors = 0;
  for (const k of corridor) {
    const [c, r] = k.split(',').map(Number);
    const nbrs = [[0, -1, FACING.N], [1, 0, FACING.E], [0, 1, FACING.S], [-1, 0, FACING.W]];
    for (const [dc, dr, f] of nbrs) {
      if (roomInterior.has(key(c + dc, r + dr))) {
        if (chance(rnd, 0.75)) {
          store.set(c, r, walkZ, face(chance(rnd, 0.3) ? 'door_open' : 'door', f));
          doors++;
        }
        break;
      }
    }
  }

  // --- A lit corridor every so often, so passages aren't pitch black between rooms.
  let lit = 0;
  for (const k of corridor) {
    if (!chance(rnd, 0.08)) continue;
    const [c, r] = k.split(',').map(Number);
    if (store.get(c, r, walkZ)) continue; // don't overwrite a door
    store.set(c, r, walkZ, face('torch', FACING.N));
    lit++;
  }

  const spawn = rooms[0] || { cx: cols >> 1, cy: rows >> 1 };
  notes.push(
    `Dungeon seed ${seed} — ${rooms.length} rooms, ${links.length} corridors, ${doors} doors`,
    `Themes: ${usedThemes.join(', ')}`,
    `${chasm.size} bottomless chasm cells (no column at all — genStrata surfaceFn null)`,
    `${lit} corridor torches. Switch to Dungeon lighting to see the map as intended.`,
  );

  return {
    store,
    billboardStore: new BillboardStore(),
    cam: frameCam(cols, rows),
    notes,
    meta: { kind: 'dungeon', seed, rooms, spawn },
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// OUTDOOR
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * A wandering path from one map edge to the opposite one. Used for both the river and
 * the road. Returns the ordered list of cells.
 *
 * The wobble is clamped so the path can never double back on itself — a river that
 * reverses reads as a lake with a tail, and a road that reverses is simply broken.
 */
function carvePath(rnd, cols, rows, vertical, startFrac = 0.5, wobble = 0.35) {
  const cells = [];
  const span = vertical ? rows : cols;
  const cross = vertical ? cols : rows;
  let pos = Math.floor(cross * startFrac);
  for (let i = 0; i < span; i++) {
    pos += chance(rnd, wobble) ? (chance(rnd, 0.5) ? 1 : -1) : 0;
    pos = Math.max(2, Math.min(cross - 3, pos));
    cells.push(vertical ? [pos, i] : [i, pos]);
  }
  return cells;
}

export function generateOutdoor(seed = 1, opts = {}) {
  const cols = opts.cols || 56;
  const rows = opts.rows || 56;
  const rnd = mulberry32(seed);
  const noise = makeNoise2D(seed);
  const notes = [];
  const key = (c, r) => c + ',' + r;

  // --- River and road, decided first: the height field has to yield to them (a river
  // must run in a trough, a road must be flat) rather than being carved afterwards and
  // leaving the water climbing a hillside.
  const riverVertical = chance(rnd, 0.5);
  const river = carvePath(rnd, cols, rows, riverVertical, 0.3 + rnd() * 0.4, 0.32);
  const road = carvePath(rnd, cols, rows, !riverVertical, 0.3 + rnd() * 0.4, 0.22);
  const riverSet = new Set();
  for (const [c, r] of river) {
    // 2-wide channel plus banks
    for (let d = -1; d <= 1; d++) {
      riverSet.add(riverVertical ? key(c + d, r) : key(c, r + d));
    }
  }
  const roadSet = new Set(road.map(([c, r]) => key(c, r)));

  // --- Village: a flat pad the buildings sit on, placed off the river.
  const vw = randInt(rnd, 14, 18);
  const vh = randInt(rnd, 12, 16);
  let vc0 = randInt(rnd, 3, cols - vw - 4);
  let vr0 = randInt(rnd, 3, rows - vh - 4);
  // Nudge the village off the river rather than rejection-sampling forever: on a 56²
  // map with a wandering 3-wide river, rejection can spin for a long time.
  for (let tries = 0; tries < 40; tries++) {
    let hits = 0;
    for (let r = vr0; r < vr0 + vh; r++) {
      for (let c = vc0; c < vc0 + vw; c++) if (riverSet.has(key(c, r))) hits++;
    }
    if (hits === 0) break;
    vc0 = randInt(rnd, 3, cols - vw - 4);
    vr0 = randInt(rnd, 3, rows - vh - 4);
  }
  const village = { c0: vc0, r0: vr0, c1: vc0 + vw, r1: vr0 + vh };
  const inVillage = (c, r) => c >= village.c0 && c <= village.c1 && r >= village.r0 && r <= village.r1;

  const VILLAGE_H = 2; // the pad's terrain height — flat, so buildings sit level
  const MAX_H = 7;

  // --- Distance to the nearest river cell, by BFS over the whole grid.
  //
  // WHY this exists: the first version simply returned height 0 for a river cell and
  // raw fbm height for everything else. That is not a river, it is a SLOT CANYON — the
  // ground beside the water stayed up at height 7, so the channel was invisible from
  // above except where it cut the map edge (observed on seed 1). A river has to sit in
  // a valley, which means the terrain near it must be pulled down toward it.
  const INF = 1e9;
  const dist = new Int32Array(cols * rows).fill(INF);
  const queue = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (riverSet.has(key(c, r))) { dist[r * cols + c] = 0; queue.push(r * cols + c); }
    }
  }
  for (let qi = 0; qi < queue.length; qi++) {
    const idx = queue[qi];
    const c = idx % cols;
    const r = (idx - c) / cols;
    const d = dist[idx];
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nc = c + dc;
      const nr = r + dr;
      if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue;
      const nidx = nr * cols + nc;
      if (dist[nidx] > d + 1) { dist[nidx] = d + 1; queue.push(nidx); }
    }
  }

  // --- Height field, precomputed once into a grid rather than recomputed per lookup:
  // genStrata calls heightFn for every column, and zStand/zSurf call it again for every
  // prop placed, so an fbm + BFS lookup per call would be evaluated many times over.
  const hGrid = new Float32Array(cols * rows);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const k = key(c, r);
      let h;
      if (riverSet.has(k)) {
        h = 0;
      } else if (inVillage(c, r)) {
        h = VILLAGE_H;
      } else {
        h = fbm(noise, c / 14, r / 14, 4) * MAX_H;
        // Valley profile: within VALLEY_W of the water the ground is pulled toward the
        // riverbed, so banks slope in instead of dropping off a cliff.
        const VALLEY_W = 6;
        const d = dist[r * cols + c];
        if (d < VALLEY_W) {
          const t = d / VALLEY_W;          // 0 at the water, 1 at the valley rim
          h = h * t + 0.5 * (1 - t);
        }
        if (roadSet.has(k)) h = Math.min(h, 3);
        // Blend the ring just outside the village down to the pad so it isn't a mesa.
        if (c >= village.c0 - 3 && c <= village.c1 + 3 && r >= village.r0 - 3 && r <= village.r1 + 3) {
          h = (h + VILLAGE_H) / 2;
        }
      }
      hGrid[r * cols + c] = h;
    }
  }

  // --- One smoothing pass (3×3 box blur) before rounding to integer block heights.
  // Raw fbm rounded straight to 0..7 produces single-cell towers and pits that read as
  // noise rather than terrain. The village pad and the riverbed are pinned afterwards so
  // the blur cannot tilt a floor the buildings stand on or lift the water out of its bed.
  const sm = new Float32Array(cols * rows);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      let sum = 0;
      let n = 0;
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const nc = c + dc;
          const nr = r + dr;
          if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue;
          sum += hGrid[nr * cols + nc];
          n++;
        }
      }
      sm[r * cols + c] = sum / n;
    }
  }
  const heights = new Int8Array(cols * rows);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const k = key(c, r);
      let h;
      if (riverSet.has(k)) h = 0;
      else if (inVillage(c, r)) h = VILLAGE_H;
      else h = Math.round(sm[r * cols + c]);
      heights[r * cols + c] = Math.max(0, Math.min(MAX_H, h));
    }
  }

  const heightAt = (c, r) => heights[r * cols + c];

  // Centre-line lookup for the river, as a set — `river.some(...)` inside surfaceAt was
  // a linear scan per cell over the whole path (O(cells × path)).
  const riverCentre = new Set(river.map(([c, r]) => key(c, r)));

  function surfaceAt(c, r) {
    const k = key(c, r);
    if (riverSet.has(k)) return riverCentre.has(k) ? 'water' : 'sand';
    if (roadSet.has(k)) return 'dirt';
    if (inVillage(c, r)) return 'grass';
    if (heightAt(c, r) >= 6) return 'cliff'; // exposed rock on the peaks
    return 'grass';
  }

  const store = genStrata(cols, rows, heightAt, surfaceAt);
  const billboardStore = new BillboardStore();

  const zSurf = (c, r) => BASE + heightAt(c, r);
  const zStand = (c, r) => zSurf(c, r) + 1;

  // ── BRIDGE ─────────────────────────────────────────────────────────────────
  // Where the road crosses the river, plank a deck at the road's own walk height so
  // it is genuinely crossable rather than a road that stops at the water.
  // The deck sits 2 above the riverbed surface (bed height 0 -> surface at BASE), which
  // clears the water without floating. The span runs ACROSS the river's own axis: a
  // river running N-S is crossed by widening in c, and vice versa — widening along the
  // wrong axis lays planks down the middle of the channel instead of over it.
  let bridged = 0;
  const deckZ = BASE + 2;
  for (const [c, r] of road) {
    if (!riverSet.has(key(c, r))) continue;
    for (let d = -2; d <= 2; d++) {
      const cc = riverVertical ? c + d : c;
      const rr = riverVertical ? r : r + d;
      if (cc < 0 || rr < 0 || cc >= cols || rr >= rows) continue;
      store.set(cc, rr, deckZ, 'planks');
    }
    // Railings at both ends of the span.
    for (const d of [-3, 3]) {
      const cc = riverVertical ? c + d : c;
      const rr = riverVertical ? r : r + d;
      if (cc < 0 || rr < 0 || cc >= cols || rr >= rows) continue;
      store.set(cc, rr, deckZ + 1, 'wood');
    }
    bridged++;
  }

  // ── BUILDINGS ──────────────────────────────────────────────────────────────
  /**
   * One house: plank floor, walls of `wallType`, a door on the side facing the village
   * centre, windows, a planks roof, and a torch by the door.
   *
   * Roof note: a flat planks lid one course above the wall top. A pitched roof would
   * need wedge/ramp blocks facing four ways and reads badly at this block scale — the
   * engine's own stone_ramp/dungeon_ramp are single-axis wedges meant for walkable
   * slopes, not roofing.
   */
  function building(c0, r0, w, h, wallType, doorFacing) {
    const c1 = c0 + w;
    const r1 = r0 + h;
    const gz = zStand(c0, r0); // village pad is flat, so one corner's height is enough
    const WALL_H = 3;

    fillRect(store, c0, r0, c1, r1, gz - 1, 'planks'); // floor slab under the walk plane

    // Door in the middle of the chosen wall.
    const dc = doorFacing === FACING.N || doorFacing === FACING.S
      ? Math.floor((c0 + c1) / 2)
      : (doorFacing === FACING.W ? c0 : c1);
    const dr = doorFacing === FACING.W || doorFacing === FACING.E
      ? Math.floor((r0 + r1) / 2)
      : (doorFacing === FACING.N ? r0 : r1);

    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const edge = c === c0 || c === c1 || r === r0 || r === r1;
        if (!edge) continue;
        if (c === dc && r === dr) {
          store.set(c, r, gz, face('door', doorFacing));
          for (let i = 1; i < WALL_H; i++) store.set(c, r, gz + i, wallType);
          continue;
        }
        stack(store, c, r, gz, WALL_H, wallType);
      }
    }
    // Windows — punched into the middle course of each wall run.
    const midZ = gz + 1;
    const wc = Math.floor((c0 + c1) / 2);
    const wr = Math.floor((r0 + r1) / 2);
    if (wc !== dc || r0 !== dr) store.set(wc, r0, midZ, face('window', FACING.N));
    if (wc !== dc || r1 !== dr) store.set(wc, r1, midZ, face('window', FACING.S));
    if (c0 !== dc || wr !== dr) store.set(c0, wr, midZ, face('window', FACING.W));
    if (c1 !== dc || wr !== dr) store.set(c1, wr, midZ, face('window', FACING.E));

    // Roof
    fillRect(store, c0, r0, c1, r1, gz + WALL_H, 'planks');

    // Interior: a table, a chair, a shelf, and a torch for light.
    store.set(c0 + 1, r0 + 1, gz, face('table', FACING.N));
    if (w >= 3) store.set(c0 + 2, r0 + 1, gz, face('chair', FACING.W));
    store.set(c1 - 1, r1 - 1, gz, face('shelf', FACING.E));
    store.set(c0 + 1, r1 - 1, gz, face('torch', FACING.N));
  }

  const houses = [];
  const HOUSE_TRIES = 40;
  for (let n = 0; n < HOUSE_TRIES && houses.length < randInt(rnd, 5, 8); n++) {
    const w = randInt(rnd, 3, 5);
    const h = randInt(rnd, 3, 4);
    const c0 = randInt(rnd, village.c0 + 1, village.c1 - w - 1);
    const r0 = randInt(rnd, village.r0 + 1, village.r1 - h - 1);
    const box = { c0, r0, c1: c0 + w, r1: r0 + h };
    const clash = houses.some(
      (o) => box.c0 - 2 <= o.c1 && box.c1 + 2 >= o.c0 && box.r0 - 2 <= o.r1 && box.r1 + 2 >= o.r0,
    );
    if (clash) continue;
    houses.push(box);
    const centreC = (village.c0 + village.c1) / 2;
    const centreR = (village.r0 + village.r1) / 2;
    // Face the door toward the village centre — the dominant axis decides which wall.
    const dx = centreC - (c0 + w / 2);
    const dy = centreR - (r0 + h / 2);
    const facing = Math.abs(dx) > Math.abs(dy)
      ? (dx > 0 ? FACING.E : FACING.W)
      : (dy > 0 ? FACING.S : FACING.N);
    building(c0, r0, w, h, chance(rnd, 0.35) ? 'stone' : 'wood', facing);
  }

  // A well at the village centre — stone ring with water in it.
  const wellC = Math.floor((village.c0 + village.c1) / 2);
  const wellR = Math.floor((village.r0 + village.r1) / 2);
  if (!houses.some((o) => wellC >= o.c0 - 1 && wellC <= o.c1 + 1 && wellR >= o.r0 - 1 && wellR <= o.r1 + 1)) {
    const wz = zStand(wellC, wellR);
    for (let r = wellR - 1; r <= wellR + 1; r++) {
      for (let c = wellC - 1; c <= wellC + 1; c++) {
        if (c === wellC && r === wellR) continue;
        store.set(c, r, wz, 'stone');
      }
    }
    store.set(wellC, wellR, wz - 1, 'water');
  }

  // ── ROCK OUTCROPS ──────────────────────────────────────────────────────────
  let rocks = 0;
  for (let n = 0; n < 40; n++) {
    const c = randInt(rnd, 1, cols - 2);
    const r = randInt(rnd, 1, rows - 2);
    if (riverSet.has(key(c, r)) || roadSet.has(key(c, r)) || inVillage(c, r)) continue;
    stack(store, c, r, zStand(c, r), randInt(rnd, 1, 3), 'cliff');
    rocks++;
  }

  // ── FOREST ─────────────────────────────────────────────────────────────────
  /**
   * Trees are built from BLOCKS, not billboards. A billboard would need its texture
   * allocated into the shared atlas and re-uploaded to the GPU (billboards.js is explicit
   * that "the actual texture/canvas/GPU-upload is the caller's job"), and no tree type is
   * registered on a fresh load — so a billboard forest silently places nothing, which is
   * exactly what the first run of this generator did. Voxel trees always render, and read
   * better against cube terrain anyway.
   *
   * A trunk of `wood` with a `grass` canopy: grass is the only green in the built-in
   * block set, and as a canopy blob it reads as foliage.
   */
  function tree(c, r) {
    const gz = zStand(c, r);
    const trunkH = randInt(rnd, 3, 4);
    stack(store, c, r, gz, trunkH, 'wood');
    const topZ = gz + trunkH;
    // Canopy: a 2-radius disc at the trunk top, a 1-radius cap above it.
    for (let dr = -2; dr <= 2; dr++) {
      for (let dc = -2; dc <= 2; dc++) {
        if (Math.abs(dc) === 2 && Math.abs(dr) === 2) continue; // clip the corners round
        const nc = c + dc;
        const nr = r + dr;
        if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue;
        if (dc === 0 && dr === 0) continue; // trunk continues through
        store.set(nc, nr, topZ - 1, 'grass');
        if (Math.abs(dc) <= 1 && Math.abs(dr) <= 1) store.set(nc, nr, topZ, 'grass');
      }
    }
    store.set(c, r, topZ, 'grass');
    store.set(c, r, topZ + 1, 'grass');
  }

  let trees = 0;
  const treeCells = new Set();
  for (let r = 2; r < rows - 2; r++) {
    for (let c = 2; c < cols - 2; c++) {
      const k = key(c, r);
      if (riverSet.has(k) || roadSet.has(k) || inVillage(c, r)) continue;
      if (surfaceAt(c, r) !== 'grass') continue;
      if (store.get(c, r, zStand(c, r))) continue; // a rock already stands here
      // Cluster with noise so the forest has clearings instead of an even scatter, and
      // keep trunks 2 apart so canopies form groves rather than one solid green slab.
      // Thresholds tuned by eye, not by feel: at density>0.54/p=0.35/spacing 2 this put
      // 85 trees with 5×5 canopies on a 56² map — over half the ground under leaves, so
      // the river and terrain read as one green slab. Sparser gives actual groves.
      const density = fbm(noise, c / 9 + 40, r / 9 + 40, 3);
      if (density <= 0.60 || !chance(rnd, 0.30)) continue;
      let tooClose = false;
      for (let dr = -3; dr <= 3 && !tooClose; dr++) {
        for (let dc = -3; dc <= 3; dc++) {
          if (treeCells.has(key(c + dc, r + dr))) { tooClose = true; break; }
        }
      }
      if (tooClose) continue;
      treeCells.add(k);
      tree(c, r);
      trees++;
    }
  }

  // ── ROADSIDE TORCHES ───────────────────────────────────────────────────────
  let lamps = 0;
  for (let i = 0; i < road.length; i += 9) {
    const [c, r] = road[i];
    const sc = riverVertical ? c : c + 1;
    const sr = riverVertical ? r + 1 : r;
    if (sc < 0 || sr < 0 || sc >= cols || sr >= rows) continue;
    if (riverSet.has(key(sc, sr)) || store.get(sc, sr, zStand(sc, sr))) continue;
    store.set(sc, sr, zStand(sc, sr), face('torch', FACING.N));
    lamps++;
  }

  notes.push(
    `Outdoor seed ${seed} — ${cols}×${rows}`,
    `${houses.length} buildings + well in a ${vw}×${vh} village`,
    `River runs ${riverVertical ? 'N-S' : 'E-W'}; road crosses it on ${bridged} bridge decks`,
    `${trees} voxel trees, ${rocks} rock outcrops, ${lamps} roadside torches`,
  );

  return {
    store,
    billboardStore,
    cam: frameCam(cols, rows),
    notes,
    meta: { kind: 'outdoor', seed, village, houses, riverVertical },
  };
}

// ═══════════════════════════════════════════════════════════════════════════════

/** Dispatcher — `kind` is 'dungeon' | 'outdoor'. */
export function generateWorld(kind = 'dungeon', seed = 1, opts = {}) {
  if (kind === 'outdoor') return generateOutdoor(seed, opts);
  return generateDungeon(seed, opts);
}
