// Destructure mat4 from glMatrix at the top of the file
const { mat4 } = window.glMatrix || glMatrix;

let glCtx = null;
let progObj = null;
let pickedTile = null;
let currentPalette = null;
let vaoHandle = null;
let posBufHandle = null;
let normBufHandle = null;
let colBufHandle = null;
let vertexCount = 0;
let canvasRef = null;

// Map state for token placement
let mapCols = 0;
let mapRows = 0;
let mapHeights = [];

// Token buffers
let tokenVAOHandle = null;
let tokenPosBufHandle = null;
let tokenNormBufHandle = null;
let tokenColBufHandle = null;
let tokenVertexCount = 0;

// Camera state
let camRot = 45; // degrees: 45 (looking right at center of grid)
let camZoom = 1.0;
let camPanX = 0;
let camPanY = 0;

// Map size for camera scaling
let mapSizeForCamera = 10; // default fallback

// Shader uniform locations
let uProjLoc = null;
let uViewPosLoc = null;
let uLightDirLoc = null;

// Phase 2 terrain types
const TERRAIN_TYPES = [
  [0.35, 0.55, 0.25], // sand
  [0.45, 0.65, 0.30], // grass
  [0.40, 0.40, 0.80], // water
  [0.55, 0.45, 0.20], // mud
  [0.60, 0.50, 0.30], // dirt
  [0.70, 0.30, 0.30]  // brick
];

// Current tool state
let currentTool = 'raise';
let currentTerrainType = 0;

export function gridToWorld(col, row, cols, rows, height = 0) {
  const x = col - (cols - 1) / 2;
  const z = row - (rows - 1) / 2;
  return { x, y: height, z };
}

export function worldToGrid(x, z, cols, rows) {
  let col = Math.round(x + (cols - 1) / 2);
  let row = Math.round(z + (rows - 1) / 2);
  if (col >= 0 && col < cols && row >= 0 && row < rows) {
    return { col, row };
  }
  return null;
}

export function getCameraMatrix(camRot, camZoom, camPanX, camPanY, aspect) {
  const projection = mat4.create();
  const view = mat4.create();
  const result = mat4.create();

  // 1. Orthographic bounds scaled by aspect ratio and zoom
  const size = 10.0 / (camZoom || 1.0);
  mat4.ortho(projection, -size * aspect, size * aspect, -size, size, 0.1, 1000.0);

  // 2. Calculate true isometric eye position (35.264 pitch, rotation, and translation panning)
  const distance = 50.0;
  const pitch = 0.6154; // 35.264 degrees in radians
  
  const eye = [
    camPanX + distance * Math.cos(pitch) * Math.sin(camRot),
    distance * Math.sin(pitch),
    camPanY + distance * Math.cos(pitch) * Math.cos(camRot)
  ];
  const target = [camPanX, 0, camPanY];
  const up = [0, 1, 0];

  mat4.lookAt(view, eye, target, up);

  // 3. Multiply cleanly
  mat4.multiply(result, projection, view);
  return result;
}

function buildGeometry(cols, rows, heights, palette) {
  const positions = [];
  const normals = [];
  const colors = [];
  
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
      h = Math.max(0, Math.min(5, Number(h))); // Allow 0-5 terrain types
      
      let baseColor = palette ? (palette[type] || TERRAIN_TYPES[h]) : TERRAIN_TYPES[h];
      
      // Check if this tile is the hovered/picked tile
      const isPicked = pickedTile && x === pickedTile.col && z === pickedTile.row;
      let finalColor = baseColor;
      
      // Apply tool-specific visual effects
      if (isPicked) {
        switch(currentTool) {
          case 'raise':
            // Bright yellow tint for raise tool
            finalColor = [1.0, 1.0, 0.0];
            break;
          case 'lower':
            // Bright purple/blue tint for lower tool
            finalColor = [0.5, 0.0, 1.0];
            break;
          case 'paint':
            // Use selected terrain type color for paint tool
            if (palette && palette[currentTerrainType]) {
              finalColor = palette[currentTerrainType];
            } else {
              finalColor = TERRAIN_TYPES[currentTerrainType] || [0.5, 0.5, 0.5];
            }
            break;
        }
      }
      
      // Override with hover highlight if applicable
      if (window.hoveredCol !== undefined && window.hoveredRow !== undefined) {
        if (x === window.hoveredCol && z === window.hoveredRow) {
          finalColor = [1.0, 1.0, 0.0]; // Bright yellow for hover highlight
        }
      }
      
      const sideColor = [finalColor[0]*0.7, finalColor[1]*0.7, finalColor[2]*0.7];
      
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
        [ox-hs, h * 0.5, oz-hs], [ox+hs, h * 0.5, oz-hs], [ox+hs, h * 0.5, oz+hs], [ox-hs, h * 0.5, oz+hs],
        [0, 1, 0], finalColor
      );

      // Side walls (only if elevated)
      if (h > 0) {
        // Front (z+)
        addQuad(
          [ox-hs, 0, oz+hs], [ox+hs, 0, oz+hs], [ox+hs, h * 0.5, oz+hs], [ox-hs, h * 0.5, oz+hs],
          [0, 0, 1], sideColor
        );
        // Back (z-)
        addQuad(
          [ox+hs, 0, oz-hs], [ox-hs, 0, oz-hs], [ox-hs, h * 0.5, oz-hs], [ox+hs, h * 0.5, oz-hs],
          [0, 0, -1], sideColor
        );
        // Right (x+)
        addQuad(
          [ox+hs, 0, oz+hs], [ox+hs, 0, oz-hs], [ox+hs, h * 0.5, oz-hs], [ox+hs, h * 0.5, oz+hs],
          [1, 0, 0], sideColor
        );
        // Left (x-)
        addQuad(
          [ox-hs, 0, oz-hs], [ox-hs, 0, oz+hs], [ox-hs, h * 0.5, oz+hs], [ox-hs, h * 0.5, oz-hs],
          [-1, 0, 0], sideColor
        );
      }

      // Add tool-specific indicators for hovered tile
      if (isPicked) {
        const indicatorSize = 0.2;
        const indicatorHeight = h * 0.5 + 0.05; // Slightly above the top face
        
        switch(currentTool) {
          case 'raise':
            // Add upward chevron indicator on top face
            addQuad(
              [ox-hs+indicatorSize, indicatorHeight, oz-hs+indicatorSize], 
              [ox+hs-indicatorSize, indicatorHeight, oz-hs+indicatorSize], 
              [ox+hs-indicatorSize, indicatorHeight, oz+hs-indicatorSize], 
              [ox-hs+indicatorSize, indicatorHeight, oz+hs-indicatorSize],
              [0, 1, 0], [1.0, 1.0, 0.0] // Yellow chevron
            );
            break;
          case 'lower':
            // Add downward chevron indicator on top face
            addQuad(
              [ox-hs+indicatorSize, indicatorHeight, oz-hs+indicatorSize], 
              [ox+hs-indicatorSize, indicatorHeight, oz-hs+indicatorSize], 
              [ox+hs-indicatorSize, indicatorHeight, oz+hs-indicatorSize], 
              [ox-hs+indicatorSize, indicatorHeight, oz+hs-indicatorSize],
              [0, 1, 0], [0.5, 0.0, 1.0] // Purple chevron
            );
            break;
          case 'paint':
            // For paint tool, we already use the terrain color for the tile
            // No additional indicator needed
            break;
        }
      }
    }
  }
  
  return { 
    positions: new Float32Array(positions), 
    normals: new Float32Array(normals), 
    colors: new Float32Array(colors) 
  };
}

function buildTokenGeometry(tokens, cols, rows, heights) {
  const positions = [];
  const normals = [];
  const colors = [];
  
  function addQuad(v0, v1, v2, v3, n, c) {
    positions.push(...v0, ...v1, ...v2, ...v0, ...v2, ...v3);
    for(let i=0; i<6; i++) normals.push(...n);
    for(let i=0; i<6; i++) colors.push(...c);
  }

  const tSize = 0.2; // token box half-size
  
  for (const tok of tokens) {
    let tx = Math.floor(tok.x);
    let tz = Math.floor(tok.z);
    if (tx < 0 || tx >= cols || tz < 0 || tz >= rows) continue;
    
    const idx = tz * cols + tx;
    let h = heights[idx];
    if (typeof h === 'object') h = h.h ?? 0;
    h = Math.max(0, Math.min(5, Number(h)));
    
    const cx = tx - (cols - 1) / 2;
    const cz = tz - (rows - 1) / 2;
    const cy = h * 0.5 + tSize + 0.1; // sit on top of tile
    
    const [r, g, b] = tok.color || [1, 0, 0];
    
    // Top face
    addQuad([cx-tSize, cy+tSize, cz-tSize], [cx+tSize, cy+tSize, cz-tSize], 
            [cx+tSize, cy+tSize, cz+tSize], [cx-tSize, cy+tSize, cz+tSize], 
            [0,1,0], [r,g,b]);
    // Bottom face
    addQuad([cx-tSize, cy-tSize, cz+tSize], [cx+tSize, cy-tSize, cz+tSize], 
            [cx+tSize, cy-tSize, cz-tSize], [cx-tSize, cy-tSize, cz-tSize], 
            [0,-1,0], [r*0.7, g*0.7, b*0.7]);
    // Front (z+)
    addQuad([cx-tSize, cy-tSize, cz+tSize], [cx+tSize, cy-tSize, cz+tSize], 
            [cx+tSize, cy+tSize, cz+tSize], [cx-tSize, cy+tSize, cz+tSize], 
            [0,0,1], [r*0.85, g*0.85, b*0.85]);
    // Back (z-)
    addQuad([cx+tSize, cy-tSize, cz-tSize], [cx-tSize, cy-tSize, cz-tSize], 
            [cx-tSize, cy+tSize, cz-tSize], [cx+tSize, cy+tSize, cz-tSize], 
            [0,0,-1], [r*0.85, g*0.85, b*0.85]);
    // Right (x+)
    addQuad([cx+tSize, cy-tSize, cz+tSize], [cx+tSize, cy-tSize, cz-tSize], 
            [cx+tSize, cy+tSize, cz-tSize], [cx+tSize, cy+tSize, cz+tSize], 
            [1,0,0], [r*0.95, g*0.95, b*0.95]);
    // Left (x-)
    addQuad([cx-tSize, cy-tSize, cz-tSize], [cx-tSize, cy-tSize, cz+tSize], 
            [cx-tSize, cy+tSize, cz+tSize], [cx-tSize, cy+tSize, cz-tSize], 
            [-1,0,0], [r*0.95, g*0.95, b*0.95]);
  }
  
  return { positions: new Float32Array(positions), normals: new Float32Array(normals), colors: new Float32Array(colors) };
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

export function setTokens(tokens) {
  if (!glCtx || !tokenVAOHandle || !mapHeights.length) return;
  
  const geo = buildTokenGeometry(tokens, mapCols, mapRows, mapHeights);
  
  glCtx.bindBuffer(glCtx.ARRAY_BUFFER, tokenPosBufHandle);
  glCtx.bufferData(glCtx.ARRAY_BUFFER, geo.positions, glCtx.DYNAMIC_DRAW);
  
  glCtx.bindBuffer(glCtx.ARRAY_BUFFER, tokenNormBufHandle);
  glCtx.bufferData(glCtx.ARRAY_BUFFER, geo.normals, glCtx.DYNAMIC_DRAW);
  
  glCtx.bindBuffer(glCtx.ARRAY_BUFFER, tokenColBufHandle);
  glCtx.bufferData(glCtx.ARRAY_BUFFER, geo.colors, glCtx.DYNAMIC_DRAW);
  
  tokenVertexCount = geo.positions.length / 3;
  
  // Debug: log token info
  console.log('Set tokens. Token vertex count:', tokenVertexCount);
}

export function setMap(cols, rows, heights, palette) {
  if (!glCtx || !vaoHandle) return;
  
  mapCols = cols;
  mapRows = rows;
  mapHeights = heights.slice();
  currentPalette = palette;
  
  // Update map size for camera scaling
  mapSizeForCamera = Math.max(cols, rows);
  
  const geo = buildGeometry(cols, rows, heights, palette);
  
  glCtx.bindBuffer(glCtx.ARRAY_BUFFER, posBufHandle);
  glCtx.bufferData(glCtx.ARRAY_BUFFER, geo.positions, glCtx.DYNAMIC_DRAW);
  
  glCtx.bindBuffer(glCtx.ARRAY_BUFFER, normBufHandle);
  glCtx.bufferData(glCtx.ARRAY_BUFFER, geo.normals, glCtx.DYNAMIC_DRAW);
  
  glCtx.bindBuffer(glCtx.ARRAY_BUFFER, colBufHandle);
  glCtx.bufferData(glCtx.ARRAY_BUFFER, geo.colors, glCtx.DYNAMIC_DRAW);
  
  vertexCount = geo.positions.length / 3;
  
  // Debug: log geometry info
  console.log('Set map with', cols, 'x', rows, 'tiles. Vertex count:', vertexCount);
}

export function selectTile(c, r) {
  pickedTile = (c === pickedTile?.col && r === pickedTile?.row) ? null : { col: c, row: r };
  if (glCtx && vaoHandle) {
    setMap(mapCols, mapRows, mapHeights, currentPalette);
  }
}

export function pickTile(screenX, screenY) {
  if (!canvasRef || !mapHeights.length) return null;
  
  const w = canvasRef.clientWidth;
  const h = canvasRef.clientHeight;
  const nx = (screenX / w) * 2 - 1;
  const ny = 1 - (screenY / h) * 2;
  
  const rad = camRot * Math.PI / 180;
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  const halfSize = 15 * camZoom; // Adjusted for better fit
  
  function unproject(nz) {
    return [
      c * halfSize * nx - s * halfSize * nz - camPanX,
      halfSize * ny - camPanY,
      -s * halfSize * nx - c * halfSize * nz
    ];
  }
  
  const p1 = unproject(-0.5);
  const p2 = unproject(0.5);
  const dx = p2[0] - p1[0];
  const dy = p2[1] - p1[1];
  const dz = p2[2] - p1[2];
  
  let closestT = Infinity;
  let hitCol = -1, hitRow = -1;
  
  for (let r = 0; r < mapRows; r++) {
    for (let col = 0; col < mapCols; col++) {
      const idx = r * mapCols + col;
      let hVal = mapHeights[idx];
      if (typeof hVal === 'object') hVal = hVal.h ?? 0;
      hVal = Math.max(0, Math.min(5, Number(hVal)));
      
      const ox = col - (mapCols - 1) / 2;
      const oz = r - (mapRows - 1) / 2;
      
      const xMin = ox - 0.5, xMax = ox + 0.5;
      const yMin = 0, yMax = hVal * 0.5;
      const zMin = oz - 0.5, zMax = oz + 0.5;
      
      let tEnter = -Infinity, tExit = Infinity;
      
      const checkSlab = (p, d, min, max) => {
        if (Math.abs(d) < 1e-6) return (p >= min && p <= max);
        let t1 = (min - p) / d, t2 = (max - p) / d;
        if (t1 > t2) [t1, t2] = [t2, t1];
        tEnter = Math.max(tEnter, t1);
        tExit = Math.min(tExit, t2);
        return true;
      };
      
      // Use a more precise intersection test to avoid lag
      if (!checkSlab(p1[0], dx, xMin, xMax)) continue;
      if (!checkSlab(p1[1], dy, yMin, yMax)) continue;
      if (!checkSlab(p1[2], dz, zMin, zMax)) continue;
      
      if (tExit > 0 && tEnter < tExit) {
        let t = tEnter > 0 ? tEnter : 0;
        if (t < closestT) {
          closestT = t;
          hitCol = col;
          hitRow = r;
        }
      }
    }
  }
  
  // Store hovered tile globally
  window.hoveredCol = hitCol >= 0 ? hitCol : null;
  window.hoveredRow = hitRow >= 0 ? hitRow : null;
  
  return (hitCol >= 0) ? { col: hitCol, row: hitRow } : null;
}

export function updateTile(col, row, toolMode, terrainType) {
  if (col < 0 || col >= mapCols || row < 0 || row >= mapRows) return;
  const idx = row * mapCols + col;
  
  if (toolMode === 'raise') {
    mapHeights[idx] = (mapHeights[idx] || 0) + 1;
  } else if (toolMode === 'lower') {
    mapHeights[idx] = Math.max(0, (mapHeights[idx] || 0) - 1);
  } else if (toolMode === 'paint') {
    // If your code supports a mapTypes array or metadata object for terrainType (grass, sand, water, building, brick, mud), set it here.
  }
  
  // Force a full geometry rebuild and redraw immediately
  const currentPalette = [ [0.2, 0.6, 0.2], [0.7, 0.6, 0.4], [0.2, 0.4, 0.8], [0.4, 0.3, 0.2] ];
  setMap(mapCols, mapRows, mapHeights, currentPalette);
}

export function setCurrentTool(tool) {
  currentTool = tool;
}

export function setCurrentTerrainType(type) {
  currentTerrainType = type;
}

function syncCanvasSize(canvasEl) {
  // The canvas's actual drawing-buffer resolution (width/height attributes)
  // defaults to 300x150 and is independent of its CSS display size
  // (clientWidth/clientHeight). viewport() and the projection aspect ratio
  // both need to match the REAL buffer size, or geometry gets projected for
  // a viewport far larger than what actually exists and never appears.
  const w = canvasEl.clientWidth, h = canvasEl.clientHeight;
  if (canvasEl.width !== w || canvasEl.height !== h) {
    canvasEl.width = w;
    canvasEl.height = h;
  }
}

function initShaders() {
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
    uniform vec3 uViewPos;
    uniform vec3 uLightDir;
    void main() {
      // Simple directional light to emphasize elevation
      vec3 lightDir = normalize(uLightDir);
      float diff = max(dot(vNormal, lightDir), 0.2);
      // Add some ambient lighting for better visibility (increased from 0.2 to 0.4)
      float ambient = 0.4;
      float intensity = ambient + diff * (1.0 - ambient);
      fragColor = vec4(vColor * intensity, 1.0);
    }`;

  function compileShader(src, type) {
    const s = glCtx.createShader(type);
    glCtx.shaderSource(s, src);
    glCtx.compileShader(s);
    if (!glCtx.getShaderParameter(s, glCtx.COMPILE_STATUS)) {
      console.error('Shader compilation error:', glCtx.getShaderInfoLog(s));
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
    console.error('Program link error:', glCtx.getProgramInfoLog(progObj));
    throw new Error('Failed to link shader program');
  }

  const aPosLoc = glCtx.getAttribLocation(progObj, 'aPos');
  const aNormalLoc = glCtx.getAttribLocation(progObj, 'aNormal');
  const aColorLoc = glCtx.getAttribLocation(progObj, 'aColor');
  uProjLoc = glCtx.getUniformLocation(progObj, 'uProj');
  uViewPosLoc = glCtx.getUniformLocation(progObj, 'uViewPos');
  uLightDirLoc = glCtx.getUniformLocation(progObj, 'uLightDir');

  // Check if attribute locations are valid
  if (aPosLoc < 0 || aNormalLoc < 0 || aColorLoc < 0) {
    console.error('Attribute location error:', { aPosLoc, aNormalLoc, aColorLoc });
    throw new Error('Failed to get attribute locations');
  }

  // Check if uniform locations are valid
  if (uProjLoc < 0) {
    console.error('Uniform location error:', uProjLoc);
    throw new Error('Failed to get uniform location');
  }
  
  if (uViewPosLoc < 0) {
    console.error('Uniform location error:', uViewPosLoc);
    throw new Error('Failed to get uniform location');
  }
  
  if (uLightDirLoc < 0) {
    console.error('Uniform location error:', uLightDirLoc);
    throw new Error('Failed to get uniform location');
  }

  return { aPosLoc, aNormalLoc, aColorLoc };
}

function draw() {
  if (!glCtx || !vaoHandle) return;
  
  glCtx.viewport(0, 0, canvasRef.clientWidth, canvasRef.clientHeight);
  glCtx.clear(glCtx.COLOR_BUFFER_BIT | glCtx.DEPTH_BUFFER_BIT);
  
  // Set up the projection matrix
  const aspect = canvasRef.clientWidth / canvasRef.clientHeight;
  
  // Ensure we have valid numeric values for aspect ratio
  const safeAspect = isNaN(aspect) || aspect <= 0 ? 1.0 : aspect;
  
  const camMatrix = getCameraMatrix(camRot, camZoom, camPanX, camPanY, safeAspect);
  
  // Set up view position and light direction uniforms
  const viewPos = [0.0, 25.0, 0.0];
  const lightDir = [1.0, 1.0, 0.5];
  
  glCtx.uniformMatrix4fv(uProjLoc, false, camMatrix);
  glCtx.uniform3fv(uViewPosLoc, viewPos);
  glCtx.uniform3fv(uLightDirLoc, lightDir);

  if (vertexCount > 0) {
    glCtx.bindVertexArray(vaoHandle);
    glCtx.drawArrays(glCtx.TRIANGLES, 0, vertexCount);
  }

  if (tokenVertexCount > 0) {
    glCtx.bindVertexArray(tokenVAOHandle);
    glCtx.drawArrays(glCtx.TRIANGLES, 0, tokenVertexCount);
  }
}

export function init(canvasEl) {
  canvasRef = canvasEl;
  syncCanvasSize(canvasEl);
  glCtx = canvasEl.getContext('webgl2', { antialias: true, alpha: false });
  if (!glCtx) throw new Error('WebGL2 not supported');

  // Initialize shaders
  const { aPosLoc, aNormalLoc, aColorLoc } = initShaders();

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

  // Token buffers setup
  tokenVAOHandle = glCtx.createVertexArray();
  glCtx.bindVertexArray(tokenVAOHandle);

  tokenPosBufHandle = glCtx.createBuffer();
  glCtx.bindBuffer(glCtx.ARRAY_BUFFER, tokenPosBufHandle);
  glCtx.enableVertexAttribArray(aPosLoc);
  glCtx.vertexAttribPointer(aPosLoc, 3, glCtx.FLOAT, false, 0, 0);

  tokenNormBufHandle = glCtx.createBuffer();
  glCtx.bindBuffer(glCtx.ARRAY_BUFFER, tokenNormBufHandle);
  glCtx.enableVertexAttribArray(aNormalLoc);
  glCtx.vertexAttribPointer(aNormalLoc, 3, glCtx.FLOAT, false, 0, 0);

  tokenColBufHandle = glCtx.createBuffer();
  glCtx.bindBuffer(glCtx.ARRAY_BUFFER, tokenColBufHandle);
  glCtx.enableVertexAttribArray(aColorLoc);
  glCtx.vertexAttribPointer(aColorLoc, 3, glCtx.FLOAT, false, 0, 0);

  // Bind back to map VAO for initial setup
  glCtx.bindVertexArray(vaoHandle);

  // Ensure we're properly set up by binding all buffers once
  glCtx.bindBuffer(glCtx.ARRAY_BUFFER, posBufHandle);
  glCtx.bindBuffer(glCtx.ARRAY_BUFFER, normBufHandle);
  glCtx.bindBuffer(glCtx.ARRAY_BUFFER, colBufHandle);

  glCtx.useProgram(progObj);
  
  // Set initial projection matrix
  const aspect = canvasRef.clientWidth / canvasRef.clientHeight;
  const camMatrix = getCameraMatrix(camRot, camZoom, camPanX, camPanY, aspect);
  glCtx.uniformMatrix4fv(uProjLoc, false, camMatrix);

  glCtx.clearColor(0.08, 0.1, 0.15, 1.0);
  glCtx.enable(glCtx.DEPTH_TEST);

  let frameNum = 0;
  function drawFrame() {
    if (canvasRef.clientWidth > 0 && canvasRef.clientHeight > 0) {
      syncCanvasSize(canvasRef);
      draw();
    }

    // Log debug info on frame 30
    if (frameNum === 30) {
      const camMatrix = getCameraMatrix(camRot, camZoom, camPanX, camPanY, aspect);
      console.log('Debug values on frame 30:');
      console.log('  mapSizeForCamera:', mapSizeForCamera);
      console.log('  vertexCount:', vertexCount);
      console.log('  tokenVertexCount:', tokenVertexCount);
      console.log('  camera matrix (first 4 values):',
        camMatrix[0].toFixed(3), camMatrix[1].toFixed(3),
        camMatrix[2].toFixed(3), camMatrix[3].toFixed(3));
    }

    frameNum++;
    requestAnimationFrame(drawFrame);
  }

  // Force an initial draw to make sure everything is set up
  drawFrame();

  return { gl: glCtx, prog: progObj };
}
