# Grimoire Master Plan — “Uncucked Grimoire”

**Goal:** A self-contained, offline-first **D&D 5e** character + combat tool that is *actually* fun to run battles in — sheet depth, honest 5e rulings, and a modern isometric battlefield (Iso3D) — without becoming a half-baked VTT clone of Roll20.

**Rules baseline:** 2014 PHB / DMG / MM (as already tracked in `AUDIT.md` + `rules-test.js`).  
**Presentation:** `iso3d/` (WebGL) + classic iso fallback.  
**Sister project:** `../iso3d-engine/` (engine source of truth; vendored into `iso3d/src`).

---

## 1. What’s already strong (keep this)

Do **not** rewrite these for ego:

| Area | Why it matters |
|------|----------------|
| Offline PWA, no backend | Instant load, works on a plane |
| Deep character sheet | Classes, subclasses, feats, inventory, spells, long/short rest |
| `Engine` + adapters | One attack/cast path for QB / DM / net |
| `AUDIT.md` + `rules-test.js` | Real 5e discipline (190+ tests) |
| Quick Battle + random forge | Best demo loop for new features |
| Campaign / DM / PeerJS multiparty | Rare for a static app |
| Spell prose → mechanics parser | Huge content leverage (fragile but powerful) |
| Iso renderer split (`iso-renderer.js`) + Iso3D host | Correct architecture direction |

**Uncucked ≠ rewrite from zero.** It means: fix the ceilings, modularize the death-star file, finish 5e combat vision, make Iso3D the default battlefield.

---

## 2. Diagnosis — what’s holding it back

### 2.1 Architecture debt

| Issue | Cost |
|-------|------|
| **`index.html` ~500KB / ~5.4k lines / ~400 functions** | Every change is high-risk; agent/human context burns; merge hell |
| **Load-bearing prose** (`SPELL_DESC`, monster `atk` strings) | Typos change rules; hard for non-devs to extend |
| **Three battle UIs** (sheet combat modal, QB, DM/net) | Feature parity lag — Sanctuary/Power Word/etc. often **QB-only** |
| **Re-render whole app** (`innerHTML` wipe) | Breaks focus, expensive; Iso3D host destroy/recreate every frame of UI |
| **Map presets mediocre** | First impression of battle is “meh” |
| **Sprite coverage thin** | Only Fighter + some monsters; classes fall back to placeholders |

### 2.2 5e / combat gaps (rules)

From `AUDIT.md` + code inspection:

| Gap | 5e expectation | Status |
|-----|----------------|--------|
| **Light levels** | Bright / dim / darkness; darkvision; heavily obscured | Flavor only for Darkness/Fog; **no tile light map** |
| **Hide / stealth combat** | Hide action, unseen attacker, invisible | Partial conditions; **no full hide-on-grid** |
| **Feature parity QB vs DM/net** | Same spells work everywhere | Many “hard” spells **QB-only** |
| **AoE shapes** | Cones/lines/cubes | Often equal-area **burst approximations** |
| **True Strike target scoping** | Adv vs *that* creature | Simplified: any target |
| **Holy Aura save adv** | Allies adv on saves | Not modeled |
| **Advantage on saves** (generic) | War Caster etc. special-cased | No general “adv on all saves” layer |
| **Reaction economy AI** | Counterspell, Shield timing | Partial; AI limited |
| **Grapple / shove** | Contests, prone, speed 0 | Incomplete as first-class actions |
| **Legendary / lair / lair init** | Boss fights | Not really there |
| **Rest & resource edge cases** | Hit dice, multiclass slots | Mostly OK; keep testing |
| **Magic item attunement / charges** | Common table play | Thin |
| **Exhaustion, diseases, longer conditions** | Campaign play | Thin |

### 2.3 UX / product gaps

- Battle log is text-only; hard to *see* the fight (Iso3D + floaters fix this)
- Targeting is modal-heavy on mobile
- DM map editor powerful but dense
- No guided “first fight in 60 seconds” with Iso3D on by default (partially fixed v120.2)
- Character sheet and battle feel like two apps sharing a DB

### 2.4 Multiplayer / campaign

- PeerJS dependency on unpkg (offline multiparty fails)
- State authority is solid (DM) but reconnection edge cases remain
- Campaigns don’t version-migrate cleanly when schema drifts

---

## 3. North-star product pillars

1. **Honest 5e** — If the PHB says it, either implement it or document a simplification in `AUDIT.md` with a test.
2. **One combat brain** — Every mode calls `Engine` + shared targeting helpers; no QB-only secret rules forever.
3. **Battlefield you want to look at** — Iso3D default for QB; sprites, projectiles, terrain readability.
4. **Modular codebase** — Split `index.html` into ES modules without a bundler (or optional tiny build later).
5. **Offline-first forever** — PWA cache, localStorage, export/import.
6. **DM + solo both first-class** — Quick Battle is the lab; campaigns are the product.

---

## 4. Master roadmap (phased)

### Phase 0 — Stabilize & document *(ongoing)*

- [x] Rules tests + AUDIT culture  
- [x] Iso3D host toggle in QB/DM  
- [x] QB: forge random + start in Iso3D  
- [ ] Version discipline on every user-visible push (`APP_VERSION` + `sw.js` + Iso3D `?v=`)  
- [ ] “Known simplifications” one-pager in-app (Settings → Rules notes)

### Phase 1 — Modularize without a build step *(foundation for everything else)*

Split the death-star carefully (keep zero-backend):

```
dnd-character/
  index.html          # shell + CSS + boot
  js/
    data/             # weapons, armor, spells tables, monsters, terrain
    rules/            # Engine, AC, slots, concentration, parseSpell*
    battle/           # dijkstra, cover, QB, DM adapters, AI
    sheet/            # renderSheet, levelUp, inventory
    net/              # PeerJS DM/player
    ui/               # modals, tabs, dice
  iso-renderer.js
  iso3d/              # WebGL host (already)
```

Rules:

- One PR = one domain extracted  
- After each extract: `node rules-test.js` + smoke QB  
- No bundler required: `<script type="module" src="js/main.js">`  
- Keep `localStorage` keys stable; migrations in `ensureFields`

**Why first:** You cannot “uncuck” a 5k-line file productively.

### Phase 2 — Combat parity (5e correctness)

Make **one** targeting/cast/attack pipeline used by QB, sheet battle, and net:

| Work item | 5e win |
|-----------|--------|
| Lift QB-only spell hooks (Sanctuary, Power Word, Eyebite, Holy Aura react) into shared Engine/adapters | Same spell works at the table and solo |
| Grapple / shove as explicit actions | Contests, prone, speed 0 |
| Dodge / Help / Ready / Hide as first-class battle actions | Action economy completeness |
| Reaction window UX (Shield / Counterspell / OA prompts) | Real reaction play |
| Exhaustion levels 1–6 | Campaign attrition |
| Optional: 5-10-5 diagonal movement toggle (default keep current) | Table preference |

### Phase 3 — Vision, light, stealth (big 5e missing chunk)

```
session.map.light: { "x,y": 0|1|2 }  // darkness | dim | bright
unit.vision: { darkvision: 60, devilSight: false, ... }
unit.hidden: bool + stealth total
```

Rules:

- Heavily obscured → effectively blinded for sight  
- Dim → disadvantage on Perception (Wis) that relies on sight; stealth easier  
- Darkvision: dim→bright, darkness→dim within range  
- Hide: action/Cunning Action; enemies need Perception vs Stealth or see you attack  

Iso3D:

- Darken tiles by light level  
- Hidden units: silhouette / opacity  
- Light cantrip / torch = moving light sources  

### Phase 4 — Iso3D as default battlefield

| Work item | Notes |
|-----------|--------|
| Default **Iso3D on** for new Quick Battles | Classic iso remains fallback; QB checkbox exists (v120.2+) |
| Projectiles + burst VFX from `GrimoireEvents` | **Done v0.5 / v120.3** — `fx.js` + `handleGameEvent` |
| Floaters: hit / miss / dmg / heal / sneak / cover | **Done v0.5.6 / v120.8** — ADV/DIS/sneak/cover on hit floaters |
| AoE + move path previews | Move tint + attack range + blast tiles (v120.x); path ghost still TBD |
| Cover / ADV / DIS badges when targeting | **Done v0.5.6 / v120.8** — Iso3D overlay pills while targeting |
| Difficult terrain / hazard materials | Map Grimoire `TERRAIN` keys → visuals |
| Reuse host across re-renders | **Done v0.5 / v120.3** — `attach()` + camera keep |
| Pathfind walk (no teleport snaps) | **Done v0.5.1 / v120.4** — `pathfinding.js` + `animatePath` + Grimoire `animateToken` |
| Better maps | Editor export, hand-authored arenas — **not** weak stock presets as pride content |
| Full class sprite set | Wire remaining classes in `SPRITE_MANIFEST` |

### Phase 5 — Content & data quality

| Work item | Notes |
|-----------|--------|
| Move spell mechanics from prose to structured JSON | Keep prose as display; mechanics explicit |
| Monster blocks: structured attacks, not only parse strings | SRD completeness |
| Magic items: attunement, charges, common list | Campaign play |
| Conditions reference panel (PHB glossary in-app) | Teaching tool |
| Multiclass edge-case test pack | Slot math, Extra Attack, etc. |

### Phase 6 — Product polish

| Work item | Notes |
|-----------|--------|
| Onboarding: “Forge → Quick Battle → Iso3D” 90-second tutorial | First-run |
| Battle log + cinematic replay optional | Share moments |
| Export/import campaign + map packs | Sharing without a server |
| Optional self-host multiplayer (WebRTC still OK) | Document offline limits |
| Accessibility: keyboard targeting, reduced motion | |
| Performance: large maps (26×20+) with Iso3D | Mesh caching |

### Phase 7 — Stretch (only if Phase 1–4 are solid)

- Encounter builder (XP budgets, CR)  
- Initiative tracker as standalone mini-window  
- Import D&D Beyond-ish JSON (legal/ToS careful)  
- 2024 PHB ruleset toggle (huge; don’t mix into 2014 without a flag)

---

## 5. “Uncucked” principles (decision filter)

When choosing work, prefer the change that:

1. **Closes a 5e lie** (something the UI pretends works but doesn’t)  
2. **Unifies QB and table play** (one Engine path)  
3. **Improves the fight you see** (Iso3D feedback)  
4. **Reduces `index.html` surface area**  
5. **Adds a test**  

Reject:

- Feature that only works in one battle mode forever  
- Second damage calculator inside Iso3D  
- Massive framework rewrite (React/Vue) until modules exist  
- Chasing Roll20 feature parity  

---

## 6. Suggested near-term sequence (concrete)

```
P4a  Iso3D: projectiles + floaters on GrimoireEvents     ✅ v120.3 / Iso3D 0.5
P4b  Iso3D: host reuse + move highlights                   ✅ v120.3
P1a  Extract js/rules/engine.js + tests still pass         ← next structure
P1b  Extract js/data/spells.js + monsters.js
P1c  Extract js/battle/grid.js (dijkstra, cover, los)
P2a  Shared spell-target pipeline (kill QB-only gates)
P4c  ADV/DIS/cover targeting badges + sneak floaters   ✅ v120.8 / Iso3D 0.5.6
P4d  Terrain materials polish + path ghost
P3a  Design light map schema + Darkness/Light wiring
P1a  Extract js/rules/engine.js + tests still pass
```

---

## 7. Success metrics

| Metric | Target |
|--------|--------|
| `rules-test.js` | Always green; new rule → new test |
| QB-only spell exceptions | Documented list shrinks every release |
| Time to first fun fight | &lt; 2 min (forge + QB + Iso3D) |
| `index.html` line count | Trend down each phase |
| Battle readability | Cover/ADV/sneak/terrain visible without reading the log |

---

## 8. Repo layout (target)

```
faggot/
  dnd-character/          # Grimoire product (this plan)
    MASTER_PLAN.md        # you are here
    AUDIT.md              # 5e rulings
    index.html → thins over time
    js/ ...
    iso3d/                # vendored WebGL host
  iso3d-engine/           # engine lab + PLAN.md
```

Sync engine → product:

```powershell
Copy-Item -Force ..\iso3d-engine\src\*.js .\iso3d\src\
```

---

## 9. Open decisions (for you)

1. **Default battlefield:** Iso3D on for everyone, or opt-in until more polished?  
2. **Movement diagonals:** keep current (no corner cut, equal cost) or add PHB-optional 5/10/5?  
3. **2024 rules:** ignore for a year, or plan a ruleset flag early?  
4. **Module split pace:** aggressive (big extract PRs) or slow (one domain/week)?  
5. **Map content:** invest in a few great hand-made arenas vs map editor UX?

---

*This plan is living. Update when a phase ships or a ruling changes. Grimoire stays uncucked by refusing silent wrong rules and refusing a second combat engine in the renderer.*
