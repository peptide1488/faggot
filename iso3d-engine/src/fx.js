/**
 * Combat presentation FX: floating text + projectiles (grid-space → screen each frame).
 * Pure presentation — no rules.
 */

/**
 * @typedef {{ col:number, row:number, text:string, color:string, born:number, life:number, scale?:number }} Floater
 * @typedef {{ c0:number, r0:number, c1:number, r1:number, born:number, life:number, color:string, kind:string }} Projectile
 */

export function createFxState() {
  return {
    /** @type {Floater[]} */
    floaters: [],
    /** @type {Projectile[]} */
    projectiles: [],
  };
}

/**
 * @param {ReturnType<typeof createFxState>} fx
 * @param {number} col
 * @param {number} row
 * @param {string} text
 * @param {string} [color]
 * @param {number} [life] seconds
 */
export function spawnFloater(fx, col, row, text, color = '#fff', life = 1.1) {
  fx.floaters.push({
    col,
    row,
    text: String(text),
    color,
    born: performance.now(),
    life: life * 1000,
  });
  if (fx.floaters.length > 40) fx.floaters.shift();
}

/**
 * @param {ReturnType<typeof createFxState>} fx
 */
export function spawnProjectile(fx, c0, r0, c1, r1, kind = 'bolt', color = '#ffe08a') {
  fx.projectiles.push({
    c0,
    r0,
    c1,
    r1,
    born: performance.now(),
    life: 320,
    color,
    kind,
  });
  if (fx.projectiles.length > 20) fx.projectiles.shift();
}

/** Damage-type → projectile color */
export function colorForDtype(dtype) {
  const d = String(dtype || '').toLowerCase();
  if (d.includes('fire')) return '#ff7a3a';
  if (d.includes('cold') || d.includes('frost')) return '#8ecfff';
  if (d.includes('lightning') || d.includes('thunder')) return '#f5e36b';
  if (d.includes('acid')) return '#8fd94a';
  if (d.includes('poison')) return '#7dca6a';
  if (d.includes('necrotic')) return '#6b5b8c';
  if (d.includes('radiant')) return '#fff4a8';
  if (d.includes('psychic')) return '#d48cff';
  if (d.includes('force')) return '#c9d4ff';
  return '#ffe08a';
}

/**
 * Consume a Grimoire Events payload and queue FX.
 * @param {ReturnType<typeof createFxState>} fx
 * @param {object} ev
 */
export function fxFromGameEvent(fx, ev) {
  if (!ev || !ev.type) return;

  if (ev.type === 'attack' && !ev.void) {
    const from = ev.from;
    const to = ev.to;
    if (from && to && (from.x !== to.x || from.y !== to.y)) {
      if (ev.ranged || (ev.tiles || 0) > 1) {
        spawnProjectile(
          fx,
          from.x,
          from.y,
          to.x,
          to.y,
          'bolt',
          colorForDtype(ev.dtype),
        );
      } else {
        // melee swipe: short projectile
        spawnProjectile(fx, from.x, from.y, to.x, to.y, 'slash', '#eee');
      }
    }
    const delay = ev.ranged ? 280 : 90;
    const tx = to ? to.x : null;
    const ty = to ? to.y : null;
    if (tx == null || ty == null) return;
    setTimeout(() => {
      if (ev.sanctuary && ev.sanctuary.blocked) {
        spawnFloater(fx, tx, ty, 'Sanctuary', '#9cf', 1.2);
        return;
      }
      // Pre-hit roll context (shown slightly earlier offset)
      if (ev.adv === 1) spawnFloater(fx, tx, ty, 'ADV', '#7dffa0', 0.85);
      else if (ev.adv === -1) spawnFloater(fx, tx, ty, 'DIS', '#ff9a7a', 0.85);
      if (ev.hit) {
        const label = ev.crit ? `CRIT ${ev.dmg}` : `−${ev.dmg}`;
        spawnFloater(fx, tx, ty, label, ev.crit ? '#ffd24a' : '#ff6b6b', 1.15);
        if (ev.sneak) spawnFloater(fx, tx, ty, `Sneak +${ev.sneak}`, '#c9f', 1.05);
        if (ev.cover) spawnFloater(fx, tx, ty, `Cover +${ev.cover}`, '#8ab4ff', 1.0);
        if (ev.mult === 0.5) spawnFloater(fx, tx, ty, 'Resist', '#8fd', 0.9);
        if (ev.mult === 2) spawnFloater(fx, tx, ty, 'Vulnerable!', '#f86', 0.9);
        if (ev.mult === 0) spawnFloater(fx, tx, ty, 'Immune', '#aaa', 0.9);
      } else {
        spawnFloater(fx, tx, ty, 'Miss', '#bcbcbc', 0.95);
        if (ev.cover) spawnFloater(fx, tx, ty, `Cover +${ev.cover}`, '#8ab4ff', 0.9);
      }
    }, delay);
    return;
  }

  if (ev.type === 'spell' && !ev.void) {
    const at = ev.at;
    if (!at) return;
    if (ev.noEffect) {
      spawnFloater(fx, at.x, at.y, 'No effect', '#888', 1.1);
      return;
    }
    if (ev.killed) {
      spawnFloater(fx, at.x, at.y, 'SLAIN', '#f44', 1.4);
      return;
    }
    if (ev.stunned) {
      spawnFloater(fx, at.x, at.y, 'Stunned', '#fc8', 1.2);
      return;
    }
    if (ev.dmg) {
      spawnFloater(
        fx,
        at.x,
        at.y,
        `−${ev.dmg}`,
        colorForDtype(ev.dtype),
        1.1,
      );
      if (ev.saved) spawnFloater(fx, at.x, at.y, 'Saved ½', '#8cf', 0.95);
    } else if (ev.saved) {
      spawnFloater(fx, at.x, at.y, 'Saved', '#8cf', 1.0);
    }
    if (ev.cond) spawnFloater(fx, at.x, at.y, ev.cond, '#e8a', 1.15);
    return;
  }

  if (ev.type === 'death') {
    const at = ev.at;
    if (at) {
      spawnFloater(fx, at.x, at.y, '💀', '#fff', 1.35);
      spawnFloater(fx, at.x, at.y, 'Down', '#ccc', 1.0);
    }
    return;
  }

  if (ev.type === 'hazard' && ev.dmg && ev.at) {
    spawnFloater(fx, ev.at.x, ev.at.y, `−${ev.dmg}`, '#f80', 1.0);
  }
}

/**
 * Draw + prune FX. projectTile(col,row) → {x,y}|null in screen space.
 * @param {CanvasRenderingContext2D} ctx
 * @param {ReturnType<typeof createFxState>} fx
 * @param {(col:number,row:number)=>?{x:number,y:number}} projectTile
 */
export function drawFx(ctx, fx, projectTile) {
  const now = performance.now();

  // projectiles
  fx.projectiles = fx.projectiles.filter((p) => now - p.born < p.life);
  for (const p of fx.projectiles) {
    const a = projectTile(p.c0, p.r0);
    const b = projectTile(p.c1, p.r1);
    if (!a || !b) continue;
    const t = Math.min(1, (now - p.born) / p.life);
    // ease out
    const u = 1 - (1 - t) * (1 - t);
    const x = a.x + (b.x - a.x) * u;
    const y = a.y + (b.y - a.y) * u - Math.sin(u * Math.PI) * 18;
    ctx.save();
    ctx.fillStyle = p.color;
    ctx.strokeStyle = p.color;
    ctx.globalAlpha = 0.95;
    if (p.kind === 'slash') {
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(x, y - 10, 10, 0, Math.PI * 1.2);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.arc(x, y, 5, 0, Math.PI * 2);
      ctx.fill();
      // trail
      ctx.globalAlpha = 0.35;
      ctx.beginPath();
      ctx.arc(
        a.x + (b.x - a.x) * Math.max(0, u - 0.12),
        a.y + (b.y - a.y) * Math.max(0, u - 0.12) - Math.sin(Math.max(0, u - 0.12) * Math.PI) * 18,
        3,
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }
    ctx.restore();
  }

  // floaters
  fx.floaters = fx.floaters.filter((f) => now - f.born < f.life);
  for (const f of fx.floaters) {
    const base = projectTile(f.col, f.row);
    if (!base) continue;
    const t = (now - f.born) / f.life;
    const rise = t * 36;
    const alpha = t < 0.15 ? t / 0.15 : t > 0.7 ? (1 - t) / 0.3 : 1;
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
    const big = /CRIT|SLAIN|💀/.test(f.text);
    ctx.font = `bold ${big ? 16 : 14}px "Segoe UI", system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(0,0,0,.55)';
    ctx.fillStyle = f.color;
    const tx = base.x;
    const ty = base.y - 28 - rise;
    ctx.strokeText(f.text, tx, ty);
    ctx.fillText(f.text, tx, ty);
    ctx.restore();
  }
}
