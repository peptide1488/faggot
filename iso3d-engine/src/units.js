/**
 * Units with simplified D&D 5E stats, weapons, and a few spells.
 */

import { abilityMod } from './math.js';

let nextId = 1;

/**
 * Archetype presets.
 * rangedRange: squares (Chebyshev). 0 = no ranged weapon.
 * spells: optional limited-use abilities.
 */
export const ARCHETYPES = {
  fighter: {
    name: 'Fighter',
    str: 16, dex: 12, con: 14, int: 10, wis: 10, cha: 10,
    proficiency: 2,
    armorBonus: 4,
    hp: 14,
    speedSquares: 6,
    attackAbility: 'str',
    weaponDie: 8,
    weaponName: 'longsword',
    rangedRange: 0,
    rangedDie: 0,
    rangedAbility: 'dex',
    rangedName: null,
    spells: [],
    color: [0.25, 0.55, 0.95],
  },
  rogue: {
    name: 'Rogue',
    str: 10, dex: 16, con: 12, int: 12, wis: 12, cha: 12,
    proficiency: 2,
    armorBonus: 2,
    hp: 10,
    speedSquares: 6,
    attackAbility: 'dex',
    weaponDie: 6,
    weaponName: 'shortsword',
    rangedRange: 8,
    rangedDie: 6,
    rangedAbility: 'dex',
    rangedName: 'shortbow',
    spells: [],
    color: [0.30, 0.80, 0.40],
  },
  cleric: {
    name: 'Cleric',
    str: 12, dex: 10, con: 14, int: 10, wis: 16, cha: 12,
    proficiency: 2,
    armorBonus: 4,
    hp: 11,
    speedSquares: 5,
    attackAbility: 'str',
    weaponDie: 6,
    weaponName: 'mace',
    rangedRange: 0,
    rangedDie: 0,
    rangedAbility: 'wis',
    rangedName: null,
    spells: [
      {
        id: 'cure_wounds',
        name: 'Cure Wounds',
        kind: 'heal',
        ability: 'wis',
        die: 8,
        range: 1,
        uses: 2,
      },
    ],
    color: [0.95, 0.85, 0.35],
  },
  wizard: {
    name: 'Wizard',
    str: 8, dex: 14, con: 12, int: 16, wis: 12, cha: 10,
    proficiency: 2,
    armorBonus: 0,
    hp: 8,
    speedSquares: 6,
    attackAbility: 'dex',
    weaponDie: 4,
    weaponName: 'dagger',
    rangedRange: 0,
    rangedDie: 0,
    rangedAbility: 'int',
    rangedName: null,
    spells: [
      {
        id: 'fire_bolt',
        name: 'Fire Bolt',
        kind: 'ranged_spell',
        ability: 'int',
        die: 10,
        range: 10,
        uses: Infinity, // cantrip
      },
    ],
    color: [0.55, 0.40, 0.95],
  },
  goblin: {
    name: 'Goblin',
    str: 8, dex: 14, con: 10, int: 10, wis: 8, cha: 8,
    proficiency: 2,
    armorBonus: 3,
    hp: 7,
    speedSquares: 6,
    attackAbility: 'dex',
    weaponDie: 6,
    weaponName: 'scimitar',
    rangedRange: 6,
    rangedDie: 6,
    rangedAbility: 'dex',
    rangedName: 'shortbow',
    spells: [],
    color: [0.85, 0.30, 0.25],
  },
  orc: {
    name: 'Orc',
    str: 16, dex: 12, con: 16, int: 7, wis: 11, cha: 10,
    proficiency: 2,
    armorBonus: 3,
    hp: 15,
    speedSquares: 6,
    attackAbility: 'str',
    weaponDie: 12,
    weaponName: 'greataxe',
    rangedRange: 0,
    rangedDie: 0,
    rangedAbility: 'dex',
    rangedName: null,
    spells: [],
    color: [0.55, 0.20, 0.55],
  },
};

export function createUnit(archetypeKey, team, col, row, label) {
  const a = ARCHETYPES[archetypeKey];
  if (!a) throw new Error(`Unknown archetype: ${archetypeKey}`);

  const dexMod = abilityMod(a.dex);
  const ac = 10 + dexMod + a.armorBonus;

  return {
    id: nextId++,
    archetype: archetypeKey,
    label: label || a.name,
    team,
    col,
    row,
    str: a.str,
    dex: a.dex,
    con: a.con,
    int: a.int,
    wis: a.wis,
    cha: a.cha,
    proficiency: a.proficiency,
    ac,
    hp: a.hp,
    maxHp: a.hp,
    speedSquares: a.speedSquares,
    attackAbility: a.attackAbility,
    weaponDie: a.weaponDie,
    weaponName: a.weaponName,
    rangedRange: a.rangedRange,
    rangedDie: a.rangedDie,
    rangedAbility: a.rangedAbility,
    rangedName: a.rangedName,
    spells: a.spells.map((s) => ({
      ...s,
      remaining: s.uses === Infinity ? Infinity : s.uses,
    })),
    color: a.color.slice(),
    alive: true,
    hasMoved: false,
    hasActed: false,
  };
}

export function resetTurnFlags(unit) {
  unit.hasMoved = false;
  unit.hasActed = false;
}

export function abilityOf(unit, key) {
  return unit[key];
}

export function attackMod(unit, abilityKey = unit.attackAbility) {
  return abilityMod(abilityOf(unit, abilityKey)) + unit.proficiency;
}

export function damageMod(unit, abilityKey = unit.attackAbility) {
  return abilityMod(abilityOf(unit, abilityKey));
}

export function initiativeMod(unit) {
  return abilityMod(unit.dex);
}

export function unitAt(units, col, row) {
  return units.find((u) => u.alive && u.col === col && u.row === row) || null;
}

export function living(units, team) {
  return units.filter((u) => u.alive && (!team || u.team === team));
}

export function getSpell(unit, spellId) {
  return unit.spells.find((s) => s.id === spellId) || null;
}

export function hasRangedWeapon(unit) {
  return unit.rangedRange > 0 && unit.rangedDie > 0;
}

export function canUseSpell(unit, spellId) {
  const sp = getSpell(unit, spellId);
  if (!sp || unit.hasActed) return false;
  return sp.remaining > 0;
}
