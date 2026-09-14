p="index.html"; s=open(p,encoding="utf-8").read()
def rep(a,b,n=1):
    global s
    assert s.count(a)==n, (a[:70], s.count(a))
    s=s.replace(a,b)
rep("function vert(vx,vy){ const cx=Math.floor((vx*32-16)/64), cy=Math.floor((vy*32-16)/64); if(tileKind(cx,cy)!==1) return 'L'; return isMowed(cx,cy)?'L':'U'; }",
"""function vert(vx,vy){ const cx=Math.floor((vx*32-16)/64), cy=Math.floor((vy*32-16)/64); if(tileKind(cx,cy)!==1) return 'L'; return isMowed(cx,cy)?'L':'U'; }
function cellLU(cx,cy){ if(tileKind(cx,cy)!==1) return 'L'; return isMowed(cx,cy)?'L':'U'; }""")
old=s[s.index("  const W=SPR.wang_lawn;\n"):s.index("  for(const q of G.zones){")]
new="""  const W=SPR.wang_lawn, WP=W?W.height:32;
  if(WP===64){
    // 64 px Wang tiles sit on the half-cell grid: the tile centred on the corner shared by cells (tx,ty)..(tx+1,ty+1)
    // is keyed by those four cells' mowed state, so every logic tile gets 4x the edge detail of the old 32 set.
    for(let ty=ty0-1;ty<=ty1;ty++)for(let tx=tx0-1;tx<=tx1;tx++){ const a=cellLU(tx,ty),b=cellLU(tx+1,ty),c=cellLU(tx,ty+1),d=cellLU(tx+1,ty+1);
      if(tileKind(tx,ty)!==1&&tileKind(tx+1,ty)!==1&&tileKind(tx,ty+1)!==1&&tileKind(tx+1,ty+1)!==1) continue;
      const idx=WANG_KEYS.indexOf(a+b+c+d); ctx.drawImage(W,idx*64,0,64,64,tx*TILE+32,ty*TILE+32,64,64); }
    for(let ty=ty0;ty<=ty1;ty++)for(let tx=tx0;tx<=tx1;tx++){ const k=tileKind(tx,ty); if(k===1) continue; const nm=['tile_lawn','tile_lawn_long','tile_sidewalk','tile_driveway','tile_dirt'][k]; const im=SPR[nm]; if(im) ctx.drawImage(im,tx*TILE,ty*TILE,TILE,TILE); }
  } else
  for(let ty=ty0;ty<=ty1;ty++)for(let tx=tx0;tx<=tx1;tx++){ const k=tileKind(tx,ty);
    if(k===1){ if(!W) continue; for(let sy=0;sy<2;sy++)for(let sx=0;sx<2;sx++){ const vx=tx*2+sx, vy=ty*2+sy; const key=vert(vx,vy)+vert(vx+1,vy)+vert(vx,vy+1)+vert(vx+1,vy+1); const idx=WANG_KEYS.indexOf(key); ctx.drawImage(W,idx*32,0,32,32,tx*TILE+sx*32,ty*TILE+sy*32,32,32); } }
    else { const nm=['tile_lawn','tile_lawn_long','tile_sidewalk','tile_driveway','tile_dirt'][k]; const im=SPR[nm]; if(im) ctx.drawImage(im,tx*TILE,ty*TILE,TILE,TILE); } }
"""
s=s.replace(old,new)
rep('<div id="ver">v0.5.4</div>','<div id="ver">v0.5.5</div>')
open(p,"w",encoding="utf-8").write(s); print("wang64 draw patched")
