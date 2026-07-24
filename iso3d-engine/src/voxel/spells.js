/**
 * Spells — a lightweight, user-authorable "cast an effect at a point" content type, alongside
 * the Material/Object/Decal/Billboard Makers (see CONTENT_TOOLS_PLAN.md). Deliberately scoped
 * to what THIS ENGINE can actually execute directly (manipulating store/gas/block-HP state
 * around a point) — not a full D&D rules engine (creature HP, saving throws, durations stay
 * Grimoire's job, same rules-vs-data boundary every other gameplay hook here keeps).
 *
 * "Gust of Wind" started as a single hardcoded button/mode with a fixed radius the user
 * couldn't see or tune — this generalizes it into a small set of effect TYPES a user can author
 * their own named, own-radius spell around instead, and click to cast/see directly.
 *
 * `damage_blocks` (added after live feedback that blast spells "blow up too much stuff") is
 * what finally makes the `hp`/`vulnerable`/`resistant`/`immune`/`destroyedType`/`threshold`
 * fields customMaterials.js/customObjects.js have carried actually DO something: a block with
 * no `hp` set (stone/bedrock/cliff/dungeon walls) is genuinely INDESTRUCTIBLE and takes zero
 * damage from any spell, matching the 5e reality that Fireball doesn't demolish stone walls.
 * Built structures a user authors as breakable (a wooden door, a crate) take damage from any
 * hit, same as before. Natural TERRAIN (grass/dirt/sand/mud) sits in between: it IS
 * destructible (user ruling 2026-07-21: "should be able to be blown up but not that easy"),
 * but carries `threshold` (the DMG "damage threshold" object rule — a single cast's total
 * damage below the threshold does NOTHING at all, not partial chip damage; at or above it,
 * the full amount applies) plus higher HP and no fire vulnerability, so a stray cantrip
 * scorches without a mark while a real Fireball still genuinely craters it over a couple of
 * casts. Damage dice are rolled with real randomization per cast (see rollDamage), not a
 * fixed/deterministic number.
 */

import { slugify } from './customMaterials.js';
import { makeLibrary } from './contentLibrary.js';
import { markSpreadDirty, GAS_MAX_LIFE, isGasType, GUST_COOLDOWN_TICKS } from './spread.js';
import { BLOCKS, parseBlock } from './blocks.js';
import { keyFor } from './store.js';

/**
 * Grid convention: 1 tile = 5 feet (same as Grimoire).
 *
 * PHB shape → engine fields (see dndSpells.js):
 *   sphere R ft          → shape 'sphere', radius = R/5
 *   cylinder R×H ft      → shape 'cylinder', radius = R/5, height = H/5 (tile layers)
 *   cube S ft            → shape 'cube', side = S/5 (true side length, not Chebyshev r)
 *   square S ft (ground) → shape 'square', side = S/5
 *   line L×W ft          → shape 'line', length = L/5, width = W/5; needs cast from→aim
 *   cone L ft            → shape 'cone', length = L/5; PHB width-at-distance = distance
 *
 * @param {number} c cast/aim column
 * @param {number} r cast/aim row
 * @param {number} z cast/aim elevation
 * @param {number} radius sphere/cylinder radius in tiles
 * @param {string} [shape]
 * @param {number|null} [height] cylinder height in tiles (number of vertical layers)
 * @param {{ side?:number, length?:number, width?:number, from?:{c:number,r:number,z:number}|null }} [opts]
 */
export function aoeCells(c, r, z, radius, shape = 'sphere', height = null, opts = {}) {
  const sh = String(shape || 'sphere').toLowerCase();
  const side = opts.side != null ? Math.max(1, Math.round(Number(opts.side))) : null;
  const length = opts.length != null ? Math.max(0, Number(opts.length)) : null;
  const width = opts.width != null ? Math.max(1, Number(opts.width)) : 1;
  const from = opts.from || null;

  if (sh === 'square' || sh === 'cube') {
    // True PHB cube/square side length in tiles (20-ft → 4). Centered on (c,r,z).
    const s = side != null ? side : Math.max(1, Math.round((Number(radius) || 1) * 2));
    const lo = -Math.floor((s - 1) / 2);
    const hi = Math.ceil((s - 1) / 2);
    const cells = [];
    for (let dc = lo; dc <= hi; dc++) {
      for (let dr = lo; dr <= hi; dr++) {
        if (sh === 'square') {
          cells.push([c + dc, r + dr, z]);
        } else {
          for (let dz = lo; dz <= hi; dz++) {
            cells.push([c + dc, r + dr, z + dz]);
          }
        }
      }
    }
    return cells;
  }

  if (sh === 'cylinder') {
    // PHB cylinder: horizontal radius + height in tiles upward from cast elevation.
    const rad = Math.max(0, Number(radius) || 0);
    const rCeil = Math.ceil(rad);
    const hTiles = height != null ? Math.max(1, Math.round(Number(height))) : Math.max(1, rCeil);
    const cells = [];
    for (let dc = -rCeil; dc <= rCeil; dc++) {
      for (let dr = -rCeil; dr <= rCeil; dr++) {
        if (Math.hypot(dc, dr) > rad + 1e-9) continue;
        for (let dz = 0; dz < hTiles; dz++) {
          cells.push([c + dc, r + dr, z + dz]);
        }
      }
    }
    return cells;
  }

  if (sh === 'line') {
    // PHB line: length L, width W, from caster through aim point (extends full length).
    const len = length != null ? length : Math.max(1, Number(radius) || 1);
    const origin = from || { c, r, z };
    return lineCells(origin, { c, r, z }, len, width);
  }

  if (sh === 'cone') {
    // PHB cone: length L; width at distance d equals d (half-angle atan(0.5)).
    const len = length != null ? length : Math.max(1, Number(radius) || 1);
    const origin = from || { c, r, z };
    return coneCells(origin, { c, r, z }, len);
  }

  // sphere (default) — PHB "R-ft-radius sphere" → Euclidean radius R/5 tiles
  const rad = Math.max(0, Number(radius) || 0);
  const rCeil = Math.ceil(rad);
  const cells = [];
  for (let dc = -rCeil; dc <= rCeil; dc++) {
    for (let dr = -rCeil; dr <= rCeil; dr++) {
      for (let dz = -rCeil; dz <= rCeil; dz++) {
        if (Math.hypot(dc, dr, dz) > rad + 1e-9) continue;
        cells.push([c + dc, r + dr, z + dz]);
      }
    }
  }
  return cells;
}

/** Resolve AOE from a full spell entry + optional cast origin (for line/cone). */
export function resolveSpellAoe(spell, c, r, z, castOpts = {}) {
  return aoeCells(c, r, z, spell.radius, spell.shape || 'sphere', spell.height, {
    side: spell.side,
    length: spell.length,
    width: spell.width,
    from: castOpts.from || null,
  });
}

/**
 * place_gas AOE — tighter than combat blasts. Volumetric fog filling a 20–40 ft sphere of
 * empty air looks like the whole map drowned in green smoke, so we:
 *   - clamp radius ≤ 3 tiles (15 ft) and cube/square side ≤ 3 (15 ft)
 *   - clamp cylinder height ≤ 2 tiles (10 ft cloud bank)
 *   - turn 'sphere' into a short cylinder (low cloud, not a solid fog ball)
 *   - turn 'cube' into a ground square (webs/vines/grease sit on the floor)
 * Spells may set `volume: 'full'` to skip the sphere→cylinder / cube→square remap (still clamped).
 */
export function resolvePlaceGasAoe(spell, c, r, z, castOpts = {}) {
  const MAX_R = 3;
  const MAX_SIDE = 3;
  const MAX_H = 2;
  let shape = String(spell.shape || 'sphere').toLowerCase();
  let radius = Math.min(MAX_R, Math.max(0, Number(spell.radius) || 1));
  let height = spell.height != null ? Math.min(MAX_H, Math.max(1, Math.round(Number(spell.height)))) : MAX_H;
  let side = spell.side != null ? Math.min(MAX_SIDE, Math.max(1, Math.round(Number(spell.side)))) : null;
  const full = spell.volume === 'full';

  if (!full) {
    if (shape === 'sphere') {
      // Low fog bank instead of a solid Euclidean ball of gas cells.
      shape = 'cylinder';
      height = Math.min(height, 2);
    } else if (shape === 'cube') {
      // Floor carpet (Web etc.) — a 20-ft cube of fog cells is absurd in this engine.
      shape = 'square';
      if (side == null) side = Math.min(MAX_SIDE, Math.max(1, Math.round((Number(spell.radius) || 1) * 2)));
    }
  }
  if (shape === 'cylinder' && spell.height == null) height = 2;
  if ((shape === 'square' || shape === 'cube') && side == null) {
    side = Math.min(MAX_SIDE, Math.max(1, Math.round((Number(spell.radius) || 1) * 2)));
  }

  return aoeCells(c, r, z, radius, shape, height, {
    side,
    length: spell.length != null ? Math.min(12, Number(spell.length)) : null,
    width: spell.width != null ? Math.min(2, Number(spell.width)) : null,
    from: castOpts.from || null,
  });
}

/** PHB line: steps along the 3D direction from origin (caster) to aim (target) for `length`
 * tiles, `width` tiles across. Elevation follows the aim point — a caster on a ledge aiming
 * down at a target on lower ground angles the line down to meet it, rather than firing a
 * flat line at the caster's own height regardless of where they clicked (a real bug: the old
 * z was locked to `Math.round(origin.z)` with aim.z never even read, so e.g. Gust of Wind
 * aimed at anything above/below the caster's own elevation cleared nothing — see
 * GATE_TESTBED.md bug #1). */
function lineCells(origin, aim, length, width) {
  let dc = aim.c - origin.c;
  let dr = aim.r - origin.r;
  let dz = aim.z - origin.z;
  let dist = Math.hypot(dc, dr, dz);
  if (dist < 1e-6) {
    dc = 1;
    dr = 0;
    dz = 0;
    dist = 1;
  }
  const ux = dc / dist;
  const ur = dr / dist;
  const uz = dz / dist;
  // Perpendicular unit (horizontal — width fans out sideways, not vertically)
  const px = -ur;
  const pr = ux;
  // Center width offsets so width=1 → [0], width=2 → [-0.5, 0.5]
  const wOffsets = [];
  if (width <= 1) wOffsets.push(0);
  else {
    for (let i = 0; i < width; i++) wOffsets.push(i - (width - 1) / 2);
  }
  const cells = [];
  const seen = new Set();
  const len = Math.max(0, Math.round(length));
  for (let i = 0; i <= len; i++) {
    const bc = origin.c + ux * i;
    const br = origin.r + ur * i;
    const bz = origin.z + uz * i;
    const z0 = Math.round(bz);
    for (const wo of wOffsets) {
      const cc = Math.round(bc + px * wo);
      const cr = Math.round(br + pr * wo);
      // Lines are typically 5–10 ft high — cover this step's elev ±0 for 5-ft, one extra for fat lines
      const zHi = width >= 2 ? 1 : 0;
      for (let dzOff = 0; dzOff <= zHi; dzOff++) {
        const key = `${cc},${cr},${z0 + dzOff}`;
        if (seen.has(key)) continue;
        seen.add(key);
        cells.push([cc, cr, z0 + dzOff]);
      }
    }
  }
  return cells;
}

/** PHB cone from origin toward aim; length in tiles; width at dist d equals d. Elevation at
 * each cell interpolates from origin.z toward aim.z by how far along the cone that cell is
 * (0 at the caster, aim.z at the cone's far edge) — same aim-elevation fix as lineCells above;
 * the old fixed `z0 = Math.round(origin.z)` meant Burning Hands/Cone of Cold could never angle
 * up or down to actually reach a target at a different elevation. */
function coneCells(origin, aim, length) {
  let dc = aim.c - origin.c;
  let dr = aim.r - origin.r;
  let dist = Math.hypot(dc, dr);
  if (dist < 1e-6) {
    dc = 1;
    dr = 0;
    dist = 1;
  }
  const ux = dc / dist;
  const ur = dr / dist;
  const dz = aim.z - origin.z;
  const len = Math.max(0, Number(length) || 0);
  const rCeil = Math.ceil(len);
  const cells = [];
  const seen = new Set();
  const z0origin = Math.round(origin.z);
  // Slight vertical thickness so cones catch props/blocks near ground
  for (let oc = -rCeil; oc <= rCeil; oc++) {
    for (let or_ = -rCeil; or_ <= rCeil; or_++) {
      const along = oc * ux + or_ * ur;
      if (along < -0.01 || along > len + 0.01) continue;
      const perp = Math.hypot(oc - along * ux, or_ - along * ur);
      // width(d)=d ⇒ half-width = d/2; +0.5 tile fudge for discrete grid
      if (perp > along * 0.5 + 0.5) continue;
      const frac = len > 0 ? Math.max(0, Math.min(1, along / len)) : 0;
      const z0 = Math.round(origin.z + dz * frac);
      for (let dzOff = 0; dzOff <= 1; dzOff++) {
        const key = `${origin.c + oc},${origin.r + or_},${z0 + dzOff}`;
        if (seen.has(key)) continue;
        seen.add(key);
        cells.push([origin.c + oc, origin.r + or_, z0 + dzOff]);
      }
    }
  }
  // Always include origin
  if (!cells.some(([cc, cr, cz]) => cc === origin.c && cr === origin.r && cz === z0origin)) {
    cells.push([origin.c, origin.r, z0origin]);
  }
  return cells;
}

/** Parse a "NdM" dice-notation string (the exact format Grimoire's own SPELL_DESC uses, e.g.
 * "8d6" for Fireball) into { count, sides }. Throws on anything else — no flat "+N" modifiers
 * supported (none of this engine's current presets need one; a future spell that does can
 * still be entered as an extra damage component instead, see the `damage` array shape). */
export function parseDice(notation) {
  const m = /^(\d+)d(\d+)$/i.exec(String(notation).trim());
  if (!m) throw new Error(`bad dice notation: "${notation}" (expected e.g. "8d6")`);
  return { count: Number(m[1]), sides: Number(m[2]) };
}

/** Roll one "NdM" string, real randomization (Math.random) each call — "actually roll it," not
 * a fixed average. Exported for tests to seed/verify range, not meant to be swapped for a fixed
 * RNG at runtime (this engine has no seeded-random convention anywhere else either). */
export function rollDice(notation) {
  const { count, sides } = parseDice(notation);
  let total = 0;
  for (let i = 0; i < count; i++) total += 1 + Math.floor(Math.random() * sides);
  return total;
}

/** Roll every component of a spell's `damage` array ONCE per cast (matches 5e's own "one
 * damage roll applies to everything in the blast" convention — resistance/vulnerability is
 * applied PER TARGET afterward, not per roll) — returns [{ type, amount }], amount already
 * rolled and fixed for this whole cast. */
function rollDamage(damage) {
  return damage.map(({ dice, type }) => ({ type, amount: rollDice(dice) }));
}

/**
 * Max HP for a block type if it's destructible, else null.
 * Convention (customMaterials / customObjects):
 *   - `hp` number → destructible
 *   - absent / null → indestructible (stone, bedrock, cliff, dungeon walls)
 * Gas/liquid never take block damage.
 */
export function destructibleMaxHp(type) {
  const def = BLOCKS[type];
  if (!def || def.gas || def.liquid) return null;
  if (def.hp == null) return null;
  return Number(def.hp) || 0;
}

/** Apply one rolled damage component to a block def, honoring immune / vulnerable / resistant. */
export function applyDamageComponent(def, amount, type) {
  if (!def || amount <= 0) return 0;
  const t = String(type || '').toLowerCase();
  const immune = (def.immune || []).map((x) => String(x).toLowerCase());
  const vuln = (def.vulnerable || []).map((x) => String(x).toLowerCase());
  const resist = (def.resistant || []).map((x) => String(x).toLowerCase());
  if (immune.includes(t)) return 0;
  if (vuln.includes(t)) return amount * 2;
  if (resist.includes(t)) return Math.floor(amount / 2);
  return amount;
}

/** True if this block string/type can currently take spell damage. */
export function isDestructibleBlock(typeOrBlock) {
  const type = String(typeOrBlock || '').split(':')[0].split('#')[0];
  return destructibleMaxHp(type) != null;
}

/**
 * Effect TYPE registry — each entry's `apply(spell, ctx, c, r, z)` is the actual engine action;
 * `ctx` bundles whatever simulation state that effect needs (see castSpell's own doc comment).
 * `needsMaterial`/`materialFilter` and `needsDamage` drive the Spell Maker UI's extra fields
 * (material dropdown / damage dice+type inputs — only shown for effects that need them).
 */
export const SPELL_EFFECTS = {
  clear_gas: {
    label: 'Clear gas (Gust of Wind)',
    needsMaterial: false,
    needsDamage: false,
    apply(spell, ctx, c, r, z, castOpts = {}) {
      // Clear only cells in the spell's PHB-shaped AOE (line for Gust, not a free cube).
      let cleared = 0;
      for (const [cc, cr, cz] of resolveSpellAoe(spell, c, r, z, castOpts)) {
        const block = ctx.store.get(cc, cr, cz);
        if (!block || !isGasType(parseBlock(block).type)) continue;
        ctx.store.remove(cc, cr, cz);
        if (ctx.gasLifeMap) ctx.gasLifeMap.delete(keyFor(cc, cr, cz));
        if (ctx.gasGustCooldown) ctx.gasGustCooldown.set(keyFor(cc, cr, cz), GUST_COOLDOWN_TICKS);
        markSpreadDirty(ctx.gasDirty, cc, cr, cz);
        cleared++;
      }
      return { cleared };
    },
  },
  place_gas: {
    label: 'Place gas cloud',
    needsMaterial: true,
    needsDamage: false,
    materialFilter: (type) => !!(BLOCKS[type] && BLOCKS[type].gas),
    apply(spell, ctx, c, r, z, castOpts = {}) {
      // Fill AOE once, hops=0 (no post-cast flood). Volumetric fog is expensive/ugly when
      // every "condition" spell dumps a giant 3D cloud — clamp geometry here so authoring a
      // r=8 sphere of gas can't blank the map even if a preset is wrong.
      let placed = 0;
      for (const [cc, cr, cz] of resolvePlaceGasAoe(spell, c, r, z, castOpts)) {
        if (ctx.store.has(cc, cr, cz)) continue;
        ctx.store.set(cc, cr, cz, spell.material);
        markSpreadDirty(ctx.gasDirty, cc, cr, cz);
        if (ctx.gasLifeMap) {
          // hops 0: spell volume is the volume — stepGas must not grow it further.
          ctx.gasLifeMap.set(keyFor(cc, cr, cz), { life: GAS_MAX_LIFE, hops: 0 });
        }
        placed++;
      }
      return { placed };
    },
  },
  remove_blocks: {
    label: 'Remove blocks (instant clear, ignores HP)',
    needsMaterial: false,
    needsDamage: false,
    apply(spell, ctx, c, r, z, castOpts = {}) {
      let removed = 0;
      for (const [cc, cr, cz] of resolveSpellAoe(spell, c, r, z, castOpts)) {
        if (!ctx.store.has(cc, cr, cz)) continue;
        ctx.store.remove(cc, cr, cz);
        removed++;
      }
      return { removed };
    },
  },
  damage_blocks: {
    label: 'Deal damage (rolls dice, respects block HP/resistances)',
    needsMaterial: false,
    needsDamage: true,
    apply(spell, ctx, c, r, z, castOpts = {}) {
      if (!Array.isArray(spell.damage) || spell.damage.length === 0) {
        return { rolled: [], hit: 0, destroyed: 0, totalDamage: 0, skipped: 'no_damage' };
      }
      if (!ctx.blockHpMap) {
        // Caller forgot the HP map — still damage using a throwaway map so casts aren't no-ops.
        ctx.blockHpMap = new Map();
      }
      const rolled = rollDamage(spell.damage);
      let hit = 0;
      let destroyed = 0;
      let totalDamage = 0;
      let immune = 0;
      const destroyedCells = [];
      const damagedCells = [];

      for (const [cc, cr, cz] of resolveSpellAoe(spell, c, r, z, castOpts)) {
        const block = ctx.store.get(cc, cr, cz);
        if (!block) continue;
        const type = block.split(':')[0].split('#')[0];
        const def = BLOCKS[type];
        if (!def || def.gas || def.liquid) continue;
        const maxHp = destructibleMaxHp(type);
        if (maxHp == null) {
          immune++;
          continue; // hard terrain (stone/bedrock/cliff/walls)
        }
        const key = keyFor(cc, cr, cz);
        const currentHp = ctx.blockHpMap.has(key) ? ctx.blockHpMap.get(key) : maxHp;
        const damage = rolled.reduce(
          (sum, comp) => sum + applyDamageComponent(def, comp.amount, comp.type),
          0,
        );
        // DMG "damage threshold" object rule: a single cast's total damage below the
        // threshold does NOTHING (not partial/chip damage) — at or above it, the full
        // amount applies. Absent/0 threshold (every structure — wood/planks/glass/shelf)
        // is a true no-op, unchanged from before this existed.
        if (damage <= 0 || damage < (def.threshold || 0)) {
          immune++;
          continue;
        }
        hit++;
        totalDamage += damage;
        const newHp = currentHp - damage;
        if (newHp <= 0) {
          ctx.blockHpMap.delete(key);
          if (def.destroyedType && def.destroyedType !== 'none' && def.destroyedType !== type) {
            ctx.store.set(cc, cr, cz, def.destroyedType);
          } else {
            ctx.store.remove(cc, cr, cz);
          }
          // Neighbors may need gas/liquid re-eval if we opened a pocket
          if (ctx.gasDirty) markSpreadDirty(ctx.gasDirty, cc, cr, cz);
          destroyed++;
          destroyedCells.push({ c: cc, r: cr, z: cz, type });
        } else {
          ctx.blockHpMap.set(key, newHp);
          damagedCells.push({ c: cc, r: cr, z: cz, type, hp: newHp, maxHp, damage });
        }
      }
      return {
        rolled, hit, destroyed, totalDamage, immune,
        destroyedCells, damagedCells,
      };
    },
  },
};

/** "Gust of Wind" -> "gust_of_wind". Same slugify convention every content type here uses.
 * `damage`: only meaningful for effects with needsDamage (currently just damage_blocks) — an
 * array of `{ dice: "8d6", type: "fire" }` components (see rollDamage; most spells are a single
 * component, a few PHB spells like Flame Strike/Ice Storm/Meteor Swarm are genuinely two). */
/**
 * @param {object} opts
 * @param {string} opts.name
 * @param {string} opts.effect
 * @param {number} [opts.radius] sphere/cylinder radius in tiles (R_ft/5)
 * @param {string|null} [opts.material]
 * @param {Array|{dice:string,type:string}|null} [opts.damage]
 * @param {'sphere'|'cube'|'square'|'cylinder'|'line'|'cone'} [opts.shape]
 * @param {number|null} [opts.height] cylinder height in tiles (H_ft/5)
 * @param {number|null} [opts.side] cube/square side in tiles (S_ft/5)
 * @param {number|null} [opts.length] line/cone length in tiles (L_ft/5)
 * @param {number|null} [opts.width] line width in tiles (W_ft/5)
 * @param {object|null} [opts.fx] optional presentation recipe for spellFx.js
 */
export function createSpell({
  name, effect, radius = 3, material = null, damage = null,
  shape = null, height = null, side = null, length = null, width = null, fx = null,
}) {
  if (!SPELL_EFFECTS[effect]) throw new Error(`unknown spell effect: ${effect}`);
  if (SPELL_EFFECTS[effect].needsMaterial && !material) {
    throw new Error(`spell effect "${effect}" needs a material`);
  }
  if (SPELL_EFFECTS[effect].needsDamage && (!Array.isArray(damage) || damage.length === 0)) {
    throw new Error(`spell effect "${effect}" needs at least one damage component`);
  }
  const id = slugify(name);
  const entry = { id, name, effect, radius, material, damage, createdAt: Date.now() };
  if (shape) entry.shape = shape;
  if (height != null) entry.height = height;
  if (side != null) entry.side = side;
  if (length != null) entry.length = length;
  if (width != null) entry.width = width;
  if (fx && typeof fx === 'object') entry.fx = fx;
  return entry;
}

/** Cast a spell at aim point (c,r,z). Optional castOpts.from = caster grid pos for line/cone.
 * `ctx`: store; gasLifeMap/gasDirty/gasGustCooldown (gas effects); blockHpMap (damage_blocks). */
export function castSpell(spell, ctx, c, r, z, castOpts = {}) {
  const def = SPELL_EFFECTS[spell.effect];
  if (!def) throw new Error(`unknown spell effect: ${spell.effect}`);
  return def.apply(spell, ctx, c, r, z, castOpts);
}

// --- localStorage library (thin wrappers over the shared helper — see contentLibrary.js) ---

const library = makeLibrary('iso3d.spells');
export const loadSpellLibrary = library.load;
export const saveSpellLibrary = library.save;
export const addSpellToLibrary = library.add;
export const removeSpellFromLibrary = library.remove;
