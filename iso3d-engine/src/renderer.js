/**
 * WebGL2 isometric tile + unit renderer.
 * Pretty terrain: grass variation, dirt, water, stepped cliffs.
 */

import {
  createMat4,
  getCameraMatrix,
  gridToWorld,
  invert,
  transformMat4,
  worldToGrid,
} from './math.js?v=0.5.30';
import {
  TERRAIN,
  TERRAIN_COLORS,
  CLIFF_STRATA,
  heightAt,
  cellAt,
} from './map.js?v=0.5.30';
import { TerrainSampler } from './terrainTextures.js?v=0.5.30';

const VS = `#version 300 es
in vec3 aPos;
in vec3 aNormal;
in vec3 aColor;
uniform mat4 uMVP;
out vec3 vColor;
out vec3 vNormal;
out vec3 vWorld;
void main() {
  vWorld = aPos;
  gl_Position = uMVP * vec4(aPos, 1.0);
  vColor = aColor;
  vNormal = aNormal;
}`;

/**
 * Readable daylight lighting — kept simple so missing/zero uniforms can't
 * crush the scene to black. Floor is always well above 0.45 ambient.
 */
const FS = `#version 300 es
precision mediump float;
in vec3 vColor;
in vec3 vNormal;
in vec3 vWorld;
uniform vec3 uLightDir;
uniform vec3 uLightColor;
uniform vec3 uFillColor;
uniform vec3 uSkyColor;
uniform vec3 uGroundColor;
uniform vec3 uEyePos;
uniform float uTime;
out vec4 fragColor;
void main() {
  // Safe normal (never zero)
  vec3 n = vNormal;
  float nlen = length(n);
  n = nlen > 1e-4 ? n / nlen : vec3(0.0, 1.0, 0.0);

  // Safe light dir — default upward-ish if uniform is zero/unset
  vec3 L = uLightDir;
  float llen = length(L);
  L = llen > 1e-4 ? L / llen : vec3(0.45, 0.8, 0.35);

  // Half-lambert diffuse (never fully black on backfaces)
  float ndl = dot(n, L);
  float wrap = ndl * 0.5 + 0.5;
  float diff = wrap * wrap;

  // Hemisphere ambient: sky when facing up, warm ground bounce when down
  float hemi = clamp(n.y * 0.5 + 0.5, 0.0, 1.0);
  vec3 skyA = max(uSkyColor, vec3(0.45, 0.58, 0.75));
  vec3 gndA = max(uGroundColor, vec3(0.28, 0.26, 0.22));
  vec3 ambient = mix(gndA, skyA, hemi) * 0.72;

  // Key + cool fill
  vec3 keyC = max(uLightColor, vec3(0.85, 0.8, 0.7));
  vec3 fillC = max(uFillColor, vec3(0.35, 0.42, 0.55));
  vec3 fillDir = normalize(vec3(-L.x, 0.55, -L.z));
  float fill = max(dot(n, fillDir), 0.0) * 0.35;

  // Cliff faces (near-vertical) get a little extra fill so they stay readable
  float upright = 1.0 - smoothstep(0.2, 0.9, abs(n.y));
  fill += upright * 0.12;

  vec3 lighting = ambient + keyC * diff * 0.7 + fillC * fill;
  // Hard floor — terrain must never disappear into black
  lighting = max(lighting, vec3(0.42));

  vec3 col = vColor * lighting;

  // Water shimmer (only on blue-ish low surfaces)
  float waterHint = step(vWorld.y, 0.1) * smoothstep(0.15, 0.45, vColor.b - vColor.r * 0.8);
  col += keyC * waterHint * (0.08 + 0.05 * sin(vWorld.x * 6.0 + vWorld.z * 5.0 + uTime * 2.0));

  // Soft distance haze
  float dist = length(vWorld.xz);
  float fog = smoothstep(10.0, 28.0, dist);
  col = mix(col, skyA * 0.65, fog * 0.12);

  fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;

/**
 * Depth-tested camera-facing billboards (units/trees).
 * Feet at uOrigin; aCorner: x in [-0.5,0.5], y in [0,1] (0=feet, 1=head).
 * Terrain depth buffer occludes sprites behind walls.
 */
const BBS_VS = `#version 300 es
in vec2 aCorner;
uniform mat4 uMVP;
uniform vec3 uOrigin;
uniform vec3 uRight;
uniform vec3 uUp;
uniform float uWidth;
uniform float uHeight;
uniform vec4 uUV; // u0 v0 u1 v1
out vec2 vUV;
void main() {
  vec3 pos = uOrigin
    + uRight * (aCorner.x * uWidth)
    + uUp * (aCorner.y * uHeight);
  gl_Position = uMVP * vec4(pos, 1.0);
  float tx = aCorner.x + 0.5;
  float ty = aCorner.y;
  vUV = vec2(mix(uUV.x, uUV.z, tx), mix(uUV.y, uUV.w, ty));
}`;

const BBS_FS = `#version 300 es
precision mediump float;
in vec2 vUV;
uniform sampler2D uTex;
uniform float uGray; // 0 = color, 1 = corpse grayscale
uniform float uAlpha;
out vec4 fragColor;
void main() {
  vec4 c = texture(uTex, vUV);
  if (c.a < 0.08) discard;
  vec3 rgb = c.rgb;
  if (uGray > 0.5) {
    float g = dot(rgb, vec3(0.299, 0.587, 0.114));
    rgb = vec3(g) * 0.55;
  }
  fragColor = vec4(rgb, c.a * uAlpha);
}`;

/** Default sun: high over “northwest” of the map — readable cliff faces, warm tops. */
export const DEFAULT_SUN_DIR = Object.freeze([0.55, 0.82, 0.28]);
export const DEFAULT_SUN_COLOR = Object.freeze([1.0, 0.95, 0.85]);
export const DEFAULT_FILL_COLOR = Object.freeze([0.5, 0.58, 0.78]);
export const DEFAULT_GROUND_AMBIENT = Object.freeze([0.32, 0.3, 0.26]);

function compile(gl, type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(s);
    gl.deleteShader(s);
    throw new Error(`Shader compile failed: ${log}`);
  }
  return s;
}

function link(gl, vs, fs) {
  const p = gl.createProgram();
  gl.attachShader(p, vs);
  gl.attachShader(p, fs);
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    throw new Error(`Program link failed: ${gl.getProgramInfoLog(p)}`);
  }
  return p;
}

function addQuad(positions, normals, colors, v0, v1, v2, v3, n, c) {
  positions.push(...v0, ...v1, ...v2, ...v0, ...v2, ...v3);
  for (let i = 0; i < 6; i++) {
    normals.push(...n);
    colors.push(c[0], c[1], c[2]);
  }
}

/** Deterministic 0..1 hash from grid coords. */
function hash2(col, row, salt = 0) {
  let n = col * 374761393 + row * 668265263 + salt * 1274126177;
  n = (n ^ (n >> 13)) * 1274126177;
  n = n ^ (n >> 16);
  return (n >>> 0) / 4294967295;
}

function mulColor(c, s) {
  return [
    Math.min(1, Math.max(0, c[0] * s)),
    Math.min(1, Math.max(0, c[1] * s)),
    Math.min(1, Math.max(0, c[2] * s)),
  ];
}

function mixColor(a, b, t) {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ];
}

function topColorFor(type, col, row, h) {
  const base = (TERRAIN_COLORS[type] || TERRAIN_COLORS[0]).slice();
  const n = hash2(col, row, 1);
  const n2 = hash2(col, row, 7);

  if (type === TERRAIN.GRASS) {
    // Patchy lawn: yellow-green to deep green
    const lush = [0.28, 0.55, 0.22];
    const dry = [0.52, 0.62, 0.28];
    const flower = [0.45, 0.58, 0.30];
    let c = mixColor(lush, dry, n);
    if (n2 > 0.92) c = mixColor(c, [0.75, 0.55, 0.7], 0.35); // rare wildflower tint
    else if (n2 > 0.75) c = mixColor(c, flower, 0.4);
    // Higher plateaus a bit wind-scoured
    if (h > 0) c = mixColor(c, [0.55, 0.58, 0.32], 0.15 * h);
    return c;
  }
  if (type === TERRAIN.DIRT) {
    const dark = [0.42, 0.30, 0.18];
    const light = [0.68, 0.52, 0.34];
    return mixColor(dark, light, n * 0.7 + 0.15);
  }
  if (type === TERRAIN.WATER) {
    const deep = [0.10, 0.28, 0.52];
    const shallow = [0.22, 0.52, 0.72];
    const foam = [0.45, 0.70, 0.82];
    let c = mixColor(deep, shallow, n);
    if (n2 > 0.85) c = mixColor(c, foam, 0.35);
    return c;
  }
  if (type === TERRAIN.CLIFF) {
    const rockA = [0.55, 0.52, 0.48];
    const rockB = [0.42, 0.40, 0.38];
    const lichen = [0.40, 0.48, 0.32];
    let c = mixColor(rockA, rockB, n);
    if (n2 > 0.8) c = mixColor(c, lichen, 0.3);
    return c;
  }
  if (type === TERRAIN.SAND) {
    return mixColor([0.72, 0.64, 0.38], [0.88, 0.80, 0.52], n);
  }
  if (type === TERRAIN.MUD) {
    return mixColor([0.32, 0.24, 0.12], [0.48, 0.36, 0.18], n);
  }
  return mulColor(base, 0.9 + n * 0.2);
}

function strataColor(y0, y1, col, row) {
  const mid = (y0 + y1) * 0.5;
  // Water/void banks can sit below y=0 → floor(mid/0.35) is negative; clamp so CLIFF_STRATA[-1] never crashes (black screen).
  const band = Math.max(
    0,
    Math.min(CLIFF_STRATA.length - 1, Math.floor(mid / 0.35)),
  );
  const base = (CLIFF_STRATA[band] || CLIFF_STRATA[0]).slice();
  const n = hash2(col, row, band + 3);
  return mulColor(base, 0.88 + n * 0.2);
}

const TILE = 0.5; // half-size of tile (gap-free: 0.5 = full cell)
const STEP = 0.5; // world Y per height level
/**
 * Subdivide each top face so HQ ground textures read as real pixels.
 * Was 4 (= 4×4 mush). 16 ≈ 16px/tile; with 128×128 seamless maps this looks sharp.
 * Cost: TEX_SUB² quads per cell top (16→256) — fine for battle maps.
 */
const TEX_SUB = 16;
/** Texture periods per map tile (1 = full seamless tile face). */
const TEX_REPEAT = 1;

function applyHighlights(color, highlights, key, col, row) {
  let c = color;
  if (highlights?.dash?.has(key)) c = mixColor(c, [0.92, 0.22, 0.14], 0.55);
  else if (highlights?.move?.has(key)) c = mixColor(c, [0.2, 0.72, 0.38], 0.48);
  if (highlights?.climb?.has(key)) c = mixColor(c, [0.62, 0.38, 0.95], 0.32);
  else if (highlights?.jump?.has(key)) c = mixColor(c, [1.0, 0.84, 0.2], 0.32);
  // Dim full-range first (keep visible so 150ft isn't mistaken for the 20ft blast)
  if (highlights?.attackRangeMax?.has(key) && !highlights?.attackRange?.has(key)) {
    c = mixColor(c, [0.35, 0.65, 0.95], 0.38);
  }
  if (highlights?.attackRange?.has(key)) c = mixColor(c, [0.2, 0.7, 1.0], 0.55);
  if (highlights?.blast?.has(key)) c = mixColor(c, [1.0, 0.45, 0.12], 0.5);
  if (highlights?.attack?.has(key)) c = mixColor(c, [0.95, 0.2, 0.15], 0.48);
  if (highlights?.heal?.has(key)) c = mixColor(c, [0.2, 0.9, 0.35], 0.48);
  if (highlights?.selected && highlights.selected.col === col && highlights.selected.row === row) {
    c = mixColor(c, [1, 0.92, 0.25], 0.55);
  }
  if (highlights?.hover && highlights.hover.col === col && highlights.hover.row === row) {
    c = mulColor(c, 1.14);
  }
  if (highlights?.editHover && highlights.editHover.col === col && highlights.editHover.row === row) {
    c = mixColor(c, [1, 1, 1], 0.3);
  }
  return c;
}

/**
 * Pick albedo for a sub-cell from HQ terrain textures (nearest-neighbor).
 * World-stable UVs so adjacent tiles stitch when the PNG is seamless.
 * @param {TerrainSampler|null} sampler
 */
function sampleTopColor(sampler, cell, type, col, row, h, u, v) {
  const gKey = cell.gKey || 'grass';
  // Continuous UV across the map (not random crop) — looks like painted tiles
  const phaseU = ((col + u) * TEX_REPEAT) % 1;
  const phaseV = ((row + v) * TEX_REPEAT) % 1;
  if (sampler && sampler.ready) {
    const s = sampler.sample(gKey, phaseU, phaseV);
    if (s) {
      // Tiny per-cell shade so large flats aren't wallpaper-identical
      const shade = 0.96 + hash2(col, row, 7) * 0.08;
      const tinted = mulColor(s, shade);
      if (h > 0) return mixColor(tinted, [0.9, 0.9, 0.85], 0.06 * Math.min(h, 4));
      return tinted;
    }
  }
  return topColorFor(type, col, row, h);
}

function buildMapMesh(map, highlights, sampler) {
  const positions = [];
  const normals = [];
  const colors = [];
  const { cols, rows } = map;

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const cell = map.cells[row * cols + col];
      const h = cell.h;
      const type = cell.type;
      const ox = col - (cols - 1) / 2;
      const oz = row - (rows - 1) / 2;
      const key = `${col},${row}`;

      let yTop = h * STEP;
      // Water sits slightly lower so banks read as shores
      if (type === TERRAIN.WATER || cell.gKey === 'void') yTop = -0.06;

      const hs = TILE;

      // --- Top face: subdivided + RPM texture samples ---
      for (let iy = 0; iy < TEX_SUB; iy++) {
        for (let ix = 0; ix < TEX_SUB; ix++) {
          const u0 = ix / TEX_SUB;
          const u1 = (ix + 1) / TEX_SUB;
          const v0 = iy / TEX_SUB;
          const v1 = (iy + 1) / TEX_SUB;
          const uc = (u0 + u1) * 0.5;
          const vc = (v0 + v1) * 0.5;
          let color = sampleTopColor(sampler, cell, type, col, row, h, uc, vc);
          color = applyHighlights(color, highlights, key, col, row);
          const x0 = ox - hs + u0 * (hs * 2);
          const x1 = ox - hs + u1 * (hs * 2);
          const z0 = oz - hs + v0 * (hs * 2);
          const z1 = oz - hs + v1 * (hs * 2);
          addQuad(
            positions, normals, colors,
            [x0, yTop, z0],
            [x1, yTop, z0],
            [x1, yTop, z1],
            [x0, yTop, z1],
            [0, 1, 0],
            color,
          );
        }
      }

      // Water surface second layer (slightly raised shimmer plate)
      if (type === TERRAIN.WATER) {
        const base = sampleTopColor(sampler, cell, type, col, row, h, 0.5, 0.5);
        const wCol = mixColor(base, [0.55, 0.78, 0.9], 0.25);
        const wy = yTop + 0.03;
        const inset = 0.12;
        addQuad(
          positions, normals, colors,
          [ox - hs + inset, wy, oz - hs + inset],
          [ox + hs - inset, wy, oz - hs + inset],
          [ox + hs - inset, wy, oz + hs - inset],
          [ox - hs + inset, wy, oz + hs - inset],
          [0, 1, 0],
          wCol,
        );
      }

      // --- Cliff / bank sides: only where neighbor is lower ---
      const neighbors = [
        { dc: 0, dr: 1, n: [0, 0, 1] },   // +z
        { dc: 0, dr: -1, n: [0, 0, -1] }, // -z
        { dc: 1, dr: 0, n: [1, 0, 0] },   // +x
        { dc: -1, dr: 0, n: [-1, 0, 0] }, // -x
      ];

      for (const nb of neighbors) {
        const nh = heightAt(map, col + nb.dc, row + nb.dr);
        const nCell = cellAt(map, col + nb.dc, row + nb.dr);
        // Treat missing / water as height 0 ground for bank faces
        let neighborTop = nh * STEP;
        if (nCell && nCell.type === TERRAIN.WATER) neighborTop = -0.06;
        if (!nCell) neighborTop = -0.15; // outer void

        if (yTop <= neighborTop + 0.001) continue;

        // Draw vertical face from neighborTop → yTop in strata bands
        const bandH = 0.28;
        let y = neighborTop;
        let band = 0;
        const sideKey =
          cell.gKey === 'wall'
            ? 'wall'
            : cell.gKey === 'wood'
              ? 'wood'
              : cell.gKey === 'stone'
                ? 'stone'
                : null;
        while (y < yTop - 0.001) {
          const y2 = Math.min(yTop, y + bandH);
          let faceCol;
          const vMid = ((y + y2) * 0.5) / Math.max(0.01, yTop + 0.5);
          if (sideKey && sampler && sampler.ready) {
            const s = sampler.sample(sideKey, hash2(col, row, band) * 0.3 + 0.2, vMid);
            faceCol = s
              ? mulColor(s, 0.92 - band * 0.05)
              : strataColor(y, y2, col, row);
          } else if (type === TERRAIN.CLIFF || h >= 1) {
            faceCol = strataColor(y, y2, col, row);
            faceCol = mulColor(faceCol, 0.95 - band * 0.06);
          } else if (type === TERRAIN.DIRT) {
            faceCol = mulColor(topColorFor(TERRAIN.DIRT, col, row, 0), 0.7 - band * 0.05);
          } else if (type === TERRAIN.WATER) {
            faceCol = sampleTopColor(sampler, cell, type, col, row, h, 0.5, 0.5);
            faceCol = mulColor(faceCol, 0.55);
          } else {
            const topC = sampleTopColor(sampler, cell, type, col, row, h, 0.5, 0.5);
            faceCol = mixColor(
              [0.45, 0.35, 0.22],
              mulColor(topC, 0.75),
              band === 0 ? 0.35 : 0.1,
            );
          }

          // Build face quad oriented by neighbor normal
          const [nx, , nz] = nb.n;
          if (nz === 1) {
            addQuad(positions, normals, colors,
              [ox - hs, y, oz + hs], [ox + hs, y, oz + hs],
              [ox + hs, y2, oz + hs], [ox - hs, y2, oz + hs],
              nb.n, faceCol);
          } else if (nz === -1) {
            addQuad(positions, normals, colors,
              [ox + hs, y, oz - hs], [ox - hs, y, oz - hs],
              [ox - hs, y2, oz - hs], [ox + hs, y2, oz - hs],
              nb.n, faceCol);
          } else if (nx === 1) {
            addQuad(positions, normals, colors,
              [ox + hs, y, oz + hs], [ox + hs, y, oz - hs],
              [ox + hs, y2, oz - hs], [ox + hs, y2, oz + hs],
              nb.n, faceCol);
          } else {
            addQuad(positions, normals, colors,
              [ox - hs, y, oz - hs], [ox - hs, y, oz + hs],
              [ox - hs, y2, oz + hs], [ox - hs, y2, oz - hs],
              nb.n, faceCol);
          }

          y = y2;
          band += 1;
        }
      }
    }
  }

  // Soft ground under everything (void fill)
  {
    const s = Math.max(cols, rows) * 0.55 + 2;
    const gy = -0.2;
    const gcol = [0.08, 0.09, 0.11];
    addQuad(
      positions, normals, colors,
      [-s, gy, -s], [s, gy, -s], [s, gy, s], [-s, gy, s],
      [0, 1, 0], gcol,
    );
  }

  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    colors: new Float32Array(colors),
    count: positions.length / 3,
  };
}

function buildUnitMesh(units, map, activeId) {
  const positions = [];
  const normals = [];
  const colors = [];
  const r = 0.28;
  const bodyH = 0.7;
  const up = [0, 1, 0];

  for (const u of units) {
    if (!u.alive) continue;
    const cell = map.cells[u.row * map.cols + u.col];
    let baseY = (cell?.h ?? 0) * STEP;
    if (cell?.type === TERRAIN.WATER) baseY = -0.06;
    const { x: ox, z: oz } = gridToWorld(u.col, u.row, map.cols, map.rows);
    const c = u.color;
    const side = [c[0] * 0.7, c[1] * 0.7, c[2] * 0.7];
    const y0 = baseY + 0.02;
    const y1 = y0 + bodyH;
    const isActive = activeId != null && u.id === activeId;

    if (isActive) {
      const rr = 0.42;
      const ry = y0 + 0.01;
      const gold = [1.0, 0.85, 0.2];
      addQuad(positions, normals, colors,
        [ox - rr, ry, oz - rr], [ox + rr, ry, oz - rr],
        [ox + rr, ry, oz + rr], [ox - rr, ry, oz + rr],
        up, gold);
    }

    addQuad(positions, normals, colors,
      [ox - r, y1, oz - r], [ox + r, y1, oz - r],
      [ox + r, y1, oz + r], [ox - r, y1, oz + r],
      up, c);
    addQuad(positions, normals, colors,
      [ox - r, y0, oz + r], [ox + r, y0, oz + r],
      [ox + r, y1, oz + r], [ox - r, y1, oz + r],
      [0, 0, 1], side);
    addQuad(positions, normals, colors,
      [ox + r, y0, oz - r], [ox - r, y0, oz - r],
      [ox - r, y1, oz - r], [ox + r, y1, oz - r],
      [0, 0, -1], side);
    addQuad(positions, normals, colors,
      [ox + r, y0, oz + r], [ox + r, y0, oz - r],
      [ox + r, y1, oz - r], [ox + r, y1, oz + r],
      [1, 0, 0], side);
    addQuad(positions, normals, colors,
      [ox - r, y0, oz - r], [ox - r, y0, oz + r],
      [ox - r, y1, oz + r], [ox - r, y1, oz - r],
      [-1, 0, 0], side);

    const teamCol = u.team === 'player' ? [0.3, 0.7, 1.0] : [1.0, 0.35, 0.3];
    const tr = 0.12;
    addQuad(positions, normals, colors,
      [ox - tr, y1 + 0.08, oz - tr], [ox + tr, y1 + 0.08, oz - tr],
      [ox + tr, y1 + 0.08, oz + tr], [ox - tr, y1 + 0.08, oz + tr],
      up, teamCol);

    const barY = y1 + 0.18;
    const barW = 0.5;
    const barH = 0.06;
    const pct = Math.max(0, Math.min(1, u.hp / u.maxHp));
    const bg = [0.15, 0.15, 0.15];
    const fg = pct > 0.5 ? [0.25, 0.85, 0.35] : pct > 0.25 ? [0.9, 0.75, 0.2] : [0.9, 0.25, 0.2];
    addQuad(positions, normals, colors,
      [ox - barW / 2, barY, oz - 0.02],
      [ox + barW / 2, barY, oz - 0.02],
      [ox + barW / 2, barY + barH, oz - 0.02],
      [ox - barW / 2, barY + barH, oz - 0.02],
      [0, 0, 1], bg);
    if (pct > 0.01) {
      const left = ox - barW / 2;
      const right = left + barW * pct;
      addQuad(positions, normals, colors,
        [left, barY, oz - 0.015],
        [right, barY, oz - 0.015],
        [right, barY + barH, oz - 0.015],
        [left, barY + barH, oz - 0.015],
        [0, 0, 1], fg);
    }
  }

  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    colors: new Float32Array(colors),
    count: positions.length / 3,
  };
}

export class Renderer {
  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    this.gl = canvas.getContext('webgl2', { antialias: true, alpha: false });
    if (!this.gl) throw new Error('WebGL2 not supported');

    const gl = this.gl;
    const vs = compile(gl, gl.VERTEX_SHADER, VS);
    const fs = compile(gl, gl.FRAGMENT_SHADER, FS);
    this.program = link(gl, vs, fs);

    this.attribs = {
      pos: gl.getAttribLocation(this.program, 'aPos'),
      normal: gl.getAttribLocation(this.program, 'aNormal'),
      color: gl.getAttribLocation(this.program, 'aColor'),
    };
    this.uniforms = {
      mvp: gl.getUniformLocation(this.program, 'uMVP'),
      lightDir: gl.getUniformLocation(this.program, 'uLightDir'),
      lightColor: gl.getUniformLocation(this.program, 'uLightColor'),
      fillColor: gl.getUniformLocation(this.program, 'uFillColor'),
      skyColor: gl.getUniformLocation(this.program, 'uSkyColor'),
      groundColor: gl.getUniformLocation(this.program, 'uGroundColor'),
      eyePos: gl.getUniformLocation(this.program, 'uEyePos'),
      time: gl.getUniformLocation(this.program, 'uTime'),
    };

    this.mapVAO = this._createMeshVAO();
    this.unitVAO = this._createMeshVAO();
    this.mapCount = 0;
    this.unitCount = 0;

    // Depth-tested sprite billboards
    const bbsVs = compile(gl, gl.VERTEX_SHADER, BBS_VS);
    const bbsFs = compile(gl, gl.FRAGMENT_SHADER, BBS_FS);
    this.bbsProgram = link(gl, bbsVs, bbsFs);
    this.bbsAttribs = {
      corner: gl.getAttribLocation(this.bbsProgram, 'aCorner'),
    };
    this.bbsUniforms = {
      mvp: gl.getUniformLocation(this.bbsProgram, 'uMVP'),
      origin: gl.getUniformLocation(this.bbsProgram, 'uOrigin'),
      right: gl.getUniformLocation(this.bbsProgram, 'uRight'),
      up: gl.getUniformLocation(this.bbsProgram, 'uUp'),
      width: gl.getUniformLocation(this.bbsProgram, 'uWidth'),
      height: gl.getUniformLocation(this.bbsProgram, 'uHeight'),
      uv: gl.getUniformLocation(this.bbsProgram, 'uUV'),
      tex: gl.getUniformLocation(this.bbsProgram, 'uTex'),
      gray: gl.getUniformLocation(this.bbsProgram, 'uGray'),
      alpha: gl.getUniformLocation(this.bbsProgram, 'uAlpha'),
    };
    // Quad: two triangles, corner (x,y) with x -0.5..0.5, y 0..1
    this.bbsVAO = gl.createVertexArray();
    gl.bindVertexArray(this.bbsVAO);
    this.bbsBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.bbsBuf);
    const corners = new Float32Array([
      -0.5, 0, 0.5, 0, 0.5, 1, -0.5, 0, 0.5, 1, -0.5, 1,
    ]);
    gl.bufferData(gl.ARRAY_BUFFER, corners, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(this.bbsAttribs.corner);
    gl.vertexAttribPointer(this.bbsAttribs.corner, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
    /** @type {Map<string, WebGLTexture>} */
    this._glTex = new Map();
    this._billboards = [];

    this.cam = { rot: Math.PI / 4, zoom: 1.05, panX: 0, panY: 0 };
    this._mvp = createMat4();
    this._eye = [0, 0, 0];
    this._camRight = [1, 0, 0];
    this._dirtyMap = true;
    this._dirtyUnits = true;
    this._map = null;
    this._units = [];
    this._highlights = {};
    this._activeUnitId = null;
    this._start = performance.now();

    // Stable world-space lighting (does not spin with pan; still readable when orbiting)
    this.sunDir = [...DEFAULT_SUN_DIR];
    this.sunColor = [...DEFAULT_SUN_COLOR];
    this.fillColor = [...DEFAULT_FILL_COLOR];
    this.groundAmbient = [...DEFAULT_GROUND_AMBIENT];
    this.skyColor = [0.58, 0.74, 0.92];

    // RPM terrain textures → vertex colors (async; rebuild mesh when ready)
    this.sampler = new TerrainSampler(opts.assetBase || '');
    this.sampler.loadAll().then(() => {
      this._dirtyMap = true;
    });

    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.disable(gl.CULL_FACE);
    // Bright sky so a failed mesh never reads as “pure black void”
    gl.clearColor(this.skyColor[0], this.skyColor[1], this.skyColor[2], 1);
    gl.useProgram(this.program);

    // Immediate clear so the canvas isn't left transparent/black before first mesh
    const w0 = canvas.clientWidth || canvas.width || 800;
    const h0 = canvas.clientHeight || canvas.height || 600;
    canvas.width = w0;
    canvas.height = h0;
    gl.viewport(0, 0, w0, h0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  }

  _createMeshVAO() {
    const gl = this.gl;
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);

    const pos = gl.createBuffer();
    const norm = gl.createBuffer();
    const col = gl.createBuffer();

    gl.bindBuffer(gl.ARRAY_BUFFER, pos);
    gl.enableVertexAttribArray(this.attribs.pos);
    gl.vertexAttribPointer(this.attribs.pos, 3, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, norm);
    gl.enableVertexAttribArray(this.attribs.normal);
    gl.vertexAttribPointer(this.attribs.normal, 3, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, col);
    gl.enableVertexAttribArray(this.attribs.color);
    gl.vertexAttribPointer(this.attribs.color, 3, gl.FLOAT, false, 0, 0);

    gl.bindVertexArray(null);
    return { vao, pos, norm, col };
  }

  _upload(meshTarget, mesh) {
    const gl = this.gl;
    gl.bindVertexArray(meshTarget.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, meshTarget.pos);
    gl.bufferData(gl.ARRAY_BUFFER, mesh.positions, gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, meshTarget.norm);
    gl.bufferData(gl.ARRAY_BUFFER, mesh.normals, gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, meshTarget.col);
    gl.bufferData(gl.ARRAY_BUFFER, mesh.colors, gl.DYNAMIC_DRAW);
    gl.bindVertexArray(null);
  }

  setMap(map) {
    this._map = map;
    this._dirtyMap = true;
  }

  setUnits(units) {
    this._units = units;
    this._dirtyUnits = true;
  }

  setHighlights(highlights) {
    this._highlights = highlights || {};
    this._dirtyMap = true;
    if (highlights?.activeUnitId !== undefined) {
      this._activeUnitId = highlights.activeUnitId;
      this._dirtyUnits = true;
    }
  }

  setActiveUnitId(id) {
    this._activeUnitId = id;
    this._dirtyUnits = true;
  }

  /** Force rebuild after editor paint. */
  invalidateMap() {
    this._dirtyMap = true;
    this._dirtyUnits = true;
  }

  setCamera({ rot, zoom, panX, panY }) {
    if (rot !== undefined) this.cam.rot = rot;
    if (zoom !== undefined) this.cam.zoom = Math.max(0.35, Math.min(3.5, zoom));
    if (panX !== undefined) this.cam.panX = panX;
    if (panY !== undefined) this.cam.panY = panY;
  }

  getCamera() {
    return { ...this.cam };
  }

  /**
   * Optional runtime light tweaks.
   * @param {{ sunDir?:number[], sunColor?:number[], fillColor?:number[], groundAmbient?:number[], skyColor?:number[] }} opts
   */
  setLighting(opts = {}) {
    if (opts.sunDir) this.sunDir = [...opts.sunDir];
    if (opts.sunColor) this.sunColor = [...opts.sunColor];
    if (opts.fillColor) this.fillColor = [...opts.fillColor];
    if (opts.groundAmbient) this.groundAmbient = [...opts.groundAmbient];
    if (opts.skyColor) {
      this.skyColor = [...opts.skyColor];
      this.gl.clearColor(this.skyColor[0], this.skyColor[1], this.skyColor[2], 1);
    }
  }

  rotate(steps = 1) {
    this.cam.rot += (steps * Math.PI) / 2;
  }

  syncSize() {
    const w = this.canvas.clientWidth || 800;
    const h = this.canvas.clientHeight || 600;
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    return { w, h, aspect: w / Math.max(1, h) };
  }

  _refreshMeshes() {
    if (!this._map) return;
    if (this._dirtyMap) {
      const mesh = buildMapMesh(this._map, this._highlights, this.sampler);
      this._upload(this.mapVAO, mesh);
      this.mapCount = mesh.count;
      this._dirtyMap = false;
    }
    if (this._dirtyUnits) {
      const mesh = buildUnitMesh(this._units, this._map, this._activeUnitId);
      this._upload(this.unitVAO, mesh);
      this.unitCount = mesh.count;
      this._dirtyUnits = false;
    }
  }

  draw() {
    const gl = this.gl;
    const { w, h, aspect } = this.syncSize();
    // Always clear sky first — mesh build must never leave a black framebuffer.
    gl.viewport(0, 0, w, h);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    try {
      this._refreshMeshes();
    } catch (err) {
      console.error('[Iso3D Renderer] mesh build failed', err);
      return; // sky still visible
    }

    const { matrix, eye, right } = getCameraMatrix(
      this.cam.rot,
      this.cam.zoom,
      this.cam.panX,
      this.cam.panY,
      aspect,
      this._mvp,
    );
    this._eye = eye;
    this._camRight = right || [1, 0, 0];
    this._mvpCache = matrix;

    // Normalize sun (world space — independent of pan so cliffs keep consistent shading)
    let lx = this.sunDir[0];
    let ly = this.sunDir[1];
    let lz = this.sunDir[2];
    const llen = Math.hypot(lx, ly, lz) || 1;
    lx /= llen;
    ly /= llen;
    lz /= llen;

    const t = (performance.now() - this._start) / 1000;

    gl.useProgram(this.program);
    // Safe uniform set — skip null locations (optimized-out) so we never throw mid-draw
    const u3 = (loc, a, b, c) => {
      if (loc != null && loc !== -1) gl.uniform3f(loc, a, b, c);
    };
    const u1 = (loc, v) => {
      if (loc != null && loc !== -1) gl.uniform1f(loc, v);
    };
    if (this.uniforms.mvp != null) gl.uniformMatrix4fv(this.uniforms.mvp, false, matrix);
    u3(this.uniforms.lightDir, lx, ly, lz);
    u3(
      this.uniforms.lightColor,
      this.sunColor[0],
      this.sunColor[1],
      this.sunColor[2],
    );
    u3(
      this.uniforms.fillColor,
      this.fillColor[0],
      this.fillColor[1],
      this.fillColor[2],
    );
    u3(
      this.uniforms.skyColor,
      this.skyColor[0],
      this.skyColor[1],
      this.skyColor[2],
    );
    u3(
      this.uniforms.groundColor,
      this.groundAmbient[0],
      this.groundAmbient[1],
      this.groundAmbient[2],
    );
    u3(this.uniforms.eyePos, eye[0], eye[1], eye[2]);
    u1(this.uniforms.time, t);

    // Terrain first — writes depth so walls can hide sprites
    if (this.mapCount > 0) {
      gl.bindVertexArray(this.mapVAO.vao);
      gl.drawArrays(gl.TRIANGLES, 0, this.mapCount);
    }
    if (this.unitCount > 0) {
      gl.bindVertexArray(this.unitVAO.vao);
      gl.drawArrays(gl.TRIANGLES, 0, this.unitCount);
    }
    gl.bindVertexArray(null);
    // Billboards: host calls setBillboards + _drawBillboardsGL after building the list
    // (must not draw here — list is prepared after this clear/terrain pass)
  }

  /**
   * Queue billboards for the next draw() (cleared each frame by host).
   * @param {Array<{
   *   img: HTMLImageElement,
   *   origin: [number,number,number],
   *   width: number,
   *   height: number,
   *   u0:number, v0:number, u1:number, v1:number,
   *   gray?: boolean,
   *   alpha?: number,
   *   depth?: number,
   * }>} list
   */
  setBillboards(list) {
    this._billboards = list || [];
  }

  _ensureTex(img) {
    const gl = this.gl;
    const key = img.src || img;
    let tex = this._glTex.get(key);
    if (tex) return tex;
    tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    try {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
    } catch (e) {
      console.warn('[Iso3D] tex upload failed', e);
      gl.deleteTexture(tex);
      return null;
    }
    this._glTex.set(key, tex);
    return tex;
  }

  _drawBillboardsGL(mvp, rightIn) {
    const gl = this.gl;
    const list = this._billboards;
    if (!list.length) return;

    // Sort far → near for cleaner alpha; depth test still handles walls
    list.sort((a, b) => (a.depth ?? 0) - (b.depth ?? 0));

    let rx = rightIn[0];
    let ry = rightIn[1];
    let rz = rightIn[2];
    // Flatten right onto XZ (keep billboards upright in world Y)
    ry = 0;
    let rlen = Math.hypot(rx, rz) || 1;
    rx /= rlen;
    rz /= rlen;

    gl.useProgram(this.bbsProgram);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.depthMask(true);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.disable(gl.CULL_FACE);

    if (this.bbsUniforms.mvp)
      gl.uniformMatrix4fv(this.bbsUniforms.mvp, false, mvp);
    if (this.bbsUniforms.right)
      gl.uniform3f(this.bbsUniforms.right, rx, 0, rz);
    if (this.bbsUniforms.up) gl.uniform3f(this.bbsUniforms.up, 0, 1, 0);
    if (this.bbsUniforms.tex) gl.uniform1i(this.bbsUniforms.tex, 0);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindVertexArray(this.bbsVAO);

    for (const b of list) {
      if (!b.img || !b.img.complete || !b.img.naturalWidth) continue;
      const tex = this._ensureTex(b.img);
      if (!tex) continue;
      gl.bindTexture(gl.TEXTURE_2D, tex);
      const o = b.origin;
      if (this.bbsUniforms.origin)
        gl.uniform3f(this.bbsUniforms.origin, o[0], o[1], o[2]);
      if (this.bbsUniforms.width)
        gl.uniform1f(this.bbsUniforms.width, b.width);
      if (this.bbsUniforms.height)
        gl.uniform1f(this.bbsUniforms.height, b.height);
      if (this.bbsUniforms.uv)
        gl.uniform4f(this.bbsUniforms.uv, b.u0, b.v0, b.u1, b.v1);
      if (this.bbsUniforms.gray)
        gl.uniform1f(this.bbsUniforms.gray, b.gray ? 1 : 0);
      if (this.bbsUniforms.alpha)
        gl.uniform1f(this.bbsUniforms.alpha, b.alpha != null ? b.alpha : 1);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    }

    gl.bindVertexArray(null);
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.disable(gl.BLEND);
    gl.useProgram(this.program);
  }

  pickTile(clientX, clientY) {
    if (!this._map) return null;
    const rect = this.canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const { w, h, aspect } = this.syncSize();

    const ndcX = (x / w) * 2 - 1;
    const ndcY = 1 - (y / h) * 2;

    const { matrix } = getCameraMatrix(
      this.cam.rot,
      this.cam.zoom,
      this.cam.panX,
      this.cam.panY,
      aspect,
    );
    const inv = createMat4();
    if (!invert(inv, matrix)) return null;

    const near = transformMat4([], [ndcX, ndcY, -1], inv);
    const far = transformMat4([], [ndcX, ndcY, 1], inv);
    const dir = [far[0] - near[0], far[1] - near[1], far[2] - near[2]];
    const len = Math.hypot(dir[0], dir[1], dir[2]) || 1;
    dir[0] /= len; dir[1] /= len; dir[2] /= len;

    let best = null;
    let bestT = Infinity;
    const { cols, rows, cells } = this._map;

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const cell = cells[row * cols + col];
        let planeY = cell.h * STEP;
        if (cell.type === TERRAIN.WATER) planeY = -0.06;
        if (Math.abs(dir[1]) < 1e-6) continue;
        const t = (planeY - near[1]) / dir[1];
        if (t < 0 || t >= bestT) continue;
        const hx = near[0] + dir[0] * t;
        const hz = near[2] + dir[2] * t;
        const g = worldToGrid(hx, hz, cols, rows);
        if (g && g.col === col && g.row === row) {
          bestT = t;
          best = { col, row };
        }
      }
    }
    return best;
  }
}
