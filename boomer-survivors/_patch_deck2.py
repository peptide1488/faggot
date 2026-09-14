p="index.html"; s=open(p,encoding="utf-8").read()
def rep(a,b,n=1):
    global s
    assert s.count(a)==n, (a[:70], s.count(a))
    s=s.replace(a,b)

# ---- DECK (collection) + HAND (active slots) ----
a=s.index("const HAND_MAX=5;"); b=s.index("document.getElementById('handBtn').onclick=")
b=s.index("\n",b)+1
s=s[:a]+r"""// DECK = every card you have picked up (max 10). HAND = the slots that are actually IN PLAY (3 + CARD SHARK).
// Move cards deck<->hand freely in the menu; only hand cards apply. Jokers are used straight from the deck.
const DECK_MAX=10;
function handSlots(){ return 3+(G?G.pv.shark||0:0); }
function cards(){ const C={dmg:1,area:1,cdm:1,armor:1,regen:0,xp:1,speed:1,hp:1,spawn:1,ehp:1,drop:1,mag:1,regrow:0,lawn:1,projExtra:0,projDmg:1,killTurf:0,killHeal:0};
  if(G) for(const id of G.hand) if(CARDS[id].mod) CARDS[id].mod(C); return C; }
function maxHP(){ return Math.max(10,Math.round(G.p.maxhp*cards().hp)); }
function drawCard(quiet){ if(G.deck.length>=DECK_MAX){ toast('DECK FULL'); return false; }
  const taken=new Set([...G.deck,...G.hand]); let pool=Object.keys(CARDS).filter(k=>!taken.has(k)||CARDS[k].once); if(!pool.length) pool=['j1'];
  const w=pool.map(k=>CARDS[k].once?0.5:1); let r=Math.random()*w.reduce((a,b)=>a+b,0); let id=pool[0]; for(let i=0;i<pool.length;i++){ r-=w[i]; if(r<=0){ id=pool[i]; break; } }
  G.deck.push(id); if(!quiet){ const c=CARDS[id]; toast('DREW '+c.name); sfx('power',0.4); if(!G.deckOpen) toggleDeck(); } if(G.deckOpen) renderDeck(); return true; }
function faceHTML(c){ const [g]=SUIT[c.s]; return `<div class="face${c.s==='h'||c.s==='d'?' red':c.s==='j'?' j':''}"><span>${c.r}</span><span>${g}</span></div>`; }
function cardHTML(id,where,i){ const c=CARDS[id]; const acts=where==='deck'
    ? (c.once?`<button onclick="useCard(${i})">USE</button>`:`<button onclick="toHand(${i})">TO HAND</button>`)+`<button onclick="discardCard(${i})">DISCARD</button>`
    : `<button onclick="toDeck(${i})">TO DECK</button>`;
  return `<div class="card"><span class="k" style="width:18px">${i+1}</span>${faceHTML(c)}<div class="body">${c.name}<small class="plus">+ ${c.plus}</small><small class="minus">- ${c.minus}</small></div><div class="acts">${acts}</div></div>`; }
function renderDeck(){ const n=handSlots();
  document.getElementById('deckList').innerHTML=`<h3>DECK ${G.deck.length}/${DECK_MAX}</h3>`+(G.deck.length?G.deck.map((id,i)=>cardHTML(id,'deck',i)).join(''):'<p>empty. enemies drop cards.</p>');
  let h=`<h3>HAND ${G.hand.length}/${n} <small>in play</small></h3>`+G.hand.map((id,i)=>cardHTML(id,'hand',i)).join('');
  for(let i=G.hand.length;i<n;i++) h+=`<div class="card empty"><div class="face empty"></div><div class="body" style="color:#666">empty slot</div></div>`;
  document.getElementById('handList').innerHTML=h; }
function toggleDeck(){ if(!G||G.levelup||G.dead||paused) return; if(G.deckOpen&&document.activeElement) document.activeElement.blur(); G.deckOpen=!G.deckOpen; document.getElementById('deck').hidden=!G.deckOpen; if(G.deckOpen) renderDeck(); }
function afterHandChange(){ const m=maxHP(); if(G.p.hp>m) G.p.hp=m; buildSlots(); renderDeck(); }
function toHand(i){ const id=G.deck[i]; if(!id) return; if(G.hand.length>=handSlots()){ toast('HAND FULL'); return; } G.deck.splice(i,1); G.hand.push(id); sfx('levelup',0.4); toast(CARDS[id].name+' IN PLAY'); afterHandChange(); }
function toDeck(i){ const id=G.hand[i]; if(!id) return; G.hand.splice(i,1); G.deck.push(id); sfx('power',0.3,0.7); afterHandChange(); }
function useCard(i){ const id=G.deck[i]; if(!id||!CARDS[id].once) return; G.deck.splice(i,1); sfx('levelup',0.4); toast(CARDS[id].name); CARDS[id].once(); afterHandChange(); }
function discardCard(i){ if(!G.deck[i]) return; toast('DISCARDED '+CARDS[G.deck[i]].name); G.deck.splice(i,1); renderDeck(); }
window.toHand=toHand; window.toDeck=toDeck; window.useCard=useCard; window.discardCard=discardCard;
document.getElementById('handBtn').onclick=()=>{ toggleDeck(); document.getElementById('handBtn').blur(); };
"""+s[b:]
# jokers
rep("once:()=>{ const n=G.hand.length; G.hand=[]; for(let i=0;i<n;i++) drawCard(true); }", "once:()=>{ const n=G.deck.length; G.deck=[]; for(let i=0;i<n;i++) drawCard(true); }")
rep("plus:'discard your whole hand, draw that many fresh cards'", "plus:'throw away your deck, draw that many fresh cards'")
# state
rep("dead:false, hand:[], played:[], deckOpen:false,", "dead:false, deck:[], hand:[], deckOpen:false,")
# keys: 1-9 deck card -> hand (or use), shift = discard; q/w/e/r/t hand slot -> deck
rep("  if(G&&G.deckOpen){ const n='12345'.indexOf(e.key.replace('!','1').replace('@','2').replace('#','3').replace('$','4').replace('%','5')); if(n>=0){ if(e.shiftKey) discardCard(n); else playCard(n); } return; }",
    "  if(G&&G.deckOpen){ const n='1234567890'.indexOf(e.key.replace('!','1').replace('@','2').replace('#','3').replace('$','4').replace('%','5').replace('^','6').replace('&','7').replace('*','8').replace('(','9').replace(')','0')); if(n>=0){ const i=n===9?9:n; if(e.shiftKey) discardCard(i); else if(G.deck[i]&&CARDS[G.deck[i]].once) useCard(i); else toHand(i); } const m='qwert'.indexOf(e.key.toLowerCase()); if(m>=0) toDeck(m); return; }")
# HUD CARD row = hand
rep("const id=G.played[i]; d.className='slot card-slot'+(id?' on':'');", "const id=G.hand[i]; d.className='slot card-slot'+(id?' on':'');")
rep("b.innerHTML=`HAND ${G.hand.length}/${HAND_MAX} &nbsp;<span class=\"k\">TAB</span>`; b.className=G.hand.length?'has':'';",
    "b.innerHTML=`DECK ${G.deck.length} &nbsp; HAND ${G.hand.length}/${handSlots()} &nbsp;<span class=\"k\">TAB</span>`; b.className=G.deck.length?'has':'';")
rep("<br>HAND ${G.hand.length}/${HAND_MAX} <span style=\"color:#888\">[TAB]</span><br>", "<br>")
# panel markup: two columns
rep("""  <div class="panel" id="deck" hidden style="min-width:560px"><h2>YOUR HAND</h2><p>Played cards stay on for the whole run: a buff and a catch. Jokers fire once.</p><p><span class="k">1-5</span> play &nbsp; <span class="k">shift+1-5</span> discard &nbsp; <span class="k">TAB</span> close</p><div id="hand"></div><div id="playedList" style="font:13px monospace;color:#aaa;margin-top:10px;text-align:left"></div></div>""",
    """  <div class="panel" id="deck" hidden style="min-width:900px;max-width:96vw"><h2>CARDS</h2><p>Cards you pick up land in your DECK. Put a card in your HAND to turn it on: a buff and a catch, for as long as it stays there. Jokers fire once, straight from the deck.</p>
    <p><span class="k">1-9</span> deck card to hand / use &nbsp; <span class="k">shift+1-9</span> discard &nbsp; <span class="k">Q W E R T</span> hand slot back to deck &nbsp; <span class="k">TAB</span> close</p>
    <div class="cols"><div id="deckList" class="col"></div><div id="handList" class="col hand"></div></div></div>""")
rep("  .slot.card-slot{", "  .cols{display:flex;gap:16px;align-items:flex-start;text-align:left}\n  .col{flex:1;min-width:0;max-height:60vh;overflow-y:auto}\n  .col h3{font:bold 16px monospace;color:#e8c54a;margin:4px 0} .col h3 small{color:#888;font-weight:normal}\n  .col.hand{border-left:3px solid #5a8a3a;padding-left:16px}\n  .card.empty{border-style:dashed;border-color:#444;background:transparent} .face.empty{background:#222;border-color:#444}\n  .slot.card-slot{")
# CARD SHARK passive
rep("  hoa:    {name:'HOA PRESIDENT',  ico:'hoa',  max:3, desc:'+50% lawn-care bonuses per level (active mowed tiles = damage + area, lifetime mowed = armor)'},",
    "  hoa:    {name:'HOA PRESIDENT',  ico:'hoa',  max:3, desc:'+50% lawn-care bonuses per level (active mowed tiles = damage + area, lifetime mowed = armor)'},\n  shark:  {name:'CARD SHARK',     ico:'shark',max:2, desc:'+1 card slot in your hand per level'},")
rep("pens:'&#9829;',hoa:'&#9820;'};", "pens:'&#9829;',hoa:'&#9820;',shark:'&#9824;'};")
rep('<div id="ver">v0.5.8</div>','<div id="ver">v0.6.0</div>')
open(p,"w",encoding="utf-8").write(s); print("deck2 patched")
