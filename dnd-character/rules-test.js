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
  'globalThis.Engine=Engine;globalThis.qbAdapter=qbAdapter;globalThis.SPELL_TELEPORT=SPELL_TELEPORT;');

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

/* ---- version hygiene: sw.js cache must match APP_VERSION ---- */
const sw=fs.readFileSync(path.join(__dirname,'sw.js'),'utf8');
const appVer=(src.match(/APP_VERSION='(v\d+)'/)||[])[1], swVer=(sw.match(/grimoire-(v\d+)/)||[])[1];
T('sw.js cache version matches APP_VERSION ('+appVer+')', appVer && appVer===swVer);

console.log(fails? ('\n'+fails+' FAILURE'+(fails>1?'S':'')) : '\nALL TESTS PASSED');
process.exit(fails?1:0);
