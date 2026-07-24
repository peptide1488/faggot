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
  TEX_CUSTOM_START,
  ATLAS_COLS,
  ATLAS_ROWS,
  allocateTexSlot,
  resetCustomTexAllocation,
  registerBlock,
  isBottomOfTypeStack,
  typeStackHeight,
} from '../src/voxel/blocks.js';
import { VoxelStore } from '../src/voxel/store.js';

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

console.log('resolveFace — grass (top/side/bottom + 3-course stack)');
{
  assert(resolveFace('grass', FACE.TOP) === TEX.GRASS_TOP, 'lone/top-of-stack grass top = GRASS_TOP');
  assert(resolveFace('grass', FACE.BOTTOM) === TEX.DIRT, 'grass bottom = DIRT');
  for (const f of [FACE.NORTH, FACE.EAST, FACE.SOUTH, FACE.WEST]) {
    assert(resolveFace('grass', f, { depth: 0 }) === TEX.GRASS_SIDE, `grass ${f} depth0 = GRASS_SIDE (top course)`);
    assert(resolveFace('grass', f, { depth: 1 }) === TEX.DIRT, `grass ${f} depth1 = DIRT (mid course)`);
    // depth 2+ stays plain DIRT without a store — foot trim only via footByNeighbor on real bottoms
    assert(resolveFace('grass', f, { depth: 2 }) === TEX.DIRT, `grass ${f} depth2 = DIRT (no baked foot in side[])`);
  }
  assert(resolveFace('grass', FACE.TOP, { depth: 1 }) === TEX.DIRT, 'mid-stack grass top face = DIRT (not grass top)');
}

console.log('resolveFace — neighbor-aware grass foot transitions');
{
  // 3-high grass on stone → bottom sides use GRASS_FOOT_STONE
  const onStone = new VoxelStore();
  onStone.set(0, 0, 0, 'stone');
  onStone.set(0, 0, 1, 'grass');
  onStone.set(0, 0, 2, 'grass');
  onStone.set(0, 0, 3, 'grass');
  assert(isBottomOfTypeStack(onStone, 0, 0, 1, 'grass'), 'z=1 is bottom of grass stack');
  assert(typeStackHeight(onStone, 0, 0, 1, 'grass') === 3, 'grass stack height is 3');
  assert(
    resolveFace('grass', FACE.NORTH, { depth: 2, store: onStone, c: 0, r: 0, z: 1 }) === TEX.GRASS_FOOT_STONE,
    '3-high grass on stone: bottom side uses GRASS_FOOT_STONE',
  );
  assert(
    resolveFace('grass', FACE.NORTH, { depth: 0, store: onStone, c: 0, r: 0, z: 3 }) === TEX.GRASS_SIDE,
    'top of grass stack still GRASS_SIDE',
  );

  // On sand
  const onSand = new VoxelStore();
  onSand.set(1, 0, 0, 'sand');
  onSand.set(1, 0, 1, 'grass');
  onSand.set(1, 0, 2, 'grass');
  assert(
    resolveFace('grass', FACE.EAST, { depth: 1, store: onSand, c: 1, r: 0, z: 1 }) === TEX.GRASS_FOOT_SAND,
    'grass on sand: foot = GRASS_FOOT_SAND',
  );

  // On mud
  const onMud = new VoxelStore();
  onMud.set(2, 0, 0, 'mud');
  onMud.set(2, 0, 1, 'grass');
  onMud.set(2, 0, 2, 'grass');
  assert(
    resolveFace('grass', FACE.SOUTH, { depth: 1, store: onMud, c: 2, r: 0, z: 1 }) === TEX.GRASS_FOOT_MUD,
    'grass on mud: foot = GRASS_FOOT_MUD',
  );

  // On dirt/field → default grass base
  const onDirt = new VoxelStore();
  onDirt.set(3, 0, 0, 'dirt');
  onDirt.set(3, 0, 1, 'grass');
  onDirt.set(3, 0, 2, 'grass');
  assert(
    resolveFace('grass', FACE.WEST, { depth: 1, store: onDirt, c: 3, r: 0, z: 1 }) === TEX.GRASS_BASE,
    'grass on dirt: foot = GRASS_BASE (field grass trim)',
  );

  // Lone 1-high grass never uses foot override (keeps GRASS_SIDE)
  const lone = new VoxelStore();
  lone.set(4, 0, 0, 'stone');
  lone.set(4, 0, 1, 'grass');
  assert(
    resolveFace('grass', FACE.NORTH, { depth: 0, store: lone, c: 4, r: 0, z: 1 }) === TEX.GRASS_SIDE,
    '1-high grass on stone still uses GRASS_SIDE (not foot override)',
  );

  // Beside: grass on dirt, sand under the north neighbor → north face sand foot
  const shore = new VoxelStore();
  shore.set(5, 0, 0, 'dirt');
  shore.set(5, -1, 0, 'sand'); // under the north-adjacent cell
  shore.set(5, 0, 1, 'grass');
  shore.set(5, 0, 2, 'grass');
  assert(
    resolveFace('grass', FACE.NORTH, { depth: 1, store: shore, c: 5, r: 0, z: 1 }) === TEX.GRASS_FOOT_SAND,
    'grass on dirt with sand under north neighbor: north foot = sand',
  );
  assert(
    resolveFace('grass', FACE.SOUTH, { depth: 1, store: shore, c: 5, r: 0, z: 1 }) === TEX.GRASS_BASE,
    'south face still dirt/default grass base (no sand that way)',
  );

  // Water under grass
  const onWater = new VoxelStore();
  onWater.set(6, 0, 0, 'water');
  onWater.set(6, 0, 1, 'grass');
  onWater.set(6, 0, 2, 'grass');
  assert(
    resolveFace('grass', FACE.NORTH, { depth: 1, store: onWater, c: 6, r: 0, z: 1 }) === TEX.GRASS_FOOT_WATER,
    'grass on water: foot = GRASS_FOOT_WATER',
  );
}

console.log('resolveFace — dungeon wall neighbor-aware feet');
{
  const onSand = new VoxelStore();
  onSand.set(0, 0, 0, 'sand');
  onSand.set(0, 0, 1, 'dungeon_wall');
  onSand.set(0, 0, 2, 'dungeon_wall');
  onSand.set(0, 0, 3, 'dungeon_wall');
  assert(
    resolveFace('dungeon_wall', FACE.NORTH, { depth: 2, store: onSand, c: 0, r: 0, z: 1 }) === TEX.WALL_FOOT_SAND,
    '3-high wall on sand: bottom side = WALL_FOOT_SAND',
  );
  assert(
    resolveFace('dungeon_wall', FACE.NORTH, { depth: 0, store: onSand, c: 0, r: 0, z: 3 }) === TEX.WALL_CAP,
    'wall top course still WALL_CAP',
  );

  const onMud = new VoxelStore();
  onMud.set(1, 0, 0, 'mud');
  onMud.set(1, 0, 1, 'dungeon_wall');
  onMud.set(1, 0, 2, 'dungeon_wall');
  assert(
    resolveFace('dungeon_wall', FACE.EAST, { depth: 1, store: onMud, c: 1, r: 0, z: 1 }) === TEX.WALL_FOOT_MUD,
    'wall on mud: WALL_FOOT_MUD',
  );

  const onStone = new VoxelStore();
  onStone.set(2, 0, 0, 'stone');
  onStone.set(2, 0, 1, 'dungeon_wall');
  onStone.set(2, 0, 2, 'dungeon_wall');
  assert(
    resolveFace('dungeon_wall', FACE.WEST, { depth: 1, store: onStone, c: 2, r: 0, z: 1 }) === TEX.WALL_FOOT_STONE,
    'wall on stone: WALL_FOOT_STONE',
  );

  // Thin wall variant shares the same foot map
  const thin = new VoxelStore();
  thin.set(3, 0, 0, 'grass');
  thin.set(3, 0, 1, 'dungeon_wall_thin:N');
  thin.set(3, 0, 2, 'dungeon_wall_thin:N');
  assert(
    resolveFace('dungeon_wall_thin', FACE.SOUTH, { depth: 1, store: thin, c: 3, r: 0, z: 1 }) === TEX.WALL_BASE,
    'thin wall on grass: default WALL_BASE (grass foot)',
  );
}

console.log('resolveFace — stone neighbor-aware feet');
{
  const onGrass = new VoxelStore();
  onGrass.set(0, 0, 0, 'grass');
  onGrass.set(0, 0, 1, 'stone');
  onGrass.set(0, 0, 2, 'stone');
  onGrass.set(0, 0, 3, 'stone');
  assert(
    resolveFace('stone', FACE.NORTH, { depth: 2, store: onGrass, c: 0, r: 0, z: 1 }) === TEX.STONE_FOOT_GRASS,
    '3-high stone on grass: bottom side = STONE_FOOT_GRASS',
  );
  assert(
    resolveFace('stone', FACE.NORTH, { depth: 0, store: onGrass, c: 0, r: 0, z: 3 }) === TEX.STONE,
    'stone top of stack still plain STONE',
  );

  const onSand = new VoxelStore();
  onSand.set(1, 0, 0, 'sand');
  onSand.set(1, 0, 1, 'stone');
  onSand.set(1, 0, 2, 'stone');
  assert(
    resolveFace('stone', FACE.EAST, { depth: 1, store: onSand, c: 1, r: 0, z: 1 }) === TEX.STONE_FOOT_SAND,
    'stone on sand: STONE_FOOT_SAND',
  );

  const onMud = new VoxelStore();
  onMud.set(2, 0, 0, 'mud');
  onMud.set(2, 0, 1, 'stone');
  onMud.set(2, 0, 2, 'stone');
  assert(
    resolveFace('stone', FACE.WEST, { depth: 1, store: onMud, c: 2, r: 0, z: 1 }) === TEX.STONE_FOOT_MUD,
    'stone on mud: STONE_FOOT_MUD',
  );

  const onWater = new VoxelStore();
  onWater.set(3, 0, 0, 'water');
  onWater.set(3, 0, 1, 'stone');
  onWater.set(3, 0, 2, 'stone');
  assert(
    resolveFace('stone', FACE.SOUTH, { depth: 1, store: onWater, c: 3, r: 0, z: 1 }) === TEX.STONE_FOOT_WATER,
    'stone on water: STONE_FOOT_WATER',
  );

  const lone = new VoxelStore();
  lone.set(4, 0, 0, 'grass');
  lone.set(4, 0, 1, 'stone');
  assert(
    resolveFace('stone', FACE.NORTH, { depth: 0, store: lone, c: 4, r: 0, z: 1 }) === TEX.STONE,
    '1-high stone keeps plain STONE (no foot override)',
  );
}

console.log('resolveFace — cliff grass foot only on bottom when connected to grass');
{
  // 3-high cliff on grass: bottom side → CLIFF_BASE (grass trim); mid/top → rock courses
  const onGrass = new VoxelStore();
  onGrass.set(0, 0, 0, 'grass');
  onGrass.set(0, 0, 1, 'cliff');
  onGrass.set(0, 0, 2, 'cliff');
  onGrass.set(0, 0, 3, 'cliff');
  assert(
    resolveFace('cliff', FACE.NORTH, { depth: 2, store: onGrass, c: 0, r: 0, z: 1 }) === TEX.CLIFF_BASE,
    'cliff bottom on grass → green grass foot (CLIFF_BASE)',
  );
  assert(
    resolveFace('cliff', FACE.NORTH, { depth: 1, store: onGrass, c: 0, r: 0, z: 2 }) === TEX.CLIFF_MID,
    'cliff mid course is pure rock (CLIFF_MID), no grass',
  );
  assert(
    resolveFace('cliff', FACE.NORTH, { depth: 0, store: onGrass, c: 0, r: 0, z: 3 }) === TEX.CLIFF_SIDE,
    'cliff top course is CLIFF_SIDE rock rim, no grass',
  );

  // Same stack on stone: bottom → stone foot / pure rock, never grass green
  const onStone = new VoxelStore();
  onStone.set(1, 0, 0, 'stone');
  onStone.set(1, 0, 1, 'cliff');
  onStone.set(1, 0, 2, 'cliff');
  assert(
    resolveFace('cliff', FACE.NORTH, { depth: 1, store: onStone, c: 1, r: 0, z: 1 }) === TEX.CLIFF_FOOT_STONE,
    'cliff bottom on stone → CLIFF_FOOT_STONE (no green)',
  );
  assert(
    resolveFace('cliff', FACE.NORTH, { depth: 1, store: onStone, c: 1, r: 0, z: 1 }) !== TEX.CLIFF_BASE,
    'cliff on stone never uses grass-foot CLIFF_BASE',
  );

  // Dirt under cliff: pure rock mid, not green grass foot
  const onDirt = new VoxelStore();
  onDirt.set(2, 0, 0, 'dirt');
  onDirt.set(2, 0, 1, 'cliff');
  onDirt.set(2, 0, 2, 'cliff');
  assert(
    resolveFace('cliff', FACE.NORTH, { depth: 1, store: onDirt, c: 2, r: 0, z: 1 }) === TEX.CLIFF_MID,
    'cliff bottom on dirt → CLIFF_MID rock (green only for grass)',
  );
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
  // Course array is [cap, mid, mid] — baked BASE removed; feet only via footByNeighbor.
  assert(resolveFace('dungeon_wall', FACE.NORTH, { depth: 0 }) === TEX.WALL_CAP, '3-stack depth0 = CAP');
  assert(resolveFace('dungeon_wall', FACE.NORTH, { depth: 1 }) === TEX.WALL_MID, '3-stack depth1 = MID');
  assert(resolveFace('dungeon_wall', FACE.NORTH, { depth: 2 }) === TEX.WALL_MID, '3-stack depth2 = MID (no baked foot in side[])');
  assert(resolveFace('dungeon_wall', FACE.NORTH, { depth: 3 }) === TEX.WALL_MID, '5-stack depth3 clamps to MID');
  assert(resolveFace('dungeon_wall', FACE.NORTH, { depth: 4 }) === TEX.WALL_MID, '5-stack depth4 clamps to MID');
  assert(resolveFace('dungeon_wall', FACE.TOP, { depth: 0 }) === TEX.WALL_TOP, 'lone block top = WALL_TOP (top-down cap, not a side-view crop)');
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

console.log('allocateTexSlot / resetCustomTexAllocation');
{
  resetCustomTexAllocation();
  const first = allocateTexSlot();
  const second = allocateTexSlot();
  assert(first === TEX_CUSTOM_START, 'first custom slot starts right after the reserved built-in/debug range');
  assert(second === first + 1, 'each call hands out the next sequential id');

  resetCustomTexAllocation();
  assert(allocateTexSlot() === TEX_CUSTOM_START, 'reset rewinds allocation back to the start');

  // Exhaust the atlas and confirm it throws a clear error instead of silently overflowing
  // into another texture's cell.
  resetCustomTexAllocation();
  const capacity = ATLAS_COLS * ATLAS_ROWS;
  let threw = false;
  try {
    for (let i = 0; i < capacity + 5; i++) allocateTexSlot();
  } catch {
    threw = true;
  }
  assert(threw, 'allocateTexSlot throws once the atlas is full rather than overflowing silently');
  resetCustomTexAllocation();
}

console.log('registerBlock');
{
  assert(BLOCKS.mossy_test_material === undefined, 'sanity: this test type does not pre-exist');
  const texId = allocateTexSlot();
  registerBlock('mossy_test_material', { all: texId, solid: true, opaque: true });
  assert(BLOCKS.mossy_test_material !== undefined, 'registerBlock adds the new type to the shared registry');
  assert(resolveFace('mossy_test_material', FACE.TOP) === texId, 'the newly registered type resolves faces immediately, no other code changes needed');

  // Replacing an existing custom type (material maker's "edit" flow) just overwrites it.
  const texId2 = allocateTexSlot();
  registerBlock('mossy_test_material', { all: texId2, solid: true, opaque: true });
  assert(resolveFace('mossy_test_material', FACE.TOP) === texId2, 'registering the same type again replaces the definition');
}

console.log('torch / torch_off — same toggle pattern as door / door_open');
{
  assert(BLOCKS.torch.light !== undefined, 'torch has a light field');
  assert(BLOCKS.torch_off.light === undefined, 'torch_off has no light field — emits nothing');
  assert(BLOCKS.torch_off.model === BLOCKS.torch.model, 'torch_off reuses the exact same physical stick model as torch');
  assert(MODELS[BLOCKS.torch_off.model] !== undefined, 'the shared model actually exists in MODELS');
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
