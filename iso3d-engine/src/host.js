/**
 * Iso3DHost — presentation host for Grimoire (or any session-shaped data).
 * Units walk along pathfinded routes (no teleport snaps).
 */

import { Renderer } from './renderer.js?v=0.5.30';
import { transformMat4, gridToWorld, getCameraMatrix } from './math.js?v=0.5.30';
import {
  grimoireSessionToView,
  rotationToYaw,
  makeDemoGrimoireSession,
  grimoireMapToIso,
} from './adapter.js?v=0.5.30';
import {
  loadSprite,
  drawSpriteFrame,
  drawBillboard,
  drawFallbackToken,
  drawHpBar,
  drawCorpse,
  setNearestNeighbor,
  getSpriteFrameUV,
  getFullImageUV,
} from './sprites.js?v=0.5.30';
import {
  createFxState,
  spawnFloater,
  spawnProjectile,
  fxFromGameEvent,
  drawFx,
  colorForDtype,
} from './fx.js?v=0.5.30';
import { findPath, facingFromStep } from './pathfinding.js?v=0.5.30';
import { APP_VERSION } from './version.js?v=0.5.30';

export {
  makeDemoGrimoireSession,
  grimoireSessionToView,
  grimoireMapToIso,
};
export { APP_VERSION, findPath };

export class Iso3DHost {
  /**
   * @param {HTMLElement} container
   * @param {{ assetBase?: string, className?: string }} [opts]
   */
  constructor(container, opts = {}) {
    this.assetBase = opts.assetBase || '';
    this.onTileClick = null;
    this.onUnitClick = null;
    this._firstSession = true;
    this._fx = createFxState();
    /** @type {Map<string, { path:{x:number,y:number}[], t0:number, ms:number, done?:Function }>} */
    this._anims = new Map();
    /** @type {Map<string, { col:number, row:number }>} */
    this._lastPos = new Map();

    this.glCanvas = document.createElement('canvas');
    this.glCanvas.className = opts.className || 'iso3d-gl';
    this.glCanvas.style.cssText =
      'position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none;cursor:crosshair;image-rendering:pixelated;image-rendering:crisp-edges;';

    this.overlay = document.createElement('canvas');
    this.overlay.className = 'iso3d-overlay';
    this.overlay.style.cssText =
      'position:absolute;inset:0;width:100%;height:100%;display:block;pointer-events:none;image-rendering:pixelated;image-rendering:crisp-edges;';

    this.renderer = new Renderer(this.glCanvas, { assetBase: this.assetBase });
    // desynchronized can reduce lag; alpha for transparent sprite overlay
    this.overlayCtx = this.overlay.getContext('2d', { alpha: true });
    setNearestNeighbor(this.overlayCtx, true);

    this._session = null;
    this._view = null;
    this._highlightOpts = null;
    /** @type {Record<string, {cover?:number, adv?:number, sneak?:boolean}>|null} */
    this._targetInfo = null;
    /** @type {Set<string>|null} valid attack target ids while targeting */
    this._targetIds = null;
    this._hoverBlast = null;
    this._shadowOff = { x: 3, y: 1 };
    this._camAlong = { x: Math.SQRT1_2, z: Math.SQRT1_2 };
    this._mapRot = 0;
    this._running = false;
    this._raf = 0;
    this._drag = null;
    this._hover = null;
    this._mvpCache = null;
    this._wh = { w: 0, h: 0 };

    this.attach(container);

    this._onDown = (e) => this._handleDown(e);
    this._onUp = (e) => this._handleUp(e);
    this._onMove = (e) => this._handleMove(e);
    this.glCanvas.addEventListener('mousedown', this._onDown);
    window.addEventListener('mouseup', this._onUp);
    window.addEventListener('mousemove', this._onMove);
    this.glCanvas.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        const cam = this.renderer.getCamera();
        this.renderer.setCamera({
          zoom: cam.zoom + (e.deltaY > 0 ? -0.08 : 0.08),
        });
      },
      { passive: false },
    );

    this.start();
  }

  get version() {
    return APP_VERSION;
  }

  attach(container) {
    if (!container) return;
    this.container = container;
    container.style.position = container.style.position || 'relative';
    container.style.overflow = 'hidden';
    if (this.glCanvas.parentElement !== container) {
      container.appendChild(this.glCanvas);
    }
    if (this.overlay.parentElement !== container) {
      container.appendChild(this.overlay);
    }
  }

  /**
   * @param {object} session
   * @param {{ highlights?: object, resetCamera?: boolean, skipAutoPath?: boolean }} [opts]
   */
  setSession(session, opts = {}) {
    this._session = session;
    if (opts.highlights !== undefined) this._highlightOpts = opts.highlights;
    this._view = grimoireSessionToView(session, {
      assetBase: this.assetBase,
      highlights: this._highlightOpts || undefined,
    });
    for (const u of this._view.units) {
      if (u.spriteUrl) loadSprite(u.spriteUrl);
    }
    for (const d of this._view.decorSprites || []) {
      if (d.spriteUrl) loadSprite(d.spriteUrl);
    }

    // Auto-path when a unit's grid cell jumps (unless already animating)
    if (!opts.skipAutoPath && this._view.map) {
      for (const u of this._view.units) {
        if (!u.alive) continue;
        if (this._anims.has(u.id)) continue; // visual walk in progress
        const prev = this._lastPos.get(u.id);
        if (
          prev &&
          (prev.col !== u.col || prev.row !== u.row)
        ) {
          const dist = Math.max(
            Math.abs(prev.col - u.col),
            Math.abs(prev.row - u.row),
          );
          if (dist >= 1) {
            const walked = this._startWalk(u.id, prev.col, prev.row, u.col, u.row, {
              ms: 105,
            });
            if (!walked) {
              // no path (teleport spell / place) — snap
              this._lastPos.set(u.id, { col: u.col, row: u.row });
            }
            continue;
          }
        }
        this._lastPos.set(u.id, { col: u.col, row: u.row });
      }
      const live = new Set(this._view.units.map((u) => u.id));
      for (const id of [...this._lastPos.keys()]) {
        if (!live.has(id)) {
          this._lastPos.delete(id);
          this._anims.delete(id);
        }
      }
    } else {
      for (const u of this._view.units) {
        if (!this._anims.has(u.id)) {
          this._lastPos.set(u.id, { col: u.col, row: u.row });
        }
      }
    }

    this.renderer.setMap(this._view.map);
    this.renderer.setUnits([]);
    this._applyHighlights();
    if (opts.resetCamera || this._firstSession) {
      this.centerOnMap();
      this._firstSession = false;
    }
  }

  /**
   * Play a walk along an explicit path (from Grimoire pathTo).
   * path steps are destinations after each step; include start as first element.
   * @param {string} unitId
   * @param {{x:number,y:number}[]} path
   * @param {{ msPerStep?: number, onDone?: Function }} [opts]
   */
  animatePath(unitId, path, opts = {}) {
    if (!unitId || !path || path.length < 2) {
      if (opts.onDone) opts.onDone();
      return;
    }
    const ms = opts.msPerStep != null ? opts.msPerStep : 110;
    this._anims.set(unitId, {
      path: path.map((p) => ({ x: p.x, y: p.y })),
      t0: performance.now(),
      ms,
      done: opts.onDone,
    });
    // lastPos stays at walk start until anim completes (avoids reverse auto-path)
  }

  /**
   * Pathfind + walk from A to B on current map.
   */
  walkTo(unitId, fromCol, fromRow, toCol, toRow, opts = {}) {
    this._startWalk(unitId, fromCol, fromRow, toCol, toRow, {
      ms: opts.msPerStep || 110,
      onDone: opts.onDone,
      fly: opts.fly,
    });
  }

  _startWalk(unitId, fromCol, fromRow, toCol, toRow, opts = {}) {
    if (!this._view?.map) return false;
    if (fromCol === toCol && fromRow === toRow) return false;

    const blocked = (c, r) => {
      // block other living units (except destination)
      if (c === toCol && r === toRow) return false;
      return this._view.units.some(
        (u) =>
          u.alive !== false &&
          u.id !== unitId &&
          !this._anims.has(u.id) &&
          u.col === c &&
          u.row === r,
      );
    };

    const path = findPath(
      this._view.map,
      fromCol,
      fromRow,
      toCol,
      toRow,
      {
        maxCost: opts.maxCost != null ? opts.maxCost : 200,
        fly: opts.fly,
        blocked,
      },
    );

    if (!path || path.length < 2) {
      // unreachable — snap (teleport only as last resort, e.g. void placement)
      this._lastPos.set(unitId, { col: toCol, row: toRow });
      return false;
    }

    this._anims.set(unitId, {
      path,
      t0: performance.now(),
      ms: opts.ms != null ? opts.ms : 105,
      done: opts.onDone,
    });
    return true;
  }

  /**
   * Visual sample of unit position (grid, possibly fractional while walking).
   * @returns {{ col:number, row:number, facing:string } | null}
   */
  _visualPose(u) {
    const anim = this._anims.get(u.id);
    if (!anim) {
      return { col: u.col, row: u.row, facing: u.facing || 'down' };
    }
    const now = performance.now();
    const elapsed = now - anim.t0;
    const segs = anim.path.length - 1;
    const total = segs * anim.ms;
    if (elapsed >= total) {
      const last = anim.path[anim.path.length - 1];
      const done = anim.done;
      this._anims.delete(u.id);
      this._lastPos.set(u.id, { col: last.x, row: last.y });
      // sync view unit cell
      u.col = last.x;
      u.row = last.y;
      if (done) {
        try {
          done();
        } catch (e) {
          /* ignore */
        }
      }
      return { col: last.x, row: last.y, facing: u.facing || 'down' };
    }
    const t = elapsed / anim.ms;
    const seg = Math.min(segs - 1, Math.floor(t));
    const frac = t - seg;
    const a = anim.path[seg];
    const b = anim.path[seg + 1];
    const col = a.x + (b.x - a.x) * frac;
    const row = a.y + (b.y - a.y) * frac;
    const face = facingFromStep(b.x - a.x, b.y - a.y) || u.facing || 'down';
    u.facing = face;
    return { col, row, facing: face };
  }

  _applyHighlights() {
    if (!this._view) return;
    const hl = this._view.highlights || {};
    // Mesh blast: locked center, or preview only if that tile is a valid cast center
    let meshBlast = hl.blast || null;
    if (!hl.blastLocked && hl.aoeR != null && !meshBlast) {
      const prev = hl.aoePreview;
      const range = hl.attackRange;
      if (
        prev &&
        range &&
        range.has(`${prev.col|0},${prev.row|0}`)
      ) {
        meshBlast = this._blastTilesAround(prev.col, prev.row, hl.aoeR);
      }
    }
    // Live cursor blast for overlay only (valid centers only)
    this._updateHoverBlast(hl);

    this.renderer.setHighlights({
      move: hl.move || null,
      dash: hl.dash || null,
      jump: hl.jump || null,
      climb: hl.climb || null,
      attackRange: hl.attackRange || null,
      attackRangeMax: hl.attackRangeMax || null,
      blast: meshBlast,
      attack: hl.attack || null,
      selected: hl.selected || null,
      hover: this._hover,
      activeUnitId: this._view.activeId || null,
    });
    // Keep target badges (ADV/DIS/cover) on the view for overlay draw
    this._targetInfo = hl.targetInfo || null;
    this._targetIds = hl.targetIds || null;
    // Mirror onto _highlightOpts so overlay rings see the same sets as the mesh
    this._highlightOpts = {
      ...(this._highlightOpts || {}),
      move: hl.move || null,
      dash: hl.dash || null,
      jump: hl.jump || null,
      climb: hl.climb || null,
      attackRange: hl.attackRange || null,
      attackRangeMax: hl.attackRangeMax || null,
      blast: meshBlast,
      aoeR: hl.aoeR != null ? hl.aoeR : null,
      blastLocked: !!hl.blastLocked,
      aoePreview: hl.aoePreview || null,
      attack: hl.attack || null,
      targetIds: hl.targetIds || null,
      targetInfo: hl.targetInfo || null,
    };
  }

  /**
   * Orange AoE ring follows cursor only when the tile is a valid cast center
   * (bright cyan / attackRange). Illegal tiles show no blast so overlay matches clicks.
   */
  _updateHoverBlast(hl) {
    hl = hl || this._view?.highlights || this._highlightOpts || {};
    this._hoverBlast = null;
    if (hl.blastLocked) return;
    if (hl.aoeR == null) return;
    const prev = this._hover || hl.aoePreview;
    if (!prev) return;
    const bc = prev.col != null ? prev.col : prev.x;
    const br = prev.row != null ? prev.row : prev.y;
    if (bc == null || br == null) return;
    // Only legal centers (same set as bright cyan rangeTiles)
    const range = hl.attackRange || this._view?.highlights?.attackRange;
    if (range && range.size && !range.has(`${bc|0},${br|0}`)) return;
    this._hoverBlast = this._blastTilesAround(bc, br, hl.aoeR);
  }

  /** Match Grimoire inBlast: Chebyshev for r≤1, Euclidean circle otherwise. */
  _blastTilesAround(cx, cy, r) {
    const map = this._view?.map;
    const set = new Set();
    if (!map || r == null || cx == null || cy == null) return set;
    for (let col = 0; col < map.cols; col++) {
      for (let row = 0; row < map.rows; row++) {
        let ok;
        if (r <= 1) ok = Math.max(Math.abs(col - cx), Math.abs(row - cy)) <= r;
        else ok = Math.hypot(col - cx, row - cy) <= r + 0.0001;
        if (ok) set.add(`${col},${row}`);
      }
    }
    return set;
  }

  /** True if unit is a valid attack/spell target under current highlights. */
  _isTargetUnit(u) {
    if (!u || u.alive === false) return false;
    const ids = this._targetIds || this._view?.highlights?.targetIds;
    if (ids && ids.size) {
      const rawId = u.raw?.id != null ? String(u.raw.id) : null;
      if (rawId && ids.has(rawId)) return true;
      if (ids.has(u.id) || ids.has(String(u.id))) return true;
      // also accept "m:id" / bare id forms
      if (rawId && ids.has(`m:${rawId}`)) return true;
    }
    // Fallback: living enemy standing on a range tile
    const range = this._view?.highlights?.attackRange || this._highlightOpts?.attackRange;
    if (range && range.has(`${u.col|0},${u.row|0}`) && u.team === 'enemy') return true;
    return false;
  }

  /** True while attack/spell range overlay is active. */
  _isTargetingMode() {
    const hl = this._view?.highlights || this._highlightOpts || {};
    return !!(hl.attackRange || hl.blast || (hl.targetIds && hl.targetIds.size));
  }

  setMapRotation(rot) {
    this._mapRot = ((rot % 4) + 4) % 4;
    this.renderer.setCamera({ rot: rotationToYaw(this._mapRot) });
  }

  rotate(steps = 1) {
    this.setMapRotation(this._mapRot + steps);
  }

  setHighlights(highlights) {
    this._highlightOpts = highlights;
    if (this._session) this.setSession(this._session, { highlights });
  }

  handleGameEvent(ev) {
    // Movement: prefer explicit path; skip if already walking (animateToken drives Iso3D directly)
    if (ev && ev.type === 'move' && ev.unitId && this._anims.has(ev.unitId)) {
      return;
    }
    if (ev && ev.type === 'move' && ev.path && ev.path.length >= 2 && ev.unitId) {
      this.animatePath(ev.unitId, ev.path.map((p) => ({ x: p.x, y: p.y })), {
        msPerStep: ev.stepMs || 110,
      });
      return;
    }
    if (ev && ev.type === 'move' && ev.to && ev.from && ev.unitId) {
      this.walkTo(ev.unitId, ev.from.x, ev.from.y, ev.to.x, ev.to.y, {
        msPerStep: ev.stepMs || 110,
        fly: ev.fly,
      });
      return;
    }
    fxFromGameEvent(this._fx, ev);
  }

  floatText(col, row, text, color) {
    spawnFloater(this._fx, col, row, text, color);
  }

  shoot(c0, r0, c1, r1, dtype) {
    spawnProjectile(
      this._fx,
      c0,
      r0,
      c1,
      r1,
      'bolt',
      colorForDtype(dtype),
    );
  }

  start() {
    if (this._running) return;
    this._running = true;
    const loop = () => {
      if (!this._running) return;
      try {
        this._frame();
      } catch (err) {
        console.error('[Iso3DHost]', err);
      }
      this._raf = requestAnimationFrame(loop);
    };
    this._raf = requestAnimationFrame(loop);
  }

  stop() {
    this._running = false;
    if (this._raf) cancelAnimationFrame(this._raf);
  }

  destroy() {
    this.stop();
    this.glCanvas.removeEventListener('mousedown', this._onDown);
    window.removeEventListener('mouseup', this._onUp);
    window.removeEventListener('mousemove', this._onMove);
    this.glCanvas.remove();
    this.overlay.remove();
  }

  centerOnMap() {
    this.renderer.setCamera({ panX: 0, panY: 0, zoom: 1.0 });
  }

  _syncSize() {
    const w = this.container?.clientWidth || 800;
    const h = this.container?.clientHeight || 600;
    if (this.overlay.width !== w || this.overlay.height !== h) {
      this.overlay.width = w;
      this.overlay.height = h;
    }
    this._wh = { w, h };
    return this._wh;
  }

  _tileScreen(col, row) {
    if (!this._view || !this._mvpCache) return null;
    const map = this._view.map;
    // allow fractional for animation
    const c0 = Math.max(0, Math.min(map.cols - 1, Math.floor(col)));
    const r0 = Math.max(0, Math.min(map.rows - 1, Math.floor(row)));
    const c1 = Math.max(0, Math.min(map.cols - 1, Math.ceil(col)));
    const r1 = Math.max(0, Math.min(map.rows - 1, Math.ceil(row)));
    const hA = map.cells[r0 * map.cols + c0]?.h ?? 0;
    const hB = map.cells[r1 * map.cols + c1]?.h ?? 0;
    const fc = col - Math.floor(col);
    const fr = row - Math.floor(row);
    const hMix = hA + (hB - hA) * Math.max(fc, fr);
    const y = hMix * 0.5 + 0.35;
    const { x, z } = gridToWorld(col, row, map.cols, map.rows);
    return this._project(this._mvpCache, x, y, z, this._wh.w, this._wh.h);
  }

  /**
   * Screen pixels for one tile width at current camera — locks billboards to world scale
   * (so zoom in/out keeps trees & units the same size relative to the ground).
   */
  _tilePx(mvp, w, h) {
    if (!this._view?.map) return 48;
    const { cols, rows } = this._view.map;
    const a = gridToWorld(0, 0, cols, rows);
    const b = gridToWorld(1, 0, cols, rows);
    const pa = this._project(mvp, a.x, 0, a.z, w, h);
    const pb = this._project(mvp, b.x, 0, b.z, w, h);
    if (!pa || !pb) return 48;
    const d = Math.hypot(pb.x - pa.x, pb.y - pa.y);
    return Math.max(18, Math.min(120, d || 48));
  }

  _frame() {
    const { w, h } = this._syncSize();
    this.renderer.draw();

    const ctx = this.overlayCtx;
    ctx.clearRect(0, 0, w, h);
    // Re-assert each frame — some browsers reset smoothing after transforms/filters
    setNearestNeighbor(ctx, true);
    if (!this._view) return;

    const aspect = w / Math.max(1, h);
    const cam = this.renderer.getCamera();
    const { matrix: mvp, eye, target } = getCameraMatrix(
      cam.rot,
      cam.zoom,
      cam.panX,
      cam.panY,
      aspect,
    );
    this._mvpCache = mvp;
    const tilePx = this._tilePx(mvp, w, h);

    // Soft shadow offset from world sun (matches terrain key light)
    const sun = this.renderer.sunDir || [0.62, 0.72, 0.32];
    // Project a tiny ground step toward -sun.xz into screen delta
    const origin = this._project(mvp, 0, 0, 0, w, h);
    const sunShadow = this._project(mvp, -sun[0] * 0.35, 0, -sun[2] * 0.35, w, h);
    const shadowOffX = origin && sunShadow ? (sunShadow.x - origin.x) : 3;
    const shadowOffY = origin && sunShadow ? (sunShadow.y - origin.y) : 1;
    this._shadowOff = { x: shadowOffX, y: shadowOffY };

    // Camera-projected range/move rings (DOM .mcell outlines don't follow free pan/zoom)
    this._drawTileHighlights(ctx, mvp, w, h);

    // Mesh uses STEP = 0.5 world units per elevation level — must match planting height.
    const STEP = 0.5;
    const alongX = Math.sin(cam.rot);
    const alongZ = Math.cos(cam.rot);
    this._camAlong = { x: alongX, z: alongZ };

    // Build depth-tested WebGL billboards (sprites) + 2D UI (bars/rings)
    // Terrain is already drawn with depth; billboards sample that depth so walls occlude them.
    const glBillboards = [];
    const uiItems = [];

    for (const d of this._view.decorSprites || []) {
      const cell =
        this._view.map.cells[
          Math.max(0, Math.min(this._view.map.rows - 1, d.row | 0)) *
            this._view.map.cols +
            Math.max(0, Math.min(this._view.map.cols - 1, d.col | 0))
        ];
      const elev = cell?.h ?? 0;
      const isTree = (d.kind || '').includes('tree');
      const isBush = (d.kind || '').includes('bush');
      // Trees plant slightly into the ground so trunks don't float
      const y = elev * STEP + (isTree ? -0.02 : isBush ? -0.01 : 0);
      const { x, z } = gridToWorld(
        d.col,
        d.row,
        this._view.map.cols,
        this._view.map.rows,
      );
      const scr = this._project(mvp, x, y, z, w, h);
      if (!scr) continue;
      const entry = d.spriteUrl ? loadSprite(d.spriteUrl) : null;
      const worldH = isTree ? 2.5 : isBush ? 1.05 : 1.0;
      const uv = entry && entry.ready ? getFullImageUV(entry) : null;
      const aspect = uv && uv.fh ? uv.fw / uv.fh : 0.55;
      if (entry && entry.ready && uv) {
        glBillboards.push({
          img: entry.img,
          origin: [x, y, z],
          width: worldH * aspect,
          height: worldH,
          u0: uv.u0,
          v0: uv.v0,
          u1: uv.u1,
          v1: uv.v1,
          depth: this._depthKey(d.col, d.row, elev, 0, scr.y),
          alpha: 1,
        });
      }
      // Soft ground shadow on overlay (under feet)
      uiItems.push({ kind: 'shadow', scr, r: Math.max(8, tilePx * 0.28) });
    }

    for (const u of this._view.units) {
      const pose =
        u.alive === false
          ? { col: u.col, row: u.row, facing: u.facing || 'down' }
          : this._visualPose(u);
      const cellCol = Math.round(pose.col);
      const cellRow = Math.round(pose.row);
      const cell =
        this._view.map.cells[
          Math.max(0, Math.min(this._view.map.rows - 1, cellRow)) *
            this._view.map.cols +
            Math.max(0, Math.min(this._view.map.cols - 1, cellCol))
        ];
      const elev = cell?.h ?? 0;
      // Slight lift so feet clear the top face (avoids z-fight with terrain)
      const y = elev * STEP + (u.alive === false ? 0.005 : 0.03);
      const { x, z } = gridToWorld(
        pose.col,
        pose.row,
        this._view.map.cols,
        this._view.map.rows,
      );
      const scr = this._project(mvp, x, y, z, w, h);
      if (!scr) continue;
      const layer = u.alive === false ? 1 : 2;
      const depth = this._depthKey(pose.col, pose.row, elev, layer, scr.y);
      const entry = u.spriteUrl ? loadSprite(u.spriteUrl) : null;
      const worldH = u.alive === false ? 1.05 : 1.35;
      let pushed = false;
      if (entry && entry.ready && !entry.failed) {
        const cols = u.spriteDraw?.cols;
        const rows = u.spriteDraw?.rows;
        const uv = getSpriteFrameUV(
          entry,
          pose.facing || u.facing,
          0,
          cols,
          rows,
        );
        if (uv) {
          const aspect = uv.fw / Math.max(1, uv.fh);
          glBillboards.push({
            img: entry.img,
            origin: [x, y, z],
            width: worldH * aspect,
            height: worldH,
            u0: uv.u0,
            v0: uv.v0,
            u1: uv.u1,
            v1: uv.v1,
            gray: u.alive === false,
            alpha: u.alive === false ? 0.75 : 1,
            depth,
          });
          pushed = true;
        }
      }
      uiItems.push({
        kind: 'unitUi',
        u,
        scr,
        pose,
        corpse: u.alive === false,
        fallback: !pushed,
        depth,
      });
    }

    // Feed WebGL billboards (drawn inside renderer.draw with depth test)
    // Must set BEFORE draw — so reorder: set billboards then re-draw is wrong.
    // We already called renderer.draw() above. Call billboard pass now.
    this.renderer.setBillboards(glBillboards);
    // Second pass: billboards only (terrain already in buffer)
    if (glBillboards.length && this.renderer._drawBillboardsGL) {
      const right = this.renderer._camRight || [1, 0, 0];
      this.renderer._drawBillboardsGL(mvp, right);
    }

    // Overlay UI sorted with sprites (screen space)
    uiItems.sort((a, b) => (a.depth || 0) - (b.depth || 0));
    for (const item of uiItems) {
      if (item.kind === 'shadow') {
        const { scr, r } = item;
        ctx.save();
        ctx.fillStyle = 'rgba(0,0,0,.22)';
        ctx.beginPath();
        ctx.ellipse(
          scr.x + (this._shadowOff?.x || 0) * 0.5,
          scr.y + (this._shadowOff?.y || 0) * 0.5,
          r,
          r * 0.35,
          0,
          0,
          Math.PI * 2,
        );
        ctx.fill();
        ctx.restore();
        continue;
      }
      const { u, scr, pose, corpse, fallback } = item;
      if (corpse) {
        // skull marker only (body is WebGL grayscale billboard)
        ctx.save();
        ctx.globalAlpha = 0.9;
        ctx.font = `${Math.max(12, Math.round(tilePx * 0.28))}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText('💀', scr.x + 6, scr.y - tilePx * 0.2);
        ctx.restore();
        continue;
      }

      const isActive = u.id === this._view.activeId;
      const isTarget = this._isTargetUnit(u);
      const targeting = this._isTargetingMode();

      if (isTarget) {
        const pulse = 0.55 + 0.45 * Math.sin(performance.now() / 220);
        ctx.save();
        ctx.strokeStyle = `rgba(230,55,40,${0.75 + pulse * 0.25})`;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.ellipse(
          scr.x,
          scr.y - 4,
          Math.max(12, tilePx * 0.42),
          Math.max(6, tilePx * 0.2),
          0,
          0,
          Math.PI * 2,
        );
        ctx.stroke();
        ctx.restore();
      } else if (targeting && u.team === 'enemy') {
        ctx.save();
        ctx.strokeStyle = 'rgba(120,120,130,.45)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.ellipse(
          scr.x,
          scr.y - 4,
          Math.max(10, tilePx * 0.36),
          Math.max(5, tilePx * 0.17),
          0,
          0,
          Math.PI * 2,
        );
        ctx.stroke();
        ctx.restore();
      }

      if (isActive) {
        ctx.save();
        ctx.strokeStyle = 'rgba(255,210,60,.95)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(
          scr.x,
          scr.y - 4,
          Math.max(10, tilePx * 0.35),
          Math.max(5, tilePx * 0.18),
          0,
          0,
          Math.PI * 2,
        );
        ctx.stroke();
        ctx.restore();
      }
      if (fallback) {
        const col =
          u.team === 'player'
            ? '#3a7fd4'
            : u.team === 'enemy'
              ? '#c44'
              : '#888';
        drawFallbackToken(ctx, scr.x, scr.y, col, u.label);
      }
      if (u.maxHp > 0) drawHpBar(ctx, scr.x, scr.y + 4, u.hp, u.maxHp);
      this._drawTargetBadge(ctx, u, scr, isTarget);
    }

    drawFx(ctx, this._fx, (c, r) => this._tileScreen(c, r));

    ctx.fillStyle = 'rgba(255,255,255,.45)';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(`Iso3D ${APP_VERSION}`, w - 8, h - 8);
  }

  /**
   * Draw small combat-context pills above a unit while targeting.
   * targetInfo keys: "col,row" → { cover?:number, adv?:-1|0|1, sneak?:boolean }
   */
  _drawTargetBadge(ctx, u, scr, isTarget) {
    const info =
      this._targetInfo &&
      (this._targetInfo[`${Math.round(u.col)},${Math.round(u.row)}`] ||
        this._targetInfo[u.id]);
    const bits = [];
    if (isTarget) bits.push({ t: '✓', c: '#3a1008', bg: '#ff7a55' });
    if (info) {
      if (info.adv === 1) bits.push({ t: 'ADV', c: '#1a5c2e', bg: '#7dffa0' });
      else if (info.adv === -1) bits.push({ t: 'DIS', c: '#5c1a12', bg: '#ff9a7a' });
      if (info.cover) bits.push({ t: `C+${info.cover}`, c: '#10243a', bg: '#8ab4ff' });
      if (info.sneak) bits.push({ t: 'SNEAK', c: '#2a1040', bg: '#d4a0ff' });
    }
    if (!bits.length) return;
    let x = scr.x - (bits.length * 22) / 2;
    const y = scr.y - 36;
    ctx.save();
    ctx.font = 'bold 9px "Segoe UI", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const b of bits) {
      const tw = Math.max(28, ctx.measureText(b.t).width + 8);
      ctx.fillStyle = b.bg;
      ctx.globalAlpha = 0.92;
      roundRect(ctx, x, y - 7, tw, 14, 4);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = b.c;
      ctx.fillText(b.t, x + tw / 2, y);
      x += tw + 3;
    }
    ctx.restore();
  }

  _project(mvp, x, y, z, width, height) {
    const out = transformMat4([], [x, y, z], mvp);
    if (!Number.isFinite(out[0])) return null;
    return {
      x: (out[0] * 0.5 + 0.5) * width,
      y: (1 - (out[1] * 0.5 + 0.5)) * height,
      z: out[2],
    };
  }

  /** Painter depth: smaller = farther = drawn first. along larger = closer to camera. */
  _depthKey(col, row, elev, layer, scrY) {
    const ax = this._camAlong?.x ?? Math.SQRT1_2;
    const az = this._camAlong?.z ?? Math.SQRT1_2;
    const along = col * ax + row * az;
    return along * 1000 + elev * 40 + (scrY || 0) * 0.02 + layer * 0.1;
  }

  /**
   * Hide overlay sprites only when a *nearby solid wall/cliff* sits in front toward the camera.
   * Previous version treated any taller cell within 5 tiles as a blocker — outer walls (h=2)
   * made the player vanish across most of the map.
   */
  _occludedByTerrain(col, row, elev) {
    const map = this._view?.map;
    if (!map) return false;
    const ax = this._camAlong?.x ?? Math.SQRT1_2;
    const az = this._camAlong?.z ?? Math.SQRT1_2;
    const a0 = col * ax + row * az;
    // Only adjacent-ish cells (not half the map)
    for (let s = 0.55; s <= 1.85; s += 0.35) {
      const c = Math.round(col + ax * s);
      const r = Math.round(row + az * s);
      if (c < 0 || r < 0 || c >= map.cols || r >= map.rows) continue;
      if (c === Math.round(col) && r === Math.round(row)) continue;
      const cell = map.cells[r * map.cols + c];
      if (!cell) continue;
      const ch = cell.h ?? 0;
      if (ch <= elev + 0.35) continue;
      const a1 = c * ax + r * az;
      if (a1 <= a0 + 0.2) continue; // must be clearly in front
      // Solid wall / cliff only — raised walkable floors don't eat sprites
      const g = cell.gKey || '';
      const isWall =
        g === 'wall' || g === 'void' || cell.type === 5; /* TERRAIN.CLIFF */
      if (!isWall && ch < elev + 1.5) continue;
      return true;
    }
    return false;
  }

  /**
   * Draw range / move / AoE tile outlines in *current* camera space.
   * (Vertex-color mesh tints already track the camera; this adds crisp rings
   * that replace the old fixed-layout DOM .rangeok outlines.)
   */
  _drawTileHighlights(ctx, mvp, w, h) {
    const map = this._view?.map;
    const hl = this._view?.highlights || this._highlightOpts || {};
    if (!map) return;

    // Dim max-range first; bright LoE range draws on top
    const brightRange = hl.attackRange;
    let dimOnly = null;
    if (hl.attackRangeMax && brightRange) {
      dimOnly = new Set();
      hl.attackRangeMax.forEach((k) => {
        if (!brightRange.has(k)) dimOnly.add(k);
      });
    } else if (hl.attackRangeMax && !brightRange) {
      dimOnly = hl.attackRangeMax;
    }
    const layers = [
      { set: hl.move, stroke: 'rgba(90,200,110,.9)', fill: 'rgba(90,200,110,.16)', width: 2 },
      { set: hl.dash, stroke: 'rgba(230,90,70,.92)', fill: 'rgba(230,90,70,.14)', width: 2 },
      { set: hl.jump, stroke: 'rgba(255,210,80,.95)', fill: null, width: 2.5 },
      { set: hl.climb, stroke: 'rgba(190,130,255,.95)', fill: null, width: 2.5 },
      // Dim = full 150ft distance (must stay readable under orange blast)
      { set: dimOnly, stroke: 'rgba(100,190,255,.65)', fill: 'rgba(70,160,255,.18)', width: 2 },
      { set: brightRange, stroke: 'rgba(60,200,255,.98)', fill: 'rgba(50,170,255,.32)', width: 2.5 },
      // Orange blast: cursor preview preferred, else locked/static (with cyan cast range)
      {
        set: this._hoverBlast || hl.blast,
        stroke: 'rgba(255,140,40,.95)',
        fill: 'rgba(255,100,20,.22)',
        width: 2.5,
      },
      { set: hl.attack, stroke: 'rgba(240,60,50,.95)', fill: 'rgba(240,60,50,.15)', width: 2 },
    ];

    const { cols, rows, cells } = map;
    const hs = 0.48; // slightly inset so rings don't z-fight tile edges

    for (const layer of layers) {
      const set = layer.set;
      if (!set || (typeof set.forEach !== 'function' && !set.size)) continue;
      const keys = set instanceof Set ? set : set;
      ctx.save();
      ctx.lineJoin = 'round';
      ctx.lineWidth = layer.width;
      ctx.strokeStyle = layer.stroke;
      if (layer.fill) ctx.fillStyle = layer.fill;

      const drawKey = (key) => {
        const parts = String(key).split(',');
        if (parts.length < 2) return;
        const col = Number(parts[0]);
        const row = Number(parts[1]);
        if (!Number.isFinite(col) || !Number.isFinite(row)) return;
        if (col < 0 || row < 0 || col >= cols || row >= rows) return;
        const cell = cells[row * cols + col];
        const elev = cell?.h ?? 0;
        let yTop = elev * 0.5 + 0.02; // slight lift so rings sit on the top face
        // Match water dip used by mesh (TERRAIN.WATER = 2)
        if (cell && (cell.gKey === 'water' || cell.type === 2)) yTop = -0.03;
        const ox = col - (cols - 1) / 2;
        const oz = row - (rows - 1) / 2;
        const corners = [
          [ox - hs, yTop, oz - hs],
          [ox + hs, yTop, oz - hs],
          [ox + hs, yTop, oz + hs],
          [ox - hs, yTop, oz + hs],
        ];
        const pts = [];
        for (const c of corners) {
          const p = this._project(mvp, c[0], c[1], c[2], w, h);
          if (!p) return;
          pts.push(p);
        }
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
        ctx.closePath();
        if (layer.fill) ctx.fill();
        ctx.stroke();
      };

      if (keys instanceof Set) keys.forEach(drawKey);
      else if (Array.isArray(keys)) keys.forEach(drawKey);
      else if (typeof keys === 'object') Object.keys(keys).forEach(drawKey);

      ctx.restore();
    }
  }

  _handleDown(e) {
    if (e.button !== 0) return;
    this._drag = { lx: e.clientX, ly: e.clientY, moved: false };
  }

  _handleMove(e) {
    if (this._drag) {
      const dx = e.clientX - this._drag.lx;
      const dy = e.clientY - this._drag.ly;
      if (Math.abs(dx) + Math.abs(dy) > 4) this._drag.moved = true;
      const cam = this.renderer.getCamera();
      const scale = 0.02 / cam.zoom;
      const cos = Math.cos(cam.rot);
      const sin = Math.sin(cam.rot);
      this.renderer.setCamera({
        panX: cam.panX + (-dx * cos - dy * sin) * scale,
        panY: cam.panY + (dx * sin - dy * cos) * scale,
      });
      this._drag.lx = e.clientX;
      this._drag.ly = e.clientY;
      return;
    }
    const hit = this._pickAt(e.clientX, e.clientY);
    this._hover = hit ? { col: hit.col, row: hit.row } : null;
    // Live AoE preview on overlay only (avoid mesh rebuild every mousemove)
    this._updateHoverBlast();
    // Soft mesh hover tint only
    if (this.renderer && this.renderer._highlights) {
      this.renderer._highlights.hover = this._hover;
      // no _dirtyMap — overlay draws the moving orange blast
    }
  }

  _handleUp(e) {
    if (!this._drag) return;
    const drag = this._drag;
    this._drag = null;
    if (drag.moved) return;
    // Unit-first pick: billboards win over terrain so walls don't steal clicks
    // from monsters standing on / behind elevated tiles.
    const hit = this._pickAt(e.clientX, e.clientY);
    if (!hit) return;
    if (hit.unit && this.onUnitClick) this.onUnitClick(hit.unit, hit);
    if (this.onTileClick) this.onTileClick(hit.col, hit.row, hit.unit || null);
  }

  /**
   * Screen-space unit pick, then terrain raycast.
   * Returns { col, row, unit? } using the unit's logical grid cell when a sprite is hit.
   */
  _pickAt(clientX, clientY) {
    const unit = this._pickUnitScreen(clientX, clientY);
    if (unit) {
      return {
        col: unit.col | 0,
        row: unit.row | 0,
        unit,
      };
    }
    const tile = this.renderer.pickTile(clientX, clientY);
    if (!tile) return null;
    const onTile = this._view?.units.find(
      (u) =>
        u.alive !== false &&
        (u.col | 0) === tile.col &&
        (u.row | 0) === tile.row,
    );
    return { col: tile.col, row: tile.row, unit: onTile || null };
  }

  /**
   * Hit-test living unit billboards in screen space (feet-anchored AABB).
   * Prefers valid attack targets when overlapping.
   */
  _pickUnitScreen(clientX, clientY) {
    if (!this._view?.units?.length || !this._mvpCache) return null;
    const rect = this.glCanvas.getBoundingClientRect();
    const mx = clientX - rect.left;
    const my = clientY - rect.top;
    const w = this._wh.w || rect.width;
    const h = this._wh.h || rect.height;
    if (w < 1 || h < 1) return null;

    const mvp = this._mvpCache;
    const cam = this.renderer.getCamera();
    this._camAlong = { x: Math.sin(cam.rot), z: Math.cos(cam.rot) };
    const tilePx = this._tilePx(mvp, w, h);
    const halfW = Math.max(14, tilePx * 0.48);
    const bodyH = Math.max(28, tilePx * 1.45);

    let best = null;
    let bestScore = Infinity;

    for (const u of this._view.units) {
      if (u.alive === false) continue;
      const pose =
        u.alive === false
          ? { col: u.col, row: u.row }
          : this._visualPose(u);
      const cellCol = Math.round(pose.col);
      const cellRow = Math.round(pose.row);
      const cell =
        this._view.map.cells[
          Math.max(0, Math.min(this._view.map.rows - 1, cellRow)) *
            this._view.map.cols +
            Math.max(0, Math.min(this._view.map.cols - 1, cellCol))
        ];
      const elev = cell?.h ?? 0;
      const y = elev * 0.5; // match mesh top / billboard plant
      const { x, z } = gridToWorld(
        pose.col,
        pose.row,
        this._view.map.cols,
        this._view.map.rows,
      );
      const scr = this._project(mvp, x, y, z, w, h);
      if (!scr) continue;
      // Match draw: only skip non-player units behind a near solid wall
      if (
        u.team !== 'player' &&
        this._occludedByTerrain(pose.col, pose.row, elev)
      ) {
        continue;
      }

      // Feet at (scr.x, scr.y); sprite rises upward
      if (mx < scr.x - halfW || mx > scr.x + halfW) continue;
      if (my < scr.y - bodyH || my > scr.y + 10) continue;

      const cx = scr.x;
      const cy = scr.y - bodyH * 0.4;
      let score = Math.hypot(mx - cx, my - cy);
      // Prefer legal targets when several sprites overlap
      if (this._isTargetUnit(u)) score -= 50;
      // Prefer nearer (larger screen Y in iso usually = closer to camera)
      score -= scr.y * 0.01;

      if (score < bestScore) {
        bestScore = score;
        best = u;
      }
    }
    return best;
  }
}

/** Simple rounded rect path (no fill). */
function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

export { Renderer } from './renderer.js?v=0.5.30';
