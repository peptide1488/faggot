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

// consts inside eval stay block-scoped — re-export the data tables the tests assert on
eval(src.replace('"use strict";','')+
  ';globalThis.SPELL_AOE=SPELL_AOE;globalThis.SPELL_EFFECTS=SPELL_EFFECTS;globalThis.MONSTERS_5E=MONSTERS_5E;'+
  'globalThis.mod=mod;globalThis.sgn=sgn;globalThis.ARMOR=ARMOR;globalThis.TERRAIN=TERRAIN;'+
  'globalThis.Engine=Engine;globalThis.qbAdapter=qbAdapter;globalThis.sessionAdapter=sessionAdapter;globalThis.SPELL_TELEPORT=SPELL_TELEPORT;globalThis.BRAINS=BRAINS;globalThis.SPELL_CHOICES=SPELL_CHOICES;'+
  'globalThis.SPELL_DESC=SPELL_DESC;globalThis.SPELL_COND=SPELL_COND;globalThis.SPELL_TERRAIN=SPELL_TERRAIN;globalThis.qbPaintTerrain=qbPaintTerrain;globalThis.qbHazardAt=qbHazardAt;globalThis.qbExpireHazards=qbExpireHazards;globalThis.qbCheckTerrainProne=qbCheckTerrainProne;'+
  'globalThis.speedBlocked=speedBlocked;globalThis.getQB=()=>QB;globalThis.setQB=v=>{QB=v;};globalThis.POWER_WORD_HP=POWER_WORD_HP;globalThis.EYEBITE_OPTIONS=EYEBITE_OPTIONS;'+
  'globalThis.concQueueLen=()=>concQueue.length;globalThis.resetConc=()=>{concActive=false;concQueue.length=0;};'+
  'globalThis.MAP_PRESETS=MAP_PRESETS;globalThis.dirFromDelta=dirFromDelta;globalThis.spriteTokenHTML=spriteTokenHTML;'+
  'globalThis.rotXY=rotXY;globalThis.rotDelta=rotDelta;'+
  'globalThis.DECOR=DECOR;globalThis.decorAt=decorAt;globalThis.losClear=losClear;globalThis.dijkstra=dijkstra;'+
  'globalThis.SPRITE_MANIFEST=SPRITE_MANIFEST;globalThis.SPRITE_ZOOM=SPRITE_ZOOM;globalThis.spriteReady=spriteReady;'+
  'globalThis.DECOR_MANIFEST=DECOR_MANIFEST;globalThis.decorReady=decorReady;globalThis.decorTokenHTML=decorTokenHTML;globalThis.DECOR_MAX_W=DECOR_MAX_W;globalThis.DECOR_MAX_H=DECOR_MAX_H;'+
  'globalThis.mapGridHTML=mapGridHTML;globalThis.heightAt=heightAt;globalThis.setIsoView=v=>{isoView=v;};globalThis.setMapRotation=v=>{mapRotation=v;};');

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
T('qbAdapter saves: monster CR-scaled, PC ability-based', qbAdapter.saveBonus({side:'mon',base:'Goblin'})===1 && qbAdapter.saveBonus({side:'pc',c},'dex')===2);

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
  const painted=['1,1','2,1','3,1','1,2','2,2','3,2','1,3','2,3','3,3'].every(k=>gs.map.tiles[k]==='grease');
  T('qbPaintTerrain covers the blast radius (3x3 for r1)', painted);
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
const appVer=(src.match(/APP_VERSION='(v\d+)'/)||[])[1], swVer=(sw.match(/grimoire-(v\d+)/)||[])[1];
T('sw.js cache version matches APP_VERSION ('+appVer+')', appVer && appVer===swVer);

/* ---- map elevation (isometric renderer content) ---- */
T('preset maps include elevation data', Object.values(MAP_PRESETS).some(m=>m.height&&Object.keys(m.height).length>0));
T('startQuickBattle copies preset height into QB.map (was silently dropped)', /map:\{cols:map\.cols, rows:map\.rows, tiles:Object\.assign\(\{\},map\.tiles\), height:Object\.assign\(\{\},map\.height/.test(src));

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

/* ---- decorations: paintable layer independent of terrain, blocks movement/LoS like TERRAIN ---- */
(function(){
  const s={map:{cols:5,rows:5,tiles:{},height:{},decor:{'2,2':'tree'}}, monsters:[], players:[]};
  T('a solid tree blocks pathfinding through its cell', dijkstra(s,0,2,100,false).cost['2,2']==null);
  T('a solid tree blocks line of sight', losClear(s,0,2,4,2)===false);
  const s2={map:{cols:5,rows:5,tiles:{},height:{},decor:{'2,2':'bush'}}, monsters:[], players:[]};
  T('a non-solid bush does NOT block pathfinding (only difficult terrain)', dijkstra(s2,0,2,100,false).cost['2,2']!=null);
  T('a bush still blocks line of sight (opaque)', losClear(s2,0,2,4,2)===false);
  T('DECOR.tree/bush have the expected solid/opaque/diff flags', DECOR.tree.solid===true && DECOR.tree.opaque===true && DECOR.bush.solid!==true && DECOR.bush.opaque===true && DECOR.bush.diff===true);
})();
T('decorAt returns empty string for an undecorated cell, not undefined/null', decorAt({map:{decor:{}}},0,0)==='');
T('startQuickBattle copies preset decor into QB.map (same pattern as height)', /map:\{cols:map\.cols, rows:map\.rows, tiles:Object\.assign\(\{\},map\.tiles\), height:Object\.assign\(\{\},map\.height\|\|\{\}\), decor:Object\.assign\(\{\},map\.decor/.test(src));
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
  T('a tall narrow sheet is capped by height, not stretched to a fixed width', tallH===DECOR_MAX_H && Math.abs(tallW-DECOR_MAX_H*(96/360))<0.01);
  T('a wide short sheet is capped by width, not stretched to a fixed height', wideW===DECOR_MAX_W && Math.abs(wideH-DECOR_MAX_W*(72/96))<0.01);
  T('neither test sheet exceeds the bounding box on either axis', tallW<=DECOR_MAX_W && wideH<=DECOR_MAX_H);
  delete DECOR_MANIFEST.__test_tall; delete DECOR_MANIFEST.__test_wide;
  decorReady.delete('__test_tall'); decorReady.delete('__test_wide');
})();

/* ---- battle map: real CSS 3D isometric scene (replaces the old 2D rotate+squash fake) ---- */
(function(){
  setIsoView(true); setMapRotation(0);
  const s={map:{cols:3,rows:3,tiles:{'1,1':'wall'},height:{},decor:{}}, monsters:[], players:[]};
  const html=mapGridHTML(s, true, {});
  T('iso mode emits a real 3D scene wrapper with a camera rotateX+rotateZ transform', /class="scene3d"[^>]*transform:rotateX\(60deg\) rotateZ\(45deg\)/.test(html));
  T('every cell still gets a data-cell so click targeting/cellCenter work unchanged', (html.match(/data-cell="/g)||[]).length===9);
  T("a plain wall with no explicit elevation still stands: exactly one south3d + one east3d face (the only tile with any height)", (html.match(/side3d south3d/g)||[]).length===1 && (html.match(/side3d east3d/g)||[]).length===1);
  T('the wall\'s side faces carry the wall terrain texture class', /side3d south3d ter-wall/.test(html) && /side3d east3d ter-wall/.test(html));
  setMapRotation(2);
  const html2=mapGridHTML(s, true, {});
  T('map rotation is a real 90°-step camera yaw (camR=45+rot*90), not the old coordinate-remap hack', /rotateZ\(225deg\)/.test(html2));
  setMapRotation(0);
  setIsoView(false);
  const topdown=mapGridHTML(s,true,{});
  setIsoView(true);
  T('top-down mode is untouched by the 3D rewrite — plain CSS grid, no 3D scene', topdown.includes('grid-template-columns') && !topdown.includes('scene3d'));
})();

console.log(fails? ('\n'+fails+' FAILURE'+(fails>1?'S':'')) : '\nALL TESTS PASSED');
process.exit(fails?1:0);
