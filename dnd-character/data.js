// Build stamp (v120.259). index.html compares every module's stamp against APP_VERSION and
// flags the version badge if any disagree. v120.256 only stamped ui.js and rules.js, so a
// stale data.js/net.js/iso-renderer.js would have passed the check silently -- a detector
// with holes in it is worse than none, because it reads as an all-clear.
const DATA_BUILD='v120.282';
// Grimoire — extracted data tables (Stage 1 of index.html modularization).
// Pure content: spells, monsters, classes, items, maps, terrain. No app logic here —
// see AUDIT.md for the modularization writeup. Loaded via <script src> before the main
// inline script (classic script, not a module — top-level const/let here become part of
// the shared global lexical scope the main script already reads them from by name).

const CLASS_FEATURES = {
Barbarian:[[1,'Rage','Bonus action: +damage, resistance to physical damage, advantage on Strength.'],[1,'Unarmored Defense','AC = 10 + Dex + Con when unarmored.'],[2,'Reckless Attack','Attack with advantage; foes get advantage on you too.'],[2,'Danger Sense','Advantage on Dex saves you can see.'],[3,'Primal Path','Your barbarian subclass.'],[5,'Extra Attack','Attack twice.'],[5,'Fast Movement','+10 ft speed in light/medium armor.']],
Bard:[[1,'Bardic Inspiration','Bonus action: give an ally an inspiration die (d6; d8 at L5, d10 at L10, d12 at L15) to add to a roll.'],[1,'Spellcasting','Cast bard spells (Charisma).'],[2,'Jack of All Trades','Half proficiency on non-proficient checks.'],[2,'Song of Rest','Allies heal extra on a short rest.'],[3,'Expertise','Double proficiency on two skills.'],[3,'Bard College','Your bard subclass.'],[5,'Font of Inspiration','Regain Inspiration on a short rest.']],
Cleric:[[1,'Spellcasting','Cast cleric spells (Wisdom).'],[1,'Divine Domain','Your cleric subclass and its features.'],[2,'Channel Divinity','Turn Undead + a domain effect, once per rest.'],[5,'Destroy Undead','Low-CR turned undead are destroyed.']],
Druid:[[1,'Druidic','The secret druid language.'],[1,'Spellcasting','Cast druid spells (Wisdom).'],[2,'Wild Shape','Twice per short rest, become a beast you have seen: CR ≤ ¼ (no fly/swim) at L2, CR ≤ ½ (no fly) at L4, CR ≤ 1 at L8. Use the beast\'s stat block; revert at 0 HP with excess damage carrying over.'],[2,'Druid Circle','Your druid subclass.']],
Fighter:[[1,'Fighting Style','A combat specialty bonus.'],[1,'Second Wind','Bonus action: heal 1d10 + level once per rest.'],[2,'Action Surge','One extra action, once per rest.'],[3,'Martial Archetype','Your fighter subclass.'],[5,'Extra Attack','Attack twice.']],
Monk:[[1,'Unarmored Defense','AC = 10 + Dex + Wis when unarmored.'],[1,'Martial Arts','Dex for unarmed strikes; bonus unarmed strike.'],[2,'Ki','Flurry of Blows, Patient Defense, Step of the Wind.'],[2,'Unarmored Movement','+10 ft speed unarmored.'],[3,'Monastic Tradition','Your monk subclass.'],[3,'Deflect Missiles','Reaction to reduce ranged damage.'],[4,'Slow Fall','Reaction to reduce falling damage.'],[5,'Extra Attack','Attack twice.'],[5,'Stunning Strike','Spend ki to stun a creature you hit.']],
Paladin:[[1,'Divine Sense','Detect celestials, fiends, undead.'],[1,'Lay on Hands','Healing pool equal to 5 × level.'],[2,'Fighting Style','A combat specialty bonus.'],[2,'Spellcasting','Cast paladin spells (Charisma).'],[2,'Divine Smite','Burn a slot for extra radiant on a hit.'],[3,'Sacred Oath','Your paladin subclass.'],[5,'Extra Attack','Attack twice.']],
Ranger:[[1,'Favored Enemy','Advantage tracking/recalling chosen foes.'],[1,'Natural Explorer','Travel bonuses in favored terrain.'],[2,'Fighting Style','A combat specialty bonus.'],[2,'Spellcasting','Cast ranger spells (Wisdom).'],[3,'Ranger Archetype','Your ranger subclass.'],[5,'Extra Attack','Attack twice.']],
Rogue:[[1,'Expertise','Double proficiency on two skills.'],[1,'Sneak Attack','Extra damage with advantage or a nearby ally.'],[1,"Thieves' Cant",'Secret rogue code.'],[2,'Cunning Action','Bonus action Dash, Disengage, or Hide.'],[3,'Roguish Archetype','Your rogue subclass.'],[5,'Uncanny Dodge','Reaction to halve an attack\'s damage.']],
Sorcerer:[[1,'Spellcasting','Cast sorcerer spells (Charisma).'],[1,'Sorcerous Origin','Your sorcerer subclass.'],[2,'Font of Magic','Sorcery points fuel your magic.'],[3,'Metamagic','Twist spells (Twin, Quicken, …).']],
Warlock:[[1,'Otherworldly Patron','Your warlock subclass.'],[1,'Pact Magic','Few slots that recharge on a short rest.'],[2,'Eldritch Invocations','Magical enhancements you choose.'],[3,'Pact Boon','Blade, Chain, or Tome.']],
Wizard:[[1,'Spellcasting','Cast from your spellbook (Intelligence).'],[1,'Arcane Recovery','Recover some slots on a short rest.'],[2,'Arcane Tradition','Your wizard school subclass.']],
Artificer:[[1,'Magical Tinkering','Imbue tiny objects with minor magic.'],[1,'Spellcasting','Cast artificer spells via tools (Intelligence).'],[2,'Infuse Item','Grant items magical infusions.'],[3,'Artificer Specialist','Your artificer subclass.']]
};
// Subclass-level features with REAL mechanics behind them (as opposed to CLASS_FEATURES, which
// is flavor/display text only — no subclass in this app affected combat math until Echo Knight,
// see AUDIT.md). Keyed by subclass NAME (unique across every class's subclass list in this
// app's data, so no class qualifier is needed), same [level,name,desc] shape as CLASS_FEATURES
// so it merges into the same sheet display list. Deliberately the first entry, not a one-off —
// the natural home for whichever subclass gets real mechanics implemented next.

const SUBCLASS_FEATURES = {
  'Echo Knight':[
    [3,'Manifest Echo','Bonus action: conjure a translucent echo of yourself in an unoccupied space within 15 ft (AC 14+prof, 1 HP, immune to all conditions). Move it up to 30 ft/turn, or bonus-action teleport-swap places with it (costs 15 ft of your movement). Attacks can originate from your space or the echo’s.'],
    [3,'Unleash Incarnation','When you take the Attack action, make one additional attack from the echo’s space. Uses equal your Constitution modifier (min 1) per long rest.'],
    [7,'Echo Avatar','Action: see/hear through your echo up to 1,000 ft away for up to 10 minutes (you’re blinded/deafened meanwhile). Once per short or long rest.'],
    [10,'Shadow Martyr','Reaction: teleport the echo into the path of an attack targeting another creature within 30 ft of it — the attack roll targets the echo instead. Once per short or long rest.'],
    [15,'Reclaim Potential','When your echo is destroyed, gain 2d6 + Constitution modifier temporary HP if you have none.'],
    [18,'Legion of One','Manifest Echo can maintain two echoes at once (a third destroys the two oldest). Regain one Unleash Incarnation use when you roll initiative with none left.'],
  ],
  'Path of the Berserker':[
    [3,'Frenzy','While raging, you can choose to frenzy: make a bonus-action melee attack on every turn of the rage. When the rage ends, you suffer one level of exhaustion.'],
    [6,'Mindless Rage','You can’t be charmed or frightened while raging. If you already are when you enter your rage, the effect is suspended for the rage’s duration.'],
    [10,'Intimidating Presence','Action: frighten one creature within 30 ft (Wisdom save, DC 8+prof+Cha) until the end of your next turn; extend it each turn while in range. A successful save makes that creature immune to this for 24 hours.'],
    [14,'Retaliation','Reaction: when a creature within 5 ft damages you, make a melee attack against it.'],
  ],
  'College of Lore':[
    [3,'Bonus Proficiencies','Gain proficiency in three skills of your choice.'],
    [3,'Cutting Words','Reaction: expend a Bardic Inspiration use to subtract a rolled die from a creature\'s attack roll within 60 ft.'],
    [6,'Additional Magical Secrets','Learn two spells of your choice from any class.'],
    [14,'Peerless Skill','Expend a Bardic Inspiration use to add a rolled die to one of your own ability checks.'],
  ],
  'Life':[
    [1,'Disciple of Life','Whenever you cast a 1st-level-or-higher spell that restores hit points, its target regains extra HP equal to 2 + the spell\'s level.'],
    [2,'Channel Divinity: Preserve Life','Action: distribute HP equal to 5 × your cleric level among creatures within 30 ft (yourself included), up to half a creature\'s HP maximum each.'],
    [6,'Blessed Healer','When you cast a spell that restores hit points to someone else, you also regain HP equal to 2 + the spell\'s level.'],
    [8,'Divine Strike','Once per turn, one weapon hit deals an extra 1d8 radiant damage (2d8 at 14th level).'],
    [17,'Supreme Healing','Instead of rolling any dice for a spell you cast to restore hit points, use the highest number possible for each die.'],
  ],
  'Circle of the Moon':[
    [2,'Combat Wild Shape','Use Wild Shape as a bonus action instead of an action. While shapeshifted, spend a bonus action and a spell slot to regain 1d8 HP per level of the slot.'],
    [2,'Circle Forms','Wild Shape into a beast of challenge rating up to 1 (up to your druid level ÷ 3, rounded down, starting at 6th level).'],
    [6,'Primal Strike','Your attacks in beast form count as magical for overcoming resistance and immunity to nonmagical attacks.'],
    [10,'Elemental Wild Shape','Expend two uses of Wild Shape at once to transform into an air, earth, fire, or water elemental.'],
    [14,'Thousand Forms','Cast Alter Self at will, without expending a spell slot.'],
  ],
  'Open Hand':[
    [3,'Open Hand Technique','When you hit with a Flurry of Blows attack, impose one: Dex save or Prone; Str save or pushed 15 ft; or it can\'t take reactions until the end of your next turn.'],
    [6,'Wholeness of Body','Action: regain HP equal to three times your monk level. Once per long rest.'],
    [11,'Tranquility','At the end of a long rest, gain the effect of Sanctuary (DC = your ki save DC) until your next long rest.'],
    [17,'Quivering Palm','Spend 3 ki on an unarmed strike hit to set imperceptible vibrations; later, spend your action to force a Con save — fail and it drops to 0 HP, succeed and it takes 10d10 necrotic.'],
  ],
  'Devotion':[
    [3,'Oath Spells','Protection from Evil and Good, Sanctuary always prepared (5th: Lesser Restoration, Zone of Truth; 9th: Beacon of Hope, Dispel Magic; 13th: Freedom of Movement, Guardian of Faith; 17th: Commune, Flame Strike).'],
    [3,'Channel Divinity: Sacred Weapon','Action: +Cha mod (min +1) to attack rolls with one weapon for 1 minute; it sheds light and becomes magical.'],
    [3,'Channel Divinity: Turn the Unholy','Action: fiends/undead within 30 ft make a Wisdom save or flee for 1 minute.'],
    [7,'Aura of Devotion','You can\'t be Charmed while conscious.'],
    [15,'Purity of Spirit','You are always under the effect of Protection from Evil and Good.'],
    [20,'Holy Nimbus','Action: bright light 30 ft; enemies starting their turn in it take 10 radiant; advantage on saves vs fiend/undead spells. 1 minute, once per long rest.'],
  ],
  'Hunter':[
    [3,"Hunter's Prey",'Choose one: Colossus Slayer (once/turn +1d8 vs a foe below max HP), Giant Killer (reaction attack a Large+ foe that hits or misses you), or Horde Breaker (once/turn, an extra attack against a second foe within 5 ft of your target).'],
    [7,'Defensive Tactics','Choose one: Escape the Horde, Multiattack Defense, or Steel Will.'],
    [11,'Multiattack','Choose one: Volley (ranged attack against every foe within 10 ft of a point) or Whirlwind Attack (melee attack against every adjacent foe).'],
    [15,"Superior Hunter's Defense",'Choose one: Evasion, Stand Against the Tide, or Uncanny Dodge.'],
  ],
  'Assassin':[
    [3,'Assassinate','Advantage on attack rolls against any creature that hasn\'t taken a turn yet this combat. A hit against a Surprised creature is an automatic critical hit.'],
    [3,'Bonus Proficiencies','Proficiency with the disguise kit and the poisoner\'s kit.'],
    [9,'Infiltration Expertise','Spend 7 days and 25 gp to establish a false identity.'],
    [13,'Impostor','After 3+ hours of study, unerringly mimic a person\'s speech and writing; advantage on Deception checks to maintain the act.'],
    [17,'Death Strike','On a hit against a Surprised creature, it makes a Con save (DC 8+Dex+prof) or takes double damage.'],
  ],
  'Draconic Bloodline':[
    [1,'Dragon Ancestor','Choose a dragon type — sets your damage type for Elemental Affinity.'],
    [1,'Draconic Resilience','+1 max HP per sorcerer level; AC 13+Dex while unarmored.'],
    [6,'Elemental Affinity','Add your Cha mod to one damage roll of a spell matching your ancestry\'s damage type; spend 1 sorcery point for 1 hour of resistance to it.'],
    [14,'Dragon Wings','Bonus action: sprout wings, flying speed equal to your current speed.'],
    [18,'Draconic Presence','Action, 5 sorcery points: 60 ft aura of awe (Charmed) or fear (Frightened) — Wisdom save.'],
  ],
  'The Fiend':[
    [1,"Dark One's Blessing",'When you reduce a hostile creature to 0 HP, gain temporary HP = Cha mod + warlock level (min 1).'],
    [6,"Dark One's Own Luck",'Once per short/long rest: add 1d10 to an ability check or saving throw after seeing the roll.'],
    [10,'Fiendish Resilience','Choose a damage type at a rest; resistance to it until you choose again.'],
    [14,'Hurl Through Hell','Once per long rest, on a hit: the target vanishes until the end of your next turn and takes 10d10 psychic damage (fiends immune).'],
  ],
  'Evocation':[
    [2,'Evocation Savant','Halved gold/time cost to copy an evocation spell into your spellbook.'],
    [2,'Sculpt Spells','Choose 1 + the spell\'s level of creatures affected by your evocation spell to auto-succeed their save and take no damage.'],
    [6,'Potent Cantrip','A creature that succeeds on a save against your cantrip takes half damage but suffers no other effect.'],
    [10,'Empowered Evocation','Add your Int modifier to one damage roll of any evocation spell you cast.'],
    [14,'Overchannel','Deal maximum damage with a 1st-5th level damage spell; the first use each rest is free, later uses before your next long rest deal you escalating necrotic backlash (ignores resistance/immunity).'],
  ],
};

const RACE_TRAITS = {
Dwarf:[['Darkvision','See 60 ft in dim light.'],['Dwarven Resilience','Advantage vs poison; poison resistance.'],['Stonecunning','Expertise on stonework History.'],['Speed 25','Not reduced by heavy armor.']],
Elf:[['Darkvision','See 60 ft in dim light.'],['Keen Senses','Perception proficiency.'],['Fey Ancestry','Advantage vs charm; no magic sleep.'],['Trance','Rest fully in 4 hours.']],
Halfling:[['Lucky','Reroll natural 1s.'],['Brave','Advantage vs frightened.'],['Nimbleness','Move through larger creatures\' space.']],
Human:[['Versatile','+1 to all abilities; an extra language.']],
'Human (Variant)':[['Custom Origin','+1 to two abilities, a skill, and a level-1 feat.']],
Dragonborn:[['Draconic Ancestry','Pick a dragon type.'],['Breath Weapon','Exhale energy (line/cone).'],['Damage Resistance','Resist your ancestry\'s type.']],
Gnome:[['Darkvision','See 60 ft in dim light.'],['Gnome Cunning','Advantage on Int/Wis/Cha saves vs magic.']],
'Half-Elf':[['Darkvision','See 60 ft in dim light.'],['Fey Ancestry','Advantage vs charm; no magic sleep.'],['Skill Versatility','Two skills of your choice.']],
'Half-Orc':[['Darkvision','See 60 ft in dim light.'],['Relentless Endurance','Drop to 1 HP once per long rest.'],['Savage Attacks','Extra die on a melee crit.'],['Menacing','Intimidation proficiency.']],
Tiefling:[['Darkvision','See 60 ft in dim light.'],['Hellish Resistance','Resist fire.'],['Infernal Legacy','Thaumaturgy + spells as you level.']],
Aasimar:[['Darkvision','See 60 ft in dim light.'],['Celestial Resistance','Resist necrotic and radiant.'],['Healing Hands','Touch heal once per long rest.'],['Light Bearer','Know the Light cantrip.']],
Tabaxi:[['Darkvision','See 60 ft in dim light.'],['Feline Agility','Briefly double your speed.'],['Claws','Climb speed and natural claws.'],['Talents','Perception and Stealth proficiency.']],
Goliath:[['Stone\'s Endurance','Reaction to reduce damage.'],['Powerful Build','Count as larger for carrying.'],['Mountain Born','Cold resistance; altitude adapted.']],
Firbolg:[['Firbolg Magic','Cast Detect Magic & Disguise Self.'],['Hidden Step','Bonus action: briefly invisible.'],['Speech of Beast and Leaf','Talk simply with beasts/plants.']],
Goblin:[['Darkvision','See 60 ft in dim light.'],['Fury of the Small','Extra damage to a bigger foe.'],['Nimble Escape','Bonus action Disengage or Hide.']],
Kobold:[['Darkvision','See 60 ft in dim light.'],['Pack Tactics','Advantage with an adjacent ally.'],['Sunlight Sensitivity','Disadvantage in direct sun.']],
Lizardfolk:[['Bite','Natural bite attack.'],['Natural Armor','AC 13 + Dex unarmored.'],['Hold Breath','Up to 15 minutes.'],['Hungry Jaws','Bonus-action bite that heals you.']],
Tortle:[['Natural Armor','Base AC 17.'],['Shell Defense','Withdraw for cover.'],['Hold Breath','Up to 1 hour.'],['Claws','Natural claw attack.']],
Warforged:[['Constructed Resilience','Vs poison/disease; no food/air needed.'],['Integrated Protection','+1 AC; armor stays on.'],['Sentry\'s Rest','Stay alert during rest.']],
Kenku:[['Mimicry','Copy sounds and voices.'],['Expert Forgery','Duplicate writing/craft.'],['Training','Two skill proficiencies.']],
Aarakocra:[['Flight','50 ft fly (no heavy armor).'],['Talons','Natural claw attack.']],
'Yuan-Ti':[['Magic Resistance','Advantage on saves vs magic.'],['Poison Immunity','Immune to poison & poisoned.'],['Innate Spellcasting','Know a few innate spells.']]
};

const FIGHTING_STYLES = {
  Fighter:['Archery','Defense','Dueling','Great Weapon Fighting','Protection','Two-Weapon Fighting'],
  Paladin:['Defense','Dueling','Great Weapon Fighting','Protection'],
  Ranger:['Archery','Defense','Dueling','Two-Weapon Fighting']
};

const FIGHTING_STYLE_LEVEL = {Fighter:1, Paladin:2, Ranger:2};

const DRAGON_ANCESTRY = ['Black (acid)','Blue (lightning)','Brass (fire)','Bronze (lightning)','Copper (acid)','Gold (fire)','Green (poison)','Red (fire)','Silver (cold)','White (cold)'];

/* ---- pixel-art sprites for classes & races (hand-drawn 12×12, my own art) ---- */

const PIX_PAL = {
  o:'#2a1e10', x:'#1a130a',
  s:'#cfd3da', d:'#9097a2',
  g:'#caa022', G:'#8a6712',
  w:'#7a4a24', W:'#a06a36', l:'#6b4322', L:'#8a5a2c',
  r:'#a8392c', b:'#3a5fa0', p:'#6e3f96', n:'#4f7a33', N:'#34571f',
  f:'#e08a2b', F:'#f4c542', y:'#e6d39a', k:'#d9a06b', K:'#b97c4a',
  e:'#efeadb', c:'#56b6c6', m:'#b5489a'
};

const CLASS_PIX = {
Fighter:["....oo......","...osso.....","...osso.....","...osso.....","...osso.....","...osso.....",".oogggggoo..","...owwo.....","...owwo.....","...oggo.....","....oo......","............"],
Rogue:[".....oo.....","....osso....","....osso....","....osso....","..oogggoo...","....owo.....","....owo.....","....ooo.....","............","............","............","............"],
Barbarian:["...ooo......","..osssoo....",".osssssso...",".osssssso...","..ossssso...","...oowWo....",".....oWo....",".....oWo....",".....oWo....",".....oWo....",".....ooo....","............"],
Paladin:[".oooooooooo.",".osssssssso.",".osssggssso.",".osggggggso.",".osssggssso.",".osssggssso.",".osssggssso.","..ossggsso..","...osggso...","....oggo....",".....oo.....","............"],
Ranger:["..o.........",".oWo........","oWo.o.......","oW...oo.....","oW.....oo...","oW.ooooooooo","oW.....oo...","oW...oo.....","oWo.o.......",".oWo........","..o.........","............"],
Wizard:[".....o......","....ooo.....","....obo.....","...obbbo....","...obFbo....","..obbbbbo...",".obbbbbbbo..","obbbbbbbbbo.","oggggggggggo",".oooooooooo.","............","............"],
Sorcerer:[".....o......","....ofo.....","....ofo.....","...offfo....","...ofFfo....","..offfffo...","..ofFFFfo...",".offFFFffo..",".offFFFffo..","..offfffo...","...oooo.....","............"],
Warlock:["............","............","...oooooo...",".ooeeeeeeoo.","oeeppppppeeo","oeeppxxppeeo","oeeppppppeeo",".ooeeeeeeoo.","...oooooo...","............","............","............"],
Cleric:[".....oo.....","....oggo....","....oggo....","....oggo....",".ooooggoooo.",".oggggggggo.",".oggggggggo.",".ooooggoooo.","....oggo....","....oggo....","....oggo....",".....oo....."],
Druid:[".....oo.....","....onno....","...onnno....","..onnnno....","..onNnno....",".onnNnno....",".onnNnno....","..onNno.....","...oNo......","...oNo......","...oNo......","............"],
Monk:["............","..oooooo....",".okkkkkko...",".okkkkkko...",".okkkkkko...",".okkkkkko...","..okkkko....",".orrrrrro...","..oooooo....","............","............","............"],
Bard:["........oo..",".......owo..","......owo...",".....owo....","...oooo.....","..owwwwo....",".owwwowwo...",".owwwwwwo...",".owwwwwwo...","..owwwwo....","...oooo.....","............"],
Artificer:["...o.oo.o...","..oddddddo..",".oddddddddo.","oddddddddddo","oddddggddddo","oddddggddddo","oddddddddddo",".oddddddddo.","..oddddddo..","...o.oo.o...","............","............"]
};

const RACE_PIX = {
Human:["............","...oooo.....","..owwwwo....",".owkkkkwo...",".okkkkkko...",".okxkkxko...",".okkkkkko...",".okkkkkko...","..okkkko....","...oooo.....","............","............"],
Elf:["............","...oooo.....","..oyyyyo....",".oykkkkyo...","ookkkkkkoo..",".okxkkxko...",".okkkkkko...",".okkkkkko...","..okkkko....","...oooo.....","............","............"],
"Half-Elf":["............","...oooo.....","..owwwwo....",".owkkkkwo...","ookkkkkko...",".okxkkxko...",".okkkkkko...",".okkkkkko...","..okkkko....","...oooo.....","............","............"],
Dwarf:["..oooooo....",".osssssso...",".oskkkkso...",".okkkkkko...",".okxkkxko...",".okkkkkko...",".owwwwwwo...",".owwwwwwo...",".owwwwwwo...","..owwwwo....","...oooo.....","............"],
Halfling:["............","...wwww.....","..wwwwww....",".wwkkkkww...",".okkkkkko...",".okxkkxko...",".okkkkkko...","..okkkko....","...oooo.....","............","............","............"],
Gnome:[".....o......","....ooo.....","...obbbo....","..obbbbbo...",".oooooooo...","..okkkko....","..okxkxko...",".okkkkkko...","..okkkko....","...oooo.....","............","............"],
Dragonborn:["............","..onnnno....",".onnnnnno...","onxnnnnxno..","onnnnnnnno..","onnnnnnnnoo.","..onnnnnnno.","...onnnno...","....oooo....","............","............","............"],
Tiefling:["..o....o....","..oo..oo....","...oooo.....","..orrrro....",".orrrrrro...",".orxrrxro...",".orrrrrro...",".orrrrrro...","..orrrro....","...oooo.....","............","............"],
"Half-Orc":["............","...oooo.....","..onnnno....",".onnnnnno...",".onxnnxno...",".onnnnnno...",".oneennno...",".onnnnnno...","..oe..eo....","...oooo.....","............","............"],
Orc:["............","..oooooo....",".onnnnnno...","oonnnnnnoo..",".oxnnnnxo...",".onnnnnno...",".oneennno...",".onnnnnno...","..oe..eo....","...oooo.....","............","............"],
Goblin:["............","o..oooo..o..","oo.onno.oo..",".onnnnnno...",".onxnnxno...",".onnnnnno...","..onnnno....","..oe..eo....","...oooo.....","............","............","............"],
Tabaxi:["..o....o....","..oo..oo....",".ollllllo...",".olxllxlo...",".olllllllo..",".olloollo...",".ollllllo...","..ollllo....","...oooo.....","............","............","............"],
Aasimar:["....gggg....",".gg....gg...","...oooo.....","..oyyyyo....",".oykkkkyo...",".okxkkxko...",".okkkkkko...",".okkkkkko...","..okkkko....","...oooo.....","............","............"],
Tortle:["............","...oooo.....","..onnnno....",".onnnnnno...","oNnnnnnnNo..","oNnnnnnnNo..","oNnnnnnnNo..",".onnnnnno...","..o.oo.o....","............","............","............"],
_default:["............","...oooo.....","..oLLLLo....",".oLLLLLLo...",".oLkkkkLo...",".oLkxxkLo...",".oLkkkkLo...",".oLLLLLLo...","..oLLLLo....","...oooo.....","............","............"]
};

const ITEM_PIX={
  spear:["......o.....",".....oso....","....ossso...",".....oso....",".....owo....",".....owo....",".....owo....",".....owo....",".....owo....",".....owo....",".....owo....",".....oo....."],
  armor:["..o....o....",".oossssoo...",".osssssso...",".osssssso...",".osssssso...",".odddddo....",".osssssso...",".osssssso...","..osssso....","...oooo.....","............","............"],
  potion:["....oo......","....oo......","...o..o.....","..o....o....",".o.rrrr.o...",".orrrrrro...",".orrrrrro...",".orrrrrro...","..orrrro....","...oooo.....","............","............"],
  ring:["....oo......","...occo.....","..oggggo....",".oggggggo...",".og....go...",".og....go...",".oggggggo...","..oggggo....","...oooo.....","............","............","............"],
  helm:["...oooo.....","..osssso....",".osssssso...",".osssssso...",".oxxxxxxo...",".osssssso...","..osssso....","...oooo.....","............","............","............","............"],
  gear:["....oo......","...o..o.....","..oooooo....",".oLLLLLLo...",".oLLLLLLo...",".oLLLLLLo...",".oLLLLLLo...","..oLLLLo....","...oooo.....","............","............","............"]
};

const WEAPONS=[
  {n:'Dagger',cat:'Simple',type:'melee',dmg:'1d4',dt:'piercing',rng:'5 ft (thrown 20/60)',props:'finesse, light, thrown'},
  {n:'Club',cat:'Simple',type:'melee',dmg:'1d4',dt:'bludgeoning',rng:'5 ft',props:'light'},
  {n:'Mace',cat:'Simple',type:'melee',dmg:'1d6',dt:'bludgeoning',rng:'5 ft',props:'—'},
  {n:'Quarterstaff',cat:'Simple',type:'melee',dmg:'1d6',dt:'bludgeoning',rng:'5 ft',props:'versatile (1d8)',vers:'1d8'},
  {n:'Spear',cat:'Simple',type:'melee',dmg:'1d6',dt:'piercing',rng:'5 ft (thrown 20/60)',props:'thrown, versatile (1d8)',vers:'1d8'},
  {n:'Handaxe',cat:'Simple',type:'melee',dmg:'1d6',dt:'slashing',rng:'5 ft (thrown 20/60)',props:'light, thrown'},
  {n:'Light Crossbow',cat:'Simple',type:'ranged',dmg:'1d8',dt:'piercing',rng:'80/320',props:'ammunition, loading, two-handed',ammo:'bolts'},
  {n:'Shortbow',cat:'Simple',type:'ranged',dmg:'1d6',dt:'piercing',rng:'80/320',props:'ammunition, two-handed',ammo:'arrows'},
  {n:'Longsword',cat:'Martial',type:'melee',dmg:'1d8',dt:'slashing',rng:'5 ft',props:'versatile (1d10)',vers:'1d10'},
  {n:'Shortsword',cat:'Martial',type:'melee',dmg:'1d6',dt:'piercing',rng:'5 ft',props:'finesse, light'},
  {n:'Rapier',cat:'Martial',type:'melee',dmg:'1d8',dt:'piercing',rng:'5 ft',props:'finesse'},
  {n:'Scimitar',cat:'Martial',type:'melee',dmg:'1d6',dt:'slashing',rng:'5 ft',props:'finesse, light'},
  {n:'Greatsword',cat:'Martial',type:'melee',dmg:'2d6',dt:'slashing',rng:'5 ft',props:'heavy, two-handed'},
  {n:'Greataxe',cat:'Martial',type:'melee',dmg:'1d12',dt:'slashing',rng:'5 ft',props:'heavy, two-handed'},
  {n:'Battleaxe',cat:'Martial',type:'melee',dmg:'1d8',dt:'slashing',rng:'5 ft',props:'versatile (1d10)',vers:'1d10'},
  {n:'Warhammer',cat:'Martial',type:'melee',dmg:'1d8',dt:'bludgeoning',rng:'5 ft',props:'versatile (1d10)',vers:'1d10'},
  {n:'Maul',cat:'Martial',type:'melee',dmg:'2d6',dt:'bludgeoning',rng:'5 ft',props:'heavy, two-handed'},
  {n:'Glaive',cat:'Martial',type:'melee',dmg:'1d10',dt:'slashing',rng:'10 ft (reach)',props:'heavy, reach, two-handed'},
  {n:'Longbow',cat:'Martial',type:'ranged',dmg:'1d8',dt:'piercing',rng:'150/600',props:'ammunition, heavy, two-handed',ammo:'arrows'},
  {n:'Hand Crossbow',cat:'Martial',type:'ranged',dmg:'1d6',dt:'piercing',rng:'30/120',props:'ammunition, light, loading',ammo:'bolts'},
  {n:'Whip',cat:'Martial',type:'melee',dmg:'1d4',dt:'slashing',rng:'10 ft (reach)',props:'finesse, reach'}
];

const CLASS_GOLD={Barbarian:50,Bard:125,Cleric:125,Druid:50,Fighter:125,Monk:12,Paladin:125,Ranger:125,Rogue:100,Sorcerer:75,Warlock:100,Wizard:100,Artificer:100,Other:60};

const WEAPON_COST={Dagger:2,Club:1,Mace:5,Quarterstaff:1,Spear:1,Handaxe:5,'Light Crossbow':25,Shortbow:25,Longsword:15,Shortsword:10,Rapier:25,Scimitar:25,Greatsword:50,Greataxe:30,Battleaxe:10,Warhammer:15,Maul:10,Glaive:20,Longbow:50,'Hand Crossbow':75,Whip:2};

const ARMOR_COST={padded:5,leather:10,studded:45,hide:10,chainshirt:50,scale:50,breastplate:400,halfplate:750,ringmail:30,chainmail:75,splint:200,plate:1500};

const ADV_GEAR=[
  {n:'Healer\'s Kit',cost:5},{n:'Potion of Healing',cost:50},{n:'Thieves\' Tools',cost:25},{n:'Lantern, Hooded',cost:5},
  {n:'Oil (flask)',cost:1},{n:'Rope (50 ft)',cost:1},{n:'Grappling Hook',cost:2},{n:'Crowbar',cost:2},{n:'Spellbook',cost:50},
  {n:'Component Pouch',cost:25},{n:'Holy Symbol',cost:5},{n:'Caltrops',cost:1},{n:'Hunting Trap',cost:5},{n:'Climber\'s Kit',cost:25},
  {n:'Backpack',cost:2},{n:'Bedroll',cost:1},{n:'Rations (1 day)',cost:1},{n:'Waterskin',cost:1},{n:'Torch',cost:1},{n:'Tinderbox',cost:1},{n:'Mess kit',cost:1}
];

const ESSENTIALS=[['Backpack',1],['Bedroll',1],['Rations (1 day)',5],['Waterskin',1],['Rope (50 ft)',1],['Torch',5],['Tinderbox',1],['Mess kit',1]];

const FORGE_GEAR={
  Fighter:{w:'Longsword',a:'chainmail',shield:true}, Barbarian:{w:'Greataxe'}, Paladin:{w:'Longsword',a:'chainmail',shield:true},
  Ranger:{w:'Longbow',w2:'Shortsword',a:'leather'}, Rogue:{w:'Shortsword',w2:'Shortbow',a:'leather'}, Monk:{w:'Quarterstaff'},
  Cleric:{w:'Mace',a:'scale',shield:true}, Druid:{w:'Quarterstaff',a:'leather'}, Wizard:{w:'Quarterstaff'}, Sorcerer:{w:'Dagger'},
  Warlock:{w:'Light Crossbow',a:'leather'}, Bard:{w:'Rapier',a:'leather'}, Artificer:{w:'Light Crossbow',a:'studded'}
};

const WEAP_PROF_FULL=['Barbarian','Fighter','Paladin','Ranger'];           // all simple + martial

const WEAP_MARTIAL_EXTRA={ Bard:['Hand Crossbow','Longsword','Rapier','Shortsword'], Rogue:['Hand Crossbow','Longsword','Rapier','Shortsword'], Monk:['Shortsword'] };

const WIZ_SORC_OK=['Dagger','Quarterstaff','Light Crossbow'];               // Wizard & Sorcerer limited list

const CONC_SPELLS=new Set(['true strike','bane','bless','detect magic','divine favor','entangle','faerie fire','fog cloud','hex',"hunter's mark",'protection from evil and good',"tasha's hideous laughter",'witch bolt','heroism','shield of faith','silent image','expeditious retreat','alter self','barkskin','blur','calm emotions','cloud of daggers','crown of madness','darkness','detect thoughts','enhance ability','enlarge/reduce','flaming sphere','gust of wind','heat metal','hold person','invisibility','levitate','locate object','magic weapon','moonbeam','pass without trace','ray of enfeeblement','silence','spider climb','spike growth','suggestion','web','beacon of hope','bestow curse','call lightning','clairvoyance','conjure animals','fear','fly','gaseous form','haste','hypnotic pattern','major image','protection from energy','sleet storm','slow','spirit guardians','stinking cloud','vampiric touch','wind wall','arcane eye','banishment','compulsion','confusion','conjure woodland beings','control water','dominate beast','greater invisibility','locate creature','phantasmal killer','polymorph','stoneskin','wall of fire','animate objects','cloudkill','conjure elemental','dispel evil and good','dominate person','hold monster','insect plague','mislead','modify memory','scrying','telekinesis','tree stride','wall of force','wall of stone','eyebite','find the path','globe of invulnerability','sunbeam','wall of ice','conjure celestial','delayed blast fireball','reverse gravity','antimagic field','dominate monster','earthquake','holy aura','maze','gate','storm of vengeance']);

const DRACONIC_ANCESTRY_DAMAGE = {Black:'acid', Blue:'lightning', Brass:'fire', Bronze:'lightning', Copper:'acid', Gold:'fire', Green:'poison', Red:'fire', Silver:'cold', White:'cold'};
// Assassinate's first clause ("hasn't taken a turn in the combat yet") is derivable for free
// from initiative order — no new tracking needed. The auto-crit/Death Strike clauses need an
// actual "surprised" flag (this app has no ambush/surprise-round system at all), toggled
// manually by the DM/player the same way other DM-adjudicated states already are in this app
// (e.g. hazard terrain painting) — cleared automatically the first time that unit's own turn
// is processed, since surprise never lasts past a creature's first turn (PHB).

const POWER_WORD_HP={'Power Word Kill':100,'Power Word Stun':150};
// Eyebite: re-targetable each turn, choose ONE of three effects per cast; a single Wis save
// gates all of them (unlike a normal save spell, a success means no effect at all — not half).

const EYEBITE_OPTIONS=[
  {key:'sleep', label:'😴 Asleep', cond:'Asleep', rounds:10},
  {key:'frighten', label:'😱 Frightened', cond:'Frightened', rounds:10},
  {key:'panic', label:'😵 Panicked — 3d6 psychic + Poisoned', cond:'Poisoned', rounds:10, dmg:'3d6', dtype:'psychic'}
];
// ad/casterId parameterize this over qbAdapter+'pc' (Quick Battle) or playerNetAdapter+'me'
// (player-net targeting) so Eyebite isn't stuck as a QB-only bespoke check.

const SPELL_TELEPORT={'Misty Step':{tiles:6,los:true},'Dimension Door':{tiles:100,los:false},'Teleport':{tiles:999,los:false},'Teleportation Circle':{tiles:999,los:false}};
// destination legal? not solid/deadly terrain, unoccupied, in range, LoS if required

const METAMAGIC_OPTIONS=['Careful Spell','Distant Spell','Empowered Spell','Extended Spell','Heightened Spell','Quickened Spell','Subtle Spell','Twinned Spell'];

const ELDRITCH_INVOCATIONS=['Agonizing Blast','Armor of Shadows','Beast Speech','Beguiling Influence','Devil\'s Sight','Eldritch Mind','Eyes of the Rune Keeper','Fiendish Vigor','Mask of Many Faces','Misty Visions','Repelling Blast','Thief of Five Fates','Gaze of Two Minds','One with Shadows','Sign of Ill Omen'];

const FAVORED_ENEMY_TYPES=['Aberrations','Beasts','Celestials','Constructs','Dragons','Elementals','Fey','Fiends','Giants','Monstrosities','Oozes','Plants','Undead'];

const FAVORED_TERRAIN_TYPES=['Arctic','Coast','Desert','Forest','Grassland','Mountain','Swamp'];

const SUBCLASSES = {
  Artificer:['Alchemist','Armorer','Artillerist','Battle Smith'],
  Barbarian:['Path of the Berserker','Path of the Totem Warrior','Ancestral Guardian','Storm Herald','Zealot','Path of the Beast','Wild Magic','Battlerager'],
  Bard:['College of Lore','College of Valor','Glamour','Swords','Whispers','Eloquence','Creation','Spirits'],
  Cleric:['Knowledge','Life','Light','Nature','Tempest','Trickery','War','Death','Forge','Grave','Order','Peace','Twilight','Arcana'],
  Druid:['Circle of the Land','Circle of the Moon','Dreams','Shepherd','Spores','Stars','Wildfire'],
  Fighter:['Champion','Battle Master','Eldritch Knight','Arcane Archer','Cavalier','Samurai','Psi Warrior','Rune Knight','Echo Knight','Purple Dragon Knight'],
  Monk:['Open Hand','Shadow','Four Elements','Drunken Master','Kensei','Sun Soul','Mercy','Astral Self','Long Death','Ascendant Dragon'],
  Paladin:['Devotion','Ancients','Vengeance','Conquest','Crown','Glory','Redemption','Watchers','Oathbreaker'],
  Ranger:['Hunter','Beast Master','Gloom Stalker','Horizon Walker','Monster Slayer','Fey Wanderer','Swarmkeeper','Drakewarden'],
  Rogue:['Thief','Assassin','Arcane Trickster','Inquisitive','Mastermind','Scout','Swashbuckler','Phantom','Soulknife'],
  Sorcerer:['Draconic Bloodline','Wild Magic','Divine Soul','Shadow Magic','Storm Sorcery','Aberrant Mind','Clockwork Soul','Lunar Sorcery'],
  Warlock:['The Archfey','The Fiend','The Great Old One','The Celestial','The Hexblade','The Fathomless','The Genie','The Undead','The Undying'],
  Wizard:['Abjuration','Conjuration','Divination','Enchantment','Evocation','Illusion','Necromancy','Transmutation','Bladesinging','War Magic','Chronurgy','Graviturgy','Order of Scribes'],
  Other:[]
};

const CLASS_SAVES = {
  Artificer:['con','int'], Barbarian:['str','con'], Bard:['dex','cha'], Cleric:['wis','cha'],
  Druid:['int','wis'], Fighter:['str','con'], Monk:['str','dex'], Paladin:['wis','cha'],
  Ranger:['str','dex'], Rogue:['dex','int'], Sorcerer:['con','cha'], Warlock:['wis','cha'], Wizard:['int','wis']
};

const CLASS_HITDIE = {
  Barbarian:12, Fighter:10, Paladin:10, Ranger:10,
  Artificer:8, Bard:8, Cleric:8, Druid:8, Monk:8, Rogue:8, Warlock:8, Sorcerer:6, Wizard:6
};
// Level a class chooses its subclass.

const SUBCLASS_LEVEL = {Cleric:1, Sorcerer:1, Warlock:1, Druid:2, Wizard:2};

const PB_COST = {8:0,9:1,10:2,11:3,12:4,13:5,14:7,15:9};

const STD_ARRAY = [15,14,13,12,10,8];

const CLASS_SPELL_ABILITY = {Bard:'cha',Paladin:'cha',Sorcerer:'cha',Warlock:'cha',Cleric:'wis',Druid:'wis',Ranger:'wis',Wizard:'int',Artificer:'int'};

const RITUAL_SPELLS = new Set(['Alarm','Comprehend Languages','Detect Magic','Find Familiar',
  'Identify','Purify Food and Drink','Unseen Servant','Animal Messenger','Augury',
  'Gentle Repose','Silence','Water Breathing','Water Walk','Zone of Truth','Clairvoyance',
  'Speak with Dead','Tongues','Divination','Commune','Commune with Nature',
  'Contact Other Plane','Legend Lore']);
// Classes with the innate Ritual Casting class feature (PHB/Tasha's) — Paladin is deliberately
// excluded despite being in isPrepCaster above (it never gets ritual casting).

const RITUAL_CASTERS = ['Bard','Cleric','Druid','Wizard','Artificer'];
// Bard/Wizard/Artificer: any known ritual spell qualifies (Wizard/Artificer don't even need it
// prepared — RAW). Cleric/Druid: must be prepared, same as casting it normally. Ritual Caster
// feat: simplified to "any ritual spell you already know," since this app doesn't track a
// separate ritual-book spell list distinct from a character's known spells.

const OATH_SPELLS = { 'Devotion': {3:['Protection from Evil and Good','Sanctuary'],5:['Lesser Restoration','Zone of Truth'],9:['Beacon of Hope','Dispel Magic'],13:['Freedom of Movement','Guardian of Faith'],17:['Commune','Flame Strike']} };

const RACE_ASI = {
  'Dragonborn':{str:2,cha:1},'Dwarf':{con:2},'Elf':{dex:2},'Gnome':{int:2},'Half-Elf':{cha:2},
  'Half-Orc':{str:2,con:1},'Halfling':{dex:2},'Human':{str:1,dex:1,con:1,int:1,wis:1,cha:1},
  'Tiefling':{cha:2,int:1},'Aarakocra':{dex:2,wis:1},'Aasimar':{cha:2},'Bugbear':{str:2,dex:1},
  'Centaur':{str:2,wis:1},'Changeling':{cha:2},'Fairy':{dex:2},'Firbolg':{wis:2,str:1},'Genasi':{con:2},
  'Githyanki':{str:2,int:1},'Githzerai':{wis:2,int:1},'Goblin':{dex:2,con:1},'Goliath':{str:2,con:1},
  'Harengon':{dex:2},'Hobgoblin':{con:2,int:1},'Kalashtar':{wis:2,cha:1},'Kenku':{dex:2,wis:1},'Kobold':{dex:2},
  'Leonin':{con:2,str:1},'Lizardfolk':{con:2,wis:1},'Loxodon':{con:2,wis:1},'Minotaur':{str:2,con:1},
  'Orc':{str:2,con:1},'Owlin':{dex:2},'Satyr':{cha:2,dex:1},'Shifter':{dex:2},'Simic Hybrid':{con:2},
  'Tabaxi':{dex:2,cha:1},'Tortle':{str:2,wis:1},'Triton':{str:1,con:1,cha:1},'Vedalken':{int:2,wis:1},
  'Warforged':{con:2},'Yuan-Ti':{cha:2,int:1}
};

const FEAT_DESC = {
'Alert':'+5 initiative; you can\'t be surprised while conscious; attackers don\'t gain advantage from being unseen.',
'Athlete':'+1 STR or DEX; stand from prone using 5 ft; climb at full speed; running long/high jump after only 5 ft.',
'Actor':'+1 CHA; advantage on Deception/Performance to pass as someone else; mimic speech and sounds you\'ve heard.',
'Charger':'After you Dash, use a bonus action to make a melee attack (+5 damage) or shove (10 ft).',
'Crossbow Expert':'Ignore loading; no disadvantage firing in melee; bonus-action hand-crossbow shot after an attack.',
'Defensive Duelist':'With a finesse weapon, use a reaction to add your proficiency bonus to AC vs one melee attack.',
'Dual Wielder':'+1 AC while dual-wielding; two-weapon fighting with non-light weapons; draw/stow two weapons at once.',
'Dungeon Delver':'Advantage to detect traps; search at normal pace; resistance to trap damage.',
'Durable':'+1 CON; when you spend a Hit Die to heal, regain at least twice your CON modifier.',
'Elemental Adept':'Spells ignore resistance to one damage type; treat 1s on those damage dice as 2s.',
'Fey Touched':'+1 INT/WIS/CHA; learn Misty Step + a 1st-level enchant/divination; cast each once/day for free.',
'Grappler':'Advantage on attacks vs creatures you grapple; you can pin a grappled creature.',
'Great Weapon Master':'Bonus attack on a crit or kill; take −5 to hit for +10 damage with heavy weapons.',
'Gunner':'+1 DEX; ignore firearm loading; no disadvantage firing in melee.',
'Healer':'Use a healer\'s kit to stabilize and heal 1 HP, or restore 1d6+4 + creature\'s hit dice once per rest.',
'Heavily Armored':'+1 STR; gain proficiency with heavy armor.',
'Heavy Armor Master':'+1 STR; reduce nonmagical bludgeoning/piercing/slashing damage by 3 in heavy armor.',
'Inspiring Leader':'Spend 10 min to give up to 6 allies temp HP equal to your level + CHA modifier.',
'Keen Mind':'+1 INT; always know which way is north and hours until sunrise/set; recall anything from the past month.',
'Lightly Armored':'+1 STR or DEX; gain proficiency with light armor.',
'Lucky':'3 luck points/day: reroll an attack, ability check, save, or an attack made against you.',
'Mage Slayer':'Reaction attack when a creature within 5 ft casts; advantage on saves vs their spells; spoil concentration.',
'Magic Initiate':'Learn 2 cantrips and a 1st-level spell from one class; cast the 1st-level spell once/day for free.',
'Martial Adept':'Learn two Battle Master maneuvers and gain one superiority die (d6).',
'Medium Armor Master':'No stealth disadvantage in medium armor; add up to +3 DEX (instead of +2) to AC.',
'Mobile':'+10 ft speed; Dash ignores difficult terrain; a melee target you attack can\'t make opportunity attacks vs you.',
'Moderately Armored':'+1 STR or DEX; proficiency with medium armor and shields.',
'Mounted Combatant':'Advantage vs unmounted creatures smaller than your mount; redirect attacks to yourself; mount dodges area effects.',
'Observant':'+1 INT or WIS; read lips; +5 to passive Perception and Investigation.',
'Polearm Master':'Bonus-action butt-end attack (1d4); opportunity attack when creatures enter your reach (with polearms).',
'Resilient':'+1 to one ability and gain proficiency in that ability\'s saving throws.',
'Ritual Caster':'Learn and cast ritual spells from a chosen class\'s ritual book.',
'Savage Attacker':'Once per turn, reroll your melee weapon\'s damage dice and use either total.',
'Sentinel':'Opportunity attacks reduce a target\'s speed to 0; hit creatures that attack your allies; ignore Disengage.',
'Shadow Touched':'+1 INT/WIS/CHA; learn Invisibility + a 1st-level illusion/necromancy; cast each once/day for free.',
'Sharpshooter':'No long-range disadvantage; ignore half/three-quarters cover; −5 to hit for +10 damage with ranged weapons.',
'Shield Master':'Bonus-action shove with your shield; add shield to DEX saves vs effects targeting only you; reaction to take no damage.',
'Skill Expert':'+1 to one ability; gain one skill proficiency; gain expertise in one skill.',
'Skilled':'Gain proficiency in any three skills or tools.',
'Skulker':'Hide when lightly obscured; missing a ranged attack doesn\'t reveal you; no disadvantage in dim light.',
'Spell Sniper':'Double the range of attack-roll spells; ignore cover; learn one attack cantrip.',
'Tavern Brawler':'+1 STR or CON; proficient with improvised weapons; unarmed strike deals 1d4; bonus-action grapple after a hit.',
'Telekinetic':'+1 INT/WIS/CHA; learn Mage Hand (invisible, no components); bonus-action telekinetic shove 5 ft.',
'Telepathic':'+1 INT/WIS/CHA; speak telepathically to any creature within 60 ft; cast Detect Thoughts once/day for free.',
'Tough':'Your hit point maximum increases by 2 per character level.',
'War Caster':'Advantage on concentration saves; cast spells with hands full; cast a spell as an opportunity attack.',
'Weapon Master':'+1 STR or DEX; gain proficiency with four weapons of your choice.'
};

const FEATS = Object.keys(FEAT_DESC);

const CLASS_FROM_LETTER={A:'Artificer',B:'Bard',C:'Cleric',D:'Druid',P:'Paladin',R:'Ranger',S:'Sorcerer',K:'Warlock',W:'Wizard'};

const FEAT_GRANTS = {
'Skilled':[{t:'skill',n:3}],
'Skill Expert':[{t:'ability',n:1},{t:'skill',n:1},{t:'expertise',n:1}],
'Resilient':[{t:'resilient'}],
'Athlete':[{t:'ability',n:1,options:['str','dex']}],
'Lightly Armored':[{t:'ability',n:1,options:['str','dex']}],
'Moderately Armored':[{t:'ability',n:1,options:['str','dex']}],
// Weapon Master's proficiency grant used to do nothing at all — weaponProficient() only ever
// checked class, never c.weaponMasterProfs — so someone who took this feat for, say, a
// longsword got no actual to-hit benefit from it. Fixed by adding the missing weapon-choice
// picker (a new 'weaponProf' spec type) and wiring weaponProficient() to check it.
'Weapon Master':[{t:'ability',n:1,options:['str','dex']},{t:'weaponProf',n:4}],
'Tavern Brawler':[{t:'ability',n:1,options:['str','con']}],
'Observant':[{t:'ability',n:1,options:['int','wis']}],
'Actor':[{t:'fixed',k:'cha'}],
'Durable':[{t:'fixed',k:'con'}],
'Heavily Armored':[{t:'fixed',k:'str'}],
'Heavy Armor Master':[{t:'fixed',k:'str'}],
'Keen Mind':[{t:'fixed',k:'int'}],
// Gunner was missing entirely — its own FEAT_DESC promises "+1 DEX" but no grant existed at
// all, so taking it gave nothing.
'Gunner':[{t:'fixed',k:'dex'}],
'Fey Touched':[{t:'ability',n:1,options:['int','wis','cha']},{t:'autospell',spells:['Misty Step']},{t:'spellChoice',lvl:1,schools:['E','D'],n:1}],
'Shadow Touched':[{t:'ability',n:1,options:['int','wis','cha']},{t:'autospell',spells:['Invisibility']},{t:'spellChoice',lvl:1,schools:['I','N'],n:1}],
'Telekinetic':[{t:'ability',n:1,options:['int','wis','cha']},{t:'autospell',spells:['Mage Hand']}],
'Telepathic':[{t:'ability',n:1,options:['int','wis','cha']},{t:'autospell',spells:['Detect Thoughts']}],
'Magic Initiate':[{t:'spellChoice',lvl:0,n:2,any:true},{t:'spellChoice',lvl:1,n:1,any:true}],
// Spell Sniper's "learn one attack cantrip" grant was also missing entirely.
'Spell Sniper':[{t:'spellChoice',lvl:0,n:1,any:true,attackOnly:true}]
};

const ARMOR = [
  {key:'none',       name:'Unarmored',       base:10, dexCap:99},
  {key:'padded',     name:'Padded',          base:11, dexCap:99, cat:'light'},
  {key:'leather',    name:'Leather',         base:11, dexCap:99, cat:'light'},
  {key:'studded',    name:'Studded Leather', base:12, dexCap:99, cat:'light'},
  {key:'hide',       name:'Hide',            base:12, dexCap:2,  cat:'medium'},
  {key:'chainshirt', name:'Chain Shirt',     base:13, dexCap:2,  cat:'medium'},
  {key:'scale',      name:'Scale Mail',      base:14, dexCap:2,  cat:'medium'},
  {key:'breastplate',name:'Breastplate',     base:14, dexCap:2,  cat:'medium'},
  {key:'halfplate',  name:'Half Plate',      base:15, dexCap:2,  cat:'medium'},
  {key:'ringmail',   name:'Ring Mail',       base:14, dexCap:0,  cat:'heavy'},
  {key:'chainmail',  name:'Chain Mail',      base:16, dexCap:0,  cat:'heavy'},
  {key:'splint',     name:'Splint',          base:17, dexCap:0,  cat:'heavy'},
  {key:'plate',      name:'Plate',           base:18, dexCap:0,  cat:'heavy'}
];

const ARMOR_PROF = {
  Barbarian:['light','medium'], Bard:['light'], Cleric:['light','medium'],
  Druid:['light','medium'], Fighter:['light','medium','heavy'], Monk:[],
  Paladin:['light','medium','heavy'], Ranger:['light','medium'], Rogue:['light'],
  Sorcerer:[], Warlock:['light'], Wizard:[], Artificer:['light','medium']
};
// Lightly/Moderately/Heavily Armored each grant proficiency with exactly one armor
// category on top of whatever the class already grants (PHB feat text).

const RACE_SPEED = {'Dwarf':25,'Halfling':25,'Gnome':25,'Kobold':30,'Tortle':30,'Aarakocra':25,'Centaur':40,'Minotaur':40,'Elf':30};


const CLASS_LETTER = {Artificer:'A',Bard:'B',Cleric:'C',Druid:'D',Paladin:'P',Ranger:'R',Sorcerer:'S',Warlock:'K',Wizard:'W'};
// entries: "Name:classes:school"  · schools A C D E V I N T (Evocation=V)

const SPELL_SRC = {
0:"Acid Splash:SWA:C|Chill Touch:SWK:N|Dancing Lights:BSW:V|Druidcraft:D:T|Eldritch Blast:K:V|Fire Bolt:SWA:V|Guidance:CDA:D|Light:BCSWA:V|Mage Hand:BSWKA:C|Mending:BCDSWA:T|Message:BSWA:T|Minor Illusion:BSWK:I|Poison Spray:DSWKA:C|Prestidigitation:BSWKA:T|Produce Flame:D:C|Ray of Frost:SWA:V|Resistance:CDA:A|Sacred Flame:C:V|Shillelagh:D:T|Shocking Grasp:SWA:V|Spare the Dying:CA:N|Thaumaturgy:C:T|Thorn Whip:D:T|True Strike:BSW:D|Vicious Mockery:B:E",
1:"Absorb Elements:SWRA:A|Alarm:RWA:A|Animal Friendship:BDR:E|Bane:BC:E|Bless:CP:E|Burning Hands:SW:V|Charm Person:BDSWK:E|Color Spray:SW:I|Command:CP:E|Comprehend Languages:BSWK:D|Create or Destroy Water:CD:T|Cure Wounds:BCDPRA:V|Detect Magic:BCDPRSWA:D|Disguise Self:BSWA:I|Divine Favor:P:V|Entangle:D:C|Expeditious Retreat:SWA:T|Faerie Fire:BD:V|False Life:SWA:N|Feather Fall:BSW:T|Find Familiar:W:C|Fog Cloud:DRSW:C|Goodberry:DR:T|Grease:WA:C|Guiding Bolt:C:V|Healing Word:BCD:V|Hellish Rebuke:K:V|Heroism:BP:E|Hex:K:E|Hunter's Mark:R:D|Identify:BWA:D|Inflict Wounds:C:N|Jump:DRSWA:T|Longstrider:BDRWA:T|Mage Armor:SW:A|Magic Missile:SW:V|Protection from Evil and Good:CPWK:A|Purify Food and Drink:CDP:T|Ray of Sickness:SW:N|Sanctuary:CA:A|Shield:SW:A|Shield of Faith:CP:A|Silent Image:BSW:I|Sleep:BSW:E|Speak with Animals:BDR:D|Tasha's Hideous Laughter:BW:E|Thunderwave:BDSW:V|Unseen Servant:BWK:C|Witch Bolt:SWK:V",
2:"Aid:CPA:A|Alter Self:SWA:T|Animal Messenger:BDR:E|Barkskin:DR:T|Blindness/Deafness:BCSW:N|Blur:SWA:I|Calm Emotions:BC:E|Cloud of Daggers:BSWK:C|Continual Flame:CWA:V|Crown of Madness:BSWK:E|Darkness:SWK:V|Darkvision:DRSWA:T|Detect Thoughts:BSW:D|Enhance Ability:BCDSA:T|Enlarge/Reduce:SWA:T|Find Steed:P:C|Flaming Sphere:DSW:C|Gentle Repose:CW:N|Gust of Wind:DSW:V|Heat Metal:BDA:T|Hold Person:BCDSWK:E|Invisibility:BSWKA:I|Knock:BSW:T|Lesser Restoration:BCDPRA:A|Levitate:SWA:T|Locate Object:BCDPRW:D|Magic Weapon:PWA:T|Mirror Image:SWK:I|Misty Step:SWK:C|Moonbeam:D:V|Pass without Trace:DR:A|Prayer of Healing:C:V|Protection from Poison:CDPRA:A|Ray of Enfeeblement:WK:N|Rope Trick:WA:T|Scorching Ray:SW:V|See Invisibility:BSWA:D|Shatter:BSWK:V|Silence:BCR:I|Spider Climb:SWKA:T|Spike Growth:DR:T|Spiritual Weapon:C:V|Suggestion:BSWK:E|Web:SWA:C|Zone of Truth:BCP:E",
3:"Animate Dead:CW:N|Beacon of Hope:C:A|Bestow Curse:BCWK:N|Blink:SW:T|Call Lightning:D:C|Clairvoyance:BCSW:D|Conjure Animals:DR:C|Counterspell:SWK:A|Create Food and Water:CP:C|Daylight:CDPRSW:V|Dispel Magic:BCDPSWKA:A|Fear:BSWK:I|Fireball:SW:V|Fly:SWKA:T|Gaseous Form:SWK:T|Haste:SWA:T|Hypnotic Pattern:BSWK:I|Lightning Bolt:SW:V|Magic Circle:CPWK:A|Major Image:BSWK:I|Mass Healing Word:C:V|Meld into Stone:CD:T|Nondetection:BRWA:A|Plant Growth:BDR:T|Protection from Energy:CDRSWA:A|Remove Curse:CPWK:A|Revivify:CPA:N|Sending:BCW:V|Sleet Storm:DSW:C|Slow:SW:T|Speak with Dead:BC:N|Spirit Guardians:C:C|Stinking Cloud:BSW:C|Tongues:BCSWK:D|Vampiric Touch:SWK:N|Water Breathing:DRSWA:T|Water Walk:CDRSA:T|Wind Wall:DR:V",
4:"Arcane Eye:WA:D|Banishment:CPSWK:A|Blight:DSWK:N|Compulsion:B:E|Confusion:BDSWK:E|Conjure Woodland Beings:DR:C|Control Water:CDW:T|Death Ward:CP:A|Dimension Door:BSWK:C|Divination:C:D|Dominate Beast:DS:E|Fabricate:W:T|Find Greater Steed:P:C|Freedom of Movement:BCDRA:A|Greater Invisibility:BSW:I|Guardian of Faith:C:C|Ice Storm:DSW:V|Locate Creature:BCDPRW:D|Phantasmal Killer:W:I|Polymorph:BDSW:T|Stone Shape:CDWA:T|Stoneskin:DRSW:A|Wall of Fire:DSWA:V",
5:"Animate Objects:BSWA:T|Awaken:BD:T|Cloudkill:SW:C|Commune:C:D|Commune with Nature:DR:D|Cone of Cold:SW:V|Conjure Elemental:DW:C|Contact Other Plane:WK:D|Dispel Evil and Good:CP:A|Dominate Person:BSW:E|Dream:BWK:I|Flame Strike:CP:V|Geas:BCDPW:E|Greater Restoration:BCDA:A|Hallow:C:E|Hold Monster:BSWK:E|Insect Plague:CDS:C|Legend Lore:BCW:D|Mass Cure Wounds:BCD:C|Mislead:BW:I|Modify Memory:BW:E|Planar Binding:BCDWK:A|Raise Dead:BCP:N|Reincarnate:D:T|Scrying:BCDWK:D|Seeming:BSW:I|Telekinesis:SW:T|Teleportation Circle:BSWK:C|Tree Stride:DR:C|Wall of Force:W:V|Wall of Stone:DSWA:V",
6:"Chain Lightning:SW:V|Circle of Death:SWK:N|Disintegrate:SW:T|Eyebite:BSWK:N|Find the Path:BCD:D|Globe of Invulnerability:SW:A|Harm:C:N|Heal:CD:V|Heroes' Feast:CD:C|Mass Suggestion:BSWK:E|Sunbeam:DSW:V|True Seeing:BCSWK:D|Wall of Ice:W:V|Word of Recall:C:C",
7:"Conjure Celestial:C:C|Delayed Blast Fireball:SW:V|Etherealness:BCSWK:T|Finger of Death:SWK:N|Fire Storm:CDS:V|Forcecage:BWK:V|Plane Shift:CDSWK:C|Prismatic Spray:SW:V|Regenerate:BCD:T|Resurrection:BCP:N|Reverse Gravity:DSW:T|Teleport:BSW:C",
8:"Animal Shapes:D:T|Antimagic Field:CW:A|Dominate Monster:BSWK:E|Earthquake:CDS:V|Feeblemind:BDSWK:E|Holy Aura:C:A|Maze:W:C|Mind Blank:BW:A|Power Word Stun:BSWK:E|Sunburst:DSW:V",
9:"Astral Projection:CWK:N|Foresight:BDWK:D|Gate:CSW:C|Mass Heal:C:C|Meteor Swarm:SW:V|Power Word Kill:BSWK:E|Time Stop:SW:T|True Resurrection:CD:N|Wish:SW:C|Storm of Vengeance:D:C"
};

const SCHOOL_NAME={A:'Abjuration',C:'Conjuration',D:'Divination',E:'Enchantment',V:'Evocation',I:'Illusion',N:'Necromancy',T:'Transmutation'};

const SCHOOL_ICON={A:'🛡️',C:'🌀',D:'🔮',E:'💖',V:'🔥',I:'🎭',N:'💀',T:'♻️'};

const SPELL_DESC={
'Acid Splash':'Hurl acid; Dex save, 1d6 acid to one or two creatures.','Chill Touch':'Ranged spell attack, 1d8 necrotic; the target can\'t recover HP this turn.','Dancing Lights':'Create up to four movable floating lights.','Druidcraft':'Minor nature effects — weather hint, bloom, tiny sensory.','Eldritch Blast':'Ranged beam, 1d10 force (more beams as you level).','Fire Bolt':'Ranged fire mote, 1d10 fire; ignites objects.','Guidance':'Touch; add 1d4 to one ability check.','Light':'An object sheds bright light in 20 ft.','Mage Hand':'Spectral hand within 30 ft (6 tiles); moves 30 ft/round, carries ≤10 lb; can\'t attack. Sleight of Hand vs Perception to go unnoticed.','Mending':'Repair a single break or tear in an object.','Message':'Whisper a message to a creature within 120 ft.','Minor Illusion':'Create a small sound or image illusion.','Poison Spray':'Puff of poison; Con save, 1d12 poison.','Prestidigitation':'Minor tricks — clean, flavor, spark, trinket.','Produce Flame':'Flame for light, or a ranged spell attack: 1d8 fire.','Ray of Frost':'Cold beam, 1d8 cold; −10 ft speed.','Resistance':'Touch; add 1d4 to one saving throw.','Sacred Flame':'Radiant flame, Dex save (ignores cover), 1d8.','Shillelagh':'Club/quarterstaff uses your spell stat, 1d8.','Shocking Grasp':'Melee spell attack, 1d8 lightning; the target can\'t take reactions.','Spare the Dying':'Touch a dying creature to stabilize it.','Thaumaturgy':'Minor divine effects — voice, flames, tremors.','Thorn Whip':'Melee spell attack (30 ft), 1d6 piercing; pull the target 10 ft closer.','True Strike':'Advantage on your next attack vs a target.','Vicious Mockery':'Insult; Wis save, 1d4 psychic + disadvantage.',
'Absorb Elements':'Reaction when you take acid, cold, fire, lightning, or thunder damage: halve it, and add 1d6 of that type to your next melee hit.','Alarm':'Ward an area to alert you when something enters.','Animal Friendship':'Charm a beast (Wis save) for 24 hours.','Bane':'Up to 3 foes subtract 1d4 from attacks and saves.','Bless':'Up to 3 allies add 1d4 to attacks and saves.','Burning Hands':'15-ft cone, Dex save, 3d6 fire.','Charm Person':'Charm a humanoid (Wis save) for an hour.','Color Spray':'Blind creatures (by HP) in a 15-ft cone.','Command':'One-word command a creature must obey (Wis save).','Comprehend Languages':'Understand any spoken or written language.','Create or Destroy Water':'Create or destroy up to 10 gallons of water.','Cure Wounds':'Touch heals 1d8 + spell mod HP.','Detect Magic':'Sense magic within 30 ft and its school.','Disguise Self':'Change your appearance (illusion) for an hour.','Divine Favor':'Your weapon attacks deal +1d4 radiant.','Entangle':'Plants restrain creatures in 20 ft (Str save).','Expeditious Retreat':'Bonus-action Dash each turn for 10 min.','Faerie Fire':'Dex save; outlined foes grant advantage to attacks against them.','False Life':'Gain 1d4+4 temporary HP.','Feather Fall':'Up to 5 falling creatures take no fall damage.','Find Familiar':'Summon a spirit familiar in animal form.','Fog Cloud':'A 20-ft sphere of heavily obscuring fog.','Goodberry':'Create 10 berries; each restores 1 HP.','Grease':'10-ft square is slippery (Dex save or prone).','Guiding Bolt':'Ranged 4d6 radiant; next attack has advantage.','Healing Word':'Bonus action, ranged heal 1d4 + mod.','Hellish Rebuke':'Reaction; attacker takes 2d10 fire (Dex save).','Heroism':'Immune to fear and gains temp HP each turn.','Hex':'Curse a foe: +1d6 necrotic, disadvantage on one ability.','Hunter\'s Mark':'Mark a target for +1d6 weapon damage.','Identify':'Learn an item\'s magic or a spell on a creature.','Inflict Wounds':'Melee spell attack, 3d10 necrotic.','Jump':'Target\'s jump distance triples.','Longstrider':'Target\'s speed +10 ft for an hour.','Mage Armor':'Unarmored target\'s AC becomes 13 + Dex.','Magic Missile':'Three darts, 3d4+3 force total; auto-hits a creature you can see.','Protection from Evil and Good':'Ward a creature vs certain creature types.','Purify Food and Drink':'Remove poison/disease from food and drink.','Ray of Sickness':'Ranged 2d8 poison; Con save or poisoned.','Sanctuary':'Attackers need a Wis save to target the warded creature.','Shield':'Reaction; +5 AC and block Magic Missile.','Shield of Faith':'A target gains +2 AC for 10 min.','Silent Image':'Create a movable illusory image.','Sleep':'Put the weakest creatures in the area to sleep, by their total HP — no save (undead & elves immune).','Speak with Animals':'Communicate with beasts for 10 min.','Tasha\'s Hideous Laughter':'A creature falls prone laughing (Wis save).','Thunderwave':'15-ft cube, Con save, 2d8 thunder + push.','Unseen Servant':'Invisible force does simple tasks for an hour.','Witch Bolt':'Ranged spell attack, 1d12 lightning; repeat the damage each turn while concentrating.',
'Aid':'Raise HP max and current HP of 3 creatures by 5.','Alter Self':'Change form — aquatic, looks, or natural weapons.','Animal Messenger':'Send a tiny beast to deliver a message.','Barkskin':'Target\'s AC can\'t be lower than 16.','Blindness/Deafness':'Blind or deafen a creature (Con save).','Blur':'Attackers have disadvantage against you.','Calm Emotions':'20-ft sphere; Cha save or a creature is Charmed (calmed) for 1 minute.','Cloud of Daggers':'Blades fill a 5-ft cube, 4d4 slashing.','Continual Flame':'A permanent heatless flame.','Crown of Madness':'Force a charmed creature to attack your choice.','Darkness':'A 15-ft sphere of magical darkness.','Darkvision':'Grant a creature 60-ft darkvision.','Detect Thoughts':'Read surface thoughts of creatures.','Enhance Ability':'Advantage on one ability\'s checks.','Enlarge/Reduce':'Double or halve a creature/object\'s size.','Find Steed':'Summon a bonded spirit steed (Warhorse/Pony/Camel/Elk/Mastiff) and mount it.','Flaming Sphere':'A rolling 2d6 fire sphere you move.','Gentle Repose':'Stave off decay and undeath on a corpse.','Gust of Wind':'60-ft line of wind pushes creatures.','Heat Metal':'Make metal red-hot, 2d8 fire and drop it.','Hold Person':'Paralyze a humanoid (Wis save each turn).','Invisibility':'A creature is invisible until it attacks/casts.','Knock':'Magically unlock something (loudly).','Lesser Restoration':'End a disease or one condition (blind/poison/etc).','Levitate':'Raise a creature/object up to 20 ft.','Locate Object':'Sense direction to a known object within 1000 ft.','Magic Weapon':'A nonmagical weapon becomes +1.','Mirror Image':'Three duplicates misdirect attacks.','Misty Step':'Bonus-action teleport 30 ft.','Moonbeam':'5-ft radius column; Con save, 2d10 radiant each turn; you can move it.','Pass without Trace':'Your group gets +10 Stealth, no tracks.','Prayer of Healing':'Heal up to 6 creatures 2d8 + mod (10 min).','Protection from Poison':'Neutralize poison and grant resistance.','Ray of Enfeeblement':'Target deals half damage with Str attacks.','Rope Trick':'A rope leads to an extradimensional space.','Scorching Ray':'Three rays, 2d6 fire each.','See Invisibility':'See invisible creatures and the Ethereal.','Shatter':'10-ft sphere, Con save, 3d8 thunder.','Silence':'No sound in a 20-ft sphere.','Spider Climb':'Walk on walls and ceilings.','Spike Growth':'20 ft of spikes; 2d4 and difficult terrain.','Spiritual Weapon':'Bonus action: a floating weapon; melee spell attack, 1d8 + mod.','Suggestion':'Wis save. Suggest a reasonable-sounding act; ends if you or your allies harm the target.','Web':'Fill a 20-ft cube with webs; Dex save or restrained.','Zone of Truth':'Creatures can\'t lie in 15 ft (Cha save).',
'Animate Dead':'Raise a skeleton or zombie under your control.','Beacon of Hope':'Allies get save advantage and max healing.','Bestow Curse':'Curse a creature with a chosen drawback.','Blink':'Each turn you may vanish to the Ethereal.','Call Lightning':'Storm cloud; Dex save, 3d10 lightning each turn you call it down.','Clairvoyance':'An invisible sensor sees/hears a distant place.','Conjure Animals':'Summon fey beasts to fight for you.','Counterspell':'Reaction; spells of 3rd level or lower are stopped automatically — for higher, make a spellcasting ability check, DC 10 + the spell\'s level.','Create Food and Water':'Make food and water for many.','Daylight':'A 60-ft sphere of bright daylight.','Dispel Magic':'End spells on a creature, object, or area.','Fear':'Creatures in a 30-ft cone flee (Wis save).','Fireball':'20-ft sphere, Dex save, 8d6 fire.','Fly':'Grant a 60-ft flying speed.','Gaseous Form':'A creature becomes a misty cloud.','Haste':'+2 AC, double speed, and an extra action.','Hypnotic Pattern':'Charm/incapacitate with a pattern (Wis save).','Lightning Bolt':'100-ft line, Dex save, 8d6 lightning.','Magic Circle':'Cylinder that wards against creature types.','Major Image':'A detailed lasting illusion with sound/smell.','Mass Healing Word':'Bonus action; heal up to 6 creatures 1d4 + mod.','Meld into Stone':'Step into and hide within stone.','Nondetection':'Hide a target from divination and scrying.','Plant Growth':'Overgrow an area into difficult terrain.','Protection from Energy':'Resistance to one damage type (1 hr).','Remove Curse':'End all curses on a creature or item.','Revivify':'Revive a creature dead under a minute (1 HP).','Sending':'Send a 25-word message to anyone, anywhere.','Sleet Storm':'Freezing rain — difficult terrain, heavily obscured, Dex save or prone.','Slow':'Up to 6 creatures get halved speed/actions.','Speak with Dead':'Ask a corpse five questions.','Spirit Guardians':'Spirits in 15 ft of you; Wis save, 3d8 radiant, halves foes\' speed.','Stinking Cloud':'Nauseating gas makes foes lose actions.','Tongues':'Understand and be understood in any language.','Vampiric Touch':'Melee spell attack, 3d6 necrotic; you recover half the damage dealt.','Water Breathing':'Up to 10 creatures breathe underwater.','Water Walk':'Up to 10 creatures walk on liquids.','Wind Wall':'A wall of wind deflects and damages.',
'Arcane Eye':'An invisible flying eye you see through.','Banishment':'Banish a creature to another plane (Cha save).','Blight':'8d8 necrotic to a creature (Con save).','Compulsion':'10-ft cube; Wis save or a creature is Charmed and compelled to move as you direct.','Confusion':'Creatures behave randomly each turn (Wis save).','Conjure Woodland Beings':'Summon fey to aid you.','Control Water':'Raise, part, or redirect water.','Death Ward':'First drop to 0 HP, the target stays at 1.','Dimension Door':'Teleport yourself (and one) up to 500 ft.','Divination':'A short answer about an event this week.','Dominate Beast':'Control a beast (Wis save); it repeats the save each time it takes damage.','Fabricate':'Convert raw materials into finished objects.','Find Greater Steed':'Summon a mightier bonded spirit steed (Griffon/Pegasus/Peryton/Dire Wolf/Rhinoceros/Saber-Toothed Tiger) and mount it.','Freedom of Movement':'Ignore difficult terrain and restraints.','Greater Invisibility':'Invisible even while attacking.','Guardian of Faith':'A spectral guardian deals 20 radiant.','Ice Storm':'Dex save; 2d8 bludgeoning + 4d6 cold; difficult terrain.','Locate Creature':'Sense direction to a known creature.','Phantasmal Killer':'A nightmare deals 4d10 psychic (Wis save).','Polymorph':'Wis save (unwilling). Turn a creature into a beast of CR ≤ its level; reverts at 0 HP, excess damage carries over.','Stone Shape':'Reshape a stone object.','Stoneskin':'Resistance to nonmagical physical damage.','Wall of Fire':'A wall of flame; Dex save, 5d8 fire.',
'Animate Objects':'Animate up to 10 objects to fight.','Awaken':'Give a beast or plant sentience and speech.','Cloudkill':'A 20-ft poison fog; Con save, 5d8 poison; it drifts each round.','Commune':'Ask your deity three yes/no questions.','Commune with Nature':'Learn facts about the surrounding land.','Cone of Cold':'60-ft cone, Con save, 8d8 cold.','Conjure Elemental':'Summon an elemental to serve you.','Contact Other Plane':'Ask an entity five questions (risky).','Dispel Evil and Good':'Protect against and dismiss outsiders.','Dominate Person':'Control a humanoid (Wis save); it repeats the save each time it takes damage.','Dream':'Shape a sleeping creature\'s dreams.','Flame Strike':'A column of holy fire; Dex save, 4d6 fire + 4d6 radiant.','Geas':'Compel a creature to obey for 30 days.','Greater Restoration':'End exhaustion, charm, petrify, curse, or reductions.','Hallow':'Imbue an area with protective effects.','Hold Monster':'Paralyze any creature (Wis save each turn).','Insect Plague':'A 20-ft swarm; Con save, 4d10 piercing; obscures the area.','Legend Lore':'Recall lore about a famous person/place/thing.','Mass Cure Wounds':'Heal up to 6 creatures 3d8 + mod.','Mislead':'Become invisible and control a double.','Modify Memory':'Reshape a creature\'s memory of an event.','Planar Binding':'Bind a summoned outsider into service.','Raise Dead':'Revive a creature dead up to 10 days.','Reincarnate':'Bring back the dead in a new body/race.','Scrying':'See and hear a specific creature anywhere.','Seeming':'Disguise the appearance of many creatures.','Telekinesis':'Range 60 ft (12 tiles). Creature: your spell-ability check vs its Strength — win to move it 30 ft (restrained). Object ≤1000 lb: move 30 ft/round.','Teleportation Circle':'Open a portal to a known circle.','Tree Stride':'Step between trees of the same kind.','Wall of Force':'An invisible, nearly indestructible wall.','Wall of Stone':'Conjure a wall of stone.',
'Chain Lightning':'Arcs to up to 4 targets; Dex save, 10d8 lightning.','Circle of Death':'A 60-ft sphere; Con save, 8d6 necrotic.','Disintegrate':'10d6+40 force; dust if it drops the target.','Eyebite':'Wis save or (your choice) a foe sleeps, is frightened, or takes 3d6 psychic and is poisoned.','Find the Path':'Know the shortest route to a known place.','Globe of Invulnerability':'Block spells of 5th level and lower.','Harm':'Con save; 14d6 necrotic and lowers the target\'s HP max.','Heal':'Restore 70 HP and end blind/deaf/disease.','Heroes\' Feast':'A feast grants HP, immunities, advantage (1 day).','Mass Suggestion':'Up to 12 creatures; Wis save or Charmed and act on your suggestion for 24 hours.','Sunbeam':'A 60-ft line; Con save, 6d8 radiant, blinds.','True Seeing':'See in dark, through illusions, into Ethereal.','Wall of Ice':'A wall of ice that damages those breaking through.','Word of Recall':'Teleport instantly to a chosen sanctuary.',
'Conjure Celestial':'Summon a celestial to aid you.','Delayed Blast Fireball':'Dex save, 12d6 fire; grows each round the blast is delayed.','Etherealness':'Step into the Border Ethereal Plane.','Finger of Death':'Con save; 7d8+30 necrotic; the slain rise as zombies.','Fire Storm':'Sheets of flame; Dex save, 7d10 fire.','Forcecage':'Cha save or a creature is trapped, Restrained, in an inescapable force cage.','Plane Shift':'Travel to another plane of existence.','Prismatic Spray':'Eight rays of varied damage/effects.','Regenerate':'Restore 4d8+15 HP instantly; regrow lost limbs over 2 minutes.','Resurrection':'Revive a creature dead up to a century.','Reverse Gravity':'50-ft cylinder; Dex save or fall upward, 4d6 bludgeoning when gravity resumes.','Teleport':'Instantly travel a great distance (some risk).',
'Animal Shapes':'Turn willing creatures into beasts.','Antimagic Field':'A 10-ft sphere suppresses magic.','Dominate Monster':'Control any creature (Wis save); it repeats the save each time it takes damage.','Earthquake':'Shake the ground — fissures, knockdowns.','Feeblemind':'Int save; 4d6 psychic and crushes Int & Cha to 1.','Holy Aura':'Allies get save advantage; foes may be blinded.','Maze':'Banish a creature into a labyrinth demiplane.','Mind Blank':'Immunity to psychic and mind-reading/charm.','Power Word Stun':'Stun a creature with 150 HP or fewer.','Sunburst':'A burst of sunlight; Con save, 12d6 radiant, blinds.',
'Astral Projection':'Project yourself and others to the Astral Plane.','Foresight':'Advantage on everything; can\'t be surprised.','Gate':'Open a portal to another plane.','Mass Heal':'Distribute 700 HP of healing.','Meteor Swarm':'Meteors fall; Dex save, 20d6 fire + 20d6 bludgeoning.','Power Word Kill':'Slay a creature with 100 HP or fewer.','Time Stop':'Take several turns while time is frozen.','True Resurrection':'Revive the long-dead, fully restored.','Wish':'Duplicate any spell of 8th level or lower safely. Any greater wish: DM adjudicates, and there\'s a 33% chance you can never cast Wish again.','Storm of Vengeance':'A vast storm rains damage and effects.'
};

const SPELL_AOE={'Fireball':4,'Cloudkill':4,'Shatter':2,'Thunderwave':1,'Burning Hands':1,'Cone of Cold':4,'Lightning Bolt':2,'Sleep':4,'Stinking Cloud':4,'Hypnotic Pattern':3,'Ice Storm':4,'Spirit Guardians':3,'Sunburst':12,'Circle of Death':12,'Insect Plague':4,'Flame Strike':2,'Sleet Storm':8,'Web':2,'Faerie Fire':2,'Spike Growth':4,'Moonbeam':1,'Entangle':2,'Grease':1,'Meteor Swarm':8,'Color Spray':1,'Fear':2,'Sunbeam':1,
  // Gust of Wind: 60-ft line (aim a tile; path from caster snuffs torches) — aoeR is preview width only
  'Gust of Wind':1,
  // Walls — approximated as a small filled zone, not a drawn line/panel (see WALL_SPELLS)
  'Wall of Force':2,'Wall of Ice':2,'Wall of Stone':2,'Wind Wall':2,
  'Reverse Gravity':10,
  // No-cast zones (see SPELL_NOCAST_ZONE/paintNoCastZone)
  'Silence':4,'Antimagic Field':2,
  'Calm Emotions':4,'Compulsion':2,'Mass Suggestion':4};
// Line length for gust / similar (tiles). width = half-width in tiles (~10 ft ≈ 1–2 tiles).

const SPELL_LINE={'Gust of Wind':{tiles:12, width:1}};
// PHB cast range in feet ('Touch' where RAW says Touch); Self-centered cone/line/radius spells
// (Burning Hands, Thunderwave, Fear, Cone of Cold, Lightning Bolt, Spirit Guardians, Sunbeam,
// Sunburst, Prismatic Spray) use their blast reach as a practical target-picking proxy, since
// parseSpellMechanics has nothing else to gate "how far can I place this" by. This exists
// because parseSpellMechanics's regex only found a range when SPELL_DESC's one-liner happened
// to literally say "within N ft" — true for almost none of them (e.g. Fire Bolt: "Ranged fire
// mote, 1d10 fire" never states 120 ft), so every attack/save/AoE spell silently fell back to
// a wrong flat 60-ft default. Checked first in parseSpellMechanics; the description-regex stays
// as a fallback for anything not listed here.

const SPELL_RANGE={
  'Acid Splash':60,'Chill Touch':120,'Eldritch Blast':120,'Fire Bolt':120,'Poison Spray':10,'Produce Flame':30,'Ray of Frost':60,'Sacred Flame':60,'Shillelagh':'Touch','Shocking Grasp':'Touch','Thorn Whip':30,'Vicious Mockery':60,
  'Absorb Elements':'Self','Animal Friendship':30,'Bane':30,'Burning Hands':15,'Charm Person':30,'Color Spray':15,'Command':60,'Entangle':90,'Faerie Fire':60,'Grease':60,'Guiding Bolt':120,'Hellish Rebuke':60,'Hex':90,"Hunter's Mark":90,'Inflict Wounds':'Touch','Magic Missile':120,'Ray of Sickness':60,'Sleep':90,"Tasha's Hideous Laughter":30,'Thunderwave':15,'Witch Bolt':30,
  'Blindness/Deafness':30,'Cloud of Daggers':60,'Crown of Madness':120,'Flaming Sphere':60,'Heat Metal':60,'Hold Person':60,'Moonbeam':120,'Ray of Enfeeblement':60,'Scorching Ray':120,'Shatter':60,'Spike Growth':150,'Spiritual Weapon':60,'Suggestion':30,'Web':60,'Zone of Truth':60,
  'Bestow Curse':'Touch','Call Lightning':120,'Fear':30,'Fireball':150,'Gust of Wind':60,'Hypnotic Pattern':120,'Lightning Bolt':100,'Sleet Storm':150,'Slow':120,'Spirit Guardians':15,'Stinking Cloud':90,'Vampiric Touch':'Touch',
  'Banishment':60,'Blight':30,'Confusion':90,'Dominate Beast':60,'Ice Storm':300,'Phantasmal Killer':120,'Polymorph':60,'Wall of Fire':120,
  'Wall of Force':120,'Wall of Ice':120,'Wall of Stone':120,'Wind Wall':120,'Telekinesis':60,'Reverse Gravity':100,'Forcecage':100,'Silence':60,'Antimagic Field':10,'Counterspell':60,'Dispel Magic':120,'Calm Emotions':60,'Compulsion':30,'Mass Suggestion':60,
  'Cloudkill':120,'Cone of Cold':60,'Dominate Person':60,'Flame Strike':60,'Hold Monster':90,'Insect Plague':300,
  'Chain Lightning':150,'Circle of Death':60,'Disintegrate':60,'Eyebite':60,'Harm':60,'Sunbeam':60,
  'Delayed Blast Fireball':150,'Finger of Death':60,'Fire Storm':150,'Prismatic Spray':60,
  'Dominate Monster':60,'Feeblemind':150,'Power Word Stun':60,'Sunburst':60,
  'Meteor Swarm':500
};

// Damage type for spells whose SPELL_DESC prose doesn't state it in a form parseSpellMechanics
// can pick up. Same escape hatch as SPELL_RANGE above, and for the same reason: the parser reads
// the type from a "<dice> <type>" phrase, so a spell that mentions its type anywhere else (or
// not at all) silently ends up with dtype:'' — and an empty type means monsterDmgMult() can
// never apply resistance, vulnerability or immunity to it. Found 2026-07-29 by parsing all 257
// spells and flagging any with damage but no type. Sacred Flame says "Radiant flame" up front,
// never "1d8 radiant"; the other two never name their type at all.
// NOT listed here, deliberately: Absorb Elements, whose rider type mirrors whatever triggered it.


// Legendary & lair actions (v120.247). Boss monsters were the last real combat gap: the only
// trace in the app was a prose note on the Beholder telling the DM to adjudicate it by hand.
//
// PHB/MM model, kept faithful where it matters:
//   * Legendary actions are spent at the END of another creature's turn, never on the boss's own
//     turn, and the pool refreshes at the START of the boss's turn. `perRound` is the budget;
//     each action has a `cost` (usually 1, sometimes 2).
//   * Lair actions happen on initiative count 20, losing initiative ties, once per round -- so
//     they are a ROUND-level event, not tied to any creature's turn.
// Keyed by monster name, like MONSTER_MECH is keyed by attack string; homebrew simply has none.
const LEGENDARY={
  'Young Red Dragon':{perRound:3, actions:[
    {name:'Detect', cost:1, desc:'Wisdom (Perception) check.'},
    {name:'Tail Attack', cost:1, atk:{name:'Tail', hit:10, dmg:'2d8+6', dtype:'bludgeoning', tiles:3}},
    {name:'Wing Attack', cost:2, dc:{n:19,ab:'Dex'}, dmg:'2d6+6', dtype:'bludgeoning',
     desc:'Each creature within 10 ft: DC 19 Dex save or take damage and be knocked prone.', cond:'Prone'}
  ]},
  'Beholder':{perRound:3, actions:[
    {name:'Eye Ray', cost:1, desc:'Use one random eye ray at a creature it can see.'}
  ]},
  'Wraith':{perRound:1, actions:[
    {name:'Life Drain', cost:1, atk:{name:'Life Drain', hit:6, dmg:'4d8+3', dtype:'necrotic', tiles:1}}
  ]}
};
// Lair actions fire on initiative 20 each round while the boss is in its lair.
const LAIR={
  'Young Red Dragon':[
    {name:'Magma Erupts', desc:'Magma erupts from a point on the ground within 120 ft: DC 15 Dex save or 6d6 fire.', dc:{n:15,ab:'Dex'}, dmg:'6d6', dtype:'fire'},
    {name:'Tremor', desc:'A tremor shakes the lair: DC 15 Dex save or fall prone.', dc:{n:15,ab:'Dex'}, cond:'Prone'}
  ],
  'Beholder':[
    {name:'Slippery Walls', desc:'Walls become slick; climbing them requires a DC 15 Athletics check.'},
    {name:'Blinding Eye', desc:'An eye opens in a wall: one creature must make a DC 15 Con save or be blinded until initiative 20 next round.', dc:{n:15,ab:'Con'}, cond:'Blinded'}
  ]
};

// Structured monster attacks — authoritative for the BUILT-IN bestiary (v120.243).
//
// Same Pillar-1 move as SPELL_MECH, with one deliberate difference: the prose parser is NOT being
// retired here, because homebrew monsters and NPCs let the user type an `atk` string by hand
// (#hbAtk / #npcAtk). For those, parsing English is the intended feature. So this table is keyed
// by the exact `atk` STRING: a built-in bestiary entry matches and uses structured data, while any
// user-typed string simply doesn't match and falls through to the parser. No signature change, no
// call-site churn, and homebrew keeps working by construction.
//
// Generated from the parser's own output so behaviour was identical on introduction, except one
// correction: the Wyvern's Stinger was coming out as a 120 ft RANGED attack because the range
// heuristic matched the word "stinger". RAW it is a 10 ft reach melee attack (tiles:2). The
// heuristic itself was fixed too, so homebrew benefits.
//
// If a bestiary `atk` string is ever edited, its key stops matching and that monster silently
// falls back to prose parsing — same behaviour as before this table existed, so the failure mode
// is safe. A ratchet test asserts every MONSTERS_5E entry still has a matching key.
const MONSTER_MECH={
  'Scimitar +4 (1d6+2) · Shortbow +4 (1d6+2)':[{name:'Scimitar',hit:4,dmg:'1d6+2',dtype:'slashing',tiles:1},{name:'Shortbow',hit:4,dmg:'1d6+2',dtype:'piercing',tiles:24}],
  'Longsword +3 (1d8+1)':[{name:'Longsword',hit:3,dmg:'1d8+1',dtype:'slashing',tiles:1}],
  'Morningstar +4 (2d8+2)':[{name:'Morningstar',hit:4,dmg:'2d8+2',dtype:'piercing',tiles:1}],
  'Dagger +4 (1d4+2)':[{name:'Dagger',hit:4,dmg:'1d4+2',dtype:'piercing',tiles:1}],
  'Greataxe +5 (1d12+3)':[{name:'Greataxe',hit:5,dmg:'1d12+3',dtype:'slashing',tiles:1}],
  'Scimitar +3 (1d6+1) · Crossbow +3 (1d8+1)':[{name:'Scimitar',hit:3,dmg:'1d6+1',dtype:'slashing',tiles:1},{name:'Crossbow',hit:3,dmg:'1d8+1',dtype:'piercing',tiles:24}],
  'Spear +3 (1d6+1)':[{name:'Spear',hit:3,dmg:'1d6+1',dtype:'piercing',tiles:1}],
  'Scimitar +3 (1d6+1)':[{name:'Scimitar',hit:3,dmg:'1d6+1',dtype:'slashing',tiles:1}],
  'Fireball (DC 14 Dex, 8d6) · Magic Missile (3d4+3, auto-hit) · Dagger +5 (1d4+2)':[{name:'Fireball',dc:{n:14,ab:'Dex'},dmg:'8d6',dtype:'fire',tiles:1},{name:'Magic Missile',hit:3,dmg:'3d4+3',dtype:'force',tiles:1},{name:'Dagger',hit:5,dmg:'1d4+2',dtype:'piercing',tiles:1}],
  'Shortsword +4 (1d6+2) · Shortbow +4 (1d6+2)':[{name:'Shortsword',hit:4,dmg:'1d6+2',dtype:'piercing',tiles:1},{name:'Shortbow',hit:4,dmg:'1d6+2',dtype:'piercing',tiles:24}],
  'Slam +3 (1d6+1)':[{name:'Slam',hit:3,dmg:'1d6+1',dtype:'bludgeoning',tiles:1}],
  'Claws +4 (2d4+2, DC 10 Con or paralyzed) · Bite +2 (2d6+2)':[{name:'Claws',hit:4,dc:{n:10,ab:'Con'},dmg:'2d4+2',dtype:'slashing',tiles:1,cond:'Paralyzed'},{name:'Bite',hit:2,dmg:'2d6+2',dtype:'piercing',tiles:1}],
  'Life Drain +4 (3d6, lowers max HP)':[{name:'Life Drain',hit:4,dmg:'3d6',dtype:'necrotic',tiles:1}],
  'Withering Touch +5 (4d6+3) · Horrifying Visage (DC 13 Wis, frightened)':[{name:'Withering Touch',hit:5,dmg:'4d6+3',dtype:'necrotic',tiles:1},{name:'Horrifying Visage',dc:{n:13,ab:'Wis'},tiles:1,cond:'Frightened'}],
  'Life Drain +6 (4d8+3)':[{name:'Life Drain',hit:6,dmg:'4d8+3',dtype:'necrotic',tiles:1}],
  'Bite +4 (2d4+2, knock prone)':[{name:'Bite',hit:4,dmg:'2d4+2',dtype:'piercing',tiles:1,cond:'Prone'}],
  'Bite +5 (2d6+3, knock prone)':[{name:'Bite',hit:5,dmg:'2d6+3',dtype:'piercing',tiles:1,cond:'Prone'}],
  'Bite +6 (1d8+4) · Claws +6 (2d6+4)':[{name:'Bite',hit:6,dmg:'1d8+4',dtype:'piercing',tiles:1},{name:'Claws',hit:6,dmg:'2d6+4',dtype:'slashing',tiles:1}],
  'Bite +5 (1d8+3 + DC11 Con 2d8 poison) · Web (DC 11 Str, restrained)':[{name:'Bite',hit:5,dc:{n:11,ab:'Con'},dmg:'1d8+3',dtype:'poison',tiles:1},{name:'Web',dc:{n:11,ab:'Str'},tiles:24,cond:'Restrained'}],
  'Bite +4 (1d6+2) · Constrict +4 (1d8+2, grappled)':[{name:'Bite',hit:4,dmg:'1d6+2',dtype:'piercing',tiles:1},{name:'Constrict',hit:4,dmg:'1d8+2',dtype:'bludgeoning',tiles:1,cond:'Grappled'}],
  'Bite +5 (1 + DC10 Con 2d4 poison)':[{name:'Bite',hit:5,dc:{n:10,ab:'Con'},dmg:'2d4',dtype:'poison',tiles:1}],
  'Greatclub +6 (2d8+4)':[{name:'Greatclub',hit:6,dmg:'2d8+4',dtype:'bludgeoning',tiles:1}],
  'Claw +7 (2d6+4) · Bite +7 (1d6+4)':[{name:'Claw',hit:7,dmg:'2d6+4',dtype:'slashing',tiles:1},{name:'Bite',hit:7,dmg:'1d6+4',dtype:'piercing',tiles:1}],
  'Greatclub +8 (3d8+5) · Rock +8 (3d10+5)':[{name:'Greatclub',hit:8,dmg:'3d8+5',dtype:'bludgeoning',tiles:1},{name:'Rock',hit:8,dmg:'3d10+5',dtype:'bludgeoning',tiles:1}],
  'Pseudopod +3 (2d6+1 acid, corrodes metal)':[{name:'Pseudopod',hit:3,dmg:'2d6+1',dtype:'acid',tiles:1}],
  'Pseudopod +4 (3d6 acid) · Engulf (DC 12 Dex)':[{name:'Pseudopod',hit:4,dmg:'3d6',dtype:'acid',tiles:1},{name:'Engulf',dc:{n:12,ab:'Dex'},tiles:1}],
  'Sting +5 (1d4+3 + DC11 Con 3d6 poison)':[{name:'Sting',hit:5,dc:{n:11,ab:'Con'},dmg:'1d4+3',dtype:'poison',tiles:1}],
  'Claws +4 (1d4+2 + DC10 Con poison)':[{name:'Claws',hit:4,dc:{n:10,ab:'Con'},dmg:'1d4+2',dtype:'poison',tiles:1}],
  'Bite +2 (1d6) · Claws +2 (2d4)':[{name:'Bite',hit:2,dmg:'1d6',dtype:'piercing',tiles:1},{name:'Claws',hit:2,dmg:'2d4',dtype:'slashing',tiles:1}],
  'Spear +4 (1d6+2) · Bite +4 (1d6+2)':[{name:'Spear',hit:4,dmg:'1d6+2',dtype:'piercing',tiles:1},{name:'Bite',hit:4,dmg:'1d6+2',dtype:'piercing',tiles:1}],
  'Bite +7 (2d6+4) · Stinger +7 (2d6+4 + DC15 Con 7d6 poison)':[{name:'Bite',hit:7,dmg:'2d6+4',dtype:'piercing',tiles:1},{name:'Stinger',hit:7,dc:{n:15,ab:'Con'},dmg:'2d6+4',dtype:'poison',tiles:2}],
  'Bite +6 (1d10+4 + 1d6 fire) · Fire Breath (DC13 Dex, 7d6)':[{name:'Bite',hit:6,dmg:'1d10+4',dtype:'fire',tiles:1},{name:'Fire Breath',dc:{n:13,ab:'Dex'},dmg:'7d6',dtype:'fire',tiles:6}],
  'Bite +10 (2d10+6 + 1d6 fire) · Claw +10 (2d6+6) · Fire Breath (DC17 Dex, 16d6)':[{name:'Bite',hit:10,dmg:'2d10+6',dtype:'fire',tiles:1},{name:'Claw',hit:10,dmg:'2d6+6',dtype:'slashing',tiles:1},{name:'Fire Breath',dc:{n:17,ab:'Dex'},dmg:'16d6',dtype:'fire',tiles:6}],
  'Eye Rays +5 (1d6) · Bite +1 (1)':[{name:'Eye Rays',hit:5,dmg:'1d6',tiles:24},{name:'Bite',hit:1,dtype:'piercing',tiles:1}],
  'Eye Rays +9 (3 of 10, ~4d8 each) · Bite +5 (4d6)':[{name:'Eye Rays',hit:9,dmg:'4d8',tiles:24},{name:'Bite',hit:5,dmg:'4d6',dtype:'piercing',tiles:1}]
};

// Damage types for monster attacks whose bestiary `atk` prose never states one. Only 11 of 56
// parsed attacks carried a type before v120.239 (20%): a Goblin's scimitar wasn't slashing, an
// Orc's greataxe wasn't slashing, and a Mage's Fireball wasn't fire — so a target's resistance,
// vulnerability or immunity could never apply to almost any monster hit, and Absorb Elements
// could not tell the damage was elemental.
//
// Manufactured weapons are NOT listed here on purpose — parseMonsterAttacks looks the attack name
// up in the WEAPONS catalog first, which already carries `dt` for Scimitar, Greataxe, Longsword,
// Dagger, Spear, Shortbow and the rest. This table is only what a weapon catalog can't know:
// natural weapons and the handful of spell-shaped attacks.
//
// 'Eye Rays' is deliberately ABSENT: a beholder's rays are each a different type, so any single
// answer here would be wrong more often than the empty string is. It stays untyped until the
// bestiary can express per-ray data.
const MONSTER_ATK_DTYPE={
  'Bite':'piercing', 'Claw':'slashing', 'Claws':'slashing', 'Slam':'bludgeoning',
  'Constrict':'bludgeoning', 'Rock':'bludgeoning', 'Greatclub':'bludgeoning',
  'Gore':'piercing', 'Sting':'piercing', 'Tentacle':'bludgeoning', 'Hooves':'bludgeoning',
  'Tail':'bludgeoning', 'Pseudopod':'bludgeoning', 'Talons':'slashing',
  'Life Drain':'necrotic', 'Withering Touch':'necrotic',
  'Crossbow':'piercing',                 // plain "Crossbow"; WEAPONS only lists Hand/Light/Heavy
  'Morningstar':'piercing',              // PHB morningstar is piercing; absent from WEAPONS entirely
  'Fireball':'fire', 'Magic Missile':'force'
};


// Structured spell mechanics — the authoritative source, ahead of the prose (v120.242).
//
// WHY: parseSpellMechanics regex-mines SPELL_DESC, plain English written for players to read, for
// save ability, damage dice, damage type, heal dice and whether there's an attack roll. That made
// the prose load-bearing: rewording a description silently changed the game. It has misfired
// repeatedly and expensively — 87 spells (including Fireball) once shared one wrong range, three
// dealt untyped damage so no resistance applied, and Guidance/Resistance/Shillelagh had their
// "add 1d4 to a roll" / weapon die counted as damage the spell deals.
//
// This table wins whenever a spell appears in it; the prose parser remains only as the fallback
// for anything not yet listed. Editing a description can no longer change mechanics for a listed
// spell — which is the whole point.
//
// Only 89 of 257 spells need an entry: the rest are narrative and carry no parsed mechanics.
// Generated from the parser's own output so behaviour was IDENTICAL on introduction, then
// corrected for the three known-bad entries above (they now carry no damage, because they never
// dealt any). Range/concentration/duration are NOT here — SPELL_RANGE, CONC_SPELLS and
// SPELL_EFFECTS already own those.
//
// attack:1 = there's an attack roll. Omitted keys mean "this spell has none of that".
const SPELL_MECH={
  // Explicitly listed with NO mechanics. These must be present, not absent: an absent spell
  // falls through to the prose parser, which reads their "add 1d4 to a roll" / weapon die as
  // damage the spell deals. Listing them empty is what actually suppresses that.
  'Guidance':{}, 'Resistance':{}, 'Shillelagh':{},
  'Absorb Elements':{attack:1,dmg:'1d6'},
  'Acid Splash':{save:'dex',dmg:'1d6',dtype:'acid'},
  'Animal Friendship':{save:'wis'},
  'Banishment':{save:'cha'},
  'Blight':{save:'con',dmg:'8d8',dtype:'necrotic'},
  'Blindness/Deafness':{save:'con'},
  'Burning Hands':{save:'dex',dmg:'3d6',dtype:'fire'},
  'Call Lightning':{save:'dex',dmg:'3d10',dtype:'lightning'},
  'Calm Emotions':{save:'cha'},
  'Chain Lightning':{save:'dex',dmg:'10d8',dtype:'lightning'},
  'Charm Person':{save:'wis'},
  'Chill Touch':{attack:1,dmg:'1d8',dtype:'necrotic'},
  'Circle of Death':{save:'con',dmg:'8d6',dtype:'necrotic'},
  'Cloud of Daggers':{dmg:'4d4',dtype:'slashing'},
  'Cloudkill':{save:'con',dmg:'5d8',dtype:'poison'},
  'Command':{save:'wis'},
  'Compulsion':{save:'wis'},
  'Cone of Cold':{save:'con',dmg:'8d8',dtype:'cold'},
  'Confusion':{save:'wis'},
  'Cure Wounds':{heal:'1d8'},
  'Delayed Blast Fireball':{save:'dex',dmg:'12d6',dtype:'fire'},
  'Disintegrate':{dmg:'10d6+40',dtype:'force'},
  'Dominate Beast':{save:'wis'},
  'Dominate Monster':{save:'wis'},
  'Dominate Person':{save:'wis'},
  'Eldritch Blast':{attack:1,dmg:'1d10',dtype:'force'},
  'Entangle':{save:'str'},
  'Eyebite':{save:'wis',dmg:'3d6',dtype:'psychic'},
  'Faerie Fire':{save:'dex'},
  'Fear':{save:'wis'},
  'Feeblemind':{save:'int',dmg:'4d6',dtype:'psychic'},
  'Finger of Death':{save:'con',dmg:'7d8+30',dtype:'necrotic'},
  'Fire Bolt':{attack:1,dmg:'1d10',dtype:'fire'},
  'Fire Storm':{save:'dex',dmg:'7d10',dtype:'fire'},
  'Fireball':{save:'dex',dmg:'8d6',dtype:'fire'},
  'Flame Strike':{save:'dex',dmg:'4d6+4d6',dtype:'fire'},
  'Flaming Sphere':{dmg:'2d6',dtype:'fire'},
  'Forcecage':{save:'cha'},
  'Grease':{save:'dex'},
  'Guiding Bolt':{attack:1,dmg:'4d6',dtype:'radiant'},
  'Harm':{save:'con',dmg:'14d6',dtype:'necrotic'},
  'Heal':{heal:'70'},
  'Healing Word':{heal:'1d4'},
  'Heat Metal':{dmg:'2d8',dtype:'fire'},
  'Hellish Rebuke':{save:'dex',dmg:'2d10',dtype:'fire'},
  'Hold Monster':{save:'wis'},
  'Hold Person':{save:'wis'},
  'Hypnotic Pattern':{save:'wis'},
  'Ice Storm':{save:'dex',dmg:'2d8+4d6',dtype:'bludgeoning'},
  'Inflict Wounds':{attack:1,dmg:'3d10',dtype:'necrotic'},
  'Insect Plague':{save:'con',dmg:'4d10',dtype:'piercing'},
  'Lightning Bolt':{save:'dex',dmg:'8d6',dtype:'lightning'},
  'Magic Missile':{dmg:'3d4+3',dtype:'force'},
  'Mass Cure Wounds':{heal:'3d8'},
  'Mass Heal':{heal:'700'},
  'Mass Healing Word':{heal:'1d4'},
  'Mass Suggestion':{save:'wis'},
  'Meteor Swarm':{save:'dex',dmg:'20d6+20d6',dtype:'fire'},
  'Moonbeam':{save:'con',dmg:'2d10',dtype:'radiant'},
  'Phantasmal Killer':{save:'wis',dmg:'4d10',dtype:'psychic'},
  'Poison Spray':{save:'con',dmg:'1d12',dtype:'poison'},
  'Polymorph':{save:'wis'},
  'Prayer of Healing':{heal:'2d8'},
  'Prismatic Spray':{attack:1},
  'Produce Flame':{attack:1,dmg:'1d8',dtype:'fire'},
  'Ray of Frost':{attack:1,dmg:'1d8',dtype:'cold'},
  'Ray of Sickness':{save:'con',dmg:'2d8',dtype:'poison'},
  'Regenerate':{heal:'4d8+15'},
  'Reverse Gravity':{save:'dex',dmg:'4d6',dtype:'bludgeoning'},
  'Sacred Flame':{save:'dex',dmg:'1d8',dtype:'radiant'},
  'Scorching Ray':{attack:1,dmg:'2d6',dtype:'fire'},
  'Shatter':{save:'con',dmg:'3d8',dtype:'thunder'},
  'Shocking Grasp':{attack:1,dmg:'1d8',dtype:'lightning'},
  'Sleet Storm':{save:'dex'},
  'Spike Growth':{dmg:'2d4',dtype:'piercing'},
  'Spirit Guardians':{save:'wis',dmg:'3d8',dtype:'radiant'},
  'Spiritual Weapon':{attack:1,dmg:'1d8',dtype:'force'},
  'Suggestion':{save:'wis'},
  'Sunbeam':{save:'con',dmg:'6d8',dtype:'radiant'},
  'Sunburst':{save:'con',dmg:'12d6',dtype:'radiant'},
  'Tasha\'s Hideous Laughter':{save:'wis'},
  'Thorn Whip':{attack:1,dmg:'1d6',dtype:'piercing'},
  'Thunderwave':{save:'con',dmg:'2d8',dtype:'thunder'},
  'Vampiric Touch':{attack:1,dmg:'3d6',dtype:'necrotic'},
  'Vicious Mockery':{save:'wis',dmg:'1d4',dtype:'psychic'},
  'Wall of Fire':{save:'dex',dmg:'5d8',dtype:'fire'},
  'Web':{save:'dex'},
  'Witch Bolt':{attack:1,dmg:'1d12',dtype:'lightning'},
  'Zone of Truth':{save:'cha'}
};

const SPELL_DTYPE={
  'Sacred Flame':'radiant',        // PHB: radiant, Dex save, ignores cover
  'Spike Growth':'piercing',       // PHB: 2d4 piercing per 5 ft moved
  'Spiritual Weapon':'force'       // PHB: force — notably bypasses physical-resistant incorporeals
};
// Condition a spell imposes on its target(s) {c:label, r:rounds}.

const SPELL_COND={'Hold Person':{c:'Paralyzed',r:10},'Hold Monster':{c:'Paralyzed',r:10},'Hex':{c:'Hexed',r:600},"Hunter's Mark":{c:'Marked',r:600},'Faerie Fire':{c:'Faerie Fire',r:10},'Bane':{c:'Baned',r:10},'Slow':{c:'Slowed',r:10},'Sleep':{c:'Asleep',r:10},"Tasha's Hideous Laughter":{c:'Incapacitated (prone, laughing)',r:10},'Hypnotic Pattern':{c:'Charmed',r:10},'Banishment':{c:'Banished',r:10},'Stinking Cloud':{c:'Retching',r:10},'Web':{c:'Restrained',r:10},'Entangle':{c:'Restrained',r:10},'Command':{c:'Commanded',r:1},'Blindness/Deafness':{c:'Blinded',r:10},'Ray of Enfeeblement':{c:'Enfeebled',r:10},'Bestow Curse':{c:'Cursed',r:10},'Crown of Madness':{c:'Charmed',r:10},'Dominate Beast':{c:'Dominated',r:10},'Dominate Person':{c:'Dominated',r:10},'Dominate Monster':{c:'Dominated',r:10},'Fear':{c:'Frightened',r:10},'Confusion':{c:'Confused',r:10},'Color Spray':{c:'Blinded',r:1},'Ray of Sickness':{c:'Poisoned',r:1},'Contagion':{c:'Poisoned',r:70},'Heat Metal':{c:'(drop or take dmg)',r:10},'Grease':{c:'Prone',r:1},'Charm Person':{c:'Charmed',r:600},'Animal Friendship':{c:'Charmed',r:14400},'Fear':{c:'Frightened',r:10},'Sleet Storm':{c:'Prone',r:1},'Sunbeam':{c:'Blinded',r:10},'Shocking Grasp':{c:'No Reactions',r:1},'Chill Touch':{c:"Can't Heal",r:1},'Guiding Bolt':{c:'Guided',r:1},'Power Word Stun':{c:'Stunned',r:10},'Forcecage':{c:'Restrained',r:6000},
'Calm Emotions':{c:'Charmed',r:10},'Compulsion':{c:'Charmed',r:10},'Mass Suggestion':{c:'Charmed',r:14400}};
// Dominate Person/Beast/Monster: a Dominated monster fights for the party — the Quick
// Battle brain retargets its former allies, and the DM attack modal offers monsters
// instead of players. (Simplification: no repeat save on damage; ends when rounds expire.)

const INCAP_CONDS=['Paralyzed','Stunned','Unconscious','Petrified','Asleep','Banished'];

const BONUS_ACTION_SPELLS=new Set(['Healing Word','Mass Healing Word','Misty Step','Spiritual Weapon','Hex',"Hunter's Mark",'Shield of Faith','Sanctuary','Healing Spirit','Searing Smite','Wrathful Smite','Thunderous Smite','Branding Smite','Ensnaring Strike','Hail of Thorns','Zephyr Strike','Compelled Duel','Flame Blade','Magic Stone',"Hunter’s Mark",'Expeditious Retreat','Shillelagh','Divine Favor','Magic Weapon']);
// Spells cast as a reaction (PHB): Shield & Hellish Rebuke (when hit), Counterspell (when a
// creature casts within 60 ft), Feather Fall (when falling), Absorb Elements (when taking damage).

const REACTION_SPELLS=new Set(['Shield','Hellish Rebuke','Counterspell','Feather Fall','Absorb Elements']);

const SLOTS_FULL=[[],[2],[3],[4,2],[4,3],[4,3,2],[4,3,3],[4,3,3,1],[4,3,3,2],[4,3,3,3,1],[4,3,3,3,2],[4,3,3,3,2,1],[4,3,3,3,2,1],[4,3,3,3,2,1,1],[4,3,3,3,2,1,1],[4,3,3,3,2,1,1,1],[4,3,3,3,2,1,1,1],[4,3,3,3,2,1,1,1,1],[4,3,3,3,3,1,1,1,1],[4,3,3,3,3,2,1,1,1],[4,3,3,3,3,2,2,1,1]];

const SLOTS_HALF=[[],[],[2],[3],[3],[4,2],[4,2],[4,3],[4,3],[4,3,2],[4,3,2],[4,3,3],[4,3,3],[4,3,3,1],[4,3,3,1],[4,3,3,2],[4,3,3,2],[4,3,3,3,1],[4,3,3,3,1],[4,3,3,3,2],[4,3,3,3,2]];

const SLOTS_ARTI=[[],[2],[2],[3],[3],[4,2],[4,2],[4,3],[4,3],[4,3,2],[4,3,2],[4,3,3],[4,3,3],[4,3,3,1],[4,3,3,1],[4,3,3,2],[4,3,3,2],[4,3,3,3,1],[4,3,3,3,1],[4,3,3,3,2],[4,3,3,3,2]];

const CLASS_SKILLS_N = {Bard:3, Ranger:3, Rogue:4};

const MONSTER_PIX={
  skeleton:["...oooo.....","..oeeeeo....",".oeeeeeeo...",".oexeexeo...",".oeeeeeeo...",".oexxxxeo...","..oeeeeo....","...o..o.....","..o.oo.o....","............","............","............"],
  zombie:["...oooo.....","..onnnno....",".onxnnxno...",".onnnnnno...",".onneenno...",".onnnnnno...","..onnnno....",".on.nn.no...","..o.nn.o....","...o..o.....","............","............"],
  ghost:["...oooo.....","..oeeeeo....",".oeeeeeeo...",".oexeexeo...",".oeeeeeeo...",".oeeeeeeo...",".oeeeeeeo...",".oeoeoeoeo..","............","............","............","............"],
  wolf:["............","o.o.........","ododo..oooo.",".odddoodddo.","..oddddddddo","..oddddddddo","..oddddddddo","..o.o..o.o..","............","............","............","............"],
  bear:["............","..oo....oo..",".owwo..owwo.","..owwwwwwo..",".owwwwwwwwo.","owwwwwwwwwwo","owwwwwwwwwwo","owwwwwwwwwwo",".ow.ww.ww.o.","..o.....o...","............","............"],
  spider:["............","o..o..o..o..",".o.o..o.o...","..oxxxxxo...",".oxxxxxxxo..","..oxxxxxo...",".o.o..o.o...","o..o..o..o..","............","............","............","............"],
  snake:["............","..ooo.......",".onnno......",".onxno......",".onnno......","..onno......","...onno.....","....onno....","...onno.....","..onno......","..ooo.......","............"],
  dragon:["......oo....",".o...oddo...","oro..oddo...",".oroooddo...","..orddddo...","oodddddddoo.","oddddddddddo","oddddddddddo",".o.oddddo.o.","...o.oo.o...","............","............"],
  ogre:["...oooo.....","..okkkko....",".okxkkxko...",".okkkkkko...","..okkkko....","ookkkkkkoo..","okkkkkkkko..","okkkkkkkko..","o.okkkko.o..","...o..o.....","..o....o....","............"],
  slime:["............","............","...ogggo....","..ogggggo...",".oggxggxgo..","ogggggggggo.","ogggggggggo.","ogggggggggo.","ogggggggggo.",".oooooooooo.","............","............"],
  demon:["..o....o....","..oo..oo....","...orrro....","..orrrrro...","..orxrrxo...","..orrrrro...","..orrrrro...","...orrro....","..o.rr.o....",".o..rr..o...","o...oo...o..","............"],
  eye:["............","...oooo.....","..oeeeeo....",".oeeeeeeo...",".oeppppeo...",".oepxxpeo...",".oeppppeo...",".oeeeeeeo...","..oeeeeo....","...oooo.....","............","............"]
};

const SPRITE_DIR_ORDER=['down','left','right','up'];

const _s4={cols:4, rows:4, dirOrder:SPRITE_DIR_ORDER};
// ?v= busts SW cache-first on unit sheets (without it, old wizard sticks forever)

const _SV='v131';

const SPRITE_MANIFEST={
  fighter:{file:`sprites/hq/characters/fighter.png?${_SV}`, ..._s4},
  barbarian:{file:`sprites/hq/characters/barbarian.png?${_SV}`, ..._s4},
  paladin:{file:`sprites/hq/characters/paladin.png?${_SV}`, ..._s4},
  ranger:{file:`sprites/hq/characters/ranger.png?${_SV}`, ..._s4},
  rogue:{file:`sprites/hq/characters/rogue.png?${_SV}`, ..._s4},
  monk:{file:`sprites/hq/characters/monk.png?${_SV}`, ..._s4},
  bard:{file:`sprites/hq/characters/bard.png?${_SV}`, ..._s4},
  cleric:{file:`sprites/hq/characters/cleric.png?${_SV}`, ..._s4},
  druid:{file:`sprites/hq/characters/druid.png?${_SV}`, ..._s4},
  wizard:{file:`sprites/hq/characters/wizard.png?${_SV}`, ..._s4},
  sorcerer:{file:`sprites/hq/characters/sorcerer.png?${_SV}`, ..._s4},
  warlock:{file:`sprites/hq/characters/warlock.png?${_SV}`, ..._s4},
  artificer:{file:`sprites/hq/characters/artificer.png?${_SV}`, ..._s4},
  skeleton:{file:`sprites/hq/monsters/skeleton.png?${_SV}`, ..._s4},
  zombie:{file:`sprites/hq/monsters/zombie.png?${_SV}`, ..._s4},
  spider:{file:`sprites/hq/monsters/spider.png?${_SV}`, ..._s4},
  ogre:{file:`sprites/hq/monsters/ogre.png?${_SV}`, ..._s4},
  demon:{file:`sprites/hq/monsters/demon.png?${_SV}`, ..._s4},
  slime:{file:`sprites/hq/monsters/slime.png?${_SV}`, ..._s4},
  goblin:{file:`sprites/hq/monsters/goblin.png?${_SV}`, ..._s4},
  ghost:{file:`sprites/hq/monsters/ghost.png?${_SV}`, ..._s4},
  wolf:{file:`sprites/hq/monsters/wolf.png?${_SV}`, ..._s4},
  human:{file:`sprites/hq/characters/human.png?${_SV}`, ..._s4},
  orc:{file:`sprites/hq/monsters/orc.png?${_SV}`, ..._s4},
  bear:{file:`sprites/hq/monsters/bear.png?${_SV}`, ..._s4},
  snake:{file:`sprites/hq/monsters/snake.png?${_SV}`, ..._s4},
  bat:{file:`sprites/hq/monsters/bat.png?${_SV}`, ..._s4},
  rat:{file:`sprites/hq/monsters/rat.png?${_SV}`, ..._s4},
  harpy:{file:`sprites/hq/monsters/harpy.png?${_SV}`, ..._s4},
  imp:{file:`sprites/hq/monsters/imp.png?${_SV}`, ..._s4},
  specter:{file:`sprites/hq/monsters/specter.png?${_SV}`, ..._s4},
  mushroom:{file:`sprites/hq/monsters/mushroom.png?${_SV}`, ..._s4},
  dog:{file:'sprites/hq/monsters/dog.png', ..._s4},
  cat:{file:'sprites/hq/monsters/cat.png', ..._s4},
  dragon:{file:'sprites/hq/monsters/ogre.png', ..._s4},
  eye:{file:'sprites/hq/monsters/slime.png', ..._s4},
  lizardfolk:{file:'sprites/hq/monsters/goblin.png', ..._s4},
};

const SPRITE_ZOOM=1.375;
// Which screen direction a grid movement step reads as, matching whatever axis dominates
// visually — iso mode projects (dx,dy) diagonally, flat mode is a direct grid read.

const DECOR_MANIFEST={
  tree:{file:'sprites/hq/decor/tree.png?v122'},
  tree2:{file:'sprites/hq/decor/tree2.png?v122'},
  bush:{file:'sprites/hq/decor/bush.png?v122'},
  bush2:{file:'sprites/hq/decor/bush2.png?v122'},
  rock:{file:'sprites/hq/decor/rock.png?v122'},
  crystal:{file:'sprites/hq/decor/crystal.png?v122'},
  torch:{file:'sprites/hq/decor/torch.png?v123'},
  torch_unlit:{file:'sprites/hq/decor/torch_unlit.png?v123'},
  campfire:{file:'sprites/hq/decor/campfire.png?v123'},
  door:{file:'sprites/hq/decor/door.png', emoji:'🚪'},
  door_open:{file:'sprites/hq/decor/door_open.png', emoji:'🚪'},
  grate:{file:'sprites/hq/decor/grate.png', emoji:'⬛'},
  grate_open:{file:'sprites/hq/decor/grate_open.png', emoji:'⬜'},
  plank:{file:'sprites/hq/decor/log.png', emoji:'🪵'},
  loose_rock:{file:'sprites/hq/decor/rocks.png', emoji:'🪨'},
  lever:{file:'sprites/hq/decor/lever.png', emoji:'🎚️'},
  switch:{file:'sprites/hq/decor/switch.png', emoji:'🔘'},
  trap:{file:'sprites/hq/decor/trap.png', emoji:'⚠️'},
  trap_safe:{file:'sprites/hq/decor/trap_safe.png', emoji:'✅'},
  cauldron:{file:'sprites/hq/decor/cauldron.png', emoji:'🫧'},
  cauldron_tipped:{file:'sprites/hq/decor/cauldron_tipped.png', emoji:'💚'},
  bell:{file:'sprites/hq/decor/crystal.png', emoji:'🔔'},
  drawbridge:{file:'sprites/hq/decor/log.png', emoji:'🌉'},
  drawbridge_down:{file:'sprites/hq/decor/log.png', emoji:'🌉'},
  oil_barrel:{file:'sprites/hq/decor/oil_barrel.png', emoji:'🛢️'},
  acid_barrel:{file:'sprites/hq/decor/acid_barrel.png', emoji:'🧪'},
  powder_barrel:{file:'sprites/hq/decor/powder_barrel.png', emoji:'💣'},
};

const DECOR_MAX_W=72, DECOR_MAX_H=140;

const MONSTERS_5E=[
  {n:'Goblin',cr:'1/4',ac:15,hp:7,spd:30,init:2,attacks:1,sprite:'goblin',atk:'Scimitar +4 (1d6+2) · Shortbow +4 (1d6+2)',desc:'Small, cowardly raiders that swarm in packs and flee when bloodied.'},
  {n:'Hobgoblin',cr:'1/2',ac:18,hp:11,spd:30,init:1,attacks:1,sprite:'goblin',atk:'Longsword +3 (1d8+1)',desc:'Disciplined martial goblinoids; deadlier when allies are near.'},
  {n:'Bugbear',cr:'1',ac:16,hp:27,spd:30,init:2,attacks:1,sprite:'goblin',atk:'Morningstar +4 (2d8+2)',desc:'Hulking goblinoid ambushers that hit hard on a surprise round.'},
  {n:'Kobold',cr:'1/8',ac:12,hp:5,spd:30,init:2,attacks:1,sprite:'goblin',atk:'Dagger +4 (1d4+2)',desc:'Tiny draconic schemers; pack tactics give advantage in groups.'},
  {n:'Orc',cr:'1/2',ac:13,hp:15,spd:30,init:1,attacks:1,sprite:'orc',atk:'Greataxe +5 (1d12+3)',desc:'Savage warriors that charge straight into melee.'},
  {n:'Bandit',cr:'1/8',ac:12,hp:11,spd:30,init:1,attacks:1,sprite:'human',atk:'Scimitar +3 (1d6+1) · Crossbow +3 (1d8+1)',desc:'Common brigands and highway robbers.'},
  {n:'Guard',cr:'1/8',ac:16,hp:11,spd:30,init:1,attacks:1,sprite:'human',atk:'Spear +3 (1d6+1)',desc:'Town watch and hired muscle.'},
  {n:'Cultist',cr:'1/8',ac:12,hp:9,spd:30,init:1,attacks:1,sprite:'human',atk:'Scimitar +3 (1d6+1)',desc:'Fanatical devotees of dark powers.'},
  {n:'Mage',cr:'6',ac:12,hp:40,spd:30,init:2,attacks:1,sprite:'human',atk:'Fireball (DC 14 Dex, 8d6) · Magic Missile (3d4+3, auto-hit) · Dagger +5 (1d4+2)',desc:'A trained spellcaster (spell DC 14) with shield, counterspell and big AoE.'},
  {n:'Skeleton',cr:'1/4',ac:13,hp:13,spd:30,init:2,attacks:1,sprite:'skeleton',atk:'Shortsword +4 (1d6+2) · Shortbow +4 (1d6+2)',desc:'Reanimated bones; vulnerable to bludgeoning, immune to poison.'},
  {n:'Zombie',cr:'1/4',ac:8,hp:22,spd:20,init:-2,attacks:1,sprite:'zombie',atk:'Slam +3 (1d6+1)',desc:'Shambling undead; Undead Fortitude can keep it up at 1 HP.'},
  {n:'Ghoul',cr:'1',ac:12,hp:22,spd:30,init:2,attacks:1,sprite:'zombie',atk:'Claws +4 (2d4+2, DC 10 Con or paralyzed) · Bite +2 (2d6+2)',desc:'Ravenous undead; its claws can paralyze non-elves.'},
  {n:'Specter',cr:'1',ac:12,hp:22,spd:0,init:2,attacks:1,sprite:'ghost',atk:'Life Drain +4 (3d6, lowers max HP)',desc:'Incorporeal undead that flies and passes through walls.'},
  {n:'Ghost',cr:'4',ac:11,hp:45,spd:0,init:1,attacks:1,sprite:'ghost',atk:'Withering Touch +5 (4d6+3) · Horrifying Visage (DC 13 Wis, frightened)',desc:'A tormented spirit that can possess and age its victims.'},
  {n:'Wraith',cr:'5',ac:13,hp:67,spd:0,init:3,attacks:1,sprite:'ghost',atk:'Life Drain +6 (4d8+3)',desc:'A powerful undead of pure malice that creates new specters.'},
  {n:'Wolf',cr:'1/4',ac:13,hp:11,spd:40,init:2,attacks:1,sprite:'wolf',atk:'Bite +4 (2d4+2, knock prone)',desc:'Pack hunter; pack tactics grant advantage.'},
  {n:'Dire Wolf',cr:'1',ac:14,hp:37,spd:50,init:2,attacks:1,sprite:'wolf',atk:'Bite +5 (2d6+3, knock prone)',desc:'A massive wolf the size of a horse.'},
  {n:'Brown Bear',cr:'1',ac:11,hp:34,spd:40,init:0,attacks:2,sprite:'bear',atk:'Bite +6 (1d8+4) · Claws +6 (2d6+4)',desc:'Powerful beast with keen smell; multiattack (bite + claws).'},
  {n:'Giant Spider',cr:'1',ac:14,hp:26,spd:30,init:3,attacks:1,sprite:'spider',atk:'Bite +5 (1d8+3 + DC11 Con 2d8 poison) · Web (DC 11 Str, restrained)',desc:'Climbs walls; restrains prey with webbing.'},
  {n:'Giant Snake',cr:'1/4',ac:12,hp:13,spd:30,init:2,attacks:1,sprite:'snake',atk:'Bite +4 (1d6+2) · Constrict +4 (1d8+2, grappled)',desc:'A constrictor that grapples and crushes.'},
  {n:'Poisonous Snake',cr:'1/8',ac:13,hp:2,spd:30,init:3,attacks:1,sprite:'snake',atk:'Bite +5 (1 + DC10 Con 2d4 poison)',desc:'Tiny but deadly venom.'},
  {n:'Ogre',cr:'2',ac:11,hp:59,spd:40,init:-1,attacks:1,sprite:'ogre',atk:'Greatclub +6 (2d8+4)',desc:'Dim-witted giant brute that smashes everything.'},
  {n:'Troll',cr:'5',ac:15,hp:84,spd:30,init:1,attacks:3,sprite:'ogre',atk:'Claw +7 (2d6+4) · Bite +7 (1d6+4)',desc:'Multiattack (bite + 2 claws); regenerates 10 HP/turn unless hit by fire or acid.'},
  {n:'Hill Giant',cr:'5',ac:13,hp:105,spd:40,init:-1,attacks:2,sprite:'ogre',atk:'Greatclub +8 (3d8+5) · Rock +8 (3d10+5)',desc:'Enormous, gluttonous giant; multiattack (2 greatclubs) or hurls boulders.'},
  {n:'Gray Ooze',cr:'1/2',ac:8,hp:22,spd:10,init:-2,attacks:1,sprite:'slime',atk:'Pseudopod +3 (2d6+1 acid, corrodes metal)',desc:'Acidic sludge that mimics wet stone.'},
  {n:'Gelatinous Cube',cr:'2',ac:6,hp:84,spd:15,init:-4,attacks:1,sprite:'slime',atk:'Pseudopod +4 (3d6 acid) · Engulf (DC 12 Dex)',desc:'A transparent 10-ft cube that engulfs and dissolves.'},
  {n:'Imp',cr:'1',ac:13,hp:10,spd:20,init:3,attacks:1,sprite:'demon',atk:'Sting +5 (1d4+3 + DC11 Con 3d6 poison)',desc:'Shape-shifting fiend; invisible, resists most damage.'},
  {n:'Quasit',cr:'1',ac:13,hp:7,spd:40,init:3,attacks:1,sprite:'demon',atk:'Claws +4 (1d4+2 + DC10 Con poison)',desc:'Tiny demon that turns invisible and frightens.'},
  {n:'Dretch',cr:'1/4',ac:11,hp:18,spd:20,init:0,attacks:2,sprite:'demon',atk:'Bite +2 (1d6) · Claws +2 (2d4)',desc:'Lowly demon; multiattack (bite + claws); fights in reeking mobs.'},
  {n:'Lizardfolk',cr:'1/2',ac:15,hp:22,spd:30,init:0,attacks:2,sprite:'lizardfolk',atk:'Spear +4 (1d6+2) · Bite +4 (1d6+2)',desc:'Cold, pragmatic reptilian hunters; multiattack (2 different attacks).'},
  {n:'Wyvern',cr:'6',ac:13,hp:110,spd:'20/80 fly',init:0,attacks:2,sprite:'dragon',atk:'Bite +7 (2d6+4) · Stinger +7 (2d6+4 + DC15 Con 7d6 poison)',desc:'Lesser dragon-kin; multiattack (bite + stinger).'},
  {n:'Red Dragon Wyrmling',cr:'4',ac:17,hp:75,spd:'30/60 fly',init:0,attacks:1,sprite:'dragon',atk:'Bite +6 (1d10+4 + 1d6 fire) · Fire Breath (DC13 Dex, 7d6)',desc:'A young chromatic dragon with a fiery breath cone (recharge 5-6).'},
  {n:'Young Red Dragon',cr:'10',ac:18,hp:178,spd:'40/80 fly',init:0,attacks:3,sprite:'dragon',atk:'Bite +10 (2d10+6 + 1d6 fire) · Claw +10 (2d6+6) · Fire Breath (DC17 Dex, 16d6)',desc:'Multiattack (bite + 2 claws); breath recharges on 5-6.'},
  {n:'Gazer',cr:'1/2',ac:13,hp:13,spd:'10/30 fly',init:3,attacks:2,sprite:'eye',atk:'Eye Rays +5 (1d6) · Bite +1 (1)',desc:'A tiny aberration; two random eye rays a turn.'},
  {n:'Beholder',cr:'13',ac:18,hp:180,spd:'0/20 fly',init:2,attacks:3,sprite:'eye',atk:'Eye Rays +9 (3 of 10, ~4d8 each) · Bite +5 (4d6)',desc:'Fires three random eye rays a turn; its central-eye cone negates magic. Legendary: up to 3 extra rays between turns (DM adjudicates).'}
];
// Curated beast stat blocks for Wild Shape (2014 MM, condensed the same way MONSTERS_5E already
// is — not the full Monster Manual, one per CR tier a Circle of the Moon druid would actually
// want). `speed` is the beast's best relevant locomotion in ft/round (effSpeed reads it while
// shapeshifted); `atk` follows the exact same "Name +hit (dice)" `·`-joined convention
// MONSTERS_5E already uses, parsed by the same parseMonsterAttacks.

const TERRAIN={
  floor: {name:'Erase',  c:'',        e:''},
  grass: {name:'Grass',  c:'#6f9442', e:''},
  stone: {name:'Stone',  c:'#9aa0a8', e:''},
  wood:  {name:'Wood',   c:'#9a6a3a', e:''},
  sand:  {name:'Sand',   c:'#d9c48a', e:'', diff:true},
  snow:  {name:'Snow',   c:'#dfe9f2', e:'', diff:true},
  mud:   {name:'Mud',    c:'#7a5a32', e:'', diff:true},
  rubble:{name:'Rubble', c:'#9a8c74', e:'', diff:true},
  // Plant Growth (v120.270). Mechanically it is just difficult terrain, which the engine
  // already models — the spell simply had no way to express that, so casting it did nothing
  // at all. Distinct from `grease` (which also knocks prone) and from `web` (which restrains):
  // overgrowth only slows you down.
  overgrowth:{name:'Overgrowth', c:'#3f7a34', e:'', diff:true},
  water: {name:'Water',  c:'#3a6ea5', e:'', diff:true},
  // Brush = undergrowth: difficult + soft cover, does NOT block spell LoE (see blocksLoE)
  brush: {name:'Brush',  c:'#4d6b2c', e:'', diff:true, opaque:true, softCover:true},
  fog:   {name:'Fog',    c:'#c8ccd0', e:'', opaque:true},
  ice:   {name:'Ice',    c:'#bfe3f0', e:''},
  acid:  {name:'Acid',   c:'#7fbf3a', e:'', dmg:'2d6'},
  caltrops:{name:'Caltrops', c:'#8a7a6a', e:'', diff:true, dmg:'1d4'},
  lava:  {name:'Lava',   c:'#d2521f', e:'', dmg:'6d10'},
  // Full wall = floor-to-ceiling (dungeon). Impassable, unclimbable, blocks LoS.
  wall:  {name:'Wall (full)', c:'#5a4a36', e:'🧱', solid:true, opaque:true, climbable:false},
  // Natural cave rock — same full-wall behavior as `wall`, distinct visual (gray stone, not
  // brick) so caves don't render with a manufactured brick/wood look. See isFullWall.
  cave_wall:{name:'Cave wall', c:'#4a4744', e:'⛰', solid:true, opaque:true, climbable:false},
  // Low wall / parapet / outdoor barrier — walkable with climb cost, half cover, open sky.
  low_wall:{name:'Low wall', c:'#7a6a52', e:'🧱', solid:false, opaque:true, softCover:true, climbable:true, diff:true},
  // Window gap in an interior wall — still a solid barrier (can't walk through) but lets
  // light/LoS pass, unlike a full wall. Used for Tavern/Castle natural-light windows.
  window:{name:'Window', c:'#bcd9e8', e:'▭', solid:false, opaque:false, climbable:true, diff:true, exit:true},
  // Pit / chasm — open hole. No walk; fly can cross. Fall = deadly.
  void:  {name:'Pit / chasm', c:'#15110b', e:'🕳', solid:true, deadly:true},
  pit:   {name:'Pit', c:'#15110b', e:'🕳', solid:true, deadly:true}, // alias of void
  grease:{name:'Grease', c:'#5c6b2e', e:'', diff:true, prone:true},
  web:{name:'Web', c:'#c9c2a6', e:'', diff:true, restrain:true},
  // Spell-conjured walls — same solid/opaque shape as a real dungeon wall, painted/expired
  // via the existing SPELL_TERRAIN + paintHazardTerrain/expireHazards hazard machinery
  // (see WALL_SPELLS below) rather than a bespoke wall-geometry system.
  wall_force:{name:'Wall of Force', c:'#8ec9e8', e:'◆', solid:true, opaque:false, climbable:false},
  wall_ice:{name:'Wall of Ice', c:'#a8e0f0', e:'❄', solid:true, opaque:true, climbable:false},
  wall_stone:{name:'Wall of Stone', c:'#6b6459', e:'🧱', solid:true, opaque:true, climbable:false},
  wind_wall:{name:'Wind Wall', c:'#d8e8ea', e:'💨', diff:true}
};
// Wall-family terrain a wall-mounted decor item (torch) can be placed against.

const WALL_LIKE_TERRAIN=new Set(['wall','cave_wall','low_wall','window']);
/** True if any orthogonal neighbor of (x,y) is a wall — torches mount on walls, not open floor. */

const TERRAIN_PALETTE=Object.fromEntries(Object.entries(TERRAIN).filter(([,v])=>v.c).map(([k,v])=>[k,v.c]));
// Decorations: paintable layer independent of terrain.
// solid+opaque = real tree (blocks walk + spell LoE).
// softCover / bush = tiny undergrowth (half cover on attacks, never full LoE).

const DECOR={
  tree:{name:'Tree', solid:true, opaque:true},
  tree2:{name:'Tree B', solid:true, opaque:true},
  tree_dead:{name:'Dead tree', solid:true, opaque:true},
  tree_snow:{name:'Snow tree', solid:true, opaque:true},
  jungle_tree:{name:'Jungle tree', solid:true, opaque:true},
  bush:{name:'Bush', solid:false, softCover:true, opaque:true, diff:true},
  bush2:{name:'Thicket', solid:false, softCover:true, opaque:true, diff:true},
  bush_snow:{name:'Snow bush', solid:false, softCover:true, opaque:true, diff:true},
  rock:{name:'Rock', solid:true, opaque:false},
  stump:{name:'Stump', solid:false, opaque:false, diff:true},
  log:{name:'Log', solid:false, opaque:false, diff:true},
  mushroom:{name:'Mushroom', solid:false, opaque:false},
  crystal:{name:'Crystal', solid:false, opaque:false},
  torch:{name:'Torch', solid:false, opaque:false, light:true},
  campfire:{name:'Campfire', solid:false, opaque:false, light:true},
  // PHB Gust of Wind: extinguishes unprotected flames → unlit, no light
  torch_unlit:{name:'Unlit torch', solid:false, opaque:false, light:false},
  // ---- Interactables (Mage Hand / Use) ----
  door:{name:'Door (closed)', solid:true, opaque:true},
  door_open:{name:'Door (open)', solid:false, opaque:false},
  grate:{name:'Grate (closed)', solid:true, opaque:false},
  grate_open:{name:'Grate (open)', solid:false, opaque:false},
  plank:{name:'Loose plank', solid:false, opaque:false, diff:true},
  loose_rock:{name:'Loose rock', solid:true, opaque:false},
  lever:{name:'Lever', solid:false, opaque:false},
  switch:{name:'Switch', solid:false, opaque:false},
  trap:{name:'Pressure trap', solid:false, opaque:false},
  trap_safe:{name:'Disarmed trap', solid:false, opaque:false},
  cauldron:{name:'Acid cauldron', solid:true, opaque:false},
  cauldron_tipped:{name:'Tipped cauldron', solid:false, opaque:false},
  bell:{name:'Bell', solid:false, opaque:false},
  chest:{name:'Chest', solid:true, opaque:false},
  drawbridge:{name:'Drawbridge (up)', solid:true, opaque:true},
  drawbridge_down:{name:'Drawbridge (down)', solid:false, opaque:false},
  // Hazard barrels — multi-reaction (fire / kinetic / Mage Hand tip)
  oil_barrel:{name:'Oil barrel', solid:true, opaque:false},
  acid_barrel:{name:'Acid barrel', solid:true, opaque:false},
  powder_barrel:{name:'Powder keg', solid:true, opaque:false}
};
/**
 * Interactive dungeon objects. map.interact['x,y'] = { type, state, link?, links?, ... }
 * Decor is kept in sync for pathing + sprites via syncInteractDecor().
 * Mage Hand (30 ft / 6 tiles) can use most actions without standing adjacent.
 */

const INTERACT_TYPES={
  door:{
    name:'Door', states:['closed','open'], default:'closed',
    decor:{closed:'door', open:'door_open'},
    actions:[
      {id:'open', label:'Open door', needs:'closed', to:'open', hand:true, adj:true},
      {id:'close', label:'Close door', needs:'open', to:'closed', hand:true, adj:true}
    ]
  },
  grate:{
    name:'Grate', states:['closed','open'], default:'closed',
    decor:{closed:'grate', open:'grate_open'},
    actions:[
      {id:'open', label:'Lift grate', needs:'closed', to:'open', hand:true, adj:true},
      {id:'close', label:'Drop grate', needs:'open', to:'closed', hand:true, adj:true}
    ]
  },
  plank:{
    name:'Loose plank', states:['set','removed'], default:'set',
    decor:{set:'plank', removed:null},
    actions:[
      {id:'remove', label:'Pull plank free', needs:'set', to:'removed', hand:true, adj:true, note:'Leaves a gap / pit tile'}
    ]
  },
  loose_rock:{
    name:'Loose rock', states:['blocking','cleared'], default:'blocking',
    decor:{blocking:'loose_rock', cleared:null},
    actions:[
      {id:'push', label:'Shove rock aside', needs:'blocking', to:'cleared', hand:true, adj:true, note:'Opens the passage'}
    ]
  },
  lever:{
    name:'Lever', states:['off','on'], default:'off',
    decor:{off:'lever', on:'lever'},
    actions:[
      {id:'pull', label:'Pull lever', needs:null, toggle:true, hand:true, adj:true, note:'Toggles linked doors / bridges'}
    ]
  },
  switch:{
    name:'Switch', states:['off','on'], default:'off',
    decor:{off:'switch', on:'switch'},
    actions:[
      {id:'flip', label:'Flip switch', needs:null, toggle:true, hand:true, adj:true, note:'Toggles linked mechanisms'}
    ]
  },
  trap:{
    name:'Pressure trap', states:['armed','disarmed','sprung'], default:'armed',
    decor:{armed:'trap', disarmed:'trap_safe', sprung:'trap_safe'},
    actions:[
      {id:'disarm', label:'Disarm trap', needs:'armed', to:'disarmed', hand:true, adj:true, note:'Sleight of Hand (auto for Mage Hand)'},
      {id:'trigger', label:'Poke the plate', needs:'armed', to:'sprung', hand:true, adj:true, note:'Sets it off from afar'}
    ]
  },
  cauldron:{
    name:'Acid cauldron', states:['full','tipped'], default:'full',
    decor:{full:'cauldron', tipped:'cauldron_tipped'},
    actions:[
      {id:'tip', label:'Tip cauldron', needs:'full', to:'tipped', hand:true, adj:true, note:'Spills acid on adjacent tiles'}
    ]
  },
  bell:{
    name:'Bell', states:['idle'], default:'idle',
    decor:{idle:'bell'},
    actions:[
      {id:'ring', label:'Ring the bell', needs:null, hand:true, adj:true, note:'Loud clang — enemies notice'}
    ]
  },
  chest:{
    name:'Chest', states:['closed','opened'], default:'closed',
    decor:{closed:'chest', opened:'chest'},
    actions:[
      {id:'open', label:'Open chest', needs:'closed', to:'opened', hand:true, adj:true, note:'A little coin, if you’re lucky'}
    ]
  },
  drawbridge:{
    name:'Drawbridge', states:['raised','lowered'], default:'raised',
    decor:{raised:'drawbridge', lowered:'drawbridge_down'},
    actions:[
      {id:'lower', label:'Lower bridge', needs:'raised', to:'lowered', hand:false, adj:true, note:'Usually needs a lever'},
      {id:'raise', label:'Raise bridge', needs:'lowered', to:'raised', hand:false, adj:true}
    ]
  },
  torch:{
    name:'Torch', states:['lit','unlit'], default:'lit',
    decor:{lit:'torch', unlit:'torch_unlit'},
    // Mage Hand can light or snuff wall torches
    actions:[
      {id:'light', label:'Light torch', needs:'unlit', to:'lit', hand:true, adj:true},
      {id:'snuff', label:'Snuff torch', needs:'lit', to:'unlit', hand:true, adj:true}
    ]
  },
  /**
   * Hazard barrels — several ways to interact:
   *  · Mage Hand / Use: tip → spill
   *  · Kinetic hit (bludgeoning/force/slash/pierce/thunder): smash → spill
   *  · Fire (Fireball, Fire Bolt, lava): oil & powder EXPLODE; acid just ruptures
   *  · Lightning: powder keg explodes
   */
  oil_barrel:{
    name:'Oil barrel', states:['intact','gone'], default:'intact',
    decor:{intact:'oil_barrel', gone:null},
    hazard:{
      fire:'explode', lightning:'explode', kinetic:'rupture', tip:'rupture',
      spillTerrain:'grease', spillR:2,
      explodeR:2, explodeDmg:'3d6', explodeDtype:'fire',
      chain:true
    },
    actions:[
      {id:'tip', label:'Tip oil barrel', needs:'intact', hand:true, adj:true, note:'Oil/grease floods nearby tiles'},
      {id:'smash', label:'Smash open', needs:'intact', hand:false, adj:true, note:'Kinetic break — oil leaks out'}
    ]
  },
  acid_barrel:{
    name:'Acid barrel', states:['intact','gone'], default:'intact',
    decor:{intact:'acid_barrel', gone:null},
    hazard:{
      fire:'rupture', lightning:'rupture', kinetic:'rupture', tip:'rupture',
      spillTerrain:'acid', spillR:2,
      explodeR:1, explodeDmg:'2d6', explodeDtype:'acid',
      chain:false
    },
    actions:[
      {id:'tip', label:'Tip acid barrel', needs:'intact', hand:true, adj:true, note:'Acid floods nearby tiles'},
      {id:'smash', label:'Smash open', needs:'intact', hand:false, adj:true, note:'Barrel cracks — acid spills'}
    ]
  },
  powder_barrel:{
    name:'Powder keg', states:['intact','gone'], default:'intact',
    decor:{intact:'powder_barrel', gone:null},
    hazard:{
      fire:'explode', lightning:'explode', kinetic:'explode', tip:null,
      spillTerrain:null, spillR:0,
      explodeR:3, explodeDmg:'4d6', explodeDtype:'fire',
      chain:true
    },
    actions:[
      {id:'smash', label:'Strike the keg', needs:'intact', hand:false, adj:true, note:'Dangerous — may detonate'},
      {id:'spark', label:'Spark the fuse', needs:'intact', hand:true, adj:true, note:'Mage Hand lights the fuse — BOOM'}
    ]
  }
};

const DECOR_TO_INTERACT=(()=>{ const m={}; Object.keys(INTERACT_TYPES).forEach(type=>{
  const def=INTERACT_TYPES[type];
  Object.keys(def.decor||{}).forEach(state=>{ const dk=def.decor[state]; if(dk&&!(dk in m)) m[dk]={type,state}; }); });
  return m; })();

const SPELL_TERRAIN={'Grease':{terrain:'grease', rounds:10},
  // 10 minutes of difficult terrain (PHB is 8 hours; capped like the other zone spells so a
  // sandbox fight doesn't carry it forever).
  'Plant Growth':{terrain:'overgrowth', rounds:100}, 'Web':{terrain:'web', rounds:600},
  'Wall of Force':{terrain:'wall_force', rounds:600}, 'Wall of Ice':{terrain:'wall_ice', rounds:100},
  'Wall of Stone':{terrain:'wall_stone', rounds:Infinity}, 'Wind Wall':{terrain:'wind_wall', rounds:100}};
// Real 5e walls are precise player-drawn panels/lines; this app approximates one as a small
// filled zone centered on the aimed tile (reusing paintHazardTerrain's existing blast-fill
// logic) rather than building a line/panel-drawing UI — documented simplification, same
// spirit as this app's other AoE-shape approximations (see AUDIT.md's cone/line notes).

const WALL_SPELLS=new Set(['Wall of Force','Wall of Ice','Wall of Stone','Wind Wall']);
// Lingering damage/condition clouds (Cloudkill, Insect Plague) — unlike SPELL_TERRAIN,
// these don't repaint the floor (no `terrain` key), they just mark cells as a hazard
// zone that ticks every round via tickGasHazards: a Con save (hz.dc, set at cast from
// the caster's spell DC) or take `dmg` (half on a save), or — for save-no-damage clouds
// like Stinking Cloud — apply Poisoned on a failed save instead. Real 5e Cloudkill also
// drifts 10 ft/round away from the caster; simplified to a stationary cloud here (no
// engine concept of a hazard "owner" to drift away from) — noted in AUDIT.md.

const SPELL_GAS={
  'Cloudkill':{dmg:'5d8', dtype:'poison', rounds:100},
  'Insect Plague':{dmg:'4d10', dtype:'piercing', rounds:100},
  'Stinking Cloud':{rounds:15},   // no damage — Poisoned (can't take actions) on a failed save
};
/* ---- preset battle maps (v120.107 — from-scratch FFT pack maps) ---- */

const MAP_PRESETS=(()=>{ const P={};
  const fill=(t,w,h,k)=>{ for(let y=0;y<h;y++)for(let x=0;x<w;x++) t[x+','+y]=k; };
  const box=(t,w,h,k)=>{ k=k||'wall'; for(let x=0;x<w;x++){t[x+',0']=k;t[x+','+(h-1)]=k;} for(let y=0;y<h;y++){t['0,'+y]=k;t[(w-1)+','+y]=k;} };
  const rect=(t,x0,y0,x1,y1,k)=>{ for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++) t[x+','+y]=k; };
  const put=(t,a,k)=>a.forEach(([x,y])=>t[x+','+y]=k);
  const hrect=(ht,x0,y0,x1,y1,lvl)=>{ for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++) ht[x+','+y]=lvl; };
  const torchPt=(c,r)=>({col:c,row:r,radius:5.0,color:[1.0,0.55,0.22],intensity:1.55,kind:'torch'});
  const campPt=(c,r)=>({col:c,row:r,radius:4.5,color:[1.0,0.5,0.18],intensity:1.4,kind:'campfire'});
  const crystalPt=(c,r)=>({col:c,row:r,radius:4.0,color:[0.55,0.75,1.0],intensity:1.25,kind:'crystal'});
  const windowPt=(c,r)=>({col:c,row:r,radius:5.5,color:[0.85,0.92,1.0],intensity:1.3,kind:'window'});
  const syncIx=(ix,dc)=>{ Object.keys(ix).forEach(k=>{
    const o=ix[k]; const def=INTERACT_TYPES[o.type]; if(!def) return;
    const dkey=def.decor&&def.decor[o.state||def.default];
    if(dkey) dc[k]=dkey;
  }); };
  const doorway=(t,x,y,floor)=>{ t[x+','+y]=floor||'stone'; };
  // Plants: ONLY tree | tree2 | bush. No rock/crystal as outdoor clutter.
  // Trees spaced far apart so canopies don't stack into a mess.

  // ═══════════════════════════════════════════════════
  // OPEN FIELD — default day skirmish
  // ═══════════════════════════════════════════════════
  (function openField(){
    const w=28,h=18,t={},ht={},dc={},ix={};
    fill(t,w,h,'grass');
    // Pond NW
    rect(t,3,2,8,6,'water');
    // Dirt track
    for(let x=10;x<=22;x++){ t[x+',9']='dirt'; t[x+',10']='dirt'; }
    for(let y=6;y<=12;y++) t['14,'+y]='dirt';
    // Sand bank SE
    rect(t,18,12,25,16,'sand');
    // Low cover
    put(t,[[11,5],[12,5],[16,7],[17,7],[20,4],[6,11],[7,11]],'low_wall');
    // Hills
    hrect(ht,22,2,26,5,1); rect(t,22,2,26,5,'stone');
    hrect(ht,1,13,4,16,1);
    // Full trees — corners & edges only
    put(dc,[[2,8],[2,14],[9,1],[15,2],[24,1],[26,8],[25,15],[12,15],[5,16]],'tree');
    put(dc,[[20,14],[8,14]],'tree2');
    // Bushes near path only
    put(dc,[[10,8],[13,11],[18,8],[16,12],[9,12],[21,11]],'bush');
    // Camp
    put(dc,[[15,13]],'campfire');
    put(dc,[[16,13]],'crate'); put(dc,[[17,13]],'barrel');
    put(dc,[[12,12],[13,12]],'fence');
    ix['15,13']={type:'torch',state:'lit'};
    ix['11,12']={type:'trap',state:'armed'};
    ix['18,11']={type:'oil_barrel',state:'intact'};
    syncIx(ix,dc);
    P['Open Field']={cols:w,rows:h,tiles:t,height:ht,decor:dc,interact:ix,
      light:{mode:'day',points:[campPt(15,13)]},
      blurb:'Day field · pond · dirt track · hills · full trees · bushes · camp'};
  })();

  // ═══════════════════════════════════════════════════
  // CASTLE YARD — outdoor paths + keep
  // ═══════════════════════════════════════════════════
  (function castleYard(){
    const w=26,h=18,t={},ht={},dc={},ix={};
    fill(t,w,h,'grass');
    box(t,w,h,'wall');
    // Perimeter walkway
    rect(t,1,1,w-2,2,'stone');
    rect(t,1,h-3,w-2,h-2,'stone');
    rect(t,1,1,2,h-2,'stone');
    rect(t,w-3,1,w-2,h-2,'stone');
    // Cross paths
    rect(t,2,8,w-3,9,'stone');
    rect(t,11,2,13,h-3,'stone');
    // Keep (NW building)
    rect(t,4,3,10,7,'stone');
    for(let x=4;x<=10;x++){ t[x+',3']='wall'; t[x+',7']='wall'; }
    for(let y=3;y<=7;y++){ t['4,'+y]='wall'; t['10,'+y]='wall'; }
    doorway(t,7,7,'stone');
    // SE tower
    rect(t,17,11,22,15,'stone');
    for(let x=17;x<=22;x++){ t[x+',11']='wall'; t[x+',15']='wall'; }
    for(let y=11;y<=15;y++){ t['17,'+y]='wall'; t['22,'+y]='wall'; }
    doorway(t,17,13,'stone');
    // Gate south
    doorway(t,11,h-1,'stone'); doorway(t,12,h-1,'stone');
    // Trees: only outside courtyard greens (not on paths)
    put(dc,[[3,4],[5,2],[9,2],[15,2],[20,3],[23,6],[23,12],[20,16],[8,15],[3,12],[2,7]],'tree');
    put(dc,[[14,15],[24,9]],'tree2');
    // Courtyard: bushes only (no trees in the open court)
    put(dc,[[9,10],[14,10],[15,6],[8,6],[16,12]],'bush');
    // Furniture
    put(dc,[[12,11]],'crate'); put(dc,[[13,11]],'barrel');
    put(dc,[[6,5]],'table'); put(dc,[[5,5],[7,5]],'chair');
    const torches=[[5,4],[9,4],[18,12],[21,12],[3,9],[20,5]];
    put(dc,torches,'torch');
    ix['7,7']={type:'door',state:'closed'};
    ix['17,13']={type:'door',state:'open'};
    ix['11,'+(h-1)]={type:'door',state:'open'};
    ix['12,'+(h-1)]={type:'door',state:'open'};
    ix['14,8']={type:'trap',state:'armed'};
    ix['15,11']={type:'oil_barrel',state:'intact'};
    torches.forEach(([c,r])=>{ ix[c+','+r]={type:'torch',state:'lit'}; });
    syncIx(ix,dc);
    P['Castle']={cols:w,rows:h,tiles:t,height:ht,decor:dc,interact:ix,
      light:{mode:'day',points:torches.map(([c,r])=>torchPt(c,r))},
      blurb:'Day castle · stone paths · keep · tower · trees outside · bushes in yard'};
  })();

  // ═══════════════════════════════════════════════════
  // MEADOWS — clean open fight
  // ═══════════════════════════════════════════════════
  (function meadows(){
    const w=24,h=16,t={},ht={},dc={},ix={};
    fill(t,w,h,'grass');
    put(t,[[8,4],[9,4],[10,4],[14,8],[15,8],[6,10]],'brush');
    put(t,[[11,6],[12,6],[12,7]],'low_wall');
    hrect(ht,18,2,22,5,1); rect(t,18,2,22,5,'stone');
    put(dc,[[2,2],[4,1],[1,8],[3,13],[10,1],[16,2],[21,7],[20,13],[12,13],[6,14]],'tree');
    put(dc,[[8,8],[13,5],[15,11],[9,11],[17,9]],'bush');
    put(dc,[[13,10]],'campfire'); put(dc,[[14,10]],'crate');
    ix['13,10']={type:'torch',state:'lit'};
    ix['11,9']={type:'trap',state:'armed'};
    syncIx(ix,dc);
    P['Mechanics Lab']={cols:w,rows:h,tiles:t,height:ht,decor:dc,interact:ix,
      light:{mode:'day',points:[campPt(13,10)]},
      blurb:'Day meadow · simple cover · camp · full trees · bushes'};
  })();

  // ═══════════════════════════════════════════════════
  // CLIFF RUN
  // ═══════════════════════════════════════════════════
  (function cliff(){
    const w=18,h=14,t={},ht={},dc={},ix={};
    fill(t,w,h,'grass'); box(t,w,h);
    hrect(ht,2,2,7,5,1); rect(t,2,2,7,5,'stone');
    hrect(ht,10,2,15,7,2); rect(t,10,2,15,7,'stone');
    hrect(ht,8,2,9,3,1); rect(t,8,2,9,3,'stone');
    for(let y=3;y<=7;y++) t['8,'+y]='pit';
    for(let x=2;x<=7;x++) t[x+',10']='lava';
    rect(t,10,8,15,11,'mud');
    put(t,[[2,8],[3,8],[4,8]],'low_wall');
    put(dc,[[2,12],[15,12],[5,7],[12,12]],'tree');
    put(dc,[[6,8],[11,11],[14,9],[3,6]],'bush');
    put(dc,[[4,4]],'campfire'); put(dc,[[13,5]],'crate');
    ix['4,4']={type:'torch',state:'lit'};
    ix['11,9']={type:'trap',state:'armed'};
    ix['3,4']={type:'oil_barrel',state:'intact'};
    syncIx(ix,dc);
    P['Cliff Run']={cols:w,rows:h,tiles:t,height:ht,decor:dc,interact:ix,
      light:{mode:'day',points:[campPt(4,4)]},
      blurb:'Day cliffs · pit canyon · lava · trees · camp'};
  })();

  // ═══════════════════════════════════════════════════
  // FIREBALL FIELD — arena
  // ═══════════════════════════════════════════════════
  (function fireball(){
    const w=16,h=14,t={},ht={},dc={},ix={};
    fill(t,w,h,'sand'); box(t,w,h);
    rect(t,5,3,10,8,'grass');
    put(t,[[4,4],[4,5],[4,6],[4,7],[11,4],[11,5],[11,6],[11,7]],'low_wall');
    put(t,[[7,11],[8,11]],'pit');
    put(dc,[[2,2],[13,2],[2,11],[13,11]],'tree');
    put(dc,[[7,2],[8,12],[1,6],[14,6],[6,10]],'bush');
    put(dc,[[6,3],[9,3]],'crate'); put(dc,[[5,9],[10,9]],'barrel');
    ix['7,5']={type:'oil_barrel',state:'intact'};
    ix['8,6']={type:'oil_barrel',state:'intact'};
    ix['6,6']={type:'acid_barrel',state:'intact'};
    ix['3,8']={type:'trap',state:'armed'};
    syncIx(ix,dc);
    P['Fireball Field']={cols:w,rows:h,tiles:t,height:ht,decor:dc,interact:ix,
      light:{mode:'day',points:[]},
      blurb:'Day killbox · dual cover · barrels · corner trees'};
  })();

  // ═══════════════════════════════════════════════════
  // SUNSET RIDGE
  // ═══════════════════════════════════════════════════
  (function sunset(){
    const w=28,h=16,t={},ht={},dc={},ix={};
    fill(t,w,h,'grass'); box(t,w,h);
    rect(t,1,1,6,3,'sand');
    rect(t,20,11,26,14,'mud');
    hrect(ht,3,2,6,13,2); rect(t,3,2,6,13,'stone');
    hrect(ht,7,4,9,10,1); rect(t,7,4,9,10,'stone');
    put(t,[[10,6],[10,7],[10,8],[11,7]],'pit');
    put(t,[[13,7],[14,7],[15,7],[16,8]],'low_wall');
    put(dc,[[11,3],[15,5],[18,2],[22,4],[24,8],[12,12],[19,13],[8,13],[25,3]],'tree');
    put(dc,[[14,4],[16,10],[20,6],[22,11],[10,9]],'bush');
    put(dc,[[17,12]],'campfire'); put(dc,[[18,12]],'tent'); put(dc,[[19,12]],'crate');
    put(dc,[[12,8],[13,8]],'fence');
    ix['17,12']={type:'torch',state:'lit'};
    ix['15,9']={type:'trap',state:'armed'};
    ix['18,9']={type:'oil_barrel',state:'intact'};
    syncIx(ix,dc);
    P['Sunset Ridge']={cols:w,rows:h,tiles:t,height:ht,decor:dc,interact:ix,
      light:{mode:'sunset',points:[campPt(17,12)]},
      blurb:'Sunset · ridge · ravine · camp · full trees'};
  })();

  // ═══════════════════════════════════════════════════
  // CHASM BRIDGE
  // ═══════════════════════════════════════════════════
  (function chasm(){
    const w=26,h=16,t={},ht={},dc={},ix={};
    fill(t,w,h,'grass');
    for(let x=0;x<w;x++){ t[x+',6']='pit'; t[x+',7']='pit'; t[x+',8']='pit'; }
    [6,7,8].forEach(x=>{ t[x+',6']='wood'; t[x+',7']='wood'; t[x+',8']='wood'; });
    put(t,[[2,3],[3,4],[20,10],[12,11]],'low_wall');
    hrect(ht,20,2,24,5,1); rect(t,20,2,24,5,'stone');
    put(dc,[[3,2],[11,2],[20,11],[9,12],[23,11],[2,11]],'tree');
    put(dc,[[5,10],[14,11],[18,3],[8,4]],'bush');
    put(dc,[[5,11]],'campfire'); put(dc,[[9,4],[10,4]],'fence');
    put(dc,[[3,10]],'crate');
    ix['5,11']={type:'torch',state:'lit'};
    ix['5,5']={type:'lever',state:'off',links:['16,6','17,6','16,7','17,7','16,8','17,8']};
    ['16,6','17,6','16,7','17,7','16,8','17,8'].forEach(k=>{
      t[k]='pit';
      ix[k]={type:'drawbridge',state:'raised',span:['16,6','17,6','16,7','17,7','16,8','17,8']};
    });
    ix['14,10']={type:'trap',state:'armed'};
    syncIx(ix,dc);
    P['Chasm Bridge']={cols:w,rows:h,tiles:t,height:ht,decor:dc,interact:ix,
      light:{mode:'day',points:[campPt(5,11)]},
      blurb:'Day chasm · wood span · lever drawbridge · trees'};
  })();

  // ═══════════════════════════════════════════════════
  // SWAMP
  // ═══════════════════════════════════════════════════
  (function swamp(){
    const w=26,h=18,t={},ht={},dc={},ix={};
    fill(t,w,h,'mud');
    rect(t,2,2,6,5,'water');
    rect(t,10,4,14,8,'water');
    rect(t,7,9,10,11,'acid');
    rect(t,17,2,21,4,'water');
    put(t,[[1,7],[4,8],[8,2],[11,2],[3,10],[15,8]],'brush');
    rect(t,5,6,7,7,'fog');
    rect(t,14,12,16,14,'fog');
    put(t,[[8,14],[9,14],[10,14],[11,14],[12,14]],'wood');
    put(t,[[15,10],[16,10],[16,11]],'pit');
    put(dc,[[14,2],[21,11],[8,15],[3,14],[23,5],[2,15]],'tree');
    put(dc,[[11,11],[5,12],[17,14],[8,8],[19,9],[13,15]],'bush');
    put(dc,[[13,3]],'campfire'); put(dc,[[18,8]],'crate');
    ix['13,3']={type:'torch',state:'lit'};
    ix['10,10']={type:'trap',state:'armed'};
    ix['8,11']={type:'acid_barrel',state:'intact'};
    syncIx(ix,dc);
    P['Swamp']={cols:w,rows:h,tiles:t,height:ht,decor:dc,interact:ix,
      light:{mode:'day',points:[campPt(13,3)]},
      blurb:'Day swamp · water/acid/fog · boardwalk · trees · bushes'};
  })();

  // ═══════════════════════════════════════════════════
  // FROZEN LAKE
  // ═══════════════════════════════════════════════════
  (function frozen(){
    const w=26,h=16,t={},ht={},dc={},ix={};
    fill(t,w,h,'snow');
    rect(t,6,3,14,9,'ice');
    put(t,[[3,2],[15,2],[4,8],[14,8],[10,1],[18,5]],'low_wall');
    hrect(ht,0,0,1,h-1,1); hrect(ht,w-2,0,w-1,h-1,1);
    put(t,[[8,5],[9,6],[10,5],[11,7]],'pit');
    put(dc,[[3,11],[15,3],[19,13],[7,13],[22,9],[2,9],[21,3]],'tree');
    put(dc,[[11,11],[5,9],[17,7],[13,2],[9,11]],'bush');
    put(dc,[[13,11],[14,11]],'fence');
    put(dc,[[20,7]],'crate'); put(dc,[[12,10]],'tent');
    ix['10,9']={type:'trap',state:'armed'};
    ix['6,8']={type:'oil_barrel',state:'intact'};
    syncIx(ix,dc);
    P['Frozen Lake']={cols:w,rows:h,tiles:t,height:ht,decor:dc,interact:ix,
      light:{mode:'day',points:[]},
      blurb:'Day snow · ice lake · trees · bushes · tent'};
  })();

  // ═══════════════════════════════════════════════════
  // TORCHLIT CRYPT — indoor, no outdoor trees
  // ═══════════════════════════════════════════════════
  (function crypt(){
    const w=24,h=16,t={},ht={},dc={},ix={};
    fill(t,w,h,'stone'); box(t,w,h);
    for(let y=1;y<h-1;y++){ t['8,'+y]='wall'; t['15,'+y]='wall'; }
    for(let x=1;x<w-1;x++){ if(x!==8&&x!==15) t[x+',7']='wall'; }
    doorway(t,8,3); doorway(t,8,11); doorway(t,15,3); doorway(t,15,11);
    doorway(t,4,7); doorway(t,11,7); doorway(t,19,7);
    put(t,[[2,2],[20,2],[2,12],[20,12]],'rubble');
    hrect(ht,17,10,21,13,1); rect(t,17,10,21,13,'stone');
    t['16,7']='pit'; t['17,7']='pit';
    const torches=[[2,2],[5,2],[2,5],[11,2],[13,2],[18,2],[21,2],[2,9],[5,9],[11,9],[18,9],[21,12],[11,4],[11,11]];
    put(dc,torches,'torch');
    put(dc,[[18,11]],'crystal');
    put(dc,[[3,3]],'crate'); put(dc,[[4,3]],'chest'); put(dc,[[19,3]],'barrel');
    put(dc,[[11,10]],'table'); put(dc,[[10,10],[12,10]],'chair');
    ix['8,3']={type:'door',state:'closed'};
    ix['8,11']={type:'door',state:'closed'};
    ix['15,3']={type:'door',state:'closed'};
    ix['15,11']={type:'door',state:'open'};
    ix['4,7']={type:'door',state:'open'};
    ix['11,7']={type:'door',state:'closed'};
    ix['19,7']={type:'door',state:'closed'};
    ix['3,5']={type:'lever',state:'off',links:['16,7','17,7']};
    ix['16,7']={type:'drawbridge',state:'raised',span:['16,7','17,7']};
    ix['17,7']={type:'drawbridge',state:'raised',span:['16,7','17,7']};
    ix['11,5']={type:'trap',state:'armed'};
    ix['12,12']={type:'trap',state:'armed'};
    ix['20,11']={type:'cauldron',state:'full'};
    torches.slice(0,4).forEach(([c,r])=>{ ix[c+','+r]={type:'torch',state:'lit'}; });
    syncIx(ix,dc);
    P['Torchlit Crypt']={cols:w,rows:h,tiles:t,height:ht,decor:dc,interact:ix,
      light:{mode:'dungeon',points:torches.map(([c,r])=>torchPt(c,r)).concat([crystalPt(18,11)])},
      blurb:'Crypt · rooms · doors · furniture · no outdoor trees'};
  })();

  // ═══════════════════════════════════════════════════
  // DUNGEON
  // ═══════════════════════════════════════════════════
  (function dungeon(){
    const w=26,h=18,t={},ht={},dc={},ix={};
    fill(t,w,h,'stone'); box(t,w,h);
    for(let y=1;y<h-1;y++) if(y!==5&&y!==11) t['7,'+y]='wall';
    for(let x=1;x<7;x++){ if(x!==3) t[x+',5']='wall'; if(x!==3) t[x+',11']='wall'; }
    for(let x=7;x<w-1;x++) if(x!==11&&x!==18) t[x+',8']='wall';
    for(let y=1;y<=8;y++) if(y!==4) t['14,'+y]='wall';
    doorway(t,3,5); doorway(t,3,11); doorway(t,7,5); doorway(t,7,11);
    doorway(t,11,8); doorway(t,18,8); doorway(t,14,4);
    put(t,[[2,2],[3,2],[12,2]],'rubble');
    rect(t,12,2,14,3,'fog');
    put(t,[[4,7],[5,7]],'acid');
    put(t,[[16,11],[17,11]],'pit');
    const torches=[[2,3],[5,2],[2,7],[5,7],[2,13],[9,3],[12,4],[16,3],[20,4],[22,11],[11,13]];
    put(dc,torches,'torch');
    put(dc,[[12,11]],'crystal');
    put(dc,[[2,3]],'crate'); put(dc,[[9,5]],'chest'); put(dc,[[20,10]],'barrel');
    put(dc,[[10,11]],'table'); put(dc,[[11,11]],'chair');
    ix['3,5']={type:'door',state:'closed'};
    ix['3,11']={type:'door',state:'closed'};
    ix['7,5']={type:'door',state:'open'};
    ix['7,11']={type:'door',state:'closed'};
    ix['11,8']={type:'door',state:'closed'};
    ix['18,8']={type:'door',state:'closed'};
    ix['14,4']={type:'door',state:'closed'};
    ix['9,7']={type:'trap',state:'armed'};
    ix['12,3']={type:'oil_barrel',state:'intact'};
    torches.slice(0,4).forEach(([c,r])=>{ ix[c+','+r]={type:'torch',state:'lit'}; });
    syncIx(ix,dc);
    P['Dungeon']={cols:w,rows:h,tiles:t,height:ht,decor:dc,interact:ix,
      light:{mode:'dungeon',points:torches.map(([c,r])=>torchPt(c,r)).concat([crystalPt(12,11)])},
      blurb:'Dungeon · cells · halls · doors · traps'};
  })();

  // ═══════════════════════════════════════════════════
  // CAVE
  // ═══════════════════════════════════════════════════
  (function cave(){
    const w=26,h=18,t={},ht={},dc={},ix={};
    fill(t,w,h,'stone'); box(t,w,h,'cave_wall');
    put(t,[[4,3],[5,3],[5,4],[9,2],[11,5],[6,8],[12,7],[15,5],[17,3],[19,8],[13,11]],'cave_wall');
    put(t,[[4,5],[10,6],[14,4]],'rubble');
    rect(t,2,10,7,13,'water');
    put(t,[[12,2],[13,2],[12,3],[13,3],[14,3],[15,4]],'lava');
    rect(t,10,11,12,13,'fog');
    put(t,[[6,6],[15,8],[16,8],[19,11]],'pit');
    hrect(ht,13,7,16,9,1);
    const torches=[[1,2],[5,7],[9,12],[13,14],[16,4],[20,7],[23,13],[3,15]];
    put(dc,torches,'torch');
    put(dc,[[14,8]],'crystal');
    put(dc,[[17,10]],'crate'); put(dc,[[9,8]],'barrel');
    ix['9,6']={type:'trap',state:'armed'};
    ix['17,9']={type:'oil_barrel',state:'intact'};
    torches.slice(0,3).forEach(([c,r])=>{ ix[c+','+r]={type:'torch',state:'lit'}; });
    syncIx(ix,dc);
    P['Cave']={cols:w,rows:h,tiles:t,height:ht,decor:dc,interact:ix,
      light:{mode:'dungeon',points:torches.map(([c,r])=>torchPt(c,r)).concat([crystalPt(14,8)])},
      blurb:'Cave · pillars · lake · lava · pits'};
  })();

  // ═══════════════════════════════════════════════════
  // TAVERN — indoor
  // ═══════════════════════════════════════════════════
  (function tavern(){
    const w=22,h=16,t={},ht={},dc={},ix={};
    fill(t,w,h,'wood'); box(t,w,h);
    doorway(t,7,h-1,'wood'); doorway(t,8,h-1,'wood');
    t['3,0']='window'; t['10,0']='window'; t['16,0']='window';
    for(let x=1;x<=5;x++) t[x+',3']='wall';
    for(let y=3;y<=7;y++) t['5,'+y]='wall';
    doorway(t,5,5,'wood');
    put(t,[[9,3],[10,3],[13,3],[14,3]],'wall');
    t['20,1']='lava';
    hrect(ht,2,9,6,11,1); rect(t,2,9,6,11,'wood');
    put(t,[[14,12],[15,12]],'pit');
    put(dc,[[2,5],[3,5]],'table'); put(dc,[[2,6],[4,5],[4,6]],'chair');
    put(dc,[[8,6],[9,6]],'table'); put(dc,[[8,7],[10,6]],'chair');
    put(dc,[[13,6],[14,6]],'table'); put(dc,[[13,7],[15,6]],'chair');
    put(dc,[[2,4],[3,4]],'crate'); put(dc,[[4,4],[7,2],[8,2]],'barrel');
    put(dc,[[18,9]],'crate'); put(dc,[[19,9]],'chest');
    put(dc,[[20,2]],'campfire');
    const torches=[[2,1],[7,1],[12,1],[17,1],[2,13],[9,13],[18,11]];
    put(dc,torches,'torch');
    ix['7,'+(h-1)]={type:'door',state:'open'};
    ix['8,'+(h-1)]={type:'door',state:'open'};
    ix['5,5']={type:'door',state:'closed'};
    ix['14,12']={type:'plank',state:'set'};
    ix['15,12']={type:'plank',state:'set'};
    ix['9,9']={type:'trap',state:'armed'};
    ix['11,4']={type:'oil_barrel',state:'intact'};
    torches.forEach(([c,r])=>{ ix[c+','+r]={type:'torch',state:'lit'}; });
    ix['20,2']={type:'torch',state:'lit'};
    syncIx(ix,dc);
    const pts=torches.map(([c,r])=>torchPt(c,r));
    pts.push(campPt(20,2));
    pts.push(windowPt(3,0),windowPt(10,0),windowPt(16,0));
    P['Tavern']={cols:w,rows:h,tiles:t,height:ht,decor:dc,interact:ix,
      light:{mode:'dungeon',points:pts},
      blurb:'Tavern · tables · kitchen · fireplace · cellar'};
  })();


  // ═══════════════════════════════════════════════════
  // SKYBRIDGE — verticality showcase (v120.274)
  // Built for the things altitude finally makes testable now that flying renders (v120.272):
  // fly ACROSS a chasm, shove someone INTO one, and reach islands that have no ground route.
  // isPitTerrain gates pits to flyers only, so an isolated platform is genuinely flight-only.
  // ═══════════════════════════════════════════════════
  (function skybridge(){
    const w=26,h=18,t={},ht={},dc={},ix={};
    fill(t,w,h,'stone');
    box(t,w,h,'wall');
    // A wide chasm splitting the map north/south — the main "fly or find the bridge" decision.
    for(let x=1;x<w-1;x++){ t[x+',8']='pit'; t[x+',9']='pit'; t[x+',10']='pit'; }
    // Two crossings, deliberately narrow: one plank walk, one stone span. Narrow means a Shove
    // near the edge is a real threat rather than a curiosity.
    [7,8].forEach(x=>{ t[x+',8']='wood'; t[x+',9']='wood'; t[x+',10']='wood'; });
    [18].forEach(x=>{ t[x+',8']='stone'; t[x+',9']='stone'; t[x+',10']='stone'; });
    // Raised approaches so the bridges are also a HEIGHT change, not just a gap.
    hrect(ht,5,5,10,7,1); rect(t,5,5,10,7,'stone');
    hrect(ht,16,11,21,14,1); rect(t,16,11,21,14,'stone');
    // A tall spire on the north side — climbable via stepped ledges (1→2→3).
    hrect(ht,2,2,5,4,1); hrect(ht,3,2,5,3,2); hrect(ht,4,2,5,2,3);
    rect(t,2,2,5,4,'stone');
    // FLIGHT-ONLY ISLAND: ringed by pit on every side, no ground route at all.
    for(let x=11;x<=15;x++) for(let y=2;y<=5;y++) t[x+','+y]='pit';
    rect(t,12,3,14,4,'stone'); hrect(ht,12,3,14,4,2);
    put(dc,[[13,3]],'crate'); put(dc,[[14,4]],'barrel');
    // Low walls along the bridge mouths: cover, and something to be shoved over.
    put(t,[[6,7],[9,7],[17,11],[19,11]],'low_wall');
    put(dc,[[3,15],[22,3],[23,15],[9,15]],'tree');
    put(dc,[[6,13],[20,6],[11,14]],'bush');
    put(dc,[[8,13]],'campfire');
    const torches=[[7,7],[18,7],[7,11],[18,11]];
    put(dc,torches,'torch');
    torches.forEach(([c,r])=>{ ix[c+','+r]={type:'torch',state:'lit'}; });
    ix['8,13']={type:'torch',state:'lit'};
    ix['19,13']={type:'trap',state:'armed'};
    syncIx(ix,dc);
    P['Skybridge']={cols:w,rows:h,tiles:t,height:ht,decor:dc,interact:ix,
      light:{mode:'day',points:torches.map(([c,r])=>torchPt(c,r)).concat([campPt(8,13)])},
      blurb:'Chasm split · 2 narrow spans · stepped spire · FLIGHT-ONLY island · shove risk'};
  })();

  // ═══════════════════════════════════════════════════
  // QUARRY STEPS — climbing showcase (v120.274)
  // Four stacked terraces (0→3) so climb cost, high ground and falling all come into play in one
  // fight, with a flooded pit at the bottom to be shoved into.
  // ═══════════════════════════════════════════════════
  (function quarry(){
    const w=24,h=18,t={},ht={},dc={},ix={};
    fill(t,w,h,'dirt');
    box(t,w,h,'wall');
    // Terraces stepping up west→east: each is a climb, and each looks down on the last.
    hrect(ht,1,1,6,16,0);
    hrect(ht,7,1,12,16,1);  rect(t,7,1,12,16,'stone');
    hrect(ht,13,1,18,16,2); rect(t,13,1,18,16,'stone');
    hrect(ht,19,1,22,16,3); rect(t,19,1,22,16,'stone');
    // Ramps: low_wall is climbable, so these are the "cheap" routes between terraces.
    put(t,[[6,4],[6,5],[12,9],[12,10],[18,13],[18,14]],'low_wall');
    // Flooded quarry floor — the shove target.
    for(let y=6;y<=11;y++) for(let x=2;x<=5;x++) t[x+','+y]='water';
    put(t,[[3,8],[4,9]],'pit');   // sinkholes in the flooded floor
    // Working equipment for cover.
    put(dc,[[9,4],[10,4]],'crate'); put(dc,[[15,7]],'barrel'); put(dc,[[20,10]],'crate');
    put(dc,[[8,14],[16,3],[21,15]],'bush');
    put(dc,[[2,15],[22,2]],'tree');
    put(dc,[[10,12]],'campfire');
    ix['10,12']={type:'torch',state:'lit'};
    ix['14,10']={type:'trap',state:'armed'};
    ix['16,12']={type:'oil_barrel',state:'intact'};
    syncIx(ix,dc);
    P['Quarry Steps']={cols:w,rows:h,tiles:t,height:ht,decor:dc,interact:ix,
      light:{mode:'day',points:[campPt(10,12)]},
      blurb:'Four terraces 0→3 · climbable ramps · flooded floor · sinkholes · high ground'};
  })();

  // ═══════════════════════════════════════════════════
  // COLLAPSED VAULT — holes & ledges (v120.274)
  // Indoor counterpart: a dark vault whose floor has given way, leaving ledges and holes. Torchlit
  // so darkvision, Darkness and Fog Cloud all matter alongside the verticality.
  // ═══════════════════════════════════════════════════
  (function vault(){
    const w=22,h=16,t={},ht={},dc={},ix={};
    fill(t,w,h,'stone');
    box(t,w,h,'cave_wall');
    // Collapsed centre — a ragged hole rather than a neat rectangle.
    const hole=[[8,6],[9,6],[10,6],[11,6],[7,7],[8,7],[9,7],[10,7],[11,7],[12,7],
                [7,8],[8,8],[9,8],[10,8],[11,8],[12,8],[8,9],[9,9],[10,9],[11,9]];
    put(t,hole,'pit');
    // A single plank across it — the only ground route, and easy to be pushed off.
    put(t,[[9,7],[9,8]],'wood');
    // Ledges around the rim at different heights, so fights happen above the hole.
    hrect(ht,2,2,6,5,1);  rect(t,2,2,6,5,'stone');
    hrect(ht,15,2,19,6,2); rect(t,15,2,19,6,'stone');
    hrect(ht,14,10,19,13,1); rect(t,14,10,19,13,'stone');
    put(t,[[6,3],[6,4],[14,4],[14,5],[13,11],[13,12]],'low_wall');   // climbable edges
    put(dc,[[3,3]],'crate'); put(dc,[[17,4]],'barrel'); put(dc,[[16,12]],'crate');
    const torches=[[4,8],[17,8],[10,2],[10,13]];
    put(dc,torches,'torch');
    torches.forEach(([c,r])=>{ ix[c+','+r]={type:'torch',state:'lit'}; });
    ix['12,12']={type:'trap',state:'armed'};
    ix['5,11']={type:'oil_barrel',state:'intact'};
    syncIx(ix,dc);
    P['Collapsed Vault']={cols:w,rows:h,tiles:t,height:ht,decor:dc,interact:ix,
      light:{mode:'dungeon',points:torches.map(([c,r])=>torchPt(c,r))},
      blurb:'Dark vault · collapsed floor · single plank · rim ledges 1–2 · torchlit'};
  })();


return P; })();

const MONSTER_RVI={
  'Skeleton':{vuln:['bludgeoning'],imm:['poison']},
  'Zombie':{imm:['poison']},
  'Ghoul':{imm:['poison']},
  'Specter':{res:['cold','necrotic','acid','fire','lightning','thunder','bludgeoning','piercing','slashing'],imm:['poison']},
  'Ghost':{res:['cold','necrotic','acid','fire','lightning','thunder','bludgeoning','piercing','slashing'],imm:['poison']},
  'Wraith':{res:['cold','necrotic','acid','fire','lightning','thunder','bludgeoning','piercing','slashing'],imm:['poison']},
  'Red Dragon Wyrmling':{imm:['fire']}, 'Young Red Dragon':{imm:['fire']},
  'Will-o-Wisp':{imm:['poison','lightning'],res:['acid','cold','fire','necrotic','thunder','bludgeoning','piercing','slashing']},
  'Gargoyle':{res:['bludgeoning','piercing','slashing']},
  'Troll':{}, 'Fire Elemental':{imm:['fire','poison']}, 'Water Elemental':{}, 'Earth Elemental':{}
};

const DETECT_THOUGHTS_FLAVOR=[
  [/zombie/i, 'Hungry. So hungry. Must... find... brains.'],
  [/skeleton/i, 'Cold. Silent. An echo of orders given centuries ago.'],
  [/ghoul/i, 'Rotting meat. Fresh meat. Which is closer?'],
  [/ghost|wraith|specter/i, "Why won't they let me rest? I only wanted to go home."],
  [/ooze|gelatinous cube/i, '...nothing but a wordless hum of hunger.'],
  [/beholder|gazer/i, 'Everyone is beneath me. Everyone is a threat. Both are true.'],
  [/goblin|kobold/i, 'Bigger than me. Run? Or is there loot first?'],
  [/orc|bugbear|hobgoblin/i, 'Strike first. Strike hard. Ask questions never.'],
  [/troll|ogre|hill giant/i, 'HUNGRY. SMASH. EAT.'],
  [/dire wolf|\bwolf/i, 'Pack. Prey. Which one are you?'],
  [/spider/i, 'Something struggles in the web. Good — it has been a while.'],
  [/snake/i, 'Warm blood, close by. Strike before it strikes.'],
  [/bear/i, "This is MY territory. Leave, or don't — either is fine."],
  [/imp|quasit|dretch/i, 'Hee hee. Wonder what happens if I bite that one.'],
  [/dragon/i, 'Mine. All of this — the gold, the land, you — is mine.'],
  [/wyvern/i, 'Circle. Wait. Strike from above.'],
  [/mage/i, 'If this goes wrong, which spell do I have left...'],
  [/cultist/i, 'The Master will reward this. It has to.'],
  [/bandit/i, "Just take the coin purse and go. Not worth dying over."],
  [/guard/i, 'Please, just let my shift end without anything happening.'],
  [/lizardfolk/i, 'Warm-blood thinks too much. Cold-blood survives.']
];

const DETECT_THOUGHTS_FALLBACK='A jumble of surface impressions — hard to make out anything clear.';

const CR_XP={'0':10,'1/8':25,'1/4':50,'1/2':100,'1':200,'2':450,'3':700,'4':1100,'5':1800,'6':2300,'7':2900,'8':3900,'9':5000,'10':5900,'11':7200,'12':8400,'13':10000,'14':11500,'15':13000,'16':15000,'17':18000,'18':20000,'19':22000,'20':25000,'21':33000,'22':41000,'23':50000,'24':62000,'25':75000,'26':90000,'27':105000,'28':120000,'29':135000,'30':155000};

const CHAR_XP_THRESH=[null,
  {easy:25,medium:50,hard:75,deadly:100},{easy:50,medium:100,hard:150,deadly:200},
  {easy:75,medium:150,hard:225,deadly:400},{easy:125,medium:250,hard:375,deadly:500},
  {easy:250,medium:500,hard:750,deadly:1100},{easy:300,medium:600,hard:900,deadly:1400},
  {easy:350,medium:750,hard:1100,deadly:1700},{easy:450,medium:900,hard:1400,deadly:2100},
  {easy:550,medium:1100,hard:1600,deadly:2400},{easy:600,medium:1200,hard:1900,deadly:2800},
  {easy:800,medium:1600,hard:2400,deadly:3600},{easy:1000,medium:2000,hard:3000,deadly:4500},
  {easy:1100,medium:2200,hard:3400,deadly:5100},{easy:1250,medium:2500,hard:3800,deadly:5700},
  {easy:1400,medium:2800,hard:4300,deadly:6400},{easy:1600,medium:3200,hard:4800,deadly:7200},
  {easy:2000,medium:3900,hard:5900,deadly:8800},{easy:2100,medium:4200,hard:6300,deadly:9500},
  {easy:2400,medium:4900,hard:7300,deadly:10900},{easy:2800,medium:5700,hard:8500,deadly:12700}];

const ENCOUNTER_MULT_STEPS=[1,1.5,2,2.5,3,4];

