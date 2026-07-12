# Content Authoring Tools — "Material Maker" — Plan

Companion to `VOXEL_PLAN.md`. A DM/dev-facing content authoring system: define custom
block materials, 3D furniture-style objects, and flat sprite decor, entirely client-side
(no backend — matches [[prefers-no-backend]]), stored in `localStorage`, loaded via the
browser's native file picker.

**Where it lives:** built and proven in `iso3d-engine` (the sandbox) first, matching every
prior step in `VOXEL_PLAN.md`. Once solid, it belongs in Grimoire's **dev mode**, not DM
mode — the user's own words: a content tool, not a session-running tool.

---

## 1. Custom materials (blocks)

A named, user-defined block type, built the same shape as the built-in `BLOCKS` registry
entries — it becomes one by registering into the same shared object at runtime.

**Fields:**
- `name` — display name; slugified to a `type` id (e.g. "Mossy Brick" -> `mossy_brick`).
- `heightBlocks: 1 | 2 | 3` — how many courses this material's *side* texture has:
  - 1: a single side texture used for every course (same as most existing materials).
  - 2: `[topCourse, bottomCourse]` — reuses the **existing** per-elevation `side: [...]`
    array + clamp-on-last-entry mechanic already built for `dungeon_wall`. No mesher
    changes needed — this feature already exists, the material maker just becomes a
    second way to populate it besides hand-editing `BLOCKS`.
  - 3: `[capCourse, midCourse, baseCourse]` — same mechanic, mid repeats on taller stacks
    (already how `dungeon_wall` behaves for a 5-stack).
- **Top face image** — required. Uploaded via `<input type=file>`, drawn into a free atlas
  cell.
- **Bottom face image** — optional; defaults to the bottom-most side course, or the top
  image if neither is given (matches `grass`'s `bottom: DIRT` pattern — reasonable default,
  not required busywork for symmetric materials like stone).
- **Side course image(s)** — 1, 2, or 3 depending on `heightBlocks`.
- **Autotile (top face only)** — optional. Instead of a single top image, upload a **4x4
  sheet (16 tiles)** — a corner-Wang set, generatable today via PixelLab's
  `create_topdown_tileset` (`mode: "pro"`, already verified working — see
  `VOXEL_PLAN.md` Step 8). At mesh time, the top face's 4 corners are sampled for
  same-material neighbors (reusing the exact corner-sampling math already built for AO —
  `vertexAOCounts`'s corner table, just testing "same type" instead of "opaque") to pick
  1 of the 16 tiles. Purely cosmetic, opt-in, exactly as scoped in `VOXEL_PLAN.md`'s
  original "Edge autotiling via corner-Wang" section.
- **Gameplay properties** (stored as data on the block def; not consumed by rendering) —
  render/mesh code never reads these, only a future gameplay layer does:
  - `damage: number` — HP or generic damage dealt per turn standing on / touching it.
  - `slow: number` — extra movement cost (matches Grimoire's existing 5e "difficult
    terrain" concept — this is DATA for Grimoire's engine to consume, not a new rules
    engine living here, per [[voxel-terrain-plan]]'s "Grimoire owns it" principle).
  - `climbable: boolean` — can be climbed (vs walked around).
  - `exit: boolean` — marks a map-transition tile.
  - `light: { color, radius, intensity } | null` — makes placed instances of this
    material a lighting.js point light automatically (same shape as `BLOCKS.torch.light`,
    already built).
  - `translucent: boolean` — "does light pass through this" — maps directly onto the
    existing `def.translucent` flag (already drives both mesh culling rules and the
    shadow-occlusion raycast in `makeLightSampler`/`raycastVoxels` — a translucent
    material is automatically see-through for both rendering and light occlusion, no
    separate wiring needed, this flag already does double duty for glass/water today).
  - **Scope note:** V1 only *captures and stores* these fields. Consuming them (dealing
    damage, applying slow to pathfinding, etc.) is Grimoire's job once this wires in —
    same boundary the whole engine has kept throughout. `climbable` may get a light touch
    in `surface.js` if trivial; not promised for V1.

## 2. Custom 3D objects (furniture, decor)

**File format — a simple JSON box-list**, chosen over glTF/OBJ specifically because this
engine already has a working, tested "list of axis-aligned textured boxes" model (`MODELS`
in `blocks.js` — door/table/chair/torch already work this way) and glTF/OBJ would require a
real mesh parser plus a UV-mapping bridge for zero real benefit at this art style:

```json
{
  "name": "stool",
  "boxes": [
    { "from": [0.3, 0.3, 0.0], "to": [0.7, 0.7, 0.4], "faces": { "all": "wood_planks" } },
    { "from": [0.35, 0.35, 0.0], "to": [0.4, 0.4, 0.3], "faces": { "all": "wood_planks" } }
  ]
}
```

- `from`/`to`: unit-cube coordinates (0-1 per axis), same convention as `MODELS` already
  uses — canonical orientation facing N, mesher rotates for other facings automatically
  (existing `rotateModelBox` — no changes needed).
- `faces`: same fallback shape as block faces (`all` / per-compass-face override), but
  values are **material name strings** (resolved against the built-in + custom material
  registry at load time), not raw atlas ids — so an object definition stays portable/
  human-editable without needing to know atlas cell numbers.
- Loaded via file picker (`.json`), validated, registered into `MODELS` + a new `BLOCKS`
  entry (`model: <objectName>`) exactly like the built-in furniture.
- **Future** (not V1): an in-app 3D box editor that *writes* this format directly instead
  of hand-authoring JSON — the format is designed to make that easy later, not required now.

## 3. Sprite objects (flat billboard decor)

For organic/2D decor (trees, bushes, clutter) — matches the plan's existing "2D billboard
decor stays" design, just making it user-extensible:

- `name`, a single **image upload** (arbitrary size — sprites are NOT packed into the
  32x32 atlas grid; they load as their own standalone textures, same as trees/bushes
  already would once Phase C sprite work happens), `scale`, `maxHeight`.
- Rendered as a camera-facing (or fixed-yaw) billboard standing on the voxel surface —
  reuses whatever billboard pipeline Phase C/units already establish (see
  `VOXEL_PLAN.md` pitfall #5: in-GL alpha-tested quads, not a 2D overlay, for free wall
  occlusion). No new rendering path — sprite *objects* just become data-driven instances
  of that pipeline instead of hardcoded ones.

## 3b. Deleting a material (distinct from removing a placed block)

Two different operations, don't conflate them:
- **Remove a placed block from the map** — already exists (alt+click in the map editor,
  `applyEdit(store, history, c, r, z, null)`). Unrelated to material *definitions*.
- **Delete a material definition** — a Material Maker action: unregister it from `BLOCKS`
  and drop it from the saved library. If any placed instances of that type still exist on
  the current map, they don't get cleaned up automatically (V1 scope) — `buildMesh` already
  silently skips a block whose type has no registry entry (`if (!def) continue`), so an
  orphaned instance just stops rendering rather than crashing. Document this rather than
  build reference-tracking/prevention for V1. The freed atlas cell is not reclaimed/reused
  (ids are handed out sequentially and never recycled) — acceptable given ~48 free slots.

## 4. Storage & atlas allocation

- **Custom materials & 3D objects**: `localStorage` key holding a JSON library (id, name,
  type, face/box data with texture references). Uploaded face images are stored as data
  URLs at their *native resolution*, downscaled to 32x32 (nearest-neighbor, matching the
  atlas convention) only at atlas-draw time — keeps the saved library reusable if the
  atlas layout ever changes.
- **Atlas cells for custom content**: `blocks.js` gets `allocateTexSlot()` — hands out the
  next free cell above the built-ins (id 15+; UNIT is 14). The atlas grid is 8x8=64 cells;
  ~48 free after built-ins. Autotile materials cost 16 cells each, so the practical limit
  is a handful of autotile materials or dozens of simple ones. **Not solved in V1**: what
  happens when the atlas fills up (grow to a bigger atlas texture, e.g. 16x16). Flag it,
  don't silently overflow — `allocateTexSlot()` should throw a clear error past capacity.
- **Registration**: `registerBlock(type, def)` mutates the shared `BLOCKS` object in place.
  Since every existing lookup (`resolveFace`, mesher culling, `surface.js`, `pick.js`) reads
  `BLOCKS[type]` directly, this requires **zero changes** to any existing consumer — a
  registered custom material or object works everywhere immediately.
- **Load order**: on page load, replay the saved library through the same
  `registerBlock`/atlas-draw path used when a material is first created, so a reload
  doesn't lose custom content.
- **Every material/object gets a stable `id`** (the slugified name, e.g. `mossy_brick`) and
  an **export/import button** in the UI dumping/loading its full JSON definition (name,
  height, texture data URLs, properties) — both so the library survives outside
  `localStorage` (backup, sharing) and so the user can hand a specific material's JSON to
  Claude by name in a future conversation ("edit `mossy_brick`, make it climbable") without
  needing to describe it from scratch. The library itself is just an array of these same
  per-material JSON objects, so "export one" and "export the whole library" are the same
  serialization, one item vs many.

## 5. Autotile corner mask (shared with AO)

`vertexAOCounts` already computes, per top-face corner, whether the 2 adjacent + 1
diagonal neighbor are "solid" (for AO). The autotile corner mask is the *same* 3-neighbor
sample, testing "same material type" instead of "opaque" — factor the neighbor-sampling
loop out of `vertexAOCounts` into a shared helper parameterized by the predicate, used by
both AO and autotile corner-mask selection. One piece of geometry math, two consumers.

---

## Decals — a 4th content class, not yet built (2026-07-12)

The engine has three content classes so far: **blocks** (materials, one per `(c,r,z)` voxel
cell), **objects** (furniture, model-shaped, still occupy a voxel cell), and (unbuilt)
**sprites** (flat billboards, see section 3 above). The user identified a 4th: **decals** —
a thin textured overlay that SNAPS TO A SPECIFIC FACE of an already-placed block (not just
the floor) — bloodstains, scorch marks, moss, cracks, a poster/sign on a wall. Distinct from
a block (doesn't replace what's there, `VoxelStore` still keys one block per cell) and from
an object (no volume/collision, purely a flat visual overlay). Likely keyed by
`(c,r,z,faceName)`, rendered as a thin quad offset slightly off that face's plane (same
z-fighting-avoidance inset already used for model boxes, `VOXEL_PLAN.md` pitfall #3). The
original narrower idea — Grimoire's grease/web "paint temporary terrain," floor-only — is a
special case of this; the wall/ceiling-snapped case is new scope beyond what Grimoire already
tracks. Real design work needed before building; not scoped further here.

## Gas/cloud/fog effects — partially covered, spreading/dispersal NOT yet built

A STATIC gas cloud filling a room is just translucent blocks occupying cells — already fully
supported (same rendering path as water/glass, no geometry changes needed). What's NOT built:
**spreading/dispersal over time** and **being pushed/cleared by an effect** (Gust of Wind
blowing away fog/smoke) — this needs an actual simulation tick, not just static placement.
The user wants this treated together with liquid flow (see below) as one general "spreading
volume" system: liquids settle downward under gravity, gases/fog disperse outward/dilute —
likely shared tick infrastructure, different propagation rules. Ambient/atmospheric fog (a
depth-based rendering effect, distinct from fog-as-placed-material) is also unbuilt — no fog
uniform/term exists in `renderer.js`'s shader yet.

## Liquid flow simulation (water/acid/etc.) — not yet built

Any material flagged `liquid: true` should flow/fill space below and spread sideways when
blocked — Minecraft-style source + decreasing-flow-level model, gravity first then lateral
spread, re-evaluated on a SEPARATE slow tick (not every render frame, unlike terrain meshing).
Needs: source-vs-flowing cell state, how spreading mutates `VoxelStore` (new entries vs
moving existing ones), and a **finite vs infinite source** distinction — most sources are
FINITE (a grease/acid barrel: breaking it floods and spreads until its fixed volume is
exhausted and flat, then stops); a few are INFINITE (ocean, a spring, a decanter of endless
water — never run dry). This is a volume/finite flag per liquid SOURCE INSTANCE, not per
material type, since the same material (water) could be either depending on placement.

Key trigger case: breaking a block adjacent to a liquid (a dam wall, or a barrel itself)
should flood the newly-emptied space — `applyEdit` (editor.js) removing a block should flag
that cell's neighbors for the liquid tick to re-check next tick, not rely on a periodic
full-map rescan finding it eventually. Interacts with the existing shadow-occlusion raycast
(translucent already skips liquids for light purposes — reconfirm that still holds once
liquid cells actually move around, not just sit static).

## Sun direction + ambient color/intensity controls — DONE (2026-07-12); fog + cliff-shadow still not built

Adjustable sun direction/height/color/intensity and adjustable ambient color/intensity are
both wired in now, driven by real `lighting.js` `resolveLighting()` profiles for BOTH day and
dungeon mode — `voxel.html`'s `lightMode==='day'` no longer short-circuits
`currentLightProfile()` to `null` (the flat-white pre-lighting look). Surprising discovery
worth recording: **this needed zero changes to `renderer.js`'s GLSL** — this engine already
bakes lighting into per-vertex colors at mesh-build time (`mesher.js`), so "adjustable sun"
turned out to be pure CPU math, same architecture as the existing torch/point-light system.
  - `mesher.js`'s `FACE_SHADE` (previously a FIXED fake-directional table: top=1.0,
    bottom=0.5, etc., regardless of any real sun concept) is now only the fallback for
    callers that pass no `lightProfile` at all (every `tools/voxel_*_check.html` page's
    existing default look — verified byte-identical, see the "no lightProfile -> neutral
    white tint" regression test). When a profile IS given, `computeFaceShadeTable(profile)`
    replaces it: `ambientFloor` is the colorless baseline every face gets regardless of
    orientation, `keyStrength * max(0, dot(normal, sunDir)) * sunColor` adds real directional,
    colored brightening toward the sun — computed once per mesh build (6 entries), indexed
    exactly like the old constant table (zero added per-face cost). `sunDirToVoxelSpace`
    handles the Y-up (lighting.js/Grimoire convention) -> Z-up (this engine's own `c,r,z`
    mesh space) axis swap face normals need to be dotted against correctly.
  - `mesher.js`'s ambient term (`makeLightSampler`) now uses `profile.groundAmbient` (an RGB
    triple already present on every `LIGHT_PRESETS` entry) directly as the base color, instead
    of the old `ambientBase()` colorless step function keyed off the coarse `ambientLevel`
    0/1/2 — this is what makes "ambient light color" genuinely adjustable, not just brightness.
  - `voxel.html` has a new "Sun/Ambient" panel: azimuth/elevation sliders (converted to a
    `sunDir` vector via `sunDirFromAzEl`/`azElFromSunDir`, round-trip-verified against
    `LIGHT_PRESETS.day`'s own sunDir to the 4th decimal), sun color, sun strength
    (`keyStrength`), ambient floor, ambient color. Sliders default to reproducing whichever
    preset (`day`/`dungeon`) is active untouched — a fresh page load or a mode toggle looks
    exactly like the preset until a slider is actually moved. A side effect of day mode now
    flowing through a real profile: light-emitting blocks (torches) now contribute their glow
    in daylight too, previously invisible until switching to dungeon mode — a correctness fix,
    not a regression.
  - Tests: `computeFaceShadeTable` covered directly (directional lit/unlit faces, sunColor
    tinting only the directional term not the floor, missing-sunDir fallback) plus an
    end-to-end test confirming which face of a lone cube renders brightest actually rotates
    with the sun vector (`voxel-mesher.test.js`).
  - **Caveat**: written and tested headlessly (this engine has no browser-screenshot tool
    available in this environment) — the actual visual result has NOT been eyeballed in a
    browser yet. Numerically verified (dozens of new assertions on the underlying math/color
    math), but per this project's own screenshot-checkpoint discipline, treat the *look* as
    unverified until checked in `voxel.html` directly.
  - **NOT built**: cliff/self-shadowing (`sunShadowFactor`, already a tested pure function in
    `lighting.js`, still not called anywhere in `mesher.js`) — scoped out this pass as a
    separate, heavier per-column feature (needs a "topmost solid z" height query, and a perf
    story for calling it per-face on large maps) rather than rushed in alongside the shading
    swap above. Depth-based ambient/sky fog (a `renderer.js` GLSL fragment-shader term) is
    ALSO still not built — unlike the sun/ambient work above, that genuinely does need to open
    the shader.

## Custom light sources — DONE for both materials and objects (2026-07-12)

`customMaterials.js`'s `buildMaterialDef` and `customObjects.js`'s `createCustomObject` BOTH
promote `properties.light`/`properties.translucent` to the top level of the registered
`BLOCKS` def — the exact shape `voxel.html`'s `collectLightPoints()` and the mesher already
read for every built-in (torch/water/glass). A custom "glowing crystal" material or a custom
"brazier" object both already work as real light sources with zero further engine changes —
only the Material Maker's UI checkbox+fields exist today; there is no Object Maker UI panel
yet at all (only the pure `customObjects.js` logic + tests), so creating a custom light-
emitting OBJECT currently requires hand-calling the JS API, not a form.

## Destructibility foundation — DONE, foundation only (2026-07-12)

Both `customMaterials.js` (materials) and `customObjects.js` (objects) now accept and store,
completely inert (nothing reads or acts on these yet — Grimoire's rules engine is where the
actual burning/breaking logic belongs, same boundary as `damage`/`slow`/`climbable`/`exit`):
  - `hp: number` — hit points; absent/null means indestructible (every built-in today).
  - `destroyedType: string` — a material/object id this becomes at 0 HP (a burnt wooden wall
    -> a charred material, a smashed barrel -> rubble/nothing), or a sentinel like `'none'`.
  - `vulnerable` / `resistant` / `immune`: arrays of D&D 5e damage-type strings (acid,
    bludgeoning, cold, fire, force, lightning, necrotic, piercing, poison, psychic, radiant,
    slashing, thunder) — matches Grimoire's own character damage-type vocabulary.
The Material Maker UI has matching fields (HP, destroyed-becomes, vulnerable/resistant/immune
comma lists). Nothing burns or breaks yet — this is only the data foundation, as requested.

## Torch on/off state — data half DONE (2026-07-12), toggle action still Grimoire's job

`blocks.js` now has `torch_off`: same `model: 'torch'` (identical physical stick geometry) as
`torch`, minus the `light` field, so it emits nothing — exactly the `door`/`door_open` pattern
(two independently placeable types, picked from the auto-generated palette in `voxel.html`,
which lists every `BLOCKS` key with zero extra UI wiring needed). What's still NOT built,
unchanged from the original scope: an actual "toggle this cell's type" ACTION triggerable by
skills (Mage Hand), spells, or being blown out — same as `door`/`door_open` themselves have no
in-engine toggle interaction today either (both are placed manually from the palette). That
action belongs in Grimoire's rules layer, not this engine, per the "Grimoire owns it" boundary
this whole plan keeps.

## Other unbuilt material-maker extensions flagged this session (2026-07-12)

- **Emissive light-map texture** — an optional extra cell in a material's own local grid
  (see the pivot note above), sampled in the fragment shader as a self-illumination add-on,
  independent of the `light.color/radius/intensity` point-light mechanic. Shader/renderer
  work not started.
- **Block shape presets — mechanism DONE, catalog partial (2026-07-12).** `blocks.js` now
  exports `SHAPES`, a box-list registry like `MODELS` but MATERIAL-AGNOSTIC: each box face
  resolves through `resolveFace(type, faceName, {facing, depth})` using the placed block's
  own material, instead of `MODELS`' baked-in fixed texture ids — this is what lets any
  material (built-in or custom) pair with any shape independently, the actual ask. A block
  type opts in via `BLOCKS[type].shape = 'column_thin'` (or an array for a shape that varies
  by depth-below-stack-top — a flared column's base/mid/cap needing different box lists, not
  just different textures — via the now-exported `pickDepth()`, same clamp-on-last-entry
  mechanic `side: [cap,mid,base]` textures already use; see `SHAPES.column_base/mid/cap` for
  a worked example). `mesher.js`'s new `def.shape` branch reuses `rotateModelBox` (zero new
  rendering path) and never occludes/is occluded (same rule as models/slabs) — see
  `isFullOpaqueCube`. Tests in `voxel-mesher.test.js` cover: box-count-correct geometry,
  material-driven (not baked) face texture resolution, non-occlusion of neighbors, correct
  per-depth variant selection on a multi-block stack, and a clear throw on an unknown shape
  name.
  - **Shapes authored (18, catalog essentially complete for box-representable shapes, all
    verified by test)**: `column_thick`, `column_thin`, `column_base`/`column_mid`/
    `column_cap` (flared column, depth-indexed), `wall_thin_middle`, `wall_thin_outer`,
    `wall_thin_inner`, `wall_corner`, `door_jamb`, `window_frame`, `pressure_plate`, `pane`,
    `flat_pane`, `table_top`, `table_leg`, `step`, `barrel`. Only steps/stairs got one basic
    variant — more elaborate staircases (spiral, multi-tread) are a future add if ever needed,
    same mechanism, no engine work.
  - **NOT achievable with this mechanism, flagged rather than faked**: slope/half-slope
    (a true ramp needs slanted quads — a new triangular/wedge geometry primitive, since
    `SHAPES` boxes are strictly axis-aligned) and genuinely round columns/barrels (would need
    cylindrical geometry; the square approximations above are the practical substitute this
    engine's art style already uses elsewhere).
  - **Material Maker UI — DONE (2026-07-12).** `customMaterials.js`'s `buildMaterialDef`/
    `createCustomMaterial` accept an optional `shape` (string or depth-indexed array),
    promoted straight to `def.shape`. `voxel.html`'s Material Maker panel has a "Shape"
    dropdown (full block, or any `SHAPES` key) wired through create/import/reload-replay —
    the depth-indexed array form (e.g. a flared column's cap/mid/base) is still hand-assigned
    via the JS API, not exposed as its own UI control (documented in the dropdown's own
    code comment) since it's a rarer, more advanced case than "pick one shape for this
    material."
- **Animated GIF-sourced faces** — each material already has its OWN texture/canvas (post-
  pivot), which makes this cheaper than it would've been against the old shared atlas: keep
  the source `<img>` alive (browsers auto-advance a loaded GIF's frame on their own timer,
  even off-DOM), periodically redraw just that one cell and re-upload just that one
  material's texture via `renderer.setMaterialAtlas`. Not started.
- **Save uploaded textures as real files — DONE (2026-07-12).** `voxel.html`'s new
  `saveTexturesToDisk(materialId, spec)` POSTs every uploaded image (top, each side course,
  bottom, autotile sheet) to `tools/serve.mjs`'s existing `/api/save-texture` route, named
  `<materialId>__top`/`__side0`/`__bottom`/`__autotile`, from both the "Create material" and
  "Import JSON" handlers (NOT from the page-load replay loop — those images are already on
  disk from whenever they were first saved, re-POSTing on every load would be pointless).
  Fire-and-forget: failures (voxel.html opened via `file://`, or served by something other
  than `tools/serve.mjs`) are swallowed to a `console.warn`, never block material creation or
  surface in the UI error box — the material works identically either way, this is a
  durability bonus (git-trackable, survives clearing browser storage), not a requirement.
  Verified with a direct curl POST against the running server.

## Build order

1. `voxel/blocks.js`: `allocateTexSlot()`, `registerBlock()` — small, pure, testable.
2. `voxel/customMaterials.js`: pure logic — build a `BLOCKS`-shaped def from a material
   spec (name/height/properties), corner-mask computation (shared w/ AO), localStorage
   save/load. Tests first, per house style.
3. `voxel/customObjects.js`: box-list JSON validate/parse, material-name-to-texId
   resolution, register into `MODELS`/`BLOCKS`. Tests.
4. Atlas drawing: `drawImageIntoAtlasCell(atlasCanvas, image, texId)` — browser-only,
   isolated function, easy to eyeball-test the same way the PixelLab atlas build was
   verified (screenshot the atlas canvas itself).
5. UI: a "Material Maker" panel in `voxel.html` (or its own page) — file inputs, height
   selector, property fields, save/load-from-library list. Wire last, once 1-4 are proven
   solid in isolation — matches the "verify each layer before the next" discipline that
   would have caught the UV bug earlier if applied to face-orientation math too.

## Pivot (2026-07-12): per-material textures, not a shared global atlas

Steps 1-5 above were originally built against ONE shared 8x8/256x256 atlas (`allocateTexSlot`
handing out cells 16+). The user flagged this as the wrong shape for "just upload a texture
per face" — a shared global atlas means every custom upload fights over ~48 free cells, all
forced to a fixed 32x32 resolution regardless of what's uploaded. Replaced with: **each
material gets its own small texture** (its own local grid — top/side course(s)/bottom/
optional 16-tile autotile — sized to whatever resolution its own top image was uploaded at),
and the renderer does **one extra draw call per custom material in use** (chosen over a
WebGL texture-array approach, which would force all materials back onto one shared
resolution).

What changed:
- `blocks.js`: added `computeGridUV`/`gridCellPixelRect`/`drawImageIntoGridCell` — generic
  versions of `atlasUV`/`atlasCellRect`/`drawImageIntoAtlasCell` parameterized by grid shape,
  used by per-material canvases. The original shared-atlas functions are UNTOUCHED — built-in
  materials (`stone`, `grass`, `dungeon_wall`, etc.) still resolve to plain numeric texIds
  into the one shared `atlas.png`, zero behavior change, zero risk to the ~500 existing tests.
- `customMaterials.js`: `allocateMaterialSlots`/shared-atlas allocation replaced by
  `planMaterialLayout` (pure index math for one material's own grid — always 4 columns) +
  `buildMaterialDef` (produces `{materialId, u0,v0,u1,v1}` ref objects for each face instead
  of plain numeric texIds).
- `mesher.js`: a face's texId is now EITHER a plain number (shared atlas, unchanged path) OR
  a `{materialId,...}` ref (custom material). `buildMesh` returns `{opaque, translucent,
  byMaterial}` — `opaque`/`translucent` are exactly what they always were (the shared-atlas
  buckets); `byMaterial` is new, one `{opaque,translucent}` pair per custom material actually
  present in the built mesh.
- `renderer.js`: `setMaterialAtlas(materialId, image)` creates/updates one GPU texture per
  material. `MaterialBucketSet` tracks one `GLMesh` per material or per ghost-material,
  synced each `setMesh`/`setGhostMesh` call. `render()` does the existing shared-atlas opaque
  pass, then loops `byMaterial` binding each material's own texture for one more draw call,
  same shape for the translucent pass and the ghost preview.
- `voxel.html`: material maker draws each uploaded face into a **fresh per-material canvas**
  sized `layout.cols * cellPx` (cellPx = the top image's own native resolution), not the old
  shared `atlasCanvas`.

Verified via `tools/voxel_material_maker_check.html` (permanent checkpoint, not deleted after
use): two custom materials at two DIFFERENT resolutions, one with a distinct bottom-course
texture, rendered correctly alongside a built-in `stone` block in the same scene.

Still queued on top of this (see task list, not yet built): emissive light-map texture per
material (self-illumination, independent of the point-light radius/color/intensity fields),
block shape presets (walls/columns/slopes/etc., reusing the existing `MODELS` box-list
mechanism — no further rendering changes needed), animated-GIF-sourced faces (each material's
own canvas makes this cheaper than it would've been against a shared atlas — redraw+reupload
touches only that one material's texture), saving uploaded source images as real files via a
new `tools/serve.mjs` `/api/save-texture` route (so they can be committed to git rather than
living only in `localStorage`), and liquid flow simulation (unrelated to this pivot, its own
tick-based system).
6. Screenshot checkpoint: define one custom 2-tall material with distinct top/course
   textures via the UI, place it, confirm visually — same checkpoint discipline as every
   other `VOXEL_PLAN.md` step.
