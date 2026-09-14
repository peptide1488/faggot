# BOOMER SURVIVORS

Vampire-Survivors-style top-down (Stardew camera) pixel game: the Boomer on his John Deere mows
the HOA. Single file `index.html` + `sprites/`. Serve with `python serve.py` -> http://127.0.0.1:8766/
(no-store headers, same as chump-crossy). Version tag top-centre (`#ver`), bump it on every change.
`window.G_()` returns the live game state for probing.

## Asset pipeline (all local except the 9 OpenArt stills)

| step | script | notes |
|---|---|---|
| stills | `gen_assets.py` | Krea-2 turbo t2i on ComfyUI, magenta bg. Used for tiles/props/pickups/projectiles. The Boomer himself and bobo/zoomer came from OpenArt GPT Image 2.5 image2image (user's own side-view sprite as the style ref) because Krea does not hold the wojak look. |
| prep | `make_sheet.py prep raw/X.png` | key magenta, crop, pad to 512 square on flat magenta -> `raw/X_in.png` |
| loop | `gen_loop.py` | LTX 2.5 I2V, 97 f @ 24 fps, first frame pinned (strength 1.0) AND the same still pinned to the LAST frame with `LTXVAddGuide(frame_idx=-1)` = the VELVET VICE loop trick on native nodes (their custom nodes are not loaded and ComfyUI is never restarted by Claude). ~20 s per loop. |
| pick | `pick_loop.py` | renders N seeds and keeps the one whose sprite bbox drifts least from frame 0 (LTX loves to swing a front-facing mower to 3/4 view). Used for boomer_down (seed 9000) and boomer_side (9002). |
| sheet | `make_sheet.py sheet` | 8 frames evenly spaced, duplicate last frame excluded, key first THEN quantize the foreground on one shared 64-colour palette (quantizing with magenta in the strip tinted the red cap), nearest resize, horizontal strip + json |
| static | `make_static.py` | props/pickups/tiles -> `sprites/` + `manifest.json` |
| all | `build_all.py [--no-krea] [names]` | stills -> loops -> sheets |

Sheets: `boomer_{down,up,side}` 8x256, `bobo_*` / `zoomer_*` 8x128. Left = side flipped.
Raw stills in `raw/` (`_v1_topdown/` = the rejected birds-eye set, `_v2_krea_*` = Krea character
attempts). Loop frames live in `comywilly1/output/boomer_survivors/loop/<name>/`.

## Lessons
- "TOO top down": birds-eye was rejected, Stardew three-quarter is the camera.
- Prompt colour leaks: "red riding lawnmower" in the LOOP prompt turned the green mower red. The loop
  prompt must restate the still's colours.
- First-frame strength 0.7 (the pack default for pass 1) let LTX redraw the character; 1.0 holds it.
- Soyjak / Karen / Biden enemies exist only as Krea stills in `raw/_v2_krea_enemies` (not wired).

## v0.5.0 — playing cards
Enemies drop face-down cards (~1.8% per kill, scaled by luck). TAB / C opens the hand (max 5, game pauses).
1-5 plays, shift+1-5 discards. Played cards are permanent for the run (buff + catch), Jokers are one-shot.
Table: `CARDS` in index.html; `cards()` folds every played card into one modifier set read by `st()`, `wstat()`,
`lawn()`, `regrow()`, `spawn()` and `killEnemy()`. `maxHP()` = base max HP x card multiplier.
Sprites: pickups/projectiles are now the PixelLab packs in `raw/pl_items/` (cropped copies in `sprites/`).

## v0.5.4-5 — blades up/down, 64 px lawn
SPACE toggles `G.p.blades`. Down: mow, turf, deck aura, normal speed. Up: no mowing/deck damage, 1.9x speed.
Boomer art = user's 256 idle set (sprites/boomer8_*.png, untouched pixels) drawn at BOOMER_W=128 in-engine; zoom stays 2x.
Boomer y-sorts at p.y+14 (wheel line). Lawn draw supports a 64 px Wang strip (half-cell offset tiles keyed by the 4
surrounding logic cells) or the old 32 px strip, chosen by the strip height. raw/_wang_build.py builds the strip from
raw/pl_wang64/{meta.json,sheet.png}.
