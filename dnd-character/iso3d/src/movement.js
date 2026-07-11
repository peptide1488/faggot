/**
 * Turn-based movement + attack range helpers (Chebyshev grid).
 */

import { heightAt, isWalkable, moveCost, hasLineOfSight, maxClimb } from './map.js';
import { unitAt, hasRangedWeapon, getSpell } from './units.js';

export function chebyshev(a, b) {
  return Math.max(Math.abs(a.col - b.col), Math.abs(a.row - b.row));
}

/**
 * @returns {Set<string>} keys "col,row" reachable this turn
 */
export function computeMoveRange(unit, map, units, climb = maxClimb()) {
  const reachable = new Set();
  if (!unit.alive || unit.hasMoved) return reachable;

  const startKey = `${unit.col},${unit.row}`;
  const best = new Map([[startKey, 0]]);
  const queue = [{ col: unit.col, row: unit.row, dist: 0 }];
  reachable.add(startKey);

  while (queue.length) {
    const cur = queue.shift();
    for (let dc = -1; dc <= 1; dc++) {
      for (let dr = -1; dr <= 1; dr++) {
        if (dc === 0 && dr === 0) continue;
        const nc = cur.col + dc;
        const nr = cur.row + dr;
        if (!isWalkable(map, nc, nr)) continue;

        const cost = moveCost(map, nc, nr);
        const nextDist = cur.dist + cost;
        if (nextDist > unit.speedSquares) continue;

        const key = `${nc},${nr}`;
        if (best.has(key) && best.get(key) <= nextDist) continue;

        const occ = unitAt(units, nc, nr);
        if (occ && occ.id !== unit.id) continue;

        const h0 = heightAt(map, cur.col, cur.row);
        const h1 = heightAt(map, nc, nr);
        if (Math.abs(h1 - h0) > climb) continue;

        best.set(key, nextDist);
        reachable.add(key);
        queue.push({ col: nc, row: nr, dist: nextDist });
      }
    }
  }

  return reachable;
}

export function parseKey(key) {
  const [c, r] = key.split(',').map(Number);
  return { col: c, row: r };
}

export function inRange(rangeSet, col, row) {
  return rangeSet.has(`${col},${row}`);
}

/** Melee reach: Chebyshev distance 1. */
export function isAdjacent(a, b) {
  return chebyshev(a, b) === 1;
}

export function enemiesInMelee(unit, units) {
  return units.filter(
    (u) => u.alive && u.team !== unit.team && isAdjacent(unit, u),
  );
}

/**
 * Collect enemy tiles attackable by melee, ranged weapon, or active spell mode.
 * @param {'melee'|'ranged'|'fire_bolt'} mode
 * @returns {{ targets: object[], tiles: Set<string> }}
 */
export function computeAttackOptions(unit, units, map, mode = 'auto') {
  const tiles = new Set();
  const targets = [];

  if (!unit.alive) return { targets, tiles };

  for (const foe of units) {
    if (!foe.alive || foe.team === unit.team) continue;
    const dist = chebyshev(unit, foe);

    let ok = false;
    if (mode === 'melee' || mode === 'auto') {
      if (dist === 1) ok = true;
    }
    if (!ok && (mode === 'ranged' || mode === 'auto') && hasRangedWeapon(unit)) {
      if (dist >= 2 && dist <= unit.rangedRange) {
        ok = hasLineOfSight(map, unit.col, unit.row, foe.col, foe.row);
      }
    }
    if (!ok && mode === 'fire_bolt') {
      const sp = getSpell(unit, 'fire_bolt');
      if (sp && sp.remaining > 0 && dist >= 1 && dist <= sp.range) {
        ok = hasLineOfSight(map, unit.col, unit.row, foe.col, foe.row);
      }
    }

    if (ok) {
      targets.push(foe);
      tiles.add(`${foe.col},${foe.row}`);
    }
  }

  return { targets, tiles };
}

/** Allies within heal range (for Cure Wounds). */
export function computeHealOptions(unit, units) {
  const tiles = new Set();
  const targets = [];
  const sp = getSpell(unit, 'cure_wounds');
  if (!sp || sp.remaining <= 0) return { targets, tiles };

  for (const ally of units) {
    if (!ally.alive || ally.team !== unit.team) continue;
    if (ally.hp >= ally.maxHp) continue;
    const dist = chebyshev(unit, ally);
    // touch range includes self
    if (dist <= sp.range) {
      targets.push(ally);
      tiles.add(`${ally.col},${ally.row}`);
    }
  }
  return { targets, tiles };
}

export function bestWeaponMode(attacker, defender, map) {
  const dist = chebyshev(attacker, defender);
  if (dist === 1) return 'melee';
  if (
    hasRangedWeapon(attacker) &&
    dist >= 2 &&
    dist <= attacker.rangedRange &&
    hasLineOfSight(map, attacker.col, attacker.row, defender.col, defender.row)
  ) {
    return 'ranged';
  }
  return null;
}
