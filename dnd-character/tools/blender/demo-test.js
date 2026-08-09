/* Headless checks for the socket solver in tiles_demo.html.
 *
 *     node demo-test.js [out/grass10A/tiles.json]
 *
 * The demo is a browser page with WebGL in it, so the obvious way to test it is to
 * open it and look -- which is exactly the check that was unavailable the day the
 * seam bug shipped, and exactly the check that cannot tell you WHY a map is wrong.
 *
 * The solver, though, is pure: manifest in, grid of (tile, rotation) out. This
 * pulls that section out of the page and runs it against the real manifest, then
 * asserts the one thing the whole design rests on -- that every pair of abutting
 * tiles presents the same socket across the edge they share. A tiling that
 * violates that is a map with a hole in it, and no amount of squinting at a
 * screenshot localises it the way "cell (4,7) X+ says G1, neighbour says W" does.
 *
 * It also checks the map-quality rules, because those failed silently for 112
 * attempts in a row once and only a counter found it.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const HERE = __dirname;
const manPath = process.argv[2] ||
  path.join(HERE, 'out', 'grass10A', 'tiles.json');

let pass = 0, fail = 0;
const T = (name, ok, detail) => {
  if (ok) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (detail ? '\n       ' + detail : '')); }
};

// ---- lift the solver out of the page ---------------------------------------
// By name, not by line number: the page is edited constantly and a slice would
// rot within a day. If a function is renamed this throws immediately, which is a
// better failure than silently testing nothing.
const html = fs.readFileSync(path.join(HERE, 'tiles_demo.html'), 'utf8');
const script = (html.match(/<script[^>]*>([\s\S]*?)<\/script>/) || [])[1] || '';

function grab(sig) {
  const i = script.indexOf(sig);
  if (i < 0) throw new Error('cannot find in tiles_demo.html: ' + sig);
  // walk to the matching close brace of the function body
  let depth = 0, j = script.indexOf('{', i);
  for (let k = j; k < script.length; k++) {
    if (script[k] === '{') depth++;
    else if (script[k] === '}') { depth--; if (!depth) return script.slice(i, k + 1); }
  }
  throw new Error('unbalanced braces after ' + sig);
}

const consts = [
  /const ORDER *= *\[[^\]]*\];/,
  /const OPP *= *\{[^}]*\};/,
  /const NEIGH *= *\[[\s\S]*?\];/,
  /const ROLE_W *= *\{[\s\S]*?\};/,
  /const MAP_SEEDS *= *\{[^}]*\};/,
  /const MAP_MIX *= *\{[^}]*\};/,
].map(re => {
  const m = script.match(re);
  if (!m) throw new Error('cannot find constant: ' + re);
  return m[0];
}).join('\n');

const src = [
  consts,
  'const SVAR = [];',
  'let _rs = 12345;',
  'function rnd(){ _rs=(_rs+0x6D2B79F5)|0; let t=Math.imul(_rs^(_rs>>>15),1|_rs);',
  '  t=(t+Math.imul(t^(t>>>7),61|t))^t; return ((t^(t>>>14))>>>0)/4294967296; }',
  'function reseed(s){ _rs=s>>>0; }',
  grab('function buildSocketVariants(man)'),
  // The two path seeders and the road check are part of the solver now, so the
  // test has to lift them too -- otherwise it exercises a socketWfc that cannot
  // run, which fails loudly, which is the point of grabbing by name.
  grab('function seedPath(dom, propagate, W, H'),
  grab('function roadCrosses(dom, W, H)'),
  grab('function socketWfc(W,H'),
  'module.exports = { SVAR, buildSocketVariants, socketWfc, reseed, ORDER, OPP, NEIGH, MAP_MIX };',
].join('\n');

const sandbox = { module: { exports: {} }, console, window: {}, Math, Set, Array,
                  Object, Number, JSON };
sandbox.global = sandbox;
vm.createContext(sandbox);
new vm.Script(src, { filename: 'tiles_demo.solver.js' }).runInContext(sandbox);
const S = sandbox.module.exports;

// ---- the manifest -----------------------------------------------------------
if (!fs.existsSync(manPath)) {
  console.log('no manifest at ' + manPath + ' -- bake a set first');
  process.exit(1);
}
const man = JSON.parse(fs.readFileSync(manPath, 'utf8'));
const nvar = S.buildSocketVariants(man);
console.log('\n' + man.set + ': ' + Object.keys(man.tiles).length + ' tiles, ' +
            nvar + ' variants\n');

T('every tile declares sockets for every rotation',
  Object.entries(man.tiles).every(([, t]) =>
    !t.sockets || [0, 90, 180, 270].every(r => t.sockets[r] &&
      S.ORDER.every(e => typeof t.sockets[r][e] === 'string'))));

// A CROSSING NAMES THE WORLD EDGE IT RISES TOWARD -- X01>Y+ -- so turning a tile
// has to turn that name too: at r90 the same face is X01>X+. This used to assert
// that the multiset of sockets was IDENTICAL at every rotation, which was right
// while a socket was just a label and became wrong the moment one carried a
// direction. Rotating the orientations before comparing says the same thing the
// old test meant (rotation rearranges, it does not invent) while actually
// checking the part that can now go wrong: build_tiles.py used to permute the
// r0 socket map to make the rotated ones, which left every rotated variant
// advertising the r0 direction.
const ROT_EDGE = (e, r) => S.ORDER[(S.ORDER.indexOf(e) + ((r / 90) | 0)) % 4];
const ROT_SOCK = (v, r) => {
  const i = v.indexOf('>');
  return i < 0 ? v : v.slice(0, i + 1) + ROT_EDGE(v.slice(i + 1), r);
};
T('rotating a tile turns its sockets rather than inventing them',
  Object.entries(man.tiles).every(([, t]) => {
    if (!t.sockets) return true;
    const bag = (r, turn) => S.ORDER.map(e => ROT_SOCK(t.sockets[r][e], turn))
      .sort().join('|');
    return [90, 180, 270].every(r => bag(r, 0) === bag(0, r));
  }));

// ---- the invariant ----------------------------------------------------------
// THE SIZE THE APP SHIPS. MAP_MIX is fractions of the board, and the seeded
// river and road are one tile wide whatever the board is -- so the same
// constants behave differently at 9x9 and 12x12, and a suite that tests the size
// nobody runs will pass while the game rejects half its maps.
const W = 12, H = 12;
let solved = 0, mismatches = [];
// The two promises the seeding makes, checked on the SOLVED map rather than on
// the seed -- seeding only asks for tiles of a role along a line; whether they
// end up joined is the only question worth asking.
let noRoad = [], noRiver = [], wetness = [];
// A BRIDGE IS ONLY A BRIDGE IF IT IS ON THE ROAD. The sockets guarantee a deck
// never ends against something that is not a deck, and that is NOT the property
// worth testing: the first working version satisfied it perfectly while putting
// spans wherever the river ran, which at the map boundary means a pier over the
// shore leading nowhere. What has to hold is that every bridge tile is part of
// the road walk that crosses the map.
let bridgeSeeds = [], strandedBridge = [];
// THE SOLVER RETURNS A MAP EVEN WHEN IT APPROVES OF NONE. Past `tries-8` it takes
// the settle-for-anything branch, and what comes back is a legal tiling that
// failed every acceptance rule there is -- so every check in this file passes and
// the generator is broken. That is not hypothetical: two generator changes on
// 2026-08-08 took the accept from around attempt 110 to never, on every seed, and
// this suite reported 12 of 12 through both of them. `accepted` is the only thing
// that says which happened; nothing else can tell the two apart.
let fellBack = [], acceptedAt = [];
// SEEDS=60 to widen the sample. Twelve is the default because the suite has to
// stay quick, and twelve is NOT enough to tune a rejection rate on: sweeping the
// crossing-seed cutoff over five values gave 1, 0, 2, 1, 0 fallbacks with the
// random stream held identical, which is noise with a trend somewhere inside it.
const SEEDS = parseInt(process.env.SEEDS || '12', 10);
for (let seed = 1; seed <= SEEDS; seed++) {
  S.reseed(seed * 7919);
  const cells = S.socketWfc(W, H);
  const dbg = sandbox.window.__wfcDebug;
  if (!dbg || !dbg.accepted) fellBack.push(seed);
  else acceptedAt.push(dbg.accepted.attempt);
  if (!cells) continue;
  solved++;
  // Bounds-checked. Without this, i=W indexes j*W+W, which is the FIRST cell of
  // the next row -- so the check wrapped the map edge-to-edge and reported the
  // solver as broken at (8,2)/(0,3). The coordinates were the tell: those two are
  // not neighbours.
  const at = (i, j) => (i < 0 || i >= W || j < 0 || j >= H) ? null : cells[j * W + i];
  const sockOf = c => man.tiles[c.name].sockets[c.rot];

  // Walk the road: an edge joins two tiles only where the shared socket carries
  // +P, which is exactly where an arm leaves. Start from every cell on the west
  // edge, see if any reach the east one.
  {
    // EITHER AXIS. The road runs perpendicular to the river, so it is north-south
    // half the time and testing only west-to-east fails a perfectly good map.
    const walk = (starts, done) => {
      const seen = new Set(), st = [];
      for (const [i, j] of starts) { st.push([i, j]); seen.add(j * W + i); }
      while (st.length) {
        const [i, j] = st.pop();
        if (done(i, j)) return true;
        for (const nb of S.NEIGH) {
          const ni = i + nb.di, nj = j + nb.dj, n = at(ni, nj);
          if (!n || seen.has(nj * W + ni)) continue;
          // +B is a road too -- one carried over water on a deck rather than laid
          // on the ground. This is a SECOND COPY of the rule in tiles_demo.html's
          // roadCrosses, and it disagreed with it the moment the bridge shipped:
          // 10 of 12 seeds reported no road across a map whose road crossed on a
          // bridge. The duplication is the bug; if a third copy is ever wanted,
          // export the predicate instead.
          if (!/\+[PBC]/.test(sockOf(at(i, j))[nb.edge])) continue;
          seen.add(nj * W + ni); st.push([ni, nj]);
        }
      }
      return false;
    };
    const west = [], north = [];
    for (let j = 0; j < H; j++) west.push([0, j]);
    for (let i = 0; i < W; i++) north.push([i, 0]);
    const crossed = walk(west, i => i === W - 1) || walk(north, (i, j) => j === H - 1);
    if (!crossed) noRoad.push(seed);

    // Every cell the road reaches from ANY border, flooded in full. `walk` above
    // stops the moment it touches the far edge, so its `seen` is a partial answer
    // and reusing it would pass a stranded bridge whenever the road happened to
    // finish first.
    const bridges = cells.filter(c => /^span/.test(c.role));
    if (bridges.length) {
      bridgeSeeds.push(seed);
      // FLOODED FROM THE TRACKS, not from the border. Seeding every border cell
      // was the first attempt and it is worthless: a pier hanging off the map
      // edge is a border cell, so it was "on the road" before the walk started,
      // and the mutation that removes the mask keeping spans off the shore still
      // passed 12 of 12. What separates a crossing from a diving board is that
      // real road on real ground reaches it.
      const seen = new Set(), st = [];
      for (const c of cells) if (/^track/.test(c.role)) { st.push([c.i, c.j]); seen.add(c.j * W + c.i); }
      while (st.length) {
        const [i, j] = st.pop();
        for (const nb of S.NEIGH) {
          const ni = i + nb.di, nj = j + nb.dj, n = at(ni, nj);
          if (!n || seen.has(nj * W + ni)) continue;
          if (!/\+[PBC]/.test(sockOf(at(i, j))[nb.edge])) continue;
          seen.add(nj * W + ni); st.push([ni, nj]);
        }
      }
      for (const c of bridges)
        if (!seen.has(c.j * W + c.i)) strandedBridge.push(seed + '@' + c.i + ',' + c.j);
    }

    // MEASURED THE WAY THE SOLVER MEASURES IT -- any tile carrying a water socket,
    // not role `liquid`. This counted meres, which is a THIRD copy of a rule
    // tiles_demo.html already fixed once for exactly this reason: a shore tile is
    // water on screen while its role says `transition`, and 12 of 256 tiles are
    // role liquid against 104 that are half water by area. It reported 4 of 60
    // seeds "dry" the moment the crossing seed started turning a mere into a span
    // -- maps with a full river in them, counted by the wrong thing.
    const anyWater = c => {
      const s = sockOf(c);
      return S.ORDER.some(e => /^W/.test(s[e]));
    };
    const wet = cells.filter(anyWater).length;
    const meres = cells.filter(c => c.role === 'liquid').length;
    wetness.push({ seed, wet, fell: !dbg || !dbg.accepted });
    if (!wet) noRiver.push(seed + (meres ? '' : '(no mere either)'));
  }
  for (const c of cells) {
    for (const nb of S.NEIGH) {
      const n = at(c.i + nb.di, c.j + nb.dj);
      if (!n) continue;
      const a = sockOf(c)[nb.edge], b = sockOf(n)[S.OPP[nb.edge]];
      if (a !== b) {
        mismatches.push('seed ' + seed + ' (' + c.i + ',' + c.j + ') ' + nb.edge +
                        ' ' + c.name + '=' + a + ' vs ' + n.name + '=' + b);
      }
    }
  }
}
T('the solver produced a tiling for every seed', solved === SEEDS,
  solved + '/' + SEEDS + ' seeds solved');
T('every abutting pair agrees across the edge it shares', mismatches.length === 0,
  mismatches.slice(0, 4).join('\n       '));

// ---- the quality rules ------------------------------------------------------
// These are the ones that failed silently: a map can satisfy every socket and
// still be a flat green field, or an archipelago, or a plateau with no way up.
let flat = 0, noway = 0, drowned = 0;
for (let seed = 1; seed <= 12; seed++) {
  S.reseed(seed * 104729);
  const cells = S.socketWfc(W, H);
  if (!cells) continue;
  const roles = {};
  for (const c of cells) roles[c.role] = (roles[c.role] || 0) + 1;
  const high = roles.high_ground || 0;
  const ways = (roles.slope || 0) + (roles.track_slope || 0);
  const water = roles.liquid || 0;
  if (!high) flat++;
  if (high && !ways) noway++;
  if (water > W * H * 0.5) drowned++;
}
T('maps are not flat', flat === 0, flat + '/' + SEEDS + ' had no high ground');
T('high ground always has a way up', noway === 0, noway + '/' + SEEDS + ' were unclimbable');
T('maps are not mostly water', drowned === 0, drowned + '/' + SEEDS + ' drowned');

// ---- what the seeding PROMISED, checked on the solved map --------------------
// Seeding only asks for tiles of a role along a line. Whether they end up joined
// into something you could walk, or whether the river survived the solve at all,
// is a different question and the only one worth asking.
// A BUDGET, NOT A ZERO, and the budget is measured rather than hoped for. Over 60
// seeds: 1 falls through with the crossing seed switched off entirely, 2 with it
// cut off at half the tries, 4 with it on for every attempt -- and the one that
// fails with it off (seed 48) fails in every configuration, so some seeds are
// simply marginal and asserting zero would be asserting the noise. 10% still
// catches what this exists for by a mile: both generator changes that were backed
// out on 2026-08-08 fell through on 12 seeds of 12.
T('the solver ACCEPTS its maps rather than settling for them',
  fellBack.length <= Math.max(1, Math.ceil(SEEDS * 0.10)),
  'fell through to the tries-8 branch on ' + fellBack.length + '/' + SEEDS
    + ' seeds: ' + fellBack.join(',')
    + '  (budget ' + Math.max(1, Math.ceil(SEEDS * 0.10)) + ')');
// Not a pass/fail — the accept ATTEMPT is the early-warning number. It sat around
// 110 while this was written; a change that pushes it to 250 has not broken
// anything yet and is one more constraint away from doing so.
if (acceptedAt.length)
  console.log('       accepted at attempt: median ' +
    acceptedAt.slice().sort((a, b) => a - b)[acceptedAt.length >> 1] +
    ', worst ' + Math.max(...acceptedAt) + ' of 300');

T('a road crosses the map, west edge to east',
  noRoad.length === 0, noRoad.length ? 'seeds without one: ' + noRoad.join(',') : '');
T('every bridge is on the road, not a pier over the shore',
  strandedBridge.length === 0, strandedBridge.join(' '));
// Not "most maps have one" -- a river is bridged on a coin flip and only where
// the two seeded lines actually meet, so the honest floor is that the piece can
// still be placed at all. It has silently stopped being placeable twice already:
// once because the river seed's own predicate excluded it, once because the mask
// that keeps it off the shore was too strong.
T('a bridge is still reachable by the generator',
  bridgeSeeds.length > 0, bridgeSeeds.length + ' of ' + SEEDS + ' seeds bridged');
T('every map has water in it',
  noRiver.length === 0, noRiver.length ? 'dry seeds: ' + noRiver.join(',') : '');
// THE SOLVER'S OWN BOUND, lifted from MAP_MIX rather than written down again
// here. The hardcoded 0.23 was calibrated against the mere count above and became
// meaningless the moment the count started measuring what the solver measures --
// every map read 36 of 144 and "failed" a limit of 33.
//
// Asserted only on maps the solver ACCEPTED. A fallback map is out of range by
// definition; that is what the budget test above is for, and failing it twice
// just makes one bad seed look like two problems.
{
  const judged = wetness.filter(w => !w.fell);
  const over = judged.filter(w => w.wet > W * H * S.MAP_MIX.water[1]);
  T('and not too much of it -- a river, not a swamp',
    over.length === 0,
    over.map(w => 'seed ' + w.seed + ': ' + w.wet).join(', ') +
    ' of ' + (W * H) + ', limit ' + Math.floor(W * H * S.MAP_MIX.water[1]));
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
