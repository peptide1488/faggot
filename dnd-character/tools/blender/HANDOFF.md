# Iso tile engine — handoff

State as of 2026-08-06. Everything below is committed; the working tree is clean
apart from debris that predates this work.

---

## What this is

A baked isometric renderer. Blender writes three passes per tile (albedo, `_NRM`
normals, `_H` height); `tiles_demo.html` composites them in WebGL and lights them at
runtime. The height pass is the load-bearing one — it is the depth buffer, so
**anything that changes what a pixel's height means changes what occludes what.**

Five sets: `stone` and `sandstone` (dungeon, wall contract) and three outdoor
socket sets -- `grass10A`, `dust10A`, `scree10A` -- which share ONE tile table,
one edge contract and one generator. An outdoor theme is a palette and nothing
else, which is why adding one costs a bake rather than a design.

The dungeons stay on the wall contract deliberately: an indoor map needs rooms,
doors and walls, and none of those exist in the socket vocabulary. "Unify" cannot
mean converting them without throwing the dungeon away.

**Three elevation bands** outdoors: 0 ground, 1 high ground, 2 peak, plus -1 for
the bed under water. The transition family is parameterised by its band pair, so
the cliff from 1 to 2 is the same shape as the one from 0 to 1 and a new level
costs table entries rather than geometry.

---

## Run it

```sh
cd dnd-character/tools/blender
python serve.py                     # NOT python -m http.server
# then http://localhost:8777/tiles_demo.html?set=grass10A
```

**Use serve.py** — for ONE reason: `python -m http.server` sends no cache
headers, so the browser serves a stale `tiles_demo.html`, `tiles.json` or
`actors.json` and the newest work appears not to have happened. That cost three
separate bugs in one session. It is not faster in any way that matters: measured
head to head, 20 requests each, **http.server 3.0ms and serve.py 2.3ms**.

An earlier version of serve.py itself was **2048ms per request** because it bound
IPv4-only (so every request waited for `localhost`'s IPv6 attempt to time out)
and spoke HTTP/1.0 (a new TCP connection for each of ~1400 files). I measured
that, diagnosed it correctly, and then wrote it up as a fault in `http.server` --
the thing that had been there all along -- rather than in the file I had written
twenty minutes earlier. It went into a commit message and into this handoff as
fact. **`python check_serve.py` is the one command that would have disproved it**,
and it now exists: it fails if a request is slow or if the page comes back
cacheable.

`?set=` `&seed=` `&goblins=N` `&who=rogue` all work and are kept in the URL, so a
link reproduces the scene.

Pick the set from the dropdown. **Daylight is a checkbox** — on by default for
outdoor sets, off for dungeons. Chrome restores slider positions across reloads, so
if the lighting looks wrong after a refresh, toggle daylight to reset it.

---

## Tools — use these before guessing

| command | what it proves |
|---|---|
| `python shot.py <url> -o x.png --eval "expr" --key e` | screenshots the live page, prints console errors and any expression. Uses the `playwright` python package and its own chromium — **does not need the MCP browser** |
| `node demo-test.js` | 7 checks on the socket solver: sockets well-formed, rotations permute, every abutting pair agrees, maps are not flat / unclimbable / drowned |
| `blender -b -P check_seams.py -- --theme grass10A` | for every pair of VARIANTS whose sockets say they may abut — all 160, not just rotation 0 — samples both edge profiles and reports the worst height disagreement. Expect **0 of 14496** |
| `blender -b -P check_profile.py -- --theme grass10A` | what SHAPE each level change is: its gradient, and for one asked to shelve, how much of its dry ledge an actor could stand on |
| `python socket_spec.py out/grass10A -o SOCKETS.md` | rewrites the edge/connection spec from the manifest: every socket, every piece, and which corners no tile can make |
| `__engine.bench(30)` in the page | ms per frame, synced with a readback. The honest answer; see the note under Bake about why counting frames is not |
| `python check_serve.py` | that the dev server is up, quick, and sending no-store. A page is ~1400 files, so 200ms per request is five minutes of loading and looks exactly like a hang |

These exist because **every bug worth the name here was a claim that nothing
checked**: a comment describing what the code did not do, a shore that agreed
perfectly with its neighbours on the wrong shape, a socket that said a level
change crossed an edge but not which end of it was high. None of them was
visible in a screenshot and none of them raised anything. Measure first.

Two of these were themselves wrong and worth knowing about, because a checker
that lies is worse than none: check_seams.py compared only rotation 0 against
rotation 0, which is 946 of 15272 pairs and misses the case where the fault
actually was; and check_profile.py judged a sea cliff as a failed beach until it
learned to read the INTENT out of `SHELF` rather than infer it from the bands.

---

## Bake

```sh
blender -b -P build_tiles.py  -- out --theme grass10A       # 40 tiles, ~30 min
blender -b -P build_props.py  -- out/props                  # furniture + outdoor props
blender -b -P build_actors.py -- out/actors                 # 2 bodies x 4 actions x 8 dirs
blender -b -P build_effects.py -- out/effects               # 4 spell effects
python pack_tiles.py out/grass10A --albedo-q 100            # lossless: pixel sets need it
```

Useful flags: `--rot 0` (bench one rotation), `--manifest-only`,
`--only <name or part of one>`, `--action <name>`.

`--only` now means the same thing in all three build scripts, and an unknown
flag or a mistyped tile name is a hard error rather than a skip. It did not use
to be: `build_tiles.py` alone wanted its tiles named in full and positionally, so
`--only headland` was read as a TILE NAME, matched nothing, printed `SKIP`,
rendered nothing -- and still finished with `DONE`. That is the worst shape a
failure can have. It costs the twenty minutes you expected to spend, raises
nothing, and leaves the art untouched, so the next thing you do is compare
against a stale image and conclude a working change did nothing. It cost exactly
that, twice.

**After any tile re-bake: delete `out/<set>/packed/` and re-pack.** A stale pack
serves the previous vocabulary and 404s the new one.

---

## grass10A — how the set is built

**Bands and transitions.** Cliff, shore and sea-cliff are the same problem three
times: ground at one height meeting ground at another. One parameterised family
keyed by the band pair (`-1` water bed, `0` ground, `1` high ground). That is why
the corner and ramp variants cost nothing.

- `join="max"` — high half-planes union → **inside corner** (the notch you stand in)
- `join="min"` — they intersect → **outside corner** (the nub you walk around)

These are genuinely different tiles, not rotations of each other.

**Sockets** are the adjacency contract, emitted per edge per rotation into
`tiles.json`: `G0`/`G1` ground low/high, `W` water, `+P` a track crosses here,
`X01`/`Xw0`/`Xw1` a level change crosses here. Two tiles may abut iff the facing
sockets are equal.

**The cross-section is set-wide, not per-tile.** A tile may vary its interior
however it likes but not the edge everyone has to meet on — `_scarp_line` and the
bedding/gully/ramp detail all use `SEAM_SEED`. This was the smooth-wall bug: seeded
per tile, two pieces presenting the same socket disagreed by up to **2.23 units**
against a texel of 0.025, every tile rendered correctly alone, and the skirt quietly
filled the step.

**Pixel art** is two per-theme switches: `posterize=7` (value quantised in HSV —
per-channel RGB shifts hue, and a plain `SNAP` sends the darkest band to pure black)
and `pixel=2` (render at 1/2, nearest-upscale, alpha hard-thresholded).

---

## Rules that are not obvious and will bite

- **Grass is texture, never geometry.** A blade standing proud tells the height
  buffer the ground is higher than it is, and every token sorts against the tips.
  Trees and boulders *are* geometry, for the opposite reason: they have real volume.
- **Nothing may rise above the walkable surface it belongs to.** Crags are z-clamped
  for the same reason.
- **A tile does not have one height.** A ramp climbs a level across itself. Both the
  hero's height and walkability read the composited height buffer, not the tile's
  band. Getting this wrong twice was the pathing bug.
- **Procedural textures need an explicit Object coordinate.** An unconnected `Vector`
  falls back to Generated — the object's own bounding box — so tiles of different
  shapes get different mappings. `_objcoord` also divides by `SIZE`, because object
  space is 4x the range the scales were tuned against.
- **Blender's noise `Fac` clusters around 0.5.** A raw 0..1 mix factor averages two
  colours instead of choosing between them. `_band(..., f0, f1)` stretches the range
  the noise actually occupies.
- **Emissive materials need a black base colour** and `colour × strength ≤ 1.0`. The
  bake uses the Standard view transform (a tone curve would corrupt the `_NRM`/`_H`
  encodings), so anything above 1.0 clips flat to white.
- **Lossy WebP ruins pixel art** — it rings on hard edges and smears flat fields.

---

## The generator

WFC over `(tile, rotation)` variants with socket equality as the adjacency test.

**Weights cannot express map composition, and three rounds of tuning proved it.**
Weighting features down made elevation *impossible* rather than rare (a plateau
needs a whole ring of transitions before it can exist); weighting them up gave a map
where all 68 land tiles were high; judging the finished tiling failed 112 attempts in
a row because the output is bimodal.

So the map is **seeded** — a few cells collapsed to a chosen role before solving, and
WFC grows a coherent region from each. **The ramp is seeded first**: rejecting maps
with no way up cannot conjure one.

`window.__wfcDebug` reports the accepted attempt and a tally of rejection reasons.
That tally found a bug two rounds of guessing missed — `land` was excluding
transition tiles, which are walkable ground that changes level, so 97 of 112 maps
failed on a clause that should never have fired.

---

## Actors and effects — done, and how they work

Every moving thing is one kind of object: a 384px triple pasted into an eight-cell
ATLAS with a screen rect. The hero is slot 0 and nothing about him is special —
he reads from the same `out/actors/` bake the goblin does. Effects bake larger
(640) because a blast expands past a figure's frame, so the atlas cell is the
largest over the manifests and each sprite occupies the top-left res x res of it.

**Do not measure frame rate by counting requestAnimationFrame callbacks.** An
automated browser clamps rAF to about 1fps whenever the page is not visibly
composited, so every number taken that way is the clamp, not the renderer — a
whole regression hunt in here was chasing exactly that. `__engine.bench(n)` draws
n frames and syncs with a one-pixel `readPixels`; `gl.finish()` will not do, it
is advisory in ANGLE and cheerfully reports twenty thousand frames a second.

What it actually costs, on a 3090 at 7.2 megapixels: **3.99ms a frame, and
0.22ms with shadows off.** The 28-step shadow march is 94% of the frame and
everything else put together is the other 6%. That is the only knob worth
turning, and it is why the caster inside it is one slot written out rather than
a loop.

`__engine.pause()` / `.step(n)` stop time and hand-crank it. Not a debug hook:
without them a screenshot lands after the animation it was meant to photograph,
which looks exactly like an effect that never rendered.

---

## The map is composed, not just tiled

A river snakes across every map and at least one road crosses it, both SEEDED
before the solve -- see the long note in `socketWfc`. Weights cannot do this and
three rounds of trying proved it: a weight says how MUCH, never where or what
shape. Four things had to be right and each was wrong first (diagonal path steps,
seeding order, what counts as "water", and the two paths running parallel); the
commit for it spells them out.

Actors: 21 bodies -- twelve classes and nine monsters -- as `?who=` and a picker,
with monsters drawn from the manifest's own list. `build_actors.py` is a table of
proportions, palette and kit; `legs` (robe vs trousers) is the single biggest
difference in it, because at a hundred pixels the silhouette is the performance.

## Also open

- **Two corners, and only two.** `SOCKETS.md` is generated and says which: a beach
  meeting a sea cliff, in both chiralities. A `cove` was built for it and reverted —
  it closed them and then disagreed with every bluff by 0.394 units, sixteen texels,
  along the seam they share. The reason is in SOCKETS.md and it is structural, not a
  tuning problem: the headland works because the cliff's progress is CONSTANT along
  each of its crossing edges, and any piece whose two crossings sit on edges where
  that progress varies cannot collapse to the family it has to match.
- **The skirt is not the bug it looks like.** A flat brown wall beside a proper crag
  face was never the skirt's fault; it was a seam step the skirt was filling. Both
  causes are fixed (a per-tile seed on the break line, then a crossing socket that
  never said which end was high). On a live map the only exposed skirt is at the
  map's outer boundary, which is what it is for.
- **The mire** is a basin with a pond; fine, but only two variants.
- **A bridge needs a socket that does not exist.** A tile with water on two edges
  and road on the other two is a saddle -- its road edges must be ground to meet a
  track and its water edges must be bed to meet a mere, and one height field
  cannot be both. Built anyway it was out by 0.95 (exactly BED_Z) against every
  track. What would work is a `W+B` socket -- water with a deck carried over it --
  on the span and two bank approaches. Three pieces and one socket. SOCKETS.md
  has the detail.
- **Crossings OVER things are a family the vocabulary does not model at all.**
  The cove, the beach-meets-sea-cliff corners and the bridge are all the same
  gap, not three separate failures.
- **Goblin ears read as horns from the front** views; they work from the obliques.
- The dungeon sets still use the wall contract. Both contracts coexist deliberately —
  the manifest decides which a set uses — so nothing needs migrating.


---

# 2026-08-07 — renderer, load time, water

Commits `20bce44`..`3b4377e` on `iso3d-engine`. All green: `node demo-test.js`
10/10, `check_seams.py` 0 bad pairs, five sets load clean.

## What changed

**One renderer, G-buffer, default on.** The old path composited the whole map at
art resolution (840MB at 12x12, 1418MB at 16x16 — it grew with map AREA and every
pan re-uploaded it). Now each tile VARIANT uploads once and only the visible ones
are drawn as quads into viewport-sized targets each frame. Cost is bounded by what
the SET contains (184 variants, 459MB) plus a viewport, whatever the map size.
grass10A 840->440MB, stone 872->300MB. `?gbuffer=0` gets the composite back, for
A/B only — no tile set has a path of its own. `__engine.vram()` reports both.

**Load: 21s -> 2s.** It was never the art (1.6s: 0.94 fetch, 0.62 decode).
`socketWfc` was 20.5s, running 292 of 300 attempts EVERY time and then taking the
`tries-8` "settle for anything" branch — so it was slow AND threw the result away,
which is why no water rule ever applied. The acceptance ranges were unsatisfiable:
`open` needed >=0.10 against a measured median of 0.014. Ranges now come from
sampled distributions (`window.__wfcSamples` is still live).
Separately, the actor loader fetched every body x every action at startup —
10,081 requests, 465MB — for a scene with a wizard and two goblins. Now loads what
is on the map; rest on demand. `measure_load.py` prints the timeline.

**Water is a river.** The flood was SHORE tiles: 12 of 256 were role "liquid"
while 104 were "transition" — shore pieces that are half water by area. Every
constraint measured the role and passed while the map drowned. "Wet" is now
"carries a water socket on any edge", which is both what the river corridor masks
on and what the metric counts.

## THE NEXT JOB, and it is the user's design

Water is currently BAKED INTO THE TILES as a plane at a fixed WATER_LEVEL. The
height pass records that plane, so the renderer never learns the bed depth — which
is why the new `water clarity` slider is a flat constant blend and looks weak.
(The slider does work: clarity 0 vs 100 moves 4.91% of pixels, max delta 239.
Measured, not assumed.)

Bake the beds DRY and make water a LEVEL:

1. `build_tiles.py`: stop emitting the water plane; let the bed run to BED_Z.
2. Shader: draw water wherever surface height < uWaterZ (not `abs(h-uWaterZ)<0.05`),
   with `depth = uWaterZ - hgt`. Absorb by Beer's law `exp(-depth*k)` — shallows
   genuinely clear, channel genuinely deep. Foam is where depth crosses zero,
   replacing the neighbour-sampling edge hack.
3. Water level becomes a slider (uWaterZ is already a uniform).

This gives real depth-based transparency, an adjustable level (drop it and the
river is a dry gully), and makes river/canal/sewer one system — a bed shape plus a
level. It also simplifies the WFC "wet" test to bed-height-vs-level.
BOTH STEPS MUST LAND TOGETHER: dry beds render as holes until the shader fills them.

## Discipline that paid, repeatedly

- **Run the control first.** Composite-vs-itself differs by 7-10% of pixels because
  the water animates — far too noisy to see a 1px seam through. Freezing water
  first drops the control to 0.006%, and the real difference showed as 3.18% with
  93% of it one pixel wide. Two wrong conclusions came from skipping this.
- **Look at the diff MAP, not the percentage.** It found a missing causeway flank
  that the aggregate number hid completely.
- **Measure before believing.** "Loading is slow" was assumed to be assets for the
  whole session; `--wait 16` had been in every capture command as an unquestioned
  constant. The art was 7% of it.
- Correlate, don't eyeball: a "10px prop offset" measured as best-shift 0,0.

## Traps

- `video-downloader` shares this git repo. That session switched the worktree to
  `claude/elegant-bohr-zx67jk` mid-edit and the blender files vanished. Nothing was
  lost (commits are on `iso3d-engine`), but consider `git worktree` to separate them.
- `git add -A` from this directory sweeps in `.playwright-mcp/` junk — add files by name.
- Windows Python cannot open MSYS `/c/...` paths; `cd` to the directory and use
  bare filenames.
- `shot.py` exits non-zero on any console error (stone/sandstone 404 the themed
  prop dir by design), which silently breaks `&&` chains.
- `serve.py` on 8777 dies with the shell that started it; use a background task.

---

# 2026-08-07 (later) — water became a level

THE NEXT JOB from the section above is DONE in source and half-verified in art.
Both halves landed together, as they had to: dry beds render as holes until the
shader fills them.

## What changed

**Nothing in the bake is water any more.** `add_water_plane` and both water
materials are deleted; `add_water` (dungeon basin) and `add_stream` lost their
`water_surface` planes too. Every bed in every set is now cut dry to -0.95 and
left there. The dungeon had to change with the landscape because the SHADER is
shared: a plane sitting exactly at `uWaterZ` fails a `hgt < uWaterZ` test, so
leaving the basin wet would have turned dungeon water into flat baked albedo.

**The shader floods everything below the level.** `hgt < uWaterZ` replaces
`abs(hgt-uWaterZ)<0.05`; `d = uWaterZ - hgt + swell`; the bed comes back through
`exp(-d*k)` with `k = mix(6.0, 0.8, clarity)`; foam is `smoothstep(0.14,0.0,d)`,
which retired the four-sample neighbour edge-detect (that hack found rims, piers
and boulders as readily as shorelines, because a height STEP is not a waterline).

**The column darkens with depth as well**, `mix(uWaterCol*0.16, col, exp(-d*0.9))`.
This is easy to miss and it is half the effect: absorption alone only governs how
much BED returns, so with the water's own colour held constant the deep channel
came out exactly as bright as the shallows -- a flat blue sheet, which is what it
looked like before. First render of the dry bake had this wrong and it read pale.

**Two facts now ship in the manifest**, not one. `water_z` is the DEFAULT level
(the slider owns it after load). `water_floor` = `BED_Z - 0.15` = -1.10 is new and
load-bearing: "below the level" also describes a CHASM, and without a floor the
renderer fills a 3.4-unit pit with river. Beds are at -0.95, `PIT` is -3.4, so the
floor sits between them and says which holes hold water.

**`water level` is a slider** (-1.10..+1.80, seeded from the manifest on set load
because Chrome restores slider positions across reloads). At -0.95 the lake is a
drying mudflat; at +0.25 the meadow floods and you can read the road THROUGH the
shallow water. River, canal, moat and sewer are now one bed shape at four levels.

**`standable()` refuses squares below `WATER_SURFACE`.** Not optional: with a
baked plane the wet half of a shore read as flat ground AT the water's height, so
you could stand ON the river -- the move-range overlay in the old screenshots
spills out over the water. With the bed dry the same code stands you IN it.
Standable squares 1883 -> 1380 on the same seed, which is the shoreline arriving.

## Measured, not assumed

- Clarity 0 vs 100 moves **5.573% of pixels against a 0.126% control** (water
  frozen with `water=0`; the residual control is the actors, which animate).
- The clarity diff MAP is the real evidence and it is the signature of absorption
  rather than a blend: **no effect at the waterline**, maximum at mid depth. A
  flat blend would have been uniform over the whole body.
- Bed height under water measures -0.96 median against a -0.20 level: 0.76 units.
- Composite vs G-buffer with water frozen: 9.76% of pixels, and the diff map is
  1px seams and actors -- **the water body is black in it**, so the two paths
  agree exactly about water. Do not read that 9.76% as a water fault.

## State of the bake — all five, done and looked at

**All five sets are baked and packed** against the dry-bed change, in one shell
doing bake -> `rm -rf packed` -> re-pack per set. Pack sizes: outdoor 184 tiles
~129MB -> ~25MB each, stone 268 -> 84MB, sandstone 220 -> 71MB.

**The dungeon rule is verified, and it was the one claim nothing had exercised.**
On `?set=stone&seed=3` the height buffer holds exactly two populations below the
floor line: **239 squares at -0.96** (basin beds -- above `water_floor`, so they
flood) and **82 at -3.40** (chasm beds -- below it, so they stay dry). The picture
agrees: the basins ripple with their flagstone bed visible THROUGH the water, and
the chasm beside them is a dry hole with no blue fringe down its walls. sandstone
splits 368 floodable / 167 below the floor and looks the same. A dungeon basin is
0.54 deep against the outdoor channel's 0.76, so more bed comes back -- which is
the effect being right, not a difference in treatment.

`check_seams.py --theme grass10A`: **0 of 16256 pairs** disagree by more than a
texel. (16256, not the 14496 in the older section -- the tile table has grown.)
`node demo-test.js` passes 10/10.

**`__engine.bench()` cannot be run through `shot.py`, and the number it gives is
a lie of the same family as the rAF clamp.** That chromium reports
`ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)`
-- it is rendering on the CPU. It measured 561ms a frame at 5.76 megapixels
against the 3.99ms this renderer does on a 3090, so the two numbers are not
comparable in either direction and no conclusion about performance can be drawn
from the headless one. Bench in a real browser or not at all. The change should
be marginally FASTER (the foam edge-detect's four texture reads per water pixel
are gone) but that is reasoning, not a measurement, and it is not one yet.

## Traps this session

- **Backticks inside the shader source are a JS syntax error.** The GLSL lives in
  a template literal, so a comment saying `` `uWaterZ` `` ends the string. It
  reports as `PAGEERROR Unexpected identifier 'uWaterZ'` -- which reads like a
  GLSL compile failure and is not one. Prose in that block takes no backticks.
- **The skirt needs its own guard.** Water is drawn on up-facing surfaces only
  (`nrm.z>0.35`): the curtain hanging off a tile is vertical and reaches below the
  water line even on ordinary band-0 ground, so without it the board wears a blue
  hem all the way round its outer edge.
- **A bake invalidates every packed set.** `tiles_demo.html` fetches
  `packed/pack.json` first and only falls back to raw PNGs if it is missing, so
  skipping the re-pack serves the OLD art and the change looks like it did
  nothing. Same shape as every stale-cache trap in this file.

---

# 2026-08-07 (later still) — the bridge, and what it exposed

Closes the `Also open` bullet "A bridge needs a socket that does not exist", and
with it the "crossings OVER things" family — for water, at one level. It cost
**two pieces and one socket**, not the three SOCKETS.md guessed at: the far bank
is the near bank at r180.

**Water becoming a level is what made it buildable**, and that is the whole
story. While water was a baked plane the height buffer recorded the plane, so
anything laid over it either sat under a sheet of albedo or replaced the water —
a bridge came out as a dam. With the bed cut dry and the runtime flooding
everything below `uWaterZ`, the deck is the only thing in the height buffer where
it stands, the bed either side is still below the level, and the river runs up to
the span and out the far side on its own.

## The socket

`W+B` — "the ground here is bed, and something is CARRIED over it". `+P` says the
ground itself carries the track, which is why a ford works and why a bridge built
as a track disagreed with every track it touched by exactly BED_Z. `W+B` makes
both sides of the seam agree about the GROUND; the deck is a separate promise
they also both keep. B never matches P, so a deck cannot end in mid-air against a
wading ford.

| piece | role | `X+` | `Y+` | `X-` | `Y-` |
|---|---|---|---|---|---|
| bridge-0580 (span) | span | `W` | `W+B` | `W` | `W+B` |
| bridge-0590 (approach) | span_flank | `Xw0>Y+` | `G0+P` | `Xw0>Y+` | `W+B` |

The approach's flanks are the crossing socket the strand and the shoal already
present, so a bridge lands on a beach with no piece of its own to do it. Nothing
else in the set presents `W+B`, so **one seeded span forces its own approaches**.

## Three things that were each a whole afternoon of "it does nothing"

- **The river's own seed predicate excluded the span.** `isWater` read
  `/^W(\+P)?$/`, so every river cell was pinned to a piece with no deck. Measured
  over eight seeds: **0 bridges, 8–21 fords**. The pieces and the sockets were
  both correct the entire time. This is the same shape as the bug its own comment
  documents — pinning the river to role `liquid` once excluded the ford.
- **Then it went to the map edge every time**, for a structural reason worth
  keeping: in the interior a `W+B` edge must be answered by another span or an
  approach standing on a real bank; at the boundary it is answered by nothing. So
  the cheapest place to put a bridge was the one place it could lead nowhere. Two
  of eight seeds bridged and both were piers over the shore.
- **Weighting it could not work and the numbers say why.** At `span: 0.8`, no
  seed in twelve bridged; at `12` — four times a track's weight — one in six did.
  A span needs BOTH along-road neighbours to be approaches and the collapse
  usually decides one of them first. So the crossing is now **stated, not
  weighted**: the one cell on both seeded lines is collapsed to a span on a coin
  flip, and the ford keeps every crossing that does not take. 3 of 12 seeds
  bridge. `ROLE_W` is back to 0.8 and only governs spurious extras.

## The deck is exactly two squares wide, and that is a movement rule

At 1.5 units it straddled the lattice, so the plank edge — a 1.0-unit drop to the
bed in one texel — fell INSIDE the squares it was meant to carry and `standable`
rejected them on slope: **1 of 16 squares on a span tile**. At `2.0 * CELL` it
lines up: 4 of 16, a full walkable lane, and BFS from the road above reaches
every standable square on the approach and both spans. The dungeon causeway ducks
this by declaring squares 1 and 2 walkable by fiat (`onCauseway`); this earns them
under the rule everything else obeys.

## THE NEXT JOB — a ford is not walkable, and has not been since water became a level

Found while measuring the bridge, and it is worse than the bridge was missing.
**Every ford tile on seed 1 measured 0 of 64 squares standable.** The bed is at
BED_Z −0.95 against a level of −0.20, so a ford is 0.75 deep — not a place to
wade, a place to drown. `roadCrosses` and `demo-test.js` both check SOCKETS, so
the road "crosses" a river no one can walk, and every map that solves its crossing
with a ford (9 of 12 seeds) has a road that stops at the water.

It is the same class of finding as the water-as-a-level work itself: the contract
was right and the surface underneath it was not. The fix is not to raise BED_Z —
the ford's `W` flanks must keep meeting the mere. A ford is a shallow BAR across
the channel, so the shelf belongs to the `W+P` faces: every piece presenting `W+P`
(ford-0560/0561/0562, track-0563) would carry the crossing line at just above
WATER_SURFACE and fall back to the bed at its `W` flanks. All four agree or
`check_seams.py` says so, which is the check that already exists.

## Measured, not assumed

- `check_seams.py --theme grass10A`: **0 of 16864 pairs** disagree by more than a
  texel (16864, not 16256 — two pieces × 4 rotations added pairs).
- `node demo-test.js` 12/12, including two new ones.
- Deck top and rail top measure R−B 32 and 33; deck side and rail side 19 and 15.
  **The rails are not greyer than the planking** — every vertical face in this set
  is cooler than every horizontal one, the terrain included. Turning `wear` down
  to chase it changed nothing, which is how the guess got caught.

## Traps this session

- **`socket_spec.py` refuses a socket it has no entry for**, which is the right
  behaviour and will stop a bake cold: add to `MEANING` and `BANDS` together. Its
  prose about the missing bridge was hardcoded and had to be branched on the
  socket existing, or the generated file confidently states the opposite of what
  its own table shows two lines above.
- **`demo-test.js` keeps a SECOND COPY of the road-walk rule** and it still read
  `/\+P/`. It reported 10 of 12 seeds with no road across maps whose road crossed
  on a bridge. If a third copy is ever wanted, export the predicate.
- **The first stranded-bridge test was worthless and the mutation proved it.**
  Flooding from every border cell makes a pier hanging off the map edge "on the
  road" before the walk starts; removing the mask it guards still passed 12 of 12.
  Flooded from the track tiles instead it means something — but be honest: that
  version is **not** mutation-proven either, because with the crossing seed in
  place spurious spans are too rare to show in twelve seeds. The
  "a bridge is still reachable by the generator" test IS proven: restoring the old
  `isWater` fails it, 0 of 12.
- `python -m py_compile` catches nothing about Blender scripts but is still the
  cheapest first check; the real one is a stub-`bpy` import that runs
  `outdoor_tiles` and `tile_sockets` without a bake, which turned the socket
  design round in seconds instead of a 35-second render each time.

---

# 2026-08-08 — the ford: built, measured, and REVERTED

The previous section's NEXT JOB was attempted in full and **backed out**. The
change was correct in isolation and surfaced a worse bug underneath it that I
could not fix without wrecking the solver — twice, measured both times. The tree
is back at the bridge commit. Read this before rebuilding it, because the design
below is different from the one that was tried.

## What was built, and it worked

`FORD_Z = WATER_LEVEL + 0.06`, a `bar` argument on `field_track` that LIFTS the
crossing to that height and never lowers it (a ford climbing out of the water has
its far edge on dry ground, and mixing toward the bar there digs a trench 0.14
below the band it promised its neighbour), and `_bar()` — a flat-topped,
lattice-aligned, non-wandering mask, because `_arms` is a smoothstep ridge whose
only full-height point is its centreline and `standable` throws out anything
steeper than grass will root on. Flat core = the two middle squares, the same
measurement that made the bridge deck walkable. Set on the four pieces presenting
`W+P`: ford-0560/0561/0562 and track-0563.

- `check_seams.py`: **0 of 16864** — all four agreed, which was the risk.
- Ford squares standable: **0 of 64 → 125 of 240**.
- Ford tiles joined to a plain track tile, at the default level vs with the level
  raised 0.04 above the crown (which reproduces the old behaviour exactly, using
  the water slider as the A/B): seed 3 **10 vs 2**, seed 6 **4 vs 1**, seed 8
  **4 vs 1**.

## What it surfaced, which is the real bug

**The river is PAVED with fords, end to end.** Seed 2: 16 ford tiles, 146
standable squares, **0 of them connected to any track** — a causeway following
every bend of the channel and joining nothing. The screenshot is unmistakable.

It has always been there. `isWater` asks for cells whose every edge is water
"with or without a track on it", and a ford's `W+P` arms chain to each other
perfectly well ALONG the channel, not just across it. While a ford's bed sat flat
under the water this was invisible; giving it a bar you can walk on made it both
visible and walkable, which is worse than leaving it alone.

## Two fixes tried, both regressed the solver. Numbers, so nobody repeats them

Baseline accepts an attempt around **106–127** of 300.

1. **Hard mask** — off the road, delete every variant presenting `W+P`/`W+B`.
   Ford count fell to 4–5, which is right, and the solve **never accepted a single
   attempt**: 292–296 of 300 on every seed, falling out of the `tries-8`
   settle-for-anything branch. `rej.river` 103–118, `rej.road` 40–61.
2. **Soft preference** — same filter, but skip the cell instead of emptying it,
   with a snapshot restore if propagation fails. Ford count 4–5 again and still
   **FALLBACK on all four seeds**. Narrowing those domains at all is enough to put
   the wet-tile fraction outside `MAP_MIX.water` and `rej.land` eats the attempt.

Note both were caught only because `__wfcDebug.accepted` was checked. `demo-test.js`
passed 12/12 through both of them, and the maps looked fine — the fallback branch
returns a tiling, just not one anything approved.

## THE NEXT JOB — a causeway needs its own socket, `W+C`

The mistake was putting the bar on the `W+P` faces. `W+P` is the river's own
filler as much as it is the crossing, so anything done to it is done to the whole
channel. **The fix is the shape the bridge already proved**: a crossing over
something gets its own socket.

Two pieces, exactly like span/span_flank — a causeway span and a causeway
approach — presenting `W+C` where the bridge presents `W+B`. Then:

- ford-0560/0561/0562 keep their flat beds and stay river filler, unchanged, and
  the along-river causeway cannot happen because a causeway piece cannot chain to
  a plain ford (`W+C` meets only `W+C`).
- The seam contract is safe. This is the reason it CANNOT be done as a variant of
  `W+P`: two pieces presenting the same socket with different profiles disagree by
  0.81 at the edge they share, and `check_seams.py` would rightly say so.
- **No generator surgery at all.** The crossing seed already written for the
  bridge picks the one cell on both seeded lines; let it choose between span and
  causeway on a coin flip. Everything that made the bridge land — the approaches
  being forced because nothing else presents the socket, the road mask, the
  `roadCrosses` `+[PB]` walk (which becomes `+[PBC]`) — is already there.

The alternative root fix — stop the river seed accepting `W+P` at all — needs the
road's line known BEFORE the river is seeded, and `seedPath` both computes a path
and applies it in one pass. Splitting it is a refactor of a delicate function for
no gain the socket does not already give.

## Traps

- **`demo-test.js` cannot see a fallback solve.** It passed 12/12 while every
  attempt on every seed was rejected and the settle-for-anything branch was
  returning the map. If a generator change is made, read
  `__wfcDebug.accepted` — `null` means nothing approved of what you are looking at.
  This is worth a test of its own and does not have one.
- The water level slider is an honest A/B rig for anything depending on the
  waterline: set `wlev.value`, dispatch `input`, wait two rAFs, and `standable`
  changes under you because `WATER_SURFACE` is read every frame.
