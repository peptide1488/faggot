# BOOMER SURVIVORS — handoff 2026-09-14 (evening)

Game: `index.html` v0.7.1, served by `python serve.py` (port 8766) -> http://localhost:8766/index.html

## Live state
- Boomer: user's own 256 px 8-direction PixelLab idle set (`sprites/boomer8_<dir>.png`, pixels untouched, drawn at 128 via BOOMER_W). Small code bob only. LTX-animated strips were tried and REJECTED ("sucks") -> parked in `raw/b8_strips/` (loader falls back to the still when `sprites/b8_<dir>.png` is absent).
- Enemies: bobo + zoomer, 96 px LTX loop sheets (down/up/side). Re-run of the same pipeline in `raw/sheets96_new/` (has 2 glitches, not live). 64 px originals in `raw/sheets64_backup/`.
- Lawn: 32 px PixelLab Wang set (`sprites/wang_lawn.png`, backup `raw/pl_wang2/wang_lawn_strip32.png`). 64 px pro set was broken (holes, wrong corners) -> `raw/pl_wang64/`, unused. Draw code supports a 64 px strip automatically (half-cell offset) if a good one ever lands.
- Pickups/projectiles: PixelLab packs (`raw/pl_items/`), except the dollar which is the old Krea one (user preference).
- Cards: PixelLab card art (`raw/pl_cards/`), DECK/HAND menu (TAB), CARD SHARK passive, drop ~0.4%/kill.
- Blades up/down on SPACE. Houses removed. PROP_DENSITY 0.55. Zoom 2x.

## Pipelines (all local, ComfyUI on 127.0.0.1:8188, user launches it)
- `animate.py NAME still.png --size 96|128 [--walk] [--prompt ..]` : still -> LTX 2.5 loop -> palette-snapped strip in sprites/. Loop folders under comywilly1/output/boomer_survivors/loop/<name> ACCUMULATE runs; rebuild from the newest 49 frames (see raw/_resheet_b8.py).
- `gen_pixel.py` : Krea-2 turbo + PixelArt_Krea2_5x5 LoRA (t2i / i2i). i2i on the lawn sheet only smeared.
- `gen_sprite_klein.py` : Klein base 4B + pixel_4walk_small LoRA, 32 px characters (too small for this game).
- `make_sheet.py`, `gen_loop.py`, `make_static.py` (DON'T run make_static blindly: it would overwrite the PixelLab props from the old Krea raws).
- Rules: never resample/filter/palette-shift the user's own art. Real pixel-art stills in -> clean strips out; GPT illustrations re-pixelize soft.

## Next (user plan)
- User now has OpenAI max plan for stills: make 8-direction pixel-art stills for bobo (and zoomer/soyjak/karen/biden), hand paths here, run animate.py per direction at 96, wire 8-dir enemies like the Boomer.
- Lawn detail: needs a fresh good 64 px set (PixelLab pro failed, Krea i2i failed).
- Deploy to Pages not done. Drive F thumbnail-cache reset still pending user "go".

## What we learned today (2026-09-14)

### Art rules the user set (hard)
- ONE pixel scale for everything: 1 art px = 1 world px, TILE=64. A 2-tile tree is 64x128 art. No mirroring for directions (perspective is wrong).
- NEVER filter, resample or re-palette the user's own art ("DO NOT APPLY FILTERING OR FUCK WITH COLOR PALETTE"). His 256 Boomer set is used byte-for-byte; box-downscaling it to 128 read as "blurry", nearest decimation was rejected too. Draw it 1:1 or at an integer in-engine size and fix the CAMERA, not the art. He picked: art 256, drawn at 128, zoom 2x (zooming to 1x was "too far").
- Tall grass only, no flowers, mowed grass not neon. The old 32 px Wang set with ragged dynamic corners is the bar ("before they had dynamic corner tiles so there was never a hard transition").
- Keep the OLD Krea dollar sprite (the PixelLab bill "looks horrible").
- Enemies must be scaled to the Boomer: 96 px enemies vs 128 Boomer felt right.

### PixelLab
- Object packs (create_1_direction_object, size 64 -> 16 candidates, 32 -> 64) are fine for items/cards. Download via https://api.pixellab.ai/mcp/objects/<id>/download (backblaze 522s). Tileset PNG: https://api.pixellab.ai/mcp/tilesets/<id>/image?inline=true and /metadata.
- create_topdown_tileset mode="pro" at 64 px: took ~20 min, came back with cyan unpainted holes and corner art that did not match the corner labels -> unusable. Standard 32 px sets are the reliable ones.
- User verdict on PixelLab for characters: "sucks ass, we need local solution".

### Local pipelines (ComfyUI, 127.0.0.1:8188; comfy-mcp failed to connect this session, plain HTTP /prompt + /history works)
- LTX 2.5 loop (gen_loop.py / animate.py): 49 frames, first-frame strength 1.0, still pinned as last frame, 512 render -> make_sheet BOX + snap to the still's palette. Clean for REAL pixel-art stills (Boomer 8 dirs came out consistent, no drift). A 2048 GPT illustration with fake pixel edges came out soft. Prompt "no smoke": exhaust puffs render as grey blobs with stray coloured pixels. Loop output folders accumulate across runs -> always sheet from the newest 49 frames.
- User rejected the animated Boomer anyway ("sucks") and kept the still + code bob. Enemies re-animated the same way = same quality as before, with 2 glitches; kept the old sheets.
- Krea-2 turbo + PixelArt_Krea2_5x5 LoRA (gen_pixel.py): renders at 5x, BOX /5. Image-to-image on the lawn sheet at denoise 0.45 kept structure but only smeared (no new detail). Untested: t2i for fresh base textures.
- Flux.2 Klein base 4B + pixel_4walk_small LoRA (gen_sprite_klein.py): needs the qwen_3_4b text encoder (8B encoder -> "mat1 and mat2 shapes cannot be multiplied 512x12288 / 7680x3072"), 20 steps, k-centroid /4. Pixel-perfect 32 px sheets, holds identity with --ref through ReferenceLatent. Too small for this game.
- Downloaded to comywilly1/models/loras: PixelArt_Krea2_5x5_V1, pixel_4walk_small_flux2_klein_base_4b_v1, PixelArt_UI_Icons_Illustrious_v1 (no Illustrious checkpoint on disk), 80s_manga_OchiYoshihiko_Anima_v1.
- Anima 6-detailer workflow (Downloads/animaWorkflowWith6DetailerPassBody_v10.json): missing nodes CLIPNegPip, AnimaWildcardProcessor, MosaicCreator, rgthree Fast Groups Bypasser, KJ Set/GetNode; missing models silvermoonmixAnima_v23 (have v20), hdrVAEAnimaKrea2QWEN VAE, 2x-AnimeSharpV4_RCAN, anima-lllite patch, sam_vit_h, all ultralytics segm detectors.

### Game design decisions
- Playing cards: DECK (picked up, max 10) vs HAND (in play, 3 slots + CARD SHARK). Each card = buff + catch, jokers one-shot. Menu opens on pickup (the first version did nothing visible and confused him). Drop rate cut to ~0.4%/kill ("more rare").
- Blades up/down: SPACE, 1.9x speed with blades up, no mowing/aura.
- Depth sort the Boomer at his wheel line (p.y+14), not sprite centre.
- Less clutter: houses removed, PROP_DENSITY 0.55.

### Process
- Patch index.html with small Python scripts (_patch_*.py) + `node -e new Function(script)` syntax check; test in Playwright with window.__step(dt) because rAF stalls headless.
- Bash heredocs with certain quotes fail here; Write tool for scripts. Windows Python needs PYTHONIOENCODING=utf-8 for emoji-laden JSON.
- Never delete generated files: everything replaced today is parked under raw/ (boomer8_pl128_backup, boomer8_box128, b8_strips, sheets64_backup, sheets96_new, pl_wang64, pl_items, pl_cards).

### Addendum (same evening)
- "wojak enemies a little blurry" -> the BOX re-pixelization smeared outlines. make_sheet.py now has `--method kc`
  (k-centroid: dominant colour per block, integer-multiple pre-scale). Enemy sheets rebuilt with it from the ORIGINAL
  loop runs (first 97 frames of each folder) at 96/64 colours -> v0.7.2. animate.py uses kc by default now.
  Soft versions: raw/sheets96_backup. Crisp: raw/sheets96_kc.
