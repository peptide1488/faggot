# 5e Rules Audit — v83

Full audit of Grimoire against the 2014 Player's Handbook / Monster Manual. Every fix below
ships in `index.html` v83 and was verified by an automated rules test-suite (57 assertions,
all passing) covering spell slots, action economy, concentration, AC math, death rules,
fighting styles, and monster data.

---

## 1. Spells

### Data corrections
| Spell | Was | Now (PHB) |
|---|---|---|
| Hex / Hunter's Mark | 1 min duration | **1 hour** (concentration) |
| Aid | 48 min | **8 hours** |
| Heroes' Feast | 1 hour | **24 hours** |
| Animal Shapes | listed as concentration | **not concentration** (24 h) |
| Magic Missile | 1 dart (1d4+1), curved around walls | **3d4+3 total, auto-hit, requires line of sight** |
| Sleep | dealt 5d8 *damage* | **no damage** — HP-threshold sleep, no save |
| Chill Touch / Vampiric Touch | parsed as *healing* the caster | ranged/melee **spell attacks** dealing damage |
| Shocking Grasp, Produce Flame, Thorn Whip, Witch Bolt, Spiritual Weapon | auto-hit | **spell attack rolls** |
| Moonbeam | treated as attack roll | **Con save**, 2d10/turn |
| Call Lightning, Spirit Guardians, Cloudkill, Insect Plague, Flame Strike, Wall of Fire, Ice Storm, Sunbeam, Sunburst, Circle of Death, Harm, Chain Lightning, Fire Storm, Finger of Death, Feeblemind, Meteor Swarm, Delayed Blast Fireball, Faerie Fire, Web | no save parsed | correct **save types** per PHB |
| Ice Storm / Flame Strike / Meteor Swarm | only first dice group rolled | parser now sums **all** dice groups (2d8+4d6 etc.) |
| Ghoul-style "no-damage" attack spells (Ray of Enfeeblement, True Strike) | dealt phantom 1d6 | deal **0**; effect only |

### Areas of effect (grid rulings, 1 tile = 5 ft, Chebyshev distance)
- Sphere radius R ft = R/5 tiles: Fireball/Cloudkill/Sleep/Stinking Cloud/Ice Storm/Insect Plague/Spike Growth 4, Shatter/Flame Strike 2, Sleet Storm 8, Sunburst/Circle of Death 12, Moonbeam 1.
- Cube of side S ≈ radius S/10: Thunderwave (15-ft cube) 1, Web/Faerie Fire/Entangle (20 ft) 2, Grease (10 ft) 1, Hypnotic Pattern (30 ft) 3.
- Cones/lines approximated as **equal-area** bursts: Burning Hands (15-ft cone) 1, Cone of Cold (60-ft cone) 4 — *was 12, i.e. a 125-ft-wide blast*, Lightning Bolt (100-ft line) 2.
- Spirit Guardians and Thunderwave are self-centered in the PHB — center them on your own tile.
- Meteor Swarm was missing from SPELL_AOE entirely (fell through to a single-target cast). Its four 40-ft-radius impact points are collapsed to one centered r8 burst, same radius as Sleet Storm's largest sphere.

### Coverage audit (v92) — spells that silently did nothing
`SPELL_AOE`/`SPELL_COND` are hand-curated tables; a spell missing from both isn't an error,
it just falls through to "no blast, no condition" with zero feedback. A one-time sweep of
every `SPELL_DESC` entry for area/condition language turned up real no-ops beyond Grease and
Meteor Swarm — all fixed:
- **Charm Person / Animal Friendship** — Charmed condition was never applied on a failed save (Charmed 1 hr / 24 hr).
- **Fear** — no AoE (single-target only, contradicting its 30-ft cone) and no Frightened condition. Added AoE r2 (cone-length ratio matching Burning Hands/Cone of Cold) + `SPELL_COND`.
- **Color Spray** — no AoE and no Blinded condition; was a complete no-op like Grease/Meteor Swarm.
- **Sunbeam** — dealt damage but never blinded on a failed save.
- **Sleet Storm** — had an AoE but no save keyword in its description (so no save was ever rolled) and no Prone condition; reworded to state "Dex save" and added the condition.
`rules-test.js` now runs a standing coverage check so a spell added with area/condition
language in its description but missing from these tables **fails the test suite
immediately** instead of shipping silently broken. Any future addition to the exceptions
list needs a one-line reason here, same as the ones below.

Also (v92→v93): **Grease** now paints real difficult terrain (`SPELL_TERRAIN`, `TERRAIN.grease`)
that lasts 10 rounds (1 min) and reverts automatically — anyone who ends a move on it rolls a
Dex save (DC = the caster's spell DC at cast time) or falls prone, checked for both the PC
(`qbMovePc`) and monster movement (`qbApplyIntent`). Previously it only checked whoever was
standing in the blast at the moment of casting. And: casting a narrative/utility spell (e.g.
Unseen Servant) in Quick Battle now writes a line to the visible Battle Log — it always spent
the slot and logged to the character sheet, but gave zero feedback in the log the player is
actually watching, which read as "does nothing."

### Coverage audit, part 2 (v93) — bespoke effects that aren't named conditions
The first coverage pass only catches spells worded as a named PHB condition (Prone, Charmed,
Frightened, etc.). A second, distinct failure shape: spells with a bespoke one-off rider —
"next attack has advantage," "can't take reactions" — that was never a named condition to
begin with, so it's invisible to that check too. Found and fixed:
- **Shocking Grasp** — "the target can't take reactions" was never enforced. Also fixed a
  real bug this exposed: the attack-spell path applied its `SPELL_COND` rider unconditionally,
  even on a miss (`qbResolveAttack`'s `done` callback didn't pass hit/miss information back).
  `done` now receives the resolved event so callers can gate on `ev.hit`.
- **Chill Touch** — "the target can't recover HP this turn" was never tracked; now applied as
  a visible condition tag on hit, same tier as existing bespoke tags (Hexed, Marked, Retching)
  — informational, not separately enforced inside the heal path.

Another standing `rules-test.js` check covers this class the same way: any future spell worded
with one of these bespoke phrases and missing from both `SPELL_COND` and `SPELL_EFFECTS` fails
the suite unless it's in the exceptions list with a reason here.

**Not a bug — intentionally out of scope, no engine change needed:**
- **Cloud of Daggers** — a 5-ft-cube zone is a single tile; direct single-target selection already covers it, no blast UI needed.
- **Fog Cloud, Darkness, Silence, Daylight, Gust of Wind, Antimagic Field** — pure vision/utility auras with no damage or condition to apply in this engine; their radius is flavor only.

### The "hard" gaps (v94) — implemented, not just documented
The list above was originally written off as needing new mechanics rather than a table row.
It turned out each one *did* fit the engine, once given a small dedicated hook rather than
forcing it through `SPELL_COND`/`SPELL_AOE`:
- **True Strike** — models the granted advantage as a self-applied `SPELL_EFFECTS` condition
  (`'True Strike'`), read by `attackAdvantage`. Simplification: grants advantage on your very
  next attack against *any* target, not only the one you named — this app has no notion of a
  condition scoped to one specific enemy.
- **Guiding Bolt** — reuses the exact same advantage mechanism as **Faerie Fire**. Turns out
  Faerie Fire's whole purpose ("outlined foes grant advantage to attacks against them") was
  *also* never wired into `attackAdvantage` — tagged as a condition but never read. Both are
  fixed together: a `Faerie Fire` or `Guided` condition on a target now genuinely grants
  attackers advantage.
- **Sanctuary** — the cast stashes a save DC on the effect (`effects[].dc`); every monster
  attack targeting the warded PC rolls a Wis save before the attack is allowed to proceed,
  consuming the attack on a failure (matches "loses the attack" — this app has no second
  ally target to redirect to).
- **Magic Weapon** — dynamic per-weapon choice menu (`SPELL_CHOICES['Magic Weapon']` is a
  function of the caster, not a static list) sets `item.magicBonus`. Tracked as a normal
  concentration effect; ending/expiring it clears the item's bonus via `clearItemEffect`.
- **Power Word Kill / Power Word Stun** — `POWER_WORD_HP` maps each spell to its HP threshold;
  `powerWordResolve` is a pure no-save, no-attack-roll check against the target's current HP.
- **Eyebite** — reworded to state "Wis save" so it parses as a save spell; on targeting a foe,
  a 3-option picker opens (Asleep/Frightened/Panicked+3d6 psychic+Poisoned). Resolution rolls
  one save that gates the *whole* chosen effect (a success means nothing happens at all — not
  half damage, unlike a normal save spell).
- **Holy Aura** — the DC is stashed on cast, same as Sanctuary. The reactive half (hostile
  attacker hits a warded creature → Con save or Blinded) is checked from the hit-resolution
  path via the pure `holyAuraResolve`, since that's the only place that knows a hit actually
  landed. Simplification: doesn't grant *advantage on saving throws* to warded allies —
  that's a separate, unimplemented "advantage on all saves" mechanic this engine doesn't have
  anywhere else either.

**Update (later session, exact version not recorded — this paragraph was stale until found
2026-07-18): all seven now have full DM-hosted and player-net parity, not just Quick
Battle.** `sessionAdapter` (used by `dmMonsterAttack`) exposes `sanctuaryDC`/`holyAuraDC` by
reading the synced values off the DM's player mirror (`playerHello`/`dmOnData` already sync
them); `weaponToHit`/`weaponDmgBonus` take the carried item directly so `magicBonus` applies
regardless of which attack menu built the call, not just `qbPcAttacks`; `spellTargetsEnemy`
has no `QB.active` gate on Power Word Kill/Stun; `openSpellTarget` (the DM/player-net
targeting path) has its own Eyebite-picker and Power-Word branches mirroring Quick Battle's.
`rules-test.js` covers the DM-session side explicitly (search for `sessionAdapter` in the
Sanctuary/Holy Aura tests) alongside the original Quick-Battle-only assertions above.

### Restrained/Grappled zero your speed (v94)
Web and Entangle correctly tagged the target `Restrained`, but nothing ever zeroed its
movement — a restrained creature could still walk normally next turn. `speedBlocked(u)` now
gates every place a turn's movement budget is granted: `freshTurnState` (PC), `qbBeginTurn`
and `dmRefreshActor`/`rollInitiative` (monsters), and the Dash-grant paths in `qbMovePc` and
`BRAINS.tactical` (Dashing while restrained still gives 0 speed, per RAW).

### Concentration checks now pause Quick Battle (v94)
`applyHp` → `concentrationCheck` opens a modal, but Quick Battle's AI turn loop
(`qbRunBrain`/`qbNextTurn`) ran on independent timers with no idea a modal was open. Monster
turns kept firing underneath the prompt, and each new hit spawned a **fresh, unrolled**
concentration check on top of the one you hadn't answered yet — that's what looked like
unlimited rerolls. `QB.paused` is now set while the modal is open and checked at both
turn-to-turn (`qbNextTurn`) and intra-turn (`qbRunBrain`'s attack-to-attack `step()`) boundaries.

### A self-buff's condition tag could outlive the buff (v94)
`endEffect` (manual dismiss) and `advanceRound` (DM/session mode) both correctly cleared a
condition tag (e.g. Invisibility → `Invisible`) when the backing effect expired — but Quick
Battle's own inline per-round expiry in `qbBeginTurn` forgot that line, so an effect that timed
out naturally during a QB battle left its condition permanently stuck on. Fixed to match the
other two expiry paths.

### Casting-time / action economy
- **Reaction spells** implemented: Shield, Hellish Rebuke, Counterspell, Feather Fall, Absorb Elements now check & spend the **reaction**, not the action.
- Bonus-action list gained Expeditious Retreat, Shillelagh, Divine Favor (all bonus-action casts in the PHB).
- Counterspell text now carries the full rule: auto-stops ≤3rd level, else ability check **DC 10 + spell level**.

### Cantrip scaling (PHB)
Damage cantrips now multiply their dice at character levels 5 / 11 / 17 (×2/×3/×4) in every
cast path — sheet, multiplayer targeting, and Quick Battle. Eldritch Blast's extra beams are
resolved as one combined roll of the same dice total.

### Line of sight
The homebrew "seeking" mechanic (auto-hit that curved around walls) is removed. Every spell
requires line of sight; Magic Missile keeps its auto-hit but must see the target, per "a
creature you can see within range".

## 2. Action economy
- Strict 1 action / 1 bonus / 1 reaction / move (already present) — plus:
- **Bonus-action spell rule** verified: casting any bonus-action spell locks other spells that
  turn to action-cantrips, in both orders (tested).
- **Rage is a bonus action** and lasts **1 minute** (was: free, 10 minutes).
- **Haste grants its extra action** (actionsPerTurn +1 while the effect is active; PHB's
  limited-use list noted in the effect text).
- Fixed a double-spend loophole: clicking a spell-attack roll button in battle also consumed a
  weapon attack and could burn a second action. Rolls are now pure; resources are spent only by
  `castSpell`/`attackFlow`.
- Swim/Climb movement costs ×2 (was ×1), matching crawl/difficult terrain.
- Off-hand attacks still require the Attack action first and consume the bonus action; Action
  Surge remains 1/rest.

## 3. Concentration
- Casting **any** concentration spell now registers concentration — previously spells without a
  stat-effect template (Hold Person, Invisibility on others, Web…) silently bypassed the
  one-concentration rule, letting a caster stack unlimited concentration effects. This was the
  single biggest AI-exploitable loophole.
- Same-named effects no longer stack (recasting refreshes duration instead of doubling bonuses
  — PHB "the effects of the same spell cast multiple times don't combine").
- Damage → CON save DC max(10, ⌊damage/2⌋), War Caster advantage, proficiency applied
  (already correct; verified).

## 4. Classes
- **Half-caster max spell level** fixed: Paladin/Ranger reach 1st at L2, 2nd at L5, 3rd at L9,
  4th at L13, 5th at L17 (the old formula gave 2nd-level spells at level 2). Artificer same
  curve from L1. Slot tables themselves verified against the PHB (full, half, artificer,
  warlock pact).
- **Arcane Recovery** (Wizard): once/day on a short rest, restore slots totaling ⌈level/2⌉,
  none 6th+. New card on the Spells tab; resets on long rest.
- **Pact Magic** (Warlock): short-rest slot recovery button added.
- **Font of Magic** (Sorcerer L2+): sorcery points = level; slot→points and points→slot
  conversion at PHB costs (2/3/5/6/7); refresh on long rest. (Created slots can only refill
  spent slots up to your table maximum — documented simplification.)
- **Sneak Attack** (Rogue): optional rider in the damage step — ⌈level/2⌉d6, once per turn,
  finesse/ranged weapons only, dice double on a crit. Resets every turn in all battle modes.
- **Divine Smite** (Paladin L2+): pick a slot in the damage step — 2d8 + 1d8/level above 1st,
  max 5d8, melee only, spends the slot, dice double on a crit.
- **Fighting Styles** now do things: Archery +2 ranged to-hit, Defense +1 AC in armor,
  Dueling +2 damage with a one-handed melee weapon, Two-Weapon Fighting (already handled).
  Great Weapon Fighting / Protection remain table-adjudicated (noted).
- **Jack of All Trades** (Bard 2+): half proficiency on non-proficient checks and initiative.
- Bardic Inspiration text shows the d6→d8→d10→d12 scaling; Wild Shape text carries the CR/no-fly
  progression (¼ @2, ½ @4, 1 @8, twice per short rest, revert at 0 HP with carry-over).
- Verified correct: hit dice per class, saving-throw proficiencies, Extra Attack (5/11/20
  Fighter; 5 for Barbarian/Paladin/Ranger/Monk, Attack action only), prepared-spell counts
  (mod+level full, mod+½level half), expertise counts (Rogue 1/6, Bard 3/10), ASI levels
  (Fighter 6/14, Rogue 10 extras), point-buy costs, proficiency bonus ⌈level/4⌉+1.

## 5. Abilities, AC, HP, death
- Armor table verified (all 13 entries match the PHB, DEX caps 99/2/0, shield +2).
- **Mage Armor** now actually sets base AC 13+DEX while unarmored; **Barkskin** floors AC at 16.
- Stacking: different named effects stack (Shield +5 with Shield of Faith +2 — legal, different
  spells); same-name effects don't (fixed above).
- Temp HP absorbs before real HP, doesn't stack (higher value wins), and now **ends on a long
  rest** (PHB).
- Death saves: nat 20 = up at 1 HP, nat 1 = 2 failures, damage at 0 HP = 1 failure — and the
  missing **massive-damage instant-death** rules added: leftover damage ≥ max HP when dropping
  to 0, or any damage ≥ max HP while at 0, kills outright.
- **Observant** feat: +5 passive Perception/Investigation now applied everywhere passives show.
- Long rest: full HP, all slots, half hit dice, −1 exhaustion, death saves cleared, Action
  Surge/Arcane Recovery/sorcery points reset, temp HP cleared.
- Fixed a crash: newly created characters had no `effects` array and would throw on their first
  spell cast.

## 6. Monsters & AI
- Stat-block corrections vs the MM: **Mage** spell DC 15→14 (and Fireball string now parses as
  a DC 14 Dex save instead of a +0 attack roll), **Ghoul** claws +2→+4 with the DC 10 Con
  paralysis rider, **Ghost** Withering Touch 4d6→4d6+3, **Brown Bear** +5→+6.
- **Initiative bonuses** (DEX mod) added to every bestiary entry — monsters previously all
  rolled flat d20.
- **Multiattack** added: Brown Bear 2, Troll 3, Hill Giant 2, Wyvern 2, Young Red Dragon 3,
  Dretch 2, Lizardfolk 2, Gazer 2, Beholder 3 (its Legendary Actions noted for the DM). Quick
  Battle and DM deploys both honor the count; monsters spend attacks/moves/reactions like PCs.
- **Monster saving throws**: in the AI arena, save-based spells now roll a CR-scaled save
  (≈ 1+⌊CR/2⌋, matching typical MM spreads) against your spell DC — success halves damage and
  blocks the condition. Previously monsters simply took full damage and conditions with no save.
- **Friendly fire**: AoE spells now hit the caster if they center the blast on themselves
  (auto-rolled save for half), and in multiplayer the DM is warned when allies stand in the
  area. AI can no longer nuke its own square for free.
- Opportunity attacks, cover (+2 creature / +5 terrain), Dijkstra pathing with no
  diagonal-corner cutting, difficult terrain ×2, and flying over hazards were verified correct.

## 7. Discretionary spell rulings (grid mechanics)
These are deliberately-specified rulings for spells the PHB leaves loose, so AI agents have
deterministic mechanics. Each is embedded in the in-app spell description.

- **Mage Hand** — range 30 ft (6 tiles), moves 30 ft/round, carries ≤10 lb, cannot attack or
  activate magic items. Using it stealthily: caster's Sleight of Hand vs observer's Perception.
- **Telekinesis** — range 60 ft (12 tiles). Creature: contested check, caster's spellcasting
  ability vs target's Strength; win = move it up to 30 ft any direction and it's restrained
  until your next turn (re-contest each round). Object ≤1000 lb: move 30 ft/round, no check if
  unattended.
- **Suggestion / Dominate X** — Wis save vs spell DC. Suggestion ends if the caster or allies
  damage the target or the suggestion is plainly self-destructive. Dominate targets repeat the
  save each time they take damage.
- **Polymorph / Wild Shape** — forms come from the beast stat-block list; Polymorph caps beast
  CR at the target's level/CR (Wis save if unwilling); Wild Shape caps CR ¼ (no fly/swim) at
  L2, ½ (no fly) at L4, 1 at L8. The form's HP is a buffer: at 0 the creature reverts and
  excess damage carries over.
- **Wish** — duplicating a spell of ≤8th level is always safe. Anything greater is DM-adjudicated,
  and carries the PHB 33% chance of never casting Wish again. No recursive/duplicating-Wish
  loops: a Wish cannot duplicate Wish.
- **Counterspell** — reaction, 60 ft; ≤3rd level auto-fails the enemy cast, higher needs a
  spellcasting-ability check DC 10 + spell level.
- **Sleep** — no save; affects lowest-current-HP creatures first until the rolled HP pool is
  spent; undead and elves immune.

## Known simplifications (documented, not bugs)
- Rage's resistance halves *all* incoming damage in the quick HP buttons (damage type isn't
  known at that entry point); the log labels it so the table can adjust for non-physical hits.
- Cones/lines are equal-area bursts (see §1) rather than true templates.
- Upcasting spends the higher slot but doesn't auto-scale damage dice (the DM/player adds the
  bonus dice per the description).
- Monster save bonus is CR-derived, not per-ability.
- Great Weapon Fighting rerolls and Protection-style reactions are table-adjudicated.
- **FIXED in v120.234 — three rules were missing from `playerNetAdapter`.** Found by the parity
  harness, then reproduced against the deployed v120.233 site in a real browser via Playwright
  (not inferred from reading code, and not a node stub). `Engine` treats every adapter method as
  optional, so their absence silently applied the neutral default instead of the rule:
  - `cover` → **the player's device and the DM's device disagreed about whether a shot hit.**
    Same session state, same map, same pre-rolled d20: with a wall between attacker and target,
    the DM resolved against AC 20 (base 15 + 5 three-quarters cover) and the player's device
    against AC 15. Sweeping all 20 faces, **5 of 20 rolls (25% of attacks into cover) flipped the
    result** — the player's screen read HIT while the DM's read miss, on d20 10–14.
  - `sanctuaryDC` → against a Sanctuary-warded target the DM **blocked the attack outright**,
    while the player's device never evaluated the ward and reported a clean hit.
  - `holyAuraDC` → the DM blinded the attacker per Holy Aura; the player's device never checked.

  The fix adds all three. One wrinkle worth knowing: `playerNetAdapter`'s own unit is
  `{me:true,c,id:'me'}` and carries **no x/y**, so `cover` resolves its position off the
  DM-broadcast mirror via the same `players.find(p=>p.id===net.peer.id)` lookup `ac` already
  used, and returns 0 if that mirror isn't there yet — it can never resolve *worse* than the old
  behaviour. Regression-tested as a full 20-face sweep rather than one roll, because the bug was
  invisible at 15 of 20 faces, which is precisely how it survived unnoticed.

  **Still open, related:** `Engine.hitResult` computes melee distance from `a.x`/`t.x` directly
  rather than through the adapter, so for the `'me'` unit that distance is `null` and melee-vs-
  ranged falls back to `atk.tiles`. Pre-existing, unchanged here, and not currently known to
  cause a wrong result — but it's the same class of blind spot.

  Three *other* absences on that adapter are deliberate and are recorded as such: `damageMult`
  (the DM is authoritative for resist/vuln/imm), `enemiesOf` and `findGrappler` (no local AI /
  DM-side bookkeeping). The suspected three are **documented, not fixed** — implementing them
  changes live combat resolution in a networked mode, which wants a deliberate decision and a
  round of real multi-device testing, not a speculative patch. The harness pins all six so the
  list can't rot: an undocumented gap fails the build, and so does an entry that gets fixed
  without being removed from the list.
- **The `iso3d/` 3D battle map is now precached (fixed v120.233).** It previously wasn't in
  `sw.js`'s `ASSETS` at all, so the WebGL map was only cached opportunistically and silently
  degraded to the 2D renderer offline until it had been loaded online once (`syncIso3DHost`
  returns false when `window.Iso3D` is missing — graceful, but invisible). The entries carry the
  **exact `?v=` query strings** the browser requests, because the fetch handler's
  `caches.match(req)` is query-sensitive and bare paths would precache URLs nothing asks for.
  Only the **12 modules reachable from `boot.js`** are cached; `src/{combat,game,main,movement,
  turn,units}.js` are the standalone demo and are deliberately excluded. `rules-test.js` walks
  the real import graph and fails if the list drifts, if a demo module leaks in, or if any listed
  file doesn't exist (which would make `cache.addAll` reject and kill offline caching entirely).
- **Multiplayer still is not offline-capable, and that's inherent.** PeerJS is fetched from
  `https://unpkg.com/peerjs@1.5.4/...` when hosting or joining, so DM-hosted and player-net can't
  start without a connection. P2P needs a signalling server regardless; the app just shouldn't
  imply otherwise.
- **`iso3d/src/{map,math,renderer,version}.js` are imported both with and without `?v=`.** ES
  module identity is by resolved URL, so those are two separate instances of each module. It is
  harmless *today* — every bare import comes from the demo-only subgraph, which Grimoire never
  loads, and the one module-level value involved (`renderer.js`'s `WALL_SIDE_TEX_KEYS`) is an
  immutable Set. Worth fixing if that subgraph is ever wired in.

---

## Cover was broken in every mode (fixed v120.235)

`coverBetween`'s Bresenham line walk added **`dy` instead of `dx`** in its y-step. That is not a
subtle off-by-one: with `dx === 0` the error term never settles, so the walk drifts diagonally off
the grid. Walking (0,7)→(0,4) sampled `0,6`, then `-1,6`, `-2,5`, `-3,4` … down to `-10,-3` before
the 999-iteration guard stopped it.

Consequences, which had been live for a long time and in **all three modes** (Engine reads cover
through every adapter):
- Only the first step or two of any line were real cells, so **cover was found only when an
  obstruction sat essentially next to the attacker** — a wall halfway down a corridor did nothing.
- The **same wall gave +5 one way and 0 the other**, because whether the drift started before or
  after the obstruction depended on direction.
- 45° diagonals were unaffected (`dx === dy`), which is part of why it went unnoticed.

Found by driving a real two-tab DM + player session over live PeerJS and comparing the two
devices' answers for the same shot — not by reading the line. `losClear` does **not** share the
bug: it samples a continuous ray through cell centres, a different and symmetric approach.

**The residual asymmetry is also fixed (v120.236), and it was not as small as first assumed.**
Bresenham breaks ties to one side on any non-45° line, so A→B and B→A could sample different
cells (`2,0` one way, `2,1` the other) and disagree whenever exactly one was an obstruction. I
originally documented this as accepted; measuring it showed **128 of 2,288 ordered square pairs
(5.6%) disagreeing** on a wall-scattered map. Cover is a property of the line between two squares
and must not depend on which end you start from, so `coverBetween` now canonicalises its
endpoints (always walks from the lexicographically smaller one). That makes the result provably
identical in both directions without changing which cells a given line samples. The test sweeps
all 2,288 pairs and includes a guard against passing vacuously (i.e. because nothing found cover
at all).

## Stress test: 100 monsters, 600 tiles (v120.249)

First real performance measurement of the app. Driven in a live browser: a DM session with **100
monsters + 6 players** on a **30×20 (600-tile)** map with scattered terrain.

**The rules engine is not the problem.** Everything gameplay-related is sub-3ms at that size:

| | 100 units, 600 tiles |
|---|---|
| `Engine.hitResult` ×100 | 1.4 ms |
| `visibleCells` (whole 600-tile map) | 0.8 ms |
| `coverBetween` ×100 | 0.7 ms |
| `parseMonsterAttacks` ×100 | ~0 ms |
| `mapGridHTML` with fog | 2.7 ms |
| **`render()` (full screen)** | **50 ms** |

**The bottleneck is the full-screen `innerHTML` re-render**, which MASTER_PLAN had already flagged
as debt before it was retired. Breakdown: `innerHTML` *parsing* is ~18 ms, while layout adds only
~1.6 ms — so it's HTML construction, not CSS. `app.className='fade'; void app.offsetWidth` looks
like a forced synchronous reflow but measures 0 ms; it is not the problem.

Scaling (desktop; ×4 is a fair mid-range-phone multiplier):

| Map | 5 mon | 20 mon | 50 mon | 100 mon |
|---|---|---|---|---|
| 12×10 | 12.5 ms | 16 ms | 27 ms | 46 ms |
| 20×15 | 19.5 ms | 18 ms | 26 ms | 43 ms |
| 30×20 | 25 ms | 22 ms | 34 ms | **50 ms (~200 ms on a phone)** |

**Read:** a normal encounter (≤20 monsters, ≤300 tiles) re-renders in under 20 ms — fine, and fine
on a phone. Cost climbs with monster count more than map size. 100 monsters is where a phone would
feel it, at roughly 200 ms per action. Since `render()` runs on *every* action, that is the wall to
watch; the fix, if it's ever needed, is targeted re-render rather than an `innerHTML` wipe.

Also fixed here: the initiative editor emitted `value="${o.roll}"` with `o.roll` undefined whenever
turn order existed without rolled initiative — ~100 console warnings *per render* at this size.
Cosmetic on its own, but `tools/smoke.js` treats console cleanliness as its pass signal, so noise
that dense actively degrades the test that catches UI bugs.

## Legendary & lair actions (v120.248) — the last real combat gap

Boss monsters had **no mechanical support at all**; the only trace in the entire app was a prose
note on the Beholder telling the DM to adjudicate by hand.

Two RAW rules are the ones tables usually get wrong, so both are enforced rather than trusted:
- **A legendary creature may not use legendary actions on its own turn.** The DM panel hides the
  buttons and says why; `canSpendLegendary` refuses regardless of the UI. The pool refreshes at the
  **start** of its turn (hooked into `dmRefreshActor`), not at the end of the round.
- **Lair actions fire on initiative count 20, once per round** — a round-level event, not attached
  to anyone's turn. `s.lairDoneRound` records the round already resolved, so a re-render or a
  combat undo can't fire it twice, which is the obvious bug in any "once per round" mechanic.

Also refused: spending while dead or incapacitated, spending more than the pool holds, and an
unknown action name (which must not be silently free). 17 tests.

Attack-shaped legendary actions resolve through `Engine.applyAction` on the same path
`dmOpportunityAttack` uses, so cover, conditions, resistances and the event stream all apply
normally — no second combat path. Save- and narrative-shaped ones log for the DM to adjudicate.

`LEGENDARY` / `LAIR` are keyed by monster name and cover Young Red Dragon, Beholder and Wraith; a
test asserts every key names a real bestiary monster.

*Process note:* the first draft of the UI handler called a `dmMonsterAttackWith()` that does not
exist — the identical shape to the `dmLog` bug from v120.237. Caught before shipping by checking
every referenced function with `tools/whereis.js`, which is now the cheap habit that replaces
finding out when a user presses the button.

## Mode-parity scenario matrix (v120.245 — strategy Pillar 2)

The parity harness compared adapter **interfaces**, which catches a *missing* method. It could not
catch two modes computing the same rule **differently** — and that is the failure that actually
reached production: cover applied on the DM's device and not the player's, disagreeing on 25% of
shots.

The matrix builds equivalent state in Quick Battle and DM-hosted, runs the same shot through both
with a fixed d20, and requires identical `ac` / `cover` / `hit` / `adv` across 9 scenarios: open
ground, a wall (three-quarters cover), prone target in melee *and* at range (the two directions
resolve oppositely, which is what caught the `'me'` position bug), restrained target, poisoned
attacker, invisible target, darkness, and a paralyzed target (the auto-crit path).

Mutation-tested: forcing `qbAdapter.cover` to return 0 fails the matrix with
`wall between (3/4 cover): QB{ac:12,cov:0,hit:true} vs DM{ac:17,cov:5,hit:false}` — note the two
modes disagreeing on **hit**, exactly the production bug's shape.

Adding a scenario is one line in the `SCENARIOS` array. New shared rules should get a row.

## DM "view as player" — per-player vision (v120.244)

The DM map can now be rendered through one player's eyes (👁 View as), so the DM can check what a
character can actually see before describing a room. Completes the per-player-vision half of
roadmap item 7 alongside fog of war.

Two details that made this less trivial than it looks:

- **The DM never holds a connected player's sheet**, so `hasDarkvision()` is not computable DM-side.
  The flag is synced in the `hello` payload instead — the same reason `sanctuaryDC` / `holyAuraDC`
  are synced rather than derived. `canSeeCell` accepts `viewer.darkvision` in place of a character.
  It only affects light level: a test asserts darkvision still does not see through a wall.
- **The preview keeps its own fog memory**, namespaced `dmview:<id>`, so previewing a player's view
  never pollutes that player's own explored-squares set (which lives on their device anyway).

`mapGridHTML` only applies fog when `isDM` is false, so the preview deliberately renders as a
player view; the DM's normal map is untouched.

## Monster attacks are structured data too — and the Wyvern could sting you from 120 ft (v120.243)

The bestiary's `atk` strings were the other load-bearing prose. `MONSTER_MECH` is now authoritative
for built-in monsters, completing Pillar 1 alongside `SPELL_MECH`.

**One deliberate difference from the spell migration: the prose parser is NOT retired.** Homebrew
monsters and NPCs let the user type an `atk` string by hand (`#hbAtk` / `#npcAtk`), and parsing
English is the intended feature there. So the table is keyed by the **exact `atk` string**: a
built-in entry matches and uses structured data, while any user-typed string simply doesn't match
and falls through to the parser. No signature change, no call-site churn, homebrew safe by
construction. If a bestiary string is ever edited its key stops matching and that monster reverts
to prose parsing — the same behaviour as before the table existed, so the failure mode is safe, and
a ratchet test asserts every entry is still covered.

**The bug it exposed:** the range heuristic marked an attack ranged (24 tiles / 120 ft) if its text
contained `bow|crossbow|sling|javelin|dart|spit|ray|bolt|hurl|thrown|web|net|stinger|spike`. Two of
those are melee terms, so the **Wyvern's Stinger was a 120 ft ranged attack**. Nothing in the
bestiary uses "spike" and the Wyvern is the only "stinger", so both words were removed from the
heuristic — which fixes homebrew as well — and the table states the RAW value (10 ft reach,
`tiles:2`).

`parseMonsterAttacks` returns **copies** of table rows, so a caller stamping a rolled value onto an
attack can't corrupt the shared data. There's a test for that specifically.

## Spell mechanics are structured data now, not prose (v120.242 — strategy Pillar 1)

`SPELL_DESC` was **load-bearing English**: `parseSpellMechanics` regex-mined player-facing
descriptions for save ability, damage dice, damage type, heal dice and whether an attack roll was
involved. Rewording a description silently changed the game, and it misfired repeatedly — 87 spells
(Fireball among them) sharing one wrong range, three dealing untyped damage so resistance never
applied, and Guidance / Resistance / Shillelagh having a bonus die or a weapon die counted as
damage the spell deals.

**`SPELL_MECH` is now authoritative.** For a listed spell the parser returns the table's values and
the regexes never run. Only **89 of 257** spells need an entry; the rest are narrative. The table
was *generated from the parser's own output*, so behaviour was byte-identical on introduction —
then corrected for the three known-bad entries. Range, concentration and duration are deliberately
NOT here: `SPELL_RANGE`, `CONC_SPELLS` and `SPELL_EFFECTS` already own those.

The prose parser survives as the fallback for unlisted spells, so the migration is incremental
rather than a flag day. A **ratchet test** counts spells still deriving mechanics from prose and
fails if it ever rises; it currently reads **0**.

**A trap found during the migration, worth remembering:** deleting a wrong spell from the table
does not fix it — *absent* means "ask the prose", and the prose is what was wrong. Guidance,
Resistance and Shillelagh needed explicit **empty** entries to suppress their phantom damage. The
ratchet test caught this immediately, which is the entire argument for writing the guard before
trusting the change.

The load-bearing test is the one that reproduces the original bug class directly: it rewrites
Fire Bolt's description to nonsense ("99d99 cold and a Wis save") and asserts the mechanics do not
move.

## Fog of war (v120.241)

The player's own battle map now shows only what their character can see. Three states:
**visible** (in sight now), **remembered** (explored earlier — terrain is drawn dim, creatures are
NOT, since they may have moved) and **unseen** (blacked out).

Built on the primitives that already existed rather than a second visibility model:
- `losClear` for line of sight — note it samples a continuous ray through cell centres, so it is
  symmetric and never had the Bresenham drift bug fixed in v120.235;
- `visionLevel` for the light level at the target square *as seen from the viewer*, which already
  folds in darkvision (12 tiles / 60 ft) and magical darkness. **Darkness is the hard cut**: level
  0 means not visible. Dim counts as seen, because 5e treats dim as lightly obscured
  (disadvantage on Perception), not blind — `lightSkillMode` already models that.

`canSeeCell` / `visibleCells` are the shared predicates. Fog *memory* (`rememberSeen`,
`exploredCells`, `fogStateAt`) is deliberately **client-side**: it's a presentation concern, so
computing it locally means no protocol change, no extra broadcast payload, and no way for a player
device to learn about squares it shouldn't. Keyed by viewer id + map size, so a new map starts
unexplored.

**Fog does not remove anything from target lists, by design.** 5e lets you attack a square you
can't see — at disadvantage, which `hitResult` already applies via `seeTarget`. Gating target
menus would be both wrong RAW and a repeat of the "targets silently vanish" hazard. Fog is
strictly what you *see*, never what you may *do*.

Opt-in per call site (`opts.fog`), so the DM map and every other caller are untouched, plus a
🌫 toggle on the player's Battlefield card, persisted in `localStorage` so it survives the `net`
object being rebuilt on rejoin.

## The 'me' unit had no position, and Engine crashed on unresolvable ids (v120.240)

Two fixes to the shared resolver, both found while probing the blind spot recorded in v120.234.

**1. `playerNetAdapter.unit('me')` carried no x/y.** Every distance check involving the local
player therefore saw `null` and fell back to the weapon's range (`!(atk.tiles>1)`). Measured live:
firing a **bow at an ADJACENT PRONE target**, the DM's screen showed **advantage (+1)** — correct
RAW, since prone grants advantage within 5 ft — while the player's showed **disadvantage (−1)**,
because a 24-tile weapon was assumed to be a ranged attack. A two-step swing on the same shot,
with the player's screen wrong. `unit('me')` now reads x/y off this device's own mirror in the DM
broadcast, the same `players.find(p => p.id === net.peer.id)` lookup `ac` and `cover` already use.

**2. `Engine.hitResult` threw a `TypeError` on any unresolvable unit id.** `ad.unit(id)` returns
null for an id it can't resolve — a monster deleted mid-turn, a player who dropped, a stale id in
a queued action, or `'me'` before a character is bound — and all three `ad.checkSubject(...)` call
sites dereferenced it. That took the whole attack down rather than degrading. Guarded; everything
downstream already tolerated a null subject.

*Method note:* three successive attempts to measure #1 were wrecked by my own scenario errors —
a hand-built player mirror with `conds:[]` while the real sheet carried `Prone`, and a Level 20
Wizard whose armor non-proficiency added a disadvantage the DM side can't compute. The bug only
became visible after controlling for both. A disagreement between two modes is not automatically
the bug you're hunting.

## Monster attacks were 80% untyped (fixed v120.239)

The bestiary writes `"Scimitar +4 (1d6+2)"` and never says "slashing", and `parseMonsterAttacks`
only picked up a damage type when the prose spelled one out. Measured: **only 11 of 56 parsed
attacks (20%) carried a type.** An untyped hit can't match any resistance, vulnerability or
immunity, so in practice:
- a Goblin's scimitar wasn't slashing, an Orc's greataxe wasn't slashing, a Kobold's dagger
  wasn't piercing;
- **a Mage's Fireball wasn't fire** — a fire-resistant target took full damage;
- a Skeleton's bludgeoning vulnerability never triggered off a monster's club;
- Absorb Elements couldn't tell an incoming hit was elemental.

Fix: when the prose states no type, fall back to the attack **name** — the `WEAPONS` catalog
first, so manufactured weapons stay single-sourced there rather than duplicated, then
`MONSTER_ATK_DTYPE` for natural weapons (Bite/Claw/Slam/Life Drain/…) and the few spell-shaped
attacks. Explicit prose still wins over both. Coverage went **20% → 96% (50/52 damaging attacks)**.

Deliberately still untyped: **Eye Rays** (Beholder, Gazer). A beholder's rays are each a different
type, so any single answer would be wrong more often than the empty string is; it stays untyped
until the bestiary can express per-ray data. A test asserts that Eye Rays is the *only* permitted
exception, so a newly added monster with an untyped attack fails the build.

Also noted: `Morningstar` is absent from the `WEAPONS` catalog entirely, so it needed a table
entry despite being a manufactured weapon. Worth adding to `WEAPONS` properly at some point.

## Spell damage types the prose never stated + targeting actually wired (v120.238)

**`SPELL_DTYPE`.** `parseSpellMechanics` reads a damage type from a `"<dice> <type>"` phrase, so a
spell that names its type anywhere else — or never — silently ended up with `dtype:''`, and an
empty type means `monsterDmgMult()` can never apply resistance/vulnerability/immunity to it. Found
by parsing all **257** spells and flagging any with damage but no type. Three were real:
`Sacred Flame` → radiant (its prose opens "Radiant flame", never "1d8 radiant"), `Spike Growth` →
piercing, `Spiritual Weapon` → force (notable: force bypasses incorporeal physical resistance).
Same override-table escape hatch as `SPELL_RANGE`. `Absorb Elements` is deliberately excluded —
its rider type mirrors whatever triggered it. The other flagged spells (Guidance, Resistance,
Shillelagh) are false positives: their d4/d8 is a bonus die or a weapon die, not spell damage.

**Hidden-monster targeting is now actually wired.** v120.237 added the filter to
`buildTargetingOpts`, but no caller passed an `observer`, so it never ran and hidden monsters
stayed targetable. `openSpellTarget`, `qbOpenAttack` and `qbSpellTarget` now pass the acting
character, and `monstersInRange` defaults to this device's own character. The `Infinity` default
for an unknown observer is retained, so anything not yet wired still filters nothing.

**A self-inflicted bug worth recording**, because it's the failure mode the modularization note
warns about. The `SPELL_DTYPE` override was first inserted between `if(groups.length){…}` and the
`else if` flat-heal branch below it — which re-parented that `else` onto the new statement. Effect:
`Regenerate` ("Restore 4d8+15 HP") had its correct `4d8+15` heal overwritten by the flat `15`.
Caught by the *existing* Regenerate test. When adding a statement in `parseSpellMechanics`, check
whether the next block starts with `else`.

## Monster hiding — stealth becomes two-way (v120.237)

Stealth ran in one direction only: a PC could Hide (`maneuverHide`) and a monster could Search for
them, but **nothing in the app could ever set a monster's `hiddenDC`**. That's why the Search
action added in v120.232 usually found nothing — there was never anything to find.

Closed with one shared rule per behaviour, not a parallel monster copy:
- `hideEligibility(ad, unit, watchers, skulker)` — extracted from `maneuverHide`, now used by both
  sides: darkness, full cover from the nearest watcher, or dim light with Skulker.
- `hideMonster(ad, mo, watchers, log)` — the monster's Hide action. Its Stealth is the CR-derived
  DEX check (`monsterHideRoll`), same shape as `monsterSearchRoll`, because the bestiary carries no
  per-skill data. Sets `hiddenDC` + the Hidden condition. DM triggers it with 🫥 on the roster.
- `revealUnit(u)` — attacking ends hiding, for **either** unit shape (a PC's `c.conditions` or a
  monster's own `conds[]`). The reveal site in `attackFlow` was `isPc &&`-gated; a hidden monster
  would otherwise have kept advantage forever.
- `unitHiddenFrom(observerPassive, target)` — 5e's "passive Perception meets or beats the Stealth
  total and you notice it automatically", mirroring the monster-AI filter that already existed for
  hidden PCs. Ties go to the observer.
- `buildTargetingOpts` filters out monsters the looker hasn't noticed. **`observerPassivePerception`
  returns `Infinity` for an unknown observer, so any caller that doesn't supply one filters nothing**
  — "can't see it" must never be the accidental default, or targets would silently vanish.

Known scope limits: monster hiding is DM-triggered, not something the tactical AI decides to do on
its own; and monsters get no Skulker equivalent.

## Search (v120.232)

The Search action was **half-built, not missing**: `monsterSearchRoll` let a DM's monster hunt
for a hidden player (the DM attack modal's `#maSearch`), but a PC had no way to take the action
at all — an asymmetry of exactly the kind the parity harness now guards. `maneuverSearch(ad,
pcUnit, skillKey, log)` is the shared PC-side half, adapter-driven so it behaves identically in
Quick Battle, DM-hosted and player-net.

- Costs the action. Rolls **Wis (Perception)** or, at the DM's discretion per the PHB,
  **Int (Investigation)** — both are offered as separate buttons in the Use menu.
- Any hostile whose `hiddenDC` the check meets or beats is revealed (its `hiddenDC` is cleared
  and the Hidden condition stripped).
- **Nothing in the app currently gives a monster a `hiddenDC`** — only characters get one, via
  `maneuverHide`. So today Search usually finds nothing and resolves as a logged Perception
  check for the DM to adjudicate, which is what the PHB action actually is. It is written
  against `hiddenDC` generally, so it starts working the moment monsters can hide, with no
  rewrite. *Monster-side hiding is the natural follow-up that would make this fully live.*

## Systems built after the original audit (v95–v120.232) — where to look

The topical sections above were written around v83–v94 and do **not** cover anything built
since. Those systems were only ever documented as per-version changelog entries, which is why
finding them used to mean grepping 260 KB. This table is the index: **grep the anchor to reach
the code, and read the history section only if you need the reasoning.** Anchors below were
verified against the source, not recalled.

| System | Grep anchor(s) | History section |
|---|---|---|
| Combat maneuvers (Shove/Grapple/Escape/Hide/Recall/Stabilize) | `maneuverShove`, `maneuverGrapple`, `maneuverHide` | Combat maneuvers … (v120.180–181) |
| Reactions (Shield, Hellish Rebuke, Absorb Elements) | `openReactionMenu`, `castPcReaction`, `REACTION_SPELLS` | Reaction system generalized (v120.228) |
| Dodge / Disengage / Help / Ready | `freshTurnState`, `resetTurnState` | v120.229 and v120.230–231 |
| Traps (DM-placed) | `trapAt`, `checkTrapTrigger`, `sendTrapTriggerCheck` | DM-placed traps (v120.213) |
| Hazards (gas etc., all modes) | `hazards` on the session | Gas hazards + hazard system … |
| Flying / altitude / falling | `isFlying`, `checkFallDamage`, `altitudeBlocked` | v120.221, v120.222, v120.225 |
| Mounts | `checkMountDeaths`, `dismountRider`, `mountedOn` | Mount system (v120.210) |
| Light / vision parity | `visionLevel`, `tileLightLevel` | Dungeon Delver, light/vision … (v120.226) |
| Multiclassing | `meetsMulticlassPrereq` | Multiclassing v1 (v120.211) |
| Magic items + attunement | `toggleAttune`, `attunedCount` | Magic items + attunement (v120.212) |
| Rituals | `canRitualCast` | "Make the systems" (4) (v120.203) |
| Healer's Kit | `hasHealersKit`, `healerHealTargets` | "Make the systems" (5) (v120.204) |
| Battle Master maneuvers | `superiorityDiceMax`, `superiorityDieSize` | "Make the systems" (7) (v120.206) |
| Wild Shape | `openWildShapeUI`, `wildShapeAttacks`, `wildShapeMax` | Circle of the Moon (v120.191) |
| Ki / Martial Arts | `kiMax`, `kiDC` | Way of the Open Hand (v120.192) |
| Bardic Inspiration | `bardicInspDie`, `bardicInspMax` | College of Lore (v120.189) |
| Channel Divinity | `channelDivinityMax` | Life Domain (v120.190), Oath of Devotion (v120.193) |
| Metamagic | `METAMAGIC_OPTIONS` | Draconic Bloodline (v120.196) |
| NPCs | `openNpcBuilder`, `deployNpc` | NPCs, monster/NPC inventory … (v120.184) |
| Homebrew monsters | `openHomebrewMonsterEditor`, `saveHomebrewMonster` | Homebrew monster editor (v120.214) |
| Encounter Builder | `openEncounterBuilder`, `encounterDifficulty` | Encounter Builder (v120.215) |
| Combat undo | `dmSnapshotForUndo`, `dmUndoTurn`, `dmUndoAvailable` | v120.216 (QB), v120.224 (DM) |
| Summons | Conjure Animals / Animate Dead entries | Wave 2 summons (v120.66) |
| The 12 subclasses with real mechanics | per-subclass anchors above | v120.186–198 + session summary |

## Change history / "why is it built this way?"

Everything above is **current behaviour** — the answer to *"what does this app do today?"*.

The per-version narrative of how each system was built (and, in several cases, reverted and
rebuilt) now lives in **`AUDIT_HISTORY.md`**, which has an index of all 74 section headings at
the top. Go there only for intent and archaeology; **do not quote it as current behaviour** —
it deliberately preserves superseded approaches.

**Maintaining this file:** when a session changes a ruling, *edit the relevant section above in
place* so this file keeps answering "what is true now", and append the narrative entry to
`AUDIT_HISTORY.md`. Appending only to the history is what grew the old combined file to 260 KB
of changelog wrapped around 20 KB of actual rules.
