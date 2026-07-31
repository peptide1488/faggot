// iso-renderer.js test harness — run with: node iso-renderer-test.js
// Standalone (mirrors rules-test.js's style: stub just enough to load, T(name,cond) asserts) —
// scoped ONLY to the renderer's own geometry, not 5e rules. See CLAUDE.md / AUDIT.md v117-v118
// for why this file and iso-renderer.js exist separately from index.html/rules-test.js.
global.Image = class { constructor(){ this.complete=false; this.naturalWidth=0; } set src(v){} };
require('./iso-renderer.js');
const { ISO_ELEV, rotXY, paint } = IsoRenderer;

let fails=0;
function T(name,cond){ if(cond) console.log('  ok  '+name); else { fails++; console.log('FAIL  '+name); } }

function fakeCtx(){ let path=[]; const calls=[];
  return { calls, clearRect(){}, beginPath(){ path=[]; }, moveTo(x,y){ path.push([x,y]); }, lineTo(x,y){ path.push([x,y]); }, closePath(){},
    fill(){ calls.push({fillStyle:this._fillStyle, path}); }, stroke(){}, createPattern(){ return null; },
    set fillStyle(v){ this._fillStyle=v; }, get fillStyle(){ return this._fillStyle; } };
}
function fakeCanvas(cols,rows,rot,heights,tiles){
  return { width:2000, height:2000, dataset:{ cols:String(cols), rows:String(rows), rot:String(rot),
    tiles:encodeURIComponent(JSON.stringify(tiles||{})), height:encodeURIComponent(JSON.stringify(heights||{})),
    palette:encodeURIComponent('{}') } };
}

/* ---- regression: a staircase's walls must wall the exact 1-level step to each neighbour, not
   drop every elevated tile all the way to absolute ground (v117 shipped the latter — a 3-high
   tile's riser overshot 3 levels down regardless of what was actually next to it, cutting a
   disconnected dark wedge across the 2-high/1-high steps below it: "walls z-sorting is fucked"
   live report). Exercises the real paint()/drawIsoTile via a minimal recording fake 2D context
   so we measure the actual drawn wall height, not just re-derive the formula in the test. */
(function(){
  const cv=fakeCanvas(4,1,0,{'0,0':3,'1,0':2,'2,0':1,'3,0':0});
  const ctx=fakeCtx(); cv.getContext=()=>ctx;
  paint(cv);
  const wallFills=ctx.calls.filter(c=>c.fillStyle==='rgba(48,36,24,.72)');   // the "r" (toward rx+1) wall colour
  // path is [a, b, b+drop, a+drop] (see drawIsoTile's quad()) — path[2].y - path[1].y is the
  // drop itself, isolated from the diamond's own ISO_Y height baked into a/b.
  const drops=wallFills.map(c=>c.path[2][1]-c.path[1][1]);
  T('a staircase draws exactly one down-hill wall per step (3→2, 2→1, 1→0)', wallFills.length===3);
  T('each staircase step walls only its own 1-level drop (ISO_ELEV px), not the full absolute height', drops.every(d=>Math.abs(d-ISO_ELEV)<0.01));
})();

/* ---- regression: a solid mound (higher than every neighbour, e.g. the Open Field preset's
   3x3 pyramid hill) must draw ONLY its 2 camera-facing walls, never a wall on the other 2
   sides too (v117.1 shipped a "back-facing" wall whenever a tile was higher than its
   rx-1/ry-1 neighbour as well — double-drawing the same boundary from both this tile's
   spurious back wall and that neighbour's own legitimate front wall, producing the
   mismatched overlapping/gappy quads from the live report). There is no scenario where a
   back-facing wall is correct: that face always points away from this fixed iso camera and
   is occluded by the tile's own top face, regardless of neighbour heights — a pit's far
   interior wall isn't a special case either, it just falls out of the higher neighbour's own
   front wall pointing back into the hole. ---- */
(function(){
  // 3x3 block at height 1 with a height-2 peak in the middle (same shape as MAP_PRESETS' Open
  // Field hill), padded with a height-0 ring so no tile touches the map edge — isolates the
  // pyramid's own wall count from the separate (correct) "map edge defaults to 0" behaviour.
  const heights={}; for(let y=1;y<=3;y++) for(let x=1;x<=3;x++) heights[x+','+y]=1; heights['2,2']=2;
  const cv=fakeCanvas(5,5,0,heights);
  const ctx=fakeCtx(); cv.getContext=()=>ctx;
  paint(cv);
  const tops=ctx.calls.filter(c=>c.fillStyle==='#e2d0a6'), walls=ctx.calls.filter(c=>c.fillStyle!=='#e2d0a6');
  T('every one of the 25 tiles draws its top face exactly once', tops.length===25);
  // Hand-verified: the peak draws 2 (its own l+r), 3 ring tiles draw 1 each toward the
  // height-0 buffer, 1 ring corner tile draws 2 (both its sides border the buffer) = 8 total.
  T('the pyramid draws exactly 8 walls total — no back-facing duplicates', walls.length===8);
})();

/* ---- tileScreenPos is the single source of truth both index.html's hitbox positioning and
   this file's own paint() use — assert it's actually deterministic/symmetric under rotation,
   since a mismatch here would desync clicks from what's drawn. ---- */
(function(){
  const p0=IsoRenderer.tileScreenPos(0,0,0,4,4,0);
  T('tileScreenPos returns a plain {cx,cy}', typeof p0.cx==='number' && typeof p0.cy==='number');
  const rise=IsoRenderer.tileScreenPos(1,1,2,4,4,0), flat=IsoRenderer.tileScreenPos(1,1,0,4,4,0);
  T('raising a tile 2 levels lifts it on screen by exactly 2*ISO_ELEV', Math.abs((flat.cy-rise.cy)-2*ISO_ELEV)<0.01);
})();

/* ---- Tile sprite manifest (v120.279) ----
   Requesting a PNG that isn't there logged a 404 for every terrain kind without a sprite (pit,
   dirt, void, web, ...) on every map load. TILE_SPRITES gates the request; the palette colour
   already handled the drawing. This keeps the list honest in BOTH directions: a sprite added to
   the folder but not the list would silently never be drawn, which is the worse failure. ---- */
(function tileManifest(){
  const fs=require('fs'), path=require('path');
  const onDisk=fs.readdirSync(path.join(__dirname,'sprites','tiles'))
    .filter(f=>f.endsWith('.png')).map(f=>f.replace(/\.png$/,'')).sort();
  const src=fs.readFileSync(path.join(__dirname,'iso-renderer.js'),'utf8');
  const m=src.match(/const TILE_SPRITES = new Set\(\[([^\]]*)\]\)/);
  T('iso-renderer.js declares a TILE_SPRITES manifest', !!m);
  if(!m) return;
  const listed=m[1].split(',').map(x=>x.trim().replace(/^'|'$/g,'')).filter(Boolean).sort();
  const missing=onDisk.filter(f=>listed.indexOf(f)<0);      // on disk, never drawn
  const ghosts=listed.filter(f=>onDisk.indexOf(f)<0);       // listed, would 404
  T('every tile sprite on disk is listed (otherwise it is never drawn)'
    +(missing.length?' - NOT LISTED: '+missing.join(', '):''), missing.length===0);
  T('every listed tile sprite exists on disk (otherwise it 404s on every map load)'
    +(ghosts.length?' - MISSING FILE: '+ghosts.join(', '):''), ghosts.length===0);
  T('tileImg refuses to fetch a sprite that is not in the manifest',
    /if\(!TILE_SPRITES\.has\(key\)\) return null/.test(src));
})();

console.log(fails? ('\n'+fails+' FAILURE'+(fails>1?'S':'')) : '\nALL TESTS PASSED');
