/**
 * WebGL2 voxel renderer. The ONE place voxel GRID-space positions from mesher.js
 * (x=c east, y=r south, z=elevation up) get converted into this engine's WORLD space
 * (Y-up, matching math.js/getCameraMatrix): worldX=c, worldY=elevation, worldZ=r.
 */

function compile(gl, type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(s);
    gl.deleteShader(s);
    throw new Error(`Voxel shader compile failed: ${log}`);
  }
  return s;
}

function link(gl, vs, fs) {
  const p = gl.createProgram();
  gl.attachShader(p, vs);
  gl.attachShader(p, fs);
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    throw new Error(`Voxel program link failed: ${gl.getProgramInfoLog(p)}`);
  }
  return p;
}

// aSunLit: computeFaceSunTable's per-face "how directly does this face point at the sun"
// scalar (see mesher.js) — combined here with a real GPU shadow map (uShadowMap, rendered by
// renderShadowMap below) so a wall/pillar genuinely blocks the sun from geometry behind it,
// at the shadow map's texel resolution rather than this mesh's own vertex density (the
// earlier approach — subdividing faces into more vertices for more CPU raycast samples —
// blew up triangle counts for a resolution ceiling that was still blocky; see git history).
const VS_SRC = `#version 300 es
layout(location=0) in vec3 aPosition;
layout(location=1) in vec2 aUV;
layout(location=2) in vec3 aTint;
layout(location=3) in float aSunLit;
layout(location=4) in float aBounceLit;
layout(location=5) in vec3 aNormal;
layout(location=6) in vec3 aTangent;
uniform mat4 uMVP;
uniform mat4 uLightMVP;
uniform vec3 uCameraEye;
out vec2 vUV;
out vec3 vTint;
out float vSunLit;
out float vBounceLit;
out vec3 vNormal;
out vec3 vTangent;
out float vCamDist;
out vec3 vWorldPos;
out vec4 vLightSpacePos;
void main() {
  vUV = aUV;
  vTint = aTint;
  vSunLit = aSunLit;
  vBounceLit = aBounceLit;
  vNormal = aNormal;
  vTangent = aTangent;
  // Distance from the camera along the actual world position (not just view-axis depth) —
  // exact under an orthographic projection (no perspective correction needed), so linearly
  // interpolating this per-vertex across a triangle is mathematically correct, not an
  // approximation. See FS_SRC's distanceFade() for why this exists.
  vCamDist = distance(aPosition, uCameraEye);
  // World-space position (Y-up, same space aPosition already is) — used by vertical fog
  // (FS_SRC), which fades by world HEIGHT rather than camera distance.
  vWorldPos = aPosition;
  vLightSpacePos = uLightMVP * vec4(aPosition, 1.0);
  gl_Position = uMVP * vec4(aPosition, 1.0);
}`;

const FS_SRC = `#version 300 es
precision mediump float;
in vec2 vUV;
in vec3 vTint;
in float vSunLit;
in float vBounceLit;
in vec3 vNormal;
in vec3 vTangent;
in float vCamDist;
in vec3 vWorldPos;
in vec4 vLightSpacePos;
uniform sampler2D uAtlas;
uniform sampler2D uShadowMap;
uniform sampler2D uShadowMapEnv;
uniform sampler2D uEmissiveMap;
uniform sampler2D uNormalMap;
uniform bool uHasEmissive;
uniform bool uHasNormalMap;
// Billboards sample uShadowMapEnv (an ENV-ONLY shadow map — see renderShadowMap's own doc
// comment) instead of the full uShadowMap: their own sun-facing shadow-CASTING quad (added so
// the shadow's shape stays stable regardless of viewing angle — see buildBillboardShadowMesh)
// crosses their camera-facing DISPLAY quad at a real angle rather than coinciding with it, so
// from the sun's point of view roughly half the display quad legitimately sits "behind" its own
// shadow-caster — a real bug hit live ("when the sun is rotated half the billboard is black").
// A small numeric bias can't fix a geometric crossing this size, so billboards instead read from
// a shadow map that never had ANY billboard shadow-caster rasterized into it at all — they still
// correctly receive real shadows cast by terrain/walls/objects, just never a billboard's own.
uniform bool uSkipShadowTest;
uniform vec3 uSunDirWorld;
uniform float uBounceSpill;
uniform float uAlpha;
// Alpha discard threshold (default 0.02). Billboards use a higher cutoff so soft fringe
// doesn't write a solid depth card that hides ground shadows "behind" the sprite.
uniform float uAlphaDiscard;
uniform vec3 uSunColor;
uniform float uSunStrength;
uniform bool uSunActive;
uniform vec3 uBounceColor;
uniform float uBounceStrength;
uniform vec3 uViewDir;
uniform float uRimStrength;
uniform float uRimDistNear;
uniform float uRimDistFar;
uniform vec3 uGlowRimColor;
uniform float uGlowRimStrength;
uniform float uRimAttenuation;
uniform vec3 uFogColor;
uniform float uFogNear;
uniform float uFogFar;
uniform float uFogStrength;
uniform vec3 uVFogColor;
uniform float uVFogBottom;
uniform float uVFogTop;
uniform float uVFogStrength;
// Volumetric gas/fog clouds (see renderer.js's setGasVolumes) — each currently-connected gas
// cloud (see spread.js's getGasCloudCells, walked once per gas tick in voxel.html) becomes ONE
// axis-aligned world-space box here; a cell of BLOCKS gas/fog itself emits no geometry at all
// (see mesher.js's buildMesh skipping def.gas entirely) — this is the ENTIRE visual: a soft,
// per-fragment blend applied to whatever's actually behind/within the box, the exact same
// smoothstep technique uVFogStrength's height-band already uses, just bounded on all 3 axes
// instead of only Y. A fixed-size array (MAX_GAS_VOLUMES slots) + a live count, looped below —
// cheap to skip entirely (the loop just breaks at i=0) on every map with no gas at all.
const int MAX_GAS_VOLUMES = 6;
uniform int uGasVolumeCount;
uniform vec3 uGasBoxMin[MAX_GAS_VOLUMES];
uniform vec3 uGasBoxMax[MAX_GAS_VOLUMES];
uniform vec3 uGasColor[MAX_GAS_VOLUMES];
uniform float uGasStrength[MAX_GAS_VOLUMES];
out vec4 fragColor;

// Soft-edged 1D "am I inside [lo,hi]" ramp: 0 outside by more than margin, 1 well inside,
// smoothly transitioning across margin-wide bands at each edge — the same shape
// smoothstep(bottom,top,y) gives vertical fog's own Y-band, just reusable per-axis here so a
// gas volume's box has no hard/discontinuous boundary (the actual "looks like a solid cube"
// failure a flat per-cell tint had — see this feature's own revision history).
float gasAxisFalloff(float p, float lo, float hi, float margin) {
  float rising = smoothstep(lo - margin, lo, p);
  float falling = 1.0 - smoothstep(hi, hi + margin, p);
  return min(rising, falling);
}

// normalize(0) is NaN in GLSL and will black the whole frame if it hits lit/color — never use
// raw normalize() on vectors that can cancel (half-vector, cross products, etc.).
vec3 safeNormalize(vec3 v) {
  float len = length(v);
  return len > 0.0001 ? v / len : vec3(0.0, 1.0, 0.0);
}

// The actual fix for "a long flat wall glows evenly along its whole length": standard Fresnel
// is angle-only, and under an orthographic camera every point on a flat wall shares the exact
// same angle to the camera regardless of position — so angle alone can never vary along a
// wall's length. Nintendo-style toon shaders multiply Fresnel by a camera-DISTANCE mask too:
// 0 near the camera, ramping to 1 further away, so a wall reads as brightest at its far end
// and dim at its near end instead of uniform. uRimDistNear/Far are the current scene's own
// camera-distance range (see voxel.html), so this always spans whatever's actually visible.
// uRimAttenuation reshapes the fade curve itself: 1.0 is the plain smoothstep S-curve;
// higher values push the transition later (stays dim longer, then catches up fast near the
// far edge — a more "aggressive"/concentrated fade); lower values (down to 0) spread it out
// more evenly across the whole near-far range.
float distanceFade() {
  return pow(smoothstep(uRimDistNear, uRimDistFar, vCamDist), max(0.01, uRimAttenuation));
}

// 3x3 PCF (percentage-closer filtering): averages 9 shadow-map samples around this fragment's
// projected position instead of one, so shadow edges read as a soft gradient at the texel
// grid's own resolution instead of a single hard aliased step.
//
// Bias is slope-scaled AND kept SMALL. The big "detached shadow" bug (gap of lit ground
// between every caster and its shadow, still present when a tree was deliberately sunk into
// the ground with negative yOffset — so NOT transparent-PNG padding) was mostly caused by a
// loose light frustum (near=0.1, far=huge) crushing depth precision; see computeLightMVP in
// voxel.html. With a tight frustum, this bias only needs to cover floating-point / PCF noise,
// not a multi-block world-space gap. Base bias + (1-cos) slope term; values are in NDC depth
// after the 0.5+0.5 remap (0..1 range).
float shadowVisibilityFrom(sampler2D shadowTex, vec3 N) {
  vec3 proj = vLightSpacePos.xyz / vLightSpacePos.w;
  proj = proj * 0.5 + 0.5;
  if (proj.z > 1.0) return 1.0;
  // Outside the light ortho entirely — fully lit (no shadow data).
  if (proj.x < 0.0 || proj.x > 1.0 || proj.y < 0.0 || proj.y > 1.0) return 1.0;
  float cosTheta = clamp(dot(N, uSunDirWorld), 0.0, 1.0);
  // Face-on: small bias. Grazing: a bit more. Do NOT drop face-on below ~0.00012 — that
  // reintroduced map-wide grass-top shadow acne (grid pattern, user 2026-07-14).
  float bias = 0.00012 + 0.00055 * (1.0 - cosTheta);
  vec2 texel = 1.0 / vec2(textureSize(shadowTex, 0));
  float lit = 0.0;
  for (int dx = -1; dx <= 1; dx++) {
    for (int dy = -1; dy <= 1; dy++) {
      float depth = texture(shadowTex, proj.xy + vec2(float(dx), float(dy)) * texel).r;
      lit += (proj.z - bias > depth) ? 0.0 : 1.0;
    }
  }
  float vis = lit / 9.0;
  // Soften the frustum border so residual crop isn't a hard knife-edge when a long tree
  // shadow reaches the ortho limit (user: "cropping the shadow" angle-dependent).
  float edge = min(min(proj.x, 1.0 - proj.x), min(proj.y, 1.0 - proj.y));
  float edgeFade = smoothstep(0.0, 0.03, edge);
  return mix(1.0, vis, edgeFade);
}
float shadowVisibility(vec3 N) { return shadowVisibilityFrom(uShadowMap, N); }

void main() {
  vec4 tex = texture(uAtlas, vUV);
  if (tex.a < uAlphaDiscard) discard;

  // Normal/bump mapping (custom material-maker materials only — see renderer.js's own
  // bindMaterial, which is the only place uHasNormalMap is ever set true): when bound, N below
  // is the PER-FRAGMENT perturbed normal (sampled from uNormalMap, unpacked from 0..1 to
  // -1..1, transformed into world space via the TBN basis built from this face's own vNormal/
  // vTangent) — used for sun/bounce/fresnel below INSTEAD of the flat per-face vNormal, so a
  // bump map actually reads as texture detail catching light differently per-pixel, not a flat
  // tint. Every other material (uHasNormalMap false, the overwhelming majority — every
  // built-in, and any custom material without a normal map) takes N = vNormal, byte-identical
  // to this shader's behavior before normal mapping existed.
  vec3 N = safeNormalize(vNormal);
  if (uHasNormalMap) {
    vec3 T = safeNormalize(vTangent);
    vec3 B = cross(N, T);
    mat3 TBN = mat3(T, B, N);
    vec3 sampledN = texture(uNormalMap, vUV).rgb * 2.0 - 1.0;
    N = safeNormalize(TBN * sampledN);
  }

  vec3 lit = vTint;
  if (uHasNormalMap) {
    // Per-fragment relighting against the perturbed normal — mesher.js's vSunLit/vBounceLit are
    // each only ONE baked value per FACE (see computeFaceSunTable's own doc comment), which
    // can't vary across a bump-mapped surface's individual pixels, so this recomputes the same
    // dot-product math live instead of reading the baked scalars. The flat ambient floor +
    // point lights (vTint, above) and directional ambient are NOT recomputed here — they stay
    // exactly as baked today (a documented scope boundary: their own shadow test is a CPU
    // raycast per light, not something that can reasonably move to per-fragment GPU work in
    // this pass).
    if (uSunActive) {
      float sunLitFrag = max(0.0, dot(N, uSunDirWorld));
      if (sunLitFrag > 0.0) lit += sunLitFrag * shadowVisibility(N) * uSunColor * uSunStrength;
    }
    // Bounce/fill light — same spill-blended-floor shape as mesher.js's computeFaceBounceTable
    // (uBounceSpill mirrors its own default), just evaluated per-fragment against N instead of
    // per-face against the baked table.
    float bounceLitFrag = (1.0 - uBounceSpill) * max(0.0, dot(N, -uSunDirWorld)) + uBounceSpill;
    lit += bounceLitFrag * uBounceColor * uBounceStrength;
  } else {
    if (uSunActive && vSunLit > 0.0) {
      // uSkipShadowTest: billboards only (see its own uniform doc comment) — sample the
      // ENV-ONLY shadow map instead of the full one, so they still receive real shadows from
      // terrain/walls/objects but never self-shadow from a billboard shadow-caster quad.
      float shadowFactor = uSkipShadowTest ? shadowVisibilityFrom(uShadowMapEnv, N) : shadowVisibility(N);
      lit += vSunLit * shadowFactor * uSunColor * uSunStrength;
    }
    // Bounce/fill light: fake, never shadow-map-tested (see mesher.js's computeFaceBounceTable
    // doc comment) — a cheap "the sky/ground bounced some light back" approximation for the
    // sun-shadowed side of objects, not real light transport.
    if (vBounceLit > 0.0) {
      lit += vBounceLit * uBounceColor * uBounceStrength;
    }
  }
  // Rim/fresnel glow ("Nintendo glow") — view-angle-dependent. Orthographic camera -> uViewDir
  // is one constant direction for the whole frame, not per-fragment. distanceFade() is what
  // actually keeps a long flat wall from glowing evenly along its whole length (see its own
  // doc comment) — an earlier per-BLOCK-face edge bias was tried here too and reverted: it
  // highlighted every individual block's own face border, which on a wall of many adjacent
  // tiles produced a repeating diamond/quilt pattern at each internal seam instead of only the
  // structure's real silhouette — "edge" needs neighbor-awareness (like AO already has) to do
  // properly, not attempted here. Two independent uses of the same fresnel/distance math:
  //  - uRimStrength: tied to uSunColor/uSunStrength (no color of its own) — "sunlight catching
  //    the edges." Zero without an active sun (uSunStrength would be 0 too).
  //  - uGlowRimStrength: its own color, completely independent of the sun — e.g. a subtle
  //    green glow so geometry stays readable in a pitch-dark dungeon with no real light at all.
  // Uses N (the perturbed normal when a normal map is bound) so bump detail catches rim light
  // too, not just the flat sun/bounce terms above.
  if (uRimStrength > 0.0 || uGlowRimStrength > 0.0) {
    float facing = max(0.0, dot(N, -uViewDir));
    float fresnel = pow(1.0 - facing, 2.5) * distanceFade();
    lit += fresnel * uRimStrength * uSunColor * uSunStrength;
    lit += fresnel * uGlowRimStrength * uGlowRimColor;
  }

  // Guard: if lighting ever NaN'd (degenerate normals), fall back rather than black fragments.
  if (!(lit.r == lit.r)) lit = max(vTint, vec3(0.05)); // NaN != NaN
  lit = max(lit, vec3(0.0));

  vec3 color = tex.rgb * lit;
  // Emissive (self-illumination) — simple additive, no relighting at all: independent of
  // uHasNormalMap entirely (a material can have either, both, or neither).
  if (uHasEmissive) {
    color += texture(uEmissiveMap, vUV).rgb;
  }
  // Depth-based ambient/sky fog — uses vCamDist (real world-unit distance from the camera eye,
  // exact under an orthographic projection — see the vertex shader's own comment), blended
  // between FIXED world-unit thresholds (uFogNear/uFogFar) the user dials in directly, NOT the
  // scene's own bounding-sphere extent (a real bug: fog used to be computed from
  // computeCameraDistRange, which is derived from where BLOCKS exist — building a tower closer
  // to the camera changed the map's bounding sphere and shifted the WHOLE fog curve, with zero
  // relationship to how far the camera had actually zoomed). Anchoring to the camera's own
  // distance is what makes "zero right up close, dense far away" hold regardless of what's
  // been built or how the map's extent changes. uFogStrength=0 is a true no-op (the mix below
  // is skipped entirely) so fog costs nothing until a caller actually dials it in.
  if (uFogStrength > 0.0) {
    float fogT = clamp(smoothstep(uFogNear, uFogFar, vCamDist) * uFogStrength, 0.0, 1.0);
    color = mix(color, uFogColor, fogT);
  }
  // Vertical (height-based) fog — independent of camera distance entirely: fades by the
  // fragment's own WORLD-SPACE HEIGHT (vWorldPos.y), dense at/below uVFogBottom, clear at/above
  // uVFogTop — a classic "ground fog" band, e.g. thick mist filling a dungeon floor while the
  // upper reaches of a tall room stay clear.
  if (uVFogStrength > 0.0) {
    float vFogT = clamp((1.0 - smoothstep(uVFogBottom, uVFogTop, vWorldPos.y)) * uVFogStrength, 0.0, 1.0);
    color = mix(color, uVFogColor, vFogT);
  }
  // Volumetric gas/fog clouds — a soft per-fragment blend toward each currently-connected
  // cloud's own color, bounded to its own world-space box (see uGasBoxMin/Max's own doc
  // comment above for why this is the whole visual, with no cube geometry involved anywhere).
  // Applied to EVERY fragment this shader draws (terrain, water, units — anything), same as
  // distance/vertical fog above, so a cloud reads as sitting IN the scene, not painted onto one
  // specific surface.
  const float GAS_EDGE_MARGIN = 0.6;
  for (int i = 0; i < MAX_GAS_VOLUMES; i++) {
    if (i >= uGasVolumeCount) break;
    float dx = gasAxisFalloff(vWorldPos.x, uGasBoxMin[i].x, uGasBoxMax[i].x, GAS_EDGE_MARGIN);
    float dy = gasAxisFalloff(vWorldPos.y, uGasBoxMin[i].y, uGasBoxMax[i].y, GAS_EDGE_MARGIN);
    float dz = gasAxisFalloff(vWorldPos.z, uGasBoxMin[i].z, uGasBoxMax[i].z, GAS_EDGE_MARGIN);
    float gasT = clamp(dx * dy * dz * uGasStrength[i], 0.0, 1.0);
    color = mix(color, uGasColor[i], gasT);
  }
  fragColor = vec4(color, tex.a * uAlpha);
}`;

// Depth-only pass (renders the scene from the sun's point of view into uShadowMap) — mostly
// only cares about position; every other attribute stays bound (same VAOs as the main pass) but
// unused, EXCEPT aUV, which is sampled below so a billboard's transparent-PNG cutout casts its
// actual silhouette instead of a solid box shadow (a real bug hit live — see
// renderShadowMap's own comment on uShadowTex for the rest of that fix).
const SHADOW_VS_SRC = `#version 300 es
layout(location=0) in vec3 aPosition;
layout(location=1) in vec2 aUV;
uniform mat4 uLightMVP;
out vec2 vUV;
void main() {
  vUV = aUV;
  gl_Position = uLightMVP * vec4(aPosition, 1.0);
}`;

const SHADOW_FS_SRC = `#version 300 es
precision mediump float;
in vec2 vUV;
uniform sampler2D uShadowTex;
// Alpha cutout for billboard casters (blocks/materials are fully opaque so this never fires
// for them). Transparent padding under roots is UV-cropped in buildBillboardShadowMesh — do
// NOT force a solid bottom UV band (uShadowContactStrip): that cast a full-width rectangular
// bar under every tree (hard dark band, screenshot 2026-07-14 203938). Keep strip uniform for
// optional debug only; production path leaves it at 0.
uniform float uShadowAlphaCutoff;
uniform float uShadowContactStrip; // 0 = off (production); >0 = legacy full-width solid bottom band
out vec4 fragColor;
void main() {
  float a = texture(uShadowTex, vUV).a;
  if (uShadowContactStrip > 0.0) {
    if (a < uShadowAlphaCutoff && vUV.y < uShadowContactStrip) discard;
  } else {
    if (a < uShadowAlphaCutoff) discard;
  }
  fragColor = vec4(1.0);
}`;

function toGLBuffer(gl, target, data, usage) {
  const buf = gl.createBuffer();
  gl.bindBuffer(target, buf);
  gl.bufferData(target, data, usage);
  return buf;
}

/** Grid-space (c, r, elevation) -> world-space (x, y-up, z) — the one axis conversion point. */
function gridPositionsToWorld(positions) {
  const out = new Float32Array(positions.length);
  for (let i = 0; i < positions.length; i += 3) {
    out[i] = positions[i];
    out[i + 1] = positions[i + 2];
    out[i + 2] = positions[i + 1];
  }
  return out;
}

/** A set of per-material GLMeshes (custom material-maker materials each get their own
 * texture + draw call — see customMaterials.js/mesher.js). `sync` uploads whatever's present
 * this frame and clears (uploads empty, doesn't destroy the GL objects) any material that
 * dropped out, so removing the last instance of a custom material's blocks from the map
 * doesn't leave stale geometry drawn forever. */
class MaterialBucketSet {
  constructor(gl) {
    this.gl = gl;
    this.meshes = new Map();
  }

  sync(byMaterialBuf) {
    const seen = new Set();
    for (const [materialId, buf] of Object.entries(byMaterialBuf || {})) {
      seen.add(materialId);
      let mesh = this.meshes.get(materialId);
      if (!mesh) {
        mesh = new GLMesh(this.gl);
        this.meshes.set(materialId, mesh);
      }
      mesh.upload(buf);
    }
    for (const [materialId, mesh] of this.meshes) {
      if (!seen.has(materialId)) mesh.upload(EMPTY_BUF);
    }
  }

  drawAll(bindMaterial) {
    for (const [materialId, mesh] of this.meshes) {
      if (!mesh.count) continue;
      bindMaterial(materialId);
      mesh.draw();
    }
  }
}

const EMPTY_BUF = {
  positions: [], uvs: [], colors: [], sunLit: [], bounceLit: [],
  normals: [], tangents: [], indices: [],
};

// Must match FS_SRC's own `const int MAX_GAS_VOLUMES = 6;` exactly — see setGasVolumes.
const MAX_GAS_VOLUMES = 6;

class GLMesh {
  constructor(gl) {
    this.gl = gl;
    this.vao = gl.createVertexArray();
    this.count = 0;
  }

  upload(buf) {
    const gl = this.gl;
    gl.bindVertexArray(this.vao);

    const positions = gridPositionsToWorld(new Float32Array(buf.positions));
    const uvs = new Float32Array(buf.uvs);
    const colors = new Float32Array(buf.colors);
    // Defensive fallback (0 for every vertex) for any buffer producer that predates the
    // sunLit/bounceLit attributes — mesher.js's own createMeshBuffer/pushQuad always populate
    // them, but this keeps a stale/hand-built buffer object from uploading a too-short
    // attribute buffer instead of silently corrupting the draw.
    const sunLit = new Float32Array(buf.sunLit && buf.sunLit.length ? buf.sunLit : new Array(positions.length / 3).fill(0));
    const bounceLit = new Float32Array(buf.bounceLit && buf.bounceLit.length ? buf.bounceLit : new Array(positions.length / 3).fill(0));
    // Normals need the exact same grid->world axis swap as positions (see gridPositionsToWorld)
    // — it's a pure Y<->Z swap with no translation, so it's valid for direction vectors too,
    // no separate inverse-transpose "normal matrix" needed for this specific transform.
    const normals = gridPositionsToWorld(new Float32Array(buf.normals && buf.normals.length ? buf.normals : new Array(positions.length).fill(0)));
    // Tangents need the same grid->world axis swap as positions/normals, for the same reason
    // (a pure Y<->Z swap, valid for direction vectors) — see mesher.js's pushQuad doc comment
    // for why every quad carries one regardless of whether a normal map is bound.
    const tangents = gridPositionsToWorld(new Float32Array(buf.tangents && buf.tangents.length ? buf.tangents : new Array(positions.length).fill(0)));
    const indices = new Uint32Array(buf.indices);

    toGLBuffer(gl, gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);

    toGLBuffer(gl, gl.ARRAY_BUFFER, uvs, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 0, 0);

    toGLBuffer(gl, gl.ARRAY_BUFFER, colors, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 3, gl.FLOAT, false, 0, 0);

    toGLBuffer(gl, gl.ARRAY_BUFFER, sunLit, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(3, 1, gl.FLOAT, false, 0, 0);

    toGLBuffer(gl, gl.ARRAY_BUFFER, bounceLit, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(4);
    gl.vertexAttribPointer(4, 1, gl.FLOAT, false, 0, 0);

    toGLBuffer(gl, gl.ARRAY_BUFFER, normals, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(5);
    gl.vertexAttribPointer(5, 3, gl.FLOAT, false, 0, 0);

    toGLBuffer(gl, gl.ARRAY_BUFFER, tangents, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(6);
    gl.vertexAttribPointer(6, 3, gl.FLOAT, false, 0, 0);

    const idxBuf = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, idxBuf);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);

    gl.bindVertexArray(null);
    this.count = indices.length;
  }

  draw() {
    if (!this.count) return;
    const gl = this.gl;
    gl.bindVertexArray(this.vao);
    gl.drawElements(gl.TRIANGLES, this.count, gl.UNSIGNED_INT, 0);
    gl.bindVertexArray(null);
  }
}

export class VoxelRenderer {
  constructor(canvas) {
    const gl = canvas.getContext('webgl2', { antialias: true, alpha: false });
    if (!gl) throw new Error('WebGL2 not supported');
    this.gl = gl;
    this.canvas = canvas;

    const vs = compile(gl, gl.VERTEX_SHADER, VS_SRC);
    const fs = compile(gl, gl.FRAGMENT_SHADER, FS_SRC);
    this.program = link(gl, vs, fs);
    this.uMVP = gl.getUniformLocation(this.program, 'uMVP');
    this.uAtlas = gl.getUniformLocation(this.program, 'uAtlas');
    this.uAlpha = gl.getUniformLocation(this.program, 'uAlpha');
    this.uAlphaDiscard = gl.getUniformLocation(this.program, 'uAlphaDiscard');
    this.uLightMVP = gl.getUniformLocation(this.program, 'uLightMVP');
    this.uShadowMap = gl.getUniformLocation(this.program, 'uShadowMap');
    this.uShadowMapEnv = gl.getUniformLocation(this.program, 'uShadowMapEnv');
    this.uSunColor = gl.getUniformLocation(this.program, 'uSunColor');
    this.uSunStrength = gl.getUniformLocation(this.program, 'uSunStrength');
    this.uSunActive = gl.getUniformLocation(this.program, 'uSunActive');
    this.uBounceColor = gl.getUniformLocation(this.program, 'uBounceColor');
    this.uBounceStrength = gl.getUniformLocation(this.program, 'uBounceStrength');
    this.uViewDir = gl.getUniformLocation(this.program, 'uViewDir');
    this.uRimStrength = gl.getUniformLocation(this.program, 'uRimStrength');
    this.uCameraEye = gl.getUniformLocation(this.program, 'uCameraEye');
    this.uRimDistNear = gl.getUniformLocation(this.program, 'uRimDistNear');
    this.uRimDistFar = gl.getUniformLocation(this.program, 'uRimDistFar');
    this.uGlowRimColor = gl.getUniformLocation(this.program, 'uGlowRimColor');
    this.uGlowRimStrength = gl.getUniformLocation(this.program, 'uGlowRimStrength');
    this.uRimAttenuation = gl.getUniformLocation(this.program, 'uRimAttenuation');
    this.uFogColor = gl.getUniformLocation(this.program, 'uFogColor');
    this.uFogNear = gl.getUniformLocation(this.program, 'uFogNear');
    this.uFogFar = gl.getUniformLocation(this.program, 'uFogFar');
    this.uFogStrength = gl.getUniformLocation(this.program, 'uFogStrength');
    this.uVFogColor = gl.getUniformLocation(this.program, 'uVFogColor');
    this.uVFogBottom = gl.getUniformLocation(this.program, 'uVFogBottom');
    this.uVFogTop = gl.getUniformLocation(this.program, 'uVFogTop');
    this.uVFogStrength = gl.getUniformLocation(this.program, 'uVFogStrength');
    this.uEmissiveMap = gl.getUniformLocation(this.program, 'uEmissiveMap');
    this.uNormalMap = gl.getUniformLocation(this.program, 'uNormalMap');
    this.uHasEmissive = gl.getUniformLocation(this.program, 'uHasEmissive');
    this.uHasNormalMap = gl.getUniformLocation(this.program, 'uHasNormalMap');
    this.uSkipShadowTest = gl.getUniformLocation(this.program, 'uSkipShadowTest');
    this.uSunDirWorld = gl.getUniformLocation(this.program, 'uSunDirWorld');
    this.uBounceSpill = gl.getUniformLocation(this.program, 'uBounceSpill');
    // Uniform ARRAYS: one location per array (using the `[0]` element name), set all-at-once
    // per frame with a single uniformNfv call carrying every active slot's flattened data —
    // see setGasVolumes/render() below.
    this.uGasVolumeCount = gl.getUniformLocation(this.program, 'uGasVolumeCount');
    this.uGasBoxMin = gl.getUniformLocation(this.program, 'uGasBoxMin[0]');
    this.uGasBoxMax = gl.getUniformLocation(this.program, 'uGasBoxMax[0]');
    this.uGasColor = gl.getUniformLocation(this.program, 'uGasColor[0]');
    this.uGasStrength = gl.getUniformLocation(this.program, 'uGasStrength[0]');

    const shadowVs = compile(gl, gl.VERTEX_SHADER, SHADOW_VS_SRC);
    const shadowFs = compile(gl, gl.FRAGMENT_SHADER, SHADOW_FS_SRC);
    this.shadowProgram = link(gl, shadowVs, shadowFs);
    this.uShadowLightMVP = gl.getUniformLocation(this.shadowProgram, 'uLightMVP');
    this.uShadowTex = gl.getUniformLocation(this.shadowProgram, 'uShadowTex');
    this.uShadowAlphaCutoff = gl.getUniformLocation(this.shadowProgram, 'uShadowAlphaCutoff');
    this.uShadowContactStrip = gl.getUniformLocation(this.shadowProgram, 'uShadowContactStrip');
    // Texture unit binding is fixed for the life of the program (unlike uLightMVP, set fresh
    // every renderShadowMap() call) — set once here, never touched again.
    gl.useProgram(this.shadowProgram);
    gl.uniform1i(this.uShadowTex, 0);
    gl.uniform1f(this.uShadowAlphaCutoff, 0.02);
    gl.uniform1f(this.uShadowContactStrip, 0.0);

    // Shadow map: a depth-only render target, sized independent of scene geometry (see
    // renderShadowMap) — this is the whole point of moving off the earlier per-vertex CPU
    // raycast approach, which could only get finer by adding more triangles to the actual mesh.
    this.shadowMapSize = 2048;
    this.shadowDepthTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.shadowDepthTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT24, this.shadowMapSize, this.shadowMapSize, 0, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.shadowFBO = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.shadowFBO);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, this.shadowDepthTex, 0);
    // No color attachment needed (depth-only) — tell the driver explicitly so a framebuffer
    // completeness check can't fail for "missing" color output on stricter implementations.
    gl.drawBuffers([gl.NONE]);
    gl.readBuffer(gl.NONE);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    // Second, ENV-ONLY shadow map — identical setup, but renderShadowMap() draws every opaque
    // bucket into it EXCEPT billboardShadowSet. Billboards sample this one (see uSkipShadowTest's
    // own comment) instead of the full map above: they still get real shadows from terrain/walls/
    // objects, but never from ANY billboard shadow-caster quad (including their own), which is
    // what actually caused the "half the billboard goes black" self-shadow bug — a numeric bias
    // can't fix that geometric crossing, but simply never rasterizing billboard casters into the
    // map billboards themselves read from sidesteps it entirely.
    this.shadowDepthTexEnv = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.shadowDepthTexEnv);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT24, this.shadowMapSize, this.shadowMapSize, 0, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.shadowFBOEnv = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.shadowFBOEnv);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, this.shadowDepthTexEnv, 0);
    gl.drawBuffers([gl.NONE]);
    gl.readBuffer(gl.NONE);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    // Sun state — see setSun(). Starts inactive (no lightMVP yet, uSunActive=false), so
    // render() is a no-op shadow-wise until voxel.html actually calls setSun() with a profile.
    // bounce (fake fill light, see mesher.js computeFaceBounceTable) starts at strength 0 —
    // off by default, independent of whether the sun/shadow-map itself is active, since it
    // needs no shadow map at all.
    // dirWorld: the RAW (Y-up, lighting.js convention) sun direction, unlike lightMVP's baked
    // shadow-frustum matrix — needed by normal-mapped materials' per-fragment relighting (see
    // FS_SRC), since mesher.js's vSunLit is only one baked scalar per FACE and can't vary across
    // a bump-mapped surface's individual pixels. Already the same space world-space normals/
    // tangents are uploaded in (see gridPositionsToWorld), so no axis conversion is needed here.
    this.sun = { active: false, lightMVP: null, color: [1, 1, 1], strength: 0, dirWorld: [0.55, 0.82, 0.28] };
    // bounceSpill mirrors mesher.js's computeFaceBounceTable default spill (0.3) — used by
    // normal-mapped materials' per-fragment bounce recompute (see FS_SRC) so the two paths
    // (baked-per-face vs. per-fragment) produce the same blend shape.
    this.bounce = { color: [1, 1, 1], strength: 0, spill: 0.3 };
    // Rim/fresnel (see FS_SRC) — view-dependent, tied to uSunColor/uSunStrength (no separate
    // color), so only a strength knob lives here. viewDir/eye/dist range default to
    // reasonable no-op-ish values; voxel.html calls setCamera() every frame with the real
    // ones (an orthographic camera's eye/forward direction only, computed from cam.rot/pan).
    this.rimStrength = 0;
    this.rimAttenuation = 1; // 1 = plain smoothstep; see distanceFade()'s own doc comment
    this.viewDir = [0, -1, 0];
    this.cameraEye = [0, 0, 0];
    this.rimDistNear = 0;
    this.rimDistFar = 1;
    // Glow rim (see FS_SRC) — same fresnel/distance shape as the sun-tied rim above, but its
    // own color and completely independent of the sun (uSunActive/uSunStrength don't gate
    // this at all) — e.g. a subtle glow so geometry stays readable in a pitch-dark dungeon.
    this.glowRim = { color: [1, 1, 1], strength: 0 };
    // Depth-based ambient/sky fog (see FS_SRC) — near/far are FIXED world-unit distances from
    // the camera eye, set directly by the caller (voxel.html's Fog sliders), deliberately NOT
    // derived from the scene's own bounding sphere (see FS_SRC's own comment on the real bug
    // this caused: building geometry closer to the camera shifted the whole fog curve, with no
    // relation to actual camera zoom). strength=0 is off by default.
    this.fog = { color: [0.58, 0.74, 0.92], near: 10, far: 40, strength: 0 };
    // Vertical (height-based) ground fog (see FS_SRC) — independent of the distance fog above;
    // bottom/top are world-space Y thresholds (dense at/below bottom, clear at/above top).
    this.vfog = { color: [0.58, 0.74, 0.92], bottom: 0, top: 4, strength: 0 };

    this.atlasTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.atlasTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    this.opaqueMesh = new GLMesh(gl);
    this.translucentMesh = new GLMesh(gl);
    this.unitMesh = new GLMesh(gl);
    this.ghostMesh = new GLMesh(gl);
    // Object Maker's live 3D box-editor preview (see mesher.js's buildMultiBoxMesh) — a small,
    // separate buffer since it's rebuilt every frame while the panel is open (following the
    // camera, like a "held item"), same "own small buffer, not bucketed" pattern as unitMesh.
    this.objPreviewMesh = new GLMesh(gl);

    // Custom material-maker materials: each owns its own GPU texture (materialId -> WebGLTexture)
    // and draws in its own extra draw call, bucketed opaque/translucent same as the shared atlas.
    this.materialTextures = new Map();
    // Optional per-material extra layers (see setMaterialEmissiveMap/setMaterialNormalMap) —
    // absence (not in the Map) means "this material has neither", read by bindMaterial to set
    // uHasEmissive/uHasNormalMap per draw call. Scoped to custom materials only; the shared
    // atlas (built-ins) never gets these regardless of what's in these Maps.
    this.materialEmissiveTextures = new Map();
    this.materialNormalTextures = new Map();
    // Volumetric gas/fog clouds (see setGasVolumes/FS_SRC's gas-volume loop) — a plain array of
    // up to MAX_GAS_VOLUMES `{min:[x,y,z], max:[x,y,z], color:[r,g,b], strength}` world-space
    // boxes, recomputed and re-set by the caller (voxel.html) whenever gas cells change. NOT a
    // per-material concept at all (gas cells emit no geometry, so there's no draw call to
    // bucket this against) — a single global list uploaded once per render() call.
    this.gasVolumes = [];
    this.materialOpaqueSet = new MaterialBucketSet(gl);
    this.materialTranslucentSet = new MaterialBucketSet(gl);
    this.ghostMaterialSet = new MaterialBucketSet(gl);

    // Decals (see voxel/decals.js + mesher.js buildDecalMesh) — same "one texture, one extra
    // draw call per item in use" shape as custom materials above (MaterialBucketSet is generic
    // enough to reuse verbatim, keyed by decal type id instead of material id).
    this.decalTextures = new Map();
    this.decalSet = new MaterialBucketSet(gl);

    // Billboards (see voxel/billboards.js + mesher.js buildBillboardMesh) — same "one texture,
    // one extra draw call per item in use" shape as decals/custom materials above, but rebuilt
    // every frame (see voxel.html's tick()) rather than only on markDirty, since a billboard's
    // quad orientation tracks the camera's live rotation.
    this.billboardTextures = new Map();
    this.billboardSet = new MaterialBucketSet(gl);
    // Separate shadow-casting geometry (mesher.js's buildBillboardShadowMesh) — oriented toward
    // the SUN, not the player's camera, so the shadow's shape stays stable regardless of viewing
    // angle (see that function's own doc comment). Reuses billboardTextures for the alpha-test
    // sampling in renderShadowMap — same texture, different geometry/draw call.
    this.billboardShadowSet = new MaterialBucketSet(gl);
    // Solid stump/toe casters (alphaCutoff=0) — close trunk/shadow gap without UV contact strips.
    this.billboardContactShadowSet = new MaterialBucketSet(gl);

    // Backface culling on from day one — a wound-wrong box shows up as a missing face
    // immediately instead of hiding until a later z-fighting mystery (VOXEL_PLAN.md pitfall #2).
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);
    // mesher.js's winding is authored/verified CCW-outward in GRID space (x=c,y=r,z=elev).
    // gridPositionsToWorld swaps y<->z to reach this engine's Y-up world space — a single
    // axis swap is a mirror (determinant -1), which reverses every triangle's winding. Front
    // faces are CW here, not GL's default CCW — this is the fix, not the geometry.
    gl.frontFace(gl.CW);
    gl.enable(gl.DEPTH_TEST);
    // Base background (no fog) — render() re-blends this toward the fog color each frame (see
    // its own comment) so the "sky"/void beyond geometry reads as foggy too, not a hard-edged
    // fixed-color background distant fogged geometry fades into.
    this.baseClearColor = [0.08, 0.09, 0.12];
    gl.clearColor(...this.baseClearColor, 1);
  }

  /** Upload a placeholder or real atlas from any CanvasImageSource. */
  setAtlasImage(image) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.atlasTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
  }

  /** Shared create-on-first-use-then-reupload logic behind setMaterialAtlas/
   * setMaterialEmissiveMap/setMaterialNormalMap/setDecalTexture — identical texture parameter
   * setup each time, just a different backing Map. */
  _uploadIntoTextureMap(map, key, image) {
    const gl = this.gl;
    let tex = map.get(key);
    if (!tex) {
      tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      map.set(key, tex);
    } else {
      gl.bindTexture(gl.TEXTURE_2D, tex);
    }
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
  }

  /** Upload (creating on first use) a custom material's own texture, from any
   * CanvasImageSource — including re-uploads for an animated (GIF-sourced) face's next frame. */
  setMaterialAtlas(materialId, image) {
    this._uploadIntoTextureMap(this.materialTextures, materialId, image);
  }

  /** Upload a custom material's optional emissive (self-illumination) texture — same per-face
   * grid layout/UV as the albedo texture (see CONTENT_TOOLS_PLAN.md), sampled additively in
   * FS_SRC. Absence (never called for a given materialId) means no glow at all — bindMaterial
   * checks this Map to set uHasEmissive per draw call. */
  setMaterialEmissiveMap(materialId, image) {
    this._uploadIntoTextureMap(this.materialEmissiveTextures, materialId, image);
  }

  /** Upload a custom material's optional normal map (a bump/height map is converted to one
   * client-side before this is called — see blocks.js's bumpToNormalMap) — same per-face grid
   * layout/UV as the albedo texture. Drives per-fragment relighting in FS_SRC when present;
   * bindMaterial checks this Map to set uHasNormalMap per draw call. */
  setMaterialNormalMap(materialId, image) {
    this._uploadIntoTextureMap(this.materialNormalTextures, materialId, image);
  }

  /** Replace the full list of currently-active volumetric gas/fog clouds — called by the
   * caller (voxel.html) whenever gas cells change (each gas tick), recomputed from scratch via
   * spread.js's getGasCloudCells flood-fill (one connected cloud = one box). Each entry:
   * `{ min:[x,y,z], max:[x,y,z], color:[r,g,b], strength }`, all WORLD-space (caller's job to
   * convert from grid space — see gridPositionsToWorld's own y<->z swap convention). Silently
   * caps at MAX_GAS_VOLUMES (the shader's fixed array size) — extra clouds beyond that just
   * don't render, an acceptable v1 limit rather than a crash. */
  setGasVolumes(volumes) {
    this.gasVolumes = volumes.slice(0, MAX_GAS_VOLUMES);
  }

  /** Upload (creating on first use) a decal type's own texture — same shape as
   * setMaterialAtlas, since a decal is a single full-image texture (no top/side/bottom grid). */
  setDecalTexture(typeId, image) {
    this._uploadIntoTextureMap(this.decalTextures, typeId, image);
  }

  /** buildDecalMesh's { byType } output — one bucket per decal type, synced the same way
   * setMesh's byMaterial buckets are. */
  setDecalMesh(byType = {}) {
    this.decalSet.sync(byType);
  }

  /** Upload (creating on first use) a billboard type's own texture — same shape as
   * setDecalTexture, since a billboard is a single full-image (transparent PNG) texture. */
  setBillboardTexture(typeId, image) {
    this._uploadIntoTextureMap(this.billboardTextures, typeId, image);
  }

  /** buildBillboardMesh's { byType } output — one bucket per billboard type. Called every
   * frame (not just on markDirty), since the mesh itself is rebuilt every frame to track the
   * camera's rotation — see voxel.html's tick(). */
  setBillboardMesh(byType = {}) {
    this.billboardSet.sync(byType);
  }

  /** buildBillboardShadowMesh output — canopy (byType) + solid contact stump (contactByType). */
  setBillboardShadowMesh(byType = {}, contactByType = {}) {
    this.billboardShadowSet.sync(byType);
    this.billboardContactShadowSet.sync(contactByType);
  }

  setMesh({ opaque, translucent, byMaterial = {} }) {
    this.opaqueMesh.upload(opaque);
    this.translucentMesh.upload(translucent);
    const opaqueByMat = {};
    const translucentByMat = {};
    for (const [materialId, buf] of Object.entries(byMaterial)) {
      opaqueByMat[materialId] = buf.opaque;
      translucentByMat[materialId] = buf.translucent;
    }
    this.materialOpaqueSet.sync(opaqueByMat);
    this.materialTranslucentSet.sync(translucentByMat);
  }

  /** A single translucent preview (the pending block at the raycast target) drawn last, always
   * alpha-blended regardless of its own block type — see VOXEL_PLAN.md pitfall #9. `shared` is
   * the merged opaque+translucent buffer for shared-atlas faces; `byMaterial` (optional) is
   * one merged buffer per custom material the ghost's faces reference. */
  setGhostMesh(bucketed) {
    this.ghostMesh.upload(bucketed?.shared ?? EMPTY_BUF);
    this.ghostMaterialSet.sync(bucketed?.byMaterial ?? {});
  }

  /** Unit standees — drawn as regular opaque, depth-tested geometry (not a 2D overlay), so
   * they're correctly occluded by walls for free (VOXEL_PLAN.md pitfall #5). Uploaded on its
   * own small buffer since units move every frame while terrain geometry stays static. */
  setUnitMesh(buf) {
    this.unitMesh.upload(buf ?? EMPTY_BUF);
  }

  /** Object Maker's live box-editor preview — same "own small buffer, rebuilt often" reasoning
   * as setUnitMesh, just driven by voxel.html's panel-open state instead of unit movement. */
  setObjectPreviewMesh(buf) {
    this.objPreviewMesh.upload(buf ?? EMPTY_BUF);
  }

  resize(width, height) {
    this.canvas.width = width;
    this.canvas.height = height;
  }

  /** Configure the sun for both the shadow-map pass and the main shader's uniforms.
   * lightMVP: a light-space (orthographic projection * lookAt) matrix, typically built from
   * the scene's bounds + sun direction (see voxel.html) — null/omitted disables the sun
   * entirely (uSunActive=false), skipping renderShadowMap and leaving vTint as the only
   * lighting, e.g. when there's no lightProfile at all. color/strength map directly to the
   * shader's uSunColor/uSunStrength — changing these needs NO mesh rebuild, just new uniforms
   * (unlike direction, which changes computeFaceSunTable's per-vertex bake — see mesher.js).
   * bounceColor/bounceStrength configure the fake fill light (see mesher.js's
   * computeFaceBounceTable) — entirely independent of whether the sun/shadow-map itself is
   * active, since bounce never needs the shadow map at all. rimStrength: see FS_SRC's rim/
   * fresnel term — tied to uSunColor/uSunStrength (no separate color), 0 disables it.
   * rimAttenuation: reshapes distanceFade()'s curve (see its own doc comment) — shared by
   * BOTH this rim and the independent glowRim (setGlowRim), since they use the same fade.
   * dirWorld: the RAW (Y-up) sun direction, not the baked lightMVP matrix — only consulted for
   * normal-mapped materials' per-fragment relighting (see FS_SRC); defaults to the previous
   * direction if omitted so callers that only care about color/strength don't need to repeat it.
   * bounceSpill: mirrors mesher.js's computeFaceBounceTable spill parameter, for the same
   * normal-mapped per-fragment bounce recompute — defaults to 0.3, matching that function's own
   * default, so omitting it produces the same blend shape as the baked path already uses. */
  setSun({ lightMVP, color = [1, 1, 1], strength = 0, dirWorld, bounceColor = [1, 1, 1], bounceStrength = 0, bounceSpill = 0.3, rimStrength = 0, rimAttenuation = 1 } = {}) {
    this.sun = { active: !!lightMVP, lightMVP: lightMVP || null, color, strength, dirWorld: dirWorld || this.sun.dirWorld };
    this.bounce = { color: bounceColor, strength: bounceStrength, spill: bounceSpill };
    this.rimStrength = rimStrength;
    this.rimAttenuation = rimAttenuation;
  }

  /** Camera state for this frame, purely for the rim/fresnel term (FS_SRC) — nothing else
   * (the actual MVP matrix comes separately via render()'s own argument).
   * viewDir: the camera's constant forward direction — with an ORTHOGRAPHIC projection every
   * view ray is parallel, so this is one vector for the whole scene, not per-fragment.
   * eye: world-space camera position, for the DISTANCE half of the rim fix (see
   * distanceFade() in FS_SRC) — angle alone can't vary along a flat wall under orthographic
   * projection, so Nintendo-style toon shaders also fade by camera distance.
   * distNear/distFar: the current scene's own camera-distance range (see voxel.html's
   * computeCameraDistRange), so the fade always spans whatever's actually visible rather than
   * a fixed/arbitrary distance. */
  setCamera({ viewDir, eye, distNear = 0, distFar = 1 }) {
    this.viewDir = viewDir;
    this.cameraEye = eye;
    this.rimDistNear = distNear;
    this.rimDistFar = distFar;
  }

  /** The independent "glow rim" (see FS_SRC) — same fresnel/distance shape as the sun-tied
   * rim, but its own color, with no dependency on the sun being active at all. */
  setGlowRim({ color = [1, 1, 1], strength = 0 } = {}) {
    this.glowRim = { color, strength };
  }

  /** Depth-based ambient/sky fog (see FS_SRC) — a distance-only blend toward `color`, not real
   * volumetric scattering. near/far are FIXED world-unit distances from the camera eye (NOT
   * derived from scene bounds — see FS_SRC's own comment on the bug that caused: building
   * geometry closer to the camera used to shift the whole fog curve). strength=0 disables it. */
  setFog({ color = [0.58, 0.74, 0.92], near = 10, far = 40, strength = 0 } = {}) {
    this.fog = { color, near, far, strength };
  }

  /** Vertical (height-based) ground fog (see FS_SRC) — independent of camera distance, fades by
   * the fragment's own world-space Y: dense at/below `bottom`, clear at/above `top`. */
  setVerticalFog({ color = [0.58, 0.74, 0.92], bottom = 0, top = 4, strength = 0 } = {}) {
    this.vfog = { color, bottom, top, strength };
  }

  /** Depth-only pass: render all opaque geometry (shared-atlas + every custom material
   * bucket) from the sun's point of view into shadowDepthTex. Translucent geometry (glass/
   * water) deliberately does NOT cast shadows — a reasonable v1 scope limit, not an oversight. */
  renderShadowMap() {
    const gl = this.gl;
    gl.useProgram(this.shadowProgram);
    gl.uniformMatrix4fv(this.uShadowLightMVP, false, this.sun.lightMVP);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
    // Push solid casters slightly away from the light so coplanar receivers don't acne —
    // cheaper and less gap-prone than a large constant depth bias in the main-pass compare.
    // Billboard cards use a milder offset (below): the full factor shoved thin sprites too far
    // and opened a lit gap between trunk and canopy shadow (user screenshot 2026-07-14 204200).
    gl.enable(gl.POLYGON_OFFSET_FILL);
    gl.polygonOffset(1.1, 4.0);

    // uShadowTex needs a real bound texture per draw call now (see SHADOW_FS_SRC's alpha test,
    // added so billboard shadows respect their transparent-PNG cutout instead of casting a solid
    // box) — mirrors the main pass's own per-bucket texture binding below, just simpler (no
    // emissive/normal-map extras, the shadow shader doesn't use them).
    const drawEnvironment = () => {
      gl.bindTexture(gl.TEXTURE_2D, this.atlasTex);
      this.opaqueMesh.draw();
      this.unitMesh.draw();
      for (const [materialId, mesh] of this.materialOpaqueSet.meshes) {
        gl.bindTexture(gl.TEXTURE_2D, this.materialTextures.get(materialId) || this.atlasTex);
        mesh.draw();
      }
    };

    // Full map: environment + billboard shadow-casters (sun-oriented geometry — see
    // buildBillboardShadowMesh's own doc comment — NOT billboardSet, the camera-facing display
    // geometry, so the shadow's shape doesn't change with the player's viewing angle). Sampled by
    // everything EXCEPT billboards themselves in the main pass (see uShadowMap's use in render()),
    // so environment geometry still correctly receives shadows cast by billboards standing on it.
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.shadowFBO);
    gl.viewport(0, 0, this.shadowMapSize, this.shadowMapSize);
    gl.clear(gl.DEPTH_BUFFER_BIT);
    gl.uniform1f(this.uShadowAlphaCutoff, 0.02);
    gl.uniform1f(this.uShadowContactStrip, 0.0);
    drawEnvironment();
    // Billboards: sun-facing X-cross, alpha cutout only. No stakes/boxes/contact strips
    // (those produced lines, squares, and spoke bars). Keep it simple.
    gl.disable(gl.CULL_FACE);
    gl.polygonOffset(0.5, 1.5);
    gl.uniform1f(this.uShadowContactStrip, 0.0);
    gl.uniform1f(this.uShadowAlphaCutoff, 0.2);
    for (const [typeId, mesh] of this.billboardShadowSet.meshes) {
      gl.bindTexture(gl.TEXTURE_2D, this.billboardTextures.get(typeId) || this.atlasTex);
      mesh.draw();
    }
    // contactByType kept empty by mesher; draw loop is a no-op when empty.
    for (const [typeId, mesh] of this.billboardContactShadowSet.meshes) {
      gl.bindTexture(gl.TEXTURE_2D, this.billboardTextures.get(typeId) || this.atlasTex);
      mesh.draw();
    }
    gl.polygonOffset(1.1, 4.0);
    gl.uniform1f(this.uShadowAlphaCutoff, 0.02);
    gl.uniform1f(this.uShadowContactStrip, 0.0);
    gl.enable(gl.CULL_FACE);

    // Env-only map: same geometry, MINUS every billboard shadow-caster. Billboards sample this
    // one instead of the full map above (see uShadowMapEnv/uSkipShadowTest) — they still receive
    // real shadows from terrain/walls/objects, but never from a billboard shadow-caster quad
    // (own or otherwise), which is what caused the "half the billboard goes black" self-shadow
    // bug when the sun angle made their sun-facing caster cross their camera-facing display quad.
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.shadowFBOEnv);
    gl.viewport(0, 0, this.shadowMapSize, this.shadowMapSize);
    gl.clear(gl.DEPTH_BUFFER_BIT);
    gl.uniform1f(this.uShadowAlphaCutoff, 0.02);
    gl.uniform1f(this.uShadowContactStrip, 0.0);
    drawEnvironment();

    gl.disable(gl.POLYGON_OFFSET_FILL);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  render(mvp) {
    const gl = this.gl;

    // Never let the shadow pre-pass abort the main color pass (a throw/GL error there used to
    // leave a black canvas with only the clear color).
    if (this.sun.active) {
      try {
        this.renderShadowMap();
      } catch (e) {
        console.error('[VoxelRenderer] renderShadowMap failed — drawing unshadowed:', e);
        this.sun.active = false;
      }
    }

    // Blend the clear color (the "sky"/void beyond all geometry) toward BOTH fog colors by
    // their own strengths — otherwise distant fogged-out geometry fades into a fixed, unrelated
    // background color instead of disappearing into the fog seamlessly. Sequential blends
    // (distance fog first, then vertical fog on top), same order FS_SRC itself applies them in.
    const fogT = Math.max(0, Math.min(1, this.fog.strength));
    const vfogT = Math.max(0, Math.min(1, this.vfog.strength));
    let bg0 = this.baseClearColor[0];
    let bg1 = this.baseClearColor[1];
    let bg2 = this.baseClearColor[2];
    const fc = this.fog.color;
    bg0 += (fc[0] - bg0) * fogT;
    bg1 += (fc[1] - bg1) * fogT;
    bg2 += (fc[2] - bg2) * fogT;
    const vc = this.vfog.color;
    bg0 += (vc[0] - bg0) * vfogT;
    bg1 += (vc[1] - bg1) * vfogT;
    bg2 += (vc[2] - bg2) * vfogT;
    gl.clearColor(bg0, bg1, bg2, 1);

    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.useProgram(this.program);
    gl.uniformMatrix4fv(this.uMVP, false, mvp);
    gl.activeTexture(gl.TEXTURE0);
    gl.uniform1i(this.uAtlas, 0);
    gl.uniform1f(this.uAlpha, 1.0);
    gl.uniform1f(this.uAlphaDiscard, 0.02);
    gl.uniform1i(this.uSunActive, this.sun.active ? 1 : 0);
    // uSunColor/uSunStrength are set UNCONDITIONALLY (not just when sun.active) — the rim/
    // fresnel term below reads them too and isn't gated by uSunActive at all (it needs no
    // shadow map), so leaving them at a stale value from a previous frame when the sun
    // happens to be inactive would make rim silently use the wrong color/strength.
    gl.uniform3fv(this.uSunColor, this.sun.color);
    gl.uniform1f(this.uSunStrength, this.sun.strength);
    if (this.sun.active) {
      gl.uniformMatrix4fv(this.uLightMVP, false, this.sun.lightMVP);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, this.shadowDepthTex);
      gl.uniform1i(this.uShadowMap, 1);
      gl.activeTexture(gl.TEXTURE4);
      gl.bindTexture(gl.TEXTURE_2D, this.shadowDepthTexEnv);
      gl.uniform1i(this.uShadowMapEnv, 4);
      gl.activeTexture(gl.TEXTURE0);
    }
    // Bounce/fill light — always set regardless of sun.active (no shadow map dependency at
    // all); strength defaults to 0, so it's a no-op until setSun's bounceStrength is nonzero.
    gl.uniform3fv(this.uBounceColor, this.bounce.color);
    gl.uniform1f(this.uBounceStrength, this.bounce.strength);
    // Rim/fresnel — also unconditional; tied to uSunColor/uSunStrength above, gated purely by
    // uRimStrength itself (0 = off) in the shader.
    gl.uniform3fv(this.uViewDir, this.viewDir);
    gl.uniform1f(this.uRimStrength, this.rimStrength);
    gl.uniform3fv(this.uCameraEye, this.cameraEye);
    gl.uniform1f(this.uRimDistNear, this.rimDistNear);
    gl.uniform1f(this.uRimDistFar, this.rimDistFar);
    gl.uniform3fv(this.uGlowRimColor, this.glowRim.color);
    gl.uniform1f(this.uGlowRimStrength, this.glowRim.strength);
    gl.uniform1f(this.uRimAttenuation, this.rimAttenuation);
    gl.uniform3fv(this.uFogColor, this.fog.color);
    gl.uniform1f(this.uFogNear, this.fog.near);
    gl.uniform1f(this.uFogFar, this.fog.far);
    gl.uniform1f(this.uFogStrength, this.fog.strength);
    gl.uniform3fv(this.uVFogColor, this.vfog.color);
    gl.uniform1f(this.uVFogBottom, this.vfog.bottom);
    gl.uniform1f(this.uVFogTop, this.vfog.top);
    gl.uniform1f(this.uVFogStrength, this.vfog.strength);
    // Volumetric gas/fog clouds — flatten this.gasVolumes into the 4 parallel arrays FS_SRC's
    // fixed-size uniform arrays expect, set all-at-once (one uniformNfv call per array, not one
    // call per slot). Padding beyond the live count doesn't matter — the shader's own loop
    // breaks at uGasVolumeCount before reading any padding.
    gl.uniform1i(this.uGasVolumeCount, this.gasVolumes.length);
    if (this.gasVolumes.length > 0) {
      const mins = new Float32Array(MAX_GAS_VOLUMES * 3);
      const maxs = new Float32Array(MAX_GAS_VOLUMES * 3);
      const colors = new Float32Array(MAX_GAS_VOLUMES * 3);
      const strengths = new Float32Array(MAX_GAS_VOLUMES);
      this.gasVolumes.forEach((v, i) => {
        mins.set(v.min, i * 3);
        maxs.set(v.max, i * 3);
        colors.set(v.color, i * 3);
        strengths[i] = v.strength;
      });
      gl.uniform3fv(this.uGasBoxMin, mins);
      gl.uniform3fv(this.uGasBoxMax, maxs);
      gl.uniform3fv(this.uGasColor, colors);
      gl.uniform1fv(this.uGasStrength, strengths);
    }
    // World-space sun direction + bounce spill — only consulted by normal-mapped materials'
    // per-fragment relighting (see FS_SRC), set unconditionally same as everything else above.
    gl.uniform3fv(this.uSunDirWorld, this.sun.dirWorld);
    gl.uniform1f(this.uBounceSpill, this.bounce.spill);
    // Emissive/normal map sampler UNIT assignments never change frame to frame — fixed at units
    // 2/3 (0=atlas, 1=shadow map).
    gl.activeTexture(gl.TEXTURE2);
    gl.uniform1i(this.uEmissiveMap, 2);
    gl.activeTexture(gl.TEXTURE3);
    gl.uniform1i(this.uNormalMap, 3);
    gl.activeTexture(gl.TEXTURE0);

    // Scoped to CUSTOM materials only (see bindMaterial below) — every shared-atlas draw call
    // (built-ins: opaqueMesh/translucentMesh/unitMesh/the non-material half of the ghost mesh)
    // must explicitly reset these before drawing, since a PRIOR custom-material draw call may
    // have left them set to true.
    const resetMaterialExtras = () => {
      gl.uniform1i(this.uHasEmissive, 0);
      gl.uniform1i(this.uHasNormalMap, 0);
    };

    const bindMaterial = (materialId) => {
      gl.bindTexture(gl.TEXTURE_2D, this.materialTextures.get(materialId) || this.atlasTex);
      const emissiveTex = this.materialEmissiveTextures.get(materialId);
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, emissiveTex || this.atlasTex);
      gl.uniform1i(this.uHasEmissive, emissiveTex ? 1 : 0);
      const normalTex = this.materialNormalTextures.get(materialId);
      gl.activeTexture(gl.TEXTURE3);
      gl.bindTexture(gl.TEXTURE_2D, normalTex || this.atlasTex);
      gl.uniform1i(this.uHasNormalMap, normalTex ? 1 : 0);
      gl.activeTexture(gl.TEXTURE0);
    };

    // Opaque pass — units draw here too (not a 2D overlay), so the depth test occludes
    // them behind walls for free instead of needing painter's-algorithm sorting hacks. One
    // extra draw call per custom material in use (materialOpaqueSet) — see mesher.js's
    // byMaterial bucketing; built-in materials stay a single shared-atlas draw call.
    gl.depthMask(true);
    gl.disable(gl.BLEND);
    resetMaterialExtras();
    gl.uniform1i(this.uSkipShadowTest, 0);
    gl.bindTexture(gl.TEXTURE_2D, this.atlasTex);
    this.opaqueMesh.draw();
    this.unitMesh.draw();
    this.objPreviewMesh.draw();
    this.materialOpaqueSet.drawAll(bindMaterial);

    // Billboards — cutout sprites. Depth test + write ON so trees sort against walls/each
    // other (depth write off let cards paint through cliff faces). Higher alpha discard so
    // soft PNG fringe doesn't write a solid depth card. Flat billboards can still *intersect*
    // a cliff geometrically (card has no volume) — that's inherent unless we volume-clip.
    // Skip self-shadow (uSkipShadowTest).
    gl.disable(gl.CULL_FACE);
    gl.depthMask(true);
    resetMaterialExtras();
    gl.uniform1i(this.uSkipShadowTest, 1);
    gl.uniform1f(this.uAlphaDiscard, 0.15);
    this.billboardSet.drawAll((typeId) => {
      gl.bindTexture(gl.TEXTURE_2D, this.billboardTextures.get(typeId) || this.atlasTex);
    });
    gl.uniform1f(this.uAlphaDiscard, 0.02);
    gl.uniform1i(this.uSkipShadowTest, 0);
    gl.enable(gl.CULL_FACE);

    // Translucent pass: depth-tested against opaque geometry but not written, and NOT
    // sorted (counts are tiny in v1 demo maps) — see VOXEL_PLAN.md pitfall #6 for the
    // back-to-front sorting this will need once translucent geometry gets denser.
    gl.depthMask(false);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    resetMaterialExtras(); // the prior materialOpaqueSet pass may have left these set to true
    gl.bindTexture(gl.TEXTURE_2D, this.atlasTex);
    this.translucentMesh.draw();
    this.materialTranslucentSet.drawAll(bindMaterial);

    // Decals (see voxel/decals.js + mesher.js buildDecalMesh) — thin overlays snapped to an
    // already-placed block's face, drawn depth-tested-but-not-written (same blended pass as
    // translucent geometry) so they read as painted onto the surface rather than a separate
    // floating sprite. Not part of the shadow-map pre-pass (renderShadowMap) — same v1 scope
    // limit translucent geometry already has; a thin inset overlay casting its own shadow
    // isn't worth the complexity. Decals never have emissive/normal maps of their own — reset
    // rather than leaving whatever the prior materialTranslucentSet pass set.
    resetMaterialExtras();
    this.decalSet.drawAll((typeId) => {
      gl.bindTexture(gl.TEXTURE_2D, this.decalTextures.get(typeId) || this.atlasTex);
    });

    // Ghost preview: always drawn last, always partly transparent regardless of what
    // block it represents (pitfall #9) — a cheap, honest "here's what you're about to place".
    gl.uniform1f(this.uAlpha, 0.55);
    resetMaterialExtras();
    gl.bindTexture(gl.TEXTURE_2D, this.atlasTex);
    this.ghostMesh.draw();
    this.ghostMaterialSet.drawAll(bindMaterial);
    gl.uniform1f(this.uAlpha, 1.0);

    gl.depthMask(true);
    gl.disable(gl.BLEND);
  }
}
