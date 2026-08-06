# Iso tile engine — handoff

State as of 2026-08-06. Everything below is committed; the working tree is clean
apart from debris that predates this work.

---

## What this is

A baked isometric renderer. Blender writes three passes per tile (albedo, `_NRM`
normals, `_H` height); `tiles_demo.html` composites them in WebGL and lights them at
runtime. The height pass is the load-bearing one — it is the depth buffer, so
**anything that changes what a pixel's height means changes what occludes what.**

Three sets exist: `stone` and `sandstone` (dungeon, wall-based) and `grass10A`
(outdoor, socket-based, pixel art).

---

## Run it

```sh
cd dnd-character/tools/blender
python -m http.server 8777
# then http://localhost:8777/tiles_demo.html?set=grass10A
```

Pick the set from the dropdown. **Daylight is a checkbox** — on by default for
outdoor sets, off for dungeons. Chrome restores slider positions across reloads, so
if the lighting looks wrong after a refresh, toggle daylight to reset it.

---

## Tools — use these before guessing

| command | what it proves |
|---|---|
| `python shot.py <url> -o x.png --eval "expr" --key e` | screenshots the live page, prints console errors and any expression. Uses the `playwright` python package and its own chromium — **does not need the MCP browser** |
| `node demo-test.js` | 7 checks on the socket solver: sockets well-formed, rotations permute, every abutting pair agrees, maps are not flat / unclimbable / drowned |
| `blender -b -P check_seams.py -- --theme grass10A` | for every pair of tiles whose sockets say they may abut, samples both edge profiles and reports the worst height disagreement in world units |

The last two exist because **the session's two worst bugs were both a comment or a
variable claiming something the code did not do**, and neither was visible in a
screenshot. Measure first.

---

## Bake

```sh
blender -b -P build_tiles.py  -- out --theme grass10A       # 30 tiles, ~25 min
blender -b -P build_props.py  -- out/props                  # furniture + outdoor props
blender -b -P build_actors.py -- out/actors                 # 2 bodies x 4 actions x 8 dirs
blender -b -P build_effects.py -- out/effects               # 4 spell effects
python pack_tiles.py out/grass10A --albedo-q 100            # lossless: pixel sets need it
```

Useful flags: `--rot 0` (bench one rotation), `--manifest-only`, `--action <name>`.

**To bake a subset, name the tiles POSITIONALLY** — there is no `--only`:

```sh
blender -b -P build_tiles.py -- out --theme grass10A grass10A-headland-0450
```

An unrecognised word is read as a tile name, so `--only headland` prints
`SKIP unknown tile --only` / `SKIP unknown tile headland`, renders nothing, and
still says `DONE`. That is worth knowing: it cost two bakes that appeared to
succeed and changed no art, and led to a real fix being called ineffective
because the image compared against it had never been re-rendered.

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

## Next job: wire actors and effects into the demo

`out/actors/actors.json` and `out/effects/effects.json` are written and **nothing
reads either**. The goblin and the fireball exist as ~1000 PNGs that no map displays.
This is the whole remaining gap and it is browser work — use `shot.py` to verify.

The wizard is already loaded and drawn (`wiz[dir][frame]`, `syncSprite`,
`heroRect`); actors want the same treatment generalised over body and action.
`hold_last: ["death"]` in the manifest means death holds its final frame — a death
that loops is a resurrection.

Note `finishBuild` currently skips prop placement for socket sets except the outdoor
table, and `PROP_NAMES` is what the loader fetches.

---

## Also open

- **Drops are a vertical extrusion.** A shore that shelves on every approach needs
  shore/bank corner variants in both chiralities — roughly 8–12 new tiles across the
  three transition families, plus a bake. This is the "make more tiles" item.
- **The mire** is a basin with a pond; fine, but only two variants.
- **Goblin ears read as horns from the front** views; they work from the obliques.
- The dungeon sets still use the wall contract. Both contracts coexist deliberately —
  the manifest decides which a set uses — so nothing needs migrating.
