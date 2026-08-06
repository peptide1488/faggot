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
