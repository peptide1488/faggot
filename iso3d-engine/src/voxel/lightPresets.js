/**
 * Light presets — named snapshots of the Sun/Ambient panel's full state (sun, ambient, bounce,
 * rim/glow, AO, fog, vertical fog), so a dialed-in look can be saved and reapplied later instead
 * of re-tuning every slider by hand. Deliberately just an id+name+plain state blob, no engine-
 * registry involvement at all (a light preset isn't a placeable block/object/decal type) — the
 * actual slider DOM read/write lives in voxel.html (browser-only), same boundary every other
 * content-maker module in this file keeps.
 */

import { slugify } from './customMaterials.js';
import { makeLibrary } from './contentLibrary.js';

/** Build a library entry from a name + a plain state object (voxel.html's
 * collectLightPresetState() output) — id is slugified from the name, same convention every
 * content type in this engine uses (materials/objects/decals). */
export function createLightPreset(name, state) {
  const id = slugify(name);
  return { id, name, state, createdAt: Date.now() };
}

// --- localStorage library (thin wrappers over the shared helper — see contentLibrary.js) ---

const library = makeLibrary('iso3d.lightPresets');
export const loadLightPresetLibrary = library.load;
export const saveLightPresetLibrary = library.save;
export const addLightPresetToLibrary = library.add;
export const removeLightPresetFromLibrary = library.remove;
