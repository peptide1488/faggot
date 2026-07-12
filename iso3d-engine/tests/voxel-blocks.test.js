/**
 * Headless tests — run with: node tests/voxel-blocks.test.js
 */

import {
  FACE,
  FACING,
  TEX,
  parseBlock,
  stringifyBlock,
  resolveFace,
  atlasUV,
  atlasCellRect,
  PLACEHOLDER_COLORS,
  BLOCKS,
  MODELS,
} from '../src/voxel/blocks.js';

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

console.log('parseBlock / stringifyBlock');
{
  assert(
    JSON.stringify(parseBlock('stone')) === JSON.stringify({ type: 'stone', facing: null, slab: false }),
    'plain type, no facing, no slab',
  );
  assert(
    JSON.stringify(parseBlock('stone#slab')) === JSON.stringify({ type: 'stone', facing: null, slab: true }),
    'slab suffix parses, no facing',
  );
  assert(
    JSON.stringify(parseBlock('shelf:S#slab')) === JSON.stringify({ type: 'shelf', facing: FACING.S, slab: true }),
    'facing + slab both parse',
  );
  assert(parseBlock('door:N').facing === FACING.N, 'facing letter maps to correct index');
  assert(stringifyBlock({ type: 'shelf', facing: FACING.S, slab: true }) === 'shelf:S#slab', 'round-trips back to string');
  assert(stringifyBlock({ type: 'stone', facing: null, slab: false }) === 'stone', 'plain type round-trips without suffixes');
}

console.log('resolveFace — simple materials');
{
  assert(resolveFace('stone', FACE.TOP) === TEX.STONE, 'stone top = STONE (all)');
  assert(resolveFace('stone', FACE.NORTH) === TEX.STONE, 'stone north = STONE (all)');
  assert(resolveFace('bedrock', FACE.BOTTOM) === TEX.BEDROCK, 'bedrock bottom = BEDROCK (all)');
}

console.log('resolveFace — grass (top/side/bottom)');
{
  assert(resolveFace('grass', FACE.TOP) === TEX.GRASS_TOP, 'grass top = GRASS_TOP');
  assert(resolveFace('grass', FACE.BOTTOM) === TEX.DIRT, 'grass bottom = DIRT');
  for (const f of [FACE.NORTH, FACE.EAST, FACE.SOUTH, FACE.WEST]) {
    assert(resolveFace('grass', f) === TEX.GRASS_SIDE, `grass ${f} = GRASS_SIDE`);
  }
}

console.log('resolveFace — shelf (relative front vs everything else)');
{
  // Facing S: front points south, so the SOUTH face is "front" (books); every other face
  // (including top/bottom) falls back to `all` (planks).
  assert(resolveFace('shelf', FACE.SOUTH, { facing: FACING.S }) === TEX.BOOKS, 'shelf front (south, facing S) = BOOKS');
  assert(resolveFace('shelf', FACE.NORTH, { facing: FACING.S }) === TEX.PLANKS, 'shelf back (north, facing S) = PLANKS');
  assert(resolveFace('shelf', FACE.EAST, { facing: FACING.S }) === TEX.PLANKS, 'shelf left/right (east, facing S) = PLANKS');
  assert(resolveFace('shelf', FACE.TOP, { facing: FACING.S }) === TEX.PLANKS, 'shelf top = PLANKS');
  // Rotate facing to N: now the front (books) should be on the NORTH face instead.
  assert(resolveFace('shelf', FACE.NORTH, { facing: FACING.N }) === TEX.BOOKS, 'shelf front (north, facing N) = BOOKS');
  assert(resolveFace('shelf', FACE.SOUTH, { facing: FACING.N }) === TEX.PLANKS, 'shelf back (south, facing N) = PLANKS');
}

console.log('resolveFace — per-elevation side arrays (dungeon_wall)');
{
  // 3-stack: depth 0 (top) = cap, depth 1 (mid) = mid, depth 2 (bottom) = base.
  assert(resolveFace('dungeon_wall', FACE.NORTH, { depth: 0 }) === TEX.WALL_CAP, '3-stack depth0 = CAP');
  assert(resolveFace('dungeon_wall', FACE.NORTH, { depth: 1 }) === TEX.WALL_MID, '3-stack depth1 = MID');
  assert(resolveFace('dungeon_wall', FACE.NORTH, { depth: 2 }) === TEX.WALL_BASE, '3-stack depth2 = BASE');
  // 5-stack clamps to the last entry (BASE) for anything deeper than the array.
  assert(resolveFace('dungeon_wall', FACE.NORTH, { depth: 3 }) === TEX.WALL_BASE, '5-stack depth3 clamps to BASE');
  assert(resolveFace('dungeon_wall', FACE.NORTH, { depth: 4 }) === TEX.WALL_BASE, '5-stack depth4 clamps to BASE');
  // Lone block (depth 0) still shows cap, and top face is unaffected by depth.
  assert(resolveFace('dungeon_wall', FACE.TOP, { depth: 0 }) === TEX.WALL_CAP, 'lone block top = CAP');
}

console.log('atlas UV math');
{
  const cell0 = atlasCellRect(0);
  const cell1 = atlasCellRect(1);
  assert(cell0.x === 0 && cell0.y === 0, 'texId 0 sits at atlas origin');
  assert(cell1.x === 32 && cell1.y === 0, 'texId 1 sits one cell to the right');

  const uv0 = atlasUV(0);
  const uv1 = atlasUV(1);
  assert(uv0.u1 < uv1.u0, 'adjacent cells never overlap in U after inset');
  assert(uv0.u0 > 0 && uv0.v0 > 0, 'inset pulls u0/v0 strictly inside the cell (no bleed at 0,0)');
  assert(uv0.u1 - uv0.u0 > 0 && uv0.v1 - uv0.v0 > 0, 'inset UV rect has positive area');
}

console.log('registry completeness');
{
  for (const [type, def] of Object.entries(BLOCKS)) {
    if (def.model) {
      assert(Array.isArray(MODELS[def.model]) && MODELS[def.model].length > 0, `${type} references an existing non-empty model`);
    }
    assert(typeof def.solid === 'boolean', `${type} declares solid flag`);
    assert(typeof def.opaque === 'boolean', `${type} declares opaque flag`);
  }
  for (const [texIdStr] of Object.entries(TEX)) {
    assert(PLACEHOLDER_COLORS[TEX[texIdStr]] !== undefined, `TEX.${texIdStr} has a placeholder color`);
  }
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
