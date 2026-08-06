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
  grab('function socketWfc(W,H'),
  'module.exports = { SVAR, buildSocketVariants, socketWfc, reseed, ORDER, OPP, NEIGH };',
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
const W = 9, H = 9;
let solved = 0, mismatches = [];
for (let seed = 1; seed <= 12; seed++) {
  S.reseed(seed * 7919);
  const cells = S.socketWfc(W, H);
  if (!cells) continue;
  solved++;
  // Bounds-checked. Without this, i=W indexes j*W+W, which is the FIRST cell of
  // the next row -- so the check wrapped the map edge-to-edge and reported the
  // solver as broken at (8,2)/(0,3). The coordinates were the tell: those two are
  // not neighbours.
  const at = (i, j) => (i < 0 || i >= W || j < 0 || j >= H) ? null : cells[j * W + i];
  const sockOf = c => man.tiles[c.name].sockets[c.rot];
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
T('the solver produced a tiling for every seed', solved === 12,
  solved + '/12 seeds solved');
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
T('maps are not flat', flat === 0, flat + '/12 had no high ground');
T('high ground always has a way up', noway === 0, noway + '/12 were unclimbable');
T('maps are not mostly water', drowned === 0, drowned + '/12 drowned');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
