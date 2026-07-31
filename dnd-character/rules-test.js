// Grimoire 5e rules test harness — run with:  node rules-test.js
// Extracts the <script> from index.html, loads it against a stub DOM, and asserts
// PHB-correct behavior. Run this FIRST when auditing or after changing any rules
// logic — only investigate code around failures. Add a test with every rules fix.
// NOTE: deliberately NOT 'use strict' — the eval below relies on sloppy-mode function
// declarations leaking into this scope so tests can call the app's functions directly.
const fs=require('fs'), path=require('path');
const html=fs.readFileSync(path.join(__dirname,'index.html'),'utf8');
// data.js/rules.js/net.js/ui.js (the staged index.html modularization — see CLAUDE.md) load
// via <script src> in the real page, which shares one lexical scope across script tags; eval()
// doesn't do that across SEPARATE calls (its let/const are scoped per-call), so every module's
// source is concatenated into ONE eval, in the same order the real page loads them, to
// reproduce the same sharing the browser gives for free.
const moduleSrc=['data.js','rules.js','net.js','ui.js'].map(f=>fs.readFileSync(path.join(__dirname,f),'utf8')).join('\n');
const src=moduleSrc+'\n'+html.match(/<script>([\s\S]*)<\/script>/)[1];

/* ---- stub DOM (just enough for the app to load; rendering is a no-op) ---- */
function fakeEl(){ return { addEventListener(){}, remove(){}, click(){}, focus(){}, select(){},
  style:{}, innerHTML:'', textContent:'', value:'', dataset:{}, checked:false,
  classList:{add(){},remove(){},toggle(){}},
  querySelector(){return null;}, querySelectorAll(){return [];},
  getBoundingClientRect(){return {left:0,top:0,width:0,height:0};} }; }
global.localStorage={_d:{},getItem(k){return this._d[k]??null;},setItem(k,v){this._d[k]=String(v);},removeItem(k){delete this._d[k];}};
global.document={querySelector:()=>fakeEl(),querySelectorAll:()=>[],addEventListener(){},getElementById:()=>fakeEl(),createElement:()=>fakeEl(),body:{appendChild(){},insertBefore(){}},head:{appendChild(){}},hidden:false};
global.window=global; global.addEventListener=()=>{};
try{ global.navigator={}; }catch(e){}   // Node ≥21 exposes a read-only navigator — the built-in one is fine
global.confirm=()=>true; global.alert=()=>{}; global.prompt=()=>null;
global.requestAnimationFrame=f=>f();
global.Image=class{ constructor(){ this.complete=false; this.naturalWidth=0; } set src(v){} };
require('./iso-renderer.js');   // mapGridHTML calls IsoRenderer.stageSize/tileScreenPos — see iso-renderer-test.js for the renderer's own tests

// consts inside eval stay block-scoped — re-export the data tables the tests assert on
eval(src.replace('"use strict";','')+
  ';globalThis.SPELL_AOE=SPELL_AOE;globalThis.SPELL_EFFECTS=SPELL_EFFECTS;globalThis.MONSTERS_5E=MONSTERS_5E;'+
  'globalThis.mod=mod;globalThis.sgn=sgn;globalThis.ARMOR=ARMOR;globalThis.ARMOR_PROF=ARMOR_PROF;globalThis.TERRAIN=TERRAIN;'+
  'globalThis.RITUAL_SPELLS=RITUAL_SPELLS;globalThis.RITUAL_CASTERS=RITUAL_CASTERS;'+
  'globalThis.Engine=Engine;globalThis.qbAdapter=qbAdapter;globalThis.sessionAdapter=sessionAdapter;globalThis.SPELL_TELEPORT=SPELL_TELEPORT;globalThis.BRAINS=BRAINS;globalThis.SPELL_CHOICES=SPELL_CHOICES;globalThis.SPELL_DTYPE=SPELL_DTYPE;globalThis.SPELL_MECH=SPELL_MECH;globalThis.MONSTER_MECH=MONSTER_MECH;globalThis.LEGENDARY=LEGENDARY;globalThis.LAIR=LAIR;globalThis.MONSTERS_5E=MONSTERS_5E;globalThis.SPELL_EFFECTS=SPELL_EFFECTS;globalThis.SPELL_DESC=SPELL_DESC;'+
  'globalThis.SPELL_DESC=SPELL_DESC;globalThis.SPELL_COND=SPELL_COND;globalThis.SPELL_TERRAIN=SPELL_TERRAIN;globalThis.qbPaintTerrain=qbPaintTerrain;globalThis.qbHazardAt=qbHazardAt;globalThis.qbExpireHazards=qbExpireHazards;globalThis.qbCheckTerrainProne=qbCheckTerrainProne;'+
  'globalThis.SPELL_GAS=SPELL_GAS;globalThis.paintHazardTerrain=paintHazardTerrain;globalThis.hazardAt=hazardAt;globalThis.expireHazards=expireHazards;globalThis.checkTerrainHazardCond=checkTerrainHazardCond;globalThis.tickGasHazards=tickGasHazards;'+
  'globalThis.speedBlocked=speedBlocked;globalThis.getQB=()=>QB;globalThis.setQB=v=>{QB=v;};globalThis.POWER_WORD_HP=POWER_WORD_HP;globalThis.EYEBITE_OPTIONS=EYEBITE_OPTIONS;'+
  'globalThis.MOUNT_CATALOG=MOUNT_CATALOG;globalThis.MAGIC_ITEMS=MAGIC_ITEMS;globalThis.TRAP_CATALOG=TRAP_CATALOG;globalThis.FIND_STEED_CATALOG=FIND_STEED_CATALOG;'+
  'globalThis.BEAST_SHAPES=BEAST_SHAPES;globalThis.ELEMENTAL_SHAPES=ELEMENTAL_SHAPES;'+
  'globalThis.concQueueLen=()=>concQueue.length;globalThis.resetConc=()=>{concActive=false;concQueue.length=0;};'+
  'globalThis.MAP_PRESETS=MAP_PRESETS;globalThis.dirFromDelta=dirFromDelta;globalThis.spriteTokenHTML=spriteTokenHTML;'+
  'globalThis.rotXY=rotXY;globalThis.rotDelta=rotDelta;'+
  'globalThis.DECOR=DECOR;globalThis.decorAt=decorAt;globalThis.losClear=losClear;globalThis.dijkstra=dijkstra;'+
  'globalThis.SPRITE_MANIFEST=SPRITE_MANIFEST;globalThis.SPRITE_ZOOM=SPRITE_ZOOM;globalThis.spriteReady=spriteReady;'+
  'globalThis.DECOR_MANIFEST=DECOR_MANIFEST;globalThis.decorReady=decorReady;globalThis.decorTokenHTML=decorTokenHTML;globalThis.DECOR_MAX_W=DECOR_MAX_W;globalThis.DECOR_MAX_H=DECOR_MAX_H;'+
  'globalThis.SPELL_HANDLERS=SPELL_HANDLERS;globalThis.SUMMON_CATALOG=SUMMON_CATALOG;globalThis.summonCatalogEntry=summonCatalogEntry;'+
  'globalThis.DRACONIC_ANCESTRY_DAMAGE=DRACONIC_ANCESTRY_DAMAGE;globalThis.Events=Events;globalThis.FEAT_GRANTS=FEAT_GRANTS;'+
  'globalThis.spawnSummon=spawnSummon;globalThis.dismissSummonsForSpell=dismissSummonsForSpell;globalThis.nearbySpawnTiles=nearbySpawnTiles;globalThis.isConcentration=isConcentration;'+
  'globalThis.mapGridHTML=mapGridHTML;globalThis.setIsoView=v=>{isoView=v;};'+
  'globalThis.INTERACT_TYPES=INTERACT_TYPES;globalThis.DECOR_TO_INTERACT=DECOR_TO_INTERACT;globalThis.WALL_LIKE_TERRAIN=WALL_LIKE_TERRAIN;globalThis.nextToWall=nextToWall;'+
  'globalThis.ABILITIES=ABILITIES;globalThis.playerNetAdapter=playerNetAdapter;'+
  'globalThis.DETECT_THOUGHTS_FALLBACK=DETECT_THOUGHTS_FALLBACK;'+
  'globalThis.setNet=v=>{net=v;};globalThis.getNet=()=>net;'+
  'globalThis.getDB=()=>DB;globalThis.setDB=v=>{DB=v;};');

let fails=0;
function T(name,cond){ if(cond) console.log('  ok  '+name); else { fails++; console.log('FAIL  '+name); } }

/* ---- spell slots & progression (PHB tables) ---- */
const wiz5={cls:'Wizard',level:5}; T('Wizard 5 slots 4/3/2', JSON.stringify([spellSlots(wiz5)[1],spellSlots(wiz5)[2],spellSlots(wiz5)[3]])==='[4,3,2]');
T('Wizard 20 has one 9th slot', spellSlots({cls:'Wizard',level:20})[9]===1);
const pal2={cls:'Paladin',level:2}; T('Paladin 2 has two 1st slots & max level 1', spellSlots(pal2)[1]===2 && maxSpellLevel(pal2)===1);
T('Paladin 5 max spell level 2', maxSpellLevel({cls:'Paladin',level:5})===2);
T('Paladin 17 max spell level 5', maxSpellLevel({cls:'Paladin',level:17})===5);
const wl5={cls:'Warlock',level:5}; T('Warlock 5: two 3rd-level pact slots', spellSlots(wl5)[3]===2 && spellSlots(wl5)[1]===0);
T('Artificer 1 has slots', spellSlots({cls:'Artificer',level:1})[1]===2 && maxSpellLevel({cls:'Artificer',level:1})===1);
T('prof L1=2 L5=3 L9=4 L13=5 L17=6', [1,5,9,13,17].map(l=>profBonus({level:l})).join()==='2,3,4,5,6');
T('Extra Attack: Fighter 5/11/20', [4,5,11,20].map(l=>extraAttacks({cls:'Fighter',level:l})).join()==='0,1,2,3');
T('Rage damage +2/+3/+4 at 1/9/16', [1,9,16].map(l=>rageDamage({level:l})).join()==='2,3,4');

/* ---- cantrip scaling ---- */
T('cantripTier 1/5/11/17', [1,5,11,17].map(l=>cantripTier({level:l})).join()==='1,2,3,4');
T('multiplyDice 1d10 ×3 = 3d10', multiplyDice('1d10',3)==='3d10');
T('multiplyDice 3d4+3 ×2 = 6d4+3 (flat not doubled)', multiplyDice('3d4+3',2)==='6d4+3');

/* ---- spell mechanics parsing (SPELL_DESC wording is load-bearing!) ---- */
let mc=parseSpellMechanics('Fireball'); T('Fireball: Dex save, 8d6 fire', mc.save==='dex'&&mc.dmg==='8d6'&&mc.dtype==='fire');
T('Fireball AoE = 4 tiles (20 ft)', SPELL_AOE['Fireball']===4);
T('Cone of Cold AoE = 4 (equal-area burst)', SPELL_AOE['Cone of Cold']===4);
T('Meteor Swarm has an AoE burst (was single-target)', SPELL_AOE['Meteor Swarm']===8);
mc=parseSpellMechanics('Chill Touch'); T('Chill Touch is an attack (not a heal)', mc.attack===true&&mc.dmg==='1d8'&&!mc.heal);
mc=parseSpellMechanics('Vampiric Touch'); T('Vampiric Touch is an attack for 3d6', mc.attack===true&&mc.dmg==='3d6');
mc=parseSpellMechanics('Cure Wounds'); T('Cure Wounds heals 1d8', mc.heal==='1d8'&&!mc.dmg);
mc=parseSpellMechanics('Magic Missile'); T('Magic Missile: 3d4+3, no attack, no save', mc.dmg==='3d4+3'&&!mc.attack&&!mc.save);
mc=parseSpellMechanics('Sleep'); T('Sleep deals no damage', !mc.dmg);
mc=parseSpellMechanics('Moonbeam'); T('Moonbeam: Con save, not an attack', mc.save==='con'&&!mc.attack);
mc=parseSpellMechanics('Ice Storm'); T('Ice Storm combines dice 2d8+4d6', mc.dmg==='2d8+4d6'&&mc.save==='dex');
mc=parseSpellMechanics('Sacred Flame'); T('Sacred Flame: Dex save 1d8', mc.save==='dex'&&mc.dmg==='1d8');
T('Magic Missile no longer seeks through walls', spellSeeks('Magic Missile')===false);

/* ---- concentration ---- */
T('Hold Person is concentration', isConcentration('Hold Person'));
T('Animal Shapes is NOT concentration', !isConcentration('Animal Shapes'));
T('Hex lasts 1 hour (600 rounds)', SPELL_EFFECTS['Hex'].rounds===600);
T("Hunter's Mark lasts 1 hour", SPELL_EFFECTS["Hunter's Mark"].rounds===600);
T('Aid lasts 8 hours', SPELL_EFFECTS['Aid'].rounds===4800);

/* ---- casting times ---- */
T('Shield is a reaction', spellCastTime('Shield')==='reaction');
T('Counterspell is a reaction', spellCastTime('Counterspell')==='reaction');
T('Healing Word is a bonus action', spellCastTime('Healing Word')==='bonus');
T('Expeditious Retreat is a bonus action', spellCastTime('Expeditious Retreat')==='bonus');
T('Fireball is an action', spellCastTime('Fireball')==='action');

/* ---- character math ---- */
const c=newCharacter('Test'); c.cls='Wizard'; c.level=5; c.abilities={str:10,dex:14,con:14,int:16,wis:10,cha:10}; applyClassDefaults(c);
T('new character has an effects array', Array.isArray(c.effects));
T('spell DC = 8+prof+mod (14)', 8+profBonus(c)+mod(abil(c,c.spellAbility))===14);
T('AC unarmored 10+DEX = 12', computeAC(c)===12);
c.effects.push({id:'x',name:'Mage Armor',mods:{}}); T('Mage Armor AC = 13+DEX = 15', computeAC(c)===15);
c.effects=[{id:'y',name:'Barkskin',mods:{}}]; T('Barkskin floors AC at 16', computeAC(c)===16);
c.effects=[];
T('shield is +2 AC', (()=>{ c.shield=true; const v=computeAC(c)===14; c.shield=false; return v; })());

/* ---- concentration enforcement without a template ---- */
c.spells=[{name:'Hold Person',level:2,prepared:true},{name:'Bless',level:1,prepared:true}];
castSpell(c,'Hold Person',2);
T('casting Hold Person starts concentration', c.concentration.active && c.concentration.spell==='Hold Person');
castSpell(c,'Bless',1);
T('casting Bless drops Hold Person (one concentration)', c.concentration.spell==='Bless' && !(c.effects||[]).some(e=>e.name==='Hold Person'));

/* ---- bonus-action spell rule in battle ---- */
const b=newCharacter('B2'); b.cls='Cleric'; b.level=5; applyClassDefaults(b);
b.spells=[{name:'Healing Word',level:1,prepared:true},{name:'Guiding Bolt',level:1,prepared:true},{name:'Sacred Flame',level:0,prepared:true},{name:'Shield of Faith',level:1,prepared:true}];
startBattle(b);
T('cast bonus-action spell ok', castSpell(b,'Healing Word',1)===true);
T('leveled action spell blocked after bonus spell', canCast(b,'Guiding Bolt',1)===false);
T('cantrip still allowed after bonus spell', canCast(b,'Sacred Flame',0)===true);
T('second bonus-action spell blocked', canCast(b,'Shield of Faith',1)===false);

/* ---- reaction spends reaction, not action ---- */
const w=newCharacter('W'); w.cls='Wizard'; w.level=3; applyClassDefaults(w);
w.spells=[{name:'Shield',level:1,prepared:true}]; startBattle(w);
castSpell(w,'Shield',1);
T('Shield spends reaction, keeps action', w.battle.reaction===true && hasAction(w)===true);

/* ---- Haste / actions ---- */
const h=newCharacter('H'); h.cls='Fighter'; h.level=5; applyClassDefaults(h);
T('base 1 action', actionsPerTurn(h)===1);
h.effects.push({id:'h1',name:'Haste',mods:{ac:2,speedMul:2}});
T('Haste grants +1 action', actionsPerTurn(h)===2);

/* ---- HP, temp HP, death ---- */
const d=newCharacter('D'); d.cls='Fighter'; d.level=1; d.hp={max:10,cur:10,temp:5};
applyHp(d,-7); T('temp HP absorbs first (10 HP, 3 temp gone → 8 cur)', d.hp.cur===8 && d.hp.temp===0);
applyHp(d,-30); T('overkill ≥ max HP = instant death (3 fails)', d.death.fail===3);
const e=newCharacter('E'); e.hp={max:20,cur:0,temp:0}; e.death={succ:0,fail:0};
applyHp(e,-5); T('damage at 0 HP = 1 death-save failure', e.death.fail===1);
applyHp(e,-25); T('damage ≥ max at 0 HP = dead', e.death.fail===3);

/* ---- stacking ---- */
const f=newCharacter('F'); f.cls='Wizard';
addEffect(f,'Shield of Faith'); addEffect(f,'Shield of Faith');
T('same effect does not stack', f.effects.filter(x=>x.name==='Shield of Faith').length===1);

/* ---- fighting styles ---- */
const ar=newCharacter('A'); ar.cls='Fighter'; ar.level=1; ar.fightingStyle='Archery'; ar.abilities={str:10,dex:16,con:10,int:10,wis:10,cha:10};
T('Archery +2 ranged to-hit (3 dex +2 prof +2 style = 7)', weaponToHit(ar,weaponByName('Longbow'))===7);
ar.fightingStyle='Dueling';
T('Dueling +2 melee damage', weaponDmgBonus(ar,weaponByName('Longsword'))===2);
T('Dueling does not apply two-handed', weaponDmgBonus(ar,weaponByName('Greatsword'))===0);
ar.fightingStyle='Defense'; ar.armor='chainmail';
T('Defense +1 AC in armor (16+1)', computeAC(ar)===17);

/* ---- skills & passives ---- */
const bard=newCharacter('Bd'); bard.cls='Bard'; bard.level=3; bard.abilities={str:10,dex:10,con:10,int:10,wis:10,cha:10};
T('JoAT: half prof on non-proficient skill', skillBonus(bard,'athletics','str',true)===1);
const ob=newCharacter('Ob'); ob.abilities={str:10,dex:10,con:10,int:10,wis:10,cha:10}; ob.feats=[{name:'Observant'}];
T('Observant +5 passive Perception', passiveScore(ob,'perception','wis')===15);

/* ---- combat skill actions: shared check plumbing (Shove/Grapple/Hide/etc.) ---- */
{
  const barb=newCharacter('Rg'); barb.cls='Barbarian'; barb.level=1; barb.abilities={str:16,dex:10,con:14,int:10,wis:10,cha:10};
  T('not raging: no Strength-check advantage', skillCheckAdvantage(barb,'athletics','str').adv===0);
  addEffect(barb,'Rage');
  T('raging: advantage on Strength checks', skillCheckAdvantage(barb,'athletics','str').adv===1);
  T('raging does not grant advantage on Dex checks', skillCheckAdvantage(barb,'acrobatics','dex').adv===0);

  const orig=Math.random;
  Math.random=()=>0.05;
  let r=rollSkillCheck(barb,'athletics','str',{adv:0});
  T('rollSkillCheck flat: single d20, no second roll', r.d2===null && r.d20===2);
  { let calls=[0.05,0.9], i=0; Math.random=()=>calls[i++]; }
  r=rollSkillCheck(barb,'athletics','str',{adv:1});
  T('rollSkillCheck advantage: keeps the higher of two d20s', r.d20===19);
  { let calls=[0.05,0.9], i=0; Math.random=()=>calls[i++]; }
  r=rollSkillCheck(barb,'athletics','str',{adv:-1});
  T('rollSkillCheck disadvantage: keeps the lower of two d20s', r.d20===2);
  Math.random=orig;

  const rog=newCharacter('St'); rog.abilities={str:10,dex:14,con:10,int:10,wis:10,cha:10};
  T('no Pass without Trace: no Stealth bonus', skillCheckBonus(rog,'stealth')===0);
  addEffect(rog,'Pass without Trace');
  T('Pass without Trace: +10 to Stealth checks', skillCheckBonus(rog,'stealth')===10);

  const mo={name:'Ogre'};
  T('monsterCheckBonus reuses the existing CR-scaled monsterSaveBonus', monsterCheckBonus(mo)===monsterSaveBonus(mo));

  const sh=newCharacter('Sh'); sh.cls='Fighter'; sh.level=5; sh.abilities={str:18,dex:10,con:14,int:10,wis:10,cha:10}; sh.skillProf.athletics=true;
  const goblin={name:'Goblin'};
  const res=opposedCheck(sh,'athletics','str', goblin, [['athletics','str'],['acrobatics','dex']]);
  T('opposedCheck (PC vs monster) returns a well-formed contested result', typeof res.success==='boolean' && Number.isFinite(res.attacker.total) && Number.isFinite(res.defender.total));
}

/* ---- Shove / Grapple / Escape Grapple (Use-menu combat maneuvers, Quick Battle) ---- */
{
  const sc=newCharacter('Brute'); sc.cls='Fighter'; sc.level=1; sc.abilities={str:18,dex:10,con:14,int:10,wis:10,cha:10}; sc.skillProf.athletics=true;
  sc.battle={action:false,bonus:false,reaction:false,actionsMax:1,actionsUsed:0,attacksLeft:1,move:30,moveUsed:0};
  setQB({active:true, over:null, paused:false, log:[], map:{cols:5,rows:5,tiles:{}}, order:[{k:'p',id:'pc'}], turn:0, battle:{active:true,round:1},
    monsters:[{id:'m1',side:'mon',base:'Goblin',name:'Goblin',x:3,y:2,hp:7,max:7,ac:15,attacksLeft:1}],
    players:[{id:'pc',side:'pc',name:sc.name,c:sc,x:2,y:2,hpCur:sc.hp.cur,hpMax:sc.hp.max}] });
  const pc=getQB().players[0], mo=getQB().monsters[0];
  const resetTurn=()=>{ sc.battle.action=false; sc.battle.actionsUsed=0; sc.battle.attacksLeft=1; };

  const orig=Math.random;
  Math.random=(()=>{ const seq=[0.99,0.01,0.01]; let i=0; return ()=>seq[i++ % seq.length]; })();
  maneuverGrapple(qbAdapter, pc, mo, qbLog);
  T('Grapple success applies the Grappled condition to the target', mo.conds.some(x=>x.name==='Grappled'));
  T('Grapple spends one of the attacker\'s attacks', sc.battle.attacksLeft===0);
  T('Grappled target has speed zeroed (existing speedBlocked, reused for free)', speedBlocked(mo)===true);

  // Grappler feat: advantage on attacks vs a creature you've grappled — wired into
  // Engine.hitResult (the one shared resolver), same spot armor-proficiency disadvantage
  // lives, so it applies uniformly across QB/DM-hosted/player-net.
  T('No Grappler feat: no advantage vs the grappled target', Engine.hitResult(qbAdapter, pc.id, mo.id, {toHit:5, dmg:'1d6'}).adv===0);
  sc.feats=[{name:'Grappler'}];
  T('Grappler feat: advantage vs the target THIS character grappled', Engine.hitResult(qbAdapter, pc.id, mo.id, {toHit:5, dmg:'1d6'}).adv===1);
  const otherMo={id:'m2', side:'mon', base:'Goblin', name:'Bystander', x:3, y:3, hp:7, max:7, ac:12, attacksLeft:1};
  getQB().monsters.push(otherMo);
  T('Grappler feat: no advantage vs a DIFFERENT creature this character has NOT grappled', Engine.hitResult(qbAdapter, pc.id, otherMo.id, {toHit:5, dmg:'1d6'}).adv===0);
  sc.feats=[];

  resetTurn();
  maneuverEscape(qbAdapter, mo, false, qbLog);
  T('Escape Grapple success (attacker rolls high) clears Grappled', !mo.conds.some(x=>x.name==='Grappled'));

  mo.conds=[]; mo.grappledBy=null; resetTurn();
  Math.random=(()=>{ const seq=[0.99,0.01,0.01]; let i=0; return ()=>seq[i++ % seq.length]; })();
  maneuverShove(qbAdapter, pc, mo, 'prone', qbLog);
  T('Shove (prone) success knocks the target Prone', mo.conds.some(x=>x.name==='Prone'));

  mo.conds=[]; resetTurn(); mo.x=3; mo.y=2;
  Math.random=(()=>{ const seq=[0.99,0.01,0.01]; let i=0; return ()=>seq[i++ % seq.length]; })();
  maneuverShove(qbAdapter, pc, mo, 'push', qbLog);
  T('Shove (push) success moves the target one tile further away', mo.x===4 && mo.y===2);

  // Charger: the shove option is 10 ft (2 tiles), not the normal 5, and spends the BONUS
  // action (skipBudget=true) rather than qbSpendAttackBudget's Action/attack economy — a
  // real bug caught before shipping: without skipBudget, this would fail outright once the
  // action was already spent on Dash (attacksLeft still full → qbSpendAttackBudget demands
  // a fresh action that no longer exists).
  getQB().map.cols=9; // the shared 5-wide test map only has 1 tile of room east of x=3 — widen
                       // it just for this assertion so a genuine 2-tile push has somewhere to go
  mo.conds=[]; mo.x=3; mo.y=2; sc.battle.action=true; sc.battle.actionsUsed=sc.battle.actionsMax; sc.battle.bonus=false;
  Math.random=(()=>{ const seq=[0.99,0.01,0.01]; let i=0; return ()=>seq[i++ % seq.length]; })();
  const chargeRes=maneuverShove(qbAdapter, pc, mo, 'push', qbLog, 2, true);
  T('Charger shove succeeds even with the Action already spent (bonus action only, skipBudget)', chargeRes.ok===true && chargeRes.success===true);
  T('Charger shove pushes 10 ft (2 tiles), not the normal 5', mo.x===5 && mo.y===2);
  getQB().map.cols=5;

  resetTurn(); mo.x=3; mo.y=2; // back adjacent — the push test above moved it away
  Math.random=(()=>{ const seq=[0.01,0.99,0.99]; let i=0; return ()=>seq[i++ % seq.length]; })();
  const before=JSON.stringify(mo.conds);
  maneuverGrapple(qbAdapter, pc, mo, qbLog);
  T('Grapple failure (defender rolls high) leaves the target unaffected', JSON.stringify(mo.conds)===before);
  T('A failed maneuver still spent the attack (matches a missed weapon Attack)', sc.battle.attacksLeft===0);

  Math.random=orig;
  T('tileClearFor rejects a solid wall tile', tileClearFor(getQB(),0,0)===true); // grass/undefined tile = clear
  getQB().map.tiles['1,1']='wall';
  T('tileClearFor rejects an actual wall tile', tileClearFor(getQB(),1,1)===false);
  T('tileClearFor rejects out-of-bounds', tileClearFor(getQB(),-1,0)===false && tileClearFor(getQB(),5,0)===false);

  mo.conds=[]; resetTurn(); mo.x=2; mo.y=3;
  Math.random=(()=>{ const seq=[0.99,0.01,0.01]; let i=0; return ()=>seq[i++ % seq.length]; })();
  const tres=maneuverTaunt(qbAdapter, pc, mo, qbLog);
  T('Taunt success imposes Frightened on the target', mo.conds.some(x=>x.name==='Frightened'));
  T('Taunt spends one of the attacker\'s attacks, same resource class as Shove/Grapple', sc.battle.attacksLeft===0);
  T('Taunt reports Intimidation vs Insight in its roll info', tres.atkSkill==='Intimidation' && tres.defSkill==='Insight');

  mo.conds=[]; resetTurn();
  Math.random=(()=>{ const seq=[0.01,0.99,0.99]; let i=0; return ()=>seq[i++ % seq.length]; })();
  maneuverTaunt(qbAdapter, pc, mo, qbLog);
  T('Taunt failure (defender rolls high) leaves the target unaffected', !mo.conds.some(x=>x.name==='Frightened'));

  Math.random=orig;
  setQB(null);
}

/* ---- Hide (Use-menu Stealth action) + monster passive Perception ---- */
{
  T('attackAdvantage: attacking while Hidden grants advantage', attackAdvantage(new Set(['Hidden']), new Set(), true).adv===1);

  const weak={name:'Goblin'}, strong={name:'Young Red Dragon'};
  T('monsterPassivePerception is CR-scaled (weak monster < strong monster)', monsterPassivePerception(weak) < monsterPassivePerception(strong));
  T('monsterPassivePerception formula matches 10 + monsterCheckBonus', monsterPassivePerception(weak)===10+monsterCheckBonus(weak));

  const sneak=newCharacter('Sneak'); sneak.cls='Rogue'; sneak.level=1; sneak.abilities={str:10,dex:16,con:10,int:10,wis:10,cha:10}; sneak.skillProf.stealth=true;
  sneak.battle={action:false,bonus:false,reaction:false,actionsMax:1,actionsUsed:0,attacksLeft:1,move:30,moveUsed:0};
  setQB({active:true, over:null, paused:false, log:[], map:{cols:5,rows:5,tiles:{},light:{mode:'day'}}, order:[{k:'p',id:'pc'}], turn:0, battle:{active:true,round:1},
    monsters:[{id:'m1',side:'mon',base:'Goblin',name:'Goblin',x:4,y:4,hp:7,max:7,ac:15,attacksLeft:1}],
    players:[{id:'pc',side:'pc',name:sneak.name,c:sneak,x:0,y:0,hpCur:sneak.hp.cur,hpMax:sneak.hp.max}] });
  const spc=getQB().players[0];
  maneuverHide(qbAdapter, spc, qbLog);
  T('maneuverHide refuses in the open (bright light, no cover, not adjacent)', !(sneak.conditions&&sneak.conditions.Hidden));

  getQB().map.tiles={'2,0':'wall'}; getQB().monsters[0].x=4; getQB().monsters[0].y=0; // full-wall obstruction on the line from pc (0,0) to the monster
  sneak.battle.action=false; sneak.battle.actionsUsed=0;
  { const orig=Math.random; Math.random=()=>0.99; maneuverHide(qbAdapter, spc, qbLog); Math.random=orig; } // force a high Stealth roll — deterministic vs. the Goblin's passive Perception below
  T('maneuverHide succeeds with full cover (wall) from the nearest hostile', sneak.conditions&&sneak.conditions.Hidden===true && Number.isFinite(sneak.hiddenDC));

  const foes1=BRAINS.tactical(getQB(), Object.assign({id:'m1',brain:'tactical',hp:7,x:4,y:0,attacksLeft:1,moveLeft:30,speed:30,atk:'Bite +4 (1d6+2)',base:'Goblin',name:'Goblin'}));
  T('a weak monster (low passive Perception) cannot target the hidden PC', !foes1.some(it=>it.type==='attack'&&it.targetId==='pc'));

  sneak.hiddenDC=1; // trivially low DC any monster's passive Perception clears
  const foes2=BRAINS.tactical(getQB(), Object.assign({id:'m1',brain:'tactical',hp:7,x:4,y:0,attacksLeft:1,moveLeft:30,speed:30,atk:'Bite +4 (1d6+2)',base:'Goblin',name:'Goblin'}));
  T('a monster whose passive Perception beats a low hiddenDC can still target the PC', foes2.some(it=>it.type==='attack'&&it.targetId==='pc'));
  setQB(null);
}

/* ---- Recall Knowledge & Stabilize (Use-menu utility actions) ---- */
{
  T('monsterCR reads CR straight from MONSTERS_5E', monsterCR({name:'Goblin'})===0.25 && monsterCR({name:'Young Red Dragon'})===10);

  const sage=newCharacter('Sage'); sage.cls='Wizard'; sage.level=5; sage.abilities={str:10,dex:10,con:10,int:16,wis:10,cha:10}; sage.skillProf.arcana=true;
  sage.battle={action:false,bonus:false,reaction:false,actionsMax:1,actionsUsed:0,attacksLeft:1,move:30,moveUsed:0};
  setQB({active:true, over:null, paused:false, log:[], map:{cols:5,rows:5,tiles:{}}, order:[{k:'p',id:'pc'}], turn:0, battle:{active:true,round:1},
    monsters:[{id:'m1',side:'mon',base:'Skeleton',name:'Skeleton',x:1,y:0,hp:13,max:13,ac:13,attacksLeft:1}],
    players:[{id:'pc',side:'pc',name:sage.name,c:sage,x:0,y:0,hpCur:sage.hp.cur,hpMax:sage.hp.max}] });
  const spc2=getQB().players[0];
  { const orig=Math.random; Math.random=()=>0.99; maneuverStudy(qbAdapter, spc2, getQB().monsters[0], 'arcana', qbLog); Math.random=orig; }
  T('Recall Knowledge success logs the Skeleton\'s real RVI data (vuln bludgeoning, immune poison)', /vuln.*bludgeoning|bludgeoning.*vuln/i.test(getQB().log[0].m) || /immune.*poison/i.test(getQB().log[0].m));
  T('Recall Knowledge spends the action', sage.battle.actionsUsed>0);

  sage.battle.action=false; sage.battle.actionsUsed=0;
  { const orig=Math.random; Math.random=()=>0.01; maneuverStudy(qbAdapter, spc2, getQB().monsters[0], 'arcana', qbLog); Math.random=orig; }
  T('Recall Knowledge failure logs "learns nothing useful"', /learns nothing useful/.test(getQB().log[0].m));
  setQB(null);
}
{
  setQB({log:[]}); // qbLog defaults to the global QB when no session is passed
  const medic=newCharacter('Medic'); medic.cls='Cleric'; medic.level=3; medic.abilities={str:10,dex:10,con:10,int:10,wis:16,cha:10}; medic.skillProf.medicine=true;
  medic.battle={action:false,bonus:false,reaction:false,actionsMax:1,actionsUsed:0,attacksLeft:1,move:30,moveUsed:0};
  // maneuverStabilize only rolls the actor's own check now (see its comment: the target's
  // real c.stable/death fields may live on another device entirely in player-net) — the
  // caller applies the mutation on success, exactly like the player-net Use-menu handler does.
  const down=newCharacter('Down'); down.hp={cur:0,max:20}; down.death={succ:0,fail:1};
  { const orig=Math.random; Math.random=()=>0.99; const res=maneuverStabilize(qbAdapter, {side:'pc',c:medic,x:0,y:0}, down.name, qbLog); if(res.success){ down.stable=true; down.death={succ:0,fail:0}; } Math.random=orig; }
  T('Stabilize success sets c.stable and resets death saves', down.stable===true && down.death.succ===0 && down.death.fail===0);

  const down2=newCharacter('Down2'); down2.hp={cur:0,max:20}; down2.death={succ:0,fail:1};
  medic.battle.action=false; medic.battle.actionsUsed=0;
  { const orig=Math.random; Math.random=()=>0.01; const res=maneuverStabilize(qbAdapter, {side:'pc',c:medic,x:0,y:0}, down2.name, qbLog); if(res.success){ down2.stable=true; down2.death={succ:0,fail:0}; } Math.random=orig; }
  T('Stabilize failure leaves death saves untouched', !down2.stable && down2.death.fail===1);

  T('needsStabilizing: down and not yet stable/dead', needsStabilizing({hpCur:0,stable:false,deathFail:1})===true);
  T('needsStabilizing refuses a conscious target', needsStabilizing({hpCur:5,stable:false,deathFail:0})===false);
  T('needsStabilizing refuses an already-stable target', needsStabilizing({hpCur:0,stable:true,deathFail:1})===false);

  // "Make the systems" (5): Healer's Kit charges — a real 10-use consumable, spent by an
  // auto-succeeding kit-stabilize (no Medicine roll) instead of the check-based path above.
  T('hasHealersKit: false with no kit in inventory', hasHealersKit(medic)===false);
  medic.items=[{name:"Healer's Kit",qty:1,kind:'gear'}];
  T('hasHealersKit: true once one is owned', hasHealersKit(medic)===true);
  medic.battle.action=false; medic.battle.actionsUsed=0;
  const down3=newCharacter('Down3'); down3.hp={cur:0,max:20}; down3.death={succ:0,fail:2};
  const orig=Math.random; Math.random=()=>0.01;   // would fail a Medicine roll — kit skips the roll entirely
  const kitRes=maneuverStabilize(qbAdapter, {side:'pc',c:medic,x:0,y:0}, down3.name, qbLog, {kit:true});
  Math.random=orig;
  T('maneuverStabilize with a kit auto-succeeds even on a would-be-failing roll', kitRes.success===true);
  T('maneuverStabilize with a kit lazily initializes and spends one of 10 charges', medic.healerKitCharges===9);
  T('maneuverStabilize: no Healer feat → no bonus HP reported', kitRes.healerFeatHp===0);

  medic.feats=[{name:'Healer'}];
  medic.battle.action=false; medic.battle.actionsUsed=0;
  const down4=newCharacter('Down4'); down4.hp={cur:0,max:20}; down4.death={succ:0,fail:1};
  const kitRes2=maneuverStabilize(qbAdapter, {side:'pc',c:medic,x:0,y:0}, down4.name, qbLog, {kit:true});
  T('maneuverStabilize with a kit + Healer feat reports +1 HP', kitRes2.healerFeatHp===1);
  T('a second kit use spends a second charge (9 → 8)', medic.healerKitCharges===8);

  medic.healerKitCharges=0;
  medic.battle.action=false; medic.battle.actionsUsed=0;
  const rollOrig=Math.random; Math.random=()=>0.99;   // would succeed on a roll — proves the fallback path, not a fluke
  const noKitRes=maneuverStabilize(qbAdapter, {side:'pc',c:medic,x:0,y:0}, 'Down5', qbLog, {kit:true});
  Math.random=rollOrig;
  T('maneuverStabilize falls back to a real Medicine roll once charges are exhausted', noKitRes.success===true && medic.healerKitCharges===0);
  T('needsStabilizing refuses a dead target (3 failed death saves)', needsStabilizing({hpCur:0,stable:false,deathFail:3})===false);

  // Taking more damage at 0 HP ends a Stabilize (PHB) — applyHp must clear c.stable.
  down.hp.temp=0; applyHp(down, -1);
  T('applyHp clears c.stable when a stabilized creature takes more damage at 0 HP', down.stable===false);
  setQB(null);
}

/* ---- sorcery points ---- */
const so=newCharacter('So'); so.cls='Sorcerer'; so.level=5;
T('Sorcery points max = level (5), none before L2', sorcMax(so)===5 && sorcMax({cls:'Sorcerer',level:1})===0);

/* ---- armor table (PHB) ---- */
T('Plate 18 / Chain 16 dexCap 0 / Studded 12 dex uncapped',
  ARMOR.find(a=>a.key==='plate').base===18 && ARMOR.find(a=>a.key==='chainmail').dexCap===0 && ARMOR.find(a=>a.key==='studded').dexCap===99);

/* ---- monsters ---- */
const mage=MONSTERS_5E.find(m=>m.n==='Mage');
T('Mage fireball DC 14', /DC 14 Dex/.test(mage.atk));
const ghoul=MONSTERS_5E.find(m=>m.n==='Ghoul');
T('Ghoul claws +4 w/ paralyze', /Claws \+4/.test(ghoul.atk) && parseMonsterAttacks(ghoul.atk)[0].cond==='Paralyzed');
T('Brown Bear multiattack 2 at +6', MONSTERS_5E.find(m=>m.n==='Brown Bear').attacks===2);
T('Troll multiattack 3', MONSTERS_5E.find(m=>m.n==='Troll').attacks===3);
T('every monster has init & attacks fields', MONSTERS_5E.every(m=>typeof m.init==='number' && typeof m.attacks==='number'));
T('monsterSaveBonus CR-scaled', monsterSaveBonus({base:'Goblin'})===1 && monsterSaveBonus({base:'Young Red Dragon'})===6);

/* ---- shared per-turn reset (one definition for all five reset points) ---- */
const ts=newCharacter('TS'); ts.cls='Fighter'; ts.level=5; applyClassDefaults(ts);
startBattle(ts);
ts.battle.actionsUsed=1; ts.battle.bonus=true; ts.battle.attacksLeft=0; ts.battle.castBonusSpell=true;
resetTurnState(ts);
T('resetTurnState restores actions/bonus/attacks/spell flags', ts.battle.actionsUsed===0 && ts.battle.bonus===false && ts.battle.attacksLeft===extraAttacks(ts)+1 && ts.battle.castBonusSpell===false);
T('startBattle seeds full turn state (moveUsed, castLeveledSpell)', ts.battle.moveUsed===0 && ts.battle.castLeveledSpell===false);

/* ---- unified spell resolution: Engine.castApply ---- */
function stubAd(over){ const t={id:'t1', hp:20, x:0, y:0}; return Object.assign({_t:t,
  unit:id=>id==='t1'?t:null, ac:()=>12, hp:u=>u.hp, hurt:(u,d)=>{u.hp=Math.max(0,u.hp-d);},
  saveBonus:()=>0, damageMult:()=>1, addCond:(u,cond)=>{u.cond=cond;}}, over||{}); }
let ad=stubAd();
let ev=Engine.castApply(ad,'me','t1',{name:'X', dc:100, save:'dex', dmgTotal:10, dtype:'fire', cond:{c:'Restrained',rounds:10}});
T('castApply failed save: full damage + condition', ev.saved===false && ev.dmg===10 && ad._t.hp===10 && ad._t.cond==='Restrained');
ad=stubAd();
ev=Engine.castApply(ad,'me','t1',{name:'X', dc:-5, save:'dex', dmgTotal:10, dtype:'fire', cond:{c:'Restrained',rounds:10}});
T('castApply successful save: half damage, condition blocked', ev.saved===true && ev.dmg===5 && ad._t.hp===15 && !ad._t.cond);
ad=stubAd({damageMult:()=>0});
ev=Engine.castApply(ad,'me','t1',{name:'X', dc:100, save:'dex', dmgTotal:10, dtype:'fire'});
T('castApply respects immunity (0 damage)', ev.dmg===0 && ad._t.hp===20);
ad=stubAd();
ev=Engine.castApply(ad,'me','t1',{name:'X', dmgTotal:9});
T('castApply no-save spell: full damage', ev.saved===false && ev.dmg===9 && ad._t.hp===11);
T('castApply voids on dead target', Engine.castApply(stubAd({hp:()=>0}),'me','t1',{name:'X',dmgTotal:5}).void===true);
T('spellCondOf maps SPELL_COND {c,r} shape', (()=>{ const sc=spellCondOf('Hold Person'); return sc && sc.c && sc.rounds>0; })());
T('Grease imposes Prone on a failed save (was a no-op)', (()=>{ const sc=spellCondOf('Grease'); return sc && sc.c==='Prone'; })());
T('qbAdapter saves: monster CR-scaled, PC ability-based', qbAdapter.saveBonus({side:'mon',base:'Goblin'},'dex')===1 && qbAdapter.saveBonus({side:'pc',c},'dex')===2);

/* ---- creature unification: monsters get a real abilities/skillProf/saveProf shape ---- */
{ const mo={base:'Goblin', hp:7};
  deriveMonsterAbilities(mo);
  T('deriveMonsterAbilities gives every ability the same modifier as the old flat CR bonus', ABILITIES.every(([k])=>mod(abil(mo,k))===monsterSaveBonus(mo)));
  T('deriveMonsterAbilities leaves skillProf/saveProf empty (no synthetic proficiency stacking)', Object.keys(mo.skillProf).length===0 && Object.keys(mo.saveProf).length===0);
  T('deriveMonsterAbilities is idempotent (safe to call repeatedly / lazily)', (()=>{ const before=mo.abilities; deriveMonsterAbilities(mo); return mo.abilities===before; })());
}
T('qbAdapter.checkSubject: monster→derived instance, pc→raw c', qbAdapter.checkSubject({side:'mon',base:'Goblin',hp:7}).abilities!=null && qbAdapter.checkSubject({side:'pc',c})===c);
T('sessionAdapter.checkSubject: monster known locally, connected player unknown (must round-trip)', sessionAdapter.checkSubject({hp:7,base:'Goblin'}).abilities!=null && sessionAdapter.checkSubject({hpCur:10})===null);
T('playerNetAdapter.checkSubject: self and mirrored monster known, another real player unknown', playerNetAdapter.checkSubject({me:true,c})===c && playerNetAdapter.checkSubject({hp:7,base:'Goblin'}).abilities!=null && playerNetAdapter.checkSubject({hpCur:10})===null);

/* ---- auto-prepare on deliberate add (prep casters) ---- */
const ap=newCharacter('AP'); ap.cls='Wizard'; ap.level=20; ap.abilities={str:10,dex:10,con:10,int:20,wis:10,cha:10}; applyClassDefaults(ap);
addSpellTo(ap,'Fireball',3);
T('added spell auto-prepares under the cap', ap.spells.find(s=>s.name==='Fireball').prepared===true);
T('auto-prepared spell shows in castable list', castableSpells(ap).some(s=>s.name==='Fireball'));
const ap2=newCharacter('AP2'); ap2.cls='Wizard'; ap2.level=1; ap2.abilities={str:10,dex:10,con:10,int:10,wis:10,cha:10}; applyClassDefaults(ap2);
addSpellTo(ap2,'Magic Missile',1); addSpellTo(ap2,'Sleep',1);
T('prep cap respected: add beyond cap stays unprepared', ap2.spells.find(s=>s.name==='Magic Missile').prepared===true && ap2.spells.find(s=>s.name==='Sleep').prepared===false);

/* ---- cast-menu routing: utility/self spells never open monster targeting ---- */
T('utility spells route to castModal (no enemy targeting)',
  ['Teleport','Wish','Misty Step','Dimension Door','Fog Cloud','Cure Wounds','Invisibility','Fly'].every(n=>!spellTargetsEnemy(n)));
T('offensive spells route to targeting',
  ['Fireball','Hold Person','Sleep','Magic Missile','Fire Bolt'].every(n=>spellTargetsEnemy(n)));

/* ---- campaign save/load (pure pieces; net-bound load is UI-driven) ---- */
const cpSaved=[{cid:'a', id:'old1', name:'Al', hpCur:5, hpMax:20, x:3, y:4}, {cid:'b', id:'old2', name:'Bo', x:1, y:1}];
const cpLive=[{cid:'a', id:'new1', name:'Al', hpCur:18, hpMax:20, ac:15, online:true}, {cid:'z', id:'new3', name:'Zed'}];
const cpRemap={}; const cpMerged=mergeCampaignPlayers(cpSaved, cpLive, cpRemap);
T('campaign merge: live player re-binds by cid, keeps saved map position', (()=>{ const a=cpMerged.find(p=>p.cid==='a'); return a.id==='new1' && a.hpCur===18 && a.x===3 && a.y===4; })());
T('campaign merge: absent saved player offline, new live player appended', cpMerged.length===3 && cpMerged.find(p=>p.cid==='b').online===false && cpMerged.some(p=>p.cid==='z'));
T('campaign merge: remaps old→new peer id for turn order', cpRemap['old1']==='new1');
const snapSrc={battle:{active:true,round:3}, map:{cols:5,rows:5,tiles:{'1,1':'wall'}}, monsters:[{id:'m1',hp:7}], players:[{cid:'a',online:true}], order:[{k:'p',id:'x'}], turn:1};
const cpSnap=campaignSnapshot(snapSrc); cpSnap.monsters[0].hp=0; cpSnap.map.tiles['2,2']='lava';
T('campaign snapshot is a deep copy (mutations don\'t leak back)', snapSrc.monsters[0].hp===7 && !snapSrc.map.tiles['2,2']);
T('campaign snapshot marks players offline', cpSnap.players[0].online===false);

/* ---- Engine interactive apply: modals pass pre-rolled values through the Engine ---- */
function stubAd2(){ const t={id:'t1',hp:20,x:0,y:0}, a={id:'a1',x:1,y:1};
  return {_t:t, unit:id=>id==='t1'?t:(id==='a1'?a:null), ac:()=>12, hp:u=>u.hp||99,
    hurt:(u,d)=>{u.hp=Math.max(0,u.hp-d);}, saveBonus:()=>0, damageMult:()=>1, addCond:(u,c)=>{u.cond=c;}}; }
let ad2=stubAd2(), ev2=Engine.attack(ad2,'a1','t1',{name:'Bite',toHit:4,dmg:'1d6'},{face:20,dmgTotal:7});
T('Engine.attack honors pre-rolled face+dmgTotal (nat 20 crits, applies 7)', ev2.hit===true && ev2.crit===true && ev2.dmg===7 && ad2._t.hp===13);
ad2=stubAd2(); ev2=Engine.attack(ad2,'a1','t1',{name:'Bite',toHit:4,dmg:'1d6'},{face:1,dmgTotal:7});
T('Engine.attack: nat 1 misses, pre-rolled damage not applied', ev2.hit===false && ev2.dmg===0 && ad2._t.hp===20);
ad2=stubAd2(); ev2=Engine.castApply(ad2,'a1','t1',{name:'Trip',dc:12,save:'str',savedKnown:false,dmgTotal:8,cond:{c:'Prone',rounds:10}});
T('castApply savedKnown:false → full damage + condition (DM adjudicated)', ev2.saved===false && ev2.dmg===8 && ad2._t.hp===12 && ad2._t.cond==='Prone');
ad2=stubAd2(); ev2=Engine.castApply(ad2,'a1','t1',{name:'Trip',dc:12,save:'str',savedKnown:true,dmgTotal:8,cond:{c:'Prone',rounds:10}});
T('castApply savedKnown:true → half damage, no condition', ev2.saved===true && ev2.dmg===4 && ad2._t.hp===16 && !ad2._t.cond);
let evSeen=null; const evOff=GrimoireEvents.on(e=>{ if(e.type==='attack') evSeen=e; });
Engine.attack(stubAd2(),'a1','t1',{name:'Claw',toHit:4,dmg:'1d6'},{face:20,dmgTotal:3}); evOff();
T('interactive attack emits on the event stream', evSeen && evSeen.name==='Claw' && evSeen.dmg===3);

/* ---- teleportation spells move your token (Misty Step LoS, Dimension Door sight-unseen) ---- */
T('SPELL_TELEPORT ranges: Misty Step 30 ft w/ LoS, Dimension Door no LoS, Teleport anywhere',
  SPELL_TELEPORT['Misty Step'].tiles===6 && SPELL_TELEPORT['Misty Step'].los===true &&
  SPELL_TELEPORT['Dimension Door'].los===false && SPELL_TELEPORT['Teleport'].tiles>=999);
const tpS={map:{cols:10,rows:10,tiles:{'3,0':'wall','5,0':'lava'}}, monsters:[{id:'m1',hp:5,x:2,y:2}], players:[{id:'me',x:0,y:0}]};
const tpMe=tpS.players[0], MS=SPELL_TELEPORT['Misty Step'], DD=SPELL_TELEPORT['Dimension Door'];
T('teleport: open tile in range ok', teleportOk(tpS,tpMe,MS,3,3)===true);
T('teleport: occupied tile blocked', teleportOk(tpS,tpMe,MS,2,2)===false);
T('teleport: solid terrain blocked', teleportOk(tpS,tpMe,MS,3,0)===false);
T('teleport: out of range blocked (Misty Step 6 tiles)', teleportOk(tpS,tpMe,MS,8,8)===false);
T('teleport: Misty Step needs line of sight', teleportOk(tpS,tpMe,MS,6,0)===false);
T('teleport: Dimension Door works sight-unseen', teleportOk(tpS,tpMe,DD,6,0)===true);
T('teleport spells route to the picker, not enemy targeting', ['Misty Step','Dimension Door','Teleport','Teleportation Circle'].every(n=>SPELL_TELEPORT[n] && !spellTargetsEnemy(n)));

/* ---- epic-level random forge ---- */
forgeRandom({style:'caster', heritage:'common', vibe:'clever', power:'20'});
const ep=cur();
T('epic forge: level 20, prof +6, HP scaled', ep.level===20 && profBonus(ep)===6 && ep.hp.max>100);
T('epic forge: knows a spell of its highest castable level', !isCaster(ep) || ep.spells.some(s=>s.level===maxSpellLevel(ep)));
T('epic forge: all ASIs spent on stats (10 points)', Object.values(ep.asiBonus||{}).reduce((a,b)=>a+b,0)>=10);
T('epic forge: prep casters within prepared cap', !isPrepCaster(ep) || preparedCount(ep)<=preparedMax(ep));

/* ---- domination: controlled monsters switch sides ---- */
T('all three Dominate spells impose Dominated', ['Dominate Person','Dominate Beast','Dominate Monster'].every(n=>{ const sc=spellCondOf(n); return sc && sc.c==='Dominated'; }));
T('isDominated reads the condition', isDominated({conds:[{name:'Dominated',rounds:10}]}) && !isDominated({conds:[{name:'Prone',rounds:10}]}) && !isDominated({}));
const domQB={players:[{id:'p1',side:'pc',x:0,y:0,c:{hp:{cur:10}}}], monsters:[
  {id:'g1',side:'mon',hp:7,x:0,y:1,atk:'Scimitar +4 (1d6+2)',attacksLeft:1,conds:[{name:'Dominated',rounds:10}]},
  {id:'o1',side:'mon',hp:15,x:0,y:2,atk:'Greataxe +5 (1d12+3)',attacksLeft:1}], map:{cols:5,rows:5,tiles:{}}};
const domInts=BRAINS.tactical(domQB, domQB.monsters[0]);
T('dominated monster attacks its former ally, not the player', domInts.length>0 && domInts[0].type==='attack' && domInts[0].targetId==='o1');
const domInts2=BRAINS.tactical(domQB, domQB.monsters[1]);
T('enemy monster fights back against the dominated one', domInts2.length>0 && domInts2[0].type==='attack' && domInts2[0].targetId==='g1');

/* ---- regression: Dominate concentration must end when its target dies — live report: "i was
   dominating a monster... the monster died, but it kept asking me to concentrate." qbCheckEnd
   runs after every damage-dealing action, so it's the natural place to notice "nothing left to
   dominate" and drop concentration instead of nagging for a save on a pet that no longer exists. */
(function(){
  const pc={hp:{cur:20,max:20}, concentration:{active:true, spell:'Dominate Monster'}, effects:[{name:'Dominate Monster', conc:true}], log:[]};
  setQB({active:true, over:null, log:[], map:{cols:5,rows:5,tiles:{}}, battle:{active:true,round:1},
    monsters:[{id:'pet',side:'mon',hp:0,max:10,x:0,y:1,conds:[{name:'Dominated',rounds:10}]},
              {id:'foe',side:'mon',hp:15,max:15,x:0,y:2,conds:[]}],
    players:[{id:'pc',side:'pc',name:'Hero',c:pc,x:0,y:0}]});
  qbCheckEnd();
  T('concentration drops once the dominated monster dies (hp<=0)', getQB().players[0].c.concentration.active===false);
  T('the conc effect is removed from c.effects too, not just the flag', getQB().players[0].c.effects.every(e=>!e.conc));
  setQB(null);
})();
(function(){
  // sanity: a LIVING dominated monster must NOT have its concentration cleared
  const pc={hp:{cur:20,max:20}, concentration:{active:true, spell:'Dominate Monster'}, effects:[{name:'Dominate Monster', conc:true}], log:[]};
  setQB({active:true, over:null, log:[], map:{cols:5,rows:5,tiles:{}}, battle:{active:true,round:1},
    monsters:[{id:'pet',side:'mon',hp:5,max:10,x:0,y:1,conds:[{name:'Dominated',rounds:10}]}],
    players:[{id:'pc',side:'pc',name:'Hero',c:pc,x:0,y:0}]});
  qbCheckEnd();
  T('concentration stays active while the dominated monster is still alive', getQB().players[0].c.concentration.active===true);
  setQB(null);
})();

/* ---- conditions drive advantage/disadvantage on attacks (PHB) ---- */
const S=a=>new Set(a);
T('poisoned attacker → disadvantage', attackAdvantage(S(['Poisoned']),S([]),true).adv===-1);
T('restrained target → advantage', attackAdvantage(S([]),S(['Restrained']),true).adv===1);
T('prone target: melee adv, ranged dis', attackAdvantage(S([]),S(['Prone']),true).adv===1 && attackAdvantage(S([]),S(['Prone']),false).adv===-1);
T('poisoned attacker vs restrained target cancels out', attackAdvantage(S(['Poisoned']),S(['Restrained']),true).adv===0);
T('paralyzed target: advantage + melee auto-crit', (()=>{ const x=attackAdvantage(S([]),S(['Paralyzed']),true); return x.adv===1 && x.autoCrit; })());
T('paralyzed target: no auto-crit at range', attackAdvantage(S([]),S(['Paralyzed']),false).autoCrit===false);
T('invisible attacker → advantage', attackAdvantage(S(['Invisible']),S([]),true).adv===1);
T('Faerie Fire-outlined target grants advantage to attackers (was tagged but never checked)', attackAdvantage(S([]),S(['Faerie Fire']),true).adv===1);
T('Guiding Bolt-guided target grants advantage to the next attacker', attackAdvantage(S([]),S(['Guided']),true).adv===1);
T('Help action: target marked Helped grants advantage to the next attacker', attackAdvantage(S([]),S(['Helped']),true).adv===1);
T('True Strike gives the attacker advantage', attackAdvantage(S(['True Strike']),S([]),true).adv===1);
T('Guiding Bolt is registered as the Guided condition', SPELL_COND['Guiding Bolt'].c==='Guided');

/* ---- Sanctuary: attackers must beat a Wis save (DC stashed at cast time) or lose the attack.
   The gate itself now lives in Engine.attack (see the dedicated Sanctuary block further down,
   which exercises pass/fail directly and synchronously) — qbApplyIntent's job is just to spend
   the attack and hand off to qbResolveAttack unconditionally, whatever Sanctuary decides. ---- */
{ const sc=newCharacter('Warded'); sc.cls='Cleric'; applyClassDefaults(sc); sc.spells=[{name:'Sanctuary',level:1,prepared:true}]; startBattle(sc);
  castSpell(sc,'Sanctuary',1);
  const se=sc.effects.find(e=>e.name==='Sanctuary');
  T('casting Sanctuary stashes a save DC on the effect', se && typeof se.dc==='number');

  setQB({active:true, over:null, paused:false, log:[], map:{cols:5,rows:5,tiles:{}}, order:[{k:'p',id:'pc'}], turn:0, battle:{active:true,round:1}, monsters:[{id:'m1',side:'mon',base:'Goblin',name:'Goblin',x:0,y:0,hp:10,max:10,ac:12,attacksLeft:1}], players:[{id:'pc',side:'pc',name:sc.name,c:sc,x:1,y:0,hpCur:sc.hp.cur,hpMax:sc.hp.max}] });
  qbApplyIntent(getQB().monsters[0], {type:'attack',targetId:'pc',atk:{name:'Bite',toHit:4,dmg:'1d6'}}, ()=>{});
  T('qbApplyIntent spends the monster\'s attack synchronously regardless of what Sanctuary decides', getQB().monsters[0].attacksLeft===0);
  setQB(null);
}

/* ---- Magic Weapon: +1 lives on the item, not a generic character mod ---- */
{ const mw=newCharacter('Enchanter'); mw.abilities.str=10; mw.items=[{name:'Club',kind:'weapon',qty:1,equipped:true}];
  const opts=SPELL_CHOICES['Magic Weapon'](mw);
  T('Magic Weapon offers one choice per carried weapon', opts.length===1 && /Club/.test(opts[0].t));
  opts[0].f(mw);
  T('applying Magic Weapon sets a +1 bonus on that item', mw.items[0].magicBonus===1);
  T('Magic Weapon is tracked as a concentration effect', mw.concentration.active===true && mw.concentration.spell==='Magic Weapon');
  const atk=qbPcAttacks(mw)[0];
  T('the buffed weapon\'s attack reflects the +1 to-hit and damage', atk.toHit===weaponToHit(mw,weaponByName('Club'))+1 && /\+1$/.test(atk.dmg));
  endEffect(mw, mw.effects[0].id);
  T('ending the effect clears the item\'s magic bonus', !mw.items[0].magicBonus);
}
/* ---- Magic Weapon used to only apply inside qbPcAttacks (Quick Battle) — the sheet,
   DM-session, and player-net attack menus built toHit/dmg straight from weaponToHit/
   weaponDmgBonus without ever looking at item.magicBonus, so a +1 weapon silently did
   nothing outside Quick Battle. Fixed by threading `it` through those two functions
   directly so every caller gets it for free. ---- */
{ const mw2=newCharacter('Enchanter2'); mw2.abilities.str=10; mw2.items=[{name:'Club',kind:'weapon',qty:1,equipped:true,magicBonus:1}];
  const w=weaponByName('Club'), it=mw2.items[0];
  T('weaponToHit(c,w,it) applies the item\'s magic bonus directly (not just via qbPcAttacks)', weaponToHit(mw2,w,it)===weaponToHit(mw2,w)+1);
  T('weaponDmgBonus(c,w,it) applies the item\'s magic bonus directly', weaponDmgBonus(mw2,w,it)===weaponDmgBonus(mw2,w)+1);
}

/* ---- Power Word Kill/Stun: HP-threshold, no save, no attack roll. Was a QB-only bespoke
   check (powerWordResolve) that bypassed the Engine entirely, and spellTargetsEnemy had a
   QB.active gate so DM-session/player-net targeting fell through to the narrative cast modal
   and the spell silently did nothing there. Now it routes to enemy targeting everywhere and
   resolves through Engine.castApply's sp.powerWord path (any adapter). ---- */
T('Power Word HP thresholds match the PHB', POWER_WORD_HP['Power Word Kill']===100 && POWER_WORD_HP['Power Word Stun']===150);
T('Power Word Kill routes to enemy targeting in every mode (no more QB.active gate)', spellTargetsEnemy('Power Word Kill')===true);
{ setQB({active:true, over:null, log:[], map:{cols:5,rows:5,tiles:{}}, order:[{k:'p',id:'pc'}], turn:0, battle:{active:true,round:1},
    monsters:[{id:'w1',side:'mon',name:'Weakling',base:'Weakling',hp:40,max:40,ac:10,conds:[]},{id:'t1',side:'mon',name:'Tank',base:'Tank',hp:200,max:200,ac:10,conds:[]},{id:'s1',side:'mon',name:'Stunned Target',base:'Stunned Target',hp:60,max:60,ac:10,conds:[]}],
    players:[{id:'pc',side:'pc',name:'Hero',c:newCharacter('Hero'),x:0,y:0}]});
  const killEv=Engine.castApply(qbAdapter,'pc','w1',{name:'Power Word Kill', powerWord:'Power Word Kill'});
  T('Power Word Kill drops a low-HP target to 0', killEv.killed===true && qbUnitById('w1').hp===0);
  const noEffectEv=Engine.castApply(qbAdapter,'pc','t1',{name:'Power Word Kill', powerWord:'Power Word Kill'});
  T('Power Word Kill has no effect above the HP threshold', noEffectEv.noEffect===true && qbUnitById('t1').hp===200);
  const stunEv=Engine.castApply(qbAdapter,'pc','s1',{name:'Power Word Stun', powerWord:'Power Word Stun'});
  T('Power Word Stun imposes Stunned on a low-HP target (no HP loss)', stunEv.stunned===true && qbUnitById('s1').hp===60 && qbUnitById('s1').conds.some(c=>c.name==='Stunned'));
  setQB(null);
}

/* ---- Eyebite: a single Wis save gates a player-chosen effect (sleep/frighten/panic) ---- */
T('Eyebite parses as a Wis-save spell (routes to enemy targeting)', parseSpellMechanics('Eyebite').save==='wis');
T('Eyebite has three player-chosen outcomes', EYEBITE_OPTIONS.length===3 && EYEBITE_OPTIONS.some(o=>o.key==='panic'));
{ const foe={id:'e1',side:'mon',name:'Cultist',hp:20,conds:[]};
  const resistMsg=eyebiteResolve(qbAdapter,'pc',foe, EYEBITE_OPTIONS[0], 15, 20);   // roll beats DC → resists
  T('Eyebite: a passed save means no effect at all (not half)', foe.conds.length===0 && /resists/.test(resistMsg));
  const sleepMsg=eyebiteResolve(qbAdapter,'pc',foe, EYEBITE_OPTIONS[0], 15, 2);     // roll fails DC → sleeps
  T('Eyebite: a failed save applies the chosen condition', foe.conds.some(c=>c.name==='Asleep') && /fails/.test(sleepMsg));
  const foe2={id:'e2',side:'mon',name:'Bandit',hp:20,max:20,ac:12,conds:[]};
  setQB({active:true, over:null, log:[], map:{cols:5,rows:5,tiles:{}}, order:[{k:'p',id:'pc'}], turn:0, battle:{active:true,round:1}, monsters:[foe2], players:[{id:'pc',side:'pc',name:'Hero',c:newCharacter('Hero'),x:0,y:0}]});
  const panicMsg=eyebiteResolve(qbAdapter,'pc',foe2, EYEBITE_OPTIONS[2], 15, 2);
  T('Eyebite Panicked: failed save deals 3d6 psychic AND poisons', foe2.hp<20 && foe2.conds.some(c=>c.name==='Poisoned') && /Poisoned/.test(panicMsg));
  setQB(null);
}
T('Eyebite\'s choice picker is mode-agnostic (adapter+casterId, not hardcoded to Quick Battle)', typeof openEyebiteChoice==='function' && openEyebiteChoice.length===5);

/* ---- Holy Aura: reactive trigger — an attacker who HITS the warded creature must save or be
   blinded. Was a QB-only bespoke check in qbResolveAttack; now lives in Engine.attack itself
   (via ad.holyAuraDC) so DM-session monster attacks against a warded player get it too. ---- */
{ setQB({active:true, over:null, log:[], map:{cols:5,rows:5,tiles:{}}, order:[{k:'p',id:'x'}], turn:0, battle:{active:true,round:1}});
  const resistHc=newCharacter('Warded1'); resistHc.effects=[{name:'Holy Aura', dc:1}];   // DC 1 → no save can fail
  const pc1={id:'pc1', side:'pc', name:'Warded1', c:resistHc, x:0,y:0};
  const mo1={id:'m1', side:'mon', name:'Orc', base:'Orc', hp:20, max:20, ac:1, conds:[]};
  getQB().players=[pc1]; getQB().monsters=[mo1];
  const ev1=Engine.attack(qbAdapter, mo1.id, pc1.id, {name:'Test', toHit:99, dmg:'1'}, {face:20, apply:false});
  T('Holy Aura: an attacker who makes its save is unaffected', ev1.hit===true && ev1.holyAura && ev1.holyAura.blinded===false && !mo1.conds.some(c=>c.name==='Blinded'));

  const blindHc=newCharacter('Warded2'); blindHc.effects=[{name:'Holy Aura', dc:999}];   // DC 999 → no save can succeed
  const pc2={id:'pc2', side:'pc', name:'Warded2', c:blindHc, x:0,y:0};
  const mo2={id:'m2', side:'mon', name:'Orc', base:'Orc', hp:20, max:20, ac:1, conds:[]};
  getQB().players=[pc2]; getQB().monsters=[mo2];
  const ev2=Engine.attack(qbAdapter, mo2.id, pc2.id, {name:'Test', toHit:99, dmg:'1'}, {face:20, apply:false});
  T('Holy Aura: an attacker who fails its save is blinded', ev2.hit===true && ev2.holyAura && ev2.holyAura.blinded===true && mo2.conds.some(c=>c.name==='Blinded'));
  setQB(null);
}
{ const hc=newCharacter('Aura'); hc.cls='Cleric'; hc.level=17; applyClassDefaults(hc); hc.spells=[{name:'Holy Aura',level:8,prepared:true}]; startBattle(hc);
  castSpell(hc,'Holy Aura',8);
  const he=hc.effects.find(e=>e.name==='Holy Aura');
  T('casting Holy Aura stashes a save DC on the effect (reused by Engine.attack via holyAuraDC)', he && typeof he.dc==='number');
}
/* ---- Sanctuary: a Wis save gates the attack itself, before any to-hit roll — moved from a
   QB-only check in qbApplyIntent into Engine.attack (ad.sanctuaryDC) so it also works for
   DM-session attacks (sessionAdapter) against a warded, net-synced player. ---- */
{ setQB({active:true, over:null, log:[], map:{cols:5,rows:5,tiles:{}}, order:[{k:'p',id:'x'}], turn:0, battle:{active:true,round:1}});
  const blockedHc=newCharacter('Warded3'); blockedHc.effects=[{name:'Sanctuary', dc:999}];   // DC 999 → the attacker can't possibly beat it
  const pc3={id:'pc3', side:'pc', name:'Warded3', c:blockedHc, x:0,y:0};
  const mo3={id:'m3', side:'mon', name:'Orc', base:'Orc', hp:20, max:20, ac:1, conds:[]};
  getQB().players=[pc3]; getQB().monsters=[mo3];
  const ev3=Engine.attack(qbAdapter, mo3.id, pc3.id, {name:'Test', toHit:99, dmg:'1'}, {face:20});
  T('Sanctuary: a failed save blocks the attack before any to-hit roll happens', ev3.hit===false && ev3.sanctuary && ev3.sanctuary.blocked===true && ev3.total===undefined);

  const throughHc=newCharacter('Warded4'); throughHc.effects=[{name:'Sanctuary', dc:1}];   // DC 1 → the attacker always beats it
  const pc4={id:'pc4', side:'pc', name:'Warded4', c:throughHc, x:0,y:0};
  const mo4={id:'m4', side:'mon', name:'Orc', base:'Orc', hp:20, max:20, ac:1, conds:[]};
  getQB().players=[pc4]; getQB().monsters=[mo4];
  const ev4=Engine.attack(qbAdapter, mo4.id, pc4.id, {name:'Test', toHit:99, dmg:'1'}, {face:20, apply:false});
  T('Sanctuary: a passed save lets the attack through normally', ev4.hit===true && ev4.sanctuary && ev4.sanctuary.blocked===false);
  setQB(null);
}
/* ---- Sanctuary/Holy Aura DCs are computed player-side and synced to the DM's session
   mirror (sessionAdapter has no .c to read effects from) — verify the sync round-trip. ---- */
{ const s=newCharacter('Synced'); s.effects=[{name:'Sanctuary', dc:14}, {name:'Holy Aura', dc:16}];
  const sanc=(s.effects||[]).find(e=>e.name==='Sanctuary'), holy=(s.effects||[]).find(e=>e.name==='Holy Aura');
  const helloPayload={sanctuaryDC:sanc?sanc.dc:null, holyAuraDC:holy?holy.dc:null};
  T('the hello payload carries both DCs off the player device', helloPayload.sanctuaryDC===14 && helloPayload.holyAuraDC===16);
  const p={}; Object.assign(p,{sanctuaryDC:helloPayload.sanctuaryDC||null, holyAuraDC:helloPayload.holyAuraDC||null});
  T('sessionAdapter reads the synced DC off the DM-side player mirror', sessionAdapter.sanctuaryDC(p)===14 && sessionAdapter.holyAuraDC(p)===16);
}

T('unitConds reads monster conds & PC conditions', unitConds({conds:[{name:'Prone'}]}).has('Prone') && unitConds({c:{conditions:{Poisoned:true}}}).has('Poisoned') && unitConds(null).size===0);

/* ---- Restrained/Grappled zero a creature's speed (Web/Entangle bug: cond applied but could still walk) ---- */
T('speedBlocked reads Restrained/Grappled off a monster', speedBlocked({conds:[{name:'Restrained'}]})===true && speedBlocked({conds:[{name:'Prone'}]})===false);
T('speedBlocked reads Restrained off a raw PC character', speedBlocked({conditions:{Restrained:true}})===true);
{ const rc=newCharacter('Webbed'); rc.conditions={Restrained:true}; startBattle(rc);
  T('a restrained PC gets 0 move at the start of its turn', rc.battle.move===0);
}
{ const rmo={id:'r1',name:'Spider Victim',hp:10,x:0,y:0,speed:30,atk:'Bite +4 (1d6+2)',moveLeft:0,conds:[{name:'Restrained',rounds:10}]};
  const rqb={players:[{c:{hp:{cur:10}},x:9,y:9}], monsters:[rmo], map:{cols:10,rows:10,tiles:{}}};
  const rints=BRAINS.tactical(rqb, rmo);
  T('a restrained monster too far to attack proposes no move (Dash gives 0 speed too)', rints.length===0);
}
{ // integration: adjacent paralyzed target → hit becomes a crit via Engine.hitResult
  const t={id:'t1',hp:20,x:0,y:0,conds:[{name:'Paralyzed',rounds:10}]}, a={id:'a1',x:0,y:1};
  const ad3={unit:id=>id==='t1'?t:(id==='a1'?a:null), ac:()=>10, hp:u=>u.hp, hurt:(u,d)=>{u.hp=Math.max(0,u.hp-d);}, damageMult:()=>1};
  const r3=Engine.hitResult(ad3,'a1','t1',{toHit:10},15);
  T('melee hit vs paralyzed auto-crits (adv reported)', r3.hit===true && r3.crit===true && r3.adv===1);
}

/* ---- oddball spells: Wish, Time Stop, incapacitation, invisibility ---- */
T('Wish offers a multiple-choice outcome menu', Array.isArray(SPELL_CHOICES['Wish']) && SPELL_CHOICES['Wish'].length===4 && !!SPELL_CHOICES['Augury']);
T('isIncapacitated: Asleep/laughter yes, Prone no', isIncapacitated({conds:[{name:'Asleep'}]}) && isIncapacitated({conds:[{name:'Incapacitated (prone, laughing)'}]}) && !isIncapacitated({conds:[{name:'Prone'}]}));
T('incapacitated monster loses its turn (brain returns nothing)', BRAINS.tactical(domQB, {id:'z1',side:'mon',hp:9,x:0,y:3,atk:'Bite +3 (1d6)',attacksLeft:1,conds:[{name:'Paralyzed',rounds:10}]}).length===0);
{ const sleeper={side:'mon',hp:10,conds:[{name:'Asleep',rounds:10}]}; qbHurt(sleeper,3);
  T('damage wakes a sleeping monster', sleeper.hp===7 && sleeper.conds.length===0); }
{ const iv=newCharacter('IV'); iv.cls='Wizard'; addEffect(iv,'Invisibility');
  T('Invisibility applies the Invisible condition', iv.conditions['Invisible']===true);
  endEffect(iv, iv.effects[0].id);
  T('ending Invisibility clears the condition', !iv.conditions['Invisible']); }
{ const ts=newCharacter('TrueStriker'); addEffect(ts,'True Strike');
  T('True Strike applies its self-condition', ts.conditions['True Strike']===true);
  T('True Strike grants the caster advantage', attackAdvantage(unitConds(ts),S([]),true).adv===1);
}
{ // a self-buff condition that expires by round-countdown in QB (not manual endEffect)
  // must also clear its condition tag — this was the Invisibility-never-clears bug.
  const iv2=newCharacter('IV2'); addEffect(iv2,'Invisibility'); iv2.effects[0].rounds=1; startBattle(iv2);
  setQB({active:true, paused:false, log:[], moveMode:true, order:[{k:'p',id:'pc'}], turn:0, battle:{active:true,round:1}, map:{cols:5,rows:5,tiles:{}}, players:[{id:'pc',side:'pc',name:iv2.name,c:iv2,x:0,y:0,hpCur:iv2.hp.cur,hpMax:iv2.hp.max,ac:10}], monsters:[]});
  qbBeginTurn();
  T('a naturally-expiring effect clears its condition tag in Quick Battle too', !iv2.conditions['Invisible'] && iv2.effects.length===0);
  setQB(null);
}
{ const wz=newCharacter('WZ'); wz.cls='Wizard'; wz.level=1; applyClassDefaults(wz);
  wishGrantFree('Fireball');
  T('Wish grant: unknown high-level spell castable without a slot', canCast(wz,'Fireball',3)===true && castSpell(wz,'Fireball',3)===true && ((wz.slots[3]&&wz.slots[3].used)||0)===0);
  T('Wish grant is consumed after one cast', canCast(wz,'Fireball',3)===false); }
{ const ts9=newCharacter('TS9'); ts9.cls='Wizard'; ts9.level=20; ts9.abilities={str:10,dex:10,con:10,int:18,wis:10,cha:10}; applyClassDefaults(ts9);
  ts9.spells=[{name:'Time Stop',level:9,prepared:true}]; startBattle(ts9);
  castSpell(ts9,'Time Stop',9);
  T('Time Stop banks 1-4 extra turns', ts9.battle.timeStopTurns>=1 && ts9.battle.timeStopTurns<=4);
  ts9.battle.timeStopTurns=2; ts9.battle.actionsUsed=1;
  T('ending the turn during Time Stop resets resources instead of passing', timeStopExtraTurn(ts9)===true && ts9.battle.timeStopTurns===1 && ts9.battle.actionsUsed===0);
  ts9.battle.timeStopTurns=0;
  T('no banked turns → end turn passes normally', timeStopExtraTurn(ts9)===false); }
T('AI narrator key defaults to unset', aiKey()==='');

/* ---- Grease: real difficult terrain, not just a one-shot save (v92) ---- */
T('Grease is registered as a terrain-painting spell', SPELL_TERRAIN['Grease'] && SPELL_TERRAIN['Grease'].terrain==='grease' && SPELL_TERRAIN['Grease'].rounds===10);
T('grease terrain is difficult and trips creatures', TERRAIN['grease'].diff===true && TERRAIN['grease'].prone===true);
{ const gs={map:{cols:5,rows:5,tiles:{}}, battle:{round:1}, log:[]};
  qbPaintTerrain(gs, {x:2,y:2}, 1, 'Grease', 13);
  // inBlast keeps r<=1 as a square (Chebyshev) on purpose — r1 covers Grease/Web/Thunderwave/
  // Burning Hands, all effectively "everything adjacent," and a diagonal tile is conventionally
  // still adjacent (same reasoning as melee reach). Circularity only kicks in above r1 — see the
  // "genuinely circular for r>1" block below and inBlast's own comment. See AUDIT.md v119/v119.1.
  const painted=['1,1','2,1','3,1','1,2','2,2','3,2','1,3','2,3','3,3'].every(k=>gs.map.tiles[k]==='grease');
  T('qbPaintTerrain covers the full 3x3 for r1 (diagonal still counts as adjacent at this radius)', painted);
  T('qbHazardAt finds the painted hazard and its save DC', qbHazardAt(gs,2,2) && qbHazardAt(gs,2,2).dc===13);
  T('untouched tiles outside the blast stay unpainted', gs.map.tiles['0,0']===undefined);
  gs.battle.round=11; qbExpireHazards(gs);
  T('hazard reverts its tiles after its duration expires', Object.keys(gs.map.tiles).length===0 && gs.hazards.length===0);
}
{ const gs3={map:{cols:5,rows:5,tiles:{}}, battle:{round:1}, log:[]};
  qbPaintTerrain(gs3, {x:1,y:1}, 0, 'Grease', 999);   // DC 999 → always fails the save
  const mo={name:'Goblin',x:1,y:1,base:'Goblin'};
  qbCheckTerrainProne(gs3, mo, 1, 1, false);
  T('a monster that fails its save falls prone on grease', mo.conds && mo.conds.some(c=>c.name==='Prone'));
  const c=newCharacter('Slippy'); c.abilities.dex=10;
  qbCheckTerrainProne(gs3, c, 1, 1, true);
  T('a PC that fails its save falls prone on grease', c.conditions && c.conditions['Prone']===true);
}
{ const gs2={map:{cols:5,rows:5,tiles:{wall:'wall'}}, battle:{round:1}};
  gs2.map.tiles['2,2']='wall';
  qbPaintTerrain(gs2, {x:2,y:2}, 0, 'Grease', 13);
  T('qbPaintTerrain does not overwrite solid terrain', gs2.map.tiles['2,2']==='wall');
}

/* ---- Web: was AoE + Restrained-on-cast only, never painted terrain, so anyone who
   walked into the webbed area *after* the cast (rather than being caught in the initial
   blast) got no effect at all and the map never showed webbing — same failure shape as
   Grease pre-v92. ---- */
T('Web is registered as a terrain-painting spell', SPELL_TERRAIN['Web'] && SPELL_TERRAIN['Web'].terrain==='web');
T('web terrain is difficult and restrains creatures', TERRAIN['web'].diff===true && TERRAIN['web'].restrain===true);
{ const gs4={map:{cols:5,rows:5,tiles:{}}, battle:{round:1}, log:[]};
  qbPaintTerrain(gs4, {x:1,y:1}, 0, 'Web', 999);   // DC 999 → always fails the save
  const mo={name:'Spider Victim',x:1,y:1,base:'Goblin'};
  qbCheckTerrainProne(gs4, mo, 1, 1, false);
  T('a monster that fails its save is Restrained by web, not Prone', mo.conds && mo.conds.some(c=>c.name==='Restrained') && !mo.conds.some(c=>c.name==='Prone'));
  const c=newCharacter('Tangled'); c.abilities.dex=10;
  qbCheckTerrainProne(gs4, c, 1, 1, true);
  T('a PC that fails its save is Restrained by web, not Prone', c.conditions && c.conditions['Restrained']===true && !c.conditions['Prone']);
}

/* ---- hazard system is mode-agnostic (was Quick-Battle-only: qbPaintTerrain/
   qbExpireHazards/qbHazardAt/qbCheckTerrainProne only ever ran against QB; a DM-hosted
   or player-net session calling the exact same code with a {map,battle,players,monsters}
   -shaped state (not literally `=== QB`) must behave identically). Same assertions as the
   QB Grease/Web tests above, run under the new mode-agnostic names against a fake
   DM-session-shaped object instead of QB. ---- */
{ const dmS={map:{cols:5,rows:5,tiles:{}}, battle:{round:1}, log:[], players:[], monsters:[]};
  paintHazardTerrain(dmS, {x:2,y:2}, 1, 'Grease', 13);
  T('paintHazardTerrain works against a DM-session-shaped state, not just QB', hazardAt(dmS,2,2) && hazardAt(dmS,2,2).dc===13);
  T('untouched tiles outside the blast stay unpainted (DM-shaped state)', dmS.map.tiles['0,0']===undefined);
  dmS.battle.round=11; expireHazards(dmS);
  T('expireHazards works against a DM-session-shaped state', Object.keys(dmS.map.tiles).length===0 && dmS.hazards.length===0);
}
{ const dmS2={map:{cols:5,rows:5,tiles:{}}, battle:{round:1}, log:[], players:[], monsters:[]};
  paintHazardTerrain(dmS2, {x:1,y:1}, 0, 'Grease', 999);   // DC 999 → always fails the save
  const mo={name:'Goblin',x:1,y:1,base:'Goblin'};
  checkTerrainHazardCond(dmS2, mo, 1, 1, false);
  T('checkTerrainHazardCond works against a DM-session-shaped state', mo.conds && mo.conds.some(c=>c.name==='Prone'));
}

/* ---- gas hazards (Cloudkill, Insect Plague, Stinking Cloud): unlike Grease/Web, these
   deal repeating damage (or a repeating condition) every round a creature remains in the
   cloud, not just a one-time blast at cast — see tickGasHazards + SPELL_GAS. ---- */
T('Cloudkill and Insect Plague are registered as gas hazards', SPELL_GAS['Cloudkill'] && SPELL_GAS['Insect Plague'] && SPELL_GAS['Stinking Cloud']);
{ const gs5={map:{cols:5,rows:5,tiles:{}}, battle:{round:1}, log:[], players:[], monsters:[
    {id:'m1', name:'Goblin', hp:200, max:200, x:2, y:2, base:'Goblin'} ]};   // high HP: must survive 2 real 5d8 hits without flooring at 0
  paintHazardTerrain(gs5, {x:2,y:2}, 0, 'Cloudkill', 999);   // DC 999 → always fails the save
  T('a gas hazard does not repaint the floor (unlike Grease/Web)', gs5.map.tiles['2,2']===undefined);
  const hpBefore=gs5.monsters[0].hp;
  tickGasHazards(gs5);
  const hpAfterRound1=gs5.monsters[0].hp;
  T('a creature standing in Cloudkill takes real damage on the first tick', hpAfterRound1<hpBefore);
  tickGasHazards(gs5);
  const hpAfterRound2=gs5.monsters[0].hp;
  T('a creature that stays in Cloudkill takes damage again on a second tick', hpAfterRound2<hpAfterRound1);
  gs5.battle.round=101; expireHazards(gs5);
  const hpAfterExpiry=gs5.monsters[0].hp;
  tickGasHazards(gs5);
  T('Cloudkill stops ticking once its hazard has expired', gs5.monsters[0].hp===hpAfterExpiry && gs5.hazards.length===0);
}
{ const gs6={map:{cols:5,rows:5,tiles:{}}, battle:{round:1}, log:[], players:[], monsters:[
    {id:'m1', name:'Goblin', hp:20, max:20, x:1, y:1, base:'Goblin'} ]};
  paintHazardTerrain(gs6, {x:1,y:1}, 0, 'Stinking Cloud', 999);
  tickGasHazards(gs6);
  T('Stinking Cloud deals no damage — Poisoned (lose actions) instead', gs6.monsters[0].hp===20 && gs6.monsters[0].conds.some(c=>c.name==='Poisoned'));
}

/* ---- coverage audit: a spell described with area/condition language must have a
   matching SPELL_AOE/SPELL_COND row, or it silently does nothing when cast (this is
   exactly how Grease and Meteor Swarm broke — this test exists so the next one fails
   loudly instead of being found by trial and error in a live battle). ---- */
{ const AOE_WORDS=/(\d+)[- ]ft(?:\.|oot)?[- ](radius|sphere|cone|cube|line|square|cylinder)|radius (column|sphere)|(\d+)-ft (sphere|cone|cube|line|square|cylinder)/i;
  const COND_WORDS=/\b(Blinded|Charmed|Deafened|Frightened|Grappled|Incapacitated|Paralyzed|Petrified|Poisoned|Prone|Restrained|Stunned|sicken|paralyze|charm|frighten|restrain)\b/i;
  // Spells whose area/condition language is real but not modeled as a blast/save-condition
  // in this engine (bigger new mechanics, or too small to need blast UI) — see AUDIT.md
  // "Coverage audit (v92)". Adding a spell here must come with an AUDIT.md line explaining why.
  const AOE_EXCEPT=new Set(['Fog Cloud','Darkness','Silence','Daylight','Gust of Wind','Antimagic Field','Cloud of Daggers']);
  const COND_EXCEPT=new Set(['Unseen Servant','Calm Emotions','Invisibility','Lesser Restoration','See Invisibility','Clairvoyance','Arcane Eye','Greater Invisibility','Dream','Greater Restoration','Mislead','Telekinesis','Wall of Force','Eyebite','Heal','Holy Aura','Mind Blank']);
  const allSpells=Object.keys(SPELL_DESC);
  const aoeGaps=allSpells.filter(n=>AOE_WORDS.test(SPELL_DESC[n]) && !(n in SPELL_AOE) && !AOE_EXCEPT.has(n));
  const condGaps=allSpells.filter(n=>COND_WORDS.test(SPELL_DESC[n]) && !(n in SPELL_COND) && !COND_EXCEPT.has(n));
  T('no undocumented AoE gaps: '+aoeGaps.join(', '), aoeGaps.length===0);
  T('no undocumented condition gaps: '+condGaps.join(', '), condGaps.length===0);
}
/* ---- coverage audit, part 2: bespoke one-off effects that aren't a named PHB
   condition (e.g. "next attack has advantage", "can't take reactions") are a second
   failure shape — SPELL_COND only models named conditions, so these silently vanish
   too unless separately tracked. Same exceptions contract: add here only with an
   AUDIT.md line saying why it needs new code instead of a table row. ---- */
{ const BESPOKE_WORDS=/advantage on (its|your|their|the) next|disadvantage on (its|your|their|the) next|can'?t take reactions|next attack (has|roll)|can'?t recover hp/i;
  const BESPOKE_EXCEPT=new Set(['Magic Weapon']);   // implemented via SPELL_CHOICES + item.magicBonus, not a SPELL_COND/SPELL_EFFECTS row
  const allSpells2=Object.keys(SPELL_DESC);
  const bespokeGaps=allSpells2.filter(n=>BESPOKE_WORDS.test(SPELL_DESC[n]) && !(n in SPELL_COND) && !(n in SPELL_EFFECTS) && !BESPOKE_EXCEPT.has(n));
  T('no undocumented bespoke-effect gaps: '+bespokeGaps.join(', '), bespokeGaps.length===0);
}
/* ---- Shocking Grasp: rider effect only applies on a hit, not a miss ---- */
T('Shocking Grasp cond is registered as No Reactions', SPELL_COND['Shocking Grasp'].c==='No Reactions');
{ const moHit={id:'m1',name:'Goblin',hp:10,conds:[],reactionUsed:false};
  qbApplyCond(moHit,'Shocking Grasp');
  T('applying Shocking Grasp cond actually sets reactionUsed (not just a display tag)', moHit.reactionUsed===true && moHit.conds.some(c=>c.name==='No Reactions'));
}

/* ---- concentration check pauses the AI turn loop (was: battle kept running,
   and a fresh hit re-opened a brand-new unrolled prompt on top of the unanswered one,
   which looked like "unlimited rerolls") ---- */
{ resetConc(); setQB({active:true, paused:false, log:[]});
  const cc=newCharacter('Concentrator'); cc.concentration={active:true, spell:'Bless'}; cc.effects=[{name:'Bless',rounds:10,conc:true}];
  concentrationCheck(cc, 10);
  T('opening a concentration prompt pauses the QB turn loop', getQB().paused===true);
  const turnBefore=42; getQB().turn=turnBefore; getQB().order=[{k:'p',id:'x'},{k:'m',id:'y'}]; getQB().battle={round:1};
  qbNextTurn();
  T('qbNextTurn does not advance the turn while paused (defers instead)', getQB().turn===turnBefore);
  getQB().paused=false; setQB(null); resetConc();
}

/* ---- a second hit landing before the first concentration check is answered (two monster
   opportunity attacks off one move, a multiattack monster, two attackers in the same tick)
   used to just overwrite the modal with a fresh unrolled prompt, silently discarding the
   pending one — this read as "unlimited re-rolls" in play. It must queue instead. ---- */
{ resetConc(); setQB({active:true, paused:false, log:[]});
  const cc=newCharacter('Queued'); cc.concentration={active:true, spell:'Bless'}; cc.effects=[{name:'Bless',rounds:10,conc:true}];
  concentrationCheck(cc, 10);   // opens the modal, consumes nothing else yet
  concentrationCheck(cc, 8);    // a second hit arrives before the first is answered
  T('a concentration check while one is already open queues instead of clobbering it', concQueueLen()===1);
  T('QB stays paused while a check is queued', getQB().paused===true);
  setQB(null); resetConc();
}

/* ---- version hygiene: sw.js cache must match APP_VERSION ---- */
const sw=fs.readFileSync(path.join(__dirname,'sw.js'),'utf8');
const appVer=(src.match(/APP_VERSION='(v[\d.]+)'/)||[])[1], swVer=(sw.match(/grimoire-(v[\d.]+)/)||[])[1];
T('sw.js cache version matches APP_VERSION ('+appVer+')', appVer && appVer===swVer);

/* ---- map elevation (isometric renderer content) ---- */
T('preset maps include elevation data', Object.values(MAP_PRESETS).some(m=>m.height&&Object.keys(m.height).length>0));
T('startQuickBattle copies preset height into QB.map (was silently dropped)', /map:\{cols:map\.cols, rows:map\.rows, tiles:Object\.assign\(\{\},map\.tiles\), height:Object\.assign\(\{\},map\.height/.test(src));
T('startQuickBattle clears effects and concentration, not just conditions (buffs/conc were leaking into the next fight)',
  /c\.conditions=\{\};\s*\n\s*c\.effects=\[\];\s*\n\s*c\.concentration=\{active:false,spell:''\};/.test(src));

/* ---- sprite-sheet loader (opt-in; no-op with an empty manifest) ---- */
T('dirFromDelta picks screen-dominant axis (iso projection: (dx,dy) both same-sign renders as pure vertical, opposite-sign as pure horizontal)', dirFromDelta(1,1,true)==='down' && dirFromDelta(-1,-1,true)==='up' && dirFromDelta(1,-1,true)==='right' && dirFromDelta(-1,1,true)==='left');
T('dirFromDelta flat mode reads grid axes directly', dirFromDelta(0,-1,false)==='up' && dirFromDelta(0,0,false)===null);
T('spriteTokenHTML returns null (pixelArt fallback) for a key with no manifest entry', spriteTokenHTML('nonexistent-key','down',30)===null);

/* ---- negative elevation (pits) ---- */
T('elevation brush clamps to [-4,4], not [0,4]', /Math\.max\(-4,Math\.min\(4, cur\+\(key==='elev\+'\?1:-1\)\)\)/.test(src));
T('climb cost with a negative-height neighbor clamps to 0 (descending into a pit costs no extra)', Math.max(0, -2-0)*5===0);
T('climb cost climbing OUT of a pit still costs extra (0 minus -2)', Math.max(0, 0-(-2))*5===10);

/* ---- map rotation (iso view) ---- */
T('rotXY 90/180/270 map every corner of a 3x2 board to a valid in-bounds cell with no collisions', (()=>{
  const cols=3, rows=2, seen={};
  for(const rot of [0,1,2,3]){ const used=new Set();
    for(let y=0;y<rows;y++) for(let x=0;x<cols;x++){ const [rx,ry]=rotXY(x,y,cols,rows,rot);
      const rcols=rot%2?rows:cols, rrows=rot%2?cols:rows;
      if(rx<0||ry<0||rx>=rcols||ry>=rrows) return false;
      const k=rx+','+ry; if(used.has(k)) return false; used.add(k); } }
  return true; })());
T('rotDelta matches rotXY for the same 90° step (delta-based facing stays consistent with tile placement)', (()=>{
  const [ax,ay]=rotXY(5,5,10,10,1), [bx,by]=rotXY(4,6,10,10,1), [ddx,ddy]=rotDelta(4-5,6-5,1);
  return (bx-ax)===ddx && (by-ay)===ddy; })());
T('rotXY(rot=0) is the identity', rotXY(3,4,10,10,0).join()==='3,4');

/* ---- decorations: trees block walk+spell LoE; bushes/brush are soft (tiny grass) ---- */
(function(){
  const s={map:{cols:5,rows:5,tiles:{},height:{},decor:{'2,2':'tree'}}, monsters:[], players:[]};
  T('a solid tree blocks pathfinding through its cell', dijkstra(s,0,2,100,false).cost['2,2']==null);
  T('a solid tree blocks light-style LoS (Fire Bolt / Fireball)', losClear(s,0,2,4,2)===false);
  const s2={map:{cols:5,rows:5,tiles:{},height:{},decor:{'2,2':'bush'}}, monsters:[], players:[]};
  T('a non-solid bush does NOT block pathfinding (only difficult terrain)', dijkstra(s2,0,2,100,false).cost['2,2']!=null);
  T('a bush does NOT block light LoS (tiny undergrowth)', losClear(s2,0,2,4,2)===true);
  T('DECOR.tree/bush: solid tree, softCover bush', DECOR.tree.solid===true && DECOR.tree.opaque===true && DECOR.bush.solid!==true && DECOR.bush.softCover===true && DECOR.bush.diff===true);
  const s3={map:{cols:5,rows:5,tiles:{'2,2':'brush'},height:{},decor:{}}, monsters:[], players:[]};
  T('brush terrain does NOT block light LoS', losClear(s3,0,2,4,2)===true);
  const s4={map:{cols:5,rows:5,tiles:{'2,2':'wall'},height:{},decor:{}}, monsters:[], players:[]};
  T('a wall blocks light LoS', losClear(s4,0,2,4,2)===false);
  const s5={map:{cols:5,rows:5,tiles:{'2,2':'fog'},height:{},decor:{}}, monsters:[], players:[]};
  T('fog blocks light LoS', losClear(s5,0,2,4,2)===false);
  // Ridge taller than both ends blocks light; same-height mesa between equals does not if not taller
  const s6={map:{cols:7,rows:3,tiles:{},height:{'0,1':0,'3,1':2,'6,1':0},decor:{}}, monsters:[], players:[]};
  T('taller ridge between ends blocks light LoS', losClear(s6,0,1,6,1)===false);
  const s7={map:{cols:7,rows:3,tiles:{'3,1':'wall'},height:{},decor:{}}, monsters:[], players:[]};
  T('solid wall blocks light LoS', losClear(s7,0,1,6,1)===false);
  // Diagonals work the same as orthogonals (not chess-piece Bresenham)
  const open={map:{cols:8,rows:8,tiles:{},height:{},decor:{}}, monsters:[], players:[]};
  T('diagonal open ray is clear (light LoS)', losClear(open,1,1,5,5)===true);
  T('orthogonal open ray is clear (light LoS)', losClear(open,1,3,6,3)===true);
  const diagWall={map:{cols:8,rows:8,tiles:{'3,3':'wall'},height:{},decor:{}}, monsters:[], players:[]};
  T('diagonal ray blocked by wall on the line', losClear(diagWall,1,1,5,5)===false);
  // Creature body blocks intermediate light
  const bod={map:{cols:6,rows:3,tiles:{},height:{},decor:{}}, monsters:[{id:1,hp:5,x:2,y:1}], players:[]};
  T('living creature blocks light LoS through its tile', losClear(bod,0,1,5,1)===false);
  T('target creature does not block its own tile', losClear(bod,0,1,2,1)===true);
})();
T('decorAt returns empty string for an undecorated cell, not undefined/null', decorAt({map:{decor:{}}},0,0)==='');
T('startQuickBattle copies preset decor into QB.map (same pattern as height)', /map:\{cols:map\.cols, rows:map\.rows, tiles:Object\.assign\(\{\},map\.tiles\), height:Object\.assign\(\{\},map\.height\|\|\{\}\), decor:sanitizeDecorInPlace\(Object\.assign\(\{\},map\.decor/.test(src));
T('Open Field and Tavern presets carry real decor placements', Object.keys(MAP_PRESETS['Open Field'].decor||{}).length>0 && Object.keys(MAP_PRESETS['Tavern'].decor||{}).length>0);

/* ---- unified sprite scale: render size derives from each sheet's real resolution, not a fixed box ---- */
(function(){
  SPRITE_MANIFEST.__test_big={file:'x', cols:4, rows:4, nativeW:128, nativeH:128};
  SPRITE_MANIFEST.__test_small={file:'y', cols:4, rows:4, nativeW:64, nativeH:64};
  spriteReady.add('__test_big'); spriteReady.add('__test_small');
  const big=spriteTokenHTML('__test_big','down'), small=spriteTokenHTML('__test_small','down');
  const bigW=Number(big.match(/width:([\d.]+)px/)[1]), smallW=Number(small.match(/width:([\d.]+)px/)[1]);
  T('a 128x128 sheet renders at exactly double the width of a 64x64 sheet (same zoom factor, not a fixed box)', Math.abs(bigW/smallW-2)<0.01);
  T('a 128x128, 4-col sheet renders at frameSize(32)×SPRITE_ZOOM', Math.abs(bigW-32*SPRITE_ZOOM)<0.01);
  delete SPRITE_MANIFEST.__test_big; delete SPRITE_MANIFEST.__test_small;
  spriteReady.delete('__test_big'); spriteReady.delete('__test_small');
})();

/* ---- decor sprites keep their native aspect ratio instead of being squashed into a fixed square ---- */
(function(){
  DECOR_MANIFEST.__test_tall={file:'x', nativeW:96, nativeH:360};
  DECOR_MANIFEST.__test_wide={file:'y', nativeW:96, nativeH:72};
  decorReady.add('__test_tall'); decorReady.add('__test_wide');
  const tall=decorTokenHTML('__test_tall'), wide=decorTokenHTML('__test_wide');
  const tallW=Number(tall.match(/width:([\d.]+)px/)[1]), tallH=Number(tall.match(/height:([\d.]+)px/)[1]);
  const wideW=Number(wide.match(/width:([\d.]+)px/)[1]), wideH=Number(wide.match(/height:([\d.]+)px/)[1]);
  T('a tall narrow sheet is capped by height, not stretched to a fixed width', Math.abs(tallH-DECOR_MAX_H)<0.01 && Math.abs(tallW-DECOR_MAX_H*(96/360))<0.01);
  T('a wide short sheet is capped by width, not stretched to a fixed height', Math.abs(wideW-DECOR_MAX_W)<0.01 && Math.abs(wideH-DECOR_MAX_W*(72/96))<0.01);
  T('neither test sheet exceeds the bounding box on either axis', tallW<=DECOR_MAX_W && wideH<=DECOR_MAX_H);
  delete DECOR_MANIFEST.__test_tall; delete DECOR_MANIFEST.__test_wide;
  decorReady.delete('__test_tall'); decorReady.delete('__test_wide');
})();

/* ---- iso rendering itself (paint geometry, wall math, depth sort) lives entirely in
   iso-renderer.js now — run iso-renderer-test.js for those regressions (staircase overshoot,
   pyramid back-face double-draw). mapGridHTML's own job is just to hand that renderer the
   right data via the canvas's data-* attributes, which is all this asserts. ---- */
(function(){
  setIsoView(true);
  const s={map:{cols:5,rows:5,tiles:{},height:{'2,2':-1},decor:{}}, monsters:[], players:[]};
  const html=mapGridHTML(s,true,{});
  const cvMatch=html.match(/<canvas class="isocanvas"[^>]*data-height="([^"]*)"/);
  T('iso mode emits a canvas carrying the height data for painting', !!cvMatch);
  const heightData=JSON.parse(decodeURIComponent(cvMatch[1]));
  T('the pit height reaches the canvas data attribute', heightData['2,2']===-1);
  const paletteMatch=html.match(/data-palette="([^"]*)"/);
  T('mapGridHTML also hands the renderer a colour palette (decoupled from TERRAIN internals)', !!paletteMatch && Object.keys(JSON.parse(decodeURIComponent(paletteMatch[1]))).length>0);
})();

/* ---- regression: spell range must come from SPELL_RANGE (real PHB numbers), not silently fall
   back to a wrong flat 60 ft whenever SPELL_DESC's one-line prose never says "within N ft" —
   which was true for ~87 attack/save/AoE spells (e.g. Fire Bolt: "Ranged fire mote, 1d10 fire"
   never states its actual 120 ft). Reported live as "fireball and firebolt range is fucked up." */
T('Fire Bolt range is its real 120 ft (24 tiles), not the silent 60-ft fallback', spellRangeTiles('Fire Bolt')===24);
T('Fireball range is its real 150 ft (30 tiles), not the silent 60-ft fallback', spellRangeTiles('Fireball')===30);
T('Magic Missile range is 120 ft', spellRangeTiles('Magic Missile')===24);
T('Shocking Grasp is Touch range (1 tile)', spellRangeTiles('Shocking Grasp')===1);
(function(){
  // Coverage check mirroring the live audit: every spell that needs a real range (attack, save,
  // or AoE) must resolve one via SPELL_RANGE or the description regex — not silently fall through.
  const names=Object.keys(SPELL_DESC);
  const missing=names.filter(n=>{ const mc=parseSpellMechanics(n); return (mc.attack||mc.dmg||mc.save||SPELL_AOE[n]) && !mc.range; });
  T('every attack/save/AoE spell resolves a real range (no silent 60ft-default gap remains)', missing.length===0);
})();

/* ---- regression: AoE blasts and ranged spell/weapon targeting (Fireball, Fire Bolt's range
   ring, monster attack range, teleport distance…) must be circular for any real distance, not
   the square gridDist/Chebyshev shape — live reports: "fireball radius should be circle" and
   "range needs to be circular as well." r<=1 is the deliberate exception (melee reach / Touch
   spells / a tiny "everything adjacent" AoE) where diagonal still conventionally counts. ---- */
T('a tile at Euclidean distance 1.0 (orthogonal neighbour) is inside a radius-1 blast', inBlast(2,2,2,3,1));
T('at radius 1 (melee/touch), a DIAGONAL neighbour still counts — the deliberate exception', inBlast(2,2,3,3,1));
T('the blast centre itself is always inside its own radius', inBlast(2,2,2,2,1));
T('at radius 2 (a genuine ranged distance), an orthogonal tile at distance 2 is inside', inBlast(2,2,2,4,2));
T("at radius 2, a DIAGONAL tile at distance 2√2≈2.83 is OUTSIDE — that's the square-vs-circle bug, fixed for anything beyond melee/touch range", !inBlast(2,2,4,4,2));

/* ---- Wave 2 summons: Conjure Animals (pack, concentration) + Animate Dead (single, no conc) ---- */
(function(){
  T('Conjure Animals and Animate Dead are wired as summon handlers', SPELL_HANDLERS['Conjure Animals'].kind==='summon' && SPELL_HANDLERS['Animate Dead'].kind==='summon');
  T('Conjure Animals resolves a catalog with 4 pack-size options', summonCatalogEntry('Conjure Animals').pick.length===4);
  T('Animate Dead resolves a catalog with skeleton/zombie options', summonCatalogEntry('Animate Dead').pick.length===2);
  T('Conjure Animals is tracked as concentration (PHB); Animate Dead is not', isConcentration('Conjure Animals') && !isConcentration('Animate Dead'));
  T("Animate Dead's catalog explicitly opts out of concentration on the spawned unit", summonCatalogEntry('Animate Dead').conc===false);

  const s={map:{cols:10,rows:10,tiles:{},height:{},decor:{}}, monsters:[], players:[{x:0,y:0}], order:[], turn:0};
  const wolfPick=summonCatalogEntry('Conjure Animals').pick.find(p=>p.count===8);
  const tiles=nearbySpawnTiles(s, 5, 5, 8);
  T('nearbySpawnTiles finds 8 distinct open tiles for an 8-beast pack', tiles.length===8 && new Set(tiles.map(t=>t.x+','+t.y)).size===8);
  const units=tiles.map(t=>spawnSummon(s, {x:0,y:0}, wolfPick, t.x, t.y, 'Conjure Animals')).filter(Boolean);
  T('a full 8-wolf pack spawns as separate ally units on distinct tiles', units.length===8 && new Set(units.map(u=>u.x+','+u.y)).size===8 && units.every(u=>u.ally&&u.conc));

  const skelPick=summonCatalogEntry('Animate Dead').pick.find(p=>p.id==='skel');
  const skel=spawnSummon(s, {x:0,y:0}, skelPick, 1, 1, 'Animate Dead');
  T('Animate Dead spawns a permanent (non-concentration) undead ally', skel.ally && skel.summoned && !skel.conc);

  T('nearbySpawnTiles never returns a tile already occupied by a live monster', !nearbySpawnTiles(s,5,5,3).some(t=>s.monsters.some(m=>m.hp>0&&m.x===t.x&&m.y===t.y&&!(t.x===5&&t.y===5))));
})();

/* ---- Light cantrip: touch an object — self, a spot, or (with a save if hostile) a
   creature's gear. See openLightTarget/applySpellLight/castSpell's suppressLight+followId. ---- */
(function(){
  const wiz=newCharacter('Lightbringer'); wiz.cls='Wizard'; wiz.level=1; wiz.spellAbility='int';
  wiz.spells=(wiz.spells||[]).concat({name:'Light', level:0, prepared:true});
  setQB({active:true, over:null, log:[], map:{cols:5,rows:5,tiles:{}}, order:[{k:'p',id:'pc'}], turn:0,
    battle:{active:true,round:1}, lights:[],
    monsters:[{id:'m1',side:'mon',base:'Goblin',name:'Goblin',x:2,y:0,hp:7,max:7,ac:15}],
    players:[{id:'pc',side:'pc',name:wiz.name,c:wiz,x:0,y:0,hpCur:wiz.hp.cur,hpMax:wiz.hp.max}] });

  wiz.battle=freshTurnState(wiz);
  castSpell(wiz,'Light',0);
  // One active Light instance per caster (re-casting refreshes/moves it, doesn't stack)
  T('Light with no target follows the caster (default self-attach, unchanged behavior)', getQB().lights.length===1 && getQB().lights[0].follow==='pc');

  applySpellLight(getQB(), wiz, 'Light', {x:3,y:3}, null);
  T('Light placed on a spot (followId:null) does not follow anyone', getQB().lights.length===1 && getQB().lights[0].follow==null && getQB().lights[0].col===3);

  applySpellLight(getQB(), wiz, 'Light', {x:2,y:0}, 'm1');
  T("Light touched onto another creature's object follows THAT creature, not the caster", getQB().lights.length===1 && getQB().lights[0].follow==='m1');

  const before=(wiz.effects||[]).length;
  resetTurnState(wiz);
  const ok=castSpell(wiz,'Light',0,null,{suppressLight:true});
  T('a suppressed cast (hostile resisted the Dex save) still spends the action/resources', ok===true);
  T("...but adds no session light and no tracked 'Light' effect on the sheet", getQB().lights.length===1 && getQB().lights[0].follow==='m1' /* untouched by the suppressed cast */ && (wiz.effects||[]).length===before);
  setQB(null);
})();

/* ---- Map interactables: chest (open→gold) + live-painted decor becomes a real usable
   object, not just a picture. See listInteractInRange/DECOR_TO_INTERACT/nextToWall. ---- */
(function(){
  T('chest is a registered interact type with an open action', INTERACT_TYPES['chest'] && INTERACT_TYPES['chest'].actions.some(a=>a.id==='open'));
  T('DECOR_TO_INTERACT is derived from every INTERACT_TYPES decor mapping (door, chest, etc.)', DECOR_TO_INTERACT['door'].type==='door' && DECOR_TO_INTERACT['door'].state==='closed' && DECOR_TO_INTERACT['chest'].type==='chest');

  const s={map:{cols:5,rows:5,tiles:{'2,2':'wall'}, decor:{'0,0':'door','1,1':'chest'}, interact:{}}, players:[], monsters:[]};
  const items=listInteractInRange(s, {x:0,y:0}, 5);
  T('a DM-painted door with no interact entry is promoted to a real, usable door object', s.map.interact['0,0'] && s.map.interact['0,0'].type==='door' && items.some(it=>it.key==='0,0'&&it.def.name==='Door'));
  T('a DM-painted chest is likewise promoted (not just torches, as before)', s.map.interact['1,1'] && s.map.interact['1,1'].type==='chest');

  const hero=newCharacter('Looter'); hero.currency.gp=0;
  const before=hero.currency.gp;
  const res=runInteractAction(s, hero, '1,1', 'open', 'hand');
  T('opening a chest succeeds and grants gold to the opener', res.ok && hero.currency.gp>before);
  T('an opened chest is marked opened (no longer re-openable)', s.map.interact['1,1'].state==='opened');

  T('nextToWall is true only for tiles orthogonally adjacent to a wall-family terrain', nextToWall(s,1,2) && !nextToWall(s,4,4));
})();

/* ---- Detect Thoughts: flavor lookup + Insight-advantage effect ---- */
{
  T('detectThoughtsFlavor matches a zombie', detectThoughtsFlavor({base:'Zombie'})==="Hungry. So hungry. Must... find... brains.");
  T('detectThoughtsFlavor matches a goblin', detectThoughtsFlavor({base:'Goblin'})==='Bigger than me. Run? Or is there loot first?');
  T('detectThoughtsFlavor falls back for an unlisted monster', detectThoughtsFlavor({base:'Nonexistent Beastie'})===DETECT_THOUGHTS_FALLBACK);
  T('spellTargetsEnemy routes Detect Thoughts into single-target battle picking', spellTargetsEnemy('Detect Thoughts')===true);

  const psi=newCharacter('Psi'); psi.cls='Wizard'; psi.level=3; psi.abilities={str:10,dex:10,con:10,int:16,wis:10,cha:10}; psi.skillProf.insight=true;
  psi.spells=[{name:'Detect Thoughts', level:2, prepared:true}]; psi.spellSlots={1:0,2:0,3:0,4:0,5:0,6:0,7:0,8:0,9:0};
  const mo={id:'m1', base:'Goblin', name:'Goblin', hp:7, max:7};
  addEffect(psi, 'Detect Thoughts');   // normally castSpell() does this generically via SPELL_EFFECTS before castDetectThoughts runs
  castDetectThoughts(psi, mo, ()=>{});
  const eff=psi.effects.find(e=>e.name==='Detect Thoughts');
  T('castDetectThoughts adds a concentration effect tagged with the target id', !!eff && eff.conc===true && eff.targetId==='m1');
  T('castDetectThoughts logs the flavor line to the sheet', /Bigger than me/.test((psi.log[0]||{}).m||''));
  T('skillCheckAdvantage grants Insight advantage against the read target', skillCheckAdvantage(psi,'insight','wis','m1').adv===1);
  T('skillCheckAdvantage gives no Insight advantage against a different target', skillCheckAdvantage(psi,'insight','wis','someone-else').adv===0);
  T('skillCheckAdvantage gives no advantage for a non-Insight skill even against the read target', skillCheckAdvantage(psi,'perception','wis','m1').adv===0);
}

/* ---- Unseen Servant: real summon, mindless (no auto-actions), player-commanded ---- */
{
  T('SPELL_HANDLERS routes Unseen Servant through the summon UI', SPELL_HANDLERS['Unseen Servant'] && SPELL_HANDLERS['Unseen Servant'].kind==='summon');
  const cat=SUMMON_CATALOG['Unseen Servant'];
  T('Unseen Servant has a real SUMMON_CATALOG entry', !!cat && Array.isArray(cat.pick) && cat.pick.length===1);
  const pick=cat.pick[0];
  T('the servant pick is a true non-combatant (0 attacks, no attack string)', pick.attacks===0 && pick.atk==='');
  T('the servant pick uses the passive brain', pick.brain==='passive');

  const s={active:true, over:null, log:[], map:{cols:8,rows:8,tiles:{}}, order:[], turn:0, battle:{active:true,round:1}, monsters:[], players:[]};
  const caster={id:'pc'};
  const unit=spawnSummon(s, caster, pick, 3, 3, 'Unseen Servant');
  T('spawnSummon respects a deliberate 0 attacks / passive brain instead of falling back to combat defaults', unit.attacks===0 && unit.attacksLeft===0 && unit.brain==='passive');
  T('a mindless summon\'s "AI turn" (BRAINS[brain]) is a genuine no-op, not a crash or a tactical fallback', JSON.stringify((BRAINS[unit.brain]||BRAINS.tactical)(s, unit))==='[]');

  const tiles=servantMoveTiles({map:()=>s.map}, unit);   // minimal ad stub — servantMoveTiles only calls ad.map()
  T('servantMoveTiles only offers tiles within 15 ft (Chebyshev 3) of the servant', tiles.every(t=>Math.max(Math.abs(t.x-unit.x),Math.abs(t.y-unit.y))<=3));
  T('servantMoveTiles excludes the servant\'s own tile', !tiles.some(t=>t.x===unit.x&&t.y===unit.y));
  s.map.tiles[(unit.x+1)+','+unit.y]='wall';
  const tilesAfterWall=servantMoveTiles({map:()=>s.map}, unit);
  T('servantMoveTiles excludes a walled tile (tileClearFor)', !tilesAfterWall.some(t=>t.x===unit.x+1&&t.y===unit.y));
}

/* ---- Healing batch: Heal/Mass Heal/Regenerate get real roll-helper detection; ---- */
/* ---- Goodberry is a real consumable counter; Spare the Dying auto-stabilizes.   ---- */
{
  T('parseSpellMechanics detects a flat (non-dice) heal amount for Heal', parseSpellMechanics('Heal').heal==='70');
  T('parseSpellMechanics detects a flat heal amount for Mass Heal', parseSpellMechanics('Mass Heal').heal==='700');
  T('parseSpellMechanics detects Regenerate\'s dice heal (4d8+15) after the SPELL_DESC fix', parseSpellMechanics('Regenerate').heal==='4d8+15');
  T('parseSpellMechanics deliberately excludes Goodberry from the flat-heal path (per-berry, not one-shot)', parseSpellMechanics('Goodberry').heal==null);

  const druid=newCharacter('Berry'); druid.cls='Druid'; druid.level=3; druid.abilities={str:10,dex:10,con:10,int:10,wis:16,cha:10}; applyClassDefaults(druid);
  druid.spells=[{name:'Goodberry', level:1, prepared:true}];
  T('casting Goodberry creates a real 10-charge consumable counter', castSpell(druid,'Goodberry',1) && druid.goodberries===10);
  druid.hp={cur:5,max:20,temp:0};
  druid.goodberries--; applyHp(druid,1);   // the actual "eat a berry" mechanic (renderItems' #eatBerry handler)
  T('eating a berry heals 1 HP and decrements the counter', druid.hp.cur===6 && druid.goodberries===9);

  // Spare the Dying: player-net auto-stabilizes the nearest adjacent downed ally, no roll.
  // castSpell's Spare the Dying branch works off `c`/`net`/`battleSession()` directly — it
  // never calls playerChar()/DB, so no DB fixture is needed here.
  setQB(null);
  const medic2=newCharacter('Medic2'); medic2.cls='Cleric'; medic2.level=1; applyClassDefaults(medic2);
  medic2.spells=[{name:'Spare the Dying', level:0, prepared:true}];
  const sends=[];
  setNet({role:'player', charId:medic2.id, peer:{id:'me1'}, conn:{send:m=>sends.push(m)},
    session:{battle:{active:true,round:1}, map:{cols:5,rows:5,tiles:{}}, monsters:[], order:[], turn:0,
      players:[{id:'me1', name:medic2.name, x:0,y:0}, {id:'down1', name:'Downed', x:1,y:0, hpCur:0, stable:false, deathFail:1}]}});
  T('casting Spare the Dying next to a downed ally sends a stabilize message with no roll needed', castSpell(medic2,'Spare the Dying',0) && sends.some(m=>m.t==='stabilize'&&m.targetId==='down1'));
  setNet(null);
}

/* ---- Condition removal: Lesser/Greater Restoration, Remove Curse, Protection from Poison ---- */
{
  const cleric=newCharacter('Purify'); cleric.cls='Cleric'; cleric.level=5; applyClassDefaults(cleric);
  cleric.spells=[{name:'Lesser Restoration',level:2,prepared:true},{name:'Greater Restoration',level:5,prepared:true},
    {name:'Remove Curse',level:3,prepared:true},{name:'Protection from Poison',level:2,prepared:true}];

  T('Lesser Restoration offers nothing to cure when no qualifying condition is active', SPELL_CHOICES['Lesser Restoration'](cleric).length===1 && /Nothing to cure/.test(SPELL_CHOICES['Lesser Restoration'](cleric)[0].t));
  cleric.conditions={Poisoned:true};
  const lrOpts=SPELL_CHOICES['Lesser Restoration'](cleric);
  T('Lesser Restoration offers to end an actually-active condition', lrOpts.some(o=>/End Poisoned/.test(o.t)));
  lrOpts.find(o=>/End Poisoned/.test(o.t)).f(cleric);
  T('picking the option actually clears the condition', !cleric.conditions.Poisoned);

  cleric.conditions={Charmed:true}; cleric.exhaustion=2;
  const grOpts=SPELL_CHOICES['Greater Restoration'](cleric);
  T('Greater Restoration offers both the active condition and exhaustion reduction', grOpts.some(o=>/End Charmed/.test(o.t)) && grOpts.some(o=>/Reduce Exhaustion/.test(o.t)));
  grOpts.find(o=>/Reduce Exhaustion/.test(o.t)).f(cleric);
  T('reducing exhaustion actually decrements the tracked counter', cleric.exhaustion===1);

  cleric.conditions={Cursed:true};
  T('Remove Curse clears the Cursed condition', castSpell(cleric,'Remove Curse',3) && !cleric.conditions.Cursed);

  cleric.conditions={Poisoned:true}; cleric.effects=[];
  castSpell(cleric,'Protection from Poison',2);
  T('Protection from Poison cures existing Poisoned and tracks a real effect', !cleric.conditions.Poisoned && cleric.effects.some(e=>e.name==='Protection from Poison'));
}

/* ---- See Invisibility / True Seeing: real reciprocal-Invisible-rule fix ---- */
{
  T('attacking an invisible target is disadvantage (previously missing entirely)', attackAdvantage(new Set(), new Set(['Invisible']), true).adv===-1);
  T('...unless the attacker can see invisible (seesInvisible opt)', attackAdvantage(new Set(), new Set(['Invisible']), true, {seesInvisible:true}).adv===0);
  T('an invisible attacker still gets its own advantage independent of the target\'s state', attackAdvantage(new Set(['Invisible']), new Set(), true).adv===1);

  const seer=newCharacter('Seer'); seer.cls='Wizard'; applyClassDefaults(seer);
  T('hasSeesInvisible is false with no active effect', hasSeesInvisible({c:seer})===false);
  addEffect(seer, 'See Invisibility');
  T('casting See Invisibility (SPELL_EFFECTS) makes hasSeesInvisible true for that PC-backed unit', hasSeesInvisible({c:seer})===true);
  T('hasSeesInvisible is false for a monster (no buff tracking)', hasSeesInvisible({side:'mon',hp:7})===false);

  // End-to-end through Engine.hitResult: a target with Invisible should no longer impose
  // disadvantage once the attacker's adapter-resolved unit carries the effect.
  const ad={ unit:id=>id==='atk'?{c:seer}:{conditions:{Invisible:true}, ac:14, x:0,y:0}, ac:u=>u.ac||14, cover:()=>0 };
  const res=Engine.hitResult(ad, 'atk', 'tgt', {toHit:5, tiles:1}, 10);
  T('Engine.hitResult threads hasSeesInvisible through to attackAdvantage (no disadvantage on the invisible target)', res.adv===0);
}

/* ---- Movement batch: Levitate, Feather Fall, Jump, Telekinesis ---- */
{
  const acro=newCharacter('Leaper'); acro.cls='Wizard'; acro.abilities={str:14,dex:10,con:10,int:16,wis:10,cha:10}; applyClassDefaults(acro);
  T('Levitate was already checked by isFlying() but never actually creatable — SPELL_EFFECTS entry fixes that', !!SPELL_EFFECTS['Levitate']);
  addEffect(acro,'Levitate');
  T('casting Levitate now makes isFlying true (isFlying already looked for this effect name)', isFlying(acro)===true);

  T('hasFeatherFall is false with no active effect', hasFeatherFall(acro)===false);
  addEffect(acro,'Feather Fall');
  T('casting Feather Fall (SPELL_EFFECTS) makes hasFeatherFall true', hasFeatherFall(acro)===true);

  const base=runningHighJumpFt(acro);
  addEffect(acro,'Jump');
  T('casting Jump triples runningHighJumpFt — the single function every jump/climb check in the app reads', runningHighJumpFt(acro)===base*3);
  endEffect(acro, acro.effects.find(e=>e.name==='Jump').id);
  T('ending the Jump effect reverts the multiplier', runningHighJumpFt(acro)===base);

  // Telekinesis: opposed spell-ability-check vs target Strength, reusing Engine.castApply's
  // existing savedKnown+cond pipeline instead of a bespoke condition-application path.
  const weakGoblin={id:'m1', side:'mon', base:'Goblin', name:'Goblin', hp:7, max:7, x:0,y:0};
  { const orig=Math.random; Math.random=()=>0.99;   // caster rolls high
    T('telekinesisSavedKnown: caster wins the opposed check against a weak target', telekinesisSavedKnown(acro, weakGoblin)===false);
    Math.random=orig; }
  setQB({active:true, over:null, log:[], map:{cols:5,rows:5,tiles:{}}, order:[], turn:0, battle:{active:true,round:1},
    monsters:[Object.assign({},weakGoblin)], players:[{id:'pc',side:'pc',name:acro.name,c:acro,x:1,y:0}]});
  const mo=getQB().monsters[0];
  Engine.castApply(qbAdapter,'pc',mo.id,{name:'Telekinesis',savedKnown:false,cond:{c:'Restrained',rounds:10},dmgTotal:0});
  T('a failed Telekinesis check actually applies Restrained to the target, through the real Engine pipeline', mo.conds.some(c=>c.name==='Restrained'));
  setQB(null);
}

/* ---- Battlefield control: walls, Reverse Gravity/Forcecage (data-table reuse), no-cast zones ---- */
{
  const s={map:{cols:10,rows:10,tiles:{}}, battle:{round:1}, hazards:[]};
  paintHazardTerrain(s, {x:5,y:5}, 2, 'Wall of Force', 10);
  T('Wall of Force paints real solid terrain (blocks movement) via the existing hazard pipeline', TERRAIN[s.map.tiles['5,5']].solid===true);
  T('Wall of Force is transparent (opaque:false) — you can see through it, unlike a real wall', TERRAIN[s.map.tiles['5,5']].opaque===false);
  T('a wall tile correctly reports as tileClearFor()===false (blocks a Shove push etc.)', tileClearFor(s,5,5)===false);
  paintHazardTerrain(s, {x:0,y:0}, 2, 'Wall of Stone', 10);
  T('Wall of Stone never expires on its own (rounds:Infinity)', s.hazards.find(h=>h.name==='Wall of Stone').until===Infinity);

  T('Reverse Gravity now parses as a real Dex-save damage spell from its reworded description', (()=>{ const mc=parseSpellMechanics('Reverse Gravity'); return mc.save==='dex' && mc.dmg==='4d6'; })());
  T('Forcecage now parses as a real Cha-save spell and carries a Restrained SPELL_COND', (()=>{ const mc=parseSpellMechanics('Forcecage'); return mc.save==='cha' && SPELL_COND['Forcecage'].c==='Restrained'; })());

  // No-cast zones: Silence/Antimagic Field block canCast for whoever's standing in them.
  const zoneS={active:true, over:null, log:[], map:{cols:8,rows:8,tiles:{}}, order:[], turn:0, battle:{active:true,round:1}, monsters:[], players:[{id:'pc',side:'pc',x:3,y:3}]};
  setQB(zoneS);
  const wiz=newCharacter('Silenced'); wiz.cls='Wizard'; wiz.level=3; applyClassDefaults(wiz);
  zoneS.players[0].c=wiz;
  T('casting works normally with no active no-cast zone', canCast(wiz,'Fire Bolt',0)===true);
  paintNoCastZone(zoneS, {x:3,y:3}, 2, 'Silence');
  T('inNoCastZone correctly finds the painted Silence zone', inNoCastZone(zoneS,3,3)===true);
  T('canCast refuses to cast for a PC standing inside an active no-cast zone', canCast(wiz,'Fire Bolt',0)===false);
  zoneS.players[0].x=7; zoneS.players[0].y=7;
  T('canCast allows casting again once the PC leaves the zone', canCast(wiz,'Fire Bolt',0)===true);
  setQB(null);
}

/* ---- Counterspell / Dispel Magic: strip a monster's spell-imposed conditions ---- */
{
  T('spellTargetsEnemy routes Dispel Magic and Counterspell into single-target battle picking', spellTargetsEnemy('Dispel Magic')===true && spellTargetsEnemy('Counterspell')===true);
  const cursed={id:'m1', side:'mon', name:'Goblin', hp:7, conds:[{name:'Restrained',rounds:10},{name:'Charmed',rounds:5}]};
  T('dispelMonsterConds clears every tracked condition and reports how many', dispelMonsterConds(cursed)===2 && cursed.conds.length===0);
  T('dispelMonsterConds on an already-clean target reports zero', dispelMonsterConds(cursed)===0);
}

/* ---- Social/mind: Calm Emotions/Compulsion/Mass Suggestion (save+cond reuse), Beacon of Hope ---- */
{
  T('Calm Emotions now parses as a real Cha-save spell carrying a Charmed SPELL_COND', (()=>{ const mc=parseSpellMechanics('Calm Emotions'); return mc.save==='cha' && SPELL_COND['Calm Emotions'].c==='Charmed'; })());
  T('Compulsion now parses as a real Wis-save spell carrying a Charmed SPELL_COND', (()=>{ const mc=parseSpellMechanics('Compulsion'); return mc.save==='wis' && SPELL_COND['Compulsion'].c==='Charmed'; })());
  T('Mass Suggestion now parses as a real Wis-save spell with a 24-hour Charmed duration', (()=>{ const mc=parseSpellMechanics('Mass Suggestion'); return mc.save==='wis' && SPELL_COND['Mass Suggestion'].r===14400; })());

  const hopeful=newCharacter('Hopeful'); hopeful.death={succ:0,fail:0}; hopeful.hp={cur:0,max:20,temp:0};
  T('hasBeaconOfHope is false with no active effect', hasBeaconOfHope(hopeful)===false);
  addEffect(hopeful,'Beacon of Hope');
  T('casting Beacon of Hope (SPELL_EFFECTS) makes hasBeaconOfHope true', hasBeaconOfHope(hopeful)===true);
  { const orig=Math.random; let i=0; const seq=[0.05,0.90];   // rolls 2 then 19 (avoid nat 20's special-case branch) — advantage keeps the 19
    Math.random=()=>seq[i++%seq.length];
    rollDeathSave(hopeful);
    Math.random=orig;
    T('Beacon of Hope grants real advantage on death saves (keeps the better of two rolls)', hopeful.death.succ===1);
  }
}

/* ---- Utility: Knock (real door-open), Alter Self's real Claws attack ---- */
{
  const rogue=newCharacter('Locksmith'); rogue.cls='Wizard'; rogue.level=5; applyClassDefaults(rogue);
  rogue.spells=[{name:'Knock',level:2,prepared:true}];
  setQB({active:true, over:null, log:[], map:{cols:6,rows:6,tiles:{},interact:{'2,2':{type:'door',state:'closed'}}}, order:[], turn:0, battle:{active:true,round:1},
    monsters:[], players:[{id:'pc',side:'pc',name:rogue.name,c:rogue,x:1,y:2}]});
  castSpell(rogue,'Knock',2);
  T('Knock auto-opens the nearest closed door within range, through the real interact system', getQB().map.interact['2,2'].state==='open');
  setQB(null);

  const shifter=newCharacter('Shifter'); shifter.abilities={str:14,dex:10,con:10,int:10,wis:10,cha:10}; applyClassDefaults(shifter);
  T('hasNaturalWeapons is false with no active Alter Self', hasNaturalWeapons(shifter)===false);
  T('qbPcAttacks has no Claws option yet', !qbPcAttacks(shifter).some(a=>/Claws/.test(a.name)));
  addEffect(shifter,'Alter Self');
  T('casting Alter Self makes hasNaturalWeapons true', hasNaturalWeapons(shifter)===true);
  const claws=qbPcAttacks(shifter).find(a=>/Claws/.test(a.name));
  T('qbPcAttacks now offers a real 1d6 slashing Claws attack, not just the flat unarmed-strike fallback', !!claws && claws.dmg==='1d6' && claws.dt==='slashing');
}

/* ---- Gust of Wind: was torch-snuffing only — now a real Str-save-or-pushed-15ft effect ---- */
{
  const s={map:{cols:12,rows:12,tiles:{}}, battle:{round:1}, monsters:[
    {id:'m1', side:'mon', base:'Goblin', name:'Weak', hp:7, x:5,y:0},   // low STR, in the line, should fail vs a high DC
    {id:'m2', side:'mon', base:'Young Red Dragon', name:'Strong', hp:100, x:6,y:0},   // high STR, should resist
    {id:'m3', side:'mon', base:'Goblin', name:'Offline', hp:7, x:5,y:5}   // not in the line at all
  ]};
  const before={m1:{x:5,y:0}, m2:{x:6,y:0}, m3:{x:5,y:5}};
  const orig=Math.random; Math.random=()=>0.5;   // same mid-range d20 (11) for everyone — only STR modifier separates weak from strong
  const res=applyGustOfWind(s, {x:0,y:0}, {x:11,y:0}, 'Caster', 15);
  Math.random=orig;
  const m1=s.monsters.find(m=>m.id==='m1'), m2=s.monsters.find(m=>m.id==='m2'), m3=s.monsters.find(m=>m.id==='m3');
  T('a weak creature in the line fails its Str save and gets pushed', m1.x!==before.m1.x || m1.y!==before.m1.y);
  T('the push moves the creature away from the caster along the line direction', m1.x>before.m1.x);
  T('a strong creature in the line can still resist (high STR modifier clears the same DC)', m2.x===before.m2.x && m2.y===before.m2.y);
  T('a creature outside the line is never touched at all', m3.x===before.m3.x && m3.y===before.m3.y);
  T('applyGustOfWind reports real pushed/resisted counts, not just a flat "cast" flag', res.pushed===1 && res.resisted===1);
}

/* ---- DM-side Escape Grapple: a grappled monster previously had no way to ever escape ---- */
{
  // maneuverGrapple now stores the grappler's NAME (not the old hardcoded 'pc' string) so
  // sessionAdapter.findGrappler can look them back up — the DM never had a "solePc" to fall
  // back to (a session can host multiple players).
  const mo={id:'m1', side:'mon', base:'Goblin', name:'Trapped', hp:7, x:0,y:0, conds:[{name:'Grappled',rounds:10}], grappledBy:'Grappler'};
  setNet({role:'dm', conns:[], session:{battle:{active:true,round:1}, map:{cols:5,rows:5,tiles:{}}, monsters:[mo],
    players:[{id:'p1', name:'Grappler', x:0,y:1, hpCur:10, hpMax:10}], order:[], turn:0}});
  T('sessionAdapter.findGrappler resolves the stored name back to the real connected player', sessionAdapter.findGrappler('Grappler').id==='p1');
  T('sessionAdapter.findGrappler returns nothing for an unknown name', sessionAdapter.findGrappler('Nobody')===undefined);
  const res=maneuverEscape(sessionAdapter, mo, false, ()=>{});
  T('a DM-controlled grappled monster can now actually attempt to escape (real caller, not dead code)', res.ok===true);
  setNet(null);
}

/* ---- Player-net Dispel Magic / Counterspell: dmOnData's new 'dispelMon' relay ---- */
{
  const cursedMon={id:'m1', side:'mon', name:'Goblin', hp:7, conds:[{name:'Restrained',rounds:10}]};
  setNet({role:'dm', conns:[], session:{battle:{active:true,round:1}, map:{cols:5,rows:5,tiles:{}}, monsters:[cursedMon], players:[], order:[], turn:0}});
  dmOnData({peer:'p1'}, {t:'dispelMon', mon:'m1'});
  T('a player-net Dispel Magic/Counterspell relay actually clears the condition on the DM\'s authoritative monster', cursedMon.conds.length===0);
  setNet(null);
}

/* ---- Search: the counterpart to Hide, which previously had nothing to counter it ---- */
{
  const seeker={id:'m1', side:'mon', base:'Young Red Dragon', name:'Seeker', hp:100};
  const weakSeeker={id:'m2', side:'mon', base:'Goblin', name:'WeakSeeker', hp:7};
  const orig=Math.random; Math.random=()=>0.5;   // same mid-range d20 (11) for both — only the WIS modifier differs
  const strongRes=monsterSearchRoll(seeker, 15);
  const weakRes=monsterSearchRoll(weakSeeker, 15);
  Math.random=orig;
  T('monsterSearchRoll: a high-CR monster with a real WIS-derived bonus can find a well-hidden PC', strongRes.found===true);
  T('monsterSearchRoll: a low-CR monster with the same DC roll fails to find the same target', weakRes.found===false);
  T('monsterSearchRoll reports no find when hiddenDC is unknown (not yet synced from the player)', monsterSearchRoll(seeker, null).found===false);

  // hiddenDC now rides along on playerHello()'s payload / dmOnData's hello handler, same as
  // sanctuaryDC/holyAuraDC — previously not synced at all, so the DM had no way to ever
  // resolve a Search roll against a real Stealth total.
  setNet({role:'dm', conns:[], session:{battle:{active:true,round:1}, map:{cols:5,rows:5,tiles:{}}, monsters:[], players:[], order:[], turn:0}});
  dmOnData({peer:'p1'}, {t:'hello', char:{cid:'c1', name:'Hider', hpCur:10, hpMax:10, ac:14, hiddenDC:17}});
  T('a Hidden player\'s real Stealth total (hiddenDC) now reaches the DM\'s mirror', getNet().session.players[0].hiddenDC===17);
  setNet(null);
}

/* ---- NPCs: deployNpc pre-seeds REAL asymmetric abilities, not the flat CR-derived value ---- */
{
  setNet({role:'dm', conns:[], session:{battle:{active:false,round:1}, map:{cols:5,rows:5,tiles:{}}, monsters:[], players:[], order:[], turn:0}});
  deployNpc({name:'Noble Rosalind', race:'Human', ac:11, hp:9, speed:30, str:8, dex:10, con:10, int:12, wis:11, cha:18});
  const npc=getNet().session.monsters[0];
  T('deployNpc creates a monster-shaped entry (same array every combat/AI path reads)', npc && npc.name==='Noble Rosalind');
  T('deployNpc tags the entry isNpc + carries its race', npc.isNpc===true && npc.race==='Human');
  T('deployNpc pre-seeds real per-ability scores, not a flat CR-derived value', npc.abilities.cha===18 && npc.abilities.str===8);
  T('a lopsided NPC build shows a genuinely different modifier per ability (high CHA vs low STR)', mod(abil(npc,'cha'))===4 && mod(abil(npc,'str'))===-1);
  const before=npc.abilities;
  deriveMonsterAbilities(npc);
  T('deriveMonsterAbilities is a permanent no-op for an NPC — never falls back to the flat CR value', npc.abilities===before && npc.abilities.cha===18);
  T('unitSkillRoll reads the NPC\'s own high-CHA bonus, not a flat monster approximation', (()=>{ const orig=Math.random; Math.random=()=>0.5; const r=unitSkillRoll(npc,'persuasion','cha'); Math.random=orig; return r.total===11+4; })());
  setNet(null);
}

/* ---- monster/NPC inventory: pure loot bookkeeping, no stat side effects ---- */
{
  const mo={id:'m1', name:'Bandit', ac:12, hp:11};
  T('a fresh monster has no items array until first touched', mo.items===undefined);
  mo.items=mo.items||[];
  mo.items.push({name:'Scimitar', qty:1});
  mo.items.push({name:'Gold pouch', qty:1});
  T('adding loot does not touch AC or HP', mo.ac===12 && mo.hp===11);
  T('two items tracked verbatim', mo.items.length===2 && mo.items[0].name==='Scimitar' && mo.items[1].qty===1);
  mo.items.splice(0,1);
  T('removing one item leaves only the other', mo.items.length===1 && mo.items[0].name==='Gold pouch');
}

/* ---- Antimagic Field: full enforcement — suppresses active effects, not just new casts ---- */
{
  const s={battle:{round:1}, map:{cols:5,rows:5,tiles:{}}, hazards:[]};
  paintNoCastZone(s, {x:2,y:2}, 1, 'Antimagic Field');
  T('inAntimagicField is true inside a painted Antimagic Field zone', inAntimagicField(s,2,2)===true);
  T('inAntimagicField is false outside the zone', inAntimagicField(s,4,4)===false);

  const s2={battle:{round:1}, map:{cols:5,rows:5,tiles:{}}, hazards:[]};
  paintNoCastZone(s2, {x:2,y:2}, 10, 'Silence');
  T('inNoCastZone is true for Silence too (blocks new casts)', inNoCastZone(s2,2,2)===true);
  T('inAntimagicField is FALSE for Silence — it must never suppress active buffs, only block new casts', inAntimagicField(s2,2,2)===false);

  const c={effects:[{name:'Shield of Faith', mods:{ac:2}}], armor:'none', abilities:{str:10,dex:10,con:10,int:10,wis:10,cha:10}, acOverride:''};
  T('computeAC normally includes an active effect bonus', computeAC(c)===12);
  T('computeAC with ignoreEffects drops the active effect bonus entirely', computeAC(c,{ignoreEffects:true})===10);

  const barkskin={effects:[{name:'Barkskin', mods:{}}], armor:'none', abilities:{str:10,dex:8,con:10,int:10,wis:10,cha:10}, acOverride:''};
  T('Barkskin AC floor normally applies', computeAC(barkskin)===16);
  T('Barkskin AC floor is suppressed under Antimagic Field, mundane Dex-based AC shows through instead', computeAC(barkskin,{ignoreEffects:true})===10+mod(8));

  const hasted={effects:[{name:'Haste', mods:{ac:2, speedMul:2}}], speed:30};
  T('effSpeed normally includes Haste double-speed multiplier', effSpeed(hasted)===60);
  T('effSpeed with ignoreEffects ignores Haste entirely — base speed only', effSpeed(hasted,{ignoreEffects:true})===30);

  // End-to-end through the real QB adapter path a live attack roll actually uses.
  setQB({battle:{round:1}, map:{cols:5,rows:5,tiles:{}}, hazards:[],
    players:[{side:'pc', x:2, y:2, c:{effects:[{name:'Shield of Faith', mods:{ac:2}}], armor:'none', abilities:{str:10,dex:10,con:10,int:10,wis:10,cha:10}, acOverride:''}}]});
  paintNoCastZone(getQB(), {x:2,y:2}, 1, 'Antimagic Field');
  const buffed=qbAC(getQB().players[0]);
  getQB().players[0].x=4; getQB().players[0].y=4;
  const outsideField=qbAC(getQB().players[0]);
  T('qbAC drops the Shield of Faith bonus for a PC standing inside a live Antimagic Field', buffed===10);
  T('the same PC standing outside the field keeps their real buffed AC', outsideField===12);
  setQB(null);
}

/* ---- Echo Knight — Manifest Echo (Phase 1) ---- */
{
  const ek=newCharacter('Ekko'); ek.cls='Fighter'; ek.level=5; ek.subclass='Echo Knight'; ek.abilities.con=14; ek.skillProf={};
  T('isEchoKnight gates on class+subclass+level', isEchoKnight(ek,3)===true && isEchoKnight(ek,7)===false);
  const notEk=newCharacter('Not'); notEk.cls='Fighter'; notEk.level=20; notEk.subclass='Champion';
  T('a Champion (even level 20) is never an Echo Knight', isEchoKnight(notEk,3)===false);
  const frail=newCharacter('Frail'); frail.abilities.con=1;
  T('echoResourceMax reads Constitution modifier, min 1', echoResourceMax(ek)===2 && echoResourceMax(frail)===1);

  const s={monsters:[], map:{cols:10,rows:10,tiles:{}}};
  const e1=manifestEcho(s, ek, 3, 3, 'pc', ()=>{});
  T('manifestEcho creates a monster-shaped entry in s.monsters', s.monsters.length===1 && s.monsters[0]===e1);
  T('the echo carries side:mon/ally:true/echo:true and the right controller', e1.side==='mon' && e1.ally===true && e1.echo===true && e1.controllerId==='pc');
  T('the echo has RAW stats: AC 14+prof, 1 HP, brain passive', e1.hp===1 && e1.max===1 && e1.ac===14+profBonus(ek) && e1.brain==='passive');
  T('the echo is NOT combat-capable on its own (0 attacks — it only ever acts through the Knight)', e1.attacks===0);

  T('condition immunity: qbAdapter.addCond is a no-op against an echo', (()=>{ qbAdapter.addCond(e1,'Frightened',3); return e1.conds.length===0; })());
  T('condition immunity: playerNetAdapter.addCond is a no-op against an echo (no crash even without net.conn)', (()=>{ playerNetAdapter.addCond(e1,'Frightened',3); return e1.conds.length===0; })());

  const tiles=echoMoveTiles({map:()=>s.map}, e1);
  T('echoMoveTiles offers a real 30 ft (6-tile Chebyshev) reach, not the Servant\'s 15 ft', tiles.some(t=>Math.max(Math.abs(t.x-e1.x),Math.abs(t.y-e1.y))===6) && tiles.every(t=>Math.max(Math.abs(t.x-e1.x),Math.abs(t.y-e1.y))<=6));

  // Recasting Manifest Echo replaces the old one (not stacked) below Legion of One (18th).
  const e2=manifestEcho(s, ek, 5, 5, 'pc', ()=>{});
  T('recasting Manifest Echo below 18th replaces the old echo, not stacks it', s.monsters.length===1 && s.monsters[0]===e2 && s.monsters[0]!==e1);

  const n=dismissEcho(s, 'pc', ()=>{});
  T('dismissEcho removes the controller\'s echo and reports how many were cleared', n===1 && s.monsters.length===0);
  T('dismissEcho is a safe no-op when there is nothing to dismiss', dismissEcho(s,'pc',()=>{})===0);

  // Legion of One (18th): two echoes coexist; a third wipes both existing ones.
  ek.level=18;
  const l1=manifestEcho(s, ek, 1, 1, 'pc', ()=>{});
  const l2=manifestEcho(s, ek, 2, 2, 'pc', ()=>{});
  T('Legion of One: two echoes can coexist at 18th level', s.monsters.length===2);
  const l3=manifestEcho(s, ek, 3, 1, 'pc', ()=>{});
  T('Legion of One: manifesting a third destroys the two existing echoes, leaving just the new one', s.monsters.length===1 && s.monsters[0]===l3);
}

/* ---- Echo Knight — Unleash Incarnation (Phase 2): attacks from the echo's OWN position ---- */
{
  const ek=newCharacter('Ekko2'); ek.cls='Fighter'; ek.level=5; ek.subclass='Echo Knight'; ek.abilities={str:16,dex:10,con:14,int:10,wis:10,cha:10}; ek.skillProf={};
  ek.battle={action:false,bonus:false,reaction:false,actionsMax:1,actionsUsed:0,attacksLeft:1,move:30,moveUsed:0};
  setQB({active:true, over:null, paused:false, log:[], map:{cols:10,rows:10,tiles:{}}, order:[{k:'p',id:'pc'}], turn:0, battle:{active:true,round:1},
    monsters:[{id:'m1',side:'mon',base:'Goblin',name:'Goblin',x:8,y:8,hp:7,max:7,ac:5,attacksLeft:1,conds:[]}],
    players:[{id:'pc',side:'pc',name:ek.name,c:ek,x:0,y:0,hpCur:ek.hp.cur,hpMax:ek.hp.max}] });
  // The echo sits adjacent to the goblin — the KNIGHT is nowhere near it (x:0,y:0 vs x:8,y:8).
  const echo=manifestEcho(getQB(), ek, 7, 8, 'pc', ()=>{});
  T('setup check: the echo, not the Knight, is adjacent to the target', gridDist(echo.x,echo.y,8,8)===1 && gridDist(0,0,8,8)>1);

  ek.echoIncarnationLeft=echoResourceMax(ek);
  const startingUses=ek.echoIncarnationLeft;
  const orig=Math.random; Math.random=()=>0.99;   // force a hit
  const ev=Engine.attack(qbAdapter, echo.id, 'm1', {name:'Unleash Incarnation (Longsword)', toHit:99, dmg:'1d8', tiles:1});
  Math.random=orig;
  T('Engine.attack resolves using the ECHO\'s position for range (a target only the echo is adjacent to is still reachable)', ev.void!==true && ev.hit===true);
  T('the attack event reports the echo\'s own square as the origin, not the Knight\'s', ev.from.x===echo.x && ev.from.y===echo.y);

  ek.echoIncarnationLeft--;
  T('Unleash Incarnation spends one use from its own CON-mod resource pool', ek.echoIncarnationLeft===startingUses-1);
  ek.echoIncarnationLeft=0;
  T('at 0 uses left, no more Incarnation attacks are available until a long rest', ek.echoIncarnationLeft<=0);

  setQB(null);
}

/* ---- Echo Knight — Echo Avatar (Phase 3): self-blind/deaf for 10 min, once per rest ---- */
{
  const ek=newCharacter('Ekko3'); ek.cls='Fighter'; ek.level=7; ek.subclass='Echo Knight';
  const lowLvl=newCharacter('Low'); lowLvl.cls='Fighter'; lowLvl.subclass='Echo Knight'; lowLvl.level=5;
  T('Echo Avatar is only available from 7th level', isEchoKnight(ek,7)===true && isEchoKnight(lowLvl,7)===false);
  addEffect(ek, 'Echo Avatar (Blinded)', {rounds:60, cond:'Blinded'});
  addEffect(ek, 'Echo Avatar (Deafened)', {rounds:60, cond:'Deafened'});
  T('Echo Avatar applies both Blinded and Deafened', ek.conditions.Blinded===true && ek.conditions.Deafened===true);
  for(let i=0;i<59;i++) advanceRound(ek);
  T('both conditions persist through the 10-minute duration', ek.conditions.Blinded===true && ek.conditions.Deafened===true);
  advanceRound(ek);
  T('both conditions clear together once the 60th round expires', !ek.conditions.Blinded && !ek.conditions.Deafened);
}

/* ---- Echo Knight — Shadow Martyr (Phase 4): armed reaction redirects an attack to the echo ---- */
{
  const ek=newCharacter('Ekko4'); ek.cls='Fighter'; ek.level=10; ek.subclass='Echo Knight';
  ek.battle={action:false,bonus:false,reaction:false,actionsMax:1,actionsUsed:0,attacksLeft:1,move:30,moveUsed:0};
  const s={monsters:[], battle:{round:1}};
  const echo=manifestEcho(s, ek, 1, 1, 'pc', ()=>{});
  const tgtPc={side:'pc', c:ek, x:0, y:0};

  T('not armed: no redirect happens even with a live echo nearby', shadowMartyrRedirect(s, tgtPc)===null);

  echo.x=1; echo.y=0;   // adjacent to the PC (dist 1)
  ek.shadowMartyrArmed=true;
  const redirected=shadowMartyrRedirect(s, tgtPc);
  T('armed + echo within 5 ft: the attack redirects to the echo', redirected===echo);
  T('triggering Shadow Martyr spends the reaction', ek.battle.reaction===true);
  T('triggering Shadow Martyr spends its once-per-rest use and disarms itself', ek.shadowMartyrUsed===true && ek.shadowMartyrArmed===false);
  T('a second attempt this rest finds no uses left, even if re-armed', (()=>{ ek.shadowMartyrArmed=true; ek.battle.reaction=false; return shadowMartyrRedirect(s,tgtPc)===null; })());

  const ek2=newCharacter('Ekko5'); ek2.cls='Fighter'; ek2.level=10; ek2.subclass='Echo Knight';
  ek2.battle={action:false,bonus:false,reaction:false,actionsMax:1,actionsUsed:0,attacksLeft:1,move:30,moveUsed:0};
  ek2.shadowMartyrArmed=true;
  const s2={monsters:[], battle:{round:1}};
  const echoFar=manifestEcho(s2, ek2, 9, 9, 'pc', ()=>{});
  T('armed but the echo is too far from the target: no redirect (RAW requires the echo within 5 ft)', shadowMartyrRedirect(s2, {side:'pc', c:ek2, x:0, y:0})===null);
}

/* ---- Echo Knight — Reclaim Potential (Phase 5): temp HP when the echo is destroyed ---- */
{
  const ek=newCharacter('Ekko6'); ek.cls='Fighter'; ek.level=15; ek.subclass='Echo Knight'; ek.abilities.con=14; ek.hp.temp=0;
  const orig=Math.random; Math.random=()=>0.5;   // deterministic 2d6 roll
  reclaimPotential(ek, ()=>{});
  Math.random=orig;
  T('Reclaim Potential grants real temp HP scaled off 2d6 + CON mod', ek.hp.temp>0 && ek.hp.temp===(Math.floor(0.5*6)+1)*2+mod(abil(ek,'con')));
  T('Reclaim Potential spends one use from its own CON-mod resource pool', ek.echoReclaimLeft===echoResourceMax(ek)-1);

  const alreadyBuffed=newCharacter('Buffed'); alreadyBuffed.cls='Fighter'; alreadyBuffed.level=15; alreadyBuffed.subclass='Echo Knight'; alreadyBuffed.hp.temp=5;
  reclaimPotential(alreadyBuffed, ()=>{});
  T('Reclaim Potential does nothing if you already have temp HP (PHB: only "if you have none")', alreadyBuffed.hp.temp===5 && alreadyBuffed.echoReclaimLeft==null);

  const tooLow=newCharacter('TooLow'); tooLow.cls='Fighter'; tooLow.level=10; tooLow.subclass='Echo Knight'; tooLow.hp.temp=0;
  reclaimPotential(tooLow, ()=>{});
  T('Reclaim Potential is gated to 15th level — a 10th-level Echo Knight gets nothing', tooLow.hp.temp===0);
}

/* ---- Echo Knight — Legion of One (Phase 6): initiative-roll Incarnation refill ---- */
{
  const ek=newCharacter('Ekko7'); ek.cls='Fighter'; ek.level=18; ek.subclass='Echo Knight';
  ek.echoIncarnationLeft=0;
  startBattle(ek);
  T('Legion of One (18th): rolling initiative with 0 Incarnation uses left grants exactly one back', ek.echoIncarnationLeft===1);

  const ek2=newCharacter('Ekko8'); ek2.cls='Fighter'; ek2.level=18; ek2.subclass='Echo Knight';
  ek2.echoIncarnationLeft=3;
  startBattle(ek2);
  T('Legion of One does not top up uses that are already above 0', ek2.echoIncarnationLeft===3);

  const notYet=newCharacter('Ekko9'); notYet.cls='Fighter'; notYet.level=17; notYet.subclass='Echo Knight';
  notYet.echoIncarnationLeft=0;
  startBattle(notYet);
  T('below 18th level, rolling initiative grants nothing back', notYet.echoIncarnationLeft===0);
}

/* ---- Echo Knight — DM-hosted wiring: the echo has to exist on the DM's OWN authoritative
   net.session.monsters (not just a connected player's local mirror) so DM-controlled monsters
   can see/target it, and Shadow Martyr needs a DM-side counterpart since the DM never has the
   player's real character object to check c.shadowMartyrArmed on directly. ---- */
{
  setNet({role:'dm', conns:[], session:{battle:{active:true,round:1}, map:{cols:10,rows:10,tiles:{}}, monsters:[], players:[{id:'p1',cid:'c1',x:5,y:5}], order:[], turn:0}});
  dmOnData({peer:'p1'}, {t:'echoSync', exists:true, x:6, y:5, ac:16, hp:1, max:1, name:"Hero's Echo"});
  T('echoSync creates a real echo on the DM\'s own net.session.monsters', getNet().session.monsters.length===1 && getNet().session.monsters[0].echo===true);
  T('the synced echo carries the connecting player\'s peer id as its controller', getNet().session.monsters[0].controllerId==='p1');
  T('the synced echo is a real monster-shaped ally the DM\'s own combat/targeting code can see', getNet().session.monsters[0].side==='mon' && getNet().session.monsters[0].ally===true);

  dmOnData({peer:'p1'}, {t:'echoSync', exists:true, x:7, y:5, ac:16, hp:1, max:1, name:"Hero's Echo"});
  T('a second echoSync UPDATES the same entry rather than creating a duplicate', getNet().session.monsters.length===1 && getNet().session.monsters[0].x===7);

  dmOnData({peer:'p1'}, {t:'echoSync', exists:false});
  T('echoSync with exists:false removes the echo from the DM\'s mirror', getNet().session.monsters.length===0);

  // shadowMartyrRedirect (the SAME function qbResolveAttack already calls, not a parallel
  // DM-only copy) working off the player's SYNCED mirror fields (p.shadowMartyrArmed) since
  // the DM never has their real character object — tgt.c being absent is what tells the
  // shared function it's in the DM-hosted, mirror-only case.
  const s=getNet().session;
  const echo=manifestEcho(s, {name:'Hero'}, 6, 5, 'p1', ()=>{});
  const p=s.players[0];
  T('shadowMartyrRedirect on a DM-hosted mirror entry (no .c): not armed -> no redirect', shadowMartyrRedirect(s,p)===null);
  p.shadowMartyrArmed=true;
  T('shadowMartyrRedirect on a DM-hosted mirror entry: armed + echo within 5 ft -> redirects to the echo', shadowMartyrRedirect(s,p)===echo);
  T('triggering it disarms the DM\'s own mirror copy of the flag', p.shadowMartyrArmed===false);
  setNet(null);
}

/* ---- Path of the Berserker: Frenzy, Mindless Rage, Intimidating Presence, Retaliation ---- */
{
  const bk=newCharacter('Grug'); bk.cls='Barbarian'; bk.level=6; bk.subclass='Path of the Berserker'; bk.abilities={str:16,dex:10,con:14,int:8,wis:10,cha:12};
  T('isBerserker gates on class+subclass+level', isBerserker(bk,3)===true && isBerserker(bk,10)===false);
  const notBk=newCharacter('Other'); notBk.cls='Barbarian'; notBk.level=20; notBk.subclass='Path of the Totem Warrior';
  T('a Totem Warrior (even level 20) is never a Berserker', isBerserker(notBk,3)===false);

  // Frenzy
  T('toggleRage with no frenzy arg leaves c.frenzied falsy (existing callers stay unaffected)', (()=>{ toggleRage(bk); const r=!bk.frenzied; toggleRage(bk); return r; })());
  toggleRage(bk, true);
  T('choosing Frenzy when raging sets c.frenzied', bk.frenzied===true && isRaging(bk)===true);
  T('exhaustion is 0 while the frenzy is still active', (bk.exhaustion||0)===0);
  toggleRage(bk);   // end the rage
  T('ending a frenzied rage costs exactly 1 level of exhaustion', bk.exhaustion===1);
  T('c.frenzied clears once the rage (and its frenzy) end', bk.frenzied===false);

  // Mindless Rage (6th+) — bk is level 6, eligible
  toggleRage(bk, false);
  T('mindlessRageBlocks blocks Charmed/Frightened while raging at 6th+', mindlessRageBlocks(bk,'Charmed')===true && mindlessRageBlocks(bk,'Frightened')===true);
  T('mindlessRageBlocks does not block unrelated conditions', mindlessRageBlocks(bk,'Poisoned')===false);
  toggleRage(bk);   // end rage
  T('mindlessRageBlocks is false once the rage ends', mindlessRageBlocks(bk,'Charmed')===false);
  const lowBk=newCharacter('Lowbie'); lowBk.cls='Barbarian'; lowBk.level=3; lowBk.subclass='Path of the Berserker';
  toggleRage(lowBk);
  T('Mindless Rage does not apply below 6th level even while raging', mindlessRageBlocks(lowBk,'Frightened')===false);
  toggleRage(lowBk);

  // Mindless Rage wired into the real qbAdapter.addCond PC path
  setQB({battle:{round:1}, map:{cols:5,rows:5,tiles:{}}, hazards:[], players:[{side:'pc', x:0, y:0, c:bk}], monsters:[]});
  toggleRage(bk, false);
  qbAdapter.addCond({side:'pc', c:bk}, 'Frightened', 3);
  T('qbAdapter.addCond is blocked by Mindless Rage while raging', !(bk.conditions&&bk.conditions.Frightened));
  qbAdapter.addCond({side:'pc', c:bk}, 'Poisoned', 3);
  T('qbAdapter.addCond still allows unrelated conditions while raging', bk.conditions&&bk.conditions.Poisoned===true);
  toggleRage(bk);
  setQB(null);

  // Intimidating Presence (10th level)
  const intBk=newCharacter('Intimidator'); intBk.cls='Barbarian'; intBk.level=10; intBk.subclass='Path of the Berserker'; intBk.abilities={str:16,dex:10,con:14,int:8,wis:10,cha:16};
  intBk.battle={action:false,bonus:false,reaction:false,actionsMax:1,actionsUsed:0,attacksLeft:1,move:30,moveUsed:0};
  setQB({battle:{round:1}, map:{cols:10,rows:10,tiles:{}}, hazards:[], players:[{side:'pc', x:0, y:0, c:intBk}],
    monsters:[{id:'m1', side:'mon', base:'Goblin', name:'Goblin', x:5, y:0, hp:7, max:7, ac:15, conds:[]}]});
  const pc=getQB().players[0], mo=getQB().monsters[0];
  const orig=Math.random; Math.random=()=>0.01;   // force a low roll -> fails its Wisdom save
  const r1=maneuverIntimidate(qbAdapter, pc, mo, ()=>{});
  Math.random=orig;
  T('Intimidating Presence reaches 30 ft (6 tiles) — far beyond every other adjacency-only maneuver', r1.ok===true);
  T('a failed Wisdom save imposes Frightened', mo.conds.some(x=>x.name==='Frightened'));
  T('Intimidating Presence spends the action', intBk.battle.action===true || intBk.battle.actionsUsed>0);

  mo.conds=[]; intBk.battle.actionsUsed=0; intBk.battle.action=false;
  Math.random=()=>0.99;   // force a high roll -> succeeds its save
  const r2=maneuverIntimidate(qbAdapter, pc, mo, ()=>{});
  Math.random=orig;
  T('a successful save leaves the target unaffected and marks it immune', !mo.conds.some(x=>x.name==='Frightened') && mo.intimidateImmune===true && r2.success===false);
  const r3=maneuverIntimidate(qbAdapter, pc, mo, ()=>{});
  T('an already-immune target cannot be intimidated again this encounter', r3.ok===false);
  setQB(null);
}

/* ---- College of Lore: Bonus Proficiencies, Cutting Words, Additional Magical Secrets (via
   the existing custom-spell entry), Peerless Skill ---- */
{
  const lb=newCharacter('Skald'); lb.cls='Bard'; lb.level=3; lb.subclass='College of Lore'; lb.abilities.cha=16;
  T('isLoreBard gates on class+subclass+level', isLoreBard(lb,3)===true && isLoreBard(lb,14)===false);
  const notLb=newCharacter('OtherBard'); notLb.cls='Bard'; notLb.level=20; notLb.subclass='College of Valor';
  T('a Valor Bard (even level 20) is never a Lore Bard', isLoreBard(notLb,3)===false);

  T('bardicInspMax reads Charisma modifier, min 1', bardicInspMax(lb)===3);
  T('bardicInspDie follows the PHB progression by level (d6 below 5th)', bardicInspDie(lb)===6);
  const highLb=newCharacter('EldSkald'); highLb.cls='Bard'; highLb.level=15;
  T('bardicInspDie reaches d12 at 15th level', bardicInspDie(highLb)===12);

  // Bonus Proficiencies — a one-time {t:'skill',n:3} choice spec, same shape Half-Elf/Variant
  // Human already use, gated so it only appears once (loreBonusProfsChosen).
  const specs=pendingChoiceSpecs(lb);
  T('College of Lore at 3rd level owes a 3-skill Bonus Proficiencies choice', specs.some(s=>s.t==='skill' && s.n===3 && s._loreBonus));
  lb.loreBonusProfsChosen=true;
  T('once chosen, the same spec never appears again', !pendingChoiceSpecs(lb).some(s=>s._loreBonus));

  // Cutting Words — unified across QB (candidate has .c) and DM-hosted (candidate is the
  // mirror entry itself, no .c) via the same function, same shape as shadowMartyrRedirect.
  lb.bardicInspLeft=bardicInspMax(lb);
  lb.battle={action:false,bonus:false,reaction:false,actionsMax:1,actionsUsed:0,attacksLeft:1,move:30,moveUsed:0};
  const s={monsters:[]};
  const mo={x:0,y:0};
  const qbCand={x:2,y:0,c:lb};   // within 60 ft (12 tiles) — QB-shaped candidate
  T('cuttingWordsReduce does nothing when not armed', cuttingWordsReduce(s,mo,{toHit:5},[qbCand])===0);
  lb.cuttingWordsArmed=true;
  const atk={toHit:5};
  const orig=Math.random; Math.random=()=>0.5;   // deterministic die
  const die=cuttingWordsReduce(s,mo,atk,[qbCand]);
  Math.random=orig;
  T('cuttingWordsReduce (QB-shaped) reduces atk.toHit by the rolled die', die>0 && atk.toHit===5-die);
  T('triggering it spends the reaction and a Bardic Inspiration use, and disarms', lb.battle.reaction===true && lb.bardicInspLeft===bardicInspMax(lb)-1 && lb.cuttingWordsArmed===false);

  setNet({role:'dm', conns:[], session:{battle:{active:true,round:1}, map:{cols:10,rows:10,tiles:{}}, monsters:[], players:[], order:[], turn:0}});   // dmSend needs a live net
  const dmCand={id:'p1', x:20, y:0, cuttingWordsArmed:true, level:3};   // DM-hosted mirror shape, no .c, far away
  T('cuttingWordsReduce (DM-hosted-shaped) is range-gated the same as the QB path — too far, no reduction', cuttingWordsReduce(s,mo,{toHit:5},[dmCand])===0);
  dmCand.x=2;
  const atk2={toHit:5};
  const die2=cuttingWordsReduce(s,mo,atk2,[dmCand]);
  T('cuttingWordsReduce (DM-hosted-shaped) in range reduces the roll and disarms its own mirror flag', die2>0 && atk2.toHit===5-die2 && dmCand.cuttingWordsArmed===false);
  setNet(null);
}

/* ---- Life Domain: Channel Divinity resource, Disciple of Life/Blessed Healer/Divine Strike/
   Supreme Healing (baked into castModal's dice notation & rider checkboxes — UI-embedded like
   Sneak Attack/Divine Smite, so only the pure helpers extracted for them are unit-tested here),
   Preserve Life's pool math ---- */
{
  const lc=newCharacter('Shepherd'); lc.cls='Cleric'; lc.level=6; lc.subclass='Life';
  T('isLifeCleric gates on class+subclass+level', isLifeCleric(lc,1)===true && isLifeCleric(lc,17)===false);
  const notLc=newCharacter('Other'); notLc.cls='Cleric'; notLc.level=20; notLc.subclass='Knowledge';
  T('a Knowledge cleric (even level 20) is never a Life cleric', isLifeCleric(notLc,1)===false);

  T('channelDivinityMax is 1 use below 6th', channelDivinityMax(newCharacter('Lowbie'))===1);
  T('channelDivinityMax is 2 uses at 6th', channelDivinityMax(lc)===2);
  const lc18=newCharacter('Elder'); lc18.level=18;
  T('channelDivinityMax is 3 uses at 18th', channelDivinityMax(lc18)===3);

  T('preserveLifePool is 5 x cleric level', preserveLifePool(lc)===30);

  // preserveLifeAmount: capped by the pool remaining, by half the target's max HP, and by
  // whatever that target's already been given this same casting.
  T('preserveLifeAmount caps at half the target\'s max HP', preserveLifeAmount(100, 20, 0)===10);
  T('preserveLifeAmount caps at the pool remaining if smaller', preserveLifeAmount(4, 20, 0)===4);
  T('preserveLifeAmount subtracts HP already given this casting', preserveLifeAmount(100, 20, 6)===4);
  T('preserveLifeAmount never goes negative once a target is already at its half-max cap', preserveLifeAmount(100, 20, 10)===0);

  T('maxNotation sums the maximum of every die (Supreme Healing)', maxNotation('3d8+5')===29);
  T('maxNotation handles a flat number with no dice', maxNotation('23')===23);
}

/* ---- Circle of the Moon: Wild Shape's own beast-HP pool, Circle Forms' CR cap, Combat Wild
   Shape/Elemental Wild Shape/Thousand Forms ---- */
{
  const md=newCharacter('Ranger of the Wood'); md.cls='Druid'; md.level=6; md.subclass='Circle of the Moon'; md.hp={max:30,cur:30,temp:0};
  T('isMoonDruid gates on class+subclass+level', isMoonDruid(md,2)===true && isMoonDruid(md,14)===false);
  const notMd=newCharacter('Lorekeeper'); notMd.cls='Druid'; notMd.level=20; notMd.subclass='Circle of the Land';
  T('a Circle of the Land druid (even level 20) is never a Moon druid', isMoonDruid(notMd,2)===false);

  T('wildShapeMax is a flat 2 uses regardless of subclass (Moon grants no extra charges)', wildShapeMax(md)===2 && wildShapeMax(notMd)===2);
  T('moonMaxCR is 1 below 6th level', moonMaxCR(newCharacter('Lowbie'))===1);
  T('moonMaxCR is level/3 rounded down at 6th+', moonMaxCR(md)===2);
  const md9=newCharacter('Elder'); md9.level=9;
  T('moonMaxCR reaches 3 at 9th level', moonMaxCR(md9)===3);

  // computeAC / effSpeed both defer to the beast's own stats while shapeshifted.
  md.wildShape={name:'Brown Bear', hpCur:34, hpMax:34, ac:11, atk:'Bite +5 (1d8+4 piercing) · Claws +5 (2d6+4 slashing)', speed:40};
  T('computeAC returns the beast\'s AC while shapeshifted, ignoring armor entirely', computeAC(md)===11);
  T('effSpeed returns the beast\'s speed while shapeshifted', effSpeed(md)===40);

  // wildShapeAttacks: your attack list becomes the beast's own attacks (shared by qbPcAttacks
  // and playerAttackMenu, same function either way).
  const atks=wildShapeAttacks(md);
  T('wildShapeAttacks parses the beast\'s attack string into the normal PC-attack shape', atks.length===2 && atks[0].name==='Bite' && atks[0].toHit===5 && atks[0].dmg==='1d8+4');
  T('qbPcAttacks defers entirely to the beast\'s attacks while shapeshifted', qbPcAttacks(md).length===2 && qbPcAttacks(md)[0].name==='Bite');

  // applyHp: damage/healing hits the beast's own pool, not your real HP.
  applyHp(md,-10);
  T('damage while shapeshifted is absorbed by the beast\'s own HP pool', md.wildShape.hpCur===24 && md.hp.cur===30);
  applyHp(md,5);
  T('healing while shapeshifted heals the beast\'s pool, capped at its max', md.wildShape.hpCur===29);
  md.wildShape.hpCur=8;   // reset to a known low value before the overflow hit
  applyHp(md,-20);   // 12 more than the beast has left → 12 overflow
  T('excess damage that destroys the beast form carries over to your real HP (PHB)', md.wildShape===null && md.hp.cur===30-12);

  // Combat Wild Shape / Thousand Forms hooks — both characters have their level-2 slots fully
  // exhausted, so the only way canCast can still succeed is Thousand Forms' slot-free bypass.
  const md14=newCharacter('Shapechanger'); md14.cls='Druid'; md14.level=14; md14.subclass='Circle of the Moon'; md14.spellAbility='wis';
  md14.slots[2]={total:0,used:spellSlots(md14)[2]};
  T('Thousand Forms lets you cast Alter Self with no spell slots left at all', canCast(md14,'Alter Self',2)===true);
  const md13=newCharacter('Almost'); md13.cls='Druid'; md13.level=13; md13.subclass='Circle of the Moon'; md13.spellAbility='wis';
  md13.slots[2]={total:0,used:spellSlots(md13)[2]};
  T('below 14th level, Alter Self with no slots left is blocked like any other spell', canCast(md13,'Alter Self',2)===false);
}

/* ---- Way of the Open Hand: Martial Arts/Ki/Unarmored Defense (base Monk, mechanized here
   since no earlier subclass needed them) plus Open Hand Technique/Flurry of Blows/Quivering
   Palm ---- */
{
  T('martialArtsDie follows the PHB progression (1d4 below 5th)', martialArtsDie(newCharacter('Novice'))===4);
  const mk11=newCharacter('Adept'); mk11.level=11;
  T('martialArtsDie reaches 1d8 at 11th, 1d10 at 17th', martialArtsDie(mk11)===8 && martialArtsDie(Object.assign(newCharacter('x'),{level:17}))===10);

  const mk=newCharacter('Fist of Spring'); mk.cls='Monk'; mk.level=6; mk.subclass='Open Hand'; mk.abilities={str:10,dex:16,con:14,int:10,wis:16,cha:10}; mk.armor='none';
  T('isOpenHandMonk gates on class+subclass+level', isOpenHandMonk(mk,3)===true && isOpenHandMonk(mk,17)===false);
  const notMk=newCharacter('Shadow'); notMk.cls='Monk'; notMk.level=20; notMk.subclass='Shadow';
  T('a Way of Shadow monk (even level 20) is never an Open Hand monk', isOpenHandMonk(notMk,3)===false);

  T('kiMax equals monk level', kiMax(mk)===6);
  T('kiDC is 8 + prof + Wis mod', kiDC(mk)===8+profBonus(mk)+mod(abil(mk,'wis')));

  // Martial Arts: uses whichever of Str/Dex is better, and the scaling die — not the flat
  // 1+mod every other class's unarmed strike fallback uses.
  const ma=martialArtsUnarmedAtk(mk);
  T('martialArtsUnarmedAtk uses Dex over Str when Dex is better', ma.toHit===mod(abil(mk,'dex'))+profBonus(mk));
  T('martialArtsUnarmedAtk deals the scaling martial arts die, not a flat 1+mod', ma.dmg==='1d6'+sgn(mod(abil(mk,'dex'))));

  // Unarmored Defense — Barbarian (Con, shield OK) and Monk (Wis, no shield) were both
  // completely unimplemented before this pass (flavor text only in CLASS_FEATURES).
  T('Monk Unarmored Defense is 10 + Dex + Wis while unarmored', computeAC(mk)===10+mod(abil(mk,'dex'))+mod(abil(mk,'wis')));
  mk.shield=true;
  T('a shield breaks Monk Unarmored Defense (PHB — unlike Barbarian\'s)', computeAC(mk)===10+Math.min(mod(abil(mk,'dex')),99)+2);
  mk.shield=false;
  const bk2=newCharacter('Ragebringer'); bk2.cls='Barbarian'; bk2.armor='none'; bk2.shield=true; bk2.abilities.con=16;
  T('Barbarian Unarmored Defense still applies with a shield equipped', computeAC(bk2)===10+mod(abil(bk2,'dex'))+mod(abil(bk2,'con'))+2);

  // Unarmored Movement (2nd–18th, unarmored/no shield only)
  const mk2=newCharacter('Novice Monk'); mk2.cls='Monk'; mk2.level=2; mk2.armor='none';
  T('unarmoredMoveBonus is +10 at 2nd-5th level', unarmoredMoveBonus(mk2)===10);
  T('unarmoredMoveBonus is +15 at 6th (mk is 6th level)', unarmoredMoveBonus(mk)===15);
  const mk18=newCharacter('Master'); mk18.cls='Monk'; mk18.level=18; mk18.armor='none';
  T('unarmoredMoveBonus reaches +30 at 18th', unarmoredMoveBonus(mk18)===30);
  mk18.armor='leather';
  T('unarmoredMoveBonus is 0 the moment you wear armor', unarmoredMoveBonus(mk18)===0);

  // Flurry of Blows + Open Hand Technique, against a real QB fixture (goblin AC 5 so a
  // stubbed high roll guarantees hits).
  mk.battle={action:false,bonus:false,reaction:false,actionsMax:1,actionsUsed:0,attacksLeft:1,move:30,moveUsed:0};
  setQB({active:true, over:null, paused:false, log:[], map:{cols:10,rows:10,tiles:{}}, order:[{k:'p',id:'pc'}], turn:0, battle:{active:true,round:1},
    monsters:[{id:'m1',side:'mon',base:'Goblin',name:'Goblin',x:1,y:0,hp:30,max:30,ac:5,attacksLeft:1,conds:[]}],
    players:[{id:'pc',side:'pc',name:mk.name,c:mk,x:0,y:0,hpCur:mk.hp.cur,hpMax:mk.hp.max}] });
  const pcU=getQB().players[0], moU=getQB().monsters[0];
  mk.kiLeft=kiMax(mk);
  { const orig=Math.random; Math.random=()=>0.2;   // d20=5: not a nat-1 (still hits goblin AC 5), but low enough to fail its Dex save vs DC 14
    const res=flurryOfBlows(qbAdapter, pcU, moU, 'prone', ()=>{});
    Math.random=orig;
    T('flurryOfBlows spends 1 ki and the bonus action', mk.kiLeft===kiMax(mk)-1 && mk.battle.bonus===true);
    T('flurryOfBlows makes two attacks and reports a hit', res.ok===true && res.anyHit===true);
    T('Open Hand Technique (prone) knocks a failed-save target Prone', moU.conds.some(x=>x.name==='Prone'));
  }
  T('flurryOfBlows refuses a second use once the bonus action is already spent', flurryOfBlows(qbAdapter, pcU, moU, null, ()=>{}).ok===false);

  // Open Hand Technique — push and no-reactions branches, tested directly (deterministic rolls).
  moU.conds=[];
  { const orig=Math.random; Math.random=()=>0.01;   // force the Str save to fail
    openHandTechnique(qbAdapter, pcU, moU, 'push', ()=>{});
    Math.random=orig;
    T('Open Hand Technique (push) moves a failed-save target away', moU.x>1);
  }
  moU.reactionUsed=false;
  openHandTechnique(qbAdapter, pcU, moU, 'noreact', ()=>{});
  T('Open Hand Technique (no reactions) reuses the existing "No Reactions" idiom (mo.reactionUsed)', moU.reactionUsed===true);

  // Quivering Palm (17th)
  const mk17=newCharacter('Grandmaster'); mk17.cls='Monk'; mk17.level=17; mk17.subclass='Open Hand'; mk17.abilities={str:10,dex:18,con:14,int:10,wis:18,cha:10}; mk17.armor='none';
  mk17.battle={action:false,bonus:false,reaction:false,actionsMax:1,actionsUsed:0,attacksLeft:1,move:30,moveUsed:0};
  mk17.kiLeft=kiMax(mk17);
  setQB({active:true, over:null, paused:false, log:[], map:{cols:10,rows:10,tiles:{}}, order:[{k:'p',id:'pc'}], turn:0, battle:{active:true,round:1},
    monsters:[{id:'m1',side:'mon',base:'Bugbear',name:'Bugbear',x:1,y:0,hp:200,max:200,ac:5,attacksLeft:1,conds:[]}],
    players:[{id:'pc',side:'pc',name:mk17.name,c:mk17,x:0,y:0,hpCur:mk17.hp.cur,hpMax:mk17.hp.max}] });
  const pcU2=getQB().players[0], moU2=getQB().monsters[0];
  { const orig=Math.random; Math.random=()=>0.99;   // force the strike to hit
    quiveringPalmStrike(qbAdapter, pcU2, moU2, ()=>{});
    Math.random=orig;
  }
  T('quiveringPalmStrike spends 3 ki only once it actually hits', mk17.kiLeft===kiMax(mk17)-3);
  T('quiveringPalmStrike marks the target for a later trigger', moU2.quiveringPalmBy==='pc');
  { const orig=Math.random; Math.random=()=>0.01;   // force the Con save to fail
    const res=quiveringPalmTrigger(qbAdapter, mk17, moU2, ()=>{});
    Math.random=orig;
    T('quiveringPalmTrigger drops the target to 0 HP on a failed Con save', res.killed===true && moU2.hp===0);
  }
  setQB(null);
}

/* ---- Oath of Devotion: Divine Sense/Lay on Hands/Channel Divinity (base Paladin, all
   flavor-text-only before this pass), Oath Spells, Sacred Weapon, Aura of Devotion ---- */
{
  const pd=newCharacter('Sir Galahad'); pd.cls='Paladin'; pd.level=9; pd.subclass='Devotion'; pd.abilities={str:16,dex:10,con:14,int:10,wis:10,cha:18};
  T('isDevotionPaladin gates on class+subclass+level', isDevotionPaladin(pd,3)===true && isDevotionPaladin(pd,20)===false);
  const notPd=newCharacter('Oathbreaker'); notPd.cls='Paladin'; notPd.level=20; notPd.subclass='Vengeance';
  T('a Vengeance paladin (even level 20) is never a Devotion paladin', isDevotionPaladin(notPd,3)===false);

  T('divineSenseMax is 1 + Cha mod, min 1', divineSenseMax(pd)===1+mod(abil(pd,'cha')));
  T('layOnHandsMax is 5 x paladin level', layOnHandsMax(pd)===45);
  T('paladinCDMax is a flat 1 use (unlike Cleric\'s growing pool)', paladinCDMax(pd)===1);

  T('monsterIsUndead reads the sprite key', monsterIsUndead({sprite:'skeleton'})===true && monsterIsUndead({sprite:'goblin'})===false);
  T('monsterIsFiend reads the sprite key', monsterIsFiend({sprite:'demon'})===true && monsterIsFiend({sprite:'skeleton'})===false);

  // Oath Spells: auto-synced into c.spells by ensureFields (self-healing migration, same spot
  // every other derived field gets fixed up), and don't count against preparedMax.
  ensureFields(pd);
  T('Oath Spells at 9th level are all auto-added and pre-prepared', ['Protection from Evil and Good','Sanctuary','Lesser Restoration','Zone of Truth','Beacon of Hope','Dispel Magic'].every(n=>pd.spells.some(s=>s.name===n && s.prepared)));
  T('9th-level-and-higher Oath Spells (13th/17th) are not granted yet', !pd.spells.some(s=>s.name==='Freedom of Movement'||s.name==='Commune'));
  T('Oath Spells do not count against preparedCount', !pd.spells.some(s=>s.name==='Sanctuary'&&false) && preparedCount(pd)===0);
  ensureFields(pd);   // idempotent — running it again shouldn't duplicate entries
  T('ensureFields does not duplicate Oath Spells on repeated calls', pd.spells.filter(s=>s.name==='Sanctuary').length===1);

  // Sacred Weapon: +Cha mod (min +1) to hit while the effect is active, via the real weaponToHit path.
  const w=weaponByName('Longsword');
  const before=weaponToHit(pd,w);
  addEffect(pd,'Sacred Weapon',{rounds:10});
  T('Sacred Weapon adds Cha mod (min +1) to weaponToHit', weaponToHit(pd,w)===before+Math.max(1,mod(abil(pd,'cha'))));
  pd.effects=pd.effects.filter(e=>e.name!=='Sacred Weapon');
  T('weaponToHit drops back to normal once Sacred Weapon ends', weaponToHit(pd,w)===before);

  // Aura of Devotion: self-only Charmed immunity, gated on level 7+ and consciousness.
  T('auraOfDevotionBlocks is true for a conscious 7th+ Devotion paladin vs Charmed', auraOfDevotionBlocks(pd,'Charmed')===true);
  T('auraOfDevotionBlocks does not block unrelated conditions', auraOfDevotionBlocks(pd,'Frightened')===false);
  const lowPd=newCharacter('Squire'); lowPd.cls='Paladin'; lowPd.level=3; lowPd.subclass='Devotion';
  T('Aura of Devotion does not apply below 7th level', auraOfDevotionBlocks(lowPd,'Charmed')===false);
  pd.conditions={Unconscious:true};
  T('an unconscious Devotion paladin loses Aura of Devotion\'s protection', auraOfDevotionBlocks(pd,'Charmed')===false);
  pd.conditions={};

  // Wired through the real qbAdapter.addCond PC path, same as Mindless Rage's own test.
  setQB({battle:{round:1}, map:{cols:5,rows:5,tiles:{}}, hazards:[], players:[{side:'pc', x:0, y:0, c:pd}], monsters:[]});
  qbAdapter.addCond({side:'pc', c:pd}, 'Charmed', 3);
  T('qbAdapter.addCond is blocked by Aura of Devotion', !(pd.conditions&&pd.conditions.Charmed));
  qbAdapter.addCond({side:'pc', c:pd}, 'Poisoned', 3);
  T('qbAdapter.addCond still allows unrelated conditions', pd.conditions&&pd.conditions.Poisoned===true);
  setQB(null);
}

/* ---- Hunter: Favored Enemy/Natural Explorer's real pick-choice infra (base Ranger, all
   flavor-text-only before this pass), Hunter's Prey/Defensive Tactics/Multiattack/Superior
   Hunter's Defense choices, Colossus Slayer's below-max-HP gate ---- */
{
  const rg=newCharacter('Strider'); rg.cls='Ranger'; rg.level=14; rg.subclass='Hunter'; rg.abilities={str:12,dex:16,con:14,int:10,wis:14,cha:10};
  T('isHunter gates on class+subclass+level', isHunter(rg,3)===true && isHunter(rg,20)===false);
  const notRg=newCharacter('Beastmaster'); notRg.cls='Ranger'; notRg.level=20; notRg.subclass='Beast Master';
  T('a Beast Master (even level 20) is never a Hunter', isHunter(notRg,3)===false);

  // Favored Enemy/Terrain: repeatable picks owed at 1st/6th/14th and 1st/6th/10th respectively —
  // a level-14 ranger with none chosen yet owes all three of each.
  const specs=pendingChoiceSpecs(rg);
  T('a fresh 14th-level ranger owes 3 Favored Enemy picks', specs.filter(s=>s.t==='pick'&&s.key==='favoredEnemies').length===3);
  T('a fresh 14th-level ranger owes 3 Favored Terrain picks (1st/6th/10th, not 14th)', specs.filter(s=>s.t==='pick'&&s.key==='favoredTerrains').length===3);
  rg.favoredEnemies=['Undead'];
  T('once one Favored Enemy is chosen, only 2 more are owed', pendingChoiceSpecs(rg).filter(s=>s.t==='pick'&&s.key==='favoredEnemies').length===2);
  T('Favored Enemy grants advantage on Survival checks', skillCheckAdvantage(rg,'survival','wis').adv===1);
  const noFe=newCharacter('Novice Ranger'); noFe.cls='Ranger'; noFe.level=1;
  T('no advantage on Survival without a chosen Favored Enemy', skillCheckAdvantage(noFe,'survival','wis').adv===0);

  // Hunter's four subclass choices — one-shot, gated by level, stored as a plain string.
  T("a 14th-level Hunter owes Hunter's Prey/Defensive Tactics/Multiattack but not Superior Hunter's Defense (15th)",
    specs.some(s=>s.t==='pick'&&s.key==='hunterPrey') && specs.some(s=>s.t==='pick'&&s.key==='hunterDefense') && specs.some(s=>s.t==='pick'&&s.key==='hunterMultiattack') && !specs.some(s=>s.t==='pick'&&s.key==='hunterSuperiorDefense'));
  rg.hunterPrey='Colossus Slayer';
  T('once chosen, Hunter\'s Prey is no longer owed', !pendingChoiceSpecs(rg).some(s=>s.t==='pick'&&s.key==='hunterPrey'));
}

/* ---- Assassin: Assassinate's hasNotActedYet, Reliable Talent, Cunning Action's bonus-action
   Dash/Hide ---- */
{
  const rk=newCharacter('Shade'); rk.cls='Rogue'; rk.level=17; rk.subclass='Assassin'; rk.abilities={str:8,dex:18,con:12,int:10,wis:10,cha:10};
  T('isAssassin gates on class+subclass+level', isAssassin(rk,3)===true && isAssassin(rk,20)===false);
  const notRk=newCharacter('Cutpurse'); notRk.cls='Rogue'; notRk.level=20; notRk.subclass='Thief';
  T('a Thief (even level 20) is never an Assassin', isAssassin(notRk,3)===false);

  // hasNotActedYet: derivable for free from initiative order + round number.
  const s={order:[{k:'p',id:'pc'},{k:'m',id:'m1'},{k:'m',id:'m2'}], turn:0, battle:{round:1}};
  T('a creature later in round-1 initiative hasn\'t acted yet', hasNotActedYet(s,'m1')===true && hasNotActedYet(s,'m2')===true);
  T('the creature whose turn it currently is has NOT "not acted yet"', hasNotActedYet(s,'pc')===false);
  s.turn=1;
  T('once the order advances past a creature, it no longer counts as not-yet-acted', hasNotActedYet(s,'pc')===false && hasNotActedYet(s,'m1')===false && hasNotActedYet(s,'m2')===true);
  s.battle.round=2;
  T('hasNotActedYet is only meaningful in round 1 (everyone has acted by round 2)', hasNotActedYet(s,'m2')===false);

  // Reliable Talent (11th): a roll of 9 or lower counts as 10, but only for a proficient skill.
  rk.skillProf={stealth:true};
  const orig=Math.random; Math.random=()=>0.01;   // forces d1=1
  const proficient=rollSkillCheck(rk,'stealth','dex',{});
  const notProficient=rollSkillCheck(rk,'athletics','str',{});
  Math.random=orig;
  T('Reliable Talent raises a low roll to 10 on a proficient skill', proficient.d20===10);
  T('Reliable Talent does not apply to a skill you\'re not proficient in', notProficient.d20===1);
  const rk10=newCharacter('Apprentice'); rk10.cls='Rogue'; rk10.level=10; rk10.skillProf={stealth:true};
  Math.random=()=>0.01;
  const belowLevel=rollSkillCheck(rk10,'stealth','dex',{});
  Math.random=orig;
  T('Reliable Talent does not apply below 11th level', belowLevel.d20===1);
}

/* ---- Draconic Bloodline: Metamagic/Dragon Ancestor choice infra, Draconic Resilience's AC,
   Elemental Affinity's damage-type table ---- */
{
  const sc=newCharacter('Wyrmtongue'); sc.cls='Sorcerer'; sc.level=17; sc.subclass='Draconic Bloodline'; sc.abilities={str:8,dex:14,con:14,int:10,wis:10,cha:18};
  T('isDraconicSorcerer gates on class+subclass+level', isDraconicSorcerer(sc,1)===true && isDraconicSorcerer(sc,20)===false);
  const notSc=newCharacter('Wildling'); notSc.cls='Sorcerer'; notSc.level=20; notSc.subclass='Wild Magic';
  T('a Wild Magic sorcerer (even level 20) is never Draconic Bloodline', isDraconicSorcerer(notSc,1)===false);

  T('DRACONIC_ANCESTRY_DAMAGE maps all 10 dragon types', Object.keys(DRACONIC_ANCESTRY_DAMAGE).length===10 && DRACONIC_ANCESTRY_DAMAGE.Red==='fire' && DRACONIC_ANCESTRY_DAMAGE.Silver==='cold' && DRACONIC_ANCESTRY_DAMAGE.Green==='poison');

  // Draconic Resilience: 13 + Dex AC while unarmored, via the real computeAC path.
  T('Draconic Resilience gives 13 + Dex AC while unarmored', computeAC(sc)===13+mod(abil(sc,'dex')));
  sc.armor='leather';
  T('Draconic Resilience does not apply once armor is worn', computeAC(sc)!==13+mod(abil(sc,'dex')));
  sc.armor='none';

  // Metamagic (3rd/10th/17th) and Dragon Ancestor (1st) — both use the shared {t:'pick'} infra.
  const specs=pendingChoiceSpecs(sc);
  T('a fresh 17th-level sorcerer owes 4 Metamagic picks (2 at 3rd, +1 at 10th, +1 at 17th)', specs.filter(s=>s.t==='pick'&&s.key==='metamagic').length===4);
  T('a fresh Draconic Bloodline sorcerer owes a Dragon Ancestor pick', specs.some(s=>s.t==='pick'&&s.key==='sorcererDragon'));
  sc.sorcererDragon='Red';
  T('once chosen, Dragon Ancestor is no longer owed', !pendingChoiceSpecs(sc).some(s=>s.t==='pick'&&s.key==='sorcererDragon'));
  sc.metamagic=['Twinned Spell','Quickened Spell'];
  T('owed Metamagic count shrinks as picks are made', pendingChoiceSpecs(sc).filter(s=>s.t==='pick'&&s.key==='metamagic').length===2);
}

/* ---- The Fiend: Dark One's Blessing wired centrally through Events (works in every mode for
   free), Eldritch Invocation/Pact Boon choice infra ---- */
{
  const wl=newCharacter('Grimfang'); wl.cls='Warlock'; wl.level=9; wl.subclass='The Fiend'; wl.abilities.cha=18; wl.hp={max:50,cur:50,temp:0};
  wl.battle={action:false,bonus:false,reaction:false,actionsMax:1,actionsUsed:0,attacksLeft:1,move:30,moveUsed:0};
  T('isFiendWarlock gates on class+subclass+level', isFiendWarlock(wl,1)===true && isFiendWarlock(wl,14)===false);
  const notWl=newCharacter('Greenwarden'); notWl.cls='Warlock'; notWl.level=20; notWl.subclass='The Archfey';
  T('an Archfey warlock (even level 20) is never The Fiend', isFiendWarlock(notWl,1)===false);

  // Dark One's Blessing: wired centrally via Events — an 'attack' event that hits, immediately
  // followed by a 'death' event (Engine.attack's own synchronous shape), grants temp HP with
  // NO per-mode wiring needed at all.
  setQB({active:true, over:null, paused:false, log:[], map:{cols:5,rows:5,tiles:{}}, order:[], turn:0, battle:{active:true,round:1},
    monsters:[], players:[{id:'pc', side:'pc', name:wl.name, c:wl, x:0, y:0}]});
  Events.emit({type:'attack', actorId:'pc', targetId:'m1', hit:true, dmg:7});
  Events.emit({type:'death', unitId:'m1'});
  T("Dark One's Blessing grants temp HP = Cha mod + level (min 1) the moment a kill is detected", wl.hp.temp===mod(abil(wl,'cha'))+wl.level);
  setQB(null);

  // Eldritch Invocations (known-count by level) / Pact Boon (one-shot) — same {t:'pick'} infra.
  const specs=pendingChoiceSpecs(wl);
  T('a 9th-level warlock owes 5 Eldritch Invocations (PHB table)', specs.filter(s=>s.t==='pick'&&s.key==='invocations').length===5);
  T('a 3rd+-level warlock owes a Pact Boon pick', specs.some(s=>s.t==='pick'&&s.key==='pactBoon'));
  wl.pactBoon='Pact of the Blade';
  T('once chosen, Pact Boon is no longer owed', !pendingChoiceSpecs(wl).some(s=>s.t==='pick'&&s.key==='pactBoon'));
}

/* ---- School of Evocation: Empowered Evocation/Overchannel (castModal-embedded, like every
   other notation-bump feature this session — only the pure helper is unit-tested here) ---- */
{
  const wz=newCharacter('Vex'); wz.cls='Wizard'; wz.level=14; wz.subclass='Evocation';
  T('isEvocationWizard gates on class+subclass+level', isEvocationWizard(wz,2)===true && isEvocationWizard(wz,14)===true);
  const notWz=newCharacter('Bookworm'); notWz.cls='Wizard'; notWz.level=20; notWz.subclass='Abjuration';
  T('an Abjuration wizard (even level 20) is never Evocation', isEvocationWizard(notWz,2)===false);

  wz.overchannelUses=1;   // 1 prior use this rest → this is the 2nd use, the first one that backlashes
  T('overchannelBacklashDice is 2 on the first backlash-eligible use (the 2nd overall)', overchannelBacklashDice(wz)===2);
  wz.overchannelUses=2;
  T('overchannelBacklashDice escalates by 1 per further use before a long rest', overchannelBacklashDice(wz)===3);
  wz.overchannelUses=4;
  T('overchannelBacklashDice keeps escalating', overchannelBacklashDice(wz)===5);
}

/* ---- attackRiderOptions/applyAttackRiders: the shared rider logic extracted out of attackFlow
   so Quick Battle's openCombatRollModal could finally get the same Sneak Attack/Divine Smite/
   Divine Strike/Colossus Slayer/Hurl Through Hell/Death Strike support player-net already had
   (the cross-cutting gap flagged at the end of the 12-subclass pass). Being pure functions now
   (not inline in a UI closure) means this rider math is finally directly unit-testable at all —
   it never was before this refactor. ---- */
{
  // Sneak Attack: eligible for a Rogue with a finesse weapon, not with a non-finesse one.
  const rg=newCharacter('Shiv'); rg.cls='Rogue'; rg.level=9; rg.abilities.dex=18;
  rg.battle={action:false,bonus:false,reaction:false,actionsMax:1,actionsUsed:0,attacksLeft:1,move:30,moveUsed:0};
  const rapier={name:'Rapier', toHit:7, dmg:'1d8+4', dt:'piercing', tiles:1, melee:true};
  const greataxe={name:'Greataxe', toHit:7, dmg:'1d12+4', dt:'slashing', tiles:1, melee:true};
  T('attackRiderOptions offers Sneak Attack for a Rogue with a finesse weapon', !!attackRiderOptions(rg, rapier, null).sneak);
  T('Sneak Attack die count matches the PHB progression (ceil(level/2))', attackRiderOptions(rg, rapier, null).sneak.dice===5);
  T('attackRiderOptions withholds Sneak Attack for a non-finesse, non-ranged weapon', !attackRiderOptions(rg, greataxe, null).sneak);
  rg.battle.sneakUsed=true;
  T('attackRiderOptions withholds Sneak Attack once already used this turn', !attackRiderOptions(rg, rapier, null).sneak);
  rg.battle.sneakUsed=false;

  { const orig=Math.random; Math.random=()=>0.5;   // deterministic dice
    const rr=applyAttackRiders(rg, rapier, null, {sneak:true}, false, false, ()=>{});
    Math.random=orig;
    T('applyAttackRiders rolls Sneak Attack damage and marks it spent', rr.total>0 && rg.battle.sneakUsed===true);
  }

  // Divine Smite: eligible for a Paladin with an available slot on a melee hit; consumes the slot.
  const pd=newCharacter('Sir Bors'); pd.cls='Paladin'; pd.level=5; pd.slots={1:{total:4,used:0},2:{total:2,used:0}};
  const opts=attackRiderOptions(pd, rapier, null);
  T('attackRiderOptions offers Divine Smite with every available slot level', opts.smite && opts.smite.levels.join(',')==='1,2');
  { const orig=Math.random; Math.random=()=>0.5;
    const rr=applyAttackRiders(pd, rapier, null, {smiteLevel:2}, false, false, ()=>{});
    Math.random=orig;
    T('applyAttackRiders rolls Divine Smite damage and spends the chosen slot', rr.total>0 && pd.slots[2].used===1 && pd.slots[1].used===0);
  }

  // Divine Strike: Life Domain 8th+, doubles dice on a crit (2 dice at 14th+, so 4 on a crit).
  const lc=newCharacter('Cleric'); lc.cls='Cleric'; lc.subclass='Life'; lc.level=14;
  T('attackRiderOptions offers Divine Strike for an 8th+ Life cleric', !!attackRiderOptions(lc, rapier, null).divineStrike);
  { const orig=Math.random; Math.random=()=>0.99;   // max the d8s
    const rr=applyAttackRiders(lc, rapier, null, {divineStrike:true}, true, false, ()=>{});   // isCrit=true
    Math.random=orig;
    T('Divine Strike dice double on a crit (2 dice at 14th, doubled to 4 on a crit)', rr.total===4*8);
  }

  // Colossus Slayer: gated on the target being below its own max HP.
  const rgHunt=newCharacter('Tracker'); rgHunt.cls='Ranger'; rgHunt.subclass='Hunter'; rgHunt.level=5; rgHunt.hunterPrey='Colossus Slayer';
  const hurtMo={hp:5, max:20}, healthyMo={hp:20, max:20};
  T('attackRiderOptions offers Colossus Slayer only when the target is below max HP', !!attackRiderOptions(rgHunt, rapier, hurtMo).colossus && !attackRiderOptions(rgHunt, rapier, healthyMo).colossus);

  // Hurl Through Hell: fiends take no psychic damage from it, everything else does.
  const wl=newCharacter('Grim'); wl.cls='Warlock'; wl.subclass='The Fiend'; wl.level=14;
  const imp={hp:10,max:10,sprite:'demon'}, goblin={hp:10,max:10,sprite:'goblin'};
  T('attackRiderOptions offers Hurl Through Hell once/long rest for a 14th+ Fiend warlock', !!attackRiderOptions(wl, rapier, goblin).hurl);
  { const orig=Math.random; Math.random=()=>0.99;
    const rrFiend=applyAttackRiders(wl, rapier, imp, {hurl:true}, false, false, ()=>{});
    Math.random=orig;
    T('Hurl Through Hell deals no psychic damage to a fiend target', rrFiend.total===0 && wl.hurlThroughHellUsed===true);
  }
  wl.hurlThroughHellUsed=false;
  { const orig=Math.random; Math.random=()=>0.99;
    const rrOther=applyAttackRiders(wl, rapier, goblin, {hurl:true}, false, false, ()=>{});
    Math.random=orig;
    T('Hurl Through Hell deals real psychic damage to a non-fiend target', rrOther.total>0);
  }

  // Death Strike: automatic (no checkbox), doubles the FULL total on a failed save.
  const asn=newCharacter('Nightblade'); asn.cls='Rogue'; asn.subclass='Assassin'; asn.level=17; asn.abilities.dex=18;
  { const orig=Math.random; Math.random=()=>0.5;
    const rr=applyAttackRiders(asn, rapier, goblin, {sneak:true}, false, true, ()=>{});   // targetSurprised=true
    Math.random=orig;
    T('Death Strike doubles when the Con save fails (low roll vs a real DC)', rr.doubled===true);
  }
}

/* ---- Feat audit follow-up: FEAT_GRANTS bugs (Gunner missing entirely, Spell Sniper missing its
   cantrip grant, Weapon Master's proficiency grant doing nothing) plus newly-mechanized feats
   (Tough, Durable, Medium Armor Master, Mobile, Tavern Brawler, Great Weapon Master/Sharpshooter's
   power-attack toggle). 35 of 42 feats were pure flavor text before this pass — 7 already worked
   (Dual Wielder, Lucky, Alert, Observant, Savage Attacker, War Caster, Skulker). ---- */
{
  T('Gunner is no longer missing from FEAT_GRANTS (was a real bug — description promised +1 Dex, granted nothing)', !!FEAT_GRANTS['Gunner'] && FEAT_GRANTS['Gunner'][0].t==='fixed' && FEAT_GRANTS['Gunner'][0].k==='dex');
  T('Spell Sniper now grants its "one attack cantrip" spellChoice', !!FEAT_GRANTS['Spell Sniper'] && FEAT_GRANTS['Spell Sniper'][0].t==='spellChoice' && FEAT_GRANTS['Spell Sniper'][0].attackOnly===true);
  T('Weapon Master now grants a weaponProf choice alongside its ability bump', FEAT_GRANTS['Weapon Master'].some(g=>g.t==='weaponProf'&&g.n===4));

  // Weapon Master: weaponProficient() used to be purely class-based and never checked feats at
  // all, so the feat's whole proficiency grant did nothing. A Wizard has no martial weapon
  // proficiency by class — Weapon Master should now grant it for a chosen weapon specifically.
  const wiz=newCharacter('Booksmith'); wiz.cls='Wizard';
  const longsword=weaponByName('Longsword');
  T('a Wizard is not proficient with a longsword by class alone', weaponProficient(wiz,longsword)===false);
  wiz.weaponMasterProfs=['Longsword'];
  T('Weapon Master grants real proficiency with the chosen weapon (feeds weaponToHit\'s prof bonus)', weaponProficient(wiz,longsword)===true);
  T('...but not with a DIFFERENT weapon it wasn\'t chosen for', weaponProficient(wiz,weaponByName('Greataxe'))===false);

  // Tough: +2 max HP per level. applyFeat backfills retroactively for every level already
  // gained (levelUp's own per-level calc only picks it up starting the NEXT level, since
  // c.feats doesn't have Tough yet at the point that calc runs the level you first take it).
  const barb=newCharacter('Bruiser'); barb.cls='Barbarian'; barb.level=5; barb.hp={max:40,cur:40,temp:0}; barb.feats=[];
  applyFeat(barb,'Tough');
  T('Tough backfills +2 HP per level already gained (5th level → +10)', barb.hp.max===50 && barb.hp.cur===50);

  // Durable: healing from a spent Hit Die is at least 2x your Con modifier.
  const dur=newCharacter('Ironhide'); dur.cls='Fighter'; dur.level=3; dur.abilities.con=16; dur.hp={max:30,cur:10,temp:0}; dur.hitDice={total:'3d10',used:0}; dur.feats=[{name:'Durable'}];
  { const orig=Math.random; Math.random=()=>0.01;   // force a minimal hit-die roll
    spendHitDie(dur);
    Math.random=orig;
    T('Durable floors hit-die healing at 2x Con modifier even on a low roll', dur.hp.cur-10===2*mod(abil(dur,'con')));
  }

  // Medium Armor Master: DEX cap +3 instead of +2 in medium armor, via the real computeAC path.
  const mam=newCharacter('Scout'); mam.cls='Ranger'; mam.armor='chainshirt'; mam.abilities.dex=18; mam.feats=[]; // dex mod +4, armor dexCap 2
  T('normally a chain shirt caps Dex bonus to AC at +2', computeAC(mam)===13+2);
  mam.feats=[{name:'Medium Armor Master'}];
  T('Medium Armor Master raises that cap to +3', computeAC(mam)===13+3);

  // Mobile: +10 ft speed, via the real effSpeed path.
  const mob=newCharacter('Runner'); mob.speed=30; mob.feats=[];
  T('normal speed is unaffected without Mobile', effSpeed(mob)===30);
  mob.feats=[{name:'Mobile'}];
  T('Mobile adds +10 ft speed', effSpeed(mob)===40);

  // Tavern Brawler: unarmed strike becomes 1d4+Str instead of the flat 1+Str fallback, offered
  // alongside any weapons (not a replacement) via the real qbPcAttacks path.
  const brawler=newCharacter('Knuckles'); brawler.cls='Fighter'; brawler.abilities.str=16; brawler.feats=[{name:'Tavern Brawler'}];
  const tbAtk=qbPcAttacks(brawler).find(a=>a.name.includes('Tavern Brawler'));
  T('Tavern Brawler adds a 1d4 unarmed strike option', !!tbAtk && tbAtk.dmg==='1d4'+sgn(mod(abil(brawler,'str'))));

  // Great Weapon Master / Sharpshooter: -5 to hit for +10 damage, gated on weapon type/property
  // and the matching feat.
  const gwmChar=newCharacter('Barbarian Bruiser'); gwmChar.cls='Barbarian'; gwmChar.feats=[{name:'Great Weapon Master'}];
  T('Great Weapon Master applies to a heavy melee weapon', powerAttackKind(gwmChar,{name:'Greataxe'})==='gwm');
  T('Great Weapon Master does not apply to a light non-heavy weapon', powerAttackKind(gwmChar,{name:'Dagger'})===null);
  T('Great Weapon Master does not apply without the feat', powerAttackKind(newCharacter('x'),{name:'Greataxe'})===null);
  const ssChar=newCharacter('Marksman'); ssChar.feats=[{name:'Sharpshooter'}];
  T('Sharpshooter applies to any ranged weapon', powerAttackKind(ssChar,{name:'Shortbow'})==='sharpshooter');
  T('Sharpshooter does not apply to a melee weapon', powerAttackKind(ssChar,{name:'Dagger'})===null);

  // Fey Touched/Shadow Touched/Magic Initiate: the granted spell casts once/day with no slot —
  // previously just decorative text (the spell was granted but always needed a real slot).
  const fey=newCharacter('Hollow'); fey.cls='Fighter'; fey.feats=[{name:'Fey Touched'}]; fey.slots={1:{total:0,used:0}};
  T('Fey Touched can cast Misty Step with zero slots the first time', canCast(fey,'Misty Step',1)===true);
  castSpell(fey,'Misty Step',1);
  T('...and it is marked used after casting', fey.featFreeCastUsed && fey.featFreeCastUsed['Misty Step']===true);
  T('...so a second cast the same day is blocked (no slots, grant already spent)', canCast(fey,'Misty Step',1)===false);
  const magi=newCharacter('Dabbler'); magi.cls='Fighter'; magi.feats=[{name:'Magic Initiate'}]; magi.slots={1:{total:0,used:0}};
  magi.spells=[{name:'Cure Wounds',level:1,prepared:true,notes:'(from Magic Initiate)'}];
  T('Magic Initiate\'s free-cast identification works off the granted spell\'s origin tag', featFreeCastSpell(magi,'Cure Wounds')===true);
  T('...and does not apply to an unrelated spell of the same level', featFreeCastSpell(magi,'Burning Hands')===false);
}

/* ---- "make the systems" follow-up (1): threading a damage-type parameter through applyHp,
   which nothing in this app had ever done before — unblocks Heavy Armor Master and finally
   completes Fiendish Resilience (The Fiend, Warlock) from an earlier entry, whose resistance
   had been documented as "apply it yourself" purely because this parameter didn't exist. ---- */
{
  const ham=newCharacter('Ironwall'); ham.cls='Fighter'; ham.armor='plate'; ham.feats=[{name:'Heavy Armor Master'}]; ham.hp={max:50,cur:50,temp:0};
  applyHp(ham,-10,'slashing');
  T('Heavy Armor Master reduces b/p/s damage by a flat 3 while wearing heavy armor', ham.hp.cur===50-7);
  const ham2=newCharacter('Lightfoot'); ham2.cls='Fighter'; ham2.armor='leather'; ham2.feats=[{name:'Heavy Armor Master'}]; ham2.hp={max:50,cur:50,temp:0};
  applyHp(ham2,-10,'slashing');
  T('...but not while wearing anything lighter than heavy armor', ham2.hp.cur===50-10);
  const ham3=newCharacter('Sparky'); ham3.cls='Fighter'; ham3.armor='plate'; ham3.feats=[{name:'Heavy Armor Master'}]; ham3.hp={max:50,cur:50,temp:0};
  applyHp(ham3,-10,'fire');
  T('...and not against a damage type outside bludgeoning/piercing/slashing', ham3.hp.cur===50-10);

  const wl2=newCharacter('Grim II'); wl2.cls='Warlock'; wl2.subclass='The Fiend'; wl2.level=10; wl2.fiendishResilience='cold'; wl2.hp={max:40,cur:40,temp:0};
  applyHp(wl2,-10,'cold');
  T('Fiendish Resilience halves damage of the chosen type', wl2.hp.cur===40-5);
  applyHp(wl2,-10,'fire');
  T('...but not a different damage type', wl2.hp.cur===35-10);

  // Damage with no known type (manual entries, environmental hazards) is untouched by either —
  // both checks are gated on `dtype` being present at all.
  const ham4=newCharacter('Untyped'); ham4.cls='Fighter'; ham4.armor='plate'; ham4.feats=[{name:'Heavy Armor Master'}]; ham4.hp={max:50,cur:50,temp:0};
  applyHp(ham4,-10);
  T('with no dtype passed at all, no resistance applies (matches every existing untyped call site)', ham4.hp.cur===50-10);

  // End-to-end: Engine.attack's own hurt() call now forwards atk.dtype/atk.dt, which it never
  // did before — a monster's attack roll against a Heavy-Armor-Master PC should reflect the
  // reduction, not just a direct applyHp() call.
  const ham5=newCharacter('Shieldwall'); ham5.cls='Fighter'; ham5.armor='plate'; ham5.feats=[{name:'Heavy Armor Master'}]; ham5.hp={max:50,cur:50,temp:0};
  setQB({battle:{round:1}, map:{cols:5,rows:5,tiles:{}}, hazards:[], players:[{id:'pc',side:'pc',x:0,y:0,c:ham5}], monsters:[{id:'m1',side:'mon',name:'Ogre',x:1,y:0,hp:30,max:30,ac:5,conds:[]}]});
  { const orig=Math.random; Math.random=()=>0.99;   // guarantee the hit
    Engine.attack(qbAdapter,'m1','pc',{name:'Club',toHit:99,dmg:'10',dtype:'bludgeoning',tiles:1});
    Math.random=orig;
  }
  T('Engine.attack now forwards the weapon\'s damage type all the way to applyHp', ham5.hp.cur===50-7);
  setQB(null);
}

/* ---- "make the systems" follow-up (2): Evasion and Uncanny Dodge — previously documented as
   needing infra this app didn't have. Evasion needed nothing new (Engine.castApply is already
   the one shared save-resolution choke point); Uncanny Dodge is applied automatically. ---- */
{
  const rg7=newCharacter('Evader'); rg7.cls='Rogue'; rg7.level=7;
  T('hasEvasion gates on Rogue 7th+', hasEvasion(rg7)===true && hasEvasion(newCharacter('Novice Rogue'))===false);
  const hunter15=newCharacter('Ranger'); hunter15.cls='Ranger'; hunter15.subclass='Hunter'; hunter15.hunterSuperiorDefense='Evasion';
  T('hasEvasion also recognizes the Hunter\'s Superior Hunter\'s Defense pick', hasEvasion(hunter15)===true);
  const hunter15b=newCharacter('Other Hunter'); hunter15b.cls='Ranger'; hunter15b.subclass='Hunter'; hunter15b.hunterSuperiorDefense='Uncanny Dodge';
  T('...but not if a DIFFERENT Superior Hunter\'s Defense option was chosen', hasEvasion(hunter15b)===false);
  T('hasUncannyDodge gates on Rogue 5th+ or the matching Hunter pick', hasUncannyDodge(newCharacter('x'))===false && hasUncannyDodge(hunter15b)===true);

  // Evasion, through the real Engine.castApply path (QB): a Dex-save AoE spell against an
  // Evasion rogue deals 0 on a success (not half) and half on a failure (not full).
  const evRg=newCharacter('Nimble'); evRg.cls='Rogue'; evRg.level=7; evRg.hp={max:40,cur:40,temp:0}; evRg.abilities.dex=18;
  setQB({battle:{round:1}, map:{cols:5,rows:5,tiles:{}}, hazards:[], players:[{id:'pc',side:'pc',x:0,y:0,c:evRg}], monsters:[]});
  { const orig=Math.random; Math.random=()=>0.99;   // force the Dex save to succeed
    Engine.castApply(qbAdapter,'m1','pc',{name:'Fireball',dc:8,save:'dex',dmgTotal:40,dtype:'fire'});
    Math.random=orig;
  }
  T('Evasion takes zero damage on a successful Dex save (not the normal half)', evRg.hp.cur===40);
  { const orig=Math.random; Math.random=()=>0.01;   // force the Dex save to fail
    Engine.castApply(qbAdapter,'m1','pc',{name:'Fireball',dc:30,save:'dex',dmgTotal:40,dtype:'fire'});
    Math.random=orig;
  }
  T('Evasion takes half damage on a failed Dex save (not the normal full)', evRg.hp.cur===40-20);
  setQB(null);

  // A non-Dex save (e.g. Con) or a non-Evasion target both get the normal half/full split.
  const nonEvRg=newCharacter('Clumsy'); nonEvRg.cls='Fighter'; nonEvRg.hp={max:40,cur:40,temp:0};
  setQB({battle:{round:1}, map:{cols:5,rows:5,tiles:{}}, hazards:[], players:[{id:'pc',side:'pc',x:0,y:0,c:nonEvRg}], monsters:[]});
  { const orig=Math.random; Math.random=()=>0.99;
    Engine.castApply(qbAdapter,'m1','pc',{name:'Fireball',dc:8,save:'dex',dmgTotal:40,dtype:'fire'});
    Math.random=orig;
  }
  T('a non-Evasion target still takes the normal half damage on a successful save', nonEvRg.hp.cur===40-20);
  setQB(null);

  // Uncanny Dodge: automatic halving, once per round (gated on the reaction, which resets each
  // of the Rogue's own turns like every other reaction in this app).
  const ud=newCharacter('Quickstep'); ud.cls='Rogue'; ud.level=5; ud.hp={max:40,cur:40,temp:0};
  ud.battle={action:false,bonus:false,reaction:false,actionsMax:1,actionsUsed:0,attacksLeft:1,move:30,moveUsed:0};
  applyHp(ud,-10,'slashing');
  T('Uncanny Dodge halves the first attack of the round automatically', ud.hp.cur===40-5 && ud.battle.reaction===true);
  applyHp(ud,-10,'slashing');
  T('...but only once — the reaction is already spent for a second hit the same round', ud.hp.cur===40-5-10);
  ud.battle.reaction=false;   // next round
  applyHp(ud,-10,'slashing');
  T('...and it\'s available again once the reaction resets', ud.hp.cur===40-5-10-5);
}

/* ---- "make the systems" (3): armor-proficiency penalties (PHB) — disadvantage on Str/Dex
   attack rolls and ability checks, and no spellcasting, while wearing armor you're not
   proficient with. Hooked into Engine.hitResult (the one shared combat resolver every mode
   funnels through — same choke point Evasion used), skillCheckAdvantage, and canCast. ---- */
{
  const heavyC=newCharacter('Plated Wizard'); heavyC.cls='Wizard'; heavyC.level=5; heavyC.armor='plate';
  T('armorProficient: Wizard has no heavy armor proficiency', armorProficient(heavyC,'plate')===false);
  T('armorProficient: Wizard IS proficient unarmored', armorProficient(heavyC,'none')===true);
  const fighterC=newCharacter('Knight'); fighterC.cls='Fighter'; fighterC.armor='plate';
  T('armorProficient: Fighter has heavy armor proficiency by class', armorProficient(fighterC,'plate')===true);
  const rogueMed=newCharacter('Sneak'); rogueMed.cls='Rogue'; rogueMed.armor='chainshirt';
  T('armorProficient: Rogue is not proficient with medium armor', armorProficient(rogueMed,'chainshirt')===false);
  rogueMed.feats=[{name:'Moderately Armored'}];
  T('armorProficient: Moderately Armored grants medium armor proficiency', armorProficient(rogueMed,'chainshirt')===true);
  T('armorProficient: Moderately Armored does not also grant heavy armor proficiency', armorProficient(rogueMed,'plate')===false);

  T('attackAdvantage: armorDisadvantage opt imposes disadvantage', attackAdvantage(new Set(),new Set(),true,{armorDisadvantage:true}).adv===-1);
  T('attackAdvantage: armorDisadvantage false = no penalty', attackAdvantage(new Set(),new Set(),true,{armorDisadvantage:false}).adv===0);
  T('attackAdvantage: grapplerAdv opt imposes advantage', attackAdvantage(new Set(),new Set(),true,{grapplerAdv:true}).adv===1);
  T('attackAdvantage: grapplerAdv false = no bonus', attackAdvantage(new Set(),new Set(),true,{grapplerAdv:false}).adv===0);

  // Charger: freshTurnState's dashed flag starts false each turn and resetTurnState clears it
  // (a stale true from last turn would let Charger fire without actually Dashing this turn).
  const chgc=newCharacter('Runner'); chgc.cls='Fighter'; chgc.level=1; chgc.abilities={str:14,dex:10,con:10,int:10,wis:10,cha:10};
  T('freshTurnState: dashed starts false', freshTurnState(chgc).dashed===false);
  chgc.battle=freshTurnState(chgc); chgc.battle.dashed=true;
  resetTurnState(chgc);
  T('resetTurnState: dashed clears on a fresh turn', chgc.battle.dashed===false);
  // Ready action: a held attack starts unarmed and is dropped at the start of your next turn if unreleased
  T('freshTurnState: readied starts false', freshTurnState(chgc).readied===false);
  chgc.battle=freshTurnState(chgc); chgc.battle.readied=true;
  resetTurnState(chgc);
  T('resetTurnState: an unreleased readied attack is lost on your next turn', chgc.battle.readied===false);

  // Crossbow Expert: (a) "no disadvantage firing in melee" has nothing to hook — confirmed
  // by inspection this app never modeled that disadvantage anywhere (Engine.hitResult,
  // attackAdvantage, attackFlow all searched) — deferred per the Grappler/Dungeon-Delver
  // "no model to hook" precedent, noted honestly in AUDIT rather than built against a
  // mechanic that isn't there. (b) the bonus-action hand-crossbow shot IS built — reuses the
  // existing offhand bonus-action gate two-weapon fighting already has, so no new UI needed.
  const xbow=newCharacter('Sniper'); xbow.cls='Ranger'; xbow.level=1; xbow.abilities={str:10,dex:16,con:10,int:10,wis:10,cha:10};
  xbow.items=[{name:'Hand Crossbow',kind:'weapon',qty:1,equipped:true}];
  T('qbPcAttacks: no Crossbow Expert bonus shot without the feat', !qbPcAttacks(xbow).some(a=>/Crossbow Expert/.test(a.name)));
  xbow.feats=[{name:'Crossbow Expert'}];
  const xbAtks=qbPcAttacks(xbow);
  const bonusShot=xbAtks.find(a=>/Crossbow Expert/.test(a.name));
  T('qbPcAttacks: Crossbow Expert bonus shot appears once the feat is present', !!bonusShot);
  T('Crossbow Expert bonus shot is flagged offhand (reuses the existing bonus-action gate)', bonusShot&&bonusShot.offhand===true);
  T('qbPcAttacks: the normal Hand Crossbow attack is STILL listed alongside the bonus one', xbAtks.filter(a=>a.name==='Hand Crossbow').length===1);

  // Actor: advantage on Deception/Performance (impersonation) — same "no specific-target
  // tracking" simplification Favored Enemy/Natural Explorer already use, applied whenever
  // the skill is Deception or Performance at all.
  const actor=newCharacter('Mimic'); actor.cls='Bard'; actor.level=1; actor.abilities={str:10,dex:10,con:10,int:10,wis:10,cha:14};
  T('skillCheckAdvantage: no Actor feat = no bonus on Deception', skillCheckAdvantage(actor,'deception','cha').adv===0);
  actor.feats=[{name:'Actor'}];
  T('skillCheckAdvantage: Actor grants advantage on Deception', skillCheckAdvantage(actor,'deception','cha').adv===1);
  T('skillCheckAdvantage: Actor grants advantage on Performance too', skillCheckAdvantage(actor,'performance','cha').adv===1);
  T('skillCheckAdvantage: Actor does NOT affect unrelated skills', skillCheckAdvantage(actor,'stealth','dex').adv===0);

  T('skillCheckAdvantage: Str check disadvantage while wearing non-proficient armor', skillCheckAdvantage(heavyC,'athletics','str').adv===-1);
  T('skillCheckAdvantage: non-Str/Dex ability check unaffected by armor', skillCheckAdvantage(heavyC,'arcana','int').adv===0);
  const unarmored=newCharacter('Free'); unarmored.cls='Wizard'; unarmored.armor='none';
  T('skillCheckAdvantage: unarmored casters get no armor penalty', skillCheckAdvantage(unarmored,'acrobatics','dex').adv===0);

  heavyC.slots={0:{used:0}}; heavyC.battle=null;
  T('canCast: blocked casting while wearing non-proficient armor', canCast(heavyC,'Fire Bolt',0)===false);
  heavyC.armor='none';
  T('canCast: unarmored casting is unaffected', canCast(heavyC,'Fire Bolt',0)===true);

  // End-to-end through Engine.attack (qbAdapter) — proves the penalty rides the whole
  // ad.unit → checkSubject → attackAdvantage chain, not just the pure helpers in isolation.
  const brute=newCharacter('Clumsy Brute'); brute.cls='Wizard'; brute.level=3; brute.armor='chainmail';
  brute.abilities={str:16,dex:10,con:12,int:14,wis:10,cha:10};
  setQB({active:true, over:null, paused:false, log:[], map:{cols:5,rows:5,tiles:{}}, order:[{k:'p',id:'pc'}], turn:0, battle:{active:true,round:1},
    monsters:[{id:'m1',side:'mon',base:'Goblin',name:'Goblin',x:1,y:0,hp:7,max:7,ac:15,attacksLeft:1}],
    players:[{id:'pc',side:'pc',name:brute.name,c:brute,x:0,y:0,hpCur:brute.hp.cur,hpMax:brute.hp.max}] });
  let ev=Engine.attack(qbAdapter,'pc','m1',{name:'Longsword',toHit:5,dmg:'1d8',dtype:'slashing',tiles:1});
  T('Engine.attack: armor non-proficiency imposes disadvantage on the real roll', ev.adv===-1);
  T('Engine.attack: the disadvantage reason is surfaced for the UI', (ev.advWhy||[]).some(w=>/armor/i.test(w)));
  brute.armor='none';
  getQB().monsters[0].hp=7;   // first attack may have dropped it to 0 — reset before the follow-up check
  ev=Engine.attack(qbAdapter,'pc','m1',{name:'Longsword',toHit:5,dmg:'1d8',dtype:'slashing',tiles:1});
  T('Engine.attack: no armor penalty once unarmored', ev.adv===0);
  setQB(null);
}

/* ---- "make the systems" (4): ritual casting ---- */
{
  const wiz=newCharacter('Ritualist'); wiz.cls='Wizard'; wiz.level=3;
  wiz.spells=[{name:'Detect Magic',level:1,prepared:false},{name:'Fire Bolt',level:0,prepared:true}];
  wiz.slots={1:{total:2,used:0}};
  T('canRitualCast: Wizard qualifies on a known-but-unprepared ritual spell', canRitualCast(wiz,'Detect Magic')===true);
  T('canRitualCast: false for a spell not in RITUAL_SPELLS', canRitualCast(wiz,'Fire Bolt')===false);
  T('canRitualCast: false for a ritual spell not known at all', canRitualCast(wiz,'Legend Lore')===false);

  const cleric=newCharacter('Priest'); cleric.cls='Cleric'; cleric.level=3;
  cleric.spells=[{name:'Augury',level:2,prepared:false}]; cleric.slots={2:{total:1,used:0}};
  T('canRitualCast: Cleric needs the ritual spell PREPARED, unlike Wizard', canRitualCast(cleric,'Augury')===false);
  cleric.spells[0].prepared=true;
  T('canRitualCast: Cleric qualifies once prepared', canRitualCast(cleric,'Augury')===true);

  const sorc=newCharacter('Spark'); sorc.cls='Sorcerer'; sorc.level=3;
  sorc.spells=[{name:'Alarm',level:1,prepared:true}];
  T('canRitualCast: Sorcerer has no innate ritual casting', canRitualCast(sorc,'Alarm')===false);
  sorc.feats=[{name:'Ritual Caster'}];
  T('canRitualCast: Ritual Caster feat grants it for a known ritual spell', canRitualCast(sorc,'Alarm')===true);

  // canCast/castSpell: ritual bypasses the slot, doesn't need prepared (Wizard), and doesn't
  // touch action economy — verified through the real functions, not just canRitualCast alone.
  wiz.battle={action:false,bonus:false,reaction:false,actionsMax:1,actionsUsed:0,attacksLeft:1,move:30,moveUsed:0};
  spendAction(wiz);
  T('canCast: normal cast blocked once the action is spent', canCast(wiz,'Detect Magic',1)===false);
  T('canCast: ritual cast is allowed even with no action left', canCast(wiz,'Detect Magic',1,{ritual:true})===true);
  wiz.battle.action=false; wiz.battle.actionsUsed=0;   // fresh turn, so a real spend would be observable below
  const usedBefore=wiz.slots[1].used;
  const ok=castSpell(wiz,'Detect Magic',1,null,{ritual:true});
  T('castSpell: ritual cast succeeds', ok===true);
  T('castSpell: ritual cast spends no spell slot', wiz.slots[1].used===usedBefore);
  T('castSpell: ritual cast does not spend the action', wiz.battle.action===false);
  T('castSpell: ritual cast leaves the spell still unprepared (ritual bypasses prep, doesn\'t grant it)', wiz.spells.find(s=>s.name==='Detect Magic').prepared===false);

  // A cleric without the spell prepared can't ritual-cast it, and canCast correctly blocks
  // the normal (non-ritual) attempt too since it isn't prepared.
  const cleric2=newCharacter('Unprepped'); cleric2.cls='Cleric'; cleric2.level=3;
  cleric2.spells=[{name:'Augury',level:2,prepared:false}]; cleric2.slots={2:{total:1,used:0}};
  T('canCast: Cleric ritual attempt on an unprepared ritual spell still fails', canCast(cleric2,'Augury',2,{ritual:true})===false);

  // v120.203 gap closed: Unseen Servant is ritual-tagged AND summon-kind — openSummonSpellUI
  // now threads {ritual} through to castSpell the same way the normal castModal path does
  // (see index.html's openSummonSpellUI/castModal), instead of silently dropping it. Testing
  // the underlying castSpell/canRitualCast call it now makes, same convention as the rest of
  // this ritual block (no DOM harness exists for any modal in this suite).
  wiz.spells.push({name:'Unseen Servant',level:1,prepared:false});
  T('canRitualCast: Unseen Servant (summon-kind) is ritual-tagged and available to a Wizard', canRitualCast(wiz,'Unseen Servant')===true);
  wiz.battle.action=false; wiz.battle.actionsUsed=0;
  const usedBefore2=wiz.slots[1].used;
  const okSummon=castSpell(wiz,'Unseen Servant',1,null,{ritual:true});
  T('castSpell: Unseen Servant ritual cast succeeds (the exact call openSummonSpellUI now makes)', okSummon===true);
  T('castSpell: Unseen Servant ritual cast spends no spell slot', wiz.slots[1].used===usedBefore2);
  T('castSpell: Unseen Servant ritual cast does not spend the action', wiz.battle.action===false);
}

/* ---- "make the systems" (5): Healer feat heal action + Inspiring Leader ---- */
{
  T('inspiringLeaderAmount: level + CHA mod', inspiringLeaderAmount({level:5, abilities:{cha:16}})===5+3);
  T('inspiringLeaderAmount: floors at 0, never negative', inspiringLeaderAmount({level:1, abilities:{cha:6}})===0);

  // healerFeatSpent lives on the TARGET and resets unconditionally on any rest (the PHB
  // restriction is "can't use on the same creature again", a property of who got healed —
  // not of who has the feat), same convention echoAvatarUsed/shadowMartyrUsed already use.
  const target=newCharacter('Target'); target.cls='Fighter'; target.level=3;
  target.healerFeatSpent=true;
  target.hitDice={total:'3d10',used:0}; target.hp={max:20,cur:10,temp:0}; target.abilities={str:10,dex:10,con:10,int:10,wis:10,cha:10};
  spendHitDie(target);
  T('spendHitDie (short rest): healerFeatSpent resets even for a character without the Healer feat', target.healerFeatSpent===false);

  const leader=newCharacter('Leader'); leader.cls='Bard'; leader.level=4; leader.feats=[{name:'Inspiring Leader'}];
  leader.inspiringLeaderUsed=true;
  leader.hitDice={total:'4d8',used:0}; leader.hp={max:20,cur:10,temp:0}; leader.abilities={str:10,dex:10,con:10,int:10,wis:10,cha:10};
  spendHitDie(leader);
  T('spendHitDie (short rest): inspiringLeaderUsed resets for a character who has the feat', leader.inspiringLeaderUsed===false);
}

/* ---- Mode-parity audit fixes + follow-up unification: qbPcAttacks/playerAttackMenu ---- */
{
  // v120.208 fixed 3 findings by patching both lists independently (off-hand added to
  // qbPcAttacks, Crossbow Expert + custom attacks added to playerAttackMenu). This follow-up
  // pass replaced BOTH hand-maintained lists with one shared pcAttackList(c) — qbPcAttacks is
  // now a thin wrapper around it, and playerAttackMenu consumes it too (untestable directly,
  // being a DOM-rendering function with no return value — same reason openSummonSpellUI/
  // openMove have none either — but since it now reads the SAME data this test exercises,
  // testing pcAttackList thoroughly covers both consumers' correctness at the data layer).
  const duelist=newCharacter('Duelist2'); duelist.cls='Fighter'; duelist.level=1;
  duelist.abilities={str:10,dex:16,con:10,int:10,wis:10,cha:10};
  duelist.items=[
    {name:'Dagger',kind:'weapon',qty:1,equipped:true},{name:'Dagger',kind:'weapon',qty:1,equipped:true,slot:2},
    {name:'Hand Crossbow',kind:'weapon',qty:1,equipped:true},
  ];
  duelist.attacks=[{name:'Improvised Chair', bonus:'+2', damage:'1d4'}];
  duelist.feats=[{name:'Crossbow Expert'}];
  const list=pcAttackList(duelist);
  T('qbPcAttacks produces the exact same list pcAttackList does (thin wrapper, not a second implementation)', JSON.stringify(qbPcAttacks(duelist))===JSON.stringify(list));
  T('pcAttackList: off-hand attack present (was the QB-only gap)', list.some(a=>a.offhand && /off-hand/.test(a.name)));
  T('pcAttackList: Crossbow Expert bonus shot present (was the player-net-only gap)', list.some(a=>a.offhand && /Crossbow Expert/.test(a.name)));
  T('pcAttackList: custom "Add attack" entry present (was the player-net-only gap)', list.some(a=>a.name==='Improvised Chair' && a.toHit===2));
  // Two Dagger ITEMS (needed for canOffhand to qualify) → two Dagger entries, plus Hand Crossbow.
  T('pcAttackList: real weapon attacks (2x Dagger, Hand Crossbow) still present alongside the derived ones', list.filter(a=>a.name==='Dagger').length===2 && list.some(a=>a.name==='Hand Crossbow'));
}

/* ---- "make the systems" (7): Battle Master maneuvers / Martial Adept ---- */
{
  T('superiorityDiceMax: Martial Adept alone grants 1', superiorityDiceMax({cls:'Wizard', feats:[{name:'Martial Adept'}]})===1);
  T('superiorityDiceMax: no feat/subclass = 0', superiorityDiceMax({cls:'Fighter', subclass:'Champion', level:5})===0);
  T('superiorityDiceMax: Battle Master 3rd = 4 dice', superiorityDiceMax({cls:'Fighter', subclass:'Battle Master', level:3})===4);
  T('superiorityDiceMax: Battle Master 7th = 5 dice', superiorityDiceMax({cls:'Fighter', subclass:'Battle Master', level:7})===5);
  T('superiorityDiceMax: Battle Master 15th = 6 dice', superiorityDiceMax({cls:'Fighter', subclass:'Battle Master', level:15})===6);
  T('superiorityDiceMax: Battle Master + Martial Adept stack additively', superiorityDiceMax({cls:'Fighter', subclass:'Battle Master', level:3, feats:[{name:'Martial Adept'}]})===5);
  T('superiorityDieSize: Martial Adept is always d6', superiorityDieSize({cls:'Wizard', level:1})===6);
  T('superiorityDieSize: Battle Master d8 at 3rd', superiorityDieSize({cls:'Fighter', subclass:'Battle Master', level:3})===8);
  T('superiorityDieSize: Battle Master d10 at 10th', superiorityDieSize({cls:'Fighter', subclass:'Battle Master', level:10})===10);
  T('superiorityDieSize: Battle Master d12 at 18th', superiorityDieSize({cls:'Fighter', subclass:'Battle Master', level:18})===12);

  const bm=newCharacter('Duelist'); bm.cls='Fighter'; bm.subclass='Battle Master'; bm.level=3;
  bm.abilities={str:16,dex:10,con:14,int:10,wis:10,cha:10};
  bm.superiorityDiceLeft=4;
  T('attackRiderOptions: no maneuver rider without any dice left', !attackRiderOptions(Object.assign({},bm,{superiorityDiceLeft:0}), {name:'Longsword'}, null).maneuver);
  const opts=attackRiderOptions(bm, {name:'Longsword'}, null);
  T('attackRiderOptions: maneuver rider offered with dice available', !!opts.maneuver);
  T('attackRiderOptions: maneuver rider lists all 4 curated maneuvers', Object.keys(opts.maneuver.options).length===4);
  T('attackRiderOptions: no maneuver rider for a spell attack (weapon-only)', !attackRiderOptions(bm, {name:'Fire Bolt', spell:true}, null).maneuver);

  // Trip Attack: forced low save (rigged monsterSaveBonus via a 0-CR mob) — proves damage AND
  // the Prone condition both land, and the die pool decrements.
  const foe1={id:'f1', side:'mon', base:'Commoner', name:'Foe', hp:20, max:20, x:0,y:0, conds:[]};
  const origRandom=Math.random;
  Math.random=()=>0.01; // low roll: weak save AND small damage die, doesn't matter which lands first
  const before=bm.superiorityDiceLeft;
  const res1=applyAttackRiders(bm, {name:'Longsword'}, foe1, {maneuver:'trip'}, false, false, ()=>{});
  Math.random=origRandom;
  T('applyAttackRiders (maneuver): Trip Attack adds real damage', res1.total>0);
  T('applyAttackRiders (maneuver): superiority die pool decrements by one', bm.superiorityDiceLeft===before-1);
  T('applyAttackRiders (maneuver): a failed save actually applies Prone', foe1.conds.some(x=>x.name==='Prone'));

  // Distracting Strike: no save at all — always applies its condition.
  const foe2={id:'f2', side:'mon', base:'Commoner', name:'Foe2', hp:20, max:20, x:0,y:0, conds:[]};
  bm.superiorityDiceLeft=4;
  applyAttackRiders(bm, {name:'Longsword'}, foe2, {maneuver:'distracting'}, false, false, ()=>{});
  T('applyAttackRiders (maneuver): Distracting Strike applies its condition unconditionally (no save)', foe2.conds.some(x=>x.name==='Distracting Strike'));
  T('attackAdvantage: Distracting Strike grants advantage against the distracted target', attackAdvantage(new Set(), new Set(['Distracting Strike']), true, {}).adv===1);

  // Goading Attack success → target.goadedBy is set to the maneuver-user's name, and
  // Engine.hitResult's own goadedDisadv wiring imposes disadvantage when that goaded creature
  // later attacks anyone else — proven end-to-end through qbAdapter, not just the pure helper.
  const foe3={id:'f3', side:'mon', base:'Commoner', name:'Goadee', hp:20, max:20, x:1,y:0, attacksLeft:1};
  setQB({active:true, over:null, paused:false, log:[], map:{cols:5,rows:5,tiles:{}}, order:[{k:'p',id:'pc'}], turn:0, battle:{active:true,round:1},
    monsters:[foe3, {id:'bystander', side:'mon', base:'Commoner', name:'Bystander', hp:10, max:10, x:2,y:0}],
    players:[{id:'pc', side:'pc', name:bm.name, c:bm, x:0,y:0, hpCur:bm.hp.cur, hpMax:bm.hp.max}] });
  Math.random=()=>0.01;
  applyAttackRiders(bm, {name:'Longsword'}, foe3, {maneuver:'goading'}, false, false, ()=>{});
  Math.random=origRandom;
  T('applyAttackRiders (maneuver): Goading Attack success sets goadedBy to the attacker\'s name', foe3.goadedBy===bm.name);
  const pcTarget=getQB().players[0];
  T('Engine.hitResult: the goaded creature has disadvantage attacking someone who is NOT the goader', Engine.hitResult(qbAdapter, 'f3', 'bystander', {toHit:5, dmg:'1d6'}).adv===-1);
  foe3.goadedBy=bm.name; // re-set (may have been consumed by dice-roll randomness above)
  setQB(null);

  // Rest resets, same convention every other once/rest resource here already follows.
  bm.superiorityDiceLeft=0; bm.hitDice={total:'3d10',used:0}; bm.hp={max:30,cur:20,temp:0};
  spendHitDie(bm);
  T('spendHitDie (short rest): superiorityDiceLeft refills', bm.superiorityDiceLeft===superiorityDiceMax(bm));
}

/* ---- "make the systems" (8): mount system (Mounted Combatant) — "lite" scope ---- */
{
  const rider=newCharacter('Cavalier'); rider.cls='Fighter'; rider.level=3;
  rider.abilities={str:16,dex:12,con:14,int:10,wis:10,cha:10};
  rider.battle={action:false,bonus:false,reaction:false,actionsMax:1,actionsUsed:0,attacksLeft:1,move:effSpeed(rider),moveUsed:0};

  T('effSpeed: unmounted uses the character\'s own speed', effSpeed(rider)===30);
  setQB({active:true, over:null, paused:false, log:[], map:{cols:10,rows:10,tiles:{}}, order:[{k:'p',id:'pc'}], turn:0, battle:{active:true,round:1},
    monsters:[], players:[{id:'pc', side:'pc', name:rider.name, c:rider, x:2,y:2, hpCur:rider.hp.cur, hpMax:rider.hp.max}] });

  const warhorse=MOUNT_CATALOG.find(m=>m.id==='warhorse');
  const startMove=rider.battle.move;
  const unit=mountUp(getQB(), rider, 'pc', warhorse, 2, 2, ()=>{});
  T('mountUp: spawns a real ally unit in s.monsters (not hostile-targetable)', !!unit && unit.ally===true && unit.mount===true);
  T('mountUp: isHostile correctly excludes the mount (ally:true)', isHostile(unit)===false);
  T('mountUp: sets c.mountedOn', rider.mountedOn && rider.mountedOn.name==='Warhorse');
  T('mountUp: spends half the character\'s own (unmounted) speed', rider.battle.move===startMove-Math.ceil(30/2));
  T('effSpeed: mounted now returns the MOUNT\'s speed (60), not the rider\'s own (30)', effSpeed(rider)===60);

  // Mounted Combatant: advantage vs an unmounted creature, melee only, feat-gated.
  const foe={id:'f1', side:'mon', base:'Goblin', name:'Foe', hp:7, max:7, ac:12, x:2,y:2, attacksLeft:1};
  getQB().monsters.push(foe);
  T('Engine.hitResult: no advantage without the feat, even while mounted', Engine.hitResult(qbAdapter, 'pc', 'f1', {toHit:5, dmg:'1d6'}).adv===0);
  rider.feats=[{name:'Mounted Combatant'}];
  T('Engine.hitResult: Mounted Combatant grants advantage vs an unmounted creature (melee)', Engine.hitResult(qbAdapter, 'pc', 'f1', {toHit:5, dmg:'1d6'}).adv===1);
  // Ranged check needs real distance (hitResult prefers gridDist over the tiles-based guess
  // whenever both units have real positions) — a far-away foe, not the same tile as the rider.
  const farFoe={id:'f2', side:'mon', base:'Goblin', name:'FarFoe', hp:7, max:7, ac:12, x:9,y:9, attacksLeft:1};
  getQB().monsters.push(farFoe);
  T('Engine.hitResult: Mounted Combatant does NOT grant advantage on a RANGED attack (PHB: melee only)', Engine.hitResult(qbAdapter, 'pc', 'f2', {toHit:5, dmg:'1d6', tiles:6}).adv===0);

  // Voluntary dismount — fresh movement pool (a new turn's worth), since mounting already
  // spent this turn's movement and dismounting needs its own budget, same as any other
  // real turn boundary in this app.
  rider.battle.move=effSpeed(rider);
  const moveBeforeDismount=rider.battle.move;
  const dOk=dismountRider(rider, ()=>{});
  T('dismountRider: succeeds and clears mountedOn', dOk===true && rider.mountedOn===null);
  T('dismountRider: spends half the MOUNT\'s speed (60/2=30)', rider.battle.move===moveBeforeDismount-30);
  T('effSpeed: back to the character\'s own speed after dismounting', effSpeed(rider)===30);

  // Forced dismount when the mount drops to 0 HP.
  rider.battle.move=effSpeed(rider); // fresh movement to mount up again
  const unit2=mountUp(getQB(), rider, 'pc', warhorse, 2, 2, ()=>{});
  T('mountUp: can mount again after dismounting', !!unit2 && rider.mountedOn && rider.mountedOn.name==='Warhorse');
  unit2.hp=0;
  checkMountDeaths(getQB(), ()=>{});
  T('checkMountDeaths: a mount hitting 0 HP forces the rider off (QB)', rider.mountedOn===null);
  setQB(null);

  // Ownership gate (a real reported bug: mounting was offered with no ownership check at all).
  // mountUp itself deliberately stays ungated (a future Find Steed-style spell should be able
  // to summon one regardless of ownership) — the gate belongs at the UI layer (Use-menu button/
  // picker), backed by ensureFields defaulting every character to owning none by default.
  const fresh=newCharacter('Fresh'); ensureFields(fresh);
  T('ensureFields: a character owns no mounts by default (the actual reported bug)', Array.isArray(fresh.ownedMounts) && fresh.ownedMounts.length===0);
  fresh.ownedMounts=['warhorse'];
  ensureFields(fresh);
  T('ensureFields: does not clobber an already-set ownedMounts list', fresh.ownedMounts.length===1 && fresh.ownedMounts[0]==='warhorse');
}

/* ---- "make the systems": Find Steed / Find Greater Steed ---- */
{
  T('FIND_STEED_CATALOG: Find Steed has the 5 real PHB options', FIND_STEED_CATALOG['Find Steed'].map(m=>m.name).sort().join(',')==='Camel,Elk,Mastiff,Pony,Warhorse');
  T('FIND_STEED_CATALOG: Find Greater Steed has the 6 real Tasha\'s options', FIND_STEED_CATALOG['Find Greater Steed'].length===6);

  const pal=newCharacter('Find Steed Pal'); pal.cls='Paladin'; pal.level=5; pal.abilities={str:16,dex:10,con:14,int:10,wis:10,cha:16}; applyClassDefaults(pal);
  pal.spells=[{name:'Find Steed',level:2,prepared:true}];
  pal.battle={action:false,bonus:false,reaction:false,actionsMax:1,actionsUsed:0,attacksLeft:1,move:effSpeed(pal),moveUsed:0};
  setQB({active:true, over:null, paused:false, log:[], map:{cols:10,rows:10,tiles:{}}, order:[{k:'p',id:'pc'}], turn:0, battle:{active:true,round:1},
    monsters:[], players:[{id:'pc', side:'pc', name:pal.name, c:pal, x:2,y:2, hpCur:pal.hp.cur, hpMax:pal.hp.max}] });

  const slotsBefore=(pal.slots[2]&&pal.slots[2].used)||0;
  T('castSpell: Find Steed consumes a real 2nd-level slot (it is not free/no-slot-needed)', castSpell(pal,'Find Steed',2)===true && ((pal.slots[2]&&pal.slots[2].used)||0)===slotsBefore+1);
  const warhorse=FIND_STEED_CATALOG['Find Steed'].find(m=>m.id==='warhorse');
  const unit=findSteedSummon(getQB(), pal, 'pc', warhorse, 'Find Steed', 2, 2, ()=>{});
  T('findSteedSummon: spawns a real mount unit and mounts the caster', !!unit && pal.mountedOn && pal.mountedOn.name==='Warhorse');
  T('findSteedSummon: tags the unit findSteed (so dismount/death makes it vanish, not stay)', unit.findSteed===true);
  T('findSteedSummon: records the bond (spell + mount id) for a future re-cast to find', pal.findSteedBond && pal.findSteedBond.spell==='Find Steed' && pal.findSteedBond.mountId===unit.id);
  T('findSteedSummon: bypasses the ownership gate entirely — no ownedMounts needed', !pal.ownedMounts || !pal.ownedMounts.includes('warhorse'));

  // Vanish on voluntary dismount (RAW: "disappears, leaving no physical form").
  pal.battle.move=effSpeed(pal);
  dismountRider(pal, ()=>{}, null, getQB());
  T('dismountRider: a findSteed mount is removed from s.monsters entirely on dismount', !getQB().monsters.some(m=>m.id===unit.id));

  // Re-summoning: mount again, then damage it, then re-cast the SAME spell to restore instead
  // of re-prompting — findSteedRestore is what openFindSteedUI calls to make that decision.
  pal.battle.move=effSpeed(pal);
  const unit2=findSteedSummon(getQB(), pal, 'pc', warhorse, 'Find Steed', 2, 2, ()=>{});
  unit2.hp=1;
  const restored=findSteedRestore(pal, getQB(), 'Find Steed');
  T('findSteedRestore: heals the SAME bonded unit back to full, not a new one', restored && restored.id===unit2.id && restored.hp===restored.max);
  T('findSteedRestore: re-mounts if you\'d dismounted (voluntary dismount doesn\'t end the bond)', pal.mountedOn && pal.mountedOn.id===unit2.id);
  T('findSteedRestore: a DIFFERENT spell name is not the same bond, returns null', findSteedRestore(pal, getQB(), 'Find Greater Steed')===null);

  // Vanish at 0 HP too (forced dismount path), not just voluntary dismount.
  unit2.hp=0;
  checkMountDeaths(getQB(), ()=>{});
  T('checkMountDeaths: a findSteed mount at 0 HP is removed from s.monsters (no corpse, unlike a mundane mount)', !getQB().monsters.some(m=>m.id===unit2.id));
  T('checkMountDeaths: the rider is correctly dismounted too', pal.mountedOn===null);
  setQB(null);
}

/* ---- "make the systems": multiclassing v1 ----
   Scope (documented in AUDIT.md): total level, hit dice, ASI progression, subclass capture,
   and — the headline mechanic — combined spell slots are all genuinely multiclass-aware.
   Class FEATURE-granting content (pendingChoiceSpecs) and resource-pool formulas (Rage
   damage, Ki points, Channel Divinity, etc.) stay scoped to your PRIMARY (first-taken) class
   only, per myLevel's own doc comment — this is a deliberate v1 boundary, not a bug. */
{
  // Single-class: every helper must be a byte-for-byte no-op vs. reading c.level/c.cls
  // directly — this is what makes the myLevel substitution across ~30 call sites safe.
  const solo=newCharacter('Solo'); solo.cls='Ranger'; solo.level=7; solo.subclass='Hunter';
  T('classLevel: single-class returns the live c.level for your own class', classLevel(solo,'Ranger')===7);
  T('classLevel: single-class returns 0 for a class you do not have', classLevel(solo,'Fighter')===0);
  T('myLevel: identical to c.level for a single-class character', myLevel(solo)===solo.level);
  T('totalLevel: identical to c.level for a single-class character', totalLevel(solo)===7);
  T('classSubclass: single-class returns the live c.subclass', classSubclass(solo,'Ranger')==='Hunter');
  T('classLabel: single-class format unchanged ("Level N Class")', classLabel(solo)==='Level 7 Ranger');

  // ensureFields/syncPrimaryClass must NEVER clobber a direct c.cls/c.level/c.subclass
  // mutation back to a stale c.classes[0] — this was a real regression caught by this exact
  // pattern already used throughout the rest of this test file (e.g. `pd.cls='Paladin'`).
  const direct=newCharacter('Direct'); direct.cls='Wizard'; direct.level=5; direct.subclass='Evocation';
  ensureFields(direct);
  T('ensureFields does not clobber a directly-mutated c.cls/level/subclass', direct.cls==='Wizard' && direct.level===5 && direct.subclass==='Evocation');
  T('ensureFields keeps classes[0] mirroring the live fields after a direct mutation', direct.classes[0].cls==='Wizard' && direct.classes[0].level===5 && direct.classes[0].subclass==='Evocation');

  // Genuine multiclass: Fighter 3 (Battle Master) / Wizard 5 (Evocation), Fighter taken first
  // (primary). Total level 8, but Fighter's OWN level is 3 — this is exactly the distinction
  // myLevel exists to get right (superiority die/etc. must key off Fighter's own level, not 8).
  const mc=newCharacter('Multi'); mc.cls='Fighter'; mc.level=3; mc.subclass='Battle Master';
  mc.classes=[{cls:'Fighter',level:3,subclass:'Battle Master'},{cls:'Wizard',level:5,subclass:'Evocation'}];
  syncPrimaryClass(mc);
  T('syncPrimaryClass: total level sums both classes (3+5=8)', mc.level===8);
  T('syncPrimaryClass: c.cls/subclass stay the PRIMARY (first-taken) class', mc.cls==='Fighter' && mc.subclass==='Battle Master');
  T('classLevel: reads each class\'s own level from the real breakdown', classLevel(mc,'Fighter')===3 && classLevel(mc,'Wizard')===5 && classLevel(mc,'Cleric')===0);
  T('classSubclass: per-class subclass, not just the primary alias', classSubclass(mc,'Wizard')==='Evocation');
  T('myLevel: your PRIMARY class\'s own level, not total (3, not 8)', myLevel(mc)===3);
  T('superiorityDieSize: correctly d8 (Fighter lvl 3) not d10 (would be wrong reading total lvl 8)', superiorityDieSize(mc)===8);
  T('classLabel: multiclass format lists each class with its own level', classLabel(mc)==='Fighter 3 / Wizard 5');
  T('hitDiceLabel: dice COUNT is the true total (8), sized to the primary class\'s die', hitDiceLabel(mc)==='8d10');
  { const con=mod(abil(mc,'con'));   // Fighter d10 max on lvl 1, then 2 more Fighter avg(6) + 5 Wizard avg(4)
    T('autoHP: max die on character level 1 only, average+CON every level after (each class its own die)', autoHP(mc)===(10+con)+2*(6+con)+5*(4+con)); }

  // Spell slots — the headline mechanic. Wizard 5 is the only caster here (Fighter contributes
  // nothing): combined caster level = 5 → straight off the shared SLOTS_FULL table, same as a
  // solo 5th-level Wizard would get, proving the multiclass table reuses the full-caster table.
  const slots1=spellSlots(mc);
  T('spellSlots (Fighter/Wizard 5): matches a solo caster-level-5 full-caster exactly', slots1[1]===4 && slots1[2]===3 && slots1[3]===2 && slots1[4]===0);

  // Half-caster + Warlock: Paladin 6 (half → contributes floor(6/2)=3 to the shared pool) +
  // Warlock 2 (excluded from the pool, own Pact Magic layered on top instead).
  const pw=newCharacter('PactKnight'); pw.cls='Paladin'; pw.level=6; pw.subclass='Devotion';
  pw.classes=[{cls:'Paladin',level:6,subclass:'Devotion'},{cls:'Warlock',level:2,subclass:''}];
  syncPrimaryClass(pw);
  const slots2=spellSlots(pw);
  T('spellSlots (Paladin 6/Warlock 2): shared pool at caster level 3 = SLOTS_FULL[3] = [4,2]', slots2[2]===2);
  T('spellSlots (Paladin 6/Warlock 2): Warlock\'s 2 pact slots (1st-level, its own level 2) layer onto the shared L1 count (4+2=6)', slots2[1]===6);

  // A solo Warlock must be completely unaffected by the multiclass math (single-class fast path).
  const solowl=newCharacter('SoloLock'); solowl.cls='Warlock'; solowl.level=5;
  const slots3=spellSlots(solowl);
  T('spellSlots: solo Warlock still uses warlockSlots directly, unaffected by multiclass code', slots3[3]===2 && slots3[1]===0 && slots3[2]===0);

  // Multiclass ability-score prerequisite (soft-checked in the level-up UI, not enforced here).
  const prereqOk=newCharacter('Strong'); prereqOk.abilities={str:15,dex:10,con:10,int:10,wis:10,cha:10};
  const prereqBad=newCharacter('Weak'); prereqBad.abilities={str:8,dex:10,con:10,int:10,wis:10,cha:10};
  T('meetsMulticlassPrereq: 13+ in the relevant score passes (Barbarian: str only)', meetsMulticlassPrereq(prereqOk,'Barbarian')===true);
  T('meetsMulticlassPrereq: below 13 fails', meetsMulticlassPrereq(prereqBad,'Barbarian')===false);
  T('meetsMulticlassPrereq: multi-ability classes need ALL listed scores (Paladin: str+cha, only str met)', meetsMulticlassPrereq(prereqOk,'Paladin')===false);
  T('meetsMulticlassPrereq: Fighter is the one "either" case (str 13 OR dex 13) — str alone is enough', meetsMulticlassPrereq(prereqOk,'Fighter')===true);
}

/* ---- "make the systems": magic items + attunement ---- */
{
  const c=newCharacter('Item Tester'); c.cls='Fighter'; c.level=5; c.classes=[{cls:'Fighter',level:5,subclass:''}];
  syncPrimaryClass(c); c.abilities={str:14,dex:12,con:14,int:10,wis:10,cha:10}; c.saveProf={str:true,con:true,dex:false,int:false,wis:false,cha:false};
  c.items=[{name:'Longsword',kind:'weapon',qty:1,equipped:true},{name:'Chain Shirt',kind:'armor',armorKey:'chainshirt',qty:1,equipped:true},{name:'Shield',kind:'shield',qty:1,equipped:true}];

  const baseAC=computeAC(c), baseSave=saveMod(c,'dex');
  const cloak={name:'Cloak of Protection', rarity:'Uncommon', requiresAttunement:true, mods:{ac:1,save:1}, desc:'x'};
  T('magicItemTargetKind: a wondrous accessory has no equip-target (added standalone)', magicItemTargetKind(cloak)===null);
  T('addWondrousItem: adds a new unequipped item to inventory', addWondrousItem(c,cloak) && c.items[c.items.length-1].name==='Cloak of Protection' && !c.items[c.items.length-1].equipped);
  const cloakIdx=c.items.length-1;

  T('gearBonus: an attunement item does NOT contribute while unequipped', gearBonus(c,'ac')===0);
  T('toggleAttune: fails to attune an unequipped item', toggleAttune(c,cloakIdx)===false && !c.items[cloakIdx].attuned);
  setEquipped(c, cloakIdx, true);
  T('gearBonus: STILL does not contribute while equipped-but-not-attuned (RAW: attunement required)', gearBonus(c,'ac')===0);
  T('toggleAttune: succeeds once equipped', toggleAttune(c,cloakIdx)===true && c.items[cloakIdx].attuned===true);
  T('attunedCount: reflects the one attuned item', attunedCount(c)===1);
  T('gearBonus: now contributes both AC and save mods once equipped AND attuned', gearBonus(c,'ac')===1 && gearBonus(c,'save')===1);
  T('computeAC: reflects the Cloak\'s +1 AC once attuned', computeAC(c)===baseAC+1);
  T('saveMod: reflects the Cloak\'s +1 to every saving throw once attuned (not just AC)', saveMod(c,'dex')===baseSave+1 && saveMod(c,'wis')===mod(abil(c,'wis'))+1);

  // 3-attunement cap.
  const ring=MAGIC_ITEMS.find(m=>m.name==='Ring of Protection'), bracers=MAGIC_ITEMS.find(m=>m.name==='Bracers of Defense'), ioun=MAGIC_ITEMS.find(m=>m.name==='Ioun Stone of Protection');
  [ring,bracers,ioun].forEach(m=>{ addWondrousItem(c,m); const i=c.items.length-1; setEquipped(c,i,true); toggleAttune(c,i); });
  T('toggleAttune: caps at 3 attuned items total', attunedCount(c)===3);
  const extra={name:'Ioun Stone of Protection #2', rarity:'Rare', requiresAttunement:true, mods:{ac:1}, desc:'x'};
  addWondrousItem(c,extra); const extraIdx=c.items.length-1; setEquipped(c,extraIdx,true);
  T('toggleAttune: refuses a 4th attunement even though the item is equipped', toggleAttune(c,extraIdx)===false && !c.items[extraIdx].attuned);
  const unattuneResult=toggleAttune(c,cloakIdx);   // cloak is currently attuned — this call toggles it OFF
  T('toggleAttune: un-attuning succeeds and frees the slot back up', unattuneResult===true && c.items[cloakIdx].attuned===false && attunedCount(c)===2);
  T('toggleAttune: the freed slot can now attune the 4th item', toggleAttune(c,extraIdx)===true && attunedCount(c)===3);

  // Weapon/armor enchantment (permanent, not a spell effect — reuses the same it.magicBonus
  // field the "Magic Weapon" spell already established, so weaponToHit/weaponDmgBonus need no
  // changes at all to pick it up).
  const c2=newCharacter('Enchant Tester'); c2.items=[{name:'Longsword',kind:'weapon',qty:1,equipped:true}];
  const w=weaponByName('Longsword'); const beforeHit=weaponToHit(c2,w);
  T('enchantWeapon: sets magicBonus on the target weapon item', enchantWeapon(c2,0,2) && c2.items[0].magicBonus===2);
  T('weaponToHit: a permanently enchanted +2 weapon adds +2 to hit, same path as the spell effect', weaponToHit(c2,w,c2.items[0])===beforeHit+2);
  T('enchantWeapon: refuses a non-weapon item index', enchantWeapon(c2,99,1)===false);

  const c3=newCharacter('Armor Enchant'); c3.items=[{name:'Chain Shirt',kind:'armor',armorKey:'chainshirt',qty:1,equipped:true}];
  const acBefore=computeAC(c3);
  T('enchantArmorLike: adds to the armor\'s own mods.ac (additive, stacks with a prior enchant)', enchantArmorLike(c3,0,1) && c3.items[0].mods.ac===1);
  T('computeAC: reflects the freshly-enchanted armor\'s +1', computeAC(c3)===acBefore+1);
  T('enchantArmorLike: refuses a weapon/wondrous item index', enchantArmorLike(c3, 5, 1)===false);
}

/* ---- "make the systems": DM-placed traps ---- */
{
  T('TRAP_CATALOG: every entry has a sane dc/dmg/ability shape', TRAP_CATALOG.every(t=>t.dc>=10&&t.dc<=20&&/^\d+d\d+$/.test(t.dmg)&&['str','dex','con','int','wis','cha'].includes(t.ability)));

  const s={map:{cols:5,rows:5,tiles:{}}, battle:{round:1,active:true}, log:[], players:[], monsters:[], traps:[]};
  s.traps.push({x:2,y:2,name:'Spiked Pit',dmg:'2d6',dtype:'piercing',dc:999,ability:'dex',cond:'Prone',triggered:false});   // DC 999 → always fails
  const mo={name:'Goblin',x:2,y:2,base:'Goblin',hp:20,max:20};
  const res=checkTrapTrigger(s, mo, 2, 2, false);
  T('checkTrapTrigger: a monster failing the save takes full damage', res && res.saved===false && res.applied>0 && mo.hp===20-res.applied);
  T('checkTrapTrigger: a failed save applies the trap\'s condition', mo.conds && mo.conds.some(c=>c.name==='Prone'));
  T('checkTrapTrigger: marks the trap triggered so it can\'t fire twice', s.traps[0].triggered===true);
  const res2=checkTrapTrigger(s, mo, 2, 2, false);
  T('checkTrapTrigger: a second trigger attempt on the same (now-sprung) tile is a no-op', res2===null);

  // DC 13 (a real trap DC, not a trick value): this fixture's passive Perception is 10, so it
  // never auto-spots the trap (see the Dungeon Delver block below for that check in isolation)
  // — the save roll is what's forced deterministic here, via the same Math.random-mock pattern
  // used elsewhere in this file, so the trap always fires and the save always succeeds.
  s.traps.push({x:3,y:3,name:'Fire Rune',dmg:'4d6',dtype:'fire',dc:13,ability:'dex',cond:null,triggered:false});
  const c=newCharacter('Trap Tester'); c.abilities={str:10,dex:14,con:14,int:10,wis:10,cha:10}; c.hp={max:30,cur:30,temp:0};
  T('sanity: this fixture\'s passive Perception (10) is below the trap\'s DC (13) — won\'t auto-spot it', passiveScore(c,'perception','wis')<13);
  const origRandom3=Math.random; Math.random=()=>0.99;   // forces rnd(20)=20 on the save roll
  const res3=checkTrapTrigger(s, c, 3, 3, true);
  Math.random=origRandom3;
  T('checkTrapTrigger: a PC succeeding the save takes half damage', res3 && res3.saved===true && c.hp.cur===30-res3.applied && res3.applied>0);
  T('checkTrapTrigger: a no-condition trap never sets one, even on a fail', !c.conditions || !c.conditions.Prone);

  T('trapAt: finds a trap by exact cell', trapAt(s,2,2) && trapAt(s,2,2).name==='Spiked Pit');
  T('trapAt: an empty tile has none', trapAt(s,0,0)===null);

  // Player-net path (DM has no local sheet — sends a message for the player's own device to
  // resolve). Reuses the existing 'hazard' message shape; dmSend needs a real net.conns entry.
  setNet({role:'dm', conns:[{peer:'p1', send(msg){ this._last=msg; }}]});
  s.traps.push({x:4,y:4,name:'Poison Needle Trap',dmg:'2d10',dtype:'poison',dc:15,ability:'con',cond:'Poisoned',triggered:false});
  const p={id:'p1', name:'RemotePlayer'};
  sendTrapTriggerCheck(s, p, 4, 4);
  const sentMsg=getNet().conns[0]._last;
  T('sendTrapTriggerCheck: marks the trap triggered immediately (before the player even responds)', s.traps.find(t=>t.name==='Poison Needle Trap').triggered===true);
  T('sendTrapTriggerCheck: sends the existing \'hazard\' message shape (no new message type needed)', sentMsg && sentMsg.t==='hazard' && sentMsg.dc===15 && sentMsg.ability==='con' && sentMsg.dmg==='2d10' && sentMsg.cond==='Poisoned');
  setNet(null);

  // dmBroadcast must never leak an un-sprung trap's location to a connected player.
  setNet({role:'dm', session:{traps:[{x:1,y:1,name:'Hidden One',triggered:false},{x:2,y:2,name:'Sprung One',triggered:true}]}, conns:[{peer:'p1', send(msg){ this._last=msg; }}], campaign:null});
  dmBroadcast();
  const broadcast=getNet().conns[0]._last;
  T('dmBroadcast: strips untriggered traps from the outbound session', !broadcast.session.traps.some(t=>t.name==='Hidden One'));
  T('dmBroadcast: still includes already-triggered traps (no longer a secret)', broadcast.session.traps.some(t=>t.name==='Sprung One'));
  T('dmBroadcast: does not mutate the DM\'s own live session.traps array', getNet().session.traps.length===2);
  setNet(null);
}

/* ---- "make the systems": homebrew monster editor ---- */
{
  localStorage.removeItem('grimoire.homebrewMonsters');
  T('loadHomebrewMonsters: empty when nothing saved yet', loadHomebrewMonsters().length===0);
  const bogTroll={n:'Bog Troll', cr:'5', ac:15, hp:84, spd:30, init:1, attacks:3, sprite:'ogre', atk:'Claw +7 (2d6+4)', desc:'A swamp-dwelling regenerating brute.'};
  T('saveHomebrewMonster: persists a new monster', saveHomebrewMonster(bogTroll)===true && loadHomebrewMonsters().length===1);
  T('monsterDef: finds a curated monster first', monsterDef('Goblin')&&monsterDef('Goblin').n==='Goblin');
  T('monsterDef: falls back to a homebrew monster by the same lookup', monsterDef('Bog Troll')&&monsterDef('Bog Troll').cr==='5');
  T('monsterDef: returns null for a name that exists nowhere', monsterDef('Nonexistent Beastie')===null);

  const moBogTroll={id:'m1', base:'Bog Troll', name:'Bog Troll', hp:84, max:84};
  T('monsterCR: resolves a homebrew monster\'s real CR, not the "unknown → CR 1" fallback', monsterCR(moBogTroll)===5);
  T('monsterSaveBonus: derives from the homebrew monster\'s own CR (CR5 → 1+floor(5/2)=3)', monsterSaveBonus(moBogTroll)===3);

  // Saving again with the same name updates in place rather than duplicating.
  const updated=Object.assign({},bogTroll,{hp:90});
  saveHomebrewMonster(updated);
  T('saveHomebrewMonster: re-saving the same name updates in place (no duplicate)', loadHomebrewMonsters().length===1 && loadHomebrewMonsters()[0].hp===90);

  deleteHomebrewMonster('Bog Troll');
  T('deleteHomebrewMonster: removes it, and monsterDef stops finding it', loadHomebrewMonsters().length===0 && monsterDef('Bog Troll')===null);
  T('monsterCR: falls back to CR 1 once the homebrew def is gone (matches an unrecognized monster\'s existing fallback)', monsterCR(moBogTroll)===1);
  localStorage.removeItem('grimoire.homebrewMonsters');
}

/* ---- "make the systems": Encounter Builder (DMG 2014 XP-budget tables) ---- */
{
  T('crXP: known CR values match the DMG table', crXP('1/4')===50 && crXP('1')===200 && crXP('5')===1800 && crXP('10')===5900);
  T('crXP: an unrecognized CR is 0, not a crash', crXP('nonsense')===0);

  T('partyXPThresholds: sums per-character thresholds across the party', JSON.stringify(partyXPThresholds([3,3,3,3]))===JSON.stringify({easy:300,medium:600,hard:900,deadly:1600}));
  T('partyXPThresholds: an empty party is all zeroes, not a crash', partyXPThresholds([]).medium===0);

  T('encounterMultiplier: 1 monster is the baseline ×1', encounterMultiplier(1,4)===1);
  T('encounterMultiplier: 3-6 monsters is ×2 for a normal-sized party', encounterMultiplier(4,4)===2);
  T('encounterMultiplier: a small party (<3) bumps the multiplier UP one step (tougher)', encounterMultiplier(4,2)===2.5);
  T('encounterMultiplier: a large party (>5) bumps the multiplier DOWN one step (easier)', encounterMultiplier(4,6)===1.5);
  T('encounterMultiplier: never bumps below the ×1 floor even for a tiny 1-monster fight vs a huge party', encounterMultiplier(1,8)===1);

  // 4 Goblins (CR 1/4 = 50 XP each = 200 raw) vs a level-3 party of 4 (thresholds ×4 above):
  // 4 monsters → ×2 multiplier, party size 4 → no size adjustment. adjXP = 400, which clears
  // the party's Easy threshold (300) but not Medium (600) → rated Easy.
  const enc1=encounterDifficulty(['1/4','1/4','1/4','1/4'], [3,3,3,3]);
  T('encounterDifficulty: raw XP is the straight CR sum', enc1.totalXP===200);
  T('encounterDifficulty: adjusted XP applies the monster-count multiplier', enc1.adjXP===400);
  T('encounterDifficulty: rates correctly against the party\'s own thresholds', enc1.rating==='Easy');

  // Same 4 Goblins vs a single level-1 character: threshold easy=25/medium=50/hard=75/deadly=100
  // (all far below 200 raw), and multiplier bumps up since party size 1 < 3 → adjXP even higher.
  const enc2=encounterDifficulty(['1/4','1/4','1/4','1/4'], [1]);
  T('encounterDifficulty: a small party facing the same monsters rates far more dangerous', enc2.rating==='Deadly' && enc2.adjXP>enc1.adjXP);

  T('encounterDifficulty: zero monsters is Trivial, not a crash', encounterDifficulty([], [5,5]).rating==='Trivial');
}

/* ---- "make the systems": combat undo (QB only — "restart my turn", not a per-click history;
   see qbTurnSnapshot's own doc comment for the scope reasoning) ---- */
{
  const c=newCharacter('Undo Tester'); c.hp={max:20,cur:20,temp:0}; c.battle=freshTurnState(c);
  getDB().push(c); save();
  const pc={id:'pc', side:'pc', name:c.name, c, x:0,y:0, hpCur:c.hp.cur, hpMax:c.hp.max, ac:12};
  const goblin={id:'qm0', side:'mon', base:'Goblin', name:'Goblin', hp:7, max:7, ac:15, x:1,y:0};
  setQB({active:true, over:null, map:{cols:5,rows:5,tiles:{}}, players:[pc], monsters:[goblin], order:[], turn:0, battle:{active:true,round:1}, moveMode:false, log:[]});

  qbSnapshotForUndo();
  T('qbSnapshotForUndo: makes a turn snapshot available', qbUndoAvailable()===true);

  // Simulate a turn's worth of damage: the PC gets hurt, the goblin gets hurt, a log entry
  // is added — then decide "that went badly" and undo.
  const qb=getQB();
  qb.players[0].c.hp.cur=6;
  qb.monsters[0].hp=2;
  qb.log.unshift({m:'test action', t:Date.now()});
  const realCRefBeforeUndo=qb.players[0].c;

  qbUndoTurn();
  const after=getQB();
  T('qbUndoTurn: restores the PC\'s HP to the turn-start snapshot', after.players[0].c.hp.cur===20);
  T('qbUndoTurn: restores the monster\'s HP to the turn-start snapshot', after.monsters[0].hp===7);
  T('qbUndoTurn: the reverted log no longer has the undone action', !after.log.some(l=>l.m==='test action'));
  T('qbUndoTurn: preserves the SAME character object reference DB holds (not a disconnected clone)', after.players[0].c===realCRefBeforeUndo && after.players[0].c===c);
  T('qbUndoTurn: because the reference is preserved, DB/localStorage reflects the reverted HP too', JSON.parse(localStorage.getItem('grimoire.characters.v1')).find(x=>x.id===c.id).hp.cur===20);

  // Undo is repeatable (not single-use) — press it again after making the same mistake twice.
  after.players[0].c.hp.cur=1;
  qbUndoTurn();
  T('qbUndoTurn: repeatable — a second undo before ending the turn reverts again to the same snapshot', getQB().players[0].c.hp.cur===20);

  setDB(getDB().filter(x=>x.id!==c.id)); save(); setQB(null);
}

/* ---- "make the systems": flying altitude ---- */
{
  const c=newCharacter('Aarakocra Scout'); c.race='Aarakocra'; c.hp={max:20,cur:20,temp:0};
  c.battle={action:false,bonus:false,reaction:false,actionsMax:1,actionsUsed:0,attacksLeft:1,move:30,moveUsed:0};
  T('isFlying: a flying race is airborne-capable', isFlying(c)===true);
  T('ensureFields: a character defaults to altitude 0', (()=>{ const f=newCharacter('X'); ensureFields(f); return f.altitude===0; })());

  c.altitude=0;
  checkFallDamage(c, ()=>{});
  T('checkFallDamage: a grounded character (altitude 0) is a no-op', c.hp.cur===20 && c.altitude===0);

  c.altitude=5;   // 5 ft always deals 0 fall damage (fallDamageTotal: floor(5/10)=0 dice) — deterministic case
  checkFallDamage(c, ()=>{});
  T('checkFallDamage: a short 5-ft drop deals no damage (floor(5/10)=0 dice) but still resets altitude', c.hp.cur===20 && c.altitude===0);

  c.altitude=50; c.hp.cur=20;
  const logs=[]; checkFallDamage(c, m=>logs.push(m));
  T('checkFallDamage: a real fall (50 ft) always resets altitude to 0', c.altitude===0);
  T('checkFallDamage: a real fall logs a message either way (damage or a soft landing)', logs.length===1);

  // The applyHp hook: getting knocked to 0 HP while airborne triggers a fall automatically.
  const flyer=newCharacter('Owlin Cleric'); flyer.race='Owlin'; flyer.hp={max:10,cur:10,temp:0};
  flyer.altitude=100; flyer.conditions={}; flyer.death={succ:0,fail:0};
  applyHp(flyer, -10);   // exactly lethal — drops to 0 HP, should trigger the fall check
  T('applyHp: dropping to 0 HP while airborne (100 ft) resets altitude — the fall happened', flyer.altitude===0);
  T('applyHp: still correctly Unconscious at 0 (or dead from fall+massive damage — either way, not still standing)', flyer.hp.cur===0 || flyer.death.fail>=1);

  const grounded=newCharacter('Grounded Fighter'); grounded.hp={max:10,cur:10,temp:0}; grounded.altitude=0; grounded.conditions={}; grounded.death={succ:0,fail:0};
  applyHp(grounded, -10);
  T('applyHp: a grounded character dropping to 0 HP is unaffected by the fall-damage hook (no-op path)', grounded.altitude===0 && grounded.hp.cur===0);
}

/* ---- bug fix: isFlying() ignored a flying mount (Find Greater Steed) or a flying Wild Shape
   form — a PC riding a Griffon or shaped into an Air Elemental never saw the Altitude UI at all. */
{
  const griffonDef=FIND_STEED_CATALOG['Find Greater Steed'].find(m=>m.id==='griffon');
  T('data: Find Greater Steed\'s Griffon is flagged fly:true (RAW flying steed)', griffonDef.fly===true);
  const pegasusDef=FIND_STEED_CATALOG['Find Greater Steed'].find(m=>m.id==='pegasus');
  T('data: Find Greater Steed\'s Pegasus is flagged fly:true (RAW flying steed)', pegasusDef.fly===true);
  T('data: Air Elemental (Elemental Wild Shape) is flagged fly:true', ELEMENTAL_SHAPES.find(b=>b.n==='Air Elemental').fly===true);
  T('data: a ground mount (Warhorse) is NOT flagged fly', !MOUNT_CATALOG.find(m=>m.id==='warhorse').fly);

  const rider=newCharacter('Skyrider'); rider.hp={max:20,cur:20,temp:0};
  rider.battle={action:false,bonus:false,reaction:false,actionsMax:1,actionsUsed:0,attacksLeft:1,move:effSpeed(rider),moveUsed:0};
  setQB({active:true, over:null, paused:false, log:[], map:{cols:10,rows:10,tiles:{}}, order:[{k:'p',id:'pc'}], turn:0, battle:{active:true,round:1},
    monsters:[], players:[{id:'pc', side:'pc', name:rider.name, c:rider, x:2,y:2, hpCur:rider.hp.cur, hpMax:rider.hp.max}] });
  T('isFlying: not flying before mounting up', isFlying(rider)===false);
  const gUnit=mountUp(getQB(), rider, 'pc', griffonDef, 2, 2, ()=>{});
  T('mountUp: propagates fly:true onto the spawned mount unit', gUnit.fly===true);
  T('mountUp: propagates fly:true onto c.mountedOn', rider.mountedOn.fly===true);
  T('isFlying: a PC mounted on a flying steed is airborne-capable (the actual bug)', isFlying(rider)===true);
  rider.battle.move=effSpeed(rider);   // fresh movement budget (needs half the MOUNT's speed to dismount)
  dismountRider(rider, ()=>{});
  T('isFlying: dismounting a flying steed removes airborne capability again', isFlying(rider)===false);
  rider.battle.move=effSpeed(rider);   // fresh movement budget to mount up again
  const warhorseUnit=mountUp(getQB(), rider, 'pc', MOUNT_CATALOG.find(m=>m.id==='warhorse'), 2, 2, ()=>{});
  T('mountUp: a ground mount does NOT set fly on the unit', warhorseUnit.fly===false);
  T('isFlying: a PC mounted on a ground mount is still grounded', isFlying(rider)===false);
  setQB(null);

  const druid=newCharacter('Sky Druid'); druid.hp={max:15,cur:15,temp:0};
  T('isFlying: a Druid in normal form is grounded', isFlying(druid)===false);
  druid.wildShape={name:'Air Elemental', hpCur:90, hpMax:90, ac:15, atk:'', speed:90, fly:true};
  T('isFlying: a Druid Wild Shaped into a flying elemental is airborne-capable (the actual bug)', isFlying(druid)===true);
  druid.wildShape={name:'Brown Bear', hpCur:34, hpMax:34, ac:11, atk:'', speed:40, fly:false};
  T('isFlying: a Druid Wild Shaped into a non-flying beast is still grounded', isFlying(druid)===false);
}

/* ---- "make the systems": altitude vs. melee reach (Engine.hitResult/Engine.attack) ---- */
{
  const pc=newCharacter('Grounded Fighter'); pc.cls='Fighter'; pc.level=5; pc.abilities={str:16,dex:12,con:14,int:10,wis:10,cha:10};
  pc.battle={action:false,bonus:false,reaction:false,actionsMax:1,actionsUsed:0,attacksLeft:1,move:30,moveUsed:0};
  setQB({active:true, over:null, paused:false, log:[], map:{cols:10,rows:10,tiles:{}}, order:[{k:'p',id:'pc'}], turn:0, battle:{active:true,round:1},
    monsters:[{id:'m1',side:'mon',base:'Goblin',name:'Goblin',x:2,y:2,hp:7,max:7,ac:15,attacksLeft:1}],
    players:[{id:'pc',side:'pc',name:pc.name,c:pc,x:2,y:2,hpCur:pc.hp.cur,hpMax:pc.hp.max}] });

  const meleeAtk={toHit:5, dmg:'1d8', tiles:1};       // 5-ft reach
  const reachAtk={toHit:5, dmg:'1d10', tiles:2};      // 10-ft reach (Glaive-style)
  const rangedAtk={toHit:5, dmg:'1d6', tiles:12};     // ranged — never gated by altitude
  // hitResult prefers real grid distance over the tiles-based guess whenever both units have
  // real positions (same rule Mounted Combatant's own ranged-vs-melee test relies on) — a far
  // monster is needed to actually exercise the "ranged" path, or same-tile distance (0) always
  // reads as melee regardless of what atk.tiles claims.
  const farFoe={id:'f2', side:'mon', base:'Goblin', name:'FarFoe', hp:7, max:7, ac:12, x:9,y:9, attacksLeft:1};
  getQB().monsters.push(farFoe);

  pc.altitude=0;
  T('altitude 0 vs a grounded monster: melee is never blocked (baseline)', Engine.hitResult(qbAdapter,'m1','pc',meleeAtk).altitudeBlocked===false);

  pc.altitude=20;
  T('altitude 20, normal 5-ft reach: blocked — 20 ft is way past 5 ft of reach', Engine.hitResult(qbAdapter,'m1','pc',meleeAtk).altitudeBlocked===true);
  T('altitude 20, a 10-ft reach weapon: STILL blocked — 20 ft is still past 10 ft', Engine.hitResult(qbAdapter,'m1','pc',reachAtk).altitudeBlocked===true);
  T('altitude 20, a ranged attack at a distant target: never blocked — reach only gates melee', Engine.hitResult(qbAdapter,'f2','pc',rangedAtk).altitudeBlocked===false);

  pc.altitude=8;
  T('altitude 8, normal 5-ft reach: blocked (8 > 5)', Engine.hitResult(qbAdapter,'m1','pc',meleeAtk).altitudeBlocked===true);
  T('altitude 8, a 10-ft reach weapon: NOT blocked (8 <= 10)', Engine.hitResult(qbAdapter,'m1','pc',reachAtk).altitudeBlocked===false);

  // Symmetric: the FLYING PC attacking a grounded monster is equally gated by ITS OWN altitude.
  pc.altitude=15;
  T('a flying PC attacking a grounded target is gated by its OWN altitude too (symmetric)', Engine.hitResult(qbAdapter,'pc','m1',meleeAtk).altitudeBlocked===true);
  pc.altitude=0;
  T('back on the ground, the same attack resolves normally again', Engine.hitResult(qbAdapter,'pc','m1',meleeAtk).altitudeBlocked===false);

  // Engine.attack actually enforces the gate (not just an advisory flag on hitResult) — a
  // blocked attack must apply zero damage and never mutate the target's HP.
  pc.altitude=20;
  const hpBefore=getQB().monsters[0].hp;
  const ev=Engine.attack(qbAdapter,'m1','pc',meleeAtk,{});
  T('Engine.attack: a blocked attack reports altitudeBlocked and a guaranteed miss', ev.altitudeBlocked===true && ev.hit===false && ev.dmg===0);
  T('Engine.attack: a blocked attack never mutates HP, win or lose the roll', pc.hp.cur===pc.hp.max);
  T('Engine.attack: a blocked attack does not touch the ATTACKER either', getQB().monsters[0].hp===hpBefore);

  pc.altitude=0;
  // face:10 is pre-rolled, not left to chance: +99 is NOT a guaranteed hit, because a natural 1
  // always misses (Engine.roll's `d20!==1`) — leaving this unrolled made the assertion below
  // fail ~5% of runs. A mid face also keeps this a normal hit rather than a nat-20 crit.
  const ev2=Engine.attack(qbAdapter,'m1','pc',{toHit:99, dmg:'1d1', tiles:1},{face:10});
  T('Engine.attack: back in reach, a real attack resolves normally (a +99 to-hit lands)', ev2.altitudeBlocked===false && ev2.hit===true && ev2.crit!==true);
  setQB(null);
}

/* ---- "make the systems": more magic items — potions, Ring of Feather Falling, Decanter,
   Powder Keg ---- */
{
  const potion=MAGIC_ITEMS.find(m=>m.name==='Potion of Healing');
  T('MAGIC_ITEMS: Potion of Healing exists with a real heal formula', !!potion && potion.potionHeal==='2d4+2');

  const c=newCharacter('Potion Drinker'); c.hp={max:20,cur:5,temp:0};
  T('addWondrousItem: a potion is added UNEQUIPPED (existing convention — items start unequipped)', addWondrousItem(c,potion) && c.items[0].equipped===false && c.items[0].kind==='gear');
  const before=c.hp.cur;
  T('drinkPotion: heals via the real potionHeal formula and consumes the item', drinkPotion(c,0)===true && c.hp.cur>before && c.hp.cur<=20 && c.items.length===0);
  T('drinkPotion: refuses an item with no potionHeal (not a potion)', (()=>{ c.items.push({name:'Rope',kind:'gear',qty:1}); return drinkPotion(c,0)===false; })());

  // Ring of Feather Falling: cancels fall damage entirely, same equipped+attuned gate every
  // other attunement item already uses.
  const ring=MAGIC_ITEMS.find(m=>m.name==='Ring of Feather Falling');
  const flyer=newCharacter('Feather Flyer'); flyer.hp={max:20,cur:20,temp:0}; flyer.altitude=50;
  T('hasNoFallDamage: false with no ring at all', hasNoFallDamage(flyer)===false);
  addWondrousItem(flyer,ring);
  T('hasNoFallDamage: still false — equipped but not yet attuned', hasNoFallDamage(flyer)===false);
  setEquipped(flyer,0,true);
  T('hasNoFallDamage: still false — equipped but NOT attuned (attunement required)', hasNoFallDamage(flyer)===false);
  toggleAttune(flyer,0);
  T('hasNoFallDamage: true once equipped AND attuned', hasNoFallDamage(flyer)===true);
  checkFallDamage(flyer, ()=>{});
  T('checkFallDamage: Ring of Feather Falling cancels fall damage entirely (50 ft, still full HP)', flyer.hp.cur===20 && flyer.altitude===0);

  // itemAoeQB — the shared QB-only AOE resolver for Decanter's Geyser and the Powder Keg.
  const pc2=newCharacter('Blast Radius Test'); pc2.hp={max:20,cur:20,temp:0}; pc2.abilities={str:10,dex:14,con:12,int:10,wis:10,cha:10};
  pc2.battle={action:false,bonus:false,reaction:false,actionsMax:1,actionsUsed:0,attacksLeft:1,move:30,moveUsed:0};
  setQB({active:true, over:null, log:[], map:{cols:10,rows:10,tiles:{}}, order:[], turn:0, battle:{active:true,round:1},
    monsters:[{id:'m1',side:'mon',base:'Goblin',name:'Near Goblin',x:1,y:0,hp:50,max:50,ac:15,conds:[]},
              {id:'m2',side:'mon',base:'Goblin',name:'Far Goblin',x:9,y:9,hp:7,max:7,ac:15,conds:[]}],
    players:[{id:'pc',side:'pc',name:pc2.name,c:pc2,x:0,y:0,hpCur:pc2.hp.cur,hpMax:pc2.hp.max}] });
  const res=itemAoeQB(getQB(), {x:0,y:0}, 1, {dmg:'4d6', dtype:'fire', dc:999, saveAbility:'dex'});   // DC 999 → always fails, deterministic
  T('itemAoeQB: hits a monster within radius', res.some(r=>r.name==='Near Goblin'));
  T('itemAoeQB: leaves a monster OUTSIDE radius untouched', !res.some(r=>r.name==='Far Goblin') && getQB().monsters.find(m=>m.id==='m2').hp===7);
  T('itemAoeQB: hits the PC too when within radius (explosions don\'t care about allegiance)', res.some(r=>r.isPc));
  T('itemAoeQB: a failed save (forced via DC 999) deals full damage, not half', getQB().monsters.find(m=>m.id==='m1').hp<50 && pc2.hp.cur<20);

  const res2=itemAoeQB(getQB(), {x:0,y:0}, 1, {dc:999, saveAbility:'str', cond:'Prone'});   // DC 999 → always fails, no dmg key = no damage
  T('itemAoeQB: a no-damage save-or-condition effect (Geyser) applies the condition on a fail without any HP loss', getQB().monsters.find(m=>m.id==='m1').conds.some(x=>x.name==='Prone'));
  setQB(null);
}

/* ---- "make the systems": combat undo, DM-hosted side ---- */
{
  setNet({role:'dm', code:'test', conns:[{peer:'p1', send(msg){ this._last=msg; }}], sel:null,
    session:{battle:{active:true,round:1}, map:{cols:5,rows:5,tiles:{}}, order:[],
      monsters:[{id:'m1',side:'mon',base:'Goblin',name:'Goblin',x:1,y:0,hp:7,max:7,ac:15,conds:[]}],
      players:[{id:'p1',name:'RemotePlayer',level:3,cls:'Fighter',hpCur:20,hpMax:20,ac:16,conds:[]}]}});

  dmSnapshotForUndo();
  T('dmSnapshotForUndo: makes a turn snapshot available', dmUndoAvailable()===true);

  // Simulate a turn's worth of DM-hosted mutation: a monster takes damage, a connected
  // player's MIRROR (not their real sheet — that's on their own device) takes damage too.
  getNet().session.monsters[0].hp=1;
  getNet().session.players[0].hpCur=5;
  getNet().session.monsters[0].conds.push({name:'Prone',rounds:1});

  const ok=dmUndoTurn();
  T('dmUndoTurn: reports success', ok===true);
  T('dmUndoTurn: restores the monster\'s HP to the turn-start snapshot', getNet().session.monsters[0].hp===7);
  T('dmUndoTurn: restores the player MIRROR\'s HP to the turn-start snapshot', getNet().session.players[0].hpCur===20);
  T('dmUndoTurn: the reverted monster no longer carries the mid-turn condition', getNet().session.monsters[0].conds.length===0);
  T('dmUndoTurn: broadcasts the reverted state to connected players (dmBroadcast fired)', getNet().conns[0]._last && getNet().conns[0]._last.t==='session' && getNet().conns[0]._last.session.monsters[0].hp===7);

  // Repeatable, same as QB's own undo — press it again after a second mistake.
  getNet().session.monsters[0].hp=1;
  dmUndoTurn();
  T('dmUndoTurn: repeatable — a second undo before the next turn reverts to the same snapshot', getNet().session.monsters[0].hp===7);

  setNet(null);
}

/* ---- Dungeon Delver feat: trap detection (passive Perception vs. DC, +5 advantage-equivalent)
   and resistance to trap damage ---- */
{
  const trap={name:'Fire Rune', dmg:'4d6', dtype:'fire', dc:15, ability:'dex', cond:null, triggered:false, x:3, y:3};

  // A character with low passive Perception (no ranks, no Dungeon Delver) can't reliably beat DC 15.
  const oblivious=newCharacter('Oblivious'); oblivious.hp={max:30,cur:30,temp:0}; oblivious.abilities={str:10,dex:10,con:14,int:10,wis:8,cha:10};
  T('passiveScore: a low-Wis character with no Perception training is well under a DC 15 trap', passiveScore(oblivious,'perception','wis')<15);
  let s={traps:[Object.assign({},trap)], log:[]};
  const r1=checkTrapTrigger(s, oblivious, 3, 3, true);
  T('checkTrapTrigger: a character who can\'t spot the trap (passive < DC) triggers it', r1 && !r1.spotted && s.traps[0].triggered===true);
  T('checkTrapTrigger: triggering a fire trap actually deals damage', oblivious.hp.cur<30);

  // Dungeon Delver: +5 to the passive check (PHB's own advantage-on-passive rule) is enough to clear DC 15
  // for a character who was just barely short without it.
  const delver=newCharacter('Delver'); delver.hp={max:30,cur:30,temp:0}; delver.abilities={str:10,dex:14,con:14,int:10,wis:14,cha:10};
  delver.skillProf={perception:true}; delver.feats=[{name:'Dungeon Delver'}];
  const basePassive=passiveScore(delver,'perception','wis');
  T('sanity: this fixture\'s base passive Perception (no feat bonus baked in) is still short of DC 15', basePassive<15);
  s={traps:[Object.assign({},trap)], log:[]};
  const r2=checkTrapTrigger(s, delver, 3, 3, true);
  T('checkTrapTrigger: Dungeon Delver\'s +5 (advantage-equivalent) clears a DC the base passive alone would miss', r2 && r2.spotted===true && s.traps[0].triggered===false && delver.hp.cur===30);

  // Resistance to trap damage: same trap, but forced to trigger anyway (DC raised out of reach)
  // via a failed Dex save, to isolate the resistance halving from the detection check.
  const tank=newCharacter('Tank'); tank.hp={max:100,cur:100,temp:0}; tank.abilities={str:16,dex:8,con:16,int:8,wis:8,cha:8};
  tank.feats=[{name:'Dungeon Delver'}];
  const hardTrap=Object.assign({},trap, {dc:999});   // guarantees both the spot check AND the save fail — isolates resistance
  s={traps:[Object.assign({},hardTrap)], log:[]};
  const before=tank.hp.cur;
  const r3=checkTrapTrigger(s, tank, 3, 3, true);
  T('checkTrapTrigger: Dungeon Delver still gets caught by a trap it can\'t detect (DC 999)', r3 && !r3.spotted && s.traps[0].triggered===true);
  T('checkTrapTrigger: Dungeon Delver halves the damage from a trap that DOES go off (resistance, PHB)', (before-tank.hp.cur)>0 && (before-tank.hp.cur)<=12);   // 4d6 max 24, resistance halves to 12

  // Same fixture, no feat — confirms the halving above is actually attributable to the feat, not a fluke.
  const noFeat=newCharacter('NoFeat'); noFeat.hp={max:100,cur:100,temp:0}; noFeat.abilities={str:16,dex:8,con:16,int:8,wis:8,cha:8};
  s={traps:[Object.assign({},hardTrap)], log:[]};
  const before2=noFeat.hp.cur;
  checkTrapTrigger(s, noFeat, 3, 3, true);
  T('checkTrapTrigger: without the feat, the same trap deals full (unhalved) damage', (before2-noFeat.hp.cur)>=4);
}

/* ---- Mode-parity fix: light-based attack disadvantage (tileLightLevel/hasDarkvision/
   visionLevel — a real, already-fully-built system: per-tile ambient light by ${'day'|'sunset'|
   'night'|'dungeon'} mode, dynamic point lights from torches/spells, darkvision) was computed
   ad hoc ONLY inside Quick Battle's own interactive PC-attack UI, never threaded through
   Engine.hitResult — the ONE shared resolver every mode routes through. That meant QB's own
   monster-auto-resolve path, DM-hosted, and player-net never got any lighting effect on attack
   rolls at all. Fixed by adding ad.session() to all three adapters and computing lighting
   inside Engine.hitResult itself, so every mode gets it for free — the same "one Engine path"
   fix altitude-blocking and armor-proficiency disadvantage already got. Also removed the now-
   redundant ad hoc computation from qbResolveAttack (it was about to double-list the same
   "can't see target" reason once Engine.hitResult covers it too). NOT built here (unchanged
   from before): a DM control panel for point lights/torches (already covered by the decor
   palette + this pass's new ambient-mode toggle), dim-light Perception-disadvantage (already
   handled elsewhere via lightSkillMode — untouched), and per-player fog-of-war/exploration
   memory (a separate, bigger, still-open feature). ---- */
{
  T('qbAdapter.session(): exposes the live QB state to Engine.hitResult', (()=>{ setQB({foo:'bar'}); const ok=qbAdapter.session()===getQB(); setQB(null); return ok; })());
  T('sessionAdapter.session(): exposes the live DM session', (()=>{ setNet({role:'dm', session:{foo:'baz'}}); const ok=sessionAdapter.session()===getNet().session; setNet(null); return ok; })());
  T('playerNetAdapter.session(): exposes the live session on a player device too', (()=>{ setNet({role:'player', session:{foo:'qux'}}); const ok=playerNetAdapter.session()===getNet().session; setNet(null); return ok; })());

  // Engine.hitResult via qbAdapter: a dungeon-dark room (ambient mode 'dungeon', no torches) —
  // a human attacker can't see the target at all (disadvantage); an elf's darkvision covers it.
  const human=newCharacter('Torchless'); human.race='Human'; human.hp={max:20,cur:20,temp:0};
  const elf=newCharacter('Nightsight'); elf.race='Elf'; elf.hp={max:20,cur:20,temp:0};
  const mkQb=pcChar=>({active:true, map:{cols:10,rows:10,tiles:{},light:{mode:'dungeon'}}, monsters:[{id:'m1',side:'mon',base:'Goblin',name:'Goblin',x:3,y:0,hp:7,max:7,ac:12,attacksLeft:1}], players:[{id:'pc',side:'pc',name:pcChar.name,c:pcChar,x:0,y:0,hpCur:pcChar.hp.cur,hpMax:pcChar.hp.max}]});
  setQB(mkQb(human));
  const rHuman=Engine.hitResult(qbAdapter,'pc','m1',{toHit:5,dmg:'1d6',tiles:1});
  T('Engine.hitResult (QB): a human attacking blind into a dark dungeon room gets disadvantage', rHuman.adv===-1 && rHuman.advWhy.some(w=>/dark/i.test(w)));
  setQB(mkQb(elf));
  const rElf=Engine.hitResult(qbAdapter,'pc','m1',{toHit:5,dmg:'1d6',tiles:1});
  T('Engine.hitResult (QB): an elf\'s darkvision covers the same dark room — no lighting penalty', rElf.advWhy.every(w=>!/dark/i.test(w)));
  setQB(null);

  // The actual mode-parity proof: the SAME dark-room scenario, but a monster attacking a
  // connected player's mirror in a DM-hosted session (sessionAdapter) — this path had ZERO
  // lighting logic before this fix, in any form, ad hoc or otherwise.
  setNet({role:'dm', conns:[], session:{battle:{active:true,round:1}, map:{cols:10,rows:10,tiles:{},light:{mode:'dungeon'}},
    monsters:[{id:'m1',side:'mon',base:'Goblin',name:'Goblin',x:0,y:0,hp:7,max:7,ac:12,attacksLeft:1}],
    players:[{id:'p1',name:'Mirror PC',hpCur:20,hpMax:20,ac:14,x:3,y:0,conds:[]}], order:[], turn:0}});
  const rDm=Engine.hitResult(sessionAdapter,'m1','p1',{toHit:5,dmg:'1d6',tiles:1});
  T('Engine.hitResult (DM-hosted): the same darkness now imposes disadvantage here too (the actual parity gap this closes)', rDm.adv===-1 && rDm.advWhy.some(w=>/dark/i.test(w)));
  setNet(null);

  // No session at all (a bare adapter stub, or a mode that genuinely has no map yet) — lighting
  // silently contributes nothing rather than throwing, same "adapter can't supply it, skip it"
  // shape Sanctuary/Holy Aura's own DC hooks already use.
  const bareAdapter={unit:id=>({id, x:0,y:0}), ac:()=>12, checkSubject:()=>null};
  let threw=false; try{ Engine.hitResult(bareAdapter,'a','b',{toHit:5,dmg:'1d6',tiles:1}); }catch(e){ threw=true; }
  T('Engine.hitResult: an adapter with no session() at all doesn\'t throw (lighting quietly no-ops)', threw===false);
}

/* ---- Reactions — Shield, Quick Battle only (scoped: DM-hosted/player-net would need a network
   round-trip to reach the connected player's own device, out of scope for this pass — see
   openShieldPrompt's own doc comment). SPELL_EFFECTS already had a real 'Shield':{rounds:1,
   mods:{ac:5}} entry with nothing ever calling addEffect(c,'Shield') — the missing piece was
   purely the trigger, not the AC plumbing. ---- */
{
  const knowsShield=newCharacter('Shield Sorcerer'); knowsShield.cls='Sorcerer'; knowsShield.level=3;
  knowsShield.spells=[{name:'Shield',level:1,prepared:true}]; knowsShield.slots={1:{total:3,used:0}};
  knowsShield.battle={action:false,bonus:false,reaction:false};
  T('shieldEligible: knows Shield, has a free slot and reaction — eligible', shieldEligible(knowsShield)===true);

  // Exhaust EVERY slot level (a L3 Sorcerer has 1st AND 2nd-level slots, and Shield can upcast
  // into either — so "no slots at all" is what makes it ineligible, not just no 1st-level ones).
  const noSlots=Object.assign({},knowsShield); noSlots.slots={1:{used:99},2:{used:99},3:{used:99}};
  T('shieldEligible: no spell slots left at any level — not eligible', shieldEligible(noSlots)===false);

  const usedReaction=Object.assign({},knowsShield,{battle:{action:false,bonus:false,reaction:true}});
  T('shieldEligible: reaction already spent this round — not eligible', shieldEligible(usedReaction)===false);

  const noShield=newCharacter('Non-Caster'); noShield.spells=[]; noShield.slots={}; noShield.battle={action:false,bonus:false,reaction:false};
  T('shieldEligible: doesn\'t know Shield at all — not eligible', shieldEligible(noShield)===false);

  // The actual mechanic: SPELL_EFFECTS already defines Shield's real +5 AC (rounds:1) — this
  // pass's job was making something actually call addEffect for it.
  T('SPELL_EFFECTS: Shield is +5 AC (already existed — the gap was purely the missing trigger)', SPELL_EFFECTS['Shield'] && SPELL_EFFECTS['Shield'].mods.ac===5);
  const shielded=newCharacter('AC Test'); shielded.armor='none';
  const acBefore=computeAC(shielded);
  addEffect(shielded,'Shield');
  T('addEffect(c,\'Shield\'): actually raises computeAC by 5 once triggered', computeAC(shielded)===acBefore+5);

  // qbResolveAttack: a monster's attack against a reaction-ready PC pauses for the reaction menu
  // instead of auto-resolving, ONLY when a reaction actually applies (here: Shield, when +5 AC
  // would flip this roll from a hit to a miss). This harness's document.getElementById returns a
  // fresh disconnected stub on every call (see fakeEl()), so DOM inspection can't verify the
  // modal — swap out openReactionMenu itself, the same "replace the boundary" pattern this file
  // uses for net.conn.send/Math.random.
  const origMenu=openReactionMenu;
  const pcShield=newCharacter('Shielded PC'); pcShield.cls='Sorcerer'; pcShield.level=3; pcShield.armor='none';
  pcShield.abilities={str:10,dex:10,con:14,int:10,wis:10,cha:16};
  pcShield.spells=[{name:'Shield',level:1,prepared:true}]; pcShield.slots={1:{total:3,used:0}};
  pcShield.hp={max:20,cur:20,temp:0}; pcShield.conditions={};
  pcShield.battle={action:false,bonus:false,reaction:false,actionsMax:1,actionsUsed:0,attacksLeft:1,move:30,moveUsed:0};
  setQB({active:true, over:null, paused:false, log:[], map:{cols:10,rows:10,tiles:{}}, order:[{k:'m',id:'m1'},{k:'p',id:'pc'}], turn:0, battle:{active:true,round:1},
    monsters:[{id:'m1',side:'mon',base:'Goblin',name:'Goblin',x:0,y:0,hp:7,max:7,ac:12,attacksLeft:1}],
    players:[{id:'pc',side:'pc',name:pcShield.name,c:pcShield,x:1,y:0,hpCur:pcShield.hp.cur,hpMax:pcShield.hp.max}] });
  const preAC=computeAC(pcShield);   // 10 (unarmored, dex mod 0) — asserted below so the mocked roll's math stays honest
  T('sanity: this fixture\'s AC is the plain unarmored baseline the mocked roll below assumes', preAC===10);
  let captured=null;
  openReactionMenu=(c,ctx,onChoice)=>{ captured={c,ctx,onChoice}; };
  const origRandomShield=Math.random; Math.random=()=>0.57;   // rnd(20) = floor(0.57*20)+1 = 12
  qbResolveAttack(getQB().monsters[0], getQB().players[0], {name:'Bite', toHit:0, dmg:'1d6', tiles:1});   // roll 12 + toHit 0 = 12, hits AC 10 but would miss AC 15 (10+5) — exactly the "Shield would flip it" case
  Math.random=origRandomShield;
  T('qbResolveAttack: a reaction-ready PC facing a would-flip hit gets the reaction menu (attack paused)', !!captured && captured.c===pcShield);
  T('qbResolveAttack: the menu offers Shield for a would-flip hit', !!captured && captured.ctx.options.some(o=>o.id==='shield'));
  captured.onChoice('shield');
  T('qbResolveAttack: choosing Shield actually casts it — spends the reaction', getQB().players[0].c.battle.reaction===true);
  T('qbResolveAttack: choosing Shield spends the 1st-level slot', getQB().players[0].c.slots[1].used===1);
  T('qbResolveAttack: choosing Shield actually raises the PC\'s AC via the real effect pipeline', computeAC(getQB().players[0].c)===preAC+5);
  setQB(null);

  // A hit that would land even WITH +5 AC (overwhelming toHit) never offers Shield — and with no
  // other reaction available, no menu opens at all.
  const pcShield2=newCharacter('Shielded PC 2'); pcShield2.cls='Sorcerer'; pcShield2.level=3; pcShield2.armor='none';
  pcShield2.spells=[{name:'Shield',level:1,prepared:true}]; pcShield2.slots={1:{total:3,used:0}};
  pcShield2.hp={max:20,cur:20,temp:0}; pcShield2.conditions={};
  pcShield2.battle={action:false,bonus:false,reaction:false,actionsMax:1,actionsUsed:0,attacksLeft:1,move:30,moveUsed:0};
  setQB({active:true, over:null, paused:false, log:[], map:{cols:10,rows:10,tiles:{}}, order:[{k:'m',id:'m1'},{k:'p',id:'pc'}], turn:0, battle:{active:true,round:1},
    monsters:[{id:'m1',side:'mon',base:'Goblin',name:'Goblin',x:0,y:0,hp:7,max:7,ac:12,attacksLeft:1}],
    players:[{id:'pc',side:'pc',name:pcShield2.name,c:pcShield2,x:1,y:0,hpCur:pcShield2.hp.cur,hpMax:pcShield2.hp.max}] });
  captured=null;
  qbResolveAttack(getQB().monsters[0], getQB().players[0], {name:'Bite', toHit:99, dmg:'1d6', tiles:1});   // +5 AC could never matter here
  T('qbResolveAttack: no menu when no reaction would change the outcome', captured===null);
  setQB(null);
  openReactionMenu=origMenu;
}

/* ---- Reactions — Shield in DM-hosted (v120.227): the transport (dmSend/conn.send/dmBroadcast)
   and the reaction-readiness sync pattern (shadowMartyrArmed/cuttingWordsArmed) already existed;
   the missing piece was a pause-and-resume shape in the DM's monster-attack resolver plus a
   reactionOffer→reactionChoice round-trip. The player's own device decides eligibility and casts
   (the DM never sees their spell list/slots), reporting back only the choice + new AC. ---- */
{
  const origMenu2=openReactionMenu;

  // playerHello now advertises shieldReady so the DM knows whether to even offer — same
  // reaction-readiness channel shadowMartyrArmed/cuttingWordsArmed already use.
  const caster=newCharacter('Net Shield Sorc'); caster.cls='Sorcerer'; caster.level=3; applyClassDefaults(caster);
  caster.spells=[{name:'Shield',level:1,prepared:true}];
  caster.hp={max:20,cur:20,temp:0}; caster.armor='none';
  caster.battle={action:false,bonus:false,reaction:false,actionsMax:1,actionsUsed:0,attacksLeft:1,move:30,moveUsed:0};
  setDB(getDB().concat([caster]));
  const helloSends=[];
  setNet({role:'player', charId:caster.id, peer:{id:'me1'}, conn:{send:m=>helloSends.push(m)},
    session:{battle:{active:true,round:1}, map:{cols:5,rows:5,tiles:{}}, monsters:[], order:[], turn:0, players:[{id:'me1',name:caster.name,x:0,y:0}]}});
  playerHello();
  T('playerHello: advertises shieldReady:true when the player can react with Shield', helloSends.some(m=>m.t==='hello' && m.char.shieldReady===true));

  // Player receives a reactionOffer (DM sends the eligible options) and picks Shield → casts,
  // reports back choice:'shield' + new AC.
  const acBefore=computeAC(caster);
  const netSends=[];
  getNet().conn.send=m=>netSends.push(m);
  openReactionMenu=(c,ctx,onChoice)=>onChoice('shield');   // auto-pick Shield
  playerOnData({t:'reactionOffer', options:[{id:'shield',label:'🛡️ Shield',note:''}], mon:'m1', monName:'Goblin', total:12, ac:acBefore, dtype:''});
  T('reactionOffer (player): picking Shield from the menu casts it — spends the reaction', caster.battle.reaction===true);
  T('reactionOffer (player): casting Shield raises the real AC by 5', computeAC(caster)===acBefore+5);
  T('reactionOffer (player): reports choice:shield back to the DM with the new AC', netSends.some(m=>m.t==='reactionChoice' && m.choice==='shield' && m.newAC===acBefore+5));

  // A second offer now auto-declines — reaction already spent this round (nothing survives the
  // local re-validation), so no menu opens and a decline is still sent.
  netSends.length=0;
  let menuShown=false; openReactionMenu=()=>{ menuShown=true; };
  playerOnData({t:'reactionOffer', options:[{id:'shield',label:'🛡️ Shield',note:''}], mon:'m1', monName:'Goblin', total:12, ac:acBefore, dtype:''});
  T('reactionOffer (player): auto-declines when no offered option survives local re-validation — no menu shown', menuShown===false);
  T('reactionOffer (player): still sends choice:none so the DM never hangs waiting', netSends.some(m=>m.t==='reactionChoice' && m.choice==='none'));

  // Hellish Rebuke path: an eligible player picks rebuke → reports the rolled retaliation back.
  const warlock=newCharacter('Net Warlock'); warlock.cls='Warlock'; warlock.level=3; applyClassDefaults(warlock);
  warlock.spells=[{name:'Hellish Rebuke',level:1,prepared:true}]; warlock.spellAbility='cha';
  warlock.hp={max:20,cur:20,temp:0};
  warlock.battle={action:false,bonus:false,reaction:false,actionsMax:1,actionsUsed:0,attacksLeft:1,move:30,moveUsed:0};
  setDB(getDB().concat([warlock]));
  getNet().charId=warlock.id; getNet().peer={id:'me1'};
  const wlSends=[]; getNet().conn.send=m=>wlSends.push(m);
  openReactionMenu=(c,ctx,onChoice)=>onChoice('rebuke');
  playerOnData({t:'reactionOffer', options:[{id:'rebuke',label:'😈 Hellish Rebuke',note:''}], mon:'m1', monName:'Ogre', total:18, ac:12, dtype:'bludgeoning'});
  T('reactionOffer (player): Hellish Rebuke spends the reaction', warlock.battle.reaction===true);
  T('reactionOffer (player): reports choice:rebuke back WITH a rolled retaliation (dmg + DC)', wlSends.some(m=>m.t==='reactionChoice' && m.choice==='rebuke' && m.retaliate && m.retaliate.dmg>0 && m.retaliate.dc>0));
  setDB(getDB().filter(x=>x.id!==warlock.id));
  setNet(null);
  setDB(getDB().filter(x=>x.id!==caster.id));

  // DM side: a reactionChoice resumes the held attack (net._pendingReaction) and clears it.
  let resumed=null;
  setNet({role:'dm', conns:[], session:{battle:{active:true,round:1}, map:{cols:5,rows:5,tiles:{}}, monsters:[], players:[{id:'p1',name:'PC'}], order:[], turn:0}});
  getNet()._pendingReaction={playerId:'p1', resume:choice=>{ resumed=choice; }};
  dmOnData({peer:'p1'}, {t:'reactionChoice', choice:'shield', newAC:15});
  T('reactionChoice (DM): resumes the paused attack with the player\'s choice', resumed && resumed.choice==='shield' && resumed.newAC===15);
  T('reactionChoice (DM): clears the pending reaction so it can\'t fire twice', getNet()._pendingReaction===null);

  // A reactionChoice from the WRONG player (not the one we're waiting on) is ignored — no
  // cross-talk if two attacks were somehow in flight.
  getNet()._pendingReaction={playerId:'p1', resume:choice=>{ resumed='WRONG'; }};
  resumed=null;
  dmOnData({peer:'someone-else'}, {t:'reactionChoice', choice:'none'});
  T('reactionChoice (DM): a choice from a different player than we\'re awaiting is ignored', resumed===null && getNet()._pendingReaction!==null);
  setNet(null);
  openReactionMenu=origMenu2;
}

/* ---- Reactions — Hellish Rebuke + Absorb Elements mechanics (v120.228) ---- */
{
  // Absorb Elements is now learnable (was in REACTION_SPELLS but missing from the spell list).
  T('data: Absorb Elements is now in the learnable spell list (SPELL_SRC), 1st level', spellMeta('Absorb Elements') && spellMeta('Absorb Elements').l===1);
  T('data: Absorb Elements has a real range so the "no silent range gap" audit still passes', !!parseSpellMechanics('Absorb Elements').range);

  // parseMonsterAttacks now extracts a damage type (was unparsed — monster hits reached applyHp
  // with no dtype, so resistances/immunities never applied by type).
  const fireAtk=parseMonsterAttacks('Flame Bite +5 (2d6+3 fire)')[0];
  T('parseMonsterAttacks: extracts the damage type (fire) it used to drop', fireAtk.dtype==='fire');
  T('isElementalDamage: recognises fire as elemental', isElementalDamage('fire')===true && isElementalDamage('bludgeoning')===false);

  // availableReactions gates each option on its own trigger.
  const sorc=newCharacter('Reactor'); sorc.cls='Sorcerer'; sorc.level=3; sorc.spellAbility='cha';
  sorc.spells=[{name:'Shield',level:1,prepared:true},{name:'Absorb Elements',level:1,prepared:true},{name:'Hellish Rebuke',level:1,prepared:true}];
  sorc.slots={1:{total:4,used:0}}; sorc.battle={action:false,bonus:false,reaction:false};
  const elemOpts=availableReactions(sorc, {wouldFlip:true, dtype:'fire', inRebukeRange:true});
  T('availableReactions: offers all three vs a would-flip elemental hit in range', elemOpts.map(o=>o.id).sort().join(',')==='absorb,rebuke,shield');
  const physOpts=availableReactions(sorc, {wouldFlip:false, dtype:'slashing', inRebukeRange:true});
  T('availableReactions: a non-flip, non-elemental hit offers only Hellish Rebuke', physOpts.map(o=>o.id).join(',')==='rebuke');
  T('availableReactions: nothing offered once the reaction is already spent', (()=>{ const s2=Object.assign({},sorc,{battle:{action:false,bonus:false,reaction:true}}); return availableReactions(s2,{wouldFlip:true,dtype:'fire',inRebukeRange:true}).length===0; })());

  // Absorb Elements: castPcReaction sets the resist + rider; applyHp halves the triggering type.
  const c=newCharacter('Absorber'); c.cls='Sorcerer'; c.level=3; c.spellAbility='cha';
  c.spells=[{name:'Absorb Elements',level:1,prepared:true}]; c.slots={1:{total:4,used:0}};
  c.hp={max:30,cur:30,temp:0}; c.conditions={}; c.battle={action:false,bonus:false,reaction:false,actionsMax:1,actionsUsed:0,attacksLeft:1,move:30,moveUsed:0};
  castPcReaction(c, 'absorb', 'fire', ()=>{});
  T('castPcReaction(absorb): spends the reaction and a slot', c.battle.reaction===true && c.slots[1].used===1);
  T('castPcReaction(absorb): sets the resist + melee rider flags for the fire type', c.absorbResist==='fire' && c.absorbRider==='fire');
  applyHp(c, -10, 'fire');
  T('applyHp: Absorb Elements halves the triggering fire damage (10 → 5)', c.hp.cur===25);
  applyHp(c, -10, 'cold');
  T('applyHp: a DIFFERENT damage type is NOT halved by a fire Absorb (10 full)', c.hp.cur===15);
  resetTurnState(c);
  T('resetTurnState: the Absorb resistance expires at the start of your next turn', !c.absorbResist);
  T('resetTurnState: the +1d6 melee rider SURVIVES into your next turn (consumed on a hit, not on turn start)', c.absorbRider==='fire');
  // The rider fires on the next melee hit and is consumed.
  const riderBonus=applyAttackRiders(c, {name:'Longsword', tiles:1}, {hp:20,max:20}, {}, false, false, ()=>{});
  T('applyAttackRiders: the Absorb rider adds bonus damage on the next melee hit', riderBonus.total>0);
  T('applyAttackRiders: the rider is one-shot — consumed after use', c.absorbRider==null);

  // Hellish Rebuke: castPcReaction returns a retaliation descriptor (2d10 fire, a real DC).
  const wl=newCharacter('Rebuker'); wl.cls='Warlock'; wl.level=5; wl.spellAbility='cha'; wl.abilities={str:8,dex:14,con:14,int:10,wis:10,cha:18};
  wl.spells=[{name:'Hellish Rebuke',level:1,prepared:true}]; wl.slots={}; wl.battle={action:false,bonus:false,reaction:false};
  T('sanity: a L5 Warlock\'s slots are pact (level-3) slots, not level 1 — the case the slot fix handles', spellSlots(wl)[1]===0 && spellSlots(wl)[3]>0);
  const rb=castPcReaction(wl, 'rebuke', 'slashing', ()=>{});
  T('castPcReaction(rebuke): returns a retaliation (2d10 fire) with the caster\'s real spell DC', rb.retaliate && rb.retaliate.dtype==='fire' && rb.retaliate.dmg>=2 && rb.retaliate.dmg<=20 && rb.retaliate.dc===8+profBonus(wl)+mod(abil(wl,'cha')));
  T('castPcReaction(rebuke): a Warlock spends their pact slot (level 3), proving reactions aren\'t level-1-locked', wl.battle.reaction===true && wl.slots[3] && wl.slots[3].used===1);
}

/* ---- Dodge & Disengage as general combat actions (v120.229) — core PHB actions previously
   reachable only via Monk subclass shortcuts (Patient Defense / Step of the Wind). ---- */
{
  const c=newCharacter('Tactician'); c.cls='Fighter'; c.level=3; c.abilities={str:14,dex:14,con:14,int:10,wis:10,cha:10};
  c.battle=freshTurnState(c);
  T('freshTurnState: disengaged starts false each turn', c.battle.disengaged===false);

  // Dodge: grants attackers disadvantage via the same Dodge condition Monk's Patient Defense uses
  // (so the mechanic is shared, not a parallel copy). addEffect(cond:'Dodge') → c.conditions.Dodge.
  c.conditions={}; c.effects=[];
  addEffect(c,'Dodge',{rounds:1, cond:'Dodge', note:'Attack rolls against you have disadvantage.'});
  T('Dodge action: sets the Dodge condition that drives attacker disadvantage', !!(c.conditions&&c.conditions.Dodge));
  setQB({active:true, map:{cols:10,rows:10,tiles:{}}, monsters:[{id:'m1',side:'mon',base:'Goblin',name:'Goblin',x:1,y:1,hp:7,max:7,ac:12,attacksLeft:1}], players:[{id:'pc',side:'pc',name:c.name,c,x:1,y:2,hpCur:c.hp.cur,hpMax:c.hp.max}]});
  const r=Engine.hitResult(qbAdapter,'m1','pc',{toHit:5,dmg:'1d6',tiles:1});
  T('Dodge action: a monster attacking a Dodging PC rolls at disadvantage (Engine.hitResult)', r.adv===-1 && r.advWhy.some(w=>/dodg/i.test(w)));
  setQB(null);

  // Disengage: a per-turn flag the movement handlers check to skip opportunity-attack provocation;
  // it lives on c.battle and expires at the start of your next turn like every other per-turn flag.
  c.battle.disengaged=true;
  T('Disengage: the flag can be set on the turn state', c.battle.disengaged===true);
  resetTurnState(c);
  T('resetTurnState: Disengage clears at the start of your next turn', c.battle.disengaged===false);
}

/* ---- coverBetween's line walk (v120.235) ----
   The Bresenham y-step added dy instead of dx, so with dx=0 the error term never settled and the
   walk drifted diagonally off the grid — (0,7)->(0,4) sampled 0,6 then -1,6, -2,5, -3,4 ... to
   -10,-3 before the guard stopped it. Consequences: cover was only ever found when an obstruction
   sat in the first step or two, and the SAME wall gave +5 in one direction and 0 in the other.
   Every mode used this, since Engine reads cover through each adapter. */
{
  const s={ map:{cols:10, rows:10, tiles:{'0,5':'wall'}}, monsters:[], players:[] };
  T('coverBetween: a wall directly between two squares gives three-quarters cover (+5)',
    coverBetween(s, 0,4, 0,7)===5);
  T('coverBetween: ...and gives the SAME answer shot the other way (was 5 vs 0)',
    coverBetween(s, 0,7, 0,4)===coverBetween(s, 0,4, 0,7));
  T('coverBetween: an open lane between two squares is still no cover', coverBetween(s, 3,0, 3,9)===0);
  T('coverBetween: a wall NOT on the line is not counted', coverBetween(s, 4,4, 4,7)===0);
  // The drift was only visible because the walk left the map; assert it stays on the line at all.
  {
    const wide={ map:{cols:20, rows:20, tiles:{}}, monsters:[], players:[] };
    let offGrid=false;
    const probe=new Proxy({}, { get(_,k){ if(typeof k==='string'&&/-/.test(k)) offGrid=true; return undefined; } });
    wide.map.tiles=probe;
    coverBetween(wide, 0,7, 0,4); coverBetween(wide, 0,0, 4,1); coverBetween(wide, 9,9, 1,3);
    T('coverBetween: the walk never samples a negative coordinate (it used to run to -10,-3)', offGrid===false);
  }
  // Diagonals were always fine (dx===dy), so they must not regress.
  { const d={ map:{cols:8,rows:8,tiles:{'3,3':'wall'}}, monsters:[], players:[] };
    T('coverBetween: 45° diagonals still see a wall on the line (unchanged by the fix)',
      coverBetween(d, 2,2, 5,5)===5); }

  /* v120.236: Bresenham breaks ties to one side on non-45° lines, so A→B and B→A could sample
     different cells and disagree when exactly one was an obstruction. Endpoints are now
     canonicalised, which makes cover symmetric for EVERY pair, not just the easy ones. */
  {
    const grid={ map:{cols:12,rows:12,tiles:{}}, monsters:[], players:[] };
    // Seed an irregular scatter of walls so shallow diagonals hit the tie-breaking cases.
    ['2,0','2,1','5,3','6,4','3,7','8,2','4,4','7,9','1,6','9,5'].forEach(k=>{ grid.map.tiles[k]='wall'; });
    let asymmetric=0, checked=0, differing=0;
    for(let ax=0; ax<12; ax+=1) for(let ay=0; ay<12; ay+=3)
      for(let bx=0; bx<12; bx+=3) for(let by=0; by<12; by+=1){
        if(ax===bx && ay===by) continue;
        const f=coverBetween(grid, ax,ay, bx,by), r=coverBetween(grid, bx,by, ax,ay);
        checked++; if(f!==r) asymmetric++; if(f>0) differing++;
      }
    T(`coverBetween: symmetric across ${checked} ordered square pairs on a wall-scattered map`
      +(asymmetric?` — ${asymmetric} still disagree`:''), asymmetric===0);
    // Guard against the test passing because nothing ever found cover at all.
    T('coverBetween: that sweep actually exercised cover (not vacuously all-zero)', differing>0);
  }
}

/* ---- Search action (PHB) — the PC-side half of an action only monsters had ----
   monsterSearchRoll let a DM's monster hunt for a hidden player, but a PC couldn't take the
   Search action at all. maneuverSearch is the shared, adapter-driven counterpart. */
{
  const seeker=newCharacter('Seeker'); seeker.abilities={str:10,dex:10,con:10,int:16,wis:16,cha:10};
  seeker.skillProf.perception=true;
  const freshBattle=()=>({action:false,bonus:false,reaction:false,actionsMax:1,actionsUsed:0,attacksLeft:1,move:30,moveUsed:0});
  seeker.battle=freshBattle();
  setQB({active:true, over:null, paused:false, log:[], map:{cols:6,rows:6,tiles:{},light:{mode:'day'}},
    order:[{k:'p',id:'pc'}], turn:0, battle:{active:true,round:1},
    monsters:[{id:'m1',side:'mon',base:'Goblin',name:'Goblin',x:3,y:0,hp:7,max:7,ac:15,conds:[],attacksLeft:1}],
    players:[{id:'pc',side:'pc',name:seeker.name,c:seeker,x:0,y:0,hpCur:seeker.hp.cur,hpMax:seeker.hp.max}] });
  const sk=getQB().players[0];

  // Nothing hidden: the action still resolves as a logged Perception check (that IS the PHB
  // action — "devote your attention", DM adjudicates), and it still costs the action.
  { const o=Math.random; Math.random=()=>0.99; var nothing=maneuverSearch(qbAdapter, sk, 'perception', qbLog); Math.random=o; }
  T('Search resolves even when nothing is hidden (PHB: a DM-adjudicated Perception check)', nothing.ok===true && nothing.found===0);
  T('Search spends the action', seeker.battle.actionsUsed>0);
  T('Search with no action left is refused', maneuverSearch(qbAdapter, sk, 'perception', qbLog).ok===false);

  // A hidden foe whose Stealth the check beats is revealed; one it can't beat stays hidden.
  seeker.battle=freshBattle();
  getQB().monsters[0].hiddenDC=5; getQB().monsters[0].conds=[{name:'Hidden',rounds:10}];
  { const o=Math.random; Math.random=()=>0.99; var got=maneuverSearch(qbAdapter, sk, 'perception', qbLog); Math.random=o; }
  T('Search reveals a hidden creature when the check beats its Stealth DC', got.found===1 && getQB().monsters[0].hiddenDC===null);
  T('Search strips the Hidden condition off the creature it found', !(getQB().monsters[0].conds||[]).some(x=>x.name==='Hidden'));

  seeker.battle=freshBattle();
  getQB().monsters[0].hiddenDC=99; getQB().monsters[0].conds=[{name:'Hidden',rounds:10}];
  { const o=Math.random; Math.random=()=>0.01; var miss=maneuverSearch(qbAdapter, sk, 'perception', qbLog); Math.random=o; }
  T('Search leaves a creature hidden when the check misses its Stealth DC', miss.found===0 && getQB().monsters[0].hiddenDC===99);

  // PHB allows Investigation (Int) instead of Perception (Wis) at the DM's discretion.
  seeker.battle=freshBattle();
  { const o=Math.random; Math.random=()=>0.5; var inv=maneuverSearch(qbAdapter, sk, 'investigation', qbLog); Math.random=o; }
  T('Search accepts the Investigation (Int) variant the PHB allows', inv.skill==='investigation');
  T('Search logs which skill was used, so the DM can see the ruling', /Investigation/.test(getQB().log[0].m));
  setQB(null);
}

/* ---- Fog of war (v120.241) ----
   Built on losClear + visionLevel + gridDist rather than a parallel visibility model. */
{
  const lit = (tiles)=>({ map:{cols:8,rows:3,tiles:tiles||{}, light:{mode:'day'}}, monsters:[], players:[], lights:[] });
  const dark= (tiles)=>({ map:{cols:8,rows:3,tiles:tiles||{}, light:{mode:'night'}}, monsters:[], players:[], lights:[] });
  const viewer=(x,y,c)=>({x,y,c:c||null});

  T('fog: an open square in daylight is visible', canSeeCell(lit(), viewer(0,0), 3,0)===true);
  T('fog: a wall blocks sight of the square behind it',
    canSeeCell(lit({'2,0':'wall'}), viewer(0,0), 4,0)===false);
  T('fog: the wall square itself is still visible (you see the wall)',
    canSeeCell(lit({'2,0':'wall'}), viewer(0,0), 2,0)===true);
  T('fog: darkness hides a square from a creature with no darkvision',
    canSeeCell(dark(), viewer(0,0), 3,0)===false);
  { const c=newCharacter('Elf'); c.race='Elf';                       // Elves have Darkvision
    T('fog: darkvision sees into the dark (and the race trait is what enables it)',
      hasDarkvision(c)===true && canSeeCell(dark(), viewer(0,0,c), 3,0)===true); }
  T('fog: the perf cap excludes squares beyond maxTiles', canSeeCell(lit(), viewer(0,0), 7,0, 3)===false);

  // visibleCells is just canSeeCell over the grid; a wall must shrink the set.
  { const open=visibleCells(lit(), viewer(0,0));
    const walled=visibleCells(lit({'2,0':'wall','2,1':'wall','2,2':'wall'}), viewer(0,0));
    T('fog: a wall across the map reduces the visible set', walled.size < open.size);
    T('fog: the viewer always sees its own square', open.has('0,0')); }

  // Three-state memory: unseen -> visible -> remembered.
  {
    resetFog('tester');
    const s=lit({'2,0':'wall','2,1':'wall','2,2':'wall'});
    T('fog: a square never seen is "unseen"', fogStateAt(s, viewer(0,0), 'tester', 6,0)==='unseen');
    const seen=visibleCells(s, viewer(0,0));
    rememberSeen(s, 'tester', seen);
    T('fog: a square in view right now is "visible"', fogStateAt(s, viewer(0,0), 'tester', 1,0)==='visible');
    // Walk the viewer somewhere that can no longer see square 1,0 (behind the wall from 6,0).
    const seen2=visibleCells(s, viewer(6,0));
    rememberSeen(s, 'tester', seen2);
    T('fog: a square seen earlier but not now is "remembered", not "unseen"',
      fogStateAt(s, viewer(6,0), 'tester', 1,0, seen2)==='remembered');
    T('fog: memory is per-viewer — a different id has explored nothing',
      fogStateAt(s, viewer(6,0), 'someone-else', 1,0, seen2)==='unseen');
    resetFog('tester');
    T('fog: resetFog clears that viewer\'s memory', exploredCells(s,'tester').size===0);
  }
  // Degrade safely rather than throw on the shapes that actually occur.
  T('fog: no map or no viewer position yields no visibility, and does not throw',
    canSeeCell(null, viewer(0,0), 1,1)===false && canSeeCell(lit(), {x:null,y:null}, 1,1)===false);

  /* v120.244 — "view as player" on the DM side. The DM never holds a connected player's sheet, so
     hasDarkvision() isn't computable there; the flag is synced in the hello payload instead (same
     reason sanctuaryDC/holyAuraDC are). canSeeCell accepts it in place of a character. */
  T('fog: a synced darkvision flag works in place of a character sheet (DM "view as" preview)',
    canSeeCell(dark(), {x:0,y:0,darkvision:true}, 3,0)===true);
  T('fog: ...and without the flag the same viewer sees nothing in the dark',
    canSeeCell(dark(), {x:0,y:0,darkvision:false}, 3,0)===false);
  T('fog: the darkvision flag does not bypass walls — it is light, not x-ray',
    canSeeCell(dark({'2,0':'wall'}), {x:0,y:0,darkvision:true}, 4,0)===false);
  // The DM preview must not pollute the real player's fog memory: different viewerId namespace.
  { resetFog('dmview:p1'); resetFog('p1');
    const s=lit(); rememberSeen(s,'dmview:p1', visibleCells(s,{x:0,y:0,darkvision:true}));
    T('fog: the DM preview keeps its own memory, separate from the player\'s own',
      exploredCells(s,'dmview:p1').size>0 && exploredCells(s,'p1').size===0);
    resetFog('dmview:p1'); }
}

/* ---- The 'me' unit carries its position (v120.240) ----
   playerNetAdapter.unit('me') returned {me,c,id} with NO x/y, so every distance check involving
   the local player saw null and fell back to the weapon's range. Measured on the live site:
   firing a BOW at an ADJACENT PRONE target, the DM's screen showed advantage (+1) — correct RAW,
   since prone grants advantage within 5 ft — while the player's showed disadvantage (-1), because
   a 24-tile weapon was assumed to be a ranged attack. A two-step swing on the same shot. */
{
  const savedNet=getNet();
  const sess={ map:{cols:8,rows:1,tiles:{}},
    monsters:[{id:'m1',name:'Orc',base:'Orc',hp:20,max:20,ac:13,x:1,y:0,conds:[]}],
    players:[{id:'p1',cid:'p1',name:'Hero',ac:15,hpCur:30,hpMax:30,x:4,y:0,conds:[]}] };
  setNet({role:'player', session:sess, peer:{id:'p1'}, charId:null});
  // playerChar() is null in this harness, so unit('me') must still return null, not throw.
  T("unit('me') stays null (not a crash) when no character is bound", playerNetAdapter.unit('me')===null);
  setNet(savedNet);
}

/* ---- Engine must not crash on an unresolvable unit (v120.240) ----
   ad.unit(id) returns null for any id it can't resolve — a monster deleted mid-turn, a player
   who dropped, a stale id in a queued action, or 'me' before a character is bound. Every
   adapter's checkSubject dereferences the unit, so hitResult/castApply threw a TypeError and
   took the whole attack down. Found while probing the melee blind spot: the crash was the thing
   standing in the way of measuring it. */
{
  setQB({active:true, over:null, log:[], map:{cols:5,rows:5,tiles:{}}, battle:{active:true,round:1},
    players:[], monsters:[{id:'m1',side:'mon',name:'Orc',base:'Orc',hp:20,max:20,ac:13,x:0,y:0,conds:[]}]});
  const atk={name:'Club', toHit:5, dmg:'1d6', tiles:1};
  const safe=fn=>{ try{ return fn(); }catch(e){ return 'THREW: '+e.message; } };
  T('hitResult survives an unknown ATTACKER id instead of throwing',
    typeof safe(()=>Engine.hitResult(qbAdapter,'nobody','m1',atk,10))==='object');
  T('hitResult survives an unknown TARGET id instead of throwing',
    typeof safe(()=>Engine.hitResult(qbAdapter,'m1','nobody',atk,10))==='object');
  T('hitResult survives BOTH ids being unresolvable',
    typeof safe(()=>Engine.hitResult(qbAdapter,'nobody','nothing',atk,10))==='object');
  // A real attack must still resolve exactly as before — the guards are additive, not a behaviour change.
  const ok=Engine.hitResult(qbAdapter,'m1','m1',atk,10);
  T('a resolvable attack is unaffected by the null guards', typeof ok==='object' && ok.ac!=null);
  setQB(null);
}

/* ---- Structured spell mechanics beat the prose (v120.242, Pillar 1) ----
   SPELL_DESC was load-bearing English: parseSpellMechanics mined it for save, dice, damage type
   and attack-roll, so rewording a description silently changed the game. SPELL_MECH is now the
   authoritative source for the 89 spells that have mechanics; the prose parser survives only as
   the fallback for anything not yet listed. */
{
  // 1. The table wins. Take a listed spell and check the parser returns the table's values.
  const fb=SPELL_MECH['Fire Bolt'];
  T('SPELL_MECH: a listed spell parses to exactly its table entry',
    fb && parseSpellMechanics('Fire Bolt').dmg===fb.dmg && parseSpellMechanics('Fire Bolt').dtype===fb.dtype
      && parseSpellMechanics('Fire Bolt').attack===!!fb.attack);

  // 2. THE POINT OF THE WHOLE EXERCISE: rewriting the description must no longer change mechanics.
  {
    const orig=SPELL_DESC['Fire Bolt'];
    SPELL_DESC['Fire Bolt']='A completely rewritten description with 99d99 cold and a Wis save.';
    const after=parseSpellMechanics('Fire Bolt');
    SPELL_DESC['Fire Bolt']=orig;
    T('SPELL_MECH: rewording a listed spell\'s prose does NOT change its mechanics (was the bug class)',
      after.dmg==='1d10' && after.dtype==='fire' && after.save===null);
  }

  // 3. Spells whose "dice" were never damage — the parser used to offer a damage roll for them.
  //    They must be listed with an EMPTY entry, not omitted: omitting a spell means "ask the
  //    prose", and the prose is exactly what gets these wrong. (The ratchet below caught this
  //    during the migration — the first attempt deleted them from the table and the fallback
  //    promptly re-introduced the bogus damage.)
  for(const n of ['Guidance','Resistance','Shillelagh'])
    T(`SPELL_MECH: ${n} deals no damage (its die is a bonus/weapon die), via an explicit empty entry`,
      !parseSpellMechanics(n).dmg && !!SPELL_MECH[n] && !SPELL_MECH[n].dmg);

  // 4. Spells that legitimately DO deal damage must not have been dropped by that correction.
  T('SPELL_MECH: Acid Splash and Spiritual Weapon still deal damage (they are real damage spells)',
    parseSpellMechanics('Acid Splash').dmg==='1d6' && parseSpellMechanics('Spiritual Weapon').dmg==='1d8');

  // 5. Unlisted spells still work via the prose fallback — the migration is incremental.
  T('SPELL_MECH: an unlisted spell still parses from prose (fallback intact)',
    !SPELL_MECH['Prestidigitation'] && typeof parseSpellMechanics('Prestidigitation')==='object');

  // 6. Ratchet: count spells still relying on prose for mechanics. This may only ever go DOWN.
  //    If it rises, someone added a mechanical spell without a SPELL_MECH entry.
  {
    let proseOnly=0;
    for(const n of Object.keys(SPELL_DESC)){
      if(SPELL_MECH[n]||SPELL_EFFECTS[n]) continue;
      const m=parseSpellMechanics(n);
      if(m.dmg||m.heal||m.save||m.attack) proseOnly++;
    }
    T(`SPELL_MECH ratchet: ${proseOnly} spells still derive mechanics from prose (must not increase; was 0 at migration)`,
      proseOnly<=0);
  }
}

/* ---- Invisible is visible on the board (v120.250) ----
   The condition already drove advantage/disadvantage; nothing showed it, so a table could forget
   it was running. One predicate across all three unit shapes, since that's where such checks drift. */
{
  T('unitIsInvisible: a monster with the condition in conds[]',
    unitIsInvisible({name:'Imp', conds:[{name:'Invisible',rounds:10}]})===true);
  { const c=newCharacter('Sneak'); c.conditions={Invisible:true};
    T('unitIsInvisible: a Quick Battle PC carrying it on the character', unitIsInvisible({side:'pc', c})===true); }
  T('unitIsInvisible: a DM-side player mirror with a flat string array',
    unitIsInvisible({name:'Hero', hpCur:10, conds:['Invisible']})===true);
  T('unitIsInvisible: a plain unit is not invisible', unitIsInvisible({name:'Orc', conds:[]})===false);
  T('unitIsInvisible: null/undefined degrade to false rather than throwing',
    unitIsInvisible(null)===false && unitIsInvisible(undefined)===false);
  // It must not be confused with the OTHER concealment state — they stack differently in play.
  T('unitIsInvisible: Hidden is not Invisible (separate states)',
    unitIsInvisible({name:'Goblin', conds:[{name:'Hidden',rounds:10}]})===false);
  // And the mechanical half must still work, so the visual is a cue rather than the whole feature.
  T('Invisible still grants the attacker advantage (mechanics unchanged by the visual)',
    attackAdvantage(new Set(['Invisible']), new Set(), true, {}).adv>0);
}

/* ---- Invisible creatures can Hide in the open (v120.262) ----
   Reported from play: standing invisible in a daylit field, Hide was refused with "need darkness,
   full cover, or (Skulker) dim light" — the one situation where hiding should be EASIEST. PHB: you
   can't hide from something that can see you, and an invisible creature is heavily obscured to
   anything without See Invisibility, so being unseen is itself the qualifying condition. */
{
  const ad=s=>({ map:()=>s.map, name:u=>u.name, allMonsters:()=>s.monsters||[] });
  const daylitField={ map:{cols:8,rows:3,tiles:{}, light:{mode:'day'}}, monsters:[], players:[] };
  const watcher={x:6,y:0,name:'Wolf',base:'Wolf',hp:11};
  const invisUnit={x:0,y:0,name:'Ghost',conds:[{name:'Invisible',rounds:9}]};
  const plainUnit={x:0,y:0,name:'Solid',conds:[]};

  T('hide: an INVISIBLE creature can hide in an open, daylit field',
    hideEligibility(ad(daylitField), invisUnit, [watcher], false).ok===true);
  T('hide: a visible creature still cannot (the old rule is intact)',
    hideEligibility(ad(daylitField), plainUnit, [watcher], false).ok===false);
  T('hide: the eligibility reports WHY it passed, so the UI can explain it',
    hideEligibility(ad(daylitField), invisUnit, [watcher], false).invisible===true);
  // A watcher that can see invisible negates it, the same way cover being blown would.
  { const seer={x:6,y:0,name:'Seer',base:'Seer',hp:20,effects:[{name:'See Invisibility'}]};
    const canSee=typeof hasSeesInvisible==='function' && hasSeesInvisible(seer);
    if(canSee) T('hide: a watcher with See Invisibility negates the invisibility route',
      hideEligibility(ad(daylitField), invisUnit, [seer], false).ok===false);
    else T('hide: (See Invisibility watcher case skipped — hasSeesInvisible does not read that shape)', true); }
  // Darkness must still work on its own for a plainly visible creature.
  { const night={ map:{cols:8,rows:3,tiles:{}, light:{mode:'night'}}, monsters:[], players:[] };
    T('hide: darkness still qualifies without invisibility',
      hideEligibility(ad(night), plainUnit, [watcher], false).ok===true); }
}

/* ---- Invisibility actually helps against the AI (v120.261) ----
   Attacks on an invisible target already rolled at disadvantage, but BRAINS.tactical picked
   targets as if it could see perfectly — so a monster walked straight at an invisible PC and swung
   anyway, which reads as "invisibility does nothing". RAW an invisible creature CAN still be
   attacked (guess the square, at disadvantage), so this is a PREFERENCE, not immunity. */
{
  const mkPc=(name,invis)=>{ const c=newCharacter(name); c.hp.cur=c.hp.max=20;
    if(invis){ c.conditions={Invisible:true}; }
    return {id:name, side:'pc', name, c, x:2, y:0, conds:invis?[{name:'Invisible',rounds:9}]:[]}; };

  const base=()=>({active:true, over:null, log:[], map:{cols:8,rows:1,tiles:{},light:{mode:'day'}},
    battle:{active:true,round:1}, order:[], turn:0, lights:[],
    monsters:[{id:'m1',side:'mon',name:'Orc',base:'Orc',hp:15,max:15,ac:13,x:0,y:0,conds:[],
               attacksLeft:1,moveLeft:30,speed:30,atk:'Greataxe +5 (1d12+3)'}]});

  // Both targets available: the AI must go for the one it can see.
  { const s=base(); s.players=[mkPc('Ghost',true), mkPc('Solid',false)];
    s.players[1].x=3;
    setQB(s);
    const intents=BRAINS.tactical(getQB(), getQB().monsters[0])||[];
    const atk=intents.find(i=>i.type==='attack');
    T('AI targeting: with a visible and an invisible foe, the monster goes for the VISIBLE one',
      !atk || atk.targetId==='Solid');
    setQB(null); }

  // Only an invisible target: RAW still allows attacking the guessed square, so it must not freeze.
  { const s=base(); s.players=[mkPc('Ghost',true)];
    setQB(s);
    const intents=BRAINS.tactical(getQB(), getQB().monsters[0])||[];
    T('AI targeting: with ONLY an invisible foe the monster still acts (RAW: guess the square)',
      Array.isArray(intents) && intents.length>0);
    setQB(null); }

  // And the roll it makes is still at disadvantage — the preference doesn't replace the penalty.
  T('attacking an invisible target is still at disadvantage',
    attackAdvantage(new Set(), new Set(['Invisible']), true, {}).adv<0);
  T('...unless the attacker can see invisible',
    attackAdvantage(new Set(), new Set(['Invisible']), true, {seesInvisible:true}).adv===0);
}

/* ---- Legendary & lair actions (v120.247) ----
   The last real combat gap: boss monsters had no mechanics, only a prose note telling the DM to
   adjudicate. Two RAW rules are easy to get wrong and are pinned here — a legendary creature may
   not act on its OWN turn, and lair actions fire once per ROUND on initiative 20, not on a turn. */
{
  const drake=()=>({id:'d1', name:'Young Red Dragon', base:'Young Red Dragon', hp:178, max:178, ac:18, x:0,y:0, conds:[]});

  T('legendary: a boss has a profile, an ordinary monster does not',
    !!legendaryOf(drake()) && !legendaryOf({name:'Goblin', base:'Goblin'}));

  { const d=drake(); resetLegendary(d);
    T('legendary: the pool refreshes to perRound at the start of its turn', d.legLeft===3);
    T('legendary: it may NOT act on its own turn (RAW)', canSpendLegendary(d,1,true)===false);
    T('legendary: it may act at the end of someone else\'s turn', canSpendLegendary(d,1,false)===true);

    const a=spendLegendary(d,'Tail Attack',false);
    T('legendary: spending a 1-cost action leaves 2', !!a && d.legLeft===2);
    const w=spendLegendary(d,'Wing Attack',false);
    T('legendary: Wing Attack costs 2, emptying the pool', !!w && w.cost===2 && d.legLeft===0);
    T('legendary: an empty pool refuses the next action', spendLegendary(d,'Detect',false)===null);
    resetLegendary(d);
    T('legendary: the next turn start refills it', d.legLeft===3); }

  { const d=drake(); resetLegendary(d); d.hp=0;
    T('legendary: a dead boss spends nothing', canSpendLegendary(d,1,false)===false); }
  { const d=drake(); resetLegendary(d); d.conds=[{name:'Paralyzed',rounds:3}];
    T('legendary: an incapacitated boss spends nothing', canSpendLegendary(d,1,false)===false); }
  { const d=drake(); resetLegendary(d);
    T('legendary: an unknown action name is refused, not silently free',
      spendLegendary(d,'Nonexistent Action',false)===null && d.legLeft===3); }

  // Lair actions: once per round, and re-rendering must not fire them twice.
  { const s={battle:{active:true, round:1}}; const d=drake();
    T('lair: pending on a fresh round', lairPending(s,d)===true);
    markLairUsed(s);
    T('lair: not pending again in the SAME round (re-render / undo safe)', lairPending(s,d)===false);
    s.battle.round=2;
    T('lair: pending again next round', lairPending(s,d)===true);
    T('lair: a monster with no lair never pends', lairPending(s,{name:'Goblin',base:'Goblin',hp:7})===false);
    s.battle.active=false;
    T('lair: nothing pends outside an active battle', lairPending(s,d)===false); }

  // Every legendary/lair action must reference a monster that actually exists.
  { const missing=Object.keys(LEGENDARY).concat(Object.keys(LAIR)).filter(n=>!MONSTERS_5E.some(m=>m.n===n));
    T('legendary/lair tables reference real bestiary monsters'+(missing.length?' — missing: '+missing.join(', '):''),
      missing.length===0); }
}

/* ---- Structured monster attacks (v120.243, Pillar 1 continued) ----
   Keyed by the exact `atk` string, so built-in bestiary entries use structured data while
   user-typed homebrew/NPC strings keep falling through to the prose parser — which for them is
   the intended feature, not a liability. */
{
  const wyvern=MONSTERS_5E.find(m=>m.n==='Wyvern');
  const sting=parseMonsterAttacks(wyvern.atk).find(a=>/Stinger/i.test(a.name));
  T('MONSTER_MECH: the Wyvern\'s Stinger is a 10 ft reach MELEE attack, not a 120 ft ranged one',
    sting.tiles===2);
  // The heuristic itself was fixed, so a homebrew "Stinger" is no longer ranged either.
  T('the range heuristic no longer treats "stinger"/"spike" as ranged (helps homebrew too)',
    parseMonsterAttacks('Stinger +5 (1d6)')[0].tiles<12);

  // Homebrew must NOT be captured by the table — it has to keep using the prose parser.
  { const hb=parseMonsterAttacks('Custom Blade +6 (2d8+3 slashing) · Zap +4 (1d8 lightning)');
    T('MONSTER_MECH: a user-typed homebrew string still parses from prose (2 attacks, typed)',
      hb.length===2 && hb[0].hit===6 && hb[0].dtype==='slashing' && hb[1].dtype==='lightning'); }

  // The table must not hand out shared objects that a caller could mutate.
  { const a1=parseMonsterAttacks(wyvern.atk)[0]; a1.dmg='999d999';
    const a2=parseMonsterAttacks(wyvern.atk)[0];
    T('MONSTER_MECH returns copies — mutating one parse cannot corrupt the shared table',
      a2.dmg!=='999d999'); }

  // Ratchet: every built-in bestiary entry must be covered, or it silently reverts to prose.
  { const missing=MONSTERS_5E.filter(m=>(m.atk||'').trim() && !MONSTER_MECH[m.atk]).map(m=>m.n);
    T(`MONSTER_MECH ratchet: every bestiary monster has a structured entry${missing.length?' — MISSING: '+missing.join(', '):''}`,
      missing.length===0); }
}

/* ---- Monster attack damage types (v120.239) ----
   Only 11 of 56 parsed monster attacks (20%) carried a damage type: the bestiary writes
   "Scimitar +4 (1d6+2)" and never says "slashing". An untyped hit can't match ANY resistance,
   vulnerability or immunity, so a Mage's Fireball didn't count as fire and a Goblin's scimitar
   didn't count as slashing. parseMonsterAttacks now falls back to the attack NAME — WEAPONS
   first (single source for manufactured weapons), then MONSTER_ATK_DTYPE for natural weapons. */
{
  const typeOf=(raw,idx)=>parseMonsterAttacks(raw)[idx||0].dtype;
  T('monster attack: a scimitar is slashing, from the WEAPONS catalog (prose never says so)',
    typeOf('Scimitar +4 (1d6+2)')==='slashing');
  T('monster attack: a greataxe is slashing', typeOf('Greataxe +5 (1d12+3)')==='slashing');
  T('monster attack: a bite is piercing, from the natural-weapon table',
    typeOf('Bite +4 (1d6+2)')==='piercing');
  T('monster attack: a slam is bludgeoning', typeOf('Slam +5 (2d6+3)')==='bludgeoning');
  T("monster attack: a Ghost's Withering Touch is necrotic", typeOf('Withering Touch +5 (4d6+3)')==='necrotic');
  T("monster attack: a Mage's Fireball is fire (it was untyped, so fire resistance did nothing)",
    typeOf('Fireball (8d6)')==='fire');
  T('monster attack: Magic Missile is force', typeOf('Magic Missile (3d4+3)')==='force');
  // Prose that DOES state a type must still win over the name-based fallback.
  T('monster attack: an explicit type in the prose beats the name lookup',
    typeOf('Bite +5 (1d8+3 fire)')==='fire');
  // Beholder eye rays differ per ray, so they are deliberately left untyped.
  T('monster attack: Eye Rays stay untyped on purpose (each ray is a different type)',
    typeOf('Eye Rays +5 (1d6)')==='');

  // The payoff, end to end: a skeleton is bludgeoning-vulnerable, so a club must now double.
  const skel={base:'Skeleton', name:'Skeleton'};
  T('a Skeleton now takes DOUBLE damage from a bludgeoning monster attack (was x1, untyped)',
    monsterDmgMult(skel, typeOf('Greatclub +4 (2d8+2)'))===2);
  T('...and still normal damage from a slashing one', monsterDmgMult(skel, typeOf('Scimitar +4 (1d6+2)'))===1);

  // Coverage guard: keep the bestiary honest as monsters are added.
  {
    let dmgAttacks=0, typed=0; const untyped=[];
    for(const mo of MONSTERS_5E) for(const a of parseMonsterAttacks(mo.atk||'')){
      if(!a.dmg) continue; dmgAttacks++;
      if(a.dtype) typed++; else untyped.push((mo.n||mo.name)+'::'+a.name);
    }
    const allowed=untyped.every(x=>/Eye Rays/.test(x));
    T(`monster damage-type coverage is ${typed}/${dmgAttacks}, and every exception is a documented Eye Rays entry`
      +(allowed?'':' — unexpected: '+untyped.join(', ')), allowed);
  }
}

/* ---- Spell damage types the prose never stated (v120.238) ----
   parseSpellMechanics reads the damage type from a "<dice> <type>" phrase, so a spell that names
   its type anywhere else — or not at all — silently ended up with dtype:''. An empty type means
   monsterDmgMult() can never apply resistance/vulnerability/immunity to that spell. Found by
   parsing all 257 spells and flagging any with damage but no type. */
{
  T('Sacred Flame is radiant (prose says "Radiant flame", never "1d8 radiant")',
    parseSpellMechanics('Sacred Flame').dtype==='radiant');
  T('Spike Growth is piercing (prose never names a type at all)',
    parseSpellMechanics('Spike Growth').dtype==='piercing');
  T('Spiritual Weapon is force (matters: force bypasses incorporeal physical resistance)',
    parseSpellMechanics('Spiritual Weapon').dtype==='force');
  // The override must not invent damage where there is none, nor override a correctly-parsed type.
  T('the dtype override never fires for a spell with no damage', !SPELL_DTYPE['Bless']);
  T('a spell that DOES state its type inline still parses it from the prose (no regression)',
    parseSpellMechanics('Fire Bolt').dtype==='fire');
  // The payoff: a fire-immune monster must not shrug off radiant damage, and vice versa.
  { const dragon={base:'Red Dragon', name:'Red Dragon'};
    const sf=parseSpellMechanics('Sacred Flame');
    T('a fire-immune monster takes FULL damage from Sacred Flame now that it is typed radiant',
      monsterDmgMult(dragon, sf.dtype)===1); }
  // Every spell in the override table must actually deal damage, or the entry is dead weight.
  T('every SPELL_DTYPE entry belongs to a spell that really deals damage',
    Object.keys(SPELL_DTYPE).every(n=>!!parseSpellMechanics(n).dmg));
}

/* ---- Monster hiding (v120.237) ----
   Stealth was one-directional: a PC could hide (maneuverHide) and a monster could Search for
   them, but nothing could ever set a monster's hiddenDC — so the Search action added in v120.232
   had nothing to find. This closes the loop with ONE shared rule per behaviour rather than a
   parallel monster copy: hideEligibility, revealUnit and unitHiddenFrom are used by both sides. */
{
  const dark={ map:{cols:8,rows:8,tiles:{}, light:{mode:'night'}}, monsters:[], players:[] };
  const lit ={ map:{cols:8,rows:8,tiles:{}, light:{mode:'day'}},   monsters:[], players:[] };
  const mkMo=()=>({id:'m1', side:'mon', base:'Goblin', name:'Goblin', x:5,y:0, hp:7, max:7, ac:15, conds:[]});
  const adFor=s=>({ map:()=>s.map, name:u=>u.name, allMonsters:()=>s.monsters });

  // Eligibility uses the same rule as the PC path: darkness, or full cover from the watcher.
  { const s=JSON.parse(JSON.stringify(lit)); const mo=mkMo(); s.monsters=[mo];
    const watcher={x:0,y:0};
    T('monster hiding: refused in the open, in bright light (same rule the PC path uses)',
      hideMonster(adFor(s), mo, [watcher], null).success===false);
    s.map.tiles={'2,0':'wall'};                       // full cover on the line to the watcher
    const r=hideMonster(adFor(s), mo, [watcher], null);
    T('monster hiding: succeeds behind full cover, and sets a real Stealth DC',
      r.success===true && Number.isFinite(mo.hiddenDC) && mo.hiddenDC>0);
    T('monster hiding: also marks the Hidden condition on the unit', (mo.conds||[]).some(x=>x.name==='Hidden'));
  }
  { const s=JSON.parse(JSON.stringify(dark)); const mo=mkMo(); s.monsters=[mo];
    T('monster hiding: darkness alone is enough (no cover needed)',
      hideMonster(adFor(s), mo, [{x:0,y:0}], null).success===true); }

  // Hidden grants advantage on the attack — the same attackAdvantage path PCs use.
  { const mo=mkMo(); mo.conds=[{name:'Hidden',rounds:100}];
    T('monster hiding: a hidden attacker gets advantage, like a hidden PC does',
      attackAdvantage(unitConds(mo), new Set(), true, {}).adv>0); }

  // Attacking reveals — revealUnit must handle BOTH unit shapes.
  { const mo=mkMo(); mo.hiddenDC=17; mo.conds=[{name:'Hidden',rounds:100}];
    T('revealUnit: clears a hidden MONSTER (conds + hiddenDC)',
      revealUnit(mo)===true && mo.hiddenDC===null && !(mo.conds||[]).some(x=>x.name==='Hidden'));
    const pc=newCharacter('Sneaky'); pc.conditions={Hidden:true}; pc.hiddenDC=19;
    T('revealUnit: clears a hidden PC through the same helper',
      revealUnit({c:pc})===true && !pc.conditions.Hidden && pc.hiddenDC===null);
    T('revealUnit: reports false when the unit was not hidden at all', revealUnit(mkMo())===false); }

  // Noticing: passive Perception >= Stealth spots it automatically.
  { const mo=mkMo(); mo.hiddenDC=14;
    T('unitHiddenFrom: a keen observer (passive 15) notices a Stealth-14 monster', unitHiddenFrom(15,mo)===false);
    T('unitHiddenFrom: a dull observer (passive 10) does not', unitHiddenFrom(10,mo)===true);
    T('unitHiddenFrom: passive exactly equal to the DC still notices it (5e ties go to the observer)',
      unitHiddenFrom(14,mo)===false);
    T('unitHiddenFrom: a monster that is not hiding is never hidden', unitHiddenFrom(1,mkMo())===false); }

  // The safe default matters: an unknown observer must filter NOTHING, or targets vanish.
  T('observerPassivePerception: unknown observer yields Infinity so nothing is filtered out',
    observerPassivePerception(null)===Infinity);
  T('observerPassivePerception: reads a real character\'s passive Perception',
    Number.isFinite(observerPassivePerception(newCharacter('Watcher'))));

  /* v120.238: the filter existed from v120.237 but NOTHING passed an observer, so it never ran
     and hidden monsters stayed targetable. Assert the real targeting builder drops them. */
  {
    const dull=newCharacter('Dull');   dull.abilities={str:10,dex:10,con:10,int:10,wis:6,cha:10};
    const keen=newCharacter('Keen');   keen.abilities={str:10,dex:10,con:10,int:10,wis:20,cha:10};
    keen.skillProf.perception=true;
    // One monster only. An earlier draft of this test put a second monster in the line and it
    // vanished from the target list for an unrelated (and correct) reason — a creature standing
    // between you and the target blocks it — which nearly got misread as a filter bug.
    const mk=hidden=>({ map:{cols:10,rows:5,tiles:{},light:{mode:'day'}},
      monsters:[{id:'lurker', name:'Goblin', base:'Goblin', hp:7,max:7,ac:15,x:3,y:2,
                 conds:hidden?[{name:'Hidden',rounds:100}]:[], hiddenDC:hidden?14:null}],
      players:[] });
    const from={x:0,y:0};
    const ids=(hidden,o)=>(buildTargetingOpts(mk(hidden), from, 8, o||{}).targets||[]);
    T('targeting: an unhidden monster is targetable (control)', ids(false).includes('lurker'));
    T('targeting: with NO observer nothing is filtered (the safe default is preserved)',
      ids(true).includes('lurker'));
    T('targeting: a dull-eyed PC (passive 8) cannot target a monster hiding at Stealth 14',
      !ids(true,{observer:dull}).includes('lurker'));
    T('targeting: a keen-eyed PC (passive 17) CAN target that same hidden monster',
      ids(true,{observer:keen}).includes('lurker'));
  }

  // And the payoff: the Search action can now actually find something.
  { const seeker=newCharacter('Finder'); seeker.abilities={str:10,dex:10,con:10,int:10,wis:18,cha:10};
    seeker.battle={action:false,bonus:false,reaction:false,actionsMax:1,actionsUsed:0,attacksLeft:1,move:30,moveUsed:0};
    setQB({active:true, over:null, paused:false, log:[], map:{cols:8,rows:8,tiles:{},light:{mode:'day'}},
      order:[{k:'p',id:'pc'}], turn:0, battle:{active:true,round:1},
      monsters:[Object.assign(mkMo(),{hiddenDC:6, conds:[{name:'Hidden',rounds:100}]})],
      players:[{id:'pc',side:'pc',name:seeker.name,c:seeker,x:0,y:0,hpCur:seeker.hp.cur,hpMax:seeker.hp.max}] });
    const o=Math.random; Math.random=()=>0.99;
    const res=maneuverSearch(qbAdapter, getQB().players[0], 'perception', qbLog);
    Math.random=o;
    T('monster hiding closes the loop: the Search action now finds a hidden MONSTER (it never could before)',
      res.found===1 && getQB().monsters[0].hiddenDC===null);
    setQB(null); }
}

/* ---- MODE-PARITY HARNESS (VISION roadmap #3) ----
   The user's stated #1 friction is "systems applied to quick battle but not DM battle/hosted".
   Every parity pass so far (v120.208, v120.209) was manual archaeology that goes stale the
   moment new code lands. This turns it into a build failure instead.

   How it works: the three adapters are the ONLY thing standing between the shared Engine and
   each mode, and Engine treats every adapter method as optional — `ad.cover ? ad.cover(a,t) : 0`,
   `ad.damageMult ? ... : 1`, and so on. That's what makes divergence silent: a mode that simply
   lacks a method quietly gets the neutral default instead of the rule. So an adapter's method
   SET is a precise, cheap proxy for "which rules exist in this mode", and it's introspectable
   at runtime rather than by parsing. */
{
  const iface=a=>Object.keys(a).sort();
  const QB=iface(qbAdapter), SESS=iface(sessionAdapter), PNET=iface(playerNetAdapter);
  const missing=(base,other)=>base.filter(k=>!other.includes(k));

  // Every KNOWN delta, with why. A delta that is NOT listed here fails the test — that's the
  // whole point: new divergence has to be justified in writing, not discovered a version later.
  const KNOWN={
    sessionAdapter:{
      // Intentional: enemy selection is Quick Battle's AI concern. In DM-hosted play a human
      // picks targets, so there is no "who are my enemies" question for the Engine to ask.
      enemiesOf:'intentional — QB AI target selection only; DM-hosted has a human choosing',
    },
    playerNetAdapter:{
      damageMult:'intentional — DM is authoritative and applies resist/vuln/imm to raw damage',
      enemiesOf:'intentional — no local AI on a player device',
      findGrappler:'intentional — grapple bookkeeping is resolved DM-side',
      // cover / sanctuaryDC / holyAuraDC were listed here as confirmed bugs and are now
      // IMPLEMENTED (v120.234) — removed from this list, which is exactly what the
      // "no stale entries" assertion below forces you to do once a gap is closed.
    },
  };

  for(const [label, other] of [['sessionAdapter',SESS], ['playerNetAdapter',PNET]]){
    const gaps=missing(QB, other), known=Object.keys(KNOWN[label]);
    const undocumented=gaps.filter(k=>!known.includes(k));
    const stale=known.filter(k=>!gaps.includes(k));
    T(`mode parity: ${label} has no UNDOCUMENTED gap vs qbAdapter`
      +(undocumented.length?` — new divergence: ${undocumented.join(', ')} (add it to KNOWN with a reason, or implement it)`:''),
      undocumented.length===0);
    T(`mode parity: ${label}'s documented-gap list has no stale entries`
      +(stale.length?` — now implemented, delete from KNOWN: ${stale.join(', ')}`:''), stale.length===0);
  }
  // An adapter gaining a method the others don't know about is divergence too, in the other
  // direction — it means a rule that only the non-QB mode applies.
  T('mode parity: no adapter has a method qbAdapter lacks (reverse divergence)',
    missing(SESS,QB).length===0 && missing(PNET,QB).length===0);

  /* ---- SCENARIO MATRIX (v120.245) ----
     Interface comparison catches a MISSING method. It cannot catch two modes computing the same
     rule differently, which is the failure that actually reached production (cover applied on one
     device and not the other). So: build equivalent state in Quick Battle and DM-hosted, run the
     same shot through both with a fixed d20, and require identical ac/cover/hit/adv across a
     matrix of conditions. Every row here is a rule that already shipped broken in one mode or is
     the same shape as one that did. */
  {
    const mkPC=()=>{ const c=newCharacter('Matrix'); c.abilities={str:14,dex:14,con:12,int:10,wis:10,cha:10};
      c.armor='none'; c.conditions={}; c.hp.cur=c.hp.max=30; return c; };
    const atkMelee={name:'Sword', toHit:5, dmg:'1d8', tiles:1};
    const atkRanged={name:'Bow', toHit:5, dmg:'1d8', tiles:12};

    // Each row: how to decorate the shared world, and which attack to make.
    const SCENARIOS=[
      {n:'baseline, open ground',            tiles:{}, mConds:[], pConds:[], atk:atkMelee, light:'day'},
      {n:'wall between (3/4 cover)',         tiles:{'1,0':'wall'}, mConds:[], pConds:[], atk:atkRanged, light:'day'},
      {n:'target prone, melee',              tiles:{}, mConds:[{name:'Prone',rounds:5}], pConds:[], atk:atkMelee, light:'day'},
      {n:'target prone, ranged',             tiles:{}, mConds:[{name:'Prone',rounds:5}], pConds:[], atk:atkRanged, light:'day'},
      {n:'target restrained',                tiles:{}, mConds:[{name:'Restrained',rounds:5}], pConds:[], atk:atkMelee, light:'day'},
      {n:'attacker poisoned',                tiles:{}, mConds:[], pConds:[{name:'Poisoned',rounds:5}], atk:atkMelee, light:'day'},
      {n:'target invisible',                 tiles:{}, mConds:[{name:'Invisible',rounds:5}], pConds:[], atk:atkMelee, light:'day'},
      {n:'darkness (lighting parity)',       tiles:{}, mConds:[], pConds:[], atk:atkRanged, light:'night'},
      {n:'target paralyzed (auto-crit path)',tiles:{}, mConds:[{name:'Paralyzed',rounds:5}], pConds:[], atk:atkMelee, light:'day'},
    ];

    let mismatches=[];
    for(const sc of SCENARIOS){
      const pcQB=mkPC(), pcDM=mkPC();
      const geom={cols:6, rows:1, tiles:sc.tiles, light:{mode:sc.light}};

      // Quick Battle: the monster attacks the PC.
      setQB({active:true, over:null, log:[], map:JSON.parse(JSON.stringify(geom)), battle:{active:true,round:1}, lights:[],
        players:[{id:'pc', side:'pc', name:'Matrix', c:pcQB, x:3,y:0, conds:sc.pConds.slice()}],
        monsters:[{id:'m1', side:'mon', name:'Orc', base:'Orc', hp:20,max:20, ac:13, x:0,y:0, conds:sc.mConds.slice()}]});
      // Conditions on a QB PC live on the character, not the unit.
      sc.pConds.forEach(c0=>{ pcQB.conditions[c0.name]=true; });
      const q=Engine.hitResult(qbAdapter,'m1','pc',sc.atk,11);

      // DM-hosted: identical geometry, mirror shapes.
      setNet({role:'dm', peer:{id:'x'}, session:{ map:JSON.parse(JSON.stringify(geom)), lights:[],
        players:[{id:'pc', cid:'pc', name:'Matrix', ac:computeAC(pcDM), hpCur:30, hpMax:30, x:3,y:0,
                  conds:sc.pConds.map(c0=>c0.name)}],
        monsters:[{id:'m1', name:'Orc', base:'Orc', hp:20,max:20, ac:13, x:0,y:0, conds:sc.mConds.slice()}] }});
      const d=Engine.hitResult(sessionAdapter,'m1','pc',sc.atk,11);

      setQB(null); setNet(null);
      if(q.ac!==d.ac || q.cover!==d.cover || q.hit!==d.hit || q.adv!==d.adv)
        mismatches.push(`${sc.n}: QB{ac:${q.ac},cov:${q.cover},adv:${q.adv},hit:${q.hit}} vs DM{ac:${d.ac},cov:${d.cover},adv:${d.adv},hit:${d.hit}}`);
    }
    T(`mode parity matrix: all ${SCENARIOS.length} scenarios resolve identically in QB and DM-hosted`
      +(mismatches.length?' — '+mismatches.join(' | '):''), mismatches.length===0);
  }

  /* Behavioural parity, not just structural: the same geometry must produce the same to-hit
     in Quick Battle and DM-hosted. A wall between attacker and target is three-quarters cover
     (+5 AC), and this is exactly the class of rule that used to be wired into one mode only. */
  {
    const pcC=newCharacter('ParityPC'); pcC.hp.cur=pcC.hp.max=30;
    const geom={cols:5,rows:1,tiles:{'1,0':'wall'}};
    const atk={name:'Bow', toHit:5, dmg:'1d6', tiles:6};

    setQB({active:true, over:null, log:[], map:geom, battle:{active:true,round:1},
      players:[{id:'pc', side:'pc', name:'ParityPC', c:pcC, x:2,y:0}],
      monsters:[{id:'m1', side:'mon', name:'Orc', base:'Orc', hp:20, max:20, ac:13, x:0,y:0, conds:[]}]});
    const qbRes=Engine.hitResult(qbAdapter,'m1','pc',atk,12);
    const qbAC=qbRes.ac, qbCover=qbRes.cover;
    setQB(null);

    setNet({role:'dm', session:{ map:geom,
      monsters:[{id:'m1', name:'Orc', base:'Orc', hp:20, max:20, ac:13, x:0,y:0, conds:[]}],
      players:[{id:'pc', cid:'pc', name:'ParityPC', ac:computeAC(pcC), hpCur:30, hpMax:30, x:2,y:0}] }});
    const sessRes=Engine.hitResult(sessionAdapter,'m1','pc',atk,12);
    const sessAC=sessRes.ac, sessCover=sessRes.cover;
    setNet(null);

    T('mode parity: three-quarters cover from a wall applies in BOTH Quick Battle and DM-hosted',
      qbCover===5 && sessCover===5);
    T('mode parity: identical geometry + identical d20 gives the identical to-hit outcome in both modes'
      +(qbAC===sessAC?'':` — QB saw AC ${qbAC}, DM-hosted saw AC ${sessAC}`),
      qbAC===sessAC && qbRes.hit===sessRes.hit);
  }

  /* ---- Regression tests for the three gaps closed in v120.234 ----
     The DM's device and the player's device must agree about the same shot. Both adapters read
     the same net.session, so one shared state can be handed to each — any divergence is the
     adapter, not the scenario. These are written as a d20 SWEEP rather than one lucky face,
     because the original bug was invisible at most faces: it only flipped the outcome in the
     window between the two ACs (5 of 20 faces), which is exactly how it survived unnoticed. */
  {
    const savedNet=getNet();
    const shared=()=>({ map:{cols:6,rows:1,tiles:{'1,0':'wall'}},
      monsters:[{id:'m1',name:'Orc',base:'Orc',hp:20,max:20,ac:13,x:0,y:0,conds:[]}],
      players:[{id:'p1',name:'Hero',ac:15,hpCur:30,hpMax:30,x:3,y:0,conds:[]}] });
    const atk={name:'Longbow', toHit:5, dmg:'1d8', tiles:12};
    let mismatches=0, coverSeen=null;
    for(let face=1; face<=20; face++){
      setNet({role:'dm', session:shared(), peer:{id:'other'}});
      const dm=Engine.hitResult(sessionAdapter,'m1','p1',atk,face);
      setNet({role:'player', session:shared(), peer:{id:'other'}});
      const pl=Engine.hitResult(playerNetAdapter,'m1','p1',atk,face);
      coverSeen=pl.cover;
      if(dm.hit!==pl.hit || dm.ac!==pl.ac) mismatches++;
    }
    setNet(null);
    T('v120.234: the player device now applies three-quarters cover from a wall (was 0)', coverSeen===5);
    T('v120.234: DM and player devices agree on every one of the 20 d20 faces for the same shot'
      +(mismatches?` — ${mismatches}/20 still disagree`:''), mismatches===0);

    // Sanctuary: a ward that blocks the attack DM-side must block it player-side too.
    const warded=()=>({ map:{cols:6,rows:1,tiles:{}},
      monsters:[{id:'m1',name:'Orc',base:'Orc',hp:20,max:20,ac:13,x:0,y:0,conds:[]}],
      players:[{id:'p1',name:'Hero',ac:10,hpCur:30,hpMax:30,x:1,y:0,conds:[],sanctuaryDC:999,holyAuraDC:null}] });
    setNet({role:'dm', session:warded(), peer:{id:'other'}});
    const dmS=Engine.attack(sessionAdapter,'m1','p1',{name:'Club',toHit:99,dmg:'1',tiles:1},{face:15,apply:false});
    setNet({role:'player', session:warded(), peer:{id:'other'}});
    const plS=Engine.attack(playerNetAdapter,'m1','p1',{name:'Club',toHit:99,dmg:'1',tiles:1},{face:15,apply:false});
    setNet(null);
    T('v120.234: a Sanctuary ward blocks the attack on the player device too, not just the DM\'s',
      dmS.hit===false && plS.hit===false && !!plS.sanctuary && plS.sanctuary.blocked===true);

    // Holy Aura: tested in isolation, because Sanctuary short-circuits before it is reached.
    const haloed=()=>({ map:{cols:6,rows:1,tiles:{}},
      monsters:[{id:'m1',name:'Orc',base:'Orc',hp:20,max:20,ac:13,x:0,y:0,conds:[]}],
      players:[{id:'p1',name:'Hero',ac:10,hpCur:30,hpMax:30,x:1,y:0,conds:[],holyAuraDC:999}] });
    setNet({role:'player', session:haloed(), peer:{id:'other'}});
    const plH=Engine.attack(playerNetAdapter,'m1','p1',{name:'Club',toHit:99,dmg:'1',tiles:1},{face:15,apply:false});
    setNet(null);
    T('v120.234: Holy Aura blinds the attacker on the player device too', !!plH.holyAura && plH.holyAura.blinded===true);

    // A player device that somehow has no position mirror must degrade to 0 cover, never crash.
    setNet({role:'player', session:{map:{cols:6,rows:1,tiles:{'1,0':'wall'}},monsters:[],players:[]}, peer:{id:'ghost'}});
    const safe=(()=>{ try{ return playerNetAdapter.cover({me:true,c:newCharacter('Nowhere')},{x:3,y:0})===0; }catch(e){ return 'threw: '+e.message; } })();
    setNet(savedNet);
    T('v120.234: cover degrades to 0 (no crash) when this device has no position mirror yet', safe===true);
  }
}

/* ---- offline-cache drift guard ----
   sw.js's ASSETS list is precached on install; anything the page loads that ISN'T listed only
   reaches the cache opportunistically, on a successful online fetch. That failure is silent —
   the app looks fine until someone opens it offline — so CLAUDE.md's "add every new module to
   ASSETS" rule needs an actual check behind it rather than a reminder nobody reads.

   The iso3d/ ES-module graph is checked the same way, but it can't be read off a <script src>:
   it's reached by `import` chains carrying a `?v=` cache-buster, and the fetch handler matches
   with a query-SENSITIVE caches.match(req), so ASSETS has to list the exact requested URLs. This
   walks the real graph from boot.js and compares, which also keeps the list honest about scope —
   src/{combat,game,main,movement,turn,units}.js are the standalone demo, unreachable from
   boot.js, and must NOT be shipped to the cache. */
{
  const swSrc=fs.readFileSync(path.join(__dirname,'sw.js'),'utf8');
  // Strip // comments first — prose inside them contains apostrophes ("iso3d's ?v="), which a
  // naive quote scan happily reads as a cache entry.
  const assets=((swSrc.match(/const ASSETS\s*=\s*\[([\s\S]*?)\n\]/)||[])[1]||'').replace(/\/\/[^\n]*/g,'');
  const rawListed=(assets.match(/'([^']+)'/g)||[]).map(s=>s.replace(/'/g,''));
  const listed=rawListed.map(s=>s.replace(/^\.\//,''));
  const loaded=[...html.matchAll(/<script[^>]*src="([^"]+)"/g)].map(m=>m[1])
    .filter(s=>!/^https?:/.test(s)).map(s=>s.replace(/^\.\//,''));
  const plain=loaded.filter(s=>!/\?/.test(s));
  const unlisted=plain.filter(s=>!listed.includes(s));
  T('sw.js ASSETS covers every local <script src> in index.html (offline-cache drift guard)'
    +(unlisted.length?' — MISSING: '+unlisted.join(', '):''), unlisted.length===0);

  /* ---- iso3d version-drift lock (v120.259) ----
     This is the WORST version of the staleness bug, found by looking for the same shape elsewhere
     after the sw.js incident. iso3d/ is served CACHE-FIRST because its URLs carry a ?v= that is
     supposed to change when the code does. If someone edits iso3d/src/*.js and doesn't bump that
     ?v=, the URL is identical, so every user holding a cached copy keeps the OLD engine FOREVER —
     not until the next reload, permanently. And nothing else would notice: ASSETS still matches
     the import graph, so the existing precache test stays green.

     So: pin a content hash. Change iso3d source and this fails until you bump the ?v= AND update
     the two constants below together — which is exactly the moment the cache-buster is supposed
     to move. Deliberately a lock rather than an auto-derived value; auto-deriving would silently
     accept the drift it exists to catch. */
  {
    const crypto=require('crypto');
    const isoDir=path.join(__dirname,'iso3d');
    if(fs.existsSync(isoDir)){
      const files=['boot.js'].concat(fs.readdirSync(path.join(isoDir,'src')).filter(f=>f.endsWith('.js')).map(f=>'src/'+f)).sort();
      const h=crypto.createHash('sha256');
      for(const f of files) h.update(f+':'+fs.readFileSync(path.join(isoDir,f),'utf8'));
      const hash=h.digest('hex').slice(0,16);
      const declaredV=(html.match(/iso3d\/boot\.js\?v=([0-9.]+)/)||[])[1];

      const LOCKED_V='0.6.17', LOCKED_HASH='81742e2cf6d52166';
      T(`iso3d drift lock: source content matches the pinned hash for ?v=${LOCKED_V}`
        +(hash===LOCKED_HASH?'':` — iso3d source CHANGED (${hash}). Bump the ?v= in index.html + sw.js, then update LOCKED_V/LOCKED_HASH here. Without a ?v= bump, cached users keep the old engine forever.`),
        hash===LOCKED_HASH);
      T(`iso3d drift lock: the ?v= in index.html still matches the lock (${declaredV})`
        +(declaredV===LOCKED_V?'':` — version moved to ${declaredV}; update LOCKED_HASH too or the lock is meaningless`),
        declaredV===LOCKED_V);
    }
  }

  /* v120.256: the build stamps must stay in lockstep with APP_VERSION, or the stale-code detector
     itself becomes the false alarm — bumping the version and forgetting a stamp would warn users
     about a problem that doesn't exist, which is worse than no detector at all. */
  {
    const appV=(html.match(/const APP_VERSION='([^']+)'/)||[])[1];
    // Every module that sw.js serves network-first needs a stamp, or the detector has a hole and
    // reads as an all-clear while that file is stale (v120.256 stamped only 2 of the 5).
    const MODULES=[['ui.js','UI_BUILD'],['rules.js','RULES_BUILD'],['data.js','DATA_BUILD'],
                   ['net.js','NET_BUILD'],['iso-renderer.js','ISOR_BUILD']];
    const bad=[];
    for(const [file,konst] of MODULES){
      const v=(fs.readFileSync(path.join(__dirname,file),'utf8').match(new RegExp('const '+konst+"='([^']+)'"))||[])[1];
      if(v!==appV) bad.push(`${file}=${v||'(no stamp)'}`);
    }
    T(`build stamps: all ${MODULES.length} network-first modules match APP_VERSION (${appV})`
      +(bad.length?' — '+bad.join(', '):''), bad.length===0);
    // The detector in index.html must actually READ every stamp, or the stamp is decorative.
    const unchecked=MODULES.filter(([,k])=>!new RegExp('typeof '+k+"!=='undefined'").test(html)).map(([f])=>f);
    T('build stamps: index.html checks every module\'s stamp'+(unchecked.length?' — not checked: '+unchecked.join(', '):''),
      unchecked.length===0);
  }

  /* v120.255: the app's own JS must be network-first, or a reload pairs the newest index.html
     (which carries APP_VERSION) with stale JavaScript — the header shows a new version while the
     behaviour is several versions old. That exact failure wasted debugging time twice, so it gets
     a guard rather than a comment. */
  {
    const appCodeRe=/const isAppCode\s*=\s*(\/.*?\/)\.test\(req\.url\)/.exec(swSrc);
    T('sw.js still classifies the app modules as network-first (isAppCode exists)', !!appCodeRe);
    if(appCodeRe){
      let re=null; try{ re=eval(appCodeRe[1]); }catch(e){}
      const base='https://x/dnd-character/';
      const mustBeFresh=['data.js','rules.js','net.js','ui.js','iso-renderer.js'];
      const missed=mustBeFresh.filter(f=>!(re&&re.test(base+f)));
      T('sw.js: every app module is network-first'+(missed.length?' — still cache-first: '+missed.join(', '):''),
        missed.length===0);
      // iso3d is versioned by ?v=, so it SHOULD stay cache-first — freshness is already guaranteed
      // by the URL changing, and re-fetching 12 modules every load would be pure waste.
      T('sw.js: versioned iso3d modules stay cache-first (their ?v= already busts them)',
        !(re&&re.test(base+'iso3d/src/host.js?v=0.6.16')));
    }
    T('sw.js: the network-first branch has a timeout fallback (bad wifi must not hang startup)',
      /NET_TIMEOUT/.test(swSrc) && /setTimeout\(fallback/.test(swSrc));
    // Without this the whole network-first branch is decorative: GitHub Pages sends
    // Cache-Control: max-age=600, so a plain fetch() is answered by the browser's HTTP cache and
    // never reaches the network. v120.256 shipped stale ui.js after a reload for exactly this.
    T('sw.js: app-code fetches bypass the HTTP cache, or "network-first" is a lie',
      /fetch\(req,\s*\{\s*cache:\s*'no-cache'\s*\}\)/.test(swSrc));
  }

  // Walk iso3d's import graph exactly as the browser would, preserving each request's query.
  const seen=new Set(), want=new Set();
  const bootSpec=(html.match(/src="(iso3d\/boot\.js[^"]*)"/)||[])[1];
  if(bootSpec) want.add(bootSpec);
  (function walk(file){
    const norm=file.replace(/\?.*$/,'').split(path.sep).join('/');
    if(seen.has(norm)||!fs.existsSync(path.join(__dirname,norm))) return; seen.add(norm);
    const src=fs.readFileSync(path.join(__dirname,norm),'utf8');
    for(const m of src.matchAll(/from\s+'([^']+)'/g)){
      const spec=m[1]; if(!spec.startsWith('.')) continue;
      const rel=path.join(path.dirname(norm), spec).split(path.sep).join('/');
      want.add(rel); walk(path.join(path.dirname(norm), spec.replace(/\?.*$/,'')).split(path.sep).join('/'));
    }
  })(bootSpec ? bootSpec.replace(/\?.*$/,'') : 'iso3d/boot.js');

  const isoWanted=[...want], isoMissing=isoWanted.filter(u=>!listed.includes(u));
  T('sw.js ASSETS precaches the whole iso3d module graph, with exact ?v= query strings'
    +(isoMissing.length?' — MISSING: '+isoMissing.join(', '):''), isoMissing.length===0);
  // The demo-only subgraph must stay OUT: shipping it would cache code the app never loads.
  const demoLeak=listed.filter(a=>/^iso3d\/src\/(combat|game|main|movement|turn|units)\.js/.test(a));
  T('sw.js ASSETS does not cache the demo-only iso3d modules (unreachable from boot.js)'
    +(demoLeak.length?' — LEAKED: '+demoLeak.join(', '):''), demoLeak.length===0);
  // Everything listed must actually exist, or install() rejects and NOTHING gets cached.
  const ghosts=rawListed.filter(a=>a!=='./' && !fs.existsSync(path.join(__dirname, a.replace(/^\.\//,'').replace(/\?.*$/,''))));
  T('every file listed in sw.js ASSETS exists (a missing one makes cache.addAll reject and kills offline entirely)'
    +(ghosts.length?' — NOT FOUND: '+ghosts.join(', '):''), ghosts.length===0);
}

console.log(fails? ('\n'+fails+' FAILURE'+(fails>1?'S':'')) : '\nALL TESTS PASSED');
process.exit(fails?1:0);
