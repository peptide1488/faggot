// Grimoire — extracted UI/rendering functions (Stage 2 of index.html modularization).
// Modal builders, render()/renderSheet/renderCombat/etc., anything touching document/$()/
// innerHTML. See AUDIT.md. Loaded via <script src> after data.js/rules.js/net.js, before
// the main script (which still holds top-level state: DB, QB, net, tab, curId, etc., and
// bootstrap/init statements like BRAINS.tactical=…, Events.on(…), and the final render()).

function openShop(c){
  const W=k=>`<div class="spell"><span style="flex:none">${itemEmblem(weaponIconKey(k),4)}</span><div class="nm"><b>${esc(k)}</b><small>${(weaponByName(k)||{}).dmg||''} ${(weaponByName(k)||{}).dt||''} · ${WEAPON_COST[k]||0} gp</small></div><button class="btn sm" data-buy="w|${esc(k)}" ${(c.currency.gp||0)<(WEAPON_COST[k]||0)?'disabled style=opacity:.4':''}>Buy</button></div>`;
  const A=key=>{ const a=armorDef(key); return `<div class="spell"><span style="flex:none">${itemEmblem('armor',4)}</span><div class="nm"><b>${esc(a.name)}</b><small>AC ${a.base}${a.dexCap<99?'+DEX≤'+a.dexCap:'+DEX'} · ${ARMOR_COST[key]||0} gp</small></div><button class="btn sm" data-buy="a|${key}" ${(c.currency.gp||0)<(ARMOR_COST[key]||0)?'disabled style=opacity:.4':''}>Buy</button></div>`; };
  const G=g=>`<div class="spell"><span style="flex:none">${itemEmblem(itemIconKey({name:g.n,kind:'gear'}),4)}</span><div class="nm"><b>${esc(g.n)}</b><small>${g.cost} gp</small></div><button class="btn sm" data-buy="g|${esc(g.n)}" ${(c.currency.gp||0)<g.cost?'disabled style=opacity:.4':''}>Buy</button></div>`;
  $('#modalRoot').innerHTML=`<div class="modal" id="shopModal"><div class="sheet"><div class="grip"></div>
    <h2>🛒 Shop <span class="muted" style="font-size:12px;text-transform:none;float:right">💰 ${c.currency.gp||0} gp</span></h2>
    <div class="muted" style="font-size:11px;text-transform:uppercase;letter-spacing:.05em;margin:6px 0 4px">Weapons</div>${WEAPONS.map(w=>W(w.n)).join('')}
    <div class="muted" style="font-size:11px;text-transform:uppercase;letter-spacing:.05em;margin:12px 0 4px">Armor & Shields</div>${ARMOR.filter(a=>a.key!=='none').map(a=>A(a.key)).join('')}<div class="spell"><span style="flex:none">${itemEmblem('shield',4)}</span><div class="nm"><b>Shield</b><small>+2 AC · 10 gp</small></div><button class="btn sm" data-buy="s|Shield" ${(c.currency.gp||0)<10?'disabled style=opacity:.4':''}>Buy</button></div>
    <div class="muted" style="font-size:11px;text-transform:uppercase;letter-spacing:.05em;margin:12px 0 4px">Adventuring Gear</div>${ADV_GEAR.map(G).join('')}
    <button class="btn ghost block" id="shopClose" style="margin-top:12px">Done</button>
  </div></div>`;
  $('#shopClose').onclick=()=>{ $('#modalRoot').innerHTML=''; render(); };
  $('#shopModal').onclick=e=>{ if(e.target.id==='shopModal'){ $('#modalRoot').innerHTML=''; render(); } };
  document.querySelectorAll('#shopModal [data-buy]').forEach(b=>b.addEventListener('click',()=>buyEquip(c, b.dataset.buy)));
}

function setEquipped(c, idx, on){
  const it=c.items[idx]; if(!it) return; it.equipped=on;
  if(it.kind==='armor'){ if(on){ c.items.forEach((x,j)=>{ if(j!==idx&&x.kind==='armor') x.equipped=false; }); c.armor=it.armorKey||'none'; c.acOverride=''; } else if(c.armor===(it.armorKey||'none')) c.armor='none'; }
  if(it.kind==='shield'){ c.shield=(c.items||[]).some(x=>x.kind==='shield'&&x.equipped); }
  logChange(c, (on?'Equipped ':'Unequipped ')+it.name+' (AC '+computeAC(c)+')'); save(); render();
  if(it.kind==='armor'||it.kind==='shield'||(it.mods&&it.mods.ac)) flashBanner((on?'Equipped ':'Unequipped ')+it.name+' — AC now '+computeAC(c));
}

function startBattle(c){ const ini=rnd(20)+initiative(c); c.battle=Object.assign({round:1, init:ini}, freshTurnState(c));
  if(isEchoKnight(c,18) && (c.echoIncarnationLeft||0)<=0) c.echoIncarnationLeft=1;   // Legion of One (18th)
  logChange(c,'⚔ Battle started — initiative '+ini); save(); render(); flashBanner('Battle! Initiative '+ini); }

function endBattle(c){ c.battle=null; logChange(c,'Battle ended'); save(); render(); }

function battleNextTurn(c){ if(!c.battle) return; if(timeStopExtraTurn(c)) return; const b=c.battle; b.round++; resetTurnState(c);
  let exp=[]; (c.effects||[]).forEach(e=>{ if(e.rounds!=null){ e.rounds--; if(e.rounds<=0) exp.push(e); } }); c.effects=(c.effects||[]).filter(e=>e.rounds==null||e.rounds>0);
  exp.forEach(e=>{ if(e.conc&&c.concentration&&c.concentration.spell===e.name) c.concentration={active:false,spell:''}; });
  logChange(c,'▶ Round '+b.round+' — turn reset'+(exp.length?'; expired: '+exp.map(e=>e.name).join(', '):'')); save(); render(); flashBanner('Round '+b.round); }

function toggleRage(c, frenzy){
  if(isRaging(c)){
    c.effects=(c.effects||[]).filter(e=>e.name!=='Rage');
    if(c.frenzied){ c.frenzied=false; c.exhaustion=Math.min(6,(c.exhaustion||0)+1); logChange(c,'Rage ended — Frenzy costs you 1 level of exhaustion'); }
    else logChange(c,'Rage ended');
    save(); render(); return;
  }
  // Rage is a bonus action (PHB) — in battle it needs and spends your bonus action.
  if(c.battle){ if(c.battle.bonus){ flashBanner('Bonus action already used — Rage is a bonus action'); return; } c.battle.bonus=true; }
  // can't concentrate while raging — drop any concentration spell
  if(c.concentration&&c.concentration.active){ c.effects=(c.effects||[]).filter(e=>!e.conc); c.concentration={active:false,spell:''}; }
  // Mindless Rage (6th): entering a rage suspends an existing Charmed/Frightened for its
  // duration (PHB is explicit this is a SUSPENSION, not a cure — nothing here prevents the
  // condition from re-applying once the rage ends, matching the real wording).
  if(isBerserker(c,6) && c.conditions){ delete c.conditions.Charmed; delete c.conditions.Frightened; }
  addEffect(c,'Rage',{rounds:10, note:'1 minute · Half damage from b/p/s · +'+rageDamage(c)+' melee (STR) damage · advantage on STR · can’t cast/concentrate.'});
  c.frenzied=!!(frenzy && isBerserker(c,3));
  sfx('damage'); logChange(c,'🪓 RAGE!'+(c.frenzied?' (Frenzy)':'')+' +'+rageDamage(c)+' melee damage, ½ physical damage, no spells'); save(); render(); flashBanner('🪓 RAGE!'+(c.frenzied?' Frenzy — bonus-action attack every turn, exhaustion when it ends':''));
}

function rageButtonClick(c){
  if(isRaging(c) || !isBerserker(c,3)){ toggleRage(c); return; }
  $('#modalRoot').innerHTML=`<div class="modal" id="frenzyModal"><div class="sheet"><div class="grip"></div>
    <h2>🪓 Rage</h2>
    <button class="btn block" id="frenzyYes" style="margin-bottom:8px;text-align:left">🩸 Rage + Frenzy<small style="display:block;opacity:.75">Bonus-action melee attack every turn — 1 level of exhaustion when the rage ends</small></button>
    <button class="btn ghost block" id="frenzyNo" style="text-align:left">Rage (no Frenzy)</button>
  </div></div>`;
  $('#frenzyModal').onclick=e=>{ if(e.target.id==='frenzyModal') $('#modalRoot').innerHTML=''; };
  $('#frenzyYes').onclick=()=>{ $('#modalRoot').innerHTML=''; toggleRage(c,true); };
  $('#frenzyNo').onclick=()=>{ $('#modalRoot').innerHTML=''; toggleRage(c,false); };
}

function openWildShapeUI(c){
  if(c.wildShapeLeft==null) c.wildShapeLeft=wildShapeMax(c);
  if(c.wildShape){
    const beastName=c.wildShape.name;
    const slots=spellSlots(c);
    const healOpts=isMoonDruid(c,2) ? [1,2,3,4,5,6,7,8,9].filter(l=>{ const t=slots[l]||0; return t-Math.min(t,(c.slots[l]&&c.slots[l].used)||0)>0; }) : [];
    $('#modalRoot').innerHTML=`<div class="modal" id="wsModal"><div class="sheet"><div class="grip"></div>
      <h2>🐾 ${esc(beastName)}</h2>
      <p class="muted" style="font-size:12px;margin:0 0 8px">${c.wildShape.hpCur}/${c.wildShape.hpMax} HP · AC ${c.wildShape.ac}</p>
      ${healOpts.length?`<div class="addrow" style="align-items:center;margin-bottom:8px"><span class="muted" style="font-size:12px;flex:none">Combat Wild Shape — heal</span><select id="wsHealLvl" style="flex:1">${healOpts.map(l=>`<option value="${l}">L${l} slot — ${l}d8 HP</option>`).join('')}</select><button class="btn sm" id="wsHealGo">Heal</button></div>`:''}
      <button class="btn block" id="wsRevert" style="margin-bottom:8px">↩ Revert (bonus action)</button>
      <button class="btn ghost block" id="wsClose">Close</button>
    </div></div>`;
    $('#wsModal').onclick=e=>{ if(e.target.id==='wsModal') $('#modalRoot').innerHTML=''; };
    $('#wsClose').onclick=()=>{ $('#modalRoot').innerHTML=''; };
    $('#wsRevert').onclick=()=>{
      if(c.battle && c.battle.bonus){ flashBanner('Bonus action already used'); return; }
      if(c.battle) c.battle.bonus=true;
      c.wildShape=null;
      logChange(c,'🐾 Reverts from '+beastName+' form');
      flashBanner('Reverted to '+c.name);
      $('#modalRoot').innerHTML=''; save(); render(); if(net&&net.role==='player') playerHello();
    };
    { const hg=$('#wsHealGo'); if(hg) hg.onclick=()=>{
      const l=Number($('#wsHealLvl').value); if(!l) return;
      if(c.battle && c.battle.bonus){ flashBanner('Bonus action already used'); return; }
      if(c.battle) c.battle.bonus=true;
      if(!c.slots[l]) c.slots[l]={total:0,used:0}; c.slots[l].used=Math.min(spellSlots(c)[l]||0,(c.slots[l].used||0)+1);
      const r=rollNotation(l+'d8')||{total:0,detail:''};
      applyHp(c, r.total);
      logChange(c,'🐾 Combat Wild Shape — spends a L'+l+' slot, heals '+r.total+' HP ('+r.detail+')');
      flashBanner('🐾 +'+r.total+' HP');
      $('#modalRoot').innerHTML=''; save(); render();
    }; }
    return;
  }
  if((c.wildShapeLeft||0)<=0){ flashBanner('No Wild Shape uses left — rest to recharge'); return; }
  const bonusAction=isMoonDruid(c,2);
  if(c.battle){ if(bonusAction){ if(c.battle.bonus){ flashBanner('Bonus action already used'); return; } } else if(!hasAction(c)){ flashBanner('No action left this turn'); return; } }
  const cap=isMoonDruid(c,2) ? moonMaxCR(c) : ((Number(c.level)||1)>=8?1:(Number(c.level)||1)>=4?0.5:0.25);
  const beasts=BEAST_SHAPES.filter(b=>crToNum(b.cr)<=cap+1e-6);
  const elementalOk = isMoonDruid(c,10) && (c.wildShapeLeft||0)>=2;
  $('#modalRoot').innerHTML=`<div class="modal" id="wsModal"><div class="sheet"><div class="grip"></div>
    <h2>🐾 Wild Shape</h2>
    <p class="muted" style="font-size:12px;margin:0 0 8px">${c.wildShapeLeft} use${c.wildShapeLeft===1?'':'s'} left · ${bonusAction?'bonus action':'action'} · max CR ${cap}</p>
    ${beasts.map((b,i)=>`<div class="spell"><div class="nm"><b>${esc(b.n)}</b><small>CR ${b.cr} · AC ${b.ac} · HP ${b.hp} · ${esc(b.desc)}</small></div><button class="btn sm" data-wsbeast="${i}">Shape</button></div>`).join('')}
    ${elementalOk?`<div class="muted" style="font-size:11px;text-transform:uppercase;letter-spacing:.05em;margin:12px 0 4px">Elemental Wild Shape (spends 2 uses)</div>${ELEMENTAL_SHAPES.map((b,i)=>`<div class="spell"><div class="nm"><b>${esc(b.n)}</b><small>AC ${b.ac} · HP ${b.hp} · ${esc(b.desc)}</small></div><button class="btn sm" data-wselem="${i}">Shape</button></div>`).join('')}`:''}
    <button class="btn ghost block" id="wsClose" style="margin-top:8px">Cancel</button>
  </div></div>`;
  $('#wsModal').onclick=e=>{ if(e.target.id==='wsModal') $('#modalRoot').innerHTML=''; };
  $('#wsClose').onclick=()=>{ $('#modalRoot').innerHTML=''; };
  const doTransform=(b, cost)=>{
    if(c.battle){ if(bonusAction) c.battle.bonus=true; else spendAction(c); }
    c.wildShapeLeft=Math.max(0,(c.wildShapeLeft||0)-cost);
    c.wildShape={name:b.n, hpCur:b.hp, hpMax:b.hp, ac:b.ac, atk:b.atk, speed:b.speed};
    logChange(c,'🐾 Wild Shapes into a '+b.n);
    flashBanner('🐾 Wild Shape — you are now a '+b.n);
    $('#modalRoot').innerHTML=''; save(); render(); if(net&&net.role==='player') playerHello();
  };
  document.querySelectorAll('[data-wsbeast]').forEach(btn=>btn.onclick=()=>{ const b=beasts[Number(btn.dataset.wsbeast)]; if(b) doTransform(b,1); });
  document.querySelectorAll('[data-wselem]').forEach(btn=>btn.onclick=()=>{ const b=ELEMENTAL_SHAPES[Number(btn.dataset.wselem)]; if(b) doTransform(b,2); });
}

function openKiUI(c){
  if(c.kiLeft==null) c.kiLeft=kiMax(c);
  const canWholeness = (Number(c.level)||1)>=6 && !c.wholenessUsed;
  $('#modalRoot').innerHTML=`<div class="modal" id="kiModal"><div class="sheet"><div class="grip"></div>
    <h2>🥋 Ki</h2>
    <p class="muted" style="font-size:12px;margin:0 0 8px">${c.kiLeft} ki point${c.kiLeft===1?'':'s'} left. Flurry of Blows is offered against an adjacent foe via 🖐 Use.</p>
    <button class="btn block" id="kiPatient" style="margin-bottom:8px;text-align:left"${(c.kiLeft||0)<=0?' disabled style="opacity:.5"':''}>🛡 Patient Defense — 1 ki<small style="display:block;opacity:.75">Bonus action: Dodge until the start of your next turn</small></button>
    <button class="btn block" id="kiStep" style="margin-bottom:8px;text-align:left"${(c.kiLeft||0)<=0?' disabled style="opacity:.5"':''}>💨 Step of the Wind — 1 ki<small style="display:block;opacity:.75">Bonus action: Disengage or Dash, jump distance doubled this turn</small></button>
    ${canWholeness?`<button class="btn block" id="kiWholeness" style="margin-bottom:8px;text-align:left">🕉 Wholeness of Body<small style="display:block;opacity:.75">Action, no ki: regain ${3*(Number(c.level)||1)} HP — once per long rest</small></button>`:''}
    <button class="btn ghost block" id="kiClose">Close</button>
  </div></div>`;
  $('#kiModal').onclick=e=>{ if(e.target.id==='kiModal') $('#modalRoot').innerHTML=''; };
  $('#kiClose').onclick=()=>{ $('#modalRoot').innerHTML=''; };
  { const kp=$('#kiPatient'); if(kp) kp.onclick=()=>{
    if(c.battle && c.battle.bonus){ flashBanner('Bonus action already used'); return; }
    if((c.kiLeft||0)<=0){ flashBanner('No ki points left'); return; }
    if(c.battle) c.battle.bonus=true;
    c.kiLeft--;
    addEffect(c,'Dodge',{rounds:1, cond:'Dodge', note:'Attack rolls against you have disadvantage.'});
    logChange(c,'🛡 Patient Defense — Dodging until your next turn');
    flashBanner('🛡 Patient Defense — attacks against you have disadvantage');
    $('#modalRoot').innerHTML=''; save(); render(); if(net&&net.role==='player') playerHello();
  }; }
  { const ks=$('#kiStep'); if(ks) ks.onclick=()=>{
    if(c.battle && c.battle.bonus){ flashBanner('Bonus action already used'); return; }
    if((c.kiLeft||0)<=0){ flashBanner('No ki points left'); return; }
    if(c.battle) c.battle.bonus=true;
    c.kiLeft--;
    logChange(c,'💨 Step of the Wind — Disengage/Dash, jump distance doubled this turn');
    flashBanner('💨 Step of the Wind — free Disengage or Dash, double jump distance');
    $('#modalRoot').innerHTML=''; save(); render(); if(net&&net.role==='player') playerHello();
  }; }
  { const kw=$('#kiWholeness'); if(kw) kw.onclick=()=>{
    if(c.battle && !hasAction(c)){ flashBanner('No action left this turn'); return; }
    if(c.battle) spendAction(c);
    c.wholenessUsed=true;
    const heal=3*(Number(c.level)||1);
    applyHp(c, heal);
    logChange(c,'🕉 Wholeness of Body — regains '+heal+' HP');
    flashBanner('🕉 Wholeness of Body — +'+heal+' HP');
    $('#modalRoot').innerHTML=''; save(); render();
  }; }
}

function openPaladinUI(c){
  if(c.divineSenseLeft==null) c.divineSenseLeft=divineSenseMax(c);
  if(c.layOnHandsLeft==null) c.layOnHandsLeft=layOnHandsMax(c);
  if((Number(c.level)||1)>=3 && c.paladinCDLeft==null) c.paladinCDLeft=paladinCDMax(c);
  const s=battleSession();
  const me=s ? ((typeof QB!=='undefined'&&QB&&QB.active) ? s.players[0] : (s.players||[]).find(p=>p.id===net.peer.id)) : null;
  const sacredWeaponOn=(c.effects||[]).some(e=>e.name==='Sacred Weapon');
  const canHolyNimbus=isDevotionPaladin(c,20) && !c.holyNimbusUsed;
  $('#modalRoot').innerHTML=`<div class="modal" id="palModal"><div class="sheet"><div class="grip"></div>
    <h2>✝️ Paladin</h2>
    <button class="btn block" id="palDivineSense" style="margin-bottom:8px;text-align:left"${(c.divineSenseLeft||0)<=0?' disabled style="opacity:.5"':''}>👁 Divine Sense (${c.divineSenseLeft} left)<small style="display:block;opacity:.75">Action — detect celestials/fiends/undead within 60 ft</small></button>
    <button class="btn block" id="palLayOnHands" style="margin-bottom:8px;text-align:left"${(c.layOnHandsLeft||0)<=0||!me?' disabled style="opacity:.5"':''}>🖐 Lay on Hands (${c.layOnHandsLeft||0} HP left)<small style="display:block;opacity:.75">Action, touch — heal any amount from the pool, or spend 5 to cure disease/poison</small></button>
    ${(Number(c.level)||1)>=3?`<button class="btn block" id="palSacredWeapon" style="margin-bottom:8px;text-align:left"${(!sacredWeaponOn&&(c.paladinCDLeft||0)<=0)?' disabled style="opacity:.5"':''}>⚔ ${sacredWeaponOn?'Sacred Weapon — ARMED (tap to end)':'Channel Divinity: Sacred Weapon'}<small style="display:block;opacity:.75">${sacredWeaponOn?'Ends early — no cost':'Action — +Cha mod (min +1) to hit, 1 minute ('+(c.paladinCDLeft||0)+' use'+((c.paladinCDLeft||0)===1?'':'s')+' left)'}</small></button>
      <button class="btn block" id="palTurnUnholy" style="margin-bottom:8px;text-align:left"${(c.paladinCDLeft||0)<=0?' disabled style="opacity:.5"':''}>☀ Channel Divinity: Turn the Unholy<small style="display:block;opacity:.75">Action — fiends/undead within 30 ft: Wis save or flee (${c.paladinCDLeft||0} use${(c.paladinCDLeft||0)===1?'':'s'} left)</small></button>`:''}
    ${canHolyNimbus?`<button class="btn block" id="palHolyNimbus" style="margin-bottom:8px;text-align:left">☀ Holy Nimbus<small style="display:block;opacity:.75">Action — bright light 30 ft, 10 radiant to enemies starting their turn in it, 1 minute. Once per long rest</small></button>`:''}
    <button class="btn ghost block" id="palClose">Close</button>
  </div></div>`;
  $('#palModal').onclick=e=>{ if(e.target.id==='palModal') $('#modalRoot').innerHTML=''; };
  $('#palClose').onclick=()=>{ $('#modalRoot').innerHTML=''; };
  { const ds=$('#palDivineSense'); if(ds) ds.onclick=()=>{
    if((c.divineSenseLeft||0)<=0){ flashBanner('No Divine Sense uses left — long rest to recharge'); return; }
    if(c.battle && !hasAction(c)){ flashBanner('No action left this turn'); return; }
    if(c.battle) spendAction(c);
    c.divineSenseLeft--;
    let msg='Divine Sense — nothing detected within 60 ft';
    if(s && me){
      const relevant=(s.monsters||[]).filter(mo=>mo.hp>0 && gridDist(me.x,me.y,mo.x,mo.y)<=12 && (monsterIsUndead(mo)||monsterIsFiend(mo)));
      if(relevant.length) msg='Divine Sense — '+relevant.map(mo=>mo.name+' ('+(monsterIsUndead(mo)?'undead':'fiend')+')').join(', ');
    }
    logChange(c,'👁 '+msg); flashBanner(msg);
    $('#modalRoot').innerHTML=''; save(); render(); if(net&&net.role==='player') playerHello();
  }; }
  { const lh=$('#palLayOnHands'); if(lh) lh.onclick=()=>{ $('#modalRoot').innerHTML=''; openLayOnHandsTarget(c, me); }; }
  { const sw=$('#palSacredWeapon'); if(sw) sw.onclick=()=>{
    if(sacredWeaponOn){ c.effects=(c.effects||[]).filter(e=>e.name!=='Sacred Weapon'); logChange(c,'⚔ Sacred Weapon ends'); flashBanner('Sacred Weapon ends'); $('#modalRoot').innerHTML=''; save(); render(); return; }
    if((c.paladinCDLeft||0)<=0){ flashBanner('No Channel Divinity left — rest to recharge'); return; }
    if(c.battle && !hasAction(c)){ flashBanner('No action left this turn'); return; }
    if(c.battle) spendAction(c);
    c.paladinCDLeft--;
    addEffect(c,'Sacred Weapon',{rounds:10, note:'+'+Math.max(1,mod(abil(c,'cha')))+' to hit; bright light 20 ft/dim 20 ft.'});
    logChange(c,'⚔ Channel Divinity: Sacred Weapon');
    flashBanner('⚔ Sacred Weapon — +'+Math.max(1,mod(abil(c,'cha')))+' to hit for 1 minute');
    $('#modalRoot').innerHTML=''; save(); render(); if(net&&net.role==='player') playerHello();
  }; }
  { const tu=$('#palTurnUnholy'); if(tu) tu.onclick=()=>{
    if((c.paladinCDLeft||0)<=0){ flashBanner('No Channel Divinity left — rest to recharge'); return; }
    if(c.battle && !hasAction(c)){ flashBanner('No action left this turn'); return; }
    if(c.battle) spendAction(c);
    c.paladinCDLeft--;
    const dc=8+profBonus(c)+mod(abil(c,'cha'));
    const ad = (typeof QB!=='undefined'&&QB&&QB.active) ? qbAdapter : (net&&net.role==='player') ? playerNetAdapter : null;
    let n=0;
    if(s && me && ad){
      (s.monsters||[]).filter(mo=>mo.hp>0 && gridDist(me.x,me.y,mo.x,mo.y)<=6 && (monsterIsUndead(mo)||monsterIsFiend(mo))).forEach(mo=>{
        const roll=rnd(20)+(ad.saveBonus?ad.saveBonus(mo,'wis'):0);
        if(roll<dc){ n++; ad.addCond(mo,'Frightened',10); logChange(c,'☀ Turns '+mo.name+' (Wis '+roll+' vs DC '+dc+')'); }
      });
    }
    flashBanner(n?'☀ Turn the Unholy — '+n+' creature'+(n===1?'':'s')+' turned':'☀ Turn the Unholy — nothing in range resisted (or nothing to turn)');
    $('#modalRoot').innerHTML=''; save(); render(); if(net&&net.role==='player') playerHello();
  }; }
  { const hn=$('#palHolyNimbus'); if(hn) hn.onclick=()=>{
    if(c.battle && !hasAction(c)){ flashBanner('No action left this turn'); return; }
    if(c.battle) spendAction(c);
    c.holyNimbusUsed=true;
    addEffect(c,'Holy Nimbus',{rounds:10, note:'Bright light 30 ft — enemies starting their turn in it take 10 radiant. Advantage on saves vs fiend/undead spells.'});
    logChange(c,'☀ Holy Nimbus');
    flashBanner('☀ Holy Nimbus — 1 minute');
    $('#modalRoot').innerHTML=''; save(); render(); if(net&&net.role==='player') playerHello();
  }; }
}

function openLayOnHandsTarget(c, me){
  const s=battleSession();
  const targets=[{self:true,id:'me',name:c.name}];
  if(s && me && net && net.role==='player'){ (s.players||[]).filter(p=>p.id!==net.peer.id && gridDist(me.x,me.y,p.x,p.y)<=1).forEach(p=>targets.push({self:false,id:p.id,name:p.name})); }
  $('#modalRoot').innerHTML=`<div class="modal" id="lohModal"><div class="sheet"><div class="grip"></div>
    <h2>🖐 Lay on Hands</h2>
    <p class="muted" style="font-size:12px;margin:0 0 8px">${c.layOnHandsLeft||0} HP left in the pool. Touch — action.</p>
    ${targets.map((t,i)=>`<div class="listrow"><div class="nm">${esc(t.name)}</div><input type="number" id="loh-${i}" placeholder="HP" style="max-width:70px"><button class="btn sm" data-lohheal="${i}">Heal</button></div>`).join('')}
    <button class="btn ghost block" id="lohCureBtn" style="margin-top:8px">Cure disease/poison instead (5 HP from pool, self)</button>
    <button class="btn ghost block" id="lohClose" style="margin-top:8px">Close</button>
  </div></div>`;
  $('#lohModal').onclick=e=>{ if(e.target.id==='lohModal') $('#modalRoot').innerHTML=''; };
  $('#lohClose').onclick=()=>{ $('#modalRoot').innerHTML=''; };
  document.querySelectorAll('[data-lohheal]').forEach(b=>b.onclick=()=>{
    const i=Number(b.dataset.lohheal), t=targets[i]; const amt=Math.max(0,Math.min(c.layOnHandsLeft||0, Number($('#loh-'+i).value)||0));
    if(amt<=0) return;
    if(c.battle && !hasAction(c)){ flashBanner('No action left this turn'); return; }
    if(c.battle) spendAction(c);
    c.layOnHandsLeft=(c.layOnHandsLeft||0)-amt;
    if(t.self){ applyHp(c, amt); logChange(c,'🖐 Lay on Hands — heals '+amt+' HP'); }
    else { if(net.conn) try{ net.conn.send({t:'healApply', targetId:t.id, amount:amt, from:c.name}); }catch(e){} logChange(c,'🖐 Lay on Hands — sends '+amt+' HP to '+t.name); }
    flashBanner('🖐 Lay on Hands — '+amt+' HP');
    $('#modalRoot').innerHTML=''; save(); render(); if(net&&net.role==='player') playerHello();
  });
  $('#lohCureBtn').onclick=()=>{
    if((c.layOnHandsLeft||0)<5){ flashBanner('Needs 5 HP left in the pool'); return; }
    if(c.battle && !hasAction(c)){ flashBanner('No action left this turn'); return; }
    if(c.battle) spendAction(c);
    c.layOnHandsLeft-=5;
    logChange(c,'🖐 Lay on Hands — cures a disease or neutralizes a poison');
    flashBanner('🖐 Cured!');
    $('#modalRoot').innerHTML=''; save(); render(); if(net&&net.role==='player') playerHello();
  };
}

function openSorcererUI(c){
  const wingsOn=(c.effects||[]).some(e=>e.name==='Dragon Wings');
  const s=battleSession();
  const me=s ? ((typeof QB!=='undefined'&&QB&&QB.active) ? s.players[0] : (s.players||[]).find(p=>p.id===net.peer.id)) : null;
  $('#modalRoot').innerHTML=`<div class="modal" id="sorcModal"><div class="sheet"><div class="grip"></div>
    <h2>🐉 Draconic Bloodline</h2>
    ${isDraconicSorcerer(c,14)?`<button class="btn block" id="sorcWings" style="margin-bottom:8px;text-align:left">🐉 ${wingsOn?'Dismiss Dragon Wings':'Sprout Dragon Wings'}<small style="display:block;opacity:.75">Bonus action — flying speed equal to your current speed</small></button>`:''}
    ${isDraconicSorcerer(c,18)?`<button class="btn block" id="sorcPresence" style="margin-bottom:8px;text-align:left"${sorcCur(c)<5?' disabled style="opacity:.5"':''}>🐉 Draconic Presence — 5 sp<small style="display:block;opacity:.75">${sorcCur(c)<5?'Need 5 sorcery points':'Action — awe (Charmed) or fear (Frightened) aura, 60 ft, Wis save'}</small></button>`:''}
    <button class="btn ghost block" id="sorcClose">Close</button>
  </div></div>`;
  $('#sorcModal').onclick=e=>{ if(e.target.id==='sorcModal') $('#modalRoot').innerHTML=''; };
  $('#sorcClose').onclick=()=>{ $('#modalRoot').innerHTML=''; };
  { const sw=$('#sorcWings'); if(sw) sw.onclick=()=>{
    if(wingsOn){ c.effects=(c.effects||[]).filter(e=>e.name!=='Dragon Wings'); logChange(c,'🐉 Dismisses Dragon Wings'); flashBanner('Dragon Wings dismissed'); }
    else { if(c.battle && c.battle.bonus){ flashBanner('Bonus action already used'); return; } if(c.battle) c.battle.bonus=true;
      addEffect(c,'Dragon Wings',{rounds:null, note:'Flying speed equal to your current speed.'});
      logChange(c,'🐉 Sprouts Dragon Wings'); flashBanner('🐉 Dragon Wings — you can fly'); }
    $('#modalRoot').innerHTML=''; save(); render(); if(net&&net.role==='player') playerHello();
  }; }
  { const sp=$('#sorcPresence'); if(sp) sp.onclick=()=>{
    if(sorcCur(c)<5){ flashBanner('Need 5 sorcery points'); return; }
    if(c.battle && !hasAction(c)){ flashBanner('No action left this turn'); return; }
    $('#modalRoot').innerHTML=`<div class="modal" id="sorcPresModal"><div class="sheet"><div class="grip"></div>
      <h2>🐉 Draconic Presence</h2>
      <button class="btn block" id="sorcAwe" style="margin-bottom:8px;text-align:left">😍 Awe — Charmed</button>
      <button class="btn block" id="sorcFear" style="margin-bottom:8px;text-align:left">😱 Fear — Frightened</button>
      <button class="btn ghost block" id="sorcPresCancel">Cancel</button>
    </div></div>`;
    $('#sorcPresModal').onclick=e=>{ if(e.target.id==='sorcPresModal') $('#modalRoot').innerHTML=''; };
    $('#sorcPresCancel').onclick=()=>{ $('#modalRoot').innerHTML=''; };
    const go=(cond)=>{
      if(c.battle) spendAction(c);
      c.sorcPts=sorcCur(c)-5;
      const dc=8+profBonus(c)+mod(abil(c,c.spellAbility));
      const ad = (typeof QB!=='undefined'&&QB&&QB.active) ? qbAdapter : (net&&net.role==='player') ? playerNetAdapter : null;
      let n=0;
      if(s && me && ad){
        (s.monsters||[]).filter(mo=>mo.hp>0 && isHostile(mo) && gridDist(me.x,me.y,mo.x,mo.y)<=12).forEach(mo=>{
          const roll=rnd(20)+(ad.saveBonus?ad.saveBonus(mo,'wis'):0);
          if(roll<dc){ n++; ad.addCond(mo,cond,10); logChange(c,'🐉 Draconic Presence — '+mo.name+' is '+cond+' (Wis '+roll+' vs DC '+dc+')'); }
        });
      }
      flashBanner('🐉 Draconic Presence ('+cond+') — '+n+' creature'+(n===1?'':'s')+' affected');
      $('#modalRoot').innerHTML=''; save(); render(); if(net&&net.role==='player') playerHello();
    };
    $('#sorcAwe').onclick=()=>go('Charmed');
    $('#sorcFear').onclick=()=>go('Frightened');
  }; }
}

function openWarlockUI(c){
  $('#modalRoot').innerHTML=`<div class="modal" id="wlModal"><div class="sheet"><div class="grip"></div>
    <h2>😈 The Fiend</h2>
    ${isFiendWarlock(c,6)?`<button class="btn block" id="wlLuck" style="margin-bottom:8px;text-align:left"${c.darkOneLuckUsed?' disabled style="opacity:.5"':''}>🎲 Dark One's Own Luck<small style="display:block;opacity:.75">${c.darkOneLuckUsed?'Used — rest to recharge':'Add 1d10 to your last roll ('+(lastRoll?esc(lastRoll.label)+' = '+lastRoll.total:'no roll yet')+')'}</small></button>`:''}
    ${isFiendWarlock(c,10)?`<div class="field"><label>Fiendish Resilience — damage type${c.fiendishResilience?' (current: '+esc(c.fiendishResilience)+')':''}</label>
      <select id="wlResist"><option value="">— choose —</option>${DMG_TYPES.map(t=>`<option ${c.fiendishResilience===t?'selected':''}>${t}</option>`).join('')}</select>
      <p class="muted" style="font-size:11px;margin:4px 0 0">Halves any incoming damage of this type from a real attack roll (weapon/spell). Environmental/manual damage entries don't carry a type, so they aren't affected.</p></div>`:''}
    <button class="btn ghost block" id="wlClose" style="margin-top:8px">Close</button>
  </div></div>`;
  $('#wlModal').onclick=e=>{ if(e.target.id==='wlModal') $('#modalRoot').innerHTML=''; };
  $('#wlClose').onclick=()=>{ $('#modalRoot').innerHTML=''; };
  { const wl=$('#wlLuck'); if(wl) wl.onclick=()=>{
    if(c.darkOneLuckUsed){ flashBanner('Already used — rest to recharge'); return; }
    if(!lastRoll){ flashBanner('No roll to add to yet'); return; }
    c.darkOneLuckUsed=true;
    const r=rollNotation('1d10')||{total:0,detail:''};
    lastRoll.total+=r.total; lastRoll.detail=(lastRoll.detail||'')+' + Dark One\'s Luck '+r.detail;
    pushRoll({label:lastRoll.label+' (+Dark One\'s Luck)', total:lastRoll.total, detail:lastRoll.detail, kind:lastRoll.kind});
    logChange(c,'😈 Dark One\'s Own Luck — +'+r.total+' to '+lastRoll.label);
    flashBanner('😈 +'+r.total+' — new total '+lastRoll.total);
    $('#modalRoot').innerHTML=''; save(); render();
  }; }
  { const wr=$('#wlResist'); if(wr) wr.onchange=()=>{ c.fiendishResilience=wr.value||null; logChange(c,'😈 Fiendish Resilience — '+(c.fiendishResilience||'none chosen')); save(); render(); }; }
}

function openMove(c){
  if(!c.battle) return; const b=c.battle;
  $('#modalRoot').innerHTML=`<div class="modal" id="mvModal"><div class="sheet"><div class="grip"></div>
    <h2>🥾 Move</h2>
    <p class="muted" style="font-size:12px;margin:0 0 8px">Movement left: <b>${b.move} ft</b> · speed ${effSpeed(c)} ft.</p>
    <div class="addrow"><input id="mvDist" type="number" placeholder="distance (ft)" inputmode="numeric"><select id="mvType"><option>Walk</option><option>Fly</option><option>Swim (×2)</option><option>Climb (×2)</option><option>Crawl (×2)</option><option>Difficult terrain (×2)</option></select></div>
    <div class="addrow" style="margin-top:6px;flex-wrap:wrap">${[5,10,15,20,30].map(n=>`<button class="btn ghost sm" data-mvq="${n}">${n} ft</button>`).join('')}</div>
    <button class="btn block" id="mvGo" style="margin-top:10px">Move</button>
    <button class="btn ghost block" id="mvClose" style="margin-top:8px">Close</button>
  </div></div>`;
  const doMove=(dist)=>{ if(!(dist>0)) return; const type=$('#mvType').value;
    // Athlete (feat, PHB): climbing no longer costs extra movement — the ONLY place this app
    // models climbing as its own ×2-cost movement type (the grid-based QB/DM/player-net move
    // system computes cost from map terrain difficulty, not a distinct "climb" terrain type,
    // so there's nothing to unify against there — see AUDIT for the honest scope note on the
    // feat's OTHER clause, standing from prone, which has no costed action anywhere to hook).
    const athleteClimb = type==='Climb (×2)' && hasFeat(c,'Athlete');
    const mult=(/×2/.test(type) && !athleteClimb)?2:1, cost=dist*mult;
    b.move=Math.max(0,b.move-cost); b.moveUsed=(b.moveUsed||0)+dist; logChange(c,'🥾 Moved '+dist+' ft ('+type.replace(' (×2)','')+')'+(mult>1?' = '+cost+' ft used':(athleteClimb?' — Athlete, full speed':''))); save(); $('#modalRoot').innerHTML=''; render(); };
  $('#mvGo').onclick=()=>doMove(Number($('#mvDist').value));
  document.querySelectorAll('#mvModal [data-mvq]').forEach(q=>q.addEventListener('click',()=>doMove(Number(q.dataset.mvq))));
  $('#mvClose').onclick=()=>{ $('#modalRoot').innerHTML=''; };
  $('#mvModal').onclick=e=>{ if(e.target.id==='mvModal') $('#modalRoot').innerHTML=''; };
}

function openQuickSpells(c){
  if(isRaging(c)){ flashBanner('Can’t cast spells while raging'); return; }
  const list=castableSpells(c).sort((a,b)=>((a.level||0)-(b.level||0))||a.name.localeCompare(b.name));
  $('#modalRoot').innerHTML=`<div class="modal" id="qsModal"><div class="sheet"><div class="grip"></div>
    <h2>✨ Cast a spell</h2>
    <input id="qsSearch" placeholder="Filter your spells…" autocomplete="off">
    <div id="qsList" style="margin-top:10px;max-height:56vh;overflow:auto"></div>
    <button class="btn ghost block" id="qsClose" style="margin-top:10px">Close</button>
  </div></div>`;
  const draw=()=>{ const q=($('#qsSearch').value||'').toLowerCase(); const f=list.filter(s=>s.name.toLowerCase().includes(q));
    $('#qsList').innerHTML = f.length? f.map(s=>`<div class="spell"><span style="flex:none">${spellIcon(s.name)}</span><div class="nm"><b>${esc(s.name)}</b><small>${lvlLabel(s.level||0)}${s.prepared?' · prepared':''}${isConcentration(s.name)?' · 🧠 conc':''}</small></div><button class="btn sm" data-qcast="${esc(s.name)}|${s.level||0}">Cast</button></div>`).join('') : '<div class="empty">'+(isPrepCaster(c)?'No castable spells — 📋 Prepare some on the Spells tab.':'No spells. Add them on the Spells tab.')+'</div>';
    $('#qsList').querySelectorAll('[data-qcast]').forEach(b=>b.addEventListener('click',()=>{ const a=b.dataset.qcast.split('|'); const inBattle=net&&net.session&&net.session.battle.active; if(inBattle) openSpellTarget(c, a[0], Number(a[1])); else castModal(c, a[0], Number(a[1])); })); };
  $('#qsSearch').addEventListener('input',draw);
  $('#qsClose').onclick=()=>{ $('#modalRoot').innerHTML=''; };
  $('#qsModal').onclick=e=>{ if(e.target.id==='qsModal') $('#modalRoot').innerHTML=''; };
  draw();
}

function openEyebiteChoice(ad, casterId, mo, dc, doneLog){
  $('#modalRoot').innerHTML=`<div class="modal" id="ebModal"><div class="sheet"><div class="grip"></div>
    <h2>👁 Eyebite — choose an effect on ${esc(mo.name)}</h2>
    ${EYEBITE_OPTIONS.map((o,i)=>`<button class="btn block" data-eb="${i}" style="margin-top:8px;text-align:left">${o.label}</button>`).join('')}
    <button class="btn ghost block" id="ebCancel" style="margin-top:10px">Cancel</button></div></div>`;
  $('#ebCancel').onclick=()=>{ $('#modalRoot').innerHTML=''; };
  $('#ebModal').onclick=e=>{ if(e.target.id==='ebModal') $('#modalRoot').innerHTML=''; };
  document.querySelectorAll('#ebModal [data-eb]').forEach(b=>b.onclick=()=>{
    const opt=EYEBITE_OPTIONS[Number(b.dataset.eb)]; $('#modalRoot').innerHTML='';
    const roll=rnd(20)+monsterSaveBonus(mo);
    doneLog(eyebiteResolve(ad, casterId, mo, opt, dc, roll));
  });
}

function openTeleportTarget(c, name, level, s, me, commit){
  const tp=SPELL_TELEPORT[name];
  // Gold tiles = legal destinations (open, in range, LoS if required)
  const rangeTiles=new Set();
  const cols=s.map.cols|0, rows=s.map.rows|0;
  for(let y=0;y<rows;y++) for(let x=0;x<cols;x++){
    if(teleportOk(s,me,tp,x,y)) rangeTiles.add(x+','+y);
  }
  const opts={ rangeTiles, rangeFrom:{x:me.x,y:me.y,tiles:tp.tiles}, needLos:!!tp.los };
  window.__iso3dForceFrame=true;
  function drawTp(){
    $('#modalRoot').innerHTML=`<div class="modal" id="tpModal"><div class="sheet"><div class="grip"></div>
      <h2>✨ ${esc(name)}</h2>
      <p class="muted" style="font-size:12px;margin:0 0 8px">${tp.tiles>=100?'Teleport to any open tile on the map':'Teleport up to '+(tp.tiles*5)+' ft'+(tp.los?' — a spot you can see':'')}. No opportunity attacks; movement untouched.</p>
      ${mapGridHTML(s,false,opts)}
      <p class="muted" style="font-size:11.5px;margin:8px 0 0">Gold = legal destination. Tap a tile to appear there.${rangeTiles.size?` · ${rangeTiles.size} open`:' · no legal tiles!'}</p>
      <button class="btn ghost block" id="tpClose" style="margin-top:10px">Cancel</button>
    </div></div>`;
    // Iso3D: mount AFTER modal HTML exists (same pattern as Fireball targeting)
    if(isoView&&iso3dView) try{ syncIso3DHost(s, opts); }catch(e){}
    const reattach3d=()=>{ if(isoView&&iso3dView) try{ syncIso3DHost(s===QB?QB:(net&&net.session)||s); }catch(e){} };
    const pick=(x,y)=>{
      if(!teleportOk(s,me,tp,x,y)){
        flashBanner(tp.los&&!losClear(s,me.x,me.y,x,y,{ignoreCreatures:true})?'You need to see the destination':'Can’t appear there — blocked, occupied or out of range');
        return;
      }
      if(!castSpell(c,name,level)) return;
      $('#modalRoot').innerHTML='';
      Events.emit({type:'teleport', by:c.name, name, from:{x:me.x,y:me.y}, to:{x,y}});
      commit(x,y);
      reattach3d();
      render();
      setTimeout(()=>mapBurst(x,y,0),60);
      setTimeout(()=>frameIso3DOnUnit(s===QB?QB:(net&&net.session)||s, 1.55), 100);
    };
    $('#tpClose').onclick=()=>{ $('#modalRoot').innerHTML=''; reattach3d(); };
    $('#tpModal').onclick=e=>{ if(e.target.id==='tpModal'){ $('#modalRoot').innerHTML=''; reattach3d(); } };
    document.querySelectorAll('#tpModal [data-cell]').forEach(el=>el.onclick=()=>{
      const [x,y]=el.dataset.cell.split(',').map(Number);
      pick(x,y);
    });
    // Iso3D tile clicks also fire via host.onTileClick → .mcell click (already wired)
  }
  drawTp();
}

function openSpellTarget(c, name, level){
  level=Number(level)||0;
  const mc=scaleCantrip(c,name,parseSpellMechanics(name));
  if(name==='Mage Hand'){
    const ts=net&&net.session, tme=ts&&myMapPos();
    if(ts&&tme){
      if(!castSpell(c,name,level)) return;
      setTimeout(()=>openMageHandUI(c,ts,tme),60);
      return;
    }
  }
  if(name==='Light'){ openLightTarget(c,level); return; }
  if(SPELL_TELEPORT[name]){ if(!canCast(c,name,level)) return;   // teleport → pick a destination, token actually moves
    const ts=net.session, tme=myMapPos();
    openTeleportTarget(c,name,level,ts,tme,(x,y)=>{
      const mm=ts.players.find(p=>p.id===net.peer.id); if(mm){ mm.x=x; mm.y=y; }
      if(net.conn){ try{ net.conn.send({t:'move',x,y}); }catch(e){} }
      const td=TERRAIN[terrainAt(ts,x,y)];
      if(td&&td.dmg&&!isFlying(c)){ const d=(rollNotation(td.dmg)||{total:0}).total; applyHp(c,-d); flashBanner((td.e||'🔥')+' '+td.name+'! '+d+' damage'); }
      logChange(c,'✨ '+name+' — teleported'); save(); flashBanner('✨ You teleport!');
    }); return; }
  if(!spellTargetsEnemy(name,mc)){ castModal(c,name,level); return; }   // heal/buff/utility (Wish, Fog Cloud…) — no monster targeting
  if(!canCast(c,name,level)) return;
  const s=net.session, me=myMapPos(), tilesR=spellRangeTiles(name);
  const seek=spellSeeks(name), aoeR=SPELL_AOE[name]||0; let center=null, picked=null;
  window.__iso3dForceFrame=true;
  const reach = seek ? reachableCells(s, me.x, me.y, tilesR*5) : null;
  let liveOpts=null;
  const inRange=(x,y)=>{
    if(liveOpts&&liveOpts.rangeTiles) return liveOpts.rangeTiles.has(x+','+y);
    return seek ? reach[x+','+y]!=null : (inBlast(me.x,me.y,x,y,tilesR) && losClear(s,me.x,me.y,x,y));
  };
  const blastTargets=ctr=>s.monsters.filter(mo=>mo.hp>0 && inBlast(ctr.x,ctr.y,mo.x,mo.y,aoeR));
  const dc0=8+profBonus(c)+mod(abil(c,c.spellAbility));
  const sp=dmgTotal=>({name, dc:dc0, save:mc.save, dmgTotal, dtype:mc.dtype, cond:spellCondOf(name)});
  function resolveSingle(mo){
    $('#modalRoot').innerHTML=''; if(!castSpell(c,name,level,{x:mo.x,y:mo.y})) return;
    net.targetMon={id:mo.id,name:mo.name,ac:mo.ac}; if(net.conn){try{net.conn.send({t:'target',mon:mo.id});}catch(e){}}
    if(POWER_WORD_HP[name]!=null){ const ev=Engine.castApply(playerNetAdapter,'me',mo.id,{name,powerWord:name});
      flashBanner(ev.noEffect?name+' has no effect — '+mo.name+' has more than '+ev.threshold+' HP':ev.killed?'💀 '+name+' drops '+mo.name+' instantly':'😵 '+name+' stuns '+mo.name); return; }
    if(name==='Eyebite'){ openEyebiteChoice(playerNetAdapter,'me',mo, dc0, msg=>flashBanner(msg)); return; }
    if(name==='Detect Thoughts'){ castDetectThoughts(c, mo); return; }
    if(name==='Telekinesis'){
      const saved=telekinesisSavedKnown(c, mo);
      Engine.castApply(playerNetAdapter,'me',mo.id,{name,savedKnown:saved,cond:{c:'Restrained',rounds:10},dmgTotal:0});
      flashBanner(saved ? mo.name+' resists Telekinesis' : mo.name+' is Restrained by Telekinesis');
      return;
    }
    if(name==='Dispel Magic'||name==='Counterspell'){
      // Local echo (instant feedback, same pattern as playerNetAdapter.hurt's monster-damage
      // echo) — the DM's mirror is authoritative for the monster, so also tell it what
      // happened; its next broadcast overwrites this with the real state.
      const n=dispelMonsterConds(mo);
      if(net.conn){ try{ net.conn.send({t:'dispelMon', mon:mo.id}); }catch(e){} }
      flashBanner(n ? name+' strips '+n+' condition'+(n>1?'s':'')+' from '+mo.name : name+' — '+mo.name+' has nothing to dispel');
      return;
    }
    if(mc.attack){ attackFlow(c,{name,spell:true,toHit:profBonus(c)+mod(abil(c,c.spellAbility)),dmg:mc.dmg||'0',dt:mc.dtype||''}); return; }
    const dmgTotal=mc.dmg?(rollNotation(mc.dmg)||{total:0}).total:0;
    if(isoView&&iso3dView) try{ syncIso3DHost(s); }catch(e){}
    playCombatShotFx({x:me.x,y:me.y},{x:mo.x,y:mo.y},{kind:'spell',dtype:mc.dtype||'',hit:true,tiles:tilesR},()=>{
      const ev=Engine.castApply(playerNetAdapter, 'me', mo.id, sp(dmgTotal));
      if(ev.save) pushRoll({label:mo.name+' '+String(ev.save).toUpperCase()+' save', total:ev.saveRoll, detail:'vs DC '+ev.dc+' — '+(ev.saved?'success':'fail'), kind:'check'});
      if(mc.dmg) pushRoll({label:name+' damage', total:ev.dmg, detail:ev.saved?'saved — half':mc.dmg, kind:'dmg'});
      flashBanner(mc.dmg ? name+' hits '+mo.name+' for '+ev.dmg+(ev.saved?' (saved — half)':'') : name+' on '+mo.name+(ev.saved?' — it saves, no effect':''));
    });
  }
  function resolveBlast(ctr){
    if(!ctr){ flashBanner('Pick a center first'); return; }
    // Gust of Wind — snuff torches along the line (PHB unprotected flames)
    if(name==='Gust of Wind'){
      if(!castSpell(c,name,level,{x:ctr.x,y:ctr.y})) return;
      $('#modalRoot').innerHTML='';
      { const gw=applyGustOfWind(s, {x:me.x,y:me.y}, {x:ctr.x,y:ctr.y}, c.name, dc0);
        flashBanner('💨 Gust of Wind!'+(gw.pushed?' Pushed '+gw.pushed+' back.':'')+(gw.resisted?' '+gw.resisted+' resisted.':'')); }
      sfx('cast');
      if(isoView&&iso3dView) try{ syncIso3DHost(s); }catch(e){}
      return;
    }
    if(WALL_SPELLS.has(name)){
      if(!castSpell(c,name,level,{x:ctr.x,y:ctr.y})) return;
      $('#modalRoot').innerHTML='';
      paintHazardTerrain(s, ctr, aoeR, name, dc0);
      if(net.conn){ try{ net.conn.send({t:'paintHazard', ctr, aoeR, name, dc:dc0}); }catch(e){} }
      logChange(c,'🧱 Conjured '+name); flashBanner(name+' conjured!'); sfx('cast');
      if(isoView&&iso3dView) try{ syncIso3DHost(s); }catch(e){}
      return;
    }
    if(SPELL_NOCAST_ZONE[name]){
      if(!castSpell(c,name,level,{x:ctr.x,y:ctr.y})) return;
      $('#modalRoot').innerHTML='';
      paintNoCastZone(s, ctr, aoeR, name);
      // Reuses the existing 'paintHazard' message the wall spells already send — dmOnData's
      // handler dispatches to paintNoCastZone vs paintHazardTerrain based on SPELL_NOCAST_ZONE.
      if(net.conn){ try{ net.conn.send({t:'paintHazard', ctr, aoeR, name, dc:dc0}); }catch(e){} }
      logChange(c,'🔇 Cast '+name+' — no spellcasting inside'); flashBanner(name+' — magic suppressed in the area'); sfx('cast');
      if(isoView&&iso3dView) try{ syncIso3DHost(s); }catch(e){}
      return;
    }
    if(!castSpell(c,name,level,{x:ctr.x,y:ctr.y})) return;
    const aff=blastTargets(ctr);
    const alliesIn=(s.players||[]).filter(p=>p.id!==(net.peer&&net.peer.id) && inBlast(ctr.x,ctr.y,p.x,p.y,aoeR));
    const selfIn=inBlast(ctr.x,ctr.y,me.x,me.y,aoeR);
    $('#modalRoot').innerHTML='';
    // Roll first, then animate (modal never covers the blast FX)
    openBlastDamageModal({
      title:name, attacker:c.name, dmg:mc.dmg||'8d6', dtype:mc.dtype||'fire',
      save:mc.save, dc:dc0, targets:aff.length,
      flavor:combatFlavor('blast',{attacker:c.name, weapon:name, target:aff.length+' foes'}),
      onDone:(dmgTotal)=>{
        if(isoView&&iso3dView) try{ syncIso3DHost(s); }catch(e){}
        playBlastFx({x:me.x,y:me.y}, {x:ctr.x,y:ctr.y}, aoeR, mc.dtype||'fire', ()=>{
          if(dmgTotal) pushRoll({label:name+' (blast)',total:dmgTotal,detail:mc.dmg,kind:'dmg'});
          let saves=0; aff.forEach(mo=>{ const ev=Engine.castApply(playerNetAdapter, 'me', mo.id, sp(dmgTotal)); if(ev.saved) saves++; if(iso3dView&&window.__iso3dHost) try{ window.__iso3dHost.impact(mo.x,mo.y,'hit'); }catch(e){} });
          if(selfIn && dmgTotal){ const ev=Engine.castApply(playerNetAdapter, 'me', 'me', Object.assign(sp(dmgTotal), {save:mc.save||'dex', cond:null}));
            if(ev.dmg>0) logChange(c,'💥 Caught in own '+name+' — '+ev.dmg+' damage'+(ev.saved?' (saved — half)':'')); }
          applyFireBlastHazards(s, ctr, aoeR, name, mc.dtype);
          // Local echo (instant visual feedback), same pattern as playerNetAdapter.hurt's
          // monster-damage echo — the DM is authoritative for the shared map/hazards, so
          // also tell it what happened; its next broadcast overwrites this with the real
          // state (picking up anyone else's hazards too).
          if(SPELL_TERRAIN[name]||SPELL_GAS[name]){
            paintHazardTerrain(s,ctr,aoeR,name,dc0);
            if(net.conn){ try{ net.conn.send({t:'paintHazard', ctr, aoeR, name, dc:dc0}); }catch(e){} }
          }
          flashBanner(name+' hits '+aff.length+(dmgTotal?' for '+dmgTotal:'')+(mc.save&&saves?' · '+saves+' saved (half)':'')+(alliesIn.length?' · ⚠ '+alliesIn.map(p=>p.name).join(', ')+' caught in the area!':''));
          if(alliesIn.length) logChange(c,'⚠ '+name+' also caught: '+alliesIn.map(p=>p.name).join(', '));
          if(isoView&&iso3dView) try{ syncIso3DHost(s); }catch(e){}
        });
      }
    });
  }
  function draw(){
    let body=`<h2>✨ ${esc(name)}</h2>`;
    body+=`<p class="muted" style="font-size:12px;margin:0 0 8px">Range ${tilesR*5} ft${seek?' · 🧲 seeks (ignores walls)':aoeR?' · 💥 '+(aoeR*5)+' ft blast · line of sight':' · line of sight'}${mc.dmg?' · '+esc(mc.dmg)+' '+esc(mc.dtype||''):''}${mc.save?' · '+String(mc.save).toUpperCase()+' save':''}</p>`;
    // Cast control ABOVE the map so it's never buried under a tall Iso3D sheet
    if(aoeR&&center){
      body+=`<button class="btn block" id="stCast" style="margin:0 0 10px;background:linear-gradient(180deg,#c44,#922);border-color:#a33;font-size:16px;padding:12px">Cast ${esc(name)} at (${center.x},${center.y}) — ${blastTargets(center).length} in blast</button>`;
      body+=`<p class="muted" style="font-size:11.5px;margin:0 0 8px">Or re-tap that tile to fire. Different gold tile re-aims. Drag map to pan (does not cast).</p>`;
    } else if(!aoeR&&picked){
      body+=`<button class="btn block" id="stCast" style="margin:0 0 10px;background:linear-gradient(180deg,#c44,#922);border-color:#a33;font-size:16px;padding:12px">Cast ${esc(name)} on ${esc(picked.name)}</button>`;
      body+=`<p class="muted" style="font-size:11.5px;margin:0 0 8px">Target locked on ${esc(picked.name)}. Re-tap them or press Cast to fire. Drag map to pan.</p>`;
    } else {
      body+=`<p class="muted" style="font-size:11.5px;margin:0 0 8px">${aoeR?'Slate = blocked · Gold = clear shot · Orange = blast. Tap gold to aim, then Cast. Drag to pan.':'Slate = blocked · Gold = clear shot. Tap a gold enemy to aim, then Cast. Drag map to pan.'}</p>`;
    }
    liveOpts=buildTargetingOpts(s, me, tilesR, { needLos:!seek&&tilesR>1, seek:!!seek, reach:reach, center:center, aoeR:aoeR, targets:picked?[picked.id]:null });
    const opts=liveOpts;
    body+=mapGridHTML(s,false,opts);
    body+=`<button class="btn ghost block" id="stClose" style="margin-top:10px">Cancel</button>`;
    $('#modalRoot').innerHTML=`<div class="modal" id="stModal"><div class="sheet"><div class="grip"></div>${body}</div></div>`;
    if(isoView&&iso3dView) try{ syncIso3DHost(s, opts); }catch(e){}
    const reattach3d=()=>{ if(isoView&&iso3dView) try{ syncIso3DHost(net&&net.session||QB); }catch(e){} };
    $('#stClose').onclick=()=>{ $('#modalRoot').innerHTML=''; reattach3d(); };
    $('#stModal').onclick=e=>{ if(e.target.id==='stModal'){ $('#modalRoot').innerHTML=''; reattach3d(); } };
    document.querySelectorAll('#stModal [data-cell]').forEach(el=>el.onclick=()=>{ const [x,y]=el.dataset.cell.split(',').map(Number);
      if(aoeR){
        const resolved=resolveCastCenter(s, x, y, opts.rangeTiles, me);
        if(!resolved){ flashBanner('Need a gold tile (clear line of effect)'); return; }
        // Place → confirm (first tap aims; second same tile or Cast fires) so camera pan is safe
        if(center && center.x===resolved.x && center.y===resolved.y){ resolveBlast(center); return; }
        center=resolved; draw(); return;
      }
      // Fire Bolt etc.: aim first, Cast / re-tap to fire (pan-safe, same as Fireball)
      if(!inRange(x,y)){ flashBanner(seek?'No path within range':'Out of range / no line of sight'); return; }
      const mo=s.monsters.find(m=>m.hp>0&&m.x===x&&m.y===y); if(!mo){ flashBanner('Tap a gold enemy to aim'); return; }
      if(picked && picked.id===mo.id){ resolveSingle(mo); return; }
      picked=mo; draw(); });
    { const sc=$('#stCast'); if(sc) sc.onclick=(e)=>{ e.stopPropagation();
      if(aoeR) resolveBlast(center);
      else if(picked) resolveSingle(picked);
      else flashBanner(aoeR?'Pick a gold center first':'Pick a target first');
    }; }
  }
  draw();
}

function attackFlow(c, atk){
  // The Attack action lets you make (extraAttacks+1) attacks. Starting a fresh
  // attack sequence costs one action; mid-sequence attacks are free. If you're out
  // of attacks AND out of actions, you can't attack this turn.
  if(c.battle && atk.offhand){
    if(c.battle.bonus){ flashBanner('Bonus action already used this turn'); return; }
    if((c.battle.attacksLeft||0) >= (extraAttacks(c)+1)){ flashBanner('Take your main Attack action first, then the off-hand attack'); return; }
  } else if(c.battle && atk.reaction){
    if(c.battle.reaction){ flashBanner('Reaction already used this turn'); return; }
  } else if(c.battle && !atk.spell){
    const full=extraAttacks(c)+1, left=c.battle.attacksLeft||0;
    const midSequence = left>0 && left<full;
    if(!midSequence && !hasAction(c)){ flashBanner('No actions left this turn — end your turn to reset'); return; }
  }
  const toHit=Number(atk.toHit)||0;
  const saveOnly = (atk.toHit==null && atk.save);   // save-based spell: no to-hit, target rolls a save
  const st={phase: saveOnly?'dmg':'tohit', d20:0, total:0, crit:false, hit:saveOnly?true:null, dmgTotal:null, twoH:false, mode:rollMode, powerAttack:false};
  const paKind=powerAttackKind(c, atk);   // Great Weapon Master / Sharpshooter eligibility
  // Regression fix: this declaration was accidentally dropped during the attackRiderOptions
  // extraction (rollToHit's melee/range check below still reads it) — restored.
  const wref=(!atk.spell)?weaponByName(String(atk.name||'').replace(/\s*\((off-hand|opportunity)\)$/,'')):null;
  // Real target lookup: net.targetMon only carries {id,name,ac}; the actual monster object
  // (needed for Colossus Slayer's below-max-HP check, Hurl Through Hell's fiend check, Death
  // Strike's save bonus) lives in the synced session.
  const targetMo = (net&&net.session&&net.targetMon) ? net.session.monsters.find(m=>m.id===net.targetMon.id) : null;
  // Class riders on weapon hits — see attackRiderOptions/applyAttackRiders above for the shared
  // logic (also used by Quick Battle's openCombatRollModal, so every rider works the same way
  // in both modes).
  const riders = attackRiderOptions(c, atk, targetMo);
  const close=()=>{ $('#modalRoot').innerHTML=''; };
  function rollToHit(face){
    if(c.battle && atk.offhand){
      if(c.battle.bonus){ flashBanner('Bonus action already used'); return; }
      c.battle.bonus=true; save();
    } else if(c.battle && atk.reaction){
      if(c.battle.reaction){ flashBanner('Reaction already used'); return; }
      c.battle.reaction=true; save();
    } else if(c.battle && !atk.spell){
      const full=extraAttacks(c)+1;
      if((c.battle.attacksLeft||0)<=0){
        // out of attacks: spend a fresh action to take the Attack action again
        if(!hasAction(c)){ flashBanner('No actions left this turn'); return; }
        spendAction(c); c.battle.attacksLeft=full;
      } else if((c.battle.attacksLeft||0) >= full){
        // first attack of a sequence consumes one action
        if(!hasAction(c)){ flashBanner('No actions left this turn'); return; }
        spendAction(c);
      }
    }
    let ac=(net&&net.targetMon&&typeof net.targetMon.ac==='number')?net.targetMon.ac:null, cover=0;
    // condition-driven advantage: my conditions always count; the target's when known
    let tSet=new Set(), melee=!(wref&&wref.type==='ranged'), targetMoReal=null;
    if(net&&net.session&&net.targetMon){ const me=myMapPos(); const mo=net.session.monsters.find(m=>m.id===net.targetMon.id);
      if(mo){ tSet=unitConds(mo); melee=gridDist(me.x,me.y,mo.x,mo.y)<=1; targetMoReal=mo;
        if(ac!=null && !atk.spell){ cover=coverBetween(net.session, me.x,me.y, mo.x,mo.y); ac+=cover; } } }
    const cx=attackAdvantage(new Set(Object.keys(c.conditions||{})), tSet, melee);
    // Assassinate (Assassin 3rd) — same rules as the QB path (qbResolveAttack).
    if(isAssassin(c,3) && targetMoReal){
      if(hasNotActedYet(net.session, targetMoReal.id)){ cx.adv=1; cx.why=(cx.why||[]).concat('Assassinate — hasn\'t acted yet'); }
      if(targetMoReal.surprised) cx.autoCrit=true;
    }
    const effToHit=toHit-(st.powerAttack?5:0);   // Great Weapon Master / Sharpshooter
    const r=Engine.roll(effToHit, ac, face, cx.adv); sfx('swing');   // unified d20 resolver
    if(cx.autoCrit && (r.hit||ac==null)) r.crit=true;   // Paralyzed/Unconscious target hit in melee
    const d20=r.d20; st.d20=d20; st.crit=r.crit; st.total=r.total;
    st.targetSurprised=!!(targetMoReal&&targetMoReal.surprised);   // Death Strike (17th) reads this in rollDmg
    const advTag=(face==null&&cx.adv)?((cx.adv>0?' · ADV':' · DIS')+' — '+cx.why.join(', ')):'';
    if(advTag) flashBanner((cx.adv>0?'⬆ Advantage':'⬇ Disadvantage')+': '+cx.why.join(', '));
    pushRoll({label:atk.name+' attack', total:st.total, detail:'d20 ('+d20+') '+sgn(effToHit)+advTag, crit:st.crit?'crit':d20===1?'fumble':null, kind:'check'});
    if(c.battle && !atk.spell && !atk.offhand && !atk.reaction){ c.battle.attacksLeft=Math.max(0,c.battle.attacksLeft-1); save(); }
    if(ac!=null){   // known target AC → auto-resolve, no Hit/Miss prompt
      const hit = r.hit;
      st.targetAC=ac; st.hit=hit; st.phase = hit?'dmg':'done';
      if(hit){ sfx(st.crit?'crit':'hit'); attackFx(st.crit?'crit':'hit'); }
      else { sfx('miss'); attackFx('miss'); logChange(c, atk.name+' misses (rolled '+st.total+' vs AC '+ac+(cover?' incl. +'+cover+' cover':'')+')'); if(net&&net.role==='player'&&net.targetMon&&net.conn){ try{ net.conn.send({t:'attack',mon:net.targetMon.id,who:c.name,hit:false}); }catch(e){} } }
    } else { st.phase='hit'; }
    draw();
  }
  function rollDmg(manual){
    const base=(st.twoH&&atk.vers)?atk.vers:atk.dmg;
    const notation=st.crit?critNotation(base):base;
    let total, detail;
    if(manual!=null){ total=manual; detail='entered'+(st.crit?' (crit)':''); }
    else { const r=rollNotation(notation)||{total:0,detail:''}; total=r.total; detail=r.detail; }
    if(st.powerAttack){ total+=10; detail+=' · power attack +10'; }
    // riders: chosen in the damage step, shared logic via applyAttackRiders (attackRiderOptions'
    // pair) so QB's openCombatRollModal gets byte-identical behavior from the same function.
    { const sk=document.getElementById('afSneak'), sm=document.getElementById('afSmite'), ds=document.getElementById('afDivStrike'), cs=document.getElementById('afColossus'), hth=document.getElementById('afHurl'), mv=document.getElementById('afManeuver');
      const choices={sneak: sk&&sk.checked, smiteLevel: sm&&sm.value, divineStrike: ds&&ds.checked, colossus: cs&&cs.checked, hurl: hth&&hth.checked, maneuver: mv&&mv.value};
      const rr=applyAttackRiders(c, atk, targetMo, choices, st.crit, st.targetSurprised, m=>logChange(c,m));
      total+=rr.total; detail+=rr.detail;
      if(rr.doubled) total*=2;
    }
    st.dmgTotal=total; st.phase='done'; sfx(atk.heal?'heal':'damage'); attackFx(atk.heal?'heal':(st.crit?'crit':'hit'));
    pushRoll({label:atk.name+' damage'+(st.crit?' (CRIT)':''), total, detail, kind:'dmg', notation});
    if(net&&net.role==='player'&&net.targetMon&&net.conn){ try{ net.conn.send({t:'attack', mon:net.targetMon.id, who:c.name, hit:true, dmg:total, dtype:atk.dt||atk.dtype||''}); }catch(e){} }
    Events.emit({type:'attack', by:c.name, name:atk.name, hit:true, crit:st.crit, dmg:total, dtype:atk.dt||atk.dtype||'', ranged:(atk.tiles||1)>1});
    draw();
  }
  function draw(){
    let body=`<h2>⚔ ${esc(atk.name)}</h2>`;
    if(st.phase==='tohit'){
      body+=`<p class="muted" style="font-size:13px">To hit <b>${sgn(toHit-(st.powerAttack?5:0))}</b>${st.powerAttack?' (−5 power attack)':''}</p>
        ${paKind?`<label class="pill" style="cursor:pointer;margin-bottom:8px;display:flex"><input type="checkbox" id="afPower" ${st.powerAttack?'checked':''}> ${paKind==='gwm'?'💥 Great Weapon Master':'🎯 Sharpshooter'} — −5 to hit, +10 damage</label>`:''}
        ${st.mode==='manual'
          ? `<div class="addrow"><input id="afManual" type="number" placeholder="enter d20 (1–20)"><button class="btn" id="afUse">Use</button></div>`
          : `<button class="btn block" id="afAuto">🎲 Roll to hit</button>`}
        <button class="btn ghost sm" id="afModeSwitch" style="margin-top:8px">${st.mode==='manual'?'🎲 Auto-roll instead':'✎ Enter manually instead'}</button>`;
    } else if(st.phase==='hit'){
      body+=`<div class="card" style="text-align:center;margin:0 0 10px"><div style="font-family:Georgia,serif;font-size:34px;font-weight:700;color:var(--accent)">${st.total}</div><div class="muted">d20 (${st.d20}) ${sgn(toHit-(st.powerAttack?5:0))}${st.crit?' · 💥 NAT 20':st.d20===1?' · NAT 1':''}</div></div>
        <p style="text-align:center;margin:0 0 8px">Did it beat the target's AC?</p>
        <div class="row2"><button class="btn" id="afHit">✓ Hit${st.crit?' (crit)':''}</button><button class="btn bad" id="afMiss">✗ Miss</button></div>`;
    } else if(st.phase==='dmg'){
      body+=`${(st.targetAC&&!saveOnly)?`<div class="card" style="text-align:center;margin:0 0 8px;background:rgba(63,125,54,.12)"><b style="color:var(--good)">${st.crit?'💥 CRITICAL HIT':'✓ HIT'}</b> — rolled ${st.total} vs AC ${st.targetAC}</div>`:''}
        ${saveOnly?`<p style="text-align:center;margin:0 0 8px">🛡️ Target makes a <b>${(atk.save.ab||'').toUpperCase()} save vs your DC ${8+profBonus(c)+mod(abil(c,c.spellAbility))}</b></p>`:''}
        ${(st.crit&&!st.targetAC)?'<p style="text-align:center;color:var(--accent2);margin:0 0 8px"><b>💥 Critical hit — damage dice doubled!</b></p>':''}
        ${atk.vers?`<label class="pill" style="cursor:pointer;margin-bottom:8px"><input type="checkbox" id="af2h" ${st.twoH?'checked':''}> Two-handed (${esc(atk.vers)})</label>`:''}
        ${st.hit!==false?riderChecksHTML(riders):''}
        <p class="muted" style="font-size:13px">Damage: <b>${esc((st.twoH&&atk.vers)?atk.vers:atk.dmg)} ${esc(atk.dt||'')}</b>${st.crit?' ×2 dice':''}</p>
        ${st.mode==='manual'
          ? `<div class="addrow"><input id="afDmgMan" type="number" placeholder="enter total"><button class="btn" id="afDmgUse">Use</button></div>`
          : `<button class="btn block" id="afDmgAuto">🎲 Roll damage</button>`}
        <button class="btn ghost sm" id="afModeSwitch" style="margin-top:8px">${st.mode==='manual'?'🎲 Auto-roll instead':'✎ Enter manually instead'}</button>`;
    } else {
      const single = atk.offhand || atk.reaction;   // off-hand & opportunity attacks are one-and-done
      const moreAttacks = !single && (!c.battle || (c.battle.attacksLeft||0)>0);
      const canNewAction = !single && !!c.battle && hasAction(c);   // a 2nd action can start a new Attack
      const canAgain = !atk.spell && (moreAttacks || canNewAction);
      const againLabel = moreAttacks ? '⚔ Attack again'+(c.battle?' ('+(c.battle.attacksLeft||0)+' left)':'') : '⚔ Attack again (uses another action)';
      body+=`<div class="card" style="text-align:center;margin:0 0 10px"><div class="muted">${st.hit?(st.crit?'💥 Critical hit!':'Hit!'):'Miss'+(st.targetAC?' (rolled '+st.total+' vs AC '+st.targetAC+')':'')}</div>${st.hit?`<div style="font-family:Georgia,serif;font-size:34px;font-weight:700;color:var(--bad)">${st.dmgTotal}</div><div class="muted">${esc(atk.dt||'')} damage</div>`:''}</div>
        ${canAgain?`<button class="btn block" id="afAgain">${againLabel}</button>`:`<div class="muted" style="text-align:center;font-size:12px">${c.battle?'No actions left — close & end turn':''}</div>`}`;
    }
    body+=`<button class="btn ghost block" id="afClose" style="margin-top:10px">Close</button>`;
    $('#modalRoot').innerHTML=`<div class="modal" id="afModal"><div class="sheet"><div class="grip"></div>${body}</div></div>`;
    $('#afModal').onclick=e=>{ if(e.target.id==='afModal') close(); };
    $('#afClose').onclick=close;
    if(st.phase==='tohit'){
      const a=$('#afAuto'); if(a) a.onclick=()=>rollToHit(null);
      const u=$('#afUse'); if(u) u.onclick=()=>{ const v=Number($('#afManual').value); if(v>=1&&v<=20) rollToHit(v); else flashBanner('Enter 1–20'); };
      $('#afModeSwitch').onclick=()=>{ st.mode=st.mode==='manual'?'auto':'manual'; draw(); };
      const pw=$('#afPower'); if(pw) pw.onchange=()=>{ st.powerAttack=pw.checked; draw(); };
    }
    else if(st.phase==='hit'){ $('#afHit').onclick=()=>{ st.hit=true; st.phase='dmg'; sfx(st.crit?'crit':'hit'); attackFx(st.crit?'crit':'hit'); draw(); }; $('#afMiss').onclick=()=>{ st.hit=false; st.phase='done'; sfx('miss'); attackFx('miss'); logChange(c, atk.name+' — attack missed'); if(net&&net.role==='player'&&net.targetMon&&net.conn){ try{ net.conn.send({t:'attack', mon:net.targetMon.id, who:c.name, hit:false}); }catch(e){} } draw(); }; }
    else if(st.phase==='dmg'){
      const t=$('#af2h'); if(t) t.onchange=()=>{ st.twoH=t.checked; draw(); };
      const a=$('#afDmgAuto'); if(a) a.onclick=()=>rollDmg(null);
      const u=$('#afDmgUse'); if(u) u.onclick=()=>{ const el=$('#afDmgMan'); const v=Number(el.value); if(el.value!==''&&!isNaN(v)) rollDmg(v); };
      $('#afModeSwitch').onclick=()=>{ st.mode=st.mode==='manual'?'auto':'manual'; draw(); };
    }
    else { $('#afAgain').onclick=()=>{ st.phase='tohit'; st.d20=0; st.total=0; st.crit=false; st.hit=null; st.dmgTotal=null; st.twoH=false; draw(); }; }
  }
  draw();
}

function openAttack(c){
  const ws=weaponItems(c), atks=extraAttacks(c)+1, A=k=>k.toUpperCase();
  let cards='';
  ws.forEach(({it,i})=>{ const w=weaponByName(it.name)||{dmg:'1d4',dt:'',props:'',rng:'5 ft',type:'melee',cat:''};
    const ab=weaponAbil(c,w), abm=mod(abil(c,ab)), prof=weaponProficient(c,w), th=weaponToHit(c,w,it);
    const dnote=w.dmg+(weaponDmgBonus(c,w,it)?sgn(weaponDmgBonus(c,w,it)):'');
    cards+=`<div class="card" style="margin:0 0 10px">
      <div class="row" style="gap:8px;align-items:center"><span style="flex:none">${itemEmblem(weaponIconKey(it.name),5)}</span><div class="nm"><b>${esc(it.name)}</b><small>${esc(dnote)} ${esc(w.dt||'')} · ${esc(w.rng||'5 ft')}</small></div></div>
      <div class="addrow" style="gap:6px;flex-wrap:wrap;margin:8px 0"><span class="pill">🗡️ ${atks}/action</span><span class="pill">📏 ${esc(w.rng||'5 ft')}</span>${w.ammo?`<span class="pill">🏹 ${w.ammo}</span>`:''}<span class="pill">${A(ab)} ${sgn(abm)}</span><span class="pill" style="${prof?'':'color:var(--bad)'}">${prof?'✓ Proficient':'✗ Not proficient'}</span></div>
      <button class="btn block" ${weaponAflowAttrs(c,it)}>⚔ Roll attack →</button>
    </div>`;
  });
  (c.attacks||[]).forEach((a)=>{ const bn=Number(String(a.bonus).replace(/[^0-9-]/g,''))||0;
    cards+=`<div class="card" style="margin:0 0 10px"><div class="nm"><b>${esc(a.name)}</b>${a.damage?`<small>${esc(a.damage)}</small>`:''}</div>
      <button class="btn block" data-aflow data-aname="${esc(a.name)}" data-ahit="${bn}" data-admg="${esc(a.damage||'')}" data-adt="" data-avers="">⚔ Roll attack →</button></div>`;
  });
  if(canOffhand(c)){ const seen=new Set(); offhandWeapons(c).forEach(w=>{ if(seen.has(w.n))return; seen.add(w.n); const oa=offhandAtk(c,w);
    cards+=`<div class="card" style="margin:0 0 10px;background:rgba(77,106,44,.08)"><div class="nm"><b>🗡️ ${esc(w.n)} — off-hand</b><small>bonus action · ${esc(oa.dmg)} ${esc(w.dt||'')}</small></div>
      <button class="btn block" data-aflow data-offhand="1" data-aname="${esc(oa.name)}" data-ahit="${oa.toHit}" data-admg="${esc(oa.dmg)}" data-adt="${esc(w.dt||'')}" data-avers="">⚔ Off-hand attack (bonus) →</button></div>`; }); }
  $('#modalRoot').innerHTML=`<div class="modal" id="atkModal"><div class="sheet"><div class="grip"></div>
    <h2>⚔ Attack</h2>
    <p class="muted" style="font-size:12px;margin:0 0 10px">You can make <b>${atks}</b> attack${atks>1?'s':''} with one Attack action${extraAttacks(c)?' (Extra Attack)':''}. Pick a weapon — it rolls to hit, asks if you hit, then rolls damage.</p>
    ${(ws.length||(c.attacks||[]).length)?cards:'<div class="empty">No weapons or attacks yet. Add weapons on the Items tab.</div>'}
    <button class="btn ghost block" id="atkClose" style="margin-top:6px">Close</button>
  </div></div>`;
  $('#atkClose').onclick=()=>{ $('#modalRoot').innerHTML=''; };
  $('#atkModal').onclick=e=>{ if(e.target.id==='atkModal') $('#modalRoot').innerHTML=''; };
}

function showInfo(title, sub, body){
  $('#modalRoot').innerHTML=`<div class="modal" id="infoModal"><div class="sheet"><div class="grip"></div>
    <h2 style="margin-bottom:2px">${esc(title)}</h2>${sub?`<p class="muted" style="font-size:13px;margin:0 0 12px">${esc(sub)}</p>`:''}
    <div style="font-size:14px;line-height:1.55">${body}</div>
    <button class="btn ghost block" style="margin-top:16px" id="infoClose">Close</button></div></div>`;
  $('#infoClose').onclick=()=>{ $('#modalRoot').innerHTML=''; };
  $('#infoModal').onclick=e=>{ if(e.target.id==='infoModal') $('#modalRoot').innerHTML=''; };
}

function applyChoices(specs, c){
  // validate counts first
  for(let i=0;i<specs.length;i++){ const sp=specs[i];
    if(sp.t==='skill'||sp.t==='expertise'||sp.t==='spellChoice'||sp.t==='weaponProf'){ const got=document.querySelectorAll('[data-csp="'+i+'"]:checked').length; if(got!==sp.n){ flashBanner('Pick exactly '+sp.n+' for one of the choices'); return false; } }
    if(sp.t==='ability' && sp.n>1){ const vals=[...document.querySelectorAll('#csp_'+i+'_0, #csp_'+i+'_1')].map(s=>s.value); if(new Set(vals).size!==vals.length){ flashBanner('Choose two different abilities'); return false; } }
  }
  specs.forEach((sp,i)=>{
    if(sp.t==='ability'){ [...Array(sp.n)].forEach((_,j)=>{ const el=document.getElementById('csp_'+i+'_'+j); if(el) c.asiBonus[el.value]=(c.asiBonus[el.value]||0)+1; }); clampAbil(c); }
    else if(sp.t==='resilient'){ const el=document.getElementById('csp_'+i+'_0'); if(el){ c.asiBonus[el.value]=(c.asiBonus[el.value]||0)+1; c.saveProf[el.value]=true; clampAbil(c); } }
    else if(sp.t==='skill'){ document.querySelectorAll('[data-csp="'+i+'"]:checked').forEach(el=>c.skillProf[el.value]=true); }
    else if(sp.t==='expertise'){ document.querySelectorAll('[data-csp="'+i+'"]:checked').forEach(el=>c.skillExp[el.value]=true); }
    else if(sp.t==='spellChoice'){ document.querySelectorAll('[data-csp="'+i+'"]:checked').forEach(el=>{ const [n,l]=el.value.split('|'); if(!c.spells.some(s=>s.name.toLowerCase()===n.toLowerCase())) c.spells.push({name:n,level:Number(l),prepared:false,notes:''}); }); c.spells.sort((a,b)=>(a.level-b.level)||a.name.localeCompare(b.name)); }
    else if(sp.t==='ancestry'){ const el=document.getElementById('csp_'+i+'_anc'); if(el) c.dragon=el.value; }
    else if(sp.t==='fightingStyle'){ const el=document.getElementById('csp_'+i+'_fs'); if(el) c.fightingStyle=el.value; }
    else if(sp.t==='pick'){ const el=document.getElementById('csp_'+i+'_pick'); if(el){ if(sp.multi){ if(!c[sp.key]) c[sp.key]=[]; c[sp.key].push(el.value); } else c[sp.key]=el.value; } }
    else if(sp.t==='weaponProf'){ if(!c.weaponMasterProfs) c.weaponMasterProfs=[]; document.querySelectorAll('[data-csp="'+i+'"]:checked').forEach(el=>c.weaponMasterProfs.push(el.value)); }
  });
  return true;
}

function promptChoices(title, specs, c, onApply){
  $('#modalRoot').innerHTML=`<div class="modal" id="chModal"><div class="sheet"><div class="grip"></div>
    <h2>${esc(title)}</h2>${specs.map((sp,i)=>choiceControl(sp,i,c)).join('')}
    <button class="btn block" id="chApply" style="margin-top:8px">Apply</button></div></div>`;
  $('#chApply').onclick=()=>{ if(applyChoices(specs,c)){ if(onApply) onApply(); $('#modalRoot').innerHTML=''; save(); render(); } };
}

function applyFeat(c, name, then){
  if(c.feats.some(f=>(f.name||f)===name)){ flashBanner('You already have '+name); if(then) then(); return; }
  c.feats.push({name}); logChange(c,'Gained feat: '+name);
  const grants=FEAT_GRANTS[name]||[];
  grants.forEach(g=>{
    if(g.t==='fixed') c.asiBonus[g.k]=(c.asiBonus[g.k]||0)+1;
    else if(g.t==='autospell') g.spells.forEach(sp=>{ if(!c.spells.some(s=>s.name.toLowerCase()===sp.toLowerCase())){ const m=spellMeta(sp); c.spells.push({name:sp,level:m?m.l:0,prepared:false,notes:'(from '+name+')'}); } });
  });
  // Tough: +2 max HP per level — backfilled retroactively for every level already gained (the
  // per-level level-up flow's own hpGain calc only picks this up starting NEXT level, since
  // c.feats doesn't have Tough yet at the point that calc runs this same transaction).
  if(name==='Tough'){ const bonus=2*(Number(c.level)||1); c.hp.max+=bonus; c.hp.cur+=bonus; }
  clampAbil(c); save();
  const inputs=grants.filter(g=>['ability','skill','expertise','resilient','spellChoice','weaponProf'].includes(g.t));
  if(inputs.length) promptChoices(name+' — make your choices', inputs, c, then);
  else { render(); if(then) then(); }
}

function endEffect(c, id){
  const e=(c.effects||[]).find(x=>x.id===id); if(!e) return;
  c.effects=c.effects.filter(x=>x.id!==id);
  if(e.conc && c.concentration && c.concentration.spell===e.name) c.concentration={active:false,spell:''};
  if(e.cond && c.conditions && !(c.effects||[]).some(x=>x.cond===e.cond)) delete c.conditions[e.cond];
  clearItemEffect(c,e);
  // PHB: dismissing Light (or ending its duration) snuffs the map light
  if(e.name&&SPELL_LIGHTS[e.name]){
    const s=battleSession();
    if(s&&s.lights){
      const by=c.name;
      s.lights=s.lights.filter(L=>!(L.name===e.name&&L.by===by));
      if(typeof qbLog==='function'&&s===QB) qbLog('💡 '+e.name+' ends — the light goes out');
    }
  }
  // Summons tied to this spell vanish when the effect ends
  if(e.name&&typeof dismissSummonsForSpell==='function'){
    const s=battleSession();
    if(s) dismissSummonsForSpell(s, c, e.name);
  }
  logChange(c,'Ended '+e.name); save(); render();
}

function advanceRound(c){
  let expired=[];
  (c.effects||[]).forEach(e=>{ if(e.rounds!=null){ e.rounds-=1; if(e.rounds<=0) expired.push(e); } });
  c.effects=(c.effects||[]).filter(e=>e.rounds==null || e.rounds>0);
  expired.forEach(e=>{ if(e.conc && c.concentration && c.concentration.spell===e.name) c.concentration={active:false,spell:''};
    if(e.cond && c.conditions && !(c.effects||[]).some(x=>x.cond===e.cond)) delete c.conditions[e.cond];
    clearItemEffect(c,e);
    // Light / Darkness spell effects going dark
    if(e.name&&SPELL_LIGHTS[e.name]){
      const s=battleSession();
      if(s&&s.lights) s.lights=s.lights.filter(L=>!(L.name===e.name&&L.by===c.name));
    }
    if(e.name&&typeof dismissSummonsForSpell==='function'){
      const s=battleSession();
      if(s) dismissSummonsForSpell(s, c, e.name);
    }
  });
  if(expired.length) logChange(c,'Expired: '+expired.map(e=>e.name).join(', '));
  save(); render();
  flashBanner(expired.length?('Round advanced — expired: '+expired.map(e=>e.name).join(', ')):'Round advanced');
}

function castSpell(c, name, level, lightAt, spellOpts){
  level=Number(level)||0;
  const ritual = !!(spellOpts && spellOpts.ritual && canRitualCast(c,name));
  if(!canCast(c,name,level,{ritual})) return false;
  const free=(name && wishFreeName===name); if(free) wishFreeName=null;   // Wish duplication: consume the grant
  // Thousand Forms / feat-granted once/day spells: no spell slot expended, but the action/
  // bonus-action cost below still applies — a narrower bypass than Wish's `free` (which also
  // skips the action-economy spend).
  const featFree = !free && featFreeCastSpell(c,name) && !(c.featFreeCastUsed&&c.featFreeCastUsed[name]);
  if(featFree){ if(!c.featFreeCastUsed) c.featFreeCastUsed={}; c.featFreeCastUsed[name]=true; }
  const freeSlot = free || featFree || ritual || (name==='Alter Self' && isMoonDruid(c,14));
  const ct=spellCastTime(name);
  if(level>0 && !freeSlot){ if(!c.slots[level]) c.slots[level]={total:0,used:0}; c.slots[level].used=Math.min((spellSlots(c)[level]||0),(c.slots[level].used||0)+1); }   // spend the slot
  if(c.battle && !free && !ritual){
    if(ct==='reaction'){ c.battle.reaction=true; }
    else if(ct==='bonus'){ c.battle.bonus=true; c.battle.castBonusSpell=true; }
    else { spendAction(c); if(level>0) c.battle.castLeveledSpell=true; }
  }
  Events.emit({type:'cast', by:c.name, name, level, castTime:ct, ritual});
  let tmpl=SPELL_EFFECTS[name]; sfx('cast'); castFx(name);
  // No effect template but the spell is concentration → still track it as a concentration
  // effect, so casting it drops any previous concentration (one spell at a time, PHB).
  if(!tmpl && isConcentration(name)) tmpl={rounds:null, conc:true, note:SPELL_DESC[name]||'Concentration — one such spell at a time.'};
  // Light / darkness / glow spells — pool on the map (at target if provided, else caster)
  let lightMsg='';
  // Light touched onto an object held/worn by a hostile creature that made its Dex save:
  // the spell is still cast (slot/action spent, handled above) but nothing lights up —
  // see openLightTarget's resolveLightOnCreature for the save roll.
  const suppressLight=!!(spellOpts&&spellOpts.suppressLight);
  // A resisted Light has no effect at all — including no tracked buff on the caster's
  // own sheet (SPELL_EFFECTS['Light'] would otherwise apply unconditionally, above).
  if(suppressLight) tmpl=null;
  if(SPELL_LIGHTS[name] && !suppressLight){
    const s=battleSession();
    if(s){
      applySpellLight(s, c, name, lightAt||null, spellOpts&&spellOpts.followId!==undefined?spellOpts.followId:undefined);
      const def=SPELL_LIGHTS[name];
      if(def&&!def.grantDarkvision){
        lightMsg=def.dark
          ?(' · magical darkness '+(def.dark*5)+' ft')
          :(' · bright '+(def.bright||0)*5+' ft / dim '+((def.dim!=null?def.dim:0)*5)+' ft');
      }
    } else if(name==='Light'||name==='Produce Flame'||name==='Dancing Lights'){
      // Out of battle: still track the effect on the sheet
      lightMsg=' · (no battle map — light tracked as an effect)';
    }
  } else if(suppressLight){
    lightMsg=' · resisted — no light appears';
  }
  // Light cantrip always gets a tracked effect (PHB 1 hour; dismiss by ending the effect)
  if(name==='Light' && !tmpl && !suppressLight) tmpl=SPELL_EFFECTS['Light'];
  const ba=(ct==='bonus')?' · bonus action':(ct==='reaction')?' · reaction':'';
  if(tmpl){ addEffect(c, name, tmpl);
    if(name==='Sanctuary'||name==='Holy Aura'){ const e=c.effects[c.effects.length-1]; e.dc=8+profBonus(c)+mod(abil(c,c.spellAbility)); }   // attackers must beat this save (Sanctuary: to target you; Holy Aura: after hitting you, or be blinded)
    logChange(c,'Cast '+name+(level?' (L'+level+')':'')+(ba?' ['+ct+']':'')+lightMsg); save(); render(); flashBanner('Cast '+name+(tmpl.conc?' · concentrating':'')+ba+lightMsg); }
  else { logChange(c,'Cast '+name+(level?' (L'+level+')':'')+(ba?' ['+ct+']':'')+lightMsg); save(); render(); flashBanner('Cast '+name+(level?' — slot spent':'')+ba+lightMsg); }
  // Oddball spells resolve AFTER the cast: Time Stop grants extra turns; spells in
  // SPELL_CHOICES open a multiple-choice outcome menu; other pure-narrative spells
  // offer the AI narrator (premium, user-supplied key). Skip light utility — already applied.
  if(name==='Time Stop' && c.battle){ const n=rnd(4)+1; c.battle.timeStopTurns=(n-1); save(); flashBanner('⏳ Time Stop — '+n+' turns in a row!'); logChange(c,'⏳ Time Stop — '+n+' turns in a row'); }
  else if(name==='Goodberry'){
    // PHB: 10 berries, 1 HP each, eaten as an action later (not a one-shot heal-and-done
    // like Cure Wounds) — tracked as a real consumable counter, not a roll-and-forget.
    c.goodberries=(c.goodberries||0)+10; save(); render();
    flashBanner('🫐 10 Goodberries created — eat one (Items tab) for 1 HP, action each'); logChange(c,'🫐 Created 10 Goodberries');
  }
  else if(name==='Spare the Dying'){
    // Cantrip, touch, auto-succeeds (no Medicine roll, unlike the Use-menu Stabilize action).
    // Solo Quick Battle has no second ally to touch (same limitation Stabilize has); in
    // player-net, auto-target the nearest adjacent downed ally — "touch a dying creature" is
    // rarely ambiguous in practice, so skip a picker for a single obvious target.
    const s=battleSession();
    if(net && net.role==='player' && s && s.players){
      const me=s.players.find(p=>p.id===net.peer.id);
      const target=me && s.players.filter(p=>p.id!==net.peer.id && needsStabilizing(p) && gridDist(me.x,me.y,p.x,p.y)<=1)
        .sort((a,b)=>gridDist(me.x,me.y,a.x,a.y)-gridDist(me.x,me.y,b.x,b.y))[0];
      if(target){ if(net.conn) try{ net.conn.send({t:'stabilize', targetId:target.id}); }catch(e){}
        flashBanner('🩹 '+target.name+' is stabilized'); logChange(c,'🩹 Spare the Dying — stabilized '+target.name); }
      else flashBanner('No dying creature within touch range');
    } else flashBanner('No dying creature to touch (Quick Battle has no second ally)');
  }
  else if(name==='Remove Curse'){
    if(c.conditions&&c.conditions.Cursed) curePcCond(c,'Remove Curse','Cursed');
    else flashBanner('No curse detected');
  }
  else if(name==='Protection from Poison'){
    // PHB also grants resistance to poison damage + advantage vs becoming poisoned for 1
    // hour — this app doesn't model PC damage resistance in applyHp (only monsters carry
    // MONSTER_RVI), so only the immediate cure + a tracked flavor effect are real; the
    // resistance itself is narrative, same simplification as several other PC buffs here.
    if(c.conditions&&c.conditions.Poisoned) curePcCond(c,'Protection from Poison','Poisoned');
    addEffect(c,'Protection from Poison',{rounds:600, note:'Advantage on saves vs poison; resistance to poison damage (narrative — not auto-applied to incoming damage).'});
    save(); render(); flashBanner('🧪 Protected from poison for 1 hour');
  }
  else if(name==='Knock'){
    // This app doesn't model a distinct "locked" state on doors/chests (just open/closed) —
    // so Knock auto-opens the nearest closed one in range instead of defeating a lock
    // specifically. Real, if simplified: it saves the walk-up-and-interact step at range,
    // which is the spell's actual table value (RAW's "loud noise alerts everyone" side
    // effect isn't modeled — no stealth/alert-radius system for monsters to hook into).
    const s=battleSession();
    const me=(typeof QB!=='undefined'&&QB&&QB.active) ? (QB.players&&QB.players[0])
      : (net&&net.role==='player'&&net.peer ? ((s&&s.players)||[]).find(p=>p.id===net.peer.id) : null);
    const target=(s&&me) ? listInteractInRange(s, me, 12).find(it=>(it.obj.state||it.def.default)==='closed') : null;
    if(target){ const res=runInteractAction(s, c, target.key, 'open', 'adj');
      if(res&&res.ok){ logChange(c,'🔓 Knock — '+res.msg); flashBanner('🔓 '+res.msg); if(typeof qbLog==='function'&&s===QB) qbLog('🔓 '+c.name+' — '+res.msg); save(); render(); }
      else flashBanner('Knock fizzles — nothing to open there'); }
    else flashBanner('No closed door/chest within 60 ft');
  }
  else if(SPELL_CHOICES[name]){ setTimeout(()=>openSpellChoices(c,name),80); }
  else if(typeof SPELL_HANDLERS!=='undefined'&&SPELL_HANDLERS[name]&&SPELL_HANDLERS[name].kind==='summon'){
    // Summon UI opened by routeCast / qbOpenSpells before or after cast — skip AI narrator
  }
  else if(aiKey() && !tmpl && !SPELL_LIGHTS[name] && !spellTargetsEnemy(name) && !SPELL_TELEPORT[name] && !(typeof SPELL_HANDLERS!=='undefined'&&SPELL_HANDLERS[name])){
    const m0=parseSpellMechanics(name);
    if(!m0.attack && !m0.dmg && !m0.heal && !m0.save) setTimeout(()=>openAINarrate(c,name),80);
  }
  return true;
}

function timeStopExtraTurn(c){ const b=c&&c.battle; if(!b||!(b.timeStopTurns>0)) return false;
  b.timeStopTurns--; resetTurnState(c); save(); render();
  flashBanner('⏳ Time Stop — extra turn!'+(b.timeStopTurns>0?' ('+b.timeStopTurns+' more banked)':' (last one)')); return true; }

function curePcCond(c, spellName, cond){
  if(c.conditions) delete c.conditions[cond];
  logChange(c, spellName+' — cured '+cond); save(); render(); flashBanner('Cured '+cond);
  if(net&&net.role==='player') playerHello();
}

function applyMagicWeapon(c, idx){ const it=c.items&&c.items[idx]; if(!it) return;
  const old=hasConcentration(c); if(old){ (c.effects||[]).filter(e=>e.conc).forEach(e=>clearItemEffect(c,e)); c.effects=(c.effects||[]).filter(e=>!e.conc); logChange(c,'Lost concentration on '+old.name); }
  it.magicBonus=1; it.magicWeaponEffect=true;
  c.concentration={active:true, spell:'Magic Weapon'};
  c.effects.push({id:Date.now()+'-mw', name:'Magic Weapon', source:'Magic Weapon', rounds:600, conc:true, cond:null, mods:{}, note:it.name+' is a +1 weapon while you concentrate.', itemIdx:idx});
  logChange(c,'Cast Magic Weapon on '+it.name); save(); render(); flashBanner('⚔️ '+it.name+' is now magical (+1)!');
}

function openFindSteedUI(c, spellName, level){
  level=Number(level)||0;
  const opts=FIND_STEED_CATALOG[spellName]; if(!opts) return;
  const s=battleSession();
  const me=s&&((s.players||[]).find(p=>p.c===c||p.cid===c.id)||(s.players&&s.players[0]));
  const inBattleNow=QB&&!QB.over||(net&&net.session&&net.session.battle&&net.session.battle.active);
  if(!s||!me||!s.map||!inBattleNow){ flashBanner(spellName+' needs an active battle map'); return; }
  const log = s===QB ? qbLog : (m=>logChange(c,m));
  if(c.findSteedBond && c.findSteedBond.spell===spellName && (s.monsters||[]).some(m=>m.id===c.findSteedBond.mountId && m.hp>0)){
    if(!castSpell(c,spellName,level)) return;
    const existing=findSteedRestore(c,s,spellName);
    log('🐴 '+c.name+"'s "+existing.name+' is restored to full HP');
    save(); render(); flashBanner('🐴 '+existing.name+' restored to full HP');
    return;
  }
  $('#modalRoot').innerHTML=`<div class="modal" id="fsModal"><div class="sheet"><div class="grip"></div>
    <h2>✨ ${esc(spellName)}</h2>
    <p class="muted" style="font-size:12px;margin:0 0 10px">A celestial, fey, or fiend spirit takes the form you choose. You're mounted on it immediately — no ownership needed, this is magic.</p>
    ${opts.map((o,i)=>`<div class="spell"><div class="nm"><b>${esc(o.label)}</b><small>AC ${o.ac} · HP ${o.hp} · ${o.spd} ft speed</small></div><button class="btn sm" data-fspick="${i}">Summon</button></div>`).join('')}
    <button class="btn ghost block" id="fsCancel" style="margin-top:10px">Cancel</button>
  </div></div>`;
  $('#fsModal').onclick=e=>{ if(e.target.id==='fsModal') $('#modalRoot').innerHTML=''; };
  $('#fsCancel').onclick=()=>{ $('#modalRoot').innerHTML=''; };
  $('#modalRoot').querySelectorAll('[data-fspick]').forEach(b=>b.onclick=()=>{
    const pick=opts[Number(b.dataset.fspick)]; if(!pick) return;
    if(!castSpell(c,spellName,level)) return;
    const unit=findSteedSummon(s, c, (s===QB?'pc':(net&&net.peer&&net.peer.id)), pick, spellName, me.x, me.y, log);
    $('#modalRoot').innerHTML='';
    if(!unit) return;
    save(); render();
    flashBanner('🐴 '+pick.name+' — bonded and mounted!');
  });
}

function openSummonSpellUI(c, name, level, ritual){
  level=Number(level)||0;
  const cat=summonCatalogEntry(name);
  if(!cat){ flashBanner(name+' — no summon data yet'); castModal(c,name,level); return; }
  const s=battleSession();
  const me=s&&((s.players||[]).find(p=>p.c===c||p.cid===c.id)||(s.players&&s.players[0]));
  // Out of combat / no map
  if(!s||!me||!s.map||!(QB&&!QB.over||(net&&net.session&&net.session.battle&&net.session.battle.active))){
    if(!canCast(c,name,level,{ritual})) return;
    if(!castSpell(c,name,level,null,{ritual})) return;
    flashBanner(name+' — no battle map; effect tracked (summon appears in Quick Battle)');
    return;
  }
  let pick=null;
  window.__iso3dForceFrame=true;
  function drawPick(){
    let body=`<h2>✨ ${esc(name)}</h2>
      <p class="muted" style="font-size:12px;margin:0 0 8px">${esc(cat.note||'Choose what to summon.')} Concentration while it lasts.</p>`;
    body+=(cat.pick||[]).map((p,i)=>`<button class="btn block" data-spick="${i}" style="margin-bottom:8px;text-align:left">
      <b>${esc(p.label||p.name)}</b>
      <small style="display:block;opacity:.8">AC ${p.ac} · HP ${p.hp} · ${p.fly?'fly ':''}${p.spd||p.flySpd||30} ft · ${esc(p.atk||'')}</small>
      ${p.desc?`<small style="display:block;opacity:.7">${esc(p.desc)}</small>`:''}
    </button>`).join('');
    body+=`<button class="btn ghost block" id="spClose" style="margin-top:8px">Cancel</button>`;
    $('#modalRoot').innerHTML=`<div class="modal" id="spModal"><div class="sheet"><div class="grip"></div>${body}</div></div>`;
    $('#spClose').onclick=()=>{ $('#modalRoot').innerHTML=''; };
    $('#spModal').onclick=e=>{ if(e.target.id==='spModal') $('#modalRoot').innerHTML=''; };
    document.querySelectorAll('[data-spick]').forEach(b=>b.onclick=()=>{ pick=cat.pick[Number(b.dataset.spick)]; drawPlace(); });
  }
  function drawPlace(){
    if(!pick){ drawPick(); return; }
    // Spend slot only when placing (cancel before place doesn't waste the slot)
    const range=cat.placeRangeTiles||12;
    const rangeTiles=new Set();
    for(let y=0;y<(s.map.rows|0);y++) for(let x=0;x<(s.map.cols|0);x++){
      if(summonPlaceOk(s, me, cat, x, y)) rangeTiles.add(x+','+y);
    }
    const opts={ rangeTiles, rangeFrom:{x:me.x,y:me.y,tiles:range} };
    let body=`<h2>✨ ${esc(name)}</h2>
      <p class="muted" style="font-size:12px;margin:0 0 8px">Place <b>${(pick.count||1)>1?(pick.count*((cat.scaleSlot&&level>=cat.scaleSlot)?2:1))+'x ':''}${esc(pick.name)}</b> within ${range*5} ft (gold tiles). They'll appear together near the tile you pick. Empty ground only.</p>
      ${mapGridHTML(s,false,opts)}
      <button class="btn ghost block" id="spBack" style="margin-top:8px">← Back</button>
      <button class="btn ghost block" id="spClose" style="margin-top:6px">Cancel</button>`;
    $('#modalRoot').innerHTML=`<div class="modal" id="spModal"><div class="sheet"><div class="grip"></div>${body}</div></div>`;
    if(isoView&&iso3dView) try{ syncIso3DHost(s, opts); }catch(e){}
    const reattach=()=>{ if(isoView&&iso3dView&&s) try{ syncIso3DHost(s===QB?QB:s); }catch(e){} };
    $('#spClose').onclick=()=>{ $('#modalRoot').innerHTML=''; reattach(); };
    $('#spBack').onclick=()=>{ pick=null; drawPick(); };
    $('#spModal').onclick=e=>{ if(e.target.id==='spModal'){ $('#modalRoot').innerHTML=''; reattach(); } };
    document.querySelectorAll('#spModal [data-cell]').forEach(el=>el.onclick=()=>{
      const [x,y]=el.dataset.cell.split(',').map(Number);
      if(!summonPlaceOk(s, me, cat, x, y)){ flashBanner('Can’t place there'); return; }
      if(!castSpell(c,name,level,null,{ritual})) return;
      // One summon of this spell at a time — dismiss previous
      dismissSummonsForSpell(s, c, name);
      // Pack summons (Conjure Animals): a 5th-level+ slot conjures twice as many (PHB).
      const n=(pick.count||1)*((cat.scaleSlot&&level>=cat.scaleSlot)?2:1);
      const tiles=nearbySpawnTiles(s, x, y, n);
      const units=tiles.map(t=>spawnSummon(s, me, pick, t.x, t.y, name)).filter(Boolean);
      $('#modalRoot').innerHTML=''; reattach();
      if(!units.length){ flashBanner('Summon failed'); return; }
      const label=units.length>1?(units.length+'x '+pick.name):units[0].name;
      logChange(c, '🌀 '+name+' — '+label+' appears');
      if(typeof qbLog==='function'&&s===QB) qbLog('🌀 '+c.name+' summons '+label);
      flashBanner('🌀 '+label+' arrives!');
      sfx('cast');
      save(); render();
    });
  }
  drawPick();
}

function openLightTarget(c, level){
  const s=battleSession();
  const me=s&&((s.players||[]).find(p=>p.c===c||p.cid===c.id)||(s.players&&s.players[0]));
  const inBattleNow=QB&&!QB.over||(net&&net.session&&net.session.battle&&net.session.battle.active);
  if(!s||!me||!s.map||!inBattleNow){
    if(!castSpell(c,'Light',level)) return;
    return;
  }
  const range=2; // Touch — same tile-range convention as other touch spells (see SUMMON_CATALOG)
  const reattach=()=>{ if(isoView&&iso3dView&&s) try{ syncIso3DHost(s===QB?QB:s); }catch(e){} };
  function drawChoice(){
    $('#modalRoot').innerHTML=`<div class="modal" id="ltModal"><div class="sheet"><div class="grip"></div>
      <h2>💡 Light</h2>
      <p class="muted" style="font-size:12px;margin:0 0 8px">Touch one object no larger than 10 ft — it sheds bright light 20 ft and dim light 20 ft more for 1 hour.</p>
      <button class="btn block" id="ltSelf" style="margin-bottom:8px;text-align:left">🧍 <b>Yourself</b><small style="display:block;opacity:.8">An object you're holding or wearing — follows you.</small></button>
      <button class="btn block" id="ltSpot" style="margin-bottom:8px;text-align:left">📍 <b>An object on the ground</b><small style="display:block;opacity:.8">Pick a tile within touch range — stays put.</small></button>
      <button class="btn block" id="ltCreature" style="text-align:left">🎯 <b>A creature's object</b><small style="display:block;opacity:.8">Pick a creature within touch range — follows them. Hostile creatures get a Dex save.</small></button>
      <button class="btn ghost block" id="ltClose" style="margin-top:10px">Cancel</button></div></div>`;
    $('#ltClose').onclick=()=>{ $('#modalRoot').innerHTML=''; };
    $('#ltModal').onclick=e=>{ if(e.target.id==='ltModal') $('#modalRoot').innerHTML=''; };
    $('#ltSelf').onclick=()=>{ $('#modalRoot').innerHTML=''; if(!castSpell(c,'Light',level)) return; };
    $('#ltSpot').onclick=()=>drawPlace(false);
    $('#ltCreature').onclick=()=>drawPlace(true);
  }
  function creatureAt(x,y){
    const mon=(s.monsters||[]).find(m=>m.hp>0&&m.x===x&&m.y===y);
    if(mon) return {target:mon, kind:'mon'};
    const ply=(s.players||[]).find(p=>p.x===x&&p.y===y);
    if(ply) return {target:ply, kind:'ply'};
    return null;
  }
  function drawPlace(wantCreature){
    const rangeTiles=new Set();
    for(let y=0;y<(s.map.rows|0);y++) for(let x=0;x<(s.map.cols|0);x++){
      if(gridDist(me.x,me.y,x,y)>range) continue;
      const occ=!!creatureAt(x,y);
      if(wantCreature?occ:!occ) rangeTiles.add(x+','+y);
    }
    const opts={ rangeTiles, rangeFrom:{x:me.x,y:me.y,tiles:range} };
    let body=`<h2>💡 Light</h2>
      <p class="muted" style="font-size:12px;margin:0 0 8px">${wantCreature?'Pick a creature within touch range (gold tiles).':'Pick a spot within touch range (gold tiles).'}</p>
      ${mapGridHTML(s,false,opts)}
      <button class="btn ghost block" id="ltBack" style="margin-top:8px">← Back</button>
      <button class="btn ghost block" id="ltClose2" style="margin-top:6px">Cancel</button>`;
    $('#modalRoot').innerHTML=`<div class="modal" id="ltModal2"><div class="sheet"><div class="grip"></div>${body}</div></div>`;
    if(isoView&&iso3dView) try{ syncIso3DHost(s, opts); }catch(e){}
    $('#ltClose2').onclick=()=>{ $('#modalRoot').innerHTML=''; reattach(); };
    $('#ltBack').onclick=()=>{ drawChoice(); };
    $('#ltModal2').onclick=e=>{ if(e.target.id==='ltModal2'){ $('#modalRoot').innerHTML=''; reattach(); } };
    document.querySelectorAll('#ltModal2 [data-cell]').forEach(el=>el.onclick=()=>{
      const [x,y]=el.dataset.cell.split(',').map(Number);
      if(gridDist(me.x,me.y,x,y)>range){ flashBanner('Out of touch range'); return; }
      const hit=creatureAt(x,y);
      if(wantCreature){
        if(!hit){ flashBanner('No creature there'); return; }
        openObjectPick(hit.target, hit.kind, x, y);
      } else {
        if(hit){ flashBanner('Occupied — use "A creature\'s object" instead'); return; }
        $('#modalRoot').innerHTML=''; reattach();
        if(!castSpell(c,'Light',level,{x,y},{followId:null})) return;
      }
    });
  }
  function openObjectPick(target, kind, x, y){
    const objs=['⚔️ Their weapon','🛡️ Their shield or armor','🎒 A held trinket'];
    $('#modalRoot').innerHTML=`<div class="modal" id="ltObjModal"><div class="sheet"><div class="grip"></div>
      <h2>💡 Light — ${esc(target.name||target.c&&target.c.name||'target')}</h2>
      <p class="muted" style="font-size:12px;margin:0 0 8px">Which object do you touch?</p>
      ${objs.map((o,i)=>`<button class="btn block" data-lo="${i}" style="margin-bottom:8px;text-align:left">${o}</button>`).join('')}
      <button class="btn ghost block" id="ltObjClose" style="margin-top:6px">Cancel</button></div></div>`;
    $('#ltObjClose').onclick=()=>{ $('#modalRoot').innerHTML=''; };
    $('#ltObjModal').onclick=e=>{ if(e.target.id==='ltObjModal') $('#modalRoot').innerHTML=''; };
    document.querySelectorAll('#ltObjModal [data-lo]').forEach(b=>b.onclick=()=>{
      const objName=objs[Number(b.dataset.lo)].replace(/^\S+\s/,'');
      $('#modalRoot').innerHTML='';
      resolveOnCreature(target, kind, x, y, objName);
    });
  }
  function resolveOnCreature(target, kind, x, y, objName){
    const tname=target.name||(target.c&&target.c.name)||'the target';
    const followId=target.id||tname;
    // Only monsters count as hostile here — allies (players) never resist their own party's Light.
    if(kind==='mon'){
      const dc=8+profBonus(c)+mod(abil(c,c.spellAbility));
      const roll=rnd(20)+monsterSaveBonus(target);
      if(roll>=dc){
        if(!castSpell(c,'Light',level,null,{suppressLight:true})) return;
        logChange(c,'💡 Light on '+tname+"'s "+objName.toLowerCase()+' — resisted (DC '+dc+', rolled '+roll+')');
        flashBanner(tname+' resists — Light fizzles on the '+objName.toLowerCase()+' (DC '+dc+', rolled '+roll+')');
        return;
      }
      if(!castSpell(c,'Light',level,{x,y},{followId})) return;
      logChange(c,'💡 Light — '+tname+' fails the DC '+dc+' Dex save (rolled '+roll+'), '+objName.toLowerCase()+' begins glowing');
      flashBanner('💡 Light — '+tname+"'s "+objName.toLowerCase()+' glows');
      return;
    }
    if(!castSpell(c,'Light',level,{x,y},{followId})) return;
    flashBanner('💡 Light — '+tname+"'s "+objName.toLowerCase()+' glows');
  }
  drawChoice();
}

function openSpellChoices(c,name){ const raw=SPELL_CHOICES[name]; const opts=(typeof raw==='function')?raw(c):(raw||[]);
  $('#modalRoot').innerHTML=`<div class="modal" id="scModal"><div class="sheet"><div class="grip"></div>
    <h2>✨ ${esc(name)} — choose the outcome</h2>
    ${opts.map((o,i)=>`<button class="btn block" data-sc="${i}" style="margin-top:8px;text-align:left">${o.t}</button>`).join('')}
    ${aiKey()?`<div class="field" style="margin-top:14px"><label>🔮 AI Narrator — or describe what you attempt</label>
      <textarea id="scAI" rows="2" placeholder="I wish that…"></textarea>
      <button class="btn ghost block" id="scAIGo" style="margin-top:6px">🔮 Resolve with AI</button></div>`
      :`<p class="muted" style="font-size:11px;margin-top:12px">🔮 Add an AI Narrator key in ⚙ App &amp; Data to resolve spells in plain language.</p>`}
    <button class="btn ghost block" id="scClose" style="margin-top:10px">Close</button></div></div>`;
  $('#scClose').onclick=()=>{ $('#modalRoot').innerHTML=''; };
  $('#scModal').onclick=e=>{ if(e.target.id==='scModal') $('#modalRoot').innerHTML=''; };
  document.querySelectorAll('#scModal [data-sc]').forEach(b=>b.onclick=()=>{ const o=opts[Number(b.dataset.sc)]; $('#modalRoot').innerHTML=''; if(o) o.f(c); });
  { const g=$('#scAIGo'); if(g) g.onclick=()=>{ const t=($('#scAI').value||'').trim(); if(!t){ flashBanner('Describe what you attempt'); return; } openAINarrate(c,name,t); }; }
}

function wishSpellPicker(c){
  $('#modalRoot').innerHTML=`<div class="modal" id="wishModal"><div class="sheet"><div class="grip"></div>
    <h2>🌠 Wish — duplicate a spell</h2>
    <p class="muted" style="font-size:12px;margin:0 0 8px">Any spell of 8th level or lower — no slot spent, no components, you don't need to know it.</p>
    <input id="wishSearch" placeholder="Search all spells…" autocomplete="off">
    <div id="wishList" style="margin-top:10px;max-height:52vh;overflow:auto"></div>
    <button class="btn ghost block" id="wishClose" style="margin-top:10px">Cancel</button></div></div>`;
  const draw=()=>{ const q=($('#wishSearch').value||'').toLowerCase();
    const f=SPELLS.filter(s=>s.l<=8 && s.n.toLowerCase().includes(q)).slice(0,60);
    $('#wishList').innerHTML=f.map(s=>`<div class="spell"><span style="flex:none">${spellIcon(s.n)}</span><div class="nm"><b>${esc(s.n)}</b><small>${lvlLabel(s.l)}</small></div><button class="btn sm" data-wc="${esc(s.n)}|${s.l}">Cast</button></div>`).join('')||'<div class="empty">No matches.</div>';
    $('#wishList').querySelectorAll('[data-wc]').forEach(b=>b.onclick=()=>{ const a=b.dataset.wc.split('|'); $('#modalRoot').innerHTML='';
      wishGrantFree(a[0]); logChange(c,'🌠 Wish duplicates '+a[0]); routeCast(c, a[0], Number(a[1])); }); };
  $('#wishSearch').addEventListener('input',draw);
  $('#wishClose').onclick=()=>{ $('#modalRoot').innerHTML=''; };
  $('#wishModal').onclick=e=>{ if(e.target.id==='wishModal') $('#modalRoot').innerHTML=''; };
  draw();
}

function openAINarrate(c,name,prefill){
  $('#modalRoot').innerHTML=`<div class="modal" id="ainModal"><div class="sheet"><div class="grip"></div>
    <h2>🔮 ${esc(name)} — AI Narrator</h2>
    <p class="muted" style="font-size:12px;margin:0 0 8px">Describe what you attempt; the narrator adjudicates it like a DM, within what ${esc(name)} can do in 5e.</p>
    <textarea id="ainText" rows="3" placeholder="What do you do with it?">${esc(prefill||'')}</textarea>
    <div id="ainOut" class="card" style="display:none;margin-top:10px;font-size:13.5px;white-space:pre-wrap"></div>
    <button class="btn block" id="ainGo" style="margin-top:8px">🔮 Resolve</button>
    <button class="btn ghost block" id="ainClose" style="margin-top:10px">Skip</button></div></div>`;
  $('#ainClose').onclick=()=>{ $('#modalRoot').innerHTML=''; };
  $('#ainModal').onclick=e=>{ if(e.target.id==='ainModal') $('#modalRoot').innerHTML=''; };
  $('#ainGo').onclick=()=>{ const t=($('#ainText').value||'').trim(); if(!t){ flashBanner('Describe what you attempt'); return; } aiNarrate(c,name,t); };
  if(prefill) aiNarrate(c,name,prefill);
}

async function aiNarrate(c,name,attempt){
  const key=aiKey(); if(!key){ flashBanner('No AI Narrator key set'); return; }
  const out=$('#ainOut'), go=$('#ainGo');
  if(out){ out.style.display='block'; out.textContent='🔮 Consulting the fates…'; }
  if(go) go.disabled=true;
  try{
    const res=await fetch('https://api.anthropic.com/v1/messages',{ method:'POST', headers:{
        'content-type':'application/json', 'x-api-key':key, 'anthropic-version':'2023-06-01',
        'anthropic-dangerous-direct-browser-access':'true' },
      body:JSON.stringify({ model:'claude-opus-4-8', max_tokens:400,
        system:'You are a fair, vivid Dungeon Master adjudicating a D&D 5e spell for a player. Stay strictly within what the named spell can do by the rules. Answer in 2-4 sentences of narration, then if there are concrete mechanical consequences (damage, healing, gold, conditions, costs), list them on separate lines starting with "•".',
        messages:[{role:'user', content:c.name+' (level '+c.level+' '+c.cls+') casts '+name+((SPELL_DESC[name])?' — "'+SPELL_DESC[name]+'"':'')+'. They attempt: "'+attempt+'". Adjudicate the outcome.'}] }) });
    const j=await res.json();
    if(j && j.content && j.content.length){ const txt=j.content.filter(b=>b.type==='text').map(b=>b.text).join('\n').trim();
      if(out) out.textContent=txt||'(the narrator is silent)';
      if(txt){ logChange(c,'🔮 '+name+': '+txt); save(); } }
    else if(j && j.error){ if(out) out.textContent='⚠ '+(j.error.message||j.error.type||'API error'); }
    else if(out) out.textContent='⚠ Unexpected response';
  }catch(e){ if(out) out.textContent='⚠ Request failed — check your connection and key'; }
  if(go) go.disabled=false;
}

function castModal(c, name, baseLevel){
  if(isRaging(c)){ flashBanner('Can’t cast spells while raging'); return; }
  baseLevel=Number(baseLevel)||0;
  const meta=spellMeta(name), m=scaleCantrip(c,name,parseSpellMechanics(name)), A=abilFullName;
  const dc=8+profBonus(c)+mod(abil(c,c.spellAbility)), atkB=profBonus(c)+mod(abil(c,c.spellAbility));
  // healing spells that add your spellcasting modifier (e.g. Cure Wounds "1d8 + spell mod")
  if(m.heal && /\bmod\b/i.test(SPELL_DESC[name]||'')){ const sm=mod(abil(c,c.spellAbility)); if(sm) m.heal+=sgn(sm); }
  // Disciple of Life (Life Domain, 1st): a 1st-level-or-higher healing spell heals its target
  // for an extra 2 + the spell's level. Baked into the shown/rolled notation the same way the
  // existing spell-mod bonus above already is (this app doesn't re-render on slot-level change,
  // so — like that bonus — this uses the spell's base level, not a live-upcast level).
  if(m.heal && baseLevel>0 && isLifeCleric(c,1)) m.heal+='+'+(2+baseLevel);
  // Supreme Healing (17th): every die in the healing notation is maximized, not rolled.
  if(m.heal && isLifeCleric(c,17)) m.heal=String(maxNotation(m.heal));
  // Elemental Affinity (Draconic Bloodline 6th): +Cha mod to one damage roll of a spell that
  // deals damage matching your draconic ancestry. The 1-sorcery-point resistance option isn't
  // built here — apply it via the Effects tab's own "+ Add" custom-effect entry, the same
  // manual-application pattern already used for anything this app has no dedicated toggle for.
  if(m.dmg && isDraconicSorcerer(c,6) && m.dtype===DRACONIC_ANCESTRY_DAMAGE[c.sorcererDragon]){ const cm=mod(abil(c,'cha')); if(cm) m.dmg+=sgn(cm); }
  // Empowered Evocation (Evocation Wizard 10th): +Int mod to one damage roll of ANY evocation
  // spell (school 'V' in this app's letter code, per CLASS_LETTER's own comment).
  if(m.dmg && isEvocationWizard(c,10) && meta && meta.s==='V'){ const im=mod(abil(c,'int')); if(im) m.dmg+=sgn(im); }
  // Overchannel (14th): max damage on a leveled (1st-5th) damage spell. First use each rest is
  // free; further uses before your next long rest backlash you with escalating necrotic —
  // applied via applyHp right when the box is checked (not deferred), since RAW is explicit the
  // backlash lands "immediately after you cast it," and this modal's Cast button is that moment.
  const canOverchannel = m.dmg && isEvocationWizard(c,14) && baseLevel>=1 && baseLevel<=5;
  // Summon-kind spells (e.g. Unseen Servant) route through openSummonSpellUI's own picker —
  // this modal's checkbox state is threaded through to it (see castGo below) rather than
  // hidden, so a ritual-tagged summon spell gets the same no-slot/no-action cast it would
  // through the normal path.
  const canRitual = canRitualCast(c,name);
  const slots=spellSlots(c); let lvlOpts='';
  if(baseLevel>0){ for(let l=baseLevel;l<=9;l++){ const tot=slots[l]||0; if(tot){ const used=Math.min(tot,(c.slots[l]&&c.slots[l].used)||0), avail=tot-used; lvlOpts+=`<option value="${l}" ${avail<=0?'disabled':''}>Level ${l} — ${avail}/${tot} left</option>`; } } }
  const eff=SPELL_EFFECTS[name];
  $('#modalRoot').innerHTML=`<div class="modal" id="castModal"><div class="sheet"><div class="grip"></div>
    <h2>${meta?spellIcon(name):'✨'} ${esc(name)}</h2>
    <p class="muted" style="font-size:12px;margin:0 0 8px">${meta?SCHOOL_NAME[meta.s]+' · '+lvlLabel(meta.l):'Spell'} · Spell DC ${dc}</p>
    <div class="addrow" style="gap:6px;flex-wrap:wrap;margin:0 0 10px">
      ${m.range?`<span class="pill">📏 Range: ${m.range}</span>`:''}
      ${m.duration?`<span class="pill">⏱ ${m.duration}</span>`:''}
      ${m.conc?`<span class="pill">🧠 Concentration</span>`:''}
      ${baseLevel>0?`<span class="pill">${lvlLabel(baseLevel)}</span>`:`<span class="pill">Cantrip</span>`}
    </div>
    ${SPELL_DESC[name]?`<p style="margin:0 0 12px">${esc(SPELL_DESC[name])}</p>`:''}
    ${(m.attack||m.dmg||m.heal)?`<div class="card" style="margin:0 0 10px"><div class="muted" style="font-size:11px;text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px">🎲 You roll — tap 🎲 to auto-roll, or type your own</div>
      ${m.attack?`<div class="listrow"><div class="nm">Spell attack <span class="sub">${sgn(atkB)} to hit</span></div><input type="number" id="mAtk" placeholder="d20" style="max-width:62px"><button class="val rollbtn" data-rollcheck data-label="${esc(name)} attack" data-bonus="${atkB}" title="Auto-roll">🎲 ${sgn(atkB)}</button></div>`:''}
      ${m.dmg?`<div class="listrow"><div class="nm">Damage${m.dtype?' · '+m.dtype:''} <span class="sub">${m.dmg}</span></div><input type="number" id="mDmg" placeholder="total" style="max-width:62px"><button class="val rollbtn" data-rolldmg data-label="${esc(name)} damage" data-notation="${m.dmg}" title="Auto-roll">🎲 ${m.dmg}</button></div>`:''}
      ${canOverchannel?`<button class="btn ghost sm block" id="ocBtn" style="margin-top:6px">⚡ Overchannel — max damage (${maxNotation(m.dmg)})${(c.overchannelUses||0)>0?' · backlash '+(overchannelBacklashDice(c)*baseLevel)+'d12 necrotic':' · free this rest'}</button>`:''}
      ${m.heal?`<div class="listrow"><div class="nm">Healing <span class="sub">${m.heal}</span></div><input type="number" id="mHeal" placeholder="total" style="max-width:62px"><button class="val rollbtn" data-rolldmg data-label="${esc(name)} healing" data-notation="${m.heal}" title="Auto-roll">🎲 ${m.heal}</button></div>`:''}
    </div>`:''}
    ${m.save?`<div class="card" style="margin:0 0 10px;background:rgba(156,59,44,.08)"><div class="muted" style="font-size:11px;text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px">🛡️ Each target rolls a save</div>
      <div class="listrow"><div class="nm"><b>${A(m.save)} saving throw</b></div><div class="val">vs DC ${dc}</div></div>
      <p class="muted" style="font-size:11.5px;margin:6px 0 0">Targets that fail are affected; check the description for half-damage-on-success.</p></div>`:(m.attack?`<p class="muted" style="font-size:11.5px;margin:0 0 10px">No save — you make the attack roll above; on a hit, deal the damage.</p>`:'')}
    ${eff?`<div class="card" style="margin:0 0 10px;background:rgba(77,106,44,.10)"><div class="muted" style="font-size:11px;text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px">✨ Applied to you on cast</div>
      <div class="nm"><b>${esc(name)}</b><small>${[modSummary(eff.mods), fmtDuration(eff.rounds), eff.conc?'concentration':''].filter(Boolean).join(' · ')||'tracked'}</small></div></div>`:''}
    ${(m.heal && baseLevel>0 && isLifeCleric(c,6))?`<div class="card" style="margin:0 0 10px;background:rgba(77,106,44,.10)"><div class="muted" style="font-size:11px;text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px">✝️ Blessed Healer</div>
      <p class="muted" style="font-size:12.5px;margin:0">If this heals someone other than you, you also regain <b>${2+baseLevel} HP</b> — apply it to yourself with the Heal button.</p></div>`:''}
    ${SPELL_LIGHTS[name]&&!SPELL_LIGHTS[name].grantDarkvision?`<div class="card" style="margin:0 0 10px;background:rgba(212,178,42,.12)"><div class="muted" style="font-size:11px;text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px">💡 Map light</div>
      <p class="muted" style="font-size:12.5px;margin:0">${SPELL_LIGHTS[name].dark
        ? 'Creates magical darkness ('+(SPELL_LIGHTS[name].dark*5)+' ft). Blocks darkvision.'
        : 'Sheds <b>bright light '+(SPELL_LIGHTS[name].bright||0)*5+' ft</b> and <b>dim light '+((SPELL_LIGHTS[name].dim!=null?SPELL_LIGHTS[name].dim:(SPELL_LIGHTS[name].bright||0)*2)*5)+' ft</b> total'
      }${SPELL_LIGHTS[name].attach==='self'?' · follows you (object you hold/wear).':SPELL_LIGHTS[name].place?' · centered where cast.':'.'}${SPELL_LIGHTS[name].note?' '+esc(SPELL_LIGHTS[name].note):''}</p></div>`:''}
    ${(!m.attack&&!m.dmg&&!m.heal&&!m.save&&!eff&&!SPELL_LIGHTS[name])?`<div class="card" style="margin:0 0 10px;background:rgba(77,106,44,.08)"><div class="muted" style="font-size:11px;text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px">📜 Narrative spell</div>
      <p class="muted" style="font-size:12.5px;margin:0">No rolls or stats to apply — casting spends the ${baseLevel>0?'slot & action':'action'} and adds it to your adventure log; you${net&&net.role==='player'?' and the DM':''} narrate what happens.</p></div>`:''}
    ${baseLevel>0 ? (lvlOpts?`<div class="addrow" style="align-items:center"><span class="muted" style="font-size:12px;flex:none">Cast using</span><select id="castLvl" style="flex:1">${lvlOpts}</select></div>`:`<p class="muted" style="font-size:12px;margin:0">No spell slots available — cast to track it anyway.</p>`) : `<p class="muted" style="font-size:12px;margin:0">Cantrip — no slot needed.</p>`}
    ${canRitual?`<label class="pill" style="cursor:pointer;margin-top:8px;display:flex"><input type="checkbox" id="castRitual"> 🕯️ Cast as Ritual <span class="muted" style="font-size:11px">(no slot, no action — takes 10 minutes)</span></label>`:''}
    <button class="btn block" id="castGo" style="margin-top:12px">⚡ Cast${m.conc?' & concentrate':''}${eff?' (apply effect)':''}</button>
    <button class="btn ghost block" id="castClose" style="margin-top:10px">Close</button>
  </div></div>`;
  $('#castModal').onclick=e=>{ if(e.target.id==='castModal') $('#modalRoot').innerHTML=''; };
  $('#castClose').onclick=()=>{ $('#modalRoot').innerHTML=''; };
  $('#castGo').onclick=()=>{ const lv=$('#castLvl'); const useLvl=lv?Number(lv.value):baseLevel;
    const rb=$('#castRitual'); const ritual=!!(rb&&rb.checked); $('#modalRoot').innerHTML='';
    // Mage Hand in battle → interact picker after spending the cast
    if(name==='Mage Hand'){
      const s=battleSession();
      const me=s&&((s.players||[]).find(p=>p.c===c||p.cid===c.id)||(s.players&&s.players[0]));
      if(s&&me&&(QB&&!QB.over||(net&&net.session&&net.session.battle&&net.session.battle.active))){
        if(!castSpell(c,name,useLvl)) return;
        if(QB&&QB.active) qbLog('✋ '+c.name+' casts Mage Hand');
        setTimeout(()=>openMageHandUI(c,s,me),60);
        return;
      }
    }
    // Light in battle → self/spot/creature picker (see openLightTarget) instead of the
    // old always-self-attach cast
    if(name==='Light'){
      const s=battleSession();
      if(s&&(QB&&!QB.over||(net&&net.session&&net.session.battle&&net.session.battle.active))){
        openLightTarget(c,useLvl);
        return;
      }
    }
    if(SPELL_HANDLERS[name]&&SPELL_HANDLERS[name].kind==='summon'){
      openSummonSpellUI(c, name, useLvl, ritual);
      return;
    }
    const ok=castSpell(c, name, useLvl, null, {ritual}); if(ok && QB && QB.active) qbLog('📜 '+c.name+' casts '+name+(ritual?' (ritual)':'')); };
  const manual=(id,make)=>{ const el=$('#'+id); if(el) el.addEventListener('change',()=>{ const v=Number(el.value); if(el.value!=='' && !isNaN(v)){ pushRoll(make(v)); el.value=''; } }); };
  manual('mAtk', v=>({label:name+' attack (manual)', total:v+atkB, detail:'d20 ('+v+') '+sgn(atkB), crit:v===20?'crit':v===1?'fumble':null, kind:'check'}));
  manual('mDmg', v=>({label:name+' damage (manual)', total:v, detail:'entered', kind:'dmg'}));
  manual('mHeal', v=>({label:name+' healing (manual)', total:v, detail:'entered', kind:'dmg'}));
  { const ocb=$('#ocBtn'); if(ocb) ocb.onclick=()=>{
    const total=maxNotation(m.dmg);
    pushRoll({label:name+' damage (Overchannel — MAX)', total, detail:'maximized', kind:'dmg'});
    if((c.overchannelUses||0)>0){ const dice=overchannelBacklashDice(c)*baseLevel, r=rollNotation(dice+'d12')||{total:0,detail:''};
      applyHp(c,-r.total); logChange(c,'⚡ Overchannel backlash — '+r.total+' necrotic ('+r.detail+', ignores resistance/immunity)'); flashBanner('⚡ Overchannel — '+total+' damage, but you take '+r.total+' necrotic'); }
    else flashBanner('⚡ Overchannel — '+total+' damage (free this rest)');
    c.overchannelUses=(c.overchannelUses||0)+1; save(); render();
  }; }
}

function bindEffectsCard(c){
  const ar=$('#advRound'); if(ar) ar.addEventListener('click',()=>advanceRound(c));
  const ax=$('#fxOpen'); if(ax) ax.addEventListener('click',openEffectPicker);
  app.querySelectorAll('[data-endfx]').forEach(el=>el.addEventListener('click',()=>endEffect(c, el.dataset.endfx)));
}

function openEffectPicker(){
  const c=cur(); if(!c) return;
  const all=Array.from(new Set([...Object.keys(SPELL_EFFECTS), ...SPELLS.map(s=>s.n)])).sort((a,b)=>a.localeCompare(b));
  $('#modalRoot').innerHTML=`<div class="modal" id="fxModal"><div class="sheet"><div class="grip"></div>
    <h2>Add an effect</h2>
    <p class="muted" style="font-size:13px;margin:0 0 10px">Track a buff cast on you (e.g. an ally's Haste), or anything custom. Spells with known effects auto-apply their bonuses to your stats.</p>
    <input id="fxSearch" placeholder="Search all spells & effects…" autocomplete="off">
    <div class="addrow" style="margin-top:8px;align-items:center"><span class="muted" style="font-size:12px;flex:none">Duration</span>
      <select id="fxDur" style="flex:1"><option value="">Until removed</option><option value="1">1 round</option><option value="10">1 minute</option><option value="100">10 minutes</option><option value="600">1 hour</option></select></div>
    <div class="cklist" id="fxResults" style="max-height:46vh;margin-top:10px"></div>
    <div class="addrow" style="margin-top:10px"><input id="fxCustom" placeholder="…or type a custom effect"><button class="btn sm" id="fxAddCustom">Add</button></div>
    <button class="btn ghost block" id="fxClose" style="margin-top:12px">Close</button>
  </div></div>`;
  const add=(name)=>{ const tmpl=SPELL_EFFECTS[name]; const dv=$('#fxDur').value;
    if(tmpl) addEffect(c, name, tmpl);
    else addEffect(c, name, {rounds: dv===''?null:Number(dv), note:SPELL_DESC[name]||''});
    logChange(c,'Added effect: '+name); save(); $('#modalRoot').innerHTML=''; render(); flashBanner('Added '+name); };
  const draw=()=>{ const q=($('#fxSearch').value||'').toLowerCase();
    const list=all.filter(n=>n.toLowerCase().includes(q)).slice(0,80);
    $('#fxResults').innerHTML = list.length? list.map(n=>{ const t=SPELL_EFFECTS[n], meta=spellMeta(n);
      const sub=t?((modSummary(t.mods)||t.note||'tracked')+(t.conc?' · concentration':'')):(SPELL_DESC[n]||'tracked effect');
      return `<div class="listrow" style="padding:6px 0"><span style="flex:none">${meta?spellIcon(n):'✨'}</span><div class="nm" style="margin-left:6px"><b>${esc(n)}</b>${t?'<span class="tag" style="margin-left:6px">auto-stats</span>':''}<small>${esc(sub)}</small></div><button class="btn sm" data-fxadd="${esc(n)}">Add</button></div>`;
    }).join('') : '<div class="empty">No matches — type it in the custom box below.</div>';
    $('#fxResults').querySelectorAll('[data-fxadd]').forEach(b=>b.addEventListener('click',()=>add(b.dataset.fxadd)));
  };
  $('#fxSearch').addEventListener('input',draw);
  $('#fxAddCustom').onclick=()=>{ const v=$('#fxCustom').value.trim(); if(v) add(v); };
  $('#fxClose').onclick=()=>{ $('#modalRoot').innerHTML=''; };
  $('#fxModal').onclick=e=>{ if(e.target.id==='fxModal') $('#modalRoot').innerHTML=''; };
  draw();
}

function setPortrait(file){
  if(!file){ return; }
  const reader=new FileReader();
  reader.onload=()=>{
    const img=new Image();
    img.onload=()=>{
      const size=256, cv=document.createElement('canvas');
      const s=Math.min(img.width,img.height), sx=(img.width-s)/2, sy=(img.height-s)/2;
      cv.width=size; cv.height=size;
      cv.getContext('2d').drawImage(img, sx,sy,s,s, 0,0,size,size);
      try{ const c=cur(); c.portrait=cv.toDataURL('image/jpeg',0.82); logChange(c,'Set character portrait'); save(); render(); }
      catch(e){ flashBanner('Could not save image'); }
    };
    img.onerror=()=>flashBanner('Not a valid image');
    img.src=reader.result;
  };
  reader.readAsDataURL(file);
}

function showRollBanner(r){
  const el=$('#rollBanner');
  const crit = r.crit==='crit'?'<span class="crit">CRIT!</span>':r.crit==='fumble'?'<span class="fumble">NAT 1</span>':'';
  // No free re-rolls — only feat/ability options (Lucky, Halfling Lucky, Savage Attacker).
  const c=typeof cur==='function'?cur():null;
  const btns=[];
  if(r.kind!=='msg' && c){
    const isD20=r.kind==='check'||r.kind==='save';
    if(isD20 && luckPointsLeft(c)>0){
      btns.push(`<button class="rb-btn" data-rr="lucky" title="Lucky feat · spend 1 of ${luckPointsLeft(c)} luck points">🍀 Lucky (${luckPointsLeft(c)})</button>`);
    }
    // Halfling racial Lucky: free re-roll of a natural 1 on a d20 (unlimited).
    if(isD20 && r.crit==='fumble' && hasRacialTrait(c,'Lucky')){
      btns.push(`<button class="rb-btn" data-rr="half-lucky" title="Halfling Lucky · re-roll natural 1">↻ Nat 1</button>`);
    }
    // Savage Attacker: once per turn, re-roll melee weapon damage dice.
    if(r.kind==='dmg' && hasFeat(c,'Savage Attacker') && !(c.battle&&c.battle.savageUsed) && r.notation){
      btns.push(`<button class="rb-btn" data-rr="savage" title="Savage Attacker · re-roll damage once per turn">↻ Savage</button>`);
    }
  }
  el.innerHTML = `
    <div class="rb-main">
      <div class="rb-total">${r.total}</div>
      <div class="rb-info"><b>${esc(r.label)}</b> ${crit}<div class="rb-detail">${r.detail}</div></div>
    </div>
    <div class="rb-actions">${btns.join('')}<button class="rb-btn" data-rr="x">✕</button></div>`;
  el.classList.add('show');
  clearTimeout(showRollBanner._t);
  showRollBanner._t=setTimeout(()=>el.classList.remove('show'), 9000);
  el.querySelectorAll('[data-rr]').forEach(b=>b.onclick=()=>{
    const a=b.dataset.rr;
    if(a==='x'){ el.classList.remove('show'); return; }
    if(a==='lucky'){
      if(!spendLuckPoint(c)) return;
      el.classList.remove('show');
      if(r.kind==='dmg') rollDmg(r.label, r.notation);
      else rollCheck(r.label, r.bonus, 'normal');
    } else if(a==='half-lucky'){
      el.classList.remove('show');
      rollCheck(r.label, r.bonus, 'normal');
    } else if(a==='savage'){
      if(c.battle){ c.battle.savageUsed=true; save(); }
      el.classList.remove('show');
      rollDmg(r.label, r.notation);
    }
  });
}

function openDiceTray(){
  $('#modalRoot').innerHTML = `
   <div class="modal" id="diceModal"><div class="sheet">
     <div class="grip"></div>
     <h2>🎲 Dice tray</h2>
     <div class="dietray">${[4,6,8,10,12,20,100].map(d=>`<button class="diebtn" data-die="${d}">d${d}</button>`).join('')}
       <button class="diebtn" data-die="20" data-adv="1" title="Roll with advantage">d20⊕</button></div>
     <div class="addrow" style="margin-top:10px">
       <input id="diceNote" placeholder="e.g. 2d6+3 or 1d20+5" inputmode="text">
       <button class="btn sm" id="diceRollNote">Roll</button>
     </div>
     <h2 style="margin-top:16px">History <button class="btn ghost sm" id="diceClear" style="float:right">Clear</button></h2>
     <div id="diceLog"></div>
   </div></div>`;
  const root=$('#modalRoot');
  root.querySelectorAll('[data-die]').forEach(b=>b.onclick=()=>{
    if(b.dataset.adv) rollCheck('d20', 0, 'adv');
    else rollDmg('d'+b.dataset.die, '1d'+b.dataset.die);
  });
  $('#diceRollNote').onclick=()=>{ const v=$('#diceNote').value.trim(); if(v){ rollDmg(v, v); } };
  $('#diceNote').addEventListener('keydown',e=>{ if(e.key==='Enter') $('#diceRollNote').click(); });
  $('#diceClear').onclick=()=>{ rollLog=[]; renderDiceLog(); };
  $('#diceModal').onclick=e=>{ if(e.target.id==='diceModal') $('#modalRoot').innerHTML=''; };
  renderDiceLog();
}

function renderDiceLog(){
  const el=$('#diceLog'); if(!el) return;
  el.innerHTML = rollLog.length
    ? rollLog.map(r=>`<div class="logrow"><span class="lr-total">${r.total}</span><span class="lr-lab">${esc(r.label)}${r.crit==='crit'?' <span class="crit">✦</span>':''}</span><span class="lr-det">${r.detail}</span></div>`).join('')
    : '<div class="empty">No rolls yet. Tap a skill, save, attack, or a die.</div>';
}

function curMapGrid(){ return document.querySelector('#stModal .mapgrid, #qstModal .mapgrid, #qaModal .mapgrid, #smModal .mapgrid') || document.querySelector('.mapgrid'); }

function toggleCollapse(k){ collapsed[k]=!collapsed[k]; localStorage.setItem('grimoire.collapsed',JSON.stringify(collapsed)); render(); }

function openLog(){ const c=cur(); const log=(c&&c.log)||[];
  $('#modalRoot').innerHTML=`<div class="modal" id="logModal"><div class="sheet"><div class="grip"></div>
    <h2>📜 Adventure Log ${log.length?`<span class="muted" style="font-size:11px;text-transform:none">— ${log.length}</span>`:''}
      ${log.length?`<button class="btn ghost sm" id="logClear" style="float:right">Clear</button>`:''}</h2>
    ${log.length? log.slice(0,250).map(e=>`<div class="listrow"><div class="nm" style="font-size:13px">${esc(e.m)}</div><div class="sub" style="white-space:nowrap">${fmtLogTime(e.t)}</div></div>`).join('') : '<div class="empty">No actions logged yet. Casting, rolls of note, rests, level-ups, damage and conditions show up here.</div>'}
    <button class="btn ghost block" id="logClose" style="margin-top:12px">Close</button>
  </div></div>`;
  $('#logClose').onclick=()=>{ $('#modalRoot').innerHTML=''; };
  $('#logModal').onclick=e=>{ if(e.target.id==='logModal') $('#modalRoot').innerHTML=''; };
  { const lc=$('#logClear'); if(lc) lc.onclick=()=>{ if(c&&confirm('Clear the adventure log?')){ c.log=[]; save(); openLog(); } }; }
}

function openSearch(){
  $('#modalRoot').innerHTML=`<div class="modal" id="srchModal"><div class="sheet"><div class="grip"></div>
    <h2>🔍 Search</h2>
    <p class="muted" style="font-size:12px;margin:0 0 8px">Look up your stats and rules — e.g. “run speed”, “jump height”, “carry capacity”, a skill, spell or feat.</p>
    <input id="srchQ" placeholder="Search…" autocomplete="off">
    <div id="srchRes" style="margin-top:10px;max-height:62vh;overflow:auto"></div>
  </div></div>`;
  const c=cur();
  const draw=()=>{ const el=$('#srchRes'); if(el) el.innerHTML = c?searchResults(c, $('#srchQ').value):'<div class="empty">Create a character first.</div>'; };
  $('#srchQ').addEventListener('input',draw);
  $('#srchModal').onclick=e=>{ if(e.target.id==='srchModal') $('#modalRoot').innerHTML=''; };
  setTimeout(()=>{ const i=$('#srchQ'); if(i) i.focus(); },60);
  draw();
}

function spendHitDie(c){
  const hd=parseHitDice(c);
  if(!hd){ flashBanner('Set hit dice first (e.g. 5d10)'); return; }
  if((c.hitDice.used||0) >= hd.count){ flashBanner('No hit dice left'); return; }
  const conMod=mod(abil(c,"con"));
  const note='1d'+hd.sides+(conMod?(conMod>0?'+'+conMod:String(conMod)):'');
  const res=rollNotation(note);
  // Durable: healed HP from a spent Hit Die is at least 2x your Con modifier.
  if(hasFeat(c,'Durable')) res.total=Math.max(res.total, 2*conMod);
  c.hp.cur=Math.min(c.hp.max, c.hp.cur+Math.max(0,res.total));
  c.hitDice.used=(c.hitDice.used||0)+1;
  c.actionSurgeUsed=false;   // Action Surge recharges on a short rest
  if(isEchoKnight(c,7)) c.echoAvatarUsed=false;      // Echo Avatar: short or long rest
  if(isEchoKnight(c,10)) c.shadowMartyrUsed=false;   // Shadow Martyr: short or long rest
  // Healer feat's heal action: the "can't use on the same creature again" restriction (PHB)
  // is a property of the TARGET, not the healer — reset unconditionally regardless of
  // whether this character has the feat themselves.
  c.healerFeatSpent=false;
  if(hasFeat(c,'Inspiring Leader')) c.inspiringLeaderUsed=false;   // short or long rest
  if(isLoreBard(c) && (Number(c.level)||1)>=5) c.bardicInspLeft=bardicInspMax(c);   // Font of Inspiration (5th): short rest too
  if(c.cls==='Cleric' && (Number(c.level)||1)>=2) c.channelDivinityLeft=channelDivinityMax(c);   // Channel Divinity: short or long rest
  if(superiorityDiceMax(c)) c.superiorityDiceLeft=superiorityDiceMax(c);   // Battle Master/Martial Adept: short or long rest
  if(c.cls==='Druid' && (Number(c.level)||1)>=2) c.wildShapeLeft=wildShapeMax(c);   // Wild Shape: short or long rest
  if(c.cls==='Monk' && (Number(c.level)||1)>=2) c.kiLeft=kiMax(c);   // Ki: short or long rest
  if(isFiendWarlock(c,6)) c.darkOneLuckUsed=false;   // Dark One's Own Luck: short or long rest
  if(c.cls==='Paladin' && (Number(c.level)||1)>=3) c.paladinCDLeft=paladinCDMax(c);   // Paladin Channel Divinity: short or long rest
  logChange(c, 'Short rest: spent a Hit Die, +'+res.total+' HP');
  save();
  pushRoll({label:'Hit die heal', total:res.total, detail:res.detail, kind:'dmg', notation:note});
  render();
}

function rollDeathSave(c){
  const adv=hasBeaconOfHope(c);
  const d=adv?Math.max(rnd(20),rnd(20)):rnd(20);
  if(d===20){ c.hp.cur=1; c.death={succ:0,fail:0}; if(c.conditions) delete c.conditions['Unconscious']; pushRoll({label:'Death save', total:d, detail:'nat 20 — back up at 1 HP', crit:'crit', kind:'check'}); logChange(c,'NAT 20 death save — regained 1 HP, conscious'); flashBanner('Back up at 1 HP!'); save(); render(); return; }
  if(d===1){ c.death.fail=Math.min(3,(c.death.fail||0)+2); pushRoll({label:'Death save', total:d, detail:'nat 1 — 2 failures', crit:'fumble', kind:'check'}); }
  else if(d>=10){ c.death.succ=Math.min(3,(c.death.succ||0)+1); pushRoll({label:'Death save', total:d, detail:'success (≥10)', kind:'check'}); }
  else { c.death.fail=Math.min(3,(c.death.fail||0)+1); pushRoll({label:'Death save', total:d, detail:'failure (<10)', kind:'check'}); }
  if(c.death.succ>=3){ c.death={succ:0,fail:0}; logChange(c,'Three successes — stable'); flashBanner('Stable'); }
  if(c.death.fail>=3){ logChange(c,'Three failures — the character has died'); flashBanner('💀 Dead'); }
  save(); render();
}

function render(){
  if(_suppressRender) return;
  try{
  renderHeader();
  renderNetBar();
  if(QB && QB.active){ $('#tabs').style.display='none'; const fab0=$('#diceFab'); if(fab0) fab0.style.display='none'; renderQuickBattle(); return; }
  if(net && net.role==='dm'){ $('#tabs').style.display='none'; const fab0=$('#diceFab'); if(fab0) fab0.style.display='none'; renderDM(); return; }
  if(net && net.role==='player' && net.session && net.session.battle.active){ const pc=playerChar(); if(pc){ renderPlayerBattle(pc); return; } }
  const c = cur();
  const inWiz = !!(wiz && c);
  $('#tabs').style.display = inWiz ? 'none' : '';
  const fab=$('#diceFab'); if(fab) fab.style.display = inWiz ? 'none' : '';
  if(inWiz){ renderWizard(c); return; }
  renderTabs();
  if(!c){ renderWelcome(); return; }
  app.className='fade';
  void app.offsetWidth;
  if(tab==='bio'||tab==='abil'||tab==='char') renderSheet(c);
  else if(tab==='combat') renderCombat(c);
  else if(tab==='spells') renderSpells(c);
  else if(tab==='items') renderItems(c);
  else if(tab==='notes') renderNotes(c);
  }catch(err){
    // A throw mid-render used to leave a blank shell so it felt like the battle "exited".
    console.error('[render]', err);
    try{
      if(QB&&QB.active){
        app.innerHTML=`<div class="card"><h2>Battle UI glitch</h2><p class="muted" style="font-size:13px">${esc(err&&err.message||err)}</p>
          <button class="btn block" id="qbRenderRetry">Retry battle UI</button>
          <button class="btn ghost block" id="qbRenderExit" style="margin-top:8px">Exit battle</button></div>`;
        const r=$('#qbRenderRetry'); if(r) r.onclick=()=>render();
        const x=$('#qbRenderExit'); if(x) x.onclick=()=>qbExit();
      }
    }catch(e2){}
  }
}

function renderHeader(){
  const sel = $('#charSelect');
  const ver = (typeof APP_VERSION!=='undefined') ? ' · '+APP_VERSION : '';
  if(!DB.length){ sel.style.display='none'; $('#hsub').textContent='D&D 5e character keeper'+ver; return; }
  sel.style.display='';
  sel.innerHTML = DB.map(c=>`<option value="${c.id}" ${c.id===curId?'selected':''}>${esc(c.name)}</option>`).join('');
  const c=cur();
  $('#hsub').textContent = (c ? `${esc(c.race||'')} ${classLabel(c).replace(/^Level \d+ /,'')}`.trim() : 'D&D 5e character keeper')+ver;
  const hp=$('#hpfp'), d20=$('#hd20');
  if(c && c.portrait){ hp.style.backgroundImage='url('+c.portrait+')'; hp.style.display=''; d20.style.display='none'; }
  else { hp.style.display='none'; d20.style.display=''; }
}

function renderTabs(){
  $('#tabs').innerHTML = TABDEF.map(([k,l,ic])=>
    `<button class="${k===tab?'on':''}" data-tab="${k}"><span class="ic">${ic}</span>${l}</button>`
  ).join('');
}

function renderWelcome(){
  app.className='fade'; void app.offsetWidth;
  app.innerHTML = `
    <div class="welcome">
      <svg class="d20big" viewBox="0 0 64 64"><g transform="translate(32 32)"><polygon points="0,-26 22,-13 22,13 0,26 -22,13 -22,-13" fill="#4d6a2c" stroke="#d6e3ba" stroke-width="1.5" stroke-linejoin="round"/><polygon points="0,-26 13,-8 0,4 -13,-8" fill="#6f9442"/><polygon points="0,4 13,-8 22,13 0,26" fill="#3b5320"/><polygon points="0,4 -13,-8 -22,13 0,26" fill="#2c3f18"/><text x="0" y="3" text-anchor="middle" font-family="Georgia,serif" font-size="15" font-weight="bold" fill="#f6efda">20</text></g></svg>
      <h1 class="serif">Welcome, adventurer</h1>
      <p>Create a character to track abilities, skills, hit points, spell slots, inventory and more. Everything is saved on this device and works offline.</p>
      <button class="btn block" id="welcomeNew" style="max-width:280px;margin:0 auto">Create a character</button>
      <button class="btn ghost block" id="welcomeRandom" style="max-width:280px;margin:10px auto 0">🎲 Surprise me — random hero</button>
      <div class="row2" style="max-width:280px;margin:10px auto 0">
        <button class="btn ghost" id="welcomeHost">🎲 Host (DM)</button>
        <button class="btn ghost" id="welcomeJoin">🔗 Join game</button>
      </div>
      <div class="emrow" style="justify-content:center;margin-top:26px;gap:10px">
        ${['Fighter','Wizard','Cleric','Rogue','Ranger'].map(cl=>`<span class="emblem">${pixelArt(CLASS_PIX[cl],6)}</span>`).join('')}
      </div>
      <div class="emrow" style="justify-content:center;margin-top:10px;gap:10px">
        ${['Dwarf','Elf','Dragonborn','Tiefling','Halfling'].map(rc=>`<span class="emblem">${pixelArt(RACE_PIX[rc],6)}</span>`).join('')}
      </div>
    </div>`;
}

function renderWizard(c){
  app.className='fade'; void app.offsetWidth;
  const steps=wizSteps(c);
  if(wiz.step>=steps.length) wiz.step=steps.length-1;
  const step=wiz.step, def=steps[step];
  let body='';
  if(def.key==='name') body=`<div class="field"><label>Character name</label><input id="wz_name" value="${esc(c.name)}" placeholder="e.g. Lúthien"></div><p class="muted" style="font-size:13px">You'll build a level 1 hero, then level up as you play.</p>`;
  else if(def.key==='race') body=`<div class="field"><label>Race / Species</label>${fieldSelect('wz_race', RACES, c.race, 'Custom race')}</div>${racePreview(c)}`;
  else if(def.key==='class') body=`<div class="field"><label>Class</label>${select('wz_cls', CLASSES, c.cls)}</div>${classPreview(c)}`;
  else if(def.key==='subclass') body=`<div class="field"><label>${esc(c.cls)} subclass</label>${select('wz_sub', SUBCLASSES[c.cls]||['—'], c.subclass||(SUBCLASSES[c.cls]||['—'])[0])}</div><p class="muted" style="font-size:13px">In play, ${esc(c.cls)}s choose their subclass at level ${subclassLevel(c)} — but you can set it now.</p>`;
  else if(def.key==='bg') body=`<div class="field"><label>Background</label>${fieldSelect('wz_bg', BACKGROUNDS, c.background, 'Custom background')}</div>${BG_INFO[c.background]?`<div class="pill" style="margin-top:8px;display:block;line-height:1.5"><b>Skills:</b> ${BG_INFO[c.background].s}<br><b>Feature:</b> ${esc(BG_INFO[c.background].f)}</div>`:'<p class="muted" style="font-size:13px">Backgrounds give 2 skill proficiencies and a feature.</p>'}`;
  else if(def.key==='abil') body=abilCard(c, true);
  else if(def.key==='skills') body=skillsPicker(c);
  else if(def.key==='feat'){ const cur0=wiz.featChoice||(grantsL1Feat(c)?FEATS[0]:'(no feat)'); body=`<div class="field"><label>Starting feat ${grantsL1Feat(c)?'· Variant Human':'(optional)'}</label>${select('wz_feat', ['(no feat)',...FEATS], cur0)}</div><div class="muted" id="wzFeatDesc" style="font-size:13px;line-height:1.5">${FEAT_DESC[cur0]||(grantsL1Feat(c)?'Variant Human grants one feat at level 1.':'Most level-1 characters have no feat — pick one only if your DM allows it.')}</div><p class="muted" style="font-size:12px;margin-top:8px">If the feat grants choices (skills, a spell, etc.) you'll be asked to pick them after finishing.</p>`; }
  else if(def.key==='spells') body=wizSpellPicker(c);
  else body=reviewBlock(c);
  const isLast = step===steps.length-1;
  app.innerHTML=`
    <div class="card">
      <div class="wzprog">${steps.map((w,i)=>`<span class="${i<=step?'on':''}"></span>`).join('')}</div>
      <div class="muted" style="font-size:12px;margin-bottom:4px">Step ${step+1} of ${steps.length}</div>
      <h2 style="font-size:18px;text-transform:none;letter-spacing:0;color:var(--ink);margin-bottom:14px">${def.title}</h2>
      ${body}
    </div>
    <div class="row2">
      <button class="btn ghost" id="wzBack" ${step===0?'disabled style="opacity:.4"':''}>← Back</button>
      <button class="btn" id="wzNext">${isLast?'✓ Finish':'Next →'}</button>
    </div>
    <button class="btn ghost block" id="wzCancel" style="margin-top:10px;color:var(--bad)">Cancel &amp; delete</button>`;
  // handlers
  if(def.key==='name') $('#wz_name').addEventListener('input',e=>{ c.name=e.target.value; renderHeader(); });
  if(def.key==='race') bindSelectCustom('wz_race','race');
  if(def.key==='class') $('#wz_cls').addEventListener('change',e=>{ c.cls=e.target.value; c.subclass=''; applyClassDefaults(c); save(); render(); });
  if(def.key==='subclass') $('#wz_sub').addEventListener('change',e=>{ c.subclass=e.target.value; if(c.classes&&c.classes[0]) c.classes[0].subclass=e.target.value; save(); });
  if(def.key==='bg') bindSelectCustom('wz_bg','background');
  if(def.key==='abil') bindAbilHandlers(c);
  if(def.key==='skills') bindSkillHandlers(c);
  if(def.key==='feat') $('#wz_feat').addEventListener('change',e=>{ wiz.featChoice=e.target.value; const d=$('#wzFeatDesc'); if(d) d.textContent=FEAT_DESC[e.target.value]||''; });
  if(def.key==='spells') app.querySelectorAll('[data-wspell]').forEach(el=>el.addEventListener('change',e=>{
    const [n,l]=el.dataset.wspell.split('|'); const lv=Number(l);
    const cap = lv===0?cantripLimit(c):spell1Limit(c);
    if(e.target.checked){
      if(wizPickedCount(c,lv) >= cap){ e.target.checked=false; flashBanner((lv===0?'Cantrip':'Spell')+' limit reached ('+cap+')'); return; }
      if(!c.spells.some(s=>s.name.toLowerCase()===n.toLowerCase())) c.spells.push({name:n,level:lv,prepared:true,notes:''});
    } else c.spells=c.spells.filter(s=>s.name.toLowerCase()!==n.toLowerCase());
    c.spells.sort((a,b)=>(a.level-b.level)||a.name.localeCompare(b.name)); save(); render();
  }));
  if(def.key==='review'){
    const set=(m)=>{ wiz.hpMode=m; wiz.hpValue = m==='roll' ? Math.max(1, rnd(CLASS_HITDIE[c.cls]||8)+mod(abil(c,'con'))) : autoHP(c); render(); };
    const mx=$('#wzHpMax'), rl=$('#wzHpRoll'); if(mx) mx.onclick=()=>set('max'); if(rl) rl.onclick=()=>set('roll');
  }
  $('#wzBack').addEventListener('click',()=>{ if(wiz.step>0){ wiz.step--; render(); } });
  $('#wzNext').addEventListener('click',wizNext);
  $('#wzCancel').addEventListener('click',()=>{
    if(!confirm('Cancel and delete this character?')) return;
    const id=c.id; wiz=null; DB=DB.filter(x=>x.id!==id);
    curId=DB[0]?DB[0].id:null; localStorage.setItem(LS_CUR,curId||''); save(); render();
  });
}

function wizNext(){
  const c=cur(), steps=wizSteps(c), def=steps[wiz.step];
  if(def.key==='name'){ c.name=($('#wz_name')?$('#wz_name').value:c.name)||''; if(!c.name.trim()){ flashBanner('Enter a name first'); return; } }
  if(def.key==='feat'){ const v=$('#wz_feat'); if(v) wiz.featChoice=v.value; }
  if(def.key==='subclass'){ const v=$('#wz_sub'); if(v && !c.subclass) c.subclass=v.value; }
  save();
  if(wiz.step < steps.length-1){ wiz.step++; render(); return; }
  c.speed=defaultSpeed(c);
  const hp = wiz.hpValue!=null ? wiz.hpValue : (autoHP(c)||c.hp.max);
  c.hp.max=hp; c.hp.cur=hp;
  grantStartingGold(c); addEssentials(c);
  logChange(c, 'Created — level 1 '+(c.race?c.race+' ':'')+c.cls+(c.background?' ('+c.background+')':'')+' · '+(c.currency.gp||0)+' gp + adventurer\'s pack');
  const fc=wiz.featChoice;
  wiz=null; tab='char'; save(); render();
  if(fc && fc!=='(no feat)') applyFeat(c, fc, ()=>resolveChoices(c));   // feat first, then class/race choices
  else resolveChoices(c);   // Fighting Style, Expertise, Half-Elf/Variant/Dragonborn picks
}

function levelUp(){
  const c=cur(); if(c.level>=20){ flashBanner('Already level 20'); return; }
  let selCls=c.cls;   // which class this level-up applies to — defaults to your primary class,
                       // so a character who never touches the class-picker below behaves
                       // identically to before multiclassing existed.
  let hpGain=null, asiMode='asi', learnedThisLevel=0, learnedCantrips=0, pendingFeat=null;
  function renderModal(){
    const curClsLevel=classLevel(c,selCls), isNewClass=curClsLevel===0;
    const nlForCls=curClsLevel+1;
    const isAsi=asiLevels({cls:selCls}).includes(nlForCls);
    const needsSub = nlForCls>=(SUBCLASS_LEVEL[selCls]||3) && !classSubclass(c,selCls) && (SUBCLASSES[selCls]||[]).length>0;
    const hd=CLASS_HITDIE[selCls]||8, con=mod(abil(c,'con')), avg=Math.floor(hd/2)+1;
    const learnCap = ({Wizard:2,Bard:1,Sorcerer:1,Warlock:1,Ranger:1})[selCls] ?? 2;
    // Spell-learning stays scoped to your PRIMARY class only (see myLevel's doc comment on why
    // most class-feature progression is v1's boundary) — a secondary caster's new spells known
    // can still be added anytime via the Spells tab's own Add control, just not auto-prompted
    // here the way your primary class's are.
    const showSpellLearn = selCls===c.cls && isCaster({cls:selCls});
    const newCantrips = showSpellLearn ? Math.max(0, cantripsKnownAt(selCls, nlForCls) - cantripsKnownAt(selCls, curClsLevel)) : 0;
    learnedThisLevel=0; learnedCantrips=0; hpGain=null; asiMode='asi'; pendingFeat=null;
    const newTotal=totalLevel(c)+1;
    const takenClasses=c.classes.map(e=>e.cls);
    const classOptions=`<optgroup label="Level up">`+takenClasses.map(k=>`<option value="${k}" ${k===selCls?'selected':''}>${k} (currently ${classLevel(c,k)})</option>`).join('')+`</optgroup>`
      +(CLASSES.filter(k=>k!=='Other'&&!takenClasses.includes(k)).length?`<optgroup label="Multiclass into a new class">`+CLASSES.filter(k=>k!=='Other'&&!takenClasses.includes(k)).map(k=>`<option value="${k}" ${k===selCls?'selected':''}>${k}</option>`).join('')+`</optgroup>`:'');
    const prereqWarn = isNewClass && !meetsMulticlassPrereq(c,selCls) ? `<p class="muted" style="font-size:12px;color:var(--bad);margin:8px 0 0">⚠ Multiclassing into ${esc(selCls)} normally needs ${MULTICLASS_PREREQ[selCls].map(k=>k.toUpperCase()+' 13+').join(selCls==='Fighter'?' or ':' and ')} — not enforced, your table's call.</p>` : '';
    $('#modalRoot').innerHTML=`
     <div class="modal" id="luModal"><div class="sheet">
       <div class="grip"></div>
       <h2>Level up → ${esc(selCls)} ${nlForCls} <span class="muted" style="text-transform:none;font-size:12px">(total ${newTotal})</span></h2>
       ${(c.classes.length>1||CLASSES.some(k=>k!=='Other'&&!takenClasses.includes(k)))?`<div class="card" style="margin:0 0 12px"><h2>Which class?</h2><select id="luClassPick">${classOptions}</select>${prereqWarn}</div>`:''}
       <div class="card" style="margin:0 0 12px"><h2>Hit points (+CON ${sgn(con)})</h2>
         <div class="row2"><button class="btn ghost" id="luAvg">Average +${Math.max(1,avg+con)}</button>
           <button class="btn ghost" id="luRoll">Roll d${hd}</button></div>
         <div class="muted" id="luHpMsg" style="font-size:13px;margin-top:8px">Pick how to gain HP.</div>
       </div>
       ${needsSub?`<div class="card" style="margin:0 0 12px"><h2>Choose subclass</h2>${select('luSub', SUBCLASSES[selCls], SUBCLASSES[selCls][0])}</div>`:''}
       ${isAsi?`<div class="card" style="margin:0 0 12px"><h2>Ability Score Improvement</h2>
          <div class="seg" id="luSeg"><button class="on" data-asi="asi">+2 / +1×2</button><button data-asi="feat">Take a feat</button></div>
          <div id="luBody"></div></div>`:''}
       ${showSpellLearn?`<div class="card" style="margin:0 0 12px"><h2>Learn spells <span class="muted" style="text-transform:none;font-size:11px">— ${esc(selCls)}: ${learnCap} this level</span></h2>
          <div class="addrow">${spellLearnSelect(c, nlForCls, 'leveled')}<button class="btn sm" id="luLearn">Add</button></div>
          <div class="muted" id="luSpellDesc" style="font-size:12px;margin-top:6px;line-height:1.5"></div>
          <div class="muted" id="luLearnMsg" style="font-size:12px;margin-top:6px">Spells learned: 0 / ${learnCap}. Pick one, tap Add, then pick another.</div>
          ${newCantrips>0?`<div style="border-top:1px solid var(--line);margin-top:10px;padding-top:10px"><div class="muted" style="font-size:12px;margin-bottom:6px">✨ New cantrip${newCantrips>1?'s':''} at level ${nlForCls} — choose ${newCantrips}</div>
            <div class="addrow">${spellLearnSelect(c, nlForCls, 'cantrips')}<button class="btn sm" id="luLearnC">Add</button></div>
            <div class="muted" id="luCantripMsg" style="font-size:12px;margin-top:6px">Cantrips learned: 0 / ${newCantrips}.</div></div>`:''}
          </div>`:(selCls!==c.cls && isCaster({cls:selCls})?`<p class="muted" style="font-size:12px;margin:0 0 12px">New ${esc(selCls)} spells known: add them anytime from the Spells tab.</p>`:'')}
       <button class="btn block" id="luApply">Apply level ${nlForCls}</button>
     </div></div>`;
    const setHp=(v,m)=>{ hpGain=Math.max(1,v); $('#luHpMsg').textContent=m; };
    $('#luAvg').onclick=()=>setHp(avg+con,`+${Math.max(1,avg+con)} HP (average)`);
    $('#luRoll').onclick=()=>{ const r=rnd(hd); setHp(r+con,`Rolled ${r} ${sgn(con)} = ${Math.max(1,r+con)} HP`); };
    function luBody(){
      const el=$('#luBody'); if(!el) return;
      if(asiMode==='asi'){
        el.innerHTML = `<p class="muted" style="font-size:13px">+2 to one, or +1 to two (capped at 20).</p>
           <div class="row2"><div><label>Increase</label>${select('luA1', ABILITIES.map(a=>a[1]), ABILITIES[0][1])}</div>
           <div><label>And +1 to (optional)</label>${select('luA2', ['—',...ABILITIES.map(a=>a[1])], '—')}</div></div>`;
      } else {
        el.innerHTML = `<div><label>Feat</label>${select('luFeat', FEATS, FEATS[0])}</div><div class="muted" id="luFeatDesc" style="font-size:12px;margin-top:6px;line-height:1.5">${esc(FEAT_DESC[FEATS[0]]||'')}</div>`;
        const f=$('#luFeat'); if(f) f.addEventListener('change',e=>{ $('#luFeatDesc').textContent=FEAT_DESC[e.target.value]||''; });
      }
    }
    if(isAsi){ luBody(); $('#luSeg').querySelectorAll('[data-asi]').forEach(b=>b.onclick=()=>{ asiMode=b.dataset.asi; $('#luSeg').querySelectorAll('button').forEach(x=>x.classList.toggle('on',x===b)); luBody(); }); }
    { const cp=$('#luClassPick'); if(cp) cp.addEventListener('change',e=>{ selCls=e.target.value; renderModal(); }); }
    { const ls=$('#luSpell'); if(ls) ls.addEventListener('change',e=>{ const n=(e.target.value||'').split('|')[0]; const d=$('#luSpellDesc'); if(d) d.textContent=n?(SPELL_DESC[n]||'No reference summary.'):''; }); }
    { const lb=$('#luLearn'); if(lb) lb.onclick=()=>{
      if(learnedThisLevel>=learnCap){ $('#luLearnMsg').textContent='Reached this level’s limit ('+learnCap+'/'+learnCap+'). Add more on the Spells tab.'; return; }
      const sel=$('#luSpell'); if(!sel||!sel.value){ $('#luLearnMsg').textContent='Pick a spell from the list first.'; return; }
      const [n,l]=sel.value.split('|');
      if(!c.spells.some(s=>s.name.toLowerCase()===n.toLowerCase())){
        const ns={name:n,level:Number(l),prepared:false,notes:''}; c.spells.push(ns);
        const note=autoPrepare(c, ns);
        c.spells.sort((a,b)=>(a.level-b.level)||a.name.localeCompare(b.name)); save();
        learnedThisLevel++;
        $('#luLearnMsg').textContent= (learnedThisLevel<learnCap ? ('Learned '+n+note+'. Now pick your next spell ('+learnedThisLevel+'/'+learnCap+').') : ('Learned '+n+note+'. Done ('+learnedThisLevel+'/'+learnCap+').'));
        const opt=sel.querySelector('option[value="'+sel.value.replace(/"/g,'\\"')+'"]'); if(opt) opt.remove(); sel.value='';
      }
    }; }
    { const lc=$('#luLearnC'); if(lc) lc.onclick=()=>{
      if(learnedCantrips>=newCantrips){ $('#luCantripMsg').textContent='Reached this level’s cantrip limit ('+newCantrips+'/'+newCantrips+').'; return; }
      const sel=$('#luCantrip'); if(!sel||!sel.value){ $('#luCantripMsg').textContent='Pick a cantrip first.'; return; }
      const [n,l]=sel.value.split('|');
      if(!c.spells.some(s=>s.name.toLowerCase()===n.toLowerCase())){
        c.spells.push({name:n,level:0,prepared:false,notes:''});
        c.spells.sort((a,b)=>(a.level-b.level)||a.name.localeCompare(b.name)); save();
        learnedCantrips++;
        $('#luCantripMsg').textContent='Cantrips learned: '+learnedCantrips+' / '+newCantrips+'.';
        const opt=sel.querySelector('option[value="'+sel.value.replace(/"/g,'\\"')+'"]'); if(opt) opt.remove(); sel.value='';
      }
    }; }
    $('#luModal').onclick=e=>{ if(e.target.id==='luModal') $('#modalRoot').innerHTML=''; };
    $('#luApply').onclick=()=>{
      // require all this-level choices before applying
      if(showSpellLearn && learnedThisLevel<learnCap){ flashBanner('Learn your '+learnCap+' spell'+(learnCap>1?'s':'')+' first ('+learnedThisLevel+'/'+learnCap+')'); return; }
      if(newCantrips>0 && learnedCantrips<newCantrips){ flashBanner('Choose your new cantrip'+(newCantrips>1?'s':'')+' first ('+learnedCantrips+'/'+newCantrips+')'); return; }
      if(isAsi && asiMode==='feat'){ const fv=$('#luFeat'); if(!fv||!fv.value){ flashBanner('Pick a feat first'); return; } }
      if(hpGain==null) hpGain=Math.max(1,avg+con);
      if(hasFeat(c,'Tough')) hpGain+=2;   // Tough: +2 max HP per level, every level after you take it
      c.hp.max+=hpGain; c.hp.cur+=hpGain;
      let subNote='';
      const subPick = needsSub ? ($('#luSub')&&$('#luSub').value) : null;
      if(subPick) subNote=', subclass: '+subPick;
      let entry=c.classes.find(e=>e.cls===selCls);
      if(entry){ entry.level=nlForCls; if(subPick) entry.subclass=subPick; }
      else { entry={cls:selCls, level:1, subclass:subPick||''}; c.classes.push(entry); }
      // Deliberately NOT syncPrimaryClass here: its single-class branch mirrors the LIVE
      // c.level/c.cls INTO classes[0] (so ensureFields never clobbers a direct test-style
      // mutation elsewhere) — the opposite of what's needed right here, where classes[] was
      // just updated and IS the authoritative source. Sync straight from classes[] instead.
      c.cls=c.classes[0].cls; c.subclass=c.classes[0].subclass||'';
      c.level=c.classes.reduce((s,e)=>s+(Number(e.level)||0),0);
      // Draconic Resilience (1st level): +1 max HP this level AND every level after — checked
      // after c.classes is updated/synced above, since a Sorcerer can pick Draconic Bloodline
      // on this exact level-up (1st level) and still needs the bonus to apply immediately.
      // Primary-class-only per this pass's scope (myLevel/isDraconicSorcerer both read c.cls) —
      // moot for a brand-new multiclass entry anyway, since it can never become primary.
      if(isDraconicSorcerer(c,1)){ c.hp.max+=1; c.hp.cur+=1; }
      let asiNote='';
      if(isAsi){
        if(asiMode==='asi'){
          const k1=abilKeyByName($('#luA1').value), a2=$('#luA2').value;
          if(k1) c.asiBonus[k1]+= (a2==='—'?2:1);
          if(a2!=='—'){ const k2=abilKeyByName(a2); if(k2) c.asiBonus[k2]+=1; }
          clampAbil(c);
          asiNote=', ASI '+$('#luA1').value+(a2!=='—'?' & '+a2:'');
        } else { pendingFeat=$('#luFeat').value; asiNote=', feat: '+pendingFeat; }
      }
      c.hitDice.total=hitDiceLabel(c);
      logChange(c, (isNewClass?'Multiclassed into ':'Leveled up ')+selCls+' to '+nlForCls+' (total level '+c.level+') (+'+hpGain+' HP)'+subNote+asiNote);
      $('#modalRoot').innerHTML=''; save(); render(); flashBanner('Welcome to '+selCls+' '+nlForCls+'!');
      if(pendingFeat) applyFeat(c, pendingFeat, ()=>resolveChoices(c));   // feat first, then any new class/race choices (e.g. L6 Expertise)
      else resolveChoices(c);   // new Fighting Style / Expertise unlocked by this level
    };
  }
  renderModal();
}

function renderSheet(c){
  const pend=pendingChoiceSpecs(c);
  app.innerHTML = `
  ${pend.length?`<div class="card" style="border:1px solid var(--accent);background:rgba(180,140,255,.08)">
    <h2 style="margin-top:0">⚑ Choices to make</h2>
    <p class="muted" style="margin:4px 0 10px">Your race, class or level grants picks you haven't made yet:</p>
    <ul style="margin:0 0 12px 18px;padding:0">${pend.map(s=>`<li>${esc(s.label||({ancestry:'Draconic ancestry',fightingStyle:'Fighting Style',expertise:'Expertise',skill:'Skill proficiencies',ability:'Ability score increases',weaponProf:'Weapon Master — weapon proficiencies'}[s.t]||'Choice'))}</li>`).join('')}</ul>
    <button class="btn block" id="resolveChoices">Make these choices</button>
  </div>`:''}
  <div class="card">
    <h2>Identity</h2>
    <div class="row" style="gap:14px;align-items:center;margin-bottom:14px">
      <div class="pfp" id="pfp" style="${c.portrait?`background-image:url('${c.portrait}')`:''}">${c.portrait?'':'🧙'}</div>
      <div>
        <button class="btn ghost sm" id="pfpBtn">${c.portrait?'Change photo':'＋ Upload photo'}</button>
        ${c.portrait?'<button class="btn ghost sm" id="pfpDel" style="margin-top:6px;color:var(--bad)">Remove</button>':''}
        <input type="file" id="pfpFile" accept="image/*" style="display:none">
      </div>
    </div>
    <div class="grid">
      <div><label>Character name</label><input id="f_name" value="${esc(c.name)}"></div>
      <div class="g2 grid">
        <div><label>Race / Species</label>${fieldSelect('f_race', RACES, c.race, 'Custom race')}</div>
        <div><label>Background ${c.background?`<button class="del" data-bginfo="${esc(c.background)}" title="What does this do?" style="font-size:13px;padding:0 4px">ⓘ</button>`:''}</label>${fieldSelect('f_background', BACKGROUNDS, c.background, 'Custom background')}</div>
      </div>
      <div class="g2 grid">
        <div><label>Class</label>${select('f_cls', CLASSES, c.cls)}</div>
        <div><label>Subclass</label>${fieldSelect('f_subclass', SUBCLASSES[c.cls]||[], c.subclass, 'Custom subclass')}</div>
      </div>
      <div class="g2 grid">
        <div><label>XP</label><input id="f_xp" type="number" min="0" value="${c.xp}"></div>
        <div><label>Prof. bonus (auto)</label><input id="f_profOverride" type="number" value="${c.profOverride}" placeholder="${profBonus(c)}"></div>
      </div>
    </div>
  </div>

  <div class="card">
    <div class="row between" style="margin-bottom:12px">
      <h2 style="margin:0;color:var(--ink);text-transform:none;letter-spacing:0;font-size:16px">${classLabel(c)}${c.subclass?` · ${esc(c.subclass)}`:''}</h2>
      <button class="btn sm" id="levelUpBtn" ${c.level>=20?'disabled style="opacity:.4"':''}>⬆ Level Up</button>
    </div>
    <div class="tiles">
      <div class="tile"><div class="lab">Proficiency ${bd('prof')}</div><div class="big">${sgn(profBonus(c))}</div></div>
      <div class="tile" ${featInitBonus(c)?'style="box-shadow:inset 0 0 0 1px var(--accent)"':''}><div class="lab">Initiative${featInitBonus(c)?' ▲':''} ${bd('init')}</div><div class="big">${sgn(initiative(c))}</div></div>
      <div class="tile" ${effBonus(c,'ac')?'style="box-shadow:inset 0 0 0 1px var(--accent)"':''}><div class="lab">Armor Class${effBonus(c,'ac')?' ▲':''} ${bd('ac')}</div><div class="big">${computeAC(c)}</div></div>
      <div class="tile" ${(effBonus(c,'speed')||effSpeedMul(c)!==1)?'style="box-shadow:inset 0 0 0 1px var(--accent)"':''}><div class="lab">Speed${(effBonus(c,'speed')||effSpeedMul(c)!==1)?' ▲':''} ${bd('speed')}</div><div class="big">${effSpeed(c)}</div></div>
    </div>
    ${(c.effects&&c.effects.length)?`<div class="addrow" style="margin-top:10px;flex-wrap:wrap;gap:6px">${c.effects.map(e=>`<span class="pill" title="${esc(e.note||'')}">${spellIcon(e.name)} ${esc(e.name)}${e.mods&&modSummary(e.mods)?' · '+modSummary(e.mods):''} · ${fmtDuration(e.rounds)}</span>`).join('')}</div>`:''}
    <div class="addrow" style="margin-top:12px">
      <label class="pill" style="cursor:pointer"><input type="checkbox" class="chk" id="f_insp" ${c.inspiration?'checked':''}> Inspiration</label>
    </div>
  </div>

  <div class="card">
    <div class="row between" style="margin-bottom:8px">
      <h2 style="margin:0">Ability Scores ${abilEdit?'<span class="muted" style="text-transform:none;font-size:11px">— editing</span>':''}</h2>
      <button class="btn ghost sm" id="abilEditBtn">${abilEdit?'✓ Done':'✎ Edit'}</button>
    </div>
    ${abilEdit?abilCard(c,true):abilCard(c)}
  </div>

  <div class="card">
    <h2>${chev('saves')}Saving Throws <span class="muted" style="text-transform:none;font-size:11px">— ● = proficient (from ${esc(c.cls)})</span></h2>
    ${collapsed.saves?'':ABILITIES.map(([k,nm])=>{
      const prof=!!c.saveProf[k];
      const b = saveMod(c,k);
      return `<div class="listrow">
        <span class="profdot ${prof?'on':''}"></span>
        <div class="nm">${nm}</div>
        ${bd('save:'+k)}
        <button class="val rollbtn" data-rollcheck data-label="${nm} save" data-bonus="${b}" title="Roll ${nm} save">${sgn(b)}</button>
      </div>`;
    }).join('')}
  </div>

  <div class="card">
    <div class="row between" style="margin-bottom:8px">
      <h2 style="margin:0">${chev('skills')}Skills <span class="muted" style="text-transform:none;font-size:11px">— ${skillCount(c)}/${skillBudget(c)}${skillEdit?' · tap ◇ for expertise':''}</span></h2>
      <button class="btn ghost sm" id="skillEditBtn">${skillEdit?'✓ Done':'✎ Edit'}</button>
    </div>
    ${collapsed.skills?'':SKILLS.map(([key,nm,ab])=>{
      const b = skillBonus(c,key,ab,true), prof=!!c.skillProf[key], exp=!!c.skillExp[key];
      if(skillEdit) return `<div class="listrow">
        <input type="checkbox" class="chk" data-skill="${key}" ${prof?'checked':''}>
        <button class="del" data-exp="${key}" title="Expertise" style="color:${exp?'var(--gold)':'var(--mut)'}">${exp?'◆':'◇'}</button>
        <div class="nm">${nm} <span class="sub">(${ab})</span></div>
        <button class="val rollbtn" data-rollcheck data-label="${nm}" data-bonus="${b}" title="Roll ${nm}">${sgn(b)}</button>
      </div>`;
      return `<div class="listrow">
        <span class="profdot ${prof?'on':''}"></span>
        <span style="width:14px;text-align:center;color:var(--gold)">${exp?'◆':''}</span>
        <div class="nm">${nm} <span class="sub">(${ab})</span></div>
        ${bd('skill:'+key+':'+ab)}
        <button class="val rollbtn" data-rollcheck data-label="${nm}" data-bonus="${b}" title="Roll ${nm}">${sgn(b)}</button>
      </div>`;
    }).join('')}
  </div>

  <div class="card">
    <h2>Passive Senses</h2>
    <div class="tiles">
      <div class="tile"><div class="lab">Passive Perception ${bd('passive:perception:wis')}</div><div class="big">${passiveScore(c,'perception','wis')}</div></div>
      <div class="tile"><div class="lab">Passive Investigation ${bd('passive:investigation:int')}</div><div class="big">${passiveScore(c,'investigation','int')}</div></div>
    </div>
    <p class="muted" style="font-size:11.5px;margin:10px 0 0">Not a skill — it's your Perception/Investigation used <b>without rolling</b>. 5e uses a fixed <b>10</b> in place of the d20, then adds your skill bonus. The DM compares it to a hidden creature's Stealth: ≤ your passive = you notice it automatically.</p>
  </div>

  <div class="card">
    <h2>Class &amp; Race</h2>
    <div class="emrow" style="justify-content:center;margin-bottom:12px">
      <div style="text-align:center">${classEmblem(c.cls,8)}<div class="emcap">${esc(c.cls)}</div></div>
      ${c.race?`<div style="text-align:center">${raceEmblem(c.race,8)}<div class="emcap">${esc(c.race)}</div></div>`:''}
    </div>
    ${c.race?`<div class="listrow"><div class="nm">Race</div><div class="val" style="font-weight:500">${esc(c.race)}${RACE_ASI[c.race]?' · '+Object.entries(RACE_ASI[c.race]).map(([k,v])=>k.toUpperCase()+'+'+v).join(', '):''}</div></div>`:''}
    <div class="listrow"><div class="nm">Class</div><div class="val" style="font-weight:500">${esc(c.cls)}${c.subclass?' · '+esc(c.subclass):''}</div></div>
    <div class="listrow"><div class="nm">Hit die</div><div class="val">d${CLASS_HITDIE[c.cls]||'—'}</div></div>
    <div class="listrow"><div class="nm">Saving throws</div><div class="val">${(CLASS_SAVES[c.cls]||[]).map(s=>s.toUpperCase()).join(', ')||'—'}</div></div>
    ${isCaster(c)?`<div class="listrow"><div class="nm">Spellcasting</div><div class="val">${(ABILITIES.find(a=>a[0]===c.spellAbility)||['','—'])[1]}</div></div>`:''}
    ${c.fightingStyle?`<div class="listrow"><div class="nm">Fighting Style</div><div class="val" style="font-weight:500">${esc(c.fightingStyle)}</div></div>`:''}
    ${c.dragon?`<div class="listrow"><div class="nm">Draconic Ancestry</div><div class="val" style="font-weight:500">${esc(c.dragon)}</div></div>`:''}
    ${c.feats.length?`<div class="listrow"><div class="nm">Feats</div><div class="val" style="font-weight:500">${c.feats.map(f=>esc(f.name||f)).join(', ')}</div></div>`:''}
  </div>

  ${(()=>{ const ct=RACE_TRAITS[c.race]||[]; const lvl=Number(c.level)||1;
    const cf=(CLASS_FEATURES[c.cls]||[]).filter(f=>f[0]<=lvl)
      .concat(c.subclass && SUBCLASS_FEATURES[c.subclass] ? SUBCLASS_FEATURES[c.subclass].filter(f=>f[0]<=lvl) : [])
      .sort((a,b)=>a[0]-b[0]);
    if(!ct.length && !cf.length) return '';
    return `<div class="card"><h2>Features &amp; Traits</h2>
      ${ct.length?`<div class="muted" style="font-size:11px;text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px">${esc(c.race)} traits</div>`+ct.map(t=>`<div class="spell"><div class="nm"><b>${esc(t[0])}</b><small>${esc(t[1])}</small></div></div>`).join(''):''}
      ${cf.length?`<div class="muted" style="font-size:11px;text-transform:uppercase;letter-spacing:.05em;margin:14px 0 4px">${esc(c.cls)} features${c.subclass?' · '+esc(c.subclass):''}</div>`+cf.map(f=>`<div class="spell"><div class="nm"><b>${esc(f[1])} <span class="sub">Lv ${f[0]}</span></b><small>${esc(f[2])}</small></div></div>`).join(''):''}
      <p class="muted" style="font-size:11px;margin:10px 0 0">Auto-generated summaries through level ${lvl}. Subclass features with real mechanics behind them (Echo Knight so far) are usable from the Use menu in battle.</p></div>`;
  })()}

  <div class="card">
    <h2>Feats ${c.feats.length?`<span class="muted" style="text-transform:none;font-size:11px">— ${c.feats.length}</span>`:''}</h2>
    <div>${c.feats.length? c.feats.map((f,i)=>`<div class="spell"><div class="nm"><b>${esc(f.name||f)}</b>${FEAT_DESC[f.name||f]?`<small>${esc(FEAT_DESC[f.name||f])}</small>`:(f.note?`<small>${esc(f.note)}</small>`:'')}</div><button class="del" data-featinfo="${esc(f.name||f)}" title="Info">ⓘ</button><button class="del" data-delfeat="${i}">✕</button></div>`).join('') : '<div class="empty">None yet. You gain a feat at ASI levels (4, 8, 12…) or as a Variant Human — or just pick one below.</div>'}</div>
    <div class="addrow"><select id="feat_pick" style="flex:2"><option value="">— choose a feat to add —</option>${FEATS.map(f=>`<option>${esc(f)}</option>`).join('')}</select><button class="btn sm" id="addFeat">Add</button></div>
    <div class="muted" id="featPickDesc" style="font-size:12px;margin-top:6px"></div>
  </div>

  <div class="card">
    <button class="btn bad block" id="deleteChar">Delete this character</button>
  </div>`;

  bind('f_name','name');
  bindSelectCustom('f_race','race'); bindSelectCustom('f_background','background');
  $('#f_cls').addEventListener('change',e=>{ c.cls=e.target.value; c.subclass=''; applyClassDefaults(c); save(); render(); });
  bindSelectCustom('f_subclass','subclass');
  // bindSelectCustom writes c.subclass directly — mirror it into c.classes[0] (the primary
  // class entry) so classSubclass()/classLevel() readers stay in sync with this editor too.
  ['f_subclass_sel','f_subclass_cust'].forEach(id=>{ const el=$('#'+id); if(el) el.addEventListener('change',()=>{ if(c.classes&&c.classes[0]) c.classes[0].subclass=c.subclass||''; save(); }); });
  bindNum('f_xp','xp');
  $('#f_profOverride').addEventListener('change',e=>{ c.profOverride = e.target.value===''?'':Number(e.target.value); save(); render(); });
  $('#f_insp').addEventListener('change',e=>{ c.inspiration=e.target.checked; save(); });
  $('#levelUpBtn').addEventListener('click',levelUp);
  $('#pfpBtn').addEventListener('click',()=>$('#pfpFile').click());
  $('#pfpFile').addEventListener('change',e=>{ if(e.target.files[0]) setPortrait(e.target.files[0]); });
  { const d=$('#pfpDel'); if(d) d.addEventListener('click',()=>{ c.portrait=''; save(); render(); }); }
  $('#feat_pick').addEventListener('change',e=>{ $('#featPickDesc').textContent=FEAT_DESC[e.target.value]||''; });
  $('#addFeat').addEventListener('click',()=>{ const v=$('#feat_pick').value; if(!v) return; applyFeat(c, v); });
  app.querySelectorAll('[data-delfeat]').forEach(el=>el.addEventListener('click',()=>{ c.feats.splice(Number(el.dataset.delfeat),1); save(); render(); }));
  $('#deleteChar').addEventListener('click',()=>deleteCharacter(c));
  { const r=$('#resolveChoices'); if(r) r.addEventListener('click',()=>resolveChoices(c)); }
  $('#abilEditBtn').addEventListener('click',()=>{ abilEdit=!abilEdit; render(); });
  $('#skillEditBtn').addEventListener('click',()=>{ skillEdit=!skillEdit; render(); });
  if(abilEdit) bindAbilHandlers(c);
  if(skillEdit) bindSkillHandlers(c);
}

function renderAbil(c){
  const pb = profBonus(c);
  app.innerHTML = `
  <div class="card">
    <div class="row between" style="margin-bottom:8px">
      <h2 style="margin:0">Ability Scores ${abilEdit?'<span class="muted" style="text-transform:none;font-size:11px">— editing</span>':''}</h2>
      <button class="btn ghost sm" id="abilEditBtn">${abilEdit?'✓ Done':'✎ Edit'}</button>
    </div>
    ${abilEdit?abilCard(c,true):abilCard(c)}
  </div>

  <div class="card">
    <h2>Saving Throws <span class="muted" style="text-transform:none;font-size:11px">— ● = proficient (from ${esc(c.cls)})</span></h2>
    ${ABILITIES.map(([k,nm])=>{
      const prof=!!c.saveProf[k];
      const b = saveMod(c,k);
      return `<div class="listrow">
        <span class="profdot ${prof?'on':''}"></span>
        <div class="nm">${nm}</div>
        <button class="val rollbtn" data-rollcheck data-label="${nm} save" data-bonus="${b}" title="Roll ${nm} save">${sgn(b)}</button>
      </div>`;
    }).join('')}
  </div>

  <div class="card">
    <div class="row between" style="margin-bottom:8px">
      <h2 style="margin:0">Skills <span class="muted" style="text-transform:none;font-size:11px">— ${skillCount(c)}/${skillBudget(c)}${skillEdit?' · tap ◇ for expertise':''}</span></h2>
      <button class="btn ghost sm" id="skillEditBtn">${skillEdit?'✓ Done':'✎ Edit'}</button>
    </div>
    ${SKILLS.map(([key,nm,ab])=>{
      const b = skillBonus(c,key,ab,true), prof=!!c.skillProf[key], exp=!!c.skillExp[key];
      if(skillEdit) return `<div class="listrow">
        <input type="checkbox" class="chk" data-skill="${key}" ${prof?'checked':''}>
        <button class="del" data-exp="${key}" title="Expertise" style="color:${exp?'var(--gold)':'var(--mut)'}">${exp?'◆':'◇'}</button>
        <div class="nm">${nm} <span class="sub">(${ab})</span></div>
        <button class="val rollbtn" data-rollcheck data-label="${nm}" data-bonus="${b}" title="Roll ${nm}">${sgn(b)}</button>
      </div>`;
      return `<div class="listrow">
        <span class="profdot ${prof?'on':''}"></span>
        <span style="width:14px;text-align:center;color:var(--gold)">${exp?'◆':''}</span>
        <div class="nm">${nm} <span class="sub">(${ab})</span></div>
        <button class="val rollbtn" data-rollcheck data-label="${nm}" data-bonus="${b}" title="Roll ${nm}">${sgn(b)}</button>
      </div>`;
    }).join('')}
  </div>

  <div class="card">
    <h2>Passive senses</h2>
    <div class="tiles">
      <div class="tile"><div class="lab">Passive Perception</div><div class="big" id="pp">${passiveScore(c,'perception','wis')}</div></div>
      <div class="tile"><div class="lab">Passive Investigation</div><div class="big" id="pi">${passiveScore(c,'investigation','int')}</div></div>
    </div>
  </div>`;

  $('#abilEditBtn').addEventListener('click',()=>{ abilEdit=!abilEdit; render(); });
  $('#skillEditBtn').addEventListener('click',()=>{ skillEdit=!skillEdit; render(); });
  if(abilEdit) bindAbilHandlers(c);
  if(skillEdit) bindSkillHandlers(c);
}

function bindAbilHandlers(c){
  ABILITIES.forEach(([k])=>{
    const inp=$('#ab_'+k);   // only present in Manual mode
    if(inp) inp.addEventListener('change',e=>{ c.abilities[k]=Math.max(1,Math.min(30,Number(e.target.value)||10)); save(); render(); });
  });
  app.querySelectorAll('[data-abmethod]').forEach(el=>el.addEventListener('click',()=>{
    const m=el.dataset.abmethod; if(m===(c.abilMethod||'manual')) return;
    if(m==='pointbuy'){ ABILITIES.forEach(([k])=>{ c.abilities[k]=Math.max(8,Math.min(15,Number(c.abilities[k])||8)); }); }
    else if(m==='array'){ ABILITIES.forEach(([k])=>c.abilities[k]=null); }
    else { ABILITIES.forEach(([k])=>{ if(c.abilities[k]==null) c.abilities[k]=10; }); }
    c.abilMethod=m; save(); render();
  }));
  app.querySelectorAll('[data-pb]').forEach(el=>el.addEventListener('click',()=>{
    const k=el.dataset.pb, d=Number(el.dataset.d), v=Number(c.abilities[k])||8, nv=v+d;
    if(nv<8||nv>15) return;
    if(d>0 && (pbUsed(c)-pbCost(v)+pbCost(nv))>27) return;
    c.abilities[k]=nv; save(); render();
  }));
  app.querySelectorAll('[data-arr]').forEach(el=>el.addEventListener('change',e=>{
    c.abilities[el.dataset.arr] = e.target.value==='—' ? null : Number(e.target.value);
    save(); render();
  }));
}

function bindSkillHandlers(c){
  app.querySelectorAll('[data-skill]').forEach(el=>el.addEventListener('change',e=>{
    const key=e.target.dataset.skill;
    if(e.target.checked && skillCount(c) >= skillBudget(c)){
      e.target.checked=false; flashBanner('Skill limit reached ('+skillBudget(c)+')'); return;
    }
    c.skillProf[key]=e.target.checked; save(); render();
  }));
  app.querySelectorAll('[data-exp]').forEach(el=>el.addEventListener('click',e=>{
    const k=el.dataset.exp; c.skillExp[k]=!c.skillExp[k]; save(); render();
  }));
}

function renderCombat(c){
  const hd=parseHitDice(c); const hdLeft=hd?Math.max(0,hd.count-(c.hitDice.used||0)):0;
  app.innerHTML = `
  ${battleCard(c)}
  <div class="card">
    <h2>Hit Points</h2>
    <div class="hp">
      <div class="tile"><div class="lab">Current</div><div class="big" style="color:var(--good)" id="hpcur">${c.hp.cur}</div></div>
      <div class="tile"><div class="lab">Max</div><input type="number" id="hpmax" value="${c.hp.max}"></div>
      <div class="tile"><div class="lab">Temp</div><input type="number" id="hptemp" value="${c.hp.temp}"></div>
    </div>
    <div class="hpbtns">
      <button class="btn bad sm" id="dmgBtn">– Damage</button>
      <input type="number" id="hpamt" value="1" min="1" inputmode="numeric">
      <button class="btn sm" id="healBtn" style="background:#16352b;border-color:#14532d;color:#bbf7d0">+ Heal</button>
    </div>
    ${autoHP(c)?`<button class="btn ghost sm block" id="autoHp" style="margin-top:10px">Set max HP to class average — ${autoHP(c)} (${c.classes&&c.classes.length>1?'per class':esc(c.cls)+' d'+CLASS_HITDIE[c.cls]} + CON)</button>`:''}
  </div>

  <div class="card">
    <h2>Defenses</h2>
    ${(()=>{ const arm=(c.items||[]).find(it=>it.equipped&&it.kind==='armor'); const shields=(c.items||[]).filter(it=>it.equipped&&it.kind==='shield');
      const armName = arm? arm.name : (c.armor&&c.armor!=='none'? armorDef(c.armor).name+' (set manually)' : 'Unarmored');
      return `<div class="listrow"><div class="nm"><b>Armor</b><small>${esc(armName)}${shields.length?' + Shield':''}</small></div><div class="val">AC ${computeAC(c)}</div></div>
      <p class="muted" style="font-size:11.5px;margin:6px 0 10px">🛡️ Worn armor & shields come from what you <b>equip on the Items tab</b> — your AC updates automatically. ${(c.acOverride!==''&&c.acOverride!=null)?'A custom AC override is active below.':''}</p>`; })()}
    <div class="g2 grid">
      <div><label>Speed (ft)</label><select id="cb_speed">${[25,30,35,40,50].map(s=>`<option ${Number(c.speed)===s?'selected':''}>${s}</option>`).join('')}<option value="custom" ${[25,30,35,40,50].includes(Number(c.speed))?'':'selected'}>Custom…</option></select></div>
      <div><label>Custom AC (override, optional)</label><input type="number" id="cb_acover" value="${c.acOverride}" placeholder="leave blank to use armor"></div>
    </div>
    <div class="g2 grid" style="margin-top:10px">
      <div id="spdCustWrap" style="${[25,30,35,40,50].includes(Number(c.speed))?'display:none':''}"><label>Custom speed</label><input type="number" id="cb_spdcust" value="${c.speed}"></div>
      <div><label>Initiative misc</label><input type="number" id="cb_init" value="${c.initMisc}"></div>
    </div>
    <label class="pill" style="cursor:pointer;margin-top:12px"><input type="checkbox" class="chk" id="cb_shield" ${c.shield?'checked':''}> Shield (+2 AC)</label>
    <div class="tiles" style="margin-top:12px">
      <div class="tile"><div class="lab">Armor Class ${bd('ac')}</div><div class="big">${computeAC(c)}</div></div>
      <div class="tile"><div class="lab">Initiative${featInitBonus(c)?' ▲':''} ${bd('init')}</div><button class="big rollbtn" data-rollcheck data-label="Initiative" data-bonus="${initiative(c)}" title="Roll initiative${featInitBonus(c)?' (incl. +5 Alert)':''}">${sgn(initiative(c))}</button></div>
      ${isCaster(c)?`<div class="tile"><div class="lab">Spell DC ${bd('spelldc')}</div><div class="big">${8+profBonus(c)+mod(abil(c,c.spellAbility))}</div></div>
      <div class="tile"><div class="lab">Spell Atk ${bd('spellatk')}</div><div class="big">${sgn(profBonus(c)+mod(abil(c,c.spellAbility)))}</div></div>`:`<div class="tile"><div class="lab">Prof. ${bd('prof')}</div><div class="big">${sgn(profBonus(c))}</div></div><div class="tile"><div class="lab">Speed${(effBonus(c,'speed')||effSpeedMul(c)!==1)?' ▲':''} ${bd('speed')}</div><div class="big">${effSpeed(c)}</div></div>`}
    </div>
  </div>

  <div class="card">
    <h2>Hit Dice & Death Saves</h2>
    <div class="slot">
      <div class="lvl">Hit dice${hd?` · d${hd.sides}`:''}</div>
      <div class="pips">${hd?hdPips(hd.count, c.hitDice.used||0):'<span class="muted" style="font-size:12px">set a class</span>'}</div>
      <div class="muted" style="font-size:12px">${hd?`${hdLeft}/${hd.count}`:''}</div>
    </div>
    <div style="margin-top:12px">
      <label>Death saves${c.hp.cur<=0?' <span class="muted" style="text-transform:none">— you are dying</span>':''}</label>
      <div class="listrow"><div class="nm">Successes</div><div class="pips" id="deathSucc">${pips(3,c.death.succ,'succ')}</div></div>
      <div class="listrow"><div class="nm">Failures</div><div class="pips" id="deathFail">${pips(3,c.death.fail,'fail')}</div></div>
      ${c.hp.cur<=0?`<button class="btn block" id="deathRoll" style="margin-top:8px">🎲 Roll death save</button>`:''}
    </div>
    <button class="btn ghost block" id="spendHd" style="margin-top:12px">☾ Short rest: roll a Hit Die to heal${hd?` · ${hdLeft}/${hd.count} left`:''}</button>
    <p class="muted" style="font-size:11.5px;margin:8px 0 0">On a short rest you can spend Hit Dice — roll the die + your CON to recover HP. You regain half on a long rest.</p>
  </div>

  <div class="card">
    <h2>Conditions ${Object.keys(c.conditions).length?`<span class="muted" style="text-transform:none;font-size:11px">— ${Object.keys(c.conditions).length} active</span>`:''}</h2>
    <div class="chips">
      ${CONDITIONS.map(cn=>`<button class="chip ${c.conditions[cn]?'on':''}" data-cond="${cn}">${cn}</button>`).join('')}
    </div>
    <div class="listrow" style="margin-top:14px">
      <div class="nm">Exhaustion ${c.exhaustion?`<span class="muted">(disadvantage etc.)</span>`:''}</div>
      <div class="stepper">
        <button id="exhDown">−</button>
        <div class="val" style="min-width:48px">${c.exhaustion||0} / 6</div>
        <button id="exhUp">＋</button>
      </div>
    </div>
  </div>

  <div class="card">
    <h2>Concentration</h2>
    <label class="pill" style="cursor:pointer"><input type="checkbox" class="chk" id="concOn" ${c.concentration.active?'checked':''}> Concentrating${c.concentration.active&&c.concentration.spell?' on '+esc(c.concentration.spell):''}</label>
    <div style="margin-top:10px">${(()=>{
      const sel=c.concentration.spell||'';
      const names=c.spells.map(s=>s.name).filter(n=>isConcentration(n));
      if(sel && !names.includes(sel)) names.unshift(sel);
      if(!names.length) return `<input id="concSpell" value="${esc(sel)}" placeholder="No concentration spells known — type one" ${c.concentration.active?'':'disabled style="opacity:.5"'}>`;
      return `<select id="concSpell" ${c.concentration.active?'':'disabled style="opacity:.5"'}><option value="">— choose a concentration spell —</option>${names.map(n=>`<option ${n===sel?'selected':''}>${esc(n)}</option>`).join('')}</select>`;
    })()}</div>
  </div>

  ${effectsCard(c)}

  <div class="card">
    <h2>Action Economy</h2>
    <div class="tiles">
      <div class="tile"><div class="lab">Attacks / action</div><div class="big">${extraAttacks(c)+1}</div></div>
      <div class="tile"><div class="lab">Action</div><div class="big">1</div></div>
      <div class="tile"><div class="lab">Bonus action</div><div class="big">1</div></div>
      <div class="tile"><div class="lab">Reaction</div><div class="big">1</div></div>
    </div>
    <p class="muted" style="font-size:11.5px;margin:10px 0 0">Plus your move (up to ${effSpeed(c)} ft). ${extraAttacks(c)?'Extra Attack lets you attack '+(extraAttacks(c)+1)+'× when you take the Attack action.':'One attack per Attack action at this level.'}</p>
    ${c.cls==='Barbarian'?`<button class="btn block" id="rageBtn2" style="margin-top:10px;${isRaging(c)?'background:var(--bad);border-color:var(--bad)':''}">🪓 ${isRaging(c)?'Raging — +'+rageDamage(c)+' melee, resist b/p/s (tap to end)':'Enter Rage'}</button>`:''}
  </div>

  <div class="card">
    <h2>Attacks & Weapons</h2>
    <div id="attackList">
      ${weaponItems(c).map(({it,i})=>{ const w=weaponByName(it.name)||{dmg:'1d4',dt:'',type:'melee',props:'',cat:''}; const ab=weaponAbil(c,w), prof=weaponProficient(c,w), th=weaponToHit(c,w,it); const db=weaponDmgBonus(c,w,it), dn=w.dmg+(db?sgn(db):'');
        return `<div class="spell">
          <span style="flex:none">${itemEmblem(weaponIconKey(it.name),4)}</span>
          <div class="nm"><b>${esc(it.name)}${it.equipped?' <span class="sub" style="color:var(--accent)">✓</span>':''}</b><small>${sgn(th)} to hit · ${esc(dn)} ${esc(w.dt||'')} · ${esc(w.rng||'5 ft')}${prof?'':' · <span style="color:var(--bad)">not proficient</span>'}</small></div>
          <button class="btn sm" ${weaponAflowAttrs(c,it)}>⚔ Attack</button>
        </div>`; }).join('')}
      ${c.attacks.length?c.attacks.map((a,i)=>{
        const bn=Number(String(a.bonus).replace(/[^0-9-]/g,''))||0;
        return `<div class="spell">
          <div class="nm"><b>${esc(a.name)}</b>${a.damage?`<small>${sgn(bn)} to hit · ${esc(a.damage)}</small>`:''}</div>
          <button class="btn sm" data-aflow data-aname="${esc(a.name)}" data-ahit="${bn}" data-admg="${esc(a.damage||'1d4')}" data-adt="" data-avers="">⚔ Attack</button>
          <button class="del" data-delatk="${i}">✕</button>
        </div>`;}).join(''):''}
      ${(!weaponItems(c).length && !c.attacks.length)?'<div class="empty">No weapons yet. Add them on the Items tab, or add a manual attack below.</div>':''}
    </div>
    <div class="addrow">
      <input id="atk_name" placeholder="Name">
      <input id="atk_bonus" placeholder="+5" style="max-width:70px">
      <input id="atk_dmg" placeholder="1d8+3 slashing">
      <button class="btn sm" id="addAtk">Add</button>
    </div>
  </div>`;

  $('#hpmax').addEventListener('change',e=>{ c.hp.max=Number(e.target.value)||0; save(); });
  const ahp=$('#autoHp'); if(ahp) ahp.addEventListener('click',()=>{ const v=autoHP(c); if(v){ c.hp.max=v; c.hp.cur=v; save(); render(); } });
  $('#hptemp').addEventListener('change',e=>{ c.hp.temp=Number(e.target.value)||0; save(); render(); });
  { const ov=$('#cb_acover'); if(ov) ov.addEventListener('change',e=>{ c.acOverride=e.target.value===''?'':Number(e.target.value); save(); render(); }); }
  $('#cb_shield').addEventListener('change',e=>{ c.shield=e.target.checked; save(); render(); });
  $('#cb_speed').addEventListener('change',e=>{
    if(e.target.value==='custom'){ const w=$('#spdCustWrap'); if(w) w.style.display=''; const i=$('#cb_spdcust'); if(i) i.focus(); }
    else { c.speed=Number(e.target.value)||30; save(); render(); }
  });
  { const sc=$('#cb_spdcust'); if(sc) sc.addEventListener('change',e=>{ c.speed=Number(e.target.value)||30; save(); render(); }); }
  $('#cb_init').addEventListener('change',e=>{ c.initMisc=Number(e.target.value)||0; save(); render(); });
  app.querySelectorAll('[data-hdpip]').forEach(el=>el.addEventListener('click',()=>{
    const n=Number(el.dataset.hdpip), total=hd?hd.count:0, avail=total-(c.hitDice.used||0);
    if(n<=avail) c.hitDice.used=Math.min(total,(c.hitDice.used||0)+1);
    else c.hitDice.used=Math.max(0,(c.hitDice.used||0)-1);
    save(); render();
  }));

  $('#dmgBtn').addEventListener('click',()=>applyHp(c,-Math.abs(Number($('#hpamt').value)||0)));
  $('#healBtn').addEventListener('click',()=>applyHp(c,Math.abs(Number($('#hpamt').value)||0)));

  app.querySelectorAll('[data-pip]').forEach(el=>el.addEventListener('click',()=>{
    const kind=el.dataset.kind, n=Number(el.dataset.pip);
    const field=kind==='succ'?'succ':'fail';
    c.death[field] = (c.death[field]===n)?n-1:n; save(); render();
  }));

  { const ab=$('#attackBtn'); if(ab) ab.addEventListener('click',()=>openAttack(c)); }
  { const sb=$('#startBattle'); if(sb) sb.addEventListener('click',()=>startBattle(c)); }
  { const eb=$('#endBattle'); if(eb) eb.addEventListener('click',()=>endBattle(c)); }
  { const nt=$('#nextTurn'); if(nt) nt.addEventListener('click',()=>battleNextTurn(c)); }
  { const qa=$('#bqAttack'); if(qa) qa.addEventListener('click',()=>openAttack(c)); }
  { const qs=$('#bqSpells'); if(qs) qs.addEventListener('click',()=>openQuickSpells(c)); }
  { const mb=$('#moveBtn'); if(mb) mb.addEventListener('click',()=>openMove(c)); }
  { const rb=$('#rageBtn'); if(rb) rb.addEventListener('click',()=>rageButtonClick(c)); }
  { const bd=$('#bDmg'); if(bd) bd.addEventListener('click',()=>applyHp(c,-Math.abs(Number($('#bAmt').value)||0))); }
  { const bh=$('#bHeal'); if(bh) bh.addEventListener('click',()=>applyHp(c,Math.abs(Number($('#bAmt').value)||0))); }
  { const bds=$('#bDeath'); if(bds) bds.addEventListener('click',()=>rollDeathSave(c)); }
  { const rb2=$('#rageBtn2'); if(rb2) rb2.addEventListener('click',()=>rageButtonClick(c)); }
  { const wsb=$('#wildShapeBtn'); if(wsb) wsb.addEventListener('click',()=>openWildShapeUI(c)); }
  { const kib=$('#kiBtn'); if(kib) kib.addEventListener('click',()=>openKiUI(c)); }
  { const pab=$('#palBtn'); if(pab) pab.addEventListener('click',()=>openPaladinUI(c)); }
  { const sob=$('#sorcBtn'); if(sob) sob.addEventListener('click',()=>openSorcererUI(c)); }
  { const wlb=$('#wlBtn'); if(wlb) wlb.addEventListener('click',()=>openWarlockUI(c)); }
  app.querySelectorAll('[data-bt]').forEach(el=>el.addEventListener('click',()=>{ const b=c.battle; if(!b) return; const k=el.dataset.bt;
    if(k==='action'){ if(hasAction(c)) spendAction(c); else { b.actionsUsed=0; b.action=false; } }   // tap to spend/reset (cycles for multi-action)
    else if(k==='bonus'||k==='reaction') b[k]=!b[k];
    else if(k==='atkminus') b.attacksLeft=Math.max(0,b.attacksLeft-1);
    else if(k==='move5') b.move=Math.max(0,b.move-5);
    else if(k==='move10') b.move=Math.max(0,b.move-10);
    else if(k==='roundUp') b.round++;
    else if(k==='roundDown') b.round=Math.max(1,b.round-1);
    else if(k==='surge'){ if(c.actionSurgeUsed){ flashBanner('Action Surge spent — rest to recharge'); return; } b.actionsMax=(b.actionsMax!=null?b.actionsMax:actionsPerTurn(c))+1; c.actionSurgeUsed=true; b.action=!hasAction(c); logChange(c,'⚡ Action Surge — extra action'); flashBanner('⚡ Action Surge — +1 action'); }
    else if(k==='dash'){
      // Cunning Action (Rogue 2nd): Dash as a bonus action instead — preferred automatically
      // whenever the bonus action is still free, falling back to the normal action otherwise
      // (a player can still use their action to Dash even with Cunning Action available).
      const cunning=c.cls==='Rogue' && (Number(c.level)||1)>=2 && !(b.bonus);
      if(cunning){ b.bonus=true; b.move+=effSpeed(c); b.dashed=true; logChange(c,'🏃 Dash (Cunning Action, bonus action) — +'+effSpeed(c)+' ft movement'); }
      else { if(!hasAction(c)){ flashBanner('No action left to Dash this turn'); return; } spendAction(c); b.move+=effSpeed(c); b.dashed=true; logChange(c,'🏃 Dash — +'+effSpeed(c)+' ft movement'); }
    }
    save(); render(); }));
  $('#addAtk').addEventListener('click',()=>{
    const name=$('#atk_name').value.trim(); if(!name) return;
    c.attacks.push({name, bonus:$('#atk_bonus').value.trim(), damage:$('#atk_dmg').value.trim()});
    save(); render();
  });
  app.querySelectorAll('[data-delatk]').forEach(el=>el.addEventListener('click',()=>{
    c.attacks.splice(Number(el.dataset.delatk),1); save(); render();
  }));

  $('#spendHd').addEventListener('click',()=>spendHitDie(c));
  { const dr=$('#deathRoll'); if(dr) dr.addEventListener('click',()=>rollDeathSave(c)); }
  app.querySelectorAll('[data-cond]').forEach(el=>el.addEventListener('click',()=>{
    const k=el.dataset.cond;
    if(c.conditions[k]){ delete c.conditions[k]; logChange(c,'Cleared condition: '+k); } else { c.conditions[k]=true; logChange(c,'Gained condition: '+k); }
    save(); render(); if(net&&net.role==='player') playerHello();   // conditions drive advantage — keep the DM's mirror current
  }));
  $('#exhUp').addEventListener('click',()=>{ c.exhaustion=Math.min(6,(c.exhaustion||0)+1); save(); render(); });
  $('#exhDown').addEventListener('click',()=>{ c.exhaustion=Math.max(0,(c.exhaustion||0)-1); save(); render(); });
  $('#concOn').addEventListener('change',e=>{ c.concentration.active=e.target.checked; if(!e.target.checked){ c.concentration.spell=''; c.effects=(c.effects||[]).filter(x=>!x.conc); } save(); render(); });
  $('#concSpell').addEventListener('change',e=>{ c.concentration.spell=e.target.value; save(); });
  bindEffectsCard(c);
}

function applyHp(c,delta,dtype){
  // Wild Shape: damage/healing hits the beast's own HP pool, not yours (PHB) — a completely
  // separate branch rather than threading wildShape checks through every death-save/rage/
  // concentration line below, so none of that real-HP logic needs to know this exists.
  if(c.wildShape){
    if(delta<0){
      const dmg=-delta, before=c.wildShape.hpCur;
      c.wildShape.hpCur=Math.max(0,c.wildShape.hpCur-dmg);
      logChange(c,'('+c.wildShape.name+' form) took '+dmg+' damage → '+c.wildShape.hpCur+'/'+c.wildShape.hpMax+' HP');
      if(before>0 && c.wildShape.hpCur<=0){
        // PHB: excess damage that drops the beast form to 0 carries over to your normal form
        const overflow=dmg-before, beastName=c.wildShape.name;
        c.wildShape=null;
        logChange(c,'Beast form destroyed — you revert to '+c.name);
        flashBanner('💥 '+beastName+' form destroyed — you revert'+(overflow>0?' and take '+overflow+' overflow damage':''));
        if(overflow>0){ applyHp(c,-overflow,dtype); return; }
      }
      save(); render(); if(net&&net.role==='player') playerHello();
      return;
    } else {
      c.wildShape.hpCur=Math.min(c.wildShape.hpMax, c.wildShape.hpCur+delta);
      logChange(c,'('+c.wildShape.name+' form) healed '+delta+' → '+c.wildShape.hpCur+'/'+c.wildShape.hpMax+' HP');
      save(); render(); if(net&&net.role==='player') playerHello();
      return;
    }
  }
  let concDmg=0;
  if(delta<0){
    let dmg=-delta; const wasAt0=c.hp.cur<=0;
    if(c.conditions && c.conditions['Asleep']){ delete c.conditions['Asleep']; logChange(c,'Woken by damage'); }   // damage wakes sleepers (PHB)
    const raged=isRaging(c)&&dmg>0; if(raged) dmg=Math.floor(dmg/2);   // Rage: resistance to b/p/s (halved)
    // Heavy Armor Master: -3 flat to nonmagical bludgeoning/piercing/slashing damage while
    // wearing heavy armor (dexCap===0 marks heavy armor in this app's ARMOR table). This app
    // has no magical-vs-nonmagical tag on incoming damage anywhere, so — like every other
    // "counts as magical" gap this session — it applies to any b/p/s hit, a documented
    // simplification rather than a missing mechanic silently skipped.
    let hamNote='';
    if(dtype && dmg>0 && ['bludgeoning','piercing','slashing'].includes(dtype) && hasFeat(c,'Heavy Armor Master') && (armorDef(c.armor||'none').dexCap===0)){
      const before2=dmg; dmg=Math.max(0,dmg-3); if(dmg<before2) hamNote=' (−3 Heavy Armor Master)';
    }
    // Fiendish Resilience (The Fiend 10th): resistance (half) to the chosen damage type.
    let frNote='';
    if(dtype && dmg>0 && c.fiendishResilience===dtype){ dmg=Math.floor(dmg/2); frNote=' (½ Fiendish Resilience)'; }
    // Uncanny Dodge (Rogue 5th / Ranger Hunter's Superior Hunter's Defense): halve damage from
    // an attack, once per round via your reaction. Applied automatically rather than as a live
    // prompt — nothing in this app's damage pipeline pauses mid-resolution to ask, and a
    // rational player essentially always wants it anyway (the same reasoning Rage's own halving
    // above already relies on). Gated on `dtype` being present so it only fires for real
    // attack/spell damage, not flat manual/environmental entries.
    let udNote='';
    if(dtype && dmg>0 && hasUncannyDodge(c) && c.battle && !c.battle.reaction){
      dmg=Math.floor(dmg/2); c.battle.reaction=true; udNote=' (½ Uncanny Dodge)';
    }
    concDmg=dmg;   // damage taken (after resistance) drives the concentration DC, even if temp HP absorbs it
    if(c.hp.temp>0){ const a=Math.min(c.hp.temp,dmg); c.hp.temp-=a; dmg-=a; }
    const before=c.hp.cur; c.hp.cur=Math.max(0,c.hp.cur-dmg);
    logChange(c,'Took '+dmg+(raged?' (½ rage resistance)':'')+hamNote+frNote+udNote+' damage → '+c.hp.cur+' HP');
    if(raged) flashBanner('🪓 Rage — damage halved (physical)');
    // damage while at 0 HP = a failed death save; if it equals/exceeds your max HP you die outright (PHB massive damage)
    // Taking damage also ends a Stabilize (PHB) — back to rolling death saves.
    if(wasAt0 && dmg>0){
      c.stable=false;
      if(dmg>=c.hp.max){ c.death.fail=3; logChange(c,'💀 Massive damage at 0 HP — instant death'); flashBanner('💀 Dead — damage ≥ max HP'); }
      else { c.death.fail=Math.min(3,(c.death.fail||0)+1); logChange(c,'Hit at 0 HP — 1 death-save failure'); }
    }
    // dropped to 0 → unconscious; instant death if the leftover damage ≥ your max HP (PHB)
    if(before>0 && c.hp.cur===0){
      if((dmg-before)>=c.hp.max){ c.death.fail=3; c.conditions['Unconscious']=true; logChange(c,'💀 Massive damage — instant death'); flashBanner('💀 Instant death — overkill ≥ max HP'); }
      else { c.conditions['Unconscious']=true; logChange(c,'Dropped to 0 HP — Unconscious'); flashBanner('Down! Roll death saves'); }
      checkFallDamage(c, m=>logChange(c,m));   // knocked unconscious mid-flight → falls, see its own doc comment for scope
    }
  }else{
    c.hp.cur=Math.min(c.hp.max,c.hp.cur+delta);
    if(c.hp.cur>0){ if(c.conditions['Unconscious']) delete c.conditions['Unconscious']; c.death={succ:0,fail:0}; c.stable=false; }   // healed above 0 → stable & conscious
    logChange(c,'Healed '+delta+' → '+c.hp.cur+' HP');
  }
  save(); render();
  if(net&&net.role==='player') playerHello();   // keep DM's view of my HP live
  if(concDmg>0 && c.concentration && c.concentration.active) concentrationCheck(c, concDmg);   // prompt the CON save (after render so the modal survives)
}

function concentrationCheck(c, dmg){
  if(!(c.concentration && c.concentration.active)) return;
  if(concActive){ concQueue.push({c,dmg}); return; }
  concActive=true;
  if(QB&&QB.active) QB.paused=true;   // hold the AI turn loop until this save is answered
  const dc=Math.max(10, Math.floor(dmg/2));
  const conBonus=mod(abil(c,'con'))+((c.saveProf&&c.saveProf.con)?profBonus(c):0);
  const adv=hasFeat(c,'War Caster');   // War Caster grants advantage on concentration saves
  const spell=c.concentration.spell||'a spell';
  const drop=()=>{ c.effects=(c.effects||[]).filter(e=>!e.conc); c.concentration={active:false,spell:''}; logChange(c,'💨 Lost concentration on '+spell); save(); render(); };
  const st={rolled:false, d20:0, total:0, ok:false};
  function draw(){
    let body=`<h2>🧠 Concentration — ${esc(spell)}</h2>
      <p class="muted" style="font-size:13px;margin:0 0 10px">Took ${dmg} damage. Make a <b>CON save vs DC ${dc}</b> or lose concentration.${adv?' <b>(advantage — War Caster)</b>':''}</p>`;
    if(!st.rolled){
      body+=`<button class="btn block" id="ccRoll">🎲 Roll CON save (${sgn(conBonus)}${adv?', adv':''})</button>
        <div class="addrow" style="margin-top:8px"><input id="ccMan" type="number" placeholder="enter d20 (1–20)"><button class="btn ghost" id="ccUse">Use</button></div>
        <button class="btn ghost block" id="ccDrop" style="margin-top:8px">Drop concentration</button>`;
    } else {
      body+=`<div class="card" style="text-align:center;margin:0 0 10px;background:${st.ok?'rgba(63,125,54,.14)':'rgba(160,40,40,.14)'}">
        <div style="font-family:Georgia,serif;font-size:34px;font-weight:700;color:${st.ok?'var(--good)':'var(--bad)'}">${st.total}</div>
        <div class="muted">d20 (${st.d20}) ${sgn(conBonus)} vs DC ${dc} — ${st.ok?'✓ HELD':'✗ LOST'}</div></div>`;
    }
    body+=`<button class="btn ghost block" id="ccClose" style="margin-top:8px">Close</button>`;
    $('#modalRoot').innerHTML=`<div class="modal" id="ccModal"><div class="sheet"><div class="grip"></div>${body}</div></div>`;
    const close=()=>{ $('#modalRoot').innerHTML=''; concActive=false;
      if(concQueue.length){ const nx=concQueue.shift(); concentrationCheck(nx.c, nx.dmg); }
      else if(QB&&QB.active) QB.paused=false; };
    $('#ccClose').onclick=close; $('#ccModal').onclick=e=>{ if(e.target.id==='ccModal') close(); };
    const resolve=(face)=>{ const r1=face!=null?face:rnd(20), r2=rnd(20); const d20=(adv&&face==null)?Math.max(r1,r2):r1;
      st.d20=d20; st.total=d20+conBonus; st.ok=st.total>=dc; st.rolled=true;
      pushRoll({label:'Concentration (CON)', total:st.total, detail:'d20 ('+d20+') '+sgn(conBonus)+' vs DC '+dc, kind:'save'});
      sfx(st.ok?'success':'error'); if(!st.ok) drop(); else { logChange(c,'Held concentration on '+spell+' ('+st.total+' vs '+dc+')'); save(); }
      draw(); };
    { const r=$('#ccRoll'); if(r) r.onclick=()=>resolve(null); }
    { const u=$('#ccUse'); if(u) u.onclick=()=>{ const v=Number($('#ccMan').value); if(v>=1&&v<=20) resolve(v); else flashBanner('Enter 1–20'); }; }
    { const dp=$('#ccDrop'); if(dp) dp.onclick=()=>{ drop(); close(); }; }
  }
  draw();
}

function addSpellTo(c, name, level){
  name=String(name).trim(); if(!name) return;
  if(c.spells.some(s=>s.name.toLowerCase()===name.toLowerCase())){ flashBanner(name+' is already known'); return; }
  const s={name, level:Number(level)||0, prepared:false, notes:''};
  c.spells.push(s);
  const note=autoPrepare(c, s);
  c.spells.sort((a,b)=>(a.level-b.level)||a.name.localeCompare(b.name));
  logChange(c, 'Learned '+name+' ('+lvlLabel(Number(level)||0)+')'+note);
  flashBanner(name+' added'+note);
  save(); render();
}

function openPrepare(c){
  const max=preparedMax(c);
  function draw(){
    const known=(c.spells||[]).map((s,i)=>({s,i})).filter(o=>(o.s.level||0)>0).sort((a,b)=>(a.s.level-b.s.level)||a.s.name.localeCompare(b.s.name));
    const cnt=preparedCount(c);
    const body=`<h2>📋 Prepare Spells</h2>
      <p class="muted" style="font-size:12.5px;margin:0 0 6px">${esc(c.cls)} prepares <b>${max}</b> spells per day (spell mod + ${c.cls==='Paladin'||c.cls==='Artificer'?'½ ':''}level). Cantrips are always ready and don't count.</p>
      <div class="card" style="text-align:center;margin:0 0 10px;background:${cnt>max?'rgba(160,40,40,.12)':'rgba(63,125,54,.12)'}"><b style="color:${cnt>max?'var(--bad)':'var(--good)'}">${cnt} / ${max} prepared</b></div>
      ${known.length? known.map(o=>`<label class="spell" style="cursor:pointer"><input type="checkbox" class="chk" data-pp="${o.i}" ${o.s.prepared?'checked':''}><span style="flex:none">${spellIcon(o.s.name)}</span><div class="nm"><b>${esc(o.s.name)}</b><small>${lvlLabel(o.s.level)}${isConcentration(o.s.name)?' · 🧠 conc':''}</small></div></label>`).join('') : '<div class="empty">No leveled spells in your spellbook yet — add some first.</div>'}
      <button class="btn block" id="ppDone" style="margin-top:10px">Done</button>`;
    $('#modalRoot').innerHTML=`<div class="modal" id="ppModal"><div class="sheet"><div class="grip"></div>${body}</div></div>`;
    const close=()=>{ $('#modalRoot').innerHTML=''; render(); };
    $('#ppModal').onclick=e=>{ if(e.target.id==='ppModal') close(); };
    $('#ppDone').onclick=close;
    document.querySelectorAll('[data-pp]').forEach(el=>el.onchange=()=>{ const idx=Number(el.dataset.pp);
      if(el.checked && preparedCount(c)>=max){ el.checked=false; flashBanner('At your prepared limit ('+max+') — unprepare one first'); return; }
      c.spells[idx].prepared=el.checked; save(); draw(); });
  }
  draw();
}

function renderSpells(c){
  const dc = 8+profBonus(c)+mod(abil(c,c.spellAbility));
  const atk = profBonus(c)+mod(abil(c,c.spellAbility));
  // group spells by level
  const byLvl={};
  for(let i=0;i<=9;i++) byLvl[i]=[];
  c.spells.forEach((s,i)=>{ byLvl[s.level||0].push({s,i}); });

  const spellAbilName = (ABILITIES.find(a=>a[0]===c.spellAbility)||['','—'])[1];
  app.innerHTML = `
  ${!isCaster(c)?`<div class="card"><div class="empty">${esc(c.cls)} isn't a spellcasting class by default. You can still track spells below if a subclass or feat grants them.</div></div>`:''}
  <div class="card">
    <h2>Spellcasting</h2>
    <div class="g3 grid">
      <div class="tile"><div class="lab">Ability${isCaster(c)?' · from class':''}</div><div class="big" style="font-size:18px">${spellAbilName}</div></div>
      <div class="tile"><div class="lab">Spell save DC ${bd('spelldc')}</div><div class="big">${dc}</div></div>
      <div class="tile"><div class="lab">Spell attack ${bd('spellatk')}</div><div class="big">${sgn(atk)}</div></div>
    </div>
  </div>

  <div class="card">
    <h2>Spell Slots <button class="btn ghost sm" id="restBtn" style="float:right">Long rest</button></h2>
    ${(()=>{ const auto=spellSlots(c); const rows=[1,2,3,4,5,6,7,8,9].map(l=>{
      const total=auto[l]; if(!total) return '';
      const used=Math.min(total,(c.slots[l]&&c.slots[l].used)||0);
      return `<div class="slot">
        <div class="lvl">${c.cls==='Warlock'?'Pact · L'+l:'Level '+l}</div>
        <div class="pips">${slotPipsAuto(l,total,used)}</div>
        <div class="muted" style="font-size:12px">${total-used}/${total}</div>
      </div>`;
    }).join(''); return rows || '<div class="empty">No spell slots at this level.</div>'; })()}
  </div>

  ${(()=>{ // class casting resources (PHB): Arcane Recovery / Pact Magic / Font of Magic
    if(c.cls==='Wizard'){ const budget=Math.ceil((Number(c.level)||1)/2); return `<div class="card"><h2>Arcane Recovery</h2>
      <p class="muted" style="font-size:12px;margin:0 0 8px">Once per day when you finish a short rest, recover spent slots with a combined level of ${budget} or less (no slot 6th level or higher).</p>
      <button class="btn ghost block" id="arcRec" ${c.arcaneRecovered?'disabled style="opacity:.5"':''}>${c.arcaneRecovered?'✓ Used today — recharges on a long rest':'☾ Arcane Recovery (short rest)'}</button></div>`; }
    if(c.cls==='Warlock') return `<div class="card"><h2>Pact Magic</h2>
      <p class="muted" style="font-size:12px;margin:0 0 8px">Pact slots recharge on a <b>short or long</b> rest.</p>
      <button class="btn ghost block" id="pactRest">☾ Short rest — recover pact slots</button></div>`;
    if(sorcMax(c)){ const mx=sorcMax(c), cur=sorcCur(c);
      return `<div class="card"><h2>Sorcery Points <span class="muted" style="text-transform:none;font-size:11px">— Font of Magic</span></h2>
      <div class="listrow"><div class="nm">Points</div><div class="stepper"><button id="spDown" ${cur<=0?'disabled':''}>−</button><div class="val" style="min-width:56px;text-align:center">${cur} / ${mx}</div><button id="spUp" ${cur>=mx?'disabled':''}>＋</button></div></div>
      <div class="addrow" style="margin-top:8px;align-items:center"><select id="spConv" style="flex:1">${[1,2,3,4,5].filter(l=>(spellSlots(c)[l]||0)>0).map(l=>`<option value="${l}">Level ${l}</option>`).join('')}</select>
        <button class="btn ghost sm" id="spSlotToPts">Slot → pts</button><button class="btn ghost sm" id="spPtsToSlot">Pts → slot</button></div>
      <p class="muted" style="font-size:11px;margin:8px 0 0">Convert: spend a slot to gain points equal to its level, or spend points (L1 = 2, L2 = 3, L3 = 5, L4 = 6, L5 = 7) to recover a spent slot (up to 5th). Points refresh on a long rest.</p></div>`; }
    return '';
  })()}

  ${effectsCard(c)}

  <div class="card">
    <h2>${chev('spellbook')}Spellbook <span class="muted" style="text-transform:none;font-size:11px">— ${c.spells.length} known${isPrepCaster(c)?` · prepared ${preparedCount(c)}/${preparedMax(c)}`:''} · ⚡ = cast</span>${isPrepCaster(c)?`<button class="btn ghost sm" id="prepBtn" style="float:right">📋 Prepare</button>`:''}</h2>
    ${isPrepCaster(c)?`<p class="muted" style="font-size:11.5px;margin:0 0 6px">Your spellbook is everything you <i>know</i>; each day you <b>prepare</b> up to <b>${preparedMax(c)}</b> of them (📋 Prepare). Only prepared spells (and cantrips) can be cast.${preparedCount(c)>preparedMax(c)?' <span style="color:var(--bad)">Over your limit!</span>':''}</p>`:''}
    <div class="addrow">
      <select id="sp_pick" style="flex:2">
        <option value="">— add a ${esc(c.cls)} spell —</option>
        ${(()=>{ const known=new Set(c.spells.map(s=>s.name.toLowerCase())); const mx=maxSpellLevel(c); return [0,1,2,3,4,5,6,7,8,9].filter(l=>l<=mx).map(l=>{ const list=classSpells(c).filter(s=>s.l===l && !known.has(s.n.toLowerCase())); if(!list.length) return ''; return `<optgroup label="${l===0?'Cantrips':'Level '+l}">`+list.map(s=>`<option value="${esc(s.n)}|${s.l}">${SCHOOL_ICON[s.s]} ${esc(s.n)}</option>`).join('')+`</optgroup>`; }).join(''); })()}
        <option value="__custom__">+ Custom spell…</option>
      </select>
      <button class="btn sm" id="addSpell">Add</button>
    </div>
    <div class="muted" id="spPickDesc" style="font-size:12px;margin:2px 0 0;line-height:1.5"></div>
    <div class="addrow" id="customSpellRow" style="display:none">
      <input id="sp_name" placeholder="Custom spell name">
      ${select('sp_level', ['Cantrip','1','2','3','4','5','6','7','8','9'], 'Cantrip')}
      <button class="btn sm" id="addCustomSpell">Add</button>
    </div>
    <div style="margin-top:6px">
      ${collapsed.spellbook?'<div class="collapsed-note">'+c.spells.length+' spells hidden — tap ▸ to expand</div>': c.spells.length? [0,1,2,3,4,5,6,7,8,9].map(l=>{
        if(!byLvl[l].length) return '';
        return `<div style="margin-top:10px"><div class="tag" style="display:inline-block;margin-bottom:4px">${l===0?'Cantrips':'Level '+l}</div>`+
          byLvl[l].map(({s,i})=>`
          <div class="spell">
            <input type="checkbox" class="chk" data-prep="${i}" ${s.prepared?'checked':''} title="Prepared">
            <span style="font-size:18px;flex:none" title="${spellMeta(s.name)?SCHOOL_NAME[spellMeta(s.name).s]:''}">${spellIcon(s.name)}</span>
            <div class="nm"><b>${esc(s.name)}</b>${SPELL_DESC[s.name]?`<small>${esc(SPELL_DESC[s.name])}</small>`:''}<small style="opacity:.7">${spellDesc(s.name, s.level)}${SPELL_EFFECTS[s.name]?' · ⏱ trackable':''}${s.notes?' · '+esc(s.notes):''}</small></div>
            <button class="del" data-cast="${esc(s.name)}|${s.level||0}" title="Cast — spend a slot${SPELL_EFFECTS[s.name]?' & track its effect':''}" style="color:var(--accent)">⚡</button>
            <button class="del" data-spellinfo="${esc(s.name)}" title="Info">ⓘ</button>
            <button class="del" data-delspell="${i}">✕</button>
          </div>`).join('')+`</div>`;
      }).join('') : '<div class="empty">No spells yet. Add cantrips and spells above.</div>'}
    </div>
  </div>`;

  $('#restBtn').addEventListener('click',()=>{
    for(let l=1;l<=9;l++) if(c.slots[l]) c.slots[l].used=0;
    c.hp.cur=c.hp.max; c.hp.temp=0; c.death={succ:0,fail:0};   // temp HP ends when a long rest ends (PHB)
    const hd=parseHitDice(c);                 // long rest: regain half your hit dice
    if(hd) c.hitDice.used=Math.max(0,(c.hitDice.used||0)-Math.max(1,Math.floor(hd.count/2)));
    c.exhaustion=Math.max(0,(c.exhaustion||0)-1);  // a long rest removes 1 exhaustion
    c.actionSurgeUsed=false;   // Action Surge recharges on a long rest too
    c.arcaneRecovered=false;   // Arcane Recovery is once per day
    c.luckUsed=0;              // Lucky feat: 3 luck points refresh on a long rest
    if(sorcMax(c)) c.sorcPts=sorcMax(c);   // sorcery points refresh
    if(isEchoKnight(c,3)){ c.echoIncarnationLeft=echoResourceMax(c); }   // Unleash Incarnation: long rest only
    if(isEchoKnight(c,7)) c.echoAvatarUsed=false;
    if(isEchoKnight(c,10)) c.shadowMartyrUsed=false;
    c.healerFeatSpent=false;   // same target-side restriction as the short-rest reset above
    if(hasFeat(c,'Inspiring Leader')) c.inspiringLeaderUsed=false;
    if(isEchoKnight(c,15)) c.echoReclaimLeft=echoResourceMax(c);         // Reclaim Potential: long rest only
    if(c.cls==='Bard') c.bardicInspLeft=bardicInspMax(c);   // Bardic Inspiration always refills on a long rest, Font of Inspiration just adds short rest too
    if(c.cls==='Cleric' && (Number(c.level)||1)>=2) c.channelDivinityLeft=channelDivinityMax(c);   // Channel Divinity: long rest too
    if(superiorityDiceMax(c)) c.superiorityDiceLeft=superiorityDiceMax(c);   // Battle Master/Martial Adept: long rest too
    if(c.cls==='Druid' && (Number(c.level)||1)>=2) c.wildShapeLeft=wildShapeMax(c);   // Wild Shape: long rest too
    if(c.cls==='Monk' && (Number(c.level)||1)>=2) c.kiLeft=kiMax(c);   // Ki: long rest too
    if(isFiendWarlock(c,6)) c.darkOneLuckUsed=false;   // Dark One's Own Luck: long rest too
    if(isFiendWarlock(c,14)) c.hurlThroughHellUsed=false;   // Hurl Through Hell: long rest only
    if(isEvocationWizard(c,14)) c.overchannelUses=0;   // Overchannel: backlash counter resets on a long rest
    c.featFreeCastUsed={};   // Fey Touched/Shadow Touched/Magic Initiate: once/day free casts, approximated as once/long rest
    if(c.cls==='Paladin' && (Number(c.level)||1)>=3) c.paladinCDLeft=paladinCDMax(c);   // Paladin Channel Divinity: long rest too
    if(c.cls==='Paladin'){ c.divineSenseLeft=divineSenseMax(c); c.layOnHandsLeft=layOnHandsMax(c); }   // long rest only (PHB)
    if(isDevotionPaladin(c,20)) c.holyNimbusUsed=false;   // once per long rest
    if(c.cls==='Monk' && (Number(c.level)||1)>=6) c.wholenessUsed=false;   // Wholeness of Body: long rest only
    // Tranquility (11th): grants the real Sanctuary EFFECT (same name, same dc field every
    // existing Sanctuary check already reads — sanctuaryDC, dmOpportunityAttack's block, etc.
    // all recognize it for free) rather than a parallel Tranquility-named effect. Like this
    // app's own Sanctuary SPELL, it doesn't auto-end when you attack/cast (no such hook exists
    // anywhere in this codebase yet) — a pre-existing simplification, not a new gap.
    if(isOpenHandMonk(c,11)) addEffect(c,'Sanctuary',{rounds:null, dc:kiDC(c), note:'Tranquility — lasts until your next long rest.'});
    logChange(c, 'Long rest — HP, slots & hit dice restored');
    save(); render();
    flashBanner('Long rest — HP, slots & hit dice restored');
  });
  { const ar=$('#arcRec'); if(ar) ar.onclick=()=>{ if(c.arcaneRecovered) return; let budget=Math.ceil((Number(c.level)||1)/2); const auto=spellSlots(c);
    for(let l=5;l>=1;l--){ while(budget>=l && c.slots[l] && (c.slots[l].used||0)>0 && (auto[l]||0)>0){ c.slots[l].used--; budget-=l; } }
    c.arcaneRecovered=true; logChange(c,'☾ Arcane Recovery — slots restored'); save(); render(); flashBanner('Arcane Recovery — slots restored'); }; }
  { const pr=$('#pactRest'); if(pr) pr.onclick=()=>{ for(let l=1;l<=9;l++) if(c.slots[l]) c.slots[l].used=0; logChange(c,'☾ Short rest — pact slots recovered'); save(); render(); flashBanner('Pact slots recovered'); }; }
  { const up=$('#spUp'), dn=$('#spDown'); if(up) up.onclick=()=>{ c.sorcPts=Math.min(sorcMax(c), sorcCur(c)+1); save(); render(); }; if(dn) dn.onclick=()=>{ c.sorcPts=Math.max(0, sorcCur(c)-1); save(); render(); }; }
  { const st=$('#spSlotToPts'); if(st) st.onclick=()=>{ const l=Number(($('#spConv')||{}).value)||1; const t=spellSlots(c)[l]||0, u=Math.min(t,(c.slots[l]&&c.slots[l].used)||0);
    if(t-u<=0){ flashBanner('No level '+l+' slot available to convert'); return; }
    if(!c.slots[l]) c.slots[l]={total:0,used:0}; c.slots[l].used=u+1; c.sorcPts=Math.min(sorcMax(c), sorcCur(c)+l); logChange(c,'Font of Magic: L'+l+' slot → '+l+' sorcery points'); save(); render(); }; }
  { const ps=$('#spPtsToSlot'); if(ps) ps.onclick=()=>{ const l=Number(($('#spConv')||{}).value)||1; const cost=({1:2,2:3,3:5,4:6,5:7})[l]; const t=spellSlots(c)[l]||0, u=Math.min(t,(c.slots[l]&&c.slots[l].used)||0);
    if(!cost){ flashBanner('Only slots up to level 5'); return; }
    if(sorcCur(c)<cost){ flashBanner('Need '+cost+' sorcery points'); return; }
    if(u<=0){ flashBanner('No spent level '+l+' slot to recover'); return; }
    c.slots[l].used=u-1; c.sorcPts=sorcCur(c)-cost; logChange(c,'Font of Magic: '+cost+' points → L'+l+' slot'); save(); render(); }; }
  app.querySelectorAll('[data-slotpip]').forEach(el=>el.addEventListener('click',()=>{
    const l=el.dataset.slotpip, n=Number(el.dataset.n);
    const total=spellSlots(c)[l]||0;
    if(!c.slots[l]) c.slots[l]={total:0,used:0};
    const used=Math.min(total, c.slots[l].used||0), available=total-used;
    if(n<=available) c.slots[l].used = Math.min(total, used+1);   // spend
    else c.slots[l].used = Math.max(0, used-1);                    // recover
    save(); render();
  }));
  $('#sp_pick').addEventListener('change',e=>{
    $('#customSpellRow').style.display = e.target.value==='__custom__' ? 'flex' : 'none';
    const n=(e.target.value||'').split('|')[0]; const d=$('#spPickDesc');
    if(d) d.textContent=(n && n!=='__custom__')?(SPELL_DESC[n]||'No reference summary.'):'';
  });
  $('#addSpell').addEventListener('click',()=>{
    const v=$('#sp_pick').value;
    if(!v || v==='__custom__'){ if(v==='__custom__') $('#sp_name').focus(); return; }
    const [name,lvl]=v.split('|'); addSpellTo(c, name, Number(lvl));
  });
  $('#addCustomSpell').addEventListener('click',()=>{
    const name=$('#sp_name').value.trim(); if(!name) return;
    const lv=$('#sp_level').value; addSpellTo(c, name, lv==='Cantrip'?0:Number(lv));
  });
  { const pb=$('#prepBtn'); if(pb) pb.onclick=()=>openPrepare(c); }
  app.querySelectorAll('[data-prep]').forEach(el=>el.addEventListener('change',e=>{
    const idx=Number(el.dataset.prep);
    if(e.target.checked && isPrepCaster(c) && (c.spells[idx].level||0)>0 && preparedCount(c)>=preparedMax(c)){ e.target.checked=false; flashBanner('At your prepared limit ('+preparedMax(c)+') — unprepare one first'); return; }
    c.spells[idx].prepared=e.target.checked; save(); render();
  }));
  app.querySelectorAll('[data-delspell]').forEach(el=>el.addEventListener('click',()=>{
    c.spells.splice(Number(el.dataset.delspell),1); save(); render();
  }));
  app.querySelectorAll('[data-cast]').forEach(el=>el.addEventListener('click',()=>{
    const [n,l]=el.dataset.cast.split('|'); castModal(c, n, Number(l));
  }));
  bindEffectsCard(c);
}

function renderItems(c){
  app.innerHTML = `
  <div class="card">
    <h2>Currency</h2>
    <div class="currency">
      ${['cp','sp','ep','gp','pp'].map(k=>`
        <div><div class="lab">${k.toUpperCase()}</div><input type="number" id="cur_${k}" value="${c.currency[k]}" min="0"></div>
      `).join('')}
    </div>
    <div class="row2" style="margin-top:12px">
      <button class="btn" id="shopBtn">🛒 Shop</button>
      <button class="btn ghost" id="packBtn">🎒 Adventurer's pack</button>
    </div>
  </div>
  ${c.goodberries?`<div class="card">
    <h2>🫐 Goodberries — ${c.goodberries} left</h2>
    <p class="muted" style="font-size:12px;margin:0 0 8px">Each restores 1 HP when eaten — action, one at a time.</p>
    <button class="btn block" id="eatBerry"${c.hp.cur>=c.hp.max?' disabled':''}>🫐 Eat a Goodberry (+1 HP)</button>
  </div>`:''}

  <div class="card">
    <h2>${chev('equip')}Equipment <span class="muted" style="text-transform:none;font-size:11px">— equipped gear changes your stats</span></h2>
    ${collapsed.equip?'<div class="collapsed-note">hidden — tap ▸ to expand</div>':(()=>{
      const eq=c.items.map((it,i)=>({it,i})).filter(o=>o.it.kind&&o.it.kind!=='gear');
      if(!eq.length) return '<div class="empty">No weapons or armor yet. Add some below.</div>';
      return eq.map(({it,i})=>{ const w=it.kind==='weapon'?(weaponByName(it.name)||{}):null;
        const stats = it.kind==='weapon'?((w.dmg||'')+' '+(w.dt||'')+' · '+(w.rng||'5 ft'))
          : it.kind==='armor'?('AC '+(armorDef(it.armorKey).base)+(armorDef(it.armorKey).dexCap<99?' + DEX≤'+armorDef(it.armorKey).dexCap:' + DEX'))
          : it.kind==='shield'?'+2 AC'
          : (modSummary(it.mods)||esc(it.notes||''));
        return `<div class="spell" ${it.equipped?'style="box-shadow:inset 0 0 0 1px var(--accent);border-radius:8px"':''}>
          <span style="flex:none">${itemEmblem(itemIconKey(it),4)}</span>
          <div class="nm"><b>${esc(it.name)}${it.equipped?' <span class="sub" style="color:var(--accent)">✓ equipped</span>':''}${it.attuned?' <span class="sub" style="color:var(--gold)">✦ attuned</span>':''}</b><small>${esc(stats)}</small></div>
          <button class="btn ghost sm" data-equip="${i}">${it.equipped?'Unequip':'Equip'}</button>
          ${it.requiresAttunement?`<button class="btn ghost sm" data-attune="${i}">${it.attuned?'End attune':'Attune'}</button>`:''}
          <button class="del" data-delitem="${i}">✕</button>
        </div>`; }).join('');
    })()}
    <div class="addrow">
      <select id="eq_pick" style="flex:2">
        <option value="">— add equipment —</option>
        <optgroup label="Weapons (Simple)">${WEAPONS.filter(w=>w.cat==='Simple').map(w=>`<option value="w|${esc(w.n)}">${esc(w.n)} (${w.dmg} ${w.dt})</option>`).join('')}</optgroup>
        <optgroup label="Weapons (Martial)">${WEAPONS.filter(w=>w.cat==='Martial').map(w=>`<option value="w|${esc(w.n)}">${esc(w.n)} (${w.dmg} ${w.dt})</option>`).join('')}</optgroup>
        <optgroup label="Armor">${ARMOR.filter(a=>a.key!=='none').map(a=>`<option value="a|${a.key}">${esc(a.name)} (AC ${a.base})</option>`).join('')}</optgroup>
        <optgroup label="Shield"><option value="s|Shield">Shield (+2 AC)</option></optgroup>
      </select>
      <button class="btn sm" id="eqAdd">Add</button>
    </div>
    <div class="card" style="margin:10px 0 0;padding:10px">
      <h2 style="font-size:12px">🪄 Magic items <span class="muted" style="text-transform:none;font-size:11px">— ${attunedCount(c)}/3 attuned</span></h2>
      <div class="addrow">
        <select id="mi_pick" style="flex:2">
          <option value="">— add a magic item —</option>
          ${MAGIC_ITEMS.map((m,i)=>`<option value="${i}">${esc(m.name)} (${m.rarity}${m.requiresAttunement?', attunement':''})</option>`).join('')}
        </select>
      </div>
      <div id="mi_targetRow" style="display:none" class="addrow">
        <select id="mi_target" style="flex:2"></select>
      </div>
      <div class="muted" id="mi_desc" style="font-size:12px;margin:6px 0"></div>
      <button class="btn sm block" id="miAdd" disabled>Add</button>
    </div>
    <div class="addrow" style="margin-top:10px">
      <input id="eqw_name" placeholder="Custom magic item (e.g. Deck of Illusions)">
      <input id="eqw_ac" type="number" placeholder="+AC" style="max-width:64px">
      <button class="btn sm" id="eqwAdd">Add</button>
    </div>
  </div>

  <div class="card">
    <h2>🐴 Mounts <span class="muted" style="text-transform:none;font-size:11px">— which ones you actually own</span></h2>
    <p class="muted" style="font-size:12px;margin:0 0 8px">Tap to mark a mount as owned — the in-combat "Mount Up" option only offers mounts you own here (a real Find Steed/similar spell can still summon one regardless).</p>
    <div class="chips">${MOUNT_CATALOG.map(m=>`<button class="chip ${(c.ownedMounts||[]).includes(m.id)?'on':''}" data-ownmount="${m.id}">${m.label}</button>`).join('')}</div>
  </div>

  <div class="card">
    <h2>${chev('items')}Inventory ${(()=>{const g=c.items.filter(it=>!it.kind||it.kind==='gear');return g.length?`<span class="muted" style="text-transform:none;font-size:11px">— ${g.length}</span>`:'';})()}</h2>
    <div id="itemList">
      ${(()=>{ const g=c.items.map((it,i)=>({it,i})).filter(o=>!o.it.kind||o.it.kind==='gear');
        if(collapsed.items) return '<div class="collapsed-note">'+g.length+' items hidden — tap ▸ to expand</div>';
        if(!g.length) return '<div class="empty">No items yet.</div>';
        return g.map(({it,i})=>`
        <div class="spell">
          <div class="nm"><b>${esc(it.name)}</b>${it.notes?`<small>${esc(it.notes)}</small>`:''}</div>
          <span class="tag">×${it.qty||1}</span>
          <button class="del" data-delitem="${i}">✕</button>
        </div>`).join(''); })()}
    </div>
    <div class="addrow">
      <input id="it_name" placeholder="Item">
      <input id="it_qty" type="number" min="1" value="1" style="max-width:70px">
      <input id="it_notes" placeholder="notes (optional)">
      <button class="btn sm" id="addItem">Add</button>
    </div>
  </div>`;

  ['cp','sp','ep','gp','pp'].forEach(k=>$('#cur_'+k).addEventListener('change',e=>{
    c.currency[k]=Number(e.target.value)||0; save();
  }));
  $('#shopBtn').addEventListener('click',()=>openShop(c));
  $('#packBtn').addEventListener('click',()=>{ addEssentials(c); logChange(c,'Added adventurer pack'); save(); render(); flashBanner('Added adventurer pack'); });
  { const eb=$('#eatBerry'); if(eb) eb.addEventListener('click',()=>{
    if(!c.goodberries) return;
    c.goodberries--; applyHp(c,1); logChange(c,'🫐 Ate a Goodberry (+1 HP)'); save(); render(); flashBanner('🫐 +1 HP ('+c.goodberries+' berries left)');
    if(net&&net.role==='player') playerHello();
  }); }
  $('#addItem').addEventListener('click',()=>{
    const name=$('#it_name').value.trim(); if(!name) return;
    c.items.push({name, qty:Number($('#it_qty').value)||1, notes:$('#it_notes').value.trim(), kind:'gear'});
    save(); render();
  });
  $('#eqAdd').addEventListener('click',()=>{
    const v=$('#eq_pick').value; if(!v) return; const [t,key]=v.split('|');
    if(t==='w'){ const w=weaponByName(key); if(w) c.items.push({name:w.n, kind:'weapon', qty:1, equipped:false}); }
    else if(t==='a'){ const a=armorDef(key); c.items.push({name:a.name, kind:'armor', armorKey:key, qty:1, equipped:false}); }
    else if(t==='s'){ c.items.push({name:'Shield', kind:'shield', qty:1, equipped:false}); }
    save(); render();
  });
  $('#eqwAdd').addEventListener('click',()=>{
    const name=$('#eqw_name').value.trim(); if(!name) return; const ac=Number($('#eqw_ac').value)||0;
    c.items.push({name, kind:'wondrous', qty:1, equipped:false, mods: ac?{ac}:{}});
    save(); render();
  });
  app.querySelectorAll('[data-ownmount]').forEach(el=>el.addEventListener('click',()=>{
    const id=el.dataset.ownmount; c.ownedMounts=c.ownedMounts||[];
    const i=c.ownedMounts.indexOf(id);
    if(i>=0) c.ownedMounts.splice(i,1); else c.ownedMounts.push(id);
    logChange(c, (i>=0?'No longer owns a ':'Now owns a ')+(MOUNT_CATALOG.find(m=>m.id===id)||{}).name);
    save(); render();
  }));
  { const mp=$('#mi_pick'), tRow=$('#mi_targetRow'), tSel=$('#mi_target'), desc=$('#mi_desc'), addBtn=$('#miAdd');
    function refresh(){
      const idx=mp.value; const m=idx!==''?MAGIC_ITEMS[Number(idx)]:null;
      if(!m){ tRow.style.display='none'; desc.textContent=''; addBtn.disabled=true; return; }
      desc.textContent=m.desc;
      const tk=magicItemTargetKind(m);
      if(tk){
        const cands=c.items.map((it,i)=>({it,i})).filter(o=>o.it.kind===tk);
        tRow.style.display='';
        tSel.innerHTML = cands.length ? cands.map(({it,i})=>`<option value="${i}">${esc(it.name)}</option>`).join('') : `<option value="">— none, add a ${tk} first —</option>`;
        addBtn.disabled = !cands.length;
      } else { tRow.style.display='none'; addBtn.disabled=false; }
    }
    mp.addEventListener('change', refresh);
    addBtn.addEventListener('click',()=>{
      const idx=mp.value; const m=idx!==''?MAGIC_ITEMS[Number(idx)]:null; if(!m) return;
      const tk=magicItemTargetKind(m);
      let ok=false, targetName='';
      if(tk==='weapon'){ const ti=Number(tSel.value); targetName=(c.items[ti]||{}).name; ok=enchantWeapon(c,ti,m.weaponBonus); }
      else if(tk==='armor'||tk==='shield'){ const ti=Number(tSel.value); targetName=(c.items[ti]||{}).name; ok=enchantArmorLike(c,ti,m.mods.ac); }
      else ok=addWondrousItem(c,m);
      if(!ok) return;
      logChange(c, tk ? ('Enchanted '+targetName+' as a '+m.name) : ('Added '+m.name+' to inventory'));
      render();
      if(tk) flashBanner(targetName+' is now a '+m.name);
    });
  }
  app.querySelectorAll('[data-equip]').forEach(el=>el.addEventListener('click',()=>{
    const i=Number(el.dataset.equip); setEquipped(c, i, !c.items[i].equipped);
  }));
  app.querySelectorAll('[data-attune]').forEach(el=>el.addEventListener('click',()=>{
    const i=Number(el.dataset.attune); if(toggleAttune(c,i)) render();
  }));
  app.querySelectorAll('[data-delitem]').forEach(el=>el.addEventListener('click',()=>{
    const i=Number(el.dataset.delitem); const it=c.items[i];
    if(it && it.equipped){ setEquipped(c, i, false); }
    c.items.splice(i,1); save(); render();
  }));
}

function renderNotes(c){
  app.innerHTML = `
  <div class="card">
    <h2>Features & Traits</h2>
    <textarea id="nt_features" style="min-height:160px" placeholder="Class features, racial traits, feats…">${esc(c.features)}</textarea>
  </div>
  <div class="card">
    <h2>Notes & Backstory</h2>
    <textarea id="nt_notes" style="min-height:200px" placeholder="Allies, quests, backstory, anything…">${esc(c.notes)}</textarea>
  </div>
  <div class="card">
    <div class="row between" style="margin-bottom:8px">
      <h2 style="margin:0">Change Log ${(c.log&&c.log.length)?`<span class="muted" style="text-transform:none;font-size:11px">— ${c.log.length}</span>`:''}</h2>
      ${(c.log&&c.log.length)?'<button class="btn ghost sm" id="clearLog">Clear</button>':''}
    </div>
    ${(c.log&&c.log.length)? c.log.slice(0,80).map(e=>`<div class="listrow"><div class="nm" style="font-size:13px">${esc(e.m)}</div><div class="sub" style="white-space:nowrap">${fmtLogTime(e.t)}</div></div>`).join('') : '<div class="empty">Nothing logged yet. Level-ups, spells, feats, damage, rests and conditions will appear here.</div>'}
  </div>
  <div class="card">
    <h2>Backup</h2>
    <p class="muted" style="font-size:13px;margin-top:0">Export all characters to a file, or import a backup.</p>
    <div class="row2">
      <button class="btn ghost" id="exportBtn">⬇ Export</button>
      <button class="btn ghost" id="importBtn">⬆ Import</button>
    </div>
    <input type="file" id="importFile" accept="application/json" style="display:none">
    <div class="divider" style="height:1px;background:var(--line);margin:14px 0"></div>
    <button class="btn bad block" id="resetAllBtn">Reset app — delete ALL data</button>
    <p class="muted" style="font-size:11px;text-align:center;margin:14px 0 0">Grimoire ${APP_VERSION} · works offline</p>
  </div>`;

  $('#nt_features').addEventListener('change',e=>{ c.features=e.target.value; save(); });
  $('#nt_notes').addEventListener('change',e=>{ c.notes=e.target.value; save(); });
  { const cl=$('#clearLog'); if(cl) cl.addEventListener('click',()=>{ if(confirm('Clear the change log?')){ c.log=[]; save(); render(); } }); }
  $('#exportBtn').addEventListener('click',exportData);
  $('#importBtn').addEventListener('click',()=>$('#importFile').click());
  $('#resetAllBtn').addEventListener('click',resetAllData);
  $('#importFile').addEventListener('change',importData);
}

function bind(id, field){
  $('#'+id).addEventListener('change',e=>{ cur()[field]=e.target.value; save(); renderHeader(); });
}

function bindNum(id, field){
  $('#'+id).addEventListener('change',e=>{ cur()[field]=Number(e.target.value)||0; save(); render(); });
}

function bindSelectCustom(id, field){
  const sel=$('#'+id+'_sel'), cust=$('#'+id+'_cust');
  sel.addEventListener('change',()=>{
    if(sel.value==='Custom…'){ cust.style.display=''; cust.focus(); cur()[field]=cust.value||''; save(); renderHeader(); }
    else { cust.style.display='none'; cur()[field]= sel.value==='—'?'':sel.value; save(); render(); }
  });
  cust.addEventListener('input',()=>{ cur()[field]=cust.value; });
  cust.addEventListener('change',()=>{ cur()[field]=cust.value; save(); render(); });
}

function deleteCharacter(c){
  if(!confirm(`Delete "${c.name}"? This cannot be undone.`)) return;
  DB = DB.filter(x=>x.id!==c.id);
  curId = DB[0]?DB[0].id:null;
  localStorage.setItem(LS_CUR, curId||'');
  save(); render();
}

function createCharacterFlow(){
  const c=newCharacter();
  DB.push(c); curId=c.id; localStorage.setItem(LS_CUR,curId);
  wiz={step:0}; tab='char'; save(); render();
  setTimeout(()=>{ const n=$('#wz_name'); if(n){ n.focus(); n.select(); } },60);
}

function renderRandomBuilder(){
  const Q=(key,label,opts)=>`<div class="field"><label>${label}</label><div class="seg" style="flex-wrap:wrap;gap:6px;background:none;border:0;padding:0">${opts.map(([v,l])=>`<button class="${rndAns[key]===v?'on':''}" data-rq="${key}" data-rv="${v}" style="flex:1 0 30%;background:${rndAns[key]===v?'var(--accent2)':'var(--panel2)'};border:1px solid var(--line);color:${rndAns[key]===v?'#f6efda':'var(--ink)'}">${l}</button>`).join('')}</div></div>`;
  $('#modalRoot').innerHTML=`<div class="modal" id="rndModal"><div class="sheet"><div class="grip"></div>
    <h2>🎲 Random Hero Forge</h2>
    <p class="muted" style="font-size:13px;margin:0 0 14px">Answer four questions and we'll roll up a complete character — abilities, skills, spells and a pixel portrait.</p>
    ${Q('style','How do you like to fight?',[['melee','⚔️ Up close'],['ranged','🏹 At range'],['sneaky','🗡️ Sneaky'],['caster','✨ Spells'],['support','✚ Support']])}
    <div class="field"><label>Exact class (optional — skips the style roll above)</label><select id="rndExactCls"><option value="">🎲 Random from style</option>${CLASSES.filter(k=>k!=='Other').map(k=>`<option value="${k}" ${rndAns.exactClass===k?'selected':''}>${k}</option>`).join('')}</select></div>
    ${Q('heritage','What heritage calls to you?',[['common','🧑 Common'],['fae','🧝 Fae'],['stout','🪓 Stout'],['fierce','👹 Fierce'],['exotic','🐾 Exotic']])}
    ${Q('vibe','Pick a vibe',[['heroic','🛡️ Heroic'],['dark','🌑 Mysterious'],['wild','🍃 Wild'],['clever','📚 Clever'],['charming','🎭 Charming']])}
    ${Q('power','How seasoned?',[['1','🌱 Level 1'],['5','⚔️ Level 5'],['10','🦁 Level 10'],['20','🐉 EPIC — Lv 20']])}
    <button class="btn block" id="rndForge" style="margin-top:6px">⚒ Forge my hero</button>
    <button class="btn ghost block" id="rndClose" style="margin-top:10px">Cancel</button>
  </div></div>`;
  $('#rndModal').onclick=e=>{ if(e.target.id==='rndModal') $('#modalRoot').innerHTML=''; };
  $('#rndClose').onclick=()=>{ $('#modalRoot').innerHTML=''; };
  document.querySelectorAll('[data-rq]').forEach(b=>b.addEventListener('click',()=>{ rndAns[b.dataset.rq]=b.dataset.rv; renderRandomBuilder(); }));
  { const ec=$('#rndExactCls'); if(ec) ec.onchange=()=>{ rndAns.exactClass=ec.value; }; }
  $('#rndForge').onclick=()=>{ $('#modalRoot').innerHTML=''; forgeRandom(rndAns); };
}

function forgeRandom(ans){
  const c=newCharacter();
  c.cls=ans.exactClass||rndPick(RND_CLASS[ans.style]||['Fighter']);
  let pool=(RND_RACE[ans.heritage]||RND_RACE.common).concat(RND_VIBE_RACE[ans.vibe]||[]).filter(r=>RACES.includes(r));
  c.race=rndPick(pool);
  c.background=rndPick(RND_BG[c.cls]||['Folk Hero']);
  c.level=Math.max(1,Math.min(20,Number(ans.power)||1)); c.abilMethod='array';
  applyClassDefaults(c);
  const prio=RND_PRIO[c.cls]||['str','con','dex','wis','cha','int'];
  prio.forEach((k,i)=>{ c.abilities[k]=STD_ARRAY[i]; });
  if((SUBCLASSES[c.cls]||[]).length) c.subclass=rndPick(SUBCLASSES[c.cls]);   // always give a subclass for a complete hero
  if(c.classes&&c.classes[0]) c.classes[0].subclass=c.subclass||'';
  // skills: prefer class-ability skills, fill up to budget
  const classAbils=new Set(prio.slice(0,3));
  const pref=shuffle(SKILLS.filter(s=>classAbils.has(s[2]))), rest=shuffle(SKILLS.filter(s=>!classAbils.has(s[2])));
  c.skillProf={}; [...pref,...rest].slice(0, skillBudget(c)).forEach(s=>c.skillProf[s[0]]=true);
  // resolve race/class choices so the sheet is complete (no "choices to make")
  if(c.race==='Half-Elf' || c.race==='Human (Variant)'){ prio.filter(k=>k!=='cha').slice(0,2).forEach(k=>c.asiBonus[k]=(c.asiBonus[k]||0)+1); c.raceDone=true; }
  if(c.race==='Dragonborn') c.dragon=rndPick(DRAGON_ANCESTRY);
  if(FIGHTING_STYLE_LEVEL[c.cls] && FIGHTING_STYLE_LEVEL[c.cls]<=c.level) c.fightingStyle=rndPick(FIGHTING_STYLES[c.cls]);
  c.feats=[{name:rndPick(RND_FEATS_SIMPLE)}];   // always give a starting feat for a complete hero
  // spend every ASI up to this level on the class's priority stats (+1 at a time, cap 20)
  asiLevels(c).filter(l=>l<=c.level).forEach(()=>{ for(let n=0;n<2;n++){ const k=prio.find(k=>abil(c,k)<20); if(k) c.asiBonus[k]=(c.asiBonus[k]||0)+1; } });
  const eo=expertiseOwed(c); if(eo>0) SKILLS.filter(s=>c.skillProf[s[0]]).slice(0,eo).forEach(s=>c.skillExp[s[0]]=true);
  // spells: cantrips at this level's count; at least one leveled spell of every castable
  // level (an epic hero walks in with 9th-level magic), then fill to a class-typical count
  if(isCaster(c)){ c.spells=[];
    shuffle(classSpells(c).filter(s=>s.l===0)).slice(0, cantripsKnownAt(c.cls,c.level)||cantripLimit(c)).forEach(s=>c.spells.push({name:s.n,level:0,prepared:false,notes:''}));
    const maxL=maxSpellLevel(c);
    const want = c.cls==='Wizard' ? Math.min(26, 4+2*c.level) : isPrepCaster(c) ? Math.max(spell1Limit(c), preparedMax(c)||0) : Math.min(15, c.level+3);
    const picks=[], have=new Set();
    for(let L=1;L<=maxL;L++){ const s=shuffle(classSpells(c).filter(x=>x.l===L))[0]; if(s&&!have.has(s.n)){ picks.push(s); have.add(s.n); } }
    shuffle(classSpells(c).filter(s=>s.l>=1&&s.l<=maxL)).forEach(s=>{ if(picks.length<want && !have.has(s.n)){ picks.push(s); have.add(s.n); } });
    picks.forEach(s=>c.spells.push({name:s.n,level:s.l,prepared:false,notes:''}));
    if(isPrepCaster(c)){ let left=preparedMax(c)||0; c.spells.filter(s=>s.level>0).forEach(s=>{ if(left>0){ s.prepared=true; left--; } }); }   // walk in with the day's spells prepared
    c.spells.sort((a,b)=>(a.level-b.level)||a.name.localeCompare(b.name));
  }
  grantStartingGold(c); forgeEquip(c); addEssentials(c);
  if(c.level>1) c.currency.gp=(c.currency.gp||0)+(c.level-1)*100;   // seasoned heroes carry more coin
  c.speed=defaultSpeed(c);
  const hp=autoHP(c)||c.hp.max; c.hp.max=hp; c.hp.cur=hp;
  c.name=randName(c.race);
  try{ c.portrait=spriteDataURL(RACE_PIX[c.race]||RACE_PIX._default, 22); }catch(e){}
  c.log=[]; logChange(c,'Forged by the Random Hero generator — '+(c.currency.gp||0)+' gp, gear equipped');
  DB.push(c); curId=c.id; localStorage.setItem(LS_CUR,curId);
  wiz=null; tab='char'; save(); render();
  flashBanner('Forged '+c.name+' — '+(c.level>=20?'🐉 EPIC ':c.level>1?'Lv '+c.level+' ':'')+c.race+' '+c.cls+'!');
}

function resetAllData(){
  if(!confirm('Delete ALL characters and reset the app on this device? This cannot be undone. (Consider Export first.)')) return;
  if(!confirm('Are you absolutely sure? Every character will be permanently erased.')) return;
  try{ localStorage.removeItem(LS_KEY); localStorage.removeItem(LS_CUR); }catch(e){}
  DB=[]; curId=null; wiz=null; tab='char';
  $('#modalRoot').innerHTML=''; render();
  flashBanner('All data reset');
}

function openAppMenu(){
  const c=cur();
  $('#modalRoot').innerHTML=`<div class="modal" id="menuModal"><div class="sheet"><div class="grip"></div>
    <h2>App &amp; Data</h2>
    <p class="muted" style="font-size:13px;margin:0 0 14px">${DB.length} character${DB.length===1?'':'s'} saved on this device · Grimoire ${APP_VERSION}</p>
    <button class="btn block" id="mnNew" style="margin-bottom:10px">＋ New character</button>
    <button class="btn ghost block" id="mnRandom" style="margin-bottom:10px">🎲 Random hero</button>
    <div class="row2" style="margin-bottom:10px">
      <button class="btn ghost" id="mnHost">🎲 Host (DM)</button>
      <button class="btn ghost" id="mnJoin">🔗 Join game</button>
    </div>
    <button class="btn block" id="mnQuick" style="margin-bottom:10px">⚔ Quick Battle (solo vs AI)</button>
    <div class="row2" style="margin-bottom:10px">
      <button class="btn ghost" id="mnLog">📜 Adventure log</button>
      <button class="btn ghost" id="mnSound">${soundOn?'🔊 Sound: on':'🔇 Sound: off'}</button>
    </div>
    <div class="row2" style="margin-bottom:10px">
      <button class="btn ghost" id="mnRollMode" title="Default for to-hit/damage/healing rolls — a link still lets you switch for any single roll">${rollMode==='manual'?'✎ Rolls: manual':'🎲 Rolls: auto'}</button>
    </div>
    <div class="row2">
      <button class="btn ghost" id="mnExport">⬇ Export backup</button>
      <button class="btn ghost" id="mnImport">⬆ Import backup</button>
    </div>
    <button class="btn ghost block" id="mnAI" style="margin-top:10px">🔮 AI Narrator ${aiKey()?'— connected ✓':'— add API key'}</button>
    <input type="file" id="mnImportFile" accept="application/json" style="display:none">
    <div style="height:1px;background:var(--line);margin:16px 0"></div>
    <button class="btn bad block" id="mnReset">🗑 Reset app — delete ALL data</button>
    <button class="btn ghost block" id="mnClose" style="margin-top:12px">Close</button>
  </div></div>`;
  const close=()=>{ $('#modalRoot').innerHTML=''; };
  $('#menuModal').onclick=e=>{ if(e.target.id==='menuModal') close(); };
  $('#mnClose').onclick=close;
  $('#mnNew').onclick=()=>{ close(); createCharacterFlow(); };
  { const ai=$('#mnAI'); if(ai) ai.onclick=()=>{ const k=prompt('🔮 AI Narrator — paste your Anthropic API key.\nStored only on this device; used to adjudicate narrative spells (Wish, Divination…) in plain language.\nLeave blank to disconnect.', aiKey());
    if(k==null) return; try{ if(k.trim()) localStorage.setItem('grimoire.aikey',k.trim()); else localStorage.removeItem('grimoire.aikey'); }catch(e){}
    flashBanner(k.trim()?'🔮 AI Narrator connected':'AI Narrator disconnected'); close(); }; }
  $('#mnRandom').onclick=()=>{ close(); openRandomBuilder(); };
  $('#mnLog').onclick=()=>{ close(); openLog(); };
  $('#mnHost').onclick=()=>{ close(); dmHost(); };
  $('#mnJoin').onclick=()=>{ close(); openJoin(); };
  $('#mnQuick').onclick=()=>{ close(); openQuickBattle(); };
  $('#mnSound').onclick=()=>{ soundOn=!soundOn; localStorage.setItem('grimoire.sound', soundOn?'on':'off'); if(soundOn) sfx('success'); openAppMenu(); };
  $('#mnRollMode').onclick=()=>{ rollMode=rollMode==='manual'?'auto':'manual'; localStorage.setItem('grimoire.rollmode',rollMode); openAppMenu(); };
  $('#mnExport').onclick=exportData;
  $('#mnImport').onclick=()=>$('#mnImportFile').click();
  $('#mnImportFile').addEventListener('change',e=>{ importData(e); close(); });
  $('#mnReset').onclick=resetAllData;
}

function importData(e){
  const file=e.target.files[0]; if(!file) return;
  const r=new FileReader();
  r.onload=()=>{
    try{
      const data=JSON.parse(r.result);
      // OLD format (pre-campaigns/maps backups already on people's devices): a bare character
      // array. NEW format: {v:1, characters, campaigns, maps}. Both stay importable forever.
      let chars, campData=null, mapData=null;
      if(Array.isArray(data)){ chars=data; }
      else if(data && Array.isArray(data.characters)){ chars=data.characters; campData=data.campaigns||null; mapData=data.maps||null; }
      else throw new Error('bad');
      if(!confirm('Import will merge this backup into your data. Existing characters/campaigns/maps are never overwritten — only new ones are added. Continue?')){ e.target.value=''; return; }
      const ids=new Set(DB.map(c=>c.id));
      let added=0;
      chars.forEach(c=>{ if(c && !ids.has(c.id)){ DB.push(ensureFields(c)); added++; } });
      save();
      let campAdded=0;
      if(campData){
        const all=campaigns();
        Object.keys(campData).forEach(name=>{ if(!(name in all)){ all[name]=campData[name]; campAdded++; } });
        try{ localStorage.setItem('grimoire.campaigns',JSON.stringify(all)); }catch(err){}
      }
      let mapAdded=0;
      if(mapData){
        const all=savedMaps();
        Object.keys(mapData).forEach(name=>{ if(!(name in all)){ all[name]=mapData[name]; mapAdded++; } });
        try{ localStorage.setItem('grimoire.maps',JSON.stringify(all)); }catch(err){}
      }
      render();
      alert('Imported '+added+' character(s)'+(campAdded?', '+campAdded+' campaign(s)':'')+(mapAdded?', '+mapAdded+' map(s)':'')+'. Anything already on this device with the same name/id was left untouched.');
    }catch(err){ alert('That file could not be read as a Grimoire backup.'); }
    e.target.value='';
  };
  r.readAsText(file);
}

function rotateMap(){ mapRotation=(mapRotation+1)%4; localStorage.setItem('grimoire.maprot',mapRotation); render(); }

function iso3dMountEl(){
  return document.querySelector('#tpModal #iso3dMount, #qstModal #iso3dMount, #stModal #iso3dMount, #qaModal #iso3dMount, .modal #iso3dMount')
    || document.getElementById('iso3dMount');
}

function syncIso3DHost(session, highlightOpts){
  if(!isoView||!iso3dView||!session||!session.map) return;
  const boot=()=>{
    const mount=iso3dMountEl();
    if(!mount) return false;
    if(!window.Iso3D||!window.Iso3D.Host) return false;
    try{
      bindIso3DEventsOnce();
      const hl=highlightOpts||{};
      const highlights={};
      // 5e move tints: blue = free move, red = Dash (action), amber/purple = jump/climb on path
      if(hl.reachCost){
        const move=new Set(), dash=new Set(), jump=new Set(), climb=new Set();
        const normal=hl.reachNormal!=null?hl.reachNormal:1e9;
        Object.keys(hl.reachCost).forEach(k=>{
          const fc=hl.reachCost[k]; if(!(fc>0)) return;
          const rm=hl.reachMeta&&hl.reachMeta[k];
          if(fc>normal) dash.add(k); else move.add(k);
          if(rm&&rm.jump) jump.add(k);
          if(rm&&rm.climb) climb.add(k);
        });
        highlights.move=move;
        highlights.dash=dash;
        highlights.jump=jump;
        highlights.climb=climb;
      }
      // Attack/spell range + AoE (Fireball etc.)
      // Bright = clear LoE (valid); dim rangeMax = full distance so 150 ft fireball isn't "tiny"
      if(hl.rangeTiles){
        highlights.attackRange = hl.rangeTiles instanceof Set ? hl.rangeTiles : new Set(hl.rangeTiles);
      } else if(hl.rangeFrom){
        const rf=hl.rangeFrom, needLos=rf.needLos!=null?rf.needLos:(rf.tiles>1);
        highlights.attackRange = buildRangeTileSet(session, rf.x, rf.y, rf.tiles, needLos);
      }
      if(hl.rangeMax){
        highlights.attackRangeMax = hl.rangeMax instanceof Set ? hl.rangeMax : new Set(hl.rangeMax);
      } else if(hl.rangeFrom){
        const rf=hl.rangeFrom;
        highlights.attackRangeMax = buildRangeMaxTileSet(session, rf.x, rf.y, rf.tiles);
      }
      if(hl.blastTiles){
        highlights.blast = hl.blastTiles instanceof Set ? hl.blastTiles : new Set(hl.blastTiles);
      } else if(hl.blast){
        highlights.blast = buildBlastTileSet(session, hl.blast.x, hl.blast.y, hl.blast.r);
      }
      // AoE radius shown with cast range; host follows cursor until center is locked
      if(hl.aoeR!=null) highlights.aoeR=hl.aoeR;
      if(hl.blastLocked!=null) highlights.blastLocked=!!hl.blastLocked;
      if(hl.aoePreview) highlights.aoePreview=hl.aoePreview;
      if(hl.targetInfo) highlights.targetInfo=hl.targetInfo;
      // Which enemies are legal targets (red reticle + unit-first click)
      if(hl.targets&&hl.targets.length){
        highlights.targetIds=new Set(hl.targets.map(String));
      } else if(highlights.attackRange&&session.monsters){
        // Auto: hostile monsters on a range tile (skip summons/allies)
        const tids=new Set();
        session.monsters.forEach(m=>{
          if(isHostile(m)&&m.x!=null&&highlights.attackRange.has(m.x+','+m.y)) tids.add(String(m.id));
        });
        if(tids.size) highlights.targetIds=tids;
      }
      if(session.players&&session.players[0]){
        const p=session.players[0];
        if(p.x!=null) highlights.selected={col:p.x,row:p.y};
      }
      const inModal=!!mount.closest('.modal');
      const mountKey=inModal?(mount.closest('.modal')&&mount.closest('.modal').id)||'modal':'main';
      const prevMount=window.__iso3dMountKey;
      const remounted=prevMount!==mountKey;
      window.__iso3dMountKey=mountKey;
      let host=window.__iso3dHost;
      if(host){
        host.attach(mount);
      }else{
        host=new window.Iso3D.Host(mount,{ assetBase:'' });
        window.__iso3dHost=host;
        window.__iso3dCamKeep=false;
      }
      host.setMapRotation(mapRotation);
      // Frame the player when: battle start (__iso3dForceFrame), first paint, remount, or
      // targeting modal. Prefer PC over map-center — map-center was the "lost in blue" bug.
      let frameOn=null;
      const p0=(session.players||[]).find(u=>u&&(u.id==='pc'||u.side==='pc'))||(session.players&&session.players[0]);
      const wantFrame=!!(window.__iso3dForceFrame||!window.__iso3dCamKeep||remounted);
      if(p0&&p0.x!=null&&wantFrame){
        frameOn={col:p0.x|0, row:p0.y|0, zoom:inModal?1.9:1.55};
        // Keep ForceFrame until frameOnCell succeeds (setSession / host may run before map is live)
      }
      host.setSession(session,{
        highlights:highlights,
        resetCamera:false, // never dump to map-center when we have a PC to frame
        frameOn:frameOn||undefined,
      });
      if(frameOn){
        // Confirm frame after layout; clear force only on success
        requestAnimationFrame(()=>{
          try{
            if(host.frameOnCell(frameOn.col, frameOn.row, frameOn.zoom)!==false){
              window.__iso3dCamKeep=true;
              window.__iso3dForceFrame=false;
            }
          }catch(e){}
        });
      } else if(!inModal){
        window.__iso3dCamKeep=true;
      }
      // NOTE: used to also call scrollMapToCell() here as a "2D scroll backup" — that
      // scrolls .mapwrap using classic-2D absolute pixel math sized to the full/uncapped
      // stage, which is now much bigger than the capped container, so it kept scrolling
      // .mapwrap by hundreds of px to "center" the PC. The WebGL canvas is position:fixed
      // and synced to the container's getBoundingClientRect() every frame (host.js), so
      // that scroll desynced it from its visible box (live report: "offset massively").
      // The 3D camera already centers via frameOnCell/setCameraFollowTarget above — this
      // legacy backup was actively fighting it, not helping hit-testing.
      host.onTileClick=(x,y,unit)=>{
        // Prefer the same mapgrid as this mount (modal or main)
        const root=mount.closest('.mapgrid')||mount.closest('.sheet')||document;
        // Unit-first: hit the monster's data-target cell even if terrain raycast differed
        if(unit&&unit.raw&&unit.source==='monster'){
          const mid=unit.raw.id;
          let el=root.querySelector('[data-target="'+mid+'"]')
            || document.querySelector('[data-target="'+mid+'"]');
          if(!el){
            const cx=unit.col!=null?unit.col:x, cy=unit.row!=null?unit.row:y;
            el=root.querySelector('.mcell[data-cell="'+cx+','+cy+'"]')
              || document.querySelector('.mcell[data-cell="'+cx+','+cy+'"]');
          }
          if(el){ el.click(); return; }
        }
        const el=root.querySelector('.mcell[data-cell="'+x+','+y+'"]')
          || document.querySelector('.mcell[data-cell="'+x+','+y+'"]');
        if(el) el.click();
      };
      // onUnitClick optional — _handleUp already routes unit hits through onTileClick with unit
      host.onUnitClick=null;
      mount.style.pointerEvents='auto';
      document.querySelectorAll('.mapgrid.iso3dmode .mcell').forEach(el=>{ el.style.pointerEvents='none'; });
      // REMOVED: this used to directly set host.glCanvas.width/height from mount.clientWidth/
      // clientHeight ("Force layout size after modal opens (0×0 mount = blue sky only)").
      // That assignment has NO devicePixelRatio scaling, while Renderer.syncSize() (which
      // runs every single frame, unthrottled) computes the buffer size as clientWidth*dpr —
      // a completely different number on any HiDPI display. Every render() call re-triggered
      // this rAF callback, so the two kept fighting: this patch forced the buffer down to the
      // raw un-scaled size, syncSize() corrected it back up to the dpr-scaled size the very
      // next frame, repeat — measured live via CDP as the canvas backing buffer oscillating
      // between two fixed sizes dozens of times per second during real play. Resizing a
      // canvas's width/height attribute unconditionally clears its drawing buffer per spec,
      // so this ping-pong was a direct, mechanical cause of real flickering — independent of
      // every WebGL/DOM/timing theory chased earlier tonight. syncSize() already runs every
      // frame and re-derives the correct size from the live CSS box, so it alone handles the
      // original "0×0 right after modal opens" case this patch was written for — no separate
      // one-shot correction needed, and this one was actively fighting the good one.
      if(host.renderer&&host.renderer.invalidateMap) host.renderer.invalidateMap();
    }catch(err){ console.error('[Iso3D] mount failed', err); flashBanner('Iso3D failed — see console'); }
    return true;
  };
  if(!boot()){
    let n=0; const t=setInterval(()=>{ if(boot()||++n>40) clearInterval(t); }, 50);
  } else {
    // Second pass after layout (modal sheet height settles) — camera preserved (no remount key change)
    requestAnimationFrame(()=>requestAnimationFrame(()=>{ try{ boot(); }catch(e){} }));
  }
}

function scrollMapToCell(x, y){
  try{
    const cell=document.querySelector('.mcell[data-cell="'+x+','+y+'"]');
    if(!cell) return false;
    const wrap=cell.closest('.mapwrap');
    if(!wrap){ try{ cell.scrollIntoView({block:'center', inline:'center', behavior:'auto'}); }catch(e){ cell.scrollIntoView(true); } return true; }
    const cr=cell.getBoundingClientRect(), wr=wrap.getBoundingClientRect();
    wrap.scrollLeft += (cr.left+cr.width/2) - (wr.left+wr.width/2);
    wrap.scrollTop  += (cr.top+cr.height/2) - (wr.top+wr.height/2);
    return true;
  }catch(e){ return false; }
}

function frameCameraOnCell(session, x, y, zoom){
  session=session||QB||(net&&net.session);
  if(!session||x==null||y==null) return;
  const z=zoom!=null?zoom:1.55;
  const gen=(window.__iso3dFrameGen=(window.__iso3dFrameGen||0)+1);
  window.__iso3dForceFrame=true;
  window.__iso3dCamKeep=false;
  let attempts=0;
  const tryFrame=()=>{
    if(gen!==window.__iso3dFrameGen) return true; // superseded by a newer frame request — stop retrying
    attempts++;
    scrollMapToCell(x|0, y|0);
    if(isoView&&iso3dView){
      const host=window.__iso3dHost;
      if(!host||typeof host.frameOnCell!=='function') return false;
      try{
        const ok=host.frameOnCell(x|0, y|0, z);
        if(ok===false) return false; // map not ready
        window.__iso3dCamKeep=true;
        window.__iso3dForceFrame=false;
        return true;
      }catch(e){ return false; }
    }
    // top-down / classic iso: scroll is enough once cell exists
    return !!document.querySelector('.mcell[data-cell="'+(x|0)+','+(y|0)+'"]');
  };
  if(tryFrame()) return;
  requestAnimationFrame(()=>{ if(!tryFrame()) requestAnimationFrame(tryFrame); });
  [50,120,250,450,800,1200].forEach(ms=>setTimeout(()=>{ if(gen===window.__iso3dFrameGen&&(window.__iso3dForceFrame||attempts<8)) tryFrame(); }, ms));
}

function dmHost(){
  loadPeer(()=>{
    const code=roomCode();
    let peer; try{ peer=new Peer('grimoire-dm-'+code,{debug:1}); }catch(e){ flashBanner('Could not start host'); return; }
    net={role:'dm', code, peer, conns:[], sel:null, session:{battle:{active:false,round:1}, map:{cols:10,rows:8,tiles:{}}, monsters:[], players:[], order:[], turn:0}};
    peer.on('open',()=>render());
    peer.on('error',e=>flashBanner('Host error: '+(e.type||e.message||e)));
    peer.on('disconnected',()=>{ try{ if(!peer.destroyed) peer.reconnect(); }catch(e){} });
    peer.on('connection',conn=>{
      conn.on('open',()=>{ net.conns.push(conn); dmBroadcast(); render(); });
      conn.on('data',d=>dmOnData(conn,d));
      conn.on('close',()=>{ net.conns=net.conns.filter(x=>x!==conn); const p=net.session.players.find(x=>x.id===conn.peer); if(p) p.online=false; render(); });   // keep the player (mark offline) so reconnect re-binds — no duplicates, position preserved
    });
    tab='char'; render();
  });
}

function dmOnData(conn,d){ if(!net||net.role!=='dm'||!d) return;
  if(d.t==='hello'||d.t==='charUpdate'){ const cid=d.char.cid;
    let p = cid ? net.session.players.find(x=>x.cid===cid) : net.session.players.find(x=>x.id===conn.peer);
    if(!p){ const idx=net.session.players.length, cols=net.session.map.cols||10; p={cid, id:conn.peer, x:idx%cols, y:Math.max(0,(net.session.map.rows||8)-1)}; net.session.players.push(p); }
    p.id=conn.peer; p.online=true;   // re-bind routing to the current connection (handles reconnects)
    Object.assign(p,{cid:cid||p.cid, name:d.char.name,cls:d.char.cls,level:d.char.level,hpCur:d.char.hpCur,hpMax:d.char.hpMax,ac:d.char.ac,init:d.char.init||0,conds:d.char.conds||[],sanctuaryDC:d.char.sanctuaryDC||null,holyAuraDC:d.char.holyAuraDC||null,stable:!!d.char.stable,deathFail:d.char.deathFail||0,hiddenDC:d.char.hiddenDC||null,shadowMartyrArmed:!!d.char.shadowMartyrArmed,cuttingWordsArmed:!!d.char.cuttingWordsArmed,wildShapeName:d.char.wildShapeName||null,healerFeatSpent:!!d.char.healerFeatSpent});
    dmBroadcast(); render();
  } else if(d.t==='attack'){ const mo=net.session.monsters.find(m=>m.id===d.mon); let dmg=d.dmg||0, mult=1; if(mo && d.dmg){ mult=monsterDmgMult(mo,d.dtype); dmg=Math.max(0,Math.round(d.dmg*mult)); mo.hp=Math.max(0,mo.hp-dmg); } const rv=mult===0?' (immune!)':mult===0.5?' (resisted)':mult===2?' (vulnerable!)':''; net.lastHit={who:d.who,mon:mo?mo.name:'?',dmg,hit:d.hit}; checkMountDeaths(net.session, ()=>{}); dmBroadcast(); render(); flashBanner((d.who||'A player')+(d.hit===false?' missed':' hit '+(mo?mo.name:'a monster')+' for '+dmg+rv)); }
  else if(d.t==='paintHazard'){ (SPELL_NOCAST_ZONE[d.name]?paintNoCastZone(net.session, d.ctr, d.aoeR, d.name):paintHazardTerrain(net.session, d.ctr, d.aoeR, d.name, d.dc)); dmBroadcast(); render(); }
  else if(d.t==='target'){ net.session.players.forEach(p=>{ if(p.id===conn.peer) p.target=d.mon; }); render(); }
  else if(d.t==='move'){ const p=net.session.players.find(x=>x.id===conn.peer); if(p){ p.x=d.x; p.y=d.y; p.placed=true;
    if(net.session.battle&&net.session.battle.active){ sendTerrainHazardCheck(net.session,p,d.x,d.y); sendTrapTriggerCheck(net.session,p,d.x,d.y); }
    dmBroadcast(); render(); } }
  else if(d.t==='endturn'){ const cur=net.session.order&&net.session.order[net.session.turn]; if(cur&&cur.id===conn.peer) dmNextTurn(); }
  else if(d.t==='moncond'){ const mo=net.session.monsters.find(m=>m.id===d.mon); if(mo){ mo.conds=mo.conds||[]; if(!mo.conds.some(x=>x.name===d.cond)) mo.conds.push({name:d.cond,rounds:d.rounds||10}); dmBroadcast(); render(); flashBanner(mo.name+' → '+d.cond); } }
  else if(d.t==='dispelMon'){ const mo=net.session.monsters.find(m=>m.id===d.mon); if(mo){ const n=dispelMonsterConds(mo); dmBroadcast(); render(); if(n) flashBanner(mo.name+' — '+n+' condition'+(n>1?'s':'')+' dispelled'); } }
  else if(d.t==='provoke'){ const p=net.session.players.find(x=>x.cid===d.cid)||net.session.players.find(x=>x.id===conn.peer);
    if(p){ (d.mons||[]).forEach(mid=>{ const mo=net.session.monsters.find(m=>m.id===mid); if(mo&&mo.hp>0&&!mo.reactionUsed) dmOpportunityAttack(mo,p); }); }
    render(); }
  // A connected player's own successful Shove-push against a monster (Prone/Grappled already
  // flow through the existing 'moncond' handler above unchanged — this is push-only, since
  // moving a monster's token needs the DM's authoritative map/tileClearFor check).
  else if(d.t==='shove'){ const mo=net.session.monsters.find(m=>m.id===d.mon); if(mo && tileClearFor(net.session,d.x,d.y)){ mo.x=d.x; mo.y=d.y; dmBroadcast(); render(); } }
  // Echo Knight — an Echo Knight's echo (manifest/move/swap/dismiss all funnel through here)
  // has to exist on the DM's OWN authoritative net.session.monsters, not just the player's
  // local mirror, so DM-controlled monsters can actually see/target/attack it (Shadow Martyr's
  // redirect below needs this) — every other echo mutation this session only ever touched the
  // player's own local copy (fine for QB, silently invisible to a real DM otherwise, exactly
  // the "wire it into DM-hosted too" gap flagged after Echo Knight first shipped).
  else if(d.t==='echoSync'){ const cid=conn.peer;
    let e=net.session.monsters.find(m=>m.echo && m.controllerId===cid);
    if(!d.exists){ if(e) net.session.monsters=net.session.monsters.filter(m=>m!==e); }
    else if(e){ e.x=d.x; e.y=d.y; e.ac=d.ac; e.hp=d.hp; e.max=d.max; }
    else { net.session.monsters.push({id:'echo_'+cid+'_'+Date.now().toString(36), side:'mon', ally:true, echo:true, controllerId:cid,
      base:'Echo', name:d.name||"Echo", x:d.x, y:d.y, hp:d.hp, max:d.max, ac:d.ac, atk:'', attacks:0, attacksLeft:0,
      speed:30, moveLeft:30, reactionUsed:false, brain:'passive', conds:[], facing:'down'}); }
    dmBroadcast(); render(); }
  // Mount sync — same shape as echoSync just above, looked up by controllerId not a shared id.
  else if(d.t==='mountSync'){ const cid=conn.peer;
    let m=net.session.monsters.find(x=>x.mount && x.controllerId===cid);
    if(!d.exists){ if(m) net.session.monsters=net.session.monsters.filter(x=>x!==m); }
    else if(m){ m.x=d.x; m.y=d.y; m.ac=d.ac; m.hp=d.hp; m.max=d.max; }
    else { net.session.monsters.push({id:'mount_'+cid+'_'+Date.now().toString(36), side:'mon', ally:true, mount:true, controllerId:cid, riderId:cid,
      base:d.mountName||'Mount', name:d.mountName||'Mount', x:d.x, y:d.y, hp:d.hp, max:d.max, ac:d.ac, atk:'', attacks:0, attacksLeft:0,
      speed:d.spd||30, moveLeft:d.spd||30, reactionUsed:false, brain:'passive', conds:[], facing:'down'}); }
    dmBroadcast(); render(); }
  // Stabilize targets ANOTHER connected player — the actor already rolled locally (see
  // maneuverStabilize) and only needs the DM to relay the result to the target's own device,
  // since that's the only device whose c.stable/death fields are real.
  else if(d.t==='stabilize'){ dmSend(d.targetId,{t:'stabilized', healHp:d.healHp||0}); const who=net.session.players.find(p=>p.id===conn.peer); flashBanner((who?who.name:'A player')+' stabilizes an ally'); }
  // Channel Divinity: Preserve Life healing ANOTHER connected player — same "can't mutate
  // another player's real character from here" reason as Stabilize above; relayed through the
  // existing generic 'apply' message (already used for DM-driven HP deltas) so the target's own
  // device applies it and resyncs itself via playerHello().
  // Generic "heal another connected player" relay — shared by Preserve Life and Lay on Hands
  // (any feature that heals someone other than the caster needs the same round-trip, since the
  // caster's device can't mutate another player's real HP directly). Reuses the existing
  // generic 'apply' message the same way Stabilize's own relay does.
  else if(d.t==='healApply'){ dmSend(d.targetId,{t:'apply', delta:d.amount}); const who=net.session.players.find(p=>p.id===conn.peer); flashBanner((who?who.name:'A player')+' heals an ally for '+d.amount+' HP'+(d.from?' ('+d.from+')':'')); }
  // Healer feat's heal action — same generic 'apply' relay as healApply above, just tagged so
  // the target's own device also flips its once-per-rest healerFeatSpent flag (that flag has
  // to live on the TARGET, so only the target's own device can actually set it — see
  // playerOnData's 'apply' handler).
  else if(d.t==='healerHeal'){ dmSend(d.targetId,{t:'apply', delta:d.amount, healerFeat:true}); const who=net.session.players.find(p=>p.id===conn.peer); flashBanner((who?who.name:'A player')+' uses Healer on an ally for '+d.amount+' HP'); }
  // Inspiring Leader temp HP — its own relay (not 'apply') since temp HP takes the HIGHER
  // value rather than adding, same distinction c.hp.temp gets everywhere else in this app.
  else if(d.t==='tempHpApply'){ dmSend(d.targetId,{t:'tempHpApplied', amount:d.amount}); const who=net.session.players.find(p=>p.id===conn.peer); flashBanner((who?who.name:'A player')+' grants temp HP to an ally'); }
  // A DM-controlled monster's Shove/Grapple against a connected player (see dmMonsterAttack) —
  // the targeted player's own device rolled its real Athletics/Acrobatics and applied the
  // effect to itself already (conditions sync back via the normal hello/moncond-style resync,
  // a push sends its own 'move'); this is purely so the DM's UI can show what happened.
  else if(d.t==='maneuverResult'){ const mo=net.session.monsters.find(m=>m.id===d.mon); const who=net.session.players.find(p=>p.id===conn.peer);
    flashBanner((who?who.name:'The player')+(d.hit?' is hit by ':' resists ')+(mo?mo.name:'the monster')+"'s "+(d.kind==='grapple'?'grapple':'shove')); render(); }
}

function dmOpportunityAttack(mo,p){
  if(mo.reactionUsed||mo.hp<=0) return;
  const a=parseMonsterAttacks(mo.atk).filter(a=>a.hit!=null && (a.tiles||1)<=1)[0] || {name:'Attack',hit:0,dmg:'1d6'};   // melee only
  mo.reactionUsed=true;
  const ev=Engine.applyAction(sessionAdapter, {type:'attack', actorId:mo.id, targetId:p.id, atk:{name:a.name, toHit:a.hit||0, dmg:a.dmg||'1d6', tiles:1}});
  if(ev.sanctuary&&ev.sanctuary.blocked){
    flashBanner('🛡️ Sanctuary — '+mo.name+" can't bring itself to attack "+p.name+' (Wis '+ev.sanctuary.roll+' vs DC '+ev.sanctuary.dc+')');
    dmBroadcast(); render(); return;
  }
  if(ev.hit && a.cond){ dmSend(p.id,{t:'cond',name:a.cond}); }
  sfx(ev.crit?'crit':ev.hit?'hit':'miss');
  pushRoll({label:'⚔ '+mo.name+' opportunity attack', total:ev.total, detail:'d20('+ev.d20+') +'+(a.hit||0)+' vs AC '+ev.ac+(ev.hit?' — '+ev.dmg+' dmg':' — miss'), crit:ev.crit?'crit':null, kind:'check'});
  flashBanner('⚔ Opportunity: '+mo.name+(ev.hit?' hits '+p.name+' for '+ev.dmg+(ev.holyAura&&ev.holyAura.blinded?' (blinded by Holy Aura)':''):' misses '+p.name));
  dmBroadcast(); render();
}

function rollInitiative(){ const s=net.session; const o=[];
  s.players.forEach(p=>o.push({k:'p',id:p.id,name:p.name,roll:rnd(20)+(p.init||0)}));
  s.monsters.forEach(m=>o.push({k:'m',id:m.id,name:m.name,roll:rnd(20)+(m.init||0)}));
  o.sort((a,b)=>b.roll-a.roll); s.order=o; s.turn=0; s.battle.round=1; s.monsters.forEach(m=>{ m.attacksLeft=m.attacks||1; m.moveLeft=speedBlocked(m)?0:(m.speed||30); m.reactionUsed=false; }); dmBroadcast(); render(); flashBanner('Initiative rolled'); }

function dmNextTurn(){ const s=net.session; if(!s.order||!s.order.length){ s.battle.round++; tickMonsterConds(); tickGasHazards(s); expireHazards(s); dmBroadcast(); render(); return; }
  const oldR=s.battle.round; let guard=0; do{ s.turn=((s.turn||0)+1)%s.order.length; if(s.turn===0) s.battle.round++; guard++; } while(guard<=s.order.length && orderDead(s.order[s.turn]));
  if(s.battle.round>oldR){ tickMonsterConds(); tickGasHazards(s); expireHazards(s); }
  dmRefreshActor(); dmBroadcast(); render(); frameCameraOnActiveUnit(s, 1.55); }

function dmPrevTurn(){ const s=net.session; if(!s.order||!s.order.length) return;
  let guard=0; do{ if((s.turn||0)===0){ s.turn=s.order.length-1; if(s.battle.round>1) s.battle.round--; } else s.turn--; guard++; } while(guard<=s.order.length && orderDead(s.order[s.turn]));
  dmBroadcast(); render(); flashBanner('Back to '+(s.order[s.turn]?s.order[s.turn].name:'previous')); frameCameraOnActiveUnit(s, 1.55); }

function dmExit(){ if(net&&net.campaign) saveCampaign(net.campaign,true); try{ net.peer.destroy(); }catch(e){} net=null; render(); }

function openJoin(){
  if(!DB.length){ flashBanner('Create a character first'); return; }
  $('#modalRoot').innerHTML=`<div class="modal" id="joinModal"><div class="sheet"><div class="grip"></div>
    <h2>🔗 Join a game</h2>
    <div class="field"><label>Room code from your DM</label><input id="joinCode" placeholder="e.g. K7Q2" autocapitalize="characters" style="text-transform:uppercase"></div>
    <div class="field"><label>Play as</label>${select('joinChar', DB.map(c=>c.name), (cur()||DB[0]).name)}</div>
    <button class="btn block" id="joinGo" style="margin-top:8px">Join</button>
    <button class="btn ghost block" id="joinClose" style="margin-top:10px">Cancel</button>
  </div></div>`;
  $('#joinClose').onclick=()=>{ $('#modalRoot').innerHTML=''; };
  $('#joinModal').onclick=e=>{ if(e.target.id==='joinModal') $('#modalRoot').innerHTML=''; };
  $('#joinGo').onclick=()=>{ const code=($('#joinCode').value||'').trim().toUpperCase(); if(code.length<4){ flashBanner('Enter the 4-letter code'); return; }
    const nm=$('#joinChar').value; const ch=DB.find(c=>c.name===nm)||DB[0]; $('#modalRoot').innerHTML=''; playerJoin(code, ch.id); };
}

function playerConnect(){ if(!net||net.role!=='player'||!net.peer) return;
  try{ if(net.conn && net.conn.open) return; }catch(e){}
  let conn; try{ conn=net.peer.connect('grimoire-dm-'+net.code,{reliable:true}); }catch(e){ scheduleReconnect(); return; }
  net.conn=conn;
  conn.on('open',()=>{ net.connected=true; playerHello(); render(); });
  conn.on('data',d=>playerOnData(d));
  conn.on('close',()=>{ net.connected=false; render(); scheduleReconnect(); });
  conn.on('error',()=>{ net.connected=false; scheduleReconnect(); });
}

function playerJoin(code, charId){
  loadPeer(()=>{
    let peer; try{ peer=new Peer('grimoire-pl-'+Math.random().toString(36).slice(2,8),{debug:1}); }catch(e){ flashBanner('Could not join'); return; }
    net={role:'player', code, peer, conn:null, session:null, charId, targetMon:null, connected:false};
    peer.on('open',()=>{ playerConnect(); flashBanner('Joining game '+code+'…'); });
    peer.on('disconnected',()=>{ try{ if(!peer.destroyed) peer.reconnect(); }catch(e){} });
    peer.on('error',e=>{ const t=e&&e.type; if(t==='peer-unavailable'){ flashBanner('DM not found — check the code'); } else { net&&(net.connected=false); scheduleReconnect(); } render&&render(); });
  });
}

function playerOnData(d){ if(!d) return;
  if(d.t==='session'){ const wasActive=net.session&&net.session.battle&&net.session.battle.active; net.session=d.session; const c=playerChar();
    if(c){ if(d.session.battle.active && !c.battle){ startBattle(c); }
      else if(!d.session.battle.active && c.battle){ c.battle=null; save(); }
      else if(c.battle){ const cur=d.session.order&&d.session.order[d.session.turn]; const myTurn=cur&&cur.id===net.peer.id;
        if((myTurn && !net.wasMyTurn) || (!d.session.order||!d.session.order.length) && c.battle.round!==d.session.battle.round){   // my turn started (or no initiative → round change) → reset resources
          c.battle.round=d.session.battle.round; resetTurnState(c); save(); }
        net.wasMyTurn=myTurn; }
    }
    // Camera: center on me the moment battle starts, then follow whoever's turn is active —
    // same "spotlight follows the action" behavior as QB/DM, driven off the synced session.
    if(d.session.battle.active && !wasActive){ setTimeout(()=>frameBattleCameraOnPlayer(net.session,1.55),60); net.lastActiveId=null; }
    else if(d.session.battle.active){
      const cur=d.session.order&&d.session.order[d.session.turn];
      if(cur&&cur.id!==net.lastActiveId){ net.lastActiveId=cur.id; frameCameraOnActiveUnit(net.session,1.55); }
    }
    render();
  } else if(d.t==='apply'){ const c=playerChar(); if(c){ applyHp(c, d.delta, d.dtype); if(d.healerFeat) c.healerFeatSpent=true; playerHello(); } }
  else if(d.t==='tempHpApplied'){ const c=playerChar(); if(c){ c.hp.temp=Math.max(c.hp.temp||0, d.amount); save(); render(); playerHello(); flashBanner('🎺 +'+d.amount+' temp HP'); } }
  else if(d.t==='oachance'){ const c=playerChar(); if(c) playerOpportunityPrompt(c, d); }
  else if(d.t==='cond'){ const c=playerChar(); if(c){ if(d.on!==false && (mindlessRageBlocks(c,d.name)||auraOfDevotionBlocks(c,d.name))) return; if(!c.conditions) c.conditions={}; if(d.on===false) delete c.conditions[d.name]; else c.conditions[d.name]=true; logChange(c,(d.on===false?'Recovered from ':'Afflicted: ')+d.name); save(); render(); playerHello(); flashBanner('🌀 '+d.name); } }
  else if(d.t==='hazard'){
    // DM-hosted hazard check (gas cloud OR Grease/Web terrain) — the DM device can't roll
    // our save (it only ever syncs hp/ac/conds, never ability scores), so it asks us to
    // resolve it locally where the full sheet lives, then reports back via the same
    // 'apply'/'cond' shape the DM already understands (see tickGasHazards's and
    // sendTerrainHazardCheck's DM-mode branches).
    const c=playerChar(); if(!c) return;
    const ability=d.ability||'con';
    const bonus=saveMod(c,ability);
    const roll=rnd(20)+bonus, saved=roll>=d.dc;
    const cond=d.cond||'Poisoned';
    if(d.dmg){
      const dmgTotal=(rollNotation(d.dmg)||{total:0}).total;
      const applied=saved?Math.floor(dmgTotal/2):dmgTotal;
      if(applied>0){ applyHp(c,-applied); if(net.conn) try{ net.conn.send({t:'apply',delta:-applied}); }catch(e){} }
      flashBanner('🌫️ '+d.name+' — you take '+applied+' '+(d.dtype||'')+(saved?' (saved — half)':''));
    } else if(!saved){
      if(!c.conditions) c.conditions={};
      c.conditions[cond]=true; save();
      if(net.conn) try{ net.conn.send({t:'cond',name:cond,on:true}); }catch(e){}
      flashBanner((d.name?d.name+' — ':'')+'you are '+cond);
    } else flashBanner((d.name?d.name+' — ':'')+'you resist it');
    render();
  } else if(d.t==='stabilized'){ const c=playerChar(); if(c){ c.stable=true; c.death={succ:0,fail:0}; if(d.healHp) applyHp(c, d.healHp); save(); render(); playerHello(); flashBanner('🩹 You are stabilized'+(d.healHp?' (+'+d.healHp+' HP)':'')); } }
  // Echo Knight — Reclaim Potential: the DM applied damage that destroyed our echo (its real
  // hp.temp field only exists on our own device, same reason 'stabilized' above can't just be
  // applied DM-side) — resolve it locally, same as every other "DM prompts, we roll/apply,
  // then resync" round-trip this session established.
  else if(d.t==='echoDestroyed'){ const c=playerChar(); if(c){ reclaimPotential(c, m=>logChange(c,m)); save(); render(); playerHello(); if((c.hp.temp||0)>0) flashBanner('🩸 Reclaim Potential — +'+c.hp.temp+' temporary HP'); } }
  else if(d.t==='shadowMartyrTriggered'){ const c=playerChar(); if(c){ if(c.battle) c.battle.reaction=true; c.shadowMartyrUsed=true; c.shadowMartyrArmed=false; logChange(c,'👤 Shadow Martyr — the echo steps into an attack meant for you'); save(); render(); playerHello(); flashBanner('🛡 Shadow Martyr triggered — the echo takes the hit'); } }
  else if(d.t==='mountDied'){ const c=playerChar(); if(c && c.mountedOn){ const name=c.mountedOn.name; c.mountedOn=null; logChange(c,'🐴 Your '+name+' has fallen — you are thrown from the saddle'); save(); render(); playerHello(); flashBanner('🐴 Your mount has died — you are dismounted'); } }
  else if(d.t==='cuttingWordsTriggered'){ const c=playerChar(); if(c){ if(c.battle) c.battle.reaction=true; c.bardicInspLeft=Math.max(0,(c.bardicInspLeft||0)-1); c.cuttingWordsArmed=false; logChange(c,'🎵 Cutting Words — reduced an attack roll by '+d.die); save(); render(); playerHello(); flashBanner('🎵 Cutting Words triggered — reduced the roll by '+d.die); } }
  else if(d.t==='maneuverCheck'){
    // A DM-controlled monster attempts Shove/Grapple on this player — the DM can't roll our
    // side (same reason as 'hazard' above: it only ever syncs hp/ac/conds, never ability
    // scores), so it sends its own roll and we resolve the contest locally with our real
    // Athletics/Acrobatics, apply the outcome to ourselves the same way any other condition/
    // move does, then tell the DM what happened purely so its UI can show a result.
    const c=playerChar(); if(!c) return;
    const advA=skillCheckAdvantage(c,'athletics','str'), rA=rollSkillCheck(c,'athletics','str',{adv:advA.adv});
    const advB=skillCheckAdvantage(c,'acrobatics','dex'), rB=rollSkillCheck(c,'acrobatics','dex',{adv:advB.adv});
    const best=rA.total>=rB.total?rA:rB;
    const hit = d.monTotal>=best.total;   // ties favor the monster, matching opposedCheck's a.total>=def.total
    if(hit){
      if(d.kind==='shove-push'){
        const mo=(net.session&&net.session.monsters||[]).find(m=>m.id===d.mon);
        const me2=net.session&&net.session.players.find(p=>p.id===net.peer.id);
        if(mo && me2){ const dx=Math.sign(me2.x-mo.x)||0, dy=Math.sign(me2.y-mo.y)||0, nx=me2.x+dx, ny=me2.y+dy;
          if(tileClearFor(net.session,nx,ny) && net.conn){ try{ net.conn.send({t:'move',x:nx,y:ny}); }catch(e){} } }
        logChange(c,'🤼 '+(d.monName||'A monster')+' shoves you back!'); flashBanner('🤼 Pushed back!');
      } else {
        const cond=d.kind==='grapple'?'Grappled':'Prone';
        if(!c.conditions) c.conditions={};
        c.conditions[cond]=true;
        logChange(c,'🤼 '+(d.monName||'A monster')+' '+(d.kind==='grapple'?'grapples':'shoves')+' you!');
        flashBanner('🤼 '+(cond==='Grappled'?'Grappled!':'Knocked Prone!'));
        save(); playerHello();
      }
    } else flashBanner('You resist '+(d.monName||'the monster')+"'s "+(d.kind==='grapple'?'grapple':'shove')+'!');
    if(net.conn){ try{ net.conn.send({t:'maneuverResult', kind:d.kind, mon:d.mon, hit}); }catch(e){} }
    render();
  }
}

function playerOpportunityPrompt(c, d){
  if(c.battle && c.battle.reaction){ return; }   // reaction already spent
  const melee=weaponItems(c).map(({it})=>{ const w=weaponByName(it.name); return w&&Object.assign({},w,{_it:it}); }).filter(w=>w && w.type==='melee');
  if(!melee.length){ flashBanner('⚔ '+d.name+' left your reach (no melee weapon for an opportunity attack)'); return; }
  const body=`<h2>⚔ Opportunity Attack</h2>
    <p class="muted" style="font-size:13px;margin:0 0 10px"><b>${esc(d.name)}</b> left your reach. You may spend your <b>reaction</b> to make one melee attack.</p>
    ${melee.map((w,i)=>{ const b=weaponDmgBonus(c,w); return `<button class="btn block" data-oaw="${i}" style="margin-bottom:8px">${esc(w.n)} — ${esc(w.dmg+(b?sgn(b):''))} ${esc(w.dt||'')}</button>`; }).join('')}
    <button class="btn ghost block" id="oaSkip" style="margin-top:4px">Skip (keep reaction)</button>`;
  $('#modalRoot').innerHTML=`<div class="modal" id="oaModal"><div class="sheet"><div class="grip"></div>${body}</div></div>`;
  $('#oaModal').onclick=e=>{ if(e.target.id==='oaModal') $('#modalRoot').innerHTML=''; };
  $('#oaSkip').onclick=()=>{ $('#modalRoot').innerHTML=''; };
  document.querySelectorAll('[data-oaw]').forEach(btn=>btn.onclick=()=>{ const w=melee[Number(btn.dataset.oaw)]; const b=weaponDmgBonus(c,w);
    net.targetMon={id:d.mon, name:d.name, ac:d.ac};
    attackFlow(c, {name:w.n+' (opportunity)', toHit:weaponToHit(c,w), dmg:w.dmg+(b?sgn(b):''), dt:w.dt||'', vers:'', reaction:true}); });
}

function animateToken(get,set,path,step,done,unit){
  if(!path||!path.length){ done&&done(); return; }
  const stepMs=step||110;
  // Iso3D: smooth walk along pathfinded tiles (Grimoire still owns legality via pathTo)
  if(iso3dView&&window.__iso3dHost&&unit){
    const uid=iso3dUnitId(unit);
    const startX=unit.x, startY=unit.y;
    const full=[{x:startX,y:startY}].concat(path);
    // Face along first step
    if(path[0]){ const [ddx,ddy]=rotDelta(path[0].x-startX, path[0].y-startY, isoView?mapRotation:0); const d=dirFromDelta(ddx,ddy,isoView); if(d) unit.facing=d; }
    const last=path[path.length-1];
    // Drive visual path; commit logical position at the end (and step set() for any mid listeners)
    window.__iso3dHost.animatePath(uid, full, { msPerStep:stepMs, onDone:()=>{
      set(last.x,last.y);
      if(unit){ unit.x=last.x; unit.y=last.y; }
      done&&done();
    }});
    // Also emit move event with full path for any other listeners
    try{ Events.emit({type:'move', unitId:uid, by:unit.name, from:{x:startX,y:startY}, to:{x:last.x,y:last.y}, path:full, stepMs, fly:!!unit.fly}); }catch(e){}
    // Don't call render() each tile — Iso3D animates; one render after keeps UI in sync
    // Update game coords progressively so mid-move state is honest for OA already resolved
    let i=0;
    (function stepLogic(){
      if(i>=path.length){ render(); return; }
      const nx=path[i].x, ny=path[i].y;
      if(unit){ const [ddx,ddy]=rotDelta(nx-(unit.x), ny-(unit.y), isoView?mapRotation:0); const d=dirFromDelta(ddx,ddy,isoView); if(d) unit.facing=d; }
      set(nx,ny); i++;
      setTimeout(stepLogic, stepMs);
    })();
    return;
  }
  // Classic 2D / non-Iso3D: step tile-by-tile with full re-render
  let i=0, px=unit?unit.x:null, py=unit?unit.y:null;
  (function go(){ if(i>=path.length){ done&&done(); return; }
    if(unit){ const nx=path[i].x, ny=path[i].y, [ddx,ddy]=rotDelta(nx-(px==null?nx:px), ny-(py==null?ny:py), isoView?mapRotation:0), d=dirFromDelta(ddx, ddy, isoView); if(d) unit.facing=d; px=nx; py=ny; }
    set(path[i].x,path[i].y); i++; render(); setTimeout(go, stepMs); })();
}

function playerAttackMenu(c){
  const me=myMapPos();
  const actions=[];
  // Same shared pcAttackList(c) qbPcAttacks uses (see its own doc comment) — was a separately-
  // maintained list here that silently drifted from QB's; unified in the mode-parity pass.
  pcAttackList(c).forEach(atk=>{
    const kind = atk.offhand ? 'bonus action' : (atk.melee===false ? 'ranged' : atk.reach ? 'reach' : 'melee');
    actions.push({label:atk.name, sub:kind+' · '+atk.dmg+' '+(atk.dt||''), tiles:atk.tiles, atk});
  });
  // (spells & cantrips are cast via the ✨ Spells button → map targeting)
  if(!actions.length){ flashBanner('No weapons — use ✨ Spells to cast'); return; }
  let pick=null;
  function draw(){
    let body=`<h2>⚔ Attack</h2>`;
    if(!pick){ body+=`<p class="muted" style="font-size:12px;margin:0 0 8px">Choose a weapon or cantrip:</p>`+
      actions.map((a,i)=>{ const n=monstersInRange(me,a.tiles).length; return `<div class="spell"><div class="nm"><b>${esc(a.label)}</b><small>${esc(a.sub)} · range ${a.tiles*5} ft</small></div><button class="btn sm" data-pa="${i}">${n} in range</button></div>`; }).join(''); }
    else { const inr=monstersInRange(me,pick.tiles);
      body+=`<p class="muted" style="font-size:12px;margin:0 0 8px"><b>${esc(pick.label)}</b> — range ${pick.tiles*5} ft. Pick a target:</p>`;
      body+= inr.length? inr.map(mo=>`<div class="spell"><span class="tok" style="flex:none;${mo.sprite?'background:none;box-shadow:none':''}">${mo.sprite?pixelArt(monsterSprite(mo.sprite),2):''}</span><div class="nm"><b>${esc(mo.name)}</b><small>AC ${mo.ac} · HP ${mo.hp}/${mo.max} · ${gridDist(me.x,me.y,mo.x,mo.y)*5} ft away</small></div><button class="btn sm" data-pt="${mo.id}">Attack</button></div>`).join('')
        : '<div class="empty">No targets in range — move closer (or pick a longer-ranged attack).</div>';
      body+=`<button class="btn ghost block" id="paBack" style="margin-top:8px">← Back</button>`;
    }
    body+=`<button class="btn ghost block" id="paClose" style="margin-top:10px">Close</button>`;
    $('#modalRoot').innerHTML=`<div class="modal" id="paModal"><div class="sheet"><div class="grip"></div>${body}</div></div>`;
    $('#paModal').onclick=e=>{ if(e.target.id==='paModal') $('#modalRoot').innerHTML=''; };
    $('#paClose').onclick=()=>{ $('#modalRoot').innerHTML=''; };
    { const bk=$('#paBack'); if(bk) bk.onclick=()=>{ pick=null; draw(); }; }
    document.querySelectorAll('[data-pa]').forEach(b=>b.onclick=()=>{ pick=actions[Number(b.dataset.pa)]; draw(); });
    document.querySelectorAll('[data-pt]').forEach(b=>b.onclick=()=>{ const mo=net.session.monsters.find(m=>m.id===b.dataset.pt); if(mo){ net.targetMon={id:mo.id,name:mo.name,ac:mo.ac}; $('#modalRoot').innerHTML=''; attackFlow(c, pick.atk); } });
  }
  draw();
}

function renderPlayerBattle(c){
  const s=net.session, me=s.players.find(p=>p.id===net.peer.id)||{x:0,y:0};
  const spdOpts={ignoreEffects:inAntimagicField(s,me.x,me.y)};
  if(!c.battle) c.battle={round:s.battle.round||1, action:false, bonus:false, reaction:false, actionsMax:actionsPerTurn(c), actionsUsed:0, surged:false, attacksLeft:extraAttacks(c)+1, move:effSpeed(c,spdOpts), moveUsed:0};
  if(c.battle.move==null) c.battle.move=effSpeed(c,spdOpts);
  const b=c.battle;
  $('#tabs').style.display='none'; const fab=$('#diceFab'); if(fab) fab.style.display='';
  app.className='fade'; void app.offsetWidth;
  const myTurn = s.order&&s.order.length&&s.order[s.turn]&&s.order[s.turn].id===net.peer.id;
  app.innerHTML=`
  <div class="card" style="border:2px solid var(--accent)">
    <div class="row between"><h2 style="margin:0;color:var(--accent2)">⚔ Battle · Round ${s.battle.round}</h2><span class="muted" style="font-size:11px">DM controls turns</span></div>
    ${(s.order&&s.order.length)?`<div style="text-align:center;margin:8px 0;font-weight:700;color:${myTurn?'var(--accent)':'var(--mut)'}">${myTurn?'★ YOUR TURN ★':'Now: '+esc((s.order[s.turn]||{}).name||'—')}</div>
      <div class="chips" style="justify-content:center">${s.order.map((o,i)=>`<span class="chip ${i===s.turn?'on':''}" style="${i===s.turn?'':'opacity:.6'}">${o.k==='m'?'🟥':'🟩'} ${esc(o.name)} (${o.roll})</span>`).join('')}</div>`:''}
    <div class="tiles" style="margin-top:8px">
      <div class="tile" style="${c.hp.cur<=0?'box-shadow:inset 0 0 0 1px var(--bad)':''}"><div class="lab">HP${c.hp.cur<=0?' · DOWN':''}</div><div class="big" style="color:${c.hp.cur<=0?'var(--bad)':'var(--good)'}">${c.hp.cur}/${c.hp.max}</div></div>
      <div class="tile"><div class="lab">Move left${b.moveUsed?' · used '+b.moveUsed:''}</div><div class="big">${b.move||0}</div></div>
      <div class="tile"><div class="lab">AC</div><div class="big">${computeAC(c)}</div></div>
    </div>
    ${c.altitude>0?`<p class="muted" style="font-size:11.5px;margin:6px 0 0">🕊️ Airborne at ${c.altitude} ft</p>`:''}
    <div class="chips" style="margin-top:10px">
      <button class="chip ${!hasAction(c)?'on':''}" data-pbt="action">${!hasAction(c)?'✓ ':''}Action${(b.actionsMax||1)>1?' '+actionsLeft(c)+'/'+(b.actionsMax||1):''}</button>
      <button class="chip ${b.bonus?'on':''}" data-pbt="bonus">${b.bonus?'✓ ':''}Bonus</button>
      <button class="chip ${b.reaction?'on':''}" data-pbt="reaction">${b.reaction?'✓ ':''}Reaction</button>
    </div>
    ${hasActionSurge(c)?`<button class="btn ghost sm block" data-pbt="surge" style="margin-top:8px${c.actionSurgeUsed?';opacity:.5':''}" ${c.actionSurgeUsed?'disabled':''}>⚡ ${c.actionSurgeUsed?'Action Surge spent (rest to recharge)':'Action Surge (+1 action)'}</button>`:''}
  </div>
  <div class="card">
    <h2>Battlefield <button class="btn sm" id="pbMoveBtn" style="float:right;${net.moveMode?'background:var(--bad);border-color:var(--bad)':''}">🥾 ${net.moveMode?'Moving… ('+(b.move||0)+' ft)':'Move'}</button><button class="btn ghost sm" id="pbRotBtn" style="float:right;margin-right:6px">🔄 Rotate</button></h2>
    ${mapGridHTML(s,false, net.moveMode?buildMoveRangeOpts(s,me,b.move||0,hasAction(c),effSpeed(c),isFlying(c)):{})}
    <p class="muted" style="font-size:11.5px;margin:8px 0 0">${net.moveMode?('Green: <='+(b.move||0)+' ft left (still act) · sheet speed '+effSpeed(c)+' ft'+(hasAction(c)?' · Red: Dash (Action) adds '+effSpeed(c)+' ft':' · no Action left for Dash')+' · Jump/climb marked on path') :'Tap 🥾 Move to see where you can go. Tap a monster 🟥 to attack it.'}</p>
  </div>
  <div class="card">
    <h2>Your turn</h2>
    ${(c.effects&&c.effects.length)?`<div class="addrow" style="flex-wrap:wrap;gap:6px;margin-bottom:8px">${c.effects.map(e=>`<span class="pill" style="${e.name==='Rage'?'background:var(--bad);color:#fff;border-color:var(--bad)':''}">${spellIcon(e.name)} ${esc(e.name)}${e.mods&&modSummary(e.mods)?' · '+modSummary(e.mods):''}</span>`).join('')}</div>`:''}
    <div class="row2">
      <button class="btn" id="pbAttack">⚔ Attack</button>
      ${(isCaster(c)||c.spells.length)?`<button class="btn" id="pbSpells">✨ Spells</button>`:''}
    </div>
    <button class="btn ghost block" id="pbUse" style="margin-top:8px">🖐 Use<small style="display:block;opacity:.75">Objects, Shove/Grapple/Hide/Recall Knowledge, Stabilize a downed ally</small></button>
    ${c.cls==='Barbarian'?`<button class="btn block" id="pbRage" style="margin-top:8px;${isRaging(c)?'background:var(--bad);border-color:var(--bad)':''}">🪓 ${isRaging(c)?'Raging — tap to stop':'Enter Rage'}</button>`:''}
    <div class="hpbtns" style="margin-top:8px"><button class="btn bad sm" id="pbDmg">– Damage</button><input type="number" id="pbAmt" value="1" min="1" inputmode="numeric"><button class="btn sm" id="pbHeal" style="background:#16352b;border-color:#14532d;color:#bbf7d0">+ Heal</button></div>
    ${c.hp.cur<=0&&!c.stable?`<button class="btn block" id="pbDeath" style="margin-top:8px">🎲 Roll death save (${c.death.succ||0}✓/${c.death.fail||0}✗)</button>`:''}
    ${c.hp.cur<=0&&c.stable?`<p class="muted" style="font-size:12px;margin:8px 0 0">🩹 Stabilized — unconscious but not dying.</p>`:''}
    <button class="btn block" id="pbEndTurn" style="margin-top:10px;${myTurn?'':'opacity:.5'}">⏭ End my turn</button>
  </div>
  <div class="card">
    <h2>Battle Log</h2>
    <div style="max-height:200px;overflow:auto;border:1px solid var(--line);border-radius:10px;padding:2px 10px">
      ${(c.log&&c.log.length)? c.log.slice(0,30).map(e=>`<div class="listrow" style="padding:4px 0"><div class="nm" style="font-size:12px">${esc(e.m)}</div><div class="sub" style="white-space:nowrap;font-size:11px">${fmtLogTime(e.t)}</div></div>`).join('') : '<div class="empty" style="padding:8px 0">Your rolls, damage, casts and moves show here.</div>'}
    </div>
  </div>`;
  app.querySelectorAll('[data-cell]').forEach(el=>el.addEventListener('click',()=>{
    const t=el.getAttribute('data-target'); if(t){ playerAttackMenu(c); return; }
    const [x,y]=el.dataset.cell.split(',').map(Number);
    if(s.monsters.some(m=>m.hp>0&&m.x===x&&m.y===y)||s.players.some(p=>p.x===x&&p.y===y)) return;   // dead bodies don't block
    if(!net.moveMode){ flashBanner('Tap 🥾 Move first'); return; }
    const ter=terrainAt(s,x,y), tdef=TERRAIN[ter], fly=isFlying(c);
    if(tdef&&tdef.solid && !(fly&&isPitTerrain(ter))){ flashBanner(isPitTerrain(ter)?'You won’t step into the pit':'Blocked by terrain'); return; }
    const dashAvail=hasAction(c), dashMax=(b.move||0)+(dashAvail?effSpeed(c):0);
    const path=pathTo(s,me.x,me.y,x,y,dashMax,fly,me);
    if(!path){ flashBanner('Can’t reach there — walls block the path or it’s too far'); return; }
    const cost=reachableCells(s,me.x,me.y,dashMax,fly,me)[x+','+y];
    if(cost==null){ flashBanner('Out of range'); return; }
    if(cost>(b.move||0)){   // beyond normal speed → Dash (costs your action)
      if(!dashAvail){ flashBanner('Too far — Dash needs your action (already used)'); return; }
      b.move=(b.move||0)+effSpeed(c); spendAction(c); b.dashed=true; logChange(c,'🏃 Dash (action) — extra movement'); }
    b.move=(b.move||0)-cost; b.moveUsed=(b.moveUsed||0)+cost; net.moveMode=false;
    const provokers=(s.battle&&s.battle.active)?s.monsters.filter(mo=>mo.hp>0 && leavesReach(me.x,me.y,x,y,mo.x,mo.y,1)):[];
    animateToken(null,(nx,ny)=>{ const mm=net.session.players.find(p=>p.id===net.peer.id); if(mm){ mm.x=nx; mm.y=ny; } }, path, 200, ()=>{ save();
      if(net.conn){ try{ net.conn.send({t:'move',x,y}); }catch(e){} }
      if(provokers.length && net.conn){ try{ net.conn.send({t:'provoke', cid:clientId(), who:c.name, mons:provokers.map(m=>m.id)}); }catch(e){} logChange(c,'⚔ Provoked opportunity attack'+(provokers.length>1?'s':'')+' from '+provokers.map(m=>m.name).join(', ')); }
      if(fly){
        if(isPitTerrain(ter)) flashBanner('🕊️ Flying over the pit');
        else if(tdef&&tdef.dmg) flashBanner('🕊️ Flying clear of '+(tdef.name||'hazard'));
        else flashBanner('🕊️ Flying over the terrain');
      }
      else if(tdef&&tdef.deadly){ applyHp(c,-c.hp.cur); flashBanner('💀 Fell into the pit!'); }
      else if(tdef&&tdef.dmg){ const d=(rollNotation(tdef.dmg)||{total:0}).total; applyHp(c,-d); flashBanner((tdef.e||'🔥')+' '+tdef.name+'! '+d+' damage'); }
      else if(tdef&&tdef.diff) flashBanner(tdef.name+' — difficult terrain'); Events.emit({type:'move', by:c.name, to:{x,y}, fly}); render(); }, me);
  }));
  app.querySelectorAll('[data-pbt]').forEach(el=>el.onclick=()=>{ const k=el.dataset.pbt;
    if(k==='action'){ if(hasAction(c)) spendAction(c); else { b.actionsUsed=0; b.action=false; } }
    else if(k==='surge'){ if(c.actionSurgeUsed){ flashBanner('Action Surge spent — rest to recharge'); return; } b.actionsMax=(b.actionsMax!=null?b.actionsMax:actionsPerTurn(c))+1; c.actionSurgeUsed=true; b.action=!hasAction(c); logChange(c,'⚡ Action Surge — extra action'); flashBanner('⚡ Action Surge — +1 action'); }
    else b[k]=!b[k];
    save(); render(); });
  { const mv=$('#pbMoveBtn'); if(mv) mv.onclick=()=>{ net.moveMode=!net.moveMode; render(); }; }
  { const rv=$('#pbRotBtn'); if(rv) rv.onclick=rotateMap; }
  if(isoView&&iso3dView&&net&&net.session) syncIso3DHost(net.session);
  { const a=$('#pbAttack'); if(a) a.onclick=()=>playerAttackMenu(c); }
  { const sp=$('#pbSpells'); if(sp) sp.onclick=()=>openQuickSpells(c); }
  { const us=$('#pbUse'); if(us) us.onclick=()=>openAdjacentUseUI(c, net.session, Object.assign({}, me, {me:true, c, id:'me'})); }
  { const rg=$('#pbRage'); if(rg) rg.onclick=()=>rageButtonClick(c); }
  { const et=$('#pbEndTurn'); if(et) et.onclick=()=>{ if(timeStopExtraTurn(c)) return; if(net.conn){ try{ net.conn.send({t:'endturn'}); }catch(e){} } net.moveMode=false; flashBanner('Turn ended'); }; }
  { const d=$('#pbDmg'); if(d) d.onclick=()=>applyHp(c,-Math.abs(Number($('#pbAmt').value)||0)); }
  { const hh=$('#pbHeal'); if(hh) hh.onclick=()=>applyHp(c,Math.abs(Number($('#pbAmt').value)||0)); }
  { const ds=$('#pbDeath'); if(ds) ds.onclick=()=>rollDeathSave(c); }
}

function playerLeave(){ try{ net.peer.destroy(); }catch(e){} net=null; render(); }

function ensureSpriteProbe(key){ const e=spriteEntry(key); if(!e||spriteReady.has(key)||spriteChecking.has(key)) return;
  spriteChecking.add(key); const img=new Image();
  img.onload=()=>{ e.nativeW=img.naturalWidth; e.nativeH=img.naturalHeight; spriteReady.add(key); spriteChecking.delete(key); render(); };
  img.onerror=()=>{ spriteChecking.delete(key); };   // stays on the pixelArt fallback forever, no retry storm
  img.src=e.file; }

function ensureDecorProbe(key){ const e=DECOR_MANIFEST[key]; if(!e||decorReady.has(key)||decorChecking.has(key)) return;
  decorChecking.add(key); const img=new Image();
  img.onload=()=>{ e.nativeW=img.naturalWidth; e.nativeH=img.naturalHeight; decorReady.add(key); decorChecking.delete(key); render(); };
  img.onerror=()=>{ decorChecking.delete(key); };
  img.src=e.file; }

function openAdjacentUseUI(c, s, me){
  const items=listInteractInRange(s, me, 1);
  // Combat maneuvers run through the unified maneuver system (maneuverShove/Grapple/Escape/
  // Hide/Study/Stabilize) — same functions in Quick Battle and player-net, just a different
  // adapter/log. DM-hosted has no PC of its own to "Use" with (see dmMonsterAttack instead,
  // where the DM's monsters get their own Shove/Grapple options).
  const mode = (typeof QB!=='undefined' && s===QB) ? 'qb'
    : (net && net.role==='player' && s===net.session) ? 'player' : null;
  const ad = mode==='qb' ? qbAdapter : mode==='player' ? playerNetAdapter : null;
  const log = mode==='qb' ? qbLog : mode==='player' ? (m=>logChange(c,m)) : ()=>{};
  const foes=mode ? s.monsters.filter(mo=>mo.hp>0 && isHostile(mo) && gridDist(me.x,me.y,mo.x,mo.y)<=1) : [];
  // Path of the Berserker — Intimidating Presence reaches 30 ft (6 tiles), unlike every other
  // maneuver here which is adjacency-only — a separate wider-range list, not folded into foes.
  const intimidateTargets = mode && isBerserker(c,10) ? s.monsters.filter(mo=>mo.hp>0 && isHostile(mo) && gridDist(me.x,me.y,mo.x,mo.y)<=6 && !mo.intimidateImmune) : [];
  // Channel Divinity: Preserve Life (Life Domain 2nd) — self + any connected party members
  // within 30 ft (6 tiles). Quick Battle is solo (no second party member — same limitation
  // Stabilize above already documents), so self is the only real target there.
  if(mode && isLifeCleric(c,2) && c.channelDivinityLeft==null) c.channelDivinityLeft=channelDivinityMax(c);
  const preserveLifeTargets = (mode && isLifeCleric(c,2)) ? [{self:true, id:'me', name:c.name, hpCur:c.hp.cur, hpMax:c.hp.max}]
    .concat(mode==='player' ? (s.players||[]).filter(p=>p.id!==net.peer.id && gridDist(me.x,me.y,p.x,p.y)<=6).map(p=>({self:false, id:p.id, name:p.name, hpCur:p.hpCur, hpMax:p.hpMax})) : []) : [];
  const grappled=!!mode && !!(c.conditions&&c.conditions.Grappled);
  const canHide=!!mode && !(c.conditions&&c.conditions.Hidden); // maneuverHide itself checks cover/darkness and bails with a banner if ineligible
  // Stabilize only ever makes sense against ANOTHER party member at 0 HP — Quick Battle has
  // no second ally, so this is player-net only. stable/deathFail ride along on playerHello()'s
  // mirror payload specifically so this filter can tell "needs stabilizing" apart from
  // "already stable" or "already dead" without a round-trip.
  const allies = mode==='player' ? (s.players||[]).filter(p=>p.id!==net.peer.id && needsStabilizing(p) && gridDist(me.x,me.y,p.x,p.y)<=1) : [];
  // Healer feat's SECOND action (PHB): "restore 1d6+4 + the creature's hit dice" to a
  // CONSCIOUS, injured creature within reach — once per rest PER TARGET (the restriction is
  // on the creature healed, not the healer — see spendHitDie/#restBtn resetting
  // c.healerFeatSpent unconditionally, and playerHello's mirror payload carrying it so this
  // filter can see it). "Another creature" (PHB), not self, unlike Preserve Life below.
  const healerHealTargets = (mode==='player' && hasFeat(c,'Healer'))
    ? (s.players||[]).filter(p=>p.id!==net.peer.id && (p.hpCur||0)>0 && p.hpCur<p.hpMax && !p.healerFeatSpent && gridDist(me.x,me.y,p.x,p.y)<=1)
    : [];
  // Inspiring Leader (feat): a 10-minute activity, not simulated as costing the Action/turn
  // (same treatment this app gives other narrative-time activities) — up to 6 creatures
  // within 30 ft INCLUDING self (PHB), once per rest. Same self+nearby-ally shape as
  // Preserve Life below, different gating (a feat, not Channel Divinity).
  const inspiringLeaderTargets = (mode && hasFeat(c,'Inspiring Leader') && !c.inspiringLeaderUsed)
    ? [{self:true, id:'me', name:c.name}]
      .concat(mode==='player' ? (s.players||[]).filter(p=>p.id!==net.peer.id && gridDist(me.x,me.y,p.x,p.y)<=6).map(p=>({self:false, id:p.id, name:p.name})) : [])
      .slice(0,6)
    : [];
  // A live Unseen Servant is never adjacency-gated (it can be anywhere on the map) and costs
  // a BONUS action, not the Action every other Use-menu item spends — checked independently
  // inside its own handler rather than folded into the shared afterManeuver bookkeeping.
  // spawnSummon's controllerId is 'pc' in QB but the real peer id in player-net (this `me`
  // wrapper's own .id is overridden to the literal 'me' for adapter purposes, which is NOT
  // what the caster was actually identified by at summon time — don't compare against it).
  const servant = mode ? s.monsters.find(m=>m.hp>0 && m.spell==='Unseen Servant' && m.controllerId===(mode==='qb'?'pc':(net.peer&&net.peer.id))) : null;
  // Echo Knight — Manifest Echo: same controllerId convention as the Unseen Servant above.
  // Offered whenever eligible regardless of whether one's already up (recasting replaces it,
  // see manifestEcho); "Command Echo" only shows once a live one actually exists.
  const echoControllerId = mode==='qb'?'pc':(net.peer&&net.peer.id);
  // Auto-dismiss on incapacitation (RAW: the echo vanishes the instant you're incapacitated) —
  // checked here rather than threaded through every condition-application call site across QB
  // and player-net; the Use menu is the natural point where this matters (you can't act on an
  // echo you're too incapacitated to command anyway), a deliberate, documented simplification
  // over a fully real-time check.
  if(mode && isIncapacitated(c)){ const hadOne=dismissEcho(s, echoControllerId, log); if(hadOne && mode==='player' && net.conn) try{ net.conn.send({t:'echoSync', exists:false}); }catch(e){} }
  const echo = mode ? s.monsters.find(m=>m.hp>0 && m.echo && m.controllerId===echoControllerId) : null;
  const canManifestEcho = mode && isEchoKnight(c,3);
  if(!items.length && !foes.length && !grappled && !canHide && !allies.length && !servant && !canManifestEcho && !echo){
    flashBanner('Nothing interactive within 5 ft');
    if(mode==='qb') qbLog('🖐 No usable objects adjacent');
    return;
  }
  function draw(pick){
    let body=`<h2>🖐 Use</h2>
      <p class="muted" style="font-size:12px;margin:0 0 8px">Objects and foes on or next to your tile. (Mage Hand reaches 30 ft.)</p>`;
    if(!pick){
      if(grappled) body+=`<button class="btn block" id="useEscape" style="margin-bottom:8px;text-align:left">🤸 Escape Grapple<small style="display:block;opacity:.75">Athletics/Acrobatics (your choice) vs the grappler's Athletics</small></button>`;
      if(canHide) body+=`<button class="btn block" id="useHide" style="margin-bottom:8px;text-align:left">🫥 Hide<small style="display:block;opacity:.75">Needs darkness, full cover, or (Skulker) dim light</small></button>`;
      if(servant) body+=`<button class="btn block" data-use="servant" style="margin-bottom:8px;text-align:left">👻 Command Servant<small style="display:block;opacity:.75">Move it up to 15 ft / interact with an object — bonus action</small></button>`;
      if(canManifestEcho) body+=`<button class="btn block" id="useManifestEcho" style="margin-bottom:8px;text-align:left">👤 Manifest Echo<small style="display:block;opacity:.75">${echo?'Replaces your current echo — ':''}Bonus action, within 15 ft</small></button>`;
      if(echo) body+=`<button class="btn block" data-use="echo" style="margin-bottom:8px;text-align:left">👤 Command Echo<small style="display:block;opacity:.75">Move it up to 30 ft (free) or teleport-swap (bonus action)</small></button>`;
      if(intimidateTargets.length) body+=`<button class="btn block" data-use="intimidate" style="margin-bottom:8px;text-align:left">😱 Intimidating Presence<small style="display:block;opacity:.75">Action — frighten a foe within 30 ft (Wis save)</small></button>`;
      if(preserveLifeTargets.length && (c.channelDivinityLeft||0)>0) body+=`<button class="btn block" id="usePreserveLife" style="margin-bottom:8px;text-align:left">✝️ Channel Divinity: Preserve Life<small style="display:block;opacity:.75">Action — distribute ${preserveLifePool(c)} HP among creatures within 30 ft, ½ max HP cap each (${c.channelDivinityLeft} use${c.channelDivinityLeft===1?'':'s'} left)</small></button>`;
      if(inspiringLeaderTargets.length) body+=`<button class="btn block" id="useInspiringLeader" style="margin-bottom:8px;text-align:left">🎺 Inspiring Leader<small style="display:block;opacity:.75">10 min — ${inspiringLeaderAmount(c)} temp HP to ${inspiringLeaderTargets.length} ${inspiringLeaderTargets.length===1?'creature':'creatures'} within 30 ft</small></button>`;
      if(mode && hasFeat(c,'Charger') && c.battle.dashed && !c.battle.bonus && foes.length) body+=`<button class="btn block" data-use="charger" style="margin-bottom:8px;text-align:left">🏃 Charger<small style="display:block;opacity:.75">Bonus action — melee attack (+5 damage) or shove (10 ft)</small></button>`;
      if(mode && !c.mountedOn && (c.ownedMounts||[]).length) body+=`<button class="btn block" data-use="mountup" style="margin-bottom:8px;text-align:left">🐴 Mount Up<small style="display:block;opacity:.75">Half your speed — climb onto a mount you own (baseline PHB action, no feat needed)</small></button>`;
      if(mode && c.mountedOn) body+=`<button class="btn ghost block" id="useDismount" style="margin-bottom:8px;text-align:left">🐴 Dismount ${esc(c.mountedOn.name)}<small style="display:block;opacity:.75">Half your speed</small></button>`;
      if(mode && isFlying(c)) body+=`<div class="card" style="margin:0 0 8px;padding:8px 10px">
        <div class="nm"><b>🕊️ Altitude: ${c.altitude||0} ft</b><small style="display:block;opacity:.75">Climbing/descending costs movement 1:1, same as any vertical move — knocked unconscious while airborne and you fall (see the info on this in AUDIT.md).</small></div>
        <div class="row2" style="margin-top:6px">
          <button class="btn ghost sm" id="useAltUp" ${((c.battle&&c.battle.move)||0)<5?'disabled style="opacity:.5"':''}>⬆ Climb 5 ft</button>
          <button class="btn ghost sm" id="useAltDown" ${!(c.altitude>0)?'disabled style="opacity:.5"':''}>⬇ Descend 5 ft</button>
        </div>
      </div>`;
      if(isHunter(c,11) && c.hunterMultiattack==='Whirlwind Attack' && foes.length) body+=`<button class="btn block" id="useWhirlwind" style="margin-bottom:8px;text-align:left">🏹 Whirlwind Attack<small style="display:block;opacity:.75">Action — one melee attack against every adjacent foe (${foes.length} in reach)</small></button>`;
      if(isHunter(c,11) && c.hunterMultiattack==='Volley'){ const rangedAtk=qbPcAttacks(c).find(a=>!a.melee); if(rangedAtk){ const near=s.monsters.filter(mo=>mo.hp>0 && isHostile(mo) && gridDist(me.x,me.y,mo.x,mo.y)<=(rangedAtk.tiles||1)); if(near.length) body+=`<button class="btn block" id="useVolley" style="margin-bottom:8px;text-align:left">🏹 Volley<small style="display:block;opacity:.75">Action — ranged attack against every foe within 10 ft of a target foe (pick one)</small></button>`; } }
      if(mode && isLoreBard(c,3)) body+=`<button class="btn ${c.cuttingWordsArmed?'':'ghost'} block" id="useCuttingWords" style="margin-bottom:8px;text-align:left"${(c.bardicInspLeft||0)<=0?' disabled style="opacity:.5"':''}>🎵 ${c.cuttingWordsArmed?'Cutting Words — ARMED (tap to cancel)':'Ready Cutting Words'}<small style="display:block;opacity:.75">${(c.bardicInspLeft||0)<=0?'No Bardic Inspiration left — rest to recharge':'Reaction — reduce a monster attack roll within 60 ft ('+(c.bardicInspLeft||0)+' use'+((c.bardicInspLeft||0)===1?'':'s')+' left)'}</small></button>`;
      if(mode && isLoreBard(c,14) && (c.bardicInspLeft||0)>0) body+=`<button class="btn block" id="usePeerlessSkill" style="margin-bottom:8px;text-align:left">🎵 Peerless Skill<small style="display:block;opacity:.75">Add a Bardic Inspiration die to your next ability check (${c.bardicInspLeft} use${c.bardicInspLeft===1?'':'s'} left)</small></button>`;
      body+=items.map((it,i)=>{
        const st=it.obj.state||it.def.default;
        return `<div class="spell"><div class="nm"><b>${esc(it.def.name)}</b><small>${st} · (${it.x},${it.y})</small></div>
          <button class="btn sm" data-use="obj:${i}">Use</button></div>`;
      }).join('');
      body+=foes.map((mo,i)=>`<div class="spell"><div class="nm"><b>${esc(mo.name)}${mo.surprised?' · 😲 Surprised':''}</b><small>Combat maneuver · (${mo.x},${mo.y})</small></div>
        ${(isAssassin(c,3)&&mode)?`<button class="btn ghost sm" data-suptgl="${i}">${mo.surprised?'Un-':''}Surprise</button>`:''}
        <button class="btn sm" data-use="foe:${i}">Use</button></div>`).join('');
      body+=allies.map((al,i)=>`<div class="spell"><div class="nm"><b>${esc(al.name)}</b><small>Down — Stabilize · (${al.x},${al.y})</small></div>
        <button class="btn sm" data-use="ally:${i}">Use</button></div>`).join('');
      body+=healerHealTargets.map((t,i)=>`<div class="spell"><div class="nm"><b>${esc(t.name)}</b><small>Healer feat · ${t.hpCur}/${t.hpMax} HP</small></div>
        <button class="btn sm" data-use="heal:${i}">Use</button></div>`).join('');
      body+=`<button class="btn ghost block" id="useClose" style="margin-top:10px">Cancel</button>`;
    } else if(pick.kind==='ally'){
      const al=pick.al;
      const kitOk=hasHealersKit(c) && (c.healerKitCharges==null?10:c.healerKitCharges)>0;
      body+=`<p class="muted" style="font-size:12px;margin:0 0 8px"><b>${esc(al.name)}</b> is down at (${al.x},${al.y}) — Medicine DC 10. Uses your action.</p>
        <button class="btn block" id="useStabilize" style="margin-bottom:8px;text-align:left">🩹 Stabilize</button>
        ${kitOk?`<label class="pill" style="cursor:pointer;margin-bottom:8px;display:flex"><input type="checkbox" id="useStabKit" checked> 🧰 Use Healer's Kit <span class="muted" style="font-size:11px">(auto-succeeds, no roll · ${c.healerKitCharges==null?10:c.healerKitCharges} charge${(c.healerKitCharges==null?10:c.healerKitCharges)===1?'':'s'} left${hasFeat(c,'Healer')?' · +1 HP':''})</span></label>`:''}`;
      body+=`<button class="btn ghost block" id="useBack" style="margin-top:8px">← Back</button>
        <button class="btn ghost block" id="useClose" style="margin-top:6px">Cancel</button>`;
    } else if(pick.kind==='manifestEchoPick'){
      // Manifest Echo needs an unoccupied cell within 15 ft (3 tiles) — same tileClearFor +
      // Chebyshev-radius shape servantMoveTiles uses, centered on the CASTER (me) since
      // there's nothing to move yet.
      const spots=servantMoveTiles(ad, {x:me.x, y:me.y});
      body+=`<p class="muted" style="font-size:12px;margin:0 0 8px">Manifest your echo where? (within 15 ft, bonus action)</p>`;
      body+=`<div class="chips" style="margin-bottom:8px">${spots.map((t,i)=>`<button class="chip" data-echospot="${i}">→ ${t.x},${t.y}</button>`).join('')}</div>`;
      body+=`<button class="btn ghost block" id="useBack" style="margin-top:8px">← Back</button>
        <button class="btn ghost block" id="useClose" style="margin-top:6px">Cancel</button>`;
    } else if(pick.kind==='echo'){
      // Move up to 30 ft, FREE (RAW states no action cost for the mental-command move, unlike
      // the Servant's move-also-costs-the-bonus-action simplification above — a deliberate,
      // documented difference: an Echo Knight needs their bonus action free most turns for
      // other things, and RAW genuinely doesn't gate the move itself). Teleport-swap and
      // Dismiss DO cost the bonus action (RAW is explicit for the swap; dismiss mirrors it).
      const echoTiles=echoMoveTiles(ad, echo);
      const echoItems=listInteractInRange(s, echo, 1);
      body+=`<p class="muted" style="font-size:12px;margin:0 0 8px">Echo at (${echo.x},${echo.y}). Move freely, or interact with something adjacent to it.</p>`;
      body+=`<div class="chips" style="margin-bottom:8px">${echoTiles.map((t,i)=>`<button class="chip" data-echomove="${i}">→ ${t.x},${t.y}</button>`).join('')}</div>`;
      if(echoItems.length) body+=echoItems.map((it,i)=>{
        const st=it.obj.state||it.def.default;
        return `<div class="spell"><div class="nm"><b>${esc(it.def.name)}</b><small>${st} · (${it.x},${it.y})</small></div>
          <button class="btn sm" data-echoint="${i}">Use</button></div>`;
      }).join('');
      else body+=`<p class="muted" style="font-size:12px;margin:8px 0">Nothing for it to interact with nearby.</p>`;
      if(isEchoKnight(c,3)){
        const left=c.echoIncarnationLeft!=null?c.echoIncarnationLeft:echoResourceMax(c);
        const incTargets=mode ? s.monsters.filter(mo=>mo.hp>0 && isHostile(mo) && gridDist(echo.x,echo.y,mo.x,mo.y)<=1) : [];
        body+=`<button class="btn block" id="useIncarnation" style="margin:8px 0;text-align:left"${(left<=0||!incTargets.length)?' disabled style="opacity:.5"':''}>⚔ Unleash Incarnation<small style="display:block;opacity:.75">One extra attack from the echo's space — ${left} use${left===1?'':'s'} left${incTargets.length?'':' · no target adjacent to the echo'}</small></button>`;
      }
      if(isEchoKnight(c,7)) body+=`<button class="btn block" id="useEchoAvatar" style="margin:8px 0;text-align:left"${c.echoAvatarUsed?' disabled style="opacity:.5"':''}>👁 Echo Avatar<small style="display:block;opacity:.75">${c.echoAvatarUsed?'Already used — rest to recharge':'Action — see/hear through it for 10 min; you\'re blinded &amp; deafened meanwhile'}</small></button>`;
      if(isEchoKnight(c,10)) body+=`<button class="btn ${c.shadowMartyrArmed?'':'ghost'} block" id="useShadowMartyr" style="margin:8px 0;text-align:left"${c.shadowMartyrUsed?' disabled style="opacity:.5"':''}>🛡 ${c.shadowMartyrArmed?'Shadow Martyr — ARMED (tap to cancel)':'Ready Shadow Martyr'}<small style="display:block;opacity:.75">${c.shadowMartyrUsed?'Already used — rest to recharge':'Reaction — the next attack on you within 5 ft of the echo hits it instead'}</small></button>`;
      body+=`<button class="btn block" id="useEchoSwap" style="margin:8px 0;text-align:left">🔀 Teleport-swap places<small style="display:block;opacity:.75">Bonus action, costs 15 ft of your movement</small></button>`;
      body+=`<button class="btn ghost block" id="useEchoDismiss" style="margin-bottom:8px;text-align:left">Dismiss Echo<small style="display:block;opacity:.75">Bonus action</small></button>`;
      body+=`<button class="btn ghost block" id="useBack" style="margin-top:8px">← Back</button>
        <button class="btn ghost block" id="useClose" style="margin-top:6px">Cancel</button>`;
    } else if(pick.kind==='incarnationPick'){
      const targets=s.monsters.filter(mo=>mo.hp>0 && isHostile(mo) && gridDist(echo.x,echo.y,mo.x,mo.y)<=1);
      body+=`<p class="muted" style="font-size:12px;margin:0 0 8px">Attack through the echo — pick a target within 5 ft of it.</p>`;
      body+=targets.map((mo,i)=>`<div class="spell"><div class="nm"><b>${esc(mo.name)}</b><small>AC ${mo.ac} · (${mo.x},${mo.y})</small></div>
        <button class="btn sm" data-inctgt="${i}">Attack</button></div>`).join('');
      body+=`<button class="btn ghost block" id="useBack" style="margin-top:8px">← Back</button>
        <button class="btn ghost block" id="useClose" style="margin-top:6px">Cancel</button>`;
    } else if(pick.kind==='intimidatePick'){
      body+=`<p class="muted" style="font-size:12px;margin:0 0 8px">Intimidating Presence — pick a target within 30 ft. Action.</p>`;
      body+=intimidateTargets.map((mo,i)=>`<div class="spell"><div class="nm"><b>${esc(mo.name)}</b><small>(${mo.x},${mo.y}) · ${gridDist(me.x,me.y,mo.x,mo.y)*5} ft</small></div>
        <button class="btn sm" data-intimtgt="${i}">Frighten</button></div>`).join('');
      body+=`<button class="btn ghost block" id="useBack" style="margin-top:8px">← Back</button>
        <button class="btn ghost block" id="useClose" style="margin-top:6px">Cancel</button>`;
    } else if(pick.kind==='preserveLifePick'){
      body+=`<p class="muted" style="font-size:12px;margin:0 0 8px">Preserve Life — <b>${pick.pool} HP</b> left to distribute. Tap a target to give it the max allowed (½ its max HP).</p>`;
      body+=preserveLifeTargets.map((t,i)=>{
        const amt=preserveLifeAmount(pick.pool, t.hpMax, pick.healed[i]);
        return `<div class="spell"><div class="nm"><b>${esc(t.name)}</b><small>${t.hpCur+pick.healed[i]}/${t.hpMax} HP</small></div>
          <button class="btn sm" data-pltgt="${i}" ${amt<=0?'disabled style="opacity:.5"':''}>+${amt} HP</button></div>`;
      }).join('');
      body+=`<button class="btn block" id="usePreserveLifeDone" style="margin-top:8px">Done</button>`;
    } else if(pick.kind==='healTarget'){
      body+=`<p class="muted" style="font-size:12px;margin:0 0 8px"><b>${esc(pick.t.name)}</b> — ${pick.t.hpCur}/${pick.t.hpMax} HP. Uses your action.</p>
        <button class="btn block" id="useHealerHeal">💉 Heal (1d6+4 + hit dice)</button>`;
      body+=`<button class="btn ghost block" id="useBack" style="margin-top:8px">← Back</button>
        <button class="btn ghost block" id="useClose" style="margin-top:6px">Cancel</button>`;
    } else if(pick.kind==='chargerPick'){
      body+=`<p class="muted" style="font-size:12px;margin:0 0 8px">Charger — pick a foe, then choose the attack or the shove.</p>`;
      body+=foes.map((mo,i)=>`<div class="spell"><div class="nm"><b>${esc(mo.name)}</b><small>AC ${mo.ac} · (${mo.x},${mo.y})</small></div>
        <button class="btn ghost sm" data-chargeratk="${i}">⚔ +5 dmg</button>
        <button class="btn ghost sm" data-chargershove="${i}">🤜 Shove 10ft</button></div>`).join('');
      body+=`<button class="btn ghost block" id="useBack" style="margin-top:8px">← Back</button>
        <button class="btn ghost block" id="useClose" style="margin-top:6px">Cancel</button>`;
    } else if(pick.kind==='mountPick'){
      body+=`<p class="muted" style="font-size:12px;margin:0 0 8px">Mount up — half your speed. Only mounts you've marked as owned on your sheet (Equipment tab) show here.</p>`;
      body+=MOUNT_CATALOG.map((m,i)=>({m,i})).filter(({m})=>(c.ownedMounts||[]).includes(m.id)).map(({m,i})=>`<div class="spell"><div class="nm"><b>${esc(m.label)}</b><small>AC ${m.ac} · HP ${m.hp} · ${m.spd} ft speed</small></div>
        <button class="btn sm" data-mounttgt="${i}">Mount</button></div>`).join('');
      body+=`<button class="btn ghost block" id="useBack" style="margin-top:8px">← Back</button>
        <button class="btn ghost block" id="useClose" style="margin-top:6px">Cancel</button>`;
    } else if(pick.kind==='servant'){
      // A direct reposition within 15 ft (3 tiles), blocked by tileClearFor — simplified from
      // RAW pathfinding, matching how a one-word mental command isn't really "movement" in the
      // normal PC-turn sense. Interact list is scoped to the SERVANT's tile, not the caster's.
      const servTiles=servantMoveTiles(ad, servant);
      const servItems=listInteractInRange(s, servant, 1);
      body+=`<p class="muted" style="font-size:12px;margin:0 0 8px">Unseen Servant at (${servant.x},${servant.y}). Bonus action.</p>`;
      body+=`<div class="chips" style="margin-bottom:8px">${servTiles.map((t,i)=>`<button class="chip" data-servmove="${i}">→ ${t.x},${t.y}</button>`).join('')}</div>`;
      if(servItems.length) body+=servItems.map((it,i)=>{
        const st=it.obj.state||it.def.default;
        return `<div class="spell"><div class="nm"><b>${esc(it.def.name)}</b><small>${st} · (${it.x},${it.y})</small></div>
          <button class="btn sm" data-servint="${i}">Use</button></div>`;
      }).join('');
      else body+=`<p class="muted" style="font-size:12px;margin:8px 0">Nothing for it to interact with nearby.</p>`;
      body+=`<button class="btn ghost block" id="useBack" style="margin-top:8px">← Back</button>
        <button class="btn ghost block" id="useClose" style="margin-top:6px">Cancel</button>`;
    } else if(pick.kind==='confirmRoll'){
      body+=`<p class="muted" style="font-size:12px;margin:0 0 8px">${esc(pick.desc)}</p>
        <button class="btn block" id="useRollGo">🎲 Roll ${esc(pick.skillLabel)}</button>`;
      body+=`<button class="btn ghost block" id="useBack" style="margin-top:8px">← Back</button>
        <button class="btn ghost block" id="useClose" style="margin-top:6px">Cancel</button>`;
    } else if(pick.kind==='maneuverResult'){
      const r=pick.res;
      body+=`<p class="muted" style="font-size:12px;margin:0 0 8px">${esc(pick.label)}</p>
        <div class="card" style="text-align:center;margin:0 0 8px">
          <div style="font-family:Georgia,serif;font-size:28px;font-weight:700;color:${r.success?'var(--good)':'var(--bad)'}">${r.atkTotal} vs ${r.defTotal}</div>
          <div class="muted" style="font-size:12px">${esc(r.atkSkill)} ${r.atkTotal} vs ${esc(r.defSkill)} ${r.defTotal} — ${r.success?'SUCCESS':'FAILED'}</div>
        </div>
        <button class="btn block" id="useManeuverOk">Continue</button>`;
    } else if(pick.kind==='flurryTechnique'){
      const mo=pick.mo;
      body+=`<p class="muted" style="font-size:12px;margin:0 0 8px">Open Hand Technique — if either strike hits <b>${esc(mo.name)}</b>, impose one effect (your choice):</p>
        <button class="btn block" data-usea="prone" style="margin-bottom:8px;text-align:left">🤸 Knock Prone<small style="display:block;opacity:.75">Dex save vs your ki DC</small></button>
        <button class="btn block" data-usea="push" style="margin-bottom:8px;text-align:left">🤜 Push 15 ft<small style="display:block;opacity:.75">Str save vs your ki DC</small></button>
        <button class="btn block" data-usea="noreact" style="margin-bottom:8px;text-align:left">🚫 Deny Reactions<small style="display:block;opacity:.75">No save — can't react until end of your next turn</small></button>
        <button class="btn ghost block" data-usea="none" style="margin-bottom:8px;text-align:left">Just attack, no effect</button>`;
      body+=`<button class="btn ghost block" id="useBack" style="margin-top:8px">← Back</button>
        <button class="btn ghost block" id="useClose" style="margin-top:6px">Cancel</button>`;
    } else if(pick.kind==='foe'){
      const mo=pick.mo;
      body+=`<p class="muted" style="font-size:12px;margin:0 0 8px"><b>${esc(mo.name)}</b> at (${mo.x},${mo.y}) — Athletics vs Athletics/Acrobatics. Uses one of your attacks.</p>
        <button class="btn block" data-usea="shove-prone" style="margin-bottom:8px;text-align:left">🤼 Shove — knock Prone</button>
        <button class="btn block" data-usea="shove-push" style="margin-bottom:8px;text-align:left">🤼 Shove — push 5 ft</button>
        <button class="btn block" data-usea="grapple" style="margin-bottom:8px;text-align:left">🤼 Grapple<small style="display:block;opacity:.75">Grappled: speed 0 until it escapes</small></button>
        <button class="btn block" data-usea="taunt" style="margin-bottom:8px;text-align:left">😠 Taunt<small style="display:block;opacity:.75">Intimidation vs Insight — success: Frightened of you</small></button>
        <button class="btn block" data-study="1" style="margin-bottom:8px;text-align:left">📖 Recall Knowledge<small style="display:block;opacity:.75">Arcana/History/Nature/Religion vs DC 10+CR — uses your action</small></button>`;
      if(c.frenzied && isRaging(c)) body+=`<button class="btn block" data-usea="frenzy" style="margin-bottom:8px;text-align:left"${c.battle&&c.battle.bonus?' disabled style="opacity:.5"':''}>🩸 Frenzy Attack<small style="display:block;opacity:.75">${c.battle&&c.battle.bonus?'Bonus action already used':'A melee attack as your bonus action'}</small></button>`;
      if(isBerserker(c,14)) body+=`<button class="btn block" data-usea="retaliate" style="margin-bottom:8px;text-align:left"${c.battle&&c.battle.reaction?' disabled style="opacity:.5"':''}>🩸 Retaliation<small style="display:block;opacity:.75">${c.battle&&c.battle.reaction?'Reaction already used':'Reaction — a melee attack against this adjacent foe'}</small></button>`;
      if(c.cls==='Monk' && (Number(c.level)||1)>=2) body+=`<button class="btn block" data-usea="flurry" style="margin-bottom:8px;text-align:left"${(c.battle&&c.battle.bonus)||(c.kiLeft||0)<=0?' disabled style="opacity:.5"':''}>🥋 Flurry of Blows — 1 ki<small style="display:block;opacity:.75">${c.battle&&c.battle.bonus?'Bonus action already used':(c.kiLeft||0)<=0?'No ki left':'Bonus action — two unarmed strikes'}</small></button>`;
      if(isOpenHandMonk(c,17)) body+=`<button class="btn block" data-usea="quiveringpalm" style="margin-bottom:8px;text-align:left"${(c.kiLeft||0)<3?' disabled style="opacity:.5"':''}>🥋 Quivering Palm — 3 ki<small style="display:block;opacity:.75">${(c.kiLeft||0)<3?'Needs 3 ki':'Unarmed strike; set vibrations on a hit'}</small></button>`;
      if(isOpenHandMonk(c,17) && mo.quiveringPalmBy) body+=`<button class="btn block" data-usea="quiveringtrigger" style="margin-bottom:8px;text-align:left">💀 Trigger Quivering Palm<small style="display:block;opacity:.75">Action — force its Constitution save</small></button>`;
      if(isHunter(c,3) && c.hunterPrey==='Giant Killer') body+=`<button class="btn block" data-usea="giantkiller" style="margin-bottom:8px;text-align:left"${c.battle&&c.battle.reaction?' disabled style="opacity:.5"':''}>🏹 Giant Killer<small style="display:block;opacity:.75">${c.battle&&c.battle.reaction?'Reaction already used':'Reaction — attack back after it hits or misses you (Large+ only, size unchecked)'}</small></button>`;
      if(isHunter(c,3) && c.hunterPrey==='Horde Breaker' && !(c.battle&&c.battle.hordeBreakerUsed)){
        const second=foes.filter(m=>m!==mo && gridDist(mo.x,mo.y,m.x,m.y)<=1);
        if(second.length) body+=`<button class="btn block" data-usea="hordebreaker" style="margin-bottom:8px;text-align:left">🏹 Horde Breaker<small style="display:block;opacity:.75">One more attack against a creature within 5 ft of ${esc(mo.name)} — once/turn</small></button>`;
      }
      body+=`<button class="btn ghost block" id="useBack" style="margin-top:8px">← Back</button>
        <button class="btn ghost block" id="useClose" style="margin-top:6px">Cancel</button>`;
    } else if(pick.kind==='volleyPick'){
      const rangedAtk=qbPcAttacks(c).find(a=>!a.melee);
      const near=s.monsters.filter(mo=>mo.hp>0 && isHostile(mo) && gridDist(me.x,me.y,mo.x,mo.y)<=(rangedAtk?rangedAtk.tiles||1:12));
      body+=`<p class="muted" style="font-size:12px;margin:0 0 8px">Volley — pick a foe; every foe within 10 ft of it (including it) takes a separate attack roll.</p>`;
      body+=near.map((mo,i)=>`<div class="spell"><div class="nm"><b>${esc(mo.name)}</b><small>AC ${mo.ac} · (${mo.x},${mo.y})</small></div><button class="btn sm" data-volleytgt="${i}">Center here</button></div>`).join('');
      body+=`<button class="btn ghost block" id="useBack" style="margin-top:8px">← Back</button>
        <button class="btn ghost block" id="useClose" style="margin-top:6px">Cancel</button>`;
    } else if(pick.kind==='hordeBreakerPick'){
      const mo=pick.mo, second=foes.filter(m=>m!==mo && gridDist(mo.x,mo.y,m.x,m.y)<=1);
      body+=`<p class="muted" style="font-size:12px;margin:0 0 8px">Horde Breaker — attack a creature within 5 ft of ${esc(mo.name)}:</p>`;
      body+=second.map((m,i)=>`<div class="spell"><div class="nm"><b>${esc(m.name)}</b><small>AC ${m.ac} · (${m.x},${m.y})</small></div><button class="btn sm" data-hbtgt="${i}">Attack</button></div>`).join('');
      body+=`<button class="btn ghost block" id="useBack" style="margin-top:8px">← Back</button>
        <button class="btn ghost block" id="useClose" style="margin-top:6px">Cancel</button>`;
    } else if(pick.kind==='study'){
      const mo=pick.mo;
      body+=`<p class="muted" style="font-size:12px;margin:0 0 8px">Recall what you know about <b>${esc(mo.name)}</b> — pick a skill.</p>
        <button class="btn block" data-studysk="arcana" style="margin-bottom:8px;text-align:left">Arcana</button>
        <button class="btn block" data-studysk="history" style="margin-bottom:8px;text-align:left">History</button>
        <button class="btn block" data-studysk="nature" style="margin-bottom:8px;text-align:left">Nature</button>
        <button class="btn block" data-studysk="religion" style="margin-bottom:8px;text-align:left">Religion</button>`;
      body+=`<button class="btn ghost block" id="useBack" style="margin-top:8px">← Back</button>
        <button class="btn ghost block" id="useClose" style="margin-top:6px">Cancel</button>`;
    } else {
      const acts=availableInteractActions(pick.obj, 'adj');
      body+=`<p class="muted" style="font-size:12px;margin:0 0 8px"><b>${esc(pick.def.name)}</b> at (${pick.x},${pick.y}) — ${esc(pick.obj.state||pick.def.default)}</p>`;
      if(!acts.length) body+=`<div class="empty">Nothing you can do with that right now.</div>`;
      else body+=acts.map(a=>`<button class="btn block" data-usea="${esc(a.id)}" style="margin-bottom:8px;text-align:left">${esc(a.label)}${a.note?`<small style="display:block;opacity:.75">${esc(a.note)}</small>`:''}</button>`).join('');
      body+=`<button class="btn ghost block" id="useBack" style="margin-top:8px">← Back</button>
        <button class="btn ghost block" id="useClose" style="margin-top:6px">Cancel</button>`;
    }
    $('#modalRoot').innerHTML=`<div class="modal" id="useModal"><div class="sheet"><div class="grip"></div>${body}</div></div>`;
    // Every maneuver mutates state via `ad`/`log` (network sends already happen inside
    // ad.addCond/ad.moveUnit for player-net) — this wrapper just does the UI-layer bookkeeping
    // every path needs (close modal, save, re-render, and mode-specific extras).
    const afterManeuver=()=>{ $('#modalRoot').innerHTML=''; save(); render(); if(mode==='qb') qbCheckEnd(); if(mode==='player') playerHello(); };
    // The maneuverResult view has already mutated state (the roll+apply happened before this
    // card ever rendered) and only ever shows a "Continue" button, no #useClose — route the
    // generic close/backdrop-dismiss through afterManeuver there so a stray backdrop tap
    // doesn't leave the mutation un-saved/un-rendered behind a closed modal.
    const dismiss = pick&&pick.kind==='maneuverResult' ? afterManeuver : ()=>{ $('#modalRoot').innerHTML=''; };
    { const cl=$('#useClose'); if(cl) cl.onclick=dismiss; }
    $('#useModal').onclick=e=>{ if(e.target.id==='useModal') dismiss(); };
    // Shove/Grapple/Escape already roll+apply atomically (no separate damage phase to
    // interleave, unlike Attack) — but the result is worth SEEING before the modal closes,
    // same spirit as Attack's roll-then-result card. Route through a result screen instead of
    // closing immediately; save/render is deferred to when the player taps Continue.
    const showManeuverResult=(label, res)=>{
      if(!res || !res.ok || res.atkTotal==null){ afterManeuver(); return; }   // no roll happened (e.g. blocked by range/no action) — nothing to show
      draw({kind:'maneuverResult', label, res});
    };
    { const bk=$('#useBack'); if(bk) bk.onclick=()=>draw(pick&&pick.kind==='confirmRoll'?pick.backTo:pick&&(pick.kind==='study'||pick.kind==='flurryTechnique'||pick.kind==='hordeBreakerPick')?{kind:'foe',mo:pick.mo}:null); }
    { const upl=$('#usePreserveLife'); if(upl) upl.onclick=()=>{
      if((c.channelDivinityLeft||0)<=0){ flashBanner('No Channel Divinity uses left — rest to recharge'); return; }
      if(c.battle && !hasAction(c)){ flashBanner('No action left this turn'); return; }
      if(c.battle) spendAction(c);
      c.channelDivinityLeft--;
      draw({kind:'preserveLifePick', pool:preserveLifePool(c), healed:preserveLifeTargets.map(()=>0)});
    }; }
    document.querySelectorAll('[data-pltgt]').forEach(b=>b.onclick=()=>{
      const i=Number(b.dataset.pltgt), t=preserveLifeTargets[i]; if(!t) return;
      const amt=preserveLifeAmount(pick.pool, t.hpMax, pick.healed[i]);
      if(amt<=0) return;
      pick.pool-=amt; pick.healed[i]+=amt;
      if(t.self){ applyHp(c, amt); log('✝️ '+c.name+' channels Preserve Life — heals '+amt+' HP'); }
      else { if(net.conn) try{ net.conn.send({t:'healApply', targetId:t.id, amount:amt, from:c.name}); }catch(e){} log('✝️ '+c.name+' channels Preserve Life — sends '+amt+' HP to '+t.name); }
      draw(pick);
    });
    { const upld=$('#usePreserveLifeDone'); if(upld) upld.onclick=afterManeuver; }
    { const uhh=$('#useHealerHeal'); if(uhh) uhh.onclick=()=>{
      if(!hasAction(c)){ flashBanner('No action left'); return; }
      const t=pick.t; if(!t) return;
      spendAction(c);
      const r=rollNotation('1d6+4');
      const heal=r.total+Math.max(1,Number(t.level)||1);
      log('💉 '+c.name+' tends to '+t.name+' — '+heal+' HP');
      if(net.conn) try{ net.conn.send({t:'healerHeal', targetId:t.id, amount:heal}); }catch(e){}
      flashBanner(t.name+' healed for '+heal+' HP');
      afterManeuver();
    }; }
    { const uil=$('#useInspiringLeader'); if(uil) uil.onclick=()=>{
      if(c.inspiringLeaderUsed){ flashBanner('Already used — rest to recharge'); return; }
      c.inspiringLeaderUsed=true;
      const amt=inspiringLeaderAmount(c);
      inspiringLeaderTargets.forEach(t=>{
        if(t.self){ c.hp.temp=Math.max(c.hp.temp||0, amt); }
        else if(net.conn) try{ net.conn.send({t:'tempHpApply', targetId:t.id, amount:amt}); }catch(e){}
      });
      log('🎺 '+c.name+' rallies the party — +'+amt+' temp HP each');
      flashBanner('🎺 Inspiring Leader — +'+amt+' temp HP to '+inspiringLeaderTargets.length+' '+(inspiringLeaderTargets.length===1?'creature':'creatures'));
      afterManeuver();
    }; }
    document.querySelectorAll('[data-chargeratk]').forEach(b=>b.onclick=()=>{
      if(c.battle.bonus){ flashBanner('Bonus action already used'); return; }
      const mo=foes[Number(b.dataset.chargeratk)]; if(!mo) return;
      c.battle.bonus=true;
      const atk=qbPcAttacks(c).find(a=>a.melee)||{name:'Unarmed strike', toHit:mod(abil(c,'str'))+profBonus(c), dmg:String(1+mod(abil(c,'str'))), dt:'bludgeoning', tiles:1, melee:true};
      const ev=Engine.attack(ad, me.id, mo.id, {name:'Charger ('+atk.name+')', toHit:atk.toHit, dmg:atk.dmg+'+5', dtype:atk.dt, tiles:1});
      log('🏃 Charger — '+(ev.hit?'hits '+mo.name+' for '+ev.dmg+' (+5 dmg)':'misses '+mo.name));
      flashBanner(ev.hit?'🏃 Charger hits '+mo.name+' for '+ev.dmg:'🏃 Charger misses '+mo.name);
      $('#modalRoot').innerHTML=''; save(); render(); if(mode==='qb') qbCheckEnd(); if(mode==='player') playerHello();
    });
    document.querySelectorAll('[data-chargershove]').forEach(b=>b.onclick=()=>{
      if(c.battle.bonus){ flashBanner('Bonus action already used'); return; }
      const mo=foes[Number(b.dataset.chargershove)]; if(!mo) return;
      c.battle.bonus=true;
      maneuverShove(ad, me, mo, 'push', log, 2, true);   // Charger: 10 ft, bonus action not the Action
      $('#modalRoot').innerHTML=''; save(); render(); if(mode==='qb') qbCheckEnd(); if(mode==='player') playerHello();
    });
    // Mount sync (player-net only): the DM's copy is authoritative, same "local echo, then
    // tell the DM" shape sendEchoSync already established — looked up by controllerId on the
    // DM's side (mountSync handler), not by an exact shared id, matching echoSync's own
    // slightly loose-but-working convention.
    const sendMountSync=(liveMount)=>{ if(mode!=='player'||!net.conn) return;
      try{ net.conn.send(liveMount ? {t:'mountSync', exists:true, mountName:liveMount.name, ac:liveMount.ac, hp:liveMount.hp, max:liveMount.max, spd:liveMount.speed, x:liveMount.x, y:liveMount.y} : {t:'mountSync', exists:false}); }catch(e){} };
    document.querySelectorAll('[data-mounttgt]').forEach(b=>b.onclick=()=>{
      const def=MOUNT_CATALOG[Number(b.dataset.mounttgt)]; if(!def) return;
      const unit=mountUp(s, c, mode==='qb'?'pc':net.peer.id, def, me.x, me.y, log);
      if(!unit) return;
      sendMountSync(unit);
      $('#modalRoot').innerHTML=''; save(); render(); if(mode==='player') playerHello();
    });
    { const ud=$('#useDismount'); if(ud) ud.onclick=()=>{
      const ok=dismountRider(c, log, null, s);
      if(ok) sendMountSync(null);
      $('#modalRoot').innerHTML=''; save(); render(); if(mode==='player') playerHello();
    }; }
    { const au=$('#useAltUp'); if(au) au.onclick=()=>{
      if(((c.battle&&c.battle.move)||0)<5){ flashBanner('Not enough movement left'); return; }
      c.battle.move=Math.max(0,c.battle.move-5); c.altitude=(c.altitude||0)+5;
      log('🕊️ '+c.name+' climbs to '+c.altitude+' ft');
      $('#modalRoot').innerHTML=''; save(); render(); if(mode==='player') playerHello();
    }; }
    { const ad=$('#useAltDown'); if(ad) ad.onclick=()=>{
      if(!(c.altitude>0)) return;
      c.altitude=Math.max(0,(c.altitude||0)-5); if(c.battle) c.battle.move=Math.max(0,(c.battle.move||0)-5);
      log('🕊️ '+c.name+' descends to '+c.altitude+' ft');
      $('#modalRoot').innerHTML=''; save(); render(); if(mode==='player') playerHello();
    }; }
    { const uw=$('#useWhirlwind'); if(uw) uw.onclick=()=>{
      if(c.battle && !hasAction(c)){ flashBanner('No action left this turn'); return; }
      if(c.battle) spendAction(c);
      const atk=qbPcAttacks(c).find(a=>a.melee)||{name:'Unarmed strike', toHit:mod(abil(c,'str'))+profBonus(c), dmg:String(1+mod(abil(c,'str'))), dt:'bludgeoning', tiles:1, melee:true};
      let hits=0;
      foes.forEach(mo=>{ const ev=Engine.attack(ad, me.id, mo.id, {name:'Whirlwind Attack ('+atk.name+')', toHit:atk.toHit, dmg:atk.dmg, dtype:atk.dt, tiles:1}); if(ev.hit) hits++; log('🏹 Whirlwind — '+(ev.hit?'hits '+mo.name+' for '+ev.dmg:'misses '+mo.name)); });
      flashBanner('🏹 Whirlwind Attack — hit '+hits+'/'+foes.length);
      $('#modalRoot').innerHTML=''; save(); render(); if(mode==='qb') qbCheckEnd(); if(mode==='player') playerHello();
    }; }
    { const uv=$('#useVolley'); if(uv) uv.onclick=()=>draw({kind:'volleyPick'}); }
    document.querySelectorAll('[data-volleytgt]').forEach(b=>b.onclick=()=>{
      const rangedAtk=qbPcAttacks(c).find(a=>!a.melee); if(!rangedAtk) return;
      const near=s.monsters.filter(mo=>mo.hp>0 && isHostile(mo) && gridDist(me.x,me.y,mo.x,mo.y)<=(rangedAtk.tiles||1));
      const ctr=near[Number(b.dataset.volleytgt)]; if(!ctr) return;
      if(c.battle && !hasAction(c)){ flashBanner('No action left this turn'); return; }
      if(c.battle) spendAction(c);
      const group=s.monsters.filter(mo=>mo.hp>0 && isHostile(mo) && inBlast(ctr.x,ctr.y,mo.x,mo.y,2));
      let hits=0;
      group.forEach(mo=>{ const ev=Engine.attack(ad, me.id, mo.id, {name:'Volley ('+rangedAtk.name+')', toHit:rangedAtk.toHit, dmg:rangedAtk.dmg, dtype:rangedAtk.dt, tiles:rangedAtk.tiles}); if(ev.hit) hits++; log('🏹 Volley — '+(ev.hit?'hits '+mo.name+' for '+ev.dmg:'misses '+mo.name)); });
      flashBanner('🏹 Volley — hit '+hits+'/'+group.length);
      $('#modalRoot').innerHTML=''; save(); render(); if(mode==='qb') qbCheckEnd(); if(mode==='player') playerHello();
    });
    // Marking a foe Surprised (Assassinate's auto-crit clause, Death Strike) — this app has no
    // ambush/surprise-round system, so a manual toggle stands in for it. Mode-parity audit fix:
    // this used to be QB-only on the theory that player-net's monster list is "just a synced
    // mirror" and a local toggle "wouldn't reach the DM's real session" — true, but irrelevant:
    // `foes` here and `attackFlow`'s own targetMo lookup both read the SAME net.session.monsters
    // array by reference, so this device's own subsequent attack (all Assassinate needs) sees
    // the flag correctly without any round-trip. Other devices not seeing the mark is a real,
    // acceptable gap (nobody else needs to know), not a reason to block the mechanic outright.
    document.querySelectorAll('[data-suptgl]').forEach(b=>b.onclick=()=>{
      const mo=foes[Number(b.dataset.suptgl)]; if(!mo) return;
      mo.surprised=!mo.surprised;
      flashBanner(mo.name+(mo.surprised?' is now marked Surprised':' is no longer marked Surprised'));
      log((mo.surprised?'😲 ':'')+mo.name+(mo.surprised?' — Surprised':' — no longer surprised'));
      draw(null); save();
    });
    document.querySelectorAll('[data-hbtgt]').forEach(b=>b.onclick=()=>{
      const mo0=pick.mo, second=foes.filter(m=>m!==mo0 && gridDist(mo0.x,mo0.y,m.x,m.y)<=1);
      const mo=second[Number(b.dataset.hbtgt)]; if(!mo) return;
      const atk=qbPcAttacks(c).find(a=>a.melee||(a.tiles||1)>1)||{name:'Unarmed strike', toHit:mod(abil(c,'str'))+profBonus(c), dmg:String(1+mod(abil(c,'str'))), dt:'bludgeoning', tiles:1, melee:true};
      draw({kind:'confirmRoll', desc:'Horde Breaker — '+esc(mo.name)+' with '+esc(atk.name)+'.', skillLabel:atk.name, backTo:{kind:'hordeBreakerPick',mo:mo0}, run:()=>{
        if(c.battle && c.battle.hordeBreakerUsed){ flashBanner('Horde Breaker already used this turn'); return null; }
        if(c.battle) c.battle.hordeBreakerUsed=true;
        const ev=Engine.attack(ad, me.id, mo.id, {name:'Horde Breaker ('+atk.name+')', toHit:atk.toHit, dmg:atk.dmg, dtype:atk.dt, tiles:atk.tiles||1});
        if(ev.hit) flashBanner('🏹 Horde Breaker hits '+mo.name+' for '+ev.dmg); else flashBanner('🏹 Horde Breaker misses '+mo.name);
        log('🏹 '+c.name+' unleashes Horde Breaker at '+mo.name+' — '+(ev.hit?'hit for '+ev.dmg:'miss'));
        return null;
      }});
    });
    { const ok=$('#useManeuverOk'); if(ok) ok.onclick=afterManeuver; }
    // Every maneuver used to roll the instant you tapped it — one click, no visible "this is
    // the moment of the roll" beat. Now every skill-based Use action routes through a confirm
    // screen with its own explicit "🎲 Roll" button first, matching the same pick-target-then-
    // roll rhythm the attack modal already uses — the roll itself only happens on that tap.
    { const rg=$('#useRollGo'); if(rg) rg.onclick=()=>{ const out=pick.run(); if(out) showManeuverResult(out.label, out.res); else afterManeuver(); }; }
    { const es=$('#useEscape'); if(es) es.onclick=()=>{ draw({kind:'confirmRoll', desc:'Escape the grapple — Athletics/Acrobatics (your choice) vs the grappler\'s Athletics.', skillLabel:'Athletics/Acrobatics', backTo:null, run:()=>({label:'Escape Grapple', res:maneuverEscape(ad, me, true, log)})}); }; }
    { const hd=$('#useHide'); if(hd) hd.onclick=()=>{ draw({kind:'confirmRoll', desc:'Attempt to Hide — needs darkness, full cover, or (Skulker) dim light.', skillLabel:'Stealth', backTo:null, run:()=>{ maneuverHide(ad, me, log); return null; }}); }; }
    { const stb=$('#useStabilize'); if(stb) stb.onclick=()=>{
      const al=pick.al;
      const kb=$('#useStabKit'); const useKit=!!(kb&&kb.checked);
      draw({kind:'confirmRoll', desc:'Stabilize '+al.name+(useKit?' — healer\'s kit (auto-succeeds).':' — Medicine DC 10.'), skillLabel:'Medicine', backTo:{kind:'ally',al}, run:()=>{
        const res=maneuverStabilize(ad, me, al.name, log, {kit:useKit});
        if(res.ok && res.success && net.conn){ try{ net.conn.send({t:'stabilize', targetId:al.id, healHp:res.healerFeatHp||0}); }catch(e){} }
        return null;
      }});
    }; }
    document.querySelectorAll('[data-use]').forEach(b=>b.onclick=()=>{
      const [kind,idx]=b.dataset.use.split(':');
      draw(kind==='foe' ? {kind:'foe', mo:foes[Number(idx)]} : kind==='ally' ? {kind:'ally', al:allies[Number(idx)]}
        : kind==='heal' ? {kind:'healTarget', t:healerHealTargets[Number(idx)]}
        : kind==='charger' ? {kind:'chargerPick'} : kind==='mountup' ? {kind:'mountPick'}
        : kind==='servant' ? {kind:'servant'} : kind==='echo' ? {kind:'echo'} : kind==='intimidate' ? {kind:'intimidatePick'} : Object.assign({kind:'obj'}, items[Number(idx)]));
    });
    // Commanding the servant spends the BONUS action resource, independent of the shared
    // Action-based afterManeuver flow every other Use-menu item runs through.
    const spendServantCommand=()=>{ if(c.battle) c.battle.bonus=true; $('#modalRoot').innerHTML=''; save(); render();
      if(mode==='player') playerHello(); if(mode==='qb') qbLog('👻 '+c.name+' commands the Unseen Servant'); };
    { const me2=$('#useManifestEcho'); if(me2) me2.onclick=()=>{
      if(c.battle && c.battle.bonus){ flashBanner('Bonus action already used'); return; }
      draw({kind:'manifestEchoPick'});
    }; }
    // Echo Knight, player-net only: a real DM (unlike QB, which is entirely local) needs to
    // know the echo exists at all — mutating `s` (the player's own local mirror) alone is
    // invisible to the DM's authoritative net.session.monsters, so every mutation also sends
    // an echoSync message the DM applies (see dmOnData) and rebroadcasts to everyone.
    const sendEchoSync=(liveEcho)=>{ if(mode!=='player'||!net.conn) return;
      try{ net.conn.send(liveEcho ? {t:'echoSync', exists:true, x:liveEcho.x, y:liveEcho.y, ac:liveEcho.ac, hp:liveEcho.hp, max:liveEcho.max, name:liveEcho.name} : {t:'echoSync', exists:false}); }catch(e){} };
    document.querySelectorAll('[data-echospot]').forEach(b=>b.onclick=()=>{
      if(c.battle && c.battle.bonus){ flashBanner('Bonus action already used'); return; }
      const t=servantMoveTiles(ad, {x:me.x,y:me.y})[Number(b.dataset.echospot)];
      if(!t) return;
      const newEcho=manifestEcho(s, c, t.x, t.y, echoControllerId, log);
      if(c.battle) c.battle.bonus=true;
      sendEchoSync(newEcho);
      $('#modalRoot').innerHTML=''; save(); render(); if(mode==='player') playerHello();
    });
    document.querySelectorAll('[data-echomove]').forEach(b=>b.onclick=()=>{
      const t=echoMoveTiles(ad, echo)[Number(b.dataset.echomove)];
      if(!t) return;
      echo.x=t.x; echo.y=t.y;
      sendEchoSync(echo);
      $('#modalRoot').innerHTML=''; save(); render(); if(mode==='player') playerHello();
    });
    document.querySelectorAll('[data-echoint]').forEach(b=>b.onclick=()=>{
      const it=listInteractInRange(s, echo, 1)[Number(b.dataset.echoint)];
      if(!it) return;
      const acts=availableInteractActions(it.obj, 'adj'); const a=acts[0];
      if(!a){ flashBanner('Nothing it can do with that'); return; }
      const res=runInteractAction(s, c, it.key, a.id, 'adj');
      if(!res.ok){ flashBanner(res.msg); return; }
      logChange(c, '👤 '+res.msg); flashBanner('👤 '+res.msg); sfx('cast');
      $('#modalRoot').innerHTML=''; save(); render(); if(mode==='player') playerHello();
    });
    { const esw=$('#useEchoSwap'); if(esw) esw.onclick=()=>{
      if(c.battle && c.battle.bonus){ flashBanner('Bonus action already used'); return; }
      if((c.battle&&c.battle.move||0)<15){ flashBanner('Not enough movement left (needs 15 ft)'); return; }
      // `me` is a throwaway copy in player-net (see openAdjacentUseUI's player-net call site,
      // which wraps it in Object.assign for adapter purposes) — the REAL position the map/DM
      // mirror actually reads lives on net.session.players' own entry, same lookup every other
      // player-net position mutation already uses (see the move-token animateToken calls).
      const realMe = mode==='player' ? s.players.find(p=>p.id===net.peer.id) : me;
      if(!realMe){ flashBanner('Could not find your own token'); return; }
      const ex=echo.x, ey=echo.y;
      echo.x=realMe.x; echo.y=realMe.y; realMe.x=ex; realMe.y=ey;
      if(c.battle) c.battle.move=Math.max(0,(c.battle.move||0)-15);
      c.battle.bonus=true;
      log('🔀 '+c.name+' teleport-swaps with the echo');
      sendEchoSync(echo);
      if(mode==='player'&&net.conn) try{ net.conn.send({t:'move', x:realMe.x, y:realMe.y}); }catch(e){}
      $('#modalRoot').innerHTML=''; save(); render(); if(mode==='player') playerHello();
    }; }
    { const edm=$('#useEchoDismiss'); if(edm) edm.onclick=()=>{
      if(c.battle && c.battle.bonus){ flashBanner('Bonus action already used'); return; }
      dismissEcho(s, echoControllerId, log);
      if(c.battle) c.battle.bonus=true;
      sendEchoSync(null);
      $('#modalRoot').innerHTML=''; save(); render(); if(mode==='player') playerHello();
    }; }
    { const ui=$('#useIncarnation'); if(ui) ui.onclick=()=>draw({kind:'incarnationPick'}); }
    { const eav=$('#useEchoAvatar'); if(eav) eav.onclick=()=>{
      if(c.echoAvatarUsed){ flashBanner('Echo Avatar already used — rest to recharge'); return; }
      if(c.battle&&!hasAction(c)){ flashBanner('No Action left this turn'); return; }
      if(c.battle) spendAction(c);
      c.echoAvatarUsed=true;
      // Two effect entries (one per condition) so the existing round-countdown/expiry
      // machinery (advanceRound, keyed on a single e.cond per effect) clears both together
      // after 10 minutes (60 rounds) without needing a new multi-condition effect shape.
      addEffect(c, 'Echo Avatar (Blinded)', {rounds:60, cond:'Blinded', note:'Seeing through your echo instead of your own eyes.'});
      addEffect(c, 'Echo Avatar (Deafened)', {rounds:60, cond:'Deafened', note:'Hearing through your echo instead of your own ears.'});
      log('👁 '+c.name+' sees and hears through the echo');
      flashBanner('👁 Echo Avatar — blinded/deafened for 10 min while you watch through the echo');
      if(mode==='qb' && typeof frameCameraOnCellSmooth==='function') try{ frameCameraOnCellSmooth(QB, echo.x, echo.y, 1.55); }catch(e){}
      $('#modalRoot').innerHTML=''; save(); render(); if(mode==='player') playerHello();
    }; }
    { const sm=$('#useShadowMartyr'); if(sm) sm.onclick=()=>{
      if(c.shadowMartyrUsed){ flashBanner('Shadow Martyr already used — rest to recharge'); return; }
      c.shadowMartyrArmed=!c.shadowMartyrArmed;
      flashBanner(c.shadowMartyrArmed?'🛡 Shadow Martyr armed — the next attack on you near the echo hits it instead':'Shadow Martyr disarmed');
      draw({kind:'echo'});
    }; }
    { const cw=$('#useCuttingWords'); if(cw) cw.onclick=()=>{
      if((c.bardicInspLeft||0)<=0){ flashBanner('No Bardic Inspiration left — rest to recharge'); return; }
      c.cuttingWordsArmed=!c.cuttingWordsArmed;
      flashBanner(c.cuttingWordsArmed?'🎵 Cutting Words armed — the next monster attack roll within 60 ft is reduced':'Cutting Words disarmed');
      $('#modalRoot').innerHTML=''; save(); render(); if(mode==='player') playerHello();
    }; }
    { const ps=$('#usePeerlessSkill'); if(ps) ps.onclick=()=>{
      if((c.bardicInspLeft||0)<=0){ flashBanner('No Bardic Inspiration left — rest to recharge'); return; }
      if(c.bardicInspLeft==null) c.bardicInspLeft=bardicInspMax(c);
      c.bardicInspLeft--;
      const die=rnd(bardicInspDie(c));
      log('🎵 '+c.name+' calls on Peerless Skill — +'+die+' to an ability check');
      flashBanner('🎵 Peerless Skill — add +'+die+' to your next ability check');
      $('#modalRoot').innerHTML=''; save(); render(); if(mode==='player') playerHello();
    }; }
    document.querySelectorAll('[data-inctgt]').forEach(b=>b.onclick=()=>{
      const targets=s.monsters.filter(mo=>mo.hp>0 && isHostile(mo) && gridDist(echo.x,echo.y,mo.x,mo.y)<=1);
      const mo=targets[Number(b.dataset.inctgt)];
      if(!mo) return;
      // The attack ROLL uses the echo's own id as actorId (a real s.monsters entry with real
      // x/y) so Engine.hitResult's range/cover/melee checks measure from the echo's square —
      // but the weapon stats (toHit/dmg) are still the KNIGHT's own, matching RAW ("an
      // additional attack" through the echo, not the echo's own attack — it has none).
      const atk=qbPcAttacks(c).find(a=>a.melee)||{name:'Unarmed strike', toHit:mod(abil(c,'str'))+profBonus(c), dmg:String(1+mod(abil(c,'str'))), dt:'bludgeoning', tiles:1, melee:true};
      draw({kind:'confirmRoll', desc:'Unleash Incarnation — attack '+esc(mo.name)+' from the echo\'s space with '+esc(atk.name)+'.', skillLabel:atk.name, backTo:{kind:'echo'}, run:()=>{
        if(c.echoIncarnationLeft==null) c.echoIncarnationLeft=echoResourceMax(c);
        if(c.echoIncarnationLeft<=0){ flashBanner('No Unleash Incarnation uses left — rest to recharge'); return null; }
        c.echoIncarnationLeft--;
        const ev=Engine.attack(ad, echo.id, mo.id, {name:'Unleash Incarnation ('+atk.name+')', toHit:atk.toHit, dmg:atk.dmg, dtype:atk.dt, tiles:1});
        if(ev.hit) flashBanner('⚔ Unleash Incarnation hits '+mo.name+' for '+ev.dmg);
        else flashBanner('⚔ Unleash Incarnation misses '+mo.name);
        log('⚔ '+c.name+' unleashes an attack through the echo at '+mo.name+' — '+(ev.hit?'hit for '+ev.dmg:'miss'));
        return null;
      }});
    });
    document.querySelectorAll('[data-intimtgt]').forEach(b=>b.onclick=()=>{
      const mo=intimidateTargets[Number(b.dataset.intimtgt)];
      if(!mo) return;
      draw({kind:'confirmRoll', desc:'Intimidating Presence — frighten '+esc(mo.name)+'. DC 8+prof+Cha vs its Wisdom save.', skillLabel:'Intimidation', backTo:{kind:'intimidatePick'}, run:()=>{ maneuverIntimidate(ad, me, mo, log); return null; }});
    });
    document.querySelectorAll('[data-servmove]').forEach(b=>b.onclick=()=>{
      if(c.battle && c.battle.bonus){ flashBanner('Bonus action already used'); return; }
      const t=servantMoveTiles(ad, servant)[Number(b.dataset.servmove)];
      if(!t) return;
      servant.x=t.x; servant.y=t.y;
      spendServantCommand();
    });
    document.querySelectorAll('[data-servint]').forEach(b=>b.onclick=()=>{
      if(c.battle && c.battle.bonus){ flashBanner('Bonus action already used'); return; }
      const it=listInteractInRange(s, servant, 1)[Number(b.dataset.servint)];
      if(!it) return;
      const acts=availableInteractActions(it.obj, 'adj'); const a=acts[0];
      if(!a){ flashBanner('Nothing it can do with that'); return; }
      const res=runInteractAction(s, c, it.key, a.id, 'adj');
      if(!res.ok){ flashBanner(res.msg); return; }
      logChange(c, '👻 '+res.msg); flashBanner('👻 '+res.msg); sfx('cast');
      spendServantCommand();
    });
    document.querySelectorAll('[data-study]').forEach(b=>b.onclick=()=>draw({kind:'study', mo:pick.mo}));
    document.querySelectorAll('[data-studysk]').forEach(b=>b.onclick=()=>{
      const sk=b.dataset.studysk, mo=pick.mo, skNames={arcana:'Arcana',history:'History',nature:'Nature',religion:'Religion'};
      draw({kind:'confirmRoll', desc:'Recall Knowledge about '+esc(mo.name)+' — '+skNames[sk]+' vs DC 10+CR. Uses your action.', skillLabel:skNames[sk], backTo:{kind:'study',mo}, run:()=>{ maneuverStudy(ad, me, mo, sk, log); return null; }});
    });
    document.querySelectorAll('[data-usea]').forEach(b=>b.onclick=()=>{
      const actId=b.dataset.usea;
      if(pick&&pick.kind==='foe'){
        const mo=pick.mo;
        if(actId==='shove-prone') draw({kind:'confirmRoll', desc:'Shove '+esc(mo.name)+' — knock Prone. Athletics vs Athletics/Acrobatics. Uses one of your attacks.', skillLabel:'Athletics', backTo:pick, run:()=>({label:'Shove ('+mo.name+') — knock Prone', res:maneuverShove(ad, me, mo, 'prone', log)})});
        else if(actId==='shove-push') draw({kind:'confirmRoll', desc:'Shove '+esc(mo.name)+' — push 5 ft. Athletics vs Athletics/Acrobatics. Uses one of your attacks.', skillLabel:'Athletics', backTo:pick, run:()=>({label:'Shove ('+mo.name+') — push 5 ft', res:maneuverShove(ad, me, mo, 'push', log)})});
        else if(actId==='grapple') draw({kind:'confirmRoll', desc:'Grapple '+esc(mo.name)+'. Athletics vs Athletics/Acrobatics. Uses one of your attacks.', skillLabel:'Athletics', backTo:pick, run:()=>({label:'Grapple ('+mo.name+')', res:maneuverGrapple(ad, me, mo, log)})});
        else if(actId==='taunt') draw({kind:'confirmRoll', desc:'Taunt '+esc(mo.name)+'. Intimidation vs Insight. Uses one of your attacks.', skillLabel:'Intimidation', backTo:pick, run:()=>({label:'Taunt ('+mo.name+')', res:maneuverTaunt(ad, me, mo, log)})});
        else if(actId==='frenzy'){
          const atk=qbPcAttacks(c).find(a=>a.melee)||{name:'Unarmed strike', toHit:mod(abil(c,'str'))+profBonus(c), dmg:String(1+mod(abil(c,'str'))), dt:'bludgeoning', tiles:1, melee:true};
          draw({kind:'confirmRoll', desc:'Frenzy attack — '+esc(mo.name)+' with '+esc(atk.name)+'. Bonus action.', skillLabel:atk.name, backTo:pick, run:()=>{
            if(c.battle && c.battle.bonus){ flashBanner('Bonus action already used'); return null; }
            if(c.battle) c.battle.bonus=true;
            const ev=Engine.attack(ad, me.id, mo.id, {name:'Frenzy Attack ('+atk.name+')', toHit:atk.toHit, dmg:atk.dmg, dtype:atk.dt, tiles:1});
            if(ev.hit) flashBanner('🩸 Frenzy attack hits '+mo.name+' for '+ev.dmg); else flashBanner('🩸 Frenzy attack misses '+mo.name);
            log('🩸 '+c.name+' unleashes a Frenzy attack at '+mo.name+' — '+(ev.hit?'hit for '+ev.dmg:'miss'));
            return null;
          }});
        }
        else if(actId==='retaliate'){
          const atk=qbPcAttacks(c).find(a=>a.melee)||{name:'Unarmed strike', toHit:mod(abil(c,'str'))+profBonus(c), dmg:String(1+mod(abil(c,'str'))), dt:'bludgeoning', tiles:1, melee:true};
          draw({kind:'confirmRoll', desc:'Retaliation — '+esc(mo.name)+' with '+esc(atk.name)+'. Reaction.', skillLabel:atk.name, backTo:pick, run:()=>{
            if(c.battle && c.battle.reaction){ flashBanner('Reaction already used'); return null; }
            if(c.battle) c.battle.reaction=true;
            const ev=Engine.attack(ad, me.id, mo.id, {name:'Retaliation ('+atk.name+')', toHit:atk.toHit, dmg:atk.dmg, dtype:atk.dt, tiles:1});
            if(ev.hit) flashBanner('🩸 Retaliation hits '+mo.name+' for '+ev.dmg); else flashBanner('🩸 Retaliation misses '+mo.name);
            log('🩸 '+c.name+' retaliates against '+mo.name+' — '+(ev.hit?'hit for '+ev.dmg:'miss'));
            return null;
          }});
        }
        else if(actId==='flurry'){
          if(isOpenHandMonk(c,3)) draw({kind:'flurryTechnique', mo});
          else draw({kind:'confirmRoll', desc:'Flurry of Blows — two unarmed strikes on '+esc(mo.name)+'. Bonus action, 1 ki.', skillLabel:'Unarmed Strike', backTo:pick, run:()=>{ flurryOfBlows(ad, me, mo, null, log); return null; }});
        }
        else if(actId==='quiveringpalm'){
          draw({kind:'confirmRoll', desc:'Quivering Palm — an unarmed strike on '+esc(mo.name)+'. 3 ki spent only on a hit.', skillLabel:'Unarmed Strike', backTo:pick, run:()=>{ quiveringPalmStrike(ad, me, mo, log); return null; }});
        }
        else if(actId==='quiveringtrigger'){
          draw({kind:'confirmRoll', desc:'Trigger Quivering Palm on '+esc(mo.name)+' — forces a Constitution save.', skillLabel:'Quivering Palm', backTo:pick, run:()=>{ quiveringPalmTrigger(ad, c, mo, log); return null; }});
        }
        else if(actId==='giantkiller'){
          const atk=qbPcAttacks(c).find(a=>a.melee)||{name:'Unarmed strike', toHit:mod(abil(c,'str'))+profBonus(c), dmg:String(1+mod(abil(c,'str'))), dt:'bludgeoning', tiles:1, melee:true};
          draw({kind:'confirmRoll', desc:'Giant Killer — '+esc(mo.name)+' with '+esc(atk.name)+'. Reaction.', skillLabel:atk.name, backTo:pick, run:()=>{
            if(c.battle && c.battle.reaction){ flashBanner('Reaction already used'); return null; }
            if(c.battle) c.battle.reaction=true;
            const ev=Engine.attack(ad, me.id, mo.id, {name:'Giant Killer ('+atk.name+')', toHit:atk.toHit, dmg:atk.dmg, dtype:atk.dt, tiles:1});
            if(ev.hit) flashBanner('🏹 Giant Killer hits '+mo.name+' for '+ev.dmg); else flashBanner('🏹 Giant Killer misses '+mo.name);
            log('🏹 '+c.name+' strikes back with Giant Killer at '+mo.name+' — '+(ev.hit?'hit for '+ev.dmg:'miss'));
            return null;
          }});
        }
        else if(actId==='hordebreaker') draw({kind:'hordeBreakerPick', mo});
        return;
      }
      if(pick&&pick.kind==='flurryTechnique'){
        const mo=pick.mo;
        draw({kind:'confirmRoll', desc:'Flurry of Blows on '+esc(mo.name)+' — '+(actId==='prone'?'a hit forces a Dex save or Prone.':actId==='push'?'a hit forces a Str save or a 15 ft push.':actId==='noreact'?'a hit denies its next reaction.':'no Open Hand effect.')+' Bonus action, 1 ki.', skillLabel:'Unarmed Strike', backTo:{kind:'foe',mo}, run:()=>{ flurryOfBlows(ad, me, mo, actId==='none'?null:actId, log); return null; }});
        return;
      }
      if(c.battle&&!hasAction(c)){ flashBanner('No Action left this turn'); return; }
      const res=runInteractAction(s, c, pick.key, actId, 'adj');
      $('#modalRoot').innerHTML='';
      if(!res.ok){ flashBanner(res.msg); return; }
      if(c.battle) spendAction(c);
      logChange(c, '🖐 '+res.msg);
      if(mode==='qb') qbLog('🖐 '+c.name+' — '+res.msg);
      flashBanner('🖐 '+res.msg);
      sfx('cast');
      save(); render(); if(mode==='player') playerHello();
    });
  }
  draw(null);
}

function openMageHandUI(c, s, me){
  const range=6; // 30 ft
  const items=listInteractInRange(s, me, range);
  if(!items.length){
    flashBanner('Mage Hand finds nothing useful within 30 ft');
    if(typeof qbLog==='function'&&s===QB) qbLog('✋ Mage Hand drifts — nothing to manipulate nearby');
    return;
  }
  function draw(pick){
    let body=`<h2>✋ Mage Hand</h2>
      <p class="muted" style="font-size:12px;margin:0 0 8px">Spectral hand within 30 ft. Manipulate an object (≤10 lb). Can’t attack or carry a creature.</p>`;
    if(!pick){
      body+=items.map((it,i)=>{
        const st=it.obj.state||it.def.default;
        const dist=gridDist(me.x,me.y,it.x,it.y)*5;
        return `<div class="spell"><div class="nm"><b>${esc(it.def.name)}</b><small>${st} · ${dist} ft · (${it.x},${it.y})</small></div>
          <button class="btn sm" data-mh="${i}">Use</button></div>`;
      }).join('');
      body+=`<button class="btn ghost block" id="mhClose" style="margin-top:10px">Cancel</button>`;
    } else {
      const acts=availableInteractActions(pick.obj, 'hand');
      body+=`<p class="muted" style="font-size:12px;margin:0 0 8px"><b>${esc(pick.def.name)}</b> at (${pick.x},${pick.y}) — ${esc(pick.obj.state||pick.def.default)}</p>`;
      if(!acts.length) body+=`<div class="empty">No Mage Hand actions available right now.</div>`;
      else body+=acts.map(a=>`<button class="btn block" data-mha="${esc(a.id)}" style="margin-bottom:8px;text-align:left">${esc(a.label)}${a.note?`<small style="display:block;opacity:.75">${esc(a.note)}</small>`:''}</button>`).join('');
      body+=`<button class="btn ghost block" id="mhBack" style="margin-top:8px">← Back</button>
        <button class="btn ghost block" id="mhClose" style="margin-top:6px">Cancel</button>`;
    }
    $('#modalRoot').innerHTML=`<div class="modal" id="mhModal"><div class="sheet"><div class="grip"></div>${body}</div></div>`;
    $('#mhClose').onclick=()=>{ $('#modalRoot').innerHTML=''; };
    $('#mhModal').onclick=e=>{ if(e.target.id==='mhModal') $('#modalRoot').innerHTML=''; };
    { const bk=$('#mhBack'); if(bk) bk.onclick=()=>draw(null); }
    document.querySelectorAll('[data-mh]').forEach(b=>b.onclick=()=>draw(items[Number(b.dataset.mh)]));
    document.querySelectorAll('[data-mha]').forEach(b=>b.onclick=()=>{
      const actId=b.dataset.mha;
      // Spend cast (cantrip) if not already spent — Mage Hand is usually cast then used;
      // here we cast once when opening is too late; spend action if battle and not yet cast.
      const res=runInteractAction(s, c, pick.key, actId, 'hand');
      $('#modalRoot').innerHTML='';
      if(!res.ok){ flashBanner(res.msg); return; }
      logChange(c, '✋ Mage Hand: '+res.msg);
      if(typeof qbLog==='function'&&s===QB) qbLog('✋ Mage Hand — '+res.msg);
      flashBanner('✋ '+res.msg);
      sfx('cast');
      save(); render();
    });
  }
  draw(null);
}

function loadMapData(d){ if(!d||!net||net.role!=='dm') return; net.session.map={cols:d.cols, rows:d.rows, tiles:Object.assign({},d.tiles||{}), height:Object.assign({},d.height||{}), decor:sanitizeDecorInPlace(Object.assign({},d.decor||{})), interact:d.interact?JSON.parse(JSON.stringify(d.interact)):{}, light:d.light?JSON.parse(JSON.stringify(d.light)):undefined}; net.session.lights=[]; syncInteractDecor(net.session); dmBroadcast(); render(); }

function saveCampaign(name, quiet){ if(!net||net.role!=='dm'||!name) return;
  const all=campaigns(), prev=all[name];
  all[name]={name, created:prev?prev.created:Date.now(), updated:Date.now(), session:campaignSnapshot(net.session), log:rollLog.slice(0,40)};
  try{ localStorage.setItem('grimoire.campaigns',JSON.stringify(all)); }catch(e){ flashBanner('Could not save campaign (storage full?)'); return; }
  net.campaign=name; if(!quiet){ flashBanner('💾 Campaign saved: '+name); render(); } }

function loadCampaign(name){ if(!net||net.role!=='dm') return; const cp=campaigns()[name]; if(!cp||!cp.session){ flashBanner('No such campaign'); return; }
  const live=(net.session&&net.session.players)||[];
  const s=JSON.parse(JSON.stringify(cp.session)), remap={};
  s.players=mergeCampaignPlayers(s.players, live, remap);
  (s.order||[]).forEach(o=>{ if(o.k==='p'&&remap[o.id]) o.id=remap[o.id]; });   // turn order follows reconnected peer ids
  net.session={battle:s.battle||{active:false,round:1}, map:s.map||{cols:10,rows:8,tiles:{}}, monsters:s.monsters||[], players:s.players, order:s.order||[], turn:s.turn||0};
  rollLog=(cp.log||[]).slice(0,40);   // restore the campaign's battle log
  net.campaign=name; net.sel=null;
  dmBroadcast(); render(); flashBanner('📜 Campaign loaded: '+name); }

function mapGridHTML(s, isDM, opts){ opts=opts||{}; const {cols,rows}=s.map; const tiles=s.map.tiles||{}; let cells='';
  const at=(x,y)=>tiles[x+','+y];
  const iso=isoView, rot=mapRotation;
  const stageW=iso?Math.ceil(IsoRenderer.stageSize(cols,rows,rot).w):0, stageH=iso?Math.ceil(IsoRenderer.stageSize(cols,rows,rot).h):0;
  for(let y=0;y<rows;y++) for(let x=0;x<cols;x++){
    const ter=at(x,y), td=ter&&TERRAIN[ter]; let style='';
    if(td&&td.c){
      // autotile: same-terrain neighbours connect (square edge); outer corners round off
      // autotile: flush cells (no gap); round only true outer corners → seamless blocks
      const U=at(x,y-1)===ter, D=at(x,y+1)===ter, L=at(x-1,y)===ter, R=at(x+1,y)===ter, RAD='10px';
      const tl=(!U&&!L)?RAD:'0', tr=(!U&&!R)?RAD:'0', br=(!D&&!R)?RAD:'0', bl=(!D&&!L)?RAD:'0';
      style=`border-radius:${tl} ${tr} ${br} ${bl};`;
    }
    const pl=s.players.find(p=>p.x===x&&p.y===y);
    const hpbar=(cur,mx)=>{ if(!mx) return ''; const p=Math.max(0,Math.min(100,Math.round(cur/mx*100))); const cl=p<=25?'crit':p<=50?'low':''; return `<span class="hpbar ${cl}"><i style="width:${p}%"></i></span>`; };
    // Living first; corpse is walkable (does not block path or move highlights)
    const moLive=(s.monsters||[]).find(m=>m.x===x&&m.y===y&&m.hp>0);
    const moDead=!moLive&&(s.monsters||[]).find(m=>m.x===x&&m.y===y&&m.hp<=0);
    const mo=moLive||moDead;
    let tok='';
    // Standing on a corpse: show the living unit on top (corpse still in list / Iso3D)
    if(moLive){ const mo=moLive; const dead=false;
      const sheet=iso&&mo.sprite?spriteTokenHTML(mo.sprite,mo.facing):null;
      const inner=sheet||(mo.sprite?pixelArt(monsterSprite(mo.sprite),2):esc((mo.name[0]||'M').toUpperCase()));
      const allyMark=isPartyAlly(mo);
      const tcls='tok '+(mo.sprite?'':(allyMark?'ally':'mon'))+(net&&net.sel==='m'+mo.id?' sel':'');
      const tstyle=mo.sprite?(allyMark?'background:none;box-shadow:0 0 0 2px rgba(80,160,255,.85);':'background:none;box-shadow:none;'):'';
      const condMark=(mo.conds&&mo.conds.length)?`<span class="condmark" title="${esc(mo.conds.map(x=>x.name).join(', '))}">🌀</span>`:'';
      const allyBadge=allyMark?`<span class="mnum" style="background:#2a6ab0" title="Ally">✦</span>`:'';
      tok=(sheet?`<span style="${allyMark?'filter:drop-shadow(0 0 3px #4af)':''}">${sheet}</span>`:`<span class="${tcls}" style="${tstyle}">${inner}</span>`)+(mo.num?`<span class="mnum">${mo.num}</span>`:'')+allyBadge+condMark+hpbar(mo.hp,mo.max); }
    else if(pl){ const meTok=(net&&net.role==='player'&&net.peer&&pl.id===net.peer.id);
      const plCls=pl.cls||(pl.c&&pl.c.cls); const sheet=iso&&plCls?spriteTokenHTML(plCls.toLowerCase(),pl.facing):null;
      tok=(sheet?`<span>${sheet}</span>`:`<span class="tok pl ${(net&&net.sel==='p'+pl.id)||meTok?'sel':''}">${esc((pl.name[0]||'P').toUpperCase())}</span>`)+hpbar(pl.hpCur,pl.hpMax);
      // matching prone corpse under feet when sharing the tile (no skull badge)
      if(moDead){ const sheetC=iso&&moDead.sprite?spriteTokenHTML(moDead.sprite,moDead.facing):null;
        tok+=sheetC?`<span class="deadtok corpse-under" title="${esc(moDead.name||'Corpse')} — walkable" style="position:absolute;left:2px;bottom:0;transform:rotate(90deg) scale(.55);filter:brightness(.82) saturate(.75);pointer-events:none">${sheetC}</span>`
          :`<span class="mnum" style="background:#6a4a3a;opacity:.75" title="Corpse — walkable">†</span>`; } }
    else if(moDead){ const mo=moDead;
      const sheet=iso&&mo.sprite?spriteTokenHTML(mo.sprite,mo.facing):null;
      const inner=sheet||(mo.sprite?pixelArt(monsterSprite(mo.sprite),2):esc((mo.name[0]||'M').toUpperCase()));
      const tcls='tok '+(mo.sprite?'':'mon')+' deadtok';
      // Prone matching body — keep creature colors, no skull / ghost fade
      const tstyle=(mo.sprite?'background:none;box-shadow:none;':'')+'filter:brightness(.82) saturate(.75);transform:rotate(90deg) scale(.92);opacity:1;';
      tok=(sheet?`<span class="deadtok" title="${esc(mo.name||'Corpse')} — walkable" style="filter:brightness(.82) saturate(.75);opacity:1;transform:rotate(90deg) scale(.92);display:inline-block">${sheet}</span>`:`<span class="${tcls}" style="${tstyle}" title="Corpse — walkable">${inner}</span>`); }
    else if(td&&td.e) tok=`<span style="font-size:15px">${td.e}</span>`;
    let extra='';
    // Corpses are walkable — still show move/dash reach on that tile
    if(opts.reachCost && !moLive && !pl && !isFullWall(ter) && !isPitTerrain(ter)){ const fc=opts.reachCost[x+','+y]; if(fc!=null && fc>0){ const rm=opts.reachMeta&&opts.reachMeta[x+','+y]; extra+=(opts.reachNormal!=null && fc>opts.reachNormal)?' reachdash':' reach'; if(rm&&rm.climb) extra+=' reachclimb'; else if(rm&&rm.jump) extra+=' reachjump'; if(rm&&rm.drop) extra+=' reachdrop'; } }
    // Attack/spell range: dim = max distance, bright = clear LoE (valid place/target). AoE = orange.
    if(opts.rangeMax && opts.rangeMax.has(x+','+y) && !(opts.rangeTiles&&opts.rangeTiles.has(x+','+y))) extra+=' rangemax';
    if(opts.rangeTiles){ if(opts.rangeTiles.has(x+','+y)) extra+=' rangeok'; }
    else if(opts.rangeFrom && ter!=='wall'){ const rf=opts.rangeFrom; const needLos=rf.needLos!=null?rf.needLos:(rf.tiles>1);
      if((x!==rf.x||y!==rf.y) && inBlast(rf.x,rf.y,x,y,rf.tiles)){
        if(!needLos||losClear(s,rf.x,rf.y,x,y)) extra+=' rangeok';
        else extra+=' rangemax';
      } }
    if(opts.blastTiles){ if(opts.blastTiles.has(x+','+y)) extra+=' aoe'; }
    else if(opts.blast){ const bl=opts.blast; if(inBlast(bl.x,bl.y,x,y,bl.r)) extra+=' aoe'; }
    if(opts.targets && mo && opts.targets.indexOf(mo.id)>=0) extra+=' intarget';
    { const hz=s.hazards&&hazardAt(s,x,y); if(hz&&hz.gas) extra+=' gashazard'; }
    // Mark hostiles (not summons/allies) in range as attack targets
    if(opts.rangeTiles && mo && isHostile(mo) && opts.rangeTiles.has(x+','+y)) extra+=' intarget';
    const canTarget = !isDM && mo && isHostile(mo);
    const hgt=heightAt(s,x,y);
    if(hgt>0){ style+=`filter:brightness(${(1+hgt*0.09).toFixed(2)});box-shadow:inset 0 0 0 1px rgba(255,255,255,${(hgt*0.10).toFixed(2)}), 0 ${hgt+1}px ${hgt*2}px rgba(0,0,0,.28);`; }
    else if(hgt<0){ style+=`filter:brightness(${(1+hgt*0.09).toFixed(2)});box-shadow:inset 0 0 0 1px rgba(0,0,0,${(-hgt*0.14).toFixed(2)}), inset 0 ${-hgt}px ${-hgt*3}px rgba(0,0,0,.35);`; }
    const elevBadge = hgt!==0 ? `<span class="elevbadge">${hgt>0?'▲':'▼'}${Math.abs(hgt)}</span>` : '';
    if(iso){
      // Floor/elevation pixels are painted by iso-renderer.js's <canvas> underlay (a real
      // depth-sorted painter's algorithm) — these .mcell divs are just positioned hitboxes/rings
      // now (no fill, no riser faces), so click/reach/target logic below is untouched.
      // tileScreenPos is the SAME function the canvas painter uses, so the two can never drift.
      const {cx,cy}=IsoRenderer.tileScreenPos(x,y,hgt,cols,rows,rot), [rx,ry]=rotXY(x,y,cols,rows,rot);
      style+=`left:${cx-20}px;top:${cy-20}px;z-index:${(rx+ry)*100+hgt};`;
    }
    const decorKey=decorAt(s,x,y), decorHTML=(iso&&decorKey)?decorTokenHTML(decorKey):'';
    const inner=iso?`<div class="isoContent">${decorHTML}${tok}${elevBadge}</div>`:`${tok}${elevBadge}`;
    cells+=`<div class="mcell${iso?' iso':''}${td?' ter-'+ter:''}${extra} ${canTarget?'tgt':''}" data-cell="${x},${y}" style="${style}" ${canTarget?`data-target="${mo.id}"`:''}>${inner}</div>`;
  }
  if(iso){
    // TERRAIN_PALETTE: plain {key:hex} for classic iso-renderer.js; WebGL Iso3D uses its own adapter.
    const canvasTag=`<canvas class="isocanvas" width="${stageW}" height="${stageH}" data-cols="${cols}" data-rows="${rows}" data-rot="${rot}" data-tiles="${encodeURIComponent(JSON.stringify(tiles))}" data-height="${encodeURIComponent(JSON.stringify(s.map.height||{}))}" data-palette="${encodeURIComponent(JSON.stringify(TERRAIN_PALETTE))}"></canvas>`;
    if(iso3dView){
      // Capped to the viewport width (window.innerWidth), NOT stageW and NOT a CSS "100%"
      // — the WebGL camera pans/zooms freely regardless of the map's projected pixel size,
      // so tying this element to stageW (easily 1000px+ on a real map) meant a phone-width
      // viewport only showed a thin slice of a much-wider canvas (live report + video:
      // mostly dark/empty view). A first attempt used CSS width:100%, but that reads
      // whatever the CURRENT ancestor chain resolves to — and this same function also
      // renders the attack/spell targeting modal's OWN copy of the map, in a DIFFERENT
      // container (modal sheet padding vs. the main battlefield card), so the resolved
      // pixel width genuinely differed between the two — and since attacking reparents the
      // WebGL canvas from one into the other, that mismatch forced a real canvas resize on
      // every attack (worse than before: "only happens during attacks"). window.innerWidth
      // is a single global, identical regardless of which container this ends up in, so
      // both mounts always agree — no more resize-on-reparent, still viewport-safe.
      const viewportH=(typeof window!=='undefined'&&window.innerHeight)?window.innerHeight:800;
      // Width used to be a hand-computed px value trying to account for every ancestor's
      // padding (main#app, .card, .mapwrap itself) — kept under-subtracting one of them
      // and bleeding past the column, and whenever it DID overflow enough to need a
      // scrollbar, scrolling desynced the WebGL canvas (position:fixed on <body>, synced
      // to this container's getBoundingClientRect() every frame — see host.js) from the
      // visible box, making it appear to jump/blow up on scroll (live report). Just use
      // width:100% so CSS sizes it to the real content box directly — no px math to get
      // wrong, and nothing can ever overflow the column, so there's nothing to scroll.
      // Cap height hard — prior 65%-of-viewport cap didn't visibly shrink the board
      // because stageH often sits well under that ceiling already (live report:
      // "the screen still is too big" even after the first cap attempt). Use a low
      // absolute pixel ceiling (whichever is smaller vs. a viewport percentage) so it
      // actually bites regardless of stageH, with a floor so small maps aren't cramped.
      const hCap=Math.min(480, Math.round(viewportH*0.42));
      const h3=Math.max(360, Math.min(stageH, hCap));
      return `<div class="mapwrap" style="max-width:100%;overflow:hidden"><div class="mapgrid iso iso3dmode" style="width:100%;height:${h3}px;min-height:420px;position:relative"><div id="iso3dMount" class="iso3d-mount"></div>${canvasTag}${cells}</div></div>`;
    }
    return `<div class="mapwrap"><div class="mapgrid iso" style="width:${stageW}px;height:${stageH}px;position:relative">${canvasTag}${cells}</div></div>`;
  }
  return `<div class="mapwrap"><div class="mapgrid" style="grid-template-columns:repeat(${cols},36px)">${cells}</div></div>`;
}

function renderDM(){
  const s=net.session; app.className='fade'; void app.offsetWidth;
  app.innerHTML=`
  <div class="card" style="border:2px solid var(--accent2)">
    <div class="row between"><h2 style="margin:0;color:var(--accent2)">🎲 DM Mode</h2><button class="btn ghost sm" id="dmExit" style="color:var(--bad)">Exit</button></div>
    <p class="muted" style="font-size:13px;margin:8px 0 0">Players tap "Join game" and enter:</p>
    <div style="font-family:Georgia,serif;font-size:36px;font-weight:700;color:var(--accent);text-align:center;letter-spacing:8px;margin:6px 0">${net.peer&&!net.peer.disconnected?net.code:'connecting…'}</div>
    <div class="muted" style="font-size:11.5px;text-align:center">${net.conns.length} player(s) connected</div>
  </div>
  ${(()=>{ const all=campaigns(), names=Object.keys(all).sort((a,b)=>(all[b].updated||0)-(all[a].updated||0)); return `<div class="card">
    <div class="row between"><h2 style="margin:0">📜 Campaign</h2>${net.campaign?`<span class="muted" style="font-size:11px;text-transform:none">▶ ${esc(net.campaign)} · autosaving</span>`:''}</div>
    <p class="muted" style="font-size:12px;margin:6px 0 0">${net.campaign?'Map, monsters, party progress & battle log save automatically.':'Save this session — map, monsters, party progress & log — to continue another night. Players join first, then you load.'}</p>
    <div class="addrow" style="margin-top:8px"><select id="cpSel" style="flex:2"><option value="">— saved campaigns —</option>${names.map(n=>`<option value="${esc(n)}" ${n===net.campaign?'selected':''}>${esc(n)} — ${new Date(all[n].updated||all[n].created||Date.now()).toLocaleDateString()}</option>`).join('')}</select><button class="btn sm" id="cpLoad">Load</button><button class="btn ghost sm" id="cpSave">💾 Save</button>${names.length?'<button class="del" id="cpDel" title="Delete selected campaign">✕</button>':''}</div>
  </div>`; })()}
  <div class="card">
    <div class="row between"><h2 style="margin:0">Battle</h2><div class="stepper"><button id="dmRD">−</button><div class="val">Round ${s.battle.round}</div><button id="dmRU">＋</button></div></div>
    <button class="btn block" id="dmBattle" style="margin-top:10px;${s.battle.active?'background:var(--bad);border-color:var(--bad)':''}">${s.battle.active?'■ End battle (everyone)':'▶ Start battle (places tokens & rolls initiative)'}</button>
  </div>
  ${(s.order&&s.order.length)?(()=>{ const cur=s.order[s.turn]||{}; const curMon=cur.k==='m'?s.monsters.find(m=>m.id===cur.id):null;
    return `<div class="card">
      <div class="row between"><h2 style="margin:0">Turn Order</h2><button class="btn ghost sm" id="dmReroll">↻ Re-roll</button></div>
      ${s.order.map((o,i)=>{ const dead=orderDead(o); return `<div class="listrow" style="${i===s.turn?'background:rgba(77,106,44,.14);border-radius:8px':''}${dead?';opacity:.45':''}"><span style="flex:none;width:22px">${i===s.turn?'▶':''}</span><div class="nm"><b style="${dead?'text-decoration:line-through':''}">${o.k==='m'?'🟥 ':'🟩 '}${esc(o.name)}${dead?' 💀':''}</b></div><input type="number" class="val" data-initedit="${i}" value="${o.roll}" title="Edit this roll manually" style="max-width:54px;text-align:center;padding:4px 6px"></div>`; }).join('')}
      <div class="card" style="margin:10px 0 0;background:rgba(77,106,44,.10)">
        <div class="muted" style="font-size:11px;text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px">Up now: ${esc(cur.name||'—')}</div>
        ${curMon? `<div class="row2"><button class="btn" id="curAtk">⚔ ${esc(curMon.name)} attacks</button><button class="btn ghost" id="curMove">📍 Move it</button></div>`
          : `<p class="muted" style="font-size:12.5px;margin:0">It's <b>${esc(cur.name||'a player')}</b>'s turn — they act on their own device.</p>`}
        <div class="row2" style="margin-top:8px"><button class="btn ghost" id="dmPrevT">◀ Back</button><button class="btn" id="dmNextT">Next turn ▶</button></div>
      </div>
    </div>`; })() : (s.battle.active?'<div class="card"><div class="empty">No combatants. Deploy monsters and have players join, then ↻ re-roll.</div></div>':'')}
  <div class="card">
    <h2>Players ${s.players.length?`<span class="muted" style="text-transform:none;font-size:11px">— ${s.players.length}</span>`:''}</h2>
    ${s.players.length? s.players.map(p=>`<div class="spell" style="${p.online===false?'opacity:.5':''}"><span style="flex:none">${classEmblem(p.cls,3)}</span><div class="nm"><b>${esc(p.name)}${p.online===false?' <span class="sub">offline</span>':''}</b><small>Lv ${p.level} ${esc(p.cls)} · AC ${p.ac} · HP ${p.hpCur}/${p.hpMax}${p.target?' · 🎯 '+esc((s.monsters.find(m=>m.id===p.target)||{}).name||''):''}</small></div><button class="btn bad sm" data-pdmg="${p.id}">–</button><input type="number" class="pamt" data-pamt="${p.id}" value="1" style="max-width:48px"><button class="btn sm" data-pheal="${p.id}">+</button><button class="del" data-pdel="${p.cid||p.id}" title="Remove player">✕</button></div>`).join('') : '<div class="empty">No players yet — share the code.</div>'}
  </div>
  <div class="card">
    <h2>Monsters <button class="btn sm" id="bestiaryBtn" style="float:right">📖 Bestiary</button><button class="btn ghost sm" id="encBuilderBtn" style="float:right;margin-right:6px">🎯 Encounter</button><button class="btn ghost sm" id="npcBtn" style="float:right;margin-right:6px">🧑 New NPC</button></h2>
    ${s.monsters.length? s.monsters.map(mo=>`<div class="spell" style="flex-wrap:wrap;${mo.hp<=0?'opacity:.5':''}"><span class="tok" style="flex:none;${mo.sprite?'background:none;box-shadow:none':''}">${mo.sprite?pixelArt(monsterSprite(mo.sprite),2):`<span class="tok mon">${esc((mo.name[0]||'M').toUpperCase())}</span>`}</span><div class="nm"><b>${esc(mo.name)}${mo.hp<=0?' 💀':''}</b><small>AC ${mo.ac} · HP ${mo.hp}/${mo.max}${mo.atk?'<br>'+esc(mo.atk):''}${(mo.conds&&mo.conds.length)?'<br>'+mo.conds.map(x=>'<span class="pill" style="font-size:10px;padding:1px 6px" data-mclr="'+mo.id+'|'+esc(x.name)+'">🌀 '+esc(x.name)+(x.rounds!=null?' '+x.rounds:'')+' ✕</span>').join(' '):''}</small></div><button class="btn ghost sm" data-msheet="${mo.id}" title="View full stat block">📋</button><button class="btn sm" data-matk="${mo.id}" title="Roll this monster's attack">⚔</button><button class="btn ghost sm" data-mmove="${mo.id}" title="Move on map">📍</button><button class="btn ghost sm" data-mloot="${mo.id}" title="Inventory / loot">🎒${(mo.items&&mo.items.length)?' '+mo.items.length:''}</button><button class="btn bad sm" data-mdmg="${mo.id}">–</button><input type="number" class="mamt" data-mamt="${mo.id}" value="1" style="max-width:44px"><button class="btn sm" data-mheal="${mo.id}">+</button><button class="del" data-mdel="${mo.id}">✕</button></div>`).join('') : '<div class="empty">No monsters. Add from the 📖 Bestiary or below.</div>'}
    <div class="addrow"><input id="mName" placeholder="Name" style="flex:2"><input id="mHp" type="number" placeholder="HP" style="max-width:60px"><input id="mAc" type="number" placeholder="AC" style="max-width:52px"><button class="btn sm" id="mAdd">Add</button></div>
  </div>
  <div class="card">
    <h2>Map <span class="muted" style="text-transform:none;font-size:11px">— ${s.map.cols}×${s.map.rows}</span><button class="btn ghost sm" id="dmRotBtn" style="float:right">🔄 Rotate</button></h2>
    ${mapGridHTML(s,true, (s.battle.active&&net.sel&&net.sel[0]==='m')?(()=>{ const mo=s.monsters.find(m=>m.id===net.sel.slice(1)); if(!mo) return {}; const dashAvail=(mo.attacksLeft||0)>0, dashMax=(mo.moveLeft||0)+(dashAvail?(mo.speed||30):0); return buildMoveRangeOpts(s,mo,mo.moveLeft||0,dashAvail,mo.speed||30,monsterFlies(mo)); })():{})}
    ${(s.battle.active&&net.sel&&net.sel[0]==='m')?(()=>{ const mo=s.monsters.find(m=>m.id===net.sel.slice(1)); return mo?`<p class="muted" style="font-size:11.5px;margin:6px 0 0">Moving <b>${esc(mo.name)}</b> — ${mo.moveLeft||0} ft left. Tap a glowing tile.</p>`:''; })():''}
    <p class="muted" style="font-size:11.5px;margin:8px 0 4px">Pick a brush or token below, then tap cells. (Paint terrain, or place a monster/player.)</p>
    <div class="chips" style="margin-bottom:6px">${Object.keys(TERRAIN).map(k=>`<button class="chip ${net.sel==='t:'+k?'on':''}" data-place="t:${k}" style="${TERRAIN[k].c?'border-color:'+TERRAIN[k].c:''}">${TERRAIN[k].e||''} ${TERRAIN[k].name}</button>`).join('')}</div>
    <div class="chips" style="margin-bottom:6px"><span class="muted" style="font-size:11px;align-self:center">Elevation:</span><button class="chip ${net.sel==='t:elev+'?'on':''}" data-place="t:elev+">⬆ Raise</button><button class="chip ${net.sel==='t:elev-'?'on':''}" data-place="t:elev-">⬇ Lower</button></div>
    <div class="chips" style="margin-bottom:6px"><span class="muted" style="font-size:11px;align-self:center">Decorate:</span>${Object.keys(DECOR).map(k=>`<button class="chip ${net.sel==='d:'+k?'on':''}" data-place="d:${k}">${DECOR[k].name}</button>`).join('')}<button class="chip ${net.sel==='d:erase'?'on':''}" data-place="d:erase">✕ Erase</button></div>
    <div class="chips" style="margin-bottom:6px"><span class="muted" style="font-size:11px;align-self:center">🪤 Traps <span title="Hidden from players until triggered">(DM-only, hidden)</span>:</span>${TRAP_CATALOG.map(t=>`<button class="chip ${net.sel==='x:'+t.name?'on':''}" data-place="x:${esc(t.name)}">${esc(t.name)}</button>`).join('')}<button class="chip ${net.sel==='x:erase'?'on':''}" data-place="x:erase">✕ Erase</button></div>
    ${(s.traps||[]).length?`<p class="muted" style="font-size:11px;margin:0 0 6px">${s.traps.filter(t=>!t.triggered).length} armed, ${s.traps.filter(t=>t.triggered).length} sprung — only you can see trap tiles on this map.</p>`:''}
    <div class="chips">${s.monsters.map(mo=>`<button class="chip ${net.sel==='m'+mo.id?'on':''}" data-place="m${mo.id}">🟥 ${esc(mo.name)}</button>`).join('')}${s.players.map(p=>`<button class="chip ${net.sel==='p'+p.id?'on':''}" data-place="p${p.id}">🟩 ${esc(p.name)}</button>`).join('')}</div>
    <div class="addrow" style="margin-top:8px"><select id="mPreset" style="flex:2"><option value="">— load a map —</option><optgroup label="Presets">${Object.keys(MAP_PRESETS).map(k=>`<option value="p:${esc(k)}">${esc(k)}</option>`).join('')}</optgroup>${Object.keys(savedMaps()).length?`<optgroup label="Saved">${Object.keys(savedMaps()).map(n=>`<option value="s:${esc(n)}">💾 ${esc(n)}</option>`).join('')}</optgroup>`:''}</select><button class="btn sm" id="mLoad">Load</button><button class="btn ghost sm" id="mSave">💾 Save</button></div>
    <div class="addrow" style="margin-top:6px"><button class="btn ghost sm" id="mImportJson" title="Import map JSON from voxel engine Export for Grimoire">📥 Import map JSON</button><input type="file" id="mImportFile" accept="application/json,.json" hidden></div>
    <p class="muted" style="font-size:11px;margin:4px 0 0">Voxel maps: export from iso3d-engine → <b>Export for Grimoire</b>, then import here (or <b>Save → Grimoire library</b> if both apps share the same origin).</p>
    <button class="btn ghost sm block" id="mClear" style="margin-top:8px">Clear all terrain</button>
    <div class="addrow" style="margin-top:8px"><span class="muted" style="font-size:12px;flex:none">Grid</span><input id="mCols" type="number" value="${s.map.cols}" style="max-width:60px"><span class="muted">×</span><input id="mRows" type="number" value="${s.map.rows}" style="max-width:60px"><button class="btn ghost sm" id="mResize">Resize</button></div>
  </div>
  <div class="card">
    <h2>Battle Log</h2>
    <div style="max-height:200px;overflow:auto;border:1px solid var(--line);border-radius:10px;padding:2px 10px">
      ${rollLog.length? rollLog.slice(0,30).map(r=>`<div class="listrow" style="padding:4px 0"><span class="lr-total" style="min-width:30px">${r.total}</span><div class="nm" style="font-size:12px">${esc(r.label)}</div><div class="sub" style="white-space:nowrap;font-size:11px">${esc(String(r.detail||'').replace(/<[^>]+>/g,''))}</div></div>`).join('') : '<div class="empty" style="padding:8px 0">Monster attacks & player hits show here.</div>'}
    </div>
  </div>`;
  $('#dmExit').onclick=()=>{ if(confirm('Exit DM mode and disconnect players?'+(net.campaign?' (campaign "'+net.campaign+'" is saved)':''))) dmExit(); };
  { const cs=$('#cpSave'); if(cs) cs.onclick=()=>{ const nm=prompt('Campaign name:', net.campaign||''); if(nm&&nm.trim()) saveCampaign(nm.trim()); }; }
  { const cl=$('#cpLoad'); if(cl) cl.onclick=()=>{ const nm=$('#cpSel').value; if(!nm){ flashBanner('Pick a campaign to load'); return; }
    if(confirm('Load "'+nm+'"? The current map, monsters & battle are replaced (connected players stay and re-join their saved spots).')) loadCampaign(nm); }; }
  { const cd=$('#cpDel'); if(cd) cd.onclick=()=>{ const nm=$('#cpSel').value; if(!nm){ flashBanner('Pick a campaign to delete'); return; }
    if(confirm('Delete campaign "'+nm+'"? This cannot be undone.')){ deleteCampaign(nm); render(); } }; }
  $('#dmRU').onclick=()=>{ s.battle.round++; dmBroadcast(); render(); };
  $('#dmRD').onclick=()=>{ s.battle.round=Math.max(1,s.battle.round-1); dmBroadcast(); render(); };
  $('#dmBattle').onclick=()=>{ s.battle.active=!s.battle.active; if(s.battle.active){ s.battle.round=1; rollInitiative();
      // DM oversees everyone — start on a full view of the map, not any one combatant.
      setTimeout(()=>frameCameraOnMapCenter(s, 1.1), 60); }
    dmBroadcast(); render(); flashBanner(s.battle.active?'Battle started for all players':'Battle ended'); };
  { const rv=$('#dmRotBtn'); if(rv) rv.onclick=rotateMap; }
  if(isoView&&iso3dView) syncIso3DHost(s);
  { const rr=$('#dmReroll'); if(rr) rr.onclick=rollInitiative; }
  document.querySelectorAll('[data-initedit]').forEach(el=>el.onchange=()=>{
    const i=Number(el.dataset.initedit), v=Number(el.value); if(isNaN(v)) return;
    const cur=s.order[s.turn];   // remember who's acting so the turn pointer survives the re-sort
    s.order[i].roll=v; s.order.sort((a,b)=>b.roll-a.roll);
    if(cur) s.turn=Math.max(0, s.order.findIndex(o=>o.k===cur.k && o.id===cur.id));
    dmBroadcast(); render(); flashBanner('Initiative updated');
  });
  { const nt=$('#dmNextT'); if(nt) nt.onclick=dmNextTurn; }
  { const pt=$('#dmPrevT'); if(pt) pt.onclick=dmPrevTurn; }
  { const ca=$('#curAtk'); if(ca) ca.onclick=()=>{ const cur=s.order[s.turn]; const mo=cur&&s.monsters.find(m=>m.id===cur.id); if(mo) dmMonsterAttack(mo); }; }
  { const cm=$('#curMove'); if(cm) cm.onclick=()=>{ const cur=s.order[s.turn]; if(cur){ net.sel='m'+cur.id; render(); flashBanner('Tap a map cell to move '+cur.name); } }; }
  app.querySelectorAll('[data-pdmg]').forEach(el=>el.onclick=()=>{ const id=el.dataset.pdmg, amt=Number((app.querySelector('[data-pamt="'+id+'"]')||{}).value)||1; dmSend(id,{t:'apply',delta:-Math.abs(amt)}); });
  app.querySelectorAll('[data-pheal]').forEach(el=>el.onclick=()=>{ const id=el.dataset.pheal, amt=Number((app.querySelector('[data-pamt="'+id+'"]')||{}).value)||1; dmSend(id,{t:'apply',delta:Math.abs(amt)}); });
  app.querySelectorAll('[data-pdel]').forEach(el=>el.onclick=()=>{ const key=el.dataset.pdel; s.players=s.players.filter(p=>(p.cid||p.id)!==key); s.order=(s.order||[]).filter(o=>o.k!=='p'||net.session.players.some(p=>p.id===o.id)); dmBroadcast(); render(); });
  app.querySelectorAll('[data-mdmg]').forEach(el=>el.onclick=()=>{ const mo=s.monsters.find(m=>m.id===el.dataset.mdmg); if(mo){ const amt=Number((app.querySelector('[data-mamt="'+mo.id+'"]')||{}).value)||1; mo.hp=Math.max(0,mo.hp-Math.abs(amt)); dmBroadcast(); render(); } });
  app.querySelectorAll('[data-mheal]').forEach(el=>el.onclick=()=>{ const mo=s.monsters.find(m=>m.id===el.dataset.mheal); if(mo){ const amt=Number((app.querySelector('[data-mamt="'+mo.id+'"]')||{}).value)||1; mo.hp=Math.min(mo.max,mo.hp+Math.abs(amt)); dmBroadcast(); render(); } });
  app.querySelectorAll('[data-mdel]').forEach(el=>el.onclick=()=>{ s.monsters=s.monsters.filter(m=>m.id!==el.dataset.mdel); dmBroadcast(); render(); });
  app.querySelectorAll('[data-mclr]').forEach(el=>el.onclick=()=>{ const [id,cn]=el.dataset.mclr.split('|'); const mo=s.monsters.find(m=>m.id===id); if(mo&&mo.conds){ mo.conds=mo.conds.filter(x=>x.name!==cn); dmBroadcast(); render(); } });
  $('#mAdd').onclick=()=>{ const n=$('#mName').value.trim(); if(!n) return; const hp=Number($('#mHp').value)||10, ac=Number($('#mAc').value)||12; s.monsters.push({id:'m'+Date.now().toString(36),name:n,hp,max:hp,ac,x:0,y:0,attacks:1,attacksLeft:1,speed:30,moveLeft:30}); dmBroadcast(); render(); };
  { const bb=$('#bestiaryBtn'); if(bb) bb.onclick=openBestiary; }
  { const eb=$('#encBuilderBtn'); if(eb) eb.onclick=openEncounterBuilder; }
  { const nb=$('#npcBtn'); if(nb) nb.onclick=openNpcBuilder; }
  app.querySelectorAll('[data-msheet]').forEach(el=>el.onclick=()=>{ const mo=s.monsters.find(m=>m.id===el.dataset.msheet); if(mo) openMonsterSheet(mo); });
  app.querySelectorAll('[data-mloot]').forEach(el=>el.onclick=()=>{ const mo=s.monsters.find(m=>m.id===el.dataset.mloot); if(mo) openMonsterLoot(mo); });
  app.querySelectorAll('[data-matk]').forEach(el=>el.onclick=()=>{ const mo=s.monsters.find(m=>m.id===el.dataset.matk); if(mo) dmMonsterAttack(mo); });
  app.querySelectorAll('[data-mmove]').forEach(el=>el.onclick=()=>{ const mo=s.monsters.find(m=>m.id===el.dataset.mmove); if(mo){ net.sel='m'+mo.id; render(); flashBanner('Tap a map cell to move '+mo.name); } });
  app.querySelectorAll('[data-place]').forEach(el=>el.onclick=()=>{ net.sel=(net.sel===el.dataset.place)?null:el.dataset.place; render(); });
  app.querySelectorAll('[data-cell]').forEach(el=>el.onclick=()=>{ if(!net.sel) return; const [x,y]=el.dataset.cell.split(',').map(Number);
    if(net.sel.slice(0,2)==='t:'){ const key=net.sel.slice(2);
      if(key==='elev+'||key==='elev-'){ if(!s.map.height) s.map.height={}; const cur=s.map.height[x+','+y]||0; const nh=Math.max(-4,Math.min(4, cur+(key==='elev+'?1:-1))); if(nh) s.map.height[x+','+y]=nh; else delete s.map.height[x+','+y]; dmBroadcast(); render(); return; }
      if(!s.map.tiles) s.map.tiles={}; if(key==='floor') delete s.map.tiles[x+','+y]; else s.map.tiles[x+','+y]=key; dmBroadcast(); render(); return; }   // paint terrain/elevation, keep brush
    if(net.sel.slice(0,2)==='d:'){ const key=net.sel.slice(2); if(!s.map.decor) s.map.decor={};
      if(key==='erase') delete s.map.decor[x+','+y];
      else { if((key==='torch'||key==='torch_unlit') && !nextToWall(s,x,y)){ flashBanner('🔥 Torches mount on a wall — pick a tile next to one'); return; }
        s.map.decor[x+','+y]=key; }
      dmBroadcast(); render(); return; }
    if(net.sel.slice(0,2)==='x:'){ const key=net.sel.slice(2); s.traps=s.traps||[];
      s.traps=s.traps.filter(t=>!(t.x===x&&t.y===y));   // one trap per tile — placing/erasing replaces whatever was there
      if(key!=='erase'){ const def=TRAP_CATALOG.find(t=>t.name===key); if(def) s.traps.push(Object.assign({x,y,triggered:false},def)); }
      dmBroadcast(); render(); return; }
    const ter=terrainAt(s,x,y);
    if(net.sel[0]==='m'){ const mo=s.monsters.find(m=>m.id===net.sel.slice(1)); if(mo){ const fromX=mo.x, fromY=mo.y, wasBattle=s.battle.active, mfly=monsterFlies(mo);
      if(s.battle.active){ const tdef0=TERRAIN[ter]; if(tdef0&&tdef0.solid && !(mfly&&isPitTerrain(ter))){ flashBanner((isPitTerrain(ter)?'Pit blocks ':'Wall blocks ')+mo.name); return; }
        if(s.monsters.some(m=>m.hp>0&&m.id!==mo.id&&m.x===x&&m.y===y)||s.players.some(p=>p.x===x&&p.y===y)){ flashBanner('That tile is occupied'); return; }
        const dashAvail=(mo.attacksLeft||0)>0, dashMax=(mo.moveLeft||0)+(dashAvail?(mo.speed||30):0);
        const cost=reachableCells(s,mo.x,mo.y,dashMax,mfly,mo)[x+','+y]; if(cost==null){ flashBanner(mo.name+' can’t reach there (walls or too far)'); return; }
        if(cost>(mo.moveLeft||0)){ if(!dashAvail){ flashBanner(mo.name+' too far — needs its action to Dash'); return; } mo.moveLeft=(mo.moveLeft||0)+(mo.speed||30); mo.attacksLeft=0; flashBanner('🏃 '+mo.name+' Dashes (action used)'); }
        mo.moveLeft=(mo.moveLeft||0)-cost; }
      mo.x=x; mo.y=y; mo.placed=true;
      if(s.battle.active && !mfly){ const tdef=TERRAIN[ter]; if(tdef&&tdef.deadly){ mo.hp=0; Events.emit({type:'hazard', unitId:mo.id, terrain:ter, deadly:true}); flashBanner(mo.name+' fell into the void! 💀'); } else if(tdef&&tdef.dmg){ const d=(rollNotation(tdef.dmg)||{total:0}).total; mo.hp=Math.max(0,mo.hp-d); Events.emit({type:'hazard', unitId:mo.id, terrain:ter, dmg:d}); flashBanner((tdef.e||'🔥')+' '+mo.name+' takes '+d+' from '+tdef.name); } checkTerrainHazardCond(s,mo,x,y,false); checkTrapTrigger(s,mo,x,y,false); }
      Events.emit({type:'move', id:mo.id, by:mo.name, to:{x:mo.x,y:mo.y}, fly:mfly});
      if(wasBattle){ const leaving=s.players.filter(p=>(p.hpCur||0)>0 && leavesReach(fromX,fromY,mo.x,mo.y,p.x,p.y,1)); leaving.forEach(p=>dmSend(p.id,{t:'oachance',mon:mo.id,name:mo.name,ac:mo.ac})); if(leaving.length) flashBanner('⚔ '+mo.name+' provokes opportunity attack'+(leaving.length>1?'s':'')+' from '+leaving.map(p=>p.name).join(', ')); }
    } }
    else { const p=s.players.find(pp=>pp.id===net.sel.slice(1)); if(p){ if(s.battle.active && isFullWall(ter)){ flashBanner('Wall is impassable'); return; } p.x=x; p.y=y; p.placed=true;
      if(s.battle.active){ const tdef=TERRAIN[ter]; if(tdef&&tdef.deadly){ dmSend(p.id,{t:'apply',delta:-9999}); Events.emit({type:'hazard', unitId:p.id, terrain:ter, deadly:true}); flashBanner(p.name+' pushed into the void! 💀'); } else if(tdef&&tdef.dmg){ const d=(rollNotation(tdef.dmg)||{total:0}).total; dmSend(p.id,{t:'apply',delta:-d}); Events.emit({type:'hazard', unitId:p.id, terrain:ter, dmg:d}); flashBanner(p.name+' pushed into '+tdef.name+' — '+d+'!'); } sendTerrainHazardCheck(s,p,x,y); sendTrapTriggerCheck(s,p,x,y); } } }
    net.sel=null; dmBroadcast(); render(); });
  { const mc=$('#mClear'); if(mc) mc.onclick=()=>{ if(confirm('Clear all terrain & elevation?')){ s.map.tiles={}; s.map.height={}; s.map.decor={}; dmBroadcast(); render(); } }; }
  { const ml=$('#mLoad'); if(ml) ml.onclick=()=>{ const v=$('#mPreset').value; if(!v) return; const [k,nm]=[v.slice(0,1),v.slice(2)]; const d=k==='p'?MAP_PRESETS[nm]:savedMaps()[nm]; if(d&&confirm('Load "'+nm+'"? This replaces the current map.')) loadMapData(d); }; }
  { const ms=$('#mSave'); if(ms) ms.onclick=()=>{ const nm=prompt('Save current map as:'); if(!nm) return; const all=savedMaps(); all[nm]={cols:s.map.cols,rows:s.map.rows,tiles:Object.assign({},s.map.tiles||{}),height:Object.assign({},s.map.height||{}),decor:Object.assign({},s.map.decor||{})}; try{ localStorage.setItem('grimoire.maps',JSON.stringify(all)); }catch(e){} flashBanner('Map saved: '+nm); render(); }; }
  // Import battle map JSON from voxel engine ("Export for Grimoire")
  { const mi=$('#mImportJson'), mf=$('#mImportFile');
    if(mi&&mf){ mi.onclick=()=>mf.click();
      mf.onchange=()=>{ const f=mf.files&&mf.files[0]; mf.value=''; if(!f) return;
        const reader=new FileReader();
        reader.onload=()=>{ try{
          let d=JSON.parse(String(reader.result||''));
          // Accept raw bake or { map: {...} } / { session: { map } }
          if(d&&d.map&&d.map.tiles) d=d.map;
          if(d&&d.session&&d.session.map) d=d.session.map;
          if(!d||!d.cols||!d.rows||!d.tiles){ flashBanner('Not a Grimoire/voxel map JSON'); return; }
          // Clamp size (UI was 30; allow larger voxel bakes)
          d.cols=Math.max(2,Math.min(48,Number(d.cols)||10));
          d.rows=Math.max(2,Math.min(48,Number(d.rows)||8));
          // Normalize tile keys Grimoire TERRAIN knows
          const ok=new Set(Object.keys(TERRAIN));
          const tiles={};
          Object.keys(d.tiles||{}).forEach(k=>{ let t=d.tiles[k]; if(t==='dirt') t='mud'; if(t==='floor') t='grass'; if(!ok.has(t)) t='grass'; tiles[k]=t; });
          d.tiles=tiles;
          const nm=prompt('Load map into session'+(d.name?` ("${d.name}")`:'')+'. Also save to library as:', d.name||f.name.replace(/\.json$/i,'')||'Imported map');
          if(nm===null) return;
          if(nm.trim()){ const all=savedMaps(); all[nm.trim()]={cols:d.cols,rows:d.rows,tiles:Object.assign({},d.tiles),height:Object.assign({},d.height||{}),decor:Object.assign({},d.decor||{})}; try{ localStorage.setItem('grimoire.maps',JSON.stringify(all)); }catch(e){} }
          loadMapData(d);
          flashBanner('Imported map '+(d.cols)+'×'+(d.rows)+(nm&&nm.trim()?' · saved as '+nm.trim():''));
        }catch(e){ flashBanner('Import failed: '+(e.message||e)); } };
        reader.readAsText(f);
      };
    }
  }
  $('#mResize').onclick=()=>{ s.map.cols=Math.max(2,Math.min(48,Number($('#mCols').value)||10)); s.map.rows=Math.max(2,Math.min(48,Number($('#mRows').value)||8)); dmBroadcast(); render(); };
}

function deployMonster(m){ if(!net||net.role!=='dm') return;
  const same=net.session.monsters.filter(x=>x.base===m.n);
  if(same.length===1){ same[0].name=same[0].base+' 1'; same[0].num=1; }   // retro-number the first when a second appears
  const idx=net.session.monsters.length, cols=net.session.map.cols||10;
  const spd=(typeof m.spd==='number')?m.spd:(String(m.spd||'').match(/(\d+)/)?Number(String(m.spd).match(/(\d+)/)[1]):30);
  const fly=/fly/i.test(String(m.spd||''));
  net.session.monsters.push({id:'m'+Date.now().toString(36)+Math.floor(Math.random()*99), base:m.n, name: same.length? m.n+' '+(same.length+1) : m.n, num: same.length? same.length+1 : 0, hp:m.hp, max:m.hp, ac:m.ac, x:idx%cols, y:Math.floor(idx/cols), sprite:m.sprite, atk:m.atk, init:m.init||0, attacks:m.attacks||1, attacksLeft:m.attacks||1, speed:spd, moveLeft:spd, fly});
  dmBroadcast(); render(); flashBanner('Deployed '+m.n); }

function deployNpc(spec){ if(!net||net.role!=='dm') return;
  const idx=net.session.monsters.length, cols=net.session.map.cols||10;
  net.session.monsters.push({id:'m'+Date.now().toString(36)+Math.floor(Math.random()*99), base:spec.name, name:spec.name, isNpc:true, race:spec.race||'', hp:spec.hp, max:spec.hp, ac:spec.ac, x:idx%cols, y:Math.floor(idx/cols), atk:spec.atk||'', attacks:1, attacksLeft:1, speed:spec.speed||30, moveLeft:spec.speed||30, abilities:{str:spec.str,dex:spec.dex,con:spec.con,int:spec.int,wis:spec.wis,cha:spec.cha}, skillProf:{}, skillExp:{}, saveProf:{}});
  dmBroadcast(); render(); flashBanner('Deployed NPC '+spec.name); }

function dmMonsterAttack(mo){
  if(net.session.battle.active && mo.attacksLeft!=null && mo.attacksLeft<=0){ flashBanner(mo.name+' already attacked this turn — ▶ Next turn to reset'); return; }
  const atks=parseMonsterAttacks(mo.atk); if(!atks.length) atks.push({name:'Attack',hit:0,dmg:'1d6'});
  if(isIncapacitated(mo)){ flashBanner('🌀 '+mo.name+' is incapacitated — it loses its action'); return; }
  // a Dominated monster is forced to attack its allies — offer monsters, not players
  const dominated=isDominated(mo);
  const players= dominated
    ? net.session.monsters.filter(m=>m.hp>0&&m.id!==mo.id).map(m=>({id:m.id,name:m.name,ac:m.ac,hpCur:m.hp,hpMax:m.max,x:m.x,y:m.y}))
    : net.session.players;
  if(!players.length){ flashBanner(dominated?'No other monsters for '+mo.name+' to attack':'No players connected to target'); return; }
  // Shove/Grapple against a connected player — same DM-can't-roll-the-player's-side pattern
  // as a save-based attack: the DM rolls the monster's Athletics locally and sends the total
  // to that player's own device, which resolves the contest with its real Athletics/
  // Acrobatics and applies the result to itself (see the 'maneuverCheck' player handler).
  // Not offered against a dominated monster's own allies — those aren't real net players.
  if(!dominated) atks.push({name:'Shove (Prone)', maneuver:'shove-prone'}, {name:'Grapple', maneuver:'grapple'});
  // A grappled monster previously had no way to ever escape via this UI (maneuverEscape's
  // !isPc branch existed but had no real caller until the mo.grappledBy name-fix above).
  // Fully local — no player round-trip, resolves the instant the DM rolls it.
  if((mo.conds||[]).some(x=>x.name==='Grappled')) atks.push({name:'Escape Grapple', escapeGrapple:true});
  // Search (counterpart to Hide, which only ever worked in Quick Battle before): an active
  // Perception check vs a Hidden player's real Stealth total (hiddenDC), now synced to the
  // DM via playerHello() the same way sanctuaryDC/holyAuraDC already are. Only offered when
  // a connected player is actually Hidden — nothing else in this app can be, so a standing
  // "always visible" Search option would just be noise the rest of the time.
  const hiddenPlayers=dominated?[]:net.session.players.filter(p=>(p.conds||[]).includes('Hidden'));
  if(hiddenPlayers.length) atks.push({name:'Search', search:true});
  const st={atk:atks[0], targetId:players[0].id, phase:'aim', d20:0, total:0, dmg:0, consumed:false};
  const tgt=()=>players.find(p=>p.id===st.targetId)||players[0];
  // Making an attack (hit OR miss) spends one of the monster's attacks — identical to
  // the player rule. Each fresh attack in the sequence must commit before it can roll.
  const commitAttack=()=>{ if(!net.session.battle.active || mo.attacksLeft==null) return true;
    if(st.consumed) return true;
    if(mo.attacksLeft<=0){ flashBanner(mo.name+' has no attacks left — ▶ Next turn to reset'); return false; }
    mo.attacksLeft=Math.max(0,mo.attacksLeft-1); st.consumed=true; dmBroadcast(); return true; };
  function draw(){ const range=st.atk.tiles||1; const inR=players.filter(p=>inBlast(mo.x,mo.y,p.x,p.y,range) && losClear(net.session,mo.x,mo.y,p.x,p.y));
    if(inR.length && !inR.some(p=>p.id===st.targetId)) st.targetId=inR[0].id;
    const t=tgt(); const left=(net.session.battle.active&&mo.attacksLeft!=null)?mo.attacksLeft:null;
    let body=`<h2>⚔ ${esc(mo.name)} attacks${left!=null?` <span class="muted" style="font-size:12px;text-transform:none">— ${left}/${mo.attacks||1} attack${(mo.attacks||1)>1?'s':''} left</span>`:''}</h2>`;
    if(dominated) body+=`<p class="muted" style="font-size:12px;margin:0 0 8px">🌀 <b>Dominated</b> — it attacks its own allies while controlled.</p>`;
    body+=`<div class="field"><label>Attack</label><div class="chips">${atks.map((a,i)=>`<button class="chip ${st.atk===a?'on':''}" data-ma="${i}">${esc(a.name)}${a.hit!=null?' +'+a.hit:a.dc?' (DC'+a.dc.n+')':''}${a.tiles>1?' · '+(a.tiles*5)+'ft':''}</button>`).join('')}</div></div>`;
    if(st.atk.escapeGrapple){ /* no target to pick — resolves against the grappler directly */ }
    else if(st.atk.search){
      if(!hiddenPlayers.some(p=>p.id===st.targetId)) st.targetId=hiddenPlayers[0].id;
      body+=`<div class="field"><label>Hidden player</label><select id="maTgt">${hiddenPlayers.map(p=>`<option value="${p.id}" ${p.id===st.targetId?'selected':''}>${esc(p.name)}</option>`).join('')}</select></div>`;
    }
    else if(!inR.length){ body+=`<div class="empty" style="padding:10px 0">No players within ${range*5} ft of ${esc(mo.name)} for ${esc(st.atk.name)} — 📍 move it closer or pick another attack.</div>`; }
    else { body+=`<div class="field"><label>Target (in range)</label><select id="maTgt">${inR.map(p=>`<option value="${p.id}" ${p.id===st.targetId?'selected':''}>${esc(p.name)} — AC ${p.ac}, HP ${p.hpCur}/${p.hpMax} · ${gridDist(mo.x,mo.y,p.x,p.y)*5}ft</option>`).join('')}</select></div>`; }
    const outOfAttacks = left!=null && left<=0 && !st.consumed;
    if(st.atk.escapeGrapple){
      body+=`<p class="muted" style="font-size:12px;margin:0 0 8px">${esc(mo.name)} is Grappled by ${esc(mo.grappledBy||'someone')}. No target to pick — this resolves against them directly.</p>
        <button class="btn block" id="maEscape">🤸 Roll Athletics/Acrobatics vs their Athletics</button>`;
    } else if(st.atk.search){
      const target=hiddenPlayers.find(p=>p.id===st.targetId);
      body+= (target&&target.hiddenDC!=null)
        ? `<button class="btn block" id="maSearch">🔍 Roll Perception vs ${esc(target.name)}'s Stealth</button>`
        : `<div class="empty" style="padding:10px 0">${esc((target&&target.name)||'That player')} hid before this session synced their Stealth total — ask them to Hide again.</div>`;
    } else if(st.atk.maneuver){
      if(st.maneuverSent){
        body+=`<div class="card" style="text-align:center;margin:0 0 8px">🎲 ${esc(mo.name)} rolled Athletics: <b>${st.total}</b><br><span class="muted" style="font-size:12px">Waiting for ${esc(t.name)}'s response…</span></div>`;
      } else if(!inR.length){
        // handled by the "no players in range" empty-state above
      } else {
        body+= outOfAttacks?`<div class="empty" style="padding:8px 0">No attacks left this turn — ▶ Next turn to reset.</div>`:`<button class="btn block" id="maManeuver">🎲 Roll Athletics vs ${esc(t.name)}'s Athletics/Acrobatics</button>`;
      }
    } else if(st.atk.dc){
      body+=`<div class="card" style="margin:0 0 10px"><b>${esc(st.atk.name)}</b><br>${esc(t.name)} must make a <b>DC ${st.atk.dc.n} ${st.atk.dc.ab}</b> save.${st.atk.dmg?'<br>Damage: '+esc(st.atk.dmg):''}</div>`;
      if(st.atk.dmg){ if(!st.dmg) body+= outOfAttacks?`<div class="empty" style="padding:8px 0">No attacks left this turn — ▶ Next turn to reset.</div>`:`<button class="btn block" id="maDmg">🎲 Roll damage</button>`;
        else body+=`<div class="card" style="text-align:center;margin:0 0 8px"><div style="font-family:Georgia,serif;font-size:30px;font-weight:700;color:var(--bad)">${st.dmg}</div></div><div class="row2"><button class="btn bad" id="maFull">Apply ${st.dmg} (fail)</button><button class="btn ghost" id="maHalf">Apply ${Math.floor(st.dmg/2)} (save)</button></div>`; }
    } else if(st.phase==='aim'){
      body+= outOfAttacks?`<div class="empty" style="padding:8px 0">No attacks left this turn — ▶ Next turn to reset.</div>`:`<button class="btn block" id="maRoll">🎲 Roll to hit (+${st.atk.hit||0}) vs AC ${t.ac}</button>`;
    } else {
      const ac=st.ac!=null?st.ac:t.ac, crit=st.crit||st.d20===20, isHit=st.total>=ac||crit;
      body+=`<div class="card" style="text-align:center;margin:0 0 8px"><div style="font-family:Georgia,serif;font-size:32px;font-weight:700;color:${isHit?'var(--good)':'var(--bad)'}">${st.total}</div><div class="muted">d20(${st.d20}) +${st.atk.hit||0} vs AC ${ac}${st.cover?' (+'+st.cover+' cover)':''} — ${crit?'💥 CRIT':isHit?'HIT':'MISS'}</div></div>`;
      if(isHit){ if(!st.dmg) body+=`<button class="btn block" id="maDmg">🎲 Roll damage${crit?' (crit ×2 dice)':''}</button>`;
        else body+=`<div class="card" style="text-align:center;margin:0 0 8px"><div style="font-family:Georgia,serif;font-size:30px;font-weight:700;color:var(--bad)">${st.dmg}</div></div><button class="btn bad block" id="maApply">Apply ${st.dmg} to ${esc(t.name)}</button>`; }
      body+=`<button class="btn ghost block" id="maReset" style="margin-top:8px">↺ New attack</button>`;
    }
    body+=`<button class="btn ghost block" id="maClose" style="margin-top:10px">Close</button>`;
    $('#modalRoot').innerHTML=`<div class="modal" id="maModal"><div class="sheet"><div class="grip"></div>${body}</div></div>`;
    $('#maModal').onclick=e=>{ if(e.target.id==='maModal') $('#modalRoot').innerHTML=''; };
    $('#maClose').onclick=()=>{ $('#modalRoot').innerHTML=''; };
    { const ts=$('#maTgt'); if(ts) ts.onchange=()=>{ st.targetId=ts.value; st.phase='aim'; st.dmg=0; st.crit=false; draw(); }; }
    document.querySelectorAll('[data-ma]').forEach(b=>b.onclick=()=>{ st.atk=atks[Number(b.dataset.ma)]; st.phase='aim'; st.dmg=0; st.crit=false; st.maneuverSent=false; draw(); });
    { const r=$('#maRoll'); if(r) r.onclick=()=>{ if(!commitAttack()) return; sfx('swing');
      // Echo Knight — Shadow Martyr, DM-hosted counterpart to QB's own check in
      // qbResolveAttack: st.targetId stays pointed at the real player (tgt()/rendering below
      // still reads the player's name/AC for display — "an attack meant for X"), but the
      // ACTUAL Engine roll/apply target is redirected to the echo when armed+in range.
      st.echoRedirect = !dominated ? shadowMartyrRedirect(net.session, tgt()) : null;
      const rollTargetId = st.echoRedirect ? st.echoRedirect.id : st.targetId;
      if(st.echoRedirect) flashBanner('🛡 Shadow Martyr — the echo steps into the attack meant for '+tgt().name);
      // College of Lore — Cutting Words, DM-hosted counterpart (same shared cuttingWordsReduce
      // QB's qbResolveAttack calls, checking every connected player for an armed Lore Bard
      // within 60 ft of the ATTACKING monster, not just one).
      const cwAtk={toHit:st.atk.hit||0, tiles:st.atk.tiles};
      const cwDie=!dominated ? cuttingWordsReduce(net.session, mo, cwAtk, net.session.players) : 0;
      if(cwDie) flashBanner('🎵 Cutting Words — the attack roll is reduced by '+cwDie);
      const res=Engine.hitResult(sessionAdapter, mo.id, rollTargetId, cwAtk); st.d20=res.d20; st.total=res.total; st.ac=res.ac; st.cover=res.cover; st.crit=res.crit; st.phase='res'; const advTag=res.adv?((res.adv>0?' · ADV':' · DIS')+' — '+(res.advWhy||[]).join(', ')):''; sfx(res.crit?'crit':res.hit?'hit':'miss'); attackFx(res.crit?'crit':res.hit?'hit':'miss'); pushRoll({label:mo.name+' '+st.atk.name, total:st.total, detail:'d20('+st.d20+') +'+(st.atk.hit||0)+' vs AC '+res.ac+advTag, crit:res.crit?'crit':st.d20===1?'fumble':null, kind:'check'}); draw(); }; }
    { const mm=$('#maManeuver'); if(mm) mm.onclick=()=>{ if(!commitAttack()) return; sfx('swing');
      const bonus=monsterCheckBonus(mo), d20=rnd(20); st.total=d20+bonus; st.maneuverSent=true;
      dmSend(t.id, {t:'maneuverCheck', kind:st.atk.maneuver, monTotal:st.total, mon:mo.id, monName:mo.name});
      pushRoll({label:mo.name+' '+st.atk.name, total:st.total, detail:'d20('+d20+') +'+bonus+' Athletics', kind:'check'});
      flashBanner('Waiting for '+t.name+"'s response…");
      draw(); }; }
    { const dm=$('#maDmg'); if(dm) dm.onclick=()=>{ if(st.atk.dc && !commitAttack()) return; const crit=st.crit||st.d20===20; sfx('damage'); attackFx(crit?'crit':'hit'); st.dmg=Engine.rollDamage({dmg:st.atk.dmg||'1d6'}, crit); pushRoll({label:mo.name+' '+st.atk.name+' dmg', total:st.dmg, detail:(crit?'CRIT ':'')+(st.atk.dmg||'1d6'), kind:'dmg'}); draw(); }; }
    { const es=$('#maEscape'); if(es) es.onclick=()=>{ if(!commitAttack()) return;
      const res=maneuverEscape(sessionAdapter, mo, false, m=>flashBanner(m));
      if(res.ok) pushRoll({label:mo.name+' Escape Grapple', total:res.atkTotal, detail:'vs '+res.defTotal, kind:'check'});
      $('#modalRoot').innerHTML=''; dmBroadcast(); render(); }; }
    { const se=$('#maSearch'); if(se) se.onclick=()=>{ if(!commitAttack()) return;
      const target=hiddenPlayers.find(p=>p.id===st.targetId); if(!target) return;
      const {total,found}=monsterSearchRoll(mo, target.hiddenDC);
      pushRoll({label:mo.name+' Search (Perception)', total, detail:'vs Stealth '+target.hiddenDC, kind:'check'});
      if(found){ dmSend(target.id,{t:'cond',name:'Hidden',on:false}); target.conds=(target.conds||[]).filter(x=>x!=='Hidden');
        flashBanner('🔍 '+mo.name+' spots '+target.name+'!'); }
      else flashBanner('🔍 '+mo.name+" doesn't find "+target.name);
      $('#modalRoot').innerHTML=''; dmBroadcast(); render(); }; }
    const useAtk=()=>{ dmBroadcast(); render(); };   // the attack was already spent at commit time (on the roll)
    // apply through the Engine — the modal rolled interactively, so the pre-rolled d20 and
    // damage are passed in; the Engine mutates via the adapter and emits the event stream.
    const saveSp=savedKnown=>({name:st.atk.name, dc:st.atk.dc?st.atk.dc.n:10, save:st.atk.dc?String(st.atk.dc.ab).toLowerCase():null, savedKnown, dmgTotal:Math.abs(st.dmg), cond:st.atk.cond?{c:st.atk.cond,rounds:10}:null});
    { const ap=$('#maApply'); if(ap) ap.onclick=()=>{ const rollTargetId = st.echoRedirect ? st.echoRedirect.id : st.targetId;
      const ev=Engine.attack(sessionAdapter, mo.id, rollTargetId, {name:st.atk.name, toHit:st.atk.hit||0, dmg:st.atk.dmg||'1d6', tiles:st.atk.tiles}, {face:st.d20, dmgTotal:Math.abs(st.dmg)});
      if(ev.sanctuary&&ev.sanctuary.blocked) flashBanner('🛡️ '+tgt().name+"'s Sanctuary holds — "+mo.name+" can't bring itself to attack (Wis "+ev.sanctuary.roll+' vs DC '+ev.sanctuary.dc+')');
      else if(ev.hit){ flashBanner(mo.name+' hits '+(st.echoRedirect?st.echoRedirect.name:tgt().name)+' for '+ev.dmg+(ev.holyAura&&ev.holyAura.blinded?' — Holy Aura blinds '+mo.name:'')); if(st.atk.cond){ const cu=sessionAdapter.unit(rollTargetId); if(cu) sessionAdapter.addCond(cu, st.atk.cond, 10); flashBanner('🌀 '+tgt().name+' is '+st.atk.cond); }
        if(st.echoRedirect && st.echoRedirect.hp<=0) dmSend(st.echoRedirect.controllerId, {t:'echoDestroyed'}); }
      else flashBanner(mo.name+' misses '+tgt().name);
      $('#modalRoot').innerHTML=''; useAtk(); }; }
    { const f=$('#maFull'); if(f) f.onclick=()=>{ const ev=Engine.castApply(sessionAdapter, mo.id, st.targetId, saveSp(false)); flashBanner(tgt().name+' takes '+ev.dmg+(ev.cond?' — 🌀 '+ev.cond:'')); $('#modalRoot').innerHTML=''; useAtk(); }; }
    { const hf=$('#maHalf'); if(hf) hf.onclick=()=>{ const ev=Engine.castApply(sessionAdapter, mo.id, st.targetId, saveSp(true)); flashBanner(tgt().name+' takes '+ev.dmg+' (saved)'); $('#modalRoot').innerHTML=''; useAtk(); }; }
    { const rs=$('#maReset'); if(rs) rs.onclick=()=>{ st.phase='aim'; st.dmg=0; st.crit=false; st.consumed=false; draw(); }; }
  }
  draw();
}

function openQbSheet(c){
  const abils=ABILITIES.map(([k,nm])=>`<div class="tile"><div class="lab">${nm.slice(0,3).toUpperCase()}</div><div class="big">${sgn(mod(abil(c,k)))}</div><div class="muted" style="font-size:11px">${abil(c,k)}</div></div>`).join('');
  const saves=ABILITIES.map(([k,nm])=>{ const prof=!!c.saveProf[k]; return `<div class="listrow"><span class="profdot ${prof?'on':''}"></span><div class="nm">${nm}</div><div class="val">${sgn(saveMod(c,k))}</div></div>`; }).join('');
  const profSkills=SKILLS.filter(([key])=>c.skillProf[key]||c.skillExp[key]);
  const equipped=(c.items||[]).filter(it=>it.equipped);
  const ct=RACE_TRAITS[c.race]||[], cf=(CLASS_FEATURES[c.cls]||[]).filter(f=>f[0]<=(Number(c.level)||1));
  const sheet=`<div class="modal" id="qbsModal"><div class="sheet"><div class="grip"></div>
    <h2 style="margin:0">${esc(c.name)}</h2>
    <div class="muted" style="font-size:12px;margin:2px 0 10px">${esc(c.race||'')} ${classLabel(c)}${c.subclass?' · '+esc(c.subclass):''}</div>
    <div class="grid3" style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin:0 0 10px">
      <div class="tile"><div class="lab">HP</div><div class="big">${c.hp.cur}/${c.hp.max}</div></div>
      <div class="tile"><div class="lab">AC ${bd('ac')}</div><div class="big">${computeAC(c)}</div></div>
      <div class="tile"><div class="lab">Speed</div><div class="big">${effSpeed(c)}<span style="font-size:11px"> ft</span></div></div>
    </div>
    <div class="grid3" style="display:grid;grid-template-columns:repeat(6,1fr);gap:6px;margin-bottom:10px">${abils}</div>
    <div class="field"><label>Saving Throws</label>${saves}</div>
    <div class="field"><label>Proficient Skills</label>${profSkills.length?profSkills.map(([key,nm,ab])=>`<div class="listrow"><div class="nm">${nm}${c.skillExp[key]?' ◆':''}</div><div class="val">${sgn(skillBonus(c,key,ab,true))}</div></div>`).join(''):'<div class="empty" style="padding:6px 0">None</div>'}</div>
    ${c.feats.length?`<div class="field"><label>Feats</label><div class="muted" style="font-size:13px">${c.feats.map(f=>esc(f.name||f)).join(', ')}</div></div>`:''}
    ${equipped.length?`<div class="field"><label>Equipped</label><div class="muted" style="font-size:13px">${equipped.map(it=>esc(it.name)).join(', ')}</div></div>`:''}
    ${(ct.length||cf.length)?`<div class="field"><label>Features &amp; Traits</label>
      ${ct.map(t=>`<div class="spell"><div class="nm"><b>${esc(t[0])}</b><small>${esc(t[1])}</small></div></div>`).join('')}
      ${cf.map(f=>`<div class="spell"><div class="nm"><b>${esc(f[1])} <span class="sub">Lv ${f[0]}</span></b><small>${esc(f[2])}</small></div></div>`).join('')}
    </div>`:''}
    <button class="btn ghost block" id="qbsClose" style="margin-top:10px">Close</button>
  </div></div>`;
  $('#modalRoot').innerHTML=sheet;
  $('#qbsClose').onclick=()=>{ $('#modalRoot').innerHTML=''; };
  $('#qbsModal').onclick=e=>{ if(e.target.id==='qbsModal') $('#modalRoot').innerHTML=''; };
}

function openMonsterSheet(mo){
  const base=monsterDef(mo.base||mo.name)||{};
  const atks=parseMonsterAttacks(mo.atk);
  const conds=(mo.conds&&mo.conds.length)?mo.conds.map(x=>'🌀 '+esc(x.name)+(x.rounds!=null?' ('+x.rounds+')':'')).join(', '):'None';
  const battle=net.session&&net.session.battle&&net.session.battle.active;
  const sheet=`<div class="modal" id="msheetModal"><div class="sheet"><div class="grip"></div>
    <div style="display:flex;gap:12px;align-items:center;margin:0 0 8px">
      <span class="emblem" style="padding:3px;flex:none">${mo.sprite?pixelArt(monsterSprite(mo.sprite),4):'🗿'}</span>
      <div><h2 style="margin:0">${esc(mo.name)}</h2><div class="muted" style="font-size:12px">${mo.isNpc?'NPC'+(mo.race?' · '+esc(mo.race):''):(base.cr?'CR '+esc(base.cr)+' · ':'')+esc(base.n||mo.base||'Custom')}</div></div>
    </div>
    <div class="grid3" style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin:0 0 10px">
      <div class="tile"><div class="lab">AC</div><div class="big">${mo.ac}</div></div>
      <div class="tile"><div class="lab">HP</div><div class="big">${mo.hp}/${mo.max}</div></div>
      <div class="tile"><div class="lab">Speed</div><div class="big">${mo.speed||base.spd||30}<span style="font-size:11px"> ft</span></div></div>
    </div>
    ${mo.isNpc&&mo.abilities?`<div class="field"><label>Abilities</label><div class="grid3" style="display:grid;grid-template-columns:repeat(6,1fr);gap:6px">${ABILITIES.map(([k,nm])=>`<div class="tile"><div class="lab">${nm.slice(0,3).toUpperCase()}</div><div class="big">${sgn(mod(mo.abilities[k]))}</div><div class="muted" style="font-size:11px">${mo.abilities[k]}</div></div>`).join('')}</div></div>`:''}
    ${mo.isNpc&&mo.race&&RACE_TRAITS[mo.race]?`<div class="field"><label>Racial traits <span class="muted" style="font-size:11px;text-transform:none">— flavor, not mechanically applied</span></label><div class="muted" style="font-size:13px">${RACE_TRAITS[mo.race].map(t=>esc(t[0])).join(', ')}</div></div>`:''}
    ${battle?`<div class="muted" style="font-size:12px;margin:0 0 8px">Attacks this turn: <b>${mo.attacksLeft!=null?mo.attacksLeft:(mo.attacks||1)}/${mo.attacks||1}</b> · Move left: <b>${mo.moveLeft!=null?mo.moveLeft:(mo.speed||30)} ft</b></div>`:''}
    <div class="field"><label>Attacks</label>
      ${atks.length?atks.map(a=>`<div class="spell"><div class="nm"><b>${esc(a.name)}</b><small>${a.hit!=null?'+'+a.hit+' to hit':a.dc?'DC '+a.dc.n+' '+a.dc.ab+' save':''}${a.dmg?' · '+esc(a.dmg)+' damage':''}${a.tiles>1?' · reach/range '+(a.tiles*5)+' ft':''}</small></div></div>`).join(''):'<div class="empty" style="padding:6px 0">No attacks defined.</div>'}
    </div>
    <div class="field"><label>Conditions</label><div class="muted" style="font-size:13px">${conds}</div></div>
    ${(()=>{ const r=MONSTER_RVI[mo.base||mo.name]; if(!r) return ''; const parts=[]; if(r.imm&&r.imm.length)parts.push('Immune: '+r.imm.join(', ')); if(r.res&&r.res.length)parts.push('Resist: '+(r.res.length>4?r.res.slice(0,4).join(', ')+'…':r.res.join(', '))); if(r.vuln&&r.vuln.length)parts.push('Vulnerable: '+r.vuln.join(', ')); return parts.length?`<div class="field"><label>Damage</label><div class="muted" style="font-size:13px">${esc(parts.join(' · '))}</div></div>`:''; })()}
    ${base.desc?`<div class="field"><label>Notes</label><div class="muted" style="font-size:13px">${esc(base.desc)}</div></div>`:''}
    <button class="btn ghost block" id="msheetClose" style="margin-top:10px">Close</button>
  </div></div>`;
  $('#modalRoot').innerHTML=sheet;
  $('#msheetClose').onclick=()=>{ $('#modalRoot').innerHTML=''; };
  $('#msheetModal').onclick=e=>{ if(e.target.id==='msheetModal') $('#modalRoot').innerHTML=''; };
}

function openMonsterLoot(mo){
  mo.items=mo.items||[];
  const draw=()=>{
    $('#modalRoot').innerHTML=`<div class="modal" id="lootModal"><div class="sheet"><div class="grip"></div>
      <h2>🎒 ${esc(mo.name)}'s inventory</h2>
      ${mo.items.length?mo.items.map((it,i)=>`<div class="spell"><div class="nm"><b>${esc(it.name)}</b>${it.qty>1?'<small>×'+it.qty+'</small>':''}</div><button class="del" data-lootdel="${i}">✕</button></div>`).join(''):'<div class="empty">Nothing carried yet.</div>'}
      <div class="addrow">
        <select id="lootPick" style="flex:2">
          <option value="">— free text below, or pick —</option>
          <optgroup label="Weapons">${WEAPONS.map(w=>`<option value="${esc(w.n)}">${esc(w.n)}</option>`).join('')}</optgroup>
          <optgroup label="Armor">${ARMOR.filter(a=>a.key!=='none').map(a=>`<option value="${esc(a.name)}">${esc(a.name)}</option>`).join('')}</optgroup>
        </select>
        <input id="lootName" placeholder="or type a name" style="flex:2">
        <input id="lootQty" type="number" value="1" min="1" style="max-width:56px">
        <button class="btn sm" id="lootAdd">Add</button>
      </div>
      <button class="btn ghost block" id="lootClose" style="margin-top:10px">Close</button>
    </div></div>`;
    $('#lootModal').onclick=e=>{ if(e.target.id==='lootModal') $('#modalRoot').innerHTML=''; };
    $('#lootClose').onclick=()=>{ $('#modalRoot').innerHTML=''; };
    $('#lootAdd').onclick=()=>{
      const name=($('#lootName').value.trim())||$('#lootPick').value;
      if(!name) return;
      const qty=Math.max(1,Number($('#lootQty').value)||1);
      mo.items.push({name,qty});
      dmBroadcast(); render(); draw();
    };
    $('#modalRoot').querySelectorAll('[data-lootdel]').forEach(b=>b.onclick=()=>{ mo.items.splice(Number(b.dataset.lootdel),1); dmBroadcast(); render(); draw(); });
  };
  draw();
}

function openNpcBuilder(){
  $('#modalRoot').innerHTML=`<div class="modal" id="npcModal"><div class="sheet"><div class="grip"></div>
    <h2>🧑 New NPC</h2>
    <div class="field"><label>Name</label><input id="npcName" placeholder="Innkeeper Rosalind"></div>
    <div class="field"><label>Race</label><select id="npcRace"><option value="">— none —</option>${Object.keys(RACE_TRAITS).map(r=>`<option value="${esc(r)}">${esc(r)}</option>`).join('')}</select></div>
    <div class="field"><label>Ability scores</label><div class="grid3" style="display:grid;grid-template-columns:repeat(6,1fr);gap:6px">${ABILITIES.map(([k,nm])=>`<div><div class="lab" style="font-size:11px;text-align:center">${nm.slice(0,3).toUpperCase()}</div><input type="number" id="npc_${k}" value="10" min="1" max="30" style="text-align:center"></div>`).join('')}</div></div>
    <div class="grid3" style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px">
      <div><div class="lab" style="font-size:11px">AC</div><input type="number" id="npcAc" value="10"></div>
      <div><div class="lab" style="font-size:11px">HP</div><input type="number" id="npcHp" value="10"></div>
      <div><div class="lab" style="font-size:11px">Speed</div><input type="number" id="npcSpeed" value="30"></div>
    </div>
    <div class="field"><label>Attack(s) <span class="muted" style="font-size:11px;text-transform:none">— optional, same format as the bestiary e.g. "Dagger +3 (1d4+1)"</span></label><input id="npcAtk" placeholder="Dagger +3 (1d4+1)"></div>
    <button class="btn block" id="npcDeploy" style="margin-top:10px">Deploy</button>
    <button class="btn ghost block" id="npcClose" style="margin-top:8px">Close</button>
  </div></div>`;
  $('#npcRace').onchange=()=>{ const r=$('#npcRace').value; $('#npcSpeed').value=defaultSpeed({race:r}); };
  $('#npcClose').onclick=()=>{ $('#modalRoot').innerHTML=''; };
  $('#npcModal').onclick=e=>{ if(e.target.id==='npcModal') $('#modalRoot').innerHTML=''; };
  $('#npcDeploy').onclick=()=>{
    const name=$('#npcName').value.trim(); if(!name){ flashBanner('NPC needs a name'); return; }
    const spec={name, race:$('#npcRace').value, ac:Number($('#npcAc').value)||10, hp:Number($('#npcHp').value)||10, speed:Number($('#npcSpeed').value)||30, atk:$('#npcAtk').value.trim()};
    ABILITIES.forEach(([k])=>{ spec[k]=Number($('#npc_'+k).value)||10; });
    deployNpc(spec);
    $('#modalRoot').innerHTML='';
  };
}

function openBestiary(){
  const hb=loadHomebrewMonsters();
  $('#modalRoot').innerHTML=`<div class="modal" id="bestModal"><div class="sheet"><div class="grip"></div>
    <h2>📖 Bestiary <span class="muted" style="font-size:11px;text-transform:none">— ${MONSTERS_5E.length} monsters${hb.length?' + '+hb.length+' homebrew':''}</span></h2>
    <input id="bestSearch" placeholder="Search monsters…" autocomplete="off">
    <div id="bestList" style="margin-top:10px;max-height:60vh;overflow:auto"></div>
    <button class="btn block" id="bestNewHomebrew" style="margin-top:10px">🛠 New homebrew monster</button>
    <button class="btn ghost block" id="bestClose" style="margin-top:8px">Close</button>
  </div></div>`;
  const draw=()=>{ const q=($('#bestSearch').value||'').toLowerCase();
    const all=MONSTERS_5E.concat(loadHomebrewMonsters().map(m=>Object.assign({},m,{homebrew:true})));
    const f=all.filter(m=>m.n.toLowerCase().includes(q));
    $('#bestList').innerHTML = f.map(m=>`<div class="spell" style="align-items:flex-start">
      <span style="flex:none">${itemEmblem?'':''}<span class="emblem" style="padding:3px">${pixelArt(monsterSprite(m.sprite),4)}</span></span>
      <div class="nm"><b>${esc(m.n)} <span class="sub">CR ${m.cr}</span></b>${m.homebrew?' <span class="sub" style="color:var(--gold)">🛠 homebrew</span>':''}<small>AC ${m.ac} · HP ${m.hp} · Speed ${m.spd} ft<br>${esc(m.atk)}<br><span style="opacity:.8">${esc(m.desc)}</span></small></div>
      <button class="btn sm" data-deploy="${esc(m.n)}">Deploy</button>
      ${m.homebrew?`<button class="btn ghost sm" data-edithb="${esc(m.n)}">Edit</button><button class="del" data-delhb="${esc(m.n)}">✕</button>`:''}
      </div>`).join('') || '<div class="empty">No matches.</div>';
    $('#bestList').querySelectorAll('[data-deploy]').forEach(b=>b.onclick=()=>{ const m=monsterDef(b.dataset.deploy); if(m) deployMonster(m); });
    $('#bestList').querySelectorAll('[data-edithb]').forEach(b=>b.onclick=()=>{ const m=loadHomebrewMonsters().find(x=>x.n===b.dataset.edithb); if(m) openHomebrewMonsterEditor(m); });
    $('#bestList').querySelectorAll('[data-delhb]').forEach(b=>b.onclick=()=>{ if(confirm('Delete homebrew monster "'+b.dataset.delhb+'"?')){ deleteHomebrewMonster(b.dataset.delhb); draw(); flashBanner('Deleted'); } }); };
  $('#bestSearch').addEventListener('input',draw);
  $('#bestNewHomebrew').onclick=()=>openHomebrewMonsterEditor();
  $('#bestClose').onclick=()=>{ $('#modalRoot').innerHTML=''; };
  $('#bestModal').onclick=e=>{ if(e.target.id==='bestModal') $('#modalRoot').innerHTML=''; };
  draw();
}

function openHomebrewMonsterEditor(existing){
  const isEdit=!!existing; const m=existing||{n:'',cr:'1',ac:12,hp:10,spd:30,init:0,attacks:1,sprite:'',atk:'',desc:''};
  const spriteOpts=['','skeleton','zombie','ghost','wolf','bear','spider','snake','dragon','ogre','slime','demon','eye','goblin','orc','human'];
  $('#modalRoot').innerHTML=`<div class="modal" id="hbModal"><div class="sheet"><div class="grip"></div>
    <h2>🛠 ${isEdit?'Edit':'New'} homebrew monster</h2>
    <div class="field"><label>Name</label><input id="hbName" value="${esc(m.n)}" ${isEdit?'disabled':''} placeholder="Bog Troll"></div>
    <div class="grid3" style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px">
      <div><div class="lab" style="font-size:11px">CR</div><input id="hbCr" value="${esc(String(m.cr))}" placeholder="1/4, 1/2, 1, 5…"></div>
      <div><div class="lab" style="font-size:11px">AC</div><input type="number" id="hbAc" value="${m.ac}"></div>
      <div><div class="lab" style="font-size:11px">HP</div><input type="number" id="hbHp" value="${m.hp}"></div>
    </div>
    <div class="grid3" style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-top:8px">
      <div><div class="lab" style="font-size:11px">Speed</div><input type="number" id="hbSpd" value="${m.spd}"></div>
      <div><div class="lab" style="font-size:11px">Initiative</div><input type="number" id="hbInit" value="${m.init}"></div>
      <div><div class="lab" style="font-size:11px">Attacks/turn</div><input type="number" id="hbAtkN" value="${m.attacks}" min="1"></div>
    </div>
    <div class="field"><label>Sprite</label><select id="hbSprite">${spriteOpts.map(s=>`<option value="${s}" ${m.sprite===s?'selected':''}>${s||'— default —'}</option>`).join('')}</select></div>
    <div class="field"><label>Attack(s) <span class="muted" style="font-size:11px;text-transform:none">— same format as the bestiary, e.g. "Claw +5 (2d6+3)"</span></label><input id="hbAtk" value="${esc(m.atk)}" placeholder="Claw +5 (2d6+3)"></div>
    <div class="field"><label>Description</label><input id="hbDesc" value="${esc(m.desc)}" placeholder="A one-line flavor summary"></div>
    <button class="btn block" id="hbSave" style="margin-top:10px">💾 Save to bestiary</button>
    <button class="btn ghost block" id="hbClose" style="margin-top:8px">Cancel</button>
  </div></div>`;
  $('#hbClose').onclick=()=>openBestiary();
  $('#hbModal').onclick=e=>{ if(e.target.id==='hbModal') openBestiary(); };
  $('#hbSave').onclick=()=>{
    const n=$('#hbName').value.trim(); if(!n){ flashBanner('Needs a name'); return; }
    if(!isEdit && (MONSTERS_5E.some(x=>x.n===n) || loadHomebrewMonsters().some(x=>x.n===n))){ flashBanner('A monster named "'+n+'" already exists'); return; }
    const def={n, cr:$('#hbCr').value.trim()||'1', ac:Number($('#hbAc').value)||10, hp:Number($('#hbHp').value)||1, spd:Number($('#hbSpd').value)||30, init:Number($('#hbInit').value)||0, attacks:Math.max(1,Number($('#hbAtkN').value)||1), sprite:$('#hbSprite').value, atk:$('#hbAtk').value.trim(), desc:$('#hbDesc').value.trim()};
    if(saveHomebrewMonster(def)){ flashBanner('Saved "'+n+'" to the bestiary'); openBestiary(); }
  };
}

function openEncounterBuilder(){
  if(!net || net.role!=='dm') return;
  const s=net.session;
  let picks=[];
  function renderModal(){
    const all=MONSTERS_5E.concat(loadHomebrewMonsters().map(m=>Object.assign({},m,{homebrew:true})));
    const partyLevels=s.players.map(p=>p.level||1);
    const diff = picks.length ? encounterDifficulty(picks.map(m=>m.cr), partyLevels) : null;
    const diffColor = {Trivial:'var(--mut)',Easy:'var(--good)',Medium:'var(--gold)',Hard:'var(--bad)',Deadly:'var(--bad)'};
    $('#modalRoot').innerHTML=`<div class="modal" id="encModal"><div class="sheet"><div class="grip"></div>
      <h2>🎯 Encounter Builder <span class="muted" style="font-size:11px;text-transform:none">— vs ${s.players.length} player${s.players.length===1?'':'s'} (Lv ${partyLevels.join('/')||'—'})</span></h2>
      ${diff?`<div class="card" style="margin:0 0 12px;padding:10px;border:1px solid ${diffColor[diff.rating]}">
        <div style="display:flex;justify-content:space-between;align-items:center"><b style="color:${diffColor[diff.rating]}">${diff.rating}</b><span class="muted" style="font-size:12px">${diff.adjXP.toLocaleString()} adj. XP (${diff.totalXP.toLocaleString()} raw)</span></div>
        <div class="muted" style="font-size:11px;margin-top:4px">Party thresholds — Easy ${diff.thresh.easy} · Medium ${diff.thresh.medium} · Hard ${diff.thresh.hard} · Deadly ${diff.thresh.deadly}</div>
      </div>`:`<p class="muted" style="font-size:13px;margin:0 0 12px">Add monsters below — difficulty updates live against the current party.</p>`}
      <div id="encPicks">${picks.length?picks.map((m,i)=>`<div class="spell"><div class="nm"><b>${esc(m.n)}</b><small>CR ${m.cr} · ${crXP(m.cr).toLocaleString()} XP</small></div><button class="del" data-encdel="${i}">✕</button></div>`).join(''):'<div class="empty">No monsters picked yet.</div>'}</div>
      <input id="encSearch" placeholder="Search monsters to add…" autocomplete="off" style="margin-top:10px">
      <div id="encList" style="margin-top:8px;max-height:32vh;overflow:auto"></div>
      <button class="btn block" id="encDeploy" style="margin-top:12px"${picks.length?'':' disabled'}>⚔ Deploy this encounter (${picks.length})</button>
      <button class="btn ghost block" id="encClose" style="margin-top:8px">Close</button>
    </div></div>`;
    const drawList=()=>{ const qq=($('#encSearch').value||'').toLowerCase(); const f=all.filter(m=>m.n.toLowerCase().includes(qq));
      $('#encList').innerHTML=f.map(m=>`<div class="spell" style="padding:6px 8px"><div class="nm"><b>${esc(m.n)}</b><small>CR ${m.cr}${m.homebrew?' · 🛠':''}</small></div><button class="btn sm" data-encadd="${esc(m.n)}">+ Add</button></div>`).join('') || '<div class="empty">No matches.</div>';
      $('#encList').querySelectorAll('[data-encadd]').forEach(b=>b.onclick=()=>{ const m=all.find(x=>x.n===b.dataset.encadd); if(m){ picks.push(m); renderModal(); } }); };
    $('#encSearch').addEventListener('input',drawList);
    $('#modalRoot').querySelectorAll('[data-encdel]').forEach(b=>b.onclick=()=>{ picks.splice(Number(b.dataset.encdel),1); renderModal(); });
    $('#encClose').onclick=()=>{ $('#modalRoot').innerHTML=''; };
    $('#encModal').onclick=e=>{ if(e.target.id==='encModal') $('#modalRoot').innerHTML=''; };
    $('#encDeploy').onclick=()=>{ if(!picks.length) return; picks.forEach(m=>deployMonster(m)); $('#modalRoot').innerHTML=''; flashBanner('Deployed '+picks.length+'-monster encounter'); };
    drawList();
  }
  renderModal();
}

function openSessionMap(){ if(!net||!net.session){ flashBanner('Not in a game'); return; } const s=net.session;
  $('#modalRoot').innerHTML=`<div class="modal" id="smModal"><div class="sheet"><div class="grip"></div>
    <h2>🗺 ${net.session.battle.active?'Battle — Round '+s.battle.round:'Map'}<button class="btn ghost sm" id="smRotBtn" style="float:right">🔄 Rotate</button></h2>
    ${mapGridHTML(s,false)}
    <p class="muted" style="font-size:12px;margin:8px 0 4px">Tap a monster to attack it.</p>
    ${s.monsters.length? s.monsters.map(mo=>`<div class="spell"><span class="tok mon" style="flex:none">${esc((mo.name[0]||'M').toUpperCase())}</span><div class="nm"><b>${esc(mo.name)}</b><small>AC ${mo.ac} · HP ${mo.hp>0?mo.hp+'/'+mo.max:'down'}</small></div><button class="btn sm" data-attackmon="${mo.id}">⚔ Attack</button></div>`).join('') : '<div class="empty">No monsters on the field.</div>'}
    <button class="btn ghost block" id="smClose" style="margin-top:10px">Close</button>
  </div></div>`;
  $('#smClose').onclick=()=>{ $('#modalRoot').innerHTML=''; };
  $('#smModal').onclick=e=>{ if(e.target.id==='smModal') $('#modalRoot').innerHTML=''; };
  { const rv=$('#smRotBtn'); if(rv) rv.onclick=()=>{ rotateMap(); openSessionMap(); }; }
  if(isoView&&iso3dView) syncIso3DHost(s);
  document.querySelectorAll('[data-attackmon]').forEach(b=>b.onclick=()=>{ const mo=s.monsters.find(m=>m.id===b.dataset.attackmon); if(!mo) return;
    net.targetMon={id:mo.id,name:mo.name,ac:mo.ac}; if(net.conn){ try{ net.conn.send({t:'target',mon:mo.id}); }catch(e){} }
    $('#modalRoot').innerHTML=''; const c=playerChar(); if(c) openAttack(c); flashBanner('Targeting '+mo.name+' (AC '+mo.ac+')'); });
}

function renderNetBar(){
  let bar=document.getElementById('netbar');
  if(net && net.role==='player'){ if(!bar){ bar=document.createElement('div'); bar.id='netbar'; bar.className='netbar'; document.body.insertBefore(bar, document.body.firstChild); }
    const status = net.connected ? (net.session&&net.session.battle.active?' · ⚔ Battle R'+net.session.battle.round:'') : ' · <span style="color:#ffd9c9">reconnecting…</span>';
    bar.innerHTML=`<span>🔗 In game <span class="code">${esc(net.code)}</span>${status}</span><button id="nbMap">🗺 Map</button><button id="nbLeave">Leave</button>`;
    bar.querySelector('#nbMap').onclick=openSessionMap; bar.querySelector('#nbLeave').onclick=()=>{ if(confirm('Leave the game?')) playerLeave(); };
  } else if(bar){ bar.remove(); }
}

function openQuickBattle(){
  const mapNames=Object.keys(MAP_PRESETS);
  const st={charId:(cur()||DB[0]||{}).id||'', cr:'1', count:3, useIso3d:true, mapKey:MAP_PRESETS['Mechanics Lab']?'Mechanics Lab':mapNames[0], giveRope:true};
  function draw(){
    const hasHeroes=DB.length>0;
    if(hasHeroes && !st.charId) st.charId=(cur()||DB[0]).id;
    const mapBlurb=(MAP_PRESETS[st.mapKey]&&MAP_PRESETS[st.mapKey].blurb)||'';
    $('#modalRoot').innerHTML=`<div class="modal" id="qbModal"><div class="sheet"><div class="grip"></div>
      <h2>⚔ Quick Battle</h2>
      <p class="muted" style="font-size:12.5px;margin:0 0 10px">Presets remade with lighting, pits, low walls, traps & barrels. <b>Torchlit Crypt</b> / <b>Dungeon</b> / <b>Cave</b> = dungeon torches. <b>Sunset Ridge</b> = low sun. <b>Cliff Run</b> / <b>Chasm</b> = Fly over pits/lava. <b>Fireball Field</b> = barrel chain. <b>Mechanics Lab</b> = everything.</p>
      <div class="field"><label>Hero</label>
        ${hasHeroes?`<select id="qbChar">${DB.map(c=>`<option value="${c.id}" ${c.id===st.charId?'selected':''}>${esc(c.name)} — Lv ${c.level} ${esc(c.cls)}</option>`).join('')}</select>`:
          `<p class="muted" style="font-size:12px;margin:0 0 6px">No heroes yet — forge one below.</p>`}
        <button class="btn ghost sm block" id="qbRandHero" style="margin-top:6px">🎲 Forge a random hero to fight with</button></div>
      <div class="field"><label>Map</label>
        <select id="qbMap">${mapNames.map(k=>`<option value="${esc(k)}" ${k===st.mapKey?'selected':''}>${esc(k)}</option>`).join('')}</select>
        ${mapBlurb?`<p class="muted" style="font-size:11px;margin:6px 0 0">${esc(mapBlurb)}</p>`:''}</div>
      <div class="field"><label>Enemy difficulty (max CR)</label>
        <div class="chips">${['1/8','1/4','1/2','1','2','3','5'].map(cr=>`<button class="chip ${st.cr===cr?'on':''}" data-qbcr="${cr}">CR ${cr}</button>`).join('')}</div></div>
      <div class="field"><label>How many monsters</label>
        <div class="chips">${[1,2,3,4,5,6].map(n=>`<button class="chip ${st.count===n?'on':''}" data-qbn="${n}">${n}</button>`).join('')}</div></div>
      <div class="field" style="margin-top:8px"><label class="row" style="gap:8px;align-items:center;cursor:pointer;text-transform:none;letter-spacing:0">
        <input type="checkbox" id="qbIso3d" ${st.useIso3d?'checked':''} style="width:auto;margin:0"> Start in <b>Iso3D</b> WebGL view
      </label></div>
      <div class="field" style="margin-top:6px"><label class="row" style="gap:8px;align-items:center;cursor:pointer;text-transform:none;letter-spacing:0">
        <input type="checkbox" id="qbRope" ${st.giveRope?'checked':''} style="width:auto;margin:0"> Pack a <b>Hempen Rope</b> (cliff descents)
      </label></div>
      <button class="btn block" id="qbStart" style="margin-top:10px" ${hasHeroes?'':'disabled'}>▶ Start battle</button>
      <button class="btn ghost block" id="qbCancel" style="margin-top:10px">Cancel</button>
    </div></div>`;
    $('#qbCancel').onclick=()=>{ $('#modalRoot').innerHTML=''; };
    $('#qbModal').onclick=e=>{ if(e.target.id==='qbModal') $('#modalRoot').innerHTML=''; };
    { const sel=$('#qbChar'); if(sel) sel.onchange=e=>{ st.charId=e.target.value; }; }
    { const ms=$('#qbMap'); if(ms) ms.onchange=e=>{ st.mapKey=e.target.value; draw(); }; }
    { const cb=$('#qbIso3d'); if(cb) cb.onchange=()=>{ st.useIso3d=!!cb.checked; }; }
    { const rb=$('#qbRope'); if(rb) rb.onchange=()=>{ st.giveRope=!!rb.checked; }; }
    $('#qbRandHero').onclick=()=>{
      const c=forgeRandomReturnQuiet();
      if(c){ st.charId=c.id; flashBanner('Forged '+c.name+' · Lv '+c.level+' '+c.cls); draw(); }
      else flashBanner('Could not forge hero');
    };
    document.querySelectorAll('[data-qbcr]').forEach(b=>b.onclick=()=>{ st.cr=b.dataset.qbcr; draw(); });
    document.querySelectorAll('[data-qbn]').forEach(b=>b.onclick=()=>{ st.count=Number(b.dataset.qbn); draw(); });
    $('#qbStart').onclick=()=>{
      const c=DB.find(x=>x.id===st.charId)||DB[0];
      if(!c){ flashBanner('Forge a hero first'); return; }
      if(st.useIso3d) enableIso3DBattleView();
      if(st.giveRope && !hasRope(c)){ c.items=c.items||[]; c.items.push({name:'Hempen Rope (50 feet)', qty:1, kind:'gear'}); save(); }
      $('#modalRoot').innerHTML='';
      startQuickBattle(c, crToNum(st.cr), st.count, st.mapKey);
    };
  }
  draw();
}

function startQuickBattle(c, crMax, count, mapKey){
  curId=c.id; localStorage.setItem(LS_CUR,curId);   // so ⓘ breakdowns (data-bd → cur()) read the fighting character, not whatever was last open on the sheet
  qbTurnSnapshot=null;   // a stale snapshot from the PREVIOUS battle must never let Undo revert into a fight that's already over
  // A monster's Web/grapple attack (see qbResolveAttack's atk.cond handling) sets a condition
  // like Restrained straight onto c.conditions with nothing that ever clears it when the fight
  // ends — so it silently carried into every future Quick Battle forever (live report: "in
  // every map i am restrained and cant move"). A fresh Quick Battle is a new encounter; start
  // it with a clean slate rather than whatever combat condition the last battle left stuck.
  // Same leak applied to c.effects (Haste/Rage/Sanctuary/etc.) and concentration — only
  // conditions were being cleared, so a buff from the previous fight (or an active
  // concentration lock) silently carried over too.
  c.conditions={};
  c.effects=[];
  c.concentration={active:false,spell:''};
  // Don't open a fight already dead — 0 HP left over from the last battle made the UI look
  // like the encounter "instantly ended" (lose screen) the moment anything checked end state.
  if(!c.hp) c.hp={max:8,cur:8,temp:0};
  if((c.hp.cur|0)<=0){ c.hp.cur=c.hp.max|0; c.death={succ:0,fail:0}; }
  const presetKeys=Object.keys(MAP_PRESETS);
  const key=mapKey&&MAP_PRESETS[mapKey]?mapKey:(MAP_PRESETS['Mechanics Lab']?'Mechanics Lab':rndPick(presetKeys));
  const map=MAP_PRESETS[key];
  const pool=MONSTERS_5E.filter(m=>{ const n=crToNum(m.cr); return n<=crMax+1e-6 && n>=Math.min(crMax/4, crMax); });
  const usable=pool.length?pool:MONSTERS_5E.filter(m=>crToNum(m.cr)<=crMax+1e-6);
  const chosen=[]; for(let i=0;i<count;i++) chosen.push(rndPick(usable.length?usable:[MONSTERS_5E[0]]));
  const pc={id:'pc', side:'pc', name:c.name, cls:c.cls, c, x:0,y:0, hpCur:c.hp.cur, hpMax:c.hp.max, ac:computeAC(c), facing:'up'};
  const counts={};
  const monsters=chosen.map((m,i)=>{ counts[m.n]=(counts[m.n]||0)+1; const spd=(typeof m.spd==='number')?m.spd:(parseInt(m.spd)||30); const fly=/fly/i.test(String(m.spd||''));
    return {id:'qm'+i, side:'mon', base:m.n, name:m.n+(chosen.filter(x=>x.n===m.n).length>1?' '+counts[m.n]:''), num:chosen.filter(x=>x.n===m.n).length>1?counts[m.n]:0,
      x:0,y:0, hp:m.hp, max:m.hp, ac:m.ac, sprite:m.sprite, atk:m.atk, speed:spd, attacks:m.attacks||1, attacksLeft:m.attacks||1, moveLeft:spd, reactionUsed:false, brain:'tactical', fly, init:rnd(20)+(m.init||0)}; });
  QB={active:true, over:null, mapKey:key, map:{cols:map.cols, rows:map.rows, tiles:Object.assign({},map.tiles), height:Object.assign({},map.height||{}), decor:sanitizeDecorInPlace(Object.assign({},map.decor||{})), interact:map.interact?JSON.parse(JSON.stringify(map.interact)):{}, light:map.light?JSON.parse(JSON.stringify(map.light)):undefined}, players:[pc], monsters, order:[], turn:0, battle:{active:true, round:1}, moveMode:false, log:[], lights:[]};
  syncInteractDecor(QB);
  qbPlaceUnits();
  // battle resources for the PC (mirror startBattle without its render)
  c.battle=Object.assign({round:1, init:rnd(20)+initiative(c)}, freshTurnState(c));
  // Legion of One (18th): regain one Unleash Incarnation use on rolling initiative if none left.
  if(isEchoKnight(c,18) && (c.echoIncarnationLeft||0)<=0) c.echoIncarnationLeft=1;
  const order=[{k:'p',id:'pc',name:c.name,roll:c.battle.init}].concat(monsters.map(m=>({k:'m',id:m.id,name:m.name,roll:m.init})));
  order.sort((a,b)=>b.roll-a.roll); QB.order=order; QB.turn=0;
  qbLog('⚔ Battle begins on '+key+' — '+monsters.length+' enemies. Initiative: '+order.map(o=>o.name+' '+o.roll).join(', '));
  if(map.blurb) qbLog('🗺 '+map.blurb);
  // Always center camera on the PC at battle start (Iso3D pan + 2D scroll) — not map center.
  window.__iso3dCamKeep=false;
  window.__iso3dForceFrame=true;
  sfx('success'); save(); render(); flashBanner('Quick Battle! '+key);
  frameBattleCameraOnPlayer(QB, 1.55);
  qbBeginTurn();
  // qbBeginTurn re-renders — frame again after that paint / host mount
  setTimeout(()=>frameBattleCameraOnPlayer(QB, 1.55), 60);
  setTimeout(()=>frameBattleCameraOnPlayer(QB, 1.55), 200);
  setTimeout(()=>frameBattleCameraOnPlayer(QB, 1.55), 500);
}

function qbBeginTurn(){ const o=qbCurrent(); if(!o) return;
  // Camera follows the spotlight — pan to whoever's turn is starting (PC or monster).
  frameCameraOnActiveUnit(QB, 1.55);
  if(o.k==='m'){ const mo=QB.monsters.find(m=>m.id===o.id); if(!mo||mo.hp<=0){ qbNextTurn(); return; } mo.attacksLeft=mo.attacks||1; mo.moveLeft=speedBlocked(mo)?0:(mo.speed||30); mo.reactionUsed=false; render();
    setTimeout(()=>qbRunBrain(mo), 500); }
  else { const pcU=QB.players[0], c=pcU.c;   // PC turn — refresh resources, then wait for input
    resetTurnState(c,{ignoreEffects:inAntimagicField(QB,pcU.x,pcU.y)});
    let exp=[]; (c.effects||[]).forEach(e=>{ if(e.rounds!=null){ e.rounds--; if(e.rounds<=0) exp.push(e); } }); c.effects=(c.effects||[]).filter(e=>e.rounds==null||e.rounds>0);
    exp.forEach(e=>{ if(e.conc&&c.concentration&&c.concentration.spell===e.name) c.concentration={active:false,spell:''};
      if(e.cond && c.conditions && !(c.effects||[]).some(x=>x.cond===e.cond)) delete c.conditions[e.cond]; });   // e.g. Invisibility naturally timing out — endEffect() already does this for manual dismissal, this path covers the round-countdown expiry
    QB.moveMode=false; qbSnapshotForUndo(); save(); render(); }
}

function qbUndoTurn(){
  if(!qbTurnSnapshot) return false;
  const restored=JSON.parse(JSON.stringify(qbTurnSnapshot));   // a FRESH clone, not the snapshot object itself — further mutation this turn must not corrupt the one snapshot undo can keep reverting to
  // QB.players[0].c is the SAME object reference the character lives at in DB (see
  // startQuickBattle: `const pc={...c...}` captures the real character, not a copy) — every
  // battle mutation (HP, resources, conditions) writes straight through to what save()
  // persists. A naive `QB=restored` would silently replace it with a disconnected clone: the
  // screen would show the reverted HP, but save() would keep writing the character's PRE-undo
  // state to localStorage forever after, and every subsequent battle action this turn would
  // mutate the orphaned clone instead of the real character. Wipe the real object's fields and
  // repopulate them from the snapshot IN PLACE instead, then re-point the restored QB at that
  // same real object, so the reference DB already holds stays exactly what QB uses.
  const realC=QB.players[0].c;
  Object.keys(realC).forEach(k=>delete realC[k]);
  Object.assign(realC, restored.players[0].c);
  restored.players[0].c=realC;
  QB=restored;
  qbLog('↩️ Turn undone — back to how it started', QB);
  save(); render();
  return true;
}

function qbNextTurn(){ if(!QB) return; if(QB.paused){ setTimeout(qbNextTurn,200); return; } if(QB.over){ render(); return; }
  let guard=0; do{ QB.turn=(QB.turn+1)%QB.order.length; if(QB.turn===0){ QB.battle.round++; QB.monsters.forEach(m=>{ if(m.conds){ m.conds.forEach(x=>{ if(x.rounds!=null) x.rounds--; }); m.conds=m.conds.filter(x=>x.rounds==null||x.rounds>0); } }); tickGasHazards(QB); expireHazards(QB); tickSessionLights(QB); } guard++; const o=qbCurrent(); const u=qbUnitById(o.id); if(u&&qbAlive(u)) break; } while(guard<=QB.order.length+1);
  qbBeginTurn();
}

function openBlastDamageModal(opts){
  const st={phase:'ready', rolls:[], total:0};
  function draw(){
    let body=`<h2>💥 ${esc(opts.title||'Blast')}</h2>`;
    body+=`<p class="cr-flavor">${esc(opts.flavor||'The spell erupts!')}</p>`;
    if(st.phase==='ready'){
      body+=`<div class="cr-stage"><p class="cr-sub">${opts.targets||0} creatures in the area${opts.save?' · '+String(opts.save).toUpperCase()+' save DC '+opts.dc+' (half on success)':''}</p>
        <p class="cr-sub">Damage: <b>${esc(opts.dmg||'')}</b> ${esc(opts.dtype||'')}</p></div>
        <button class="btn block" id="bdRoll">🎲 Roll damage</button>`;
    } else if(st.phase==='rolling'){
      body+=`<div class="cr-stage"><p class="cr-sub">Rolling ${esc(opts.dmg)}…</p><div class="cr-dice-row" id="bdRow"></div></div>`;
    } else {
      body+=`<div class="cr-stage"><div class="cr-big bad">${st.total}</div>
        <p class="cr-sub">${esc(opts.dtype||'')} — foes make their saves</p>
        <div class="cr-dice-row">${st.rolls.map((n,i)=>`<span class="cr-pip" style="animation-delay:${i*30}ms">${n}</span>`).join('')}</div></div>
        <button class="btn block" id="bdGo">Resolve blast</button>`;
    }
    $('#modalRoot').innerHTML=`<div class="modal" id="bdModal"><div class="sheet"><div class="grip"></div>${body}</div></div>`;
    if(st.phase==='ready') $('#bdRoll').onclick=()=>{
      const p=parseDice(opts.dmg||'8d6'); const rolls=[]; let total=p.flat||0;
      (p.terms||[]).forEach(t=>{ for(let i=0;i<t.n;i++){ const r=rnd(t.sides); rolls.push(r); total+=r*t.sign; } });
      st.rolls=rolls; st.total=total; st.phase='rolling'; draw();
      animateDamagePips($('#bdRow'), rolls, 70, ()=>{ st.phase='done'; sfx('fireball'); draw(); });
    };
    if(st.phase==='done') $('#bdGo').onclick=()=>{
      $('#modalRoot').innerHTML='';
      // Let the main map remount before VFX so the blast isn't hidden under a dead modal mount
      requestAnimationFrame(()=>opts.onDone&&opts.onDone(st.total));
    };
  }
  draw();
}

function animateDamagePips(rowEl, rolls, msEach, onDone){
  if(!rowEl||!rolls.length){ onDone&&onDone(); return; }
  rowEl.innerHTML=''; let i=0;
  (function next(){
    if(i>=rolls.length){ onDone&&onDone(); return; }
    const p=document.createElement('span'); p.className='cr-pip'; p.textContent=rolls[i++];
    rowEl.appendChild(p); sfx('click');
    setTimeout(next, msEach||90);
  })();
}

function openCombatRollModal(opts){
  const st={phase:'ready', d20:null, total:null, crit:false, hit:null, dmgTotal:null, dmgRolls:[], face:null, powerAttack:false};
  const kind=opts.kind||((opts.tiles||1)>1?'ranged':'melee');
  const dismiss=()=>{ $('#modalRoot').innerHTML=''; };
  function flavorReady(){
    if(kind==='spell') return combatFlavor('ready_spell',opts);
    if(kind==='ranged') return combatFlavor('ready_ranged',opts);
    return combatFlavor('ready_melee',opts);
  }
  function draw(){
    let body=`<h2>${esc(opts.title||opts.weapon||'Attack')}</h2>`;
    body+=`<p class="muted" style="font-size:12px;margin:0 0 8px">${esc(opts.attacker||'You')} → <b>${esc(opts.target||'Target')}</b>${opts.ac!=null?' · AC '+opts.ac:''}${opts.adv?(' · '+(opts.adv>0?'ADV':'DIS')):''}</p>`;
    if(st.phase==='ready'){
      body+=`<p class="cr-flavor">${esc(flavorReady())}</p>
        <div class="cr-stage"><div class="cr-diebox"><span class="face">?</span></div>
        <p class="cr-sub">To hit ${sgn((opts.toHit||0)-(st.powerAttack?5:0))}${st.powerAttack?' (−5 power attack)':''}${opts.advWhy&&opts.advWhy.length?' · '+esc(opts.advWhy.join(', ')):''}</p></div>
        ${opts.paKind?`<label class="pill" style="cursor:pointer;margin-bottom:8px;display:flex"><input type="checkbox" id="crPower" ${st.powerAttack?'checked':''}> ${opts.paKind==='gwm'?'💥 Great Weapon Master':'🎯 Sharpshooter'} — −5 to hit, +10 damage</label>`:''}
        <button class="btn block" id="crRollHit">🎲 Roll to hit</button>`;
    } else if(st.phase==='rollingHit'){
      body+=`<p class="cr-flavor">${esc(combatFlavor('swing',opts))}</p>
        <div class="cr-stage"><div class="cr-diebox spinning"><span class="face" id="crD20">…</span></div>
        <p class="cr-sub">Rolling d20…</p></div>`;
    } else if(st.phase==='hitResult'){
      const boxCls=st.crit?'crit':st.d20===1?'fumble':st.hit?'hit':'miss';
      const fl=st.crit?combatFlavor('crit',opts):st.d20===1?combatFlavor('fumble',opts):st.hit?combatFlavor('hit',opts):combatFlavor('miss',opts);
      const pc=typeof cur==='function'?cur():null;
      const canLucky=pc&&luckPointsLeft(pc)>0&&!st.usedLucky;
      const canHalfLucky=pc&&st.d20===1&&hasRacialTrait(pc,'Lucky')&&!st.usedHalfLucky;
      body+=`<p class="cr-flavor">${esc(fl)}</p>
        <div class="cr-stage"><div class="cr-diebox ${boxCls}"><span class="face">${st.d20}</span></div>
        <div class="cr-big ${st.hit?(st.crit?'gold':'good'):'bad'}">${st.total}</div>
        <p class="cr-sub">d20 (${st.d20}) ${sgn((opts.toHit||0)-(st.powerAttack?5:0))}${st.crit?' · NAT 20':st.d20===1?' · NAT 1':''} vs AC ${opts.ac}${st.hit?(st.crit?' — CRITICAL HIT':' — HIT'):' — MISS'}</p>
        <div class="cr-chips">${st.hit?`<span class="pill">${st.crit?'💥 Crit':'✓ Hit'}</span>`:`<span class="pill">✗ Miss</span>`}
          ${opts.adv?`<span class="pill">${opts.adv>0?'⬆ ADV':'⬇ DIS'}</span>`:''}</div></div>
        ${canLucky?`<button class="btn ghost block" id="crLucky">🍀 Lucky re-roll (${luckPointsLeft(pc)} left)</button>`:''}
        ${canHalfLucky?`<button class="btn ghost block" id="crHalfLucky">↻ Halfling Lucky (nat 1)</button>`:''}
        ${(st.hit&&opts.riders)?riderChecksHTML(opts.riders):''}
        ${st.hit?`<button class="btn block" id="crRollDmg">🎲 Roll damage${st.crit?' (doubled!)':''}</button>`
          :`<button class="btn block" id="crDone">Continue</button>`}`;
    } else if(st.phase==='rollingDmg'){
      body+=`<p class="cr-flavor">${esc((opts.dtype||'').includes('fire')?combatFlavor('dmg_fire',opts):combatFlavor('dmg_generic',opts))}</p>
        <div class="cr-stage"><p class="cr-sub">Rolling ${esc(st.crit?critNotation(opts.dmg||'1d6'):(opts.dmg||'1d6'))}${opts.dtype?' '+esc(opts.dtype):''}…</p>
        <div class="cr-dice-row" id="crDmgRow"></div></div>`;
    } else if(st.phase==='dmgResult'){
      const pc=typeof cur==='function'?cur():null;
      const canSavage=pc&&hasFeat(pc,'Savage Attacker')&&!(pc.battle&&pc.battle.savageUsed)&&!st.usedSavage&&(opts.kind==='melee'||!opts.kind);
      body+=`<p class="cr-flavor">${esc((opts.dtype||'').includes('fire')?combatFlavor('dmg_fire',opts):combatFlavor('dmg_generic',opts))}</p>
        <div class="cr-stage"><div class="cr-big bad">${st.dmgTotal}</div>
        <p class="cr-sub">${esc(opts.dtype||'')} damage${st.crit?' (critical)':''}</p>
        <div class="cr-dice-row">${(st.dmgRolls||[]).map((n,i)=>`<span class="cr-pip" style="animation-delay:${i*40}ms">${n}</span>`).join('')}</div></div>
        ${canSavage?`<button class="btn ghost block" id="crSavage">↻ Savage Attacker (re-roll damage)</button>`:''}
        <button class="btn block" id="crDone">Continue</button>`;
    }
    body+=`<button class="btn ghost block" id="crClose" style="margin-top:10px">Cancel</button>`;
    $('#modalRoot').innerHTML=`<div class="modal" id="crModal"><div class="sheet"><div class="grip"></div>${body}</div></div>`;
    $('#crClose').onclick=()=>{ dismiss(); opts.onCancel&&opts.onCancel(); };
    $('#crModal').onclick=e=>{ if(e.target.id==='crModal'){ /* don't dismiss mid-roll by backdrop */ } };
    if(st.phase==='ready'){ $('#crRollHit').onclick=()=>doHitRoll(); const pw=$('#crPower'); if(pw) pw.onchange=()=>{ st.powerAttack=pw.checked; draw(); }; }
    if(st.phase==='hitResult'){
      const d=$('#crRollDmg'); if(d) d.onclick=()=>doDmgRoll();
      const dn=$('#crDone'); if(dn) dn.onclick=()=>finishOut(null);
      const lk=$('#crLucky'); if(lk) lk.onclick=()=>{
        const pc=typeof cur==='function'?cur():null;
        if(!spendLuckPoint(pc)) return;
        st.usedLucky=true; doHitRoll();
      };
      const hl=$('#crHalfLucky'); if(hl) hl.onclick=()=>{ st.usedHalfLucky=true; doHitRoll(); };
    }
    if(st.phase==='dmgResult'){
      $('#crDone').onclick=()=>finishOut(st.dmgTotal);
      const sv=$('#crSavage'); if(sv) sv.onclick=()=>{
        const pc=typeof cur==='function'?cur():null;
        if(pc&&pc.battle){ pc.battle.savageUsed=true; save(); }
        st.usedSavage=true; doDmgRoll();
      };
    }
    if(st.phase==='rollingHit'){
      const faceEl=$('#crD20');
      animateD20Face(faceEl, st.d20, 850, ()=>{ st.phase='hitResult'; sfx(st.crit?'crit':st.hit?'hit':'miss'); draw(); });
    }
    if(st.phase==='rollingDmg'){
      const row=$('#crDmgRow');
      animateDamagePips(row, st.dmgRolls, 100, ()=>{ st.phase='dmgResult'; sfx('damage'); draw(); });
    }
  }
  function doHitRoll(){
    // Dice only here — projectiles wait until rolls are finished so the modal doesn't bury the FX
    sfx('click');
    const r1=rnd(20), r2=rnd(20);
    let d20=r1;
    if(opts.adv>0) d20=Math.max(r1,r2); else if(opts.adv<0) d20=Math.min(r1,r2);
    st.d20=d20; st.face=d20; st.total=d20+(opts.toHit||0)-(st.powerAttack?5:0);
    st.crit=d20===20; st.fumble=d20===1;
    st.hit=st.crit||(!st.fumble&&st.total>=(opts.ac||10));
    if(opts.autoCrit && st.hit) st.crit=true;
    st.phase='rollingHit'; draw();
  }
  function doDmgRoll(){
    const base=opts.dmg||'1d6';
    const notation=st.crit?critNotation(base):base;
    const parsed=parseDice(notation);
    const rolls=[]; let total=parsed.flat||0;
    (parsed.terms||[]).forEach(t=>{ for(let i=0;i<t.n;i++){ const r=rnd(t.sides); rolls.push(r); total+=r*t.sign; } });
    if(st.powerAttack) total+=10;   // Great Weapon Master / Sharpshooter
    // Class riders (Sneak Attack, Divine Smite, Divine Strike, Colossus Slayer, Hurl Through
    // Hell, Death Strike) — same applyAttackRiders() attackFlow uses, read from the checkboxes
    // riderChecksHTML rendered in the hitResult phase. This is the QB half of the fix for the
    // "these features only ever worked in player-net mode" gap.
    if(opts.riders && opts.riderChar){
      const sk=document.getElementById('afSneak'), sm=document.getElementById('afSmite'), ds=document.getElementById('afDivStrike'), cs=document.getElementById('afColossus'), hth=document.getElementById('afHurl'), mv=document.getElementById('afManeuver');
      const choices={sneak: sk&&sk.checked, smiteLevel: sm&&sm.value, divineStrike: ds&&ds.checked, colossus: cs&&cs.checked, hurl: hth&&hth.checked, maneuver: mv&&mv.value};
      const rr=applyAttackRiders(opts.riderChar, opts.riderAtk, opts.riderTarget, choices, st.crit, opts.riderTargetSurprised, opts.riderLog||(()=>{}));
      total+=rr.total;
      if(rr.doubled) total*=2;
    }
    st.dmgRolls=rolls; st.dmgTotal=total; st.phase='rollingDmg'; draw();
  }
  function finishOut(dmgTotal){
    // Dismiss the roll sheet first so the battlefield (and projectiles) are visible
    dismiss();
    const meta={d20:st.d20, total:st.total, hit:st.hit, crit:st.crit, face:st.face, dmgTotal:st.hit?(dmgTotal!=null?dmgTotal:st.dmgTotal):0, powerAttack:st.powerAttack};
    // Re-attach Iso3D to the main map under the modal
    const sess=battleSession();
    if(isoView&&iso3dView&&sess) try{ syncIso3DHost(sess); }catch(e){}
    const apply=()=>{
      let ev=null;
      if(opts.onCommit) ev=opts.onCommit(meta);
      if(opts.onDone) opts.onDone(ev||meta);
    };
    // Full attack animation after rolls: swing/bolt, then hit/miss, then apply damage
    if(opts.from&&opts.to){
      playCombatShotFx(opts.from, opts.to, {
        kind, dtype:opts.dtype||'', hit:!!meta.hit, crit:!!meta.crit, melee:kind==='melee'
      }, apply);
    } else apply();
  }
  draw();
}

function qbResolveAttack(att, tgt, atk, done){
  if(!att||!tgt||qbHP(tgt)<=0){ done&&done(); return; }
  const isPc=att.side==='pc'||att.id==='pc';
  // Monsters / AI: keep fast auto-resolve
  if(!isPc){
    atk=Object.assign({}, atk);   // Cutting Words mutates toHit for this ONE roll only — never the caller's shared atk object (parseMonsterAttacks' cache, etc.)
    const cwDie=cuttingWordsReduce(QB, att, atk, [QB.players[0]]);
    if(cwDie) qbLog('🎵 Cutting Words — '+qbName(att)+"'s attack roll is reduced by "+cwDie);
    const redirected=shadowMartyrRedirect(QB, tgt);
    if(redirected){ qbLog('👤 Shadow Martyr — the echo steps into the attack meant for '+qbName(tgt)); tgt=redirected; }
    const ev=Engine.applyAction(qbAdapter, {type:'attack', actorId:att.id, targetId:tgt.id, atk});
    const blocked=ev.sanctuary&&ev.sanctuary.blocked;
    if(!blocked){
      const ranged=(atk.tiles||1)>1, dtype=atk.dtype||'';
      const pk=ranged?(/fire/i.test(dtype)?'firebolt':/pierce|arrow|bow/i.test(dtype+(atk.name||''))?'arrow':'bolt'):'slash';
      if(pk==='arrow') sfx('arrow'); else if(pk==='firebolt') sfx('firebolt'); else sfx('swing');
      mapProjectile(att.x,att.y,tgt.x,tgt.y, pk, dtype);
    }
    setTimeout(()=>{
      if(ev.sanctuary) qbLog(blocked?'🛡️ '+qbName(att)+' can’t bring itself to attack '+qbName(tgt)+' — Sanctuary holds':'🛡️ '+qbName(att)+' fights through Sanctuary');
      if(blocked){ /* noop */ }
      else if(ev.hit){ const rv=ev.mult===0?' — immune!':ev.mult===0.5?' (resisted)':ev.mult===2?' (vulnerable!)':''; sfx(ev.crit?'crit':'hit'); attackFx(ev.crit?'crit':'hit', tgt.x, tgt.y); qbLog((ev.crit?'💥 ':'')+qbName(att)+' '+(ev.crit?'crits':'hits')+' '+qbName(tgt)+' for '+ev.dmg+rv+' ('+ev.total+' vs AC '+ev.ac+')');
        if(atk.cond && tgt.side==='pc'){ if(!tgt.c.conditions) tgt.c.conditions={}; tgt.c.conditions[atk.cond]=true; qbLog('🌀 '+tgt.name+' is '+atk.cond); }
        if(tgt.echo && tgt.hp<=0) reclaimPotential(QB.players[0].c, qbLog); }
      else { sfx('miss'); attackFx('miss', tgt.x, tgt.y); qbLog(qbName(att)+' misses '+qbName(tgt)+' ('+ev.total+' vs AC '+ev.ac+')'); }
      qbCheckEnd(); save(); render(); done&&done(ev);
    }, 280);
    return;
  }
  // Player: interactive to-hit + damage with dice animation + flavor
  const pre=Engine.hitResult(qbAdapter, att.id, tgt.id, atk); // AC / cover / adv (no mutation)
  const ranged=(atk.tiles||1)>1;
  const dist=gridDist(att.x,att.y,tgt.x,tgt.y);
  const melee=dist<=1;
  // Lighting: attacker vision on the target's tile
  let lightOpts={};
  if(QB&&QB.map){
    const attC=att.c||(att.side==='pc'?cur():null);
    const see=visionLevel(attC, QB, tgt.x, tgt.y, att.x, att.y);
    const selfL=visionLevel(attC, QB, att.x, att.y, att.x, att.y);
    lightOpts={seeTarget:see, attackerVision:selfL};
  }
  const cx=attackAdvantage(unitConds(att), unitConds(tgt), melee, lightOpts);
  // Assassinate (Assassin 3rd): advantage vs a target that hasn't acted yet this combat;
  // auto-crit on a hit against a target flagged 'surprised' (a new manually-toggled flag — this
  // app has no ambush/surprise-round system to derive it from automatically).
  if(isPc && att.c && isAssassin(att.c,3)){
    if(hasNotActedYet(QB, tgt.id)){ cx.adv=1; cx.why=(cx.why||[]).concat('Assassinate — hasn\'t acted yet'); }
    if(tgt.surprised) cx.autoCrit=true;
  }
  // Attacking reveals a hidden PC (PHB) — cx above already captured the advantage this
  // grants for THIS attack, so clearing here doesn't affect it. Simplification: unlike
  // Skulker's real text, a missed ranged attack still reveals you in this pass.
  if(isPc && att.c && att.c.conditions && att.c.conditions.Hidden){ delete att.c.conditions.Hidden; att.c.hiddenDC=null; }
  // Merge light into Engine adv if needed
  let useAdv=pre.adv, useWhy=(pre.advWhy||[]).slice();
  if(cx.adv&&!pre.adv){ useAdv=cx.adv; useWhy=cx.why; }
  else if(cx.adv&&pre.adv){ /* both */ useWhy=useWhy.concat(cx.why||[]); }
  else if(lightOpts.seeTarget===0||lightOpts.attackerVision===0){ useAdv=cx.adv||useAdv; useWhy=useWhy.concat(cx.why||[]); }
  const kind=/fire|bolt|ray|blast|spell/i.test(atk.name||'')||atk.spell?'spell':ranged?'ranged':'melee';
  openCombatRollModal({
    title: atk.name, attacker: qbName(att), target: qbName(tgt), weapon: atk.name,
    toHit: atk.toHit||0, ac: pre.ac, adv: useAdv, advWhy: useWhy,
    dmg: atk.dmg||'1d6', dtype: atk.dtype||atk.dt||'', tiles: atk.tiles||1, kind,
    autoCrit: !!cx.autoCrit,
    // Class riders — same attackRiderOptions()/applyAttackRiders() attackFlow uses, so Sneak
    // Attack/Divine Smite/Divine Strike/Colossus Slayer/Hurl Through Hell/Death Strike all work
    // in Quick Battle too, not just player-net.
    riders: att.c ? attackRiderOptions(att.c, atk, tgt) : null,
    riderChar: att.c, riderAtk: atk, riderTarget: tgt, riderTargetSurprised: !!tgt.surprised, riderLog: qbLog,
    paKind: att.c ? powerAttackKind(att.c, atk) : null,   // Great Weapon Master / Sharpshooter
    from:{x:att.x,y:att.y}, to:{x:tgt.x,y:tgt.y},
    onCommit:(meta)=>{
      // FX already played in finishOut → playCombatShotFx; only apply rules + log here.
      // Power attack (-5/+10): Engine.attack re-derives hit/crit from atk.toHit + the same
      // fixed face — if that used the unadjusted toHit, its authoritative hit/miss could
      // disagree with what the roll modal already showed and committed to. Pass a toHit-
      // adjusted CLONE instead of mutating the caller's shared atk object.
      const effAtk = meta.powerAttack ? Object.assign({}, atk, {toHit:(atk.toHit||0)-5}) : atk;
      const ev=Engine.attack(qbAdapter, att.id, tgt.id, effAtk, {face:meta.face, dmgTotal:meta.hit?meta.dmgTotal:0});
      if(ev.sanctuary&&ev.sanctuary.blocked){
        qbLog('🛡️ '+qbName(att)+' can’t bring itself to attack '+qbName(tgt)+' — Sanctuary holds (Wis '+ev.sanctuary.roll+' vs DC '+ev.sanctuary.dc+')');
      } else if(ev.hit){
        const rv=ev.mult===0?' — immune!':ev.mult===0.5?' (resisted)':ev.mult===2?' (vulnerable!)':'';
        qbLog((ev.crit?'💥 ':'')+qbName(att)+' '+(ev.crit?'crits':'hits')+' '+qbName(tgt)+' for '+ev.dmg+rv+' ('+ev.total+' vs AC '+ev.ac+')');
        if(atk.cond && tgt.side==='mon'){ /* applied via spell path */ }
        if(ev.holyAura) qbLog(ev.holyAura.blinded?'☀️ Holy Aura blinds '+qbName(att):qbName(att)+' resists Holy Aura');
      } else {
        qbLog(qbName(att)+' misses '+qbName(tgt)+' ('+ev.total+' vs AC '+ev.ac+')');
      }
      pushRoll({label:atk.name+' attack', total:ev.total, detail:'d20 ('+ev.d20+') '+sgn(effAtk.toHit||0)+' vs AC '+ev.ac, crit:ev.crit?'crit':ev.d20===1?'fumble':null, kind:'check', bonus:effAtk.toHit||0});
      if(ev.hit) pushRoll({label:atk.name+' damage', total:ev.dmg, detail:(atk.dmg||'')+(ev.crit?' crit':''), kind:'dmg', notation:ev.crit?critNotation(atk.dmg||'1d6'):(atk.dmg||'1d6')});
      return ev;
    },
    onDone:(ev)=>{ qbCheckEnd(); save(); render(); done&&done(ev); },
    onCancel:()=>{ done&&done(null); }
  });
}

function qbRunBrain(u){ if(!QB||QB.over){ return; }
  if(isIncapacitated(u)){ qbLog('🌀 '+u.name+' is incapacitated — it loses its turn'); setTimeout(qbNextTurn,400); return; }
  const brain=BRAINS[u.brain]||BRAINS.tactical; let intents=[]; try{ intents=brain(QB,u)||[]; }catch(e){ intents=[]; }
  let i=0; (function step(){ if(QB&&QB.paused){ setTimeout(step,200); return; }
    if(!QB||QB.over||qbHP(u)<=0||!qbEnemiesAlive()){ if(QB&&!QB.over) setTimeout(qbNextTurn,400); else render(); return; }
    if(i>=intents.length){ setTimeout(qbNextTurn,400); return; }
    qbApplyIntent(u, intents[i++], ()=>setTimeout(step, 450));
  })();
}

function renderQuickBattle(){
  const s=QB, pc=s.players[0], c=pc.c, b=c.battle; pc.hpCur=c.hp.cur; pc.hpMax=c.hp.max; pc.ac=computeAC(c);
  const o=qbCurrent(), myTurn=o&&o.k==='p'&&!s.over;
  app.className='fade'; void app.offsetWidth;
  const dashAvail=hasAction(c), dashMax=(b.move||0)+(dashAvail?effSpeed(c):0);
  const moveOpts = (myTurn&&s.moveMode)?buildMoveRangeOpts(s,pc,b.move||0,hasAction(c),effSpeed(c),isFlying(c)):{};
  app.innerHTML=`
  <div class="card" style="border:2px solid var(--accent2)">
    <div class="row between"><h2 style="margin:0;color:var(--accent2)">⚔ Quick Battle</h2><div class="addrow" style="gap:6px"><button class="btn ghost sm" id="qbSheet">📜 Sheet</button><button class="btn ghost sm" id="qbExit" style="color:var(--bad)">Exit</button></div></div>
    <div class="muted" style="font-size:12px;margin-top:6px">Round ${s.battle.round} · ${s.over?(s.over==='win'?'🏆 Victory!':'💀 Defeated'):(myTurn?'Your turn':'⏳ '+esc(o?o.name:'…')+'…')}</div>
    <div class="addrow" style="gap:5px;flex-wrap:wrap;margin-top:8px">${s.order.map((it,i)=>{ const u=qbUnitById(it.id); const dead=u&&!qbAlive(u); const icon=it.k==='p'?'🟩':(u&&isPartyAlly(u)||it.ally)?'🟦':'🟥'; return `<span class="pill" style="${i===s.turn?'background:var(--accent2);color:#fff;':''}${dead?'opacity:.4;text-decoration:line-through':''}">${icon} ${esc(it.name)} <b>${it.roll}</b></span>`; }).join('')}</div>
  </div>
  ${s.over?`<div class="card" style="text-align:center"><div style="font-size:40px">${s.over==='win'?'🏆':'💀'}</div><h2 style="margin:6px 0">${s.over==='win'?'Victory!':'You were defeated'}</h2>
    <button class="btn block" id="qbAgain" style="margin-top:8px">⚔ New Quick Battle</button>
    <button class="btn ghost block" id="qbDone" style="margin-top:8px">Back to character</button></div>`:`
  <div class="card">
    <div class="grid3" style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:8px">
      <div class="tile"><div class="lab">HP</div><div class="big" style="color:${c.hp.cur<=c.hp.max*0.3?'var(--bad)':'inherit'}">${c.hp.cur}/${c.hp.max}</div></div>
      <div class="tile"><div class="lab">AC ${bd('ac')}</div><div class="big">${computeAC(c)}</div></div>
      <div class="tile"><div class="lab">Move</div><div class="big">${b.move||0}<span style="font-size:11px">ft</span></div></div>
      <div class="tile"><div class="lab">Attacks</div><div class="big">${b.attacksLeft||0}</div></div>
    </div>
    ${c.altitude>0?`<p class="muted" style="font-size:11.5px;margin:6px 0 0">🕊️ Airborne at ${c.altitude} ft</p>`:''}
    <div class="chips" style="margin-top:10px">
      <button class="chip ${!hasAction(c)?'on':''}">${!hasAction(c)?'✓ ':''}Action${(b.actionsMax||1)>1?' '+actionsLeft(c)+'/'+(b.actionsMax||1):''}</button>
      <button class="chip ${b.bonus?'on':''}">Bonus</button>
      <button class="chip ${b.reaction?'on':''}">Reaction</button>
    </div>
    <div class="addrow" style="gap:6px;flex-wrap:wrap;margin-top:10px">
      <button class="btn ${s.moveMode?'':'ghost'}" id="qbMove" style="flex:1" ${myTurn?'':'disabled style="opacity:.5"'}>🥾 ${s.moveMode?'Moving '+ (b.move||0) +'/'+effSpeed(c)+' ft':'Move'}</button>
      <button class="btn" id="qbAttack" style="flex:1" ${myTurn?'':'disabled style="opacity:.5"'}>⚔ Attack</button>
      ${(isCaster(c)||c.spells.length)?`<button class="btn" id="qbCast" style="flex:1" ${myTurn?'':'disabled style="opacity:.5"'}>✨ Spells</button>`:''}
      <button class="btn ghost" id="qbUse" style="flex:1" ${myTurn?'':'disabled style="opacity:.5"'} title="Interact with adjacent objects, or Shove/Grapple an adjacent foe">🖐 Use</button>
    </div>
    <div class="row2" style="margin-top:8px">
      <button class="btn ghost" id="qbEnd" ${myTurn?'':'disabled style="opacity:.5"'}>End turn ▶</button>
      <button class="btn ghost" id="qbUndo" title="Restart this turn from how it began — undoes everything since your turn started" ${(myTurn&&qbUndoAvailable())?'':'disabled style="opacity:.5"'}>↩ Undo turn</button>
    </div>
    <p class="muted" style="font-size:11.5px;margin:8px 0 0">${myTurn?(s.moveMode?'Green: remaining speed (can still Attack). Red: Dash uses your Action. Jump/climb marked on path. Tap a tile.':'⚔ Attack a monster in range, ✨ cast a spell, or 🥾 Move. You can also tap a 🟥 monster directly.'):'⏳ Waiting for '+esc(o?o.name:'…')+'…'}</p>
  </div>
  <div class="card">
    <h2>Battlefield <button class="btn ghost sm" id="qbRotBtn" style="float:right">🔄 Rotate</button></h2>
    ${mapGridHTML(s,false,moveOpts)}
  </div>`}
  <div class="card">
    <h2>Battle Log</h2>
    <div style="max-height:170px;overflow:auto;border:1px solid var(--line);border-radius:10px;padding:2px 10px">
      ${s.log.length? s.log.map(e=>`<div class="listrow" style="padding:4px 0"><div class="nm" style="font-size:12px">${esc(e.m)}</div></div>`).join(''):'<div class="empty" style="padding:8px 0">…</div>'}
    </div>
  </div>`;
  $('#qbExit').onclick=qbExit;
  $('#qbSheet').onclick=()=>openQbSheet(c);
  { const a=$('#qbAgain'); if(a) a.onclick=()=>{ QB=null; openQuickBattle(); }; }
  { const d=$('#qbDone'); if(d) d.onclick=qbExit; }
  { const mv=$('#qbMove'); if(mv&&myTurn) mv.onclick=()=>{ s.moveMode=!s.moveMode; render(); }; }
  { const rv=$('#qbRotBtn'); if(rv) rv.onclick=rotateMap; }
  { const at=$('#qbAttack'); if(at&&myTurn) at.onclick=()=>qbOpenAttack(c); }
  { const ca=$('#qbCast'); if(ca&&myTurn) ca.onclick=()=>qbOpenSpells(c); }
  { const us=$('#qbUse'); if(us&&myTurn) us.onclick=()=>openAdjacentUseUI(c,s,pc); }
  { const en=$('#qbEnd'); if(en&&myTurn) en.onclick=qbEndPcTurn; }
  { const un=$('#qbUndo'); if(un&&myTurn&&qbUndoAvailable()) un.onclick=qbUndoTurn; }
  if(myTurn) app.querySelectorAll('[data-cell]').forEach(el=>el.onclick=()=>{
    const t=el.getAttribute('data-target'); if(t){ const mo=s.monsters.find(m=>m.id===t); if(mo&&mo.hp>0) qbPcAttack(mo); return; }
    const [x,y]=el.dataset.cell.split(',').map(Number); if(!s.moveMode){ flashBanner('Tap 🥾 Move first'); return; } qbMovePc(x,y);
  });
  if(isoView&&iso3dView) syncIso3DHost(s, moveOpts);
}

function qbMovePc(x,y){ const s=QB, pc=s.players[0], c=pc.c, b=c.battle, fly=isFlying(c);
  if(s.monsters.some(m=>m.hp>0&&m.x===x&&m.y===y)||(pc.x===x&&pc.y===y)) return;
  const ter=(s.map.tiles||{})[x+','+y], tdef=TERRAIN[ter]; if(tdef&&tdef.solid && !(fly&&isPitTerrain(ter))){ flashBanner(isFullWall(ter)?'Full wall — can’t climb over (ceiling)':isPitTerrain(ter)?'Pit / chasm — need flight or a bridge':'Blocked by terrain'); return; }
  const dd0=DECOR[decorAt(s,x,y)]; if(dd0&&dd0.solid){ flashBanner('Blocked by '+(dd0.name||'obstacle')); return; }
  const dashAvail=hasAction(c) && !speedBlocked(c), dashMax=(b.move||0)+(dashAvail?effSpeed(c):0);
  const meta=pathToMeta(s,pc.x,pc.y,x,y,dashMax,fly,pc);
  if(!meta){ flashBanner(speedBlocked(c)?'Restrained — speed is 0':'Can’t reach there (walls, trees, range, or cliff too high)'); return; }
  const path=meta.path, cost=meta.cost;
  if(cost==null){ flashBanner('Out of range'); return; }

  // After skill prompts succeed, commit the move
  function commitMove(opts){
    opts=opts||{};
    if(cost>(b.move||0)){ if(!dashAvail){ flashBanner('Too far — Dash needs your action'); return; } b.move=(b.move||0)+effSpeed(c); spendAction(c); b.dashed=true; qbLog('🏃 '+c.name+' dashes'); }
    const fromX=pc.x, fromY=pc.y; b.move=(b.move||0)-cost; b.moveUsed=(b.moveUsed||0)+cost; s.moveMode=false;
    const provokers=s.monsters.filter(m=>m.hp>0 && !m.reactionUsed && leavesReach(fromX,fromY,x,y,m.x,m.y,1));
    const riseFt=Math.max(0,(heightAt(s,x,y)-heightAt(s,fromX,fromY))*5);
    const dropFt=Math.max(0,(heightAt(s,fromX,fromY)-heightAt(s,x,y))*5);
    const jumpMax=runningHighJumpFt(pc);
    animateToken(null,(nx,ny)=>{ pc.x=nx; pc.y=ny; }, path, 200, ()=>{ save();
      // Flight: cross pits/chasms and ignore ground hazards (lava, acid, grease prone…)
      if(fly){
        if(isPitTerrain(ter)) qbLog('🕊️ '+c.name+' flies over the pit/chasm');
        else if(tdef&&tdef.dmg) qbLog('🕊️ '+c.name+' flies clear of the '+(tdef.name||ter)+' (no hazard damage)');
        else qbLog('🕊️ '+c.name+' flies over the terrain');
      }
      else if(tdef&&tdef.deadly){ applyHp(c,-c.hp.cur); qbLog('💀 '+c.name+' fell into the pit!'); }
      else if(tdef&&tdef.dmg){ const d=(rollNotation(tdef.dmg)||{total:0}).total; applyHp(c,-d); qbLog((tdef.e||'🔥')+' '+tdef.name+' — '+d+' damage'); }
      if(!fly&&meta.needsJump) qbLog('⬆️ '+c.name+' jumps'+(meta.maxRise?' '+meta.maxRise+' ft':'')+' (high jump '+jumpMax+' ft · Acrobatics ok)');
      else if(!fly&&riseFt>0){
        if(riseFt<=jumpMax) qbLog('⬆️ '+c.name+' jumps up '+riseFt+' ft (high jump '+jumpMax+' ft)');
        else qbLog('🧗 '+c.name+' climbs '+riseFt+' ft (extra movement'+(moverHasClimbSpeed(pc)?'':' · no climb speed, ×2')+')');
      }
      if(!fly && (meta.needsDrop || dropFt>=10)){
        if(opts.useRope){ qbLog('🪢 '+c.name+' rappels down '+(meta.maxDrop||dropFt)+' ft with rope — no fall damage'); }
        else if(hasFeatherFall(c)){ qbLog('🪶 '+c.name+' falls '+dropFt+' ft — Feather Fall, no damage'); }
        else if(dropFt>=10){ const fd=fallDamageTotal(dropFt); if(fd){ applyHp(c,-fd); qbLog('📉 '+c.name+' falls '+dropFt+' ft — '+fd+' bludgeoning'); } }
      }
      if(!fly){ qbCheckTerrainProne(s,c,x,y,true); checkTrapTrigger(s,c,x,y,true); }
      // Difficult terrain note on destination
      const tdef2=TERRAIN[ter], dd2=DECOR[decorAt(s,x,y)];
      if((tdef2&&tdef2.diff)||(dd2&&dd2.diff)) qbLog('🥾 Difficult terrain at destination');
      pc.hpCur=c.hp.cur;
      Events.emit({type:'move', id:'pc', by:c.name, to:{x,y}, fly, path});
      provokers.forEach(m=>qbMonsterOAonPc(m, pc));
      qbCheckEnd(); render(); }, pc);
  }

  // ── Jump: Acrobatics skill check ──
  if(!fly && meta.needsJump){
    const rise=meta.maxRise||5;
    const dc=jumpAcrobaticsDC(pc, rise);
    const bonus=skillBonus(c,'acrobatics','dex',true);
    $('#modalRoot').innerHTML=`<div class="modal" id="jumpModal"><div class="sheet"><div class="grip"></div>
      <h2>⬆ Jump required</h2>
      <p style="margin:0 0 10px;font-size:13px">This path needs a <b>high jump</b>${rise?` of about <b>${rise} ft</b>`:''}. Your running high jump is <b>${runningHighJumpFt(pc)} ft</b> (3 + STR mod).</p>
      <p class="muted" style="font-size:12px;margin:0 0 12px">Make an <b>Acrobatics</b> check (DEX ${sgn(mod(abil(c,'dex')))}${c.skillProf&&c.skillProf.acrobatics?' · prof':''}${c.skillExp&&c.skillExp.acrobatics?' · expertise':''} → ${sgn(bonus)}) vs <b>DC ${dc}</b>.</p>
      <button class="btn block" id="jumpRoll">🎲 Roll Acrobatics</button>
      <button class="btn ghost block" id="jumpCancel" style="margin-top:8px">Cancel move</button>
    </div></div>`;
    $('#jumpCancel').onclick=()=>{ $('#modalRoot').innerHTML=''; };
    $('#jumpModal').onclick=e=>{ if(e.target.id==='jumpModal') $('#modalRoot').innerHTML=''; };
    $('#jumpRoll').onclick=()=>{
      const r=rollSkillCheck(c,'acrobatics','dex');
      const ok=r.total>=dc;
      qbLog('🎲 Acrobatics '+r.total+' (d20 '+r.d20+sgn(r.bonus)+') vs DC '+dc+' — '+(ok?'success':'fail'));
      $('#modalRoot').innerHTML='';
      if(!ok){
        if(!c.conditions) c.conditions={}; c.conditions.Prone=true;
        flashBanner('Jump failed — you fall prone!');
        qbLog('💥 '+c.name+' misses the jump and falls prone');
        save(); render(); return;
      }
      // After jump, may still need rope for a drop on the same path
      if(meta.needsDrop && meta.maxDrop>=10) qbPromptRopeThenMove(meta, commitMove);
      else commitMove({});
    };
    return;
  }

  // ── Drop: rope from inventory ──
  if(!fly && meta.needsDrop && meta.maxDrop>=10){
    qbPromptRopeThenMove(meta, commitMove);
    return;
  }

  commitMove({});
}

function qbPromptRopeThenMove(meta, commitMove){
  const c=QB.players[0].c;
  const drop=meta.maxDrop||10;
  const rope=hasRope(c);
  $('#modalRoot').innerHTML=`<div class="modal" id="ropeModal"><div class="sheet"><div class="grip"></div>
    <h2>🪢 Cliff descent</h2>
    <p style="margin:0 0 10px;font-size:13px">This path drops about <b>${drop} ft</b>. Falling deals 1d6 bludgeoning per 10 ft.</p>
    ${rope
      ? `<p class="muted" style="font-size:12px;margin:0 0 12px">You have a <b>rope</b> in inventory. Rappelling avoids fall damage.</p>
         <button class="btn block" id="ropeUse">🪢 Use rope (safe)</button>
         <button class="btn ghost block" id="ropeJump" style="margin-top:8px">Jump down (risk fall damage)</button>`
      : `<p class="muted" style="font-size:12px;margin:0 0 12px">No rope in inventory. You’ll take fall damage if you go this way.</p>
         <button class="btn block" id="ropeJump">Jump / climb down anyway</button>`}
    <button class="btn ghost block" id="ropeCancel" style="margin-top:8px">Cancel move</button>
  </div></div>`;
  $('#ropeCancel').onclick=()=>{ $('#modalRoot').innerHTML=''; };
  $('#ropeModal').onclick=e=>{ if(e.target.id==='ropeModal') $('#modalRoot').innerHTML=''; };
  { const u=$('#ropeUse'); if(u) u.onclick=()=>{ $('#modalRoot').innerHTML=''; commitMove({useRope:true}); }; }
  { const j=$('#ropeJump'); if(j) j.onclick=()=>{ $('#modalRoot').innerHTML=''; commitMove({useRope:false}); }; }
}

function qbPcAttack(mo){ const s=QB, pc=s.players[0], c=pc.c, b=c.battle;
  if(isPartyAlly(mo)){ flashBanner('That’s your ally — pick a hostile target'); return; }
  const all=qbPcAttacks(c); const inrange=all.filter(a=>qbInRange(pc,mo,a));
  if(!inrange.length){ flashBanner('Out of range for your weapons — move closer'); return; }
  // gate on the action/attack budget (same rule as attackFlow)
  const full=extraAttacks(c)+1;
  if((b.attacksLeft||0)<=0){ if(!hasAction(c)){ flashBanner('No attacks or actions left — end your turn'); return; } }
  const go=(atk)=>{ if((b.attacksLeft||0)<=0){ if(!hasAction(c)){ flashBanner('No actions left'); return; } spendAction(c); b.attacksLeft=full; }
    else if((b.attacksLeft||0)>=full){ if(!hasAction(c)){ flashBanner('No actions left'); return; } spendAction(c); }
    b.attacksLeft=Math.max(0,(b.attacksLeft||0)-1); $('#modalRoot').innerHTML=''; qbResolveAttack(pc, mo, atk); };
  if(inrange.length===1){ go(inrange[0]); return; }
  $('#modalRoot').innerHTML=`<div class="modal" id="qbwModal"><div class="sheet"><div class="grip"></div><h2>⚔ Attack ${esc(mo.name)}</h2>
    ${inrange.map((a,i)=>`<button class="btn block" data-qbw="${i}" style="margin-bottom:8px">${esc(a.name)} — ${esc(a.dmg)} ${esc(a.dt||'')} ${sgn(a.toHit)}</button>`).join('')}
    <button class="btn ghost block" id="qbwCancel">Cancel</button></div></div>`;
  $('#qbwCancel').onclick=()=>{ $('#modalRoot').innerHTML=''; };
  $('#qbwModal').onclick=e=>{ if(e.target.id==='qbwModal') $('#modalRoot').innerHTML=''; };
  document.querySelectorAll('[data-qbw]').forEach(btn=>btn.onclick=()=>go(inrange[Number(btn.dataset.qbw)]));
}

function qbStrikeObject(pc, objEntry, atk){
  const s=QB, c=pc.c;
  const dtype=atk.dtype||atk.dt||'bludgeoning';
  const res=damageInteractObject(s, objEntry.key, dtype, atk.name||'Strike', {anyHit:true});
  if(!res||!res.ok){ flashBanner((res&&res.msg)||'No effect'); return; }
  logChange(c, '⚔ '+res.msg);
  qbLog('⚔ '+c.name+' strikes '+(objEntry.def.name||'object')+' — '+res.msg);
  flashBanner(res.msg);
  sfx('hit');
  if(iso3dView&&window.__iso3dHost) try{ window.__iso3dHost.impact(objEntry.x, objEntry.y, 'hit'); }catch(e){}
  save(); render(); qbCheckEnd();
}

function qbOpenAttack(c){ const s=QB, pc=s.players[0]; const foes=s.monsters.filter(isHostile);
  const atks=qbPcAttacks(c); if(!atks.length){ flashBanner('No weapons'); return; }
  // Max weapon reach for object listing
  const maxTiles=Math.max(1,...atks.map(a=>a.tiles||1));
  const hazards=listHazardObjectsInRange(s, pc, maxTiles, false);
  if(!foes.length&&!hazards.length){ flashBanner('No enemies or breakable objects in reach'); return; }
  let pick=null;
  window.__iso3dForceFrame=true;
  function draw(){
    let body='<h2>Attack</h2>';
    if(!pick){
      body+='<p class="muted" style="font-size:12px;margin:0 0 8px">Choose a weapon. Strike foes — or smash oil/acid barrels (kinetic spills; fire weapons explode oil).</p>';
      body+=atks.map((a,i)=>{ const n=foes.filter(mo=>qbInRange(pc,mo,a)).length;
        const hN=listHazardObjectsInRange(s,pc,a.tiles||1,(a.tiles||1)>1).length;
        return '<div class="spell"><div class="nm"><b>'+esc(a.name)+'</b><small>'+(a.melee?'melee':'ranged')+' · '+(a.tiles||1)*5+' ft · '+esc(a.dmg||'')+' '+(esc(a.dt||a.dtype||''))+'</small></div><button class="btn sm" data-qwp="'+i+'">'+n+' foe'+(n===1?'':'s')+(hN?' · '+hN+' object'+(hN===1?'':'s'):'')+'</button></div>'; }).join('');
      if(hazards.length){
        body+='<p class="muted" style="font-size:11.5px;margin:10px 0 6px">🛢️ Breakable nearby (any weapon in range):</p>';
        body+=hazards.map((h,i)=>{
          return '<div class="spell"><div class="nm"><b>'+esc(h.def.name)+'</b><small>('+h.x+','+h.y+') · kinetic spill / fire boom</small></div><button class="btn sm ghost" data-qwh="'+i+'">Strike…</button></div>';
        }).join('');
      }
      body+='<button class="btn ghost block" id="qaClose" style="margin-top:10px">Cancel</button>';
      $('#modalRoot').innerHTML='<div class="modal" id="qaModal"><div class="sheet"><div class="grip"></div>'+body+'</div></div>';
      $('#qaClose').onclick=()=>{ $('#modalRoot').innerHTML=''; };
      $('#qaModal').onclick=e=>{ if(e.target.id==='qaModal') $('#modalRoot').innerHTML=''; };
      document.querySelectorAll('[data-qwp]').forEach(b=>b.onclick=()=>{ pick=atks[Number(b.dataset.qwp)]; window.__iso3dForceFrame=true; draw(); });
      document.querySelectorAll('[data-qwh]').forEach(b=>b.onclick=()=>{
        const h=hazards[Number(b.dataset.qwh)];
        // Pick best weapon that can reach this object
        const reach=atks.filter(a=>{
          const tiles=a.tiles||1;
          if(gridDist(pc.x,pc.y,h.x,h.y)>tiles) return false;
          if(tiles>1&&!losClear(s,pc.x,pc.y,h.x,h.y,{ignoreCreatures:true})) return false;
          return true;
        });
        if(!reach.length){ flashBanner('No weapon reaches that object'); return; }
        const go=(atk)=>{ if(!qbSpendAttackBudget(c)) return; $('#modalRoot').innerHTML=''; qbStrikeObject(pc, h, atk); };
        if(reach.length===1){ go(reach[0]); return; }
        $('#modalRoot').innerHTML=`<div class="modal" id="qaoModal"><div class="sheet"><div class="grip"></div>
          <h2>⚔ Strike ${esc(h.def.name)}</h2>
          ${reach.map((a,i)=>`<button class="btn block" data-qao="${i}" style="margin-bottom:8px">${esc(a.name)} — ${esc(a.dt||a.dtype||'')}</button>`).join('')}
          <button class="btn ghost block" id="qaoCancel">Cancel</button></div></div>`;
        $('#qaoCancel').onclick=()=>{ $('#modalRoot').innerHTML=''; };
        document.querySelectorAll('[data-qao]').forEach(btn=>btn.onclick=()=>go(reach[Number(btn.dataset.qao)]));
      });
      return;
    }
    const tiles=pick.tiles||1, needLos=tiles>1;
    const rangeTiles=buildRangeTileSet(s, pc.x, pc.y, tiles, needLos, false);
    const tIds=foes.filter(mo=>rangeTiles.has(mo.x+','+mo.y)).map(mo=>mo.id);
    const objHere=listHazardObjectsInRange(s, pc, tiles, needLos).filter(h=>rangeTiles.has(h.x+','+h.y));
    const opts=buildTargetingOpts(s, pc, tiles, { needLos, targets:tIds });
    body+='<p class="muted" style="font-size:12px;margin:0 0 8px"><b>'+esc(pick.name)+'</b> — range '+(tiles*5)+' ft'+(needLos?' · line of sight':' · adjacent')+'. Tap a gold enemy'+(objHere.length?' or a listed barrel':'')+'. Drag to pan.</p>';
    if(objHere.length){
      body+=objHere.map((h,i)=>`<div class="spell"><div class="nm"><b>🛢️ ${esc(h.def.name)}</b><small>(${h.x},${h.y})</small></div><button class="btn sm" data-qao2="${i}">Smash</button></div>`).join('');
    }
    body+=mapGridHTML(s,false,opts);
    body+='<p class="muted" style="font-size:11.5px;margin:8px 0 0">Gold = clear light-line. Kinetic damage spills oil/acid; fire damage detonates oil & powder kegs.</p>';
    body+='<button class="btn ghost block" id="qaBack" style="margin-top:8px">Back</button><button class="btn ghost block" id="qaClose" style="margin-top:6px">Cancel</button>';
    $('#modalRoot').innerHTML='<div class="modal" id="qaModal"><div class="sheet"><div class="grip"></div>'+body+'</div></div>';
    if(isoView&&iso3dView) try{ syncIso3DHost(s, opts); }catch(e){}
    const reattach3d=()=>{ if(isoView&&iso3dView&&QB) try{ syncIso3DHost(QB); }catch(e){} };
    $('#qaClose').onclick=()=>{ $('#modalRoot').innerHTML=''; reattach3d(); };
    document.querySelectorAll('[data-qao2]').forEach(b=>b.onclick=()=>{
      const h=objHere[Number(b.dataset.qao2)];
      if(!qbSpendAttackBudget(c)) return;
      $('#modalRoot').innerHTML=''; reattach3d();
      qbStrikeObject(pc, h, pick);
    });
    $('#qaBack').onclick=()=>{ pick=null; draw(); };
    $('#qaModal').onclick=e=>{ if(e.target.id==='qaModal'){ $('#modalRoot').innerHTML=''; reattach3d(); } };
    document.querySelectorAll('#qaModal [data-cell]').forEach(el=>el.onclick=()=>{
      const [x,y]=el.dataset.cell.split(',').map(Number);
      const mo=s.monsters.find(m=>m.hp>0&&m.x===x&&m.y===y);
      // Prefer monster; else hazard object on that tile
      if(!mo){
        const h=objHere.find(o=>o.x===x&&o.y===y)||listHazardObjectsInRange(s,pc,tiles,needLos).find(o=>o.x===x&&o.y===y);
        if(h){
          if(!qbSpendAttackBudget(c)) return;
          $('#modalRoot').innerHTML=''; reattach3d();
          qbStrikeObject(pc, h, pick);
          return;
        }
        flashBanner('Tap an enemy or breakable object in range'); return;
      }
      if(!qbInRange(pc,mo,pick)){ flashBanner(needLos?'Out of range or no line of sight':'Out of melee reach'); return; }
      $('#modalRoot').innerHTML='';
      // Force this weapon for the attack
      const all=qbPcAttacks(c); const match=all.find(a=>a.name===pick.name)||pick;
      const go=(atk)=>{ if(!qbSpendAttackBudget(c)) return; qbResolveAttack(pc, mo, atk); };
      go(match);
    });
  }
  draw();
}

function qbOpenSpells(c){ if(isRaging(c)){ flashBanner('Can’t cast while raging'); return; }
  const list=castableSpells(c).sort((a,b)=>((a.level||0)-(b.level||0))||a.name.localeCompare(b.name));
  const unprepped=isPrepCaster(c)?(c.spells||[]).filter(s=>(s.level||0)>0 && !s.prepared).length:0;
  $('#modalRoot').innerHTML=`<div class="modal" id="qsModal"><div class="sheet"><div class="grip"></div>
    <h2>✨ Cast a spell</h2><input id="qsSearch" placeholder="Filter your spells…" autocomplete="off">
    ${unprepped?`<p class="muted" style="font-size:12px;margin:8px 0 0">⚠ ${unprepped} known spell${unprepped>1?'s':''} hidden — not prepared. 📋 Prepare on the Spells tab (${preparedCount(c)}/${preparedMax(c)} prepared).</p>`:''}
    <div id="qsList" style="margin-top:10px;max-height:56vh;overflow:auto"></div>
    <button class="btn ghost block" id="qsClose" style="margin-top:10px">Close</button></div></div>`;
  const draw=()=>{ const q=($('#qsSearch').value||'').toLowerCase(); const f=list.filter(s=>s.name.toLowerCase().includes(q));
    $('#qsList').innerHTML=f.length?f.map(s=>`<div class="spell"><span style="flex:none">${spellIcon(s.name)}</span><div class="nm"><b>${esc(s.name)}</b><small>${lvlLabel(s.level||0)}${spellCastTime(s.name)==='bonus'?' · bonus':''}${isConcentration(s.name)?' · 🧠':''}</small></div><button class="btn sm" data-qsc="${esc(s.name)}|${s.level||0}">Cast</button></div>`).join(''):'<div class="empty">'+(isPrepCaster(c)?'No castable spells — 📋 Prepare some on the Spells tab.':'No spells. Add them on the Spells tab.')+'</div>';
    $('#qsList').querySelectorAll('[data-qsc]').forEach(b=>b.onclick=()=>{ const a=b.dataset.qsc.split('|'); const name=a[0], lvl=Number(a[1]); const mc=parseSpellMechanics(name);
      if(name==='Mage Hand'){ // cast then open 30-ft interact picker
        if(!castSpell(c,name,lvl)) return;
        $('#modalRoot').innerHTML='';
        qbLog('✋ '+c.name+' casts Mage Hand');
        setTimeout(()=>openMageHandUI(c,QB,QB.players[0]),60);
      }
      else if(name==='Light'){ $('#modalRoot').innerHTML=''; openLightTarget(c,lvl); }
      else if(SPELL_HANDLERS[name]&&SPELL_HANDLERS[name].kind==='summon'){
        $('#modalRoot').innerHTML='';
        openSummonSpellUI(c, name, lvl);
      }
      else if(SPELL_TELEPORT[name]){ if(!canCast(c,name,lvl)) return; const pc=QB.players[0];   // teleport → pick a destination, token actually moves
        openTeleportTarget(c,name,lvl,QB,pc,(x,y)=>{ pc.x=x; pc.y=y;
          const td=TERRAIN[terrainAt(QB,x,y)];
          if(td&&td.dmg&&!isFlying(c)){ const d=(rollNotation(td.dmg)||{total:0}).total; applyHp(c,-d); pc.hpCur=c.hp.cur; qbLog((td.e||'🔥')+' '+td.name+' — '+d+' damage'); }
          qbLog('✨ '+c.name+' teleports ('+name+')'); qbCheckEnd(); }); }
      else if(spellNeedsBattleTarget(name,mc)) qbSpellTarget(c,name,lvl);
      else castModal(c,name,lvl); }); };
  $('#qsSearch').addEventListener('input',draw); $('#qsClose').onclick=()=>{ $('#modalRoot').innerHTML=''; };
  $('#qsModal').onclick=e=>{ if(e.target.id==='qsModal') $('#modalRoot').innerHTML=''; }; draw();
}

function qbSpellTarget(c,name,level){ level=Number(level)||0; const s=QB, me=s.players[0];
  if(!canCast(c,name,level)) return;   // pre-check; castSpell re-checks + spends on confirm
  const mc=scaleCantrip(c,name,parseSpellMechanics(name)), tilesR=spellRangeTiles(name), seek=spellSeeks(name), aoeR=SPELL_AOE[name]||0;
  let center=null;   // AoE aim tile
  let picked=null;   // single-target monster (Fire Bolt etc.) — aim then Cast
  let pickedObj=null; // hazard object (barrel) for single-target spells
  window.__iso3dForceFrame=true; // snap camera to caster when targeting opens
  const reach=seek?reachableCells(s,me.x,me.y,tilesR*5):null;
  // Live opts so click validation matches gold (valid LoS) overlay exactly
  let liveOpts=null;
  const inRange=(x,y)=>{
    if(liveOpts&&liveOpts.rangeTiles) return liveOpts.rangeTiles.has(x+','+y);
    // Light-style LoS in every direction (walls/trees/elevation/creatures block)
    return seek?reach[x+','+y]!=null:(inBlast(me.x,me.y,x,y,tilesR) && losClear(s,me.x,me.y,x,y));
  };
  const spellAtk=profBonus(c)+mod(abil(c,c.spellAbility));
  const dc0=8+profBonus(c)+mod(abil(c,c.spellAbility));
  const blastTargets=ctr=>s.monsters.filter(mo=>mo.hp>0 && inBlast(ctr.x,ctr.y,mo.x,mo.y,aoeR));
  function finish(){ qbCheckEnd(); save(); render(); }
  const sp=dmgTotal=>({name, dc:dc0, save:mc.save, dmgTotal, dtype:mc.dtype, cond:spellCondOf(name)});
  const logEv=(mo,ev)=>{ if(ev.save) qbLog('🛡️ '+mo.name+' '+String(ev.save).toUpperCase()+' save '+ev.saveRoll+' vs DC '+ev.dc+' — '+(ev.saved?'success':'fail'));
    if(mc.dmg){ const tag=ev.mult===0?' — immune!':ev.mult===0.5?' (resisted)':ev.mult===2?' (vulnerable!)':''; qbLog(name+' hits '+mo.name+' for '+ev.dmg+(ev.saved?' (saved — half)':'')+tag); }
    else qbLog(name+' on '+mo.name+(ev.saved?' — it saves, no effect':'')); };
  function resolveObject(obj){
    $('#modalRoot').innerHTML='';
    if(!castSpell(c,name,level,{x:obj.x,y:obj.y})) return;
    const dtype=mc.dtype||'';
    if(isoView&&iso3dView&&QB) try{ syncIso3DHost(QB); }catch(e){}
    playCombatShotFx({x:me.x,y:me.y},{x:obj.x,y:obj.y},{kind:'spell',dtype:dtype,hit:true,tiles:tilesR},()=>{
      const res=damageInteractObject(s, obj.key, dtype, name, {anyHit:true});
      if(res&&res.ok){ qbLog('✨ '+name+' hits '+(obj.def.name||'object')+' — '+res.msg); flashBanner(res.msg); }
      else { qbLog(name+' hits '+(obj.def.name||'object')+' — no special reaction'); flashBanner((res&&res.msg)||'No special effect'); }
      finish();
    });
  }
  function resolveSingle(mo){ $('#modalRoot').innerHTML=''; if(!castSpell(c,name,level,{x:mo.x,y:mo.y})) return;
    if(POWER_WORD_HP[name]!=null){ const ev=Engine.castApply(qbAdapter,'pc',mo.id,{name,powerWord:name});
      qbLog(ev.noEffect?name+' has no effect — '+mo.name+' has more than '+ev.threshold+' HP':ev.killed?'💀 '+name+' — '+mo.name+' ('+ev.curHp+'/'+ev.threshold+' HP) drops dead instantly':'😵 '+name+' — '+mo.name+' ('+ev.curHp+'/'+ev.threshold+' HP) is stunned');
      qbCheckEnd(); finish(); return; }
    if(name==='Eyebite'){ openEyebiteChoice(qbAdapter,'pc',mo, dc0, msg=>{ qbLog(msg); qbCheckEnd(); finish(); }); return; }
    if(name==='Detect Thoughts'){ castDetectThoughts(c, mo, qbLog); qbCheckEnd(); finish(); return; }
    if(name==='Telekinesis'){
      const saved=telekinesisSavedKnown(c, mo);
      Engine.castApply(qbAdapter,'pc',mo.id,{name,savedKnown:saved,cond:{c:'Restrained',rounds:10},dmgTotal:0});
      qbLog(saved ? mo.name+' resists Telekinesis' : mo.name+' is Restrained by Telekinesis');
      flashBanner(saved ? mo.name+' resists Telekinesis' : mo.name+' is Restrained by Telekinesis');
      qbCheckEnd(); finish(); return;
    }
    if(name==='Dispel Magic'||name==='Counterspell'){
      const n=dispelMonsterConds(mo);
      const msg=n ? (name+' strips '+n+' condition'+(n>1?'s':'')+' from '+mo.name) : (name+' — '+mo.name+' has nothing to dispel');
      qbLog('✨ '+msg); flashBanner(msg);
      qbCheckEnd(); finish(); return;
    }
    if(mc.attack){ qbResolveAttack(me, mo, {name, toHit:spellAtk, dmg:mc.dmg||'0', tiles:tilesR, dtype:mc.dtype, spell:true}, (ev)=>{ if(ev&&ev.hit) qbApplyCond(mo,name); finish(); }); }
    else {
      // Save/utility: roll damage if any, then bolt FX, then apply
      const runApply=(dmgTotal)=>{
        if(isoView&&iso3dView&&QB) try{ syncIso3DHost(QB); }catch(e){}
        playCombatShotFx({x:me.x,y:me.y},{x:mo.x,y:mo.y},{kind:'spell',dtype:mc.dtype||'',hit:true,tiles:tilesR},()=>{
          const ev=Engine.castApply(qbAdapter, 'pc', mo.id, sp(dmgTotal||0));
          logEv(mo,ev); finish();
        });
      };
      if(mc.dmg){
        openBlastDamageModal({
          title:name, attacker:c.name, dmg:mc.dmg, dtype:mc.dtype||'',
          save:mc.save, dc:dc0, targets:1,
          flavor:combatFlavor('ready_spell',{attacker:c.name, weapon:name, target:mo.name}),
          onDone:runApply
        });
      } else runApply(0);
    } }
  function resolveBlast(ctr){
    if(!ctr){ flashBanner('Pick a center first'); return; }
    // Gust of Wind: line from caster through aim — snuff unprotected torches (PHB)
    if(name==='Gust of Wind'){
      if(!castSpell(c,name,level,{x:ctr.x,y:ctr.y})) return;
      $('#modalRoot').innerHTML='';
      if(isoView&&iso3dView&&QB) try{ syncIso3DHost(QB); }catch(e){}
      { const gw=applyGustOfWind(s, {x:me.x,y:me.y}, {x:ctr.x,y:ctr.y}, c.name, dc0);
        flashBanner('💨 Gust of Wind!'+(gw.pushed?' Pushed '+gw.pushed+' back.':'')+(gw.resisted?' '+gw.resisted+' resisted.':'')); }
      sfx('cast');
      finish();
      return;
    }
    // Walls: no damage/save roll to interrupt with — paint the zone and be done (see
    // WALL_SPELLS/paintHazardTerrain; bypasses the damage-blast modal entirely, same as
    // Gust of Wind above).
    if(WALL_SPELLS.has(name)){
      if(!castSpell(c,name,level,{x:ctr.x,y:ctr.y})) return;
      $('#modalRoot').innerHTML='';
      paintHazardTerrain(s, ctr, aoeR, name, dc0);
      qbLog('🧱 '+c.name+' conjures '+name);
      flashBanner(name+' conjured!'); sfx('cast');
      if(isoView&&iso3dView&&QB) try{ syncIso3DHost(QB); }catch(e){}
      finish();
      return;
    }
    if(SPELL_NOCAST_ZONE[name]){
      if(!castSpell(c,name,level,{x:ctr.x,y:ctr.y})) return;
      $('#modalRoot').innerHTML='';
      paintNoCastZone(s, ctr, aoeR, name);
      qbLog('🔇 '+c.name+' casts '+name+' — no spellcasting inside');
      flashBanner(name+' — magic suppressed in the area'); sfx('cast');
      if(isoView&&iso3dView&&QB) try{ syncIso3DHost(QB); }catch(e){}
      finish();
      return;
    }
    // Spend slot/action first — if this fails, keep the modal open
    if(!castSpell(c,name,level,{x:ctr.x,y:ctr.y})) return;
    const aff=blastTargets(ctr);
    $('#modalRoot').innerHTML='';
    // Roll damage first (modal), then fire the full VFX, then apply damage
    openBlastDamageModal({
      title:name, attacker:c.name, dmg:mc.dmg||'8d6', dtype:mc.dtype||'fire',
      save:mc.save, dc:dc0, targets:aff.length,
      flavor:combatFlavor('blast',{attacker:c.name, weapon:name, target:aff.length+' foes'}),
      onDone:(dmgTotal)=>{
        if(isoView&&iso3dView&&QB) try{ syncIso3DHost(QB); }catch(e){}
        playBlastFx({x:me.x,y:me.y}, {x:ctr.x,y:ctr.y}, aoeR, mc.dtype||'fire', ()=>{
          aff.forEach(mo=>{ logEv(mo, Engine.castApply(qbAdapter, 'pc', mo.id, sp(dmgTotal))); if(iso3dView&&window.__iso3dHost) try{ window.__iso3dHost.impact(mo.x,mo.y,'hit'); }catch(e){} });
          if(dmgTotal && inBlast(ctr.x,ctr.y,me.x,me.y,aoeR)){
            const ev=Engine.castApply(qbAdapter, 'pc', 'pc', Object.assign(sp(dmgTotal), {save:mc.save||'dex', cond:null}));
            if(ev.dmg>0) qbLog('💥 '+c.name+' is caught in the blast — '+ev.dmg+' damage'+(ev.saved?' (saved — half)':'')); }
          paintHazardTerrain(s,ctr,aoeR,name,dc0);
          applyFireBlastHazards(s, ctr, aoeR, name, mc.dtype);
          if(SPELL_TERRAIN[name]) qbLog('🛢️ '+name+' coats the ground — difficult terrain, Dex save or prone');
          else if(SPELL_GAS[name]) qbLog('🌫️ '+name+' lingers — anyone in it takes it again each round until it clears');
          else qbLog(name+' blasts '+aff.length+' enemies'+(dmgTotal?' (rolled '+dmgTotal+(mc.save?'; saves halve':'')+')':''));
          pushRoll({label:name+' (blast)', total:dmgTotal, detail:mc.dmg||'', kind:'dmg'});
          finish();
        });
      }
    });
  }
  function draw(){ let body=`<h2>✨ ${esc(name)}</h2><p class="muted" style="font-size:12px;margin:0 0 8px">Range ${tilesR*5} ft${seek?' · 🧲 seeks':aoeR?' · 💥 '+(aoeR*5)+' ft blast · line of sight':' · line of sight'}${mc.dmg?' · '+esc(mc.dmg)+' '+esc(mc.dtype||''):''}</p>`;
    // Cast control ABOVE the map so it's never buried under a tall Iso3D sheet
    if(aoeR&&center){
      body+=`<button class="btn block" id="qstCast" style="margin:0 0 10px;background:linear-gradient(180deg,#c44,#922);border-color:#a33;font-size:16px;padding:12px">Cast ${esc(name)} at (${center.x},${center.y}) — ${blastTargets(center).length} in blast</button>`;
      body+=`<p class="muted" style="font-size:11.5px;margin:0 0 8px">Or re-tap that tile to fire. Different gold tile re-aims. Drag map to pan (does not cast).</p>`;
    } else if(!aoeR&&pickedObj){
      body+=`<button class="btn block" id="qstCast" style="margin:0 0 10px;background:linear-gradient(180deg,#c44,#922);border-color:#a33;font-size:16px;padding:12px">Cast ${esc(name)} on ${esc(pickedObj.def.name)}</button>`;
      body+=`<p class="muted" style="font-size:11.5px;margin:0 0 8px">Object locked — fire detonates oil/powder; force/bludgeoning spills. Re-tap or Cast.</p>`;
    } else if(!aoeR&&picked){
      body+=`<button class="btn block" id="qstCast" style="margin:0 0 10px;background:linear-gradient(180deg,#c44,#922);border-color:#a33;font-size:16px;padding:12px">Cast ${esc(name)} on ${esc(picked.name)}</button>`;
      body+=`<p class="muted" style="font-size:11.5px;margin:0 0 8px">Target locked on ${esc(picked.name)}. Re-tap them or press Cast to fire. Drag map to pan.</p>`;
    } else {
      body+=`<p class="muted" style="font-size:11.5px;margin:0 0 8px">${aoeR?'Gold = light-line clear · slate = shadowed. Walls/trees/ridges/bodies block all directions. Tap gold to aim, Cast to fire. Drag to pan.':'Gold = clear shot. Tap enemy or hazard barrel → Cast. Fireball on oil barrels = boom; maul/force = oil spill.'}</p>`;
    }
    // List hazard objects in range for single-target damage spells
    const hazIn=!aoeR?listHazardObjectsInRange(s, me, tilesR, !seek&&tilesR>1):[];
    if(!aoeR&&hazIn.length){
      body+=`<p class="muted" style="font-size:11.5px;margin:0 0 6px">🛢️ Objects in range:</p>`;
      body+=hazIn.map((h,i)=>`<div class="spell"><div class="nm"><b>${esc(h.def.name)}</b><small>(${h.x},${h.y})</small></div><button class="btn sm" data-qstobj="${i}">Aim</button></div>`).join('');
    }
    liveOpts=buildTargetingOpts(s, me, tilesR, { needLos:!seek&&tilesR>1, seek:!!seek, reach:reach, center:center, aoeR:aoeR, targets:picked?[picked.id]:null });
    const opts=liveOpts;
    body+=mapGridHTML(s,false,opts);
    body+=`<button class="btn ghost block" id="qstClose" style="margin-top:10px">Cancel</button>`;
    $('#modalRoot').innerHTML=`<div class="modal" id="qstModal"><div class="sheet"><div class="grip"></div>${body}</div></div>`;
    // Mount Iso3D *after* modal HTML exists (must use modal #iso3dMount, not the map under it)
    if(isoView&&iso3dView) try{ syncIso3DHost(s, opts); }catch(e){}
    const reattach3d=()=>{ if(isoView&&iso3dView&&QB) try{ syncIso3DHost(QB); }catch(e){} };
    $('#qstClose').onclick=()=>{ $('#modalRoot').innerHTML=''; reattach3d(); };
    $('#qstModal').onclick=e=>{ if(e.target.id==='qstModal'){ $('#modalRoot').innerHTML=''; reattach3d(); } };
    document.querySelectorAll('[data-qstobj]').forEach(b=>b.onclick=()=>{
      const h=hazIn[Number(b.dataset.qstobj)];
      if(pickedObj&&pickedObj.key===h.key){ resolveObject(h); return; }
      pickedObj=h; picked=null; draw();
    });
    document.querySelectorAll('#qstModal [data-cell]').forEach(el=>el.onclick=()=>{ const [x,y]=el.dataset.cell.split(',').map(Number);
      if(aoeR){
        const resolved=resolveCastCenter(s, x, y, opts.rangeTiles, me);
        if(!resolved){ flashBanner('Need a gold tile (clear line of effect)'); return; }
        // Place → confirm: first tap aims (safe while panning the camera);
        // second tap on same center or red Cast button fires.
        if(center && center.x===resolved.x && center.y===resolved.y){ resolveBlast(center); return; }
        center=resolved; draw(); return;
      }
      // Fire Bolt etc.: aim first, Cast / re-tap to fire (same as Fireball — pan-safe)
      if(!inRange(x,y)){ flashBanner(seek?'No path within range':'Out of range / no line of sight'); return; }
      const mo=s.monsters.find(m=>m.hp>0&&m.x===x&&m.y===y);
      if(mo){
        if(picked && picked.id===mo.id){ resolveSingle(mo); return; }
        picked=mo; pickedObj=null; draw(); return;
      }
      // Hazard barrel on this tile
      const h=listHazardObjectsInRange(s,me,tilesR,!seek&&tilesR>1).find(o=>o.x===x&&o.y===y);
      if(h){
        if(pickedObj&&pickedObj.key===h.key){ resolveObject(h); return; }
        pickedObj=h; picked=null; draw(); return;
      }
      flashBanner('Tap a gold enemy or hazard barrel to aim'); });
    { const sc=$('#qstCast'); if(sc) sc.onclick=(e)=>{ e.stopPropagation();
      if(aoeR) resolveBlast(center);
      else if(pickedObj) resolveObject(pickedObj);
      else if(picked) resolveSingle(picked);
      else flashBanner(aoeR?'Pick a gold center first':'Pick a target first');
    }; }
  }
  draw();
}

function qbExit(){
  QB=null;
  // Apply deferred service-worker reload after the fight so mid-battle updates
  // don't wipe QB (see controllerchange handler).
  if(window.__swReloadPending){
    window.__swReloadPending=false;
    location.reload();
    return;
  }
  render();
}

