// Build stamp (v120.259). index.html compares every module's stamp against APP_VERSION and
// flags the version badge if any disagree. v120.256 only stamped ui.js and rules.js, so a
// stale data.js/net.js/iso-renderer.js would have passed the check silently -- a detector
// with holes in it is worse than none, because it reads as an all-clear.
const NET_BUILD='v120.264';
// Grimoire — extracted multiplayer/networking functions (Stage 2 of index.html modularization).
// DM-hosted session handling, player-net messaging, campaign persistence. See AUDIT.md.
// Loaded via <script src> after data.js/rules.js, before ui.js/the main script.

function applyManeuverCond(targetMo, cond, rounds){
  if(!targetMo || targetMo.hp==null) return;
  targetMo.conds=targetMo.conds||[];
  if(!targetMo.conds.some(x=>x.name===cond)) targetMo.conds.push({name:cond, rounds:rounds||10});
  if(net && net.role==='player' && net.conn){ try{ net.conn.send({t:'moncond', mon:targetMo.id, cond, rounds:rounds||10}); }catch(e){} }
}

function canCast(c, name, level, opts){
  if(typeof level==='undefined'){ level=name; name=''; }   // back-compat: canCast(c, level)
  level=Number(level)||0;
  opts=opts||{};
  const ritual = !!(opts.ritual && canRitualCast(c,name));
  if(name && wishFreeName===name) return true;   // Wish-duplicated spell: no slot, no prep, no action cost
  // "No slot needed" cases (Thousand Forms, feat-granted once/day spells, ritual casting) still
  // need prep/action — checked below, not an early bypass like Wish's fully-free `free` above.
  // Ritual casting takes 10 minutes instead of the normal action, so it skips the action-economy
  // block entirely below, not just the slot check.
  const noSlotNeeded = ritual || (name==='Alter Self' && isMoonDruid(c,14))
    || (featFreeCastSpell(c,name) && !(c.featFreeCastUsed&&c.featFreeCastUsed[name]));
  if(isRaging(c)){ flashBanner('Can’t cast spells while raging'); return false; }
  if(c.armor && c.armor!=='none' && !armorProficient(c,c.armor)){ flashBanner('Can’t cast spells — not proficient with worn armor'); return false; }
  // Silence/Antimagic Field: can't cast while standing in an active no-cast zone.
  { const s=battleSession();
    if(s && s.hazards && s.hazards.length){
      const me=(typeof QB!=='undefined'&&QB&&QB.active) ? (QB.players&&QB.players[0])
        : (net&&net.role==='player'&&net.peer ? (s.players||[]).find(p=>p.id===net.peer.id) : null);
      if(me && me.x!=null && inNoCastZone(s, me.x, me.y)){ flashBanner('Magic is suppressed here — can\'t cast'); return false; }
    }
  }
  // Ritual casting: Wizard/Artificer don't need the spell prepared (RAW — spellbook-known is
  // enough); Cleric/Druid still do, already enforced by canRitualCast requiring known.prepared.
  if(level>0 && name && isPrepCaster(c) && !spellPrepared(c,name) && !(ritual && (c.cls==='Wizard'||c.cls==='Artificer'))){ flashBanner(name+' isn’t prepared today — 📋 Prepare it first'); return false; }
  const ct=spellCastTime(name);
  if(!ritual && c.battle){
    const b=c.battle;
    if(ct==='reaction'){
      if(b.reaction){ flashBanner('Reaction already used this round'); return false; }
    } else if(ct==='bonus'){
      if(b.bonus){ flashBanner('Bonus action already used this turn'); return false; }
      if(b.castBonusSpell){ flashBanner('You already cast a bonus-action spell this turn'); return false; }
      if(b.castLeveledSpell){ flashBanner('Can’t cast a bonus-action spell after another spell this turn'); return false; }
    } else {
      if(!hasAction(c)){ flashBanner('You’ve already used your action this turn'); return false; }
      // After a bonus-action spell, the only other spell allowed is a cantrip cast as an action.
      if(b.castBonusSpell && level>0){ flashBanner('After a bonus-action spell you can only cast a cantrip'); return false; }
    }
  }
  if(level>0 && !noSlotNeeded){ const tot=spellSlots(c)[level]||0, used=Math.min(tot,(c.slots[level]&&c.slots[level].used)||0); if(tot-used<=0){ flashBanner('No level '+level+' spell slots left'); return false; } }
  return true;
}

function routeCast(c,name,lvl){
  // Mage Hand: cast then open interact picker (30 ft / 6 tiles)
  if(name==='Mage Hand'){
    const s=battleSession();
    const me=s&&((s.players||[]).find(p=>p.c===c||p.cid===c.id)||s.players&&s.players[0]);
    if(s&&me&&(QB&&!QB.over||(net&&net.session&&net.session.battle&&net.session.battle.active))){
      if(!castSpell(c,name,lvl||0)) return;
      if(QB&&QB.active) qbLog('✋ '+c.name+' casts Mage Hand');
      setTimeout(()=>openMageHandUI(c,s,me),60);
      return;
    }
  }
  // Summons (Conjure Elemental, …) — pick type + place on map
  if(typeof SPELL_HANDLERS!=='undefined'&&SPELL_HANDLERS[name]&&SPELL_HANDLERS[name].kind==='summon'){
    openSummonSpellUI(c, name, lvl||0);
    return;
  }
  // Find Steed / Find Greater Steed — pick a steed, mount it immediately (no placement step).
  if(typeof SPELL_HANDLERS!=='undefined'&&SPELL_HANDLERS[name]&&SPELL_HANDLERS[name].kind==='findsteed'){
    openFindSteedUI(c, name, lvl||0);
    return;
  }
  if(QB && !QB.over){ if(spellNeedsBattleTarget(name)) qbSpellTarget(c,name,lvl); else castModal(c,name,lvl); }
  else if(net && net.role==='player' && net.session && net.session.battle && net.session.battle.active) openSpellTarget(c,name,lvl);
  else castModal(c,name,lvl);
}

function checkMountDeaths(s, log){
  if(!s||!s.monsters) return;
  s.monsters.filter(m=>m.mount && m.hp<=0).forEach(m=>{
    if(s===QB){ const c=(s.players[0]&&s.players[0].c); if(c&&c.mountedOn&&c.mountedOn.id===m.id) dismountRider(c, log, {forced:true}, s); }
    else { dmSend(m.riderId, {t:'mountDied', name:m.name}); }
    if(m.findSteed) s.monsters=s.monsters.filter(x=>x!==m);
  });
}

function frameBattleCameraOnPlayer(session, zoom){
  session=session||QB||(net&&net.session);
  if(!session) return;
  const p=(session.players||[]).find(u=>u&&(u.id==='pc'||u.side==='pc'||u.id==='me'))
    ||(session.players&&session.players[0]);
  if(!p||p.x==null||p.y==null) return;
  frameCameraOnCell(session, p.x, p.y, zoom);
}

function frameCameraOnMapCenter(session, zoom){
  session=session||(net&&net.session);
  if(!session||!session.map) return;
  const cx=Math.floor(((session.map.cols|0)-1)/2), cy=Math.floor(((session.map.rows|0)-1)/2);
  frameCameraOnCell(session, cx, cy, zoom!=null?zoom:1.1);
}

function frameCameraOnActiveUnit(session, zoom){
  session=session||QB||(net&&net.session);
  if(!session||!session.order||!session.order.length) return;
  const entry=session.order[session.turn|0];
  const u=entry&&sessionUnitById(session, entry.id);
  if(!u||u.x==null||u.y==null) return;
  frameCameraOnCell(session, u.x, u.y, zoom);
}

function dmBroadcast(){ if(!net||net.role!=='dm') return;
  const sessionOut = (net.session.traps&&net.session.traps.length) ? Object.assign({},net.session,{traps:net.session.traps.filter(t=>t.triggered)}) : net.session;
  const msg={t:'session',session:sessionOut}; net.conns.forEach(c=>{ try{ c.send(msg); }catch(e){} });
  if(net.campaign){ clearTimeout(net._cpT); net._cpT=setTimeout(()=>{ if(net&&net.role==='dm'&&net.campaign) saveCampaign(net.campaign,true); },1500); } }   // active campaign autosaves (debounced)

function dmAutoPlace(){ const s=net.session; s.players.forEach((p,i)=>{ if(p.placed) return; p.x=Math.min(s.map.cols-1,i); p.y=s.map.rows-1; }); s.monsters.forEach((m,i)=>{ if(m.placed) return; m.x=Math.min(s.map.cols-1,i); m.y=0; }); }

function dmRefreshActor(){ const s=net.session, cur=s.order&&s.order[s.turn]; if(cur&&cur.k==='m'){ const mo=s.monsters.find(m=>m.id===cur.id); if(mo){ resetLegendary(mo);   /* PHB: the legendary pool refreshes at the START of its turn (v120.247) */
    mo.attacksLeft=mo.attacks||1; mo.moveLeft=speedBlocked(mo)?0:(mo.speed||30); mo.reactionUsed=false; } } }

function orderDead(o){ if(o.k!=='m') return false; const mo=net.session.monsters.find(m=>m.id===o.id); return mo&&mo.hp<=0; }

function tickMonsterConds(){ const s=net.session; (s.monsters||[]).forEach(mo=>{ if(mo.conds){ mo.conds.forEach(x=>{ if(x.rounds!=null) x.rounds--; }); mo.conds=mo.conds.filter(x=>x.rounds==null||x.rounds>0); } }); }

function dmSend(pid,msg){ const c=net.conns.find(x=>x.peer===pid); if(c){ try{ c.send(msg); }catch(e){} } }

function scheduleReconnect(){ if(!net||net.role!=='player') return; clearTimeout(net._rt);
  net._rt=setTimeout(()=>{ if(!net||net.role!=='player') return; if(net.conn&&net.conn.open) return;
    try{ if(net.peer&&net.peer.disconnected&&!net.peer.destroyed) net.peer.reconnect(); }catch(e){}
    playerConnect(); }, 2500); }

function playerHello(){ const c=playerChar(); if(!c||!net.conn) return;
  const sanc=(c.effects||[]).find(e=>e.name==='Sanctuary'), holy=(c.effects||[]).find(e=>e.name==='Holy Aura');
  // Darkvision rides along so the DM can preview what this player can actually see (v120.244).
  // The DM never holds the real sheet, so hasDarkvision() is not computable DM-side -- same
  // reason sanctuaryDC/holyAuraDC are synced here rather than derived.
  const dark=hasDarkvision(c);
  try{ net.conn.send({t:'hello',char:{cid:clientId(),name:c.name,cls:c.cls,level:c.level,hpCur:c.wildShape?c.wildShape.hpCur:c.hp.cur,hpMax:c.wildShape?c.wildShape.hpMax:c.hp.max,ac:computeAC(c),init:initiative(c),conds:Object.keys(c.conditions||{}),darkvision:!!dark,sanctuaryDC:sanc?sanc.dc:null,holyAuraDC:holy?holy.dc:null,stable:!!c.stable,deathFail:(c.death&&c.death.fail)||0,hiddenDC:c.hiddenDC||null,shadowMartyrArmed:!!c.shadowMartyrArmed,cuttingWordsArmed:!!c.cuttingWordsArmed,wildShapeName:c.wildShape?c.wildShape.name:null,healerFeatSpent:!!c.healerFeatSpent,shieldReady:shieldEligible(c),absorbReady:reactionSpellReady(c,'Absorb Elements'),rebukeReady:reactionSpellReady(c,'Hellish Rebuke')}}); }catch(e){} }

function battleSession(){ return (typeof QB!=='undefined'&&QB&&QB.active)?QB:(net&&net.session)||null; }

function myMapPos(){ if(!net||!net.session) return {x:0,y:0}; return net.session.players.find(p=>p.id===net.peer.id)||{x:0,y:0}; }

// A hidden monster the local character hasn't noticed isn't a legal target (v120.238). The
// observer defaults to this device's own character, since that's always who is looking here —
// unlike buildTargetingOpts, which serves several modes and so has to be told.
function monstersInRange(fromPos, tiles, observer){ if(!net||!net.session) return [];
  const passive=observerPassivePerception(observer!==undefined?observer:playerChar());
  return net.session.monsters.filter(m=>m.hp>0 && inBlast(fromPos.x,fromPos.y,m.x,m.y,tiles) && losClear(net.session,fromPos.x,fromPos.y,m.x,m.y) && !unitHiddenFrom(passive,m)); }

function deleteCampaign(name){ const all=campaigns(); delete all[name];
  try{ localStorage.setItem('grimoire.campaigns',JSON.stringify(all)); }catch(e){}
  if(net&&net.campaign===name) net.campaign=null; flashBanner('Campaign deleted: '+name); }

function shadowMartyrRedirect(s, tgt){
  if(!tgt) return null;
  const c=tgt.c;   // present (QB) or absent (DM-hosted mirror-only)
  if(!(c?c.shadowMartyrArmed:tgt.shadowMartyrArmed)) return null;
  if(c && (!isEchoKnight(c,10) || c.battle.reaction || c.shadowMartyrUsed)) return null;
  const controllerId = c ? 'pc' : tgt.id;
  const echo=(s.monsters||[]).find(m=>m.hp>0 && m.echo && m.controllerId===controllerId);
  if(!echo || gridDist(echo.x,echo.y,tgt.x,tgt.y)>1) return null;   // RAW: echo must be within 5 ft of the target to intercept
  if(c){ c.battle.reaction=true; c.shadowMartyrUsed=true; c.shadowMartyrArmed=false; }
  else { tgt.shadowMartyrArmed=false; dmSend(tgt.id, {t:'shadowMartyrTriggered'}); }
  return echo;
}

function cuttingWordsReduce(s, mo, atk, candidates){
  for(const cand of (candidates||[])){
    const c=cand.c;
    const armed = c ? c.cuttingWordsArmed : cand.cuttingWordsArmed;
    if(!armed) continue;
    if(c && (!isLoreBard(c,3) || c.battle.reaction || (c.bardicInspLeft||0)<=0)) continue;
    if(gridDist(mo.x,mo.y,cand.x,cand.y)>12) continue;   // 60 ft
    const die=rnd(bardicInspDie(c||{level:cand.level||1}));
    atk.toHit=(atk.toHit||0)-die;
    if(c){ c.battle.reaction=true; c.bardicInspLeft--; c.cuttingWordsArmed=false; return die; }
    cand.cuttingWordsArmed=false; dmSend(cand.id, {t:'cuttingWordsTriggered', die}); return die;
  }
  return 0;
}

function sendTrapTriggerCheck(s, p, x, y){
  const trap=(s.traps||[]).find(t=>!t.triggered && t.x===x && t.y===y); if(!trap) return;
  trap.triggered=true;
  if(typeof dmSend==='function') dmSend(p.id, {t:'hazard', name:trap.name, dc:trap.dc, ability:trap.ability, dmg:trap.dmg, cond:trap.cond});
  qbLog('🪤 '+(p.name||'A player')+' triggers a hidden '+trap.name+'!', s);
}

function sendTerrainHazardCheck(s,p,x,y){ const tdef=TERRAIN[terrainAt(s,x,y)]; if(!tdef||!(tdef.prone||tdef.restrain)) return;
  if(typeof dmSend!=='function') return;
  const cond=tdef.restrain?'Restrained':'Prone';
  const hz=hazardAt(s,x,y); const dc=hz?hz.dc:10;
  dmSend(p.id,{t:'hazard', name:tdef.name||cond, dc, ability:'dex', cond}); }

function tickGasHazards(s){ if(!s.hazards||!s.hazards.length) return;
  s.hazards.forEach(hz=>{ if(!hz.gas) return; const gs=SPELL_GAS[hz.name]; if(!gs) return;
    const cellSet=new Set(hz.cells.map(c=>c.x+','+c.y));
    const resolve=(name,isPc,unit,x,y,applyDmg,applyPoison)=>{
      if(x==null||!cellSet.has(x+','+y)) return;
      const bonus=isPc?(mod(abil(unit,'con'))+(unit.saveProf&&unit.saveProf.con?profBonus(unit):0)):monsterSaveBonus(unit);
      const roll=rnd(20)+bonus, saved=roll>=hz.dc;
      if(gs.dmg){
        const dmgTotal=(rollNotation(gs.dmg)||{total:0}).total;
        const applied=saved?Math.floor(dmgTotal/2):dmgTotal;
        if(applied>0) applyDmg(applied);
        qbLog('🌫️ '+hz.name+' — '+name+' takes '+applied+' '+gs.dtype+(saved?' (saved — half)':''), s);
      } else {
        if(!saved) applyPoison();
        qbLog('🌫️ '+hz.name+' — '+name+(saved?' resists the fumes':' is Poisoned'), s);
      }
    };
    (s.players||[]).forEach(p=>{
      if(p.c){
        // Quick Battle: the full character object (ability scores, save proficiency)
        // lives right here, so roll and apply locally same as monsters.
        if(p.c.hp&&p.c.hp.cur<=0) return;
        resolve(p.name||p.c.name, true, p.c, p.x, p.y,
          applied=>{ applyHp(p.c,-applied); if(p.hpCur!=null) p.hpCur=p.c.hp.cur; },
          ()=>{ p.c.conditions=p.c.conditions||{}; p.c.conditions['Poisoned']=true; });
      } else if(typeof dmSend==='function'){
        // DM-hosted session: the DM only holds a synced summary (hp/ac/conds), never the
        // player's ability scores — it genuinely cannot roll a Con save for them (same
        // reason dmMonsterAttack's save-based attacks are DM-adjudicated by hand rather
        // than auto-rolled). Instead of a manual per-hazard-per-round DM prompt (bad UX for
        // several creatures every round), send the player's own device — which DOES have
        // their full sheet — the hazard to resolve locally; it reports the result back via
        // the existing 'apply'/'cond' message types dmOnData already understands.
        if(p.x==null||!cellSet.has(p.x+','+p.y)||(p.hpCur!=null&&p.hpCur<=0)) return;
        dmSend(p.id,{t:'hazard', name:hz.name, dc:hz.dc, dmg:gs.dmg||null, dtype:gs.dtype||null});
      }
    });
    (s.monsters||[]).forEach(m=>{
      if(m.hp<=0) return;
      resolve(m.name, false, m, m.x, m.y,
        applied=>{ m.hp=Math.max(0,m.hp-applied); },
        ()=>{ m.conds=m.conds||[]; if(!m.conds.some(c=>c.name==='Poisoned')) m.conds.push({name:'Poisoned',rounds:1}); });
    });
  });
}

