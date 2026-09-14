p="index.html"; s=open(p,encoding="utf-8").read()
def rep(a,b,n=1):
    global s
    assert s.count(a)==n, (a[:70], s.count(a))
    s=s.replace(a,b)
rep("'pickup_cash','pickup_coin','pickup_card',", "'pickup_cash','pickup_coin','pickup_card','card_back','card_blank','card_stack','card_fan','card_sA','card_hK','card_dQ','card_cJ','card_j1','card_j2','card_s10','card_c7','card_h9','card_h5',")
rep("function faceHTML(c){ const [g]=SUIT[c.s]; return `<div class=\"face${c.s==='h'||c.s==='d'?' red':c.s==='j'?' j':''}\"><span>${c.r}</span><span>${g}</span></div>`; }",
    "function faceHTML(c){ const id=Object.keys(CARDS).find(k=>CARDS[k]===c); const [g]=SUIT[c.s]; const cls=c.s==='h'||c.s==='d'?' red':c.s==='j'?' j':'';\n  if(SPR['card_'+id]) return `<div class=\"face art\"><img src=\"sprites/card_${id}.png\"></div>`;\n  return `<div class=\"face art${cls}\"><img src=\"sprites/card_blank.png\"><b>${c.r}<br>${g}</b></div>`; }")
rep("  .card .face.red{color:#c22} .card .face.j{color:#b8860b}",
    "  .card .face.red{color:#c22} .card .face.j{color:#b8860b}\n  .card .face.art{width:76px;height:108px;background:transparent;border:0;position:relative}\n  .card .face.art img{image-rendering:pixelated;height:108px;width:auto}\n  .card .face.art b{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;text-align:center;font:bold 26px monospace;line-height:1;text-shadow:0 0 2px #fff}")
rep("<button id=\"handBtn\" hidden>HAND 0/5 &nbsp;<span class=\"k\">TAB</span></button>", "<button id=\"handBtn\" hidden><img src=\"sprites/card_stack.png\"> HAND &nbsp;<span class=\"k\">TAB</span></button>")
rep("  #handBtn{pointer-events:auto;", "  #handBtn img{image-rendering:pixelated;height:28px;vertical-align:middle;margin-right:6px}\n  #handBtn{pointer-events:auto;display:flex;align-items:center;")
rep("b.innerHTML=`DECK ${G.deck.length} &nbsp; HAND ${G.hand.length}/${handSlots()} &nbsp;<span class=\"k\">TAB</span>`;",
    "b.innerHTML=`<img src=\"sprites/card_stack.png\"> DECK ${G.deck.length} &nbsp; HAND ${G.hand.length}/${handSlots()} &nbsp;<span class=\"k\">TAB</span>`;")
rep("for(const d of G.drops) img('pickup_'+d.t,d.x,d.y+Math.sin(G.t*4+d.x)*3,0.5);", "for(const d of G.drops) img('pickup_'+d.t,d.x,d.y+Math.sin(G.t*4+d.x)*3,d.t==='card'?0.9:0.5);")
rep('<div id="ver">v0.6.1</div>','<div id="ver">v0.6.2</div>')
open(p,"w",encoding="utf-8").write(s); print("card art patched")
