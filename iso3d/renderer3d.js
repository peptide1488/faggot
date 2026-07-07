let glCtx = null;
let progObj = null;
let vaoHandle = null;
let posBufHandle = null;
let normBufHandle = null;
let colBufHandle = null;
let vertexCount = 0;
let canvasRef = null;

// Camera state
let camRot = 0; // degrees: 0, 90, 180, 270
let camZoom = 1.0;
let camPanX = 0;
let camPanY = 0;

function buildGeometry(cols, rows, heights, palette) {
  const positions = [];
  const normals = [];
  const colors = [];
  
  // Default height-based palette fallback
  const defaultPalette = [
    [0.35, 0.55, 0.25], // h=0 grass
    [0.45, 0.65, 0.30], // h=1
    [0.55, 0.75, 0.35], // h=2
    [0.65, 0.85, 0.40], // h=3
    [0.80, 0.90, 0.50]  // h=4 peak
  ];

  for (let z = 0; z < rows; z++) {
    for (let x = 0; x < cols; x++) {
      const idx = z * cols + x;
      let h = heights[idx];
      let type = 0;
      
      // Support both flat numbers and objects {h, type}
      if (typeof h === 'object') {
        h = h.h ?? 0;
        type = h.type ?? 0;
      }
      h = Math.max(0, Math.min(4, Number(h)));
      
      const baseColor = palette ? (palette[type] || defaultPalette[h]) : defaultPalette[h];
      const sideColor = [baseColor[0]*0.7, baseColor[1]*0.7, baseColor[2]*0.7];
      
      // Center the grid around world origin
      const ox = x - (cols - 1) / 2;
      const oz = z - (rows - 1) / 2;
      const hs = 0.5;

      function addQuad(v0, v1, v2, v3, n, c) {
        positions.push(...v0, ...v1, ...v2, ...v0, ...v2, ...v3);
        for(let i=0; i<6; i++) normals.push(...n);
        for(let i=0; i<6; i++) colors.push(...c);
      }

      // Top face (always drawn)
      addQuad(
        [ox-hs, h, oz-hs], [ox+hs, h, oz-hs], [ox+hs, h, oz+hs], [ox-hs, h, oz+hs],
        [0, 1, 0], baseColor
      );

      // Side walls (only if elevated)
      if (h > 0) {
        // Front (z+)
        addQuad(
          [ox-hs, 0, oz+hs], [ox+hs, 0, oz+hs], [ox+hs, h, oz+hs], [ox-hs, h, oz+hs],
          [0, 0, 1], sideColor
        );
        // Back (z-)
        addQuad(
          [ox+hs, 0, oz-hs], [ox-hs, 0, oz-hs], [ox-hs, h, oz-hs], [ox+hs, h, oz-hs],
          [0, 0, -1], sideColor
        );
        // Right (x+)
        addQuad(
          [ox+hs, 0, oz+hs], [ox+hs, 0, oz-hs], [ox+hs, h, oz-hs], [ox+hs, h, oz+hs],
          [1, 0, 0], sideColor
        );
        // Left (x-)
        addQuad(
          [ox-hs, 0, oz-hs], [ox-hs, 0, oz+hs], [ox-hs, h, oz+hs], [ox-hs, h, oz-hs],
          [-1, 0, 0], sideColor
        );
      }
    }
  }
  
  return { 
    positions: new Float32Array(positions), 
    normals: new Float32Array(normals), 
    colors: new Float32Array(colors) 
  };
}

export function rotate(step) {
  camRot = (camRot + step * 90 + 360) % 360;
}

export function setZoom(z) {
  camZoom = Math.max(0.2, Math.min(5.0, z));
}

export function setPan(x, y) {
  camPanX = x;
  camPanY = y;
}

export function getCamState() {
  return { rot: camRot, zoom: camZoom, panX: camPanX, panY: camPanY };
}

export function setMap(cols, rows, heights, palette) {
  if (!glCtx || !vaoHandle) return;
  
  const geo = buildGeometry(cols, rows, heights, palette);
  
  glCtx.bindBuffer(glCtx.ARRAY_BUFFER, posBufHandle);
  glCtx.bufferData(glCtx.ARRAY_BUFFER, geo.positions, glCtx.DYNAMIC_DRAW);
  
  glCtx.bindBuffer(glCtx.ARRAY_BUFFER, normBufHandle);
  glCtx.bufferData(glCtx.ARRAY_BUFFER, geo.normals, glCtx.DYNAMIC_DRAW);
  
  glCtx.bindBuffer(glCtx.ARRAY_BUFFER, colBufHandle);
  glCtx.bufferData(glCtx.ARRAY_BUFFER, geo.colors, glCtx.DYNAMIC_DRAW);
  
  vertexCount = geo.positions.length / 3;
}

export function init(canvasEl) {
  canvasRef = canvasEl;
  glCtx = canvasEl.getContext('webgl2', { antialias: true, alpha: false });
  if (!glCtx) throw new Error('WebGL2 not supported');

  const vsSource = `#version 300 es
    in vec3 aPos;
    in vec3 aNormal;
    in vec3 aColor;
    uniform mat4 uProj;
    out vec3 vColor;
    out vec3 vNormal;
    void main() {
      gl_Position = uProj * vec4(aPos, 1.0);
      vColor = aColor;
      vNormal = aNormal;
    }`;

  const fsSource = `#version 300 es
    precision mediump float;
    in vec3 vColor;
    in vec3 vNormal;
    out vec4 fragColor;
    void main() {
      // Simple directional light to emphasize elevation
      vec3 lightDir = normalize(vec3(1.0, 1.0, 0.5));
      float diff = max(dot(vNormal, lightDir), 0.25);
      fragColor = vec4(vColor * diff, 1.0);
    }`;

  function compileShader(src, type) {
    const s = glCtx.createShader(type);
    glCtx.shaderSource(s, src);
    glCtx.compileShader(s);
    if (!glCtx.getShaderParameter(s, glCtx.COMPILE_STATUS)) {
      console.error(glCtx.getShaderInfoLog(s));
      glCtx.deleteShader(s);
      return null;
    }
    return s;
  }

  const vs = compileShader(vsSource, glCtx.VERTEX_SHADER);
  const fs = compileShader(fsSource, glCtx.FRAGMENT_SHADER);
  progObj = glCtx.createProgram();
  glCtx.attachShader(progObj, vs);
  glCtx.attachShader(progObj, fs);
  glCtx.linkProgram(progObj);
  if (!glCtx.getProgramParameter(progObj, glCtx.LINK_STATUS)) {
    console.error(glCtx.getProgramInfoLog(progObj));
  }

  const aPosLoc = glCtx.getAttribLocation(progObj, 'aPos');
  const aNormalLoc = glCtx.getAttribLocation(progObj, 'aNormal');
  const aColorLoc = glCtx.getAttribLocation(progObj, 'aColor');
  const uProjLoc = glCtx.getUniformLocation(progObj, 'uProj');

  vaoHandle = glCtx.createVertexArray();
  glCtx.bindVertexArray(vaoHandle);

  posBufHandle = glCtx.createBuffer();
  glCtx.bindBuffer(glCtx.ARRAY_BUFFER, posBufHandle);
  glCtx.enableVertexAttribArray(aPosLoc);
  glCtx.vertexAttribPointer(aPosLoc, 3, glCtx.FLOAT, false, 0, 0);

  normBufHandle = glCtx.createBuffer();
  glCtx.bindBuffer(glCtx.ARRAY_BUFFER, normBufHandle);
  glCtx.enableVertexAttribArray(aNormalLoc);
  glCtx.vertexAttribPointer(aNormalLoc, 3, glCtx.FLOAT, false, 0, 0);

  colBufHandle = glCtx.createBuffer();
  glCtx.bindBuffer(glCtx.ARRAY_BUFFER, colBufHandle);
  glCtx.enableVertexAttribArray(aColorLoc);
  glCtx.vertexAttribPointer(aColorLoc, 3, glCtx.FLOAT, false, 0, 0);

  function getOrthoMatrix() {
    const aspect = canvasEl.clientWidth / canvasEl.clientHeight || 1;
    const halfH = 50 * camZoom;
    const halfW = halfH * aspect;

    // Orthographic projection
    const proj = new Float32Array([
      1.0 / halfW, 0, 0, 0,
      0, 1.0 / halfH, 0, 0,
      0, 0, -1.0 / 50.0, 0,
      0, 0, 0, 1.0
    ]);

    // View matrix: rotate around Y axis, then translate (pan)
    const rad = camRot * Math.PI / 180;
    const cosR = Math.cos(rad);
    const sinR = Math.sin(rad);

    const rotY = new Float32Array([
      cosR, 0, -sinR, 0,
      0,    1, 0,     0,
      sinR, 0, cosR,  0,
      0,    0, 0,     1
    ]);

    const trans = new Float32Array([
      1, 0, 0, camPanX,
      0, 1, 0, camPanY,
      0, 0, 1, 0,
      0, 0, 0, 1
    ]);

    // Matrix multiplication helper (column-major compatible)
    function mulMat4(a, b) {
      const r = new Float32Array(16);
      for(let i=0; i<4; i++) {
        for(let j=0; j<4; j++) {
          let sum = 0;
          for(let k=0; k<4; k++) sum += a[i*4+k] * b[k*4+j];
          r[i*4+j] = sum;
        }
      }
      return r;
    }

    return mulMat4(proj, mulMat4(rotY, trans));
  }

  glCtx.useProgram(progObj);
  glCtx.uniformMatrix4fv(uProjLoc, false, getOrthoMatrix());

  glCtx.clearColor(0.08, 0.1, 0.15, 1.0);
  glCtx.enable(glCtx.DEPTH_TEST);

  function drawFrame() {
    if (canvasRef.clientWidth > 0 && canvasRef.clientHeight > 0) {
      glCtx.viewport(0, 0, canvasRef.clientWidth, canvasRef.clientHeight);
      glCtx.clear(glCtx.COLOR_BUFFER_BIT | glCtx.DEPTH_BUFFER_BIT);
      glCtx.uniformMatrix4fv(uProjLoc, false, getOrthoMatrix());
      
      if (vertexCount > 0) {
        glCtx.bindVertexArray(vaoHandle);
        glCtx.drawArrays(glCtx.TRIANGLES, 0, vertexCount);
      }
    }
    requestAnimationFrame(drawFrame);
  }

  drawFrame();

  return { gl: glCtx, prog: progObj, uProjLoc, getOrthoMatrix };
}
