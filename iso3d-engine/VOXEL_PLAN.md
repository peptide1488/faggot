# Voxel Terrain Rewrite — "Ultra Plan"

**Why:** Per-tile sprite/billboard/wang-tile attempts keep failing. FFT's actual technique is
UV-mapped 3D geometry + 2D sprites. Minecraft-style blocks give us that with the simplest
possible authoring model: blocks with per-face textures.

**Decisions (locked 2026-07-12):**
- **True voxels** — sparse 3D block grid, not heightmap columns. Overhangs/bridges/multi-floor
  interiors become possible. Grimoire maps convert one-way into voxel columns.
- **Build in `iso3d-engine` standalone first**, vendor to `dnd-character/iso3d` when it looks right.
- **No slopes in v1** — clean stepped cubes only; ramps later.

---

## Data model

```js
// map format v2
{
  cols, rows, levels,          // bounds (e.g. 32 x 32 x 8)
  blocks: { "c,r,z": "grass" } // sparse; absent = air
}
```

- Block registry `BLOCKS` — per type, faces resolve by **most-specific-wins fallback**:
  `all` → `side` (covers N/E/S/W) → explicit `top / bottom / north / south / east / west`.
  So simple blocks are one line (`stone: { all: STONE }`), and special blocks stay easy:
  - `grass: { top: GRASS, side: GRASS_DIRT, bottom: DIRT }`
  - `shelf: { front: BOOKS, all: WOOD }` — front face books, every other face wood.
  - **Per-elevation sides**: any side entry may be an ARRAY, indexed by how far the block
    sits below the top of its same-type vertical stack, clamping on the last entry:
    `dungeon_wall: { top: WALL_TOP, side: [WALL_CAP, WALL_MID, WALL_BASE] }` — a 3-stack
    shows cap/mid/base courses; a 5-stack shows cap/mid/base/base/base; a lone block just
    the cap. Single value = same texture at every height (most materials).
  - **Edge autotiling via corner-Wang (same mechanism, horizontal)**: a `top` entry may
    instead declare a 16-tile corner-Wang set. Each top face computes 4 corner values
    (corner = same-material test on the 2 adjacent + 1 diagonal neighbors around it) and
    that 4-bit code indexes the set — grass plateaus get worn rims at drops/material
    changes, dungeon floors get border trim. Texture source: PixelLab's Wang tileset maker
    (`create_topdown_tileset`, `mode: "pro"`, 64px, `transition_size: 0` so boundaries stay
    flat — our geometry supplies real ledges) generates all 16 combinations per material
    pair in one consistent batch; slice into atlas cells at import. Caveat to verify: its
    flattest view is "high top-down" (~15% baked depth) — check one batch on an actual cube
    top before committing. The mesher already reads neighbors for culling, so the corner
    mask is free. Purely cosmetic, per-material opt-in like the elevation arrays. Ship in
    Step 8 (real textures), not V1 placeholders.
  Directional blocks like the shelf store a facing (`"shelf:S"` in the block value); blocks
  without one never pay for it. Flags per type: `{ solid, opaque, translucent }`.
- **Slabs**: most materials also place as a half-height block. Stored as a shape suffix in
  the block value (`"stone#slab"`, combinable with facing: `"shelf:S#slab"`), no separate
  registry entry — the mesher scales the geometry and side-face UVs to half height. Culling
  rule stays simple: only a full opaque cube occludes a neighbor's face; slabs occlude
  nothing (tiny overdraw, zero correctness bugs). Slab tops are standable at z + 0.5, giving
  FFT-style half-step elevation (and stair-substitutes) without slope geometry.
- **Non-cube blocks (Minecraft-style models)**: a block type may declare a `model` — a list
  of textured boxes in unit-cube coordinates (`{ from:[x,y,z], to:[x,y,z], faces }`), exactly
  Minecraft's resource-pack idea. Cube and slab are just the trivial one-box models, so the
  mesher has ONE path: emit boxes. This is how doors and furniture work:
  - `door`: one thin box (e.g. 1×0.125×2 blocks tall — occupies the cell, hinged at an edge),
    facing-rotated; `door_open` = same box rotated 90° around the hinge. Replaces the
    billboard/6-angle-sprite door hacks for good.
  - `table`: top slab box + 4 leg boxes; `chair`: seat + back + legs; `shelf`: full cube with
    the books face. Add more furniture by writing a model, no mesher changes.
  - `window` / `glass pane`: thin vertical box like the door (translucent glass texture,
    facing-rotated to sit in either wall axis) — blocks movement, passes light/sight.
  - Model blocks occlude nothing (same rule as slabs); solidity/walkability comes from their
    registry flags, not their geometry.
- **The "stacked grass" rule is automatic**: a buried block's top face is culled (solid
  neighbor above), so only its dirt sides show — no data munging needed.
- **Minecraft-style strata**: maps are built as bedrock (bottom layer, indestructible in
  editor) → stone → dirt (or sand) → surface block. Under water: sand or stone, never grass.
  The converter from old maps/Grimoire dicts fills columns with these strata instead of
  all-dirt.
- **Water is a full block type**, translucent flag set: rendered in a second pass, side and
  top faces visible through each other, and face culling treats water↔water as internal
  (no faces between two water blocks) but water↔air and water↔solid as exposed.

## Rendering

- One texture atlas PNG — **placeholder first**: generated 8×8 grid of flat colors with a
  1px darker border per cell (so face boundaries and UV bugs are visible immediately); swap
  in real pixel-art textures later without touching the mesher. Nearest-neighbor, no mips
  (or careful padding to stop bleed).
- Mesher: walk sparse blocks, emit a quad per face **only where the neighbor is air/translucent**
  (face culling). Interleaved buffer: position + atlas UV + per-face shade
  (top 1.0 / south-east ~0.8 / north-west ~0.65 — fake directional light, classic MC look).
- Map sizes are tiny (≤ 32×32×8 ≈ 8k blocks) — naive per-face emit is fine, **no greedy
  meshing, no chunks**. Rebuild whole mesh on edit (already how it works).
- Water: second translucent pass, top face slightly lowered.
- **Lighting — IMPLEMENTED 2026-07-12**: `src/voxel/lighting.js` is `dnd-character/iso3d/src/lighting.js`
  ported verbatim (pure functions, no DOM/GL — do not fork the propagation math) plus one
  addition, `tileLightRGB(profile, col, row)`, which returns actual `[r,g,b]` instead of just
  a 0-2 bucket, so torches/spells genuinely tint geometry, not just brighten it. `buildMesh(store,
  { lightProfile })` (from `resolveLighting()`) is optional — omit it and everything renders
  neutral white, exactly the pre-lighting behavior (verified by test + screenshot, no
  regression). Per-vertex final color = faceShade × AO × lightColor, baked at mesh-build time
  (rebuild-on-change, same as always). This required changing the mesh buffer's shade
  attribute from a scalar `shades[]` to an RGB `colors[]` (renderer.js: `aShade float` →
  `aTint vec3`) — if you're grepping for the old name, it's gone, not renamed elsewhere.
  Verified live with a torch in `tools/voxel_castle_check.html`. Billboards/units still take
  a flat `lightColor` (default white) via `buildBoxMesh`, not yet auto-sampled from the
  profile at the unit's position — worth doing when sprite billboards are built (Phase C).
  **Not yet done**: light doesn't respect walls/LoS (matches the 2D system's own
  simplification, not a regression), and real shadow casting (separate from this) is still
  the next queued lighting task per user direction 2026-07-12.
- **2D billboard decor stays**: trees/bushes/torches remain camera-facing sprites standing on
  the voxel surface — same overlay pipeline as today. Voxels replace *terrain and structure*
  (walls, doors, furniture), not organic decor.

## Picking

- Replace ground-plane math picking with **DDA voxel raycast** (Amanatides & Woo): returns
  `{block, face}` — exactly what the editor needs (click face = place adjacent, alt-click =
  remove, paint = retype). Unit/tile selection = topmost solid block in the column hit.

## Gameplay derivation (rules stay in Grimoire)

- Pathfinding/walkability derived per column: standable = solid block with ≥2 air above.
  v1: single surface per column (topmost) — matches current Dijkstra. Multi-level walkable
  (under bridges) later.
- Elevation for climb costs = block z. 1 block = 1 height level = existing `LEVEL`.

## Implementation plan

**Strategy: build fresh, don't mutate.** The existing `renderer.js` is battle-scarred
(vertex-color mesh, no UVs — the shader itself is wrong for this). New `src/voxel/` modules
+ a separate `voxel.html` test page, so the old demo keeps working until the voxel path
fully replaces it. Reuse only `math.js` (mat4/camera — proven). Every non-GL module is a
**pure function** with a node test; every visual step ends with a screenshot check before
moving on (lesson already learned in iso-preview.js: look at pixels before shipping).

### Step 1 — `voxel/blocks.js` (registry + atlas)
- `BLOCKS` registry, face-resolution fallback (`all`→`side`→explicit), flags.
- `parseBlock("shelf:S#slab")` → `{ type, facing, slab }`.
- **Placeholder atlas generated at runtime on a canvas** (flat color + 1px darker border
  per cell) — no PNG file to manage; swapping in a real PNG later is a one-line change.
- Test: face resolution table (grass sides, shelf front vs back, slab passthrough).

### Step 2 — `voxel/store.js` (data)
- Sparse `Map` "c,r,z" → block string; get/set/delete, bounds, JSON in/out.
- `genStrata(cols,rows,heightFn,surfaceFn)` — bedrock → stone → dirt/sand → surface;
  sand/stone under water, never grass.
- Converter from old `cells[{h,type}]` maps and Grimoire tile dicts.
- Test: strata layering, converter on the existing demo map, round-trip serialize.

### Step 3 — `voxel/mesher.js` (pure geometry)
- Input: store + registry + light map → output `{ opaque: {pos,uv,shade,idx}, translucent: {...} }`.
- **One geometry path: emit textured boxes.** Cube = one full box, slab = one half box,
  door/window/table/chair = the type's model box list, facing-rotated around the cell center.
- Face culling (only full opaque cubes occlude; slabs/models/water don't; water↔water internal).
- Per-face shade constants × per-column light level baked into the shade attribute.
- Test (this is where the bugs will live, so test hardest): face counts for known configs —
  lone cube = 6, two stacked = 10, buried block = 0, slab on cube, water pool faces, door
  model box count, facing rotation of a shelf's books face, per-elevation side selection
  (3-stack dungeon wall = cap/mid/base, 5-stack clamps to base, lone block = cap).

### Step 4 — `voxel/renderer.js` (WebGL2) + `voxel.html`
- One program: position + uv + shade attribute; atlas texture, nearest-neighbor.
- Opaque pass, then translucent pass (depth-test on, depth-write off, back-to-front).
- Camera/controls reused from math.js + existing input handling patterns.
- **Checkpoint: screenshot of the converted demo map as blocks.** Grass-top/dirt-side must
  read correctly, water translucent, no z-fighting, no UV bleed.

### Step 5 — `voxel/pick.js` (DDA raycast)
- Unproject mouse → ray; Amanatides & Woo step through the grid → `{ c, r, z, face }`.
- Slab-aware hit (half-box test inside the cell).
- Test: axis-aligned rays, diagonal rays, slab hits, miss = null.

### Step 6 — Editor (in voxel.html)
- Block palette UI (all registry types + slab toggle), click face = place adjacent,
  alt-click = remove (bedrock immune), paint mode = retype in place.
- **Rotate button** (hotkey R): cycles the pending block's facing N→E→S→W before placing;
  placed directional blocks (door/shelf/window) can also be rotated in place by clicking
  them in rotate mode.
- Undo stack (inverse ops), JSON save/load buttons.
- **Checkpoint: build a small castle-ish structure by hand — walls, door, windows,
  furniture inside — save/reload it.**

### Step 7 — Units + gameplay surface
- `voxel/surface.js`: per column, standable spots = solid top with ≥2 air above (slab tops
  at z+0.5). Output feeds the **existing** pathfinding.js unchanged (elevation = z).
- Billboard sprites standing on surface; port unit rendering/movement from old renderer.
- **Checkpoint: knight walks around the voxel map, up steps, onto slabs.**

### Step 8 — Pretty + integrate
- Real atlas PNG via **PixelLab `create_tiles_pro`** — **VERIFIED WORKING 2026-07-12**
  (test outputs in scratchpad `tex_test/`; regenerate with the recipe below):
  - Top/side 1×1 faces: `tile_type: "square_topdown"`, `tile_view: "top-down"` (no depth),
    `tile_size: 32`, `outline_mode: "segmentation"`. Test batch (seed 42, numbered prompt
    "seamless flat texture fills viewed directly from above, no perspective, no objects,
    edge-to-edge material texture: 1). green grass texture 2). brown dirt …") returned 16
    genuinely flat, MC-quality faces. Grass/dirt/sand tile seamlessly; some stone variants
    have a baked border/vignette (reads as intentional slab, but check each tile 3×3-tiled
    before accepting).
  - Tall sides (1 wide × 2–3 blocks): same + `tile_height: 96` → verified 32×96 dungeon
    walls with cap course / weathered middle / mossy foundation — exactly the per-elevation
    side arrays. Caveat: some variants contain transparent "damage" holes — atlas import
    must fill holes from neighboring pixels (cube faces must be opaque).
  - Batch all materials in ONE numbered prompt with a fixed `seed` — NO style/reference
    images (house rule). Retrieve with `get_tiles_pro` (async; real ETA ~5-8 min, not the
    advertised 30s).
  - Wang autotile source (`create_topdown_tileset` pro 64px, `transition_size: 0`) also
    verified: dirt→grass set generated fine; boundary reads organic. Slice per corner-code
    at import.
  - Fallback: procedural faces (noise + palette per material via canvas script).
  **Do NOT use Kenney assets anywhere in this project.** PixelLab's sprite tools remain for
  characters/animations/billboard decor only.
- AO-ish bottom-edge darkening if cheap.
- Combat sandbox / fx ported over; old renderer path deleted once parity confirmed.
- Vendor to `dnd-character/iso3d`, Grimoire adapter emits voxels, 🕹 3D toggle, version bump.

### Step 9 — Cleanup (leftover assets + dead code)

Two waves — **never delete anything the live Pages app still references** (dnd-character is
deployed; sw.js caches assets):

**Wave 1 — safe now (nothing references these; separate commit before voxel work):**
- `iso3d/` at repo ROOT (abandoned aider/qwen overnight experiment): logs, screenshots,
  `pandoc-*.msi`, `run_*.sh`, `think_strip_proxy.py`, `last_response.json`, old
  `renderer3d.js` etc. Delete the whole folder.
- `dnd-character/tools/iso2d_kenney_test/` — Kenney assets are banned from this project;
  delete entirely. Also `dnd-character/tools/iso2d_test/` (superseded experiment).
- `random assets/`, `nig/` — not app code; move out of the repo or .gitignore (ask user).
- Commit the current uncommitted door-quad work first as a checkpoint (it ships v120.90),
  THEN delete — keep history clean.

**Wave 2 — after voxel parity (Step 8 done, old path deleted):**
- `dnd-character/sprites/decor/door*.png` (all 7 rotation-hack sprites) — replaced by voxel
  door models.
- `dnd-character/sprites/hq/terrain/` + `sprites/hq/terrain/wang/` — replaced by the voxel
  atlas. The RPGMaker-paper-style terrain/decor sprites that voxel structure replaces go
  too; **keep** `sprites/characters|monsters|rpm` walk sheets (billboard units still use
  them) and organic decor (trees/bushes) that remain billboards.
- `dnd-character/tools/door-rot-test.html` — tested the dead billboard-door path.
- `iso3d-engine/src/renderer.js`, `map.js` old mesh path, and the vendored old copies under
  `dnd-character/iso3d/` — replaced by `src/voxel/*`.
- Purge deleted assets from `sw.js` ASSETS list + bump CACHE.

**Order matters:** 1→2→3 are pure node-testable modules with no GL — get them green before
any pixel work. Step 4 is the first visual moment; if it looks wrong, the bug is provably
in a tested module or the 100-line renderer, nowhere else.

**Out of scope v1:** slopes/ramps, greedy meshing, chunking, infinite maps, lighting
propagation, per-block metadata beyond facing+slab.

---

## Pitfalls & optimizations (read before coding)

1. **Declare the axis convention ONCE, at the top of `voxel/blocks.js`, and never restate it
   differently anywhere**: `c` = +x east, `r` = +y south, `z` = up; 1 block = 1 world unit;
   facing order N,E,S,W = 0,1,2,3. Half the bugs in the old renderer (the entire door-rotation
   saga) were axis/rotation disagreements between files.
2. **Enable `gl.CULL_FACE` from day one** with consistent CCW winding. If a box is wound
   wrong you want to see it immediately as a missing face, not have backface-off hide it
   until some later z-fighting mystery.
3. **Z-fighting by design, not by luck**: model boxes (doors, panes, furniture) must never be
   exactly coplanar with a cube face — inset them 0.01 from cell boundaries in the model
   definitions themselves. Slab sides ARE flush with cube sides but never coexist in the same
   plane pixel (different cells), so they're fine.
4. **Half-texel UV inset** into each atlas cell to stop bleed — do it in the one function that
   converts atlas index → UV rect, so it's fixed everywhere forever. Per-elevation side
   arrays stay simple in the atlas: each entry is its own ordinary square cell (a PixelLab
   tall 1×3 texture just gets sliced into 3 cells at import) — the mesher picks the cell by
   depth-below-stack-top, no multi-row UV math needed.
5. **Render billboards (units, trees) as in-scene GL quads with alpha-test**
   (`discard` at α < 0.5), not on the 2D overlay canvas. Depth-testing against the voxel
   mesh then gives *correct occlusion by walls for free* — no painter's sort, no "grace
   bonus" hacks like the 2D prototype needed. Overlay canvas stays only for pure UI
   (floaters, HP bars, highlights).
6. **Translucent pass sorting**: counts are tiny — collect water/glass quads with a center
   point, sort back-to-front by camera distance each frame (or on rotation change only).
   Draw after all opaque + billboard passes, depth-write off.
7. **Editor raycast needs a water-skip**: default pick ignores translucent blocks (so you can
   click the sand under a pond); holding the palette on water/glass targets them. Return the
   *first* hit of each kind from one ray walk — don't cast twice.
8. **Rebuild hygiene**: debounce mesh rebuild during drag-paint (once per frame max), and
   reuse the same growable typed arrays between rebuilds instead of reallocating — the win
   is GC pauses, not build speed.
9. **Ghost preview**: draw the pending block translucent at the raycast target before
   placing. Cheap (it's one box through the same mesher path) and it makes the editor feel
   10× better; also instantly reveals facing/rotation bugs.
10. **Version-tag the save format** (`{ v: 2, ... }`) and refuse/convert on mismatch — the
    old `cells` format will still be floating around in localStorage and saved JSONs.
11. **Automate the screenshot checkpoints**: a `tools/voxel-shot.mjs` (headless Chrome via
    Playwright or `chrome --headless --screenshot`) that loads `voxel.html?map=demo` and
    saves a PNG — one command, no manual browser dance, and the checkpoint discipline
    actually gets followed.
12. **Optional vertex AO** (Step 8): classic Minecraft 3-neighbor corner darkening is ~30
    lines in the mesher; if added, flip the quad diagonal toward the darker pair (the
    standard anisotropy fix) or corners look smeared.
13. **Known accepted artifact, observed in the Step 7 checkpoint screenshot**: a slab
    stacked directly on a full cube of the same footprint (e.g. `grass` at z then `stone#slab`
    at z+1, no gap) puts the cube's top face and the slab's bottom face exactly coplanar —
    both get emitted (slabs never occlude, are never occluded), which is the tiny-overdraw
    tradeoff the plan already signed off on. Didn't visibly misrender in testing, but if it
    ever does (flicker across frames/angles), the fix is a narrow special case in the mesher:
    skip a full cube's face on the side touching a slab that fully covers the same footprint
    at that exact boundary — not a general occlusion change.

## Handoff notes (for the implementing agent)

- Work the steps **in order**; do not start a step until the previous step's tests pass and
  its checkpoint (where one exists) has been *visually verified from a screenshot you
  actually looked at* — this project has been burned by blind deploys before.
- New code goes in `iso3d-engine/src/voxel/` + `iso3d-engine/voxel.html`. Do not modify the
  existing `renderer.js`/`map.js`/demo until Step 8 parity. `math.js` is shared and proven —
  use it, don't fork it.
- Tests live in `iso3d-engine/tests/` next to the existing ones; plain node, same style
  (`node tests/<file>.test.js`). Steps 1–3 and 5 must be testable with zero WebGL.
- Bump `src/version.js` + the `?v=` on script tags on every user-visible change (house rule).
- Placeholder atlas colors: make each material obviously distinct (grass green, dirt brown,
  stone gray, sand tan, water blue @ ~55% alpha, bedrock near-black, wood, planks, books
  maroon, glass pale blue @ ~30% alpha). Real textures are Step 8; do not spend time on art
  before then.
- When in doubt about a rules interaction (movement cost, cover, LoS): the answer is
  "Grimoire owns it" — the voxel layer only *derives a surface* and renders.
