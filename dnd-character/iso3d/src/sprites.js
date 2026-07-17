/**
 * Sprite sheet loader + 2D overlay draw.
 *
 * Resolution-agnostic: art is drawn to a *target on-screen height*, so a 32×32
 * A 48×64 frame and a 64×96 frame can share the same battlefield scale.
 * Swap packs by changing paths / SPRITE_PACK — not by rewriting the renderer.
 */

const cache = new Map(); // url → { img, ready, failed, w, h }

export const DIR_ORDER = ['down', 'left', 'right', 'up'];

/**
 * Global draw defaults. Per-unit overrides go on the unit spriteDef.
 * FFT-ish units often want targetFrameH 64–80 and pixelPerfect true.
 */
export const SPRITE_DRAW_DEFAULTS = {
  /** On-screen height (px) of one animation frame at default zoom. */
  targetFrameH: 56,
  /** Always nearest-neighbor (crisp pixel look). Bilinear softens tiles/sprites. */
  pixelPerfect: true,
  /** Cap so bosses don’t cover half the map (px). */
  maxFrameH: 96,
  /** Foot shadow under units. */
  shadow: true,
};

/**
 * Force nearest-neighbor sampling on a 2D canvas context.
 * (imageSmoothingEnabled=false ≈ GL NEAREST; true ≈ LINEAR/bilinear.)
 * @param {CanvasRenderingContext2D} ctx
 * @param {boolean} [nearest=true]
 */
export function setNearestNeighbor(ctx, nearest = true) {
  if (!ctx) return;
  const smooth = !nearest;
  ctx.imageSmoothingEnabled = smooth;
  // Vendor / quality knobs (ignored when smoothing is off)
  if ('imageSmoothingQuality' in ctx) ctx.imageSmoothingQuality = smooth ? 'high' : 'low';
  if ('mozImageSmoothingEnabled' in ctx) ctx.mozImageSmoothingEnabled = smooth;
  if ('webkitImageSmoothingEnabled' in ctx) ctx.webkitImageSmoothingEnabled = smooth;
  if ('msImageSmoothingEnabled' in ctx) ctx.msImageSmoothingEnabled = smooth;
}

/**
 * @param {string} url
 * @param {() => void} [onReady]
 */
/** Scan non-transparent pixels so billboards size to the ART, not empty padding. */
function alphaBBox(img) {
  try {
    const c = document.createElement('canvas');
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0);
    const { data, width, height } = ctx.getImageData(0, 0, c.width, c.height);
    let l = width, t = height, r = 0, b = 0, any = false;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (data[(y * width + x) * 4 + 3] > 12) {
          any = true;
          if (x < l) l = x;
          if (y < t) t = y;
          if (x > r) r = x;
          if (y > b) b = y;
        }
      }
    }
    if (!any) return null;
    return { l, t, r: r + 1, b: b + 1 };
  } catch (_) {
    return null;
  }
}

export function loadSprite(url, onReady) {
  if (!url) return null;
  let e = cache.get(url);
  if (e) {
    if (e.ready && onReady) onReady();
    return e;
  }
  e = { img: new Image(), ready: false, failed: false, w: 0, h: 0, content: null };
  cache.set(url, e);
  e.img.onload = () => {
    e.ready = true;
    e.w = e.img.naturalWidth;
    e.h = e.img.naturalHeight;
    e.content = alphaBBox(e.img);
    if (onReady) onReady();
  };
  e.img.onerror = () => {
    e.failed = true;
    e.ready = false;
    console.warn('[Iso3D] sprite failed to load', url);
  };
  e.img.crossOrigin = 'anonymous';
  e.img.src = url;
  return e;
}

/** Clear cache entry (e.g. after pack switch). */
export function clearSpriteCache() {
  cache.clear();
}

/**
 * UV rect (0..1) for one walk-sheet frame.
 * Sheet layout: rows = facing (dirOrder), cols = walk cycle frame.
 * @param {object} entry
 * @param {string} [facing]
 * @param {number} [frame]
 * @param {number|object} [colsOrOpts] cols number, or { cols, rows, dirOrder, flipX }
 * @param {number} [rows]
 * @returns {{ u0:number, v0:number, u1:number, v1:number, fw:number, fh:number }|null}
 */
export function getSpriteFrameUV(entry, facing = 'down', frame = 0, colsOrOpts, rows) {
  if (!entry || !entry.ready || entry.failed || !entry.w || !entry.h) return null;
  let cols;
  let dirOrder = DIR_ORDER;
  let flipX = false;
  if (colsOrOpts && typeof colsOrOpts === 'object') {
    cols = colsOrOpts.cols;
    rows = colsOrOpts.rows != null ? colsOrOpts.rows : rows;
    if (colsOrOpts.dirOrder) dirOrder = colsOrOpts.dirOrder;
    flipX = !!colsOrOpts.flipX;
  } else {
    cols = colsOrOpts;
  }
  const inferred = inferSheetGrid(entry.w, entry.h);
  const grid = {
    cols: cols || inferred.cols,
    rows: rows || inferred.rows,
  };
  const fw = entry.w / grid.cols;
  const fh = entry.h / grid.rows;
  let dir = dirOrder.indexOf(facing || 'down');
  if (dir < 0) dir = 0;
  const row = Math.min(grid.rows - 1, dir % grid.rows);
  const col = Math.max(0, Math.min(grid.cols - 1, frame | 0));
  // texImage2D without FLIP_Y: image top → v=0, image bottom → v=1
  // Billboard: aCorner.y=0 feet, y=1 head → feet sample higher v
  let u0 = col / grid.cols;
  let u1 = (col + 1) / grid.cols;
  if (flipX) {
    const t = u0;
    u0 = u1;
    u1 = t;
  }
  const vHead = row / grid.rows;
  const vFeet = (row + 1) / grid.rows;
  return {
    u0,
    v0: vFeet,
    u1,
    v1: vHead,
    fw,
    fh,
  };
}

/**
 * Full-image UV (decor billboards).
 * Uses alpha content box when available so transparent padding does NOT make
 * trees look like tiny saplings inside a tall empty billboard.
 */
export function getFullImageUV(entry) {
  if (!entry || !entry.ready || entry.failed) return null;
  const w = entry.w || 1;
  const h = entry.h || 1;
  const c = entry.content;
  if (c && c.r > c.l && c.b > c.t) {
    // texImage2D: image top → v=0. Billboard: aCorner.y=0 feet, y=1 head.
    // feet sample content bottom, head sample content top.
    return {
      u0: c.l / w,
      u1: c.r / w,
      v0: c.b / h, // feet
      v1: c.t / h, // head
      fw: c.r - c.l,
      fh: c.b - c.t,
    };
  }
  // feet = image bottom (v=1), head = image top (v=0)
  return { u0: 0, v0: 1, u1: 1, v1: 0, fw: w, fh: h };
}

/**
 * Infer walk-sheet grid from pixel size.
 * - Square sheet → 4×4 (standard walk grid)
 * - 2:1 width → 4×2
 * - Explicit cols/rows in layout always win
 */
export function inferSheetGrid(w, h) {
  if (!w || !h) return { cols: 4, rows: 4 };
  if (w === h) return { cols: 4, rows: 4 };
  if (w === 2 * h) return { cols: 4, rows: 2 };
  if (h === 2 * w) return { cols: 2, rows: 4 };
  const side = Math.min(w, h);
  if (w % side === 0 && h % side === 0) {
    return { cols: w / side, rows: h / side };
  }
  return { cols: 4, rows: 4 };
}

/**
 * @typedef {object} SpriteDrawOpts
 * @property {number} [cols]
 * @property {number} [rows]
 * @property {string[]} [dirOrder]
 * @property {number} [targetFrameH]  screen px height of one frame
 * @property {number} [maxFrameH]
 * @property {boolean} [pixelPerfect]
 * @property {number} [frame]         column index (walk cycle); default 0 idle
 * @property {number} [scale]         legacy multiplier applied after targetFrameH
 * @property {boolean} [shadow]
 */

/**
 * Draw one frame of a walk sheet; feet at (cx, cy).
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} entry - from loadSprite
 * @param {string} facing
 * @param {number} cx
 * @param {number} cy
 * @param {number|SpriteDrawOpts} [scaleOrOpts] - number = legacy scale, or opts bag
 * @param {{cols?:number, rows?:number}} [layout] - legacy 2nd form
 */
export function drawSpriteFrame(ctx, entry, facing, cx, cy, scaleOrOpts = 1.4, layout) {
  if (!entry || !entry.ready) return false;

  /** @type {SpriteDrawOpts} */
  let opts;
  if (typeof scaleOrOpts === 'number') {
    opts = { scale: scaleOrOpts, ...(layout || {}) };
  } else {
    opts = { ...(scaleOrOpts || {}), ...(layout || {}) };
  }

  const def = { ...SPRITE_DRAW_DEFAULTS, ...opts };
  const grid = {
    cols: opts.cols || (layout && layout.cols) || inferSheetGrid(entry.w, entry.h).cols,
    rows: opts.rows || (layout && layout.rows) || inferSheetGrid(entry.w, entry.h).rows,
  };
  const fw = entry.w / grid.cols;
  const fh = entry.h / grid.rows;

  const dirOrder = opts.dirOrder || DIR_ORDER;
  let dir = dirOrder.indexOf(facing || 'down');
  if (dir < 0) dir = 0;
  const row = Math.min(grid.rows - 1, dir % grid.rows);
  const col = Math.max(0, Math.min(grid.cols - 1, opts.frame | 0));

  // Resolution-independent size: same targetH for 16px or 64px source frames
  let targetH = def.targetFrameH != null ? def.targetFrameH : SPRITE_DRAW_DEFAULTS.targetFrameH;
  const maxH = def.maxFrameH != null ? def.maxFrameH : SPRITE_DRAW_DEFAULTS.maxFrameH;
  targetH = Math.min(targetH, maxH);
  let scale = targetH / Math.max(1, fh);
  if (opts.scale != null && opts.scale !== 1.4) {
    // explicit non-default legacy scale still multiplies
    scale *= opts.scale / 1.4;
  } else if (typeof scaleOrOpts === 'number' && Math.abs(scaleOrOpts - 1.4) > 0.01 && Math.abs(scaleOrOpts - 1.75) > 0.01) {
    scale *= scaleOrOpts / 1.4;
  }
  // Mild boost when using bare number 1.75 (legacy host default)
  if (typeof scaleOrOpts === 'number' && Math.abs(scaleOrOpts - 1.75) < 0.01) {
    scale = (targetH * 1.12) / Math.max(1, fh);
  }

  const dw = fw * scale;
  const dh = fh * scale;
  const dx = cx - dw / 2;
  const dy = cy - dh;

  if (def.shadow !== false && SPRITE_DRAW_DEFAULTS.shadow) {
    // Offset opposite the sun so ground blobs read directional light
    const sox = opts.shadowOffX != null ? opts.shadowOffX : 3;
    const soy = opts.shadowOffY != null ? opts.shadowOffY : 1;
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,.28)';
    ctx.beginPath();
    ctx.ellipse(
      cx + sox,
      cy - 2 + soy,
      Math.max(7, dw * 0.34),
      Math.max(3, 3.8),
      0,
      0,
      Math.PI * 2,
    );
    ctx.fill();
    ctx.restore();
  }

  // Default crisp; only bilinear if pixelPerfect is explicitly false
  setNearestNeighbor(ctx, def.pixelPerfect !== false);
  ctx.drawImage(entry.img, col * fw, row * fh, fw, fh, dx, dy, dw, dh);
  return true;
}

/**
 * Draw a full image as a ground-anchored billboard (decor / props).
 * Prefer opts.targetH (screen px) so size can track camera/tile scale.
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} entry
 * @param {number} cx
 * @param {number} cy
 * @param {number|object} [scaleOrOpts]
 */
export function drawBillboard(ctx, entry, cx, cy, scaleOrOpts = 1.4) {
  if (!entry || !entry.ready || entry.failed) return false;
  const opts = typeof scaleOrOpts === 'number' ? { scale: scaleOrOpts } : scaleOrOpts || {};
  let w;
  let h;
  if (opts.targetH != null && entry.h > 0) {
    const s = opts.targetH / entry.h;
    w = entry.w * s;
    h = opts.targetH;
  } else {
    const scale = opts.scale != null ? opts.scale : 1.4;
    const maxH = opts.maxH != null ? opts.maxH : 120;
    const dh = entry.h * scale;
    const s = dh > maxH ? maxH / entry.h : scale;
    w = entry.w * s;
    h = entry.h * s;
  }
  setNearestNeighbor(ctx, opts.pixelPerfect !== false);
  if (opts.shadow !== false) {
    const sox = opts.shadowOffX != null ? opts.shadowOffX : 4;
    const soy = opts.shadowOffY != null ? opts.shadowOffY : 2;
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,.26)';
    ctx.beginPath();
    ctx.ellipse(
      cx + sox,
      cy - 2 + soy,
      Math.max(8, w * 0.3),
      Math.max(3, w * 0.09),
      0,
      0,
      Math.PI * 2,
    );
    ctx.fill();
    ctx.restore();
  }
  ctx.drawImage(entry.img, cx - w / 2, cy - h, w, h);
  return true;
}

/**
 * Dead unit: matching creature sprite laid prone on the ground (walkable corpse).
 * No skull badge / ghost grayscale — keeps the monster's art readable.
 * @param {CanvasRenderingContext2D} ctx
 * @param {object|null} entry
 * @param {string} facing
 * @param {number} cx
 * @param {number} cy
 * @param {number} targetH screen height
 * @param {string} [label]
 */
export function drawCorpse(ctx, entry, facing, cx, cy, targetH = 40, label) {
  ctx.save();
  let drawn = false;
  if (entry && entry.ready && !entry.failed) {
    // Lie flat: rotate 90° and squash slightly; keep color, slight darken
    ctx.translate(cx, cy - 4);
    ctx.rotate(-Math.PI / 2);
    ctx.filter = 'brightness(0.82) saturate(0.75)';
    drawn = drawSpriteFrame(ctx, entry, facing || 'down', 0, 0, {
      targetFrameH: targetH * 0.95,
      maxFrameH: targetH * 1.1,
      pixelPerfect: true,
      shadow: false,
    });
    ctx.filter = 'none';
  }
  ctx.restore();
  if (!drawn) {
    // Simple body blob (fallback when sprite missing)
    ctx.save();
    ctx.fillStyle = 'rgba(90,60,50,.85)';
    ctx.beginPath();
    ctx.ellipse(cx, cy - 6, Math.max(14, targetH * 0.45), Math.max(8, targetH * 0.22), 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  return true;
}

/**
 * Fallback diamond / blob when sheet missing.
 */
export function drawFallbackToken(ctx, cx, cy, color, label) {
  ctx.save();
  ctx.fillStyle = color || '#4a8';
  ctx.beginPath();
  ctx.ellipse(cx, cy - 14, 12, 16, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,.45)';
  ctx.stroke();
  if (label) {
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(label[0] || '?', cx, cy - 10);
  }
  ctx.restore();
}

export function drawHpBar(ctx, cx, cy, hp, maxHp) {
  const w = 28;
  const h = 4;
  const pct = maxHp > 0 ? Math.max(0, Math.min(1, hp / maxHp)) : 0;
  const x = cx - w / 2;
  const y = cy - 4;
  ctx.fillStyle = 'rgba(0,0,0,.55)';
  ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
  ctx.fillStyle = pct > 0.5 ? '#3dbf5a' : pct > 0.25 ? '#d4b22a' : '#d44';
  ctx.fillRect(x, y, w * pct, h);
}
