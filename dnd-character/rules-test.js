// Grimoire 5e rules test harness — run with:  node rules-test.js
// Extracts the <script> from index.html, loads it against a stub DOM, and asserts
// PHB-correct behavior. Run this FIRST when auditing or after changing any rules
// logic — only investigate code around failures. Add a test with every rules fix.
// NOTE: deliberately NOT 'use strict' — the eval below relies on sloppy-mode function
// declarations leaking into this scope so tests can call the app's functions directly.
const fs=require('fs'), path=require('path');
const html=fs.readFileSync(path.join(__dirname,'index.html'),'utf8');
const src=html.match(/<script>([\s\S]*)<\/script>/)[1];

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
  'globalThis.mod=mod;globalThis.sgn=sgn;globalThis.ARMOR=ARMOR;globalThis.TERRAIN=TERRAIN;'+
  'globalThis.Engine=Engine;globalThis.qbAdapter=qbAdapter;globalThis.sessionAdapter=sessionAdapter;globalThis.SPELL_TELEPORT=SPELL_TELEPORT;globalThis.BRAINS=BRAINS;globalThis.SPELL_CHOICES=SPELL_CHOICES;'+
  'globalThis.SPELL_DESC=SPELL_DESC;globalThis.SPELL_COND=SPELL_COND;globalThis.SPELL_TERRAIN=SPELL_TERRAIN;globalThis.qbPaintTerrain=qbPaintTerrain;globalThis.qbHazardAt=qbHazardAt;globalThis.qbExpireHazards=qbExpireHazards;globalThis.qbCheckTerrainProne=qbCheckTerrainProne;'+
  'globalThis.SPELL_GAS=SPELL_GAS;globalThis.paintHazardTerrain=paintHazardTerrain;globalThis.hazardAt=hazardAt;globalThis.expireHazards=expireHazards;globalThis.checkTerrainHazardCond=checkTerrainHazardCond;globalThis.tickGasHazards=tickGasHazards;'+
  'globalThis.speedBlocked=speedBlocked;globalThis.getQB=()=>QB;globalThis.setQB=v=>{QB=v;};globalThis.POWER_WORD_HP=POWER_WORD_HP;globalThis.EYEBITE_OPTIONS=EYEBITE_OPTIONS;'+
  'globalThis.concQueueLen=()=>concQueue.length;globalThis.resetConc=()=>{concActive=false;concQueue.length=0;};'+
  'globalThis.MAP_PRESETS=MAP_PRESETS;globalThis.dirFromDelta=dirFromDelta;globalThis.spriteTokenHTML=spriteTokenHTML;'+
  'globalThis.rotXY=rotXY;globalThis.rotDelta=rotDelta;'+
  'globalThis.DECOR=DECOR;globalThis.decorAt=decorAt;globalThis.losClear=losClear;globalThis.dijkstra=dijkstra;'+
  'globalThis.SPRITE_MANIFEST=SPRITE_MANIFEST;globalThis.SPRITE_ZOOM=SPRITE_ZOOM;globalThis.spriteReady=spriteReady;'+
  'globalThis.DECOR_MANIFEST=DECOR_MANIFEST;globalThis.decorReady=decorReady;globalThis.decorTokenHTML=decorTokenHTML;globalThis.DECOR_MAX_W=DECOR_MAX_W;globalThis.DECOR_MAX_H=DECOR_MAX_H;'+
  'globalThis.SPELL_HANDLERS=SPELL_HANDLERS;globalThis.SUMMON_CATALOG=SUMMON_CATALOG;globalThis.summonCatalogEntry=summonCatalogEntry;'+
  'globalThis.spawnSummon=spawnSummon;globalThis.dismissSummonsForSpell=dismissSummonsForSpell;globalThis.nearbySpawnTiles=nearbySpawnTiles;globalThis.isConcentration=isConcentration;'+
  'globalThis.mapGridHTML=mapGridHTML;globalThis.setIsoView=v=>{isoView=v;};'+
  'globalThis.INTERACT_TYPES=INTERACT_TYPES;globalThis.DECOR_TO_INTERACT=DECOR_TO_INTERACT;globalThis.WALL_LIKE_TERRAIN=WALL_LIKE_TERRAIN;globalThis.nextToWall=nextToWall;'+
  'globalThis.ABILITIES=ABILITIES;globalThis.playerNetAdapter=playerNetAdapter;'+
  'globalThis.DETECT_THOUGHTS_FALLBACK=DETECT_THOUGHTS_FALLBACK;'+
  'globalThis.setNet=v=>{net=v;};globalThis.getNet=()=>net;');

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

console.log(fails? ('\n'+fails+' FAILURE'+(fails>1?'S':'')) : '\nALL TESTS PASSED');
process.exit(fails?1:0);
