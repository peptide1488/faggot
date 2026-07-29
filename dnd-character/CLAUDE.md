# Grimoire — D&D 5e Character Keeper

The single-file rule is **retired** (per VISION.md's 2026-07-21 alignment — "single-file
index.html is no longer sacred, proactively modularize"). Modularization is staged, not a
big-bang rewrite, and **Stages 1 and 2 are both done**: `index.html`'s `<script>` block went
from ~13,200 lines to **~2,300 lines**. The code now lives across 5 files:
- **`data.js`** (Stage 1) — every pure content table (spells, monsters, classes, items,
  terrain, maps, sprites — ~90 tables, no logic).
- **`rules.js`** (Stage 2) — character math, combat resolution, spellcasting, grid/movement
  math, monster AI (~461 functions, classified by a "no DOM/network signal in the body"
  heuristic — see below).
- **`net.js`** (Stage 2) — DM-hosted session handling, player-net messaging, campaign
  persistence (~24 functions).
- **`ui.js`** (Stage 2) — modal builders, `render()`/`renderSheet`/`renderCombat`/etc., anything
  touching `document`/`$()`/`.innerHTML` (~140 functions).
- **`index.html`**'s own `<script>` block — top-level state only now (`DB`, `QB`, `net`, `tab`,
  `curId`, …) plus bootstrap/init statements that must run in a specific order (`BRAINS.tactical
  = function(...)`, `Events.on(...)`, service-worker registration, the final `render()` call).

`sw.js` is the offline cache — `index.html`, `data.js`, `rules.js`, `net.js`, and `ui.js` are
ALL in its `ASSETS` list — **any new module file must be added there too, or offline breaks
silently**. `AUDIT.md` is the 5e-rules baseline (current rulings + a post-v94 systems index),
`AUDIT_HISTORY.md` is its per-version archive, `rules-test.js` is the test harness.

**All four extracted files load via `<script src>` before the main inline `<script>`**, in
that order (data → rules → net → ui → main) — classic (non-module) script tags share one
lexical scope, so every top-level `const`/`let`/`function` in an earlier-loaded file is a plain
global the later files already read by name, zero call-site changes needed anywhere. Function
declarations are safe to place in ANY of the 4 files regardless of what they reference
internally (even something defined in a file that loads LATER) — they're hoisted, and nothing
actually CALLS them until long after every script has finished loading (user interaction,
`render()`, etc.). The one thing that DOES care about order: top-level code that executes
IMMEDIATELY at parse time (a `const X = someFn()` or bare statement, not a function body) — this
is exactly why Stage 2 only moved `function`/`async function` declarations and left every
top-level executing statement (`BRAINS.tactical=…`, `Events.on(…)`, the final `render()`, event-
listener setup) in index.html untouched, in its original relative order.

`rules-test.js` reproduces the script-tag sharing by concatenating `data.js`+`rules.js`+
`net.js`+`ui.js`+the extracted `<script>` content into ONE `eval()` call (`eval()`'s `let`/
`const` don't leak across *separate* eval calls the way they do across script tags in a real
page — a real gotcha, not a stylistic choice; keep any future module file in that same
concatenated eval, don't eval it alone).

**Extraction methodology, if you ever do this again**: two hand-rolled line-position heuristics
both produced real, silent corruption before this shipped — a bare top-level statement between
two functions got swept into the wrong one, and a dedented closing `); }` from a multi-line
arrow-function chain (`WIZ_BASE.filter(s=>\n ... \n); }`) got misread as a new top-level
statement, truncating the function it belonged to. Both were caught by actually running the
test suite against the extraction, not by assuming a mechanical script's output was correct.
The fix that actually worked: for each function's exact end line, grow a candidate end line one
at a time and use Node's real parser (`new vm.Script(text)`) to check when the accumulated text
first becomes syntactically valid — a function is complete the instant its own braces balance,
so this is exact, not heuristic. Don't hand-roll a brace/string/template-literal tracker for
this; it's a known-hard problem (regex-vs-division ambiguity, nested `${}` in template literals)
that the real parser already solves correctly.

**`data.js` ordering**: a few tables reference an earlier one in the same file (`MAP_PRESETS`
syncs against `INTERACT_TYPES`; `SPRITE_MANIFEST` uses the `_SV`/`_s4` helpers declared just
above it) — if you add a new data table, check it doesn't reference something declared later in
the same file, and if it references a *function*, that function must stay reachable (rules.js is
fine, since it loads right after data.js) and the table can't be pure data-only content.

**The isometric battle-map renderer is its own file, `iso-renderer.js`**, loaded via
`<script src>` — split out deliberately (v118) after three straight live-deploy rounds fixing
one rendering bug at a time. It knows nothing about D&D rules; index.html's `mapGridHTML` hands
it plain data via a `<canvas class="isocanvas" data-cols/rows/rot/tiles/height/palette>` tag and
`iso-renderer.js`'s own `MutationObserver` paints it — no direct function call between the two.
Its tests live in `iso-renderer-test.js`, separate from `rules-test.js`. See AUDIT.md v117–v118.

**The rules.js/net.js/ui.js split is a heuristic, not hand-verified per-function** — a function
landed in `ui.js` if its body contains a DOM signal (`$('#...`, `document.getElementById`,
`.innerHTML=`, `modalRoot`, `render()`, etc.), in `net.js` if it contains a networking signal
(`net.role`/`net.session`/`dmSend(`/`dmBroadcast(`/`conn.send`) and doesn't already match the UI
signal, else `rules.js`. This is "good enough to be useful," not perfectly pure — some functions
in `rules.js` may incidentally reference `net`/`QB` for a mode-check without being fundamentally
networking code, and `ui.js` at ~6,200 lines is still large (a few functions, like the ~670-line
Use-menu builder `openAdjacentUseUI`, are simply that big). A future pass could refine the split
further; this pass's bar was "correct and shippable," not "semantically perfect."

## Efficiency protocol — read this before reading code

index.html is dense (2,375 lines, but each line is long/minified-style), so naive Read/Grep
usage burns tokens fast. Follow this order:

1. **Run `node rules-test.js` first** (5e rules) **and `node iso-renderer-test.js`** if touching
   the battle map. ~1000 assertions covering slots, action economy, concentration, AC, death
   rules, fighting styles, parsing, monster data. If it passes, the rules core is sound — only
   read code relevant to the actual task. **For any battle-map rendering change, also render the
   canonical scenes with `node tools/iso-preview.js` and `Read` the resulting PNGs yourself
   before pushing** — this is what three rounds of blind live-deploy screenshot debugging cost;
   don't ship an elevation/wall change without having looked at the pixels first.
2. **Never read index.html top-to-bottom.** Grep for the anchors below. Once grep shows you
   the exact line, prefer editing that line directly over a `Read` of a wide surrounding
   range — reserve `Read` for cases where you genuinely need the neighboring logic to
   understand control flow, not as a reflex after every grep.
3. **`AUDIT.md` (21 KB) = what the rules do TODAY** — consult it before re-deriving rules
   ("is X intentional?" is usually answered there). It ends with a **systems index** mapping
   every post-v94 system (maneuvers, reactions, traps, mounts, multiclassing, subclasses, …) to
   its verified grep anchor — use that table instead of hunting for a function name.
   **`AUDIT_HISTORY.md` (260 KB) = why it was built that way**, per version, with a heading
   index at its top. It is 12× the size of AUDIT.md and deliberately preserves *superseded*
   approaches (v114–v118 document four isometric rewrites, one of which was reverted in full),
   so **never quote it as current behaviour and never grep it as a first move.** Splitting the
   two is what took the every-session rules reference from ~70k tokens to ~5k.
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
   pass/fail summary — don't dump the full ~1000-line test log into context. Only widen to
   `| grep -vE "^  ok "` (which strips the passing lines and leaves the failure) when something
   actually fails. Batch related edits for one task and verify once at the end, rather than
   re-running the whole suite after every micro-edit. **Beware stubbed randomness:** tests that
   resolve a real attack must pre-roll the d20 (`{face:20}`, or stub `Math.random`) — `toHit:99`
   is NOT a guaranteed hit, because a natural 1 always misses, and one test flaked ~5% of runs
   on exactly that (fixed 2026-07-28).
7. **`rules-test.js` does NOT cover UI wiring — click new handlers in a real browser.** The suite
   evals the app against a stub DOM and exercises *rules*; a click handler is never executed. A
   handler calling a function that doesn't exist passes the entire suite and then throws the
   instant a user presses the button (this happened on 2026-07-29: a `dmLog()` that was never
   defined). Playwright is the check that works — `dmHost()`, `render()`, click the selector,
   then `browser_console_messages` at level `error`.
   A static "is every called identifier defined?" guard was attempted and abandoned: stripping
   comments/strings/template literals with regex mangles the source and reported 195 false
   positives (`flashBanner`, `render`, `esc` …). That's the same known-hard problem the
   modularization note above warns about — don't retry it without a real parser.
8. **Deploying takes TWO pushes.** Work happens on `iso3d-engine`; GitHub Pages serves
   `claude/elegant-bohr-zx67jk` (verified via the Pages API — `build_type: legacy`, path `/`).
   A push to `iso3d-engine` alone changes nothing the user can see:
   `git push origin iso3d-engine && git push origin iso3d-engine:claude/elegant-bohr-zx67jk`
   Then verify: `curl -s https://peptide1488.github.io/faggot/dnd-character/sw.js | grep -m1 CACHE`.
   If the live version is stale, check `git rev-parse origin/claude/elegant-bohr-zx67jk` **before**
   blaming build lag — a 3-day "publish lag" in July 2026 was really just the unpushed branch.

## Section map (grep anchors → what lives there)

> **Which FILE a symbol is in: ask, don't guess — `node tools/whereis.js <symbol>`.**
> It prints `file:line` for the declaration in one call. The headings below group anchors by
> *topic*, and topic does NOT predict file: the split was made by a heuristic, so `applyHp`,
> `castSpell` and `attackFlow` are core rules that live in **ui.js**, `canCast` lives in
> **net.js**, and `Engine`, `BRAINS`, `CONTROLLERS` and all three adapters never left
> **index.html** (they're top-level statements whose execution order matters). This section's
> file attributions were wrong on exactly those symbols until 2026-07-28 and cost real greps —
> trust `whereis.js` over any prose here, and treat a mismatch as a bug in this file.

Data tables (all live in `data.js` now, not index.html — see the modularization note above):
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

Rules logic (**mostly** `rules.js`, but see the warning above — several of these are not):
- `function canCast` (**net.js**) / `function castSpell` (**ui.js**) — action economy + slots +
  bonus-action-spell rule + concentration entry point
- `function parseSpellMechanics` — prose→mechanics parser; `scaleCantrip`/`cantripTier` —
  cantrip damage scaling; `spellSeeks` — always false (LoS required, see AUDIT.md)
- `function addEffect` / `endEffect` / `advanceRound` — effect lifecycle, no same-name stacking
- `function concentrationCheck` — CON save on damage (DC max(10, dmg/2))
- `function computeAC` — armor + Mage Armor + Barkskin + Defense style + shield + effects
- `function applyHp` (**ui.js**) — damage/heal, temp HP, death saves, instant death, conc trigger
- `function attackFlow` (**ui.js**) — the attack modal state machine; Sneak Attack & Divine
  Smite riders live in its `rollDmg`/dmg-phase UI
- `weaponToHit`/`weaponDmgBonus` — includes Archery/Dueling styles, rage
- `extraAttacks`, `actionsPerTurn` (Haste), `hasActionSurge`, `toggleRage`
- `spellSlots`/`SLOTS_FULL|HALF|ARTI`/`warlockSlots`, `maxSpellLevel`, `preparedMax`,
  `sorcMax`/`sorcCur` (Font of Magic), Arcane Recovery handler in `renderSpells`
- `skillBonus` (Jack of All Trades), `initiative`, `passiveScore` (Observant), `profBonus`
- `function levelUp` — level-up modal; `pendingChoiceSpecs`/`applyFeat` — choice flows

Combat / grid / multiplayer — **file attribution corrected 2026-07-28**: grid math is in
`rules.js`, but `Engine`, its three adapters, `BRAINS` and `CONTROLLERS` are all still in
**index.html** (top-level `const`s, never moved by Stage 2), and `dmHost`/`renderDM` are in
**ui.js**, not net.js. `net.js` is only ~237 lines. Confirm with `tools/whereis.js`:
- `function dijkstra` / `losClear` / `coverBetween` / `leavesReach` — grid math
  (Chebyshev distance, 1 tile = 5 ft, no diagonal corner-cutting)
- **Isometric battle-map rendering lives in `iso-renderer.js`, not index.html** — `mapGridHTML`
  (in index.html) still owns terrain/decor/token HTML + the `.mcell` hitboxes/click-target/DM
  terrain-paint wiring, and calls `IsoRenderer.tileScreenPos` for hitbox placement, but the
  actual `<canvas>` pixels (diamond tiles, elevation walls) are painted entirely by
  `iso-renderer.js`'s own `paint()`/`MutationObserver`. Grep anchors there, not here, for
  anything about how the iso view actually looks.
- `const Engine =` (**index.html:1782**) — unified resolver: `Engine.attack` (weapons) +
  `Engine.castApply` (spells: save → half dmg / no condition on success → resist/vuln/imm).
  `Engine.roll` implements the nat-20-crit / **nat-1-always-misses** rule (`d20!==1`) — which is
  why `toHit:99` is not a guaranteed hit in a test. Adapters bind it to each mode, all also in
  index.html: `qbAdapter`, `sessionAdapter` (DM authoritative), `playerNetAdapter`
  (player device — mutates by net message; DM applies RVI to incoming raw damage)
- `BRAINS.tactical` — monster AI; `CONTROLLERS` — human/tactical/agent switch (**index.html**)
- `function dmHost` / `dmOnData` / `renderDM` (**ui.js**) — DM mode; `playerJoin`/
  `renderPlayerBattle` — player netplay; `openSpellTarget` — net spell targeting
- `function saveCampaign` / `loadCampaign` / `mergeCampaignPlayers` / `campaignSnapshot` —
  DM campaign persistence (localStorage `grimoire.campaigns`: map, monsters, party progress,
  battle state, log). Join-then-pick: players connect first, load re-binds them by `cid`;
  autosaves (debounced) in `dmBroadcast` while `net.campaign` is set
- `startQuickBattle` / `qbSpellTarget` / `qbResolveAttack` — solo-vs-AI arena
  (`monsterSaveBonus` = CR-scaled saves; friendly fire lives in `resolveBlast`)
- `parseMonsterAttacks` — parses bestiary `atk` strings (also load-bearing prose:
  `+N (dice)`, `DC N Abl`, reach/range/condition keywords)

UI (lives in `ui.js` now, rarely rules-relevant): `render()` dispatcher, `renderSheet`,
`renderCombat`, `renderSpells`, `renderItems`, `battleCard`, `castModal`, `mapGridHTML`.

## Conventions
- Battle state lives on `c.battle` {actionsUsed/Max, bonus, reaction, attacksLeft, move,
  castBonusSpell, castLeveledSpell, sneakUsed, surged}; ALL per-turn resets go through
  `freshTurnState`/`resetTurnState` — add new per-turn flags there and nowhere else.
- Characters are plain objects; `ensureFields` migrates old saves, `newCharacter` must
  initialize any field the code dereferences without a guard.
- Monsters: `.hp/.max`; players in net sessions: `.hpCur/.hpMax` (adapters key off this).
- All persistence is localStorage; no build step, no dependencies.
