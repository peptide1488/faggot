/**
 * Shared "spreading volume" tick infrastructure (see CONTENT_TOOLS_PLAN.md's gas/liquid
 * sections) — gas dispersal (`stepGas`) and liquid flow (`stepLiquid`) share one dirty-cell-
 * driven simulation shape (see `markSpreadDirty`) with different propagation rules: gas dilutes
 * uniformly when unconfined, liquid falls under gravity first then spreads laterally with
 * decreasing strength, tracking a source/finite-volume distinction gas doesn't need at all.
 *
 * Deliberately re-evaluated on a SEPARATE slow tick (a setInterval in voxel.html), not every
 * render frame (VOXEL_PLAN.md's own note on this) — one call to stepGas/stepLiquid is one
 * generation, not a full-map rescan: only `dirtyCells` (and whatever changed as a result, fed
 * into the returned `nextDirty`) get touched, so idle/maps-with-none-of-this cost nothing extra.
 *
 * No module-level state — `lifeMap`/`levelMap`/`sourceInfo`/`dirtyCells` are owned and threaded
 * by the caller (same "pure logic, no globals" discipline every other voxel/* module keeps), so
 * multiple stores (e.g. a ghost-preview store) can never cross-contaminate each other's
 * simulation state.
 */

import { parseBlock, BLOCKS } from './blocks.js';
import { keyFor, parseKey } from './store.js';

const NEIGHBOR_OFFSETS = [
  [1, 0, 0], [-1, 0, 0],
  [0, 1, 0], [0, -1, 0],
  [0, 0, 1], [0, 0, -1],
];

/** Life-countdown a gas cell starts at when first placed/spread into. Decrements only while
 * UNCONFINED (at least one non-solid neighbor); a fully sealed room's gas never fades on its
 * own — "a sealed gas-filled room stays full," matching the plan doc's own framing.
 * At voxel.html's GAS_TICK_MS=400ms tick rate, 60 life is a 24-second unconfined lifetime —
 * raised from an original 8 (3.2s) that dissipated before a cloud even finished visibly
 * spreading into a room (user-reported: "the gas disappears too quick"). Still clearable
 * sooner on demand via Gust of Wind (clearGasInRadius) — this only controls how long it
 * lingers on its own.
 *
 * Deliberately INDEPENDENT of GAS_SPREAD_RADIUS below — these used to be the same counter
 * (each spread hop cost 1 life, so a cell's remaining life ALSO capped how much further the
 * cloud could still travel), which meant raising this for a longer lingering time silently
 * let the cloud spread ~60 cells from its source too, enough to blanket an entire 32x32 map
 * (a real bug hit live: "it fills up the entire map" right after this was raised from 8).
 * Splitting them into two separate budgets (each cell now tracks BOTH) fixes that: this one
 * only controls how long an already-placed cell lingers before fading. */
export const GAS_MAX_LIFE = 60;

/** How many hops (cells) a single connected gas release can ultimately spread away from
 * wherever it originated, independent of GAS_MAX_LIFE — the fix for the bug described in
 * GAS_MAX_LIFE's own doc comment above. 8 matches this simulation's original (pre-bug) implicit
 * reach, back when life=8 doubled as the hop budget and nobody complained about the SPREAD
 * distance, only the lifetime. A newly spread cell's own hops is always its parent's hops-1
 * (so the frontier genuinely stops advancing once exhausted), but it gets a FRESH GAS_MAX_LIFE
 * of its own regardless of hop distance — so the whole settled cloud lingers/fades together on
 * roughly the same schedule, not a wave that dies from the outside in. An enclosed room smaller
 * than this radius still fills completely (bounded by walls, not by hops running out); a room
 * or open terrain LARGER than this radius will not be blanketed entirely — a deliberate cap,
 * not a bug, now that it's the thing actually responsible for how big a cloud can get. */
export const GAS_SPREAD_RADIUS = 8;

/** A gas material is any BLOCKS type flagged `gas: true` — opt-in, like `translucent`/`light`. */
export function isGasType(type) {
  const def = BLOCKS[type];
  return !!(def && def.gas);
}

/** Non-solid (or empty) — gas can disperse THROUGH this cell, though not necessarily spread
 * INTO it (spreading requires the cell be genuinely empty — see stepGas's spreadTargets). */
function isOpenCell(store, c, r, z) {
  const block = store.get(c, r, z);
  if (!block) return true;
  const def = BLOCKS[parseBlock(block).type];
  return !def || !def.solid;
}

/**
 * Advance the gas simulation by one generation, mutating `store` and `lifeMap` in place.
 * `lifeMap`: Map of cell key (see store.js keyFor) -> `{ life, hops }` state, threaded across
 * calls by the caller (`life`: GAS_MAX_LIFE's own lingering countdown; `hops`: GAS_SPREAD_
 * RADIUS's own remaining-reach countdown — see both constants' doc comments for why these are
 * two separate numbers, not one). `dirtyCells`: Set of cell keys to re-evaluate THIS call.
 * `wind` (optional): a `[dc, dr, dz]` direction vector (need not be normalized — only its sign/
 * relative magnitude per axis matters, since it's just used to RANK candidates, not scale
 * anything) biasing which open neighbor gas prefers to spread into, applied every tick — a
 * PERSISTENT drift, not a one-shot push, so a gas cloud visibly streams downwind over many
 * generations instead of spreading evenly in all directions (distinct from `clearGasInRadius`'s
 * instant, one-time "Gust of Wind" removal). Omitted/null -> today's exact behavior (spread
 * targets tried in `NEIGHBOR_OFFSETS`' own fixed order), zero regression on any existing map/
 * test that doesn't pass one.
 * `cooldownMap` (optional, see clearGasInRadius/GUST_COOLDOWN_TICKS): cells a Gust of Wind just
 * cleared refuse to be spread back INTO until their cooldown expires — this function only ever
 * READS it (see tickGustCooldown for the actual countdown, called separately/unconditionally by
 * the caller every real tick, NOT gated behind `dirtyCells` being non-empty — see that
 * function's own doc comment for why decaying it in here specifically would be a real bug: gas
 * dirty-set can and does go empty right after a gust clears the only gas on the map, which would
 * silently freeze the cooldown at whatever count it last happened to reach). Omitted (the
 * default) -> no cooldown at all, today's exact original behavior.
 * Returns `{ changed, nextDirty }` — `changed` tells the caller whether a mesh rebuild is
 * warranted; `nextDirty` feeds the following call.
 */
export function stepGas(store, lifeMap, dirtyCells, wind = null, cooldownMap = null) {
  const nextDirty = new Set();
  let changed = false;

  for (const key of dirtyCells) {
    const [c, r, z] = parseKey(key);
    const block = store.get(c, r, z);
    if (!block) {
      lifeMap.delete(key);
      continue;
    }
    const parsed = parseBlock(block);
    if (!isGasType(parsed.type)) {
      lifeMap.delete(key);
      continue;
    }
    const def = BLOCKS[parsed.type];
    // Per-material "how big a volume can this gas ultimately fill" — see the Material Maker's
    // own "Max spread radius" field. Falls back to the shared GAS_SPREAD_RADIUS default for any
    // material that doesn't set its own (every built-in, and any custom gas material that
    // didn't touch the slider) — zero behavior change for anything authored before this existed.
    const spreadRadius = def && def.gasSpreadRadius != null ? def.gasSpreadRadius : GAS_SPREAD_RADIUS;
    if (!lifeMap.has(key)) lifeMap.set(key, { life: GAS_MAX_LIFE, hops: spreadRadius });
    const state = lifeMap.get(key);
    const life = state.life;
    const hops = state.hops;

    // Confinement: true only when EVERY neighbor is solid — a gas pocket surrounded by more
    // gas (or empty space) is not "confined" even though those neighbors aren't spread targets.
    const confined = NEIGHBOR_OFFSETS.every(([dc, dr, dz]) => !isOpenCell(store, c + dc, r + dr, z + dz));

    // Spread targets: neighbors with NO block at all (never overwrite furniture/other content,
    // and never double-claim a cell another gas cell already occupies), and within the world's
    // horizontal bounds (see WORLD_MIN_C/MAX_C/MIN_R/MAX_R — a gas cloud reaching the map edge
    // stops there instead of drifting into unbounded territory beyond the built world).
    const spreadTargets = NEIGHBOR_OFFSETS
      .map(([dc, dr, dz]) => ({ c: c + dc, r: r + dr, z: z + dz, dc, dr, dz }))
      .filter((n) => !store.has(n.c, n.r, n.z) && inWorldBounds(n.c, n.r) && !(cooldownMap && cooldownMap.has(keyFor(n.c, n.r, n.z))));

    // Per-material "weight" (see the Material Maker's Weight slider) — a continuous vertical
    // bias ADDED on top of whatever ambient wind is set (not a replacement for it), so a heavy
    // gas still primarily sinks while a strong wind can visibly drift it sideways, and a light
    // gas (negative weight — smoke, steam) RISES instead, both while still responding to wind.
    // weight=0 (the default for every built-in and any material that never touches the slider)
    // is a true no-op — effectiveWind === wind exactly, zero behavior change from before this
    // existed. Positive weight biases toward -z (down, "heavy"); negative biases toward +z (up,
    // "light" — this is what makes a genuine smoke/steam material possible, not just heavy gas).
    const gasWeight = def && def.gasWeight ? def.gasWeight : 0;
    const effectiveWind = gasWeight !== 0
      ? [wind ? wind[0] : 0, wind ? wind[1] : 0, (wind ? wind[2] || 0 : 0) - gasWeight]
      : wind;
    if (effectiveWind) {
      // Rank open neighbors by alignment with the wind vector (higher dot product first) — a
      // neighbor directly downwind sorts to the front, so `spreadTargets[0]` below picks it
      // instead of whatever NEIGHBOR_OFFSETS' fixed order would have tried first. Array.sort is
      // a STABLE sort (guaranteed since ES2019), so ties (e.g. the two z-axis neighbors under a
      // purely horizontal wind) keep NEIGHBOR_OFFSETS' original order — deterministic, not
      // dependent on sort-implementation quirks.
      const [wc, wr, wz] = effectiveWind;
      spreadTargets.sort((a, b) => (b.dc * wc + b.dr * wr + b.dz * (wz || 0)) - (a.dc * wc + a.dr * wr + a.dz * (wz || 0)));
    }

    // Spread into ONE open empty neighbor per tick (not all at once) — gradual, visible
    // dispersal rather than instantly filling a whole room in a single generation. Fills an
    // enclosed room over several ticks even though `confined` blocks dilution below — spreading
    // and dilution are independent (a sealed room still fills, it just never fades after).
    // Gated on `hops` (the SPREAD-reach budget), not `life` (the lingering-duration budget) —
    // see GAS_SPREAD_RADIUS's doc comment for why these must stay separate counters. A newly
    // spread cell gets a FRESH life (not life-1) but an inherited hops-1, so the whole settled
    // cloud lingers/fades together on roughly one schedule instead of the frontier dying first.
    if (hops > 0 && spreadTargets.length > 0) {
      const target = spreadTargets[0];
      const targetKey = keyFor(target.c, target.r, target.z);
      store.set(target.c, target.r, target.z, parsed.type);
      lifeMap.set(targetKey, { life: GAS_MAX_LIFE, hops: hops - 1 });
      nextDirty.add(targetKey);
      changed = true;
    }

    if (!confined) {
      const newLife = life - 1;
      if (newLife <= 0) {
        store.remove(c, r, z);
        lifeMap.delete(key);
        changed = true;
        // The vacated cell's neighbors may now have new open space to consider next tick.
        for (const [dc, dr, dz] of NEIGHBOR_OFFSETS) nextDirty.add(keyFor(c + dc, r + dr, z + dz));
        continue;
      }
      state.life = newLife;
      changed = true;
    }
    nextDirty.add(key);
  }

  return { changed, nextDirty };
}

/**
 * Flood-fills outward from (c,r,z) through every CONNECTED cell of the same gas type — "select
 * this cloud" for a spell that needs to act on a whole gas volume at once (e.g. a Cloud Kill-
 * style effect damaging everything currently inside it), rather than just one cell. Connectivity
 * is 6-neighbor (same as stepGas's own NEIGHBOR_OFFSETS), stopping at anything that isn't the
 * SAME gas type (a different gas, solid geometry, or empty space) — two adjacent but distinct
 * clouds (different types) are never merged into one selection. Returns `[]` if (c,r,z) isn't
 * gas at all (no block, or a non-gas type). Pure query — never mutates store/lifeMap, so it's
 * safe to call every frame from a UI hover/selection tool, not just once per spell cast.
 */
export function getGasCloudCells(store, c, r, z) {
  const startBlock = store.get(c, r, z);
  if (!startBlock) return [];
  const type = parseBlock(startBlock).type;
  if (!isGasType(type)) return [];

  const startKey = keyFor(c, r, z);
  const visited = new Set([startKey]);
  const queue = [[c, r, z]];
  const cells = [];
  while (queue.length) {
    const [cc, cr, cz] = queue.shift();
    cells.push({ c: cc, r: cr, z: cz });
    for (const [dc, dr, dz] of NEIGHBOR_OFFSETS) {
      const nc = cc + dc;
      const nr = cr + dr;
      const nz = cz + dz;
      const nKey = keyFor(nc, nr, nz);
      if (visited.has(nKey)) continue;
      const nBlock = store.get(nc, nr, nz);
      if (!nBlock || parseBlock(nBlock).type !== type) continue;
      visited.add(nKey);
      queue.push([nc, nr, nz]);
    }
  }
  return cells;
}

/** How many stepGas generations a Gust-of-Wind-cleared cell resists being spread back into —
 * see clearGasInRadius's own doc comment for why this exists (without it, a clear radius small
 * relative to the surrounding cloud's own remaining spread reach gets silently refilled within
 * a single ~400ms tick, reading as "Gust of Wind isn't working" even though it technically
 * fired). 10 ticks is ~4 seconds at voxel.html's GAS_TICK_MS=400 — long enough to visibly read
 * as a held-open gap, not a flicker. */
export const GUST_COOLDOWN_TICKS = 10;

/**
 * Decrement every entry in a Gust-of-Wind cooldown map by one tick, dropping any that expire —
 * called by the caller (voxel.html) UNCONDITIONALLY, once per real tick, separately from
 * stepGas itself and NOT gated behind whether any gas is currently dirty/exists at all. That
 * distinction matters: `clearGasInRadius` flags its own cleared cells dirty, but stepGas drops
 * an empty cell from `nextDirty` the very first time it sees it there's nothing left to do (see
 * its own `if (!block) { ...; continue; }` branch) — so the gas dirty-set can, and typically
 * does, go completely empty within one tick of a Gust of Wind clearing the only gas around. If
 * cooldown decay lived INSIDE stepGas (gated behind that same dirty-set), it would silently
 * freeze at whatever count it happened to reach the moment the dirty-set emptied out, instead
 * of actually expiring in real time — a real near-miss caught before shipping, not hypothetical.
 */
export function tickGustCooldown(cooldownMap) {
  for (const [key, ticksLeft] of cooldownMap) {
    if (ticksLeft <= 1) cooldownMap.delete(key);
    else cooldownMap.set(key, ticksLeft - 1);
  }
}

/**
 * Clears every gas cell within a cubic `radius` (Chebyshev distance, cheap) of (cx,cr,cz) —
 * simulates an EXTERNAL effect blowing a cloud away (a Gust of Wind spell, a fan, an explosion)
 * rather than gas dissipating on its own via stepGas's normal dilution rule. The plan doc's own
 * still-not-built item: "gas cloud being pushed/cleared by an effect" — `stepGas` itself only
 * ever dilutes gradually when unconfined; this is the missing "instantly remove it from a
 * region" action a caller (voxel.html, or eventually a spell/ability) can trigger on demand.
 * Flags the cleared region (and its immediate neighbors, via markSpreadDirty) dirty so any gas
 * just outside the cleared radius naturally re-evaluates once its cooldown expires, rather than
 * leaving stale dirty-set entries pointing at now-empty cells.
 *
 * `cooldownMap` (optional, same "caller owns the state, threaded across calls" discipline as
 * lifeMap/dirtySet): every cleared cell gets GUST_COOLDOWN_TICKS entered here — stepGas (see its
 * own doc comment) refuses to spread INTO any cell still in cooldown, so a gust actually holds
 * a visible gap open for a few seconds instead of the surrounding cloud seeping right back in
 * on the very next generation (a real bug hit live: a radius-3 clear inside a much larger, still
 * actively-spreading cloud refilled so fast it read as "Gust of Wind isn't working" at all).
 * Omitting `cooldownMap` (the default) skips this — an instant clear with no resistance to
 * regrowth, today's exact original behavior, for any caller that doesn't pass one.
 */
export function clearGasInRadius(store, lifeMap, dirtySet, cx, cr, cz, radius, cooldownMap = null) {
  let cleared = 0;
  for (let dc = -radius; dc <= radius; dc++) {
    for (let dr = -radius; dr <= radius; dr++) {
      for (let dz = -radius; dz <= radius; dz++) {
        const c = cx + dc;
        const r = cr + dr;
        const z = cz + dz;
        const block = store.get(c, r, z);
        if (!block || !isGasType(parseBlock(block).type)) continue;
        store.remove(c, r, z);
        lifeMap.delete(keyFor(c, r, z));
        if (cooldownMap) cooldownMap.set(keyFor(c, r, z), GUST_COOLDOWN_TICKS);
        markSpreadDirty(dirtySet, c, r, z);
        cleared++;
      }
    }
  }
  return cleared;
}

/** Flag a cell and its 6 neighbors dirty for the NEXT stepGas/stepLiquid call — shared by both
 * (identical shape, no gas/liquid-specific logic) — call this whenever something that could
 * affect flow changes: a gas/liquid cell placed directly, or ANY block placed/removed near an
 * existing one (editor.js's applyEdit has no flow awareness at all, so the caller, e.g.
 * voxel.html, is responsible for calling this after edits near gas/liquid cells — the plan
 * doc's explicit "breaking a block adjacent to X should flag neighbors for next tick"). Once
 * seeded, an existing gas/liquid cell keeps re-adding itself to `nextDirty` every generation for
 * as long as it exists (see stepGas/stepLiquid's own unconditional `nextDirty.add(key)`), so
 * this only needs calling to SEED a newly-placed cell or reseed after a fresh map load — a
 * cell that's already mid-simulation re-examines the current store state automatically. */
export function markSpreadDirty(dirtySet, c, r, z) {
  dirtySet.add(keyFor(c, r, z));
  for (const [dc, dr, dz] of NEIGHBOR_OFFSETS) dirtySet.add(keyFor(c + dc, r + dr, z + dz));
}

/** Life-countdown a liquid SOURCE cell always reports as (for feeding-comparison purposes) —
 * a source never itself decays, and is the strongest possible level anything can flow FROM. */
export const LIQUID_MAX_LEVEL = 7;

/** A HARD floor to the world — gravity (stepLiquid, below) never falls a liquid cell below
 * this z, full stop. Without this, water placed above open space with nothing underneath (no
 * bedrock/floor in that column) falls forever, one cell deeper every tick, unbounded — a real
 * bug hit live: "water does indeed flow, but since nothing is under it, it just flows
 * infinitely." Matches this engine's own map-generation convention (`store.js`'s `genStrata`
 * always places `bedrock` at z=0 when there's room) — z=0 is already effectively "the floor"
 * for any normally-generated map; this just makes it a real, enforced boundary for the liquid
 * simulation specifically, not just a generation convention that a hand-placed source could
 * violate. Once a falling column hits this depth, it's treated exactly like hitting a solid
 * floor — blocked from falling further, so it spreads laterally instead (see stepLiquid). */
export const WORLD_MIN_Z = 0;

/** A HARD horizontal boundary — gas/liquid spread (and, via markSpreadDirty, editor wake-ups)
 * never expand beyond this c/r box. Without this, a flood or gas cloud reaching open territory
 * beyond the map's own generated terrain can spread forever in the horizontal plane (bounded
 * only by level-decay, which — as WORLD_MIN_Z's own history shows — can still cover a much
 * larger area than intended once multiple landing points merge).
 *
 * `let`, not `const`: this used to be a fixed 31/31 matching the old 32×32 demo map, which
 * silently clipped simulation on ANY larger map (the 36×36 showcase map's own pond never got a
 * real boundary at all — see GATE_TESTBED.md bug #2). Call `setWorldBounds`/
 * `setWorldBoundsFromStore` once after loading/generating a store so these track the ACTUAL
 * map being played instead of a stale hardcoded size. Defaults stay 0..31 so any caller that
 * never calls the setter keeps today's exact behavior. */
export let WORLD_MIN_C = 0;
export let WORLD_MAX_C = 31;
export let WORLD_MIN_R = 0;
export let WORLD_MAX_R = 31;

/** Set the simulation's hard horizontal boundary explicitly. */
export function setWorldBounds(minC, maxC, minR, maxR) {
  WORLD_MIN_C = minC;
  WORLD_MAX_C = maxC;
  WORLD_MIN_R = minR;
  WORLD_MAX_R = maxR;
}

/** Convenience: derive the boundary from a store's actual occupied bounding box (+ margin
 * tiles of slack on every side, since a spell/edit right at the map's own edge still needs
 * room to spread rather than hitting a boundary drawn exactly on the terrain's last column).
 * No-op on an empty store (keeps whatever bounds were set/defaulted before). This is the ONE
 * shared call every map-loading path (voxel.html boot/demo-swap, exportBattleMap round-trips,
 * the gate testbed) should use — not a per-caller reimplementation of the same math. */
export function setWorldBoundsFromStore(store, margin = 4) {
  const b = store.bounds();
  if (b.maxC < b.minC) return;
  setWorldBounds(
    Math.min(0, b.minC) - margin,
    b.maxC + margin,
    Math.min(0, b.minR) - margin,
    b.maxR + margin,
  );
}

/** True if (c,r) is within the world's horizontal bounds — spread targets outside this box are
 * treated exactly like a solid wall (never a valid place to fall/spread into). */
function inWorldBounds(c, r) {
  return c >= WORLD_MIN_C && c <= WORLD_MAX_C && r >= WORLD_MIN_R && r <= WORLD_MAX_R;
}

/** Auto-places a `bedrock` floor at (c,r,z-1) when liquid reaches the world floor (z ===
 * WORLD_MIN_Z) with nothing already beneath it — a real "ocean" landing on unbuilt territory
 * beyond the map's own generated terrain otherwise floats over open void with no visible
 * ground at all (user request: "bedrock foundation on whole map" — a floor should appear
 * wherever water actually reaches, not just where the map happened to pre-generate one). No-op
 * everywhere else (only ever fires exactly at the world floor depth). */
function ensureFloorBelow(store, c, r, z) {
  if (z !== WORLD_MIN_Z) return;
  if (!store.has(c, r, z - 1)) store.set(c, r, z - 1, 'bedrock');
}

/** A liquid material is any BLOCKS type flagged `liquid: true` — opt-in, like `gas`/
 * `translucent`. Distinct from `gas`: gravity-first, decreasing-level lateral spread, and a
 * source/finite-volume distinction, rather than gas's uniform dilute-when-unconfined rule. */
export function isLiquidType(type) {
  const def = BLOCKS[type];
  return !!(def && def.liquid);
}

/** This neighbor's liquid level for feeding-comparison purposes, or -1 if it isn't the same
 * liquid type at all (an empty cell, a different material, or solid geometry). A registered
 * SOURCE cell (present in `sourceInfo`) always reports LIQUID_MAX_LEVEL, regardless of what
 * (if anything) is in `levelMap` for it. */
function neighborLiquidLevel(store, levelMap, sourceInfo, c, r, z, type) {
  const block = store.get(c, r, z);
  if (!block) return -1;
  if (parseBlock(block).type !== type) return -1;
  const key = keyFor(c, r, z);
  if (sourceInfo.has(key)) return LIQUID_MAX_LEVEL;
  return levelMap.has(key) ? levelMap.get(key) : -1;
}

/**
 * Advance the liquid simulation by one generation — same dirty-cell-driven shape as stepGas,
 * different propagation rules (Minecraft-style: gravity first, decreasing-level lateral spread
 * only once blocked from falling further, source cells that persist indefinitely unless a
 * FINITE source's tracked volume runs out).
 *
 * `levelMap`: Map of cell key -> integer level remaining, for FLOWING (non-source) cells only
 * (a source's level is always implicitly LIQUID_MAX_LEVEL, never stored here).
 * `sourceInfo`: Map of cell key -> `{ finite: boolean, volume: number|null }`, one entry per
 * SOURCE cell (see CONTENT_TOOLS_PLAN.md's liquid section: finite/infinite is a property of the
 * SOURCE INSTANCE, not the material — the same `water` type can be a finite barrel or an
 * infinite ocean depending on which cell it's placed in). `volume` is only consulted/decremented
 * when `finite` is true; an infinite source (`finite: false`) never depletes.
 * `dirtyCells`: Set of cell keys to re-evaluate THIS call. Returns `{ changed, nextDirty }`,
 * same contract as stepGas.
 */
export function stepLiquid(store, levelMap, sourceInfo, dirtyCells) {
  const nextDirty = new Set();
  let changed = false;

  for (const key of dirtyCells) {
    const [c, r, z] = parseKey(key);
    const block = store.get(c, r, z);
    if (!block) {
      levelMap.delete(key);
      sourceInfo.delete(key);
      continue;
    }
    const parsed = parseBlock(block);
    if (!isLiquidType(parsed.type)) {
      levelMap.delete(key);
      sourceInfo.delete(key);
      continue;
    }

    const isSource = sourceInfo.has(key);
    const level = isSource ? LIQUID_MAX_LEVEL : (levelMap.has(key) ? levelMap.get(key) : LIQUID_MAX_LEVEL);
    if (!isSource) levelMap.set(key, level);

    // Gravity first: an open (empty) cell directly below gets filled at level-1 — EVERY hop
    // costs exactly one level, whether falling or spreading laterally (see the module doc
    // comment on why: a hop that stayed "free" let a tall waterfall reach the ground still at
    // full strength and restart a fresh max-radius lateral flood from wherever it landed, with
    // nothing bounding how far that could ultimately spread on a map with open ground beyond
    // the built terrain — a real bug hit live). Gated on level > 1, same as lateral spread
    // below, so a fully-decayed cell neither falls nor spreads further, just sits (and dries up
    // via the unfed-decay check further down if nothing keeps it fed).
    let flowedThisTick = false;
    if (level > 1 && z - 1 >= WORLD_MIN_Z && !store.has(c, r, z - 1)) {
      const belowKey = keyFor(c, r, z - 1);
      store.set(c, r, z - 1, parsed.type);
      levelMap.set(belowKey, level - 1);
      nextDirty.add(belowKey);
      changed = true;
      flowedThisTick = true;
      ensureFloorBelow(store, c, r, z - 1);
    } else if (level > 1) {
      // Blocked from falling further — spread laterally into ONE open empty neighbor, one
      // level weaker (gradual, matches stepGas's own "one target per tick" reasoning).
      for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nc = c + dc;
        const nr = r + dr;
        if (!store.has(nc, nr, z) && inWorldBounds(nc, nr)) {
          const nKey = keyFor(nc, nr, z);
          store.set(nc, nr, z, parsed.type);
          levelMap.set(nKey, level - 1);
          nextDirty.add(nKey);
          changed = true;
          flowedThisTick = true;
          ensureFloorBelow(store, nc, nr, z);
          break;
        }
      }
      // Diagonal fallback — cardinal-only spread can permanently strand a cell that's only
      // reachable by cutting a corner around a solid obstacle (e.g. a wall's outside corner),
      // even once the flood around it has otherwise fully settled: two separate cardinal arms
      // wrap around the obstacle from different sides and neither one's cardinal neighbors ever
      // include that cell, so it's never filled — a real visible gap hit live ("still some
      // gaps"). Only attempted once no cardinal target was available this tick, and only ONE
      // diagonal per tick, same gradual one-target-per-tick shape as the cardinal spread above.
      if (!flowedThisTick) {
        for (const [dc, dr] of [[1, -1], [1, 1], [-1, 1], [-1, -1]]) {
          const nc = c + dc;
          const nr = r + dr;
          if (!store.has(nc, nr, z) && inWorldBounds(nc, nr)) {
            const nKey = keyFor(nc, nr, z);
            store.set(nc, nr, z, parsed.type);
            levelMap.set(nKey, level - 1);
            nextDirty.add(nKey);
            changed = true;
            flowedThisTick = true;
            ensureFloorBelow(store, nc, nr, z);
            break;
          }
        }
      }
    }

    if (isSource) {
      const info = sourceInfo.get(key);
      if (info.finite && flowedThisTick) {
        info.volume -= 1;
        if (info.volume <= 0) {
          // Finite source exhausted — the source itself dries up too (an emptied barrel),
          // matching "floods and spreads until its fixed volume is exhausted and flat, then
          // stops" (CONTENT_TOOLS_PLAN.md).
          store.remove(c, r, z);
          sourceInfo.delete(key);
          levelMap.delete(key);
          changed = true;
          for (const [dc, dr, dz] of NEIGHBOR_OFFSETS) nextDirty.add(keyFor(c + dc, r + dr, z + dz));
          continue;
        }
      }
      nextDirty.add(key); // infinite sources, and finite ones still with volume, persist forever
      continue;
    }

    // Flowing (non-source) cell: dries up once no longer FED — either by a same-liquid neighbor
    // at a strictly higher level (the normal decreasing-outward-from-source case — now that
    // falling ALSO decays per hop, a waterfall's own segments already satisfy this on their
    // own), or by the cell directly above being the SAME liquid regardless of level (a second,
    // redundant-but-harmless safety net for vertical stability).
    const fedByLevel = NEIGHBOR_OFFSETS.some(
      ([dc, dr, dz]) => neighborLiquidLevel(store, levelMap, sourceInfo, c + dc, r + dr, z + dz, parsed.type) > level,
    );
    const above = store.get(c, r, z + 1);
    const fedFromAbove = !!above && parseBlock(above).type === parsed.type;
    if (!fedByLevel && !fedFromAbove) {
      const newLevel = level - 1;
      if (newLevel <= 0) {
        store.remove(c, r, z);
        levelMap.delete(key);
        changed = true;
        for (const [dc, dr, dz] of NEIGHBOR_OFFSETS) nextDirty.add(keyFor(c + dc, r + dr, z + dz));
        continue;
      }
      levelMap.set(key, newLevel);
      changed = true;
    }
    nextDirty.add(key);
  }

  return { changed, nextDirty };
}

// Same-Z diagonal offsets stepLiquid's own lateral-spread fallback uses (see its "diagonal
// fallback" comment) — a pond can be genuinely CONNECTED through a diagonal-only pinch (e.g.
// wrapping an obstacle's outside corner) that pure cardinal+vertical NEIGHBOR_OFFSETS can't
// cross. getLiquidBodyCells needs to walk the SAME connectivity stepLiquid itself used to fill
// the pond in the first place, or it stops short at exactly that pinch — a real bug hit live:
// promoting only part of a visually-one-piece pond left a sharp height/lighting seam right at
// the diagonal boundary between the promoted (now flat) and un-promoted (still tapering) halves.
const DIAGONAL_OFFSETS = [[1, -1, 0], [1, 1, 0], [-1, 1, 0], [-1, -1, 0]];
const NEIGHBOR_OFFSETS_AND_DIAGONALS = [...NEIGHBOR_OFFSETS, ...DIAGONAL_OFFSETS];

/**
 * Flood-fills outward from (c,r,z) through every CONNECTED cell of the same liquid type —
 * cardinal + vertical (`NEIGHBOR_OFFSETS`) PLUS same-Z diagonal (`DIAGONAL_OFFSETS`), matching
 * every connectivity `stepLiquid` itself can actually spread through (see its own diagonal
 * fallback), so this never stops short of a pond's true full extent. Stops at solid geometry,
 * empty space, or a different liquid type. Pure query — never mutates store/levelMap/
 * sourceInfo. Returns `[]` if (c,r,z) isn't liquid at all.
 */
export function getLiquidBodyCells(store, c, r, z) {
  const startBlock = store.get(c, r, z);
  if (!startBlock) return [];
  const type = parseBlock(startBlock).type;
  if (!isLiquidType(type)) return [];

  const startKey = keyFor(c, r, z);
  const visited = new Set([startKey]);
  const queue = [[c, r, z]];
  const cells = [];
  while (queue.length) {
    const [cc, cr, cz] = queue.shift();
    cells.push({ c: cc, r: cr, z: cz });
    for (const [dc, dr, dz] of NEIGHBOR_OFFSETS_AND_DIAGONALS) {
      const nc = cc + dc;
      const nr = cr + dr;
      const nz = cz + dz;
      const nKey = keyFor(nc, nr, nz);
      if (visited.has(nKey)) continue;
      const nBlock = store.get(nc, nr, nz);
      if (!nBlock || parseBlock(nBlock).type !== type) continue;
      visited.add(nKey);
      queue.push([nc, nr, nz]);
    }
  }
  return cells;
}

/**
 * Promote an entire CONNECTED body of liquid (see getLiquidBodyCells) to permanent full-height
 * infinite sources, in one shot — the fix for "a big hand-spread pond looks like a Minecraft
 * ocean mid-flood forever" (tapered edges, a visibly 'proud' source cell next to shallow
 * decayed neighbors) without needing a save/reload round-trip (import already promotes every
 * water cell to a source — see voxel.html's own scan — this is the same promotion, but callable
 * live, on demand, mid-session). Wired into voxel.html's existing "click an existing same-
 * liquid-type cell to re-source it" interaction (already established for pond-building) so one
 * click on ANY part of a settled pond turns the WHOLE connected body into a uniform permanent
 * lake instantly, not just the one cell clicked.
 *
 * Does NOT fill genuinely empty gaps (cells the spread never reached at all — those have no
 * liquid block to flood-fill through in the first place; still needs the source's own reach
 * increased or the gap painted over directly) — this only smooths/uniforms an ALREADY-connected
 * body's existing cells, which is the entire discontinuity/tapering complaint this fixes.
 */
export function promoteLiquidBodyToSource(store, levelMap, sourceInfo, dirtySet, c, r, z) {
  const cells = getLiquidBodyCells(store, c, r, z);
  for (const { c: cc, r: cr, z: cz } of cells) {
    const key = keyFor(cc, cr, cz);
    levelMap.delete(key);
    sourceInfo.set(key, { finite: false, volume: null });
    markSpreadDirty(dirtySet, cc, cr, cz);
  }
  return cells.length;
}
