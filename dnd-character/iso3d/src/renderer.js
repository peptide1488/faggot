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
} from './math.js?v=0.5.48';
import {
  TERRAIN,
  TERRAIN_COLORS,
  CLIFF_STRATA,
  heightAt,
  cellAt,
} from './map.js?v=0.5.48';
import { TerrainSampler } from './terrainTextures.js?v=0.5.48';
import {
  resolveLighting,
  sunShadowFactor,
  tileIllumination01,
  MAX_GPU_LIGHTS,
} from './lighting.js?v=0.5.48';

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
 * Directional sun + hemisphere ambient + point lights (torches).
 * Cheap atten — we run up to MAX_GPU_LIGHTS (32) without fuss.
 * Vertex colors may already bake soft sun-occlusion (cliff cast shadows).
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
uniform float uAmbientFloor;
uniform float uKeyStrength;
uniform int uNumLights;
uniform vec3 uPtPos[32];
uniform vec3 uPtCol[32];
uniform float uPtRad[32];
out vec4 fragColor;
void main() {
  vec3 n = vNormal;
  float nlen = length(n);
  n = nlen > 1e-4 ? n / nlen : vec3(0.0, 1.0, 0.0);

  vec3 L = uLightDir;
  float llen = length(L);
  L = llen > 1e-4 ? L / llen : vec3(0.45, 0.8, 0.35);

  float ndl = dot(n, L);
  float wrap = ndl * 0.5 + 0.5;
  float diff = wrap * wrap;

  float hemi = clamp(n.y * 0.5 + 0.5, 0.0, 1.0);
  // Allow very dark sky/ground for dungeons (don't force bright day ambient)
  vec3 skyA = uSkyColor;
  vec3 gndA = uGroundColor;
  float ambScale = mix(0.35, 0.72, clamp(uAmbientFloor * 1.6, 0.0, 1.0));
  vec3 ambient = mix(gndA, skyA, hemi) * ambScale;

  vec3 keyC = uLightColor;
  vec3 fillC = uFillColor;
  vec3 fillDir = normalize(vec3(-L.x, 0.55, -L.z));
  float fill = max(dot(n, fillDir), 0.0) * 0.35;

  float upright = 1.0 - smoothstep(0.2, 0.9, abs(n.y));
  fill += upright * 0.12;

  float keyStr = uKeyStrength > 0.01 ? uKeyStrength : 0.7;
  vec3 lighting = ambient + keyC * diff * keyStr + fillC * fill;

  // Point lights (torches / spell lights) — world-space
  int nL = uNumLights;
  if (nL > 32) nL = 32;
  for (int i = 0; i < 32; i++) {
    if (i >= nL) break;
    vec3 toL = uPtPos[i] - vWorld;
    float dist = length(toL);
    float rad = max(uPtRad[i], 0.35);
    float att = 1.0 - smoothstep(0.0, rad, dist);
    att = att * att;
    vec3 ldir = dist > 1e-4 ? toL / dist : vec3(0.0, 1.0, 0.0);
    float pndl = max(dot(n, ldir), 0.0);
    // Extra glow on floors facing up (torch puddles)
    float floorBoost = max(n.y, 0.0) * 0.55;
    lighting += uPtCol[i] * att * (0.35 + 0.65 * pndl + floorBoost);
  }

  float floorMin = clamp(uAmbientFloor, 0.02, 0.55);
  lighting = max(lighting, vec3(floorMin));

  vec3 col = vColor * lighting;

  float waterHint = step(vWorld.y, 0.1) * smoothstep(0.15, 0.45, vColor.b - vColor.r * 0.8);
  col += keyC * waterHint * (0.08 + 0.05 * sin(vWorld.x * 6.0 + vWorld.z * 5.0 + uTime * 2.0));

  // Torch flicker tint near warm point lights
  float flicker = 0.0;
  for (int i = 0; i < 32; i++) {
    if (i >= nL) break;
    float d2 = length(uPtPos[i] - vWorld);
    float rad = max(uPtRad[i], 0.35);
    float a = 1.0 - smoothstep(0.0, rad * 0.85, d2);
    flicker += a * (0.04 + 0.03 * sin(uTime * 7.0 + float(i) * 1.7 + vWorld.x));
  }
  col += vec3(1.0, 0.55, 0.2) * flicker;

  float dist = length(vWorld.xz);
  float fog = smoothstep(10.0, 28.0, dist);
  col = mix(col, skyA * 0.55, fog * 0.12);

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
out vec3 vWorld;
void main() {
  vec3 pos = uOrigin
    + uRight * (aCorner.x * uWidth)
    + uUp * (aCorner.y * uHeight);
  vWorld = pos;
  gl_Position = uMVP * vec4(pos, 1.0);
  float tx = aCorner.x + 0.5;
  float ty = aCorner.y;
  vUV = vec2(mix(uUV.x, uUV.z, tx), mix(uUV.y, uUV.w, ty));
}`;

/**
 * Same ambient + point-light model as terrain so units/trees match the map.
 * uEmissive = 1 for torches (self-lit). uDarken multiplies after light (corpses).
 */
const BBS_FS = `#version 300 es
precision mediump float;
in vec2 vUV;
in vec3 vWorld;
uniform sampler2D uTex;
uniform float uGray;
uniform float uDarken;
uniform float uAlpha;
uniform float uEmissive;
uniform float uAmbientFloor;
uniform vec3 uAmbColor;
uniform vec3 uKeyColor;
uniform float uKeyStrength;
uniform int uNumLights;
uniform vec3 uPtPos[32];
uniform vec3 uPtCol[32];
uniform float uPtRad[32];
out vec4 fragColor;
void main() {
  vec4 c = texture(uTex, vUV);
  if (c.a < 0.08) discard;
  vec3 rgb = c.rgb;
  if (uGray > 0.5) {
    float g = dot(rgb, vec3(0.299, 0.587, 0.114));
    rgb = vec3(g) * 0.55;
  }

  // Base ambient (dungeon floors stay dim unless near a torch)
  float floorMin = clamp(uAmbientFloor, 0.02, 0.55);
  vec3 amb = max(uAmbColor, vec3(0.04)) * mix(0.55, 1.2, floorMin);
  vec3 lighting = amb;
  // Billboards have no real surface normal to dot with the sun, so approximate the same
  // directional key light terrain gets with a flat (angle-independent) contribution — without
  // this, trees/units never receive sunlight at all and look dim/black next to sunlit ground
  // no matter how bright the map is (live report: "trees ... are all black" on day maps).
  lighting += uKeyColor * uKeyStrength * 0.65;

  int nL = uNumLights;
  if (nL > 32) nL = 32;
  for (int i = 0; i < 32; i++) {
    if (i >= nL) break;
    vec3 toL = uPtPos[i] - vWorld;
    float dist = length(toL);
    float rad = max(uPtRad[i], 0.35);
    float att = 1.0 - smoothstep(0.0, rad, dist);
    att = att * att;
    // Soft wrap so front-facing billboards still pick up torch color
    lighting += uPtCol[i] * att * 1.15;
  }

  // Self-lit props (torches) never sink into darkness
  if (uEmissive > 0.5) {
    lighting = max(lighting, vec3(0.95, 0.75, 0.45));
    lighting += vec3(0.35, 0.2, 0.05);
  }

  lighting = max(lighting, vec3(floorMin));
  // Corpse / extra mul after lighting
  float d = uDarken > 0.01 ? uDarken : 1.0;
  rgb *= lighting * d;

  fragColor = vec4(clamp(rgb, 0.0, 1.0), c.a * uAlpha);
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
 * Cost: TEX_SUB² quads per cell top (8→64). 16 was crushing 32×24 maps at QB start.
 */
const TEX_SUB = 8;
/** Texture periods per map tile (1 = full seamless tile face). */
const TEX_REPEAT = 1;

function applyHighlights(color, highlights, key, col, row) {
  let c = color;
  if (highlights?.dash?.has(key)) c = mixColor(c, [0.92, 0.22, 0.14], 0.55);
  else if (highlights?.move?.has(key)) c = mixColor(c, [0.2, 0.72, 0.38], 0.48);
  if (highlights?.climb?.has(key)) c = mixColor(c, [0.62, 0.38, 0.95], 0.32);
  else if (highlights?.jump?.has(key)) c = mixColor(c, [1.0, 0.84, 0.2], 0.32);
  // Max reach (no LoS): slate indigo — clearly not a valid shot
  if (highlights?.attackRangeMax?.has(key) && !highlights?.attackRange?.has(key)) {
    c = mixColor(c, [0.38, 0.4, 0.72], 0.42);
  }
  // Valid LoS / can shoot: hot gold — high contrast vs slate
  if (highlights?.attackRange?.has(key)) c = mixColor(c, [1.0, 0.82, 0.12], 0.58);
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
  // Window has no texture (see TERRAIN_TEX_URLS) — render as bright glass, not the generic
  // rock-cliff color its enum type would otherwise fall back to.
  if (gKey === 'window') {
    const glow = 0.9 + hash2(col, row, 11) * 0.1;
    return mulColor([0.78, 0.9, 1.0], glow);
  }
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

function buildMapMesh(map, highlights, sampler, lightProfile) {
  const positions = [];
  const normals = [];
  const colors = [];
  const { cols, rows } = map;
  const profile = lightProfile || resolveLighting(null);
  const heightFn = (c, r) => {
    if (c < 0 || r < 0 || c >= cols || r >= rows) return null;
    return map.cells[r * cols + c]?.h ?? 0;
  };
  const shadowStr = profile.shadowStrength != null ? profile.shadowStrength : 0.25;

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const cell = map.cells[row * cols + col];
      const h = cell.h;
      const type = cell.type;
      const ox = col - (cols - 1) / 2;
      const oz = row - (rows - 1) / 2;
      const key = `${col},${row}`;

      let yTop = h * STEP;
      // Water sits slightly lower so banks read as shores. Pits/voids use their real
      // (deeply negative) h from the adapter now — a true drop, not a shallow lip.
      if (type === TERRAIN.WATER) yTop = -0.06;

      const hs = TILE;
      // Vertex-paint: cliff cast shadows from low sun + local torch pool
      const shade =
        sunShadowFactor(heightFn, col, row, profile.sunDir, shadowStr) *
        (0.55 + 0.45 * Math.min(1, tileIllumination01(profile, col, row)));

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
          color = mulColor(color, shade);
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

          // Cliff sides take sun-occlusion + torch pool (vertex paint)
          faceCol = mulColor(faceCol, Math.min(1, shade * 0.92));

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
      ambientFloor: gl.getUniformLocation(this.program, 'uAmbientFloor'),
      keyStrength: gl.getUniformLocation(this.program, 'uKeyStrength'),
      numLights: gl.getUniformLocation(this.program, 'uNumLights'),
      ptPos: [],
      ptCol: [],
      ptRad: [],
    };
    for (let i = 0; i < MAX_GPU_LIGHTS; i++) {
      this.uniforms.ptPos[i] = gl.getUniformLocation(this.program, `uPtPos[${i}]`);
      this.uniforms.ptCol[i] = gl.getUniformLocation(this.program, `uPtCol[${i}]`);
      this.uniforms.ptRad[i] = gl.getUniformLocation(this.program, `uPtRad[${i}]`);
    }

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
      darken: gl.getUniformLocation(this.bbsProgram, 'uDarken'),
      alpha: gl.getUniformLocation(this.bbsProgram, 'uAlpha'),
      emissive: gl.getUniformLocation(this.bbsProgram, 'uEmissive'),
      ambientFloor: gl.getUniformLocation(this.bbsProgram, 'uAmbientFloor'),
      ambColor: gl.getUniformLocation(this.bbsProgram, 'uAmbColor'),
      keyColor: gl.getUniformLocation(this.bbsProgram, 'uKeyColor'),
      keyStrength: gl.getUniformLocation(this.bbsProgram, 'uKeyStrength'),
      numLights: gl.getUniformLocation(this.bbsProgram, 'uNumLights'),
      ptPos: [],
      ptCol: [],
      ptRad: [],
    };
    for (let i = 0; i < MAX_GPU_LIGHTS; i++) {
      this.bbsUniforms.ptPos[i] = gl.getUniformLocation(this.bbsProgram, `uPtPos[${i}]`);
      this.bbsUniforms.ptCol[i] = gl.getUniformLocation(this.bbsProgram, `uPtCol[${i}]`);
      this.bbsUniforms.ptRad[i] = gl.getUniformLocation(this.bbsProgram, `uPtRad[${i}]`);
    }
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
    this.ambientFloor = 0.42;
    this.keyStrength = 0.7;
    /** @type {Array<{pos:[number,number,number], color:number[], radius:number}>} */
    this.pointLights = [];
    this._lightProfile = resolveLighting(null);

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

  /**
   * Apply a resolved light profile (from lighting.resolveLighting).
   * Rebuilds terrain mesh so vertex sun-shadows update.
   * @param {object} profile
   * @param {{ cols?:number, rows?:number }} [mapSize] for point light world positions
   */
  setLighting(profile, mapSize) {
    if (!profile) return;
    this._lightProfile = profile;
    if (profile.sunDir) this.sunDir = [...profile.sunDir];
    if (profile.sunColor) this.sunColor = [...profile.sunColor];
    if (profile.fillColor) this.fillColor = [...profile.fillColor];
    if (profile.skyColor) this.skyColor = [...profile.skyColor];
    if (profile.groundAmbient) this.groundAmbient = [...profile.groundAmbient];
    if (profile.ambientFloor != null) this.ambientFloor = profile.ambientFloor;
    if (profile.keyStrength != null) this.keyStrength = profile.keyStrength;
    const cols = mapSize?.cols ?? this._map?.cols ?? 10;
    const rows = mapSize?.rows ?? this._map?.rows ?? 10;
    // Keep every torch for vertex paint + nearest-N GPU selection each frame
    this.pointLightsAll = [];
    for (const p of profile.points || []) {
      const ox = p.col - (cols - 1) / 2;
      const oz = p.row - (rows - 1) / 2;
      const elev = this._map ? heightAt(this._map, p.col, p.row) : 0;
      const y = elev * 0.5 + 0.55; // float slightly above tile
      const col = p.color || [1, 0.6, 0.3];
      const inten = p.intensity != null ? p.intensity : 1.2;
      const radTiles = p.radius != null ? p.radius : 4.5;
      this.pointLightsAll.push({
        col: p.col | 0,
        row: p.row | 0,
        pos: [ox, y, oz],
        color: [col[0] * inten, col[1] * inten, col[2] * inten],
        radius: Math.max(1.2, radTiles * 1.1),
      });
    }
    this.pointLights = this.pointLightsAll;
    const gl = this.gl;
    if (gl && this.skyColor) {
      gl.clearColor(this.skyColor[0], this.skyColor[1], this.skyColor[2], 1);
    }
    this._dirtyMap = true;
  }

  /**
   * All lights up to MAX_GPU_LIGHTS. Only if a map is absurdly torch-heavy do we
   * fall back to nearest-to-camera (basic lighting is cheap; 32 is plenty).
   */
  _gpuPointLights() {
    const all = this.pointLightsAll || this.pointLights || [];
    if (all.length <= MAX_GPU_LIGHTS) return all;
    const fx = this.cam?.panX || 0;
    const fz = this.cam?.panY || 0;
    return all
      .map((p) => ({
        p,
        d: Math.hypot(p.pos[0] - fx, p.pos[2] - fz),
      }))
      .sort((a, b) => a.d - b.d)
      .slice(0, MAX_GPU_LIGHTS)
      .map((x) => x.p);
  }

  _uploadPointLights(gl, uniforms) {
    const pts = this._gpuPointLights();
    const nPts = Math.min(MAX_GPU_LIGHTS, pts.length);
    if (uniforms.numLights != null && uniforms.numLights !== -1) {
      gl.uniform1i(uniforms.numLights, nPts);
    }
    const u3 = (loc, a, b, c) => {
      if (loc != null && loc !== -1) gl.uniform3f(loc, a, b, c);
    };
    const u1 = (loc, v) => {
      if (loc != null && loc !== -1) gl.uniform1f(loc, v);
    };
    for (let i = 0; i < MAX_GPU_LIGHTS; i++) {
      const p = pts[i];
      if (p) {
        u3(uniforms.ptPos[i], p.pos[0], p.pos[1], p.pos[2]);
        u3(uniforms.ptCol[i], p.color[0], p.color[1], p.color[2]);
        u1(uniforms.ptRad[i], p.radius);
      } else {
        u3(uniforms.ptPos[i], 0, -99, 0);
        u3(uniforms.ptCol[i], 0, 0, 0);
        u1(uniforms.ptRad[i], 0.01);
      }
    }
  }

  _refreshMeshes() {
    if (!this._map) return;
    if (this._dirtyMap) {
      const mesh = buildMapMesh(
        this._map,
        this._highlights,
        this.sampler,
        this._lightProfile,
      );
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
    u1(this.uniforms.ambientFloor, this.ambientFloor != null ? this.ambientFloor : 0.42);
    u1(this.uniforms.keyStrength, this.keyStrength != null ? this.keyStrength : 0.7);
    this._uploadPointLights(gl, this.uniforms);

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
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.disable(gl.CULL_FACE);

    if (this.bbsUniforms.mvp)
      gl.uniformMatrix4fv(this.bbsUniforms.mvp, false, mvp);
    if (this.bbsUniforms.tex) gl.uniform1i(this.bbsUniforms.tex, 0);

    // Match terrain lighting so units/trees respond to torches the same way
    const u1 = (loc, v) => {
      if (loc != null && loc !== -1) gl.uniform1f(loc, v);
    };
    const u3 = (loc, a, b, c) => {
      if (loc != null && loc !== -1) gl.uniform3f(loc, a, b, c);
    };
    u1(this.bbsUniforms.ambientFloor, this.ambientFloor != null ? this.ambientFloor : 0.42);
    const amb = this.groundAmbient || [0.2, 0.18, 0.16];
    const sky = this.skyColor || [0.3, 0.35, 0.45];
    // Mix sky/ground for billboard ambient (facing camera, average hemisphere)
    u3(
      this.bbsUniforms.ambColor,
      (amb[0] + sky[0]) * 0.45,
      (amb[1] + sky[1]) * 0.45,
      (amb[2] + sky[2]) * 0.45,
    );
    const keyC = this.sunColor || [1.0, 0.95, 0.85];
    u3(this.bbsUniforms.keyColor, keyC[0], keyC[1], keyC[2]);
    u1(this.bbsUniforms.keyStrength, this.keyStrength != null ? this.keyStrength : 0.7);
    this._uploadPointLights(gl, this.bbsUniforms);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindVertexArray(this.bbsVAO);

    for (const b of list) {
      if (!b.img || !b.img.complete || !b.img.naturalWidth) continue;
      const tex = this._ensureTex(b.img);
      if (!tex) continue;
      // Soft foliage: test against walls so trunks don't poke through, but do not
      // write depth — otherwise trees/bushes fully hide ground range/blast tints.
      gl.depthMask(!b.softCover);
      // Prone corpse: lie flat on XZ (right × ground-forward). Standing: upright.
      if (b.prone) {
        if (this.bbsUniforms.right)
          gl.uniform3f(this.bbsUniforms.right, rx, 0, rz);
        // Ground-forward = rotate camera-right 90° on XZ
        if (this.bbsUniforms.up)
          gl.uniform3f(this.bbsUniforms.up, -rz, 0, rx);
      } else {
        if (this.bbsUniforms.right)
          gl.uniform3f(this.bbsUniforms.right, rx, 0, rz);
        if (this.bbsUniforms.up) gl.uniform3f(this.bbsUniforms.up, 0, 1, 0);
      }
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
      // darken only for corpses / explicit mul — scene light is in the shader now
      if (this.bbsUniforms.darken)
        gl.uniform1f(this.bbsUniforms.darken, b.darken != null ? b.darken : 1);
      if (this.bbsUniforms.alpha)
        gl.uniform1f(this.bbsUniforms.alpha, b.alpha != null ? b.alpha : 1);
      if (this.bbsUniforms.emissive)
        gl.uniform1f(this.bbsUniforms.emissive, b.emissive ? 1 : 0);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    }

    gl.depthMask(true);
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
