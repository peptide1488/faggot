/**
 * Simplified D&D 5E attack / spell resolution.
 */

import { d20, rollDie, abilityMod } from './math.js';
import { attackMod, damageMod, abilityOf, getSpell } from './units.js';
import { chebyshev, isAdjacent, bestWeaponMode } from './movement.js';
import { hasLineOfSight } from './map.js';

/**
 * @param {object} attacker
 * @param {object} defender
 * @param {object} map
 * @param {{ mode?: 'melee'|'ranged'|'fire_bolt', rng?: () => number }} [opts]
 */
export function resolveAttack(attacker, defender, map, opts = {}) {
  const rng = opts.rng || Math.random;
  let mode = opts.mode;

  if (!attacker.alive || !defender.alive) {
    return fail(defender, 'Invalid attack (dead unit).');
  }

  if (!mode || mode === 'auto') {
    mode = bestWeaponMode(attacker, defender, map);
    if (!mode) {
      // Try fire bolt if available
      const sp = getSpell(attacker, 'fire_bolt');
      if (sp && sp.remaining > 0) {
        const dist = chebyshev(attacker, defender);
        if (
          dist >= 1 &&
          dist <= sp.range &&
          hasLineOfSight(map, attacker.col, attacker.row, defender.col, defender.row)
        ) {
          mode = 'fire_bolt';
        }
      }
    }
  }

  if (!mode) {
    return fail(
      defender,
      `${attacker.label} cannot reach ${defender.label} (range/LOS).`,
    );
  }

  if (mode === 'melee') {
    if (!isAdjacent(attacker, defender)) {
      return fail(defender, `${attacker.label} is not adjacent to ${defender.label}.`);
    }
    return resolveWeaponAttack(attacker, defender, {
      ability: attacker.attackAbility,
      die: attacker.weaponDie,
      name: attacker.weaponName,
      rng,
    });
  }

  if (mode === 'ranged') {
    const dist = chebyshev(attacker, defender);
    if (dist < 2 || dist > attacker.rangedRange) {
      return fail(defender, `${attacker.label}'s ${attacker.rangedName} cannot reach.`);
    }
    if (!hasLineOfSight(map, attacker.col, attacker.row, defender.col, defender.row)) {
      return fail(defender, `No line of sight to ${defender.label}.`);
    }
    // 5e: disadvantage in melee — simplified: -2 if adjacent enemy exists
    // Keep simple: normal attack
    return resolveWeaponAttack(attacker, defender, {
      ability: attacker.rangedAbility,
      die: attacker.rangedDie,
      name: attacker.rangedName,
      rng,
    });
  }

  if (mode === 'fire_bolt') {
    const sp = getSpell(attacker, 'fire_bolt');
    if (!sp || sp.remaining <= 0) {
      return fail(defender, 'Fire Bolt not available.');
    }
    const dist = chebyshev(attacker, defender);
    if (dist < 1 || dist > sp.range) {
      return fail(defender, 'Target out of Fire Bolt range.');
    }
    if (!hasLineOfSight(map, attacker.col, attacker.row, defender.col, defender.row)) {
      return fail(defender, `No line of sight to ${defender.label}.`);
    }
    const result = resolveWeaponAttack(attacker, defender, {
      ability: sp.ability,
      die: sp.die,
      name: sp.name,
      rng,
      noDamageMod: true, // cantrips don't add ability to damage in 5e (usually)
    });
    // cantrip uses infinite
    return result;
  }

  return fail(defender, 'Unknown attack mode.');
}

function resolveWeaponAttack(attacker, defender, {
  ability,
  die,
  name,
  rng,
  noDamageMod = false,
}) {
  const roll = d20(rng);
  const mod = attackMod(attacker, ability);
  const total = roll + mod;
  const crit = roll === 20;
  const fumble = roll === 1;
  const hit = !fumble && (crit || total >= defender.ac);

  let damage = 0;
  if (hit) {
    const dmgDie = rollDie(die, rng);
    const dmgMod = noDamageMod ? 0 : damageMod(attacker, ability);
    damage = Math.max(1, dmgDie + dmgMod);
    if (crit) damage += rollDie(die, rng);
    applyDamage(defender, damage);
  }

  let log;
  if (fumble) {
    log = `${attacker.label} attacks ${defender.label} with ${name}: natural 1 — miss.`;
  } else if (crit) {
    log = `${attacker.label} CRITS ${defender.label} with ${name} (${roll}+${mod}=${total} vs AC ${defender.ac}) for ${damage} damage${defender.alive ? '' : ' — defeated!'}.`;
  } else if (hit) {
    log = `${attacker.label} hits ${defender.label} with ${name} (${roll}+${mod}=${total} vs AC ${defender.ac}) for ${damage} damage${defender.alive ? ` (${defender.hp}/${defender.maxHp} HP)` : ' — defeated!'}.`;
  } else {
    log = `${attacker.label} misses ${defender.label} with ${name} (${roll}+${mod}=${total} vs AC ${defender.ac}).`;
  }

  return {
    hit,
    crit,
    roll,
    total,
    ac: defender.ac,
    damage,
    mode: name,
    log,
  };
}

/**
 * Cure Wounds: touch heal, 1d8 + WIS mod.
 */
export function resolveHeal(caster, target, rng = Math.random) {
  const sp = getSpell(caster, 'cure_wounds');
  if (!sp || sp.remaining <= 0) {
    return { healed: 0, log: 'Cure Wounds not available.' };
  }
  if (!caster.alive || !target.alive) {
    return { healed: 0, log: 'Invalid heal target.' };
  }
  if (caster.team !== target.team) {
    return { healed: 0, log: 'Can only heal allies.' };
  }
  if (chebyshev(caster, target) > sp.range) {
    return { healed: 0, log: 'Target out of touch range.' };
  }
  if (target.hp >= target.maxHp) {
    return { healed: 0, log: `${target.label} is already at full HP.` };
  }

  const die = rollDie(sp.die, rng);
  const mod = abilityMod(abilityOf(caster, sp.ability));
  const amount = Math.max(1, die + mod);
  const before = target.hp;
  target.hp = Math.min(target.maxHp, target.hp + amount);
  const healed = target.hp - before;

  if (sp.remaining !== Infinity) sp.remaining -= 1;

  return {
    healed,
    log: `${caster.label} casts Cure Wounds on ${target.label}: +${healed} HP (${target.hp}/${target.maxHp}). [${sp.remaining === Infinity ? '∞' : sp.remaining} left]`,
  };
}

function applyDamage(defender, damage) {
  defender.hp -= damage;
  if (defender.hp <= 0) {
    defender.hp = 0;
    defender.alive = false;
  }
}

function fail(defender, log) {
  return {
    hit: false,
    crit: false,
    roll: 0,
    total: 0,
    ac: defender?.ac ?? 0,
    damage: 0,
    log,
  };
}
