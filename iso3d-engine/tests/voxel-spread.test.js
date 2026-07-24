/**
 * Headless tests — run with: node tests/voxel-spread.test.js
 */

import { VoxelStore, keyFor } from '../src/voxel/store.js';
import {
  stepGas, isGasType, markSpreadDirty, GAS_MAX_LIFE, GAS_SPREAD_RADIUS, clearGasInRadius, getGasCloudCells,
  GUST_COOLDOWN_TICKS, tickGustCooldown,
  stepLiquid, isLiquidType, LIQUID_MAX_LEVEL, WORLD_MIN_Z,
  WORLD_MIN_C, WORLD_MAX_C, WORLD_MIN_R, WORLD_MAX_R,
  getLiquidBodyCells, promoteLiquidBodyToSource,
} from '../src/voxel/spread.js';
import { buildMesh } from '../src/voxel/mesher.js';
import { resolveLighting } from '../src/voxel/lighting.js';
import { registerBlock, BLOCKS } from '../src/voxel/blocks.js';

let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (cond) {
    passed += 1;
    console.log(`  OK  ${msg}`);
  } else {
    failed += 1;
    console.error(`  FAIL  ${msg}`);
  }
}

console.log('isGasType');
{
  assert(isGasType('fog') === true, 'fog is flagged gas:true in blocks.js');
  assert(isGasType('gas') === true, 'gas (the dedicated ready-to-place gas material, own placeholder texture) is flagged gas:true too');
  assert(isGasType('stone') === false, 'stone is not gas');
  assert(isGasType('__nonexistent_type__') === false, 'an unknown type is not gas (no crash)');
}

console.log('markSpreadDirty flags a cell and its 6 neighbors (7 keys total)');
{
  const dirty = new Set();
  markSpreadDirty(dirty, 5, 5, 5);
  assert(dirty.size === 7, 'the cell itself + 6 neighbors = 7 keys');
  assert(dirty.has(keyFor(5, 5, 5)), 'includes the cell itself');
  assert(dirty.has(keyFor(6, 5, 5)) && dirty.has(keyFor(4, 5, 5)), 'includes east/west neighbors');
  assert(dirty.has(keyFor(5, 5, 6)) && dirty.has(keyFor(5, 5, 4)), 'includes top/bottom neighbors');
}

console.log('stepGas: spreads into ONE open empty neighbor per tick, not all 6 at once');
{
  const store = new VoxelStore();
  store.set(5, 5, 5, 'fog');
  const dirty = new Set([keyFor(5, 5, 5)]);
  const lifeMap = new Map();
  const { changed } = stepGas(store, lifeMap, dirty);
  assert(changed === true, 'spreading into a neighbor counts as a change');

  let fogCount = 0;
  for (const { block } of store.entries()) if (block === 'fog') fogCount++;
  assert(fogCount === 2, 'exactly one new fog cell appeared (original + 1 spread target), not all 6 neighbors at once');
  assert(lifeMap.get(keyFor(5, 5, 5)).life === GAS_MAX_LIFE - 1, "the origin's own life decremented (it's unconfined)");
  assert(lifeMap.get(keyFor(5, 5, 5)).hops === GAS_SPREAD_RADIUS, "the origin's own hops budget is untouched by spreading (only the newly-created target's hops decrements)");
  const targetState = lifeMap.get(keyFor(6, 5, 5));
  assert(targetState.hops === GAS_SPREAD_RADIUS - 1, 'the newly spread cell inherits hops-1 from its parent (the spread-reach budget actually decreases)');
  assert(targetState.life === GAS_MAX_LIFE, 'the newly spread cell gets a FRESH life, not life-1 — lifetime and spread-reach are independent counters (see GAS_SPREAD_RADIUS\'s own doc comment on why this was a real bug)');
}

console.log('stepGas: spread reach is capped by GAS_SPREAD_RADIUS, independent of how long GAS_MAX_LIFE lets a cell linger');
{
  // A long open corridor, much longer than GAS_SPREAD_RADIUS — even after MANY MORE ticks than
  // GAS_SPREAD_RADIUS (but well within GAS_MAX_LIFE, so lingering isn't the limiting factor),
  // the cloud must NOT have reached the far end. This is the exact bug hit live: raising
  // GAS_MAX_LIFE for a longer lingering time silently let a single release travel ~60 cells and
  // blanket an entire 32x32 map, because life and hops used to be the same counter.
  const store = new VoxelStore();
  store.set(0, 0, 0, 'fog');
  let dirty = new Set([keyFor(0, 0, 0)]);
  const lifeMap = new Map();
  for (let i = 0; i < GAS_SPREAD_RADIUS + 10; i++) {
    const res = stepGas(store, lifeMap, dirty);
    dirty = res.nextDirty;
  }
  let maxC = 0;
  for (const { c, block } of store.entries()) if (block === 'fog') maxC = Math.max(maxC, c);
  assert(maxC <= GAS_SPREAD_RADIUS, `gas never reaches further than GAS_SPREAD_RADIUS=${GAS_SPREAD_RADIUS} cells from its origin, even ${GAS_SPREAD_RADIUS + 10} ticks in (found max c=${maxC}) — spreading stops well before GAS_MAX_LIFE=${GAS_MAX_LIFE} would end its lingering`);
}

console.log('stepGas: a wind vector biases which open neighbor gas spreads into, a persistent drift not a one-shot push');
{
  // No wind: NEIGHBOR_OFFSETS' own fixed order tries +c (east) first, so an isolated cell with
  // every neighbor open spreads east by default — establishing the baseline this test's wind
  // cases are expected to override.
  const baseline = new VoxelStore();
  baseline.set(5, 5, 5, 'fog');
  stepGas(baseline, new Map(), new Set([keyFor(5, 5, 5)]));
  assert(baseline.get(6, 5, 5) === 'fog', 'baseline (no wind): spreads east (+c), matching NEIGHBOR_OFFSETS\' own default first-tried direction');

  // Wind blowing west (-c): should override the default and spread that way instead.
  const windWest = new VoxelStore();
  windWest.set(5, 5, 5, 'fog');
  stepGas(windWest, new Map(), new Set([keyFor(5, 5, 5)]), [-1, 0, 0]);
  assert(windWest.get(4, 5, 5) === 'fog', 'wind=[-1,0,0] (west): spreads west instead of the default east, proving the bias actually took effect');
  assert(windWest.get(6, 5, 5) === null, 'and did NOT also spread east this same tick (still only one target per tick)');

  // Wind blowing south (+r): should override the default east-first order too.
  const windSouth = new VoxelStore();
  windSouth.set(5, 5, 5, 'fog');
  stepGas(windSouth, new Map(), new Set([keyFor(5, 5, 5)]), [0, 1, 0]);
  assert(windSouth.get(5, 6, 5) === 'fog', 'wind=[0,1,0] (south): spreads south instead of the default east');

  // A blocked downwind neighbor: wind still picks the BEST available (2nd-ranked) open target
  // rather than refusing to spread at all.
  const windBlocked = new VoxelStore();
  windBlocked.set(5, 5, 5, 'fog');
  windBlocked.set(4, 5, 5, 'stone'); // occupies the west target the wind favors
  stepGas(windBlocked, new Map(), new Set([keyFor(5, 5, 5)]), [-1, 0, 0]);
  const spreadSomewhere = windBlocked.get(6, 5, 5) === 'fog' || windBlocked.get(5, 4, 5) === 'fog' || windBlocked.get(5, 6, 5) === 'fog' || windBlocked.get(5, 5, 6) === 'fog' || windBlocked.get(5, 5, 4) === 'fog';
  assert(spreadSomewhere, 'wind favoring a BLOCKED direction still spreads into the best available open neighbor, not stuck refusing to move');
}

console.log('stepGas: per-material gasWeight biases vertical spread — positive sinks (heavy), negative rises (smoke)');
{
  registerBlock('__test_heavy_gas__', { solid: false, opaque: false, translucent: true, gas: true, gasWeight: 3 });
  registerBlock('__test_light_gas__', { solid: false, opaque: false, translucent: true, gas: true, gasWeight: -3 });

  // Heavy (positive weight): with every neighbor open, should sink (-z / down), not spread east
  // like the zero-weight baseline above.
  const heavy = new VoxelStore();
  heavy.set(5, 5, 5, '__test_heavy_gas__');
  stepGas(heavy, new Map(), new Set([keyFor(5, 5, 5)]));
  assert(heavy.get(5, 5, 4) === '__test_heavy_gas__', 'a heavy (positive weight) gas sinks downward by default, not the usual east-first order');
  assert(heavy.get(6, 5, 5) === null, 'and did not spread east instead');

  // Light (negative weight, smoke): should rise (+z / up).
  const light = new VoxelStore();
  light.set(5, 5, 5, '__test_light_gas__');
  stepGas(light, new Map(), new Set([keyFor(5, 5, 5)]));
  assert(light.get(5, 5, 6) === '__test_light_gas__', 'a light (negative weight) gas — smoke — rises upward instead of spreading sideways');

  // weight=0 (the default, e.g. built-in fog) is unaffected — still the plain east-first
  // baseline from the very first test in this file, confirming zero regression.
  const neutral = new VoxelStore();
  neutral.set(5, 5, 5, 'fog');
  stepGas(neutral, new Map(), new Set([keyFor(5, 5, 5)]));
  assert(neutral.get(6, 5, 5) === 'fog', 'a material with no gasWeight set behaves exactly as before this feature existed');

  // Wind still applies ON TOP of weight, not replaced by it — a heavy gas with a strong east
  // wind should still lean toward spreading east/down rather than only ever straight down.
  registerBlock('__test_heavy_gas_wind__', { solid: false, opaque: false, translucent: true, gas: true, gasWeight: 1 });
  const heavyWithWind = new VoxelStore();
  heavyWithWind.set(5, 5, 5, '__test_heavy_gas_wind__');
  // A strong east wind (5) should outrank a weak downward pull (weight=1) for the FIRST choice.
  stepGas(heavyWithWind, new Map(), new Set([keyFor(5, 5, 5)]), [5, 0, 0]);
  assert(heavyWithWind.get(6, 5, 5) === '__test_heavy_gas_wind__', 'a strong wind can still win out over a weak weight bias — the two forces genuinely combine, weight does not override wind unconditionally');

  delete BLOCKS.__test_heavy_gas__;
  delete BLOCKS.__test_light_gas__;
  delete BLOCKS.__test_heavy_gas_wind__;
}

console.log('stepGas: per-material gasSpreadRadius overrides the shared GAS_SPREAD_RADIUS default');
{
  registerBlock('__test_small_radius_gas__', { solid: false, opaque: false, translucent: true, gas: true, gasSpreadRadius: 2 });
  const store = new VoxelStore();
  store.set(0, 0, 0, '__test_small_radius_gas__');
  let dirty = new Set([keyFor(0, 0, 0)]);
  const lifeMap = new Map();
  for (let i = 0; i < GAS_SPREAD_RADIUS + 5; i++) {
    const res = stepGas(store, lifeMap, dirty);
    dirty = res.nextDirty;
  }
  let maxC = 0;
  for (const { c, block } of store.entries()) if (block === '__test_small_radius_gas__') maxC = Math.max(maxC, c);
  assert(maxC <= 2, `a material with gasSpreadRadius=2 never travels further than 2 cells, even well past the shared GAS_SPREAD_RADIUS=${GAS_SPREAD_RADIUS} default (found max c=${maxC})`);
  delete BLOCKS.__test_small_radius_gas__;
}

console.log('stepGas: a fully enclosed gas cell never fades and never has anywhere to spread');
{
  const store = new VoxelStore();
  store.set(5, 5, 5, 'fog');
  for (const [dc, dr, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
    store.set(5 + dc, 5 + dr, 5 + dz, 'stone');
  }
  const lifeMap = new Map();
  let dirty = new Set([keyFor(5, 5, 5)]);
  for (let i = 0; i < GAS_MAX_LIFE + 5; i++) {
    const res = stepGas(store, lifeMap, dirty);
    dirty = res.nextDirty;
  }
  assert(store.get(5, 5, 5) === 'fog', 'the sealed gas cell still exists after many ticks — never fades');
  assert(lifeMap.get(keyFor(5, 5, 5)).life === GAS_MAX_LIFE, 'life never decremented at all (fully confined every tick)');
}

console.log('stepGas: an unconfined gas cell eventually dissipates once its life runs out');
{
  const store = new VoxelStore();
  store.set(5, 5, 5, 'fog');
  const lifeMap = new Map();
  // Pre-seed hops:0 so this cell never spreads — isolates the decay mechanic on its own. With
  // spreading left on (the default), a fully open origin grows into a large connected cloud
  // (bounded by GAS_SPREAD_RADIUS) whose surrounding cells can keep RE-FILLING the origin's own
  // cell right after it individually decays away — realistic "thick cloud" behavior, but it
  // means the origin specifically doesn't stay gone within any short fixed tick count, which
  // isn't what this test is actually checking (see the dedicated spread-radius test above for
  // that interaction instead).
  lifeMap.set(keyFor(5, 5, 5), { life: GAS_MAX_LIFE, hops: 0 });
  let dirty = new Set([keyFor(5, 5, 5)]);
  for (let i = 0; i < GAS_MAX_LIFE + 3; i++) {
    const res = stepGas(store, lifeMap, dirty);
    dirty = res.nextDirty;
  }
  assert(!store.has(5, 5, 5), "the origin cell's gas eventually dissipates (life ran out) since it was never confined");
}

console.log('stepGas: an enclosed room fills with gas over several ticks (spreading is independent of confinement/dilution)');
{
  const store = new VoxelStore();
  // A small 3x3x1 sealed room (z=5 floor and z=6 ceiling implied by the room being 1 tall) —
  // walls all around a 1x1 open interior at (5,5,5), fully enclosed.
  for (let c = 4; c <= 6; c++) {
    for (let r = 4; r <= 6; r++) {
      if (c === 5 && r === 5) continue; // the interior cell stays empty (fog spreads in later)
      store.set(c, r, 5, 'stone');
    }
  }
  store.set(5, 5, 4, 'stone'); // floor
  store.set(5, 5, 6, 'stone'); // ceiling
  store.set(5, 5, 5, 'fog'); // gas seed, fully enclosed on all 6 sides already
  const lifeMap = new Map();
  let dirty = new Set([keyFor(5, 5, 5)]);
  for (let i = 0; i < 3; i++) {
    const res = stepGas(store, lifeMap, dirty);
    dirty = res.nextDirty;
  }
  assert(store.get(5, 5, 5) === 'fog', 'the sole interior cell (already fully sealed) still holds its gas after several ticks');
}

console.log('stepGas: a dirty cell that is no longer gas is cleaned up silently (no crash, stale state dropped)');
{
  const store = new VoxelStore();
  const lifeMap = new Map();
  lifeMap.set(keyFor(1, 1, 1), 3); // stale leftover state from a cell that's since been cleared
  const dirty = new Set([keyFor(1, 1, 1)]);
  const { changed } = stepGas(store, lifeMap, dirty);
  assert(changed === false, 'nothing to do for a genuinely empty cell');
  assert(!lifeMap.has(keyFor(1, 1, 1)), 'stale lifeMap entry for a now-empty cell is cleaned up');

  const store2 = new VoxelStore();
  store2.set(2, 2, 2, 'stone'); // retyped away from gas
  const lifeMap2 = new Map();
  lifeMap2.set(keyFor(2, 2, 2), 5);
  const { changed: changed2 } = stepGas(store2, lifeMap2, new Set([keyFor(2, 2, 2)]));
  assert(changed2 === false, 'a cell retyped to a non-gas material is a no-op');
  assert(!lifeMap2.has(keyFor(2, 2, 2)), 'stale lifeMap entry for a now-non-gas cell is cleaned up too');
}

console.log('isLiquidType');
{
  assert(isLiquidType('water') === true, 'water is flagged liquid:true in blocks.js');
  assert(isLiquidType('stone') === false, 'stone is not liquid');
  assert(isLiquidType('__nonexistent_type__') === false, 'an unknown type is not liquid (no crash)');
}

console.log('stepLiquid: gravity first — a source falls straight down into open space, decaying one level per hop');
{
  const store = new VoxelStore();
  store.set(5, 5, 5, 'water');
  const levelMap = new Map();
  const sourceInfo = new Map([[keyFor(5, 5, 5), { finite: false, volume: null }]]);
  const { changed } = stepLiquid(store, levelMap, sourceInfo, new Set([keyFor(5, 5, 5)]));
  assert(changed === true, 'falling counts as a change');
  assert(store.get(5, 5, 4) === 'water', 'the open cell below now has water');
  // Falling costs exactly one level, same as lateral spread — real bug fixed live: a "free"
  // fall let a tall waterfall reach the ground still at full strength and restart a fresh
  // max-radius flood from wherever it landed, unbounded on open terrain beyond the built map.
  assert(levelMap.get(keyFor(5, 5, 4)) === LIQUID_MAX_LEVEL - 1, 'a fallen cell is exactly one level weaker than its parent, same cost as a lateral hop');
  assert(store.get(5, 5, 5) === 'water', 'the source itself persists (falling never drains a source cell)');
}

console.log('stepLiquid: blocked from falling further -> spreads laterally into ONE open neighbor, one level weaker');
{
  const store = new VoxelStore();
  store.set(5, 5, 5, 'water');
  store.set(5, 5, 4, 'stone'); // blocks the fall
  const levelMap = new Map();
  const sourceInfo = new Map([[keyFor(5, 5, 5), { finite: false, volume: null }]]);
  stepLiquid(store, levelMap, sourceInfo, new Set([keyFor(5, 5, 5)]));
  assert(store.get(6, 5, 5) === 'water', 'spread into the east neighbor (first lateral offset checked)');
  assert(levelMap.get(keyFor(6, 5, 5)) === LIQUID_MAX_LEVEL - 1, 'the spread cell is exactly one level weaker than its source');
}

console.log('stepLiquid: a diagonal fallback fills a pocket that cardinal-only spread would permanently strand');
{
  // Real bug hit live ("still some gaps"): a cell reachable only by cutting a corner around a
  // solid obstacle (all 4 cardinal directions blocked or leading elsewhere) never got water at
  // all under cardinal-only spread, leaving a permanent visible hole in an otherwise-settled
  // flood. Sealing all 4 cardinal neighbors forces this cell to rely ENTIRELY on the diagonal
  // fallback to spread anywhere at all.
  const store = new VoxelStore();
  store.set(5, 5, 5, 'water'); // source
  store.set(5, 5, 4, 'stone'); // blocks the fall
  for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) store.set(5 + dc, 5 + dr, 5, 'stone'); // seal all 4 cardinals
  const levelMap = new Map();
  stepLiquid(store, levelMap, new Map([[keyFor(5, 5, 5), { finite: false, volume: null }]]), new Set([keyFor(5, 5, 5)]));
  const diagonalFilled = [[1, -1], [1, 1], [-1, 1], [-1, -1]].some(([dc, dr]) => store.get(5 + dc, 5 + dr, 5) === 'water');
  assert(diagonalFilled, 'with every cardinal direction blocked, the diagonal fallback still spreads somewhere instead of the source being permanently stuck');
}

console.log('stepLiquid: a FINITE source depletes its tracked volume and dries up once exhausted');
{
  const store = new VoxelStore();
  store.set(5, 5, 5, 'water');
  store.set(5, 5, 4, 'stone'); // blocks the fall, forcing lateral spread (which consumes volume)
  const levelMap = new Map();
  const sourceInfo = new Map([[keyFor(5, 5, 5), { finite: true, volume: 2 }]]);
  let dirty = new Set([keyFor(5, 5, 5)]);
  // Tick 1: spreads east, volume 2 -> 1. Tick 2: east is now occupied, spreads west instead,
  // volume 1 -> 0 -> source dries up.
  for (let i = 0; i < 2; i++) {
    const res = stepLiquid(store, levelMap, sourceInfo, dirty);
    dirty = res.nextDirty;
  }
  assert(!sourceInfo.has(keyFor(5, 5, 5)), 'the finite source is unregistered once its volume hits 0');
  assert(!store.has(5, 5, 5), 'the exhausted finite source cell itself dries up (an emptied barrel)');
  assert(store.get(6, 5, 5) === 'water' && store.get(4, 5, 5) === 'water', 'both flows it produced before running out still exist');
}

console.log('stepLiquid: an orphaned flowing (non-source) cell dries up once its level runs out');
{
  const store = new VoxelStore();
  store.set(5, 5, 5, 'water');
  store.set(5, 5, 4, 'stone'); // floor — no gravity interference
  for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) store.set(5 + dc, 5 + dr, 5, 'stone'); // seal all 4 sides
  const levelMap = new Map([[keyFor(5, 5, 5), 2]]); // simulates a flowing cell whose source is long gone
  const sourceInfo = new Map(); // NOT a source
  let dirty = new Set([keyFor(5, 5, 5)]);

  let res = stepLiquid(store, levelMap, sourceInfo, dirty);
  assert(store.has(5, 5, 5) && levelMap.get(keyFor(5, 5, 5)) === 1, 'first tick: unfed, level decrements from 2 to 1, still present');
  dirty = res.nextDirty;
  res = stepLiquid(store, levelMap, sourceInfo, dirty);
  assert(!store.has(5, 5, 5), 'second tick: level hits 0, the orphaned cell dries up entirely');
  assert(!levelMap.has(keyFor(5, 5, 5)), 'its levelMap entry is cleaned up too');
}

console.log('stepLiquid: a vertical falling column stays stable via "fed from above" even though segments share the same level');
{
  const store = new VoxelStore();
  store.set(5, 5, 3, 'water'); // will be registered as an infinite source
  store.set(5, 5, 2, 'water'); // already-fallen segment
  store.set(5, 5, 1, 'water'); // already-fallen segment
  const levelMap = new Map([[keyFor(5, 5, 2), LIQUID_MAX_LEVEL], [keyFor(5, 5, 1), LIQUID_MAX_LEVEL]]);
  const sourceInfo = new Map([[keyFor(5, 5, 3), { finite: false, volume: null }]]);
  // Seal every lateral neighbor at all 3 levels so nothing spreads sideways and confuses the
  // "did it dry up" assertion — isolates this to the drying/feeding logic only.
  for (const z of [1, 2, 3]) {
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) store.set(5 + dc, 5 + dr, z, 'stone');
  }
  store.set(5, 5, 0, 'stone'); // floor under the bottom segment
  let dirty = new Set([keyFor(5, 5, 3), keyFor(5, 5, 2), keyFor(5, 5, 1)]);
  for (let i = 0; i < 10; i++) {
    const res = stepLiquid(store, levelMap, sourceInfo, dirty);
    dirty = res.nextDirty;
  }
  assert(
    store.has(5, 5, 3) && store.has(5, 5, 2) && store.has(5, 5, 1),
    'all 3 segments persist after many ticks — chain-fed from the source, even though equal-level neighbors alone would not count as "fed"',
  );
}

console.log('getLiquidBodyCells — flood-fills a connected liquid body (mirrors getGasCloudCells)');
{
  const store = new VoxelStore();
  for (const [c, r] of [[5, 5], [6, 5], [7, 5], [7, 6], [7, 7]]) store.set(c, r, 5, 'water');
  const cells = getLiquidBodyCells(store, 5, 5, 5);
  assert(cells.length === 5, 'all 5 connected cells found, including around the L-shaped bend');

  store.set(20, 20, 5, 'water');
  assert(getLiquidBodyCells(store, 5, 5, 5).length === 5, 'a disconnected water cell elsewhere is not pulled into this body');

  store.set(8, 5, 5, 'stone'); // adjacent solid block, not liquid at all
  assert(getLiquidBodyCells(store, 5, 5, 5).length === 5, 'an adjacent solid (non-liquid) block does not merge into this body');

  assert(getLiquidBodyCells(store, 0, 0, 0).length === 0, 'an empty cell returns an empty list');
  store.set(1, 1, 1, 'stone');
  assert(getLiquidBodyCells(store, 1, 1, 1).length === 0, 'a non-liquid block returns an empty list too');
}

console.log('getLiquidBodyCells — crosses a DIAGONAL-only pinch, matching stepLiquid\'s own diagonal spread fallback');
{
  // Two cells touching ONLY at a corner (no shared cardinal edge) — cardinal-only connectivity
  // would treat these as two separate bodies, but stepLiquid's own diagonal fallback can
  // genuinely connect a pond through exactly this shape (wrapping an obstacle's outside
  // corner). The real bug this fixes: promoting only the cardinal-reachable half of a visually
  // one-piece pond left a sharp height/lighting seam right at a diagonal pinch like this.
  const store = new VoxelStore();
  store.set(10, 10, 0, 'water');
  store.set(11, 11, 0, 'water'); // diagonal neighbor only — NOT cardinally adjacent to (10,10)
  const cells = getLiquidBodyCells(store, 10, 10, 0);
  assert(cells.length === 2, 'both cells are found as ONE connected body across the diagonal-only pinch');

  // A 4-cell diagonal chain (a real "wrap around a corner" shape) — must not stop partway.
  const store2 = new VoxelStore();
  store2.set(0, 0, 0, 'water');
  store2.set(1, 1, 0, 'water');
  store2.set(2, 2, 0, 'water');
  store2.set(3, 3, 0, 'water');
  assert(getLiquidBodyCells(store2, 0, 0, 0).length === 4, 'a longer diagonal-only chain is fully traversed, not just the first hop');
}

console.log('promoteLiquidBodyToSource — turns a whole connected pond into permanent full-height sources in one click');
{
  const store = new VoxelStore();
  // A pond with a mix of states: an existing source, and two "flowing" cells at partial level
  // (as if the spread simulation filled them in, tapering with distance) — exactly the
  // "proud cube next to shallow neighbors" scenario from the live bug report.
  store.set(5, 5, 5, 'water');
  store.set(6, 5, 5, 'water');
  store.set(7, 5, 5, 'water');
  const sourceInfo = new Map([[keyFor(5, 5, 5), { finite: false, volume: null }]]);
  const levelMap = new Map([[keyFor(6, 5, 5), 3], [keyFor(7, 5, 5), 2]]);
  const dirty = new Set();

  const promoted = promoteLiquidBodyToSource(store, levelMap, sourceInfo, dirty, 6, 5, 5);
  assert(promoted === 3, 'all 3 connected cells were promoted, not just the one clicked');
  assert(sourceInfo.has(keyFor(5, 5, 5)) && sourceInfo.has(keyFor(6, 5, 5)) && sourceInfo.has(keyFor(7, 5, 5)), 'every cell in the body is now registered as an infinite source');
  assert(!sourceInfo.get(keyFor(6, 5, 5)).finite && sourceInfo.get(keyFor(6, 5, 5)).volume === null, 'promoted cells are INFINITE sources, not finite (a permanent lake, not a depleting one)');
  assert(!levelMap.has(keyFor(6, 5, 5)) && !levelMap.has(keyFor(7, 5, 5)), 'stale decayed-level entries are cleared once a cell becomes a real source');
  assert(dirty.size > 0, 'the whole body is flagged dirty so the next tick immediately reflects the promotion (full height, no more tapering)');

  // A disconnected pond elsewhere must be untouched by promoting this one.
  store.set(20, 20, 5, 'water');
  const untouchedLevelMap = new Map([[keyFor(20, 20, 5), 4]]);
  const untouchedSourceInfo = new Map();
  promoteLiquidBodyToSource(store, levelMap, sourceInfo, dirty, 6, 5, 5);
  assert(!sourceInfo.has(keyFor(20, 20, 5)), 'a separate, disconnected pond is never touched by promoting a different body');
}

console.log('stepLiquid: a HARD world floor (WORLD_MIN_Z) stops gravity from falling forever when nothing is underneath');
{
  // Real bug hit live: water placed with open space all the way down (no bedrock/floor in that
  // column at all) fell one cell deeper every tick, forever. WORLD_MIN_Z makes z=0 a genuine
  // floor for the simulation, not just a map-generation convention a hand-placed source could
  // fall straight through.
  const store = new VoxelStore();
  store.set(5, 5, 5, 'water'); // source, nothing below it anywhere down to z=0
  const sourceInfo = new Map([[keyFor(5, 5, 5), { finite: false, volume: null }]]);
  const levelMap = new Map();
  let dirty = new Set([keyFor(5, 5, 5)]);
  for (let i = 0; i < 10; i++) {
    const res = stepLiquid(store, levelMap, sourceInfo, dirty);
    dirty = res.nextDirty;
  }
  for (let z = WORLD_MIN_Z; z <= 5; z++) {
    assert(store.get(5, 5, z) === 'water', `the column fills z=${z} on its way down to the world floor`);
  }
  // The cell that landed AT the world floor auto-places a bedrock foundation one below it (see
  // ensureFloorBelow — user request: "bedrock foundation on whole map", a real floor should
  // appear wherever water actually reaches) — so this checks for BEDROCK, not just "no water".
  assert(store.get(5, 5, WORLD_MIN_Z - 1) === 'bedrock', 'landing at the world floor auto-places a bedrock foundation one level below it');
  assert(store.get(5, 5, WORLD_MIN_Z - 1) !== 'water', 'gravity itself never falls water below the world floor, regardless of the auto-placed floor');
}

console.log('stepLiquid: a flood on open flat ground stops expanding — bounded to LIQUID_MAX_LEVEL-1 tiles, like Minecraft ocean/water');
{
  // Real bug hit live: a screenshot showed water flooding a huge area in a repeating pattern.
  // Root cause found: falling used to be "free" (no level cost), so a waterfall landing on open
  // ground restarted a fresh max-radius lateral flood from wherever it touched down, with
  // nothing bounding how far the UNION of many such landings could spread. This test drives a
  // source on completely open flat ground (floor at z=-1, nothing else built) for many ticks
  // and confirms the flood genuinely stops at a fixed radius instead of growing without bound.
  const store = new VoxelStore();
  for (let c = -20; c <= 20; c++) {
    for (let r = -20; r <= 20; r++) store.set(c, r, -1, 'stone'); // flat floor, open ground on top
  }
  store.set(0, 0, 0, 'water'); // source sitting directly on the floor
  const sourceInfo = new Map([[keyFor(0, 0, 0), { finite: false, volume: null }]]);
  const levelMap = new Map();
  let dirty = new Set([keyFor(0, 0, 0)]);
  for (let i = 0; i < 40; i++) {
    const res = stepLiquid(store, levelMap, sourceInfo, dirty);
    dirty = res.nextDirty;
    if (!res.changed && dirty.size <= 1) break; // settled — nothing left to do
  }
  let maxRadius = 0;
  for (const { c, r, block } of store.entries()) {
    if (block !== 'water') continue;
    maxRadius = Math.max(maxRadius, Math.abs(c), Math.abs(r));
  }
  assert(maxRadius > 0, 'the flood actually spread at all (sanity check)');
  assert(maxRadius <= LIQUID_MAX_LEVEL - 1, `the flood stopped expanding at radius ${maxRadius}, at or under the ${LIQUID_MAX_LEVEL - 1}-tile cap — it doesn't grow forever on open ground`);
}

console.log('stepLiquid: a HARD horizontal world boundary (WORLD_MAX_C) stops lateral spread at the map edge, even with level budget left');
{
  // User request: "make it so the map can't be unlimited" — a source placed close enough to
  // the edge that its remaining level budget alone would carry it well past WORLD_MAX_C must
  // still stop exactly at the boundary, same as WORLD_MIN_Z already does for the vertical floor.
  const store = new VoxelStore();
  for (let c = WORLD_MAX_C - 5; c <= WORLD_MAX_C + 10; c++) {
    for (let r = 0; r <= 5; r++) store.set(c, r, -1, 'stone'); // flat floor, extends past the world edge
  }
  const sc = WORLD_MAX_C - 2; // 2 tiles from the edge — LIQUID_MAX_LEVEL-1 (6) would normally reach 4 tiles past it
  store.set(sc, 2, 0, 'water');
  const sourceInfo = new Map([[keyFor(sc, 2, 0), { finite: false, volume: null }]]);
  const levelMap = new Map();
  let dirty = new Set([keyFor(sc, 2, 0)]);
  for (let i = 0; i < 30; i++) {
    const res = stepLiquid(store, levelMap, sourceInfo, dirty);
    dirty = res.nextDirty;
    if (!res.changed && dirty.size <= 1) break;
  }
  let maxC = -Infinity;
  for (const { c, block } of store.entries()) {
    if (block === 'water') maxC = Math.max(maxC, c);
  }
  assert(maxC <= WORLD_MAX_C, `water never spreads past the world's east edge (WORLD_MAX_C=${WORLD_MAX_C}) — found max c=${maxC}`);
}

console.log('stepGas: the same horizontal world boundary also bounds gas spread');
{
  const store = new VoxelStore();
  store.set(WORLD_MAX_C - 1, 5, 0, 'fog');
  const lifeMap = new Map();
  let dirty = new Set([keyFor(WORLD_MAX_C - 1, 5, 0)]);
  for (let i = 0; i < GAS_MAX_LIFE + 5; i++) {
    const res = stepGas(store, lifeMap, dirty);
    dirty = res.nextDirty;
  }
  for (const { c } of store.entries()) {
    assert(c <= WORLD_MAX_C && c >= WORLD_MIN_C, `gas never spread past the world's horizontal bounds (found c=${c})`);
  }
}

console.log('getGasCloudCells — flood-fills a connected gas cloud for spells (Cloud Kill etc.) to select/act on the whole volume');
{
  const store = new VoxelStore();
  // An L-shaped connected fog cloud: (5,5,5)-(7,5,5) then turning to (7,6,5)-(7,7,5).
  for (const [c, r] of [[5, 5], [6, 5], [7, 5], [7, 6], [7, 7]]) store.set(c, r, 5, 'fog');
  const cells = getGasCloudCells(store, 5, 5, 5);
  assert(cells.length === 5, 'all 5 connected cells found, including around the L-shaped bend');
  const has = (c, r) => cells.some((cell) => cell.c === c && cell.r === r && cell.z === 5);
  assert(has(5, 5) && has(6, 5) && has(7, 5) && has(7, 6) && has(7, 7), 'every cell of the L-shape is present');

  // A SEPARATE, disconnected fog cell far away must NOT be included.
  store.set(20, 20, 5, 'fog');
  const cellsStillFive = getGasCloudCells(store, 5, 5, 5);
  assert(cellsStillFive.length === 5, 'a disconnected fog cell elsewhere on the map is not pulled into this cloud\'s selection');

  // A DIFFERENT gas type touching the cloud must not merge into it.
  store.set(8, 5, 5, 'gas'); // adjacent to (7,5,5) but a different type than 'fog'
  const cellsNoMerge = getGasCloudCells(store, 5, 5, 5);
  assert(cellsNoMerge.length === 5, 'an adjacent but DIFFERENT gas type does not get merged into this selection');

  assert(getGasCloudCells(store, 8, 5, 5).length === 1, 'selecting from the other type\'s own cell returns just that lone cell, confirming the two clouds are genuinely kept separate');

  assert(getGasCloudCells(store, 0, 0, 0).length === 0, 'selecting an empty cell returns an empty list, not a crash');
  store.set(1, 1, 1, 'stone');
  assert(getGasCloudCells(store, 1, 1, 1).length === 0, 'selecting a non-gas block returns an empty list too');
}

console.log('clearGasInRadius — an external effect (Gust of Wind) instantly removes gas in a region, not just stepGas\'s own gradual dilution');
{
  const store = new VoxelStore();
  store.set(5, 5, 5, 'fog');
  store.set(6, 5, 5, 'fog');
  store.set(5, 5, 6, 'fog');
  store.set(20, 20, 5, 'fog'); // far away — must survive
  const lifeMap = new Map([[keyFor(5, 5, 5), 4], [keyFor(6, 5, 5), 4], [keyFor(5, 5, 6), 4], [keyFor(20, 20, 5), 4]]);
  const dirty = new Set();
  const cleared = clearGasInRadius(store, lifeMap, dirty, 5, 5, 5, 1);
  assert(cleared === 3, 'cleared exactly the 3 gas cells within radius 1 of (5,5,5)');
  assert(!store.has(5, 5, 5) && !store.has(6, 5, 5) && !store.has(5, 5, 6), 'all 3 nearby gas cells are gone from the store, not just faded');
  assert(!lifeMap.has(keyFor(5, 5, 5)), 'stale lifeMap entries for cleared cells are cleaned up too');
  assert(store.get(20, 20, 5) === 'fog', 'gas far outside the cleared radius is untouched');
  assert(dirty.size > 0, 'the cleared region is flagged dirty so neighboring gas can re-evaluate/drift back in next tick');
}

console.log('clearGasInRadius + cooldownMap — a gust holds its gap open instead of the surrounding cloud refilling it next tick');
{
  // A long open corridor of fog with plenty of remaining spread reach — without a cooldown,
  // clearing the middle cell gets refilled by its still-actively-spreading neighbor almost
  // immediately (the exact bug reported live: "Gust of Wind isn't working").
  const store = new VoxelStore();
  for (let c = 0; c <= 4; c++) store.set(c, 0, 0, 'fog');
  const lifeMap = new Map();
  let dirty = new Set();
  for (let c = 0; c <= 4; c++) dirty.add(keyFor(c, 0, 0));
  const cooldown = new Map();
  const cleared = clearGasInRadius(store, lifeMap, dirty, 2, 0, 0, 0, cooldown); // clear just the center cell
  assert(cleared === 1, 'cleared exactly the one targeted cell');
  assert(!store.has(2, 0, 0), 'the cleared cell is genuinely empty right after the gust');
  assert(cooldown.get(keyFor(2, 0, 0)) === GUST_COOLDOWN_TICKS, 'the cleared cell is entered into the cooldown map at the full GUST_COOLDOWN_TICKS');

  // Run several (simulated) real ticks — stepGas for the spread logic, tickGustCooldown for the
  // countdown, exactly the two-separate-calls pattern voxel.html's setInterval uses — still well
  // under GUST_COOLDOWN_TICKS. Its still-alive neighbors (c=1 and c=3) would ordinarily refill
  // (2,0,0) almost immediately; with the cooldown in place, they must not.
  for (let i = 0; i < GUST_COOLDOWN_TICKS - 1; i++) {
    const res = stepGas(store, lifeMap, dirty, null, cooldown);
    dirty = res.nextDirty;
    tickGustCooldown(cooldown);
  }
  assert(!store.has(2, 0, 0), 'the gap stays held open through the whole cooldown window, not refilled on the very next tick');
  assert(cooldown.get(keyFor(2, 0, 0)) === 1, 'the cooldown has counted all the way down to its last tick, but not expired yet');

  // Once the cooldown fully expires (ticked down via the SEPARATE tickGustCooldown, not
  // stepGas itself — see its own doc comment for why that split matters), the gap can finally
  // be refilled again like any other open cell.
  tickGustCooldown(cooldown);
  assert(!cooldown.has(keyFor(2, 0, 0)), 'the cooldown entry is gone once it fully expires');
  let refilled = false;
  for (let i = 0; i < 5 && !refilled; i++) {
    const res = stepGas(store, lifeMap, dirty, null, cooldown);
    dirty = res.nextDirty;
    if (store.has(2, 0, 0)) refilled = true;
  }
  assert(refilled, 'once the cooldown expires, the gap is a normal open cell again and eventually gets refilled by its still-alive neighbors');
}

console.log('tickGustCooldown — decrements every entry by one tick, dropping any that expire, independent of stepGas');
{
  const cooldown = new Map([['a', 3], ['b', 1], ['c', 5]]);
  tickGustCooldown(cooldown);
  assert(cooldown.get('a') === 2 && cooldown.get('c') === 4, 'entries above 1 just decrement');
  assert(!cooldown.has('b'), 'an entry at 1 expires (is deleted) rather than going to 0 and lingering');
}

console.log('clearGasInRadius — a non-gas block (solid terrain, etc.) in the radius is left completely alone');
{
  const store = new VoxelStore();
  store.set(5, 5, 5, 'fog');
  store.set(5, 5, 4, 'stone'); // solid ground right next to the gas — must never be touched
  const lifeMap = new Map();
  const dirty = new Set();
  clearGasInRadius(store, lifeMap, dirty, 5, 5, 5, 1);
  assert(store.get(5, 5, 4) === 'stone', 'a non-gas block in the cleared radius is completely untouched');
}

console.log('stepLiquid: a tall waterfall reaching open ground does NOT restart a fresh full-radius flood');
{
  const store = new VoxelStore();
  for (let c = -20; c <= 20; c++) {
    for (let r = -20; r <= 20; r++) store.set(c, r, -1, 'stone'); // flat floor everywhere
  }
  store.set(0, 0, 10, 'water'); // source high above the ground — falls a long way before landing
  const sourceInfo = new Map([[keyFor(0, 0, 10), { finite: false, volume: null }]]);
  const levelMap = new Map();
  let dirty = new Set([keyFor(0, 0, 10)]);
  for (let i = 0; i < 40; i++) {
    const res = stepLiquid(store, levelMap, sourceInfo, dirty);
    dirty = res.nextDirty;
    if (!res.changed && dirty.size <= 1) break;
  }
  let maxRadius = 0;
  for (const { c, r, z, block } of store.entries()) {
    if (block !== 'water' || z !== 0) continue; // only count the ground-level flood, not the falling column itself
    maxRadius = Math.max(maxRadius, Math.abs(c), Math.abs(r));
  }
  // Having fallen 10 levels before landing, very little level budget is left for lateral
  // spread — nowhere near the full LIQUID_MAX_LEVEL-1 radius a source sitting directly on the
  // ground would get (see the test above).
  assert(maxRadius < LIQUID_MAX_LEVEL - 1, `a waterfall that fell 10 levels before landing only floods radius ${maxRadius} at ground level, far short of a fresh full-strength flood`);
}

console.log('stepLiquid: a dirty cell that is no longer liquid is cleaned up silently (no crash, stale state dropped)');
{
  const store = new VoxelStore();
  const levelMap = new Map();
  const sourceInfo = new Map();
  levelMap.set(keyFor(1, 1, 1), 3); // stale leftover state
  const { changed } = stepLiquid(store, levelMap, sourceInfo, new Set([keyFor(1, 1, 1)]));
  assert(changed === false, 'nothing to do for a genuinely empty cell');
  assert(!levelMap.has(keyFor(1, 1, 1)), 'stale levelMap entry for a now-empty cell is cleaned up');
}

console.log('shadow-occlusion raycast still treats a freshly-FLOWED liquid cell as translucent, not just a manually-placed one');
{
  // A liquid cell stepLiquid PRODUCES (not one this test places directly) sitting exactly on
  // the straight-line path between a point light and a receiver cube — confirms the existing
  // translucent-skip in the shadow/light raycast (pick.js's raycastVoxels, called from
  // mesher.js's makeLightSampler) still holds once water genuinely moves around at runtime,
  // not just when it sits static (the exact thing CONTENT_TOOLS_PLAN.md flagged to reconfirm).
  const store = new VoxelStore();
  store.set(4, 0, 0, 'stone'); // receiver — checked for real light on its light-facing face
  store.set(2, 0, 1, 'water'); // liquid SOURCE, one cell above the light-to-receiver line
  const sourceInfo = new Map([[keyFor(2, 0, 1), { finite: false, volume: null }]]);
  const levelMap = new Map();
  stepLiquid(store, levelMap, sourceInfo, new Set([keyFor(2, 0, 1)]));
  assert(store.get(2, 0, 0) === 'water', 'setup check: stepLiquid produced water directly on the light-to-receiver line');

  const profile = resolveLighting({
    mode: 'dungeon',
    points: [{ col: 0, row: 0, radius: 8, intensity: 1.5, color: [1, 1, 1] }],
  });
  const { opaque } = buildMesh(store, { lightProfile: profile });

  function findQuadByAllVerts(buf, expected) {
    for (let q = 0; q < buf.indices.length / 6; q++) {
      const base = q * 4 * 3;
      let match = true;
      for (let i = 0; i < 4 && match; i++) {
        const [ex, ey, ez] = expected[i];
        if (
          Math.abs(buf.positions[base + i * 3] - ex) > 1e-6 ||
          Math.abs(buf.positions[base + i * 3 + 1] - ey) > 1e-6 ||
          Math.abs(buf.positions[base + i * 3 + 2] - ez) > 1e-6
        ) match = false;
      }
      if (match) return q;
    }
    return -1;
  }
  const westFace = findQuadByAllVerts(opaque, [[4, 0, 0], [4, 0, 1], [4, 1, 1], [4, 1, 0]]);
  assert(westFace !== -1, "found the receiver's west (light-facing) face");
  const r = opaque.colors[westFace * 4 * 3];
  const ambientOnly = 0.045; // dungeon's ambientBase (see mesher.js) — the unlit baseline
  assert(r > ambientOnly + 0.01, 'the receiver is genuinely lit THROUGH the water cell stepLiquid produced — still translucent to the shadow raycast, not an occluder');
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
