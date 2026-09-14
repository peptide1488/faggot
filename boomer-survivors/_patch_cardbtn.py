p="index.html"; s=open(p,encoding="utf-8").read()
def rep(a,b,n=1):
    global s
    assert s.count(a)==n, (a[:70], s.count(a))
    s=s.replace(a,b)
rep('    <div class="slots" id="slotsC"><div class="lab">CARD</div></div>\n',
    '    <div class="slots" id="slotsC"><div class="lab">CARD</div></div>\n    <button id="handBtn" hidden>HAND 0/5 &nbsp;<span class="k">TAB</span></button>\n')
rep("  #stats{position:absolute;right:12px;",
    "  #handBtn{pointer-events:auto;margin-top:6px;background:#1c2b17;border:3px solid #5a8a3a;color:#fff;font:bold 13px monospace;padding:6px 10px;cursor:pointer;text-shadow:none}\n  #handBtn.has{border-color:#e8c54a;animation:pulse 1s infinite alternate}\n  @keyframes pulse{from{background:#1c2b17}to{background:#4a3a10}}\n  #stats{position:absolute;right:12px;")
# picking a card up opens the hand right away (pauses like a level-up)
rep("  G.hand.push(id); if(!quiet){ const c=CARDS[id]; toast('DREW '+c.name+' (TAB)'); sfx('power',0.4); } if(G.deckOpen) renderDeck(); return true; }",
    "  G.hand.push(id); if(!quiet){ const c=CARDS[id]; toast('DREW '+c.name); sfx('power',0.4); if(!G.deckOpen) toggleDeck(); } if(G.deckOpen) renderDeck(); return true; }")
rep("function toggleDeck(){ if(!G||G.levelup||G.dead||paused) return;", "function toggleDeck(){ if(!G||G.levelup||G.dead||paused) return; if(G.deckOpen&&document.activeElement) document.activeElement.blur();")
rep("document.getElementById('hud').hidden=false; document.getElementById('stats').hidden=false;",
    "document.getElementById('hud').hidden=false; document.getElementById('stats').hidden=false; document.getElementById('handBtn').hidden=false;")
rep("function refreshSlots(){ const p=G.p;", "function refreshSlots(){ const p=G.p; { const b=document.getElementById('handBtn'); b.innerHTML=`HAND ${G.hand.length}/${HAND_MAX} &nbsp;<span class=\"k\">TAB</span>`; b.className=G.hand.length?'has':''; }")
rep("window.playCard=playCard; window.discardCard=discardCard;", "window.playCard=playCard; window.discardCard=discardCard;\ndocument.getElementById('handBtn').onclick=()=>{ toggleDeck(); document.getElementById('handBtn').blur(); };")
rep("<h2>YOUR HAND</h2><p><span class=\"k\">1-5</span> play &nbsp; <span class=\"k\">shift+1-5</span> discard &nbsp; <span class=\"k\">TAB</span> close</p>",
    "<h2>YOUR HAND</h2><p>Played cards stay on for the whole run: a buff and a catch. Jokers fire once.</p><p><span class=\"k\">1-5</span> play &nbsp; <span class=\"k\">shift+1-5</span> discard &nbsp; <span class=\"k\">TAB</span> close</p>")
rep('<div id="ver">v0.5.5</div>','<div id="ver">v0.5.6</div>')
open(p,"w",encoding="utf-8").write(s); print("card button patched")
