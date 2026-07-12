# Iso3D Engine (greenfield)

Isometric turn-based tactics on **WebGL2**, built from scratch.

**No build step. No CDN libraries.** ES modules + pure JS math.

## Run

```bash
cd iso3d-engine
npx --yes serve -p 5173
# open http://localhost:5173/
```

## Tests

```bash
node tests/math-and-rules.test.js
```

## Layout

```
index.html
src/
  math.js       mat4/vec3, camera, dice
  map.js        terrain, move cost, LOS
  renderer.js   WebGL2 tiles, units, HP bars, picking
  units.js      5E-ish archetypes + spells
  movement.js   move range, attack/heal options
  combat.js     d20 attacks, Fire Bolt, Cure Wounds
  turn.js       initiative
  game.js       tactics state machine + AI
  main.js       UI wiring + shortcuts
tests/
  math-and-rules.test.js
```

## Gameplay (v0.2)

**Party (4):** Aldric (Fighter), Nyx (Rogue + shortbow), Mirabel (Cleric + Cure Wounds), Quill (Wizard + Fire Bolt)

**Enemies (3):** 2 Goblins (melee + bow), 1 Orc (greataxe)

| Action | Key | Notes |
|--------|-----|--------|
| Move | `M` | Blue tiles; **mud costs 2** |
| Attack | `A` | Red tiles; melee, ranged, or Fire Bolt |
| Heal | `H` | Green tiles; Cure Wounds (2 uses) |
| Wait | `W` / Space | Skip remaining actions |
| Rotate | `R` | Camera 90° |
| New battle | `N` | Full reset |

- Initiative: d20 + DEX each round  
- Attack: d20 + ability + prof vs AC; weapon die + mod (crit = extra die)  
- Ranged / Fire Bolt need **line of sight** (tall brick walls block)  
- Win: all enemies down · Lose: party wiped  
- Enemy AI: move for shot/melee, then attack  

## Visuals

- Terrain colors (grass, sand, water, mud, dirt, brick) + elevation sides  
- Unit HP bars, team badge, gold ring on active unit  
- Move / attack / heal tile tints  

## Next ideas

- Opportunity attacks, cover bonus to AC  
- More spells / spell slots UI  
- Textures or better meshes  
- Map editor + save/load  
- Integration with Grimoire / dnd-character  
