# Iso3D Engine — Plan & Goals

**Product:** A fully working isometric battle **renderer** (and a small tactics sandbox to exercise it), built separately from Grimoire (`dnd-character`).  
**End state:** Drop-in (or thin-adapter) battle view for Grimoire’s real **D&D 5e** rules — **not** a second rules engine.

### Rules baseline: D&D 5e (2014 PHB / DMG / MM)

Everything tactical must **fit 5e**, not FFT-only house rules. Grimoire’s `AUDIT.md` + `rules-test.js` are the authority; Iso3D only displays outcomes.

| 5e concept | Grid ruling we use | Notes |
|------------|--------------------|--------|
| **Scale** | 1 square = **5 feet** | Matches Grimoire |
| **Speed** | Feet per turn (e.g. 30 ft = 6 squares) | Dijkstra spends feet, not abstract “AP” |
| **Diagonals** | Allowed; Grimoire uses equal cost + **no corner-cutting** through walls | Optional 5/10/5 diagonal rule is *not* used unless Grimoire changes |
| **Difficult terrain** | Costs **extra movement** (Grimoire: 10 ft enter vs 5 ft) | Mud, snow, brush, grease, etc. |
| **Climb / elevation** | Height levels cost movement (Grimoire: +5 ft per level up) | Cliffs are elevation + often wall/solid |
| **Cover** | Half **+2 AC**, three-quarters **+5 AC** | From opaque/solid between attacker and target |
| **Line of sight** | Blocked by total cover / opaque terrain | Required for most attacks & many spells |
| **Advantage / disadvantage** | Cancel pairwise; net one or the other | Conditions, stealth, light (when modeled) |
| **Sneak Attack** | Once per turn; needs finesse/ranged + adv **or** ally within 5 ft of target (and no disadv) | Grimoire implements |
| **Spells** | Slots, concentration, cast time (action/bonus/reaction), range, AoE shape | AoE approximated on grid in Grimoire tables |
| **Concentration** | One conc spell; Con save on damage DC max(10, half damage) | Grimoire implements |
| **Light** | Bright / dim / darkness; darkvision; heavily obscured | Full light **grid** still a Grimoire gap; when added, Iso3D shades tiles |
| **Hidden / unseen** | Hide (Stealth), unseen attackers get advantage, etc. | Presentation: faded/hidden sprite |
| **Opportunity attacks** | Leave enemy reach | Grimoire QB already has OA hooks |
| **Death / HP** | 0 HP, death saves, instant death, temp HP | Character sheet + battle adapters |

**Sandbox Iso3D** (standalone mini-tactics) may stay simplified for graphics tests, but **anything labeled for Grimoire must follow 5e** via Grimoire’s Engine — no parallel combat math in the renderer.

**Current version:** see `src/version.js` (v0.5.x)  
**Last major milestone:** v0.5.0 — combat FX (projectiles/floaters), host reuse, `GrimoireEvents` wiring  

**Product-wide roadmap (Grimoire + Iso3D + 5e):** see [`../dnd-character/MASTER_PLAN.md`](../dnd-character/MASTER_PLAN.md)

---

## Guiding principles

1. **Renderer ≠ rules** — same split Grimoire already uses (`iso-renderer.js` knows nothing about D&D).
2. **Sandbox first** — prove camera, terrain, picking, units, VFX without touching Grimoire.
3. **Grimoire is the brain** — spells, feats, slots, Engine, Events stay there.
4. **Sprites eventually** — FFT / Disgaea style billboards, not permanent colored boxes.
5. **No Grimoire map presets** — their stock maps aren’t worth importing; build our own demo maps / editor output.
6. **Bump `APP_VERSION` + script `?v=`** on every user-visible change so cache/debug is obvious.
7. **Show what the rules already decide** — cover, adv/disadv, sneak, light, terrain costs are *computed in Grimoire*; Iso3D visualizes them.

---

## Combat feature surface (target experience)

These are **in scope** for the finished Grimoire + Iso3D battle view. Ownership:

| Feature | Rules owner (Grimoire) | Iso3D shows |
|---------|------------------------|-------------|
| **Spells** | Cast, slots, saves, AoE, concentration (`castSpell`, `Engine.castApply`, `SPELL_*`) | Cast targeting UI rings, AoE preview on tiles, cast VFX, projectile/burst, condition icons |
| **Projectiles** | Range, LoS, hit/miss (`mapProjectile` already exists in 2D) | Arc/beam from attacker → target; crit flash; damage floaters |
| **Difficult terrain** | `TERRAIN.diff`, Dijkstra 10 ft / tile, mud/sand/snow/brush/grease/web… | Distinct tile look + move-cost tint; path cost readout optional |
| **Hazard / status terrain** | `dmg`, `prone`, `restrain`, acid/lava/caltrops/grease/web | Tile FX; status pips on unit when applied |
| **Cover** | `coverBetween` → +2 half / +5 ¾ to AC | Soft LOS wedges, cover badge on target when aiming |
| **Advantage / disadvantage** | `attackAdvantage` from conditions (prone, restrained, invisible, etc.) | Dice UI / banner “ADV” / “DIS”; optional glow on attacker/target |
| **Sneak Attack** | Rogue dice when adv or ally adjacent (`sneakUsed` per turn) | Combat log + floater “Sneak +Xd6”; ally-adjacency hint |
| **Light levels** | *Partial today* (Darkvision text, Darkness spell, sunlight sensitivity) — needs a real **grid light model** in Grimoire | Dim/dark tile darkening, light radius from torches/Light cantrip, stealth-in-shadow cue |
| **Stealth / hide** | Cunning Action Hide, unseen attacker | Faded sprite / “Hidden” tag; reappear on attack |
| **Elevation** | Climb cost in Dijkstra, height dict | Already partially: cliff meshes; show height chevrons |

### Already in Grimoire (rules) — do not reimplement in Iso3D

- Spell slots, concentration, action economy  
- Dijkstra movement + no corner-cutting  
- LoS Bresenham + cover AC bonus  
- Condition-driven adv/disadv on attacks  
- Sneak Attack / Divine Smite riders  
- Grease/Web paint temporary terrain  
- Monster AI (`BRAINS.tactical`)  

### Still thin or missing in Grimoire (rules gaps to fill later)

- **Per-tile light level** (bright / dim / darkness) and vision (darkvision, devil’s sight)  
- Full stealth grid (hide → invisible to AI until revealed)  
- Iso3D-native projectile system (today: 2D map helpers)  

### Iso3D presentation backlog (driven by `GrimoireEvents` + session snapshot)

```
Phase D2 — Feedback
  [ ] Projectiles + spell bolts (Event: attack / cast)
  [ ] Floating combat text (hit/miss/dmg/heal/sneak)
  [ ] AoE ring preview before cast commit
  [ ] Condition icons over sprites (Prone, Hidden, …)

Phase D3 — Tactical readability
  [ ] Difficult-terrain / hazard tile styling from Grimoire keys
  [ ] Move path ghost + remaining feet
  [ ] Cover indicator when a target is selected
  [ ] ADV/DIS chip next to attack prompt (data from Engine)

Phase D4 — Light & stealth
  [ ] Consume light map { "x,y": 0|1|2 } from session when Grimoire adds it
  [ ] Hidden unit rendering
  [ ] Dim lighting post-process / per-tile darken
```

---

## North-star goals

| # | Goal | Success looks like |
|---|------|--------------------|
| G1 | **Stable WebGL iso battlefield** | Elevation, grass/dirt/water/cliffs, camera, pick tiles reliably across browsers |
| G2 | **Authorable maps** | Terrain editor + save/load JSON; maps feel good to fight on |
| G3 | **Sprite units (FFT-like)** | Billboards with facing; reuse / match Grimoire sheet layout where possible |
| G4 | **Presentation-complete combat sandbox** | Move, target, attack/heal feedback, turn order — enough to demo the *view* |
| G5 | **Grimoire contract** | Accept Grimoire-shaped map + unit state; emit clicks / listen to `GrimoireEvents` without owning rules |
| G6 | **Integration** | Grimoire Quick Battle (or DM map) can use Iso3D instead of 2D diamonds |

---

## Goal list by phase

### Phase A — Foundation *(mostly done)*

- [x] Pure math (mat4/camera/grid), no CDN load-order bugs
- [x] WebGL2 tile mesh + elevation / cliff faces
- [x] Terrain types: grass, dirt, water, cliff (+ sand/mud)
- [x] Mini-tactics: initiative, move, melee/ranged, Fire Bolt, Cure Wounds, AI, win/lose
- [x] Terrain editor (paint / raise / lower / undo / JSON)
- [x] Version number + boot error surfacing
- [ ] Headless tests stay green after each milestone
- [ ] README matches actual controls and version policy

### Phase B — Map & visual polish *(next focus)*

- [ ] Richer water/grass/cliff read at a glance (without killing perf)
- [ ] Decor layer (trees/bushes) — optional solids / LoS blockers later
- [ ] Larger authored demo map(s) from the editor (not Grimoire presets)
- [ ] Map JSON schema documented (`cols`, `rows`, `cells[{h,type}]` or Grimoire-compatible export)
- [ ] Optional: export path that can *emit* Grimoire-style `tiles`/`height` dicts for future glue
- [ ] Performance pass on mesh rebuild (dirty regions or cache; don’t rebuild units every frame forever)

### Phase C — Sprite characters *(FFT / Disgaea direction)*

- [ ] Billboard quads at unit height (camera-facing or 4 fixed iso yaws)
- [ ] Sprite atlas loader (start with solid placeholders, then PNGs)
- [ ] Align with Grimoire sheet convention where useful: **4×4**, row = facing, col 0 = idle
- [ ] Facing from last move / target direction
- [ ] HP bar / active-turn ring that works with sprites (not only boxes)
- [ ] Team color trim or nameplate without clutter
- [ ] Later: walk / attack / cast frame columns driven by sandbox (or Events)

### Phase D — Sandbox combat presentation

- [ ] Clear target highlights (range, LoS, AoE preview circles/diamonds)
- [ ] Floating combat text (hit / miss / damage / heal)
- [ ] Simple projectile or flash on attack (no full VFX stack yet)
- [ ] Turn order strip (portraits or colored pips)
- [ ] Keyboard + UI parity; pause/edit modes don’t break battle state
- [ ] Keep rules **simplified** here — enough to stress the renderer only

### Phase E — Grimoire integration contract *(done for v0.4)*

- [x] `src/adapter.js` — Grimoire tiles/height → Iso3D map; players/monsters → view units
- [x] `src/host.js` — `Iso3DHost` mount, session sync, pick → callback
- [x] `src/sprites.js` — 4×4 sheet overlay (FFT-style facing)
- [x] `bridge.html` — standalone Grimoire-shaped session demo
- [x] Vendored copy under `dnd-character/iso3d/`

**Out of scope for Iso3D (still):**
- Spell slots, feats, AC math, concentration, netcode, character sheets

### Phase F — Wire into Grimoire *(started v0.4 / v120.1)*

- [x] Feature toggle: **🕹 3D** (with isometric on) in Quick Battle, DM map, player battle
- [x] `mapGridHTML` emits `#iso3dMount`; classic iso-renderer still available
- [x] Clicks: host pick → existing `.mcell` handlers (rules untouched)
- [x] Sprites from Grimoire `sprites/` paths
- [ ] Smoother host reuse across re-renders (less destroy/recreate)
- [ ] Reach/AoE highlights pushed into WebGL host (not only CSS rings)
- [ ] `GrimoireEvents` → attack flash / walk frames
- [ ] Do **not** bulk-import Grimoire map presets

---

## Explicit non-goals (for now)

- Re-implementing 5e spell/feat depth inside Iso3D  
- Netplay / DM session hosting inside Iso3D  
- Full autotile texture pipelines  
- Shipping Grimoire’s weak presets as our default content  
- Mobile-first polish before desktop WebGL is solid  

---

## Suggested order of work (practical)

```
B1  Mesh perf + map schema docs
B2  One great hand-authored demo map (editor)
C1  Billboard placeholders (still colored, but sprite-shaped)
C2  Load real PNGs (fighter / goblin trial)
D1  Floating combat text + better targeting UI
E1  Adapter: Grimoire map dict → Iso3D setMap
E2  Adapter: Events → flash/anim
F1  Optional toggle in Grimoire
```

---

## Tracking

| Field | Value |
|-------|--------|
| Standalone app | `C:\Users\andrew\Desktop\faggot\iso3d-engine` |
| Rules app (read-only until F) | `C:\Users\andrew\Desktop\faggot\dnd-character` |
| Version file | `src/version.js` → bump with `index.html` `?v=` |
| When stuck | Boot error UI + F12 console |

---

## Milestone checklist (short)

- [ ] **M1** — Pretty, editable maps you enjoy looking at  
- [ ] **M2** — Sprite units feel like tactics game pieces  
- [ ] **M3** — Sandbox fights are readable (feedback, turn UI)  
- [ ] **M4** — Adapter talks to Grimoire data shapes  
- [ ] **M5** — One real Grimoire battle mode uses Iso3D  

Update this file when a phase completes or priorities change.
