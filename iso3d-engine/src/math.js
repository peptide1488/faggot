/**
 * Minimal mat4 / vec3 math for WebGL2 isometric rendering.
 * Column-major Float32Arrays, no external dependencies.
 */

export function createMat4() {
  return new Float32Array([
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1,
  ]);
}

export function identity(out) {
  out[0] = 1; out[1] = 0; out[2] = 0; out[3] = 0;
  out[4] = 0; out[5] = 1; out[6] = 0; out[7] = 0;
  out[8] = 0; out[9] = 0; out[10] = 1; out[11] = 0;
  out[12] = 0; out[13] = 0; out[14] = 0; out[15] = 1;
  return out;
}

/** out = a * b (column-major) */
export function multiply(out, a, b) {
  const a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3];
  const a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7];
  const a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11];
  const a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];

  let b0 = b[0], b1 = b[1], b2 = b[2], b3 = b[3];
  out[0] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
  out[1] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
  out[2] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
  out[3] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;

  b0 = b[4]; b1 = b[5]; b2 = b[6]; b3 = b[7];
  out[4] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
  out[5] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
  out[6] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
  out[7] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;

  b0 = b[8]; b1 = b[9]; b2 = b[10]; b3 = b[11];
  out[8] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
  out[9] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
  out[10] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
  out[11] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;

  b0 = b[12]; b1 = b[13]; b2 = b[14]; b3 = b[15];
  out[12] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
  out[13] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
  out[14] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
  out[15] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;
  return out;
}

export function ortho(out, left, right, bottom, top, near, far) {
  const lr = 1 / (left - right);
  const bt = 1 / (bottom - top);
  const nf = 1 / (near - far);
  out[0] = -2 * lr; out[1] = 0; out[2] = 0; out[3] = 0;
  out[4] = 0; out[5] = -2 * bt; out[6] = 0; out[7] = 0;
  out[8] = 0; out[9] = 0; out[10] = 2 * nf; out[11] = 0;
  out[12] = (left + right) * lr;
  out[13] = (top + bottom) * bt;
  out[14] = (far + near) * nf;
  out[15] = 1;
  return out;
}

export function lookAt(out, eye, center, up) {
  let zx = eye[0] - center[0];
  let zy = eye[1] - center[1];
  let zz = eye[2] - center[2];
  let len = Math.hypot(zx, zy, zz);
  if (len === 0) {
    zx = 0; zy = 0; zz = 1;
  } else {
    zx /= len; zy /= len; zz /= len;
  }

  let xx = up[1] * zz - up[2] * zy;
  let xy = up[2] * zx - up[0] * zz;
  let xz = up[0] * zy - up[1] * zx;
  len = Math.hypot(xx, xy, xz);
  if (len === 0) {
    xx = 0; xy = 0; xz = 0;
  } else {
    xx /= len; xy /= len; xz /= len;
  }

  const yx = zy * xz - zz * xy;
  const yy = zz * xx - zx * xz;
  const yz = zx * xy - zy * xx;

  out[0] = xx; out[1] = yx; out[2] = zx; out[3] = 0;
  out[4] = xy; out[5] = yy; out[6] = zy; out[7] = 0;
  out[8] = xz; out[9] = yz; out[10] = zz; out[11] = 0;
  out[12] = -(xx * eye[0] + xy * eye[1] + xz * eye[2]);
  out[13] = -(yx * eye[0] + yy * eye[1] + yz * eye[2]);
  out[14] = -(zx * eye[0] + zy * eye[1] + zz * eye[2]);
  out[15] = 1;
  return out;
}

/** Invert a mat4. Returns null if singular. */
export function invert(out, a) {
  const a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3];
  const a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7];
  const a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11];
  const a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];

  const b00 = a00 * a11 - a01 * a10;
  const b01 = a00 * a12 - a02 * a10;
  const b02 = a00 * a13 - a03 * a10;
  const b03 = a01 * a12 - a02 * a11;
  const b04 = a01 * a13 - a03 * a11;
  const b05 = a02 * a13 - a03 * a12;
  const b06 = a20 * a31 - a21 * a30;
  const b07 = a20 * a32 - a22 * a30;
  const b08 = a20 * a33 - a23 * a30;
  const b09 = a21 * a32 - a22 * a31;
  const b10 = a21 * a33 - a23 * a31;
  const b11 = a22 * a33 - a23 * a32;

  let det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
  if (!det) return null;
  det = 1 / det;

  out[0] = (a11 * b11 - a12 * b10 + a13 * b09) * det;
  out[1] = (a02 * b10 - a01 * b11 - a03 * b09) * det;
  out[2] = (a31 * b05 - a32 * b04 + a33 * b03) * det;
  out[3] = (a22 * b04 - a21 * b05 - a23 * b03) * det;
  out[4] = (a12 * b08 - a10 * b11 - a13 * b07) * det;
  out[5] = (a00 * b11 - a02 * b08 + a03 * b07) * det;
  out[6] = (a32 * b02 - a30 * b05 - a33 * b01) * det;
  out[7] = (a20 * b05 - a22 * b02 + a23 * b01) * det;
  out[8] = (a10 * b10 - a11 * b08 + a13 * b06) * det;
  out[9] = (a01 * b08 - a00 * b10 - a03 * b06) * det;
  out[10] = (a30 * b04 - a31 * b02 + a33 * b00) * det;
  out[11] = (a21 * b02 - a20 * b04 - a23 * b00) * det;
  out[12] = (a11 * b07 - a10 * b09 - a12 * b06) * det;
  out[13] = (a00 * b09 - a01 * b07 + a02 * b06) * det;
  out[14] = (a31 * b01 - a30 * b03 - a32 * b00) * det;
  out[15] = (a20 * b03 - a21 * b01 + a22 * b00) * det;
  return out;
}

export function transformMat4(out, a, m) {
  const x = a[0], y = a[1], z = a[2];
  let w = m[3] * x + m[7] * y + m[11] * z + m[15];
  w = w || 1;
  out[0] = (m[0] * x + m[4] * y + m[8] * z + m[12]) / w;
  out[1] = (m[1] * x + m[5] * y + m[9] * z + m[13]) / w;
  out[2] = (m[2] * x + m[6] * y + m[10] * z + m[14]) / w;
  return out;
}

// --- Grid / camera helpers ---

/** True isometric pitch ≈ 35.264° */
export const ISO_PITCH = Math.atan(1 / Math.SQRT2);

/**
 * Build projection * view for an orthographic isometric camera.
 * camRot is yaw in radians. `pitch` (radians, default ISO_PITCH) lets a caller override the
 * camera's tilt — e.g. voxel.html's "top-down mode" passes something near PI/2 (straight down)
 * instead of the fixed isometric angle every other existing caller still gets by omitting it.
 *
 * opts (optional):
 *   elevMin / elevMax — world-Y range of scene content (voxel elevation). Defaults cover a
 *     typical strata+walls column. Used to aim the look-at mid-height and size the depth range
 *     so tall geometry doesn't clip when zoomed/pitched, without wasting precision below bedrock.
 *
 * Ortho framing is controlled ONLY by camZoom → size. Eye distance is free: we pick it so the
 * visible volume fits in a tight near/far band with a healthy far/near ratio (24-bit depth).
 * Earlier code used near≈2 with far hundreds when zoomed out, which crushed depth precision
 * (faces z-fight / "disappear") and still clipped near-side cliffs when zoomed in.
 */
export function getCameraMatrix(camRot, camZoom, camPanX, camPanY, aspect, out = createMat4(), pitch = ISO_PITCH, opts = {}) {
  const projection = createMat4();
  const view = createMat4();

  // Ortho half-height in world units. Zoom OUT → larger size → more of the map in frame.
  const size = 10 / Math.max(camZoom || 1, 1e-4);
  const asp = Math.max(aspect || 1, 1e-4);

  const elevMin = opts.elevMin != null ? opts.elevMin : 0;
  const elevMax = opts.elevMax != null ? opts.elevMax : 24;
  const elevMid = (elevMin + elevMax) * 0.5;
  // Half-span of elevations, plus a few blocks of pad for props/billboards above the top.
  const elevHalf = Math.max(6, (elevMax - elevMin) * 0.5 + 4);

  // Half-diagonal of the orthographic view rectangle (world units on the view plane).
  const viewHalfDiag = size * Math.hypot(asp, 1);
  // Map that view extent + elevation into a view-axis depth half-range. Under iso pitch both
  // horizontal offsets toward the camera and tall columns shrink/grow eye-depth; be generous
  // so near-side cliffs and top-down tall stacks never hit the clip planes.
  const cosP = Math.abs(Math.cos(pitch));
  const sinP = Math.abs(Math.sin(pitch));
  const depthHalf = viewHalfDiag * (0.85 + cosP * 0.75) + elevHalf * (0.6 + sinP * 0.9) + 6;

  // Eye distance is independent of framing under ortho. Choose it so
  //   far/near = (d+depthHalf)/(d-depthHalf) ≤ maxRatio
  // → d ≥ depthHalf * (maxRatio+1)/(maxRatio-1). 24-bit depth stays clean under ~50–100 ratio.
  const maxRatio = 36;
  const distForRatio = depthHalf * (maxRatio + 1) / (maxRatio - 1);
  const distance = Math.max(distForRatio, depthHalf * 1.4, 14);

  let near = distance - depthHalf;
  let far = distance + depthHalf;
  // Tiny floor only for numerical stability (NOT the old near=2 hammer that forced huge far).
  if (near < 0.2) {
    far += 0.2 - near;
    near = 0.2;
  }
  far = Math.max(near + 8, far);

  ortho(projection, -size * asp, size * asp, -size, size, near, far);

  // Aim at mid elevation so the depth budget isn't wasted under the world floor, and so
  // top-down pitch doesn't put high stacks between the eye and the near plane.
  const target = [camPanX, elevMid, camPanY];
  const eye = [
    camPanX + distance * Math.cos(pitch) * Math.sin(camRot),
    elevMid + distance * Math.sin(pitch),
    camPanY + distance * Math.cos(pitch) * Math.cos(camRot),
  ];
  // Straight down (or very close to it) makes the default up=[0,1,0] parallel to the eye->target
  // direction — a degenerate lookAt. Same fix already used elsewhere in this codebase for the
  // same reason (see voxel.html's computeLightMVP).
  const up = Math.cos(pitch) < 0.01 ? [0, 0, 1] : [0, 1, 0];

  lookAt(view, eye, target, up);
  multiply(out, projection, view);
  // Camera right/up in world space (from lookAt basis) — for depth-tested billboards
  const right = [view[0], view[4], view[8]];
  const camUp = [view[1], view[5], view[9]];
  return { matrix: out, eye, target, right, camUp, view, near, far, size, distance };
}

export function gridToWorld(col, row, cols, rows, height = 0) {
  return {
    x: col - (cols - 1) / 2,
    y: height * 0.5,
    z: row - (rows - 1) / 2,
  };
}

export function worldToGrid(x, z, cols, rows) {
  const col = Math.round(x + (cols - 1) / 2);
  const row = Math.round(z + (rows - 1) / 2);
  if (col < 0 || col >= cols || row < 0 || row >= rows) return null;
  return { col, row };
}

export function abilityMod(score) {
  return Math.floor((score - 10) / 2);
}

/** Deterministic-friendly d20; pass rng for tests. */
export function d20(rng = Math.random) {
  return 1 + Math.floor(rng() * 20);
}

export function rollDie(sides, rng = Math.random) {
  return 1 + Math.floor(rng() * sides);
}
