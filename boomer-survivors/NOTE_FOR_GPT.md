# Note for GPT 5.6 Sol — BOOMER SURVIVORS handover

You are joining a project that Claude (Opus 5, Claude Code) has been building with Andrew. Same
machine, same folders, same harness. This note tells you where everything is and what has already
been decided so you do not redo or undo it. Read this, then `HANDOFF.md` in this folder, then start.

## The project in one paragraph
A Vampire-Survivors-style browser game. 2D pixel art, Stardew-style three-quarter top-down camera.
The Boomer (S&P-cap wojak, Andrew's memecoin mascot) rides a green John Deere mower around a
suburban lawn, mowing grass and killing bobo bears and zoomers with auto-firing weapons. Single
file game: `index.html`. Served locally by `python serve.py` -> http://localhost:8766/index.html
(reload after every edit; the version tag top-centre of the screen tells you which build is live).

## Where things live
```
C:\Users\andrew\Desktop\faggot\boomer-survivors\
  index.html          the whole game (v0.7.2). Data tables at the top: ACTIVE (weapons), PASSIVE,
                      CARDS, PROPS. Systems: wstat()/st()/lawn()/cards() resolve every stat.
  HANDOFF.md          full state + everything learned on 2026-09-14. READ IT.
  README.md           older notes per version.
  sprites/            what the game loads (all art at ONE pixel scale, see rules below)
  raw/                every source, backup and rejected asset. NOTHING generated is ever deleted.
  sfx/                CC0 sound effects + manifest.json + CREDITS.txt
  animate.py          still -> LTX 2.5 loop -> pixel sprite strip (the local animation pipeline)
  gen_loop.py / make_sheet.py / gen_pixel.py / gen_sprite_klein.py   the pieces behind it
  _patch_*.py         how index.html gets edited: small Python string-replace scripts + a
                      `node -e "new Function(script)"` syntax check. Keep doing it this way.
C:\Users\andrew\Documents\comywilly1\      ComfyUI (Andrew launches it; never start/kill it)
  models\loras\       PixelArt_Krea2_5x5_V1, pixel_4walk_small_flux2_klein_base_4b_v1,
                      PixelArt_UI_Icons_Illustrious_v1, 80s_manga_OchiYoshihiko_Anima_v1
  output\boomer_survivors\loop\<name>\   LTX frame folders (they ACCUMULATE across runs)
C:\Users\andrew\Desktop\faggot\comfyauto\KNOWLEDGE.md   measured facts about this box's ComfyUI
```
Git: the folder is committed on branch `iso3d-engine` of the `faggot` repo (local commits only,
not pushed). Last commit: "Boomer Survivors v0.7.2".

## Rules Andrew has set (do not relitigate)
1. ONE pixel scale everywhere: 1 art pixel = 1 world pixel, tile = 64 px. A 2-tile tree is 64x128.
   No mirroring sprites for directions (perspective is wrong). Enemies 96 px, Boomer art 256 drawn
   at 128, camera zoom 2x. He rejected zooming out to 1x and rejected the Boomer at 256 on screen.
2. NEVER filter, resample, or re-palette his own art. His 8-direction Boomer set
   (`sprites/boomer8_<dir>.png`) is byte-identical to what he made. He called a box-downscale
   "blurry" and said "DO NOT APPLY FILTERING OR FUCK WITH COLOR PALETTE".
3. Tall grass only, no flowers, mowed grass must not be neon. The 32 px Wang lawn with ragged
   dynamic corners is the bar. Hard tile transitions are unacceptable.
4. The old Krea dollar pickup stays (the PixelLab bill "looks horrible").
5. Never delete generated files. Park replaced assets under `raw/` and say where.
6. PixelLab: fine for items/cards/props, rejected for characters ("sucks ass, we need local
   solution"). Ask before spending PixelLab credits.
7. He is blunt and fast. Short answers, ship, show a screenshot or a compare image path.

## Where the art pipeline stands
- Boomer: his 256 PixelLab idle set, 8 directions, drawn with a tiny code bob. An LTX-animated
  8-frame version exists in `raw/b8_strips/` and was REJECTED ("sucks") — do not re-enable it.
- Enemies (bobo bear, zoomer wojak): 3 directions (down/up/side), 96 px, made by
  Krea-2 still -> LTX 2.5 loop -> `make_sheet.py --method kc` (k-centroid, crisp). Andrew wants them
  8-direction like the Boomer. He now has an OpenAI max plan and intends to make proper pixel-art
  stills for each direction himself. When he hands you those stills:
  `python animate.py bobo_<dir> path\to\still.png --size 96 --walk` per direction, then wire an
  8-direction enemy the way `drawBoomer`/`DIR8` work (currently `SHEETS`/`sheetDraw` are 3-dir).
  Real pixel-art stills in -> clean strips out. GPT-style illustrations with fake pixel edges
  re-pixelize soft (tested).
- Lawn: needs a better 64 px Wang set. PixelLab pro 64 px failed (holes, wrong corners), Krea-2
  image-to-image only smeared. The draw code already handles a 64 px strip (half-cell offset,
  keyed by the 4 surrounding cells) — build the strip with `raw/_wang_build.py` from a PixelLab-
  style `meta.json` + sheet, or hand-assemble 16 tiles in WANG_KEYS order (NW,NE,SW,SE; L=mowed).
- Klein 4B + pixel_4walk_small LoRA (`gen_sprite_klein.py`) makes perfect 32 px walk sheets and
  holds identity with `--ref`, but 32 px is too small for this game.

## Game systems already in (don't rebuild)
- Weapons: data-driven ACTIVE table (10 weapons, per-type unified stats, upgrade deltas).
- Passives incl. HOA PRESIDENT (lawn scaling) and CARD SHARK (hand slots).
- Turf: standing on mowed grass = home turf bonuses; live/lifetime mowed tiles scale damage/area/armor.
- Playing cards: enemies drop face-down cards (~0.4%/kill). DECK (max 10) vs HAND (3 slots, in
  play). Each card = buff + catch; jokers one-shot. TAB opens the menu; it also opens on pickup.
- Blades up/down on SPACE (up = 1.9x speed, no mowing/aura).
- 401K magnet radius ring, Shop Vac map-wide pull, DPS readout, VS-style HUD slots.
- Houses removed, PROP_DENSITY 0.55, lawn ornaments each do something when hit.

## Testing
Playwright MCP against localhost:8766. requestAnimationFrame stalls headless, so step the game
with `window.__step(1/60)` in page.evaluate; `window.G_()` returns the game state. Screenshots
land in `C:\Users\andrew\Desktop\faggot\` by default.

## Open items
- 8-direction enemies from Andrew's new stills (above). Then soyjak / karen / biden enemies.
- Better 64 px lawn.
- Deploy to GitHub Pages (never done for this game).
- Drive F thumbnail cache reset is pending his "go" (unrelated to the game).

— Claude, 2026-09-14
