/**
 * Combat FX — particles, projectiles, blasts (presentation only).
 * Drawn in screen space via projectTile(col,row).
 */

/**
 * @typedef {{ col:number, row:number, text:string, color:string, born:number, life:number }} Floater
 * @typedef {{ c0:number, r0:number, c1:number, r1:number, born:number, life:number, color:string, kind:string, size?:number }} Projectile
 * @typedef {{ x:number, y:number, vx:number, vy:number, born:number, life:number, color:string, size:number, drag?:number, gravity?:number, kind?:string }} Particle
 * @typedef {{ col:number, row:number, born:number, life:number, radius:number, color:string, kind:string }} Burst
 */

export function createFxState() {
  return {
    /** @type {Floater[]} */
    floaters: [],
    /** @type {Projectile[]} */
    projectiles: [],
    /** @type {Particle[]} */
    particles: [],
    /** @type {Burst[]} */
    bursts: [],
  };
}

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
  if (d.includes('pierce') || d.includes('arrow')) return '#e8e0c8';
  if (d.includes('slash')) return '#f0f0f5';
  return '#ffe08a';
}

function pushParticle(fx, p) {
  fx.particles.push(p);
  if (fx.particles.length > 220) fx.particles.splice(0, fx.particles.length - 220);
}

export function spawnFloater(fx, col, row, text, color = '#fff', life = 1.1) {
  fx.floaters.push({
    col,
    row,
    text: String(text),
    color,
    born: performance.now(),
    life: life * 1000,
  });
  if (fx.floaters.length > 36) fx.floaters.shift();
}

/**
 * @param {'firebolt'|'arrow'|'bolt'|'slash'|'magic'} [kind]
 */
export function spawnProjectile(fx, c0, r0, c1, r1, kind = 'bolt', color = '#ffe08a') {
  const dist = Math.hypot(c1 - c0, r1 - r0);
  const life =
    kind === 'slash' ? 160 : kind === 'arrow' ? 220 + dist * 18 : 260 + dist * 22;
  fx.projectiles.push({
    c0,
    r0,
    c1,
    r1,
    born: performance.now(),
    life,
    color,
    kind,
    size: kind === 'arrow' ? 7 : kind === 'firebolt' ? 6 : 5,
  });
  if (fx.projectiles.length > 24) fx.projectiles.shift();
}

/** Fireball / AoE ground burst with particle shell */
export function spawnExplosion(fx, col, row, radiusTiles = 4, kind = 'fire') {
  const now = performance.now();
  const color =
    kind === 'fire'
      ? '#ff6a20'
      : kind === 'cold'
        ? '#7ec8ff'
        : kind === 'force'
          ? '#c9d4ff'
          : '#ffe08a';
  fx.bursts.push({
    col,
    row,
    born: now,
    life: 720,
    radius: Math.max(1, radiusTiles),
    color,
    kind: kind === 'fire' ? 'fireball' : 'burst',
  });
  if (fx.bursts.length > 12) fx.bursts.shift();

  // Embers / sparks (screen offsets applied at draw via projected center)
  const n = Math.min(48, 18 + radiusTiles * 6);
  for (let i = 0; i < n; i++) {
    const ang = (Math.PI * 2 * i) / n + Math.random() * 0.4;
    const sp = 40 + Math.random() * 90 + radiusTiles * 12;
    pushParticle(fx, {
      x: 0,
      y: 0,
      vx: Math.cos(ang) * sp,
      vy: Math.sin(ang) * sp * 0.75 - 20,
      born: now,
      life: 350 + Math.random() * 450,
      color: Math.random() > 0.35 ? color : '#ffd56a',
      size: 2 + Math.random() * 3.5,
      drag: 0.92,
      gravity: 55,
      kind: 'ember',
      _anchorCol: col,
      _anchorRow: row,
      _anchored: true,
    });
  }
  // Smoke puffs
  for (let i = 0; i < 10; i++) {
    const ang = Math.random() * Math.PI * 2;
    pushParticle(fx, {
      x: 0,
      y: 0,
      vx: Math.cos(ang) * 25,
      vy: -30 - Math.random() * 40,
      born: now,
      life: 500 + Math.random() * 400,
      color: 'rgba(40,30,28,0.55)',
      size: 8 + Math.random() * 12,
      drag: 0.96,
      gravity: -8,
      kind: 'smoke',
      _anchorCol: col,
      _anchorRow: row,
      _anchored: true,
    });
  }
}

/** Hit / miss / crit impact at a cell */
export function spawnImpact(fx, col, row, kind = 'hit') {
  const now = performance.now();
  if (kind === 'miss') {
    spawnFloater(fx, col, row, 'Miss', '#bcbcbc', 0.9);
    for (let i = 0; i < 6; i++) {
      const ang = Math.random() * Math.PI * 2;
      pushParticle(fx, {
        x: 0,
        y: 0,
        vx: Math.cos(ang) * 35,
        vy: Math.sin(ang) * 20,
        born: now,
        life: 280,
        color: '#d0d0d0',
        size: 2,
        drag: 0.9,
        gravity: 10,
        kind: 'spark',
        _anchorCol: col,
        _anchorRow: row,
        _anchored: true,
      });
    }
    return;
  }
  const crit = kind === 'crit';
  spawnFloater(
    fx,
    col,
    row,
    crit ? 'CRIT!' : 'Hit',
    crit ? '#ffd24a' : '#ff8a6a',
    crit ? 1.25 : 0.95,
  );
  const n = crit ? 22 : 12;
  const colr = crit ? '#ffd24a' : '#ff6b4a';
  for (let i = 0; i < n; i++) {
    const ang = Math.random() * Math.PI * 2;
    const sp = (crit ? 70 : 45) + Math.random() * 50;
    pushParticle(fx, {
      x: 0,
      y: 0,
      vx: Math.cos(ang) * sp,
      vy: Math.sin(ang) * sp * 0.7 - 15,
      born: now,
      life: 280 + Math.random() * 280,
      color: colr,
      size: crit ? 3 + Math.random() * 3 : 2 + Math.random() * 2,
      drag: 0.9,
      gravity: 40,
      kind: 'spark',
      _anchorCol: col,
      _anchorRow: row,
      _anchored: true,
    });
  }
}

/**
 * Trail particles while a projectile is in flight (called from draw).
 */
function trailFromProjectile(fx, p, x, y, now) {
  if (Math.random() > 0.55) return;
  const kind = p.kind;
  if (kind === 'firebolt' || kind === 'bolt') {
    pushParticle(fx, {
      x,
      y,
      vx: (Math.random() - 0.5) * 30,
      vy: (Math.random() - 0.5) * 30 - 10,
      born: now,
      life: 180 + Math.random() * 120,
      color: p.color,
      size: 2 + Math.random() * 2,
      drag: 0.88,
      gravity: -5,
      kind: 'trail',
    });
  } else if (kind === 'arrow') {
    pushParticle(fx, {
      x,
      y,
      vx: (Math.random() - 0.5) * 12,
      vy: (Math.random() - 0.5) * 12,
      born: now,
      life: 120,
      color: 'rgba(220,210,180,0.5)',
      size: 1.5,
      drag: 0.9,
      gravity: 0,
      kind: 'trail',
    });
  }
}

/**
 * Consume a Grimoire Events payload and queue FX.
 */
export function fxFromGameEvent(fx, ev) {
  if (!ev || !ev.type) return;

  if (ev.type === 'attack' && !ev.void) {
    const from = ev.from;
    const to = ev.to;
    if (from && to && (from.x !== to.x || from.y !== to.y)) {
      const ranged = !!(ev.ranged || (ev.tiles || 0) > 1);
      const dtype = String(ev.dtype || '');
      let kind = 'bolt';
      if (!ranged) kind = 'slash';
      else if (/pierce|arrow|bow|crossbow/i.test(dtype + (ev.name || '')))
        kind = 'arrow';
      else if (/fire/i.test(dtype)) kind = 'firebolt';
      else kind = 'bolt';
      spawnProjectile(
        fx,
        from.x,
        from.y,
        to.x,
        to.y,
        kind,
        colorForDtype(ev.dtype),
      );
    }
    const delay = ev.ranged || (ev.tiles || 0) > 1 ? 260 : 90;
    const tx = to ? to.x : null;
    const ty = to ? to.y : null;
    if (tx == null || ty == null) return;
    setTimeout(() => {
      if (ev.sanctuary && ev.sanctuary.blocked) {
        spawnFloater(fx, tx, ty, 'Sanctuary', '#9cf', 1.2);
        return;
      }
      if (ev.adv === 1) spawnFloater(fx, tx, ty, 'ADV', '#7dffa0', 0.85);
      else if (ev.adv === -1) spawnFloater(fx, tx, ty, 'DIS', '#ff9a7a', 0.85);
      if (ev.hit) {
        spawnImpact(fx, tx, ty, ev.crit ? 'crit' : 'hit');
        const label = ev.crit ? `CRIT ${ev.dmg}` : `−${ev.dmg}`;
        spawnFloater(fx, tx, ty, label, ev.crit ? '#ffd24a' : '#ff6b6b', 1.15);
        if (ev.sneak) spawnFloater(fx, tx, ty, `Sneak +${ev.sneak}`, '#c9f', 1.05);
        if (ev.cover) spawnFloater(fx, tx, ty, `Cover +${ev.cover}`, '#8ab4ff', 1.0);
        if (ev.mult === 0.5) spawnFloater(fx, tx, ty, 'Resist', '#8fd', 0.9);
        if (ev.mult === 2) spawnFloater(fx, tx, ty, 'Vulnerable!', '#f86', 0.9);
        if (ev.mult === 0) spawnFloater(fx, tx, ty, 'Immune', '#aaa', 0.9);
      } else {
        spawnImpact(fx, tx, ty, 'miss');
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
      spawnFloater(fx, at.x, at.y, `−${ev.dmg}`, colorForDtype(ev.dtype), 1.1);
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
      spawnFloater(fx, at.x, at.y, 'Down', '#ccc', 1.0);
      spawnImpact(fx, at.x, at.y, 'hit');
    }
    return;
  }

  if (ev.type === 'hazard' && ev.dmg && ev.at) {
    spawnFloater(fx, ev.at.x, ev.at.y, `−${ev.dmg}`, '#f80', 1.0);
  }
}

/**
 * Draw + prune FX.
 * @param {CanvasRenderingContext2D} ctx
 * @param {ReturnType<typeof createFxState>} fx
 * @param {(col:number,row:number)=>?{x:number,y:number}} projectTile
 * @param {number} [tilePx]
 */
export function drawFx(ctx, fx, projectTile, tilePx = 40) {
  const now = performance.now();
  const dt = 1 / 60; // presentation step (frame-rate independent enough for FX)

  // --- Bursts (expanding rings / fireball core) ---
  fx.bursts = fx.bursts.filter((b) => now - b.born < b.life);
  for (const b of fx.bursts) {
    const base = projectTile(b.col, b.row);
    if (!base) continue;
    const t = (now - b.born) / b.life;
    const r = tilePx * (0.35 + b.radius * 0.55) * (0.25 + t * 0.95);
    const alpha = t < 0.12 ? t / 0.12 : Math.max(0, 1 - (t - 0.12) / 0.88);
    ctx.save();
    ctx.globalAlpha = alpha * 0.85;
    if (b.kind === 'fireball') {
      const g = ctx.createRadialGradient(base.x, base.y, r * 0.05, base.x, base.y, r);
      g.addColorStop(0, 'rgba(255,240,180,0.95)');
      g.addColorStop(0.25, 'rgba(255,140,40,0.75)');
      g.addColorStop(0.55, 'rgba(220,50,20,0.4)');
      g.addColorStop(1, 'rgba(40,10,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(base.x, base.y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = `rgba(255,200,80,${0.7 * alpha})`;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(base.x, base.y, r * 0.72, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      ctx.strokeStyle = b.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(base.x, base.y, r, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  // --- Projectiles ---
  fx.projectiles = fx.projectiles.filter((p) => now - p.born < p.life);
  for (const p of fx.projectiles) {
    const a = projectTile(p.c0, p.r0);
    const b = projectTile(p.c1, p.r1);
    if (!a || !b) continue;
    const t = Math.min(1, (now - p.born) / p.life);
    const u = 1 - (1 - t) * (1 - t);
    const arc = p.kind === 'arrow' ? 28 : p.kind === 'slash' ? 8 : 16;
    const x = a.x + (b.x - a.x) * u;
    const y = a.y + (b.y - a.y) * u - Math.sin(u * Math.PI) * arc;
    const ang = Math.atan2(b.y - a.y, b.x - a.x);

    trailFromProjectile(fx, p, x, y, now);

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(ang);
    ctx.globalAlpha = 0.95;

    if (p.kind === 'slash') {
      ctx.strokeStyle = p.color;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, -6, 12, -0.2, Math.PI * 0.9);
      ctx.stroke();
    } else if (p.kind === 'arrow') {
      // shaft
      ctx.strokeStyle = '#c4a574';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-10, 0);
      ctx.lineTo(8, 0);
      ctx.stroke();
      // head
      ctx.fillStyle = '#e8e0d0';
      ctx.beginPath();
      ctx.moveTo(12, 0);
      ctx.lineTo(4, -3.5);
      ctx.lineTo(4, 3.5);
      ctx.closePath();
      ctx.fill();
      // fletching
      ctx.strokeStyle = '#8af';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(-10, 0);
      ctx.lineTo(-14, -4);
      ctx.moveTo(-10, 0);
      ctx.lineTo(-14, 4);
      ctx.stroke();
    } else if (p.kind === 'firebolt') {
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 10);
      g.addColorStop(0, '#fff6c8');
      g.addColorStop(0.35, p.color);
      g.addColorStop(1, 'rgba(255,80,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(0, 0, 11, 6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(2, 0, 2.2, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // generic magic bolt
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 8;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.ellipse(0, 0, 8, 4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#fff';
      ctx.globalAlpha = 0.9;
      ctx.beginPath();
      ctx.arc(1, 0, 2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // --- Particles (screen-space; anchored ones re-base each frame) ---
  const next = [];
  for (const p of fx.particles) {
    const age = now - p.born;
    if (age >= p.life) continue;
    let ox = 0;
    let oy = 0;
    if (p._anchored) {
      const base = projectTile(p._anchorCol, p._anchorRow);
      if (!base) continue;
      ox = base.x;
      oy = base.y;
    }
    // integrate in "particle local" space then offset
    const lifeT = age / p.life;
    const drag = p.drag != null ? p.drag : 0.94;
    p.vx *= drag;
    p.vy *= drag;
    p.vy += (p.gravity != null ? p.gravity : 30) * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    const alpha =
      lifeT < 0.1 ? lifeT / 0.1 : Math.max(0, 1 - (lifeT - 0.1) / 0.9);
    const px = ox + p.x;
    const py = oy + p.y;
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
    if (p.kind === 'smoke') {
      ctx.fillStyle = typeof p.color === 'string' ? p.color : 'rgba(50,40,40,0.4)';
      ctx.beginPath();
      ctx.arc(px, py, p.size * (1 + lifeT), 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(px, py, Math.max(0.8, p.size * (1 - lifeT * 0.4)), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    next.push(p);
  }
  fx.particles = next;

  // --- Floaters ---
  fx.floaters = fx.floaters.filter((f) => now - f.born < f.life);
  for (const f of fx.floaters) {
    const base = projectTile(f.col, f.row);
    if (!base) continue;
    const t = (now - f.born) / f.life;
    const rise = t * 40;
    const alpha = t < 0.12 ? t / 0.12 : t > 0.65 ? (1 - t) / 0.35 : 1;
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
    const big = /CRIT|SLAIN|Down/.test(f.text);
    ctx.font = `bold ${big ? 17 : 14}px "Segoe UI", system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.lineWidth = 3.5;
    ctx.strokeStyle = 'rgba(0,0,0,.6)';
    ctx.fillStyle = f.color;
    const tx = base.x;
    const ty = base.y - 30 - rise;
    ctx.strokeText(f.text, tx, ty);
    ctx.fillText(f.text, tx, ty);
    ctx.restore();
  }
}
