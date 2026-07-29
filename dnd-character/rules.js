// Grimoire — extracted rules/mechanics functions (Stage 2 of index.html modularization).
// Character math, combat resolution, spellcasting, grid/movement math, monster AI — no DOM
// or network code by heuristic. See AUDIT.md. Loaded via <script src> after data.js, before
// net.js/ui.js/the main script.

function attackAdvantage(aC, tC, melee, opts){
  const A=n=>!!(aC&&aC.has(n)), T=n=>!!(tC&&tC.has(n));
  let adv=0; const why=[];
  if(A('Poisoned')){ adv--; why.push('you are poisoned'); }
  if(A('Prone')){ adv--; why.push('you are prone'); }
  if(A('Restrained')){ adv--; why.push('you are restrained'); }
  if(A('Blinded')){ adv--; why.push('you are blinded'); }
  if(A('Frightened')){ adv--; why.push('you are frightened'); }
  if(A('Invisible')){ adv++; why.push('you are invisible'); }
  if(A('Hidden')){ adv++; why.push('attacking from hiding'); }
  // Attacking an invisible target is disadvantage (PHB) — unless the attacker can actually
  // see it (See Invisibility/True Seeing, threaded in via opts.seesInvisible). This was
  // previously missing entirely: only the invisible creature's OWN advantage (line above)
  // was modeled, not the reciprocal disadvantage on whoever's attacking it.
  if(T('Invisible') && !(opts&&opts.seesInvisible)){ adv--; why.push('target is invisible'); }
  ['Restrained','Blinded','Paralyzed','Stunned','Unconscious','Petrified'].forEach(cn=>{ if(T(cn)){ adv++; why.push('target '+cn.toLowerCase()); } });
  if(T('Prone')){ adv+=melee?1:-1; why.push('target prone'+(melee?'':' (ranged)')); }
  if(T('Faerie Fire')){ adv++; why.push('target outlined by faerie fire'); }
  if(T('Dodge')){ adv--; why.push('target is dodging'); }   // Dodge action / Patient Defense — attack rolls against them have disadvantage
  if(T('Guided')){ adv++; why.push('target guided (Guiding Bolt)'); }
  // Distracting Strike (Battle Master maneuver): target is Distracted — the next attack against
  // it has advantage. This app's conditions are duration-based (not "consumed on first use"),
  // same simplification every other timed condition here already gets — grants advantage for
  // the condition's whole duration rather than exactly one attack.
  if(T('Distracting Strike')){ adv++; why.push('target distracted (Distracting Strike)'); }
  // Help action (PHB): an ally aided your attack against this creature — advantage. Same
  // duration-based simplification as Distracting Strike above (grants advantage for the
  // condition's whole ~1-round life rather than being consumed by exactly one attack).
  if(T('Helped')){ adv++; why.push('an ally aided your attack (Help action)'); }
  if(A('True Strike')){ adv++; why.push('true strike'); }
  // Lighting: attacker in darkness without vision → disadvantage; target unseen in dark → adv for attacker if they can see (simplified)
  if(opts&&opts.armorDisadvantage){ adv--; why.push('not proficient with worn armor'); }
  if(opts&&opts.grapplerAdv){ adv++; why.push('you have grappled the target (Grappler)'); }
  // Goading Attack (Battle Master maneuver): the goaded creature has disadvantage on attacks
  // against anyone OTHER than whoever goaded it.
  if(opts&&opts.goadedDisadv){ adv--; why.push('goaded — must focus the one who goaded you'); }
  if(opts&&opts.mountedAdv){ adv++; why.push('mounted (Mounted Combatant)'); }
  if(opts&&opts.attackerVision!=null){
    if(opts.attackerVision===0){ adv--; why.push('fighting in darkness'); }
  }
  if(opts&&opts.targetVision!=null&&opts.attackerVision!=null){
    // Target is effectively unseen if attacker's vision of target tile is darkness
    if(opts.attackerSeesTarget===0&&opts.attackerVision>0){ /* rare */ }
    if(opts.seeTarget===0){ adv--; why.push('can\'t see target (dark)'); }
  }
  return {adv:Math.sign(adv), autoCrit: melee&&(T('Paralyzed')||T('Unconscious')), why};
}

function unitConds(u){
  if(!u) return new Set();
  if(u.c||u.me){ const ch=u.c||playerChar(); return new Set(Object.keys((ch&&ch.conditions)||{})); }
  if(Array.isArray(u.conds)) return new Set(u.conds.map(x=>x&&x.name?x.name:x));
  if(u.conditions) return new Set(Object.keys(u.conditions));
  return new Set();
}

function hasSeesInvisible(u){
  const c=u&&(u.c||(u.me&&typeof playerChar==='function'&&playerChar()));
  return !!(c&&(c.effects||[]).some(e=>e.mods&&e.mods.seesInvisible));
}

function speedBlocked(u){ const s=unitConds(u); return s.has('Restrained')||s.has('Grappled'); }

function grantsL1Feat(c){ return !!RACE_L1_FEAT[c.race]; }

function bgInfo(name){ const b=BG_INFO[name]; if(!b){ showInfo(name||'Background','Background','Custom background — note its skills & feature in Notes.'); return; }
  showInfo(name,'Background','<b>Skills:</b> '+b.s+'.<br><b>Feature:</b> '+esc(b.f)); }

function pixelArt(grid, px){
  px=px||6; const w=grid[0].length, h=grid.length; let r='';
  for(let y=0;y<h;y++){ const row=grid[y]; for(let X=0;X<w;X++){ const col=PIX_PAL[row[X]]; if(col) r+=`<rect x="${X}" y="${y}" width="1.05" height="1.05" fill="${col}"/>`; } }
  return `<svg class="pix" viewBox="0 0 ${w} ${h}" width="${w*px}" height="${h*px}" shape-rendering="crispEdges" aria-hidden="true">${r}</svg>`;
}

function classEmblem(cls, px){ const g=CLASS_PIX[cls]; return g?`<span class="emblem">${pixelArt(g,px)}</span>`:''; }

function raceEmblem(race, px){ const g=RACE_PIX[race]||RACE_PIX._default; return `<span class="emblem">${pixelArt(g,px)}</span>`; }

function itemSprite(key){ return ITEM_PIX[key] || (key==='sword'&&CLASS_PIX.Fighter) || (key==='dagger'&&CLASS_PIX.Rogue) || (key==='axe'&&CLASS_PIX.Barbarian) || (key==='bow'&&CLASS_PIX.Ranger) || (key==='shield'&&CLASS_PIX.Paladin) || (key==='mace'&&CLASS_PIX.Cleric) || (key==='staff'&&CLASS_PIX.Wizard) || ITEM_PIX.gear; }

function itemEmblem(key, px){ return `<span class="emblem">${pixelArt(itemSprite(key), px||6)}</span>`; }

function weaponIconKey(name){ const n=(name||'').toLowerCase();
  if(/dagger/.test(n)) return 'dagger'; if(/axe/.test(n)) return 'axe';
  if(/bow|sling/.test(n)) return 'bow'; if(/staff|quarterstaff/.test(n)) return 'staff';
  if(/spear|pike|glaive|trident|halberd|lance/.test(n)) return 'spear';
  if(/hammer|maul|club|mace|morningstar|flail/.test(n)) return 'mace';
  if(/sword|scimitar|rapier|blade/.test(n)) return 'sword';
  return 'sword'; }

function itemIconKey(it){ if(!it) return 'gear';
  if(it.kind==='armor') return 'armor'; if(it.kind==='shield') return 'shield';
  if(it.kind==='weapon') return weaponIconKey(it.name);
  const n=(it.name||'').toLowerCase();
  if(/potion|elixir|oil|flask/.test(n)) return 'potion'; if(/ring/.test(n)) return 'ring';
  if(/helm|hat|circlet|crown|cap/.test(n)) return 'helm'; if(/wand|rod|staff/.test(n)) return 'staff';
  return 'gear'; }

function weaponByName(n){ return WEAPONS.find(w=>w.n===n); }

function totalCoins(c){ const q=c.currency||{}; return (q.cp||0)+(q.sp||0)+(q.ep||0)+(q.gp||0)+(q.pp||0); }

function grantStartingGold(c){ if(totalCoins(c)===0) c.currency.gp=CLASS_GOLD[c.cls]||60; }

function addGearItem(c, name){ const ex=(c.items||[]).find(it=>it.name===name && (it.kind==='gear'||!it.kind)); if(ex) ex.qty=(ex.qty||1)+1; else c.items.push({name, qty:1, kind:'gear'}); }

function hasHealersKit(c){ return (c.items||[]).some(it=>it.name==="Healer's Kit" && (it.qty||1)>0); }

function addEssentials(c){ ESSENTIALS.forEach(([n,q])=>{ for(let k=0;k<q;k++) addGearItem(c,n); }); }

function forgeEquip(c){ const g=FORGE_GEAR[c.cls]; if(!g) return;
  if(g.w) c.items.push({name:g.w,kind:'weapon',qty:1,equipped:true});
  if(g.w2) c.items.push({name:g.w2,kind:'weapon',qty:1,equipped:true});
  if(g.a){ const a=armorDef(g.a); c.items.push({name:a.name,kind:'armor',armorKey:g.a,qty:1,equipped:true}); c.armor=g.a; c.acOverride=''; }
  if(g.shield){ c.items.push({name:'Shield',kind:'shield',qty:1,equipped:true}); c.shield=true; }
}

function buyEquip(c, spec){
  const [t,key]=spec.split('|'); let cost=0, add=null;
  if(t==='w'){ cost=WEAPON_COST[key]||0; add=()=>c.items.push({name:key,kind:'weapon',qty:1,equipped:false}); }
  else if(t==='a'){ cost=ARMOR_COST[key]||0; const a=armorDef(key); add=()=>c.items.push({name:a.name,kind:'armor',armorKey:key,qty:1,equipped:false}); }
  else if(t==='s'){ cost=10; add=()=>c.items.push({name:'Shield',kind:'shield',qty:1,equipped:false}); }
  else if(t==='g'){ const g=ADV_GEAR.find(x=>x.n===key); cost=g?g.cost:0; add=()=>addGearItem(c,key); }
  if((c.currency.gp||0) < cost){ flashBanner('Not enough gold ('+cost+' gp)'); return; }
  c.currency.gp=(c.currency.gp||0)-cost; add(); logChange(c,'Bought '+key+' ('+cost+' gp)'); save(); openShop(c);
}

function weaponProficient(c,w){
  if(!w) return true;
  if(c.weaponMasterProfs && c.weaponMasterProfs.includes(w.n)) return true;   // Weapon Master feat
  const cls=c.cls;
  if(WEAP_PROF_FULL.includes(cls)) return true;
  if(cls==='Wizard'||cls==='Sorcerer') return WIZ_SORC_OK.includes(w.n);
  if(cls==='Other'||!cls) return true;                                     // homebrew — don't penalise
  if(w.cat==='Simple') return true;                                        // Cleric/Druid/Monk/Warlock/Artificer/Bard/Rogue have all simple
  const ex=WEAP_MARTIAL_EXTRA[cls]; return !!(ex && ex.includes(w.n));
}

function weaponToHit(c,w,it){ it=it||(w&&w._it); const ab=weaponAbil(c,w); let b=mod(abil(c,ab)) + (weaponProficient(c,w)?profBonus(c):0);
  if(c.fightingStyle==='Archery' && w.type==='ranged') b+=2;                          // Archery style: +2 ranged attack rolls
  // Channel Divinity: Sacred Weapon (Devotion 3rd) — +Cha mod (min +1) to attack rolls with
  // the imbued weapon for 1 minute. Self-contained here rather than a generic effect-mods.atk
  // field, since this is the only feature in the app that needs one right now.
  if((c.effects||[]).some(e=>e.name==='Sacred Weapon')) b+=Math.max(1,mod(abil(c,'cha')));
  return b+((it&&it.magicBonus)||0); }

function weaponDmgBonus(c,w,it){ it=it||(w&&w._it); const ab=weaponAbil(c,w); let b=mod(abil(c,ab)); if(isRaging(c)&&w.type==='melee'&&ab==='str') b+=rageDamage(c);
  if(c.fightingStyle==='Dueling' && w.type==='melee' && !/two-handed/.test(w.props||'')) b+=2;   // Dueling: +2 dmg, one-handed melee
  return b+((it&&it.magicBonus)||0); }

function offhandWeapons(c){ return weaponItems(c).map(({it})=>{ const w=weaponByName(it.name); return w&&Object.assign({},w,{_it:it}); }).filter(w=>w&&w.type==='melee'&&(/light/.test(w.props||'')||(hasFeat(c,'Dual Wielder')&&!/(two-handed|heavy)/i.test(w.props||'')))); }

function canOffhand(c){ return offhandWeapons(c).length>=2; }

function offhandDmgBonus(c,w){ const ab=weaponAbil(c,w); const m=mod(abil(c,ab)); let b=(c.fightingStyle==='Two-Weapon Fighting')?m:Math.min(0,m); if(isRaging(c)&&w.type==='melee'&&ab==='str') b+=rageDamage(c); return b+((w._it&&w._it.magicBonus)||0); }

function offhandAtk(c,w){ const b=offhandDmgBonus(c,w); return {name:w.n+(w._it&&w._it.magicBonus?' +'+w._it.magicBonus:'')+' (off-hand)', toHit:weaponToHit(c,w), dmg:w.dmg+(b?sgn(b):''), dt:w.dt||'', vers:'', offhand:true}; }

function isConcentration(name){ return CONC_SPELLS.has((name||'').toLowerCase()); }

function extraAttacks(c){ const l=myLevel(c); const cls=c.cls;
  if(cls==='Fighter') return l>=20?3:l>=11?2:l>=5?1:0;
  if(['Barbarian','Paladin','Ranger','Monk'].includes(cls)) return l>=5?1:0;
  return 0; }

function hasActionSurge(c){ return c && c.cls==='Fighter' && myLevel(c)>=2; }

function isEchoKnight(c,lvl){ return !!(c && c.cls==='Fighter' && c.subclass==='Echo Knight' && myLevel(c)>=(lvl||3)); }

function isBerserker(c,lvl){ return !!(c && c.cls==='Barbarian' && c.subclass==='Path of the Berserker' && myLevel(c)>=(lvl||3)); }

function isLoreBard(c,lvl){ return !!(c && c.cls==='Bard' && c.subclass==='College of Lore' && myLevel(c)>=(lvl||3)); }

function isLifeCleric(c,lvl){ return !!(c && c.cls==='Cleric' && c.subclass==='Life' && myLevel(c)>=(lvl||1)); }

function isBattleMaster(c,lvl){ return !!(c && c.cls==='Fighter' && c.subclass==='Battle Master' && myLevel(c)>=(lvl||3)); }

function superiorityDieSize(c){ const l=myLevel(c); return isBattleMaster(c) ? (l>=18?12:l>=10?10:8) : 6; }

function superiorityDiceMax(c){
  let n=0;
  if(isBattleMaster(c)){ const l=myLevel(c); n+=l>=15?6:l>=7?5:4; }
  if(hasFeat(c,'Martial Adept')) n+=1;
  return n;
}

function channelDivinityMax(c){ const l=myLevel(c); return l>=18?3:l>=6?2:1; }

function preserveLifePool(c){ return 5*myLevel(c); }

function preserveLifeAmount(pool, hpMax, healedSoFar){ return Math.max(0, Math.min(pool, Math.floor(hpMax/2)-(healedSoFar||0))); }

function inspiringLeaderAmount(c){ return Math.max(0, (Number(c.level)||1) + mod(abil(c,'cha'))); }

function isMoonDruid(c,lvl){ return !!(c && c.cls==='Druid' && c.subclass==='Circle of the Moon' && myLevel(c)>=(lvl||2)); }

function moonMaxCR(c){ const l=myLevel(c); return l>=6 ? Math.floor(l/3) : 1; }

function wildShapeMax(c){ return 2; }

function martialArtsDie(c){ const l=myLevel(c); return l>=17?10:l>=11?8:l>=5?6:4; }

function isOpenHandMonk(c,lvl){ return !!(c && c.cls==='Monk' && c.subclass==='Open Hand' && myLevel(c)>=(lvl||3)); }

function kiDC(c){ return 8+profBonus(c)+mod(abil(c,'wis')); }

function kiMax(c){ return myLevel(c); }

function isDevotionPaladin(c,lvl){ return !!(c && c.cls==='Paladin' && c.subclass==='Devotion' && myLevel(c)>=(lvl||3)); }

function divineSenseMax(c){ return Math.max(1, 1+mod(abil(c,'cha'))); }   // long rest only (PHB)

function layOnHandsMax(c){ return 5*myLevel(c); }               // long rest only (PHB)

function paladinCDMax(c){ return 1; }

function monsterIsUndead(mo){ return ['skeleton','zombie','ghost'].includes(mo&&mo.sprite); }

function monsterIsFiend(mo){ return mo&&mo.sprite==='demon'; }

function isHunter(c,lvl){ return !!(c && c.cls==='Ranger' && c.subclass==='Hunter' && myLevel(c)>=(lvl||3)); }

function isAssassin(c,lvl){ return !!(c && c.cls==='Rogue' && c.subclass==='Assassin' && myLevel(c)>=(lvl||3)); }

function isDraconicSorcerer(c,lvl){ return !!(c && c.cls==='Sorcerer' && c.subclass==='Draconic Bloodline' && myLevel(c)>=(lvl||1)); }

function isFiendWarlock(c,lvl){ return !!(c && c.cls==='Warlock' && c.subclass==='The Fiend' && myLevel(c)>=(lvl||1)); }

function hasEvasion(c){ return !!(c && ((c.cls==='Rogue' && myLevel(c)>=7) || c.hunterSuperiorDefense==='Evasion')); }

function hasUncannyDodge(c){ return !!(c && ((c.cls==='Rogue' && myLevel(c)>=5) || c.hunterSuperiorDefense==='Uncanny Dodge')); }

function isEvocationWizard(c,lvl){ return !!(c && c.cls==='Wizard' && c.subclass==='Evocation' && myLevel(c)>=(lvl||2)); }

function overchannelBacklashDice(c){ return 1+(Number(c.overchannelUses)||0); }

function hasNotActedYet(s, unitId){ if(!s.order||!s.order.length||(s.battle&&s.battle.round)>1) return false; const idx=s.order.findIndex(o=>o.id===unitId); return idx>(s.turn||0); }

function bardicInspMax(c){ return Math.max(1, mod(abil(c,'cha'))); }

function bardicInspDie(c){ const l=myLevel(c); return l>=15?12:l>=10?10:l>=5?8:6; }

function mindlessRageBlocks(c, cond){ return !!(c && isRaging(c) && isBerserker(c,6) && (cond==='Charmed'||cond==='Frightened')); }

function auraOfDevotionBlocks(c, cond){ return !!(c && isDevotionPaladin(c,7) && cond==='Charmed' && (c.hp.cur>0) && !(c.conditions&&c.conditions.Unconscious)); }

function echoResourceMax(c){ return Math.max(1, mod(abil(c,'con'))); }

function actionsPerTurn(c){ let n=1 + (Number(c&&c.extraActions)||0);
  // Haste grants one extra action each turn (PHB: limited to Attack (one attack), Dash,
  // Disengage, Hide, or Use an Object — honor that limit at the table).
  if(c && (c.effects||[]).some(e=>e.name==='Haste')) n+=1;
  return Math.max(1,n); }

function actionsLeft(c){ const b=c&&c.battle; if(!b) return 1;
  const max=(b.actionsMax!=null?b.actionsMax:actionsPerTurn(c));
  const used=(b.actionsUsed!=null?b.actionsUsed:(b.action?1:0));   // legacy boolean fallback
  return Math.max(0, max-used); }

function hasAction(c){ return actionsLeft(c)>0; }

function spendAction(c){ const b=c&&c.battle; if(!b) return;
  const max=(b.actionsMax!=null?b.actionsMax:actionsPerTurn(c));
  const used=(b.actionsUsed!=null?b.actionsUsed:(b.action?1:0));
  b.actionsMax=max; b.actionsUsed=Math.min(max,used+1); b.action=b.actionsUsed>=max; }

function gearBonus(c,key){ let n=0; (c.items||[]).forEach(it=>{ if(it.equipped&&(!it.requiresAttunement||it.attuned)&&it.mods&&it.mods[key]) n+=Number(it.mods[key])||0; }); return n; }

function attunedCount(c){ return (c.items||[]).filter(it=>it.attuned).length; }

function toggleAttune(c, idx){
  const it=c.items[idx]; if(!it || !it.requiresAttunement) return false;
  if(!it.attuned){
    if(!it.equipped){ flashBanner('Equip it first to attune'); return false; }
    if(attunedCount(c)>=3){ flashBanner('Already attuned to 3 items (the max)'); return false; }
    it.attuned=true;
  } else it.attuned=false;
  logChange(c, (it.attuned?'Attuned to ':'Ended attunement with ')+it.name+' ('+attunedCount(c)+'/3)');
  save();
  return true;
}

function magicItemTargetKind(m){ if(m.weaponBonus) return 'weapon'; if(/Armor$/.test(m.name)) return 'armor'; if(/Shield$/.test(m.name)) return 'shield'; return null; }

function enchantWeapon(c, itemIdx, bonus){ const it=c.items[itemIdx]; if(!it||it.kind!=='weapon') return false; it.magicBonus=bonus; save(); return true; }

function enchantArmorLike(c, itemIdx, acBonus){ const it=c.items[itemIdx]; if(!it||(it.kind!=='armor'&&it.kind!=='shield')) return false; it.mods=Object.assign({}, it.mods, {ac:((it.mods&&it.mods.ac)||0)+(acBonus||0)}); save(); return true; }

// Consumables (a drinkable potion, a one-shot keg) go in the Inventory list (kind:'gear'),
// same as any other consumable item — not Equipment, which implies something worn/carried
// permanently. Everything else (Cloak of Protection, Decanter — reusable, not used up) is
// 'wondrous', matching the existing convention.
function addWondrousItem(c, m){ if(!m || magicItemTargetKind(m)) return false;
  const consumable=!!m.potionHeal || m.special==='keg';   // one-shot items: potions and the keg (thrown/detonated, then gone) — the Decanter is reusable, stays 'wondrous'
  c.items.push({name:m.name, kind:consumable?'gear':'wondrous', qty:1, equipped:false, requiresAttunement:!!m.requiresAttunement, mods:Object.assign({},m.mods), notes:m.desc, potionHeal:m.potionHeal, special:m.special});
  save(); return true; }

function equippedWeapons(c){ const out=[]; (c.items||[]).forEach((it,i)=>{ if(it.kind==='weapon'&&it.equipped) out.push({it,i}); }); return out; }

function weaponItems(c){ const out=[]; (c.items||[]).forEach((it,i)=>{ if(it.kind==='weapon') out.push({it,i}); }); return out; }

function weaponAbil(c,w){ if(w.type==='ranged') return 'dex'; if(/finesse/.test(w.props||'')) return mod(abil(c,'dex'))>=mod(abil(c,'str'))?'dex':'str'; return 'str'; }

function freshTurnState(c,opts){ return {action:false, bonus:false, reaction:false, actionsMax:actionsPerTurn(c), actionsUsed:0, surged:false, sneakUsed:false, savageUsed:false, divineStrikeUsed:false, colossusSlayerUsed:false, hordeBreakerUsed:false, castBonusSpell:false, castLeveledSpell:false, dashed:false, disengaged:false, readied:false, attacksLeft:extraAttacks(c)+1, move:speedBlocked(c)?0:effSpeed(c,opts), moveUsed:0}; }

function resetTurnState(c,opts){ Object.assign(c.battle, freshTurnState(c,opts)); c.absorbResist=null; }   // Absorb Elements resistance lasts "until the start of your next turn" (RAW) — expire it here. The +1d6 melee rider (c.absorbRider) intentionally survives into this turn and is consumed on the first melee hit (applyAttackRiders); if never used it lingers, a minor documented simplification.

function battleCard(c){
  if(!c.battle) return `<div class="card"><button class="btn block" id="startBattle">⚔ Enter Battle Mode</button>
    <p class="muted" style="font-size:11.5px;text-align:center;margin:8px 0 0">Rolls initiative and tracks your turn: actions, attacks left, movement and round count.</p></div>`;
  const b=c.battle, atk=extraAttacks(c)+1;
  return `<div class="card" style="border:2px solid var(--accent);box-shadow:0 0 0 3px rgba(77,106,44,.12)">
    <div class="row between"><h2 style="margin:0;color:var(--accent2)">⚔ Battle Mode</h2><button class="btn ghost sm" id="endBattle" style="color:var(--bad)">✖ End</button></div>
    <div class="listrow" style="margin-top:8px;border:0">
      <div class="nm" style="font-weight:600">Round counter</div>
      <div class="stepper">
        <button data-bt="roundDown" ${b.round<=1?'disabled':''}>−</button>
        <div class="val" style="min-width:64px;font-family:Georgia,serif;font-size:22px;font-weight:700;color:var(--accent)">${b.round}</div>
        <button data-bt="roundUp">＋</button>
      </div>
    </div>
    <div class="tiles" style="margin-top:8px">
      <div class="tile"><div class="lab">Initiative</div><div class="big">${b.init}</div></div>
      <div class="tile"><div class="lab">Attacks left</div><div class="big">${b.attacksLeft}/${atk}</div></div>
      <div class="tile"><div class="lab">Move left${b.moveUsed?' · used '+b.moveUsed:''}</div><div class="big">${b.move}</div></div>
    </div>
    ${c.wildShape?`<p class="muted" style="font-size:12px;margin:8px 0 0">🐾 Wild Shape: <b>${esc(c.wildShape.name)}</b> — AC ${c.wildShape.ac}. Your own HP/AC are hidden until you revert.</p>`:''}
    <div class="hp" style="margin-top:10px">
      <div class="tile" style="${(c.wildShape?c.wildShape.hpCur:c.hp.cur)<=0?'box-shadow:inset 0 0 0 1px var(--bad)':''}"><div class="lab">HP${(c.wildShape?c.wildShape.hpCur:c.hp.cur)<=0?' · DOWN':''}</div><div class="big" style="color:${(c.wildShape?c.wildShape.hpCur:c.hp.cur)<=0?'var(--bad)':'var(--good)'}">${c.wildShape?c.wildShape.hpCur:c.hp.cur}</div></div>
      <div class="tile"><div class="lab">Max</div><div class="big">${c.wildShape?c.wildShape.hpMax:c.hp.max}</div></div>
      <div class="tile"><div class="lab">Temp</div><div class="big">${c.wildShape?0:(c.hp.temp||0)}</div></div>
    </div>
    <div class="hpbtns" style="margin-top:8px">
      <button class="btn bad sm" id="bDmg">– Damage</button>
      <input type="number" id="bAmt" value="1" min="1" inputmode="numeric">
      <button class="btn sm" id="bHeal" style="background:#16352b;border-color:#14532d;color:#bbf7d0">+ Heal</button>
    </div>
    ${c.hp.cur<=0&&!c.stable?`<button class="btn block" id="bDeath" style="margin-top:8px">🎲 Roll death save (${c.death.succ||0}✓ / ${c.death.fail||0}✗)</button>`:''}
    ${c.hp.cur<=0&&c.stable?`<p class="muted" style="font-size:12px;margin:8px 0 0">🩹 Stabilized — unconscious but not dying. No more death saves unless you take damage.</p>`:''}
    <div class="chips" style="margin-top:10px">
      <button class="chip ${!hasAction(c)?'on':''}" data-bt="action">${!hasAction(c)?'✓ ':''}Action${(b.actionsMax||1)>1?' '+actionsLeft(c)+'/'+(b.actionsMax||1):''}</button>
      <button class="chip ${b.bonus?'on':''}" data-bt="bonus">${b.bonus?'✓ ':''}Bonus action</button>
      <button class="chip ${b.reaction?'on':''}" data-bt="reaction">${b.reaction?'✓ ':''}Reaction</button>
    </div>
    <div class="addrow" style="margin-top:10px">
      <button class="btn ghost sm" data-bt="atkminus" style="flex:1">– attack used</button>
      <button class="btn sm" id="moveBtn" style="flex:1">🥾 Move</button>
      <button class="btn ghost sm" data-bt="dash" style="flex:1">🏃 Dash</button>
    </div>
    ${hasActionSurge(c)?`<button class="btn ghost sm block" data-bt="surge" style="margin-top:8px${c.actionSurgeUsed?';opacity:.5':''}" ${c.actionSurgeUsed?'disabled':''}>⚡ ${c.actionSurgeUsed?'Action Surge spent (rest to recharge)':'Action Surge (+1 action)'}</button>`:''}
    <div class="muted" style="font-size:11px;text-transform:uppercase;letter-spacing:.05em;margin:12px 0 4px">Quick menu</div>
    <div class="addrow">
      <button class="btn sm" id="bqAttack" style="flex:1">⚔ Attacks</button>
      ${(isCaster(c)||c.spells.length)?`<button class="btn sm" id="bqSpells" style="flex:1">✨ Spells</button>`:''}
      ${c.cls==='Barbarian'?`<button class="btn sm" id="rageBtn" style="flex:1;${isRaging(c)?'background:var(--bad);border-color:var(--bad)':''}">🪓 ${isRaging(c)?'Raging':'Rage'}</button>`:''}
      ${c.cls==='Druid' && (Number(c.level)||1)>=2?`<button class="btn sm" id="wildShapeBtn" style="flex:1;${c.wildShape?'background:var(--accent2);border-color:var(--accent2)':''}">🐾 ${c.wildShape?c.wildShape.name:'Wild Shape'}</button>`:''}
      ${c.cls==='Monk' && (Number(c.level)||1)>=2?`<button class="btn sm" id="kiBtn" style="flex:1">🥋 Ki (${c.kiLeft==null?kiMax(c):c.kiLeft})</button>`:''}
      ${c.cls==='Paladin'?`<button class="btn sm" id="palBtn" style="flex:1">✝️ Paladin</button>`:''}
      ${isDraconicSorcerer(c,14)?`<button class="btn sm" id="sorcBtn" style="flex:1">🐉 Draconic</button>`:''}
      ${isFiendWarlock(c,6)?`<button class="btn sm" id="wlBtn" style="flex:1">😈 The Fiend</button>`:''}
    </div>
    <button class="btn block" id="nextTurn" style="margin-top:10px">▶ Next turn (reset action, attacks &amp; move)</button>
    <div class="muted" style="font-size:11px;text-transform:uppercase;letter-spacing:.05em;margin:14px 0 4px">Battle log</div>
    <div style="max-height:160px;overflow:auto;border:1px solid var(--line);border-radius:10px;padding:2px 10px">
      ${(c.log&&c.log.length)? c.log.slice(0,20).map(e=>`<div class="listrow" style="padding:4px 0"><div class="nm" style="font-size:12px">${esc(e.m)}</div><div class="sub" style="white-space:nowrap;font-size:11px">${fmtLogTime(e.t)}</div></div>`).join('') : '<div class="empty" style="padding:8px 0">Nothing yet — rolls, damage, casts and turns will show here.</div>'}
    </div>
  </div>`;
}

function isRaging(c){ return (c.effects||[]).some(e=>e.name==='Rage'); }

function rageDamage(c){ const l=myLevel(c); return l>=16?4:l>=9?3:2; }

function eyebiteResolve(ad, casterId, mo, opt, dc, roll){
  if(roll>=dc) return mo.name+' resists Eyebite (Wis '+roll+' vs DC '+dc+')';
  if(opt.dmg){ const d=(rollNotation(opt.dmg)||{total:0}).total; Engine.castApply(ad,casterId,mo.id,{name:'Eyebite', dc, dmgTotal:d, dtype:opt.dtype, savedKnown:false, cond:null}); }
  if(ad.addCond) ad.addCond(mo, opt.cond, opt.rounds);
  return '👁 '+mo.name+' fails ('+roll+' vs DC '+dc+') — '+opt.cond+(opt.dmg?' + '+opt.dmg+' psychic':'');
}

function spellTargetsEnemy(name, mc){ mc=mc||parseSpellMechanics(name); return !!(mc.attack||mc.save||mc.dmg||SPELL_COND[name]||POWER_WORD_HP[name]!=null||name==='Detect Thoughts'||name==='Telekinesis'||name==='Dispel Magic'||name==='Counterspell'); }

function dispelMonsterConds(mo){ const n=(mo.conds||[]).length; mo.conds=[]; return n; }

function telekinesisSavedKnown(c, mo){
  const casterRoll=rnd(20)+profBonus(c)+mod(abil(c,c.spellAbility));
  const defRoll=unitSkillRoll(mo,'athletics','str');
  return defRoll.total>casterRoll;   // target "saved" (resisted) if its roll beats yours
}

function spellNeedsBattleTarget(name, mc){
  if(SPELL_TELEPORT[name]) return false; // has its own picker
  // SPELL_AOE / SPELL_LINE are defined later — access at call time only
  if((typeof SPELL_LINE!=='undefined'&&SPELL_LINE[name])||(typeof SPELL_AOE!=='undefined'&&SPELL_AOE[name])) return true;
  return spellTargetsEnemy(name, mc);
}

function teleportOk(s, me, tp, x, y){ const td=TERRAIN[terrainAt(s,x,y)];
  if(td&&(td.solid||td.deadly)) return false;
  if(s.monsters.some(m=>m.hp>0&&m.x===x&&m.y===y)) return false;
  if((s.players||[]).some(p=>p!==me&&p.x===x&&p.y===y)) return false;
  if(me.x===x&&me.y===y) return false;
  if(!inBlast(me.x,me.y,x,y,tp.tiles)) return false;
  if(tp.los && !losClear(s,me.x,me.y,x,y,{ignoreCreatures:true})) return false;
  return true; }

function critNotation(n){ const p=parseDice(n); let s=p.terms.map(t=>(t.n*2)+'d'+t.sides).join('+'); if(p.flat) s+=(p.flat>0?'+':'')+p.flat; return s||n; }

function riderChecksHTML(riders){
  let h='';
  if(riders.sneak) h+=`<label class="pill" style="cursor:pointer;margin-bottom:8px;display:flex"><input type="checkbox" id="afSneak"> ${riders.sneak.label} <span class="muted" style="font-size:11px">(once/turn; needs advantage or an adjacent ally)</span></label>`;
  if(riders.smite) h+=`<div class="addrow" style="margin:0 0 8px;align-items:center"><span class="muted" style="font-size:12px;flex:none">⚡ Divine Smite</span><select id="afSmite" style="flex:1"><option value="">— no smite —</option>${riders.smite.levels.map(l=>`<option value="${l}">L${l} slot — +${Math.min(5,1+l)}d8 radiant</option>`).join('')}</select></div>`;
  if(riders.divineStrike) h+=`<label class="pill" style="cursor:pointer;margin-bottom:8px;display:flex"><input type="checkbox" id="afDivStrike"> ${riders.divineStrike.label} <span class="muted" style="font-size:11px">(once/turn)</span></label>`;
  if(riders.colossus) h+=`<label class="pill" style="cursor:pointer;margin-bottom:8px;display:flex"><input type="checkbox" id="afColossus"> ${riders.colossus.label} <span class="muted" style="font-size:11px">(once/turn — target below max HP)</span></label>`;
  if(riders.hurl) h+=`<label class="pill" style="cursor:pointer;margin-bottom:8px;display:flex"><input type="checkbox" id="afHurl"> ${riders.hurl.label} <span class="muted" style="font-size:11px">(once/long rest)</span></label>`;
  if(riders.maneuver) h+=`<div class="addrow" style="margin:0 0 8px;align-items:center"><span class="muted" style="font-size:12px;flex:none">⚔️ Maneuver</span><select id="afManeuver" style="flex:1"><option value="">— no maneuver —</option>${Object.entries(riders.maneuver.options).map(([k,m])=>`<option value="${k}">${m.label} — +1d${riders.maneuver.die}</option>`).join('')}</select></div>`;
  return h;
}

function attackRiderOptions(c, atk, targetMo){
  const out={};
  if(!atk.spell){
    const wref=weaponByName(String(atk.name||'').replace(/\s*\((off-hand|opportunity)\)$/,''));
    const sneakDice=Math.ceil(myLevel(c)/2);
    if(c.cls==='Rogue' && (!wref || wref.type==='ranged' || /finesse/.test(wref.props||'')) && !(c.battle&&c.battle.sneakUsed))
      out.sneak={dice:sneakDice, die:6, label:'🗡️ Sneak Attack +'+sneakDice+'d6'};
    if(c.cls==='Paladin' && myLevel(c)>=2 && (!wref || wref.type==='melee')){
      const lvls=[1,2,3,4,5].filter(l=>{ const t=spellSlots(c)[l]||0; return t-Math.min(t,(c.slots[l]&&c.slots[l].used)||0)>0; });
      if(lvls.length) out.smite={levels:lvls};
    }
  }
  if(isLifeCleric(c,8) && !atk.spell && !(c.battle&&c.battle.divineStrikeUsed)){
    const dice=myLevel(c)>=14?2:1;
    out.divineStrike={dice, die:8, label:'✝️ Divine Strike +'+dice+'d8 radiant'};
  }
  if(c.cls==='Ranger' && c.hunterPrey==='Colossus Slayer' && !atk.spell && !(c.battle&&c.battle.colossusSlayerUsed) && targetMo && targetMo.hp>0 && targetMo.hp<targetMo.max)
    out.colossus={dice:1, die:8, label:'🏹 Colossus Slayer +1d8'};
  if(isFiendWarlock(c,14) && !c.hurlThroughHellUsed && targetMo)
    out.hurl={label:'😈 Hurl Through Hell — 10d10 psychic unless a fiend'};
  if(!atk.spell && (isBattleMaster(c)||hasFeat(c,'Martial Adept')) && (c.superiorityDiceLeft!=null?c.superiorityDiceLeft:superiorityDiceMax(c))>0)
    out.maneuver={die:superiorityDieSize(c), options:MANEUVERS};
  return out;
}

function applyAttackRiders(c, atk, targetMo, choices, isCrit, targetSurprised, log){
  choices=choices||{}; let total=0; const parts=[];
  if(choices.sneak && !(c.battle&&c.battle.sneakUsed)){ const dice=Math.ceil(myLevel(c)/2); const r=rollNotation((isCrit?dice*2:dice)+'d6');
    if(r){ total+=r.total; parts.push('sneak '+r.detail); if(c.battle) c.battle.sneakUsed=true; log('🗡️ Sneak Attack +'+r.total); } }
  if(choices.smiteLevel){ const l=Number(choices.smiteLevel), dice=Math.min(5,1+l)*(isCrit?2:1); const r=rollNotation(dice+'d8');
    if(r){ total+=r.total; parts.push('smite '+r.detail); if(!c.slots[l]) c.slots[l]={total:0,used:0}; c.slots[l].used=Math.min(spellSlots(c)[l]||0,(c.slots[l].used||0)+1); log('⚡ Divine Smite (L'+l+' slot) +'+r.total); } }
  if(choices.divineStrike && !(c.battle&&c.battle.divineStrikeUsed)){ const dice=(myLevel(c)>=14?2:1)*(isCrit?2:1); const r=rollNotation(dice+'d8');
    if(r){ total+=r.total; parts.push('divine strike '+r.detail); if(c.battle) c.battle.divineStrikeUsed=true; log('✝️ Divine Strike +'+r.total); } }
  if(choices.colossus && !(c.battle&&c.battle.colossusSlayerUsed)){ const dice=isCrit?2:1; const r=rollNotation(dice+'d8');
    if(r){ total+=r.total; parts.push('colossus slayer '+r.detail); if(c.battle) c.battle.colossusSlayerUsed=true; log('🏹 Colossus Slayer +'+r.total); } }
  if(choices.maneuver && MANEUVERS[choices.maneuver]){
    const left=(c.superiorityDiceLeft!=null?c.superiorityDiceLeft:superiorityDiceMax(c));
    if(left>0){
      const man=MANEUVERS[choices.maneuver], die=superiorityDieSize(c);
      const r=rollNotation('1d'+die);
      c.superiorityDiceLeft=left-1;
      if(r){ total+=r.total; parts.push(man.label+' '+r.detail); }
      if(man.save===false){
        // Distracting Strike (PHB): no save — automatic. Next ally attack on this target has
        // advantage before the end of your next turn.
        applyManeuverCond(targetMo, man.cond, 10);
        log(man.log+' +'+(r?r.total:0)+' — next ally attack on this target has advantage');
      } else {
        // Trip/Menacing/Goading (PHB): Str-or-Dex save (attacker's choice — this app auto-picks
        // whichever the attacker is better at, same "no extra UI toggle" simplification Death
        // Strike's own DC calc above already uses) or the maneuver's condition applies.
        const dc=8+profBonus(c)+Math.max(mod(abil(c,'str')),mod(abil(c,'dex')));
        const save=targetMo?rnd(20)+monsterSaveBonus(targetMo):20;
        if(save<dc){
          applyManeuverCond(targetMo, man.cond, 10);
          if(man.cond==='Goaded' && targetMo) targetMo.goadedBy=c.name;
          log(man.log+' +'+(r?r.total:0)+' — save '+save+' vs DC '+dc+' — '+man.cond+'!');
        } else log(man.log+' +'+(r?r.total:0)+' — save '+save+' vs DC '+dc+' — resisted');
      }
    }
  }
  if(choices.hurl){
    c.hurlThroughHellUsed=true;
    const isFiendTarget=targetMo && monsterIsFiend(targetMo);
    log('😈 Hurl Through Hell — the target vanishes until the end of your next turn');
    if(!isFiendTarget){ const r=rollNotation('10d10')||{total:0,detail:''}; total+=r.total; parts.push('Hurl Through Hell '+r.detail); log('😈 Hurl Through Hell +'+r.total+' psychic'); }
    else parts.push('Hurl Through Hell (fiend — immune to the psychic damage)');
  }
  // Absorb Elements (reaction) rider: the first melee hit after casting adds +1d6 of the absorbed
  // damage type (PHB). Auto-applied (not an opt-in choice like Sneak Attack) and one-shot —
  // consumed here on the next qualifying hit. Melee only; skips ranged/spell attacks.
  if(c.absorbRider && !atk.spell){
    const wref=weaponByName(String(atk.name||'').replace(/\s*\((off-hand|opportunity)\)$/,''));
    if(!wref || wref.type==='melee'){ const dt=c.absorbRider, r=rollNotation((isCrit?2:1)+'d6');
      if(r){ total+=r.total; parts.push('Absorb Elements '+dt+' '+r.detail); log('🌀 Absorb Elements +'+r.total+' '+dt); }
      c.absorbRider=null; }
  }
  let doubled=false;
  if(targetSurprised && isAssassin(c,17)){
    const dc=8+mod(abil(c,'dex'))+profBonus(c), save=rnd(20)+(targetMo?monsterSaveBonus(targetMo):0);
    if(save<dc){ doubled=true; parts.push('Death Strike DOUBLED (Con '+save+' vs DC '+dc+')'); log('💀 Death Strike — '+atk.name+' damage doubled'); }
    else parts.push('Death Strike resisted (Con '+save+' vs DC '+dc+')');
  }
  return {total, detail:parts.length?(' · '+parts.join(' · ')):'', doubled};
}

function powerAttackKind(c, atk){
  if(atk.spell) return null;
  const wref=weaponByName(String(atk.name||'').replace(/\s*\((off-hand|opportunity)\)$/,''));
  if(!wref) return null;
  if(wref.type==='melee' && /heavy/.test(wref.props||'') && hasFeat(c,'Great Weapon Master')) return 'gwm';
  if(wref.type==='ranged' && hasFeat(c,'Sharpshooter')) return 'sharpshooter';
  return null;
}

function weaponAflowAttrs(c, it){ const w=weaponByName(it.name)||{dmg:'1d4',dt:'',vers:''}; const b=weaponDmgBonus(c,w,it); const dn=w.dmg+(b?sgn(b):''); const vn=w.vers?(w.vers+(b?sgn(b):'')):''; return `data-aflow data-aname="${esc(it.name)}" data-ahit="${weaponToHit(c,w,it)}" data-admg="${esc(dn)}" data-adt="${esc(w.dt||'')}" data-avers="${esc(vn)}"`; }

function expertiseTotal(c){ const l=myLevel(c); if(c.cls==='Rogue') return 2+(l>=6?2:0); if(c.cls==='Bard') return (l>=3?2:0)+(l>=10?2:0); return 0; }

function expertiseOwed(c){ return Math.max(0, expertiseTotal(c) - SKILLS.filter(([k])=>c.skillExp[k]).length); }

function pendingChoiceSpecs(c){
  const specs=[]; const l=myLevel(c);   // primary class's own level — see myLevel's doc comment
  if(c.race==='Half-Elf' && !c.raceDone){ specs.push({t:'ability',n:2,options:['str','dex','con','int','wis'],label:'Half-Elf · +1 to two abilities',_race:1}); specs.push({t:'skill',n:2,label:'Half-Elf · two skill proficiencies',_race:1}); }
  if(c.race==='Human (Variant)' && !c.raceDone){ specs.push({t:'ability',n:2,label:'Variant Human · +1 to two abilities',_race:1}); specs.push({t:'skill',n:1,label:'Variant Human · one skill proficiency',_race:1}); }
  if(c.race==='Dragonborn' && !c.dragon){ specs.push({t:'ancestry'}); }
  if(!c.fightingStyle){ const fl=FIGHTING_STYLE_LEVEL[c.cls]; if(fl && l>=fl) specs.push({t:'fightingStyle',cls:c.cls}); }
  const eo=expertiseOwed(c); if(eo>0) specs.push({t:'expertise',n:eo,label:'Expertise · choose '+eo+' proficient skill'+(eo>1?'s':'')});
  // College of Lore — Bonus Proficiencies (3rd level): 3 more skill proficiencies, a one-time
  // grant. Reuses the exact same {t:'skill',n} choice shape Half-Elf/Variant Human already use
  // — no new choice-picker UI needed, just another spec pushed into the same queue.
  if(c.cls==='Bard' && c.subclass==='College of Lore' && l>=3 && !c.loreBonusProfsChosen) specs.push({t:'skill',n:3,label:'College of Lore · three skill proficiencies',_loreBonus:1});
  // Favored Enemy (1st/6th/14th) and Natural Explorer (1st/6th/10th): repeatable picks, one
  // spec pushed per still-owed pick so leveling up multiple levels at once (or a freshly
  // imported high-level character) is offered all of them, not just one.
  if(c.cls==='Ranger'){
    const feOwed=[1,6,14].filter(x=>l>=x).length-(c.favoredEnemies||[]).length;
    for(let i=0;i<feOwed;i++) specs.push({t:'pick', key:'favoredEnemies', multi:true, options:FAVORED_ENEMY_TYPES, label:'Favored Enemy'});
    const ftOwed=[1,6,10].filter(x=>l>=x).length-(c.favoredTerrains||[]).length;
    for(let i=0;i<ftOwed;i++) specs.push({t:'pick', key:'favoredTerrains', multi:true, options:FAVORED_TERRAIN_TYPES, label:'Favored Terrain'});
  }
  // Hunter's four subclass picks (3rd/7th/11th/15th) — each is a one-time choice, unlike
  // Favored Enemy/Terrain above.
  if(c.cls==='Ranger' && c.subclass==='Hunter'){
    if(l>=3 && !c.hunterPrey) specs.push({t:'pick', key:'hunterPrey', options:['Colossus Slayer','Giant Killer','Horde Breaker'], label:"Hunter's Prey"});
    if(l>=7 && !c.hunterDefense) specs.push({t:'pick', key:'hunterDefense', options:['Escape the Horde','Multiattack Defense','Steel Will'], label:'Defensive Tactics'});
    if(l>=11 && !c.hunterMultiattack) specs.push({t:'pick', key:'hunterMultiattack', options:['Volley','Whirlwind Attack'], label:'Multiattack'});
    if(l>=15 && !c.hunterSuperiorDefense) specs.push({t:'pick', key:'hunterSuperiorDefense', options:['Evasion','Stand Against the Tide','Uncanny Dodge'], label:"Superior Hunter's Defense"});
  }
  // Metamagic (base Sorcerer, 3rd/10th/17th): 2 known at 3rd, +1 at 10th, +1 at 17th —
  // repeatable, same shape as Favored Enemy/Terrain above.
  if(c.cls==='Sorcerer'){
    const mmOwed=((l>=3?2:0)+(l>=10?1:0)+(l>=17?1:0))-(c.metamagic||[]).length;
    for(let i=0;i<mmOwed;i++) specs.push({t:'pick', key:'metamagic', multi:true, options:METAMAGIC_OPTIONS, label:'Metamagic'});
  }
  // Dragon Ancestor (Draconic Bloodline, 1st level): one-shot ancestry choice, drives Elemental
  // Affinity's damage type via DRACONIC_ANCESTRY_DAMAGE.
  if(c.cls==='Sorcerer' && c.subclass==='Draconic Bloodline' && !c.sorcererDragon) specs.push({t:'pick', key:'sorcererDragon', options:Object.keys(DRACONIC_ANCESTRY_DAMAGE), label:'Dragon Ancestor'});
  // Eldritch Invocations (base Warlock, 2nd+): known-count by level (PHB table), repeatable —
  // no prerequisite checking (pact-boon/level gates some real invocations require), a curated
  // list rather than the full PHB roster, same scope call BEAST_SHAPES made for Wild Shape.
  if(c.cls==='Warlock'){
    const tiers=[[2,2],[5,3],[7,4],[9,5],[12,6],[15,7],[18,8]];
    let known=0; tiers.forEach(([x,n])=>{ if(l>=x) known=n; });
    const owed=known-(c.invocations||[]).length;
    for(let i=0;i<owed;i++) specs.push({t:'pick', key:'invocations', multi:true, options:ELDRITCH_INVOCATIONS, label:'Eldritch Invocation'});
  }
  // Pact Boon (base Warlock, 3rd level): one-shot.
  if(c.cls==='Warlock' && l>=3 && !c.pactBoon) specs.push({t:'pick', key:'pactBoon', options:['Pact of the Chain','Pact of the Blade','Pact of the Tome'], label:'Pact Boon'});
  return specs;
}

function resolveChoices(c){
  const specs=pendingChoiceSpecs(c);
  if(!specs.length) return false;
  promptChoices('Make your character choices', specs, c, ()=>{ if(specs.some(s=>s._race)) c.raceDone=true; if(specs.some(s=>s._loreBonus)) c.loreBonusProfsChosen=true; });
  return true;
}

function subclassLevel(c){ return SUBCLASS_LEVEL[c.cls]||3; }

function classLevel(c,cls){
  if(!c) return 0;
  if(!c.classes || c.classes.length<=1) return cls===c.cls ? (Number(c.level)||1) : 0;
  const e=c.classes.find(x=>x.cls===cls); return e?(Number(e.level)||0):0;
}

function classSubclass(c,cls){
  if(!c) return '';
  if(!c.classes || c.classes.length<=1) return cls===c.cls ? (c.subclass||'') : '';
  const e=c.classes.find(x=>x.cls===cls); return e?(e.subclass||''):'';
}

function myLevel(c){ return classLevel(c,c&&c.cls); }

function totalLevel(c){
  if(!c) return 1;
  if(!c.classes || c.classes.length<=1) return Number(c.level)||1;
  return c.classes.reduce((s,e)=>s+(Number(e.level)||0),0) || (Number(c.level)||1);
}

function syncPrimaryClass(c){
  if(!c.classes || !c.classes.length) return;
  if(c.classes.length<=1){
    c.classes[0].cls=c.cls; c.classes[0].level=Number(c.level)||1; c.classes[0].subclass=c.subclass||'';
    return;
  }
  c.cls=c.classes[0].cls; c.subclass=c.classes[0].subclass||'';
  c.level=totalLevel(c);
}

function meetsMulticlassPrereq(c, cls){
  const need=MULTICLASS_PREREQ[cls]; if(!need) return true;
  // Every multi-ability entry in the table needs ALL of them (Paladin: str+cha, Monk: dex+wis,
  // Ranger: dex+wis) — except Fighter, RAW's one "either" case (Strength 13 OR Dexterity 13).
  if(cls==='Fighter') return need.some(k=>abil(c,k)>=13);
  return need.every(k=>abil(c,k)>=13);
}

function hitDiceLabel(c){
  const hd=CLASS_HITDIE[c.cls]||8;
  return totalLevel(c)+'d'+hd;
}

function classLabel(c){
  if(!c.classes || c.classes.length<=1) return 'Level '+c.level+' '+esc(c.cls);
  return c.classes.filter(e=>e.level>0).map(e=>esc(e.cls)+' '+e.level).join(' / ');
}

function pbCost(v){ return PB_COST[Math.max(8,Math.min(15,Number(v)||8))]||0; }

function pbUsed(c){ return ABILITIES.reduce((s,[k])=>s+pbCost(c.abilities[k]),0); }

function isCaster(c){ return !!CLASS_SPELL_ABILITY[c.cls]; }

function isPrepCaster(c){ return ['Cleric','Druid','Wizard','Artificer','Paladin'].includes(c.cls); }

function canRitualCast(c, name){
  if(!RITUAL_SPELLS.has(name)) return false;
  const known=(c.spells||[]).find(s=>s.name===name);
  if(!known) return false;
  if(c.cls==='Cleric' || c.cls==='Druid') return !!known.prepared;
  if(RITUAL_CASTERS.includes(c.cls)) return true;
  return hasFeat(c,'Ritual Caster');
}

function preparedMax(c){ const l=myLevel(c), m=mod(abil(c,c.spellAbility));
  if(['Wizard','Cleric','Druid'].includes(c.cls)) return Math.max(1, m+l);
  if(['Paladin','Artificer'].includes(c.cls)) return Math.max(1, m+Math.floor(l/2));
  return null; }

function preparedCount(c){ return (c.spells||[]).filter(s=>s.prepared && (s.level||0)>0 && !s.oathSpell).length; }

function oathSpellNames(c){
  const table=c && OATH_SPELLS[c.subclass]; if(!table) return [];
  const lvl=myLevel(c), out=[];
  Object.keys(table).forEach(l=>{ if(lvl>=Number(l)) out.push(...table[l]); });
  return out;
}

function sorcMax(c){ return (c.cls==='Sorcerer' && myLevel(c)>=2) ? myLevel(c) : 0; }

function sorcCur(c){ const m=sorcMax(c); if(!m) return 0; return Math.max(0, Math.min(m, c.sorcPts!=null?Number(c.sorcPts):m)); }

function spellPrepared(c, name){ const s=(c.spells||[]).find(x=>x.name.toLowerCase()===String(name||'').toLowerCase()); return s? !!s.prepared : true; }

function castableSpells(c){ return (c.spells||[]).filter(s=> (s.level||0)===0 || !isPrepCaster(c) || s.prepared); }
// Reaction-spell readiness — deliberately NOT reusing canCast(c,name,1) here: canCast has UI
// side effects (flashBanner on every reason it'd refuse), which is correct when a player actively
// tries to cast but wrong for a passive "could they?" check run on every incoming attack. A
// quieter re-check of the same three gates (known/prepared, reaction free, a slot available).
// All three currently-supported reaction spells (Shield, Absorb Elements, Hellish Rebuke) are
// 1st-level and are cast at 1st here — upcast scaling (Rebuke's +1d10/level, Absorb's +1d6/level)
// isn't modeled, a named simplification (see AUDIT), same "base effect only" shape Shield uses.
// Lowest spell-slot level (≥1) this character still has an unspent slot at, or 0 if none. Using
// the LOWEST available (not hard-coding level 1) is what lets a Warlock react — their pact slots
// live at their pact-slot level (e.g. a L5 Warlock's slots are level-3 slots, spellSlots[1]===0),
// so a level-1-check would wrongly lock Warlocks out of Hellish Rebuke, their iconic reaction.
function lowestReactionSlot(c){
  const ss=spellSlots(c);
  for(let l=1;l<=9;l++){ const tot=ss[l]||0, used=Math.min(tot,(c.slots&&c.slots[l]&&c.slots[l].used)||0); if(tot-used>0) return l; }
  return 0;
}
function reactionSpellReady(c, name){
  if(!c||!c.battle||c.battle.reaction) return false;
  if(!castableSpells(c).some(s=>s.name===name)) return false;
  return lowestReactionSlot(c)>0;
}
function shieldEligible(c){ return reactionSpellReady(c,'Shield'); }   // kept: the synced shieldReady flag + existing callers
function isElementalDamage(dt){ return /^(acid|cold|fire|lightning|thunder)$/i.test(String(dt||'')); }
// Which reaction spells can this character fire against THIS incoming attack? ctx supplies the
// attack-specific gates the readiness check can't know on its own: wouldFlip (would +5 AC turn
// this hit into a miss — Shield only), dtype (Absorb Elements needs elemental damage), and
// inRebukeRange (Hellish Rebuke is 60 ft). Returns an ordered [{id,label,note}] the reaction
// menu renders directly — one source of truth shared by QB (local) and the DM-hosted offer.
function availableReactions(c, ctx){
  ctx=ctx||{}; const out=[];
  if(ctx.wouldFlip && reactionSpellReady(c,'Shield')) out.push({id:'shield', label:'🛡️ Shield', note:'+5 AC — this attack would miss'});
  if(isElementalDamage(ctx.dtype) && reactionSpellReady(c,'Absorb Elements')) out.push({id:'absorb', label:'🌀 Absorb Elements', note:'halve the '+ctx.dtype+' damage · +1d6 '+ctx.dtype+' on your next melee hit'});
  if(ctx.inRebukeRange!==false && reactionSpellReady(c,'Hellish Rebuke')) out.push({id:'rebuke', label:'😈 Hellish Rebuke', note:'2d10 fire back at the attacker (Dex save for half)'});
  return out;
}
// Apply a chosen reaction's cost + immediate self-effect. Shared by QB and a player's own device
// in DM-hosted (the two places that hold the real character `c`) — one path, never a per-mode
// copy. Returns {retaliate:{...}} when the reaction strikes back AFTER the triggering damage
// (Hellish Rebuke), so the caller can apply that against the attacker via whichever adapter it
// owns; {} otherwise. dtype is the incoming attack's damage type (for Absorb Elements).
function castPcReaction(c, choice, dtype, log){
  if(!c||!c.battle) return {};
  c.battle.reaction=true;
  const sl=lowestReactionSlot(c)||1;   // spend the lowest available slot (a Warlock's pact slot is >1st — see lowestReactionSlot). Upcast scaling of the effect isn't modeled (documented simplification).
  if(!c.slots[sl]) c.slots[sl]={total:0,used:0};
  c.slots[sl].used=Math.min(spellSlots(c)[sl]||0,(c.slots[sl].used||0)+1);
  if(choice==='shield'){ addEffect(c,'Shield'); log&&log('🛡️ '+(c.name||'You')+' casts Shield — +5 AC until the start of their next turn'); return {}; }
  if(choice==='absorb'){ c.absorbResist=dtype; c.absorbRider=dtype;   // resist the trigger (applyHp) + rider on next melee hit (applyAttackRiders); both cleared at start of next turn (resetTurnState) or on use
    log&&log('🌀 '+(c.name||'You')+' casts Absorb Elements — resistance to '+dtype+' until their next turn'); return {}; }
  if(choice==='rebuke'){ const dc=8+profBonus(c)+mod(abil(c,c.spellAbility)); const r=rollNotation('2d10')||{total:0,detail:''};
    log&&log('😈 '+(c.name||'You')+' casts Hellish Rebuke — 2d10 fire back at the attacker'); return {retaliate:{name:'Hellish Rebuke', dmg:r.total, dc, dtype:'fire'}}; }
  return {};
}

function applyClassDefaults(c){
  const sv=CLASS_SAVES[c.cls];
  if(sv){ c.saveProf={str:false,dex:false,con:false,int:false,wis:false,cha:false}; sv.forEach(s=>c.saveProf[s]=true); }
  // A class SWITCH (not a multiclass level — this always clears subclass first) replaces the
  // whole classes array with a single fresh entry: this editor is "redo my class from scratch",
  // not "take a level in a new class", so any prior multiclass state is deliberately discarded.
  c.classes=[{cls:c.cls, level:Number(c.level)||1, subclass:c.subclass||''}];
  const hd=CLASS_HITDIE[c.cls];
  if(hd) c.hitDice.total=hitDiceLabel(c);
  if(CLASS_SPELL_ABILITY[c.cls]) c.spellAbility=CLASS_SPELL_ABILITY[c.cls];   // derived from class
}

function raceBonus(c,k){ return ((RACE_ASI[c.race]||{})[k])||0; }

function abilBase(c,k){ const b=Number(c.abilities[k]); return (isNaN(b)?0:b) + raceBonus(c,k) + ((c.asiBonus&&c.asiBonus[k])||0); }

function abil(c,k){ return abilBase(c,k) + effBonus(c,k) + gearBonus(c,k); }   // final score incl. active-effect + equipment buffs

function asiLevels(c){
  const base=[4,8,12,16,19];
  if(c.cls==='Fighter') return [4,6,8,12,14,16,19];
  if(c.cls==='Rogue') return [4,8,10,12,16,19];
  return base;
}

function spellClassNames(name){ const m=spellMeta(name); return m? m.c.split('').map(l=>CLASS_FROM_LETTER[l]).filter(Boolean).join(', ') : ''; }

function spellInfo(name){
  const m=spellMeta(name);
  if(!m){ showInfo(name,'Custom spell','No reference info — add details in the spell\'s notes.'); return; }
  const sum=SPELL_DESC[name]||'';
  showInfo(m.n+' '+SCHOOL_ICON[m.s], SCHOOL_NAME[m.s]+' · '+lvlLabel(m.l),
    (sum?`<p style="margin:0 0 10px">${esc(sum)}</p>`:'')+'<b>Classes:</b> '+spellClassNames(name)+'.');
}

function featInfo(name){ showInfo(name,'Feat', esc(FEAT_DESC[name]||'No summary available for this feat.')); }

function abilSelect(id, opts){ return `<select id="${id}" class="ch-ab">`+(opts||['str','dex','con','int','wis','cha']).map(k=>`<option value="${k}">${k.toUpperCase()}</option>`).join('')+`</select>`; }

function choiceControl(sp, i, c){
  const lab=(t)=>`<label>${sp.label||t}</label>`;
  if(sp.t==='ability') return `<div class="field">${lab('Increase '+sp.n+' ability'+(sp.n>1?' (each +1)':' by +1'))}${[...Array(sp.n)].map((_,j)=>abilSelect('csp_'+i+'_'+j, sp.options)).join(' ')}</div>`;
  if(sp.t==='resilient') return `<div class="field">${lab('+1 to one ability & gain its save proficiency')}${abilSelect('csp_'+i+'_0')}</div>`;
  if(sp.t==='skill'){ return `<div class="field">${lab('Choose '+sp.n+' skill proficienc'+(sp.n>1?'ies':'y'))}<div class="cklist">${SKILLS.map(([k,nm])=>c.skillProf[k]?'':`<label class="listrow" style="cursor:pointer;padding:5px 0"><input type="checkbox" class="chk" data-csp="${i}" value="${k}"> ${nm}</label>`).join('')}</div></div>`; }
  if(sp.t==='expertise'){ const prof=SKILLS.filter(([k])=>c.skillProf[k]&&!c.skillExp[k]); return `<div class="field">${lab('Choose '+sp.n+' skill for expertise')}<div class="cklist">${prof.length?prof.map(([k,nm])=>`<label class="listrow" style="cursor:pointer;padding:5px 0"><input type="checkbox" class="chk" data-csp="${i}" value="${k}"> ${nm}</label>`).join(''):'<span class="muted small">Gain skill proficiencies first.</span>'}</div></div>`; }
  if(sp.t==='spellChoice'){ const known=new Set(c.spells.map(s=>s.name.toLowerCase())); let list=SPELLS.filter(s=>s.l===sp.lvl && !known.has(s.n.toLowerCase())); if(sp.schools) list=list.filter(s=>sp.schools.includes(s.s)); if(!sp.any){ const lt=CLASS_LETTER[c.cls]; if(lt) list=list.filter(s=>s.c.includes(lt)); }
    if(sp.attackOnly) list=list.filter(s=>parseSpellMechanics(s.n).attack);   // Spell Sniper: an attack-roll cantrip only
    return `<div class="field">${lab('Choose '+sp.n+' '+lvlLabel(sp.lvl).toLowerCase()+' spell'+(sp.n>1?'s':''))}<div class="cklist">${list.map(s=>`<label class="listrow" style="cursor:pointer;padding:5px 0;align-items:flex-start"><input type="checkbox" class="chk" data-csp="${i}" value="${esc(s.n)}|${s.l}"> <span style="flex:none">${SCHOOL_ICON[s.s]}</span> <span class="nm" style="margin-left:6px">${esc(s.n)}${SPELL_DESC[s.n]?`<small>${esc(SPELL_DESC[s.n])}</small>`:''}</span></label>`).join('')}</div></div>`; }
  if(sp.t==='ancestry') return `<div class="field">${lab('Draconic ancestry (breath weapon & resistance)')}<select id="csp_${i}_anc">${DRAGON_ANCESTRY.map(a=>`<option>${a}</option>`).join('')}</select></div>`;
  if(sp.t==='fightingStyle') return `<div class="field">${lab('Fighting Style')}<select id="csp_${i}_fs">${(FIGHTING_STYLES[sp.cls]||[]).map(f=>`<option>${f}</option>`).join('')}</select></div>`;
  // Generic single-dropdown choice — Ranger Favored Enemy/Favored Terrain (repeatable across
  // levels, `multi:true`, stored as an array) and Hunter's four subclass picks (one-shot,
  // stored as a plain string) all share this one shape rather than a bespoke render/resolve
  // pair each.
  if(sp.t==='pick') return `<div class="field">${lab(sp.label)}<select id="csp_${i}_pick">${sp.options.map(o=>`<option>${esc(o)}</option>`).join('')}</select></div>`;
  // Weapon Master: choose n weapons to gain proficiency with (weaponProficient() checks
  // c.weaponMasterProfs for these by name).
  if(sp.t==='weaponProf'){ const already=new Set(c.weaponMasterProfs||[]); return `<div class="field">${lab('Choose '+sp.n+' weapons for proficiency')}<div class="cklist">${WEAPONS.filter(w=>!already.has(w.n)).map(w=>`<label class="listrow" style="cursor:pointer;padding:5px 0"><input type="checkbox" class="chk" data-csp="${i}" value="${esc(w.n)}"> ${esc(w.n)}</label>`).join('')}</div></div>`; }
  return '';
}

function armorDef(key){ return ARMOR.find(a=>a.key===key)||ARMOR[0]; }

function armorProficient(c, armorKey){
  const a=armorDef(armorKey);
  if(!a.cat) return true;   // unarmored — always fine
  if((ARMOR_PROF[c.cls]||[]).includes(a.cat)) return true;
  if(a.cat==='light' && hasFeat(c,'Lightly Armored')) return true;
  if(a.cat==='medium' && hasFeat(c,'Moderately Armored')) return true;
  if(a.cat==='heavy' && hasFeat(c,'Heavily Armored')) return true;
  return false;
}

function computeAC(c,opts){
  if(c.wildShape) return c.wildShape.ac;   // Wild Shape: your own AC doesn't apply, the beast's does (PHB)
  const ignoreFx=!!(opts&&opts.ignoreEffects);
  if(c.acOverride!=='' && c.acOverride!=null && !isNaN(c.acOverride)) return Number(c.acOverride) + (ignoreFx?0:effBonus(c,'ac')) + gearBonus(c,'ac');
  const a=armorDef(c.armor||'none');
  const hasFx=n=>!ignoreFx && (c.effects||[]).some(e=>e.name===n);
  // Medium Armor Master: DEX bonus to AC caps at +3 instead of +2 in medium armor (dexCap===2).
  const dexCap = (a.dexCap===2 && hasFeat(c,'Medium Armor Master')) ? 3 : a.dexCap;
  let base = a.base + Math.min(mod(abil(c,'dex')), dexCap);
  // Unarmored Defense (Barbarian 1st, Monk 1st) — was flavor-text-only in CLASS_FEATURES
  // before this pass; a real base-class feature every Barbarian/Monk needs regardless of
  // subclass, same as Bardic Inspiration/Channel Divinity/Wild Shape were for earlier classes.
  // Barbarian's version still allows a shield; Monk's explicitly doesn't (PHB).
  if(a.key==='none' && c.cls==='Barbarian') base = 10 + mod(abil(c,'dex')) + mod(abil(c,'con'));
  if(a.key==='none' && !c.shield && c.cls==='Monk') base = 10 + mod(abil(c,'dex')) + mod(abil(c,'wis'));
  if(a.key==='none' && isDraconicSorcerer(c,1)) base = 13 + mod(abil(c,'dex'));        // Draconic Resilience: 13 + DEX while unarmored
  if(a.key==='none' && hasFx('Mage Armor')) base = 13 + mod(abil(c,'dex'));           // Mage Armor: 13 + DEX while unarmored
  if(c.fightingStyle==='Defense' && a.key!=='none') base += 1;                        // Defense style: +1 AC while wearing armor
  let ac = base + (c.shield?2:0) + (ignoreFx?0:effBonus(c,'ac')) + gearBonus(c,'ac');
  if(hasFx('Barkskin')) ac = Math.max(ac, 16);                                        // Barkskin: AC can't be below 16
  return ac;
}

function defaultSpeed(c){ return RACE_SPEED[c.race]||30; }

function spellMeta(name){ return SPELL_BY_NAME[String(name||'').toLowerCase()]||null; }

function spellIcon(name){ const m=spellMeta(name); return m?SCHOOL_ICON[m.s]:'✨'; }

function lvlLabel(l){ return l===0?'Cantrip':({1:'1st',2:'2nd',3:'3rd'}[l]||l+'th')+' level'; }

function spellDesc(name, level){ const m=spellMeta(name); return (m?SCHOOL_NAME[m.s]+' · ':'')+lvlLabel(m?m.l:level); }

function spellSummary(name){ return SPELL_DESC[name]||''; }

function effBonus(c, key){ let n=0; (c.effects||[]).forEach(e=>{ if(e.mods && e.mods[key]) n+=e.mods[key]; }); return n; }

function effSpeedMul(c){ let m=1; (c.effects||[]).forEach(e=>{ if(e.mods && e.mods.speedMul) m*=e.mods.speedMul; }); return m; }

function unarmoredMoveBonus(c){ if(!(c && c.cls==='Monk' && (c.armor||'none')==='none' && !c.shield)) return 0; const l=myLevel(c);
  return l>=18?30:l>=14?25:l>=10?20:l>=6?15:l>=2?10:0; }

function effSpeed(c,opts){ if(c.wildShape) return c.wildShape.speed||30; if(c.mountedOn) return c.mountedOn.speed||30; const ignoreFx=!!(opts&&opts.ignoreEffects); return Math.round((Number(c.speed||0)+unarmoredMoveBonus(c)+(hasFeat(c,'Mobile')?10:0)+(ignoreFx?0:effBonus(c,'speed'))+gearBonus(c,'speed'))*(ignoreFx?1:effSpeedMul(c))); }

function modSummary(mods){ if(!mods) return ''; const parts=[];
  if(mods.ac) parts.push(sgn(mods.ac)+' AC');
  if(mods.save) parts.push(sgn(mods.save)+' all saves');
  if(mods.speed) parts.push(sgn(mods.speed)+' ft');
  if(mods.speedMul) parts.push('×'+mods.speedMul+' speed');
  ['str','dex','con','int','wis','cha'].forEach(k=>{ if(mods[k]) parts.push(sgn(mods[k])+' '+k.toUpperCase()); });
  if(mods.tempHp) parts.push(sgn(mods.tempHp)+' temp HP');
  return parts.join(' · ');
}

function fmtDuration(r){ if(r==null) return 'until removed'; if(r<=0) return 'expired'; if(r>=600) return (r/600).toFixed(r%600?1:0)+' hr'; if(r>=10) return (r/10).toFixed(r%10?1:0)+' min'; return r+' rd'; }

function hasConcentration(c){ return (c.effects||[]).find(e=>e.conc); }

function addEffect(c, name, tmpl){
  tmpl=tmpl||SPELL_EFFECTS[name]||{};
  // Same-named effects don't stack (PHB: "the effects of the same spell cast multiple times
  // don't combine") — recasting refreshes the effect instead of doubling its bonuses.
  if((c.effects||[]).some(e=>e.name===name)){ c.effects=c.effects.filter(e=>e.name!==name); }
  if(tmpl.conc){ // one concentration spell at a time — drop the old one
    const old=hasConcentration(c);
    if(old){
      c.effects=c.effects.filter(e=>!e.conc);
      logChange(c,'Lost concentration on '+old.name);
      // Dismiss summons bound to the previous concentration spell
      if(typeof dismissSummonsForSpell==='function'){
        const s=battleSession();
        if(s) dismissSummonsForSpell(s, c, old.name);
      }
    }
    c.concentration={active:true, spell:name};
  }
  c.effects.push({ id:Date.now()+'-'+Math.random().toString(36).slice(2,6), name, source:name,
    rounds:(tmpl.rounds!=null?tmpl.rounds:null), conc:!!tmpl.conc, cond:tmpl.cond||null,
    mods:Object.assign({},tmpl.mods||{}), note:tmpl.note||SPELL_DESC[name]||'' });
  if(tmpl.cond){ if(!c.conditions) c.conditions={}; c.conditions[tmpl.cond]=true; }   // e.g. Invisibility → Invisible (drives attack advantage)
  if(tmpl.mods && tmpl.mods.tempHp){ c.hp.temp=Math.max(Number(c.hp.temp)||0, tmpl.mods.tempHp); } // temp HP takes the higher, doesn't stack
}

function clearItemEffect(c, e){ if(e.itemIdx!=null && c.items && c.items[e.itemIdx]){ delete c.items[e.itemIdx].magicBonus; delete c.items[e.itemIdx].magicWeaponEffect; } }

function featFreeCastSpell(c, name){
  if(!name) return false;
  if(hasFeat(c,'Fey Touched') && name==='Misty Step') return true;
  if(hasFeat(c,'Shadow Touched') && name==='Invisibility') return true;
  if(hasFeat(c,'Magic Initiate') && (c.spells||[]).some(s=>s.name===name && (s.notes||'').includes('Magic Initiate'))) return true;
  return false;
}

function wishGrantFree(name){ wishFreeName=name; }

function spellOracle(c,name,opts){ const r=rndPick(opts); logChange(c,name+' — '+r); flashBanner('🔮 '+r); }

function summonCatalogEntry(spellName){
  const h=SPELL_HANDLERS[spellName];
  const key=(h&&h.catalog)||spellName;
  return SUMMON_CATALOG[key]||null;
}

function mountUp(s, c, controllerId, mountDef, x, y, log){
  if(!s.monsters) s.monsters=[];
  const half=Math.ceil(effSpeed(c)/2);
  if(c.battle && (c.battle.move||0)<half){ flashBanner('Not enough movement left to mount (needs half your speed)'); return null; }
  const id='mount_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,5);
  const unit={ id, side:'mon', ally:true, mount:true, controllerId, riderId:controllerId, riderName:c.name,
    base:mountDef.name, name:mountDef.name, x, y, hp:mountDef.hp, max:mountDef.hp, ac:mountDef.ac,
    atk:'', attacks:0, attacksLeft:0, speed:mountDef.spd, moveLeft:mountDef.spd, fly:!!mountDef.fly, reactionUsed:false, brain:'passive', conds:[], facing:'down' };
  s.monsters.push(unit);
  c.mountedOn={id, name:mountDef.name, speed:mountDef.spd, fly:!!mountDef.fly};
  if(c.battle) c.battle.move=Math.max(0,(c.battle.move||0)-half);
  log('🐴 '+(c.name||'You')+' mounts a '+mountDef.name);
  return unit;
}

function dismountRider(c, log, opts, s){
  if(!c.mountedOn) return false;
  if(!(opts&&opts.forced)){
    const half=Math.ceil((c.mountedOn.speed||30)/2);
    if(c.battle && (c.battle.move||0)<half){ flashBanner('Not enough movement left to dismount (needs half your speed)'); return false; }
    if(c.battle) c.battle.move=Math.max(0,(c.battle.move||0)-half);
  }
  const name=c.mountedOn.name, mountId=c.mountedOn.id;
  c.mountedOn=null;
  if(s && s.monsters){ const idx=s.monsters.findIndex(m=>m.id===mountId); if(idx>=0 && s.monsters[idx].findSteed) s.monsters.splice(idx,1); }
  log((opts&&opts.forced?'🐴 Thrown from your ':'🐴 Dismounts your ')+name);
  return true;
}

function findSteedRestore(c, s, spellName){
  if(!(c.findSteedBond && c.findSteedBond.spell===spellName)) return null;
  const existing=(s.monsters||[]).find(m=>m.id===c.findSteedBond.mountId);
  if(!existing || existing.hp<=0) return null;
  existing.hp=existing.max;
  if(!c.mountedOn) c.mountedOn={id:existing.id, name:existing.name, speed:existing.speed};
  return existing;
}

function findSteedSummon(s, c, controllerId, pick, spellName, x, y, log){
  const unit=mountUp(s, c, controllerId, pick, x, y, log);
  if(!unit) return null;
  unit.findSteed=true;
  c.findSteedBond={spell:spellName, mountId:unit.id};
  return unit;
}

function summonPlaceOk(s, me, cat, x, y){
  if(!s||!s.map) return false;
  if(x<0||y<0||x>=(s.map.cols|0)||y>=(s.map.rows|0)) return false;
  const td=TERRAIN[terrainAt(s,x,y)];
  if(td&&(td.solid||td.deadly)) return false;
  const dd=DECOR[decorAt(s,x,y)]; if(dd&&dd.solid) return false;
  if((s.monsters||[]).some(m=>m.hp>0&&m.x===x&&m.y===y)) return false;
  if((s.players||[]).some(p=>p.x===x&&p.y===y)) return false;
  if(me&&cat&&cat.placeRangeTiles!=null){
    if(gridDist(me.x,me.y,x,y)>cat.placeRangeTiles) return false;
  }
  return true;
}

function nearbySpawnTiles(s, x, y, count){
  const out=[{x,y}], seen=new Set([x+','+y]);
  for(let ring=1; out.length<count && ring<6; ring++){
    for(let dx=-ring; dx<=ring && out.length<count; dx++) for(let dy=-ring; dy<=ring && out.length<count; dy++){
      if(Math.max(Math.abs(dx),Math.abs(dy))!==ring) continue;
      const nx=x+dx, ny=y+dy, key=nx+','+ny;
      if(seen.has(key)) continue; seen.add(key);
      if(nx<0||ny<0||nx>=(s.map.cols|0)||ny>=(s.map.rows|0)) continue;
      const td=TERRAIN[terrainAt(s,nx,ny)]; if(td&&(td.solid||td.deadly)) continue;
      const dd=DECOR[decorAt(s,nx,ny)]; if(dd&&dd.solid) continue;
      if((s.monsters||[]).some(m=>m.hp>0&&m.x===nx&&m.y===ny)) continue;
      if((s.players||[]).some(p=>p.x===nx&&p.y===ny)) continue;
      out.push({x:nx,y:ny});
    }
  }
  return out;
}

function spawnSummon(s, casterUnit, pick, x, y, spellName){
  if(!s||!pick) return null;
  if(!s.monsters) s.monsters=[];
  if(!s.order) s.order=[];
  const id='sum_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,5);
  const spd=pick.fly?(pick.flySpd||pick.spd||60):(pick.spd||30);
  const initBonus=pick.init||0;
  const initRoll=rnd(20)+initBonus;
  const unit={
    id, side:'mon', ally:true, summoned:true,
    controllerId:(casterUnit&&(casterUnit.id||'pc'))||'pc',
    spell:spellName||'Summon',
    conc:!!(SUMMON_CATALOG[spellName]&&SUMMON_CATALOG[spellName].conc!==false),
    base:pick.name, name:pick.name,
    x, y, hp:pick.hp, max:pick.hp, ac:pick.ac||12,
    sprite:pick.sprite||'demon', atk:pick.atk!=null?pick.atk:'Slam +5 (1d8+3)',
    // pick.attacks/pick.brain use !=null (not ||) so a deliberate 0 attacks / 'passive' brain
    // (Unseen Servant — a mindless non-combatant) isn't coerced back to the combat defaults.
    speed:spd, attacks:pick.attacks!=null?pick.attacks:1, attacksLeft:pick.attacks!=null?pick.attacks:1,
    moveLeft:spd, reactionUsed:false, brain:pick.brain||'tactical',
    fly:!!pick.fly, init:initRoll, conds:[], facing:'down'
  };
  s.monsters.push(unit);
  // Insert into initiative order (after current actor if mid-combat)
  const entry={k:'m', id:unit.id, name:unit.name, roll:initRoll, ally:true};
  const cur=s.turn|0;
  // Place after current turn so it acts later this round / next cycles
  s.order.splice(Math.min(cur+1, s.order.length), 0, entry);
  if(typeof qbLog==='function'&&s===QB) qbLog('🌀 '+unit.name+' joins the fight (init '+initRoll+')');
  if(iso3dView&&window.__iso3dHost) try{ window.__iso3dHost.impact(x,y,'cast'); }catch(e){}
  return unit;
}

function manifestEcho(s, c, x, y, controllerId, log){
  if(!s.monsters) s.monsters=[];
  const cap = isEchoKnight(c,18) ? 2 : 1;
  const mine = s.monsters.filter(m=>m.echo && m.controllerId===controllerId);
  if(mine.length>=cap) s.monsters=s.monsters.filter(m=>!(m.echo && m.controllerId===controllerId));
  const id='echo_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,5);
  const unit={ id, side:'mon', ally:true, echo:true, controllerId,
    base:'Echo', name:(c.name||'Echo')+"'s Echo", x, y,
    hp:1, max:1, ac:14+profBonus(c), atk:'', attacks:0, attacksLeft:0,
    speed:30, moveLeft:30, reactionUsed:false, brain:'passive', conds:[], facing:'down' };
  s.monsters.push(unit);
  log('👤 '+(c.name||'The Echo Knight')+' manifests an echo');
  return unit;
}

function dismissEcho(s, controllerId, log){
  if(!s||!s.monsters) return 0;
  const mine=s.monsters.filter(m=>m.echo && m.controllerId===controllerId);
  if(!mine.length) return 0;
  s.monsters=s.monsters.filter(m=>!(m.echo && m.controllerId===controllerId));
  if(log) log('👤 The echo fades away');
  return mine.length;
}

function echoMoveTiles(ad, echo){
  const out=[];
  for(let dx=-6;dx<=6;dx++) for(let dy=-6;dy<=6;dy++){
    if(Math.max(Math.abs(dx),Math.abs(dy))>6 || (dx===0&&dy===0)) continue;
    const nx=echo.x+dx, ny=echo.y+dy;
    if(tileClearFor({map:ad.map()},nx,ny)) out.push({x:nx,y:ny});
  }
  return out;
}

function dismissSummonsForSpell(s, c, spellName){
  if(!s||!s.monsters||!spellName) return 0;
  const ctrl=(s.players&&s.players[0]&&s.players[0].id)||'pc';
  let n=0;
  const keep=[];
  s.monsters.forEach(m=>{
    if(m.summoned&&m.spell===spellName&&(m.controllerId===ctrl||m.controllerId==='pc'||(c&&m.controllerId===c.id))){
      n++;
      if(typeof qbLog==='function'&&s===QB) qbLog('💨 '+m.name+' vanishes ('+spellName+' ends)');
    } else keep.push(m);
  });
  if(!n) return 0;
  s.monsters=keep;
  if(s.order){
    const deadIds=new Set(s.order.filter(o=>o.k==='m'&&!s.monsters.some(m=>m.id===o.id)).map(o=>o.id));
    // rebuild order without missing units
    s.order=s.order.filter(o=>!(o.k==='m'&&!s.monsters.some(m=>m.id===o.id)));
    if(s.turn>=s.order.length) s.turn=0;
  }
  return n;
}

function pruneDeadSummons(s){
  if(!s||!s.monsters) return;
  // Keep 0 HP summons briefly so death log shows — remove from order only
  if(s.order) s.order=s.order.filter(o=>{
    if(o.k!=='m') return true;
    const m=s.monsters.find(x=>x.id===o.id);
    return m&&m.hp>0;
  });
}

function aiKey(){ try{ return localStorage.getItem('grimoire.aikey')||''; }catch(e){ return ''; } }

function isDominated(u){ return !!(u&&u.conds&&u.conds.some(x=>x.name==='Dominated')); }

function isPartyAlly(u){ return !!(u&&(u.ally||u.summoned||isDominated(u))); }

function isHostile(u){ return !!(u&&u.hp>0&&!isPartyAlly(u)); }

function isIncapacitated(u){ const s=unitConds(u); return INCAP_CONDS.some(n=>s.has(n)) || Array.from(s).some(n=>/incapacitated/i.test(n)); }

function spellCastTime(name){ if(REACTION_SPELLS.has(name)) return 'reaction'; return BONUS_ACTION_SPELLS.has(name)?'bonus':'action'; }

function spellSeeks(name){ return false; }

function cantripTier(c){ const l=Number(c&&c.level)||1; return l>=17?4:l>=11?3:l>=5?2:1; }

function multiplyDice(notation,k){ if(!notation||k<=1) return notation; const p=parseDice(notation);
  let s=p.terms.map(t=>(t.sign<0?'-':'')+(t.n*k)+'d'+t.sides).join('+'); if(p.flat) s+=(p.flat>0?'+':'')+p.flat; return s||notation; }

function scaleCantrip(c,name,mc){ const meta=spellMeta(name); if(meta&&meta.l===0&&mc&&mc.dmg) mc.dmg=multiplyDice(mc.dmg,cantripTier(c)); return mc; }

function parseSpellMechanics(name){
  const eff=SPELL_EFFECTS[name], d=SPELL_DESC[name]||'';
  const out={attack:false, save:null, dmg:null, dtype:'', heal:null, buff:!!eff,
    conc:isConcentration(name)||!!(eff&&eff.conc), range:'', duration:''};
  if(SPELL_RANGE[name]!=null) out.range = SPELL_RANGE[name]==='Touch' ? 'Touch' : SPELL_RANGE[name]+' ft';
  else if(/\btouch\b/i.test(d)) out.range='Touch';
  else { const r=d.match(/within (\d+)\s*ft/i); if(r) out.range=r[1]+' ft'; }
  if(eff&&eff.rounds!=null) out.duration=fmtDuration(eff.rounds);
  else if(out.conc) out.duration='Concentration';
  if(eff) return out;   // self/ally buff — its dice (e.g. Bless +1d4) are described in the effect note
  // Structured mechanics win over the prose (v120.242). For a listed spell we return here and the
  // regexes below never run, so rewording a description can no longer change what the spell does.
  // Unlisted spells still fall through to prose parsing, so this migration is incremental rather
  // than a flag day — see SPELL_MECH in data.js.
  const mech=SPELL_MECH[name];
  if(mech){
    out.attack=!!mech.attack;
    out.save=mech.save||null;
    out.dmg=mech.dmg||null;
    out.dtype=mech.dtype||'';
    out.heal=mech.heal||null;
    return out;
  }
  const sv=d.match(/\b(Str|Dex|Con|Int|Wis|Cha)\s+save/i); if(sv) out.save=sv[1].toLowerCase();
  // collect EVERY dice group (Ice Storm "2d8 bludgeoning + 4d6 cold" → 2d8+4d6); type from the first typed group
  const groups=[...d.matchAll(/(\d+d\d+(?:\s*\+\s*\d+)?)\s*([a-z]+)?/gi)];
  if(groups.length){ const dice=groups.map(g=>g[1].replace(/\s+/g,'')).join('+');
    if(/\b(heal|heals|restore|restores|regain|temporary)\b/i.test(d)) out.heal=dice; else out.dmg=dice;
    for(const g of groups){ const word=(g[2]||'').toLowerCase(); if(DMG_TYPES.includes(word)){ out.dtype=word; break; } } }
  // A flat (non-dice) heal amount — Heal "Restore 70 HP", Mass Heal "Distribute 700 HP" —
  // still deserves the same roll-helper treatment castModal already gives Cure Wounds; a
  // flat number is valid rollNotation input (parseDice treats it as a constant, no dice).
  // Excludes Goodberry — its "1 HP" is per-berry, not a one-shot total; it gets its own
  // bespoke consumable-counter handling in castSpell instead (see castGoodberry).
  else if(name!=='Goodberry' && /\b(heal|heals|healing|restore|restores|regain)\b/i.test(d)){
    const flat=d.match(/\b(\d+)\s*(?:hp|hit points?)\b/i);
    if(flat) out.heal=flat[1];
  }
  if(!out.save && !out.heal && /\b(ranged|melee|spell attack|attack roll|beam|ray|rays|bolt)\b/i.test(d)) out.attack=true;
  // Explicit damage-type override, for spells whose prose never puts the type next to the dice —
  // an empty dtype silently disables resist/vuln/immunity for that spell (see SPELL_DTYPE).
  // NOTE: this MUST stay below the if/else-if chain above. Putting it between `if(groups.length)`
  // and the `else if` flat-heal branch re-parented that `else` onto this statement, so Regenerate
  // ("Restore 4d8+15 HP") had its correct 4d8+15 heal overwritten by the flat 15. Caught by the
  // existing Regenerate test — the exact "statement swept into the wrong block" failure the
  // modularization note in CLAUDE.md warns about.
  if(out.dmg && SPELL_DTYPE[name]) out.dtype=SPELL_DTYPE[name];
  return out;
}

function effectsCard(c){
  const fx=c.effects||[];
  return `<div class="card">
    <h2>Active Effects ${fx.length?`<span class="muted" style="text-transform:none;font-size:11px">— ${fx.length} active</span>`:''}
      <span style="float:right;display:inline-flex;gap:6px">
        ${fx.some(e=>e.rounds!=null)?`<button class="btn ghost sm" id="advRound">▶ Advance round</button>`:''}
        <button class="btn ghost sm" id="fxOpen">＋ Add</button>
      </span></h2>
    ${fx.length? fx.map(e=>`<div class="spell">
        <span style="font-size:18px;flex:none">${spellIcon(e.name)}</span>
        <div class="nm"><b>${esc(e.name)}</b><small>${[e.conc?'🧠 Concentration':'', fmtDuration(e.rounds), modSummary(e.mods)].filter(Boolean).join(' · ')}${e.note?'<br>'+esc(e.note):''}</small></div>
        <button class="del" data-endfx="${e.id}" title="End effect">✕</button>
      </div>`).join('')
      : '<div class="empty">No active effects. Tap ＋ Add to track a buff (e.g. an ally\'s Haste), or cast one from the Spells tab.</div>'}
  </div>`;
}

function classSpells(c, maxLevel){
  const lt=CLASS_LETTER[c.cls]; if(!lt) return [];
  return SPELLS.filter(s=> s.c.includes(lt) && (maxLevel==null || s.l<=maxLevel));
}

function maxSpellLevel(c){ // highest spell level castable at this class level (PHB tables)
  const lvl=myLevel(c);
  // half casters: 1st at L2 (Artificer L1), 2nd at 5, 3rd at 9, 4th at 13, 5th at 17
  if(c.cls==='Paladin'||c.cls==='Ranger'||c.cls==='Artificer') return Math.min(5, Math.max(1, Math.ceil(lvl/4)));
  if(c.cls==='Warlock') return Math.min(5, Math.ceil(lvl/2));
  return Math.min(9, Math.ceil(lvl/2)); // full casters
}

function warlockSlots(lvl){ return [ lvl>=17?4:lvl>=11?3:lvl>=2?2:1, lvl>=9?5:lvl>=7?4:lvl>=5?3:lvl>=3?2:1 ]; }

function spellSlots(c){
  const out={1:0,2:0,3:0,4:0,5:0,6:0,7:0,8:0,9:0};
  const classes=(c.classes&&c.classes.length)?c.classes:[{cls:c.cls, level:c.level}];
  if(classes.length<=1){
    const lvl=Math.max(1,Math.min(20,Number(c.level)||1));
    if(c.cls==='Warlock'){ const w=warlockSlots(lvl); out[w[1]]=w[0]; return out; }
    let table=null;
    if(FULL_CASTER_CLASSES.includes(c.cls)) table=SLOTS_FULL;
    else if(['Paladin','Ranger'].includes(c.cls)) table=SLOTS_HALF;
    else if(c.cls==='Artificer') table=SLOTS_ARTI;
    if(table) (table[lvl]||[]).forEach((n,i)=>{ out[i+1]=n; });
    return out;
  }
  // Multiclass Spellcaster table (PHB): sum full-caster levels in full, half-caster levels
  // (Paladin/Ranger/Artificer) rounded down by half, then look up the SAME SLOTS_FULL table
  // by that combined caster level — the multiclass rules reuse the full-caster progression on
  // purpose, it isn't a separate table. Warlock's Pact Magic is never combined into this sum;
  // its own slots are computed separately and layered on top of whatever's already at that
  // spell level (this app doesn't track pact slots as a separate short-rest-recovering pool
  // even for a solo Warlock — see warlockSlots' sole call site above — so this is consistent,
  // not a new gap introduced by multiclassing).
  let casterLevel=0;
  classes.forEach(e=>{
    const lvl=Number(e.level)||0;
    if(FULL_CASTER_CLASSES.includes(e.cls)) casterLevel+=lvl;
    else if(HALF_CASTER_CLASSES.includes(e.cls)) casterLevel+=Math.floor(lvl/2);
  });
  casterLevel=Math.max(0,Math.min(20,casterLevel));
  (SLOTS_FULL[casterLevel]||[]).forEach((n,i)=>{ out[i+1]=n; });
  const wlvl=classLevel(c,'Warlock');
  if(wlvl>0){ const w=warlockSlots(wlvl); out[w[1]]=(out[w[1]]||0)+w[0]; }
  return out;
}

function spellLearnSelect(c, atLevel, mode){   // mode: 'leveled' (no cantrips) | 'cantrips' | undefined (all)
  const known=new Set(c.spells.map(s=>s.name.toLowerCase()));
  const max=maxSpellLevel({cls:c.cls, level:atLevel});
  const levels=[0,1,2,3,4,5,6,7,8,9].filter(l=>l<=max).filter(l=> mode==='cantrips'?l===0 : mode==='leveled'?l>=1 : true);
  const opts=levels.map(l=>{
    const list=classSpells(c).filter(s=>s.l===l && !known.has(s.n.toLowerCase()));
    if(!list.length) return '';
    return `<optgroup label="${l===0?'Cantrips':'Level '+l}">`+list.map(s=>`<option value="${esc(s.n)}|${s.l}">${SCHOOL_ICON[s.s]} ${esc(s.n)}</option>`).join('')+`</optgroup>`;
  }).join('');
  const id = mode==='cantrips' ? 'luCantrip' : 'luSpell';
  return `<select id="${id}" style="flex:2"><option value="">— pick a ${mode==='cantrips'?'cantrip':'spell'} —</option>${opts}</select>`;
}

function featSkillBonus(c){ let n=0; (c.feats||[]).forEach(f=>{ (FEAT_GRANTS[f.name||f]||[]).forEach(g=>{ if(g.t==='skill') n+=g.n; }); }); return n; }

function hasFeat(c,name){ return (c.feats||[]).some(f=>(f.name||f)===name); }

function hasRacialTrait(c,name){ return !!(c && (RACE_TRAITS[c.race]||[]).some(t=>t[0]===name)); }

function luckPointsMax(c){ return hasFeat(c,'Lucky')?3:0; }

function luckPointsLeft(c){ return Math.max(0, luckPointsMax(c)-(Number(c&&c.luckUsed)||0)); }

function spendLuckPoint(c){
  if(!c || luckPointsLeft(c)<=0) return false;
  c.luckUsed=(c.luckUsed||0)+1;
  logChange(c, 'Lucky: spent a luck point ('+luckPointsLeft(c)+' left today)');
  save(); return true;
}

function featInitBonus(c){ return hasFeat(c,'Alert')?5:0; }   // Alert: +5 to initiative

function passiveBonus(c,key){ return (hasFeat(c,'Observant')&&(key==='perception'||key==='investigation'))?5:0; }

function passiveScore(c,key,ab){ return 10+skillBonus(c,key,ab,true)+passiveBonus(c,key); }

function initiative(c){ const joat=(c.cls==='Bard'&&myLevel(c)>=2)?Math.floor(profBonus(c)/2):0;
  return mod(abil(c,'dex'))+Number(c.initMisc||0)+featInitBonus(c)+joat; }

function skillBudget(c){ return (CLASS_SKILLS_N[c.cls]||2) + 2 + featSkillBonus(c); }

function skillCount(c){ return SKILLS.filter(([k])=>c.skillProf[k]).length; }

function autoHP(c){
  // Single-class fast path reads the LIVE c.cls/c.level directly (never c.classes[0], which can
  // go stale relative to a directly-mutated c.level — see classLevel's doc comment).
  const classes=(c.classes && c.classes.length>1) ? c.classes : [{cls:c.cls, level:c.level}];
  if(!classes.some(e=>CLASS_HITDIE[e.cls])) return null;
  const con=mod(abil(c,'con'));
  // Max die on the very first level of your very first class, average+CON every level after —
  // "after" includes the FIRST level of any class taken later via multiclassing, not just your
  // own class's 2nd level onward (RAW: only character level 1 ever gets the max-die roll).
  let total=0, first=true;
  classes.forEach(e=>{
    const hd=CLASS_HITDIE[e.cls]; if(!hd) return;
    const avg=Math.floor(hd/2)+1;
    for(let i=0;i<(Number(e.level)||0);i++){
      total += first ? (hd+con) : (avg+con);
      first=false;
    }
  });
  return Math.max(1, total);
}

function load(){
  try{ const v = JSON.parse(localStorage.getItem(LS_KEY)); return Array.isArray(v)?v.map(ensureFields):[]; }
  catch(e){ return []; }
}

function save(){ localStorage.setItem(LS_KEY, JSON.stringify(DB)); }

function uid(){ return Date.now().toString(36)+Math.random().toString(36).slice(2,6); }

function newCharacter(name){
  const slots = {};
  for(let i=1;i<=9;i++) slots[i] = {total:0, used:0};
  return {
    id: uid(),
    name: name || 'New Adventurer',
    race:'', cls:'Fighter', subclass:'', level:1, classes:[{cls:'Fighter', level:1, subclass:''}], background:'', alignment:'—', xp:0,
    inspiration:false,
    abilMethod:'pointbuy',
    abilities:{str:8,dex:8,con:8,int:8,wis:8,cha:8},
    asiBonus:{str:0,dex:0,con:0,int:0,wis:0,cha:0},
    feats:[],
    saveProf:{str:true,dex:false,con:true,int:false,wis:false,cha:false},
    skillProf:{}, skillExp:{},
    ac:10, armor:'none', shield:false, acOverride:'', speed:30, initMisc:0, profOverride:'',
    hp:{max:8,cur:8,temp:0},
    hitDice:{total:'1d10', used:0},
    death:{succ:0, fail:0},
    attacks:[],
    spellAbility:'int', spells:[], slots,
    items:[], currency:{cp:0,sp:0,ep:0,gp:0,pp:0},
    conditions:{}, exhaustion:0, concentration:{active:false, spell:''},
    effects:[],
    features:'', notes:'', log:[]
  };
}

function logChange(c, msg){ if(!c) return; c.log=c.log||[]; c.log.unshift({t:Date.now(), m:msg}); if(c.log.length>250) c.log.pop(); save(); }

function ensureFields(c){
  if(!c || typeof c!=='object') return c;
  if(!c.id) c.id=uid();
  if(c.name==null) c.name='Adventurer';
  if(!c.cls) c.cls='Fighter';
  if(c.level==null) c.level=1;
  if(!c.classes || !c.classes.length) c.classes=[{cls:c.cls, level:c.level, subclass:c.subclass||''}];
  syncPrimaryClass(c);
  if(c.race==null) c.race=''; if(c.subclass==null) c.subclass=''; if(c.background==null) c.background='';
  if(c.xp==null) c.xp=0;
  if(!c.ownedMounts) c.ownedMounts=[];
  if(c.altitude==null) c.altitude=0;
  if(!c.abilities) c.abilities={str:10,dex:10,con:10,int:10,wis:10,cha:10};
  if(!c.conditions) c.conditions={};
  if(c.exhaustion==null) c.exhaustion=0;
  if(!c.concentration) c.concentration={active:false, spell:''};
  if(!c.abilMethod) c.abilMethod='manual';   // keep existing characters' scores as-is
  if(!c.asiBonus) c.asiBonus={str:0,dex:0,con:0,int:0,wis:0,cha:0};
  if(!c.feats) c.feats=[];
  if(!c.skillProf) c.skillProf={}; if(!c.skillExp) c.skillExp={};
  if(!c.saveProf) c.saveProf={str:false,dex:false,con:false,int:false,wis:false,cha:false};
  if(c.armor==null){ c.armor='none'; c.shield=!!c.shield; c.acOverride=(c.ac!=null?c.ac:''); }   // keep old AC as override
  if(c.acOverride===undefined) c.acOverride='';
  if(c.speed==null) c.speed=30; if(c.initMisc==null) c.initMisc=0; if(c.profOverride==null) c.profOverride='';
  if(!c.hp) c.hp={max:8,cur:8,temp:0}; if(c.hp.temp==null) c.hp.temp=0;
  if(!c.hitDice) c.hitDice={total:(Number(c.level)||1)+'d8', used:0};
  if(!c.death) c.death={succ:0, fail:0};
  if(!c.attacks) c.attacks=[];
  if(!c.spellAbility) c.spellAbility=CLASS_SPELL_ABILITY[c.cls]||'int';
  if(!c.spells) c.spells=[];
  if(!c.slots){ c.slots={}; for(let i=1;i<=9;i++) c.slots[i]={total:0,used:0}; }
  if(!c.items) c.items=[];
  if(!c.currency) c.currency={cp:0,sp:0,ep:0,gp:0,pp:0};
  if(c.features==null) c.features=''; if(c.notes==null) c.notes='';
  if(!c.log) c.log=[];
  if(c.portrait===undefined) c.portrait='';
  if(!c.effects) c.effects=[];
  if(Array.isArray(c.items)) c.items.forEach(it=>{ if(it && !it.kind) it.kind='gear'; });
  oathSpellNames(c).forEach(name=>{ if(!c.spells.some(s=>s.name.toLowerCase()===name.toLowerCase())){ const m=spellMeta(name); c.spells.push({name, level:m?m.l:0, prepared:true, oathSpell:true}); } });
  return c;
}

function cur(){ return DB.find(c=>c.id===curId) || null; }

function parseDice(notation){
  const terms=[]; let flat=0;
  const s=String(notation||'').replace(/\s+/g,'').toLowerCase();
  const re=/([+-]?)(\d*)d(\d+)|([+-]?\d+)/g; let m;
  while((m=re.exec(s))){
    if(m[3]){ terms.push({n:Number(m[2]||1), sides:Number(m[3]), sign:m[1]==='-'?-1:1}); }
    else if(m[4]!=null && m[4]!==''){ flat+=Number(m[4]); }
  }
  return {terms, flat};
}

function rollNotation(notation){
  const {terms,flat}=parseDice(notation);
  let total=flat; const parts=[];
  terms.forEach(t=>{
    const rolls=[]; for(let i=0;i<t.n;i++){ const r=rnd(t.sides); rolls.push(r); total+=r*t.sign; }
    parts.push((t.sign<0?'−':'')+t.n+'d'+t.sides+' ['+rolls.join(',')+']');
  });
  if(flat) parts.push((flat>0?'+':'−')+Math.abs(flat));
  if(!terms.length && !flat) return null;
  return {total, detail:parts.join(' ')};
}

function rollCheck(label, bonus, mode){
  bonus=Number(bonus)||0;
  const r1=rnd(20), r2=rnd(20);
  let kept=r1, dropped=null;
  if(mode==='adv'){ kept=Math.max(r1,r2); dropped=Math.min(r1,r2); }
  else if(mode==='dis'){ kept=Math.min(r1,r2); dropped=Math.max(r1,r2); }
  const total=kept+bonus;
  const crit = kept===20?'crit':kept===1?'fumble':null;
  const btxt = bonus? (bonus>0?' +'+bonus:' −'+Math.abs(bonus)) : '';
  const detail = `d20${mode==='adv'?' adv':mode==='dis'?' dis':''} ${dropped!=null?`(<s>${dropped}</s> ${kept})`:`(${kept})`}${btxt}`;
  pushRoll({label, total, detail, crit, kind:'check', bonus});
}

function maxNotation(notation){   // Supreme Healing (Life Domain 17th): every healing die is maximized instead of rolled
  const {terms,flat}=parseDice(notation);
  let total=flat; terms.forEach(t=>{ total+=t.n*t.sides*t.sign; });
  return total;
}

function rollDmg(label, notation){
  const res=rollNotation(notation); if(!res) return;
  pushRoll({label, total:res.total, detail:res.detail, kind:'dmg', notation});
}

function pushRoll(r){
  r.id=uid(); r.ts=Date.now();
  rollLog.unshift(r); if(rollLog.length>40) rollLog.pop();
  lastRoll=r;
  showRollBanner(r);
  renderDiceLog();
  if(r.kind==='check'||r.kind==='dmg'){ const c=cur(); if(c){ const det=String(r.detail||'').replace(/<[^>]+>/g,''); logChange(c, '🎲 '+r.label+' = '+r.total+(det?' ['+det+']':'')+(r.crit==='crit'?' — CRIT!':r.crit==='fumble'?' — nat 1':'')); } }
}

function audioCtx(){
  if(_ac && _ac.state==='closed') _ac=null;   // browsers reclaim contexts mid-session — rebuild
  if(!_ac){ try{ _ac=new (window.AudioContext||window.webkitAudioContext)(); }catch(e){ return null; } }
  if(_ac.state!=='running'){ try{ _ac.resume(); }catch(e){} }   // 'suspended' + iOS 'interrupted'
  return _ac; }

function tone(freq,dur,type,vol,when){ const a=audioCtx(); if(!a) return; try{ const t=a.currentTime+(when||0);
  const o=a.createOscillator(), g=a.createGain(); o.type=type||'sine'; o.frequency.setValueAtTime(freq,t);
  g.gain.setValueAtTime(0,t); g.gain.linearRampToValueAtTime(vol||0.18,t+0.012); g.gain.exponentialRampToValueAtTime(0.0008,t+dur);
  o.connect(g).connect(a.destination); o.start(t); o.stop(t+dur+0.03); }catch(e){} }

function noiseBuf(){ const a=audioCtx(); if(!a) return null; if(_noiseBuf) return _noiseBuf;
  const n=a.sampleRate*0.35; const b=a.createBuffer(1,n,a.sampleRate); const d=b.getChannelData(0);
  for(let i=0;i<n;i++) d[i]=(Math.random()*2-1)*Math.pow(1-i/n,0.4); _noiseBuf=b; return b; }

function noiseBurst(dur,vol,when,hpFreq){ const a=audioCtx(); if(!a) return; try{
  const t=a.currentTime+(when||0); const b=noiseBuf(); if(!b) return;
  const src=a.createBufferSource(); src.buffer=b;
  const g=a.createGain(), f=a.createBiquadFilter(); f.type='bandpass'; f.frequency.value=hpFreq||900; f.Q.value=0.7;
  g.gain.setValueAtTime(0,t); g.gain.linearRampToValueAtTime(vol||0.22,t+0.01); g.gain.exponentialRampToValueAtTime(0.0008,t+dur);
  src.connect(f).connect(g).connect(a.destination); src.start(t); src.stop(t+dur+0.02); }catch(e){} }

function sfx(kind){ if(!soundOn) return; switch(kind){
  case 'click': tone(430,0.05,'triangle',0.10); break;
  case 'tab': tone(540,0.06,'triangle',0.10); break;
  case 'toggle': tone(360,0.05,'square',0.07); break;
  case 'roll': tone(280,0.05,'sawtooth',0.09); tone(620,0.08,'sawtooth',0.07,0.05); break;
  case 'cast': tone(330,0.1,'sine',0.14); tone(495,0.14,'sine',0.12,0.06); tone(740,0.2,'triangle',0.1,0.12); noiseBurst(0.12,0.06,0.02,1200); break;
  case 'heal': tone(523,0.12,'sine',0.15); tone(784,0.20,'sine',0.12,0.1); break;
  case 'damage': tone(160,0.1,'square',0.14); tone(90,0.16,'sawtooth',0.1,0.04); noiseBurst(0.1,0.1,0,400); break;
  case 'success': tone(660,0.1,'triangle',0.15); tone(880,0.16,'triangle',0.12,0.08); break;
  case 'error': tone(170,0.18,'square',0.13); break;
  case 'swing': noiseBurst(0.08,0.08,0,1800); tone(520,0.07,'sawtooth',0.08); tone(220,0.09,'sawtooth',0.07,0.04); break;
  case 'hit': noiseBurst(0.07,0.14,0,600); tone(120,0.09,'square',0.16); tone(70,0.14,'square',0.12,0.03); break;
  case 'crit': noiseBurst(0.12,0.18,0,500); tone(160,0.1,'square',0.18); tone(100,0.16,'square',0.14,0.04); tone(980,0.16,'triangle',0.12,0.1); break;
  case 'miss': tone(640,0.05,'triangle',0.06); tone(400,0.08,'triangle',0.05,0.04); noiseBurst(0.06,0.04,0,2200); break;
  case 'firebolt': tone(280,0.08,'sawtooth',0.1); tone(520,0.12,'sawtooth',0.08,0.03); noiseBurst(0.14,0.1,0,1400); tone(180,0.1,'square',0.08,0.12); break;
  case 'arrow': tone(900,0.04,'triangle',0.08); tone(600,0.06,'triangle',0.06,0.03); noiseBurst(0.05,0.05,0,2500); break;
  case 'fireball': noiseBurst(0.28,0.28,0,350); tone(90,0.2,'sawtooth',0.14); tone(60,0.28,'square',0.1,0.04); tone(220,0.12,'sawtooth',0.08,0.08); break;
  case 'boom': noiseBurst(0.22,0.24,0,280); tone(70,0.18,'square',0.16); break;
}}

function attackFx(kind, col, row){
  if(iso3dView&&window.__iso3dHost){
    try{
      if(col!=null&&row!=null) window.__iso3dHost.impact(col,row, kind==='crit'?'crit':kind==='miss'?'miss':'hit');
      else if(QB&&QB.players&&QB.players[0]) window.__iso3dHost.impact(QB.players[0].x, QB.players[0].y, kind==='crit'?'crit':kind==='miss'?'miss':'hit');
    }catch(e){}
    return;
  }
  // Lightweight corner flash (not full-screen "castfx")
  const el=document.createElement('div'); el.className='hitfx';
  el.dataset.k=kind||'hit'; document.body.appendChild(el); setTimeout(()=>el.remove(),480);
}

function cellCenter(grid,x,y){ const cell=grid.querySelector('[data-cell="'+x+','+y+'"]'); if(!cell) return null; const g=grid.getBoundingClientRect(), c=cell.getBoundingClientRect(); return {x:c.left-g.left+c.width/2, y:c.top-g.top+c.height/2}; }

function scrollMapIntoView(wrap){ try{ wrap.scrollIntoView({behavior:'smooth', block:'center'}); }catch(e){} }

function mapProjectile(fx,fy,tx,ty,glyphOrKind,dtype){
  let kind='bolt';
  const g=String(glyphOrKind||'');
  if(g==='firebolt'||g==='arrow'||g==='bolt'||g==='slash'||g==='magic') kind=g;
  else if(/🔥|fire/i.test(g+(dtype||''))) kind='firebolt';
  else if(/➶|arrow|bow/i.test(g+(dtype||''))) kind='arrow';
  else if(/⚔️|slash/i.test(g)) kind='slash';
  if(iso3dView&&window.__iso3dHost){
    try{ window.__iso3dHost.shoot(fx,fy,tx,ty,{kind, dtype:dtype||(kind==='firebolt'?'fire':'')}); }catch(e){}
    return;
  }
  const grid=curMapGrid(); if(!grid) return; const a=cellCenter(grid,fx,fy), b=cellCenter(grid,tx,ty); if(!a||!b) return;
  const wrap=grid.parentElement; if(getComputedStyle(wrap).position==='static') wrap.style.position='relative';
  scrollMapIntoView(wrap);
  const p=document.createElement('div'); p.className='mfx-proj mfx-'+kind;
  p.textContent=kind==='arrow'?'➤':kind==='firebolt'?'●':(glyphOrKind&&glyphOrKind.length<=2?glyphOrKind:'✦');
  p.style.left=a.x+'px'; p.style.top=a.y+'px';
  const ang=Math.atan2(b.y-a.y,b.x-a.x)*180/Math.PI; p.style.setProperty('--rot',ang+'deg'); wrap.appendChild(p);
  requestAnimationFrame(()=>{ p.style.left=b.x+'px'; p.style.top=b.y+'px'; }); setTimeout(()=>p.remove(),420);
}

function mapBurst(cx,cy,radius,kind){
  kind=kind||'fire';
  if(iso3dView&&window.__iso3dHost){
    try{ window.__iso3dHost.explode(cx,cy,radius||4,kind); }catch(e){}
    sfx(kind==='fire'?'fireball':'boom');
    return;
  }
  const grid=curMapGrid(); if(!grid) return; const c=cellCenter(grid,cx,cy); if(!c) return;
  const wrap=grid.parentElement; if(getComputedStyle(wrap).position==='static') wrap.style.position='relative';
  scrollMapIntoView(wrap);
  const sz=((radius||1)*2+1)*40; const b=document.createElement('div'); b.className='mfx-burst';
  b.style.width=b.style.height=sz+'px'; b.style.left=c.x+'px'; b.style.top=c.y+'px'; wrap.appendChild(b);
  setTimeout(()=>b.remove(),700); sfx(kind==='fire'?'fireball':'boom');
}

function playClickSound(target){
  const el=target.closest && target.closest('button, .pip, .chip, [data-tab], .diebtn, [data-collapse], label.pill');
  if(!el) return;
  if(el.id==='castGo') return;                       // castSpell() plays its own 'cast'
  if(el.id==='healBtn'){ sfx('heal'); return; }
  if(el.id==='dmgBtn'){ sfx('damage'); return; }
  if(el.hasAttribute&&(el.hasAttribute('data-rollcheck')||el.hasAttribute('data-rolldmg'))||el.classList.contains('diebtn')){ sfx('roll'); return; }
  if(el.matches('[data-tab]')){ sfx('tab'); return; }
  sfx('click');
}

function castFx(name){
  // Small local flash only — no full-screen emoji takeover
  if(iso3dView&&window.__iso3dHost&&QB&&QB.players&&QB.players[0]){
    try{ window.__iso3dHost.floatText(QB.players[0].x,QB.players[0].y, spellIcon(name)||'✦', '#c9f'); }catch(e){}
    return;
  }
  const el=document.createElement('div'); el.className='hitfx castmini';
  el.textContent=spellMeta(name)?spellIcon(name):'✨'; document.body.appendChild(el); setTimeout(()=>el.remove(),520);
}

function chev(k){ return `<button class="chev" data-collapse="${k}" title="Collapse / expand" style="transform:rotate(${collapsed[k]?'-90':'0'}deg)">▾</button>`; }

function searchProviders(c){
  const str=abil(c,'str'), pb=profBonus(c), sm=mod(abil(c,c.spellAbility));
  const list=[
    {k:['speed','move','movement','run','running','walk','walking','distance','travel','foot'], t:'Movement Speed', v:()=>effSpeed(c)+' ft', n:()=>'Your speed each turn. Dashing (an action) doubles it to '+(effSpeed(c)*2)+' ft.'+((effBonus(c,'speed')||effSpeedMul(c)!==1)?' Includes active effects.':''), bd:'speed'},
    {k:['dash','sprint','max movement','max distance','full move','furthest'], t:'Dash — max distance', v:()=>(effSpeed(c)*2)+' ft', n:()=>'Use your action to Dash and you can move '+(effSpeed(c)*2)+' ft this turn (double your '+effSpeed(c)+'-ft speed).'},
    {k:['long jump','jump distance','broad jump','leap'], t:'Long Jump', v:()=>str+' ft', n:()=>'With a 10-ft running start you clear up to your STR score = '+str+' ft. A standing long jump is half: '+Math.floor(str/2)+' ft.'},
    {k:['high jump','jump height','vertical jump','how high'], t:'High Jump', v:()=>Math.max(0,3+mod(abil(c,'str')))+' ft', n:()=>'3 + STR modifier = '+Math.max(0,3+mod(abil(c,'str')))+' ft up (running start); half if standing. You can reach about that + 1.5× your height above you.'},
    {k:['jump'], t:'Jumping', v:()=>str+' ft long', n:()=>'Long jump: STR score ('+str+' ft) with a run-up. High jump: 3 + STR mod ('+Math.max(0,3+mod(abil(c,'str')))+' ft). Half each without a running start.'},
    {k:['carry','carrying','capacity','lift','push','drag','encumbrance','weight','heavy'], t:'Carrying Capacity', v:()=>(str*15)+' lb', n:()=>'Carry up to STR×15 = '+(str*15)+' lb. You can push, drag or lift up to STR×30 = '+(str*30)+' lb (your speed drops to 5 ft while doing so).'},
    {k:['armor class','ac','defense','defence','armour'], t:'Armor Class', v:()=>computeAC(c), n:()=>'Tap ⓘ for the full breakdown.', bd:'ac'},
    {k:['initiative','init','turn order'], t:'Initiative', v:()=>sgn(initiative(c)), bd:'init'},
    {k:['hp','hit points','health','wounds','life'], t:'Hit Points', v:()=>c.hp.cur+' / '+c.hp.max+(c.hp.temp?' (+'+c.hp.temp+' temp)':''), n:()=>'Current / maximum HP.'},
    {k:['hit dice','hit die','short rest healing'], t:'Hit Dice', v:()=>{const hd=parseHitDice(c); return hd?(Math.max(0,hd.count-(c.hitDice.used||0))+' / '+hd.count+' · d'+hd.sides):'—';}, n:()=>'Spend on a short rest to heal (roll + CON each).'},
    {k:['proficiency','prof bonus','proficiency bonus'], t:'Proficiency Bonus', v:()=>sgn(pb), bd:'prof'},
    {k:['passive perception','passive','perception passive','awareness','notice','spot'], t:'Passive Perception', v:()=>passiveScore(c,'perception','wis'), n:()=>'10 + Perception, used without rolling. The DM compares hidden creatures’ Stealth to it.', bd:'passive:perception:wis'},
    {k:['passive investigation','search passive'], t:'Passive Investigation', v:()=>passiveScore(c,'investigation','int'), bd:'passive:investigation:int'},
    {k:['spell dc','save dc','spell save','spell save dc'], t:'Spell Save DC', v:()=>8+pb+sm, n:()=>'Enemies roll their save against this number.', bd:'spelldc'},
    {k:['spell attack','spell atk','to hit spell'], t:'Spell Attack Bonus', v:()=>sgn(pb+sm), bd:'spellatk'},
    {k:['level','character level'], t:'Level', v:()=>c.level+' '+esc(c.cls)},
  ];
  ABILITIES.forEach(([k,nm])=>list.push({k:[nm.toLowerCase(), k, nm.toLowerCase()+' modifier', nm.toLowerCase()+' score'], t:nm, v:()=>abil(c,k)+' ('+sgn(mod(abil(c,k)))+')', bd:'abil:'+k}));
  SKILLS.forEach(([key,nm,ab])=>list.push({k:[nm.toLowerCase(), key], t:nm+' (skill)', v:()=>sgn(skillBonus(c,key,ab,true)), bd:'skill:'+key+':'+ab}));
  return list;
}

function searchResults(c, q){
  q=(q||'').trim().toLowerCase(); if(!q) return '<div class="empty">Type to search your stats, rules, spells, feats…</div>';
  const hits=searchProviders(c).filter(p=>p.k.some(key=>key.includes(q)||q.includes(key)));
  let html='';
  hits.slice(0,14).forEach(p=>{ html+=`<div class="card" style="margin:0 0 8px;padding:12px"><div class="row between" style="align-items:flex-start"><div><div class="muted" style="font-size:11px;text-transform:uppercase;letter-spacing:.05em">${esc(p.t)}</div><div style="font-family:Georgia,serif;font-size:22px;font-weight:700;color:var(--accent)">${p.v()}</div></div>${p.bd?bd(p.bd):''}</div>${p.n?`<p class="muted" style="font-size:12.5px;margin:6px 0 0">${p.n()}</p>`:''}</div>`; });
  const refs=[];
  SPELLS.forEach(s=>{ if(s.n.toLowerCase().includes(q)) refs.push({n:s.n,t:'Spell',a:'data-spellinfo'}); });
  FEATS.forEach(f=>{ if(f.toLowerCase().includes(q)) refs.push({n:f,t:'Feat',a:'data-featinfo'}); });
  if(refs.length){ html+=`<div class="muted" style="font-size:11px;text-transform:uppercase;letter-spacing:.05em;margin:8px 0 4px">Reference</div>`+
    refs.slice(0,24).map(r=>`<div class="listrow"><div class="nm">${esc(r.n)} <span class="sub">${r.t}</span></div><button class="del" ${r.a}="${esc(r.n)}" title="Info">ⓘ</button></div>`).join(''); }
  if(!hits.length && !refs.length) return '<div class="empty">No matches. Try “run speed”, “jump height”, “carry capacity”, “AC”, a skill or a spell name.</div>';
  return html;
}

function profBonus(c){
  if(c.profOverride!=='' && c.profOverride!=null && !isNaN(c.profOverride)) return Number(c.profOverride);
  return Math.ceil(Number(c.level||1)/4)+1;
}

function saveMod(c,ability){ return mod(abil(c,ability)) + (c.saveProf&&c.saveProf[ability]?profBonus(c):0) + gearBonus(c,'save') + effBonus(c,'save'); }

function skillBonus(c, key, ab, exp){
  let b = mod(abil(c, ab));
  const pb = profBonus(c);
  if(c.skillProf[key]) b += pb;
  else if(c.cls==='Bard' && myLevel(c)>=2) b += Math.floor(pb/2);   // Jack of All Trades: ½ prof on non-proficient checks
  if(exp && c.skillExp[key]) b += pb;
  return b;
}

function abilFullName(k){ return (ABILITIES.find(x=>x[0]===k)||['',k])[1]; }

function abilScoreLines(c,k){
  const L=[]; const base=Number(c.abilities[k]);
  L.push({l:'Base score', v:isNaN(base)?10:base, raw:true});
  const rb=raceBonus(c,k); if(rb) L.push({l:'Racial bonus · '+(c.race||'race'), v:rb});
  const as=(c.asiBonus&&c.asiBonus[k])||0; if(as) L.push({l:'ASI & feat increases', v:as});
  const gb=gearBonus(c,k); if(gb) L.push({l:'Equipment', v:gb});
  const eb=effBonus(c,k); if(eb) L.push({l:'Active spell effects', v:eb});
  return L;
}

function statBreakdown(c, spec){
  const A=abilFullName, pb=profBonus(c), parts=spec.split(':'), t=parts[0], a=parts[1], b=parts[2];
  let title='', lines=[], total=0, raw=false, note='';
  if(t==='abil'){ title=A(a)+' Score'; lines=abilScoreLines(c,a); total=abil(c,a); raw=true; note='Ability modifier '+sgn(mod(total)); }
  else if(t==='save'){ title=A(a)+' Saving Throw'; lines=[{l:A(a)+' modifier', v:mod(abil(c,a))}]; if(c.saveProf[a]) lines.push({l:'Proficiency · '+(c.cls||'class'), v:pb}); const gbv=gearBonus(c,'save'); if(gbv) lines.push({l:'Equipment', v:gbv}); const ebv=effBonus(c,'save'); if(ebv) lines.push({l:'Active spell effects', v:ebv}); total=saveMod(c,a); }
  else if(t==='skill'){ const nm=(SKILLS.find(s=>s[0]===a)||['',a])[1]; title=nm+' Skill'; lines=[{l:A(b)+' modifier', v:mod(abil(c,b))}]; if(c.skillProf[a]) lines.push({l:'Proficiency', v:pb}); if(c.skillExp[a]) lines.push({l:'Expertise (double prof.)', v:pb}); total=skillBonus(c,a,b,true); }
  else if(t==='init'){ title='Initiative'; lines=[{l:'DEX modifier', v:mod(abil(c,'dex'))}]; if(Number(c.initMisc)) lines.push({l:'Misc bonus', v:Number(c.initMisc)}); if(featInitBonus(c)) lines.push({l:'Alert feat', v:5}); total=initiative(c); }
  else if(t==='ac'){ title='Armor Class';
    if(c.acOverride!=='' && c.acOverride!=null && !isNaN(c.acOverride)){ lines=[{l:'Custom AC', v:Number(c.acOverride), raw:true}]; }
    else { const ar=armorDef(c.armor||'none'); lines=[{l:'Armor base · '+ar.name, v:ar.base, raw:true}]; const dx=Math.min(mod(abil(c,'dex')), ar.dexCap); if(ar.dexCap>0) lines.push({l:'DEX'+(ar.dexCap<99?' (max +'+ar.dexCap+')':''), v:dx}); if(c.shield) lines.push({l:'Shield', v:2}); }
    const gba=gearBonus(c,'ac'); if(gba) lines.push({l:'Equipment', v:gba}); const eb=effBonus(c,'ac'); if(eb) lines.push({l:'Active spell effects', v:eb}); total=computeAC(c); raw=true; }
  else if(t==='speed'){ title='Speed'; lines=[{l:'Base · '+(c.race||'walking'), v:Number(c.speed||0), raw:true}]; const gbs=gearBonus(c,'speed'); if(gbs) lines.push({l:'Equipment', v:gbs}); const eb=effBonus(c,'speed'); if(eb) lines.push({l:'Active effects', v:eb}); const ml=effSpeedMul(c); if(ml!==1) lines.push({l:'Effect multiplier', v:'×'+ml, raw:true}); total=effSpeed(c); raw=true; }
  else if(t==='prof'){ title='Proficiency Bonus'; if(c.profOverride!=='' && c.profOverride!=null && !isNaN(c.profOverride)){ lines=[{l:'Custom override', v:Number(c.profOverride)}]; } else { lines=[{l:'From level '+(c.level||1), v:profBonus(c)}]; } total=profBonus(c); }
  else if(t==='spelldc'){ title='Spell Save DC'; lines=[{l:'Base', v:8, raw:true},{l:'Proficiency', v:pb},{l:A(c.spellAbility)+' modifier', v:mod(abil(c,c.spellAbility))}]; total=8+pb+mod(abil(c,c.spellAbility)); raw=true; }
  else if(t==='spellatk'){ title='Spell Attack'; lines=[{l:'Proficiency', v:pb},{l:A(c.spellAbility)+' modifier', v:mod(abil(c,c.spellAbility))}]; total=pb+mod(abil(c,c.spellAbility)); }
  else if(t==='passive'){ const nm=(SKILLS.find(s=>s[0]===a)||['',a])[1]; title='Passive '+nm; lines=[{l:'Base', v:10, raw:true},{l:A(b)+' modifier', v:mod(abil(c,b))}]; if(c.skillProf[a]) lines.push({l:'Proficiency', v:pb}); if(c.skillExp[a]) lines.push({l:'Expertise', v:pb}); if(passiveBonus(c,a)) lines.push({l:'Observant feat', v:5}); total=passiveScore(c,a,b); raw=true; }
  return {title, lines, total, raw, note};
}

function showBreakdown(c, spec){
  const r=statBreakdown(c, spec);
  const fmt=(v,rw)=> (typeof v==='number') ? (rw?v:sgn(v)) : v;
  const body=r.lines.map(L=>`<div class="listrow"><div class="nm">${esc(L.l)}</div><div class="val">${fmt(L.v,L.raw)}</div></div>`).join('')
    +`<div class="listrow" style="border-top:2px solid var(--line)"><div class="nm"><b>Total</b></div><div class="val"><b style="color:var(--accent)">${r.raw?r.total:sgn(r.total)}</b></div></div>`;
  showInfo(r.title, r.note||'Where this number comes from', body);
}

function bd(spec){ return `<button class="del bdbtn" data-bd="${spec}" title="How is this calculated?" style="font-size:13px;padding:0 4px">ⓘ</button>`; }

function parseHitDice(c){
  const m = String((c.hitDice&&c.hitDice.total)||'').match(/(\d+)\s*d\s*(\d+)/i);
  return m ? {count:Number(m[1]), sides:Number(m[2])} : null;
}

function flashBanner(msg){ sfx('error'); pushRoll({label:msg, total:'⚠', detail:'', kind:'msg'}); }

function hasBeaconOfHope(c){ return !!(c&&(c.effects||[]).some(e=>e.name==='Beacon of Hope')); }

function esc(s){ return String(s==null?'':s).replace(/[&<>"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m])); }

function fmtLogTime(t){ const d=new Date(t), now=new Date();
  return d.toDateString()===now.toDateString() ? d.toLocaleTimeString([], {hour:'numeric',minute:'2-digit'}) : d.toLocaleDateString([], {month:'short',day:'numeric'}); }

function wizSteps(c){ return WIZ_BASE.filter(s=>
  (s.key!=='spells' || isCaster(c)) &&
  (s.key!=='subclass' || (SUBCLASSES[c.cls]||[]).length>0)
); }

function cantripLimit(c){ return CANTRIPS_KNOWN_L1[c.cls]||0; }

function cantripsKnownAt(cls, level){ const base=CANTRIPS_KNOWN_L1[cls]||0; if(!base) return 0;
  if(cls==='Artificer') return base+(level>=14?2:level>=10?1:0);
  return base+(level>=10?2:level>=4?1:0); }

function spell1Limit(c){
  const known={Bard:4,Sorcerer:2,Warlock:2,Wizard:6};
  if(known[c.cls]!=null) return known[c.cls];
  if(c.cls==='Cleric'||c.cls==='Druid') return Math.max(1, mod(abil(c,'wis'))+1);
  if(c.cls==='Artificer') return Math.max(1, mod(abil(c,'int'))+1);
  return 0;
}

function wizPickedCount(c, lvl){ return c.spells.filter(s=>(s.level||0)===lvl).length; }

function wizSpellPicker(c){
  const known=new Set(c.spells.map(s=>s.name.toLowerCase()));
  const caps={0:cantripLimit(c), 1:spell1Limit(c)};
  return `<p class="muted" style="font-size:13px;margin-top:0">Pick your starting spells for ${esc(c.cls)}. You can adjust later on the Spells tab.</p>`+
    [0,1].map(l=>{ const list=classSpells(c).filter(s=>s.l===l); if(!list.length || caps[l]===0) return '';
      const used=wizPickedCount(c,l);
      return `<div class="row between" style="margin:14px 0 4px"><div class="tag">${l===0?'Cantrips':'1st-level spells'}</div><div class="muted" style="font-size:12px">${used}/${caps[l]}</div></div>`+
        list.map(s=>`<div class="listrow"><input type="checkbox" class="chk" data-wspell="${esc(s.n)}|${s.l}" ${known.has(s.n.toLowerCase())?'checked':''}>
          <span style="font-size:16px;flex:none">${SCHOOL_ICON[s.s]}</span>
          <div class="nm">${esc(s.n)} <span class="sub">${SCHOOL_NAME[s.s]}</span>${SPELL_DESC[s.n]?`<small>${esc(SPELL_DESC[s.n])}</small>`:''}</div>
          <button class="del" data-spellinfo="${esc(s.n)}" title="Info">ⓘ</button></div>`).join('');
    }).join('');
}

function racePreview(c){
  if(!c.race) return '';
  const a=RACE_ASI[c.race];
  const art=`<div style="text-align:center;margin:6px 0 12px">${raceEmblem(c.race,9)}<div class="emcap">${esc(c.race)}</div></div>`;
  if(!a) return art+`<p class="muted" style="font-size:13px;margin-top:8px">Homebrew race — no automatic ability bonuses.</p>`;
  return art+`<div class="pill" style="margin-top:8px">Ability bonus: ${Object.entries(a).map(([k,v])=>k.toUpperCase()+' +'+v).join(', ')}</div>`;
}

function classPreview(c){
  const sv=CLASS_SAVES[c.cls], hd=CLASS_HITDIE[c.cls]; if(!sv) return '';
  const art=`<div style="text-align:center;margin:6px 0 12px">${classEmblem(c.cls,9)}<div class="emcap">${esc(c.cls)}</div></div>`;
  return art+`<div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap">
    <span class="pill">Hit die d${hd}</span>
    <span class="pill">Saves: ${sv.map(s=>s.toUpperCase()).join(' & ')}</span>
    <span class="pill">${(CLASS_SKILLS_N[c.cls]||2)} class skills</span></div>`;
}

function skillsPicker(c){
  return `<p class="muted" style="font-size:13px;margin-top:0">Choose up to <b>${skillBudget(c)}</b> (class + background). Chosen ${skillCount(c)}/${skillBudget(c)}.</p>`+
    SKILLS.map(([key,nm,ab])=>`<div class="listrow">
      <input type="checkbox" class="chk" data-skill="${key}" ${c.skillProf[key]?'checked':''}>
      <div class="nm">${nm} <span class="sub">(${ab})</span></div>
      <div class="val">${sgn(skillBonus(c,key,ab,true))}</div></div>`).join('');
}

function reviewBlock(c){
  const hd=CLASS_HITDIE[c.cls]||8;
  if(wiz.hpValue==null){ wiz.hpMode='max'; wiz.hpValue=autoHP(c)||c.hp.max; }
  return `
    <div class="listrow"><div class="nm">Name</div><div class="val">${esc(c.name)}</div></div>
    <div class="listrow"><div class="nm">Race</div><div class="val">${esc(c.race||'—')}</div></div>
    <div class="listrow"><div class="nm">Class</div><div class="val">${esc(c.cls)} 1</div></div>
    <div class="listrow"><div class="nm">Background</div><div class="val">${esc(c.background||'—')}</div></div>
    <div class="listrow"><div class="nm">Scores</div><div class="val" style="font-size:13px">${ABILITIES.map(([k])=>k.toUpperCase()+' '+abil(c,k)).join(' · ')}</div></div>
    ${(wiz.featChoice&&wiz.featChoice!=='(no feat)')?`<div class="listrow"><div class="nm">Feat</div><div class="val">${esc(wiz.featChoice)}</div></div>`:''}
    <div class="listrow"><div class="nm">Starting HP</div><div class="val">${wiz.hpValue}</div></div>
    <div class="seg" style="margin-top:10px"><button class="${wiz.hpMode==='max'?'on':''}" id="wzHpMax">Max — ${autoHP(c)}</button><button class="${wiz.hpMode==='roll'?'on':''}" id="wzHpRoll">Roll d${hd}+CON</button></div>
    <p class="muted" style="font-size:13px;margin-top:12px">Finish to open the full sheet — you can change anything later.</p>`;
}

function abilKeyByName(nm){ const f=ABILITIES.find(a=>a[1]===nm); return f?f[0]:null; }

function clampAbil(c){ ABILITIES.forEach(([k])=>{ const total=abilBase(c,k); if(total>20){ c.asiBonus[k]=Math.max(0,c.asiBonus[k]-(total-20)); } }); }   // clamp the permanent score (base+race+ASI), not temporary buffs

function abilCard(c, wizard){
  if(!wizard){
    // Post-creation: scores are locked (set at creation, change only via Level Up).
    return ABILITIES.map(([k,nm])=>{
      const base=Number(c.abilities[k]); const hasBase=!isNaN(base);
      const rb=raceBonus(c,k), as=(c.asiBonus&&c.asiBonus[k])||0, total=abil(c,k);
      const parts=[hasBase?base+' base':'', rb?'+'+rb+' race':'', as?'+'+as+' ASI':''].filter(Boolean).join('  ');
      return `<div class="abrow">
        <div class="nm">${k}</div>
        <div class="muted" style="font-size:11px;flex:1">${parts}</div>
        ${bd('abil:'+k)}
        <button class="tot val rollbtn" data-rollcheck data-label="${nm} check" data-bonus="${mod(total)}" title="Roll ${nm} check">${total} <small style="color:var(--mut);font-weight:400">${sgn(mod(total))}</small></button>
      </div>`;
    }).join('');
  }
  const method=c.abilMethod||'manual';
  const seg=`<div class="seg">${[['pointbuy','Point Buy'],['array','Std Array'],['manual','Manual']]
    .map(([k,l])=>`<button class="${method===k?'on':''}" data-abmethod="${k}">${l}</button>`).join('')}</div>`;
  let head='';
  if(method==='pointbuy'){ const u=pbUsed(c); head=`<div class="pbinfo">Point budget: <b style="color:${u>27?'var(--bad)':'var(--good)'}">${27-u}</b> left · ${u}/27 used</div>`; }
  else if(method==='array'){ head=`<div class="muted" style="font-size:12px;margin-bottom:8px">Assign 15, 14, 13, 12, 10, 8 — each once.</div>`; }
  const anyRace = ABILITIES.some(([k])=>raceBonus(c,k));
  const rows = ABILITIES.map(([k,nm])=>{
    const base=Number(c.abilities[k]); const hasBase=!isNaN(base);
    const rb=raceBonus(c,k); const total=abil(c,k);
    let control;
    if(method==='pointbuy'){
      const v=hasBase?base:8, used=pbUsed(c), canUp=v<15 && (used-pbCost(v)+pbCost(v+1))<=27;
      control=`<div class="stepper"><button data-pb="${k}" data-d="-1" ${v<=8?'disabled':''}>−</button><div class="val" style="min-width:24px;text-align:center">${v}</div><button data-pb="${k}" data-d="1" ${canUp?'':'disabled'}>＋</button></div>`;
    } else if(method==='array'){
      const taken=ABILITIES.filter(([k2])=>k2!==k).map(([k2])=>Number(c.abilities[k2]));
      const opts=['—',...STD_ARRAY].map(v=>{
        if(v==='—') return `<option value="—" ${hasBase&&STD_ARRAY.includes(base)?'':'selected'}>—</option>`;
        const dis=(taken.includes(v)&&base!==v)?'disabled':'';
        return `<option value="${v}" ${base===v?'selected':''} ${dis}>${v}</option>`;
      }).join('');
      control=`<select data-arr="${k}" style="width:auto">${opts}</select>`;
    } else {
      control=`<input type="number" id="ab_${k}" value="${hasBase?base:10}" min="1" max="30" style="width:66px" aria-label="${nm}">`;
    }
    const show = hasBase || rb;
    return `<div class="abrow">
      <div class="nm">${k}</div>
      ${control}
      ${anyRace?`<div class="rcl">${rb?'+'+rb:''}</div>`:''}
      <button class="tot val rollbtn" data-rollcheck data-label="${nm} check" data-bonus="${mod(total)}" title="Roll ${nm} check">${show?total:'—'} <small style="color:var(--mut);font-weight:400">${show?sgn(mod(total)):''}</small></button>
    </div>`;
  }).join('');
  return seg+head+rows;
}

function pips(max,val,kind){
  let h='';
  for(let i=1;i<=max;i++) h+=`<button class="pip ${i<=val?'on':''}" data-pip="${i}" data-kind="${kind}"></button>`;
  return h;
}

function hdPips(total, used){
  let h=''; const avail=total-used;
  for(let i=1;i<=total;i++) h+=`<button class="pip ${i<=avail?'on':''}" data-hdpip="${i}" title="${i<=avail?'available':'spent'}"></button>`;
  return h;
}

function autoPrepare(c, s){ if(!isPrepCaster(c) || (s.level||0)===0) return '';
  const cap=preparedMax(c);
  if(cap!=null && preparedCount(c)>=cap) return ' — ⚠ not prepared (at cap '+preparedCount(c)+'/'+cap+')';
  s.prepared=true; return ' (prepared)'; }


function slotPipsAuto(l,total,used){
  let h=''; const avail=total-used;
  for(let i=1;i<=total;i++) h+=`<button class="pip ${i<=avail?'on':''}" data-slotpip="${l}" data-n="${i}" title="${i<=avail?'available':'spent'}"></button>`;
  return h;
}

function select(id, opts, val){
  return `<select id="${id}">`+opts.map(o=>`<option ${o===val?'selected':''}>${esc(o)}</option>`).join('')+`</select>`;
}

function fieldSelect(id, opts, val, ph){
  const isCustom = val && !opts.includes(val);
  const options = ['—', ...opts, 'Custom…'].map(o=>{
    const selected = (o===val) || (o==='Custom…' && isCustom) || (o==='—' && !val);
    return `<option ${selected?'selected':''}>${esc(o)}</option>`;
  }).join('');
  return `<select id="${id}_sel">${options}</select>`+
    `<input id="${id}_cust" value="${esc(isCustom?val:'')}" placeholder="${esc(ph||'Custom')}" style="margin-top:8px;${isCustom?'':'display:none'}">`;
}

function rndPick(a){ return a[Math.floor(Math.random()*a.length)]; }

function shuffle(a){ return a.slice().sort(()=>Math.random()-0.5); }

function spriteDataURL(grid, scale){           // rasterize a 12×12 sprite into a portrait dataURL
  scale=scale||22; const w=grid[0].length, h=grid.length;
  const cv=document.createElement('canvas'); cv.width=w*scale; cv.height=h*scale;
  const x=cv.getContext('2d');
  x.fillStyle='#e3d2ac'; x.fillRect(0,0,cv.width,cv.height);
  x.fillStyle='#f0e4c6'; x.beginPath(); x.arc(cv.width/2, cv.height*0.42, cv.width*0.46, 0, Math.PI*2); x.fill();
  for(let yy=0;yy<h;yy++) for(let xx=0;xx<w;xx++){ const col=PIX_PAL[grid[yy][xx]]; if(col){ x.fillStyle=col; x.fillRect(xx*scale, yy*scale, scale, scale); } }
  return cv.toDataURL('image/png');
}

function randName(race){ const soft=['Elf','Half-Elf','Fairy','Gnome','Aasimar','Tabaxi','Tiefling'].includes(race); const first=rndPick(soft?NAME_SOFT:NAME_HARD)+rndPick(NAME_END); return Math.random()<0.5 ? first+' '+rndPick(NAME_SURNAME) : first; }

function openRandomBuilder(){ rndAns={style:'melee',heritage:'common',vibe:'heroic',power:'1',exactClass:''}; renderRandomBuilder(); }

function exportData(){
  const bundle={v:1, exportedAt:Date.now(), characters:DB, campaigns:campaigns(), maps:savedMaps()};
  const blob=new Blob([JSON.stringify(bundle,null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url; a.download='grimoire-backup.json'; a.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}

function rotXY(x,y,cols,rows,rot){ switch(rot){ case 1: return [rows-1-y, x]; case 2: return [cols-1-x, rows-1-y]; case 3: return [y, cols-1-x]; default: return [x,y]; } }

function rotDelta(dx,dy,rot){ switch(rot){ case 1: return [-dy,dx]; case 2: return [-dx,-dy]; case 3: return [dy,-dx]; default: return [dx,dy]; } }

function destroyIso3DHost(){
  if(window.__iso3dHost){ try{ window.__iso3dHost.destroy(); }catch(e){} window.__iso3dHost=null; }
  window.__iso3dCamKeep=false;
  window.__iso3dMountKey=null;
}

function bindIso3DEventsOnce(){
  if(window.__iso3dEventsBound) return;
  const bus=window.GrimoireEvents||(typeof Events!=='undefined'?Events:null);
  if(!bus||!bus.on) return;
  bus.on(function(ev){
    try{ if(window.__iso3dHost&&iso3dView) window.__iso3dHost.handleGameEvent(ev); }catch(e){}
  });
  window.__iso3dEventsBound=true;
}

function enableIso3DBattleView(){
  isoView=true; iso3dView=true;
  localStorage.setItem('grimoire.iso','1');
  localStorage.setItem('grimoire.iso3d','1');
}

function frameCameraOnCellSmooth(session, x, y, zoom){
  if(!isoView||!iso3dView||x==null||y==null) return;
  const host=window.__iso3dHost;
  if(!host||typeof host.frameOnCellSmooth!=='function') return;
  try{ host.frameOnCellSmooth(x|0, y|0, zoom!=null?zoom:1.55); }catch(e){}
}

function sessionUnitById(s, id){ return (s&&s.players||[]).find(u=>u.id===id)||(s&&s.monsters||[]).find(u=>u.id===id); }

function frameIso3DOnUnit(session, zoom){ frameBattleCameraOnPlayer(session, zoom); }

function loadPeer(cb){ if(window.Peer) return cb();
  const s=document.createElement('script'); s.src='https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js';
  s.onload=()=>cb(); s.onerror=()=>flashBanner('No internet — multiplayer needs a connection'); document.head.appendChild(s); }

function roomCode(){ const a='ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let s=''; for(let i=0;i<4;i++) s+=a[Math.floor(Math.random()*a.length)]; return s; }

function clientId(){ let id=localStorage.getItem('grimoire.cid'); if(!id){ id='c'+Math.random().toString(36).slice(2,10); localStorage.setItem('grimoire.cid',id); } return id; }

function playerChar(){ return net&&DB.find(x=>x.id===net.charId); }

function gridDist(ax,ay,bx,by){ return Math.max(Math.abs(ax-bx),Math.abs(ay-by)); }

function inBlast(cx,cy,x,y,r){ if(r<=1) return gridDist(cx,cy,x,y)<=r; return Math.hypot(cx-x,cy-y)<=r+0.0001; }

function leavesReach(fromX,fromY,toX,toY,ex,ey,reach){ reach=reach||1; return gridDist(fromX,fromY,ex,ey)<=reach && gridDist(toX,toY,ex,ey)>reach; }

function terrainAt(s,x,y){ return (s.map.tiles||{})[x+','+y]||''; }

function decorAt(s,x,y){ return (s.map&&s.map.decor&&s.map.decor[x+','+y])||''; }

function isUnprotectedFlameDecor(kind){ return kind==='torch'||kind==='campfire'; }

function isTorchDecor(kind){ return kind==='torch'||kind==='campfire'||kind==='torch_unlit'; }

function lineCells(x0,y0,x1,y1,maxTiles,halfW){
  const cells=new Set();
  const dx=x1-x0, dy=y1-y0;
  const dist=Math.max(Math.abs(dx),Math.abs(dy),1);
  const steps=Math.min(maxTiles|0, dist);
  const hw=halfW!=null?halfW:0;
  for(let i=0;i<=steps;i++){
    const t=steps?i/steps:0;
    const cx=Math.round(x0+dx*t), cy=Math.round(y0+dy*t);
    for(let ox=-hw;ox<=hw;ox++) for(let oy=-hw;oy<=hw;oy++) cells.add((cx+ox)+','+(cy+oy));
  }
  return cells;
}

function blastCells(cx,cy,r){
  const cells=new Set();
  const R=Math.ceil(r||0)+1;
  for(let x=(cx|0)-R;x<=(cx|0)+R;x++) for(let y=(cy|0)-R;y<=(cy|0)+R;y++){
    if(inBlast(cx,cy,x,y,r)) cells.add(x+','+y);
  }
  return cells;
}

function removeTorchLightsInCells(s, set){
  if(!s.map.light||!Array.isArray(s.map.light.points)) return;
  s.map.light.points=s.map.light.points.filter(p=>{
    if(!p||p.col==null) return true;
    if(p.kind==='crystal') return true;
    const k=(p.col|0)+','+(p.row|0);
    if(!set.has(k)) return true;
    if(p.kind==='torch'||p.kind==='campfire'||!p.kind) return false;
    return true;
  });
}

function extinguishTorchesInCells(s, cells){
  if(!s||!s.map) return 0;
  if(!s.map.decor) s.map.decor={};
  const set=cells instanceof Set?cells:new Set(cells||[]);
  let n=0;
  set.forEach(key=>{
    const kind=s.map.decor[key];
    if(isUnprotectedFlameDecor(kind)){
      s.map.decor[key]='torch_unlit';
      n++;
    }
    // Keep interact-layer torch state in sync when Gust snuffs
    if(s.map.interact&&s.map.interact[key]&&s.map.interact[key].type==='torch'){
      s.map.interact[key].state='unlit';
    }
  });
  removeTorchLightsInCells(s, set);
  return n;
}

function explodeTorchesInCells(s, cells){
  if(!s||!s.map) return 0;
  if(!s.map.decor) s.map.decor={};
  const set=cells instanceof Set?cells:new Set(cells||[]);
  let n=0;
  set.forEach(key=>{
    const kind=s.map.decor[key];
    if(isTorchDecor(kind)){
      delete s.map.decor[key];
      n++;
    }
    if(s.map.interact&&s.map.interact[key]&&s.map.interact[key].type==='torch'){
      delete s.map.interact[key];
    }
  });
  removeTorchLightsInCells(s, set);
  return n;
}

function applyGustOfWind(s, from, to, casterName, dc){
  const line=SPELL_LINE['Gust of Wind']||{tiles:12,width:1};
  const cells=lineCells(from.x,from.y,to.x,to.y,line.tiles,line.width);
  const n=extinguishTorchesInCells(s, cells);
  const dx=Math.sign(to.x-from.x)||0, dy=Math.sign(to.y-from.y)||0;
  let pushed=0, resisted=0;
  (s.monsters||[]).forEach(mo=>{
    if(!mo||mo.hp<=0) return;
    if(!cells.has(mo.x+','+mo.y)) return;
    const bonus=mod(abil(deriveMonsterAbilities(mo),'str'));
    if(rnd(20)+bonus>=(dc||10)){ resisted++; return; }
    let nx=mo.x, ny=mo.y;
    for(let i=0;i<3;i++){ const tx=nx+dx, ty=ny+dy; if(!tileClearFor(s,tx,ty)) break; nx=tx; ny=ty; }
    if(nx!==mo.x||ny!==mo.y){ mo.x=nx; mo.y=ny; pushed++; }
  });
  const parts=[];
  if(n) parts.push('snuffs '+n+' torch'+(n===1?'':'es'));
  if(pushed) parts.push('pushes '+pushed+' creature'+(pushed===1?'':'s')+' back 15 ft');
  if(resisted) parts.push(resisted+' resist'+(resisted===1?'s':''));
  const msg='💨 Gust of Wind '+(parts.length?parts.join(', '):'howls through — no effect');
  if(typeof qbLog==='function'&&s===QB) qbLog(msg);
  return {torches:n, pushed, resisted};
}

function applyFireBlastHazards(s, ctr, aoeR, name, dtype){
  if(!s||!ctr) return 0;
  const cells=blastCells(ctr.x,ctr.y,aoeR||0);
  let n=0;
  // Torches only for fire
  if(isFireDamage(dtype, name)){
    const tn=explodeTorchesInCells(s, cells);
    n+=tn;
    if(tn&&typeof qbLog==='function'&&s===QB){
      qbLog('💥 '+name+' blows up '+tn+' torch'+(tn===1?'':'es')+' — gone, and the light dies with them');
    }
  }
  // Barrels & multi-reaction objects (fire, force, thunder, …)
  if(isFireDamage(dtype, name)||isLightningDamage(dtype, name)||isKineticDamage(dtype, name)
      ||/shatter|thunderwave|fireball|meteor|burning hands|scorching|eldritch/i.test(String(name||''))){
    const hr=applyAreaInteractHazards(s, cells, dtype||'', name||'');
    n+=hr.n;
    if(hr.n&&typeof qbLog==='function'&&s===QB&&hr.msgs.length){
      // First message already logged inside resolve; summarize count if many
      if(hr.n>1) qbLog('🛢️ '+hr.n+' hazard containers set off by '+name);
    }
  }
  return n;
}

function heightAt(s,x,y){ return (s.map&&s.map.height&&s.map.height[x+','+y])||0; }   // elevation level (0 default); each level = 5 ft vertical

function isPitTerrain(key){ return key==='void'||key==='pit'; }

function isFullWall(key){ return key==='wall'||key==='cave_wall'; }

function isLowWallTerrain(key){ return key==='low_wall'; }

function terrainKeyAt(s,x,y){ return (s.map&&s.map.tiles&&s.map.tiles[x+','+y])||''; }

function effectiveHeight(s,x,y){
  let h=heightAt(s,x,y)|0;
  const k=terrainKeyAt(s,x,y);
  if(isLowWallTerrain(k)) h=Math.max(h,1);
  return h;
}

function isFlying(c){ if(!c) return false; if((c.effects||[]).some(e=>e.name==='Fly'||e.name==='Levitate')) return true; if(c.mountedOn&&c.mountedOn.fly) return true; if(c.wildShape&&c.wildShape.fly) return true; return FLYING_RACES.has(c.race); }

function monsterFlies(mo){ return !!(mo&&mo.fly); }

function hasFeatherFall(c){ return !!(c&&(c.effects||[]).some(e=>e.name==='Feather Fall')); }

function lavaDmg(){ const r=rollNotation('6d10'); return r?r.total:30; }

function moverStrMod(mover){
  if(!mover) return 0;
  if(mover.c) return mod(abil(mover.c,'str'));
  if(mover.abilities) return mod(abil(mover,'str'));
  if(mover.str!=null) return mod(mover.str);
  const base=mover.base, ent=base&&monsterDef(base);
  const cr=ent?crToNum(ent.cr):0;
  if(cr>=3) return 3; if(cr>=1) return 2; if(cr>=0.5) return 1; return 0;
}

function moverHasClimbSpeed(mover){
  if(!mover) return false;
  if(mover.climb||mover.climbSpeed) return true;
  if(mover.c){ if(/climb/i.test(String(mover.c.speedText||mover.c.notes||''))) return true;
    if(['Tabaxi','Lizardfolk','Simic Hybrid'].includes(mover.c.race)) return true; }
  return /climb/i.test(String(mover.spd||mover.speed||''));
}

function hasJumpBuff(mover){ return !!(mover&&(mover.effects||[]).some(e=>e.name==='Jump')); }

function runningHighJumpFt(mover){ return Math.max(0, 3+moverStrMod(mover))*(hasJumpBuff(mover)?3:1); }

function standingHighJumpFt(mover){ return Math.floor(runningHighJumpFt(mover)/2); }

function elevationMoveExtra(s,x,y,nx,ny,mover,fly,runUp){
  if(fly) return {feet:0, mode:null};
  // Use effective height so low_wall parapets count as +1 level of climb
  const dH=effectiveHeight(s,nx,ny)-effectiveHeight(s,x,y);
  if(!dH){
    // Same height but stepping onto low_wall still costs climb effort (scramble up)
    if(isLowWallTerrain(terrainKeyAt(s,nx,ny))&&!isLowWallTerrain(terrainKeyAt(s,x,y)))
      return {feet:5, mode:'climb'};
    return {feet:0, mode:null};
  }
  const riseFt=dH>0?dH*5:0, dropFt=dH<0?(-dH)*5:0;
  const climbSp=moverHasClimbSpeed(mover);
  const jump=runUp?runningHighJumpFt(mover):standingHighJumpFt(mover);
  if(riseFt>0){
    if(riseFt<=jump) return {feet:riseFt, mode:'jump'};
    const maxClimb=climbSp?1e9:Math.max(20, runningHighJumpFt(mover)*4);
    if(riseFt>maxClimb) return null;
    return {feet:climbSp?riseFt:(riseFt*2), mode:'climb'};
  }
  if(dropFt<=5) return {feet:0, mode:null};
  return {feet:climbSp?dropFt:(dropFt*2), mode:'drop'};
}

function fallDamageTotal(feet){ const dice=Math.min(20, Math.floor(Math.max(0,feet)/10)); if(dice<=0) return 0;
  let t=0; for(let i=0;i<dice;i++) t+=1+Math.floor(Math.random()*6); return t; }
// Altitude: a flying PC can climb/descend (Use-menu, spends movement 1:1 like any other
// vertical movement this app already models for jumping/climbing). Losing consciousness while
// airborne means falling — reuses fallDamageTotal, the exact same formula a cliff-drop already
// uses (1d6 bludgeoning per 10 ft, capped at 20d6). Deliberately narrower than full RAW: only
// hooked to dropping to 0 HP (the single most common and highest-stakes "fell out of the sky"
// moment), not every incapacitating condition (Paralyzed/Stunned from a failed save mid-someone
// -else's-turn) — a real, named simplification, not a silently-missed mechanic. Mutates c.hp.cur
// directly rather than recursing through applyHp (which is what CALLS this in the first place).
// Ring of Feather Falling: immune to fall damage while attuned (mods.noFallDamage, the same
// equipped+attuned gate gearBonus already uses — a boolean flag, not an additive number, so it
// can't route through gearBonus itself, which only sums numeric mods).
function hasNoFallDamage(c){ return (c.items||[]).some(it=>it.equipped&&(!it.requiresAttunement||it.attuned)&&it.mods&&it.mods.noFallDamage); }
function checkFallDamage(c, log){
  if(!(c.altitude>0)) return;
  const feet=c.altitude; c.altitude=0;
  if(hasNoFallDamage(c)){ log('🪶 '+(c.name||'You')+' drifts safely to the ground — Ring of Feather Falling'); return; }
  const fd=fallDamageTotal(feet);
  if(fd>0){ c.hp.cur=Math.max(0,c.hp.cur-fd); log('💥 '+(c.name||'You')+' falls '+feet+' ft out of the sky — '+fd+' bludgeoning'); }
  else log('🕊️ '+(c.name||'You')+' drifts down '+feet+' ft to the ground');
}
// Drinking a potion (Potion of Healing and its tiers) — same one-line "consume a resource,
// heal, log it" shape Goodberries already established (see eatBerry).
function drinkPotion(c, idx){
  const it=c.items[idx]; if(!it || !it.potionHeal) return false;
  const healed=(rollNotation(it.potionHeal)||{total:0}).total;
  applyHp(c, healed);
  logChange(c, '🧪 Drank '+it.name+' — regained '+healed+' HP');
  it.qty=(it.qty||1)-1; if(it.qty<=0) c.items.splice(idx,1);
  save();
  return true;
}
// QB-only AOE resolver for item mechanics (Decanter's Geyser, Powder Keg) that aren't spells
// and so don't route through Engine.castApply — same "QB first, DM-hosted/player-net deferred"
// scope this session already established for combat undo. Applies to monsters AND the PC
// within radiusTiles of ctr (an explosion/geyser doesn't care about allegiance); opts:
// {dmg, dtype, dc, saveAbility ('str'/'dex'/…), cond, condRounds}. Returns per-target results
// for the caller to log (monsters have no auto-log the way applyHp gives the PC).
function itemAoeQB(s, ctr, radiusTiles, opts){
  opts=opts||{};
  const results=[];
  (s.monsters||[]).filter(m=>m.hp>0 && inBlast(ctr.x,ctr.y,m.x,m.y,radiusTiles)).forEach(m=>{
    const bonus=monsterSaveBonus(m);
    const roll=rnd(20)+bonus, saved=opts.dc?roll>=opts.dc:true;
    let dmg=0;
    if(opts.dmg){ const total=(rollNotation(opts.dmg)||{total:0}).total; dmg=saved?Math.floor(total/2):total; m.hp=Math.max(0,m.hp-dmg); }
    if(!saved && opts.cond){ m.conds=m.conds||[]; if(!m.conds.some(x=>x.name===opts.cond)) m.conds.push({name:opts.cond, rounds:opts.condRounds||10}); }
    results.push({unit:m, name:m.name, saved, dmg});
  });
  const pc=s.players&&s.players[0];
  if(pc && pc.c && pc.c.hp.cur>0 && inBlast(ctr.x,ctr.y,pc.x,pc.y,radiusTiles)){
    const c=pc.c;
    const bonus=saveMod(c, opts.saveAbility||'dex');
    const roll=rnd(20)+bonus, saved=opts.dc?roll>=opts.dc:true;
    let dmg=0;
    if(opts.dmg){ const total=(rollNotation(opts.dmg)||{total:0}).total; dmg=saved?Math.floor(total/2):total; if(dmg>0) applyHp(c,-dmg); }
    if(!saved && opts.cond){ c.conditions=c.conditions||{}; c.conditions[opts.cond]=true; }
    results.push({unit:c, name:c.name, saved, dmg, isPc:true});
  }
  return results;
}

function dijkstra(s, sx, sy, maxFeet, fly, mover){
  const cols=s.map.cols, rows=s.map.rows, tiles=s.map.tiles||{}, K=(x,y)=>x+','+y;
  // Full walls: never passable (even flying — ceiling-bounded). Pits: fly only. Low walls: walkable (climb cost).
  const passable=(x,y)=>{ if(x<0||y<0||x>=cols||y>=rows) return false;
    const tk=tiles[K(x,y)], td=TERRAIN[tk];
    if(td&&td.solid){
      if(isFullWall(tk)) return false;           // dungeon wall: no climb, no fly-through
      if(isPitTerrain(tk)) return !!fly;         // pit/chasm: fly over only
      return false;
    }
    const dd=DECOR[decorAt(s,x,y)]; if(dd&&dd.solid) return false; return true; };
  const cost={}, prev={}, edgeMode={}; cost[K(sx,sy)]=0; const frontier=[[sx,sy]];
  while(frontier.length){ frontier.sort((a,b)=>cost[K(a[0],a[1])]-cost[K(b[0],b[1])]); const [x,y]=frontier.shift(), cc=cost[K(x,y)];
    if(cc>=maxFeet) continue;
    for(let dx=-1;dx<=1;dx++) for(let dy=-1;dy<=1;dy++){ if(!dx&&!dy) continue; const nx=x+dx, ny=y+dy; if(!passable(nx,ny)) continue;
      if(dx&&dy && (!passable(x+dx,y) || !passable(x,y+dy))) continue;
      const td=TERRAIN[tiles[K(nx,ny)]], dd=DECOR[decorAt(s,nx,ny)], isDiff=(td&&td.diff)||(dd&&dd.diff);
      let step=fly?5:(isDiff?10:5), mode=null;
      if(!fly){ const elev=elevationMoveExtra(s,x,y,nx,ny,mover,fly,cc>=10); if(elev==null) continue; step+=elev.feet; mode=elev.mode; }
      const nc=cc+step; if(nc>maxFeet) continue;
      const key=K(nx,ny);
      if(cost[key]==null || nc<cost[key]){ cost[key]=nc; prev[key]=K(x,y); edgeMode[key]=mode; frontier.push([nx,ny]); } } }
  return {cost, prev, edgeMode};
}

function reachableCells(s, sx, sy, maxFeet, fly, mover){ return dijkstra(s,sx,sy,maxFeet,fly,mover).cost; }

function reachableCellsMeta(s, sx, sy, maxFeet, fly, mover){
  const {cost, prev, edgeMode}=dijkstra(s,sx,sy,maxFeet,fly,mover);
  const meta={};
  Object.keys(cost).forEach(key=>{
    if(cost[key]<=0) return;
    let jump=false, climb=false, drop=false, cur=key;
    const guard=new Set();
    while(prev[cur] && !guard.has(cur)){ guard.add(cur); const m=edgeMode[cur]; if(m==='jump') jump=true; if(m==='climb') climb=true; if(m==='drop') drop=true; cur=prev[cur]; }
    meta[key]={cost:cost[key], jump, climb, drop};
  });
  return meta;
}

function buildMoveRangeOpts(s, mover, remainingMove, canDash, speedFt, fly){
  remainingMove=Math.max(0, remainingMove|0);
  speedFt=Math.max(0, speedFt|0);
  const dashMax=remainingMove+(canDash?speedFt:0);
  const meta=reachableCellsMeta(s, mover.x, mover.y, dashMax, fly, mover);
  const reachCost={};
  Object.keys(meta).forEach(k=>{ reachCost[k]=meta[k].cost; });
  return {
    reachCost,
    reachNormal: remainingMove,
    reachMeta: meta,
    canDash: !!canDash,
    speedFt,
    remainingMove
  };
}

function blocksLoE(s, x, y, mode){
  const key=terrainAt(s,x,y);
  const td=TERRAIN[key];
  if(td){
    // Full walls & pits block LoE. Low walls do NOT (half cover only — open sky).
    if(isFullWall(key)||isPitTerrain(key)) return true;
    if(td.solid && (td.opaque || td.deadly) && !td.climbable) return true;
    if(td.opaque && !td.diff && !td.solid && !td.softCover && !td.climbable) return true; // dense fog
  }
  const dd=DECOR[decorAt(s,x,y)];
  if(dd && dd.solid && dd.opaque) return true; // tree trunk/canopy
  return false;
}

function visionCreatureAt(s, x, y){
  if(!s) return false;
  if((s.monsters||[]).some(m=>m.hp>0&&m.x===x&&m.y===y)) return true;
  if((s.players||[]).some(p=>p.x===x&&p.y===y&&(p.hpCur==null||p.hpCur>0))) return true;
  return false;
}

function losClear(s, x0, y0, x1, y1, modeOrOpts){
  if(x0===x1&&y0===y1) return true;
  const opts=(modeOrOpts&&typeof modeOrOpts==='object')?modeOrOpts:{};
  const ignoreCreatures=!!opts.ignoreCreatures;
  // Continuous ray through cell centers — equal on diagonals and orthogonals
  const sx=x0+0.5, sy=y0+0.5, ex=x1+0.5, ey=y1+0.5;
  const dx=ex-sx, dy=ey-sy;
  const dist=Math.hypot(dx,dy);
  if(dist<1e-9) return true;
  // ~3 samples per tile; visit every cell the center-line enters
  const steps=Math.max(2, Math.ceil(dist*3));
  const h0=heightAt(s,x0,y0), h1=heightAt(s,x1,y1), hCap=Math.max(h0,h1);
  const seen=new Set();
  for(let i=1;i<steps;i++){
    const t=i/steps;
    const px=sx+dx*t, py=sy+dy*t;
    // Cell containing this sample (floor). Nudge slightly so exact-on-grid-line is stable.
    const cx=Math.floor(px+1e-9), cy=Math.floor(py+1e-9);
    if(cx===x0&&cy===y0) continue;
    if(cx===x1&&cy===y1) continue;
    const key=cx+','+cy;
    if(seen.has(key)) continue;
    seen.add(key);
    if(s.map&&(cx<0||cy<0||cx>=s.map.cols||cy>=s.map.rows)) continue;
    if(blocksLoE(s,cx,cy)) return false;
    // Taller ridge than both ends blocks light
    if(heightAt(s,cx,cy)>hCap) return false;
    // Bodies block combat light (not teleport destination checks)
    if(!ignoreCreatures&&visionCreatureAt(s,cx,cy)) return false;
  }
  return true;
}

function losClearFlexible(s, x0, y0, x1, y1, mode){
  if(losClear(s, x0, y0, x1, y1, mode)) return true;
  if(blocksLoE(s, x1, y1, mode)) return false;
  const nbs=[[1,0],[-1,0],[0,1],[0,-1]];
  for(const [dx,dy] of nbs){
    const nx=x1+dx, ny=y1+dy;
    if(nx<0||ny<0||nx>=s.map.cols||ny>=s.map.rows) continue;
    if(blocksLoE(s, nx, ny, mode)) continue;
    if(visionCreatureAt(s,nx,ny)) continue;
    if(losClear(s, x0, y0, nx, ny, mode)) return true;
  }
  return false;
}

function buildRangeTileSet(s, ox, oy, tiles, needLos, flexible){
  const set=new Set(); if(!s||!s.map) return set;
  needLos=needLos!=null?needLos:(tiles>1);
  for(let x=0;x<s.map.cols;x++) for(let y=0;y<s.map.rows;y++){
    if(x===ox&&y===oy) continue;
    if(!inBlast(ox,oy,x,y,tiles)) continue;
    if(needLos){
      const ok=flexible?losClearFlexible(s,ox,oy,x,y,'place'):losClear(s,ox,oy,x,y,'place');
      if(!ok) continue;
    }
    // Can't target/place on a solid wall tile itself
    if(blocksLoE(s,x,y)) continue;
    set.add(x+','+y);
  }
  return set;
}

function buildRangeMaxTileSet(s, ox, oy, tiles){
  const set=new Set(); if(!s||!s.map) return set;
  for(let x=0;x<s.map.cols;x++) for(let y=0;y<s.map.rows;y++){
    if(x===ox&&y===oy) continue;
    if(!inBlast(ox,oy,x,y,tiles)) continue;
    set.add(x+','+y);
  }
  return set;
}

function buildBlastTileSet(s, cx, cy, r){
  const set=new Set(); if(!s||!s.map||r==null) return set;
  for(let x=0;x<s.map.cols;x++) for(let y=0;y<s.map.rows;y++){
    if(inBlast(cx,cy,x,y,r)) set.add(x+','+y);
  }
  return set;
}

function resolveCastCenter(s, x, y, rangeTiles, from){
  const key=x+','+y;
  if(rangeTiles&&rangeTiles.has(key)) return {x,y};
  // Self is always a legal center for AoE when rangeTiles includes it
  if(from&&from.x===x&&from.y===y) return {x,y};
  // Wall / elevated pick often steals the grass under the cursor — find nearest valid
  if(!rangeTiles||!rangeTiles.size) return null;
  let best=null, bestD=1e9;
  rangeTiles.forEach(k=>{
    const [nx,ny]=k.split(',').map(Number);
    const d=Math.hypot(nx-x, ny-y);
    if(d<bestD && d<=2.5){ bestD=d; best={x:nx,y:ny}; }
  });
  return best;
}

function buildTargetingOpts(s, from, tiles, opts){
  opts=opts||{};
  const needLos=opts.needLos!=null?opts.needLos:(tiles>1);
  // AoE: corner-friendly + trees block placement. Creature rays: walls only (trees = cover).
  const flexibleLos=!!opts.aoeR;
  let rangeTiles, rangeMax;
  if(opts.seek&&opts.reach){
    // "seeking" path range: tiles you can path to within feet budget
    rangeTiles=new Set(Object.keys(opts.reach).filter(k=>opts.reach[k]!=null&&opts.reach[k]>=0));
    rangeMax=rangeTiles;
  } else {
    // Slate = full reach; gold = clear line of effect (valid place/target)
    rangeMax=buildRangeMaxTileSet(s, from.x, from.y, tiles);
    rangeTiles=needLos?buildRangeTileSet(s, from.x, from.y, tiles, true, flexibleLos):rangeMax;
  }
  // AoE spells can center on the caster's own tile (PHB: point within range)
  if(opts.aoeR&&from.x!=null){
    rangeTiles.add(from.x+','+from.y);
    if(rangeMax) rangeMax.add(from.x+','+from.y);
  }
  const out={
    rangeFrom:{x:from.x,y:from.y,tiles, needLos:opts.seek?false:needLos},
    rangeTiles,
    rangeMax,
  };
  // Range + AoE: orange blast ONLY on valid LoE cast tiles (same set as gold range).
  // Locked center if placed; otherwise preview at caster (always valid) until cursor moves.
  if(opts.aoeR){
    out.aoeR=opts.aoeR;
    const bx=opts.center?opts.center.x:from.x, by=opts.center?opts.center.y:from.y;
    const centerOk=rangeTiles.has(bx+','+by);
    if(centerOk){
      out.blast={x:bx,y:by,r:opts.aoeR};
      out.blastTiles=buildBlastTileSet(s, bx, by, opts.aoeR);
    }
    out.blastLocked=!!opts.center;
    out.aoePreview={col:from.x,row:from.y};
  }
  // Explicit target list (e.g. locked Fire Bolt pick), or auto: living monsters on valid LoS tiles
  if(opts.targets&&opts.targets.length) out.targets=opts.targets;
  else if(s.monsters&&rangeTiles){
    // v120.237: you can't target a creature you haven't noticed. `observer` is the looking
    // character; when a caller doesn't supply one we pass Infinity, which filters nothing — so
    // every existing call site behaves exactly as before until it opts in.
    const passive=observerPassivePerception(opts.observer);
    out.targets=s.monsters.filter(m=>m.hp>0&&m.x!=null&&rangeTiles.has(m.x+','+m.y)
      && !unitHiddenFrom(passive, m)).map(m=>m.id);
  }
  // Iso3D pre-roll badges: cover / ADV / DIS / sneak-ready on each living foe in range
  out.targetInfo=buildAttackPreviewTags(s, from, rangeTiles, { meleeBudget:tiles });
  return out;
}

function buildAttackPreviewTags(s, from, rangeTiles, opts){
  const tags={}; if(!s||!from||from.x==null) return tags;
  opts=opts||{};
  const tiles=opts.meleeBudget!=null?opts.meleeBudget:1;
  const aConds=unitConds(from);
  // Foes: monsters when PC attacks; players when a monster attacks (DM/net)
  const fromIsPc=!!(from.c||from.side==='pc'||from.id==='pc');
  const foes=fromIsPc
    ? (s.monsters||[]).filter(m=>m.hp>0&&m.x!=null)
    : (s.players||[]).filter(p=>p.x!=null&&(p.hpCur==null||p.hpCur>0));
  const allySide=fromIsPc?(s.players||[]):(s.monsters||[]).filter(m=>m.hp>0);
  const canSneakBase=fromIsPc&&from.c&&from.c.cls==='Rogue'&&!(from.c.battle&&from.c.battle.sneakUsed);
  foes.forEach(t=>{
    const key=t.x+','+t.y;
    if(rangeTiles&&!rangeTiles.has(key)) return;
    if(tiles>1&&!losClear(s,from.x,from.y,t.x,t.y)) return;
    const dist=gridDist(from.x,from.y,t.x,t.y);
    const melee=dist<=1;
    const cover=coverBetween(s,from.x,from.y,t.x,t.y);
    const cx=attackAdvantage(aConds, unitConds(t), melee);
    let sneak=false;
    if(canSneakBase){
      // PHB: advantage OR ally within 5 ft of target (and no disadv)
      const allyAdj=allySide.some(a=>a!==from&&a.x!=null&&Math.max(Math.abs(a.x-t.x),Math.abs(a.y-t.y))<=1);
      sneak=cx.adv>=0&&(cx.adv===1||allyAdj);
    }
    if(cover||cx.adv||sneak) tags[key]={cover:cover||0, adv:cx.adv||0, sneak};
  });
  return tags;
}

function coverBetween(s, x0,y0,x1,y1){ const tiles=s.map.tiles||{};
  // Cover is a property of the LINE between two squares, so it must not depend on which end you
  // start from. Bresenham breaks ties to one side on any non-45° line, so walking A→B and B→A can
  // sample different cells (e.g. 2,0 one way, 2,1 the other) and disagree whenever exactly one of
  // them is an obstruction. Canonicalising the endpoints — always walk from the lexicographically
  // smaller one — makes the result provably identical in both directions, without changing which
  // cells a given line samples. (v120.236; the drift bug fixed in v120.235 was a separate, much
  // larger problem in the same function.)
  if(x0>x1 || (x0===x1 && y0>y1)){ const tx=x0, ty=y0; x0=x1; y0=y1; x1=tx; y1=ty; }
  let dx=Math.abs(x1-x0),dy=Math.abs(y1-y0),sx=x0<x1?1:-1,sy=y0<y1?1:-1,err=dx-dy,x=x0,y=y0,guard=0,cover=0;
  // Bresenham. The y-step MUST add dx, not dy (v120.235 — it said `err+=dy` for a long time,
  // which is the classic transcription slip and is not a subtle one: with dx=0 the error term
  // never settles, so the walk drifts diagonally off the grid. Walking (0,7)->(0,4) sampled
  // 0,6 then -1,6, -2,5, -3,4 ... down to -10,-3 until the 999 guard stopped it. Only the first
  // step or two of ANY line were ever real cells, so cover was found only when an obstruction
  // happened to sit right next to the attacker, and the same wall gave +5 one way and 0 the
  // other. Found by driving a real two-tab DM/player session, not by reading this line.
  while(!(x===x1&&y===y1)&&guard++<999){ const e2=2*err; if(e2>-dy){err-=dy;x+=sx;} if(e2<dx){err+=dx;y+=sy;}
    if(x===x1&&y===y1) break;
    const tk=tiles[x+','+y], td=TERRAIN[tk], dd=DECOR[decorAt(s,x,y)];
    if(isFullWall(tk)||(td&&td.solid&&td.opaque&&!td.climbable)){ cover=Math.max(cover,5); continue; } // full wall
    if(isLowWallTerrain(tk)||(td&&td.softCover)){ cover=Math.max(cover,2); continue; } // low wall / brush half cover
    if(td&&td.opaque&&!td.diff&&!td.climbable){ cover=Math.max(cover,5); continue; } // fog
    if(dd&&dd.solid&&dd.opaque){ cover=Math.max(cover,2); continue; }          // tree half cover
    if((td&&td.opaque)||(dd&&dd.opaque)){ cover=Math.max(cover,2); continue; } // brush etc.
    const occ=(s.monsters||[]).some(m=>m.hp>0&&m.x===x&&m.y===y) || (s.players||[]).some(p=>p.x===x&&p.y===y&&(p.hpCur==null||p.hpCur>0));
    if(occ) cover=Math.max(cover,2); }
  return cover; }

function pathTo(s, sx, sy, tx, ty, maxFeet, fly, mover){ const {cost,prev}=dijkstra(s,sx,sy,maxFeet,fly,mover); const K=(x,y)=>x+','+y; if(cost[K(tx,ty)]==null) return null;
  const path=[]; let cur=K(tx,ty); while(cur && cur!==K(sx,sy)){ const [x,y]=cur.split(',').map(Number); path.unshift({x,y}); cur=prev[cur]; } return path; }

function pathToMeta(s, sx, sy, tx, ty, maxFeet, fly, mover){
  const {cost,prev,edgeMode}=dijkstra(s,sx,sy,maxFeet,fly,mover); const K=(x,y)=>x+','+y;
  if(cost[K(tx,ty)]==null) return null;
  const steps=[]; let cur=K(tx,ty);
  while(cur && cur!==K(sx,sy)){
    const [x,y]=cur.split(',').map(Number);
    steps.unshift({x,y, mode:edgeMode[cur]||null});
    cur=prev[cur];
  }
  let px=sx, py=sy, maxRise=0, maxDrop=0, needsJump=false, needsClimb=false, needsDrop=false;
  steps.forEach(st=>{
    const dH=(heightAt(s,st.x,st.y)-heightAt(s,px,py))*5;
    if(st.mode==='jump'){ needsJump=true; maxRise=Math.max(maxRise, dH); }
    if(st.mode==='climb'){ needsClimb=true; maxRise=Math.max(maxRise, dH); }
    if(st.mode==='drop'){ needsDrop=true; maxDrop=Math.max(maxDrop, -dH); }
    if(dH>0) maxRise=Math.max(maxRise,dH);
    if(dH<0) maxDrop=Math.max(maxDrop,-dH);
    px=st.x; py=st.y;
  });
  return { path:steps.map(st=>({x:st.x,y:st.y})), steps, cost:cost[K(tx,ty)], needsJump, needsClimb, needsDrop, maxRise, maxDrop };
}

function hasInventoryMatch(c, re){
  return !!(c&&(c.items||[]).some(it=>re.test(String(it.name||''))&&(it.qty==null||it.qty>0)));
}

function hasRope(c){ return hasInventoryMatch(c,/rope/i); }

function jumpAcrobaticsDC(mover, riseFt){
  const cap=runningHighJumpFt(mover);
  const over=Math.max(0, (riseFt||0)-cap);
  return 10+Math.floor(over/5)*2;
}

function rollSkillCheck(c, skillKey, abilKey, opts){
  opts=opts||{};
  const bonus=skillBonus(c, skillKey, abilKey, true) + (opts.flatBonus||0) + (opts.guidance?(1+Math.floor(Math.random()*4)):0);
  const adv=opts.adv||0;
  const d1=1+Math.floor(Math.random()*20);
  let d=d1, d2=null;
  if(adv){ d2=1+Math.floor(Math.random()*20); d=adv>0?Math.max(d1,d2):Math.min(d1,d2); }
  // Reliable Talent (Rogue 11th): a roll of 9 or lower counts as a 10, but only on checks that
  // actually add your proficiency bonus (i.e. you're proficient in this skill).
  if(c && c.cls==='Rogue' && (Number(c.level)||1)>=11 && c.skillProf && c.skillProf[skillKey] && d<10) d=10;
  return {d20:d, d1, d2, adv, bonus, total:d+bonus, skillKey, abilKey};
}

function skillCheckAdvantage(c, skillKey, abilKey, targetId){
  let adv=0; const why=[];
  if(abilKey==='str' && isRaging(c)){ adv++; why.push('raging (advantage on Strength checks)'); }
  // Armor non-proficiency (PHB): disadvantage on Str/Dex ability checks.
  if((abilKey==='str'||abilKey==='dex') && c.armor && c.armor!=='none' && !armorProficient(c,c.armor)){
    adv--; why.push('not proficient with worn armor');
  }
  // Favored Enemy (Ranger 1st): advantage on Survival checks to track a favored enemy. This app
  // doesn't tag monsters with a creature type the ranger could match against a specific chosen
  // enemy (Natural Explorer has the identical gap for terrain), so this applies whenever any
  // favored enemy is chosen at all — a documented simplification, not conditional on the
  // specific target's type.
  if(skillKey==='survival' && (c.favoredEnemies||[]).length){ adv++; why.push('tracking a favored enemy'); }
  if(skillKey==='insight' && targetId!=null && (c.effects||[]).some(e=>e.name==='Detect Thoughts' && e.targetId===targetId)){
    adv++; why.push('reading their surface thoughts (Detect Thoughts)');
  }
  // Actor (feat): advantage on Deception/Performance checks to impersonate someone. This app
  // doesn't track "is this specific check an impersonation attempt" (same gap Favored Enemy/
  // Natural Explorer already have for "the specific chosen enemy/terrain type" above) —
  // applies whenever the skill is Deception or Performance at all, the same documented
  // simplification style already established for those two.
  if((skillKey==='deception'||skillKey==='performance') && hasFeat(c,'Actor')){ adv++; why.push('Actor — impersonation'); }
  return {adv, why};
}

function skillCheckBonus(c, skillKey){
  let n=0;
  if(skillKey==='stealth' && (c.effects||[]).some(e=>e.name==='Pass without Trace')) n+=10;
  return n;
}

function monsterCheckBonus(mo){ return monsterSaveBonus(mo); }

function monsterPassivePerception(mo){ return 10+monsterCheckBonus(mo); }

function monsterSearchRoll(mo, hiddenDC){
  const total=rnd(20)+mod(abil(deriveMonsterAbilities(mo),'wis'));
  return {total, found: hiddenDC!=null && total>=hiddenDC};
}

function deriveMonsterAbilities(mo){
  if(!mo || mo.abilities) return mo;
  const score=10+2*monsterSaveBonus(mo);
  mo.abilities={str:score,dex:score,con:score,int:score,wis:score,cha:score};
  mo.skillProf=mo.skillProf||{};
  mo.skillExp=mo.skillExp||{};
  mo.saveProf=mo.saveProf||{};
  return mo;
}

function unitSkillRoll(u, skillKey, abilKey, opts){
  opts=opts||{};
  if(u && typeof u.hp==='number' && !u.abilities) deriveMonsterAbilities(u);
  if(u && u.skillProf){
    const ca=skillCheckAdvantage(u, skillKey, abilKey);
    return rollSkillCheck(u, skillKey, abilKey, Object.assign({}, opts, {adv:(opts.adv||0)||ca.adv, flatBonus:(opts.flatBonus||0)+skillCheckBonus(u,skillKey)}));
  }
  const bonus=monsterCheckBonus(u)+(opts.flatBonus||0);
  const d=1+Math.floor(Math.random()*20);
  return {d20:d, bonus, total:d+bonus, skillKey, abilKey};
}

function opposedCheck(attacker, atkSkill, atkAbil, defender, defSkillOptions){
  const a=unitSkillRoll(attacker, atkSkill, atkAbil);
  const defRolls=defSkillOptions.map(([sk,ab])=>unitSkillRoll(defender, sk, ab));
  const def=defRolls.reduce((best,r)=>r.total>best.total?r:best, defRolls[0]);
  return {attacker:a, defender:def, success:a.total>=def.total};
}

function hasDarkvision(c){
  if(!c) return false;
  if((c.effects||[]).some(e=>e.name==='Darkvision')) return true;
  if(typeof hasRacialTrait==='function' && hasRacialTrait(c,'Darkvision')) return true;
  // Common races without scanning full traits table twice
  const r=c.race||'';
  return /Dwarf|Elf|Gnome|Half-Elf|Half-Orc|Tiefling|Aasimar|Tabaxi|Goblin|Kobold|Orc|Bugbear|Hobgoblin|Drow/i.test(r);
}

function collectLightPoints(s){
  if(!s||!s.map) return [];
  const pts=[];
  const ml=s.map.light||{};
  if(Array.isArray(ml.points)) ml.points.forEach(p=>{ if(p&&p.col!=null) pts.push(p); });
  const decor=s.map.decor||{};
  Object.keys(decor).forEach(k=>{
    const kind=decor[k]; if(!kind) return;
    if(kind==='torch'||kind==='campfire'||kind==='crystal'||(DECOR[kind]&&DECOR[kind].light)){
      const [cs,rs]=k.split(','); const col=Number(cs), row=Number(rs);
      if(!Number.isFinite(col)) return;
      pts.push({col,row,radius:kind==='crystal'?3.5:4.2, color:kind==='crystal'?[0.55,0.75,1]:[1,0.55,0.22], intensity:1.35, kind});
    }
  });
  (s.lights||[]).forEach(L=>{
    if(!L) return;
    // Lights attached to a creature follow them around the map
    if(L.follow){
      const u=(s.players||[]).concat(s.monsters||[]).find(x=>x&&(x.id===L.follow||x.name===L.follow||(x.c&&x.c.name===L.follow)));
      if(u&&u.x!=null){ L.col=u.x|0; L.row=u.y|0; }
    }
    if(L.col!=null) pts.push(L);
  });
  return pts;
}

function tileLightLevel(s,x,y){
  if(!s||!s.map) return 2; // no battle map → treat as bright (sheet rolls)
  const mode=(s.map.light&&s.map.light.mode)||'day';
  let amb=LIGHT_MODE_AMBIENT[mode]; if(amb==null) amb=2;
  // Magical darkness overrides (simplest: any darkness sphere covering tile → dark)
  for(const L of (s.lights||[])){
    if(L&&L.dark&&gridDist(x,y,L.col|0,L.row|0)<=(L.dark|0)) return 0;
  }
  let v=amb>=2?0.92:amb===1?0.45:0.06;
  for(const p of collectLightPoints(s)){
    if(p.dark) continue;
    const d=gridDist(x,y,p.col|0,p.row|0);
    const r=Math.max(0.5, Number(p.radius)||4);
    if(d>r) continue;
    const t=1-d/r;
    const brightR=(p.bright!=null?p.bright:r*0.5);
    // Inside bright radius, push hard toward bright
    if(d<=brightR) v+=1.0*(p.intensity||1);
    else v+=(p.intensity||1)*t*t*0.75;
  }
  if(v>=0.72) return 2;
  if(v>=0.28) return 1;
  return 0;
}

function visionLevel(c,s,x,y, fromX, fromY){
  let L=tileLightLevel(s,x,y);
  if(hasDarkvision(c)){
    const fx=fromX!=null?fromX:x, fy=fromY!=null?fromY:y;
    if(gridDist(fx,fy,x,y)<=12){
      // Magical darkness still blocks darkvision (PHB) unless Devil's Sight — keep dark
      const magicDark=(s.lights||[]).some(L=>L&&L.dark&&gridDist(x,y,L.col|0,L.row|0)<=(L.dark|0));
      if(!magicDark){ if(L===0) L=1; else if(L===1) L=2; }
    }
  }
  return L;
}

function lightLabel(n){ return n>=2?'bright':n===1?'dim':'dark'; }

/* ---- Fog of war (v120.241) ------------------------------------------------------------------
   "Can this creature see that square right now?" — the shared predicate every fog feature needs.
   Deliberately built on the three primitives that already exist rather than a parallel model:
     * losClear   — walls and solid terrain block sight (and it samples a continuous ray, so it is
                    symmetric; the Bresenham drift bug fixed in v120.235 never applied to it)
     * visionLevel — light level AT the target square as seen FROM the viewer, already folding in
                    darkvision (12 tiles / 60 ft) and magical darkness
     * gridDist   — Chebyshev, 1 tile = 5 ft, same as everything else
   Darkness is the hard cut: light level 0 from the viewer's position means not visible at all.
   Dim (1) counts as seen — 5e treats dim as lightly obscured (disadvantage on Perception), not
   blindness, which lightSkillMode already models elsewhere.

   `maxTiles` exists purely as a perf bound on huge maps; 24 tiles = 120 ft, well past the point
   where a battle map matters. Callers that need everything can pass Infinity. */
function canSeeCell(s, viewer, x, y, maxTiles){
  if(!s||!s.map||!viewer||viewer.x==null) return false;
  const cap=maxTiles==null?24:maxTiles;
  if(gridDist(viewer.x,viewer.y,x,y)>cap) return false;
  const c=viewer.c||null;
  if(visionLevel(c, s, x, y, viewer.x, viewer.y)<=0) return false;
  return losClear(s, viewer.x, viewer.y, x, y, {ignoreCreatures:true});
}

/** Every cell this viewer can currently see, as a Set of "x,y" keys. */
function visibleCells(s, viewer, maxTiles){
  const out=new Set();
  if(!s||!s.map||!viewer||viewer.x==null) return out;
  const cols=s.map.cols|0, rows=s.map.rows|0;
  for(let y=0;y<rows;y++) for(let x=0;x<cols;x++)
    if(canSeeCell(s, viewer, x, y, maxTiles)) out.add(x+','+y);
  return out;
}

/**
 * Fog memory: squares this viewer has ever seen. Classic three-state fog needs "never seen"
 * (black), "seen before, not now" (remembered terrain, no creatures) and "visible now".
 *
 * Kept CLIENT-SIDE on purpose — fog is a presentation concern, and computing it locally means no
 * protocol change, no extra broadcast payload, and no way for a player device to learn about
 * squares it shouldn't. Keyed by viewer id + map size so a new map starts unexplored.
 */
const _fogMemory=new Map();
function fogKey(s, viewerId){ return (viewerId||'me')+'@'+((s&&s.map)?(s.map.cols+'x'+s.map.rows):'0'); }
function rememberSeen(s, viewerId, seen){
  const k=fogKey(s,viewerId);
  let set=_fogMemory.get(k); if(!set){ set=new Set(); _fogMemory.set(k,set); }
  seen.forEach(v=>set.add(v));
  return set;
}
function exploredCells(s, viewerId){ return _fogMemory.get(fogKey(s,viewerId))||new Set(); }
function resetFog(viewerId){
  if(viewerId==null){ _fogMemory.clear(); return; }
  [..._fogMemory.keys()].forEach(k=>{ if(k.indexOf(viewerId+'@')===0) _fogMemory.delete(k); });
}

/** Fog state for one square: 'visible' | 'remembered' | 'unseen'. */
function fogStateAt(s, viewer, viewerId, x, y, seenSet){
  const seen=seenSet||visibleCells(s, viewer);
  if(seen.has(x+','+y)) return 'visible';
  return exploredCells(s, viewerId).has(x+','+y) ? 'remembered' : 'unseen';
}

function lightSkillMode(c, skillKey){
  const s=battleSession(); if(!s) return 'normal';
  const me=s.players&&s.players.find(p=>p.c===c||p.id==='pc'||(c&&p.cid===c.id));
  const x=me?me.x:0, y=me?me.y:0;
  const L=visionLevel(c,s,x,y,x,y);
  if(skillKey==='stealth'){
    if(L===0) return 'adv';
    if(L===1) return 'adv';
    return 'normal';
  }
  if(skillKey==='perception'){
    if(L===0) return 'dis';
    if(L===1) return hasDarkvision(c)?'normal':'dis';
    return 'normal';
  }
  return 'normal';
}

function addSessionLight(s, name, col, row, meta){
  if(!s) return null;
  const def=SPELL_LIGHTS[name]; if(!def||def.grantDarkvision) return null;
  if(!s.lights) s.lights=[];
  const by=(meta&&meta.by)||(s.players&&s.players[0]&&s.players[0].name)||'?';
  // One active instance per caster+spell (refresh)
  s.lights=s.lights.filter(L=>!(L.name===name&&L.by===by));
  // Daylight / Sunburst etc. snuff lower-level magical darkness in range
  if(def.dispelsDarkness){
    const R=def.bright!=null?def.bright:(def.dim||12);
    const before=s.lights.length;
    s.lights=s.lights.filter(L=>{
      if(!L.dark) return true;
      return gridDist(col|0,row|0,L.col|0,L.row|0)>R;
    });
    if(s.lights.length<before && typeof qbLog==='function'&&s===QB) qbLog('☀️ '+name+' burns away the darkness');
  }
  if(def.dark){
    const entry={name, col:col|0, row:row|0, dark:def.dark, rounds:def.rounds, by, kind:'darkness'};
    if(meta&&meta.follow) entry.follow=meta.follow;
    s.lights.push(entry);
    return entry;
  }
  const entry={
    name, col:col|0, row:row|0,
    radius:def.dim!=null?def.dim:(def.bright!=null?(def.bright*2):4),
    bright:def.bright!=null?def.bright:0,
    color:def.color||[1,0.9,0.7],
    intensity:def.intensity||1.2,
    rounds:def.rounds,
    by,
    kind:'spell'
  };
  if(meta&&meta.follow) entry.follow=meta.follow;
  s.lights.push(entry);
  return entry;
}

function applySpellLight(s, c, name, at, followId){
  const def=SPELL_LIGHTS[name]; if(!s||!def) return;
  if(def.grantDarkvision) return; // handled via SPELL_EFFECTS / addEffect
  const me=(s.players||[]).find(p=>p.c===c||p.id==='pc'||(c&&(p.cid===c.id||p.id===c.id)))||(s.players&&s.players[0]);
  let col=at&&at.x!=null?at.x:(me&&me.x!=null?me.x:0);
  let row=at&&at.y!=null?at.y:(me&&me.y!=null?me.y:0);
  const follow=followId!==undefined ? followId : ((def.attach==='self'&&me)?(me.id||me.name||'pc'):null);
  if(follow&&at==null){ col=me.x|0; row=me.y|0; }
  addSessionLight(s, name, col, row, {by:c&&c.name, follow:follow||undefined});
  const tag=def.dark?'🌑':'💡';
  const msg=tag+' '+name+(def.dark?' cloaks':' lights')+' ('+col+','+row+')'+(def.note?' · '+def.note:'');
  if(typeof qbLog==='function'&&s===QB) qbLog(msg);
  if(c) logChange(c, name+(def.dark?' — magical darkness':' — light')+' at '+col+','+row);
}

function tickSessionLights(s){
  if(!s||!s.lights||!s.lights.length) return;
  s.lights.forEach(L=>{ if(L.rounds!=null) L.rounds--; });
  const before=s.lights.length;
  s.lights=s.lights.filter(L=>L.rounds==null||L.rounds>0);
  if(s.lights.length<before && typeof qbLog==='function'&&s===QB) qbLog('💡 A magical light fades…');
}

function isLightUtilitySpell(name){
  const d=SPELL_LIGHTS[name];
  if(!d||d.grantDarkvision) return !!d;
  // Damage / attack / cond spells also emit light — still target normally
  if(SPELL_AOE[name]||spellTargetsEnemy(name)) return false;
  return true;
}

function iso3dUnitId(unit){
  if(!unit) return null;
  if(unit.side==='pc'||unit.id==='pc') return 'p:pc';
  if(unit.c&&(unit.cls||unit.c.cls)) return 'p:'+(unit.id||unit.cid||'pc');
  if(unit.side==='mon'||unit.sprite!=null||String(unit.id||'').indexOf('qm')===0) return 'm:'+unit.id;
  // session player
  if(unit.hpCur!=null||unit.hpMax!=null) return 'p:'+(unit.id||unit.cid||'unknown');
  return 'm:'+unit.id;
}

function weaponRangeTiles(c,w){ if(!w) return 1; if(w.type==='ranged'){ const m=String(w.rng||'').match(/(\d+)/); return m?Math.max(1,Math.ceil(Number(m[1])/5)):12; } return /reach/.test(w.props||'')?2:1; }

function spellRangeTiles(name){ const mc=parseSpellMechanics(name); if((mc.range||'')==='Touch') return 1; const m=String(mc.range||'').match(/(\d+)/); return m?Math.max(1,Math.ceil(Number(m[1])/5)):12; }

function monsterSprite(k){ return MONSTER_PIX[k] || RACE_PIX[({goblin:'Goblin',orc:'Orc',human:'_default',lizardfolk:'Dragonborn'})[k]] || RACE_PIX._default; }

function spriteEntry(key){ return SPRITE_MANIFEST[key]||null; }

function dirFromDelta(dx,dy,iso){ if(!dx&&!dy) return null;
  const sx=iso?(dx-dy):dx, sy=iso?(dx+dy):dy;
  return Math.abs(sx)>=Math.abs(sy) ? (sx>0?'right':'left') : (sy>0?'down':'up'); }

function spriteTokenHTML(key, facing){ const e=spriteEntry(key); if(!e) return null;
  if(!spriteReady.has(key)){ ensureSpriteProbe(key); return null; }   // kicks off the load; falls back to pixelArt until it resolves
  const cols=e.cols||4, rows=e.rows||4, dirOrder=e.dirOrder||SPRITE_DIR_ORDER, row=Math.max(0,dirOrder.indexOf(facing||'down'));
  // idle = column 0; CSS background-position % is (index/(count-1))*100, not a plain per-frame fraction
  const posY=rows>1?(row/(rows-1)*100):0;
  // render at the sheet's real frame size × a shared zoom, not a fixed box — keeps a 64x64
  // monster sheet visibly smaller than a 128x128 one instead of stretching both to match
  const frameW=(e.nativeW||cols*32)/cols, frameH=(e.nativeH||rows*32)/rows, w=frameW*SPRITE_ZOOM, h=frameH*SPRITE_ZOOM;
  return `<div style="width:${w}px;height:${h}px;background-image:url('${e.file}');background-repeat:no-repeat;background-size:${cols*100}% ${rows*100}%;background-position:0% ${posY}%;image-rendering:pixelated"></div>`; }

function decorTokenHTML(key){ const e=DECOR_MANIFEST[key]; if(!e) return '';
  if(e.emoji) return `<div style="position:absolute;left:50%;bottom:0;transform:translateX(-50%);font-size:32px;line-height:1;filter:drop-shadow(0 2px 1px rgba(0,0,0,.35))">${e.emoji}</div>`;
  if(!decorReady.has(key)){ ensureDecorProbe(key); return ''; }
  const scale=Math.min(DECOR_MAX_W/e.nativeW, DECOR_MAX_H/e.nativeH), w=e.nativeW*scale, h=e.nativeH*scale;
  // isoContent is display:grid with no explicit template, so decorHTML/tok/elevBadge (three
  // unpositioned siblings) don't reliably share one cell — align-self on its own wasn't enough.
  // Taking this out of grid flow with explicit absolute positioning removes that ambiguity: it
  // anchors to the tile's bottom-center no matter how the grid auto-places its grid-flow siblings.
  return `<div style="position:absolute;left:50%;bottom:0;transform:translateX(-50%);width:${w}px;height:${h}px;background-image:url('${e.file}');background-repeat:no-repeat;background-size:100% 100%;image-rendering:pixelated"></div>`; }

function nextToWall(s,x,y){
  const cols=s.map.cols|0, rows=s.map.rows|0;
  const deltas=[[1,0],[-1,0],[0,1],[0,-1]];
  return deltas.some(([dx,dy])=>{ const nx=x+dx, ny=y+dy;
    if(nx<0||ny<0||nx>=cols||ny>=rows) return false;
    return WALL_LIKE_TERRAIN.has(terrainAt(s,nx,ny)); });
}

function interactAt(s,x,y){ return (s.map&&s.map.interact&&s.map.interact[x+','+y])||null; }

function interactKey(x,y){ return x+','+y; }

function ensureInteract(s){ if(!s.map) return null; if(!s.map.interact) s.map.interact={}; return s.map.interact; }

function syncInteractDecor(s){
  if(!s||!s.map||!s.map.interact) return;
  if(!s.map.decor) s.map.decor={};
  Object.keys(s.map.interact).forEach(k=>{
    const o=s.map.interact[k]; if(!o||!o.type) return;
    const def=INTERACT_TYPES[o.type]; if(!def) return;
    const st=o.state||def.default;
    const dkey=def.decor&&def.decor[st];
    if(dkey) s.map.decor[k]=dkey;
    else if(dkey===null) delete s.map.decor[k];
    // Torch lights in map.light.points
    if(o.type==='torch') syncTorchLightPoint(s, k, st==='lit');
  });
}

function syncTorchLightPoint(s, key, lit){
  if(!s.map.light) s.map.light={mode:(s.map.light&&s.map.light.mode)||'dungeon', points:[]};
  if(!Array.isArray(s.map.light.points)) s.map.light.points=[];
  const [cs,rs]=key.split(','); const col=Number(cs), row=Number(rs);
  s.map.light.points=s.map.light.points.filter(p=>!(p&&(p.col|0)===col&&(p.row|0)===row&&(p.kind==='torch'||!p.kind||p.kind==='campfire')));
  if(lit) s.map.light.points.push({col,row,radius:5,color:[1.0,0.55,0.22],intensity:1.55,kind:'torch'});
}

function availableInteractActions(obj, via){
  if(!obj) return [];
  const def=INTERACT_TYPES[obj.type]; if(!def) return [];
  const st=obj.state||def.default;
  return (def.actions||[]).filter(a=>{
    if(via==='hand'&&!a.hand) return false;
    if(via==='adj'&&a.adj===false) return false;
    if(a.needs!=null&&a.needs!==st) return false;
    return true;
  });
}

function isFireDamage(dtype, name){
  return /fire|flame|heat|scorch|immolat|meteor|hellish|sunburst|burning|infernal/i.test(String(dtype||'')+' '+String(name||''));
}

function isLightningDamage(dtype, name){
  return /lightning|electric|thunderbolt|call lightning/i.test(String(dtype||'')+' '+String(name||''));
}

function isKineticDamage(dtype, name){
  // Physical smashes + force/thunder concussive hits (Eldritch Blast, Shatter, maul…)
  return /bludgeon|slash|pierc|force|thunder|kinetic|crush/i.test(String(dtype||'')+' '+String(name||''));
}

function isHazardObject(o){
  if(!o||!o.type) return false;
  const def=INTERACT_TYPES[o.type];
  return !!(def&&def.hazard&&(o.state||def.default)==='intact');
}

function paintTerrainDisk(s, cx, cy, r, terrain){
  if(!s||!s.map||!terrain) return [];
  if(!s.map.tiles) s.map.tiles={};
  const out=[];
  const R=Math.max(0,r|0);
  for(let y=cy-R;y<=cy+R;y++) for(let x=cx-R;x<=cx+R;x++){
    if(x<0||y<0||x>=(s.map.cols|0)||y>=(s.map.rows|0)) continue;
    if(R>0&&!inBlast(cx,cy,x,y,R)) continue;
    const k=x+','+y;
    const td=TERRAIN[s.map.tiles[k]];
    if(td&&(td.solid||td.deadly)) continue;
    s.map.tiles[k]=terrain;
    out.push(k);
  }
  return out;
}

function harmCreaturesOnKeys(s, keys, dmgTotal, dtype, label){
  if(!s||!keys||!keys.length||!(dmgTotal>0)) return 0;
  const set=keys instanceof Set?keys:new Set(keys);
  let hit=0;
  (s.players||[]).forEach(p=>{
    if(p.x==null||!set.has(p.x+','+p.y)) return;
    if(p.c){ applyHp(p.c,-dmgTotal); if(p.hpCur!=null) p.hpCur=p.c.hp.cur; }
    hit++;
    if(typeof qbLog==='function'&&s===QB) qbLog('💥 '+(label||'Hazard')+' hits '+(p.name||'you')+' for '+dmgTotal+(dtype?' '+dtype:''));
  });
  (s.monsters||[]).forEach(m=>{
    if(m.hp<=0||m.x==null||!set.has(m.x+','+m.y)) return;
    m.hp=Math.max(0,m.hp-dmgTotal);
    hit++;
    if(typeof qbLog==='function'&&s===QB) qbLog('💥 '+(label||'Hazard')+' hits '+m.name+' for '+dmgTotal+(dtype?' '+dtype:''));
  });
  return hit;
}

function removeInteractObject(s, key){
  if(!s||!s.map) return;
  if(s.map.interact) delete s.map.interact[key];
  if(s.map.decor) delete s.map.decor[key];
}

function resolveHazardReaction(s, key, reaction, ctx){
  if(!s||!s.map||!s.map.interact) return null;
  const o=s.map.interact[key]; if(!o) return null;
  const def=INTERACT_TYPES[o.type]; if(!def||!def.hazard) return null;
  if((o.state||def.default)!=='intact') return null;
  const hz=def.hazard;
  const [x,y]=key.split(',').map(Number);
  const visited=(ctx&&ctx.visited)||new Set();
  if(visited.has(key)) return null;
  visited.add(key);
  const name=def.name||o.type;
  let msg='';
  // Remove barrel first so chain reactions don't re-hit it
  o.state='gone';
  removeInteractObject(s, key);
  if(reaction==='rupture'||reaction==='tip'){
    const terrain=hz.spillTerrain;
    const r=hz.spillR!=null?hz.spillR:1;
    const painted=terrain?paintTerrainDisk(s, x, y, r, terrain):[];
    // Splash damage on the barrel tile itself for acid
    if(terrain==='acid'){
      const splash=(rollNotation('1d6')||{total:3}).total;
      harmCreaturesOnKeys(s, [key], splash, 'acid', name+' spill');
    }
    msg=(reaction==='tip'?'Tipped ':'Smashed ')+name;
    if(terrain==='grease') msg+=' — oil/grease floods the floor'+(painted.length?' ('+painted.length+' tiles)':'');
    else if(terrain==='acid') msg+=' — acid floods the floor'+(painted.length?' ('+painted.length+' tiles)':'');
    else msg+=' — contents spill out';
  } else if(reaction==='explode'){
    const er=hz.explodeR!=null?hz.explodeR:2;
    const dmgNot=hz.explodeDmg||'2d6';
    const dmg=(rollNotation(dmgNot)||{total:7}).total;
    const dtype=hz.explodeDtype||'fire';
    const cells=blastCells(x,y,er);
    // Oil explosion also leaves burning grease underfoot
    if(o.type==='oil_barrel'||hz.spillTerrain==='grease'){
      paintTerrainDisk(s, x, y, Math.max(1,er-1), 'grease');
      // Ignite the grease immediately (fire hazard → lava-lite: keep grease but damage)
    }
    harmCreaturesOnKeys(s, cells, dmg, dtype, name+' explosion');
    msg='💥 '+name+' EXPLODES! ('+dmg+' '+dtype+' in '+(er*5)+' ft)';
    // Brief fire flare light
    if(dtype==='fire'&&s.map){
      if(!s.map.light) s.map.light={mode:(s.map.light&&s.map.light.mode)||'dungeon', points:[]};
      if(!Array.isArray(s.map.light.points)) s.map.light.points=[];
      s.map.light.points.push({col:x,row:y,radius:er+1,color:[1.0,0.35,0.08],intensity:1.8,kind:'blast'});
    }
    // Chain reaction: other intact hazard barrels in the blast
    if(hz.chain){
      cells.forEach(ck=>{
        if(ck===key||visited.has(ck)) return;
        const other=s.map.interact&&s.map.interact[ck];
        if(!isHazardObject(other)) return;
        const od=INTERACT_TYPES[other.type];
        const next=(od.hazard&&od.hazard.fire)||'explode';
        // Fireball-style: chained oil/powder detonate; acid ruptures
        const r2=resolveHazardReaction(s, ck, next==='explode'?'explode':(od.hazard.fire||'rupture'), {visited, name:ctx&&ctx.name, dtype:dtype});
        if(r2&&r2.msg) msg+=' · '+r2.msg;
      });
    }
  } else {
    msg=name+' destroyed';
  }
  if(typeof qbLog==='function'&&s===QB) qbLog(msg);
  return {ok:true, msg, reaction};
}

function damageInteractObject(s, key, dtype, spellName, opts){
  const o=s.map&&s.map.interact&&s.map.interact[key];
  if(!isHazardObject(o)) return {ok:false, msg:'Nothing fragile there'};
  const def=INTERACT_TYPES[o.type];
  const hz=def.hazard;
  let reaction=null;
  if(isFireDamage(dtype, spellName)&&hz.fire) reaction=hz.fire;
  else if(isLightningDamage(dtype, spellName)&&hz.lightning) reaction=hz.lightning;
  else if(isKineticDamage(dtype, spellName)&&hz.kinetic) reaction=hz.kinetic;
  else if(opts&&opts.forceReaction) reaction=opts.forceReaction;
  if(!reaction){
    // Default: any solid hit with enough force smashes kinetic-vulnerable barrels
    if(hz.kinetic&&(opts&&opts.anyHit)) reaction=hz.kinetic;
    else return {ok:false, msg:def.name+' shrugs it off'};
  }
  const res=resolveHazardReaction(s, key, reaction, {name:spellName, dtype, visited:(opts&&opts.visited)||new Set()});
  if(res) syncInteractDecor(s);
  return res||{ok:false, msg:'No effect'};
}

function applyAreaInteractHazards(s, cells, dtype, name){
  if(!s||!s.map||!s.map.interact) return {n:0, msgs:[]};
  const set=cells instanceof Set?cells:new Set(cells||[]);
  const visited=new Set();
  const msgs=[];
  let n=0;
  // Snapshot keys — reactions mutate interact map
  const keys=Object.keys(s.map.interact).filter(k=>set.has(k)&&isHazardObject(s.map.interact[k]));
  keys.forEach(k=>{
    if(visited.has(k)) return;
    const res=damageInteractObject(s, k, dtype, name, {visited, anyHit:true});
    if(res&&res.ok){ n++; if(res.msg) msgs.push(res.msg); }
  });
  // Grease already on the floor + fire → scorch (flavor: oil ignites)
  if(isFireDamage(dtype, name)&&s.map.tiles){
    let ignited=0;
    set.forEach(k=>{
      if(s.map.tiles[k]==='grease'){
        // Stay grease (slippery + flammable) but zap anyone standing in it
        ignited++;
      }
    });
    if(ignited){
      const burn=(rollNotation('1d6')||{total:3}).total;
      harmCreaturesOnKeys(s, [...set].filter(k=>s.map.tiles[k]==='grease'), burn, 'fire', 'Burning oil');
      if(typeof qbLog==='function'&&s===QB) qbLog('🔥 Oil slick ignites! (+'+burn+' fire to creatures in grease)');
    }
  }
  return {n, msgs};
}

function listHazardObjectsInRange(s, from, tiles, needLos){
  if(!s||!s.map||!s.map.interact) return [];
  const out=[];
  Object.keys(s.map.interact).forEach(k=>{
    const o=s.map.interact[k]; if(!isHazardObject(o)) return;
    const [x,y]=k.split(',').map(Number);
    if(gridDist(from.x,from.y,x,y)>tiles) return;
    if(needLos&&!losClear(s,from.x,from.y,x,y,{ignoreCreatures:true})) return;
    const def=INTERACT_TYPES[o.type];
    out.push({key:k, x, y, obj:o, def});
  });
  return out.sort((a,b)=>gridDist(from.x,from.y,a.x,a.y)-gridDist(from.x,from.y,b.x,b.y));
}

function runInteractAction(s, c, key, actionId, via){
  const o=s.map&&s.map.interact&&s.map.interact[key];
  if(!o) return {ok:false, msg:'Nothing to use there'};
  const def=INTERACT_TYPES[o.type]; if(!def) return {ok:false, msg:'Unknown object'};
  const act=(def.actions||[]).find(a=>a.id===actionId);
  if(!act) return {ok:false, msg:'Can’t do that'};
  if(via==='hand'&&!act.hand) return {ok:false, msg:'Too heavy for Mage Hand'};
  const st=o.state||def.default;
  if(act.needs!=null&&act.needs!==st) return {ok:false, msg:'Already '+st};
  const [x,y]=key.split(',').map(Number);
  let msg='';
  // Hazard barrels: tip / smash / spark route through reaction system
  if(def.hazard&&(actionId==='tip'||actionId==='smash'||actionId==='spark')){
    let reaction=null;
    if(actionId==='tip') reaction=def.hazard.tip||'rupture';
    else if(actionId==='spark') reaction=def.hazard.fire||'explode';
    else reaction=def.hazard.kinetic||'rupture';
    if(!reaction) return {ok:false, msg:'That won’t work'};
    const res=resolveHazardReaction(s, key, reaction, {name:actionId, visited:new Set()});
    syncInteractDecor(s);
    return res||{ok:false, msg:'No effect'};
  }
  // Toggle levers / switches
  if(act.toggle){
    o.state=st==='on'?'off':'on';
    msg=(def.name)+' flipped '+(o.state==='on'?'ON':'OFF');
    // Drive linked objects
    const links=[].concat(o.link||[], o.links||[]);
    links.forEach(lk=>{
      const t=s.map.interact[lk]; if(!t) return;
      const td=INTERACT_TYPES[t.type]; if(!td) return;
      if(t.type==='door'||t.type==='grate'){
        t.state=o.state==='on'?'open':'closed';
        msg+='; · '+(td.name)+' '+(t.state);
      } else if(t.type==='drawbridge'){
        t.state=o.state==='on'?'lowered':'raised';
        applyDrawbridgeTiles(s, lk, t.state);
        msg+='; · drawbridge '+(t.state);
      }
    });
  } else if(act.to){
    o.state=act.to;
    msg=(act.label||actionId)+' — '+(def.name)+' is now '+o.state;
  }
  // Side effects
  if(o.type==='plank'&&o.state==='removed'){
    // Pit under the plank
    if(!s.map.tiles) s.map.tiles={};
    s.map.tiles[key]='void';
    msg+=' · a dark gap opens';
  }
  if(o.type==='loose_rock'&&o.state==='cleared'){
    msg+=' · the way is clear';
  }
  if(o.type==='trap'&&actionId==='trigger'){
    // Damage whoever is on the tile, or note the hazard
    const herePc=(s.players||[]).find(p=>p.x===x&&p.y===y);
    const hereMo=(s.monsters||[]).find(m=>m.hp>0&&m.x===x&&m.y===y);
    const dmg=(rollNotation('2d6')||{total:7}).total;
    if(herePc&&herePc.c){ applyHp(herePc.c,-dmg); if(herePc.hpCur!=null) herePc.hpCur=herePc.c.hp.cur; msg+=' · 💥 '+dmg+' damage to '+herePc.name; }
    else if(hereMo){ hereMo.hp=Math.max(0,hereMo.hp-dmg); msg+=' · 💥 '+dmg+' damage to '+hereMo.name; }
    else msg+=' · the trap snaps on empty air';
  }
  if(o.type==='trap'&&actionId==='disarm'){
    msg+=' · safe';
  }
  if(o.type==='cauldron'&&actionId==='tip'){
    // Splash acid on 4 adjacent floor tiles
    if(!s.map.tiles) s.map.tiles={};
    [[x+1,y],[x-1,y],[x,y+1],[x,y-1]].forEach(([ax,ay])=>{
      if(ax<0||ay<0||ax>=s.map.cols||ay>=s.map.rows) return;
      const tk=ax+','+ay; const ter=s.map.tiles[tk];
      if(ter==='wall'||isPitTerrain(ter)||isFullWall(ter)) return;
      s.map.tiles[tk]='acid';
    });
    msg+=' · acid floods adjacent tiles';
  }
  if(o.type==='chest'&&actionId==='open'){
    const gp=(rollNotation('2d6')||{total:7}).total*5;
    if(c&&c.currency){ c.currency.gp=(c.currency.gp||0)+gp; msg+=' · 💰 found '+gp+' gp'; }
    else msg+=' · 💰 '+gp+' gp inside';
  }
  if(o.type==='bell'&&actionId==='ring'){
    msg='🔔 The bell clangs through the halls!';
    // Simple alert: monsters get a free turn-skip log (future: aggro)
    (s.monsters||[]).forEach(m=>{ if(m.hp>0) m.alerted=true; });
    if(typeof qbLog==='function'&&s===QB) qbLog('🔔 Alarm! Hostiles are alerted');
  }
  if(o.type==='drawbridge'&&(actionId==='lower'||actionId==='raise')){
    applyDrawbridgeTiles(s, key, o.state);
  }
  if(o.type==='torch'){
    syncTorchLightPoint(s, key, o.state==='lit');
  }
  syncInteractDecor(s);
  return {ok:true, msg:msg||(def.name+' used')};
}

function applyDrawbridgeTiles(s, key, state){
  const o=s.map.interact[key]; if(!o) return;
  if(!s.map.tiles) s.map.tiles={};
  const span=o.span||[];
  // Default: bridge cell itself
  const keys=span.length?span:[key];
  keys.forEach(k=>{
    if(state==='lowered') s.map.tiles[k]='wood';
    else s.map.tiles[k]='void';
  });
}

function listInteractInRange(s, from, tiles){
  if(!s.map||!s.map.interact) return [];
  const out=[];
  Object.keys(s.map.interact).forEach(k=>{
    const [x,y]=k.split(',').map(Number);
    if(gridDist(from.x,from.y,x,y)>tiles) return;
    const o=s.map.interact[k];
    if(!o||!INTERACT_TYPES[o.type]) return;
    out.push({key:k, x, y, obj:o, def:INTERACT_TYPES[o.type]});
  });
  // Any decor placed without a matching interact entry (live-painted by the DM, or a
  // hand-authored preset that only set dc[key]) gets promoted to a real, usable object —
  // torch/campfire were the only case handled here before; now it's every interactable kind.
  Object.keys(s.map.decor||{}).forEach(k=>{
    if(s.map.interact&&s.map.interact[k]) return;
    const kind=s.map.decor[k];
    const promo=DECOR_TO_INTERACT[kind]||(kind==='campfire'?{type:'torch',state:'lit'}:null);
    if(!promo) return;
    const [x,y]=k.split(',').map(Number);
    if(gridDist(from.x,from.y,x,y)>tiles) return;
    if(!s.map.interact) s.map.interact={};
    s.map.interact[k]={type:promo.type, state:promo.state};
    out.push({key:k, x, y, obj:s.map.interact[k], def:INTERACT_TYPES[promo.type]});
  });
  return out.sort((a,b)=>gridDist(from.x,from.y,a.x,a.y)-gridDist(from.x,from.y,b.x,b.y));
}

function savedMaps(){ try{ return JSON.parse(localStorage.getItem('grimoire.maps')||'{}'); }catch(e){ return {}; } }

function sanitizeDecorInPlace(decor){
  if(!decor) return {};
  const out={};
  Object.keys(decor).forEach(k=>{
    let kind=String(decor[k]||'').toLowerCase(); if(!kind) return;
    if(kind==='tree'||kind==='tree2'){ out[k]=kind; return; }
    if(kind.includes('tree')){ out[k]='tree'; return; } // never mini-trees
    if(kind.includes('bush')){ out[k]=kind==='bush2'||kind==='bush3'?kind:'bush'; return; }
    if(kind==='stump'||kind==='log'||kind==='mushroom'||kind==='flower'){ out[k]='bush'; return; }
    out[k]=kind; // mesh/interact props pass through
  });
  return out;
}

function campaigns(){ try{ return JSON.parse(localStorage.getItem('grimoire.campaigns')||'{}'); }catch(e){ return {}; } }

function campaignSnapshot(s){ return JSON.parse(JSON.stringify({battle:s.battle, map:s.map, monsters:s.monsters||[], players:(s.players||[]).map(p=>Object.assign({},p,{online:false})), order:s.order||[], turn:s.turn||0})); }

function mergeCampaignPlayers(saved, live, remap){ remap=remap||{};
  const out=(saved||[]).map(p=>Object.assign({},p,{online:false}));
  (live||[]).forEach(lp=>{ const sp=lp.cid && out.find(p=>p.cid===lp.cid);
    if(sp){ if(sp.id&&sp.id!==lp.id) remap[sp.id]=lp.id;
      Object.assign(sp,{id:lp.id, online:lp.online!==false, name:lp.name, cls:lp.cls, level:lp.level, hpCur:lp.hpCur, hpMax:lp.hpMax, ac:lp.ac, init:lp.init}); }
    else out.push(lp); });
  return out; }

function monsterDmgMult(mo, dtype){ if(!mo||!dtype) return 1; const r=MONSTER_RVI[mo.base||mo.name]; if(!r) return 1; const d=String(dtype).toLowerCase();
  if((r.imm||[]).includes(d)) return 0; if((r.vuln||[]).includes(d)) return 2; if((r.res||[]).includes(d)) return 0.5; return 1; }

function loadHomebrewMonsters(){ try{ const v=JSON.parse(localStorage.getItem('grimoire.homebrewMonsters')); return Array.isArray(v)?v:[]; }catch(e){ return []; } }

function saveHomebrewMonster(m){ const all=loadHomebrewMonsters(); const i=all.findIndex(x=>x.n===m.n); if(i>=0) all[i]=m; else all.push(m);
  try{ localStorage.setItem('grimoire.homebrewMonsters', JSON.stringify(all)); }catch(e){ flashBanner('Could not save (storage full?)'); return false; } return true; }

function deleteHomebrewMonster(name){ const all=loadHomebrewMonsters().filter(x=>x.n!==name); try{ localStorage.setItem('grimoire.homebrewMonsters', JSON.stringify(all)); }catch(e){} }

function monsterDef(name){ if(!name) return null; return MONSTERS_5E.find(m=>m.n===name) || loadHomebrewMonsters().find(m=>m.n===name) || null; }

function monsterSaveBonus(mo){ const base=monsterDef(mo.base||mo.name); const cr=crToNum(base?base.cr:1); return Math.min(9, 1+Math.floor(cr/2)); }

function monsterCR(mo){ const base=monsterDef(mo.base||mo.name); return crToNum(base?base.cr:1); }

function detectThoughtsFlavor(mo){
  const name=(mo&&(mo.base||mo.name))||'';
  const hit=DETECT_THOUGHTS_FLAVOR.find(([re])=>re.test(name));
  return hit ? hit[1] : DETECT_THOUGHTS_FALLBACK;
}

function castDetectThoughts(c, mo, log){
  const eff=(c.effects||[]).find(e=>e.name==='Detect Thoughts');
  if(eff) eff.targetId=mo.id;
  const flavor=detectThoughtsFlavor(mo);
  const msg='🧠 Surface thoughts of '+mo.name+': "'+flavor+'"';
  logChange(c, msg);
  if(log) log(msg);
  flashBanner(msg);
  return flavor;
}

function parseMonsterAttacks(str){
  // Built-in bestiary entries are structured data (v120.243); only user-typed homebrew/NPC strings
  // reach the prose parser below, which for them is the intended behaviour. Returns copies so a
  // caller mutating an attack (e.g. stamping a rolled value on it) can't corrupt the shared table.
  const mech=MONSTER_MECH[str];
  if(mech) return mech.map(a=>Object.assign({}, a, {raw:str}));
  return (str||'').split('·').map(s=>s.trim()).filter(Boolean).map(part=>{
  const hit=part.match(/\+(\d+)\s*\(/)||part.match(/\+(\d+)/); const dc=part.match(/DC\s*(\d+)\s*(Str|Dex|Con|Int|Wis|Cha)/i);
  const dmg=part.match(/(\d+d\d+(?:\s*\+\s*\d+)?)/); const name=part.split(/\s*\(|\s*\+/)[0].trim();
  // Damage type (e.g. "2d8+4 bludgeoning", "4d6 fire") — previously unparsed, so monster hits
  // reached applyHp with no dtype and the target's resistances/immunities/vulnerabilities by type
  // never applied (nor could Absorb Elements know the damage was elemental). Now extracted.
  const dt=part.match(/\b(acid|cold|fire|lightning|thunder|poison|necrotic|radiant|psychic|force|bludgeoning|piercing|slashing)\b/i);
  let tiles=/reach/i.test(part)?2:1;
  if(/breath|cone|line/i.test(part)) tiles=6;
  // `stinger` and `spike` were in this ranged list and are melee terms — a Wyvern's Stinger came
  // out as a 120 ft ranged attack (v120.243). Nothing in the bestiary uses "spike" at all, and the
  // Wyvern is the only "stinger", so removing both is safe and also fixes homebrew monsters whose
  // attacks are still parsed from prose by design.
  else if(/bow|crossbow|sling|javelin|dart|spit|ray|bolt|hurl|thrown|web|net/i.test(part)) tiles=24;
  // a condition this attack inflicts on a hit (parity with spells imposing conditions on monsters)
  let cond=null;
  if(/prone/i.test(part)) cond='Prone';
  else if(/paralyz/i.test(part)) cond='Paralyzed';
  else if(/petrif/i.test(part)) cond='Petrified';
  else if(/stun/i.test(part)) cond='Stunned';
  else if(/grapple|constrict/i.test(part)) cond='Grappled';
  else if(/restrain|\bweb\b/i.test(part)) cond='Restrained';
  else if(/frighten|\bfear\b/i.test(part)) cond='Frightened';
  else if(/blinded/i.test(part)) cond='Blinded';
  else if(/charm/i.test(part)) cond='Charmed';
  else if(/poisoned/i.test(part)) cond='Poisoned';
  // Fall back to the attack's NAME when the prose didn't state a type (v120.239). Most bestiary
  // entries read "Scimitar +4 (1d6+2)" and never say "slashing", which left 80% of monster attacks
  // untyped and therefore immune to every resistance/vulnerability rule. The WEAPONS catalog is
  // consulted first so manufactured weapons stay single-sourced there rather than duplicated.
  let dtype = dt ? dt[1].toLowerCase() : '';
  if(!dtype && name){
    const w=WEAPONS.find(x=>x.n.toLowerCase()===name.toLowerCase());
    dtype = (w && w.dt) || MONSTER_ATK_DTYPE[name] || '';
  }
  return {name:name||'Attack', hit:hit?Number(hit[1]):null, dc:dc?{n:Number(dc[1]),ab:dc[2]}:null, dmg:dmg?dmg[1].replace(/\s+/g,''):null, dtype, tiles, cond, raw:part}; }); }

function spellCondOf(name){ const sc=SPELL_COND[name]; return sc?{c:sc.c, rounds:sc.r}:null; }

function unitController(u){ return u.controller || (u.side==='mon' ? (u.brain||'tactical') : 'human'); }

function abilCheckBonus(cs, ab){ return cs ? saveMod(cs,ab) : 0; }

function crToNum(cr){ const s=String(cr==null?0:cr); if(s.includes('/')){ const [a,b]=s.split('/').map(Number); return b?a/b:0; } return Number(s)||0; }

function crXP(cr){ return CR_XP[String(cr==null?'0':cr)]||0; }

function partyXPThresholds(levels){
  const out={easy:0,medium:0,hard:0,deadly:0};
  (levels||[]).forEach(l=>{ const t=CHAR_XP_THRESH[Math.max(1,Math.min(20,Number(l)||1))]; if(t){ out.easy+=t.easy; out.medium+=t.medium; out.hard+=t.hard; out.deadly+=t.deadly; } });
  return out;
}

function encounterMultiplier(monsterCount, partySize){
  const n=Math.max(1,monsterCount);
  let idx = n<=1?0 : n<=2?1 : n<=6?2 : n<=10?3 : n<=14?4 : 5;
  if(partySize<3) idx=Math.min(ENCOUNTER_MULT_STEPS.length-1, idx+1);
  else if(partySize>5) idx=Math.max(0, idx-1);
  return ENCOUNTER_MULT_STEPS[idx];
}

function encounterDifficulty(crs, partyLevels){
  const totalXP=(crs||[]).reduce((s,cr)=>s+crXP(cr),0);
  const adjXP=Math.round(totalXP*encounterMultiplier((crs||[]).length, (partyLevels||[]).length||1));
  const thresh=partyXPThresholds(partyLevels);
  let rating='Trivial';
  if(adjXP>=thresh.deadly) rating='Deadly'; else if(adjXP>=thresh.hard) rating='Hard';
  else if(adjXP>=thresh.medium) rating='Medium'; else if(adjXP>=thresh.easy) rating='Easy';
  return {totalXP, adjXP, thresh, rating};
}

function qbAC(u){ return u.side==='pc'?computeAC(u.c,{ignoreEffects:u.x!=null&&inAntimagicField(QB,u.x,u.y)}):u.ac; }

function qbHP(u){ return u.side==='pc'?u.c.hp.cur:u.hp; }

function qbName(u){ return u.name; }

function qbReach(u){ if(u.side==='pc'){ return 1; } const a=parseMonsterAttacks(u.atk).filter(x=>x.hit!=null); const t=Math.max(1,...a.map(x=>x.tiles||1).filter(n=>n<=2)); return t||1; }

function qbAlive(u){ return qbHP(u)>0; }

function qbUnitById(id){ return QB.players.find(p=>p.id===id)||QB.monsters.find(m=>m.id===id); }

function qbLog(m,s){ s=s||QB; s.log=s.log||[]; s.log.unshift({m, t:Date.now()}); if(s.log.length>40) s.log.pop(); }

function qbHurt(u, dmg, dtype){ if(u.side==='pc'){ applyHp(u.c, -dmg, dtype); u.hpCur=u.c.hp.cur; } else { u.hp=Math.max(0,u.hp-dmg); if(dmg>0&&u.conds) u.conds=u.conds.filter(x=>x.name!=='Asleep'); } }   // damage wakes sleepers (PHB)

function wildShapeAttacks(c){ if(!c.wildShape) return []; return parseMonsterAttacks(c.wildShape.atk).map(a=>({name:a.name, toHit:a.hit||0, dmg:a.dmg||'1d4', dt:'', tiles:a.tiles||1, melee:(a.tiles||1)<=2})); }

function pcAttackList(c){
  if(c.wildShape) return wildShapeAttacks(c);
  const out=[];
  weaponItems(c).forEach(({it})=>{ const w=weaponByName(it.name); if(!w) return; const b=weaponDmgBonus(c,w,it);
    out.push({name:it.name+(it.magicBonus?' +'+it.magicBonus:''), toHit:weaponToHit(c,w,it), dmg:w.dmg+(b?sgn(b):''), dt:w.dt||'', tiles:weaponRangeTiles(c,w), melee:w.type!=='ranged', reach:/reach/.test(w.props||''), vers:w.vers?(w.vers+(b?sgn(b):'')):''});
    // Crossbow Expert (PHB): once you've made the Attack action, a bonus-action extra shot
    // with a hand crossbow you're holding — same bonus-action gate (atk.offhand) two-weapon
    // fighting's off-hand attack already uses, so it needs no new UI plumbing at all.
    if(it.name==='Hand Crossbow' && hasFeat(c,'Crossbow Expert')) out.push({name:it.name+(it.magicBonus?' +'+it.magicBonus:'')+' (Crossbow Expert)', toHit:weaponToHit(c,w,it), dmg:w.dmg+(b?sgn(b):''), dt:w.dt||'', tiles:weaponRangeTiles(c,w), melee:false, offhand:true}); });
  // Two-Weapon Fighting off-hand attack (PHB).
  if(canOffhand(c)){ const seen=new Set(); offhandWeapons(c).forEach(w=>{ if(seen.has(w.n)) return; seen.add(w.n);
    out.push(Object.assign({tiles:weaponRangeTiles(c,w), melee:w.type!=='ranged'}, offhandAtk(c,w))); }); }
  (c.attacks||[]).forEach(a=>{ const bn=Number(String(a.bonus).replace(/[^0-9-]/g,''))||0; out.push({name:a.name, toHit:bn, dmg:a.damage||'1d4', dt:'', tiles:1, melee:true}); });
  // Alter Self's "natural weapons" option (PHB): unarmed strikes deal 1d6 and count as
  // magical — a real damage bump over the flat 1+STR fallback below, not just cosmetic.
  if(hasNaturalWeapons(c)) out.push({name:'Claws (Alter Self)', toHit:mod(abil(c,'str'))+profBonus(c), dmg:'1d6', dt:'slashing', tiles:1, melee:true});
  if(c.cls==='Monk') out.push(martialArtsUnarmedAtk(c));
  // Tavern Brawler: unarmed strikes deal 1d4 instead of the flat 1+Str fallback (offered
  // alongside any weapons — the feat doesn't replace them, just makes punching worthwhile).
  else if(hasFeat(c,'Tavern Brawler')) out.push({name:'Unarmed strike (Tavern Brawler)', toHit:mod(abil(c,'str'))+profBonus(c), dmg:'1d4'+sgn(mod(abil(c,'str'))), dt:'bludgeoning', tiles:1, melee:true});
  if(!out.length) out.push({name:'Unarmed strike', toHit:mod(abil(c,'str'))+profBonus(c), dmg:String(1+mod(abil(c,'str'))), dt:'bludgeoning', tiles:1, melee:true});
  return out;
}

function qbPcAttacks(c){ return pcAttackList(c); }

function hasNaturalWeapons(c){ return !!(c&&(c.effects||[]).some(e=>e.name==='Alter Self')); }

function martialArtsUnarmedAtk(c){ const m=Math.max(mod(abil(c,'str')),mod(abil(c,'dex'))); return {name:'Unarmed Strike', toHit:m+profBonus(c), dmg:'1d'+martialArtsDie(c)+sgn(m), dt:'bludgeoning', tiles:1, melee:true}; }

function qbInRange(att, tgt, atk){ if(!inBlast(att.x,att.y,tgt.x,tgt.y,atk.tiles||1)) return false; if((atk.tiles||1)>1) return losClear(QB,att.x,att.y,tgt.x,tgt.y); return true; }

function qbEnemiesAlive(){ return QB.monsters.some(isHostile); }   // allies / dominated don't keep the fight going

function qbCheckEnd(){ if(!QB) return;
  // A Dominate spell's concentration has nothing left to hold onto once its target dies (or if
  // the initial save succeeded and nothing was ever dominated) — without this it kept prompting
  // concentration saves for a pet that no longer exists. Checked here since qbCheckEnd already
  // runs after every damage-dealing action, so this fires the instant the dominated monster dies.
  const c=QB.players[0].c;
  if(c.concentration && c.concentration.active && DOMINATE_SPELLS.has(c.concentration.spell) && !QB.monsters.some(m=>m.hp>0 && isDominated(m))){
    const spell=c.concentration.spell;
    c.effects=(c.effects||[]).filter(e=>!e.conc); c.concentration={active:false, spell:''};
    logChange(c,'💨 '+spell+' ends — no dominated creature remains'); qbLog('💨 '+spell+' ends — no dominated creature remains');
  }
  // Summon concentration: if all summons for that spell die, drop concentration (optional PHB-ish cleanup)
  if(c.concentration && c.concentration.active && SUMMON_CONC_SPELLS.has(c.concentration.spell)){
    const spell=c.concentration.spell;
    const alive=QB.monsters.some(m=>m.hp>0&&m.summoned&&m.spell===spell);
    if(!alive){
      c.effects=(c.effects||[]).filter(e=>e.name!==spell);
      if(c.concentration.spell===spell) c.concentration={active:false, spell:''};
      qbLog('💨 '+spell+' ends — summoned creature is gone');
    }
  }
  pruneDeadSummons(QB);
  checkMountDeaths(QB, qbLog);
  if(QB.players[0].c.hp.cur<=0){ QB.over='lose'; } else if(!qbEnemiesAlive()){ QB.over='win'; } }

function forgeRandomReturnQuiet(){
  const before=DB.length;
  const ans={style:rndPick(['martial','arcane','divine','primal','stealth','support']), heritage:'common', vibe:rndPick(['heroic','grim','wild','noble']), power:String(1+rnd(4)), exactClass:''};
  _suppressRender=true;
  try{ forgeRandom(ans); } finally{ _suppressRender=false; }
  return DB.length>before?DB[DB.length-1]:(DB.find(c=>c.id===curId)||null);
}

function forgeRandomReturn(){ const before=DB.length; forgeRandom({style:rndPick(['martial','arcane','divine','primal','stealth','support']), heritage:'common', vibe:rndPick(['heroic','grim','wild','noble'])}); return DB.length>before?DB[DB.length-1]:null; }

function qbPlaceUnits(){ const s=QB, cols=s.map.cols, rows=s.map.rows;
  const free=(x,y)=>{ if(x<0||y<0||x>=cols||y>=rows) return false;
    const t=TERRAIN[(s.map.tiles||{})[x+','+y]]; if(t&&t.solid) return false;
    const dd=DECOR[decorAt(s,x,y)]; if(dd&&dd.solid) return false;
    // Never spawn a unit standing ON a functional interactable (door, armed trap, lever,
    // barrel...) even when it isn't flagged solid — live report: PC spawning wedged in the
    // open-doorway tile itself on border-walled interior maps (Tavern/Castle) read as "spawned
    // inside an obstacle" even though door_open isn't technically solid.
    if(s.map.interact && s.map.interact[x+','+y]) return false;
    return true; };
  const taken=()=>s.players.concat(s.monsters).filter(u=>u.x!=null);
  const occupied=(x,y)=>taken().some(u=>u.x===x&&u.y===y);
  const pc=s.players[0]; const cx=Math.floor(cols/2);
  // Prefer south open grass for PC (Mechanics Lab, etc.) — start one row inside the border so a
  // boxed interior map's south wall (rows-1) never wins by virtue of being scanned first.
  pcloop: for(let r=Math.max(0,rows-2);r>=0;r--){ for(let o=0;o<cols;o++){ const x=cx+((o%2)?1:-1)*Math.ceil(o/2); if(free(x,r)&&!occupied(x,r)){ pc.x=x; pc.y=r; break pcloop; } } }
  // Fast placement: sample candidates (full losClear on every free cell lagged 32×24 maps hard).
  // Prefer mid-range ring around PC; only run LoS on a shortlist.
  const need=s.monsters.length; const cand=[];
  const step=cols*rows>400?2:1;
  for(let y=0;y<rows;y+=step) for(let x=0;x<cols;x+=step){
    if(!free(x,y)||occupied(x,y)||(x===pc.x&&y===pc.y)) continue;
    const dist=gridDist(pc.x,pc.y,x,y);
    if(dist<3||dist>14) continue;
    cand.push({x,y,dist,score:Math.abs(dist-7)});
  }
  cand.sort((a,b)=>a.score-b.score);
  const short=cand.slice(0, Math.min(cand.length, need*12+20));
  short.forEach(sp=>{ sp.score+=(losClear(s,pc.x,pc.y,sp.x,sp.y)?0:40); });
  short.sort((a,b)=>a.score-b.score);
  let p=0;
  for(const sp of short){
    if(p>=need) break;
    if(occupied(sp.x,sp.y)) continue;
    s.monsters[p].x=sp.x; s.monsters[p].y=sp.y; p++;
  }
  // Fallback: any free tile
  for(let r=0;r<rows && p<need;r++) for(let x=0;x<cols && p<need;x++){
    if(free(x,r)&&!occupied(x,r)){ s.monsters[p].x=x; s.monsters[p].y=r; p++; }
  }
}

function qbCurrent(){ return QB.order[QB.turn]; }

function qbSnapshotForUndo(){ try{ qbTurnSnapshot=JSON.parse(JSON.stringify(QB)); }catch(e){ qbTurnSnapshot=null; } }

function qbUndoAvailable(){ return !!qbTurnSnapshot; }

function qbEndPcTurn(){ const o=qbCurrent(); if(o&&o.k==='p'){ const c=QB.players[0].c; if(timeStopExtraTurn(c)) return; QB.moveMode=false; qbNextTurn(); } }

function combatFlavor(kind, ctx){
  const a=ctx.attacker||'You', t=ctx.target||'the foe', w=ctx.weapon||'the attack';
  const pool={
    ready_melee:[`${a} grips ${w} and sizes up ${t}.`,`Steel whispers as ${a} sets for a strike on ${t}.`,`${a} steps in — ${w} ready.`],
    ready_ranged:[`${a} draws a bead on ${t}.`,`${a} steadies ${w}, waiting for the perfect moment.`,`${t} is in the open — ${a} takes aim.`],
    ready_spell:[`${a} gathers power — ${w} crackles toward ${t}.`,`Arcane fire pools in ${a}'s hand, eyes fixed on ${t}.`,`${a} intones the words; ${w} snaps into being.`],
    swing:[`The attack flies!`,`Steel cuts the air!`,`Here it comes!`],
    hit:[`A solid hit on ${t}!`,`${t} takes the blow!`,`It connects!`],
    crit:[`A devastating critical on ${t}!`,`Perfect strike — ${t} reels!`,`Natural 20! ${w} finds a gap!`],
    miss:[`${t} ducks aside!`,`The attack whistles past ${t}.`,`${t} twists — clean miss.`],
    fumble:[`A wild miss! Natural 1!`,`${a} overcommits — the attack goes wide.`],
    dmg_fire:[`Flames sear ${t}!`,`Fire blooms across ${t}!`],
    dmg_cold:[`Frost bites into ${t}!`],
    dmg_generic:[`${t} is wounded!`,`The damage lands hard.`],
    blast:[`${a} hurls a roaring sphere of flame!`,`The sky blooms orange as the blast arcs out!`],
    save_roll:[`Foes dive for cover — Dexterity saves!`],
  };
  const arr=pool[kind]||pool.hit;
  return arr[Math.floor(Math.random()*arr.length)];
}

function animateD20Face(el, finalVal, ms, onDone){
  if(!el){ onDone&&onDone(); return; }
  el.parentElement&&el.parentElement.classList.add('spinning');
  const t0=performance.now();
  (function tick(now){
    const p=Math.min(1,(now-t0)/ms);
    if(p<1){ el.textContent=String(1+Math.floor(Math.random()*20)); requestAnimationFrame(tick); }
    else { el.textContent=String(finalVal); el.parentElement&&el.parentElement.classList.remove('spinning'); onDone&&onDone(); }
  })(t0);
}

function playCombatShotFx(from, to, opts, done){
  opts=opts||{};
  const kind=opts.kind||'melee';
  const dtype=opts.dtype||'';
  const ranged=kind==='ranged'||kind==='spell'||(opts.tiles||0)>1;
  const pk=ranged
    ? (/fire/i.test(dtype)||kind==='spell'&&/fire|bolt|ball/i.test(dtype+kind)?'firebolt'
      : /pierce|arrow|bow/i.test(dtype)?'arrow':'bolt')
    : 'slash';
  if(pk==='arrow') sfx('arrow'); else if(pk==='firebolt') sfx('firebolt'); else sfx('swing');
  if(from&&to) mapProjectile(from.x, from.y, to.x, to.y, pk, dtype);
  const flight=ranged?600:350;
  setTimeout(()=>{
    if(opts.hit){ sfx(opts.crit?'crit':'hit'); attackFx(opts.crit?'crit':'hit', to.x, to.y); }
    else { sfx('miss'); attackFx('miss', to.x, to.y); }
    setTimeout(()=>{ done&&done(); }, 220);
  }, flight);
}

function playBlastFx(from, to, aoeR, dtype, done){
  sfx('firebolt');
  if(from&&to) mapProjectile(from.x, from.y, to.x, to.y, 'firebolt', dtype||'fire');
  setTimeout(()=>{
    mapBurst(to.x, to.y, aoeR||2, dtype||'fire');
    sfx('fireball');
    setTimeout(()=>{ done&&done(); }, 280);
  }, 320);
}

function reclaimPotential(c, log){
  if(!isEchoKnight(c,15)) return;
  if((c.hp.temp||0)>0) return;   // PHB: only if you have no temporary hit points already
  if(c.echoReclaimLeft==null) c.echoReclaimLeft=echoResourceMax(c);
  if(c.echoReclaimLeft<=0) return;
  c.echoReclaimLeft--;
  const gain=rollNotation('2d6').total+mod(abil(c,'con'));
  c.hp.temp=Math.max(0,gain);
  log('🩸 '+c.name+' reclaims the echo\'s potential — +'+c.hp.temp+' temporary HP');
}

function qbMonsterOAonPc(mo, pc){ if(mo.reactionUsed||mo.hp<=0) return; const a=parseMonsterAttacks(mo.atk).filter(x=>x.hit!=null && (x.tiles||1)<=1)[0]; if(!a) return; mo.reactionUsed=true; qbLog('⚔ Opportunity: '+mo.name); qbResolveAttack(mo, pc, {name:mo.name+' (opportunity)', toHit:a.hit||0, dmg:a.dmg||'1d6', tiles:1, dtype:a.dtype, cond:a.cond}); }

function qbPcOAonMonster(pc, mo){ const c=pc.c; if(c.battle.reaction||c.hp.cur<=0) return; const melee=qbPcAttacks(c).filter(a=>a.melee); if(!melee.length) return; c.battle.reaction=true; qbLog('⚔ Opportunity: '+c.name); qbResolveAttack(pc, mo, melee[0]); }

function qbApplyIntent(u, it, done){
  if(it.type==='attack'){ const tgt=qbUnitById(it.targetId); if(!tgt||qbHP(tgt)<=0||(u.attacksLeft||0)<=0){ done(); return; }
    u.attacksLeft--;   // Sanctuary's save-or-lose-the-attack gate lives in Engine.attack now (qbAdapter.sanctuaryDC)
    qbResolveAttack(u, tgt, it.atk, done); return; }
  if(it.type==='move'){ if(speedBlocked(u)){ done(); return; } const ufly=monsterFlies(u); const path=pathTo(QB, u.x,u.y, it.to.x, it.to.y, (u.moveLeft||0)+(it.dash?(u.speed||30):0), ufly, u);
    if(!path){ done(); return; }
    const cost=reachableCells(QB,u.x,u.y,(u.moveLeft||0)+(it.dash?(u.speed||30):0),ufly,u)[it.to.x+','+it.to.y]; if(cost==null){ done(); return; }
    if(it.dash){ u.moveLeft=(u.moveLeft||0)+(u.speed||30); u.attacksLeft=0; qbLog('🏃 '+u.name+' dashes'); }
    const fromX=u.x, fromY=u.y; u.moveLeft=Math.max(0,(u.moveLeft||0)-cost);
    const pc=QB.players[0]; const provokePc = pc.c.hp.cur>0 && leavesReach(fromX,fromY,it.to.x,it.to.y,pc.x,pc.y,1);
    // Camera follows the spotlight at turn START (qbBeginTurn) but nothing kept it on the
    // unit as it actually walked — a live report confirmed this exactly ("moves to where
    // the creature was then doesn't follow them once creature moves"). Re-frame on every
    // step of the move animation, not just once, so the camera tracks the monster the
    // whole way instead of just its starting tile.
    animateToken(null,(nx,ny)=>{ u.x=nx; u.y=ny; frameCameraOnCellSmooth(QB, nx, ny, 1.55); }, path, 220, ()=>{ save();
      if(!ufly){ qbCheckTerrainProne(QB,u,it.to.x,it.to.y,false); checkTrapTrigger(QB,u,it.to.x,it.to.y,false); }
      Events.emit({type:'move', id:u.id, by:u.name, to:it.to, fly:ufly});
      if(provokePc) qbPcOAonMonster(pc, u);
      setTimeout(done, provokePc?500:0); }, u);
    return; }
  done();
}

function qbSpendAttackBudget(c){
  const b=c.battle, full=extraAttacks(c)+1;
  if((b.attacksLeft||0)<=0){ if(!hasAction(c)){ flashBanner('No attacks or actions left'); return false; } spendAction(c); b.attacksLeft=full; }
  else if((b.attacksLeft||0)>=full){ if(!hasAction(c)){ flashBanner('No actions left'); return false; } spendAction(c); }
  b.attacksLeft=Math.max(0,(b.attacksLeft||0)-1);
  return true;
}

function tileClearFor(s, x, y){
  const cols=s.map.cols, rows=s.map.rows;
  if(x<0||y<0||x>=cols||y>=rows) return false;
  const tk=(s.map.tiles||{})[x+','+y], td=TERRAIN[tk];
  if(td&&td.solid) return false;   // walls and pits both stop a shove (no fly-push modeled)
  const dd=DECOR[decorAt(s,x,y)]; if(dd&&dd.solid) return false;
  return true;
}

function servantMoveTiles(ad, servant){
  const out=[];
  for(let dx=-3;dx<=3;dx++) for(let dy=-3;dy<=3;dy++){
    if(Math.max(Math.abs(dx),Math.abs(dy))>3 || (dx===0&&dy===0)) continue;
    const nx=servant.x+dx, ny=servant.y+dy;
    if(tileClearFor({map:ad.map()},nx,ny)) out.push({x:nx,y:ny});
  }
  return out;
}

function maneuverShove(ad, pcUnit, mo, mode, log, tiles, skipBudget){
  tiles=Math.max(1, Number(tiles)||1);
  const c=ad.checkSubject(pcUnit);
  if(gridDist(pcUnit.x,pcUnit.y,mo.x,mo.y)>1){ flashBanner('Too far to shove — must be adjacent'); return {ok:false}; }
  if(!skipBudget && !qbSpendAttackBudget(c)) return {ok:false};
  if(c.conditions&&c.conditions.Hidden){ delete c.conditions.Hidden; c.hiddenDC=null; } // a maneuver reveals you like any attack
  const name=ad.name(pcUnit), moName=ad.name(mo);
  const res=opposedCheck(c,'athletics','str', ad.checkSubject(mo), [['athletics','str'],['acrobatics','dex']]);
  const detail='('+res.attacker.total+' vs '+res.defender.total+')';
  const rollInfo={atkTotal:res.attacker.total, defTotal:res.defender.total, atkSkill:'Athletics', defSkill:res.defender.skillKey==='athletics'?'Athletics':'Acrobatics'};
  if(!res.success){ log('🤼 '+name+' tries to shove '+moName+' '+detail+' — fails'); flashBanner('Shove failed'); return Object.assign({ok:true, success:false}, rollInfo); }
  if(mode==='prone'){
    ad.addCond(mo,'Prone');
    log('🤼 '+name+' shoves '+moName+' '+detail+' — knocked Prone');
    flashBanner(moName+' is knocked Prone!');
  } else {
    const dx=Math.sign(mo.x-pcUnit.x), dy=Math.sign(mo.y-pcUnit.y);
    let moved=0, cx=mo.x, cy=mo.y;
    for(let i=0;i<tiles;i++){ const nx=cx+dx, ny=cy+dy; if(!tileClearFor({map:ad.map()},nx,ny)) break; cx=nx; cy=ny; moved++; }
    if(moved>0){ ad.moveUnit(mo,cx,cy); log('🤼 '+name+' shoves '+moName+' '+detail+' — pushed back '+(moved*5)+' ft'); }
    else log('🤼 '+name+' shoves '+moName+' '+detail+' — pushed, but there\'s nowhere to go');
    flashBanner(moName+' is pushed back!');
  }
  sfx('hit');
  return Object.assign({ok:true, success:true}, rollInfo);
}

function openHandTechnique(ad, pcUnit, mo, technique, log){
  const c=ad.checkSubject(pcUnit), dc=kiDC(c), name=ad.name(pcUnit), moName=ad.name(mo);
  if(technique==='prone'){
    const roll=rnd(20)+(ad.saveBonus?ad.saveBonus(mo,'dex'):0);
    if(roll<dc){ ad.addCond(mo,'Prone'); log('🥋 Open Hand Technique — '+moName+' fails a Dex save (DC '+dc+', rolled '+roll+') and is knocked Prone'); flashBanner(moName+' is knocked Prone!'); }
    else { log('🥋 Open Hand Technique — '+moName+' resists (Dex '+roll+' vs DC '+dc+')'); flashBanner(moName+' resists the push'); }
  } else if(technique==='push'){
    const roll=rnd(20)+(ad.saveBonus?ad.saveBonus(mo,'str'):0);
    if(roll<dc){
      const dx=Math.sign(mo.x-pcUnit.x)||0, dy=Math.sign(mo.y-pcUnit.y)||0;
      for(let i=0;i<3;i++){ const nx=mo.x+dx, ny=mo.y+dy; if(!tileClearFor({map:ad.map()},nx,ny)) break; ad.moveUnit(mo,nx,ny); }
      log('🥋 Open Hand Technique — '+moName+' fails a Str save (DC '+dc+', rolled '+roll+') and is pushed back'); flashBanner(moName+' is pushed away!');
    } else { log('🥋 Open Hand Technique — '+moName+' resists (Str '+roll+' vs DC '+dc+')'); flashBanner(moName+' resists the push'); }
  } else if(technique==='noreact'){
    mo.reactionUsed=true;
    log('🥋 Open Hand Technique — '+moName+" can't take reactions until the end of your next turn");
    flashBanner(moName+" can't take reactions!");
  }
}

function flurryOfBlows(ad, pcUnit, mo, technique, log){
  const c=ad.checkSubject(pcUnit);
  if(gridDist(pcUnit.x,pcUnit.y,mo.x,mo.y)>1){ flashBanner('Too far — must be adjacent'); return {ok:false}; }
  if(c.battle && c.battle.bonus){ flashBanner('Bonus action already used'); return {ok:false}; }
  if(c.kiLeft==null) c.kiLeft=kiMax(c);
  if((c.kiLeft||0)<=0){ flashBanner('No ki points left — rest to recharge'); return {ok:false}; }
  if(c.battle) c.battle.bonus=true;
  c.kiLeft--;
  const atk=martialArtsUnarmedAtk(c), name=ad.name(pcUnit), moName=ad.name(mo);
  let anyHit=false;
  for(let i=0;i<2;i++){
    const ev=Engine.attack(ad, pcUnit.id, mo.id, {name:'Flurry of Blows', toHit:atk.toHit, dmg:atk.dmg, dtype:atk.dt, tiles:1});
    if(ev.hit){ anyHit=true; log('🥋 '+name+' Flurry of Blows hits '+moName+' for '+ev.dmg); }
    else log('🥋 '+name+' Flurry of Blows misses '+moName);
  }
  if(anyHit && technique && isOpenHandMonk(c,3)) openHandTechnique(ad, pcUnit, mo, technique, log);
  flashBanner(anyHit?'🥋 Flurry of Blows connects!':'🥋 Flurry of Blows — both attacks miss');
  return {ok:true, anyHit};
}

function quiveringPalmStrike(ad, pcUnit, mo, log){
  const c=ad.checkSubject(pcUnit);
  if(gridDist(pcUnit.x,pcUnit.y,mo.x,mo.y)>1){ flashBanner('Too far — must be adjacent'); return {ok:false}; }
  if(c.kiLeft==null) c.kiLeft=kiMax(c);
  if((c.kiLeft||0)<3){ flashBanner('Needs 3 ki points'); return {ok:false}; }
  const atk=martialArtsUnarmedAtk(c), name=ad.name(pcUnit), moName=ad.name(mo);
  const ev=Engine.attack(ad, pcUnit.id, mo.id, {name:'Quivering Palm ('+atk.name+')', toHit:atk.toHit, dmg:atk.dmg, dtype:atk.dt, tiles:1});
  if(!ev.hit){ flashBanner('Quivering Palm — the strike misses, no ki spent'); log('🥋 '+name+' attempts Quivering Palm on '+moName+' — misses'); return {ok:true, hit:false}; }
  c.kiLeft-=3;
  mo.quiveringPalmBy=pcUnit.id;
  log('🥋 '+name+' hits '+moName+' for '+ev.dmg+' — Quivering Palm set, can be triggered any time before a long rest');
  flashBanner('🥋 Quivering Palm set on '+moName);
  return {ok:true, hit:true};
}

function quiveringPalmTrigger(ad, c, mo, log){
  const dc=kiDC(c);
  const roll=rnd(20)+(ad.saveBonus?ad.saveBonus(mo,'con'):0);
  mo.quiveringPalmBy=null;
  if(roll<dc){ ad.hurt(mo, mo.hp?mo.hp:9999); log('🥋 Quivering Palm triggered — '+ad.name(mo)+' fails a Con save (DC '+dc+') and drops to 0 HP'); flashBanner('💀 Quivering Palm — '+ad.name(mo)+' drops to 0 HP'); return {ok:true, killed:true}; }
  const r=rollNotation('10d10')||{total:0,detail:''};
  ad.hurt(mo, r.total);
  log('🥋 Quivering Palm triggered — '+ad.name(mo)+' saves (Con '+roll+' vs DC '+dc+') and takes '+r.total+' necrotic ('+r.detail+')');
  flashBanner('🥋 Quivering Palm — '+r.total+' necrotic damage');
  return {ok:true, killed:false, dmg:r.total};
}

function maneuverGrapple(ad, pcUnit, mo, log){
  const c=ad.checkSubject(pcUnit);
  if(gridDist(pcUnit.x,pcUnit.y,mo.x,mo.y)>1){ flashBanner('Too far to grapple — must be adjacent'); return {ok:false}; }
  if(!qbSpendAttackBudget(c)) return {ok:false};
  if(c.conditions&&c.conditions.Hidden){ delete c.conditions.Hidden; c.hiddenDC=null; } // a maneuver reveals you like any attack
  const name=ad.name(pcUnit), moName=ad.name(mo);
  const res=opposedCheck(c,'athletics','str', ad.checkSubject(mo), [['athletics','str'],['acrobatics','dex']]);
  const detail='('+res.attacker.total+' vs '+res.defender.total+')';
  const rollInfo={atkTotal:res.attacker.total, defTotal:res.defender.total, atkSkill:'Athletics', defSkill:res.defender.skillKey==='athletics'?'Athletics':'Acrobatics'};
  if(!res.success){ log('🤼 '+name+' tries to grapple '+moName+' '+detail+' — fails'); flashBanner('Grapple failed'); return Object.assign({ok:true, success:false}, rollInfo); }
  ad.addCond(mo,'Grappled');
  // Stores the grappler's NAME, not an id — the only identifier consistently meaningful
  // across every adapter (a player-net device's own "me" id isn't addressable from the DM's
  // sessionAdapter, which is what actually needs to look this back up for a monster's Escape
  // Grapple — see maneuverEscape's !isPc branch / ad.findGrappler below).
  mo.grappledBy=name;
  log('🤼 '+name+' grapples '+moName+' '+detail);
  flashBanner(moName+' is grappled!');
  sfx('hit');
  return Object.assign({ok:true, success:true}, rollInfo);
}

function maneuverTaunt(ad, pcUnit, mo, log){
  const c=ad.checkSubject(pcUnit);
  if(gridDist(pcUnit.x,pcUnit.y,mo.x,mo.y)>1){ flashBanner('Too far to taunt — must be adjacent'); return {ok:false}; }
  if(!qbSpendAttackBudget(c)) return {ok:false};
  if(c.conditions&&c.conditions.Hidden){ delete c.conditions.Hidden; c.hiddenDC=null; } // a maneuver reveals you like any attack
  const name=ad.name(pcUnit), moName=ad.name(mo);
  const res=opposedCheck(c,'intimidation','cha', ad.checkSubject(mo), [['insight','wis']]);
  const detail='('+res.attacker.total+' vs '+res.defender.total+')';
  const rollInfo={atkTotal:res.attacker.total, defTotal:res.defender.total, atkSkill:'Intimidation', defSkill:'Insight'};
  if(!res.success){ log('😠 '+name+' tries to taunt '+moName+' '+detail+' — fails'); flashBanner('Taunt failed'); return Object.assign({ok:true, success:false}, rollInfo); }
  ad.addCond(mo,'Frightened',3);
  log('😠 '+name+' taunts '+moName+' '+detail+' — Frightened');
  flashBanner(moName+' is Frightened of you!');
  sfx('hit');
  return Object.assign({ok:true, success:true}, rollInfo);
}

function maneuverIntimidate(ad, pcUnit, mo, log){
  const c=ad.checkSubject(pcUnit);
  if(!hasAction(c)){ flashBanner('No action left'); return {ok:false}; }
  if(gridDist(pcUnit.x,pcUnit.y,mo.x,mo.y)>6){ flashBanner('Too far — Intimidating Presence reaches 30 ft'); return {ok:false}; }
  if(mo.intimidateImmune){ flashBanner(mo.name+' already resisted this — immune for now'); return {ok:false}; }
  spendAction(c);
  const dc=8+profBonus(c)+mod(abil(c,'cha'));
  const roll=rnd(20)+(ad.saveBonus?ad.saveBonus(mo,'wis'):0);
  const name=ad.name(pcUnit), moName=ad.name(mo);
  if(roll>=dc){ mo.intimidateImmune=true; log('😱 '+name+' tries to intimidate '+moName+' (DC '+dc+', rolled '+roll+') — resists, immune for now'); flashBanner(moName+' resists — immune to this for 24 hours'); return {ok:true, success:false, dc, roll}; }
  ad.addCond(mo,'Frightened',2);
  log('😱 '+name+' intimidates '+moName+' (DC '+dc+', rolled '+roll+') — Frightened');
  flashBanner(moName+' is Frightened!');
  sfx('hit');
  return {ok:true, success:true, dc, roll};
}

function maneuverEscape(ad, unit, isPc, log){
  const c=isPc?ad.checkSubject(unit):null;
  if(isPc && !hasAction(c)){ flashBanner('No action left'); return {ok:false}; }
  const grappler = isPc
    ? ad.allMonsters().find(m=>m.hp>0 && gridDist(unit.x,unit.y,m.x,m.y)<=1) // simplification: nearest adjacent hostile (grapple ownership isn't tracked on the monster-attacks-PC path)
    : (unit.grappledBy && ad.findGrappler ? ad.findGrappler(unit.grappledBy) : null);
  if(!grappler){ flashBanner('Nothing to escape from'); return {ok:false}; }
  const res=opposedCheck(ad.checkSubject(grappler)||grappler, 'athletics', 'str', isPc?c:ad.checkSubject(unit), [['athletics','str'],['acrobatics','dex']]);
  const success=!res.success;
  const rollInfo={atkTotal:res.defender.total, defTotal:res.attacker.total, atkSkill:res.defender.skillKey==='athletics'?'Athletics':'Acrobatics', defSkill:'Athletics'};   // "attacker" here is the grappler, not the escaper — flip labels so the UI reads as "you vs grappler"
  if(isPc) spendAction(c);
  const name=isPc?ad.name(unit):unit.name;
  if(success){
    if(isPc){ if(c.conditions) delete c.conditions['Grappled']; }
    else { unit.conds=(unit.conds||[]).filter(x=>x.name!=='Grappled'); unit.grappledBy=null; }
    log('🤸 '+name+' escapes the grapple!');
    flashBanner('Escaped!');
  } else {
    log('🤸 '+name+' fails to escape the grapple');
    flashBanner('Escape failed');
  }
  return Object.assign({ok:true, success}, rollInfo);
}

/**
 * Can this unit hide from where it stands? Darkness, full cover from the nearest thing that
 * would see it, or (Skulker) dim light. Extracted from maneuverHide in v120.237 so the monster
 * side uses the SAME rule rather than a parallel copy — the mode-parity sin this codebase keeps
 * paying for. `watchers` is whoever would notice: hostiles from that unit's point of view.
 */
function hideEligibility(ad, unit, watchers, skulker){
  const mapS={map:ad.map()};
  const lvl=tileLightLevel(mapS, unit.x, unit.y);
  const closest=(watchers||[]).slice()
    .sort((a,b)=>gridDist(unit.x,unit.y,a.x,a.y)-gridDist(unit.x,unit.y,b.x,b.y))[0];
  const fullCover=!!(closest && coverBetween(mapS, unit.x,unit.y, closest.x, closest.y)>=5);
  return { ok: lvl===0 || (lvl===1 && skulker) || fullCover, light:lvl, fullCover };
}

/**
 * A monster takes the Hide action. Mirror of maneuverHide, and deliberately the same shape as
 * monsterSearchRoll: a monster's Stealth is its CR-derived DEX check, since the bestiary carries
 * no per-skill data. Until v120.237 nothing could ever set a monster's hiddenDC, which meant the
 * Search action (v120.232) had nothing to find and stealth only worked in one direction.
 */
function monsterHideRoll(mo){ return rnd(20)+mod(abil(deriveMonsterAbilities(mo),'dex')); }

function hideMonster(ad, mo, watchers, log){
  if(!(mo&&mo.hp>0)) return {ok:false};
  const el=hideEligibility(ad, mo, watchers, false);
  if(!el.ok) return {ok:true, success:false, why:'no darkness or full cover'};
  const total=monsterHideRoll(mo);
  mo.hiddenDC=total;
  mo.conds=(mo.conds||[]).filter(x=>x.name!=='Hidden').concat([{name:'Hidden', rounds:100}]);
  if(log) log('🫥 '+((mo.name||'The monster'))+' hides (Stealth '+total+')');
  return {ok:true, success:true, total};
}

/**
 * Attacking, or taking a loud action, ends hiding. One helper for BOTH unit shapes so the two
 * sides can't drift: a PC carries the flag on its character (`c.conditions.Hidden` + `c.hiddenDC`),
 * a monster on the unit itself (`conds[]` + `hiddenDC`).
 */
function revealUnit(u){
  if(!u) return false;
  let was=false;
  const c=u.c||(u.conditions?u:null);
  if(c && c.conditions && c.conditions.Hidden){ delete c.conditions.Hidden; c.hiddenDC=null; was=true; }
  if(u.hiddenDC!=null){ u.hiddenDC=null; was=true; }
  if(u.conds && u.conds.some(x=>x.name==='Hidden')){ u.conds=u.conds.filter(x=>x.name!=='Hidden'); was=true; }
  return was;
}

/**
 * Is `target` hidden from an observer with this passive Perception? 5e: you notice a hidden
 * creature automatically when your passive Perception meets or beats its Stealth total. Mirrors
 * the monster-AI filter that already existed for hidden PCs, so both directions use one rule.
 */
/**
 * Passive Perception of whoever is looking. Returns Infinity when the observer is unknown, so
 * callers that don't track one filter nothing — "can't see it" must never be the accidental
 * default, or targets would silently vanish from menus.
 */
function observerPassivePerception(observer){
  if(!observer) return Infinity;
  const c=observer.c||observer;
  if(c && c.abilities) return passiveScore(c,'perception','wis');
  if(observer.hp!=null) return monsterPassivePerception(observer);
  return Infinity;
}

function unitHiddenFrom(observerPassive, target){
  const dc = target ? (target.hiddenDC!=null ? target.hiddenDC
    : ((target.c&&target.c.conditions&&target.c.conditions.Hidden) ? (target.c.hiddenDC||0) : null)) : null;
  return dc!=null && observerPassive < dc;
}

function maneuverHide(ad, pcUnit, log){
  const c=ad.checkSubject(pcUnit);
  // Cunning Action (Rogue 2nd): Hide as a bonus action when it's still free, same preference
  // order Dash's own Cunning Action branch uses.
  const cunning=c.cls==='Rogue' && (Number(c.level)||1)>=2 && !(c.battle&&c.battle.bonus);
  if(!cunning && !hasAction(c)){ flashBanner('No action left'); return {ok:false}; }
  const foes=ad.allMonsters().filter(mo=>mo.hp>0&&isHostile(mo));
  const el=hideEligibility(ad, pcUnit, foes, hasFeat(c,'Skulker'));
  if(!el.ok){ flashBanner('Nothing to hide behind — need darkness, full cover, or (Skulker) dim light'); return {ok:true, success:false}; }
  if(cunning){ if(c.battle) c.battle.bonus=true; } else spendAction(c);
  const adv=skillCheckAdvantage(c,'stealth','dex');
  const r=rollSkillCheck(c,'stealth','dex',{adv:adv.adv, flatBonus:skillCheckBonus(c,'stealth')});
  if(!c.conditions) c.conditions={};
  c.conditions.Hidden=true; c.hiddenDC=r.total;
  log('🫥 '+ad.name(pcUnit)+' hides (Stealth '+r.total+')');
  flashBanner('Hidden! (Stealth '+r.total+' — foes must beat this to notice you)');
  return {ok:true, success:true};
}

function maneuverStudy(ad, pcUnit, mo, skillKey, log){
  const c=ad.checkSubject(pcUnit);
  if(!hasAction(c)){ flashBanner('No action left'); return {ok:false}; }
  spendAction(c);
  const dc=Math.min(30, 10+Math.round(monsterCR(mo)));
  const adv=skillCheckAdvantage(c,skillKey,'int');
  const r=rollSkillCheck(c,skillKey,'int',{adv:adv.adv});
  const ok=r.total>=dc;
  const rvi=MONSTER_RVI[mo.base||mo.name]||{};
  const parts=[];
  if((rvi.imm||[]).length) parts.push('immune to '+rvi.imm.join('/'));
  if((rvi.res||[]).length) parts.push('resists '+rvi.res.join('/'));
  if((rvi.vuln||[]).length) parts.push('vulnerable to '+rvi.vuln.join('/'));
  const info=parts.length?parts.join('; '):'nothing unusual';
  const name=ad.name(pcUnit), moName=ad.name(mo);
  log('📖 '+name+' studies '+moName+' ('+r.total+' vs DC '+dc+') — '+(ok?info:'learns nothing useful'));
  flashBanner(ok? moName+': '+info : "You don't recall anything useful");
  return {ok:true, success:ok};
}

/**
 * The Search action (PHB): "you devote your attention to finding something", resolved with a
 * Wisdom (Perception) or Intelligence (Investigation) check at the DM's discretion — hence
 * skillKey/abilKey rather than one hardcoded skill.
 *
 * Search already existed, but ONLY for monsters and only DM-side (`monsterSearchRoll`, wired to
 * the DM attack modal's #maSearch): a monster could hunt for a hidden player, while a PC had no
 * way to take the action at all. That asymmetry is the exact shape of the mode-parity problem
 * the harness in rules-test.js guards, so this is the shared PC-side half, adapter-driven like
 * every other maneuver and therefore identical in Quick Battle, DM-hosted and player-net.
 *
 * On finding: any hostile whose Stealth DC the check beats is revealed. Note that nothing in the
 * app currently gives a MONSTER a hiddenDC (only characters get one, via maneuverHide), so in
 * practice this usually finds nothing today and resolves as a logged Perception check for the
 * DM to adjudicate — which is what the PHB action actually is. It's written against hiddenDC
 * generally so it starts working the moment monsters can hide, rather than needing a rewrite.
 */
function maneuverSearch(ad, pcUnit, skillKey, log){
  const c=ad.checkSubject(pcUnit);
  if(!hasAction(c)){ flashBanner('No action left'); return {ok:false}; }
  const key=skillKey==='investigation'?'investigation':'perception';
  const abilKey=key==='investigation'?'int':'wis';
  spendAction(c);
  const adv=skillCheckAdvantage(c,key,abilKey);
  const r=rollSkillCheck(c,key,abilKey,{adv:adv.adv, flatBonus:skillCheckBonus(c,key)});
  const label=key==='investigation'?'Investigation':'Perception';
  // Only creatures that are actually hidden are candidates; a hiddenDC of null means "not hiding".
  const hidden=(ad.allMonsters?ad.allMonsters():[]).filter(mo=>mo.hp>0 && isHostile(mo) && mo.hiddenDC!=null);
  const found=hidden.filter(mo=>r.total>=mo.hiddenDC);
  found.forEach(mo=>{
    mo.hiddenDC=null;
    if(mo.conds) mo.conds=mo.conds.filter(x=>x.name!=='Hidden');
  });
  const name=ad.name(pcUnit);
  if(found.length){
    const who=found.map(mo=>ad.name(mo)).join(', ');
    log('🔍 '+name+' searches ('+label+' '+r.total+') and spots '+who+'!');
    flashBanner('🔍 Spotted '+who+'!');
  } else if(hidden.length){
    log('🔍 '+name+' searches ('+label+' '+r.total+') — finds nothing');
    flashBanner('🔍 You find nothing ('+label+' '+r.total+')');
  } else {
    log('🔍 '+name+' searches ('+label+' '+r.total+') — nothing is hidden nearby');
    flashBanner('🔍 '+label+' '+r.total+' — nothing hidden nearby (the DM may call for more)');
  }
  return {ok:true, success:found.length>0, total:r.total, found:found.length, skill:key};
}

function needsStabilizing(p){ return (p.hpCur||0)<=0 && !p.stable && (p.deathFail||0)<3; }

function maneuverStabilize(ad, pcUnit, targetName, log, opts){
  const c=ad.checkSubject(pcUnit);
  if(!hasAction(c)){ flashBanner('No action left'); return {ok:false}; }
  // Healer's Kit (PHB tool rule): a kit auto-stabilizes, no Medicine roll needed, at the cost
  // of one of its 10 uses. Healer feat: that same kit-stabilize also restores 1 HP.
  const useKit = !!(opts&&opts.kit) && hasHealersKit(c) && (c.healerKitCharges==null?10:c.healerKitCharges)>0;
  spendAction(c);
  let ok;
  if(useKit){
    c.healerKitCharges = (c.healerKitCharges==null?10:c.healerKitCharges) - 1;
    ok=true;
    log('🩹 '+ad.name(pcUnit)+' uses a healer\'s kit to stabilize '+targetName+' ('+c.healerKitCharges+' charge'+(c.healerKitCharges===1?'':'s')+' left)');
  } else {
    const adv=skillCheckAdvantage(c,'medicine','wis');
    const r=rollSkillCheck(c,'medicine','wis',{adv:adv.adv});
    ok=r.total>=10;
    log('⚕️ '+ad.name(pcUnit)+' tries to stabilize '+targetName+' ('+r.total+' vs DC 10) — '+(ok?'stable':'fails'));
  }
  flashBanner(ok?targetName+' is stabilized':'Stabilize failed');
  return {ok:true, success:ok, healerFeatHp: (ok && useKit && hasFeat(c,'Healer')) ? 1 : 0};
}

function qbApplyCond(mo,name){ const sc=SPELL_COND[name]; if(sc){ mo.conds=mo.conds||[]; if(!mo.conds.some(x=>x.name===sc.c)) mo.conds.push({name:sc.c,rounds:sc.r});
  if(sc.c==='No Reactions') mo.reactionUsed=true; } }   // Shocking Grasp: actually blocks its opportunity attack, not just a display tag

function paintHazardTerrain(s,ctr,aoeR,name,dc){ const st=SPELL_TERRAIN[name]||SPELL_GAS[name]; if(!st) return;
  s.map.tiles=s.map.tiles||{}; const cells=[];
  for(let x=Math.max(0,ctr.x-aoeR); x<=Math.min(s.map.cols-1,ctr.x+aoeR); x++)
    for(let y=Math.max(0,ctr.y-aoeR); y<=Math.min(s.map.rows-1,ctr.y+aoeR); y++){
      if(!inBlast(ctr.x,ctr.y,x,y,aoeR)) continue;
      const k=x+','+y, prevDef=TERRAIN[s.map.tiles[k]]; if(prevDef&&(prevDef.solid||prevDef.deadly)) continue;
      cells.push({x,y,prev:s.map.tiles[k]||null});
      if(st.terrain) s.map.tiles[k]=st.terrain;   // gas hazards (no st.terrain) leave the floor untouched
    }
  s.hazards=s.hazards||[]; s.hazards.push({cells, until:s.battle.round+st.rounds, name, dc, gas:!st.terrain});
}

function expireHazards(s){ if(!s.hazards||!s.hazards.length) return;
  s.hazards=s.hazards.filter(hz=>{ if(s.battle.round<hz.until) return true;
    hz.cells.forEach(c=>{ const k=c.x+','+c.y; if(c.prev) s.map.tiles[k]=c.prev; else delete s.map.tiles[k]; });
    qbLog('🌿 The '+hz.name+' fades away', s); return false; }); }

function hazardAt(s,x,y){ if(!s.hazards) return null; return s.hazards.find(hz=>hz.cells.some(c=>c.x===x&&c.y===y))||null; }

function paintNoCastZone(s,ctr,aoeR,name){
  const rounds=SPELL_NOCAST_ZONE[name]; if(!rounds) return;
  s.map.tiles=s.map.tiles||{}; const cells=[];
  for(let x=Math.max(0,ctr.x-aoeR); x<=Math.min(s.map.cols-1,ctr.x+aoeR); x++)
    for(let y=Math.max(0,ctr.y-aoeR); y<=Math.min(s.map.rows-1,ctr.y+aoeR); y++){
      if(!inBlast(ctr.x,ctr.y,x,y,aoeR)) continue;
      cells.push({x,y,prev:s.map.tiles[x+','+y]||null});
    }
  s.hazards=s.hazards||[]; s.hazards.push({cells, until:s.battle.round+rounds, name, noCast:true, gas:true});
}

function inNoCastZone(s,x,y){ const hz=hazardAt(s,x,y); return !!(hz&&hz.noCast); }

function inAntimagicField(s,x,y){ const hz=hazardAt(s,x,y); return !!(hz&&hz.name==='Antimagic Field'); }

function trapAt(s,x,y){ return (s.traps||[]).find(t=>t.x===x&&t.y===y)||null; }

function checkTrapTrigger(s, unit, x, y, isPc){
  const trap=(s.traps||[]).find(t=>!t.triggered && t.x===x && t.y===y); if(!trap) return null;
  // A hidden trap is spotted (RAW: passive Perception vs. the trap's DC), not always stepped
  // right into. Dungeon Delver (PHB: "advantage to detect traps") is exactly +5 to a passive
  // check (PHB's own advantage-on-passive-checks rule) — monsters have no tracked skills in
  // this app, so they default to a flat 10 passive (a named simplification, same shape as
  // monsterSaveBonus elsewhere). Spotting doesn't remove the trap or halt movement (this app
  // has no path-interruption model to hook into) — it just skips the trigger this one time; the
  // SAME tile can still catch someone next time it's stepped on, an intentionally narrow scope.
  const passive = isPc ? passiveScore(unit,'perception','wis')+(hasFeat(unit,'Dungeon Delver')?5:0) : 10;
  if(passive>=trap.dc){ qbLog('👁️ '+(unit.name||'Someone')+' spots a '+trap.name+' before triggering it!', s); return {trap, spotted:true}; }
  trap.triggered=true;
  const bonus = isPc ? saveMod(unit, trap.ability) : monsterSaveBonus(unit);
  const roll=rnd(20)+bonus, saved=roll>=trap.dc;
  const dmgTotal=(rollNotation(trap.dmg)||{total:0}).total;
  let applied=saved?Math.floor(dmgTotal/2):dmgTotal;
  if(isPc && hasFeat(unit,'Dungeon Delver')) applied=Math.floor(applied/2);   // resistance to trap damage (PHB)
  if(isPc){ if(applied>0) applyHp(unit,-applied); if(!saved && trap.cond){ unit.conditions=unit.conditions||{}; unit.conditions[trap.cond]=true; } }
  else { if(applied>0) unit.hp=Math.max(0,(unit.hp||0)-applied); if(!saved && trap.cond){ unit.conds=unit.conds||[]; if(!unit.conds.some(c=>c.name===trap.cond)) unit.conds.push({name:trap.cond, rounds:10}); } }
  qbLog('🪤 '+(unit.name||'Someone')+' triggers a '+trap.name+'! ('+roll+' vs DC '+trap.dc+' — '+applied+' '+trap.dtype+(!saved&&trap.cond?', '+trap.cond:'')+')', s);
  return {trap, saved, applied};
}

function checkTerrainHazardCond(s,unit,x,y,isPc){ const tdef=TERRAIN[terrainAt(s,x,y)]; if(!tdef||!(tdef.prone||tdef.restrain)) return;
  const cond=tdef.restrain?'Restrained':'Prone';
  const hz=hazardAt(s,x,y); const dc=hz?hz.dc:10;
  const bonus=isPc?(mod(abil(unit,'dex'))+(unit.saveProf&&unit.saveProf.dex?profBonus(unit):0)):monsterSaveBonus(unit);
  const roll=rnd(20)+bonus;
  if(roll<dc){ if(isPc){ unit.conditions=unit.conditions||{}; unit.conditions[cond]=true; } else { unit.conds=unit.conds||[]; if(!unit.conds.some(c=>c.name===cond)) unit.conds.push({name:cond,rounds:cond==='Restrained'?10:1}); }
    qbLog((tdef.e||'🛢️')+' '+unit.name+' '+(cond==='Restrained'?'gets tangled in the webs':'slips and falls prone')+' ('+roll+' vs DC '+dc+')', s); } }

function qbPaintTerrain(s,ctr,aoeR,name,dc){ return paintHazardTerrain(s,ctr,aoeR,name,dc); }

function qbExpireHazards(s){ return expireHazards(s); }

function qbHazardAt(s,x,y){ return hazardAt(s,x,y); }

function qbCheckTerrainProne(s,unit,x,y,isPc){ return checkTerrainHazardCond(s,unit,x,y,isPc); }

