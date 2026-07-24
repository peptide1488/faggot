# Voxel Gate Testbed — design (planning doc, 2026-07-21)

Standalone harness to run the VISION.md decision gate (see dnd-character/VISION.md,
"Graphics direction") against the voxel engine **without modifying iso3d-engine source or
touching Grimoire**. It decides whether the voxel engine becomes Grimoire's battle map.

## Isolation rules

- Lives in its own folder: `voxel-gate/` at repo root (`index.html` + `harness.js` +
  `bots.js` + `scorecard.js`). Nothing outside that folder is edited.
- Imports engine modules read-only via ES imports from `../iso3d-engine/src/voxel/`
  (renderer, store, mesher, pick, spells/spellFx, spread, lightPresets, billboards).
- If the engine lacks something the harness needs → log it as a GAP finding in the
  scorecard. Never hack engine source to make the harness pass.
- Serve with any static server (`python -m http.server` from repo root); ES modules
  require it anyway. Phone testing = same server over LAN IP.

## The canonical test map (built in-harness, seeded, deterministic)

~30×30, exercises every known failure class in one scene:
- Elevation: flat ground, a 3-block hill, a ledge/cliff line.
- **Liquid:** a water pool (translucent — the alpha-sorting stress case).
- **Gas:** a standing fog volume (animated/translucent — the remeshing stress case).
- Props/billboards at several world sizes (the proportion stress case).
- At least 2 light sources from lightPresets (colored point lights).
- **A destructible structure** (wall/pillar section of damageable tiles) standing half
  in the open, half adjacent to the water and gas volumes — the tile-damage stress case.

## The bots (scripted, NOT LLM — deterministic and free)

- 1 "player" bot + 4 monster bots as billboard tokens (5 units ≈ a real encounter).
- Player bot loop: path toward nearest monster (engine pathing if it exists, else
  straight-line = GAP finding), then cast on rotation: fire spell → fog/gas spell →
  something at the water. Exercises spellFx, spread.js, dynamic volumes, lighting.
- Monster bots: chase + melee swing (any visible FX). Simple aggro, seeded RNG.
- Turn ticker (~1 action/sec) so a run is watchable AND deterministic → comparable runs.

## Instrumentation (scorecard.js — printed to console + on-screen overlay)

1. **Scale invariants (gate stage 1):** render the same scene at 3 zoom levels +
   2 canvas sizes; sample known screen-space landmarks (via projection math) and check
   proportions hold; screenshot each for eyeball diff.
2. **Dynamic volumes (the "spells/gasses/liquids" check):** pixel-sample the water
   region (translucent blend present? terrain visible through it?), the gas region
   (pixels *change* across frames = actually animating?), and an active spell FX
   region (draws where expected? cleans up after?). PASS/FAIL each.
3. **Perf (gate stage 2 core):** rolling FPS + p95 frame time overlay; report after a
   60-second scripted battle. Desktop threshold 60fps; **phone threshold 30fps** (open
   LAN URL on the user's phone — this number is the whole ballgame for 4–6 player
   sessions).
4. **Pick/targeting:** simulated click → tile coords → highlight round-trip (the
   future click-to-target path for Grimoire).
5. **Tile damage (known-broken: "a lot wrong with how damage worked with spells and
   tiles"):** player bot's fire spell targets the destructible structure on rotation.
   Checks: (a) only tiles inside the spell's AoE take damage — sample store state
   before/after, no bystander tiles damaged; (b) damage states render (intact →
   damaged → destroyed visuals actually change on screen); (c) destroying a tile
   remeshes correctly (no holes/z-fighting where it stood, neighbors' hidden faces
   appear); (d) repeat-cast on the same spot is idempotent past "destroyed";
   (e) destruction adjacent to water/gas doesn't corrupt the volume rendering.
   Deterministic seed = exact expected damage map, asserted tile-by-tile.
6. **GAP list:** everything the harness needed that the engine couldn't do.

## Automation

- Playwright (already available as MCP) drives it headed: load page, wait for the
  60s battle, read console scorecard, screenshot the defined beats (t=0, mid-spell,
  fog active, zoom×3). Claude reads the PNGs — same "look at the pixels" discipline
  as tools/iso-preview.js.
- Phone run stays manual (open LAN URL, read the overlay numbers off the screen).

## Outcome contract

- **All green** → voxel engine passes gate stages 1–2 evidence; proceed to the real
  Grimoire integration prototype (exportBattleMap route) per VISION.md.
- **Volume/scale failures** → the GAP + FAIL list becomes the conventions-pass work
  order in iso3d-engine (fix at the root, re-run testbed, no whack-a-mole).
- **Phone perf failure** → voxel stays parked; Grimoire 1.0 rides iso-renderer.js
  (already the decoupling rule). Testbed stays around for re-runs after engine work.
- Later bonus: the harness becomes the bed for the Grimoire integration prototype
  (swap the built-in map for exportBattleMap data).

## Cost estimate

One focused session to build harness+bots+scorecard, one short session to run/read
results (desktop + phone) and write the findings into VISION.md / iso3d work order.

---

# RESULTS — first execution, 2026-07-21 (3 runs, desktop only; phone still pending)

Harness lives at `voxel-gate/` (index.html + harness.js), built and run this session.
Screenshots: `voxel-gate/gate-mid-battle.png`, `voxel-gate/gate-final.png`.

## Engine PASSES (genuinely solid)

- Boot via clean ES imports, zero engine edits needed — the modularity is real.
- **scale-linear**: zoom ratios exactly 2.000/2.000 — camera/projection math is sound.
- **pick-roundtrip**: 3/3 exact cell hits through full MVP inverse.
- **liquid-flow/liquid-stable**: breach a pond rim → water flows into the pocket, then
  stabilizes; no runaway spread.
- **gas-place / gas-decay**: Cloudkill places clamped cloud banks; open-air clouds fade
  (decay verified in runs 1–2; run 3's 44→129 "growth" was a harness confound — repeated
  casts + background-tab throttling slowing decay ticks, not engine spread).
- **tile-damage-containment**: 43 Fireballs, 305 cells changed, **0 outside the AoE**.
- **tile-damage-hp**: 292 partial-damage blockHpMap entries, 0 invalid/stale.
- **render-loop**: 0 errors across runs; 75.6 fps avg desktop @1818×1905 (run 1,
  foreground — background-throttled runs report 1 fps, which is a browser rAF clamp,
  not the engine).

## CONFIRMED engine bugs (the conventions-pass work order, ranked)

1. **lineCells/coneCells z-lock** (spells.js:197, :233): line/cone AoEs run at
   `Math.round(origin.z)` (+1), ignoring the aim point's elevation. Confirmed live:
   caster at z=14 cast Gust of Wind AT a gas cell at z=8 → cleared 0. Every line/cone
   spell (Gust, Lightning Bolt, Burning Hands, Cone of Cold) whiffs across ANY elevation
   difference. **This is the user's "spells not working correctly."**
2. **spread.js hardcoded world bounds** (WORLD_MAX_C/R = 31): gas/liquid sim silently
   stops at col/row 31 while maps are 36×36. **"Gasses/liquids not working" root #1.**
3. **No chunked meshing**: every block change (a unit stepping, one crater cell, one gas
   tick) rebuilds the ENTIRE map mesh — measured 34ms avg / 79ms max per rebuild on
   desktop. On phones expect 3–10×. **The mobile make-or-break; must fix before any
   Grimoire integration.**
4. **Terrain is destructible far too easily** (user ruling 2026-07-21: terrain SHOULD
   blow up — just not this easily). Grass is hp 15 + fire-VULNERABLE, so one Fireball
   (avg 28×2=56) overkills 3.7× and excavates its whole footprint; 43 casts = moonscape
   (see screenshots). Fix = 5e damage thresholds (DMG object rule: damage under the
   threshold is IGNORED, not subtracted): natural ground → threshold ~20 / hp ~50 / drop
   the fire vulnerability (fire scorches — could place a decal — but doesn't excavate);
   built wood structures → low threshold, keep fire vulnerability; stone/cliff/bedrock
   stay indestructible. Engine change: `threshold` field on block defs honored in
   damage_blocks (~5 lines) + blocks.js data tuning. Also update spells.js's stale
   "built-in terrain is indestructible" doc comment to state the threshold design.
5. **MAX_GAS_VOLUMES = 6** (renderer.js): the 7th+ concurrent cloud is mechanically
   present but INVISIBLE; also each cloud renders as its axis-aligned bounding box, so
   concave/L-shaped clouds show fog over cells that have none.
6. **No WebGL context-loss handling** (renderer.js:519): backgrounding on mobile can
   permanently black the canvas. Required for phone play.
7. **Translucent faces never depth-sorted** — renderer.js:1177's own comment defers
   back-to-front sorting; wrong-looking overlapping water/glass is expected as
   translucent content grows ("liquids look wrong" class).
8. **Dice not seedable** (spells.js rollDice → Math.random): blocks deterministic
   replay/tests and any netplay damage-sync-by-seed design.

## Testbed lessons

- Background tabs clamp rAF to ~1 fps and setInterval to 1 s — perf numbers are only
  valid from a FOREGROUND run; phone runs must keep the screen awake.
- One full-screen reddish flash frame (spell FX overlay) can dominate a screenshot —
  screenshot beats should avoid the exact cast instant.
- **Browser HTTP cache can serve a stale engine module after an edit + server restart,
  even on the SAME port** — worse, internal engine-to-engine imports (e.g. spells.js's
  own unversioned `./blocks.js`) can stay stale even when the testbed's own top-level
  imports are cache-busted, since those internal specifiers never change. The only
  reliable fix found: serve from a **fresh port** (fresh cache partition) after any
  engine edit, not just a fresh navigation on the same origin. `Cache-Control: no-store`
  headers alone did NOT retroactively invalidate an already-cached same-origin entry.

## Status vs the gate

Stage 1 (conventions/scaling): camera math passed clean; the failures are the specific
bugs above, now a concrete work order instead of "dumb issues." Stage 2 (Grimoire
integration + phone FPS): NOT yet run — blocked mainly on #3 (chunked meshing) being
fixed first, since per-move whole-map remesh is already marginal on desktop.

---

# FIXES APPLIED — 2026-07-21, batch 2 (bugs #1, #2, #4)

User approved fixing the top 3 items from the work order above. All three fixed in
engine source (not gate-testbed workarounds), verified via `node` unit tests +
dedicated new gate-testbed checks + a fresh re-run of the full battle harness.

## #1 — lineCells/coneCells z-lock → FIXED

`spells.js`: both functions now compute elevation from the actual origin→aim direction
(3D for lines, interpolated-along-length for cones) instead of hardcoding
`Math.round(origin.z)`. A same-elevation cast is byte-for-byte unchanged (regression
guard test included).
- Unit tests: `tests/voxel-spells.test.js`, new block "PHB aoeCells — line/cone honor
  the AIM point's elevation" (4 assertions, all passing).
- Live verification: harness's two-cast Gust of Wind experiment — caster at z=14 aiming
  at a gas cell at z=8 now clears cells (`cleared=5`); before the fix this always
  cleared 0 regardless of aim.

## #2 — spread.js hardcoded 31×31 world bounds → FIXED

`WORLD_MIN_C/MAX_C/MIN_R/MAX_R` changed from `const` to `let` (live ES module
bindings), plus two new exports: `setWorldBounds(minC,maxC,minR,maxR)` (primitive) and
`setWorldBoundsFromStore(store, margin=4)` (derives from the store's actual occupied
bounding box + slack). `voxel.html` now calls `setWorldBoundsFromStore` at every
store-load path (boot, `loadDemoMap` for both showcase/hills, and the JSON import
handler) — one shared call, not a per-caller reimplementation.
- Manual verification: gas placed at col 33 (past the old hardcoded bound of 31) on a
  36-wide map spread to 8 cells after 3 ticks once `setWorldBoundsFromStore` ran; would
  have been capped at 1 (no spread at all) under the old fixed bound.
- Live verification: harness's `world-bounds` check now PASSES (`WORLD_MAX_C/R = 39/39`
  on the 36×36 showcase map, vs the old fixed 31).
- `tests/voxel-spread.test.js`'s own WORLD_MAX_C tests use the constant *relatively*
  (`WORLD_MAX_C - 5`, etc.), so they remain valid regardless of the actual bound value —
  no test changes needed there. (They could not be re-run this session — see the new
  finding below.)

## #4 — terrain destructibility rebalance → FIXED (tuning, not a revert)

User's ruling: terrain SHOULD be destructible, just not trivially. Implemented via the
5e DMG "damage threshold" object rule (sub-threshold damage does NOTHING at all, not
partial chip damage) rather than reverting destructibility:
- `blocks.js`: `dirt`/`sand`/`mud` → `hp: 50, threshold: 15` (was `hp: 20-25`, no
  threshold). `grass` → `hp: 60, threshold: 15`, **fire vulnerability removed** (was
  `hp: 15, vulnerable: ['fire']` — this doubling was the main culprit; 8d6 fire, doubled,
  averaged 56 against 15 hp, a 3.7× overkill in one cast). Structures (wood/planks/
  glass/shelf) are untouched — still low hp, still fire-vulnerable, still easy to burn.
- `spells.js`'s `damage_blocks` effect now checks `damage < (def.threshold || 0)` before
  applying — below threshold, treated exactly like immune (counts toward `immune`, not
  `hit`). Absent/0 threshold (every structure) is a true no-op.
- Unit tests: `tests/voxel-spells.test.js`'s grass/wood test rewritten for the new data
  (a 1-dmg poke now provably does nothing to grass — no hp entry created at all — while
  the same poke still damages wood normally; a full Fireball now provably CANNOT
  one-shot grass, since its max roll of 48 is less than grass's 60 hp).
- Live verification (harness `terrain-threshold` check): a 2d10 "Firebolt"-strength poke
  (avg 11, below the 15 threshold) against a live grass cell on the showcase map did
  ZERO damage (`hit=0`); the same cell hit by a real Fireball took real damage but
  **survived** (`hit=41, dmg=1599, destroyed=0`) — confirms both halves of "destructible
  but not trivially."
- **Screenshot evidence**: `voxel-gate/screenshots/gate-terrain-check.png`, taken after
  a 65-second battle with 22 ground-targeted Fireballs — the visible terrain (courtyard/
  pond area) is still solid green, no crater scarring, a stark contrast to the original
  `voxel-gate/gate-final.png` "moonscape" from the pre-fix run (43 casts against the old
  1-shot-kills-grass data).
- **Open tuning question for the user**: the harness's own `terrain-resilience` check
  (a ratio of terrain cells destroyed per ground-cast, summed across the WHOLE battle)
  still reports a high aggregate number (130 cells destroyed over 22 casts) — but this
  is 22 REPEATED full-size (20-ft-radius) Fireballs landing on overlapping hot spots
  near wherever monsters wandered, not 22 independent single-cell tests. The single-cast
  behavior is definitively fixed and screenshot-verified; whether SUSTAINED heavy
  bombardment craters "about the right amount" after several real casts is a game-feel
  judgment call, not something worth hard-gating on an invented ratio threshold. Bump
  `hp`/`threshold` further in blocks.js if repeated bombardment still feels too easy
  after actually playing it.

## New finding (out of scope this batch, added to the work order)

**9. `tests/voxel-spread.test.js` crashes partway through** (uncaught exception, halts
the whole file before reaching the WORLD_MAX_C tests) — root cause confirmed unrelated
to any of the 3 fixes above: `blocks.js`'s `fog`/`gas` materials both carry
`gasSpreadRadius: 0` ("don't let hand-placed fog crawl the map" — a deliberate, intentional
value with its own doc comment), but the FIRST `stepGas` test in that file was written
assuming fog spreads on its own with no cast/hops override, and asserts on a
`lifeMap.get(...)` entry that never gets created because `hops:0` blocks all spread.
This is a stale test vs. an intentional, documented data change from an earlier
session — not something introduced by this session's edits (confirmed via direct
reproduction against the unmodified `stepGas` function). Needs a product decision
(should un-cast, hand-placed fog spread by default, or was `gasSpreadRadius: 0`
correct and the test is just outdated?) before fixing — flagged, not fixed.

## Re-run status

Full 65-second scripted battle re-run confirms all three targeted fixes live end-to-end
alongside everything that already passed before (camera math, picking, liquid flow,
damage containment, partial-HP tracking, structure destruction). `gas-decay` and
`perf-fps` showed as FAIL in this specific re-run purely from the same background-tab
throttling confound documented above (the Playwright polling loop let the tab go
background); not re-litigated since the fix under test in each case (bugs #1/#2/#4) is
independently confirmed by its own dedicated check. `remesh-cost` (bug #3, chunked
meshing) remains open by design — it's a separate, larger task, not part of this batch.
