p="index.html"; s=open(p,encoding="utf-8").read()
def rep(a,b,n=1):
    global s
    assert s.count(a)==n, (a[:70], s.count(a))
    s=s.replace(a,b)
# player state
rep("hitcd:0,cap:0,shake:0,mx:0,my:0,revives:0}", "hitcd:0,cap:0,shake:0,mx:0,my:0,revives:0,blades:true}")
# SPACE toggles the deck: blades down = mow (slow, cuts grass, blade aura on); blades up = drive (fast, no mowing)
rep("if(e.key==='Tab'||e.key==='c'||e.key==='C'){ e.preventDefault(); toggleDeck(); }",
    "if(e.key==='Tab'||e.key==='c'||e.key==='C'){ e.preventDefault(); toggleDeck(); }\n  if(e.key===' '&&G&&running&&!G.levelup&&!G.dead&&!G.deckOpen&&!e.repeat){ G.p.blades=!G.p.blades; toast(G.p.blades?'BLADES DOWN':'BLADES UP'); sfx('power',0.4,G.p.blades?0.8:1.3); }")
# speed
rep("const spd=p.speed*S.speed*(p.cap>0?1.35:1);", "const spd=p.speed*S.speed*(p.cap>0?1.35:1)*(p.blades?1:1.9);")
# mowing only with blades down
rep("if(tileKind(tx,ty)===1 && !isMowed(tx,ty)){ G.mowed.set(tk,G.t);", "if(p.blades && tileKind(tx,ty)===1 && !isMowed(tx,ty)){ G.mowed.set(tk,G.t);")
# blade aura only with blades down
rep("if(d<bladeR+e.r*0.5){ const bd=bladeDps*dt*(onMowed(e)?1.5:1);", "if(p.blades && d<bladeR+e.r*0.5){ const bd=bladeDps*dt*(onMowed(e)?1.5:1);")
# clippings ring only with blades down
rep("  const bl=G.a.blades, bR=bladeRadius(); for(let i=0;i<6+bl*2;i++){", "  const bl=G.a.blades, bR=bladeRadius(); if(p.blades) for(let i=0;i<6+bl*2;i++){")
# dust trail when driving fast
rep("  p.shake+=dt*(len>0?26:16);", "  p.shake+=dt*(len>0?(p.blades?26:40):16);\n  if(!p.blades&&len>0&&Math.random()<dt*14){ G.fx.push({t:'p',x:p.x+rnd(-14,14),y:p.y+12,vx:-mx*30+rnd(-15,15),vy:-10,life:0.5,max:0.5,col:'#b8a97a',size:3,grow:true}); }")
# HUD
rep("<br>HAND ${G.hand.length}/${HAND_MAX} <span style=\"color:#888\">[TAB]</span><br>",
    "<br>HAND ${G.hand.length}/${HAND_MAX} <span style=\"color:#888\">[TAB]</span><br><span style=\"color:${p.blades?'#8f4':'#fc4'}\">${p.blades?'BLADES DOWN':'BLADES UP: FAST'}</span> <span style=\"color:#888\">[SPACE]</span><br>")
# title hint
rep("<p><span class=\"k\">WASD / arrows</span> drive &nbsp; <span class=\"k\">P</span> pause</p>",
    "<p><span class=\"k\">WASD / arrows</span> drive &nbsp; <span class=\"k\">SPACE</span> blades up/down &nbsp; <span class=\"k\">P</span> pause</p><p>Blades down: mow, build turf, the deck shreds. Blades up: no mowing, no deck damage, nearly double speed.</p>")
rep('<div id="ver">v0.5.3</div>','<div id="ver">v0.5.4</div>')
open(p,"w",encoding="utf-8").write(s); print("mower mode patched")
