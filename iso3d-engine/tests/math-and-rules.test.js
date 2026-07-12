/**
 * Headless tests — run with: node tests/math-and-rules.test.js
 */

import {
  createMat4,
  getCameraMatrix,
  gridToWorld,
  worldToGrid,
  abilityMod,
  multiply,
  invert,
  ortho,
  lookAt,
} from '../src/math.js';
import {
  buildDemoMap,
  isWalkable,
  moveCost,
  hasLineOfSight,
  heightAt,
  paintTerrain,
  raiseTile,
  TERRAIN,
  serializeMap,
  deserializeMap,
} from '../src/map.js';
import { createUnit, attackMod, living, hasRangedWeapon } from '../src/units.js';
import {
  computeMoveRange,
  isAdjacent,
  chebyshev,
  computeAttackOptions,
} from '../src/movement.js';
import { resolveAttack, resolveHeal } from '../src/combat.js';
import { rollInitiative, TurnManager } from '../src/turn.js';
import { Game, Phase } from '../src/game.js';

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

console.log('math');
{
  const w = gridToWorld(0, 0, 10, 10, 0);
  assert(w.x === -4.5 && w.z === -4.5, 'gridToWorld origin corner');
  const g = worldToGrid(w.x, w.z, 10, 10);
  assert(g && g.col === 0 && g.row === 0, 'worldToGrid round-trip');
  assert(abilityMod(16) === 3, 'STR 16 → +3');
  assert(abilityMod(8) === -1, 'STR 8 → -1');

  const m = getCameraMatrix(0, 1, 0, 0, 1);
  assert(m.matrix.length === 16, 'camera matrix is mat4');
  assert(m.eye[1] > 0, 'camera eye above ground');

  const id = createMat4();
  const inv = createMat4();
  assert(invert(inv, id) !== null, 'identity invertible');

  const o = createMat4();
  ortho(o, -1, 1, -1, 1, 0.1, 100);
  assert(Number.isFinite(o[0]) && o[0] !== 0, 'ortho produces values');

  const v = createMat4();
  lookAt(v, [0, 10, 10], [0, 0, 0], [0, 1, 0]);
  const r = createMat4();
  multiply(r, o, v);
  assert(Number.isFinite(r[0]), 'multiply ortho*view');
}

console.log('map / editor / LOS');
{
  const map = buildDemoMap(12, 12);
  assert(map.cells.length === 144, '12x12 map');
  assert(!isWalkable(map, 0, 5), 'water edge not walkable');
  assert(isWalkable(map, 4, 4), 'dirt path walkable');
  assert(moveCost(map, 3, 6) === 2, 'mud costs 2');
  assert(moveCost(map, 4, 9) === 1, 'grass costs 1');

  assert(heightAt(map, 8, 5) >= 2, 'cliff plateau elevated');
  assert(!hasLineOfSight(map, 4, 5, 10, 5), 'LOS blocked by cliffs');
  assert(hasLineOfSight(map, 2, 9, 3, 10), 'LOS open nearby');

  paintTerrain(map, 5, 9, TERRAIN.WATER);
  assert(map.cells[9 * 12 + 5].type === TERRAIN.WATER, 'paint water');
  assert(map.cells[9 * 12 + 5].h === 0, 'water flattens');

  paintTerrain(map, 5, 8, TERRAIN.CLIFF);
  assert(map.cells[8 * 12 + 5].h >= 1, 'cliff paint raises');
  raiseTile(map, 5, 8);
  assert(map.cells[8 * 12 + 5].h >= 2, 'raise tile');

  const json = serializeMap(map);
  const map2 = deserializeMap(json);
  assert(map2.cols === 12 && map2.cells[0].type === map.cells[0].type, 'serialize round-trip');

  const fighter = createUnit('fighter', 'player', 2, 9);
  const range = computeMoveRange(fighter, map, [fighter]);
  assert(range.has('2,9'), 'start in move range');
  assert(range.size > 1, 'can move somewhere');
}

console.log('combat 5e melee / ranged / heal');
{
  const map = buildDemoMap(12, 12);
  const a = createUnit('fighter', 'player', 1, 1);
  const b = createUnit('goblin', 'enemy', 1, 2);
  assert(isAdjacent(a, b), 'adjacent for melee');
  assert(attackMod(a) === 5, 'fighter attack mod +5');

  let i = 0;
  const rngHit = () => {
    const seq = [0.999, 0.5, 0.5];
    return seq[i++] ?? 0.5;
  };
  const hit = resolveAttack(a, b, map, { mode: 'melee', rng: rngHit });
  assert(hit.hit === true, 'nat 20 hits');
  assert(hit.crit === true, 'nat 20 is crit');
  assert(b.hp < b.maxHp, 'damage applied');

  const c = createUnit('fighter', 'player', 3, 3);
  const d = createUnit('goblin', 'enemy', 5, 5);
  const missRange = resolveAttack(c, d, map, { mode: 'melee' });
  assert(missRange.hit === false, 'non-adjacent melee fails');

  const rogue = createUnit('rogue', 'player', 2, 10);
  const gob = createUnit('goblin', 'enemy', 6, 10);
  assert(hasRangedWeapon(rogue), 'rogue has bow');
  assert(chebyshev(rogue, gob) === 4, 'distance 4');
  assert(hasLineOfSight(map, 2, 10, 6, 10), 'ranged LOS clear');
  const opts = computeAttackOptions(rogue, [rogue, gob], map, 'ranged');
  assert(opts.targets.some((t) => t.id === gob.id), 'goblin in ranged options');

  i = 0;
  const rngBow = () => {
    const seq = [0.999, 0.5, 0.5];
    return seq[i++] ?? 0.5;
  };
  const bow = resolveAttack(rogue, gob, map, { mode: 'ranged', rng: rngBow });
  assert(bow.hit === true, 'ranged crit hits');

  const cleric = createUnit('cleric', 'player', 2, 9, 'Mirabel');
  const wounded = createUnit('fighter', 'player', 3, 9);
  wounded.hp = 3;
  const heal = resolveHeal(cleric, wounded, () => 0.5);
  assert(heal.healed > 0, 'cure wounds heals');
  assert(wounded.hp > 3, 'HP increased');
}

console.log('turns / game');
{
  const u1 = createUnit('fighter', 'player', 1, 1);
  const u2 = createUnit('goblin', 'enemy', 2, 2);
  const rng = () => 0.5;
  const order = rollInitiative([u1, u2], rng);
  assert(order.length === 2, 'initiative for both');
  assert(order[0].initiative >= order[1].initiative, 'sorted high first');

  const tm = new TurnManager([u1, u2], rng);
  assert(tm.current() !== null, 'has current unit');
  const first = tm.current();
  tm.next();
  assert(
    tm.current() !== first || living([u1, u2]).length === 1,
    'next advances or sole living',
  );

  const game = new Game();
  assert(
    game.phase === Phase.PLAYING ||
      game.phase === Phase.WON ||
      game.phase === Phase.LOST,
    'game boots',
  );
  assert(game.units.length === 7, 'demo roster 4v3');
  assert(game.map.cols === 12, 'demo map size 12');
  game.reset();
  assert(game.units.length === 7, 'reset rebuilds roster');
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
