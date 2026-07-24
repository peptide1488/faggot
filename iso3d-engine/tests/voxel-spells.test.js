/**
 * Headless tests — run with: node tests/voxel-spells.test.js
 */

const memoryStore = new Map();
global.localStorage = {
  getItem: (k) => (memoryStore.has(k) ? memoryStore.get(k) : null),
  setItem: (k, v) => memoryStore.set(k, String(v)),
  removeItem: (k) => memoryStore.delete(k),
};

import {
  SPELL_EFFECTS, createSpell, castSpell, parseDice, rollDice,
  aoeCells, resolveSpellAoe, resolvePlaceGasAoe,
  loadSpellLibrary, saveSpellLibrary, addSpellToLibrary, removeSpellFromLibrary,
} from '../src/voxel/spells.js';
import { DND_SPELL_PRESETS } from '../src/voxel/dndSpells.js';
import { VoxelStore, keyFor } from '../src/voxel/store.js';
import { BLOCKS, registerBlock } from '../src/voxel/blocks.js';

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

console.log('createSpell — slugified id, effect validation, needsMaterial enforcement');
{
  const spell = createSpell({ name: 'Gust of Wind', effect: 'clear_gas', radius: 3 });
  assert(spell.id === 'gust_of_wind', 'name is slugified into the id, same convention every content type uses');
  assert(spell.effect === 'clear_gas' && spell.radius === 3, 'effect/radius round-trip onto the entry');

  let threw = false;
  try {
    createSpell({ name: 'Bogus', effect: 'not_a_real_effect' });
  } catch (e) {
    threw = /unknown spell effect/.test(e.message);
  }
  assert(threw, 'an unknown effect name throws a clear error instead of silently creating a broken spell');

  let threwNoMaterial = false;
  try {
    createSpell({ name: 'Smoke Bomb', effect: 'place_gas' }); // no material given
  } catch (e) {
    threwNoMaterial = /needs a material/.test(e.message);
  }
  assert(threwNoMaterial, 'an effect that needsMaterial (place_gas) throws if no material is given');

  const withMaterial = createSpell({ name: 'Smoke Bomb', effect: 'place_gas', radius: 2, material: 'fog' });
  assert(withMaterial.material === 'fog', 'a material-needing effect accepts and stores the given material');

  let threwNoDamage = false;
  try {
    createSpell({ name: 'Bare Fireball', effect: 'damage_blocks', radius: 4 }); // no damage given
  } catch (e) {
    threwNoDamage = /needs at least one damage component/.test(e.message);
  }
  assert(threwNoDamage, 'an effect that needsDamage (damage_blocks) throws if no damage array is given');

  const withDamage = createSpell({ name: 'Fireball', effect: 'damage_blocks', radius: 4, damage: [{ dice: '8d6', type: 'fire' }] });
  assert(Array.isArray(withDamage.damage) && withDamage.damage[0].dice === '8d6', 'a damage-needing effect accepts and stores the given damage array');
}

console.log('castSpell — clear_gas dispatches to clearGasInRadius via ctx');
{
  const store = new VoxelStore();
  store.set(5, 5, 5, 'fog');
  store.set(6, 5, 5, 'fog');
  store.set(20, 20, 5, 'fog'); // far away, must survive
  const ctx = { store, gasLifeMap: new Map(), gasDirty: new Set(), gasGustCooldown: new Map() };
  const spell = createSpell({ name: 'Gust of Wind', effect: 'clear_gas', radius: 2 });
  const result = castSpell(spell, ctx, 5, 5, 5);
  assert(result.cleared === 2, 'castSpell reports how many gas cells the effect actually cleared');
  assert(!store.has(5, 5, 5) && !store.has(6, 5, 5), 'both nearby gas cells are gone');
  assert(store.get(20, 20, 5) === 'fog', 'gas far outside the cast radius is untouched');
  assert(ctx.gasGustCooldown.get(keyFor(5, 5, 5)) !== undefined, 'the cleared cells are entered into the cooldown map (ctx.gasGustCooldown), same as the Gust of Wind mode uses');
}

console.log('castSpell — place_gas fills a roughly spherical volume with the chosen gas material');
{
  const store = new VoxelStore();
  store.set(10, 10, 10, 'stone'); // an obstruction inside the blast radius — must not be overwritten
  const ctx = { store, gasLifeMap: new Map(), gasDirty: new Set(), gasGustCooldown: new Map() };
  const spell = createSpell({ name: 'Smoke Bomb', effect: 'place_gas', radius: 2, material: 'fog' });
  const result = castSpell(spell, ctx, 10, 10, 10);
  assert(result.placed > 0, 'placed at least some gas cells');
  assert(store.get(10, 10, 10) === 'stone', 'an existing block inside the radius is never overwritten by the spell');
  assert(store.get(11, 10, 10) === 'fog', 'an adjacent open cell within radius is filled with the spell\'s chosen material');
  assert(store.get(10, 10, 10 + 100) === null, 'far outside the radius is untouched');
  assert(ctx.gasDirty.size > 0, 'newly placed gas cells are seeded into the dispersal simulation (gasDirty)');
  // D&D clouds do not keep expanding after cast — hops must be 0 so stepGas cannot flood the map
  const anyKey = [...ctx.gasLifeMap.keys()][0];
  assert(anyKey && ctx.gasLifeMap.get(anyKey).hops === 0, 'place_gas seeds hops=0 (no post-cast gas expansion beyond AOE)');
}

console.log('castSpell — place_gas square shape (Entangle) is ground-only, not a tall sphere');
{
  const store = new VoxelStore();
  const ctx = { store, gasLifeMap: new Map(), gasDirty: new Set() };
  const spell = createSpell({
    name: 'Entangle', effect: 'place_gas', radius: 2, material: 'gas', shape: 'square', side: 3,
  });
  castSpell(spell, ctx, 5, 5, 3);
  assert(store.get(5, 5, 3) === 'gas', 'center of square filled');
  // side 3 centered: lo=-1 hi=1 → (6,5) filled; (7,5) out of range
  assert(store.get(6, 5, 3) === 'gas', 'edge of side-3 square filled');
  assert(store.get(7, 5, 3) === null, 'beyond side-3 square empty');
  assert(store.get(5, 5, 4) === null, 'square is ground-only — no gas one tile above');
}

console.log('PHB aoeCells — cube side, sphere radius, line length, cone length');
{
  // 20-ft cube → side 4 → exactly 4×4×4 = 64 cells
  const cube = aoeCells(10, 10, 10, 2, 'cube', null, { side: 4 });
  assert(cube.length === 64, `20-ft cube is 4³=64 cells (got ${cube.length})`);

  // 20-ft-radius sphere → radius 4; includes (14,10,10) at dist 4, excludes dist 5
  const sphere = aoeCells(10, 10, 10, 4, 'sphere');
  assert(sphere.some(([c, r, z]) => c === 14 && r === 10 && z === 10), 'sphere includes r=4 edge');
  assert(!sphere.some(([c, r, z]) => c === 15 && r === 10 && z === 10), 'sphere excludes r=5');

  // 20-ft-tall cylinder height 4 → 4 vertical layers (z..z+3), not 5
  const cyl = aoeCells(0, 0, 5, 1, 'cylinder', 4);
  const zs = new Set(cyl.map(([, , z]) => z));
  assert(zs.has(5) && zs.has(8) && !zs.has(9), 'cylinder height 4 → layers z..z+3');

  // Lightning Bolt: 100-ft line (length 20), 5-ft wide (width 1), from caster along +c
  const bolt = aoeCells(20, 0, 1, 1, 'line', null, {
    length: 20, width: 1, from: { c: 0, r: 0, z: 1 },
  });
  assert(bolt.some(([c]) => c === 20), 'line reaches length 20');
  assert(bolt.some(([c, r]) => c === 10 && r === 0), 'line passes midpoint');
  assert(!bolt.some(([, r]) => r === 2), '5-ft-wide line does not fan out to r+2');

  // Burning Hands: 15-ft cone (length 3)
  const cone = aoeCells(3, 0, 0, 3, 'cone', null, {
    length: 3, from: { c: 0, r: 0, z: 0 },
  });
  assert(cone.some(([c]) => c === 3), 'cone reaches length 3');
  assert(cone.some(([c, r]) => c === 0 && r === 0), 'cone includes origin');
}

console.log('PHB aoeCells — line/cone honor the AIM point\'s elevation, not just the caster\'s (regression: z used to be locked to Math.round(origin.z), aim.z never read at all)');
{
  // Caster at z=0, aiming a line at a target 10 tiles away and 6 tiles LOWER (z=-6). The line
  // must angle down to actually cover z near -6 partway/at the far end, not stay flat at z=0
  // the entire way.
  const downLine = aoeCells(10, 0, -6, 1, 'line', null, {
    length: 10, width: 1, from: { c: 0, r: 0, z: 0 },
  });
  const farEndZs = downLine.filter(([c]) => c >= 9).map(([, , z]) => z);
  assert(farEndZs.some((z) => z <= -4), `line angles down toward a lower aim point (far-end z values: ${[...new Set(farEndZs)].join(',')}, want some ≤ -4)`);
  assert(downLine.some(([c, , z]) => c === 0 && z === 0), 'line still starts at the caster\'s own elevation');

  // Same for cone: aiming at a target above the caster should angle the cone upward.
  const upCone = aoeCells(4, 0, 8, 4, 'cone', null, {
    length: 4, from: { c: 0, r: 0, z: 0 },
  });
  const coneFarZs = upCone.filter(([c]) => c >= 3).map(([, , z]) => z);
  assert(coneFarZs.some((z) => z >= 5), `cone angles up toward a higher aim point (far-end z values: ${[...new Set(coneFarZs)].join(',')}, want some ≥ 5)`);

  // A line/cone aimed at the SAME elevation as the caster still behaves exactly as before
  // (flat) — this is a regression guard, not a change in the common case.
  const flatLine = aoeCells(10, 0, 0, 1, 'line', null, { length: 10, width: 1, from: { c: 0, r: 0, z: 0 } });
  assert(flatLine.every(([, , z]) => z === 0), 'a same-elevation line stays perfectly flat (no change from before)');
}

console.log('DND_SPELL_PRESETS — blasts full PHB; place_gas kept small');
{
  const byName = Object.fromEntries(DND_SPELL_PRESETS.map((p) => [p.name, p]));
  assert(byName.Fireball.radius === 4 && byName.Fireball.shape === 'sphere', 'Fireball 20-ft-radius');
  assert(byName.Fireball.damage[0].dice === '8d6' && byName.Fireball.damage[0].type === 'fire', 'Fireball 8d6 fire');
  assert(byName.Web.side <= 3 && byName.Web.shape === 'square', 'Web is small ground square, not fog cube');
  assert(byName.Entangle.side <= 3 && byName.Entangle.shape === 'square', 'Entangle ground square');
  assert(byName.Grease.side === 2 && byName.Grease.shape === 'square', 'Grease 10-ft square');
  assert(byName['Lightning Bolt'].length === 20 && byName['Lightning Bolt'].width === 1, 'Lightning 100×5 ft line');
  assert(byName['Gust of Wind'].length === 12 && byName['Gust of Wind'].width === 2, 'Gust 60×10 ft line');
  assert(byName['Sleet Storm'].radius <= 3 && byName['Sleet Storm'].height <= 2, 'Sleet not a stadium of fog');
  assert(byName['Burning Hands'].shape === 'cone' && byName['Burning Hands'].length === 3, 'Burning Hands 15-ft cone');
  assert(byName['Cone of Cold'].length === 12, 'Cone of Cold 60-ft cone');
  assert(byName.Thunderwave.side === 3, 'Thunderwave 15-ft cube');
  assert(byName['Ice Storm'].height === 8 && byName['Ice Storm'].radius === 4, 'Ice Storm damage cylinder full PHB');
  // No more place_gas for pure condition spells
  assert(!byName['Faerie Fire'], 'Faerie Fire not place_gas fog');
  assert(!byName['Hypnotic Pattern'], 'Hypnotic Pattern not place_gas fog');
  assert(!byName.Moonbeam, 'Moonbeam not place_gas fog');
  assert(!byName['Spirit Guardians'], 'Spirit Guardians not place_gas fog');
  // Every place_gas preset stays under engine volume caps
  for (const p of DND_SPELL_PRESETS.filter((x) => x.effect === 'place_gas')) {
    assert((p.radius || 0) <= 3, `${p.name} place_gas radius ≤ 3`);
    if (p.side != null) assert(p.side <= 3, `${p.name} place_gas side ≤ 3`);
    if (p.height != null) assert(p.height <= 2, `${p.name} place_gas height ≤ 2`);
  }
}

console.log('resolvePlaceGasAoe clamps insane authored clouds');
{
  const huge = createSpell({ name: 'Bad Fog', effect: 'place_gas', radius: 20, shape: 'sphere', material: 'fog' });
  const cells = resolvePlaceGasAoe(huge, 0, 0, 0, {});
  assert(cells.length <= 80, `r=20 sphere place_gas clamped (got ${cells.length} cells)`);
  const zs = new Set(cells.map(([, , z]) => z));
  assert(zs.size <= 2, 'sphere place_gas becomes short cloud bank (≤2 layers)');
}

console.log('castSpell — remove_blocks clears any block type in a roughly spherical radius');
{
  const store = new VoxelStore();
  store.set(0, 0, 0, 'stone');
  store.set(1, 0, 0, 'water');
  store.set(10, 0, 0, 'stone'); // far away, must survive
  const ctx = { store };
  const spell = createSpell({ name: 'Disintegrate', effect: 'remove_blocks', radius: 2 });
  const result = castSpell(spell, ctx, 0, 0, 0);
  assert(result.removed === 2, 'removed both blocks within radius, regardless of type');
  assert(!store.has(0, 0, 0) && !store.has(1, 0, 0), 'both are actually gone from the store');
  assert(store.get(10, 0, 0) === 'stone', 'a block far outside the radius survives untouched');
}

console.log('castSpell — damage_blocks: indestructible blocks (no hp set) are completely untouched by a blast');
{
  const store = new VoxelStore();
  store.set(0, 0, 0, 'stone'); // stone has no `hp` field — indestructible by convention
  const ctx = { store, blockHpMap: new Map() };
  const spell = createSpell({ name: 'Fireball', effect: 'damage_blocks', radius: 2, damage: [{ dice: '8d6', type: 'fire' }] });
  const result = castSpell(spell, ctx, 0, 0, 0);
  assert(store.get(0, 0, 0) === 'stone', 'a block with no hp field survives ANY amount of damage untouched — this is what actually fixes "blows up too much stuff"');
  assert(result.hit === 0 && result.destroyed === 0, 'castSpell correctly reports zero blocks hit/destroyed when nothing in range is destructible');
}

console.log('castSpell — damage_blocks: grass has a damage threshold (terrain rebalance, user ruling 2026-07-21), wood does not');
{
  const store = new VoxelStore();
  store.set(0, 0, 0, 'grass');
  store.set(1, 0, 0, 'wood');
  store.set(5, 0, 0, 'stone'); // immune
  const ctx = { store, blockHpMap: new Map() };
  // 1d1 fire (1 dmg) is below grass's threshold (15) — the DMG "damage threshold" object rule
  // means this does NOTHING to grass at all (no hp entry created), not partial chip damage.
  // Wood has no threshold and is still fire-vulnerable (×2), so the same poke damages it.
  const poke = createSpell({ name: 'Spark', effect: 'damage_blocks', radius: 1, damage: [{ dice: '1d1', type: 'fire' }] });
  let r = castSpell(poke, ctx, 0, 0, 0);
  assert(store.get(0, 0, 0) === 'grass' && !ctx.blockHpMap.has(keyFor(0, 0, 0)), 'a 1-dmg poke (below grass\'s 15 threshold) leaves grass with no hp entry at all — ignored, not chipped');
  assert(ctx.blockHpMap.get(keyFor(1, 0, 0)) === 18, 'wood has no threshold and is still fire-vulnerable: 1 dmg ×2 = 2, 20-2=18');

  // A real Fireball crosses grass's threshold and deals real damage — but grass's own 60 hp
  // (max possible 8d6 damage is 48) means a SINGLE cast can never one-shot it outright, matching
  // "terrain should be destructible, but not that easily".
  const fb = createSpell({ name: 'Fireball', effect: 'damage_blocks', radius: 2, damage: [{ dice: '8d6', type: 'fire' }] });
  r = castSpell(fb, ctx, 0, 0, 0);
  assert(r.hit >= 1, 'fireball crosses the threshold and actually hits');
  assert(store.get(0, 0, 0) === 'grass', 'grass survives a single Fireball (its 60 hp exceeds 8d6\'s max 48)');
  assert(store.get(5, 0, 0) === 'stone', 'stone still immune');
}

console.log('castSpell — damage_blocks: a destructible block (has hp) actually takes damage, tracked across multiple casts');
{
  registerBlock('__test_wooden_crate__', { all: 0, solid: true, opaque: true, hp: 20 });
  const store = new VoxelStore();
  store.set(0, 0, 0, '__test_wooden_crate__');
  const ctx = { store, blockHpMap: new Map() };
  // A fixed 1d1 "fire" hit for 1 damage, deterministic — isolates the HP-tracking behavior from
  // dice randomness (a separate test below covers real dice ranges/resistance math).
  const spell = createSpell({ name: 'Test Poke', effect: 'damage_blocks', radius: 0, damage: [{ dice: '1d1', type: 'fire' }] });
  castSpell(spell, ctx, 0, 0, 0);
  assert(store.get(0, 0, 0) === '__test_wooden_crate__', 'still standing after 1 damage out of 20 HP');
  assert(ctx.blockHpMap.get(keyFor(0, 0, 0)) === 19, 'current HP is tracked down from its max (20 -> 19) in ctx.blockHpMap');

  // Cast the same spell 18 more times (19 total, exactly draining 19 HP) — still standing at 1.
  for (let i = 0; i < 18; i++) castSpell(spell, ctx, 0, 0, 0);
  assert(store.get(0, 0, 0) === '__test_wooden_crate__', 'still standing with exactly 1 HP left after 19 total hits');
  assert(ctx.blockHpMap.get(keyFor(0, 0, 0)) === 1, 'HP correctly at 1 after 19 hits of 1 damage each');

  // One more hit brings it to 0 -> destroyed (no destroyedType set on this test block -> removed
  // entirely, not replaced).
  castSpell(spell, ctx, 0, 0, 0);
  assert(!store.has(0, 0, 0), 'the block is completely removed once its HP reaches 0 (no destroyedType set)');
  assert(!ctx.blockHpMap.has(keyFor(0, 0, 0)), 'the stale HP entry is cleaned up once the block is destroyed');
  delete BLOCKS.__test_wooden_crate__;
}

console.log('castSpell — damage_blocks: destroyedType replaces the block instead of removing it, at 0 HP');
{
  registerBlock('__test_glass_pane__', { all: 0, solid: true, opaque: false, hp: 5, destroyedType: '__test_shattered_glass__' });
  registerBlock('__test_shattered_glass__', { all: 0, solid: false, opaque: false });
  const store = new VoxelStore();
  store.set(0, 0, 0, '__test_glass_pane__');
  const ctx = { store, blockHpMap: new Map() };
  const spell = createSpell({ name: 'Test Shatter', effect: 'damage_blocks', radius: 0, damage: [{ dice: '1d10', type: 'thunder' }] });
  // 1d10 always deals at least 1, at most 10 — 5 casts guarantees at least 5 total damage
  // (minimum roll each time), exceeding the pane's 5 HP regardless of actual rolls.
  for (let i = 0; i < 5; i++) castSpell(spell, ctx, 0, 0, 0);
  assert(store.get(0, 0, 0) === '__test_shattered_glass__', 'destroyed pane becomes its destroyedType, not just removed');
  delete BLOCKS.__test_glass_pane__;
  delete BLOCKS.__test_shattered_glass__;
}

console.log('castSpell — damage_blocks: vulnerable doubles damage, resistant halves it, immune blocks it entirely');
{
  registerBlock('__test_vuln_fire__', { all: 0, solid: true, opaque: true, hp: 1000, vulnerable: ['fire'] });
  registerBlock('__test_resist_fire__', { all: 0, solid: true, opaque: true, hp: 1000, resistant: ['fire'] });
  registerBlock('__test_immune_fire__', { all: 0, solid: true, opaque: true, hp: 1000, immune: ['fire'] });
  const store = new VoxelStore();
  store.set(0, 0, 0, '__test_vuln_fire__');
  store.set(2, 0, 0, '__test_resist_fire__');
  store.set(4, 0, 0, '__test_immune_fire__');
  const ctx = { store, blockHpMap: new Map() };
  // 1d10 fire, fixed die but real code path — cast once at EACH block individually (radius 0)
  // so each gets its own independent roll rather than one shared roll across all three, keeping
  // the modifier math per-block verifiable without needing to control randomness globally.
  const spell = { id: 'test', name: 'Test', effect: 'damage_blocks', radius: 0, damage: [{ dice: '1d10', type: 'fire' }] };
  castSpell(spell, ctx, 0, 0, 0);
  castSpell(spell, ctx, 2, 0, 0);
  castSpell(spell, ctx, 4, 0, 0);
  const vulnDamage = 1000 - ctx.blockHpMap.get(keyFor(0, 0, 0));
  const resistDamage = 1000 - ctx.blockHpMap.get(keyFor(2, 0, 0));
  assert(ctx.blockHpMap.get(keyFor(4, 0, 0)) === undefined || ctx.blockHpMap.get(keyFor(4, 0, 0)) === 1000, 'immune: takes zero damage, HP entry either absent or unchanged at full');
  assert(vulnDamage >= 2 && vulnDamage <= 20 && vulnDamage % 2 === 0, 'vulnerable: damage is always exactly DOUBLE a 1-10 roll (an even number 2..20)');
  assert(resistDamage >= 0 && resistDamage <= 5, 'resistant: damage is always HALF (rounded down) of a 1-10 roll, so at most 5');
  delete BLOCKS.__test_vuln_fire__;
  delete BLOCKS.__test_resist_fire__;
  delete BLOCKS.__test_immune_fire__;
}

console.log('castSpell — damage_blocks: multi-component damage (e.g. Ice Storm) sums both components against the same block');
{
  registerBlock('__test_multidmg__', { all: 0, solid: true, opaque: true, hp: 1000 });
  const store = new VoxelStore();
  store.set(0, 0, 0, '__test_multidmg__');
  const ctx = { store, blockHpMap: new Map() };
  const spell = createSpell({
    name: 'Test Ice Storm', effect: 'damage_blocks', radius: 0,
    damage: [{ dice: '1d1', type: 'bludgeoning' }, { dice: '1d1', type: 'cold' }],
  });
  const result = castSpell(spell, ctx, 0, 0, 0);
  assert(result.totalDamage === 2, 'two 1d1 components sum to exactly 2 total damage against one block');
  assert(ctx.blockHpMap.get(keyFor(0, 0, 0)) === 998, 'HP reflects the SUM of both damage components, not just one');
  delete BLOCKS.__test_multidmg__;
}

console.log('castSpell — an unknown spell effect throws rather than silently no-oping');
{
  const store = new VoxelStore();
  const badSpell = { id: 'bad', name: 'Bad', effect: 'not_a_real_effect', radius: 1 };
  let threw = false;
  try {
    castSpell(badSpell, { store }, 0, 0, 0);
  } catch (e) {
    threw = /unknown spell effect/.test(e.message);
  }
  assert(threw, 'casting a spell with a corrupted/unknown effect name throws a clear error');
}

console.log('SPELL_EFFECTS registry — every entry has a label and an apply function');
{
  for (const [key, def] of Object.entries(SPELL_EFFECTS)) {
    assert(typeof def.label === 'string' && def.label.length > 0, `${key} has a human-readable label`);
    assert(typeof def.apply === 'function', `${key} has an apply function`);
  }
}

console.log('spell library persistence (same makeLibrary helper every content type uses)');
{
  saveSpellLibrary([]); // clean slate
  assert(loadSpellLibrary().length === 0, 'starts empty');
  addSpellToLibrary(createSpell({ name: 'Gust of Wind', effect: 'clear_gas', radius: 3 }));
  addSpellToLibrary(createSpell({ name: 'Disintegrate', effect: 'remove_blocks', radius: 1 }));
  assert(loadSpellLibrary().length === 2, 'two distinct spells persisted');
  removeSpellFromLibrary('gust_of_wind');
  const lib = loadSpellLibrary();
  assert(lib.length === 1 && lib[0].id === 'disintegrate', 'removeSpellFromLibrary drops only the targeted entry, survives a fresh load call');
}

console.log('DND_SPELL_PRESETS — every preset is a real, castable spell definition (createSpell/SPELL_EFFECTS agree with it)');
{
  assert(DND_SPELL_PRESETS.length > 0, 'the preset list is non-empty');
  const seenNames = new Set();
  for (const preset of DND_SPELL_PRESETS) {
    assert(!seenNames.has(preset.name), `"${preset.name}" is not a duplicate entry`);
    seenNames.add(preset.name);
    assert(SPELL_EFFECTS[preset.effect] !== undefined, `"${preset.name}"'s effect ("${preset.effect}") is a real SPELL_EFFECTS key`);
    assert(typeof preset.radius === 'number' && preset.radius > 0, `"${preset.name}" has a positive numeric radius`);
    const effectDef = SPELL_EFFECTS[preset.effect];
    if (effectDef.needsDamage) {
      assert(Array.isArray(preset.damage) && preset.damage.length > 0, `"${preset.name}" has at least one damage component (needsDamage effect)`);
      for (const comp of preset.damage) {
        let parsedOk = true;
        try { parseDice(comp.dice); } catch { parsedOk = false; }
        assert(parsedOk, `"${preset.name}"'s damage dice ("${comp.dice}") is valid "NdM" notation`);
        assert(typeof comp.type === 'string' && comp.type.length > 0, `"${preset.name}"'s damage component has a type string`);
      }
    }
    // createSpell should accept every preset as-is (place_gas presets need a material — the
    // Spell Maker UI supplies one at creation time; here just confirm the preset ITSELF doesn't
    // violate needsMaterial/needsDamage in some other way, e.g. an effect that forbids one).
    const spell = createSpell({
      name: preset.name,
      effect: preset.effect,
      radius: preset.radius,
      shape: preset.shape || null,
      height: preset.height != null ? preset.height : null,
      side: preset.side != null ? preset.side : null,
      length: preset.length != null ? preset.length : null,
      width: preset.width != null ? preset.width : null,
      material: effectDef.needsMaterial ? (preset.material || 'gas') : null,
      damage: effectDef.needsDamage ? preset.damage : null,
      fx: preset.fx || null,
    });
    assert(spell.id === preset.name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, ''), `"${preset.name}" slugifies to a valid spell id`);
    if (preset.fx && preset.fx.theme) {
      assert(spell.fx && spell.fx.theme === preset.fx.theme, `"${preset.name}" carries themed fx`);
    }
    // Geometry fields round-trip
    if (preset.side != null) assert(spell.side === preset.side, `"${preset.name}" side=${preset.side}`);
    if (preset.length != null) assert(spell.length === preset.length, `"${preset.name}" length=${preset.length}`);
    if (preset.width != null) assert(spell.width === preset.width, `"${preset.name}" width=${preset.width}`);
  }
}

console.log('parseDice / rollDice — "NdM" notation, real per-roll randomization within the correct range');
{
  const { count, sides } = parseDice('8d6');
  assert(count === 8 && sides === 6, 'parseDice splits "8d6" into count=8, sides=6');

  let threw = false;
  try { parseDice('not dice'); } catch (e) { threw = /bad dice notation/.test(e.message); }
  assert(threw, 'garbage notation throws a clear error instead of silently returning NaN');

  // 8d6 ranges 8..48 — roll it many times and confirm both the bounds hold AND it isn't always
  // the same number (i.e. genuinely random, not a fixed/average value masquerading as a roll).
  const rolls = Array.from({ length: 200 }, () => rollDice('8d6'));
  assert(rolls.every((r) => r >= 8 && r <= 48), 'every roll of 8d6 falls within its true 8..48 range');
  assert(new Set(rolls).size > 1, '200 rolls of 8d6 are not all identical — genuinely randomized per call, not a fixed number');

  // 1d1 has exactly one possible outcome — a clean way to check the exact edge values without
  // relying on randomness at all.
  assert(rollDice('1d1') === 1, '1d1 always rolls exactly 1');
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
