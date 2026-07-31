// Build stamp (v120.259). index.html compares every module's stamp against APP_VERSION and
// flags the version badge if any disagree. v120.256 only stamped ui.js and rules.js, so a
// stale data.js/net.js/iso-renderer.js would have passed the check silently -- a detector
// with holes in it is worse than none, because it reads as an all-clear.
const ISOR_BUILD='v120.275';
// Grimoire — standalone isometric battle-map renderer.
//
// Deliberately separate from index.html: this file owns ONLY "given a grid of terrain +
// elevation, paint it as a 2:1 diamond isometric scene." It knows nothing about D&D rules,
// monsters, players, or the DOM outside a single <canvas class="isocanvas"> element. index.html
// (mapGridHTML) just emits that canvas tag with data-cols/rows/rot/tiles/height/palette
// attributes; this file's own MutationObserver notices it and paints — no direct call needed.
//
// History (see AUDIT.md v117–v117.2 for the full account): the original DOM/CSS renderer used
// clip-path "riser" divs stacked via z-index for elevation, which repeatedly desynced (occlusion
// bugs, a stray +50 z-index offset). Moving to a <canvas> with a real painter's-algorithm depth
// sort fixed the stacking-context class of bug, but two geometry bugs followed: risers dropping
// to absolute ground instead of the real neighbour height (staircases overshot), then risers
// drawn on all 4 sides instead of the 2 this camera can actually see (back-faces double-drew
// every boundary). Both are fixed here from a clean rebuild, verified against a real headless
// Chromium render (tools/iso-preview.js) rather than a live-deploy screenshot round-trip.
(function(global){
'use strict';

// Projection constants: 2:1 diamond, tiles ISO_X*2 wide / ISO_Y*2 tall on screen; ISO_ELEV px
// of screen-Y per elevation level; ISO_PAD keeps the top of a raised/deep scene from clipping.
const ISO_X = 28, ISO_Y = 14, ISO_ELEV = 12, ISO_PAD = 90;

// Rotate a grid position by mapRotation (90° steps); rulings/derivation match index.html's copy
// (kept duplicated on purpose — 4 lines, not worth a cross-file dependency for this module).
function rotXY(x, y, cols, rows, rot){
  switch(rot){
    case 1: return [rows-1-y, x];
    case 2: return [cols-1-x, rows-1-y];
    case 3: return [y, cols-1-x];
    default: return [x, y];
  }
}

// Single source of truth for "where does tile (x,y) at this height land on screen" — used both
// by this file's own paint() and by index.html's hitbox/highlight positioning, so the two can
// never drift apart the way two independent copies of this formula could.
function tileScreenPos(x, y, height, cols, rows, rot){
  const rrows = (rot % 2 === 0) ? rows : cols;
  const offX = (rrows - 1) * ISO_X + 20;
  const [rx, ry] = rotXY(x, y, cols, rows, rot);
  return { cx: (rx - ry) * ISO_X + offX, cy: (rx + ry) * ISO_Y - height * ISO_ELEV + ISO_PAD };
}

function stageSize(cols, rows, rot){
  const rcols = (rot % 2 === 0) ? cols : rows, rrows = (rot % 2 === 0) ? rows : cols;
  return { w: (rcols - 1 + rrows - 1) * ISO_X + 80, h: (rcols - 1 + rrows - 1) * ISO_Y + 80 + ISO_PAD };
}

const TILE_IMG = {};
function tileImg(key){
  let im = TILE_IMG[key];
  if(im) return im;
  im = new Image();
  im.src = 'sprites/tiles/' + key + '.png';
  im.onload = () => { if(typeof render === 'function') try{ render(); }catch(e){} };
  TILE_IMG[key] = im;
  return im;
}

function isoDiamondPath(ctx, cx, cy){
  ctx.beginPath();
  ctx.moveTo(cx, cy - ISO_Y);
  ctx.lineTo(cx + ISO_X, cy);
  ctx.lineTo(cx, cy + ISO_Y);
  ctx.lineTo(cx - ISO_X, cy);
  ctx.closePath();
}

function isoTopFill(ctx, ter, palette){
  if(ter){
    const img = tileImg(ter);
    if(img.complete && img.naturalWidth) return ctx.createPattern(img, 'repeat');
  }
  return (ter && palette[ter]) || '#e2d0a6';
}

// Each tile draws its own top face, plus a step-wall on the two sides this fixed iso camera can
// ever actually see (toward increasing rx and increasing ry — "in front"), sized to the exact
// height difference to that neighbour. The other two directions never get a wall: that face
// always points away from the camera and is occluded by the tile's own top face regardless of
// terrain — a pit's "far interior wall" isn't a separate case either, it falls out of this same
// rule applied to whichever higher neighbour sits on the pit's far side.
function drawIsoTile(ctx, ter, cx, cy, walls, palette){
  const RIGHT = [cx + ISO_X, cy], BOTTOM = [cx, cy + ISO_Y], LEFT = [cx - ISO_X, cy];
  const quad = (a, b, drop, fill) => {
    ctx.beginPath();
    ctx.moveTo(a[0], a[1]);
    ctx.lineTo(b[0], b[1]);
    ctx.lineTo(b[0], b[1] + drop);
    ctx.lineTo(a[0], a[1] + drop);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
  };
  if(walls.l > 0) quad(LEFT, BOTTOM, walls.l * ISO_ELEV, 'rgba(28,20,13,.82)');   // toward (rx,ry+1)
  if(walls.r > 0) quad(RIGHT, BOTTOM, walls.r * ISO_ELEV, 'rgba(48,36,24,.72)');  // toward (rx+1,ry)
  isoDiamondPath(ctx, cx, cy);
  ctx.fillStyle = isoTopFill(ctx, ter, palette);
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(0,0,0,.22)';
  ctx.stroke();
}

function paint(canvas){
  const ds = canvas.dataset;
  const cols = +ds.cols, rows = +ds.rows, rot = +ds.rot;
  const tiles = JSON.parse(decodeURIComponent(ds.tiles || '%7B%7D'));
  const height = JSON.parse(decodeURIComponent(ds.height || '%7B%7D'));
  const palette = JSON.parse(decodeURIComponent(ds.palette || '%7B%7D'));
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Rotated-space height lookup so the neighbour comparisons below don't need an inverse rotation.
  const hAt = {};
  for(let y = 0; y < rows; y++) for(let x = 0; x < cols; x++){
    const [rx, ry] = rotXY(x, y, cols, rows, rot);
    hAt[rx + ',' + ry] = height[x + ',' + y] || 0;
  }
  const nb = (rx, ry) => { const k = rx + ',' + ry; return hAt.hasOwnProperty(k) ? hAt[k] : 0; };

  const items = [];
  for(let y = 0; y < rows; y++) for(let x = 0; x < cols; x++){
    const [rx, ry] = rotXY(x, y, cols, rows, rot), hgt = hAt[rx + ',' + ry];
    const { cx, cy } = tileScreenPos(x, y, hgt, cols, rows, rot);
    items.push({
      depth: (rx + ry) * 100 + hgt, ter: tiles[x + ',' + y], cx, cy,
      walls: { l: Math.max(0, hgt - nb(rx, ry + 1)), r: Math.max(0, hgt - nb(rx + 1, ry)) }
    });
  }
  items.sort((a, b) => a.depth - b.depth);
  for(const it of items) drawIsoTile(ctx, it.ter, it.cx, it.cy, it.walls, palette);
}

if(typeof MutationObserver !== 'undefined') new MutationObserver(() => {
  document.querySelectorAll('canvas.isocanvas:not([data-painted])').forEach(cv => {
    cv.dataset.painted = '1';
    paint(cv);
  });
}).observe(document.body, { childList: true, subtree: true });

global.IsoRenderer = { ISO_X, ISO_Y, ISO_ELEV, ISO_PAD, rotXY, tileScreenPos, stageSize, paint };

})(typeof window !== 'undefined' ? window : globalThis);
