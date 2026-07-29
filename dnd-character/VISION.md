# Grimoire — Vision & Roadmap

*Aligned with the user 2026-07-21 via Q&A. This is the shared picture of what the app is
becoming. Supersedes ad-hoc assumptions; update it when the vision actually changes, not
per-session.*

## The vision in one paragraph

Grimoire 1.0 is a **store-quality D&D 5e virtual tabletop**: RAW-faithful rules (including
multiclassing), a real content library, combat played *on* the iso map (players on their own
devices, optional shared TV overview), with every mechanic working identically across Quick
Battle / DM-hosted / player-net, an AI DM-assistant (and solo-AI-DM option), and DM tooling
(encounter builder, homebrew monsters, traps, undo). Web for friends now, App Store later
("1.0 then grow").

## Ground truths from the alignment Q&A

- **Audience:** eventually a global App Store app; today, the user's friend group via web.
- **Usage:** user is both DM and player. Net sessions are 4–6 people. Quick Battle,
  DM-hosted, and character-keeper use are an **even split** — no mode is second-class.
- **Rules target:** RAW-faithful 5e. No subsystem is permanently off-limits (encumbrance,
  survival, downtime, crafting all fair game eventually). **Multiclassing is wanted soon.**
- **Content:** the library itself is a feature — both more monsters and more player options
  deserve real data-entry passes, not just mechanics work.
- **Map:** the iso map is the **primary combat surface**, worth heavy investment (fog of war,
  per-player vision, map tools, polish).
- **#1 friction (user's words):** systems not unified — "applying how feats work only to
  quick battle but not DM battle/hosted." Mode parity is a first-class engineering goal,
  not just a convention.
- **Architecture:** single-file index.html is no longer sacred — **proactively modularize**
  (data / rules / net / UI). CLAUDE.md's single-file rule gets rewritten as part of that.
- **AI Narrator:** invest — DM assistant at the table, plus solo-AI-DM as an option.
  **Text-to-speech eventually**: v1 = browser `speechSynthesis` (free, offline, no keys);
  premium cloud voices are the same BYOK-vs-backend decision as the Narrator key itself.

## Roadmap (ordered, with rationale)

*Status pass 2026-07-28 — most of items 1–6 shipped between v120.205 and v120.231. Version
numbers below are the real ones; see `AUDIT_HISTORY.md` for each write-up.*

1. ✅ **In-flight feat backlog** — small-feat batch (v120.205), Battle Master maneuvers
   (v120.206), mount system (v120.210).
2. ✅ **Backup export/import** (v120.207).
3. ⚠️ **Mode-parity audit + parity test harness** — the *audit* passes are done (v120.208,
   v120.209 `pcAttackList` unification), but **the harness itself was never built**, so parity
   is still enforced by hand. This remains the highest-value open item: it's the user's stated
   #1 friction, and every audit pass so far has been manual archaeology that decays the moment
   new code lands.
4. ✅ **Modularization** — Stage 1 `data.js` (v120.219), Stage 2 `rules.js`/`net.js`/`ui.js`
   (v120.220). Note the split was heuristic, so a symbol's file doesn't follow from its job —
   use `node tools/whereis.js <symbol>` rather than guessing.
5. ⚠️ **Combat depth** — reactions (v120.226–228), Dodge/Disengage/Help/Ready (v120.229–231),
   magic items + attunement (v120.212), traps/hazards (v120.213) all shipped.
   **Legendary/lair actions are still not implemented** — the only trace is prose in one
   monster block telling the DM to adjudicate it.
6. ✅/🔄 **Multiclassing v1** (v120.211); content expansion is ongoing rather than "done".
7. 🔄 **Map as primary surface** — light/vision landed (v120.226); fog of war, per-player
   vision and the shared TV overview mode are still open.
8. ✅/🔄 **DM tools + AI** — encounter builder (v120.215), homebrew monsters (v120.214), combat
   undo (v120.216 QB, v120.224 DM). **AI DM-assistant and solo-AI-DM not started.**
9. ⬜ **1.0 store push** — native wrapper, onboarding, empty states, polish, content/legal audit.

### Still-open 5e gaps (carried over from the retired MASTER_PLAN.md, re-verified 2026-07-28)

- **Legendary / lair actions** — boss fights have no mechanical support (see item 5).
- **Generic "advantage on saves" layer** — War Caster etc. are special-cased; there's no
  general mechanism, which is why Holy Aura's ally-save-advantage clause is a documented
  simplification in `AUDIT.md`.
- **True Strike target scoping** — RAW grants advantage against *that* creature; simplified here.
- **AoE cones/lines** — equal-area burst approximations, not true templates (in AUDIT.md).
- **5/10/5 diagonal movement** — deliberately not implemented; current rule is Chebyshev with no
  corner-cutting. Would be a table-preference toggle, not a fix.
- **2024 PHB ruleset** — out of scope; if ever added it must be a flag, never mixed into 2014.

### Decision filter (carried over from MASTER_PLAN.md — it's the part worth keeping)

Prefer the change that: **closes a 5e lie** (something the UI pretends works but doesn't) →
**unifies QB and table play** (one Engine path) → **improves the fight you can see** →
**reduces index.html surface area** → **adds a test**.

Reject: a feature that only works in one battle mode forever; a second damage calculator inside
the renderer; a framework rewrite; chasing Roll20 parity.

## Engineering strategy (derived from the 2026-07-28/29 bug hunt)

**The premise: quality is now limited by verification, not by features.** In one session, eight
real bugs were found in *shipped, live* code that ~1,000 passing assertions had never caught —
because the suite tests rules in isolation and every one of those bugs lived somewhere else:

| Bug | Class it belongs to |
|---|---|
| Fireball's wrong range (87 spells), 3 spell damage types, 41 untyped monster attacks | **prose-as-data** |
| cover / Sanctuary / Holy Aura absent on player devices | **cross-mode divergence** |
| `dmLog()` that never existed | **UI wiring** |
| `coverBetween` walking off the grid | **shared math nobody re-derives** |

None were random. They are four repeatable classes, so the work should attack classes, not
instances. That is what this strategy is for.

### Pillar 1 — Kill prose-as-data (the biggest bug factory)

`SPELL_DESC` and the bestiary's `atk` strings are English that regexes mine for mechanics.
Track record: 87 spells with a silently wrong range, 3 with no damage type, 41 monster attacks
untyped — every one of them invisible in play until measured. It gets *worse* as the content
library grows, and this doc calls the library itself a feature.

Move mechanics into structured fields; keep the prose for display only. Do it **incrementally,
with a coverage test per field** — the `SPELL_DTYPE` / `MONSTER_ATK_DTYPE` work is the template:
a documented exception list, and any new entry missing the field fails the build rather than
regressing quietly.

### Pillar 2 — Make verification match the failure modes

- **Cross-mode:** the parity harness exists (adapter interfaces + one behavioural probe). Grow it
  into a scenario matrix — the same fight through all three adapters, asserting identical outcomes.
- **UI wiring:** `rules-test.js` executes no click handler, so a handler calling a function that
  doesn't exist passes the whole suite. Build `tools/smoke.js`: boot headless, click every
  registered handler, assert zero console errors. A *static* "is every identifier defined?" check
  was tried and abandoned — regex-stripping comments and template literals produced 195 false
  positives. Use the browser; it solves this trivially.
- **Real sessions:** script the two-tab DM+player test (host in one tab, `playerJoin` in another
  over real PeerJS). It found the worst bug of the session. Nothing else exercises the netplay path.

### Pillar 3 — Pay the 1.0 tax while it is still cheap

SRD content tagging is the only item here with a real deadline. It is already flagged below as the
#1 App Store risk. Tagging entries as they're touched costs almost nothing; retrofitting 257 spells
and 35 monsters the week before submission is miserable.

### Pillar 4 — Depth where Grimoire is differentiated

Legendary/lair actions (the last real combat gap), then per-player vision on the DM side, then the
AI DM. The differentiator is the **combat-management layer** — turn order, HP, targeting,
multi-combatant state — which is exactly what the voxel downgrade note below identified as the
thing Grimoire owns and a renderer swap would have to rebuild.

### Cadence

**Alternate one hardening pass with one feature pass.** Hardening currently returns far more value
per token than features, and will until Pillars 1 and 2 are done.

### Do not

Split files further (a big file costs nothing if you never read it whole — grep the anchor, or use
`tools/whereis.js`). Retry the static identifier guard. Chase Roll20 parity.

### The meta-lesson, worth keeping

**Every genuine bug that session came from *executing* something — a real two-tab session, parsing
the whole bestiary, sweeping all 20 d20 faces. Reading the code found none of them**, including a
function that had been read earlier the same day. And *measuring* was consistently harder than
fixing: three scenarios were wrecked by their own setup errors before one bug was even visible, and
two audits reported 195 and 44 phantom findings before they were corrected. Audits need auditing.

## Graphics direction (aligned 2026-07-21, executed LATER — after core roadmap items)

- **Problem:** AI pixel-art tilesets are a consistency nightmare (tiling/perspective/palette
  drift across generations). Root cause: image models are bad at global consistency, good
  at standalone images.
- **Portraits:** AI image generation stays — it's the job image models do well (standalone,
  nothing to tile). Character/monster portraits in token frames.
- **Tentative big direction: 3D via the voxel engine.** iso3d-engine (sibling project) is
  already growing D&D organs (exportBattleMap.js, dndSpells.js, spellFx.js, light presets)
  and is the realistic "move to 3D" path — it would REPLACE iso-renderer.js AND the .mcell
  hitbox/interaction layer. Everything is AI-generatable: maps are data, engine is code,
  block textures via PixelLab create_tiles_pro (verified working).
- **Decision gate before committing — TWO stages** (updated after user reported chronic
  scaling issues across texture scale, camera/zoom, map-size perf, and object proportions —
  diagnosis: no single locked world-unit convention, each feature session assumed its own):
  1. **Voxel conventions pass** (in iso3d-engine): write the invariants down (1 voxel =
     N texture px = 5 ft; camera/projection math in ONE place; all sprites/props sized in
     world units, never px), audit code against them, add rendered-preview regression
     tests at 3 zoom levels. Kills the "dumb scaling issue" class at the root.
  2. **Grimoire integration prototype**: load a battle map via exportBattleMap, render,
     click-to-target a tile, measure FPS on the user's phone (4–6 phone players is the
     make-or-break). Net sync of voxel map data + localStorage size are the other risks.
  - **Gate is runnable, not a judgment call:** standalone harness BUILT AND EXECUTED
    2026-07-21 at `voxel-gate/` (design + full results in `iso3d-engine/GATE_TESTBED.md`).
    Verdict: camera/pick/liquid/damage-containment/partial-HP all pass clean, 75fps
    desktop; 8 confirmed bugs form the conventions-pass work order — headliners:
    line/cone spells ignore aim elevation (spells.js lineCells z-lock — THE "spells not
    working" bug), spread.js hardcoded 31×31 sim bounds vs 36×36 maps, no chunked
    meshing (34ms whole-map rebuild per block change = the mobile risk — STILL OPEN),
    max 6 gas clouds then silent invisibility. Phone FPS run still pending (needs
    chunked meshing first).
  - **FIXED 2026-07-21 (batch 2, verified via re-run):** line/cone spells now honor the
    aim point's elevation (was hardcoded to caster's own z); spread.js's gas/liquid
    bounds now derive from the actual map instead of a stale 31×31 default; terrain
    (grass/dirt/sand/mud) now uses the 5e damage-threshold rule + higher hp + no fire
    vulnerability — destructible under sustained fire, survives a single Fireball
    (proven: max 8d6=48 dmg < grass's 60 hp). Structures (wood/planks) unchanged. Full
    writeup + screenshots in iso3d-engine/GATE_TESTBED.md.
  - **Gate must also cover destructible-tile damage** (user: "a lot wrong with how the
    damage worked with spells and tiles") — AoE-only damage, damage-state visuals,
    remesh-on-destroy, idempotency; asserted tile-by-tile under a deterministic seed.
  - **Gate must also cover dynamic volumes** (user: "spells and gasses and liquids were
    not working correctly"). Static terrain is the easy 90%; translucent/animated volumes
    are the structurally hard part (alpha depth-sorting, remeshing animated volumes, FX
    compositing) AND are core D&D content (Fog Cloud, Cloudkill, water). Prototype must
    show one liquid, one gas volume, and one spell FX rendering correctly — a
    static-map-only demo does not pass the gate.
- **Decoupling rule:** Grimoire 1.0 does NOT wait on the voxel bet. iso-renderer.js is the
  proven, phone-cheap floor and is fine for a store 1.0; voxel is the upside that swaps in
  only after passing both gate stages.
- **DOWNGRADED 2026-07-21, same day, after hands-on use:** built a live "6 heroes vs 30
  goblins" demo directly on the voxel engine (`iso3d-engine/battle-demo.html`) to see it
  in action. Terrain/spell/liquid fundamentals held up (matches the gate testbed), but the
  exercise surfaced a gap the gate never tested: **the engine has no unit/combatant system
  at all** — no multi-unit movement, no occupancy/collision handling between units (had to
  discover and fix units silently overwriting each other on the same tile), no clean
  split between "magical" and "mundane" damage presentation (everything routes through
  castSpell → a spell-FX burst; a genuinely silent hit path had to be added by hand), and
  exactly one hardcoded singleton player unit ("the knight") with no generalized movement/
  pathing for anything else. Every bit of "party vs monsters" plumbing was built ad hoc in
  the demo script, not the engine. Grimoire's core value IS that combat-management layer
  (turn order, HP, targeting, multi-combatant state) — moving to voxel would mean building
  it a second time from scratch, not swapping a renderer. **User's call: stop treating this
  as a near-term gated bet — park it as a separate, long-term/exploratory project (maybe a
  future showcase/exploration mode), not Grimoire's combat surface. Grimoire uses
  iso-renderer.js going forward, full stop, not conditionally.** Stage 2 of the gate
  (Grimoire integration + phone FPS) will not be run.
- **Map-generation idea (user, 2026-07-21):** AI diorama image (e.g. Civitai "Cartoon
  Isometric Fantasy" LoRA on Illustrious, runnable in local ComfyUI) → map. Assessed: raw
  image-to-3D (TRELLIS/Hunyuan3D/Meshy) yields a frozen mesh with no tile semantics — weak
  as the playable surface, fine as one-off static backdrops. Strong version: image →
  vision model (Claude or local Qwen3-VL) → **voxel map data** (per-tile block + height)
  for the engine — AI aesthetic drives layout/palette, gameplay data stays real. Depends
  on the voxel decision gate passing first.
- Until then: no further investment in pixel-art terrain; iso-renderer.js gets maintenance
  only.

## Long-term: engine reuse beyond D&D (user, 2026-07-21)

Once rules + graphics + engine are solid, the stack should be repurposable for other RPGs
(e.g. real-time Diablo-2-style ARPG, turn-based FFT-style tactics). Honest reuse map:
voxel engine + AI asset pipeline = fully game-agnostic; FFT-style = high reuse (grid math,
turns, effects, adapters — swap the 5e content); D2-style real-time = renderer/assets only
(tick loop, collision, loot are a new game). **Near-term consequence:** the modularization
phase (roadmap #4) must cut seams along engine ↔ grid-combat framework ↔ 5e rules content
↔ UI. Build for Grimoire, keep seams clean, do NOT generalize early.

## Known risks — flagged now, before they bite

- **WotC IP (the big one).** SRD 5.1 is CC-BY-4.0, but much current content is NOT SRD
  (Echo Knight, most named subclasses, many spells/monsters). Fine as a personal web app;
  a takedown risk on the App Store. Before any store submission: content audit + decision
  (SRD-only build, renamed equivalents, …). Action now: when touching content data,
  **tag entries by source** so a store build can filter.
- **AI key handling.** Narrator uses the user's Anthropic key from localStorage. OK for
  friends; a store product needs a real decision (BYOK UI vs. paid backend). Don't invest
  further in the key-in-localStorage pattern than necessary.
- **Modularization hazards.** Every new file must be added to `sw.js`'s cache list or
  offline breaks silently. Refactor ships zero visible features — do it in stages between
  feature phases. *(2026-07-28: this is now enforced by a drift guard in `rules-test.js`
  rather than by remembering — it fails if a local `<script src>` isn't in `ASSETS`.)*
- **"Offline-first" has two real holes, both verified 2026-07-28.** (a) **Multiplayer is not
  offline at all** — PeerJS is loaded from `https://unpkg.com/peerjs@1.5.4/...` at host/join
  time, so DM-hosted and player-net simply cannot start without internet. That's inherent to
  P2P signalling, so it may be acceptable, but the app shouldn't imply otherwise. (b) The
  `iso3d/` WebGL map (18 modules) isn't precached, so it degrades to the 2D renderer offline
  until it's been loaded online once. See AUDIT.md's known-simplifications for the fix options.
- **localStorage ceilings.** Growing campaigns/content/homebrew will eventually hit quota.
  Export/import (roadmap #2) is the safety net; IndexedDB is the eventual fix — decide
  when it actually pinches.
- **Parity is the keystone.** 4–6 player sessions + even mode split means silent mode
  divergence is the most expensive bug class in the app. Hence roadmap #3.

## Standing credit-efficiency rules (all phases)

- Batch per phase: one version bump + one AUDIT.md section + one test run + one
  dual-branch push + one API SHA verify per phase, not per feature.
- Grep anchors only; never wide reads of index.html.
- Every new persistent field → `ensureFields`; every per-turn flag → `freshTurnState`;
  every advantage/disadvantage rule → `Engine.hitResult`.
- Big systems (reactions, mounts, multiclass, fog of war) get a short scoping message
  before the build; small stuff just ships.
