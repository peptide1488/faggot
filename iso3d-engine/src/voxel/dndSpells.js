/**
 * D&D 5e spell presets for the Spell Maker.
 *
 * Grid: 1 tile = 5 ft. Combat blasts use full PHB areas (damage_blocks doesn't flood the map
 * with fog). place_gas is ONLY for real clouds/hazards, and is deliberately SMALL:
 *   - spells.js clamps place_gas to r≤3, side≤3, height≤2 and flattens spheres/cubes
 *   - presets below stay well under those caps so casting Web ≠ painting half the sky green
 *
 * Condition spells that aren't physical fog (Faerie Fire, Hypnotic Pattern, Moonbeam,
 * Spirit Guardians) are NOT place_gas — they only make sense as creature effects in Grimoire.
 *
 * `phb` notes the rulebook area; engine fields may be smaller for gas volume.
 */
export const DND_SPELL_PRESETS = [
  // ─── Real clouds / floor hazards only (place_gas) ───
  // Cloudkill — PHB 20-ft sphere; engine: 15-ft low poison bank
  {
    name: 'Cloudkill', effect: 'place_gas', radius: 3, shape: 'cylinder', height: 2, material: 'gas',
    phb: '20-ft-radius sphere (engine: 15-ft, 10-ft-tall cloud bank)',
    fx: { theme: 'poison', projectile: true, pillars: 0, intensity: 0.85 },
  },
  // Stinking Cloud — same treatment
  {
    name: 'Stinking Cloud', effect: 'place_gas', radius: 3, shape: 'cylinder', height: 2, material: 'gas',
    phb: '20-ft-radius sphere (engine: 15-ft cloud bank)',
    fx: { theme: 'poison', projectile: true, pillars: 0, intensity: 0.7 },
  },
  // Sleet Storm — PHB 40-ft r / 20-ft tall; engine: 15-ft icy fog bank (not a stadium dome)
  {
    name: 'Sleet Storm', effect: 'place_gas', radius: 3, shape: 'cylinder', height: 2, material: 'fog',
    phb: '40-ft-radius, 20-ft-tall cylinder (engine: 15-ft, 10-ft bank)',
    fx: { theme: 'ice', projectile: false, pillars: 0, intensity: 0.85 },
  },
  // Insect Plague — compact swarm volume
  {
    name: 'Insect Plague', effect: 'place_gas', radius: 2, shape: 'cylinder', height: 2, material: 'gas',
    phb: '20-ft-radius sphere (engine: 10-ft swarm bank)',
    fx: { theme: 'swarm', projectile: true, pillars: 0, intensity: 0.8 },
  },
  // Web — floor web patch (not a 20-ft fog cube)
  {
    name: 'Web', effect: 'place_gas', radius: 2, side: 3, shape: 'square', material: 'fog',
    phb: '20-ft cube (engine: 15-ft ground square of webs)',
    fx: { theme: 'web', projectile: false, pillars: 0, intensity: 0.75 },
  },
  // Spike Growth — ground only
  {
    name: 'Spike Growth', effect: 'place_gas', radius: 3, shape: 'cylinder', height: 1, material: 'gas',
    phb: '20-ft radius ground (engine: 15-ft, 1 layer)',
    fx: { theme: 'spikes', projectile: false, pillars: 0, intensity: 0.7 },
  },
  // Entangle — ground vines
  {
    name: 'Entangle', effect: 'place_gas', radius: 2, side: 3, shape: 'square', material: 'gas',
    phb: '20-ft square (engine: 15-ft ground square)',
    fx: { theme: 'vines', projectile: false, pillars: 0, intensity: 0.8 },
  },
  // Grease — small floor patch (PHB 10-ft already modest)
  {
    name: 'Grease', effect: 'place_gas', radius: 1, side: 2, shape: 'square', material: 'fog',
    phb: '10-ft square',
    fx: { theme: 'grease', projectile: false, pillars: 0, intensity: 0.65 },
  },

  // Gust of Wind — clear gas along a line (not place)
  {
    name: 'Gust of Wind', effect: 'clear_gas', radius: 2, shape: 'line', length: 12, width: 2,
    phb: '60-ft line, 10 ft wide',
    fx: { theme: 'wind', projectile: false, pillars: 0, intensity: 0.9 },
  },

  // ─── Blasts (damage_blocks) — full PHB size OK; no fog fill ───
  {
    name: 'Fireball', effect: 'damage_blocks', radius: 4, shape: 'sphere',
    damage: [{ dice: '8d6', type: 'fire' }],
    phb: '20-ft-radius sphere, 8d6 fire',
    fx: { theme: 'fireball', hits: 3, hitGapMs: 100, pillars: 0, intensity: 1.5, projectile: true, projectileMs: 280 },
  },
  {
    name: 'Shatter', effect: 'damage_blocks', radius: 2, shape: 'sphere',
    damage: [{ dice: '3d8', type: 'thunder' }],
    phb: '10-ft-radius sphere, 3d8 thunder',
    fx: { theme: 'thunder', hits: 2, pillars: 0, intensity: 1.1 },
  },
  {
    name: 'Thunderwave', effect: 'damage_blocks', radius: 2, side: 3, shape: 'cube',
    damage: [{ dice: '2d8', type: 'thunder' }],
    phb: '15-ft cube, 2d8 thunder',
    fx: { theme: 'thunder', hits: 1, projectile: false, pillars: 0, intensity: 1.0 },
  },
  {
    name: 'Burning Hands', effect: 'damage_blocks', radius: 3, shape: 'cone', length: 3,
    damage: [{ dice: '3d6', type: 'fire' }],
    phb: '15-ft cone, 3d6 fire',
    fx: { theme: 'fire', hits: 1, projectile: false, pillars: 0, intensity: 1.1 },
  },
  {
    name: 'Cone of Cold', effect: 'damage_blocks', radius: 6, shape: 'cone', length: 12,
    damage: [{ dice: '8d8', type: 'cold' }],
    phb: '60-ft cone, 8d8 cold',
    fx: { theme: 'ice', hits: 2, projectile: false, pillars: 0, intensity: 1.15 },
  },
  {
    name: 'Lightning Bolt', effect: 'damage_blocks', radius: 1, shape: 'line', length: 20, width: 1,
    damage: [{ dice: '8d6', type: 'lightning' }],
    phb: '100-ft line, 5 ft wide, 8d6 lightning',
    fx: { theme: 'lightning', hits: 2, hitGapMs: 70, projectile: true, projectileMs: 140, pillars: 0, intensity: 1.25 },
  },
  {
    name: 'Ice Storm', effect: 'damage_blocks', radius: 4, shape: 'cylinder', height: 8,
    damage: [{ dice: '2d8', type: 'bludgeoning' }, { dice: '4d6', type: 'cold' }],
    phb: '20-ft-radius, 40-ft-high cylinder; 2d8 bludgeoning + 4d6 cold',
    fx: { theme: 'ice', hits: 3, pillars: 0, intensity: 1.2 },
  },
  {
    name: 'Sunburst', effect: 'damage_blocks', radius: 12, shape: 'sphere',
    damage: [{ dice: '12d6', type: 'radiant' }],
    phb: '60-ft-radius sphere, 12d6 radiant',
    fx: { theme: 'radiant', hits: 3, pillars: 6, intensity: 1.35 },
  },
  {
    name: 'Circle of Death', effect: 'damage_blocks', radius: 12, shape: 'sphere',
    damage: [{ dice: '8d6', type: 'necrotic' }],
    phb: '60-ft-radius sphere, 8d6 necrotic',
    fx: { theme: 'necrotic', hits: 3, pillars: 4, intensity: 1.25 },
  },
  {
    name: 'Flame Strike', effect: 'damage_blocks', radius: 2, shape: 'cylinder', height: 8,
    damage: [{ dice: '4d6', type: 'fire' }, { dice: '4d6', type: 'radiant' }],
    phb: '10-ft-radius, 40-ft-high cylinder; 4d6 fire + 4d6 radiant',
    fx: { theme: 'fire', hits: 2, pillars: 3, intensity: 1.2 },
  },
  {
    name: 'Meteor Swarm', effect: 'damage_blocks', radius: 8, shape: 'sphere',
    damage: [{ dice: '20d6', type: 'fire' }, { dice: '20d6', type: 'bludgeoning' }],
    phb: 'four 40-ft-radius spheres (cast places one sphere at aim)',
    fx: { theme: 'meteor', hits: 5, hitGapMs: 110, pillars: 4, intensity: 1.55, projectileMs: 420 },
  },
  {
    name: 'Sunbeam', effect: 'damage_blocks', radius: 1, shape: 'line', length: 12, width: 1,
    damage: [{ dice: '6d8', type: 'radiant' }],
    phb: '60-ft line, 5 ft wide, 6d8 radiant',
    fx: { theme: 'radiant', hits: 1, projectile: true, projectileMs: 180, pillars: 1, intensity: 1.1 },
  },
  {
    name: 'Disintegrate (utility clear)', effect: 'remove_blocks', radius: 1, side: 2, shape: 'cube',
    phb: '10-ft cube of objects (utility)',
    fx: { theme: 'disintegrate', hits: 1, projectile: true, pillars: 0, intensity: 1.0 },
  },
];
