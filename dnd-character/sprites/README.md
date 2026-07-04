# Sprites (optional — the app works fine with none of this)

Drop a PNG here and it's picked up automatically the next time that character/monster/effect
renders in isometric view. Nothing is required — every unit keeps using its existing pixel-art
token until a matching file is present and loads successfully.

## Where files go
- `sprites/characters/<class-lowercased>.png` — e.g. `wizard.png`, `fighter.png`
- `sprites/monsters/<key>.png` — key matches the monster's `sprite` field in `MONSTER_PIX` (index.html), e.g. `goblin.png`, `skeleton.png`
- `sprites/effects/` — reserved for spell/attack effect sheets (not wired up yet)
- `sprites/tiles/<terrain-key>.png` — small (~12x12px) repeating texture swatches for terrain diamonds in iso view; wired directly in index.html CSS (`.mapgrid.iso .mcell.ter-<key>`), not through `SPRITE_MANIFEST`

## Sheet format
A grid of square frames: **4 columns × 4 rows**. Each row is a facing direction
(top→bottom: down, left, right, up by default — configurable per entry). Only column 0
(idle frame) is used right now; walk-cycle/attack/cast frame animation is not implemented yet.

This matches the "walk" character sheet convention used by RPG Maker / RPG Paper Maker —
if you own assets in that format, copy them in directly and rename to match the keys above.

## Wiring a file in
Add an entry to `SPRITE_MANIFEST` in index.html (search for that name):
```js
wizard:{file:'sprites/characters/wizard.png', cols:4, rows:4, dirOrder:SPRITE_DIR_ORDER}
```
If your sheet's rows are ordered differently, pass a custom `dirOrder`, e.g.
`['down','right','up','left']`.

Currently wired: `fighter` (knight), and monsters `skeleton`/`zombie`/`spider`/`ogre`/`demon`/
`slime`/`goblin`/`ghost`(fantom)/`wolf`(dog-black)/`human`(villager1) — all from RPG Paper
Maker's Basic Resources (user-owned license). Terrain tiles `grass`/`sand`/`stone`/`water`/
`wood`/`snow`/`ice`/`lava`/`wall`(brick)/`mud` are also real texture swatches from the same
pack's Autotiles/Walls sheets, small crops meant to tile (`background-repeat`), not full
autotile sheets. Other terrain keys (rubble, void, brush, fog, acid, caltrops, grease, web)
keep their original flat CSS-gradient look — no clean matching swatch found for those yet.

Only 1 of 13 classes (Fighter) has a sprite — the rest is a taste call on which named RPG
Paper Maker hero should represent which D&D class, left for the user to decide and wire in.
Use the exact-class picker in Random Hero Forge to reliably test a specific wired class/monster
combo rather than relying on random rolls.
