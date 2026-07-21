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

1. **Finish the in-flight feat backlog** (see HANDOFF_2026-07-21.md): small-feat batch →
   Battle Master maneuvers → mount system. Don't leave it half-done.
2. **Backup export/import** — download/restore all data as a file. Cheap insurance before
   everything else piles into localStorage.
3. **Mode-parity audit + parity test harness** — sweep every `hasFeat`/system hook for
   QB/DM-hosted/player-net coverage, fix gaps, and build a harness that runs the same
   scenario through all three adapters so divergence is caught by tests forever. Comes
   *before* new systems so new code can't repeat the sin.
4. **Modularization** — staged split of index.html (data tables → rules → net → UI), tests
   green after each stage, never a big-bang rewrite. Must precede reactions and multiclass
   so the big systems land in clean modules.
5. **Combat depth** — reactions system (own design pass first: it's an interrupt across
   three modes), legendary/lair actions, magic items + attunement, traps/hazards
   (traps also unblock the Dungeon Delver feat).
6. **Multiclassing + content expansion passes** — multiclass touches slots/proficiencies/
   level-up everywhere; that's exactly why it waits for modularization + parity harness.
7. **Map as primary surface** — fog of war, per-player vision, shared TV overview mode,
   better map-building tools.
8. **DM tools + AI** — encounter builder (CR/XP budget), homebrew monster editor, combat
   undo (undo is cheap — may slot in earlier), then AI DM-assistant and solo-AI-DM.
9. **1.0 store push** — native wrapper (Capacitor or similar), onboarding, empty states,
   polish, and the content/legal audit below.

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
  feature phases.
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
