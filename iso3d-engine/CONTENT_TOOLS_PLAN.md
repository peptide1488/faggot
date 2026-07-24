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

**DONE (2026-07-13) — in-app 3D box editor.** Previously flagged "Future, not V1" — built now.
The Object Maker panel gets a visual box-list editor above the raw JSON textarea: each row is
one box (6 number inputs for `from`/`to`, plus a single material dropdown covering the common
`faces.all` case — per-face-different-material objects still go through the raw JSON path
below, an accepted "common case visually, edge case via JSON" scope line, not a regression from
today). "+ Add box" appends a row; "Build JSON from boxes" assembles a spec (normalizing each
box's `from`/`to` via min/max per axis, so entering them in either order still produces a valid
`from < to` spec) and writes it straight into the existing `objSpecBox` textarea — the actual
create/import/validation path (`validateObjectSpec`, `createCustomObject`) is completely
unchanged, so the visual editor is just an alternate way to produce the exact same JSON a human
would've typed, not a second code path to keep in sync.
- **Live 3D preview**, not just a flat form: `mesher.js`'s new `buildMultiBoxMesh(boxes,
  lightColor)` merges any number of already-resolved MODELS-shaped boxes into one mesh buffer
  (no VoxelStore cell, no occlusion culling — this is a standalone, not-yet-placed preview),
  reusing `resolveMaterialTexId` (customObjects.js, already existed) to resolve each row's
  material dropdown to a real texture. `renderer.js` gets a small dedicated `objPreviewMesh`
  (same "own small GLMesh buffer, rebuilt often" pattern `unitMesh` already established for
  units moving every frame), drawn in the opaque pass.
- **Positioning**: rebuilt every frame while the panel is open (`voxel.html`'s `tick()`,
  `updateObjPreview`), floating a few blocks above wherever the camera currently looks (the
  camera's own `target`, world-space, converted to grid space via the same self-inverse y/z
  swap `buildBillboardMesh`'s caller already uses) — a "held item" preview that stays visible
  through pan/zoom/orbit without needing a fixed, easy-to-lose world location. Cleared (set to
  null) when the panel is closed or the box list is empty.
- Tests (`tests/voxel-mesher.test.js`): `buildMultiBoxMesh` merges N boxes into their full
  quad count with no occlusion between them, and a box missing a face's material entirely
  (no `all` fallback) skips just that face instead of crashing on an undefined texture id.
  Visual correctness of the live preview itself (does it look right, does it track the camera
  smoothly) is UNVERIFIED — needs a live look, same outstanding gap as every other visual
  feature flagged elsewhere in this doc.

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

**DONE (2026-07-13) — Billboard Maker, true camera-facing (not fixed-yaw).** Built as a
5th content class, distinct from Object Maker (fixed 3D box geometry baked into the static
mesh on `markDirty`): a billboard is a single transparent-PNG quad that always faces the
camera and is rebuilt every render frame, since this engine's camera orbits freely
(right-drag), not just in fixed 90° steps.
- New `voxel/billboards.js` (pure logic, mirrors `decals.js`): `BillboardStore` (one
  billboard per cell, keyed by `c,r,z` — no face, unlike decals), `BILLBOARD_TYPES`
  registry (`id, name, size` [world-space height], `aspect` [image width/height, computed
  from the uploaded PNG's own natural dimensions at upload time, so art never stretches]),
  `createBillboardType`, localStorage library wrappers.
- `mesher.js`'s new `buildBillboardMesh(billboardStore, typeLookup, camRightGrid, store,
  lightProfile)`: locked to "upright" axis-aligned billboarding (only the camera's
  *horizontal* facing picks the quad's left/right axis — a tree never leans over as the
  camera pitches, only spins to face it), one bucket per billboard type, one quad per
  placed instance. `camRightGrid` is the camera's live right vector, pre-converted to this
  module's own grid-space (c,r,elevation) convention by the caller (a self-inverse y/z
  swap, same op `renderer.js`'s `gridPositionsToWorld` already does) — kept consistent with
  every other mesher.js output rather than adding a second, world-space-only mesh path.
- `renderer.js`: `billboardTextures` Map + `billboardSet` (`MaterialBucketSet`, one extra
  draw call per billboard type in use — same shape decals/custom materials already use),
  drawn in the **opaque** pass (depth-written, `CULL_FACE` disabled just for this call since
  the quad's winding sign depends on the live camera vector and a flat quad has no "inside"
  to hide by drawing both sides). Cutout relies entirely on the fragment shader's existing
  `if (tex.a < 0.02) discard;` — no alpha blending, so no back-to-front sorting concern
  (`VOXEL_PLAN.md` pitfall #6) the way real translucent geometry has.
- `voxel.html`: "Billboard Maker" panel (name, PNG upload, size slider) + a "toggle
  billboard mode" placement mode (left-click places into the empty cell *above* the
  clicked surface — same "adjacent, not the clicked block" placement objects/torches use,
  unlike decals which snap directly onto the clicked face) alongside unit-move/decal/gust
  modes (all five now mutually exclusive). `tick()` rebuilds the billboard mesh
  unconditionally every frame (not gated by the `dirty` flag like everything else), feeding
  it the camera's current right vector recomputed that same frame. Saved/loaded as a third
  key (`billboards`) in the combined map JSON, alongside `voxel`/`decals`.
- Verified: 33 new headless tests (`tests/voxel-billboards.test.js`) covering the store,
  type registry, and mesh geometry (bucket-per-type, orientation tracks camera right vector
  and stays upright, standing from the cell's own floor to `z+height`, reads real
  sun-direction lighting rather than flat full-bright). Visual correctness (does it actually
  look right in the browser — cutout edges, upright orbiting, occlusion against walls) is
  UNVERIFIED — needs a live look per this project's own established discipline (headless
  tests can't catch a shading/geometry issue the way eyes can).

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
  is a handful of autotile materials or dozens of simple ones.
  **Resolved by the per-material-texture pivot below (2026-07-12), not by growing the atlas
  (2026-07-13):** custom materials/objects stopped calling `allocateTexSlot()` entirely once
  each got its own small texture — grep confirms zero call sites left outside the 15 fixed
  built-ins, which never grow. `allocateTexSlot()`/`TEX_CUSTOM_START` still exist (harmless,
  unreachable from any content-creation path) purely for the built-in shared atlas's own
  internal bookkeeping. There is no overflow case left to solve for user-created content.
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

## Slope/ramp geometry (WEDGES) — DONE (2026-07-13), not yet visually verified live (no browser-screenshot tool in this environment)

The one genuinely new geometry primitive beyond SHAPES' axis-aligned boxes: `blocks.js` gets
`WEDGES`, currently one entry (`ramp`) — a right triangular-prism ramp ascending from zero
height at the north (front/low) edge to full height at the south (back) edge, the same
"climb it walking south" convention `SHAPES.step` already established, so facing rotation reads
consistently across both (front points toward `facing`, climbing direction is the opposite —
same convention `door`'s own rotation already uses). Each `WEDGES` entry is a list of faces,
each an explicit list of 4 `{pos:[x,y,z], u, v}` canonical corners (not a `from`/`to` box —
mesher.js can't derive a slanted face's corners/UV from a simple axis-aligned range) — a
genuinely TRIANGULAR face (the wedge's 2 vertical end caps) is written as a quad with its last
corner repeating the 3rd, so `pushQuad`'s existing 2-triangles-per-quad split just produces one
degenerate (harmless, zero-area) triangle and one real one, with no separate triangle-emission
code path needed anywhere.

`mesher.js`'s new `def.wedge` branch (parallel to `def.model`/`def.shape`, same "occludes
nothing, never occluded" rule): rotates each face's canonical corners via the SAME `rotateXY`
box-shape rotation already uses (a pure yaw, z unchanged), resolves texture via
`resolveFace(type, rotateFaceName(face, facing), {facing})` (identical pattern to SHAPES boxes),
and — the one genuinely new piece — computes the face's REAL outward normal directly from the
(already-rotated) corner positions via cross product, rather than a `FACE_AO` lookup table
(which only has the 6 axis-aligned directions; the ramp surface isn't one of them). This
required factoring `computeFaceSunTable`/`computeFaceBounceTable`'s per-face-table math down
into reusable per-NORMAL primitives (`faceSunLit`, `directionalBlend`, both now exported) so the
slanted face gets genuine sun/bounce lighting instead of skipping it — verified end-to-end by a
test asserting a sun direction chosen to align exactly with the ramp's own hand-derived slanted
normal produces `sunLit≈1` (would fail if the mesher silently treated the ramp as a flat "top"
face instead). AO/directional-ambient/point-light sampling still key off the nearest CANONICAL
face name (an accepted approximation — `cellFaceAO`/`makeLightSampler`'s ambientDirTable only
support the 6 axis-aligned entries, same approximation every other non-strictly-axis-aligned
SHAPES box already makes).

Wired into the Material Maker: the existing "Shape" dropdown now also lists `WEDGES` keys
(prefixed `wedge:`, since a material can only have one of `shape`/`wedge` set — the dropdown
value's prefix is stripped and routed to the right field at create time), and
`customMaterials.js`'s `buildMaterialDef`/`createCustomMaterial` accept an optional `wedge`
alongside `shape`, promoted straight to `def.wedge`.

Tests (house style, written alongside the implementation): quad count (5 quads: bottom, back
wall, 2 end-cap triangles, slanted top), non-occlusion of a solid neighbor, texture resolution
via `resolveFace` (material-driven, not baked), the sun-alignment normal-correctness check
above, facing rotation (verified the back/high wall's world position matches the expected edge
for both facing=N and facing=E, confirming `rotateXY`/`rotateFaceName`'s forward-rotation
convention is consistent with the wedge's hand-derived corner winding), and an unknown-wedge-
name throw (matching `SHAPES`' own error-on-typo behavior).

**DONE (2026-07-13) — round/cylindrical geometry (barrels, round columns), via `makeRoundedPrism`.**
Corrected an earlier call in this doc that this needed "a different, bigger primitive" — it
didn't. A regular N-sided prism (the standard approximation every voxel engine uses for round
shapes) is built from exactly the same `{face, quad}` corner-list shape the hand-authored `ramp`
above already uses, just generated programmatically instead of typed out by hand — `def.wedge`'s
rendering path in `mesher.js` needed zero changes. `blocks.js`'s `makeRoundedPrism(sides,
profile)` takes a `[z, radius]` control-point list (2 points = a straight prism; more points can
taper/bulge per tier) and emits side quads between every consecutive ring plus fan-triangulated
caps at the first/last ring only. Two new `WEDGES` entries: `column8` (a straight octagonal
prism, radius 0.5 — a round pillar) and `barrel8` (a 5-ring tapered/bulged profile — narrow at
both the base and lid, bulging out in the middle, the classic barrel silhouette). Each side
quad's texture/AO still resolves against whichever of the 4 canonical face names its outward
normal is nearest to (same accepted approximation every non-axis-aligned SHAPES/WEDGES face
already uses). Both show up in the Material Maker's existing "Shape" dropdown automatically
(it lists `Object.keys(WEDGES)`, no UI changes needed). Tests (`tests/voxel-mesher.test.js`):
quad counts for both (24 for column8, 48 for barrel8), non-occlusion, every one of column8's 8
side quads independently verified to wind with an outward-pointing normal (not just one
hand-picked face) via the exact cross-product check the ramp's corners were hand-verified
against, both cap rings' normals verified to point the correct vertical direction, and a direct
check that barrel8's radius profile genuinely narrows at the ends and bulges in the middle
(not just column8 relabeled). No depth-indexed variant (unlike SHAPES' column_cap/mid/base) —
still not needed, prisms aren't typically stacked with varying courses. Visual correctness
(does an actual octagon read as "roughly round" at this voxel's on-screen scale) is UNVERIFIED
— needs a live look, same outstanding gap as ramp/decals/billboards above.

## Decals — a 4th content class — DONE (2026-07-13), not yet visually verified live (no browser-screenshot tool in this environment)

The engine has three content classes so far: **blocks** (materials, one per `(c,r,z)` voxel
cell), **objects** (furniture, model-shaped, still occupy a voxel cell), and (unbuilt)
**sprites** (flat billboards, see section 3 above). The user identified a 4th: **decals** —
a thin textured overlay that SNAPS TO A SPECIFIC FACE of an already-placed block (not just
the floor) — bloodstains, scorch marks, moss, cracks, a poster/sign on a wall. Distinct from
a block (doesn't replace what's there, `VoxelStore` still keys one block per cell) and from
an object (no volume/collision, purely a flat visual overlay).

Built as an entirely separate module, `voxel/decals.js` — no `BLOCKS`/`registerBlock`
involvement at all, since a decal isn't a placeable block type:
- **`DecalStore`**, keyed by `(c,r,z,faceName)` (`decalKeyFor`/`parseDecalKey`), same shape
  discipline as `VoxelStore` (`get`/`set`/`remove`/`has`/`entries`/version-tagged
  `toJSON`/`fromJSON`). A cell can hold a full block AND up to 6 independent face decals
  simultaneously — genuinely a separate store, not a field on the block string.
- **`DECAL_TYPES`** registry (`registerDecalType`/`deleteDecalType`/`createDecalType`) — just an
  id+name, no top/side/bottom courses like a material needs (a decal only ever has ONE face
  image); `createDecalType(name)` reuses `customMaterials.js`'s own `slugify` for a consistent
  id convention across every content type. `loadDecalTypeLibrary`/`addDecalTypeToLibrary`/
  `removeDecalTypeFromLibrary` reuse the same `contentLibrary.js` `makeLibrary` helper
  materials/objects already share.
- **`mesher.js`'s `buildDecalMesh(store, decalStore, opts)`**: a sibling to `buildMesh`, one
  mesh bucket PER DECAL TYPE (`{ byType }`) — same "one texture, one extra draw call per item"
  shape `byMaterial` already established, so `renderer.js`'s existing `MaterialBucketSet` class
  is reused VERBATIM (it was already generic, keyed by a plain string id) via a new
  `decalSet`/`setDecalTexture`/`setDecalMesh`. Each decal emits one quad, inset slightly off its
  host face's plane along that face's own normal (`DECAL_INSET`, the same z-fighting-avoidance
  convention model boxes already use — `VOXEL_PLAN.md` pitfall #3), textured with a NEW
  `decalUVCorners` helper (reuses `faceLocalFracs`' existing per-face axis selection, but maps
  straight to the decal's own full 0..1 image fraction — no atlas-cell snapping needed, since a
  decal is always one whole standalone image). Lighting/AO reads the HOST cell's own
  `cellFaceAO`/`makeLightSampler`/sun+bounce tables (via the same `faceSunLit`/table lookups
  `buildMesh` uses) so a decal reads as part of the surface it's stuck to, not a flatly-lit
  floating sprite — verified by a test asserting a decal near a torch renders brighter than an
  identical one far away.
- **`renderer.js`**: decals draw in their own pass right after the translucent pass (depth-
  tested-but-not-written, alpha-blended) — not part of the shadow-map pre-pass (same v1 scope
  limit translucent geometry already has).
- **`voxel.html`**: a "Decal Maker" panel (name + single image upload — no grid layout UI
  needed, unlike the Material Maker) with create/import/export/library, replay-on-load loop.
  Placement is a new `decalMode` (toggle button, mutually exclusive with unit-move mode) —
  left-click places the currently library-selected decal type on the raycast hit's OWN
  `hit.face` (not the adjacent cell, unlike normal block placement — `pick.js`'s
  `raycastVoxels` already returns this, no new picking code needed), alt+click removes it. Map
  export/import now saves `{ voxel, decals }` (still accepts a bare pre-decals `VoxelStore`
  export for backward compatibility with maps saved before this).

Tests (`tests/voxel-decals.test.js`, house style — written alongside the implementation):
`DecalStore` get/set/remove/has/entries/save-load round-trip (including that two different
faces of the SAME cell are genuinely independent slots, unlike a block), the decal-type
registry + library persistence, and `buildDecalMesh` (bucket-per-type, inset-off-plane
positioning, and the host-cell-lighting integration test above).

The original narrower idea — Grimoire's grease/web "paint temporary terrain," floor-only — is a
special case of this general mechanism (a decal on a cell's own `top` face).

## Gas/cloud/fog effects — spreading/dispersal DONE (2026-07-13), "pushed by an effect" NOT built

A STATIC gas cloud filling a room was already fully supported (translucent blocks occupying
cells, same rendering path as water/glass). What this session added: an actual simulation tick
for **spreading/dispersal over time**, built as the shared infrastructure liquid flow (below)
is meant to extend — new `voxel/spread.js`:

**DONE (2026-07-13) — user-authorable gas materials.** Previously `gas: true` only existed on
one hardcoded built-in (`fog`, placeholder-textured via `TEX.GLASS`). The Material Maker now
has a "Gas (spreads/disperses)" checkbox — `customMaterials.js`'s `buildMaterialDef` promotes
`properties.gas` to the top level (`def.gas`, same promotion `translucent`/`light` already get,
since `spread.js`'s `isGasType` reads it there directly) AND forces `solid:false`/`opaque:
false`/`translucent:true` whenever it's set, regardless of whatever the separate "Light passes
through" checkbox was left at — a gas material can never be a solid or opaque cube (it has to
be walkable-through and spreadable-through, see `isOpenCell`/`stepGas`), so checking the one
box is enough on its own, matching the built-in `fog`'s exact shape. Any custom-uploaded texture
now works as a real gas/smoke/poison-cloud material, not just the one placeholder. Tests
(`tests/voxel-customMaterials.test.js`) cover the promotion, the forced solid/opaque/translucent
override, and that a material WITHOUT the gas property keeps the ordinary solid cube defaults
untouched.

- **`stepGas(store, lifeMap, dirtyCells)`** — one GENERATION per call, not a full-map rescan:
  only `dirtyCells` (threaded across calls by the caller, `voxel.html`) get re-evaluated. A gas
  cell (any `BLOCKS` type flagged `gas: true` — new built-in `fog`, placeholder-textured, real
  fog/smoke art not made yet) carries an integer `life` (starts at `GAS_MAX_LIFE=60` — raised
  from an original 8 after live testing found it dissipated in ~3 seconds, before a cloud even
  finished spreading into a room; 60 is a 24-second unconfined lifetime at the 400ms tick rate)
  in a
  SEPARATE side `Map` (`lifeMap`, keyed like `VoxelStore`'s own cell keys) — deliberately NOT
  encoded into the block string, so `blocks.js`'s `parseBlock` grammar stays completely
  untouched. Each tick: spreads into ONE open empty neighbor cell (gradual, visible dispersal
  rather than instantly filling a room in one generation), and loses 1 life ONLY when
  UNCONFINED (at least one non-solid neighbor) — a fully sealed gas-filled room never fades on
  its own, matching "a STATIC gas cloud... already fully supported" for the steady state, while
  an open gas cell eventually dissipates entirely once life hits 0. Spreading and
  confinement/dilution are independent — an enclosed room still fills with gas over several
  ticks (spreading has empty targets to claim), it just never fades once full.
- **`markGasDirty(dirtySet, c, r, z)`** flags a cell + its 6 neighbors; a gas cell that exists
  keeps re-adding itself to the returned `nextDirty` EVERY tick for as long as it's alive (an
  unconditional `nextDirty.add(key)` per processed cell), so once seeded it self-perpetuates and
  automatically re-examines the CURRENT store state each generation — an edit elsewhere near an
  existing gas cell is picked up on that cell's own next natural tick with no separate "did
  something change nearby" bookkeeping needed. External `markGasDirty` calls are only needed to
  SEED a newly-placed gas cell into the cycle (`voxel.html`'s `handleEditClick` calls it after
  every edit, cheap no-op for non-gas edits) and to reseed a freshly-imported/loaded map (a
  one-time scan at import/page-load, not per-tick).
- **`voxel.html`** wiring: a separate `setInterval` (`GAS_TICK_MS=400`, deliberately NOT tied to
  `requestAnimationFrame`'s render `tick()` — the plan's own "a SEPARATE slow tick, not every
  render frame") calls `stepGas` then `markDirty()` only if something changed; skipped entirely
  when `gasDirty` is empty (zero cost on every map with no gas, matching every other opt-in
  feature's "existing tests/maps see zero behavior change" discipline).
- Tests (`tests/voxel-spread.test.js`, house style): spreads exactly one neighbor per
  generation (not all 6 at once), a fully sealed gas cell never loses life across many ticks, an
  unconfined one dissipates entirely once life runs out, a sealed ROOM still fills with gas over
  several ticks despite never fading, and stale `lifeMap` entries for cells that are no longer
  gas (removed, or retyped) are cleaned up without crashing.

**DONE (2026-07-13) — being pushed/cleared by an external effect.** `spread.js`'s
`clearGasInRadius(store, lifeMap, dirtySet, cx, cr, cz, radius)`: a Chebyshev-cube (not
spherical) removal of every gas cell within `radius`, deleting the block, clearing its
`lifeMap` entry, and flagging the region dirty so neighbors re-evaluate next tick — an
explicit instant "clear this region" call, wired into `voxel.html` as a "Gust of Wind"
placement mode (`gustMode`, mutually exclusive with unit/decal/billboard modes): click a cell
to instantly clear gas in a fixed radius (`GUST_RADIUS=3`) around it. A discrete triggered
event, not a continuous force.

**DONE (2026-07-13) — continuous directional push, too.** `stepGas` now also takes an optional
4th `wind` param (a `[dc,dr,dz]` direction vector) that RANKS a gas cell's open-neighbor
spread targets by alignment with the wind every tick (a stable sort, so ties keep
`NEIGHBOR_OFFSETS`' original order) — a persistent drift rather than the one-shot removal
above, so a gas cloud visibly streams downwind over many generations instead of spreading
evenly in all directions. Omitting `wind` (the default) is byte-identical to before this
existed. Wired into `voxel.html` as a "Wind" dropdown (None/N/E/S/W) feeding the gas tick's
`stepGas` call directly. Tests (`tests/voxel-spread.test.js`): confirms the no-wind baseline
(spreads in `NEIGHBOR_OFFSETS`' own default east-first order), that each of two different wind
directions overrides that default, that only one target still spreads per tick even with wind
set, and that a wind favoring a BLOCKED direction still spreads into the best available open
neighbor rather than refusing to move at all.

**Real bug caught live, fixed same session**: raising `GAS_MAX_LIFE` (to fix "gas disappears
too quick") silently broke spread REACH too — `life` doubled as both "how long a cell lingers"
and "how many hops the frontier can still travel" (a new cell inherited `life-1` from its
parent), so a longer lingering time was mathematically the same knob as a longer spread
distance. At life=60 a single release could travel ~59 cells from its source, easily enough to
blanket an entire 32x32 map (user-reported: "it fills up the entire map"), and — since Gust of
Wind/wind-push became imperceptible once gas is already everywhere — this also fully explained
two more reports that looked like separate bugs ("gust of wind isn't working", "the north
south stuff isn't working either") but weren't; both were downstream symptoms of the same root
cause, not independent issues in the clear/wind code itself. Fixed by splitting the ONE `life`
number into two independent per-cell numbers: `life` (unchanged meaning, still 60) and a new
`hops` (spread-reach budget, new `GAS_SPREAD_RADIUS=8` constant — 8 restores the exact spread
footprint the original life=8 implicitly had, before anyone noticed it was too small a
*lifetime* to also complain about the *reach*). A newly spread cell now gets a FRESH `life`
(not `life-1`) but an inherited `hops-1`, so a settled cloud lingers/fades together on one
schedule instead of the frontier dying first while the source cell is still going. `lifeMap`'s
value shape changed from a plain integer to `{ life, hops }` accordingly (an internal detail —
external callers only ever create an empty `Map()` and pass it through, never read individual
entries). Tests updated/added: the new decoupling itself (a fresh spread target gets full life
but decremented hops), and a dedicated regression test placing gas in a long open corridor and
running many more ticks than `GAS_SPREAD_RADIUS` (but still well within `GAS_MAX_LIFE`),
asserting it never travels past the hop cap — the exact scenario that broke live.

**Follow-up real bug, caught live**: the radius fix above did NOT fully explain "Gust of Wind
isn't working" after all — user-reported again post-fix. Root cause: `clearGasInRadius` flags
its cleared region dirty so gas "just outside can drift back in" (intentional, so a gust
doesn't leave a permanent hole forever), but with a much larger still-actively-spreading cloud
around a small clear radius, that drift-back-in happened within the very next ~400ms tick —
the clear WAS real, it just read as nothing happened because the gap closed before anyone could
perceive it. Fixed with a cooldown: `clearGasInRadius` takes an optional `cooldownMap` param
and enters every cell it clears at `GUST_COOLDOWN_TICKS=10` (~4s); `stepGas` refuses to spread
INTO any cell still in that map. Decaying the cooldown turned out to need its OWN function
(`tickGustCooldown`), called separately/unconditionally by `voxel.html`'s tick, NOT from inside
`stepGas` gated behind `dirtyCells` — the gas dirty-set typically goes completely empty within
one tick of a gust clearing the only gas around (a cleared cell with nothing left to do drops
out of `nextDirty` immediately), which would have silently frozen the cooldown at whatever
count it happened to reach instead of expiring in real time. `window.__voxel.clearGas` and the
Gust of Wind placement mode both now thread the same shared `gasGustCooldown` Map through.
Tests: a small clear inside a long still-spreading corridor stays empty through the whole
cooldown window (the literal repro of the bug), then gets refilled normally once
`tickGustCooldown` actually expires it; `tickGustCooldown` itself decrements/drops entries
independent of `stepGas`.

**DONE (2026-07-13) — gas volume selectable for spells (e.g. Cloud Kill).** New
`getGasCloudCells(store, c, r, z)` (spread.js): flood-fills every CONNECTED cell of the same
gas type from a starting cell (6-neighbor connectivity, stopping at solid geometry, empty
space, or a DIFFERENT gas type — two adjacent-but-distinct clouds never merge into one
selection), returning the full `{c,r,z}` list. Pure query, never mutates store/lifeMap. This is
what a spell needs to act on "the whole cloud" rather than one cell at a time — the actual
rules (who's inside, how much damage) are Grimoire's job, same rules-vs-data boundary every
other gameplay hook here (light, damage, vulnerable/resistant/immune) already keeps. Exposed on
`window.__voxel.getGasCloud(c,r,z)` (and a `clearGas(c,r,z,radius)` wrapper around
`clearGasInRadius`) for external callers. Tests cover an L-shaped connected cloud (including
around the bend), that a disconnected same-type cell elsewhere isn't pulled in, that an
adjacent but DIFFERENT gas type is correctly kept as its own separate selection, and empty/
non-gas starting cells returning `[]` rather than crashing.

Ambient/atmospheric depth-based fog as a rendering effect is also DONE separately, see the
"Depth-based ambient/sky fog" entry above (a `renderer.js` shader term, unrelated to this
gas-as-placed-material simulation — distinct concepts that happen to share the word "fog").

**DONE (2026-07-14) — gas/fog rendered as genuine per-fragment volumetric haze, no cube
geometry or texture at all.** User feedback (twice, bluntly): a first pass that gave gas cells a
flat-tinted, texture-less cube still "sucks" and "isn't actually volumetric" — a colored box is
still a box. The real ask, stated directly: reuse the ACTUAL vertical-fog technique (a soft
per-fragment world-position blend applied to whatever's already drawn, no hard edges) bounded to
each gas cloud's own volume instead of a global Y-band — not a new material type on cube
geometry. Reworked from scratch:
- `mesher.js`'s `buildMesh` now skips any `def.gas` block ENTIRELY (`if (def.gas) continue;`,
  checked before any face resolution) — a gas/fog cell emits zero quads, period.
- `blocks.js`'s `fog`/`gas` entries drop their `all` face ref completely (nothing ever resolves
  a face for them again) and keep only `gasFogColor`/`gasDensity` as plain data.
- `renderer.js`: FS_SRC gets a small fixed-size uniform array (`MAX_GAS_VOLUMES=6`:
  `uGasBoxMin/Max/Color/Strength[]`, `uGasVolumeCount`) looped over EVERY fragment this shader
  draws (terrain, water, units, everything) — for each active cloud, a per-axis soft-edged ramp
  (`gasAxisFalloff`, the exact same smoothstep shape `uVFogStrength`'s height-band already uses,
  just applied to all 3 axes and multiplied together) blends the fragment's already-computed
  color toward that cloud's own tint, with NO lighting/sun/bounce consulted at all — a cloud
  reads as atmospheric haze sitting in the scene, not a shaded solid. `setGasVolumes(list)`
  uploads the whole list once per frame (one `uniform3fv`/`uniform1fv` call per array, not one
  call per slot).
- `voxel.html`'s new `recomputeGasVolumes()`: every gas tick, scans the store for gas cells,
  groups them into connected clouds via the existing `getGasCloudCells` flood-fill (one cloud =
  one box, so "clouds connect to each other" falls out for free — no separate connectivity code
  needed), computes each cloud's world-space AABB (the same grid->world y<->z swap
  `gridPositionsToWorld` uses, applied by hand here since this is bounding-box math, not a vertex
  buffer), reads that cloud's material's `gasFogColor`/`gasDensity` straight off `BLOCKS[type]`,
  and calls `renderer.setGasVolumes(...)`.
- Custom gas materials (Material Maker's "Gas" checkbox) skip the entire texture/canvas/layout
  pipeline too — just a color picker + density slider, no image upload possible or required;
  `customMaterials.js`'s `buildMaterialDef` branches early on `properties.gas` to a bare
  `{solid:false, opaque:false, gasFogColor, gasDensity}` def, skipping shape/wedge/autotile
  entirely (accepted as inert inputs rather than erroring, since a gas material has no geometry
  to apply them to).
- **Known accepted limitation, same as vertical fog's own**: this only tints fragments that are
  ACTUALLY DRAWN — a cloud floating in genuinely empty air with nothing else behind it in a
  given screen pixel (open sky, no floor/wall/water there) won't show through in that exact spot,
  since there's no fragment for the shader to blend. Covers the real use case (gas filling a
  room, sitting over ground, drifting through a corridor) correctly; a true screen-space
  volumetric raymarch (paints INTO empty space too) would be a much bigger, separate feature —
  not attempted here.
- **Real bug caught during this rewrite**: a GLSL comment inside the FS_SRC template literal
  used literal backtick characters for emphasis (`` `margin` ``) — since FS_SRC is itself a JS
  template string, those backticks terminated it early, and the rest of the shader source got
  parsed as real JavaScript, throwing `Unexpected identifier 'margin'` at import time. This is
  exactly why gas/fog were reported as "completely invisible" right after the first cut of this
  rewrite landed — the whole `renderer.js` module was failing to load, not a rendering logic
  bug. Fixed by removing the backticks from the comment; a reminder that GLSL source strings in
  this file can never contain a literal backtick anywhere, even inside a comment.
- Tests: `buildMaterialDef`'s new gas branch (no top/side/bottom/shape/wedge/autotile at all,
  `gasFogColor`/`gasDensity` pass through cleanly). The shader/renderer/voxel.html wiring itself
  is GL-dependent and not node-testable — verified via real dynamic `import()` on every touched
  module (this project's own established discipline after the exact "syntax error missed by
  node --check" lesson above repeated itself here) and the full `node --test` suite staying
  green throughout.

**Follow-up, same day — user confirmed it looks right, then asked for it denser + a real
"Gasses" material class (density/color/spread behavior/damage) + weight + wind interaction.**
Built out in full:
- **Density bump**: built-in `fog`/`gas` `gasDensity` raised 0.3→0.45 and 0.35→0.5; the Material
  Maker's own default/slider matches (0.5).
- **Per-material spread radius**: `stepGas` now reads `BLOCKS[type].gasSpreadRadius` (falling
  back to the shared `GAS_SPREAD_RADIUS=8` for anything that doesn't set one — zero regression),
  so a dense poison cloud can be authored to only ever reach a few tiles while a wispy smoke
  reaches much further, independently per material. Material Maker gets a "Max spread radius"
  number field.
- **Weight (this is what makes real smoke possible, not just heavy gas)**: `stepGas` takes a
  per-material `gasWeight` (a continuous number, not a binary heavy/light toggle) — 0 (every
  built-in, the default) is a true no-op; positive biases spread toward -z (sinks/pools along
  the floor, like chlorine or CO2); negative biases toward +z (RISES — steam, smoke). Implemented
  by ADDING the weight to whatever ambient wind vector is already active (`effectiveWind.z =
  (wind.z||0) - gasWeight`) rather than replacing it, reusing the exact same dot-product sort the
  wind feature already established — both forces genuinely combine (a strong wind can still push
  a heavy gas sideways while it sinks), verified by a dedicated test where a strong wind
  out-competes a weak weight bias for the first spread choice. Material Maker gets a Weight
  slider (-3..3) with an inline explanation of the sign convention.
- Custom gas materials (Material Maker's "Gasses" checkbox — relabeled from "Gas" to read as its
  own distinct class, not a checkbox buried in the generic form) already had color+density; now
  also weight+spread-radius, plus the EXISTING generic damage/slow/climbable/exit/hp/vulnerable/
  resistant/immune fields (shared with every other material type via `collectMatProperties()`)
  stay fully available and apply to gas materials too — asked for directly ("damage and stuff"),
  already wired since those are inert per-material data regardless of material class, same
  rules-vs-data boundary every gameplay hook in this engine keeps (Grimoire reads/applies them,
  the engine only carries the data).
- Tests (`tests/voxel-spread.test.js`): a positive-weight gas sinks by default instead of the
  usual east-first order, a negative-weight gas rises, weight=0 is byte-identical to before this
  existed, wind and weight genuinely combine (a strong wind beats a weak weight bias for the
  first choice), and a custom `gasSpreadRadius` caps travel distance well short of the shared
  default even after many more ticks than that default would need.

## Spells — a new content class, alongside materials/objects/decals/billboards — DONE (2026-07-13)

After repeated "Gust of Wind isn't working" reports even once the underlying bugs (spread-reach/
lifetime conflation, then the refill-too-fast cooldown gap) were both genuinely fixed, the user's
own diagnosis was the real fix: a single hardcoded button with a fixed, invisible radius is hard
to debug blind and hard to trust. New `voxel/spells.js` generalizes "Gust of Wind" into a 5th
user-authorable content type — a spell is just `{ name, effect, radius, material }`, cast by
clicking the map in a new "spell-cast" mode, so its actual area/effect is directly visible and
tunable instead of a number nobody could see or adjust.

- **Deliberately scoped to what this ENGINE can execute directly** — manipulating store/gas
  state around a point — not a D&D rules engine (damage, saving throws, durations stay
  Grimoire's job, same rules-vs-data boundary every other gameplay hook here keeps).
- **`SPELL_EFFECTS` registry**, 3 effects to start: `clear_gas` (Gust of Wind, generalized —
  wraps `clearGasInRadius`, including the cooldown map so a cast spell gets the exact same
  held-open-gap behavior the mode used to), `place_gas` (a smoke-bomb/stinking-cloud caster —
  fills a roughly SPHERICAL volume, not a cube, with a chosen gas material, never overwriting
  existing blocks, seeding every new cell into `stepGas`'s dispersal sim), `remove_blocks` (a
  generic radius-clear utility, any block type). Each entry's `apply(spell, ctx, c, r, z)` is
  the actual action; `needsMaterial`/`materialFilter` drive the Spell Maker UI's material
  dropdown (only shown for effects that place something, filtered to just gas-flagged materials
  for `place_gas`).
- **`createSpell`/`castSpell`**: `createSpell` slugifies the name (same convention every
  content type here uses) and validates the effect name + required material up front;
  `castSpell` dispatches to the effect's `apply()`, returning a small result object (e.g.
  `{ cleared: 5 }`) for a caller to log/toast — purely informational, not consumed by anything
  in this engine.
- **`voxel.html`**: "Spell Maker" panel (name, effect dropdown, radius slider, material dropdown
  when relevant) + a "toggle spell casting" mode (mutually exclusive with unit/decal/billboard
  modes, replacing the old dedicated Gust of Wind button/mode entirely) — click a library entry
  to select it for casting, then click the map to cast it via `castSpell`. Spells persist in
  their own localStorage library (pure JSON, no image/texture upload step unlike materials/
  decals/billboards, so export/import is the JSON directly). A "Gust of Wind" spell (`clear_gas`,
  radius 3) is auto-seeded into the library the first time it's ever empty, preserving the exact
  same one-click muscle memory the old button gave — just now a real, tunable, visible spell.
- Tests (`tests/voxel-spells.test.js`, 27 assertions): slugified id/effect validation/
  needsMaterial enforcement, `clear_gas` dispatching correctly (including cooldown-map
  population), `place_gas` never overwriting existing blocks and seeding the dispersal sim,
  `remove_blocks` clearing any type, an unknown effect throwing rather than silently no-oping,
  every registry entry having a label+apply, and library persistence.

**Follow-up, same session — "toggle spell casting does nothing" + real D&D spell list.**
Two issues, both from the same UX gap: the only way to pick a spell to cast was opening the
Spell Maker panel and clicking a library row — with nothing selected, toggling spell-cast mode
and clicking the map did, correctly, nothing at all, which reads exactly like "does nothing."
Fixed with a `#spellCastSelect` dropdown right next to the "toggle spell casting" button,
always kept in sync with the library (`renderSpellCastSelect`, called from the same
`renderSpellLibList` every create/delete/import already goes through) — defaults to the first
spell in the library the moment one exists, so casting works the instant the mode is toggled on,
zero extra setup.

Second: the user asked for the Spell Maker to pull from "the actual list of D&D spells" —
specifically **from Grimoire** (`../dnd-character/index.html`, same monorepo), which already
maintains a real `SPELL_AOE` table (blast radius in tiles, "1 tile = 5 ft, Chebyshev distance,"
the exact same convention this engine's own block-radius already uses) built up over that
project's own PHB-accuracy passes. New `voxel/dndSpells.js`'s `DND_SPELL_PRESETS` pulls those
radii directly (not re-derived or guessed) for ~25 spells, pairing each with a best-effort
THEMATIC match to this engine's only 3 effects (lingering hazard/cloud spells -> `place_gas`;
Gust of Wind itself -> `clear_gas`, keeping this engine's own tuned radius=3 rather than
Grimoire's aoeR=1, which represents a LINE's preview width there, not a usable point-radius
here; blast/destructive spells -> `remove_blocks` as the closest of 3 options, an admittedly
looser fit for control spells like Fear/Sleep, which is why those were left out entirely rather
than force-mapped). A new "D&D spell preset" dropdown in the Spell Maker pre-fills name/effect/
radius the moment one's picked — every field stays fully editable afterward, this never locks
the form to Grimoire's own numbers. Tests confirm every preset's effect is a real
`SPELL_EFFECTS` key, every radius is positive, names are unique, and each one round-trips
through the real `createSpell` validation path unchanged.

**Follow-up, same session — "they blow up too much stuff" + real HP/damage rolls.** User
feedback on the blast presets (Fireball etc., mapped to `remove_blocks`, an unconditional
area-clear with no concept of HP at all): correctly diagnosed by the user themselves as needing
real block durability to make sense. This is what finally makes the `hp`/`vulnerable`/
`resistant`/`immune`/`destroyedType` fields — sitting completely inert on materials/objects
since the 2026-07-12 "destructibility foundation" pass — actually DO something.

- New `spells.js` exports: `parseDice`/`rollDice` (real `Math.random()`-based "NdM" dice
  roller — "actually roll it," not a fixed/average number), and a new `damage_blocks` effect
  alongside the old `remove_blocks` (kept as a separate, simpler "unconditional clear, ignores
  HP" utility for anyone who wants that instead). `damage_blocks` rolls its `damage` array
  (one or more `{dice, type}` components — most spells are one, a few PHB spells genuinely have
  two, e.g. Ice Storm's bludgeoning+cold) ONCE per cast (matches 5e's own "one shared blast
  roll" convention), then for every occupied cell in the blast radius: a block with NO `hp` set
  (every built-in terrain today) is skipped entirely, completely untouched — this is the actual
  fix, since it exactly matches how Fireball doesn't normally demolish a stone wall in real 5e
  play, and it's why nothing "blows up too much" anymore by default. A block that DOES have
  `hp` (an author-flagged destructible material/object) takes the rolled damage, modified per
  its own `vulnerable` (double)/`resistant` (half, rounded down)/`immune` (zero) arrays for
  each component's damage type, tracked in a new per-cell `blockHpMap` (threaded across casts
  the same "caller owns the state" way `gasLifeMap`/`liquidLevelMap` already are — reset on
  map import). At 0 HP: replaced by its `destroyedType` if set (and not `'none'`), or removed
  entirely otherwise; the stale HP entry is cleaned up either way.
- `dndSpells.js`'s blast presets (Fireball, Shatter, Thunderwave, Burning Hands, Cone of Cold,
  Lightning Bolt, Ice Storm, Sunburst, Circle of Death, Flame Strike, Meteor Swarm, Sunbeam) now
  carry real damage dice+type copied VERBATIM from Grimoire's own `SPELL_DESC` one-liners (e.g.
  `"Fireball":'20-ft sphere, Dex save, 8d6 fire.'`) — not invented, same "pull from Grimoire,
  don't guess" discipline the radii already followed. A 13th preset, "Disintegrate (utility
  clear)", keeps `remove_blocks` available for anyone who wants an unconditional clear instead.
- `voxel.html`: Spell Maker gets two new fields (damage dice text input + a damage-type
  dropdown reusing the same `DAMAGE_TYPES` list the Material Maker's vulnerable/resistant/
  immune selects already use), shown only for `needsDamage` effects. Multi-component presets
  only pre-fill their FIRST component into this simple one-component form when picked from the
  preset dropdown — the preset itself still casts with both components when auto-seeded
  directly, an accepted scope limit on the manual-recreation form specifically, not on casting.
- Tests (`tests/voxel-spells.test.js`): `parseDice`/`rollDice` (correct range, genuine
  randomization across many rolls, a `1d1` edge case), an indestructible block (no hp) surviving
  any amount of damage untouched (the literal fix for "blows up too much"), HP correctly tracked
  down across multiple separate casts and the block destroyed exactly when it should be,
  `destroyedType` replacing rather than removing, vulnerable/resistant/immune each independently
  verified against real (if dice-bounded) rolled damage, and multi-component damage summing
  correctly against one block.

## Liquid flow simulation (water/acid/etc.) — DONE (2026-07-13), verified live in-browser (user tested directly, found and fixed one real bug in the process)

Built as `voxel/spread.js`'s second rule set, extending the exact shared dirty-cell-driven tick
shape `stepGas` established (see the gas section above) with Minecraft-style gravity-first,
decreasing-level lateral spread, plus a genuine source/finite-volume distinction gas doesn't
need at all:

**Real bug caught live, fixed same session**: the user reloaded `voxel.html` and reported water
genuinely flowing — but falling forever, one cell deeper every tick, because the map had open
space all the way down with no floor in that column. `stepLiquid`'s gravity rule had no lower
bound at all. Fixed with a new `WORLD_MIN_Z = 0` constant (spread.js) — a HARD floor gravity
never falls below, treated exactly like hitting a solid floor (triggers lateral spread instead
of continuing to fall). Matches this engine's own existing convention (`store.js`'s `genStrata`
always places `bedrock` at z=0), just makes it a real enforced simulation boundary instead of
only a generation convention a hand-placed source could fall straight through. Covered by a new
test asserting a source with nothing below it anywhere fills the column down to z=0 and stops
— nothing ever exists at z=-1.

- **`isLiquidType(type)`** — any `BLOCKS` type flagged `liquid: true` (new built-in `water` now
  carries this, on top of its existing `translucent: true` — a STATIC pool was already fully
  supported; this flag only opts a placed instance into the flow simulation).
- **`stepLiquid(store, levelMap, sourceInfo, dirtyCells)`**: gravity checked FIRST — an open
  (empty) cell directly below always gets filled at THIS cell's own current level (a source
  keeps producing full-strength water below it; a weak flowing puddle drips an equally weak
  trickle, never a suddenly-stronger one — falling itself never decays a level). Only once
  blocked from falling does it spread LATERALLY into one open neighbor per tick (same "one
  target per generation, gradual" reasoning `stepGas` already uses), one level weaker each step.
- **Source vs flowing, finite vs infinite**: `sourceInfo` (`Map<key, {finite, volume}>`) holds
  ONE entry per SOURCE cell — deliberately a property of the SOURCE INSTANCE, not the material
  (the plan's own requirement: the same `water` type can be a finite barrel or an infinite ocean
  depending on which cell it's in). A source's level is always implicitly `LIQUID_MAX_LEVEL`,
  never stored in `levelMap` at all. An infinite source (`finite:false`) persists forever; a
  finite one decrements `volume` each time it actually produces a new flow (down or lateral) and
  dries up ENTIRELY (the source cell itself removed, not just stops producing) once volume hits
  0 — "breaking it floods and spreads until its fixed volume is exhausted and flat, then stops."
- **Orphaned flowing cells dry up**: a non-source cell decays (loses 1 level/tick, removed at 0)
  once no longer FED — either by a same-liquid neighbor at a strictly higher level (the normal
  decreasing-outward-from-source case), OR by the cell directly above being the same liquid
  type regardless of its exact level (this second check is what keeps a vertical waterfall
  column stable even though every gravity-fed segment sits at the SAME level as the one above
  it, which the level-only comparison alone would treat as "not fed" and dry out — verified by
  a test asserting a 3-segment column stays intact for many ticks purely via this above-check).
- **Breaking a block adjacent to a liquid re-floods automatically, with no special-casing
  needed**: like `stepGas`, a liquid cell that exists keeps re-adding itself to the next tick's
  dirty set forever (an unconditional `nextDirty.add(key)`), so it re-examines the CURRENT store
  state (gravity/spread targets/fed-check) fresh every generation regardless of what changed
  nearby — `markSpreadDirty` (renamed from `markGasDirty`, now genuinely shared by both rules)
  only needs calling to SEED a newly-placed liquid cell into the cycle, which `voxel.html`'s
  `handleEditClick`/`registerIfLiquidSource` already do on every placement (defaulting a new
  liquid block to an INFINITE source — matches today's existing "place water, it stays"
  expectation. **DONE (2026-07-13)**: a "Finite liquid source" checkbox + volume number input
  in the HUD now exposes the finite/volume mechanism directly at placement time, read by
  `registerIfLiquidSource` — no longer foundation-only.
- **Shadow-occlusion raycast reconfirmed, not just assumed**: a test explicitly places a
  point light and a receiver cube with a liquid cell `stepLiquid` itself PRODUCES (not one the
  test places directly) sitting exactly on the straight-line path between them, and asserts the
  receiver still gets real light through it — the existing `translucent`-skip in
  `pick.js`'s `raycastVoxels` (called from `mesher.js`'s `makeLightSampler`) needed zero changes
  since it already reads `BLOCKS[type].translucent` fresh on every call, but this locks the
  claim in as tested rather than merely re-read from the code.
- **`voxel.html`** wiring: `liquidLevelMap`/`liquidSourceInfo`/`liquidDirty` threaded through the
  SAME `setInterval` gas already uses (both skipped independently when their own dirty set is
  empty), a one-time scan on page load/map import registering any already-placed water as an
  infinite source, and `wakeSpreadAt`/`registerIfLiquidSource` helpers called from every edit
  site alongside the existing gas wake-up call.

Tests (`tests/voxel-spread.test.js`, appended alongside the gas suite): gravity-first falling at
undecayed level, lateral spread one level weaker once blocked, finite-source volume depletion
and self-removal, an orphaned flowing cell drying up over exactly the right number of ticks, the
vertical-column stability case above, stale-state cleanup for a cell that's no longer liquid, and
the shadow-raycast-through-flowed-water integration test.

The general "spreading volume" system's other stated half — a gas cloud being PUSHED/cleared
by an external effect (Gust of Wind) — is now also DONE (2026-07-13); see the gas section's
own entry above (`clearGasInRadius` + Gust of Wind mode), unrelated to liquids specifically.

**Real bug caught live, fixed same session**: gravity had no lower bound at all — water placed
above open space with no floor fell forever, one cell deeper every tick. Fixed with
`WORLD_MIN_Z = 0` (spread.js), a hard floor gravity treats exactly like hitting solid ground
(triggers lateral spread instead of continuing to fall), matching this engine's own
`genStrata` convention of always placing bedrock at z=0.

**Tapered/sloped liquid rendering — DONE (2026-07-13), verified live in-browser.** The user
flagged that flowing water still rendered as flat-topped full cubes with no visual sense of
"thinning out" as it spreads, unlike Minecraft. `mesher.js` gained a Minecraft-style smoothly-
varying surface, generic to ANY `liquid: true` material (not hardcoded to `water`):
- **`liquidCornerHeight`**: each of a liquid cell's top-face corners is the AVERAGE of every
  same-TYPE liquid column sharing it (this cell + the 2 adjacent + 1 diagonal — the same
  3-neighbor shape `autotileCornerMask`/AO already sample), ignoring solid/absent/different-
  type neighbors entirely (a wall never drags a pool's edge down). If ANY contributing column
  has the SAME liquid stacked one level higher, the corner is forced to full height — a
  shallow edge reads as connecting seamlessly into a deeper adjacent pool instead of showing a
  seam.
- **`emitTaperedLiquid`**: builds the cell as a flat bottom, a TOP face whose 4 corners
  independently take the computed height (a genuinely non-planar quad when corners differ —
  reuses the exact cross-product normal computation `WEDGES`' ramp surface already
  established), and 4 side walls as planar trapezoids (each confined to one constant-x/y
  plane so they stay flat regardless of their two top corners differing — corner order/
  winding copied directly from `FACE_VERTS`' own already-verified layout, just with the "top"
  corners' z varying per-corner). Side walls with both corners near-zero are skipped entirely
  (no visible wall there). Occludes nothing, never occluded — same rule as slabs/shapes/wedges.
- Opt-in via `opts.liquidHeights` (a `buildMesh` option, `Map<cellKey, 0..1 heightFraction>`) —
  entirely absent for a plain static water pool with no simulation running (byte-identical to
  this feature not existing, verified by a regression test), and only engages per-cell when
  its own height is below ~1 (a full source/pool cell still takes the ordinary occlusion-
  culled full-cube path, no wasted corner-sampling work).
- `voxel.html`'s new `computeLiquidHeights()` derives each liquid cell's fraction from
  `liquidLevelMap`/`liquidSourceInfo` (source or fed-from-above -> 1, else `level/
  LIQUID_MAX_LEVEL`) each `rebuildIfDirty()` call, fed straight into `buildMesh`.
- Tests (`tests/voxel-mesher.test.js`): the corner-averaging math directly (isolated cell
  falls back to its own height, two neighbors blend smoothly rather than stepping, a solid
  neighbor is excluded rather than dragging the corner to 0, stacked-above forces full
  height), plus `buildMesh` integration (no-heights-supplied regression safety, isolated
  thin cell = flat 6-quad slab, near-zero height skips all 4 side walls, full-height cells
  still get ordinary same-type face culling not the tapered path).

**Round 2 of live bugs, same day — a screenshot showed water flooding a huge repeating-pattern
area; user then found two more distinct problems in the fix.** All three fixed together:
- **Every hop now costs exactly one level, whether falling or spreading laterally** (previously
  only lateral spread decayed — falling was "free"). Root cause of the huge flood: a waterfall
  segment kept full strength all the way down, so touching open ground restarted a FRESH
  max-radius lateral flood from wherever it landed — multiple landing points along a wide wall
  merged into what the screenshot showed. Now bounded to `LIQUID_MAX_LEVEL-1` tiles of total
  reach from any source, hop type doesn't matter (matches "ocean... just stops expanding" —
  Minecraft's own water behaves the same way). Verified with tests driving a source on
  completely open, unbounded flat ground for many ticks (confirms the flood genuinely halts at
  a fixed radius) and a source 10 levels above the ground (confirms a tall waterfall reaches
  the floor with little to no lateral budget left, not a fresh full-strength flood).
- **Diagonal fallback** — cardinal-only spread can permanently strand a cell only reachable by
  cutting a corner around a solid obstacle (two separate cardinal arms wrap around it from
  different sides and neither one's cardinal neighbors ever include it) — a real visible
  "gap" in an otherwise-settled flood. Fixed: if no cardinal target is available a given tick,
  ONE diagonal neighbor is tried instead (same gradual one-per-tick shape). Covered by a test
  sealing all 4 cardinal directions and confirming the source still spreads somewhere.
- **Same-type internal seams no longer render** — `emitTaperedLiquid`'s 4 side walls
  unconditionally drew even between two directly-connected same-liquid cells, so — being
  translucent — you could see straight through a near cell's wall into the far cell's wall
  behind it ("overlapping backfaces"/"front faces of the water tile behind the next one," in
  the user's own words). Fixed by skipping a side wall entirely when its neighbor in that
  direction is the same liquid type (mirrors the ordinary full-cube translucent path's own
  same-type culling). A non-same-type neighbor (solid, or a different material) is a REAL
  boundary and still draws normally. Two new `buildMesh` tests cover both cases directly.
- **Bedrock foundation appears wherever water actually reaches** (user request) —
  `ensureFloorBelow` auto-places `bedrock` one level under any cell that lands AT
  `WORLD_MIN_Z`, so a flood reaching territory beyond the map's own pre-generated terrain
  gets real visible ground under it instead of floating over open void.
- **Placing water onto existing water now re-sources that cell in place** (user request,
  "essential to make ponds/lakes") — previously this just stacked a second water block on the
  adjacent cell above, since the normal placement path always targets `adjacentCell(hit)`
  regardless of brush type. `handleEditClick` (`voxel.html`) now special-cases: if the brush is
  a liquid type and the clicked cell is already the SAME liquid type, target that cell
  directly instead of the cell above it.
- **Both fogs (distance AND vertical) now blend the background/clear color**, not just
  distance fog (user follow-up after the first background-tint fix only covered the one).

**Round 3, same day — a screenshot showed one cell rendering as a warped, disconnected
"floating diamond" over a dark gap.** Root cause: the corner-height rule that force-set a
corner to full height (1) whenever a same-type column existed one level above ANY of its 4
contributing cells could snap SOME of a cell's corners to 1 while its other corners stayed at
their shallow average, producing a genuinely warped/twisted quad instead of a smooth taper.
**Reverted entirely** — `liquidCornerHeight` is now just the plain distance-weighted average
(always 0..1 since `getHeight` always is), which can never produce a discontinuous jump. The
"seamless connection to a deeper pool" nicety the rule was for wasn't worth the failure mode.

**World is now a bounded, fixed-size 32x32 (user request: "make it so the map can't be
unlimited")** — new `spread.js` constants `WORLD_MIN_C`/`WORLD_MAX_C`/`WORLD_MIN_R`/
`WORLD_MAX_R` (0..63), checked by both `stepGas`'s and `stepLiquid`'s spread-target filters
(cardinal, diagonal, and gas alike) — a flood or gas cloud reaching the map edge stops there
instead of spreading into unbounded territory, the same class of bug `WORLD_MIN_Z` already
fixed for the vertical dimension. Covered by dedicated tests for both liquid and gas.

**Strata rework, corrected after live feedback**: an earlier pass made `BEDROCK_DEPTH` itself
8 layers thick, which looked wrong live (a visually dominant slab of pure bedrock texture
under everything). Corrected per direct user clarification ("bedrock shouldn't be 8 thick,
just start 8 blocks lower"): `BEDROCK_DEPTH=1` (a thin cap, matching the engine's original
convention) + `STONE_DEPTH=7`, so bedrock sits 8 total layers below a flat surface while
staying a single thin layer. `genStrata` (`store.js`) now builds this fixed base under every
column regardless of height, with the ocean's own dedicated 1-layer sand floor (borrowed from
the stone band, not added on top, so water stays flush with adjoining land at the same height)
and the original relative dirt/sand filler still applying within whatever extra room a
column's own height provides above the shared base.

**New bounded demo terrain** (user request: "a grass field with some hills and a pond in
middle") — `map.js`'s new `buildRollingHillsDemoMap(cols=64, rows=64)`: deterministic layered-
sine-wave rolling hills (no RNG, reproducible) with a round pond + sandy beach ring at the
center, matching `spread.js`'s own 32x32 world bounds. Kept entirely separate from the
original `buildDemoMap` (still used by the standalone 2D iso3d game). The demo's fixed torch
placements were hardcoded z values tuned for the old shallow 12x12 castle scene and would now
sit buried underground beneath the new deeper base — switched to `findSurface`-relative
placement instead.

**Camera framing margin increased** (a "closest blocks clipping the camera" report) — the
much bigger, deeper map needed more headroom than the old `zoom: 20/extent` gave: the
isometric view's effective diagonal footprint has to fit the terrain's HEIGHT too, not just
its c/r extent, which the old small/shallow demo never stressed enough to reveal. `zoom:
20/(extent*1.3)` gives 30% margin.

**"Gaps/clipping in a big hand-built pond" — DONE (2026-07-14), root-caused from a screenshot
before touching any code.** User-reported bug that turned out NOT to be a rendering defect: a
single water source can only spread ~6 tiles laterally before its level decays to 1 and stops
(`LIQUID_MAX_LEVEL=7`, one level lost per hop — the intentional "ocean stops expanding" feature
from earlier this session). A test pond bigger than that natural reach showed a dry band where
two separate flood-fronts each ran out of level before meeting, plus a visibly "proud"
full-height source cell next to its own rapidly-thinning neighbors — both symptoms of the same
mechanism, not two different bugs. Confirmed the fix direction with the user (pre-placed/
imported water should always read as a permanent full lake; only actively-placed/spread water
decays like a spell) — and confirmed that half of this was **already true**: both the page-load
scan and the JSON-import handler already register every water cell present in the store as an
infinite full-height source, regardless of how it got there, so saving and reloading a hand-
built pond already fully fixes it (verified by reading the existing scan code, not assumed).
The remaining gap was the LIVE, pre-save view: a pond filled by letting the spread simulation
flood outward from just a couple of source clicks could sit tapered/discontinuous indefinitely
without a save/reload round-trip. Fixed with two new `spread.js` exports:
- **`getLiquidBodyCells(store, c, r, z)`** — flood-fills every CONNECTED cell of the same
  liquid type from a starting cell (cardinal + vertical + same-Z diagonal, stops at solid
  geometry/empty space/a different liquid type), mirroring the `getGasCloudCells` flood-fill
  already built for gas spell volumes.
- **`promoteLiquidBodyToSource(store, levelMap, sourceInfo, dirtySet, c, r, z)`** — flood-fills
  via the above and registers EVERY cell in that connected body as a permanent infinite source
  in one call, clearing any decayed level. Wired into `voxel.html`'s existing "click an existing
  same-liquid-type cell to re-source it" interaction (already established for pond-building) —
  one click anywhere in a settled pond now promotes the WHOLE connected body to a uniform
  permanent lake instantly, not just the clicked cell.
- Explicitly does NOT fill genuinely empty gaps (cells the spread never reached at all have no
  liquid block to flood-fill through in the first place) — those still need either a bigger
  single-source reach or the gap painted over directly; documented as a real, separate
  limitation rather than silently pretending it's solved too.
- Tests (`tests/voxel-spread.test.js`): the flood-fill itself (L-shaped connectivity, a
  disconnected pond untouched, a different-type/solid neighbor not merged, empty/non-liquid
  starting cells returning `[]`), and the promotion (all connected cells promoted not just the
  clicked one, every promoted cell is a genuine infinite source not finite, stale decayed levels
  cleared, the whole body flagged dirty so the next tick reflects it immediately, and a separate
  disconnected pond left untouched by promoting a different one).

**Follow-up, same day: promotion needed DIAGONAL connectivity too.** After the fix above shipped,
the user tested it live and it still looked wrong — screenshot showed a bright jagged seam
cutting across an otherwise-solid pond. Root cause: `getLiquidBodyCells`'s flood-fill originally
walked only `NEIGHBOR_OFFSETS` (cardinal + vertical), but `stepLiquid` itself can genuinely
connect two areas of a pond through a DIAGONAL-only pinch (its own "diagonal fallback" for
wrapping an obstacle's outside corner — see the liquid section above). A pond that's really one
connected piece by `stepLiquid`'s own connectivity could still get only PARTIALLY promoted by
the flood-fill, leaving a sharp height/lighting discontinuity exactly at the diagonal boundary
between the promoted (now flat) and un-promoted (still tapering) halves. Fixed by adding the
same 4 same-Z diagonal offsets `stepLiquid`'s lateral-spread fallback uses
(`DIAGONAL_OFFSETS`) to the flood-fill's traversal set, so it walks the exact same connectivity
`stepLiquid` used to fill the pond in the first place. Tests added: two cells touching only at a
corner are found as one connected body, and a 4-cell diagonal-only chain is fully traversed, not
just the first hop.

**Camera orbit-around-click reverted — caused a worse regression.** Earlier this session, right-
drag orbit was changed to re-center `cam.panX/panY` to the raycast hit under the cursor the
instant a new drag began, so rotation would pivot around whatever you clicked instead of the
map center. Live-tested and reported as "it resets from some weird angle" — since the ortho
camera's look-at target IS `(panX, panY)`, snapping it to a new point before any rotation has
actually happened makes the WHOLE VIEW visibly jump at the start of every new right-drag, which
reads as broken/jarring, worse than the centering problem it was meant to fix. Reverted to the
simpler original behavior: orbit always rotates around whatever the camera is already looking
at, unaffected by where exactly you grab to start the drag — predictable, no jump. A genuinely
non-jumping "orbit around an arbitrary clicked point" would need either a smoothly-eased pan
transition or real arcball math (rotating the pan-target's offset from the pivot in lockstep
with `cam.rot` every frame, not snapping it once) — flagged as a real follow-up if still wanted,
not attempted here. The now-unused `groundPointAt` ray/ground-plane helper was deleted (its only
caller was the reverted code) rather than left as dead code.

**Top-down mode could only pan left/right, not forward/back — DONE (2026-07-14).** Root cause:
`voxel.html`'s middle-drag pan handler moves the camera along its own live "right" and "forward-
on-the-ground" vectors, both recomputed every frame in `tick()`. "Forward" was reusing the SAME
full 3D normalized view direction the rim/fresnel shader term needs (`viewDir`) — correct at the
normal isometric pitch, but at top-down's near-90° pitch the view direction points almost
straight down, so its horizontal x/z components nearly vanish once normalized as part of the
full 3D vector. The pan handler's `dy` term (multiplied by that near-zero horizontal component)
went dead while its `dx` term (multiplied by the camera's right vector, which stays valid at any
pitch) kept working — exactly "can only pan left/right." Fixed by computing a SEPARATE ground-
plane forward vector purely from the horizontal (x/z) part of `target - eye`, normalized on its
own instead of as part of the full 3D direction — stays at full strength regardless of pitch.
`viewDir` itself (still full 3D, still feeding the rim/fresnel shader) is untouched.

## Sun direction/ambient controls + real GPU shadow maps — DONE (2026-07-12/13), verified live in-browser

Adjustable sun direction/height/color/strength and adjustable ambient color/intensity are
wired in, driven by real `lighting.js` `resolveLighting()` profiles for BOTH day and dungeon
mode — `voxel.html`'s `lightMode==='day'` no longer short-circuits `currentLightProfile()` to
`null` (the old flat-white pre-lighting look). This went through two real iterations before
landing — both worth recording since the false starts explain the current shape:

**Iteration 1 (CPU, reverted): per-vertex shadow raycast.** Sun contribution was baked into
vertex colors at mesh-build time (`computeFaceShadeTable`, since renamed/repurposed — see
below), with shadow VISIBILITY decided by a per-vertex `pick.js` raycast toward the sun,
exactly like the existing torch-shadow mechanism. This worked and shipped briefly, but the
user flagged the real problem: shadow resolution was capped at "one sample per block corner"
— a shadow edge falling mid-face just didn't show up. The fix attempted (`shadowSubdiv`,
subdividing each face into an NxN grid of sub-quads for more raycast samples) made shadows
sharper but multiplied triangle count by subdiv² **permanently**, on every face, forever, for
a resolution ceiling that was still fundamentally blocky. Reverted in favor of:

**Iteration 2 (GPU, current): a real shadow map.** `renderer.js` now renders a depth-only pass
from the sun's point of view into a 2048x2048 depth texture (`renderShadowMap`, its own
minimal `SHADOW_VS_SRC`/`SHADOW_FS_SRC` program), then the main fragment shader samples that
texture (3x3 PCF-filtered) to decide sun visibility per FRAGMENT — resolution is bounded by
the shadow map texture, completely decoupled from mesh vertex density, and touches none of the
actual scene geometry's buffers.
  - `mesher.js` now only bakes one thing sun-related per vertex: `sunLit`, a bare
    `computeFaceSunTable(sunDir)` scalar (`max(0, dot(normal, sunDir))`, 0..1, NO keyStrength/
    sunColor baked in). `pushQuad`/`createMeshBuffer` carry it as a 4th buffer array alongside
    positions/uvs/colors. `makeLightSampler`'s vColor output (ambient + shadow-tested point
    lights) is now completely UNRELATED to the sun — see the "no lightProfile -> FACE_SHADE
    fallback" path, unchanged and still zero-cost for every `tools/voxel_*_check.html` page.
  - `renderer.js`: `GLMesh` gained a 4th vertex attribute (`aSunLit`, location=3). The main
    shader adds `uLightMVP`/`uShadowMap`/`uSunColor`/`uSunStrength`/`uSunActive` uniforms —
    `uSunColor`/`uSunStrength` are genuinely LIVE (no mesh rebuild needed to retune them,
    unlike sun DIRECTION, which changes `sunLit`'s per-vertex bake). `VoxelRenderer.setSun(
    {lightMVP, color, strength})` configures it; `render()` calls `renderShadowMap()` first
    when active, then binds the depth texture as a second sampler for the main pass.
  - `voxel.html`'s `computeLightMVP(store, sunDir)` builds the light-space orthographic
    frustum from the store's bounding SPHERE (not tightest-fit, but angle-independent — same
    frustum covers the scene regardless of which way the sun currently points) via `math.js`'s
    already-existing `ortho`/`lookAt`/`multiply` (zero new matrix math needed). Dungeon mode's
    near-zero `keyStrength` (0.08, torches do the real work down there) skips the shadow pass
    entirely rather than paying for it to light almost nothing.
  - A real, hands-on bug found and fixed mid-session: an earlier version of `makeLightSampler`
    used `profile.groundAmbient` directly as the ambient base, compounding with a SEPARATE
    ambient-like floor already baked into the sun-shade table — two independent "how bright is
    the whole scene" numbers multiplied together made every mode (day included) render far too
    dark. Fixed by keeping exactly ONE place ambient magnitude lives (`ambientBase(profile)`,
    a scalar, or `profile.voxelAmbientColor` when the Sun/Ambient panel's sliders are touched).
  - Tests: `computeFaceSunTable` covered directly (pure dot-product math, 45-degree partial
    values, missing-sunDir fallback) plus end-to-end tests confirming which face's `sunLit`
    value is highest actually rotates with the sun vector (`voxel-mesher.test.js`). Real
    shadow EDGE correctness (does a wall actually occlude the shadow map correctly) can't be
    tested headlessly — verified live in the browser instead, confirmed working.
  - **Depth-based ambient/sky fog — DONE (2026-07-13), verified live in-browser (user tested
    directly, found and drove two real bugs fixed in the same session).** `renderer.js` FS_SRC
    blends final `color` toward `uFogColor` by `smoothstep(uFogNear,uFogFar,vCamDist)*
    uFogStrength`. `uFogStrength=0` skips the blend entirely — zero-cost no-op on every existing
    `tools/voxel_*_check.html` page.
    - **Real bug #1, caught live**: `uFogNear`/`uFogFar` were originally sourced from
      `computeCameraDistRange` — the SCENE's own bounding-sphere extent, shared with the rim
      term. The user reported fog clearing up the closer they BUILT blocks to the camera
      (unrelated to actual zoom) — building geometry changed the map's bounding sphere, which
      shifted the whole fog curve, with no relationship to the camera's real distance. Fixed:
      fog's near/far are now FIXED world-unit distances from the camera eye, set directly via
      two new Sun/Ambient panel sliders (Fog start/end), completely decoupled from
      `computeCameraDistRange` (which the rim term alone still uses — that coupling was correct
      for rim, wrong for fog).
    - **Real bug #2, caught live**: the background/clear color (the "sky"/void beyond all
      geometry) stayed a fixed dark color regardless of fog, so distant fogged-out geometry
      faded into an unrelated hard-edged background instead of disappearing seamlessly. Fixed:
      `render()` now blends `gl.clearColor` toward the fog color by `fog.strength` every frame
      (`baseClearColor` lerped toward `fog.color`), so the background reads as foggy too.
    - **Vertical (height-based) ground fog — DONE, new request**: a second, independent fog
      term (`uVFogColor`/`uVFogBottom`/`uVFogTop`/`uVFogStrength`) fading by the fragment's own
      WORLD-SPACE HEIGHT (`vWorldPos.y`, a new vertex varying) rather than camera distance —
      dense at/below `uVFogBottom`, clear at/above `uVFogTop`, e.g. a mist band filling a
      dungeon floor while a tall room's upper reaches stay clear. `VoxelRenderer.setVerticalFog`
      mirrors `setFog`'s shape; `voxel.html` gets its own independent `vfog` state + a
      "Vertical Fog" panel section, off by default.
    - **Sun/Ambient panel restructured into collapsible `<details>` sections** (Sun / Ambient /
      Bounce / Rim-Glow / AO / Fog / Vertical Fog) — the user flagged the panel getting "super
      long" as sliders accumulated across sessions; native `<details>`/`<summary>`, no JS
      needed, "Sun" open by default.
    - `VoxelRenderer.setFog({color, near, far, strength})` mirrors `setGlowRim`'s shape;
      `voxel.html`'s `fog`/`vfog` state is deliberately independent of `sunOverrides` (same
      reasoning as `glowRim` — a pure accent, not a lighting.js profile field).

## Light presets — DONE (2026-07-13), verified live in-browser

The Sun/Ambient panel (sun, ambient, bounce, rim/glow, AO, fog, vertical fog — everything
`SUN_CONTROL_IDS` in `voxel.html` lists) can now be saved and reapplied as a named preset,
matching the same library pattern every other content type in this engine already uses
(materials/objects/decals) — new `voxel/lightPresets.js`: `createLightPreset(name, state)`
(id slugified via `customMaterials.js`'s own `slugify`, same convention) +
`loadLightPresetLibrary`/`addLightPresetToLibrary`/`removeLightPresetFromLibrary` (thin
wrappers over `contentLibrary.js`'s shared `makeLibrary`, identical shape to materials/
objects/decals). No engine-registry involvement at all — a preset is pure UI-state data, not
a placeable type, so this module has zero DOM/canvas code.

`voxel.html`'s `collectLightPresetState()` reads every `SUN_CONTROL_IDS` control's raw
`.value` into one plain object (color inputs are already hex strings, range inputs already
numeric strings — both round-trip with a plain assignment, no per-field parsing needed).
`applyLightPresetState(state)` writes those values back into the DOM controls, then calls
the SAME `onSunControlChange()` a manual slider drag already triggers — no separate "apply"
logic to keep in sync with the live-editing path. New "Light Presets" collapsible section:
a name field + save button + a click-to-apply/delete library list, same UI shape as the
Material/Object/Decal Maker libraries.

## Rim/fresnel "Nintendo glow", bounce fill light, directional ambient, AO strength, bevel — DONE (2026-07-13), verified live in-browser except bevel (see note)

A cluster of related lighting-panel features built in one live-iteration session (the user
watching the browser result in real time; several went through multiple correction rounds):

**Bounce/fill light** (`mesher.js` `computeFaceBounceTable(sunDir, spill=0.3)`): a fake
"the sky bounced some sunlight back" directional light shining from the exact OPPOSITE
direction of the sun, never shadow-map-tested. Reuses `computeFaceSunTable`'s own dot-product
math with the negated direction (`max(0,dot(normal,-sunDir))` is exactly
`max(0,-dot(normal,sunDir))`) rather than re-deriving it. `spill` blends the pure directional
value with a flat floor (0=100% directional, 1=uniform) — tuned to 0.3 (70/30 split) per the
user's explicit request, so the sun-facing side still gets a little fill instead of a hard
zero. Own adjustable color/strength (`uBounceColor`/`uBounceStrength` in `renderer.js`,
unconditional every frame — no shadow-map dependency at all).

**Rim/fresnel glow** ("Nintendo glow", `renderer.js` FS_SRC): `fresnel = pow(1-facing, 2.5) *
distanceFade()`, added on top of existing lighting, tied to `uSunColor`/`uSunStrength` (no
separate color) so it reads as "sunlight catching the edges." The `distanceFade()` term is the
actual fix for a real bug: under an ORTHOGRAPHIC camera every point on a flat wall shares the
same view angle regardless of position, so angle-only Fresnel glowed the wall's ENTIRE length
uniformly. Real toon-shader rim lighting also fades by camera DISTANCE (dim near the camera,
brightest far away) — `uRimDistNear`/`uRimDistFar` come from the scene's own bounding-sphere-
derived camera-distance range (`voxel.html`'s `computeCameraDistRange`) each frame.
`uRimAttenuation` (default 1 = plain smoothstep) reshapes that fade curve's aggressiveness.
A second, sun-INDEPENDENT "glow rim" (`uGlowRimColor`/`uGlowRimStrength`, its own state in
`voxel.html`, defaulting off in day mode / on in dungeon mode via `DUNGEON_GLOW_RIM_DEFAULT`)
shares the exact same fresnel+distanceFade math, for a subtle glow that keeps geometry
readable in a pitch-dark dungeon with no real sun at all.

**Directional ambient** (`mesher.js` `computeFaceAmbientTable(ambientDir, softness=0)`): an
independent light direction, NOT tied to the sun, added on top of the flat ambient floor in
`makeLightSampler` — its own color (`ambientDirColor`) and strength
(`ambientDirStrength`), plus a `softness` slider (shares `computeFaceDirectionalBlendTable`'s
blend math with bounce's `spill`, same shape, different name since "hardness/softness" reads
better for a general ambient tilt than "spill"). Elevation can go negative (light from below).
Found and fixed mid-session: the sliders existed in the HTML but were never wired into
`sunOverrides`/`currentLightProfile()` — a context-switch-mid-implementation bug, not a design
flaw.

**AO strength** (`mesher.js` `applyAOStrength(curveValue, strength)`): a single global
intensity dial on the SAME occlusion curve/counts (not a different AO algorithm) —
`strength=1` is the original unmodified look, `0` flattens AO out entirely, `>1` exaggerates
darker (clamped at 0). Threaded through `buildMesh`'s `aoStrength` option into both
`cellFaceAO` (slabs/models/shapes) and `emitFaceAO` (full cubes).

**Bevel — two attempts, BOTH reverted, no bevel feature exists as of 2026-07-13.** The user
wanted edges to visually read as beveled/chamfered, specifically so Fresnel/rim light would
catch them (a flat 90° corner has no transition state for Fresnel to grade across, reading as
"harsh, paper-thin, artificially digital" per the reference the user pasted on real-time
toon-shader technique). Neither attempt shipped — the codebase today has no bevel-related code
at all (no `edgeUV`/`edgeMask`/`tiltedFaceNormal`/`faceEdgeBoundaryMask`/bevel uniforms
anywhere); this is recorded purely so a future attempt doesn't re-walk the same dead ends.

*Attempt 1 (reverted): a flat neighbor-aware color overlay.* Per-vertex `edgeUV` (continuous
face-local 0..1 coordinate) and `edgeMask` (`faceEdgeBoundaryMask` — which of a face's 4
borders are TRUE structural boundaries vs. an interior seam between two coplanar tiles,
reusing `FACE_AO`'s own u/v axes) attributes, uploaded to the GPU, with a `renderer.js`
`bevelGlow()` fragment function painting a flat highlight color near true edges only. Reverted
because a flat color wash doesn't interact with light/view direction at all, so it read as
"just uniformly glows" rather than looking like geometry — the user's own diagnosis, and
correct: this is fundamentally the wrong mechanism for the effect being asked for.

*Attempt 2 (also reverted): weighted normals, zero new geometry.* `tiltedFaceNormal(faceName,
hFrac, zFrac, edgeMask, tiltAmount)` tilted a QUAD CORNER's normal toward its neighboring
face's own normal at true structural boundaries only (reusing `faceEdgeBoundaryMask` from
attempt 1), with the neighbor-across-a-border derived generically from `FACE_AO` itself (a
reverse lookup by normal vector). The theory: since `renderer.js`'s existing rim/fresnel term
already does `dot(normalize(vNormal), -uViewDir)`, tilting the per-vertex normal should make
edges catch Fresnel/rim light the way real bevel geometry would, with zero new vertex
attributes/uniforms/shader code. **The user's verdict after actually seeing it: "it fucks up
the fresnel" — reverted in full.** The most likely root cause (not confirmed, since it was
reverted before this was investigated): a quad is only 2 triangles sharing 4 corner normals,
and GL only truly interpolates linearly WITHIN each triangle, not smoothly across the whole
quad — when the 4 corners carry meaningfully different tilted normals, the two differently-
triangulated halves (the `flip` diagonal AO already picks per-face) can interpolate
inconsistently across the shared diagonal, producing a visible crease/facet rather than a
smooth gradient, and independently, tilting the SAME normal `renderer.js`'s fresnel reads for
its ANGLE term also changes what fresnel sees per-corner in a way that doesn't match the
distance-based fade it was tuned against — the two systems (bevel-via-normal-tilt and
fresnel-via-normal-angle) fight over the one normal attribute instead of composing cleanly.

**If revisited**: a real geometric bevel (actual small angled chamfer quads at structural
edges, with their own genuine — not faked — normals) is the more likely path to the look the
user wants, per their own "adding a actual edge will be so nice cause it will hit the light at
different angles" — but is a bigger lift than either attempt here: new mesh topology (chamfer
strips), plus per-vertex sun/bounce baking against a real tilted normal instead of today's
flat-per-face `sunLit`/`bounceLit` scalars. Not started. Whatever the next attempt is, get it
in front of the user's own eyes before writing more than a small spike — both attempts here
were reasoned through carefully and tested unit-by-unit, and both still looked wrong live,
which headless tests cannot catch for a shading effect like this.

## Custom light sources — DONE for both materials and objects (2026-07-12)

`customMaterials.js`'s `buildMaterialDef` and `customObjects.js`'s `createCustomObject` BOTH
promote `properties.light`/`properties.translucent` to the top level of the registered
`BLOCKS` def — the exact shape `voxel.html`'s `collectLightPoints()` and the mesher already
read for every built-in (torch/water/glass). A custom "glowing crystal" material or a custom
"brazier" object both already work as real light sources with zero further engine changes —
the Material Maker's UI checkbox+fields cover materials; a custom light-emitting OBJECT's
`light`/`translucent` properties aren't yet exposed as their own form fields (a plain
`properties` key inside the pasted box-list JSON works today via the Object Maker panel below,
just not a dedicated checkbox+fields UI like the material one has).

**Object Maker UI panel — DONE (2026-07-13).** `voxel.html` has an "Object Maker" panel
mirroring the Material Maker's shape: a JSON textarea (the box-list spec from section 2,
pasted/authored by hand — no per-box texture upload UI, since box faces just reference
existing material names), Create/Import/Export buttons wired straight to
`createCustomObject`/`loadObjectLibrary`/`addObjectToLibrary`/`deleteCustomObject`, and a
replay-on-load loop so custom objects survive a page refresh (same pattern as the Material
Maker's own replay loop). A created object needs zero extra palette wiring — `rebuildPalette()`
already lists every `BLOCKS` key.

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

- **Emissive + normal/bump map — DONE (2026-07-13), not yet visually verified live (no browser-
  screenshot tool in this environment).** Scoped to CUSTOM (material-maker) materials only —
  built-ins keep today's flat shared-atlas look untouched entirely.
  - **Emissive**: one uploaded image (not per-face like albedo), drawn into every occupied
    grid cell of its OWN canvas sharing the material's EXISTING layout/cellPx — a face's
    already-correct albedo UV rect addresses the matching region in this texture too, no new
    UV attribute needed. `renderer.setMaterialEmissiveMap`, sampled additively in `FS_SRC`
    (`color += texture(uEmissiveMap, vUV).rgb`) — completely independent of normal mapping.
  - **Normal/bump**: same one-image, shared-layout approach. A "bump/height map" upload is
    converted to a tangent-space normal map ONCE client-side at upload time
    (`blocks.js`'s new `bumpToNormalMap`, a simple central-difference gradient) so the
    renderer/shader only ever deals with one format regardless of which the user provided.
    `mesher.js` now emits a `tangent` per-vertex attribute on every quad (derived from
    `FACE_AO[faceName].u` for axis-aligned faces, the wedge's own first edge vector for
    ramps) — cheap, unused unless a normal map is bound. `renderer.js`'s `FS_SRC` builds a
    TBN basis from `vNormal`/`vTangent`, samples+unpacks the normal map, and — only when
    `uHasNormalMap` is true — RECOMPUTES sun/bounce/fresnel per-fragment against the
    perturbed normal instead of `mesher.js`'s baked-per-vertex `vSunLit`/`vBounceLit`
    scalars (which can only carry one value per FACE, not per pixel). New world-space
    `uSunDirWorld`/`uBounceSpill` uniforms feed this recompute — already Y-up, matching
    world-space normals/tangents directly, no axis conversion needed. The flat ambient
    floor + point lights (baked in `vTint`) and directional ambient stay exactly as baked
    today regardless of normal mapping — an explicit scope boundary (their own shadow test
    is a CPU raycast per light, not reasonably movable to per-fragment GPU work in this
    pass). Reasoned through why this doesn't necessarily repeat bevel's two reverted
    failures: bevel tilted a small number of PER-VERTEX corner normals, which then had to
    interpolate across a quad's 2 triangles inconsistently; a texture-sampled normal is
    defined continuously at every fragment directly from the image, not interpolated from 4
    corner values — still flagged as needing live verification, not assumed correct.
  - Material Maker UI: "Emissive map" and "Normal/bump map" file inputs, plus an "uploaded
    image is a bump/height map" checkbox; `saveTexturesToDisk` persists both alongside the
    existing albedo/autotile images.
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
  - **NOT achievable with `SHAPES`' strictly-axis-aligned box mechanism specifically**:
    slope/half-slope (needs slanted quads) and genuinely round columns/barrels (needs an N-gon
    of non-axis-aligned side quads). Both were flagged here as needing a bigger primitive —
    both later got exactly that, as their own `WEDGES` entries (`ramp`, and `column8`/
    `barrel8` via `makeRoundedPrism`, see the dedicated sections above) — this bullet is a
    historical snapshot of the `SHAPES`-only mechanism's own limits, not a current gap.
  - **Material Maker UI — DONE (2026-07-12).** `customMaterials.js`'s `buildMaterialDef`/
    `createCustomMaterial` accept an optional `shape` (string or depth-indexed array),
    promoted straight to `def.shape`. `voxel.html`'s Material Maker panel has a "Shape"
    dropdown (full block, or any `SHAPES` key) wired through create/import/reload-replay —
    the depth-indexed array form (e.g. a flared column's cap/mid/base) is still hand-assigned
    via the JS API, not exposed as its own UI control (documented in the dropdown's own
    code comment) since it's a rarer, more advanced case than "pick one shape for this
    material."
- **Animated GIF-sourced faces — DONE (2026-07-13), not yet visually verified live (no
  browser-screenshot tool in this environment).** `drawAndRegisterMaterial` (`voxel.html`) now
  keeps an `images` map (grid index -> the live `<img>` drawn into that cell) alongside each
  material's canvas in `materialCanvases`, plus an `animated` flag from the new "Animated
  (GIF-sourced faces)" Material Maker checkbox (`spec.animated`, round-trips through export/
  import/replay-on-load same as every other spec field). A single `setInterval` (100ms, well
  below any real GIF's frame rate — deliberately not tied to `requestAnimationFrame`, since
  redrawing faster than the source can change gains nothing) re-samples every animated
  material's stored images back into its canvas via the existing `drawImageIntoGridCell` and
  re-uploads via `renderer.setMaterialAtlas` — a browser already auto-advances a loaded GIF's
  own frame on its own internal timer even off-DOM, so this loop's only job is periodically
  drawing whatever the CURRENT frame is. Materials never flagged animated cost nothing (skipped
  every tick). Autotile sheets are excluded on purpose (already rasterized into 16 static
  canvases by `sliceSheet4x4` at upload time, not live `<img>`s — an animated 16-tile Wang
  autotile sheet isn't a realistic authoring scenario).
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
