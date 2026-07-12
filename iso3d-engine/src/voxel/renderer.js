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
uniform mat4 uMVP;
uniform mat4 uLightMVP;
out vec2 vUV;
out vec3 vTint;
out float vSunLit;
out vec4 vLightSpacePos;
void main() {
  vUV = aUV;
  vTint = aTint;
  vSunLit = aSunLit;
  vLightSpacePos = uLightMVP * vec4(aPosition, 1.0);
  gl_Position = uMVP * vec4(aPosition, 1.0);
}`;

const FS_SRC = `#version 300 es
precision mediump float;
in vec2 vUV;
in vec3 vTint;
in float vSunLit;
in vec4 vLightSpacePos;
uniform sampler2D uAtlas;
uniform sampler2D uShadowMap;
uniform float uAlpha;
uniform vec3 uSunColor;
uniform float uSunStrength;
uniform bool uSunActive;
out vec4 fragColor;

// 3x3 PCF (percentage-closer filtering): averages 9 shadow-map samples around this fragment's
// projected position instead of one, so shadow edges read as a soft gradient at the texel
// grid's own resolution instead of a single hard aliased step.
float shadowVisibility() {
  vec3 proj = vLightSpacePos.xyz / vLightSpacePos.w;
  proj = proj * 0.5 + 0.5;
  if (proj.x < 0.0 || proj.x > 1.0 || proj.y < 0.0 || proj.y > 1.0 || proj.z > 1.0) return 1.0;
  float bias = 0.0015;
  vec2 texel = 1.0 / vec2(textureSize(uShadowMap, 0));
  float lit = 0.0;
  for (int dx = -1; dx <= 1; dx++) {
    for (int dy = -1; dy <= 1; dy++) {
      float depth = texture(uShadowMap, proj.xy + vec2(float(dx), float(dy)) * texel).r;
      lit += (proj.z - bias > depth) ? 0.0 : 1.0;
    }
  }
  return lit / 9.0;
}

void main() {
  vec4 tex = texture(uAtlas, vUV);
  if (tex.a < 0.02) discard;
  vec3 lit = vTint;
  if (uSunActive && vSunLit > 0.0) {
    lit += vSunLit * shadowVisibility() * uSunColor * uSunStrength;
  }
  fragColor = vec4(tex.rgb * lit, tex.a * uAlpha);
}`;

// Depth-only pass (renders the scene from the sun's point of view into uShadowMap) — the
// simplest possible shader pair, only cares about position; every other attribute stays bound
// (same VAOs as the main pass) but unused.
const SHADOW_VS_SRC = `#version 300 es
layout(location=0) in vec3 aPosition;
uniform mat4 uLightMVP;
void main() {
  gl_Position = uLightMVP * vec4(aPosition, 1.0);
}`;

const SHADOW_FS_SRC = `#version 300 es
precision mediump float;
out vec4 fragColor;
void main() {
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

const EMPTY_BUF = { positions: [], uvs: [], colors: [], sunLit: [], indices: [] };

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
    // sunLit attribute — mesher.js's own createMeshBuffer/pushQuad always populate it, but
    // this keeps a stale/hand-built buffer object from uploading a too-short attribute buffer
    // instead of silently corrupting the draw.
    const sunLit = new Float32Array(buf.sunLit && buf.sunLit.length ? buf.sunLit : new Array(positions.length / 3).fill(0));
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
    this.uLightMVP = gl.getUniformLocation(this.program, 'uLightMVP');
    this.uShadowMap = gl.getUniformLocation(this.program, 'uShadowMap');
    this.uSunColor = gl.getUniformLocation(this.program, 'uSunColor');
    this.uSunStrength = gl.getUniformLocation(this.program, 'uSunStrength');
    this.uSunActive = gl.getUniformLocation(this.program, 'uSunActive');

    const shadowVs = compile(gl, gl.VERTEX_SHADER, SHADOW_VS_SRC);
    const shadowFs = compile(gl, gl.FRAGMENT_SHADER, SHADOW_FS_SRC);
    this.shadowProgram = link(gl, shadowVs, shadowFs);
    this.uShadowLightMVP = gl.getUniformLocation(this.shadowProgram, 'uLightMVP');

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

    // Sun state — see setSun(). Starts inactive (no lightMVP yet, uSunActive=false), so
    // render() is a no-op shadow-wise until voxel.html actually calls setSun() with a profile.
    this.sun = { active: false, lightMVP: null, color: [1, 1, 1], strength: 0 };

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

    // Custom material-maker materials: each owns its own GPU texture (materialId -> WebGLTexture)
    // and draws in its own extra draw call, bucketed opaque/translucent same as the shared atlas.
    this.materialTextures = new Map();
    this.materialOpaqueSet = new MaterialBucketSet(gl);
    this.materialTranslucentSet = new MaterialBucketSet(gl);
    this.ghostMaterialSet = new MaterialBucketSet(gl);

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
    gl.clearColor(0.08, 0.09, 0.12, 1);
  }

  /** Upload a placeholder or real atlas from any CanvasImageSource. */
  setAtlasImage(image) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.atlasTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
  }

  /** Upload (creating on first use) a custom material's own texture, from any
   * CanvasImageSource — including re-uploads for an animated (GIF-sourced) face's next frame. */
  setMaterialAtlas(materialId, image) {
    const gl = this.gl;
    let tex = this.materialTextures.get(materialId);
    if (!tex) {
      tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      this.materialTextures.set(materialId, tex);
    } else {
      gl.bindTexture(gl.TEXTURE_2D, tex);
    }
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
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
   * (unlike direction, which changes computeFaceSunTable's per-vertex bake — see mesher.js). */
  setSun({ lightMVP, color = [1, 1, 1], strength = 0 } = {}) {
    this.sun = { active: !!lightMVP, lightMVP: lightMVP || null, color, strength };
  }

  /** Depth-only pass: render all opaque geometry (shared-atlas + every custom material
   * bucket) from the sun's point of view into shadowDepthTex. Translucent geometry (glass/
   * water) deliberately does NOT cast shadows — a reasonable v1 scope limit, not an oversight. */
  renderShadowMap() {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.shadowFBO);
    gl.viewport(0, 0, this.shadowMapSize, this.shadowMapSize);
    gl.clear(gl.DEPTH_BUFFER_BIT);
    gl.useProgram(this.shadowProgram);
    gl.uniformMatrix4fv(this.uShadowLightMVP, false, this.sun.lightMVP);
    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(true);
    gl.disable(gl.BLEND);

    this.opaqueMesh.draw();
    this.unitMesh.draw();
    for (const [, mesh] of this.materialOpaqueSet.meshes) mesh.draw();

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  render(mvp) {
    const gl = this.gl;

    if (this.sun.active) this.renderShadowMap();

    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.useProgram(this.program);
    gl.uniformMatrix4fv(this.uMVP, false, mvp);
    gl.activeTexture(gl.TEXTURE0);
    gl.uniform1i(this.uAtlas, 0);
    gl.uniform1f(this.uAlpha, 1.0);
    gl.uniform1i(this.uSunActive, this.sun.active ? 1 : 0);
    if (this.sun.active) {
      gl.uniformMatrix4fv(this.uLightMVP, false, this.sun.lightMVP);
      gl.uniform3fv(this.uSunColor, this.sun.color);
      gl.uniform1f(this.uSunStrength, this.sun.strength);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, this.shadowDepthTex);
      gl.uniform1i(this.uShadowMap, 1);
      gl.activeTexture(gl.TEXTURE0);
    }

    const bindMaterial = (materialId) => {
      gl.bindTexture(gl.TEXTURE_2D, this.materialTextures.get(materialId) || this.atlasTex);
    };

    // Opaque pass — units draw here too (not a 2D overlay), so the depth test occludes
    // them behind walls for free instead of needing painter's-algorithm sorting hacks. One
    // extra draw call per custom material in use (materialOpaqueSet) — see mesher.js's
    // byMaterial bucketing; built-in materials stay a single shared-atlas draw call.
    gl.depthMask(true);
    gl.disable(gl.BLEND);
    gl.bindTexture(gl.TEXTURE_2D, this.atlasTex);
    this.opaqueMesh.draw();
    this.unitMesh.draw();
    this.materialOpaqueSet.drawAll(bindMaterial);

    // Translucent pass: depth-tested against opaque geometry but not written, and NOT
    // sorted (counts are tiny in v1 demo maps) — see VOXEL_PLAN.md pitfall #6 for the
    // back-to-front sorting this will need once translucent geometry gets denser.
    gl.depthMask(false);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.bindTexture(gl.TEXTURE_2D, this.atlasTex);
    this.translucentMesh.draw();
    this.materialTranslucentSet.drawAll(bindMaterial);

    // Ghost preview: always drawn last, always partly transparent regardless of what
    // block it represents (pitfall #9) — a cheap, honest "here's what you're about to place".
    gl.uniform1f(this.uAlpha, 0.55);
    gl.bindTexture(gl.TEXTURE_2D, this.atlasTex);
    this.ghostMesh.draw();
    this.ghostMaterialSet.drawAll(bindMaterial);
    gl.uniform1f(this.uAlpha, 1.0);

    gl.depthMask(true);
    gl.disable(gl.BLEND);
  }
}
