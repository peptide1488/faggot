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

## v84 — unified spell resolution (all modes)
- Player spells now resolve through one path in every mode (`Engine.castApply`): target
  rolls its save vs the caster's DC (monsters use the CR-derived bonus), success halves
  damage and blocks the spell's condition, then resist/vuln/immunity applies.
- Net play previously rolled **no** monster saves ("saves halve — DM adjusts") and applied
  conditions even on a success — both fixed by the shared path. Damage is still sent raw
  with its type and the DM host applies resist/vuln/imm on receipt (protocol unchanged).
- AoE friendly fire in net play: the caster now takes real damage (own save, half on
  success) like in Quick Battle. Other players in the blast are flagged for the DM — one
  player's device can't mutate another player's sheet.
- Deliberately adding a spell (Spells tab, level-up learn) auto-prepares it for prep
  casters while under the daily cap; at the cap it stays unprepared and says so. The
  Quick Battle spell picker now reports how many known spells are hidden as unprepared.

## v87 — teleportation spells are mechanical
- Misty Step / Dimension Door / Teleport / Teleportation Circle open a destination picker
  in battle (net play + Quick Battle) and actually move your token. Rulings: destination
  must be an open tile (not solid/deadly terrain, unoccupied); Misty Step requires line of
  sight ("a spot you can see"); Dimension Door and up work sight-unseen; teleporting never
  provokes opportunity attacks and spends no movement (PHB); hazardous terrain (lava)
  damages on arrival. Slot + action/bonus action spend via the normal castSpell path
  (Misty Step is a bonus action). Table: `SPELL_TELEPORT`; validity: `teleportOk`.
- Spells with no rolls/effect template (Wish, Fog Cloud…) now show a "📜 Narrative spell"
  card in the cast modal so casting them visibly does what it can: spend + log + narrate.

## v89 — domination switches sides
- Dominate Person / Beast / Monster (Wis save) impose **Dominated**: in Quick Battle the
  monster's AI retargets its former allies (and enemies fight back against it); in DM mode
  the attack modal offers fellow monsters as targets with a 🌀 Dominated note. A lone
  dominated survivor ends the battle as a win. Simplifications: no repeat save on damage;
  control lasts the tracked rounds (10) rather than scaling by spell level.

## v90 — conditions have mechanical teeth (attack rolls)
- `attackAdvantage` (applied inside `Engine.hitResult`, so every mode gets it): attacker
  Poisoned/Prone/Restrained/Blinded/Frightened → disadvantage; attacker Invisible →
  advantage; target Restrained/Blinded/Paralyzed/Stunned/Unconscious/Petrified → advantage;
  target Prone → advantage in melee (within 5 ft), disadvantage at range. Net result is
  sign()-ed (multiple sources don't stack, PHB). Melee hits vs Paralyzed/Unconscious
  auto-crit. Advantage rolls 2d20 keep high/low; a manually entered die overrides it.
- Players' conditions ride along in the hello message so the DM side sees them; condition
  changes re-hello.
- Simplifications: Frightened ignores source visibility; Incapacitated doesn't yet block
  the action economy; saves are unaffected by conditions (attack rolls only).

## v91 — oddball spells become playable
- **Wish**: post-cast choice menu — duplicate any spell ≤8th (cast free via `wishGrantFree`,
  no slot/prep/action, one use), full self-restore, +25,000 gp, or narrate. **Time Stop**:
  1d4+1 turns in a row (`timeStopTurns` banked on `c.battle`; End Turn resets resources
  instead of passing — all three battle modes). Augury/Commune/Divination roll real omens.
- **Incapacitation has teeth**: Asleep/Paralyzed/Stunned/Petrified/Unconscious/Banished
  (and Tasha's laughter) monsters lose their turns (QB brain skips, DM attack refuses);
  damage wakes Asleep (players and monsters). Invisibility/Greater Invisibility apply the
  Invisible condition (v90 advantage) and clear it when the effect ends.
- **AI Narrator (premium)**: user-supplied Anthropic API key (localStorage, this device
  only, ⚙ App & Data); narrative spells offer a plain-language attempt box; claude-opus-4-8
  adjudicates DM-style within 5e limits. Simplifications: Time Stop doesn't end early on
  affecting others; invisibility doesn't break on attacking; Wish carries no stress cost.

## v114 — battle map: real CSS 3D isometric (not rules, but load-bearing rendering notes)
The isometric battle grid (`mapGridHTML`) used to fake the diamond-tile look with a 2D
`rotate(45deg) scaleY(.5)` trick, and elevated tiles (walls, hills) with `clip-path`-cut flat
textures pretending to be 3D side faces. Both were replaced with a real CSS 3D scene
(`transform-style:preserve-3d`, no `perspective` — orthographic/parallel projection so tile
size stays constant with depth, matching classic dimetric game projection, not a camera with
a vanishing point). Gameplay logic (pathing, LoS, targeting) is untouched; this is a
render-layer rewrite only.
- **Axes**: world X = column, world Z = row/depth, world Y = height (CSS convention: +Y is
  down, so a tile's own `translate3d` Y-component is its elevation level directly — no sign
  flip needed against the existing `heightAt()` convention).
- **Floor tile**: a flat div folded into the ground plane via `rotateX(90deg)` with
  `transform-origin:top`. Tiles tile edge-to-edge with zero gaps — a bug worked around for a
  full session under the 2D approach — because folding is exact, not an approximation.
- **Elevated tile (wall or raised terrain)**: the tile's own `translate3d` Y is the elevation
  in pixels (positive = raised); the top face is just the plain floor fold at that height, and
  two more faces (south, east — the only two that can ever face this fixed camera) hang down
  from it to ground level. **Two non-obvious fixes were required** to get here, both confirmed
  empirically against real screenshots rather than derived analytically up front:
  1. A raised tile initially rendered *behind* its flat neighbors (only a sliver peeking through
     gaps) even though the geometry looked right in isolation. Root cause: the sign of "up" was
     backwards for depth-sorting purposes — CSS's true 3D depth sort (not z-index, which is
     ignored for elements sharing a `preserve-3d` ancestor) needs positive local Y to also mean
     "closer to this specific camera," not just "visually higher." Flipping the sign fixed both
     the depth order and the screen position simultaneously.
  2. The east face (using `rotateY(90deg)`) needed an extra `translateZ(T/2)` that the south
     face (no rotation) didn't. Cause: `transform-origin:top` only pins the Y-origin to the
     tile's edge; the X-origin defaults to 50% (center), which is irrelevant for a pure
     `rotateX` fold but becomes the rotation pivot for `rotateY` — so the east face was
     rotating around its own horizontal center, not its edge, landing half a tile short.
  3. Pits (negative elevation) don't get interior wall faces yet — a recessed hole's visible
     interior faces are on the *far* side from the camera, which is different geometry from a
     raised block's near faces, not just a sign flip. Deferred; pits currently just sink and
     darken (`brightness` filter) with no true depth.
- **Walls render flat by default** (visHgt=hgt, no forced minimum). They stood 2 levels tall by
  default for part of this session once the real 3D cuboid replaced the broken clip-path fake —
  see v115.3 below for why that got reverted again.

### v115.2 — the yaw belongs in JS trig, not a scene-level rotateZ
The first cut of this (v115/v115.1) put the 45°+90°*rot "diamond" yaw into the scene's own
CSS transform: `rotateX(60deg) rotateZ(camR deg)`, with tokens counter-rotating
`rotateZ(-camR) rotateX(-60deg)` to stay upright. This shipped, then broke visibly on any
real (non-square, non-tiny) map: a 15-wide × 11-tall dungeon room rendered **taller than it
is wide** on screen, and long wall runs showed V-shaped gaps between segments instead of a
solid perimeter. Both symptoms — reported by the user as "the entire map is rotated 90
degrees" — turned out to be the same root cause, not two bugs.

**Why `rotateX(60) rotateZ(45)` doesn't give a symmetric diamond:** work through the matrix
composition for a flat ground point (X, Y=0, Z). `rotateZ(45)` first maps it to
(0.707X, 0.707X, Z) — note Y is no longer 0, it's now proportional to X. `rotateX(60)` then
mixes THIS already-X-contaminated Y with Z: the final screen coordinates come out to
`screenX = 0.707X` (depends only on X, not Z at all) and
`screenY = 0.3535X - 0.866Z` (X and Z contribute with *different* magnitudes: 0.3535 vs 0.866).
A true isometric diamond needs `screenX ∝ (X − Z)` and `screenY ∝ (X + Z)` — equal-magnitude,
mirrored-sign contributions from both axes. Composing rotateZ then rotateX structurally can't
produce that; the intermediate rotateZ step contaminates one axis into the other unevenly
before rotateX ever runs.

**Fix:** bake the 45°+90°*rot yaw into each tile's world position via real trigonometry in JS
(`wx = (gx·cos − gy·sin)·T`, `wz = −(gx·sin + gy·cos)·T` for grid-centered `gx,gy`), and apply
*only* `rotateX(60deg)` as the scene's CSS transform — no rotateZ at all. The camera is now a
fixed tilt with no yaw of its own; the yaw lives entirely in where tiles are placed. This
also simplifies the billboard counter-rotation to plain `rotateX(-60deg)` (there's no camR
term left to undo), and it doesn't touch the wall-cuboid face logic (south3d/east3d) at all —
those are local to each tile's own origin and stay correct regardless of how that origin is
positioned in the wider grid.

Caught by re-deriving the projection matrix by hand after the user's report, then confirming
against the live app: measured a wall tile's rendered bounding box before/after (a 15×11 room
went from 452×573 screen px — narrower than tall, i.e. rotated — to 719×608, correctly wider
than tall). Regression test added: a one-column step and a one-row step must move the same
horizontal distance in mirrored directions.

### v115.3 — CSS 3D depth-sorting doesn't scale past a few adjacent raised tiles; walls revert to flat
Once v115.2 fixed the projection, the dungeon room's wall PERIMETER (a long contiguous run of
raised tiles, not a short corner) still looked wrong — reported as "not isometric at all." A
12-tile straight test row reproduced it cleanly: visible gaps between every adjacent wall
block's top face, reading as a jagged staircase instead of a solid parapet.

This was **not** a position bug — `getBoundingClientRect()` on each `.tile3d` wrapper showed
a perfectly smooth, linear progression (25px/24px alternating steps, no discontinuity), and
even the `.top3d` faces' bounding rects legitimately overlapped their neighbors'. The gap is a
rendering/occlusion artifact: CSS's `preserve-3d` depth sort is an approximation, not a real
per-pixel z-buffer, and it visibly breaks down once there are more than a couple of
coplanar-ish raised quads near each other — even though isolated tiles and short corners (the
3-tile L-shape validated in the original v115 prototype) composite perfectly. This is the same
underlying limitation that killed the pre-v115 clip-path approach, wearing a different
disguise — CSS 3D genuinely has no z-buffer, full stop, and a wall *perimeter* is exactly the
shape that stresses it hardest.

Given walls are almost always long runs in real maps (dungeon borders, corridors) and rarely
short isolated pillars, the practical fix is reverting "wall defaults to standing 2 levels" —
flat tiles never had this problem (validated extensively: grass/water/sand all tile perfectly
edge-to-edge, elevated or not, in every test this session). An explicitly-DM-elevated tile
(e.g. a deliberately raised short section) still gets the real standing cuboid — only the
automatic "every wall stands" default was reverted. If a future session wants standing walls
back, the real fix is either a from-scratch WebGL renderer (real z-buffer, ruled out earlier
for the dependency cost) or manually chunking long wall runs into merged multi-tile faces
instead of one cuboid per tile (untested, likely real but nontrivial work).

### v116 — the whole CSS 3D map rewrite (v115–v115.3) was reverted, in full
After the v115.3 fix, the user tested it live and it still looked wrong — this time not a bug
that showed up in a specific test scenario, but a general "doesn't read as isometric, looks
worse than before the 3D work started" verdict on the actual rendering quality. Every fix in
this arc (v115, v115.1, v115.2, v115.3) genuinely fixed the specific bug it targeted — gaps
closed, projection became symmetric, elevation depth-sorted correctly in isolation — and the
whole thing *still* didn't add up to a good-looking battle map, because CSS's `preserve-3d` is
an approximation (no real z-buffer) fighting pixel art that was never drawn for this angle.
Each individual fix was correct; the technique's ceiling was below "looks good."

**Reverted index.html, sw.js, and rules-test.js to their state at commit `a44a9c7`** (the last
commit before the 3D rewrite began) — flat 2D `rotate(45deg) scaleY(.5)` tiles, no standing
walls, walls/tiles/decor at whatever quality that commit had already reached this session
(tree/bush anchor fixes, wall texture tiling fix, redundant-emoji cleanup — all still in
place, those were real fixes to the 2D system and are unaffected by this revert).

**Do not attempt a from-scratch CSS 3D isometric rewrite again** without new information that
specifically addresses the z-buffer problem (e.g., an actual WebGL/Three.js renderer, or
manually merging long wall runs into single multi-tile-wide faces instead of one cuboid per
tile — both un-attempted, both real work, neither guaranteed). The v114/v115.x entries above
are kept as a full record of what was tried and why each specific piece failed, precisely so
that record doesn't have to be rebuilt by re-deriving the same projection math and re-hitting
the same depth-sort wall a second time.

### v117 — floor/elevation moved to a `<canvas>` painter's-algorithm underlay (new information: not CSS at all)
v116's flat 2D mode still used DOM `isoFace` divs (`clip-path`-cut flat swatches) for elevation
risers, stacked via `z-index` — the exact technique the v116 revert-note above flags as the
recurring failure mode (a stray-offset z-index bug in one of those risers had just been
patched in v116.1). The actual fix wasn't a better z-index formula, it was dropping DOM/CSS
stacking entirely for the visual layer: `mapGridHTML`'s iso branch now emits a `<canvas
class="isocanvas">` (sized to the same stage box, carrying `data-tiles`/`data-height` as
`encodeURIComponent(JSON.stringify(...))` so a fresh canvas can repaint itself independent of
which of the ~8 call sites rendered it) plus the same `.mcell` divs as before, but now with no
fill/riser HTML at all — they're pure positioned hitboxes/highlight-rings, so every existing
click/target/DM-terrain-paint code path is untouched.

`paintIsoCanvas` (wired via a `MutationObserver` on `document.body`, since `render()` recreates
the DOM — and the canvas with it — on every state change) rebuilds the same `{depth:(rx+ry)*10
+height, ...}` list `mapGridHTML` used to sort risers by, then draws each tile with `ctx.fill()`
in that order — a real painter's algorithm with no stacking-context approximation, so the
"stray +50" class of bug is structurally impossible (there is no z-index to get wrong). Terrain
top faces use the existing `sprites/tiles/*.png` via `ctx.createPattern` when loaded (falling
back to `TERRAIN[key].c` solid color until the `Image` `onload` fires and triggers a re-render,
same lazy-load-then-`render()` pattern as `ensureDecorProbe`); elevation side faces are flat
shaded quads (no texture warp attempted — that warp was the specific thing that made v114's
standing walls look like "a mismatched, wonky smear").

Walls are still rendered flat (not reintroduced as standing) — that was a separate, deliberate
call in v116 about asset quality (flat top-down wall art doesn't read as a standing block from
any angle), not a symptom of the z-index bug this fixes. Revisit standing walls only with actual
iso-angle wall art, not as a side effect of this change.

### v117.1 — the ported riser geometry itself was still wrong: risers must wall the exact step to a neighbour, not drop to absolute ground
v117 moved rendering to canvas but carried over v114-era geometry verbatim: every elevated tile
drew a riser dropping all the way to *absolute* ground (`hgt*ISO_ELEV` px), regardless of what
was actually next to it, relying on z-order for a taller/closer neighbour to paint over the
redundant portion — same assumption the old DOM code made. That assumption only holds for an
isolated bump on flat ground. On a staircase (screenshot: heights 3→2→2→1→1→0), each step's
riser overshot past the *next* step instead of stopping at the real 1-level difference,
cutting disconnected dark wedges across the lower steps — reported live as "walls z-sorting is
fucked."

**Fix**: `paintIsoCanvas` now builds a rotated-space height lookup (`hAt`) and, for each tile,
computes the height difference to all 4 grid neighbours (`rx+1,ry` / `rx,ry+1` / `rx-1,ry` /
`rx,ry-1` — the four diamond-edge-sharing directions, derived from the projection algebra:
`cx=(rx-ry)*ISO_X, cy=(rx+ry)*ISO_Y`). `drawIsoTile` draws a wall on a given edge **only when
this tile is higher than that neighbour**, sized to exactly `(thisHgt-neighbourHgt)*ISO_ELEV`.
Both sides of a boundary compute the same shared-edge geometry from the same two heights, so
steps meet flush **by construction** — this is provably correct regardless of paint order, not
dependent on z-order overpainting an oversized shape. A raised bump on flat ground and a pit
surrounded by flat ground both fall out of the same 4-direction diff formula (no separate
raised/pit branches needed anymore); map edges (no neighbour) still drop the tile's full height
to ground, matching the old edge-of-map behavior.

Also bumped the depth-sort key from `(rx+ry)*10+height` to `(rx+ry)*100+height` (both in
`paintIsoCanvas` and the `.mcell` hitbox z-index in `mapGridHTML`) — with the old ×10 step, a
height swing ≥10 levels between tiles could tie or invert two different rows' sort keys. Not
the active bug in the screenshot (heights there only ranged ±3), but a latent version of the
same "stray offset" class of bug fixed in v116.1, cheap to close off now.

`rules-test.js` regression: builds a real 4-tile staircase (heights 3,2,1,0), runs the actual
`paintIsoCanvas` against a minimal recording fake `<canvas>` context, and asserts each drawn
downhill wall's drop is exactly one `ISO_ELEV` step — not the full absolute height.

### v117.2 — v117.1's fix still drew invisible "back-facing" walls, double-drawing every boundary; tree sprite replaced with an emoji
Live re-test of v117.1 on the Open Field preset (a 3x3 hill, flat height-1 ring around a
height-2 peak) showed the elevation risers rendering as "clear/overlapped" — reported live.
v117.1 computed a wall on **all 4** neighbour directions whenever this tile was higher than
that neighbour (`l`/`r` toward `rx+1`/`ry+1`, plus `nl`/`nr` toward `rx-1`/`ry-1` for the
"far" pit-interior look). That's wrong for a reason that has nothing to do with sizing: this
fixed isometric camera (`cx=(rx-ry)*ISO_X, cy=(rx+ry)*ISO_Y`) can only ever see the two faces
that point toward *increasing* rx/ry ("in front") — the other two always point away from the
camera and are occluded by the tile's own top face, **regardless of neighbour heights**. A
solid peak (the pyramid's centre tile) is higher than *all four* of its neighbours, so v117.1
drew a spurious `nl`/`nr` wall on its back side *in addition to* the correct `l`/`r` front
walls — two different quads meeting at the same vertex but computed from different neighbour
heights, which don't align (verified by hand: at the shared LEFT vertex, the front wall's
extent and the back wall's extent land at different y-coordinates, leaving a gap/mismatch —
exactly the "clear/overlapped" look).

The fix is to **delete `nl`/`nr` entirely** — there is no scenario that needs them. A pit's
"far interior wall" isn't a separate case at all: it just falls out of the *higher neighbour
on that side* drawing its own ordinary front-facing (`l` or `r`) wall pointing back into the
hole. Verified by hand for a lone pit surrounded by flat ground: the west neighbour's `r`-wall
and the north neighbour's `l`-wall point into the pit and cover exactly the two interior walls
a viewer would expect to see; the pit's near (east/south) sides correctly get no wall at all
(occluded by the rim, matching how every other isometric tactics game draws pits). `rules-test.js`
now asserts a solid peak surrounded on all 4 sides by lower ground draws exactly 2 walls (not 4
and not the old code's mismatched pair) inside a height-0 buffer ring so the assertion isn't
polluted by the separate (correct) "map edge defaults to height 0" behavior.

Also, on the same screenshot: the `sprites/decor/tree.png` sprite itself was flagged as
low-quality art ("looks like shit") — not a rendering bug, the actual pixel art reads like a
totem pole up close. Rather than iterate on hand-drawn pixel art blind (no way to preview it
before a live round-trip), `DECOR_MANIFEST.tree` now renders a plain 🌳 emoji
(`decorTokenHTML`'s `e.emoji` branch) instead of loading the PNG — guaranteed-clean, no art
skill required. `bush.png` is untouched (not flagged).

### v118 — iso renderer extracted to its own file, rebuilt clean, verified against real Chromium instead of live-deploy screenshots
After v117.2 the user reported the walls *still* looked wrong on a live screenshot. Investigating,
two things became clear:

1. **The live-deploy-screenshot loop was the actual bottleneck**, not any single geometry bug.
   Each round (v117 → v117.1 → v117.2) fixed exactly what the previous screenshot showed and
   broke something the previous screenshot hadn't exercised, because there was no way to see the
   renderer's actual output locally — every check meant push, wait for Pages, ask the user to
   screenshot, and read pixel positions out of a JPEG in words.
2. **The renderer was welded into the same ~5,200-line index.html as every 5e rule**, so even a
   pure-rendering bug meant reading `mapGridHTML`, iso CSS, and canvas-paint code side by side in
   one file. User's call: pull it out entirely.

**What changed:**
- New `iso-renderer.js` — a standalone, dependency-free file owning 100% of the pixel rendering:
  `ISO_X/Y/ELEV/PAD`, `tileScreenPos` (single source of truth for a tile's screen position — both
  `mapGridHTML`'s `.mcell` hitbox placement and the canvas painter call this same function now,
  removing the copy-pasted-formula-drift risk that existed even in v117.2), `paint()` (reads
  `data-cols/rows/rot/tiles/height/palette` off a `<canvas class="isocanvas">` and depth-sorts +
  draws it), and its own `MutationObserver` — `index.html` never calls into this file directly,
  it just emits the right `<canvas data-*>` tag and the renderer notices and paints itself.
- `index.html`'s `mapGridHTML` now only owns game/DOM concerns: `TERRAIN`/`DECOR` (gameplay flags),
  the `.mcell` hitboxes + click/target/reach-highlight/DM-terrain-paint wiring, token/decor HTML.
  It hands the renderer a small `TERRAIN_PALETTE` ({key: hexColor}, no gameplay flags) via a new
  `data-palette` attribute alongside the existing `data-tiles`/`data-height`.
- The wall geometry itself is the same rule arrived at in v117.2 (only the 2 camera-facing walls,
  each sized to the exact height difference to that specific neighbour — a pit's far wall isn't a
  special case, it falls out of the higher neighbour's own front wall) — rebuilt fresh in the new
  file rather than copy-pasted, so it isn't carrying forward any DOM/CSS-era assumptions.
- **New verification step that should have existed from v117 onward**: `tools/iso-preview.js`
  (dev-only, not shipped/precached) drives a real headless Chromium via Playwright — actual
  browser Canvas2D, not a second hand-rolled implementation that could have its own bugs — to
  render canonical scenes (flat/mound/pit/staircase/pyramid-hill/mound-next-to-pit) to PNG.
  Looking at these directly caught nothing new (the v117.2 geometry turned out to already be
  correct — the pyramid rendered perfectly first try), which is itself useful information: it
  means the live "still fucked up" report was very likely a stale service-worker/PWA cache on the
  user's device showing v117.1, not an actual v117.2 regression. Also spot-verified the real
  `index.html` + `iso-renderer.js` integration end-to-end (loaded the actual file in headless
  Chromium, called the real `mapGridHTML` with the real `MAP_PRESETS['Open Field']`) — renders
  correctly, no console errors.
- Tests split accordingly: `iso-renderer-test.js` (staircase-step, pyramid-8-walls-not-4,
  `tileScreenPos` sanity — all exercising `iso-renderer.js` directly) vs. `rules-test.js` keeping
  only a thin check that `mapGridHTML` hands the renderer the right data attributes.

**Process note for next time a rendering bug is reported live**: run
`node tools/iso-preview.js` and look at the PNGs *before* assuming the fix needs another
iteration — a hand-verified-by-eye local render is strictly more informative than a live
screenshot round-trip, and doesn't cost a Pages build + a message back-and-forth.

## v119 — real range bug (not terrain height), circular AoE blasts, manual initiative, roll-mode toggle
Live report: "range of fireball and firebolt seems to be getting fucked up, i think its mistaking
the terrain height." Investigated the height angle first (rebuilt the exact reported scenario —
range-highlighting near the Open Field hill through the real `mapGridHTML`/`losClear`) and it
checked out: `gridDist`/`losClear` never read `heightAt` at all, elevation genuinely doesn't
affect range or LOS in this engine (a documented simplification), and a tile that looked wrongly
excluded turned out to be correctly LOS-blocked by an actual tree on the sightline — working as
designed, not a bug. The user's hunch about *something* being wrong was right, just not the cause:

**The real bug**: `parseSpellMechanics` only found a spell's range by regex-matching "within N ft"
in `SPELL_DESC`'s one-line flavor text. Almost none of them say that — Fire Bolt's description is
"Ranged fire mote, 1d10 fire; ignites objects," never mentioning its real 120 ft — so `spellRangeTiles`
silently fell back to a flat 60 ft default. A sweep found **87 attack/save/AoE spells** hitting
this gap, including Fireball (real 150 ft, was 60) and Fire Bolt (real 120 ft, was 60). Fixed with
a new `SPELL_RANGE` table (real PHB ft, `'Touch'` where RAW says Touch) that `parseSpellMechanics`
checks first, falling back to the old description-regex for anything not listed. `rules-test.js`
now has a standing coverage check (mirrors the v92 spell-coverage audits) so any future spell
missing from both fails the suite instead of shipping a silent wrong-range bug again.

**Also fixed, from the same conversation**:
- **Circular AoE** ("fireball radius should be circle"): blast-radius checks used `gridDist`
  (Chebyshev/square — a diagonal tile at distance `√2` still counted as "distance 1"), so Fireball
  et al. hit a square footprint, not a sphere. New `inBlast(cx,cy,x,y,r)` (Euclidean) replaces
  `gridDist<=r` at every blast site: `openSpellTarget`/`qbSpellTarget`'s `blastTargets`/`alliesIn`/
  `selfIn` (actual damage), `mapGridHTML`'s `opts.blast` (visual highlight), `qbPaintTerrain`
  (Grease/Web zones) — visual and mechanical shape now match, both circular. `gridDist` itself is
  untouched (still Chebyshev for range/movement — intentional 5e diagonal-movement rule, unrelated).
- **Manual initiative entry**: the DM's Turn Order card showed each roll as a plain `<div>`; it's
  now an editable `<input>` per combatant (`data-initedit`) — changing it re-sorts `s.order` and
  keeps the turn pointer on whoever was acting. `rollInitiative`'s one-tap auto-roll-everyone is
  untouched, this is an edit-after-the-fact affordance, not a replacement.
- **Roll-mode toggle** ("auto/manual toggle instead of asking each time"): `attackFlow`'s to-hit
  and damage steps used to show an auto-roll button *and* a manual input side by side, forcing a
  choice on literally every attack. New persisted `rollMode` (`grimoire.rollmode`, ⚙ App menu,
  same pattern as the sound toggle) shows only the preferred one by default, with a small
  "enter manually instead" / "auto-roll instead" link so a single attack can still go the other
  way without changing the global setting. `castModal`'s spell-roll rows were left as-is — they
  already show both inline with no forced sequential choice, so there was no "asking each time"
  friction there to fix.

Verified locally via headless Chromium before shipping: circular blast renders as an actual
stepped disc (not a square) on a real grid.

## v120 — range shape unified (melee/touch stay square, real ranged distances go circular), bigger preset maps, Dominate concentration bug
Follow-up to v119: "make firebolt and ranged spells respect range, also range needs to be
circular as well, maybe the maps bigger too."

**Range enforcement already existed** — `openSpellTarget`/`qbSpellTarget`'s `inRange(x,y)` was
already gating which tiles could be tapped before v119, so "respect range" wasn't a missing
check; it was that v119 only made the *AoE blast* circular, not the *range ring* or any other
range check, so a Fire Bolt's "can I reach that far" boundary was still the square `gridDist`
shape while its blast (N/A, Fire Bolt has none) — but Fireball's *range* ring was still square
even though its *blast* was now circular, an inconsistency. Swept every remaining
`gridDist(...)<=N`-as-range site and moved it onto `inBlast`: the spell/teleport range-highlight
in `mapGridHTML` (`opts.rangeFrom`), both `inRange` closures (`openSpellTarget`, `qbSpellTarget`),
`monstersInRange` (weapon/cantrip range filtering), `dmMonsterAttack`'s target-in-range filter,
`teleportOk`, and Quick Battle's own `qbInRange`. Left untouched (still Chebyshev, deliberately):
`attackFlow`'s melee-vs-ranged check and `leavesReach` (opportunity attacks) — both are *adjacency*
tests (radius 1–2, "is this reach"), where a diagonal tile is conventionally still adjacent; a
strict circle at that radius would wrongly reject a valid diagonal melee/touch target.

To keep both cases correct from one function, `inBlast(cx,cy,x,y,r)` now branches on `r`: `r<=1`
stays Chebyshev (melee reach, Touch-range spells, and small "everything adjacent" AoE like
Thunderwave/Grease all fall here), `r>1` is genuinely circular (Euclidean). This is why
`qbPaintTerrain`'s r1 Grease test reverted to expecting the full 3x3 square — that radius is the
deliberate exception, not a regression — while a new r2 test proves real circularity above it.

**Bigger maps**: all 8 `MAP_PRESETS` roughly doubled in area (e.g. Open Field 15×10 → 26×18,
Dungeon/Castle/Cave/Swamp 15×11-12 → 26×20) — with corrected ranges from v119 (Fire Bolt 24
tiles, Fireball 30), the old ~15-tile-wide maps made "range" nearly meaningless (everything was
always in range). Hand-placed features (walls/water/decor coords) are untouched, just sitting
within a larger open area now — verified via headless Chromium that the enlarged Open Field
preset still renders correctly (hill, decor, textures all intact) with no errors.

**Dominate concentration bug** (live report: "i was dominating a monster... the monster died,
but it kept asking me to concentrate, it needs to end the spell"): `c.concentration` only ever
tracked the spell *name*, never which monster it was bound to, so nothing noticed when a
Dominated creature died. Fixed in `qbCheckEnd` (already called after every damage-dealing action
in Quick Battle, the only mode this feature exists in) — if concentration is active on one of the
three Dominate spells and no monster with the `Dominated` condition is still alive, concentration
and its `conc` effect both clear automatically. As a side effect this also correctly handles a
Dominate spell whose initial save succeeded (nothing was ever dominated) — concentration drops
on the very next check instead of lingering on a spell that never took hold.

## v120.4 — 5e jump / climb / cliffs on the grid
- Elevation: each map height level = **5 ft** vertical.
- **High jump** (PHB): running = 3 + STR mod feet (requires ≥10 ft of movement already spent on the path as run-up); standing = half. Jumping onto a ledge of that height or less costs that many feet of movement.
- **Climb**: rises taller than the jump require climbing. Without a climb speed, each foot climbed costs **2 feet** of movement (PHB). With climb speed, 1:1.
- **Too tall**: unaided climbs above max(20 ft, 4× running high jump) are **impassable** in pathfinding (need rope, magic, climb speed, or DM adjudication).
- **Descent**: ≤5 ft step-down is free vertically; longer drops use controlled climb-down cost. Drops ≥10 ft also apply **fall damage** (1d6/10 ft, max 20d6) on landing in Quick Battle.
- Pathfinding / reach highlights pass the **mover** (PC or monster) so STR and climb speed apply. Monsters without explicit STR use a CR-based guess.

## v120.66 — Wave 2 summons: Conjure Animals (pack) + Animate Dead (permanent, no conc)
Extends the Wave 1 summon framework (Conjure Elemental) with the two next spells on the handoff
backlog, both routed through the same `SPELL_HANDLERS`/`SUMMON_CATALOG`/`openSummonSpellUI` path
— pick a template, place on the map, join initiative as an `ally:true` tactical-AI unit.

**Conjure Animals** — PHB pack choice (1×CR2 / 2×CR1 / 4×CR1/2 / 8×CR1/4), 30 ft placement range,
concentration. A 5th-level+ slot doubles the count (PHB: "twice as many creatures"). Simplification:
the whole pack spawns from one clicked tile via `nearbySpawnTiles` (spiraling outward to the
nearest open ground) rather than placing each beast individually — real 5e lets you place each in
any unoccupied space you can see within range; this app scatters them near your chosen spot instead.
Already wired into `CONC_SPELLS`/`SUMMON_CONC_SPELLS` from Wave 1 groundwork, so losing
concentration (or the whole pack dying) correctly ends the spell.

**Animate Dead** — no concentration (PHB-correct: it's an instantaneous cast that leaves a
permanent minion, not a sustained effect), skeleton or zombie, Touch range. Simplification: no
corpse-on-the-map requirement and no "control cap" (2× proficiency bonus HD) — casting it again
just replaces your last Animate Dead servant, same one-summon-per-spell-name rule Conjure Elemental
already uses. Real 5e lets a necromancer accumulate multiple raised undead across casts without
recasting each day, which this app doesn't model.

## Gas hazards + hazard system now works in DM/player-net, not just Quick Battle

Two related gaps, fixed together since they share the same underlying mechanism:

**Cloudkill/Insect Plague/Stinking Cloud were one-shot blasts, like Fireball.** Real 5e
Cloudkill etc. is a lingering cloud that keeps hurting anyone inside it round after round;
this engine only ever applied damage once, at the moment of casting. Fixed with a new
`SPELL_GAS` table (parallel to the existing `SPELL_TERRAIN` used by Grease/Web) and
`tickGasHazards`, called from the same round-advance point as `expireHazards`. Simplified
from RAW in two ways, both intentional: (1) ticks once when the round advances rather than
at each individual creature's own turn-start or the moment they enter the cloud — avoids
needing a per-unit turn-start hook in three separate turn systems (QB/DM/player-net) for a
timing difference that's rarely going to matter at the table; (2) the cloud is stationary —
real Cloudkill drifts 10 ft/round away from the caster, and this engine has no notion of a
hazard "owner" to drift away from.

**The whole hazard/terrain system (Grease, Web, and now gas) was Quick-Battle-only.**
`qbPaintTerrain`/`qbExpireHazards`/`qbHazardAt`/`qbCheckTerrainProne` only ever ran against
`QB`; a DM-hosted or player-net battle calling `openSpellTarget`'s blast path used a
different function (`applyFireBlastHazards`, torches/barrels only) that never painted
lasting terrain at all — casting Grease in a multiplayer game gave a one-time prone-check
on whoever was standing in the blast at cast, no difficult terrain, no catching movers
later. Renamed to mode-agnostic names (`paintHazardTerrain`/`expireHazards`/`hazardAt`/
`checkTerrainHazardCond`; old names kept as thin aliases) and wired into `dmNextTurn` and
the DM's manual monster/player move handlers.

The one real wrinkle: a DM-hosted session only ever syncs a connected player's hp/ac/conds
summary, never their ability scores — the DM device genuinely cannot roll a player's Con/Dex
save itself (same reason `dmMonsterAttack`'s save-based monster attacks are adjudicated by
hand rather than auto-rolled). Rather than a manual per-hazard-per-round DM prompt for every
affected player (bad UX with more than one player in a cloud), the DM sends a new `hazard`
message to the affected player's own device — which does have their full sheet — and it
resolves the save locally, then reports the result back through the existing `apply`/`cond`
message shapes `dmOnData` already understands. Monsters skip this round-trip entirely (the
DM has full monster data locally, same as it always did for `dmMonsterAttack`).

Player-cast blast spells that paint a hazard (`openSpellTarget`'s `resolveBlast`, running on
the casting player's own device) follow the same "local echo + tell the DM" pattern already
used for monster damage (`playerNetAdapter.hurt`): paint locally for instant feedback, and
send a new `paintHazard` message so the DM's authoritative session picks it up too — the
next broadcast reconciles the two.

Coverage: `rules-test.js` duplicates the Grease/Web assertions under the new mode-agnostic
names against a fake DM-session-shaped state (not just QB), plus new assertions that a
Cloudkill-style cloud deals real repeat-round damage and stops the moment its hazard
expires, and that a no-damage cloud (Stinking Cloud) applies Poisoned instead.

**Visual**: a gas hazard cell now gets a `.gashazard` CSS class (sickly green pulsing haze,
`mapGridHTML`) in the classic 2D/DM grid view — real bug, since `SPELL_GAS` deliberately
doesn't repaint the floor (unlike Grease/Web's `SPELL_TERRAIN`), so without this a gas cloud
looked like plain floor despite still dealing damage every round.

**WebGL Iso3D — done too.** `adapter.js`'s `grimoireSessionToView` now reads
`session.hazards` directly and folds every gas cell into `highlights.gas` (a `Set`, same
shape as the existing move/dash/attack-range highlight sets) rather than adding a whole new
top-level view field or a new mesh/fx primitive. `host.js`'s `_drawTileHighlights` — the
existing per-frame 2D-canvas-over-WebGL overlay that already draws move/dash/attack-range
rings by projecting each highlighted tile's corners every frame — gets one more layer for
`hl.gas` (sickly green, alpha wobbles with `performance.now()` for a pulse since the canvas
redraws every frame anyway, no CSS/GPU animation needed). Verified by injecting a fake
hazard-bearing session directly into a live `Iso3DHost` and reading real pixel data back
off the overlay canvas — not just eyeballing a screenshot, since the app's own render loop
re-syncing back to the real (hazard-free) session moments later made a plain screenshot an
unreliable check.

### Combat maneuvers (Shove, Grapple, Escape Grapple, Hide, Recall Knowledge, Stabilize) unified across all three modes (v120.180)

**Was Quick-Battle-only.** `qbShove`/`qbGrapple`/`qbEscapeGrapple`/`qbHide`/`qbStudyMonster`/
`qbStabilizePc` all hardcoded `const s=QB`, so the Use button's combat maneuvers (added
v120.177–v120.179) had no equivalent in a DM-hosted session or player-net play at all.
Replaced with adapter-taking `maneuverShove`/`maneuverGrapple`/`maneuverEscape`/
`maneuverHide`/`maneuverStudy`/`maneuverStabilize`, following the same `Engine`+adapter
pattern already used for attacks/spells (`qbAdapter`/`sessionAdapter`/`playerNetAdapter`) —
one resolver, the adapter supplies mode-specific plumbing (network sends vs direct
mutation). `openAdjacentUseUI` (the Use button's menu) now works identically in Quick
Battle and player-net; DM-hosted has no PC of its own to "Use" with, so its monsters
instead get Shove/Grapple options alongside their normal attacks in `dmMonsterAttack`.

**Monsters got real ability scores.** `unitSkillRoll`'s PC-vs-monster branch (`u.skillProf`
present → real math, else a flat CR-scaled `monsterCheckBonus`) is gone. Every monster
instance now gets `deriveMonsterAbilities(mo)` called lazily on first check/save: fans the
same CR-scaled flat bonus out into a real `{str,dex,con,int,wis,cha}` block (all six equal,
so the *numbers* are unchanged — this was a shape refactor, not a balance change) plus empty
`skillProf`/`saveProf` (no synthetic proficiencies, which would have double-counted the
bonus). A monster is now just another creature that flows through `abil()`/`skillBonus()`/
`opposedCheck()` the same way a PC does — no more separate monster-math branch to keep in
sync. `qbAdapter`/`sessionAdapter`/`playerNetAdapter` each gained a `checkSubject(u)` method
returning the raw ability-score-shaped object for any unit — a monster's is always known
(whoever's device runs it has full data), a PC's own is always known locally; the only time
it returns `null` is a DM looking at a *connected player's* real sheet, which never syncs
beyond an hp/ac/conds/stable/deathFail summary by design.

**The network round-trip that unification does NOT remove.** A DM-hosted session still
can't compute a connected player's own Athletics/Acrobatics roll — same reason it can't
roll a player's saving throw for `dmMonsterAttack`'s DC-based attacks. A DM-controlled
monster's Shove/Grapple sends a `maneuverCheck` message (monster's roll + a target/kind)
to the targeted player's device, which resolves the contest locally with its real sheet,
applies the result to itself (condition via `c.conditions`, a forced push via the existing
`move` message), and reports back purely so the DM's UI can show what happened
(`maneuverResult`) — no new state-mutation authority moved to the player's device by this.

**Stabilize** was built (v120.179) but never wired to a button — solo Quick Battle has no
second ally to target. It's player-net only now: `playerHello()`'s sync payload gained
`stable`/`deathFail` fields so a would-be rescuer's device can tell "needs stabilizing"
apart from "already stable" or "already dead" from the mirror alone (`needsStabilizing`,
unit-tested directly). The actor rolls Medicine locally and reports success/failure to the
DM via a new `stabilize` message; the DM relays a terse `stabilized` to the target player's
own device, which sets its own `c.stable`/`c.death` — the actor's device never mutates
another player's character directly, matching how every other cross-player effect in this
app works.

Coverage: `rules-test.js` covers `deriveMonsterAbilities`/`checkSubject` on all three
adapters, regression-tests the six `maneuver*` functions against `qbAdapter` (same outcomes
as the old QB-only functions), and `needsStabilizing`'s eligibility rules directly. The
network message handlers (`dmOnData`'s `shove`/`stabilize`/`maneuverResult`, `playerOnData`'s
`stabilized`/`maneuverCheck`) aren't reachable from the headless harness (no live PeerJS) —
verified instead via a live browser: Quick Battle's Use menu end-to-end (Grapple against a
Red Dragon Wyrmling), the DM's monster-maneuver modal opening/rolling/sending, and the
player-side `maneuverCheck` handler's hit and resist branches, injecting a minimal `net` rig
rather than a full two-peer connection.

### Shove/Grapple/Escape now show the actual roll before resolving (v120.181)

Shove/Grapple/Escape resolved instantly (both rolls happen internally the moment you tap the
button, straight to a flashBanner) — unlike Attack's interactive "Roll to hit" → result flow.
That was always true, not a regression, but it read as broken once the DM's new
monster-maneuver UI (above) started showing an interactive roll and the Use-menu side didn't.
`maneuverShove`/`maneuverGrapple`/`maneuverEscape` now return the actual roll numbers
(`atkTotal`/`defTotal`/`atkSkill`/`defSkill`) alongside `success`; `openAdjacentUseUI` routes
through a `maneuverResult` result-card view (d20 totals + SUCCESS/FAILED, "Continue" to close)
instead of closing immediately — the roll+apply is still atomic under the hood (no separate
damage phase to interleave, unlike Attack), this just makes the number visible before dismissal.
Caught by testing: the result card has no `#useClose`/backdrop-dismiss button, and the modal's
generic close handlers were unconditionally assigned (`$('#useClose').onclick=...`, no null
guard) — a stray backdrop tap on the result card threw. Fixed by routing dismiss through
`afterManeuver` specifically for that view (the mutation already happened by the time it's
shown, so a bare close would leave it un-saved/un-rendered) and guarding the generic handlers
like every other view in this function already does.

### Detect Thoughts implemented for real (v120.181)

Was a pure narrative no-op (data tables only, no `SPELL_HANDLERS`/effect/condition entry) —
same bucket as Comprehend Languages, Purify Food and Drink, etc. Now: casting it targets a
creature (routed into the existing single-target battle-picker via a `spellTargetsEnemy`
OR-branch, same mechanism `POWER_WORD_HP`/Eyebite already use to opt into that UI without a
save/attack/damage keyword), reveals a curated one-line "surface thought" per monster
type/name (`DETECT_THOUGHTS_FLAVOR`, first-regex-match-wins with a generic fallback), and
grants the caster advantage on Insight checks against that specific target for the spell's
duration (`skillCheckAdvantage` gained an optional `targetId` param, checked only for the
`insight` key against a live 'Detect Thoughts' effect's own `targetId`). The effect itself
rides the existing generic `SPELL_EFFECTS`-driven `addEffect` concentration bookkeeping every
other buff spell already gets from `castSpell` — the cast-time hook (`castDetectThoughts`)
just patches `targetId` onto the effect `addEffect` already pushed, since the caster/target
aren't both known until the player actually picks a target (a separate step from spending the
slot). **Deliberate deviation from RAW**: the PHB says Detect Thoughts can't read
constructs/undead (no mind to touch) — every creature gets a real flavor line here anyway,
including zombies/skeletons, prioritizing the fun table moment over the rule technicality.
**Not implemented**: RAW's "probe deeper" mechanic (an action each turn, target gets a Wis
save, can feed false thoughts on a success) — the surface-thought reveal + Insight advantage
is the whole feature this pass; probing deeper would need its own per-round save loop.

### Unseen Servant implemented for real (v120.181)

Was also narrative-only. Now a real summon (`SUMMON_CATALOG['Unseen Servant']`, single-choice
pick list, reusing the exact same summon-spawn UI Conjure Elemental/Animals/Animate Dead
already use) with true PHB stats: AC 10, 1 HP, Speed 15 ft, **0 attacks**. Getting `0` and `''`
to actually stick exposed a real latent bug in `spawnSummon`: it built `attacks`/`atk` with
`pick.attacks||1` / `pick.atk||'Slam +5 (1d8+3)'` — `||` treats a deliberate `0` or `''` as
"not specified" and silently substitutes the combat-summon default, so a true non-combatant
summon was never actually reachable through this function before. Fixed to `!=null` checks.

**Mindless, not AI-controlled.** Every existing summon gets `brain:'tactical'` hardcoded
(full AI autonomy) — wrong for a servant that should only ever do what it's explicitly told.
New `BRAINS.passive` (always returns no intents) + `spawnSummon` now honors `pick.brain` when
the catalog entry sets one, instead of hardcoding `'tactical'`. **Real gap this closed**: the
turn-driver's fallback (`BRAINS[u.brain]||BRAINS.tactical`) would have silently defaulted an
unrecognized brain name back to full tactical AI — `BRAINS.passive` had to actually exist,
setting `brain:'passive'` alone would have been a silent no-op.

**Player-directed via the Use menu** (`👻 Command Servant`, bonus action, gated independently
of the Action-based `afterManeuver` flow every other Use-menu item spends): move it up to
15 ft (`servantMoveTiles` — direct Chebyshev-3 reposition blocked by `tileClearFor`, not full
pathfinding; a mental one-word command isn't really "movement" in the normal PC-turn sense) and/or
interact with one adjacent object, reusing `listInteractInRange`/`runInteractAction` exactly
as the Use menu already does for the caster's own tile. Scoped to Quick Battle and player-net
(same reasoning as the maneuver system: DM-hosted has no PC of its own to command a servant
for). **Real bug caught by live testing, not unit tests**: the servant lookup
(`m.controllerId===me.id`) worked in QB (`me.id` is the stable string `'pc'`) but not
player-net, where `openAdjacentUseUI`'s `me` wrapper overrides `.id` to the literal `'me'` for
adapter purposes — `spawnSummon`'s real `controllerId` is the actual peer id in that mode, so
the comparison needs to branch per mode (`mode==='qb'?'pc':net.peer.id`) rather than reading
`me.id` uniformly.

Coverage: `rules-test.js` covers the catalog entry shape, the `!=null` fix directly (spawn a
unit with `attacks:0`/`brain:'passive'` and confirm it sticks), that the passive brain's "AI
turn" is a real no-op call (not a crash, not a silent tactical fallback), and
`servantMoveTiles`' range/self-exclusion/wall-blocking. Verified live in a real browser: full
cast → pick → place flow through the actual summon UI, the spawned unit's real stats, the
passive brain's no-op turn, and Command Servant's move-tile picker actually repositioning the
unit and correctly refusing a second command once the bonus action is spent.

### Spell audit — 30 narrative-only spells given real mechanics (v120.182)

Full audit: 254 spells total, 150 already had real mechanics (attack/save/damage/condition/
effect), 104 were narrative no-ops (spend the slot, log a line, nothing else). Of those 104,
~70 are legitimately fine as-is — out-of-combat/social/downtime spells (Legend Lore, Sending,
Scrying, Raise Dead, Tongues, Water Walk, etc.) where a tactical combat-grid app has nothing
meaningful to simulate; mechanizing them would be pure busywork. The other ~30 were real gaps,
fixed here, grouped by how they were fixed rather than by spell (several turned out to be one
data-table fix applied to multiple spells, not 30 separate pieces of bespoke code):

**Cheapest fix — description reworded to include real dice/save keywords, zero new code.**
`parseSpellMechanics` already regex-parses SPELL_DESC for save types and dice groups; several
spells were narrative purely because their one-line description never stated the mechanic in
parseable words. Reworded + added SPELL_AOE/SPELL_COND/SPELL_RANGE table entries only:
**Reverse Gravity** (now "Dex save or 4d6 bludgeoning"), **Forcecage** (now "Cha save or
Restrained"), **Calm Emotions**/**Compulsion**/**Mass Suggestion** (now state their real save +
Charmed condition), **Regenerate** (now states its real 4d8+15 dice instead of vague prose).
These all flow through the exact same Engine.castApply pipeline every other save spell already
uses — no bespoke resolution code at all.

**Flat (non-dice) healing — parseSpellMechanics gained a second heal-detection path.**
Cure Wounds/Healing Word "worked" because castModal shows a roll-helper whenever
`parseSpellMechanics` detects dice notation + a heal keyword — but that regex required actual
`\d+d\d+` dice, so **Heal** ("Restore 70 HP") and **Mass Heal** ("Distribute 700 HP") silently
fell through despite clearly being heal spells. Added a flat-number fallback path (excludes
Goodberry deliberately — its "1 HP" is per-berry, not a one-shot total).

**New shared "no-cast zone" mechanism.** **Silence** and **Antimagic Field** block spellcasting
for anyone inside — a genuinely new hazard type (`SPELL_NOCAST_ZONE`/`paintNoCastZone`/
`inNoCastZone`), reusing the existing `s.hazards` cell-tracking + `expireHazards` revert
machinery from Grease/Web/gas (just no terrain repaint, a `noCast` flag instead of a damage/
condition one), checked in `canCast` before any cast is allowed. Simplification: doesn't
suppress effects already active before someone entered the zone (Antimagic Field's other real
effect), and doesn't distinguish verbal/somatic/material components — both collapse to "can't
cast at all while standing in it," the mechanically dominant case either way.

**New shared "conjure a wall" mechanism.** **Wall of Force/Ice/Stone** and **Wind Wall** paint
real solid (or difficult, for Wind Wall) terrain via the same hazard pipeline, new TERRAIN
entries (`wall_force`/`wall_ice`/`wall_stone`/`wind_wall`) and a `WALL_SPELLS` bespoke
early-return in both QB's and player-net's `resolveBlast` (mirroring the existing Gust-of-Wind
special case) that skips the damage-roll modal entirely — these spells have no damage to roll.
Simplification: real 5e walls are precise player-drawn panels/lines; this approximates one as a
small filled zone centered on the aimed tile, same spirit as this app's existing cone/line-AoE
approximations. Wall of Stone uses `rounds:Infinity` (doesn't expire on its own, matching RAW).

**Real, previously-missing core rule found and fixed along the way.** Implementing
**See Invisibility**/**True Seeing** required attacking-an-invisible-target to actually impose
disadvantage — and `attackAdvantage` never modeled that at all (only the invisible creature's
own advantage when IT attacks was checked, not the reciprocal penalty on whoever's attacking
IT). Added the missing `T('Invisible')` disadvantage check, with an `opts.seesInvisible` escape
hatch threaded through `Engine.hitResult` via a new `hasSeesInvisible(u)` helper — the two
spells set a `mods.seesInvisible` flag via ordinary SPELL_EFFECTS, no bespoke code needed
beyond the core rule fix itself. Also **Levitate** turned out to be a one-line fix:
`isFlying()` already checked for an effect literally named `'Levitate'` (defensive code written
ahead of the feature existing), it just never had a `SPELL_EFFECTS` entry to actually create.

**Single-point multiplier/gate fixes.** **Jump** triples `runningHighJumpFt()` — the one
function every jump/climb/pathfinding check in the app already calls — so a single
`hasJumpBuff()` check there covers every call site for free. **Feather Fall** gates the (only
one, QB-only) fall-damage application site. **Alter Self**'s natural-weapons choice adds a real
1d6 Claws option to both QB's (`qbPcAttacks`) and player-net's (`playerAttackMenu`) attack
lists — a genuine damage change, not just a tracked note, while the appearance-change/aquatic
options stay narrative (nothing to hook — no appearance or swim-speed system exists).

**Reused the existing interact-object system.** **Knock** doesn't defeat a distinct "locked"
state (this app only ever modeled open/closed, no lock at all) — it auto-opens the nearest
closed door/chest within range via the same `listInteractInRange`/`runInteractAction` the Use
button already uses. **Spare the Dying** auto-stabilizes the nearest adjacent downed ally
(player-net only, reusing the `stabilize`/`stabilized` net messages from the Use-menu Stabilize
maneuver) with no roll, matching its cantrip/no-check RAW text.

**Bespoke opposed-check spell.** **Telekinesis** is a spell-ability-check-vs-target-Strength
contest, not a saving throw — `telekinesisSavedKnown(c, mo)` computes it directly (reusing
`unitSkillRoll` for the target's side) and feeds the result into `Engine.castApply` via its
existing `savedKnown` shape (same mechanism the DM-adjudicated-save pattern already uses)
rather than hand-rolling a parallel condition-application path.

**Honest partial implementations** (documented rather than silently claimed as complete):
**Globe of Invulnerability** and **Beacon of Hope**'s non-death-save effects are tracked as
real concentration effects (visible in Active Effects, dismissable) but the actual
spell-blocking / max-healing / Wis-save-advantage isn't enforced anywhere — doing so would mean
checking every single attack/cast/save resolution in the app against zone membership or a buff
flag, disproportionate to a spell whose main value is a rare set-piece moment. **Counterspell**
and **Dispel Magic** both collapse to "strip a monster's spell-imposed conditions" (QB only) —
Counterspell's real timing (interrupt a cast in progress) doesn't fit this app's model at all
(spells resolve immediately when cast, no reactive-interrupt system exists), and Dispel Magic's
real targeting (end one specific known spell) isn't tracked per-condition, so both settle on the
same real, useful, if imprecise, outcome instead of doing nothing.

Coverage: every fix above has direct `rules-test.js` assertions (data-table parsing, the new
zone/wall mechanisms, the Invisible-disadvantage rule fix, the flat-heal detection, Telekinesis's
opposed check, Knock's real door-open, Alter Self's real Claws attack) — 60+ new assertions
across the eight batches. Also spot-verified live in a real browser: casting Wall of Force
through the actual targeting UI paints real solid terrain and blocks movement (confirmed the
same "sprite image 404s, CSS color renders" pattern the pre-existing, shipped `grease` terrain
already has — not a new bug), and casting Silence creates a real no-cast hazard zone through the
same UI path.

## Finish-what's-half-built batch (v120.183)

**Gust of Wind now has a real creature-facing effect.** Previously the spell only snuffed
torches — RAW is a Strength save or be pushed 15 ft (not knocked prone; that was a misremembering
checked with the user before implementing). `applyGustOfWind` walks the same line-of-tiles used
for the torch check, rolls each monster's Strength save against the caster's spell DC, and pushes
failures 3 tiles back along the wind's direction (stopping early at the first blocked tile via
`tileClearFor`). Both QB and player-net call sites now pass the DC through and report
pushed/resisted counts in the flavor banner.

**DM-side Escape Grapple actually works now.** `maneuverEscape`'s branch for a monster escaping
a *player's* grapple existed since the original maneuver-unification pass but had no real caller
— `mo.grappledBy` was hardcoded to the literal string `'pc'`, which only ever matched Quick
Battle's single-PC assumption. `maneuverGrapple` now stores the grappler's actual display name,
and a new `ad.findGrappler(name)` adapter method (added to `qbAdapter`/`sessionAdapter`) resolves
it back to a real unit for the contest. Wired into `dmMonsterAttack`'s attack-chip list as
"Escape Grapple", shown only when the monster is currently Grappled — resolves instantly, no
player round-trip needed since it's the monster's own turn.

**Player-net Dispel Magic / Counterspell.** `dispelMonsterConds(mo)` strips a monster's
condition list (same "collapse to strip-conditions" simplification documented above for QB) and
is now reachable from a connected player's device via a new `dispelMon` net message, handled
DM-side in `dmOnData` alongside the existing `paintHazard`/`moncond` handlers.

**Search — the counterpart to Hide.** Hide previously only worked in Quick Battle. A player's
Stealth total (`hiddenDC`) now syncs to the DM the same way `sanctuaryDC`/`holyAuraDC` already
do (via `playerHello()`'s payload and the `hello` handler's `Object.assign`). `dmMonsterAttack`
offers a "Search" attack option whenever a connected player is Hidden; rolling it calls the new
`monsterSearchRoll(mo, hiddenDC)` (Perception check vs. the synced Stealth total) and, on a
success, clears the target's Hidden condition and notifies their device via the existing `cond`
message.

Getting Search's roll button to actually render live surfaced a real bug worth recording: a
stray extra `}` left over from an earlier edit to `dmMonsterAttack`'s attack-type chain (the one
that added Escape Grapple/Search branches) was closing the `draw()` render function one brace too
early. Everything textually after that point — including the final `$('#modalRoot').innerHTML=`
assignment and all the `#maRoll`/`#maSearch`/etc. button-click bindings — was still reachable
because it happened to sit inside `dmMonsterAttack`'s own scope too, so the modal still *rendered
something* and *looked* functional, but `st.atk`-dependent branches added after that brace (only
Escape Grapple and Search, since they were the newest ones) were being evaluated against whatever
`body`/`st` state existed at the point the function's real scope actually closed — silently
skipping the button. `node --check` on the extracted `<script>` body pinpointed it exactly once
asked to; a plain browser reload never surfaces this class of bug because the rest of the script
still parses and runs fine. Worth remembering: when a single UI branch in a large function
silently produces no output with zero console errors, checking the served script's raw syntax
validity is a five-second test that should happen *before* hours of runtime instrumentation.

Tests: 15+ new `rules-test.js` assertions across all four fixes (Gust of Wind's push/resist
math at multiple Strength deltas, `findGrappler`/DM-side Escape Grapple, `dispelMon`'s message
handling, `monsterSearchRoll`'s hit/miss/unknown-DC cases, and the `hiddenDC` sync path). Search
also spot-verified live end-to-end via Playwright: DM opens the attack modal, picks Search, rolls
against a low DC, and the target's Hidden condition is correctly cleared.

## NPCs, monster/NPC inventory, and full Antimagic Field enforcement (v120.184)

**NPCs.** A DM-authored NPC is a `net.session.monsters`-shaped entry — same array, same
`dmMonsterAttack`/`BRAINS` AI, same `Engine.attack`/`hitResult` — carrying `isNpc:true`, a
`race` (from `RACE_TRAITS`, flavor/display only, not mechanically applied — no clean combat
hook for most racial traits in this engine), and, critically, a REAL per-ability `abilities`
object set at creation time rather than the flat CR-scaled value monsters fall back to
(`deriveMonsterAbilities`'s own `if(!mo.abilities) return mo;` guard makes this a permanent
no-op for NPCs). This is the direct payoff of the earlier creature-unification work: a noble
with CHA 18 / STR 8 gets that asymmetry reflected in every skill check and save with zero new
engine math, since `unitSkillRoll`/`abil`/`mod` already read whatever `abilities` shape they're
given. New `openNpcBuilder()` modal (name, race, 6 ability inputs, AC/HP/speed, a free-text
attack line in the exact same format `parseMonsterAttacks` already parses) reachable via a new
"🧑 New NPC" button next to Bestiary in DM mode; `openMonsterSheet` shows race + individual
ability scores for `isNpc` entries instead of the CR-derived block monsters show.

**Monster/NPC inventory.** `mo.items` — a plain `{name,qty}` array, deliberately NOT the PC
equipment system (`kind`/`equipped`/mods driving `computeAC`/attacks): monster and NPC AC and
attacks are already hand-authored fields, not derived from worn gear, so this is pure loot
bookkeeping ("what does this creature carry / drop on death"), not a stats-affecting equip
system. New `openMonsterLoot(mo)` modal (add via free text or a `WEAPONS`/`ARMOR` quick-pick,
remove per row) behind a new 🎒 button in the roster row.

**Antimagic Field, full enforcement.** Previously only blocked new spellcasting inside its
zone (the `SPELL_NOCAST_ZONE` no-cast mechanism, shared with Silence). Real RAW also suppresses
already-active magical effects on anyone standing inside — added `inAntimagicField(s,x,y)`,
checking the hazard's `name` specifically (`==='Antimagic Field'`) rather than the generic
`noCast` flag Silence shares, since Silence must never suppress a buff, only block new casts.
`computeAC`/`effSpeed` gained an optional `opts.ignoreEffects` — when true, every active-effect
contribution (Shield/Shield of Faith's flat AC, Mage Armor's base swap, Barkskin's 16 floor,
Haste's speed double) is skipped while mundane sources (worn armor, Dex, Defense fighting
style, equipment) still apply, matching RAW ("magic" specifically is what's suppressed). This
is additive-only — the 13 pre-existing `effBonus`/`effSpeedMul`/`computeAC` call sites (almost
all PC-sheet display views with no battle-position concept at all) never pass `opts` and are
byte-identical to before. Wired into the two places that actually have both a live map and the
acting creature's position: `qbAC`/`playerNetAdapter.ac` (a live attack's AC lookup) and QB's
`qbBeginTurn`/player-net's `renderPlayerBattle` (the turn's movement budget, via `effSpeed`).
**Documented limitation**: doesn't disable magic items (this app doesn't track item
"magicalness" as a distinct flag anywhere) and doesn't banish summoned creatures while inside —
both a materially bigger scope for a spell cast rarely enough that this is a deliberate cut.

Tests: `inAntimagicField` correctly distinguishes itself from Silence's shared `noCast` flag;
`computeAC`/`effSpeed` with `ignoreEffects` drop Shield of Faith/Barkskin/Haste while leaving
mundane AC untouched; an end-to-end `qbAC` test confirms a buffed PC's AC actually changes
between standing inside vs. outside a live-painted Antimagic Field zone. Also spot-verified
live in a real browser (not just the eval'd test-harness copy): the same buffed-PC-in/out-of-
field scenario run directly against the served `index.html`'s `QB`/`qbAC` confirms AC 12→10→12.

## Explicit "roll" step for Use-menu maneuvers, and a new Taunt action (v120.185)

**Every skill-based Use-menu action used to roll the instant you tapped it** — Shove/Grapple/
Escape/Hide/Recall Knowledge/Stabilize collapsed pick-target, roll, and result into one click,
with no visible "this is the moment of the die lands" beat, unlike the DM's own attack modal
(pick attack → confirm target → **tap "🎲 Roll to hit"** → see the result). Every one of those
now routes through a new `confirmRoll` view first — a short description of what's about to
happen plus an explicit `🎲 Roll <Skill>` button — and the actual `maneuverX(...)` call (and
the dice) only fires on that tap. The maneuver functions themselves are unchanged (still
resolve roll+apply atomically in one call, no split return-then-apply phases like Attack's
damage step needs) — this is purely a UI-pacing fix: an extra confirm screen in front of the
existing atomic call, not a resolver rewrite.

**New Taunt action.** Not a core 5e rule (5e has no built-in "Taunt"), but a well-understood
variant built on the *exact* same opposed-check + impose-a-condition machinery Shove/Grapple
already use: `maneuverTaunt` rolls Intimidation (Cha) vs the target's Insight (Wis); success
imposes Frightened for 3 rounds (matching this app's existing default-condition-duration
convention). Costs one of the actor's attacks — the same resource class as Shove/Grapple in
the same foe menu, not a separate Action. Reachable from the Use menu's foe submenu alongside
Shove/Grapple/Recall Knowledge. Persuasion/Deception weren't added alongside it: neither has an
established mechanical effect against a *hostile* monster mid-combat in this engine (no NPC
disposition/attitude system exists to talk one down), so adding them now would mean inventing
mechanics with no clear right answer rather than reusing an established pattern — left for a
follow-up if a concrete use case comes up.

Tests: the existing Shove/Grapple/Escape fixture is reused for `maneuverTaunt`'s success case
(imposes Frightened, spends an attack, reports Intimidation/Insight in its roll info) and
failure case (target unaffected). Also spot-verified live end-to-end via Playwright against the
real running app: opening the Use menu, picking a foe, tapping Taunt shows the confirm screen
with *zero* roll having happened yet (target's conditions still empty), and only tapping
"🎲 Roll Intimidation" actually rolls, applies Frightened, and spends the attack.

## Echo Knight — the first subclass with real mechanics (v120.186)

**Audit finding that started this**: no subclass in this app affected combat math before this —
`c.subclass` was read in exactly one place (sheet display text). Champion's Improved Critical,
Battle Master's maneuver dice, all of it: cosmetic labels only. Echo Knight is the first
subclass to get real mechanics; a new `SUBCLASS_FEATURES` table (keyed by subclass name,
merged into the sheet's existing features list alongside `CLASS_FEATURES`) is the natural home
for whichever subclass gets implemented next.

All six real Echo Knight (Explorer's Guide to Wildemount) features are implemented, confirmed
against the source via web search before building:

- **Manifest Echo (3rd)**: `manifestEcho` creates a real monster-shaped `s.monsters` entry
  (`echo:true`, `ally:true`, `brain:'passive'`, AC 14+prof, 1 HP) — reuses the same battlefield/
  targeting infrastructure every other creature in this app already has, but does NOT get an
  initiative-order slot (unlike `spawnSummon`'s spell-summons) since it never acts on its own
  turn. Condition immunity is a one-line `if(u.echo) return;` guard added to all three adapters'
  `addCond`. Move up to 30 ft (`echoMoveTiles`, free — a deliberate difference from the Unseen
  Servant's move-also-costs-the-bonus-action simplification, since RAW genuinely doesn't gate
  the echo's move and an Echo Knight needs their bonus action free most turns). Teleport-swap
  (bonus action, costs 15 ft movement) correctly resolves the REAL live position in player-net
  (`s.players.find(p=>p.id===net.peer.id)`, not the throwaway `Object.assign` copy
  `openAdjacentUseUI` receives as `me` for adapter purposes — a real bug caught before it shipped).
  Auto-dismiss on incapacitation is checked at the Use-menu's own open, not threaded through
  every condition-application call site — a documented simplification.
- **Unleash Incarnation (3rd)**: one extra attack when you take the Attack action, from the
  echo's own square. Resolved via `Engine.attack(ad, echo.id, targetId, atk)` — passing the
  echo's real id as `actorId` makes the engine's existing range/melee/cover math measure from
  the echo's position for free (no new targeting-origin code needed), while `atk` still carries
  the Knight's real weapon stats. Uses = CON mod (min 1), long-rest only.
- **Echo Avatar (7th)**: action, once per rest, applies Blinded+Deafened for 60 rounds (10 min).
  Two effect entries (one per condition) rather than a new multi-condition effect shape, so the
  existing round-countdown/expiry machinery (keyed on one `cond` per effect) clears both
  together with zero new expiry code.
- **Shadow Martyr (10th)**: the one feature that needed a real design compromise. A true
  "reactive interrupt before an attack resolves" doesn't exist anywhere in this app — building
  one would mean converting `qbResolveAttack`'s monster-attack branch from synchronous to async.
  Implemented instead as a player-controlled arm/disarm toggle (`c.shadowMartyrArmed`, set
  ahead of time from the echo's Use-menu): while armed, the next attack landing on the Knight
  within 5 ft of the echo is silently redirected to the echo's square/AC, consuming the reaction
  and the once-per-rest use. Preserves real player agency (arm it when you expect a big hit)
  without a live mid-roll prompt UI.
- **Reclaim Potential (15th)**: 2d6+CON temp HP when the echo is actually destroyed (0 HP from
  damage — not a voluntary dismiss, PHB is specific about this), only if the Knight has none
  already. Hooked into `qbResolveAttack`'s hit-resolution, checked generically on `tgt.echo &&
  tgt.hp<=0` so it fires whether the echo died via Shadow Martyr's redirect or a monster
  choosing to attack it directly. Uses = CON mod (min 1), long-rest only.
- **Legion of One (18th)**: `manifestEcho` already caps at 1 echo per controller; at 18th the
  cap becomes 2, and manifesting a third wipes both existing ones (matches the RAW wording
  literally rather than "displace only the oldest"). Rolling initiative (`startBattle`/
  `startQuickBattle`) restores one Unleash Incarnation use if the pool is at 0.

**Explicitly out of scope for this pass**: DM-hosted mode (a monster attacking a *connected
player* Echo Knight, as opposed to QB's solo PC) isn't wired up — Shadow Martyr and Reclaim
Potential's hooks live in `qbResolveAttack`, QB-only. Extending to DM-hosted would need the same
DM-can't-resolve-player-state round-trip pattern established for `maneuverCheck` earlier this
session; flagged as a real follow-up, not silently skipped.

Tests: 24 new assertions across all six phases — the echo's real RAW stat block and initiative-
order exclusion, condition immunity on all three adapters, 30 ft movement range, Legion of One's
1→2→wipe-both-at-3 cap math, an end-to-end `Engine.attack` proving a target only the echo (not
the Knight) is adjacent to is still reachable, Echo Avatar's twin-condition expiry, Shadow
Martyr's arm/redirect/range-gate/one-use-per-rest logic, Reclaim Potential's temp-HP math and
"only if you have none" gate, and Legion of One's initiative-roll refill. Playwright wasn't
available to spot-check live in a real browser this pass (the MCP server disconnected mid-
session) — noting this honestly rather than claiming a check that didn't happen.

## Echo Knight — DM-hosted wiring, and unifying Shadow Martyr (v120.187)

Follow-up to the previous entry, which shipped Echo Knight for QB and player-net only. Two
real gaps closed:

**The echo now exists on the DM's own authoritative map.** Every echo mutation (manifest/move/
teleport-swap/dismiss) previously only touched the connected player's own local mirror of
`net.session` — invisible to the DM and every other player, since nothing broadcasts a player's
local edits back to the DM automatically. New `echoSync` message (player → DM, sent from all
four `openAdjacentUseUI` echo handlers) creates/updates/removes a real `net.session.monsters`
entry for the echo, applied in `dmOnData` and rebroadcast — the same "player mutates locally
for instant feedback, then a message makes the DM's copy (and everyone else's) match" shape
used throughout this app. `shadowMartyrArmed` rides along on `playerHello()`'s existing payload
(same slot as `sanctuaryDC`/`hiddenDC`) so the DM knows whether to check for a redirect at all.

**Shadow Martyr was accidentally built as two parallel functions** (`shadowMartyrRedirect` for
QB, `dmShadowMartyrRedirect` for DM-hosted) instead of one shared resolver — caught and fixed
after being called out directly. Every other Echo Knight feature was already properly unified
(Manifest Echo/Unleash Incarnation/Echo Avatar all live in `openAdjacentUseUI`, shared by QB and
player-net's `mode` branching from day one); Shadow Martyr was the one exception, because its
DM-hosted half needed a fundamentally different data source (a synced mirror field instead of
the real character object) and that got modeled as a whole separate function instead of a
branch inside one. Now a single `shadowMartyrRedirect(s, tgt)` handles both: `tgt.c` present
means the real character is available locally (QB) and the reaction/once-per-rest bookkeeping
happens right there; `tgt.c` absent means DM-hosted's mirror-only case, where only the DM's own
copy of the flag clears and a `shadowMartyrTriggered` message tells the player's real device to
spend the reaction/use on the real character. Both `qbResolveAttack` and `dmMonsterAttack`'s
`#maRoll` handler now call the exact same function. Reclaim Potential's DM-hosted path was
already correctly shaped this way from the start (one `reclaimPotential(c,log)` function, called
directly in QB or triggered via an `echoDestroyed` round-trip for DM-hosted) — not a case that
needed fixing, just confirms the pattern was already right there.

Tests: `echoSync`'s create/update/remove all verified directly against `dmOnData` with a real
`net.session` fixture, confirming the synced echo is genuinely monster-shaped
(`side:'mon'`/`ally:true`) so the DM's own targeting/rendering code treats it like any other
creature; `shadowMartyrRedirect` re-verified against a DM-hosted-shaped mirror entry (no `.c`
field) covering not-armed/armed-in-range/disarms-after-triggering, alongside the pre-existing
QB-shaped coverage — same function, both shapes.

## Path of the Berserker — second subclass with real mechanics (v120.188)

Second entry in `SUBCLASS_FEATURES`, part of a planned pass giving one iconic subclass per
class real mechanics (Echo Knight/Fighter already done). All four 2014 PHB Berserker features,
confirmed via web search before building (this app's baseline is 2014 5e, not the 2024
revision, which changes Frenzy substantially):

- **Frenzy (3rd)**: a real CHOICE made when you rage, not automatic — `toggleRage(c, frenzy)`
  gained an optional param (every existing call site across QB and player-net — `#rageBtn`/
  `#rageBtn2`/`#pbRage`, already shared with zero mode-specific code since Rage never touches
  anything but the caster's own `c` — stays byte-identical by not passing it). A new
  `rageButtonClick(c)` is what the 3 buttons actually call now: for an eligible Berserker
  starting a fresh rage it shows a real "Rage" vs. "Rage + Frenzy" choice; everyone else (or
  ending a rage) is still the original single tap. While frenzied, a "🩸 Frenzy Attack" option
  appears in the Use menu's foe list (bonus-action melee attack, reusing `Engine.attack` the
  same way Unleash Incarnation does); ending a frenzied rage costs exactly 1 level of
  exhaustion.
- **Mindless Rage (6th)**: immunity to Charmed/Frightened while raging, entering a rage
  suspends (not cures) an existing one. New `mindlessRageBlocks(c,cond)` is checked at the two
  real PC-condition-application choke points: `qbAdapter.addCond`'s PC branch (QB, and DM-
  hosted monsters attacking the QB solo PC) and player-net's own `'cond'` message handler
  (DM-hosted monsters attacking a *connected* player, since that condition actually lands on
  the player's own device, not the DM's mirror) — both modes covered from the start this time,
  not bolted on after the fact like Shadow Martyr was.
- **Intimidating Presence (10th)**: the first maneuver in this app with a REAL fixed-DC save
  (8+prof+Cha) checked against the target's own Wisdom save bonus via `ad.saveBonus` — the same
  adapter method Sanctuary/Holy Aura already use for this exact shape — rather than an opposed
  check like Taunt/Shove. Also the first maneuver with a 30 ft (6-tile) range instead of
  adjacency-only, needing its own target list (`intimidateTargets`) separate from the existing
  5-ft `foes` list. A successful save marks the target immune for the rest of the encounter — a
  documented approximation of the real 24-hour window, since battles in this app don't span
  real hours.
- **Retaliation (14th)**: a "🩸 Retaliation" foe-menu option once armed at 14th, spending the
  reaction for a melee attack — implemented as a player-triggered option rather than an
  automatic post-damage prompt (this app has no "you just took damage, react now?" interrupt
  system at all — see Shadow Martyr's own doc note on why building one is a bigger lift than
  this pass), a documented simplification of RAW's precise "when you take damage" trigger.

Tests: 20 new assertions — Frenzy's exhaustion cost and the no-arg-callers-unaffected guarantee,
Mindless Rage blocking Charmed/Frightened but not unrelated conditions (both standalone and
wired through the real `qbAdapter.addCond` path), Intimidating Presence's pass/fail/already-
immune states and its 30-ft reach.

## College of Lore — third subclass, and Bardic Inspiration's resource pool (v120.189)

Third entry in `SUBCLASS_FEATURES`. Building Cutting Words/Peerless Skill first required
mechanizing **Bardic Inspiration itself**, which — like every subclass feature before this
session — had only ever been flavor text in `CLASS_FEATURES` for the base Bard class. Scoped
narrowly: `bardicInspMax(c)` (CHA mod, min 1 use per rest) and `bardicInspDie(c)` (the real PHB
d6→d8→d10→d12 progression by level) are the whole pool — NOT the base class's own "give an ally
a die to hold for up to 10 minutes" grant-and-redeem mechanic, since neither Lore subclass
feature actually needs that shape (both spend a use for an *immediate* effect). Refills on long
rest always; short rest too once Font of Inspiration (5th level, already flavor-text-only in
`CLASS_FEATURES`) applies.

- **Bonus Proficiencies (3rd)**: a one-time `{t:'skill', n:3}` entry pushed into
  `pendingChoiceSpecs` — the exact same choice-queue shape Half-Elf/Variant Human's bonus
  skills already use, so this needed zero new picker UI, just another spec and a
  `c.loreBonusProfsChosen` flag so it only ever fires once.
- **Cutting Words (3rd)**: reaction, reduces a monster's attack roll within 60 ft — scoped to
  attack rolls specifically (RAW also covers ability/damage rolls; same "highest-value case,
  not every RAW variant" pragmatism as Shadow Martyr's own doc note). **Unified across QB and
  DM-hosted from the start this time**: `cuttingWordsReduce(s, mo, atk, candidates)` takes a
  `candidates` array (QB's single-PC array, or DM-hosted's real `net.session.players`) and
  checks each the same way — `cand.c` present means the real character is available locally
  (QB), absent means DM-hosted's mirror-only case with a `cuttingWordsTriggered` round-trip
  message, the exact same branch shape `shadowMartyrRedirect` established. Armed via the same
  arm/disarm toggle pattern; mutates a *cloned* `atk` object in QB's `qbResolveAttack` (never
  the shared/cached one `parseMonsterAttacks` produces) and a freshly-built one in
  `dmMonsterAttack`'s `#maRoll`.
- **Additional Magical Secrets (6th)**: learn 2 spells from any class. Not a dedicated picker —
  the existing spell-adding dropdown's "+ Custom spell…" free-text option (`renderSpells`,
  already there for any character) already lets a player add any spell by name unrestricted by
  class; a nicer cross-class *picker* specifically for this feature would be a pure UI nicety,
  not a missing mechanic, so it's left as a documented "already achievable, not polished."
- **Peerless Skill (14th)**: self-only, rolls a Bardic Inspiration die and reports it as a bonus
  to apply to your next ability check. This app has no universal "roll any skill check" UI hook
  a temporary bonus could attach to automatically, so the die is surfaced via flashBanner/log
  for the player to apply manually — a real, honest simplification given that infrastructure
  gap, not a missing mechanic being silently skipped.

Tests: 18 new assertions — the Bardic Inspiration pool's CHA-mod sizing and level-based die
progression, Bonus Proficiencies' one-shot choice-spec gating, and `cuttingWordsReduce` verified
against BOTH candidate shapes (QB's `.c`-bearing wrapper and DM-hosted's `.c`-less mirror entry)
covering not-armed, range-gating, and the actual roll-reduction/resource-spend/disarm sequence
for each.

## Life Domain — fourth subclass, and Channel Divinity's resource pool (v120.190)

Fourth entry in `SUBCLASS_FEATURES`. Like Bardic Inspiration before it, **Channel Divinity**
itself (Cleric, 2nd level) had only ever been flavor text in `CLASS_FEATURES` — mechanized here
because Preserve Life spends a use of it: `channelDivinityMax(c)` is the real PHB progression (1
use, 2 at 6th, 3 at 18th), refilling on short OR long rest (`spendHitDie` and the `#restBtn`
long-rest handler both reset `c.channelDivinityLeft`, matching every other per-rest resource
pool this session).

Verified real 2014 PHB mechanics via WebFetch (`dnd5e.wikidot.com/cleric:life`) before building,
including a targeted follow-up fetch after the first search result blurred Disciple of Life and
Blessed Healer together — they're genuinely different triggers/beneficiaries (target vs. caster).

This app's healing has never had an auto-apply-to-target pipeline the way `Engine.attack` exists
for damage — every healing spell shows a rolled dice notation (`m.heal`, from
`parseSpellMechanics`) in `castModal` and is applied manually via the existing Heal button. Four
of the five Life Domain features hook into that same notation/rider surface rather than inventing
new plumbing:

- **Disciple of Life (1st)**: a 1st-level-or-higher healing spell's target gets `+2 + spell
  level` extra HP, baked directly into `m.heal`'s notation string in `castModal` — the exact same
  technique the app already used for Cure Wounds' "+ spell mod" (line ~2794); this reuses the
  spell's base level, not a live-upcast level, since the modal doesn't re-render when the cast-at
  slot dropdown changes (same limitation that existing spell-mod bonus already has).
- **Channel Divinity: Preserve Life (2nd)**: the first *real* HP-distribution feature in this
  app (Lay on Hands, structurally identical, has only ever been flavor text) — a new Use-menu
  action, gated `isLifeCleric(c,2)` and a `channelDivinityLeft` use. Opens a picker of targets
  within 30 ft (self always; other connected party members too in player-net — Quick Battle is
  solo, so self is the only real target there, the same limitation Stabilize already documents).
  Each tap gives a target the maximum the rules allow rather than an arbitrary typed amount — no
  numeric-input UI exists anywhere else in this app's Use menu, so this stays consistent with
  every other one-tap maneuver instead of adding the first free-text amount field. The capping
  math is its own pure, tested function, `preserveLifeAmount(pool, hpMax, healedSoFar)`. Healing
  a DIFFERENT connected player needs a network round-trip — the caster's device can't mutate
  another player's real character — and reuses the **existing generic `'apply'` message**
  (already used for DM-driven HP deltas) rather than inventing a new one: the DM relays
  `{t:'apply', delta}` to the target's device, which applies it and resyncs via `playerHello()`,
  identical to how Stabilize's `'stabilize'`→`'stabilized'` round-trip already works.
- **Blessed Healer (6th)**: shown as its own info card in `castModal` (not merged into `m.heal`,
  since that number is the *target's* healing, not the caster's) telling the player they also
  regain `2 + spell level` HP if the spell healed someone else — applied manually via the Heal
  button like everything else in this feature. This app's healing modal has no target-tracking at
  all (see above), so the "someone else" condition can't be mechanically enforced; documented as
  a real, honest simplification rather than silently building fake enforcement.
- **Divine Strike (8th)**: a new once-per-turn `afDivStrike` checkbox in `attackFlow`'s damage
  step, the exact same rider slot Sneak Attack/Divine Smite already occupy — 1d8 radiant (2d8 at
  14th) on a weapon hit, resets every turn via `freshTurnState`'s new `divineStrikeUsed` flag.
- **Supreme Healing (17th)**: every die in a healing spell's notation is maximized instead of
  rolled. New pure helper `maxNotation(notation)` (mirrors `rollNotation`'s dice-parsing but sums
  each die's max face instead of rolling) replaces `m.heal` with its already-maximized flat total
  in `castModal` — the auto-roll button then just returns that fixed number, and manual entry
  still works exactly as before.

Tests: 12 new assertions — `isLifeCleric` gating, `channelDivinityMax`'s 1/2/3-use progression,
`preserveLifePool`'s 5×level math, `preserveLifeAmount`'s three caps (pool remaining, half max
HP, already-given-this-casting), and `maxNotation` against both a dice+flat notation and a bare
flat number. Disciple of Life/Blessed Healer/Divine Strike/Supreme Healing themselves are baked
into `castModal`/`attackFlow` — UI-embedded like the pre-existing Sneak Attack/Divine Smite
riders, which this app has never unit-tested either (no DOM-inspectable harness for those modals);
only the pure helpers extracted for them are covered here, consistent with that existing boundary.

Playwright wasn't available to spot-check any of this live in a real browser this pass (the MCP
server disconnected mid-session, same as every subclass since Echo Knight) — noting this honestly
rather than claiming a check that didn't happen.

## Circle of the Moon — fifth subclass, and Wild Shape itself (v120.191)

Fifth entry in `SUBCLASS_FEATURES`, and the first of the twelve where the SUBCLASS wasn't the
hard part — **Wild Shape**, the base 2nd-level Druid feature every earlier subclass in this pass
got to skip, had never been mechanized at all (`CLASS_FEATURES` had flavor text only, same as
every other base-class prerequisite this session — Bardic Inspiration, Channel Divinity — had to
be built from scratch first). Verified real 2014 PHB text before building (a research pass
flagged and corrected two premises this task started with: Circle Forms only overrides the CR
cap, not the fly/swim-by-level restriction; and Circle of the Moon grants **no extra Wild Shape
uses** over the base class's flat 2 — its entire advantage is *what* you can become and *when*).

This app's bestiary (`MONSTERS_5E`) is curated for DM encounters (goblins, undead, dragons) and
had zero actual beasts or elementals in it — a real content gap, not just a wiring one. Added two
small curated catalogs following the exact same condensed-stat-block convention `MONSTERS_5E`
already uses: `BEAST_SHAPES` (8 beasts spanning CR 1/8–2: Giant Rat through Giant Elk) and
`ELEMENTAL_SHAPES` (the 4 named CR-5 elementals Elemental Wild Shape grants access to as a
special case, ignoring the normal CR cap entirely per RAW).

- **Wild Shape (base, 2nd)**: transforming gives the beast its own separate HP pool
  (`c.wildShape={name,hpCur,hpMax,ac,atk,speed}`) — `applyHp` grew a dedicated branch at the very
  top that redirects all damage/healing to this pool instead of touching `c.hp` at all while it's
  set, so none of the existing death-save/rage-resistance/concentration logic below needs to know
  Wild Shape exists. When the beast pool is destroyed, the PHB's "excess damage carries over"
  rule fires exactly as written: the overflow amount is applied to your REAL hp via a normal
  recursive `applyHp` call, which correctly triggers real death saves if that overflow is what
  finishes you off. `computeAC`/`effSpeed` both defer to the beast's own AC/speed the instant
  `c.wildShape` is set — centralized there rather than at every call site, so every existing
  screen that already calls those two functions picked this up for free. Your attack options
  become the beast's own (`wildShapeAttacks(c)`, parsed via the same `parseMonsterAttacks` the
  bestiary already uses for monster-vs-party attacks) — unified from the first draft between QB's
  `qbPcAttacks` and player-net's separately-coded `playerAttackMenu`, both of which now check
  `c.wildShape` before falling back to their own (pre-existing, still-separate) weapon-listing
  logic.
- **Circle Forms (2nd/6th)**: `moonMaxCR(c)` — CR 1 below 6th level, `⌊level/3⌋` at 6th+, exactly
  the PHB formula. A non-Moon Druid still gets working Wild Shape too (the base feature, gated
  only on level 2/4/8 CR steps) since it's a real base-class feature, not something exclusive to
  this pass's one chosen subclass — matching how Bardic Inspiration/Channel Divinity work for
  ANY Bard/Cleric, not just Lore/Life.
- **Combat Wild Shape (2nd)**: transforming costs a bonus action instead of an action for Moon
  druids (`isMoonDruid(c,2)` branch in the same `openWildShapeUI` modal that handles the whole
  feature). While shapeshifted, a bonus action + a spent spell slot heals `1d8` per slot level
  into the beast's pool via `applyHp` — same slot-tracking idiom Divine Smite/Cutting Words
  already use.
- **Primal Strike (6th)**: documented as a real "nothing to build" simplification, not a missing
  mechanic quietly skipped — this app's `MONSTER_RVI` table has no monster anywhere with
  resistance/immunity to *nonmagical* damage specifically (only damage-type resist/vuln/imm is
  tracked at all), so "counts as magical" has no mechanical hook to attach to yet.
- **Elemental Wild Shape (10th)**: same transform modal, gated `isMoonDruid(c,10)` and 2 spent
  uses instead of 1, offering the 4-entry `ELEMENTAL_SHAPES` list — the named RAW exception that
  ignores `moonMaxCR` entirely.
- **Thousand Forms (14th)**: cast Alter Self with no spell slot expended. `canCast`/`castSpell`
  grew a narrow `thousandForms`/`freeSlot` bypass distinct from the existing Wish-duplication
  bypass (`wishFreeName`) — Wish is a fully free cast (no slot AND no action), but Thousand Forms
  only waives the *slot*; the action-economy spend and the "must be prepared" check both still
  run normally. A nice side effect: `hasNaturalWeapons(c)` (the Claws attack option, added
  earlier this session for ordinary Alter Self) already keys off having the Alter Self *effect*
  active, so it works for a Thousand-Forms cast with zero extra code.
- **DM-hosted sync**: `playerHello()`'s payload now reports the beast's `hpCur`/`hpMax` (via
  `computeAC`'s existing centralization, AC already came along for free) instead of your real
  hidden HP while shapeshifted, plus a `wildShapeName` field so the DM's mirror knows you're
  currently a beast — same `hello`/`Object.assign` sync path every other per-player flag
  (`sanctuaryDC`, `cuttingWordsArmed`, …) already uses.

Tests: 15 new assertions — `isMoonDruid`/`moonMaxCR`/`wildShapeMax` gating and the flat-2-uses
correction, `computeAC`/`effSpeed` deferring to the beast while shapeshifted, `wildShapeAttacks`
parsing a real attack string, `qbPcAttacks` deferring to it, `applyHp`'s beast-pool damage/heal/
overflow-carries-to-real-HP sequence, and Thousand Forms' slot-free bypass contrasted against a
13th-level Moon druid with the same slots exhausted (still blocked).

Playwright wasn't available to spot-check this live in a real browser either (server still
disconnected) — same honest caveat as every subclass since Echo Knight.

## Deploy pipeline fix: GitHub Pages was building from the wrong branch (v120.191 → live)

Separately from any subclass work: the live GitHub Pages site had been showing v120.179 for the
entire back half of this session, reported each time as an assumed caching/propagation delay.
That diagnosis was wrong. `git merge-base` between `iso3d-engine` (where every push this session
landed) and `claude/elegant-bohr-zx67jk` (the branch Pages actually builds from) showed the two
had NOT diverged at all — `elegant-bohr-zx67jk` was sitting exactly at the point `iso3d-engine`
branched off from it, 13 commits behind, every one of them touching only `dnd-character/*`. None
of this session's dnd-character work had ever reached the branch Pages deploys. Fixed with a
plain fast-forward push (`iso3d-engine` → `claude/elegant-bohr-zx67jk`, zero conflicts possible
since the target had no unique commits of its own), confirmed via the GitHub API that the branch
now points at the same commit as `iso3d-engine`. Flagging this so future sessions push to (or at
least also verify against) `claude/elegant-bohr-zx67jk`, not just `iso3d-engine`, when checking
whether something actually went live.

## Way of the Open Hand — sixth subclass, and Martial Arts/Ki/Unarmored Defense (v120.192)

Sixth entry in `SUBCLASS_FEATURES`. Like Wild Shape before it, this pass hit ANOTHER base-class
gap bigger than the subclass itself: **Martial Arts, Ki (Flurry of Blows/Patient Defense/Step of
the Wind), and Unarmored Movement** were all flavor-text-only in `CLASS_FEATURES`, and — a
separate, real pre-existing bug found while investigating — **Unarmored Defense** (Barbarian's
Con version AND Monk's Wis version, both 1st-level base-class features) had never been implemented
either, meaning every Barbarian and Monk in this app has been walking around with an AC that's
just `10 + Dex` this whole time, missing their signature bonus. All fixed together in `computeAC`.
Verified real 2014 PHB text via WebFetch before building.

- **Unarmored Defense**: `10 + Dex + Con` for Barbarians (a shield is explicitly still allowed
  per RAW), `10 + Dex + Wis` for Monks (no shield, RAW is explicit this one breaks it) — both new
  branches at the top of `computeAC`, so every existing screen that calls it picked the fix up
  for free, the same centralization Wild Shape's AC override relied on last time.
- **Martial Arts**: `martialArtsDie(c)` (1d4→1d6→1d8→1d10 by level) and `martialArtsUnarmedAtk(c)`
  (uses whichever of Str/Dex is better) replace the flat "1 + Str mod" unarmed strike fallback —
  shared between `qbPcAttacks` and `playerAttackMenu` (both pre-existing separate weapon-listing
  functions, same duplication `wildShapeAttacks` had to bridge for Wild Shape) so a Monk sees the
  same scaling attack option in either mode.
- **Ki**: `kiMax(c)` (= monk level) and `kiDC(c)` (8+prof+Wis, shared by every ki-spending
  feature — base Stunning Strike still isn't built, but Open Hand's own features all key off this
  same DC) refill on short or long rest. **Patient Defense** and **Step of the Wind** live in a
  new `openKiUI` modal reachable from a battleCard quick-menu button (mirrors how Wild Shape got
  its own button) — Patient Defense applies a real `Dodge` condition via `addEffect` (a NEW
  disadvantage-on-attackers check added to `attackAdvantage`, since nothing in this app tracked
  Dodge at all before now); Step of the Wind is banner/log-only (documented — Dash/Disengage/jump
  distance have no mechanical hooks anywhere in this app to attach a real bonus to, the same
  honest-simplification bar as Peerless Skill).
- **Open Hand Technique (3rd)**: offered on a Flurry of Blows hit via a new `flurryTechnique`
  Use-menu picker (choose Prone/Push/Deny-Reactions *before* rolling, since the app has no
  "decide after you already know you hit" flow anywhere — a pragmatic, not RAW-breaking,
  simplification: the choice itself carries no new information either way). Prone uses a Dex
  save, Push a Str save (PHB is explicit these differ) against the monk's ki DC; "deny reactions"
  reuses the exact `mo.reactionUsed=true` idiom Shocking Grasp's own "No Reactions" condition
  already established elsewhere in this file, rather than inventing a new tracked condition.
- **Wholeness of Body (6th)**: action, no ki, regain 3×level HP, gated on a `wholenessUsed` flag
  reset only on long rest — lives in the same `openKiUI` modal.
- **Tranquility (11th)**: re-applied automatically at the end of every long rest, granting the
  real **Sanctuary** effect by name (not a separately-named "Tranquility" effect) so every
  existing Sanctuary-aware check (`sanctuaryDC`, the attacker-save gate, `dmOpportunityAttack`'s
  block) recognizes it for free — same non-enforcement of "ends when you attack/cast" this app's
  own Sanctuary spell already has (no such hook exists anywhere in this codebase), a pre-existing
  simplification, not a new gap.
- **Quivering Palm (17th)**: `quiveringPalmStrike` (3 ki spent only on an actual hit, marks
  `mo.quiveringPalmBy`) and `quiveringPalmTrigger` (Con save vs the same ki DC — fail drops the
  target to exactly 0 HP via `ad.hurt(mo, mo.hp)`, success deals 10d10 necrotic) as two separate
  foe-menu options. RAW's "within your next `level` days" window is approximated as "until you
  trigger it or set a new one" — this app has no multi-day out-of-combat clock, the same
  approximation Intimidating Presence's 24-hour window already uses for its own duration.

Tests: 26 new assertions — `martialArtsDie`'s progression, `kiDC`/`kiMax`, `martialArtsUnarmedAtk`
choosing the better ability score, both Unarmored Defense formulas (including the shield-breaks-
Monk-but-not-Barbarian distinction) via real `computeAC` calls, `unarmoredMoveBonus`'s level
breakpoints and armor gating, `flurryOfBlows` against a real QB fixture (ki/bonus-action spend,
two real attack rolls, second-use lockout), `openHandTechnique`'s prone/push/no-reactions branches
each verified via a real save roll, and `quiveringPalmStrike`/`quiveringPalmTrigger`'s hit-gated
ki spend and kill-vs-damage branches.

Playwright wasn't available to spot-check this live either (server still disconnected).

## Oath of Devotion — seventh subclass, and Divine Sense/Lay on Hands/Channel Divinity (v120.193)

Seventh entry in `SUBCLASS_FEATURES`. Divine Smite was the one base Paladin feature already real
(the `afSmite` rider in `attackFlow`); **Divine Sense, Lay on Hands, and base Channel Divinity**
were all flavor-text-only before this pass, same gap shape as every earlier base-class
prerequisite this session. Verified real 2014 PHB text via WebFetch before building.

- **Divine Sense (1st)**: `divineSenseMax(c)` = 1+Cha mod, long-rest-only refill (confirmed via
  research — unlike most other resource pools this session, this one does NOT refill on a short
  rest). Action, spends a use, banners/logs which monsters within 60 ft are undead or fiends.
  Needed real monster-type data this app never tracked (`MONSTERS_5E` has no type column at
  all) — added `monsterIsUndead`/`monsterIsFiend`, inferring type from the existing `sprite` key
  (skeleton/zombie/ghost → undead, demon → fiend) rather than adding a whole new data column,
  the same minimal-footprint approach `BEAST_SHAPES` took for Wild Shape's missing beast data.
- **Lay on Hands (1st)**: a real `layOnHandsLeft` pool (5×level, long-rest only), spent via a new
  target picker with a typed HP amount — the first real numeric-amount-typed heal in this app
  (Preserve Life deliberately avoided one, since RAW lets it be sized per-target; Lay on Hands'
  RAW literally is "restore any number of hit points, up to what's left in the pool," so a typed
  amount is the correct fit here, not a missing-input-field shortcut). Healing a DIFFERENT
  connected player reuses the exact round-trip Preserve Life established — renamed that message
  from `preserveLifeApply` to the generic `healApply` since it's now shared by two features (DM
  relays the existing generic `'apply'` message to the target's own device either way). A 5-HP
  disease/poison cure option spends from the same pool without healing.
- **Channel Divinity (3rd)**: `paladinCDMax(c)` is a flat 1 (a real, verified distinction from
  Cleric's growing 1→2→3 pool — Paladins never get more CD uses from the base class), refilling
  on short or long rest, tracked in its own `paladinCDLeft` field so it can't collide with
  Cleric's `channelDivinityLeft`.
  - **Sacred Weapon**: a new self-contained check in `weaponToHit` (`+Cha mod, min +1, while a
    'Sacred Weapon' effect is active`) — the first attack-roll-modifying effect anywhere in this
    app; scoped as a single inline check rather than a new generic `mods.atk` effect field, since
    nothing else needs one yet (the same "don't build for a hypothetical second user" call as
    everywhere else this session).
  - **Turn the Unholy**: Wisdom save (DC = paladin spell DC) for every fiend/undead within 30 ft;
    a failed save applies Frightened — RAW's actual "Turned" condition (must flee, can't take
    reactions, Dash/Dodge only) has no dedicated tracked condition anywhere in this app, so
    Frightened is reused as the closest existing "wants to get away" condition, the same
    documented-simplification bar Taunt/Intimidating Presence already set for similar "make it
    flee" effects.
- **Oath Spells (3rd/5th/9th/13th/17th)**: the always-prepared fixed list. This app had NO
  "spells granted automatically, not chosen" mechanism anywhere (Cleric's own Divine Domain
  spells have the identical real gap — out of scope for this pass, which only touches Devotion).
  Auto-synced into `c.spells` from `ensureFields` — the same self-healing migration spot every
  other derived field in this app already gets fixed up in, so existing saved Devotion paladins
  pick this up automatically on next load, not just newly-created ones. Marked `oathSpell:true`
  so `preparedCount` (which enforces `preparedMax`) skips them, matching RAW's "don't count
  against the number of spells you can prepare."
- **Aura of Devotion (7th)**: Charmed immunity while conscious — `auraOfDevotionBlocks(c,cond)`,
  wired into the exact same two condition-application choke points Mindless Rage already
  established (`qbAdapter.addCond`'s PC branch, `playerOnData`'s `'cond'` handler). RAW also
  protects nearby ALLIES within range, not just the paladin themself — scoped to self-only here,
  the same self-only simplification Mindless Rage's own doc comment already accepted, since
  checking other party members' distance at this exact choke point needs session/party context
  neither function currently has.
- **Purity of Spirit (15th)** and **Divine Smite's undead/fiend +1d8 bonus** (a real, separate
  pre-existing gap found while building the new monster-type helpers, not introduced by this
  pass): both documented as "nothing to build" for now rather than forced in — Purity of Spirit's
  Protection from Evil and Good has no tracked mechanical effect anywhere in this app (no
  `SPELL_EFFECTS` entry, no advantage-vs-creature-type check), and Divine Smite's existing
  implementation lives in `attackFlow`, which only the player-net path actually calls (`net.
  targetMon`-driven) — QB has its own separate `qbResolveAttack` resolution path, so wiring the
  undead/fiend bonus in correctly would mean touching both, a bigger, more tangential lift than
  this pass's actual scope. Flagging both for a future pass rather than silently leaving them
  unmentioned.
- **Holy Nimbus (20th)**: action, applies a tracked effect (bright light note, 1 minute), once
  per long rest. The "10 radiant to enemies starting their turn in the light" and "advantage vs
  fiend/undead spell saves" clauses are recorded on the effect's description for the player to
  apply manually — this app has no "start of turn, check who's standing in a light radius"
  automated tick anywhere (lighting is otherwise purely visual/cosmetic here), a documented
  simplification rather than new automated-lighting-damage infrastructure for one capstone.

Tests: 22 new assertions — `isDevotionPaladin`/resource-pool-sizing gating, `monsterIsUndead`/
`monsterIsFiend`'s sprite-based inference, Oath Spells' real `ensureFields` auto-sync (including
idempotency and the `preparedCount` exclusion), Sacred Weapon's bonus verified through the real
`weaponToHit` path (on and back off), and Aura of Devotion's gating/consciousness-check both
standalone and wired through the real `qbAdapter.addCond` path.

Playwright wasn't available to spot-check this live either (server still disconnected).

## Hunter — eighth subclass, Favored Enemy/Natural Explorer's real choice infra, and a
   significant cross-cutting gap found and flagged (v120.194)

Eighth entry in `SUBCLASS_FEATURES`. Favored Enemy and Natural Explorer (base Ranger, 1st) were
flavor-text-only before this pass, like every other base-class prerequisite this session —
but unlike Wild Shape/Martial Arts/Divine Sense, they're genuinely exploration/roleplay features
with almost no combat hook to attach to (this app has no travel-pace, terrain-tagging, or
tracking-DC system at all). Scoped honestly rather than forced into fake combat mechanics:

- **A new generic choice-picker type, `{t:'pick', key, options, label, multi}`**, added to the
  existing `pendingChoiceSpecs`/`choiceControl`/`applyChoices` level-up-choice machinery (the
  same system Fighting Style/Half-Elf ability picks already use) — a single dropdown-choice shape
  reused for Favored Enemy/Favored Terrain (repeatable across 1st/6th/14th and 1st/6th/10th,
  `multi:true`, stored as arrays) AND all four of Hunter's one-shot subclass choices (Hunter's
  Prey/Defensive Tactics/Multiattack/Superior Hunter's Defense), instead of six bespoke
  render/resolve pairs.
- **Favored Enemy**: real advantage on Survival checks (`skillCheckAdvantage`) whenever at least
  one is chosen — not conditional on the SPECIFIC enemy type matching, since `MONSTERS_5E` has no
  creature-type column (the same gap Divine Sense's `monsterIsUndead`/`monsterIsFiend` sprite
  inference worked around, but this app's ~90-entry bestiary doesn't span all 13 Favored Enemy
  categories cleanly enough to extend that trick here). The Intelligence-recall-info half of the
  feature has no hook at all (Recall Knowledge's existing 4 skills aren't creature-type-gated)
  and is left undocumented-in-code, roleplay-only.
- **Natural Explorer**: sheet-tracked choice only, zero mechanical hook — this app has no
  travel/terrain system anywhere to attach "ignore difficult terrain," "double proficiency on
  terrain checks," etc. to. A real, honest gap, not a corner cut for this pass specifically.
- **Hunter's Prey (3rd)** — all three options built for real: **Colossus Slayer** is a new
  `afColossus` rider in `attackFlow`'s damage step (same shape as Divine Strike/Sneak Attack/
  Divine Smite), gated on the target's real HP looked up from the synced session (`net.targetMon`
  only carries `{id,name,ac}` — the actual monster object is found via `net.session.monsters`).
  **Giant Killer** and **Horde Breaker** are new foe-menu Use actions reusing `Engine.attack`
  directly (Horde Breaker opens a second-target picker scoped to creatures within 5 ft of the
  original target). Giant Killer's real trigger ("after a Large+ creature hits OR misses you")
  isn't automated — no monster size data exists either — offered as a player-initiated reaction
  option instead, the same simplification Retaliation already established for reactive
  "attack back" features.
- **Multiattack (11th)** — both options built: **Whirlwind Attack** is a new top-level Use action
  hitting every adjacent foe; **Volley** anchors its 10-ft blast on a chosen TARGET CREATURE
  rather than an arbitrary map point (this app has no generic point-picker outside spell AoE
  targeting, which lives in a completely different code path) — both loop `Engine.attack` per
  target and reuse the existing `inBlast` radius helper AoE spells already use.
- **Defensive Tactics (7th)** and **Superior Hunter's Defense (15th)**: all six remaining options
  documented, not built, after real investigation rather than skipped silently. Escape the
  Horde/Steel Will need per-roll-type advantage hooks this app doesn't have for opportunity
  attacks or saving throws specifically; Multiattack Defense needs an attacker-specific AC bonus
  tracked across a whole round; Evasion/Stand Against the Tide/Uncanny Dodge all need a reactive
  "you were just hit, act now" interrupt system this app has never built (the same category of
  gap Shadow Martyr's own doc note already flagged as a bigger lift than any single pass). One
  correction from research along the way: Multiattack Defense is a flat **+4 AC** against that
  same attacker's subsequent attacks this turn in the 2014 PHB — NOT "the attacker has
  disadvantage," which is the 2024 revision's wording; noted so a future pass building it gets
  the right rule.
- **A significant pre-existing cross-cutting gap found while building Colossus Slayer**: Quick
  Battle's own attack-roll UI (`openCombatRollModal`, called from `qbResolveAttack`) has **no
  rider system at all** — Sneak Attack, Divine Smite, and this session's own Divine Strike
  (Life Domain) only ever apply in player-net mode via `attackFlow`, a completely separate modal
  QB never calls. Colossus Slayer inherits this exact same limitation (built into `attackFlow`
  only, for the same reason). This is a real violation of this session's own "ALWAYS make same
  features for DM hosted and quick battle" rule that PRE-DATES this pass — flagging it loudly
  rather than quietly accepting a 4th feature with the same gap. Fixing it means retrofitting
  `openCombatRollModal`'s damage step with an equivalent rider-checkbox system, which is its own
  bounded follow-up task, not something to fold into this pass without ballooning it further.

Tests: 18 new assertions — `isHunter` gating, the new generic `{t:'pick'}` choice-spec type
verified for both repeatable (Favored Enemy/Terrain, including "owed count shrinks as picks are
made") and one-shot (Hunter's four subclass choices) shapes, and Favored Enemy's real
`skillCheckAdvantage` hook.

Playwright wasn't available to spot-check this live either (server still disconnected).

## Assassin — ninth subclass, Cunning Action/Reliable Talent, and a new surprise-tracking
   primitive (v120.195)

Ninth entry in `SUBCLASS_FEATURES`. Sneak Attack and Expertise were already real (built earlier
than this session); **Cunning Action** and **Reliable Talent** (base Rogue) were flavor-text-only.

- **Cunning Action (2nd)**: Dash and Hide now prefer the bonus action whenever it's still free
  (`c.cls==='Rogue' && level>=2 && !c.battle.bonus`), falling back to spending the normal action
  otherwise — a Rogue can still choose to Dash/Hide the old way if their bonus action is already
  spent on something else. Disengage isn't built: this app has no automatic
  attack-of-opportunity-on-moving-away system at all (opportunity attacks are only ever
  player/DM-initiated), so there's nothing for a Disengage action to actually suppress.
- **Reliable Talent (11th)**: a real fix in `rollSkillCheck` itself — any roll of 9 or lower
  becomes a 10, but only on checks that add proficiency bonus (i.e. `c.skillProf[skillKey]` is
  true), matching RAW precisely rather than applying to every roll.
- **Assassinate (3rd)**: two genuinely different mechanics bundled under one feature name.
  The "advantage vs a creature that hasn't acted yet" clause needed no new tracking at all — a
  new pure helper, `hasNotActedYet(session, unitId)`, derives it for free from initiative order
  position vs. the current turn index (only meaningful in round 1, since everyone's acted by
  round 2). The "auto-crit vs a Surprised creature" clause needed a NEW primitive this app never
  had: surprise/ambush isn't modeled anywhere. Added a manually-toggled `mo.surprised` flag,
  exposed as a "Surprise"/"Un-surprise" button on each foe row in the Use-menu's foe list — QB
  only for now, since player-net's monster list is a synced mirror of the DM's real session and a
  local toggle there wouldn't reach the DM without a round-trip message this pass doesn't build
  (flagged, not silently limited). Both clauses are wired into QB's `qbResolveAttack` AND
  player-net's `attackFlow` (the advantage/crit override happens before either path's `cx.adv`
  merge, so it flows through each mode's existing advantage-tag UI for free).
- **Death Strike (17th)**: unlike every other rider this session, this one has NO player choice
  (no checkbox) — RAW is unconditional ("when you hit a Surprised creature, it makes a Con save
  ... or takes double damage"), so `attackFlow`'s `rollDmg` rolls the save itself the moment it
  sees `st.targetSurprised` (a flag set during `rollToHit`, since the surprised check needs the
  real monster object `net.targetMon` doesn't carry) and doubles the FULL total — every other
  rider included — on a failure, applied last after Sneak Attack/other dice are already added in.
- **Bonus Proficiencies (3rd, disguise/poisoner's kits), Infiltration Expertise (9th), Impostor
  (13th)**: sheet-text only, no code — none of the three have any mechanical roll or number
  attached in RAW itself (Impostor is specifically "advantage on a Deception check," not a
  fixed-DC feature — confirmed via research after an initial draft assumption was wrong), so
  there's no missing mechanic to build, just narrative features this app already handles the way
  it handles any roleplay-only feature (flavor text on the sheet).
- **Base Rogue's Uncanny Dodge (5th) and Evasion (7th)** — deliberately left undone, for
  consistency with the exact same call made for Ranger's Superior Hunter's Defense options last
  entry: both need a live "you were just hit, react now" interrupt this app has never built
  (Shadow Martyr's own doc note flagged this as a bigger lift than any single pass first), and
  building it for Rogue but not Ranger (or vice versa) would be an arbitrary inconsistency rather
  than a real prioritization call.

Tests: 12 new assertions — `isAssassin` gating, `hasNotActedYet` across a full initiative-order/
round-advance sequence (including the round-2 cutoff), and Reliable Talent's proficient-skill
gate and level gate, verified through the real `rollSkillCheck` path with a stubbed d20.

Playwright wasn't available to spot-check this live either (server still disconnected).

## Draconic Bloodline — tenth subclass, and Metamagic's real choice infra (v120.196)

Tenth entry in `SUBCLASS_FEATURES`. Font of Magic's sorcery points (both directions of Flexible
Casting) were ALREADY real — the only pre-existing gap this time was **Metamagic**, base
Sorcerer's 3rd-level feature, flavor-text-only before this pass.

- **Metamagic**: real choice tracking via the same `{t:'pick', multi:true}` infra Favored
  Enemy/Terrain established — 2 options at 3rd, +1 at 10th, +1 at 17th, stored as `c.metamagic`.
  Deliberately scoped to CHOICE tracking only, not full mechanical effects for all 8 options:
  several (Twinned Spell needs a second-target picker on an otherwise single-target spell cast,
  Quickened Spell needs a real action-economy override, Subtle Spell needs to bypass a no-verbal/
  no-somatic restriction this app doesn't model at all) would each be their own bounded feature
  on the scale of a full subclass pass. Distant/Extended/Careful/Empowered/Heightened are lower-
  effort candidates for a focused follow-up. Flagging this honestly rather than half-building a
  subset and calling Metamagic "done."
- **Dragon Ancestor (1st)**: a one-shot pick (also via `{t:'pick'}`), stored as `c.sorcererDragon`
  — a SEPARATE field from Dragonborn's racial `c.dragon`, since the two are independent choices
  a character could have both of. Drives `DRACONIC_ANCESTRY_DAMAGE`'s type→damage-type table.
- **Draconic Resilience (1st)**: `computeAC` gained another Unarmored-Defense-shaped branch (13 +
  Dex, no shield restriction unlike Monk's) right next to Mage Armor's identical formula. The
  +1-max-HP-per-level half is applied at the exact point `levelUp()` already increments `hp.max`
  for the level — but placed AFTER subclass assignment in that same function, since a Sorcerer
  can pick Draconic Bloodline on their very first level-up and still needs the bonus that same
  transaction (checking `isDraconicSorcerer` before the subclass write would read the stale
  pre-choice value).
- **Elemental Affinity (6th)**: `castModal` gained another notation-bump branch (same shape as
  Disciple of Life's healing bonus) — `+Cha mod` on `m.dmg` when the spell's parsed damage type
  matches the ancestry's. The 1-sorcery-point resistance option isn't wired to a dedicated
  button — apply it via the Effects tab's existing "+ Add" custom-effect entry, the same manual-
  application fallback this app already uses for anything without a purpose-built toggle.
- **Dragon Wings (14th)** and **Draconic Presence (18th)**: a new small `openSorcererUI` modal
  (same shape as `openKiUI`/`openPaladinUI`). Wings just toggles a tracked effect (no separate
  flying-vs-ground-speed distinction exists anywhere in this app to hook a real speed change
  into — narrative/tracked only). Draconic Presence reuses Turn the Unholy's exact AoE-save
  pattern (60 ft, Wisdom save vs spell DC, `ad.addCond`), offering a real Awe-vs-Fear choice
  through two buttons rather than a native `confirm()` dialog, matching this app's own
  never-use-native-dialogs convention.

Tests: 10 new assertions — `isDraconicSorcerer` gating, the ancestry damage-type table, Draconic
Resilience's AC verified through the real `computeAC` path (on and off armor), and Metamagic/
Dragon Ancestor's owed-count shrinking as picks are made.

Playwright wasn't available to spot-check this live either (server still disconnected).

## The Fiend — eleventh subclass, and a new centralized "on kill" hook (v120.197)

Eleventh entry in `SUBCLASS_FEATURES`. Pact Magic's slot table (few slots, always highest level,
short-rest recharge) was ALREADY real; Eldritch Invocations and Pact Boon (base Warlock) were
flavor-text-only.

- **Dark One's Blessing (1st)** — the standout piece of this entry: rather than threading a new
  hook through every attack-resolution path (QB's `qbResolveAttack`, player-net's `attackFlow`,
  and any future one), this subscribes to the existing global `Events` pub/sub system that
  `Engine.attack` ALREADY emits `'attack'` and `'death'` events into. A `'death'` event doesn't
  carry `actorId`, but `Engine.attack` emits it synchronously immediately after the `'attack'`
  event when the hit finishes the target — so the module-level `_lastAttackEv` tracks the most
  recent attack and is read the instant a death event follows it. This is the first feature this
  session wired through `Events` instead of touching each mode's UI layer directly, and it means
  Dark One's Blessing works identically in QB and player-net (and any other future path) with
  zero per-mode code — a stronger, more centralized fix than the per-path pattern every earlier
  rider (Sneak Attack, Divine Smite, Divine Strike, Colossus Slayer, Death Strike) had to use,
  worth remembering for future features that need an "any kill, anywhere" trigger.
- **Dark One's Own Luck (6th)**: a new small `openWarlockUI` modal button that rolls 1d10 and
  adds it to `lastRoll` (the existing global roll-log state every roll already pushes into),
  re-logging the adjusted total — the first feature this session to retroactively modify an
  already-shown roll rather than computing a fresh one.
- **Fiendish Resilience (10th)**: a real damage-type picker (persisted as `c.fiendishResilience`)
  but the resistance itself isn't auto-applied — `applyHp(c,delta)` has no damage-type parameter
  at all anywhere in this app (a real, pre-existing architectural gap; threading dtype through
  every one of its many call sites is a bigger lift than this pass), so the UI explicitly tells
  the player to halve incoming damage of that type themselves, the same manual-application
  fallback used everywhere else this session lacks a clean hook.
- **Hurl Through Hell (14th)**: a new `afHurl` rider in `attackFlow` (same shape as Colossus
  Slayer/Death Strike, same QB-mode gap already flagged for that whole family). The RAW "target
  vanishes until the end of your next turn" clause is log-text only — this app has no "removed
  from play, returns later" token state to hook a real disappearance into; the 10d10-unless-a-
  fiend damage (checked via the existing `monsterIsFiend` sprite heuristic from Divine Sense) is
  the real, mechanically-enforced part.
- **Eldritch Invocations / Pact Boon**: real choice-count tracking via the same `{t:'pick'}` infra
  (known-count table: 2/3/4/5/6/7/8 at levels 2/5/7/9/12/15/18 for invocations; one-shot Pact
  Boon at 3rd). Deliberately scoped to selection only, same call as Metamagic last entry — most
  individual invocations (Agonizing Blast modifying Eldritch Blast's cantrip-scaling damage,
  Devil's Sight altering darkvision/lighting checks, Mask of Many Faces granting at-will
  Disguise Self) and Pact of the Blade's summoned weapon are each their own bounded feature, not
  something to half-build inside an already-large subclass pass. `ELDRITCH_INVOCATIONS` is a
  curated 15-name list, not the full PHB roster — the same scope call `BEAST_SHAPES` made for
  Wild Shape's missing beast data.

Tests: 10 new assertions — `isFiendWarlock` gating, Dark One's Blessing verified through a real
synthetic `Events.emit('attack')`→`Events.emit('death')` pair (proving the centralized hook fires
without any QB/player-net-specific test setup beyond a minimal fixture), and Eldritch Invocation/
Pact Boon's owed-count tracking.

Playwright wasn't available to spot-check this live either (server still disconnected).

## School of Evocation — twelfth and final subclass of this pass (v120.198)

Twelfth entry in `SUBCLASS_FEATURES`, closing out the "one iconic subclass per class" sweep
(Echo Knight, Path of the Berserker, College of Lore, Life Domain, Circle of the Moon, Way of the
Open Hand, Oath of Devotion, Hunter, Assassin, Draconic Bloodline, The Fiend, and now Evocation).
Base Wizard's Spellcasting and Arcane Recovery were already real; School of Evocation had no
prerequisite base-class gap the way most of the last several entries did.

- **Empowered Evocation (10th)**: another `castModal` notation-bump, same shape as Elemental
  Affinity/Disciple of Life — `+Int mod` on `m.dmg` gated on `spellMeta(name).s==='V'` (this
  app's own letter code for the Evocation school, from `CLASS_LETTER`'s comment).
- **Overchannel (14th)**: a new `⚡ Overchannel` button (not a checkbox — toggling a checkbox
  can't retroactively change the already-rendered roll button's notation without a live
  re-render, so this is a direct action instead) offering `maxNotation(m.dmg)` as damage,
  gated to 1st-5th level spells. A pure helper, `overchannelBacklashDice(c)`, computes the
  escalating self-damage die count from `c.overchannelUses` (a caught-and-fixed off-by-one along
  the way: the count read at the START of a given use reflects PRIOR uses this rest, so the
  backlash die count is `1 + that count`, not `2 + that count` — the first BACKLASH-eligible use
  is the 2nd overall use and must come out to 2d12/level, verified via a real test). The backlash
  applies via `applyHp` immediately when the button is tapped (matching RAW's "immediately after
  you cast it"), resets only on a long rest.
- **Sculpt Spells (2nd)**: documented, not built. Excluding chosen creatures from an AoE spell's
  damage/save resolution would mean touching `resolveBlast` — which, like several other systems
  flagged this session, exists as two separate implementations (QB and player-net each have
  their own `resolveBlast`), so building this "properly" means the same double-path problem
  already flagged for Divine Smite/Sneak Attack/Colossus Slayer in QB's attack modal. Scoped out
  rather than half-built into just one path.
- **Potent Cantrip (6th)**: documented, not built. This app's save-based spell damage is shown as
  a single flat notation for the caster to roll once (see `SPELL_DESC`'s regex-parsed mechanics);
  it has no per-target save-outcome tracking inside `castModal` to conditionally halve damage
  against — the player already applies damage manually per target today, so halving Potent
  Cantrip's damage against a save-succeeding target is achievable the same way (manual
  arithmetic), not a missing mechanic requiring new code.
- **Evocation Savant (2nd)**: documented only — this app has no spellbook-copying gold/time
  economy system at all (adding a spell to your list is instant and free everywhere), so there's
  nothing for "halved cost" to apply to.

Tests: 5 new assertions — `isEvocationWizard` gating and `overchannelBacklashDice`'s escalation
sequence across three successive uses, including the off-by-one correction caught while writing
the test (the implementation's own comment now spells out the indexing explicitly so it doesn't
recur).

Playwright wasn't available to spot-check this live either (server still disconnected).

## Session summary: the full 12-subclass "one per class" pass

Across this whole pass (Echo Knight → Berserker → College of Lore → Life Domain → Circle of the
Moon → Way of the Open Hand → Oath of Devotion → Hunter → Assassin → Draconic Bloodline →
The Fiend → Evocation), the recurring shape was: audit which BASE-class feature the subclass
depends on (often itself flavor-text-only — Wild Shape, Martial Arts/Ki, Divine Sense/Lay on
Hands/base Channel Divinity, Favored Enemy/Cunning Action/Reliable Talent, Metamagic, Eldritch
Invocations/Pact Boon), build that first, then layer the subclass's own features on top with the
QB/DM-hosted unification rule applied from the first draft. Two significant CROSS-CUTTING issues
were found and flagged loudly rather than silently worked around: (1) Barbarian/Monk Unarmored
Defense had never been implemented at all, meaning every unarmored Barbarian/Monk in this app
was missing their signature AC bonus — fixed as part of the Open Hand pass; (2) Quick Battle's
own attack modal (`openCombatRollModal`) has no rider system at all, so Sneak Attack/Divine
Smite/Divine Strike/Colossus Slayer/Hurl Through Hell only ever apply in player-net mode via the
separate `attackFlow` modal — a real violation of "same rules QB/DM-hosted" that predates this
pass, not fixed here but documented clearly enough that a future session can retrofit it in one
bounded piece of work instead of rediscovering it feature by feature. Also fixed, separately from
any subclass: GitHub Pages had been building from `claude/elegant-bohr-zx67jk`, a branch that
sat 13+ commits behind `iso3d-engine` for the entire back half of this session — every push from
here forward should go to both branches (or Pages' configured source should be repointed at
`iso3d-engine` directly) to avoid repeating that gap.

## Follow-up: Quick Battle's attack modal gets the rider system it never had (v120.199)

Requested explicitly as a fix to the gap flagged in the 12-subclass pass's closing note: Sneak
Attack, Divine Smite, Divine Strike, Colossus Slayer, and Hurl Through Hell only ever applied in
player-net mode (via `attackFlow`), because Quick Battle's own attack UI (`openCombatRollModal`,
driven by `qbResolveAttack`) had no equivalent rider logic at all — a completely separate
implementation with none of it. Fixed by extracting the rider math into two shared, pure
functions and wiring BOTH modals to them, rather than porting a second copy of the same logic
into `openCombatRollModal` (which would have just created the exact kind of duplication this app
has been trying to eliminate all session):

- **`attackRiderOptions(c, atk, targetMo)`** — pure, no rolling: given the attacking character,
  the attack (weapon or spell), and the real target monster object, returns which riders are
  currently available and their shape (`sneak`/`divineStrike`/`colossus`/`hurl` are `{dice, die,
  label}`-shaped booleans-with-metadata; `smite` is `{levels:[...]}` since it's a slot-level
  choice, not a plain checkbox). This is the exact same eligibility logic that used to live only
  inline inside `attackFlow`'s local `canSneak`/`smiteLvls`/`canDivineStrike`/
  `canColossusSlayer`/`canHurlThroughHell` variables — moved out, unchanged in behavior (verified
  via new direct tests, something that was literally impossible before this refactor since the
  logic lived inside a UI closure).
- **`applyAttackRiders(c, atk, targetMo, choices, isCrit, targetSurprised, log)`** — rolls
  whichever riders the player chose, mutates the character's resource fields (`sneakUsed`, spell
  slots, `divineStrikeUsed`, `colossusSlayerUsed`, `hurlThroughHellUsed`) exactly as the old
  inline code did, and includes Death Strike's automatic (no-checkbox) Con-save-or-double check.
  Returns `{total, detail, doubled}` — `doubled` is reported separately rather than folded into
  `total`, since Death Strike doubles the FULL sum (base damage + every other rider), which only
  the caller (after adding `total` to its own base roll) can correctly apply.
- **`riderChecksHTML(riders)`** — the checkbox/select markup, also shared, so the picker looks
  and behaves identically in both modals instead of two copies of the same HTML template.
- **`attackFlow` was refactored** (not left alone) to call these two functions instead of its own
  inline copy — the only way to actually eliminate the duplication rather than create a third
  copy. Re-verified via the full existing test suite (no behavior change) plus the large new
  battery of direct rider tests below.
- **`openCombatRollModal` gained the missing half**: a `riderChecksHTML(opts.riders)` block in
  the `hitResult` phase (the same "after you know you hit, before you roll damage" moment
  `attackFlow`'s picker already used), and `doDmgRoll()` now calls `applyAttackRiders` with the
  chosen checkbox state, exactly mirroring `attackFlow`'s own `rollDmg`. `qbResolveAttack`'s
  PC-attacking branch computes `attackRiderOptions(att.c, atk, tgt)` directly — simpler than
  player-net's version, since QB already has the real target monster object in hand and doesn't
  need the `net.targetMon`-to-`net.session.monsters` indirection `attackFlow` requires.

Being pure functions now (previously the logic only existed inline inside a UI event-handler
closure, `Function.prototype`-invisible to any test harness) means this rider math is finally
directly unit-tested at all, for the first time this session — 15 new assertions covering every
rider's eligibility gating (finesse-weapon requirement, available-slot-level enumeration,
crit-doubling, below-max-HP gating, fiend-immunity, and Death Strike's automatic doubling),
independent of which modal happens to be driving them.

Playwright still wasn't available for a live click-through smoke test of the actual QB modal
(server still disconnected all session) — the wiring changes to `qbResolveAttack`/
`openCombatRollModal` are mechanical (passing options through, reading the same
`document.getElementById` checkbox pattern `attackFlow` already used successfully) and the
underlying math is now directly tested, but a real end-to-end "open Quick Battle, attack with a
Rogue, tick the Sneak Attack box, see the number" pass is still owed once a browser is available
again — noting this honestly rather than claiming full verification.

## Feat audit — "check the feats and make sure they work" (v120.200)

Requested audit: 42 feats total in `FEAT_DESC`. Only 7 had any mechanical hook anywhere
(`hasFeat(...)` never appeared for the other 35): Dual Wielder, Lucky, Alert, Observant, Savage
Attacker, War Caster, Skulker. Everything else was pure flavor text — take the feat, get nothing
but the sheet entry (and, for ~15 of them, an ability-score bump via `FEAT_GRANTS`).

**Three real bugs found and fixed** (a feat's own description promised something the code never
delivered):
- **Gunner**: `FEAT_DESC` says "+1 DEX," but `FEAT_GRANTS` had no `'Gunner'` entry at all —
  taking the feat granted literally nothing. Added `[{t:'fixed',k:'dex'}]`.
- **Spell Sniper**: "learn one attack cantrip" was likewise missing from `FEAT_GRANTS`. Added a
  `spellChoice` grant with a new `attackOnly` filter flag (`parseSpellMechanics(s.n).attack`) so
  the picker only offers cantrips that actually make an attack roll.
- **Weapon Master**: `weaponProficient(c,w)` was, and had always been, purely class-based —
  it never checked feats at all, so the "gain proficiency with four weapons" grant did nothing
  whatsoever; someone who took this feat for a longsword got no to-hit benefit from it, ever.
  Fixed by adding a new `weaponProf` choice-spec type (pick N weapons from the full `WEAPONS`
  list, same `{t:'pick'}`-style plumbing as everything else this session), storing the choice as
  `c.weaponMasterProfs`, and checking it first in `weaponProficient`.

**A regression caught before it shipped**: while adding Great Weapon Master's power-attack
toggle, `attackFlow`'s `rollToHit` turned out to reference `wref` (used for the melee/ranged
advantage check) — a variable the earlier same-session rider-extraction refactor (v120.199) had
accidentally deleted the declaration of. `node --check` and the full test suite both passed
anyway, because `rules-test.js` has never called `attackFlow` directly (it's UI-embedded, the
same testing boundary noted throughout this session) — this would have thrown a live
`ReferenceError` on the very next real attack roll in player-net mode. Re-declared it; flagging
this as a reminder that the UI-embedded-code testing gap is a real blind spot, not just a
theoretical one.

**New mechanics built** (7 feats):
- **Tough**: `+2` max HP per level. `levelUp`'s own per-level HP calc picks it up going forward;
  `applyFeat` backfills `2 × current level` retroactively the moment it's taken (mirrors how
  Draconic Resilience's ordering issue was solved earlier this session).
- **Durable**: hit-die healing floors at `2 × Con modifier`, in `spendHitDie`.
- **Medium Armor Master**: `computeAC` now caps Dex-to-AC at +3 instead of +2 specifically when
  `dexCap===2` (medium armor) and the feat is present.
- **Mobile**: `+10 ft` in `effSpeed`. Dash-ignores-difficult-terrain and the "can't be
  opportunity-attacked by a creature you just attacked" clause aren't built — this app has no
  terrain-cost-by-movement-type distinction for Dash specifically, and no automatic
  attack-of-opportunity-on-moving-away system at all (the same gap Cunning Action's Disengage
  already documented).
- **Tavern Brawler**: unarmed strikes deal `1d4+Str` instead of the flat `1+Str` fallback,
  offered alongside any weapons (not a replacement) in both `qbPcAttacks` and
  `playerAttackMenu`. The bonus-action grapple-after-a-hit clause isn't built (documented).
- **Great Weapon Master / Sharpshooter**: a real `-5 to hit / +10 damage` toggle, the first
  power-attack-style feature this session (every other mechanic tweaks damage or advantage, not
  the to-hit roll itself). New `powerAttackKind(c,atk)` gates on weapon type/property (heavy
  melee for GWM, any ranged for Sharpshooter) plus the matching feat. Wired into BOTH `attackFlow`
  and `openCombatRollModal`/`qbResolveAttack` from the first draft, following this session's own
  established "extract a shared function, don't duplicate" rule. One subtlety caught while
  wiring QB: `Engine.attack` re-derives hit/crit from `atk.toHit` even when a `face` (pre-rolled
  d20) is supplied, so `qbResolveAttack`'s `onCommit` now passes a toHit-adjusted **clone** of
  `atk` when power attack was used — otherwise the roll modal's shown result and `Engine.attack`'s
  authoritative event could disagree on whether the attack even hit. GWM's bonus attack on a
  crit/kill isn't built (would need the same Events-based "on kill" hook Dark One's Blessing
  uses, plus a bonus-action spend — scoped out to keep this batch shippable).
- **Fey Touched / Shadow Touched / Magic Initiate**: their "cast the granted spell once per day
  for free" clause had never been implemented — the spell was learnable but always needed a real
  slot. Fixed via the same `noSlotNeeded`-style bypass Thousand Forms already established in
  `canCast`/`castSpell` (renamed from `thousandForms` now that it covers more than one feature),
  tracked per-spell-name in a new `c.featFreeCastUsed` object, reset on long rest (this app has
  no daily-vs-long-rest clock, so "once per day" is approximated the same way every other
  once/day feature in this app already is). Magic Initiate's granted spell is dynamic (whichever
  the player picked), identified via the `'(from Magic Initiate)'` origin tag already written
  into `c.spells`' notes field at grant time — no new tracking needed for that part.

**Still pure flavor text, documented rather than silently left** (roughly 28 feats): Athlete,
Actor, Charger, Crossbow Expert, Defensive Duelist, Dungeon Delver, Elemental Adept, Grappler,
Healer, Heavily/Lightly/Moderately Armored (the "armor proficiency" grant itself has nothing to
lift — this app has never modeled an armor-non-proficiency PENALTY of any kind, so there's no
negative state for the grant to remove), Heavy Armor Master's damage reduction (needs a
damage-TYPE-CATEGORY parameter threaded through `applyHp`, which has none at all — the identical
architectural gap Fiendish Resilience hit last entry), Inspiring Leader, Mage Slayer, Martial
Adept, Mounted Combatant (no mount system exists), Polearm Master, Resilient/Skill Expert/Skilled
(these three already work — their whole mechanic IS the choice grant, already wired), Ritual
Caster, Sentinel, Shield Master, Spell Sniper's range/cover clauses (only its missing cantrip
grant was fixed), Weapon Master's ability-score half (already worked before this pass) — most of
these would need either a reactive "you were just attacked/hit/cast-near, act now" interrupt
system (the same category of gap flagged repeatedly since Shadow Martyr), a mount/vehicle system,
or a consumable-charges system (Healer's kit) this app has never built. Not attempted here to
keep this pass shippable rather than half-building a dozen more systems at once.

Tests: 19 new assertions — the three FEAT_GRANTS bug fixes verified structurally, Weapon Master's
proficiency grant verified through the real `weaponProficient` path (with and without the chosen
weapon), Tough's retroactive backfill through the real `applyFeat`, Durable through the real
`spendHitDie`, Medium Armor Master and Mobile through the real `computeAC`/`effSpeed` paths,
Tavern Brawler through the real `qbPcAttacks` path, `powerAttackKind`'s weapon/feat gating, and
Fey Touched/Magic Initiate's free-cast-once bypass through the real `canCast`/`castSpell` paths
(including the "second cast same day is blocked" case).

Playwright still wasn't available for a live click-through of the new Great Weapon Master/
Sharpshooter checkbox in either modal — same honest caveat as the rider fix above.

## "Make the systems" (1): damage-type parameter through applyHp (v120.201)

Requested follow-up to the feat audit: several documented gaps traced back to the same root
cause — `applyHp(c, delta)` had no damage-type parameter anywhere, ever, in this app's history.
Fixed by threading `dtype` through the whole incoming-damage pipeline: `Engine.attack`'s own
`ad.hurt(t,dmg)` call didn't forward `atk.dtype`/`atk.dt` at all (a real pre-existing gap, not
just missing for these two feats — EVERY weapon attack against a PC lost its damage type before
this fix); `qbHurt`, `sessionAdapter.hurt`, and `playerNetAdapter.hurt` now all accept and
forward it; the DM→player `'apply'` network message now carries `dtype` too, and
`playerOnData`'s handler forwards it into the receiving player's own `applyHp` call.

- **Heavy Armor Master**: `-3` flat to bludgeoning/piercing/slashing damage while wearing heavy
  armor (`armorDef(c.armor).dexCap===0` is this app's existing heavy-armor marker). "Nonmagical"
  isn't tracked on incoming damage anywhere (the same magic-vs-nonmagical gap that's come up
  repeatedly this session), so it applies to any b/p/s hit — documented, not silently narrowed.
- **Fiendish Resilience** (The Fiend, Warlock — built two entries ago but left as "apply it
  yourself" specifically because this parameter didn't exist): now genuinely halves incoming
  damage of the chosen type, no manual bookkeeping needed.
- Both gate on `dtype` being present at all, so flat manual damage-entry buttons and
  environmental hazard damage (which never carried a type) are correctly unaffected.

Tests: 18 new assertions, including a real end-to-end one through `Engine.attack` (not just a
direct `applyHp` call) proving the weapon's damage type now actually survives the whole
adapter → hurt → applyHp chain, which it never did before this fix.

## "Make the systems" (2): Evasion and Uncanny Dodge (v120.201)

Both were explicitly documented as "needs an interrupt system this app doesn't have" in the
Hunter/Assassin subclass entries. Turned out that assessment was only half right:

- **Evasion** (Rogue 7th; also a Ranger Hunter Superior Hunter's Defense pick) needed nothing
  new at all — `Engine.castApply` is already the ONE shared save-resolution choke point every
  mode (QB, player-net, DM-hosted) routes through for AoE/save spells. Added a single check
  right where `dmg` is computed from `saved`: a Dex-save effect now deals 0 on a success (not
  half) and half on a failure (not full) when the target has Evasion. `ad.checkSubject(t)`
  returns `null` for a monster or for a DM-hosted mirror of a connected player (the DM can't see
  that player's real feats) — `hasEvasion(null)` is a safe `false`, so this only actually fires
  where the target's real character is known locally (QB's own PC, or a player's own device
  resolving damage to itself) — a real, honest scope limit for the DM-hosted-connected-player
  case, not a new one.
- **Uncanny Dodge** (Rogue 5th; same Ranger pick) genuinely IS reactive in a way this app has no
  live "pause and ask" mechanism for — so it's applied automatically instead: the first
  qualifying hit each round is halved with no player choice, consuming the reaction (gated on
  `c.battle` existing, so it only fires in real combat, not on out-of-battle damage entries). A
  documented simplification (RAW lets you choose NOT to use it, e.g. to save it for a bigger hit
  later the same round) rather than a missing mechanic — matches how Rage's own damage-halving
  in this exact function is also unconditional/automatic.
- `hasEvasion`/`hasUncannyDodge` both check the base Rogue class feature AND the matching
  Ranger Hunter `hunterSuperiorDefense` pick from the same shared gate, rather than duplicating
  the check per class.

Tests: 27 new assertions — gating for both classes' sources, Evasion verified through the real
`Engine.castApply` path (success/failure × Evasion/non-Evasion, 4 real combinations), and
Uncanny Dodge's once-per-round behavior verified through the real `applyHp` path across a
reaction reset.

Remaining "make the systems" items not yet started: an armor-non-proficiency penalty system
(Heavily/Lightly/Moderately Armored), ritual casting, Healer's kit charge tracking, a mount
system (Mounted Combatant), Battle Master maneuvers/superiority dice (Martial Adept), and the
smaller "genuinely borderline" feats (Athlete, Actor, Grappler, Inspiring Leader, Charger,
Dungeon Delver, Crossbow Expert, Spell Sniper's remaining clauses). Continuing in the next pass.

## "Make the systems" (3): armor-proficiency penalties (v120.202)

No armor-category-proficiency data existed anywhere in this codebase before this pass — `c.armor`
only ever fed AC math (`computeAC`/`armorDef`). PHB rule: wearing armor you're not proficient with
gives disadvantage on Strength/Dexterity attack rolls and ability checks, and you can't cast
spells at all.

- `ARMOR` entries each gained a `cat` field (`'light'|'medium'|'heavy'`, absent for Unarmored).
- New `ARMOR_PROF` table: base per-class armor-category proficiencies (PHB) — e.g. Fighter/Paladin
  get all three, Wizard/Sorcerer/Monk get none, Rogue/Bard/Warlock get light only. Shields are
  deliberately NOT gated here — this app has never modeled shield non-proficiency, and PHB shield
  proficiency almost always travels with medium/heavy armor proficiency anyway, so it wasn't worth
  a second axis.
- `armorProficient(c, armorKey)`: class table first, then Lightly/Moderately/Heavily Armored each
  add exactly the one category they grant (Heavily Armored's real PHB prerequisite is medium
  proficiency, but the feat itself only grants heavy — it does NOT also backfill medium).
- Hooked into three places, matching how the app already threads similar penalties/bonuses:
  - **Attack rolls** — `attackAdvantage` gained an `opts.armorDisadvantage` flag. `Engine.hitResult`
    (the one shared to-hit resolver every mode's `Engine.attack` funnels through) computes it via
    `ad.checkSubject(a)` — same idiom Evasion uses, so it's a real, honest `false` for a monster
    attacker or a DM-hosted mirror of a connected player (the DM can't see that player's real
    armor field either), not a new scope gap.
  - **Str/Dex ability checks** — `skillCheckAdvantage` docks `adv` by 1 when `abilKey` is `str` or
    `dex` and the character's worn armor fails `armorProficient`. This only reaches the
    mechanically-tracked skill checks that already route advantage through this function (same
    boundary as Favored Enemy/Rage's existing entries here) — free-form saves/ability checks
    rolled through the generic `rollCheck` button (user picks adv/dis manually) are untouched by
    design, consistent with how no other passive advantage source hooks that path either.
  - **Spellcasting** — `canCast` returns false with a banner the moment armor is worn and
    non-proficient, right next to the existing Raging/Silence early-outs.

Tests: 19 new assertions — `armorProficient` gating (class-based and each of the three feats,
including that Moderately Armored doesn't leak into heavy), `attackAdvantage`'s new opt in
isolation, `skillCheckAdvantage`'s Str/Dex-only scoping, `canCast`'s block/unblock, and a real
end-to-end run through `Engine.attack` (qbAdapter) proving the penalty actually reaches the live
roll and its reason string, not just the pure helper.

Remaining "make the systems" items: ritual casting, Healer's kit charge tracking, a mount system
(Mounted Combatant), Battle Master maneuvers/superiority dice (Martial Adept), and the smaller
"genuinely borderline" feats (Athlete, Actor, Grappler, Inspiring Leader, Charger, Dungeon Delver,
Crossbow Expert, Spell Sniper's remaining clauses). Continuing in the next pass.

## "Make the systems" (4): ritual casting (v120.203)

- `RITUAL_SPELLS`: a curated set of this app's actual known spells that carry the PHB ritual tag
  (Alarm, Comprehend Languages, Detect Magic, Find Familiar, Identify, Purify Food and Drink,
  Unseen Servant, Animal Messenger, Augury, Gentle Repose, Silence, Water Breathing, Water Walk,
  Zone of Truth, Clairvoyance, Speak with Dead, Tongues, Divination, Commune, Commune with
  Nature, Contact Other Plane, Legend Lore) — some real-world rituals (e.g. Locate Animals or
  Plants, Magic Mouth, Beast Sense) aren't in this app's spell list at all, so they're simply
  absent rather than half-wired.
- `RITUAL_CASTERS = ['Bard','Cleric','Druid','Wizard','Artificer']` — the classes with the innate
  Ritual Casting feature. Paladin is deliberately excluded even though it's in `isPrepCaster`
  (Paladins never get ritual casting per RAW).
- `canRitualCast(c, name)`: Wizard/Artificer only need the spell known (not prepared — RAW);
  Cleric/Druid need it prepared, same as a normal cast; Bard just needs it known. The Ritual
  Caster feat is simplified to "any ritual spell you already know" rather than tracking a
  separate ritual-book spell list distinct from a character's known spells — this app has never
  modeled a second spell list per character, and adding one just for this one feat wasn't worth
  the surface area.
- `canCast`/`castSpell` both gained an `opts.ritual`/`spellOpts.ritual` flag: when set and
  `canRitualCast` agrees, the slot check and the ENTIRE action-economy block (action/bonus/
  reaction) are skipped — a ritual cast takes 10 minutes, not a tracked turn action, so nothing
  in `c.battle` should move. Wizard/Artificer also skip the "must be prepared" gate specifically
  while ritual; Cleric/Druid don't, since `canRitualCast` already required `prepared` for them.
- `castModal` gained a "🕯️ Cast as Ritual" checkbox, shown whenever `canRitualCast` is true for
  the spell being cast. Deliberately hidden for summon-kind spells (Unseen Servant is the one
  ritual spell that's also `SPELL_HANDLERS`-summon) — that flow routes through its own
  `openSummonSpellUI` picker, which doesn't read this modal's checkbox at all; showing a toggle
  that silently did nothing would be worse than not showing one. A real, explicit scope gap for
  a future pass, not a silent one.

Tests: 15 new assertions — `canRitualCast`'s per-class gating (Wizard unprepared-but-known,
Cleric requires prepared, Sorcerer has none innately, Ritual Caster feat grants it), and a real
end-to-end run through `canCast`/`castSpell` proving a ritual cast succeeds with no action left,
spends no slot, doesn't touch `c.battle.action`, and doesn't retroactively mark the spell
prepared.

Remaining "make the systems" items: Healer's kit charge tracking, a mount system (Mounted
Combatant), Battle Master maneuvers/superiority dice (Martial Adept), Unseen Servant's ritual
wiring through `openSummonSpellUI`, and the smaller "genuinely borderline" feats (Athlete, Actor,
Grappler, Inspiring Leader, Charger, Dungeon Delver, Crossbow Expert, Spell Sniper's remaining
clauses). Continuing in the next pass.

## "Make the systems" (5): Healer's Kit charges (v120.204)

- `hasHealersKit(c)`: checks `c.items` for an owned Healer's Kit — the shop item already existed
  (`ADV_GEAR`), it just never did anything mechanically.
- `c.healerKitCharges`: a flat 10-use counter, the same simplification Goodberries already uses
  for a physical consumable rather than tracking per-item charges. Lazily initializes to 10 the
  first time it's actually spent (nothing to migrate for characters who already own a kit).
- `maneuverStabilize` (the existing shared Stabilize function — already adapter-based across QB/
  player-net) gained an `opts.kit` flag: when set and a kit with charges remains, it skips the
  Medicine DC 10 roll entirely (PHB tool rule — a healer's kit auto-stabilizes) and spends one
  charge instead. If the character also has the Healer feat, the kit-stabilize additionally
  reports 1 HP of healing (`healerFeatHp` on the returned result) — RAW: "that creature also
  regains 1 hit point" specifically when a kit (not a bare roll) is used to stabilize them.
  Falls back to the normal roll automatically once charges hit 0.
- Wired into the one real UI surface Stabilize already has (player-net's Use-menu ally screen —
  Quick Battle is solo, no second ally to stabilize, an existing documented limitation): a
  "🧰 Use Healer's Kit" checkbox appears next to the Stabilize button whenever the character owns
  one with charges left, defaulting checked. The `healHp` amount now rides along the existing
  stabilize/stabilized network relay (player → DM → target device) so the Healer feat's +1 HP
  actually lands on the target's own sheet via `applyHp`, not just the actor's.
- Scope not covered this pass: the Healer feat's OTHER action — "restore 1d6+4 + the creature's
  hit dice, once per rest" to an already-conscious injured ally — needs its own target list (any
  nearby ally, not just a downed one) and its own once-per-rest-per-target tracking. Flagged
  honestly as remaining work rather than half-built into the Stabilize flow it doesn't belong in.

Tests: 8 new assertions — `hasHealersKit` gating, kit-stabilize auto-succeeding on a
would-otherwise-fail roll, charge decrementing from a lazy 10, the Healer feat's +1 HP only
appearing when both the kit AND the feat are present, and the automatic fallback to a real
Medicine roll once charges are exhausted.

Remaining "make the systems" items: the Healer feat's bigger heal action (above), a mount system
(Mounted Combatant), Battle Master maneuvers/superiority dice (Martial Adept), Unseen Servant's
ritual wiring through `openSummonSpellUI`, and the smaller "genuinely borderline" feats (Athlete,
Actor, Grappler, Inspiring Leader, Charger, Dungeon Delver, Crossbow Expert, Spell Sniper's
remaining clauses). Continuing in the next pass.

## "Make the systems" (6): small-feat batch — 8 feats built, 1 deferred (v120.205)

One batch, one version bump, following on directly from v120.203/v120.204's backlog.

- **Unseen Servant ritual wiring** (closes the v120.203 gap). `openSummonSpellUI` now takes a
  4th `ritual` param and threads it into both its `castSpell` call sites (out-of-combat and
  in-battle placement); `castModal`'s own ritual checkbox is no longer hidden for summon-kind
  spells (`canRitual` dropped the `kind==='summon'` exclusion) and its click handler passes the
  checkbox state through instead of dropping it on the floor. No slot, no action, exactly like
  every other ritual-tagged spell already got in v120.203.
- **Healer feat's second action** — "restore 1d6+4 + the creature's hit dice" to a conscious,
  injured ally, once per rest **per target** (PHB: the restriction belongs to the creature
  healed, not the healer). `c.healerFeatSpent` lives on the target, resets unconditionally on
  ANY rest (short via `spendHitDie`, long via `#restBtn`) regardless of whether that character
  has the feat themselves — same convention `echoAvatarUsed`/`shadowMartyrUsed` already use, no
  `ensureFields` entry needed since `!!c.foo` already defaults false. Eligibility
  (`healerHealTargets`) mirrors Preserve Life's shape but excludes self (PHB: "another
  creature") and requires `!p.healerFeatSpent` — that flag now rides along on `playerHello`'s
  mirror payload (and the DM's own `Object.assign` receiver) so the healer's own device can see
  it without a round-trip. Net relay reuses the existing generic `'apply'`/`healApply` message,
  tagged with `healerFeat:true` so the TARGET's own device (the only one that can legally set
  its own flag) flips `healerFeatSpent` when it lands.
- **Inspiring Leader** — level + CHA mod temp HP (`inspiringLeaderAmount`, floored at 0) to up
  to 6 creatures within 30 ft including self, once per rest (`c.inspiringLeaderUsed`, same
  target-is-the-healer reset convention as above but conditional on having the feat). Reuses
  Preserve Life's self+nearby-allies target shape exactly. Not gated behind the Action/bonus
  action — PHB frames it as a 10-minute activity, same treatment this app already gives other
  narrative-time abilities. Temp HP relay is its own message pair (`tempHpApply`/
  `tempHpApplied`) rather than reusing `healApply`, since temp HP takes the higher value
  instead of adding — the existing `'apply'` message is a straight delta, wrong semantics here.
- **Grappler** — advantage on attacks vs. a creature you've grappled. Grapple state already
  existed (`mo.grappledBy`, storing the grappler's own display name — a v120-something-earlier
  addition for Escape Grapple). Hooked into `Engine.hitResult` (the one shared resolver, same
  spot armor-proficiency disadvantage lives) via a new `grapplerAdv` opt on `attackAdvantage`,
  gated on `hasFeat` + `t.grappledBy===ad.name(a)` — applies uniformly across QB/DM-hosted/
  player-net since it's the one shared function, not a QB-only special case.
- **Charger** — after Dashing, a bonus-action melee attack (+5 damage) or 10-ft shove. New
  `dashed` flag in `freshTurnState`/`resetTurnState` only, set by both branches of the existing
  `k==='dash'` handler (normal Dash and Cunning Action Dash). The shove option needed
  `maneuverShove` to grow a `tiles` param (Charger pushes 10 ft/2 tiles, not the normal 5)
  **and** a `skipBudget` param — caught live: `maneuverShove` unconditionally spends the
  Action-based attack budget via `qbSpendAttackBudget`, which would have wrongly failed
  Charger's shove outright (the Action is already gone from Dashing) or double-spent it.
  `skipBudget:true` lets Charger's own caller (which already flags `c.battle.bonus=true`
  itself) bypass that gate cleanly instead. Attack option reuses `Engine.attack` directly
  (no action-economy side effects there to worry about).
- **Crossbow Expert** — two clauses, one built, one honestly deferred. (a) "No disadvantage
  firing a ranged weapon in melee": searched `Engine.hitResult`, `attackAdvantage`, and
  `attackFlow` — this app has never modeled that disadvantage anywhere, so there's nothing to
  waive. Noted, not built against a mechanic that doesn't exist (same "no model to hook"
  outcome the plan flagged as possible for Grappler, just for a different underlying reason).
  (b) The bonus-action hand-crossbow shot after the Attack action **is** built:
  `qbPcAttacks` now appends a second, `offhand:true`-flagged entry whenever the character owns
  a Hand Crossbow and has the feat — reuses the exact same bonus-action gate two-weapon
  fighting's off-hand attack already has, so it needed zero new UI plumbing.
- **Actor** — advantage on Deception/Performance checks to impersonate someone. This app
  doesn't track "is this specific check an impersonation attempt" any more than Favored
  Enemy/Natural Explorer track "the specific chosen enemy type" — same documented
  simplification: advantage whenever the skill is Deception or Performance at all, in
  `skillCheckAdvantage` (the same shared resolver Favored Enemy/armor-proficiency live in).
- **Athlete** — two clauses, one built, one honestly deferred, and the ratio is the OPPOSITE of
  what the plan guessed. (a) Standing from prone for 5 ft instead of half speed: this app has
  never modeled standing-from-prone as a costed action anywhere (Prone is just a toggled
  condition) — nothing to reduce, so nothing built. (b) Climbing at full speed: **is** modeled —
  the character-sheet's freeform `openMove` tool has a `Climb (×2)` movement-type option — so
  Athlete now zeroes that multiplier there (`hasFeat(c,'Athlete')`). Scope note: the grid-based
  QB/DM/player-net movement system computes cost from map terrain difficulty, not a distinct
  "climbing" terrain type, so this fix only applies to the freeform tool — not a duplicated
  mechanic to unify against, since climbing-as-a-cost only ever existed in the one place.
- **Dungeon Delver — deferred, not built.** Advantage detecting traps needs traps to exist as
  detectable map objects first; this app doesn't model traps at all. Genuinely nothing to hook,
  not a scope-cutting call — matches the plan's own prediction exactly.

Tests: 28 new assertions across `rules-test.js`. Notably: the Charger shove test caught the
`skipBudget` bug described above (it would have failed the "succeeds even with the Action
already spent" assertion outright without the fix) and a self-inflicted test-setup bug (the
shared 5×5 QB test map had no room for a genuine 2-tile push near its center — widened the
map for just that assertion rather than mis-asserting a 1-tile result as correct).

Remaining "make the systems" backlog: Battle Master maneuvers/superiority dice (Martial Adept),
then the mount system (Mounted Combatant — needs its own scoping pass first, biggest remaining
item). Both queued next per `VISION.md`'s roadmap.

## "Make the systems" (7): Battle Master maneuvers / Martial Adept (v120.206)

Superiority dice + maneuvers, delivered entirely through the existing attack-rider pipeline
(`attackRiderOptions`/`applyAttackRiders`, the same v120.199 system Sneak Attack/Divine Smite/
Divine Strike/Colossus Slayer/Hurl Through Hell already share) — no new modal, no new UI
surface beyond one more `<select>` alongside the existing smite-level dropdown.

- **Superiority dice pool**: `superiorityDiceMax(c)` — Battle Master (4 at 3rd, 5 at 7th, 6 at
  15th) + Martial Adept (flat +1), additive if a character somehow has both. `superiorityDieSize(c)`
  — d8 at 3rd scaling to d10 (10th) / d12 (18th) for Battle Master, always d6 for Martial Adept
  alone. `c.superiorityDiceLeft` resets on short OR long rest (`spendHitDie`/`#restBtn`), same
  `channelDivinityLeft`/`kiLeft` convention.
- **Curated v1 maneuver list — 4 of 6, by design**: Trip Attack (Str-or-Dex save or Prone),
  Menacing Attack (save or Frightened), Goading Attack (save or disadvantage on the target's own
  attacks against anyone but the goader), Distracting Strike (no save — next ally attack on the
  target has advantage). All four are uniformly "on a hit, roll the die, add to damage, maybe
  apply a condition" — the exact shape every existing rider already has.
  - **Precision Attack deliberately excluded**: PHB has it modify the TO-HIT roll itself, before
    the outcome is known — a structurally different mechanic from every other rider here (all of
    which resolve strictly after a confirmed hit). Building it would mean a second delivery
    system, not a 5th option on this one.
  - **Pushing Attack deliberately excluded**: needs the attacker's own grid position to compute
    a push direction, which `applyAttackRiders` was never given (unlike `maneuverShove`, which
    runs from a full adapter+unit call site with real coordinates). Threading position through
    would touch both call sites' signatures for one maneuver.
  - **Disarming Attack deliberately excluded**: this app has no dropped-weapon model, same gap
    that already blocked it in the original feat audit.
  - All three noted here, not half-built.
- **Goading Attack's disadvantage** is the one piece that needed new plumbing beyond "roll a die,
  add damage, maybe add a condition": `targetMo.goadedBy` (same "store the display name, not an
  id" convention `grappledBy` already established) is checked in `Engine.hitResult` itself — a
  new `goadedDisadv` opt alongside `grapplerAdv`/`armorDisadvantage` — so a goaded creature gets
  disadvantage on ITS OWN later attacks against anyone but the goader, correctly regardless of
  which mode (QB/DM-hosted/player-net) that later attack happens in.
- **Condition sync in player-net**: `applyManeuverCond` mutates the target's `.conds` locally
  (correct/authoritative in QB and DM-hosted) and additionally sends the existing `'moncond'`
  message when the caller is a connected player (`net.role==='player'`) — the same message
  `playerNetAdapter.addCond` already sends for Shove/Grapple-sourced conditions, so the DM
  receives and rebroadcasts it through the handler that already exists, no new message type.
- Save DC uses `8 + proficiency + max(Str mod, Dex mod)` — PHB lets the maneuver-user choose Str
  or Dex; this app auto-picks whichever is higher rather than adding a UI toggle, the same
  simplification Death Strike's own DC calc already uses one screen over.
- **Known-known maneuvers not tracked**: PHB restricts Battle Masters/Martial Adepts to
  maneuvers they've specifically learned (3 at 3rd, +2 at 7th/10th/15th for Battle Master; 2 for
  the feat). This app doesn't gate the curated 4 behind a "known maneuvers" pick list — anyone
  eligible (subclass or feat) can use any of the 4 as long as they have a die to spend. A
  deliberate simplification (avoids building an entire new level-up choice-picker for a 4-item
  curated list) rather than an oversight — flagged plainly, not silently narrower than it looks.

Tests: 26 new assertions — dice pool math (both progressions, stacking), rider eligibility
(weapon-only, dice-gated), Trip Attack's damage+Prone landing together end-to-end, Distracting
Strike's no-save guarantee, Goading Attack's disadvantage proven through the REAL
`Engine.hitResult(qbAdapter,...)` call (not just the pure `attackAdvantage` helper), and the
rest-reset convention. One test-authoring bug caught by its own failing assertion (actor/target
arguments swapped in the Goading Attack disadvantage check) — fixed before landing, not a
production bug, but exactly the kind of mistake this suite exists to catch.

Remaining "make the systems" backlog: the mount system (Mounted Combatant) — the last major
item, needs its own scoping pass before starting per `VISION.md`'s roadmap (it touches unit
movement/rendering across all three modes, comparable in scope to Echo Knight).

## Full backup export/import (v120.207)

VISION.md roadmap item #2 ("insurance against localStorage wipes"). Turned out to be smaller
than scoped: character export/import (`exportData`/`importData`, the App & Data menu's
⬇/⬆ buttons) already existed — the actual gap was that it only ever covered characters, not
DM campaigns or saved battle maps, both of which live in their own separate localStorage keys
(`grimoire.campaigns`, `grimoire.maps`).

- `exportData()` now bundles `{v:1, exportedAt, characters, campaigns, maps}` into one download
  (`grimoire-backup.json`) instead of a bare character array. The AI Narrator key
  (`grimoire.aikey`) is deliberately left out — it's a credential, not app data, and has no
  business ending up in a file someone might hand to a friend.
- `importData()` accepts BOTH the new bundle shape and the OLD bare-array format, so backups
  already sitting on someone's device from before this change still import correctly forever —
  detected by `Array.isArray(data)` vs. `data.characters` being present.
- **Merge is strictly additive, never overwrites**: characters skip existing `id`s (unchanged
  behavior), campaigns/maps skip existing name keys — restoring an old backup can't clobber
  newer local data by accident. Matches the safety posture the character-merge already had.
- No unit tests: both functions are fundamentally DOM/File-API-bound (`Blob`, `URL.createObjectURL`,
  `FileReader`), which `rules-test.js`'s stub DOM doesn't model (same reason `openSummonSpellUI`/
  `openMove`/every other modal-driving function in this app has no direct test either).
  Verified instead by actually driving the real functions in a live browser (Playwright):
  confirmed the exported bundle round-trips correctly end-to-end (export → wipe localStorage →
  import → all three data types restored), the never-overwrite guarantee holds on a re-import
  with conflicting data (0 new entries, existing data untouched), and the old bare-array format
  still imports cleanly.

Remaining "make the systems" backlog: the mount system (Mounted Combatant), still the last
major item and still needs its own scoping pass first.

## Mode-parity audit — first pass (v120.208)

The user's stated #1 annoyance: features wired into Quick Battle but not DM-hosted/player-net
(or the reverse). Ran a dedicated audit (grepped every `mode==='qb'`/`mode==='player'` gate
around whole feature blocks, cross-checked every `hasFeat`/`isX` subclass check's call sites,
and specifically re-verified the "12-subclass pass" and this session's own new systems). Fixed
5 confirmed gaps; found the rider system itself (Sneak Attack/Smite/maneuvers, v120.199+) is
genuinely unified already — not re-litigated.

- **Two-Weapon Fighting off-hand attack — was missing from QB entirely.** `playerAttackMenu`
  (player-net) already called `canOffhand`/`offhandWeapons`/`offhandAtk`; `qbPcAttacks` (QB
  grid combat) never did, so a dual-wielder in solo Quick Battle had no bonus-action off-hand
  attack at all — a core combat mechanic silently absent in the app's most-used mode. Fixed by
  calling the same shared helpers `playerAttackMenu` already used, adapted to `qbPcAttacks`'s
  flat-array shape.
- **Crossbow Expert's bonus shot (v120.205, this session) — was missing from player-net.**
  Built into `qbPcAttacks` when the feat shipped, never ported to `playerAttackMenu` — meaning
  a Crossbow Expert in a DM-hosted game lost their bonus-action shot. The exact bug class the
  user described, in code from three commits ago. Fixed.
- **Custom "Add attack" entries (`c.attacks`) — were missing from player-net.**
  `qbPcAttacks` folds these in; `playerAttackMenu` never did, so a hand-added attack on a
  character sheet silently vanished in DM-hosted play. Fixed.
- **Charger (v120.205, this session) — was unreachable in REAL combat in BOTH modes.** The
  Use-menu button was correctly built mode-shared (`mode &&`), but gated on `c.battle.dashed`,
  which was only ever set by the character sheet's manual battle-tracker Dash button — the
  actual grid-combat Dash paths (QB's `commitMove`, player-net's move handler), the way anyone
  actually Dashes during a real battle, never set it. A feature that shipped fully wired to the
  UI but was never actually triggerable. Fixed by setting `b.dashed=true` in both grid-Dash
  branches, mirroring the sheet tracker's existing line.
- **Assassinate's auto-crit / Death Strike surprise toggle — was QB-only by a stale, overly
  cautious call.** The resolver half (`attackFlow`, `Engine.hitResult`) was already correctly
  mode-agnostic — the gap was purely the UI toggle that flags a monster Surprised, gated
  `mode==='qb'` with a comment reasoning player-net's monster list is "just a synced mirror"
  and wouldn't reach the DM. True but irrelevant: the toggle, `attackFlow`'s own target lookup,
  and `Engine.attack`'s adapter `unit()` call all read the SAME `net.session.monsters` array by
  reference — this device's own subsequent attack sees the flag correctly with no round-trip
  needed. Widened the gate to `mode` (both modes); other devices not seeing the mark is a real,
  acceptable gap (nobody else needs to know), not a reason to block the mechanic.

**Known architectural debt, flagged not fixed**: `qbPcAttacks` and `playerAttackMenu` remain
two separately-maintained lists of "what can this character attack with right now" — the root
cause behind 3 of the 5 findings above. A proper fix extracts one shared `pcAttackList(c)` both
consume; deferred this pass since `playerAttackMenu` is a DOM-rendering function with its own
label/sub-text formatting (including a "reach" vs "melee" display nuance) that would need
careful untangling, and a rushed refactor of live combat-attack UI carries more regression risk
than the direct patches shipped here. Next mode-parity pass should do this extraction — until
then, any NEW attack-list feature (a future feat, say) must be added to BOTH functions by hand,
same as this pass's own findings.

Tests: 2 new assertions (`qbPcAttacks`'s off-hand fix, directly testable). The other four fixes
are one-line/small-diff changes to already-tested code paths (movement cost calculation, a
UI-gate boolean, a mirrored-list addition matching an already-tested sibling) verified by
direct code inspection rather than new automated tests — `playerAttackMenu`/the Use-menu modal
are DOM-rendering functions with no return value to assert on, same reason `openSummonSpellUI`/
`openMove` have no direct tests either.

## Mode-parity audit — follow-up: `pcAttackList` unification (v120.209)

Closed the architectural debt flagged in v120.209's own note above: `qbPcAttacks` and
`playerAttackMenu` were two hand-maintained lists of "what can this character attack with
right now," the root cause behind 3 of the previous pass's 5 findings. Extracted one shared
`pcAttackList(c)` — `qbPcAttacks` is now a thin wrapper around it; `playerAttackMenu` consumes
it too, translating each flat `{name,toHit,dmg,dt,tiles,melee,reach,vers,offhand}` entry into
its own `{label,sub,atk}` modal shape. A future attack-granting feature (a feat, a class
feature) now only needs to be added in ONE place — the exact bug class from v120.208's audit
becomes structurally impossible to reintroduce for anything routed through this list.

- Preserved `playerAttackMenu`'s "reach" vs "melee" display distinction (a cosmetic label
  difference the unification could easily have dropped) by adding a `reach` field to the
  shared list rather than deciding it wasn't worth carrying over.
- Picked up `vers` (versatile weapon two-handed damage) as a side effect — `qbPcAttacks` never
  had it, `playerAttackMenu` always did; `attackFlow` (the actual attack-resolution modal both
  paths route through) already reads `atk.vers` generically, so QB combat gains the versatile
  weapon toggle for free rather than needing its own separate fix.
- Verified two ways: `rules-test.js` now asserts `qbPcAttacks(c)` and `pcAttackList(c)` produce
  byte-identical output (proving the wrapper claim, not just asserting it in a comment) plus
  direct coverage of all 3 previously-drifted features landing together in one list. Then,
  since `playerAttackMenu` itself still has no return value to unit-test, drove the REAL
  function live in a browser (Playwright) with a character rigged with off-hand-eligible
  weapons + Crossbow Expert + a custom attack — confirmed the rendered modal HTML shows every
  entry with correct labels/formatting, not just that the underlying data array is right.

Remaining "make the systems" backlog: the mount system (Mounted Combatant), still needing its
own scoping pass. Mode-parity audit itself can be considered done for this pass — the
Sneak-Attack-family riders were already unified (v120.199), the 5 acute gaps are fixed
(v120.208), and their structural root cause is closed (this entry). Future passes should watch
for the same pattern (a feature built once and wired into only one UI trigger path) rather than
assuming it's fully solved forever.

## "Make the systems" (8): mount system — Mounted Combatant (v120.210)

Built a real mount system, closing the last item on the "make the systems" feat-audit backlog.
`MOUNT_CATALOG` (Pony/Riding Horse/Warhorse) sits alongside `SUMMON_CATALOG`; mounting spawns
the mount as a real `s.monsters` entry (`ally:true, mount:true, controllerId, riderId`) so it
shows up on the map, can be targeted, and is correctly excluded from `isHostile`. `effSpeed`
swaps to the mount's speed while mounted (same pattern as Wild Shape). Mounted Combatant's
advantage-on-melee-attacks-against-smaller-foes clause is wired into `Engine.hitResult` via a
`mountedAdv` opts flag, gated on melee + the feat + the rider being mounted (the "against a
creature smaller than your mount" size clause is dropped — see below).

Mounting/dismounting both cost half a movement action (RAW), spent from the relevant unit's
current `battle.move` — mounting spends half the character's own (pre-mount) speed, voluntary
dismounting spends half the MOUNT's speed. A mount dropping to 0 HP force-dismounts its rider
for free (`checkMountDeaths`, hooked into `qbCheckEnd()` for QB and the DM's `'attack'` handler
for DM-hosted) since a dead mount obviously can't be ridden regardless of movement budget.

Shared across all 3 modes from the start, per the standing unification rule: one `mountUp`/
`dismountRider`/`checkMountDeaths` set of functions, with player-net wired via `sendMountSync`
(mirrors `sendEchoSync` exactly — local mutation + a net message so the DM's authoritative state
picks it up) and a `mountDied` DM→player message for the forced-dismount case.

Honestly deferred (documented inline where each is dropped, matching this session's practice of
naming cuts rather than silently shipping a partial feature):
- **Redirect-attacks-to-mount clause** (Mounted Combatant lets the rider redirect an attack
  targeting them onto the mount instead) — no redirect UI hook exists yet; would need the same
  shape as `shadowMartyrRedirect` but wasn't built this pass.
- **Mount takes half/no damage on an AOE the rider Dex-saves** — no such split exists anywhere
  in the damage-application path; would require a new AOE-companion-damage rule, out of scope.
- **"Smaller than your mount" size qualifier on the advantage clause** — no creature-size field
  exists anywhere in the bestiary or `MOUNT_CATALOG`; the advantage clause is granted for any
  melee attack while mounted with the feat, slightly more generous than RAW.

Tests: 18 new assertions in `rules-test.js` — unmounted/mounted `effSpeed`, `mountUp` spawning
a correctly-tagged ally unit with movement cost deducted, Mounted Combatant's advantage gating
(feat+melee → adv; feat+ranged → no adv, using a distant foe to force real-distance melee=false;
no feat → no adv), voluntary `dismountRider` (clears `mountedOn`, reverts `effSpeed`, costs the
mount's own movement), re-mounting after a dismount, and `checkMountDeaths` force-dismounting
when a mount hits 0 HP. Also live-verified via Playwright end-to-end against the real DOM: the
Use-menu correctly shows "Mount Up"/"Dismount \<name\>" buttons based on `c.mountedOn` state,
clicking through to a real `MOUNT_CATALOG` pick spawns the mount and updates `effSpeed`, and
dismounting with a fresh movement budget correctly clears `c.mountedOn`. (An initial dismount
attempt with no movement remaining was correctly blocked by the cost gate — confirms the guard
works, not a bug — see the movement-cost note above.)

## Multiclassing v1 (v120.211)

Closed the roadmap's #1 requested feature: characters can now take levels in a second (or
third, etc.) class, following the user's explicit priority pick over the other remaining large
items (combat depth, modularization). This is the biggest single change this app has taken —
touching character data, the level-up flow, and roughly 30 class-feature-scaling call sites —
so it shipped with a deliberately bounded, honestly-documented v1 scope rather than attempting
full RAW breadth in one pass.

**Data model:** `c.classes = [{cls, level, subclass}]`, in the order taken (`c.classes[0]` is
your PRIMARY/starting class). `c.cls`/`c.subclass`/`c.level` remain plain fields — kept as
aliases of the primary class / total level — so every pre-existing single-class-scoped system
in this ~12,500-line file keeps working completely unchanged. New helpers: `classLevel(c,cls)`,
`classSubclass(c,cls)`, `myLevel(c)` ("my primary class's own level" — provably identical to
`c.level` for any single-class character), `totalLevel(c)`, `classLabel(c)` (display string),
`hitDiceLabel(c)`, `meetsMulticlassPrereq(c,cls)` (soft-checked 13-in-relevant-ability warning,
not enforced — DMs vary, and enforcing it could block reconstructing an imported character).

**What's genuinely multiclass-correct:** total character level (proficiency bonus, HP, the L20
cap); each class's own hit dice (dice COUNT is always the true total, sized to your primary
class's die — see the dedicated simplification note below); each class's own ASI/feat
progression (a Fighter 3/Wizard 5 correctly hasn't hit Fighter's first ASI yet, even though
total level is 8); subclass selection captured PER CLASS (even a secondary class's subclass is
stored, ready for a future pass); and — the mechanic multiclassing exists for — a correctly
combined spell slot pool: full-caster classes sum their levels, half-casters (Paladin/Ranger/
Artificer) contribute half rounded down, and the combined caster level looks up the SAME
`SLOTS_FULL` table a solo full-caster uses (the multiclass rules reuse it on purpose, per PHB).
Warlock's Pact Magic is never folded into that sum — its own `warlockSlots()` count is computed
separately and layered on top of whatever's already at that spell level, consistent with how
this app already treated a solo Warlock's slots (long-rest-recovering, not a separate
short-rest pool) rather than a new gap introduced by multiclassing.

**Deliberate v1 boundary — class FEATURES stay scoped to your PRIMARY class only:** the ~30
existing formulas for class resource pools and feature-granting content (Rage damage/uses, Ki
points, Channel Divinity uses, Lay on Hands pool, Martial Arts die, Bardic Inspiration die,
Sneak Attack/Divine Strike dice, Sorcery Points, expertise, and every entry in
`pendingChoiceSpecs` — Fighting Style, Metamagic, Favored Enemy, Hunter's Prey, Eldritch
Invocations, Pact Boon, etc.) were already implicitly "your one class's own level" before
multiclassing existed; they're now correctly `myLevel`-based (a genuine bug fix — previously a
multiclassed primary-class character would have read their TOTAL level for these, e.g. a
Fighter 3/Wizard 5 would have wrongly scaled Second Wind or a Battle Master die off level 8) but
they remain intentionally primary-class-only. A secondary spellcasting class's new spells known
aren't auto-prompted at level-up (the modal shows a note pointing at the Spells tab's own Add
button instead, which isn't level-gated). Modeling per-class feature ownership for a SECONDARY
class is real future work, not silently promised here.

**Hit dice simplification (documented, not a bug):** RAW tracks a separate short-rest-healing
pool per class die size. This app's hit-dice spend/recovery system (`parseHitDice`,
`spendHitDie`, the pip UI) only ever tracked one `{count,sides}` pair, even before
multiclassing — rather than build a new per-class-pool spender, `hitDiceLabel` keeps the dice
COUNT exactly right (every level, any class, is one hit die — you never have fewer to spend
than you actually own) and only approximates the SIZE as your primary class's die for any
secondary-class levels.

**Level-up UI:** a class-picker now sits atop the level-up modal — defaults to your primary
class (so anyone who never touches it sees an unchanged flow), lists every class you've already
taken plus a "multiclass into a new class" group for the rest. Picking a new class shows a
non-blocking ability-score-prerequisite warning (Fighter is RAW's one "either" prerequisite —
Strength 13 OR Dexterity 13 — everything else in the table is "and"). HP rolls/averages use the
SELECTED class's own hit die; ASI/subclass timing is checked against that class's own new level.

Found and fixed one real regression during testing, not just new code: `ensureFields` (which
runs on every load) was unconditionally overwriting `c.cls`/`c.level`/`c.subclass` FROM
`c.classes[0]` — for a single-class character this meant any code that set those fields directly
(several existing tests do exactly this, e.g. `pd.cls='Paladin'`) got silently reverted back to
whatever `classes[0]` happened to still say. Fixed by making the single-class sync direction
mirror the LIVE fields INTO `classes[0]` instead (only for length-1 arrays; a genuine multiclass
array, which only `levelUp` ever produces, stays the authoritative source) — this makes
`classLevel`/`myLevel`/`totalLevel` immune to `c.classes` going stale relative to a direct field
mutation anywhere in the app, present or future.

Tests: 25 new assertions in `rules-test.js` covering the single-class no-op guarantee for every
new helper, the `ensureFields` clobbering regression directly, a genuine two-class breakdown
(`classLevel`/`classSubclass`/`myLevel` all reading correctly, proven against a case where
primary-class-level and total-level differ — Battle Master's die size), the combined spell slot
table for both a caster/non-caster mix and a half-caster+Warlock mix, a solo Warlock proven
unaffected by the multiclass code path, and the ability-score-prerequisite OR/AND distinction.
Also live-verified via Playwright end-to-end against the real DOM: the class-picker correctly
lists existing classes with their current level plus multiclass options, switching to a new
class correctly swaps the HP die and prerequisite warning and suppresses the primary-only
spell-learning section, and applying a level correctly updates `c.classes`, the primary alias,
total level, and the composed hit-dice string — checked for both a fresh multiclass entry and a
second level taken in an already-existing secondary class, plus a plain single-class level-up
confirmed byte-for-byte unchanged in outcome.

## Magic items + attunement (v120.212)

Closed another VISION.md wishlist item. Previously the only way to give a character a magic
item was the freeform "custom item" box (a name + a flat AC number, nothing else) or the
temporary Magic Weapon spell effect — there was no curated catalog, no attunement limit, and no
item ever granted a bonus to anything but AC. Built a real (if intentionally curated) magic item
system on top of the gear-mods infrastructure that already existed for mundane equipment.

**Curated `MAGIC_ITEMS` catalog** (`Cloak of Protection`, `Ring of Protection`, `Bracers of
Defense`, `Ioun Stone of Protection`, `+1/+2/+3 Weapon`, `+1/+2 Armor`, `+1 Shield`) — the same
"real, additive, curated" scope this app already applies to spells/monsters/maneuvers/
invocations. Left out on purpose: any item whose RAW effect **sets** an ability score outright
(Belt of Giant Strength, Headband of Intellect, Gauntlets of Ogre Power, Amulet of Health) —
this app's gear-mods system (`gearBonus`) is purely additive, and "set to 19 unless already
higher" doesn't fit that shape without a second, different mechanism; approximating it as a flat
`+N` would be silently wrong for a character whose score already exceeds the item's floor, so it
was left undone rather than shipped subtly incorrect.

**Attunement**: `it.attuned` lives directly on the item (no separate index-tracking array, so
it's immune to reordering when other items are added/removed — the same convention `it.equipped`
already used). `toggleAttune(c,idx)` enforces the real RAW shape: the item must be equipped
first, and a character can have at most 3 items attuned at once. `gearBonus` now gates an
attunement item's mods on `equipped && attuned` together — everything else (mundane gear, and
the non-attunement +N weapons/armor) still only ever needed `equipped`, unchanged.

**Enchanting an existing weapon/armor/shield** (the `+N Weapon/Armor/Shield` catalog entries)
targets an item you already own rather than creating a second item alongside it — RAW-correct
(a "+1 Longsword" is one item, not a mundane longsword plus a separate "+1 Weapon" trinket).
`enchantWeapon` reuses the exact `it.magicBonus` field the Magic Weapon spell effect already
established, so `weaponToHit`/`weaponDmgBonus` needed zero changes to pick up a permanent
enchantment the same way they already handle a temporary spell one.

**Found and fixed a real unification gap while building this**, not just new code: saving-throw
totals were duplicated inline at 5 separate call sites across the file, and none of them added a
flat item or effect bonus — so a Cloak of Protection's +1-to-all-saves half worked (AC) and half
silently didn't (saves), which would have shipped as a real bug if not caught. Extracted one
`saveMod(c,ability)` function and rewired all 5 display sites plus, more importantly,
`abilCheckBonus` — the single function every adapter's `saveBonus` already shares, i.e. the
actual gameplay-critical path real saving throws resolve through in combat (Sanctuary, Holy
Aura, spell saves, hazard saves) — to go through it too. This is the same "one shared function,
not five copies" house rule this app already enforces for feats/mode-parity, just newly applied
here.

Tests: 20 new assertions — attunement gating on `gearBonus` (equipped-only vs. equipped+attuned),
the 3-item cap and its release on un-attuning, `computeAC`/`saveMod` both reflecting an attuned
item's bonus (proving the saveMod fix, not just asserting it), and `enchantWeapon`/
`enchantArmorLike` applying correctly (including refusing a wrong-kind item index). Also
live-verified via Playwright against the real DOM: adding a Cloak of Protection from the picker,
equipping it, attuning it through the real button, and confirming both the rendered AC tile and
`saveMod` change — plus the weapon-enchant flow's conditional "which weapon?" picker appearing
only for target-needing catalog entries and correctly applying `magicBonus` to the chosen item.

## DM-placed traps (v120.213)

Closed another VISION.md wishlist item (traps/hazards) — specifically the DM-authored-trap half;
spell/AOE-created hazards (Grease, gas clouds, etc.) already existed. Built on the existing
`s.hazards` cell-tracking infrastructure's sibling shape rather than reusing it directly: a trap
is single-tile, one-shot, and non-expiring-by-timer, different enough from an AOE zone that a
dedicated `s.traps` array (not `s.hazards`) was the honest fit.

**Curated `TRAP_CATALOG`** (Pressure Plate, Spiked Pit, Poison Needle Trap, Fire Rune, Lightning
Rune) — same "real, additive, curated" scope as every other content table this pass. A DM places
one via the exact same click-to-paint brush pattern terrain/decor already use (a new `x:`-
prefixed selection alongside the existing `t:`/`d:` ones), one trap per tile.

**Trigger resolution reuses the mode-split this app already established** for terrain hazards
(`checkTerrainHazardCond` vs. `sendTerrainHazardCheck`) for the same reason: QB and DM-hosted
monsters have their real stat block locally and can just roll the save (`checkTrapTrigger`), but
a connected player's real sheet only lives on their own device, so DM-hosted's player-move path
sends a message and lets them resolve it locally (`sendTrapTriggerCheck`) — reusing the *exact*
existing `'hazard'` net message shape wholesale (a trap just populates the `dmg` field that a
terrain hazard message leaves empty), so no new message type was needed at all. Hooked into
all 5 real movement-commit call sites: QB player (`commitMove`) and monster (`qbApplyIntent`)
movement, and DM-hosted's monster-move, DM-manual-player-move, and player-self-reported-move
paths — the same 5 sites `checkTerrainHazardCond`/`sendTerrainHazardCheck` already hook into.

**Found and fixed a real privacy bug while building this**, not shipped-then-discovered: traps
are meant to be invisible to players until sprung, but `dmBroadcast` sends the DM's *entire*
session object to every connected player's device — an un-redacted `s.traps` array would leak
every hidden trap's exact map location to anyone willing to open devtools on their own client,
regardless of whether they'd have any legitimate way to know it was there. Fixed by having
`dmBroadcast` send a copy of the session with untriggered traps stripped (triggered ones still
go out — no longer a secret once sprung) rather than the raw array, without touching the DM's
own live `session.traps` state.

Deliberately out of scope, documented inline: no passive-Perception "spot the trap" check (traps
are simply invisible until triggered, not findable/disarmable — a real simplification, not a
half-built search mechanic) and no re-arming (every trap is strictly one-shot; RAW some can
reset but most published ones don't bother, and this app doesn't need the complexity for what's
already a curated feature).

Tests: 14 new assertions — `checkTrapTrigger`'s fail/save branches (forced deterministic via an
absurd DC, the same trick this app's own hazard tests already use) proving damage, halving on a
save, condition-on-fail-only, and trigger-once idempotency; `sendTrapTriggerCheck`'s message
shape and immediate triggered-marking; and — most importantly, since it was a real bug this pass
caught rather than shipped — `dmBroadcast`'s redaction, proving an untriggered trap never
appears in what a connected player's device receives while a triggered one still does, and that
the DM's own live state is untouched by the redaction copy. Also live-verified via Playwright
against the real DOM: placing a trap through the actual palette+click-to-place UI, moving a
monster onto it through the DM's real move-token handler and confirming HP/condition/triggered
state all update correctly with a real d20 roll, and confirming a simulated connected player's
`dmBroadcast` payload only ever contains the now-triggered trap.

## Homebrew monster editor (v120.214)

Closed another VISION.md wishlist item. `openNpcBuilder`/`deployNpc` already let a DM improvise
a one-off named NPC with real ability scores, but it was never reusable — every "New NPC" was a
fresh, throwaway deploy, not saved anywhere. This builds the actual gap VISION.md named: a
`MONSTERS_5E`-shaped custom monster, persisted (`localStorage.grimoire.homebrewMonsters`) and
reusable across encounters and sessions, indistinguishable from a curated bestiary entry to
every other system once saved — same fields (`n,cr,ac,hp,spd,init,attacks,sprite,atk,desc`), so
`Deploy`, the RVI lookup, and every stat derivation just work without special-casing "is this
homebrew" anywhere except display (a small 🛠 badge in the Bestiary list).

**Found and fixed a real correctness gap while wiring this up**: `monsterSaveBonus`/`monsterCR`
(the CR-derived save-bonus/threat-level approximation every monster in this app uses, since
individual save modifiers aren't tracked) looked up a deployed monster's definition via
`MONSTERS_5E.find(...)` directly — meaning a homebrew monster, once deployed, would silently
fall back to "CR 1" for its own saving throws and CR-gated logic (Colossus Slayer's "not at max
HP" check doesn't care, but Circle of the Moon's `moonMaxCR`-style CR comparisons elsewhere
would have been wrong). Extracted one `monsterDef(name)` — curated bestiary first, homebrew
second — and rewired the 3 real per-monster lookup call sites (`monsterSaveBonus`, `monsterCR`,
`moverStrMod`'s "no real ability scores, guess from CR" fallback, and `openMonsterSheet`'s stat
display) through it, the same "one shared lookup, not several copies that can drift" fix this
session keeps finding and applying.

The Bestiary modal (`openBestiary`) now merges homebrew monsters into the same searchable,
deployable list as the curated 35, with Edit (locks the name field — renaming would silently
orphan any already-deployed instance's `mo.base` lookup) and Delete actions that only appear on
homebrew entries; a "🛠 New homebrew monster" button opens the editor directly from there.

Tests: 12 new assertions — `monsterDef` resolving curated-first-then-homebrew and returning null
for neither, `monsterCR`/`monsterSaveBonus` correctly deriving from a homebrew monster's real CR
(proving the bug fix, not just the lookup), save-in-place on a re-save with the same name (no
duplicate entries), and delete correctly removing both the storage entry and `monsterDef`'s
ability to find it afterward. Also live-verified via Playwright against the real DOM: creating a
homebrew monster through the actual editor form, confirming it appears in the Bestiary with the
homebrew badge and updated count, deploying it and confirming the live `net.session.monsters`
entry's CR/save-bonus resolve correctly (not the CR-1 fallback), and editing it in place with
the name field correctly locked.

## Encounter Builder (v120.215)

Closed another VISION.md wishlist item, and the natural pairing for the Bestiary/homebrew work
just shipped — a DM can now build a multi-monster encounter (search, add curated or homebrew
monsters one at a time, remove any pick) and see a live, correctly-computed difficulty rating
against the CURRENT connected party's actual levels before ever deploying anything, instead of
eyeballing it or deploying blind and finding out mid-fight.

Standard DMG (2014) XP-budget tables, not app-specific approximations: `CR_XP` (CR → XP value,
the real table up to CR 30 so a high-CR homebrew monster still resolves correctly, not just
whatever's in the curated 35), `CHAR_XP_THRESH` (per-character Easy/Medium/Hard/Deadly
thresholds by level, summed across the party), and the DMG's own monster-count multiplier table
— including its party-size adjustment (bump the multiplier UP one step for a party smaller than
3, DOWN one step for a party larger than 5) rather than just the flat multiplier, which would
otherwise misjudge difficulty for anything but a standard 3–5 player party.

`encounterDifficulty(crs, partyLevels)` is the one function every other piece reads from — the
live readout in the builder modal, and (documented as the reason it's exposed as a clean pure
function rather than baked into the UI closure) available for a future "is this fair?" check
elsewhere without rebuilding the math. Deploying reuses `deployMonster` per pick — no new
spawn/naming logic, exactly the same numbering (`Goblin 1`, `Goblin 2`, …) and stat derivation
an individually-deployed monster already gets, so an encounter-builder monster is in every way
identical to one added any other way.

Tests: 16 new assertions — `crXP`/`partyXPThresholds` against hand-computed DMG values, the
multiplier table's party-size bump in both directions (and that it never goes below the ×1
floor), and `encounterDifficulty` end-to-end against a worked example (4 Goblins vs a 4-person
level-3 party rates Easy; the same 4 Goblins vs a lone level-1 character rates Deadly — proving
the party-size/level sensitivity, not just that a number comes out). Also live-verified via
Playwright against the real DOM: searching and adding real bestiary entries through the actual
picker, confirming the live difficulty readout recalculates correctly on every add (including
correctly rating the encounter tougher against a real 2-player party than the isolated unit
test's 4-player scenario, proving the party-size multiplier bump fires in the live UI too, not
just in a hand-constructed test), and confirming Deploy spawns every pick into the real
`net.session.monsters` with correct sequential naming.

## Combat undo — QB only (v120.216)

Closed the last item on this pass's VISION.md list, deliberately scoped down from "combat undo"
in general to Quick Battle specifically. DM-hosted/player-net were left out on purpose, not
overlooked: undoing a networked battle means reconciling three potentially-diverged copies of
state across devices (the DM's authoritative session, the DM's own local UI, and whichever
player's turn it was) — a materially different, harder problem than QB's single-device case,
and not attempted half-built. Also deliberately turn-granularity ("restart my whole turn"), not
a per-click undo stack: instrumenting every individual action type (attack/spell/move/reaction)
across QB's combat surface for surgical single-step undo would be a much larger, riskier change
for comparatively little extra value over "let me just redo the turn I botched" — the same
"curated over exhaustive" scope call this session keeps making, applied to a mechanic instead of
a content table this time.

One deep-clone snapshot of the entire QB state, taken the moment the PC's own turn begins
(`qbBeginTurn`'s PC branch) and refreshed at the start of every subsequent turn — not cleared
after use, so pressing Undo again before ending the turn keeps reverting to that same
turn-start point if the redo attempt goes wrong too. A new "↩ Undo turn" button sits next to
End Turn, enabled only during the PC's own turn when a snapshot exists.

**Found and fixed a real reference-identity bug before it shipped**, caught by reasoning through
what `save()` actually persists rather than just eyeballing the restored state: `QB.players[0].c`
is the *same object* the character lives at inside `DB` (`startQuickBattle` captures the real
character, not a copy, so every battle mutation writes straight through to what gets saved). A
naive `QB = <cloned snapshot>` would have silently swapped in a disconnected clone — the screen
would show the reverted HP right after undo, but `save()` would keep persisting the character's
*pre-undo* state to localStorage forever after, and every action taken for the rest of that
turn would mutate the orphaned clone instead of the real character, permanently diverging what's
displayed from what's saved. Fixed by wiping and repopulating the real character object's fields
in place from the snapshot, then re-pointing the restored QB at that same real object, instead
of replacing the reference outright.

Tests: 7 new assertions — HP/monster-HP/log all correctly reverted, the reference-identity fix
proven directly (`QB.players[0].c === ` the real DB object, not a clone, and localStorage
reflects the reverted HP — not just that undo "looks" like it worked), and repeatability (a
second undo before ending the turn reverts to the same snapshot again). Also live-verified via
Playwright through a real `startQuickBattle` battle end-to-end: confirmed the button is
correctly disabled during the monster's turn and enables once the PC's turn actually begins (not
just whenever a snapshot object happens to exist), then simulated a full turn's damage/movement/
log changes and clicked the real button — HP, position, remaining movement, monster HP, and the
log all reverted correctly, with the reference-identity fix confirmed live (the post-undo
`QB.players[0].c` really is `cur()`, and `cur().hp.cur` really is what got persisted).

## Fix: mounting had no ownership check at all (v120.217)

Real bug report: the in-combat "Mount Up" option was offered to every character regardless of
whether they owned a mount — `MOUNT_CATALOG` was the full 3-entry list with no gate, so anyone
could climb onto a Warhorse out of thin air. Added `c.ownedMounts` (an array of `MOUNT_CATALOG`
ids, defaulted empty by `ensureFields`) and a new "🐴 Mounts" card on the character sheet
(Equipment tab) with tap-to-toggle ownership chips. The Use-menu's "Mount Up" button now only
shows when `ownedMounts.length>0`, and the mount picker itself only lists the specific mounts
that character actually owns, not the whole catalog.

`mountUp()` itself deliberately stays ungated — the ownership check lives at the UI layer
(Use-menu button + picker filtering), not inside the mechanic, because a Find Steed-style spell
(see below) should be able to summon a mount regardless of what's ticked on the sheet. Gating
inside `mountUp` would have meant either duplicating the function for a spell-summoned path or
threading a bypass flag through it — cleaner to keep the mechanic itself permissive and let each
caller decide whether ownership applies.

**Not built this pass, flagged for the user during triage**: D&D 5e has real mount-summoning
spells — Find Steed (Paladin, 2nd level) and Find Greater Steed (Tasha's, 4th level) summon a
bonded spirit mount that vanishes at 0 HP rather than dying for real; Phantom Steed (3rd level)
is a travel-only illusory mount that can't fight. None of these exist in this app yet. They'd
reuse `mountUp()`/`dismountRider()` directly (same mechanic, just spell-triggered instead of
sheet-gated) — a natural, cheap follow-up given the mechanic and UI are both already built, but
out of scope for this specific bug-fix pass since it wasn't what was reported broken.

Tests: 2 new assertions — `ensureFields` defaults a fresh character to owning no mounts (the
actual bug: nothing was ever declared "owned" because the app never asked), and doesn't clobber
an already-set `ownedMounts` list on repeated calls (the same self-healing-migration idempotency
every other `ensureFields` field gets tested for). Also live-verified via Playwright: the sheet's
Mounts card renders the 3 catalog toggles, tapping one persists to `c.ownedMounts`, the Use-menu
correctly hides "Mount Up" with zero owned mounts and shows it once one is owned, the mount
picker correctly lists ONLY the owned mount (not Pony/Riding Horse when only Warhorse is owned),
and mounting itself still works end-to-end through the real gated flow.

## Find Steed / Find Greater Steed (v120.218)

User follow-up to the mount-ownership fix: real RAW spells (Find Steed, Paladin 2nd; Find
Greater Steed, Paladin 4th, Tasha's) let a Paladin magically summon a bonded mount, no ownership
needed. Built on top of the exact same `mountUp`/`dismountRider` mechanic the ownership fix just
gated — this is precisely why that gate lives at the UI layer instead of inside `mountUp`
itself: a spell-summoned steed needed to bypass ownership cleanly, and now does, with zero
changes to the mechanic itself.

Added both spells to the real spell data (`SPELL_SRC`/`SPELL_DESC`, Paladin-only, Conjuration)
so they show up naturally in spell prep/learning. Casting either routes through a new
`openFindSteedUI` (mirroring `openSummonSpellUI`'s established "cast → pick → spawn" shape, but
skipping the placement step entirely — you're mounted immediately at your own tile, matching the
spell's actual effect rather than making the player click a target tile for a horse they're
about to be sitting on anyway).

Two RAW-specific differences from a mundane owned mount, both driven by a `findSteed:true` tag
on the summoned unit: it vanishes ("leaves behind no physical form") from `s.monsters` entirely
on dismount OR at 0 HP, rather than staying on the map like a real animal/dead body would; and
re-casting the SAME spell while already bonded (`c.findSteedBond={spell,mountId}`) restores the
existing steed to full HP instead of prompting the picker again for a second one — pulled the
spell-cast-time slot cost apart from that check with a `hp>0` live-bond guard in `openFindSteedUI`
itself so a genuinely-vanished (0 HP) bonded steed correctly falls through to a fresh pick
instead of silently doing nothing.

Extracted the actual spawn/restore logic (`findSteedSummon`, `findSteedRestore`) out of the
modal's click handlers into standalone functions — this app's stub test DOM can't simulate real
button clicks (`document.querySelectorAll` always returns `[]` there), so anything meant to be
unit-tested rather than Playwright-only needs to live outside the click handler itself, same
reasoning `mountUp`/`dismountRider` were already written this way for.

Tests: 12 new assertions — the catalog's real PHB/Tasha's option lists, a real 2nd-level slot
actually being consumed (not a free/no-slot spell), `findSteedSummon` correctly tagging and
bonding, `findSteedRestore` healing the same unit (not spawning a second) and correctly
returning null for a different spell name or a fully-vanished bond, and vanish-on-dismount/
vanish-at-0-HP both confirmed via `dismountRider`/`checkMountDeaths` directly. Also live-verified
via Playwright: `routeCast` correctly opens the real picker showing all 5 Find Steed options,
picking one consumes a real slot and mounts immediately, and — the trickiest case — re-casting
after resetting the turn (a live bug in the FIRST attempt at this check turned out to be the
test forgetting to reset action economy between casts, not app code, confirmed by checking
`canCast`'s real return value directly before concluding anything) correctly restores the same
wounded steed to full HP with no duplicate spawned, while dismounting confirmed the unit
vanishing from the live map.

## Modularization Stage 1: data.js (v120.219)

User called out that the roadmap's own stated order — modularize *before* combat depth/
multiclassing "so the big systems land in clean modules" — got skipped: this session built
magic items, traps, encounters, homebrew monsters, and multiclassing straight into the single
file, which kept growing (13,179 lines by the time it was flagged). Fixed by executing Stage 1
of the documented staged plan: extract every pure content table into `data.js`, leave all rules/
UI logic in index.html. Not a big-bang rewrite — VISION.md is explicit that staged-with-tests-
green-after-each-step is the only acceptable way to do this, and Stage 1 (data only, zero logic)
is the lowest-risk possible slice to go first.

**89 top-level tables moved** — the full content layer: every spell/monster/class/race/feat/
item/terrain/map-preset/sprite table (`SPELL_SRC`, `SPELL_DESC`, `SPELL_EFFECTS`, `MONSTERS_5E`,
`MAP_PRESETS`, `CLASS_FEATURES`, `FEAT_GRANTS`, `TERRAIN`, `SPRITE_MANIFEST`, etc.) — leaving
`index.html`'s script at ~11,800 lines (was ~13,200) and creating a new 126KB `data.js`.
`index.html` shed 1,345 lines net.

**Mechanical extraction, not manual line-by-line edits**: given 89 separate cut targets across a
live 13K-line file, hand-editing each with the Edit tool would be slow and genuinely
error-prone (miscounting a brace, dropping a trailing comma). Wrote a one-off Node script
instead: find each target's exact `[startLine, endLine]` by locating the next top-level
`const`/`let`/`function` declaration after it, verify no two ranges overlap, concatenate them
into `data.js` in a dependency-respecting order, then splice the same ranges out of `index.html`
bottom-to-top (so earlier line numbers stay valid mid-removal). Deleted after the run — this
was a migration tool, not a permanent part of the codebase.

**Real bug caught before it shipped, not after**: a first extraction pass moved `SPRITE_MANIFEST`
without also moving `_s4`/`_SV`, two tiny helper constants declared immediately above it that its
own template-literal file paths (`` `...png?${_SV}` ``) depend on — `data.js` would have thrown
`ReferenceError: Cannot access '_SV' before initialization` on load, since it executes before
those helpers (still in index.html at that point) were even declared. Caught by actually running
the test suite against the first attempt rather than assuming a clean extraction — restored from
a backup and re-ran with both added. A second, broader verification pass (a small static-analysis
script flagging any all-caps identifier referenced inside a target range that isn't itself
another target, a JS builtin, or the table's own name) turned up dozens of matches, but manual
inspection confirmed every one was a false positive — spell class-letter codes and monster
`DC 15`-style save text living inside STRING content, and `// PHB`/`// AUDIT.md`-style code
comments — not real cross-file references. No other real dependency issues found.

**Why this works with zero call-site changes anywhere in the ~11,800 remaining lines**:
`data.js` loads via `<script src>` *before* the main inline `<script>` — classic (non-module)
script tags share one lexical global scope in a real page, so `data.js`'s top-level `const`/
`let` tables are just plain globals the main script already reads by name. `iso-renderer.js`
already proved this exact multi-script-tag pattern works in production. The one place this
DIDN'T carry over for free: `rules-test.js` uses `eval()` to load the script under test, and
direct `eval()` scopes `let`/`const` per-call (unlike separate `<script>` tags) — so two
*separate* `eval(dataSrc)` then `eval(mainSrc)` calls would NOT have shared `data.js`'s bindings
with the main script. Fixed by concatenating both source strings into one `eval()` call instead,
documented as a real gotcha (not a stylistic choice) in CLAUDE.md for whoever adds a third module
file later.

`sw.js`'s `ASSETS` cache list updated to include `data.js` — the exact hazard VISION.md's "Known
risks" section already named ("every new file must be added to sw.js's cache list or offline
breaks silently"). `CLAUDE.md` rewritten to match (VISION.md: "CLAUDE.md's single-file rule gets
rewritten as part of that") — documents the new architecture, the eval-concatenation gotcha for
`rules-test.js`, and the ordering constraint inside `data.js` itself (`MAP_PRESETS` syncs against
`INTERACT_TYPES`; both must stay in dependency order).

**Deliberately NOT done in this pass** (staged, not big-bang, per VISION.md's own instruction):
rules logic, net/multiplayer code, and UI all remain in index.html's `<script>` block. Each is
its own future stage.

Tests: no new assertions (this is a structural move, not a rules change — the existing 876
`rules-test.js` assertions plus the `iso-renderer-test.js` suite are exactly what verify nothing
broke, and they're the reason the `_SV` bug was caught before shipping instead of after). Also
live-verified via Playwright: fresh page load with zero console errors, character creation and
`computeAC`/`spellSlots` resolving correctly (proving `SPELL_SRC`/class tables load correctly),
`monsterDef('Goblin')` resolving from the moved `MONSTERS_5E`, the two trickiest dependency
chains specifically stress-tested (`MAP_PRESETS`'s IIFE correctly cross-referencing the
also-moved `INTERACT_TYPES`; `SPRITE_MANIFEST`'s file paths correctly using the moved `_SV`/`_s4`
helpers), and a full live Quick Battle started and rendered end-to-end (the single heaviest
consumer of moved data tables at once — bestiary, terrain, sprites, spell data all exercised
together).

## Modularization Stage 2: rules.js/net.js/ui.js (v120.220)

User's direct follow-up to Stage 1 — "keep going, 11k lines is insane." Executed Stage 2 of the
documented staged plan: relocate every top-level `function`/`async function` declaration out of
index.html into three themed files by content heuristic. `index.html`'s `<script>` block goes
from **~11,800 lines to ~2,300** — an 80% reduction from where Stage 1 left it, ~93% off the
original 13,179. 625 functions moved: 461 into `rules.js` (character math, combat resolution,
spellcasting, grid/movement math, monster AI), 24 into `net.js` (DM-hosted session handling,
player-net messaging, campaign persistence), 140 into `ui.js` (modal builders, `render()` and
its dispatch tree). Only function declarations moved — every `const`/`let` and every bare
top-level executing statement (`BRAINS.tactical = function(...)`, `Events.on(...)`, service-
worker registration, the final `render()` call) stayed in `index.html`, untouched, in original
order, since those carry real load-order meaning that a function declaration never does.

**Two real, silent-corruption bugs caught in the extraction tooling itself before anything
shipped** — both found by actually running the test suite against each attempt rather than
trusting a mechanical script's output:

1. A first attempt reused Stage 1's "next top-level `const`/`let`/`function` line is the
   boundary" logic. Between two functions in this file sits a bare top-level statement,
   `BRAINS.tactical = function(qb, u){...}` (assigning a property, not declaring a new name) —
   it doesn't match any of those three patterns, so it silently got swept into whichever
   function textually preceded it and relocated to the wrong file. Since it depends on
   `const BRAINS = {}` staying declared in `index.html` and running before it, this produced a
   real `ReferenceError: Cannot access 'BRAINS' before initialization` on load. Also missed:
   `async function aiNarrate(...)` — the boundary regex only recognized bare `function`, not
   `async function`.
2. A second attempt widened the boundary rule to "any column-0, non-indented line starts a new
   top-level unit" — reasonable in general, but wrong for this codebase's occasional style of
   dedenting a multi-line chain's closing punctuation to column 0 for readability
   (`function wizSteps(c){ return WIZ_BASE.filter(s=>\n  ...\n  ...\n); }` — that closing
   `); }` line starts at column 0 and was misread as a NEW top-level statement, truncating
   `wizSteps` mid-body and leaving its real closer orphaned in `index.html`).

**What actually worked**: stopped hand-rolling a boundary heuristic (line position, then a
bespoke brace/string/template-literal tracker that itself turned out buggy — regex-vs-division
ambiguity and nested `${}` inside template literals are known-hard problems a real parser
already solves) and used Node's own parser instead. For each function's candidate start line,
grow a candidate end line one at a time and check `new vm.Script(text)` — a function declaration
is syntactically complete the INSTANT its own braces balance, so the first line count that
parses cleanly is exactly the true end, not a heuristic guess. Verified zero overlaps across all
625 resolved boundaries, and spot-checked both prior failure cases (`wizSteps` now correctly
includes its dedented closer; `BRAINS.tactical` correctly excluded and left in place) before
trusting the result enough to extract.

**Same "shared script-tag global scope" mechanism Stage 1 already established** makes this safe
regardless of classification accuracy: function declarations are hoisted and never called until
long after every `<script src>` has finished loading, so a function landing in the "wrong"
themed file (a real possibility — the ui/net/rules split is a content-heuristic, not
hand-verified per function, see CLAUDE.md) affects code organization, not runtime correctness.
The only thing that DOES care about order is top-level immediately-executing code, which is
exactly why Stage 2 deliberately left those bare statements untouched.

`sw.js`'s `ASSETS` cache list updated (`rules.js`/`net.js`/`ui.js` added), `CLAUDE.md` rewritten
with the extraction methodology (the two bugs and the fix) documented for whoever attempts a
similar split later, and the "next stage" framing updated — Stages 1 and 2 are both done now.

Tests: no new assertions (structural move, not a rules change) — the existing 876
`rules-test.js` assertions plus `iso-renderer-test.js` are exactly what caught both bugs before
they shipped. Also live-verified via Playwright: fresh load with zero new console errors (one
pre-existing, unrelated sprite-path 404 confirmed present before this change too), a full
character sheet render pulling from all three new files at once (`computeAC`/`spellSlots` from
`rules.js`, `render()`/`renderSheet` from `ui.js`, `monsterDef` bridging to `data.js`), a real
Quick Battle attack + undo cycle (deep `rules.js` call chains: `qbResolveAttack` → `Engine.attack`
→ riders → `qbUndoTurn`), a DM-hosted `deployMonster`/`dmBroadcast` round-trip (`net.js`), and
the Bestiary/Encounter Builder modals opening correctly (`ui.js`).

## Flying altitude (v120.221)

User follow-up idea from the mount-ownership conversation: "when flying, ability to select
altitude." Previously `fly` was a pure boolean (can this unit cross pits/hazards) with no height
tracked at all. Added `c.altitude` (feet, defaulted 0 by `ensureFields`) for any flying PC,
adjustable via the same Use-menu Mount Up/Dismount already lives in — "⬆ Climb 5 ft" / "⬇
Descend 5 ft" buttons, spending movement 1:1 from `c.battle.move` exactly like any other
vertical movement this app already models (jumping, climbing a cliff face). Shown whenever
`isFlying(c)` — the same check `effSpeed`-adjacent code already used for the Fly/Levitate
effects and the flying-race set, no new "can this creature fly" logic needed.

**The real mechanic, not just a number to look at**: reused `fallDamageTotal` — the exact same
1d6-per-10-ft (capped 20d6) formula a cliff-drop already uses — and hooked it into `applyHp`'s
existing "dropped to 0 HP → Unconscious" branch via a new `checkFallDamage(c, log)`. Getting
knocked out mid-flight now actually matters: you fall, take real fall damage on top of whatever
knocked you out, and land (altitude resets to 0). A 5-ft altitude always deals 0 damage
(`floor(5/10)=0` dice) — correctly a "soft landing," not a bug, and used as the test suite's one
deterministic case since `fallDamageTotal` itself rolls real dice.

**Deliberately narrower than full RAW**, documented inline rather than silently approximated:
only hooked to dropping to 0 HP (the single most common, highest-stakes "fell out of the sky"
moment), not every incapacitating condition — a Paralyzed/Stunned/Sleep effect applied mid a
different creature's turn doesn't trigger an immediate fall in this pass, only unconsciousness
from damage does. Also out of scope: melee-reach blocking based on altitude (a real RAW
consideration — a ground-bound 5-ft-reach attacker genuinely cannot melee something 20 ft up),
since that touches the shared `Engine.hitResult` path every mode resolves attacks through and is
meaningfully bigger/riskier than a self-contained altitude tracker; DM-hosted monster altitude
(the Use-menu altitude control is PC-only, mirroring how `openAdjacentUseUI` already has no
DM-side equivalent — "DM-hosted has no PC of its own to Use with," per CLAUDE.md); and monster-
side altitude entirely (the field/fall-hook exist for PCs only this pass, though nothing stops
a DM from tracking a flying monster's height narratively).

Tests: 10 new assertions — `checkFallDamage`'s no-op case (grounded), its deterministic
zero-damage case (5 ft), a real-fall case (50 ft, checking altitude resets and a message logs
either way since the actual damage roll is real dice, not asserted to an exact number), and —
the mechanic that actually matters — `applyHp`'s hook firing correctly when a flying character
drops to 0 HP (altitude resets, still correctly ends up either Unconscious or dead, never both
airborne AND at 0 HP simultaneously) versus a grounded character at 0 HP being completely
unaffected by the hook (proving it's altitude-gated, not a blanket change to death-at-0 logic).
Also live-verified via Playwright: a real Aarakocra character's Use-menu correctly shows the
altitude section only because `isFlying(c)` is true, Descend correctly starts disabled at 0 ft,
clicking the real Climb button spends movement and updates `c.altitude` with the battle card's
"Airborne at N ft" note appearing, and the full `applyHp` fall-on-unconscious flow confirmed
end-to-end through the real function (not a mock) with the fall message landing in the
character's own log.

## Altitude vs. melee reach (v120.222)

User's direct follow-up to flying altitude — the deferred RAW consideration from that entry's
own writeup: a ground-bound attacker with 5-ft reach genuinely cannot melee something hovering
20 ft up. Wired straight into `Engine.hitResult`/`Engine.attack` — the one shared resolver every
mode (QB/DM-hosted/player-net) already routes every attack through — rather than a QB-only
special case, so this is correct everywhere attacks resolve, automatically.

`hitResult` now computes `altitudeBlocked`: true when the attack is melee AND the vertical gap
between attacker and target (`|attackerAlt − targetAlt|`) exceeds the weapon's reach (5 ft
normal, 10 ft for a reach weapon — read off the same `atk.tiles>1` signal `weaponRangeTiles`
already sets). Symmetric by construction: a flying PC swinging at a grounded target is equally
gated by its OWN altitude, not just when it's the one being attacked. `Engine.attack` checks the
flag before applying any damage — a blocked attack is a guaranteed miss (`hit:false, dmg:0`)
regardless of the roll, and the event always carries `altitudeBlocked` as an explicit boolean
(a real inconsistency caught by a failing test: the non-blocked path originally left the field
`undefined` instead of `false`, which would have made `ev.altitudeBlocked` an unreliable check
for any future caller — fixed to always be present).

**UI wired at both ends of combat, not just the mechanic**: a blocked monster-vs-PC attack in QB
now logs a clear reason ("can't reach — out of melee range (altitude)") instead of reading as a
plain miss with no explanation; the player's own interactive attack flow checks the same flag
*before* opening the dice-roll modal at all, so a blocked attack never wastes the player's time
rolling for an outcome `Engine.attack` was always going to force to a miss.

**Deliberately scoped to PCs, matching the flying-altitude entry's own boundary**: monster-side
altitude isn't tracked in this app, so a flying monster's actor/target altitude always reads 0
(via `checkSubject` returning null for monster sides) — meaning altitude-vs-reach only actually
gates attacks involving a PC who's chosen to climb, not monster-vs-monster or a hypothetical
flying-monster case this app has no data model for. A real, named simplification, not silently
narrower than it looks.

Tests: 11 new assertions — the reach math across both weapon types (5 ft vs. 10 ft) and both
directions of the height gap (attacker airborne, target airborne), confirming ranged attacks are
never gated (reach only applies to melee), and confirming `Engine.attack` actually enforces the
gate rather than just flagging it (zero HP mutation on a blocked attack, on EITHER side, even
against a guaranteed-hit roll) — plus the explicit-`false` consistency fix proven directly (a
back-in-reach guaranteed hit correctly reports `altitudeBlocked:false`, not `undefined`). Also
live-verified via Playwright: a real QB battle with a flying PC confirmed a guaranteed-hit
(`toHit:99`) monster attack was still fully blocked with zero HP lost and the correct log
message, and the player's own attack flow confirmed the roll modal never opens at all when the
target is out of reach.

## More magic items — potions, Ring of Feather Falling, Decanter, Powder Keg (v120.223)

User request to expand the magic item catalog beyond the original 10 entries, with two specific
asks: Decanter of Endless Water (real DMG item) and a homebrew "Powder Keg" explosive with an
Echo Knight angle. Added 6 items total — the two requested plus 4 more chosen for genuine value
and clean fit with existing infrastructure rather than padding the list.

**Potion of Healing / Greater / Superior** (2d4+2 / 4d4+4 / 8d4+8) — a new `potionHeal` field on
a `MAGIC_ITEMS` entry, and a matching `drinkPotion(c, idx)` that rolls the formula, heals via the
real `applyHp` (so it correctly interacts with everything HP already does — temp HP, death
saves, Wild Shape's separate pool), and consumes the item, same one-line "consume a resource,
heal, log it" shape `eatBerry`/Goodberries already established. Shows as a "🧪 Drink" button
directly on the Inventory item, not buried in the Use-menu. **Caught a real bug before shipping
here**: an early version of `addWondrousItem`'s consumable-detection logic accidentally made
NEW WONDROUS ITEMS default to `equipped:true` instead of the established `false` — caught
immediately by an existing test (`addWondrousItem: adds a new unequipped item to inventory`)
that would have silently started failing for every future magic item added this way.

**Ring of Feather Falling** (attunement) — a direct, deliberate synergy with the altitude/fall-
damage system shipped two entries ago: `mods.noFallDamage`, checked by a new `hasNoFallDamage(c)`
(the same equipped+attuned gate every other attunement mod already uses) inside `checkFallDamage`
— getting knocked unconscious mid-flight while wearing this ring means drifting down safely
instead of taking real fall damage. A boolean flag, not an additive number, so it couldn't route
through the existing `gearBonus` (which only sums numeric mods) — a small, dedicated check
instead, same pattern as any other non-additive item effect this app has needed before.

**Decanter of Endless Water** (no attunement, real DMG item) — Stream and Fountain are flavor-
only (no combat mechanic, matching RAW's non-combat intent for those settings); Geyser is the
real one: every hostile creature within 10 ft of the caster makes a Str save (DC 13, PHB) or is
knocked Prone — no damage, matching RAW exactly. Simplified from RAW's full 30-ft line (aim a
direction, push 10 ft, then keep sweeping victims further away each of your turns) to a burst
around the caster with Prone only, no push/sweep — a real, named simplification rather than
building full line-targeting UI and multi-round tracking for a non-damaging control effect.

**Powder Keg** (homebrew, no attunement) — 4d6 fire in a 5-ft burst, Dex save DC 15 for half,
consumed on any use. Three trigger modes sharing one `detonate()` helper: throw it at a visible
hostile within 60 ft (centers the blast on them), detonate it where you stand (hits you too —
the actual risk/reward, not just flavor text), or — the Echo Knight synergy the user specifically
asked for — detonate it at your active echo's position instead, so the echo (1 HP, meant to be
disposable) eats the blast instead of your real body. Damage is intentionally identical across
all three modes (same keg, same explosion — only *where* you choose to set it off differs) to
avoid an arbitrary balance decision between them.

**New shared mechanic**: `itemAoeQB(s, ctr, radiusTiles, opts)` — a QB-only AOE resolver for
non-spell item effects (Geyser, the keg) that don't route through `Engine.castApply` the way a
real spell does. Applies to monsters AND the PC within radius (an explosion doesn't care about
allegiance — friendly fire is real here, matching how spell AOEs already work), returns per-
target results for the caller to log. **QB-only, matching the same scope this session already
established for combat undo** — DM-hosted/player-net item-AOE is a real, documented gap, not
silently promised.

Tests: 17 new assertions — a potion's real heal formula and consumption, `hasNoFallDamage`'s
full equipped/attuned gate proven step by step (absent → equipped-only → attuned → both), the
Ring actually canceling fall damage end-to-end through `checkFallDamage`, and `itemAoeQB`'s core
behavior (in-radius vs. out-of-radius, hits the PC too, a forced-fail deals full not half damage,
a no-damage save-or-condition effect applies the condition without any HP loss) using the same
"force a DC that always fails" determinism trick this session's other AOE tests already rely on.
Also live-verified via Playwright: all 6 new items appear in the real Bestiary-style picker,
drinking a potion through the actual Inventory button heals and removes the item, and — the full
combat loop — a real QB battle confirmed the keg's "detonate here" hitting both a monster AND
the player character (with the player correctly saving for half), the keg being consumed
afterward, and the Decanter's Geyser knocking a monster Prone while the Decanter itself stayed
in inventory (reusable, unlike the one-shot keg).

## Combat undo — DM-hosted side (v120.224)

User's third and final ask alongside altitude-melee-blocking and the magic item expansion:
extend combat undo (QB-only until now) to DM-hosted. Same "one deep-clone snapshot at turn
start, restart the turn on demand" shape `qbSnapshotForUndo`/`qbUndoTurn` already established,
now applied to `net.session` instead of `QB` — a new `dmSnapshotForUndo`/`dmUndoAvailable`/
`dmUndoTurn` triple, an "↩ Undo turn" button next to Next Turn/Back in the DM's turn-order card,
snapshot taken right after `dmRefreshActor()` inside `dmNextTurn` (the exact moment a new
actor's resources refresh — same "after refresh, before render" timing QB's own hook uses), and
reset to `null` whenever a fresh `dmHost()` session starts so a stale snapshot from a PREVIOUS
hosted session can never let Undo revert into a game that no longer exists.

**Actually simpler than QB's version in one real way, not just a port**: QB's `c` object is the
SAME reference the character lives at inside `DB` (`startQuickBattle` captures the real
character, not a copy), which meant a naive full-state swap on undo would have silently orphaned
`save()` from what's displayed — the whole reason `qbUndoTurn` has to wipe-and-repopulate the
real object in place instead of just reassigning. DM-hosted's `net.session.players[]` are
lightweight MIRROR objects (`name`/`hpCur`/`hpMax`/`ac`/`conds`) — a connected player's REAL
character sheet only ever exists on their own device, never referenced from the DM's session —
so `net.session = <clone>` is a plain, safe, direct swap with no reference-identity landmine to
work around at all.

**Broadcasts the reverted state**, which QB never needed to (single device, nothing else to
tell) — `dmUndoTurn` calls `dmBroadcast()` after restoring, so every connected player's own
screen updates to match immediately, not just the DM's.

**Scope, matching what's structurally possible, not everything "combat undo" could mean**: this
reverts the DM's own session — monster HP/positions/conditions, and the DM's mirror of a
connected player's HP/conditions — back to how it was when the current turn began. It does
**not**, and cannot without a network round-trip and player-side cooperation this pass doesn't
build, undo a connected player's own resources (spell slots spent, HP potions drunk, whatever
they did on their own device) — those live entirely there, invisible to the DM's snapshot. A
real, named limitation the button's own tooltip states plainly, not a silent gap.

Tests: 8 new assertions — the full snapshot → mutate → undo → verify cycle against a fake
DM-hosted session (monster HP, the player mirror's HP, and a mid-turn condition all correctly
revert), confirming `dmBroadcast` actually fires with the reverted state reaching a connected
player (not just that the DM's own local state looks right), and repeatability (a second undo
before the next turn reverts to the same snapshot again, matching QB's own precedent). Also
live-verified via Playwright: a real DM-hosted session (bypassing the actual PeerJS handshake,
which isn't itself under test here) confirmed the button starts correctly disabled before any
snapshot exists, `dmNextTurn()` makes it available, a full turn's worth of simulated combat
(monster HP, a connected player's mirrored HP, a mid-turn condition) all correctly reverted
through the real button click, and — the DM-hosted-specific behavior QB never needed — a
connected player's simulated device actually received the reverted session via the broadcast.
