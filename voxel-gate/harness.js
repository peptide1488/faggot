/**
 * Voxel Gate Testbed — see iso3d-engine/GATE_TESTBED.md.
 * Imports the voxel engine READ-ONLY from ../iso3d-engine/src/voxel/*. Never edits engine
 * source; anything the engine can't do is recorded as a GAP finding, not patched around.
 *
 * Runs a 60s scripted bot battle on the showcase map + a destructible planks structure,
 * scoring: boot, scale linearity, pick round-trip, liquid flow/stability, gas
 * place/clear/decay, tile damage containment/visuals, FPS/p95, remesh cost.
 * Results: on-screen HUD + console "GATE" lines + window.__gate (Playwright reads this).
 */
// NOTE: serve this directory with a server that sends Cache-Control: no-store (see
// GATE_TESTBED.md's "running the testbed" note) — a plain `python -m http.server` sends no
// cache headers at all, and Chromium was observed serving a STALE cached copy of an engine
// module (specifically one reached only via another engine file's OWN internal relative
// import, e.g. spells.js's own `./blocks.js`) after an edit + server restart, even though the
// bytes on disk were current. Cache-busting query strings on just this file's own top-level
// imports do NOT fix that case, since internal engine-to-engine imports are unversioned.
import { keyFor } from '../iso3d-engine/src/voxel/store.js';
import { buildShowcaseMap } from '../iso3d-engine/src/voxel/showcaseMap.js';
import { buildMesh } from '../iso3d-engine/src/voxel/mesher.js';
import {
  stepGas, stepLiquid, isGasType, isLiquidType, markSpreadDirty, LIQUID_MAX_LEVEL,
  getGasCloudCells, tickGustCooldown, setWorldBoundsFromStore, WORLD_MAX_C, WORLD_MAX_R,
} from '../iso3d-engine/src/voxel/spread.js';
import { BLOCKS, loadAtlasCanvas } from '../iso3d-engine/src/voxel/blocks.js';
import { VoxelRenderer } from '../iso3d-engine/src/voxel/renderer.js';
import { raycastVoxels } from '../iso3d-engine/src/voxel/pick.js';
import { findSurface } from '../iso3d-engine/src/voxel/surface.js';
import { resolveLighting } from '../iso3d-engine/src/voxel/lighting.js';
import { castSpell, createSpell, destructibleMaxHp } from '../iso3d-engine/src/voxel/spells.js';
import { DND_SPELL_PRESETS } from '../iso3d-engine/src/voxel/dndSpells.js';
import {
  createSpellFxState, queueSpellCast, tickSpellFx, drawSpellFx, loadSpellSpritesFromUrl,
} from '../iso3d-engine/src/voxel/spellFx.js';
import { getCameraMatrix, invert, transformMat4, createMat4, ISO_PITCH } from '../iso3d-engine/src/math.js';

// ─── Scorecard ───────────────────────────────────────────────────────────────
const results = [];
const hud = document.getElementById('hud');
function score(id, pass, detail) {
  results.push({ id, pass, detail });
  console.log(`GATE ${pass === null ? 'INFO' : pass ? 'PASS' : 'FAIL'} ${id}: ${detail}`);
  renderHud();
}
function gap(id, detail) {
  results.push({ id, pass: null, gap: true, detail });
  console.log(`GATE GAP ${id}: ${detail}`);
  renderHud();
}
const state = { phase: 'boot', fps: 0, p95: 0, frames: 0, casts: 0, tickErrors: 0 };
window.__gate = { results, state, done: false };
// Ad-hoc poking from DevTools/Playwright (set after boot in main()).
window.__gateDebug = null;
function renderHud() {
  const lines = [`[voxel-gate] phase=${state.phase}  fps=${state.fps.toFixed(1)}  p95=${state.p95.toFixed(1)}ms  casts=${state.casts}  tickErr=${state.tickErrors}`];
  for (const r of results) {
    const cls = r.gap ? 'info' : r.pass === null ? 'info' : r.pass ? 'pass' : 'fail';
    const tag = r.gap ? 'GAP ' : r.pass === null ? 'INFO' : r.pass ? 'PASS' : 'FAIL';
    lines.push(`<span class="${cls}">${tag}</span> ${r.id} — ${r.detail}`);
  }
  hud.innerHTML = lines.join('\n');
}
window.addEventListener('error', (e) => score('unhandled-error', false, String(e.message)));

// ─── Boot ────────────────────────────────────────────────────────────────────
const canvas = document.getElementById('gl');
const fxCanvas = document.getElementById('fx');
const fxCtx = fxCanvas.getContext('2d');

let store, renderer, atlasCanvas;
const spellFx = createSpellFxState();
let gasLifeMap = new Map();
let gasDirty = new Set();
let gasGustCooldown = new Map();
let blockHpMap = new Map();
let liquidLevelMap = new Map();
let liquidSourceInfo = new Map();
let liquidDirty = new Set();
let dirty = true;
const markDirty = () => { dirty = true; };
const remeshTimes = [];

const cam = { rot: 0.55, zoom: 0.7, panX: 18, panY: 18, pitch: ISO_PITCH };
const lightProfile = resolveLighting({ mode: 'day' });

function typeOf(block) { return block.split(':')[0].split('#')[0]; }

function cameraElevOpts() {
  const b = store.bounds();
  if (b.maxZ < b.minZ) return { elevMin: 0, elevMax: 16 };
  return { elevMin: Math.min(0, b.minZ - 1), elevMax: b.maxZ + 6 };
}

function currentMatrix() {
  const aspect = canvas.width / canvas.height;
  return getCameraMatrix(cam.rot, cam.zoom, cam.panX, cam.panY, aspect, undefined, cam.pitch, cameraElevOpts());
}

// Same per-column liquid visual heights voxel.html feeds buildMesh (see its doc comment).
function computeLiquidHeights() {
  const heights = new Map();
  for (const { c, r, z, block } of store.entries()) {
    const type = typeOf(block);
    if (!isLiquidType(type)) continue;
    const key = keyFor(c, r, z);
    const above = store.get(c, r, z + 1);
    if (liquidSourceInfo.has(key) || (above && typeOf(above) === type)) { heights.set(key, 1); continue; }
    heights.set(key, (liquidLevelMap.has(key) ? liquidLevelMap.get(key) : LIQUID_MAX_LEVEL) / LIQUID_MAX_LEVEL);
  }
  return heights;
}

// Same connected-cloud → world-space box list voxel.html builds for renderer.setGasVolumes.
function recomputeGasVolumes() {
  const visited = new Set();
  const volumes = [];
  for (const { c, r, z, block } of store.entries()) {
    const type = typeOf(block);
    if (!isGasType(type)) continue;
    if (visited.has(keyFor(c, r, z))) continue;
    const cells = getGasCloudCells(store, c, r, z);
    let minC = Infinity, minR = Infinity, minZ = Infinity, maxC = -Infinity, maxR = -Infinity, maxZ = -Infinity;
    for (const cell of cells) {
      visited.add(keyFor(cell.c, cell.r, cell.z));
      minC = Math.min(minC, cell.c); maxC = Math.max(maxC, cell.c);
      minR = Math.min(minR, cell.r); maxR = Math.max(maxR, cell.r);
      minZ = Math.min(minZ, cell.z); maxZ = Math.max(maxZ, cell.z);
    }
    const def = BLOCKS[type];
    volumes.push({
      min: [minC, minZ, minR], max: [maxC + 1, maxZ + 1, maxR + 1],
      color: (def && def.gasFogColor) || [0.6, 0.6, 0.6],
      strength: def && def.gasDensity != null ? def.gasDensity : 0.35,
    });
  }
  renderer.setGasVolumes(volumes);
  return volumes.length;
}

function rebuildIfDirty() {
  if (!dirty) return;
  dirty = false;
  const t0 = performance.now();
  renderer.setMesh(buildMesh(store, { lightProfile, liquidHeights: computeLiquidHeights() }));
  remeshTimes.push(performance.now() - t0);
}

function resize() {
  const dpr = window.devicePixelRatio || 1;
  const w = Math.round(canvas.clientWidth * dpr);
  const h = Math.round(canvas.clientHeight * dpr);
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w; canvas.height = h;
    fxCanvas.width = w; fxCanvas.height = h;
    renderer.resize(w, h);
  }
}

function screenToGridRay(px, py) {
  // px/py in canvas pixel coords (not client) — Playwright + tests use pixel space directly.
  const ndcX = (px / canvas.width) * 2 - 1;
  const ndcY = -((py / canvas.height) * 2 - 1);
  const { matrix } = currentMatrix();
  const inv = invert(createMat4(), matrix);
  if (!inv) return null;
  const near = [0, 0, 0], far = [0, 0, 0];
  transformMat4(near, [ndcX, ndcY, -1], inv);
  transformMat4(far, [ndcX, ndcY, 1], inv);
  // world (x, elev, r) → grid (c, r, z), self-inverse y<->z swap
  return {
    origin: [near[0], near[2], near[1]],
    dir: [far[0] - near[0], far[2] - near[2], far[1] - near[1]],
  };
}

/** Project world-space point to canvas pixels through the current MVP. */
function worldToScreen(wx, wy, wz, matrix) {
  const out = [0, 0, 0];
  transformMat4(out, [wx, wy, wz], matrix);
  return { x: (out[0] * 0.5 + 0.5) * canvas.width, y: (-out[1] * 0.5 + 0.5) * canvas.height };
}

// ─── Checks ──────────────────────────────────────────────────────────────────
function checkScaleLinearity() {
  // Ortho camera: screen distance between two world points must scale linearly with zoom.
  const zooms = [0.35, 0.7, 1.4];
  const dists = zooms.map((zm) => {
    const aspect = canvas.width / canvas.height;
    const { matrix } = getCameraMatrix(cam.rot, zm, cam.panX, cam.panY, aspect, undefined, cam.pitch, cameraElevOpts());
    const a = worldToScreen(8.5, 10, 12.5, matrix);
    const b = worldToScreen(9.5, 10, 12.5, matrix);
    return Math.hypot(b.x - a.x, b.y - a.y);
  });
  const r1 = dists[1] / dists[0], r2 = dists[2] / dists[1];
  const ok = Math.abs(r1 - 2) < 0.05 && Math.abs(r2 - 2) < 0.05;
  score('scale-linear', ok, `1-tile screen px at zoom .35/.7/1.4 = ${dists.map((d) => d.toFixed(1)).join('/')} (ratios ${r1.toFixed(3)}, ${r2.toFixed(3)}, want 2.000)`);
}

function checkPickRoundTrip() {
  // Project the top-face center of 3 known surface blocks, ray back through that pixel,
  // assert the raycast returns the same cell. Landmarks must be OPEN standable columns:
  // torch-topped (occupied) and water-topped (no-surface) columns correctly return null
  // from findSurface — run 1 used those by mistake. Courtyard / east grass / NE hills.
  const landmarks = [[8, 12], [20, 20], [33, 4]];
  const { matrix } = currentMatrix();
  let pass = 0, detail = [];
  for (const [c, r] of landmarks) {
    const surf = findSurface(store, c, r);
    if (!surf) { detail.push(`(${c},${r}): no surface`); continue; }
    const z = Math.round(surf.standZ) - 1; // top solid block of the column
    const p = worldToScreen(c + 0.5, z + 1.001, r + 0.5, matrix);
    const ray = screenToGridRay(p.x, p.y);
    const hit = ray && raycastVoxels(store, ray.origin, ray.dir, { includeTranslucent: true });
    if (hit && hit.c === c && hit.r === r && hit.z === z) pass++;
    else detail.push(`(${c},${r},${z})→${hit ? `(${hit.c},${hit.r},${hit.z})` : 'miss'}`);
  }
  score('pick-roundtrip', pass === landmarks.length, `${pass}/${landmarks.length} landmarks${detail.length ? ' — ' + detail.join(' ') : ''}`);
}

/** Bug #4 fix verification: a below-threshold poke must do NOTHING to natural ground (DMG
 * damage-threshold rule — not partial chip damage), while a real Fireball still deals real
 * damage but shouldn't one-shot 50-60 hp terrain outright. Uses a live grass cell so this
 * exercises the actual BLOCKS data, not a synthetic test-only block type. */
function checkTerrainThreshold() {
  let cell = null;
  for (const { c, r, z, block } of store.entries()) {
    if (typeOf(block) === 'grass') { cell = { c, r, z }; break; }
  }
  if (!cell) { gap('terrain-threshold', 'no live grass cell found on showcase map'); return; }
  const ctx = { store, blockHpMap };
  const poke = createSpell({ name: 'Test Firebolt', effect: 'damage_blocks', radius: 0, damage: [{ dice: '2d10', type: 'fire' }] });
  const before = store.get(cell.c, cell.r, cell.z);
  const pokeResult = castSpell(poke, ctx, cell.c, cell.r, cell.z);
  const untouchedByPoke = store.get(cell.c, cell.r, cell.z) === before && !blockHpMap.has(keyFor(cell.c, cell.r, cell.z));
  const fbResult = castSpell(FIREBALL, ctx, cell.c, cell.r, cell.z);
  const stillStanding = store.get(cell.c, cell.r, cell.z) === before;
  const tookRealDamage = fbResult.hit > 0 && fbResult.totalDamage > 0;
  score('terrain-threshold', untouchedByPoke && tookRealDamage && stillStanding,
    `grass at (${cell.c},${cell.r},${cell.z}): 2d10 fire poke (avg 11, threshold 15) hit=${pokeResult.hit} → ${untouchedByPoke ? 'correctly ignored' : 'WRONGLY damaged'}; ` +
    `single Fireball hit=${fbResult.hit} dmg=${fbResult.totalDamage} destroyed=${fbResult.destroyed} → ${stillStanding ? 'still standing (not one-shot)' : 'DESTROYED IN ONE CAST'}`);
}

function liquidCensus() {
  let n = 0;
  for (const { block } of store.entries()) if (isLiquidType(typeOf(block))) n++;
  return n;
}
function gasCensus() {
  let n = 0;
  for (const { block } of store.entries()) if (isGasType(typeOf(block))) n++;
  return n;
}

// ─── Bots ────────────────────────────────────────────────────────────────────
const PLAYER_BLOCK = 'stone_pillar';
const MONSTER_BLOCK = 'shelf';
let rngState = 12345;
function rng() { rngState = (rngState * 1103515245 + 12345) & 0x7fffffff; return rngState / 0x7fffffff; }

function makeUnit(c, r, blockType) {
  const surf = findSurface(store, c, r);
  const z = surf ? Math.round(surf.standZ) : 10;
  store.set(c, r, z, blockType);
  return { c, r, z, blockType, alive: true };
}
function moveUnit(u, nc, nr) {
  if (store.get(u.c, u.r, u.z) === u.blockType) store.remove(u.c, u.r, u.z);
  const surf = findSurface(store, nc, nr);
  if (!surf) { store.set(u.c, u.r, u.z, u.blockType); return; }
  u.c = nc; u.r = nr; u.z = Math.round(surf.standZ);
  store.set(u.c, u.r, u.z, u.blockType);
  markDirty();
}
function stepToward(u, tc, tr) {
  const dc = Math.sign(tc - u.c), dr = Math.sign(tr - u.r);
  const nc = u.c + dc, nr = u.r + dr;
  const surf = findSurface(store, nc, nr);
  if (surf && !isLiquidType(typeOf(store.get(nc, nr, Math.round(surf.standZ) - 1) || ''))) moveUnit(u, nc, nr);
}

const spellByName = (n) => DND_SPELL_PRESETS.find((s) => s.name === n);
const FIREBALL = spellByName('Fireball');
const SHATTER = spellByName('Shatter'); // 3d8 thunder: planks aren't vulnerable → partial damage path
const CLOUDKILL = spellByName('Cloudkill');
const GUST = spellByName('Gust of Wind');

let player, monsters = [], structureCells = [];
let castRotation = 0;
let gasPlacedAt = null, gasPlacedCount = 0, gasPlacedTime = 0;
let gasChecksDone = { placed: false, cleared: false, decay: false };
const damageStats = { casts: 0, insideChanged: 0, outsideChanged: 0, destroyed: 0, hpDamaged: 0, hpInvalid: 0 };
// Bug #4 verification: terrain destruction tracked separately from the planks structure —
// natural ground (threshold+higher hp) should survive far more of the same bombardment than
// the planks wall does.
const TERRAIN_TYPES = new Set(['grass', 'dirt', 'sand', 'mud']);
const terrainStats = { craterCasts: 0, terrainCratered: 0 };

function castAt(spell, tc, tr, tz) {
  const ctx = { store, gasLifeMap, gasDirty, gasGustCooldown, blockHpMap };
  const from = { c: player.c, r: player.r, z: player.z };
  const result = castSpell(spell, ctx, tc, tr, tz, { from });
  queueSpellCast(spellFx, { spell, result, from, to: { c: tc, r: tr, z: tz } });
  state.casts++;
  markDirty();
  return result;
}

function castStructure(spell) {
  const target = structureCells[Math.floor(rng() * structureCells.length)];
  castChecked(spell, target);
}

function castOpen(spell, c, r, z) {
  const before = new Map();
  for (const { c: cc, r: cr, z: cz, block } of store.entries()) {
    if (TERRAIN_TYPES.has(typeOf(block))) before.set(keyFor(cc, cr, cz), block);
  }
  castChecked(spell, { c, r, z });
  terrainStats.craterCasts++;
  for (const [key] of before) {
    const [cc, cr, cz] = key.split(',').map(Number);
    if (store.get(cc, cr, cz) == null) terrainStats.terrainCratered++;
  }
}

function castChecked(spell, target) {
  const before = new Map();
  for (const { c, r, z, block } of store.entries()) {
    if (destructibleMaxHp(typeOf(block)) != null) before.set(keyFor(c, r, z), block);
  }
  castAt(spell, target.c, target.r, target.z);
  damageStats.casts++;
  const radius = (spell.radius || 4) + 1;
  for (const [key, block] of before) {
    const [c, r, z] = key.split(',').map(Number);
    const now = store.get(c, r, z);
    if (now === block) continue;
    const dist = Math.max(Math.abs(c - target.c), Math.abs(r - target.r), Math.abs(z - target.z));
    if (dist <= radius) { damageStats.insideChanged++; if (now == null) damageStats.destroyed++; }
    else damageStats.outsideChanged++;
  }
  for (const [key, hp] of blockHpMap) {
    const [c, r, z] = key.split(',').map(Number);
    const block = store.get(c, r, z);
    const max = block ? destructibleMaxHp(typeOf(block)) : null;
    if (block == null || max == null || hp <= 0 || hp >= max + 1) damageStats.hpInvalid++;
    else damageStats.hpDamaged++;
  }
}

function botTick() {
  if (state.phase !== 'battle') return;
  const alive = monsters.filter((m) => m.alive);
  // Monsters shuffle toward the player
  for (const m of alive) if (rng() < 0.7) stepToward(m, player.c, player.r);
  const nearest = alive[0];
  if (!nearest) return;
  const dist = Math.max(Math.abs(nearest.c - player.c), Math.abs(nearest.r - player.r));
  if (dist > 8) { stepToward(player, nearest.c, nearest.r); return; }
  const rot = castRotation++ % 4;
  if (rot === 0) {
    // Fireball the nearest monster's ground — quantifies terrain cratering (grass/dirt
    // carry hp in blocks.js, so blast spells demolish the ground itself).
    const surf = findSurface(store, nearest.c, nearest.r);
    castOpen(FIREBALL, nearest.c, nearest.r, (surf ? Math.round(surf.standZ) : nearest.z) - 1);
  } else if (rot === 2) {
    // Shatter owns the planks wall: 3d8 thunder (no vulnerability) averages 13.5 vs 25 hp —
    // forces the partial-damage blockHpMap path Fireball one-shots past.
    castStructure(SHATTER);
  } else if (rot === 1) {
    const surf = findSurface(store, nearest.c, nearest.r);
    const tz = surf ? Math.round(surf.standZ) - 1 : nearest.z - 1;
    const res = castAt(CLOUDKILL, nearest.c, nearest.r, tz);
    if (!gasChecksDone.placed) {
      const placed = gasCensus();
      gasPlacedAt = { c: nearest.c, r: nearest.r, z: tz };
      gasPlacedCount = placed; gasPlacedTime = performance.now();
      score('gas-place', placed > 0, `Cloudkill at (${nearest.c},${nearest.r}) → ${placed} gas cells in store (result: ${JSON.stringify(res).slice(0, 80)})`);
      gasChecksDone.placed = true;
    }
  } else if (rot === 3 && !gasChecksDone.cleared) {
    // Two-cast experiment pinning the lineCells z-lock (spells.js:197 — line AoE runs at
    // Math.round(origin.z) & +1, ignoring the aim point's z entirely):
    //   cast A: aim at a live gas cell whose z is OUTSIDE {playerZ, playerZ+1} → predicts 0
    //   cast B: aim at a live gas cell AT the caster's own z (or +1)          → predicts >0
    const pz = Math.round(player.z);
    let below = null, level = null;
    for (const { c, r, z, block } of store.entries()) {
      if (!isGasType(typeOf(block))) continue;
      if (z !== pz && z !== pz + 1) below = below || { c, r, z };
      else level = level || { c, r, z };
    }
    if (below || level) {
      let detail = `player.z=${pz}.`;
      let sawMiss = null, sawHit = null;
      if (below) {
        const res = castAt(GUST, below.c, below.r, below.z);
        sawMiss = res.cleared;
        detail += ` A: aim z=${below.z} (off-level) cleared=${res.cleared} (z-lock predicts 0).`;
      }
      if (level) {
        const res = castAt(GUST, level.c, level.r, level.z);
        sawHit = res.cleared;
        detail += ` B: aim z=${level.z} (caster level) cleared=${res.cleared} (predicts >0).`;
      }
      // Engine verdict: pass only if gas actually clears when properly aimed AND aim-z is honored.
      const zLockConfirmed = sawMiss === 0 && (sawHit == null || sawHit > 0);
      score('gas-clear', sawMiss !== 0 && (sawHit == null || sawHit > 0),
        detail + (zLockConfirmed ? ' → CONFIRMS lineCells z-lock bug.' : ''));
      gasChecksDone.cleared = true;
    }
  }
}

// ─── Sim ticks (same cadence discipline as voxel.html: sim on setInterval, render on rAF) ──
const GAS_TICK_MS = 400;
setInterval(() => {
  if (gasGustCooldown.size > 0) tickGustCooldown(gasGustCooldown);
  let gasChanged = false;
  if (gasDirty.size > 0) {
    const { changed, nextDirty } = stepGas(store, gasLifeMap, gasDirty, null, gasGustCooldown);
    gasDirty = nextDirty; gasChanged = changed;
    if (changed) markDirty();
  }
  if (gasDirty.size > 0 || gasChanged) recomputeGasVolumes();
  if (liquidDirty.size > 0) {
    const { changed, nextDirty } = stepLiquid(store, liquidLevelMap, liquidSourceInfo, liquidDirty);
    liquidDirty = nextDirty;
    if (changed) markDirty();
  }
}, GAS_TICK_MS);

// ─── Render loop with perf stats ─────────────────────────────────────────────
const frameTimes = [];
let lastFrame = performance.now();
function tick() {
  try {
    resize();
    rebuildIfDirty();
    const now = performance.now();
    frameTimes.push(now - lastFrame);
    lastFrame = now;
    if (frameTimes.length > 240) frameTimes.shift();
    if (state.frames % 30 === 0 && frameTimes.length > 10) {
      const sorted = [...frameTimes].sort((a, b) => a - b);
      state.fps = 1000 / (sorted.reduce((a, b) => a + b, 0) / sorted.length);
      state.p95 = sorted[Math.floor(sorted.length * 0.95)];
      renderHud();
    }
    state.frames++;
    const { matrix, eye, target } = currentMatrix();
    const viewDir = [target[0] - eye[0], target[1] - eye[1], target[2] - eye[2]];
    const len = Math.hypot(...viewDir);
    renderer.setCamera({
      viewDir: viewDir.map((v) => v / len), eye,
      distNear: Math.max(0.1, len - 60), distFar: len + 60,
    });
    renderer.render(matrix);
    tickSpellFx(spellFx, now - (tick._last || now));
    tick._last = now;
    fxCtx.clearRect(0, 0, fxCanvas.width, fxCanvas.height);
    drawSpellFx(fxCtx, spellFx, matrix, fxCanvas.width, fxCanvas.height);
  } catch (e) {
    state.tickErrors++;
    if (state.tickErrors === 1) { score('render-loop', false, `tick threw: ${e.message}`); console.error(e); }
  }
  requestAnimationFrame(tick);
}

// ─── Timeline ────────────────────────────────────────────────────────────────
async function main() {
  try {
    const built = buildShowcaseMap({ billboardTypes: [] });
    store = built.store;
    if (built.cam) { cam.panX = built.cam.panX; cam.panY = built.cam.panY; cam.rot = built.cam.rot; cam.zoom = built.cam.zoom; }
    gap('billboards', 'showcase billboard types live in user localStorage libraries — harness has none registered; units are blocks. Billboard proportion checks NOT covered by this run.');
    gap('determinism', 'spells.js rollDice uses Math.random (not seedable) — damage assertions are invariant-based, not exact-value.');
    // Bug #2 fix verification: bounds must now be DERIVED from the actual store, not the old
    // hardcoded 31/31 default that silently clipped anything past a 32×32 map.
    setWorldBoundsFromStore(store);
    score('world-bounds', WORLD_MAX_C >= 35 && WORLD_MAX_R >= 35, `spread.js WORLD_MAX_C/R = ${WORLD_MAX_C}/${WORLD_MAX_R} (derived via setWorldBoundsFromStore) vs showcase map 36×36 — gas/liquid sim ${WORLD_MAX_C >= 35 ? 'covers' : 'SILENTLY STOPS before'} the map edge`);

    // Liquid side-maps for the pond (same init as voxel.html loadDemoMap)
    for (const { c, r, z, block } of store.entries()) {
      const type = typeOf(block);
      if (BLOCKS[type] && BLOCKS[type].gas) markSpreadDirty(gasDirty, c, r, z);
      if (isLiquidType(type)) {
        liquidSourceInfo.set(keyFor(c, r, z), { finite: false, volume: null });
        markSpreadDirty(liquidDirty, c, r, z);
      }
    }

    // Destructible structure: 5×1 planks wall, 2 high, on open grass east of the keep
    // (10 cells — run 1's 6 were all one-shot by Fireball before the partial-HP check ran)
    for (let c = 19; c <= 23; c++) {
      const surf = findSurface(store, c, 14);
      const z0 = Math.round(surf.standZ);
      for (let dz = 0; dz < 2; dz++) {
        store.set(c, 14, z0 + dz, 'planks');
        structureCells.push({ c, r: 14, z: z0 + dz });
      }
    }

    atlasCanvas = await loadAtlasCanvas('../iso3d-engine/src/voxel/atlas.png');
    try { await loadSpellSpritesFromUrl('../iso3d-engine/src/voxel/textures/spell_fx.png'); }
    catch { gap('spell-sprites', 'spell_fx.png missing — spellFx runs procedural fallback'); }

    renderer = new VoxelRenderer(canvas);
    renderer.setAtlasImage(atlasCanvas);
    resize();
    score('boot', true, `engine imported, showcase 36×36 + planks structure, atlas loaded, renderer up (dpr=${window.devicePixelRatio})`);

    player = makeUnit(8, 12, PLAYER_BLOCK);
    monsters = [makeUnit(24, 10, MONSTER_BLOCK), makeUnit(28, 18, MONSTER_BLOCK), makeUnit(18, 26, MONSTER_BLOCK), makeUnit(30, 30, MONSTER_BLOCK)];
    window.__gateDebug = { store, castAt, player, monsters, gasCensus, liquidCensus, blockHpMap, spells: { FIREBALL, SHATTER, CLOUDKILL, GUST } };
    markDirty();
    requestAnimationFrame(tick);

    // After first frames settle: static checks
    setTimeout(() => {
      checkScaleLinearity();
      checkPickRoundTrip();
      checkTerrainThreshold();
      state.phase = 'battle';
      score('battle-start', null, 'bots live: 1 player (stone_pillar) vs 4 monsters (shelf), 700ms ticks');
    }, 1500);
    setInterval(botTick, 700);

    // t=10s: breach the pond wall — liquid must flow into the new pocket, then stabilize
    const preLiquid = liquidCensus();
    setTimeout(() => {
      // Find a real water cell with a solid lateral neighbor and remove that neighbor
      // (run 1 dug a trench 2 tiles short of the water — flow correctly never happened).
      let dug = 0;
      outer: for (const { c, r, z, block } of store.entries()) {
        if (!isLiquidType(typeOf(block))) continue;
        for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nc = c + dc, nr = r + dr;
          const nb = store.get(nc, nr, z);
          if (nb && BLOCKS[typeOf(nb)]?.solid && !store.has(nc, nr, z + 1)) {
            store.remove(nc, nr, z); dug++;
            const below = store.get(nc, nr, z - 1);
            if (below && BLOCKS[typeOf(below)]?.solid) { store.remove(nc, nr, z - 1); dug++; }
            markSpreadDirty(liquidDirty, c, r, z);
            markSpreadDirty(liquidDirty, nc, nr, z);
            score('liquid-breach', null, `removed rim block at (${nc},${nr},${z}) beside water (${c},${r},${z}), dug ${dug} (t=10s)`);
            break outer;
          }
        }
      }
      if (!dug) score('liquid-breach', false, 'no water cell with a removable solid rim neighbor found');
      markDirty();
      setTimeout(() => {
        const now = liquidCensus();
        score('liquid-flow', now > preLiquid, `liquid cells ${preLiquid}→${now} 12s after breach (flow ${now > preLiquid ? 'happened' : 'NEVER happened'})`);
      }, 12000);
      setTimeout(() => {
        const a = liquidCensus();
        setTimeout(() => {
          const b = liquidCensus();
          score('liquid-stable', Math.abs(b - a) <= 2, `liquid cells ${a}→${b} over 8s late-battle (runaway spread if growing)`);
        }, 8000);
      }, 20000);
    }, 10000);

    // Gas decay check: 30s after first Cloudkill the unconfined cloud should be smaller
    const decayPoll = setInterval(() => {
      if (!gasChecksDone.placed || gasChecksDone.decay) return;
      if (performance.now() - gasPlacedTime > 30000) {
        const now = gasCensus();
        score('gas-decay', now < gasPlacedCount, `gas cells ${gasPlacedCount}→${now} 30s after Cloudkill (open-air cloud should fade)`);
        gasChecksDone.decay = true;
        clearInterval(decayPoll);
      }
    }, 2000);

    // t=65s: final report
    setTimeout(() => {
      state.phase = 'report';
      score('tile-damage-containment', damageStats.outsideChanged === 0 && damageStats.casts > 0,
        `${damageStats.casts} fireballs: ${damageStats.insideChanged} cells changed inside AoE (${damageStats.destroyed} destroyed), ${damageStats.outsideChanged} OUTSIDE (must be 0)`);
      score('tile-damage-hp', damageStats.hpInvalid === 0,
        `blockHpMap entries: ${damageStats.hpDamaged} valid partial-damage, ${damageStats.hpInvalid} invalid (stale/out-of-range)`);
      score('structure-destroyed', structureCells.some(({ c, r, z }) => store.get(c, r, z) == null),
        `planks wall after repeated fireballs: ${structureCells.filter(({ c, r, z }) => store.get(c, r, z) == null).length}/${structureCells.length} cells destroyed`);
      // Bug #4 fix verification: ground craters should be RARE relative to casts now (multiple
      // hits needed per cell), not near-1:1 (the old moonscape — 305 craters from 43 casts).
      const craterRatio = terrainStats.craterCasts > 0 ? terrainStats.terrainCratered / terrainStats.craterCasts : 0;
      score('terrain-resilience', craterRatio < 0.5,
        `${terrainStats.terrainCratered} terrain cells cratered over ${terrainStats.craterCasts} ground-targeted Fireballs (ratio ${craterRatio.toFixed(2)}, want <0.5 — old behavior was ~1.0, a moonscape)`);
      const sorted = [...frameTimes].sort((a, b) => a - b);
      const avgFps = 1000 / (sorted.reduce((s, x) => s + x, 0) / sorted.length);
      const p95 = sorted[Math.floor(sorted.length * 0.95)];
      const mobile = /Android|iPhone|iPad/i.test(navigator.userAgent);
      score('perf-fps', avgFps >= (mobile ? 30 : 55), `avg ${avgFps.toFixed(1)} fps, p95 frame ${p95.toFixed(1)}ms on ${mobile ? 'MOBILE (bar: 30fps)' : 'desktop (bar: 55fps)'} at ${canvas.width}×${canvas.height}`);
      const rAvg = remeshTimes.reduce((s, x) => s + x, 0) / Math.max(1, remeshTimes.length);
      const rMax = Math.max(...remeshTimes, 0);
      score('remesh-cost', rMax < 50, `${remeshTimes.length} full remeshes: avg ${rAvg.toFixed(1)}ms, max ${rMax.toFixed(1)}ms (no chunking — whole map rebuilds every change)`);
      score('render-loop', state.tickErrors === 0, `${state.tickErrors} render-tick errors over ${state.frames} frames`);
      state.phase = 'done';
      window.__gate.done = true;
      console.log('GATE REPORT ' + JSON.stringify({ results, fps: avgFps, p95, frames: state.frames, casts: state.casts }));
      renderHud();
    }, 65000);
  } catch (e) {
    score('boot', false, `${e.message}\n${e.stack}`);
    window.__gate.done = true;
    console.error(e);
  }
}
main();
