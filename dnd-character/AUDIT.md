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
