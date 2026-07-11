/**
 * Mini-tactics game loop: move → attack/spell/heal → win/lose.
 */

import { buildDemoMap } from './map.js';
import {
  createUnit,
  living,
  unitAt,
  hasRangedWeapon,
  canUseSpell,
  getSpell,
} from './units.js';
import {
  computeMoveRange,
  computeAttackOptions,
  computeHealOptions,
  enemiesInMelee,
  inRange,
  chebyshev,
  bestWeaponMode,
} from './movement.js';
import { resolveAttack, resolveHeal } from './combat.js';
import { TurnManager } from './turn.js';

export const Phase = {
  PLAYING: 'playing',
  WON: 'won',
  LOST: 'lost',
};

function makeRoster() {
  return [
    createUnit('fighter', 'player', 2, 9, 'Aldric'),
    createUnit('rogue', 'player', 3, 10, 'Nyx'),
    createUnit('cleric', 'player', 1, 9, 'Mirabel'),
    createUnit('wizard', 'player', 2, 10, 'Quill'),
    createUnit('goblin', 'enemy', 9, 2, 'Goblin A'),
    createUnit('goblin', 'enemy', 10, 3, 'Goblin B'),
    createUnit('orc', 'enemy', 8, 5, 'Orc'),
  ];
}

export class Game {
  constructor() {
    this.reset();
  }

  reset() {
    this.map = buildDemoMap(12, 12);
    this.units = makeRoster();
    this.turns = new TurnManager(this.units);
    this.phase = Phase.PLAYING;
    this.mode = 'idle'; // idle | move | attack | heal
    this.moveRange = new Set();
    this.attackTiles = new Set();
    this.healTiles = new Set();
    this.log = [];
    this.selected = null;

    this.pushLog(`Initiative: ${this.turns.initiativeLog()}`);
    this.pushLog(`Round ${this.turns.round} — ${this.current()?.label}'s turn.`);
    this._beginTurn();
  }

  pushLog(msg) {
    this.log.push(msg);
    if (this.log.length > 50) this.log.shift();
  }

  current() {
    return this.turns.current();
  }

  isPlayerTurn() {
    const u = this.current();
    return u && u.team === 'player' && this.phase === Phase.PLAYING;
  }

  _clearActionRanges() {
    this.moveRange = new Set();
    this.attackTiles = new Set();
    this.healTiles = new Set();
  }

  _beginTurn() {
    const u = this.current();
    if (!u) return;
    this.mode = 'idle';
    this._clearActionRanges();
    this.selected = { col: u.col, row: u.row };

    if (u.team === 'enemy') {
      this._runEnemyAI(u);
    }
  }

  _nearestEnemy(unit) {
    const foes = living(this.units, unit.team === 'player' ? 'enemy' : 'player');
    let best = null;
    let bestD = Infinity;
    for (const f of foes) {
      const d = chebyshev(unit, f);
      if (d < bestD) {
        bestD = d;
        best = f;
      }
    }
    return best;
  }

  _runEnemyAI(unit) {
    const target = this._nearestEnemy(unit);
    if (!target) {
      unit.hasMoved = true;
      unit.hasActed = true;
      return;
    }

    // Move if we cannot already attack
    let canHit =
      bestWeaponMode(unit, target, this.map) !== null ||
      computeAttackOptions(unit, this.units, this.map, 'auto').targets.some(
        (t) => t.id === target.id,
      );

    if (!canHit && !unit.hasMoved) {
      const range = computeMoveRange(unit, this.map, this.units);
      let bestKey = null;
      let bestScore = Infinity;
      for (const key of range) {
        const [c, r] = key.split(',').map(Number);
        if (unitAt(this.units, c, r) && !(c === unit.col && r === unit.row)) continue;
        // Simulate standing there
        const ghost = { col: c, row: r };
        const dist = chebyshev(ghost, target);
        const los = bestWeaponMode(
          { ...unit, col: c, row: r },
          target,
          this.map,
        );
        // Prefer positions that can attack, then closer
        const score = (los ? 0 : 100) + dist;
        if (score < bestScore) {
          bestScore = score;
          bestKey = key;
        }
      }
      if (bestKey) {
        const [c, r] = bestKey.split(',').map(Number);
        if (c !== unit.col || r !== unit.row) {
          unit.col = c;
          unit.row = r;
          this.pushLog(`${unit.label} moves to (${c}, ${r}).`);
        }
      }
      unit.hasMoved = true;
    } else {
      unit.hasMoved = true;
    }

    // Attack with best available mode
    const opts = computeAttackOptions(unit, this.units, this.map, 'auto');
    if (opts.targets.length && !unit.hasActed) {
      const def =
        opts.targets.find((m) => m.id === target.id) || opts.targets[0];
      const mode = bestWeaponMode(unit, def, this.map) || 'auto';
      const result = resolveAttack(unit, def, this.map, { mode });
      this.pushLog(result.log);
      unit.hasActed = true;
    } else {
      unit.hasActed = true;
      this.pushLog(`${unit.label} waits.`);
    }

    this._checkEnd();
  }

  /** Advance through enemy turns until a player turn or end. */
  flushEnemyTurns() {
    let guard = 30;
    while (
      this.phase === Phase.PLAYING &&
      this.current()?.team === 'enemy' &&
      guard-- > 0
    ) {
      this.turns.next();
      const u = this.current();
      if (!u) break;
      this.pushLog(`Round ${this.turns.round} — ${u.label}'s turn.`);
      this._beginTurn();
      this._checkEnd();
    }
  }

  enterMoveMode() {
    const u = this.current();
    if (!this.isPlayerTurn() || !u || u.hasMoved) return false;
    this.mode = 'move';
    this._clearActionRanges();
    this.moveRange = computeMoveRange(u, this.map, this.units);
    this.pushLog(`${u.label}: select a blue tile to move (mud costs 2).`);
    return true;
  }

  enterAttackMode() {
    const u = this.current();
    if (!this.isPlayerTurn() || !u || u.hasActed) return false;
    const opts = computeAttackOptions(u, this.units, this.map, 'auto');
    if (!opts.targets.length) {
      this.pushLog(
        `${u.label}: no valid targets (melee/ranged+LOS${hasRangedWeapon(u) ? '' : ''}).`,
      );
      return false;
    }
    this.mode = 'attack';
    this._clearActionRanges();
    this.attackTiles = opts.tiles;
    const parts = [];
    if (enemiesInMelee(u, this.units).length) parts.push('melee');
    if (hasRangedWeapon(u)) parts.push(u.rangedName);
    if (canUseSpell(u, 'fire_bolt')) parts.push('Fire Bolt');
    this.pushLog(
      `${u.label}: click a red-highlighted enemy (${parts.join(' / ') || 'attack'}).`,
    );
    return true;
  }

  enterHealMode() {
    const u = this.current();
    if (!this.isPlayerTurn() || !u || u.hasActed) return false;
    if (!canUseSpell(u, 'cure_wounds')) {
      this.pushLog(`${u.label}: no Cure Wounds remaining.`);
      return false;
    }
    const opts = computeHealOptions(u, this.units);
    if (!opts.targets.length) {
      this.pushLog(`${u.label}: no wounded allies in range.`);
      return false;
    }
    this.mode = 'heal';
    this._clearActionRanges();
    this.healTiles = opts.tiles;
    const sp = getSpell(u, 'cure_wounds');
    this.pushLog(
      `${u.label}: click a green ally to heal (${sp.remaining} uses left).`,
    );
    return true;
  }

  wait() {
    const u = this.current();
    if (!this.isPlayerTurn() || !u) return false;
    u.hasMoved = true;
    u.hasActed = true;
    this.pushLog(`${u.label} waits.`);
    this.endTurn();
    return true;
  }

  handleTileClick(col, row) {
    if (this.phase !== Phase.PLAYING || !this.isPlayerTurn()) return;

    const u = this.current();
    if (!u) return;

    if (this.mode === 'move') {
      if (!inRange(this.moveRange, col, row)) {
        this.pushLog('Out of movement range.');
        return;
      }
      const occ = unitAt(this.units, col, row);
      if (occ && occ.id !== u.id) {
        this.pushLog('Tile occupied.');
        return;
      }
      u.col = col;
      u.row = row;
      u.hasMoved = true;
      this.mode = 'idle';
      this._clearActionRanges();
      this.selected = { col, row };
      this.pushLog(`${u.label} moves to (${col}, ${row}).`);
      return;
    }

    if (this.mode === 'attack') {
      const target = unitAt(this.units, col, row);
      if (!target || target.team === u.team) {
        this.pushLog('Select an enemy on a red tile.');
        return;
      }
      if (!inRange(this.attackTiles, col, row)) {
        this.pushLog('Target not in attack range / no LOS.');
        return;
      }
      // Prefer weapon; wizard uses fire bolt when no weapon range
      let mode = bestWeaponMode(u, target, this.map);
      if (!mode && canUseSpell(u, 'fire_bolt')) mode = 'fire_bolt';
      const result = resolveAttack(u, target, this.map, { mode: mode || 'auto' });
      this.pushLog(result.log);
      u.hasActed = true;
      this.mode = 'idle';
      this._clearActionRanges();
      this._checkEnd();
      if (this.phase === Phase.PLAYING) this.endTurn();
      return;
    }

    if (this.mode === 'heal') {
      const target = unitAt(this.units, col, row);
      if (!target || target.team !== u.team) {
        this.pushLog('Select a wounded ally on a green tile.');
        return;
      }
      if (!inRange(this.healTiles, col, row)) {
        this.pushLog('Ally not in heal range.');
        return;
      }
      const result = resolveHeal(u, target);
      this.pushLog(result.log);
      if (result.healed > 0) {
        u.hasActed = true;
        this.mode = 'idle';
        this._clearActionRanges();
        this.endTurn();
      }
      return;
    }

    // idle: inspect
    this.selected = { col, row };
    const unit = unitAt(this.units, col, row);
    if (unit) {
      const gear = [
        unit.weaponName,
        unit.rangedName,
        ...unit.spells.map(
          (s) =>
            `${s.name}(${s.remaining === Infinity ? '∞' : s.remaining})`,
        ),
      ]
        .filter(Boolean)
        .join(', ');
      this.pushLog(
        `${unit.label} [${unit.team}] HP ${unit.hp}/${unit.maxHp} AC ${unit.ac} · ${gear}`,
      );
    }
  }

  endTurn() {
    if (this.phase !== Phase.PLAYING) return;
    this.mode = 'idle';
    this._clearActionRanges();
    this.turns.next();
    const u = this.current();
    if (!u) return;
    this.pushLog(`Round ${this.turns.round} — ${u.label}'s turn.`);
    this._beginTurn();
    this._checkEnd();
  }

  _checkEnd() {
    const players = living(this.units, 'player');
    const enemies = living(this.units, 'enemy');
    if (!enemies.length) {
      this.phase = Phase.WON;
      this.pushLog('Victory! All enemies defeated.');
    } else if (!players.length) {
      this.phase = Phase.LOST;
      this.pushLog('Defeat. Your party has fallen.');
    }
  }

  view() {
    return {
      map: this.map,
      units: this.units,
      phase: this.phase,
      mode: this.mode,
      round: this.turns.round,
      current: this.current(),
      moveRange: this.moveRange,
      attackTiles: this.attackTiles,
      healTiles: this.healTiles,
      selected: this.selected,
      log: this.log.slice(),
      isPlayerTurn: this.isPlayerTurn(),
    };
  }
}
