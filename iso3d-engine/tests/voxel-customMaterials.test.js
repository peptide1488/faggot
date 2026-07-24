/**
 * Headless tests — run with: node tests/voxel-customMaterials.test.js
 */

// Minimal in-memory localStorage polyfill — Node has no global localStorage, and the
// persistence functions under test are written to gracefully no-op without one, but we
// want to actually exercise the save/load round-trip, not just confirm it doesn't crash.
const memoryStore = new Map();
global.localStorage = {
  getItem: (k) => (memoryStore.has(k) ? memoryStore.get(k) : null),
  setItem: (k, v) => memoryStore.set(k, String(v)),
  removeItem: (k) => memoryStore.delete(k),
};

import { BLOCKS, resolveFace, FACE } from '../src/voxel/blocks.js';
import {
  slugify,
  planMaterialLayout,
  buildMaterialDef,
  createCustomMaterial,
  deleteCustomMaterial,
  loadMaterialLibrary,
  saveMaterialLibrary,
  addToLibrary,
  removeFromLibrary,
} from '../src/voxel/customMaterials.js';

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

console.log('slugify');
{
  assert(slugify('Mossy Brick Wall') === 'mossy_brick_wall', 'spaces become underscores, lowercased');
  assert(slugify('  Lava!!  ') === 'lava', 'punctuation stripped, trimmed');
  let threw = false;
  try {
    slugify('!!!');
  } catch {
    threw = true;
  }
  assert(threw, 'a name with no letters/digits throws rather than producing an empty type id');
}

console.log('planMaterialLayout — cell index assignment, always 4 columns');
{
  const h1 = planMaterialLayout({ heightBlocks: 1 });
  assert(h1.topIdx === 0 && h1.sideIdx.length === 1 && h1.sideIdx[0] === 1, 'heightBlocks=1: top then one side cell');
  assert(h1.bottomIdx === 1, 'no custom bottom -> reuses the (only) side course cell, no extra cell reserved');
  assert(h1.cols === 4 && h1.rows === 1, 'small layouts still fit in one row of the fixed 4-column grid');

  const h2 = planMaterialLayout({ heightBlocks: 2, hasCustomBottom: true });
  assert(h2.sideIdx.length === 2, 'heightBlocks=2: two side cells');
  assert(h2.bottomIdx !== h2.sideIdx[1], 'hasCustomBottom reserves its OWN cell, distinct from the last side course');

  const h3 = planMaterialLayout({ heightBlocks: 3, hasAutotile: true });
  assert(h3.autotileIdx.length === 16, 'autotile reserves a 16-cell block');
  assert(h3.rows === Math.ceil(h3.totalCells / 4), 'row count derived from total cell count at 4 columns');

  let threw = false;
  try {
    planMaterialLayout({ heightBlocks: 4 });
  } catch {
    threw = true;
  }
  assert(threw, 'heightBlocks outside 1-3 is rejected');
}

console.log('buildMaterialDef — face values are {materialId,u0,v0,u1,v1} refs, not shared-atlas numbers');
{
  const layout = planMaterialLayout({ heightBlocks: 1 });
  const def = buildMaterialDef({ materialId: 'test_mat', layout, properties: {} });
  assert(typeof def.top === 'object' && def.top.materialId === 'test_mat', 'top is a ref tagged with this material\'s id');
  assert(typeof def.top.u0 === 'number' && def.top.u1 > def.top.u0, 'a real UV rect is computed');
  assert(def.side.materialId === 'test_mat', 'heightBlocks=1: side is a single ref (not an array), matching built-in scalar-side materials');
  assert(def.bottom.materialId === 'test_mat', 'bottom resolves to a ref too (defaults to the side course cell)');

  const h2 = planMaterialLayout({ heightBlocks: 2 });
  const def2 = buildMaterialDef({ materialId: 'test_mat2', layout: h2, properties: {} });
  assert(Array.isArray(def2.side) && def2.side.length === 2, 'heightBlocks=2: side is a 2-entry array of refs');

  const withAutotile = planMaterialLayout({ heightBlocks: 1, hasAutotile: true });
  const defAuto = buildMaterialDef({ materialId: 'test_auto', layout: withAutotile, properties: {} });
  assert(Array.isArray(defAuto.topAutotile) && defAuto.topAutotile.length === 16, 'a 16-entry topAutotile ref array is produced when the layout has one');
}

console.log('buildMaterialDef — properties: translucent/light promoted to top level, rest stay nested');
{
  const layout = planMaterialLayout({ heightBlocks: 1 });
  const def = buildMaterialDef({
    materialId: 'test_mat',
    layout,
    properties: { damage: 2, climbable: true },
  });
  assert(def.properties.damage === 2 && def.properties.climbable === true, 'gameplay properties stored verbatim');

  const lit = buildMaterialDef({
    materialId: 'test_mat',
    layout,
    properties: { translucent: true, light: { radius: 4, color: [1, 0, 0], intensity: 1 }, damage: 1 },
  });
  assert(lit.translucent === true, 'translucent is promoted to the TOP level (mesher/lighting read it there, not properties.translucent)');
  assert(lit.light && lit.light.radius === 4, 'light is promoted to the TOP level (same reason)');
  assert(lit.properties.damage === 1 && lit.properties.translucent === undefined && lit.properties.light === undefined, 'gameplay-only tags stay nested; translucent/light are not duplicated there');
}

console.log('buildMaterialDef — properties.gas: promoted to top level, forces solid:false/opaque:false/translucent:true');
{
  const layout = planMaterialLayout({ heightBlocks: 1 });
  const gasDef = buildMaterialDef({
    materialId: 'test_gas_mat',
    layout,
    properties: { gas: true, damage: 1 },
  });
  assert(gasDef.gas === true, 'gas is promoted to the TOP level (spread.js\'s isGasType reads BLOCKS[type].gas directly)');
  assert(gasDef.solid === false, 'a gas material is forced non-solid regardless of the base cube default (matches built-in fog)');
  assert(gasDef.opaque === false, 'a gas material is forced non-opaque, so it renders see-through like fog/water');
  assert(gasDef.translucent === true, 'a gas material is forced translucent too, even if the caller never separately set that flag');
  assert(gasDef.properties.damage === 1 && gasDef.properties.gas === undefined, 'gameplay-only tags stay nested; gas is not duplicated there');

  const nonGasDef = buildMaterialDef({ materialId: 'test_nongas_mat', layout, properties: { damage: 1 } });
  assert(nonGasDef.gas === undefined && nonGasDef.solid === true && nonGasDef.opaque === true, 'a material with no gas property keeps the ordinary solid/opaque cube defaults, unaffected');
}

console.log('buildMaterialDef — a gas material emits no top/side/bottom/shape/wedge/autotile at all, just gasFogColor/gasDensity');
{
  const gasDef = buildMaterialDef({
    materialId: 'test_volumetric_gas',
    layout: null, // no layout at all — a real gas material never builds one (see voxel.html's Material Maker gas branch)
    properties: { gas: true },
    shape: 'column_thin', // should be silently ignored for a gas material — no geometry to shape
    wedge: 'ramp', // same — should be ignored
    gasFogColor: [0.2, 0.8, 0.3],
    gasDensity: 0.6,
  });
  assert(gasDef.top === undefined && gasDef.side === undefined && gasDef.bottom === undefined, 'no top/side/bottom UV refs at all — a gas material has no texture-backed faces');
  assert(gasDef.shape === undefined && gasDef.wedge === undefined && gasDef.topAutotile === undefined, 'shape/wedge/autotile are all ignored for a gas material, even if passed in');
  assert(gasDef.gasFogColor[0] === 0.2 && gasDef.gasFogColor[1] === 0.8 && gasDef.gasFogColor[2] === 0.3, 'gasFogColor passes through onto the def, read directly by voxel.html\'s recomputeGasVolumes');
  assert(gasDef.gasDensity === 0.6, 'gasDensity passes through too');
}

console.log('createCustomMaterial — full round trip through the real registry');
{
  const layout = planMaterialLayout({ heightBlocks: 2 });
  const entry = createCustomMaterial({ name: 'Test Moss Brick', heightBlocks: 2, layout, properties: {} });
  assert(entry.id === 'test_moss_brick', 'slugified type id derived from the name');
  assert(BLOCKS.test_moss_brick !== undefined, 'createCustomMaterial registers the type into the live BLOCKS registry');
  const resolved = resolveFace('test_moss_brick', FACE.TOP);
  assert(resolved && resolved.materialId === 'test_moss_brick', 'the registered material resolves faces immediately, same resolveFace() every built-in uses');
  assert(entry.heightBlocks === 2, 'returned library entry carries height for persistence');

  deleteCustomMaterial('test_moss_brick');
  assert(BLOCKS.test_moss_brick === undefined, 'deleteCustomMaterial unregisters the type');
}

console.log('createCustomMaterial — optional shape (any material pairs with any SHAPES preset)');
{
  const layout = planMaterialLayout({ heightBlocks: 1 });
  const cubeEntry = createCustomMaterial({ name: 'Test Plain Stone', heightBlocks: 1, layout, properties: {} });
  assert(BLOCKS.test_plain_stone.shape === undefined, 'a material created without a shape has no def.shape (renders as a normal full cube)');
  deleteCustomMaterial('test_plain_stone');

  const shapedEntry = createCustomMaterial({ name: 'Test Fancy Column', heightBlocks: 1, layout, shape: 'column_thin', properties: {} });
  assert(BLOCKS.test_fancy_column.shape === 'column_thin', 'a shape name passed to createCustomMaterial lands on def.shape');
  assert(shapedEntry.shape === 'column_thin', 'the returned library entry also carries the shape (so it survives export/import/reload)');
  deleteCustomMaterial('test_fancy_column');

  const depthEntry = createCustomMaterial({
    name: 'Test Flared Column',
    heightBlocks: 1,
    layout,
    shape: ['column_cap', 'column_mid', 'column_base'],
    properties: {},
  });
  assert(Array.isArray(BLOCKS.test_flared_column.shape) && BLOCKS.test_flared_column.shape[2] === 'column_base', 'a depth-indexed shape array is stored as-is, same as depth-indexed side textures');
  deleteCustomMaterial('test_flared_column');
}

console.log('createCustomMaterial — optional wedge (mutually exclusive with shape, e.g. a ramp)');
{
  const layout = planMaterialLayout({ heightBlocks: 1 });
  const rampEntry = createCustomMaterial({ name: 'Test Ramp Stone', heightBlocks: 1, layout, wedge: 'ramp', properties: {} });
  assert(BLOCKS.test_ramp_stone.wedge === 'ramp', 'a wedge name passed to createCustomMaterial lands on def.wedge');
  assert(BLOCKS.test_ramp_stone.shape === undefined, 'def.shape stays unset when only a wedge is given');
  assert(rampEntry.wedge === 'ramp', 'the returned library entry also carries the wedge (so it survives export/import/reload)');
  deleteCustomMaterial('test_ramp_stone');
}

console.log('material library persistence (localStorage)');
{
  saveMaterialLibrary([]); // clean slate
  assert(loadMaterialLibrary().length === 0, 'starts empty');

  const lib1 = addToLibrary({ id: 'mat_a', name: 'Mat A' });
  assert(lib1.length === 1, 'addToLibrary appends a new entry');

  const lib2 = addToLibrary({ id: 'mat_b', name: 'Mat B' });
  assert(lib2.length === 2, 'a second distinct entry is appended, not replacing the first');

  const lib3 = addToLibrary({ id: 'mat_a', name: 'Mat A Renamed' });
  assert(lib3.length === 2, 'adding an entry with an existing id replaces it in place, not a duplicate');
  assert(lib3.find((e) => e.id === 'mat_a').name === 'Mat A Renamed', 'the replaced entry has the new data');

  const lib4 = removeFromLibrary('mat_a');
  assert(lib4.length === 1 && lib4[0].id === 'mat_b', 'removeFromLibrary drops only the targeted entry');

  assert(loadMaterialLibrary().length === 1, 'persistence survives a fresh load call (round-tripped through localStorage, not just in-memory)');
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
