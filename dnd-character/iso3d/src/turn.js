/**
 * Initiative-based turn order (d20 + DEX mod, 5e style).
 */

import { d20 } from './math.js';
import { initiativeMod, living, resetTurnFlags } from './units.js';

/**
 * @returns {{ unit: object, initiative: number }[]}
 */
export function rollInitiative(units, rng = Math.random) {
  const entries = living(units).map((unit) => {
    const roll = d20(rng);
    const mod = initiativeMod(unit);
    return {
      unit,
      roll,
      mod,
      initiative: roll + mod,
    };
  });

  // Higher initiative first; tie-break higher DEX, then id
  entries.sort((a, b) => {
    if (b.initiative !== a.initiative) return b.initiative - a.initiative;
    if (b.unit.dex !== a.unit.dex) return b.unit.dex - a.unit.dex;
    return a.unit.id - b.unit.id;
  });

  return entries;
}

export class TurnManager {
  constructor(units, rng = Math.random) {
    this.units = units;
    this.rng = rng;
    this.order = [];
    this.index = 0;
    this.round = 0;
    this.rebuild();
  }

  rebuild() {
    this.order = rollInitiative(this.units, this.rng);
    this.index = 0;
    this.round = 1;
    for (const u of this.units) resetTurnFlags(u);
    if (this.current()) resetTurnFlags(this.current());
  }

  current() {
    this.pruneDead();
    if (!this.order.length) return null;
    return this.order[this.index]?.unit ?? null;
  }

  pruneDead() {
    this.order = this.order.filter((e) => e.unit.alive);
    if (this.index >= this.order.length) this.index = 0;
  }

  /** Advance to next living unit; starts a new round when wrapping. */
  next() {
    this.pruneDead();
    if (!this.order.length) return null;

    this.index += 1;
    if (this.index >= this.order.length) {
      this.round += 1;
      this.index = 0;
      // Re-roll initiative each round (optional 5e house; clearer for demo)
      this.order = rollInitiative(this.units, this.rng);
      this.index = 0;
    }

    for (const u of this.units) {
      if (u === this.current()) resetTurnFlags(u);
    }
    return this.current();
  }

  initiativeLog() {
    return this.order
      .map((e) => `${e.unit.label} (${e.initiative})`)
      .join(' → ');
  }
}
