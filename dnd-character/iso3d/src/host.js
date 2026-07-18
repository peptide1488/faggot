/**
 * Iso3DHost — presentation host for Grimoire (or any session-shaped data).
 * Units walk along pathfinded routes (no teleport snaps).
 */

import { Renderer } from './renderer.js?v=0.6.12';
import { transformMat4, gridToWorld, getCameraMatrix } from './math.js?v=0.6.12';
import {
  grimoireSessionToView,
  rotationToYaw,
  makeDemoGrimoireSession,
  grimoireMapToIso,
} from './adapter.js?v=0.6.12';
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
} from './sprites.js?v=0.6.12';
import {
  createFxState,
  spawnFloater,
  spawnProjectile,
  spawnExplosion,
  spawnImpact,
  fxFromGameEvent,
  drawFx,
  colorForDtype,
} from './fx.js?v=0.6.12';
import { findPath, facingFromStep } from './pathfinding.js?v=0.6.12';
import { APP_VERSION } from './version.js?v=0.6.12';
import { resolveLighting } from './lighting.js?v=0.6.12';

// Doors are real 3D wall-oriented quads built in buildMapMesh (renderer.js) now, not
// billboards — see that file for why the old rotation-lookup approach was replaced.

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
    /** Attack flash: id → { t0, ms, facing } */
    this._attackAnims = new Map();

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
    this._lastFrameT = 0;
    this._drag = null;
    this._hover = null;
    this._mvpCache = null;
    this._wh = { w: 0, h: 0 };

    this.attach(container);

    this._onDown = (e) => this._handleDown(e);
    this._onUp = (e) => this._handleUp(e);
    this._onMove = (e) => this._handleMove(e);
    this.glCanvas.addEventListener('mousedown', this._onDown);
    this.glCanvas.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('mouseup', this._onUp);
    window.addEventListener('mousemove', this._onMove);
    // Touch: drag-to-pan / tap-to-target, mirroring the mouse handlers above (which only
    // ever listened for mouse events — canvas CSS already had touch-action:none reserved
    // for this, but the actual listeners were never wired up, so panning the camera did
    // nothing at all on a phone/tablet).
    this._onTouchStart = (e) => {
      if (e.touches.length !== 1) return;
      const t = e.touches[0];
      this._handleDown({ button: 0, clientX: t.clientX, clientY: t.clientY, preventDefault: () => e.preventDefault() });
    };
    this._onTouchMove = (e) => {
      if (e.touches.length !== 1) return;
      const t = e.touches[0];
      if (this._drag) e.preventDefault();
      this._handleMove({ clientX: t.clientX, clientY: t.clientY });
    };
    this._onTouchEnd = (e) => {
      const t = e.changedTouches && e.changedTouches[0];
      if (!t) return;
      this._handleUp({ clientX: t.clientX, clientY: t.clientY });
    };
    this.glCanvas.addEventListener('touchstart', this._onTouchStart, { passive: false });
    this.glCanvas.addEventListener('touchmove', this._onTouchMove, { passive: false });
    this.glCanvas.addEventListener('touchend', this._onTouchEnd, { passive: false });
    this.glCanvas.addEventListener('touchcancel', this._onTouchEnd, { passive: false });
    this.glCanvas.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        const cam = this.renderer.getCamera();
        // Scale by the actual deltaY magnitude, not a fixed step per event — a real bug hit
        // live ("sprites jump and rapidly fuck up when zooming"): a mouse wheel fires one
        // event per discrete notch, so a flat +-0.08 per event felt fine, but a trackpad (or
        // any precision-scroll device) fires MANY wheel events per second for one gesture,
        // each with a small deltaY — applying the SAME full 0.08 step to every one of those
        // burst events made the zoom (and therefore every on-screen size derived from it)
        // rocket through many discrete jumps almost instantly instead of tracking the gesture
        // smoothly. Clamp the per-event delta so one large spike (a fast mouse notch, or a
        // trackpad hiccup) still can't overshoot by much.
        const clampedDelta = Math.max(-100, Math.min(100, e.deltaY));
        const factor = Math.exp(-clampedDelta * 0.0012);
        this.renderer.setCamera({
          zoom: cam.zoom * factor,
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
    const reparented = this.glCanvas.parentElement !== container;
    if (reparented) {
      container.appendChild(this.glCanvas);
    }
    if (this.overlay.parentElement !== container) {
      container.appendChild(this.overlay);
    }
    // render() regenerates the whole map area's HTML on turn-end/attack-start/attack-end
    // (never during plain movement, which drives the host directly instead) — every one
    // of those re-renders creates a BRAND NEW #iso3dMount div, forcing this exact
    // reparent. Live reports of a black flash correlate 1:1 with those specific events
    // (not movement) on both desktop and mobile, which is a DOM-reparenting signature,
    // not a display-refresh-rate one. The throttled render loop (30fps) might not redraw
    // for up to ~33ms after this reattach, leaving the freshly-attached-but-still-blank
    // canvas eligible to be composited as-is for at least one paint. Force an immediate
    // synchronous redraw right here instead of waiting for the next scheduled tick.
    if (reparented && this._view) {
      try {
        this._frame();
      } catch (e) {
        console.error('[Iso3DHost] immediate post-reattach redraw failed', e);
      }
    }
  }

  /**
   * @param {object} session
   * @param {{ highlights?: object, resetCamera?: boolean, frameOn?: {col:number,row:number,zoom?:number}, skipAutoPath?: boolean, spritePaths?: Record<string,string> }} [opts]
   */
  setSession(session, opts = {}) {
    this._session = session;
    if (opts.highlights !== undefined) this._highlightOpts = opts.highlights;
    this._view = grimoireSessionToView(session, {
      assetBase: this.assetBase,
      highlights: this._highlightOpts || undefined,
      spritePaths: opts.spritePaths,
    });
    // REVERTED: pre-warming GPU textures here (calling the renderer's _ensureTex — raw
    // gl.bindTexture/gl.texImage2D calls — from outside the render loop, e.g. from an
    // async img.onload firing at a random time) left WebGL's texture-binding state
    // stepped on whenever the next real draw() ran, since _ensureTex binds a texture
    // and never explicitly restores whatever was bound before. Live report right after
    // this shipped: the ENTIRE battlefield rendering as flat sky-blue with no terrain,
    // no units, nothing — a full mesh-draw failure, strictly worse than the original
    // sprite-flicker report. Back to lazy upload (still correct, just not "pre-warmed").
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
    // Map lighting (sun profile + torches + dynamic spell lights)
    this._applyLighting();
    this._applyHighlights();
    // Prefer framing a cell (caster) over dumping the camera at map-center zoom 1
    if (opts.frameOn && opts.frameOn.col != null && opts.frameOn.row != null) {
      this.frameOnCell(opts.frameOn.col, opts.frameOn.row, opts.frameOn.zoom);
      this._firstSession = false;
    } else if (opts.resetCamera || this._firstSession) {
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
   * @returns {{ col:number, row:number, facing:string, walking?:boolean, walkDist?:number } | null}
   */
  _visualPose(u) {
    const anim = this._anims.get(u.id);
    if (!anim) {
      return {
        col: u.col,
        row: u.row,
        facing: u.facing || 'down',
        walking: false,
        walkDist: 0,
      };
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
      return {
        col: last.x,
        row: last.y,
        facing: u.facing || 'down',
        walking: false,
        walkDist: segs,
      };
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
    return {
      col,
      row,
      facing: face,
      walking: true,
      walkDist: seg + frac,
    };
  }

  /**
   * Walk-sheet column: idle bob, walk cycle, or attack lunge.
   * Standard sheets (SPRITE_SHEET_SPEC): rows = facing, cols = 0..3 walk frames.
   */
  _spriteFrame(u, pose) {
    const now = performance.now();
    const cols = Math.max(1, (u.spriteDraw && u.spriteDraw.cols) || 4);
    const atk = this._attackAnims.get(u.id);
    if (atk) {
      const t = (now - atk.t0) / (atk.ms || 420);
      if (t >= 1) this._attackAnims.delete(u.id);
      else {
        // Attack: hold a mid/late walk frame (lunge), then snap back
        if (t < 0.25) return Math.min(1, cols - 1);
        if (t < 0.7) return Math.min(2, cols - 1);
        return Math.min(3, cols - 1);
      }
    }
    if (pose && pose.walking) {
      // ~3 columns per tile so 4-frame walk cycles read clearly
      return Math.floor((pose.walkDist || 0) * 3) % cols;
    }
    // Idle: gentle 0 ↔ 1 bob (frame 0 is rest pose) when the sheet has ≥2 cols
    if (cols < 2) return 0;
    return Math.floor(now / 420) % 2;
  }

  /** Face toward a grid cell and play a short attack frame burst. */
  playAttack(unitId, towardCol, towardRow, ms = 420) {
    if (!unitId || !this._view) return;
    const u = this._view.units.find((x) => x.id === unitId);
    if (u && towardCol != null && towardRow != null) {
      const face = facingFromStep(
        towardCol - (u.col | 0),
        towardRow - (u.row | 0),
      );
      if (face) u.facing = face;
    }
    this._attackAnims.set(unitId, {
      t0: performance.now(),
      ms,
      facing: u?.facing || 'down',
    });
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
   * (gold valid / attackRange). Illegal tiles show no blast so overlay matches clicks.
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
    // Only legal centers (same set as gold / attackRange tiles)
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

  /**
   * Sun / night / dungeon profile + point lights from map + session.lights.
   */
  _applyLighting() {
    if (!this.renderer || !this._view) return;
    const mapLight =
      (this._session && this._session.map && this._session.map.light) ||
      (this._view.map && this._view.map.light) ||
      null;
    const extra = [];
    // Dynamic lights (spell Light / Daylight / etc.) — update follow-casters to live positions
    const dyn =
      (this._session && this._session.lights) ||
      (this._view && this._view.dynamicLights) ||
      [];
    const units = this._view.units || [];
    for (const L of dyn) {
      if (!L) continue;
      let col = L.col;
      let row = L.row;
      if (L.follow) {
        const u = units.find(
          (x) =>
            x &&
            (x.id === L.follow ||
              x.id === `p:${L.follow}` ||
              x.id === `m:${L.follow}` ||
              (x.raw && (x.raw.id === L.follow || x.raw.name === L.follow)) ||
              x.label === L.follow),
        );
        if (u) {
          col = Math.round(u.col);
          row = Math.round(u.row);
          L.col = col;
          L.row = row;
        }
      }
      if (col == null || row == null) continue;
      // Magical darkness is rules-only; skip as a point light
      if (L.dark) continue;
      extra.push({
        col: col | 0,
        row: row | 0,
        radius: L.radius != null ? L.radius : 4,
        // bright core is half of dim radius (PHB bright X + dim additional X)
        bright: L.bright != null ? L.bright : undefined,
        color: L.color || [1.0, 0.85, 0.55],
        intensity: L.intensity != null ? L.intensity : 1.15,
        kind: L.kind || L.name || 'spell',
      });
    }
    // Decor torches: only if the map light list didn't already place them
    // (Torchlit Crypt lists lights in map.light.points — avoid double-count / slot waste)
    const mapHasPoints =
      mapLight && Array.isArray(mapLight.points) && mapLight.points.length > 0;
    if (!mapHasPoints) {
      for (const d of this._view.decorSprites || []) {
        const k = d.kind || '';
        if (k.includes('torch') || k === 'campfire' || k.includes('crystal')) {
          extra.push({
            col: d.col | 0,
            row: d.row | 0,
            radius: k.includes('crystal') ? 4 : 5,
            color: k.includes('crystal')
              ? [0.55, 0.75, 1.0]
              : [1.0, 0.55, 0.22],
            intensity: 1.5,
            kind: 'torch',
          });
        }
      }
    }
    const profile = resolveLighting(mapLight, extra);
    this._lightProfile = profile;
    this.renderer.setLighting(profile, {
      cols: this._view.map.cols,
      rows: this._view.map.rows,
    });
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
    if (ev && ev.type === 'attack' && !ev.void && ev.from && ev.to && this._view?.units) {
      // Attack frame on attacker; projectile still comes from fxFromGameEvent
      const aid = ev.actorId;
      const u =
        this._view.units.find(
          (x) =>
            x.id === aid ||
            x.id === `p:${aid}` ||
            x.id === `m:${aid}` ||
            (x.raw && x.raw.id === aid),
        ) ||
        this._view.units.find(
          (x) =>
            x.alive !== false &&
            (x.col | 0) === (ev.from.x | 0) &&
            (x.row | 0) === (ev.from.y | 0),
        );
      if (u) this.playAttack(u.id, ev.to.x, ev.to.y);
    }
    fxFromGameEvent(this._fx, ev);
  }

  floatText(col, row, text, color) {
    spawnFloater(this._fx, col, row, text, color);
  }

  /**
   * @param {number} c0
   * @param {number} r0
   * @param {number} c1
   * @param {number} r1
   * @param {string|object} [dtypeOrOpts] dtype string or { kind, dtype }
   */
  shoot(c0, r0, c1, r1, dtypeOrOpts) {
    let kind = 'bolt';
    let dtype = '';
    let attackerId = null;
    if (dtypeOrOpts && typeof dtypeOrOpts === 'object') {
      kind = dtypeOrOpts.kind || 'bolt';
      dtype = dtypeOrOpts.dtype || '';
      attackerId = dtypeOrOpts.attackerId || null;
    } else {
      dtype = dtypeOrOpts || '';
      const d = String(dtype).toLowerCase();
      if (d.includes('fire')) kind = 'firebolt';
      else if (d.includes('pierce') || d.includes('arrow')) kind = 'arrow';
    }
    // Play attacker attack frames facing the target
    if (attackerId) this.playAttack(attackerId, c1, r1);
    else if (this._view?.units) {
      // Guess PC / unit standing on origin tile
      const at = this._view.units.find(
        (u) =>
          u.alive !== false &&
          (u.col | 0) === (c0 | 0) &&
          (u.row | 0) === (r0 | 0),
      );
      if (at) this.playAttack(at.id, c1, r1);
    }
    spawnProjectile(
      this._fx,
      c0,
      r0,
      c1,
      r1,
      kind,
      colorForDtype(dtype || (kind === 'firebolt' ? 'fire' : '')),
    );
  }

  /** Fireball / AoE explosion at a cell (radius in tiles). */
  explode(col, row, radiusTiles = 4, kind = 'fire') {
    spawnExplosion(this._fx, col, row, radiusTiles, kind);
  }

  /** Hit / miss / crit spark at a cell. */
  impact(col, row, kind = 'hit') {
    spawnImpact(this._fx, col, row, kind);
  }

  // REMOVED the 30fps throttle (was: skip this rAF tick unless FRAME_INTERVAL_MS has
  // elapsed). The WebGL context here has no preserveDrawingBuffer, so the browser is
  // spec-allowed to clear the drawing buffer to black immediately after compositing it
  // — and it composites the canvas at the display's own refresh rate (often 90/120Hz on
  // phones) independent of whatever rate WE choose to redraw at. Every tick this loop
  // decided to skip was a tick where, if the browser happened to composite right then,
  // it would show an already-cleared black frame. That's a real, spec-compliant
  // mechanism that fits every symptom reported all session (solid black not sky color,
  // zero exceptions, only the GL canvas affected, self-healing next frame, worse on
  // high-refresh displays and during interaction) far better than anything else tried.
  // preserveDrawingBuffer:true would also close this gap but forces a real per-frame
  // GPU buffer copy — measurably more expensive and the wrong tradeoff on a phone
  // already under load. Simply never choosing to skip a redraw costs nothing extra
  // per frame (still one clear + draw, just possibly more often) and closes the same
  // gap without that cost.
  static FRAME_INTERVAL_MS = 1000 / 30;

  start() {
    if (this._running) return;
    this._running = true;
    const loop = (t) => {
      if (!this._running) return;
      {
        this._lastFrameT = t;
        try {
          this._frame();
        } catch (err) {
          console.error('[Iso3DHost]', err);
          // Surface this on-screen too — a live report described a black/blank flash
          // during battle that four separate, individually-verified rendering fixes
          // didn't touch, meaning the actual cause hasn't been found yet. If _frame()
          // is silently throwing here (an exception mid-frame leaves whatever was last
          // drawn on screen, or blanks it depending on where it fails), this makes that
          // visible without needing devtools/remote debugging — report the exact
          // message shown here if it ever appears.
          this._lastFrameError = { message: String(err && err.message || err), time: t };
          try {
            if (typeof window !== 'undefined' && typeof window.flashBanner === 'function') {
              window.flashBanner('⚠ Iso3D frame error: ' + (err && err.message || err));
            }
          } catch (_) {}
        }
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
    this.glCanvas.removeEventListener('touchstart', this._onTouchStart);
    this.glCanvas.removeEventListener('touchmove', this._onTouchMove);
    this.glCanvas.removeEventListener('touchend', this._onTouchEnd);
    this.glCanvas.removeEventListener('touchcancel', this._onTouchEnd);
    this.glCanvas.remove();
    this.overlay.remove();
  }

  centerOnMap() {
    this.renderer.setCamera({ panX: 0, panY: 0, zoom: 1.0 });
  }

  /**
   * Look at a grid cell (e.g. the PC at QB start, or caster when targeting).
   * Zoom defaults a bit closer than full-map so the unit is clearly in frame.
   */
  /**
   * @returns {boolean} false if map not ready yet (caller should retry)
   */
  frameOnCell(col, row, zoom) {
    const map = this._view?.map || this.renderer?._map;
    if (!map || !Number.isFinite(map.cols) || !Number.isFinite(map.rows)) {
      return false;
    }
    const { x, z } = gridToWorld(col | 0, row | 0, map.cols, map.rows);
    const zDef = zoom != null ? zoom : 1.85;
    this.renderer.setCamera({
      panX: x,
      panY: z,
      zoom: Math.max(0.55, Math.min(2.9, zDef)),
    });
    return true;
  }

  _syncSize() {
    // Keep overlay + GL buffer at the same HiDPI resolution (see Renderer.syncSize).
    const dpr = Math.min(
      typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1,
      3,
    );
    const cssW = this.container?.clientWidth || 800;
    const cssH = this.container?.clientHeight || 600;
    const w = Math.max(1, Math.floor(cssW * dpr));
    const h = Math.max(1, Math.floor(cssH * dpr));
    if (this.overlay.width !== w || this.overlay.height !== h) {
      this.overlay.width = w;
      this.overlay.height = h;
    }
    // GL canvas CSS already 100%; buffer size is owned by renderer.syncSize()
    this.renderer.syncSize();
    this._dpr = dpr;
    this._wh = { w, h, dpr };
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
    this._lastMissReasons = [];

    for (const d of this._view.decorSprites || []) {
      const cell =
        this._view.map.cells[
          Math.max(0, Math.min(this._view.map.rows - 1, d.row | 0)) *
            this._view.map.cols +
            Math.max(0, Math.min(this._view.map.cols - 1, d.col | 0))
        ];
      const elev = cell?.h ?? 0;
      const knd = d.kind || '';
      const url = d.spriteUrl || '';
      // HARD RULE: tree height if flagged, kind is tree/tree2, OR url is a tree texture.
      // Never allow a "half-height tree" code path — that was the tiny-grey-tree bug.
      const isTree =
        d.isFullTree === true ||
        knd === 'tree' ||
        knd === 'tree2' ||
        /tree(_px|2)?\.png/i.test(url);
      const isBush = !isTree && (knd.startsWith('bush') || /bush/i.test(url));
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
      // Structure gadgets (doors/traps/barrels…) are mesh-only — this loop is trees/bushes/flames.
      const entry = d.spriteUrl ? loadSprite(d.spriteUrl) : null;
      // Trees: one tall size only. Bushes: short. No middle size.
      const worldH = isTree ? 4.2 : isBush ? 1.05 : 0.95;
      const uv = entry && entry.ready ? getFullImageUV(entry) : null;
      // Clamp aspect so wide/skinny frames never shrink the billboard into a speck
      let aspect = uv && uv.fh ? uv.fw / uv.fh : 0.7;
      if (isTree) aspect = Math.max(0.55, Math.min(0.9, aspect));
      if (entry && entry.ready && uv) {
        const k = d.kind || '';
        // Lit flames only — torch_unlit must not self-glow
        const isLitFlame =
          k === 'torch' ||
          k === 'campfire' ||
          k.includes('crystal');
        const isFlameFamily = isLitFlame || k === 'torch_unlit';
        // No pixel-snapping (see the unit billboard code below for the full story): a real
        // bug hit live ("mostly the sprite trees doing this") — at LOW zoom even a big
        // worldH tree has a small screenH, landing in the same low-integer snap regime
        // that caused units to freeze-then-jump. Snapping isn't actually safe at ANY
        // billboard size once the camera can zoom out far enough; just use the true
        // continuously-projected size everywhere.
        const bw = worldH * aspect;
        const bh = worldH;
        glBillboards.push({
          img: entry.img,
          origin: [x, y, z],
          width: bw,
          height: bh,
          u0: uv.u0,
          v0: uv.v0,
          u1: uv.u1,
          v1: uv.v1,
          depth: this._depthKey(d.col, d.row, elev, 0, scr.y),
          alpha: 1,
          darken: isFlameFamily ? (isLitFlame ? 1 : 0.55) : 1,
          emissive: isLitFlame,
          softCover: isBush && !isTree,
        });
      }
      // Soft ground shadow on overlay (under feet) — larger canopy → slightly wider puddle
      uiItems.push({
        kind: 'shadow',
        scr,
        r: Math.max(8, tilePx * (isTree ? 0.42 : isBush ? 0.3 : 0.28)),
      });
    }

    for (const u of this._view.units) {
      const dead = u.alive === false;
      const pose = dead
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
      // Corpses hug the floor; living feet clear the tile top
      const y = elev * STEP + (dead ? 0.04 : 0.03);
      const { x, z } = gridToWorld(
        pose.col,
        pose.row,
        this._view.map.cols,
        this._view.map.rows,
      );
      const scr = this._project(mvp, x, y, z, w, h);
      if (!scr) {
        this._lastMissReasons = this._lastMissReasons || [];
        this._lastMissReasons.push(`${u.id}:noProject`);
        continue;
      }
      const layer = dead ? 1 : 2;
      const depth = this._depthKey(pose.col, pose.row, elev, layer, scr.y);
      const entry = u.spriteUrl ? loadSprite(u.spriteUrl) : null;
      let pushed = false;
      if (!entry) {
        this._lastMissReasons = this._lastMissReasons || [];
        this._lastMissReasons.push(`${u.id}:noSpriteUrl`);
      } else if (entry.failed) {
        this._lastMissReasons = this._lastMissReasons || [];
        this._lastMissReasons.push(`${u.id}:spriteFailed(${u.spriteUrl})`);
      } else if (!entry.ready) {
        this._lastMissReasons = this._lastMissReasons || [];
        this._lastMissReasons.push(`${u.id}:spriteNotReady(${u.spriteUrl})`);
      }
      if (entry && entry.ready && !entry.failed) {
        const sd = u.spriteDraw || {};
        const cols = sd.cols || 4;
        const rows = sd.rows || 4;
        const dirOrder = sd.dirOrder || ['down', 'left', 'right', 'up'];
        const frame = dead ? 0 : this._spriteFrame(u, pose);
        const face = dead
          ? pose.facing || u.facing || 'down'
          : this._attackAnims.get(u.id)?.facing ||
            pose.facing ||
            u.facing ||
            'down';
        // Keep logical facing on the session unit so re-setSession keeps direction
        if (!dead && u.raw && face) u.raw.facing = face;
        const uv = getSpriteFrameUV(entry, face, frame, {
          cols,
          rows,
          dirOrder,
        });
        if (!uv) {
          this._lastMissReasons = this._lastMissReasons || [];
          this._lastMissReasons.push(`${u.id}:noUV(face=${face},frame=${frame})`);
        }
        if (uv) {
          const aspect = uv.fw / Math.max(1, uv.fh);
          if (dead) {
            // Matching prone corpse: same sprite, laid flat on the ground
            const bodyLen = 1.05;
            const bodyW = Math.max(0.55, bodyLen * aspect * 0.85);
            glBillboards.push({
              img: entry.img,
              origin: [x, y, z],
              width: bodyW,
              height: bodyLen,
              u0: uv.u0,
              v0: uv.v0,
              u1: uv.u1,
              v1: uv.v1,
              gray: false,
              darken: 0.78,
              alpha: 1,
              prone: true,
              depth,
            });
          } else {
            const walking = !!(pose && pose.walking);
            // Subtle bob while walking so even sparse sheets read as motion
            const bob =
              walking && pose.walkDist != null
                ? Math.sin(pose.walkDist * Math.PI * 2) * 0.035
                : 0;
            // No attack-triggered size bump (there used to be a +5%/+6% h/w multiplier
            // while `_attackAnims.has(u.id)`): that changed the billboard's world-space
            // size the INSTANT an attack starts/ends, a real hard pop with no easing —
            // a real bug hit live ("sprites jump"), worse at high zoom since the same 5%
            // is a bigger absolute pixel jump the larger the sprite is on screen, and easy
            // to blame on the zoom math since attacks and zooming often happen together
            // mid-battle. The attack lunge is still conveyed by the walk-frame pose swap
            // in _spriteFrame — no separate size cue needed.
            const worldH = 1.35 * (1 + bob);
            const worldW = worldH * aspect;
            // No pixel-snapping — worldH/worldW are the true, continuously-projected size
            // (see the decor billboard loop above for the full story on why snapping to an
            // integer texel scale was removed there too, not just here).
            glBillboards.push({
              img: entry.img,
              origin: [x, y, z],
              width: worldW,
              height: worldH,
              u0: uv.u0,
              v0: uv.v0,
              u1: uv.u1,
              v1: uv.v1,
              gray: false,
              // Lighting is GPU point lights (same as terrain) — no per-sprite bake
              darken: 1,
              emissive: false,
              alpha: 1,
              depth,
            });
          }
          pushed = true;
        }
      }
      uiItems.push({
        kind: 'unitUi',
        u,
        scr,
        pose,
        corpse: dead,
        fallback: !pushed,
        depth,
      });
    }

    // Diagnostic: report on-screen if every living unit's billboard vanished for a frame
    // (the exact suspected mechanism for the reported "sprites disappear" bug) — gated
    // to fire at most once per 2s so it can't spam. My own test harness can't reliably
    // catch this (Playwright throttles requestAnimationFrame under automation — only
    // ~2.5fps observed in one run vs the real 30fps target — so a real device is the
    // only reliable way to confirm or rule this out).
    {
      const aliveUnits = (this._view.units || []).filter((u) => u.alive !== false);
      if (aliveUnits.length > 0 && glBillboards.length === 0) {
        const now = performance.now();
        if (!this._lastEmptyBillboardWarn || now - this._lastEmptyBillboardWarn > 2000) {
          this._lastEmptyBillboardWarn = now;
          const reasons = (this._lastMissReasons || []).slice(0, 4).join('; ');
          try {
            if (typeof window !== 'undefined' && typeof window.flashBanner === 'function') {
              window.flashBanner('⚠ Iso3D: ' + aliveUnits.length + ' unit(s) alive, 0 billboards — ' + (reasons || 'no reasons captured?'));
            }
          } catch (_) {}
        }
      }
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
        // Body is the prone WebGL billboard (matching sprite). Fallback blob only if sprite missing.
        if (fallback) {
          ctx.save();
          ctx.fillStyle = 'rgba(90,60,50,.85)';
          ctx.beginPath();
          ctx.ellipse(scr.x, scr.y - 4, Math.max(12, tilePx * 0.4), Math.max(7, tilePx * 0.18), 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
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

    const tilePxFx = this._tilePx(mvp, w, h);
    drawFx(ctx, this._fx, (c, r) => this._tileScreen(c, r), tilePxFx);

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
      // Max reach only (no LoS): slate indigo rings
      { set: dimOnly, stroke: 'rgba(120,130,190,.72)', fill: 'rgba(70,80,150,.16)', width: 1.75 },
      // Valid shot / clear LoS: hot gold — intentionally not blue
      { set: brightRange, stroke: 'rgba(255,210,40,.98)', fill: 'rgba(255,190,20,.28)', width: 2.75 },
      // Orange blast: cursor preview preferred, else locked/static
      {
        set: this._hoverBlast || hl.blast,
        stroke: 'rgba(255,140,40,.95)',
        fill: 'rgba(255,100,20,.22)',
        width: 2.5,
      },
      { set: hl.attack, stroke: 'rgba(240,60,50,.95)', fill: 'rgba(240,60,50,.15)', width: 2 },
      // Lingering gas hazard (Cloudkill etc.) — sickly green, pulsing like the classic 2D
      // view's .gashazard CSS class (see adapter.js's highlights.gas for where this set
      // comes from). Redrawn every frame anyway, so the pulse is just a time-based alpha
      // wobble rather than needing a real CSS/GPU animation.
      {
        set: hl.gas,
        stroke: `rgba(140,200,60,${(0.5 + 0.25 * Math.sin(performance.now() / 500)).toFixed(2)})`,
        fill: `rgba(120,190,40,${(0.14 + 0.08 * Math.sin(performance.now() / 500)).toFixed(2)})`,
        width: 2.5,
      },
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
    // Left, middle, or right — all can pan; only left-up without drag casts/targets
    if (e.button !== 0 && e.button !== 1 && e.button !== 2) return;
    e.preventDefault();
    this._drag = {
      lx: e.clientX,
      ly: e.clientY,
      moved: false,
      button: e.button,
      // Higher threshold so a tiny jitter while grabbing the camera isn't a cast
      threshold: e.button === 0 ? 8 : 3,
    };
  }

  _handleMove(e) {
    if (this._drag) {
      const dx = e.clientX - this._drag.lx;
      const dy = e.clientY - this._drag.ly;
      const thr = this._drag.threshold != null ? this._drag.threshold : 8;
      if (Math.abs(dx) + Math.abs(dy) > thr) this._drag.moved = true;
      if (this._drag.moved || this._drag.button !== 0) {
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
        this._drag.moved = true;
      }
      return;
    }
    // Raw mousemove fires far faster than the render loop — a gaming mouse can hit
    // 500-1000Hz — and _pickAt rebuilds+inverts the camera matrix and raycasts every
    // tile on the map on EVERY call. Unthrottled, that's up to ~1000 full-map raycasts
    // per second just from moving the mouse, independent of (and far worse than) the
    // render loop's own throttle. Live report: "insanely slow, maxing out cpu" even on
    // a tiny demo map — this is why. Gate the expensive pick to the render frame budget;
    // the cheap position bookkeeping above (drag/pan) stays fully unthrottled.
    const now = performance.now();
    if (now - (this._lastPickT || 0) < Iso3DHost.FRAME_INTERVAL_MS) return;
    this._lastPickT = now;
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
    // Pan (any button) never fires a tile target — keeps Fireball targeting open
    if (drag.moved) return;
    if (drag.button !== 0) return;
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
    // HiDPI: framebuffer px ≠ CSS px
    const scaleX = (this._wh.w || rect.width) / Math.max(1, rect.width);
    const scaleY = (this._wh.h || rect.height) / Math.max(1, rect.height);
    const mx = (clientX - rect.left) * scaleX;
    const my = (clientY - rect.top) * scaleY;
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

export { Renderer } from './renderer.js?v=0.6.12';
