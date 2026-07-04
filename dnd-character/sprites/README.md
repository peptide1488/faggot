# Sprites (optional — the app works fine with none of this)

Drop a PNG here and it's picked up automatically the next time that character/monster/effect
renders in isometric view. Nothing is required — every unit keeps using its existing pixel-art
token until a matching file is present and loads successfully.

## Where files go
- `sprites/characters/<class-lowercased>.png` — e.g. `wizard.png`, `fighter.png`
- `sprites/monsters/<key>.png` — key matches the monster's `sprite` field in `MONSTER_PIX` (index.html), e.g. `goblin.png`, `skeleton.png`
- `sprites/effects/` — reserved for spell/attack effect sheets (not wired up yet)

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
`slime`/`goblin` — all from RPG Paper Maker's Basic Resources (user-owned license).
