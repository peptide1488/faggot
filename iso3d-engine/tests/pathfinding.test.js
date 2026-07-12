import { createMap, TERRAIN } from '../src/map.js';
import { findPath, runningHighJumpFt } from '../src/pathfinding.js';

let ok = 0;
let fail = 0;
function assert(c, m) {
  if (c) {
    ok += 1;
    console.log('  OK', m);
  } else {
    fail += 1;
    console.error('  FAIL', m);
  }
}

assert(runningHighJumpFt(0) === 3, 'STR 10 running high jump 3 ft');
assert(runningHighJumpFt(2) === 5, 'STR 14 running high jump 5 ft');
assert(runningHighJumpFt(-1) === 2, 'STR 8 running high jump 2 ft');

const map = createMap(6, 6, 0, TERRAIN.GRASS);
for (let r = 0; r < 6; r++) map.cells[r * 6 + 3].h = 1; // 5 ft ledge

const weak = findPath(map, 0, 2, 3, 2, { strMod: 0, maxCost: 60 });
assert(weak && weak.length >= 2, 'STR 10 can climb 5 ft ledge with enough movement');

for (let r = 0; r < 6; r++) map.cells[r * 6 + 4].h = 3; // 15 ft
const tall = findPath(map, 0, 2, 4, 2, { strMod: 0, maxCost: 200 });
assert(tall && tall.length >= 2, 'STR 10 can climb up to ~20 ft unaided');

// Adjacent 30 ft sheer face (one step of +6 levels) — blocked without climb speed
const sheer = createMap(4, 3, 0, TERRAIN.GRASS);
for (let r = 0; r < 3; r++) sheer.cells[r * 4 + 2].h = 6;
const tooTall = findPath(sheer, 0, 1, 2, 1, { strMod: 0, maxCost: 500 });
assert(tooTall === null, '30 ft adjacent cliff blocked without climb speed');

const withClimb = findPath(sheer, 0, 1, 2, 1, {
  strMod: 0,
  climbSpeed: true,
  maxCost: 500,
});
assert(withClimb && withClimb.length >= 2, 'climb speed can scale 30 ft cliff');

console.log(`\n${ok} passed, ${fail} failed`);
if (fail) process.exit(1);
