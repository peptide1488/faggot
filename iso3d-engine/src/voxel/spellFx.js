/**
 * Spell presentation FX — Disgaea 2 / NIS-style layered bursts on a 2D overlay.
 *
 * Disgaea 2 (PS2) spell DNA we approximate here:
 *   1. Magic circle under the target (rotating, multi-ring)
 *   2. Charge-in phase (orbs spiral toward center)
 *   3. Peak flash: multi-point star + lens flare + white core
 *   4. Shockwave rings staggered in time (2–4 layers)
 *   5. Dense element particles (outward + rising residual)
 *   6. Vertical pillars / sky bolts on big hits
 *   7. Screen color wash; additive-ish glow stacking
 *
 * Graphics: spell_fx.png (8×5 × 32px). Audio: spellAudio.js.
 * Pure presentation — no rules.
 */

import { playSpellCast, playSpellImpact } from './spellAudio.js';

/** @typedef {{
 *   hits?:number, hitGapMs?:number, projectile?:boolean, projectileMs?:number,
 *   pillars?:number, intensity?:number, palette?:string[], theme?:string
 * }} SpellFxRecipe */

/** Cell indices — matches tools/gen_spell_sprites.py (8×5). */
export const SPELL_SPRITE = {
  soft_glow: 0,
  spark: 1,
  star: 2,
  ring: 3,
  bolt_head: 4,
  bolt_body: 5,
  impact: 6,
  pillar: 7,
  mote: 8,
  flare: 9,
  swirl: 10,
  cross: 11,
  fire_blob: 12,
  fire_burst: 13,
  shockwave: 14,
  ember: 15,
  lightning: 16,
  zap_fork: 17,
  cobweb: 18,
  web_strand: 19,
  vine: 20,
  leaf: 21,
  ice_shard: 22,
  snowflake: 23,
  poison_bubble: 24,
  skull: 25,
  insect: 26,
  grease_drip: 27,
  sparkle: 28,
  thorn: 29,
  holy_ray: 30,
  wind_slash: 31,
  magic_circle: 32,
  multi_star: 33,
  rune_ring: 34,
  charge_orb: 35,
  debris: 36,
  lens_flare: 37,
  double_ring: 38,
  spiral_arm: 39,
};

const SPRITE_CELL = 32;
const SPRITE_COLS = 8;

/** @type {CanvasImageSource|null} */
let _sheet = null;
/** @type {HTMLCanvasElement|null} */
let _tintCanvas = null;
/** @type {CanvasRenderingContext2D|null} */
let _tintCtx = null;

export function loadSpellSprites(img) {
  _sheet = img || null;
  return !!_sheet;
}

export function hasSpellSprites() {
  return !!_sheet;
}

export function loadSpellSpritesFromUrl(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      loadSpellSprites(img);
      resolve(img);
    };
    img.onerror = () => reject(new Error('Failed to load spell sprites: ' + url));
    img.src = url;
  });
}

/**
 * @param {boolean} [additive] lighter composite — stacks like Disgaea additive billboards
 */
function drawTintedSprite(ctx, cell, x, y, w, h, hex, alpha, rot = 0, additive = false) {
  if (!_sheet || alpha <= 0.01 || cell == null || cell < 0) return false;
  if (!_tintCanvas) {
    _tintCanvas = document.createElement('canvas');
    _tintCanvas.width = SPRITE_CELL;
    _tintCanvas.height = SPRITE_CELL;
    _tintCtx = _tintCanvas.getContext('2d');
  }
  const col = cell % SPRITE_COLS;
  const row = (cell / SPRITE_COLS) | 0;
  const sx = col * SPRITE_CELL;
  const sy = row * SPRITE_CELL;
  const t = _tintCtx;
  t.clearRect(0, 0, SPRITE_CELL, SPRITE_CELL);
  t.globalCompositeOperation = 'source-over';
  t.globalAlpha = 1;
  t.drawImage(/** @type {CanvasImageSource} */ (_sheet), sx, sy, SPRITE_CELL, SPRITE_CELL, 0, 0, SPRITE_CELL, SPRITE_CELL);
  t.globalCompositeOperation = 'source-in';
  t.fillStyle = hex;
  t.fillRect(0, 0, SPRITE_CELL, SPRITE_CELL);
  t.globalCompositeOperation = 'source-over';

  ctx.save();
  ctx.translate(x, y);
  if (rot) ctx.rotate(rot);
  ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
  if (additive) ctx.globalCompositeOperation = 'lighter';
  ctx.drawImage(_tintCanvas, -w * 0.5, -h * 0.5, w, h);
  ctx.restore();
  return true;
}

export function createSpellFxState() {
  return {
    bursts: [],
    projectiles: [],
    pending: [],
    flash: 0,
    flashColor: [1, 1, 1],
  };
}

/**
 * Resolve a named presentation theme from spell.fx.theme, name, material, or damage type.
 * Exported for tests.
 */
export function themeForSpell(spell) {
  if (spell && spell.fx && spell.fx.theme) return String(spell.fx.theme).toLowerCase();
  const name = String((spell && spell.name) || '').toLowerCase();
  if (name.includes('fireball') || name.includes('meteor')) return name.includes('meteor') ? 'meteor' : 'fireball';
  if (name.includes('lightning') || name.includes('chain')) return 'lightning';
  if (name.includes('web')) return 'web';
  if (name.includes('entangle')) return 'vines';
  if (name.includes('grease')) return 'grease';
  if (name.includes('insect')) return 'swarm';
  if (name.includes('spike')) return 'spikes';
  if (name.includes('faerie')) return 'faerie';
  if (name.includes('hypnotic')) return 'psychic';
  if (name.includes('moonbeam') || name.includes('sunburst') || name.includes('sunbeam')) return 'radiant';
  if (name.includes('spirit')) return 'spirit';
  if (name.includes('cloudkill') || name.includes('stinking')) return 'poison';
  if (name.includes('sleet') || name.includes('ice') || name.includes('cone of cold')) return 'ice';
  if (name.includes('gust') || name.includes('wind')) return 'wind';
  if (name.includes('thunder') || name.includes('shatter')) return 'thunder';
  if (name.includes('circle of death') || name.includes('necrotic')) return 'necrotic';
  if (name.includes('flame strike') || name.includes('burning')) return 'fire';
  if (name.includes('disintegrate')) return 'disintegrate';

  const effect = spell && spell.effect;
  if (effect === 'clear_gas') return 'wind';
  if (effect === 'place_gas') {
    const mat = String(spell.material || '').toLowerCase();
    if (mat.includes('fog')) return 'fog';
    return 'poison';
  }
  if (effect === 'remove_blocks') return 'disintegrate';

  const dtype = String((spell && spell.damage && spell.damage[0] && spell.damage[0].type) || '').toLowerCase();
  if (dtype.includes('fire')) return 'fire';
  if (dtype.includes('cold') || dtype.includes('frost') || dtype.includes('ice')) return 'ice';
  if (dtype.includes('lightning')) return 'lightning';
  if (dtype.includes('thunder')) return 'thunder';
  if (dtype.includes('poison') || dtype.includes('acid')) return 'poison';
  if (dtype.includes('necrotic')) return 'necrotic';
  if (dtype.includes('radiant')) return 'radiant';
  if (dtype.includes('psychic')) return 'psychic';
  return 'generic';
}

/** Theme → saturated JRPG palette. */
export function paletteForSpell(spell, result) {
  if (spell && Array.isArray(spell.fx && spell.fx.palette) && spell.fx.palette.length) {
    return spell.fx.palette.slice();
  }
  const theme = themeForSpell(spell);
  const byTheme = {
    fireball: ['#ff6a20', '#ffd040', '#ff2000', '#fff4a0'],
    fire: ['#ff7a3a', '#ffd060', '#ff3010', '#fff4a0'],
    meteor: ['#ff5020', '#ffc040', '#ff1000', '#ffffff'],
    lightning: ['#f5e36b', '#ffffff', '#ffe020', '#a0d0ff'],
    thunder: ['#c0d0ff', '#ffffff', '#8090ff', '#e8ecff'],
    web: ['#e8e0d0', '#ffffff', '#a09080', '#c8c0b0'],
    vines: ['#3a8a30', '#7dca6a', '#1a5018', '#c8ff90'],
    grease: ['#6a5a20', '#c4b060', '#3a3010', '#e8d890'],
    swarm: ['#4a3a20', '#8a7040', '#2a2010', '#c0a060'],
    spikes: ['#6a5a48', '#a09070', '#3a3028', '#d0c0a0'],
    faerie: ['#80e0ff', '#ff80e0', '#ffffff', '#c0ff80'],
    psychic: ['#d48cff', '#ffffff', '#a040ff', '#f0d0ff'],
    radiant: ['#fff4a8', '#ffffff', '#ffe060', '#fffce0'],
    spirit: ['#a0c0ff', '#ffffff', '#6080ff', '#e0f0ff'],
    poison: ['#7dca6a', '#b0ff90', '#406030', '#e0ffc8'],
    fog: ['#d0d8e8', '#a0b0c8', '#ffffff', '#708098'],
    ice: ['#8ecfff', '#ffffff', '#4090ff', '#d0f0ff'],
    wind: ['#c8f0ff', '#ffffff', '#8ecfff', '#e8ffff'],
    necrotic: ['#6b5b8c', '#c090ff', '#2a1838', '#e0c0ff'],
    disintegrate: ['#ffb060', '#fff0c0', '#ff6030', '#ffffff'],
    generic: ['#ffe08a', '#ffffff', '#ffb040', '#fff8d0'],
  };
  if (byTheme[theme]) return byTheme[theme].slice();
  if (result && result.destroyed > 0) return byTheme.fireball.slice();
  return byTheme.generic.slice();
}

/** Per-theme particle sprite picks + visual behaviour flags. */
function themeProfile(theme) {
  const S = SPELL_SPRITE;
  const profiles = {
    fireball: {
      particles: [S.fire_blob, S.fire_burst, S.ember, S.spark, S.soft_glow],
      hitSprite: S.fire_burst,
      ringSprite: S.shockwave,
      trailSprite: S.ember,
      headSprite: S.fire_blob,
      shockwave: true,
      huge: true,
      rise: 1.2,
      spin: 1.5,
    },
    fire: {
      particles: [S.fire_blob, S.ember, S.spark, S.soft_glow],
      hitSprite: S.fire_burst,
      ringSprite: S.shockwave,
      trailSprite: S.ember,
      headSprite: S.fire_blob,
      shockwave: true,
      rise: 1.0,
      spin: 1.2,
    },
    meteor: {
      particles: [S.fire_burst, S.fire_blob, S.ember, S.impact],
      hitSprite: S.fire_burst,
      ringSprite: S.shockwave,
      trailSprite: S.fire_blob,
      headSprite: S.fire_burst,
      shockwave: true,
      huge: true,
      rise: 0.8,
      spin: 0.5,
    },
    lightning: {
      particles: [S.spark, S.zap_fork, S.mote, S.flare],
      hitSprite: S.lightning,
      ringSprite: S.ring,
      trailSprite: S.zap_fork,
      headSprite: S.lightning,
      boltSky: true,
      rise: 0.3,
      spin: 0,
    },
    thunder: {
      particles: [S.ring, S.impact, S.spark, S.flare],
      hitSprite: S.impact,
      ringSprite: S.shockwave,
      trailSprite: S.flare,
      headSprite: S.star,
      shockwave: true,
      rise: 0.4,
      spin: 0.8,
    },
    web: {
      particles: [S.cobweb, S.web_strand, S.mote],
      hitSprite: S.cobweb,
      ringSprite: S.ring,
      trailSprite: S.web_strand,
      headSprite: S.cobweb,
      soft: true,
      ground: true,
      rise: 0.15,
      spin: 0.3,
    },
    vines: {
      particles: [S.vine, S.leaf, S.thorn],
      hitSprite: S.vine,
      ringSprite: S.ring,
      trailSprite: S.leaf,
      headSprite: S.leaf,
      soft: true,
      ground: true,
      rise: 0.55,
      spin: 0.6,
    },
    grease: {
      particles: [S.grease_drip, S.mote, S.soft_glow],
      hitSprite: S.grease_drip,
      ringSprite: S.ring,
      trailSprite: S.grease_drip,
      headSprite: S.grease_drip,
      soft: true,
      ground: true,
      rise: 0.05,
      spin: 0.2,
    },
    swarm: {
      particles: [S.insect, S.mote, S.soft_glow],
      hitSprite: S.insect,
      ringSprite: S.ring,
      trailSprite: S.insect,
      headSprite: S.insect,
      soft: true,
      rise: 0.9,
      spin: 2.5,
    },
    spikes: {
      particles: [S.thorn, S.spark, S.mote],
      hitSprite: S.thorn,
      ringSprite: S.ring,
      trailSprite: S.thorn,
      headSprite: S.thorn,
      ground: true,
      rise: 0.7,
      spin: 0.2,
    },
    faerie: {
      particles: [S.sparkle, S.mote, S.star, S.soft_glow],
      hitSprite: S.sparkle,
      ringSprite: S.ring,
      trailSprite: S.sparkle,
      headSprite: S.sparkle,
      soft: true,
      rise: 0.6,
      spin: 2.0,
    },
    psychic: {
      particles: [S.sparkle, S.swirl, S.star, S.soft_glow],
      hitSprite: S.star,
      ringSprite: S.ring,
      trailSprite: S.swirl,
      headSprite: S.star,
      rise: 0.5,
      spin: 1.8,
    },
    radiant: {
      particles: [S.sparkle, S.holy_ray, S.star, S.soft_glow],
      hitSprite: S.holy_ray,
      ringSprite: S.ring,
      trailSprite: S.sparkle,
      headSprite: S.holy_ray,
      rise: 0.4,
      spin: 0.5,
    },
    spirit: {
      particles: [S.soft_glow, S.sparkle, S.swirl, S.mote],
      hitSprite: S.soft_glow,
      ringSprite: S.ring,
      trailSprite: S.soft_glow,
      headSprite: S.soft_glow,
      rise: 1.0,
      spin: 1.0,
    },
    poison: {
      particles: [S.poison_bubble, S.soft_glow, S.mote],
      hitSprite: S.poison_bubble,
      ringSprite: S.ring,
      trailSprite: S.poison_bubble,
      headSprite: S.poison_bubble,
      soft: true,
      rise: 0.7,
      spin: 0.4,
    },
    fog: {
      particles: [S.soft_glow, S.swirl, S.mote],
      hitSprite: S.soft_glow,
      ringSprite: S.ring,
      trailSprite: S.soft_glow,
      headSprite: S.soft_glow,
      soft: true,
      rise: 0.5,
      spin: 0.3,
    },
    ice: {
      particles: [S.ice_shard, S.snowflake, S.spark, S.mote],
      hitSprite: S.ice_shard,
      ringSprite: S.ring,
      trailSprite: S.snowflake,
      headSprite: S.ice_shard,
      rise: 0.35,
      spin: 1.2,
    },
    wind: {
      particles: [S.wind_slash, S.swirl, S.mote, S.flare],
      hitSprite: S.wind_slash,
      ringSprite: S.ring,
      trailSprite: S.wind_slash,
      headSprite: S.swirl,
      soft: true,
      rise: 0.4,
      spin: 2.2,
    },
    necrotic: {
      particles: [S.skull, S.soft_glow, S.mote, S.swirl],
      hitSprite: S.skull,
      ringSprite: S.ring,
      trailSprite: S.soft_glow,
      headSprite: S.skull,
      rise: 0.6,
      spin: 0.4,
    },
    disintegrate: {
      particles: [S.spark, S.cross, S.mote, S.flare],
      hitSprite: S.cross,
      ringSprite: S.ring,
      trailSprite: S.spark,
      headSprite: S.cross,
      rise: 0.5,
      spin: 1.0,
    },
    generic: {
      particles: [S.spark, S.star, S.soft_glow, S.mote, S.cross],
      hitSprite: S.impact,
      ringSprite: S.ring,
      trailSprite: S.bolt_body,
      headSprite: S.bolt_head,
      rise: 0.7,
      spin: 1.0,
    },
  };
  return profiles[theme] || profiles.generic;
}

/**
 * Resolve full FX recipe. Visual scale for soft/cloud themes is capped so radius-8 sleet
 * doesn't paint a screen-wide disco of identical rings.
 */
export function resolveFxRecipe(spell, result) {
  const fx = (spell && spell.fx) || {};
  const effect = spell && spell.effect;
  const radius = Math.max(1, Number(spell && spell.radius) || 3);
  const theme = (fx.theme && String(fx.theme).toLowerCase()) || themeForSpell(spell);
  const palette = paletteForSpell({ ...spell, fx: { ...fx, theme } }, result);
  const prof = themeProfile(theme);

  let hits = 1;
  let hitGapMs = 130;
  let projectile = true;
  let projectileMs = 260;
  let pillars = 0;
  let intensity = 1;

  if (effect === 'damage_blocks' || effect === 'remove_blocks') {
    hits = radius >= 6 ? 3 : radius >= 3 ? 2 : 1;
    intensity = 1.1;
    projectileMs = 200 + Math.min(160, radius * 18);
  } else if (effect === 'clear_gas') {
    hits = 1;
    intensity = 0.85;
    projectile = false;
  } else if (effect === 'place_gas') {
    hits = 1;
    intensity = 0.7;
    projectile = !prof.ground;
    projectileMs = 280;
  }

  // Theme-driven defaults (named PHB spells get personality)
  if (theme === 'fireball' || theme === 'meteor') {
    hits = theme === 'meteor' ? 5 : 3;
    hitGapMs = theme === 'meteor' ? 110 : 100;
    intensity = theme === 'meteor' ? 1.55 : 1.45;
    projectile = true;
  } else if (theme === 'lightning') {
    hits = 2;
    hitGapMs = 70;
    projectileMs = 140;
    intensity = 1.25;
  } else if (prof.soft || prof.ground) {
    hits = 1;
    pillars = 0;
    intensity = Math.min(intensity, 0.85);
    if (prof.ground) projectile = false;
  } else if (theme === 'radiant' && radius >= 8) {
    hits = 3;
    pillars = 6;
    intensity = 1.3;
  } else if (theme === 'necrotic' && radius >= 8) {
    hits = 3;
    pillars = 4;
    intensity = 1.25;
  }

  // Soft/cloud visual radius: don't scale screen FX with full mechanical r (sleet r=8)
  let visualRadius = radius;
  if (prof.soft || prof.ground || effect === 'place_gas') {
    visualRadius = Math.min(radius, 3.5);
  } else if (prof.huge) {
    visualRadius = Math.min(radius * 1.15, 10);
  } else {
    visualRadius = Math.min(radius, 8);
  }

  return {
    hits: clampInt(fx.hits != null ? fx.hits : hits, 1, 8),
    hitGapMs: clampInt(fx.hitGapMs != null ? fx.hitGapMs : hitGapMs, 40, 400),
    projectile: fx.projectile != null ? !!fx.projectile : projectile,
    projectileMs: clampInt(fx.projectileMs != null ? fx.projectileMs : projectileMs, 80, 900),
    pillars: clampInt(fx.pillars != null ? fx.pillars : pillars, 0, 12),
    intensity: Math.max(0.3, Math.min(2, fx.intensity != null ? Number(fx.intensity) : intensity)),
    palette,
    theme,
    visualRadius,
  };
}

function clampInt(v, lo, hi) {
  return Math.max(lo, Math.min(hi, Math.round(Number(v) || lo)));
}

export function queueSpellCast(state, opts) {
  const { spell, result = null, from = null, to } = opts;
  if (!to) return;
  const recipe = resolveFxRecipe(spell, result);
  const radius = Math.max(1, Number(spell.radius) || 3);
  const now = performance.now();

  const impactSpec = {
    c: to.c,
    r: to.r,
    z: to.z,
    spell,
    result,
    recipe,
    radius,
  };

  if (recipe.projectile && from && (from.c !== to.c || from.r !== to.r || from.z !== to.z)) {
    state.projectiles.push({
      c0: from.c,
      r0: from.r,
      z0: from.z + 0.8,
      c1: to.c,
      r1: to.r,
      z1: to.z + 0.5,
      born: now,
      life: recipe.projectileMs,
      palette: recipe.palette,
      intensity: recipe.intensity,
      theme: recipe.theme,
      impact: impactSpec,
    });
    if (state.projectiles.length > 16) state.projectiles.shift();
    state.flash = Math.max(state.flash, 0.22 * recipe.intensity);
    state.flashColor = hexToRgb01(recipe.palette[0]);
    try { playSpellCast(recipe.theme, { intensity: recipe.intensity }); } catch (_) { /* audio optional */ }
  } else {
    scheduleImpactWaves(state, impactSpec, now);
  }
}

export function spawnSpellBurst(state, spell, result, c, r, z) {
  queueSpellCast(state, { spell, result, from: null, to: { c, r, z } });
}

function scheduleImpactWaves(state, impactSpec, startMs) {
  const { recipe, radius } = impactSpec;
  for (let i = 0; i < recipe.hits; i++) {
    state.pending.push({
      fireAt: startMs + i * recipe.hitGapMs,
      hitIndex: i,
      hitTotal: recipe.hits,
      ...impactSpec,
    });
  }
  while (state.pending.length > 40) state.pending.shift();

  const flashMul = recipe.theme === 'fireball' || recipe.theme === 'meteor' ? 0.75 : 0.5;
  state.flash = Math.max(state.flash, (flashMul + Math.min(0.3, radius * 0.03)) * recipe.intensity);
  state.flashColor = hexToRgb01(recipe.palette[0]);
}

function fireImpactWave(state, spec, now) {
  const { recipe, hitIndex, hitTotal } = spec;
  const theme = recipe.theme || 'generic';
  const prof = themeProfile(theme);
  const vr = recipe.visualRadius != null ? recipe.visualRadius : spec.radius;
  const intensity = recipe.intensity * (1 - hitIndex * 0.08);
  // Longer life so residual particles hang like Disgaea afterimages
  const life = (prof.soft ? 1100 : 950) + Math.min(prof.huge ? 700 : 450, vr * 60);
  const scale = 0.75 + (hitIndex / Math.max(1, hitTotal - 1 || 1)) * 0.35;
  try {
    playSpellImpact(theme, { intensity, hitIndex });
  } catch (_) { /* audio optional */ }

  const sprites = prof.particles;
  const particles = [];

  // ── 1) Charge-in orbs (Disgaea: energy gathers before the pop) ──
  const nCharge = Math.round((prof.soft ? 8 : 14) * intensity);
  for (let i = 0; i < nCharge; i++) {
    const ang = (i / nCharge) * Math.PI * 2 + Math.random() * 0.3;
    particles.push({
      mode: 'gather',
      ang,
      speed: 40 + Math.random() * 50 + vr * 8, // start radius, pulls in
      size: 10 + Math.random() * 14 * intensity,
      color: recipe.palette[i % recipe.palette.length],
      delay: 0,
      rise: 0,
      spin: 4 + Math.random() * 6,
      sprite: SPELL_SPRITE.charge_orb,
      lifeMul: 0.28, // die at peak flash
    });
  }

  // ── 2) Main outward burst ──
  const nBase = prof.soft || prof.ground
    ? 14 + Math.min(18, vr * 5)
    : prof.huge
      ? 36 + Math.min(48, vr * 10)
      : 22 + Math.min(36, vr * 7);
  const n = Math.round(nBase * intensity);
  for (let i = 0; i < n; i++) {
    const ang = (i / n) * Math.PI * 2 + Math.random() * 0.4;
    const spr = sprites[i % sprites.length];
    const mode = prof.spin > 1.5 && Math.random() < 0.35 ? 'spiral'
      : Math.random() < 0.2 ? 'spiral' : 'burst';
    particles.push({
      mode,
      ang,
      speed: (prof.soft ? 22 : 42) + Math.random() * (prof.huge ? 130 : 85) + vr * (prof.soft ? 7 : 14) * scale,
      size: (prof.huge ? 18 : 13) + Math.random() * (prof.huge ? 32 : 18) * intensity,
      color: recipe.palette[i % recipe.palette.length],
      delay: 40 + Math.random() * 60, // after charge
      rise: (25 + Math.random() * 70) * scale * (prof.rise || 0.7),
      spin: (Math.random() - 0.5) * 10 * (prof.spin || 1),
      sprite: spr,
      lifeMul: 1,
    });
  }

  // ── 3) Residual rising ash / embers (hang after main hit) ──
  if (!prof.ground) {
    const nRes = Math.round((10 + vr * 2.5) * intensity);
    for (let i = 0; i < nRes; i++) {
      particles.push({
        mode: 'rise',
        ang: Math.random() * Math.PI * 2,
        speed: 3 + Math.random() * 16,
        size: 7 + Math.random() * 12,
        color: recipe.palette[(i + 1) % recipe.palette.length],
        delay: 90 + Math.random() * 200,
        rise: 70 + Math.random() * 160,
        spin: (Math.random() - 0.5) * 3,
        sprite: Math.random() < 0.4 ? SPELL_SPRITE.debris : sprites[i % sprites.length],
        lifeMul: 1.15,
      });
    }
  }

  // ── 4) Orbiting ring motes (classic Disgaea swirl around impact) ──
  const nOrbit = Math.round((prof.soft ? 6 : 10) * intensity);
  for (let i = 0; i < nOrbit; i++) {
    particles.push({
      mode: 'orbit',
      ang: (i / nOrbit) * Math.PI * 2,
      speed: 28 + vr * 6 + Math.random() * 20, // orbit radius
      size: 8 + Math.random() * 10,
      color: recipe.palette[i % recipe.palette.length],
      delay: 30 + Math.random() * 40,
      rise: -5 + Math.random() * 15,
      spin: 3 + Math.random() * 4,
      sprite: SPELL_SPRITE.mote,
      lifeMul: 0.85,
    });
  }

  // ── Shockwave rings (staggered layers) ──
  const ringScale = prof.huge ? 1.4 : prof.soft ? 0.75 : 1.05;
  const rings = [];
  const ringBase = (18 + vr * 11) * scale * ringScale;
  rings.push({
    delay: 35, maxR: ringBase, width: 3,
    color: recipe.palette[0], sprite: SPELL_SPRITE.double_ring, squash: 0.62,
  });
  rings.push({
    delay: 70, maxR: ringBase * 1.35, width: 2,
    color: recipe.palette[1] || recipe.palette[0], sprite: prof.ringSprite || SPELL_SPRITE.ring, squash: 0.62,
  });
  if (!prof.soft || prof.shockwave) {
    rings.push({
      delay: 110, maxR: ringBase * 1.7, width: 4,
      color: recipe.palette[2] || recipe.palette[0],
      sprite: SPELL_SPRITE.shockwave, squash: 0.58,
    });
  }
  if (hitIndex === 0 && (prof.huge || prof.shockwave)) {
    rings.push({
      delay: 160, maxR: ringBase * 2.1, width: 5,
      color: '#ffffff', sprite: SPELL_SPRITE.shockwave, squash: 0.55,
    });
  }

  // ── Magic circles (Disgaea signature) ──
  const circles = [];
  if (hitIndex === 0 || !prof.soft) {
    const cScale = (55 + vr * 14) * scale * intensity;
    circles.push({
      delay: 0, life: life * 0.55,
      size: cScale, spin: 1.8,
      color: recipe.palette[0],
      sprite: SPELL_SPRITE.magic_circle, squash: 0.45,
    });
    circles.push({
      delay: 20, life: life * 0.5,
      size: cScale * 0.78, spin: -2.4,
      color: recipe.palette[1] || recipe.palette[0],
      sprite: SPELL_SPRITE.rune_ring, squash: 0.45,
    });
    if (prof.huge || theme === 'radiant' || theme === 'psychic' || theme === 'spirit') {
      circles.push({
        delay: 40, life: life * 0.4,
        size: cScale * 1.15, spin: 1.2,
        color: recipe.palette[2] || '#ffffff',
        sprite: SPELL_SPRITE.double_ring, squash: 0.42,
      });
    }
  }

  // ── Pillars ──
  const pillars = [];
  let pCount = hitIndex === 0 ? recipe.pillars : Math.max(0, Math.floor(recipe.pillars / 2));
  // Disgaea-style auto pillars on big elemental blasts even if recipe.pillars is 0
  if (pCount === 0 && hitIndex === 0 && (prof.huge || theme === 'ice' || theme === 'fire' || theme === 'fireball')) {
    pCount = prof.huge ? 4 : 2;
  }
  for (let i = 0; i < pCount; i++) {
    const ang = (i / Math.max(1, pCount)) * Math.PI * 2 + Math.random() * 0.4;
    const dist = (0.2 + Math.random() * 0.8) * vr * 0.85;
    pillars.push({
      dc: Math.cos(ang) * dist,
      dr: Math.sin(ang) * dist,
      delay: 50 + i * 30 + Math.random() * 30,
      height: 55 + Math.random() * 90 + vr * 10,
      width: 16 + Math.random() * 20,
      color: recipe.palette[i % recipe.palette.length],
      sprite: theme === 'radiant' || theme === 'spirit' ? SPELL_SPRITE.holy_ray
        : theme === 'ice' ? SPELL_SPRITE.ice_shard
          : SPELL_SPRITE.pillar,
    });
  }

  // ── Extras: sky bolt, mega burst, lens flare, multi-star peak ──
  const extras = [];
  if (prof.boltSky && hitIndex === 0) {
    extras.push({ kind: 'sky_bolt', delay: 40, life: 280 });
  }
  if ((prof.huge || theme === 'fireball' || theme === 'meteor') && hitIndex === 0) {
    extras.push({ kind: 'mega_burst', delay: 45, life: 340 });
  }
  extras.push({ kind: 'lens_flare', delay: 40, life: 180 });
  extras.push({ kind: 'multi_star', delay: 38, life: 220 });
  if (theme === 'wind' || theme === 'psychic') {
    extras.push({ kind: 'spiral_swirl', delay: 20, life: 400 });
  }

  state.bursts.push({
    c: spec.c,
    r: spec.r,
    z: spec.z + 0.5,
    born: now,
    life,
    kind: (spec.spell && spec.spell.effect) || 'burst',
    radius: vr,
    palette: recipe.palette,
    intensity,
    hitIndex,
    theme,
    particles,
    rings,
    pillars,
    circles,
    extras,
    hitSprite: prof.hitSprite,
  });
  if (state.bursts.length > 20) state.bursts.shift();

  const flashPow = (prof.huge ? 0.65 : 0.42) + Math.min(0.28, vr * 0.03);
  state.flash = Math.max(state.flash, flashPow * intensity * (hitIndex === 0 ? 1 : 0.55));
  state.flashColor = hexToRgb01(recipe.palette[hitIndex % recipe.palette.length]);
}

function hexToRgb01(hex) {
  const h = String(hex).replace('#', '');
  if (h.length < 6) return [1, 1, 1];
  return [
    parseInt(h.slice(0, 2), 16) / 255,
    parseInt(h.slice(2, 4), 16) / 255,
    parseInt(h.slice(4, 6), 16) / 255,
  ];
}

export function tickSpellFx(state, dtMs = 16) {
  const now = performance.now();
  const stillPending = [];
  for (const p of state.pending) {
    if (now >= p.fireAt) fireImpactWave(state, p, now);
    else stillPending.push(p);
  }
  state.pending = stillPending;

  const stillFlying = [];
  for (const proj of state.projectiles) {
    if (now - proj.born >= proj.life) {
      if (proj.impact) scheduleImpactWaves(state, proj.impact, now);
    } else {
      stillFlying.push(proj);
    }
  }
  state.projectiles = stillFlying;
  state.bursts = state.bursts.filter((b) => now - b.born < b.life);
  state.flash = Math.max(0, state.flash - dtMs / 260);
}

export function projectGridToScreen(c, r, elev, mvp, canvasW, canvasH) {
  const x = c + 0.5;
  const y = elev;
  const z = r + 0.5;
  const m = mvp;
  const cx = m[0] * x + m[4] * y + m[8] * z + m[12];
  const cy = m[1] * x + m[5] * y + m[9] * z + m[13];
  const cw = m[3] * x + m[7] * y + m[11] * z + m[15];
  if (Math.abs(cw) < 1e-6) return null;
  const ndcX = cx / cw;
  const ndcY = cy / cw;
  return {
    x: (ndcX * 0.5 + 0.5) * canvasW,
    y: (1 - (ndcY * 0.5 + 0.5)) * canvasH,
  };
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function drawSpellFx(ctx, state, mvp, w, h) {
  ctx.clearRect(0, 0, w, h);
  const now = performance.now();
  const useSprites = !!_sheet;

  // Screen color wash (Disgaea full-screen flash)
  if (state.flash > 0.01) {
    const [fr, fg, fb] = state.flashColor;
    const a = state.flash * 0.48;
    ctx.fillStyle = `rgba(${Math.round(fr * 255)},${Math.round(fg * 255)},${Math.round(fb * 255)},${a.toFixed(3)})`;
    ctx.fillRect(0, 0, w, h);
  }

  // ── Projectiles (fatter trail + spinning core) ──
  for (const proj of state.projectiles) {
    const t = Math.min(1, (now - proj.born) / proj.life);
    const ease = easeOutQuad(t);
    const p = projectGridToScreen(
      lerp(proj.c0, proj.c1, ease),
      lerp(proj.r0, proj.r1, ease),
      lerp(proj.z0, proj.z1, ease),
      mvp, w, h,
    );
    if (!p) continue;
    const lookAhead = Math.min(1, ease + 0.04);
    const ap = projectGridToScreen(
      lerp(proj.c0, proj.c1, lookAhead),
      lerp(proj.r0, proj.r1, lookAhead),
      lerp(proj.z0, proj.z1, lookAhead),
      mvp, w, h,
    );
    const ang = ap ? Math.atan2(ap.y - p.y, ap.x - p.x) : 0;
    const inten = proj.intensity || 1;
    const prof = themeProfile(proj.theme || 'generic');

    for (let k = 0; k < 8; k++) {
      const tt = Math.max(0, ease - k * 0.04);
      const tp = projectGridToScreen(
        lerp(proj.c0, proj.c1, tt),
        lerp(proj.r0, proj.r1, tt),
        lerp(proj.z0, proj.z1, tt),
        mvp, w, h,
      );
      if (!tp) continue;
      const ta = (1 - k / 8) * 0.8;
      const col = proj.palette[k % proj.palette.length];
      if (useSprites) {
        const sz = (20 - k * 1.8) * inten;
        drawTintedSprite(ctx, prof.trailSprite, tp.x, tp.y, sz * 1.5, sz * 0.7, col, ta, ang, true);
        if (k < 3) {
          drawTintedSprite(ctx, SPELL_SPRITE.soft_glow, tp.x, tp.y, sz * 1.8, sz * 1.8, col, ta * 0.45, 0, true);
        }
      } else {
        ctx.fillStyle = withAlpha(col, ta * 0.7);
        ctx.beginPath();
        ctx.arc(tp.x, tp.y, 6 - k * 0.6, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    if (useSprites) {
      const hs = (proj.theme === 'fireball' || proj.theme === 'meteor' ? 34 : 24) * inten;
      const spin = now * 0.008;
      drawTintedSprite(ctx, SPELL_SPRITE.soft_glow, p.x, p.y, hs * 2.2, hs * 2.2, proj.palette[0], 0.55, 0, true);
      drawTintedSprite(ctx, SPELL_SPRITE.charge_orb, p.x, p.y, hs * 0.7, hs * 0.7, '#ffffff', 0.95, spin, true);
      drawTintedSprite(ctx, prof.headSprite, p.x, p.y, hs * 1.25, hs * 1.05, '#ffffff', 0.95, ang);
      drawTintedSprite(ctx, prof.headSprite, p.x, p.y, hs, hs * 0.85, proj.palette[1] || proj.palette[0], 0.9, ang + 0.2);
    } else {
      ctx.fillStyle = withAlpha('#ffffff', 0.95);
      ctx.beginPath();
      ctx.arc(p.x, p.y, 6 * inten, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // ── Bursts ──
  for (const burst of state.bursts) {
    const age = now - burst.born;
    const t = age / burst.life;
    const origin = projectGridToScreen(burst.c, burst.r, burst.z, mvp, w, h);
    if (!origin) continue;
    const intensity = burst.intensity || 1;
    const theme = burst.theme || 'generic';
    const prof = themeProfile(theme);

    // Ground glow (pulsing)
    const glowR = (22 + burst.radius * 12) * (0.5 + 0.5 * Math.sin(Math.min(1, t * 2.5) * Math.PI)) * intensity;
    const glowA = Math.max(0, (prof.soft ? 0.25 : 0.38) * (1 - t) * intensity);
    if (useSprites) {
      drawTintedSprite(ctx, SPELL_SPRITE.soft_glow, origin.x, origin.y, glowR * 2.6, glowR * 1.5, burst.palette[1] || '#fff', glowA * 1.4, 0, true);
      drawTintedSprite(ctx, SPELL_SPRITE.soft_glow, origin.x, origin.y, glowR * 1.4, glowR * 0.9, burst.palette[0], glowA, 0, true);
    }

    // Magic circles under target (draw early, under particles)
    if (burst.circles && useSprites) {
      for (const cir of burst.circles) {
        const local = age - cir.delay;
        if (local < 0 || local > cir.life) continue;
        const ct = local / cir.life;
        // Pop in, hold, fade
        let a = ct < 0.12 ? ct / 0.12 : ct > 0.65 ? 1 - (ct - 0.65) / 0.35 : 1;
        a *= 0.85 * intensity;
        const pop = ct < 0.15 ? 0.6 + 0.4 * (ct / 0.15) : 1 + Math.sin(ct * Math.PI) * 0.08;
        const sz = cir.size * pop;
        const rot = (cir.spin || 1) * (local / 1000) * Math.PI * 2;
        const squash = cir.squash || 0.45;
        drawTintedSprite(ctx, cir.sprite, origin.x, origin.y, sz, sz * squash, cir.color, a, rot, true);
        // White rim pulse
        if (ct < 0.35) {
          drawTintedSprite(ctx, SPELL_SPRITE.rune_ring, origin.x, origin.y, sz * 1.05, sz * squash * 1.05, '#ffffff', a * (1 - ct / 0.35) * 0.5, -rot * 0.7, true);
        }
      }
    }

    // Extras
    if (burst.extras) {
      for (const ex of burst.extras) {
        const local = age - ex.delay;
        if (local < 0 || local > ex.life) continue;
        const et = local / ex.life;
        const ea = et < 0.15 ? et / 0.15 : 1 - (et - 0.15) / 0.85;
        if (!useSprites) continue;

        if (ex.kind === 'sky_bolt') {
          const hgt = 140 + burst.radius * 24;
          drawTintedSprite(ctx, SPELL_SPRITE.lightning, origin.x, origin.y - hgt * 0.38, 32 * intensity, hgt, '#ffffff', ea * 0.95, 0, true);
          drawTintedSprite(ctx, SPELL_SPRITE.lightning, origin.x + 8, origin.y - hgt * 0.32, 18 * intensity, hgt * 0.75, burst.palette[0], ea * 0.75, 0.12, true);
          drawTintedSprite(ctx, SPELL_SPRITE.zap_fork, origin.x, origin.y, 60 * intensity, 32 * intensity, '#ffffff', ea * 0.9, et, true);
          drawTintedSprite(ctx, SPELL_SPRITE.soft_glow, origin.x, origin.y - hgt * 0.5, 50, 50, burst.palette[1] || '#fff', ea * 0.5, 0, true);
        }
        if (ex.kind === 'mega_burst') {
          const sz = (80 + burst.radius * 16) * intensity * (0.65 + 0.35 * Math.sin(et * Math.PI));
          drawTintedSprite(ctx, SPELL_SPRITE.fire_burst, origin.x, origin.y, sz, sz, '#ffffff', ea * 0.95, et * 2.2, true);
          drawTintedSprite(ctx, SPELL_SPRITE.fire_burst, origin.x, origin.y, sz * 0.72, sz * 0.72, burst.palette[0], ea * 0.9, -et * 1.8, true);
          drawTintedSprite(ctx, SPELL_SPRITE.fire_blob, origin.x, origin.y - sz * 0.15, sz * 0.5, sz * 0.65, burst.palette[1] || '#fff', ea * 0.7, 0, true);
          drawTintedSprite(ctx, SPELL_SPRITE.shockwave, origin.x, origin.y, sz * 1.5, sz * 0.85, burst.palette[2] || '#fff', ea * 0.65, 0, true);
        }
        if (ex.kind === 'lens_flare') {
          const fl = (90 + burst.radius * 18) * intensity * (0.7 + 0.3 * (1 - et));
          drawTintedSprite(ctx, SPELL_SPRITE.lens_flare, origin.x, origin.y, fl * 1.6, fl * 0.35, '#ffffff', ea * 0.85, 0, true);
          drawTintedSprite(ctx, SPELL_SPRITE.lens_flare, origin.x, origin.y, fl * 1.2, fl * 0.25, burst.palette[0], ea * 0.6, Math.PI / 2, true);
          drawTintedSprite(ctx, SPELL_SPRITE.soft_glow, origin.x, origin.y, fl * 0.5, fl * 0.5, '#ffffff', ea * 0.7, 0, true);
        }
        if (ex.kind === 'multi_star') {
          const ms = (48 + burst.radius * 10) * intensity * (0.75 + 0.25 * Math.sin(et * Math.PI));
          drawTintedSprite(ctx, SPELL_SPRITE.multi_star, origin.x, origin.y, ms, ms, '#ffffff', ea * 0.95, et * 4, true);
          drawTintedSprite(ctx, SPELL_SPRITE.multi_star, origin.x, origin.y, ms * 0.7, ms * 0.7, burst.palette[0], ea * 0.85, -et * 3, true);
          drawTintedSprite(ctx, SPELL_SPRITE.star, origin.x, origin.y, ms * 0.45, ms * 0.45, '#ffffff', ea * 0.9, et * 6, true);
        }
        if (ex.kind === 'spiral_swirl') {
          for (let k = 0; k < 3; k++) {
            const rot = et * 6 + k * 2.1;
            const sz = (50 + burst.radius * 8) * (1 + k * 0.2) * intensity;
            drawTintedSprite(ctx, SPELL_SPRITE.spiral_arm, origin.x, origin.y, sz, sz * 0.7, burst.palette[k % burst.palette.length], ea * 0.55, rot, true);
          }
        }
      }
    }

    // Pillars
    if (burst.pillars) {
      for (const pillar of burst.pillars) {
        const local = age - pillar.delay;
        if (local < 0) continue;
        const pt = Math.min(1, local / (burst.life * 0.5));
        const base = projectGridToScreen(burst.c + pillar.dc, burst.r + pillar.dr, burst.z - 0.4, mvp, w, h);
        if (!base) continue;
        const hgt = pillar.height * easeOutCubic(pt);
        const a = pt < 0.15 ? pt / 0.15 : 1 - (pt - 0.15) / 0.85;
        const w0 = pillar.width * (1.15 - pt * 0.45);
        if (useSprites) {
          const midY = base.y - hgt * 0.5;
          const spr = pillar.sprite != null ? pillar.sprite : SPELL_SPRITE.pillar;
          drawTintedSprite(ctx, spr, base.x, midY, w0 * 2.4, hgt, pillar.color, Math.max(0, a * 0.92), 0, true);
          drawTintedSprite(ctx, SPELL_SPRITE.soft_glow, base.x, base.y - hgt * 0.88, w0 * 1.8, w0 * 1.8, '#ffffff', Math.max(0, a * 0.5), 0, true);
          drawTintedSprite(ctx, SPELL_SPRITE.soft_glow, base.x, base.y, w0 * 2.5, w0 * 1.2, pillar.color, Math.max(0, a * 0.35), 0, true);
        }
      }
    }

    // Rings / shockwaves (squashed ellipses)
    for (const ring of burst.rings) {
      const local = age - ring.delay;
      if (local < 0) continue;
      const rt = Math.min(1, local / (burst.life * (prof.huge ? 0.4 : 0.5)));
      const rad = ring.maxR * easeOutCubic(rt);
      const a = (1 - rt) * 0.92 * intensity;
      if (useSprites) {
        const squash = ring.squash || 0.62;
        const d = rad * 2.2;
        const spr = ring.sprite != null ? ring.sprite : SPELL_SPRITE.ring;
        drawTintedSprite(ctx, spr, origin.x, origin.y, d, d * squash, ring.color, a, 0, true);
        if (rt < 0.28) {
          drawTintedSprite(ctx, SPELL_SPRITE.shockwave, origin.x, origin.y, d * 1.08, d * squash * 0.95, '#ffffff', (1 - rt / 0.28) * 0.55, 0, true);
        }
      }
    }

    // Particles with modes: gather / burst / spiral / orbit / rise
    for (const p of burst.particles) {
      const local = age - p.delay;
      if (local < 0) continue;
      const lifeLeft = (burst.life - p.delay) * (p.lifeMul || 1);
      if (lifeLeft <= 0 || local > lifeLeft) continue;
      const pt = Math.min(1, local / lifeLeft);
      let px; let py; let sz; let a; let rot = 0;
      const mode = p.mode || 'burst';

      if (mode === 'gather') {
        // Spiral inward to center
        const dist = p.speed * (1 - easeOutCubic(pt));
        const ang = p.ang + p.spin * pt;
        px = origin.x + Math.cos(ang) * dist;
        py = origin.y + Math.sin(ang) * dist * 0.55;
        a = pt < 0.7 ? 0.5 + pt * 0.5 : (1 - pt) / 0.3;
        sz = p.size * (0.6 + pt * 0.8);
        rot = ang;
      } else if (mode === 'orbit') {
        const ang = p.ang + p.spin * pt * 2.5;
        const rad = p.speed * (0.7 + 0.3 * Math.sin(pt * Math.PI));
        px = origin.x + Math.cos(ang) * rad;
        py = origin.y + Math.sin(ang) * rad * 0.5 - p.rise * pt;
        a = pt < 0.1 ? pt / 0.1 : 1 - (pt - 0.1) / 0.9;
        sz = p.size * (1.0 - pt * 0.3);
        rot = ang;
      } else if (mode === 'spiral') {
        const dist = p.speed * easeOutQuad(pt);
        const ang = p.ang + p.spin * pt * 3;
        px = origin.x + Math.cos(ang) * dist;
        py = origin.y + Math.sin(ang) * dist * 0.55 - p.rise * pt;
        a = pt < 0.12 ? pt / 0.12 : 1 - (pt - 0.12) / 0.88;
        sz = p.size * (1.15 - pt * 0.5);
        rot = ang + pt * 4;
      } else if (mode === 'rise') {
        const dist = p.speed * easeOutQuad(pt) * 0.4;
        px = origin.x + Math.cos(p.ang) * dist;
        py = origin.y + Math.sin(p.ang) * dist * 0.4 - p.rise * easeOutCubic(pt);
        a = pt < 0.1 ? pt / 0.1 : 1 - (pt - 0.1) / 0.9;
        sz = p.size * (1.0 - pt * 0.4);
        rot = p.spin * pt;
      } else {
        // burst (default outward)
        const dist = p.speed * easeOutQuad(pt);
        const ang = p.ang + p.spin * pt * 0.5;
        px = origin.x + Math.cos(ang) * dist;
        py = origin.y + Math.sin(ang) * dist * 0.55 - p.rise * pt;
        a = pt < 0.12 ? pt / 0.12 : 1 - (pt - 0.12) / 0.88;
        sz = p.size * (1.15 - pt * 0.5);
        rot = p.spin ? pt * 2.5 + p.ang : 0;
      }

      if (useSprites && p.sprite != null) {
        drawTintedSprite(ctx, p.sprite, px, py, sz, sz, p.color, Math.max(0, a), rot, true);
        if (sz > 14 && (p.sprite === SPELL_SPRITE.fire_blob || p.sprite === SPELL_SPRITE.fire_burst || p.sprite === SPELL_SPRITE.charge_orb)) {
          drawTintedSprite(ctx, SPELL_SPRITE.soft_glow, px, py, sz * 0.55, sz * 0.55, '#ffffff', Math.max(0, a * 0.7), 0, true);
        }
      } else {
        ctx.fillStyle = withAlpha(p.color, Math.max(0, a));
        ctx.beginPath();
        ctx.arc(px, py, Math.max(1, sz * 0.3), 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Theme-specific residual accents mid-burst
    if (useSprites && t > 0.08 && t < 0.55) {
      const mid = 1 - Math.abs(t - 0.25) / 0.25;
      if (mid > 0) {
        if (theme === 'web') {
          drawTintedSprite(ctx, SPELL_SPRITE.cobweb, origin.x, origin.y, 70 * intensity * mid, 70 * intensity * mid * 0.7, burst.palette[0], mid * 0.5, t * 2, true);
        } else if (theme === 'vines') {
          for (let k = 0; k < 5; k++) {
            const a0 = (k / 5) * Math.PI * 2 + t * 3;
            drawTintedSprite(ctx, SPELL_SPRITE.vine, origin.x + Math.cos(a0) * 20 * mid, origin.y + Math.sin(a0) * 12 * mid, 36 * intensity, 48 * intensity, burst.palette[k % 2], mid * 0.55, a0, false);
          }
        }
      }
    }
  }
}

function withAlpha(hex, a) {
  const h = String(hex).replace('#', '');
  if (h.length < 6) return `rgba(255,255,255,${a})`;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${Math.max(0, Math.min(1, a)).toFixed(3)})`;
}

function easeOutCubic(t) {
  const u = 1 - t;
  return 1 - u * u * u;
}

function easeOutQuad(t) {
  return 1 - (1 - t) * (1 - t);
}
