p="index.html"; s=open(p,encoding="utf-8").read()
def rep(a,b,n=1):
    global s
    assert s.count(a)==n, (a[:60], s.count(a))
    s=s.replace(a,b)
rep("'pickup_dollar','pickup_cap','pickup_beer6','pickup_burger','pickup_vacuum',\n  'proj_beer','proj_golfball','proj_weedwhacker','proj_flag',",
    "'pickup_dollar','pickup_cap','pickup_beer6','pickup_burger','pickup_vacuum','pickup_cash','pickup_coin',\n  'proj_beer','proj_golfball','proj_whacker','proj_flag','proj_check','proj_coin','proj_blade','proj_log','proj_news','proj_dart',")
rep("ico:'proj_weedwhacker'","ico:'proj_whacker'")
rep("ico:'blade', type:'aura'","ico:'proj_blade', type:'aura'")
rep("ico:'check', type:'proj'","ico:'proj_check', type:'proj'")
rep("ico:'coin', type:'proj'","ico:'proj_coin', type:'proj'")
rep("for(const w of whackers()) img('proj_weedwhacker',w.x,w.y,0.5,w.an+Math.PI/2);",
    "for(const w of whackers()) img('proj_whacker',w.x,w.y,0.5,w.an+Math.PI/2);")
rep("""  for(const b of G.bullets){ if(b.t==='coin'){ ctx.fillStyle='#ffd700'; ctx.beginPath(); ctx.arc(b.x,b.y,5,0,Math.PI*2); ctx.fill(); ctx.fillStyle='#a80'; ctx.fillRect(b.x-1,b.y-3,2,6); }
    else if(b.t==='check'){ ctx.save(); ctx.translate(b.x,b.y); ctx.rotate(b.rot); ctx.fillStyle='#e9f3ff'; ctx.fillRect(-14,-8,28,16); ctx.fillStyle='#345'; ctx.fillRect(-10,-4,18,2); ctx.fillRect(-10,1,12,2); ctx.restore(); }
    else img(b.t==='beer'?'proj_beer':b.t==='golf'?'proj_golfball':'proj_flag',b.x,b.y,0.5,b.rot); }""",
"""  for(const b of G.bullets){ img(PROJ_SPR[b.t]||'proj_beer',b.x,b.y,0.5,b.rot); }""")
rep("function img(name,x,y,anchorY=1,rot=0){",
    "const PROJ_SPR={beer:'proj_beer',golf:'proj_golfball',flag:'proj_flag',check:'proj_check',coin:'proj_coin'};\nfunction img(name,x,y,anchorY=1,rot=0){")
rep('<div id="ver">v0.4.5</div>','<div id="ver">v0.4.6</div>')
open(p,"w",encoding="utf-8").write(s); print("items patched")
