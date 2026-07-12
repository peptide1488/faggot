/**
 * Pure logic for the "material maker" content tool (see CONTENT_TOOLS_PLAN.md): build a
 * BLOCKS-shaped definition from a user's material spec, and persist a library of custom
 * materials. Texture IMAGES are handled by the caller (file picker, canvas drawing —
 * browser-only); this module only deals in grid-index math and plain data, so the
 * shape-building/validation logic is fully node-testable without a DOM.
 *
 * Each material gets its OWN small texture/grid (its own "atlas") instead of sharing cells
 * in the engine's one global atlas — a pivot from the original shared-atlas-cell design
 * (see git history) because forcing every custom upload into a shared 32x32 cell fought with
 * "just upload a texture per face" and capped everything at one global 64-cell budget. The
 * renderer does one draw call per material in use (see voxel/renderer.js), so there's no
 * shared-capacity problem to solve here anymore — layout is just "how many cells does THIS
 * material need", always a 4-column grid, however many rows that takes.
 */

import { registerBlock, BLOCKS, computeGridUV } from './blocks.js';
import { makeLibrary } from './contentLibrary.js';

const library = makeLibrary('iso3d.customMaterials');

const GRID_COLS = 4;

/** "Mossy Brick Wall" -> "mossy_brick_wall". Collapses whitespace/punctuation to underscores. */
export function slugify(name) {
  const slug = String(name)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  if (!slug) throw new Error('material name must contain at least one letter or digit');
  return slug;
}

/**
 * Plan a material's own local grid: which cell index holds which face, and how big the grid
 * is. Cell order: top, then one per side course, then bottom (only if it needs its own cell —
 * see hasCustomBottom), then 16 autotile tiles (if any). Always 4 columns; rows = whatever
 * fits. Pure index math — no pixels, no images; the caller turns this into an actual canvas.
 */
export function planMaterialLayout({ heightBlocks, hasAutotile = false, hasCustomBottom = false }) {
  if (![1, 2, 3].includes(heightBlocks)) {
    throw new Error(`heightBlocks must be 1, 2, or 3 (got ${heightBlocks})`);
  }
  let next = 0;
  const topIdx = next++;
  const sideIdx = [];
  for (let i = 0; i < heightBlocks; i++) sideIdx.push(next++);
  // No distinct bottom image -> reuse the bottom-most side course's cell (matches the
  // pre-pivot default-bottom convention), no extra cell needed.
  const bottomIdx = hasCustomBottom ? next++ : sideIdx[sideIdx.length - 1];
  const autotileIdx = hasAutotile ? Array.from({ length: 16 }, () => next++) : null;
  const cols = GRID_COLS;
  const rows = Math.ceil(next / cols);
  return { topIdx, sideIdx, bottomIdx, autotileIdx, cols, rows, totalCells: next, hasCustomBottom };
}

/**
 * Build a BLOCKS-shaped face/side definition from a planned layout. Face values are
 * `{ materialId, u0, v0, u1, v1 }` refs (NOT plain numbers, unlike a built-in material's
 * shared-atlas texId) — the mesher/renderer branch on this shape to pick "which texture" at
 * draw time (see mesher.js resolveUV / renderer.js setMaterialAtlas).
 *
 * @param {object} spec
 * @param {string} spec.materialId
 * @param {object} spec.layout - from planMaterialLayout
 * @param {string|string[]} [spec.shape] - a SHAPES key (blocks.js) making this material render
 *   as non-cube geometry (column, pane, etc.) instead of a full cube — or an array for a shape
 *   that varies by depth-below-stack-top (see SHAPES.column_base/mid/cap). Independent of
 *   texture: the mesher resolves each shape box's face through this same material's top/side/
 *   bottom, so any material can pair with any shape. Not validated against SHAPES here (pure
 *   data module, no import of mesher/SHAPES) — an unknown shape name throws at mesh-build time.
 * @param {object} [spec.properties] - gameplay tags, stored verbatim (translucent/light are
 *   promoted to the top level of the def, since that's where the mesher/lighting code reads
 *   them — see BLOCKS.water/BLOCKS.torch in blocks.js for the shape they expect). Everything
 *   else (damage/slow/climbable/exit, and the destructibility fields below) is inert data —
 *   nothing here reads or acts on it, this only lays the foundation for Grimoire's rules
 *   engine to consume later, same boundary this whole file already keeps. Common shape for
 *   destructible blocks (not enforced, just documented — see customObjects.js's matching
 *   convention for objects/furniture):
 *     - `hp: number` — hit points; absent/null means indestructible (most built-ins).
 *     - `destroyedType: string` — a material/object id this becomes at 0 HP (a burnt wooden
 *       wall -> a charred/ash material), or a sentinel like 'none' for "just disappears".
 *     - `vulnerable` / `resistant` / `immune`: arrays of D&D 5e damage-type strings, matching
 *       Grimoire's own character damage-type vocabulary (e.g. a wooden material:
 *       `{ hp: 15, vulnerable: ['fire'] }`).
 */
// Only used to size computeGridUV's half-texel bleed-avoidance inset as a small, sane
// FRACTION of a cell (matching the built-in shared atlas's own 32px-cell inset ballpark) —
// NOT the material's real texture resolution, which lives in the canvas the caller builds
// and never needs to reach this module. NEAREST filtering means an exact real-pixel match
// isn't required for correctness, just a small nonzero margin so a sample can't land exactly
// on a cell boundary and read the neighboring cell. Passing the cell's actual edge length (1,
// in this module's cellPx=1 grid-fraction convention) here would make the inset consume the
// ENTIRE cell — a real bug caught by voxel-customMaterials.test.js's UV-rect assertion.
const UV_INSET_PSEUDO_CELL_PX = 64;

export function buildMaterialDef(spec) {
  const { materialId, layout, properties, shape } = spec;
  const uvFor = (index) => ({ materialId, ...computeGridUV(index, layout.cols, layout.rows, UV_INSET_PSEUDO_CELL_PX) });

  const def = {
    top: uvFor(layout.topIdx),
    side: layout.sideIdx.length === 1 ? uvFor(layout.sideIdx[0]) : layout.sideIdx.map(uvFor),
    bottom: uvFor(layout.bottomIdx),
    solid: true,
    opaque: true,
  };
  if (shape) def.shape = shape;
  if (layout.autotileIdx) def.topAutotile = layout.autotileIdx.map(uvFor);
  if (properties && Object.keys(properties).length) {
    const { translucent, light, ...gameplayOnly } = properties;
    if (translucent !== undefined) def.translucent = translucent;
    if (light !== undefined) def.light = light;
    if (Object.keys(gameplayOnly).length) def.properties = { ...gameplayOnly };
  }
  return def;
}

/** Register a fully-specified custom material (after its texture images have been drawn into
 * the material's own canvas by the caller, and that canvas uploaded to the renderer via
 * setMaterialAtlas) and return the library entry to persist. */
export function createCustomMaterial({ name, heightBlocks, layout, properties, shape }) {
  const materialId = slugify(name);
  const def = buildMaterialDef({ materialId, layout, properties, shape });
  registerBlock(materialId, def);
  return {
    id: materialId,
    name,
    heightBlocks,
    layout,
    shape,
    def,
    createdAt: Date.now(),
  };
}

/** Unregister a custom material's block type (see CONTENT_TOOLS_PLAN.md 3b — this does NOT
 * remove any already-placed instances from a map; they just stop rendering, same as any
 * block whose type has no registry entry). Does not free the material's GPU texture. */
export function deleteCustomMaterial(type) {
  delete BLOCKS[type];
}

// --- localStorage library (thin wrappers over the shared helper — see contentLibrary.js) ---

export const loadMaterialLibrary = library.load;
export const saveMaterialLibrary = library.save;
export const addToLibrary = library.add;
export const removeFromLibrary = library.remove;
