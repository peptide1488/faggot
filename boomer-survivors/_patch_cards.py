p="index.html"; s=open(p,encoding="utf-8").read()
def rep(a,b,n=1):
    global s
    assert s.count(a)==n, (a[:70], s.count(a))
    s=s.replace(a,b)

# ---- CSS ----
rep("  #stats{position:absolute;right:12px;",
"""  .card{display:flex;align-items:center;gap:12px;margin:8px 0;padding:8px 10px;background:#1c2b17;border:3px solid #5a8a3a;text-align:left;font:bold 15px monospace}
  .card .face{width:44px;height:60px;flex:none;background:#f4f4f4;border:2px solid #222;color:#222;display:flex;flex-direction:column;align-items:center;justify-content:center;font:bold 20px monospace;line-height:1}
  .card .face.red{color:#c22} .card .face.j{color:#b8860b}
  .card .body{flex:1} .card small{display:block;font-weight:normal;margin-top:2px}
  .card .plus{color:#8f4} .card .minus{color:#f66}
  .card .acts{display:flex;flex-direction:column;gap:4px}
  .card .acts button{font:bold 12px monospace;padding:4px 8px;background:#000;border:2px solid #5a8a3a;color:#fff;cursor:pointer}
  .card .acts button:hover{border-color:#e8c54a}
  .slot.card-slot{font:bold 13px monospace;color:#fff;flex-direction:column;line-height:1}
  #stats{position:absolute;right:12px;""")

# ---- HTML: HUD row, deck panel, title hint ----
rep('    <div class="slots" id="slotsP"><div class="lab">PASS</div></div>\n',
    '    <div class="slots" id="slotsP"><div class="lab">PASS</div></div>\n    <div class="slots" id="slotsC"><div class="lab">CARD</div></div>\n')
rep('  <div class="panel" id="paused" hidden><h2>PAUSED</h2><p>press P</p></div>\n',
"""  <div class="panel" id="paused" hidden><h2>PAUSED</h2><p>press P</p></div>
  <div class="panel" id="deck" hidden style="min-width:560px"><h2>YOUR HAND</h2><p><span class="k">1-5</span> play &nbsp; <span class="k">shift+1-5</span> discard &nbsp; <span class="k">TAB</span> close</p><div id="hand"></div><div id="playedList" style="font:13px monospace;color:#aaa;margin-top:10px;text-align:left"></div></div>
""")
rep("<p>Weapons fire on their own. Pick upgrades when you level up.</p>",
    "<p>Weapons fire on their own. Pick upgrades when you level up.</p><p style=\"color:#e8c54a\">Enemies drop PLAYING CARDS. <span class=\"k\">TAB</span> opens your hand: play a card for a permanent buff with a catch, or discard it.</p>")

# ---- sprite ----
rep("'pickup_cash','pickup_coin',", "'pickup_cash','pickup_coin','pickup_card',")

# ---- card table + cards() ----
rep("// ---------- PASSIVES ----------",
r"""// ---------- PLAYING CARDS ----------
// Dropped by enemies. Sit in your HAND (max 5) doing nothing until PLAYED (permanent, buff + catch) or DISCARDED.
// Jokers are one-shot. cards() folds every played card into one modifier set that st()/wstat()/spawn read.
const SUIT={s:['♠','#222'],h:['♥','#c22'],d:['♦','#c22'],c:['♣','#222'],j:['★','#b8860b']};
const CARDS={
  sA:{r:'A',s:'s',name:'SCORCHED EARTH', plus:'damage x2',                              minus:'max HP -1% per LIVE mowed tile (floor 25%)', mod:C=>{ C.dmg*=2; C.hp*=Math.max(0.25,1-(G.activeMowed||0)*0.01); }},
  sK:{r:'K',s:'s',name:'WIDOWMAKER',     plus:'XP x1.6',                                minus:'enemies +60% HP',                             mod:C=>{ C.xp*=1.6; C.ehp*=1.6; }},
  s10:{r:'10',s:'s',name:'HOA FINE',     plus:'kills on mowed grass heal 2 HP',        minus:'kills on tall grass cost 1 HP',               mod:C=>{ C.killTurf=1; }},
  s6:{r:'6',s:'s',name:'OVERGROWN',      plus:'mowed grass never regrows',              minus:'area -25%',                                   mod:C=>{ C.regrow=1; C.area*=0.75; }},
  hK:{r:'K',s:'h',name:'SECOND MORTGAGE',plus:'max HP +50%',                            minus:'XP -25%',                                     mod:C=>{ C.hp*=1.5; C.xp*=0.75; }},
  h9:{r:'9',s:'h',name:'EARLY BIRD',     plus:'speed +30%',                             minus:'cooldowns +20%',                              mod:C=>{ C.speed*=1.3; C.cdm*=1.2; }},
  h5:{r:'5',s:'h',name:'MEDICARE',       plus:'+3 HP/s regen',                          minus:'max HP -30%',                                 mod:C=>{ C.regen+=3; C.hp*=0.7; }},
  h2:{r:'2',s:'h',name:'LIFE INSURANCE', plus:'every kill heals 1 HP',                  minus:'damage taken +25%',                           mod:C=>{ C.killHeal+=1; C.armor*=1.25; }},
  dQ:{r:'Q',s:'d',name:'DRIP',           plus:'XP +50%',                                minus:'damage -20%',                                 mod:C=>{ C.xp*=1.5; C.dmg*=0.8; }},
  dJ:{r:'J',s:'d',name:'DAY TRADER',     plus:'cooldowns -25%',                         minus:'damage taken +30%',                           mod:C=>{ C.cdm*=0.75; C.armor*=1.3; }},
  d8:{r:'8',s:'d',name:'COMPOUND INTEREST',plus:'+2% damage per player level',          minus:'damage -15% up front',                        mod:C=>{ C.dmg*=0.85+G.p.lvl*0.02; }},
  d4:{r:'4',s:'d',name:'COUPON CLIPPER', plus:'drops x2',                               minus:'pickup radius -40%',                          mod:C=>{ C.drop*=2; C.mag*=0.6; }},
  cJ:{r:'J',s:'c',name:'GLASS CANNON',   plus:'damage +60%',                            minus:'damage taken +50%',                           mod:C=>{ C.dmg*=1.6; C.armor*=1.5; }},
  c9:{r:'9',s:'c',name:'BIG DECK',       plus:'area +40%',                              minus:'speed -15%',                                  mod:C=>{ C.area*=1.4; C.speed*=0.85; }},
  c7:{r:'7',s:'c',name:'LAWN FANATIC',   plus:'lawn-care bonuses x2',                   minus:'enemies spawn +50%',                          mod:C=>{ C.lawn*=2; C.spawn*=1.5; }},
  c3:{r:'3',s:'c',name:'SPRAY AND PRAY', plus:'+1 projectile on every thrown weapon',   minus:'thrown damage -25%',                          mod:C=>{ C.projExtra+=1; C.projDmg*=0.75; }},
  j1:{r:'J',s:'j',name:'WILD',           plus:'kills everything on screen, full heal, shop vac', minus:'one use', once:()=>{ G.p.hp=maxHP(); G.vac=3; G.camShake=16; sfx('boom',0.7); for(let j=G.enemies.length-1;j>=0;j--){ const e=G.enemies[j]; if(Math.abs(e.x-G.p.x)<VW*0.6&&Math.abs(e.y-G.p.y)<VH*0.6){ hurt(e,9999); if(e.hp<=0) killEnemy(j); } } }},
  j2:{r:'J',s:'j',name:'REDEAL',         plus:'discard your whole hand, draw that many fresh cards', minus:'one use', once:()=>{ const n=G.hand.length; G.hand=[]; for(let i=0;i<n;i++) drawCard(true); }},
};
const HAND_MAX=5;
function cards(){ const C={dmg:1,area:1,cdm:1,armor:1,regen:0,xp:1,speed:1,hp:1,spawn:1,ehp:1,drop:1,mag:1,regrow:0,lawn:1,projExtra:0,projDmg:1,killTurf:0,killHeal:0};
  if(G) for(const id of G.played) if(CARDS[id].mod) CARDS[id].mod(C); return C; }
function maxHP(){ return Math.max(10,Math.round(G.p.maxhp*cards().hp)); }
function drawCard(quiet){ if(G.hand.length>=HAND_MAX){ toast('HAND FULL (TAB)'); return false; }
  const taken=new Set([...G.hand,...G.played]); let pool=Object.keys(CARDS).filter(k=>!taken.has(k)||CARDS[k].once); if(!pool.length) pool=['j1'];
  const w=pool.map(k=>CARDS[k].once?0.5:1); let r=Math.random()*w.reduce((a,b)=>a+b,0); let id=pool[0]; for(let i=0;i<pool.length;i++){ r-=w[i]; if(r<=0){ id=pool[i]; break; } }
  G.hand.push(id); if(!quiet){ const c=CARDS[id]; toast('DREW '+c.name+' (TAB)'); sfx('power',0.4); } if(G.deckOpen) renderDeck(); return true; }
function cardHTML(id,i){ const c=CARDS[id], [g,col]=SUIT[c.s]; return `<div class="card"><div class="face${c.s==='h'||c.s==='d'?' red':c.s==='j'?' j':''}"><span>${c.r}</span><span>${g}</span></div><div class="body">${i!==undefined?`<span class="k">${i+1}.</span> `:''}${c.name}<small class="plus">+ ${c.plus}</small><small class="minus">- ${c.minus}</small></div>${i!==undefined?`<div class="acts"><button onclick="playCard(${i})">PLAY</button><button onclick="discardCard(${i})">DISCARD</button></div>`:''}</div>`; }
function renderDeck(){ const h=document.getElementById('hand'); h.innerHTML=G.hand.length?G.hand.map((id,i)=>cardHTML(id,i)).join(''):'<p>empty. enemies drop cards.</p>';
  document.getElementById('playedList').innerHTML=G.played.length?'IN PLAY: '+G.played.map(id=>{ const c=CARDS[id]; return `<span style="color:${c.s==='h'||c.s==='d'?'#f66':'#fff'}">${c.r}${SUIT[c.s][0]}</span> ${c.name}`; }).join(' &nbsp;|&nbsp; '):''; }
function toggleDeck(){ if(!G||G.levelup||G.dead||paused) return; G.deckOpen=!G.deckOpen; document.getElementById('deck').hidden=!G.deckOpen; if(G.deckOpen) renderDeck(); }
function playCard(i){ const id=G.hand[i]; if(!id) return; G.hand.splice(i,1); const c=CARDS[id]; sfx('levelup',0.4);
  if(c.once) c.once(); else { G.played.push(id); toast('PLAYED '+c.name); }
  const m=maxHP(); if(G.p.hp>m) G.p.hp=m; buildSlots(); renderDeck(); }
function discardCard(i){ if(!G.hand[i]) return; toast('DISCARDED '+CARDS[G.hand[i]].name); G.hand.splice(i,1); renderDeck(); }
window.playCard=playCard; window.discardCard=discardCard;
// ---------- PASSIVES ----------""")

# ---- st(): fold card modifiers in ----
rep("const st=()=>{ const t=turf(), pv=G.pv, a=G.a, L=lawn(); return {\n  area:(1+pv.glasses*0.15)*(1+L.area),\n  cdm:Math.max(0.4,(1-pv.monster*0.08)*(t?0.9-pv.monster*0.02:1)),\n  dmg:(1+pv.truck*0.12)*(t?1.15+pv.truck*0.03+a.blades*0.01:1)*(1+L.dmg),\n  armor:Math.max(0.25,(1-pv.paper*0.1)*(t?0.85-pv.paper*0.03:1)*(1-L.armor)),\n  regen:pv.socsec+(t?1+pv.socsec*0.5+pv.gut*0.5:0),\n  xp:(1+pv.equity*0.15)*(t?1.1+pv.equity*0.05:1),\n  speed:(1+pv.boots*0.1)*(t?1.1+pv.boots*0.02:1),\n  eslow:t?0.85-a.sprinkler*0.02-pv.magnet*0.01:1,     // enemy speed while THEY stand on mowed grass\n  extra:pv.bifocals, luck:1+pv.lucky*0.25 }; };",
"const st=()=>{ const t=turf(), pv=G.pv, a=G.a, L=lawn(), C=cards(); return {\n  area:(1+pv.glasses*0.15)*(1+L.area)*C.area,\n  cdm:Math.max(0.3,(1-pv.monster*0.08)*(t?0.9-pv.monster*0.02:1)*C.cdm),\n  dmg:(1+pv.truck*0.12)*(t?1.15+pv.truck*0.03+a.blades*0.01:1)*(1+L.dmg)*C.dmg,\n  armor:Math.max(0.25,(1-pv.paper*0.1)*(t?0.85-pv.paper*0.03:1)*(1-L.armor))*C.armor,\n  regen:pv.socsec+(t?1+pv.socsec*0.5+pv.gut*0.5:0)+C.regen,\n  xp:(1+pv.equity*0.15)*(t?1.1+pv.equity*0.05:1)*C.xp,\n  speed:(1+pv.boots*0.1)*(t?1.1+pv.boots*0.02:1)*C.speed,\n  eslow:t?0.85-a.sprinkler*0.02-pv.magnet*0.01:1,     // enemy speed while THEY stand on mowed grass\n  extra:pv.bifocals, luck:(1+pv.lucky*0.25)*C.drop, C }; };")
rep("function lawn(){ const m=1+G.pv.hoa*0.5;", "function lawn(){ const m=(1+G.pv.hoa*0.5)*cards().lawn;")
rep("  if(o.cd) o.cd*=S.cdm; o.dmg*=S.dmg; if(o.count&&w.type!=='zone') o.count+=S.extra; return o; }",
    "  if(o.cd) o.cd*=S.cdm; o.dmg*=S.dmg; if(o.count&&w.type!=='zone') o.count+=S.extra;\n  if(w.type==='proj'){ o.dmg*=S.C.projDmg; if(o.count) o.count+=S.C.projExtra; } return o; }")

# ---- regrow ----
rep("function isMowed(tx,ty){ const t=G.mowed.get(tx+','+ty); return t!==undefined && G.t-t<REGROW; }",
    "function regrow(){ return cards().regrow?1e9:REGROW; }\nfunction isMowed(tx,ty){ const t=G.mowed.get(tx+','+ty); return t!==undefined && G.t-t<regrow(); }")
rep("let n=0; for(const [k,t0] of G.mowed){ if(G.t-t0<REGROW) n++; else G.mowed.delete(k); }",
    "let n=0; const RG=regrow(); for(const [k,t0] of G.mowed){ if(G.t-t0<RG) n++; else G.mowed.delete(k); }")

# ---- spawn rate / enemy hp ----
rep("G.spawnT=Math.max(0.4,2.2-G.t/80); }", "G.spawnT=Math.max(0.4,2.2-G.t/80)/cards().spawn; }")
rep("    G.enemies.push({...e,x:p.x+Math.cos(a)*r,", "    e.hp*=cards().ehp; G.enemies.push({...e,x:p.x+Math.cos(a)*r,")

# ---- kills: card drop + kill hooks ----
rep("function killEnemy(i){ const e=G.enemies[i]; G.enemies.splice(i,1); G.kills++; sfx('kill',0.35,1,0.06);",
    "function killEnemy(i){ const e=G.enemies[i]; G.enemies.splice(i,1); G.kills++; sfx('kill',0.35,1,0.06);\n  { const C=cards(), p=G.p; if(C.killTurf){ if(onMowed(e)) p.hp=Math.min(maxHP(),p.hp+2); else p.hp=Math.max(1,p.hp-1); } if(C.killHeal) p.hp=Math.min(maxHP(),p.hp+C.killHeal); }")
rep("else if(r<0.052) G.drops.push({t:'vacuum',x:e.x+10,y:e.y}); }",
    "else if(r<0.052) G.drops.push({t:'vacuum',x:e.x+10,y:e.y}); else if(r<0.07) G.drops.push({t:'card',x:e.x+10,y:e.y}); }")
rep("      else if(d.t==='vacuum'){ toast('SHOP VAC'); sfx('power',0.5); G.vac=2.5; }",
    "      else if(d.t==='vacuum'){ toast('SHOP VAC'); sfx('power',0.5); G.vac=2.5; }\n      else if(d.t==='card'){ if(!drawCard()) G.drops.push(d); }")

# ---- max HP through cards ----
rep("case 'prop_pool': toast('POOL'); p.hp=Math.min(p.maxhp,p.hp+25);", "case 'prop_pool': toast('POOL'); p.hp=Math.min(maxHP(),p.hp+25);")
rep("const S2=st(); if(S2.regen>0) p.hp=Math.min(p.maxhp,p.hp+S2.regen*dt);", "const S2=st(); if(S2.regen>0) p.hp=Math.min(maxHP(),p.hp+S2.regen*dt); if(p.hp>maxHP()) p.hp=maxHP();")
rep("p.revives++; p.hp=p.maxhp/2;", "p.revives++; p.hp=maxHP()/2;")
rep("else if(d.t==='burger'){ p.hp=Math.min(p.maxhp,p.hp+40);", "else if(d.t==='burger'){ p.hp=Math.min(maxHP(),p.hp+40);")
rep("document.getElementById('hpv').textContent=`${Math.ceil(p.hp)}/${p.maxhp}`; document.querySelector('#hp>div').style.width=(100*p.hp/p.maxhp)+'%';",
    "document.getElementById('hpv').textContent=`${Math.ceil(p.hp)}/${maxHP()}`; document.querySelector('#hp>div').style.width=(100*p.hp/maxHP())+'%';")

# ---- magnet radius (update + draw) ----
rep("const mag=90*(1+G.pv.magnet*0.6)*(p.cap>0?1.5:1);", "const mag=90*(1+G.pv.magnet*0.6)*(p.cap>0?1.5:1)*cards().mag;", 2)

# ---- state, input, loop, HUD ----
rep("kills:0, mowedCount:0, spawnT:0, levelup:false, dead:false,", "kills:0, mowedCount:0, spawnT:0, levelup:false, dead:false, hand:[], played:[], deckOpen:false,")
rep("  paused=false;\n  document.getElementById('hud').hidden=false;", "  paused=false; document.getElementById('deck').hidden=true;\n  document.getElementById('hud').hidden=false;")
rep("if(G&&G.levelup&&['1','2','3'].includes(e.key)) pick(+e.key-1);",
    "if(e.key==='Tab'||e.key==='c'||e.key==='C'){ e.preventDefault(); toggleDeck(); }\n  if(G&&G.deckOpen){ const n='12345'.indexOf(e.key.replace('!','1').replace('@','2').replace('#','3').replace('$','4').replace('%','5')); if(n>=0){ if(e.shiftKey) discardCard(n); else playCard(n); } return; }\n  if(G&&G.levelup&&['1','2','3'].includes(e.key)) pick(+e.key-1);")
rep("if(!paused&&!G.levelup&&!G.dead) update(dt);", "if(!paused&&!G.levelup&&!G.dead&&!G.deckOpen) update(dt);")
rep("  for(let i=0;i<6;i++){ if(pas[i]) mk(P,pas[i],G.pv[pas[i]],PASSIVE[pas[i]].max); else { const d=document.createElement('div'); d.className='slot'; P.appendChild(d);} } }",
    "  for(let i=0;i<6;i++){ if(pas[i]) mk(P,pas[i],G.pv[pas[i]],PASSIVE[pas[i]].max); else { const d=document.createElement('div'); d.className='slot'; P.appendChild(d);} }\n  const Cb=document.getElementById('slotsC'); Cb.innerHTML='<div class=\"lab\">CARD</div>'; for(let i=0;i<6;i++){ const d=document.createElement('div'); const id=G.played[i]; d.className='slot card-slot'+(id?' on':''); if(id){ const c=CARDS[id]; d.title=c.name+': +'+c.plus+' / -'+c.minus; d.style.color=c.s==='h'||c.s==='d'?'#f66':c.s==='j'?'#e8c54a':'#fff'; d.innerHTML=`<span>${c.r}</span><span>${SUIT[c.s][0]}</span>`; } Cb.appendChild(d); } }")
rep("<br>DPS <span style=\"color:#ffd54a\">${Math.round(G.dps)}</span><br>",
    "<br>DPS <span style=\"color:#ffd54a\">${Math.round(G.dps)}</span><br>HAND ${G.hand.length}/${HAND_MAX} <span style=\"color:#888\">[TAB]</span><br>")
rep('<div id="ver">v0.4.6</div>','<div id="ver">v0.5.0</div>')
open(p,"w",encoding="utf-8").write(s); print("cards patched")
