p="index.html"; s=open(p,encoding="utf-8").read()
a=s.index("// ---------- ACTIVES"); b=s.index("// ---------- PASSIVES ----------")
ACT='''// ---------- ACTIVES: every weapon is a TYPE with unified stats, levels are stat deltas ----------
//  proj : dmg cd speed count size pierce bounces life   (+aim: nearest|random|facing|ring|boomerang)
//  orbit: dmg count radius spin size
//  zone : dmg(dps) cd count radius duration
//  cone : dmg cd range angle knock
//  aura : dmg(dps) radius
//  beam : dmg(dps) count length slow
//  passives: area -> size/radius/range/length, cdm -> cd, dmg -> dmg, extra -> count (proj/orbit/beam)
const ACTIVE = {
  blades:  {name:'MOWER BLADES', ico:'blade', type:'aura', lv:1, desc:'the deck shreds everything under it',
            base:{dmg:14,radius:60}, ups:[{dmg:1.3},{radius:1.2},{dmg:1.3},{radius:1.2},{bleed:1},{dmg:1.4},{radius:1.6,mulch:1}], maxName:'MULCH MODE'},
  beer:    {name:'BEER CAN',     ico:'proj_beer', type:'proj', lv:1, desc:'cans at the nearest enemies', ammo:'beer', aim:'nearest',
            base:{dmg:16,cd:1.1,speed:430,count:1,size:14,pierce:1,bounces:0,life:1.4}, ups:[{cd:0.75},{count:1},{pierce:1},{dmg:1.3},{count:1},{cd:0.75},{pierce:99,count:1}], maxName:'SIX PACK'},
  golf:    {name:'GOLF BALL',    ico:'proj_golfball', type:'proj', lv:0, desc:'balls that ricochet between enemies', ammo:'golf', aim:'random',
            base:{dmg:12,cd:1.6,speed:340,count:1,size:10,pierce:1,bounces:5,life:4}, ups:[{count:1},{bounces:3},{dmg:1.3},{count:1},{bounces:3},{cd:0.7},{boom:1}], maxName:'HOLE IN ONE'},
  whacker: {name:'WEED WHACKER', ico:'proj_weedwhacker', type:'orbit', lv:0, desc:'orbits the mower and shreds',
            base:{dmg:20,count:1,radius:100,spin:2.2,size:28}, ups:[{count:1},{dmg:1.3},{count:1},{radius:1.3},{dmg:1.3},{count:1},{count:2,spin:2}], maxName:'FULL SPIN'},
  flag:    {name:'FLAG POLE',    ico:'proj_flag', type:'proj', lv:0, desc:'flags fired the way you drive', ammo:'flag', aim:'facing',
            base:{dmg:22,cd:1.5,speed:540,count:1,size:16,pierce:3,bounces:0,life:1.6}, ups:[{count:1},{cd:0.75},{pierce:2},{count:1},{dmg:1.3},{cd:0.75},{back:1}], maxName:'OLD GLORY'},
  blower:  {name:'LEAF BLOWER',  ico:'blower', type:'cone', lv:0, desc:'a cone of wind ahead, knocks back',
            base:{dmg:10,cd:1.3,range:140,angle:0.5,knock:260}, ups:[{angle:1.3},{dmg:1.3},{range:1.4},{knock:1.5},{angle:1.3},{cd:0.6},{angle:4}], maxName:'HURRICANE'},
  sprinkler:{name:'SPRINKLER',   ico:'sprink', type:'beam', lv:0, desc:'rotating jets slow and soak enemies',
            base:{dmg:8,count:2,length:150,slow:0.45}, ups:[{count:1},{length:1.25},{slow:0.8},{count:1},{dmg:1.3},{length:1.25},{count:3,slow:0.6}], maxName:'FLOOD'},
  grill:   {name:'HOT GRILL',    ico:'prop_grill', type:'zone', lv:0, desc:'drops a grill that burns a patch',
            base:{dmg:14,cd:6,count:1,radius:50,duration:5}, ups:[{radius:1.3},{duration:1.6},{count:1},{dmg:1.3},{radius:1.3},{count:1},{boom:1}], maxName:'BACKYARD BBQ'},
  checks:  {name:'BOOMERANG CHECK', ico:'check', type:'proj', lv:0, desc:'a check that flies out and comes back', ammo:'check', aim:'boomerang',
            base:{dmg:18,cd:2.2,speed:380,count:1,size:16,pierce:99,bounces:0,life:3}, ups:[{count:1},{dmg:1.3},{life:1.4},{count:1},{cd:0.7},{dmg:1.3},{twice:1}], maxName:'BOUNCED CHECK'},
  dividend:{name:'DIVIDENDS',    ico:'coin', type:'proj', lv:0, desc:'coins burst out in every direction', ammo:'coin', aim:'ring',
            base:{dmg:9,cd:2.4,speed:300,count:6,size:9,pierce:1,bounces:0,life:1.1}, ups:[{count:4},{cd:0.75},{dmg:1.3},{count:4},{pierce:99},{cd:0.75},{cd:0.5}], maxName:'COMPOUND INTEREST'},
};
const STAT_LABEL={dmg:'damage',cd:'cooldown',speed:'speed',count:'projectiles',size:'size',pierce:'pierce',bounces:'bounces',life:'range',radius:'area',spin:'spin speed',range:'reach',angle:'cone',knock:'knockback',length:'jet length',slow:'slow',duration:'duration',bleed:'bleed on hit',mulch:'clippings hit',boom:'explodes',back:'fires backwards too',twice:'hits twice'};
const FLAGS=['bleed','mulch','boom','back','twice'];
function upText(w,i){ const u=w.ups[i]; const parts=[]; for(const [k,v] of Object.entries(u)){ const lab=STAT_LABEL[k]||k;
    if(FLAGS.includes(k)) parts.push(lab);
    else if(k==='count'||k==='pierce'||k==='bounces') parts.push(v>=99?'pierces everything':'+'+v+' '+lab);
    else if(k==='cd') parts.push('-'+Math.round((1-v)*100)+'% '+lab);
    else if(k==='slow') parts.push('slows harder');
    else parts.push('+'+Math.round((v-1)*100)+'% '+lab); }
  return (i===w.ups.length-1?'<span class="k">'+w.maxName+':</span> ':'')+parts.join(', '); }
// resolved stats for a weapon at its current level, passives applied
function wstat(k){ const w=ACTIVE[k], lv=G.a[k], S=st(); const o={...w.base};
  for(let i=0;i<lv-1;i++){ for(const [kk,v] of Object.entries(w.ups[i])){ if(['count','pierce','bounces'].includes(kk)) o[kk]=(o[kk]||0)+v; else if(FLAGS.includes(kk)) o[kk]=1; else o[kk]=(o[kk]||1)*v; } }
  for(const kk of ['size','radius','range','length']) if(o[kk]) o[kk]*=S.area;
  if(o.cd) o.cd*=S.cdm; o.dmg*=S.dmg; if(o.count&&w.type!=='zone') o.count+=S.extra; return o; }
'''
s=s[:a]+ACT+s[b:]
s=s.replace("Object.keys(ACTIVE).filter(k=>G.a[k]<ACTIVE[k].max&&(G.a[k]>0||nA<6))", "Object.keys(ACTIVE).filter(k=>G.a[k]<ACTIVE[k].ups.length+1&&(G.a[k]>0||nA<6))")
s=s.replace("const line=t==='a'?(l===w.max?'<span class=\"k\">MAX: </span>':'')+w.ups[l-1]:w.desc;", "const line=t==='a'?upText(w,Math.max(0,l-2)):w.desc;")
s=s.replace("<span style=\"color:#888\">lv ${l}/${w.max}</span>", "<span style=\"color:#888\">lv ${l}/${t==='a'?w.ups.length+1:w.max}</span>")
s=s.replace("for(let i=0;i<6;i++){ if(acts[i]) mk(A,acts[i],G.a[acts[i]],ACTIVE[acts[i]].max);", "for(let i=0;i<6;i++){ if(acts[i]) mk(A,acts[i],G.a[acts[i]],ACTIVE[acts[i]].ups.length+1);")
s=s.replace("function bladeRadius(){ const bl=G.a.blades; return (52+bl*6)*(bl>=8?2:1)*(1+0.2*((bl>=3)+(bl>=5)))*st().area; }", "function bladeRadius(){ return wstat('blades').radius; }")
s=s.replace("const bl=G.a.blades, bladeR=bladeRadius(), bladeDps=14*(1+0.3*((bl>=2)+(bl>=4)+(bl>=7)))*S.dmg;", "const bladeS=wstat('blades'), bladeR=bladeS.radius, bladeDps=bladeS.dmg;")
s=s.replace("if(G.a.blades>=6) e.bleed=Math.max(e.bleed,1.5);", "if(wstat('blades').bleed) e.bleed=Math.max(e.bleed,1.5);")
a=s.index("// ---------- weapons ----------"); b=s.index("// ---------- update ----------")
FW='''// ---------- weapons: one firing routine per TYPE ----------
const TRAIL={beer:'#ddd',golf:'#fff',flag:'#e33',check:'#9cf',coin:'#ffd700'}, SND={beer:'shoot',golf:'golf',flag:'flag',check:'check',coin:'coins'};
function shoot(k,o,x,y,ang,extra){ const w=ACTIVE[k]; G.bullets.push(Object.assign({t:w.ammo,x,y,vx:Math.cos(ang)*o.speed,vy:Math.sin(ang)*o.speed,dmg:o.dmg,life:o.life,pierce:o.pierce,bounce:o.bounces,rot:ang,r:o.size,hitset:new Set(),boom:!!o.boom,trail:TRAIL[w.ammo]},extra||{})); }
function fireWeapons(dt){
  const p=G.p, cd=G.cd; const tick=(k,base)=>{ cd[k]=(cd[k]||0)-dt; if(cd[k]<=0){ cd[k]=base; return true; } return false; };
  for(const k of Object.keys(ACTIVE)){ if(G.a[k]<=0) continue; const w=ACTIVE[k], o=wstat(k);
    if(w.type==='proj'){ if(!tick(k,o.cd)) continue;
      if(w.aim==='nearest'){ for(const e of nearest(o.count)) shoot(k,o,p.x,p.y-30,Math.atan2(e.y-p.y,e.x-p.x)); }
      else if(w.aim==='random'){ for(let i=0;i<o.count;i++) shoot(k,o,p.x,p.y,rnd(0,Math.PI*2)); }
      else if(w.aim==='facing'){ const f=facing(); const dirs=[f]; if(o.back) dirs.push([-f[0],-f[1]]); for(const d of dirs) for(let i=0;i<o.count;i++) shoot(k,o,p.x-d[0]*i*9,p.y-d[1]*i*9,Math.atan2(d[1],d[0])); }
      else if(w.aim==='ring'){ for(let i=0;i<o.count;i++) shoot(k,o,p.x,p.y-10,i/o.count*Math.PI*2+G.t); }
      else if(w.aim==='boomerang'){ for(let i=0;i<o.count;i++){ const e=nearest(3)[i]||nearest(1)[0]; const an=e?Math.atan2(e.y-p.y,e.x-p.x):rnd(0,Math.PI*2); shoot(k,o,p.x,p.y-20,an,{ret:o.life*0.4,twice:!!o.twice}); } }
      sfx(SND[w.ammo],0.35); }
    else if(w.type==='cone'){ if(!tick(k,o.cd)) continue; const f=facing(); const fa=Math.atan2(f[1],f[0]); sfx('blower',0.4);
      for(let i=0;i<18;i++){ const an=fa+rnd(-o.angle,o.angle), sp=rnd(200,420); G.fx.push({t:'p',x:p.x+f[0]*30,y:p.y+f[1]*20,vx:Math.cos(an)*sp,vy:Math.sin(an)*sp,life:0.35,max:0.35,col:'#cfe8d0',size:2}); }
      for(let i=G.enemies.length-1;i>=0;i--){ const e=G.enemies[i]; if(dist(e,p)<o.range){ const an=Math.atan2(e.y-p.y,e.x-p.x); if(angDiff(an,fa)<o.angle){ hurt(e,o.dmg,Math.cos(an)*o.knock,Math.sin(an)*o.knock); if(e.hp<=0) killEnemy(i); } } } }
    else if(w.type==='zone'){ if(!tick(k,o.cd)) continue; sfx('grill',0.4);
      for(let i=0;i<o.count;i++){ const e=nearest(3)[i]; const gx=e?e.x+rnd(-20,20):p.x+rnd(-100,100), gy=e?e.y+rnd(-20,20):p.y+rnd(-100,100); G.zones.push({t:'grill',x:gx,y:gy,r:o.radius,life:o.duration,dps:o.dmg,tick:0,boom:!!o.boom}); } }
    else if(w.type==='orbit'){ G.whackAng+=dt*o.spin; }
    else if(w.type==='beam'){ G.sprAng+=dt*3; } }
}
function whackers(){ if(G.a.whacker<=0) return []; const o=wstat('whacker'); return Array.from({length:o.count},(_,k)=>{ const an=G.whackAng+k*Math.PI*2/o.count; return {an,x:G.p.x+Math.cos(an)*o.radius,y:G.p.y+Math.sin(an)*o.radius,dmg:o.dmg,size:o.size}; }); }
function jets(){ if(G.a.sprinkler<=0) return []; const o=wstat('sprinkler'); return Array.from({length:o.count},(_,k)=>({an:G.sprAng+k*Math.PI*2/o.count,len:o.length,slow:o.slow,dmg:o.dmg})); }

'''
s=s[:a]+FW+s[b:]
s=s.replace("if(Math.hypot(e.x-w.x,e.y-w.y)<e.r+28){ e.hp-=w.dmg*S.dmg*dt*3;", "if(Math.hypot(e.x-w.x,e.y-w.y)<e.r+w.size){ e.hp-=w.dmg*dt*3;")
s=s.replace("e.slow=0.6; e.slowf=j.slow; e.hp-=j.dmg*S.dmg*dt*3;", "e.slow=0.6; e.slowf=j.slow; e.hp-=j.dmg*dt*3;")
s=s.replace('<div id="ver">v0.3.5</div>','<div id="ver">v0.4.0</div>')
s=s.replace("window.G_=()=>G; window.buildSlots=buildSlots;", "window.G_=()=>G; window.buildSlots=buildSlots; window.wstat=wstat;")
open(p,"w",encoding="utf-8").write(s)
print("patched", s.count("wstat("))
