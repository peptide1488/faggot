export function init(canvasEl) {
  const gl = canvasEl.getContext('webgl2', { antialias: true, alpha: false });
  if (!gl) throw new Error('WebGL2 not supported');

  // Basic vertex shader (passes position through projection matrix)
  const vsSource = `#version 300 es
    in vec4 aPos;
    uniform mat4 uProj;
    void main() {
      gl_Position = uProj * aPos;
    }`;

  // Fragment shader (solid dark background color)
  const fsSource = `#version 300 es
    precision mediump float;
    out vec4 fragColor;
    void main() {
      fragColor = vec4(0.1, 0.12, 0.15, 1.0);
    }`;

  function compileShader(src, type) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.error(gl.getShaderInfoLog(s));
      gl.deleteShader(s);
      return null;
    }
    return s;
  }

  const vs = compileShader(vsSource, gl.VERTEX_SHADER);
  const fs = compileShader(fsSource, gl.FRAGMENT_SHADER);
  const prog = gl.createProgram();
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    console.error(gl.getProgramInfoLog(prog));
  }

  const uProjLoc = gl.getUniformLocation(prog, 'uProj');

  // Orthographic projection tuned for 2:1 dimetric isometric view.
  // Maintains square world units on screen regardless of canvas aspect ratio.
  // Geometry will be transformed via model/view matrices before this projection.
  function getOrthoMatrix() {
    const aspect = canvasEl.clientWidth / canvasEl.clientHeight;
    const halfH = 50;
    const halfW = halfH * aspect;
    return new Float32Array([
      1.0 / halfW, 0, 0, 0,
      0, 1.0 / halfH, 0, 0,
      0, 0, -1.0 / 50.0, 0,
      0, 0, 0, 1.0
    ]);
  }

  gl.useProgram(prog);
  gl.uniformMatrix4fv(uProjLoc, false, getOrthoMatrix());

  // Clear to dark color and enable depth testing for future geometry
  gl.clearColor(0.08, 0.1, 0.15, 1.0);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.enable(gl.DEPTH_TEST);

  return { gl, prog, uProjLoc, getOrthoMatrix };
}
