p="index.html"; s=open(p,encoding="utf-8").read()
def rep(a,b,n=1):
    global s
    assert s.count(a)==n, (a[:70], s.count(a))
    s=s.replace(a,b)
# load the animated strips next to the stills (strip missing -> falls back to the still)
rep("...DIR8.map(d=>'boomer8_'+d)];", "...DIR8.map(d=>'boomer8_'+d), ...DIR8.map(d=>'b8_'+d)];")
rep("""function drawBoomer(){ const p=G.p; const im=SPR['boomer8_'+p.dir]; if(!im) return; const bob=Math.round(Math.sin(p.shake)*1);
  ctx.save(); if(p.hitcd>0.45) ctx.filter='brightness(2) sepia(1) hue-rotate(-50deg)'; else if(p.cap>0) ctx.filter=`hue-rotate(${(G.t*400)%360}deg)`;
  const w=BOOMER_W||im.width, h=Math.round(im.height*w/im.width); ctx.drawImage(im,Math.round(p.x-w/2),Math.round(p.y-h*0.85+bob),w,h); ctx.restore(); }""",
"""// Boomer: 8-frame LTX idle strip per direction (sprites/b8_<dir>.png, 128 px, built by animate.py / gen_loop.py);
// p.shake is the animation clock (faster when driving, fastest with blades up). Falls back to the 256 still.
function drawBoomer(){ const p=G.p; const strip=SPR['b8_'+p.dir], still=SPR['boomer8_'+p.dir];
  ctx.save(); if(p.hitcd>0.45) ctx.filter='brightness(2) sepia(1) hue-rotate(-50deg)'; else if(p.cap>0) ctx.filter=`hue-rotate(${(G.t*400)%360}deg)`;
  if(strip&&strip.width>=strip.height*8){ const fs=strip.height, f=Math.floor(p.shake*0.6)%8; ctx.drawImage(strip,f*fs,0,fs,fs,Math.round(p.x-fs/2),Math.round(p.y-fs*0.85),fs,fs); }
  else if(still){ const bob=Math.round(Math.sin(p.shake)*1); const w=BOOMER_W||still.width, h=Math.round(still.height*w/still.width); ctx.drawImage(still,Math.round(p.x-w/2),Math.round(p.y-h*0.85+bob),w,h); }
  ctx.restore(); }""")
# STATIC images that fail to load must not break startup
rep('<div id="ver">v0.6.3</div>','<div id="ver">v0.7.0</div>')
open(p,"w",encoding="utf-8").write(s); print("b8 anim patched")
