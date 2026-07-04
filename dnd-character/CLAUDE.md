# Grimoire — D&D 5e Character Keeper

Single-file PWA (deliberate design — do NOT split it): all logic and data live in the
`<script>` block of **index.html** (~4,600 lines). `sw.js` is the offline cache,
`AUDIT.md` is the 5e-rules baseline, `rules-test.js` is the test harness.

## Efficiency protocol — read this before reading code

index.html is dense (~5,200 lines, but each line is long/minified-style), so naive Read/Grep
usage burns tokens fast. Follow this order:

1. **Run `node rules-test.js` first.** 190+ assertions covering slots, action economy,
   concentration, AC, death rules, fighting styles, parsing, monster data. If it passes,
   the rules core is sound — only read code relevant to the actual task.
2. **Never read index.html top-to-bottom.** Grep for the anchors below. Once grep shows you
   the exact line, prefer editing that line directly over a `Read` of a wide surrounding
   range — reserve `Read` for cases where you genuinely need the neighboring logic to
   understand control flow, not as a reflex after every grep.
3. `AUDIT.md` records every 5e ruling and known simplification — consult it before
   re-deriving rules ("is X intentional?" is usually answered there).
4. **Every rules change gets a test** appended to `rules-test.js` (pattern: `T('name', cond)`).
   Keep new tests to one line where the existing style already does that; don't add a
   multi-line comment block per test when fixing several similar/repetitive spells in one
   pass — one shared comment above the batch is enough.
5. **Version hygiene:** bump `APP_VERSION` in index.html AND the `CACHE` string in sw.js
   together (a test enforces this — regex allows decimals, e.g. `v115.1`). Bump once per
   session/PR, not once per fix — but if you push a follow-up fix later in the same session
   after the user has already checked the version number once, bump the decimal (`v115` →
   `v115.1`) rather than leaving it unchanged: the user has no other way to tell a fresh push
   landed vs. a stale cache, and "still shows the same version" reads as "my fix didn't
   deploy" even when it did.
6. **Test-run hygiene:** after an edit, run `node rules-test.js 2>&1 | tail -3` for a
   pass/fail summary — don't dump the full ~190-line test log into context. Only widen to
   `| grep -B2 FAIL` (or read the file) when something actually fails. Batch related edits
   for one task and verify once at the end, rather than re-running the whole suite after
   every micro-edit.

## Section map (grep anchors → what lives there)

Data tables (all near the top of the script):
- `CLASS_FEATURES` — per-class feature text by level; `RACE_TRAITS`, `RACE_ASI`, `RACE_SPEED`
- `FIGHTING_STYLES`, `FIGHTING_STYLE_LEVEL`, `SUBCLASSES`, `CLASS_SAVES`, `CLASS_HITDIE`
- `const WEAPONS=` — weapon catalog; `const ARMOR =` — armor table; `WEAPON_COST`, `ADV_GEAR`
- `FEAT_DESC` / `FEAT_GRANTS` — feats and what they grant
- `SPELL_SRC` — compressed spell list (name:classes:school per level)
- `SPELL_DESC` — one-line spell descriptions. **LOAD-BEARING PROSE**: `parseSpellMechanics`
  regex-parses these strings for save type ("Dex save"), damage dice, damage type, and
  attack-roll keywords (`ranged|melee|spell attack|attack roll|beam|ray|rays|bolt`), and
  heal keywords (`heal|heals|restore|restores|regain|temporary`). Wording changes change
  game mechanics — run the tests after any edit here.
- `SPELL_EFFECTS` — trackable buffs {rounds (6s each), conc, mods{ac,speed,tempHp,…}}
- `CONC_SPELLS` — concentration set; `SPELL_AOE` — blast radii in tiles (rulings in comment);
  `SPELL_COND` — conditions imposed; `BONUS_ACTION_SPELLS` / `REACTION_SPELLS` — cast times
- `SPELL_TELEPORT` — teleport spells {tiles,los}; `teleportOk`/`openTeleportTarget` —
  destination validity + shared picker (net play & Quick Battle commit via callback)
- `SPELL_CHOICES`/`openSpellChoices` — oddball-spell outcome menus (Wish/oracles);
  `wishGrantFree`/`wishFreeName` — Wish free-cast bypass in canCast/castSpell;
  `timeStopTurns`/`timeStopExtraTurn` — Time Stop extra turns (hooked in all 3 end-turn paths);
  `isIncapacitated`/`INCAP_CONDS` — turn-skipping conditions; `aiKey`/`aiNarrate` — AI Narrator
  (user's Anthropic key in localStorage `grimoire.aikey`, calls claude-opus-4-8 from browser)
- `MONSTERS_5E` — bestiary {n,cr,ac,hp,spd,init,attacks,atk,…}; `MONSTER_RVI` — resist/vuln/imm
- `TERRAIN` — tile properties (solid/opaque/diff/dmg/deadly); `MAP_PRESETS` — battle maps

Rules logic:
- `function canCast` / `function castSpell` — action economy + slots + bonus-action-spell
  rule + concentration entry point
- `function parseSpellMechanics` — prose→mechanics parser; `scaleCantrip`/`cantripTier` —
  cantrip damage scaling; `spellSeeks` — always false (LoS required, see AUDIT.md)
- `function addEffect` / `endEffect` / `advanceRound` — effect lifecycle, no same-name stacking
- `function concentrationCheck` — CON save on damage (DC max(10, dmg/2))
- `function computeAC` — armor + Mage Armor + Barkskin + Defense style + shield + effects
- `function applyHp` — damage/heal, temp HP, death saves, instant death, conc trigger
- `function attackFlow` — the attack modal state machine; Sneak Attack & Divine Smite riders
  live in its `rollDmg`/dmg-phase UI
- `weaponToHit`/`weaponDmgBonus` — includes Archery/Dueling styles, rage
- `extraAttacks`, `actionsPerTurn` (Haste), `hasActionSurge`, `toggleRage`
- `spellSlots`/`SLOTS_FULL|HALF|ARTI`/`warlockSlots`, `maxSpellLevel`, `preparedMax`,
  `sorcMax`/`sorcCur` (Font of Magic), Arcane Recovery handler in `renderSpells`
- `skillBonus` (Jack of All Trades), `initiative`, `passiveScore` (Observant), `profBonus`
- `function levelUp` — level-up modal; `pendingChoiceSpecs`/`applyFeat` — choice flows

Combat / grid / multiplayer:
- `function dijkstra` / `losClear` / `coverBetween` / `leavesReach` — grid math
  (Chebyshev distance, 1 tile = 5 ft, no diagonal corner-cutting)
- `const Engine =` — unified resolver: `Engine.attack` (weapons) + `Engine.castApply`
  (spells: save → half dmg / no condition on success → resist/vuln/imm). Adapters bind it
  to each mode: `qbAdapter`, `sessionAdapter` (DM authoritative), `playerNetAdapter`
  (player device — mutates by net message; DM applies RVI to incoming raw damage)
- `BRAINS.tactical` — monster AI; `CONTROLLERS` — human/tactical/agent switch
- `function dmHost` / `dmOnData` / `renderDM` — DM mode; `playerJoin`/`renderPlayerBattle` —
  player netplay; `openSpellTarget` — net spell targeting
- `function saveCampaign` / `loadCampaign` / `mergeCampaignPlayers` / `campaignSnapshot` —
  DM campaign persistence (localStorage `grimoire.campaigns`: map, monsters, party progress,
  battle state, log). Join-then-pick: players connect first, load re-binds them by `cid`;
  autosaves (debounced) in `dmBroadcast` while `net.campaign` is set
- `startQuickBattle` / `qbSpellTarget` / `qbResolveAttack` — solo-vs-AI arena
  (`monsterSaveBonus` = CR-scaled saves; friendly fire lives in `resolveBlast`)
- `parseMonsterAttacks` — parses bestiary `atk` strings (also load-bearing prose:
  `+N (dice)`, `DC N Abl`, reach/range/condition keywords)

UI (rarely rules-relevant): `render()` dispatcher, `renderSheet`, `renderCombat`,
`renderSpells`, `renderItems`, `battleCard`, `castModal`, `mapGridHTML`.

## Conventions
- Battle state lives on `c.battle` {actionsUsed/Max, bonus, reaction, attacksLeft, move,
  castBonusSpell, castLeveledSpell, sneakUsed, surged}; ALL per-turn resets go through
  `freshTurnState`/`resetTurnState` — add new per-turn flags there and nowhere else.
- Characters are plain objects; `ensureFields` migrates old saves, `newCharacter` must
  initialize any field the code dereferences without a guard.
- Monsters: `.hp/.max`; players in net sessions: `.hpCur/.hpMax` (adapters key off this).
- All persistence is localStorage; no build step, no dependencies.
