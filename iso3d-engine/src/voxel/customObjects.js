/**
 * Pure logic for custom 3D "objects" (furniture etc.) — the material maker's box-list
 * format, confirmed 2026-07-12 (see CONTENT_TOOLS_PLAN.md): a simple JSON file, an array of
 * axis-aligned boxes in unit-cube coordinates, each face referencing a material BY NAME
 * (resolved against the block registry at load time) rather than a raw atlas id, so object
 * files stay human-editable without needing to know atlas cell numbers. No DOM here — the
 * file picker/upload UI is the caller's job.
 */

import { BLOCKS, MODELS, registerBlock } from './blocks.js';
import { slugify } from './customMaterials.js';
import { makeLibrary } from './contentLibrary.js';

const library = makeLibrary('iso3d.customObjects');

const FACE_KEYS = new Set(['all', 'top', 'bottom', 'north', 'south', 'east', 'west', 'front', 'right', 'back', 'left']);

/**
 * Resolve a material name (referenced in an object's box face) to a single representative
 * atlas texture id. A material can have different textures per face (top vs side); an
 * object's box face just needs ONE flat texture, so this picks the most "whole material"
 * representative, in order: all -> top -> side (first course if it's a per-elevation array,
 * matching the same course-order convention as dungeon_wall/grass) -> bottom.
 */
export function resolveMaterialTexId(materialName) {
  const def = BLOCKS[materialName];
  if (!def) throw new Error(`unknown material: "${materialName}"`);
  if (def.all !== undefined) return def.all;
  if (def.top !== undefined) return def.top;
  if (def.side !== undefined) return Array.isArray(def.side) ? def.side[0] : def.side;
  if (def.bottom !== undefined) return def.bottom;
  throw new Error(`material "${materialName}" has no resolvable texture (no all/top/side/bottom)`);
}

/**
 * Validate a raw parsed object JSON. Throws with a clear, specific message on the first
 * problem found (not exhaustive — good enough for a file-picker error message, not a full
 * schema report).
 */
export function validateObjectSpec(spec) {
  if (!spec || typeof spec !== 'object') throw new Error('object spec must be a JSON object');
  if (!spec.name || typeof spec.name !== 'string') throw new Error('object spec needs a "name" string');
  if (!Array.isArray(spec.boxes) || spec.boxes.length === 0) {
    throw new Error('object spec needs a non-empty "boxes" array');
  }
  if (spec.properties !== undefined && (typeof spec.properties !== 'object' || spec.properties === null || Array.isArray(spec.properties))) {
    throw new Error('object spec "properties", if given, must be a plain object');
  }
  spec.boxes.forEach((box, i) => {
    if (!Array.isArray(box.from) || box.from.length !== 3) throw new Error(`box ${i}: "from" must be [x,y,z]`);
    if (!Array.isArray(box.to) || box.to.length !== 3) throw new Error(`box ${i}: "to" must be [x,y,z]`);
    for (let axis = 0; axis < 3; axis++) {
      if (!(box.from[axis] < box.to[axis])) {
        throw new Error(`box ${i}: "from" must be strictly less than "to" on every axis`);
      }
    }
    if (!box.faces || typeof box.faces !== 'object' || Object.keys(box.faces).length === 0) {
      throw new Error(`box ${i}: "faces" must be a non-empty object (at least { "all": "<material name>" })`);
    }
    for (const key of Object.keys(box.faces)) {
      if (!FACE_KEYS.has(key)) throw new Error(`box ${i}: unknown face key "${key}"`);
    }
  });
  return spec;
}

/** Turn a validated object spec's material-name faces into resolved texture ids — exactly
 * the shape MODELS entries already use (see blocks.js), so registering one needs zero new
 * mesher code. */
export function resolveObjectBoxes(spec) {
  return spec.boxes.map((box) => {
    const faces = {};
    for (const [key, materialName] of Object.entries(box.faces)) {
      faces[key] = resolveMaterialTexId(materialName);
    }
    return { from: [...box.from], to: [...box.to], faces };
  });
}

/**
 * Register a validated custom object as a placeable block type — model-shaped, same as
 * every built-in furniture piece (door/table/chair/torch). Returns the library entry to
 * persist. The ORIGINAL spec (material names, not resolved ids) is what gets saved/exported
 * — re-resolving at load time means a later edit to a referenced material's texture is
 * picked up automatically, instead of the object baking in a stale texture id forever.
 *
 * spec.properties (optional): gameplay tags. `translucent` and `light` are promoted to the
 * TOP level of the registered def (same as customMaterials.js buildMaterialDef) — that's
 * where the mesher/lighting code actually reads them (see BLOCKS.torch/BLOCKS.water in
 * blocks.js), so a custom "brazier" or "glowing crystal" OBJECT can genuinely emit light,
 * not just a material. Everything else lands on `BLOCKS[type].properties`, stored verbatim —
 * nothing here reads or acts on it, this only lays the foundation so Grimoire's rules engine
 * has somewhere to find it later. Common shape (not enforced, just documented):
 *   - `hp: number` — hit points; absent/null means indestructible.
 *   - `destroyedType: string` — a material/object id this becomes at 0 HP (a burnt tree ->
 *     an ash/charred-stump object, a smashed barrel -> nothing/rubble), or a sentinel like
 *     'none' for "just disappears". Not resolved/validated here — Grimoire's job once wired.
 *   - `vulnerable` / `resistant` / `immune`: arrays of D&D 5e damage-type strings (acid,
 *     bludgeoning, cold, fire, force, lightning, necrotic, piercing, poison, psychic,
 *     radiant, slashing, thunder) — matches Grimoire's own character damage-type vocabulary,
 *     so "a wooden object is vulnerable to fire" reads the same way a character's resistances
 *     do. e.g. a tree/wood object: `{ hp: 10, vulnerable: ['fire'], destroyedType: 'ash_pile' }`.
 */
export function createCustomObject(spec) {
  validateObjectSpec(spec);
  const type = slugify(spec.name);
  const boxes = resolveObjectBoxes(spec);
  MODELS[type] = boxes;
  const representativeTex = boxes[0].faces.all ?? Object.values(boxes[0].faces)[0];
  const def = { all: representativeTex, solid: false, opaque: false, model: type };
  if (spec.properties && Object.keys(spec.properties).length) {
    const { translucent, light, ...gameplayOnly } = spec.properties;
    if (translucent !== undefined) def.translucent = translucent;
    if (light !== undefined) def.light = light;
    if (Object.keys(gameplayOnly).length) def.properties = { ...gameplayOnly };
  }
  registerBlock(type, def);
  return { id: type, name: spec.name, spec, createdAt: Date.now() };
}

/** Unregister a custom object's block + model (see CONTENT_TOOLS_PLAN.md 3b — placed
 * instances just stop rendering, same as a deleted material). */
export function deleteCustomObject(type) {
  delete BLOCKS[type];
  delete MODELS[type];
}

// --- localStorage library (thin wrappers over the shared helper — see contentLibrary.js) ---

export const loadObjectLibrary = library.load;
export const saveObjectLibrary = library.save;
export const addObjectToLibrary = library.add;
export const removeObjectFromLibrary = library.remove;
