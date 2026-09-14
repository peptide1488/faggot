p="index.html"; s=open(p,encoding="utf-8").read()
# LAWN CARE: bonuses from active (still-mowed) tiles and lifetime mowed tiles
s=s.replace("const st=()=>{ const t=turf(), pv=G.pv, a=G.a; return {",
"""// lawn care: ACTIVE mowed tiles (not regrown yet) buff damage and area, LIFETIME mowed tiles buff armor.
// HOA PRESIDENT passive multiplies both.
function lawn(){ const m=1+G.pv.hoa*0.5; const act=G.activeMowed||0, tot=G.mowedCount||0;
  return { dmg:Math.min(0.5,act/1000)*m, area:Math.min(0.3,act/2000)*m, armor:Math.min(0.3,tot/2500)*m, act, tot }; }
const st=()=>{ const t=turf(), pv=G.pv, a=G.a, L=lawn(); return {""")
s=s.replace("  area:1+pv.glasses*0.15,", "  area:(1+pv.glasses*0.15)*(1+L.area),")
s=s.replace("  dmg:(1+pv.truck*0.12)*(t?1.15+pv.truck*0.03+a.blades*0.01:1),", "  dmg:(1+pv.truck*0.12)*(t?1.15+pv.truck*0.03+a.blades*0.01:1)*(1+L.dmg),")
s=s.replace("  armor:Math.max(0.3,(1-pv.paper*0.1)*(t?0.85-pv.paper*0.03:1)),", "  armor:Math.max(0.25,(1-pv.paper*0.1)*(t?0.85-pv.paper*0.03:1)*(1-L.armor)),")
s=s.replace("  pension:{name:'PENSION',        ico:'pens', max:3, desc:'revive once per level with half HP'},",
            "  pension:{name:'PENSION',        ico:'pens', max:3, desc:'revive once per level with half HP'},\n  hoa:    {name:'HOA PRESIDENT',  ico:'hoa',  max:3, desc:'+50% lawn-care bonuses per level (active mowed tiles = damage + area, lifetime mowed = armor)'},")
s=s.replace("bifo:'&#8734;',luck:'&#9733;',pens:'&#9829;'};", "bifo:'&#8734;',luck:'&#9733;',pens:'&#9829;',hoa:'&#9820;'};")
# count active mowed tiles 4x a second
s=s.replace("  G.turf=isMowed(tx,ty); const S2=st();", "  G.lawnT=(G.lawnT||0)-dt; if(G.lawnT<=0){ G.lawnT=0.25; let n=0; for(const [k,t0] of G.mowed){ if(G.t-t0<REGROW) n++; else G.mowed.delete(k); } G.activeMowed=n; }\n  G.turf=isMowed(tx,ty); const S2=st();")
s=s.replace("MOWED ${G.mowedCount}<br>DPS", "MOWED ${G.mowedCount} (${G.activeMowed||0} live)<br>LAWN +${Math.round(lawn().dmg*100)}% dmg +${Math.round(lawn().area*100)}% area -${Math.round(lawn().armor*100)}% taken<br>DPS")
s=s.replace('<div id="ver">v0.4.3</div>','<div id="ver">v0.4.4</div>')
open(p,"w",encoding="utf-8").write(s)
print("lawn patched", s.count("lawn()"))
