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
  'globalThis.mod=mod;globalThis.sgn=sgn;globalThis.ARMOR=ARMOR;globalThis.TERRAIN=TERRAIN;');

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

/* ---- version hygiene: sw.js cache must match APP_VERSION ---- */
const sw=fs.readFileSync(path.join(__dirname,'sw.js'),'utf8');
const appVer=(src.match(/APP_VERSION='(v\d+)'/)||[])[1], swVer=(sw.match(/grimoire-(v\d+)/)||[])[1];
T('sw.js cache version matches APP_VERSION ('+appVer+')', appVer && appVer===swVer);

console.log(fails? ('\n'+fails+' FAILURE'+(fails>1?'S':'')) : '\nALL TESTS PASSED');
process.exit(fails?1:0);
