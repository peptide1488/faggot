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
  attack targeting the warded PC now rolls a Wis save in `qbApplyIntent` before the attack is
  allowed to proceed, consuming the attack on a failure (matches "loses the attack" — this app
  has no second ally target to redirect to in Quick Battle).
- **Magic Weapon** — dynamic per-weapon choice menu (`SPELL_CHOICES['Magic Weapon']` is a
  function of the caster, not a static list) sets `item.magicBonus`, read by `qbPcAttacks`.
  Tracked as a normal concentration effect; ending/expiring it clears the item's bonus via
  `clearItemEffect`. Scoped to Quick Battle's own attack list — the sheet/DM-session weapon
  displays don't read `magicBonus` yet.
- **Power Word Kill / Power Word Stun** — `POWER_WORD_HP` maps each spell to its HP threshold;
  `powerWordResolve` is a pure no-save, no-attack-roll check against the target's current HP.
  Routed to enemy targeting only inside Quick Battle (`spellTargetsEnemy` checks `QB.active`) —
  other targeting paths (DM/player-net) still treat these as narrative.
- **Eyebite** — reworded to state "Wis save" so it parses as a save spell; on targeting a foe,
  `qbEyebiteChoice` opens a 3-option picker (Asleep/Frightened/Panicked+3d6 psychic+Poisoned).
  `eyebiteResolve` rolls one save that gates the *whole* chosen effect (a success means nothing
  happens at all — not half damage, unlike a normal save spell).
- **Holy Aura** — the DC is stashed on cast, same as Sanctuary. The reactive half (hostile
  attacker hits a warded creature → Con save or Blinded) is checked from `qbResolveAttack`'s
  hit branch via the pure `holyAuraResolve`, since that's the only place that knows a hit
  actually landed. Simplification: doesn't grant *advantage on saving throws* to warded allies —
  that's a separate, unimplemented "advantage on all saves" mechanic this engine doesn't have
  anywhere else either.

All seven are QB-only (Quick Battle) unless noted otherwise above; the DM/session and
player-net targeting paths (`openSpellTarget`, `attackFlow`) don't yet have the equivalent
hooks for the ones that needed one (Sanctuary's attack-gate, Power Word's HP-threshold check,
Eyebite's choice picker, Holy Aura's reactive trigger).

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
