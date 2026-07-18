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
} from './math.js?v=0.6.0';
import {
  TERRAIN,
  TERRAIN_COLORS,
  CLIFF_STRATA,
  heightAt,
  cellAt,
} from './map.js?v=0.6.0';
import { TerrainSampler, TERRAIN_TEX_URLS, TERRAIN_SIDE_TEX_URLS, WANG_TILESETS } from './terrainTextures.js?v=0.6.0';
import {
  resolveLighting,
  sunShadowFactor,
  tileIllumination01,
  MAX_GPU_LIGHTS,
} from './lighting.js?v=0.6.0';

const VS = `#version 300 es
in vec3 aPos;
in vec3 aNormal;
in vec3 aColor;
in vec2 aUV;
uniform mat4 uMVP;
out vec3 vColor;
out vec3 vNormal;
out vec3 vWorld;
out vec2 vUV;
void main() {
  vWorld = aPos;
  gl_Position = uMVP * vec4(aPos, 1.0);
  vColor = aColor;
  vNormal = aNormal;
  vUV = aUV;
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
in vec2 vUV;
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
uniform sampler2D uTex;
uniform float uUseTex;
out vec4 fragColor;
void main() {
  // Real per-pixel GPU texture sampling for ground (uUseTex=1) instead of the old
  // CPU-precomputed flat-quad-per-subcell color approximation. vColor carries only the
  // shade/highlight tint in this mode (near-white baseline); walls/fallback geometry
  // (uUseTex=0) keep vColor as the full baked albedo exactly as before.
  vec4 texel = uUseTex > 0.5 ? texture(uTex, vUV) : vec4(1.0);
  // Ground textures are fully opaque so this never fires for them — only door quads
  // (and any future cutout prop sharing this same textured-quad path) actually have
  // transparent pixels to cut away.
  if (uUseTex > 0.5 && texel.a < 0.08) discard;
  vec3 albedo = uUseTex > 0.5 ? texel.rgb * vColor : vColor;
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
  // Allow very dark sky/ground for dungeons (don't force bright day ambient).
  // Day maps with real albedo textures need a bit more ambient than the old
  // flat-color era — otherwise midtone stone/grass reads muddy under key*diff.
  vec3 skyA = uSkyColor;
  vec3 gndA = uGroundColor;
  float ambScale = mix(0.42, 0.82, clamp(uAmbientFloor * 1.55, 0.0, 1.0));
  vec3 ambient = mix(gndA, skyA, hemi) * ambScale;

  vec3 keyC = uLightColor;
  vec3 fillC = uFillColor;
  vec3 fillDir = normalize(vec3(-L.x, 0.55, -L.z));
  float fill = max(dot(n, fillDir), 0.0) * 0.32;

  float upright = 1.0 - smoothstep(0.2, 0.9, abs(n.y));
  fill += upright * 0.1;

  float keyStr = uKeyStrength > 0.01 ? uKeyStrength : 0.7;
  // Slight wrap on key so hard Lambert doesn't black out NW cliff faces
  float keyDiff = mix(diff, max(ndl, 0.0), 0.35);
  vec3 lighting = ambient + keyC * keyDiff * keyStr + fillC * fill;

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

  vec3 col = albedo * lighting;

  float waterHint = step(vWorld.y, 0.1) * smoothstep(0.15, 0.45, albedo.b - albedo.r * 0.8);
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
  // Hard alpha cutout only. Earlier we also discarded dark RGB (lum < 0.14) to kill black
  // outline boxes — that also ate tree trunks / bark and left washed-out green canopies
  // with "broken transparency". Real HQ PixelLab art has opaque dark bark; trust alpha.
  if (c.a < 0.50) discard;
  // Magenta / hot-pink chroma leftovers (old plate workflow)
  if (c.r > 0.78 && c.b > 0.68 && c.g < 0.45 && c.a > 0.5) discard;

  vec3 rgb = c.rgb;
  if (uGray > 0.5) {
    float g = dot(rgb, vec3(0.299, 0.587, 0.114));
    rgb = vec3(g) * 0.55;
  }

  // Base ambient (dungeon floors stay dim unless near a torch)
  float floorMin = clamp(uAmbientFloor, 0.02, 0.55);
  vec3 amb = max(uAmbColor, vec3(0.05)) * mix(0.65, 1.25, floorMin);
  vec3 lighting = amb;
  // Billboards have no real surface normal to dot with the sun, so approximate the same
  // directional key light terrain gets with a flat (angle-independent) contribution — without
  // this, trees/units never receive sunlight at all and look dim/black next to sunlit ground
  // no matter how bright the map is (live report: "trees ... are all black" on day maps).
  lighting += uKeyColor * uKeyStrength * 0.85;

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

  // Fully opaque cutout (no translucent fringe boxes)
  fragColor = vec4(clamp(rgb, 0.0, 1.0), uAlpha);
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

/**
 * Same as addQuad but also emits real UV coords so the fragment shader can sample an
 * actual bound texture per-pixel, instead of a single flat CPU-computed color. `c` here is
 * a small shade/highlight tint (near-white), not the full albedo — the texture supplies
 * the base color. `offU`/`offV` shift which crop of the (REPEAT-wrapped, seamless-tileable)
 * texture this tile samples — without it, every tile of a given terrain type would show
 * the byte-identical crop, and any distinctive feature in the source art (mud's puddle
 * blobs, dirt's pebbles) would repeat in the same relative spot on every tile, reading as
 * an obvious mechanical wallpaper grid instead of a varied ground (live report: "textures
 * look identical" — real texture mapping now, but a per-tile mud patch was still an
 * obvious repeat of the same few puddle shapes).
 */
function addTexQuad(positions, normals, colors, uvs, v0, v1, v2, v3, n, c, offU = 0, offV = 0) {
  positions.push(...v0, ...v1, ...v2, ...v0, ...v2, ...v3);
  const u0 = offU, u1 = offU + 1, v0u = offV, v1u = offV + 1;
  uvs.push(u0, v0u, u1, v0u, u1, v1u, u0, v0u, u1, v1u, u0, v1u);
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
/**
 * gKeys that get real UV-mapped wall/cliff side faces (procedural UV from absolute world
 * position, not hand-authored per map — see the "Real per-pixel UV-mapped wall face" pass
 * in buildMapMesh). Anything else (window/void/natural cliff hillside/etc.) has no dedicated
 * side texture and keeps the old flat-shaded strata-band fallback.
 */
// Any key in TERRAIN_SIDE_TEX_URLS (or this set) gets real UV-mapped wall faces.
const WALL_SIDE_TEX_KEYS = new Set([
  ...Object.keys(TERRAIN_SIDE_TEX_URLS || {}),
  'wall', 'cave_wall', 'low_wall', 'wood', 'stone', 'dirt', 'grass', 'brush', 'mud', 'sand',
]);

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
  // Per-tile randomized crop offset. (col+u)%1 always collapses back to plain `u` for any
  // integer col when TEX_REPEAT=1 — every tile was sampling the byte-identical crop of the
  // texture, so any distinctive feature (a rock fleck, a clover clump) repeated in the exact
  // same spot on every tile, reading as an obvious mechanical wallpaper grid despite the
  // per-cell brightness jitter below (live report: floor "still looks blocky/repetitive").
  // Since these source textures are seamless-tileable, a random per-tile offset just shows a
  // different (equally valid) crop each tile instead of the identical one every time.
  const offU = hash2(col, row, 3);
  const offV = hash2(col, row, 13);
  const phaseU = ((col + u) * TEX_REPEAT + offU) % 1;
  const phaseV = ((row + v) * TEX_REPEAT + offV) % 1;
  if (sampler && sampler.ready) {
    // Raw sample() grabs a single texel every ~16px (128px texture / TEX_SUB=8 samples per
    // tile) — pure nearest-neighbor undersampling aliases into a regular basket-weave/argyle
    // moire pattern that has nothing to do with the actual source art (live report: new
    // PixelLab terrain textures "look like shit" — the texture WAS loading, this is why it
    // looked wrong). sampleAvg averages a texel neighborhood instead of hopping across gaps.
    const s = sampler.sampleAvg(gKey, phaseU, phaseV, 4);
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
  // Per-texture-URL ground quads: real GPU-textured tiles (one quad per tile, UV 0..1),
  // grouped so each group can be drawn in a single call with its texture bound. Falls back
  // to the old CPU-baked-color path (pushed into positions/normals/colors above) only for
  // terrain keys with no texture (window, void) or before the sampler has loaded.
  /** @type {Map<string, {positions:number[], normals:number[], colors:number[], uvs:number[]}>} */
  const groundGroups = new Map();
  const groundGroupFor = (url) => {
    let g = groundGroups.get(url);
    if (!g) {
      g = { positions: [], normals: [], colors: [], uvs: [] };
      groundGroups.set(url, g);
    }
    return g;
  };
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
      // Cast-shadow factor (cliff occlusion). Illumination for UNTEXTURED path only —
      // textured ground uses this as a soft multiply then the FS applies real sun/ambient/
      // torches. Baking tileIllumination into vertex tint *and* FS lighting crushed maps
      // after we switched to real GPU textures (double-dark / muddy stone).
      const castShadow = sunShadowFactor(heightFn, col, row, profile.sunDir, shadowStr);
      const tileIllum = Math.min(1, tileIllumination01(profile, col, row));
      // Legacy flat-color path: keep the old combined shade (albedo lived in vColor).
      const shade =
        castShadow * (0.55 + 0.45 * tileIllum);
      // Textured path: near-white tint; soft cast only (never crush below ~0.8).
      const texTintShade = 0.82 + 0.18 * castShadow;

      // --- Top face: one real GPU-textured quad per tile (per-pixel sampling), grouped
      // by texture so each group draws in a single call. Falls back to the old
      // subdivided flat-color approximation only when there's no texture for this key
      // (window/void) or the sampler hasn't finished loading images yet.
      const gKey = cell.gKey || 'grass';
      const texUrl = TERRAIN_TEX_URLS[gKey];
      const hasRealTex = !!(texUrl && sampler && sampler.ready && sampler.images && sampler.images[texUrl]);
      if (hasRealTex) {
        let tint = [1, 1, 1];
        tint = mulColor(tint, texTintShade);
        if (h > 0) tint = mixColor(tint, [0.95, 0.95, 0.92], 0.04 * Math.min(h, 4));
        tint = applyHighlights(tint, highlights, key, col, row);
        const cellShade = 0.98 + hash2(col, row, 7) * 0.04;
        tint = mulColor(tint, cellShade);
        const g = groundGroupFor(texUrl);
        addTexQuad(
          g.positions, g.normals, g.colors, g.uvs,
          [ox - hs, yTop, oz - hs],
          [ox + hs, yTop, oz - hs],
          [ox + hs, yTop, oz + hs],
          [ox - hs, yTop, oz + hs],
          [0, 1, 0],
          tint,
          hash2(col, row, 21),
          hash2(col, row, 37),
        );
      } else {
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

        // --- Real per-pixel UV-mapped wall face (FFT's actual technique: every polygon,
        // not just tops, gets genuine UV coordinates into a shared texture — not a flat
        // CPU-shaded color band). UV tracks absolute world position (not quad-relative),
        // so adjacent wall tiles' brick coursing lines up continuously and tall faces tile
        // the texture by real height instead of stretching one image across it.
        const sideTexKey = WALL_SIDE_TEX_KEYS.has(cell.gKey) ? cell.gKey : null;
        const sideTexUrl = sideTexKey && (
          (TERRAIN_SIDE_TEX_URLS && TERRAIN_SIDE_TEX_URLS[sideTexKey]) ||
          TERRAIN_TEX_URLS[sideTexKey]
        );
        const hasWallTex = !!(sideTexUrl && sampler && sampler.ready && sampler.images && sampler.images[sideTexUrl]);
        const [nx, , nz] = nb.n;

        if (hasWallTex) {
          // Soft cast only — same rule as textured tops (FS does real lighting).
          const faceShade = mulColor([1, 1, 1], Math.min(1, texTintShade * 0.96));
          const g = groundGroupFor(sideTexUrl);
          const uvXY = (v) => [v[0], v[1]];
          const uvZY = (v) => [v[2], v[1]];
          const pushFace = (v0, v1, v2, v3, uvFn) => {
            g.positions.push(...v0, ...v1, ...v2, ...v0, ...v2, ...v3);
            const t0 = uvFn(v0), t1 = uvFn(v1), t2 = uvFn(v2), t3 = uvFn(v3);
            g.uvs.push(...t0, ...t1, ...t2, ...t0, ...t2, ...t3);
            for (let i = 0; i < 6; i++) {
              g.normals.push(...nb.n);
              g.colors.push(faceShade[0], faceShade[1], faceShade[2]);
            }
          };
          if (nz === 1) {
            pushFace(
              [ox - hs, neighborTop, oz + hs], [ox + hs, neighborTop, oz + hs],
              [ox + hs, yTop, oz + hs], [ox - hs, yTop, oz + hs],
              uvXY,
            );
          } else if (nz === -1) {
            pushFace(
              [ox + hs, neighborTop, oz - hs], [ox - hs, neighborTop, oz - hs],
              [ox - hs, yTop, oz - hs], [ox + hs, yTop, oz - hs],
              uvXY,
            );
          } else if (nx === 1) {
            pushFace(
              [ox + hs, neighborTop, oz + hs], [ox + hs, neighborTop, oz - hs],
              [ox + hs, yTop, oz - hs], [ox + hs, yTop, oz + hs],
              uvZY,
            );
          } else {
            pushFace(
              [ox - hs, neighborTop, oz - hs], [ox - hs, neighborTop, oz + hs],
              [ox - hs, yTop, oz + hs], [ox - hs, yTop, oz - hs],
              uvZY,
            );
          }
          continue;
        }

        // Fallback: no real texture for this material (window/void/natural cliff/etc.) —
        // old flat CPU-shaded strata bands.
        const bandH = 0.28;
        let y = neighborTop;
        let band = 0;
        while (y < yTop - 0.001) {
          const y2 = Math.min(yTop, y + bandH);
          let faceCol;
          if (type === TERRAIN.CLIFF || h >= 1) {
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

  // --- Wang autotile transitions: smooth grass/sand (etc.) boundaries instead of a hard
  // seam between two flat-textured tiles. "Dual grid" technique — one quad per map VERTEX
  // (not per cell), sampling the 4 cells touching that vertex as the tile's own NW/NE/SW/SE
  // corners, drawn on top of the normal per-cell ground only where an actual boundary exists
  // (a vertex whose 4 corners are all the same terrain needs no patch — normal cell texturing
  // already shows the right thing there, so skipping those keeps this cheap).
  if (sampler && sampler.ready) {
    for (const wang of Object.values(WANG_TILESETS)) {
      const atlasImg = sampler.images && sampler.images[wang.url];
      if (!atlasImg) continue;
      const g = groundGroupFor(wang.url);
      for (let vy = 1; vy < rows; vy++) {
        for (let vx = 1; vx < cols; vx++) {
          const nwCell = map.cells[(vy - 1) * cols + (vx - 1)];
          const neCell = map.cells[(vy - 1) * cols + vx];
          const swCell = map.cells[vy * cols + (vx - 1)];
          const seCell = map.cells[vy * cols + vx];
          const cornerVal = (cell) => {
            const k = cell.gKey || 'grass';
            if (k === wang.lower) return 0;
            if (k === wang.upper) return 1;
            return -1; // not part of this pair — skip this vertex entirely
          };
          const nw = cornerVal(nwCell);
          const ne = cornerVal(neCell);
          const sw = cornerVal(swCell);
          const se = cornerVal(seCell);
          if (nw < 0 || ne < 0 || sw < 0 || se < 0) continue;
          if (nw === ne && ne === sw && sw === se) continue; // uniform — no patch needed
          const tile = wang.tiles.find((t) => t.nw === nw && t.ne === ne && t.sw === sw && t.se === se);
          if (!tile) continue;
          const vxWorld = vx - (cols - 1) / 2 - 0.5;
          const vzWorld = vy - (rows - 1) / 2 - 0.5;
          const yTopHere = Math.max(nwCell.h, neCell.h, swCell.h, seCell.h) * STEP + 0.01;
          const u0 = tile.x / wang.atlasW;
          const u1 = (tile.x + tile.w) / wang.atlasW;
          const v0 = tile.y / wang.atlasH;
          const v1 = (tile.y + tile.h) / wang.atlasH;
          const hsw = TILE;
          g.positions.push(
            vxWorld - hsw, yTopHere, vzWorld - hsw,
            vxWorld + hsw, yTopHere, vzWorld - hsw,
            vxWorld + hsw, yTopHere, vzWorld + hsw,
            vxWorld - hsw, yTopHere, vzWorld - hsw,
            vxWorld + hsw, yTopHere, vzWorld + hsw,
            vxWorld - hsw, yTopHere, vzWorld + hsw,
          );
          g.uvs.push(u0, v0, u1, v0, u1, v1, u0, v0, u1, v1, u0, v1);
          for (let i = 0; i < 6; i++) {
            g.normals.push(0, 1, 0);
            g.colors.push(1, 1, 1);
          }
        }
      }
    }
  }

  // --- Structure decor: pure solid meshes (no PNG sprites) ---
  // Doors align to the wall axis; traps/grates sit on the floor; barrels/crates are boxes.
  // Camera-facing billboards only handle organic props (trees/bushes/flames) in the adapter.
  const pushSolidBox = (cx, y0, cz, hw, hh, hd, col) => {
    const x0 = cx - hw, x1 = cx + hw;
    const y1 = y0 + hh;
    const z0 = cz - hd, z1 = cz + hd;
    const faces = [
      [[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1], [0, 1, 0], 1.12],
      [[x0, y0, z1], [x1, y0, z1], [x1, y0, z0], [x0, y0, z0], [0, -1, 0], 0.78],
      [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [0, 0, -1], 0.94],
      [[x1, y0, z1], [x0, y0, z1], [x0, y1, z1], [x1, y1, z1], [0, 0, 1], 0.98],
      [[x0, y0, z1], [x0, y0, z0], [x0, y1, z0], [x0, y1, z1], [-1, 0, 0], 0.9],
      [[x1, y0, z0], [x1, y0, z1], [x1, y1, z1], [x1, y1, z0], [1, 0, 0], 1.02],
    ];
    for (const [a, b, c, d, n, sh] of faces) {
      const cc = mulColor(col, sh);
      addQuad(positions, normals, colors, a, b, c, d, n, cc);
    }
  };

  // Muted FFT / Ogre Battle prop palette (no neon plastic cubes)
  const BOX_PROPS = {
    oil_barrel: { w: 0.28, d: 0.28, h: 0.42, col: [0.42, 0.36, 0.28] },
    acid_barrel: { w: 0.28, d: 0.28, h: 0.42, col: [0.4, 0.48, 0.32] },
    powder_barrel: { w: 0.28, d: 0.28, h: 0.42, col: [0.48, 0.38, 0.3] },
    barrel: { w: 0.28, d: 0.28, h: 0.42, col: [0.5, 0.38, 0.26] },
    cauldron: { w: 0.34, d: 0.34, h: 0.32, col: [0.32, 0.34, 0.38] },
    cauldron_tipped: { w: 0.38, d: 0.28, h: 0.22, col: [0.32, 0.34, 0.38] },
    crate: { w: 0.36, d: 0.36, h: 0.36, col: [0.58, 0.46, 0.3] },
    chest: { w: 0.4, d: 0.28, h: 0.28, col: [0.55, 0.42, 0.22] },
    loose_rock: { w: 0.32, d: 0.28, h: 0.16, col: [0.55, 0.52, 0.48] },
    plank: { w: 0.45, d: 0.12, h: 0.06, col: [0.58, 0.46, 0.3] },
  };

  const FLOOR_PLATES = {
    trap: { col: [0.62, 0.22, 0.18], h: 0.05 },
    trap2: { col: [0.55, 0.18, 0.14], h: 0.05 },
    trap3: { col: [0.7, 0.28, 0.12], h: 0.05 },
    trap_safe: { col: [0.32, 0.55, 0.32], h: 0.04 },
    trap_safe2: { col: [0.28, 0.5, 0.38], h: 0.04 },
    trap_safe3: { col: [0.4, 0.58, 0.3], h: 0.04 },
    grate: { col: [0.38, 0.4, 0.42], h: 0.04, bars: true },
    grate_open: { col: [0.28, 0.3, 0.32], h: 0.03, bars: true, open: true },
  };

  if (map.decor) {
    const WALL_GKEYS = new Set(['wall', 'cave_wall', 'low_wall', 'window']);
    const isWallCell = (c) => !!c && WALL_GKEYS.has(c.gKey);
    const WOOD_DOOR = [0.48, 0.32, 0.16];
    const WOOD_FRAME = [0.32, 0.22, 0.12];
    const IRON = [0.45, 0.46, 0.5];
    const DOOR_THICK = 0.08;

    for (const [key, kind] of Object.entries(map.decor)) {
      if (!kind) continue;
      const [cs, rs] = key.split(',');
      const col = Number(cs);
      const row = Number(rs);
      if (!Number.isFinite(col) || !Number.isFinite(row)) continue;
      const cell = map.cells[row * cols + col];
      if (!cell) continue;
      const elev = cell.h || 0;
      const yTop = elev * STEP + 0.02;
      const ox = col - (cols - 1) / 2;
      const oz = row - (rows - 1) / 2;

      // --- Doors: wall-aligned solid slabs (closed full panel / open side leaves) ---
      if (kind === 'door' || kind === 'door_open') {
        const westCell = cellAt(map, col - 1, row);
        const eastCell = cellAt(map, col + 1, row);
        const northCell = cellAt(map, col, row - 1);
        const southCell = cellAt(map, col, row + 1);
        const ewWall = isWallCell(westCell) || isWallCell(eastCell);
        const nsWall = isWallCell(northCell) || isWallCell(southCell);
        const runsEastWest = ewWall || !nsWall;
        const wallH = Math.max(
          isWallCell(westCell) ? westCell.h : 0,
          isWallCell(eastCell) ? eastCell.h : 0,
          isWallCell(northCell) ? northCell.h : 0,
          isWallCell(southCell) ? southCell.h : 0,
          2,
        );
        const doorH = wallH * STEP * 0.92;
        const halfW = TILE * 0.92;
        const halfT = DOOR_THICK / 2;
        const open = kind === 'door_open';

        // Frame posts at both ends of the doorway
        if (runsEastWest) {
          pushSolidBox(ox - halfW + 0.04, yTop, oz, 0.05, doorH, halfT + 0.02, WOOD_FRAME);
          pushSolidBox(ox + halfW - 0.04, yTop, oz, 0.05, doorH, halfT + 0.02, WOOD_FRAME);
          pushSolidBox(ox, yTop + doorH - 0.05, oz, halfW, 0.06, halfT + 0.02, WOOD_FRAME);
          if (open) {
            // Leaves swung open against the jambs (thin panels along Z)
            pushSolidBox(ox - halfW + 0.12, yTop, oz - 0.18, 0.04, doorH * 0.9, 0.2, WOOD_DOOR);
            pushSolidBox(ox + halfW - 0.12, yTop, oz + 0.18, 0.04, doorH * 0.9, 0.2, WOOD_DOOR);
          } else {
            pushSolidBox(ox, yTop, oz, halfW - 0.06, doorH - 0.04, halfT, WOOD_DOOR);
            // Iron band + handle
            pushSolidBox(ox, yTop + doorH * 0.35, oz, halfW - 0.1, 0.04, halfT + 0.01, IRON);
            pushSolidBox(ox, yTop + doorH * 0.65, oz, halfW - 0.1, 0.04, halfT + 0.01, IRON);
            pushSolidBox(ox + halfW * 0.35, yTop + doorH * 0.48, oz + halfT + 0.02, 0.04, 0.08, 0.03, IRON);
          }
        } else {
          pushSolidBox(ox, yTop, oz - halfW + 0.04, halfT + 0.02, doorH, 0.05, WOOD_FRAME);
          pushSolidBox(ox, yTop, oz + halfW - 0.04, halfT + 0.02, doorH, 0.05, WOOD_FRAME);
          pushSolidBox(ox, yTop + doorH - 0.05, oz, halfT + 0.02, 0.06, halfW, WOOD_FRAME);
          if (open) {
            pushSolidBox(ox - 0.18, yTop, oz - halfW + 0.12, 0.2, doorH * 0.9, 0.04, WOOD_DOOR);
            pushSolidBox(ox + 0.18, yTop, oz + halfW - 0.12, 0.2, doorH * 0.9, 0.04, WOOD_DOOR);
          } else {
            pushSolidBox(ox, yTop, oz, halfT, doorH - 0.04, halfW - 0.06, WOOD_DOOR);
            pushSolidBox(ox, yTop + doorH * 0.35, oz, halfT + 0.01, 0.04, halfW - 0.1, IRON);
            pushSolidBox(ox, yTop + doorH * 0.65, oz, halfT + 0.01, 0.04, halfW - 0.1, IRON);
            pushSolidBox(ox + halfT + 0.02, yTop + doorH * 0.48, oz + halfW * 0.35, 0.03, 0.08, 0.04, IRON);
          }
        }
        continue;
      }

      // --- Floor plates: traps / pressure plates / grates ---
      const plate = FLOOR_PLATES[kind];
      if (plate) {
        const half = TILE * (plate.open ? 0.38 : 0.42);
        const ph = plate.h;
        pushSolidBox(ox, yTop, oz, half, ph, half, plate.col);
        // Raised rim so plates read as objects, not flat paint
        const rim = mulColor(plate.col, 0.75);
        const rh = ph + 0.02;
        const rw = 0.035;
        pushSolidBox(ox, yTop, oz - half + rw, half, rh, rw, rim);
        pushSolidBox(ox, yTop, oz + half - rw, half, rh, rw, rim);
        pushSolidBox(ox - half + rw, yTop, oz, rw, rh, half - rw * 2, rim);
        pushSolidBox(ox + half - rw, yTop, oz, rw, rh, half - rw * 2, rim);
        if (plate.bars) {
          const barCol = plate.open ? [0.2, 0.22, 0.24] : [0.5, 0.52, 0.55];
          const nBars = plate.open ? 2 : 4;
          for (let i = 0; i < nBars; i++) {
            const t = (i + 1) / (nBars + 1);
            const bx = ox - half + t * half * 2;
            pushSolidBox(bx, yTop + ph * 0.5, oz, 0.025, ph * 0.8, half * 0.85, barCol);
          }
          for (let i = 0; i < nBars; i++) {
            const t = (i + 1) / (nBars + 1);
            const bz = oz - half + t * half * 2;
            pushSolidBox(ox, yTop + ph * 0.5, bz, half * 0.85, ph * 0.8, 0.025, barCol);
          }
        } else if (!kind.includes('safe')) {
          // Spike nubs on armed traps
          const spike = mulColor(plate.col, 1.25);
          for (const [dx, dz] of [[-0.15, -0.15], [0.15, -0.15], [-0.15, 0.15], [0.15, 0.15], [0, 0]]) {
            pushSolidBox(ox + dx, yTop + ph, oz + dz, 0.03, 0.08, 0.03, spike);
          }
        }
        continue;
      }

      // --- Solid box props (barrels, crates, chests…) ---
      const box = BOX_PROPS[kind];
      if (box) {
        pushSolidBox(ox, yTop, oz, box.w, box.h, box.d, box.col);
        if (kind.includes('barrel') || kind === 'barrel') {
          pushSolidBox(ox, yTop + box.h * 0.85, oz, box.w * 0.92, box.h * 0.12, box.d * 0.92, mulColor(box.col, 1.15));
        }
        if (kind === 'chest') {
          pushSolidBox(ox, yTop + box.h * 0.55, oz, box.w * 0.95, box.h * 0.2, box.d * 0.95, mulColor(box.col, 1.1));
          pushSolidBox(ox, yTop + box.h * 0.4, oz + box.d + 0.02, 0.05, 0.06, 0.03, IRON);
        }
        continue;
      }

      // Lever / switch
      if (kind === 'lever' || kind === 'switch') {
        const postCol = [0.4, 0.38, 0.35];
        const handleCol = kind === 'lever' ? [0.7, 0.25, 0.2] : [0.85, 0.75, 0.2];
        pushSolidBox(ox, yTop, oz, 0.06, 0.55, 0.06, postCol);
        pushSolidBox(ox + 0.12, yTop + 0.42, oz, 0.16, 0.06, 0.05, handleCol);
        continue;
      }

      // Drawbridge
      if (kind === 'drawbridge' || kind === 'drawbridge_down') {
        const wood = [0.5, 0.35, 0.18];
        if (kind === 'drawbridge') {
          pushSolidBox(ox, yTop, oz - TILE * 0.35, TILE * 0.45, 0.9, 0.06, wood);
        } else {
          pushSolidBox(ox, yTop + 0.04, oz, TILE * 0.45, 0.08, TILE * 0.45, wood);
        }
        continue;
      }

      // Fence / hedge
      if (kind === 'fence' || kind === 'hedge') {
        const fcol = kind === 'hedge' ? [0.22, 0.42, 0.2] : [0.45, 0.32, 0.18];
        const fh = kind === 'hedge' ? 0.55 : 0.45;
        pushSolidBox(ox, yTop, oz, TILE * 0.42, fh, 0.06, fcol);
        if (kind === 'fence') {
          pushSolidBox(ox - TILE * 0.35, yTop, oz, 0.05, fh + 0.08, 0.07, mulColor(fcol, 0.85));
          pushSolidBox(ox + TILE * 0.35, yTop, oz, 0.05, fh + 0.08, 0.07, mulColor(fcol, 0.85));
        }
        continue;
      }

      // Table / chair
      if (kind === 'table') {
        const wood = [0.5, 0.36, 0.2];
        pushSolidBox(ox, yTop + 0.28, oz, 0.38, 0.05, 0.28, wood);
        for (const [dx, dz] of [[-0.3, -0.2], [0.3, -0.2], [-0.3, 0.2], [0.3, 0.2]]) {
          pushSolidBox(ox + dx, yTop, oz + dz, 0.04, 0.28, 0.04, mulColor(wood, 0.9));
        }
        continue;
      }
      if (kind === 'chair') {
        const wood = [0.48, 0.34, 0.18];
        pushSolidBox(ox, yTop + 0.18, oz, 0.16, 0.04, 0.16, wood);
        pushSolidBox(ox, yTop + 0.18, oz - 0.14, 0.16, 0.28, 0.03, wood);
        for (const [dx, dz] of [[-0.12, -0.12], [0.12, -0.12], [-0.12, 0.12], [0.12, 0.12]]) {
          pushSolidBox(ox + dx, yTop, oz + dz, 0.03, 0.18, 0.03, mulColor(wood, 0.9));
        }
        continue;
      }

      // Tent
      if (kind === 'tent') {
        const canvas = [0.55, 0.42, 0.28];
        pushSolidBox(ox, yTop, oz, 0.35, 0.15, 0.3, canvas);
        pushSolidBox(ox, yTop + 0.15, oz, 0.28, 0.2, 0.22, mulColor(canvas, 1.08));
        pushSolidBox(ox, yTop + 0.35, oz, 0.12, 0.12, 0.1, mulColor(canvas, 1.15));
        continue;
      }

      // Sign / sign post
      if (kind === 'sign' || kind === 'sign_post') {
        const post = [0.4, 0.3, 0.18];
        const board = [0.55, 0.42, 0.22];
        pushSolidBox(ox, yTop, oz, 0.04, 0.7, 0.04, post);
        pushSolidBox(ox, yTop + 0.55, oz + 0.02, 0.22, 0.16, 0.03, board);
        continue;
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

  const ground = [];
  for (const [url, g] of groundGroups) {
    ground.push({
      url,
      positions: new Float32Array(g.positions),
      normals: new Float32Array(g.normals),
      colors: new Float32Array(g.colors),
      uvs: new Float32Array(g.uvs),
      count: g.positions.length / 3,
    });
  }

  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    colors: new Float32Array(colors),
    count: positions.length / 3,
    ground,
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
    this._assetBase = opts.assetBase || '';
    // antialias:false — MSAA softens pixel-art billboards into mush when not 1:1.
    this.gl = canvas.getContext('webgl2', { antialias: false, alpha: false });
    if (!this.gl) throw new Error('WebGL2 not supported');
    this._dpr = 1;
    this._contextLost = false;

    // Pure JS state — untouched by a context loss, so it's set up once here rather
    // than in _initGL (which re-runs on every restore).
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
    this.sunDir = [...DEFAULT_SUN_DIR];
    this.sunColor = [...DEFAULT_SUN_COLOR];
    this.fillColor = [...DEFAULT_FILL_COLOR];
    this.groundAmbient = [...DEFAULT_GROUND_AMBIENT];
    this.skyColor = [0.58, 0.74, 0.92];
    this.ambientFloor = 0.42;
    this.keyStrength = 0.7;
    this.pointLights = [];
    this._lightProfile = resolveLighting(null);
    this.sampler = new TerrainSampler(this._assetBase);
    this.sampler.loadAll().then(() => {
      this._dirtyMap = true;
    });

    this._initGL();

    // WebGL contexts can be lost at any time — GPU memory pressure, a backgrounded
    // mobile tab, driver resets — and it's especially common on phones. Losing the
    // context resets EVERY GL resource (shaders, buffers, textures, even clearColor)
    // to nothing, with no error thrown; draws silently become no-ops, which shows as
    // the canvas going solid default-black regardless of the actual map/lighting (live
    // report + video: a bright daylight map flashing to pure black for a frame or two,
    // recovering shortly after, with the 2D highlight overlay on top completely
    // unaffected since it's a separate canvas — exactly what an unhandled context
    // loss/restore cycle looks like). Previously nothing here ever listened for this.
    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault(); // required — without this the context is never restored
      this._contextLost = true;
    });
    canvas.addEventListener('webglcontextrestored', () => {
      this._contextLost = false;
      this._glTex.clear(); // old WebGLTexture objects are dead; re-upload on demand
      this._initGL();
      this._dirtyMap = true;
      this._dirtyUnits = true;
    });
  }

  /** (Re)create every GL-side resource — shaders, VAOs, buffers, texture cache. Called
   * once from the constructor and again after webglcontextrestored. */
  _initGL() {
    const canvas = this.canvas;
    const gl = this.gl;
    const vs = compile(gl, gl.VERTEX_SHADER, VS);
    const fs = compile(gl, gl.FRAGMENT_SHADER, FS);
    this.program = link(gl, vs, fs);

    this.attribs = {
      pos: gl.getAttribLocation(this.program, 'aPos'),
      normal: gl.getAttribLocation(this.program, 'aNormal'),
      color: gl.getAttribLocation(this.program, 'aColor'),
      uv: gl.getAttribLocation(this.program, 'aUV'),
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
      tex: gl.getUniformLocation(this.program, 'uTex'),
      useTex: gl.getUniformLocation(this.program, 'uUseTex'),
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
    /** Per-texture ground meshes: [{ url, vaoObj, count }] — real GPU-textured tiles. */
    this._groundMeshes = [];

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
    this._glTex = this._glTex || new Map();
    this._billboards = [];

    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.disable(gl.CULL_FACE);
    // Bright sky so a failed mesh never reads as “pure black void”
    gl.clearColor(this.skyColor[0], this.skyColor[1], this.skyColor[2], 1);
    gl.useProgram(this.program);

    // Immediate clear — HiDPI backing store (see syncSize)
    const dpr = Math.min(typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1, 3);
    const w0 = Math.max(1, Math.floor((canvas.clientWidth || 800) * dpr));
    const h0 = Math.max(1, Math.floor((canvas.clientHeight || 600) * dpr));
    canvas.width = w0;
    canvas.height = h0;
    this._dpr = dpr;
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
    const uv = gl.createBuffer();

    gl.bindBuffer(gl.ARRAY_BUFFER, pos);
    gl.enableVertexAttribArray(this.attribs.pos);
    gl.vertexAttribPointer(this.attribs.pos, 3, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, norm);
    gl.enableVertexAttribArray(this.attribs.normal);
    gl.vertexAttribPointer(this.attribs.normal, 3, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, col);
    gl.enableVertexAttribArray(this.attribs.color);
    gl.vertexAttribPointer(this.attribs.color, 3, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, uv);
    gl.enableVertexAttribArray(this.attribs.uv);
    gl.vertexAttribPointer(this.attribs.uv, 2, gl.FLOAT, false, 0, 0);

    gl.bindVertexArray(null);
    return { vao, pos, norm, col, uv };
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
    gl.bindBuffer(gl.ARRAY_BUFFER, meshTarget.uv);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      mesh.uvs || new Float32Array((mesh.positions.length / 3) * 2),
      gl.DYNAMIC_DRAW,
    );
    gl.bindVertexArray(null);
  }

  /** Rebuild the per-texture-URL ground VAOs (real GPU-textured tiles). */
  _uploadGroundMeshes(groundList) {
    const gl = this.gl;
    // Clean up the previous batch's GL objects before replacing (mesh rebuilds are
    // infrequent — only on _dirtyMap — but leaking VAOs/buffers on every map edit adds up).
    for (const gm of this._groundMeshes || []) {
      gl.deleteVertexArray(gm.vaoObj.vao);
      gl.deleteBuffer(gm.vaoObj.pos);
      gl.deleteBuffer(gm.vaoObj.norm);
      gl.deleteBuffer(gm.vaoObj.col);
      gl.deleteBuffer(gm.vaoObj.uv);
    }
    this._groundMeshes = groundList.map((g) => {
      const vaoObj = this._createMeshVAO();
      this._upload(vaoObj, g);
      const tex = this.sampler.images[g.url] ? this._ensureTex(this.sampler.images[g.url], true) : null;
      return { tex, vaoObj, count: g.count, url: g.url };
    });
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

  /**
   * Match canvas buffer to CSS size × devicePixelRatio so 4K / HiDPI stays sharp.
   * (clientWidth alone = CSS px; without DPR the browser upscales a soft buffer.)
   *
   * Resizing a <canvas> element (setting .width/.height) always clears its contents —
   * that's the spec, not a bug we can work around directly. The problem: this.canvas
   * gets reparented into a fresh #iso3dMount every time a targeting modal opens/closes
   * (attack, spell cast, ...), and that mount's measured clientWidth/Height can briefly
   * read differently than the main battlefield mount's for one frame around the swap —
   * live report: "the entire thing clips out for a split second... between every attack"
   * (not a lighting issue, not the geometry going black — the whole canvas blips). A
   * one-frame size disagreement is never a real intentional resize (a real window/
   * container resize persists across many frames), so only commit a new buffer size
   * once the same reading has held for two consecutive calls — absorbs the reparent
   * blip without adding any lag to genuine resizes.
   */
  syncSize() {
    const dpr = Math.min(
      typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1,
      3,
    );
    const cssW = this.canvas.clientWidth || 800;
    const cssH = this.canvas.clientHeight || 600;
    const w = Math.max(1, Math.floor(cssW * dpr));
    const h = Math.max(1, Math.floor(cssH * dpr));
    const pending = this._pendingWH;
    if (!pending || pending.w !== w || pending.h !== h) {
      this._pendingWH = { w, h };
    } else if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
      // Actually resizing a <canvas> (setting .width/.height, not just its CSS size)
      // reinitializes its drawing buffer per spec — and the new buffer starts cleared
      // to WebGL's true default (0,0,0,0), NOT whatever gl.clearColor was last set to.
      // clearColor was only ever (re)applied once at init and again whenever the
      // lighting profile changed — never on a resize itself — so any genuine resize
      // (container reflow from battle-log growth, HP changes, anything) silently
      // reverted the clear color to black until the next lighting sync happened to
      // fire. This is the actual root cause of the black blip: 100% spec-defined
      // browser behavior, not device/driver flakiness — which is exactly why it was
      // identical across every phone, GPU, and browser engine tested. Re-apply the
      // renderer's own current sky color immediately so a resize is never visible.
      if (this.gl && this.skyColor) {
        this.gl.clearColor(this.skyColor[0], this.skyColor[1], this.skyColor[2], 1);
      }
    }
    // Always report/viewport the CURRENT committed buffer size (not the pending one)
    // so drawing this frame matches whatever's actually in the buffer right now.
    const curW = this.canvas.width || w;
    const curH = this.canvas.height || h;
    this._dpr = dpr;
    const gl = this.gl;
    if (gl) gl.viewport(0, 0, curW, curH);
    return { w: curW, h: curH, aspect: curW / Math.max(1, curH), dpr };
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
      this._uploadGroundMeshes(mesh.ground || []);
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
    // Mid context-loss: every GL call below is a spec-defined no-op anyway, but skip
    // the work entirely rather than churn through it every frame until restored.
    if (this._contextLost || this.gl.isContextLost()) return;
    const gl = this.gl;
    const { w, h, aspect } = this.syncSize();
    // Re-set clearColor every single frame, unconditionally, right before clearing.
    // Previously this was only ever applied once at init and again whenever the
    // lighting profile changed — never every frame — on the assumption that GL state
    // like clearColor just sticks around once set. Live reports (video-confirmed,
    // identical across every phone/GPU/browser tested — camera provably NOT moving
    // when it happens) showed the whole canvas going solid black for a frame or two
    // with the 2D overlay on top completely unaffected, recovering on its own. That
    // pattern means the drawing buffer got cleared to (0,0,0,0) by *something* other
    // than this code's own gl.clear() call with the real sky color. Rather than chase
    // the exact trigger further, just stop depending on clearColor being sticky at
    // all — this costs one cheap GL call and makes the actual mechanism irrelevant.
    if (this.skyColor) gl.clearColor(this.skyColor[0], this.skyColor[1], this.skyColor[2], 1);
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
    u1(this.uniforms.useTex, 0);
    if (this.mapCount > 0) {
      gl.bindVertexArray(this.mapVAO.vao);
      gl.drawArrays(gl.TRIANGLES, 0, this.mapCount);
    }
    // Real GPU-textured ground tiles — one draw call per distinct terrain texture.
    if (this._groundMeshes && this._groundMeshes.length) {
      u1(this.uniforms.useTex, 1);
      gl.activeTexture(gl.TEXTURE0);
      if (this.uniforms.tex != null) gl.uniform1i(this.uniforms.tex, 0);
      for (const gm of this._groundMeshes) {
        if (!gm.tex || gm.count <= 0) continue;
        gl.bindTexture(gl.TEXTURE_2D, gm.tex);
        gl.bindVertexArray(gm.vaoObj.vao);
        gl.drawArrays(gl.TRIANGLES, 0, gm.count);
      }
      u1(this.uniforms.useTex, 0);
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

  /**
   * @param {HTMLImageElement} img
   * @param {boolean} [repeat] REPEAT wrap instead of CLAMP_TO_EDGE — for seamless-tileable
   *   ground textures sampled with a per-tile UV offset (see buildMapMesh), so adjacent
   *   tiles of the same terrain type show a different crop instead of an identical repeat.
   *   Billboards (default, clamp) must never wrap — a UV sliver past 1.0 would smear.
   */
  _ensureTex(img, repeat) {
    const gl = this.gl;
    const key = (img.src || img) + (repeat ? '|repeat' : '');
    let tex = this._glTex.get(key);
    if (tex) return tex;
    tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
    const wrap = repeat ? gl.REPEAT : gl.CLAMP_TO_EDGE;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
    // Ground tiles recede at a shallow isometric angle with a per-tile UV offset — plain
    // NEAREST minification (no mip levels) undersamples the far/oblique texels and aliases
    // into a moire of stray fine lines (live report: "tiny green lines" on grass, "white
    // lines going crossways" on stone). Mipmap only the minify side so distant/angled tiles
    // blend instead of aliasing; MAG stays NEAREST so close-up pixel art stays crisp.
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, repeat ? gl.LINEAR_MIPMAP_LINEAR : gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    try {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
      if (repeat) gl.generateMipmap(gl.TEXTURE_2D);
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
    const { w, h, aspect, dpr } = this.syncSize();
    // client coords are CSS px; buffer is HiDPI — scale into framebuffer space
    const scaleX = w / Math.max(1, rect.width);
    const scaleY = h / Math.max(1, rect.height);
    const x = (clientX - rect.left) * scaleX;
    const y = (clientY - rect.top) * scaleY;

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
