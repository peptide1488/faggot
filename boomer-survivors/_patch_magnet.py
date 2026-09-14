p="index.html"; s=open(p,encoding="utf-8").read()
# stronger, visible 401K pull; a VACUUM pickup that sucks every drop on the map
s=s.replace("const mag=80*(1+G.pv.magnet*0.4);", "const mag=90*(1+G.pv.magnet*0.6)*(p.cap>0?1.5:1);")
s=s.replace("magnet: {name:'401K MAGNET',    ico:'401k', max:5, desc:'+40% pickup radius per level; enemies slower on your turf'}", "magnet: {name:'401K MAGNET',    ico:'401k', max:5, desc:'+60% pickup radius per level; enemies slower on your turf'}")
s=s.replace("  for(let i=G.drops.length-1;i>=0;i--){ const d=G.drops[i]; const dd=dist(d,p); if(dd<mag){",
            "  if(G.vac>0){ G.vac-=dt; for(const d of G.drops){ const an=Math.atan2(p.y-d.y,p.x-d.x); const sp=900+dist(d,p)*2; d.x+=Math.cos(an)*sp*dt; d.y+=Math.sin(an)*sp*dt; if(Math.random()<dt*20) G.fx.push({t:'p',x:d.x,y:d.y,vx:0,vy:0,life:0.2,max:0.2,col:'#8f8',size:2}); } }\n  for(let i=G.drops.length-1;i>=0;i--){ const d=G.drops[i]; const dd=dist(d,p); if(dd<mag){")
s=s.replace("else if(d.t==='beer6'){ toast('SIX PACK');", "else if(d.t==='vacuum'){ toast('SHOP VAC'); sfx('power',0.5); G.vac=2.5; }\n      else if(d.t==='beer6'){ toast('SIX PACK');")
s=s.replace("if(r<0.025) G.drops.push({t:'burger',x:e.x+10,y:e.y}); else if(r<0.035) G.drops.push({t:'cap',x:e.x+10,y:e.y}); else if(r<0.042) G.drops.push({t:'beer6',x:e.x+10,y:e.y}); }",
            "if(r<0.025) G.drops.push({t:'burger',x:e.x+10,y:e.y}); else if(r<0.035) G.drops.push({t:'cap',x:e.x+10,y:e.y}); else if(r<0.042) G.drops.push({t:'beer6',x:e.x+10,y:e.y}); else if(r<0.052) G.drops.push({t:'vacuum',x:e.x+10,y:e.y}); }")
s=s.replace("cd:{}, whackAng:0, sprAng:0, cam:{x:0,y:0}, camShake:0, dmgLog:[], dps:0 };", "cd:{}, whackAng:0, sprAng:0, cam:{x:0,y:0}, camShake:0, dmgLog:[], dps:0, vac:0 };")
s=s.replace("'pickup_dollar','pickup_cap','pickup_beer6','pickup_burger',", "'pickup_dollar','pickup_cap','pickup_beer6','pickup_burger','pickup_vacuum',")
# faint pickup-radius ring so the magnet passive is visible
s=s.replace("  for(const d of G.drops) img('pickup_'+d.t,d.x,d.y+Math.sin(G.t*4+d.x)*3,0.5);",
            "  { const mag=90*(1+G.pv.magnet*0.6)*(p.cap>0?1.5:1); ctx.strokeStyle='rgba(60,140,230,0.22)'; ctx.setLineDash([4,6]); ctx.lineWidth=1; ctx.beginPath(); ctx.ellipse(p.x,p.y,mag,mag*0.7,0,0,Math.PI*2); ctx.stroke(); ctx.setLineDash([]); }\n  for(const d of G.drops) img('pickup_'+d.t,d.x,d.y+Math.sin(G.t*4+d.x)*3,0.5);")
s=s.replace('<div id="ver">v0.4.2</div>','<div id="ver">v0.4.3</div>')
open(p,"w",encoding="utf-8").write(s)
print("magnet patched")
