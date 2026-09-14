p="index.html"; s=open(p,encoding="utf-8").read()
old=s[s.index("const st=()=>({"):s.index("// ---------- world ----------")]
new='''// TURF: standing on grass you already mowed is home ground. Every bonus below has a base part
// and a part that scales with the matching passive/active, so builds feel it differently.
function turf(){ return G && G.turf ? 1 : 0; }
const st=()=>{ const t=turf(), pv=G.pv, a=G.a; return {
  area:1+pv.glasses*0.15,
  cdm:Math.max(0.4,(1-pv.monster*0.08)*(t?0.9-pv.monster*0.02:1)),
  dmg:(1+pv.truck*0.12)*(t?1.15+pv.truck*0.03+a.blades*0.01:1),
  armor:Math.max(0.3,(1-pv.paper*0.1)*(t?0.85-pv.paper*0.03:1)),
  regen:pv.socsec+(t?1+pv.socsec*0.5+pv.gut*0.5:0),
  xp:(1+pv.equity*0.15)*(t?1.1+pv.equity*0.05:1),
  speed:(1+pv.boots*0.1)*(t?1.1+pv.boots*0.02:1),
  eslow:t?0.85-a.sprinkler*0.02-pv.magnet*0.01:1,     // enemy speed while THEY stand on mowed grass
  extra:pv.bifocals, luck:1+pv.lucky*0.25 }; };
'''
s=s.replace(old,new)
# player turf state + regen from st()
s=s.replace("  p.hitcd=Math.max(0,p.hitcd-dt); p.cap=Math.max(0,p.cap-dt); G.camShake=Math.max(0,G.camShake-dt*20);\n  if(G.pv.socsec>0) p.hp=Math.min(p.maxhp,p.hp+G.pv.socsec*dt);",
            "  p.hitcd=Math.max(0,p.hitcd-dt); p.cap=Math.max(0,p.cap-dt); G.camShake=Math.max(0,G.camShake-dt*20);\n  G.turf=isMowed(tx,ty); const S2=st(); if(S2.regen>0) p.hp=Math.min(p.maxhp,p.hp+S2.regen*dt);")
# enemies slowed on mowed grass
s=s.replace("const an=Math.atan2(p.y-e.y,p.x-e.x); const sl=e.slow>0?e.slowf:1; e.slow=Math.max(0,e.slow-dt);",
            "const an=Math.atan2(p.y-e.y,p.x-e.x); let sl=e.slow>0?e.slowf:1; if(onMowed(e)) sl*=S.eslow; e.slow=Math.max(0,e.slow-dt);")
# HUD indicator
s=s.replace("document.getElementById('stats').innerHTML=`${fmt(G.t)}<br>KILLS ${G.kills}<br>MOWED ${G.mowedCount}`;",
            "document.getElementById('stats').innerHTML=`${fmt(G.t)}<br>KILLS ${G.kills}<br>MOWED ${G.mowedCount}<br><span style=\"color:${G.turf?'#8f4':'#777'}\">${G.turf?'HOME TURF':'TALL GRASS'}</span>`;")
# passive descriptions mention the turf part
s=s.replace("boots:  {name:'WORK BOOTS',     ico:'boot', max:5, desc:'+10% speed per level'}", "boots:  {name:'WORK BOOTS',     ico:'boot', max:5, desc:'+10% speed per level, more on mowed turf'}")
s=s.replace("gut:    {name:'BEER GUT',       ico:'gut',  max:5, desc:'+25 max HP per level, heals'}", "gut:    {name:'BEER GUT',       ico:'gut',  max:5, desc:'+25 max HP per level, heals; regen on mowed turf'}")
s=s.replace("magnet: {name:'401K MAGNET',    ico:'401k', max:5, desc:'+40% pickup radius per level'}", "magnet: {name:'401K MAGNET',    ico:'401k', max:5, desc:'+40% pickup radius per level; enemies slower on your turf'}")
s=s.replace("monster:{name:'MONSTER ENERGY', ico:'mnst', max:5, desc:'-8% cooldowns per level'}", "monster:{name:'MONSTER ENERGY', ico:'mnst', max:5, desc:'-8% cooldowns per level, faster still on mowed turf'}")
s=s.replace("paper:  {name:'NEWSPAPER',      ico:'news', max:5, desc:'-10% damage taken per level'}", "paper:  {name:'NEWSPAPER',      ico:'news', max:5, desc:'-10% damage taken per level, more on mowed turf'}")
s=s.replace("truck:  {name:'BIG TRUCK',      ico:'truck',max:5, desc:'+12% damage per level'}", "truck:  {name:'BIG TRUCK',      ico:'truck',max:5, desc:'+12% damage per level, more on mowed turf'}")
s=s.replace("equity: {name:'HOME EQUITY',    ico:'eqty', max:5, desc:'+15% XP per level'}", "equity: {name:'HOME EQUITY',    ico:'eqty', max:5, desc:'+15% XP per level, more on mowed turf'}")
s=s.replace("socsec: {name:'SOCIAL SECURITY',ico:'ss',   max:5, desc:'+1 HP/s regen per level'}", "socsec: {name:'SOCIAL SECURITY',ico:'ss',   max:5, desc:'+1 HP/s regen per level, +50% on mowed turf'}")
s=s.replace("<p>Weapons fire on their own. Pick upgrades when you level up.</p>", "<p>Weapons fire on their own. Pick upgrades when you level up.</p><p style=\"color:#8f4\">Mowed grass is HOME TURF: you hit harder, heal, cool down faster and take less; enemies on it are slower and take more.</p>")
s=s.replace('<div id="ver">v0.4.0</div>','<div id="ver">v0.4.1</div>')
open(p,"w",encoding="utf-8").write(s)
print("turf patched", s.count("turf"))
