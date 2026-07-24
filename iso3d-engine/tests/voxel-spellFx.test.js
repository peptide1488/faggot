/**
 * spellFx — pure spawn/tick/palette/recipe/theme tests (no DOM/canvas).
 */
import {
  createSpellFxState,
  spawnSpellBurst,
  queueSpellCast,
  tickSpellFx,
  paletteForSpell,
  resolveFxRecipe,
  themeForSpell,
  projectGridToScreen,
  SPELL_SPRITE,
  hasSpellSprites,
  loadSpellSprites,
} from '../src/voxel/spellFx.js';

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assert failed');
}

console.log('themeForSpell — unique themes per named spell');
{
  assert(themeForSpell({ name: 'Fireball', effect: 'damage_blocks' }) === 'fireball', 'fireball theme');
  assert(themeForSpell({ name: 'Web', effect: 'place_gas' }) === 'web', 'web theme');
  assert(themeForSpell({ name: 'Entangle', effect: 'place_gas' }) === 'vines', 'entangle → vines');
  assert(themeForSpell({ name: 'Lightning Bolt', effect: 'damage_blocks' }) === 'lightning', 'lightning theme');
  assert(themeForSpell({ name: 'Gust of Wind', effect: 'clear_gas' }) === 'wind', 'gust → wind');
  assert(themeForSpell({ name: 'Custom', effect: 'damage_blocks', fx: { theme: 'ice' } }) === 'ice', 'fx.theme override');
}

console.log('spellFx palette + resolveFxRecipe');
{
  const fireSpell = { name: 'Fireball', effect: 'damage_blocks', radius: 4, damage: [{ dice: '8d6', type: 'fire' }] };
  const pal = paletteForSpell(fireSpell, null);
  assert(pal.length >= 3 && pal[0].startsWith('#'), 'fire palette');

  const recipe = resolveFxRecipe(fireSpell, null);
  assert(recipe.theme === 'fireball', 'fireball recipe theme');
  assert(recipe.hits >= 2, 'fireball multi-hits');
  assert(recipe.projectile === true, 'fireball flies as a bolt');
  assert(recipe.intensity > 1.2, 'fireball high intensity');
  assert(recipe.visualRadius >= 4, 'fireball visual radius not crushed');

  const web = resolveFxRecipe({ name: 'Web', effect: 'place_gas', radius: 2, material: 'fog' }, null);
  assert(web.theme === 'web', 'web recipe theme');
  assert(web.projectile === false, 'web is ground-cast, no bolt');
  assert(web.visualRadius <= 3.5, 'soft themes cap visual radius');

  const sleet = resolveFxRecipe({ name: 'Sleet Storm', effect: 'place_gas', radius: 8, material: 'fog' }, null);
  assert(sleet.visualRadius <= 3.5, 'huge cloud spells do not scale FX to r=8');

  const gust = resolveFxRecipe({ name: 'Gust of Wind', effect: 'clear_gas', radius: 3 }, null);
  assert(gust.projectile === false, 'gust is local swirl');
  assert(gust.theme === 'wind', 'gust wind theme');

  const meteor = resolveFxRecipe({ name: 'Meteor Swarm', effect: 'damage_blocks', radius: 8, damage: [{ dice: '20d6', type: 'fire' }] }, null);
  assert(meteor.hits >= 4, 'meteor multi-hits hard');
  assert(meteor.theme === 'meteor', 'meteor theme');

  const custom = resolveFxRecipe({ name: 'Poke', effect: 'remove_blocks', radius: 1, fx: { hits: 1, projectile: false, pillars: 0 } }, null);
  assert(custom.hits === 1 && custom.projectile === false && custom.pillars === 0, 'spell.fx overrides defaults');
}

console.log('queueSpellCast — projectile then multi-hit impacts');
{
  const state = createSpellFxState();
  const spell = { name: 'Fireball', effect: 'damage_blocks', radius: 3, damage: [{ dice: '8d6', type: 'fire' }] };
  queueSpellCast(state, {
    spell,
    result: { destroyed: 0 },
    from: { c: 0, r: 0, z: 1 },
    to: { c: 5, r: 5, z: 2 },
  });
  assert(state.projectiles.length === 1, 'bolt is in flight');
  assert(state.projectiles[0].theme === 'fireball', 'projectile carries theme');
  assert(state.bursts.length === 0, 'no impact yet while bolt flies');

  state.projectiles[0].born = performance.now() - 9999;
  tickSpellFx(state, 16);
  assert(state.projectiles.length === 0, 'bolt consumed');
  assert(state.pending.length >= 2, 'multi-hit waves queued on arrival');

  for (const p of state.pending) p.fireAt = 0;
  tickSpellFx(state, 16);
  assert(state.bursts.length >= 2, 'multiple impact bursts live');
  assert(state.bursts[0].theme === 'fireball', 'burst themed');
  assert(state.bursts[0].extras && state.bursts[0].extras.some((e) => e.kind === 'mega_burst'), 'fireball mega burst extra');
  assert(state.flash > 0.2, 'flash active');
}

console.log('spawnSpellBurst — no projectile path (instant local)');
{
  const state = createSpellFxState();
  spawnSpellBurst(state, { name: 'Gust of Wind', effect: 'clear_gas', radius: 3 }, null, 2, 2, 1);
  assert(state.projectiles.length === 0, 'gust has no bolt');
  assert(state.pending.length >= 1 || state.bursts.length >= 1, 'gust still produces impacts');
}

console.log('web impact uses cobweb sprites');
{
  const state = createSpellFxState();
  spawnSpellBurst(state, { name: 'Web', effect: 'place_gas', radius: 2, material: 'fog' }, null, 1, 1, 1);
  for (const p of state.pending) p.fireAt = 0;
  tickSpellFx(state, 16);
  assert(state.bursts.length >= 1, 'web burst');
  const parts = state.bursts[0].particles;
  assert(parts.some((p) => p.sprite === SPELL_SPRITE.cobweb || p.sprite === SPELL_SPRITE.web_strand), 'web particles');
}

console.log('projectGridToScreen — identity-ish MVP');
{
  const s = 0.1;
  const mvp = new Float32Array([
    s, 0, 0, 0,
    0, s, 0, 0,
    0, 0, s, 0,
    0, 0, 0, 1,
  ]);
  const p = projectGridToScreen(0, 0, 0, mvp, 200, 100);
  assert(p && Number.isFinite(p.x) && Number.isFinite(p.y), 'finite screen pos');
  assert(Math.abs(p.x - 100) < 30, 'near horizontal center');
  assert(Math.abs(p.y - 50) < 30, 'near vertical center');
}

console.log('SPELL_SPRITE themed cells + loadSpellSprites API');
{
  assert(SPELL_SPRITE.fire_burst === 13, 'fire_burst cell');
  assert(SPELL_SPRITE.cobweb === 18, 'cobweb cell');
  assert(SPELL_SPRITE.vine === 20, 'vine cell');
  assert(SPELL_SPRITE.lightning === 16, 'lightning cell');
  assert(SPELL_SPRITE.magic_circle === 32, 'Disgaea magic_circle');
  assert(SPELL_SPRITE.multi_star === 33, 'Disgaea multi_star');
  assert(SPELL_SPRITE.spiral_arm === 39, 'spiral_arm last cell');
  loadSpellSprites(null);
  assert(hasSpellSprites() === false, 'null clears sprites');
  loadSpellSprites({ width: 256, height: 160 });
  assert(hasSpellSprites() === true, 'sheet attached');
  loadSpellSprites(null);
}

console.log('fireball burst has magic circles + gather particles');
{
  const state = createSpellFxState();
  spawnSpellBurst(state, { name: 'Fireball', effect: 'damage_blocks', radius: 4, damage: [{ dice: '8d6', type: 'fire' }] }, null, 1, 1, 1);
  for (const p of state.pending) p.fireAt = 0;
  tickSpellFx(state, 16);
  assert(state.bursts.length >= 1, 'burst');
  const b = state.bursts[0];
  assert(b.circles && b.circles.length >= 2, 'magic circles on fireball');
  assert(b.particles.some((p) => p.mode === 'gather'), 'charge-in gather particles');
  assert(b.particles.some((p) => p.mode === 'orbit'), 'orbiting motes');
  assert(b.extras && b.extras.some((e) => e.kind === 'multi_star'), 'multi_star peak');
  assert(b.extras.some((e) => e.kind === 'lens_flare'), 'lens flare');
}

console.log('ok — spellFx tests passed');
