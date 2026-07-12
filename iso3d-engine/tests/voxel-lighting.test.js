/**
 * Headless tests — run with: node tests/voxel-lighting.test.js
 */

import {
  LIGHT_PRESETS,
  resolveLighting,
  pickNearestLights,
  tileIllumination01,
  tileLightLevel,
  tileLightRGB,
  sunShadowFactor,
} from '../src/voxel/lighting.js';

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

console.log('resolveLighting');
{
  const dungeon = resolveLighting({ mode: 'dungeon' });
  assert(dungeon.id === 'dungeon', 'mode selects the dungeon preset');
  assert(dungeon.ambientLevel === 0, 'dungeon preset is dark ambient');
  assert(Array.isArray(dungeon.points) && dungeon.points.length === 0, 'no points by default');

  const torch = { col: 3, row: 3, radius: 4, color: [1, 0.55, 0.22], intensity: 1.5 };
  const lit = resolveLighting({ mode: 'dungeon', points: [torch] }, []);
  assert(lit.points.length === 1, 'map torch point is included');
  assert(lit.points[0].color[0] === 1 && lit.points[0].color[1] === 0.55, 'torch color carried through');

  // Same-tile dedup keeps the stronger of two lights.
  const weak = { col: 5, row: 5, radius: 2, intensity: 0.5 };
  const strong = { col: 5, row: 5, radius: 6, intensity: 2.0 };
  const deduped = resolveLighting({ mode: 'day', points: [weak] }, [strong]);
  assert(deduped.points.length === 1, 'same-tile lights are deduplicated');
  assert(deduped.points[0].intensity === 2.0, 'the stronger of the two duplicate lights wins');
}

console.log('pickNearestLights');
{
  const points = [
    { col: 0, row: 0, radius: 4 },
    { col: 10, row: 10, radius: 4 },
    { col: 1, row: 1, radius: 4 },
  ];
  const nearest = pickNearestLights(points, { col: 0, row: 0 }, 2);
  assert(nearest.length === 2, 'returns at most maxN lights');
  assert(nearest[0].col === 0 && nearest[0].row === 0, 'closest light sorted first');
}

console.log('tileIllumination01 / tileLightLevel');
{
  const day = resolveLighting({ mode: 'day' });
  assert(tileLightLevel(day, 0, 0) === 2, 'broad daylight reads as fully bright everywhere');

  const dungeon = resolveLighting({ mode: 'dungeon' });
  assert(tileLightLevel(dungeon, 50, 50) === 0, 'unlit dungeon tile far from any torch is dark');

  const torchLit = resolveLighting({
    mode: 'dungeon',
    points: [{ col: 5, row: 5, radius: 4, intensity: 1.5 }],
  });
  assert(tileLightLevel(torchLit, 5, 5) === 2, 'standing on the torch tile itself is bright');
  assert(tileLightLevel(torchLit, 50, 50) === 0, 'far from the torch is still dark');
  const near = tileIllumination01(torchLit, 5, 5);
  const far = tileIllumination01(torchLit, 8, 5);
  assert(near > far, 'illumination falls off with distance from the torch');
}

console.log('tileLightRGB');
{
  const dungeon = resolveLighting({ mode: 'dungeon' });
  const [ar, ag, ab] = tileLightRGB(dungeon, 50, 50);
  assert(Math.abs(ar - ag) < 1e-9 && Math.abs(ag - ab) < 1e-9, 'unlit dungeon tile is neutral gray (no color cast)');

  const orangeTorch = resolveLighting({
    mode: 'dungeon',
    points: [{ col: 5, row: 5, radius: 4, intensity: 1.5, color: [1.0, 0.55, 0.22] }],
  });
  const [tr, tg, tb] = tileLightRGB(orangeTorch, 5, 5);
  assert(tr > tg && tg > tb, 'a tile lit by an orange torch is genuinely tinted orange (R > G > B), not just brighter');

  const blueLight = resolveLighting({
    mode: 'dungeon',
    points: [{ col: 5, row: 5, radius: 4, intensity: 1.5, color: [0.3, 0.4, 1.0] }],
  });
  const [br, bg, bb] = tileLightRGB(blueLight, 5, 5);
  assert(bb > br, 'a blue-colored light source tints the tile toward blue, not orange');
}

console.log('sunShadowFactor');
{
  const flat = (c, r) => 0;
  assert(sunShadowFactor(flat, 5, 5, [1, 0, 0]) === 1, 'flat terrain casts no shadow');

  const cliff = (c, r) => (c >= 8 ? 5 : 0); // a tall wall to the east
  const factor = sunShadowFactor(cliff, 5, 5, [1, 0, 0]); // sun from the east, wall blocks it
  assert(factor < 1, 'a taller neighbor toward the sun darkens this tile');
  assert(factor >= 0.25, 'shadow factor never goes below the documented floor (0.25)');
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
