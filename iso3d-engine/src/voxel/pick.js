/**
 * Voxel raycasting — grid-space only (c=+x east, r=+y south, z=+z up, matching blocks.js).
 * The caller (renderer/host) is responsible for turning a mouse position into a grid-space
 * ray; this module never touches the DOM or WebGL, so it's testable with zero GL context.
 *
 * Amanatides & Woo DDA walks whole cells cheaply to find candidates in ray order; each
 * occupied candidate then gets a precise ray-vs-AABB test (full cube, or the half-height
 * box for a slab) so the returned face/point are exact, not just "which cell the DDA step
 * landed on".
 */

import { parseBlock, BLOCKS } from './blocks.js';

function sign(x) {
  return x > 0 ? 1 : x < 0 ? -1 : 0;
}

/** Standard ray-vs-AABB slab test. Returns { t, faceAxis, faceSign } or null. */
function rayAABB(origin, dir, boxMin, boxMax) {
  let tMin = -Infinity;
  let tMax = Infinity;
  let faceAxis = -1;
  let faceSign = 0;

  for (let axis = 0; axis < 3; axis++) {
    const o = origin[axis];
    const d = dir[axis];
    const mn = boxMin[axis];
    const mx = boxMax[axis];
    if (Math.abs(d) < 1e-12) {
      if (o < mn || o > mx) return null;
      continue;
    }
    let t1 = (mn - o) / d;
    let t2 = (mx - o) / d;
    let s = -1; // entered via the min boundary by default
    if (t1 > t2) {
      [t1, t2] = [t2, t1];
      s = 1; // entered via the max boundary instead
    }
    if (t1 > tMin) {
      tMin = t1;
      faceAxis = axis;
      faceSign = s;
    }
    if (t2 < tMax) tMax = t2;
    if (tMin > tMax) return null;
  }
  if (tMin < 0) return null;
  return { t: tMin, faceAxis, faceSign };
}

const FACE_BY_AXIS = [
  ['west', 'east'],
  ['north', 'south'],
  ['bottom', 'top'],
];

function faceFromAxis(axis, faceSign) {
  return FACE_BY_AXIS[axis][faceSign < 0 ? 0 : 1];
}

function testCell(store, c, r, z, origin, dir, includeTranslucent) {
  const block = store.get(c, r, z);
  if (!block) return null;
  const parsed = parseBlock(block);
  const def = BLOCKS[parsed.type];
  if (!def) return null;
  if (def.translucent && !includeTranslucent) return null;

  const height = parsed.slab ? 0.5 : 1;
  const boxMin = [c, r, z];
  const boxMax = [c + 1, r + 1, z + height];
  const result = rayAABB(origin, dir, boxMin, boxMax);
  if (!result) return null;

  const face = faceFromAxis(result.faceAxis, result.faceSign);
  return {
    c,
    r,
    z,
    face,
    t: result.t,
    block,
    point: [
      origin[0] + dir[0] * result.t,
      origin[1] + dir[1] * result.t,
      origin[2] + dir[2] * result.t,
    ],
  };
}

/**
 * Cast a ray through the voxel store. Returns the first hit as
 * { c, r, z, face, t, point, block } or null if nothing is hit within maxDist.
 * opts.includeTranslucent: also hit water/glass (default false — they're see-through).
 */
export function raycastVoxels(store, origin, direction, opts = {}) {
  const maxDist = opts.maxDist ?? 128;
  const includeTranslucent = !!opts.includeTranslucent;

  const len = Math.hypot(direction[0], direction[1], direction[2]);
  if (len < 1e-12) return null;
  const dir = [direction[0] / len, direction[1] / len, direction[2] / len];

  let x = Math.floor(origin[0]);
  let y = Math.floor(origin[1]);
  let z = Math.floor(origin[2]);

  const stepX = sign(dir[0]);
  const stepY = sign(dir[1]);
  const stepZ = sign(dir[2]);

  const tMaxAxis = (o, d, cell, step) => {
    if (d === 0) return Infinity;
    const boundary = step > 0 ? cell + 1 : cell;
    return (boundary - o) / d;
  };
  const tDeltaAxis = (d) => (d === 0 ? Infinity : Math.abs(1 / d));

  let tMaxX = tMaxAxis(origin[0], dir[0], x, stepX);
  let tMaxY = tMaxAxis(origin[1], dir[1], y, stepY);
  let tMaxZ = tMaxAxis(origin[2], dir[2], z, stepZ);
  const tDeltaX = tDeltaAxis(dir[0]);
  const tDeltaY = tDeltaAxis(dir[1]);
  const tDeltaZ = tDeltaAxis(dir[2]);

  let t = 0;
  let guard = 0;
  while (t <= maxDist && guard++ < 100000) {
    const hit = testCell(store, x, y, z, origin, dir, includeTranslucent);
    if (hit) return hit;

    if (tMaxX < tMaxY && tMaxX < tMaxZ) {
      x += stepX;
      t = tMaxX;
      tMaxX += tDeltaX;
    } else if (tMaxY < tMaxZ) {
      y += stepY;
      t = tMaxY;
      tMaxY += tDeltaY;
    } else {
      z += stepZ;
      t = tMaxZ;
      tMaxZ += tDeltaZ;
    }
  }
  return null;
}

const FACE_NORMAL = {
  top: [0, 0, 1],
  bottom: [0, 0, -1],
  north: [0, -1, 0],
  south: [0, 1, 0],
  east: [1, 0, 0],
  west: [-1, 0, 0],
};

/** The empty cell adjacent to a hit's face — where the editor's "place" op should land. */
export function adjacentCell(hit) {
  const n = FACE_NORMAL[hit.face];
  return { c: hit.c + n[0], r: hit.r + n[1], z: hit.z + n[2] };
}
