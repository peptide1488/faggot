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

const VS_SRC = `#version 300 es
layout(location=0) in vec3 aPosition;
layout(location=1) in vec2 aUV;
layout(location=2) in vec3 aTint;
uniform mat4 uMVP;
out vec2 vUV;
out vec3 vTint;
void main() {
  vUV = aUV;
  vTint = aTint;
  gl_Position = uMVP * vec4(aPosition, 1.0);
}`;

const FS_SRC = `#version 300 es
precision mediump float;
in vec2 vUV;
in vec3 vTint;
uniform sampler2D uAtlas;
uniform float uAlpha;
out vec4 fragColor;
void main() {
  vec4 tex = texture(uAtlas, vUV);
  if (tex.a < 0.02) discard;
  fragColor = vec4(tex.rgb * vTint, tex.a * uAlpha);
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

  setMesh({ opaque, translucent }) {
    this.opaqueMesh.upload(opaque);
    this.translucentMesh.upload(translucent);
  }

  /** A single translucent preview box (the pending block at the raycast target) drawn last,
   * always alpha-blended regardless of its own block type — see VOXEL_PLAN.md pitfall #9. */
  setGhostMesh(buf) {
    this.ghostMesh.upload(buf ?? { positions: [], uvs: [], colors: [], indices: [] });
  }

  /** Unit standees — drawn as regular opaque, depth-tested geometry (not a 2D overlay), so
   * they're correctly occluded by walls for free (VOXEL_PLAN.md pitfall #5). Uploaded on its
   * own small buffer since units move every frame while terrain geometry stays static. */
  setUnitMesh(buf) {
    this.unitMesh.upload(buf ?? { positions: [], uvs: [], colors: [], indices: [] });
  }

  resize(width, height) {
    this.canvas.width = width;
    this.canvas.height = height;
  }

  render(mvp) {
    const gl = this.gl;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.useProgram(this.program);
    gl.uniformMatrix4fv(this.uMVP, false, mvp);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.atlasTex);
    gl.uniform1i(this.uAtlas, 0);
    gl.uniform1f(this.uAlpha, 1.0);

    // Opaque pass — units draw here too (not a 2D overlay), so the depth test occludes
    // them behind walls for free instead of needing painter's-algorithm sorting hacks.
    gl.depthMask(true);
    gl.disable(gl.BLEND);
    this.opaqueMesh.draw();
    this.unitMesh.draw();

    // Translucent pass: depth-tested against opaque geometry but not written, and NOT
    // sorted (counts are tiny in v1 demo maps) — see VOXEL_PLAN.md pitfall #6 for the
    // back-to-front sorting this will need once translucent geometry gets denser.
    gl.depthMask(false);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    this.translucentMesh.draw();

    // Ghost preview: always drawn last, always partly transparent regardless of what
    // block it represents (pitfall #9) — a cheap, honest "here's what you're about to place".
    gl.uniform1f(this.uAlpha, 0.55);
    this.ghostMesh.draw();
    gl.uniform1f(this.uAlpha, 1.0);

    gl.depthMask(true);
    gl.disable(gl.BLEND);
  }
}
