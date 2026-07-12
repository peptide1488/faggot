/**
 * Headless tests — run with: node tests/voxel-customObjects.test.js
 */

const memoryStore = new Map();
global.localStorage = {
  getItem: (k) => (memoryStore.has(k) ? memoryStore.get(k) : null),
  setItem: (k, v) => memoryStore.set(k, String(v)),
  removeItem: (k) => memoryStore.delete(k),
};

import { BLOCKS, MODELS, TEX, resolveFace, FACE } from '../src/voxel/blocks.js';
import {
  resolveMaterialTexId,
  validateObjectSpec,
  resolveObjectBoxes,
  createCustomObject,
  deleteCustomObject,
  loadObjectLibrary,
  saveObjectLibrary,
  addObjectToLibrary,
  removeObjectFromLibrary,
} from '../src/voxel/customObjects.js';

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

console.log('resolveMaterialTexId — fallback order (all -> top -> side -> bottom)');
{
  assert(resolveMaterialTexId('planks') === TEX.PLANKS, 'a simple `all`-only material resolves directly');
  assert(resolveMaterialTexId('grass') === TEX.GRASS_TOP, 'a material with top/side/bottom prefers `top`');
  assert(resolveMaterialTexId('dungeon_wall') === resolveFace('dungeon_wall', FACE.TOP), 'dungeon_wall (top set) resolves via top, matching resolveFace');

  let threw = false;
  try {
    resolveMaterialTexId('not_a_real_material');
  } catch {
    threw = true;
  }
  assert(threw, 'an unknown material name throws a clear error');
}

console.log('validateObjectSpec');
{
  const good = {
    name: 'stool',
    boxes: [{ from: [0.3, 0.3, 0], to: [0.7, 0.7, 0.4], faces: { all: 'planks' } }],
  };
  assert(validateObjectSpec(good) === good, 'a well-formed spec passes through unchanged');

  const cases = [
    [{}, 'missing name'],
    [{ name: 'x' }, 'missing boxes'],
    [{ name: 'x', boxes: [] }, 'empty boxes array'],
    [{ name: 'x', boxes: [{ from: [0, 0, 0], to: [1, 1], faces: { all: 'planks' } }] }, 'to has wrong length'],
    [{ name: 'x', boxes: [{ from: [1, 0, 0], to: [0, 1, 1], faces: { all: 'planks' } }] }, 'from >= to on an axis'],
    [{ name: 'x', boxes: [{ from: [0, 0, 0], to: [1, 1, 1], faces: {} }] }, 'empty faces object'],
    [{ name: 'x', boxes: [{ from: [0, 0, 0], to: [1, 1, 1], faces: { sideways: 'planks' } }] }, 'unknown face key'],
  ];
  for (const [spec, label] of cases) {
    let threw = false;
    try {
      validateObjectSpec(spec);
    } catch {
      threw = true;
    }
    assert(threw, `rejects: ${label}`);
  }
}

console.log('resolveObjectBoxes');
{
  const spec = {
    name: 'stool',
    boxes: [
      { from: [0.3, 0.3, 0], to: [0.7, 0.7, 0.4], faces: { all: 'planks' } },
      { from: [0.35, 0.35, 0], to: [0.4, 0.4, 0.3], faces: { all: 'wood', top: 'stone' } },
    ],
  };
  const boxes = resolveObjectBoxes(spec);
  assert(boxes.length === 2, 'one resolved box per spec box');
  assert(boxes[0].faces.all === TEX.PLANKS, 'material name resolved to the correct atlas id');
  assert(boxes[1].faces.all === TEX.WOOD && boxes[1].faces.top === TEX.STONE, 'multiple face keys on one box each resolve independently');
  assert(boxes[0].from[0] === 0.3 && boxes[0].to[0] === 0.7, 'box coordinates are carried through unchanged');
}

console.log('createCustomObject / deleteCustomObject — full round trip through MODELS + BLOCKS');
{
  const spec = {
    name: 'Test Stool',
    boxes: [{ from: [0.3, 0.3, 0], to: [0.7, 0.7, 0.4], faces: { all: 'planks' } }],
  };
  const entry = createCustomObject(spec);
  assert(entry.id === 'test_stool', 'slugified id derived from the name');
  assert(Array.isArray(MODELS.test_stool) && MODELS.test_stool.length === 1, 'registers into the live MODELS registry');
  assert(BLOCKS.test_stool && BLOCKS.test_stool.model === 'test_stool', 'registers a model-shaped BLOCKS entry pointing at itself');
  assert(BLOCKS.test_stool.solid === false && BLOCKS.test_stool.opaque === false, 'furniture-style objects default to non-solid/non-opaque, matching built-in furniture');

  deleteCustomObject('test_stool');
  assert(BLOCKS.test_stool === undefined, 'deleteCustomObject removes the BLOCKS entry');
  assert(MODELS.test_stool === undefined, 'deleteCustomObject removes the MODELS entry');
}

console.log('createCustomObject — optional properties bag (HP/destructibility foundation)');
{
  const plain = createCustomObject({
    name: 'Plain Stool',
    boxes: [{ from: [0.3, 0.3, 0], to: [0.7, 0.7, 0.4], faces: { all: 'planks' } }],
  });
  assert(BLOCKS.plain_stool.properties === undefined, 'no properties given -> no properties key at all, not an empty object');
  deleteCustomObject('plain_stool');

  const tree = createCustomObject({
    name: 'Test Tree',
    boxes: [{ from: [0.3, 0.3, 0], to: [0.7, 0.7, 2], faces: { all: 'wood' } }],
    properties: { hp: 10, vulnerable: ['fire'], destroyedType: 'ash_pile' },
  });
  assert(BLOCKS.test_tree.properties.hp === 10, 'hp stored verbatim');
  assert(Array.isArray(BLOCKS.test_tree.properties.vulnerable) && BLOCKS.test_tree.properties.vulnerable[0] === 'fire', 'vulnerable list stored verbatim');
  assert(BLOCKS.test_tree.properties.destroyedType === 'ash_pile', 'destroyedType stored verbatim');
  deleteCustomObject('test_tree');

  const brazier = createCustomObject({
    name: 'Test Brazier',
    boxes: [{ from: [0.3, 0.3, 0], to: [0.7, 0.7, 0.4], faces: { all: 'stone' } }],
    properties: { light: { radius: 4, color: [1, 0.5, 0.1], intensity: 1.2 }, translucent: true, hp: 5 },
  });
  assert(BLOCKS.test_brazier.light && BLOCKS.test_brazier.light.radius === 4, 'light is promoted to the TOP level, so a custom object can genuinely emit light');
  assert(BLOCKS.test_brazier.translucent === true, 'translucent is promoted to the TOP level too');
  assert(BLOCKS.test_brazier.properties.hp === 5 && BLOCKS.test_brazier.properties.light === undefined, 'gameplay-only tags stay nested; light/translucent are not duplicated there');
  deleteCustomObject('test_brazier');

  let threw = false;
  try {
    validateObjectSpec({ name: 'x', boxes: [{ from: [0, 0, 0], to: [1, 1, 1], faces: { all: 'planks' } }], properties: 'not an object' });
  } catch {
    threw = true;
  }
  assert(threw, 'a non-object properties value is rejected');
}

console.log('object library persistence (localStorage) — separate key from materials');
{
  saveObjectLibrary([]);
  assert(loadObjectLibrary().length === 0, 'starts empty');
  addObjectToLibrary({ id: 'obj_a', name: 'Obj A' });
  const lib = addObjectToLibrary({ id: 'obj_b', name: 'Obj B' });
  assert(lib.length === 2, 'two distinct entries persisted');
  const after = removeObjectFromLibrary('obj_a');
  assert(after.length === 1 && after[0].id === 'obj_b', 'removal targets only the specified entry');
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
