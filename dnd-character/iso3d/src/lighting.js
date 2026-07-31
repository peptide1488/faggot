/**
 * Scene lighting for Iso3D — sun profiles, torch points, tile illumination.
 * Visual: renderer uses sunDir + ambientFloor + point lights.
 * Rules (Grimoire): tileLightLevel 0=dark / 1=dim / 2=bright.
 */

/** @typedef {{ col:number, row:number, radius:number, color?:number[], intensity?:number, kind?:string }} PointLight */

export const LIGHT_PRESETS = {
  /** Full daylight — tuned for real GPU albedo textures (not flat vertex color) */
  day: {
    id: 'day',
    sunDir: [0.55, 0.82, 0.28],
    sunColor: [1.0, 0.96, 0.88],
    fillColor: [0.55, 0.62, 0.8],
    skyColor: [0.58, 0.74, 0.92],
    groundAmbient: [0.36, 0.34, 0.3],
    ambientFloor: 0.5,
    keyStrength: 0.62,
    /** Rules ambient: bright outdoors */
    ambientLevel: 2,
    shadowStrength: 0.22,
  },
  /** Low sun — long cliff shadows, warm gold */
  sunset: {
    id: 'sunset',
    sunDir: [0.92, 0.22, 0.28],
    sunColor: [1.0, 0.55, 0.28],
    fillColor: [0.35, 0.32, 0.55],
    skyColor: [0.55, 0.35, 0.42],
    groundAmbient: [0.28, 0.18, 0.14],
    ambientFloor: 0.22,
    keyStrength: 1.05,
    ambientLevel: 2,
    shadowStrength: 0.55,
  },
  /** Moonlit exterior */
  night: {
    id: 'night',
    sunDir: [0.35, 0.55, 0.65],
    sunColor: [0.35, 0.42, 0.65],
    fillColor: [0.12, 0.14, 0.22],
    skyColor: [0.06, 0.08, 0.14],
    groundAmbient: [0.08, 0.09, 0.12],
    ambientFloor: 0.08,
    keyStrength: 0.25,
    ambientLevel: 0,
    shadowStrength: 0.15,
  },
  /**
   * Indoor crypt — almost no sky, torches do the work. Was tuned near-literal-(0,0,0):
   * fine for a static camera, but the camera now instantly snaps to whoever's turn is
   * active every round (see frameCameraOnActiveUnit) — any unit standing away from a
   * torch landed the view on true black, reading as a flash/glitch rather than "dark
   * dungeon" (live report: "flashes black between characters and actions"). Floor
   * raised just enough that geometry always stays dimly visible; still by far the
   * darkest preset, torches still do almost all the real lighting work.
   */
  dungeon: {
    id: 'dungeon',
    sunDir: [0.2, 1.0, 0.15],
    sunColor: [0.08, 0.08, 0.1],
    fillColor: [0.06, 0.07, 0.1],
    skyColor: [0.05, 0.05, 0.08],
    groundAmbient: [0.1, 0.1, 0.12],
    ambientFloor: 0.13,
    keyStrength: 0.08,
    ambientLevel: 0,
    shadowStrength: 0.1,
  },
};

/**
 * Max point lights sampled in the fragment shaders.
 * Cheap lighting (ambient + inverse-square-ish atten) — 32 is fine for dungeon maps.
 * Only if a map somehow has more do we keep the nearest-to-camera subset.
 */
export const MAX_GPU_LIGHTS = 32;

/**
 * Resolve map.light into a full profile + point list.
 * Keeps ALL lights for rules/vertex paint; GPU picks nearest at draw time.
 * @param {object|null|undefined} mapLight
 * @param {PointLight[]} [extraPoints]
 */
export function resolveLighting(mapLight, extraPoints = [], darkZones = []) {
  const mode = (mapLight && mapLight.mode) || 'day';
  const base = { ...(LIGHT_PRESETS[mode] || LIGHT_PRESETS.day) };
  if (mapLight) {
    if (mapLight.sunDir) base.sunDir = mapLight.sunDir;
    if (mapLight.sunColor) base.sunColor = mapLight.sunColor;
    if (mapLight.fillColor) base.fillColor = mapLight.fillColor;
    if (mapLight.skyColor) base.skyColor = mapLight.skyColor;
    if (mapLight.groundAmbient) base.groundAmbient = mapLight.groundAmbient;
    if (mapLight.ambientFloor != null) base.ambientFloor = mapLight.ambientFloor;
    if (mapLight.keyStrength != null) base.keyStrength = mapLight.keyStrength;
    if (mapLight.ambientLevel != null) base.ambientLevel = mapLight.ambientLevel;
    if (mapLight.shadowStrength != null) base.shadowStrength = mapLight.shadowStrength;
  }
  // Spell / dynamic first, then map torches. Dedupe same tile (map + decor both list torches).
  const points = [];
  const seen = new Set();
  const push = (p) => {
    if (!p || p.col == null || p.row == null) return;
    const n = normalizePoint(p);
    const k = n.col + ',' + n.row;
    if (seen.has(k)) {
      // Keep the stronger of two entries on the same tile
      const i = points.findIndex((x) => x.col === n.col && x.row === n.row);
      if (i >= 0 && (n.intensity || 1) > (points[i].intensity || 1)) points[i] = n;
      return;
    }
    seen.add(k);
    points.push(n);
  };
  for (const p of extraPoints) push(p);
  if (mapLight && Array.isArray(mapLight.points)) {
    for (const p of mapLight.points) push(p);
  }
  base.points = points;
  // darkZones ride along on the profile so tileIllumination01 can enforce them (0.6.18).
  // darkZones ride along on the resolved profile so tileIllumination01 can enforce them (0.6.18).
  base.darkZones = (darkZones || []).filter(z => z && z.col != null && z.row != null);
  return base;
}

/**
 * Pick the N lights nearest a focus (grid col/row or world x/z via kind).
 * @param {PointLight[]} points
 * @param {{col?:number,row?:number,x?:number,z?:number}} focus
 * @param {number} [maxN]
 */
export function pickNearestLights(points, focus, maxN = MAX_GPU_LIGHTS) {
  if (!points || !points.length) return [];
  const fc = focus.col != null ? focus.col : 0;
  const fr = focus.row != null ? focus.row : 0;
  const useWorld = focus.x != null && focus.z != null;
  const scored = points.map((p) => {
    let d;
    if (useWorld && p.pos) {
      d = Math.hypot(p.pos[0] - focus.x, p.pos[2] - focus.z);
    } else {
      d = Math.hypot((p.col | 0) - fc, (p.row | 0) - fr);
    }
    return { p, d };
  });
  scored.sort((a, b) => a.d - b.d);
  return scored.slice(0, maxN).map((s) => s.p);
}

function normalizePoint(p) {
  return {
    col: p.col | 0,
    row: p.row | 0,
    radius: p.radius != null ? Number(p.radius) : 4,
    color: p.color || [1.0, 0.62, 0.28],
    intensity: p.intensity != null ? Number(p.intensity) : 1.2,
    kind: p.kind || 'torch',
  };
}

/**
 * Continuous 0..1 illumination for a tile (visual + rules base).
 * ambientLevel 0–2 contributes baseline; points add falloff.
 */
export function tileIllumination01(profile, col, row) {
  const amb =
    profile.ambientLevel >= 2
      ? 0.92
      : profile.ambientLevel === 1
        ? 0.45
        : profile.ambientLevel > 0
          ? 0.2
          : 0.06;
  let v = amb;
  for (const p of profile.points || []) {
    const d = Math.max(Math.abs(col - p.col), Math.abs(row - p.row)); // Chebyshev tiles
    const r = Math.max(0.5, p.radius);
    if (d > r) continue;
    const t = 1 - d / r;
    v += (p.intensity || 1) * t * t * 0.85;
  }
  // Magical darkness (Iso3D 0.6.18). Applied AFTER the point lights and as a hard floor rather
  // than a subtraction, because that is what the spell does: Darkness doesn't dim a torch, it
  // beats it — a light source inside the sphere illuminates nothing. Subtracting would let a
  // bright enough torch "win", which is exactly the wrong ruling.
  //
  // Previously host.js dropped these entries with "magical darkness is rules-only; skip as a
  // point light", so Grimoire's rules went dark while the map stayed lit and casting Darkness
  // looked like it had done nothing at all.
  for (const z of profile.darkZones || []) {
    const d = Math.max(Math.abs(col - z.col), Math.abs(row - z.row));
    if (d <= Math.max(0, z.radius)) return 0.04;   // below the 0.28 dim threshold => level 0
  }
  return Math.max(0, Math.min(1.15, v));
}

/** Rules: 0 = darkness, 1 = dim, 2 = bright */
export function tileLightLevel(profile, col, row) {
  const v = tileIllumination01(profile, col, row);
  if (v >= 0.72) return 2;
  if (v >= 0.28) return 1;
  return 0;
}

/**
 * Vertex-paint shadow: if higher ground lies toward the sun, darken this tile.
 * Cheap cliff-cast “shadows” without a shadow map.
 */
export function sunShadowFactor(heightFn, col, row, sunDir, strength = 0.4) {
  if (!strength || !sunDir) return 1;
  const sx = sunDir[0];
  const sz = sunDir[2];
  const len = Math.hypot(sx, sz) || 1;
  const dx = sx / len;
  const dz = sz / len;
  const myH = heightFn(col, row) || 0;
  let factor = 1;
  for (let s = 1; s <= 5; s++) {
    const c = Math.round(col + dx * s);
    const r = Math.round(row + dz * s);
    const h = heightFn(c, r);
    if (h == null) continue;
    if (h > myH) {
      const block = Math.min(1, (h - myH) / s);
      factor *= 1 - strength * block * 0.85;
    }
  }
  return Math.max(0.25, factor);
}

/** Billboard/unit darken factor from local light (1 = full color). */
export function spriteLightDarken(profile, col, row) {
  const v = tileIllumination01(profile, col | 0, row | 0);
  // Never pure black — still readable in dungeon corners
  return Math.max(0.22, Math.min(1, 0.18 + v * 0.9));
}
